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

# 🏢 政府標案查詢系統 (Government Tender Inquiry System)

> **TENDER.OS v3.0** — 自動化搜尋與追蹤台灣政府標案的全端應用系統。

🔗 **線上版本**：[https://rexhoh-tender-inquiry.hf.space](https://rexhoh-tender-inquiry.hf.space)  
📦 **GitHub**：[https://github.com/rexhoh/tender-inquiry](https://github.com/rexhoh/tender-inquiry)

---

## ✨ 功能特色

| 功能 | 說明 |
|------|------|
| 🔍 **關鍵字搜尋** | 支援 `OR` 邏輯組合，例如 `AI OR 資安 OR 雲端` |
| 📅 **日期區間篩選** | 依公告日期範圍過濾標案 |
| 📋 **詳細資訊擷取** | 自動爬取標案名稱、機關、金額、截止日期等完整資訊 |
| 📥 **CSV 匯出** | 一鍵下載搜尋結果為 CSV 檔案 |
| 📂 **搜尋記錄管理** | 自動儲存歷史搜尋，可查看、展開、刪除 |
| ⏰ **排程搜尋** | 設定每日 / 每週自動搜尋，支援自訂時間與星期 |
| 📊 **即時日誌** | 透過 Server-Sent Events (SSE) 即時回饋爬蟲進度 |
| 📱 **響應式設計** | 自適應桌面與手機，科技感暗色主題 UI |

---

## 🛠 技術架構

```
tender-inquiry/
├── client/                 # 前端（React + Vite）
│   ├── src/
│   │   ├── components/     # React 元件
│   │   │   ├── SearchForm.jsx      # 搜尋表單
│   │   │   ├── ResultsTable.jsx    # 結果卡片
│   │   │   ├── LogViewer.jsx       # 即時日誌
│   │   │   ├── HistoryManager.jsx  # 搜尋記錄管理
│   │   │   └── ScheduleManager.jsx # 排程管理
│   │   └── App.jsx                 # 主應用程式
│   └── index.html
├── server/                 # 後端（Node.js + Express）
│   ├── index.js            # API 伺服器
│   └── services/
│       ├── scraper.js      # Puppeteer 爬蟲服務
│       └── scheduler.js    # 排程任務管理
├── Dockerfile              # Docker 容器建置
└── package.json            # 根目錄腳本
```

| 層級 | 技術 |
|------|------|
| **前端** | React 19、Vite、Vanilla CSS |
| **後端** | Node.js 18+、Express 5 |
| **爬蟲** | Puppeteer（Headless Chrome） |
| **排程** | node-schedule |
| **部署** | Docker on Hugging Face Spaces |

---

## 🚀 單機部署指南

### 前置需求

- **Node.js** ≥ 18（推薦 LTS 版本）
- **npm** ≥ 9
- **Google Chrome** 或 **Chromium**（Puppeteer 所需，首次安裝時會自動下載）
- **Git**

### 方法一：直接執行（開發模式）

```bash
# 1. Clone 專案
git clone https://github.com/rexhoh/tender-inquiry.git
cd tender-inquiry

# 2. 安裝所有依賴（根目錄 + server + client）
npm install

# 3. 啟動開發模式（前後端同時啟動）
npm start
```

啟動後：
- **前端**：[http://localhost:5173](http://localhost:5173)（Vite 開發伺服器，支援 HMR 熱更新）
- **後端 API**：[http://localhost:3001](http://localhost:3001)

### 方法二：Production Build（正式部署）

```bash
# 1. Clone 專案
git clone https://github.com/rexhoh/tender-inquiry.git
cd tender-inquiry

# 2. 安裝依賴
npm install

# 3. 建置前端
cd client && npm run build && cd ..

# 4. 啟動伺服器（會自動 serve 靜態前端）
cd server && node index.js
```

啟動後：
- **應用程式**：[http://localhost:3001](http://localhost:3001)（前後端合併在同一個 port）

### 方法三：Docker 部署

```bash
# 1. Clone 專案
git clone https://github.com/rexhoh/tender-inquiry.git
cd tender-inquiry

# 2. 建置 Docker Image
docker build -t tender-inquiry .

# 3. 啟動容器
docker run -p 3001:3001 tender-inquiry
```

啟動後：
- **應用程式**：[http://localhost:3001](http://localhost:3001)

### 環境變數（可選）

| 變數名稱 | 預設值 | 說明 |
|----------|--------|------|
| `PORT` | `3001` | 伺服器監聽 Port |
| `GEMINI_API_KEY` | — | Google Gemini API Key（如有 AI 功能） |

可在 `server/` 目錄下建立 `.env` 檔案：

```env
PORT=3001
GEMINI_API_KEY=your_api_key_here
```

---

## 🖥 使用說明

### 搜尋標案
1. 在「搜尋關鍵字」欄位輸入關鍵字（支援 `OR` 邏輯）
2. 選擇公告日期範圍
3. 點擊「開始搜尋」
4. 結果會以卡片形式呈現，可點擊「查看」前往政府採購網

### 匯出 CSV
- 搜尋結果上方點擊「下載 CSV」即可匯出

### 管理搜尋記錄
- 切換至「管理」分頁查看歷史紀錄
- 可展開查看、單筆刪除、或清除全部

### 排程自動搜尋
- 切換至「排程」分頁
- 設定關鍵字、頻率（每日 / 每週）、執行時間
- **每日排程**：自動搜尋當日與前一日公告
- **每週排程**：自動搜尋前 7 日公告

---

## 📝 License

MIT License © 2026
