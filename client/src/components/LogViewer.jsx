import React, { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

const LogViewer = ({ logs }) => {
    const bottomRef = useRef(null);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!collapsed) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, collapsed]);

    if (logs.length === 0) return null;

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:opacity-80"
                style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
            >
                <div className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-xs font-semibold font-mono tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                        LOGS
                    </span>
                    <span className="badge badge-blue text-[10px]">{logs.length}</span>
                </div>
                {collapsed
                    ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    : <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                }
            </button>

            {!collapsed && (
                <div className="px-4 py-3 max-h-48 overflow-y-auto space-y-0.5">
                    {logs.map((log, index) => (
                        <div key={index} className="flex gap-2 py-0.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                            <span className="flex-shrink-0 select-none" style={{ color: 'var(--text-muted)' }}>
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
