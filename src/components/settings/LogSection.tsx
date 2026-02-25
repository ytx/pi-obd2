import { useEffect, useState, useRef } from 'react';

interface LogEntry {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-obd-dim',
};

function LogSection() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fetchLogs = () => {
    window.obd2API?.getLogs().then(setLogs);
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filtered = filter
    ? logs.filter(
        (l) =>
          l.tag.toLowerCase().includes(filter.toLowerCase()) ||
          l.message.toLowerCase().includes(filter.toLowerCase()) ||
          l.level.toLowerCase().includes(filter.toLowerCase()),
      )
    : logs;

  const formatTime = (ts: string) => {
    try {
      return ts.replace(/^.*T/, '').replace(/\.\d+Z$/, '');
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-obd-primary">Logs</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-obd-dim">{filtered.length} entries</span>
          <button
            onClick={fetchLogs}
            className="px-2 py-1 text-xs bg-obd-dark text-obd-dim border border-obd-dim rounded hover:bg-obd-dim/30"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder="Filter (tag, message, level)..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-2 py-1 text-xs bg-obd-dark text-white border border-obd-dim rounded"
        />
        <label className="flex items-center gap-1 text-xs text-obd-dim">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-obd-primary"
          />
          Auto-scroll
        </label>
      </div>

      <div
        ref={listRef}
        className="h-64 overflow-auto bg-obd-dark rounded p-2 font-mono text-[11px] leading-tight"
      >
        {filtered.map((l, i) => (
          <div key={i} className="flex gap-1 py-px">
            <span className="text-obd-dim shrink-0">{formatTime(l.timestamp)}</span>
            <span className={`shrink-0 w-10 ${LEVEL_COLOR[l.level] ?? 'text-obd-dim'}`}>
              {l.level}
            </span>
            <span className="text-obd-accent shrink-0 w-16 truncate">{l.tag}</span>
            <span className="text-white break-all">{l.message}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-obd-dim text-center py-4">No logs</p>
        )}
      </div>
    </div>
  );
}

export default LogSection;
