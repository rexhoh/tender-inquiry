import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    FolderOpen, Trash2, Eye, Download, Clock, Search,
    ChevronDown, ChevronUp, X, AlertCircle, Loader2, Calendar
} from 'lucide-react';

const HistoryManager = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingEntry, setViewingEntry] = useState(null);
    const [viewLoading, setViewLoading] = useState(false);

    useEffect(() => { fetchHistory(); }, []);

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

    const handleView = async (id) => {
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

    const handleDelete = async (id) => {
        if (!window.confirm('確定刪除此搜尋記錄？')) return;
        try {
            await axios.delete(`/api/history/${id}`);
            if (viewingEntry?.id === id) setViewingEntry(null);
            fetchHistory();
        } catch (error) {
            console.error('Failed to delete history entry', error);
        }
    };

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

    const handleDownloadEntry = (entry) => {
        if (!entry?.results?.length) return;
        const headers = ['機關名稱', '標案案號', '標案名稱', '招標方式', '公告日期', '截止日期', '預算金額', '詳細連結'];
        const keys = ['agencyName', 'tenderId', 'tenderName', 'method', 'publishDate', 'deadline', 'budget', 'detailLink'];
        const csvContent = [
            headers.join(','),
            ...entry.results.map(row => keys.map(key => `"${(row[key] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${entry.keyword}_${entry.createdAt.slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
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

            {/* History list */}
            {loading ? (
                <div className="text-center py-16">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-400 mb-3" />
                    <p className="text-base" style={{ color: 'var(--text-muted)' }}>載入搜尋記錄...</p>
                </div>
            ) : history.length === 0 ? (
                <div className="card text-center py-16" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-base">尚無搜尋記錄</p>
                    <p className="text-sm mt-1">執行搜尋後，結果會自動儲存在這裡</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {history.map((entry) => (
                        <div key={entry.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* Row summary */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                                <div className="flex-1 min-w-0">
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

                                {/* Actions */}
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

                            {/* Expanded detail view */}
                            {viewingEntry?.id === entry.id && (
                                <div style={{ borderTop: '1px solid var(--border)' }}>
                                    {viewLoading ? (
                                        <div className="text-center py-8">
                                            <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-400" />
                                        </div>
                                    ) : viewingEntry?.results?.length > 0 ? (
                                        <div className="p-5 space-y-4">
                                            {/* Download button */}
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => handleDownloadEntry(viewingEntry)}
                                                    className="btn-success"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    下載 CSV
                                                </button>
                                            </div>

                                            {/* Results grid */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {viewingEntry.results.slice(0, 20).map((item, idx) => (
                                                    <div key={idx} className="rounded-xl p-4 space-y-2"
                                                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                                                        <div className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
                                                            {item.agencyName}
                                                        </div>
                                                        <div>
                                                            <div className="font-mono text-xs text-blue-400 mb-0.5">{item.tenderId}</div>
                                                            <div className="text-sm font-medium line-clamp-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                                                                {item.tenderName}
                                                            </div>
                                                        </div>
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

                                            {viewingEntry.results.length > 20 && (
                                                <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                                                    顯示前 20 筆，共 {viewingEntry.results.length} 筆。下載 CSV 取得完整資料。
                                                </p>
                                            )}
                                        </div>
                                    ) : (
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
