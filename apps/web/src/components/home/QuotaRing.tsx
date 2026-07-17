import { CHART_GOOD } from '@/components/charts';
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
 * The personal quota, spoken quietly (plan 4.10): one line, a thin bar, and
 * the session's facts. No rings to fill, no streak chips — the number is the
 * motivation. Reads only the localStorage session contract; absent stats
 * render as an honest zero.
 */
export function QuotaRing({ stats, target, streak }: QuotaRingProps) {
  const worked = stats?.worked ?? 0;
  const pct = target > 0 ? Math.min(1, worked / target) : 0;
  const met = worked >= target;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-micro font-medium uppercase tracking-wide text-grey">Prospects worked</span>
        <span className="num-tabular font-mono text-lg font-semibold text-navy">
          {worked}
          <span className="text-label font-medium text-grey">/{target}</span>
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct * 100}%`, backgroundColor: met ? CHART_GOOD : 'var(--chart-1)' }}
        />
      </div>

      {stats ? (
        <p className="num-tabular text-micro text-grey">
          {stats.enrolled} enrolled · {stats.snoozed} snoozed · {stats.disqualified} disqualified
          {met && <span className="font-semibold text-status-ready"> · quota met</span>}
        </p>
      ) : (
        <p className="text-micro text-grey">No session today.</p>
      )}

      {streak > 1 && <p className="text-micro text-grey/80">{streak} consecutive working days.</p>}
    </div>
  );
}
