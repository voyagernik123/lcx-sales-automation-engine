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
  entryPoints: [join(HERE,'entry.tsx')], bundle: true, format: 'esm', target: 'es2022',
  minify: true, jsx: 'automatic', logLevel: 'silent', outfile: join(HERE,'bundle.js'),
  alias: { '@': join(WEB,'src'), '@lcx/gl': join(ROOT,'packages/gl/src/index.ts'), '@lcx/shared': join(ROOT,'packages/shared/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>W2</title>
<style>${css}</style>
<style>body{margin:0;padding:30px;background:#0b1120}#wrap{width:820px}
 h1{font:600 17px/1.2 system-ui;margin:0 0 4px;color:#f2f6fc}
 .sub{color:#7d8aa3;font-size:12.5px;margin:0 0 20px}
 .card{border:1px solid #1b2540;border-radius:10px;padding:18px 20px;background:#0e1628}</style>
<div id="wrap"><h1>W2 · BarChartH, re-backed and mounted live</h1>
<p class="sub">Same component, same props. The bar fill is the GL layer; every label, value, tooltip and hit target is the original SVG.</p>
<div class="card"><div id="root"></div></div></div>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
