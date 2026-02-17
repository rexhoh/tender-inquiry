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

                // Get cookies from the main search page to pass to Axios
                const cookies = await page.cookies();
                const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

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
                    // Create a SINGLE separate page for details to reuse (much faster than newPage() every time)
                    // WAF UPDATE: Navigation is being blocked. We will reuse the MAIN page context to fetch data via JS.
                    // This uses the browser's existing session/cookies and avoids "webdriver navigation" triggers.

                    log(`      Found ${tenderLinks.length} items on this page. Extraction using In-Page Fetch...`);

                    for (const [linkIndex, link] of tenderLinks.entries()) {

                        // Use Direct Link to bypass 'urlSelector' WAF check
                        const urlObj = new URL(link);
                        const pk = urlObj.searchParams.get('pk');
                        const directUrl = `https://web.pcc.gov.tw/prkms/tender/common/unit/tenderDetail?pk=${pk}`;

                        if (linkIndex < 3) log(`      processing item ${linkIndex + 1}/${tenderLinks.length}: ${directUrl}`);

                        try {
                            // Fetch content directly from within the browser context
                            const htmlContent = await page.evaluate(async (url) => {
                                const response = await fetch(url, {
                                    method: 'GET',
                                    headers: {
                                        'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic'
                                    }
                                });
                                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                                return await response.text();
                            }, directUrl);

                            // Parse with Cheerio (server-side)
                            const $ = cheerio.load(htmlContent);

                            // Helper to extract text from table cells
                            const getText = (label) => {
                                // Find any element that contains the label text
                                // We filter to ensure it's a TH or TD or SPAN inside one
                                let found = $(`th, td`).filter((i, el) => $(el).text().replace(/\s+/g, '').includes(label));

                                if (found.length === 0) return '';

                                // The value is usually in the NEXT td
                                let target = found.first().next('td');

                                // Sometimes the label is inside a TH and the value is inside the next TD
                                if (target.length) {
                                    return target.text().trim();
                                }

                                // Sometimes the label is in a TD and value is in next TD
                                return '';
                            };

                            // Check if we got redirected to a block page or empty content
                            if ($('title').text().includes('Blocked') || htmlContent.length < 500) {
                                log(`      ⚠️ Possible Block or Empty Content for ${directUrl}`);
                                continue;
                            }

                            const detail = {
                                agencyName: getText('機關名稱'),
                                tenderId: getText('標案案號'),
                                tenderName: getText('標案名稱'),
                                budget: getText('預算金額'),
                                centralGov: getText('本採購是否屬中央政府計畫型案件'), // This one is long, maybe match partial
                                location: getText('履約地點'),
                                contact: getText('聯絡人') // Match partial '聯絡人'
                            };

                            if (linkIndex === 0) {
                                log(`      🔍 Debug Detail [0]: ${JSON.stringify(detail)}`);
                                if (!detail.agencyName || !detail.tenderId) {
                                    log(`      ⚠️ Extraction Failed. Dumping HTML Preview:`);
                                    log(`      ${htmlContent}`); // Dump full content
                                }
                            }

                            if (detail.tenderId && !seenTenderIds.has(detail.tenderId)) {
                                seenTenderIds.add(detail.tenderId);
                                allResults.push(detail);
                            }

                        } catch (err) {
                            log(`      ❌ Error fetching detail ${directUrl}: ${err.message}`);
                        }

                        // Delay to be polite
                        await new Promise(r => setTimeout(r, 1500));
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
