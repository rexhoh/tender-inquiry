---
title: Tender Inquiry System
emoji: 🏢
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 3001
pinned: false
license: mit
short_description: A Puppeteer-based scraper for Taiwan Government Tenders
---

# Government Tender Inquiry System (政府標案查詢系統)

An automated system to search and track government tenders in Taiwan.

## Features
- **Keyword Search**: Supports complex "OR" logic (e.g., `AI OR Security`).
- **Date Range**: Filter tenders by announcement date.
- **Detailed Export**: Scrapes detailed tender info and exports to CSV.
- **Visual Dashboard**: Cyberpunk-themed UI for easy tracking.
- **Live Logs**: Real-time feedback on scraping progress via Server-Sent Events (SSE).

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express
- **Scraper**: Puppeteer (Headless Chrome)
- **Deployment**: Docker on Hugging Face Spaces

## Local Development
1. Clone the repo
2. `npm install`
3. `npm run install-all`
4. `npm start`
