/**
 * P1 · THE REGRESSION GATE — does the spine still produce the picture P0 proved?
 *
 * P1's whole claim is that S1 rebuilt on `@lcx/gl` is the same figure the hand-written
 * spike produced. "Looks the same to me" is not that claim, so this measures it: both
 * plates, pixel by pixel, mean and max absolute channel difference.
 *
 * ── THE CONTROL THAT MADE THIS USEFUL ───────────────────────────────────────────────
 * The first run reported max 248 — a pixel going from near-black to near-white. That
 * reads as a broken renderer. It was not:
 *
 *   1. `docs/3d/p0/capture.mjs` run twice is BIT-IDENTICAL (mean 0, max 0), so the
 *      harness itself has no noise and any difference is real.
 *   2. Every DOM box in both pages — ticks, readout, axis name, stage, canvas — measures
 *      identical to 0.01 px, so nothing moved.
 *   3. The differing pixels were confined to rows containing DOM TEXT. The GL rows were
 *      untouched.
 *   4. The P1 page is 192 px taller than P0's, because it prints the L2/L3 policies under
 *      the figure. Hiding that one paragraph — which is below everything else and changes
 *      no layout above it — drops the maximum from 248 to 6.
 *
 * A taller page rasterizes text on different tile boundaries, and antialiased glyph edges
 * land differently. That is a fact about Chromium's compositor, not about the renderer.
 * So the comparison hides that paragraph, and what remains is a like-for-like measurement
 * of the two renderers.
 *
 * Usage:  node docs/3d/p1/build.mjs && node docs/3d/p1/compare.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const P0_PNG = resolve(HERE, '../p0/risk-cloud.png');
const data = JSON.parse(readFileSync(resolve(HERE, '../p0/samples.json'), 'utf8'));

/** Any channel differing by more than this fails the gate. */
const MAX_CHANNEL_DELTA = 8;

if (!existsSync(resolve(HERE, 'bundle.js'))) {
  throw new Error('bundle.js is missing — run `node docs/3d/p1/build.mjs` first');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    .replace(/^(\.\.[/\\])+/, '');
  const file = join(HERE, rel);
  if (!file.startsWith(HERE) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 2 });
await page.addInitScript((d) => { window.__SAMPLES__ = d; }, data);
await page.goto(`${ORIGIN}/risk-cloud.html`);
await page.waitForFunction(() => document.title === 'READY', { timeout: 30_000 });
await page.evaluate(() => { document.getElementById('policy').style.display = 'none'; });
const shot = await page.locator('#wrap').screenshot();

const result = await page.evaluate(async ([a, b, limit]) => {
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  // The plate, not the page: the title block above and the legend below are typography,
  // and comparing them would measure the browser rather than the renderer.
  const X = 90, Y = 250, W = 3170, H = 1450;
  const grab = (img) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, X, Y, W, H, 0, 0, W, H);
    return x.getImageData(0, 0, W, H).data;
  };
  const pa = grab(A), pb = grab(B);
  let sum = 0, max = 0, n = 0, over = 0;
  for (let i = 0; i < pa.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(pa[i + k] - pb[i + k]);
      sum += d; n++;
      if (d > max) max = d;
      if (d > limit) over++;
    }
  }
  return { mean: sum / n, max, over, n, sameSize: A.width === B.width };
}, [
  `data:image/png;base64,${readFileSync(P0_PNG).toString('base64')}`,
  `data:image/png;base64,${shot.toString('base64')}`,
  MAX_CHANNEL_DELTA,
]);

await browser.close();
server.close();

console.log('\n  P0 spike  vs  P1 spine — plate, 3170 × 1450, RGB');
console.log(`    mean |Δ|        ${result.mean.toFixed(4)} / 255`);
console.log(`    max  |Δ|        ${result.max} / 255`);
console.log(`    channels > ${MAX_CHANNEL_DELTA}   ${result.over} of ${result.n}\n`);

if (!result.sameSize) {
  console.error('  The two captures are different widths — the comparison is meaningless.\n');
  process.exit(1);
}
if (result.max > MAX_CHANNEL_DELTA) {
  console.error(`  REGRESSED: a channel moved by ${result.max}. The spine no longer reproduces P0.\n`);
  process.exit(1);
}
console.log('  ✓ the spine reproduces P0 within the tolerance.\n');
