import React, { useEffect, useState, useRef, useCallback } from 'react';
// Removed unused import

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
}

export const useDebugConsole = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((message: string, level: LogLevel = 'info') => {
        const entry: LogEntry = {
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toLocaleTimeString(),
            level,
            message
        };
        setLogs(prev => [entry, ...prev].slice(0, 50)); // Keep last 50
    }, []);

    return { logs, addLog };
};

export function DebugConsole({ logs }: { logs: LogEntry[] }) {
    const [isOpen, setIsOpen] = useState(true);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 z-50 bg-black/80 text-white/50 text-xs px-2 py-1 rounded border border-white/10 hover:text-white"
            >
                Debug Logs
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 left-4 z-50 w-80 max-h-60 flex flex-col bg-black/90 border border-white/20 rounded-lg shadow-2xl font-mono text-[10px] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10">
                <span className="font-bold text-white/70">SYSTEM_DIAGNOSTICS</span>
                <button onClick={() => setIsOpen(false)} className="text-white/40 hover:text-white">_</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {logs.length === 0 && <div className="text-white/20 italic">Ready...</div>}
                {logs.map(log => (
                    <div key={log.id} className="flex gap-2">
                        <span className="text-white/30 shrink-0">[{log.timestamp}]</span>
                        <span className={`
                        ${log.level === 'error' ? 'text-red-400 font-bold' : ''}
                        ${log.level === 'warning' ? 'text-yellow-400' : ''}
                        ${log.level === 'success' ? 'text-green-400' : ''}
                        ${log.level === 'info' ? 'text-blue-300' : ''}
                    `}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
