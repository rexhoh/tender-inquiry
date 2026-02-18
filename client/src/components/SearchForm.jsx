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
        <div className="space-y-4">
            <div className="card">
                <form onSubmit={handleSearch} className="space-y-5">

                    {/* Keyword */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label htmlFor="keyword-input" className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                搜尋關鍵字
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowTooltip(!showTooltip)}
                                    className="hover:text-blue-400 transition-colors"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                </button>
                                {showTooltip && (
                                    <div className="absolute left-0 top-full mt-2 w-72 p-3 rounded-lg text-xs z-50 shadow-xl"
                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)', color: 'var(--text-secondary)' }}>
                                        <p className="font-semibold text-blue-400 mb-2">搜尋語法說明</p>
                                        <div className="space-y-1.5 font-mono text-[11px]">
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
                            className="input-field"
                        />
                    </div>

                    {/* Date + Button */}
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
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
                                    className="input-field text-center font-mono"
                                />
                                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                <input
                                    id="end-date-input"
                                    type="text"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="input-field text-center font-mono"
                                />
                            </div>
                        </div>

                        <button
                            id="search-button"
                            type="submit"
                            disabled={loading || !keyword.trim()}
                            className="btn-primary sm:min-w-[140px]"
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
                        <div className="flex items-center gap-2 text-sm rounded-lg p-3"
                            style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#f87171',
                            }}>
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </form>
            </div>

            <LogViewer logs={logs} />
        </div>
    );
};

export default SearchForm;
