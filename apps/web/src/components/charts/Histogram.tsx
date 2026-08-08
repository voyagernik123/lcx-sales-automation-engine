import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_GRID, seriesVar } from './palette';
import { formatNumber, niceTicks } from './utils';
import { ChartTooltip, useTooltip } from './tooltip';
import { resolveColour, useFlatBars, type FlatBarRect } from './gl/FlatBars';

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
 * The GL layer needs a literal `#RRGGBB`: `hexToLinear` THROWS on anything else, and a throw
 * inside the draw callback would leave a cleared canvas with `refused` already false — a
 * chart in which the reader sees nothing at all. So every colour is normalised here, and
 * anything that will not normalise returns null, which hands the GL layer an empty batch and
 * leaves the SVG bins on screen exactly as they shipped.
 */
function toHex6(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const m = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (!m) return null;
  const parts = (m[1] ?? '').split(/[\s,/]+/).filter(Boolean).map(Number).slice(0, 3);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return `#${parts
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Distribution histogram: shared-edge bins, ≤24px columns, hairline grid,
 * optional second series overlaid (translucent + outline) and vertical
 * percentile markers. Legend renders for ≥2 series.
 *
 * W2 · re-backed. The SVG below is UNCHANGED except that the BASELINE series' `<rect>` bins
 * render only when the GL layer is not drawing them. Every gridline, count tick, x-axis
 * label, hit target, tooltip and legend entry is still SVG — and so, deliberately, are the
 * percentile markers, their dashed rules and their labels, which are the point of this chart
 * and now sit above the lit columns rather than inside them.
 *
 * ── WHY ONLY THE BASELINE SERIES GOES TO GL ─────────────────────────────────────────
 * The overlay series is not a second block of colour: it is a 0.35 fill with a 1px OUTLINE,
 * and that outline is the whole reason a reader can tell scenario from baseline where the
 * two distributions cross. `createBarBatch` draws filled rounded rects with no stroke, and
 * the pass accumulates ADDITIVELY — so an overlay drawn there would lose its outline and
 * BRIGHTEN the overlap instead of letting the reader see through it. Both would destroy the
 * comparison the chart exists to make, so the overlay stays SVG at all times and only the
 * baseline fill — the one mark that is a plain filled column — is re-backed.
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The baseline series may paint through `currentColor` (the cyan simulation accent), which
     no amount of arithmetic can resolve — it has to be read back off the very group that
     carries the class. That group is in the SVG, so the ref points at it. */
  const inkRef = useRef<SVGGElement | null>(null);
  /* Neither a class nor `var(--chart-1)` means anything off-document, so the colour cannot be
     sampled until mount — and it does not stay sampled either. COLOUR IS DATA: the SVG
     re-themes for free because `var(--chart-1)` is re-resolved by the browser, but a hex
     already uploaded to a vertex buffer is not, so a reader toggling dark mode would be left
     comparing light-theme columns against a dark-theme legend swatch. This is the same
     observer `components/competition/StrategicMatrix.tsx` uses, for the same reason. */
  const [inkTick, setInkTick] = useState(0);
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.documentElement;
    setInkTick((n) => n + 1);
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    const obs = new MutationObserver(() => setInkTick((n) => n + 1));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const drawn = series.filter((s) => s.counts.length > 0).slice(0, 2);

  const binCount = drawn.length > 0 ? Math.max(...drawn.map((s) => s.counts.length)) : 1;
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

  /* The baseline columns in the SVG's OWN viewBox units, so the two layers cannot drift.
     MEMOISED against a signature rather than the array identity: `drawn` is a fresh array on
     every render, and keying off it would repaint the canvas on renders that changed no bin. */
  const primary = drawn[0];
  const primarySig = primary
    ? `${primary.counts.join(',')}|${primary.color ?? ''}|${primary.className ?? ''}`
    : '';
  const glBars = useMemo<FlatBarRect[]>(() => {
    if (!primary) return [];
    // `className` wins over `color` in the SVG below; the resolution order here matches it.
    const colour = primary.className
      ? toHex6(inkRef.current ? getComputedStyle(inkRef.current).color : null)
      : toHex6(hostRef.current ? resolveColour(primary.color ?? seriesVar(1), hostRef.current) : null);
    // No resolvable colour ⇒ draw NOTHING in GL. `glDrawing` then stays false and the SVG
    // bins render, which is the same outcome as a refused renderer.
    if (!colour) return [];
    const out: FlatBarRect[] = [];
    primary.counts.forEach((c, bi) => {
      if (c <= 0) return;
      const by = y(c);
      const h = MT + plotH - by;
      if (h <= 0) return;
      out.push({ x: ML + bi * band + (band - colW) / 2, y: by, w: colW, h, colour });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primarySig, band, colW, plotH, top, inkTick]);

  const { canvas: glCanvas, refused: glRefused } = useFlatBars({
    rects: glBars, viewW: VW, viewH: VH, orientation: 'vertical',
  });
  /* THE GATE. Not `!glRefused` alone: a live renderer holding an EMPTY batch draws nothing,
     and hiding the SVG bins against it would show the reader an empty plot. */
  const glDrawing = !glRefused && glBars.length > 0;

  if (drawn.length === 0) return null;

  return (
    <div className="w-full">
      <div className="relative w-full" ref={hostRef}>
        {glCanvas}
        <svg viewBox={`0 0 ${VW} ${VH}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
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
              /* The group renders even when its bins are on the canvas: it is what carries
                 the class the GL colour is read from. */
              ref={si === 0 ? inkRef : undefined}
              className={s.className}
              fill={s.className ? 'currentColor' : (s.color ?? seriesVar(si + 1))}
              stroke={s.className ? 'currentColor' : (s.color ?? seriesVar(si + 1))}
            >
              {/* THE FALLBACK: server render, print, no WebGL2, first paint, an unresolvable
                  colour — and always, for the outlined overlay series. */}
              {(si !== 0 || !glDrawing) && s.counts.map((c, bi) => {
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
