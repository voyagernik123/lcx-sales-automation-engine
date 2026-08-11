/**
 * P1 · bundle the gate surface, and MEASURE THE SPINE.
 *
 * `3D_WORK_100X.md` §6.4 allocates the 304 KB of passthrough headroom up front: L1 45,
 * L2 10, L3 8. §6.3.3 makes "bytes measured and reported" a per-lane definition of done,
 * and the plan is explicit that a lane which overruns REPORTS IT AND STOPS rather than
 * silently taking budget from another lane.
 *
 * So this bundles each layer alone, in the same configuration the web app would use
 * (ESM, minified, tree-shaken, no gzip — the perf budget measures RAW bytes), and exits
 * non-zero if any layer is over. A budget that is only checked by hand is not a budget.
 *
 * Usage:  node docs/3d/p1/build.mjs
 */
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const GL = resolve(ROOT, 'packages/gl/src');

/** Raw KB, one decimal. Not gzip — the perf budget measures raw. */
const kb = (bytes) => bytes / 1024;

const COMMON = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'silent',
  alias: { '@lcx/gl': resolve(GL, 'index.ts') },
};

/**
 * Each layer measured through its OWN entry point, so a layer's cost is what a surface
 * importing only that layer would actually pay. Measuring the barrel would charge every
 * layer for all of them and hide which one overran.
 */
const LAYERS = [
  { name: 'L1 renderer', budgetKb: 45, entry: ['stage.ts', 'math.ts', 'primitives/points.ts', 'primitives/lines.ts'] },
  { name: 'L2 look', budgetKb: 10, entry: ['look/colour.ts', 'look/tonemap.ts', 'look/pipeline.ts'] },
  { name: 'L3 motion', budgetKb: 8, entry: ['motion/index.ts'] },
  /*
   * L4 env — THE LANE THAT DID NOT EXIST WHILE THE WHOLE 3D PROGRAMME WAS BUILT IN IT.
   *
   * §6.3.3 makes "bytes measured and reported" the per-lane definition of done, and the environment
   * layer — GGX, shadows, AO, DOF, fog, the sky, the meshes, the DOM projection — was measured by
   * nothing. Noticed only because adding ~1.2 KB of fog GLSL to `env/lit.ts` left `L2 look` sitting at
   * exactly 6.5 KB: a budget that does not move when you add code to what you believe it covers is a
   * budget that is not watching. It reported green through five environments.
   *
   * 60 KB is not a guess. `three.js` costs 513 KB for the comparable surface (measured in P1, and the
   * reason this package exists at all), so the ceiling is set at well under an eighth of it while
   * leaving room for E3-E7's particles and volumetrics. If a future lane needs more than 60 KB the
   * answer is to argue for the raise here, in the open, rather than to discover it in a bundle.
   */
  { name: 'L4 env', budgetKb: 60, entry: [
    'env/mesh.ts', 'env/camera.ts', 'env/lit.ts', 'env/sky.ts',
    'env/target3d.ts', 'env/ao.ts', 'env/dof.ts', 'env/project.ts',
  ] },
];

const tmp = mkdtempSync(join(tmpdir(), 'lcx-gl-measure-'));

async function measure(files) {
  // A synthetic entry that re-exports the layer, so esbuild tree-shakes exactly what a
  // consumer of that layer would keep.
  const src = files.map((f, i) => `export * as m${i} from ${JSON.stringify(resolve(GL, f))};`).join('\n');
  const entry = join(tmp, `entry-${files.length}-${files[0].replace(/\W/g, '_')}.ts`);
  writeFileSync(entry, src);
  const r = await build({ ...COMMON, entryPoints: [entry] });
  return r.outputFiles[0].contents.byteLength;
}

let over = false;
let spineTotal = 0;
console.log('\n  layer          raw KB   budget   ');
console.log('  ─────────────────────────────────');
for (const layer of LAYERS) {
  const bytes = await measure(layer.entry);
  spineTotal += bytes;
  const size = kb(bytes);
  const ok = size <= layer.budgetKb;
  if (!ok) over = true;
  console.log(
    `  ${layer.name.padEnd(13)} ${size.toFixed(1).padStart(6)}   ${String(layer.budgetKb).padStart(6)}   ${ok ? '✓' : '✗ OVER'}`,
  );
}
const SPINE_BUDGET = LAYERS.reduce((a, l) => a + l.budgetKb, 0);
console.log('  ─────────────────────────────────');
console.log(`  ${'spine'.padEnd(13)} ${kb(spineTotal).toFixed(1).padStart(6)}   ${String(SPINE_BUDGET).padStart(6)}`);

/* three.js, measured at P0 on the same settings, for the comparison that decided the
   architecture. Not re-derived here — the number lives in docs/3d/p0/README.md. */
console.log(`\n  three.js (P0, same settings)  513.3 KB  — ${(513.3 / kb(spineTotal)).toFixed(0)}× the spine\n`);

/* Now the actual gate bundle. */
const out = await build({
  ...COMMON,
  entryPoints: [resolve(HERE, 'entry.ts')],
  write: true,
  outfile: resolve(HERE, 'bundle.js'),
});
if (out.errors?.length) {
  for (const e of out.errors) console.error(e);
  process.exit(1);
}
const gateBytes = (await build({ ...COMMON, entryPoints: [resolve(HERE, 'entry.ts')] }))
  .outputFiles[0].contents.byteLength;
/* The gate bundle can come in AT OR UNDER the layer sum, and that is not a contradiction:
   each layer above is measured with everything in it retained, whereas the gate is
   tree-shaken against one surface's actual imports. The layer numbers are the ceiling a
   lane is charged; the gate number is what this particular lane ships. Both are printed
   in bytes so neither can be rounded into agreeing. */
console.log(`  gate bundle (spine + surface)  ${kb(gateBytes).toFixed(1)} KB  (${gateBytes} B)`);
console.log(`  layer sum, nothing shaken      ${kb(spineTotal).toFixed(1)} KB  (${spineTotal} B)\n`);

if (over) {
  console.error('  A layer is over budget. §6.4: a lane that overruns REPORTS IT AND STOPS.\n');
  process.exit(1);
}
