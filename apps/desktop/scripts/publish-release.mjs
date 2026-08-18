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
 *   4. Writes a BUILD RECORD of the web bundle it is about to publish — commit, dirty
 *      flag, entry fingerprint, a sha256 per emitted file, and the count of chunks
 *      carrying shader source — and publishes it as an asset. `apps/web/dist` is
 *      gitignored, so without this the tag says nothing about the bytes on the desk.
 *   5. Publishes tag + assets to the RELEASES repo — a separate PUBLIC repo, not the
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
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { resolve, dirname, join, relative } from 'node:path';
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

/*
 * ── DOES THE SIGNATURE ACTUALLY SIGN THESE BYTES? ────────────────────────────────────
 *
 * Everything above this point checks that a signature EXISTS and that the .app reports the right
 * version. Neither says the signature belongs to the tarball, and the difference is not academic:
 * `tauri build` WITHOUT `TAURI_SIGNING_PRIVATE_KEY` still writes a fresh `LCXOS.app.tar.gz` and
 * simply does not replace the `.sig` beside it. Found exactly that way on 2026-08-18 — a 0.2.8
 * tarball built at 16:35 sitting next to a signature from the 11th, whose own trusted comment read
 * `timestamp:1786438564`. Every guard above passed: one tarball, a signature present, 404
 * characters, Info.plist agreeing with the config.
 *
 * What would have shipped: the updater downloads the asset, verifies it against the public key,
 * FAILS, and refuses to install. Indistinguishable from a broken updater — which is precisely the
 * outcome the long comment above works to prevent for the VERSION case, while leaving the
 * SIGNATURE case on "the file is there and it is 404 characters long".
 *
 * So verify it properly. minisign `ED` is Ed25519 over a BLAKE2b-512 prehash; `Ed` is Ed25519 over
 * the raw bytes. Both are handled rather than assumed, because which one appears is the signing
 * tool's choice and not ours. The public key is the one already committed in tauri.conf.json — the
 * same value the shipped app checks against, so this asks the question the operator's machine will
 * ask, with the same key, before anything is published.
 */
{
  const pubField = (conf.plugins?.updater?.pubkey ?? '').trim();
  if (!pubField) die('tauri.conf.json has no plugins.updater.pubkey — nothing to verify the signature against.');

  /* Both fields are base64 of a whole minisign FILE: a comment line, then the base64 payload. */
  const payloadLine = (b64) => {
    const text = Buffer.from(b64, 'base64').toString('utf8');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const body = lines.find((l) => !l.startsWith('untrusted comment:') && !l.startsWith('trusted comment:'));
    if (!body) die('could not find the base64 payload inside a minisign file');
    return Buffer.from(body, 'base64');
  };

  const pub = payloadLine(pubField);           // 2 alg + 8 key id + 32 key
  const sig = payloadLine(signature);          // 2 alg + 8 key id + 64 signature
  if (pub.length !== 42) die(`the updater public key decoded to ${pub.length} bytes, expected 42`);
  if (sig.length !== 74) die(`the signature decoded to ${sig.length} bytes, expected 74`);

  /* A signature made with a DIFFERENT key fails verification anyway, but it fails with a message
     about mathematics. The key id says plainly that the wrong key was used, which is a different
     mistake with a different fix. */
  if (!pub.subarray(2, 10).equals(sig.subarray(2, 10))) {
    die('THE SIGNATURE WAS MADE WITH A DIFFERENT KEY than the one committed in tauri.conf.json.\n'
      + `    public key id  ${pub.subarray(2, 10).toString('hex')}\n`
      + `    signature id   ${sig.subarray(2, 10).toString('hex')}\n`
      + '  The app verifies against the committed key, so it would refuse this update.');
  }

  const alg = sig.subarray(0, 2).toString('latin1');
  const bytes = readFileSync(tarball);
  const signed = alg === 'ED' ? createHash('blake2b512').update(bytes).digest()
    : alg === 'Ed' ? bytes
      : die(`unknown minisign algorithm ${JSON.stringify(alg)} — refusing to guess`);

  /* Raw Ed25519 key -> SPKI, the only form node's verifier accepts. The prefix is the fixed
     AlgorithmIdentifier for id-Ed25519; there is nothing variable in it. */
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]);
  const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });

  if (!cryptoVerify(null, signed, key, sig.subarray(10))) {
    die('THE SIGNATURE DOES NOT MATCH THE TARBALL.\n'
      + `    tarball    ${tarball}\n`
      + `               ${bytes.length} bytes, modified ${statSync(tarball).mtime.toISOString()}\n`
      + `    signature  modified ${statSync(sigPath).mtime.toISOString()}\n`
      + '  Almost always this means the last `tauri build` ran WITHOUT TAURI_SIGNING_PRIVATE_KEY:\n'
      + '  it rewrote the tarball and left the previous signature in place. Publishing it would ship\n'
      + '  an update the app downloads, fails to verify, and refuses to install — which looks exactly\n'
      + '  like a broken updater.\n'
      + '  Rebuild with the key set:\n'
      + '    TAURI_SIGNING_PRIVATE_KEY=~/.lcx-terminal/updater.key npm run build:dmg -w @lcx/desktop');
  }
  console.log(`  signature  verified against the committed public key (${alg === 'ED' ? 'blake2b512 prehash' : 'raw'})`);
}

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

// ── 2c · THE RECORD OF WHAT SHIPPED, BECAUSE THE TAG CANNOT ANSWER IT ─────────────
//
// `apps/web/dist` is gitignored (`.gitignore:2`). The bundle inside a published .app is
// therefore in NO commit, and the tag identifies the Rust shell and nothing about the web
// bytes it carries. That gap is not hypothetical — it is why "does the installed 0.2.6
// contain the eight relief views?" had to be answered by comparing commit timestamps
// against the channel's `pub_date` instead of by looking, and why the only byte-level
// answer available afterwards was `strings` on the installed binary's embedded asset keys.
//
// So a release now writes down what it packaged, and publishes it beside the artefact:
//   · the source commit AND whether the tree was dirty when the bundle was built,
//   · the entry fingerprint — read exactly the way scripts/verify-live.mjs:98-99 reads it
//     off a DEPLOYED document, so a desk build and a deploy are directly comparable,
//   · a sha256 per emitted file, which identifies the bundle even when the commit cannot,
//   · the count of chunks carrying shader source, which is the "did this release actually
//     carry the 3-D layer?" question, and
//   · sha256 of the artefacts that leave this machine.
//
// WHY A DIRTY TREE IS RECORDED AND NOT REFUSED. A commit SHA taken from a dirty tree is a
// lie of precision, so it is labelled. Refusing to publish would have blocked 0.2.6, which
// was a correct release; and it is not needed, because the per-file hashes identify the
// bundle regardless of git state. What must not happen is a release that says nothing.
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: DESKTOP, encoding: 'utf8' }).trim();
  } catch {
    return null; /* a release cut from an export, not a checkout — recorded as null, not as a guess */
  }
};

const distRoot = resolve(DESKTOP, '../web/dist');
/* Recursive, not `dist/assets` only. `public/` is copied to the dist ROOT, which is exactly
   where apps/web/scripts/check-bundle.mjs records a 40 MB payload being able to hide — a
   record that read only `assets/` would omit every font and every image that shipped. */
const walkDist = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkDist(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
};
const distFiles = walkDist(distRoot).sort();

const distIndex = join(distRoot, 'index.html');
if (!existsSync(distIndex)) die(`no ${distIndex} — there is no bundle to record, and Tauri packaged whatever was there`);
const indexHtmlSrc = readFileSync(distIndex, 'utf8');
/* WHAT THE DOCUMENT PULLS IN BEFORE PAINT: the entry <script>, every modulepreload, every
   stylesheet and every preloaded font — the same four things verify-live.mjs reads off a
   DEPLOYED document, so the record's `eager` list can be diffed against a live check's
   without translation.
   ATTRIBUTES ARE MATCHED ORDER-INDEPENDENTLY, and the first version of this was not:
   `rel="preload"[^>]+as="font"[^>]+href=` requires that attribute order, and Vite emits
   `rel="preload" href="…" as="font"`. Measured on the real dist/index.html — it found the
   entry, two modulepreloads and two stylesheets, and MISSED both font preloads. That is
   434 KB, the single largest item in first load per apps/web/scripts/check-bundle.mjs,
   absent from a record whose whole purpose is to say what shipped. */
const tagAttrs = (tag) => {
  const at = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) at[m[1].toLowerCase()] = m[2];
  return at;
};
const eagerHrefs = [];
for (const m of indexHtmlSrc.matchAll(/<script\b[^>]*>/g)) {
  const at = tagAttrs(m[0]);
  if (at.src) eagerHrefs.push(at.src);
}
for (const m of indexHtmlSrc.matchAll(/<link\b[^>]*>/g)) {
  const at = tagAttrs(m[0]);
  const rel = (at.rel ?? '').toLowerCase();
  if (!at.href) continue;
  if (rel === 'modulepreload' || rel === 'stylesheet') eagerHrefs.push(at.href);
  else if (rel === 'preload' && (at.as ?? '').toLowerCase() === 'font') eagerHrefs.push(at.href);
}
const eager = [...new Set(eagerHrefs)].filter((s) => !/^https?:/i.test(s));
const entryHref = eager.find((s) => /index-[A-Za-z0-9_-]+\.js$/.test(s)) ?? null;
if (!entryHref) {
  // An index.html with no `index-<hash>.js` is not a bundle this app can boot, and it is
  // also unrecordable — there would be no fingerprint to compare against a later release.
  die(`no index-<hash>.js entry script in ${distIndex}.\n  The bundle is malformed, and there is no fingerprint to record.`);
}
const fingerprint = entryHref.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? entryHref;

/* THE SAME MARKER verify-live.mjs:122 USES, and for the same reason: a chunk carrying GLSL
   is a GL chunk, which is a fact about the bytes. Name matching missed E8 (it ships as
   `ForgeBackdrop`) and all seven shared chunks. Deliberately NOT a floor here — 0.2.6
   legitimately carried no relief surfaces, so a "must be > 0" guard would have refused a
   correct release. It is recorded and printed so the answer exists at all. */
const SHADER_MARKER = /precision\s+(?:highp|mediump|lowp)|createStage/;
const files = {};
let glChunks = [];
let totalBytes = 0;
for (const p of distFiles) {
  const buf = readFileSync(p);
  const rel = relative(distRoot, p);
  files[rel] = { bytes: buf.length, sha256: sha256(buf) };
  totalBytes += buf.length;
  if (rel.endsWith('.js') && SHADER_MARKER.test(buf.toString('utf8'))) glChunks.push(rel);
}
glChunks = glChunks.sort();
const glSurfaces = glChunks.filter((n) => /Relief|Orrery|Forge/i.test(n));

const artefactHash = (p) => (p ? { name: p.split('/').pop(), bytes: statSync(p).size, sha256: sha256(readFileSync(p)) } : null);

const record = {
  record_version: 1,
  version,
  tag,
  recorded_at: new Date().toISOString(),
  source: {
    commit: git(['rev-parse', 'HEAD']),
    committed_at: git(['log', '-1', '--format=%cI']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    /* The whole point of the label. `--porcelain` covers tracked modifications AND
       untracked files, both of which change what vite emits. */
    dirty: (git(['status', '--porcelain']) ?? '') !== '',
    dirty_paths: (git(['status', '--porcelain']) ?? '').split('\n').filter(Boolean).slice(0, 200),
  },
  toolchain: {
    node: process.version,
    tauri_cli: (() => {
      try {
        return JSON.parse(readFileSync(resolve(DESKTOP, '../../node_modules/@tauri-apps/cli/package.json'), 'utf8')).version;
      } catch { return null; }
    })(),
  },
  bundle: {
    api_origin: PROD_API_ORIGIN,
    entry: entryHref,
    fingerprint,
    eager,
    file_count: distFiles.length,
    total_bytes: totalBytes,
    gl_chunk_count: glChunks.length,
    gl_surface_count: glSurfaces.length,
    gl_chunks: glChunks,
    files,
  },
  artifacts: {
    app_tar_gz: { ...artefactHash(tarball), publish_as: tarballName },
    dmg: artefactHash(dmg),
    signature_sha256: sha256(readFileSync(sigPath)),
  },
};

const recordName = `LCXOS_${version}_build-record.json`;
const stagedRecord = join(stage, recordName);
writeFileSync(stagedRecord, `${JSON.stringify(record, null, 2)}\n`);

console.log(`\n  build record`);
console.log(`    commit     ${record.source.commit ?? '(not a git checkout)'}${record.source.dirty ? '  ⚠ DIRTY TREE — the commit does not identify these bytes; the hashes below do' : ''}`);
console.log(`    bundle     ${distFiles.length} files, ${(totalBytes / 1_000_000).toFixed(2)} MB, entry fingerprint ${fingerprint}`);
console.log(`    gl chunks  ${glChunks.length} carrying shader source (${glSurfaces.length} renderer surfaces + ${glChunks.length - glSurfaces.length} shared)`);
if (glChunks.length === 0) {
  console.log('               ← this release carries NO 3-D layer. That was true of 0.2.6 and nothing said so.');
}
console.log(`    written    ${stagedRecord}`);

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

// The record ships WITH the release, not into this repo. It describes a directory that is
// gitignored, so committing it here would put a fact about untracked bytes into the code
// repo while the bytes themselves stayed unreachable; published as an asset it sits beside
// the exact tarball it describes, and "which build is on this desk?" is answered by
// downloading the record for that version.
const assets = [latestPath, stagedTarball, stagedSig, stagedRecord, ...(stagedDmg ? [stagedDmg] : []), ...(stagedDmgLatest ? [stagedDmgLatest] : [])];
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
// A release without its record is a release nobody can identify later, which is the exact
// hole this closes. Asserted the same way as the two above rather than assumed, because
// `gh release create` uploading five of six assets fails silently in the only direction
// that matters — the tarball is there, so nothing looks wrong.
if (!names.includes(recordName)) {
  die(`published, but the build record did not upload.\n  expected: ${recordName}\n  actual  : ${names.join(', ')}\n  apps/web/dist is gitignored, so without this asset there is no record of which web bundle\n  this tag shipped. Upload it: gh release upload ${tag} --repo ${RELEASES_REPO} ${stagedRecord}`);
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
