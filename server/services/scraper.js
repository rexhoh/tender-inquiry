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
        const seenKeys = new Set();

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

                const searchUrl = `https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic?pageSize=100&firstSearch=true&searchType=basic&isBinding=N&isLogIn=N&level_1=on&orgName=&orgId=&tenderName=${encodedKeyword}&tenderId=&tenderType=TENDER_DECLARATION&tenderWay=TENDER_WAY_ALL_DECLARATION&dateType=isDate&tenderStartDate=${encodedStart}&tenderEndDate=${encodedEnd}&radProctrgCate=&policyAdvocacy=`;

                log(`   → Navigating directly to search results: ${searchUrl}`);

                // Set Referer to fool potential checks
                await page.setExtraHTTPHeaders({
                    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'
                });

                try {
                    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                    // Wait for result rows to appear
                    try {
                        await page.waitForSelector('tr.tb_b2, tr.tb_b3', { timeout: 15000 });
                    } catch (e) {
                        log(`   ⚠️ No tr.tb_b2 rows found within timeout. Checking page...`);
                    }

                    // Detect total result count from page
                    const totalInfo = await page.evaluate(() => {
                        const bodyText = document.body.innerText;
                        // Look for pattern like "共113筆" or "共 113 筆"
                        const match = bodyText.match(/共\s*(\d+)\s*筆/);
                        return {
                            total: match ? parseInt(match[1]) : -1,
                            preview: bodyText.substring(0, 300).replace(/\n/g, ' ')
                        };
                    });

                    log(`   🔍 Page Loaded. Total results on site: ${totalInfo.total}`);
                    log(`   📝 Body Preview: "${totalInfo.preview}..."`);

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
                        // Strategy: Find all result rows directly by their CSS class (tb_b2) 
                        // or by containing urlSelector links, regardless of which table they're in

                        // First try: rows with class tb_b2 OR tb_b3 (alternating row classes)
                        let dataRows = Array.from(document.querySelectorAll('tr.tb_b2, tr.tb_b3'));

                        // Fallback: if no tb_b2 rows, find rows containing urlSelector links
                        if (dataRows.length === 0) {
                            const allLinks = Array.from(document.querySelectorAll('a[href*="urlSelector"]'));
                            const rowSet = new Set();
                            allLinks.forEach(a => {
                                const tr = a.closest('tr');
                                if (tr) rowSet.add(tr);
                            });
                            dataRows = Array.from(rowSet);
                        }

                        // Second fallback: rows containing pk= links
                        if (dataRows.length === 0) {
                            const allLinks = Array.from(document.querySelectorAll('a[href*="pk="]'));
                            const rowSet = new Set();
                            allLinks.forEach(a => {
                                const tr = a.closest('tr');
                                if (tr) rowSet.add(tr);
                            });
                            dataRows = Array.from(rowSet);
                        }

                        const items = [];
                        let firstRowDebug = '';

                        dataRows.forEach((row, rowIdx) => {
                            const cols = row.querySelectorAll('td');
                            const allAnchors = Array.from(row.querySelectorAll('a[href]'));

                            // Find the detail link
                            let linkEl = null;
                            for (const a of allAnchors) {
                                const href = a.getAttribute('href') || '';
                                if (href.includes('urlSelector') || href.includes('tenderDetail') || href.includes('pk=')) {
                                    linkEl = a;
                                    break;
                                }
                            }

                            if (rowIdx === 0) {
                                const colTexts0 = Array.from(cols).map(c => c.innerText.trim().substring(0, 50));
                                firstRowDebug = `cols=${cols.length}, colTexts=${JSON.stringify(colTexts0)}, linkFound=${!!linkEl}`;
                            }

                            if (linkEl) {
                                const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                // Actual column mapping (observed):
                                // [0]=Seq, [1]=Agency, [2]=TenderID\nTenderName, [3]=Category
                                // [4]=Method, [5]=Type, [6]=PublishDate, [7]=Deadline, [8]=Budget, [9]=Action
                                const agencyName = colTexts[1] || '';

                                // cols[2] has "TenderID\nTenderName" combined
                                const tenderCell = colTexts[2] || '';
                                const tenderParts = tenderCell.split('\n');
                                const tenderId = (tenderParts[0] || '').trim();
                                const tenderName = (tenderParts.slice(1).join(' ') || '').trim();

                                const method = colTexts[4] || ''; // 招標方式
                                const publishDate = colTexts[6] || ''; // 公告日期
                                const deadline = colTexts[7] || ''; // 截止日期
                                const budget = colTexts[8] || ''; // 預算金額

                                items.push({
                                    link: linkEl.href,
                                    agencyName,
                                    tenderId,
                                    tenderName,
                                    method,
                                    publishDate,
                                    deadline,
                                    budget
                                });
                            }
                        });

                        return {
                            items,
                            debugInfo: `DataRows: ${dataRows.length}, Extracted: ${items.length}. FirstRow: ${firstRowDebug}`
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
                            method: item.method || '',
                            publishDate: item.publishDate || '',
                            deadline: item.deadline || '',
                            budget: item.budget || '',
                            centralGov: '',
                            location: '',
                            contact: '',
                            detailLink: directUrl
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

                            const uniqueKey = detail.detailLink || `${detail.tenderId}_${detail.agencyName}`;
                            if (uniqueKey && !seenKeys.has(uniqueKey)) {
                                seenKeys.add(uniqueKey);
                                allResults.push(detail);
                            }

                        } catch (err) {
                            log(`      ❌ Error fetching detail ${directUrl}: ${err.message}. Using basic info.`);
                            // Still save basic info even if fetch failed
                            const uniqueKey = detail.detailLink || `${detail.tenderId}_${detail.agencyName}`;
                            if (uniqueKey && !seenKeys.has(uniqueKey)) {
                                seenKeys.add(uniqueKey);
                                allResults.push(detail);
                            }
                        }

                        // Delay to be polite
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    // Check for Next Page
                    const nextPageInfo = await page.evaluate(() => {
                        // Look for "下一頁" link specifically
                        const allLinks = Array.from(document.querySelectorAll('a'));
                        const nextLink = allLinks.find(el => {
                            const text = el.innerText.trim();
                            return text === '下一頁' || text.includes('下一頁');
                        });
                        if (nextLink && nextLink.href && !nextLink.className.includes('disabled')) {
                            return { found: true, href: nextLink.href };
                        }
                        return { found: false, href: null };
                    });

                    if (nextPageInfo.found && nextPageInfo.href) {
                        try {
                            log(`   → Navigating to next page (${nextPageInfo.href.substring(0, 80)}...)`);
                            await page.goto(nextPageInfo.href, { waitUntil: 'networkidle2', timeout: 60000 });
                            // Wait for result rows
                            try {
                                await page.waitForSelector('tr.tb_b2, tr.tb_b3', { timeout: 15000 });
                            } catch (e) {
                                log(`   ⚠️ No rows on next page within timeout.`);
                            }
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
                        log(`   ℹ️ No more pages (next button not found or disabled).`);
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
                { id: 'method', title: '招標方式' },
                { id: 'publishDate', title: '公告日期' },
                { id: 'deadline', title: '截止日期' },
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
