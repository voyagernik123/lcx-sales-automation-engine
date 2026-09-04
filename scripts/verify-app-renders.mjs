// THE APP RENDERS — P8's gate script. For every route, at 1× and 2×, wide and narrow, with GL on and with the context LOST:
// a frame was drawn (the stage or a hero says `drawn`/ready) OR a refusal is on the DOM in words. A blank canvas with no
// reason is the one outcome this refuses. Real GL (swiftshader) — the same driver the instrument measures with.
//
//   node scripts/verify-app-renders.mjs [--base http://127.0.0.1:5189] [--routes /a,/b] [--dpr 1,2] [--widths 1440,768] [--lose-context]
//
// Exit 1 on any silent blank; prints one line per (route × dpr × width × mode) and a summary. Runs in CI's e2e job and in the
// release checklist — not in the root gate (minutes, not seconds).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DESK_ROUTES, allDeskFixtures, watchFixture } from './instrument-fixtures.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', process.env.RENDERS_BASE ?? 'http://127.0.0.1:5189');
const DPRS = String(arg('dpr', '1,2')).split(',').map(Number);
const WIDTHS = String(arg('widths', '1440,768')).split(',').map(Number);
const LOSE = process.argv.includes('--lose-context');
const REDUCED = process.argv.includes('--reduced');   // the reduced-motion axis: every arrival resolves to its final frame at once
import { routesFromRouter } from './instrument-routes.mjs';
const table = routesFromRouter();
const routes = arg('routes', null)
  ? String(arg('routes')).split(',').map((p) => table.find((r) => r.path === p || r.probe === p) ?? { path: p, probe: p, seated: !['/lcxos', '/portal', '/select'].includes(p) })
  : table;

const SEAT_EMAIL = 'render-check@lcx.com';
const seed = (email) => {
  localStorage.setItem('lcx_operator_email', email);
  localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
  localStorage.setItem(`lcx-os:${email}:operator:v1`, JSON.stringify({ state: { operator: { id: 'render-check', name: 'Render Check', email, role: 'approver' } }, version: 3 }));
};

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
let n = 0;
for (const dpr of DPRS) for (const width of WIDTHS) for (const seated of [true, false]) {
  // ONE context per (dpr, width, seated): the browser keeps the module cache warm across routes, which is where a fresh page per
  // check spent ~50 s each on SwiftShader. Seat only where the app seats: the public pages are read as a visitor sees them.
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: dpr, reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
  if (seated) await ctx.addInitScript(seed, SEAT_EMAIL);
  const page = await ctx.newPage();
  await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
  await page.route('**/v1/health*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, service: 'lcx-sales-api', version: 'harness', db: 'up', timestamp: new Date().toISOString() }) }));
  await page.route('**/v1/watch*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(watchFixture(new Date().toISOString(), '')) }));
  for (const [glob, body] of allDeskFixtures(new Date().toISOString())) await page.route(glob, (r) => r.fulfill(body()));
  for (const route of routes.filter((r) => Boolean(r.seated) === seated)) {
  const path = route.probe ?? route.path;
  let verdict = 'BLANK';
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => {
      const st = document.querySelector('[data-stage]')?.getAttribute('data-stage') ?? '';
      const heroes = Array.from(document.querySelectorAll('[data-hero]'));
      const forge = document.querySelector('canvas[data-forge]');
      const stageOk = !document.querySelector('[data-stage]') || st === 'drawn' || st.startsWith('refused');
      return stageOk && (heroes.length === 0 || heroes.every((h) => h.getAttribute('data-hero') !== 'pending')) && (!forge || forge.getAttribute('data-objects') !== null || forge.getAttribute('data-arc') === 'done');
    }, undefined, { timeout: 15_000 }).catch(() => {});
    // A route with no stage and no hero passes the wait above at once — before the SPA has painted. Wait for CONTENT (or a
    // refusal) too, bounded: the app either says something or says why not.
    await page.waitForFunction(() => document.body.innerText.length > 40 || document.querySelector('[data-stage^="refused"], [data-refused]') !== null, undefined, { timeout: 10_000 }).catch(() => {});
    const read = async () => page.evaluate(() => ({
      stage: document.querySelector('[data-stage]')?.getAttribute('data-stage') ?? null,
      canvases: document.querySelectorAll('canvas').length,
      refusals: Array.from(document.querySelectorAll('[data-stage^="refused"], [data-refused], [data-hero="refused"]')).length,
      text: document.body.innerText.length,
    }));
    let r = await read();
    if (LOSE) {
      // Lose the stage's context and see that the page SAYS so (a readable flat surface), then that it recovers.
      const lost = await page.evaluate(() => {
        const c = document.querySelector('[data-stage] canvas'); const gl = c?.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_lose_context'); if (!ext) return 'no-ext'; ext.loseContext(); setTimeout(() => ext.restoreContext(), 400); return 'lost';
      });
      await page.waitForTimeout(300);
      const during = await read();
      await page.waitForTimeout(1500);
      const after = await read();
      r = { ...after, lost, during: during.stage };
      if (lost === 'lost' && !(String(during.stage ?? '').startsWith('refused') || during.stage === 'drawn')) verdict = 'SILENT-ON-LOSS';
      else if (lost === 'lost' && after.stage !== 'drawn') verdict = 'NO-RECOVERY';
      else verdict = 'OK';
    } else {
      const stageFine = r.stage === null || r.stage === 'drawn' || String(r.stage).startsWith('refused');
      verdict = stageFine && r.text > 40 ? 'OK' : (r.text <= 40 ? 'NO-TEXT' : 'BLANK');
    }
    n += 1;
    console.log(`${verdict.padEnd(15)} ${String(dpr)}× ${String(width).padStart(4)}${REDUCED ? ' reduced' : ''} ${path.padEnd(28)} stage=${r.stage} canvases=${r.canvases}${r.lost ? ` loss=${r.lost}/${r.during}` : ''}`);
    if (verdict !== 'OK') failures.push(`${path} @${dpr}×/${width}: ${verdict}`);
  } catch (e) {
    failures.push(`${path} @${dpr}×/${width}: ${String(e).split('\n')[0]}`);
  }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${n} render checks · ${failures.length} failures`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
