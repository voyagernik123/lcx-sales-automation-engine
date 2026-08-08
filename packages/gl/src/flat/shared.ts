/**
 * L5 · THE SHARED RENDERER — one WebGL context for every chart on the page.
 *
 * ── THE CONSTRAINT THAT DECIDES THIS ENTIRE DESIGN ──────────────────────────────────
 * `PLATFORM_VFX_100X.md` §7.3 names it: one canvas is fine, sixty on a dashboard is not.
 * Browsers cap live WebGL contexts (commonly 8–16); past the cap the OLDEST context is
 * silently killed, so a naive "one context per chart" build works beautifully on the
 * developer's three-chart test page and blanks the top half of a real dashboard. Nothing
 * throws. The charts just go empty, oldest first, which looks like a data bug.
 *
 * So there is exactly ONE context for the whole app, living on an offscreen canvas. Each
 * chart owns a cheap 2-D canvas and receives a `drawImage` blit of its own frame.
 *
 * ── WHY BLIT AND NOT SCISSORED VIEWPORTS ON ONE VISIBLE CANVAS ──────────────────────
 * A single page-sized canvas behind the DOM is the other standard answer, and it is worse
 * here: it has to track scroll, stacking context, overflow clipping and every card that
 * animates, and it breaks the moment a chart sits inside a scroll container or a modal —
 * both of which this app has. The blit costs one texture copy per chart per redraw, which
 * is a rounding error against a frame that already runs five post-process passes, and it
 * buys a chart that behaves like an ordinary DOM element. That is the right trade for a
 * dashboard.
 *
 * ── AND WHY THE OFFSCREEN CANVAS IS SIZED TO THE LARGEST CLIENT ─────────────────────
 * Resizing a drawing buffer reallocates it and, on some drivers, forces a pipeline flush.
 * Doing that per chart per frame on a 60-chart page is the one thing that would make this
 * slower than SVG. The buffer grows to the largest request and never shrinks during a
 * session; a smaller chart renders into the bottom-left corner and blits only its own rect.
 */

import { createStage, isStage, type Stage, type StageRefusal } from '../stage.js';

export interface SharedFrame {
  /** The one context. Chart code draws through the batches it builds from this. */
  readonly stage: Stage;
  /** Device-pixel size of the region this chart owns, this frame. */
  readonly width: number;
  readonly height: number;
}

export interface SharedRenderer {
  /**
   * Render one chart and blit it to `target`.
   *
   * `draw` runs with the viewport already set to the chart's region, so a caller never
   * touches `gl.viewport` and cannot leak a viewport into the next chart — which is the
   * failure this API exists to make impossible.
   */
  render(target: HTMLCanvasElement, draw: (frame: SharedFrame) => void): void | StageRefusal;
  readonly stage: Stage;
  dispose(): void;
}

let singleton: SharedRenderer | StageRefusal | null = null;

/**
 * The process-wide renderer. Created on first use, reused forever.
 *
 * Returns the SAME refusal to every caller once it has failed, rather than retrying a
 * context creation that has already been denied — on a machine with WebGL disabled, a
 * 60-chart page would otherwise attempt 60 context creations on every render.
 */
export function sharedRenderer(): SharedRenderer | StageRefusal {
  if (singleton) return singleton;
  singleton = build();
  return singleton;
}

/** Test seam. Drops the singleton so a suite can exercise the refusal path. */
export function resetSharedRenderer(): void {
  if (singleton && 'dispose' in singleton) singleton.dispose();
  singleton = null;
}

function build(): SharedRenderer | StageRefusal {
  if (typeof document === 'undefined') {
    return {
      kind: 'refused',
      code: 'NO_WEBGL2',
      reason:
        'There is no document in this environment, so no graphics context can be created. '
        + 'The data is unaffected.',
    };
  }
  const canvas = document.createElement('canvas');
  // A modest starting size. It grows to fit the largest chart that asks.
  canvas.width = 1024;
  canvas.height = 512;
  // ALWAYS transparent: every consumer of the shared renderer is a layer over DOM.
  const stage = createStage(canvas, { alpha: true });
  if (!isStage(stage)) return stage;

  return {
    stage,
    render(target, draw) {
      const w = Math.max(1, target.width);
      const h = Math.max(1, target.height);
      if (w > canvas.width || h > canvas.height) {
        // GROW ONLY. See the header: shrinking would reallocate the drawing buffer on the
        // next larger chart, every frame, for the whole session.
        canvas.width = Math.max(canvas.width, w);
        canvas.height = Math.max(canvas.height, h);
      }
      const { gl } = stage;
      /* The chart's region is the BOTTOM-LEFT corner of the shared buffer, because GL's
         origin is bottom-left and that makes the blit below a straight copy with no flip
         arithmetic — one less place for an off-by-one that only shows on odd sizes. */
      gl.viewport(0, 0, w, h);
      gl.scissor(0, 0, w, h);
      gl.enable(gl.SCISSOR_TEST);
      draw({ stage, width: w, height: h });
      gl.disable(gl.SCISSOR_TEST);

      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      // Source rect is the region just drawn; the shared buffer may be much larger.
      ctx.drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h);
    },
    dispose() {
      stage.dispose();
    },
  };
}
