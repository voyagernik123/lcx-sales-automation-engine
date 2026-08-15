/*
 * THE APP SWEEP — the same four axes as `scripts/3d-audit.mjs`, run against apps/web instead of docs/3d.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────
 * `scripts/3d-audit.mjs` sweeps reduced motion, print, no-WebGL, a lost context and the quality ladder over
 * every `docs/3d/eN/live.html`. Every one of those checks runs against a STATIC HARNESS PAGE. None of it runs
 * against `apps/web`, which is where the eight relief surfaces actually ship — so the programme's audit has
 * always been an audit of the laboratory.
 *
 * That gap has already cost two concrete things:
 *
 *   · Nothing in `apps/web` had ever exercised the refusal path. All seven relief component tests stop at the
 *     Suspense fallback, so no renderer effect had ever run in a test — jsdom has no WebGL.
 *   · `components/__tests__/reliefPrintPath.test.tsx:37-48` names two print questions no test in the repo can
 *     answer, both for the same reason: jsdom does not evaluate `@media print` and rasterises nothing.
 *
 * A real browser can answer both. This file is that browser.
 *
 * ── WHY A SEPARATE DRIVER RATHER THAN AN EXTENSION OF `3d-audit.mjs` ─────────────────
 * Three reasons, in order of weight:
 *
 *   1. THE TWO SWEEPS DRIVE A PAGE DIFFERENTLY, AND NOT BY A LITTLE. A harness is one static file with a
 *      control surface built into its query string: `?refuse=1` takes the real refusal branch, `?tier=minimum`
 *      picks a rung, `?frames=6` sets the timing loop, and `document.title === 'READY'` is the readiness
 *      signal. The app has NONE of that. Reaching a relief surface means seeding a persisted operator session,
 *      replacing the network for the route's own endpoints, finding a button by its accessible name, checking
 *      it is not `aria-disabled`, clicking it, and then waiting on `canvas.dataset.qualityTier` — which two of
 *      the eight surfaces never set (see the TIER STAMP column). Sharing one loop between those two shapes
 *      means a parameter matrix in place of a sweep.
 *   2. THEIR PREREQUISITES ARE DIFFERENT AND SO ARE THEIR FAILURES. The harness sweep needs each `build.mjs`
 *      to have run; this needs a Vite dev server. Folded together, a stale harness bundle would take the app
 *      report down with it and leave BOTH files on disk describing a run that did not happen.
 *   3. TWO GENERATORS MUST NOT WRITE ONE FILE. `docs/3d/e9/README.md` is generated, and its whole argument is
 *      that it cannot go stale because it is rewritten from a live sweep. A second writer makes its contents
 *      depend on which script ran last — which is the failure it exists to prevent. So this writes its own
 *      output file, and `3d-audit.mjs` now states in its generated README that the app is out of its scope and
 *      names this file.
 *
 * ── WHAT IS AUDITED HERE, AND WHY THESE FOUR ────────────────────────────────────────
 * Only axes that a real browser can settle and the component tests structurally cannot:
 *
 *   · PRINT. jsdom applies no `@media print`. This emulates print media on a page whose relief is ON — the one
 *     configuration `reliefPrintPath.test.tsx` says is unverified anywhere — and also renders the PDF, so
 *     "does a drawn canvas reach paper" stops being an argument about `preserveDrawingBuffer`.
 *   · REDUCED MOTION. The components are documented as rendering one frame and stopping. The harness sweep
 *     wraps `requestAnimationFrame` on the live page to check the same claim, and reports the result as
 *     VACUOUS because no harness animates. One app surface DOES animate — `ForgeBackdrop` runs a five-second
 *     arc on the sign-in route — so here the check is not vacuous, and the no-preference control run below is
 *     what proves the counter works before any zero from it is believed.
 *   · CONTEXT LOSS. The app's recovery path is different code from the harness's: each `*ReliefGl` registers
 *     `webglcontextlost` on its own canvas and calls the wrapper's `onRefused`, which sets `wantRelief` back
 *     to false. That branch has never run in any test.
 *   · THE GL CONTEXT COUNT. `components/__tests__/glContextBudget.test.ts` pins the worst route at 3 by
 *     walking the import graph. A count of real contexts in a real browser is strictly stronger, and it is
 *     the one number in this programme where the static and dynamic answers can be compared.
 *
 * ── WHAT THIS SWEEP DELIBERATELY DOES NOT CLAIM ─────────────────────────────────────
 *   · It is not a perf sweep. Every frame here is SwiftShader, for the reason `docs/3d/e9/README.md` gives at
 *     length: the ratio between a CPU rasteriser and real hardware is not a constant, so a frame time from
 *     here describes a machine nobody ships on. No timing column exists in the output on purpose.
 *   · It is not a data test. Where a route needs seeded data, the network is replaced with the smallest
 *     fixture that makes the surface DRAWABLE, and nothing below asserts a number that came out of it. A
 *     check on its own fixture teaches nothing.
 *   · A surface it could not reach is reported as NOT REACHED on every axis, never as a pass. The whole point
 *     of the gap this file closes is that never-ran is not the same as ran-and-found-nothing.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');
/*
 * WHERE THE OUTPUT LANDS, REDIRECTABLE FOR ONE REASON: PROVING DETERMINISM NEEDS SEVERAL RUNS SIDE BY SIDE.
 * The claim "this sweep now produces the same numbers whenever it runs" cannot be checked by a sweep that
 * overwrites its own evidence, so `APP_SWEEP_OUT_DIR=<dir>` puts a whole run — both reports and every
 * capture — somewhere it can be diffed against another. Unset, nothing about the paths changes.
 */
const OUT_DIR = process.env.APP_SWEEP_OUT_DIR ?? join(ROOT, 'docs/3d');
const OUT = join(OUT_DIR, 'APP_SWEEP.md');
/* Captures live beside the report, and only for the one question bytes could not settle — see the E8 branch of
   the context-loss axis, where a DOM-only reading produced a finding the pixels then withdrew. */
const SHOTS = join(OUT_DIR, 'app-sweep');
/* THE THEME PASS writes its own report and its own captures, for the reason this file's header already gives
   about `docs/3d/e9/README.md`: two generators must not write one file. */
const THEME_OUT = join(SHOTS, 'README.md');
const THEME_SHOTS = join(SHOTS, 'theme');
const PORT = Number(process.env.APP_AUDIT_PORT ?? 5188);
const BASE = `http://127.0.0.1:${PORT}`;

/* Run only the theme capture pass, leaving `docs/3d/APP_SWEEP.md` exactly as it was. Used when the four axes
   are somebody else's run in flight and only the theme half is wanted. */
const THEME_ONLY = process.env.APP_SWEEP_THEME_ONLY === '1';
const SKIP_THEME = process.env.APP_SWEEP_SKIP_THEME === '1';

/*
 * ══ THE PALETTE, PARSED FROM THE SOURCE OF TRUTH RATHER THAN RETYPED HERE ═════════════
 *
 * The theme pass has to answer "are the data marks still distinguishable from the scenery", and that needs a
 * rule for telling a data pixel from a scenery pixel. A hand-written list of hexes in this file would be the
 * exact failure this programme keeps catching: it cannot fail on the colour nobody thought of, and it goes
 * stale the day `theme.ts` gains a field.
 *
 * So the taxonomy is DERIVED, and derived the same way `look/semantic.ts:203` derives it — a `BRAND_HEX` key
 * is SCENERY if a `SceneTheme` field has the same name, and DATA otherwise. That yields exactly the split
 * `theme.ts`'s header states (data: brand, brandBright, brandDeep, reference, refusal; scenery: rule, plate)
 * without this file asserting it, so a future edit that moves a colour across the line moves this classifier
 * with it.
 *
 * Parsed with a regex rather than imported because these are TypeScript modules and this is a plain `.mjs`
 * driver. That is a real weakness — a regex can silently match nothing — so the parse REFUSES rather than
 * returning an empty set, and the counts it demands are stated below.
 */
const CHROMA = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
const HEX_RGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function derivePalette() {
  const themeSrc = readFileSync(join(ROOT, 'packages/gl/src/look/theme.ts'), 'utf8');
  const colourSrc = readFileSync(join(ROOT, 'packages/gl/src/look/colour.ts'), 'utf8');

  /* The two theme blocks, split on the `light:` key so a hex cannot be attributed to the wrong theme. */
  const cut = themeSrc.indexOf('light: Object.freeze({');
  if (cut < 0) refusePalette('could not find the `light:` block in look/theme.ts');
  const halves = { dark: themeSrc.slice(0, cut), light: themeSrc.slice(cut) };
  const scenery = {};
  const sceneFields = new Set();
  for (const [name, src] of Object.entries(halves)) {
    /*
     * `field: '#RRGGBB'`, ANCHORED TO A LINE OF ITS OWN.
     *
     * This regex used to be `(\w+):\s*hexToLinear\('(#…)'\)`, because that was the literal shape of
     * `SceneTheme`'s fields. `look/theme.ts` then moved every hex into an `AUTHORED_HEX` table and passed
     * it through `toAlbedo`/`toRadiance` — and the parse matched nothing, so this whole sweep REFUSED on
     * every invocation from that commit onwards. The refusal did its job: no number was invented. But it
     * also means nothing between that commit and this one could regenerate either report, and the versions
     * on disk describe a tree that no longer exists.
     *
     * Anchored with `^\s*…$` rather than matched anywhere, because the header of that file discusses hexes
     * in prose and an unanchored match would take a colour out of a comment and put it in the taxonomy.
     */
    scenery[name] = [...src.matchAll(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})',?\s*$/gm)]
      .map((m) => ({ field: m[1], hex: m[2].toUpperCase() }));
    for (const s of scenery[name]) sceneFields.add(s.field);
    /* Six colour-valued fields per theme today. Five is the floor at which the derivation is still meaningful;
       below it the regex has clearly stopped matching and a threshold built on it would be fiction. */
    if (scenery[name].length < 5) refusePalette(`only ${scenery[name].length} scenery colours parsed for the ${name} theme`);
  }

  const brand = [...colourSrc.matchAll(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})',/gm)]
    .map((m) => ({ key: m[1], hex: m[2].toUpperCase() }));
  if (brand.length < 7) refusePalette(`only ${brand.length} BRAND_HEX entries parsed from look/colour.ts`);
  const data = brand.filter((b) => !sceneFields.has(b.key));
  if (data.length < 5) refusePalette(`only ${data.length} DATA colours survived the scenery split`);

  /*
   * THE CHROMA FLOOR, and it is a derived number with a stated blind spot rather than a magic constant.
   *
   * Every scenery colour in both themes is a desaturated blue-grey; the data hues are not. So the floor is the
   * most saturated scenery colour anywhere in either theme, plus a margin. Anything above it cannot be a
   * scenery colour rendered flat — which is what makes the classifier's DARK run usable as a control.
   *
   * WHAT IT CANNOT SEE, stated because a classifier's blind spot is part of its reading: `refusal` is
   * deliberately desaturated ("reads as no measurement, never as a low value"), so it sits BELOW the floor and
   * is counted as scenery. That is named in the generated report rather than left for someone to discover.
   */
  const allScenery = [...scenery.dark, ...scenery.light, ...brand.filter((b) => sceneFields.has(b.key))];
  const maxSceneryChroma = Math.max(...allScenery.map((s) => CHROMA(HEX_RGB(s.hex))));
  const chromaFloor = maxSceneryChroma + 8;
  return {
    scenery, data, chromaFloor, maxSceneryChroma,
    dataVisible: data.filter((d) => CHROMA(HEX_RGB(d.hex)) >= chromaFloor),
    dataBlind: data.filter((d) => CHROMA(HEX_RGB(d.hex)) < chromaFloor),
  };
}
function refusePalette(why) {
  console.error(`  REFUSED: the data/scenery taxonomy could not be derived from the source — ${why}.`);
  console.error('  A classifier built on an empty parse would call every pixel data and report a separation');
  console.error('  that means nothing. Nothing written.');
  process.exit(1);
}

/*
 * ══ THE FROZEN CLOCK, AND WHY EVERY FIGURE THIS FILE EVER PRINTED IS SUSPECT WITHOUT IT ══════════════
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────
 * Three of the eight surfaces read the READER'S WALL CLOCK and draw the answer, so this sweep's numbers
 * were a function of the hour it happened to run at. Grepped from the renderers rather than listed here —
 * `sourcesReadingTheClock()` below regenerates the list on every run — but the three today are:
 *
 *   · E2 `GlobeReliefGl.tsx`  — `const now = Date.now()` feeds `subSolarPoint`, so the SUN DIRECTION and
 *     therefore the terminator on the sphere is aimed by the clock. The lit limb is most of the frame.
 *   · E3 `PipelineRelief.tsx` — `useState(() => Date.now())` feeds `buildChannel`, whose movement axis is
 *     DAYS SINCE `updatedAt`, so every object's position along it moves as the fixture ages.
 *   · E6 `VaultReliefGl.tsx`  — `buildVaultRecords(entries, Date.now())` turns each row into `hoursAgo`.
 *     The corridor normalises on the RANGE, so the geometry survives; the projected labels and the depth
 *     ruler are absolute ages and do not.
 *
 * And one that a clock freeze CANNOT close, found by the same census once it followed imports: E4's
 * `orrery/orreryLayout.ts` bounds its viewpoint search on a 400 ms WALL-CLOCK DEADLINE, so its geometry is
 * a function of how fast this machine is. The generated report carries it as an open finding.
 *
 * That was not a theoretical hazard. It surfaced because an audit and a skeptic reached opposite verdicts
 * about E2 on one unchanged commit and BOTH WERE RIGHT — the sweeps had run at different hours. Nothing in
 * this comment is offered as the measurement: `APP_SWEEP_CLOCK` drives the instant, so the effect is
 * reproducible on demand and the numbers belong in a run's output rather than in a comment.
 *
 * ── THE INSTANT, AND IT IS DERIVED RATHER THAN CHOSEN TO SUIT ───────────────────────
 * A frozen clock can lie in the other direction: an instant that puts the terminator off the visible face
 * makes the globe an evenly-lit ball, which is a surface that has stopped being looked at rather than one
 * that passed. So the instant is fixed by two properties of the frame, both checkable, and
 * `checkFrozenInstant()` re-derives them from the app's own source on every run and prints what it got:
 *
 *   1. THE TERMINATOR RUNS DOWN THE MIDDLE OF THE FRAME. `GlobeReliefGl` aims its camera at
 *      `centralMeridian([HUB.lon, ...sites])`, and the day/night boundary is 90° from the sub-solar point.
 *      So the sub-solar longitude is put at meridian + 90: the hub at Vaduz is in daylight, the US site is
 *      in night, and the boundary between them crosses the centre of the disc. That is the reading this
 *      surface exists to draw ("which desks are awake"), presented at the one instant where it is hardest
 *      to miss and where both populations of pixels — lit earth and unlit earth — are at their largest.
 *   2. THE DECLINATION IS ZERO. `subSolarPoint`'s cosine puts the sun over the equator on day-of-year 264,
 *      21 September. At a solstice one pole is lit outright and the other dark, which would move the two
 *      northern sites' illumination by the SEASON as well as the hour; at the equinox the terminator is
 *      exactly a meridian, so where it falls is set by the time of day and nothing else.
 *
 * The seconds field is what carries the first property, so it is not a round number and must not be
 * tidied into one. It is also a FUTURE date relative to the sweep that installed it, which is deliberate
 * and load-bearing: see the fixture anchor below.
 *
 * ── WHAT IS NOT FROZEN, STATED BECAUSE IT IS THE NEXT QUESTION ──────────────────────
 * `performance.now()` runs normally. Freezing it would stop `requestAnimationFrame`, ForgeBackdrop's arc
 * and every renderer's own loop — turning the reduced-motion axis's control run, the one check that makes
 * every zero in this file mean anything, into a guaranteed zero. The animation PHASE is held fixed a
 * different way, by `settleForCapture()`: pixels are read only once the draw counters have stopped.
 */
const FROZEN_AT_ISO = process.env.APP_SWEEP_CLOCK ?? '2026-09-21T07:18:41.000Z';
const FROZEN_AT = Date.parse(FROZEN_AT_ISO);
if (!Number.isFinite(FROZEN_AT)) {
  console.error(`  REFUSED: APP_SWEEP_CLOCK=${process.env.APP_SWEEP_CLOCK} is not a date.`);
  process.exit(1);
}
/* One seed for every entropy tap in the page. Fixed, not derived from the clock: a seed that moved with the
   instant would make the two knobs impossible to separate when a number does move. */
const FROZEN_SEED = 0x5CE7A1;

/*
 * THE ENVIRONMENT FREEZE, AND IT IS THE FIRST INIT SCRIPT ON EVERY PAGE.
 *
 * Order is the whole point: `index.html`'s pre-hydration script runs at document-start and the app's module
 * graph runs immediately after, so a clock installed after either has already been read around. Registered
 * before the seat, before the theme seed and before the probe by `openPage()`, which is the only place in
 * this file that opens a page.
 *
 * A PROXY RATHER THAN A SUBCLASS. `class extends Date` throws when something calls `Date()` without `new`
 * — which real `Date` answers with a string — and loses nothing else. A proxy keeps `Date.parse`,
 * `Date.UTC`, `Date.prototype` and every `instanceof` intact, and intercepts exactly the two things that
 * read the machine: the no-argument constructor and `Date.now`. `Date.parse('…')` is pure and is left
 * alone, which matters because the fixtures below are parsed by the app.
 */
const FREEZE_ENV = (f) => {
  const w = /** @type {any} */ (globalThis);
  const RealDate = w.Date;
  w.Date = new Proxy(RealDate, {
    apply: () => new RealDate(f.at).toString(),
    construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [f.at] : args, newTarget),
    get: (target, prop, recv) => (prop === 'now' ? () => f.at : Reflect.get(target, prop, recv)),
  });
  /*
   * THE OTHER TAP. Nothing on these eight routes was observed to call `Math.random` into a frame, but a
   * seeded generator costs one function and closes the axis rather than arguing about it — and an
   * unaudited `Math.random` is indistinguishable in a report from a clock that was missed. mulberry32:
   * one 32-bit state, no dependencies, the same sequence on every run.
   */
  let s = f.seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rnd;
  /* The two entropy taps that are not `Math.random`. `crypto.subtle` is untouched — it is not a source of
     randomness on its own and replacing it would break more than it fixes. */
  try {
    if (w.crypto) {
      w.crypto.getRandomValues = (arr) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(rnd() * 256);
        return arr;
      };
      w.crypto.randomUUID = () => {
        const h = [];
        for (let i = 0; i < 16; i += 1) h.push(Math.floor(rnd() * 256));
        h[6] = (h[6] & 0x0f) | 0x40; h[8] = (h[8] & 0x3f) | 0x80;
        const x = h.map((b) => b.toString(16).padStart(2, '0'));
        return `${x.slice(0, 4).join('')}-${x.slice(4, 6).join('')}-${x.slice(6, 8).join('')}-${x.slice(8, 10).join('')}-${x.slice(10).join('')}`;
      };
    }
  } catch { /* a locked-down `crypto` is not worth failing a sweep over; reported by the census, not here */ }
};

/*
 * ── THE INSTANT'S TWO PROPERTIES, RE-DERIVED FROM THE APP'S SOURCE ON EVERY RUN ──────
 *
 * A constant with a paragraph beside it is prose. The paragraph above claims the terminator crosses the
 * centre of the globe's frame, and that claim depends on THREE things this file does not own: the hub's
 * coordinates, the region table, and which regions the fixture actually populates. So all three are read
 * back and the property is recomputed.
 *
 * It does not exit the sweep when it drifts — a globe aimed two degrees off says nothing about the other
 * seven surfaces — but the deviation is carried into both generated reports, so an instant that has
 * stopped meaning what it says cannot go unnoticed. The PARSE failing is different and does refuse: a
 * regex that matched nothing would report a deviation of zero, which is the shape of check this whole
 * programme exists to refuse.
 */
function checkFrozenInstant(fixtureRegions) {
  const src = readFileSync(join(ROOT, 'apps/web/src/components/market/globeSites.ts'), 'utf8');
  const hub = /export const HUB = \{[^}]*?lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/s.exec(src);
  const sites = [...src.matchAll(/key:\s*'(\w+)',\s*\n\s*label:[^\n]*\n\s*lat:\s*(-?[\d.]+),\s*\n\s*lon:\s*(-?[\d.]+)/g)]
    .map((m) => ({ key: m[1], lon: Number(m[3]) }));
  if (hub === null || sites.length < 2) {
    console.error('  REFUSED: could not read HUB and REGION_SITES out of globeSites.ts, so the frozen '
      + `instant's stated property cannot be checked (hub ${hub === null ? 'no' : 'yes'}, `
      + `${sites.length} sites parsed). A check that cannot fail would report a deviation of zero.`);
    process.exit(1);
  }
  /* Exactly the set `buildGlobeBook` places: REGION_SITES order, only the keys the fixture carries. */
  const placed = sites.filter((s) => fixtureRegions.has(s.key));
  const lons = [Number(hub[2]), ...placed.map((s) => s.lon)];
  let x = 0, y = 0;
  for (const lon of lons) { const r = (lon * Math.PI) / 180; x += Math.cos(r); y += Math.sin(r); }
  const meridian = (Math.atan2(y, x) * 180) / Math.PI;

  /* `subSolarPoint`'s own arithmetic, on the frozen instant. */
  const d = new Date(FROZEN_AT);
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (doy + 10));
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let subSolarLon = -15 * (utcHours - 12);
  while (subSolarLon > 180) subSolarLon -= 360;
  while (subSolarLon <= -180) subSolarLon += 360;
  let offBy = subSolarLon - (meridian + 90);
  while (offBy > 180) offBy -= 360;
  while (offBy <= -180) offBy += 360;
  return {
    meridian, subSolarLon, declination, offBy, doy, placed: placed.map((s) => s.key),
    /* One degree of longitude is four minutes of daylight at the terminator, and `subSolarPoint`'s own
       header already declares a ±4° bound from the equation of time it does not model. A deviation inside
       that bound is smaller than the model's own error and is not worth a caveat. */
    holds: Math.abs(offBy) <= 1 && Math.abs(declination) <= 0.5,
  };
}

/*
 * ══ WHICH TREE WAS SWEPT — provenance, because "run it again" is this file's whole answer ═══════════
 *
 * FOUND THE HARD WAY, ON THE RUN THAT INSTALLED THE FREEZE. Two consecutive sweeps of what was believed to
 * be one commit disagreed about E4, and the cause was that another change had landed in
 * `components/geometry/orrery/orreryLayout.ts` BETWEEN them. Nothing in either report recorded which
 * source it had read, so the two files sat side by side describing different code and looking like
 * evidence of non-determinism.
 *
 * A date stamp does not answer this and neither does a commit id on a working tree somebody is editing. So
 * every run digests the source the dev server actually serves and prints it: two reports carrying the same
 * digest were swept over identical bytes, and two carrying different digests may not be compared at all.
 *
 * `__tests__` is excluded deliberately — it is not served to the browser, and a test landing mid-sweep
 * would otherwise invalidate a comparison it cannot affect.
 */
const SOURCE_ROOTS = ['apps/web/src', 'apps/web/index.html', 'packages/gl/src'];
function sourceFingerprint() {
  const files = [];
  const walk = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) {
      for (const e of readdirSync(p).sort()) {
        if (e === 'node_modules' || e === '__tests__' || e.startsWith('.')) continue;
        walk(join(p, e));
      }
    } else if (/\.(ts|tsx|css|html|json|glsl)$/.test(p)) files.push(p);
  };
  for (const r of SOURCE_ROOTS) walk(join(ROOT, r));
  const h = createHash('sha256');
  /* REPOSITORY-RELATIVE PATHS, so the digest is a fact about the source and not about where somebody
     checked it out. Hashing the absolute path would give two machines different digests for identical
     bytes, which is the opposite of what a provenance line is for. */
  for (const f of files) { h.update(f.slice(ROOT.length + 1)); h.update('\0'); h.update(readFileSync(f)); }
  return { files: files.length, digest: h.digest('hex').slice(0, 12) };
}

/*
 * WHICH RENDERERS READ THE WALL CLOCK — GREPPED, NOT LISTED, for the same reason the theme binding is
 * grepped: a sentence naming files is true when typed and false the day another starts reading a clock.
 *
 * ONE HOP THROUGH THE IMPORTS, WHICH IS A CORRECTION AND NOT A REFINEMENT. The first version searched only
 * the wrapper and the renderer, and it reported E4 OntologyOrrery as reading no clock. E4's frame is
 * decided by `orrery/orreryLayout.ts`, one import away, where a viewpoint search runs against a 400 ms
 * WALL-CLOCK DEADLINE — so the census said "clean" about the one surface in this sweep whose geometry is a
 * function of how fast the machine is. A census that cannot see one file past the entry point is a census
 * of file names.
 *
 * THE MATCHERS ARE CONTROLLED. A regex that matched nothing would print an empty census, which reads
 * exactly like a codebase with no clock reads in it — the same failure the palette parse refuses on. So
 * each is run against a known-positive and a known-negative string first, and refuses if either is wrong.
 */
const localImports = (from, src) => {
  const out = [];
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    let base;
    if (spec.startsWith('@/')) base = join('src', spec.slice(2));
    else if (spec.startsWith('.')) base = normalize(join(dirname(from), spec));
    else continue;
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (existsSync(join(WEB, base + ext))) { out.push(base + ext); break; }
    }
  }
  return out;
};
const CLOCK_READ = /(Date\.now\(\)|new Date\(\s*\))/;
/*
 * AND THE ONE THE FREEZE CANNOT CLOSE: A MEASURED FRAME TIME RENDERED INTO THE PAGE.
 *
 * `GlobeReliefGl` prints "`N.NN` ms for this frame" into its own caption. That is a real measurement of
 * this machine on this run and it is CORRECT that it moves — but it lands in the DOM, which means E2's
 * viewport capture can never be byte-identical twice however still the clock is held. Grepped rather than
 * named, so a second surface that starts printing one appears here rather than being discovered by
 * somebody diffing two captures and doubting the freeze.
 */
const FRAME_TIME_PRINTED = /`[^`]*\$\{[^}]*toFixed\([^)]*\)[^}]*\}\s*ms\b/;
/* A COMPARISON against `performance.now()` is a wall-clock deadline: whatever it bounds does more work on a
   fast machine than on a slow one, and produces a different answer. A bare read is a stopwatch and is not. */
const WALL_CLOCK_DEADLINE = /performance\.now\(\)\s*[<>]/;
function sourcesReadingTheClock(surfaces) {
  const controls = [
    [CLOCK_READ, 'const now = Date.now();', 'Date.parse(iso)'],
    [FRAME_TIME_PRINTED, '`${msFrame.toFixed(2)} ms for this frame`', '`${n.toFixed(2)} triangles`'],
    [WALL_CLOCK_DEADLINE, 'if (performance.now() > deadline) break;', 'const t0 = performance.now();'],
  ];
  for (const [re, yes, no] of controls) {
    if (!re.test(yes) || re.test(no)) {
      console.error(`  REFUSED: the source matcher ${re} failed its own controls, so an empty census below `
        + 'would be indistinguishable from a codebase that samples nothing. Nothing written.');
      process.exit(1);
    }
  }
  const out = [];
  for (const s of surfaces) {
    /* The entry points, plus every local module they import. One hop, not the whole graph: it is what
       catches a helper that owns the frame without dragging in the design system. */
    const files = new Set([s.file, s.glFile]);
    for (const seed of [...files]) {
      let src = '';
      try { src = readFileSync(join(WEB, seed), 'utf8'); } catch { continue; }
      for (const f of localImports(seed, src)) files.add(f);
    }
    const hits = [], printsFrameTime = [], deadlines = [];
    let animates = false;
    for (const rel of files) {
      let src = '';
      try { src = readFileSync(join(WEB, rel), 'utf8'); } catch { continue; }
      animates = animates || /performance\.now\(\)/.test(src);
      src.split('\n').forEach((line, i) => {
        /* Comments are where this programme's own prose about the clock lives, and a census that counted
           them would report a surface as clock-driven for describing the problem. */
        const code = line.replace(/^\s*(\*|\/\/|\/\*).*$/, '');
        if (CLOCK_READ.test(code)) hits.push({ rel, line: i + 1, text: code.trim().slice(0, 72) });
        if (WALL_CLOCK_DEADLINE.test(code)) deadlines.push({ rel, line: i + 1 });
        if (FRAME_TIME_PRINTED.test(line)) printsFrameTime.push({ rel, line: i + 1 });
      });
    }
    out.push({ id: s.id, name: s.name, scanned: files.size, hits, animates, printsFrameTime, deadlines });
  }
  return out;
}

/*
 * THE SEAT, COPIED IN PRINCIPLE FROM `apps/web/e2e/seat.ts` AND NOT IMPORTED FROM IT.
 *
 * That file is a Playwright-test module in another workspace and lives behind `@playwright/test`'s fixture
 * machinery; importing it from a plain script drags the runner in. What is copied is only the SHAPE of the
 * persisted session, and the two constraints its header records the hard way are both load-bearing here:
 *
 *   · `lcx_operator_email` must be written FIRST, because it scopes every other key (`lib/persistence.ts`).
 *     Written second, the operator record lands under the `anon` scope and the guard redirects to /select.
 *   · `version: 3` exactly. `useOperatorStore`'s `migrate()` unconditionally returns `{ operator: null }`, so
 *     any other version wipes the seat and every route below lands on the sign-in gate with no clue why.
 *
 * `addInitScript`, not an `evaluate` after `goto`: the store reads localStorage during module init, so a write
 * after navigation arrives after the guard has already decided.
 */
const SEAT = {
  email: 'nik@lcx.com',
  operator: {
    id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'approver',
    initials: 'N', colorVar: 'var(--chart-1)',
  },
};

/*
 * AGES ARE ANCHORED TO THE FROZEN CLOCK, AND THAT IS A SECOND DRIFT CLOSED RATHER THAN A TIDY-UP.
 *
 * The parameter is named `msAgo` and every caller uses it that way — `auditRow(i)` is "i hours ago",
 * `lead(i)` is "i days ago". But "ago" is relative to a now that moves, and this was anchored to a FIXED
 * calendar date. So the ages these fixtures expressed grew by one day per day: on the sweep that installed
 * this freeze, `auditRow`'s rows were not 0-17 hours old, they were 40 DAYS old, and E6's depth ruler had
 * collapsed from four ticks to one because no candidate age fell inside the span. E3's movement axis is
 * days-since-`updatedAt` and had drifted the same way.
 *
 * Anchoring to the frozen instant is what makes the parameter mean what it is named. The consequence is
 * that the frozen instant must not be EARLIER than the fixtures it anchors — `buildVaultRecords` refuses a
 * row as TIMESTAMP_AHEAD_OF_NOW — which is trivially satisfied now that they are the same number.
 */
const iso = (msAgo) => new Date(FROZEN_AT - msAgo).toISOString();
const envelope = (data, meta) => ({
  status: 200,
  contentType: 'application/json',
  /* The dev server is same-origin for these paths (see `forcedApiBase` below), so this header is belt and
     braces rather than load-bearing — but it costs nothing and a future absolute API base would need it. */
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ data, meta: meta ?? { timestamp: new Date(0).toISOString() } }),
});

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────────
 * Each one is the SMALLEST payload that makes its surface drawable, and nothing in the report is read off
 * any of them. Shapes mirror `apps/web/src/lib/api/*.ts`; a drifted shape shows up as NOT REACHED with the
 * page's own refusal text beside it, which is the failure mode to want.
 */
const lead = (i) => ({
  id: `audit-lead-${i}`, name: `PROBE CHAIN ${String(i).padStart(2, '0')}`, ticker: `PC${i}`, website: null,
  source: 'audit', chain: 'ethereum', jurisdiction: 'US', category: 'defi', listedOnLcx: false,
  euScore: 40 + i, usPreScore: 35 + i, usPostScore: 45 + i, band: 'watch',
  marketCapUsd: 250_000 + i * 40_000, peopleCount: 2, verifiedContactCount: 1, tier: 'tracked',
  createdAt: iso(90 * 86_400_000), updatedAt: iso(i * 86_400_000), hasContact: true, marketTag: null,
});
const mapPoint = (i) => ({
  id: `audit-map-${i}`, name: `MAP PROJECT ${i}`, ticker: `MP${i}`, marketCapUsd: 1e6 + i * 1e5,
  volume24hUsd: 5e4 + i * 1e3, priceChange30d: 0.1, category: 'defi', region: i % 2 ? 'us' : 'eu',
  listedOnLcx: false, exchangeCount: i % 4, band: 'watch', priorityScore: 1 + i, propensityScore: 1 + i,
  euScore: 50, usPreScore: 40, usPostScore: 45, recommendedMarket: 'eu',
});
const auditRow = (i) => ({
  id: `audit-row-${i}`, actor: 'n.sharma', action: i % 3 === 0 ? 'lead_score' : 'campaign_publish',
  entity: 'projects', entityId: `0191abcd-ef01-2345-6789-abcdef0123${String(i).padStart(2, '0')}`,
  meta: {}, projectName: `Aster ${i}`, createdAt: iso(i * 3_600_000),
});

const COMMAND_OVERVIEW = {
  generatedAt: new Date(0).toISOString(),
  /* `partners` MUST be non-zero: `CommandDeck.tsx:117` renders an EmptyState instead of the deck when it is
     0, and the deck is what carries E1 and E5. */
  counts: { products: 4, partners: 9, workstreams: 5, tasks: 41, decisions: 7, risks: 9 },
  workstreams: [
    { id: 'w1', name: 'Liquidity', owner: 'Nik', total: 10, done: 4, open: 5, blocked: 1 },
    { id: 'w2', name: 'Payment rails', owner: null, total: 8, done: 2, open: 6, blocked: 0 },
  ],
  partnersByType: [
    { type: 'Market maker', total: 4, recommended: 2, inProgress: 1 },
    { type: 'Payment rail', total: 5, recommended: 1, inProgress: 2 },
  ],
  riskHeat: [
    { impact: 'Critical', likelihood: 'High', count: 2 },
    { impact: 'High', likelihood: 'Medium', count: 3 },
  ],
  topRisks: [
    { id: 'r1', title: 'Anchor date unconfirmed', category: 'Programme', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm with the board' },
    { id: 'r2', title: 'Rail provider terms open', category: 'Commercial', likelihood: 'Medium', impact: 'High', mitigation: 'Issue the RFI' },
  ],
  launch: {
    anchor: 'Unconfirmed', anchorConfirmed: false,
    targets: [{ id: 't1', name: 'US launch', targetDate: null, confirmed: false, note: null }],
    gating: [
      { id: 'g1', title: 'Licence', status: 'in_progress', done: false },
      { id: 'g2', title: 'Rails', status: 'open', done: true },
      { id: 'g3', title: 'Listing policy', status: 'open', done: true },
    ],
    gatingDone: 2, gatingTotal: 3,
  },
  decisions: { open: 3, total: 7, byPhase: { P1: 3, P2: 4 } },
  gaps: { partnersMissingContact: 2, partnersMissingTerms: 3, planningAssumptions: 4, unconfirmedTargets: 1, notes: ['audit fixture'] },
};

const LP_DIMS = [
  { key: 'depth', label: 'Book depth', weight: 0.3 },
  { key: 'spread', label: 'Spread discipline', weight: 0.25 },
  { key: 'venues', label: 'Venue coverage', weight: 0.25 },
  { key: 'terms', label: 'Commercial terms', weight: 0.2 },
];
const LP_RESCORE = {
  dimensions: LP_DIMS,
  rows: ['ALPHA MM', 'BOREAL', 'CASTOR', 'DELTA FLOW', 'ECHO CAP'].map((subjectLabel, i) => ({
    subjectId: `lp-${i}`, subjectLabel, tier: 'A', weighted: 3.4 - i * 0.2, rank: i + 1,
    /* Varied on BOTH axes on purpose: a surface that is flat in one direction is the degenerate case
       `buildScorecardSurface` refuses, and a refusal here would read as an unreachable surface. */
    scores: {
      depth: 1 + ((i * 0.9) % 4), spread: 4.4 - i * 0.7,
      venues: 2 + ((i * 1.3) % 3), terms: 1.2 + i * 0.6,
    },
  })),
  sensitivity: LP_DIMS.map((d) => ({
    dimKey: d.key, dimLabel: d.label, currentWeight: d.weight, flipWeight: null, gapPerHundredth: 0.01,
  })),
  setAnalysis: {
    strengths: [{ dimKey: 'spread', dimLabel: 'Spread discipline', best: 4.4, coveredBy: 'ALPHA MM' }],
    gaps: [{ dimKey: 'terms', dimLabel: 'Commercial terms', best: 3.6 }],
    concentration: 0.42,
  },
};

const COMMAND_STUBS = [
  ['**/v1/command/overview*', () => envelope(COMMAND_OVERVIEW)],
  ['**/v1/command/partners*', () => envelope([{ id: 'pa1', name: 'ALPHA MM', type: 'Market maker', subtype: null, pipeline_stage: 'rfi', capability_score: 4, tier: 'A', primary_contact: null, terms: null, notes: null, source: 'audit' }])],
  ['**/v1/command/tasks*', () => envelope([{ id: 'tk1', workstream: 'Liquidity', title: 'Sign the market maker', owner: 'Nik', target_date: null, status: 'open', depends_on: [], notes: null, source: 'audit' }])],
  ['**/v1/command/decisions*', () => envelope([{ id: 'd1', phase: 'P1', decision: 'Rail choice', recommendation: null, status: 'open', chosen: null }])],
  ['**/v1/command/risks*', () => envelope([{ id: 'r1', category: 'Programme', title: 'Anchor unconfirmed', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm', phase: 'P1' }])],
  ['**/v1/command/financials*', () => envelope([{ id: 'f1', area: 'Rails', item: 'Setup', value: '50000', unit: 'USD', assumption: true, source: 'audit' }])],
  ['**/v1/command/engines/lp-rescore*', () => envelope(LP_RESCORE)],
];

/* ── THE SURFACES ────────────────────────────────────────────────────────────────────
 * Eight relief surfaces ship in `apps/web`. All eight are listed, INCLUDING the ones this sweep cannot
 * reach — a list that quietly omits what it failed on is how a sweep reports green by covering nothing.
 *
 * `nudge` is the one field that needs explaining, and it exists because of a defect this sweep found rather
 * than because of anything about 3-D: see the E6 row.
 */
const SURFACES = [
  {
    id: 'E8', name: 'ForgeBackdrop', file: 'src/components/brand/ForgeBackdrop.tsx',
    /* E8 has no separate renderer module: the wrapper IS the renderer. */
    glFile: 'src/components/brand/ForgeBackdrop.tsx',
    route: '/select', page: 'src/pages/SelectOperator.tsx',
    /* The ONE surface that needs no seat: the sign-in screen is outside `AppLayout`, so it is what an
       unauthenticated stranger sees. It is also the only one that is not opt-in — no toggle, it mounts and
       runs — and the only one that animates. */
    seat: false, toggle: null, stubs: [], printSheet: false,
    animatesByDesign: true,
    note: 'the sign-in route; no seat, no fixture, no toggle — it mounts and runs',
  },
  {
    id: 'E4', name: 'OntologyOrrery', file: 'src/components/geometry/OntologyOrrery.tsx',
    glFile: 'src/components/geometry/OntologyOrreryGl.tsx',
    route: '/ontology', page: 'src/pages/OntologyExplorer.tsx',
    /* Its data is static (`OntologyExplorer.tsx:12` imports the graph from `@/data`), so this is the only
       opt-in surface reachable with the network entirely dead. */
    seat: true, toggle: /orrery view/i, stubs: [], printSheet: false,
    note: 'static ontology data — reachable with the network dead',
  },
  {
    id: 'E3', name: 'PipelineRelief', file: 'src/components/geometry/PipelineRelief.tsx',
    glFile: 'src/components/geometry/PipelineReliefGl.tsx',
    route: '/bd-pipeline', page: 'src/pages/BdPipeline.tsx',
    seat: true, toggle: /channel view/i, printSheet: false,
    stubs: [['**/v1/projects?*', () => envelope(
      Array.from({ length: 14 }, (_, i) => lead(i)),
      { total: 14, limit: 50, offset: 0, timestamp: new Date(0).toISOString() },
    )]],
    note: 'one stubbed lead page, the same shape e2e/populated.spec.ts uses',
  },
  {
    id: 'E2', name: 'GlobeRelief', file: 'src/components/market/GlobeRelief.tsx',
    glFile: 'src/components/market/GlobeReliefGl.tsx',
    route: '/market-map', page: 'src/pages/MarketMap.tsx',
    seat: true, toggle: /globe view/i, printSheet: false,
    stubs: [['**/v1/analytics/map*', () => envelope(Array.from({ length: 24 }, (_, i) => mapPoint(i)))]],
    note: 'one stubbed map page',
  },
  {
    id: 'E6', name: 'VaultRelief', file: 'src/components/geometry/VaultRelief.tsx',
    glFile: 'src/components/geometry/VaultReliefGl.tsx',
    route: '/audit-log', page: 'src/pages/AuditLog.tsx',
    seat: true, toggle: /vault view/i, printSheet: false,
    stubs: [['**/v1/audit*', () => envelope(
      Array.from({ length: 18 }, (_, i) => auditRow(i)),
      { total: 18, page: 1, limit: 50, totalPages: 1 },
    )]],
    /*
     * THE NUDGE, AND WHY THIS SURFACE NEEDS ONE. `/audit-log` renders "0 events · No audit events found" on
     * first mount even with a healthy endpoint, so `entries.length > 0` is false and `AuditLog.tsx:237` never
     * mounts `VaultRelief` at all — there is no toggle to click.
     *
     * MEASURED CAUSE, not a guess: the page's only `/v1/audit` fetch was dispatched with a signal that was
     * ALREADY `aborted === true`, rejecting with `AbortError: signal is aborted without reason`. The cause was
     * in the read layer rather than in this page — the coalesced fetch carried the first caller's signal — and
     * it is fixed at `apiClient.ts`'s `withoutCallerSignal`. The recovery below is kept because the sweep must
     * still reach the surface if it ever returns, and it now fires only when the toggle is actually missing.
     *
     * Changing the entity filter issues a DIFFERENT canonical URL with a fresh controller and one subscriber,
     * which lands. So the sweep changes the filter and says so, rather than reporting E6 unreachable — an
     * unreachable verdict caused by the sweep's own choice of route state would be a false negative.
     */
    nudge: async (page) => { await page.selectOption('select', 'projects'); },
    note: 'one stubbed audit page; a filter change held in reserve for when the first read is dispatched dead',
  },
  {
    id: 'E1', name: 'DeckRelief', file: 'src/components/geometry/DeckRelief.tsx',
    glFile: 'src/components/geometry/DeckReliefGl.tsx',
    route: '/command-deck', page: 'src/pages/CommandDeck.tsx',
    seat: true, toggle: /theatre view/i, stubs: COMMAND_STUBS, printSheet: true,
    note: 'six stubbed command endpoints; the page mounts the house print sheet',
  },
  {
    id: 'E5', name: 'SurfaceRelief', file: 'src/components/geometry/SurfaceRelief.tsx',
    glFile: 'src/components/geometry/SurfaceReliefGl.tsx',
    route: '/command-deck', page: 'src/pages/CommandDeck.tsx',
    /* It reaches the deck inside `CockpitPanels`' LpOptimizerPanel, which fetches the ranking itself — so the
       six command endpoints are not enough and the POST engine has to answer too. */
    seat: true, toggle: /relief view/i, stubs: COMMAND_STUBS, printSheet: true,
    note: 'the same deck, plus POST /v1/command/engines/lp-rescore for the ranking it draws',
  },
  {
    id: 'E7', name: 'StormRelief', file: 'src/components/risk/StormRelief.tsx',
    glFile: 'src/components/risk/StormReliefGl.tsx',
    route: '/marketing/crisis', page: 'src/pages/MarketingCrisis.tsx',
    seat: true, toggle: /storm view/i, stubs: [], printSheet: true,
    /*
     * UNREACHABLE BY DESIGN, AND THE ONLY ONE OF THE EIGHT WHERE THAT IS THE CORRECT STATE.
     * `MarketingCrisis.tsx:89` builds the field with `riskFieldUnavailable(...)`, a NAMED ABSENCE: no forward
     * risk feed is produced anywhere in the system. `StormRelief.tsx:101` therefore has `drawable === false`
     * and the toggle is permanently `aria-disabled`. Confirmed by this sweep rather than read off the source.
     *
     * It is listed and attempted anyway. The day a feed lands, this row starts reaching a canvas on a page
     * that mounts `PrintStyles` — and that is exactly when someone needs the print axis to already exist.
     */
    expectUnreachable: 'TOGGLE_DISABLED',
    note: 'refuses by design: no forward risk feed exists, so the field is a named absence',
  },
];

/* ── THE PROBE, installed before any app script runs ────────────────────────────────
 * Two instruments, one init script:
 *
 *   · A GL CONTEXT CENSUS. `HTMLCanvasElement.prototype.getContext` is wrapped, so every context the route
 *     creates is recorded with the canvas that owns it. Note precisely what this can and cannot say:
 *     `stage.dispose()` does NOT call `WEBGL_lose_context.loseContext()` (`packages/gl/src/stage.ts:322-330`,
 *     and 3D_VFX_FINAL_PLAN §10.4 names it), so a context released by React is still not `isContextLost()`.
 *     The census therefore reports CREATED and NOT-LOST, which is the honest pair. This sweep toggles each
 *     surface on once and never off, so on these runs they coincide.
 *   · A rAF COUNTER that can be reset from the outside, so the reduced-motion window starts when the surface
 *     is up rather than when the page loaded. Wrapping it on the live page rather than grepping the source is
 *     the same argument `3d-audit.mjs:127-128` makes: a scheduler installed by a bundled dependency would
 *     not appear in a grep of the component.
 */
const PROBE = () => {
  const w = /** @type {any} */ (globalThis);
  w.__lcxAudit = { contexts: [], raf: 0 };
  /*
   * HMR IS SWITCHED OFF FROM INSIDE THE PAGE, and this is not tidiness — it is the difference between a
   * measurement and a false pass.
   *
   * Vite's client reloads the document on `full-reload`, and a dev server serving a repo somebody is editing
   * sends those constantly: this sweep's first clean run was corrupted by six of them, triggered by edits to
   * files it does not touch (`reliefPrintPath.test.tsx`, `TrendDelta.tsx`). A reload re-runs this init script,
   * so the context census and the draw counters are REBUILT mid-pass. Everything then reads zero — and zero is
   * the passing value on the reduced-motion axis, and "the toggle is off again" is the passing value on the
   * print axis. One observed consequence: `/command-deck` reported no print findings on a pass where the
   * previous run had found two, because the reload had reset the toggle before the print media was applied.
   *
   * The HMR socket is refused rather than the app being changed: nothing in `apps/web` is touched, and the
   * page still runs exactly the code the dev server served. `close` is never signalled, so Vite's reconnect
   * path — which ends in its own `location.reload()` — is never entered either.
   */
  const RealWebSocket = w.WebSocket;
  w.WebSocket = function (url, protocols) {
    const wants = Array.isArray(protocols) ? protocols.includes('vite-hmr') : protocols === 'vite-hmr';
    if (!wants) return new RealWebSocket(url, protocols);
    return {
      readyState: 3, url: String(url), protocol: 'vite-hmr',
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
      send() {}, close() {},
      onopen: null, onmessage: null, onclose: null, onerror: null,
    };
  };
  w.WebSocket.prototype = RealWebSocket.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) w.WebSocket[k] = RealWebSocket[k];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const out = getContext.call(this, kind, ...rest);
    if (out && /webgl/i.test(String(kind))) {
      /*
       * DEDUPED BY CONTEXT IDENTITY, AND THE FIRST VERSION WAS NOT.
       *
       * `getContext('webgl2')` returns the SAME object every time it is called on a given canvas
       * (`packages/gl/src/stage.ts:336` says so, and it is why `dispose` gates on the canvas being detached).
       * Every relief in this repo rebuilds IN PLACE when its size step or its tier changes, so one component
       * on one canvas produces several calls and ONE context. Counting calls made `/bd-pipeline` report two
       * contexts for a single toggle and one canvas — a number that flatly contradicted the canvas count in
       * the same table, and would have been read as a context leak.
       *
       * The call count is kept, because a rebuild in place is a real event worth seeing; it is just not a
       * second context.
       */
      w.__lcxAudit.getContextCalls = (w.__lcxAudit.getContextCalls ?? 0) + 1;
      const already = w.__lcxAudit.contexts.find((c) => c.gl === out);
      if (already) return out;
      const rec = { gl: out, canvas: this, draws: 0 };
      /*
       * DRAW CALLS PER CONTEXT, and this is the axis's whole attribution.
       *
       * The first version of this sweep counted `requestAnimationFrame` page-wide, the way `3d-audit.mjs`
       * does. That works on a harness, which is one file with nothing else in it. In the app it measured the
       * SHELL: it reported 36 frames scheduled after the surface was drawn on `/ontology`, where ReactFlow
       * runs its own loop, and 9-36 frames on routes with nothing to do with the relief at all — while the
       * same surface on the same route returned 10 and then 36 on two consecutive passes. A number that moves
       * like that is measuring the page, and reporting it as "this surface animates" is asserting a code path
       * without checking which one ran.
       *
       * A draw call on THIS context cannot belong to anything else. Wrapped on the instance so the count is
       * per context rather than per class, which is what makes the shared 2-D context separable from a
       * relief's own on a route that has both.
       */
      for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const orig = out[m];
        if (typeof orig !== 'function') continue;
        out[m] = function (...a) { rec.draws += 1; return orig.apply(this, a); };
      }
      w.__lcxAudit.contexts.push(rec);
    }
    return out;
  };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => { w.__lcxAudit.raf += 1; return raf(cb); };
  /*
   * WHETHER A READ WAS DISPATCHED DEAD. Added because it is what stopped E6 from being reachable, and the
   * cause is not in the page: `/audit-log` renders "0 events" on first mount with a healthy endpoint, and the
   * single `/v1/audit` fetch goes out with `signal.aborted` ALREADY true.
   *
   * Recorded at the `fetch` boundary — not at Playwright's request router, which never sees these at all,
   * because a fetch with a pre-aborted signal is rejected by the browser before a request exists. That is
   * precisely why the failure is invisible: there is nothing in the network panel to look at.
   */
  w.__lcxAudit.deadReads = [];
  const realFetch = w.fetch;
  w.fetch = function (input, init) {
    const u = String(input && input.url ? input.url : input);
    const signal = (init && init.signal) || (input && input.signal);
    if (/\/v1\//.test(u) && signal && signal.aborted) w.__lcxAudit.deadReads.push(u.slice(-70));
    return realFetch.call(this, input, init);
  };
};

/**
 * The context census, with enough per-context detail that the total is interpretable.
 *
 * A bare count is not: on `/command-deck` three contexts exist and they are not three reliefs — one is the
 * shared 2-D renderer every chart draws through, whose canvas is offscreen and never in the document. Without
 * `inDocument` and the size, the number cannot be compared with the static pin in `glContextBudget.test.ts`,
 * which counts owners and the shared renderer separately.
 */
const readAudit = () => {
  const a = /** @type {any} */ (globalThis).__lcxAudit;
  const contexts = a.contexts.map((c) => {
    const box = c.canvas.getBoundingClientRect();
    return {
      lost: c.gl.isContextLost(),
      inDocument: document.contains(c.canvas),
      w: Math.round(box.width), h: Math.round(box.height),
      tier: c.canvas.dataset.qualityTier ?? null,
      draws: c.draws,
    };
  });
  return {
    created: contexts.length,
    notLost: contexts.filter((c) => !c.lost).length,
    inDocument: contexts.filter((c) => c.inDocument && !c.lost).length,
    offscreen: contexts.filter((c) => !c.inDocument && !c.lost).length,
    raf: a.raf,
    getContextCalls: a.getContextCalls ?? 0,
    deadReads: [...new Set(a.deadReads)],
    contexts,
  };
};

/** Every relief canvas on the page, with the two facts each axis is decided on. */
const readCanvases = () => Array.from(document.querySelectorAll('canvas')).map((c) => {
  const box = c.getBoundingClientRect();
  return {
    tier: c.dataset.qualityTier ?? null,
    w: Math.round(box.width), h: Math.round(box.height),
    /* GEOMETRY, NOT `display`, for the reason `3d-audit.mjs:69-81` records: the flat fallback in the harness
       is CLIPPED to 1x1 on success rather than `display:none`, so a `display` test reports the wrong verdict
       about a fix. The same rule is applied to canvases here for consistency of meaning. */
    shown: getComputedStyle(c).display !== 'none' && box.height > 4 && box.width > 4,
    display: getComputedStyle(c).display,
  };
});

/*
 * ══ THE THEME LEVER ══════════════════════════════════════════════════════════════════
 *
 * The app's switch is the `dark` class on `<html>`. There are THREE writers of it and they do not agree, so
 * "just add the class" is wrong on six of the eight surfaces. Every line below is a measurement, taken with
 * this driver against this dev server, not a reading of the source.
 *
 *   · `AppLayout.tsx:117-119` runs `classList.toggle('dark', darkMode)` on mount and on every change, with
 *     `darkMode` coming from the persisted `useUIStore`. So on any route INSIDE the shell the store is the
 *     authority and it overwrites anything else. MEASURED: a class added at document-start on `/command-deck`
 *     and `/ontology` is gone by the time the shell has mounted — `dark=false` — and still gone after a
 *     reload. **Poking the class is not the right lever there.**
 *   · `/select` is OUTSIDE the shell, so nothing manages the class and a poke DOES survive, including across
 *     the front-door reload. Measured `dark=true` before and after.
 *   · `index.html:10-20` is the pre-hydration path, and it reads `localStorage['lcx-os:ui:v1']`.
 *
 * THAT LAST KEY IS NEVER WRITTEN, which is a defect this pass found rather than assumed. `useUIStore` persists
 * under `STORAGE_KEYS.UI` through `lib/persistence.ts:38`, whose `mk()` is
 * `lcx-os:${scope()}:${key}:v1` — and `scope()` is the operator's email, or the literal `anon` before sign-in.
 * There is no code path that produces `lcx-os:ui:v1` with no scope segment at all. MEASURED both ways:
 * clicking the real theme toggle in the UI wrote `lcx-os:nik@lcx.com:ui:v1` and nothing else, and seeding only
 * `lcx-os:ui:v1` left a seated route at `dark=false` with `document.body` still carrying the dark
 * pre-hydration background — the two writers disagreeing on one page.
 *
 * So this seeds BOTH keys, and that is not belt-and-braces: they drive different surfaces. The scoped key is
 * what the store rehydrates from and is the ONLY thing that works inside the shell; the unscoped key is what
 * `index.html` reads and is the only thing that works on `/select`. Seeding the store the way the app's own
 * toggle writes it is what makes this a measurement of the app rather than of a class this script added.
 *
 * WRITTEN THROUGH A GUARD BECAUSE `document.documentElement` IS NULL HERE. Playwright's init scripts run at
 * document-start, before the parser has created `<html>` — measured directly: `document.readyState` is
 * `'loading'` and `document.documentElement` is `null`, so `classList.add` throws a TypeError that is silently
 * swallowed. This cost the first version of this pass a false conclusion: `/select` appeared to REJECT a
 * document-start poke, when in fact the poke had never run. Nothing here touches the class as its primary
 * lever, but the fallback below is guarded so it cannot repeat that.
 */
const themeInit = (theme) => ({
  theme,
  seed: (a) => {
    const env = JSON.stringify({
      state: { sidebarCollapsed: false, darkMode: a.dark, evidenceDocked: false },
      /* zustand's `persist` default. `useUIStore` declares no `version` and no `migrate`, so a mismatch here
         would be silently dropped and the seat would read as light — the failing-open direction. */
      version: 0,
    });
    /* The scoped key, exactly as `lib/persistence.ts` builds it. `anon` is the scope before sign-in. */
    localStorage.setItem(`lcx-os:${a.scope}:ui:v1`, env);
    /* The unscoped key `index.html` reads. Nothing in the app writes this; see the header. */
    localStorage.setItem('lcx-os:ui:v1', env);
  },
});

/*
 * ══ THE PIXEL INSTRUMENT ═════════════════════════════════════════════════════════════
 *
 * READ BACK IN-PAGE, NOT DECODED FROM A PNG. `createStage` sets `preserveDrawingBuffer: true` unconditionally
 * (`packages/gl/src/stage.ts:288`), so the drawing buffer survives compositing and a `drawImage` of the GL
 * canvas onto a 2-D canvas outside the frame returns what was drawn. That is why this does NOT have to capture
 * inside a `requestAnimationFrame`: without that flag it would, and the readback would return an empty buffer
 * that is indistinguishable from a surface that rendered nothing.
 *
 * The 2-D scratch canvas starts TRANSPARENT BLACK and is not cleared to white first, on purpose: a GL canvas
 * that composited transparent would otherwise be laundered into a solid white reading. Mean alpha is reported
 * so "transparent" and "black" stay separable — the E8 context-loss note in this file records a finding that
 * turned on exactly that distinction.
 *
 * Every number below is over the canvas's own drawing buffer, so the page's CSS background is NOT included.
 * The viewport capture beside it is where the surface is judged against the page it sits on.
 */
const readPixelStats = (chromaFloor) => {
  const out = [];
  for (const c of Array.from(document.querySelectorAll('canvas[data-audit-target="1"]'))) {
    const w = c.width, h = c.height;
    if (w < 2 || h < 2) { out.push({ w, h, readable: false, why: 'drawing buffer is degenerate' }); continue; }
    let d;
    try {
      const o = document.createElement('canvas');
      o.width = w; o.height = h;
      const ctx = o.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(c, 0, 0);
      d = ctx.getImageData(0, 0, w, h).data;
    } catch (e) { out.push({ w, h, readable: false, why: String(e).slice(0, 80) }); continue; }

    /* Rec.709 on the sRGB values as displayed. Deliberately NOT linearised: the question is what the reader's
       eye gets off the screen, and the tone map has already run. */
    const luma = new Float64Array(w * h);
    const hist = new Uint32Array(256);
    /*
     * A CHROMA HISTOGRAM, ADDED BECAUSE THE LUMINANCE STATISTICS FLATTERED A SURFACE THAT HAD FAILED.
     *
     * E6 VaultRelief reported luminance sd 2.52 in dark and 18.70 in light — a 743% IMPROVEMENT by that
     * measure, printed as "holds up". The captures say the opposite: in dark the vault carries 18 blue record
     * marks, and in light they are GONE, dissolved into a smooth white haze. A smooth gradient has a large
     * luminance spread and carries no data, so `sdLuma` rose while the reading was lost.
     *
     * Chroma percentiles answer the actual question — "are the data marks still there" — without a threshold
     * at all. Every scenery colour in both themes is a desaturated blue-grey and every data hue but `refusal`
     * is not, so the top of the chroma distribution IS the data marks. If p99.9 chroma collapses between
     * themes, the marks went away, whatever the luminance did.
     */
    const chromaHist = new Uint32Array(256);
    let sum = 0, alphaSum = 0, n = 0, chromaSum = 0;
    let dataN = 0, dataLuma = 0, sceneN = 0, sceneLuma = 0;
    let dataR = 0, dataG = 0, dataB = 0, sceneR = 0, sceneG = 0, sceneB = 0;
    const seen = new Set();
    for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma[p] = y; sum += y; alphaSum += d[i + 3]; n += 1;
      hist[Math.min(255, Math.round(y))] += 1;
      /* Quantised to 5 bits per channel: an exact count would be dominated by dither and antialiasing and
         would read as "thousands of colours" on a flat grey. */
      if (seen.size < 4096) seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      const ch = Math.max(r, g, b) - Math.min(r, g, b);
      chromaHist[ch] += 1; chromaSum += ch;
      if (ch >= chromaFloor) {
        dataN += 1; dataLuma += y; dataR += r; dataG += g; dataB += b;
      } else {
        sceneN += 1; sceneLuma += y; sceneR += r; sceneG += g; sceneB += b;
      }
    }
    const mean = sum / n;
    let varSum = 0;
    for (let p = 0; p < n; p += 1) { const dv = luma[p] - mean; varSum += dv * dv; }
    const pctOf = (h, q) => {
      const want = Math.floor(q * n); let acc = 0;
      for (let v = 0; v < 256; v += 1) { acc += h[v]; if (acc > want) return v; }
      return 255;
    };
    const pct = (q) => pctOf(hist, q);
    let maxChroma = 0;
    for (let v = 255; v >= 0; v -= 1) { if (chromaHist[v] > 0) { maxChroma = v; break; } }
    /* WCAG relative luminance, so the separation can be quoted as a contrast ratio a designer can argue with
       rather than as a raw 0-255 gap nobody has an intuition for. */
    const rel = (r, g, b) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => {
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    };
    const dataMean = dataN > 0 ? [dataR / dataN, dataG / dataN, dataB / dataN] : null;
    const sceneMean = sceneN > 0 ? [sceneR / sceneN, sceneG / sceneN, sceneB / sceneN] : null;
    out.push({
      w, h, readable: true, pixels: n,
      meanLuma: mean, sdLuma: Math.sqrt(varSum / n),
      p01: pct(0.01), p99: pct(0.99),
      meanAlpha: alphaSum / n,
      distinctColours: seen.size,
      meanChroma: chromaSum / n,
      /* p99.9 rather than the max: one stray antialiased pixel must not stand in for a population of marks,
         and one missing pixel must not hide their loss. The max is carried alongside so a reader can see the
         two disagree if they ever do. */
      p999Chroma: pctOf(chromaHist, 0.999), p99Chroma: pctOf(chromaHist, 0.99), maxChroma,
      dataPct: (dataN / n) * 100,
      dataMeanLuma: dataN > 0 ? dataLuma / dataN : null,
      sceneryMeanLuma: sceneN > 0 ? sceneLuma / sceneN : null,
      dataVsSceneryContrast: (dataMean && sceneMean)
        ? contrast(rel(...dataMean), rel(...sceneMean)) : null,
    });
  }
  return out;
};

/* ── THE DEV SERVER ─────────────────────────────────────────────────────────────────
 * Spawned rather than reused, on a port of this sweep's own, for one reason that matters:
 *
 * `apps/web/.env.local` sets `VITE_API_URL=http://localhost:8791`, which makes every API call CROSS-ORIGIN.
 * A cross-origin fulfilment needs the browser's preflight to be intercepted too, and a preflight that escapes
 * the router reaches a port with nothing on it — so a fixture silently does not apply and the surface reports
 * as unreachable for a reason that has nothing to do with the surface. Forcing `VITE_API_URL=''` puts the
 * calls back on the dev origin, where one route pattern covers them.
 *
 * That changes WHERE requests are addressed and nothing about what the components render, and it is recorded
 * in the generated report rather than left as a detail of this file.
 */
function startDevServer() {
  const bin = join(ROOT, 'node_modules/.bin/vite');
  if (!existsSync(bin)) {
    console.error(`  REFUSED: no vite binary at ${bin}. Run npm install first.`);
    process.exit(1);
  }
  const child = spawn(bin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: WEB,
    env: { ...process.env, VITE_API_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  return { child, log };
}

async function waitForServer(log) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`  REFUSED: the dev server never answered on ${BASE}.`);
  console.error(`  If ${PORT} is already taken, --strictPort makes vite exit rather than move — set`);
  console.error('  APP_AUDIT_PORT to a free port. A sweep that cannot load the app has measured nothing.');
  console.error(log.join('').split('\n').slice(-12).join('\n'));
  process.exit(1);
}

/* ── ONE SURFACE, ONE PAGE, ONE AXIS AT A TIME ──────────────────────────────────────── */

/*
 * ══ THE ONLY PLACE A PAGE IS OPENED, AND EVERY ENVIRONMENT KNOB IS PINNED HERE ═══════
 *
 * Two jobs, and the first one is an ordering guarantee that cannot be got any other way: the frozen clock
 * is registered as the FIRST init script on the page, before the seat, before the theme seed and before
 * the probe. `index.html`'s pre-hydration script and the whole module graph run at document-start, so a
 * clock installed second has already been read around by the code it was meant to hold still.
 *
 * The second job is the context options, and each one is an environment sample that was previously taken
 * from whatever the host happened to be set to:
 *
 *   · `timezoneId` / `locale` — `AuditLog.tsx:254` renders every row through `toLocaleString()` and
 *     `BdPipeline.tsx:236` through `toLocaleDateString()`. A machine in another zone reads a different
 *     time on the same fixture, and a different locale reads a different STRING WIDTH, which moves the
 *     layout underneath the viewport capture. UTC because every fixture timestamp is UTC and a report
 *     that says 07:18 should be the same 07:18 as the frozen instant.
 *   · `colorScheme` — pinned to the app's own default rather than inherited. The theme is driven by the
 *     persisted store, but the UA's own furniture (scrollbars, form controls) follows this and lands in
 *     the viewport capture.
 *   · `reducedMotion` — the reduced-motion axis emulates `reduce` explicitly; everything else must be
 *     `no-preference` by declaration and not by luck. `packages/gl/src/env/quality.ts:273` defaults to
 *     REDUCED when the preference cannot be read, so an unpinned host that reported `reduce` would have
 *     ForgeBackdrop render one frame and stop — and the control run that validates every zero in this
 *     file would then measure zero and withdraw them all.
 *   · `contrast` / `forcedColors` — `prefersMoreContrast()` reads both, and its whole documented purpose
 *     is to change what the surface draws. An OS-level high-contrast setting on the host would have
 *     silently rendered a different picture and reported it as the product.
 *   · `deviceScaleFactor` — the drawing buffer is `cssSize x min(Q.dprScale, devicePixelRatio)`, so this
 *     is literally the pixel count every statistic in the theme table is computed over.
 */
async function openPage(browser, opts = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    timezoneId: 'UTC',
    locale: 'en-GB',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    contrast: 'no-preference',
    forcedColors: 'none',
    ...opts,
  });
  await page.addInitScript(FREEZE_ENV, { at: FROZEN_AT, seed: FROZEN_SEED });
  return page;
}

async function newSeatedPage(browser, surface, extraStubs = [], theme = null) {
  const page = await openPage(browser);
  page.on('pageerror', (e) => { page.__errs = [...(page.__errs ?? []), e.message]; });
  /*
   * NAVIGATIONS ARE COUNTED, AND THAT IS A CORRECTNESS GUARD RATHER THAN DIAGNOSTICS.
   *
   * `/select` performs a real document navigation a couple of seconds after load — `forceFrontDoor`
   * (`apiClient.ts:302`) races a bounded 2 s credential clear and then re-enters the front door. A reload
   * re-runs `addInitScript`, so `__lcxAudit` is REBUILT: any measurement window straddling it returns 0 draws
   * and 0 frames. Zero is the passing value on the reduced-motion axis, so an unnoticed reload turns a
   * measurement into a green result from a page that was not there. It also cost this sweep an outright crash
   * ("Execution context was destroyed") before it was handled, which is the friendlier of the two failures.
   */
  page.__navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) page.__navs += 1; });
  if (surface.seat) await page.addInitScript((s) => {
    localStorage.setItem('lcx_operator_email', s.email);
    localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
    localStorage.setItem(`lcx-os:${s.email}:operator:v1`, JSON.stringify({ state: { operator: s.operator }, version: 3 }));
  }, SEAT);
  /*
   * SEEDED AFTER THE SEAT, WHICH IS LOAD-BEARING FOR THE SAME REASON THE SEAT'S OWN ORDER IS. The scoped key
   * embeds the operator's email, and on an unseated page (`/select`) the scope is the literal `anon` — so the
   * scope is derived from `surface.seat` here rather than passed in, and a surface that changes its seating
   * changes its theme key with it. `theme === null` seeds nothing at all, which is what the four axes above
   * run under: the app's own default, which is LIGHT.
   */
  if (theme !== null) {
    await page.addInitScript(themeInit(theme).seed, {
      dark: theme === 'dark',
      scope: surface.seat ? SEAT.email.trim().toLowerCase() : 'anon',
    });
  }
  await page.addInitScript(PROBE);
  /*
   * THE FLOOR IS "NO API", ENFORCED RATHER THAN ASSUMED — `e2e/seat.ts` records what it cost to learn this:
   * with a live API on the dev proxy, the seeded passcode 401s, `apiClient` calls `forceFrontDoor()`, the seat
   * is torn out and every assertion fails on the sign-in gate with no hint that the cause is a process on
   * another port. Three agents each suspected their own change. Aborting first makes the premise a property of
   * this sweep instead of a property of the machine.
   *
   * Registered FIRST on purpose: Playwright gives later handlers priority, so each surface's own fixtures
   * below still win. This is the floor, not a ceiling.
   */
  await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
  for (const [glob, body] of [...surface.stubs, ...extraStubs]) {
    await page.route(glob, (r) => r.fulfill(body()));
  }
  return page;
}

/**
 * Navigate, opt in, and wait for a frame — or say which step failed.
 *
 * The four outcomes are deliberately distinguished, because they are four different facts about the app and
 * collapsing them into "unreachable" is what makes a sweep useless: the toggle can be ABSENT (the page never
 * mounted the surface, usually because its data did not arrive), DISABLED (the surface refused before any
 * renderer ran, which for E7 is the correct state), REFUSED (the renderer ran and declined), or DRAWN.
 */
async function reach(page, surface) {
  await page.goto(BASE + surface.route, { waitUntil: 'domcontentloaded' });
  /* The status-bar disclaimer is what `e2e/seat.ts` anchors on to know the shell has mounted: it is rendered
     on every route and cannot pass early the way a sleep can. /select is outside the shell, so it waits on
     its own heading instead. */
  const anchor = surface.seat
    ? page.getByText(/NOT LEGAL ADVICE/i).first()
    : page.getByText(/Sign in to the desk/i).first();
  try { await anchor.waitFor({ state: 'visible', timeout: 30_000 }); }
  catch { return { state: 'SHELL_NEVER_MOUNTED' }; }


  if (surface.toggle === null) {
    /* E8 only: nothing to press, so readiness is the canvas appearing at all. Its "before" state is the page
       with no renderer on it at all, which is what `preClick: 0` and the flat census taken now describe. */
    const flatBefore = await guarded(page, () => page.evaluate(readFlat));
    const ok = await waitForDrawn(page, 45_000);
    return { state: ok ? 'DRAWN' : 'NEVER_DREW', preClick: 0, flatBefore };
  }

  const btn = page.getByRole('button', { name: surface.toggle });
  let nudged = false;
  try { await btn.first().waitFor({ state: 'attached', timeout: 25_000 }); }
  catch {
    /*
     * NUDGED ONLY WHEN IT IS NEEDED, AND THE RESULT IS REPORTED EITHER WAY.
     *
     * `/audit-log` sometimes renders "0 events · No audit events found" on first mount with a healthy
     * endpoint, because its only `/v1/audit` read is dispatched with an already-aborted signal — and
     * SOMETIMES it does not, because the trigger is a race between React's dev double-mount and the first
     * await inside the read. An unconditional nudge would hide which of the two happened, and the sweep would
     * carry a note about a defect it had not observed on that run. So the nudge is a recovery, not a step.
     */
    if (!surface.nudge) return { state: 'TOGGLE_ABSENT', detail: await pageHeadline(page) };
    try { await surface.nudge(page); } catch (e) { return { state: 'NUDGE_FAILED', detail: String(e).slice(0, 90) }; }
    nudged = true;
    try { await btn.first().waitFor({ state: 'attached', timeout: 25_000 }); }
    catch { return { state: 'TOGGLE_ABSENT_AFTER_NUDGE', detail: await pageHeadline(page) }; }
  }

  if (await btn.first().getAttribute('aria-disabled') === 'true') {
    return { state: 'TOGGLE_DISABLED', detail: (await reasonBeside(page)) ?? null };
  }

  /*
   * BOTH BASELINES ARE TAKEN HERE, BEFORE THE CLICK, and each is what makes one axis attributable:
   *
   *   · `preClick` is how many GL contexts the route had already built on its own. The contexts created from
   *     this index on are the ones the toggle is responsible for — which is what the context-loss axis has to
   *     target. Losing the first context it finds instead cost this sweep a false finding: on
   *     `/command-deck` that is the SHARED 2-D context behind the deck, whose loss the relief's listener is
   *     correctly not registered for, and the sweep reported "a lost context was never named to the reader"
   *     about a component whose branch had never been reached.
   *   · `flatBefore` is the flat figure the reader has with the relief OFF. Every wrapper swaps rather than
   *     layers, so the print question is whether opening the relief REMOVES readable data from the document —
   *     a drop, not an absence. Measured as an absence it fired on the sign-in screen, which has no flat data
   *     figure to lose and never claimed one.
   */
  const preClick = await guarded(page, () => page.evaluate(() => globalThis.__lcxAudit.contexts.length));
  const flatBefore = await guarded(page, () => page.evaluate(readFlat));

  await btn.first().scrollIntoViewIfNeeded();
  await btn.first().click();
  /* PRESSED IS CHECKED SEPARATELY FROM DRAWN. A click that did not flip `aria-pressed` and a renderer that
     refused are different failures, and during development of this sweep the first one happened — reported as
     "no canvas" it would have been blamed on the renderer. */
  try {
    await page.waitForFunction(
      (sel) => Array.from(document.querySelectorAll('button'))
        .some((b) => sel.test(b.textContent ?? '') && b.getAttribute('aria-pressed') === 'true'),
      new RegExp(surface.toggle.source, surface.toggle.flags),
      { timeout: 10_000 },
    );
  } catch { return { state: 'TOGGLE_DID_NOT_ENGAGE', preClick, flatBefore, nudged }; }

  if (await waitForDrawn(page, 60_000)) return { state: 'DRAWN', preClick, flatBefore, nudged };
  const alert = await reasonBeside(page);
  return { state: alert ? 'RENDERER_REFUSED' : 'NEVER_DREW', detail: alert, preClick, flatBefore, nudged };
}

/**
 * The readable flat surface, counted the way a reader finds it: a data table, or an SVG figure with text in
 * it. Both are what these wrappers swap out, and both are what survives to paper; a canvas is neither.
 */
const readFlat = () => ({
  tables: document.querySelectorAll('table').length,
  svgsWithText: Array.from(document.querySelectorAll('svg')).filter((s) => s.querySelector('text') !== null).length,
});

/** A canvas with real geometry on it. `?? null` on the tier because two of the eight never stamp one. */
async function waitForDrawn(page, timeout) {
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('canvas')).some((c) => {
      const b = c.getBoundingClientRect();
      return b.width > 4 && b.height > 4 && getComputedStyle(c).display !== 'none';
    }), undefined, { timeout });
    /* SwiftShader compiles the shaders on the first draw; a canvas can be laid out a beat before it holds a
       frame, and the print and context-loss axes both read a drawn canvas. */
    await page.waitForTimeout(1200);
    return true;
  } catch { return false; }
}

/*
 * ── THE ANIMATION PHASE, WHICH IS THE CLOCK THE FREEZE DELIBERATELY LEAVES RUNNING ───
 *
 * `performance.now()` is not frozen, for the reason the freeze block gives: stopping it stops every frame
 * loop and turns the reduced-motion control run into a guaranteed zero. So a surface that is still moving
 * is captured at whatever phase the machine happened to reach — `ForgeBackdrop` runs a five-second arc
 * (`SWEEP_MS = 5000`) and `waitForDrawn`'s flat 1200 ms lands somewhere inside it that depends on how
 * fast the machine compiled the shaders. Two runs, two different frames, both correct, neither reproducible.
 *
 * Held fixed by WAITING FOR THE DRAW COUNTERS TO STOP rather than by sleeping for a guessed interval. A
 * surface that renders once and stops settles immediately; one that animates settles when its arc ends,
 * which for `ForgeBackdrop` is `t === 1` — its FINAL frame, the one §6 rule 3 says reduced motion resolves
 * to, so the still and the moving readings are of the same picture. A surface that never stops is reported
 * as unsettled rather than captured quietly, because a capture of a moving frame is not reproducible and
 * saying so is the only honest thing to do with it.
 *
 * `document.fonts.ready` first: the viewport capture is full of DOM text, and a shot taken before the
 * self-hosted faces have loaded is laid out on fallback metrics.
 */
async function settleForCapture(page, maxMs = 15_000, attempts = 3) {
  for (let i = 1; i <= attempts; i += 1) {
    const before = page.__navs;
    try { await page.evaluate(() => (document.fonts?.ready ? document.fonts.ready.then(() => undefined) : undefined)); }
    catch { /* no font manager, or the document went away — the retry below covers the second case */ }
    let out = null;
    try {
      out = await page.evaluate(async (cap) => {
        const a = /** @type {any} */ (globalThis).__lcxAudit;
        const total = () => a.contexts.reduce((n, c) => n + c.draws, 0);
        const STEP = 250, QUIET = 1000;
        let last = total(), still = 0;
        for (let waited = 0; waited < cap; waited += STEP) {
          await new Promise((r) => setTimeout(r, STEP));
          const now = total();
          if (now === last) {
            still += STEP;
            if (still >= QUIET) return { settled: true, waitedMs: waited + STEP, draws: now };
          } else { still = 0; last = now; }
        }
        return { settled: false, waitedMs: cap, draws: total() };
      }, maxMs);
    } catch { /* execution context destroyed — same verdict as a straddled window */ }
    /*
     * A SETTLE THAT STRADDLED A NAVIGATION SETTLED THE WRONG DOCUMENT. `/select` performs one real
     * navigation about two seconds in (`forceFrontDoor`), which re-runs every init script and rebuilds
     * `__lcxAudit` — so a counter that "stopped moving" may simply have been replaced by a fresh zero, and
     * ForgeBackdrop's arc has restarted underneath it. Retried against the new document rather than
     * believed, which is the same rule `cleanWindow` applies to the reduced-motion window.
     */
    if (out !== null && page.__navs === before) return out;
    await waitForDrawn(page, 45_000);
  }
  return { settled: false, waitedMs: 0, draws: null, why: `the page kept navigating through ${attempts} settles` };
}

/**
 * Wait until the page stops navigating, then take a measurement window — and VOID it if a navigation happened
 * while it was open. Returns `null` when it could not get a clean window, so the caller reports "unmeasured"
 * rather than the zero a torn-down page would hand it.
 */
async function cleanWindow(page, take, { settle = true, recover = null, attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (settle) {
      /* Three seconds with no navigation. `/select` reloads about two seconds in, once per document. */
      let quiet = page.__navs;
      for (let waited = 0; waited < 12_000; waited += 500) {
        await page.waitForTimeout(500);
        if (page.__navs === quiet) { if (waited >= 3000) break; } else { quiet = page.__navs; waited = 0; }
      }
    }
    const before = page.__navs;
    try {
      const out = await take();
      if (page.__navs === before) return out;
    } catch { /* context destroyed mid-window — same verdict as a straddled window */ }
    /* The window was straddled by a navigation, so the new document has to be back on a frame before the next
       attempt means anything. */
    if (recover) await recover();
  }
  return null;
}

const pageHeadline = (page) => page.evaluate(() => (document.body.innerText ?? '')
  .replace(/\s+/g, ' ').slice(0, 150));
const reasonBeside = (page) => page.evaluate(() => {
  /* The FIRST live region only, and cut at a sentence. A page can hold several — `/marketing/crisis` has the
     refusal code and its full explanation in two of them — and concatenating them produced a run-on truncated
     mid-word in the generated report, which is the sort of thing a reader stops trusting the file over. */
  /* `innerText`, not `textContent`: `/marketing/crisis` puts a refusal code and its explanation in adjacent
     children with no whitespace between them, and `textContent` ran them into "NO_FORWARD_RISK_FEEDNo forward
     risk feed…" in the generated report. `innerText` is layout-aware and separates them. */
  const el = document.querySelector('[role="alert"]');
  const text = el === null ? null : (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text === null) return null;
  const stop = text.indexOf('. ');
  return (stop > 20 && stop < 200 ? text.slice(0, stop + 1) : text.slice(0, 180)).trim();
});

/* ── THE AXES ───────────────────────────────────────────────────────────────────────── */

/**
 * A reload during an axis makes that axis's numbers describe a document that is no longer there — and on two
 * of the four axes the numbers it then produces are the PASSING ones. So a straddled pass is thrown away and
 * re-run rather than reported. `RELOADED` is the sentinel; `sweepSurface` catches it.
 */
const RELOADED = Symbol('reloaded');
async function guarded(page, fn) {
  const before = page.__navs;
  let out;
  try { out = await fn(); } catch (e) {
    if (page.__navs !== before) throw RELOADED;
    throw e;
  }
  if (page.__navs !== before) throw RELOADED;
  return out;
}

/**
 * One surface, all four axes, retried whole if a reload straddled any of them.
 *
 * Retried WHOLE rather than per axis because `reach()` is what establishes the baselines the axes are compared
 * against (`preClick`, `flatBefore`); re-running one axis against another pass's baseline is how a comparison
 * becomes a coincidence.
 */
async function sweepSurface(browser, surface, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    /* Every page a pass opens, closed whatever happens to it. A discarded pass throws past each axis's own
       `page.close()`, and a leaked page keeps a GL context alive that the next pass would then census. */
    const open = [];
    try {
      return await sweep(browser, surface, open);
    } catch (e) {
      if (e !== RELOADED) throw e;
      console.log(`      (${surface.id}: the page reloaded mid-pass — attempt ${i} discarded, not reported)`);
    } finally {
      for (const p of open) await p.close().catch(() => {});
    }
  }
  return {
    ...surface, problems: [
      `every one of ${attempts} passes was straddled by a page reload, so nothing here was measured. `
      + 'Reported as unmeasured rather than as a pass: a reload resets the draw counters and the relief '
      + 'toggle, and zero draws with the toggle off is what a pass looks like.',
    ], axes: {}, reach: 'RELOADED_EVERY_PASS',
  };
}

async function sweep(browser, surface, open) {
  const row = { ...surface, problems: [], axes: {} };

  /* ── 1 · REACH, the tier stamp, and the context census, in one pass ──────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    row.reach = got.state;
    row.reachDetail = got.detail ?? null;

    if (got.state === 'DRAWN') {
      const canvases = await guarded(page, () => page.evaluate(readCanvases));
      const census = await guarded(page, () => page.evaluate(readAudit));
      row.canvases = canvases;
      row.contextsCreated = census.created;
      row.contextsNotLost = census.notLost;
      row.contextsInDocument = census.inDocument;
      row.contextsOffscreen = census.offscreen;
      row.contextsByToggle = census.created - (got.preClick ?? 0);
      row.getContextCalls = census.getContextCalls;
      row.deadReads = census.deadReads;
      row.nudged = got.nudged === true;
      if (census.deadReads.length > 0) {
        /*
         * NOT A 3-D FINDING, AND REPORTED ANYWAY, because it is what decides whether a surface is reachable at
         * all — and because it is invisible from the network panel: a fetch with a pre-aborted signal never
         * becomes a request, so there is nothing to look at and the page just renders empty.
         *
         * This is how it was found. `apiClient` built the coalesced fetch as
         * `() => networkRequest(path, opts, method)`, and `opts` carries the caller's `AbortSignal` — so the
         * ONE shared request ran on the FIRST subscriber's signal and that caller unmounting killed it for
         * everyone, which is the exact reverse of the contract `readCache.ts:375-379` states. Fixed at
         * `apiClient.ts`'s `withoutCallerSignal`. The check stays as a ratchet: ten modules under `lib/api`
         * pass a signal, so a call site that reintroduces it has a lot of surfaces to break.
         */
        row.problems.push(`${census.deadReads.length} read(s) on this route were dispatched with an `
          + `ALREADY-ABORTED signal and never became a request: ${census.deadReads.join(', ')}. `
          + 'The page renders EMPTY with no error and nothing appears in the network panel — a shape '
          + 'indistinguishable from "there is no data". This is the defect `apiClient.ts` fixed with '
          + '`withoutCallerSignal`: the coalesced fetch must not carry any one caller\'s signal, which is what '
          + '`readCache.ts:375-379` promises ("a caller\'s signal detaches that subscriber, it does not kill '
          + 'the request"). Seeing it again means a call site is passing `opts` through to the shared fetch');
      }
      /* The relief canvas is the one the toggle just added. Where a route has several (CommandDeck carries
         the shared 2-D context behind the deck as well), the tier stamp is read off ALL of them and reported
         as a count, so "no canvas here stamps a tier" cannot be confused with "the page has no canvas". */
      row.tierStamped = canvases.filter((c) => c.tier !== null).length;
      row.tierValues = [...new Set(canvases.map((c) => c.tier).filter(Boolean))];
      if (row.tierStamped === 0) {
        /*
         * The claim is at `shared/useQualityTier.ts:94-99`: "The app has no capture harness, so the components
         * stamp `data-quality-tier` on their canvas and this is where a debug surface reads the rest." Six of
         * the eight do, at one line each. Named against the RENDERER file rather than the wrapper, because the
         * stamp belongs beside the draw that finished.
         */
        row.problems.push(`${surface.glFile} never sets \`canvas.dataset.qualityTier\`, so the tier this `
          + 'surface rendered at cannot be read back off the live page. `shared/useQualityTier.ts:94-99` '
          + 'states that the components stamp it, and six of the eight do — DeckReliefGl.tsx:608, '
          + 'SurfaceReliefGl.tsx:336, OntologyOrreryGl.tsx:516, PipelineReliefGl.tsx:535, '
          + 'VaultReliefGl.tsx:522, StormReliefGl.tsx:559. `env/quality.ts` is the reason it matters: a tier '
          + 'that cannot be reported cannot be trusted');
      }
    } else if (surface.expectUnreachable && got.state === surface.expectUnreachable) {
      /* Not a problem: the surface refused for the documented reason, and this is the confirmation. */
    } else {
      row.problems.push(`could not reach the surface: ${got.state}`
        + (got.detail ? ` — ${got.detail}` : ''));
    }
    row.pageErrors = page.__errs ?? [];
    if (row.pageErrors.length) {
      row.problems.push(`page errors: ${row.pageErrors.slice(0, 2).join(' | ')}`);
    }
    await page.close();
  }

  if (row.reach !== 'DRAWN') return row;

  /* ── 2 · REDUCED MOTION, on the live page ────────────────────────────────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.problems.push(`reaches a frame normally but ${got.state} under prefers-reduced-motion: reduce`);
      row.axes.reducedMotion = { reached: false };
    } else {
      /*
       * The window starts NOW, not at load: everything before the frame is setup, and counting it would charge
       * the surface for the frames it needed to exist.
       *
       * TWO NUMBERS, AND ONLY ONE OF THEM IS A VERDICT. `drawsAfterDrawn` is draw calls on the contexts THIS
       * TOGGLE created, which nothing else on the page can produce, and it is what the finding is raised on.
       * `rafAfterDrawn` is page-wide and reported as CONTEXT ONLY — on these routes the shell, ReactFlow and
       * the entrance transitions all schedule frames, so it is a fact about the page and not about the relief.
       */
      /*
       * ── THE PER-SURFACE FLOOR, BECAUSE THE CONTROL RUN ONLY PROVES ONE CONTEXT ─────────
       *
       * E8's control run proves the counter works on E8's context. It does not prove the wrapper caught the
       * draw calls THIS surface makes: a renderer reaching the screen through a call this probe does not wrap
       * would report 0 for ever, and 0 is the passing value. So the cumulative count is read BEFORE the window
       * is reset — the frame the reader is looking at has already been drawn, so it must be non-zero.
       */
      const drawsSoFar = await guarded(page, () => page.evaluate(
        (from) => globalThis.__lcxAudit.contexts.slice(from).reduce((n, c) => n + c.draws, 0),
        got.preClick ?? 0,
      ));
      if (drawsSoFar === 0) {
        row.problems.push('the draw counter recorded ZERO draws on this surface\'s own context even though a '
          + 'frame is on screen, so it does not see this renderer\'s draw path and the zero below is not a '
          + 'measurement');
      }
      const win = await cleanWindow(page, () => page.evaluate((from) => new Promise((ok) => {
        const a = globalThis.__lcxAudit;
        a.raf = 0;
        for (const c of a.contexts) c.draws = 0;
        setTimeout(() => ok({
          raf: a.raf,
          draws: a.contexts.slice(from).reduce((n, c) => n + c.draws, 0),
          drawsAll: a.contexts.reduce((n, c) => n + c.draws, 0),
        }), 600);
      }), got.preClick ?? 0));
      if (win === null) {
        row.axes.reducedMotion = { reached: true, unmeasured: true };
        row.problems.push('the page kept navigating, so no clean 600 ms window could be taken under '
          + 'prefers-reduced-motion: reduce — this axis is UNMEASURED here, NOT passing');
      } else {
        row.axes.reducedMotion = {
          reached: true, drawsBeforeWindow: drawsSoFar,
          rafAfterDrawn: win.raf, drawsAfterDrawn: win.draws, drawsAllContexts: win.drawsAll,
        };
        if (win.draws > 0) {
          row.problems.push(`kept drawing after its first frame under prefers-reduced-motion: reduce — `
            + `${win.draws} draw calls in 600 ms on the ${row.contextsByToggle} context(s) this surface created `
            + '(§6 rule 2: zero idle motion; rule 3: reduced motion resolves to the FINAL frame)');
        }
      }
    }
    await page.close();
  }

  /*
   * ── 2b · THE CONTROL RUN, and it is what makes every zero above mean anything ──────
   *
   * A rAF counter that is broken reports 0 for every surface, and 0 is the passing value — so the reduced
   * motion audit above is exactly the shape of check this programme keeps catching: one that cannot fail.
   * `docs/3d/e9/README.md` records its own version of this as a VACUOUS pass, because no harness animates.
   *
   * One app surface does animate, by design and by name: `ForgeBackdrop` runs a five-second arc
   * (`SWEEP_MS = 5000`) unless the reader has asked for reduced motion. So on that surface, and only there,
   * this sweep also loads with NO motion preference and requires the counter to see frames. If it sees none,
   * the instrument is broken and the zeros elsewhere are withdrawn rather than reported.
   */
  if (surface.animatesByDesign) {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.problems.push('the control run for the animation counter could not reach a frame, so the '
        + 'reduced-motion zeros in this sweep are UNPROVEN');
      row.axes.control = { reached: false };
    } else {
      const window600 = () => page.evaluate(() => new Promise((ok) => {
        const a = globalThis.__lcxAudit;
        for (const c of a.contexts) c.draws = 0;
        setTimeout(() => ok(a.contexts.reduce((n, c) => n + c.draws, 0)), 600);
      }));
      /*
       * THE ARC STARTS WHEN THE RENDERER MOUNTS, WHICH IS WHY THIS WINDOW DOES NOT SETTLE FIRST.
       *
       * `SWEEP_MS` is 5000 and the settle in `cleanWindow` waits three quiet seconds — so a settled window can
       * legitimately open after the arc has already finished, and the zero it then reports would be correct
       * behaviour presented as a broken instrument. Taken immediately instead, and VOIDED rather than believed
       * if a navigation lands inside it: `/select` performs one document navigation about two seconds in, and
       * the recovery is to wait for the new document's frame before trying again.
       */
      const during = await cleanWindow(page, window600, {
        settle: false,
        recover: () => waitForDrawn(page, 45_000),
      });
      /* And then it must STOP. The arc is five seconds; past it, a surface still drawing is idle motion, which
         is what §6 rule 2 forbids. This one DOES settle: by now the page is quiet and the arc is over. */
      await page.waitForTimeout(6500);
      const after = await cleanWindow(page, window600);
      if (during === null || after === null) {
        row.axes.control = { reached: true, unmeasured: true };
        row.problems.push('the control run could not get a clean window, so the reduced-motion zeros in this '
          + 'sweep are UNPROVEN rather than confirmed');
      } else {
        row.axes.control = { reached: true, drawsDuringSweep: during, drawsAfterSweep: after };
        if (during === 0) {
          row.problems.push('the draw-call counter saw ZERO draws on a surface documented to animate for '
            + '5000 ms, so it cannot distinguish "stopped" from "not measured" — every reduced-motion zero in '
            + 'this sweep is unproven');
        }
        if (after > 0) {
          row.problems.push(`still drawing ${after} times per 600 ms after its 5000 ms arc has finished `
            + '(§6 rule 2: zero idle motion)');
        }
      }
    }
    await page.close();
  }

  /*
   * ── 2c · WHAT A TOGGLE OFF RELEASES — the measurement §10.4 asked for ────────────────
   *
   * `3D_VFX_FINAL_PLAN.md` §10.4 records, as newly-found and unmeasured work, that `stage.dispose()` never
   * called `WEBGL_lose_context.loseContext()`, so "toggling a relief off and on can hold more live contexts
   * than there are mounted components — against a cap where exceeding it kills the OLDEST, which on a chart
   * route is the one shared context every chart depends on."
   *
   * `packages/gl/src/stage.ts:322-360` now DOES lose the context, gated on the canvas being detached. So this
   * axis is not here to restate the hazard — it is here to check the fix in a real browser, and to keep
   * checking it. It is measured rather than read off the source for the reason the whole programme keeps
   * relearning: a claim about which branch runs is worth exactly as much as the trace behind it.
   */
  if (surface.toggle !== null) {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.release = { reached: false };
    } else {
      const on = await guarded(page, () => page.evaluate(readAudit));
      const btn = page.getByRole('button', { name: surface.toggle });
      await btn.first().scrollIntoViewIfNeeded();
      await btn.first().click();
      /* The canvas has to be off the document and React's cleanup has to have run before `dispose` can decide
         the canvas is detached, which is the condition the fix turns on. */
      await page.waitForTimeout(2000);
      const off = await guarded(page, () => page.evaluate(readAudit));
      row.axes.release = {
        reached: true,
        notLostWithReliefOn: on.notLost,
        notLostAfterToggleOff: off.notLost,
        createdTotal: off.created,
      };
      const releasedByToggle = on.notLost - off.notLost;
      if (releasedByToggle < (row.contextsByToggle ?? 1)) {
        row.problems.push(`switching the relief off released ${releasedByToggle} of the `
          + `${row.contextsByToggle} context(s) it created — ${off.notLost} are still not reporting `
          + '`isContextLost()`. Past the browser cap of 8-16 the OLDEST context is killed silently, and on a '
          + 'route that draws charts that is the shared one (3D_VFX_FINAL_PLAN.md §10.4)');
      }
    }
    await page.close();
  }

  /* ── 3 · PRINT, with the relief ON — the configuration nothing else in the repo checks ── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.print = { reached: false };
      row.problems.push(`reaches a frame normally but ${got.state} on the print pass`);
    } else {
      const before = await guarded(page, () => page.evaluate(readCanvases));
      await page.emulateMedia({ media: 'print' });
      /* One frame for the print stylesheet to apply before anything is measured. */
      await page.waitForTimeout(400);
      const after = await guarded(page, () => page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
          const b = c.getBoundingClientRect();
          return {
            shown: getComputedStyle(c).display !== 'none' && b.width > 4 && b.height > 4,
            h: Math.round(b.height),
            /* `.br-no-print` is the house class `PrintStyles.tsx:55` deletes from the printed sheet. Which
               canvases carry it is the difference between a page that thought about print and one that did
               not — on CommandDeck the signature backdrop is inside it and the relief is not. */
            noPrint: c.closest('.br-no-print') !== null,
          };
        });
        /* THE FLAT SURFACE, as the reader would find it on paper. Compared against the census taken with the
           relief OFF: every wrapper SWAPS rather than layers, so the question is whether opening the relief
           takes readable data OUT of the printed document. */
        const flatTables = document.querySelectorAll('table').length;
        const flatSvgs = Array.from(document.querySelectorAll('svg'))
          .filter((s) => s.querySelector('text') !== null).length;
        /* The toggle and its "nobody has yet timed whether it answers faster" sentence. On a page with a
           print sheet these are chrome; `GpsPrint.tsx:94` records the same class of defect in the same
           words — "a button printed on a client proposal". */
        const controls = Array.from(document.querySelectorAll('button'))
          .filter((b) => /view:\s*(on|off)/i.test(b.textContent ?? ''))
          .map((b) => ({
            text: (b.textContent ?? '').trim().slice(0, 30),
            printed: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 1,
            noPrint: b.closest('.br-no-print') !== null,
          }));
        /*
         * THE MECHANISM, MEASURED RATHER THAN ASSUMED. `PrintStyles.tsx:93-94` hides `[data-relief-live]`
         * and reveals `[data-relief-print-flat]` in print, and the flat copy carries `display:none` as an
         * INLINE style so it stays hidden on a page with no sheet — which means the rule's `!important` is
         * the only thing that can bring it back, and whether it did is a fact about the live document.
         *
         * Which page mounts the sheet is read off the page's own stylesheets rather than declared in this
         * file's surface table: a hand-maintained boolean is exactly the kind of claim that is true when
         * typed and false when read.
         */
        const sheetPresent = Array.from(document.querySelectorAll('style'))
          .some((st) => (st.textContent ?? '').includes('[data-relief-print-flat]'));
        const laidOut = (el) => {
          const b = el.getBoundingClientRect();
          return getComputedStyle(el).display !== 'none' && b.height > 4 && b.width > 4;
        };
        const live = Array.from(document.querySelectorAll('[data-relief-live]'));
        const flatCopy = Array.from(document.querySelectorAll('[data-relief-print-flat]'));
        return {
          canvases, flatTables, flatSvgs, controls, sheetPresent,
          liveMarked: live.length,
          liveStillShown: live.filter(laidOut).length,
          flatCopyPresent: flatCopy.length,
          flatCopyShown: flatCopy.filter(laidOut).length,
        };
      }));

      /*
       * AND THE PDF, because a computed style is not ink. `reliefPrintPath.test.tsx:41-43` names this exact
       * item as unverified: `createStage` sets `preserveDrawingBuffer: true` so the buffer "should print, but
       * nobody has produced the PDF". Producing it is one call, and the answer is either an image in the
       * file or not.
       */
      let pdf = null;
      try {
        const buf = await guarded(page, () => page.pdf({ printBackground: true, format: 'A4' }));
        pdf = { bytes: buf.length, hasImage: buf.includes(Buffer.from('/Image')) };
      } catch (e) {
        pdf = { error: String(e).slice(0, 90) };
      }

      const flatBefore = got.flatBefore ?? { tables: 0, svgsWithText: 0 };
      const lostTables = Math.max(0, flatBefore.tables - after.flatTables);
      const lostSvgs = Math.max(0, flatBefore.svgsWithText - after.flatSvgs);
      row.axes.print = {
        reached: true,
        canvasesShownOnScreen: before.filter((c) => c.shown).length,
        canvasesShownInPrint: after.canvases.filter((c) => c.shown).length,
        canvasesInsideNoPrint: after.canvases.filter((c) => c.noPrint).length,
        flatBefore, flatTables: after.flatTables, flatSvgsWithText: after.flatSvgs,
        lostTables, lostSvgs,
        controls: after.controls,
        sheetPresent: after.sheetPresent,
        liveMarked: after.liveMarked, liveStillShown: after.liveStillShown,
        flatCopyPresent: after.flatCopyPresent, flatCopyShown: after.flatCopyShown,
        pdf,
      };

      const printedControls = after.controls.filter((c) => c.printed && !c.noPrint);
      if (after.sheetPresent && printedControls.length > 0) {
        row.problems.push(`the relief toggle prints as furniture on a page that mounts the print sheet: `
          + `${printedControls.map((c) => `"${c.text}"`).join(', ')} is outside \`.br-no-print\``);
      }

      /*
       * ── WHAT IS AND IS NOT A FINDING ON THIS AXIS, and the gate is `sheetPresent` ────────────────
       *
       * A page with NO print sheet prints its dark theme, its chrome and its clipped scroll containers for
       * everything on it, relief or not. Losing a figure to a canvas there is not a separate defect and is
       * recorded in the table rather than raised — `reliefPrintPath.test.tsx:298-318` makes exactly this
       * distinction and calls it "not a defect and not a licence". A page WITH the sheet has a designed print
       * output and every clause below is a promise it makes.
       */
      if (after.sheetPresent) {
        if (after.liveMarked === 0) {
          row.problems.push('a relief is open on a page with a designed print output and NOTHING carries '
            + '`data-relief-live`, so PrintStyles.tsx:93 cannot match it — the canvas prints');
        } else if (after.liveStillShown > 0) {
          row.problems.push(`${after.liveStillShown} of ${after.liveMarked} \`[data-relief-live]\` blocks are `
            + 'still laid out under print media, so the live relief reaches paper (PrintStyles.tsx:93)');
        }
        if (after.flatCopyPresent === 0) {
          row.problems.push('no `[data-relief-print-flat]` copy exists while the relief is open, so hiding '
            + 'the live block prints nothing in its place (PrintStyles.tsx:94)');
        } else if (after.flatCopyShown === 0) {
          row.problems.push('the `[data-relief-print-flat]` copy stayed hidden under print media — its '
            + 'inline `display:none` was not beaten, so the printed page has neither the relief nor the flat '
            + 'figure (PrintStyles.tsx:94 needs its `!important`)');
        }
      }
    }
    await page.close();
  }

  /* ── 4 · A LOST CONTEXT, provoked for real ───────────────────────────────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.contextLoss = { reached: false };
      row.problems.push(`reaches a frame normally but ${got.state} on the context-loss pass`);
    } else {
      /*
       * Through the real `WEBGL_lose_context` extension, which is how Chrome itself simulates the event —
       * not a synthetic `dispatchEvent`, which would prove only that a listener exists.
       *
       * TARGETED AT THE CONTEXTS THE TOGGLE CREATED, and that is a correction rather than a refinement. The
       * first version lost the first non-lost context it found and then asserted that the relief had failed to
       * name the refusal. On `/command-deck` the first context is the SHARED 2-D renderer behind the deck; the
       * relief's `webglcontextlost` listener is registered on its OWN canvas and is correctly not called for
       * someone else's, so the sweep produced a finding about a branch it had never reached — the exact error
       * an adversarial pass caught twice in `3D_VFX_FINAL_PLAN.md` §10.6.
       *
       * The census's recorded contexts are used rather than a fresh `getContext` call: asking a canvas for a
       * context it already has returns the same object, but asking for the WRONG api returns null and the
       * probe would then report "could not provoke" about a canvas that was perfectly losable.
       */
      /* Marked so the canvases THIS surface owns can be told from the page's own — on `/command-deck` the
         signature backdrop's canvas stays on screen through a relief's context loss, correctly, and counting it
         as "a dead canvas left behind" would be a finding about the wrong element. */
      await guarded(page, () => page.evaluate((from) => {
        for (const c of globalThis.__lcxAudit.contexts.slice(from)) c.canvas.dataset.auditTarget = '1';
      }, got.preClick ?? 0));
      /* The before/after PNG byte pair is the evidence this axis turns on, and a byte count taken mid-arc
         is a number that moves on its own. Settled first so the pair describes the loss and nothing else. */
      row.axes.contextLoss = { settle: await settleForCapture(page) };
      const target = page.locator('canvas[data-audit-target="1"]').first();
      const shot = async () => {
        try { return await target.screenshot({ timeout: 8000 }); } catch { return null; }
      };
      /* PIXELS, BECAUSE `display` IS NOT WHAT THE READER SEES. This is the measurement that first established
         the harness's own context-loss defect: an element screenshot that fell from 101,420 to 5,140 bytes
         while `document.title` still said READY and every DOM check passed. A PNG of a uniform rectangle
         compresses to almost nothing, so a collapse in bytes is a blank canvas. */
      const shotBefore = await shot();

      const provoked = await guarded(page, () => page.evaluate((from) => {
        let n = 0;
        for (const { gl } of globalThis.__lcxAudit.contexts.slice(from)) {
          if (gl.isContextLost()) continue;
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) { ext.loseContext(); n += 1; }
        }
        return n > 0;
      }, got.preClick ?? 0));
      await page.waitForTimeout(1200);
      const shotAfter = await shot();
      const after = await guarded(page, () => page.evaluate(() => {
        const laidOut = (el) => {
          const b = el.getBoundingClientRect();
          return getComputedStyle(el).display !== 'none' && b.width > 4 && b.height > 4;
        };
        return {
          canvasesShown: Array.from(document.querySelectorAll('canvas')).filter(laidOut).length,
          ownCanvasesShown: Array.from(document.querySelectorAll('canvas[data-audit-target="1"]')).filter(laidOut).length,
          alert: document.querySelector('[role="alert"]')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? null,
          pressed: Array.from(document.querySelectorAll('button[aria-pressed]'))
            .filter((b) => /view:/i.test(b.textContent ?? ''))
            .map((b) => b.getAttribute('aria-pressed')),
          flatTables: document.querySelectorAll('table').length,
          flatSvgsWithText: Array.from(document.querySelectorAll('svg')).filter((s) => s.querySelector('text')).length,
        };
      }));
      after.bytesBefore = shotBefore?.length ?? null;
      after.bytesAfter = shotAfter?.length ?? null;
      row.axes.contextLoss = { ...row.axes.contextLoss, reached: true, provoked, ...after };
      if (!provoked) {
        /* NOT A PASS. An audit that could not stage its own failure has measured nothing — the same rule as
           refusing an empty surface list, and the same one `3d-audit.mjs:318-321` applies. */
        row.problems.push('could not provoke a context loss on any context this toggle created '
          + '(no WEBGL_lose_context, or the toggle created none) — this axis proved nothing');
      } else if (surface.toggle !== null) {
        const flat = after.flatTables + after.flatSvgsWithText;
        if (after.alert === null) {
          row.problems.push('a lost WebGL context was never named to the reader (no live region appeared)');
        }
        if (after.pressed.some((p) => p === 'true')) {
          row.problems.push('the relief toggle still reads pressed after the context was lost');
        }
        if (after.ownCanvasesShown > 0 && flat === 0) {
          row.problems.push('a lost WebGL context left this surface\'s own canvas laid out with no readable '
            + 'flat figure anywhere on the page — the wrapper did not swap back');
        }
      } else {
        /*
         * ── E8, AND A FINDING I WITHDREW ON LOOKING AT THE PIXELS ─────────────────────────────────────
         *
         * `ForgeBackdrop` is the one relief surface in `apps/web` with no `webglcontextlost` listener anywhere
         * in the file, and after the loss its canvas is still laid out with no data figure behind it. On the
         * DOM evidence alone that is the harness's own defect exactly — a dead canvas left in front of the
         * reader — and this sweep raised it as a finding on the sign-in route, which is the worst place for it.
         *
         * IT IS NOT TRUE. The element screenshots settle it: after the loss the canvas composites as
         * TRANSPARENT and `ForgePlate`'s gradient — the CSS fallback §6 rule 1 relies on for this screen —
         * shows through with the whole form intact and readable. `alpha: false` governs the drawing buffer, not
         * what a lost context presents. So the byte pair does not support the claim either: it went UP
         * (127,994 → 315,019 on one run), and I had asserted a collapse.
         *
         * What is left is a real difference in KIND, recorded rather than raised: the other seven surfaces hide
         * the canvas and name the refusal, while this one relies on the compositor to reveal the plate. Nothing
         * tells the reader the object went away, and nothing needs to — it carries no data. The captures are
         * written next to the report so the next person can check this rather than take it from me.
         */
        row.axes.contextLoss.noListener = true;
        row.axes.contextLoss.captures = null;
        if (after.ownCanvasesShown > 0) {
          try {
            mkdirSync(SHOTS, { recursive: true });
            const stem = `${surface.id.toLowerCase()}-context-loss`;
            if (shotBefore) writeFileSync(join(SHOTS, `${stem}-before.png`), shotBefore);
            if (shotAfter) writeFileSync(join(SHOTS, `${stem}-after.png`), shotAfter);
            row.axes.contextLoss.captures = shotBefore && shotAfter ? stem : null;
          } catch { row.axes.contextLoss.captures = null; }
        }
      }
    }
    await page.close();
  }

  return row;
}

/* ══ AXIS 5 · THE THEME, AND WHETHER THE READING SURVIVES A WHITE PAGE ════════════════
 *
 * The platform shipped a light theme for its 3-D surfaces and NOTHING captured it. Six of the seven shipping
 * surfaces bind to `packages/gl/src/look/theme.ts`; `StormRelief` deliberately does not and says why in
 * arithmetic in its own file. Rule 8 of this programme's doctrine is that every claim gets a capture, and the
 * light theme had none — so "six surfaces render correctly on a white page" was, until this pass, prose.
 *
 * The question this answers is NOT "does it look nice". It is three facts per surface per theme:
 *   (a) did it paint at all — separable from "rendered a uniform rectangle", which looks identical in a report;
 *   (b) mean and standard deviation of luminance, because a light scene that has COLLAPSED TO NEAR-UNIFORM is
 *       the specific failure the theme was designed to avoid, and `sdLuma` is the number that says so;
 *   (c) whether the data marks are still separable from the scenery, as a contrast ratio between the two
 *       populations the derived chroma floor splits the buffer into.
 *
 * DARK IS RUN FIRST AND IT IS THE CONTROL, not a second data point. A GL surface that has not painted captures
 * as a blank or transparent rectangle, and in the light theme a blank capture is indistinguishable from "the
 * light theme renders nothing" — the single most expensive mistake this pass could make. So a light reading is
 * only believed once the SAME surface, reached the same way, has been shown non-uniform in dark.
 */
const THEME_ORDER = ['dark', 'light'];

/**
 * Prove the pixel instrument can see structure AND can report uniformity, before a single surface is judged.
 *
 * This is not ceremony. `sdLuma ≈ 0` is the finding this pass exists to raise, and an instrument that returns
 * zero because its readback is broken raises it on every surface — so the negative control is as load-bearing
 * as the positive one. Both patterns are built from the DERIVED palette rather than from literals typed here,
 * so a palette change moves the control with it.
 */
async function validateInstrument(browser, palette) {
  /* Through `openPage` like everything else: the controls are drawn with the page's own 2-D context, and a
     control validated in a different environment from the surfaces validates nothing about them. */
  const page = await openPage(browser, { viewport: { width: 320, height: 240 } });
  try {
    const dataHex = palette.dataVisible[0].hex;
    const sceneHex = palette.scenery.light[0].hex;
    const built = await page.evaluate(({ a, b }) => {
      const mk = (id, paint) => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64; c.dataset.auditTarget = '1'; c.id = id;
        paint(c.getContext('2d'));
        document.body.appendChild(c);
      };
      /* POSITIVE: half a data hue, half a scenery hue. Must read as ~50% data, two colours, non-zero sd. */
      mk('ctl-split', (x) => { x.fillStyle = a; x.fillRect(0, 0, 32, 64); x.fillStyle = b; x.fillRect(32, 0, 32, 64); });
      /* NEGATIVE: one scenery hue everywhere. Must read as zero sd, one colour, no data pixels — which is
         exactly the "collapsed to near-uniform" shape, produced on purpose so it is known to be detectable. */
      mk('ctl-flat', (x) => { x.fillStyle = b; x.fillRect(0, 0, 64, 64); });
      return true;
    }, { a: dataHex, b: sceneHex });
    if (!built) return { ok: false, why: 'controls could not be built' };
    const [split, flat] = await page.evaluate(readPixelStats, palette.chromaFloor);
    const checks = [
      ['positive control is readable', split?.readable === true],
      ['positive control reports two colours', split?.distinctColours === 2],
      ['positive control splits ~50/50 data vs scenery', Math.abs(split.dataPct - 50) < 2],
      ['positive control has non-zero luminance spread', split.sdLuma > 1],
      ['positive control is opaque, so transparent stays separable', Math.round(split.meanAlpha) === 255],
      ['negative control reports ONE colour', flat?.distinctColours === 1],
      ['negative control has ZERO luminance spread', flat.sdLuma < 0.001],
      ['negative control finds no data pixels', flat.dataPct === 0],
    ];
    return { ok: checks.every(([, v]) => v), checks, split, flat, dataHex, sceneHex };
  } finally { await page.close(); }
}

/** What theme the app ACTUALLY applied, read off the document rather than off what this script asked for. */
const readAppliedTheme = () => ({
  darkClass: document.documentElement.classList.contains('dark'),
  /* The class is the switch, but the tokens are what anything actually paints with — so both are read. A
     class present with light tokens would be a broken stylesheet, and is a different fault from a class that
     never arrived. */
  card: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(),
  bodyBg: getComputedStyle(document.body).backgroundColor,
});

async function captureTheme(browser, surface, theme, palette) {
  const page = await newSeatedPage(browser, surface, [], theme);
  try {
    const got = await reach(page, surface);
    const applied = await page.evaluate(readAppliedTheme).catch(() => null);
    const observed = applied === null ? null : (applied.darkClass ? 'dark' : 'light');
    const base = { theme, observed, applied, reach: got.state, detail: got.detail ?? null };
    if (got.state !== 'DRAWN') return base;
    /* THE PHASE, HELD FIXED BEFORE ANY PIXEL IS READ. Every statistic below and both captures come off the
       frame that is on screen after this returns, so a surface that is still animating must not be read. */
    base.settle = await settleForCapture(page);

    /* The same ownership mechanism the context-loss axis uses: contexts from `preClick` on are the ones this
       toggle created, and only those canvases are this surface's own. On `/command-deck` the alternative is
       measuring the signature backdrop and calling it the relief. */
    await page.evaluate((from) => {
      for (const c of globalThis.__lcxAudit.contexts.slice(from)) c.canvas.dataset.auditTarget = '1';
    }, got.preClick ?? 0);

    const stats = await page.evaluate(readPixelStats, palette.chromaFloor);
    mkdirSync(THEME_SHOTS, { recursive: true });
    const stem = `${surface.id.toLowerCase()}-${surface.name.toLowerCase()}-${theme}`;
    const shots = {};
    try {
      const png = await page.locator('canvas[data-audit-target="1"]').first().screenshot({ timeout: 10_000 });
      writeFileSync(join(THEME_SHOTS, `${stem}-canvas.png`), png);
      shots.canvas = { file: `${stem}-canvas.png`, bytes: png.length };
    } catch (e) { shots.canvas = { error: String(e).slice(0, 80) }; }
    try {
      /* THE VIEWPORT SHOT IS THE ONE THAT ANSWERS THE QUESTION. The canvas crop is where the statistics come
         from, but "does the surface still deliver its reading on a WHITE PAGE" is about the surface against
         the page around it, and the canvas's own buffer cannot show that. */
      const png = await page.screenshot({ timeout: 15_000 });
      writeFileSync(join(THEME_SHOTS, `${stem}-viewport.png`), png);
      shots.viewport = { file: `${stem}-viewport.png`, bytes: png.length };
    } catch (e) { shots.viewport = { error: String(e).slice(0, 80) }; }
    return { ...base, stats, shots, stem };
  } finally { await page.close(); }
}

/**
 * One surface, both themes, dark first — and every verdict below is a comparison against that surface's OWN
 * dark twin rather than against a threshold typed into this file.
 *
 * That choice matters: these eight surfaces draw wildly different amounts of geometry, so a global "sdLuma
 * must exceed N" would pass a busy scene that lost half its contrast and fail a sparse one that is working as
 * designed. A surface compared against itself has a baseline nobody had to guess.
 */
async function themeRow(browser, surface, palette) {
  const row = { id: surface.id, name: surface.name, route: surface.route, glFile: surface.glFile, byTheme: {}, problems: [] };
  for (const theme of THEME_ORDER) row.byTheme[theme] = await captureTheme(browser, surface, theme, palette);

  for (const theme of THEME_ORDER) {
    const r = row.byTheme[theme];
    if (r.observed !== null && r.observed !== theme) {
      row.problems.push(`asked for the ${theme} theme and the app applied ${r.observed} `
        + `(\`--card: ${r.applied.card}\`, body \`${r.applied.bodyBg}\`) — the capture is labelled by what was `
        + 'REQUESTED, so this row\'s comparison is void rather than a finding about the renderer');
    }
  }

  const dark = row.byTheme.dark, light = row.byTheme.light;
  if (dark.reach !== 'DRAWN' || light.reach !== 'DRAWN') {
    if (dark.reach !== light.reach) {
      row.problems.push(`reached differently per theme: dark \`${dark.reach}\`, light \`${light.reach}\``);
    }
    return row;
  }
  const ds = dark.stats?.[0], ls = light.stats?.[0];
  if (!ds?.readable || !ls?.readable) {
    row.problems.push('the drawing buffer could not be read back on at least one theme, so nothing about this '
      + `surface's light behaviour is established (dark: ${ds?.why ?? 'ok'}, light: ${ls?.why ?? 'ok'})`);
    return row;
  }

  /*
   * THE CONTROL CLAUSE. A light capture may only be called blank once the dark twin has been shown non-blank
   * by the same statistic through the same code path — otherwise "the light theme renders nothing" and "my
   * harness captured nothing" produce the identical report, and this programme has been misled by exactly
   * that shape four times.
   */
  row.darkIsControl = ds.sdLuma > 1 && ds.distinctColours > 2;
  if (!row.darkIsControl) {
    row.problems.push(`the DARK capture is itself near-uniform (sd ${ds.sdLuma.toFixed(2)}, `
      + `${ds.distinctColours} colours), so it cannot serve as the positive control — no verdict about this `
      + 'surface\'s LIGHT capture is drawn, in either direction');
    return row;
  }

  /*
   * ── TWO RATIOS, AND THE SECOND ONE EXISTS BECAUSE THE FIRST FLATTERED A BROKEN SURFACE ──
   *
   * `sdRatio` alone said E6 VaultRelief IMPROVED by 743% on the light theme. The captures show the opposite:
   * in dark the vault carries its 18 blue record marks, and in light they have dissolved into a smooth white
   * haze that has a LARGER luminance spread and carries no data at all. A gradient is spread without
   * information, so a luminance statistic cannot be the verdict on its own.
   *
   * `markRatio` is the correction: the top of the chroma distribution is where the data marks live, because
   * every scenery colour in both themes is a desaturated blue-grey. It needs no threshold and it moves in the
   * direction of the reading rather than in the direction of the picture.
   */
  row.sdRatio = ls.sdLuma / ds.sdLuma;
  row.rangeRatio = (ls.p99 - ls.p01) / Math.max(1, ds.p99 - ds.p01);
  /*
   * TWO CHROMA RATIOS AND THE WORSE OF THEM DECIDES, because they fail on different shapes of mark and this
   * pass has now been caught by both. p99.9 misses a SPARSE population: E6 VaultRelief draws 18 record marks
   * over a large vault, and at p99.9 they barely register (34 in dark) even though the captures show them
   * plainly. The maximum catches those — and would be fooled on its own by a single stray antialiased pixel,
   * which is why p99.9 stays. Taking the minimum means a surface has to hold BOTH to pass.
   */
  row.markP999Ratio = ds.p999Chroma > 0 ? ls.p999Chroma / ds.p999Chroma : null;
  row.markMaxRatio = ds.maxChroma > 0 ? ls.maxChroma / ds.maxChroma : null;
  row.markRatio = (row.markP999Ratio === null || row.markMaxRatio === null)
    ? (row.markP999Ratio ?? row.markMaxRatio)
    : Math.min(row.markP999Ratio, row.markMaxRatio);
  row.contrastRatio = (ls.dataVsSceneryContrast ?? 0) / (ds.dataVsSceneryContrast ?? 1);

  /* THE FLAT-OUT COLLAPSE, which needs no comparison to be a failure. */
  if (ls.sdLuma < 1) {
    row.problems.push('WORSE IN LIGHT — the light capture has collapsed to near-uniform: luminance sd '
      + `${ls.sdLuma.toFixed(2)} against ${ds.sdLuma.toFixed(2)} in dark on the same surface reached the same `
      + 'way. This is the exact failure mode `look/theme.ts` was written to avoid');
  } else if (row.sdRatio < 0.8) {
    /*
     * 0.8 RATHER THAN 0.5, AND THE CHANGE IS A CORRECTION RATHER THAN A TIGHTENING. At 0.5, E1 DeckRelief
     * passed at 53% — a surface whose own caption reads "DEPTH IS THE PANEL YOU ADDRESS · DEPTH ORDER IS THE
     * DECK'S OWN", printed as "holds up" while its panels had lost nearly half their separation from the
     * ground. A band that prints a 47% loss of contrast as a pass is a band chosen to produce pleasant output.
     */
    row.problems.push(`WORSE IN LIGHT — luminance spread fell to ${(row.sdRatio * 100).toFixed(0)}% of its `
      + `dark value (sd ${ds.sdLuma.toFixed(2)} → ${ls.sdLuma.toFixed(2)}, p01→p99 range `
      + `${ds.p99 - ds.p01} → ${ls.p99 - ls.p01}); the scene is flatter on a white page than on a black one, `
      + 'which is the direction the light rig was retuned to prevent');
  }

  /* THE DATA MARKS, which is the question the luminance statistics cannot answer. */
  if (row.markRatio !== null && row.markRatio < 0.6) {
    row.problems.push('WORSE IN LIGHT — the data marks lost their colour: p99.9 chroma '
      + `${ds.p999Chroma} → ${ls.p999Chroma} (${(row.markP999Ratio * 100).toFixed(0)}%) and the most `
      + `saturated pixel anywhere in the buffer ${ds.maxChroma} → ${ls.maxChroma} `
      + `(${(row.markMaxRatio * 100).toFixed(0)}%); the share above the derived data-chroma floor of `
      + `${palette.chromaFloor} went ${ds.dataPct.toFixed(2)}% → ${ls.dataPct.toFixed(2)}%. Scenery may move `
      + 'between themes; a DATA colour may not (`look/theme.ts`: "a theme may NOT tint a mark to suit its '
      + 'background"), so a mark that desaturates on a white page is the taxonomy being broken downstream of '
      + 'the palette rather than by it');
  } else if (ls.dataPct === 0 && ds.dataPct > 0) {
    row.problems.push(`WORSE IN LIGHT — ${ds.dataPct.toFixed(2)}% of the dark buffer clears the data-chroma `
      + 'floor and **none** of the light buffer does, so the data marks are not separable from the scenery on '
      + 'a white page');
  } else if (ls.dataVsSceneryContrast !== null && ds.dataVsSceneryContrast !== null
    && ls.dataVsSceneryContrast < 1.5 && ds.dataVsSceneryContrast >= 1.5) {
    row.problems.push(`WORSE IN LIGHT — data-to-scenery contrast fell from ${ds.dataVsSceneryContrast.toFixed(2)}:1 `
      + `to ${ls.dataVsSceneryContrast.toFixed(2)}:1, below the 1.5:1 at which two populations stop reading as `
      + 'two populations');
  }

  /*
   * AND THE CASE NEITHER RATIO CATCHES: a surface whose data marks were already invisible in DARK. E6 reports
   * zero data-chroma pixels in both themes, so every ratio above is either null or 1 and every band passes it.
   * Reported here rather than left to a reader to notice that a row of dashes meant something.
   */
  if (ds.dataPct === 0 && ls.dataPct === 0) {
    row.problems.push('NO DATA MARKS IN EITHER THEME — not one pixel of this surface\'s buffer clears the '
      + `derived data-chroma floor of ${palette.chromaFloor} in dark (max chroma ${ds.maxChroma}) or light `
      + `(${ls.maxChroma}), so the data:scenery contrast column is empty for both rows and the chroma ratios `
      + 'are comparing two scenes whose most saturated content is already scenery-grade. Stated rather than '
      + 'left as a row of dashes: this is not a light-theme finding, and it is not a pass either');
  }

  /*
   * A MEASURED LOSS THAT DOES NOT CLEAR THE FINDING BAR IS STILL A LOSS, and printing it as "holds up" is how
   * a capture programme turns into a marketing exercise. E2 GlobeRelief keeps both populations legible —
   * 6.97:1 and 2.93:1 are both well clear of 1.5:1 — while shedding 58% of the separation between them. The
   * verdict column says so instead of rounding it to a pass.
   */
  if (!row.problems.some((p) => p.startsWith('WORSE IN LIGHT'))
    && row.contrastRatio > 0 && row.contrastRatio < 0.6) {
    row.degraded = `data:scenery contrast fell from ${ds.dataVsSceneryContrast.toFixed(2)}:1 to `
      + `${ls.dataVsSceneryContrast.toFixed(2)}:1 (${(row.contrastRatio * 100).toFixed(0)}%) — both still read `
      + 'as two populations, so this is recorded and not raised';
  }
  return row;
}

/* ── RUN ─────────────────────────────────────────────────────────────────────────────── */

if (SURFACES.length === 0) {
  console.error('  REFUSED: no surfaces to sweep. An audit that finds nothing to audit must not report success.');
  process.exit(1);
}

/* Derived before the browser is launched: a palette that cannot be parsed should cost nothing to discover. */
const PALETTE = derivePalette();

/*
 * THE CLOCK, ANNOUNCED AND CHECKED BEFORE ANYTHING IS MEASURED. The fixture's region set is passed in
 * rather than assumed, so the property being checked is the one this run will actually draw.
 */
const FIXTURE_REGIONS = new Set(Array.from({ length: 24 }, (_, i) => mapPoint(i).region));
const FROZEN = checkFrozenInstant(FIXTURE_REGIONS);
const CLOCK_CENSUS = sourcesReadingTheClock(SURFACES);
const FINGERPRINT = sourceFingerprint();
console.log(`  clock frozen at ${FROZEN_AT_ISO} — sub-solar ${FROZEN.subSolarLon.toFixed(3)}°E, `
  + `camera meridian ${FROZEN.meridian.toFixed(3)}°, declination ${FROZEN.declination.toFixed(3)}°`);
console.log(`  terminator across the centre of the globe's frame: ${FROZEN.holds ? 'HOLDS' : 'DRIFTED'} `
  + `(off by ${FROZEN.offBy.toFixed(3)}° of longitude, sites placed: ${FROZEN.placed.join(', ')})`);
console.log(`  source fingerprint ${FINGERPRINT.digest} over ${FINGERPRINT.files} files — two runs may only `
  + 'be compared when this matches');
for (const c of CLOCK_CENSUS.filter((c) => c.hits.length > 0)) {
  console.log(`  · ${c.id} ${c.name} reads the wall clock at ${c.hits.map((h) => `${h.rel}:${h.line}`).join(', ')}`);
}
for (const c of CLOCK_CENSUS.filter((c) => c.deadlines.length > 0)) {
  console.log(`  · ${c.id} ${c.name} bounds work on a WALL-CLOCK DEADLINE at `
    + `${c.deadlines.map((h) => `${h.rel}:${h.line}`).join(', ')} — its frame is a function of machine speed`);
}

const { child, log } = startDevServer();
const rows = [];
const worstRoutes = [];
const themeRows = [];
let instrument = null;
let browser;
/* The rasteriser's own version, because the paragraph below admits these numbers are reproducible on ONE
   browser build — and an admission that does not say WHICH build leaves the reader no way to check. */
let browserVersion = null;
try {
  await waitForServer(log);
  browser = await chromium.launch({
    /* The same three flags `3d-audit.mjs:101-103` uses: headless Chrome has no GPU, so ANGLE is pointed at
       SwiftShader and the unsafe-swiftshader switch is what stops WebGL2 being refused outright. Every frame
       in this sweep is therefore a CPU rasterisation, which is why no timing is reported. */
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browserVersion = browser.version();
  for (const surface of THEME_ONLY ? [] : SURFACES) {
    const row = await sweepSurface(browser, surface);
    rows.push(row);
    const bad = row.problems.length;
    console.log(`  ${bad === 0 ? '✓' : '✗'} ${row.id} ${row.name.padEnd(16)} ${row.reach.padEnd(22)}`
      + `tier ${row.tierStamped ?? '—'}  ctx ${row.contextsNotLost ?? '—'}`
      + (bad ? `  — ${bad} problem${bad > 1 ? 's' : ''}` : ''));
    for (const p of row.problems) console.log(`      · ${p}`);
  }
  /*
   * ── THE WORST ROUTE, WITH EVERY OPT-IN ON AT ONCE ───────────────────────────────────
   *
   * `glContextBudget.test.ts` pins the worst case at 3 and derives it from the import graph: the shared
   * context plus BOTH of `/command-deck`'s independent toggles, which are separate `useState(false)` in
   * separate wrappers with no coordination, so both can be on together. Every pass above engages ONE toggle,
   * so every number above is a lower bound on that route and comparing it to the pin would be comparing two
   * different configurations. This engages every toggle a route has.
   *
   * Derived from the surface table rather than hardcoded to `/command-deck`: a second relief added to any
   * route tomorrow is measured tomorrow.
   */
  const byRoute = new Map();
  for (const r of (THEME_ONLY ? [] : rows).filter((x) => x.reach === 'DRAWN' && x.toggle !== null)) {
    byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r]);
  }
  for (const [route, group] of byRoute) {
    if (group.length < 2) continue;
    const page = await newSeatedPage(browser, { ...group[0], stubs: group.flatMap((g) => g.stubs) });
    try {
      const got = await reach(page, group[0]);
      if (got.state !== 'DRAWN') continue;
      const engaged = [group[0].id];
      for (const other of group.slice(1)) {
        const btn = page.getByRole('button', { name: other.toggle });
        if (await btn.count() === 0) continue;
        await btn.first().scrollIntoViewIfNeeded();
        await btn.first().click();
        if (await waitForDrawn(page, 60_000)) engaged.push(other.id);
      }
      const census = await page.evaluate(readAudit);
      worstRoutes.push({ route, engaged, created: census.created, notLost: census.notLost,
        inDocument: census.inDocument, offscreen: census.offscreen });
      console.log(`  · ${route} with ${engaged.join(' + ')} on together: ${census.notLost} contexts not lost`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  /* ── AXIS 5 · BOTH THEMES, EVERY SURFACE ─────────────────────────────────────────── */
  if (!SKIP_THEME) {
    instrument = await validateInstrument(browser, PALETTE);
    console.log(`\n  instrument: ${instrument.ok ? 'VALIDATED' : 'FAILED'}`
      + ` — data hue ${instrument.dataHex}, scenery hue ${instrument.sceneHex},`
      + ` chroma floor ${PALETTE.chromaFloor}`);
    for (const [what, ok] of instrument.checks ?? []) console.log(`      ${ok ? '✓' : '✗'} ${what}`);
    if (!instrument.ok) {
      /* Refused here rather than reported later: every luminance number below would come off the same
         readback, and an unvalidated instrument reporting "near-uniform" is how a working surface gets
         condemned and a broken one gets a pass. */
      console.error('  REFUSED: the pixel instrument failed its own controls. No theme capture is trustworthy,');
      console.error('  so none is written. A blank reading from a broken readback looks exactly like a blank scene.');
    } else {
      /*
       * THE LEVER, PROVED ON THE LIVE APP BEFORE IT IS USED — including across a reload, which is the thing
       * the seat itself needed proving on. Two surfaces are checked deliberately: one inside `AppLayout`,
       * where the persisted store is the authority, and `/select`, which is outside the shell and is driven
       * by `index.html` instead. A lever proved on only one of those proves nothing about the other.
       */
      const seated = SURFACES.find((s) => s.seat), loose = SURFACES.find((s) => !s.seat);
      instrument.lever = [];
      for (const s of [seated, loose].filter(Boolean)) {
        for (const theme of THEME_ORDER) {
          const page = await newSeatedPage(browser, s, [], theme);
          try {
            await page.goto(BASE + s.route, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(6000);
            const first = await page.evaluate(readAppliedTheme);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(5000);
            const after = await page.evaluate(readAppliedTheme);
            instrument.lever.push({
              id: s.id, route: s.route, seat: s.seat === true, asked: theme,
              got: first.darkClass ? 'dark' : 'light',
              afterReload: after.darkClass ? 'dark' : 'light',
              card: first.card, bodyBg: first.bodyBg,
            });
          } finally { await page.close().catch(() => {}); }
        }
      }
      for (const l of instrument.lever) {
        console.log(`      lever ${l.id} ${l.route.padEnd(15)} asked ${l.asked.padEnd(5)}`
          + ` got ${l.got.padEnd(5)} after reload ${l.afterReload}`
          + `${l.got === l.asked && l.afterReload === l.asked ? '' : '   ← MISMATCH'}`);
      }

      for (const surface of SURFACES) {
        const row = await themeRow(browser, surface, PALETTE);
        themeRows.push(row);
        const d = row.byTheme.dark?.stats?.[0], l = row.byTheme.light?.stats?.[0];
        console.log(`  ${row.problems.length === 0 ? '✓' : '✗'} ${row.id} ${row.name.padEnd(16)}`
          + ` dark ${d?.readable ? `sd ${d.sdLuma.toFixed(1).padStart(5)}` : (row.byTheme.dark.reach ?? '—').padEnd(8)}`
          + `  light ${l?.readable ? `sd ${l.sdLuma.toFixed(1).padStart(5)}` : (row.byTheme.light.reach ?? '—').padEnd(8)}`
          + (row.sdRatio !== undefined ? `   light/dark ${(row.sdRatio * 100).toFixed(0)}%` : ''));
        for (const p of row.problems) console.log(`      · ${p}`);
      }
    }
  }
} finally {
  await browser?.close();
  child.kill('SIGTERM');
}

/* ── THE THEME REPORT — its own file, beside its own captures ────────────────────────── */
if (!SKIP_THEME && instrument?.ok) writeThemeReport();

/*
 * ── THE FREEZE, WRITTEN INTO BOTH REPORTS ──────────────────────────────────────────
 *
 * One generator, two files, for the same reason the palette is derived and the theme binding is grepped: a
 * paragraph about the clock maintained separately in two places is one edit away from disagreeing with
 * itself, and a reader who finds it in only one of them has no way to know which file is the stale one.
 */
function frozenClockSection() {
  const clockReaders = CLOCK_CENSUS.filter((c) => c.hits.length > 0);
  const animators = CLOCK_CENSUS.filter((c) => c.animates);
  /* Every settle this run took, from whichever half of the sweep ran. Only WHETHER it settled is printed:
     a capture taken off a moving frame is the thing that would not reproduce, and how long the wait took
     is a fact about the machine rather than about the surface. */
  const settles = [
    ...themeRows.flatMap((r) => THEME_ORDER
      .filter((t) => r.byTheme[t]?.settle)
      .map((t) => ({ id: r.id, name: r.name, where: `theme/${t}`, ...r.byTheme[t].settle }))),
    ...rows.filter((r) => r.axes.contextLoss?.settle)
      .map((r) => ({ id: r.id, name: r.name, where: 'context-loss', ...r.axes.contextLoss.settle })),
  ];
  const unsettled = settles.filter((s) => s.settled !== true);
  return `## The clock this was measured at — frozen, and why at THIS instant

**Every figure in this file is a figure at one fixed instant, and before the freeze that was not true.**
${clockReaders.length} of the ${CLOCK_CENSUS.length} surfaces reach code that reads the reader's wall clock and draw the answer, so the same
bytes could be reported as catastrophically worse, as mildly worse, or as dramatically better, purely by
the hour the sweep happened to run at. That is not a hazard someone reasoned about: it was found when an
audit and a skeptic reached opposite verdicts on one unchanged commit and **both were right**, and it is
reproducible on demand with the recipe below. Every number this file printed before the freeze was one
sample from that distribution, taken at an hour nobody wrote down.

**The census is grepped, not listed here** — over the wrapper, the renderer, and every local module those
two import. That closure is the point rather than a detail: one surface below reads the clock in its
WRAPPER and would be missed by a census that only opened the file with \`Gl\` in its name, and the
deadline finding further down sits one import from the renderer that owns it, where a census of two file
names cannot see it at all. ${CLOCK_CENSUS.reduce((n, c) => n + c.scanned, 0)} files were scanned across ${CLOCK_CENSUS.length} surfaces:

${clockReaders.length === 0 ? '- **none** — no shipping renderer reaches a wall-clock read. The matcher is checked against a known-positive and a known-negative string before this line is written, so an empty census is a fact about the code and not about the regex.' : clockReaders.map((c) => `- **${c.id} ${c.name}** — ${c.hits.map((h) => `\`${h.rel}:${h.line}\``).join(', ')}`).join('\n')}

**It is import-granular, and deliberately over-reports.** A hit in a shared helper says this surface can
reach that code, not that it calls it — \`lib/format.ts\` is on several of these lists because one of its
exports defaults an argument to \`new Date()\`, whether or not the surface uses that export. A census that
tried to be call-granular would need a type checker to be right and would fail silently when it was not;
this one is wrong only in the direction of naming a file that turns out not to matter.

| the knob | frozen at | what it was before |
|---|---|---|
| wall clock (\`Date\`, \`Date.now\`) | \`${FROZEN_AT_ISO}\` | the machine's clock, at whatever hour the sweep ran |
| fixture ages (\`iso(msAgo)\`) | anchored to the same instant | anchored to a fixed calendar date, so the ages the fixtures expressed grew by one day per day |
| \`Math.random\`, \`crypto.getRandomValues\`, \`crypto.randomUUID\` | seeded \`0x${FROZEN_SEED.toString(16).toUpperCase()}\` | the platform's entropy |
| timezone / locale | \`UTC\` / \`en-GB\` | the host's, which changes what \`toLocaleString()\` renders and how wide it is |
| \`prefers-color-scheme\` / \`prefers-reduced-motion\` / \`prefers-contrast\` / \`forced-colors\` | \`light\` / \`no-preference\` / \`no-preference\` / \`none\` | the host's, and two of them change what the renderers draw |
| device pixel ratio | 1 | the host's, and it is the pixel count every statistic below is computed over |
| animation phase | the frame after the draw counters stop | wherever a flat 1200 ms wait happened to land inside a five-second arc |

**The tree this run swept: \`${FINGERPRINT.digest}\`** over ${FINGERPRINT.files} source files under \`apps/web/src\`,
\`apps/web/index.html\` and \`packages/gl/src\`. Two editions of this file carrying the same digest were swept
over identical bytes and may be compared; two carrying different digests may not. That line exists because
this pass lost an afternoon to its absence: two sweeps minutes apart disagreed about a surface, and the
cause was a change that had landed between them in a file neither report named — so the disagreement read
as evidence of non-determinism when it was evidence of an edit.

**The instant is derived, not picked**, because a frozen clock can flatter as easily as a moving one: an
hour that puts the terminator off the visible face turns the globe into an evenly lit ball, which is a
surface that has stopped being looked at rather than one that passed. Two properties fix it, and both are
re-derived from \`globeSites.ts\` and this sweep's own fixture on every run rather than asserted here:

| property | why it is the honest choice | this run |
|---|---|---|
| the terminator crosses the CENTRE of the frame | \`GlobeReliefGl\` aims its camera at \`centralMeridian([HUB, …sites])\`; the day/night boundary is 90° from the sub-solar point. Putting the sun there leaves the hub at Vaduz in daylight and the US site in night with the boundary between them — the reading this surface exists to draw, at the instant where both populations of pixels are largest | camera meridian **${FROZEN.meridian.toFixed(3)}°**, sub-solar **${FROZEN.subSolarLon.toFixed(3)}°E**, off by **${FROZEN.offBy.toFixed(3)}°** ${FROZEN.holds ? '— holds' : '— **DRIFTED: the instant no longer means what it says, and every globe figure below should be read with that in mind**'} |
| the declination is zero | at a solstice one pole is lit outright and the other dark, so the two northern sites' illumination would move with the SEASON as well as the hour. At the equinox the terminator is exactly a meridian and its position is set by the time of day and nothing else | **${FROZEN.declination.toFixed(3)}°** of latitude, on day-of-year **${FROZEN.doy}** |

A degree of longitude is four minutes of daylight at the terminator, so the **${Math.abs(FROZEN.offBy).toFixed(3)}°** above is
**${(Math.abs(FROZEN.offBy) * 4 * 60).toFixed(1)} seconds** of it — and \`subSolarPoint\`'s own header already declares a ±4° bound from the
equation of time it does not model, so the residual is an order of magnitude inside the model's own error.
The seconds field of the instant is what carries it and must not be tidied into a round number.

### Which numbers in this file predate the freeze

**Every figure in every edition of EITHER generated file that does not carry this section** — that is the
test to apply, rather than a date typed here that would go stale. \`git log --oneline -- docs/3d/app-sweep/README.md\`
and \`git log --oneline -- docs/3d/APP_SWEEP.md\` list them; any revision without the heading above was swept
on the machine's clock at an hour nobody recorded, over a tree nobody digested. That includes every verdict
in it, every ratio, and the surfaces it named as worse in light.

Those figures **cannot be reproduced**, and that is the defect rather than an error in the earlier run:
re-running the same commit gives different numbers. Nothing in this edition is a correction of them — a
correction implies a comparison, and there is none to make. The same applies to any document that quoted
them.

### The verdict on E2 is a function of the hour, and this file reports ONE hour

A RECORDED EXPERIMENT, not a live figure: the numbers below were measured when the freeze landed, by the
four commands beside them, and they are **not** regenerated. They are here because leaving them out would
let this file's single E2 row read as settled when it is not:

| frozen instant | dark data:scenery | light data:scenery | verdict this file would print |
|---|---|---|---|
| \`05:00:00Z\` | 7.21:1 | 1.97:1 | **WORSE IN LIGHT** |
| \`07:18:41Z\` — the instant above | 5.91:1 | 1.67:1 | **degraded** |
| \`09:00:00Z\` | 2.81:1 | 1.44:1 | **WORSE IN LIGHT** |
| \`13:00:00Z\` | 1.62:1 | 4.46:1 | **holds up** |

\`\`\`bash
for H in 05:00:00 07:18:41 09:00:00 13:00:00; do
  APP_SWEEP_CLOCK=2026-09-21T$H.000Z APP_SWEEP_OUT_DIR=/tmp/at-$H APP_SWEEP_THEME_ONLY=1 \\
    node scripts/3d-audit-app.mjs
done
\`\`\`

**13:00Z is the instant that must not be chosen**, and it is the one that reports "holds up": the sun is
then within five degrees of the camera's own meridian, the terminator is off the visible face entirely, and
the globe is an evenly lit ball. The surface passes because nothing was asked of it. The instant this file
uses is fixed by the geometric rule above, which was written before any of these numbers existed — and it
is not the kindest of them.

**The deeper reading, which the freeze makes reproducible without making it true.** The data/scenery
classifier splits on chroma, and sunlit ocean is saturated blue: on this surface most of what lands in the
DATA population is *lit earth*, not markers. So E2's contrast column moves with how much of the disc is in
daylight — which is why it swings by a factor of four across one day and why its verdict follows. Freezing
the clock makes that column repeatable. It does not make it a measurement of the marks, and **no verdict on
E2 should be read as one** until the classifier can tell a pin from an ocean.

The figures BELOW are reproducible, and that is checkable rather than asserted:

\`\`\`bash
APP_SWEEP_OUT_DIR=/tmp/run-a APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
APP_SWEEP_OUT_DIR=/tmp/run-b APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs   # hours later
diff -r /tmp/run-a /tmp/run-b   # compare the two runs; what may legitimately differ, and why,
                                # is itemised under "could NOT close" below — check the source
                                # fingerprint above matches first, or the comparison is void

APP_SWEEP_CLOCK=2026-09-21T19:18:41Z APP_SWEEP_OUT_DIR=/tmp/run-night node scripts/3d-audit-app.mjs
\`\`\`

The last line is what makes the first two mean something. A sweep whose numbers never move is
indistinguishable from an instrument that has stopped reading, so the clock is left drivable: turning it
half a day puts the sub-solar point behind the globe, and E2's row moves with it.

### The phase, and the surfaces that had one

\`performance.now()\` is deliberately NOT frozen. Freezing it stops \`requestAnimationFrame\`, and with it
ForgeBackdrop's five-second arc — which is the one animating surface in the app and therefore the control
run that makes every reduced-motion zero in \`docs/3d/APP_SWEEP.md\` mean anything. Instead the phase is
held fixed by waiting for the per-context draw counters to stop before any pixel is read${animators.length === 0 ? '' : ` (surfaces whose one-hop source reads \`performance.now()\` at all, grepped: ${animators.map((a) => `**${a.id}**`).join(', ')} — reading it is not the same as animating on it, and the two rows below this one separate the frame loops from the stopwatches and the deadlines)`}.

${settles.length === 0 ? '_No settle was recorded on this run._' : `| surface | pass | captured off a frame that had stopped |
|---|---|---|
${settles.map((s) => `| **${s.id}** ${s.name} | ${s.where} | ${s.settled ? 'yes' : '**NO**'} |`).join('\n')}`}
${unsettled.length === 0 ? '\nEvery capture on this run was taken off a frame that had stopped moving.' : `\n**${unsettled.length} capture(s) were taken while the surface was still drawing**, so those rows are not reproducible and should be read as such: ${unsettled.map((s) => `${s.id} (${s.where})`).join(', ')}.`}

How long each settle waited and how many frames the arc got through are **not** printed, and that is the
same rule the rest of this section is written under: they are facts about how fast this machine rasterises,
not about the surface, so putting them in the file would add a figure that moves between runs to a file
whose whole subject is figures that do not.

### Non-determinism this pass could NOT close, named rather than left to be found

**Frame COUNTS are machine speed, and three columns of \`docs/3d/APP_SWEEP.md\` are frame counts.** They
need not match between two runs and nothing is wrong when they do not: "draws already recorded on its own context",
"page-wide \`rAF\` in the same window" and the control run's "draw calls per 600 ms" all answer *how many
frames fitted in a fixed window*, which is a property of the rasteriser and the machine's load. Their
VERDICTS are stable — zero draws after the first frame, non-zero draws during an arc — and the verdict is
what the axis is decided on. Read the counts as evidence the counter is alive, never as a measurement to
compare across runs.

${(() => {
  const bounded = CLOCK_CENSUS.filter((c) => c.deadlines.length > 0);
  if (bounded.length === 0) return '**No surface decides its frame against a wall-clock deadline**, so no geometry here is a function of machine speed. Grepped over the same one-hop closure, with the matcher checked against a known-positive and a known-negative first.';
  return `**THE ONE THIS PASS COULD NOT CLOSE AND WOULD MOST LIKE TO: a wall-clock DEADLINE deciding geometry.**
${bounded.map((c) => `**${c.id} ${c.name}** bounds a search on \`performance.now()\` at ${c.deadlines.map((h) => `\`${h.rel}:${h.line}\``).join(' and ')}`).join('; ')}. A deadline is not a
stopwatch: whatever it bounds does MORE WORK on a fast machine, so the answer it returns — here the
viewpoint the frame is drawn from — is a function of how busy this laptop was. The layout even records
\`truncated\` for exactly this, and does not expose it, so nothing on the page can be read back to say
whether a given capture was cut short.

Freezing \`performance.now()\` would close it and must not be done: it stops \`requestAnimationFrame\`, and
React's scheduler yields on the same clock. The fix belongs in the app — a budget counted in CANDIDATES
rather than milliseconds is deterministic and bounds the same work. **Until then this surface's rows are
reproducible only up to which viewpoint the search happened to reach, and two runs can legitimately
disagree about it.**`;
})()}

${(() => {
  const printers = CLOCK_CENSUS.filter((c) => c.printsFrameTime.length > 0);
  if (printers.length === 0) return '**No surface renders a measured frame time into the page**, so every viewport capture is a function of the frozen inputs alone. Grepped, with the matcher checked against a known-positive and a known-negative first.';
  return `**A measured frame time rendered into the DOM, which no clock freeze can hold still.** ${printers.map((p) => `**${p.id} ${p.name}** (${p.printsFrameTime.map((h) => `\`${h.rel}:${h.line}\``).join(', ')})`).join(', ')} print${printers.length === 1 ? 's' : ''} the milliseconds THIS run took into ${printers.length === 1 ? 'its own caption' : 'their own captions'}. That figure is correct and it is supposed to move — but it is DOM, so the affected \`*-viewport.png\` cannot be byte-identical between two runs however still the clock is held. The \`*-canvas.png\` beside it is the drawing buffer only and is unaffected, and so is every statistic in the table below, which is read off that buffer. Grepped rather than named, so a second surface that starts printing one shows up here instead of being discovered by somebody diffing two captures and doubting the freeze.`;
})()}

**An element screenshot is not a drawing buffer.** \`*-canvas.png\` is the COMPOSITED page clipped to the
canvas box, so any DOM laid over the surface is in the image — on \`/select\` that includes the sign-in
screen's own clock. The statistics are read from the drawing buffer through \`drawImage\` and contain the
render and nothing else, which is why a capture can differ between two runs whose numbers are identical.

- **SwiftShader itself.** Every frame is a CPU rasterisation and the ANGLE/SwiftShader build ships inside
  the browser, so a different revision can rasterise the same scene differently: these numbers are
  reproducible on one browser build and not necessarily across two. This run used Chromium
  **${browserVersion ?? 'unrecorded — the browser never launched'}**. Compare that first, the same way you compare the source fingerprint.
- **Mount-order races.** \`reads dispatched dead\` and \`needed a filter nudge\` in \`docs/3d/APP_SWEEP.md\`
  both turn on React's development double-mount racing a fetch. They are reported per run for exactly that
  reason, and a zero there means "not on this run", never "cannot happen".
- **\`preClick\`, the baseline the axes are attributed against**, is how many GL contexts the route had
  built before the toggle was pressed. It is a count taken at a moment in a render, not a property of the
  route.
- **Web workers.** The freeze is installed on the page's global and a worker gets its own, so none of it
  would reach code running there. No \`new Worker\` appears anywhere under \`apps/web/src\` or
  \`packages/gl/src\` today and no service worker is registered, so this is a note for whoever adds the
  first one rather than a live gap.
- **The dev server's own module graph.** Vite serves transformed source on demand; a cold and a warm cache
  differ in timing, which is exactly what the settle above exists to absorb but not a guarantee.

`;
}

function writeThemeReport() {
  const n2 = (v, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d));
  const capture = (r, theme) => {
    const b = r.byTheme[theme];
    if (!b || b.reach !== 'DRAWN' || !b.shots?.canvas?.file) return '—';
    return `[canvas](theme/${b.shots.canvas.file}) · [viewport](theme/${b.shots.viewport?.file ?? ''})`;
  };
  const drawn = themeRows.filter((r) => r.byTheme.dark?.reach === 'DRAWN' && r.byTheme.light?.reach === 'DRAWN');
  const worse = themeRows.filter((r) => r.problems.some((p) => p.startsWith('WORSE IN LIGHT')));
  const stampT = process.env.AUDIT_DATE ?? new Date().toISOString().slice(0, 10);

  /*
   * WHICH SURFACES ARE BOUND TO THE THEME, READ OFF THE RENDERERS RATHER THAN COUNTED BY HAND. "Six of the
   * seven bind to `look/theme.ts`" is precisely the shape of sentence this programme keeps catching — true
   * when typed, false the day a seventh binds or a sixth stops. So the import is grepped per renderer and the
   * sentence is assembled from the answer.
   */
  const bound = { yes: [], no: [] };
  for (const s of SURFACES) {
    let src = '';
    try { src = readFileSync(join(WEB, s.glFile), 'utf8'); } catch { /* reported as unbound below */ }
    (/from '@lcx\/gl\/look\/theme\.js'/.test(src) ? bound.yes : bound.no).push(s.id);
  }
  const unreachableT = themeRows.filter((r) => r.byTheme.dark?.reach !== 'DRAWN' || r.byTheme.light?.reach !== 'DRAWN');

  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(THEME_OUT, `# THE THEME PASS — status: **${drawn.length} of ${themeRows.length} surfaces captured in both themes\
${worse.length === 0 ? ', none measurably worse in light' : `, ${worse.length} measurably WORSE IN LIGHT`}**

<!-- GENERATED by scripts/3d-audit-app.mjs. Do not edit: run \`APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs\`. -->

Swept ${stampT}. **This file is output, not prose.** It is written separately from \`docs/3d/APP_SWEEP.md\` for
the reason that file's own header gives about \`docs/3d/e9/README.md\`: two generators must not write one file,
or its contents depend on which script ran last.

${frozenClockSection()}
## Why this exists

The platform shipped a light theme for its 3-D surfaces and **it had no capture at all**. Rule 8 of this
programme's doctrine is that every claim gets a capture — so until this pass ran, "the light theme works" was
a sentence, not a measurement.

Which surfaces are bound to \`look/theme.ts\` is **grepped from the renderers, not counted here**: a sentence
naming a number is true when typed and false the day a surface is added.

- **imports \`@lcx/gl/look/theme.js\`** (${bound.yes.length}): ${bound.yes.join(', ')}
- **does not** (${bound.no.length}): ${bound.no.join(', ')} — \`StormRelief\` refuses a light theme deliberately and says why in arithmetic in its own file; \`ForgeBackdrop\` predates the module and branches on the \`dark\` class with its own hand-tuned pair, which is where \`look/theme.ts\`'s light numbers came from in the first place.

The question is **not** whether a surface looks nice on a white page. It is three facts per surface per theme:
did it paint at all; what are the mean and standard deviation of its luminance, because **a light scene that
has collapsed to near-uniform is the specific failure \`look/theme.ts\` was written to avoid**; and are the
data marks still separable from the scenery.

## The lever — how the theme is driven, and why not by the class

The app's switch is the \`dark\` class on \`<html>\`, and there are **three writers of it that do not agree**.
Every line here is measured against this dev server by this script, not read off the source:

| where | mechanism | consequence |
|---|---|---|
| \`AppLayout.tsx:117-119\` | \`classList.toggle('dark', darkMode)\` on mount and on change, from the persisted \`useUIStore\` | inside the shell the **store is the authority and overwrites everything else** |
| \`index.html:10-20\` | pre-hydration read of \`localStorage['lcx-os:ui:v1']\` | the only writer on \`/select\`, which is outside the shell |
| \`useUIStore.ts:30\` | \`toggleDarkMode\` sets the class and persists through \`lib/persistence.ts\` | writes \`lcx-os:<operator-email>:ui:v1\` |

**Poking the class is the wrong lever, and that is measured rather than argued.** A class added at
document-start on \`/command-deck\` and \`/ontology\` is *gone* by the time the shell has mounted, and still gone
after a reload — \`AppLayout\`'s effect runs \`toggle('dark', false)\` because the store says light. On
\`/select\` the same poke survives, because nothing there manages the class. A lever that works on one of those
and not the other is not a lever.

So this pass **seeds the persisted store the way the app's own toggle writes it**, under both keys, and then
*measures which theme the app actually applied* rather than assuming the seed took:

| surface | route | inside the shell | asked | applied | after a reload |
|---|---|---|---|---|---|
${(instrument.lever ?? []).map((l) => `| **${l.id}** | \`${l.route}\` | ${l.seat ? 'yes' : 'no'} | ${l.asked} | ${l.got === l.asked ? l.got : `**${l.got}**`} | ${l.afterReload === l.asked ? l.afterReload : `**${l.afterReload}**`} |`).join('\n')}

### A defect this pass found on the way in

\`index.html:12\` reads \`localStorage['lcx-os:ui:v1']\`. **Nothing writes that key.** \`useUIStore\` persists
under \`STORAGE_KEYS.UI\` through \`lib/persistence.ts:38\`, whose \`mk()\` is \`lcx-os:\${scope()}:\${key}:v1\`
— and \`scope()\` returns the operator's email, or the literal \`anon\` before sign-in. There is no path that
produces a key with no scope segment. Measured both directions on this dev server:

- clicking the real theme toggle in the UI wrote \`lcx-os:nik@lcx.com:ui:v1\` **and nothing else**;
- seeding only the unscoped key left a seated route at \`dark=false\` **with \`document.body\` still carrying the
  dark pre-hydration background**, because \`index.html\` added the class, the body script saw it, and
  \`AppLayout\` then removed the class and not the inline background.

The consequence for a real operator is the flash that script exists to prevent: a dark-mode operator's
preference is invisible to the pre-hydration path, so every load paints light and then flips. And \`/select\`,
which has no \`AppLayout\`, **can never be dark at all** from stored preference. Not fixed here — this file
reports; the fix belongs in \`apps/web/index.html\` or \`lib/persistence.ts\`.

## The instrument, validated before anything was judged

A GL surface that has not painted captures as a blank or transparent rectangle, and **in the light theme a
blank capture is indistinguishable from "the light theme renders nothing"**. So the readback is proved on
known input first, in both directions, through the same code path every number below comes from:

| control | expectation | result |
|---|---|---|
${(instrument.checks ?? []).map(([what, ok]) => `| ${what} | must hold | ${ok ? 'PASS' : '**FAIL**'} |`).join('\n')}

The negative control is as load-bearing as the positive one: \`sdLuma ≈ 0\` is the finding this pass exists to
raise, and an instrument that returns zero because its readback is broken raises it on **every** surface. Both
patterns are built from the derived palette (\`${instrument.dataHex}\` against \`${instrument.sceneHex}\`), not
from literals typed into the script.

**Pixels are read in-page, not decoded from a PNG.** \`createStage\` sets \`preserveDrawingBuffer: true\`
unconditionally (\`packages/gl/src/stage.ts:288\`), so the drawing buffer survives compositing and a
\`drawImage\` of the GL canvas outside the frame returns what was drawn. That flag is the reason this does not
have to capture inside a \`requestAnimationFrame\`; without it the readback would return an empty buffer that
looks exactly like a surface that rendered nothing.

## The data/scenery split, derived rather than listed

A hand-written list of hexes cannot fail on the colour nobody thought of. So the taxonomy is parsed from
\`look/theme.ts\` and \`look/colour.ts\` and split the way \`look/semantic.ts:203\` splits it — a \`BRAND_HEX\`
key is **scenery** if a \`SceneTheme\` field has the same name, and **data** otherwise:

- **DATA** (never moves between themes): ${PALETTE.data.map((d) => `\`${d.key}\``).join(', ')}
- most saturated scenery colour in either theme: **${PALETTE.maxSceneryChroma}**, so the chroma floor is **${PALETTE.chromaFloor}**

**What the classifier cannot see, stated rather than left to be discovered:**
${PALETTE.dataBlind.length === 0 ? '- nothing — every data colour clears the floor.' : PALETTE.dataBlind.map((d) => `- \`${d.key}\` (${d.hex}) has chroma ${CHROMA(HEX_RGB(d.hex))}, **below the floor**, so its pixels are counted as scenery. That is by design in the palette — it "reads as no measurement, never as a low value" — and it means a surface drawing only refusals would read as having no data marks.`).join('\n')}

## Per-surface statistics

Every number is over the surface's **own** drawing buffer — the contexts its toggle created, marked the same
way the context-loss axis marks them, so the shared 2-D renderer and the signature backdrop are not measured
as the relief. The page's CSS background is therefore **not** in these numbers; the viewport capture is where
the surface is judged against the page around it.

| surface | theme | painted | mean luma | **sd luma** | p01→p99 | colours | **p99.9 chroma** | max chroma | data px % | data luma | scenery luma | data:scenery contrast |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${themeRows.flatMap((r) => THEME_ORDER.map((theme) => {
  const b = r.byTheme[theme];
  if (b?.reach !== 'DRAWN') return `| **${r.id}** ${r.name} | ${theme} | **${b?.reach ?? '—'}** | — | — | — | — | — | — | — | — | — | — |`;
  const s = b.stats?.[0];
  if (!s?.readable) return `| **${r.id}** ${r.name} | ${theme} | **unreadable** | — | — | — | — | — | — | — | — | — | — |`;
  return `| **${r.id}** ${r.name} | ${theme} | yes | ${n2(s.meanLuma, 1)} | **${n2(s.sdLuma)}** | ${s.p01}→${s.p99} | ${s.distinctColours}${s.distinctColours >= 4096 ? '+' : ''} | **${s.p999Chroma}** | ${s.maxChroma} | ${n2(s.dataPct)} | ${n2(s.dataMeanLuma, 1)} | ${n2(s.sceneryMeanLuma, 1)} | ${s.dataVsSceneryContrast === null ? '—' : `${n2(s.dataVsSceneryContrast)}:1`} |`;
})).join('\n')}

**Two columns carry the verdict, and the second one is here because the first one lied.** \`sd luma\` is the
collapse statistic: a scene that has gone near-uniform on a white page is the exact failure the light palette
was tuned to avoid. But **luminance spread is not information**. E6 VaultRelief reported sd 2.52 in dark and
18.70 in light — a 743% "improvement" — while its 18 blue record marks *dissolved into a smooth white haze*
that has a large luminance spread and carries nothing. A gradient is spread without a reading.

\`p99.9 chroma\` is the correction, and it needs no threshold at all. Every scenery colour in both themes is a
desaturated blue-grey and every data hue but \`refusal\` is not, so **the top of the chroma distribution is
where the data marks live**. If it collapses between themes the marks went away, whatever the luminance did.
p99.9 rather than the max so one stray antialiased pixel cannot stand in for a population of marks; the max is
printed beside it so a reader can see if the two ever disagree.

Read every column against the same surface's own dark row, never against a global floor: these surfaces draw
wildly different amounts of geometry, so one threshold would pass a busy scene that lost half its contrast and
fail a sparse one working as designed.

**\`mean alpha\` is not in the table but is checked**: an opaque black buffer and a transparent one are
different faults, and this file's own context-loss axis records a finding that turned on that distinction.

**The statistics and the canvas PNG are not the same pixels.** The numbers come from \`drawImage\` of the GL
drawing buffer, so they contain the render and nothing else. The PNG is an element screenshot, which is the
composited page clipped to the canvas box — so any DOM caption layered over the surface appears in the image
and **not** in the numbers. E1's dark heading plate is the visible case: it stays dark in the light capture
because it is DOM, not geometry.

| surface | light sd ÷ dark | light p01→p99 range ÷ dark | **light p99.9 chroma ÷ dark** | **light max chroma ÷ dark** | light data:scenery contrast ÷ dark | verdict |
|---|---|---|---|---|---|---|
${themeRows.map((r) => {
  if (r.sdRatio === undefined) return `| **${r.id}** ${r.name} | — | — | — | — | — | not comparable — see below |`;
  const w = r.problems.some((p) => p.startsWith('WORSE IN LIGHT'));
  const none = r.problems.some((p) => p.startsWith('NO DATA MARKS'));
  const pc = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);
  const verdict = w ? '**WORSE IN LIGHT**' : (r.degraded ? '**degraded**' : 'holds up');
  return `| **${r.id}** ${r.name} | ${pc(r.sdRatio)} | ${pc(r.rangeRatio)} | ${pc(r.markP999Ratio)} | ${pc(r.markMaxRatio)} | ${pc(r.contrastRatio)} | ${verdict}${none ? ' · no data marks in either theme' : ''} |`;
}).join('\n')}

**Both chroma ratios are printed because they fail on different shapes of mark, and the worse of the two
decides.** p99.9 misses a SPARSE population: E6 VaultRelief draws 18 record marks over a large vault and they
barely register at p99.9 even though the captures show them plainly — the maximum catches those. The maximum
on its own would be fooled by a single stray antialiased pixel, which is why p99.9 stays. A surface has to
hold both.
${themeRows.filter((r) => r.degraded).length === 0 ? '' : `
**Degraded, recorded and not raised** — a measured loss that did not clear the finding bar is still a loss,
and printing it as "holds up" is how a capture programme becomes a marketing exercise:

${themeRows.filter((r) => r.degraded).map((r) => `- **${r.id} ${r.name}**: ${r.degraded}`).join('\n')}
`}
**"Holds up" means the ratios above held, and nothing more.** It is not a design review. A surface can keep
its luminance spread and its chroma and still place them somewhere useless, and no number in this file would
notice. Every verdict here should be read next to the capture it came from.

## Captures

| surface | dark | light |
|---|---|---|
${themeRows.map((r) => `| **${r.id}** ${r.name} (\`${r.route}\`) | ${capture(r, 'dark')} | ${capture(r, 'light')} |`).join('\n')}
${unreachableT.length === 0 ? '' : `
### Not captured, itemised

A surface this pass could not reach is reported as not reached on **both** themes, never as a pass. A capture
list that quietly omits what it failed on is how a capture programme reports green by photographing nothing.

${unreachableT.map((r) => `- **${r.id} ${r.name}** (\`${r.route}\`) — dark \`${r.byTheme.dark?.reach}\`, light \`${r.byTheme.light?.reach}\`${r.byTheme.dark?.detail ? `: ${r.byTheme.dark.detail}` : ''}`).join('\n')}

For **E7 StormRelief** that is the correct state and this pass confirms it in both themes rather than assuming
it: \`MarketingCrisis.tsx\` builds the field with \`riskFieldUnavailable(...)\`, a named absence, so the toggle
is permanently \`aria-disabled\` and no renderer runs. It is also the surface that refuses \`look/theme.ts\`
**by decision** rather than by age — the other unbound renderer, \`ForgeBackdrop\`, simply predates the module.
The day a forward risk feed lands, this row starts producing two captures, and the light half of it will be
the first time that refusal is tested against a white page.
`}

## What this pass does NOT establish

- **That a surface which holds up numerically also reads well.** A contrast ratio is not a design review, and
  a scene can keep its luminance spread while placing it somewhere useless.
- **Real-hardware colour.** Every frame here is SwiftShader, and the tone map runs on the CPU rasteriser's
  output. Ordering survives (\`look/brandPixel.test.ts\` pins monotonicity per channel); exact hexes do not,
  and \`docs/3d/brand-fidelity.json\` already measures \`#2c6bff\` landing at \`#2c68dc\`.
- **Anything about \`refusal\`-coloured marks**, which sit below the derived chroma floor by design.
- **The dark theme's own correctness.** Dark is used here as the positive control that makes a light reading
  believable. A surface can be equally wrong in both and this pass will not say so.
${worse.length === 0 ? '' : `
## Worse in light — the list, with the number that says so

${worse.map((r) => `**${r.id} ${r.name}** — \`${r.glFile}\`, on \`${r.route}\`\n${r.problems.filter((p) => p.startsWith('WORSE IN LIGHT')).map((p) => `- ${p}`).join('\n')}`).join('\n\n')}
`}${themeRows.some((r) => r.problems.some((p) => !p.startsWith('WORSE IN LIGHT'))) ? `
## Other findings

${themeRows.filter((r) => r.problems.some((p) => !p.startsWith('WORSE IN LIGHT'))).map((r) => `**${r.id} ${r.name}** — \`${r.route}\`\n${r.problems.filter((p) => !p.startsWith('WORSE IN LIGHT')).map((p) => `- ${p}`).join('\n')}`).join('\n\n')}
` : ''}
## Reproduce

\`\`\`bash
APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs   # this file only, leaves APP_SWEEP.md alone
node scripts/3d-audit-app.mjs                          # the four axes AND this pass
APP_SWEEP_SKIP_THEME=1 node scripts/3d-audit-app.mjs   # the four axes only
\`\`\`
`);
  console.log(`\n  wrote ${THEME_OUT.replace(`${ROOT}/`, '')} — ${drawn.length}/${themeRows.length} surfaces `
    + `in both themes, ${worse.length} worse in light`);
}

if (THEME_ONLY) {
  /* The same floor the four axes have: a pass that captured nothing must not exit green. */
  const ok = instrument?.ok === true
    && themeRows.some((r) => r.byTheme.dark?.reach === 'DRAWN' && r.byTheme.light?.reach === 'DRAWN');
  if (!ok) {
    console.error('\n  REFUSED: the theme pass captured no surface in both themes, so nothing is established.');
    process.exit(1);
  }
  process.exit(themeRows.some((r) => r.problems.length > 0) ? 1 : 0);
}

/*
 * THE FLOOR THAT MAKES THIS REPORT WORTH READING. A sweep that reached nothing must not write a green file:
 * "no findings" and "no measurements" print identically and only one of them is good news.
 */
const reached = rows.filter((r) => r.reach === 'DRAWN');
if (reached.length === 0) {
  console.error('\n  REFUSED: not one surface was reached, so every axis above is unmeasured. Nothing written.');
  console.error('  This is the failure this file exists to prevent — a green report from a sweep that ran no check.');
  process.exit(1);
}

/* ── THE GENERATED REPORT ───────────────────────────────────────────────────────────── */

const t = (v, dash = '—') => (v === null || v === undefined ? dash : String(v));
const yn = (v) => (v === null || v === undefined ? '—' : v ? 'yes' : 'NO');
const stamp = process.env.AUDIT_DATE ?? new Date().toISOString().slice(0, 10);
const failing = rows.filter((r) => r.problems.length > 0);
const unreachable = rows.filter((r) => r.reach !== 'DRAWN');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, `# THE APP SWEEP — status: **${reached.length} of ${rows.length} relief surfaces reached\
${failing.length === 0 ? ', no findings' : `, ${failing.length} with findings`}**

<!-- GENERATED by scripts/3d-audit-app.mjs. Do not edit: run \`node scripts/3d-audit-app.mjs\`. -->

Swept ${stamp}. **This file is output, not prose** — the same discipline as \`docs/3d/e9/README.md\` and for the
same reason: every hand-written README in this programme has been caught carrying a sentence that was true when
typed and false when read. If this disagrees with the code, run it again rather than editing it.

${frozenClockSection()}
## What this is, and what \`e9\` is not

\`scripts/3d-audit.mjs\` sweeps reduced motion, print, no-WebGL, a lost context and the quality ladder over the
\`docs/3d/eN\` harness pages. **Every one of those checks runs against a static harness.** None of them runs
against \`apps/web\`, where the eight relief surfaces actually ship. This file is that half.

It exists because the gap had already cost something twice over: nothing in \`apps/web\` had ever exercised the
refusal path — all seven relief component tests stop at the Suspense fallback, so no renderer effect had ever
run in a test — and \`components/__tests__/reliefPrintPath.test.tsx:37-48\` names two print questions that no
test in the repo can answer, because jsdom evaluates no \`@media print\` and rasterises nothing.

**Every frame below is SwiftShader**, a CPU rasteriser. No timing is reported and none should be read into
this file; \`docs/3d/e9/README.md\` gives the argument at length.

## Reach — what a headless sweep can actually get to

| surface | route | reached | how | tier stamped | reads dispatched dead | needed a filter nudge |
|---|---|---|---|---|---|---|
${rows.map((r) => `| **${r.id}** ${r.name} | \`${r.route}\` | ${r.reach === 'DRAWN' ? 'yes' : `**${r.reach}**`} | ${r.note} | ${r.reach === 'DRAWN' ? `${r.tierStamped} of ${r.canvases.length} canvases${r.tierValues.length ? ` (\`${r.tierValues.join('`, `')}\`)` : ''}` : '—'} | ${r.deadReads === undefined ? '—' : (r.deadReads.length === 0 ? '0' : `**${r.deadReads.length}**`)} | ${r.nudged === undefined ? '—' : (r.nudged ? '**yes**' : 'no')} |`).join('\n')}

Points worth stating rather than leaving to be inferred — the count is deliberately not given, because a
count in prose beside a list is one edit away from being wrong.

**The seat is seeded, not typed.** Sign-in is an email plus a desk passcode verified server-side, so a sweep
cannot perform it without a database. The persisted session is written before the app's first script runs, the
way \`apps/web/e2e/seat.ts\` does it, and every \`/v1/**\` request is then aborted with \`connectionrefused\` so
the sweep behaves identically whether or not an API happens to be listening. What is NOT tested here, as a
consequence, is the sign-in path itself.

**Where a route needs data, the network is replaced with the smallest fixture that makes the surface
drawable** — and no number in this report is read off one. \`/ontology\` needs none: its graph is static.
\`/select\` needs neither a seat nor a fixture, because it is what a stranger sees.

**"Reads dispatched dead" is not about 3-D, and it is here because it decides reachability.** A count above zero
means the route issued a \`/v1/**\` fetch whose \`AbortSignal\` was ALREADY aborted, so the browser rejected it
before a request existed — nothing appears in a network panel and the page renders as empty with no error. When
that happens on \`/audit-log\` the relief is not mounted at all, so there is no toggle to press, and the sweep
recovers by changing the entity filter: a different canonical URL, a fresh controller, one subscriber.

**That column exists because this sweep found two, and it is now a ratchet.** \`/bd-pipeline\` and
\`/audit-log\` each dispatched a read dead: \`apiClient\` built the coalesced fetch as
\`() => networkRequest(path, opts, method)\` and \`opts\` carried the FIRST caller's \`AbortSignal\`, so that
caller unmounting killed the request every other subscriber was waiting on — the exact opposite of the contract
\`readCache.ts:375-379\` states. It is fixed at \`apiClient.ts\`'s \`withoutCallerSignal\`, and the column stays
so a return shows up here rather than as an empty page.

**Read a zero as "not on this run", not as "cannot happen".** Two concurrent identical GETs where one aborts is
the trigger, and whether a route produces that pair depends on mount timing. The filter recovery is therefore
attempted only when the toggle is genuinely missing, and whether it was needed is stated in the last column
rather than assumed — an unconditional nudge would have had the sweep carrying a note about a defect it did not
observe.

**The dev server is started by this script with \`VITE_API_URL=''\`.** \`apps/web/.env.local\` points the API at
another origin, which makes every call cross-origin; a preflight that escapes the request router reaches a port
with nothing on it, and the fixture then silently does not apply. Forcing the calls back onto the dev origin
changes where they are addressed and nothing about what the components render.
${unreachable.length === 0 ? '' : `
### Not reached, itemised

${unreachable.map((r) => `- **${r.id} ${r.name}** (\`${r.route}\`) — \`${r.reach}\`${r.reachDetail ? `: ${r.reachDetail}` : ''}`).join('\n')}
`}
## Axis 1 · Reduced motion — measured as draw calls, not as scheduled frames

| surface | reaches a frame under \`reduce\` | draws already recorded on its own context | draw calls in the 600 ms after it drew | page-wide \`rAF\` in the same window (context only) |
|---|---|---|---|---|
${rows.map((r) => {
  const a = r.axes.reducedMotion;
  if (!a) return `| **${r.id}** | — | — | — | — |`;
  if (!a.reached) return `| **${r.id}** | NO | — | — | — |`;
  if (a.unmeasured) return `| **${r.id}** | yes | ${t(a.drawsBeforeWindow)} | **unmeasured** | — |`;
  return `| **${r.id}** | yes | ${a.drawsBeforeWindow === 0 ? '**0 — see findings**' : a.drawsBeforeWindow} | ${a.drawsAfterDrawn === 0 ? '**0**' : `**${a.drawsAfterDrawn}**`} | ${a.rafAfterDrawn} |`;
}).join('\n')}

**The last column is not a verdict; "draw calls in the 600 ms after it drew" is.** The first version of this sweep counted
\`requestAnimationFrame\` page-wide, which is what \`3d-audit.mjs\` does — correctly, because a harness page is
one file with nothing else in it. In the app that counted the SHELL: 36 frames on \`/ontology\`, where ReactFlow
runs its own loop, and 10 then 36 on two consecutive passes over the same surface. A number that moves like that
is a fact about the page. Draw calls on the contexts the toggle itself created cannot belong to anything else.

**"Draws already recorded on its own context" is the per-surface floor.** The control run below proves the counter works on ONE context; it
does not prove the wrapper caught the draw path THIS renderer uses, and a renderer reaching the screen through an
unwrapped call would report 0 for ever. So the cumulative count is read before the window is reset: the frame is
already on screen, so it must be non-zero, and a zero there is reported as an instrument failure rather than as a
still surface.

A zero in the verdict column is the passing value, which means a broken counter passes every surface. \`docs/3d/e9/README.md\` reports
its own version of this check as **VACUOUS** for exactly that reason: no harness animates, so nothing could ever
make the number non-zero. **In the app it is not vacuous, and one surface is why.** \`ForgeBackdrop\` runs a
five-second arc on the sign-in route by design (\`SWEEP_MS = 5000\`), so it is also loaded with **no motion
preference**, where the counter must see draws, and then again after the arc should have finished, where it
must not:

${(() => {
  const c = rows.find((r) => r.axes.control);
  if (!c) return 'No surface in this sweep animates by design, so the counter is UNPROVEN and every zero above should be read as "not measured".';
  const a = c.axes.control;
  if (!a.reached) return `The control run on **${c.id}** could not reach a frame, so the counter is UNPROVEN and every zero above should be read as "not measured".`;
  return `| **${c.id} ${c.name}**, no motion preference | draw calls per 600 ms |\n|---|---|\n`
    + `| during its 5000 ms arc | **${a.drawsDuringSweep}** |\n`
    + `| after the arc has finished | **${a.drawsAfterSweep}** |\n\n`
    + (a.drawsDuringSweep > 0
      ? 'The counter sees draws when draws exist, so the zeros above are measurements rather than silence.'
      : '**The counter saw none, so it cannot tell "stopped" from "not measured" and every zero above is withdrawn.**')
    + (a.drawsAfterSweep === 0
      ? ' And it stops: zero idle motion, measured on the live page rather than read off the source.'
      : ' **And it does not stop**, which §6 rule 2 forbids.');
})()}

## Axis 2 · Print, with the relief OPEN

This is the configuration \`reliefPrintPath.test.tsx\` states it cannot verify, and both of its named items are
settled here. Measured under emulated print media, with the relief on:

| surface | designed print output | canvases shown on screen → in print | \`[data-relief-live]\` marked → still shown | \`[data-relief-print-flat]\` present → revealed | readable figures, relief off → on | toggle prints |
|---|---|---|---|---|---|---|
${rows.map((r) => {
  const p = r.axes.print;
  if (!p?.reached) return `| **${r.id}** | — | — | — | — | — | — |`;
  const printed = p.controls.filter((c) => c.printed && !c.noPrint).length;
  const beforeN = p.flatBefore.tables + p.flatBefore.svgsWithText;
  const afterN = p.flatTables + p.flatSvgsWithText;
  return `| **${r.id}** | ${yn(p.sheetPresent)} | ${p.canvasesShownOnScreen} → ${p.canvasesShownInPrint} | ${p.liveMarked} → ${p.liveStillShown} | ${p.flatCopyPresent} → ${p.flatCopyShown} | ${beforeN} → ${afterN}${beforeN > afterN ? ' **(lost)**' : ''} | ${printed > 0 ? `**${printed}**` : '0'} |`;
}).join('\n')}

**"Designed print output" is read off the page**, not declared here: it is true when one of the page's own
stylesheets carries the \`[data-relief-print-flat]\` rule. A hand-maintained boolean in the sweep would be the
same class of claim this whole programme keeps catching — true when typed, false when read.

The two middle columns are the mechanism \`PrintStyles.tsx:93-94\` installs, measured on the live document rather
than matched in the source: with a relief open, every \`[data-relief-live]\` block must stop being laid out and
the \`[data-relief-print-flat]\` copy must start. The copy carries \`display: none\` as an INLINE style so it stays
hidden on a page with no sheet, which means the rule's \`!important\` is the only thing that can reveal it — and
whether it did is exactly what jsdom cannot answer.

**"Readable figures" counts data tables and SVGs that contain text**, compared relief-off against relief-on
under the same print media. Two limits worth stating: a drop is the finding and an absence is not (the sign-in
screen has no flat data figure to lose and never claimed one — an absence test flagged it), and a flat form
made of \`<div>\` panels rather than a table or a titled SVG is INVISIBLE to this count, which is why **E1** can
swap four panels for a canvas and show no drop. On a page with a designed print output the two middle columns
are the ones that carry the verdict; this column is corroboration.

A drop on a page with **no** designed print output is recorded and not raised. Such a page prints its dark
theme, its chrome and its clipped scroll containers for everything on it, relief or not
(\`reliefPrintPath.test.tsx:298-318\`, "not a defect and not a licence"). The day one of those four pages becomes
printable, this table is where the canvas on it becomes a print question.

And the PDF, which is the half a computed style cannot answer — \`createStage\` sets
\`preserveDrawingBuffer: true\` (\`packages/gl/src/stage.ts:161\`) so the buffer *should* survive compositing,
and until now nobody had produced the file:

| surface | PDF bytes | carries an image |
|---|---|---|
${rows.map((r) => {
  const p = r.axes.print?.pdf;
  if (!p) return `| **${r.id}** | — | — |`;
  if (p.error) return `| **${r.id}** | refused | \`${p.error}\` |`;
  return `| **${r.id}** | ${p.bytes.toLocaleString('en-GB')} | ${yn(p.hasImage)} |`;
}).join('\n')}

An \`/Image\` XObject in the file is the canvas reaching paper. What it does **not** establish is that the image
is the right one, or that it is legible at print resolution — a byte pattern is presence, not fidelity.

## Axis 3 · A lost WebGL context, on a surface that had already drawn

The app's recovery path is different code from the harness's. Each \`*ReliefGl\` registers
\`webglcontextlost\` on **its own** canvas and calls the wrapper's \`onRefused\`, which sets \`wantRelief\`
back to false — so the flat figure returns and the refusal is announced in a live region. That branch had never
run in any test, because jsdom has no WebGL context to lose.

| surface | loss provoked | refusal named to the reader | toggle still pressed | its OWN canvas still shown | other canvases on the page | flat surface behind it | canvas PNG, before → after |
|---|---|---|---|---|---|---|---|
${rows.map((r) => {
  const c = r.axes.contextLoss;
  if (!c?.reached) return `| **${r.id}** | — | — | — | — | — | — | — |`;
  const flat = (c.flatTables ?? 0) + (c.flatSvgsWithText ?? 0);
  const others = (c.canvasesShown ?? 0) - (c.ownCanvasesShown ?? 0);
  const px = (c.bytesBefore != null && c.bytesAfter != null)
    ? `${c.bytesBefore.toLocaleString('en-GB')} → ${c.bytesAfter.toLocaleString('en-GB')} B` : '—';
  return `| **${r.id}** | ${yn(c.provoked)} | ${c.noListener ? '**no listener**' : (c.alert ? 'yes' : 'NO')} | ${c.pressed?.some((p) => p === 'true') ? 'YES' : 'no'} | ${c.ownCanvasesShown > 0 ? `**${c.ownCanvasesShown}**` : '0'} | ${others} | ${flat > 0 ? `${flat} element${flat > 1 ? 's' : ''}` : 'NONE'} | ${px} |`;
}).join('\n')}

Two columns rather than one for the canvases, and that split is a correction. Counting every canvas on the page
made \`/command-deck\` look as though a dead one had been left behind: the signature backdrop's canvas is still
there, correctly, because a relief losing its context says nothing about the plate the deck sits on. Only a
canvas belonging to a context THIS surface created can be a dead canvas of its own.

The PNG column is an element screenshot of that canvas either side of the loss. It is here because it is the
measurement that first established this defect class in the harness — 101,420 bytes down to 5,140 while
\`document.title\` still said READY and every DOM assertion passed.

**And on this sweep it withdrew a finding rather than supporting one.** On the DOM evidence alone, E8 looks like
that harness defect exactly: no \`webglcontextlost\` listener anywhere in \`ForgeBackdrop.tsx\`, its own canvas
still laid out after the loss, and no data figure behind it. This sweep raised it — on the sign-in route, the
worst possible place for it to be true. The captures say otherwise: after the loss the canvas composites as
TRANSPARENT and \`ForgePlate\`'s gradient shows through with the form intact, which is exactly the CSS fallback
§6 rule 1 relies on for that screen. \`alpha: false\` governs the drawing buffer, not what a lost context
presents. The bytes did not settle it either — they went UP.
${(() => {
  const withShots = rows.filter((r) => r.axes.contextLoss?.captures);
  if (withShots.length === 0) return '';
  return '\nThe pair is written out so this is checkable rather than taken on trust:\n\n'
    + withShots.map((r) => `- **${r.id}**: \`docs/3d/app-sweep/${r.axes.contextLoss.captures}-before.png\``
      + ' and \`…-after.png\`').join('\n') + '\n';
})()}
What remains is a difference in KIND, recorded and not raised: the other surfaces hide the canvas and name the
refusal in a live region, while this one relies on the compositor to reveal the plate underneath. Nothing tells
the reader the object went away — and nothing needs to, because it carries no data.

## Axis 4 · The GL context count, measured rather than derived

\`apps/web/src/components/__tests__/glContextBudget.test.ts\` pins the worst route at **3 live contexts** by
walking the static and dynamic import graph from all 78 routes, and names \`pages/CommandDeck.tsx\` as the route
at the cap: the shared 2-D context behind the deck, plus \`DeckReliefGl\`, plus \`SurfaceReliefGl\`, the last two
independent opt-ins with no coordination between them. Counting real contexts in a real browser answers a
question the import graph can only bound, and this is the one place the two can be compared.

| surface | route | contexts created | not lost | canvas in the document | offscreen | created by this toggle | \`getContext\` calls | not lost after the toggle goes OFF |
|---|---|---|---|---|---|---|---|---|
${rows.filter((r) => r.reach === 'DRAWN').map((r) => {
  const rel = r.axes.release;
  return `| **${r.id}** | \`${r.route}\` | ${t(r.contextsCreated)} | ${t(r.contextsNotLost)} | ${t(r.contextsInDocument)} | ${t(r.contextsOffscreen)} | ${t(r.contextsByToggle)} | ${t(r.getContextCalls)} | ${rel?.reached ? `${rel.notLostWithReliefOn} → **${rel.notLostAfterToggleOff}**` : 'n/a — no toggle'} |`;
}).join('\n')}

${worstRoutes.length === 0 ? '' : `Every row above engages ONE toggle, so every row above is a LOWER BOUND for
its route. The pin of 3 is a route with both of its independent opt-ins on together, which is a different
configuration — so that configuration is loaded as well:

| route | opt-ins engaged together | contexts created | not lost | in the document | offscreen |
|---|---|---|---|---|---|
${worstRoutes.map((w) => `| \`${w.route}\` | ${w.engaged.join(' + ')} | ${w.created} | **${w.notLost}** | ${w.inDocument} | ${w.offscreen} |`).join('\n')}

${(() => {
  const worst = worstRoutes.reduce((a, b) => (b.notLost > a.notLost ? b : a));
  /*
   * THE COMPARISON IS COMPUTED, BECAUSE THIS SENTENCE USED TO ASSERT IT. It read "the static census and
   * the browser agree" unconditionally — and on the sweep that installed the clock freeze the browser
   * measured 2 against a pin of 3 and the file said they agreed anyway. A generated report claiming
   * agreement it has not checked is the exact failure this whole file exists to refuse.
   *
   * The pin is READ from the test that owns it rather than retyped, so the two cannot drift apart.
   */
  let pin = null;
  try {
    const m = /const CONCURRENT_CAP = (\d+);/
      .exec(readFileSync(join(WEB, 'src/components/__tests__/glContextBudget.test.ts'), 'utf8'));
    if (m) pin = Number(m[1]);
  } catch { /* reported as unread below */ }
  const head = `Measured worst case on this sweep: **${worst.notLost} contexts** on \`${worst.route}\` with `
    + `${worst.engaged.join(' + ')} on at once, against a browser cap of 8-16`;
  if (pin === null) {
    return `${head}. \`glContextBudget.test.ts\`'s \`CONCURRENT_CAP\` could not be read, so the static pin `
      + 'and the browser are NOT compared here rather than being reported as agreeing.';
  }
  if (worst.notLost === pin) {
    return `${head} and the static pin of ${pin}. The static census and the browser agree, which is worth `
      + 'recording as a negative result: the import graph was not over- or under-counting.';
  }
  if (worst.notLost > pin) {
    return `${head} and a static pin of ${pin}. **The browser holds MORE contexts than the import graph `
      + `bounds, and that is a finding about the app rather than about this sweep**: the pin is the number `
      + 'a reviewer relies on when deciding a route is inside the browser cap, and it is now a floor rather '
      + 'than a ceiling. Past the cap of 8-16 the OLDEST context is killed silently, which on a chart route '
      + 'is the shared one every chart draws through (3D_VFX_FINAL_PLAN.md §10.4).';
  }
  return `${head} and a static pin of ${pin}. **They disagree, and the disagreement is worth a sentence `
    + `rather than a rounding**: the import graph bounds what a route CAN hold and the browser counts what `
    + `it DID hold, so a measured ${worst.notLost} under a pin of ${pin} means a context the graph expects was not `
    + 'built on this run — a lower measurement than the bound is not a contradiction. The likely reason on '
    + 'this route is the theme: the four axes run under the app\'s default, and `SignatureBackdrop` — the '
    + 'shell\'s only caller of `sharedRenderer()` — returns early unless `<html>` carries `dark`, so the '
    + 'shared 2-D context the pin counts does not exist in light. That is read off the source, not measured '
    + 'here, and the pin is not wrong: it counts a configuration this sweep does not load.';
})()}
`}
The offscreen column is the shared 2-D renderer: its canvas is never in the document, which is how it is told
apart from a relief's own without naming either. \`glContextBudget.test.ts\` counts the same split — owners plus
the shared context — so the two numbers are comparable rather than merely both being three.

**A context is counted once, however many times it is asked for**, which the \`getContext\` column makes visible.
\`getContext('webgl2')\` returns the SAME object every time it is called on a given canvas
(\`packages/gl/src/stage.ts:336\`), and every relief here rebuilds IN PLACE when its size step or its tier
changes — so counting calls reported two contexts for one toggle on one canvas, contradicting the canvas count
in the reach table above. That would have read as a leak. Calls above contexts are rebuilds, not leaks.

**The last column is the measurement \`3D_VFX_FINAL_PLAN.md\` §10.4 asked for.** It recorded, as newly-found and
unmeasured, that \`stage.dispose()\` never called \`WEBGL_lose_context.loseContext()\` — so toggling a relief off
and on could hold more contexts than there are mounted components, against a cap where exceeding it kills the
OLDEST, which on a chart route is the shared one every chart draws through. \`stage.ts:322-360\` now loses the
context, gated on the canvas being detached, and this column is that fix observed rather than read: the relief is
switched back off and the census retaken.${(() => {
  const rel = rows.filter((r) => r.axes.release?.reached);
  if (rel.length === 0) return ' On this run no toggled surface could be measured, so nothing is established.';
  const clean = rel.filter((r) => r.axes.release.notLostAfterToggleOff
    < r.axes.release.notLostWithReliefOn);
  return clean.length === rel.length
    ? ` On this run every one of the ${rel.length} toggled surfaces released a context on the way out.`
    : ` On this run ${rel.length - clean.length} of ${rel.length} toggled surfaces released nothing — see the findings.`;
})()}

## What this sweep does NOT establish

- **Sign-in.** The session is seeded. The email-plus-passcode gate is verified server-side and needs a
  database, so it is out of scope here and belongs in an integration test with a real API.
- **Real-hardware anything.** SwiftShader only.
- **That the printed image is the right image.** Axis 2 establishes that a canvas reaches the PDF, not that it
  is legible on paper at print resolution.
- **§7(b), the operator timing.** Unmeasured on every environment, harness or app.
${failing.length === 0 ? '' : `
## Findings — open, not explained away

None of these has been diagnosed and no threshold was loosened to make this section empty. The components are
owned elsewhere; this file reports.

${failing.map((r) => `**${r.id} ${r.name}** — \`${r.file}\`, on \`${r.route}\`\n${r.problems.map((p) => `- ${p}`).join('\n')}`).join('\n\n')}
`}
## Reproduce

\`\`\`bash
node scripts/3d-audit-app.mjs          # APP_AUDIT_PORT=5188 by default
\`\`\`

It starts its own dev server on that port and stops it again. \`--strictPort\` is deliberate: a sweep that
silently moved to another port could be measuring a server it did not configure.
`);

console.log(`\n  wrote ${OUT.replace(`${ROOT}/`, '')} — ${reached.length}/${rows.length} surfaces reached, `
  + `${failing.length} with findings`);
/* The theme pass counts towards the exit status on a full run, or a surface that is measurably worse in light
   would leave the sweep green — which is the shape of pass this whole file exists to refuse. */
const themeFailing = themeRows.filter((r) => r.problems.length > 0).length;
process.exit(failing.length + themeFailing > 0 ? 1 : 0);
