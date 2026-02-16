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
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800',
            '--disable-blink-features=AutomationControlled' // Bypass automation detection
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        // Set User-Agent to avoid simple bot detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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
                // Increase timeout to 60s for slow connections
                await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic', { waitUntil: 'load', timeout: 60000 });

                // Debug: Check if navigation succeeded
                const title = await page.title();
                log(`   → Page Title: "${title}"`);

                // 2. Fill Search Form
                try {
                    const dateRadio = await page.waitForSelector('#level_23', { timeout: 10000 });
                    if (dateRadio) {
                        await dateRadio.click();
                        log(`   → Selected "Date Range" search mode.`);
                    }
                } catch (e) {
                    log(`   ⚠️ Date range radio (#level_23) not found. Page might be different.`);
                    // Log partial content for debugging
                    const content = await page.content();
                    log(`   📝 Page Content Preview: ${content.substring(0, 200)}...`);
                }

                if (subKeyword) {
                    try {
                        log(`   → Waiting for input field...`);
                        await page.waitForSelector('#tenderName', { visible: true, timeout: 15000 });

                        await page.evaluate(() => {
                            const input = document.getElementById('tenderName');
                            if (input) input.value = '';
                        });
                        await page.type('#tenderName', subKeyword);
                        log(`   → Typed keyword: "${subKeyword}"`);
                    } catch (e) {
                        log(`   ⚠️ Failed to find or type in #tenderName: ${e.message}`);
                        continue; // Skip rest of loop if input fails
                    }
                }

                if (startDate) {
                    try {
                        await page.evaluate((date) => {
                            const el = document.getElementById('tenderStartDate');
                            if (el) el.value = date;
                        }, startDate);
                        log(`   → Set Start Date: ${startDate}`);
                    } catch (e) { log(`   ⚠️ Failed to set Start Date: ${e.message}`); }
                }
                if (endDate) {
                    try {
                        await page.evaluate((date) => {
                            const el = document.getElementById('tenderEndDate');
                            if (el) el.value = date;
                        }, endDate);
                        log(`   → Set End Date: ${endDate}`);
                    } catch (e) { log(`   ⚠️ Failed to set End Date: ${e.message}`); }
                }

                // 3. Submit Search
                try {
                    const searchBtn = await page.evaluateHandle(() => {
                        const elements = document.querySelectorAll('div.bt_cen2, button, input[type="button"]');
                        for (let el of elements) {
                            if ((el.innerText || '').includes('查詢') || (el.value || '').includes('查詢')) return el;
                        }
                        return null;
                    });

                    if (searchBtn) {
                        log(`   → Clicked "Query" button. Waiting for results...`);
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
                            searchBtn.click(),
                        ]);
                    } else {
                        log(`   ❌ Error: Search button not found.`);
                        continue;
                    }
                } catch (navError) {
                    log(`   ⚠️ Navigation warning: ${navError.message}. Checking if results loaded anyway...`);
                    // Sometimes networkidle2 times out but page is loaded. Continue to check results.
                }

                // 4. Process Results & Pagination
                let hasNextPage = true;
                let pageCount = 1;

                while (hasNextPage) {
                    log(`   📄 Processing Page ${pageCount}...`);

                    const tableExists = await page.$('table.tb_03c');
                    if (!tableExists) {
                        log(`   ℹ️ No results table found.`);
                        hasNextPage = false;
                        break;
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

                    log(`      Found ${tenderLinks.length} items on this page. Extraction...`);

                    // Visit each link (using a separate page to avoid destroying main page context)
                    for (const [linkIndex, link] of tenderLinks.entries()) {
                        // log(`      processing item ${linkIndex + 1}/${tenderLinks.length}...`); // Reduce noise
                        const newPage = await browser.newPage();
                        await newPage.setRequestInterception(true);
                        newPage.on('request', (req) => {
                            // Block images/css/fonts to speed up detail page loading
                            const rType = req.resourceType();
                            if (['image', 'stylesheet', 'font', 'media'].includes(rType)) req.abort();
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
                            log(`      ⚠️ Error scraping detail: ${e.message}`);
                        } finally {
                            await newPage.close();
                        }
                        // Small delay to be nice
                        await new Promise(r => setTimeout(r, 50));
                    }

                    // Check for Next Page
                    const nextPageBtn = await page.evaluateHandle(() => {
                        // Look for "Next Page" or "下一頁" link/button
                        const links = Array.from(document.querySelectorAll('a, span.page'));
                        return links.find(el => el.innerText.includes('下一頁') || el.innerText.includes('Next'));
                    });

                    // Evaluate if the button is clickable/exists
                    const canClickNext = await page.evaluate(el => el && !el.className.includes('disabled') && el.href, nextPageBtn);

                    if (canClickNext) {
                        try {
                            log(`   → Navigating to next page...`);
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
                                nextPageBtn.click()
                            ]);
                            pageCount++;
                        } catch (e) {
                            log(`   ⚠️ Failed to go to next page: ${e.message}`);
                            hasNextPage = false;
                        }
                    } else {
                        hasNextPage = false;
                    }
                }

                log(`   ✅ Finished processing keyword "${subKeyword}".`);

            } catch (err) {
                log(`   ❌ Error during search for "${subKeyword}": ${err.message}`);
                console.error(err);
                // Recover browser context if needed (try to go back to search page for next keyword)
                try { await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'); } catch (e) { }
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
