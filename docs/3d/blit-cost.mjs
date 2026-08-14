/**
 * THE BLIT, MEASURED — the instrument for the one claim in `flat/shared.ts` that nothing had ever
 * timed, and now the instrument that guards the fix it forced.
 *
 * `flat/shared.ts` used to say the drawImage blit "costs one texture copy per chart per redraw,
 * which is a rounding error against a frame that already runs five post-process passes". That
 * sentence was the cost half of the justification for blitting to each chart's own 2-D canvas
 * instead of scissoring one page-sized canvas (`3D_VFX_FINAL_PLAN.md` §1.1), it was repeated in
 * `docs/3d/w2/README.md:17-18` and in a commit body, and `w2/README.md:219` states plainly that
 * nobody had measured it — bounding the cost only as `0 < cost <= 5.272 ms`.
 *
 * It is measured now and it was FALSE. The sentence has been removed from `shared.ts`; the
 * architectural decision stands on its two real reasons, which were never about cost. What the
 * measurement found instead was a performance DEFECT — the copy is priced by the whole offscreen
 * drawing buffer, which was grow-only — and that defect has been fixed. So this file is no longer
 * only a question-answerer: arms B and G are the before/after of a shipped change, and E and F are
 * the arms that identified the cause and priced the alternatives.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A UNIT TEST ────────────────────────────────────────────
 * The structural halves — one copy per chart per redraw, and what SIZE the buffer is at the moment
 * of each copy — are unit tests, and they are `packages/gl/src/flat/sharedCost.test.ts` and
 * `sharedBuffer.test.ts`. The millisecond halves are claims about a GPU. jsdom has no WebGL2 at
 * all and a fake context can be made to report any number you like, so a unit test that printed
 * milliseconds here would be fabricating them.
 *
 * ── THE CLOCK, WHICH THIS PROGRAMME HAS ALREADY GOT WRONG TWICE ─────────────────────────
 * `gl.finish()` returns when the command buffer is FLUSHED, not when the GPU is done. Timed
 * that way, this repo published 0.45 ms for a frame that actually took 63.7 ms — in a README
 * and in a commit message — a factor of 140. Every batch below therefore ends with a trailing
 * `readPixels`, which cannot be satisfied until the frame it reads exists, and starts with a
 * warm-up frame, because the first frame pays shader upload and texture allocation and would
 * otherwise dominate a short batch. `docs/3d/e5/entry.ts:625-645` is the corrected form this
 * follows.
 *
 * The blit's destination is a 2-D canvas, and a `readPixels` on the GL side does not prove the
 * 2-D copy landed. So each batch also ends with a 1-pixel `getImageData` on the destination,
 * which is the 2-D-side equivalent: it cannot return until the pending copies have been
 * applied. BOTH arms pay both readbacks, so the call overhead cancels and what remains in the
 * difference is the copy itself.
 *
 * ── WHY IT REFUSES ON A SOFTWARE RASTERISER ─────────────────────────────────────────────
 * Headless Chromium runs on SwiftShader. A `drawImage` from a WebGL canvas is one of the most
 * driver-dependent operations there is — a GPU-side blit on one path, a full read-back on
 * another — so a SwiftShader figure is not a weaker version of the answer, it is a different
 * quantity. `--headless` therefore runs the page (which is useful: it proves the instrument
 * works) and REFUSES to report its timings as the measurement, exiting non-zero.
 *
 *   Usage
 *     node docs/3d/blit-cost.mjs                 serve on 5601 and print the URL; open it in
 *                                                the real browser, on the real GPU. This is
 *                                                the run that answers the question.
 *     node docs/3d/blit-cost.mjs --headless      smoke the instrument under SwiftShader. Runs
 *                                                the arms, prints them, and refuses to call
 *                                                them an answer.
 *     node docs/3d/blit-cost.mjs --headless --gpu
 *                                                the same, with ANGLE pointed at Metal so
 *                                                headless Chromium gets the real GPU. The
 *                                                refusal still reads the RENDERER STRING, not
 *                                                the flag, so a machine with no GPU still
 *                                                exits 2. See the note on the launcher.
 *     node docs/3d/blit-cost.mjs --port 5610     another port (5599 is p1, 5600 is the trial).
 *
 * ── WHAT IT MEASURES, AND WHY EACH ARM EXISTS ───────────────────────────────────────────
 *   A · blit vs no-blit, same GL work        the per-chart cost of the copy itself
 *   B · a small chart AFTER a large one      the defect, and now the fix. Formerly read as a
 *                                            buffer sweep, which only worked because the buffer
 *                                            was grow-only; see the note on the arm itself
 *   C · 1, 4, 16, 60 charts                  whether per-chart cost is flat in chart count. The
 *                                            regression risk of any buffer change: these charts
 *                                            are all one size and must stay free
 *   D · one size vs two alternating sizes    `stage.setRegion` reallocates all three targets when
 *                                            consecutive charts differ in size — 39 texture
 *                                            allocations against 6 for the same twelve renders at
 *                                            one size. NOT fixed, and not fixable from
 *                                            `flat/shared.ts`; the arm is here so it stays visible
 *   E · a RAW canvas, no chart code          WHY the cost is what it is: swept canvas at a fixed
 *                                            rect, swept rect at a fixed canvas, a second copy
 *                                            from an unmodified canvas, and `preserveDrawingBuffer`
 *                                            both ways
 *   F · the alternatives, priced             one drawing-buffer reallocation; `readPixels` +
 *                                            `putImageData` against `drawImage`; and whether the
 *                                            order of the two axis assignments matters
 *   G · one large chart + k sparklines       the defect end to end, with the buffer sizes the
 *                                            shipping renderer actually settled on printed beneath
 *   H · one relief-shaped rebuild, 3 ways    what a `stage.ts` program cache can recover from a
 *                                            size-step or tier rebuild, and what it cannot because
 *                                            thirteen lines outside that file delete the programs
 *                                            themselves. Carries the frame hash that proves a
 *                                            cached program renders the same pixels
 *
 * ── WHAT THE RUNS RETURNED, so the next reader can tell drift from noise ────────────────
 * Chrome, ANGLE Metal Renderer: Apple M1, dpr 2, 2026-08-13. Two runs against the grow-only
 * buffer, then two more against the quantised one, all on the same machine in the same session.
 *
 * THE CAUSE (arms E, raw canvas, so no policy in `shared.ts` can affect it):
 *
 *     E1  480x160 copy, canvas 512x256 / 1024x512 / 2400x920 / 3200x1600
 *                                         0.50 / 0.57 / 1.37 / 2.41 ms   run 1
 *                                         0.55 / 0.59 / 1.47 / 2.47 ms   run 2 -> tracks the CANVAS
 *         the same with preserveDrawingBuffer FALSE
 *                                         0.53 / 0.57 / 1.43 / 2.48 ms   within noise of pdb true,
 *                                         0.55 / 0.59 / 1.49 / 2.91 ms   so NOT that flag
 *     E2  canvas fixed at 3200x1600, rect 8x8 / 480x160 / 1600x800
 *                                         2.49 / 2.63 / 2.52 ms   run 1
 *                                         2.74 / 3.00 / 2.51 ms   run 2 -> 20,000x the pixels for
 *                                         the same money; cost does NOT track the RECT
 *     E3  a SECOND copy, no GL work between
 *                                         below the noise floor in all three runs (|0.053| against
 *                                         0.230, |0.027| against 0.200, |0.093| against 0.467),
 *                                         where the FIRST copy costs about 2.52 ms
 *                                         -> ONE RESOLVE PER MODIFICATION, not per copy
 *
 * So: a `drawImage` out of a WebGL canvas resolves the WHOLE drawing buffer into a snapshot a 2-D
 * context can read, and applies the source rect to the snapshot afterwards.
 *
 * THE ALTERNATIVES (arms F). One drawing-buffer reallocation cost 0.79 to 0.97 ms at 3200x1600
 * across four runs, and was below the noise floor at 512x256 in every one of them — cheap where
 * small charts live, expensive only where the resolve it avoids is expensive too.
 * `readPixels`+`putImageData` beat `drawImage` by 0.96 / 0.98 / 1.02 ms at a 3200x1600 canvas and
 * LOST to it by 0.29 / 0.36 / 0.42 / 0.71 ms at 512x256, which is where the fix puts the buffer: a
 * fix for the symptom, not the cause. Ordering the two axis assignments to minimise the
 * intermediate buffer was below the noise floor in all three runs that measured it (|0.97| and
 * |0.28| against a spread of 1.09, |0.92| against 1.25) and the sign favoured the naive order.
 *
 * THE DEFECT, AND THE FIX (arms B and G, through the shipping `sharedRenderer`):
 *
 *                                                   grow-only        as it ships now
 *     B   480x160 chart, largest on page 1024x512   0.46 / 0.51      0.49 / 0.51
 *         480x160 chart, largest on page 2400x920   1.09 / 1.13      0.45 / 0.53
 *         480x160 chart, largest on page 3200x1600  1.92 / 1.98      0.49 / 0.51   -> 3.9x
 *     C   60 same-size charts, blit total           29.11 / 28.65    32.68 / 30.57
 *         the same, per chart                       0.485 / 0.478    0.545 / 0.510
 *     D   4 charts, two sizes minus one size        2.35, and below  1.90 / 2.11   setRegion, and
 *                                                   the noise floor                UNCHANGED
 *     G   2400x920 + 1x480x40, TOTAL frame          9.07             7.96 / 8.74
 *         2400x920 + 8x480x40, TOTAL frame          23.32            20.78 / 22.11
 *         the no-blit control of those two arms     4.32 / 7.03      4.07, 4.27 /
 *                                                                    6.15, 6.30
 *
 * B is the defect and the fix: with the chart fixed at 480x160, its cost no longer depends on what
 * else is on the page — the three rows used to rise and are now equal within their own noise.
 *
 * C is the REGRESSION RISK and it did not regress, but read it carefully rather than as an
 * improvement: 0.510-0.545 ms per chart against 0.478-0.485 is slightly WORSE, and it sits inside
 * the run-to-run spread this instrument shows on a single chart at this same buffer size (arm A's
 * blit cost was 0.477 / 0.535 / 0.552 / 0.505 / 0.522 across the five runs, a +-0.075 ms band).
 * These charts are all 480x160, which is under the buffer floor, so the code path is unchanged
 * apart from one scheduling call per render. Per-chart cost is still flat in chart count.
 *
 * G's totals moved less than its own noise floor at k=1, and the number that matters there is the
 * CONTROL arm: it copies nothing, and it is unchanged. That is the point of the design — while a
 * large chart keeps redrawing, the buffer does not move at all.
 *
 * AND THE ONE THAT IS NOT A TIMING. An intermediate version of the fix shrank the buffer on every
 * render. It fixed B and cost 7.44 ms a frame on G: 9.07 -> 16.51 at k=1, with the NO-BLIT control
 * going 4.32 -> 10.10 ms because two live bucket sizes meant four drawing-buffer reallocations per
 * frame. That is why the shrink is end-of-frame and conditional, and why this file now prints the
 * buffer size the renderer settled on next to the timings — a size is what the fix is about, and no
 * timing arm can show it. Those sizes came back correct in both runs of the shipped code, in both
 * directions: 1024x512 for a sparkline on a page whose largest chart is 3200x1600, and 2560x1024
 * held throughout a burst in which the 2400x920 chart redraws every frame.
 *
 * THE REBUILD (arm H). Same machine, `--headless --gpu`, 2026-08-15, seven runs. Arm H is a whole
 * rebuild rather than a frame and is the most load-sensitive thing this file measures — H-a ran
 * between 23.2 and 71.8 ms across the seven — so the four quietest are given and the RATIO is what
 * held. Ordered by H-a, quietest first:
 *
 *     H-a  every program recompiled (today)     23.2 / 25.0 / 26.4 / 27.6 ms
 *     H-b  every program kept                    6.1 /  6.8 /  7.4 /  6.6 ms
 *     H-c  only the stage-owned ones kept       18.7 / 20.7 / 25.4 / 21.7 ms
 *     H2   compileShader calls per rebuild      24.0 / 0.0 / 16.0    a COUNT, exact, load-free
 *     H3   30 frames across the three arms      ONE hash, ink 4419 px
 *
 * H-b IS THE RESULT: 3.6 to 4.7x across all seven runs, resolved above the spread in every one of
 * them, and it takes the rebuild from over one 60 Hz frame to well under.
 *
 * H-c IS NOT A RESULT, AND THIS FILE'S OWN RULE IS WHAT SAYS SO. Its saving came in between 1.0 and
 * 6.2 ms and cleared the run's spread in ONE of the seven. The honest report is the bound, not the
 * subtraction. What is not noise is H2: 16 shader compilations against 24 is decided by JS before
 * any driver sees it, and it comes back identical from a `--headless` SwiftShader run.
 *
 * WHAT SEPARATES H-b FROM H-c IS NOT IN `stage.ts` AT ALL. Thirteen call sites delete the programs
 * the stage compiled for them: `env/lit.ts:883-885`, `env/ao.ts:354`, `env/sky.ts:159`,
 * `env/dof.ts:219`, `env/volume.ts:500`, `env/particles.ts:596-597`, `primitives/points.ts`,
 * `primitives/lines.ts`, `flat/bars.ts:276`, `flat/strokes.ts:168` — ten modules, counted from a
 * search by `packages/gl/src/stage.test.ts` rather than listed. `look/pipeline.ts:197` is
 * the one that already leaves them to the stage, and its three programs plus the component's own
 * `present` are exactly the eight shaders H-c recovers. H-b is what those thirteen lines are worth.
 *
 * Runs on one machine are not a characterisation — no M2, M3 or non-Apple GPU has ever been
 * measured in this programme — which is why this file exists as a script anyone can re-run rather
 * than as a number in a README.
 *
 * ── AND WHAT IT REPORTS WHEN THE ANSWER IS "TOO SMALL TO SEE" ───────────────────────────
 * Each arm runs several batches and reports the MEDIAN with the spread. If the difference
 * between two arms is smaller than the spread of either, the script says so and reports a
 * BOUND rather than a figure. "Below this run's noise floor of +-0.0N ms" is a real result and
 * it is the one that would have vindicated the claim; a mean of two noisy numbers presented to
 * three decimal places is not.
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const GL_INDEX = join(ROOT, 'packages/gl/src/index.ts');

const argv = process.argv.slice(2);
const HEADLESS = argv.includes('--headless');
const PORT = Number(argv[argv.indexOf('--port') + 1]) || 5601;

/* ══ THE PAGE ═══════════════════════════════════════════════════════════════════════════
 *
 * Bundled from source through esbuild rather than hand-written GL, so the thing measured is
 * the shipping `sharedRenderer` and the shipping chart frame — bar batch, additive pass,
 * `pipeline.resolve` (bright -> four blurs -> composite). Measuring a bare `gl.clear` and a
 * copy would answer a question nobody asked.
 */
const PAGE_JS = /* js */ `
import {
  sharedRenderer, resetSharedRenderer, createBarBatch, createPipeline, plotMatrix,
  beginAdditive, endPass, hexToLinear, exposure,
  createStage, isStage, createLitRenderer, createSkyBackdrop, createAmbientOcclusion,
  createShadowMap, createTarget3D, uploadMesh, box,
} from ${JSON.stringify(GL_INDEX)};

const out = (msg) => { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); };

/* ── DEVICE, FIRST, because every number below is meaningless without it ─────────────── */
const probe = document.createElement('canvas').getContext('webgl2');
if (!probe) {
  document.title = 'REFUSED';
  window.__BLIT_RESULT = { refused: 'NO_WEBGL2' };
  out('REFUSED: no WebGL2 in this browser. There is nothing to measure and no number to invent.');
  throw new Error('NO_WEBGL2');
}
const dbg = probe.getExtension('WEBGL_debug_renderer_info');
const RENDERER = dbg ? probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '(masked)';
const VENDOR = dbg ? probe.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '(masked)';
/* The list is deliberately broad: a false "software" verdict costs a re-run, a false
   "hardware" verdict publishes a number about the wrong machine. */
const SOFTWARE = /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(String(RENDERER));

/* ── THE CHART FRAME, AS IT SHIPS ───────────────────────────────────────────────────── */
const BARS = Array.from({ length: 24 }, (_, i) => ({ v: 0.25 + 0.7 * Math.abs(Math.sin(i * 0.7)) }));
function makeDraw(cache) {
  return (stage, w, h) => {
    const gl = stage.gl;
    if (cache.stage !== stage) {
      cache.stage = stage;
      cache.bars = createBarBatch(stage);
      cache.pipeline = createPipeline(stage);
    }
    const { bars, pipeline } = cache;
    if (!bars || 'kind' in bars || !pipeline || 'kind' in pipeline) return;
    const mvp = plotMatrix(0, w, h, 0);
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    beginAdditive(gl);
    const step = w / BARS.length;
    bars.draw(mvp, BARS.map((b, i) => ({
      x0: i * step + 2, x1: (i + 1) * step - 2,
      y0: h, y1: h - b.v * h,
      colour: exposure(hexToLinear('#2C6BFF'), 0.62),
    })), { orientation: 'vertical', modelling: 0.52, edgeStops: -0.2, contact: 0.7, radius: 3 });
    endPass(gl);
    pipeline.resolve({ plate: [0, 0, 0], bloomGain: 0.3, threshold: [0.3, 1.1], vignetteDepth: 0, transparent: true });
  };
}

/* ── TARGETS ────────────────────────────────────────────────────────────────────────────
 *
 * The no-blit control is not "a different code path". \`shared.ts\` returns early when
 * \`target.getContext('2d')\` is null, so a target object whose 2-D context is null runs
 * byte-identical GL work — same setRegion, same viewport, same scissor, same draw — and then
 * does not copy. Nothing about the measured frame differs except the copy under test, which is
 * the only way this subtraction means anything.
 */
const realTarget = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const nullTarget = (w, h) => ({ width: w, height: h, getContext: () => null });

/* A scratch 2-D canvas so BOTH arms pay for a getImageData call. In the blit arm it forces the
   pending copies to land; in the control it costs the call and nothing else, and the difference
   between those two is precisely the work being measured. */
const scratch = document.createElement('canvas');
scratch.width = scratch.height = 4;
const scratchCtx = scratch.getContext('2d', { willReadFrequently: false });

const px = new Uint8Array(4);
function drain(stage, ctx) {
  stage.gl.readPixels(0, 0, 1, 1, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, px);
  ctx.getImageData(0, 0, 1, 1);
}

/**
 * One batch: warm-up frame, drain, clock, N frames, drain.
 *
 * The warm-up is outside the clock because the first frame pays shader upload and target
 * allocation; averaged into a short batch that alone can dominate the result.
 */
function batch(renderPass, n, stage, ctx) {
  renderPass();
  drain(stage, ctx);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) renderPass();
  drain(stage, ctx);
  return performance.now() - t0;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Median, and the spread that decides whether a difference is reportable at all. */
function run(label, renderPass, frames, stage, ctx, batches = 7) {
  const ms = [];
  for (let b = 0; b < batches; b++) ms.push(batch(renderPass, frames, stage, ctx));
  return { label, frames, per: median(ms) / frames, lo: Math.min(...ms) / frames, hi: Math.max(...ms) / frames };
}

/** A fresh renderer per arm, so one arm's grown buffer cannot change the next arm's cost. */
function fresh() {
  resetSharedRenderer();
  const r = sharedRenderer();
  if ('kind' in r) throw new Error('shared renderer refused: ' + r.code);
  return r;
}

const CHART = [480, 160];
const results = [];
const notes = [];
/* The buffer size the shipping renderer actually settled on, recorded rather than assumed: the
   whole fix is a claim about this number and a timing arm cannot show it. */
const bufferAtBlit = [];

/* ── A FRAME BOUNDARY THIS FILE CONTROLS ──────────────────────────────────────────────────
 *
 * \`shared.ts\` relaxes the offscreen buffer at the END OF AN ANIMATION FRAME in which nothing
 * asked for it to be bigger, via \`requestAnimationFrame\`. Two problems with letting the real
 * one run here, and they point the same way.
 *
 * First, it does not run. A browser does not fire \`requestAnimationFrame\` in a hidden or
 * throttled tab, and this page is opened by tooling that may well hold it that way — measured:
 * \`document.visibilityState\` was "hidden" and five requested frames had not arrived after
 * 3000 ms, which hung the sweep rather than failing it.
 *
 * Second, even where it does run, "how many frames have passed" is precisely the variable these
 * arms need to hold FIXED. A batch of sixty synchronous renders is one frame or sixty depending
 * on nothing the measurement controls.
 *
 * So the scheduler is substituted and \`endFrame()\` dispatches it. This changes WHEN the buffer
 * is allowed to relax, which is the thing being controlled; it does not touch the GL work, the
 * copy, or the clock, which are the things being measured. Every timing below is still the real
 * driver doing real work.
 */
let frameQueue = [];
window.requestAnimationFrame = (cb) => { frameQueue.push(cb); return frameQueue.length; };
const endFrame = () => { const q = frameQueue; frameQueue = []; for (const cb of q) cb(); };

/* ── A · the copy itself ────────────────────────────────────────────────────────────── */
{
  const r = fresh(); const cache = {}; const draw = makeDraw(cache);
  const hot = realTarget(CHART[0], CHART[1]);
  const cold = nullTarget(CHART[0], CHART[1]);
  const withBlit = run('A blit', () => r.render(hot, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  const without = run('A no-blit', () => r.render(cold, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  results.push(withBlit, without);
  notes.push(diff('A · one 480x160 chart: cost of the blit', withBlit, without));
}

/* ── B · DOES A LARGE CHART ON THE PAGE TAX A SMALL ONE? ─────────────────────────────
 *
 * This arm used to be read as a BUFFER SWEEP, and it worked as one only because \`shared.ts\`
 * was grow-only: rendering one big chart set the buffer for the session, so the three rows
 * below really were three buffer sizes with the chart held at 480x160. That is the arm that
 * found the defect. It no longer works that way, and it should not: the buffer is now
 * quantised to the current chart, so it shrinks back before the 480x160 measurement and the
 * three rows are expected to be EQUAL. Equal rows are the fix; a rising sequence is the
 * regression. The buffer sweep itself moved to E1, which owns a raw canvas and does not
 * depend on any policy in \`shared.ts\` to vary the thing it varies.
 */
for (const [bw, bh] of [[1024, 512], [2400, 920], [3200, 1600]]) {
  const r = fresh(); const cache = {}; const draw = makeDraw(cache);
  /* One big chart first, exactly as a real page does. Its own cost is not measured — only what
     it leaves behind for the small chart that follows it. */
  if (bw > 1024 || bh > 512) {
    const big = nullTarget(bw, bh);
    r.render(big, (f) => draw(r.stage, f.width, f.height));
  }
  const hot = realTarget(CHART[0], CHART[1]);
  const cold = nullTarget(CHART[0], CHART[1]);
  /* FRAME BOUNDARIES, and this arm is worthless without them. The buffer relaxes only at the end
     of a frame in which nothing asked for it to be bigger, so a batch of back-to-back renders —
     which is what every other arm here is — never reaches one and never sees the buffer shrink.
     Four is more than the two the policy asks for. The large chart is deliberately NOT redrawn in
     any of them, because it is exactly the case where it has stopped that a relax is allowed. */
  for (let f = 0; f < 4; f++) {
    r.render(hot, (fr) => draw(r.stage, fr.width, fr.height));
    endFrame();
  }
  bufferAtBlit.push('B ' + bw + 'x' + bh + ' -> buffer ' + r.stage.gl.canvas.width + 'x' + r.stage.gl.canvas.height);
  const withBlit = run('B blit after ' + bw + 'x' + bh, () => r.render(hot, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  const without = run('B no-blit after ' + bw + 'x' + bh, () => r.render(cold, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  results.push(withBlit, without);
  notes.push(diff('B · 480x160 chart on a page whose largest chart is ' + bw + 'x' + bh, withBlit, without));
}

/* ── C · does per-chart cost stay flat in chart count? ──────────────────────────────── */
for (const n of [1, 4, 16, 60]) {
  const r = fresh(); const cache = {}; const draw = makeDraw(cache);
  const hots = Array.from({ length: n }, () => realTarget(CHART[0], CHART[1]));
  const colds = Array.from({ length: n }, () => nullTarget(CHART[0], CHART[1]));
  const pass = (ts) => () => { for (const t of ts) r.render(t, (f) => draw(r.stage, f.width, f.height)); };
  const withBlit = run('C blit x' + n, pass(hots), 10, r.stage, scratchCtx);
  const without = run('C no-blit x' + n, pass(colds), 10, r.stage, scratchCtx);
  results.push(withBlit, without);
  notes.push(diff('C · ' + n + ' same-size charts per frame (per FRAME, so divide by ' + n + ' for per chart)', withBlit, without));
}

/* ── D · the setRegion thrash the structural test pins ──────────────────────────────── */
{
  const r1 = fresh(); const c1 = {}; const d1 = makeDraw(c1);
  const same = [realTarget(480, 160), realTarget(480, 160), realTarget(480, 160), realTarget(480, 160)];
  const one = run('D one size x4', () => { for (const t of same) r1.render(t, (f) => d1(r1.stage, f.width, f.height)); }, 10, r1.stage, scratchCtx);
  const r2 = fresh(); const c2 = {}; const d2 = makeDraw(c2);
  const mixed = [realTarget(480, 160), realTarget(320, 320), realTarget(480, 160), realTarget(320, 320)];
  const two = run('D two sizes x4', () => { for (const t of mixed) r2.render(t, (f) => d2(r2.stage, f.width, f.height)); }, 10, r2.stage, scratchCtx);
  results.push(one, two);
  notes.push(diff('D · 4 charts, one size vs two alternating sizes (target reallocation)', two, one));
}

/* ── D2 · THE ALLOCATION COUNT, WHICH IS THE QUANTITY ARM D IS A CONSEQUENCE OF ───────
 *
 * Arm D times the thrash. It cannot say how many allocations caused it, and a timing that
 * moves without a count to explain it is how a driver's scheduling gets published as a fix.
 * This counts \`texImage2D\` on the real context through the real \`sharedRenderer\`, for the
 * same twelve renders arm D times.
 *
 * A COUNT IS NOT A TIMING, and this is the one line in the file that a software rasteriser
 * cannot corrupt: how many textures the renderer asks for is decided by JS before any driver
 * sees it. So this arm is reportable from a \`--headless\` run, and the refusal above still
 * applies to every millisecond around it.
 *
 * \`packages/gl/src/flat/sharedCost.test.ts\` asserts the same quantity against a FAKE context.
 * The point of measuring it here as well is that the fake one can drift from the real one:
 * this arm counts whatever the shipping primitives and pipeline also allocate, which no fake
 * harness models.
 */
{
  const proto = WebGL2RenderingContext.prototype;
  const realTexImage2D = proto.texImage2D;
  let allocs = 0;
  proto.texImage2D = function (...a) { allocs += 1; return realTexImage2D.apply(this, a); };
  const countAllocs = (targets) => {
    const r = fresh(); const c = {}; const d = makeDraw(c);
    allocs = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const t of targets) r.render(t, (f) => d(r.stage, f.width, f.height));
    }
    return allocs;
  };
  const oneSize = countAllocs([realTarget(480, 160), realTarget(480, 160), realTarget(480, 160), realTarget(480, 160)]);
  const twoSizes = countAllocs([realTarget(480, 160), realTarget(320, 320), realTarget(480, 160), realTarget(320, 320)]);
  proto.texImage2D = realTexImage2D;
  notes.push({
    label: 'D2', delta: twoSizes - oneSize, noise: 0, resolved: true,
    text: 'D2 · texture allocations for those same twelve renders: ' + oneSize + ' at one size, '
      + twoSizes + ' at two alternating sizes. A COUNT, not a timing — valid under a software '
      + 'rasteriser as well.',
  });
}

/* ══ E · THE CAUSE, MEASURED WITH \`shared.ts\` OUT OF THE WAY ══════════════════════════════
 *
 * Arms A-D establish THAT the copy is sized by the offscreen buffer. They cannot say WHY, and
 * they run every frame through \`sharedRenderer\`, so the moment \`shared.ts\` changes its buffer
 * policy they stop being able to ask the question at all — B's sweep works by GROWING the
 * shared buffer, and a renderer that no longer grows it monotonically has no sweep left to do.
 * These arms own a RAW WebGL2 canvas and a RAW \`drawImage\`, so the causal claim stays
 * re-measurable whatever the shipping policy becomes, and the design arms below can price the
 * alternatives without any of them having to be built first.
 *
 * THE HYPOTHESIS: a \`drawImage\` whose source is a WebGL canvas cannot sample the drawing buffer
 * in place. The browser must first RESOLVE the whole drawing buffer into a snapshot a 2-D
 * context can read, and the source rectangle is then applied TO THE SNAPSHOT — after the
 * expensive part. Three consequences, each falsifiable and each measured below:
 *
 *   E1  cost tracks the CANVAS area with the source rect held fixed
 *   E2  cost barely tracks the SOURCE RECT with the canvas held fixed
 *   E3  a second \`drawImage\` with no GL work between the two is nearly free, because the
 *       snapshot taken for the first is still valid
 *
 * E1 also runs with \`preserveDrawingBuffer\` FALSE as well as true, because \`stage.ts:165\`
 * hardcodes it true for the capture harness, and "the capture flag is what costs every
 * sparkline 2 ms" would be a different defect with a different owner and a different fix.
 *
 * The raw context is configured exactly as \`createStage\` configures the shipping one —
 * \`antialias:false, alpha:true, premultipliedAlpha:false\` — because an MSAA back buffer has a
 * resolve of its own and would confound the one under test.
 */
const rawProbe = (pdb) => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('webgl2', {
    antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: pdb,
  });
  if (!g) throw new Error('raw probe got no webgl2 context');
  return { c, g };
};

/* Non-zero, opaque, and the SAME work in every arm: what is being subtracted is the copy, so
   the GL side must be identical on both sides of the subtraction. The trailing \`readPixels\` in
   \`drain\` is what forces this clear to actually happen — a deferred fast-path clear that only
   resolved inside the blit arm would be scored as the blit's cost. */
const rawFrame = (g) => {
  g.bindFramebuffer(g.FRAMEBUFFER, null);
  g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
  g.clearColor(0.2, 0.45, 0.9, 1);
  g.clear(g.COLOR_BUFFER_BIT);
};

/** Did the copy actually land? A timing for a blit that wrote nothing is not a timing for a blit. */
const landed = (ctx) => {
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return d[3] !== 0 && (d[0] | d[1] | d[2]) !== 0;
};

const dest = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: false });
};

const PROBE_FRAMES = 30, PROBE_BATCHES = 5;

/* ── E1 · cost vs CANVAS area, source rect fixed at the 480x160 chart ────────────────── */
const rawTrue = rawProbe(true);
const rawFalse = rawProbe(false);
for (const [tag, probeCtx] of [['pdb=1', rawTrue], ['pdb=0', rawFalse]]) {
  const c = probeCtx.c, g = probeCtx.g;
  for (const [bw, bh] of [[512, 256], [1024, 512], [2400, 920], [3200, 1600]]) {
    c.width = bw; c.height = bh;
    const d = dest(480, 160);
    const copy = () => { rawFrame(g); d.clearRect(0, 0, 480, 160); d.drawImage(c, 0, bh - 160, 480, 160, 0, 0, 480, 160); };
    const ctrl = () => { rawFrame(g); d.clearRect(0, 0, 480, 160); };
    const a = run('E1 blit ' + tag + ' buf ' + bw + 'x' + bh, copy, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    const b = run('E1 ctrl ' + tag + ' buf ' + bw + 'x' + bh, ctrl, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    copy();
    results.push(a, b);
    notes.push(diff('E1 · raw 480x160 copy out of a ' + bw + 'x' + bh + ' canvas, ' + tag
      + (landed(d) ? '' : '  [!! THE COPY WROTE NOTHING — this is not a timing of a blit]'), a, b));
  }
}

/* ── E2 · cost vs SOURCE RECT, canvas fixed at 3200x1600 ──────────────────────────────
 *
 * The discriminating arm. If the cost were the copy, 8x8 would be ~20,000x cheaper than
 * 1600x800. If the cost is a whole-canvas resolve, all three land within noise of each other. */
{
  const c = rawTrue.c, g = rawTrue.g;
  c.width = 3200; c.height = 1600;
  for (const [w, h] of [[8, 8], [480, 160], [1600, 800]]) {
    const d = dest(1600, 800);
    const copy = () => { rawFrame(g); d.clearRect(0, 0, w, h); d.drawImage(c, 0, 1600 - h, w, h, 0, 0, w, h); };
    const ctrl = () => { rawFrame(g); d.clearRect(0, 0, w, h); };
    const a = run('E2 blit rect ' + w + 'x' + h, copy, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    const b = run('E2 ctrl rect ' + w + 'x' + h, ctrl, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    copy();
    results.push(a, b);
    notes.push(diff('E2 · ' + w + 'x' + h + ' copy out of a FIXED 3200x1600 canvas'
      + (landed(d) ? '' : '  [!! wrote nothing]'), a, b));
  }
}

/* ── E3 · is the expensive part per-COPY or per-RESOLVE? ──────────────────────────────
 *
 * Two \`drawImage\` calls with NO GL work between them, against one. Under the resolve
 * hypothesis the second copy reuses the snapshot the first forced and is nearly free; if the
 * cost were the copy itself the frame would cost about twice as much. */
{
  const c = rawTrue.c, g = rawTrue.g;
  c.width = 3200; c.height = 1600;
  const d = dest(480, 160);
  const one = () => { rawFrame(g); d.drawImage(c, 0, 1440, 480, 160, 0, 0, 480, 160); };
  const two = () => { rawFrame(g); d.drawImage(c, 0, 1440, 480, 160, 0, 0, 480, 160); d.drawImage(c, 0, 1440, 480, 160, 0, 0, 480, 160); };
  const a = run('E3 two copies', two, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
  const b = run('E3 one copy', one, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
  results.push(a, b);
  notes.push(diff('E3 · the SECOND copy from the same unmodified 3200x1600 canvas', a, b));
}

/* ══ F · PRICING THE FIXES BEFORE CHOOSING ONE ════════════════════════════════════════
 *
 * F1 · WHAT ONE DRAWING-BUFFER REALLOCATION COSTS. \`shared.ts\` is grow-only precisely to
 *      avoid this, and that policy is what makes a sparkline pay a large chart's resolve. If a
 *      resize is cheap relative to the resolve it saves, the policy is the wrong trade and
 *      bucketing the buffer is the fix. Assigning \`canvas.width\` reallocates even when the
 *      value is unchanged, which is how ONE resize is isolated from a size CHANGE.
 * F2 · THE READBACK PATH. \`readPixels\` the chart's own rect off the default framebuffer, flip
 *      the rows, \`putImageData\`. It never asks the browser for a canvas snapshot at all, so it
 *      should be canvas-size-independent — against which it is a hard pipeline stall and it
 *      copies through JS. Measured at both ends of the buffer range rather than argued about.
 */
{
  const c = rawTrue.c, g = rawTrue.g;
  for (const [bw, bh] of [[512, 256], [3200, 1600]]) {
    c.width = bw; c.height = bh;
    const d = dest(480, 160);
    const blit = () => { rawFrame(g); d.drawImage(c, 0, bh - 160, 480, 160, 0, 0, 480, 160); };
    const resized = () => { c.width = bw; rawFrame(g); d.drawImage(c, 0, bh - 160, 480, 160, 0, 0, 480, 160); };
    const a = run('F1 blit+realloc ' + bw + 'x' + bh, resized, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    const b = run('F1 blit ' + bw + 'x' + bh, blit, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    results.push(a, b);
    notes.push(diff('F1 · one drawing-buffer reallocation at ' + bw + 'x' + bh, a, b));
  }

  const rbBuf = new Uint8ClampedArray(480 * 160 * 4);
  const rbImg = new ImageData(480, 160);
  const readback = (dctx) => {
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.readPixels(0, 0, 480, 160, g.RGBA, g.UNSIGNED_BYTE, rbBuf);
    /* GL rows are bottom-up and ImageData is top-down. Skipping the flip would put the chart
       upside down, so this loop is a correctness cost the arm has to pay to be a fair swap. */
    const row = 480 * 4;
    for (let y = 0; y < 160; y++) rbImg.data.set(rbBuf.subarray((159 - y) * row, (160 - y) * row), y * row);
    dctx.putImageData(rbImg, 0, 0);
  };
  for (const [bw, bh] of [[512, 256], [3200, 1600]]) {
    c.width = bw; c.height = bh;
    const d = dest(480, 160);
    const rb = () => { rawFrame(g); readback(d); };
    const bl = () => { rawFrame(g); d.drawImage(c, 0, bh - 160, 480, 160, 0, 0, 480, 160); };
    const a = run('F2 readPixels ' + bw + 'x' + bh, rb, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    const b = run('F2 drawImage ' + bw + 'x' + bh, bl, PROBE_FRAMES, { gl: g }, d, PROBE_BATCHES);
    rb();
    results.push(a, b);
    notes.push(diff('F2 · readPixels+putImageData MINUS drawImage, canvas ' + bw + 'x' + bh
      + (landed(d) ? '' : '  [!! the readback wrote nothing]'), a, b));
  }
}

/* ── F3 · does the ORDER of the two axis assignments matter? ──────────────────────────
 *
 * There is no atomic size setter on a canvas, so changing 1024x512 to 3200x1600 reallocates
 * TWICE and passes through an intermediate buffer: 3200x512 if width goes first, 1024x1600 if
 * height does. F1 shows reallocation cost tracks buffer area, so the intermediate is paid for
 * and the cheaper one is worth picking. This arm exists because a fix that resizes the buffer
 * is about to do this on every bucket change, and "pick the smaller intermediate" would
 * otherwise be a plausible-sounding inference with no number behind it.
 */
{
  const c = rawTrue.c, g = rawTrue.g;
  const d = dest(480, 160);
  const A = [1024, 512], B = [3200, 1600];
  const widthFirst = (w, h) => { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; };
  const smaller = (w, h) => {
    if (w * c.height <= c.width * h) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; }
    else { if (c.height !== h) c.height = h; if (c.width !== w) c.width = w; }
  };
  const trip = (set) => () => {
    set(A[0], A[1]); rawFrame(g); d.drawImage(c, 0, A[1] - 160, 480, 160, 0, 0, 480, 160);
    set(B[0], B[1]); rawFrame(g); d.drawImage(c, 0, B[1] - 160, 480, 160, 0, 0, 480, 160);
  };
  const a = run('F3 width-first round trip', trip(widthFirst), 10, { gl: g }, d, PROBE_BATCHES);
  const b = run('F3 smaller-intermediate trip', trip(smaller), 10, { gl: g }, d, PROBE_BATCHES);
  results.push(a, b);
  notes.push(diff('F3 · always-width-first MINUS smaller-intermediate-first, 1024x512 <-> 3200x1600', a, b));
}

/* ══ G · THE DEFECT END TO END, WHICH IS THE ARM THE FIX HAS TO MOVE ══════════════════
 *
 * One large chart and k sparklines on one page, every one of them redrawn in the frame. This is
 * the shape the grow-only buffer taxes: the large chart sets the buffer size and each sparkline
 * then pays a resolve of it. k=1 and k=8 because the arithmetic of any shrinking fix turns on k
 * — a shrink pays for itself only if enough small charts follow it — and \`useFlatChart\` puts
 * far more sparklines on a page than large charts.
 *
 * These absolute figures also contain the \`setRegion\` reallocation of arm D, because mixed
 * sizes are the whole point of the arm and \`stage.ts\` is not this file's to change. That cost
 * is present identically in both the blit and the control arm, so it cancels out of the
 * difference, and it is present identically before and after any change to \`shared.ts\`.
 */
for (const k of [1, 8]) {
  const r = fresh(); const cache = {}; const draw = makeDraw(cache);
  const bigHot = realTarget(2400, 920), bigCold = nullTarget(2400, 920);
  const sparkHot = Array.from({ length: k }, () => realTarget(480, 40));
  const sparkCold = Array.from({ length: k }, () => nullTarget(480, 40));
  const pass = (big, sparks) => () => {
    r.render(big, (f) => draw(r.stage, f.width, f.height));
    for (const s of sparks) r.render(s, (f) => draw(r.stage, f.width, f.height));
  };
  const withBlit = run('G blit 2400x920 + ' + k + 'x480x40', pass(bigHot, sparkHot), 10, r.stage, scratchCtx);
  const without = run('G no-blit 2400x920 + ' + k + 'x480x40', pass(bigCold, sparkCold), 10, r.stage, scratchCtx);
  results.push(withBlit, without);
  notes.push(diff('G · one 2400x920 chart + ' + k + ' 480x40 sparklines, ALL redrawn, per FRAME', withBlit, without));

  /* AND THE DECLINE, OBSERVED RATHER THAN ARGUED. The timings above run back-to-back with no
     frame boundary, so they cannot show whether the buffer WOULD have shrunk. These two loops
     drive real animation frames: with the large chart redrawing in every one, the buffer must
     stay large (shrinking it there is the 7.44 ms regression); with only sparklines, it must
     relax. If the first line below ever shows the small buffer, the regression is back. */
  const gl0 = r.stage.gl;
  for (let f = 0; f < 4; f++) {
    r.render(bigCold, (fr) => draw(r.stage, fr.width, fr.height));
    for (const s of sparkCold) r.render(s, (fr) => draw(r.stage, fr.width, fr.height));
    endFrame();
  }
  bufferAtBlit.push('G k=' + k + ' large chart still redrawing -> buffer ' + gl0.canvas.width + 'x' + gl0.canvas.height);
  for (let f = 0; f < 4; f++) {
    for (const s of sparkCold) r.render(s, (fr) => draw(r.stage, fr.width, fr.height));
    endFrame();
  }
  bufferAtBlit.push('G k=' + k + ' large chart stopped        -> buffer ' + gl0.canvas.width + 'x' + gl0.canvas.height);
}

/* ══ H · THE REBUILD, AND WHAT A PROGRAM CACHE IN \`stage.ts\` CAN ACTUALLY RECOVER ═════
 *
 * THE OPERATION. Every relief keys its setup effect on \`[heightPx, onRefused, tier]\`
 * (\`SurfaceReliefGl.tsx:633\` and six like it), and \`GlobeRelief.tsx:99\` quantises the measured
 * height to 24 px BECAUSE each distinct value tears the stage down. So a window drag walks
 * through one full rebuild per 24 px of height, and a quality-tier probe adds one more per page
 * load. \`fd7fa0d\` removed the data-change rebuilds; these two are what is left.
 *
 * WHY THERE ARE THREE ARMS AND NOT TWO. A program is DOUBLE-OWNED in this package: the stage
 * compiled it, and the renderer that asked for it deletes it in its own \`dispose()\` —
 * \`env/lit.ts:883-885\`, \`env/ao.ts:354\`, \`env/sky.ts:159\` and ten more. \`look/pipeline.ts:197\`
 * is the only one that does not ("Programs are owned and freed by the Stage"). A cache confined
 * to \`stage.ts\` therefore cannot keep the programs those thirteen lines delete, however it is
 * written. So the question is not "cache or no cache" but "what does each of the two possible
 * caches buy", and that needs three measurements of the same rebuild:
 *
 *   H-a  every program recompiled            what ships today
 *   H-b  every program kept                  the ceiling, if those thirteen lines stopped deleting
 *   H-c  only stage-owned programs kept      what a change confined to \`stage.ts\` can deliver
 *
 * H-b is produced by neutralising \`deleteProgram\` on the prototype for the duration of that arm.
 * That is not a fake result: it is exactly the state those thirteen lines would leave the context
 * in if they adopted \`pipeline.ts\`'s model, and it changes nothing else about the rebuild.
 * H-a is produced by deleting the stage-owned program from the harness, which is precisely what
 * \`stage.dispose()\` did before this change.
 *
 * WHAT IS BUILT. A relief-shaped program set — present, lit (3), sky, AO (2) — plus the shadow
 * map, the offscreen target and a mesh, which are the parts of a rebuild that are NOT compilation.
 * lit, sky and AO are built and not drawn: their cost here is the compile, which is the quantity
 * under test, and rigging a full scene would add camera work to both arms equally without
 * changing the difference. The frame that IS drawn goes through the bar batch and the five-pass
 * pipeline, because \`pipeline.ts\`'s three programs are the stage-owned ones the confined cache
 * keeps — so the hash below is a hash of pixels drawn THROUGH a cached program, which is the
 * only version of that proof worth having.
 *
 * THE CANVAS IS ATTACHED TO THE DOCUMENT, and that is load-bearing rather than incidental:
 * \`dispose()\` keeps the cache exactly when \`canvas.isConnected\`, which is the in-place rebuild a
 * mounted relief performs. A detached canvas is the unmount path and frees everything.
 */
{
  const H_PRESENT_VERT = \`#version 300 es
precision highp float;
layout(location=0) in vec2 q;
out vec2 uv;
void main(){ uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }\`;
  const H_PRESENT_FRAG = \`#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uSource;
out vec4 fragColour;
void main(){ fragColour = texture(uSource, uv); }\`;

  const HW = 640, HH = 400;
  const proto = WebGL2RenderingContext.prototype;
  const realDeleteProgram = proto.deleteProgram;
  const realCompileShader = proto.compileShader;
  const realLinkProgram = proto.linkProgram;
  let compiles = 0;
  const linked = [];
  proto.compileShader = function (...a) { compiles += 1; return realCompileShader.apply(this, a); };
  proto.linkProgram = function (p, ...a) { linked.push(p); return realLinkProgram.call(this, p, ...a); };

  /* A FRESH ATTACHED CANVAS PER ARM, so one arm's cache cannot serve another's: the cache is keyed
     on the CONTEXT, and a canvas hands out exactly one context for its whole life. */
  const hCanvas = () => {
    const c = document.createElement('canvas');
    c.width = HW; c.height = HH;
    c.style.width = c.style.height = '1px';
    c.style.position = 'absolute'; c.style.left = '-9999px';
    document.body.appendChild(c);
    return c;
  };

  /* FNV-1a over the whole frame. A hash of every byte, not a spot check: a cache that returned a
     program linked from different sources, or one carrying a stale uniform, moves pixels somewhere
     and a sampled probe is exactly how that gets missed. */
  const frameHash = (gl) => {
    const px = new Uint8Array(HW * HH * 4);
    gl.readPixels(0, 0, HW, HH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let h = 0x811c9dc5;
    for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    /* LIT PIXELS, NOT OPAQUE ONES. The stage is built \`alpha: false\`, so every byte in the alpha
       channel reads 255 whatever was drawn — counting those reported a full frame for a canvas
       that could have been entirely black. RGB is what carries the drawing. */
    let ink = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] !== 0 || px[i + 1] !== 0 || px[i + 2] !== 0) ink += 1;
    return { hash: h.toString(16).padStart(8, '0'), ink };
  };

  /**
   * ONE REBUILD, END TO END: the stage, the relief-shaped program set, the targets, a mesh, one
   * rendered frame, then the teardown a React effect cleanup performs.
   *
   * \`killStageOwned\` is the H-a arm: before this change \`stage.dispose()\` deleted every program it
   * had compiled, so the arm that models today has to do the same to the ones no renderer owns.
   */
  const rebuild = (canvas, killStageOwned) => {
    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) throw new Error('H: stage refused ' + out.code);
    const stage = out;
    const gl = stage.gl;
    stage.setRegion(HW, HH);

    const present = stage.compile(H_PRESENT_VERT, H_PRESENT_FRAG);
    if ('kind' in present) throw new Error('H: present refused ' + present.code);
    const lit = createLitRenderer(stage);
    if ('kind' in lit) throw new Error('H: lit refused ' + lit.code);
    const sky = createSkyBackdrop(stage);
    if ('kind' in sky) throw new Error('H: sky refused ' + sky.code);
    const ao = createAmbientOcclusion(stage, HW, HH);
    if ('kind' in ao) throw new Error('H: ao refused ' + ao.code);
    const bars = createBarBatch(stage);
    if ('kind' in bars) throw new Error('H: bars refused ' + bars.code);
    const pipeline = createPipeline(stage);
    if ('kind' in pipeline) throw new Error('H: pipeline refused ' + pipeline.code);
    const shadow = createShadowMap(stage, 1024);
    if ('kind' in shadow) throw new Error('H: shadow refused ' + shadow.code);
    const target = createTarget3D(stage, HW, HH);
    if ('kind' in target) throw new Error('H: target refused ' + target.code);
    const mesh = uploadMesh(stage, box(1, 1, 1));
    if ('kind' in mesh) throw new Error('H: mesh refused ' + mesh.code);

    const mvp = plotMatrix(0, HW, HH, 0);
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    beginAdditive(gl);
    const step = HW / BARS.length;
    bars.draw(mvp, BARS.map((b, i) => ({
      x0: i * step + 2, x1: (i + 1) * step - 2,
      y0: HH, y1: HH - b.v * HH,
      colour: exposure(hexToLinear('#2C6BFF'), 0.62),
    })), { orientation: 'vertical', modelling: 0.52, edgeStops: -0.2, contact: 0.7, radius: 3 });
    endPass(gl);
    /* \`resolve\` binds the DEFAULT framebuffer itself and composites onto it, so the hash below is
       taken from the drawing buffer a reader would see. The four bloom passes before it and the
       composite are three of \`pipeline.ts\`'s programs — the stage-owned ones — so these are pixels
       drawn THROUGH the cache whenever the cache is live. \`present\` is compiled and not drawn: it
       stands for the one program each relief component compiles for itself
       (\`GlobeReliefGl.tsx:335\` and six like it), and what it contributes here is its compile. */
    pipeline.resolve({ plate: [0, 0, 0], bloomGain: 0.3, threshold: [0.3, 1.1], vignetteDepth: 0, transparent: false });
    void present;
    const shot = frameHash(gl);

    for (const o of [mesh, target, shadow, pipeline, bars, ao, sky, lit]) o.dispose();
    /* THE H-a ARM, AND IT HAS TO BE EXACT. Before this change \`stage.dispose()\` ran
       \`for (const p of programs) gl.deleteProgram(p)\` over every program it had linked — including
       the ones no renderer owns, which is why deleting \`present\` alone was not the old behaviour
       and measured 17 compiles a rebuild rather than 24. \`linkProgram\` is patched during the arm
       so this list is derived from what the rebuild actually linked, not from a list of names. */
    if (killStageOwned) for (const p of linked) gl.deleteProgram(p);
    linked.length = 0;
    stage.dispose();
    return shot;
  };

  const hArm = (label, killStageOwned, keepEveryProgram) => {
    const canvas = hCanvas();
    if (keepEveryProgram) proto.deleteProgram = function () { /* the thirteen lines, fixed */ };
    /* WARM FIRST, OUTSIDE THE CLOCK. The first rebuild on a fresh context pays context creation and
       the driver's own first-sight-of-this-shader cost, which no cache can remove and which would
       otherwise dominate a short run. Every arm pays it identically and none of them reports it. */
    const first = rebuild(canvas, killStageOwned);
    const shots = [first];
    const ms = [];
    compiles = 0;
    const REBUILDS = 9;
    for (let i = 0; i < REBUILDS; i++) {
      const t0 = performance.now();
      shots.push(rebuild(canvas, killStageOwned));
      ms.push(performance.now() - t0);
    }
    const compilesPerRebuild = compiles / REBUILDS;
    proto.deleteProgram = realDeleteProgram;
    return { label, per: median(ms), lo: Math.min(...ms), hi: Math.max(...ms), compilesPerRebuild, shots };
  };

  const a = hArm('H-a every program recompiled', true, false);
  const b = hArm('H-b every program kept', false, true);
  const c = hArm('H-c stage-owned kept only', false, false);
  proto.compileShader = realCompileShader;
  proto.linkProgram = realLinkProgram;

  for (const arm of [a, b, c]) {
    results.push({ label: arm.label, frames: 1, per: arm.per, lo: arm.lo, hi: arm.hi });
  }
  notes.push(diff('H · one relief-shaped rebuild: every program kept vs every one recompiled', b, a));
  notes.push(diff('H · one relief-shaped rebuild: stage-owned kept vs every one recompiled', c, a));

  /*
   * THE COUNT, WHICH IS THE QUANTITY THE TIMINGS ARE A CONSEQUENCE OF — and, like arm D2, it is
   * decided by JS before any driver sees it, so it is reportable from a \`--headless\` run under a
   * software rasteriser as well.
   */
  notes.push({
    label: 'H2', delta: 0, noise: 0, resolved: true,
    text: 'H2 · compileShader calls per rebuild: ' + a.compilesPerRebuild.toFixed(1) + ' recompiling all, '
      + b.compilesPerRebuild.toFixed(1) + ' keeping all, ' + c.compilesPerRebuild.toFixed(1)
      + ' keeping only the stage-owned ones. A COUNT, not a timing.',
  });

  /*
   * AND THE PROOF THAT NOTHING RENDERS DIFFERENTLY. Every frame from every arm — 21 of them,
   * across three contexts, with the pipeline's three programs recompiled in one arm and served
   * from the cache in the other two — must hash identically. A cache that returned a program
   * linked from different sources, or one carrying a uniform another stage left behind, would
   * move pixels and this is what would catch it. The ink count is printed beside it because a
   * frame that renders NOTHING also hashes consistently, and §10.9 is this programme's record of
   * a change that produced exactly that: 0 of 19,200 pixels, nothing thrown.
   */
  const shots = [...a.shots, ...b.shots, ...c.shots];
  const hashes = new Set(shots.map((s) => s.hash));
  const perArm = [a, b, c].map((arm) => arm.label.slice(0, 3) + ' '
    + arm.shots.map((s) => s.hash).join(',')).join('\\n     ');
  notes.push({
    label: 'H3', delta: 0, noise: 0, resolved: true,
    text: 'H3 · ' + shots.length + ' rendered frames across the three arms: '
      + hashes.size + ' distinct hash' + (hashes.size === 1 ? '' : 'es')
      + ', ink ' + shots[0].ink + '/' + (HW * HH) + ' px. '
      + (hashes.size === 1 && shots[0].ink > 0
        ? 'The cached programs render the same frame, and it is not a blank one.'
        : 'FAILED — ' + (shots[0].ink === 0 ? 'the frame is BLANK.' : 'the frames diverge.'))
      + '\\n     ' + perArm,
  });
}

/**
 * A DIFFERENCE, OR A BOUND — never a difference presented as if it were resolved.
 *
 * If the gap between two arms is no larger than the wider arm's own spread, the run cannot
 * distinguish them and the honest output is the noise floor, not the subtraction.
 */
function diff(label, a, b) {
  const d = a.per - b.per;
  const noise = Math.max(a.hi - a.lo, b.hi - b.lo);
  const resolved = Math.abs(d) > noise;
  return { label, delta: d, noise, resolved,
    text: resolved
      ? label + ': ' + d.toFixed(4) + ' ms (' + a.per.toFixed(4) + ' vs ' + b.per.toFixed(4) + '), noise floor ' + noise.toFixed(4) + ' ms'
      : label + ': BELOW THE NOISE FLOOR — |' + d.toFixed(4) + '| ms is not larger than this run\\'s spread of ' + noise.toFixed(4) + ' ms. Report the bound, not the difference.' };
}

/* ── THE FRAME THE CLAIM COMPARES AGAINST, so the ratio is not left to the reader ───── */
const REFERENCE = {
  'E0 full tier, measured': 11.328,
  'P1 10k instanced points, measured on M1/8GB': 4.406,
  'one 60 Hz frame': 16.6,
};

const payload = {
  renderer: String(RENDERER), vendor: String(VENDOR), software: SOFTWARE,
  dpr: window.devicePixelRatio, results, notes, bufferAtBlit, reference: REFERENCE,
};
window.__BLIT_RESULT = payload;
document.title = SOFTWARE ? 'SOFTWARE-RASTERISER' : 'DONE';

out('renderer: ' + RENDERER + '  vendor: ' + VENDOR + '  dpr: ' + window.devicePixelRatio);
if (SOFTWARE) {
  out('\\nSOFTWARE RASTERISER. The numbers below are NOT the measurement: a drawImage from a\\n'
    + 'WebGL canvas is a GPU-side blit on one driver and a full read-back on another, so this\\n'
    + 'run answers a different question. Open this page in the real browser instead.');
}
out('\\n' + notes.map((n) => n.text).join('\\n'));
out('\\nthe size the shipping renderer settled on (a size, not a timing):\\n  ' + bufferAtBlit.join('\\n  '));
out('\\nper-arm medians (ms per frame, min-max across batches):\\n'
  + results.map((r) => '  ' + r.label.padEnd(34) + r.per.toFixed(4) + '   [' + r.lo.toFixed(4) + ' - ' + r.hi.toFixed(4) + ']').join('\\n'));
out('\\nfor scale, measured elsewhere in this programme:\\n'
  + Object.entries(REFERENCE).map(([k, v]) => '  ' + k.padEnd(44) + v + ' ms').join('\\n'));
`;

const bundled = await build({
  stdin: { contents: PAGE_JS, resolveDir: HERE, loader: 'js', sourcefile: 'blit-cost-page.js' },
  bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent',
  alias: { '@lcx/gl': GL_INDEX, '@lcx/shared': join(ROOT, 'packages/shared/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (bundled.errors?.length) {
  for (const e of bundled.errors) console.error(e);
  process.exit(1);
}
const js = bundled.outputFiles[0].text;

const HTML = `<!doctype html><meta charset="utf-8"><title>measuring…</title>
<style>body{margin:0;padding:24px;background:#05070d;color:#c4d4f0;font:12.5px/1.55 ui-monospace,monospace}
pre{margin:0 0 14px;white-space:pre-wrap}</style>
<h1 style="font:600 13px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7fb2ff">
blit cost · flat/shared.ts:18-21</h1>
<pre>measuring… a few seconds. Nothing here is timed with gl.finish().</pre>
<script type="module">${js}</script>`;

/* Loopback only, GET only, two paths, no listing. It serves one page to one person for one
   measurement and must never grow into anything else. */
const server = createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end('GET only'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(HTML);
});

if (!HEADLESS) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\nblit cost · open this in the REAL browser, on the real GPU:\n\n  http://127.0.0.1:${PORT}/\n`);
    console.log('This is the run that answers the question. Headless Chromium is SwiftShader and');
    console.log('`--headless` will refuse to report its timings as the measurement.\n');
    console.log('Ctrl-C when you have the numbers.');
  });
} else {
  const { chromium } = await import('@playwright/test');
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  /*
   * `--gpu` ASKS FOR THE REAL DRIVER; IT DOES NOT MAKE THE ANSWER ACCEPTABLE.
   *
   * Headless Chromium defaults to SwiftShader, which is why this file has always refused to report
   * its timings. It does not have to: with ANGLE pointed at Metal it reports "ANGLE Metal Renderer:
   * Apple M1" — measured, against "SwiftShader Device (LLVM 10.0.0)" from the same binary seconds
   * earlier — and that string cannot be produced without a Metal device behind it.
   *
   * The refusal below is UNCHANGED and still keyed on the renderer the page measured, never on
   * which flags were passed. So a `--gpu` run on a machine that has no GPU to give still exits 2,
   * and a run that reports numbers has a hardware renderer string printed next to them. The flag
   * is a request, not an assertion.
   */
  const browser = await chromium.launch(argv.includes('--gpu')
    ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
    : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  /*
   * `commit`, NOT the default `load`. The module script runs the whole sweep synchronously, so
   * the load event does not fire until every arm is done — under SwiftShader that is minutes,
   * and the default 30 s `goto` timeout reported it as a navigation failure rather than as a
   * slow rasteriser. On a GPU the same sweep is seconds.
   */
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit' });
  /* A page that throws never sets its title, which is why the title is the signal rather than
     a fixed sleep — the failure mode that once made a thrown error look like a 30 s timeout. */
  await page.waitForFunction(() => document.title !== 'measuring…', null, { timeout: 900_000 })
    .catch(() => {});
  const payload = await page.evaluate(() => window.__BLIT_RESULT ?? null);
  console.log(await page.evaluate(() => document.body.innerText));
  for (const e of errors) console.error('page error:', e);
  await browser.close();
  server.close();

  if (!payload) { console.error('\nthe page produced no result at all.'); process.exit(1); }
  if (payload.refused) { console.error(`\nREFUSED: ${payload.refused}`); process.exit(1); }
  if (payload.software) {
    console.error(`\nREFUSED AS A MEASUREMENT: renderer is "${payload.renderer}", a software`);
    console.error('rasteriser. The arms above prove the instrument runs; they are not the answer.');
    console.error(`Run \`node docs/3d/blit-cost.mjs\` and open http://127.0.0.1:${PORT}/ in the real browser.`);
    process.exit(2);
  }
  console.log('\nrenderer is hardware — these numbers are the measurement.');
}
