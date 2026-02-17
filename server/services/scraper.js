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

                    // Get items with basic info from the list table
                    const { items: tenderItems, debugInfo } = await page.evaluate(() => {
                        // Find the results table by checking headers
                        const tables = Array.from(document.querySelectorAll('table'));
                        const resultsTable = tables.find(t => {
                            const tx = t.innerText;
                            return tx.includes('機關名稱') && tx.includes('標案名稱');
                        });

                        if (!resultsTable) {
                            return { items: [], debugInfo: `No results table found. Tables count: ${tables.length}. Body: ${document.body.innerText.substring(0, 500)}` };
                        }

                        // Try both tbody tr and direct tr (some tables don't have tbody)
                        let rows = Array.from(resultsTable.querySelectorAll('tbody tr'));
                        if (rows.length === 0) {
                            rows = Array.from(resultsTable.querySelectorAll('tr'));
                        }

                        const items = [];
                        let rawFirstRow = '';
                        let firstDataRow = '';
                        let skipReasons = [];

                        rows.forEach((row, rowIdx) => {
                            // Debug: capture the very first row HTML no matter what
                            if (rowIdx === 0) {
                                rawFirstRow = row.outerHTML.substring(0, 600);
                            }

                            const hasInput = row.querySelector('input');
                            const hasSelect = row.querySelector('select');
                            const cols = row.querySelectorAll('td');

                            // Collect all links in this row for debugging
                            const allAnchors = Array.from(row.querySelectorAll('a[href]'));

                            if (rowIdx < 3 && (hasInput || hasSelect || cols.length < 2)) {
                                skipReasons.push(`row${rowIdx}: input=${!!hasInput}, select=${!!hasSelect}, cols=${cols.length}`);
                            }

                            // SKIP rows that are part of the search form
                            if (hasInput || hasSelect) return;
                            if (cols.length < 2) return;

                            // Broad link selector
                            let linkEl = null;
                            // Try various href patterns
                            for (const a of allAnchors) {
                                const href = a.getAttribute('href') || '';
                                if (href.includes('urlSelector') || href.includes('tenderDetail') || href.includes('pk=')) {
                                    linkEl = a;
                                    break;
                                }
                            }
                            // Also try title-based
                            if (!linkEl) linkEl = row.querySelector('a[title*="檢視"]');

                            if (!firstDataRow) {
                                const anchorsInfo = allAnchors.map(a => a.getAttribute('href')?.substring(0, 80)).join(' | ');
                                firstDataRow = `cols=${cols.length}, links=[${anchorsInfo}], linkFound=${!!linkEl}, html=${row.outerHTML.substring(0, 500)}`;
                            }

                            if (linkEl) {
                                const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                const agencyName = colTexts[1] || '';
                                const tenderId = colTexts[2] || '';
                                const tenderName = colTexts[3] || colTexts[2] || '';

                                items.push({
                                    link: linkEl.href,
                                    agencyName,
                                    tenderId,
                                    tenderName
                                });
                            }
                        });

                        return {
                            items,
                            debugInfo: `Table found. TotalRows: ${rows.length}, Extracted: ${items.length}. Skips: [${skipReasons.join('; ')}]. RawRow0: ${rawFirstRow.substring(0, 300)}. FirstDataRow: ${firstDataRow?.substring(0, 400) || 'none'}`
                        };
                    });

                    log(`      🔍 Table Debug: ${debugInfo}`);
                    log(`      Found ${tenderItems.length} items on this page. Extraction using In-Page Fetch...`);

                    for (const [itemIndex, item] of tenderItems.entries()) {
                        const directUrl = item.link;

                        // Default to basic info from the list page
                        let detail = {
                            agencyName: item.agencyName,
                            tenderId: item.tenderId,
                            tenderName: item.tenderName,
                            date: item.date, // Add date from list page
                            budget: '',
                            centralGov: '',
                            location: '',
                            contact: '',
                            detailLink: directUrl // Add link field
                        };

                        if (itemIndex < 3) log(`      processing item ${itemIndex + 1}/${tenderItems.length}: ${directUrl}`);

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

                            // Check if we got redirected to a block page/captcha
                            // Captcha often has "validate/init" or specific text
                            if (htmlContent.includes('validate/init') || htmlContent.includes('撲克牌') || htmlContent.length < 500) {
                                log(`      ⚠️ Validated/Captcha Page Detected or Empty Content for ${item.tenderId}. Using basic info.`);
                                // Keep the basic info already in 'detail'
                            } else {
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

                                // Enhanced extraction - overwrite basic info if detail is better
                                const fullAgency = getText('機關名稱');
                                const fullTenderId = getText('標案案號');
                                const fullTenderName = getText('標案名稱');
                                const fullDate = getText('招標方式'); // Assuming '招標方式' is near the date or another date field exists

                                if (fullAgency) detail.agencyName = fullAgency;
                                if (fullTenderId) detail.tenderId = fullTenderId;
                                if (fullTenderName) detail.tenderName = fullTenderName;
                                // If a more specific date is found on the detail page, use it
                                // For now, keeping the list page date unless a better field is identified
                                // if (fullDate) detail.date = fullDate;

                                detail.budget = getText('預算金額');
                                detail.centralGov = getText('本採購是否屬中央政府計畫型案件');
                                detail.location = getText('履約地點');
                                detail.contact = getText('聯絡人');
                            }

                            if (itemIndex === 0) {
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
                            log(`      ❌ Error fetching detail ${directUrl}: ${err.message}. Using basic info.`);
                            // Still save basic info even if fetch failed
                            if (detail.tenderId && !seenTenderIds.has(detail.tenderId)) {
                                seenTenderIds.add(detail.tenderId);
                                allResults.push(detail);
                            }
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
                { id: 'contact', title: '機關窗口' },
                { id: 'detailLink', title: '詳細連結' }
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
