import { useCallback, useEffect, useRef, useState } from 'react';
// TYPE-ONLY, so it is erased at build and the dynamic import below stays the sole entry
// point for @lcx/gl. A value import here would pull the renderer into every page chunk
// that merely mentions a chart.
import type { BarBatch, BarDatum as GlBarDatum, Pipeline, Stage } from '@lcx/gl';
import { useFlatChart } from './useFlatChart';

/**
 * W2 · the GL layer for ONE HORIZONTAL TRACK of touching segments (`StackedBarH`).
 *
 * ── WHY THIS IS NOT `useFlatBars` ───────────────────────────────────────────────────
 * Two things a stacked track needs that the bar hook cannot express, and neither is
 * cosmetic:
 *
 *  1. THE CORNER RADIUS. `useFlatBars` derives it from the chart's height
 *     (`min(6, viewH * 0.02)`), which is right for a column of rows and wrong here: this
 *     chart's whole viewBox IS the bar, 20 units tall, so that formula gives 0.4 and the
 *     track's rounded pill ends — the single most recognisable thing about its silhouette,
 *     and `rx={4}` in the SVG — would square off the moment the GL frame replaced the SVG.
 *     The radius is a caller's decision here, and the caller passes the SVG's own 4.
 *
 *  2. THE ENTRANCE. `useFlatBars` grows each bar from its own x, which is correct when
 *     every bar starts at a shared baseline. In a stacked track a segment's x is a
 *     CUMULATIVE POSITION, not a baseline, so growing each one in place would make the
 *     track assemble out of a comb of widening gaps — motion that describes nothing in the
 *     data. The track has exactly one baseline, x = 0, so the entrance is one wipe across
 *     the whole track and each segment is revealed as the front passes it. That is the
 *     same grammar as W3's "the bar arrives at its value", read at the level of the
 *     composition rather than the piece.
 *
 * ── AND ONE CORRECTNESS DIFFERENCE: THE DRAW IS SYNCHRONOUS ─────────────────────────
 * `sharedRenderer().render(target, draw)` calls `draw`, then immediately blits the shared
 * offscreen buffer into `target`. An `async` draw returns at its first `await` and does its
 * GL work in a later microtask — after that blit has already happened. The blit therefore
 * copies whatever was in the shared buffer BEFORE this chart drew: the previous frame, or
 * on a dashboard, ANOTHER CHART'S IMAGE. So the module is loaded up front here and the
 * frame callback contains no `await`. The dynamic import is kept — it is just moved ahead
 * of the frame instead of inside it — so @lcx/gl still stays out of chunks that never
 * render a chart.
 *
 * ── THE FALLBACK STAYS FREE ─────────────────────────────────────────────────────────
 * `refused` starts true and only clears once a frame has really been drawn, so the SVG
 * below is what a reader sees on the server, in print, without WebGL2, and on first paint.
 * The canvas element is withheld entirely — which keeps `refused` true — whenever this
 * layer could not draw an honest frame: the module has not loaded, there is nothing to
 * draw, or a colour did not resolve to a hex. A canvas that is mounted but cannot paint is
 * the one state that would show the reader an empty chart, and it cannot happen here.
 */

export interface FlatTrackSegment {
  /** In the host SVG's viewBox units, so the two layers cannot drift apart. */
  readonly x: number; readonly y: number;
  readonly w: number; readonly h: number;
  /** Already resolved to `#RRGGBB` — a CSS var means nothing to the renderer. */
  readonly colour: string;
}

export interface FlatTrackProps {
  readonly segments: readonly FlatTrackSegment[];
  /** The host SVG's viewBox, so this layer shares its coordinate space exactly. */
  readonly viewW: number;
  readonly viewH: number;
  /** Corner radius in viewBox units. Defaults to the kit's 4. */
  readonly radius?: number;
}

type GlModule = typeof import('@lcx/gl');

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A HOOK, not a wrapper component, for the same reason `useFlatBars` is one: the SVG's own
 * fallback marks live INSIDE its `<svg>` while the canvas has to sit outside it, so the
 * caller must keep both and gate its marks on `refused` itself.
 */
export function useFlatTrack({ segments, viewW, viewH, radius = 4 }: FlatTrackProps) {
  const [mod, setMod] = useState<GlModule | null>(null);
  useEffect(() => {
    let live = true;
    void import('@lcx/gl').then(
      (m) => { if (live) setMod(m); },
      // A failed chunk load is just another refusal: the SVG is already on screen.
      () => {},
    );
    return () => { live = false; };
  }, []);

  /* The batch and the post chain are built ONCE per stage, not once per frame. Every
     `createBarBatch`/`createPipeline` compiles and links its own programs, and the Stage
     frees them only when it is disposed — building them inside the frame would leak five
     programs per animation frame for the life of the page. */
  const held = useRef<{ stage: Stage; bars: BarBatch; pipeline: Pipeline } | null>(null);
  useEffect(() => () => { held.current?.bars.dispose(); held.current = null; }, []);

  const drawable = mod !== null
    && segments.length > 0
    && segments.every((s) => HEX.test(s.colour) && s.w > 0 && s.h > 0);

  const draw = useCallback(
    (stage: Stage, { t }: { t: number }) => {
      if (!mod || !drawable) return;
      const {
        createBarBatch, createPipeline, plotMatrix, beginAdditive, endPass, hexToLinear, exposure,
      } = mod;

      let kit = held.current;
      if (!kit || kit.stage !== stage) {
        kit?.bars.dispose();
        held.current = null;
        const bars = createBarBatch(stage);
        if ('kind' in bars) return;
        const pipeline = createPipeline(stage);
        if ('kind' in pipeline) { bars.dispose(); return; }
        kit = { stage, bars, pipeline };
        held.current = kit;
      }

      const gl = stage.gl;
      // y0 = viewH, y1 = 0 FLIPS the axis: SVG counts y downward and GL counts it up, and
      // the two layers have to land on the same pixels.
      const mvp = plotMatrix(0, viewW, viewH, 0);

      // ONE WIPE ACROSS THE WHOLE TRACK. See the header: x = 0 is the composition's only
      // baseline, so the front sweeps from it and each segment appears in its own order.
      const front = viewW * t;
      const data: GlBarDatum[] = [];
      for (const s of segments) {
        const x1 = Math.min(s.x + s.w, front);
        if (x1 <= s.x) continue;
        data.push({
          x0: s.x, x1,
          y0: s.y, y1: s.y + s.h,
          // Colour is DATA: linearised and exposed, never tone mapped.
          colour: exposure(hexToLinear(s.colour), 0.62),
        });
      }

      stage.bindTarget(stage.scene);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      beginAdditive(gl);
      kit.bars.draw(mvp, data, {
        orientation: 'horizontal', modelling: 0.52, edgeStops: -0.2, contact: 0.7, radius,
      });
      endPass(gl);
      kit.pipeline.resolve({
        // A TRANSPARENT plate: this layer sits on the card's own background, so painting a
        // plate here would draw a dark rectangle over it.
        plate: [0, 0, 0],
        bloomGain: 0.3,
        threshold: [0.3, 1.1],
        vignetteDepth: 0,
        transparent: true,
      });
    },
    [mod, drawable, segments, viewW, viewH, radius],
  );

  const { canvasRef, refused } = useFlatChart(draw, {
    width: viewW, height: viewH, deps: [mod, drawable, segments, viewW, viewH, radius],
  });

  const canvas = drawable ? (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      aria-hidden="true"
      /* BEHIND the SVG. An absolutely-positioned element paints above its static siblings
         regardless of DOM order, so without an explicit z-index the canvas would cover the
         legend and tooltip of the chart it is supposed to be enhancing. */
      className="pointer-events-none absolute inset-0 -z-0 h-full w-full"
      style={{ display: refused ? 'none' : 'block' }}
    />
  ) : null;

  /* `refused` is what the caller gates its own marks on, so it has to mean "the SVG must
     draw" and not merely "the renderer said no". Withholding the canvas keeps it true on
     the way in; OR-ing `!drawable` keeps it true on the way OUT too, for the case where a
     frame has already painted and then the data stops being drawable. */
  return { canvas, refused: refused || !drawable };
}
