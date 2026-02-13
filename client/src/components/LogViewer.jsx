import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

const LogViewer = ({ logs }) => {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    if (logs.length === 0) return null;

    return (
        <div className="mt-6 rounded-lg border border-cyan-500/30 bg-black/80 font-mono text-sm shadow-[0_0_15px_rgba(0,255,255,0.1)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-900/10 px-4 py-2">
                <div className="flex items-center gap-2 text-cyan-400">
                    <Terminal className="h-4 w-4" />
                    <span className="font-bold tracking-wider">SYSTEM_LOGS</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-red-500/50" />
                    <div className="h-2 w-2 rounded-full bg-yellow-500/50" />
                    <div className="h-2 w-2 rounded-full bg-green-500/50" />
                </div>
            </div>

            <div className="p-4 h-48 overflow-y-auto space-y-1">
                {logs.map((log, index) => (
                    <div key={index} className="flex gap-3 text-cyan-200/80 hover:text-cyan-100 hover:bg-cyan-500/5 p-0.5 rounded transition-colors">
                        <span className="text-cyan-600 select-none">[{new Date().toLocaleTimeString()}]</span>
                        <span className="break-all">{log}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default LogViewer;
