/*
 * TYPE-CHECK EVERY 3-D HARNESS, DISCOVERED BY GLOB.
 *
 * `type-check:3d` pointed at `docs/3d/p1/tsconfig.json` alone, so six of the nine environments were
 * verified by NOTHING: esbuild bundles TypeScript by stripping types, it does not check them, and a green
 * `build.mjs` therefore says only that the file parses. Real errors were found in `packages/gl` by the
 * gate's `tsc` and would never have been found in a harness.
 *
 * GLOBBED, NOT LISTED. A hand-written list cannot fail on a member nobody thought of, which is exactly how
 * the previous single-entry script survived nine environments. Adding a directory with a tsconfig is
 * enough to have it checked; adding one WITHOUT a tsconfig is a hard failure below, because silently
 * skipping is what got us here.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs/3d');

const dirs = readdirSync(DOCS)
  .filter((d) => existsSync(join(DOCS, d, 'entry.ts')))
  .sort();

if (dirs.length === 0) {
  console.error('  REFUSED: no docs/3d/*/entry.ts found — this script would pass by checking nothing');
  process.exit(1);
}

const missing = dirs.filter((d) => !existsSync(join(DOCS, d, 'tsconfig.json')));
if (missing.length > 0) {
  console.error(`  REFUSED: ${missing.join(', ')} have an entry.ts and no tsconfig.json.`);
  console.error('  Skipping them silently is the failure this script exists to remove.');
  process.exit(1);
}

let failed = 0;
for (const d of dirs) {
  const r = spawnSync('npx', ['tsc', '-p', join(DOCS, d, 'tsconfig.json')], {
    cwd: ROOT, encoding: 'utf8',
  });
  /*
   * DID TSC ACTUALLY RUN? `r.status` AND `r.error` WERE NEVER READ, and that made this script capable of
   * reporting "12/12 harnesses clean" and exiting 0 with no compiler having run at all.
   *
   * The pass/fail decision below is "no output line mentions docs/3d/", so ANY failure that produces no
   * such line scored as clean: npx missing (spawnSync sets `error` and leaves stdout null), typescript not
   * installed (`npm ERR! could not determine executable to run` on stderr), tsc killed by the OOM killer.
   * Reproduced by putting a shim `npx` first on PATH that prints that npm error and exits 1: two fixture
   * harnesses with hard TS2322 errors came back ✓ ✓ and the script exited 0.
   *
   * That is the same failure mode as the single-entry glob this file replaced — a green result that
   * measured nothing — and the header above says silently skipping is what got us here.
   */
  if (r.error || r.status === null) {
    failed++;
    console.error(`  ✗ ${d}: tsc DID NOT RUN — ${r.error?.message ?? `killed by signal ${r.signal}`}`);
    continue;
  }
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const lines = out.split('\n').filter((l) => l.trim().length > 0);

  /*
   * ONLY ERRORS IN THE HARNESS FAIL THIS LANE, and the reason is a real flag mismatch rather than
   * convenience.
   *
   * A harness's tsconfig path-maps `@lcx/shared` and `@lcx/gl` to their SOURCE, so tsc re-checks those
   * packages under the harness's flags. `packages/gl` opts into `noUncheckedIndexedAccess`;
   * `packages/shared` does not. Checking shared's source under it produced six errors in
   * `packages/shared/src/alpha.ts` that are not the harness's fault and that shared never signed up for —
   * s6 was failing for someone else's settings.
   *
   * Each package is already type-checked by its OWN config in the same gate, immediately before this
   * script. So this lane owns `docs/3d/**` and reports the rest as a NOTE — visible, because a package
   * error surfacing here means the two configs disagree and that is worth knowing, but not fatal here,
   * because failing the wrong lane sends the next person to fix the wrong file.
   */
  const mine = lines.filter((l) => l.includes('docs/3d/'));
  const theirs = lines.filter((l) => /^(packages|apps)\/.*error TS/.test(l.trim()));

  /*
   * A NON-ZERO TSC THAT BLAMES NOBODY IS A BROKEN CONFIG, NOT A CLEAN HARNESS. `theirs` is the documented
   * non-fatal case — a harness's tsconfig re-checks packages/shared under stricter flags and reports errors
   * that lane owns. But an exit code with NO attributable line at all (no docs/3d/, no packages/, no apps/)
   * means tsc could not do the job: a missing file in `include`, an unreadable extends, a bad flag. Passing
   * that as ✓ is how "clean" stops meaning anything.
   */
  if (r.status !== 0 && mine.length === 0 && theirs.length === 0) {
    failed++;
    console.error(`  ✗ ${d}: tsc exited ${r.status} and blamed no file — the config, not the harness.`);
    for (const line of lines.slice(0, 14)) console.error(`      ${line.trim()}`);
    if (lines.length > 14) console.error(`      … ${lines.length - 14} more`);
  } else if (mine.length === 0) {
    console.log(`  ✓ ${d}${theirs.length > 0 ? `  (note: ${theirs.length} error lines in package sources under this config's flags — owned by their own type-check lane)` : ''}`);
  } else {
    failed++;
    console.error(`  ✗ ${d}`);
    // The compiler's own words, verbatim. A summarised count sends you back to re-run it by hand.
    for (const line of mine.slice(0, 14)) console.error(`      ${line.trim()}`);
    if (mine.length > 14) console.error(`      … ${mine.length - 14} more`);
  }
}
console.log(`  type-check:3d — ${dirs.length - failed}/${dirs.length} harnesses clean`);
process.exit(failed > 0 ? 1 : 0);
