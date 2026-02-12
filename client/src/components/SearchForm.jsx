import React, { useState } from 'react';
import axios from 'axios'; // Still used for other things if needed, but search uses EventSource
import { Search, HelpCircle, Loader2, AlertCircle } from 'lucide-react';
import { format, subDays } from 'date-fns';
import LogViewer from './LogViewer';

const SearchForm = ({ onResults }) => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy/MM/dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy/MM/dd'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setLogs([]);
        onResults([]); // Clear previous results

        // Use EventSource for streaming
        const queryParams = new URLSearchParams({
            keyword,
            startDate,
            endDate
        }).toString();

        const eventSource = new EventSource(`/api/search-stream?${queryParams}`);

        eventSource.onopen = () => {
            setLogs(prev => [...prev, '⚡ Connection established. Initializing search protocols...']);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'log') {
                    setLogs(prev => [...prev, data.message]);
                } else if (data.type === 'complete') {
                    onResults(data.results);
                    setLogs(prev => [...prev, `✅ Process complete. Received ${data.results.length} records.`]);
                    setLoading(false);
                    eventSource.close();
                } else if (data.type === 'error') {
                    setError(data.message);
                    setLogs(prev => [...prev, `❌ Error: ${data.message}`]);
                    setLoading(false);
                    eventSource.close();
                }
            } catch (err) {
                console.error('Parse error', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('EventSource failed:', err);
            // Only set error if we haven't completed (sometimes close triggers error in React dev mode)
            if (loading) {
                // eventSource.close(); // Don't close immediately, let it try to reconnect or user cancel
                // Actually for this use case, error usually means stream died.
                setError('Stream connection interrupted.');
                setLoading(false);
                eventSource.close();
            }
        };
    };

    return (
        <div className="space-y-6">
            <div className="bg-card/50 backdrop-blur-md p-8 rounded-xl shadow-[0_0_20px_rgba(0,255,255,0.05)] border border-cyan-900/50 relative overflow-hidden group">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

                <form onSubmit={handleSearch} className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Keyword Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-cyan-400 tracking-wider flex items-center uppercase">
                                Search Query
                                <div className="group/tooltip relative ml-2">
                                    <HelpCircle className="w-4 h-4 text-cyan-600 cursor-help hover:text-cyan-400 transition-colors" />
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 hidden group-hover/tooltip:block w-72 p-3 bg-black/95 text-xs text-cyan-200 rounded border border-cyan-500/50 shadow-xl backdrop-blur-xl z-50">
                                        支援 "AND", "OR", "NOT" 邏輯。<br />
                                        例如: <code>AI OR 資安</code><br />
                                        系統會自動拆分並執行多次搜尋後合併結果。
                                    </div>
                                </div>
                            </label>
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                placeholder="例如: 電腦 AND 軟體"
                                className="w-full bg-black/40 border border-cyan-900/50 rounded-lg px-4 py-3 text-cyan-100 placeholder-cyan-900/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all"
                            />
                        </div>

                        {/* Date Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-cyan-400 tracking-wider uppercase">Date Range</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-black/40 border border-cyan-900/50 rounded-lg px-4 py-3 text-cyan-100 placeholder-cyan-900/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-center font-mono"
                                />
                                <span className="text-cyan-700 self-center font-bold">TO</span>
                                <input
                                    type="text"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-black/40 border border-cyan-900/50 rounded-lg px-4 py-3 text-cyan-100 placeholder-cyan-900/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-center font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Submit Area */}
                    <div className="flex justify-between items-center pt-2">
                        <div className="text-xs text-cyan-700 font-mono">
                            {loading ? 'STATUS: PROCESSING...' : 'STATUS: READY'}
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`
                                relative group overflow-hidden px-8 py-3 rounded-lg font-bold tracking-wider uppercase transition-all
                                ${loading
                                    ? 'bg-cyan-900/20 text-cyan-700 cursor-not-allowed border border-cyan-900/30'
                                    : 'bg-cyan-500/10 text-cyan-400 hover:text-black border border-cyan-500 hover:bg-cyan-500 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]'}
                            `}
                        >
                            <span className="relative z-10 flex items-center">
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Processing
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4 mr-2" />
                                        Initialize Search
                                    </>
                                )}
                            </span>
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded border border-red-500/30">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                </form>
            </div>

            {/* Log Viewer Component */}
            <LogViewer logs={logs} />
        </div>
    );
};

const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
        const response = await axios.post('/api/search', {
            keyword,
            startDate,
            endDate
        });
        onResults(response.data.data);
    } catch (err) {
        setError('Search failed. Please try again.');
        console.error(err);
    } finally {
        setLoading(false);
    }
};

return (
    <div className="bg-card p-6 rounded-lg shadow-sm border border-gray-800">
        <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center">
                        Keywords
                        <div className="group relative ml-2">
                            <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-xs text-gray-300 rounded border border-gray-700 z-10">
                                支援 "AND", "OR", "NOT" 邏輯。<br />例如: "電腦 AND 軟體"
                            </div>
                        </div>
                    </label>
                    <input
                        type="text"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="例如: 電腦 AND 軟體"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-600"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">日期範圍 (YYYY/MM/DD)</label>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            placeholder="開始日期"
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <span className="text-gray-500 self-center">-</span>
                        <input
                            type="text"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            placeholder="結束日期"
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex justify-end pt-4">
                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            搜尋中...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4 mr-2" />
                            搜尋標案
                        </>
                    )}
                </button>
            </div>
        </form>
    </div>
);
};

export default SearchForm;
