import { useEffect, useMemo, useRef, useState } from 'react';
import { seriesVar } from './palette';
import { resolveColour } from './gl/FlatBars';
import { useFlatTrack, type FlatTrackSegment } from './gl/FlatTrack';
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
const RADIUS = 4; // the SVG's own rx — the track's pill ends are its silhouette

/** Nothing to draw. A module-level constant so the GL layer's deps stay reference-stable. */
const NO_SEGMENTS: readonly FlatTrackSegment[] = [];

/** One horizontal stacked bar for composition/funnels, with legend + tooltips. */
/**
 * W2 · re-backed. The SVG below is UNCHANGED except that its segment `<rect>`/`<path>`
 * marks render only when the GL layer is not drawing. Every label, value, percentage, hit
 * target, tooltip and legend swatch is still SVG/DOM and still exactly what shipped — W0
 * found this primitive correct, and only its flat fill was wrong with it.
 *
 * The one thing to know about the swap: `useFlatBars` cannot draw this chart, because the
 * whole viewBox IS the bar here. Its height-derived corner radius would square off the
 * track's rounded ends, and its per-bar entrance would grow each segment from a cumulative
 * offset that is not a baseline. `useFlatTrack` exists for exactly those two reasons — see
 * its header — and nothing else about the layer differs.
 */
export function StackedBarH({ segments, formatValue = formatNumber }: StackedBarHProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour token cannot resolve until the host is on the DOM — `var(--chart-1)` means
     nothing off-document, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  const parts = segments.filter((s) => s.value > 0);
  const total = parts.reduce((sum, s) => sum + s.value, 0);
  const usable = VW - GAP * (parts.length - 1);
  let cursor = 0;
  const rects = parts.map((s, i) => {
    const w = (s.value / total) * usable;
    const x = cursor;
    cursor += w + GAP;
    return { ...s, x, w, color: s.color ?? seriesVar(i + 1) };
  });

  /* The same rectangles, in the SVG's own viewBox units so the two layers cannot drift,
     with their colours resolved to hex.
     MEMOISED ON THE GEOMETRY ITSELF, not on the `segments` prop: callers build that array
     inline, so keying on it would hand the GL layer a new array every render and repaint
     the canvas on every unrelated re-render of the page. */
  const signature = rects.map((r) => `${r.x}|${r.w}|${r.color}`).join(';');
  const glSegments = useMemo<readonly FlatTrackSegment[]>(() => {
    const host = hostRef.current;
    // Before mount there is no element to resolve against. Returning nothing keeps the GL
    // layer refused, which keeps the SVG on screen — rather than painting a guessed colour.
    if (!host || rects.length === 0) return NO_SEGMENTS;
    return rects.map((r) => ({
      x: r.x, y: 0, w: r.w, h: BAR_H, colour: resolveColour(r.color, host),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  const { canvas: glCanvas, refused: glRefused } = useFlatTrack({
    segments: glSegments, viewW: VW, viewH: BAR_H, radius: RADIUS,
  });

  // AFTER every hook: an early return above them would change the hook order the first time
  // a caller's data goes from empty to non-empty.
  if (parts.length === 0) return null;

  return (
    <div className="w-full">
      <div className="relative w-full" ref={hostRef}>
        {glCanvas}
        <svg viewBox={`0 0 ${VW} ${BAR_H}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
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
                {/* THE FALLBACK: server render, print, no WebGL2, or first paint. */}
                {glRefused &&
                  (rects.length === 1 ? (
                    <rect x={r.x} y={0} width={r.w} height={BAR_H} rx={4} fill={r.color} />
                  ) : d ? (
                    <path d={d} fill={r.color} />
                  ) : (
                    <rect x={r.x} y={0} width={r.w} height={BAR_H} fill={r.color} />
                  ))}
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
