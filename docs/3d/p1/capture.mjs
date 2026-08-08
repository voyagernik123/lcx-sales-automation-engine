/**
 * P1 · the LOOK gate, and its negative control.
 *
 * `3D_WORK_100X.md` §6.2: LOOK is a REQUIRED gate, not a nicety — headless WebGL capture
 * → PNG → somebody reads the image. No surface ships un-looked-at.
 *
 * This captures TWO images, because one of them proves the spine renders and the other
 * proves it refuses:
 *
 *   risk-cloud.png   WebGL2 available — the S1 surface, rebuilt on @lcx/gl
 *   refusal.png      WebGL2 REMOVED   — the fallback a locked-down browser actually sees
 *
 * The second is the one nobody ever looks at, which is exactly why it is captured. A
 * refusal path that has never been rendered is a refusal path that does not work.
 *
 * Usage:  node docs/3d/p1/build.mjs && node docs/3d/p1/capture.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const P0 = resolve(HERE, '../p0');
const data = JSON.parse(readFileSync(resolve(P0, 'samples.json'), 'utf8'));

if (!existsSync(resolve(HERE, 'bundle.js'))) {
  throw new Error('bundle.js is missing — run `node docs/3d/p1/build.mjs` first');
}

/* SERVED OVER HTTP, not file://.
   `<script type="module">` from a file:// page is blocked by CORS on every Chromium — the
   origin is `null` and module fetches are not allowed from it. That is not a quirk to work
   around with an inline bundle: the app ships over http, so capturing over http is the
   configuration that matches production. Loopback, ephemeral port, this directory only. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(HERE, rel === '/' ? 'risk-cloud.html' : rel);
  if (!file.startsWith(HERE) || !existsSync(file)) { res.writeHead(404).end(); return; }
  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function shoot({ file, killWebgl }) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ d, kill }) => {
      window.__SAMPLES__ = d;
      if (kill) {
        // Exactly what a locked-down browser or a dead GPU process presents: the context
        // request returns null. Not a thrown error — the null is the realistic shape.
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return type === 'webgl2' ? null : original.call(this, type, ...rest);
        };
      }
    },
    { d: data, kill: killWebgl },
  );
  await page.goto(`${ORIGIN}/risk-cloud.html`);
  await page.waitForFunction(() => document.title === 'READY', { timeout: 30_000 });
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  const t0 = Date.now();
  await page.locator('#wrap').screenshot({ path: resolve(HERE, file) });
  const stats = await page.locator('#stats').textContent();
  console.log(`  ${file.padEnd(16)} ${String(Date.now() - t0).padStart(5)} ms   ${stats}`);
  await page.close();
}

await shoot({ file: 'risk-cloud.png', killWebgl: false });
await shoot({ file: 'refusal.png', killWebgl: true });

await browser.close();
server.close();
