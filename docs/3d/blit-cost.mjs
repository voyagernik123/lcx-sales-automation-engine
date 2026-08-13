/**
 * THE BLIT, MEASURED — the instrument for the one claim in `flat/shared.ts` that nothing has
 * ever timed.
 *
 * `packages/gl/src/flat/shared.ts:18-21` says the drawImage blit "costs one texture copy per
 * chart per redraw, which is a rounding error against a frame that already runs five
 * post-process passes". `docs/3d/w2/README.md:17-18` repeats it, and a commit body repeats it
 * again. It is the entire justification for blitting to each chart's own 2-D canvas instead of
 * scissoring one page-sized canvas (`3D_VFX_FINAL_PLAN.md` §1.1), so a documented
 * architectural decision rests on it — and `w2/README.md:219` states plainly that nobody
 * measured it, bounding the cost only as `0 < cost <= 5.272 ms`, which cannot rule out that a
 * single copy eats E1's entire remaining frame budget.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A UNIT TEST ────────────────────────────────────────────
 * The structural half of the claim — one copy per chart per redraw, O(1) in chart count — IS
 * a unit test, and it is `packages/gl/src/flat/sharedCost.test.ts`. The millisecond half is a
 * claim about a GPU. jsdom has no WebGL2 at all, and a fake context can be made to report any
 * number you like, so a unit test that printed milliseconds here would be fabricating them.
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
 *     node docs/3d/blit-cost.mjs --port 5610     another port (5599 is p1, 5600 is the trial).
 *
 * ── WHAT IT MEASURES, AND WHY EACH ARM EXISTS ───────────────────────────────────────────
 *   A · blit vs no-blit, same GL work        the per-chart cost of the copy itself
 *   B · buffer sweep at a fixed chart rect   whether the copy is CHART-sized or BUFFER-sized.
 *                                            `shared.ts` grows the offscreen buffer to the
 *                                            largest chart and never shrinks it, so if the
 *                                            driver snapshots the whole drawing buffer, one
 *                                            large chart makes every sparkline on the page
 *                                            pay for it. `w2/README.md:314` raises exactly
 *                                            this and could not settle it either.
 *   C · 1, 4, 16, 60 charts                  whether per-chart cost is flat in chart count
 *   D · one size vs two alternating sizes    the cost `sharedCost.test.ts` pins structurally:
 *                                            `setRegion` reallocates all three targets when
 *                                            consecutive charts differ in size — 39 texture
 *                                            allocations against 6 for the same twelve
 *                                            renders at one size
 *
 * ── WHAT THE FIRST RUN RETURNED, so the next reader can tell drift from noise ───────────
 * Chrome, ANGLE Metal Renderer: Apple M1, dpr 2, two runs, 2026-08-13. Per redraw of one
 * 480x160 chart drawn by the shipping frame:
 *
 *     A   frame without the blit          0.503 / 0.518 ms
 *         frame with the blit             0.970 / 1.162 ms
 *         the blit                        0.467 / 0.643 ms   0.9x-1.2x the rest of the frame
 *     B   blit at buffer 1024x512         0.467 / 0.643 ms   chart rect fixed at 480x160
 *         blit at buffer 2400x920         1.083 / 1.373 ms
 *         blit at buffer 3200x1600        1.988 / 2.368 ms   -> sized by the BUFFER, not the chart
 *     C   60 charts, blit total           28.59 / 31.65 ms   = 0.476 / 0.527 ms per chart, flat
 *     D   4 charts, one size              4.29 / 5.20 ms
 *         4 charts, two sizes             7.05 / 10.95 ms    -> setRegion reallocation costs more
 *                                                               than the blit it hides behind
 *
 * So the structural half of `shared.ts:18-21` holds (one copy per chart, flat per chart) and the
 * word "rounding error" does not: the copy costs about what the whole rest of the chart frame
 * costs, and it scales with a buffer that only grows. Two runs on one machine is not a
 * characterisation — no M2, M3 or non-Apple GPU has ever been measured in this programme — which
 * is why this file exists as a script anyone can re-run rather than as a number in a README.
 *
 * ── AND WHAT IT REPORTS WHEN THE ANSWER IS "TOO SMALL TO SEE" ───────────────────────────
 * Each arm runs several batches and reports the MEDIAN with the spread. If the difference
 * between two arms is smaller than the spread of either, the script says so and reports a
 * BOUND rather than a figure. "Below this run's noise floor of ±0.0N ms" is a real result and
 * it is the one that would vindicate the claim; a mean of two noisy numbers presented to three
 * decimal places is not.
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

/* ── B · is the copy chart-sized or buffer-sized? ───────────────────────────────────── */
for (const [bw, bh] of [[1024, 512], [2400, 920], [3200, 1600]]) {
  const r = fresh(); const cache = {}; const draw = makeDraw(cache);
  /* Grow the offscreen buffer by rendering one big chart, exactly as a real page does — the
     buffer grows to the largest chart that ever asked and never shrinks for the session. */
  if (bw > 1024 || bh > 512) {
    const big = nullTarget(bw, bh);
    r.render(big, (f) => draw(r.stage, f.width, f.height));
  }
  const hot = realTarget(CHART[0], CHART[1]);
  const cold = nullTarget(CHART[0], CHART[1]);
  const withBlit = run('B blit buffer ' + bw + 'x' + bh, () => r.render(hot, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  const without = run('B no-blit buffer ' + bw + 'x' + bh, () => r.render(cold, (f) => draw(r.stage, f.width, f.height)), 60, r.stage, scratchCtx);
  results.push(withBlit, without);
  notes.push(diff('B · 480x160 chart, buffer ' + bw + 'x' + bh, withBlit, without));
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
  notes.push(diff('D · 4 charts, one size vs two alternating sizes (target reallocation, 6 allocs vs 39)', two, one));
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
  dpr: window.devicePixelRatio, results, notes, reference: REFERENCE,
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
out('\\nper-arm medians (ms per frame, min-max across batches):\\n'
  + results.map((r) => '  ' + r.label.padEnd(30) + r.per.toFixed(4) + '   [' + r.lo.toFixed(4) + ' - ' + r.hi.toFixed(4) + ']').join('\\n'));
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
  const browser = await chromium.launch();
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
