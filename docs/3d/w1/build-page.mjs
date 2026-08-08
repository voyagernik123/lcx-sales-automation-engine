/** Compose the side-by-side page: the REAL BarChartH on the left, L4 on the right. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../../apps/web');
const dist = join(WEB, 'dist/assets');
const css = readdirSync(dist).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');

const entry = join(HERE, '.svg-entry.tsx');
writeFileSync(entry, `
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarChartH } from '@/components/charts';
const DATA = [['Price',14],['Timing',11],['No budget',9],['Competitor',7],['No decision',5],['Compliance',3]]
  .map(([label,value]) => ({ label, value }));
globalThis.__SVG__ = renderToStaticMarkup(h(BarChartH, { data: DATA }));
`);
const r = await build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'node', target: 'node20',
  write: false, logLevel: 'silent', jsx: 'automatic', alias: { '@': join(WEB, 'src') } });
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
const { createRequire } = await import('node:module');
const req = createRequire(join(WEB, 'package.json'));
const svg = new Function('module','exports','require','globalThis', r.outputFiles[0].text + '\nreturn globalThis.__SVG__;')
  ({exports:{}},{},req,globalThis);

writeFileSync(join(HERE, 'compare.html'), `<!doctype html><meta charset="utf-8"><title>W1</title>
<style>${css}</style>
<style>
 body{margin:0;padding:30px;background:#05070d;color:#eef2f9;font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif}
 #wrap{width:1560px}
 h1{font:600 20px/1.2 system-ui;margin:0 0 4px;color:#f2f6fc}
 .sub{color:#7d8aa3;font-size:13px;margin:0 0 22px;max-width:1000px}
 .row{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
 .pane{border:1px solid #1b2540;border-radius:10px;padding:16px 18px;background:#0b1120}
 .tag{font:600 10px/1 "IBM Plex Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:#4d5f80;margin-bottom:14px}
 canvas{display:block;width:100%;border-radius:6px}
 #labels{position:absolute;inset:0;pointer-events:none}
 /* The gutter is a PERCENTAGE of the canvas, because the canvas scales with the pane.
    A fixed 128px offset put every label on top of its own bar at this width. */
 #labels .lab{position:absolute;right:90.2%;transform:translateY(-50%);text-align:right;font:400 15px/1 system-ui,sans-serif;color:#c3cee0;white-space:nowrap}
 #labels .val{position:absolute;transform:translate(10px,-50%);font:400 15px/1 system-ui,sans-serif;color:#eef2f9;font-variant-numeric:tabular-nums}
 #verdict{margin-top:18px;font:500 10.5px/1.7 "IBM Plex Mono",monospace;color:#4f5f7d}
</style>
<div id="wrap">
 <h1>W1 · the same six numbers, drawn twice</h1>
 <p class="sub">Identical data, identical scale, identical bar geometry. The only difference is the render: flat sRGB fills on the left, linear light with modelling, an analytic anti-aliased rounded edge and a contact shadow on the right.</p>
 <div class="row">
  <div class="pane"><div class="tag">Today · SVG</div><div class="dark">${svg}</div></div>
  <div class="pane"><div class="tag">L4 · same pipeline as the 3-D surfaces</div><div style="position:relative"><canvas id="gl" width="1400" height="620"></canvas><div id="labels"></div></div></div>
 </div>
 <p id="verdict"></p>
</div>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote compare.html');
