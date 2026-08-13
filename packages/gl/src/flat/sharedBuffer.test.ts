import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  sharedRenderer, resetSharedRenderer,
  bufferBucket, BUFFER_GRID, BUFFER_FLOOR_W, BUFFER_FLOOR_H, SHRINK_AFTER_QUIET_FRAMES,
} from './shared.js';

/**
 * THE DEFECT THIS FILE PINS, AND THE NUMBER IT COST.
 *
 * `shared.ts` used to grow the offscreen drawing buffer to the largest chart that ever asked and
 * never shrink it. That was justified on reallocation cost and it produced a defect nobody had
 * measured, because a `drawImage` out of a WebGL canvas is priced by the WHOLE drawing buffer and
 * not by the source rectangle: the browser resolves the entire buffer into a snapshot a 2-D
 * context can read, and the source rect is applied afterwards, to the snapshot.
 *
 * Measured on a real M1 through ANGLE Metal at dpr 2 (`docs/3d/blit-cost.mjs`), source rect held
 * at 480x160 and only the buffer swept: 0.50 / 0.57 / 1.37 / 2.41 ms at 512x256, 1024x512,
 * 2400x920, 3200x1600. Held the other way — buffer fixed at 3200x1600, rect swept — 8x8 cost
 * 2.49 ms and 1600x800 cost 2.52 ms, twenty thousand times the pixels for the same money. So a
 * 40 px sparkline on a page that also held one large chart paid **2.41 ms per redraw** to copy a
 * region it does not use, and one 2400x920 chart plus eight 480x40 sparklines spent **16.29 ms
 * per frame** on copies alone — a whole 60 Hz frame. Sparklines are the most numerous GL surface
 * in the product.
 *
 * The buffer now GROWS to the current chart immediately, quantised up to `BUFFER_GRID` with a
 * floor at `BUFFER_FLOOR_W` x `BUFFER_FLOOR_H`, and SHRINKS only after
 * `SHRINK_AFTER_QUIET_FRAMES` animation frames in which nothing asked for it to be bigger. Half
 * the cases below are about the shrink happening and half are about it NOT happening, because
 * shrinking unconditionally is a 7.44 ms per-frame regression that was measured, not imagined.
 *
 * Milliseconds are not asserted anywhere here and must not be: they belong to one machine and
 * one driver, and Node has no GPU to measure. What IS asserted is the size the buffer is at the
 * moment of each copy, and how often it changes — the two quantities every millisecond above is
 * a function of, and the two a fake context can answer exactly.
 *
 * ── WHAT THIS FILE DOES NOT FIX, SO NOBODY READS THE HEADER AND ASSUMES IT DID ─────────
 * `stage.setRegion` still reallocates all three render targets on any size change — 39 textures
 * against 6 for four charts alternating two sizes over three redraws, pinned by the fourth case
 * in `sharedCost.test.ts`. Quantising the buffer does NOT fix it, and the last case here is the
 * reason it cannot be fixed from this file: `setRegion` must keep receiving the chart's EXACT
 * size, because `stage.bindTarget` derives the viewport from the region, and handing it a bucket
 * is precisely the defect recorded at `stage.ts:193-199` — every mark 1.64x too large with the
 * bottom rows cropped off, and nothing thrown.
 */

/* ── A FAKE CONTEXT THAT RECORDS THE TWO THINGS THIS FILE IS ABOUT ──────────────────── */

interface Copy {
  readonly sx: number; readonly sy: number;
  readonly sw: number; readonly sh: number;
  /** The buffer's size AT THE MOMENT OF THE COPY. The whole point: this is what it costs. */
  readonly bufferW: number; readonly bufferH: number;
}

function harness() {
  const counts: Record<string, number> = {};
  const bump = (n: string) => { counts[n] = (counts[n] ?? 0) + 1; };
  const copies: Copy[] = [];
  const resizes: string[] = [];
  /** Every render-target allocation, as `w x h`. Reveals what `setRegion` was handed. */
  const allocs: string[] = [];
  let contexts = 0;
  let canvases = 0;

  const K = new Map<string, number>();
  let nextK = 0x10000;
  const konst = (name: string): number => {
    const found = K.get(name);
    if (found !== undefined) return found;
    const v = nextK++;
    K.set(name, v);
    return v;
  };

  const api: Record<string, (...a: never[]) => unknown> = {
    getExtension: () => ({}),
    getError: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getUniformLocation: () => ({}),
    checkFramebufferStatus: () => konst('FRAMEBUFFER_COMPLETE'),
    createShader: () => ({}),
    createProgram: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    /* Args kept, unlike the sibling harness, because the LAST case here asserts the size
       `setRegion` allocated at and that size only appears in this call. */
    texImage2D: ((...a: unknown[]) => {
      bump('texImage2D');
      allocs.push(`${a[3]}x${a[4]}`);
    }) as unknown as (...a: never[]) => unknown,
  };

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return konst(prop);
      const impl = api[prop];
      if (impl) return impl;
      return (...a: never[]) => { bump(prop); void a; return undefined; };
    },
  }) as unknown as WebGL2RenderingContext;

  const offscreen = (() => {
    let w = 0, h = 0;
    return {
      get width() { return w; },
      set width(v: number) { w = v; resizes.push(`${v}x${h}`); },
      get height() { return h; },
      set height(v: number) { h = v; resizes.push(`${w}x${v}`); },
      clientWidth: 0,
      clientHeight: 0,
      getContext: (kind: string) => {
        if (kind !== 'webgl2') return null;
        contexts++;
        return gl;
      },
    } as unknown as HTMLCanvasElement;
  })();

  const target = (w: number, h: number): HTMLCanvasElement => ({
    width: w,
    height: h,
    getContext: (kind: string) => (kind === '2d' ? {
      clearRect: () => { bump('clearRect'); },
      drawImage: (
        src: { width: number; height: number },
        sx: number, sy: number, sw: number, sh: number,
        _dx: number, _dy: number, _dw: number, _dh: number,
      ) => {
        bump('drawImage');
        copies.push({ sx, sy, sw, sh, bufferW: src.width, bufferH: src.height });
      },
    } : null),
  }) as unknown as HTMLCanvasElement;

  const prior = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      canvases++;
      return offscreen;
    },
  };

  /*
   * A FRAME CLOCK THE TEST DRIVES, because the shrink is end-of-frame and a real
   * `requestAnimationFrame` would make every assertion below a race. `tick()` runs whatever the
   * renderer queued, once — which is exactly one animation frame boundary.
   */
  const priorRaf = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  let queued: (() => void)[] = [];
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    (cb: () => void) => { queued.push(cb); return queued.length; };
  const tick = () => { const q = queued; queued = []; for (const cb of q) cb(); };

  return {
    contexts: () => contexts,
    canvases: () => canvases,
    counts, copies, resizes, allocs, target, tick,
    /** How many frame callbacks are outstanding — one at most, or the renderer double-books. */
    queued: () => queued.length,
    restore() {
      resetSharedRenderer();
      if (prior === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prior;
      if (priorRaf === undefined) delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      else (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = priorRaf;
    },
  };
}
type Harness = ReturnType<typeof harness>;

function renderer() {
  const r = sharedRenderer();
  if ('kind' in r) throw new Error(`the fake context refused a shared renderer: ${r.code}`);
  return r;
}

let live: Harness | null = null;
afterEach(() => { live?.restore(); live = null; });

describe('the offscreen buffer is sized by the chart, not by the biggest chart on the page', () => {
  it('quantises to the grid with a floor, and never below the chart', () => {
    /* The arithmetic itself, at the four boundaries that matter. `bufferBucket` is imported
       rather than reimplemented so that changing the grid in `shared.ts` fails HERE. */
    expect(bufferBucket(1, BUFFER_FLOOR_H)).toBe(BUFFER_FLOOR_H);
    expect(bufferBucket(BUFFER_FLOOR_H, BUFFER_FLOOR_H)).toBe(BUFFER_FLOOR_H);
    /* One pixel over the floor must go up a whole step, not to 513: a buffer that tracked the
       chart exactly would reallocate on every pixel of a responsive reflow. */
    expect(bufferBucket(BUFFER_FLOOR_H + 1, BUFFER_FLOOR_H)).toBe(BUFFER_FLOOR_H + BUFFER_GRID);
    expect(bufferBucket(1536, BUFFER_FLOOR_H)).toBe(1536);      // 6 x 256, already on the grid
    expect(bufferBucket(1537, BUFFER_FLOOR_H)).toBe(1536 + BUFFER_GRID);
    /* 1600 is NOT on the grid — 256 x 6 is 1536 and 256 x 7 is 1792 — so the tallest chart the
       measurement swept costs a 12 % over-allocation in buffer area. Written down because it
       was got wrong once while writing this test, and because it is the worst case of the whole
       scheme: bounded by one grid step per axis, never by a factor. */
    expect(bufferBucket(1600, BUFFER_FLOOR_H)).toBe(1792);
  });

  it('stops making a sparkline pay for a large chart once that chart stops redrawing', () => {
    /*
     * THE ARM THIS EXISTS FOR. Against the grow-only buffer every copy below came out of the
     * FIRST chart's buffer for the rest of the session: 2400x920, then 3200x1600. Measured at
     * 1.37 ms and 2.41 ms per redraw for a 480x40 region that is 0.9 % and 0.4 % of it.
     */
    const pairs = [[2400, 920], [3200, 1600]] as const;
    expect(pairs.length).toBe(2);
    for (const [bigW, bigH] of pairs) {
      const h = harness(); live = h;
      const r = renderer();
      /* Frame 1: the large chart is on screen, so nothing may shrink — that is the whole
         no-regression guarantee, asserted properly in the next case. */
      r.render(h.target(bigW, bigH), () => {});
      r.render(h.target(480, 40), () => {});
      h.tick();
      expect(h.copies[1]!.bufferH, 'the buffer shrank in a frame the large chart drew in')
        .toBe(bufferBucket(bigH, BUFFER_FLOOR_H));

      /* The large chart stops — it settled, scrolled away, or unmounted. Two quiet frames is
         what the policy asks for; the sparkline keeps ticking through both. */
      for (let frame = 0; frame < SHRINK_AFTER_QUIET_FRAMES; frame++) {
        r.render(h.target(480, 40), () => {});
        h.tick();
      }
      r.render(h.target(480, 40), () => {});

      const spark = h.copies[h.copies.length - 1]!;
      expect(
        [spark.bufferW, spark.bufferH],
        `the 480x40 sparkline still copies out of the ${bigW}x${bigH} chart's buffer`,
      ).toEqual([BUFFER_FLOOR_W, BUFFER_FLOOR_H]);
      /* And it is still the chart's own rect out of the bottom-left corner. GL's origin is
         bottom-left, so shrinking the buffer MOVES that corner — get this wrong and the
         sparkline blits a band of empty buffer, which reads as missing data. */
      expect([spark.sw, spark.sh]).toEqual([480, 40]);
      expect(spark.sx).toBe(0);
      expect(spark.sy, 'the source row is not the bottom of the shrunken buffer')
        .toBe(BUFFER_FLOOR_H - 40);
      h.restore(); live = null;
    }
  });

  it('does NOT shrink while the large chart is still redrawing — the 7.44 ms regression', () => {
    const h = harness(); live = h;
    const r = renderer();
    /*
     * THE CASE THAT KILLED THE FIRST VERSION OF THIS FIX. Bucketing the buffer per render made
     * one 2400x920 chart plus one 480x40 sparkline cost 16.51 ms a frame against grow-only's
     * 9.07 — because two live bucket sizes meant four drawing-buffer reallocations per frame at
     * about 1.45 ms each, which is more than the resolve being avoided. The no-blit control arm
     * of that same measurement, which copies nothing at all, went 4.32 ms to 10.10 ms.
     *
     * So while anything in the frame still wants the big buffer, the buffer must not move. What
     * this asserts is the ABSENCE of churn: the resize log holds the initial size and one grow,
     * and nothing else, across five frames.
     */
    for (let frame = 0; frame < 5; frame++) {
      r.render(h.target(2400, 920), () => {});
      r.render(h.target(480, 40), () => {});
      h.tick();
    }
    expect(h.copies.length).toBe(10);
    expect(h.resizes, 'the buffer is being resized inside frames that draw the large chart').toEqual([
      `${BUFFER_FLOOR_W}x0`, `${BUFFER_FLOOR_W}x${BUFFER_FLOOR_H}`,   // the initial size
      `2560x${BUFFER_FLOOR_H}`, '2560x1024',                          // one grow, two axes
    ]);
    /* One frame callback outstanding at most. A renderer that queued one per render would run
       the end-of-frame logic sixty times a frame on a sixty-chart page, and each run that found
       a quiet frame would count it again. */
    expect(h.queued(), 'the renderer queued more than one end-of-frame callback').toBeLessThanOrEqual(1);
  });

  it('shrinks on an alternate-frame chart no more than a chart that never stops', () => {
    const h = harness(); live = h;
    const r = renderer();
    /*
     * The reason the policy waits TWO quiet frames rather than one. A chart that redraws on
     * alternate frames — a 30 Hz data tick against a 60 Hz display — would otherwise shrink the
     * buffer on every idle frame and regrow it on every busy one, which is the churn above at
     * half the rate. Ten frames, five of them drawing the large chart, and the buffer must
     * still never have moved after the initial grow.
     */
    for (let frame = 0; frame < 10; frame++) {
      if (frame % 2 === 0) r.render(h.target(2400, 920), () => {});
      r.render(h.target(480, 40), () => {});
      h.tick();
    }
    expect(h.copies.length).toBe(15);
    expect(h.resizes.length, 'an alternate-frame large chart is thrashing the drawing buffer')
      .toBe(4);
  });

  it('reallocates the buffer once for a whole grid step, not once per chart', () => {
    const h = harness(); live = h;
    const r = renderer();
    /* Two charts a hundred pixels apart, both above the floor. Under grow-only these produced
       FOUR reallocations (1100x512, 1100x600, 1200x600, 1200x700) because every axis that grew
       by any amount grew the buffer; they now land on one bucket and the second is free. That
       matters most exactly here: reallocation cost tracks buffer area, measured at 0.97 ms for
       a 3200x1600 buffer and below the noise floor at 512x256. */
    r.render(h.target(1100, 600), () => {});
    const afterFirst = h.resizes.length;
    r.render(h.target(1200, 700), () => {});

    expect(h.resizes, 'the buffer no longer quantises to one bucket for both charts').toEqual([
      `${BUFFER_FLOOR_W}x0`, `${BUFFER_FLOOR_W}x${BUFFER_FLOOR_H}`,   // the initial size
      `1280x${BUFFER_FLOOR_H}`, '1280x768',                            // one grow, two axes
    ]);
    expect(h.resizes.length - afterFirst,
      'the second chart reallocated the drawing buffer although it shares the first bucket')
      .toBe(0);
    expect(h.copies.map((c) => [c.bufferW, c.bufferH])).toEqual([[1280, 768], [1280, 768]]);
  });

  it('keeps every copy inside a buffer that actually contains it, at awkward sizes', () => {
    const h = harness(); live = h;
    const r = renderer();
    /* A GUARD, NOT A REGRESSION TEST: this passed against the grow-only buffer too, because a
       buffer that only grows is trivially large enough. It exists because the fix introduces
       arithmetic that could make the buffer too SMALL — and a source rect that overhangs the
       buffer does not throw, it silently reads transparent pixels, which reads as a chart with
       its top or right edge missing. The sizes are deliberately off-grid and lopsided. */
    const sizes = [[1, 1], [7, 3], [480, 40], [1025, 513], [1280, 768], [1281, 769], [3199, 1599]] as const;
    expect(sizes.length).toBe(7);
    for (const [w, hh] of sizes) r.render(h.target(w, hh), () => {});

    expect(h.copies.length).toBe(sizes.length);
    for (const c of h.copies) {
      expect(c.bufferW, `buffer ${c.bufferW} is narrower than the ${c.sw} px it was copied from`)
        .toBeGreaterThanOrEqual(c.sw);
      expect(c.bufferH, `buffer ${c.bufferH} is shorter than the ${c.sh} px it was copied from`)
        .toBeGreaterThanOrEqual(c.sh);
      expect(c.sy, 'the source rect starts above the top of the buffer').toBeGreaterThanOrEqual(0);
      expect(c.sy + c.sh).toBe(c.bufferH);
    }
  });

  it('still hands out ONE context and ONE canvas, which is what killed the buffer pool', () => {
    const h = harness(); live = h;
    const r = renderer();
    /*
     * ALSO A GUARD — the grow-only code passed this, and `sharedCost.test.ts` asserts it for
     * the 60-chart page. It is repeated here against a page of WILDLY different sizes because
     * the obvious alternative fix was a POOL of size-bucketed buffers, and a WebGL context
     * belongs to one canvas, so a pool of buffers is a pool of CONTEXTS. Past the browser's
     * 8-16 cap the oldest context is killed silently, and on a chart route the oldest is this
     * one: the whole page of charts blanks and it looks like a data bug. If a future pass
     * reaches for the pool again, this is the line that says no.
     */
    const sizes = [[3200, 1600], [480, 40], [2400, 920], [64, 64], [1100, 600]] as const;
    expect(sizes.length).toBe(5);
    for (let pass = 0; pass < 3; pass++) for (const [w, hh] of sizes) r.render(h.target(w, hh), () => {});

    expect(h.contexts(), 'the buffer policy started creating more than one WebGL2 context').toBe(1);
    expect(h.canvases(), 'the buffer policy started creating more than one offscreen canvas').toBe(1);
  });

  it('hands setRegion the CHART size and never the bucket', () => {
    const h = harness(); live = h;
    const r = renderer();
    /*
     * THE TRAP THIS FIX HAD TO AVOID, and the reason `setRegion`'s reallocation cannot be fixed
     * from this file. Passing the bucket to `setRegion` would make consecutive differing charts
     * hit its same-size fast path and would delete the 39-textures-against-6 thrash pinned in
     * `sharedCost.test.ts` — which is exactly why someone will try it. It is wrong:
     * `stage.bindTarget` sets the viewport from the target's own size, so a bucket-sized `scene`
     * would render a 480x40 chart at 1024x512 scale and the blit would copy a window of it.
     * That is the defect recorded at `stage.ts:193-199` — 1.64x too large, bottom rows cropped
     * clean off, nothing thrown, and it merely looks wrong.
     *
     * A GUARD against a future change, not a regression test: the grow-only code passed it too.
     */
    r.render(h.target(480, 40), () => {});
    expect(h.allocs.length, 'no render target was allocated at all — the assertion below would '
      + 'then pass vacuously').toBeGreaterThan(0);
    /* Three at build (the canvas floor, before any chart is known) then three for the chart:
       scene at the exact chart size, and the two bloom targets at region >> 2. */
    expect(h.allocs).toEqual([
      `${BUFFER_FLOOR_W}x${BUFFER_FLOOR_H}`, '256x128', '256x128',
      '480x40', '120x10', '120x10',
    ]);
  });

  it('keeps the raw-canvas arms that are now the ONLY instrument for the cause', () => {
    /*
     * A RATCHET WITH A SPECIFIC VICTIM. `blit-cost.mjs` arm B established that the copy is
     * buffer-sized by GROWING the shared buffer and holding the chart fixed. This fix removes
     * the monotonic growth, so arm B can no longer vary the buffer and that half of the
     * instrument is dead. What replaced it is a set of arms on a RAW WebGL2 canvas, independent
     * of `sharedRenderer` — E2 (rect swept at a fixed canvas) and E3 (a second copy from an
     * unmodified canvas) are the two that identify the cost as a per-modification whole-buffer
     * RESOLVE rather than a copy. Delete them and the header's causal claim becomes an
     * unfalsifiable story, with the arm that used to check it already broken.
     */
    const script = resolve(__dirname, '../../../../docs/3d/blit-cost.mjs');
    expect(existsSync(script), `the blit measurement script is missing at ${script}`).toBe(true);
    const src = readFileSync(script, 'utf8');
    expect(src, 'the raw probe is gone, so nothing measures the buffer independently of shared.ts')
      .toContain('rawProbe');
    expect(src, 'the fixed-canvas / swept-rect arm is gone — that is the one that shows the '
      + 'source rectangle is not what is being paid for').toContain('E2');
    expect(src, 'the second-copy arm is gone — that is the one that shows it is one resolve per '
      + 'modification, not one per copy').toContain('E3');
    expect(src, 'the reallocation-cost arm is gone, and it is what justifies shrinking at all')
      .toContain('F1');
  });
});
