import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Calendar, Clock, Loader2 } from 'lucide-react';

const ScheduleManager = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newKeyword, setNewKeyword] = useState('');
    const [frequency, setFrequency] = useState('daily');
    const [adding, setAdding] = useState(false);

    useEffect(() => { fetchJobs(); }, []);

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
            await axios.post('/api/schedules', { keyword: newKeyword, frequency });
            setNewKeyword('');
            fetchJobs();
        } catch (error) {
            console.error('Failed to add job', error);
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteJob = async (id) => {
        if (!window.confirm('確定刪除此排程？')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            fetchJobs();
        } catch (error) {
            console.error('Failed to delete job', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add Schedule */}
            <div className="card">
                <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-400" />
                    新增排程
                </h3>
                <form onSubmit={handleAddJob} className="flex flex-col sm:flex-row gap-4 sm:items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>關鍵字</label>
                        <input
                            type="text"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="例如: AI AND 系統"
                            className="input-field w-full"
                        />
                    </div>
                    <div className="w-full sm:w-48 space-y-2">
                        <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>頻率</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            className="input-field w-full appearance-none"
                        >
                            <option value="daily">每天 09:00</option>
                            <option value="weekly">每週一 09:00</option>
                        </select>
                    </div>
                    <button type="submit" disabled={adding || !newKeyword.trim()} className="btn-primary">
                        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : '新增'}
                    </button>
                </form>
            </div>

            {/* Current Schedules */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    目前排程
                </h3>

                {loading ? (
                    <div className="text-center py-10 text-base" style={{ color: 'var(--text-muted)' }}>載入排程中...</div>
                ) : jobs.length === 0 ? (
                    <div className="card text-center py-12 text-base" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        尚無排程
                    </div>
                ) : (
                    <div className="space-y-3">
                        {jobs.map((job) => (
                            <div key={job.id} className="card flex items-center justify-between group">
                                <div>
                                    <div className="text-base font-semibold text-white">{job.keyword}</div>
                                    <div className="flex items-center gap-2 mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                                        <Calendar className="w-3.5 h-3.5" />
                                        {job.frequency === 'daily' ? '每天 09:00' : '每週一 09:00'}
                                        <span className="mx-1">•</span>
                                        建立於 {new Date(job.createdAt).toLocaleDateString('zh-TW')}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteJob(job.id)}
                                    className="btn-danger opacity-60 group-hover:opacity-100"
                                    title="刪除排程"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    刪除
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
