import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Calendar, Clock, Loader2 } from 'lucide-react';

const DAYS_OF_WEEK = [
    { value: 0, label: '週日' },
    { value: 1, label: '週一' },
    { value: 2, label: '週二' },
    { value: 3, label: '週三' },
    { value: 4, label: '週四' },
    { value: 5, label: '週五' },
    { value: 6, label: '週六' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatTime = (hour, minute) => {
    return `${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`;
};

const getDayLabel = (dow) => {
    const day = DAYS_OF_WEEK.find(d => d.value === dow);
    return day ? day.label : '';
};

const ScheduleManager = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newKeyword, setNewKeyword] = useState('');
    const [frequency, setFrequency] = useState('daily');
    const [hour, setHour] = useState(9);
    const [minute, setMinute] = useState(0);
    const [dayOfWeek, setDayOfWeek] = useState(1);
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
            await axios.post('/api/schedules', {
                keyword: newKeyword,
                frequency,
                hour,
                minute,
                dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
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
        if (!window.confirm('確定刪除此排程？')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            fetchJobs();
        } catch (error) {
            console.error('Failed to delete job', error);
        }
    };

    const getScheduleDescription = (job) => {
        const time = formatTime(job.hour, job.minute);
        if (job.frequency === 'daily') {
            return `每天 ${time} 執行（搜尋當日+前一日公告）`;
        } else {
            return `每${getDayLabel(job.dayOfWeek)} ${time} 執行（搜尋前7日公告）`;
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
                <form onSubmit={handleAddJob} className="space-y-5">
                    {/* Row 1: Keyword */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>關鍵字</label>
                        <input
                            type="text"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="例如: AI AND 系統"
                            className="input-field w-full"
                        />
                    </div>

                    {/* Row 2: Frequency + Time Settings */}
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                        {/* Frequency */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>頻率</label>
                            <select
                                value={frequency}
                                onChange={(e) => setFrequency(e.target.value)}
                                className="input-field appearance-none"
                                style={{ width: 'auto', minWidth: '140px' }}
                            >
                                <option value="daily">每天</option>
                                <option value="weekly">每週</option>
                            </select>
                        </div>

                        {/* Day of Week (only for weekly) */}
                        {frequency === 'weekly' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>星期幾</label>
                                <select
                                    value={dayOfWeek}
                                    onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                                    className="input-field appearance-none"
                                    style={{ width: 'auto', minWidth: '120px' }}
                                >
                                    {DAYS_OF_WEEK.map(d => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Time Picker */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>執行時間</label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={hour}
                                    onChange={(e) => setHour(parseInt(e.target.value, 10))}
                                    className="input-field appearance-none text-center font-mono"
                                    style={{ width: '80px' }}
                                >
                                    {HOURS.map(h => (
                                        <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                                    ))}
                                </select>
                                <span className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>:</span>
                                <select
                                    value={minute}
                                    onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                                    className="input-field appearance-none text-center font-mono"
                                    style={{ width: '80px' }}
                                >
                                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Submit */}
                        <button type="submit" disabled={adding || !newKeyword.trim()} className="btn-primary sm:self-end">
                            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : '新增排程'}
                        </button>
                    </div>

                    {/* Hint */}
                    <div className="text-sm rounded-xl px-4 py-3" style={{
                        background: 'rgba(59,130,246,0.06)',
                        border: '1px solid rgba(59,130,246,0.12)',
                        color: 'var(--text-secondary)',
                    }}>
                        {frequency === 'daily' ? (
                            <>💡 每日排程將自動搜尋<strong style={{ color: '#60a5fa' }}>當日與前一日</strong>公告的標案</>
                        ) : (
                            <>💡 每週排程將自動搜尋<strong style={{ color: '#60a5fa' }}>前 7 日</strong>公告的標案</>
                        )}
                    </div>
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
                            <div key={job.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <span className="text-base font-semibold text-white">{job.keyword}</span>
                                        <span className={`badge ${job.frequency === 'daily' ? 'badge-blue' : 'badge-green'}`}>
                                            {job.frequency === 'daily' ? '每日' : '每週'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>{getScheduleDescription(job)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>建立於 {new Date(job.createdAt).toLocaleDateString('zh-TW')}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteJob(job.id)}
                                    className="btn-danger opacity-60 group-hover:opacity-100 flex-shrink-0"
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
