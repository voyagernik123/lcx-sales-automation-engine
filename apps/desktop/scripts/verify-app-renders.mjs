#!/usr/bin/env node
/**
 * DOES THE BUILT DESKTOP APP ACTUALLY DRAW? — answered with a bitmap, on this machine,
 * rather than inferred from the fact that the bytes are in the bundle.
 *
 * ── WHAT THIS SCRIPT USED TO DO, AND WHY IT WAS REPLACED ────────────────────────────
 *
 * It launched the .app, asked System Events for the window id, and ran `screencapture -l`.
 * Both halves are dead ends on this host and both were measured rather than assumed:
 *
 *   `screencapture` returns "could not create image from display". Screen Recording is a
 *     macOS TCC grant. This process does not hold it, no code can route around it, and
 *     that is a statement about a permission, not about the app.
 *   The System Events enumeration returned 0 windows for the app — AND 0 for Finder, AND 0
 *     for Claude, while returning 4 for Brave. An instrument that misses two known-visible
 *     applications cannot convict a third. The old script exited 2 here, which was honest
 *     but useless: it produced no evidence either way.
 *
 * ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────
 *
 * A snapshot of your own view is not a screen recording. `webview-render-probe.swift`
 * builds a WKWebView, loads the app's REAL built frontend — the directory `tauri.conf.json`
 * names as `frontendDist`, the same bytes the binary embeds — waits for it to paint, and
 * calls `takeSnapshot`. The bitmap never leaves the process, so TCC is never involved and
 * this needs no permission at all.
 *
 * ── THE CONTROLS ARE THE WHOLE VALUE ────────────────────────────────────────────────
 *
 * A snapshot of a view that never painted looks exactly like a snapshot of a surface that
 * refused: both are a rectangle of one colour. Three controls run BEFORE any claim about
 * the app, and any failure aborts the run rather than degrading it to a warning:
 *
 *   POSITIVE  A page authored here, twelve known colours in twelve known places. All twelve
 *             must come back from the twelve corresponding pixels of the snapshot. This is a
 *             spatial claim; a flat fill cannot accidentally satisfy it.
 *   NEGATIVE  A blank white page. Standard deviation must be 0 and the distinct-colour count
 *             must be 1 — the statistics must COLLAPSE, or they do not discriminate.
 *   CROSS     The positive control's twelve assertions, evaluated against the NEGATIVE
 *             control's bitmap. Exactly one must pass — because exactly one of the twelve
 *             authored colours is #FFFFFF and the blank page is white. Any other number
 *             means the assertions are not doing what they claim. This is the control that
 *             proves the instrument can FAIL, which is the property this programme has been
 *             burned for not checking: a test that cannot go red is not evidence.
 *
 * The expected number is DERIVED from the palette (count of #FFFFFF entries), not typed, so
 * changing the pattern cannot leave a stale constant behind.
 *
 * ── AND THE LINK BACK TO THE .APP ───────────────────────────────────────────────────
 *
 * Rendering `apps/web/dist` says nothing about the shipped app unless the shipped app
 * carries those exact bytes. So the entry chunk name is read out of `dist/index.html` and
 * required to appear in `strings` over the Mach-O. If they differ, the render result does
 * not describe this build and the script says so instead of reporting a number.
 *
 * ── WHAT THIS PROVES, STATED SO IT CANNOT BE READ AS MORE ───────────────────────────
 *
 * It proves THE BUILT FRONTEND RENDERS IN WKWEBVIEW ON THIS MACHINE, and which surfaces.
 * It does NOT prove the packaged .app presents a window: a Tauri window is Tauri's own Rust
 * code creating an NSWindow and a wry WebView, and this bypasses all of it. It does not
 * prove anything about another Mac, another macOS, or the app under memory pressure.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/verify-app-renders.mjs                 controls + every renderable surface
 *   node scripts/verify-app-renders.mjs --embedded-only what the binary carries, no render
 *   node scripts/verify-app-renders.mjs --json          machine-readable
 *   node scripts/verify-app-renders.mjs --port 5809     static server port (must be > 5800)
 *
 * Exit 0 = controls passed and every attempted surface drew. 1 = a control or a surface
 * failed. 2 = could not run (say so; never infer the answer).
 */
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, '..');
const ROOT = resolve(DESKTOP, '..', '..');
const TAURI_CONF = join(DESKTOP, 'src-tauri/tauri.conf.json');
const APP = join(DESKTOP, 'src-tauri/target/release/bundle/macos/LCXOS.app');
const BIN = join(APP, 'Contents/MacOS/lcx-terminal');

const args = process.argv.slice(2);
const want = (f) => args.includes(f);
const flagValue = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const JSON_OUT = want('--json');
/* Bitmaps land OUTSIDE the repository by default. `apps/desktop/artifacts/` is not
   gitignored, and a verification run that leaves untracked megabytes in a working tree is a
   verification run people stop invoking. `--out-dir` overrides. */
const OUT = resolve(flagValue('--out-dir', join(tmpdir(), 'lcx-render-proof')));
const PORT = Number(flagValue('--port', '5809'));
if (!Number.isInteger(PORT) || PORT <= 5800) die(`--port must be an integer above 5800, got ${PORT}`);

const log = (...a) => { if (!JSON_OUT) console.log(...a); };
function die(msg) { console.error(`\n  CANNOT RUN: ${msg}\n`); process.exit(2); }
function red(msg) { console.error(`\n  FAILED: ${msg}\n`); process.exit(1); }

/* ── 0 · DERIVE EVERY INPUT FROM SOURCE ─────────────────────────────────────────────
 * Nothing below is typed twice. A path, a marker name or a storage key written here as a
 * literal is a thing that goes stale silently, and this programme has already paid for one
 * of those — an anti-flash script that read a key nothing had ever written, on every load,
 * for everyone. Each derivation fails loudly rather than falling back to a guess. */

function readOrDie(p, what) {
  try { return readFileSync(p, 'utf8'); } catch { die(`could not read ${what} at ${p}`); }
}

// frontendDist — the directory Tauri compiles into the executable.
const conf = JSON.parse(readOrDie(TAURI_CONF, 'tauri.conf.json'));
const distRel = conf?.build?.frontendDist;
if (typeof distRel !== 'string') die('tauri.conf.json has no build.frontendDist string');
const DIST = resolve(dirname(TAURI_CONF), distRel);
if (!existsSync(join(DIST, 'index.html'))) {
  die(`frontendDist resolves to ${DIST} but there is no index.html there.\n`
    + '  Build the web app first: npm run build -w @lcx/web');
}

// The entry chunk, read out of the built index.html. This is the name that has to appear
// in the app binary for a render of DIST to say anything about the app.
const indexHtml = readOrDie(join(DIST, 'index.html'), 'built index.html');
const entryChunk = indexHtml.match(/src="\/assets\/(index-[A-Za-z0-9_-]+\.js)"/)?.[1];
if (!entryChunk) die('could not find the entry chunk <script src> in the built index.html');

// The container marker. `lib/container.ts` decides browser-vs-terminal by testing for a
// property the Tauri webview injects before app code runs; the frontend routes to a
// DIFFERENT surface depending on the answer. Read the property name out of that file so
// this cannot drift when Tauri renames it.
const containerSrc = readOrDie(join(ROOT, 'apps/web/src/lib/container.ts'), 'lib/container.ts');
const containerMarker = containerSrc.match(/'(__[A-Z_]+__)'\s+in\s+window/)?.[1];
if (!containerMarker) die("could not derive the container marker from lib/container.ts (expected \"'__X__' in window\")");

// The operator seed, so the signed-in shell can be reached. Every part is derived:
// the roster from @lcx/shared, the storage key from lib/storage.ts, the key prefix and
// version from lib/persistence.ts, and the persisted schema version from the store.
const teamSrc = readOrDie(join(ROOT, 'packages/shared/src/operators.ts'), 'shared operators.ts');
const teamRows = [...teamSrc.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*email:\s*'([^']+)',\s*role:\s*'([^']+)'\s*\}/g)]
  .map((m) => ({ id: m[1], name: m[2], email: m[3], role: m[4] }));
if (teamRows.length === 0) die('could not parse the TEAM roster out of packages/shared/src/operators.ts');
const seedOperator = teamRows.find((t) => t.role === 'approver') ?? teamRows[0];

const storageSrc = readOrDie(join(ROOT, 'apps/web/src/lib/storage.ts'), 'lib/storage.ts');
const operatorKey = storageSrc.match(/OPERATOR\s*:\s*'([^']+)'/)?.[1];
const persistSrc = readOrDie(join(ROOT, 'apps/web/src/lib/persistence.ts'), 'lib/persistence.ts');
const keyPrefix = persistSrc.match(/const PREFIX\s*=\s*'([^']+)'/)?.[1];
const keyVersion = persistSrc.match(/const VERSION\s*=\s*'([^']+)'/)?.[1];
const emailKey = persistSrc.match(/OPERATOR_EMAIL_KEY\s*=\s*'([^']+)'/)?.[1];
const storeSrc = readOrDie(join(ROOT, 'apps/web/src/stores/useOperatorStore.ts'), 'useOperatorStore.ts');
const storeVersion = Number(storeSrc.match(/version:\s*(\d+)/)?.[1]);
if (!operatorKey || !keyPrefix || !keyVersion || !emailKey || !Number.isInteger(storeVersion)) {
  die('could not derive the operator persistence keys from source '
    + `(operatorKey=${operatorKey} prefix=${keyPrefix} version=${keyVersion} emailKey=${emailKey} storeVersion=${storeVersion})`);
}

/* ── 1 · WHAT THE BINARY EMBEDS ─────────────────────────────────────────────────────
 * Tauri v2 compiles the frontend INTO the executable rather than shipping loose files, so
 * `ls Contents/Resources` shows an icon and nothing else. Reading the Mach-O is the only
 * honest way to ask what a build carries. `strings` is crude and sufficient: asset
 * filenames and the hex literals the theme is authored with are plain text in the embedded
 * bundle, and neither is something a minifier renames — unlike an imported identifier,
 * which is exactly the marker that produced a false negative when this was first tried. */
function embedded() {
  if (!existsSync(BIN)) {
    return { built: false, note: `no built binary at ${BIN}` };
  }
  const raw = execFileSync('strings', ['-a', BIN], { maxBuffer: 512 * 1024 * 1024 }).toString();
  const entries = [...new Set([...raw.matchAll(/index-[A-Za-z0-9_-]{8}\.js/g)].map((m) => m[0]))];
  const themeChunks = [...new Set([...raw.matchAll(/theme-[A-Za-z0-9_-]{8}\.js/g)].map((m) => m[0]))];

  /*
   * HOW FAR `strings` CAN ACTUALLY TAKE THIS — measured, because the previous version of
   * this script over-claimed here and printed a number that meant nothing.
   *
   * It used to report "theme.ts hexes N/M present" by grepping the Mach-O for the colours
   * `packages/gl/src/look/theme.ts` is authored with. That check reads 1/20 on this build,
   * and the one hit is `FFFFFF` — a six-character run that occurs in almost any binary. The
   * reason is not that the theme is missing: Tauri v2 embeds the frontend COMPRESSED, so the
   * asset MANIFEST (filenames) is plain text in the executable and the asset CONTENT is not.
   * `Sign in to the desk` is in `dist/assets/index-*.js` and appears zero times in the
   * binary; so does `050810`, which is in the built theme chunk.
   *
   * So instead of a stale hex count, this DERIVES a marker out of the built entry chunk and
   * reports the two facts separately: the manifest names the chunk (checkable), and the
   * content is not greppable (which is why a byte-level comparison needs a decompressor and
   * is not attempted here). A reader can then see exactly what the filename match is worth.
   */
  const entryJs = readOrDie(join(DIST, 'assets', entryChunk), 'the built entry chunk');
  const marker = [...entryJs.matchAll(/"([\x20-\x7E]{40,120})"/g)]
    .map((m) => m[1]).find((s) => !/[\\"]/.test(s));
  if (!marker) die('could not derive a content marker from the built entry chunk');
  const contentGreppable = raw.includes(marker);

  return {
    built: true,
    entries,
    themeChunks,
    // The link between "dist renders" and "the app ships dist".
    entryMatchesDist: entries.includes(entryChunk),
    contentMarker: marker.slice(0, 48),
    contentGreppable,
  };
}

/* ── 2 · THE CONTROL PATTERN ────────────────────────────────────────────────────────
 * ONE array, two uses: the HTML is generated from it and the assertions are generated from
 * it, so the page and the expectation cannot drift apart. Twelve blocks on a 4x3 grid at
 * 1440x900 — 360x300 each, so every boundary lands on a whole device pixel at 1x and at 2x
 * and nothing is anti-aliased into a colour nobody authored. */
const CELL_W = 360, CELL_H = 300, COLS = 4, ROWS = 3;
const VIEW_W = CELL_W * COLS, VIEW_H = CELL_H * ROWS;
const PATTERN = [
  '#E11D48', '#2563EB', '#16A34A', '#F59E0B',
  '#7C3AED', '#0891B2', '#DB2777', '#65A30D',
  '#111827', '#FFFFFF', '#9CA3AF', '#EA580C',
];
if (PATTERN.length !== COLS * ROWS) die('the control pattern does not fill the control grid');
const patternCentres = PATTERN.map((hex, i) => ({
  hex,
  x: (i % COLS) * CELL_W + CELL_W / 2,
  y: Math.floor(i / COLS) * CELL_H + CELL_H / 2,
}));
/* The CROSS control's expected pass count, derived rather than typed: on a white page,
   exactly the white entries of the pattern can match. */
const WHITES_IN_PATTERN = PATTERN.filter((h) => h.toUpperCase() === '#FFFFFF').length;

const positiveHtml = `<!doctype html><html><head><meta charset="utf-8"><title>LCX render control</title>
<style>html,body{margin:0;padding:0;background:#000}
#g{display:grid;grid-template-columns:repeat(${COLS},${CELL_W}px);grid-template-rows:repeat(${ROWS},${CELL_H}px)}
#g>i{display:block;width:${CELL_W}px;height:${CELL_H}px}</style></head>
<body><div id="g">${PATTERN.map((c) => `<i style="background:${c}"></i>`).join('')}</div></body></html>`;

const negativeHtml = `<!doctype html><html><head><meta charset="utf-8"><title>LCX blank control</title>
<style>html,body{margin:0;padding:0;background:#FFFFFF}</style></head><body></body></html>`;

/* ── 3 · BUILD THE HARNESS ──────────────────────────────────────────────────────────*/
const TMP = mkdtempSync(join(tmpdir(), 'lcx-render-'));
const HARNESS_SRC = join(HERE, 'webview-render-probe.swift');
const HARNESS = join(TMP, 'render-probe');

function buildHarness() {
  if (!existsSync(HARNESS_SRC)) die(`missing ${HARNESS_SRC}`);
  try {
    // stderr is captured, not inherited: swiftc emits Swift-6 concurrency warnings for this
    // single-threaded AppKit program that are noise here. A real error still throws.
    execFileSync('swiftc', ['-O', '-o', HARNESS, HARNESS_SRC,
      '-framework', 'Cocoa', '-framework', 'WebKit'], { stdio: 'pipe' });
  } catch (e) {
    die('swiftc could not build the render harness (Xcode command line tools required).\n'
      + String(e.stderr || e));
  }
}

/* ── 4 · SERVE THE REAL BUILT FRONTEND ──────────────────────────────────────────────
 * Over http on 127.0.0.1 rather than file:// or a custom scheme, for three reasons that
 * were each hit: index.html references its assets with ABSOLUTE paths (`/assets/...`), which
 * file:// cannot resolve; the router is a browser router and needs a real history origin;
 * and localStorage — which the pre-hydration theme script and every persisted store use —
 * is restricted on custom schemes. An http origin is the one that behaves like the app's. */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function serve() {
  return new Promise((ok, no) => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      let p = decodeURIComponent(url.pathname);
      // Serve the two control pages from the same origin as the app, so the controls
      // exercise the same load path (http, same port, same WebKit process) as the thing
      // they vouch for. A control that took a different route would vouch for nothing.
      if (p === '/__control/positive') return send(res, '.html', Buffer.from(positiveHtml));
      if (p === '/__control/negative') return send(res, '.html', Buffer.from(negativeHtml));

      if (p.endsWith('/')) p += 'index.html';
      const file = join(DIST, p);
      // Refuse to serve outside DIST. A path-traversal here would be a bug that makes the
      // measurement describe a file the app does not ship.
      if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
      try {
        return send(res, extname(file), readFileSync(file));
      } catch {
        // SPA fallback: the router owns every extensionless path.
        if (!extname(p)) { try { return send(res, '.html', readFileSync(join(DIST, 'index.html'))); } catch { /* fall through */ } }
        res.writeHead(404).end('not found');
      }
    });
    const send = (res, ext, body) => {
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': body.length });
      res.end(body);
    };
    srv.on('error', no);
    srv.listen(PORT, '127.0.0.1', () => ok(srv));
  });
}

/* ── 5 · ONE SHOT ───────────────────────────────────────────────────────────────────*/
const ERROR_TRAP = 'window.__probeErrors=[];'
  + 'window.addEventListener("error",function(e){window.__probeErrors.push("error: "+(e.message||String(e)))});'
  + 'window.addEventListener("unhandledrejection",function(e){window.__probeErrors.push("reject: "+String(e.reason))});';

const DOM_JS = '({href:location.href,title:document.title,'
  + 'rootChildren:(document.querySelector("#root")||{children:[]}).children.length,'
  + 'elements:document.querySelectorAll("*").length,'
  + 'canvases:document.querySelectorAll("canvas").length,'
  + 'svgs:document.querySelectorAll("svg").length,'
  + 'textLength:(document.body.innerText||"").length,'
  + 'headline:((document.body.innerText||"").trim().split("\\n").filter(Boolean)[0]||"").slice(0,60),'
  + 'errors:(window.__probeErrors||[]).slice(0,6)})';

/*
 * ASYNC, AND THAT IS NOT A STYLE CHOICE. The first version used `execFileSync` and every
 * navigation timed out with "navigation never finished in 45s" — because the static server
 * lives in THIS process, and a synchronous child blocks the event loop that would have
 * answered its requests. The harness was waiting on a server that could not run until the
 * harness exited. Worth recording: the symptom read exactly like "the page would not load",
 * which is the answer this whole script exists to determine, and believing it would have
 * convicted the app of a defect in the test rig.
 */
function shoot(name, { url, inject, ready, settleMs = 1200, timeoutS = 45, probes = [] }) {
  const png = join(OUT, `${name}.png`);
  const argv = ['--url', url, '--out', png, '--width', String(VIEW_W), '--height', String(VIEW_H),
    '--settle-ms', String(settleMs), '--timeout-s', String(timeoutS), '--dom-js', DOM_JS];
  if (inject) argv.push('--inject-js', inject);
  if (ready) argv.push('--ready-js', ready);
  for (const p of probes) argv.push('--probe', `${p.x},${p.y}`);

  return new Promise((ok) => {
    const child = spawn(HARNESS, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const kill = setTimeout(() => child.kill('SIGKILL'), (timeoutS + 40) * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      clearTimeout(kill);
      // A non-zero exit still prints its JSON, which carries the reason. Keep it.
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        die(`the render harness produced nothing for "${name}". It needs a logged-in GUI `
          + `session — a WKWebView with no window server never paints.\n  ${err.trim()}`);
      }
      let r;
      try { r = JSON.parse(line); } catch {
        die(`the render harness produced no JSON for "${name}". Raw:\n${out}\n${err}`);
      }
      r.name = name;
      ok(r);
    });
  });
}

/* ── 6 · RUN ────────────────────────────────────────────────────────────────────────*/
const emb = embedded();
mkdirSync(OUT, { recursive: true });

if (!JSON_OUT) {
  log('\n  WHAT THE BUILT BINARY EMBEDS');
  if (!emb.built) {
    log(`    ${emb.note}`);
    log('    (build it with: npm run build -w @lcx/desktop -- --bundles app)');
  } else {
    log(`    entry chunks        ${emb.entries.join(', ') || 'NONE'}`);
    log(`    theme chunk         ${emb.themeChunks.join(', ') || 'NONE'}`);
    log(`    dist entry chunk    ${entryChunk}`);
    log(`    binary names it     ${emb.entryMatchesDist ? 'YES — a render of dist describes this build'
      : 'NO — the binary is older than dist; the render below does NOT describe it'}`);
    log(`    content greppable   ${emb.contentGreppable ? 'YES' : 'NO — assets are embedded compressed'}`
      + `; the marker looked for was ${JSON.stringify(emb.contentMarker)}…`);
    if (!emb.contentGreppable) {
      log('                        so the filename match above is a MANIFEST match, not a byte');
      log('                        comparison. Proving byte-identity needs a decompressor and is');
      log('                        not attempted here.');
    }
  }
}

if (want('--embedded-only')) {
  if (JSON_OUT) console.log(JSON.stringify({ embedded: emb, distEntry: entryChunk }, null, 2));
  process.exit(emb.built ? 0 : 2);
}

buildHarness();
const server = await serve().catch((e) => die(`could not bind 127.0.0.1:${PORT} — ${e.message}`));
const BASE = `http://127.0.0.1:${PORT}`;
const results = { embedded: emb, distEntry: entryChunk, controls: {}, surfaces: [] };

function statLine(r) {
  return `mean ${r.meanLuminance.toFixed(2)}  sd ${r.sdLuminance.toFixed(2)}  `
    + `distinct ${String(r.distinctColors).padStart(6)}  ${r.pixelWidth}x${r.pixelHeight}`;
}

try {
  /* ── CONTROLS ─────────────────────────────────────────────────────────────────── */
  log('\n  CONTROLS (a snapshot that never painted looks exactly like a surface that refused)');

  const pos = await shoot('control-positive', {
    url: `${BASE}/__control/positive`, settleMs: 400, probes: patternCentres,
  });
  if (pos.snapshotError) red(`the POSITIVE control could not be snapshotted: ${pos.snapshotError}`);
  const posHits = patternCentres.map((c, i) => ({
    ...c, got: pos.probes[i]?.hex, ok: pos.probes[i]?.hex?.toUpperCase() === c.hex.toUpperCase(),
  }));
  const posPass = posHits.filter((h) => h.ok).length;
  log(`    POSITIVE  ${statLine(pos)}`);
  log(`              ${posPass}/${PATTERN.length} authored colours found at their authored pixels`);
  results.controls.positive = { ...pos, hits: posHits, pass: posPass };
  if (posPass !== PATTERN.length) {
    for (const h of posHits.filter((x) => !x.ok)) log(`              MISS (${h.x},${h.y}) want ${h.hex} got ${h.got}`);
    red('the POSITIVE control did not come back. The harness is broken and every other '
      + 'number in this run is void — including any statement about the app.');
  }

  const neg = await shoot('control-negative', {
    url: `${BASE}/__control/negative`, settleMs: 400, probes: patternCentres,
  });
  if (neg.snapshotError) red(`the NEGATIVE control could not be snapshotted: ${neg.snapshotError}`);
  log(`    NEGATIVE  ${statLine(neg)}`);
  results.controls.negative = neg;
  if (!(neg.sdLuminance === 0 && neg.distinctColors === 1)) {
    red(`the NEGATIVE control did not collapse: sd ${neg.sdLuminance}, distinct `
      + `${neg.distinctColors}, expected sd 0 and distinct 1. If a blank page does not read `
      + 'as blank, the statistics do not discriminate and nothing below means anything.');
  }

  /* CROSS: the positive assertions run against the blank bitmap. This is the run's proof
     that the assertion can go red, evaluated every time rather than once by hand. */
  const crossPass = patternCentres.filter((c, i) => neg.probes[i]?.hex?.toUpperCase() === c.hex.toUpperCase()).length;
  log(`    CROSS     the POSITIVE assertions against the BLANK bitmap: ${crossPass}/${PATTERN.length} pass`
    + ` (expected ${WHITES_IN_PATTERN} — the white entries of the pattern)`);
  results.controls.cross = { pass: crossPass, expected: WHITES_IN_PATTERN };
  if (crossPass !== WHITES_IN_PATTERN) {
    red(`the CROSS control expected exactly ${WHITES_IN_PATTERN} of ${PATTERN.length} assertions to `
      + `survive a blank page and got ${crossPass}. The assertions are not measuring what they claim.`);
  }

  /* An independent re-measurement of the same PNG, when the tooling is present. The Swift
     statistics and the Python recipe used elsewhere in this repo are two implementations of
     one definition; if they disagree, at least one is wrong and the numbers are not
     comparable to anything else in the programme. */
  const cross = crossCheckWithPython(join(OUT, 'control-positive.png'), pos);
  results.controls.pythonCrossCheck = cross;
  log(`    RECHECK   ${cross.ran
    ? (cross.agrees ? `PIL/numpy re-measure of the same PNG agrees (mean ${cross.mean.toFixed(6)}, sd ${cross.sd.toFixed(6)}, distinct ${cross.distinct})`
      : `DISAGREES — Swift said mean ${pos.meanLuminance} sd ${pos.sdLuminance} distinct ${pos.distinctColors}; PIL said mean ${cross.mean} sd ${cross.sd} distinct ${cross.distinct}`)
    : `skipped (${cross.why})`}`);
  if (cross.ran && !cross.agrees) {
    red('the two implementations of the same statistic disagree on the same file.');
  }

  /* ── SURFACES ─────────────────────────────────────────────────────────────────── */
  const seed = `try{localStorage.setItem(${JSON.stringify(emailKey)},${JSON.stringify(seedOperator.email)});`
    + `localStorage.setItem(${JSON.stringify(`${keyPrefix}${seedOperator.email}:${operatorKey}:${keyVersion}`)},`
    + `JSON.stringify({state:{operator:${JSON.stringify({
      id: seedOperator.id, name: seedOperator.name, email: seedOperator.email,
      initials: seedOperator.name[0].toUpperCase(), colorVar: 'var(--chart-1)', role: seedOperator.role,
    })}},version:${storeVersion}}));}catch(e){}`;
  const asTerminal = `window.${containerMarker}={};`;
  const READY = 'document.querySelector("#root") && document.querySelector("#root").children.length>0';

  /* Three surfaces, and the differences between them are the point:
   *   public     what a BROWSER visitor gets at "/" — the router sends them to /lcxos.
   *   front-door what the DESKTOP APP shows on launch: the container marker is injected, so
   *              `isTerminal()` answers true and the router sends "/" to the sign-in gate.
   *   shell      the signed-in shell, reached by seeding the persisted operator. Its data
   *              panels cannot be populated without the API, and the app says so on screen
   *              rather than pretending — which is itself worth capturing. */
  const plan = [
    { name: 'surface-public', label: 'public landing (browser branch)', url: `${BASE}/`, inject: ERROR_TRAP },
    { name: 'surface-front-door', label: 'sign-in gate (desktop branch)', url: `${BASE}/`, inject: asTerminal + ERROR_TRAP },
    { name: 'surface-shell', label: 'signed-in shell (seeded operator)', url: `${BASE}/`, inject: asTerminal + seed + ERROR_TRAP },
  ];

  log('\n  SURFACES OF THE REAL BUILT FRONTEND, RENDERED IN WKWEBVIEW');
  let anyFailed = false;
  for (const step of plan) {
    const r = await shoot(step.name, { url: step.url, inject: step.inject, ready: READY, settleMs: 2000 });
    const dom = (() => { try { return typeof r.dom === 'string' ? JSON.parse(r.dom) : r.dom; } catch { return null; } })();
    r.label = step.label;
    r.domParsed = dom;
    results.surfaces.push(r);

    if (r.readyTimeout || r.snapshotError || !r.distinctColors) {
      anyFailed = true;
      log(`    ${step.label.padEnd(34)} DID NOT RENDER — ${r.readyTimeout || r.snapshotError || r.navError}`);
      continue;
    }
    /* The threshold is DERIVED, not chosen: a page that refused to paint reads as the
       negative control did. "More distinct colours than the blank page" is the weakest
       claim that separates them, and every real surface clears it by three orders of
       magnitude, which the printed number lets a reader check. */
    const drew = r.distinctColors > neg.distinctColors;
    if (!drew) anyFailed = true;
    log(`    ${step.label.padEnd(34)} ${statLine(r)}`);
    log(`      ${String(dom?.href || '').replace(BASE, '')}  ·  ${dom?.elements ?? '?'} elements, `
      + `${dom?.svgs ?? '?'} svg, ${dom?.canvases ?? '?'} canvas, ${dom?.textLength ?? '?'} chars of text`);
    log(`      first line on screen: ${JSON.stringify(dom?.headline ?? '')}`);
    if (dom?.errors?.length) log(`      page errors: ${dom.errors.join(' | ')}`);
    log(`      ${drew ? 'DREW' : 'DID NOT DRAW'} — ${r.distinctColors} distinct colours vs ${neg.distinctColors} for a blank page`);
  }

  if (!JSON_OUT) {
    const drew = results.surfaces.filter((r) => r.distinctColors > neg.distinctColors).length;
    log(`\n  WHAT THIS ${anyFailed ? 'DID AND DID NOT SHOW' : 'PROVES'}`);
    if (anyFailed) {
      /* Never print the clearance sentence on a failed run. The whole failure mode this
         script exists to avoid is a confident summary sitting on top of a result that did
         not happen. */
      log(`    ${drew} of ${results.surfaces.length} surfaces drew. The controls passed, so the`);
      log('    harness is sound and the failures above are about the frontend, not the instrument.');
    } else {
      log('    The built frontend renders in WKWebView on this machine, at the surfaces above.');
    }
    log('    It does NOT prove the packaged .app presents a window — a Tauri window is Tauri\'s');
    log('    own Rust code creating an NSWindow and a wry WebView, and this bypasses all of it.');
    log(`    Bitmaps: ${OUT}\n`);
  } else {
    console.log(JSON.stringify(results, null, 2));
  }
  process.exitCode = anyFailed ? 1 : 0;
} finally {
  server.close();
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
}

/* ── THE INDEPENDENT RE-MEASUREMENT ─────────────────────────────────────────────────*/
function crossCheckWithPython(png, swiftResult) {
  const script = `
import json,sys
try:
    from PIL import Image
    import numpy as np
except Exception as e:
    print(json.dumps({"ok":False,"why":"PIL/numpy not installed"})); sys.exit(0)
im=np.asarray(Image.open(${JSON.stringify(png)}).convert('RGB')).astype(float)
lum=0.2126*im[:,:,0]+0.7152*im[:,:,1]+0.0722*im[:,:,2]
print(json.dumps({"ok":True,"mean":float(lum.mean()),"sd":float(lum.std()),
                  "distinct":int(len(np.unique(im.astype('uint8').reshape(-1,3),axis=0)))}))
`;
  let out;
  try {
    out = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 }));
  } catch (e) {
    return { ran: false, why: `python3 unavailable or failed: ${String(e.message || e).slice(0, 120)}` };
  }
  if (!out.ok) return { ran: false, why: out.why };
  // The Swift side prints six decimals; compare at that resolution rather than demanding
  // bit-equality of two different floating-point summation orders.
  const agrees = Math.abs(out.mean - swiftResult.meanLuminance) < 1e-5
    && Math.abs(out.sd - swiftResult.sdLuminance) < 1e-5
    && out.distinct === swiftResult.distinctColors;
  return { ran: true, agrees, mean: out.mean, sd: out.sd, distinct: out.distinct };
}
