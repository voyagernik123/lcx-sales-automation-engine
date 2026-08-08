/**
 * P0 · headless capture harness.
 *
 * Renders `risk-cloud.html` in headless Chromium on SwiftShader (no GPU required,
 * so this runs identically on a laptop and in CI) and writes `risk-cloud.png`.
 *
 * The whole point of P0 is that somebody LOOKS at the output. A DOM test proves the
 * draw calls were issued; it cannot tell you the frame came out black, which is
 * exactly what happened on the first run of this harness when a VAO binding was
 * corrupted. Rendering to a file and opening it is the only check that catches that.
 *
 * Usage:  node docs/3d/p0/samples.mjs && node docs/3d/p0/capture.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(HERE, 'samples.json'), 'utf8'));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1700, height: 1000 },
  deviceScaleFactor: 2,
});
let failed = null;
page.on('pageerror', (e) => {
  failed = e.message;
});
await page.addInitScript((d) => {
  window.__SAMPLES__ = d;
}, data);
await page.goto(`file://${resolve(HERE, 'risk-cloud.html')}`);
await page.waitForFunction(() => document.title === 'READY', { timeout: 30_000 });
if (failed) throw new Error(`page error: ${failed}`);

const t0 = Date.now();
await page.locator('#wrap').screenshot({ path: resolve(HERE, 'risk-cloud.png') });
console.log('  captured in', Date.now() - t0, 'ms');
await browser.close();
