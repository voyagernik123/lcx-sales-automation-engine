#!/usr/bin/env node
/**
 * Cut a signed LCX TERMINAL release and publish it to the update channel.
 *
 * WHY THIS IS A SCRIPT AND NOT A SEQUENCE OF COMMANDS IN A COMMIT MESSAGE. This repo
 * already has the cautionary version: `apps/api/src/db/migrate.ts` was exported and
 * called by NOTHING for 46 migrations, which is why every production migration in this
 * project's history was pasted into a SQL editor by hand and why "is 0044 applied?" was
 * unanswerable without opening a browser. A release process that lives in someone's
 * shell history is the same defect with a worse failure mode: get one field of
 * `latest.json` wrong and every installed desk silently stops updating, which — by the
 * deliberate design of the launch check — shows the operator nothing at all.
 *
 * WHAT IT DOES
 *   1. Reads the version from `tauri.conf.json`. Single source of truth: the tag, the
 *      `latest.json` version and the app's own `CFBundleShortVersionString` all come
 *      from that one field, so they cannot disagree.
 *   2. Finds the updater artifacts `tauri build` produced (`.app.tar.gz` + `.sig`).
 *   3. Writes `latest.json` in the shape tauri-plugin-updater v2 expects.
 *   4. Publishes tag + assets to the RELEASES repo — a separate PUBLIC repo, not the
 *      code repo.
 *
 * WHY A SEPARATE PUBLIC REPO. The updater sends no credentials, and GitHub rejects
 * unauthenticated downloads of a private repo's release assets — so pointing the
 * endpoint at the private code repo produced an unavoidable 404 on every launch. Making
 * the code repo public to fix that would expose ~94k LOC to host two files. Verified
 * before choosing this: the shipped bundle contains no secrets, only `VITE_APP_TITLE`
 * and the API URL, and every surface behind it is gated on an @lcx.com email plus a
 * server-verified desk passcode.
 *
 * THE PRIVATE KEY IS NEVER READ BY THIS SCRIPT. Signing already happened during
 * `tauri build`, which takes `TAURI_SIGNING_PRIVATE_KEY` as a PATH. All this reads is
 * the `.sig` file, which is a signature and public by construction.
 *
 * USAGE
 *   npm run build:dmg -w @lcx/desktop          # signs, produces the artifacts
 *   node scripts/publish-release.mjs           # publishes them
 *   node scripts/publish-release.mjs --dry-run  # everything except the push
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');
const RELEASES_REPO = 'voyagernik123/lcx-terminal-releases';
const DRY = process.argv.includes('--dry-run');
const PROD_API_ORIGIN = 'https://lcx-sales-api.onrender.com';

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// ── 1 · version, from the one place that also stamps the app bundle ────────────────
const conf = JSON.parse(readFileSync(join(DESKTOP, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = conf.version;
if (!version) die('no `version` in tauri.conf.json');
const tag = `v${version}`;

// THE TWO VERSIONS MUST AGREE, and nothing else enforces it.
//
// `tauri.conf.json.version` is what the updater compares and what stamps
// `CFBundleShortVersionString`. The version the operator can actually SEE — on the
// sign-in screen and in the footer — is `__APP_VERSION__`, which `apps/web/vite.config.ts`
// defines from `apps/web/package.json`. Two independent fields, no link between them.
//
// Drift is silently awful in the direction that matters: bump only tauri.conf.json and the
// updater offers 0.1.1, the operator installs it, the app still renders v0.1.0, and they
// reasonably conclude the update failed. They would then either retry it or report a bug
// against a mechanism that worked perfectly. Bump only package.json and the reverse — the
// desk claims a version the channel has never heard of.
const webPkg = JSON.parse(readFileSync(resolve(DESKTOP, '../web/package.json'), 'utf8'));
if (webPkg.version !== version) {
  die(`version drift — the updater and the visible version disagree:\n    apps/desktop/src-tauri/tauri.conf.json  ${version}\n    apps/web/package.json                   ${webPkg.version}\n  The operator sees apps/web/package.json (via __APP_VERSION__ in vite.config.ts) and the\n  updater compares tauri.conf.json. Publishing this would ship an update that appears not\n  to have installed. Set both to the same value.`);
}

// The endpoint must point at the releases repo, or the artifacts land somewhere the app
// will never look. Checked rather than assumed, because the failure is invisible: the
// launch check swallows its error by design, so a desk pointed at the wrong channel looks
// exactly like a desk that is up to date.
const endpoint = conf.plugins?.updater?.endpoints?.[0] ?? '';
if (!endpoint.includes(RELEASES_REPO)) {
  die(`updater endpoint does not point at ${RELEASES_REPO}:\n    ${endpoint}\n  Publishing here would put artifacts where the app will never look for them.`);
}

// ── 2 · the artifacts `tauri build` signed ────────────────────────────────────────
const bundleDir = join(DESKTOP, 'src-tauri/target/release/bundle');
if (!existsSync(bundleDir)) die(`no bundle at ${bundleDir} — run \`npm run build:dmg\` first`);

const macosDir = join(bundleDir, 'macos');
const tarballs = existsSync(macosDir)
  ? readdirSync(macosDir).filter((f) => f.endsWith('.app.tar.gz'))
  : [];
if (tarballs.length !== 1) {
  die(`expected exactly 1 .app.tar.gz in ${macosDir}, found ${tarballs.length}: ${tarballs.join(', ') || '(none)'}\n  More than one means a stale artifact from an earlier version is still there — publishing the wrong one is silent.`);
}
const tarball = join(macosDir, tarballs[0]);
const sigPath = `${tarball}.sig`;
if (!existsSync(sigPath)) {
  die(`no signature at ${sigPath}.\n  \`bundle.createUpdaterArtifacts\` is true, so this means TAURI_SIGNING_PRIVATE_KEY was not set during the build. An UNSIGNED update is not merely unverified — the app will refuse it, so it would look like the updater is broken.`);
}
const signature = readFileSync(sigPath, 'utf8').trim();

// THE ARTIFACT MUST BE THE VERSION WE ARE PUBLISHING. This nearly shipped: `tauri build`
// emits `LCXOS.app.tar.gz` with no version in the filename, so bumping the config
// and NOT rebuilding leaves last version's binary sitting in the bundle directory, and
// everything downstream — the tag, the staged asset name, the URL, `latest.json` — is
// derived from the config and therefore all agrees with itself while pointing at the wrong
// bytes. The result is an update that downloads, verifies, installs, relaunches, and leaves
// the operator on the same version. That is indistinguishable from a broken updater, and
// it is the exact failure the "publishing the wrong one is silent" note above worried about
// without actually guarding.
//
// The app bundle's own Info.plist is the ground truth: `tauri build` stamps
// CFBundleShortVersionString from the same config field, so if it disagrees with the config
// NOW, the bundle is stale.
const appDirs = readdirSync(macosDir).filter((f) => f.endsWith('.app'));
if (appDirs.length !== 1) die(`expected exactly 1 .app in ${macosDir}, found ${appDirs.length}`);
const plist = join(macosDir, appDirs[0], 'Contents/Info.plist');
const builtVersion = execFileSync(
  'plutil', ['-extract', 'CFBundleShortVersionString', 'raw', plist], { encoding: 'utf8' },
).trim();
if (builtVersion !== version) {
  die(`STALE BUILD — the artifacts are not the version you are publishing:\n    tauri.conf.json says      ${version}\n    the built .app reports    ${builtVersion}\n  Publishing this would ship ${builtVersion}'s binary under a ${version} tag and a ${version}\n  latest.json. The update would download, verify, install, relaunch — and leave the operator\n  on ${builtVersion}, which looks exactly like a broken updater.\n  Run \`npm run build:dmg\` and try again.`);
}

const dmgDir = join(bundleDir, 'dmg');
const dmgs = existsSync(dmgDir) ? readdirSync(dmgDir).filter((f) => f.endsWith('.dmg')) : [];
const dmg = dmgs.length === 1 ? join(dmgDir, dmgs[0]) : null;

// ── 2b · THE API URL THE APP WILL ACTUALLY CALL ───────────────────────────────────
//
// THIS SHIPPED, and it wasted an hour of the tester's evening. `apps/web/.env.local` had
// `VITE_API_URL=http://localhost:8791` for local development. Vite gives `.env.local`
// precedence over `.env`, so three signed releases were built pointing at a port on the
// BUILDER's machine. On the tester's Mac that is nothing at all: the desk showed API DOWN
// forever, sign-in could never succeed, and production was healthy the entire time.
//
// It survived because every check was run from the wrong side — curl against the real URL
// from the machine that had the dev server, which passes while telling you nothing about
// what got compiled into the binary. `beforeBuildCommand` now pins the origin explicitly
// (a shell env var outranks any .env file), and this asserts the RESULT rather than
// trusting the input.
const distDir = resolve(DESKTOP, '../web/dist/assets');
if (!existsSync(distDir)) die(`no web build at ${distDir} — the desktop bundle would be stale`);
const js = readdirSync(distDir).filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(distDir, f), 'utf8')).join('\n');
const localhostHit = js.match(/localhost:\d+|127\.0\.0\.1:\d+/);
if (localhostHit) {
  die(`the built app points at ${localhostHit[0]} — it would show API DOWN on every machine but this one.\n  A developer .env.local almost certainly leaked into the release build.`);
}
if (!js.includes(PROD_API_ORIGIN)) {
  die(`the built app does not contain the production API origin (${PROD_API_ORIGIN}).\n  With no origin it calls same-origin paths, which in a Tauri webview is tauri://localhost — nothing.`);
}
console.log(`  api origin ${PROD_API_ORIGIN}  ← verified present in the built bundle`);

// ── 3 · latest.json, in the shape tauri-plugin-updater v2 reads ───────────────────
//
// STAGE THE ASSETS UNDER SPACE-FREE NAMES, and do not skip this as cosmetic.
//
// `tauri build` emits `LCXOS.app.tar.gz` — with a space, and with no version in
// it. GitHub NORMALISES spaces to dots in release asset names, so uploading that file
// produces an asset called `LCXOS.app.tar.gz`. A `latest.json` whose URL was built
// from the local filename therefore points at a path that does not exist, and the failure
// mode is the worst available one: the launch check swallows its error by design, so every
// desk would silently stop updating and look exactly like a desk that is current. Caught
// by reading the emitted filenames rather than by a failed update weeks later.
//
// Copying to an explicit name makes the URL deterministic instead of dependent on
// GitHub's normalisation rules, and §4 asserts the asset really exists at it afterwards.
// The version-less alias the public page links to. Keep in lockstep with
// LCXOS_DOWNLOAD_URL in apps/web/src/pages/Launch.tsx — `launch.test.tsx` asserts
// this exact filename appears at the end of that URL, so the two cannot drift.
const LATEST_DMG_NAME = 'LCXOS-macOS-arm64.dmg';

const stage = join(bundleDir, 'publish');
mkdirSync(stage, { recursive: true });
const tarballName = `LCXOS_${version}_aarch64.app.tar.gz`;
const stagedTarball = join(stage, tarballName);
const stagedSig = join(stage, `${tarballName}.sig`);
copyFileSync(tarball, stagedTarball);
copyFileSync(sigPath, stagedSig);
const stagedDmg = dmg ? join(stage, `LCXOS_${version}_aarch64.dmg`) : null;

// AND A SECOND COPY UNDER A VERSION-LESS NAME. This is what the public LCXOS page
// links to, via GitHub's `/releases/latest/download/<name>` redirect, so the page
// never has to be edited when a version ships. That redirect resolves by ASSET
// NAME, which means the name must be identical in every release — the moment it
// carries a version, the landing page's download button 404s for every build after
// the one it was written against. Both copies are uploaded: the versioned one so a
// specific build stays fetchable, the alias so "latest" has a stable target.
const stagedDmgLatest = dmg ? join(stage, LATEST_DMG_NAME) : null;
if (dmg && stagedDmgLatest) copyFileSync(dmg, stagedDmgLatest);
if (dmg && stagedDmg) copyFileSync(dmg, stagedDmg);

// THE PUBLIC PAGE'S CLAIMED DOWNLOAD SIZE MUST MATCH THE FILE BEING UPLOADED.
//
// It did not, once: the page said 6.4 MB — the size of the build this replaced — while
// the DMG was 3.8 MB. Nobody is harmed by a wrong file size, which is exactly why it
// would have sat there for months; and a page that is casually wrong about something
// checkable is not trusted about anything else. Rounded to one decimal, the same way
// the page prints it, so this compares what a reader sees rather than raw bytes.
if (dmg) {
  const launch = readFileSync(resolve(DESKTOP, '../web/src/pages/Launch.tsx'), 'utf8');
  const claimed = launch.match(/LCXOS_DMG_MB\s*=\s*([\d.]+)/)?.[1];
  const actual = (statSync(dmg).size / 1_000_000).toFixed(1);
  if (!claimed) {
    die('could not find LCXOS_DMG_MB in apps/web/src/pages/Launch.tsx — the size guard cannot run, and an unrunnable guard is worse than none.');
  }
  if (Number(claimed).toFixed(1) !== actual) {
    die(`the public page claims the download is ${claimed} MB; this DMG is ${actual} MB.\n  Update LCXOS_DMG_MB in apps/web/src/pages/Launch.tsx (and its test) before publishing.`);
  }
  console.log(`  page claims ${claimed} MB  ← matches the DMG (${actual} MB)`);
}

const assetUrl = `https://github.com/${RELEASES_REPO}/releases/download/${tag}/${tarballName}`;
// `darwin-aarch64` only, deliberately and stated rather than left as an accident: the
// only installed target is Apple Silicon. An Intel Mac would find no matching platform
// key and report "no update available" — which is the correct, quiet answer for a
// machine we have never built for, rather than offering it an arm64 binary that cannot
// run. Add `darwin-x86_64` here the day there is a build for it.
const latest = {
  version,
  notes: `LCXOS ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { signature, url: assetUrl },
  },
};
const latestPath = join(bundleDir, 'latest.json');
writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`);

console.log(`\n  version    ${version}  (tag ${tag})`);
console.log(`  channel    ${RELEASES_REPO}`);
console.log(`  built as   ${tarballs[0]}`);
console.log(`  publish as ${tarballName}   ← the name the URL depends on`);
console.log(`  signature  ${signature.length} chars`);
console.log(`  dmg        ${dmg ? dmgs[0] : '(none — updater-only release)'}`);
console.log(`  asset url  ${assetUrl}`);
console.log(`  latest.json → ${latestPath}`);

if (DRY) {
  console.log('\n  --dry-run: nothing published.\n');
  process.exit(0);
}

// ── 4 · publish ───────────────────────────────────────────────────────────────────
const gh = (args) => execFileSync('gh', args, { stdio: 'inherit' });

// `gh release create` fails on an existing tag rather than overwriting, which is the
// behaviour we want: silently replacing a release that desks may already have downloaded
// would mean two different binaries shipped under one version number.
let exists = false;
try {
  execFileSync('gh', ['release', 'view', tag, '--repo', RELEASES_REPO], { stdio: 'ignore' });
  exists = true;
} catch {
  /* not found — the normal path */
}
if (exists) {
  die(`${tag} already exists in ${RELEASES_REPO}.\n  Bump \`version\` in tauri.conf.json and rebuild. Overwriting a published version would ship two different binaries under one version number.`);
}

const assets = [latestPath, stagedTarball, stagedSig, ...(stagedDmg ? [stagedDmg] : []), ...(stagedDmgLatest ? [stagedDmgLatest] : [])];
gh([
  'release', 'create', tag,
  '--repo', RELEASES_REPO,
  '--title', `LCXOS ${version}`,
  '--notes', `Ad-hoc signed, Apple Silicon. Updater artifacts signed with minisign key 21F2F8695FBD5658.`,
  ...assets,
]);

// VERIFY, rather than trust, that the asset exists at the exact name latest.json claims.
// This is the one assertion that would have caught the space-normalisation bug at publish
// time instead of at update time, and it costs one API call.
const published = JSON.parse(
  execFileSync('gh', ['api', `repos/${RELEASES_REPO}/releases/tags/${tag}`], { encoding: 'utf8' }),
);
const names = (published.assets ?? []).map((a) => a.name);
if (!names.includes(tarballName)) {
  die(`published, but latest.json points at an asset that does not exist.\n  expected: ${tarballName}\n  actual  : ${names.join(', ')}\n  Every desk would silently stop updating. Fix the name and re-cut the release.`);
}
if (!names.includes('latest.json')) {
  die(`published, but there is no latest.json asset — the endpoint would 404.\n  actual: ${names.join(', ')}`);
}

if (dmg && !names.includes(LATEST_DMG_NAME)) {
  die(`published, but the version-less DMG alias is missing.\n  expected: ${LATEST_DMG_NAME}\n  actual  : ${names.join(', ')}\n  The Download button on the public LCXOS page resolves by this name and would 404.`);
}

// AND THAT THE PAGE'S OWN BUTTON WORKS. Not the same check as the one above: that
// asserts the asset exists under this tag, this asserts GitHub's `latest` redirect
// actually lands on it — which is what a colleague's browser will follow, and which
// silently breaks if a later release is ever marked pre-release or as a draft.
if (dmg) {
  const dl = `https://github.com/${RELEASES_REPO}/releases/latest/download/${LATEST_DMG_NAME}`;
  const code = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', dl], { encoding: 'utf8' }).trim();
  console.log(`  anonymous GET ${dl} → HTTP ${code}`);
  if (code !== '200') {
    die(`the public page's Download button returned HTTP ${code} anonymously. That is exactly what Sam and Monty would get.`);
  }
}

// And that the endpoint the SHIPPED APP asks for is really reachable with no credentials,
// which is the entire reason this repo is separate and public.
const probe = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', endpoint], { encoding: 'utf8' }).trim();
console.log(`  unauthenticated GET ${endpoint} → HTTP ${probe}`);
if (probe !== '200') {
  die(`the updater endpoint returned HTTP ${probe} to an anonymous request. The app sends no credentials, so this is what it will get.`);
}

//
// HTTP 200 IS NOT THE SAME AS "SERVING WHAT I JUST PUBLISHED", AND THAT GAP PRODUCED BOTH
// A FALSE PASS AND A FALSE FAILURE IN ONE RUN.
//
// `/releases/latest/download/<name>` is a redirect resolved through a CDN. For a release that
// is seconds old it still hands out the PREVIOUS version's asset. So on 0.2.6 this check saw
// 200 and declared success while the endpoint was serving 0.2.4 — and the caller's own check,
// running moments later, correctly read 0.2.4 and reported "the publish did not take" about a
// publish that had worked perfectly. Two opposite wrong answers, one cause: asking whether the
// endpoint RESPONDS instead of whether it serves THIS VERSION.
//
// So ask the question that matters, and give the CDN time to answer it. Retrying is not
// papering over a flake: propagation delay is the documented behaviour of the thing being
// checked, and a verification that cannot tolerate it is not a verification.
//
const PROPAGATE_MS = 120_000;
const startedAt = Date.now();
let served = null;
let attempt = 0;
while (Date.now() - startedAt < PROPAGATE_MS) {
  attempt += 1;
  try {
    served = JSON.parse(execFileSync('curl', ['-sS', '-L', endpoint], { encoding: 'utf8' })).version;
  } catch {
    served = null;
  }
  if (served === version) break;
  console.log(`  attempt ${attempt}: endpoint serves ${served ?? 'unparseable'}, waiting for it to repoint to ${version}`);
  try { execFileSync('sleep', ['5']); } catch { /* interrupted — the deadline still bounds us */ }
}
if (served !== version) {
  die(`the updater endpoint still serves ${served ?? 'nothing parseable'} after ${Math.round((Date.now() - startedAt) / 1000)}s.\n  The release exists, so this is propagation or a release that is not marked latest.\n  Check: gh release view ${tag} --repo ${RELEASES_REPO}`);
}
console.log(`  endpoint serves ${served}  ← the version just published, confirmed after ${attempt} attempt(s)`);

console.log(`\n  ✓ published ${tag} → https://github.com/${RELEASES_REPO}/releases/tag/${tag}`);
console.log(`  ✓ asset + latest.json verified present, endpoint reachable anonymously\n`);
