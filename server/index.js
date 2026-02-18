// Polyfill for File API (needed for some Node 18 environments / undici)
if (typeof File === 'undefined') {
    class File extends Blob {
        constructor(fileBits, fileName, options) {
            super(fileBits, options);
            this.name = fileName;
            this.lastModified = options?.lastModified || Date.now();
        }
    }
    global.File = File;
}

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
const HISTORY_FILE = path.join(DATA_DIR, 'search_history.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]');

// Helper: read/write search history
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

// Log Capture for Cloud Debugging
const MAX_LOGS = 1000;
const systemLogs = [];
const originalLog = console.log;
const originalError = console.error;

function captureLog(type, args) {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    const timestamp = new Date().toISOString();
    systemLogs.push(`[${timestamp}] [${type}] ${message}`);
    if (systemLogs.length > MAX_LOGS) systemLogs.shift();
}

console.log = (...args) => {
    captureLog('INFO', args);
    originalLog.apply(console, args);
};

console.error = (...args) => {
    captureLog('ERROR', args);
    originalError.apply(console, args);
};

// API Routes

// System Logs Endpoint
app.get('/api/system-logs', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(systemLogs.join('\n'));
});

// 1. Search Endpoint - SSE Streaming
app.get('/api/search-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const { keyword, startDate, endDate } = req.query;

    if (!keyword) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Keyword is required' })}\n\n`);
        res.end();
        return;
    }

    const { searchTenders } = require('./services/scraper');

    searchTenders(keyword, startDate, endDate, (logMessage) => {
        res.write(`data: ${JSON.stringify({ type: 'log', message: logMessage })}\n\n`);
    })
        .then((results) => {
            // Save to search history
            const historyEntry = {
                id: Date.now().toString(),
                type: 'immediate',
                keyword,
                startDate: startDate || '',
                endDate: endDate || '',
                resultCount: results.length,
                results: results,
                createdAt: new Date().toISOString(),
            };
            const history = readHistory();
            history.unshift(historyEntry);
            // Keep max 100 entries
            if (history.length > 100) history.length = 100;
            writeHistory(history);

            res.write(`data: ${JSON.stringify({ type: 'complete', results })}\n\n`);
            res.end();
        })
        .catch((err) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            res.end();
        });

    req.on('close', () => {
        console.log('Client disconnected from stream');
    });
});

// Backward compatibility
app.post('/api/search', async (req, res) => {
    try {
        const { keyword, startDate, endDate } = req.body;
        console.log(`Received search request: ${keyword}, date: ${startDate}-${endDate}`);
        const results = await scraperService.searchTenders(keyword, startDate, endDate);

        // Save to history
        const historyEntry = {
            id: Date.now().toString(),
            type: 'immediate',
            keyword,
            startDate: startDate || '',
            endDate: endDate || '',
            resultCount: results.length,
            results: results,
            createdAt: new Date().toISOString(),
        };
        const history = readHistory();
        history.unshift(historyEntry);
        if (history.length > 100) history.length = 100;
        writeHistory(history);

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
        const { keyword, frequency, hour, minute, dayOfWeek } = req.body;
        const job = schedulerService.addJob(keyword, frequency, hour, minute, dayOfWeek);
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

// 3. Search History Endpoints
app.get('/api/history', (req, res) => {
    const history = readHistory();
    // Return summaries (without full results for list view)
    const summaries = history.map(({ results, ...rest }) => ({
        ...rest,
    }));
    res.json(summaries);
});

app.get('/api/history/:id', (req, res) => {
    const history = readHistory();
    const entry = history.find(h => h.id === req.params.id);
    if (entry) {
        res.json(entry);
    } else {
        res.status(404).json({ success: false, error: 'History entry not found' });
    }
});

app.delete('/api/history/:id', (req, res) => {
    let history = readHistory();
    const idx = history.findIndex(h => h.id === req.params.id);
    if (idx !== -1) {
        history.splice(idx, 1);
        writeHistory(history);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'History entry not found' });
    }
});

app.delete('/api/history', (req, res) => {
    writeHistory([]);
    res.json({ success: true });
});

// 4. Results/Download Endpoint
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
    const msg = `Server running on http://localhost:${PORT}`;
    console.log(msg);
    schedulerService.init();
});
