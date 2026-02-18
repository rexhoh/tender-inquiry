/**
 * ===================================================
 * 搜尋記錄管理元件（HistoryManager）
 * ===================================================
 * 
 * 功能：
 *   - 列出所有搜尋歷史（含即時搜尋 + 排程搜尋）
 *   - 展開查看單筆記錄的完整結果（前 20 筆預覽）
 *   - 單筆下載 CSV
 *   - 單筆刪除 / 清除全部
 * 
 * API 端點：
 *   GET    /api/history      → 取得摘要清單
 *   GET    /api/history/:id  → 取得詳細資料
 *   DELETE /api/history/:id  → 刪除單筆
 *   DELETE /api/history      → 清除全部
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    FolderOpen, Trash2, Eye, Download, Clock, Search,
    ChevronDown, ChevronUp, X, AlertCircle, Loader2, Calendar
} from 'lucide-react';

const HistoryManager = () => {
    // ========== 狀態定義 ==========
    const [history, setHistory] = useState([]);       // 歷史摘要清單
    const [loading, setLoading] = useState(true);     // 載入中狀態
    const [viewingEntry, setViewingEntry] = useState(null);  // 目前展開查看中的記錄
    const [viewLoading, setViewLoading] = useState(false);   // 單筆詳細載入中

    // 元件載入時自動取得歷史記錄
    useEffect(() => { fetchHistory(); }, []);

    /**
     * 取得搜尋歷史摘要清單
     */
    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/history');
            setHistory(response.data);
        } catch (error) {
            console.error('Failed to fetch history', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * 展開或收合單筆歷史詳細資料
     * @param {string} id - 歷史記錄 ID
     */
    const handleView = async (id) => {
        // 如果已展開同一筆，則收合
        if (viewingEntry?.id === id) {
            setViewingEntry(null);
            return;
        }
        setViewLoading(true);
        try {
            const response = await axios.get(`/api/history/${id}`);
            setViewingEntry(response.data);
        } catch (error) {
            console.error('Failed to view history entry', error);
        } finally {
            setViewLoading(false);
        }
    };

    /**
     * 刪除單筆歷史記錄
     * @param {string} id - 歷史記錄 ID
     */
    const handleDelete = async (id) => {
        if (!window.confirm('確定刪除此搜尋記錄？')) return;
        try {
            await axios.delete(`/api/history/${id}`);
            if (viewingEntry?.id === id) setViewingEntry(null); // 若正在查看則收合
            fetchHistory(); // 重新載入清單
        } catch (error) {
            console.error('Failed to delete history entry', error);
        }
    };

    /**
     * 清除所有歷史記錄
     */
    const handleClearAll = async () => {
        if (!window.confirm('確定清除所有搜尋記錄？此操作無法復原。')) return;
        try {
            await axios.delete('/api/history');
            setViewingEntry(null);
            fetchHistory();
        } catch (error) {
            console.error('Failed to clear history', error);
        }
    };

    /**
     * 下載單筆歷史記錄為 CSV
     * @param {Object} entry - 歷史記錄物件（含 results 陣列）
     */
    const handleDownloadEntry = (entry) => {
        if (!entry?.results?.length) return;
        const headers = ['機關名稱', '標案案號', '標案名稱', '招標方式', '公告日期', '截止日期', '預算金額', '詳細連結'];
        const keys = ['agencyName', 'tenderId', 'tenderName', 'method', 'publishDate', 'deadline', 'budget', 'detailLink'];
        const csvContent = [
            headers.join(','),
            ...entry.results.map(row => keys.map(key => `"${(row[key] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        // 加上 BOM 確保 Excel 正確顯示中文
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${entry.keyword}_${entry.createdAt.slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    /**
     * 格式化 ISO 時間戳為中文日時格式
     * @param {string} iso - ISO 8601 時間字串
     * @returns {string} 例如 "2026/02/18 10:30"
     */
    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="space-y-6">
            {/* ========== 頁面標題 + 清除全部按鈕 ========== */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <FolderOpen className="w-6 h-6 text-blue-400" />
                    搜尋記錄管理
                </h2>
                {history.length > 0 && (
                    <button onClick={handleClearAll} className="btn-danger">
                        <Trash2 className="w-4 h-4" />
                        清除全部
                    </button>
                )}
            </div>

            {/* ========== 歷史記錄列表 ========== */}
            {loading ? (
                /* 載入中動畫 */
                <div className="text-center py-16">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-400 mb-3" />
                    <p className="text-base" style={{ color: 'var(--text-muted)' }}>載入搜尋記錄...</p>
                </div>
            ) : history.length === 0 ? (
                /* 空狀態 */
                <div className="card text-center py-16" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-base">尚無搜尋記錄</p>
                    <p className="text-sm mt-1">執行搜尋後，結果會自動儲存在這裡</p>
                </div>
            ) : (
                /* 記錄清單 */
                <div className="space-y-3">
                    {history.map((entry) => (
                        <div key={entry.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* ===== 摘要列 ===== */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                                <div className="flex-1 min-w-0">
                                    {/* 關鍵字 + 類型標籤 + 筆數 */}
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <span className="text-base font-semibold text-white truncate">
                                            {entry.keyword}
                                        </span>
                                        <span className={`badge ${entry.type === 'scheduled' ? 'badge-green' : 'badge-blue'}`}>
                                            {entry.type === 'scheduled' ? '排程' : '即時'}
                                        </span>
                                        <span className="badge badge-blue">
                                            {entry.resultCount} 筆
                                        </span>
                                    </div>
                                    {/* 時間 + 日期範圍 */}
                                    <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                                        <span className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            {formatDate(entry.createdAt)}
                                        </span>
                                        {entry.startDate && (
                                            <span className="flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {entry.startDate} ~ {entry.endDate}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 操作按鈕：查看 / 刪除 */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleView(entry.id)}
                                        className="btn-ghost"
                                    >
                                        {viewingEntry?.id === entry.id ? (
                                            <><ChevronUp className="w-4 h-4" /> 收合</>
                                        ) : (
                                            <><Eye className="w-4 h-4" /> 查看</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="btn-danger"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        刪除
                                    </button>
                                </div>
                            </div>

                            {/* ===== 展開的詳細結果 ===== */}
                            {viewingEntry?.id === entry.id && (
                                <div style={{ borderTop: '1px solid var(--border)' }}>
                                    {viewLoading ? (
                                        /* 詳細資料載入中 */
                                        <div className="text-center py-8">
                                            <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-400" />
                                        </div>
                                    ) : viewingEntry?.results?.length > 0 ? (
                                        <div className="p-5 space-y-4">
                                            {/* CSV 下載按鈕 */}
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => handleDownloadEntry(viewingEntry)}
                                                    className="btn-success"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    下載 CSV
                                                </button>
                                            </div>

                                            {/* 結果卡片 Grid（最多顯示前 20 筆） */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {viewingEntry.results.slice(0, 20).map((item, idx) => (
                                                    <div key={idx} className="rounded-xl p-4 space-y-2"
                                                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                                                        {/* 機關名稱 */}
                                                        <div className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
                                                            {item.agencyName}
                                                        </div>
                                                        {/* 標案案號 + 名稱 */}
                                                        <div>
                                                            <div className="font-mono text-xs text-blue-400 mb-0.5">{item.tenderId}</div>
                                                            <div className="text-sm font-medium line-clamp-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                                                                {item.tenderName}
                                                            </div>
                                                        </div>
                                                        {/* 招標方式 + 金額 + 查看連結 */}
                                                        <div className="flex items-center justify-between text-sm">
                                                            <div className="flex items-center gap-2">
                                                                {item.method && <span className="tag">{item.method}</span>}
                                                                {item.budget && (
                                                                    <span className="font-mono font-semibold" style={{ color: '#4ade80' }}>
                                                                        ${item.budget}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.detailLink && (
                                                                <a href={item.detailLink} target="_blank" rel="noopener noreferrer"
                                                                    className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-1">
                                                                    <Eye className="w-3.5 h-3.5" /> 查看
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 超過 20 筆時的提示 */}
                                            {viewingEntry.results.length > 20 && (
                                                <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                                                    顯示前 20 筆，共 {viewingEntry.results.length} 筆。下載 CSV 取得完整資料。
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        /* 無結果 */
                                        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                                            無搜尋結果資料
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default HistoryManager;
