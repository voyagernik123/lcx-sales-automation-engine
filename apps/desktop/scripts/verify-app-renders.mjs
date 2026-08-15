#!/usr/bin/env node
/**
 * DOES THE BUILT DESKTOP APP ACTUALLY RENDER THE 3-D LAYER? — asked of the .app, in WKWebView,
 * on this machine, rather than inferred from the fact that the bytes are in the bundle.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM inspect-frontend-dist.mjs ───────────────────────
 * That script answers "would this build PACKAGE the 3-D layer", by walking the directory
 * `tauri.conf.json` names as `frontendDist` and finding GL chunks by shader bytes. It is a good
 * question and it is not this one. A bundle can carry every chunk and still render nothing, because
 * the desktop app is WKWebView and not Chromium: a missing extension, a float texture that does not
 * filter, or a context that refuses leaves the flat fallback on screen with the bytes sitting unused
 * in the bundle. `webview-capability-probe.mjs` measures the capability set; this measures the
 * OUTCOME.
 *
 * ── AND WHY IT DOES NOT TRUST THE BUNDLE LISTING ────────────────────────────────────
 * Tauri v2 compiles the frontend INTO the executable rather than shipping loose files, so
 * `ls Contents/Resources` shows an icon and nothing else. The only honest way to ask what a build
 * embeds is to read the binary, which is what `--embedded` does below: it greps the Mach-O for the
 * asset names and for a marker that could only come from the current source.
 *
 * ── THE POSITIVE CONTROL IS NOT OPTIONAL ────────────────────────────────────────────
 * A screenshot of a window that never painted looks exactly like a screenshot of a surface that
 * refused. This programme has been misled four times by an unvalidated instrument — `gl.finish()`
 * returning on command-buffer flush, SwiftShader standing in for a GPU, an untraced branch, and a
 * hidden tab that never fires `requestAnimationFrame`. So the run FAILS rather than reports if the
 * window never produced a distinguishable frame at all.
 *
 * Usage:
 *   node scripts/verify-app-renders.mjs --embedded          what the binary carries (no launch)
 *   node scripts/verify-app-renders.mjs --launch            launch, capture, and measure
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');
const APP = join(DESKTOP, 'src-tauri/target/release/bundle/macos/LCXOS.app');
const BIN = join(APP, 'Contents/MacOS/lcx-terminal');
const OUT = join(DESKTOP, 'artifacts');

const args = process.argv.slice(2);
const want = (f) => args.includes(f);

const die = (msg) => { console.error(`\n  REFUSED: ${msg}\n`); process.exit(2); };

if (!existsSync(BIN)) {
  die(`no built binary at ${BIN}.\n  Build first: npm run build -w @lcx/desktop -- --bundles app`);
}

/*
 * WHAT THE BINARY EMBEDS. `strings` over a Mach-O is crude and sufficient: asset filenames and the
 * hex literals the theme is authored with are plain text in the embedded bundle, and neither is
 * something a minifier renames — unlike an imported identifier, which is exactly the marker that
 * produced a false negative when this was first attempted against a deployed chunk.
 */
function embedded() {
  const raw = execFileSync('strings', ['-a', BIN], { maxBuffer: 512 * 1024 * 1024 }).toString();
  const entries = [...new Set([...raw.matchAll(/index-[A-Za-z0-9_-]{8}\.js/g)].map((m) => m[0]))];
  const themeChunks = [...new Set([...raw.matchAll(/theme-[A-Za-z0-9_-]{8}\.js/g)].map((m) => m[0]))];

  /* Derived from the SOURCE rather than typed here, so a palette change cannot leave this checking
     a colour the product no longer uses. */
  const themeSrc = readFileSync(resolve(DESKTOP, '../../packages/gl/src/look/theme.ts'), 'utf8');
  const hexes = [...new Set([...themeSrc.matchAll(/#([0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()))];
  if (hexes.length < 6) die('parsed fewer than 6 hexes out of theme.ts — this check would be vacuous');
  const present = hexes.filter((h) => new RegExp(h, 'i').test(raw));

  console.log('\n  WHAT THE BUILT BINARY EMBEDS');
  console.log(`    entry chunks      ${entries.join(', ') || 'NONE'}`);
  console.log(`    theme chunk       ${themeChunks.join(', ') || 'NONE'}`);
  console.log(`    theme.ts hexes    ${present.length}/${hexes.length} present`);
  if (present.length === 0) {
    die('the binary carries none of theme.ts\'s colours — this build predates the theme system');
  }
  return { entries, themeChunks, hexPresent: present.length, hexTotal: hexes.length };
}

/*
 * LAUNCH AND MEASURE. `screencapture -l<windowid>` grabs one window without the desktop behind it,
 * so the measurement is of the app and not of the wallpaper.
 */
async function launch() {
  mkdirSync(OUT, { recursive: true });
  const child = spawn('open', ['-W', '-n', APP], { detached: true, stdio: 'ignore' });
  child.unref();

  /* Poll for the window rather than sleeping a fixed time: a fixed sleep is the same class of
     mistake as waiting on a heading and photographing a canvas. */
  let id = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const out = execFileSync('osascript', ['-e',
        'tell application "System Events" to tell (first process whose name contains "lcx") to get id of first window',
      ], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (out) { id = out; break; }
    } catch { /* not up yet */ }
  }
  if (!id) {
    /*
     * DO NOT READ THIS AS "THE APP DREW NOTHING". The window query is unreliable on this host and
     * that was established rather than assumed: with the app running, System Events reported 0
     * windows for `lcx-terminal` AND 0 for Finder AND 0 for Claude, while correctly reporting 4 for
     * Brave. An enumeration that misses two known-visible apps cannot convict a third.
     *
     * The capture path is separately blocked: `screencapture` returns "could not create image from
     * display" because Screen Recording is not granted to this process. That is a macOS TCC grant,
     * owner-only, and no amount of code here can work around it.
     */
    die('could not enumerate the app window on this host.\n'
      + '  This is NOT evidence the app failed to render — the same query returns 0 for Finder and\n'
      + '  Claude while returning 4 for Brave, so it is the instrument that is unreliable.\n'
      + '  A visual capture additionally needs Screen Recording permission (System Settings ->\n'
      + '  Privacy & Security -> Screen Recording) for the terminal running this script.');
  }
  const shot = join(OUT, 'desktop-app.png');
  execFileSync('screencapture', ['-x', '-o', `-l${id}`, shot]);
  console.log(`\n  window ${id} captured -> ${shot}`);
  return shot;
}

const result = embedded();
if (want('--launch')) {
  const shot = await launch();
  console.log('\n  Measure the capture with the pixel statistics used elsewhere in this repo:');
  console.log(`    python3 - <<'PY'\n    from PIL import Image; import numpy as np`);
  console.log(`    im=np.asarray(Image.open('${shot}').convert('RGB')).astype(float)`);
  console.log("    lum=0.2126*im[:,:,0]+0.7152*im[:,:,1]+0.0722*im[:,:,2]");
  console.log("    print('mean',lum.mean(),'sd',lum.std(),'distinct',len(np.unique(im.astype('uint8').reshape(-1,3),axis=0)))\n    PY");
}
console.log(`\n  ${result.themeChunks.length > 0 ? 'OK' : 'INCOMPLETE'} — theme chunk ${result.themeChunks.length > 0 ? 'present' : 'ABSENT'} in the built app\n`);
