#!/usr/bin/env node
/**
 * THE STILL, FROM THE RENDERER ITSELF. Captures the live Forge canvas on /lcxos at deviceScaleFactor 2 with the hero
 * figure forced to the still's declared 1200×720 layout, so the still and the live object are the same picture by
 * construction — the Blender path (scripts/blender) rendered a different material and a different lens, and on
 * 2026-09-14 the two disagreed visibly. Writes <out>@2x.png plus a .render.json sidecar in the shape oneObject.test.ts
 * requires; encode with scripts/blender/encode.py afterwards.
 *
 *   node scripts/capture-forge-still.mjs <url> <out-basename> [dark|light]
 *   e.g. node scripts/capture-forge-still.mjs http://localhost:5173/lcxos /tmp/forge-dark dark
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [url, base, theme = 'dark'] = process.argv.slice(2);
if (!url || !base) { console.error('usage: capture-forge-still.mjs <url> <out-basename> [dark|light]'); process.exit(2); }
const out = `${base}@2x.png`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'domcontentloaded' });
// 1202 CSS px for the figure: its 1 px border each side leaves the canvas at exactly 1200 × 720.
await page.addStyleTag({ content: '[data-forge-mount="hero"]{width:1202px!important;max-width:none!important;margin-left:0!important}' });
if (theme === 'light') await page.evaluate(() => document.documentElement.classList.remove('dark'));
else await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
try { await page.waitForSelector('canvas[data-arc="done"]', { timeout: 25000 }); } catch { console.log('arc did not report done within 25 s'); }
await page.waitForTimeout(3000);
const canvas = page.locator('canvas[data-forge="live"]').first();
const box = await canvas.boundingBox();
const info = await page.evaluate(() => { const c = document.querySelector('canvas[data-forge="live"]'); return { canvas: c ? [c.width, c.height] : null, forge: c?.dataset.forge, arc: c?.dataset.arc, dark: document.documentElement.classList.contains('dark') }; });
await canvas.screenshot({ path: out });
await browser.close();
const bytes = readFileSync(out);
const side = {
  source: 'apps/web/scripts/capture-forge-still.mjs — the live WebGL Forge (ForgeBackdrop layer="cover") captured on /lcxos',
  engine: 'webgl2-live (packages/gl: lit → present tone map → FXAA)', renderer: 'chromium headless, ANGLE/SwiftShader, deviceScaleFactor 2',
  theme, transform: 'Standard', transformNote: 'the page\'s own tone map and sRGB encode — the reference the live object is drawn with',
  look: 'None', display: 'sRGB', exposure: 0.0, gamma: 1.0, transparent: false, format: 'PNG',
  resolution: [info.canvas?.[0] ?? null, info.canvas?.[1] ?? null], layoutCss: [Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)], scale: 2.0,
  arc: info.arc, bytes: bytes.length, sha256_16: createHash('sha256').update(bytes).digest('hex').slice(0, 16), capturedAt: new Date().toISOString(),
};
writeFileSync(`${out}.render.json`, JSON.stringify(side, null, 2));
console.log(JSON.stringify({ box, ...info }), '→', out);
