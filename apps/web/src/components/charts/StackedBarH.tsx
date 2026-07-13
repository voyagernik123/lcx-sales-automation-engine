import { seriesVar } from './palette';
import { formatNumber, roundedLeftRect, roundedRightRect } from './utils';
import { ChartTooltip, TipContent, useTooltip } from './tooltip';

export interface StackedSegment {
  label: string;
  value: number;
  /** Per-segment override; defaults to the fixed categorical order (slot i+1). */
  color?: string;
}

export interface StackedBarHProps {
  segments: StackedSegment[];
  formatValue?: (v: number) => string;
}

const VW = 480;
const BAR_H = 20; // ≤24px thick
const GAP = 2; // 2px surface gap between touching segments

/** One horizontal stacked bar for composition/funnels, with legend + tooltips. */
export function StackedBarH({ segments, formatValue = formatNumber }: StackedBarHProps) {
  const { tip, show, hide } = useTooltip();
  const parts = segments.filter((s) => s.value > 0);
  if (parts.length === 0) return null;

  const total = parts.reduce((sum, s) => sum + s.value, 0);
  const usable = VW - GAP * (parts.length - 1);
  let cursor = 0;
  const rects = parts.map((s, i) => {
    const w = (s.value / total) * usable;
    const x = cursor;
    cursor += w + GAP;
    return { ...s, x, w, color: s.color ?? seriesVar(i + 1) };
  });

  return (
    <div className="w-full">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${VW} ${BAR_H}`} className="block w-full" style={{ height: 'auto' }} role="img">
          {rects.map((r, i) => {
            const d =
              rects.length === 1
                ? undefined
                : i === 0
                  ? roundedLeftRect(r.x, 0, r.w, BAR_H)
                  : i === rects.length - 1
                    ? roundedRightRect(r.x, 0, r.w, BAR_H)
                    : undefined;
            const onEnter = () =>
              show(
                ((r.x + r.w / 2) / VW) * 100,
                0,
                <TipContent
                  label={r.label}
                  value={`${formatValue(r.value)} (${Math.round((r.value / total) * 100)}%)`}
                />
              );
            return (
              <g key={i} onMouseEnter={onEnter} onMouseLeave={hide}>
                {rects.length === 1 ? (
                  <rect x={r.x} y={0} width={r.w} height={BAR_H} rx={4} fill={r.color} />
                ) : d ? (
                  <path d={d} fill={r.color} />
                ) : (
                  <rect x={r.x} y={0} width={r.w} height={BAR_H} fill={r.color} />
                )}
                {/* hit target spans the segment plus its gaps, full bar height */}
                <rect
                  x={r.x - GAP / 2}
                  y={0}
                  width={r.w + GAP}
                  height={BAR_H}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
        <ChartTooltip tip={tip} />
      </div>
      {/* legend: always present for ≥2 segments; text in text tokens */}
      {rects.length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {rects.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: r.color }}
                aria-hidden="true"
              />
              <span className="text-grey">{r.label}</span>
              <span className="font-medium text-navy">{formatValue(r.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
