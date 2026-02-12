import React, { useState } from 'react';
import axios from 'axios';
import { Search, HelpCircle, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';

const SearchForm = ({ onResults }) => {
    const [keyword, setKeyword] = useState('');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy/MM/dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy/MM/dd'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
