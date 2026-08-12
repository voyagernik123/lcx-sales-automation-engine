/*
 * THE STATIC SERVER EVERY 3-D HARNESS TOOL NEEDS, IN ONE PLACE.
 *
 * ── WHY IT IS SHARED NOW ─────────────────────────────────────────────────────────────
 * Twelve copies of the same fourteen lines existed — one per `capture.mjs` plus one in
 * `scripts/3d-audit.mjs` — and all twelve carried the same defect, which is what a copy is for.
 *
 * ── THE DEFECT: `existsSync` IS TRUE FOR A DIRECTORY ─────────────────────────────────
 * The guard was `existsSync(f)` and the next line was `readFileSync(f)`. A request for `/fonts/` (or
 * `//fonts/`, which `normalize` collapses to it) makes `rel.slice('/fonts/'.length)` the empty string, so
 * `join(FONTS, '')` is the fonts DIRECTORY, `existsSync` says yes, and `readFileSync` throws EISDIR from
 * inside the request handler. There was no try/catch and no server-level 'error' listener, so that is an
 * uncaught exception and the PROCESS DIES — taking Playwright with it, because the server shares the
 * process. Measured: `curl --path-as-is .../fonts/` returned an empty reply and the next request to
 * `/live.html` could not connect at all. In `scripts/3d-audit.mjs` that kills the sweep mid-run, after
 * which `docs/3d/e9/README.md` is never rewritten and the audit reports nothing rather than a failure.
 *
 * No page emits that request today — the inlined CSS asks for five named `.woff2` files — so it was a
 * one-request kill switch on a local tool rather than something a reader hits. It is fixed by checking
 * what the path IS (`statSync().isFile()`) rather than that something is there, and by refusing to let a
 * request handler be the thing that ends the process.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/**
 * Serve one harness directory, with `/fonts/*` routed out to the real font files.
 *
 * The fonts route exists because they 404'd for the whole programme before it, so every capture was shot
 * with substituted system metrics — and the legibility thresholds in E1, E5 and E6 are stated in pixels.
 *
 * @param {{ root: string, fonts?: string, onError?: (e: Error, url: string) => void }} opts
 * @returns {Promise<import('node:http').Server>} already listening on 127.0.0.1, port 0
 */
export function serveHarness({ root, fonts, onError }) {
  const report = onError ?? ((e, url) => console.error(`  server: ${url} — ${e.message}`));
  const s = createServer((q, r) => {
    let f = null;
    try {
      const rel = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname))
        .replace(/^(\.\.[/\\])+/, '');
      f = (fonts && rel.startsWith('/fonts/'))
        ? join(fonts, rel.slice('/fonts/'.length))
        : join(root, rel === '/' ? 'live.html' : rel);
      if (!f.startsWith(root) && !(fonts && f.startsWith(fonts))) { r.writeHead(404).end(); return; }
      /* WHAT IT IS, not whether something is there. A directory exists and cannot be read. */
      const st = statSync(f);
      if (!st.isFile()) { r.writeHead(404).end(); return; }
      r.writeHead(200, { 'content-type': MIME[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream' });
      r.end(readFileSync(f));
    } catch (e) {
      /* A missing file is a 404 and not worth a line. Anything else is worth SAYING — a silent 500 in a
         capture tool reads as a blank page later — but it must not end the process. */
      if (e && e.code !== 'ENOENT') report(e, q.url ?? '?');
      try { r.writeHead(e && e.code === 'ENOENT' ? 404 : 500).end(); } catch { /* already sent */ }
    }
  });
  /* A socket-level error (a client that hangs up mid-response) is also an uncaught exception without this. */
  s.on('error', (e) => report(e, 'server'));
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}
