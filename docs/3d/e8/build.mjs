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
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>E8</title>
<style>${css}</style>
<style>body{margin:0;padding:28px;background:#05070d}
 body{background:#04060b}
 .cell{border:1px solid #1b2540;border-radius:10px;padding:16px 18px;background:#0e1628;position:relative}
 .hd{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
 .nm{font:600 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7fb2ff}
 .no{font:400 11.5px/1.5 system-ui,sans-serif;color:#7d8aa3}</style>
<div id="stage" style="position:relative;width:1200px;height:720px">
  <canvas id="c" style="width:1200px;height:720px;display:block"></canvas>
  <!-- THE MARK STAYS IN THE DOM (rule 4). Vector, selectable, printable, in the a11y tree. -->
  <svg id="mark" viewBox="0 0 194.000 193.999" aria-label="LCX"
       style="position:absolute;width:132px;height:132px;transform:translate(-50%,-50%);opacity:.96">
    <path d="M97.722 82.019L148.917 30.605L148.733 0.065L97.113 52.244L45.454 0.000L45.045 30.144Z" fill="#0B1220" />
    <path d="M111.852 97.505L163.347 148.620L193.936 148.436L141.674 96.897L194.000 45.320L163.808 44.912Z" fill="#0B1220" />
    <path d="M96.278 111.981L45.083 163.394L45.267 193.934L96.887 141.756L148.546 193.999L148.954 163.855Z" fill="#0B1220" />
    <path d="M82.148 96.027L30.653 44.912L0.065 45.097L52.326 96.635L0.000 148.212L30.192 148.620Z" fill="#0B1220" />
  </svg>
</div>
<pre id="log" style="color:#7fb2ff;font:11px ui-monospace,monospace;padding:10px 0"></pre>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
