import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

const LogViewer = ({ logs, showLogs, onToggle }) => {
    const bottomRef = useRef(null);

    useEffect(() => {
        if (showLogs) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, showLogs]);

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Toggle header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-5 py-3.5 transition-colors hover:opacity-80"
                style={{ borderBottom: showLogs ? '1px solid var(--border)' : 'none' }}
            >
                <div className="flex items-center gap-3">
                    <Terminal className="h-4.5 w-4.5 text-blue-400" />
                    <span className="text-sm font-semibold font-mono tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                        搜尋歷程
                    </span>
                    <span className="badge badge-blue">{logs.length}</span>
                </div>
                <div
                    className={`toggle-switch ${showLogs ? 'active' : ''}`}
                    role="switch"
                    aria-checked={showLogs}
                />
            </button>

            {/* Log content — fixed height with scroll */}
            {showLogs && (
                <div className="px-5 py-4 overflow-y-auto space-y-1" style={{ maxHeight: '240px' }}>
                    {logs.map((log, index) => (
                        <div key={index} className="flex gap-3 py-0.5 text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                            <span className="flex-shrink-0 select-none tabular-nums" style={{ color: 'var(--text-muted)', minWidth: '2rem' }}>
                                {String(index + 1).padStart(3, '0')}
                            </span>
                            <span className="break-all">{log}</span>
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )}
        </div>
    );
};

export default LogViewer;
