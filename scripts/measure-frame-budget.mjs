// THE FRAME BUDGET AT 2× (P8). 16.6 ms is the plan's ceiling for stage + hero + charts on an M1 at 2× DPR. The instrument
// cannot measure it: it runs SwiftShader, and useQualityTier refuses a headroom figure from a software rasteriser. This script
// launches Chromium against the host GPU (ANGLE Metal on macOS), confirms the renderer string is NOT SwiftShader, and reads
// the stage's own redraw contract (`__LCX_STAGE_REDRAW()` — one forced synchronous frame, ms) N times per route at DPR 2,
// plus the quality probe the heroes recorded (`__LCX_QUALITY_PROBE`). Refuses to print a budget verdict on a software GL.
//   node scripts/measure-frame-budget.mjs [--base http://127.0.0.1:5173] [--routes /command-deck,/bd-kpis,/tasks] [--n 20] [--headed]
import { chromium } from '@playwright/test';
import { allDeskFixtures, watchFixture } from './instrument-fixtures.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5173'); const N = Number(arg('n', 20)); const BUDGET_MS = 16.6;
const routes = String(arg('routes', '/command-deck,/bd-kpis,/tasks,/select')).split(',');
const headed = process.argv.includes('--headed');
const seed = () => {
  localStorage.setItem('lcx_operator_email', 'fb@lcx.com'); localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
  localStorage.setItem('lcx-os:fb@lcx.com:operator:v1', JSON.stringify({ state: { operator: { id: 'fb', name: 'FB', email: 'fb@lcx.com', role: 'approver' } }, version: 3 }));
};
const browser = await chromium.launch({ headless: !headed, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
await page.addInitScript(seed);
await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
await page.route('**/v1/health*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, service: 'lcx-sales-api', version: 'harness', db: 'up', timestamp: new Date().toISOString() }) }));
await page.route('**/v1/watch*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(watchFixture(new Date().toISOString(), '')) }));
for (const [glob, body] of allDeskFixtures(new Date().toISOString())) await page.route(glob, (r) => r.fulfill(body()));
await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' });
const renderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'no webgl2'); });
console.log(`renderer: ${renderer} · DPR ${await page.evaluate(() => devicePixelRatio)}`);
const software = /swiftshader|software|llvmpipe/i.test(String(renderer));
if (software) console.log('SOFTWARE RASTERISER — no budget verdict is printed from this machine/launch (try --headed).');
let worstP90 = 0, worstMax = 0;
for (const route of routes) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('[data-stage]') || document.querySelector('[data-stage]')?.getAttribute('data-stage') === 'drawn', undefined, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const r = await page.evaluate((n) => {
    const f = globalThis.__LCX_STAGE_REDRAW ?? globalThis.__LCX_FORGE_REDRAW; const ms = [];
    if (typeof f === 'function') for (let i = 0; i < n; i++) ms.push(f());
    ms.sort((a, b) => a - b);
    const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null;
    globalThis.__which = globalThis.__LCX_STAGE_REDRAW ? 'stage ' : (globalThis.__LCX_FORGE_REDRAW ? 'forge ' : 'no-contract ');
    return { which: globalThis.__which, n: ms.length, p50: q(0.5), p90: q(0.9), max: ms.length ? ms[ms.length - 1] : null, probe: globalThis.__LCX_QUALITY_PROBE ?? null, canvases: document.querySelectorAll('canvas').length };
  }, N);
  const f = (v) => (v == null ? '—' : v.toFixed(2));
  if (r.p90 != null) worstP90 = Math.max(worstP90, r.p90);
  if (r.max != null) worstMax = Math.max(worstMax, r.max);
  console.log(`${route.padEnd(14)} ${r.which}redraw ×${r.n}: p50 ${f(r.p50)} ms · p90 ${f(r.p90)} · max ${f(r.max)} · canvases ${r.canvases} · probe ${r.probe ? JSON.stringify(r.probe).slice(0, 120) : '—'}`);
}
await browser.close();
if (!software) console.log(`\nverdict at 2×: worst p90 frame ${worstP90.toFixed(2)} ms against ${BUDGET_MS} ms → ${worstP90 <= BUDGET_MS ? 'INSIDE the budget' : 'OVER the budget'} · worst single frame ${worstMax.toFixed(2)} ms (stated, not judged: a first forced frame after idle pays shader and clock warm-up)`);
