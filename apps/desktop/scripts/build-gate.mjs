#!/usr/bin/env node
/**
 * THE GATE ON THE DESKTOP BUILD. There was none, and the desktop artefact is the one
 * nobody can reconstruct afterwards.
 *
 * ── WHAT THE COMMAND CHAIN ACTUALLY WAS ──────────────────────────────────────────────
 *
 *   npm run build -w @lcx/desktop           → tauri build            (package.json)
 *     └─ beforeBuildCommand                 → VITE_API_URL=… npm run build -w @lcx/web
 *     └─ cargo build --release
 *     └─ bundle: copy apps/web/dist → LCXOS.app, emit .dmg + .app.tar.gz + .sig
 *
 * `npm run build -w @lcx/web` is `vite build` and nothing else (apps/web/package.json).
 * So the desktop release path ran NO type-check, NO vitest, NO gl-budget, NO perf-budget
 * and no doctrine-lint — while the web deploy path runs all of them: `.github/workflows/
 * ci.yml:87` is `npm run ci-check`. A signed release could therefore be cut from a tree
 * that fails everything CI enforces, and `apps/web/dist` is gitignored (`.gitignore:2`),
 * so the bytes that shipped are in no commit and cannot be recovered from the tag. The
 * one channel whose artefact is unreconstructable was the one with no gate.
 *
 * ── WHY THIS COMPOSES ci-check RATHER THAN LISTING CHECKS ────────────────────────────
 *
 * `ci-check` is the script CI runs. A second list of checks here would drift from it, and
 * the drift would be invisible in the direction that matters: the desktop build passing a
 * gate that CI has since tightened. So this runs that one script, and if CI's definition
 * of "checked" changes, the desktop build inherits the change with no edit here.
 *
 * Its chain (root package.json:41), and the order is load-bearing:
 *   doctrine-lint → type-check → test → build (shared→gl→api→web) → gl-budget → perf-budget
 *
 * `perf-budget` reads `apps/web/dist/index.html` and `dist/assets`, so it can only run
 * AFTER `vite build`; `ci-check` already orders it that way. That is also why this
 * REPLACES `beforeBuildCommand` instead of running beside it: `ci-check` builds the very
 * bundle Tauri then copies, so there is exactly one web build per desktop build and the
 * budgets measured the bundle that shipped — not a second one built minutes earlier.
 *
 * ── WHY beforeBuildCommand AND NOT AN npm HOOK ──────────────────────────────────────
 *
 * A `prebuild` script in apps/desktop/package.json would be absent from exactly the
 * command that cuts releases: `npm run build:dmg` triggers `prebuild:dmg`, not
 * `prebuild`. `tauri build --help` (CLI 2.11.4, checked) has no flag that skips
 * `beforeBuildCommand`, and both `build` and `build:dmg` are `tauri build`, so putting it
 * here means it runs on every path that can produce a bundle. The one deliberate bypass
 * that remains is `tauri build -c <config>` merging a config that replaces this command —
 * named so it is a decision rather than a discovery.
 *
 * ── WHAT THIS DOES NOT COVER, STATED SO NOBODY OVERREADS IT ─────────────────────────
 *
 *  · e2e. CI runs Playwright as a SECOND job (`ci.yml:91-136`) and it is not in
 *    `ci-check`. It is not run here: it needs `npx playwright install chromium`, it binds
 *    port 5173 (which `tauri dev` also uses), and its committed baselines are
 *    `-chromium-darwin`, so a font-rendering difference would fail a release build for a
 *    pixel. A gate that fails for reasons unrelated to the change is a gate that gets
 *    bypassed. Run `npm run e2e -w @lcx/web` before a release; it is not owner-only.
 *  · `lint` and `audit-3d` are in the root `gate` script, not in `ci-check`, so the web
 *    deploy does not get them either. Parity with the deploy is the bar here.
 *  · Without `DATABASE_URL`, `apps/api/src/test/db.ts` SKIPS the API DB suites, so a
 *    local desktop build proves less of the API suite than CI's `gate` job does. That
 *    does not affect the bundle Tauri copies — no API code is in it — but "the desktop
 *    build ran CI's checks" would be an overstatement without this sentence.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────────
 *   npm run build-gate -w @lcx/desktop              run the gate (what tauri build does)
 *   npm run build-gate -w @lcx/desktop -- --explain print the chain, run nothing
 *
 * `--explain` is a diagnostic, not a bypass: it never runs from `beforeBuildCommand`, it
 * says GATE NOT RUN in as many words, and it still fails if the chain it prints is broken.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* Resolved from this file, not from cwd. Tauri's hook cwd is not documented and is not the
   same as npm's, and a gate that silently ran in the wrong directory would be worse than
   no gate — `npm run ci-check` from apps/desktop finds no such script and would fail with
   a message about a missing script rather than about a missing gate. */
const ROOT = resolve(HERE, '../../..');
const WEB_DIST = resolve(ROOT, 'apps/web/dist');

/* THE ORIGIN STAYS PINNED HERE, and it is not cosmetic. Vite gives `.env.local`
   precedence over `.env`, and `apps/web/.env.local` carried `VITE_API_URL=http://
   localhost:8791` — three signed releases shipped pointing at a port on the builder's
   machine, showing API DOWN on every other Mac (publish-release.mjs:139-163 carries the
   full account). A shell env var outranks any .env file, so it is set once, here, and
   inherited by the `vite build` that `ci-check` runs. Kept identical to
   PROD_API_ORIGIN in publish-release.mjs, which asserts the RESULT in the emitted JS —
   so if these two ever drift, the publisher refuses rather than shipping it. */
const PROD_API_ORIGIN = 'https://lcx-sales-api.onrender.com';
const GATE_SCRIPT = 'ci-check';

const EXPLAIN = process.argv.includes('--explain');

const die = (msg) => {
  console.error(`\n✗ desktop build gate: ${msg}\n`);
  process.exit(1);
};

/* THE GATE MUST NOT BE ABLE TO SILENTLY NOT-RUN. `npm run <missing>` does exit non-zero,
   so a renamed script already fails closed; this exists to fail closed with the right
   DIAGNOSIS, naming the release artefact at stake instead of a missing npm script. */
const rootPkgPath = join(ROOT, 'package.json');
if (!existsSync(rootPkgPath)) {
  die(`no package.json at ${rootPkgPath} — resolved the repo root wrongly, so nothing was checked`);
}
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
if (!rootPkg.scripts?.[GATE_SCRIPT]) {
  die(
    `the root package.json has no \`${GATE_SCRIPT}\` script, so the desktop build has no gate.\n`
    + `  This is the script .github/workflows/ci.yml runs. If it was renamed, point\n`
    + `  GATE_SCRIPT in ${HERE}/build-gate.mjs at the new name — do not delete the call.`,
  );
}

const chain = rootPkg.scripts[GATE_SCRIPT];
console.log('\n  ── desktop build gate ──────────────────────────────────────────────');
console.log(`  repo root      ${ROOT}`);
console.log(`  runs           npm run ${GATE_SCRIPT}   ← the same script .github/workflows/ci.yml:87 runs`);
console.log(`                 ${chain}`);
console.log(`  VITE_API_URL   ${PROD_API_ORIGIN}   ← outranks apps/web/.env.local`);
console.log(`  then tauri     copies apps/web/dist into LCXOS.app (frontendDist)`);
console.log('  ───────────────────────────────────────────────────────────────────\n');

if (EXPLAIN) {
  console.log('  --explain: GATE NOT RUN. The chain above is intact; nothing was checked.\n');
  process.exit(0);
}

/*
 * THE PARENT'S ENV IS PASSED THROUGH WHOLE, AND THAT WAS CHECKED RATHER THAN ASSUMED.
 *
 * This process is itself started by `npm run build-gate -w @lcx/desktop`, so the obvious
 * hazard is npm exporting the workspace selection — an inherited `npm_config_workspace=
 * @lcx/desktop` would make the inner `npm run ci-check` look for that script in
 * apps/desktop, not find it, and fail with "Missing script" while appearing to be a
 * pathing problem. Reproduced on a minimal workspace of the same shape (root with
 * `workspaces: ["apps/*"]`, invoked with `-w` from the package's own subdirectory) under
 * npm 10.9.8: `npm_config_workspace` and `npm_config_workspaces` are both UNDEFINED in the
 * script env, and the root script ran at the root. So no scrubbing is needed — and if a
 * future npm starts exporting it, the symptom is a loud missing-script failure, not a
 * skipped gate.
 */
const run = spawnSync('npm', ['run', GATE_SCRIPT], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: PROD_API_ORIGIN },
});

if (run.error) {
  die(`could not start npm (${run.error.code ?? run.error.message}) — nothing was checked`);
}
if (run.signal) {
  die(`\`npm run ${GATE_SCRIPT}\` was killed by ${run.signal}. A gate that did not finish has not passed.`);
}
if (run.status !== 0) {
  /* FAIL, NOT WARN. Exiting non-zero here aborts `tauri build` before `cargo build` and
     before the bundler, so no .app, no .dmg and no .sig exist to be published. */
  console.error(
    `\n✗ desktop build gate: \`npm run ${GATE_SCRIPT}\` exited ${run.status}.\n`
    + '  NOTHING WAS PACKAGED. This is the same check a web deploy has to pass, and the\n'
    + '  desktop bundle is the artefact that is in no commit — apps/web/dist is gitignored,\n'
    + '  so shipping an unchecked one leaves nothing to diff against later.\n',
  );
  process.exit(run.status);
}

/*
 * AND THE GATE MUST HAVE PRODUCED THE BUNDLE TAURI IS ABOUT TO COPY.
 *
 * `ci-check` passing is not the same claim as "apps/web/dist is current". The web build
 * sits inside the root `build` script, four scripts deep; if that composition ever stops
 * ending in `npm run build -w @lcx/web`, `ci-check` still goes green — `perf-budget`
 * would read a dist from an earlier build — and `tauri build` would then package that
 * stale directory under this version's number. That is the same failure shape as the
 * stale-.app case publish-release.mjs:112-133 already guards, one stage earlier.
 */
const indexHtml = join(WEB_DIST, 'index.html');
if (!existsSync(indexHtml)) {
  die(
    `${GATE_SCRIPT} passed but there is no ${indexHtml}.\n`
    + '  Tauri copies apps/web/dist into the bundle, so this build would package nothing or\n'
    + `  something stale. Check that the root \`build\` script still ends in \`npm run build -w @lcx/web\`.`,
  );
}

/* Printed so the build log itself records WHICH bundle was gated. Same fingerprint
   scripts/verify-live.mjs:98-99 reads off the deployed document, so the two are directly
   comparable — and the release record in publish-release.mjs reads it the same way. */
const entry = readFileSync(indexHtml, 'utf8').match(/<script[^>]+src="([^"]*index-[A-Za-z0-9_-]+\.js)"/)?.[1] ?? null;
console.log('\n  ✓ desktop build gate passed');
console.log(`  gated bundle   ${entry ?? 'index.html has no index-<hash>.js entry script'}`);
console.log('  tauri build continues: cargo build --release, then bundle\n');
