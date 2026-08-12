import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const WEB = join(ROOT, 'apps/web');
const dist = join(WEB, 'dist/assets');
const css = readdirSync(dist).filter(f => f.endsWith('.css')).map(f => readFileSync(join(dist,f),'utf8')).join('\n');
const r = await build({
  entryPoints: [join(HERE,'entry.ts')], bundle: true, format: 'esm', target: 'es2022',
  minify: true, jsx: 'automatic', logLevel: 'silent', outfile: join(HERE,'bundle.js'),
  alias: { '@': join(WEB,'src'), '@lcx/gl': join(ROOT,'packages/gl/src/index.ts'), '@lcx/shared': join(ROOT,'packages/shared/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
// One canvas and one log element, nothing else: the theatre IS the frame, and any chrome around
// it would be chrome I then have to reason about when a capture looks wrong.
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>E4</title>
<style>${css}</style>
<style>body{margin:0;padding:28px;background:#04060b}
 .cell{border:1px solid #1b2540;border-radius:10px;padding:16px 18px;background:#0e1628;position:relative}
 .nm{font:600 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7fb2ff}
 .no{font:400 11.5px/1.5 system-ui,sans-serif;color:#7d8aa3}</style>
<canvas id="c" style="width:1200px;height:720px;display:block"></canvas>
<pre id="log" style="color:#7fb2ff;font:11px ui-monospace,monospace;padding:12px 0"></pre>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
