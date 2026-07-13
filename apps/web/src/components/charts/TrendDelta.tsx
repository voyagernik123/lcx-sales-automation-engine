import { CHART_BAD, CHART_GOOD } from './palette';

export interface TrendDeltaProps {
  /** Percent change; 0 / null / undefined renders an em dash. */
  value: number | null | undefined;
  /** When false, a falling value is the good direction (e.g. churn, cost). */
  goodIsUp?: boolean;
}

/** Inline delta chip: ▲/▼ + percent, colored good/bad (vars swap in dark). */
export function TrendDelta({ value, goodIsUp = true }: TrendDeltaProps) {
  if (value === null || value === undefined || value === 0) {
    return <span className="text-xs text-grey">—</span>;
  }
  const up = value > 0;
  const good = up === goodIsUp;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: good ? CHART_GOOD : CHART_BAD }}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
