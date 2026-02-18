/**
 * ===================================================
 * 政府標案查詢系統 — 爬蟲服務（Scraper Service）
 * ===================================================
 * 
 * 功能：
 *   使用 Puppeteer（Headless Chrome）模擬瀏覽器，
 *   向「政府電子採購網」(web.pcc.gov.tw) 送出搜尋請求，
 *   擷取標案清單並回傳結構化資料。
 * 
 * 搜尋語法支援：
 *   - OR  → 聯集（分組搜尋後合併）
 *   - AND → 交集（分別搜尋後取共同結果）
 *   - NOT → 排除（移除包含特定關鍵字的結果）
 *   - 範例："AI AND 系統 OR 資安 NOT 測試"
 * 
 * 輸出：
 *   回傳標案物件陣列，同時儲存 CSV 備份至 data/results/
 */

const puppeteer = require('puppeteer');           // 無頭瀏覽器驅動
const fs = require('fs');                          // 檔案系統
const path = require('path');                      // 路徑工具
const { createObjectCsvWriter } = require('csv-writer'); // CSV 寫入器
const axios = require('axios');                    // HTTP 客戶端（備用）
const cheerio = require('cheerio');                // HTML 解析器（備用）

// CSV 結果儲存路徑
const RESULTS_DIR = path.join(__dirname, '../data/results');

/**
 * 搜尋標案主函式
 * 
 * @param {string} keyword    - 搜尋關鍵字（支援 OR / AND / NOT 語法）
 * @param {string} startDate  - 起始日期（格式：yyyy/MM/dd）
 * @param {string} endDate    - 結束日期（格式：yyyy/MM/dd）
 * @param {Function} onProgress - 即時進度回呼（每條 log 會呼叫此函式）
 * @returns {Promise<Array>}  - 回傳標案物件陣列
 */
async function searchTenders(keyword, startDate, endDate, onProgress = () => { }) {
    // 統一的 log 函式：同時寫入 console 和推送給前端
    const log = (message) => {
        console.log(message);
        onProgress(message);
    };

    log(`🚀 Starting search for: ${keyword}`);

    // ========== 啟動 Puppeteer 瀏覽器 ==========
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',                          // Docker / CI 環境必須
            '--disable-setuid-sandbox',              // 同上
            '--disable-dev-shm-usage',               // 避免共享記憶體不足
            '--disable-accelerated-2d-canvas',       // 節省資源
            '--no-first-run',                         // 跳過首次執行精靈
            '--no-zygote',                            // 單行程模式
            '--disable-gpu',                          // 無需 GPU
            '--disable-blink-features=AutomationControlled' // 降低被偵測為機器人的機率
        ]
    });

    try {
        // 建立新分頁與基本設定
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // ============================
        // 解析複合搜尋語法
        // ============================
        // OR  → 聯集（將查詢分成多組，各組結果合併）
        // AND → 交集（同一組內的多個詞分別搜尋，保留同時出現的結果）
        // NOT → 排除（搜尋主要詞彙後，排除含有 NOT 詞彙的結果）
        //
        // 範例："AI AND 系統 OR 資安 NOT 測試"
        //   第一組："AI AND 系統" → search("AI") ∩ search("系統")
        //   第二組："資安 NOT 測試" → search("資安") − 含「測試」的結果

        // 以 OR 分割成多組
        const orGroups = keyword.split(/\s+OR\s+/i).map(g => g.trim()).filter(g => g);
        let allResults = [];       // 最終結果集合
        const seenKeys = new Set(); // 用於去重的 Set

        log(`📋 Parsed OR groups: ${JSON.stringify(orGroups)}`);

        /**
         * 西元日期 → 民國日期轉換
         * 例："2026/02/18" → "115/02/18"
         */
        const toROCDate = (dateStr) => {
            if (!dateStr) return '';
            const parts = dateStr.split(/[-/]/);
            if (parts.length === 3) {
                const year = parseInt(parts[0]);
                if (year < 1000) return parts.join('/'); // 已是民國年份
                const rocYear = year - 1911;
                return `${rocYear}/${parts[1]}/${parts[2]}`;
            }
            return dateStr;
        };

        // ==========================================
        // 單一關鍵字搜尋函式
        // ==========================================
        /**
         * 搜尋單一關鍵字，從政府電子採購網擷取結果
         * @param {string} searchKeyword - 要搜尋的單一關鍵字
         * @param {string} label - 日誌用的標籤（例如 "Group 1"）
         * @returns {Promise<Array>} - 該關鍵字的結果陣列
         */
        const searchSingleKeyword = async (searchKeyword, label) => {
            const results = [];
            log(`   🔎 [${label}] Searching for: "${searchKeyword}"...`);

            try {
                // 組裝政府電子採購網的搜尋 URL
                const encodedKeyword = encodeURIComponent(searchKeyword);
                const encodedStart = encodeURIComponent(startDate);
                const encodedEnd = encodeURIComponent(endDate);

                const searchUrl = `https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic?pageSize=100&firstSearch=true&searchType=basic&isBinding=N&isLogIn=N&level_1=on&orgName=&orgId=&tenderName=${encodedKeyword}&tenderId=&tenderType=TENDER_DECLARATION&tenderWay=TENDER_WAY_ALL_DECLARATION&dateType=isDate&tenderStartDate=${encodedStart}&tenderEndDate=${encodedEnd}&radProctrgCate=&policyAdvocacy=`;

                // 設定 Referer（模擬從官網頁面發出的請求）
                await page.setExtraHTTPHeaders({
                    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'
                });

                // 導覽至搜尋結果頁面
                try {
                    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    try {
                        // 等待結果表格的資料列出現
                        await page.waitForSelector('tr.tb_b2, tr.tb_b3', { timeout: 15000 });
                    } catch (e) {
                        log(`      ⚠️ No result rows found within timeout.`);
                    }
                } catch (navError) {
                    log(`      ❌ Navigation Error: ${navError.message}`);
                    return results;
                }

                // ========== 分頁迴圈：逐頁擷取 ==========
                let hasNextPage = true;
                let pageCount = 1;

                while (hasNextPage) {
                    log(`      📄 Page ${pageCount}...`);

                    // 從當前頁面擷取標案項目
                    const { items: tenderItems, debugInfo } = await page.evaluate(() => {
                        // 尋找資料列（優先用 CSS class，備用 link 選擇器）
                        let dataRows = Array.from(document.querySelectorAll('tr.tb_b2, tr.tb_b3'));

                        // 備用方案一：透過連結找到所在列
                        if (dataRows.length === 0) {
                            const allLinks = Array.from(document.querySelectorAll('a[href*="urlSelector"]'));
                            const rowSet = new Set();
                            allLinks.forEach(a => { const tr = a.closest('tr'); if (tr) rowSet.add(tr); });
                            dataRows = Array.from(rowSet);
                        }
                        // 備用方案二：透過 pk= 連結
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
                                // 第一列用於 debug 資訊
                                if (ri === 0) {
                                    const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                    firstRowDebug = `cols=${cols.length}, colTexts=${JSON.stringify(colTexts.slice(0, 4))}, linkFound=${!!linkEl}`;
                                }
                                if (linkEl) {
                                    const colTexts = Array.from(cols).map(c => c.innerText.trim());
                                    // 欄位對應（觀察所得）：
                                    // [0]=序號 [1]=機關 [2]=標案案號\n標案名稱 [3]=分類
                                    // [4]=招標方式 [5]=類型 [6]=公告日期 [7]=截止日期 [8]=預算金額 [9]=操作
                                    const agencyName = colTexts[1] || '';
                                    const tenderCell = colTexts[2] || '';
                                    const tenderParts = tenderCell.split('\n');
                                    const tenderId = (tenderParts[0] || '').trim();      // 標案案號
                                    const tenderName = (tenderParts.slice(1).join(' ') || '').trim(); // 標案名稱
                                    const method = colTexts[4] || '';       // 招標方式
                                    const publishDate = colTexts[6] || '';  // 公告日期
                                    const deadline = colTexts[7] || '';     // 截止日期
                                    const budget = colTexts[8] || '';       // 預算金額

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

                    // 將擷取的項目轉換為統一格式
                    for (const item of tenderItems) {
                        results.push({
                            agencyName: item.agencyName,     // 機關名稱
                            tenderId: item.tenderId,         // 標案案號
                            tenderName: item.tenderName,     // 標案名稱
                            method: item.method || '',       // 招標方式
                            publishDate: item.publishDate || '', // 公告日期
                            deadline: item.deadline || '',   // 截止日期
                            budget: item.budget || '',       // 預算金額
                            centralGov: '',                  // 中央政府計畫（預留欄位）
                            location: '',                    // 履約地點（預留欄位）
                            contact: '',                     // 機關窗口（預留欄位）
                            detailLink: item.link            // 標案詳細連結
                        });
                    }

                    // ========== 翻頁邏輯 ==========
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
                            // 安全限制：最多翻 20 頁
                            if (pageCount > 20) {
                                log(`      ⚠️ Page limit (20) reached.`);
                                hasNextPage = false;
                            }
                        } catch (e) {
                            log(`      ⚠️ Failed to go to next page: ${e.message}`);
                            hasNextPage = false;
                        }
                    } else {
                        hasNextPage = false; // 沒有下一頁
                    }
                }

                log(`   ✅ "${searchKeyword}" → ${results.length} results`);
            } catch (err) {
                log(`   ❌ Error searching "${searchKeyword}": ${err.message}`);
                // 錯誤時嘗試重新導向至首頁，避免下次搜尋卡住
                try { await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic'); } catch (e) { }
            }

            return results;
        };

        // ================================
        // 逐組處理 OR 群組
        // ================================
        for (const [gi, group] of orGroups.entries()) {
            log(`\n📦 Processing OR group ${gi + 1}/${orGroups.length}: "${group}"`);

            // 解析 NOT 條件："AI AND 系統 NOT 測試" → 正面詞=["AI","系統"], 排除詞=["測試"]
            const notParts = group.split(/\s+NOT\s+/i);
            const positivePart = notParts[0].trim();
            const negativeTerms = notParts.slice(1).map(n => n.trim()).filter(n => n);

            // 解析 AND 條件
            const andTerms = positivePart.split(/\s+AND\s+/i).map(t => t.trim()).filter(t => t);

            log(`   📋 AND terms: ${JSON.stringify(andTerms)}, NOT terms: ${JSON.stringify(negativeTerms)}`);

            if (andTerms.length === 0) continue;

            let groupResults;

            if (andTerms.length === 1) {
                // 單一關鍵字：直接搜尋
                groupResults = await searchSingleKeyword(andTerms[0], `Group ${gi + 1}`);
            } else {
                // AND 邏輯：分別搜尋每個詞，然後取交集
                const termResultSets = [];
                for (const [ti, term] of andTerms.entries()) {
                    const termResults = await searchSingleKeyword(term, `G${gi + 1} AND-${ti + 1}/${andTerms.length}`);
                    termResultSets.push(termResults);
                }

                // 取交集：只保留在所有搜尋結果中都出現的標案
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

            // 套用 NOT 過濾：排除包含排除關鍵字的結果
            if (negativeTerms.length > 0 && groupResults.length > 0) {
                const beforeCount = groupResults.length;
                groupResults = groupResults.filter(item => {
                    const fullText = `${item.agencyName} ${item.tenderId} ${item.tenderName}`.toLowerCase();
                    return !negativeTerms.some(neg => fullText.includes(neg.toLowerCase()));
                });
                log(`   🚫 NOT filter: ${beforeCount} → ${groupResults.length} (excluded ${beforeCount - groupResults.length})`);
            }

            // 將本組結果合併至總結果（OR 聯集），同時去重
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

        // ========== 匯出 CSV ==========
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
        // 無論成功或失敗，都關閉瀏覽器釋放資源
        await browser.close();
    }
}

module.exports = { searchTenders };
