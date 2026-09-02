#!/usr/bin/env node
/**
 * PROVE THE POLICY IS NOT STRICTER THAN THE APP.
 *
 * `gen-headers.mjs` writes `dist/_headers`. Cloudflare applies it; nothing local does — so a
 * policy that blocks the bundle, a font, the API or the pre-hydration scripts would be found by
 * the first operator after deploy, not by the build. This serves `dist/` the way Pages does
 * (SPA fallback to index.html, the `_headers` file applied to every response) and drives the
 * built app through the routes that exercise every resource class — the sign-in page (fonts,
 * GL, the still), the launch page (the objects), a seated desk (API connect, EventSource) —
 * asserting ZERO `securitypolicyviolation` events and zero console errors mentioning CSP.
 *
 *   node scripts/verify-headers.mjs            after `npm run build -w @lcx/web`
 *
 * The API is aborted (`/v1/**` → connectionrefused), so the check is about the policy, not the
 * backend; a blocked connect-src shows up as a violation event regardless.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const PORT = Number(process.env.VERIFY_HEADERS_PORT ?? 5191);
const ROUTES = ['/select', '/lcxos', '/command-deck', '/regulatory-dashboard', '/ontology'];

const headersFile = join(DIST, '_headers');
if (!existsSync(headersFile)) { console.error('verify-headers: dist/_headers missing — run the build first'); process.exit(1); }
const rules = readFileSync(headersFile, 'utf8').split('\n').filter((l) => /^\s{2}\S/.test(l)).map((l) => {
  const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
});
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = join(DIST, decodeURIComponent(url.pathname));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  for (const [k, v] of rules) res.setHeader(k, v);
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));

const seat = {
  email: 'nik@lcx.com', apiKey: 'nik@lcx.com:verify-headers-not-a-real-passcode',
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
const violations = [];
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    // Surfaced through the console so the harness can read it; `window.__csp` for a direct read.
    const w = window; w.__csp = w.__csp || []; w.__csp.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'} @ ${e.sourceFile || document.location.pathname}:${e.lineNumber || 0}`);
  });
});
page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) violations.push(`console: ${m.text().slice(0, 200)}`); });
// Seat the operator the way the instrument does so the desks render past the front door.
await page.addInitScript((s) => {
  localStorage.setItem('lcx_operator_email', s.email);
  localStorage.setItem('lcx_api_key', s.apiKey);
}, seat);

let checked = 0;
for (const route of ROUTES) {
  await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() => window.__csp ?? []);
  for (const v of found) violations.push(`${route}: ${v}`);
  const painted = await page.evaluate(() => document.body.innerText.trim().length > 20);
  if (!painted) violations.push(`${route}: the page painted no text — the bundle itself may be blocked`);
  checked += 1;
}
await browser.close();
server.close();

const csp = rules.find(([k]) => k.toLowerCase() === 'content-security-policy')?.[1] ?? '';
console.log(`verify-headers: ${checked} routes under the built policy (${csp.length} chars, ${(csp.match(/sha256-/g) ?? []).length} inline hashes)`);
if (violations.length) {
  console.error(`verify-headers: ${violations.length} violation(s)`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('verify-headers: zero CSP violations, every route painted');
