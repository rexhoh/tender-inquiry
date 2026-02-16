const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const axios = require('axios');
const cheerio = require('cheerio');

const RESULTS_DIR = path.join(__dirname, '../data/results');

async function searchTenders(keyword, startDate, endDate, onProgress = () => { }) {
    const log = (message) => {
        console.log(message);
        onProgress(message);
    };

    log(`🚀 Starting search for: ${keyword}`);
    log(`Bypassing headless mode check (Verification Mode)`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
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

        // Helper to convert Gregorian Date (YYYY/MM/DD) to ROC Date (YYY/MM/DD)
        const toROCDate = (dateStr) => {
            if (!dateStr) return '';
            const parts = dateStr.split(/[-/]/);
            if (parts.length === 3) {
                const year = parseInt(parts[0]);
                // If year is already 3 digits (e.g. 115), assume it's ROC
                if (year < 1000) return parts.join('/');
                // Convert 2026 -> 115
                const rocYear = year - 1911;
                return `${rocYear}/${parts[1]}/${parts[2]}`;
            }
            return dateStr;
        };

        for (const [index, subKeyword] of keywords.entries()) {
            log(`🔍 [${index + 1}/${keywords.length}] Searching for: "${subKeyword}"...`);

            try {
                // 1. Construct Search URL (Bypass UI interaction)
                // Based on user's working URL, the server accepts Gregorian dates in the URL parameters.
                // URL: ...tenderStartDate=2026%2F01%2F15...

                // Encode parameters
                const encodedKeyword = encodeURIComponent(subKeyword);
                const encodedStart = encodeURIComponent(startDate); // Use original '2026/01/15'
                const encodedEnd = encodeURIComponent(endDate);

                const searchUrl = `https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic?pageSize=&firstSearch=true&searchType=basic&isBinding=N&isLogIn=N&level_1=on&orgName=&orgId=&tenderName=${encodedKeyword}&tenderId=&tenderType=TENDER_DECLARATION&tenderWay=TENDER_WAY_ALL_DECLARATION&dateType=isDate&tenderStartDate=${encodedStart}&tenderEndDate=${encodedEnd}&radProctrgCate=&policyAdvocacy=`;

                log(`   → Navigating directly to search results: ${searchUrl}`);

                // Set Referer to fool potential checks
                await page.setExtraHTTPHeaders({
                    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'
                });

                try {
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Wait for a clear signal of page load (results OR "no data" OR error)
                    // We interpret "body" presence as "loaded enough to inspect"
                    await page.waitForSelector('body', { timeout: 30000 });

                    // Diagnostic Log: Check what we actually got
                    const pageTitle = await page.title();
                    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300).replace(/\n/g, ' '));
                    log(`   🔍 Page Loaded. Title: "${pageTitle}"`);
                    log(`   📝 Body Preview: "${bodyText}..."`);

                } catch (navError) {
                    log(`   ❌ Navigation/Wait Error: ${navError.message}`);
                    const content = await page.content();
                    log(`   📄 HTML Dump (Error): ${content.substring(0, 500)}...`);
                }

                // 2. Process Results & Pagination
                let hasNextPage = true;
                let pageCount = 1;

                while (hasNextPage) {
                    log(`   📄 Processing Page ${pageCount}...`);

                    // Get links (with debug and smart table selection)
                    const { links: tenderLinks, firstRowHtml } = await page.evaluate(() => {
                        // Find the results table by checking headers
                        const tables = Array.from(document.querySelectorAll('table'));
                        const resultsTable = tables.find(t => {
                            const tx = t.innerText;
                            return tx.includes('機關名稱') && tx.includes('標案名稱') && tx.includes('功能選項');
                        });

                        if (!resultsTable) {
                            return { links: [], firstRowHtml: document.body.innerHTML.substring(0, 1000) }; // Dump body if table missing
                        }

                        const rows = Array.from(resultsTable.querySelectorAll('tbody tr'));
                        const links = [];
                        let firstValidRowHtml = '';

                        rows.forEach(row => {
                            // SKIP rows that are part of the search form (look like inputs)
                            if (row.querySelector('input') || row.querySelector('select')) return;

                            // Try multiple selectors for the "View" button
                            let link = row.querySelector('a[title="檢視標案詳細內容"]');
                            if (!link) link = row.querySelector('a[href*="tender/common/unit/tenderDetail"]'); // URL pattern

                            if (!link) {
                                // Fallback: Check for any link with "檢視" text specific to this row
                                const allLinks = Array.from(row.querySelectorAll('a'));
                                link = allLinks.find(a => a.innerText.includes('檢視') || a.innerText.includes('View'));
                            }

                            if (link) {
                                links.push(link.href);
                                if (!firstValidRowHtml) firstValidRowHtml = row.outerHTML;
                            }
                        });

                        return {
                            links,
                            firstRowHtml: firstValidRowHtml || (rows.length > 0 ? rows[0].outerHTML : 'No rows with valid links found')
                        };
                    });

                    if (pageCount === 1) {
                        log(`   🔍 Debug: First row HTML: ${firstRowHtml.substring(0, 500)}...`);
                    }

                    log(`      Found ${tenderLinks.length} items on this page. Extraction...`);

                    // Visit each link using Axios + Cheerio (Faster & More Stable)
                    for (const [linkIndex, link] of tenderLinks.entries()) {

                        // Construct Direct Detail URL to bypass the "urlSelector" redirection page
                        // Original: https://web.pcc.gov.tw/prkms/urlSelector/common/tpam?pk=NzExNTE1Mjk=
                        // Target:   https://web.pcc.gov.tw/tps/QueryTender/query/searchTenderDetail?pkPmsMain=NzExNTE1Mjk=
                        let directLink = link;
                        try {
                            const urlObj = new URL(link);
                            const pk = urlObj.searchParams.get('pk');
                            if (pk) {
                                directLink = `https://web.pcc.gov.tw/tps/QueryTender/query/searchTenderDetail?pkPmsMain=${pk}`;
                            }
                        } catch (e) {
                            log(`      ⚠️ Error parsing link PK: ${e.message}, using original link.`);
                        }

                        if (linkIndex < 3) log(`      processing item ${linkIndex + 1}/${tenderLinks.length}: ${directLink} (Original: ${link})`);

                        try {
                            // Add a small random delay to be polite
                            await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

                            // Fetch HTML with Axios
                            const response = await axios.get(directLink, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'
                                },
                                timeout: 30000
                            });

                            // Parse with Cheerio
                            const $ = cheerio.load(response.data);
                            const detail = {};

                            // Helper to determine language (Chinese vs English)
                            const bodyText = $('body').text();
                            const isEng = bodyText.includes('Entity Name') || bodyText.includes('Tender Name');

                            // Helper to extract value by finding a th/td with label and getting next element
                            const findValue = (labelCN, labelEN) => {
                                let val = '';
                                // We iterate all cells to find the label
                                $('th, td').each((i, el) => {
                                    const text = $(el).text().trim();
                                    // Robust check: exact match or includes
                                    if (text === labelCN || (labelEN && text === labelEN) || text.includes(labelCN)) {
                                        // Try immediately next sibling
                                        let next = $(el).next();
                                        if (next.length) {
                                            val = next.text().trim();
                                            return false; // break loop
                                        }
                                    }
                                });
                                return val;
                            };

                            detail.agencyName = findValue('機關名稱', 'Entity Name') || findValue('機關名稱', 'Procuring Entity');
                            detail.tenderId = findValue('標案案號', 'Tender No.');
                            detail.tenderName = findValue('標案名稱', 'Tender Name');
                            detail.budget = findValue('預算金額', 'Budget Amount');
                            detail.location = findValue('履約地點', 'Location of Performance');
                            // Type often needs specific label check
                            detail.type = findValue('招標方式', 'Tender Method');

                            // Central Govt Check
                            const isCentral = (detail.agencyName || '').includes('部') || (detail.agencyName || '').includes('署');
                            detail.centralGov = isCentral ? 'Yes' : 'No';

                            // Contact Info
                            let contactName = findValue('聯絡人', 'Contact Person');
                            let contactPhone = findValue('聯絡電話', 'Telephone No.');
                            detail.contact = `${contactName} ${contactPhone}`.trim();

                            if (linkIndex === 0) {
                                log(`      🔍 Debug Detail [0] (Cheerio): ${JSON.stringify(detail)}`);
                            }

                            if (detail.tenderId && !seenTenderIds.has(detail.tenderId)) {
                                seenTenderIds.add(detail.tenderId);
                                allResults.push(detail);
                            }

                        } catch (err) {
                            log(`      ❌ Error scraping detail ${directLink}: ${err.message}`);
                        }
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
                            if (pageCount > 20) {
                                log(`   ⚠️ Limit reached (20 pages). Stopping pagination.`);
                                hasNextPage = false;
                            }
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
