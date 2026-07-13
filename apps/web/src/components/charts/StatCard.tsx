import { CHART_MUTED } from './palette';
import { Sparkline } from './Sparkline';
import { TrendDelta } from './TrendDelta';

export interface StatCardProps {
  /** Sentence case, no trailing colon. */
  label: string;
  /** Already formatted for display. */
  value: string;
  /** Percent change; renders a TrendDelta chip. */
  delta?: number;
  /** e.g. "vs last week" */
  deltaLabel?: string;
  /** When falling is good (churn, cost), pass false. */
  goodIsUp?: boolean;
  /** Optional trend sparkline, rendered in the muted de-emphasis hue. */
  trend?: number[];
  onClick?: () => void;
}

/** Dashboard stat tile: label / hero-friendly value / delta / muted sparkline. */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  goodIsUp = true,
  trend,
  onClick,
}: StatCardProps) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-grey">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-navy">{value}</div>
        {(delta !== undefined || deltaLabel) && (
          <div className="mt-1 flex items-center gap-1.5">
            {delta !== undefined && <TrendDelta value={delta} goodIsUp={goodIsUp} />}
            {deltaLabel && <span className="text-xs text-grey">{deltaLabel}</span>}
          </div>
        )}
      </div>
      {trend && trend.length > 1 && (
        <Sparkline data={trend} stroke={CHART_MUTED} width={80} height={24} />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-grey-light dark:hover:border-grey"
      >
        {body}
      </button>
    );
  }
  return <div className="rounded-xl border border-line bg-card p-4">{body}</div>;
}
