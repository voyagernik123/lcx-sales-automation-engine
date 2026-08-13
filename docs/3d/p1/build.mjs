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
 * THIS SCRIPT IS ALSO THE ONLY PLACE THE PUBLISHED FIGURES COME FROM. It used not to be,
 * and here is what that cost (2026-08-13 audit, `3D_VFX_FINAL_PLAN.md` §4.5):
 * `docs/3d/p1/README.md` published L1 10.4 / L2 5.3 / L3 1.7 / spine 17.5 KB and "45.5 KB
 * under, 29x smaller than three.js" — figures typed in by hand when the spine was three
 * lanes. Three more lanes were added (L4 env, L3.5 particles, L4.5 field), the real spine
 * became 77.2 KB of 147 allocated, and every one of those five numbers was wrong in a
 * document that reads as a measurement. `docs/3d/w1/README.md` carried a sixth (17.6 KB)
 * and `PLATFORM_VFX_100X.md` a seventh ("45 KB unspent"). Nothing caught them because
 * nothing was checking prose against the bundler.
 *
 * Usage:
 *   node docs/3d/p1/build.mjs           measure, bundle, and CHECK the published tables
 *   node docs/3d/p1/build.mjs --write   measure, bundle, and REWRITE the published tables
 *   node docs/3d/p1/build.mjs --json    measure only; emit the machine-readable block
 */
import { build } from 'esbuild';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
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
  /*
   * 45 HERE IS L1'S LANE BUDGET AND NOTHING ELSE. The token "45" acquired three meanings in this
   * repo and they were being read as one another (`3D_VFX_FINAL_PLAN.md` §1.7):
   *   (a) this — L1 renderer's lane allocation, `3D_WORK_100X.md` §6.4 line 313. Live.
   *   (b) "~30-45 KB raw" — the ORIGINAL WHOLE-ENGINE estimate, `3D_WORK_100X.md`:80/:85, made
   *       before L4/L3.5/L4.5 existed. Superseded: six lanes now allocate 147 KB.
   *   (c) "45 KB unspent" / "45.5 KB under" — the SPINE'S HEADROOM when the spine was three
   *       lanes. Stale, and never a budget at all. Now generated, so it cannot be typed wrong.
   * Read as (b), invariant 4's "<45 KB total" cap would require deleting L4 env, L3.5 particles
   * and L4.5 field — i.e. GGX, shadows, AO, DoF, sky, particles and volumetrics.
   */
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
  /*
   * L3.5 AND L4.5 GET THEIR OWN LANES, at the figures §6.3.3 of the plan set for them — 9 KB and
   * 13 KB — rather than being folded into L4 env.
   *
   * Folding them in is what produced the overrun that led here: L4 was set at 60 KB when the layer
   * measured 45, and I claimed the 15 KB of headroom left "room for E3-E7's particles and
   * volumetrics" while the plan itself had costed those two at 22 KB. That was my arithmetic error,
   * not an overrun — 15 was never going to hold 22 — and merging the lanes would have hidden which
   * of the two was responsible.
   *
   * Separate lanes also match how a surface actually pays: E3 wants particles and no volumetrics,
   * E7 wants both, and E5 wants neither. A merged lane charges all three for all of it.
   */
  /*
   * 11 KB, RAISED FROM THE PLAN'S 9 — and this is the argument, made here rather than discovered in a
   * bundle, which is what the L4 note above demanded of whoever came next.
   *
   * Measured 12.4 KB on arrival. 2.4 KB of that was GLSL COMMENTS INSIDE TEMPLATE LITERALS, which are
   * shipped bytes a minifier cannot touch: it cannot see inside a string. Moving them into TS comments
   * immediately above each shader — where a reader is already looking, and where they cost nothing —
   * brought it to 10.0 KB.
   *
   * The remaining 1 KB over the estimate is real. §6.3.3's 9 KB was set before the layer existed, and
   * what it costs is a ping-pong float-texture simulation, curl noise with six central-differenced
   * noise evaluations, per-source emission ranges with wrap splitting, a fractional-carry scheduler,
   * and a readback path — the last of which exists so the harnesses can ASSERT on particle state
   * instead of appealing to a screenshot. I would rather pay 1 KB than lose that.
   *
   * 11 not 10: one kilobyte of genuine margin, so the next honest addition does not need a second
   * argument. The same comment-relocation is still available across the rest of the layer — measured
   * at ~11 KB in ao/dof/lit/sky/volume — and is named as open work rather than done here.
   */
  { name: 'L3.5 particles', budgetKb: 11, entry: ['env/particles.ts'] },
  { name: 'L4.5 field', budgetKb: 13, entry: ['env/volume.ts'] },
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

/*
 * three.js measured at P0 on these exact settings — the comparison that decided the
 * architecture. Held as BYTES, not as the rounded "513.3 KB", because the ratio printed
 * below used to be derived from the rounded figure and published as "29×". The byte count
 * is the one in docs/3d/p0/README.md:22.
 */
const THREEJS_BYTES = 525_595;

const lanes = [];
let over = false;
let spineTotal = 0;
for (const layer of LAYERS) {
  const bytes = await measure(layer.entry);
  spineTotal += bytes;
  const ok = kb(bytes) <= layer.budgetKb;
  if (!ok) over = true;
  lanes.push({ name: layer.name, budgetKb: layer.budgetKb, bytes, kb: kb(bytes), ok });
}
const SPINE_BUDGET = LAYERS.reduce((a, l) => a + l.budgetKb, 0);

/* Under --json, stdout is somebody's `JSON.parse` — the human table would corrupt it. */
const JSON_MODE = process.argv.includes('--json');
const say = JSON_MODE ? () => {} : (s) => console.log(s);

say('\n  layer          raw KB   budget   ');
say('  ─────────────────────────────────');
for (const l of lanes) {
  say(
    `  ${l.name.padEnd(13)} ${l.kb.toFixed(1).padStart(6)}   ${String(l.budgetKb).padStart(6)}   ${l.ok ? '✓' : '✗ OVER'}`,
  );
}
say('  ─────────────────────────────────');
say(`  ${'spine'.padEnd(13)} ${kb(spineTotal).toFixed(1).padStart(6)}   ${String(SPINE_BUDGET).padStart(6)}`);
say(
  `\n  three.js (P0, same settings)  ${kb(THREEJS_BYTES).toFixed(1)} KB` +
    `  — ${(THREEJS_BYTES / spineTotal).toFixed(1)}× the spine\n`,
);

const gateBytes = (await build({ ...COMMON, entryPoints: [resolve(HERE, 'entry.ts')] }))
  .outputFiles[0].contents.byteLength;

/*
 * --json emits before the bundle is WRITTEN, but after the gate bundle is measured: every
 * field is a real number, because a JSON block with `gateBundleBytes: null` in it is exactly
 * the sort of thing that gets transcribed into a document as if it meant something. Skipping
 * the write also means a tool reading the numbers cannot race the gate for p1/bundle.js.
 */
if (JSON_MODE) {
  console.log(JSON.stringify(measurementJson(gateBytes), null, 2));
  process.exit(over ? 1 : 0);
}

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
/* The gate bundle can come in AT OR UNDER the layer sum, and that is not a contradiction:
   each layer above is measured with everything in it retained, whereas the gate is
   tree-shaken against one surface's actual imports. The layer numbers are the ceiling a
   lane is charged; the gate number is what this particular lane ships. Both are printed
   in bytes so neither can be rounded into agreeing. */
console.log(`  gate bundle (spine + surface)  ${kb(gateBytes).toFixed(1)} KB  (${gateBytes} B)`);
console.log(`  layer sum, nothing shaken      ${kb(spineTotal).toFixed(1)} KB  (${spineTotal} B)\n`);

/* ────────────────────────────────────────────────────────────────────────────────────────
 * THE PUBLISHED FIGURES.
 *
 * Everything below turns the measurement above into the exact markdown that ships in the
 * READMEs, and then either writes it (--write) or fails if what is committed differs.
 * The fenced regions are the only place in docs/3d that may state a gl byte count.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

function measurementJson(gate) {
  return {
    /* Not a timestamp: a timestamp changes on every run and would make --check fail on a
       clean tree. Nothing here may vary unless the bundled bytes vary. */
    generatedBy: 'docs/3d/p1/build.mjs',
    lanes: lanes.map(({ name, budgetKb, bytes, ok }) => ({ name, budgetKb, bytes, ok })),
    spine: { bytes: spineTotal, allocatedKb: SPINE_BUDGET },
    gateBundleBytes: gate,
    threejsBytes: THREEJS_BYTES,
  };
}

/** One decimal, the precision every published figure uses. */
const k1 = (bytes) => kb(bytes).toFixed(1);

/**
 * The lane table for docs/3d/p1/README.md.
 *
 * KB TO ONE DECIMAL, NOT RAW BYTES, and that is a deliberate loosening. --check compares
 * this rendered text, so the gate trips when a PUBLISHED figure would change (~50 B per
 * lane) rather than when any byte moves. Comparing raw bytes would redden CI on a minifier
 * wobble that changes nothing a reader can see — and a check that cries wolf gets deleted,
 * which is how the 17.5 KB figure survived three added lanes in the first place.
 */
function renderLaneTable(gate) {
  const rows = lanes.map(
    (l) => `| ${l.name} | ≤ ${l.budgetKb} KB raw | **${k1(l.bytes)} KB** | ${l.ok ? '✓' : '✗ **OVER**'} |`,
  );
  const unspent = SPINE_BUDGET - kb(spineTotal);
  return [
    '| lane | allocated | measured | |',
    '|---|---|---|---|',
    ...rows,
    `| **spine total** (all six lanes) | ≤ ${SPINE_BUDGET} KB raw | **${k1(spineTotal)} KB** ` +
      `| ${unspent.toFixed(1)} KB of the allocation unspent |`,
    `| gate bundle — spine + this surface, tree-shaken | — | **${k1(gate)} KB** (${gate} B) ` +
      '| what this lane actually ships |',
    `| three.js, same job, same settings (P0) | — | ${k1(THREEJS_BYTES)} KB ` +
      `| **${(THREEJS_BYTES / spineTotal).toFixed(1)}× the spine** |`,
  ].join('\n');
}

/** The one-line spine figure W1 quotes. W1 is about L4 FLAT, so it states the spine only. */
function renderSpineLine() {
  return (
    `Layer budget (§6.4): the spine measures **${k1(spineTotal)} KB** of the ${SPINE_BUDGET} KB ` +
    'its six lanes allocate.'
  );
}

const REGIONS = [
  { file: resolve(ROOT, 'docs/3d/p1/README.md'), id: 'lanes', render: renderLaneTable },
  { file: resolve(ROOT, 'docs/3d/w1/README.md'), id: 'spine', render: renderSpineLine },
];

const fence = (id) => ({
  begin: `<!-- gl-budget:begin ${id} -->`,
  end: `<!-- gl-budget:end ${id} -->`,
});

let drift = false;
for (const region of REGIONS) {
  const { begin, end } = fence(region.id);
  const src = readFileSync(region.file, 'utf8');
  const from = src.indexOf(begin);
  const to = src.indexOf(end);
  /* A missing fence is a failure, not a skip. Silently skipping is how a rewrite that
     removed the marker would leave hand-typed numbers behind and still report green. */
  if (from === -1 || to === -1 || to < from) {
    console.error(`  ✗ ${region.file}: no "${begin}" … "${end}" region. The published figures cannot be generated.\n`);
    process.exit(1);
  }
  const fresh = `${begin}\n${region.render(gateBytes)}\n${end}`;
  const committed = src.slice(from, to + end.length);
  if (fresh === committed) continue;
  if (process.argv.includes('--write')) {
    writeFileSync(region.file, src.slice(0, from) + fresh + src.slice(to + end.length));
    console.log(`  ↻ rewrote ${region.id} in ${region.file}`);
  } else {
    drift = true;
    console.error(`  ✗ ${region.file} (${region.id}) does not match a fresh measurement.`);
  }
}

if (drift) {
  console.error(
    '\n  A published byte figure is stale. This is the §4.5 defect, live:\n' +
      '  the bundle moved and the document did not.\n' +
      '  Fix:  node docs/3d/p1/build.mjs --write     (then commit the README diff)\n',
  );
  process.exit(1);
}

if (over) {
  console.error('  A layer is over budget. §6.4: a lane that overruns REPORTS IT AND STOPS.\n');
  process.exit(1);
}
