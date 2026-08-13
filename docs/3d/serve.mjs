/**
 * Static server for the WHOLE `docs/3d` tree, so the §7(b) trial can actually be run.
 *
 * ── WHY THIS EXISTS AND `p1/serve.mjs` DOES NOT COVER IT ────────────────────────────────
 * `p1/serve.mjs` is rooted at `p1/` and serves one page. The §7(b) instrument
 * (`e9/task.html`) is different in kind: it embeds `../e2/live.html`, `../e3/live.html` and
 * four more in an iframe, and each of those loads its own sibling `bundle.js`. A server
 * rooted at one environment directory cannot serve any of that, so the instrument that
 * §4.1 of `3D_VFX_FINAL_PLAN.md` calls "the highest-value item in this document" could not
 * be opened at all without one of these. That is a poor reason for a measurement not to
 * exist.
 *
 * ── WHY A REAL BROWSER AND NOT THE HEADLESS HARNESS ─────────────────────────────────────
 * The same reason `p1/serve.mjs` gives. Headless capture runs on SwiftShader, and clause
 * (b) is a claim about a person reading a surface on a GPU. It also needs a person: the
 * task file is its own answer key, so whoever built the environments cannot be the operator.
 *
 * ── SCOPE, DELIBERATELY NARROW ──────────────────────────────────────────────────────────
 * Loopback only, `docs/3d` only, GET only, and no directory listing. It serves static bytes
 * to one person for twenty minutes; it is not an application server and must never grow into
 * one. Path traversal is blocked by resolving and then checking containment, which is the
 * only check that actually holds — a prefix test on the raw string does not, because `..`
 * survives normalisation in enough encodings to be worth not relying on.
 *
 * Usage:  node docs/3d/serve.mjs [port]        (default 5600, next to p1's 5599)
 *         then open  /e9/task.html   for the §7(b) trial
 *                    /e9/gate-a.html for the clause (a) decision sheet
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 5600;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'text/plain' }).end('GET only');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://x');
  /* Landing on the trial rather than a listing: the one thing anyone opening this wants. */
  const rel = url.pathname === '/' ? '/e9/task.html' : url.pathname;
  const file = resolve(join(ROOT, decodeURIComponent(rel)));

  /* RESOLVE FIRST, THEN CONTAIN. `resolve` collapses every `..` and symlink-free segment, so
     this comparison is about the real target rather than about the spelling of the request. */
  if (!file.startsWith(ROOT + '/') || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    /* The trial compares two surfaces by TIME. A cached second load would make the flat
       surface look faster than it is, in a measurement whose entire output is milliseconds. */
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`  §7(b) trial       http://127.0.0.1:${PORT}/e9/task.html`);
  console.log(`  §7(a) decisions   http://127.0.0.1:${PORT}/e9/gate-a.html`);
  console.log('');
  console.log('  Six environments are measured: e2 e3 e4 e5 e6 e7.');
  console.log('  E8 is not applicable (no dataset, so no answer to time) and E1 is deferred —');
  console.log('  both reasons are stated at the top of e9/task.html.');
});
