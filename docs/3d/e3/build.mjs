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
// One canvas and one log element, nothing else: the channel IS the frame, and any chrome around it
// would be chrome I then have to reason about when a capture looks wrong.
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>E3</title>
<style>${css}</style>
<style>body{margin:0;padding:28px;background:#04060b}</style>
<canvas id="c" style="width:1200px;height:720px;display:block"></canvas>
<pre id="log" style="color:#7fb2ff;font:11px ui-monospace,monospace;padding:12px 0"></pre>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
