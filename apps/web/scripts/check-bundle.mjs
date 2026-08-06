#!/usr/bin/env node
/**
 * Perf budget (FINAL_MASTER_PLAN 5.3 / D2) — the ratchet that keeps the win.
 *
 * Fails the build if the payload an operator waits for regresses past budget.
 * Raw (pre-gzip) KB, dependency-free. Run after `vite build`.
 *
 * ══ WHAT THIS MEASURED BEFORE, AND WHY THAT WAS 57% OF THE ANSWER ══
 *
 * It read `dist/assets/*.js` and nothing else. Everything below was invisible to it,
 * measured at the commit that fixed this — exact bytes, not `du` block sizes, which
 * round to 4KB and inflated every one of these figures on the first pass:
 *
 *   initial JS            835KB   ← the only thing it counted, against 850
 *   blocking CSS          110KB   ← two <link rel=stylesheet> in index.html
 *   preloaded fonts       434KB   ← two <link rel=preload as=font>
 *   ─────────────────────────────
 *   real initial weight  1379KB   ← what a browser actually fetches before paint
 *
 * So it printed "835/850KB" for a 1.38MB first load. CSS is render-blocking and a
 * preloaded font is fetched at the highest priority the platform has — calling either
 * one free is not a rounding error, it is the wrong number.
 *
 * The bigger hole is `public/`. Vite copies it to the dist ROOT, not `dist/assets`, so
 * a 40MB GLB, an HDRI or a texture atlas dropped in `public/` scored ZERO here. Track B
 * (the 3D layer) adds exactly those files, which is why the plan gates that work on
 * this fix: an unmeasured directory is where the payload goes to hide.
 *
 * ══ WHERE THE NUMBERS NOW COME FROM ══
 *
 * `dist/index.html`, not a list of filename prefixes. The prefixes still guard the
 * per-chunk ceiling, but the INITIAL SET is read off the actual document: the entry
 * <script>, every <link rel=modulepreload>, every <link rel=stylesheet>, and every
 * <link rel=preload as=font>. That is the browser's own answer to "what loads first",
 * and it cannot drift out of date the way a hardcoded prefix list can — a renamed
 * chunk would silently match nothing and the old check would have reported 0KB and
 * PASSED. Finding nothing now fails; see ANTI-VACUITY below.
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MAX_CHUNK_KB moved 400 → 440 on 2026-07-31, deliberately, as the price of a
 * 25KB cut to the always-loaded set.
 *
 * `vite.config.ts` stopped forcing lucide-react into one manual `icons` chunk,
 * so page-only icons now ride their own lazy page chunk instead of being
 * downloaded by every operator on every page. Measured effect:
 *
 *   initial   850 → 825KB   ← what an operator actually waits for
 *   index-      385 → 423KB ← it absorbed the shell's own icons
 *
 * The trade is deliberate and the guard's intent survives it: this ceiling was
 * written to prevent "the 500KB-monolith return" (see the header above), and
 * 423KB is comfortably short of that. 440 leaves working room without letting
 * the number drift upward unnoticed — it is still a ratchet, just one notch
 * looser, and the initial budget it bought room in is the tighter constraint.
 *
 * If a future change pushes past 440, the answer is to code-split `index`, not
 * to raise this again.
 */
const MAX_CHUNK_KB = 440;
const MAX_INITIAL_KB = 850;

/**
 * The three budgets that did not exist. Each is set at what was MEASURED when it was
 * introduced plus stated headroom — never at a round number picked because it looked
 * comfortable, because a budget nobody had to measure is a budget nobody defends.
 *
 *   blocking CSS      measured 110KB → 140.  Render-blocking; it delays first paint
 *                     as surely as the entry chunk does.
 *   preloaded fonts   measured 434KB → 440.  6KB of slack, and the tightness is the
 *                     point: the regression this exists to catch is a THIRD preloaded
 *                     font, and it nearly failed to.
 *
 *                     The first draft set this to 528 on the reasoning that the
 *                     JetBrains Mono weights are "~124KB each", so a third would reach
 *                     ~558KB. They are 90-92KB. A third font measures 527KB — ONE
 *                     KILOBYTE UNDER 528 — so the budget would have passed the exact
 *                     regression it was written to stop. Mutation-testing it is what
 *                     found that; the numbers came from `du`, which rounds to 4KB
 *                     blocks and had already inflated every figure in this file.
 *
 *                     At 440 a third preloaded font fails, as it must (527 > 440).
 *                     Fonts are fixed files, so the only legitimate movement is
 *                     re-subsetting the two that are here, and 6KB covers that. A
 *                     bigger change to top-priority payload should need a decision.
 *   passthrough       measured 720KB → 1024. Everything in dist OUTSIDE assets/,
 *                     i.e. all of public/. THIS IS THE 3D AND MEDIA BUDGET. Track B
 *                     will need it raised; raising it is fine, raising it silently is
 *                     not. State the new number, what it bought, and re-measure.
 */
const MAX_BLOCKING_CSS_KB = 140;
const MAX_PRELOADED_FONT_KB = 440;
const MAX_PASSTHROUGH_KB = 1024;

/** How close to MAX_INITIAL_KB counts as worth saying out loud. */
const INITIAL_HEADROOM_WARN_KB = 25;

// Chunks fetched on every page load (not code-split by route). These share the
// stable names assigned in vite.config manualChunks + the Vite entry ("index").
const INITIAL_PREFIXES = ['index-', 'vendor-', 'react-vendor-', 'icons-'];

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const ASSETS = join(DIST, 'assets');

const fail = (msg) => {
  console.error(`✗ perf budget: ${msg}`);
  process.exit(1);
};

let jsFiles;
try {
  jsFiles = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
} catch {
  fail(`no build found at ${ASSETS} — run \`vite build\` first.`);
}

const INDEX_HTML = join(DIST, 'index.html');
if (!existsSync(INDEX_HTML)) fail(`no ${INDEX_HTML} — the initial set is read from it.`);
const html = readFileSync(INDEX_HTML, 'utf8');

const kbOf = (abs) => statSync(abs).size / 1024;
/** A dist-root-relative href from index.html ("/assets/x.js") → absolute path. */
const distPath = (href) => join(DIST, href.replace(/^\//, '').split('?')[0]);

/** Every <link>/<script> tag in the document, as raw strings. */
const tags = html.match(/<(?:link|script)\b[^>]*>/gi) ?? [];
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : undefined;
};

/** Resources index.html declares, split by how the browser treats them. */
const declared = { entryJs: [], moduleJs: [], css: [], fonts: [] };
for (const tag of tags) {
  const rel = (attr(tag, 'rel') ?? '').toLowerCase();
  const as = (attr(tag, 'as') ?? '').toLowerCase();
  const href = attr(tag, 'href') ?? attr(tag, 'src');
  if (!href || !href.startsWith('/')) continue; // inline script, or an external origin
  if (/^<script/i.test(tag)) declared.entryJs.push(href);
  else if (rel === 'modulepreload') declared.moduleJs.push(href);
  else if (rel === 'stylesheet') declared.css.push(href);
  else if (rel === 'preload' && as === 'font') declared.fonts.push(href);
}

/*
 * ══ ANTI-VACUITY ══
 * Every check below is a SUM over a discovered set, and a sum over an empty set is 0,
 * which passes every budget. That is how this class of guard dies: it keeps reporting
 * green while measuring nothing. The previous version was one Vite rename away from
 * exactly that — its four hardcoded prefixes would have matched no file and the
 * initial budget would have read 0/850KB.
 *
 * So the discovery is asserted before it is used. If the document declares no entry
 * script or no stylesheet, this build is not one whose weight is known, and saying so
 * is the only honest outcome.
 */
if (declared.entryJs.length === 0) {
  fail(
    'index.html declares no entry <script> — the initial set could not be read, so ' +
      'every budget below would sum to 0 and pass. Refusing to report a weight this ' +
      'did not measure.',
  );
}
if (declared.css.length === 0) {
  fail(
    'index.html declares no <link rel=stylesheet>. Either the CSS stopped being ' +
      'emitted (a real regression) or the parser stopped recognising it (a broken ' +
      'guard). Both are failures; neither is a pass.',
  );
}
for (const href of [...declared.entryJs, ...declared.moduleJs, ...declared.css, ...declared.fonts]) {
  if (!existsSync(distPath(href))) {
    fail(`index.html references ${href}, which is not in dist. The build is incomplete.`);
  }
}

const sumKb = (hrefs) => hrefs.reduce((s, h) => s + kbOf(distPath(h)), 0);

const failures = [];

// ── 1. Per-chunk ceiling (unchanged): no single JS chunk may become a monolith.
const biggest = jsFiles.map((f) => ({ f, size: kbOf(join(ASSETS, f)) })).sort((a, b) => b.size - a.size)[0];
if (biggest && biggest.size > MAX_CHUNK_KB) {
  failures.push(`largest chunk ${biggest.f} is ${biggest.size.toFixed(0)}KB > ${MAX_CHUNK_KB}KB budget`);
}

// ── 2. Initial JS (unchanged budget, unchanged meaning). Measured from index.html now,
//       but cross-checked against the prefix list: if the two disagree the prefix list
//       has gone stale, and that is worth knowing before it silently reports 0.
const initialJsKb = sumKb([...declared.entryJs, ...declared.moduleJs]);
const prefixJsKb = jsFiles
  .filter((f) => INITIAL_PREFIXES.some((p) => f.startsWith(p)))
  .reduce((s, f) => s + kbOf(join(ASSETS, f)), 0);
if (initialJsKb > MAX_INITIAL_KB) {
  failures.push(`initial JS ${initialJsKb.toFixed(0)}KB > ${MAX_INITIAL_KB}KB budget`);
}

// ── 3. Render-blocking CSS.
const cssKb = sumKb(declared.css);
if (cssKb > MAX_BLOCKING_CSS_KB) {
  failures.push(`render-blocking CSS ${cssKb.toFixed(0)}KB > ${MAX_BLOCKING_CSS_KB}KB budget`);
}

// ── 4. Preloaded fonts — fetched at top priority, so they are initial weight.
const fontKb = sumKb(declared.fonts);
if (fontKb > MAX_PRELOADED_FONT_KB) {
  failures.push(
    `preloaded fonts ${fontKb.toFixed(0)}KB > ${MAX_PRELOADED_FONT_KB}KB budget ` +
      `(${declared.fonts.map((f) => basename(f)).join(', ')})`,
  );
}

// ── 5. Passthrough: everything in dist that is NOT under assets/. This is public/,
//       and it is where a 3D asset lands. Walked recursively — `dist/fonts/` is a
//       subdirectory, and a one-level scan would have missed all 896KB of it.
const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== ASSETS) walk(full, acc);
    } else acc.push(full);
  }
  return acc;
};
const passthrough = walk(DIST).filter((p) => !p.startsWith(ASSETS + '/'));
const passthroughKb = passthrough.reduce((s, p) => s + kbOf(p), 0);
if (passthroughKb > MAX_PASSTHROUGH_KB) {
  const worst = passthrough
    .map((p) => ({ p: p.slice(DIST.length + 1), kb: kbOf(p) }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 5)
    .map((x) => `${x.p} ${x.kb.toFixed(0)}KB`);
  failures.push(
    `public/ passthrough ${passthroughKb.toFixed(0)}KB > ${MAX_PASSTHROUGH_KB}KB budget. ` +
      `Largest: ${worst.join(', ')}. This is the 3D/media budget — raise it deliberately, ` +
      `with the measured number and what it bought, or lazy-load the asset instead of ` +
      `shipping it in public/.`,
  );
}

const realInitialKb = initialJsKb + cssKb + fontKb;
const pageChunks = jsFiles.filter((f) => !INITIAL_PREFIXES.some((p) => f.startsWith(p))).length;

console.log(
  `perf budget · REAL initial ${realInitialKb.toFixed(0)}KB ` +
    `(JS ${initialJsKb.toFixed(0)}/${MAX_INITIAL_KB} · CSS ${cssKb.toFixed(0)}/${MAX_BLOCKING_CSS_KB} · ` +
    `fonts ${fontKb.toFixed(0)}/${MAX_PRELOADED_FONT_KB}) · ` +
    `largest chunk ${biggest ? biggest.size.toFixed(0) : 0}/${MAX_CHUNK_KB} · ` +
    `passthrough ${passthroughKb.toFixed(0)}/${MAX_PASSTHROUGH_KB} · ${pageChunks} lazy page chunks`,
);

if (Math.abs(initialJsKb - prefixJsKb) > 1) {
  console.warn(
    `  ! the prefix list and index.html disagree on the initial JS set ` +
      `(${prefixJsKb.toFixed(0)}KB vs ${initialJsKb.toFixed(0)}KB). index.html wins; ` +
      `INITIAL_PREFIXES is stale and now only guards the per-chunk ceiling.`,
  );
}

const headroom = MAX_INITIAL_KB - initialJsKb;
if (headroom >= 0 && headroom < INITIAL_HEADROOM_WARN_KB) {
  console.warn(
    `  ! initial JS has ${headroom.toFixed(0)}KB of headroom left. The note above records ` +
      `825KB; it is ${initialJsKb.toFixed(0)}KB now. The next page added to the shell ` +
      `fails this build. Code-split \`index\` rather than raising the budget.`,
  );
}

if (failures.length) {
  console.error('✗ perf budget exceeded:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✓ perf budget OK');
