import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from './utils';
import { TipContent } from './tooltip';
import { resolveColour, useFlatBars } from './gl/FlatBars';

export interface FunnelStage {
  label: string;
  value: number;
}

export interface FunnelChartProps {
  stages: FunnelStage[];
  formatValue?: (v: number) => string;
}

/** Ordinal ramp: --chart-1 at decreasing opacity, floored at 0.4. */
function stageOpacity(i: number): number {
  const steps = [1, 0.85, 0.7, 0.55, 0.4];
  return steps[Math.min(i, steps.length - 1)];
}

/** A measured bar track, in CSS pixels relative to the chart's own box. */
interface TrackBox { x: number; y: number; w: number; h: number }

/**
 * The card colour behind the bars.
 *
 * Deliberately NOT `resolveColour`, which falls back to brand blue when a token is missing.
 * That is the right fallback for a MARK and a disastrous one here, because this is the
 * colour the ordinal ramp fades toward — a missing token would turn the whole funnel blue
 * instead of leaving the ramp alone.
 */
function resolveCardFill(el: Element): string {
  const v = getComputedStyle(el).getPropertyValue('--card-fill').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff';
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * THE ORDINAL RAMP, RESOLVED TO THE COLOUR THE BROWSER ACTUALLY SHOWS.
 *
 * The DOM bar wears `opacity`, and the GL bar cannot: `BarDatum.colour` is a `Linear`
 * triple with no alpha channel, and the fragment stage writes coverage into alpha. So the
 * ramp is composited here instead — and composited in sRGB, which is where CSS composites
 * `opacity`. Mixing in linear light would be the more physical answer and would make the
 * GL bar a different colour from the fallback bar directly beneath it; the two paths have
 * to agree, because a reader who prints the page must see the same ramp.
 *
 * The ramp is DATA — it is what says "stage 4" — so it is computed before `hexToLinear`
 * and never touched again. Nothing downstream tone maps it.
 */
function rampHex(fg: string, bg: string, o: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return fg;
  const ch = (i: number) =>
    Math.round(b[i] + (f[i] - b[i]) * o).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/**
 * Vertical funnel: horizontal bars scaled so the first stage = 100%, ordinal
 * blue ramp, conversion % between stages, value labels at bar tips.
 */
/**
 * W2 · re-backed. Every number is untouched: the stage values, the step-conversion
 * percentages, the "% of first stage" in the tooltip and the ordinal ramp are exactly what
 * shipped. The ONLY thing that moved is the bar's fill, from a flat CSS rectangle to the
 * GL layer — and it moves back the instant the renderer refuses.
 *
 * ── WHY THIS ONE MEASURES, AND THE SVG PRIMITIVES DO NOT ────────────────────────────
 * The other re-backed charts hand the GL layer their own viewBox, so the two layers cannot
 * drift. This funnel has no viewBox — it is laid out in CSS, and a bar's width is a
 * PERCENTAGE of a flex track whose pixel width nobody knows until the browser has done the
 * layout. So the geometry is read back off the DOM: each track's own rectangle, in CSS
 * pixels relative to the chart. Hard-coding Tailwind's values (`h-6`, `w-28`, `gap-2`)
 * would be one token change away from putting the two layers on different pixels, and the
 * failure would look like a data bug.
 *
 * Until that measurement exists the chart is treated as REFUSED, so the reader sees the DOM
 * bars rather than an empty track waiting for a canvas.
 */
export function FunnelChart({ stages, formatValue = formatNumber }: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* One ref per bar track. The track IS the 100% reference for `pct`, so it is the thing
     that has to be measured — not the chart, and not the row. */
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
  /* Colour tokens do not resolve off-document: `var(--chart-1)` is just a string until the
     host is on the DOM, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [boxes, setBoxes] = useState<readonly TrackBox[]>([]);

  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  /* Values and labels only: a parent that rebuilds its `stages` array on every render must
     not re-measure and repaint a chart whose geometry did not move. */
  const key = stages.map((s) => `${s.label}:${s.value}`).join('|');

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const hb = el.getBoundingClientRect();
      const next: TrackBox[] = [];
      for (let i = 0; i < stages.length; i += 1) {
        const track = trackRefs.current[i];
        if (!track) { setBoxes([]); return; }
        const r = track.getBoundingClientRect();
        // A zero-width track means the chart is display:none or not laid out yet. Report no
        // measurement rather than a degenerate one, and the DOM bars keep the chart honest.
        if (r.width <= 0 || r.height <= 0) { setBoxes([]); return; }
        next.push({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
      }
      setHost({ w: hb.width, h: hb.height });
      setBoxes(next);
    };
    measure();
    // Absent in jsdom and in older Safari. Without it the chart still renders — it just
    // does not follow a resize, and the first measurement stands.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* Hoisted above the empty-stages return below so the hooks that follow always run — the
     hook order may not change between renders. Identical to the original expression for
     every non-empty `stages`, which is the only case that reaches the render. */
  const first = Math.max(1e-9, stages.length > 0 ? stages[0].value : 0);

  /* Bar rectangles in the SAME CSS pixels the browser laid out, so the two layers cannot
     drift. MEMOISED: a fresh array each render would make the GL `draw` a new function each
     render, which re-runs the paint effect on every render. */
  const rects = useMemo(() => {
    const el = hostRef.current;
    if (!el || boxes.length !== stages.length) return [];
    const fg = resolveColour('var(--chart-1)', el);
    const bg = resolveCardFill(el);
    return stages
      .map((s, i) => {
        // The same percentage the DOM bar uses, applied to the same track width.
        const pct = Math.max(0, Math.min(100, (s.value / first) * 100));
        const b = boxes[i];
        return {
          x: b.x, y: b.y, w: b.w * (pct / 100), h: b.h,
          colour: rampHex(fg, bg, stageOpacity(i)),
        };
      })
      .filter((r) => r.w > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, boxes, first, ready]);

  const measured =
    stages.length > 0 && boxes.length === stages.length && host.w > 0 && host.h > 0;

  const { canvas: glCanvas, refused: glRefused } = useFlatBars({
    rects, viewW: host.w, viewH: host.h, orientation: 'horizontal',
  });

  /* THE FALLBACK IS EVERY STATE THAT IS NOT "a GL frame is on screen": server render, print,
     no WebGL2, the first paint, and the frames before the layout has been measured. */
  const refused = glRefused || !measured;

  if (stages.length === 0) return null;

  return (
    <div className="relative w-full" ref={hostRef}>
      {measured && glCanvas}
      {/* An absolutely-positioned canvas paints ABOVE its static siblings whatever the DOM
          order, so the content needs its own layer or the canvas covers every label. ONE
          wrapper rather than one per row, so rows keep stacking against each other — and
          their tooltips keep overlapping their neighbours — exactly as they did. */}
      <div className="relative z-10">
        {stages.map((s, i) => {
          const pct = Math.max(0, Math.min(100, (s.value / first) * 100));
          const conversion =
            i > 0 && stages[i - 1].value > 0
              ? Math.round((s.value / stages[i - 1].value) * 100)
              : null;
          // Only place the value inside the bar when the bar leaves no room outside.
          const valueInside = pct > 80;
          return (
            <div key={i}>
              {conversion !== null && (
                <div className="ml-[7.5rem] py-0.5 text-[11px] leading-4 text-grey">
                  {conversion}% →
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-28 shrink-0 truncate text-xs text-grey" title={s.label}>
                  {s.label}
                </div>
                <div
                  className="relative h-6 flex-1"
                  ref={(el) => { trackRefs.current[i] = el; }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* THE FALLBACK: the bar as it always was, drawn whenever the GL layer is
                      not on screen. Nothing else in this track moved. */}
                  {refused && (
                    <div
                      className="h-6 rounded-r"
                      style={{
                        width: `${pct}%`,
                        background: 'var(--chart-1)',
                        opacity: stageOpacity(i),
                      }}
                    />
                  )}
                  {valueInside ? (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-xs font-medium text-white"
                      style={{ right: `calc(${100 - pct}% + 6px)` }}
                    >
                      {formatValue(s.value)}
                    </span>
                  ) : (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-xs font-medium text-navy"
                      style={{ left: `calc(${pct}% + 6px)` }}
                    >
                      {formatValue(s.value)}
                    </span>
                  )}
                  {hovered === i && (
                    <div
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-navy px-2 py-1 text-xs text-white shadow-lg dark:bg-navy-deep"
                      style={{ left: `${pct / 2}%`, top: -4 }}
                      role="status"
                    >
                      <TipContent
                        label={s.label}
                        value={`${formatValue(s.value)} (${Math.round(pct)}% of ${stages[0].label})`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
