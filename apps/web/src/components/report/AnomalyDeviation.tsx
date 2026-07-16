import { CHART_TRACK } from '@/components/charts';

/** Severity → mark color (matches the SeverityBadge vocabulary). */
const SEVERITY_FILL: Record<'low' | 'medium' | 'high', string> = {
  low: 'var(--chart-1)',
  medium: 'var(--chart-3)',
  high: 'var(--chart-bad)',
};

export interface AnomalyDeviationProps {
  current: number;
  expected: number;
  severity: 'low' | 'medium' | 'high';
}

const W = 130;
const H = 14;
const BAR_H = 6;

/**
 * Deviation bullet for anomaly rows: the current reading as a bar against a
 * track scaled past both values, with the expected level as a tick — the
 * z-score prose gets a visual. Values also render as text next to it (the
 * mark never carries the number alone).
 */
export function AnomalyDeviation({ current, expected, severity }: AnomalyDeviationProps) {
  const max = Math.max(current, expected, 1e-9) * 1.15;
  const x = (v: number) => Math.max(0, Math.min(W, (v / max) * W));
  const barY = (H - BAR_H) / 2;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0"
      role="img"
      aria-label={`Current ${current} vs expected ${Math.round(expected * 100) / 100}`}
    >
      <rect x={0} y={barY} width={W} height={BAR_H} rx={3} fill={CHART_TRACK} />
      <rect x={0} y={barY} width={Math.max(1.5, x(current))} height={BAR_H} rx={3} fill={SEVERITY_FILL[severity]} />
      {/* expected tick */}
      <line
        x1={x(expected)}
        x2={x(expected)}
        y1={0}
        y2={H}
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-navy"
      />
    </svg>
  );
}
