import { History } from 'lucide-react';
import { formatDate } from '@/lib/format';

/**
 * Object history strip (FINAL_MASTER_PLAN 3.4) — objects remember. One
 * compact, uniform timeline for every inspector and workspace: kind chip,
 * what happened, when. Sourced from data the platform already records
 * (deal events, handoff events, messages, audit) — surfacing, not storing.
 */

export interface HistoryEntry {
  ts: string;
  kind: string;
  title: string;
  detail?: string;
}

const KIND_CLS: Record<string, string> = {
  message: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  handoff: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  reply: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  deal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  stage: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  signal: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  discovery: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  sequence: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  audit: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export interface HistoryStripProps {
  entries: HistoryEntry[];
  /** Rows shown before the "+n earlier" line (default 5). */
  max?: number;
  /** Compact heading; pass null to render headerless inside custom sections. */
  title?: string | null;
  loading?: boolean;
}

export function HistoryStrip({ entries, max = 5, title = 'History', loading }: HistoryStripProps) {
  const shown = entries.slice(0, max);
  return (
    <div>
      {title !== null && (
        <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <History size={11} className="text-accent-icon" />
          {title}
        </div>
      )}
      {loading ? (
        <p className="text-micro italic text-grey">Loading history…</p>
      ) : shown.length === 0 ? (
        <p className="text-micro italic text-grey">Nothing recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-micro">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${KIND_CLS[e.kind] ?? KIND_CLS.audit}`}
              >
                {e.kind}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-navy">{e.title}</span>
                {e.detail && <span className="text-grey"> — {e.detail}</span>}
              </div>
              <span className="num-tabular shrink-0 font-mono text-[9px] text-grey">{formatDate(e.ts)}</span>
            </div>
          ))}
          {entries.length > shown.length && (
            <p className="text-[9px] text-grey">+ {entries.length - shown.length} earlier</p>
          )}
        </div>
      )}
    </div>
  );
}
