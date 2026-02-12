const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

const RESULTS_DIR = path.join(__dirname, '../data/results');

async function searchTenders(keyword, startDate, endDate) {
    console.log(`Starting search for: ${keyword}`);
    const browser = await puppeteer.launch({
        headless: false, // Set to true for production, false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        // 1. Navigate to the page
        await page.goto('https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic', { waitUntil: 'networkidle2' });

        // 2. Fill Search Form
        // Select "Date Range" (日期區間)
        const dateRadio = await page.$('#level_23');
        if (dateRadio) await dateRadio.click();

        // Fill Keyword
        if (keyword) {
            await page.type('#tenderName', keyword);
        }

        // Fill Date Range
        // Assuming format is YYYY/MM/DD or similar. The site usually takes YYYY/MM/DD.
        // We might need to convert standard Date to this format.
        // Let's assume input is already formatted or we format it here.
        if (startDate) {
            await page.evaluate((date) => { document.getElementById('tenderStartDate').value = date; }, startDate);
        }
        if (endDate) {
            await page.evaluate((date) => { document.getElementById('tenderEndDate').value = date; }, endDate);
        }

        // 3. Submit Search
        // Find the "Query" button. It's usually a div with class 'bt_cen2' or button with '查詢' text.
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
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => console.log('Navigation timeout or no nav'));
        } else {
            throw new Error('Search button not found');
        }

        // 4. Process Results
        // Wait for table
        await page.waitForSelector('table.tb_03c', { timeout: 10000 });

        const results = [];

        // Get all "View" buttons links or actions
        // We need to iterate because clicking "View" might navigate away.
        // Strategy: Get all links to details, then visit them one by one.
        // Or if "View" opens a popup/new tab.

        // Let's scrape the basic list first to get the "View" URLs or JavaScript actions
        const tenderLinks = await page.evaluate(() => {
            const rows = document.querySelectorAll('table.tb_03c tbody tr');
            const links = [];
            rows.forEach(row => {
                const link = row.querySelector('a[title="檢視標案詳細內容"]'); // Selector from inspection
                if (link) {
                    links.push(link.href);
                }
            });
            return links;
        });

        console.log(`Found ${tenderLinks.length} tenders. Scraping details...`);

        for (const link of tenderLinks) {
            const newPage = await browser.newPage();
            await newPage.goto(link, { waitUntil: 'domcontentloaded' });

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
                    contact: getText('聯絡人') // Taking generic contact info
                };
            });

            results.push(detail);
            await newPage.close();
            // polite delay
            await new Promise(r => setTimeout(r, 500));
        }

        // 5. Save to CSV
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tenders-${keyword}-${timestamp}.csv`;
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
            encoding: 'utf8',
            append: false
        });

        // Add BOM for Excel compatibility
        const fs = require('fs');
        // fs.writeFileSync(csvPath, '\ufeff'); // csv-writer doesn't support BOM easily in append mode initially? 
        // Actually csv-writer overwrites. We can write BOM manually before if needed, 
        // but let's just use the writer. Encoding utf8 is standard.

        await csvWriter.writeRecords(results);
        console.log(`Saved results to ${csvPath}`);

        return results;

    } catch (error) {
        console.error('Puppeteer error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { searchTenders };
