import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from './useFlatChart';

/**
 * FINE STROKES — sparklines and ring segments — and why they need their own hook.
 *
 * The first attempt reused the bar path and rendered a 2 px sparkline as a thick, blown-out
 * blob and a donut as two slabs. Both looked like geometry bugs. Neither was:
 *
 *   ADDITIVE BLENDING IS WRONG FOR A HAIRLINE. It is correct for a quantity that
 *   ACCUMULATES — a point cloud, a stack of bars — where two marks landing on one pixel
 *   genuinely means more. A polyline ribbon overlaps ITSELF at every mitre join, and an arc
 *   overlaps its neighbour at every seam, so those overlaps summed. On a 120 × 32 sparkline
 *   almost every pixel is within a join of another, which is why it blew out completely
 *   rather than subtly.
 *
 * So this hook draws source-over and with the bloom OFF. A hairline has no highlight to
 * bloom; the glow was pure blowout. What it keeps from the bar path is the part that was
 * right: linear working space, brand-exact colour, analytic edge falloff, one shared
 * context, and the SVG fallback.
 */

type GlMod = typeof import('@lcx/gl');

export interface LinePath {
  /** Flat xy pairs in the host SVG's viewBox units. */
  readonly points: Float32Array;
  readonly colour: string;
  readonly halfWidth: number;
}

export interface RingArc {
  readonly cx: number; readonly cy: number;
  readonly rInner: number; readonly rOuter: number;
  /** Radians, 0 = 12 o'clock, increasing clockwise. */
  readonly a0: number; readonly a1: number;
  readonly colour: string;
}

export interface FlatLineProps {
  readonly lines?: readonly LinePath[];
  readonly arcs?: readonly RingArc[];
  readonly viewW: number;
  readonly viewH: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function useFlatLine({ lines = [], arcs = [], viewW, viewH }: FlatLineProps) {
  const [mod, setMod] = useState<GlMod | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@lcx/gl').then((m) => { if (alive) setMod(m); });
    return () => { alive = false; };
  }, []);

  const cache = useRef<{ stage: Stage; strokes: ReturnType<GlMod['createStrokeBatch']>; pipeline: ReturnType<GlMod['createPipeline']> } | null>(null);

  /* Every colour must already be a resolved hex. `hexToLinear` THROWS on anything else, and
     a throw inside the frame escapes after `refused` has been cleared — the SVG marks would
     be gated off with no GL line ever arriving. Decided before a frame exists instead. */
  const drawable =
    mod !== null &&
    (lines.length > 0 || arcs.length > 0) &&
    lines.every((l) => HEX.test(l.colour) && l.points.length >= 4) &&
    arcs.every((a) => HEX.test(a.colour));

  const prev = useRef<{ lines: readonly LinePath[]; arcs: readonly RingArc[] } | null>(null);

  const draw = useCallback(
    (stage: Stage, { t, phase }: { t: number; phase: 'enter' | 'update' }) => {
      if (!mod) return;
      const { createStrokeBatch, createPipeline, plotMatrix, beginAlpha, endPass, hexToLinear, exposure } = mod;
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

      lines.forEach((l, i) => {
        /* ENTER is a left-to-right REVEAL — the only motion a line carries, since it draws
           itself in the direction the data is read and cannot grow from a baseline.
           UPDATE morphs the shape instead: each vertex slides from where it was to where it
           now is, so a series that shifted reads as the SAME line moving. Re-revealing it
           would say "a new chart arrived" about a number that merely changed. */
        const p = prev.current?.lines[i];
        let pts = l.points;
        if (phase === 'update' && p && p.points.length === l.points.length) {
          pts = new Float32Array(l.points.length);
          for (let k = 0; k < pts.length; k++) {
            pts[k] = p.points[k]! + (l.points[k]! - p.points[k]!) * t;
          }
        } else {
          const keep = Math.max(2, Math.ceil((l.points.length / 2) * t)) * 2;
          pts = l.points.subarray(0, keep);
        }
        strokes.polyline(mvp, pts, {
          colour: exposure(hexToLinear(l.colour), 0.30),
          halfWidth: l.halfWidth,
          gain: 1,
          modelling: 0.35,
        });
      });
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
          colour: exposure(hexToLinear(a.colour), 0.30),
          gain: 1,
          modelling: 0.42,
        });
      });
      // Recorded only once the transition lands, so an interrupted update still
      // interpolates from a real previous frame rather than a half-way one.
      if (t >= 1) prev.current = { lines, arcs };
      endPass(gl);

      // BLOOM OFF. A hairline has no highlight to bloom; the glow was pure blowout.
      pipeline.resolve({
        plate: [0, 0, 0], bloomGain: 0, threshold: [4, 5], vignetteDepth: 0, transparent: true,
      });
    },
    [mod, lines, arcs, viewW, viewH],
  );

  const { canvasRef, refused } = useFlatChart(draw as never, {
    width: viewW, height: viewH, deps: [mod, lines, arcs, viewW, viewH],
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
