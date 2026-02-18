import React, { useState } from 'react';
import { Search, HelpCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { format, subDays } from 'date-fns';
import LogViewer from './LogViewer';

const SearchForm = ({ onResults }) => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy/MM/dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy/MM/dd'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [showTooltip, setShowTooltip] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setLogs([]);
        onResults([]);

        const queryParams = new URLSearchParams({ keyword, startDate, endDate }).toString();
        const eventSource = new EventSource(`/api/search-stream?${queryParams}`);

        eventSource.onopen = () => {
            setLogs(prev => [...prev, '⚡ 連線建立，搜尋啟動中...']);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') {
                    setLogs(prev => [...prev, data.message]);
                } else if (data.type === 'complete') {
                    onResults(data.results);
                    setLogs(prev => [...prev, `✅ 搜尋完成！共 ${data.results.length} 筆資料`]);
                    setLoading(false);
                    eventSource.close();
                } else if (data.type === 'error') {
                    setError(data.message);
                    setLogs(prev => [...prev, `❌ 錯誤: ${data.message}`]);
                    setLoading(false);
                    eventSource.close();
                }
            } catch (err) {
                console.error('Parse error', err);
            }
        };

        eventSource.onerror = () => {
            if (loading) {
                setError('串流連線中斷');
                setLoading(false);
                eventSource.close();
            }
        };
    };

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Search Card */}
            <div className="rounded-xl p-5 sm:p-6" style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
            }}>
                <form onSubmit={handleSearch} className="space-y-5">
                    {/* Keyword Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                搜尋關鍵字
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowTooltip(!showTooltip)}
                                    className="text-slate-600 hover:text-blue-400 transition-colors"
                                >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                </button>
                                {showTooltip && (
                                    <div className="absolute left-0 top-full mt-2 w-72 p-3 rounded-lg text-xs z-50 shadow-xl"
                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                                        <p className="font-semibold text-blue-400 mb-1.5">搜尋語法說明</p>
                                        <div className="space-y-1 font-mono text-[11px]">
                                            <p><span className="text-emerald-400">OR</span> → 聯集：<span className="text-slate-400">AI OR 資安</span></p>
                                            <p><span className="text-amber-400">AND</span> → 交集：<span className="text-slate-400">AI AND 系統</span></p>
                                            <p><span className="text-red-400">NOT</span> → 排除：<span className="text-slate-400">AI NOT 醫療</span></p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <input
                            id="keyword-input"
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="輸入關鍵字，例如：AI AND 系統 OR 資安"
                            className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-600"
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-primary)',
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>

                    {/* Date + Button Row */}
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                        {/* Date Range */}
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                公告日期範圍
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="start-date-input"
                                    type="text"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="flex-1 rounded-lg px-3 py-2.5 text-sm font-mono text-center outline-none transition-all duration-200"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-primary)',
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                                    onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                                />
                                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    id="end-date-input"
                                    type="text"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="flex-1 rounded-lg px-3 py-2.5 text-sm font-mono text-center outline-none transition-all duration-200"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-primary)',
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                                    onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                                />
                            </div>
                        </div>

                        {/* Search Button */}
                        <button
                            id="search-button"
                            type="submit"
                            disabled={loading || !keyword.trim()}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 sm:min-w-[140px]"
                            style={{
                                background: loading || !keyword.trim() ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.12)',
                                border: loading || !keyword.trim() ? '1px solid rgba(59,130,246,0.1)' : '1px solid rgba(59,130,246,0.3)',
                                color: loading || !keyword.trim() ? 'rgba(59,130,246,0.4)' : '#60a5fa',
                                cursor: loading || !keyword.trim() ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!loading && keyword.trim()) {
                                    e.target.style.background = 'rgba(59,130,246,0.2)';
                                    e.target.style.borderColor = 'rgba(59,130,246,0.5)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!loading && keyword.trim()) {
                                    e.target.style.background = 'rgba(59,130,246,0.12)';
                                    e.target.style.borderColor = 'rgba(59,130,246,0.3)';
                                }
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    搜尋中...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    開始搜尋
                                </>
                            )}
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm rounded-lg p-3" style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                        }}>
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </form>
            </div>

            {/* Log Viewer */}
            <LogViewer logs={logs} />
        </div>
    );
};

export default SearchForm;
