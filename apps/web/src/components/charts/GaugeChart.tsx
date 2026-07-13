import { CHART_BAD, CHART_GOOD, CHART_TRACK } from './palette';

export interface GaugeThresholds {
  /** Value at or above which the fill is --chart-good. */
  good: number;
  /** Value at or above which the fill is amber (below `good`). */
  warn: number;
}

export interface GaugeChartProps {
  /** 0..100 */
  value: number;
  label?: string;
  /** Optional 0..100 target marker on the arc. */
  target?: number;
  thresholds?: GaugeThresholds;
}

const VW = 160;
const VH = 96;
const CX = 80;
const CY = 82;
const R = 62;
const THICKNESS = 13;

/** Angle for a 0..100 value: π (left) → 0 (right), drawn over the top. */
function point(v: number, r: number): [number, number] {
  const t = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
}

function arcPath(from: number, to: number, r: number): string {
  const [x0, y0] = point(from, r);
  const [x1, y1] = point(to, r);
  return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
}

/** Semicircle meter 0..100 — fill color carries state via thresholds. */
export function GaugeChart({
  value,
  label,
  target,
  thresholds = { good: 70, warn: 40 },
}: GaugeChartProps) {
  const v = Math.max(0, Math.min(100, value));
  // Fill by state: good / amber (chart slot 3 doubles as the amber var) / bad.
  const fill = v >= thresholds.good ? CHART_GOOD : v >= thresholds.warn ? 'var(--chart-3)' : CHART_BAD;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
      {/* unfilled track */}
      <path
        d={arcPath(0, 100, R)}
        fill="none"
        stroke={CHART_TRACK}
        strokeWidth={THICKNESS}
        strokeLinecap="round"
      />
      {v > 0 && (
        <path
          d={arcPath(0, v, R)}
          fill="none"
          stroke={fill}
          strokeWidth={THICKNESS}
          strokeLinecap="round"
        />
      )}
      {target !== undefined && target >= 0 && target <= 100 && (
        <line
          x1={point(target, R - THICKNESS / 2 - 3)[0]}
          y1={point(target, R - THICKNESS / 2 - 3)[1]}
          x2={point(target, R + THICKNESS / 2 + 3)[0]}
          y2={point(target, R + THICKNESS / 2 + 3)[1]}
          stroke="currentColor"
          strokeWidth={2}
          className="text-grey"
        />
      )}
      {/* big center value in the primary text token, never the fill color */}
      <text
        x={CX}
        y={CY - 8}
        textAnchor="middle"
        fontSize={26}
        fontWeight={600}
        fill="currentColor"
        className="text-navy"
      >
        {Math.round(v)}
      </text>
      {label && (
        <text
          x={CX}
          y={CY + 8}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          className="text-grey"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
