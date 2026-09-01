/**
 * L2 · THE SCENE THEME — the one place that knows a lit scene has to survive a white page.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────────────
 * Seven of the eight shipping 3-D surfaces have NO theme adaptation whatsoever. Every `dark`
 * token in them is prose inside a comment; only `ForgeBackdrop` branches on the class. And the
 * platform DEFAULTS TO LIGHT — `index.html` adds `.dark` only from stored preference, and the
 * command deck strips it deliberately for printing. So the ordinary case, the one a first-time
 * reader gets, is a lit interior authored against a near-black ground painted onto a white card.
 *
 * ── THE LINE THIS FILE DRAWS, AND WHY IT IS THE WHOLE DESIGN ────────────────────────
 * A data-encoding colour is DATA: the palette fixes it, and a theme may NOT tint a mark to suit its
 * background, because that would be editing the measurement to flatter the page. Two marks whose
 * relative weight changes with the page's background are two marks a reader cannot compare.
 *
 * What holds that up is NOT `assertBrandFidelity`. This header said it "proves it survives the
 * pipeline"; it proves `linearToHex(hexToLinear(BRAND_HEX[k])) === BRAND_HEX[k]` — a frozen table
 * round-tripping through two pure functions, which no pipeline change can move. Measured off a
 * framebuffer (`docs/3d/brand-fidelity.json`), the composite lands `#2c6bff` at `#2c68dc`, blue
 * 35/255 low, ΔE76 18.3. §6 rule 5 was amended 2026-08-14: what the pipeline guarantees is that the
 * curve is MONOTONE PER CHANNEL, so ORDER survives and a denser mark never renders lighter than a
 * sparser one — pinned in `look/brandPixel.test.ts`. A theme that moved a data colour would break
 * that ordering across themes, which is a stronger reason for the taxonomy below than hex exactness
 * ever was.
 *
 * But not every colour in a scene is data. `BRAND_HEX` already says so in its own comments: `rule`
 * is "structure — axes, ticks. RECEDES", and `plate` is "plate background". Those are ROLES, and a
 * role that must recede against #0E1628 cannot be the same value that recedes against #FFFFFF.
 * `#26355A` does not recede on a white card; it reads as near-black ink.
 *
 *   DATA — never moves, per theme or ever:  brand, brandBright, brandDeep, reference, refusal
 *   SCENERY — must move with the theme:     ground, structure, plate, rule, sky, and the light rig
 *
 * That taxonomy is the deliverable. The implementation below is bookkeeping around it, and
 * `theme.test.ts` pins the boundary so a future edit cannot quietly move a data colour into scenery.
 *
 * ══ THE SECOND DEFECT, CLOSED 2026-08-15: THIS FILE SHIPPED TWO QUANTITIES UNDER ONE TYPE ═══════
 *
 * Every field below was authored as `hexToLinear('#…')` and typed `Linear`, and `Linear` was read by
 * consumers as "the linear number this pipeline wants". For four of the seven that is right and for
 * three of them it was wrong, because the pipeline wants two DIFFERENT quantities and `Linear` names
 * neither:
 *
 *   an ALBEDO   is a REFLECTANCE. It is multiplied by the light that reaches the surface, and the
 *               product is what the tone map sees. `hexToLinear(hex)` is the correct conversion.
 *   a RADIANCE  is written INTO the scene target and goes through the curve unmultiplied. What the
 *               curve delivers is `c/(1+0.4c)`, so writing `hexToLinear(hex)` there renders DARKER
 *               than the hex says — the tone map, in effect, applied twice.
 *
 * `ground`, `structure`, `plate` and `rule` are albedos: they reach `lit.draw` as `Material.baseColour`.
 * `skyHorizon`, `skyZenith` and `fog` are radiances: `env/sky.ts:106` writes `skyColour(dir)` straight
 * into the scene target, and `env/lit.ts:599` is `lit = mix(lit, fogCol, 1.0 - exp(-depth))` where
 * `lit` is the surface's radiance and the curve has not run yet. All three were authored as albedos,
 * and the error is not small. Measured through this repo's own `toneMapComposite` and `encodeOutput`:
 *
 *     stop                authored          rendered as it shipped     Rec.601 luma
 *     light skyHorizon    #DCE5F3           #C5CBD4 (197,203,212)      227.9 → 202.2   −25.7
 *     light skyZenith     #F4F7FC           #D5D7DA (213,215,218)      246.7 → 214.7   −31.9
 *
 * E1 `DeckReliefGl` is where that was first read off a framebuffer: the light sky landed exactly on
 * the lit slabs it is meant to sit behind, and the worst top-edge silhouette went 1.922:1 in dark to
 * 1.022:1 in light with the step CHANGING SIGN — two of four slabs rendered brighter than the sky.
 *
 * DARK ESCAPED BY ACCIDENT AND THAT IS THE PROOF THE BUG IS REAL rather than a matter of taste. Every
 * consumer branches on `th.name === 'dark'` and hands the dark frame something else — `undefined` for
 * the sky, so `env/sky.ts`'s `DEFAULT_SKY` applies and ITS stops ARE radiance; a hard-coded dark hex
 * for the fog. Only the light path ever reached this file's stops. Dark looked right for a reason that
 * had nothing to do with this file being correct.
 *
 * ── THE CONTRACT, AND WHY (a) AND NOT (b) ───────────────────────────────────────────
 * Two designs were available. (b) author the sky as radiance literals and say so loudly. (a) keep the
 * hexes — which is how a designer picks a sky and how every other value here is written — and CONVERT
 * AT THIS BOUNDARY, so a consumer receives radiance and `Linear` means one thing again. (a), on three
 * arguments that are not taste:
 *
 *   1. IT TRACKS THE CURVE. The conversion is `inverseToneMap`, which is defined from `TONE_SHOULDER`.
 *      Retune the shoulder and the sky still renders at the authored hex. Under (b) the same retune
 *      silently changes what the sky LOOKS like and nothing would catch it, because a radiance literal
 *      has no stated intent to violate.
 *   2. IT IS CHECKABLE. Under (a) there is an exact assertion to make and `theme.test.ts` makes it:
 *      `linearToHex(toneMapComposite(skyHorizon)) === AUTHORED_HEX[t].skyHorizon`. Under (b) there is
 *      nothing to check the number against; it is whatever somebody typed.
 *   3. IT CANNOT BE AUTHORED PAST THE POLE. `inverseToneMap` is `y/(1-0.4y)`, which diverges at 2.5 and
 *      is NEGATIVE above it — a stop past the pole renders BLACK. `hexToLinear` ranges over [0,1], so
 *      every authorable hex converts to at most `1/(1-0.4)` = 1.6667 = `PRECOMP_CLIP`. Measured, the
 *      brightest stop in either theme is the light zenith at 1.5942. Under (b) an author can type 3.0
 *      and get a black sky with no signal at all.
 *
 * ── WHAT CHANGED IN DARK: NOTHING THAT REACHES A PIXEL, AND THE BOUND IF IT DID ─────
 * The dark stops move, because the same conversion is applied to both themes — a field that carried
 * radiance in one theme and display in the other would be the ambiguity this change exists to kill.
 * The move is arithmetically negligible and no dark path reads it:
 *
 *   · REACHABILITY, PROBED RATHER THAN ARGUED — and the first probe refuted the obvious argument.
 *     Replacing the three dark fields with THROWING getters and mounting all seven surfaces in both
 *     themes (`apps/web` `reliefTheme.test.tsx`) trips twice, at `VaultReliefGl.tsx:802` and
 *     `PipelineReliefGl.tsx:789`. Both are `scenery(th, '<darkHex>', th.fog)`, and JavaScript evaluates
 *     arguments EAGERLY, so the guard inside `scenery` — `th.name === 'dark' ? hexToLinear(darkHex)
 *     : light` — does not stop the read; it discards the value. `skyHorizon` and `skyZenith` are not
 *     read at all in a dark frame, because their reads sit inside the unevaluated arm of a ternary.
 *     A read is not a use, so the second probe replaced the same three fields with the poison value
 *     [999, −999, 42] instead: the suite passes 23/23. No dark output depends on these values.
 *   · MAGNITUDE, if a dark consumer is ever added. The conversion multiplies dark's horizon by
 *     1.0026/1.0047/1.0124 per channel and its zenith by 1.0006/1.0010/1.0021, and both stops still
 *     ENCODE TO THE SAME BYTES: #131C31 → (19,28,49) before and after, #050810 → (5,8,16) before and
 *     after. At dark's radiance levels the tone map is the identity to 8 bits, which is exactly why
 *     this defect was invisible until the platform grew a light theme.
 *
 * ── WHAT THE LIGHT THEME NOW RECEIVES, INCLUDING THE PART THAT IS NOT FINISHED ──────
 * The light stops rise, which is the fix arriving: horizon ×1.4011/1.4565/1.5589, zenith
 * ×1.5671/1.5925/1.6377 per channel. For a DRAWN sky that is the whole story — it now leaves the
 * pipeline at the hex it was authored as. For an IRRADIANCE environment it is also ~1.4-1.6× more
 * ambient light, and the six consumers do not all absorb that the same way:
 *
 *   · `DeckReliefGl` (E1) already converted at its own call site, so after the double correction is
 *     removed from `:306-307` its light frame is BIT-IDENTICAL — verified with `Object.is` on all
 *     three channels of both stops. `GlobeReliefGl` (E2) pre-compensates `plate`, an ALBEDO that did
 *     not move, so it is untouched in both themes and its call site is NOT a double correction.
 *   · `PipelineReliefGl` solves an absolute exposure from the same sky it passes (`:383`), so it
 *     re-solves itself: a brighter environment lowers the exposure and its floor still lands on its
 *     own albedo.
 *   · `SurfaceReliefGl`, `VaultReliefGl` and `OntologyOrreryGl` move the rig BY RATIO ONLY and have no
 *     exposure solve, so their light frames get brighter by roughly the multipliers above and NOTHING
 *     re-balances that. Those three need `ForgeBackdrop.lightExposure`'s treatment; that is an edit in
 *     files this change does not own and it is recorded as outstanding rather than implied to be done.
 *
 * ── WHY THESE VALUES AND NOT AN ALGORITHM ───────────────────────────────────────────
 * The obvious idea — invert or rotate the dark palette for light — was not taken. A lit scene is
 * not a stylesheet: ambient gain, key intensity, shadow strength and the sky all interact through
 * one tone map, and inverting an albedo while holding the light rig gives a milky grey that reads
 * as a rendering fault. `ForgeBackdrop` had already solved this by hand on the live sign-in screen
 * and its numbers are the worked example these follow: ground #080C15 -> #D7DEEA, plinth
 * #161D2E -> #AEBACD, ambient 1.15 -> 0.62, key 5.2 -> 7.4, shadow 0.9 -> 0.62.
 *
 * Note the direction of the last three, because it is not the intuition: the LIGHT theme takes a
 * STRONGER key and a WEAKER ambient and WEAKER shadows. On a bright ground, bounced light already
 * fills the scene, so ambient adds haze rather than form, and a hard shadow on a white plate reads
 * as dirt. Form has to come from the key instead.
 */
import { hexToLinear, type Linear } from './colour.js';
import { inverseToneMap } from './precompensate.js';

export type ThemeName = 'dark' | 'light';

/**
 * A REFLECTANCE, in [0,1] per channel. Multiplied by the light that reaches the surface; the PRODUCT
 * is what the tone map sees. Hand one of these to `Material.baseColour`. Handing one to a field that
 * wants radiance — `SkyOptions`, `lit.draw`'s `fog.colour` — renders it darker than its hex.
 */
export type Albedo = Linear;

/**
 * A SCENE-REFERRED RADIANCE. Written into the scene target and put through `toneMapComposite`
 * unmultiplied, so `toneMapComposite(r)` is literally what the frame shows. NOT bounded by 1: the
 * radiance that renders as #FFFFFF is 1.6667. Hand one of these to `SkyOptions.zenith/horizon/ground`
 * and to `lit.draw`'s `fog.colour`. Handing one to `Material.baseColour` is a reflectance above 1.
 */
export type Radiance = Linear;

/**
 * The scenery half of a scene. Every field here is a ROLE, not a colour anyone chose for its own
 * sake — which is why swapping them wholesale is legitimate and swapping a brand hex is not.
 *
 * EVERY COLOUR FIELD DECLARES ITS QUANTITY IN ITS TYPE. `Albedo` and `Radiance` are both `Linear`
 * structurally, so TypeScript will not stop you crossing them: branding them would break assignment
 * to `Vec3` wherever a theme colour reaches `SkyOptions` or `Material.baseColour`, which is every
 * consumer. The enforcement is therefore `theme.test.ts`, which puts each field through the transform
 * its declared quantity implies and checks it lands on the hex it was authored as.
 */
export interface SceneTheme {
  readonly name: ThemeName;
  /** ALBEDO. The floor or backdrop a scene sits on. The single largest area, so it sets the read. */
  readonly ground: Albedo;
  /** ALBEDO. Plinths, walls, rails — the geometry that holds data up without being data. */
  readonly structure: Albedo;
  /** ALBEDO. Panel and card fills behind projected DOM text. Must clear contrast against that text. */
  readonly plate: Albedo;
  /** ALBEDO. Axes, ticks, hairlines. Recedes by construction, a different value per ground. */
  readonly rule: Albedo;
  /**
   * RADIANCE. Two stops of the analytic sky: horizon then zenith. `env/sky.ts` uses one function for
   * the drawn backdrop AND for the irradiance every material reflects, so these reach both.
   *
   * THE SKY'S THIRD STOP IS NOT HERE and callers pass `ground` for it, which is an ALBEDO going into a
   * radiance slot — the same units error, one field over. It is not fixed by adding a `skyGround` field,
   * because no consumer would read one without an edit in a file this change does not own, and an
   * unreachable field recorded as delivered is a failure mode this programme has already had three
   * times. A caller passing `ground` as the sky's lower stop must write `inverseToneMap(th.ground)`,
   * which is what `DeckReliefGl.tsx:308` already does and what five other call sites do not.
   */
  readonly skyHorizon: Radiance;
  readonly skyZenith: Radiance;
  /**
   * RADIANCE. THE PAGE — what surrounds a scene: the DOM canvas every card and every GL canvas sits
   * on. Added by S2 of INSTRUMENT_100X_PLAN.md so the DOM's `--page-bg` has ONE author (this file)
   * rather than a second palette in tokens.css. A radiance, like the sky stops, because a canvas
   * clear or a sky fill that must come out as this hex goes through `toneMapComposite`.
   *
   * WHY IT IS NOT `ground`. The light ground is "the page tint deepened just enough that a white
   * specular still reads brighter than the ground" (its own comment) — ground was derived FROM the
   * page, so deriving the page from the ground inverted that and, measured, cost the weakest
   * certified text role on the light canvas 10 levels of headroom (status green 4.93 → 4.54:1).
   * The page's true twin is the SKY the camera sees behind a scene: on light it IS `skyZenith`.
   *
   * WHY DARK IS AUTHORED, NOT THE ZENITH. The dark zenith (#050810) is so near black that the
   * shell's dark backdrop cannot create a perceptible gradient over it (0.03 against its own
   * 0.05 floor — it passed on the previous canvas by 0.004), and a page must sit BELOW the plate
   * so a card still reads as raised. #090E1B is the value that satisfies both, written here as
   * the rig's decision so the DOM and the GL agree on it by construction.
   */
  readonly page: Radiance;
  /** Multiplies the environment contribution. Lower on light, where the ground already bounces. */
  readonly ambientGain: number;
  /** Key light intensity. HIGHER on light — form has to come from somewhere once ambient drops. */
  readonly keyGain: number;
  /** 0 = no shadow, 1 = full. Softer on light: a hard shadow on a white plate reads as dirt. */
  readonly shadowStrength: number;
  /**
   * RADIANCE. Height-fog colour, mixed into a surface's radiance at `env/lit.ts:599` BEFORE the curve.
   * Follows the sky horizon or it will not agree with the horizon behind it.
   */
  readonly fog: Radiance;
}

/** The fields of `SceneTheme` that carry a colour, derived from the interface rather than listed. */
export type ColourField = {
  [K in keyof SceneTheme]: SceneTheme[K] extends Linear ? K : never;
}[keyof SceneTheme];

/**
 * WHICH QUANTITY EACH COLOUR FIELD CARRIES, as data rather than as prose in a doc comment.
 *
 * These two lists are the machine-readable half of the contract above and `theme.test.ts` asserts
 * their union is EXACTLY the set of colour fields on a theme — so a new colour field added without
 * declaring its quantity fails the suite instead of inheriting whichever meaning its first consumer
 * assumes. That assumption is the entire defect this pair exists to prevent recurring.
 */
export const ALBEDO_FIELDS: readonly ColourField[] = Object.freeze(
  ['ground', 'structure', 'plate', 'rule'] as const,
);
export const RADIANCE_FIELDS: readonly ColourField[] = Object.freeze(
  ['skyHorizon', 'skyZenith', 'fog', 'page'] as const,
);

/**
 * THE COLOURS A DESIGNER CHOSE, IN THE ONE FORM A DESIGNER CHOOSES THEM. Exported because the test
 * needs them: the ONLY way to catch "this stop was authored in the wrong quantity" is to know what it
 * was meant to LOOK like, and a display hex is that statement. Without this table the mistake is
 * undetectable — a raw albedo and a radiance are both just three positive numbers.
 *
 * `fog` is absent on purpose. It is DERIVED from `skyHorizon` below rather than declared, because a
 * fog colour that does not match the horizon behind it produces a visible seam exactly where the
 * scene is meant to dissolve — one fewer number to keep in step by hand.
 */
export const AUTHORED_HEX: Readonly<Record<ThemeName, Readonly<Record<
  'ground' | 'structure' | 'plate' | 'rule' | 'skyHorizon' | 'skyZenith' | 'page', string
>>>> = Object.freeze({
  dark: Object.freeze({
    ground: '#070B14',
    structure: '#141F35',
    plate: '#0E1628',
    rule: '#26355A',
    skyHorizon: '#131C31',
    skyZenith: '#050810',
    /* The DOM canvas. Sits between ground and plate — see `SceneTheme.page` for why it is not the
       zenith (the shell's dark backdrop needs the headroom) and why it is not the ground. */
    page: '#090E1B',
  }),
  light: Object.freeze({
    /*
     * NOT WHITE. #FFFFFF as a ground leaves a lit surface nowhere to go: every highlight clips to
     * the same value as the floor and the object loses its silhouette. #E8EDF6 is the platform's
     * own page tint deepened just enough that a white specular still reads as brighter than the
     * ground it sits on, which is the whole job of a ground.
     */
    ground: '#E8EDF6',
    structure: '#C3CEE0',
    /* Matches --card (#FFFFFF) so a panel on a light page is the page's own card, not a grey box. */
    plate: '#FFFFFF',
    /* --line is 185 198 224 (#B9C6E0); the scene's rule is that role, so it takes that value. */
    rule: '#B9C6E0',
    skyHorizon: '#DCE5F3',
    skyZenith: '#F4F7FC',
    /* The DOM canvas IS the sky the camera sees behind a light scene. One level from the value
       tokens.css used to author (#F4F6FB); measured, the weakest certified text role on it — status
       green — goes from 4.93:1 to 4.97:1. See `SceneTheme.page`. */
    page: '#F4F7FC',
  }),
});

/**
 * THE TWO BOUNDARY CONVERSIONS. Both take the same input — a display hex — and they differ because
 * the pipeline consumes their outputs differently, which is the whole content of this file's contract.
 *
 * `toAlbedo` is `hexToLinear`, named rather than used directly so that reading the table below tells
 * you which quantity a row is in without knowing what `hexToLinear` returns.
 *
 * `toRadiance` is `inverseToneMap(hexToLinear(hex))`: the value whose tone-mapped, encoded output IS
 * the hex. Not a new derivation — `look/precompensate.ts` owns the inverse and its perimeter, and
 * importing it means a change to the shoulder moves the sky and the pre-compensated marks together.
 * THE THREE COSTS `precompensate` REFUSES ON DO NOT APPLY HERE, and that is checked rather than
 * assumed. (1) ACCUMULATION: `env/sky.ts:145` is `gl.disable(gl.BLEND)`, so the backdrop replaces
 * outright. (2) THE PLATE and (3) THE BLOOM: both are added before the curve by `pipeline.ts`'s
 * composite, and no consumer of this file uses it — all six present their own scene target with
 * `frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0)`, which has no `uPlate` term and
 * no bright pass. And the shader applies no gain: `env/sky.ts` writes `skyColour(dir)` as it is.
 *
 * If a seventh surface ever composites this sky over a non-zero plate or through a bloom, the sky
 * stops being exact — by the amounts `look/precompensate.ts` measures — and the fix is that surface's
 * to make, not this file's.
 */
const toAlbedo = (hex: string): Albedo => hexToLinear(hex);
const toRadiance = (hex: string): Radiance => inverseToneMap(hexToLinear(hex));

/**
 * Built through one function so both themes have the same shape BY CONSTRUCTION. A field present in
 * one theme and absent in the other falls back to whatever the caller had, which on a theme switch
 * means keeping the other theme's value — a silent half-swap.
 */
const build = (
  name: ThemeName,
  rig: { readonly ambientGain: number; readonly keyGain: number; readonly shadowStrength: number },
): SceneTheme => {
  const hex = AUTHORED_HEX[name];
  return Object.freeze({
    name,
    ground: toAlbedo(hex.ground),
    structure: toAlbedo(hex.structure),
    plate: toAlbedo(hex.plate),
    rule: toAlbedo(hex.rule),
    skyHorizon: toRadiance(hex.skyHorizon),
    skyZenith: toRadiance(hex.skyZenith),
    page: toRadiance(hex.page),
    ambientGain: rig.ambientGain,
    keyGain: rig.keyGain,
    shadowStrength: rig.shadowStrength,
    /* DERIVED FROM THE HORIZON, not declared — see `AUTHORED_HEX`. Same hex, same conversion, so the
       fog and the sky cannot drift into disagreeing about either the colour or the quantity. */
    fog: toRadiance(hex.skyHorizon),
  });
};

const THEMES: Readonly<Record<ThemeName, SceneTheme>> = Object.freeze({
  dark: build('dark', { ambientGain: 1.15, keyGain: 5.2, shadowStrength: 0.9 }),
  light: build('light', { ambientGain: 0.62, keyGain: 7.4, shadowStrength: 0.62 }),
});

/** The scenery for a theme. Data colours are NOT here and never will be — see the header. */
export function sceneTheme(theme: ThemeName): SceneTheme {
  return THEMES[theme];
}

/**
 * Which theme is live, read from the DOM the platform actually uses.
 *
 * `document.documentElement.classList.contains('dark')` is the app's own switch — `index.html`
 * adds it from stored preference and the print path strips it. Defaults to LIGHT with no document,
 * which is the honest default: the platform's default is light, and a server render that guessed
 * dark would flash to light on hydration.
 */
export function liveTheme(): ThemeName {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
