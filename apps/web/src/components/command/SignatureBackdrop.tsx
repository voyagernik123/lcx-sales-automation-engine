import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from '@/components/charts/gl/useFlatChart';

/**
 * X1 · THE AMBIENT BACKDROP — the shell's negative space, built in linear light.
 *
 * Mounted by `layout/AppLayout.tsx:265`, behind the 77 URLs under that layout (76 `path:`
 * children plus one `index`, counted off `router.tsx`). AppLayout is a LAYOUT route, so that
 * is ONE mount that spans the session, not 77 mounts — a distinction the cost section below
 * depends on. `pages/CommandDeck.tsx` used to mount a second copy inside its own page
 * container; that mount is GONE as of 2026-08-15 and its note at `CommandDeck.tsx:89` records
 * why. `useSoleOwner` below is kept anyway, with its justification restated where it lives.
 *
 * ── ONE ROUNDING CONVENTION, STATED ONCE AND USED EVERYWHERE BELOW ───────────────────
 * A LEVEL is `round(255 · linearToSrgb(L))` for a WCAG 2.x relative luminance `L`: the 8-bit
 * encoding of the NEUTRAL of that luminance. Every "level", every corridor figure and every
 * "N levels lost" in this header is in that unit and in no other. Where a per-CHANNEL byte is
 * meant it is written as a triple — `244 246 251` — never as a lone number.
 *
 * This paragraph is here because the previous version of this header did not have it and
 * paid for it twice: it took "ELEVEN levels" from `255 − the canvas's RED byte` one line
 * after quoting a neutral-level pair, and it quoted the dark corridor as `41.7 − 14.3` in
 * UNROUNDED levels one paragraph after quoting the light one in rounded ones. Under the
 * convention above those two numbers are NINE and TWENTY-EIGHT.
 *
 * ── WHICH FIGURES BELOW ARE PINNED BY A TEST, AND WHICH ARE NOT ─────────────────────
 * PINNED in `__tests__/ambientBackdrop.test.tsx`, so they fail rather than drift: every
 * encoded pixel triple (213 214 217, 149 150 153, 9 14 27, 241 242 245), both light
 * corridors and both dark corridors with the role that sets each, the 9-level canvas→card
 * headroom, the 4-level lift and its tint, the `(L_lifted+0.05)/1.05` trade identity and its
 * 96%, the 9 levels the dark layer spends downward, the count of certified roles a flat light
 * plate breaks, the 77 shell URLs, the operator gate preceding the mount, the sole eager
 * importer of `useFlatChart`, and the 3,883 B / 1,879 B eager cost.
 *
 * NOT PINNED, and quoted as measurements taken on 2026-08-15 rather than as invariants: the
 * 166-module size of the eager graph (it moves with the app, and the attribution is what
 * matters); the 773 B / 408 B theme-subscription slice and therefore the 3,110 B / 1,471 B
 * recoverable share, because they price an artifact that does not exist in the tree; the 64
 * `text-status-ready` and 14 `-green` utility sites; and the 5-versus-30 quantisation
 * comparison, whose 30 comes from the recorded SwiftShader capture and not from a computation.
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
 * composite's vignette only ever SUBTRACTS from it (`look/pipeline.ts:97`:
 * `plate = uPlate * (1.0 - uVignetteDepth * smoothstep(…))`). So:
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
 * ── WHY THE LIGHT THEME RENDERS NOTHING. RE-DERIVED FROM SCRATCH 2026-08-15 ──────────
 * Both bullets of the old corridor argument assume the plate reaches the framebuffer as
 * written. It does not. `look/pipeline.ts:98` builds `lit = plate + scene + bloom * uBloomGain`
 * and `:100` runs `lcxToneMap` on the SUM, unconditionally, so the plate is tone mapped too —
 * and `c/(1+0.4c)` is only near-identity where c is small. Recomputed here, on the shipped
 * `toneMapComposite` and the shipped sRGB encode, with an empty scene and `bloomGain: 0`:
 *
 *   dark  `--page-bg` #090e1b  →   9  14  27     the plate to the byte. NOTHING lost.
 *   light `--page-bg` #f4f6fb  → 213 214 217     31 / 32 / 34 LEVELS LOST.
 *
 * The whole vignette sweep, same model, `vignetteCentre` irrelevant because `smoothstep` is
 * swept end to end:
 *
 *   configuration                  brightest px    darkest px
 *   dark, as shipped (0.62)          9  14  27      3   5  13
 *   light, vignetteDepth 0.62      213 214 217    149 150 153
 *   light, vignetteDepth 0.00      213 214 217    213 214 217
 *
 * The dark row reproduces the real-driver capture recorded at the top of
 * `ambientBackdrop.test.tsx` — brightest [9,14,27], darkest [3,5,13] — which is what makes the
 * two light rows evidence rather than arithmetic.
 *
 * Read the third row twice. At ZERO amplitude, with the vignette switched off entirely, this
 * layer still paints 213 214 217 over a 244 246 251 page, and every certified role loses:
 *
 *     --chart-4  4.574 → 3.403      --grey    5.671 → 4.219      --red      6.899 → 5.133
 *     --green    4.932 → 3.669      --indigo  5.815 → 4.326      --chart-5  7.913 → 5.887
 *     --amber    5.224 → 3.887
 *
 * FIVE of them go under 4.5:1. THERE IS NO AMPLITUDE, INCLUDING ZERO. "Ship it flat" is not
 * the safe version of this layer; it is the same defect with the gradient taken out.
 *
 * The one-parameter escape hatch was checked and does not exist either. `uVignetteDepth` is
 * uploaded unclamped (`pipeline.ts:192`), so a NEGATIVE depth makes the factor `1 + |d|·s` and
 * brightens the edges: at −0.5 the edge reaches 241 242 245 and at −1.0 it clips to white. The
 * CENTRE does not move, because `smoothstep` is 0 there and the plate meets the curve
 * unmultiplied — 213 214 217 at every depth. No setting of the shipped uniforms produces a
 * light backdrop.
 *
 * ── THREE FIGURES THIS HEADER USED TO CARRY THAT DO NOT REPRODUCE ────────────────────
 * The physics above is right. Three of the numbers around it were not, and they are corrected
 * rather than deleted so the next reader can see which way each error pointed.
 *
 *   1. "TEN levels" of DOWN corridor. It reproduces exactly — 246 − 236 = 10, `--green` at
 *      4.932:1 reaching 4.5:1 at luminance 0.8360 — but ONLY against the ratchet's own text
 *      roles (`contrast.test.ts:271`: navy, grey-dark, grey, green, amber, red, indigo). The
 *      TEST beneath this file derived the weakest from "every light token darker than the
 *      canvas at or above 4.5:1", which admits `--chart-4` #008300 at 4.574:1 and yields
 *      TWO levels, not ten. It asserted `<= 16` and so passed at 2 without ever saying so.
 *      Both numbers are now computed and pinned, each against the set it belongs to.
 *   2. "TWENTY-SEVEN levels" of dark corridor. `--red` #e4687a does measure 6.017:1 and does
 *      reach 4.5:1 at 41.7 against the canvas's 14.3 — but those are UNROUNDED levels, a
 *      second convention. Under the one convention above it is 42 − 14 = TWENTY-EIGHT. And
 *      the test's own candidate rule admits dark `--control-border` #717e98 at 4.714:1, which
 *      gives SIX.
 *   3. The eager-bytes SPLIT. See the cost section; the total reproduces and the split does not.
 *
 * None of the three changes the verdict. Two of them make the light case worse.
 *
 * ── THE ADDITIVE CONSTRUCTION DOES CLEAR THE CONTRAST FLOOR. IT IS REFUSED ANYWAY ────
 * `look/precompensate.ts` inverts the curve, and its perimeter is met here — `bloomGain` is 0
 * and the field is a constant, so nothing accumulates. Writing `inverseToneMap(plate)` into
 * the scene target lands the composite on 244 246 251: the page, byte-exact, recomputed here.
 * A light backdrop CAN be built, its direction is ADDITIVE, and it is the mirror of the dark
 * invariant with no list of roles either:
 *
 *   > Every pixel at or above the luminance of `--page-bg` can only RAISE a dark-on-light ratio.
 *
 * MEASURED AGAINST THE SAME FLOOR, IT CLEARS IT, and that is recorded plainly because the
 * refusal is NOT about text contrast. At the maximum lift the range allows, every certified
 * role gains: `--chart-4` 4.574 → 4.736, `--green` 4.932 → 5.107, `--amber` 5.224 → 5.409,
 * `--grey` 5.671 → 5.872, `--indigo` 5.815 → 6.021, `--red` 6.899 → 7.143. Nothing loses.
 *
 * ── WHAT ACTUALLY BINDS: `--card` IS AT THE CEILING, AND THE TRADE IS ZERO-SUM ───────
 * `--card` in light is #ffffff. Level 255. There is no 256. The canvas sits 9 levels below it
 * and the card CANNOT MOVE UP to make room, so every level this layer lifts the canvas is a
 * level taken out of the only separation the card has. That is not an aesthetic objection; it
 * is arithmetic with no free variable in it, and it is the reason the same construction is
 * free in dark and impossible in light.
 *
 *   RANGE. `--page-bg`'s per-channel headroom to #ffffff is 11 / 9 / 4, so BLUE binds. The
 *   sweep: 244 246 251 → 245 247 252 → 246 248 253 → 247 249 254 → 248 250 255. FIVE distinct
 *   colours, tint B−R held at 7 throughout; at +5 blue is pinned, only R and G climb, and B−R
 *   collapses 7 → 6 → 5 → 4 → 3. So the usable lift is exactly +4.
 *
 *   THE TRADE, in one unit — contrast EXCESS, the part of a ratio above 1.0:
 *
 *     light   canvas→card  1.0813:1 → 1.0443:1 at +4    excess DESTROYED  0.0370
 *             layer centre→edge, +4 → +0                excess CREATED    0.0354
 *             ────────────────────────────────────────────────────────────────────
 *             the layer returns 96% of what it takes. Zero-sum, at best.
 *
 *     dark    canvas→card  1.0893:1 → 1.1514:1          excess CREATED    0.0622
 *             layer centre→edge, [9,14,27] → [3,5,13]   excess CREATED    0.0571
 *             ────────────────────────────────────────────────────────────────────
 *             BOTH go up. The dark layer spends 9 levels DOWNWARD, into range that
 *             nothing above it owns and with 5 more still below it before black.
 *
 * AND THE 96% IS NOT A PROPERTY OF THIS AMPLITUDE. Write `Lc` for the canvas luminance and
 * `Ll` for the lifted one. A white card has luminance 1, so `contrast(x, card)` is
 * `1.05/(Lx+0.05)`, and the lift cancels out of the ratio entirely:
 *
 *     created / destroyed  =  (Ll + 0.05) / 1.05
 *
 * which is below 1 for every `Ll < 1` — for every light backdrop that is not itself pure
 * white. So this is not "the corridor is too small to be worth it". WHILE `--card` IS AT THE
 * CEILING, A LIGHT BACKDROP CANNOT CREATE MORE CONTRAST THAN IT DESTROYS AT ANY AMPLITUDE.
 * The refusal is structural, not a judgement about subtlety, and the identity is what
 * `ambientBackdrop.test.tsx` asserts — so moving `--card` off #ffffff, the one token change
 * that would re-open this, breaks the test rather than the reasoning quietly.
 *
 * That is the whole asymmetry, and it is neither the corridor nor the tone map. The dark layer
 * creates its gradient out of unowned range. The light layer has no unowned range — white is
 * the ceiling and the card holds all 9 levels of it — so it can only mint its gradient by
 * melting the elevation ladder `tokens.css:110` calls "each step visibly distinct" down at
 * a rate the arithmetic above fixes at strictly worse than break-even. A layer that gives back
 * 96% of what it takes is not a subtle backdrop; it is a wash.
 *
 * Two costs sit on top of that and neither is needed to decide it. Quantisation: 5 distinct
 * triples across the light field against the 30 the dark capture recorded over the same frame,
 * so any contour is 6× coarser with no dither in this pipeline. And structure: the composite's
 * vignette multiplies `uPlate` only, so an additive field cannot come from a uniform at all —
 * it has to be DRAWN into the scene target, which is a new full-screen shader in this file,
 * not a parameter change.
 *
 * Moving the token instead was priced and is worse. `--green` is `status.ready`
 * (`tailwind.config.js:51`): 64 `text-status-ready` sites plus 14 direct `-green` utilities,
 * and it MEANS ready. `look/theme.ts` forbids exactly this — "a theme may NOT tint a mark to
 * suit its background, because that would be editing the measurement to flatter the page". It
 * would also not be one token: four roles sit inside 4.93–5.82:1 (`--green` 4.932, `--amber`
 * 5.224, `--grey` 5.671, `--indigo` 5.815), so five have to move — against a tone-map cost of
 * 31 levels at zero amplitude. Repainting the light text palette to make room for a decorative
 * layer is the actual proposal, stated plainly.
 *
 * ── THE VERDICT, IN WRITING, SO THE RECORD STOPS CARRYING X1 AS DELIVERED ────────────
 * X1's goal in the plan is that A STRANGER SEES A 3-D FRAME WITHOUT A CLICK on more than one
 * route of the shell. THIS COMPONENT CANNOT MEET THAT GOAL, AND NOT ONLY BECAUSE OF THE THEME.
 *
 *   · REACHABILITY. `AppLayout.tsx:224-227` returns `<Navigate to={toLanding ? '/lcxos' :
 *     '/select'} replace />` when there is no operator. A stranger — no persisted operator, no
 *     stored theme — is redirected before this component mounts, on EVERY one of the 77 URLs,
 *     in EITHER theme. A stranger's reachable set is exactly `/lcxos` and `/select`, and
 *     `/select` already carries E8's ForgeBackdrop. The count was one before this layer existed
 *     and it is one now, and swapping the theme would not have changed it.
 *   · THE DEFAULT THEME. For the reader who does exist — a signed-in operator who has never
 *     opened Settings — the platform defaults to light and this layer draws nothing on all 77.
 *
 * So the honest statement is: on the default theme X1's surface count is ZERO shell routes, and
 * for a stranger it is unreachable entirely. The plan's X1 line should be read as NOT DELIVERED
 * and the reason recorded here, rather than carried as done on the strength of a dark-theme
 * capture. What IS delivered is narrower and real: on the dark theme, one shared-context
 * backdrop spans all 77 shell URLs and measurably raises every certified contrast pair.
 *
 * ── WHAT THE DEFAULT THEME PAYS FOR A LAYER THAT DRAWS NOTHING ───────────────────────
 * Zero GL contexts and zero renderer bytes — which is not what the census believes. The
 * `canvas === null` branch returns before `LinearPlate` exists, so `import('@lcx/gl')` below and
 * `useFlatChart`'s `import('@lcx/gl/flat/shared.js')` (`useFlatChart.ts:108`) never fire and
 * `sharedRenderer()` is never called. `__tests__/glContextBudget.test.ts:37` records "the floor
 * is now 1 everywhere" and its census at `:27` puts 70 routes at one context "from the shell's
 * backdrop"; that is a static mount-site walk, it is theme-blind, and the platform DEFAULTS TO
 * LIGHT. On the default theme this layer contributes 0 contexts on all 77 URLs, not 1.
 *
 * At runtime the no-op costs one mount for the whole session (AppLayout is a layout route), one
 * `MutationObserver` on `<html>`'s class attribute, and one memoised snapshot read per shell
 * render that does not reach `getComputedStyle` at all in light. All of that is noise.
 *
 * THE COST THAT IS NOT NOISE IS EAGER SHELL JS: **3,883 B minified / 1,879 B gzip**, fetched by
 * every reader on first load including the default-theme one who gets nothing for it.
 * Reproduce with `esbuild <this file> --bundle --minify --format=esm --jsx=automatic`, react
 * and `@lcx/gl` external, `@` aliased to `apps/web/src`, then node `zlib.gzipSync(level 9)`.
 * `__tests__/ambientBackdrop.test.tsx` runs exactly that and fails if it grows.
 *
 * It is ALL attributable. A static walk of the eager first-party graph from `main.tsx` — 166
 * modules on 2026-08-15, `import(` and `import type` cut — finds `SignatureBackdrop` in it and
 * finds it to be the ONLY eager module that imports `useFlatChart`; none of FlatBars /
 * FlatDial / FlatLine / FlatTrack is eager. So nothing else in the shell keeps the hook alive.
 *
 * THE SPLIT THIS HEADER USED TO GIVE IS WRONG. It said gating the mount in `AppLayout` recovers
 * 2,560 B / 1,194 B because a 1,323 B / 685 B theme subscription would have to move up. Built
 * on its own by the same command, the subscription below (`subscribeTheme`, `cached`,
 * `readCanvas`, `computeCanvas`, `resetCanvasSnapshot`) is **773 B / 408 B**, so the recoverable
 * share is **3,110 B / 1,471 B — 80% of it, not 66%**. That makes the case for gating stronger
 * than the header admitted, not weaker.
 *
 * IT IS STILL NOT DONE, and the reason is scope rather than judgement: recovering those bytes
 * needs the mount to become a dynamic import, which is an edit to `AppLayout.tsx` and not to
 * this file. Note first that a gate which KEEPS the static import recovers ZERO bytes — the
 * chunk is in the eager graph because of the import, not because of the mount — so the only
 * version that recovers anything is this one, recorded in full so it is a decision rather than
 * a note. Replace the static import at `AppLayout.tsx:27` with:
 *
 *     const SignatureBackdrop = lazy(() =>
 *       import('@/components/command/SignatureBackdrop').then((m) => ({ default: m.SignatureBackdrop })));
 *     function subscribeDark(onChange: () => void): () => void {
 *       if (typeof MutationObserver === 'undefined') return () => {};
 *       const mo = new MutationObserver(onChange);
 *       mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
 *       return () => mo.disconnect();
 *     }
 *     const isDark = () => document.documentElement.classList.contains('dark');
 *
 * add `lazy` and `useSyncExternalStore` to the React import at `:1`, take
 * `const dark = useSyncExternalStore(subscribeDark, isDark, () => false);` inside `AppLayout`,
 * and change the mount at `:265` from `<SignatureBackdrop />` to
 * `{dark && <Suspense fallback={null}><SignatureBackdrop /></Suspense>}` (`Suspense` is already
 * imported there; the one at `:304` wraps only the Outlet and does not cover this).
 *
 * The gate must read the CLASS and not `useUIStore`, for the reason `subscribeTheme` below
 * gives: `CommandDeck.tsx:81-82` strips `.dark` off `<html>` directly to print the board pack.
 * AND THE COST IS EXACTLY THERE. Under that print path the layer would now UNMOUNT and remount
 * rather than swap — the property `ambientBackdrop.test.tsx` pins as "a theme flip swaps the
 * layer without a remount" holds of this component but would no longer hold of the shell — so
 * the stage, pipeline and target set are rebuilt after every print. 1.5 KB gzip against that is
 * an owner's call, not this file's, which is why it is written down rather than made.
 *
 * ── AND THE INVARIANT ABOVE IS CONDITIONAL, WHICH IT DID NOT SAY ─────────────────────
 * "Every pixel of this backdrop is at or below the luminance of `--page-bg`" holds in dark
 * because `tone(c) ≈ c` there, NOT because the vignette subtracts. Dark `--page-bg` #090e1b
 * loses 0 / 0 / 0 levels to the curve; light #f4f6fb loses 31 / 32 / 34. Lighten the dark
 * canvas far enough and this layer begins darkening a canvas the vignette was told not to
 * touch. `ambientBackdrop.test.tsx` sweeps the curve rather than trusting the boundary.
 *
 * The dark theme's own corridor, under the one convention: `--red` #e4687a is the weakest
 * certified TEXT role at 6.017:1 and reaches 4.5:1 at level 42 against the canvas's 14 —
 * TWENTY-EIGHT levels (41.7 − 14.3 = 27.4 unrounded, which is where the old "TWENTY-SEVEN"
 * came from). Widen the candidate set the way the test does and dark `--control-border`
 * #717e98 at 4.714:1 gives SIX. The layer spends none of either. It spends 9 levels DOWNWARD,
 * where nothing is borrowed from a contrast ratio.
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
 * `pages/CommandDeck.tsx:81-82` strips the `dark` class off `<html>` directly to print the
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
     ZERO vignette depth and takes five certified roles under the 4.5:1 floor before any
     gradient exists. And the additive construction that WOULD clear the floor is refused on a
     different number: `--card` is #ffffff, the canvas is 9 levels below it, and the lift gives
     back 96% of the elevation it takes. Header, the sweep table and the trade table. */
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
 * ONE LIVE LAYER, and this is not tidiness — it is a defect that was already captured.
 *
 * `pages/CommandDeck.tsx` mounted this component inside its own `.br-page` container, which
 * predated the shell mount. With both up, the deck's copy was OPAQUE and covered the shell's
 * copy inside the page container only — so its own falloff was computed over a 1400 px box
 * while the shell's was computed over the viewport, and the two disagreed at the container's
 * edge. Captured: a visibly darker rectangle with a hard seam down the left of the content area.
 *
 * THAT MOUNT IS NOW GONE — `CommandDeck.tsx:89` records its removal — so this guard currently
 * has no trigger in the tree. It is KEPT rather than deleted, and the reason is the failure mode
 * and not sentiment: the guard is structural (first claim wins, taken in a layout effect), it is
 * what makes "two of these cannot both draw" true of the component instead of true of the
 * current call sites, and a second mount is a one-line addition anyone could make. Deleting a
 * guard because its one known trigger was removed is how the other guards in this repo stopped
 * guarding. Same reason `AppLayout` gives for `ToastContainer`: a layer that spans a whole
 * surface is a singleton by nature, and two of them is never the intended state.
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

  /*
   * TWO SPECIFIERS, NOT THE BARREL. This layer calls exactly `createPipeline` and `srgbToLinear`,
   * and while it resolved through `src/index.ts` Rollup grouped it with every other barrel consumer
   * — a chart route and a relief route reaching one entry put the raymarcher, the lit renderer, AO
   * and DoF in the shared chunk this file then pulled. `docs/3d/w2/SUBPATH_COST.md` measured that
   * SPECIFIER IDENTITY is the only lever: named imports shake to within four bytes, and
   * destructuring at the call site was measured NOT fixing it.
   *
   * Migrated because the half state is worse than either end. With the four flat adapters moved and
   * this file left on the barrel, the sign-in shell went 13 chunks / 100,709 B to 18 / 102,832 B —
   * +2,123 B and five extra round trips — which is exactly the loss SUBPATH_COST.md section 5
   * predicts for a partial migration, on the one screen every reader sees first.
   *
   * Named individually rather than spread: a retained namespace has no unused exports, so a spread
   * would move the specifier and keep whole-module retention, which is the defect and not the fix.
   */
  const [mod, setMod] = useState<{
    readonly createPipeline: typeof import('@lcx/gl/look/pipeline.js')['createPipeline'];
    readonly srgbToLinear: typeof import('@lcx/gl/look/colour.js')['srgbToLinear'];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    /* `Promise.all`, so the kit is set ONCE and a frame can never run against a half-built one. A
       rejection leaves `mod` null, which is the existing refusal — the layer simply does not draw. */
    void Promise.all([
      import('@lcx/gl/look/pipeline.js'),
      import('@lcx/gl/look/colour.js'),
    ]).then(
      ([pipe, colour]) => {
        if (alive) setMod({ createPipeline: pipe.createPipeline, srgbToLinear: colour.srgbToLinear });
      },
      () => {},
    );
    return () => { alive = false; };
  }, []);

  const cache = useRef<{ stage: Stage; pipeline: ReturnType<typeof import('@lcx/gl/look/pipeline.js')['createPipeline']> } | null>(null);

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
