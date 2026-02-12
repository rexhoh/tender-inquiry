const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

const RESULTS_DIR = path.join(__dirname, '../data/results');

async function searchTenders(keyword, startDate, endDate) {
    console.log(`Starting search for: ${keyword}`);
    const browser = await puppeteer.launch({
        headless: true, // Revert to headless for production/performance
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Normalize keywords: Split by ' OR ' (case-insensitive)
        const keywords = keyword.split(/\s+OR\s+/i).map(k => k.trim()).filter(k => k);
        let allResults = [];
        const seenTenderIds = new Set();

        console.log(`Parsed keywords (OR logic):`, keywords);

        for (const subKeyword of keywords) {
            console.log(`Executing search for sub-keyword: ${subKeyword}`);

            try {
                // 1. Navigate to the page (Refresh for each search to clear state)
                await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic', { waitUntil: 'networkidle2' });

                // 2. Fill Search Form
                const dateRadio = await page.$('#level_23');
                if (dateRadio) await dateRadio.click();

                if (subKeyword) {
                    // Clear input first
                    await page.evaluate(() => document.getElementById('tenderName').value = '');
                    await page.type('#tenderName', subKeyword);
                }

                if (startDate) {
                    await page.evaluate((date) => { document.getElementById('tenderStartDate').value = date; }, startDate);
                }
                if (endDate) {
                    await page.evaluate((date) => { document.getElementById('tenderEndDate').value = date; }, endDate);
                }

                // 3. Submit Search
                const searchBtn = await page.evaluateHandle(() => {
                    const elements = document.querySelectorAll('div.bt_cen2, button, input[type="button"]');
                    for (let el of elements) {
                        const text = el.innerText || '';
                        const value = el.value || '';
                        if (text.includes('查詢') || value.includes('查詢')) {
                            return el;
                        }
                    }
                    return null;
                });

                if (searchBtn) {
                    await searchBtn.click();
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log('Navigation timeout'));
                } else {
                    console.error('Search button not found');
                    continue; // Skip this keyword
                }

                // 4. Process Results
                // Check if table exists (it might not if no results)
                const tableExists = await page.$('table.tb_03c');
                if (!tableExists) {
                    console.log(`No results for ${subKeyword}`);
                    continue;
                }

                // Get links to details
                const tenderLinks = await page.evaluate(() => {
                    const rows = document.querySelectorAll('table.tb_03c tbody tr');
                    const links = [];
                    rows.forEach(row => {
                        const link = row.querySelector('a[title="檢視標案詳細內容"]');
                        if (link) links.push(link.href);
                    });
                    return links;
                });

                console.log(`Found ${tenderLinks.length} results for ${subKeyword}`);

                // Visit each link to scrape details
                for (const link of tenderLinks) {
                    // Check duplicate link processing could be added here if link contains ID
                    // But we will dedupe by ID after scraping

                    const newPage = await browser.newPage();
                    // Disable images/css for speed
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
                                if (targetTh && targetTh.nextElementSibling) {
                                    return targetTh.nextElementSibling.innerText.trim();
                                }
                                return '';
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
                        console.error(`Error scraping detail ${link}:`, e.message);
                    } finally {
                        await newPage.close();
                    }
                    // small delay
                    await new Promise(r => setTimeout(r, 200));
                }

            } catch (err) {
                console.error(`Error processing keyword ${subKeyword}:`, err);
            }
        }

        console.log(`Total unique results: ${allResults.length}`);

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
