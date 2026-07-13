import { CARD_FILL, CHART_BAD, CHART_GOOD, seriesVar } from './palette';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Line color; defaults to series slot 1. */
  stroke?: string;
  /**
   * When set, the last segment and end-dot are colored with the status
   * colors: true → --chart-good, false → --chart-bad. Unset → stroke color.
   */
  good?: boolean;
  /** Optional area wash under the line at 10% opacity. */
  area?: boolean;
}

/** Tiny trend line: 2px round-capped stroke, ringed end-dot, no axes, no grid. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = seriesVar(1),
  good,
  area = false,
}: SparklineProps) {
  const n = data.length;
  if (n === 0) return null;

  // 5px padding keeps the r=4 end-dot + 2px surface ring inside the viewBox.
  const pad = 5;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = max === min;
  const xs =
    n === 1
      ? [width / 2]
      : data.map((_, i) => pad + (i * (width - pad * 2)) / (n - 1));
  const ys = data.map((v) =>
    flat ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2)
  );
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const endColor = good === undefined ? stroke : good ? CHART_GOOD : CHART_BAD;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      {area && n > 1 && (
        <polygon
          points={`${xs[0]},${height - pad} ${points} ${xs[n - 1]},${height - pad}`}
          fill={stroke}
          opacity={0.1}
        />
      )}
      {n > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {n > 1 && good !== undefined && (
        <line
          x1={xs[n - 2]}
          y1={ys[n - 2]}
          x2={xs[n - 1]}
          y2={ys[n - 1]}
          stroke={endColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      {/* End-dot: r=4 with a 2px ring in the surface color so it stays legible. */}
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r={4} fill={endColor} stroke={CARD_FILL} strokeWidth={2} />
    </svg>
  );
}
