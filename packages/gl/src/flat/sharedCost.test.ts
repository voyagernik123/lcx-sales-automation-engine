import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sharedRenderer, resetSharedRenderer } from './shared.js';

/**
 * THE STRUCTURAL HALF OF A CLAIM THAT WAS ASSERTED IN THREE PLACES AND MEASURED IN NONE.
 *
 * `shared.ts:18-21` says the blit "costs one texture copy per chart per redraw, which is a
 * rounding error against a frame that already runs five post-process passes". `docs/3d/w2`'s
 * README and a commit body repeat it. It is load-bearing: it is the whole justification for
 * choosing blit-to-a-2-D-canvas over the scissored page-canvas the blueprint proposed
 * (`3D_VFX_FINAL_PLAN.md` §1.1), so if it is wrong a documented architectural decision rests
 * on a guess.
 *
 * The claim has two halves and they need two different instruments:
 *
 *   · "ONE TEXTURE COPY PER CHART PER REDRAW, and O(1) in chart count" — a claim about the
 *     SEQUENCE OF CALLS the renderer makes. That is exactly what a fake context can answer,
 *     and it is what this file answers, in a few milliseconds, inside the gate.
 *   · "A ROUNDING ERROR" — a claim in MILLISECONDS about a GPU. Node cannot measure GPU work at
 *     all and a fake context can be made to report any number you like, so NOTHING in this file
 *     asserts a millisecond figure. The instrument is `docs/3d/blit-cost.mjs`, and the last case
 *     here is a ratchet on that script existing and still using the right clock — this
 *     programme has already published figures ~140x wrong by timing with `gl.finish()` (0.45 ms
 *     for a frame that really took 63.7 ms).
 *
 * ── AND THAT MEASUREMENT HAS NOW BEEN TAKEN, WHICH CHANGES WHAT THE CLAIM IS WORTH ──────
 * Chrome on a real M1, ANGLE Metal, two runs, 2026-08-13, via `docs/3d/blit-cost.mjs`. One
 * 480x160 chart, the shipping frame (bar batch + additive pass + `pipeline.resolve`), offscreen
 * buffer at its initial 1024x512:
 *
 *     frame WITHOUT the blit   0.503 / 0.518 ms
 *     frame WITH the blit      0.970 / 1.162 ms
 *     the blit                 0.467 / 0.643 ms   =  0.9x to 1.2x the whole rest of the frame
 *
 * NOTE 2026-08-13: the GROW-ONLY behaviour this file's prose describes as live has since been fixed — the
 * buffer is quantised to a 256 px grid with a 1024x512 floor and shrinks after two quiet frames, so a
 * sparkline no longer "pays for that size on every redraw". EVERY ASSERTION BELOW STILL PASSES UNTOUCHED,
 * and the 1024x512 floor is what preserved the `resizes` expectation. The structural claims this file pins
 * (one context, one canvas, one drawImage per chart per redraw, O(1) in chart count) are unchanged.
 *
 * "A rounding error against a frame that already runs five post-process passes" is not what a
 * cost roughly EQUAL to those five passes plus the geometry is. And the copy turned out to be
 * sized by the OFFSCREEN BUFFER, not by the chart: with the chart held at 480x160 and only the
 * buffer grown, it cost 0.467 / 1.083 / 1.988 ms at 1024x512, 2400x920 and 3200x1600 — so on a
 * page where one large chart has grown the shared buffer, every 40-pixel sparkline pays for
 * that size on every redraw. `docs/3d/w2/README.md:314` raised exactly this and could not
 * settle it. The per-chart cost IS flat in chart count (0.476 ms/chart at 60 charts), which is
 * the half of the claim that held.
 *
 * None of those figures are asserted here, and they must not be: they belong to one machine and
 * one driver, and a test that pinned them would fail on any other. They are recorded because a
 * measurement nobody writes down gets re-guessed.
 *
 * WHAT THIS FILE FOUND, which the claim does not mention: the per-chart cost is one texture
 * copy ONLY while consecutive charts are the same device-pixel size. On charts of DIFFERING
 * sizes, `stage.setRegion` reallocates all three render targets per chart per redraw — see the
 * fourth case, where four charts alternating between two sizes over three redraws allocate 39
 * textures against 6 for the same charts at one size. That cost is O(charts x redraws), lands
 * on real dashboards (`KpiDashboard` mounts a donut and a column chart), and is invisible to
 * the sentence "one texture copy per chart per redraw". The same script measured what those
 * extra allocations cost on the M1: 7.05 ms against 4.29 ms for one four-chart redraw, so the
 * reallocation is a LARGER cost than the blit the claim is about.
 */

/* ── A WEBGL2 CONTEXT AND A 2-D CONTEXT THAT COUNT WHAT THEY ARE ASKED TO DO ─────── */

interface Blit {
  readonly sx: number; readonly sy: number;
  readonly sw: number; readonly sh: number;
  readonly dw: number; readonly dh: number;
  /** The offscreen buffer's size at the moment of the copy — the source the driver snapshots. */
  readonly bufferW: number; readonly bufferH: number;
}

interface Harness {
  /** How many WebGL2 contexts the whole run handed out. Rule 7's number. */
  readonly contexts: () => number;
  /** How many canvases the renderer asked the document for. */
  readonly canvases: () => number;
  /** GL calls, by name. `texImage2D` is the render-target allocation count. */
  readonly counts: Record<string, number>;
  /** Every `drawImage` the renderer issued, in order, with its source rectangle. */
  readonly blits: Blit[];
  /** Each time the offscreen drawing buffer was resized, as `w x h`. */
  readonly resizes: string[];
  readonly target: (w: number, h: number) => HTMLCanvasElement;
  readonly restore: () => void;
}

function harness(): Harness {
  const counts: Record<string, number> = {};
  const bump = (n: string) => { counts[n] = (counts[n] ?? 0) + 1; };
  const blits: Blit[] = [];
  const resizes: string[] = [];
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
    /* The float extension is PRESENT, matching the M1 this programme measures on: the
       8-bit path allocates the same three targets, so the counts below hold either way,
       but reporting the configuration that ships is the one that can be compared. */
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
  };

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return konst(prop);
      const impl = api[prop];
      if (impl) return impl;
      /* Everything else is a counted void command. `texImage2D`, `deleteTexture` and
         `drawArrays` all arrive through here, which is the point. */
      return (...a: never[]) => { bump(prop); void a; return undefined; };
    },
  }) as unknown as WebGL2RenderingContext;

  /** The one offscreen canvas, with its resizes observable. */
  const offscreen = (() => {
    let w = 0, h = 0;
    const c = {
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
    };
    return c as unknown as HTMLCanvasElement;
  })();

  const target = (w: number, h: number): HTMLCanvasElement => ({
    width: w,
    height: h,
    getContext: (kind: string) => (kind === '2d' ? {
      clearRect: () => { bump('clearRect'); },
      drawImage: (
        src: { width: number; height: number },
        sx: number, sy: number, sw: number, sh: number,
        _dx: number, _dy: number, dw: number, dh: number,
      ) => {
        bump('drawImage');
        blits.push({ sx, sy, sw, sh, dw, dh, bufferW: src.width, bufferH: src.height });
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

  return {
    contexts: () => contexts,
    canvases: () => canvases,
    counts, blits, resizes, target,
    restore() {
      resetSharedRenderer();
      if (prior === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prior;
    },
  };
}

/** `sharedRenderer()` or a failure that says which refusal came back instead. */
function renderer() {
  const r = sharedRenderer();
  if ('kind' in r) throw new Error(`the fake context refused a shared renderer: ${r.code}`);
  return r;
}

let live: Harness | null = null;
afterEach(() => { live?.restore(); live = null; });

describe('the blit claim — the half that is testable without a GPU', () => {
  it('hands out ONE context and ONE canvas for sixty charts, three redraws each', () => {
    const h = harness(); live = h;
    const r = renderer();
    const charts = Array.from({ length: 60 }, () => h.target(480, 160));
    /* NON-EMPTY FIRST. A loop over an empty array is a green test that renders nothing, and
       this repo has been bitten by exactly that twice. */
    expect(charts.length).toBe(60);
    for (let pass = 0; pass < 3; pass++) for (const c of charts) r.render(c, () => {});

    /* §6 rule 7's number, for the path that serves every flat chart in the app. The failure
       it forbids is not slowness: past the browser's 8-16 context cap the OLDEST context is
       killed silently, and on any route that mounts a chart the oldest context IS this one,
       so the whole page of charts blanks and it looks like a data bug. */
    expect(h.contexts(), 'the shared renderer created more than one WebGL2 context').toBe(1);
    expect(h.canvases(), 'the shared renderer created more than one offscreen canvas').toBe(1);
  });

  it('blits exactly once per chart per redraw, from that chart own rect and no more', () => {
    const h = harness(); live = h;
    const r = renderer();
    const sizes = [[480, 160], [480, 160], [480, 160]] as const;
    const charts = sizes.map(([w, hh]) => h.target(w, hh));
    expect(charts.length).toBe(3);
    for (let pass = 0; pass < 4; pass++) for (const c of charts) r.render(c, () => {});

    /* "One texture copy per chart per redraw": 3 charts x 4 redraws = 12 copies, and the
       clearRect that precedes each one is not a second copy of anything. */
    expect(h.blits.length, 'more or fewer than one drawImage per chart per redraw').toBe(12);
    expect(h.counts.drawImage).toBe(12);
    expect(h.counts.clearRect).toBe(12);

    for (const b of h.blits) {
      /* The COPIED RECTANGLE is the chart's own 480x160, not the 1024x512 buffer it lives in
         — which is what makes the copy chart-sized rather than buffer-sized, and is half of
         why the claim is plausible. The other half is whether the browser can honour a
         sub-rect without snapshotting the whole drawing buffer, which no test in Node can
         answer and which `docs/3d/blit-cost.mjs` measures by sweeping the buffer size. */
      expect([b.sw, b.sh], 'the blit copied something other than the chart rect').toEqual([480, 160]);
      expect([b.dw, b.dh]).toEqual([480, 160]);
      expect(b.sx, 'the source rect is not at the buffer left edge').toBe(0);
      /* GL's origin is bottom-left, so the region sits at the BOTTOM of the buffer and the
         2-D source y is `bufferH - h`. An off-by-one here shows only on odd sizes. */
      expect(b.sy, 'the source rect is not the bottom-left region shared.ts documents')
        .toBe(b.bufferH - 160);
    }
  });

  it('allocates render targets O(1) in chart count while the charts are one size', () => {
    const h1 = harness(); live = h1;
    let r = renderer();
    for (const c of [h1.target(480, 160)]) r.render(c, () => {});
    const one = h1.counts.texImage2D ?? 0;
    h1.restore();

    const h60 = harness(); live = h60;
    r = renderer();
    const charts = Array.from({ length: 60 }, () => h60.target(480, 160));
    expect(charts.length).toBe(60);
    for (let pass = 0; pass < 3; pass++) for (const c of charts) r.render(c, () => {});
    const sixty = h60.counts.texImage2D ?? 0;

    /*
     * SIX, AND THE SAME SIX FOR 1 CHART AND FOR 180 RENDERS. Three targets
     * (`scene`/`bloomA`/`bloomB`) are allocated when the context is built at 1024x512, and
     * three more the first time `setRegion` is asked for a size that is not that — after
     * which every same-size chart is free, which is the "repeated same-sized charts pay for
     * one allocation" contract in `stage.ts:setRegion`.
     */
    expect(one, 'a single chart no longer allocates 6 targets — the buffer contract changed').toBe(6);
    expect(sixty, 'target allocation now scales with chart count on a same-size page').toBe(6);
    /*
     * ZERO NOW, WAS 3 — and the change is the fix, which this file predicted. `setRegion` keeps replaced
     * target sets in an LRU keyed by exact size instead of deleting them, so the first size change parks
     * three targets rather than freeing them. They are freed on eviction (3 spares / 2.4M texels) and by
     * `dispose()`. The allocation contract above is unchanged at 6.
     */
    expect(h60.counts.deleteTexture ?? 0, 'a replaced target set is cached, not deleted').toBe(0);

    /* GROW ONLY, and only when a chart is bigger than the buffer. 480x160 fits inside the
       initial 1024x512, so the drawing buffer is never resized at all here — a resize
       reallocates it and, on some drivers, flushes the pipeline. */
    expect(h60.resizes, 'the drawing buffer was resized for charts that already fit')
      .toEqual(['1024x0', '1024x512']);
  });

  it('allocates O(charts x redraws) targets once the charts are NOT one size — the cost the claim omits', () => {
    const h = harness(); live = h;
    const r = renderer();
    /*
     * THE REAL CASE, NOT A CONTRIVED ONE. `KpiDashboard` mounts a `DonutChart` and a
     * `ColumnChart` in one `overflow-y-auto` column, and `useFlatChart` derives each canvas
     * from its own CSS size x devicePixelRatio, so consecutive `render` calls hand
     * `setRegion` different sizes. Every change deletes and rebuilds all three targets.
     */
    const charts = [h.target(480, 160), h.target(320, 320), h.target(480, 160), h.target(320, 320)];
    expect(charts.length).toBe(4);
    for (let pass = 0; pass < 3; pass++) for (const c of charts) r.render(c, () => {});

    const allocs = h.counts.texImage2D ?? 0;
    /*
     * NINE NOW, WAS THIRTY-NINE — AND THIS IS THE FIX THE OLD NOTE PREDICTED.
     *
     * What it used to say, kept because being right about the shape of a future fix is worth recording:
     * "39 = 3 at build + 3 per render x 12 renders ... pinned rather than fixed because flat/shared.ts is
     * not this file's to change. If a future change makes the renderer size-stable, this number DROPS and
     * the test fails — READ THAT AS THE FIX LANDING, NOT AS A REGRESSION."
     *
     * It landed, and not where that note expected. `flat/shared.ts` was not the lever: quantising its
     * buffer was measured and REFUSED, because the post-process chain reads `uv` across the whole texture
     * while writing a smaller viewport, and a 480x40 sparkline came out completely blank with nothing
     * thrown. The fix went into `stage.setRegion` instead — target sets kept in an LRU keyed by EXACT size,
     * so the region never stops being exact and no sampling assumption moves.
     *
     * 9 = 3 at build + 3 for the first 480x160 + 3 for the first 320x320. Every later render of either size
     * is a cache hit. So mixed sizes now cost 1.5x a single-size page rather than 6.5x, and the multiplier
     * no longer grows with the page — it is bounded by the number of DISTINCT sizes, not by renders.
     *
     * The entrance case the old note worked out is what this removes: two differently-sized charts running
     * useFlatChart's 420 ms rAF tween at 60 Hz allocated roughly 3 x 2 x 25 = 150 textures. It is now 6.
     */
    expect(allocs, 'mixed-size target allocation changed — read the note above before editing').toBe(9);
    /* Nothing is deleted during the run: the two sets are both live in the cache, under the 3-spare cap. */
    expect(h.counts.deleteTexture ?? 0, 'a cached target set was freed early').toBe(0);
    /* And it is still exactly one blit per chart per redraw: the extra cost is NOT in the
       copy the claim talks about, which is why the sentence can be true and still incomplete. */
    expect(h.blits.length).toBe(12);
  });

  it('names no millisecond figure, and keeps the instrument that could take one honest', () => {
    /*
     * THE ASSERTION THAT EXISTS BECAUSE OF A PUBLISHED WRONG NUMBER. `gl.finish()` returns on
     * command-buffer flush, not on GPU completion; this programme published 0.45 ms for a
     * frame that really took 63.7 ms, in a README and a commit message. The only reliable
     * pattern here is a warm-up frame plus a trailing `readPixels`, and the script is where
     * that lives — so the script is checked for it rather than trusted.
     */
    const script = resolve(__dirname, '../../../../docs/3d/blit-cost.mjs');
    expect(existsSync(script),
      `the blit measurement script is missing at ${script} — the ms half of shared.ts:18-21 `
      + 'then has no instrument at all, and this check would pass vacuously').toBe(true);
    const src = readFileSync(script, 'utf8');
    expect(src.length).toBeGreaterThan(2000);
    expect(src, 'the measurement lost its trailing readPixels').toContain('readPixels');
    expect(src, 'the measurement lost the 2-D-side readback that forces the blit to complete')
      .toContain('getImageData');
    /* `gl.finish()` may APPEAR — the comment explaining why it is not used is worth keeping —
       but it must never be the thing being awaited before the clock is read. */
    expect(/gl\.finish\(\)\s*;?\s*(?:const|let)?\s*t[0-9]?\s*=\s*performance\.now/.test(src),
      'the measurement times against gl.finish(), the clock that published 0.45 ms for 63.7 ms')
      .toBe(false);
  });
});
