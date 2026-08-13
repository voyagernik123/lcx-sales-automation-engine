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
 * here for two reasons, NEITHER of which is cost. It has to track scroll, stacking context,
 * overflow clipping and every card that animates, and it breaks the moment a chart sits
 * inside a scroll container or a modal — both of which this app has. And it cannot be
 * simultaneously above an opaque card fill and below the chart's own SVG, which is where the
 * text and the accessibility tree live. Those decide it, and a millisecond figure does not
 * move either of them.
 *
 * The cost sentence that used to sit here — "one texture copy per chart per redraw, which is
 * a rounding error against a frame that already runs five post-process passes" — was asserted
 * in three places and measured in none, and it is FALSE. Measured through
 * `docs/3d/blit-cost.mjs` on a real M1 (ANGLE Metal, dpr 2), one 480x160 chart drawn by the
 * shipping frame: 0.50 ms without the blit, 1.00 ms with it, so the copy is ~1x the whole
 * rest of the frame rather than a rounding error against it. What DID hold is per-chart
 * flatness: 60 charts cost 60x one chart, not worse.
 *
 * ── WHAT THE COPY IS ACTUALLY SIZED BY, WHICH IS NOT THE CHART ───────────────────────
 * A `drawImage` whose source is a WebGL canvas cannot sample the drawing buffer in place. The
 * browser resolves the WHOLE drawing buffer into a snapshot a 2-D context can read, and the
 * source rectangle is then applied to the snapshot — after the expensive part. Measured, on a
 * raw canvas with no chart code in the way:
 *
 *   · source rect FIXED at 480x160, canvas swept: 0.50 / 0.57 / 1.37 / 2.41 ms at 512x256,
 *     1024x512, 2400x920, 3200x1600. Cost tracks the CANVAS.
 *   · canvas FIXED at 3200x1600, source rect swept: 2.49 / 2.63 / 2.52 ms for 8x8, 480x160,
 *     1600x800. Twenty thousand times the pixels for the same money. Cost does NOT track the
 *     RECT.
 *   · a second `drawImage` with no GL work between the two: below the run's 0.23 ms noise
 *     floor, against 2.52 ms for the first. It is one resolve per modification, not per copy.
 *   · `preserveDrawingBuffer` (which `stage.ts:165` hardcodes true for the capture harness)
 *     changes none of it: within noise at all four sizes. Not that flag's fault.
 *
 * ── SO THE BUFFER IS QUANTISED, NOT GROW-ONLY ───────────────────────────────────────
 * It used to grow to the largest chart that ever asked and never shrink, on the reasoning that
 * reallocating a drawing buffer is expensive. The consequence nobody had measured: a 40 px
 * sparkline on a page that also holds one large chart paid the LARGE chart's resolve on every
 * redraw — 2.41 ms to copy a region it does not use. One 2400x920 chart plus eight 480x40
 * sparklines, all redrawn, spent 16.29 ms per frame on copies. That is a whole 60 Hz frame,
 * and sparklines are the most numerous GL surface in the product.
 *
 * The reasoning was also only half right. Reallocation cost tracks buffer AREA like everything
 * else here: 0.79 to 0.97 ms for a 3200x1600 buffer across four runs, and below the noise floor at
 * 512x256 in every one of them. Cheap where small charts live, expensive only where the resolve it
 * avoids is expensive too.
 *
 * So the buffer GROWS to the current chart immediately, quantised up to a 256 px grid with a
 * floor at the 1024x512 it starts at, and SHRINKS only at the end of an animation frame in
 * which nothing asked for it to be bigger — see `SHRINK_AFTER_QUIET_FRAMES` below, which
 * carries the measurement that forced the shrink to be conditional rather than per render.
 *
 * The grid and the floor are what keep a resize from being paid at all on an ordinary page: a
 * chart whose device size drifts by a few pixels — a dpr change, a responsive reflow, the
 * 420 ms `useFlatChart` entrance — lands on the same bucket and reallocates nothing. The floor
 * is free: 512x256 measured 0.50 ms against 1024x512's 0.57, a gap this run cannot separate
 * from its own noise, so there is nothing to buy below it and a reallocation to lose. Every
 * sparkline and most cards sit under it. A chart renders into the bottom-left corner of
 * whatever bucket it lands in and blits only its own rect — and note that shrinking MOVES that
 * corner, since GL's origin is bottom-left, which is the one arithmetic this fix could have got
 * silently wrong.
 *
 * REJECTED, on measurement, not on taste:
 *   · SHRINKING PER RENDER, which is what this fix was before the frame condition was added.
 *     It made the sparkline cheap and the frame worse: 9.07 ms to 16.51 ms on one 2400x920
 *     chart plus one 480x40 sparkline. The numbers and the mechanism are with
 *     `SHRINK_AFTER_QUIET_FRAMES`.
 *   · A POOL OF SIZE-BUCKETED BUFFERS, so a sparkline and a large chart could each keep their
 *     own. A WebGL context belongs to one canvas, so a pool of buffers is a pool of CONTEXTS —
 *     and past the browser's 8-16 cap the oldest is killed silently, which on a chart route is
 *     this one. That is the exact failure the whole file exists to prevent, bought for a saving
 *     one conditional resize already gets.
 *   · A READBACK PATH for small regions (`readPixels` + `putImageData`, which skips the canvas
 *     snapshot entirely). It wins only where the buffer is large — 0.93 ms cheaper at
 *     3200x1600, and 0.98 and 1.02 in two more runs — and LOSES where this fix puts the buffer:
 *     0.29, 0.36, 0.42 and 0.71 ms worse than `drawImage` at 512x256 in four runs, before counting
 *     the row flip it needs because GL rows are bottom-up, and before the premultiplied-alpha
 *     question `putImageData` raises that `drawImage` does not. It treats the symptom of a buffer
 *     being too big.
 *   · ORDERING THE TWO AXIS ASSIGNMENTS to minimise the intermediate buffer. Plausible — there
 *     is no atomic size setter, so 1024x512 to 3200x1600 passes through either 3200x512 or
 *     1024x1600 and pays for whichever it is. Measured three times, the difference was BELOW the
 *     noise floor every time (|0.97| and |0.28| ms against a spread of 1.09, |0.92| against 1.25)
 *     and the sign favoured the naive order. Not done, and the arm is kept so it stays refutable.
 */

import { createStage, isStage, type Stage, type StageRefusal } from '../stage.js';

/* ══ THE BUFFER BUCKET ════════════════════════════════════════════════════════════════
 *
 * Exported so a test can assert against the SAME arithmetic the renderer uses. A test that
 * recomputed `Math.ceil(w / 256) * 256` for itself would keep passing after someone changed
 * the grid here, which is the one thing it exists to catch.
 */

/** Quantisation step. Absorbs dpr changes, responsive reflow and the entrance tween. */
export const BUFFER_GRID = 256;
/**
 * The floor, in device pixels, and also the size the buffer starts at.
 *
 * Not a guess: 512x256 measured 0.50 ms per blit against 1024x512's 0.57 on an M1 through
 * ANGLE Metal — a gap this run cannot separate from its own 0.06-0.13 ms noise floor. So going
 * below this buys nothing measurable, and it costs a reallocation every time a small chart
 * follows a smaller one. Every sparkline and most cards sit under it and never resize at all.
 */
export const BUFFER_FLOOR_W = 1024;
export const BUFFER_FLOOR_H = 512;

/**
 * Quiet animation frames required before the buffer is allowed to shrink.
 *
 * TWO, not one, because a chart that redraws on ALTERNATE frames — a 30 Hz data tick against a
 * 60 Hz display — would otherwise shrink the buffer on every idle frame and regrow it on every
 * busy one, which is the 7.44 ms churn described at the shrink itself, at half the rate.
 * Exported so the test drives the same number rather than a copy of it.
 */
export const SHRINK_AFTER_QUIET_FRAMES = 2;

/** Device pixels on one axis → the buffer axis that will hold it. */
export function bufferBucket(px: number, floor: number): number {
  return Math.max(floor, Math.ceil(Math.max(1, px) / BUFFER_GRID) * BUFFER_GRID);
}

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
  // The floor, and also the starting size, so the common page never resizes at all.
  canvas.width = BUFFER_FLOOR_W;
  canvas.height = BUFFER_FLOOR_H;
  // ALWAYS transparent: every consumer of the shared renderer is a layer over DOM.
  const stage = createStage(canvas, { alpha: true });
  if (!isStage(stage)) return stage;

  /*
   * THE SHRINK IS END-OF-FRAME AND CONDITIONAL. GROWTH IS IMMEDIATE.
   *
   * The first version of this fix bucketed the buffer per render, in both directions. It fixed
   * the sparkline and REGRESSED the frame, which is why this state exists instead:
   *
   *   one 2400x920 chart + one 480x40 sparkline, both redrawn, total frame
   *     grow-only               9.07 ms
   *     bucketed per render    16.51 ms      <- 7.44 ms WORSE
   *
   * The reason is visible in the no-blit control arm of the same measurement, which copies
   * nothing at all and still went from 4.32 ms to 10.10 ms: with two bucket sizes alive in one
   * frame, the buffer was reallocated four times per frame (two changes, two axes each, no
   * atomic setter) at about 1.45 ms a time. That is more than the resolve it was avoiding.
   * At eight sparklines it came out a wash — 23.32 against 22.59, inside the run's noise —
   * so there is no chart count at which per-render bucketing is safely right.
   *
   * So the buffer relaxes only once a whole animation frame has passed in which NOTHING asked
   * for it to be bigger. While a large chart keeps redrawing, the buffer stays large and this
   * file behaves exactly as the grow-only version did — the regression above is not merely
   * reduced, it is structurally unreachable. When the large chart stops, or unmounts, the
   * sparklines that remain get the small buffer and the measured 3.9x — 1.92 and 1.98 ms per copy
   * before, 0.49 and 0.51 ms after, on a page whose largest chart is 3200x1600.
   *
   * TWO quiet frames, not one, because a chart that redraws on ALTERNATE frames would otherwise
   * shrink the buffer on its idle frame and regrow it on its busy one — reintroducing the churn
   * above at half the rate, which is the failure this whole mechanism exists to avoid.
   *
   * Requires `requestAnimationFrame`. Where there is none — SSR, a unit test — the buffer never
   * shrinks and this file is the grow-only version. That is the safe direction to degrade in:
   * the cost is a copy that is too big, not a chart that is wrong.
   */
  let peakW = 0, peakH = 0;
  let quietFrames = 0;
  let pending = false;

  const endOfFrame = () => {
    pending = false;
    const pw = peakW, ph = peakH;
    peakW = 0; peakH = 0;
    /* A frame in which no chart rendered says nothing about how big the buffer needs to be.
       Without this, an idle tab would shrink the buffer to zero. */
    if (pw === 0 || ph === 0) return;
    if (pw >= canvas.width && ph >= canvas.height) { quietFrames = 0; return; }
    if (++quietFrames < SHRINK_AFTER_QUIET_FRAMES) return;
    quietFrames = 0;
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
  };

  /* Looked up per call rather than captured at build time, so a test can install a controllable
     frame clock after the renderer exists — the singleton is built on first use and a test that
     had to install one first would be testing its own ordering. */
  const scheduleEndOfFrame = () => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown })
      .requestAnimationFrame;
    if (typeof raf !== 'function' || pending) return;
    pending = true;
    raf(endOfFrame);
  };

  return {
    stage,
    render(target, draw) {
      const w = Math.max(1, target.width);
      const h = Math.max(1, target.height);
      /* GROW NOW, SHRINK AT END OF FRAME. See the note above `SHRINK_AFTER_QUIET_FRAMES`: the
         `drawImage` below is priced by the whole drawing buffer and not by the source rect, so
         a 480x40 sparkline was paying 2.41 ms to copy a 3200x1600 buffer it does not use. Each
         axis is guarded separately because assigning either one reallocates the buffer — a real
         size change measured about 1.45 ms — so touching the axis that did not change is not
         free. */
      const bw = bufferBucket(w, BUFFER_FLOOR_W);
      const bh = bufferBucket(h, BUFFER_FLOOR_H);
      if (bw > peakW) peakW = bw;
      if (bh > peakH) peakH = bh;
      if (bw > canvas.width) canvas.width = bw;
      if (bh > canvas.height) canvas.height = bh;
      scheduleEndOfFrame();
      // The stage's targets and viewport must match THIS chart's region, or bindTarget
      // will re-set the viewport to the shared buffer's full size behind our back.
      stage.setRegion(w, h);
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
