/**
 * W0 · render every primitive to static markup against the app's REAL stylesheet.
 *
 * The CSS is the app's own built bundle, not a hand-written approximation — the whole
 * question is what an operator actually sees, and a sheet styled by anything else answers a
 * different question.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../../apps/web');

const dist = join(WEB, 'dist/assets');
if (!existsSync(dist)) { console.error('apps/web/dist missing — run `npm run build -w @lcx/web` first'); process.exit(1); }
const cssFiles = readdirSync(dist).filter((f) => f.endsWith('.css'));
if (cssFiles.length === 0) { console.error('no built CSS found in apps/web/dist/assets'); process.exit(1); }
const css = cssFiles.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');
console.log(`  stylesheet: ${cssFiles.join(', ')} (${(css.length / 1024).toFixed(0)} KB)`);

const entry = join(HERE, '.entry.tsx');
writeFileSync(entry, `
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PANELS } from './sheet';
const panels = PANELS.map((p) => ({ name: p.name, note: p.note, html: renderToStaticMarkup(p.node) }));
globalThis.__OUT__ = JSON.stringify(panels);
`);

const r = await build({
  entryPoints: [entry], bundle: true, format: 'iife', platform: 'node', target: 'node20',
  write: false, logLevel: 'silent', jsx: 'automatic',
  alias: { '@': join(WEB, 'src') },
  external: [],
});
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }

const mod = { exports: {} };
const fn = new Function('module', 'exports', 'require', 'globalThis', r.outputFiles[0].text + '\nreturn globalThis.__OUT__;');
const { createRequire } = await import('node:module');
const req = createRequire(join(WEB, 'package.json'));
const panels = JSON.parse(fn(mod, mod.exports, req, globalThis));
console.log(`  rendered ${panels.length} panels`);

const page = (theme) => `<!doctype html><meta charset="utf-8"><title>W0 contact sheet — ${theme}</title>
<style>${css}</style>
<style>
  body{margin:0;padding:28px;background:var(--bg,#fff)}
  .sheet{width:1500px;display:grid;grid-template-columns:1fr;gap:22px}
  .cell{border:1px solid var(--line,#e3e6ec);border-radius:10px;padding:16px 18px;background:var(--card-fill,#fff)}
  .hd{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
  .nm{font:600 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--navy,#123)}
  .no{font:400 11.5px/1.5 system-ui,sans-serif;color:var(--grey,#667)}
  h1{font:600 20px/1.2 system-ui,sans-serif;margin:0 0 4px;color:var(--navy,#123)}
  .sub{font:400 13px/1.5 system-ui,sans-serif;color:var(--grey,#667);margin:0 0 22px}
</style>
<div class="${theme === 'dark' ? 'dark' : ''}">
<div class="sheet">
  <div><h1>W0 · LOOK AUDIT — ${theme}</h1>
  <p class="sub">Every chart primitive in the kit, on real-shaped data, at 2×. PLATFORM_VFX_100X.md §6.</p></div>
  ${panels.map((p) => `<div class="cell"><div class="hd"><span class="nm">${p.name}</span><span class="no">${p.note}</span></div>${p.html}</div>`).join('\n')}
</div></div>`;

writeFileSync(join(HERE, 'sheet-light.html'), page('light'));
writeFileSync(join(HERE, 'sheet-dark.html'), page('dark'));
console.log('  wrote sheet-light.html, sheet-dark.html');
