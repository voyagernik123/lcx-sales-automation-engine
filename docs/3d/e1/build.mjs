import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const WEB = join(ROOT, 'apps/web');
const dist = join(WEB, 'dist/assets');
const css = readdirSync(dist).filter(f => f.endsWith('.css')).map(f => readFileSync(join(dist,f),'utf8')).join('\n');
/*
 * THE PANEL CONTENT IS DERIVED FROM THE REPOSITORY, NOT TYPED INTO THE HARNESS.
 *
 * E1 renders five workstreams and prints "Every row below is checkable against this repository." An
 * audit found two of the five rows wrong: E0's frame time was given as 4.41 ms (that is P1's number;
 * E0 measured 1.305 at 1x) and E3-E7 were "NOT STARTED" after E5 and E6 had shipped READMEs.
 *
 * A claim of checkability that a reader has to take on trust is worse than no claim, and §6 rule 6 is
 * precisely about invented content in a rendered environment. So the status of every environment is
 * now READ from its own README's first line at build time and injected. It cannot go stale without
 * the README going stale with it, and a missing README becomes a visible refusal rather than a row
 * that quietly keeps asserting last month's state.
 */
const envStates = {};
for (const dir of readdirSync(join(ROOT, 'docs/3d')).sort()) {
  const rd = join(ROOT, 'docs/3d', dir, 'README.md');
  if (!/^e\d+$/.test(dir) || !existsSync(rd)) continue;
  const first = readFileSync(rd, 'utf8').split('\n')[0];
  // `# E5 · THE SURFACE — status: **AGREES ...**`  and E0/E8's older bare-bold form.
  const m = first.match(/^#\s*(E\d+)\s*·\s*([^—]+?)\s*—\s*(?:status:\s*)?(.*)$/);
  if (!m) continue;
  const verdict = (m[3].match(/\*\*(.+?)\*\*/)?.[1] ?? m[3]).trim();
  envStates[m[1]] = { id: m[1], name: m[2].trim(), verdict };
}
if (Object.keys(envStates).length === 0) {
  console.error('  REFUSED: no docs/3d/e*/README.md could be parsed, so no panel content is derivable');
  process.exit(1);
}
console.log(`  derived ${Object.keys(envStates).length} environment states: ${Object.keys(envStates).join(' ')}`);

const r = await build({
  entryPoints: [join(HERE,'entry.ts')], bundle: true, format: 'esm', target: 'es2022',
  minify: true, jsx: 'automatic', logLevel: 'silent', outfile: join(HERE,'bundle.js'),
  alias: { '@': join(WEB,'src'), '@lcx/gl': join(ROOT,'packages/gl/src/index.ts'), '@lcx/shared': join(ROOT,'packages/shared/src/index.ts') },
  define: {
    'process.env.NODE_ENV': '"production"',
    __ENV_STATES__: JSON.stringify(envStates),
  },
});
if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
// One canvas and one log element, nothing else: the theatre IS the frame, and any chrome around
// it would be chrome I then have to reason about when a capture looks wrong.
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>E1</title>
<style>${css}</style>
<style>body{margin:0;padding:28px;background:#04060b}
 .cell{border:1px solid #1b2540;border-radius:10px;padding:16px 18px;background:#0e1628;position:relative}
 .nm{font:600 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7fb2ff}
 .no{font:400 11.5px/1.5 system-ui,sans-serif;color:#7d8aa3}</style>
<canvas id="c" style="width:1200px;height:720px;display:block"></canvas>
<pre id="log" style="color:#7fb2ff;font:11px ui-monospace,monospace;padding:12px 0"></pre>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
