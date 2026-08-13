/**
 * W1 · bundle the L4 FLAT gate surface, and PUBLISH what it costs.
 *
 * WHY THIS GREW A README WRITER. The old version of this file measured the bundle and
 * printed it to stdout, and `docs/3d/w1/README.md` hand-typed the result: "L4 cost ~5 KB
 * — spine + L4 + this gate bundles to 13.7 KB total". By the 2026-08-13 audit
 * (`3D_VFX_FINAL_PLAN.md` §4.5) the real total was 17.9 KB, so the published total was
 * 4.2 KB out and the "~5 KB" derived from it no longer followed from anything.
 *
 * That row was then DELETED rather than refreshed, on the correct reasoning that typing a
 * fresh number would just repeat the defect on the next shader edit. Deleting it also
 * deleted the only statement of what L4 FLAT costs, which is the thing §6.3.3 asks every
 * lane to report. So the row is back, and it is GENERATED — same HTML-comment fence,
 * same --write mode and same fail-on-missing-fence as `docs/3d/p1/build.mjs`, so docs/3d
 * has one mechanism rather than two.
 *
 * TWO NUMBERS, NOT ONE, because "L4 cost" and "what this gate ships" are different
 * questions and conflating them is how ~5 KB came to sit next to 13.7 KB with no
 * relationship between them:
 *
 *   flat/bars.ts alone   what a surface importing only the bar layer pays. Measured
 *                        through its own synthetic entry, exactly as p1 measures a lane.
 *   the gate bundle      spine + bars + this harness, tree-shaken against what entry.ts
 *                        actually imports. Always the larger of the two, and it is NOT
 *                        the sum of any lanes — see p1/build.mjs's note on why.
 *
 * Usage:
 *   node docs/3d/w1/build.mjs           bundle, measure, and CHECK the published row
 *   node docs/3d/w1/build.mjs --write   bundle, measure, and REWRITE the published row
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const GL = resolve(ROOT, 'packages/gl/src');

/** Raw KB, one decimal — the perf budget measures raw, never gzip. */
const kb = (bytes) => bytes / 1024;
const k1 = (bytes) => kb(bytes).toFixed(1);

const die = (msg) => {
  console.error(`  ✗ ${msg}\n`);
  process.exit(1);
};

/* Copied from p1/build.mjs's COMMON so the two documents' figures are comparable. A
   number taken on different settings from the one it sits beside is not comparable. */
const COMMON = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  logLevel: 'silent',
  alias: { '@lcx/gl': resolve(GL, 'index.ts') },
};

/* ── the gate bundle, written for compare.html to load ────────────────────────────── */

const written = await build({
  ...COMMON,
  entryPoints: [resolve(HERE, 'entry.ts')],
  outfile: resolve(HERE, 'bundle.js'),
});
if (written.errors?.length) {
  for (const e of written.errors) console.error(e);
  process.exit(1);
}
const gateBytes = (
  await build({ ...COMMON, entryPoints: [resolve(HERE, 'entry.ts')], write: false })
).outputFiles[0].contents.byteLength;

/* ── the bar layer alone ──────────────────────────────────────────────────────────── */

/*
 * `flat/bars.ts` is where createBarBatch and the four shaders live (it is what
 * `@lcx/gl`'s barrel re-exports at index.ts:66). Measured through a synthetic
 * re-export entry rather than through the barrel: measuring the barrel would charge the
 * bar layer for every other layer in the package and report a number that says nothing
 * about L4 FLAT.
 */
const BARS = 'flat/bars.ts';
const tmp = mkdtempSync(join(tmpdir(), 'lcx-w1-measure-'));
const synthetic = join(tmp, 'bars-entry.ts');
writeFileSync(synthetic, `export * as bars from ${JSON.stringify(resolve(GL, BARS))};\n`);
const barsResult = await build({ ...COMMON, entryPoints: [synthetic], write: false });
if (barsResult.errors?.length) {
  for (const e of barsResult.errors) console.error(e);
  die(`could not bundle ${BARS} on its own — has the module moved?`);
}
const barsBytes = barsResult.outputFiles[0].contents.byteLength;
/* Anti-vacuity: an empty or near-empty bundle would publish "0.0 KB" and pass. The
   layer is four shaders and a batch builder; anything under 2 KB means the synthetic
   entry resolved to nothing. */
if (barsBytes < 2_048) {
  die(`${BARS} bundled to only ${barsBytes} B. That is not the bar layer; the entry did not resolve.`);
}
if (barsBytes > gateBytes) {
  die(
    `${BARS} alone (${barsBytes} B) measures MORE than the whole gate bundle (${gateBytes} B). ` +
      'One of the two measurements is not measuring what its label says.',
  );
}

console.log(`  ${BARS} alone                       ${k1(barsBytes)} KB  (${barsBytes} B)`);
console.log(`  W1 gate bundle (spine + bars + gate) ${k1(gateBytes)} KB  (${gateBytes} B)\n`);

/* ── the published row ────────────────────────────────────────────────────────────── */

/**
 * KB to one decimal, matching every other published figure in docs/3d, and for p1's
 * reason: the check must trip when a figure a READER can see would change, not on a
 * minifier wobble. Bytes are carried alongside so the two cannot be rounded into
 * agreeing.
 */
function renderCostRow() {
  return (
    `| L4 cost | \`${BARS}\` alone: **${k1(barsBytes)} KB** (${barsBytes} B). ` +
    `The whole gate — spine + bars + this harness, tree-shaken — is **${k1(gateBytes)} KB** ` +
    `(${gateBytes} B). Generated by \`node docs/3d/w1/build.mjs\`, which exits non-zero if ` +
    'this row and the bundler disagree |'
  );
}

const REGIONS = [{ file: resolve(HERE, 'README.md'), id: 'w1-bundle', render: renderCostRow }];

let drift = false;
for (const region of REGIONS) {
  const begin = `<!-- gl-budget:begin ${region.id} -->`;
  const end = `<!-- gl-budget:end ${region.id} -->`;
  const src = readFileSync(region.file, 'utf8');
  const from = src.indexOf(begin);
  const to = src.indexOf(end);
  /* A missing fence FAILS rather than skipping. A silent skip is how a rewrite drops the
     marker, leaves the hand-typed 13.7 KB behind, and still reports green. */
  if (from === -1 || to === -1 || to < from) {
    die(`${region.file}: no "${begin}" … "${end}" region. The published figure cannot be generated.`);
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
    '\n  The published W1 byte figure is stale — the bundle moved and the document did not.\n' +
      '  Fix:  node docs/3d/w1/build.mjs --write     (then commit the README diff)\n',
  );
  process.exit(1);
}
