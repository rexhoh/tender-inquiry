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
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // ============================
        // Parse compound search syntax
        // ============================
        // OR  → union (split into groups, merge results)
        // AND → intersection (search each term, keep only results appearing in ALL)
        // NOT → exclusion (search main terms, exclude results matching NOT terms)
        //
        // Example: "AI AND 系統 OR 資安 NOT 測試"
        //   Group 1: "AI AND 系統" → search "AI" ∩ search "系統"
        //   Group 2: "資安 NOT 測試" → search "資安" − results matching "測試"

        const orGroups = keyword.split(/\s+OR\s+/i).map(g => g.trim()).filter(g => g);
        let allResults = [];
        const seenKeys = new Set();

        log(`📋 Parsed OR groups: ${JSON.stringify(orGroups)}`);

        // Helper to convert Gregorian Date (YYYY/MM/DD) to ROC Date (YYY/MM/DD)
        const toROCDate = (dateStr) => {
            if (!dateStr) return '';
            const parts = dateStr.split(/[-/]/);
            if (parts.length === 3) {
                const year = parseInt(parts[0]);
                if (year < 1000) return parts.join('/');
                const rocYear = year - 1911;
                return `${rocYear}/${parts[1]}/${parts[2]}`;
            }
            return dateStr;
        };

        // ==========================================
        // Helper: search a single keyword, return []
        // ==========================================
        const searchSingleKeyword = async (searchKeyword, label) => {
            const results = [];
            log(`   🔎 [${label}] Searching for: "${searchKeyword}"...`);

            try {
                const encodedKeyword = encodeURIComponent(searchKeyword);
                const encodedStart = encodeURIComponent(startDate);
                const encodedEnd = encodeURIComponent(endDate);

                const searchUrl = `https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic?pageSize=100&firstSearch=true&searchType=basic&isBinding=N&isLogIn=N&level_1=on&orgName=&orgId=&tenderName=${encodedKeyword}&tenderId=&tenderType=TENDER_DECLARATION&tenderWay=TENDER_WAY_ALL_DECLARATION&dateType=isDate&tenderStartDate=${encodedStart}&tenderEndDate=${encodedEnd}&radProctrgCate=&policyAdvocacy=`;

                await page.setExtraHTTPHeaders({
                    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'
                });

                try {
                    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    try {
                        await page.waitForSelector('tr.tb_b2, tr.tb_b3', { timeout: 15000 });
                    } catch (e) {
                        log(`      ⚠️ No result rows found within timeout.`);
                    }
                } catch (navError) {
                    log(`      ❌ Navigation Error: ${navError.message}`);
                    return results;
                }

                let hasNextPage = true;
                let pageCount = 1;

                while (hasNextPage) {
                    log(`      📄 Page ${pageCount}...`);

                    // Extract items from current page
                    const { items: tenderItems, debugInfo } = await page.evaluate(() => {
                        let dataRows = Array.from(document.querySelectorAll('tr.tb_b2, tr.tb_b3'));

                        if (dataRows.length === 0) {
                            const allLinks = Array.from(document.querySelectorAll('a[href*="urlSelector"]'));
                            const rowSet = new Set();
                            allLinks.forEach(a => { const tr = a.closest('tr'); if (tr) rowSet.add(tr); });
                            dataRows = Array.from(rowSet);
                        }
                        if (dataRows.length === 0) {
                            const allLinks = Array.from(document.querySelectorAll('a[href*="pk="]'));
                            const rowSet = new Set();
                            allLinks.forEach(a => { const tr = a.closest('tr'); if (tr) rowSet.add(tr); });
                            dataRows = Array.from(rowSet);
                        }

                        const items = [];
                        let firstRowDebug = '';

                        dataRows.forEach((row, ri) => {
                            const cols = row.querySelectorAll('td');
                            if (cols.length >= 3) {
                                const linkEl = row.querySelector('a[href*="urlSelector"], a[href*="tenderDetail"], a[href*="pk="]');
                                if (ri === 0) {
                                    const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                    firstRowDebug = `cols=${cols.length}, colTexts=${JSON.stringify(colTexts.slice(0, 4))}, linkFound=${!!linkEl}`;
                                }
                                if (linkEl) {
                                    const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                    // Column mapping (observed):
                                    // [0]=Seq, [1]=Agency, [2]=TenderID\nTenderName, [3]=Category
                                    // [4]=Method, [5]=Type, [6]=PublishDate, [7]=Deadline, [8]=Budget, [9]=Action
                                    const agencyName = colTexts[1] || '';
                                    const tenderCell = colTexts[2] || '';
                                    const tenderParts = tenderCell.split('\n');
                                    const tenderId = (tenderParts[0] || '').trim();
                                    const tenderName = (tenderParts.slice(1).join(' ') || '').trim();
                                    const method = colTexts[4] || '';
                                    const publishDate = colTexts[6] || '';
                                    const deadline = colTexts[7] || '';
                                    const budget = colTexts[8] || '';

                                    items.push({ link: linkEl.href, agencyName, tenderId, tenderName, method, publishDate, deadline, budget });
                                }
                            }
                        });

                        return {
                            items,
                            debugInfo: `DataRows: ${dataRows.length}, Extracted: ${items.length}. FirstRow: ${firstRowDebug}`
                        };
                    });

                    log(`      🔍 ${debugInfo}`);

                    // Build detail objects from extracted items
                    for (const item of tenderItems) {
                        results.push({
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
                            detailLink: item.link
                        });
                    }

                    // Check for Next Page
                    const nextPageInfo = await page.evaluate(() => {
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
                            log(`      → Next page...`);
                            await page.goto(nextPageInfo.href, { waitUntil: 'networkidle2', timeout: 60000 });
                            try { await page.waitForSelector('tr.tb_b2, tr.tb_b3', { timeout: 15000 }); } catch (e) { }
                            pageCount++;
                            if (pageCount > 20) {
                                log(`      ⚠️ Page limit (20) reached.`);
                                hasNextPage = false;
                            }
                        } catch (e) {
                            log(`      ⚠️ Failed to go to next page: ${e.message}`);
                            hasNextPage = false;
                        }
                    } else {
                        hasNextPage = false;
                    }
                }

                log(`   ✅ "${searchKeyword}" → ${results.length} results`);
            } catch (err) {
                log(`   ❌ Error searching "${searchKeyword}": ${err.message}`);
                try { await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'); } catch (e) { }
            }

            return results;
        };

        // ================================
        // Process each OR group
        // ================================
        for (const [gi, group] of orGroups.entries()) {
            log(`\n📦 Processing OR group ${gi + 1}/${orGroups.length}: "${group}"`);

            // Parse NOT terms: "AI AND 系統 NOT 測試" → positives=["AI","系統"], negatives=["測試"]
            const notParts = group.split(/\s+NOT\s+/i);
            const positivePart = notParts[0].trim();
            const negativeTerms = notParts.slice(1).map(n => n.trim()).filter(n => n);

            // Parse AND terms from the positive part
            const andTerms = positivePart.split(/\s+AND\s+/i).map(t => t.trim()).filter(t => t);

            log(`   📋 AND terms: ${JSON.stringify(andTerms)}, NOT terms: ${JSON.stringify(negativeTerms)}`);

            if (andTerms.length === 0) continue;

            let groupResults;

            if (andTerms.length === 1) {
                // Simple search — no AND intersection needed
                groupResults = await searchSingleKeyword(andTerms[0], `Group ${gi + 1}`);
            } else {
                // AND logic: search each term separately, then intersect by detailLink
                const termResultSets = [];
                for (const [ti, term] of andTerms.entries()) {
                    const termResults = await searchSingleKeyword(term, `G${gi + 1} AND-${ti + 1}/${andTerms.length}`);
                    termResultSets.push(termResults);
                }

                // Intersect: keep only results whose detailLink appears in ALL sets
                if (termResultSets.length > 0) {
                    const firstSet = termResultSets[0];
                    groupResults = firstSet.filter(item => {
                        const key = item.detailLink || `${item.tenderId}_${item.agencyName}`;
                        return termResultSets.every(set =>
                            set.some(r => (r.detailLink || `${r.tenderId}_${r.agencyName}`) === key)
                        );
                    });
                    log(`   🔗 AND intersection: ${termResultSets.map(s => s.length).join(' ∩ ')} → ${groupResults.length} results`);
                } else {
                    groupResults = [];
                }
            }

            // Apply NOT filter: exclude results whose text contains any negative term
            if (negativeTerms.length > 0 && groupResults.length > 0) {
                const beforeCount = groupResults.length;
                groupResults = groupResults.filter(item => {
                    const fullText = `${item.agencyName} ${item.tenderId} ${item.tenderName}`.toLowerCase();
                    return !negativeTerms.some(neg => fullText.includes(neg.toLowerCase()));
                });
                log(`   🚫 NOT filter: ${beforeCount} → ${groupResults.length} (excluded ${beforeCount - groupResults.length})`);
            }

            // Merge group results into allResults (union), deduplicate
            for (const detail of groupResults) {
                const uniqueKey = detail.detailLink || `${detail.tenderId}_${detail.agencyName}`;
                if (uniqueKey && !seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    allResults.push(detail);
                }
            }

            log(`   📊 Running total after group ${gi + 1}: ${allResults.length} unique results`);
        }

        log(`🎉 Search complete! Total unique results: ${allResults.length}`);

        // Save to CSV
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
