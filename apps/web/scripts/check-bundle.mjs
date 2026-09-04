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
 *
 * ── "CODE-SPLIT `index`" IS NOT ACTIONABLE AS WRITTEN, AND WAS MEASURED ──────────
 * Corrected 2026-08-07, because the advice above and in the near-budget warning below
 * sends the next reader into a change that makes the number WORSE.
 *
 * The 825KB figure recorded above is STALE — it is 835KB now, 15KB from the ceiling.
 * Of that, ≈80KB of source is `src/data/*` regulatory reference PROSE, not code: the
 * `index` chunk is 66% long string literals (286 of 432KiB), and sampling them returns
 * US state licensing narrative. `states.ts` alone is 54.8KB of source.
 *
 * Three fixes were tried against a real build. All three failed, and the order matters
 * because each is the obvious next guess:
 *
 *  1. The `@/data` barrel is unshakable because `ontology.ts` does module-scope work.
 *     NO — `competitors.ts` (76KB) and `productCatalog.ts` (79KB) are both absent from
 *     the shell, so shaking works through the barrel and `ontology.ts` is shaken out.
 *  2. An eager reference anchors it — `Sidebar.tsx` (redFlags) and
 *     `ExtendedInspectors.tsx` (states), both eager via `AppLayout`. NO: severing
 *     `states` left the shell at 431.8KiB with the prose present; severing BOTH left it
 *     at 437KiB with the prose STILL present, and moved initial JS only 835 → 830KB.
 *     5KB is the entire value of that refactor, which is the number that kills it.
 *  3. A `manualChunks` rule for `src/data/` — the advice above. **STRICTLY WORSE.** It
 *     emitted `regulatory-data` at 225KB, and because the shell statically imports it
 *     Vite added a `modulepreload` to index.html, so it counts as INITIAL: 835 → ~902KiB.
 *     It is also larger than the 80KB it was meant to move, because a manual chunk forces
 *     whole modules together and thereby DEFEATS the per-export shaking that had been
 *     correctly dropping `competitors.ts` and `productCatalog.ts`.
 *
 * The real cause is Rollup's shared-module placement: `states.ts` is imported by six or
 * more DYNAMIC chunks (Dashboard, BriefGenerator, OntologyExplorer, StateMap, CommandBody,
 * the competition components) and a module shared across dynamic chunks is hoisted into
 * their common ancestor, which is the entry. Nothing about eagerness is involved, which is
 * exactly why (2) failed twice.
 *
 * SO THE FIX IS NOT A CHUNKING RULE. 54.8KB of prose is not code and does not belong in a
 * JS chunk: move the narrative to a JSON asset fetched by the pages that render it, and
 * leave `states.ts` holding the small structured fields the shell actually looks up
 * (`JurisdictionInspector` does exactly one `states.find` on `abbreviation`). That is a
 * content-medium problem wearing a packaging problem's clothes.
 *
 * ── 4. THE FOURTH ATTEMPT WAS THE ONE ABOVE, AND IT WORKED. 2026-08-13 ──────────────
 *
 * `notes`, `primaryPainPoint` and `sandboxNotes` left `src/data/states.ts` for
 * `src/data/stateNarrative.json`, behind a DYNAMIC `import()` in `src/data/stateNarrative.tsx`.
 * Measured on a real `vite build`, exact bytes:
 *
 *   initial JS        859,446 → 827,750 B    839 → 808KB   (headroom 11 → 42KB)
 *   index chunk       447,059 → 415,363 B    437 → 406KB
 *   largest chunk     the index chunk both times
 *   new lazy chunk    stateNarrative-<hash>.js, 35,269 B, and index.html does NOT
 *                     modulepreload it — that absence is the whole difference from
 *                     attempt 3, which was a static import and therefore initial.
 *   lazy page chunks  192 → 193
 *
 * WHY THIS ONE MOVED 31KB WHERE ATTEMPT 2 MOVED 5KB: attempt 2 severed the two EAGER
 * references and the prose stayed, because eagerness was never what placed it there. Rollup
 * hoists a module shared across dynamic chunks into the entry no matter who else imports it.
 * A dynamic import is a different chunk by construction, so the prose cannot be hoisted into
 * anything. The lever is the module boundary, not the reference graph and not the chunk config.
 *
 * WHAT IS LEFT — AND THE "≈80KB OF src/data PROSE" ABOVE WAS TOO HIGH, SO DO NOT PLAN ON IT.
 * Measured after the split by scanning each `src/data/*.ts` for string literals ≥120 chars and
 * probing the entry chunk for each module's longest literal verbatim (minification does not
 * alter string contents):
 *
 *   in the entry chunk    redFlags 2,304 B · requirements 1,711 · products 1,636 ·
 *                         licenses 1,119 · phases 847 · domains 396  =  8,013 B total
 *   NOT in it             productCatalog 28,509 B · competitors 25,482 · readiness 1,448
 *
 * So `states.ts` was very nearly all of the prose the shell was actually carrying: 31.7KB of
 * it, against 7.8KB spread over six modules with no single win left in them. The 80KB figure
 * counted `productCatalog` and `competitors`, which the same note correctly records as ABSENT
 * from the shell. There is no second 30KB here. The next real cut is elsewhere.
 *
 * WHAT THE 42KB IS FOR: it is headroom for Track B, not a licence to add prose back.
 * `src/data/__tests__/stateNarrative.test.tsx` fails if a prose field returns to `states.ts`,
 * and the four narrative states (loading / fault / no-entry / present-but-empty) are asserted
 * there because a panel that blanks on a failed fetch is the rule-6 failure this trade bought.
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
/* 1024 → 1152 on 2026-09-04 (THE PRODUCTION P6): what it bought is `public/objects/forge.glb`, the Forge as a machined
   mesh (146,716 B, 11,356 triangles, KHR_mesh_quantization) plus its .render.json sidecar — fetched lazily by the
   sign-in Forge after its first frame, never preloaded, so initial weight is unchanged. Measured before: 867 KB. */
const MAX_PASSTHROUGH_KB = 1152;

/** How close to MAX_INITIAL_KB counts as worth saying out loud. */
const INITIAL_HEADROOM_WARN_KB = 25;

// Chunks fetched on every page load (not code-split by route). These share the
// stable names assigned in vite.config manualChunks + the Vite entry ("index").
/* The hardcoded INITIAL_PREFIXES list was retired 2026-09-04: it read 762 KB against index.html's 760 and the checker
   itself said "index.html wins". The initial set is exactly what index.html declares; the lazy page chunks are
   everything else in assets/. One source of truth, and it cannot go stale. */

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
//       the set index.html declares is the initial set — nothing else is a source of truth for it.
const initialJsKb = sumKb([...declared.entryJs, ...declared.moduleJs]);
const initialJsNames = new Set([...declared.entryJs, ...declared.moduleJs].map((h) => basename(h)));
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
const pageChunks = jsFiles.filter((f) => !initialJsNames.has(f)).length;

console.log(
  `perf budget · REAL initial ${realInitialKb.toFixed(0)}KB ` +
    `(JS ${initialJsKb.toFixed(0)}/${MAX_INITIAL_KB} · CSS ${cssKb.toFixed(0)}/${MAX_BLOCKING_CSS_KB} · ` +
    `fonts ${fontKb.toFixed(0)}/${MAX_PRELOADED_FONT_KB}) · ` +
    `largest chunk ${biggest ? biggest.size.toFixed(0) : 0}/${MAX_CHUNK_KB} · ` +
    `passthrough ${passthroughKb.toFixed(0)}/${MAX_PASSTHROUGH_KB} · ${pageChunks} lazy page chunks`,
);


const headroom = MAX_INITIAL_KB - initialJsKb;
if (headroom >= 0 && headroom < INITIAL_HEADROOM_WARN_KB) {
  console.warn(
    `  ! initial JS has ${headroom.toFixed(0)}KB of headroom left (${initialJsKb.toFixed(0)}KB ` +
      `of ${MAX_INITIAL_KB}). The next page added to the shell fails this build.\n` +
      `    Do NOT reach for a manualChunks rule — that was measured at ~902KB, WORSE. What ` +
      `worked (2026-08-13, 31KB) was moving PROSE out of a shared data module and behind a ` +
      `dynamic import: \`states.ts\` → \`stateNarrative.json\`. Do not expect a repeat: only ` +
      `8KB of \`src/data/*\` prose is still in the shell, measured. See the note above ` +
      `MAX_CHUNK_KB for all four attempts and where the bytes actually are.`,
  );
}

if (failures.length) {
  console.error('✗ perf budget exceeded:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✓ perf budget OK');
