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
// THERE IS NOW A DOM OVERLAY. This comment used to say there was not, and the reason it gave was a good
// one, so it is kept below rather than deleted — the decision was reversed by doing the work it named as
// missing, not by deciding the objection was wrong.
//
// SUPERSEDED 2026-08-13 (§7.4 of 3D_VFX_FINAL_PLAN.md, an approved owner decision). What it said:
//
//   "NO DOM OVERLAY. E8 projects the LCX mark into the frame because rule 4 requires authored vector
//    art to stay in the DOM. A globe's equivalent would be eight city LABELS, and three of these
//    sites are within eight degrees of each other — at this camera that is ~23 px apart, closer than
//    the labels are wide. Projected text without a collision policy is text that reads as broken, and
//    this harness cannot check its own legibility. Named as open work in the README instead."
//
// Every clause of that was true and none of it was an argument for leaving E2 as the one environment
// with no DOM text — it was an argument that the layer needed a COLLISION POLICY before it could exist.
// `entry.ts` now carries one: labels hide hard behind the limb on the same dot product the report
// prints, fade on that quantity normalised, and a label that cannot sit beside its own dot is pushed
// past the silhouette on a leader line. Sites that still cannot be labelled are stated in DOM prose
// with their coordinates and the reason, so `projected + inWords === cities` and nothing is lost.
//
// The legibility objection is answered the way §5 answers everything else: with a capture, not a claim.
writeFileSync(join(HERE,'live.html'), `<!doctype html><meta charset="utf-8"><title>E2</title>
<style>${css}</style>
<style>body{margin:0;padding:28px;background:#04060b}
 .nm{font:600 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7fb2ff}</style>
<div id="stage" style="position:relative;width:1200px;height:720px">
  <canvas id="c" style="width:1200px;height:720px;display:block"></canvas>
</div>
<pre id="log" style="color:#7fb2ff;font:11px ui-monospace,monospace;padding:10px 0"></pre>
<script type="module" src="./bundle.js"></script>`);
console.log('  wrote live.html');
