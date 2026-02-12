const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

const RESULTS_DIR = path.join(__dirname, '../data/results');

async function searchTenders(keyword, startDate, endDate, onProgress = () => { }) {
    const log = (message) => {
        console.log(message);
        onProgress(message);
    };

    log(`🚀 Starting search for: ${keyword}`);
    log(`Bypassing headless mode check (Verification Mode)`);

    const browser = await puppeteer.launch({
        headless: true, // Keep headless for production, change to false for local debug if needed
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Normalize keywords: Split by ' OR ' (case-insensitive)
        const keywords = keyword.split(/\s+OR\s+/i).map(k => k.trim()).filter(k => k);
        let allResults = [];
        const seenTenderIds = new Set();

        log(`📋 Parsed keywords: ${JSON.stringify(keywords)}`);

        for (const [index, subKeyword] of keywords.entries()) {
            log(`🔍 [${index + 1}/${keywords.length}] Searching for: "${subKeyword}"...`);

            try {
                // 1. Navigate
                log(`   → Navigating to Government Tender System...`);
                await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic', { waitUntil: 'networkidle2' });

                // 2. Fill Search Form
                const dateRadio = await page.$('#level_23');
                if (dateRadio) {
                    await dateRadio.click();
                    log(`   → Selected "Date Range" search mode.`);
                }

                if (subKeyword) {
                    try {
                        log(`   → Waiting for input field...`);
                        await page.waitForSelector('#tenderName', { visible: true, timeout: 10000 });

                        await page.evaluate(() => {
                            const input = document.getElementById('tenderName');
                            if (input) input.value = '';
                        });
                        await page.type('#tenderName', subKeyword);
                        log(`   → Typed keyword: "${subKeyword}"`);
                    } catch (e) {
                        log(`   ⚠️ Failed to find or type in #tenderName: ${e.message}`);
                        // Take a debug screenshot if possible in verification mode
                        // await page.screenshot({ path: 'debug_error_input.png' });
                    }
                }

                if (startDate) {
                    await page.evaluate((date) => { document.getElementById('tenderStartDate').value = date; }, startDate);
                    log(`   → Set Start Date: ${startDate}`);
                }
                if (endDate) {
                    await page.evaluate((date) => { document.getElementById('tenderEndDate').value = date; }, endDate);
                    log(`   → Set End Date: ${endDate}`);
                }

                // Debug: Screenshot before search
                // const debugDir = path.join(__dirname, '../../public/debug');
                // if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
                // await page.screenshot({ path: path.join(debugDir, `before_search_${index}.png`) });

                // 3. Submit Search
                const searchBtn = await page.evaluateHandle(() => {
                    const elements = document.querySelectorAll('div.bt_cen2, button, input[type="button"]');
                    for (let el of elements) {
                        if ((el.innerText || '').includes('查詢') || (el.value || '').includes('查詢')) return el;
                    }
                    return null;
                });

                if (searchBtn) {
                    await searchBtn.click();
                    log(`   → Clicked "Query" button. Waiting for results...`);
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => log('   ⚠️ Navigation timeout (might be AJAX update)'));
                } else {
                    log(`   ❌ Error: Search button not found.`);
                    continue;
                }

                // 4. Process Results
                const tableExists = await page.$('table.tb_03c');
                if (!tableExists) {
                    log(`   ℹ️ No results found for "${subKeyword}".`);
                    continue;
                }

                // Get links
                const tenderLinks = await page.evaluate(() => {
                    const rows = document.querySelectorAll('table.tb_03c tbody tr');
                    const links = [];
                    rows.forEach(row => {
                        const link = row.querySelector('a[title="檢視標案詳細內容"]');
                        if (link) links.push(link.href);
                    });
                    return links;
                });

                log(`   ✅ Found ${tenderLinks.length} items. Starting extraction...`);

                // Visit each link
                for (const [linkIndex, link] of tenderLinks.entries()) {
                    log(`      processing item ${linkIndex + 1}/${tenderLinks.length}...`);

                    const newPage = await browser.newPage();
                    await newPage.setRequestInterception(true);
                    newPage.on('request', (req) => {
                        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
                        else req.continue();
                    });

                    try {
                        await newPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });

                        const detail = await newPage.evaluate(() => {
                            const getText = (label) => {
                                const ths = Array.from(document.querySelectorAll('th'));
                                const targetTh = ths.find(th => th.innerText.includes(label));
                                return (targetTh && targetTh.nextElementSibling) ? targetTh.nextElementSibling.innerText.trim() : '';
                            };
                            return {
                                agencyName: getText('機關名稱'),
                                tenderId: getText('標案案號'),
                                tenderName: getText('標案名稱'),
                                budget: getText('預算金額'),
                                centralGov: getText('本採購是否屬中央政府計畫型案件'),
                                location: getText('履約地點'),
                                contact: getText('聯絡人')
                            };
                        });

                        if (detail.tenderId && !seenTenderIds.has(detail.tenderId)) {
                            seenTenderIds.add(detail.tenderId);
                            allResults.push(detail);
                        }
                    } catch (e) {
                        log(`      ⚠️ Error scraping details: ${e.message}`);
                    } finally {
                        await newPage.close();
                    }
                    await new Promise(r => setTimeout(r, 100));
                }

            } catch (err) {
                log(`   ❌ Error during search for "${subKeyword}": ${err.message}`);
                console.error(err);
            }
        }

        log(`🎉 Search complete! Total unique results: ${allResults.length}`);


        // 5. Save to CSV (only if results exist, or empty file)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tenders-combined-${timestamp}.csv`;
        const csvPath = path.join(RESULTS_DIR, filename);

        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: [
                { id: 'agencyName', title: '機關名稱' },
                { id: 'tenderId', title: '標案案號' },
                { id: 'tenderName', title: '標案名稱' },
                { id: 'budget', title: '預算金額' },
                { id: 'centralGov', title: '中央政府計畫' },
                { id: 'location', title: '履約地點' },
                { id: 'contact', title: '機關窗口' }
            ],
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(allResults);
        console.log(`Saved results to ${csvPath}`);

        return allResults;

    } catch (error) {
        console.error('Puppeteer fatal error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { searchTenders };
