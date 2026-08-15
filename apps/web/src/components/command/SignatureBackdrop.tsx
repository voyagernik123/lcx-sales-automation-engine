import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from '@/components/charts/gl/useFlatChart';

/**
 * X1 · THE AMBIENT BACKDROP — the shell's negative space, built in linear light.
 *
 * Mounted by `layout/AppLayout.tsx` behind every authenticated route. `pages/CommandDeck.tsx:95`
 * still mounts a second one inside its own page container; that mount is now redundant and
 * should be deleted, and until it is, `useSoleOwner` below keeps the shell's the only live one
 * — with the captured reason.
 *
 * ── WHAT THIS FILE USED TO DO, AND THE NUMBER THAT CONDEMNS IT ──────────────────────
 * It painted ONE hard-coded near-black plate — `DECK_PLATE = [0.0052, 0.0086, 0.0224]`, plus a
 * `#0b1220 → #04060b` CSS gradient underneath it — in BOTH themes. The platform DEFAULTS TO
 * LIGHT (`stores/useUIStore.ts:28` `darkMode: false`; `index.html` adds `.dark` only from
 * stored preference). `PageTitle` has no background of its own, so on `/command-deck` in the
 * default theme the page's own `<h1 className="text-navy">` was rendering #1E2761 on the
 * plate's #101729 — measured through the shipped tone map and encode:
 *
 *     text-navy      1.29:1      text-grey-dark  1.55:1      text-red     2.39:1
 *     text-grey      2.91:1      text-indigo     2.84:1      text-amber   3.16:1
 *
 * against WCAG 2.2 SC 1.4.3's 4.5:1. That is not a near miss, it is the whole distance, and
 * it shipped on the one authenticated route that already had a backdrop.
 *
 * ── THE INVARIANT THAT REPLACES THE HARD-CODED PLATE, AND WHY IT NEEDS NO TOKEN LIST ─
 * The plate is now READ FROM `--page-bg`, the very canvas this layer covers, and the
 * composite's vignette only ever SUBTRACTS from it (`look/pipeline.ts` composite:
 * `plate * (1 - depth * smoothstep(…))`). So:
 *
 *   > Every pixel of this backdrop is at or below the luminance of `--page-bg`.
 *
 * In a dark theme the text on the canvas is LIGHTER than the canvas, so a background that can
 * only get darker can only RAISE the contrast ratio. Every pair the ratchet in
 * `lib/__tests__/contrast.test.ts` certifies against `page-bg` therefore still holds over this
 * layer — for every text role, including one added tomorrow. No list of roles appears in this
 * file or in its test, which is the point: the previous version's failure is exactly what a
 * hand-list of "roles we checked" would have missed.
 *
 * ── AND THAT IS WHY THE LIGHT THEME RENDERS NOTHING AT ALL ───────────────────────────
 * The same argument runs backwards. Light-theme canvas text is DARKER than the canvas, so any
 * darkening reduces its contrast. Measured from `styles/tokens.css`, and every figure below
 * reproduces on the ratchet's own `luminance()`:
 *
 *   · DOWN — `--page-bg` #f4f6fb is luminance 0.9211. The weakest text role the ratchet
 *     certifies on it is `--green` #1e7a4a at 4.932:1, which hits the 4.5:1 floor at luminance
 *     0.8360 — a neutral byte 236 against the canvas's 246. TEN levels, at zero margin.
 *   · UP — `--card` is #ffffff, NINE levels above the canvas, and the canvas→card step is
 *     already only 1.081:1. Spending the corridor upward deletes the elevation ladder that
 *     `tokens.css:96` calls "each step visibly distinct".
 *
 * That second bullet read ELEVEN until 2026-08-15, which is 255 minus the canvas's RED BYTE —
 * a different unit from the 236/246 pair one line above it. `__tests__/ambientBackdrop.test.tsx`
 * computes it as `byte(luminance(card)) - byte(luminance(canvas))` and gets NINE, so the test
 * that pins this paragraph has disagreed with it since both were written. Nine is LESS room, so
 * everything below is stronger for the correction, not weaker.
 *
 * ── RE-OPENED WITH `look/theme.ts` IN PLACE. THE REFUSAL STANDS; THE REASON DOES NOT ─
 * This refusal predates `look/theme.ts` and was re-examined against it on 2026-08-15. It holds,
 * and the ten levels above are NOT why — they are three times too generous. Both bullets assume
 * the plate reaches the framebuffer as written. It does not. `look/pipeline.ts:98-100` builds
 * `lit = plate + scene + bloom` and then runs `lcxToneMap` on the SUM, unconditionally, so the
 * plate is tone mapped too — and `c/(1+0.4c)` is only near-identity where c is small:
 *
 *   dark  `--page-bg` #090e1b  →   9  14  27     the plate to the byte. NOTHING lost.
 *   light `--page-bg` #f4f6fb  → 213 214 217     31 / 32 / 34 LEVELS LOST.
 *
 * Measured through the shipped shaders on a real driver — headless Chromium on SwiftShader, the
 * instrument `docs/3d/brand-fidelity.mjs` uses — reading bytes back off the framebuffer:
 *
 *   configuration                  brightest px    darkest px      weakest certified role
 *   dark, as shipped                 9  14  27      3   5  13      raised (see the invariant)
 *   light, vignetteDepth 0.62      213 214 217    149 150 153      3.669:1  …  1.803:1
 *   light, vignetteDepth 0.00      213 214 217    213 214 217      3.669:1 — FLAT, STILL FAILING
 *
 * The dark row reproduces the capture recorded at the top of `ambientBackdrop.test.tsx` exactly
 * — brightest [9,14,27], darkest [3,5,13], 30 distinct colours — which is what makes the two
 * light rows evidence rather than arithmetic. (An earlier pass of that harness sampled the key
 * at `1 - v` and reported the mirror of it; the recorded dark capture is what caught it.)
 *
 * Read the third row twice. At ZERO amplitude, with the vignette switched off entirely, this
 * layer still paints 213 214 217 over a 244 246 251 page and drops `--green` from 4.932:1 to
 * 3.669:1, under WCAG 1.4.3. The BRIGHTEST pixel it can produce in the light theme is 23 levels
 * below the 236 the floor needs — 2.3× the whole corridor, on the wrong side of it. So the old
 * conclusion, "either invisible or a defect, and there is no amplitude that is neither", had the
 * right verdict and the wrong range: THERE IS NO AMPLITUDE, INCLUDING ZERO. "Ship it flat" is
 * not the safe version of this layer; it is the same defect with the gradient taken out.
 *
 * ── THE ONE CONSTRUCTION THAT WORKS, PRICED RATHER THAN WAVED AWAY ───────────────────
 * `look/precompensate.ts` inverts the curve, and its perimeter is met here exactly — `bloomGain`
 * is 0 and the field is a constant, so nothing accumulates. Writing `inverseToneMap(plate)
 * - plate` into the scene target lands the composite on 244 246 251: the page, byte-exact,
 * measured. A light backdrop CAN therefore be built, and its direction is ADDITIVE, which is the
 * mirror of the dark invariant and needs a list of roles no more than that one did:
 *
 *   > Every pixel at or above the luminance of `--page-bg` can only RAISE a dark-on-light ratio.
 *
 * Measured against the same floor, it clears it: `--green` 4.932 → 5.107:1 and no certified pair
 * loses. It is refused on the two constraints that are not text contrast.
 *
 *   · RANGE, and the binding channel is not the obvious one. `--page-bg`'s headroom to #ffffff
 *     is 11 / 9 / 4 levels, so BLUE binds. A lift holding the canvas's own tint clips after FOUR
 *     levels — the measured sweep is 244 246 251 → 245 247 252 → 246 248 253 → 247 249 254 →
 *     248 250 255, five distinct colours, then blue is pinned and only R and G climb. Past that
 *     the tint B−R collapses from 7 to 3: a decorative layer that changes the page's hue is not
 *     decoration.
 *   · THE LADDER PAYS FOR IT. canvas→card goes 1.0813:1 → 1.0443:1 at +4 — roughly halving the
 *     only step that separates a card from the page it sits on.
 *
 * And four levels fails the banding test the ten-level version already failed: four steps across
 * a 1200 px field is a Mach contour every 300 px with no dither, and an isolated one-level edge
 * on a flat field reads more than a dense ramp, not less. At the only amplitude that is safe —
 * the flat precompensated plate — the layer is byte-identical to not mounting it at all.
 *
 * Moving the token instead was priced and is worse. `--green` is `status.ready`
 * (`tailwind.config.js:51`): 63 `text-status-ready` sites plus 14 direct `-green` utilities, and
 * it MEANS ready. `look/theme.ts` forbids exactly this — "a theme may NOT tint a mark to suit
 * its background, because that would be editing the measurement to flatter the page". It would
 * also not be one token: four roles sit inside 4.93–5.82:1 (`--green` 4.932, `--amber` 5.224,
 * `--grey` 5.671, `--indigo` 5.815), so moving `--green` alone widens the corridor from 10 to
 * 16, and five tokens have to move to reach 45 — against a tone-map cost of 31 at zero
 * amplitude. Repainting the light text palette to make room for a decorative layer is the
 * actual proposal, stated plainly.
 *
 * ── WHAT THE DEFAULT THEME PAYS FOR A LAYER THAT DRAWS NOTHING ───────────────────────
 * Zero GL contexts and zero renderer bytes — which is not what the census believes. The
 * `canvas === null` branch returns before `LinearPlate` exists, so `import('@lcx/gl')` below and
 * `useFlatChart`'s `import('@lcx/gl/flat/shared.js')` never fire and `sharedRenderer()` is never
 * called. `__tests__/glContextBudget.test.ts:37` records "the floor is now 1 everywhere" and its
 * census puts 70 routes at one context "from the shell's backdrop"; that is a static mount-site
 * walk, it is theme-blind, and the platform DEFAULTS TO LIGHT. On the default theme this layer
 * contributes 0 contexts on all 78 routes, not 1.
 *
 * What it does cost is eager shell JS: 3,883 B minified / 1,879 B gzip for this file plus its
 * static `useFlatChart` import (esbuild --minify, react and `@lcx/gl` external). Gating the
 * mount in `AppLayout` recovers 2,560 B / 1,194 B of that and not the rest, because the theme
 * subscription below (1,323 B / 685 B) has to move INTO `AppLayout` to make the decision — and
 * it would cost the property `ambientBackdrop.test.tsx` pins as "a theme flip swaps the layer
 * without a remount", which is what keeps `CommandDeck`'s print path correct. 1.2 KB gzip is the
 * price of that property. Not proposed.
 *
 * ── AND THE INVARIANT ABOVE IS CONDITIONAL, WHICH IT DID NOT SAY ─────────────────────
 * "Every pixel of this backdrop is at or below the luminance of `--page-bg`" holds in dark
 * because `tone(c) ≈ c` there, NOT because the vignette subtracts. The tone map costs 0 levels
 * while the dark canvas stays at or below byte 57, 1 level from 58 and 2 from 86. Dark
 * `--page-bg` is #090e1b, so the margin is 30 bytes on its lightest channel. Lighten the dark
 * canvas past that and this layer begins darkening a canvas the vignette was told not to touch.
 *
 * The dark theme's own corridor: `--red` #e4687a is its weakest certified role at 6.017:1 and
 * reaches 4.5:1 at a neutral byte of 41.7 against the canvas's 14.3 — TWENTY-SEVEN levels, not
 * the 29 this header claimed. The layer spends none of them. It spends the 14 levels DOWNWARD
 * to black, where nothing is borrowed from a contrast ratio.
 *
 * ── RESOLUTION IS DERIVED FROM THE SHARED BUFFER, NOT FROM THE VIEWPORT ──────────────
 * A viewport-sized surface on the shared renderer is not free, and the cost lands on OTHER
 * components. `flat/shared.ts` prices a `drawImage` by the whole drawing buffer and not by the
 * source rect — 0.50 ms at its 1024×512 floor against 2.41 ms at 2400×920, measured on an M1
 * through ANGLE Metal — so a 2880×1800 backdrop would make every sparkline on the page pay
 * ~2 ms a redraw. It would also allocate a 5.18 Mpx target set, 2.2× over `stage.ts`'s
 * `TARGET_CACHE_TEXELS` budget of 2,400,000, so the set could never be retained and would be
 * reallocated against every chart's set.
 *
 * A vignette has no spatial frequency worth resolving, so it is rendered to fit INSIDE the
 * shared buffer's floor and stretched by CSS. At that size the buffer never grows, every other
 * chart keeps its 0.50 ms blit, and the target set is small enough to be cached.
 */

/**
 * The shared drawing buffer's floor, from `packages/gl/src/flat/shared.ts` — `BUFFER_FLOOR_W`
 * and `BUFFER_FLOOR_H`. Copied rather than imported because importing a VALUE from `@lcx/gl`
 * here would pull the renderer into the eager shell chunk, which is the one thing this mount
 * cannot afford; `__tests__/ambientBackdrop.test.tsx` reads both numbers out of that file and
 * fails if they drift.
 */
const BUFFER_FLOOR_W = 1024;
const BUFFER_FLOOR_H = 512;

export interface SignatureBackdropProps {
  /** 0 = flat field, 1 = heavy falloff to the edges. Only ever subtracts from the plate. */
  readonly vignetteDepth?: number;
  /** Where the light sits, in 0..1 of the host. Off-centre reads as intent, not symmetry. */
  readonly vignetteCentre?: readonly [number, number];
}

/*
 * WHERE THE KEY SITS, and it is NOT the pipeline's own [0.4, 0.34] default.
 *
 * In `AppLayout` this layer fills the whole shell, and most of the shell is opaque: the Sidebar
 * is 224 px of `bg-card` on the left, TopNav 48 px on top, Footer 24 px at the bottom. Of a
 * 1440x900 window the reader can only see the backdrop through `MainContent`, whose centre is
 * at x 0.578 and 0.513 down. A key at 0.4 puts the brightest part of the field UNDER THE
 * SIDEBAR and hands the visible area nothing but falloff.
 *
 * The second coordinate is in the composite's uv, whose y runs UPWARD — verified by capture,
 * not by reading the shader: a probe at [0.90, 0.90] lands the highlight at the top right.
 * So 0.70 is above the visible centre and 0.62 is just right of it, which is a key over the
 * reader's shoulder rather than a symmetric spotlight.
 */
const VIGNETTE_CENTRE = [0.62, 0.70] as const;

/**
 * Which theme is live, subscribed to rather than sampled.
 *
 * NOT `useUIStore(s => s.darkMode)`, and the reason is a path that never touches the store:
 * `pages/CommandDeck.tsx:81-83` strips the `dark` class off `<html>` directly to print the
 * board pack and puts it back afterwards. A store-derived backdrop would keep the dark plate
 * through that window. The class is what the stylesheet reads, so the class is what this reads.
 *
 * A `MutationObserver` firing on a theme flip is a STATE TRANSITION, which §6 rule 2 permits;
 * what it forbids is a frame scheduled when nothing changed, and nothing here schedules one.
 */
function subscribeTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const mo = new MutationObserver(() => { cached = undefined; onChange(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => mo.disconnect();
}

/**
 * The snapshot, memoised until the class attribute actually changes.
 *
 * `useSyncExternalStore` calls `getSnapshot` on EVERY render of every subscriber, and this
 * shell re-renders on every route change, sidebar toggle and palette open. An unmemoised
 * `getComputedStyle` there is a forced style recalculation per render for a value that changes
 * only when the theme does. `undefined` is "not yet read" and is distinct from the `null` that
 * means "refuse" — collapsing the two would re-read on every render in the light theme, which
 * is the common case.
 */
let cached: string | null | undefined;

/**
 * `--page-bg` as it is actually computed, or null.
 *
 * The token is authored as an `r g b` triple (`styles/tokens.css`) so Tailwind can wrap it in
 * `rgb(… / <alpha>)`. Reading the computed value rather than a copied hex is what makes the
 * invariant above hold BY CONSTRUCTION: there is no second definition of the canvas colour
 * here to fall out of step with the one the page paints.
 *
 * Returns null off-DOM, in a test with no stylesheet, and on any shape this parser does not
 * recognise — every one of which means "refuse", never "guess a colour".
 */
function readCanvas(): string | null {
  if (cached !== undefined) return cached;
  const r = computeCanvas();
  /* ONLY A STABLE ANSWER IS MEMOISED, and the unstable one is the reason this distinction
     exists. In dev the stylesheet is injected by JS, so the first render can genuinely find no
     `--page-bg` — and caching that would leave the layer absent for the rest of the session with
     no way back, since the class attribute never changes to invalidate it. An unreadable token
     re-reads until it resolves; `null` is returned identically either way, which is what
     `useSyncExternalStore` requires of a snapshot. */
  if (r.stable) cached = r.value;
  return r.value;
}

function computeCanvas(): { value: string | null; stable: boolean } {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return { value: null, stable: true };
  }
  /* Light: refused, and no token read is needed to know it. NOT because of the corridor — the
     composite tone maps the plate, so the light canvas leaves this pipeline as 213 214 217 at
     ZERO vignette depth and takes `--green` under the 4.5:1 floor before any gradient exists.
     There is no amplitude that is neither invisible nor a defect. Header, third table row. */
  if (!document.documentElement.classList.contains('dark')) return { value: null, stable: true };
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim();
  return /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(raw)
    ? { value: raw, stable: true }
    : { value: null, stable: false };
}

/** Test seam. The memo above outlives a `cleanup()`, so a suite that flips themes needs this. */
export function resetCanvasSnapshot(): void {
  cached = undefined;
}

/**
 * The CSS size to render at, given the host's size and the device pixel ratio.
 *
 * EXPORTED SO THE TEST DRIVES THIS AND NOT A COPY OF IT. The first version of the test
 * recomputed the same three lines from `BUFFER_FLOOR_W`/`H` and then asserted the result fell
 * inside the buffer floor — which it did, by construction, for any component at all. Deleting
 * the fit entirely left all sixteen assertions green. A test that restates the code cannot fail
 * on the code.
 *
 * Scale is one number for both axes because the composite's vignette is elliptical in uv:
 * squashing the axes independently moves the falloff off the shape it was authored as.
 */
export function backdropSize(hostW: number, hostH: number, dpr: number): { w: number; h: number } {
  const d = Math.min(2, Math.max(1, dpr || 1));
  const fit = Math.min(1, BUFFER_FLOOR_W / (hostW * d), BUFFER_FLOOR_H / (hostH * d));
  /* Rounded to 8 px steps so a one-pixel scrollbar reflow does not reallocate a target set on
     every frame — the vignette is a smooth field and cannot show the step. */
  return {
    w: Math.max(1, Math.round((hostW * fit) / 8) * 8),
    h: Math.max(1, Math.round((hostH * fit) / 8) * 8),
  };
}

/**
 * `--page-bg`'s `r g b` triple as LINEAR light, which is what the plate uniform wants.
 *
 * Exported for the same reason as `backdropSize`: this is the single step between the token the
 * page paints and the value the composite multiplies, and it is where a stray gain would hide.
 * The test tone-maps and encodes the result and requires the original bytes back.
 */
export function backdropPlate(triple: string, srgbToLinear: (c: number) => number): [number, number, number] {
  return triple.split(/\s+/).map((n) => srgbToLinear(Number(n) / 255)) as [number, number, number];
}

/**
 * ONE LIVE LAYER, and this is not tidiness — it is a defect that is already capturable.
 *
 * `pages/CommandDeck.tsx:95` mounts this component inside its own `.br-page` container, which
 * predates the shell mount. With both up, the deck's copy is OPAQUE and covers the shell's copy
 * inside the page container only — so its own falloff is computed over a 1400 px box while the
 * shell's is computed over the viewport, and the two disagree at the container's edge. Captured:
 * a visibly darker rectangle with a hard seam down the left of the content area.
 *
 * The right fix is deleting the deck's mount, which is not this file's to make. The guard is
 * here anyway, for the same reason `AppLayout` explains for `ToastContainer`: a layer that spans
 * a whole surface is a singleton by nature, and two of them is never the intended state.
 *
 * The claim is taken in a LAYOUT effect and every instance starts as a non-owner, so there is no
 * frame in which two are drawn. Costing the winner one frame is free — `@lcx/gl` is a dynamic
 * import, so the first GL frame is many frames out regardless.
 */
let owner: object | null = null;

function useSoleOwner(): boolean {
  const [mine, setMine] = useState(false);
  const token = useRef<object>({});
  useLayoutEffect(() => {
    const me = token.current;
    if (owner === null) { owner = me; setMine(true); }
    return () => {
      if (owner === me) { owner = null; setMine(false); }
    };
  }, []);
  return mine;
}

export function SignatureBackdrop(props: SignatureBackdropProps) {
  /*
   * `useSyncExternalStore` rather than an effect + state: the snapshot is read during render, so
   * the first paint after a theme flip is already the right one. An effect would render the
   * previous theme's layer for a frame — and on the light→dark edge that frame is the old
   * hard-coded plate defect in miniature.
   */
  const canvas = useSyncExternalStore(subscribeTheme, readCanvas, () => null);
  const sole = useSoleOwner();
  // LIGHT (and SSR, and no stylesheet): absent, not degraded. `bg-page` on the shell is
  // already painted and is what a reader sees — the page is byte-identical without this layer.
  if (canvas === null || !sole) return null;
  return <LinearPlate canvas={canvas} {...props} />;
}

function LinearPlate({
  canvas,
  vignetteDepth = 0.62,
  vignetteCentre = VIGNETTE_CENTRE,
}: SignatureBackdropProps & { canvas: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  /*
   * MEASURED, NOT ASSUMED — but measured and then DELIBERATELY REDUCED, by `backdropSize`.
   * `useFlatChart` multiplies what it is given by dpr to get the drawing size, so the reduction
   * has to happen here for the shared buffer never to grow. See the header for what growing it
   * costs, and `backdropSize` for why the arithmetic lives in an exported function.
   */
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (!r || r.width < 1 || r.height < 1) return;
      const next = backdropSize(r.width, r.height, globalThis.devicePixelRatio || 1);
      setSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [mod, setMod] = useState<typeof import('@lcx/gl') | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@lcx/gl').then((m) => { if (alive) setMod(m); });
    return () => { alive = false; };
  }, []);

  const cache = useRef<{ stage: Stage; pipeline: ReturnType<typeof import('@lcx/gl').createPipeline> } | null>(null);

  const draw = useCallback((stage: Stage) => {
    if (!mod) return;
    const { createPipeline, srgbToLinear } = mod;
    if (cache.current?.stage !== stage) {
      cache.current = { stage, pipeline: createPipeline(stage) };
    }
    const { pipeline } = cache.current;
    if ('kind' in pipeline) return;

    /* THE PLATE IS THE PAGE'S OWN CANVAS, converted to linear light here and nowhere else.
       A hex copied into this file is the defect the header records; a parse of the live token
       cannot disagree with the stylesheet because it IS the stylesheet. */
    const plate = backdropPlate(canvas, srgbToLinear);

    /* An EMPTY scene target. The composite adds `plate + scene + bloom`, so with nothing drawn
       the plate and its vignette are the entire frame. */
    const gl = stage.gl;
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    pipeline.resolve({
      plate: plate as unknown as never,
      vignetteCentre,
      vignetteDepth,
      // No highlight exists to bloom; a gain here lifts the gradient's own quantisation noise.
      bloomGain: 0,
      // OPAQUE: this is the bottom of the stack and it owns the background.
      transparent: false,
    });
  }, [mod, canvas, vignetteCentre, vignetteDepth]);

  const { canvasRef, refused } = useFlatChart(draw as never, {
    width: size?.w ?? 1,
    height: size?.h ?? 1,
    // NO ENTRANCE AND NO UPDATE TWEEN, and the second one is not decoration.
    // `useFlatChart` only short-circuits to a single frame when its duration is `<= 0`; with the
    // default `updateMs: 260` every resize and every theme flip ran a 260 ms rAF loop that
    // redrew the SAME static gradient about sixteen times, each pass being the full five-pass
    // pipeline plus a blit. Frames that carry no new information, which is §6 rule 2 arrived at
    // from the direction the policy does not name.
    entranceMs: 0,
    updateMs: 0,
    deps: [mod, size?.w, size?.h, canvas, vignetteDepth],
  });

  const ready = mod !== null && size !== null && !refused;

  /*
   * NO CSS FALLBACK LAYER, and its removal is a rule-1 fix rather than a simplification. The
   * previous version painted a hard-coded `#0b1220 → #04060b` gradient underneath the canvas
   * "always present, always underneath" — so a machine with no WebGL2 got the dark plate in the
   * light theme with no pipeline involved at all, and the 1.29:1 above was what a REFUSAL
   * looked like. A backdrop's flat fallback is the page it sits on; `bg-page` is already there.
   */
  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="absolute inset-0 h-full w-full"
        style={{ display: ready ? 'block' : 'none' }}
      />
    </div>
  );
}
