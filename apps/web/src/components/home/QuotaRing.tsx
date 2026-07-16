import { Flame } from 'lucide-react';
import { CHART_GOOD, CHART_TRACK } from '@/components/charts';
import type { SessionStats } from '@/lib/api/loop';

export interface QuotaRingProps {
  /** Today's session stats; null when the queue session hasn't run today. */
  stats: SessionStats | null;
  /** Daily quota of prospects worked. */
  target: number;
  /** Consecutive days with worked > 0. */
  streak: number;
}

/**
 * The personal quota ring (Superhuman-style): an SVG donut of prospects
 * worked today vs the daily target, plus the current streak. Reads only the
 * localStorage session contract — absent stats render as an honest zero.
 */
export function QuotaRing({ stats, target, streak }: QuotaRingProps) {
  const worked = stats?.worked ?? 0;
  const pct = target > 0 ? Math.min(1, worked / target) : 0;
  const hit = worked >= target;

  const r = 52;
  const c = 2 * Math.PI * r;
  const stroke = hit ? CHART_GOOD : 'var(--chart-1)';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[136px] w-[136px]">
        <svg viewBox="0 0 136 136" className="h-full w-full -rotate-90">
          <circle cx="68" cy="68" r={r} fill="none" stroke={CHART_TRACK} strokeWidth="10" />
          <circle
            cx="68"
            cy="68"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
          <span className="text-2xl font-extrabold text-navy">{worked}</span>
          <span className="text-micro font-bold uppercase tracking-wider text-grey">of {target} worked</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-micro font-semibold ${
            streak > 0 ? 'bg-status-ready-bg text-status-ready' : 'bg-ice-soft dark:bg-ice-soft/10 text-grey'
          }`}
        >
          <Flame size={10} />
          {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
        </span>
        {hit && <span className="text-micro font-bold text-status-ready">Quota hit — nice.</span>}
      </div>

      {stats ? (
        <div className="grid w-full grid-cols-3 gap-1.5 text-center">
          <MiniStat label="Enrolled" value={stats.enrolled} />
          <MiniStat label="Snoozed" value={stats.snoozed} />
          <MiniStat label="Disqualified" value={stats.disqualified} />
        </div>
      ) : (
        <p className="text-center text-micro text-grey">
          No session yet today — work the queue and this ring fills up.
        </p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line/70 px-1 py-1.5">
      <div className="num-tabular font-mono text-sm font-bold text-navy">{value}</div>
      <div className="text-micro text-grey">{label}</div>
    </div>
  );
}
