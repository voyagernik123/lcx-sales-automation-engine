/**
 * P0 · MEASURE — generate the two byte figures in the verdict table.
 *
 * WHY THIS FILE EXISTS. `docs/3d/p0/README.md` published its verdict row as
 * hand-typed prose: "513 KB raw (525,595 B)" for three.js and "12.8 KB … (18.4 KB
 * with them)" for the prototype. Nothing measured either one, and the first of them
 * had become LOAD-BEARING: `docs/3d/p1/build.mjs:143` carries the same 525,595 as a
 * hardcoded constant, and derives the published "× the spine" ratio from it. A figure
 * that a second generator depends on is the worst one to leave typed, because the two
 * copies can now disagree with nothing checking. This script makes the README's row a
 * function of a measurement (the prototype) or of the single constant (three.js).
 *
 * WHAT THIS FOUND ON THE FIRST RUN, which is the reason it is not just a transcription.
 * The published prototype figure was measured with a WEAKER MINIFIER than the library it
 * was being compared against, and so understated our own result:
 *
 *   published   generated   what the difference is
 *   12.8 KB     11.1 KB     12.8 is 13,067 B — esbuild with whitespace and comments
 *                           stripped but identifiers KEPT. three.js's 525,595 B was taken
 *                           "esbuild, minified" as a bundle, where module-scope
 *                           identifiers are renamed. Renaming them here gives 11,410 B.
 *                           (`esbuild.transform` cannot rename module-scope names at all
 *                           — it yields 12,619 B — so 12.8 was not even that figure.)
 *                           A comparison whose two sides use different recipes is not a
 *                           comparison, so this uses p1/build.mjs's exact option set.
 *   18.4 KB     18.7 KB     raw script bytes are 19,115 B. 18.4 was never reachable from
 *                           this file; nothing recorded how it was taken.
 *   40×         46.1×       follows from the 12.8, and moves with the recipe fix.
 *
 * Nothing was dropped by dead-code elimination, which was the obvious suspect for a
 * 1.7 KB fall: all 65 top-level declarations survive into the un-minified bundle. The
 * whole difference is identifier renaming.
 *
 * Usage:
 *   node docs/3d/p0/measure.mjs           measure and CHECK the published table
 *   node docs/3d/p0/measure.mjs --write   measure and REWRITE the published table
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const require = createRequire(import.meta.url);

const kb = (bytes) => bytes / 1024;
const k1 = (bytes) => kb(bytes).toFixed(1);

const die = (msg) => {
  console.error(`  ✗ ${msg}\n`);
  process.exit(1);
};

/* ── 1 · THE PROTOTYPE, measured for real, on the three.js recipe ──────────────────── */

/*
 * The prototype IS the inline module in risk-cloud.html — there is no separate source
 * file, which is why nothing was measuring it. Extracted rather than approximated: the
 * surrounding HTML, the CSS and the DOM plate are not JS and charging them to a JS
 * byte count would flatter three.js, not us.
 */
const PROTOTYPE_HTML = resolve(HERE, 'risk-cloud.html');
const html = readFileSync(PROTOTYPE_HTML, 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  die(
    `${PROTOTYPE_HTML} has no <script type="module"> … </script>. The prototype byte ` +
      'count is measured from that block; finding nothing would silently publish 0 B.',
  );
}
const prototypeSource = scriptMatch[1];
const prototypeRawBytes = Buffer.byteLength(prototypeSource);
if (prototypeRawBytes < 5_000) {
  die(`extracted only ${prototypeRawBytes} B of prototype JS — the extraction regex has drifted.`);
}

/*
 * OPTIONS COPIED FROM `docs/3d/p1/build.mjs`'s COMMON, not chosen here — bundle, esm,
 * es2022, minify, no gzip. That is the recipe the 525,595 B figure was taken on, and
 * `bundle: true` is what lets esbuild rename module-scope identifiers. Dropping it costs
 * 96 B (the prototype imports nothing) but loses the like-for-like claim, and using
 * `esbuild.transform` instead loses 1.2 KB of renaming — which is how 12.8 happened.
 *
 * `loader: 'ts'` only so the dialect matches p1's; the source is plain JS.
 *
 * NOTE ON WHAT A MINIFIER CANNOT DO HERE, because it is the reason this number is
 * higher than it looks like it should be: the shaders are template literals, and GLSL
 * comments inside a template literal are string CONTENT. esbuild cannot see into a
 * string, so every one of them is shipped bytes. Same defect L3.5 paid 2.4 KB for
 * (`docs/3d/p1/build.mjs`, the L3.5 lane note).
 */
const minified = await build({
  stdin: { contents: prototypeSource, loader: 'ts', sourcefile: 'risk-cloud.html' },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'silent',
});
if (minified.errors?.length) {
  for (const e of minified.errors) console.error(e);
  die('the prototype script did not compile.');
}
const prototypeMinBytes = minified.outputFiles[0].contents.byteLength;

/* ── 2 · THREE.JS — one source of truth, and it is pinned, and that is said out loud ── */

/*
 * three.js is NOT a dependency of this repo, so its 525,595 B cannot be re-measured
 * here. It is an archival measurement from the P0 gate (2026-08-08) and it lives in
 * exactly one place — `docs/3d/p1/build.mjs`'s THREEJS_BYTES — which is now PARSED
 * rather than re-typed. p1/build.mjs is not this track's file to edit, so the
 * dependency direction is p0-README ← p1-constant, not the reverse the comment in
 * p1/build.mjs describes ("The byte count is the one in docs/3d/p0/README.md:22").
 * That comment is now wrong in direction, and correcting it needs p1/build.mjs.
 */
const P1_BUILD = resolve(ROOT, 'docs/3d/p1/build.mjs');
const p1Source = readFileSync(P1_BUILD, 'utf8');
const pin = p1Source.match(/^const THREEJS_BYTES = ([\d_]+);/m);
if (!pin) {
  die(
    `could not parse \`const THREEJS_BYTES = …\` out of ${P1_BUILD}. That constant is the ` +
      'only record of the three.js measurement; without it this script would publish a ' +
      'number it did not get from anywhere.',
  );
}
const THREEJS_BYTES = Number(pin[1].replace(/_/g, ''));
if (!Number.isFinite(THREEJS_BYTES) || THREEJS_BYTES < 100_000) {
  die(`parsed an implausible THREEJS_BYTES (${pin[1]}) from ${P1_BUILD}.`);
}

/*
 * THE PIN'S ONE PRECONDITION, ASSERTED. A pinned figure is only honest while it cannot
 * be measured. The moment `three` resolves, this script must stop publishing an
 * archival number as if measurement were impossible — so it fails here rather than
 * quietly continuing.
 *
 * It does NOT measure three.js in that case, deliberately. "Tree-shaken to what S1
 * actually needs" is a judgement about which of three's entry points the spike would
 * import, and the P0 gate embedded that judgement without recording it. Guessing the
 * entry set would produce a confident wrong number — the exact failure mode this file
 * was written to remove. Whoever installs `three` has to state the entry set and
 * re-pin, and that is a smaller job than un-picking a plausible fabrication.
 */
let threeResolved = null;
try {
  threeResolved = require.resolve('three');
} catch {
  /* expected: three.js is not and should not be a dependency here. */
}
if (threeResolved) {
  die(
    `\`three\` now resolves (${threeResolved}), so the ${THREEJS_BYTES} B in ${P1_BUILD} is no ` +
      'longer an unmeasurable archival pin. Re-measure it: state the exact entry set S1 needs ' +
      '(the P0 gate never recorded it), bundle it on the same esbuild settings, and update ' +
      'THREEJS_BYTES. This script will not guess the entry set for you.',
  );
}

/* ── 3 · THE BUDGET CEILINGS, parsed from the guard that enforces them ─────────────── */

/*
 * 440 / 850 / 1024 were typed into this README as well. They are constants in
 * apps/web/scripts/check-bundle.mjs, which is a sibling track's file — read, never
 * written. Parsing them means a budget raise cannot leave this verdict quoting the old
 * ceiling, which is precisely what happened to MAX_CHUNK_KB when it moved 400 → 440.
 */
const CHECK_BUNDLE = resolve(ROOT, 'apps/web/scripts/check-bundle.mjs');
const guardSource = readFileSync(CHECK_BUNDLE, 'utf8');
const ceiling = (name) => {
  const m = guardSource.match(new RegExp(`^const ${name} = (\\d+);`, 'm'));
  if (!m) die(`could not parse \`const ${name}\` out of ${CHECK_BUNDLE}.`);
  return Number(m[1]);
};
const MAX_CHUNK_KB = ceiling('MAX_CHUNK_KB');
const MAX_INITIAL_KB = ceiling('MAX_INITIAL_KB');
const MAX_PASSTHROUGH_KB = ceiling('MAX_PASSTHROUGH_KB');

/* ── 4 · THE PUBLISHED ROWS ────────────────────────────────────────────────────────── */

console.log(
  `\n  prototype JS   raw ${k1(prototypeRawBytes)} KB (${prototypeRawBytes} B)` +
    `   minified ${k1(prototypeMinBytes)} KB (${prototypeMinBytes} B)`,
);
console.log(
  `  three.js       ${k1(THREEJS_BYTES)} KB (${THREEJS_BYTES} B)  — PINNED, from ${
    'docs/3d/p1/build.mjs'
  }`,
);
console.log(
  `  ratio          ${(THREEJS_BYTES / prototypeMinBytes).toFixed(1)}× the prototype\n`,
);

/**
 * KB to one decimal, exactly as p1/build.mjs publishes, and for the same reason: the
 * check must trip when a PUBLISHED figure would change, not when any byte moves. A
 * check that reddens CI on a minifier wobble gets deleted, and a deleted check is how
 * "12.8 KB" outlived the recipe it was taken on.
 */
function renderVerdictRows() {
  const ratio = (THREEJS_BYTES / prototypeMinBytes).toFixed(1);
  return [
    `| three.js, tree-shaken to what S1 actually needs | **${k1(THREEJS_BYTES)} KB raw** ` +
      `(${THREEJS_BYTES.toLocaleString('en-US')} B, esbuild, minified, no gzip) — a **pinned** ` +
      'measurement from the P0 gate, held in `docs/3d/p1/build.mjs` and read from there; ' +
      '`three` is not a dependency, so it cannot be re-measured here ' +
      `| **Breaches two budgets at once.** \`MAX_CHUNK_KB\` is ${MAX_CHUNK_KB}; it is ` +
      `${k1(THREEJS_BYTES)} KB against an initial-JS ceiling of ${MAX_INITIAL_KB}; passthrough ` +
      `allows ${MAX_PASSTHROUGH_KB}. There is no configuration of the budget that admits it. |`,
    `| The hand-written renderer that produced the PNG | **${k1(prototypeMinBytes)} KB** minified ` +
      `(${prototypeMinBytes} B; ${k1(prototypeRawBytes)} KB / ${prototypeRawBytes} B of source, ` +
      'comments and all) | **' +
      `${ratio}× smaller** than the library it replaces, on the same esbuild settings, and it fits ` +
      'inside the existing headroom without touching the budget. |',
  ].join('\n');
}

/*
 * Same fence shape as p1/build.mjs so docs/3d has ONE mechanism, not two: an
 * HTML-comment region, a --write mode, and a default check that exits non-zero on drift
 * AND on a MISSING fence. The missing-fence failure is the important half — a rewrite
 * that drops the marker would otherwise leave hand-typed numbers behind and report green.
 */
const REGIONS = [
  { file: resolve(HERE, 'README.md'), id: 'p0-verdict', render: renderVerdictRows },
];

let drift = false;
for (const region of REGIONS) {
  const begin = `<!-- gl-budget:begin ${region.id} -->`;
  const end = `<!-- gl-budget:end ${region.id} -->`;
  const src = readFileSync(region.file, 'utf8');
  const from = src.indexOf(begin);
  const to = src.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    die(`${region.file}: no "${begin}" … "${end}" region. The published figures cannot be generated.`);
  }
  const fresh = `${begin}\n${region.render()}\n${end}`;
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
    '\n  A published byte figure is stale.\n' +
      '  Fix:  node docs/3d/p0/measure.mjs --write     (then commit the README diff)\n',
  );
  process.exit(1);
}
