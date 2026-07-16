import { CHART_GRID, seriesVar } from './palette';
import { formatNumber, niceTicks } from './utils';
import { ChartTooltip, useTooltip } from './tooltip';

export interface HistogramSeries {
  label: string;
  /** Bin counts, one entry per bin. All series share the same bin edges. */
  counts: number[];
  /** Fill override; defaults to the fixed categorical slot (series i → slot i+1). */
  color?: string;
  /**
   * Optional text-color class the series marks inherit via currentColor —
   * used for the cyan simulation/projection accent. Wins over `color`.
   */
  className?: string;
}

export interface HistogramMarker {
  label: string;
  /** Position in x-domain units (e.g. dollars). */
  value: number;
  /** Text-color class for the marker line + label (defaults to a text token). */
  className?: string;
}

export interface HistogramProps {
  /** [min, max] of the x domain; bins divide it evenly. */
  domain: [number, number];
  /** 1–2 series; a second series renders as a translucent outlined overlay. */
  series: HistogramSeries[];
  markers?: HistogramMarker[];
  height?: number;
  /** Formats x-domain values (bin edges, markers). */
  formatX?: (v: number) => string;
  /** Formats bin counts (tooltips, y ticks). */
  formatCount?: (v: number) => string;
}

const VW = 480;
const ML = 40;
const MR = 8;
const MT = 18; // marker label band
const MB = 18; // x-axis edge labels

/**
 * Distribution histogram: shared-edge bins, ≤24px columns, hairline grid,
 * optional second series overlaid (translucent + outline) and vertical
 * percentile markers. Legend renders for ≥2 series.
 */
export function Histogram({
  domain,
  series,
  markers = [],
  height = 170,
  formatX = formatNumber,
  formatCount = formatNumber,
}: HistogramProps) {
  const { tip, show, hide } = useTooltip();
  const drawn = series.filter((s) => s.counts.length > 0).slice(0, 2);
  if (drawn.length === 0) return null;

  const binCount = Math.max(...drawn.map((s) => s.counts.length));
  const [x0, x1] = domain;
  const span = Math.max(1e-9, x1 - x0);

  const VH = height;
  const plotW = VW - ML - MR;
  const plotH = VH - MT - MB;
  const maxCount = Math.max(1, ...drawn.flatMap((s) => s.counts));
  const ticks = niceTicks(maxCount, 3);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => MT + plotH - (Math.max(0, v) / top) * plotH;
  const xOf = (v: number) => ML + ((v - x0) / span) * plotW;

  const band = plotW / binCount;
  const colW = Math.max(1, Math.min(24, band - 1));

  return (
    <div className="w-full">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
          {/* hairline horizontal gridlines + count ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
              <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
                {formatCount(t)}
              </text>
            </g>
          ))}

          {/* bins: baseline filled, overlay translucent + outlined */}
          {drawn.map((s, si) => (
            <g
              key={si}
              className={s.className}
              fill={s.className ? 'currentColor' : (s.color ?? seriesVar(si + 1))}
              stroke={s.className ? 'currentColor' : (s.color ?? seriesVar(si + 1))}
            >
              {s.counts.map((c, bi) => {
                if (c <= 0) return null;
                const bx = ML + bi * band + (band - colW) / 2;
                const by = y(c);
                const h = MT + plotH - by;
                return (
                  <rect
                    key={bi}
                    x={bx}
                    y={by}
                    width={colW}
                    height={h}
                    rx={1.5}
                    fillOpacity={si === 0 ? 0.85 : 0.35}
                    strokeOpacity={si === 0 ? 0 : 0.9}
                    strokeWidth={si === 0 ? 0 : 1}
                  />
                );
              })}
            </g>
          ))}

          {/* percentile / expected markers */}
          {markers.map((m, i) => {
            const mx = Math.max(ML, Math.min(VW - MR, xOf(m.value)));
            return (
              <g key={i} className={m.className ?? 'text-navy'}>
                <line
                  x1={mx}
                  x2={mx}
                  y1={MT - 2}
                  y2={MT + plotH}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text
                  x={mx}
                  y={MT - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="currentColor"
                >
                  {m.label}
                </text>
              </g>
            );
          })}

          {/* x-axis edge labels */}
          <text x={ML} y={VH - 4} textAnchor="start" fontSize={10} fill="currentColor" className="text-grey">
            {formatX(x0)}
          </text>
          <text x={VW - MR} y={VH - 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
            {formatX(x1)}
          </text>

          {/* hit targets: full bin band, larger than the marks */}
          {Array.from({ length: binCount }, (_, bi) => {
            const bx = ML + bi * band;
            const lo = x0 + (bi / binCount) * span;
            const hi = x0 + ((bi + 1) / binCount) * span;
            const peak = Math.max(...drawn.map((s) => s.counts[bi] ?? 0));
            return (
              <rect
                key={`hit-${bi}`}
                x={bx}
                y={MT}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  show(
                    ((bx + band / 2) / VW) * 100,
                    (y(peak) / VH) * 100,
                    <span>
                      <span className="font-medium">{`${formatX(lo)}–${formatX(hi)}`}</span>
                      {drawn.map((s, si) => (
                        <span key={si}>
                          <span className="opacity-80"> · </span>
                          {s.label} {formatCount(s.counts[bi] ?? 0)}
                        </span>
                      ))}
                    </span>
                  )
                }
                onMouseLeave={hide}
              />
            );
          })}
        </svg>
        <ChartTooltip tip={tip} />
      </div>

      {/* legend: always present for ≥2 series; text in text tokens */}
      {drawn.length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {drawn.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1.5 text-xs">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.className ?? ''}`}
                style={
                  s.className
                    ? { background: 'currentColor', opacity: si === 0 ? 0.85 : 0.5 }
                    : { background: s.color ?? seriesVar(si + 1), opacity: si === 0 ? 0.85 : 0.5 }
                }
                aria-hidden="true"
              />
              <span className="text-grey">{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
