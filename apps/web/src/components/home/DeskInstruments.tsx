import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { QueuePulse } from '@/lib/api/loop';
import type { BoardDeal } from '@/lib/api/bd';

/**
 * Home's two lead instruments (FINAL_MASTER_PLAN Part 6): the one-digit
 * stat cards are gone — every screen region carries data. Queue is a
 * four-stream worklist; Pipeline is the open book with its stage shape.
 */

const CARD = 'rounded-xl border border-line/70 bg-card p-5 shadow-card';

interface QueueInstrumentProps {
  pulse: QueuePulse | null;
  repliesWaiting: number | null;
}

export function QueueInstrument({ pulse, repliesWaiting }: QueueInstrumentProps) {
  const navigate = useNavigate();
  const rows = [
    { label: 'Immediate leads', sub: 'band: immediate', value: pulse?.immediate ?? null, to: '/bd-pipeline' },
    { label: 'High-priority leads', sub: 'band: high', value: pulse?.high ?? null, to: '/bd-pipeline' },
    { label: 'Follow-ups due', sub: 'overdue + today', value: pulse?.followUpsDue ?? null, to: '/tasks' },
    { label: 'Replies waiting', sub: 'automation paused', value: repliesWaiting, to: '/outreach' },
  ];
  return (
    <section className={CARD}>
      <h3 className="mb-3 text-[13px] font-semibold tracking-[-0.01em] text-navy">Queue</h3>
      <div className="divide-y divide-line/50">
        {rows.map(r => (
          <button
            key={r.label}
            type="button"
            onClick={() => navigate(r.to)}
            className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-ice-soft/40 dark:hover:bg-ice-soft/[0.06]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold text-navy">{r.label}</span>
              <span className="block text-micro text-grey">{r.sub}</span>
            </span>
            <span className="num-tabular font-mono text-lg font-semibold text-navy">
              {r.value === null ? '—' : r.value}
            </span>
            <ChevronRight size={13} className="shrink-0 text-grey/60" />
          </button>
        ))}
      </div>
    </section>
  );
}

const STAGE_SEGMENTS: { stage: string; label: string; cls: string }[] = [
  { stage: 'not_started', label: 'Not started', cls: 'bg-slate-400' },
  { stage: 'contacted', label: 'Contacted', cls: 'bg-sky-500' },
  { stage: 'discovery', label: 'Discovery', cls: 'bg-cyan-500' },
  { stage: 'proposal', label: 'Proposal', cls: 'bg-violet-500' },
  { stage: 'negotiating', label: 'Negotiating', cls: 'bg-amber-500' },
];

export function PipelineInstrument({ board }: { board: BoardDeal[] | null }) {
  const navigate = useNavigate();
  const open = (board ?? []).filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const totalCents = open.reduce((s, d) => s + (d.packageValue ?? 0), 0);
  const counts = STAGE_SEGMENTS.map(s => ({ ...s, n: open.filter(d => d.stage === s.stage).length }));
  const activeSegments = counts.filter(s => s.n > 0);

  return (
    <section className={CARD}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-navy">Pipeline</h3>
        <button
          type="button"
          onClick={() => navigate('/deal-board')}
          className="text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
        >
          Open the board →
        </button>
      </div>

      {board === null ? (
        <p className="text-micro italic text-grey">Loading…</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="num-hero text-[26px] leading-8 text-navy">
              {formatMoney(Math.round(totalCents / 100))}
            </span>
            <span className="text-label text-grey">
              across <span className="num-tabular font-semibold text-navy">{open.length}</span> open deals
            </span>
          </div>

          {open.length > 0 && (
            <>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                {activeSegments.map(s => (
                  <div key={s.stage} className={s.cls} style={{ width: `${(s.n / open.length) * 100}%` }} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {activeSegments.map(s => (
                  <span key={s.stage} className="flex items-center gap-1.5 text-micro text-grey">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.cls}`} />
                    {s.label} <span className="num-tabular font-semibold text-navy">{s.n}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
