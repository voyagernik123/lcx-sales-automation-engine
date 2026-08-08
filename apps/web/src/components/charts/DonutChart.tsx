import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveColour } from './gl/FlatBars';
import { useFlatLine } from './gl/FlatLine';
import { CARD_FILL, seriesVar } from './palette';
import { formatNumber } from './utils';
import { ChartTooltip, TipContent, useTooltip } from './tooltip';

export interface DonutSlice {
  label: string;
  value: number;
  /** Per-slice override; defaults to the fixed categorical order (slot i+1). */
  color?: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  /** Legend placement for ≥2 slices. */
  legend?: 'right' | 'bottom';
  formatValue?: (v: number) => string;
}

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function annularSector(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, r1, a0);
  const [ox1, oy1] = polar(cx, cy, r1, a1);
  const [ix1, iy1] = polar(cx, cy, r0, a1);
  const [ix0, iy0] = polar(cx, cy, r0, a0);
  return [
    `M${ox0},${oy0}`,
    `A${r1},${r1} 0 ${large} 1 ${ox1},${oy1}`,
    `L${ix1},${iy1}`,
    `A${r0},${r0} 0 ${large} 0 ${ix0},${iy0}`,
    'Z',
  ].join(' ');
}

/** Part-to-whole donut: 2px surface gaps between arcs, legend, total center. */
export function DonutChart({
  data,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
  legend = 'right',
  formatValue = formatNumber,
}: DonutChartProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);
  const slices = data.filter((d) => d.value > 0);

  const total = slices.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size / 2 - 1;
  const r0 = r1 - thickness;
  const rMid = (r0 + r1) / 2;
  const start = -Math.PI / 2;

  let acc = 0;
  const arcs = slices.map((s, i) => {
    const a0 = start + (acc / total) * Math.PI * 2;
    acc += s.value;
    const a1 = start + (acc / total) * Math.PI * 2;
    return { ...s, a0, a1, color: s.color ?? seriesVar(i + 1) };
  });

  /* The GL ring, from the SAME `arcs` array the SVG draws — recomputing the angles is how
     two layers come to disagree. The SVG separates sectors with a 2px stroke in the card
     colour; a transparent layer has no surface colour to stroke with, so the same 2px is
     taken out of the SWEEP instead, measured at the mid radius and clamped to a quarter of
     the slice so a thin slice narrows but never vanishes.

     `arc()` takes angles where 0 is 12 o'clock and subtracts PI/2 itself, so the SVG's
     `start = -PI/2` offset is removed here rather than applied twice. */
  const ringArcs = useMemo(() => {
    const el = hostRef.current;
    if (!el || arcs.length === 0) return [];
    const gapRad = arcs.length > 1 ? 2 / Math.max(1, rMid) : 0;
    return arcs.map((a) => {
      const half = Math.min(gapRad / 2, (a.a1 - a.a0) / 4);
      return {
        cx, cy, rInner: r0, rOuter: r1,
        a0: a.a0 - start + half,
        a1: a.a1 - start - half,
        colour: resolveColour(a.color, el),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs.map((a) => `${a.a0},${a.a1},${a.color}`).join('|'), cx, cy, r0, r1, ready]);

  const { canvas: glCanvas, refused: glRefused } = useFlatLine({
    arcs: ringArcs, viewW: size, viewH: size,
  });

  if (slices.length === 0) return null;

  const chart = (
    <div ref={hostRef} className="relative shrink-0" style={{ width: size, height: size }}>
      {glCanvas}
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" className="relative z-10">
        {glRefused && (arcs.length === 1 ? (
          <circle
            cx={cx}
            cy={cy}
            r={rMid}
            fill="none"
            stroke={arcs[0].color}
            strokeWidth={thickness}
          />
        ) : (
          arcs.map((a, i) => (
            /* 2px stroke in the surface color = the surface gap between arcs */
            <path
              key={i}
              d={annularSector(cx, cy, r0, r1, a.a0, a.a1)}
              fill={a.color}
              stroke={CARD_FILL}
              strokeWidth={2}
            />
          ))
        ))}
        {/* hover hit targets: slightly wider than the ring itself */}
        {arcs.map((a, i) => {
          const mid = (a.a0 + a.a1) / 2;
          const [tx, ty] = polar(cx, cy, rMid, mid);
          return (
            <path
              key={`hit-${i}`}
              d={annularSector(
                cx,
                cy,
                Math.max(0, r0 - 6),
                r1 + 1,
                a.a0,
                Math.min(a.a1, a.a0 + Math.PI * 2 - 0.0001)
              )}
              fill="transparent"
              onMouseEnter={() =>
                show(
                  (tx / size) * 100,
                  (ty / size) * 100,
                  <TipContent
                    label={a.label}
                    value={`${formatValue(a.value)} (${Math.round((a.value / total) * 100)}%)`}
                  />
                )
              }
              onMouseLeave={hide}
            />
          );
        })}
        <text
          x={cx}
          y={cy - 1}
          textAnchor="middle"
          fontSize={20}
          fontWeight={600}
          fill="currentColor"
          className="text-navy"
        >
          {centerValue ?? formatValue(total)}
        </text>
        <text
          x={cx}
          y={cy + 15}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          className="text-grey"
        >
          {centerLabel ?? 'Total'}
        </text>
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );

  // Legend is always present for ≥2 slices — identity is never color-alone.
  if (arcs.length < 2) return chart;

  const legendEl = (
    <div className={legend === 'right' ? 'flex min-w-0 flex-col gap-1.5' : 'flex flex-wrap gap-x-4 gap-y-1'}>
      {arcs.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-xs">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: a.color }}
            aria-hidden="true"
          />
          <span className="truncate text-grey">{a.label}</span>
          <span className="font-medium text-navy">{formatValue(a.value)}</span>
        </span>
      ))}
    </div>
  );

  return legend === 'right' ? (
    <div className="flex items-center gap-5">
      {chart}
      {legendEl}
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3">
      {chart}
      {legendEl}
    </div>
  );
}
