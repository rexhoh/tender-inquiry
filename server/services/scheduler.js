const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const scraperService = require('./scraper');

const SCHEDULE_FILE = path.join(__dirname, '../data/schedules.json');
const HISTORY_FILE = path.join(__dirname, '../data/search_history.json');
let jobs = {}; // { id: { id, keyword, frequency, hour, minute, dayOfWeek, createdAt, jobRef } }

// Helper: read/write search history (for saving scheduled results)
function readHistory() {
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {
        return [];
    }
}
function writeHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// Helper to save to disk
function saveSchedules() {
    const data = Object.values(jobs).map(j => ({
        id: j.id,
        keyword: j.keyword,
        frequency: j.frequency,
        hour: j.hour,
        minute: j.minute,
        dayOfWeek: j.dayOfWeek,
        createdAt: j.createdAt,
    }));
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

// Initializer
function init() {
    if (fs.existsSync(SCHEDULE_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        data.forEach(jobData => {
            // Migrate old entries that don't have hour/minute
            if (jobData.hour === undefined) jobData.hour = 9;
            if (jobData.minute === undefined) jobData.minute = 0;
            if (jobData.frequency === 'weekly' && jobData.dayOfWeek === undefined) jobData.dayOfWeek = 1;
            scheduleJobFromData(jobData);
        });
        console.log(`Loaded ${data.length} schedules.`);
    }
}

// Helper to format date as yyyy/MM/dd
function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
}

function scheduleJobFromData(jobData) {
    const hour = jobData.hour ?? 9;
    const minute = jobData.minute ?? 0;

    let rule;
    if (jobData.frequency === 'daily') {
        // Run at specified hour:minute every day
        rule = `${minute} ${hour} * * *`;
    } else if (jobData.frequency === 'weekly') {
        // Run at specified hour:minute on specified day of week (0=Sunday, 1=Monday, ...)
        const dow = jobData.dayOfWeek ?? 1;
        rule = `${minute} ${hour} * * ${dow}`;
    } else {
        rule = '*/5 * * * *'; // fallback: every 5 minutes
    }

    const job = schedule.scheduleJob(rule, async () => {
        console.log(`Running scheduled job: "${jobData.keyword}" (${jobData.frequency})`);
        const today = new Date();

        let startDate, endDate;
        endDate = formatDate(today);

        if (jobData.frequency === 'daily') {
            // Daily: search today and yesterday
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = formatDate(yesterday);
        } else {
            // Weekly: search past 7 days
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            startDate = formatDate(weekAgo);
        }

        try {
            const results = await scraperService.searchTenders(jobData.keyword, startDate, endDate);
            console.log(`Scheduled job "${jobData.keyword}" completed: ${results.length} results`);

            // Save results to search history
            const historyEntry = {
                id: Date.now().toString(),
                type: 'scheduled',
                keyword: jobData.keyword,
                startDate,
                endDate,
                resultCount: results.length,
                results: results,
                createdAt: new Date().toISOString(),
            };
            const history = readHistory();
            history.unshift(historyEntry);
            if (history.length > 100) history.length = 100;
            writeHistory(history);
        } catch (e) {
            console.error(`Scheduled job failed for ${jobData.keyword}:`, e);
        }
    });

    jobs[jobData.id] = {
        ...jobData,
        hour,
        minute,
        dayOfWeek: jobData.dayOfWeek,
        jobRef: job,
    };
}

function addJob(keyword, frequency, hour = 9, minute = 0, dayOfWeek = 1) {
    const id = Date.now().toString();
    const jobData = {
        id,
        keyword,
        frequency,
        hour: parseInt(hour, 10),
        minute: parseInt(minute, 10),
        dayOfWeek: frequency === 'weekly' ? parseInt(dayOfWeek, 10) : undefined,
        createdAt: new Date().toISOString(),
    };

    scheduleJobFromData(jobData);
    saveSchedules();
    return jobData;
}

function removeJob(id) {
    if (jobs[id]) {
        if (jobs[id].jobRef) {
            jobs[id].jobRef.cancel();
        }
        delete jobs[id];
        saveSchedules();
    } else {
        throw new Error('Job not found');
    }
}

function getJobs() {
    return Object.values(jobs).map(j => ({
        id: j.id,
        keyword: j.keyword,
        frequency: j.frequency,
        hour: j.hour,
        minute: j.minute,
        dayOfWeek: j.dayOfWeek,
        createdAt: j.createdAt,
    }));
}

module.exports = {
    init,
    addJob,
    removeJob,
    getJobs,
};
