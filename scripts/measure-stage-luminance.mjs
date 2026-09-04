// THE GLASS FLOORS, RE-MEASURED (P8). Photograph the bare stage (every DOM layer hidden, the plate rect kept) on a route, in a theme,
// and read the relative luminance of the pixels UNDER the plate's top face: p50 / p95 / max against STAGE_LUMINANCE_MAX
// (dark .04) and p05 / min against STAGE_LUMINANCE_MIN (light .55). glass.test.ts derives the contrast floors from those
// constants; this reads whether the rendered frame honours them. Numbers, not a claim.
//   node scripts/measure-stage-luminance.mjs [--base http://127.0.0.1:5173] [--routes /tasks,/command-deck] [--themes dark,light]
import { chromium } from '@playwright/test';
import { allDeskFixtures, watchFixture } from './instrument-fixtures.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5173');
const routes = String(arg('routes', '/tasks,/command-deck')).split(',');
const themes = String(arg('themes', 'dark,light')).split(',');
const SAVE = arg('save', null);
import { writeFileSync, mkdirSync } from 'node:fs';
if (SAVE) mkdirSync(SAVE, { recursive: true });
const CEIL = { dark: 0.04, light: 0.96 }, FLOOR = { dark: 0, light: 0.55 };
const seed = (a) => {
  localStorage.setItem('lcx_operator_email', 'lum@lcx.com'); localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
  localStorage.setItem('lcx-os:lum@lcx.com:operator:v1', JSON.stringify({ state: { operator: { id: 'lum', name: 'Lum', email: 'lum@lcx.com', role: 'approver' } }, version: 3 }));
  const env = JSON.stringify({ state: { sidebarCollapsed: false, darkMode: a.dark, evidenceDocked: false }, version: 1 });
  localStorage.setItem('lcx-os:lum@lcx.com:ui:v1', env); localStorage.setItem('lcx-os:ui:v1', env);
};
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const lab = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
let bad = 0;
for (const theme of themes) for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, colorScheme: theme });
  await page.addInitScript(seed, { dark: theme === 'dark' });
  await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
  await page.route('**/v1/health*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, service: 'lcx-sales-api', version: 'harness', db: 'up', timestamp: new Date().toISOString() }) }));
  await page.route('**/v1/watch*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(watchFixture(new Date().toISOString(), '')) }));
  for (const [glob, body] of allDeskFixtures(new Date().toISOString())) await page.route(glob, (r) => r.fulfill(body()));
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-stage]')?.getAttribute('data-stage') === 'drawn', undefined, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const plate = await page.evaluate(() => { const r = document.querySelector('[data-stage-plate]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
  await page.evaluate(() => { for (const el of document.querySelectorAll('header, aside, main, nav, footer, [role=banner]')) el.style.visibility = 'hidden'; });
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  if (SAVE) { const stem = `${route.replace(/\W+/g, '_').replace(/^_/, '')}-${theme}`; writeFileSync(`${SAVE}/${stem}-bare.png`, png); writeFileSync(`${SAVE}/${stem}-plate.json`, JSON.stringify(plate)); }
  await page.close();
  if (!plate) { console.log(`${route} ${theme}: no plate rect`); bad++; continue; }
  const stats = await lab.evaluate(async ({ b64, r, thr }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y)), w = Math.min(img.width - x0, Math.round(r.w)), h = Math.min(img.height - y0, Math.round(r.h));
    const d = ctx.getImageData(x0, y0, w, h).data; const L = new Float32Array(w * h);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < w * h; i++) L[i] = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
    const s = Array.from(L).sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    // WHERE the tail lives: the share of over-ceiling (dark) / under-floor (light) pixels per horizontal fifth of the plate, top → bottom.
    const bands = [0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < w * h; i++) { const band = Math.min(4, Math.floor((Math.floor(i / w) / h) * 5)); counts[band]++; if (L[i] > thr.ceil || L[i] < thr.floor) bands[band]++; }
    // The tail's extent: rows and columns (as % of the plate) holding over-ceiling / under-floor pixels — a stripe reads as a narrow
    // row range across most columns; blobs read as narrow column ranges.
    let rMin = h, rMax = -1, cMin = w, cMax = -1, tailN = 0; const rowsHit = new Set();
    for (let i = 0; i < w * h; i++) if (L[i] > thr.ceil || L[i] < thr.floor) { const row = Math.floor(i / w), col = i % w; tailN++; rowsHit.add(row); rMin = Math.min(rMin, row); rMax = Math.max(rMax, row); cMin = Math.min(cMin, col); cMax = Math.max(cMax, col); }
    const extent = tailN ? { rows: `${(rMin / h * 100).toFixed(0)}–${(rMax / h * 100).toFixed(0)}%`, rowsHit: rowsHit.size, cols: `${(cMin / w * 100).toFixed(0)}–${(cMax / w * 100).toFixed(0)}%` } : null;
    return { extent, n: s.length, min: s[0], p05: q(0.05), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], tailShare: s.filter((v) => v > thr.ceil || v < thr.floor).length / s.length, bandShare: bands.map((b, k) => b / Math.max(1, counts[k])) };
  }, { b64: png.toString('base64'), r: plate, thr: { ceil: CEIL[theme], floor: FLOOR[theme] } });
  const f = (v) => v.toFixed(3);
  const overCeil = theme === 'dark' ? stats.p95 > CEIL.dark : stats.p95 > CEIL.light;
  const underFloor = theme === 'light' ? stats.p05 < FLOOR.light : false;
  if (overCeil || underFloor) bad++;
  console.log(`${route.padEnd(16)} ${theme.padEnd(5)} plate ${Math.round(plate.w)}×${Math.round(plate.h)} · L min ${f(stats.min)} p05 ${f(stats.p05)} p50 ${f(stats.p50)} p95 ${f(stats.p95)} p99 ${f(stats.p99)} max ${f(stats.max)} · tail ${(stats.tailShare * 100).toFixed(1)}% by band top→bottom [${stats.bandShare.map((b) => (b * 100).toFixed(1)).join(' ')}]% · extent ${stats.extent ? `rows ${stats.extent.rows} (${stats.extent.rowsHit} rows) cols ${stats.extent.cols}` : '—'} · ceiling ${CEIL[theme]} ${overCeil ? '✗ p95 OVER' : '✓'}${theme === 'light' ? ` · floor ${FLOOR.light} ${underFloor ? '✗ p05 UNDER' : '✓'}` : ''}`);
}
await browser.close();
process.exit(bad ? 1 : 0);
