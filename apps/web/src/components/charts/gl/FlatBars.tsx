import { useCallback } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from './useFlatChart';

/**
 * W2 · the GL bar layer that sits UNDER an existing SVG chart.
 *
 * The swap is deliberately surgical. W0 found these primitives correct — real markers, real
 * confidence intervals, honest conversion percentages, working tooltips and hit targets —
 * so this replaces the ONE thing that was flat (the bar fill) and touches nothing else.
 * Labels, values, tooltips, truncation and the accessibility tree all stay in the SVG above,
 * unmodified.
 *
 * That is also what makes the fallback free: if the renderer refuses, the SVG simply draws
 * its own `<path>` bars as it always did, and the chart is exactly what shipped before.
 */

export interface FlatBarRect {
  /** In the host SVG's viewBox units, so the two layers cannot drift apart. */
  readonly x: number; readonly y: number;
  readonly w: number; readonly h: number;
  readonly colour: string;
}

/**
 * A HOOK, not a wrapper component, and that is forced by where the fallback lives: the
 * SVG's own bar `<path>` elements sit INSIDE its `<svg>`, while the canvas has to sit
 * outside it. A component taking the fallback as `children` cannot put those children back
 * in the right place. The hook hands the caller a canvas to render and a `refused` flag to
 * gate its own paths on, and the caller keeps both where they belong.
 */
export interface FlatBarsProps {
  readonly rects: readonly FlatBarRect[];
  /** The host SVG's viewBox, so this layer shares its coordinate space exactly. */
  readonly viewW: number;
  readonly viewH: number;
  readonly orientation?: 'vertical' | 'horizontal';
}

/** `var(--chart-1)` and friends resolve to a hex only once they are on an element. */
function resolveColour(token: string, el: Element): string {
  const m = /^var\((--[\w-]+)\)$/.exec(token.trim());
  if (!m) return token;
  const v = getComputedStyle(el).getPropertyValue(m[1]!).trim();
  return v || '#2C6BFF';
}

export function useFlatBars({ rects, viewW, viewH, orientation = 'horizontal' }: FlatBarsProps) {
  const draw = useCallback(
    async (stage: Stage, { t }: { t: number }) => {
      const gl = stage.gl;
      const mod = await import('@lcx/gl');
      const { createBarBatch, createPipeline, plotMatrix, beginAdditive, endPass, hexToLinear, exposure } = mod;
      const bars = createBarBatch(stage);
      if ('kind' in bars) return;
      const pipeline = createPipeline(stage);
      if ('kind' in pipeline) return;

      // y0 = viewH, y1 = 0 FLIPS the axis: SVG counts y downward and GL counts it up, and
      // the two layers have to land on the same pixels.
      const mvp = plotMatrix(0, viewW, viewH, 0);

      stage.bindTarget(stage.scene);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      beginAdditive(gl);
      bars.draw(
        mvp,
        rects.map((r) => {
          // THE ENTRANCE GROWS THE BAR FROM ITS BASELINE, which is the only motion that
          // carries the data: the bar arrives at its value rather than fading in at it.
          const w = orientation === 'horizontal' ? r.w * t : r.w;
          const h = orientation === 'horizontal' ? r.h : r.h * t;
          const y = orientation === 'horizontal' ? r.y : r.y + (r.h - h);
          return {
            x0: r.x, x1: r.x + w,
            y0: y, y1: y + h,
            colour: exposure(hexToLinear(r.colour), 0.62),
          };
        }),
        { orientation, modelling: 0.52, edgeStops: -0.2, contact: 0.7, radius: Math.min(6, viewH * 0.02) },
      );
      endPass(gl);
      pipeline.resolve({
        // A TRANSPARENT plate: this layer sits on the card's own background, so painting a
        // plate here would draw a dark rectangle over it.
        plate: [0, 0, 0],
        bloomGain: 0.3,
        threshold: [0.3, 1.1],
        vignetteDepth: 0,
        transparent: true,
      });
      bars.dispose();
    },
    [rects, viewW, viewH, orientation],
  );

  const { canvasRef, refused } = useFlatChart(draw as never, {
    width: viewW, height: viewH, deps: [rects, viewW, viewH],
  });

  const canvas = (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      aria-hidden="true"
      /* BEHIND the SVG. An absolutely-positioned element paints above its static siblings
         regardless of DOM order, so without an explicit z-index the canvas covered every
         label and value in the chart it was supposed to be enhancing. */
      className="pointer-events-none absolute inset-0 -z-0 h-full w-full"
      style={{ display: refused ? 'none' : 'block' }}
    />
  );
  return { canvas, refused };
}

export { resolveColour };
