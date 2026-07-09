import { useEffect, useCallback, useRef, useState } from 'react';
import { Shield, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchAuditLog } from '@/lib/api/audit';
import type { AuditEntry } from '@/lib/api/audit';

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'projects', label: 'Projects' },
  { value: 'deals', label: 'Deals' },
  { value: 'scores', label: 'Scores' },
  { value: 'outreach_sequences', label: 'Sequences' },
  { value: 'suppression', label: 'Suppression' },
];

const ACTION_COLORS: Record<string, string> = {
  project_created: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20',
  project_merged: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20',
  score_computed: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20',
  deal_stage_change: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/20',
  handoff_created: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20',
  outreach_paused: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20',
  outreach_enrolled: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20',
  suppression_created: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20',
};

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/20';
  return (
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', color)}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [actor, setActor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchAuditLog({ page, entity: entity || undefined, actor: actor || undefined, signal: controller.signal });
      if (!controller.signal.aborted) {
        setEntries(res.data);
        setTotal(res.meta.total);
        setTotalPages(res.meta.totalPages);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, entity, actor]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy dark:text-ice overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card">
        <h1 className="text-lg font-bold flex items-center gap-1.5">
          <Shield size={17} className="text-cyan-500" />
          Audit Log
        </h1>
        <span className="text-[10px] text-grey font-mono">{total} events</span>
      </div>

      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-card flex-wrap">
        <select
          value={entity}
          onChange={(e) => { setEntity(e.target.value); setPage(1); }}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-grey pointer-events-none" />
          <input
            type="text"
            value={actor}
            onChange={(e) => { setActor(e.target.value); setPage(1); }}
            placeholder="Filter by actor..."
            className="w-40 rounded border border-line bg-ice-soft dark:bg-navy-deep px-7 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-20 text-grey">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              <span className="text-sm">Loading audit log...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-red-500">
            <p className="text-sm font-semibold">Failed to load audit log</p>
            <p className="text-xs mt-1 text-grey">{error}</p>
            <button onClick={load} className="mt-3 rounded border border-red-200 px-3 py-1 text-xs font-bold hover:bg-red-50 transition-colors">Retry</button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-grey">
            <p className="text-sm font-semibold">No audit events found</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line sticky top-0 bg-card">
                <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Time</th>
                <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Actor</th>
                <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Action</th>
                <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Entity</th>
                <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-ice-soft dark:hover:bg-ice-soft/5 transition-colors">
                  <td className="py-2 px-3 text-grey whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-medium">{entry.actor}</td>
                  <td className="py-2 px-3"><ActionBadge action={entry.action} /></td>
                  <td className="py-2 px-3 text-grey">
                    {entry.entity}
                    {entry.projectName && <span className="ml-1">({entry.projectName})</span>}
                  </td>
                  <td className="py-2 px-3 text-grey max-w-[300px] truncate">
                    {entry.meta && typeof entry.meta === 'object' && Object.keys(entry.meta).length > 0
                      ? JSON.stringify(entry.meta).slice(0, 120)
                      : entry.action.replace(/_/g, ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-line bg-card">
          <span className="text-[10px] text-grey">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-line px-2 py-1 text-[10px] font-bold text-grey hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-line px-2 py-1 text-[10px] font-bold text-grey hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLog;
