import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Calendar, Clock, Loader2 } from 'lucide-react';

const ScheduleManager = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newKeyword, setNewKeyword] = useState('');
    const [frequency, setFrequency] = useState('daily');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            const response = await axios.get('/api/schedules');
            setJobs(response.data);
        } catch (error) {
            console.error('Failed to fetch jobs', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddJob = async (e) => {
        e.preventDefault();
        if (!newKeyword.trim()) return;

        setAdding(true);
        try {
            await axios.post('/api/schedules', {
                keyword: newKeyword,
                frequency
            });
            setNewKeyword('');
            fetchJobs();
        } catch (error) {
            console.error('Failed to add job', error);
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteJob = async (id) => {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            fetchJobs();
        } catch (error) {
            console.error('Failed to delete job', error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                    <Plus className="w-5 h-5 mr-2" />
                    新增排程
                </h3>
                <form onSubmit={handleAddJob} className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm text-gray-400">關鍵字</label>
                        <input
                            type="text"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="例如: 工程 AND 台北"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="w-48 space-y-2">
                        <label className="text-sm text-gray-400">頻率</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="daily">每天 (09:00)</option>
                            <option value="weekly">每週 (週一 09:00)</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={adding || !newKeyword.trim()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : '新增排程'}
                    </button>
                </form>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-medium text-white flex items-center">
                    <Clock className="w-5 h-5 mr-2" />
                    目前排程
                </h3>

                {loading ? (
                    <div className="text-center py-8 text-gray-500">載入排程中...</div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-900/30 rounded-lg border border-dashed border-gray-800">
                        目前沒有排程。
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {jobs.map((job) => (
                            <div key={job.id} className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 flex justify-between items-center group hover:border-gray-700 transition-all">
                                <div>
                                    <div className="font-medium text-white text-lg">{job.keyword}</div>
                                    <div className="text-sm text-gray-400 flex items-center mt-1">
                                        <Calendar className="w-3 h-3 mr-1" />
                                        {job.frequency === 'daily' ? '每天 09:00' : '每週一 09:00'}
                                        <span className="mx-2">•</span>
                                        建立於: {new Date(job.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteJob(job.id)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    title="Delete Schedule"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScheduleManager;
