/**
 * Static server for the P1 gate page, so it can be opened in a REAL browser on a REAL GPU.
 *
 * This exists for one reason: the headless capture runs on SwiftShader, a software
 * rasteriser, and its frame times say nothing about a GPU in either direction. §7's gate
 * asks for 60fps on an M1, and the only way to answer that is to run it on one.
 *
 * `?perf=N` on the page runs N timed redraws and writes the result to `window.__PERF__`.
 *
 * Loopback only, this directory only. Usage:  node docs/3d/p1/serve.mjs [port]
 */
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 5599;
const SAMPLES = resolve(HERE, '../p0/samples.json');

if (!existsSync(resolve(HERE, 'bundle.js'))) {
  console.error('bundle.js is missing — run `node docs/3d/p1/build.mjs` first');
  process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/* The page reads its data from `window.__SAMPLES__`, which the capture harness injects via
   addInitScript. A real browser has no such hook, so the server inlines it — the same
   bytes from the same generated file, not a second copy that could drift. */
const inject = () =>
  `<script>window.__SAMPLES__=${readFileSync(SAMPLES, 'utf8')}</script>\n`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(HERE, rel === '/' ? 'risk-cloud.html' : rel);
  if (!file.startsWith(HERE) || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  const ext = file.slice(file.lastIndexOf('.'));
  let body = readFileSync(file);
  if (ext === '.html') body = Buffer.from(inject() + body.toString('utf8'));
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream' });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`  P1 gate page   http://127.0.0.1:${PORT}/`);
  console.log(`  frame time     http://127.0.0.1:${PORT}/?perf=180`);
});
