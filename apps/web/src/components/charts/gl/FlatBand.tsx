import { useCallback, useEffect, useRef, useState } from 'react';
// TYPE-ONLY, so it is erased at build and the dynamic import below stays the sole entry
// point for @lcx/gl. A value import here would pull the renderer into every page chunk
// that merely mentions a chart.
import type { Pipeline, Stage, StrokeBatch } from '@lcx/gl';
import { useFlatChart } from './useFlatChart';

/**
 * W2 · the GL layer for `ControlBand`'s LINE series — the centre line and the actual
 * overlay. Sibling of `FlatBars`/`FlatTrack`, same contract, different geometry.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DRAW: THE ENVELOPE ──────────────────────────────
 * `ControlBand`'s band is a 14 %-opacity tint between two DIFFERENT polylines, and neither
 * half of that is expressible here. `createStrokeBatch.area` takes a single scalar
 * `baselineY`, so its lower edge is a horizontal line — a lo series that moves would be
 * flattened to a constant, which is a change to a NUMBER and not to a fill. And an additive
 * pass writes full coverage into the frame's alpha, so even a correctly-shaped envelope
 * would land on the card as a solid block of hue rather than a wash. The band therefore
 * stays SVG on both paths; see the note at its `<path>` in `ControlBand.tsx`. `Sparkline`
 * declined its own 10 % wash for the second of those two reasons.
 *
 * ── WHY THE DRAW IS SYNCHRONOUS ─────────────────────────────────────────────────────
 * `sharedRenderer().render(target, draw)` calls `draw`, then IMMEDIATELY blits the shared
 * offscreen buffer into `target`. An `async` draw returns at its first `await` and does its
 * GL work in a later microtask — after that blit has already happened — so the blit copies
 * whatever the shared buffer held before this chart drew: the previous frame, or on a
 * dashboard, another chart's image. The module is therefore loaded up front and the frame
 * callback contains no `await`. The dynamic import is kept, just moved ahead of the frame,
 * so @lcx/gl still stays out of chunks that never render a chart.
 *
 * ── WHY THERE IS NO ENTRANCE ────────────────────────────────────────────────────────
 * A bar's entrance is honest because a bar grows from a baseline it really has. A time
 * series has none; the only entrance that would carry data is a left-to-right reveal, and
 * that reveal cannot be applied to the marks this chart keeps ungated — the envelope, the
 * isolated-reading dots, the axis. A frame where the two layers disagree about how much of
 * the series exists is worse than no motion at all, so this draws once. `useFlatChart`
 * still owns the reduced-motion and refusal behaviour; only the tween is declined.
 */

/** A hex the GL layer can actually parse. Anything else and this layer stands down. */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

export interface FlatBandStroke {
  /** Flat x,y pairs in the host SVG's viewBox units, so the layers cannot drift apart. */
  readonly points: Float32Array;
  /** `#RRGGBB`, already resolved from its CSS token — a var means nothing to the renderer. */
  readonly colour: string;
  /**
   * Half the stroke width in viewBox units — but see the caller's note before setting it to
   * half the SVG's `stroke-width`. The ribbon is feathered across its FULL width, so the two
   * are not the same number.
   */
  readonly halfWidth: number;
  /** Cross-stroke shading, 0–1. Kept low on thin lines. */
  readonly modelling?: number;
}

export interface FlatBandProps {
  readonly strokes: readonly FlatBandStroke[];
  /** The host SVG's viewBox, so this layer shares its coordinate space exactly. */
  readonly viewW: number;
  readonly viewH: number;
}

type GlModule = typeof import('@lcx/gl');

/**
 * A HOOK, not a wrapper component, for the same reason `useFlatBars` is one: the SVG's own
 * fallback marks live INSIDE its `<svg>` while the canvas has to sit outside it, so the
 * caller must keep both and gate its marks on `refused` itself.
 */
export function useFlatBand({ strokes, viewW, viewH }: FlatBandProps) {
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
     `createStrokeBatch`/`createPipeline` compiles and links its own programs and the Stage
     frees them only when it is disposed, so building them inside the frame would leak four
     programs per animation frame for the life of the page. */
  const held = useRef<{ stage: Stage; batch: StrokeBatch; pipeline: Pipeline } | null>(null);
  useEffect(() => () => { held.current?.batch.dispose(); held.current = null; }, []);

  /*
   * THE LAYER STANDS DOWN RATHER THAN DRAWING A HOLE.
   *
   * `hexToLinear` THROWS on anything that is not `#RRGGBB` — deliberately, because a
   * silently-black brand colour survives review. Thrown from inside the draw it would take
   * the frame with it while `useFlatChart` had already flipped `refused` to false: the SVG
   * marks would be gated off and the GL line would never arrive. So an unresolvable colour
   * is decided HERE, before a frame exists, and the answer is that this layer never turns
   * on and the SVG keeps drawing. The same gate covers the pre-mount pass, when tokens like
   * `var(--chart-1)` cannot be resolved yet and the caller has nothing to hand us.
   */
  const drawable = mod !== null
    && strokes.length > 0
    && strokes.every((s) => HEX6.test(s.colour) && s.points.length >= 4 && s.halfWidth > 0);

  const draw = useCallback(
    (stage: Stage) => {
      if (!mod || !drawable) return;
      const {
        createStrokeBatch, createPipeline, plotMatrix, beginAdditive, endPass, hexToLinear, exposure,
      } = mod;

      let kit = held.current;
      if (!kit || kit.stage !== stage) {
        kit?.batch.dispose();
        held.current = null;
        const batch = createStrokeBatch(stage);
        if ('kind' in batch) return;
        const pipeline = createPipeline(stage);
        if ('kind' in pipeline) { batch.dispose(); return; }
        kit = { stage, batch, pipeline };
        held.current = kit;
      }

      const gl = stage.gl;
      // y0 = viewH, y1 = 0 FLIPS the axis: SVG counts y downward and GL counts it up, and
      // the two layers have to land on the same pixels.
      const mvp = plotMatrix(0, viewW, viewH, 0);

      stage.bindTarget(stage.scene);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      beginAdditive(gl);
      for (const s of strokes) {
        kit.batch.polyline(mvp, s.points, {
          // Colour is DATA: linearised and exposed, never tone mapped.
          colour: exposure(hexToLinear(s.colour), 0.62),
          halfWidth: s.halfWidth,
          /* Modelling runs ACROSS the stroke, so on a two-unit line it competes with the
             feather for the same pixels. Kept gentle: enough to read as a wire catching
             light, not enough to eat the core. */
          modelling: s.modelling ?? 0.22,
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
    [mod, drawable, strokes, viewW, viewH],
  );

  const { canvasRef, refused } = useFlatChart(draw, {
    width: viewW,
    height: viewH,
    // See the header: one frame, no tween.
    entranceMs: 0,
    deps: [mod, drawable, strokes, viewW, viewH],
  });

  const off = refused || !drawable;

  const canvas = drawable ? (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      aria-hidden="true"
      /* BEHIND the SVG. An absolutely-positioned element paints above its static siblings
         regardless of DOM order, so without an explicit z-index the canvas would cover the
         axis, the envelope and the tooltip of the chart it is supposed to be enhancing. */
      className="pointer-events-none absolute inset-0 -z-0 h-full w-full"
      style={{ display: off ? 'none' : 'block' }}
    />
  ) : null;

  /* `refused` is what the caller gates its SVG marks on, so it has to mean "the SVG must
     draw" and not merely "the renderer said no". Withholding the canvas keeps it true on the
     way in; OR-ing `!drawable` keeps it true on the way OUT too, for the case where a frame
     has already painted and then the data stops being drawable. */
  return { canvas, refused: off };
}
