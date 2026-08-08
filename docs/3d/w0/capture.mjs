import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const server = createServer((q, r) => {
  const rel = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const f = join(HERE, rel === '/' ? 'sheet-light.html' : rel);
  if (!f.startsWith(HERE) || !existsSync(f)) { r.writeHead(404).end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const O = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 1560, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto(`${O}/sheet-${theme}.html`);
  await p.waitForTimeout(400);
  await p.locator('.sheet').screenshot({ path: resolve(HERE, `sheet-${theme}.png`) });
  console.log(`  sheet-${theme}.png`);
  await p.close();
}
await b.close(); server.close();
