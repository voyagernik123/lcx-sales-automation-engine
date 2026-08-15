import { useCallback, useEffect, useRef, useState } from 'react';
// TYPE-ONLY, so it is erased at build and the dynamic imports below stay the sole entry
// points into @lcx/gl. A value import here would pull the renderer into every page chunk
// that merely mentions a chart.
import type { StrokeBatch } from '@lcx/gl/flat/strokes.js';
import type { Pipeline } from '@lcx/gl/look/pipeline.js';
import type { Stage } from '@lcx/gl/stage.js';
import { useFlatChart } from './useFlatChart';

/**
 * W2 · the GL layer for ONE DIAL — a band swept between two angles, with the filled part
 * and the unfilled track meeting at the value (`GaugeChart`).
 *
 * ── WHY THIS IS NOT `useFlatRing` ───────────────────────────────────────────────────
 * A donut's slices ABUT; a gauge's two arcs OVERLAP. The SVG draws the whole 0..100 track
 * and then paints the value arc on top of it, which is correct under source-over and
 * catastrophic under the additive pass this renderer uses: the covered part of the track
 * would be SUMMED with the fill, and the filled region would come out a brighter,
 * different hue than the fill colour — a colour that says something about the data and
 * isn't true. So this layer never overlaps them. It draws the fill from the start of the
 * scale to the value, and the track from the value to the end of the scale, and the two
 * meet on one radial line. The resulting pixels are what the SVG's stack resolves to
 * anyway; the difference is only that nothing is drawn twice.
 *
 * That is also why the dial's semantics live in this hook rather than in a generic list of
 * arcs: during the entrance the boundary between fill and track MOVES, and the track has to
 * recede as the fill grows. A caller handing over two independent arcs could not express
 * that without leaving an unpainted wedge between them on every frame of the sweep.
 *
 * ── THE ENTRANCE ────────────────────────────────────────────────────────────────────
 * The fill sweeps from the start of the scale to the value; the band is complete at every
 * value of `t`, so the reader watches the needle arrive rather than watching a gauge
 * assemble. Same grammar as W3's "the bar arrives at its value". Under reduced motion
 * `useFlatChart` hands us t = 1 on the first frame and there is no movement at all.
 *
 * ── THE DRAW IS SYNCHRONOUS, AND THAT IS A CORRECTNESS RULE ─────────────────────────
 * `sharedRenderer().render(target, draw)` calls `draw` and then IMMEDIATELY blits the shared
 * offscreen buffer into `target`. An `async` draw returns at its first `await` and does its
 * GL work in a later microtask, after that blit has happened — so the blit copies whatever
 * was in the shared buffer before this chart drew: the previous frame, or on a dashboard,
 * another chart's image. The modules are therefore loaded up front and the frame callback
 * contains no `await`. The dynamic imports are kept, just moved ahead of the frame, so
 * @lcx/gl still stays out of chunks that never render a chart.
 *
 * ── THE FALLBACK STAYS FREE ─────────────────────────────────────────────────────────
 * `refused` starts true and only clears once a frame has really been drawn, so the SVG is
 * what a reader sees on the server, in print, without WebGL2 and on first paint. The canvas
 * element is withheld entirely — which keeps `refused` true — whenever this layer could not
 * draw an honest frame: the module has not loaded, the geometry is degenerate, or a colour
 * did not resolve to a hex. A canvas that is mounted but cannot paint is the one state that
 * would show the reader an empty gauge, and it cannot happen here.
 */

export interface FlatDialProps {
  /** Centre and band radii, in the host SVG's viewBox units so the layers cannot drift. */
  readonly cx: number; readonly cy: number;
  readonly rInner: number; readonly rOuter: number;
  /**
   * The scale, in radians with 0 = 12 o'clock increasing clockwise — `@lcx/gl`'s dial
   * convention. `a0` is the zero end of the scale, `a1` its full end.
   */
  readonly a0: number; readonly a1: number;
  /** Where the fill ends. Equal to `a0` means "nothing filled", and nothing is drawn. */
  readonly aValue: number;
  /** Both already resolved to `#RRGGBB` — a CSS var means nothing to the renderer. */
  readonly trackColour: string;
  readonly valueColour: string;
  /** The host SVG's viewBox, so this layer shares its coordinate space exactly. */
  readonly viewW: number;
  readonly viewH: number;
}

/**
 * ── FIVE SPECIFIERS, NOT ONE BARREL, AND THE REASON IS NOT TREE-SHAKING ─────────────────
 * `docs/3d/w2/SUBPATH_COST.md` measured all three candidate fixes. Named imports from the
 * barrel shake to within FOUR BYTES of importing the same names from their own modules, and
 * destructuring at the call site was measured NOT fixing this (68.9 KiB, still carrying the
 * raymarcher). Rollup groups a module by the set of ENTRIES that reach it, so while a chart
 * route and a relief route both resolve to `src/index.ts` the union of the two lanes is one
 * chunk by construction. SPECIFIER IDENTITY is the only lever.
 *
 * Measured on `apps/web/dist` before this changed: the three flat adapters that ARE in the
 * shipped bundle fetched 13 GL chunks and 100,709 B, including `lit`, `ao`, `dof` and the
 * volumetric raymarcher, none of which a two-arc band can execute; after, 8 chunks and 27,337 B.
 *
 * ── NO SAVING IS CLAIMED FOR THIS FILE, BECAUSE IT IS NOT IN THE BUNDLE ─────────────
 * `GaugeChart` is exported from `components/charts/index.ts` and imported by no route, so Rollup
 * shakes it and this hook out entirely — neither appears in any sourcemap of either build. The
 * migration below is therefore UNMEASURED: it is what the first route to render a gauge will get,
 * and it is written now precisely so that route does not silently re-import the barrel and undo
 * the other three. Saying it saved bytes today would be a claim about code that does not ship.
 */
interface DialKit {
  readonly createStrokeBatch: typeof import('@lcx/gl/flat/strokes.js')['createStrokeBatch'];
  /** `plotMatrix` lives in `flat/bars.js`, so a dial pays for the bar module's specifier too. */
  readonly plotMatrix: typeof import('@lcx/gl/flat/bars.js')['plotMatrix'];
  readonly createPipeline: typeof import('@lcx/gl/look/pipeline.js')['createPipeline'];
  readonly beginAdditive: typeof import('@lcx/gl/stage.js')['beginAdditive'];
  readonly endPass: typeof import('@lcx/gl/stage.js')['endPass'];
  readonly hexToLinear: typeof import('@lcx/gl/look/colour.js')['hexToLinear'];
  readonly exposure: typeof import('@lcx/gl/look/colour.js')['exposure'];
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A HOOK, not a wrapper component, for the same reason `useFlatBars` is one: the SVG's own
 * fallback marks live INSIDE its `<svg>` while the canvas has to sit outside it, so the
 * caller must keep both and gate its marks on `refused` itself.
 */
export function useFlatDial({
  cx, cy, rInner, rOuter, a0, a1, aValue, trackColour, valueColour, viewW, viewH,
}: FlatDialProps) {
  /* `Promise.all` and not five awaits: the kit is set ONCE, so the frame can never run against
     a half-built kit. A rejection on any one of them leaves `mod` null, which keeps `drawable`
     false, keeps the canvas unmounted and keeps `refused` true. */
  const [mod, setMod] = useState<DialKit | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      import('@lcx/gl/flat/strokes.js'),
      import('@lcx/gl/flat/bars.js'),
      import('@lcx/gl/look/pipeline.js'),
      import('@lcx/gl/stage.js'),
      import('@lcx/gl/look/colour.js'),
    ]).then(
      ([strokes, bars, pipe, stage, colour]) => {
        if (!live) return;
        /* Named one by one rather than spread. A spread of the namespaces would retain every
           export of all five modules — the same "a retained namespace has no unused exports"
           that SUBPATH_COST.md §3 measured as what defeated the split in the first place. */
        setMod({
          createStrokeBatch: strokes.createStrokeBatch,
          plotMatrix: bars.plotMatrix,
          createPipeline: pipe.createPipeline,
          beginAdditive: stage.beginAdditive,
          endPass: stage.endPass,
          hexToLinear: colour.hexToLinear,
          exposure: colour.exposure,
        });
      },
      // A failed chunk load is just another refusal: the SVG is already on screen.
      () => {},
    );
    return () => { live = false; };
  }, []);

  /* The batch and the post chain are built ONCE per stage, not once per frame. Every
     `createStrokeBatch`/`createPipeline` compiles and links its own programs and the Stage
     frees them only when it is disposed, so building them inside the frame would leak
     programs on every animation frame for the life of the page. */
  const held = useRef<{ stage: Stage; strokes: StrokeBatch; pipeline: Pipeline } | null>(null);
  useEffect(() => () => { held.current?.strokes.dispose(); held.current = null; }, []);

  const drawable = mod !== null
    && HEX.test(trackColour) && HEX.test(valueColour)
    && rOuter > rInner && rInner >= 0
    && a1 > a0
    && aValue >= a0 && aValue <= a1;

  const draw = useCallback(
    (stage: Stage, { t }: { t: number }) => {
      if (!mod || !drawable) return;
      const {
        createStrokeBatch, createPipeline, plotMatrix, beginAdditive, endPass, hexToLinear, exposure,
      } = mod;

      let kit = held.current;
      if (!kit || kit.stage !== stage) {
        kit?.strokes.dispose();
        held.current = null;
        const strokes = createStrokeBatch(stage);
        if ('kind' in strokes) return;
        const pipeline = createPipeline(stage);
        if ('kind' in pipeline) { strokes.dispose(); return; }
        kit = { stage, strokes, pipeline };
        held.current = kit;
      }

      const gl = stage.gl;

      /* ── WHY THE GEOMETRY IS SCALED DOWN BEFORE IT IS DRAWN ────────────────────────
         `arc` picks its segment count from the arc LENGTH — `128 * max(0.35, rOuter)` —
         which presumes a plot space about one unit across. Handed a radius in viewBox
         pixels (68.5, for a 160px gauge) it would ask for thousands of segments for a band
         whose facets are already invisible at a few dozen, and re-upload that every frame.

         Dividing EVERY coordinate and the plot rect by the same scalar is an exact no-op on
         the projection: plotMatrix maps x to 2x/X − 1, so (x/s) against a rect of (X/s) is
         the identical NDC. The layers still cannot drift; only the number the segment
         heuristic reads changes, and it now reads what it was written for. */
      const s = Math.max(viewW, viewH) || 1;
      // y0 = viewH, y1 = 0 FLIPS the axis: SVG counts y downward and GL counts it up, and
      // the two layers have to land on the same pixels.
      const mvp = plotMatrix(0, viewW / s, viewH / s, 0);

      // The boundary between fill and track. It is the ONE number that moves during the
      // entrance, and both arcs read it, which is what keeps the band whole on every frame.
      const front = a0 + (aValue - a0) * t;
      const EPS = 1e-4;

      stage.bindTarget(stage.scene);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      beginAdditive(gl);
      if (front - a0 > EPS) {
        kit.strokes.arc(mvp, cx / s, cy / s, rInner / s, rOuter / s, a0, front, {
          // Colour is DATA: linearised and exposed, never tone mapped.
          colour: exposure(hexToLinear(valueColour), 0.62),
          modelling: 0.52,
        });
      }
      if (a1 - front > EPS) {
        kit.strokes.arc(mvp, cx / s, cy / s, rInner / s, rOuter / s, front, a1, {
          // The track is the SCALE, not a measurement — but it shares the fill's light, or
          // the two halves of one band would read as sitting on different surfaces.
          colour: exposure(hexToLinear(trackColour), 0.62),
          modelling: 0.52,
        });
      }
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
    [mod, drawable, cx, cy, rInner, rOuter, a0, a1, aValue, trackColour, valueColour, viewW, viewH],
  );

  const { canvasRef, refused } = useFlatChart(draw, {
    width: viewW,
    height: viewH,
    deps: [mod, drawable, cx, cy, rInner, rOuter, a0, a1, aValue, trackColour, valueColour, viewW, viewH],
  });

  const canvas = drawable ? (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      aria-hidden="true"
      /* BEHIND the SVG. An absolutely-positioned element paints above its static siblings
         regardless of DOM order, so without an explicit z-index the canvas would cover the
         big centre number, the label and the target tick it is supposed to sit behind. */
      className="pointer-events-none absolute inset-0 -z-0 h-full w-full"
      style={{ display: refused ? 'none' : 'block' }}
    />
  ) : null;

  /* `refused` is what the caller gates its own marks on, so it has to mean "the SVG must
     draw" and not merely "the renderer said no". Withholding the canvas keeps it true on the
     way in; OR-ing `!drawable` keeps it true on the way OUT too, for the case where a frame
     has already painted and then the geometry or a colour stops being drawable. */
  return { canvas, refused: refused || !drawable };
}
