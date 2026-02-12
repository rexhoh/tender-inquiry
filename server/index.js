const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
const scraperService = require('./services/scraper');
const schedulerService = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directories exist
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);

// API Routes

// 1. Search Endpoint - Triggers immediate search
app.post('/api/search', async (req, res) => {
    try {
        const { keyword, startDate, endDate } = req.body;
        console.log(`Received search request: ${keyword}, date: ${startDate}-${endDate}`);

        // Run scraper asynchronously or wait? For immediate feedback, maybe wait for a bit or return job ID.
        // For simplicity in this version, we'll await the result (might be slow).
        const results = await scraperService.searchTenders(keyword, startDate, endDate);

        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Schedule Endpoints
app.get('/api/schedules', (req, res) => {
    const jobs = schedulerService.getJobs();
    res.json(jobs);
});

app.post('/api/schedules', (req, res) => {
    try {
        const { keyword, frequency } = req.body; // frequency: 'daily', 'weekly'
        const job = schedulerService.addJob(keyword, frequency);
        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/schedules/:id', (req, res) => {
    try {
        schedulerService.removeJob(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Results/Download Endpoint
app.get('/api/results/:filename', (req, res) => {
    const filepath = path.join(RESULTS_DIR, req.params.filename);
    if (fs.existsSync(filepath)) {
        res.download(filepath);
    } else {
        res.status(404).json({ success: false, error: 'File not found' });
    }
});

// Serve static files from the React app
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
} else {
    console.log('Client build not found. API mode only.');
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Initialize saved schedules
    schedulerService.init();
});
