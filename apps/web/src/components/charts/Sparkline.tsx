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

/**
 * Tiny trend line: 2px round-capped stroke, ringed end-dot, no axes, no grid.
 *
 * ── THIS IS SVG, AND THE GL LAYER WAS REMOVED FROM IT. THE NUMBERS: ─────────────────────
 * It was GL-backed at `38c01b1` and is not any more, because the measured SVG/GL threshold
 * (`docs/3d/w2/SVG_GL_THRESHOLD.md`) rejects it on both halves of its value gate, and the
 * second half is a legibility REGRESSION rather than a neutral cost:
 *
 *  1. L = 4.6 DEVICE PX. The lit edge is the first 10 % of a mark's lit axis, and for a ribbon
 *     that axis is `2 · halfWidth` — 2.3 units, 4.6 device px at dpr 2. Ten per cent of that
 *     is under half a pixel. The stroke shader has no lit-edge term at all (`flat/strokes.ts`
 *     carries only the feather and `shade = 1 − uModelling · vAcross²`), so what the layer
 *     could contribute here was already just a feather — and SVG's rasteriser supplies exactly
 *     the same one-pixel feather for free. `FlatLine` also resolves with `bloomGain: 0`, so
 *     the one remaining differentiator was deliberately switched off.
 *  2. IT DELIVERED 56.8 % OF THE INK. `polyline` is emitted with `uSoft = 1`, so
 *     `edge = smoothstep(1.0, 0.0, |vAcross|)` spans the whole ribbon and there is no opaque
 *     core; `∫₋₁¹ smoothstep(1,0,|x|) dx = 1.0` in `across` units makes the effective ink
 *     width exactly `halfWidth`. At `halfWidth: 1.15` against this `strokeWidth={2}` that is
 *     57.5 % on paper — and rasterising both arms on an M1 measured **56.8 %** (2.314 device
 *     px of cross-section against 4.000). The GL sparkline was LIGHTER than this polyline, on
 *     the most numerous chart surface in the product.
 *
 * `apps/web/src/components/charts/__tests__/glThreshold.test.ts` is what keeps it that way:
 * it fails if any chart is wired to the GL path with a ribbon below the floor, or with a
 * `halfWidth` under the `strokeWidth` it stands in for.
 */
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
