const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const scraperService = require('./scraper');

const SCHEDULE_FILE = path.join(__dirname, '../data/schedules.json');
let jobs = {}; // Store schedule rules/jobs in memory: { id: jobObject }

// Helper to save to disk
function saveSchedules() {
    const data = Object.values(jobs).map(j => ({
        id: j.id,
        keyword: j.keyword,
        frequency: j.frequency,
        createdAt: j.createdAt
    }));
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

// Initializer
function init() {
    if (fs.existsSync(SCHEDULE_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        data.forEach(jobData => {
            scheduleJobFromData(jobData);
        });
        console.log(`Loaded ${data.length} schedules.`);
    }
}

function scheduleJobFromData(jobData) {
    // Determine cron rule based on frequency
    // frequency: 'daily' (e.g. 09:00), 'weekly' (e.g. Monday 09:00)
    // For simplicity, let's hardcode 'daily' = every day at 09:00, 'weekly' = Monday 09:00
    // Real implementation would allow custom times.

    let rule;
    if (jobData.frequency === 'daily') {
        rule = '0 9 * * *'; // Run at 9:00 AM every day
    } else if (jobData.frequency === 'weekly') {
        rule = '0 9 * * 1'; // Run at 9:00 AM every Monday
    } else {
        rule = '*/5 * * * *'; // Default: every 5 minutes (for testing)
    }

    const job = schedule.scheduleJob(rule, async () => {
        console.log(`Running scheduled job: ${jobData.keyword}`);
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const ds = `${yyyy}/${mm}/${dd}`;

        try {
            await scraperService.searchTenders(jobData.keyword, ds, ds); // Search for today
        } catch (e) {
            console.error(`Scheduled job failed for ${jobData.keyword}:`, e);
        }
    });

    jobs[jobData.id] = { ...jobData, jobRef: job };
}

function addJob(keyword, frequency) {
    const id = Date.now().toString(); // Simple ID
    const jobData = {
        id,
        keyword,
        frequency,
        createdAt: new Date().toISOString()
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
        createdAt: j.createdAt
    }));
}

module.exports = {
    init,
    addJob,
    removeJob,
    getJobs
};
