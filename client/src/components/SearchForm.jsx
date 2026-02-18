import React, { useState } from 'react';
import { Search, HelpCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { format, subDays } from 'date-fns';
import LogViewer from './LogViewer';

const SearchForm = ({ onResults }) => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [showTooltip, setShowTooltip] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    // Convert yyyy-MM-dd to yyyy/MM/dd for API
    const toApiDate = (d) => d.replace(/-/g, '/');

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setLogs([]);
        setShowLogs(true);
        onResults([]);

        const queryParams = new URLSearchParams({
            keyword,
            startDate: toApiDate(startDate),
            endDate: toApiDate(endDate),
        }).toString();
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
        <div className="space-y-4">
            <div className="card">
                <form onSubmit={handleSearch} className="space-y-6">

                    {/* Keyword */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label htmlFor="keyword-input" className="text-base font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                搜尋關鍵字
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowTooltip(!showTooltip)}
                                    className="hover:text-blue-400 transition-colors"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    <HelpCircle className="w-4 h-4" />
                                </button>
                                {showTooltip && (
                                    <div className="absolute left-0 top-full mt-2 w-80 p-4 rounded-xl text-sm z-50 shadow-2xl"
                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                                        <p className="font-semibold text-blue-400 mb-2 text-sm">搜尋語法說明</p>
                                        <div className="space-y-2 font-mono text-sm">
                                            <p><span className="text-emerald-400 font-bold">OR</span> → 聯集：<span style={{ color: 'var(--text-muted)' }}>AI OR 資安</span></p>
                                            <p><span className="text-amber-400 font-bold">AND</span> → 交集：<span style={{ color: 'var(--text-muted)' }}>AI AND 系統</span></p>
                                            <p><span className="text-red-400 font-bold">NOT</span> → 排除：<span style={{ color: 'var(--text-muted)' }}>AI NOT 醫療</span></p>
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
                            className="input-field w-full"
                        />
                    </div>

                    {/* Date + Button */}
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-base font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                公告日期範圍
                            </label>
                            <div className="flex items-center gap-3 flex-nowrap w-full">
                                <input
                                    id="start-date-input"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="input-field text-center font-mono flex-1 min-w-0"
                                    style={{ width: 'auto' }}
                                />
                                <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    id="end-date-input"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="input-field text-center font-mono flex-1 min-w-0"
                                    style={{ width: 'auto' }}
                                />
                            </div>
                        </div>

                        <button
                            id="search-button"
                            type="submit"
                            disabled={loading || !keyword.trim()}
                            className="btn-primary sm:min-w-[160px]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    搜尋中...
                                </>
                            ) : (
                                <>
                                    <Search className="w-5 h-5" />
                                    開始搜尋
                                </>
                            )}
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-3 text-base rounded-xl p-4"
                            style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#f87171',
                            }}>
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </form>
            </div>

            {/* Log toggle + viewer */}
            {logs.length > 0 && (
                <LogViewer logs={logs} showLogs={showLogs} onToggle={() => setShowLogs(!showLogs)} />
            )}
        </div>
    );
};

export default SearchForm;
