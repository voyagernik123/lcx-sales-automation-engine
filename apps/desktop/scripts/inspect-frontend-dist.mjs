#!/usr/bin/env node
/**
 * WHAT WOULD THIS DESKTOP BUILD ACTUALLY PACKAGE? — answerable before the key, the tag
 * and the ten-minute build, instead of after all three.
 *
 * ── THE GAP THIS FILLS ──────────────────────────────────────────────────────────────
 *
 * `publish-release.mjs` already computes the GL chunk count for the build record
 * (`:314-326`), and DELIVERY.md §10 step 5 tells the owner to read the line it prints.
 * But that number arrives LATE, and the ordering is not incidental — the publisher dies
 * before it ever reaches the record:
 *
 *     :96   no bundle at src-tauri/target/release/bundle    → needs a completed tauri build
 *     :102  expected exactly 1 .app.tar.gz                  → needs the bundler
 *     :108  no signature at <tarball>.sig                   → needs TAURI_SIGNING_PRIVATE_KEY
 *     :132  STALE BUILD — Info.plist version disagrees      → needs cargo build --release
 *     :255+ …only now is the dist walked and the record written
 *
 * So "does this release carry the 3-D layer?" was gated behind the owner's minisign key
 * and a full release build. This asks the same question of the same directory — the one
 * `tauri.conf.json:10` names as `frontendDist` — using the SAME marker, with nothing but
 * `npm run build -w @lcx/web` in front of it. Nobody needs a credential to run it.
 *
 * ── WHY BYTES AND NOT FILENAMES ─────────────────────────────────────────────────────
 *
 * Vite content-hashes chunk names, so a name match proves nothing about what is inside,
 * and the name set is not derivable from a hand-list either: `*ReliefGl` misses E8 THE
 * FORGE (it ships as `ForgeBackdrop`) and misses all seven SHARED chunks — `ao`, `dof`,
 * `lines`, `lit`, `pipeline`, `volume` and the `@lcx/gl` barrel's own `index-*.js`. A
 * missing shared chunk breaks every toggle that depends on it while the relief chunk
 * itself loads fine, and name matching would call that healthy. A chunk carrying GLSL is
 * a GL chunk: a fact about the bytes, which keeps covering environments nobody has named
 * yet. The marker is `verify-live.mjs:122`'s, character for character, so a desk build
 * and a deployed site are judged by one rule rather than two that can drift.
 *
 * ── THE ONE THING THIS REFUSES ON, AND WHY ONLY THIS ────────────────────────────────
 *
 * A GL chunk appearing in the EAGER set is a hard failure. Nothing checked this before —
 * the build record lists `eager` and lists `gl_chunks` and never intersects them.
 *
 * Measured on the build this file was written against: the eager set is 7 items
 * (entry + 2 vendor chunks + 2 stylesheets + 2 font preloads) and the 15 GL chunks total
 * 174,422 B, every one of them lazy. One static import of a relief from a routed module
 * moves its whole subgraph into the entry: the sign-in screen would then pay for the
 * volumetric raymarcher before it paints, on a route whose §7(b) case is "a stranger
 * stops scrolling", and the bundle-size budget would not necessarily catch it because
 * the bytes did not appear — they MOVED. That is the failure this refuses on.
 *
 * It does NOT refuse on a zero GL chunk count, and that is the same decision
 * `publish-release.mjs:379` records: 0.2.6 carried no relief surfaces and was a CORRECT
 * release, so a `> 0` floor would have blocked it. Zero is reported loudly and passes.
 * `--expect-gl-chunks N` is there for the caller who does have an expectation.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────────
 *   npm run inspect-dist -w @lcx/desktop                        report
 *   npm run inspect-dist -w @lcx/desktop -- --expect-gl-chunks 15   report + assert
 *   npm run inspect-dist -w @lcx/desktop -- --json              machine-readable
 *
 * Exit 0 = the directory Tauri would copy is intact and its GL layer is entirely lazy.
 * Exit 1 = something is wrong with the bundle. There is no third code on purpose: unlike
 * `verify-live.mjs`, nothing here is reached over a network, so "inconclusive" has no
 * meaning — the directory is either on this disk or it is not.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');

/* Resolved from tauri.conf.json rather than hardcoded, because `frontendDist` is the
   single fact that decides which directory ships. If someone repoints it, this follows —
   a hardcoded '../web/dist' here would go on inspecting a directory that no longer ships,
   and would keep printing a reassuring 15. Paths in `build` are relative to the config
   file's own directory, which is `src-tauri`. */
const CONF_PATH = join(DESKTOP, 'src-tauri/tauri.conf.json');
const conf = JSON.parse(readFileSync(CONF_PATH, 'utf8'));
const frontendDist = conf.build?.frontendDist;
if (typeof frontendDist !== 'string' || !frontendDist) {
  console.error(`\n✗ ${CONF_PATH} has no build.frontendDist — cannot tell what would be packaged.\n`);
  process.exit(1);
}
const DIST = resolve(join(DESKTOP, 'src-tauri'), frontendDist);

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const expectIdx = args.indexOf('--expect-gl-chunks');
const expectGl = expectIdx >= 0 ? Number(args[expectIdx + 1]) : null;
if (expectIdx >= 0 && !Number.isInteger(expectGl)) {
  console.error('\n✗ --expect-gl-chunks needs an integer\n');
  process.exit(1);
}

const fail = [];
const say = (s) => { if (!JSON_OUT) console.log(s); };

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`\n✗ ${DIST} does not exist.\n  Run \`npm run build -w @lcx/web\` first — this reads the bundle, it does not create it.\n`);
  process.exit(1);
}

/* Recursive, not `assets/` only: `public/` is copied to the dist ROOT, and that root is
   exactly where apps/web/scripts/check-bundle.mjs records a 40 MB payload being able to
   hide. Same reason publish-release.mjs:259 walks recursively. */
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
};
const files = walk(DIST).sort();

const indexHtml = join(DIST, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`\n✗ no ${indexHtml} — Tauri would package a directory that cannot boot.\n`);
  process.exit(1);
}
const html = readFileSync(indexHtml, 'utf8');

/* ATTRIBUTES PARSED ORDER-INDEPENDENTLY. publish-release.mjs:277-282 records why in
   full: a regex requiring `rel="preload"[^>]+as="font"[^>]+href=` missed both font
   preloads — 434 KB, the largest single item in first load — because Vite emits
   `rel="preload" href="…" as="font"`. Repeating the ordered form here would reintroduce
   a defect that has already been paid for once. */
const tagAttrs = (tag) => {
  const at = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) at[m[1].toLowerCase()] = m[2];
  return at;
};
const eagerHrefs = [];
for (const m of html.matchAll(/<script\b[^>]*>/g)) {
  const at = tagAttrs(m[0]);
  if (at.src) eagerHrefs.push(at.src);
}
for (const m of html.matchAll(/<link\b[^>]*>/g)) {
  const at = tagAttrs(m[0]);
  const rel = (at.rel ?? '').toLowerCase();
  if (!at.href) continue;
  if (rel === 'modulepreload' || rel === 'stylesheet') eagerHrefs.push(at.href);
  else if (rel === 'preload' && (at.as ?? '').toLowerCase() === 'font') eagerHrefs.push(at.href);
}
const eager = [...new Set(eagerHrefs)].filter((s) => !/^https?:/i.test(s));
const entry = eager.find((s) => /index-[A-Za-z0-9_-]+\.js$/.test(s)) ?? null;
if (!entry) fail.push(`${indexHtml} names no index-<hash>.js entry script — the bundle is malformed and has no fingerprint`);
const fingerprint = entry ? (entry.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? entry) : null;

const SHADER_MARKER = /precision\s+(?:highp|mediump|lowp)|createStage/;
const glChunks = [];
let totalBytes = 0;
for (const p of files) {
  const buf = readFileSync(p);
  const rel = relative(DIST, p);
  totalBytes += buf.length;
  /* NON-EMPTINESS NEEDS NO SEPARATE CHECK, and writing one would have been a check that
     cannot fail: the shortest string SHADER_MARKER can match is `precision lowp`, so a
     file that matched is at least 14 bytes by construction. An explicit `bytes === 0`
     guard here would sit in the tree forever having never been reachable. The per-chunk
     byte column below is the evidence; the smallest real chunk on the build this was
     written against is `lines` at 1,801 B. */
  if (rel.endsWith('.js') && SHADER_MARKER.test(buf.toString('utf8'))) {
    glChunks.push({ path: rel, bytes: buf.length });
  }
}
glChunks.sort((a, b) => a.path.localeCompare(b.path));
const surfaces = glChunks.filter((c) => /Relief|Orrery|Forge/i.test(c.path));
const glBytes = glChunks.reduce((n, c) => n + c.bytes, 0);

/* THE REFUSAL. Eager hrefs are document-root-absolute (`/assets/x.js`); dist paths are
   relative (`assets/x.js`). Compared after stripping the leading slash so the two
   namespaces actually meet — an equality test between the raw forms can never match, and
   a check that can never fire is worse than no check. */
const eagerSet = new Set(eager.map((h) => h.replace(/^\//, '')));
const eagerGl = glChunks.filter((c) => eagerSet.has(c.path));
for (const c of eagerGl) {
  fail.push(
    `${c.path} (${c.bytes} B) carries shader source AND is in the eager set — `
    + 'the GL layer must be lazy. Something now imports a relief statically, so the '
    + 'sign-in screen pays for it before first paint.',
  );
}

if (expectGl !== null && glChunks.length !== expectGl) {
  fail.push(`expected ${expectGl} GL chunks, found ${glChunks.length}`);
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    dist: DIST,
    frontend_dist_config: frontendDist,
    files: files.length,
    bytes: totalBytes,
    entry,
    fingerprint,
    eager,
    gl_chunk_count: glChunks.length,
    gl_surface_count: surfaces.length,
    gl_bytes: glBytes,
    gl_chunks: glChunks,
    gl_chunks_eager: eagerGl.map((c) => c.path),
    ok: fail.length === 0,
    failures: fail,
  }, null, 2));
  process.exit(fail.length === 0 ? 0 : 1);
}

say('\n  ── what tauri build would package ─────────────────────────────────────');
say(`  frontendDist   ${frontendDist}   (${CONF_PATH.replace(`${DESKTOP}/`, '')})`);
say(`  resolved       ${DIST}`);
say(`  files          ${files.length}, ${totalBytes.toLocaleString()} B total`);
say(`  entry          ${entry ?? 'NONE'}`);
say(`  fingerprint    ${fingerprint ?? 'NONE'}`);
say(`\n  eager set (${eager.length}) — fetched before first paint:`);
for (const e of eager) say(`    · ${e}`);
say(`\n  GL chunks by SHADER BYTES (${glChunks.length}: ${surfaces.length} renderer surfaces + ${glChunks.length - surfaces.length} shared), ${glBytes.toLocaleString()} B:`);
for (const c of glChunks) {
  say(`    ${eagerSet.has(c.path) ? '✗ EAGER' : '  lazy  '}  ${c.path.padEnd(40)} ${String(c.bytes).padStart(8)} B`);
}
if (glChunks.length === 0) {
  say('    (none)  ← this build carries NO 3-D layer. Not an error: 0.2.6 was like this');
  say('            and was a correct release. But if you expected the reliefs, stop here.');
}

if (fail.length) {
  console.error(`\n  ✗ ${fail.length} problem${fail.length === 1 ? '' : 's'}:`);
  for (const f of fail) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
say('\n  ✓ the bundle is intact and every GL chunk is lazy\n');
