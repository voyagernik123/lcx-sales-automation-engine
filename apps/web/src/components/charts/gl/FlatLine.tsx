import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from './useFlatChart';

/**
 * RING SEGMENTS — `DonutChart`'s arcs — and why they need their own hook rather than the bar
 * path's.
 *
 * The first attempt reused the bar path and rendered a donut as two slabs. It looked like a
 * geometry bug. It was not:
 *
 *   ADDITIVE BLENDING IS WRONG FOR A FINE STROKE. It is correct for a quantity that
 *   ACCUMULATES — a point cloud, a stack of bars — where two marks landing on one pixel
 *   genuinely means more. An arc overlaps its neighbour at every seam, so those overlaps
 *   summed and the slices fused.
 *
 * So this hook draws source-over and with the bloom OFF. A fine stroke has no highlight to
 * bloom; the glow was pure blowout. What it keeps from the bar path is the part that was
 * right: linear working space, brand-exact colour, analytic edge falloff, one shared context,
 * and the SVG fallback.
 *
 * ── THE `lines` PATH WAS REMOVED, AND WHY IT MUST NOT COME BACK ─────────────────────────
 * This hook also drew POLYLINES, for `Sparkline`. That path is gone, because the measured
 * SVG/GL threshold (`docs/3d/w2/SVG_GL_THRESHOLD.md`) rejects every ribbon this kit draws and
 * the reason is a property of `createStrokeBatch`, not of one caller:
 *
 *   `polyline` is emitted with `uSoft = 1`, so `edge = smoothstep(1.0, 0.0, |vAcross|)` spans
 *   the WHOLE ribbon and there is no opaque core. `∫₋₁¹ smoothstep(1,0,|x|) dx = 1.0` in
 *   `across` units, so the effective ink width is exactly `halfWidth` — half of the
 *   `strokeWidth = 2·halfWidth` a caller naturally reaches for. `Sparkline` shipped at
 *   `halfWidth: 1.15` against `strokeWidth={2}` and MEASURED at 56.8 % of the polyline's ink
 *   on an M1. The GL layer made the line lighter than the SVG it replaced.
 *
 * An arc does not have that defect: it is emitted with `soft = 0.9`, so 90 % of its coverage
 * is an opaque core and only the outer 10 % is feather, and `DonutChart`'s band is 44 device
 * px thick against the 20 px floor. `__tests__/glThreshold.test.ts` is what keeps the
 * distinction from being re-lost.
 */

type GlMod = typeof import('@lcx/gl');

export interface RingArc {
  readonly cx: number; readonly cy: number;
  readonly rInner: number; readonly rOuter: number;
  /** Radians, 0 = 12 o'clock, increasing clockwise. */
  readonly a0: number; readonly a1: number;
  readonly colour: string;
}

export interface FlatLineProps {
  readonly arcs?: readonly RingArc[];
  readonly viewW: number;
  readonly viewH: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function useFlatLine({ arcs = [], viewW, viewH }: FlatLineProps) {
  const [mod, setMod] = useState<GlMod | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@lcx/gl').then((m) => { if (alive) setMod(m); });
    return () => { alive = false; };
  }, []);

  const cache = useRef<{ stage: Stage; strokes: ReturnType<GlMod['createStrokeBatch']>; pipeline: ReturnType<GlMod['createPipeline']> } | null>(null);

  /* Every colour must already be a resolved hex. `hexToLinear` THROWS on anything else, and
     a throw inside the frame escapes after `refused` has been cleared — the SVG marks would
     be gated off with no GL arc ever arriving. Decided before a frame exists instead. */
  const drawable = mod !== null && arcs.length > 0 && arcs.every((a) => HEX.test(a.colour));

  const prev = useRef<{ arcs: readonly RingArc[] } | null>(null);

  const draw = useCallback(
    (stage: Stage, { t, phase }: { t: number; phase: 'enter' | 'update' }) => {
      if (!mod) return;
      const { createStrokeBatch, createPipeline, plotMatrix, beginAlpha, endPass, hexToLinear, exposure,
        precompensate, isPrecompRefusal } = mod;

      /*
       * ── THE ONE SURFACE IN THE APP WHERE A DATA COLOUR CAN LAND ON ITS EXACT HEX ─────────
       * The tone map is not optional and not removable: the whole frame goes through
       * `c/(1+0.4c)`, so a mark authored at #2C6BFF resolves to #2c68dc — blue 35 levels low,
       * measured off a real framebuffer in `docs/3d/brand-fidelity.json`. §6 rule 5 was amended
       * to ORDER PRESERVATION because of exactly that measurement.
       *
       * Feeding the curve its own inverse cancels it, and here it is exact. Three conditions
       * have to hold at once and all three are properties of THIS draw, not of the palette:
       * the blend is source-over (`beginAlpha` above), so a mark's value is bounded by its own
       * colour instead of summing with whatever it overlaps; the plate resolves to 0, so nothing
       * is added under it; and bloom is off, so nothing is added over it. Measured 7/7 exact on
       * this configuration. Every other GL surface in the app fails at least one — the six
       * additive ones structurally, since an accumulating field has no single value to aim at.
       *
       * THE COST, stated because it is real: pre-compensation spends the entire highlight range.
       * A pre-compensated mark at 1.0 density is already at the clip, so it cannot render
       * brighter, and a density sweep that gave six distinguishable steps plain gives three here.
       * That is the right trade for a ring whose arcs are fixed-density category marks and the
       * WRONG one for any surface where brightness is the encoding — which is why this is a call
       * site decision and not a pipeline default.
       *
       * On a refusal it returns the plain colour. A refusal is a measurement saying the identity
       * does not hold at this site; rendering slightly-off beats rendering a value the compositor
       * will clip somewhere unpredictable.
       */
      const arcColour = (hex: string) => {
        const lit = exposure(hexToLinear(hex), 0.30);
        const pre = precompensate(lit, {
          dstFactor: 'one-minus-src-alpha',
          plate: [0, 0, 0],
          bloomGain: 0,
          threshold: [4, 5],
          shaderScale: 1,
        });
        return isPrecompRefusal(pre) ? lit : pre;
      };
      const gl = stage.gl;
      if (cache.current?.stage !== stage) {
        cache.current = { stage, strokes: createStrokeBatch(stage), pipeline: createPipeline(stage) };
      }
      const { strokes, pipeline } = cache.current;
      if ('kind' in strokes || 'kind' in pipeline) return;

      // y0 = viewH, y1 = 0 flips the axis into the host SVG's coordinate space.
      const mvp = plotMatrix(0, viewW, viewH, 0);
      stage.bindTarget(stage.scene);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // SOURCE-OVER, not additive. See the header — this is the whole fix.
      beginAlpha(gl);

      arcs.forEach((a, i) => {
        const p = prev.current?.arcs[i];
        /* An update sweeps each segment BOUNDARY from its old angle to its new one, so a
           share that grew reads as the ring re-dividing rather than being redrawn. On enter
           the whole ring sweeps out from its start angle. */
        const a0 = phase === 'update' && p ? p.a0 + (a.a0 - p.a0) * t : a.a0;
        const a1 = phase === 'update' && p
          ? p.a1 + (a.a1 - p.a1) * t
          : a.a0 + (a.a1 - a.a0) * t;
        strokes.arc(mvp, a.cx, a.cy, a.rInner, a.rOuter, a0, a1, {
          colour: arcColour(a.colour),
          gain: 1,
          modelling: 0.42,
        });
      });
      // Recorded only once the transition lands, so an interrupted update still
      // interpolates from a real previous frame rather than a half-way one.
      if (t >= 1) prev.current = { arcs };
      endPass(gl);

      // BLOOM OFF. A fine stroke has no highlight to bloom; the glow was pure blowout.
      pipeline.resolve({
        plate: [0, 0, 0], bloomGain: 0, threshold: [4, 5], vignetteDepth: 0, transparent: true,
      });
    },
    [mod, arcs, viewW, viewH],
  );

  const { canvasRef, refused } = useFlatChart(draw as never, {
    width: viewW, height: viewH, deps: [mod, arcs, viewW, viewH],
  });

  const canvas = (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-0 h-full w-full"
      style={{ display: refused || !drawable ? 'none' : 'block' }}
    />
  );
  return { canvas, refused: refused || !drawable };
}
