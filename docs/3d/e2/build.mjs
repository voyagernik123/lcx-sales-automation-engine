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
/*
 * `#stage` KEEPS ITS INLINE `height:720px`, AND THAT IS NOT THE DEFECT IT WAS REPORTED AS.
 *
 * `docs/3d/e9/INSTRUMENT_CHECK.md` traced E2's blank flat branch to this host: on `?refuse=1` it survived
 * the refusal, because `_shared/flatFallback.ts` hid canvases only, and the flat table rendered correctly
 * 720 px below where anyone could see it — first ink at y766 in a 758 px frame, 0 of 37 visible text nodes
 * above the fold. The obvious repair is to delete the height here. That is the wrong file and the wrong
 * repair, on two measurements:
 *
 *   · THE RESERVATION EARNS ITS PLACE. The canvas mounts when `bundle.js` evaluates, and this host is what
 *     stops the page from collapsing to nothing and jumping under the reader until it does. A refusal is
 *     the one state where the reservation is a lie; every other state needs it.
 *   · E2 IS NOT ALONE, so a fix here fixes one page. E8 writes the same host (`e8/build.mjs:25`) and
 *     measured the same y799 fallback on the same path, and on a real `WEBGL_lose_context` after READY —
 *     with the diagnostic hidden as the trial hides it — EIGHT of the nine environments put the fallback
 *     below the fold, because by then each has built itself a fixed-height wrapper around its canvas.
 *
 * So the release belongs where the refusal is known: `showRefusal` now walks a hidden canvas's ancestors
 * and stamps `[data-lcx-released]`, whose rule sets `height:auto`. This host is unchanged, and E2's flat
 * branch measures fallback y79, first ink y38, 38 of 38 visible text nodes above the fold.
 */
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
