/**
 * L2 · CATEGORICAL SEPARATION — the invariant that sits ALONGSIDE order preservation, because
 * order preservation says nothing about it and the shipped rig violates it.
 *
 * ── WHAT ORDER PRESERVATION DOES NOT COVER ──────────────────────────────────────────────────
 * §6 rule 5's "brand hex exact" was replaced by ORDER SURVIVES: the tone map is monotone per
 * channel, so a denser mark never renders lighter than a sparser one (`tonemap.ts` TONE_POLICY).
 * That is true, and it is about a SCALE. It is silent about the other thing the palette encodes:
 *
 *   `brand`   means "this is our data".
 *   `refusal` means "NO MEASUREMENT EXISTS" — its own comment in `colour.ts` says it must read
 *             as "no measurement", NEVER as a low value.
 *
 * Those are not two ends of a ramp. They are opposite claims, and §6 rule 6 — absence never reads
 * as a low value — depends on a reader being able to tell them apart. A monotone transform can
 * map both to the same pixel and still be perfectly order-preserving; monotone is not injective.
 *
 * ── AND IT DOES. MEASURED OFF RENDERED PIXELS, 2026-08-15 ───────────────────────────────────
 * The instrument renders the SAME sphere under the SAME rig with only the base colour swapped and
 * compares AT CORRESPONDING FRAGMENTS — the only comparison a reader can actually make. Numbers in
 * `docs/3d/w2/CATEGORICAL_SEPARATION.md`; the centre-fragment column reproduces
 * `docs/3d/brand-fidelity.json`'s `litCentre` pixels byte for byte, all seven of them.
 *
 *   pair                   palette ΔE00   flat through composite   Globe marker rig, p05
 *   brand / refusal            14.2              13.3                     7.95   ← below floor
 *   brandBright / refusal      20.9              17.9                    13.25
 *
 * In ΔE76 the same two pairs read 68.2 and 32.4 at the palette, which is why nobody caught this:
 * CIE76 is 4.8x optimistic on a saturated-blue pair. Every number in this file is CIEDE2000.
 *
 * ── THE MECHANISM, WHICH IS ARITHMETIC ──────────────────────────────────────────────────────
 * Reinhard with shoulder s is c/(1 + c·s). Two numbers follow from that and they are not the same
 * number, which is worth being careful about because the smaller one is the one that bites:
 *
 *   · the curve's OUTPUT ASYMPTOTE is 1/s = 2.50. No input maps above it.
 *   · the 8-bit encode saturates at output 1.0, and the curve reaches 1.0 at INPUT 1/(1-s) = 1.67.
 *
 * So the headroom this pipeline actually has above linear 1.0 is a factor of 1.67 — 0.74 of a
 * stop. Every fragment brighter than 1.67 linear is #FFFFFF, whatever colour it started as, and
 * two colours that both clear it are separated by ZERO. Brand blue's blue channel is linear 1.0
 * at the palette, so it clips at an illumination gain of 1.67.
 *
 * A lit material's radiance is albedo x illumination, and `GlobeReliefGl.tsx:515` runs its markers
 * at MARKER_AMBIENT 120. `illuminationCeiling` below computes, from the live curve, the gain at
 * which a given pair stops clearing the floor: brandBright/refusal at 6.26, brand/refusal at
 * 45.64. Both are inside the range this repo's own rigs use.
 *
 * ── WHY "different categories" IS LOAD-BEARING IN THE INVARIANT ──────────────────────────────
 * `brandDeep` and `brandBright` are the two ends of ONE density ramp and SHOULD be close at the
 * ends — forcing them apart would be inventing contrast that the data does not have. So the
 * invariant may not simply say "all palette entries stay apart". It has to know which entries are
 * the same scale and which are different claims, which is what `PALETTE_CATEGORIES` is.
 */

import { BRAND, BRAND_HEX, linearToSrgb, type BrandKey, type Linear } from './colour.js';
import { TONE_SHOULDER, toneMapComposite } from './tonemap.js';
import { sceneTheme } from './theme.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CIELAB and the two difference metrics
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** CIE Lab. D65, the same white point and matrix `docs/3d/brand-fidelity.mjs` measures against. */
export type Lab = readonly [number, number, number];

const WHITE: Lab = [0.95047, 1.0, 1.08883];

/** Linear working space → Lab. */
export function labOf(c: Linear): Lab {
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / WHITE[0];
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / WHITE[2];
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/**
 * CIE76 — Euclidean distance in Lab. Kept ONLY so the two metrics can be compared, because the
 * numbers already in this repo are CIE76 and they are optimistic exactly where this defect lives.
 * Measured on the palette: brand/refusal reads 68.2 in CIE76 and 14.2 in CIEDE2000, a factor of
 * 4.8. Both are blues; CIE76 has no chroma weighting, so it charges full Euclidean price for a
 * b*-axis gap that the eye reads as almost the same colour. Do not set a threshold on this.
 */
export function deltaE76Lab(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * CIEDE2000. The full formula — the SL/SC/SH weightings, the G chroma correction, the mean-hue
 * quadrant rule and the RT rotation term for the blue region.
 *
 * The blue rotation term is not an optional refinement here: every colour this palette must keep
 * apart except `reference` sits between hue 275 and 294 degrees, which is the middle of RT's
 * Gaussian at 275. Dropping it would systematically misreport the one region that matters.
 *
 * Validated against twelve pairs of the Sharma-Wu-Dalal CIEDE2000 test data in
 * `categorical.test.ts`, including the mean-hue-wrap and RT cases that are the standard way this
 * formula is got wrong. An unvalidated colour-difference function would make every number in
 * `docs/3d/w2/CATEGORICAL_SEPARATION.md` unfalsifiable.
 */
export function deltaE2000Lab(p: Lab, q: Lab): number {
  const [L1, a1, b1] = p;
  const [L2, a2, b2] = q;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const A1 = (1 + G) * a1;
  const A2 = (1 + G) * a2;
  const Cp1 = Math.hypot(A1, b1);
  const Cp2 = Math.hypot(A2, b2);
  const hue = (x: number, y: number): number => {
    if (x === 0 && y === 0) return 0;
    const d = (Math.atan2(y, x) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  const h1 = hue(A1, b1);
  const h2 = hue(A2, b2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * Math.PI) / 360);
  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  /* The mean hue is NOT (h1+h2)/2 when the pair straddles 0/360 — that is the classic error, and
     it lands on exactly the blue-violet pairs this palette is made of. */
  let hbar: number;
  if (Cp1 * Cp2 === 0) hbar = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) hbar = (h1 + h2) / 2;
  else hbar = h1 + h2 >= 360 ? (h1 + h2 - 360) / 2 : (h1 + h2 + 360) / 2;
  const T = 1
    - 0.17 * Math.cos(((hbar - 30) * Math.PI) / 180)
    + 0.24 * Math.cos((2 * hbar * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * hbar + 6) * Math.PI) / 180)
    - 0.2 * Math.cos(((4 * hbar - 63) * Math.PI) / 180);
  const dTheta = 30 * Math.exp(-Math.pow((hbar - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cpbar, 7) / (Math.pow(Cpbar, 7) + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;
  return Math.sqrt(
    Math.pow(dL / SL, 2)
    + Math.pow(dC / SC, 2)
    + Math.pow(dH / SH, 2)
    + RT * (dC / SC) * (dH / SH),
  );
}

/** CIEDE2000 between two linear working-space colours. */
export function deltaE2000(a: Linear, b: Linear): number {
  return deltaE2000Lab(labOf(a), labOf(b));
}

/** CIE76 between two linear working-space colours. Reported for comparison, never thresholded. */
export function deltaE76(a: Linear, b: Linear): number {
  return deltaE76Lab(labOf(a), labOf(b));
}

/** Lab chroma — how much hue a colour has to be distinguished BY. */
export function chromaOf(c: Linear): number {
  const [, a, b] = labOf(c);
  return Math.hypot(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CATEGORY PARTITION
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a palette entry CLAIMS. Four categories, and the boundaries between them are the ones a
 * reader must never mis-read.
 */
export type CategoryId =
  /** One ordered ramp: "this is a measured value, and this is how much of it". */
  | 'density'
  /** A different claim about the same axis: a threshold, a percentile, a target. */
  | 'annotation'
  /** The opposite claim: NO MEASUREMENT EXISTS. */
  | 'absence'
  /** No claim at all: axes, plates, rules. Required to recede — see EXCLUDED below. */
  | 'scenery';

/**
 * DERIVED, in three steps, each with a measured margin. Enumerating this by hand would make it
 * unfalsifiable, and it would silently misclassify the next colour anybody adds.
 *
 * 1 · SCENERY is a key that names a `SceneTheme` field. `plate` and `rule` do; nothing else does.
 *     This is the same derivation `semantic.ts` uses for DATA_KEYS, deliberately: two different
 *     derivations of one boundary is how they drift. `theme.test.ts` fails first if it breaks.
 *
 * 2 · DENSITY is a remaining key named after the anchor. `colour.ts` calls `brand` "the anchor.
 *     Every data encoding starts here", and names the ramp's ends `brandBright` ("brand blue
 *     lifted, same hue family") and `brandDeep` ("low end"). The naming convention IS the
 *     statement, so it is what gets read.
 *
 *     HUE WAS TRIED FIRST AND IS WORSE, with the number: `brandBright` sits 18.0 degrees of Lab
 *     hue from `brand`, OUTSIDE `semantic.ts`'s own 15-degree HUE_BUCKET_DEG. A hue-bucket
 *     derivation would split the ramp it exists to hold together and file `brandBright` as a
 *     separate claim — the exact opposite of the truth.
 *
 *     What this cannot catch: a future key called `brandish` that is not on the ramp. That is a
 *     naming defect, and it is cheaper to refuse a bad name than to guess from geometry.
 *
 * 3 · ABSENCE is a remaining key with LESS CHROMA THAN THE LEAST CHROMATIC RAMP MEMBER. An
 *     absence mark has no hue to be read by — that is what makes it read as absence rather than
 *     as a value. Measured: the ramp's floor is `brandDeep` at chroma 40.2; `refusal` is 18.6,
 *     2.2x below it; `reference` is 70.5, 1.8x above. Any cut between 19 and 70 gives the same
 *     two answers, so the verdict does not depend on where in that range the line falls.
 *
 *     Not circular, and that is the point of taking the floor from the ramp: `semantic.ts` sets
 *     its ACHROMATIC_CEILING to `chroma(BRAND.refusal)`, which cannot ever refuse `refusal`.
 *
 * 4 · Everything left makes a claim and is not the density ramp: ANNOTATION.
 */
const SCENERY_FIELDS: ReadonlySet<string> = new Set(Object.keys(sceneTheme('dark')));

/** The anchor's key. Everything named after it is on its ramp. */
const ANCHOR: BrandKey = 'brand';

const ALL_KEYS = Object.keys(BRAND_HEX) as BrandKey[];

const RAMP_KEYS: readonly BrandKey[] = Object.freeze(
  ALL_KEYS.filter((k) => !SCENERY_FIELDS.has(k) && k.startsWith(ANCHOR)),
);

/**
 * The chroma floor of the density ramp. A claim colour below it has no hue to be read by, which is
 * what an absence mark is. Exported because the doc quotes it and a number in a doc that is not
 * the number in the code is how this repo got a false claim printed on screen for months.
 */
export const RAMP_CHROMA_FLOOR: number = Math.min(...RAMP_KEYS.map((k) => chromaOf(BRAND[k])));

function classify(key: BrandKey): CategoryId {
  if (SCENERY_FIELDS.has(key)) return 'scenery';
  if (key.startsWith(ANCHOR)) return 'density';
  return chromaOf(BRAND[key]) < RAMP_CHROMA_FLOOR ? 'absence' : 'annotation';
}

/** The partition. Every palette key, exactly once. */
export const PALETTE_CATEGORIES: Readonly<Record<BrandKey, CategoryId>> = Object.freeze(
  Object.fromEntries(ALL_KEYS.map((k) => [k, classify(k)])),
) as Readonly<Record<BrandKey, CategoryId>>;

/** What a palette entry claims. */
export function categoryOf(key: BrandKey): CategoryId {
  return PALETTE_CATEGORIES[key];
}

/**
 * The categories that make a CLAIM. `scenery` is excluded from the invariant and this is a scope
 * decision, not an oversight — the number that forces it: `brandDeep` and `rule` are ΔE00 5.1
 * apart at the palette, in the dark theme, BY DESIGN. `rule`'s own comment is "structure — axes,
 * rules, ticks. RECEDES", and receding means low contrast against the marks it sits behind.
 *
 * A reader must still tell a mark from an axis, and that separation is carried by geometry,
 * position and thickness rather than by hue — `PipelineReliefGl.tsx:473` says colour repeats the
 * height "deliberately" for exactly this reason. Scenery also MOVES with the theme, so its
 * distance from a fixed data colour is `theme.ts`'s business and changes with the page.
 */
export const CLAIM_CATEGORIES: readonly CategoryId[] = Object.freeze(['density', 'annotation', 'absence']);

export function isClaim(key: BrandKey): boolean {
  return CLAIM_CATEGORIES.includes(categoryOf(key));
}

/** True when two entries encode DIFFERENT claims — the pairs the invariant governs. */
export function differentClaim(a: BrandKey, b: BrandKey): boolean {
  return isClaim(a) && isClaim(b) && categoryOf(a) !== categoryOf(b);
}

/** Every pair the invariant governs. Derived, so a new palette entry is covered on the day. */
export function claimPairs(): ReadonlyArray<readonly [BrandKey, BrandKey]> {
  const out: Array<readonly [BrandKey, BrandKey]> = [];
  for (let i = 0; i < ALL_KEYS.length; i++) {
    for (let j = i + 1; j < ALL_KEYS.length; j++) {
      const a = ALL_KEYS[i]!;
      const b = ALL_KEYS[j]!;
      if (differentClaim(a, b)) out.push([a, b] as const);
    }
  }
  return Object.freeze(out);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE THRESHOLD
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE FLOOR, AND IT IS A JUDGEMENT. Stating that plainly because a threshold presented as
 * derived, when it is chosen, is worse than one presented as chosen.
 *
 * ΔE00 10, for three reasons that point at the same place:
 *
 * 1 · It is 4.3x the just-noticeable difference. The perceptibility threshold for CIEDE2000 is
 *     about 2.3 for a trained observer on a split field with the two halves touching. A reader of
 *     a lit scene has none of that: the two marks are in different places, at different
 *     orientations, at small size, and the reader is not COMPARING them — they are RECOGNISING
 *     one, from memory, at a glance. A categorical encoding has to survive that, so a
 *     small multiple of JND is the wrong order of magnitude.
 *
 * 2 · It is roughly where this repo's own hue discipline already sits. `semantic.ts` uses
 *     HUE_BUCKET_DEG = 15 — "the granularity at which hues get separate names" — to decide
 *     whether two colours are the same named colour. Rotating each claim colour's hue by 15
 *     degrees at its own lightness and chroma measures ΔE00 8.5 (brandDeep), 9.0 (brandBright),
 *     11.3 (reference), 14.0 (brand). So 10 is not a new discipline; it is the existing one
 *     restated in the metric that can be measured on a pixel instead of on a constant.
 *
 * 3 · Every verdict in `docs/3d/w2/CATEGORICAL_SEPARATION.md` is stable across a wide band, which
 *     is the honest way to report a chosen number. On the shipped Globe marker rig the failing
 *     claim pair reaches 7.95 and the tightest passing one 13.25, so anything from 8 to 13 gives
 *     the same verdicts. The one place the band is narrow is per-surface: Storm's
 *     `tile` vs `lid` sits at 10.3 and flips if the floor moves above it. Recorded, not hidden.
 */
export const CATEGORICAL_FLOOR_DE2000 = 10;

/**
 * THE STATISTIC, and it is the other judgement. Separation is measured at the 5th-percentile
 * fragment of the mark, not at its worst one.
 *
 * The worst fragment of a convex dielectric is its specular highlight, where the material is
 * SUPPOSED to show the light's colour rather than its own albedo — that is what makes it look
 * like a surface. Requiring categorical separation there would condemn every lit material ever
 * written, including correct ones. Requiring it only at the median would excuse a rig that whites
 * out a third of the mark.
 *
 * p05 draws the line at "a highlight may swallow up to 5% of the mark". It also says something
 * about the review that produced this file: the `litCentre` fragment it quotes is, under a light
 * along the view axis, exactly the specular peak — the single worst fragment on the sphere. The
 * finding survives anyway, which is why it is worth having; but the statistic was the worst case,
 * not the typical one, and the difference is 4.56 against 7.95 on brand/refusal.
 */
export const SEPARATION_PERCENTILE = 0.05;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE INVARIANT
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a surface may print about itself. It says CATEGORY, and it does not say hex — the same
 * discipline `TONE_POLICY` and `STATUS_POLICY` follow, for the same reason.
 */
export const CATEGORICAL_POLICY =
  'Two palette entries that encode DIFFERENT CATEGORIES must stay at least ' + CATEGORICAL_FLOOR_DE2000
  + ' CIEDE2000 apart at 95% of the fragments a reader can see, in every theme the surface admits. '
  + 'This is NOT order preservation and order preservation does not imply it: a monotone tone map '
  + 'is not injective, and the shipped composite maps brand #2C6BFF and refusal #6B7A99 to within '
  + '4.6 of each other at the brightest fragment of a lit marker. ORDER is about a scale; this is '
  + 'about "measured" and "no measurement exists" being different claims — docs/3d/w2/CATEGORICAL_SEPARATION.md.';

/**
 * Reinhard with an EXPLICIT shoulder. Exists only so a test can drive the shoulder off its live
 * value and prove that everything below is sensitive to it; the shipped path is
 * `toneMapComposite`, and `categorical.test.ts` pins the two to be identical at TONE_SHOULDER so
 * this cannot become a second copy of the curve free to drift from the first.
 */
export function reinhard(c: Linear, shoulder: number): Linear {
  return [c[0] / (1 + c[0] * shoulder), c[1] / (1 + c[1] * shoulder), c[2] / (1 + c[2] * shoulder)];
}

/**
 * The curve's output asymptote, 1/s = 2.50. Quoted because it is the number people reach for and
 * it is NOT the one that limits the pipeline — see `ENCODE_CLIP_RADIANCE`.
 */
export const TONE_ASYMPTOTE: number = 1 / TONE_SHOULDER;

/**
 * The linear radiance at which the live curve reaches OUTPUT 1.0, where the 8-bit encode
 * saturates. c/(1 + c·s) = 1 solves to c = 1/(1 - s): 1.667 at TONE_SHOULDER 0.4. Above it every
 * colour is #FFFFFF and every separation is zero, whatever the palette said. That is 0.74 of a
 * stop of headroom above linear 1.0, and brand blue's blue channel is already at 1.0.
 */
export const ENCODE_CLIP_RADIANCE: number = 1 / (1 - TONE_SHOULDER);

const toByte = (v: number): number => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255);

/**
 * A palette entry as the 8-bit pixel the shipped composite would write for it, at a given
 * illumination gain. `exposure` then the LIVE `toneMapComposite` then the sRGB encode then the
 * 8-bit round — every step the real path takes, with the geometry replaced by a scalar.
 *
 * WHY A SCALAR IS A FAITHFUL MODEL, and where it is not: for a dielectric (metalness 0.05) the
 * diffuse lobe dominates, and diffuse radiance IS albedo x a scalar (N·L times the key, plus the
 * ambient). So a gain stands in exactly for "how hard this fragment is lit". At gain 1 it
 * reproduces the GPU to the digit — the seven claim-pair separations come back 13.34, 17.91,
 * 24.08, 52.56, 43.50, 57.96, 38.65, matching a SwiftShader framebuffer read on all seven, and
 * `categorical.test.ts` pins that. What it does NOT model is the specular lobe, which pushes a
 * fragment toward the light's own colour and makes the real collapse WORSE, not better: this
 * scalar model never puts brand/refusal below 10.05 at any gain up to the 45.64 where it crosses
 * the floor outright, while the actual lit sphere under the Globe marker rig reaches 4.56.
 */
export function pixelAt(key: BrandKey, gain: number, shoulder: number = TONE_SHOULDER): readonly [number, number, number] {
  const c = BRAND[key];
  const lit: Linear = [c[0] * gain, c[1] * gain, c[2] * gain];
  const mapped = shoulder === TONE_SHOULDER ? toneMapComposite(lit) : reinhard(lit, shoulder);
  return [toByte(mapped[0]), toByte(mapped[1]), toByte(mapped[2])];
}

const SRGB_TO_LINEAR = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const asLinear = (px: readonly [number, number, number]): Linear =>
  [SRGB_TO_LINEAR(px[0] / 255), SRGB_TO_LINEAR(px[1] / 255), SRGB_TO_LINEAR(px[2] / 255)];

/** CIEDE2000 between two palette entries as they arrive on screen at a given illumination gain. */
export function separationThroughComposite(
  a: BrandKey, b: BrandKey, gain: number, shoulder: number = TONE_SHOULDER,
): number {
  return deltaE2000(asLinear(pixelAt(a, gain, shoulder)), asLinear(pixelAt(b, gain, shoulder)));
}

/**
 * The illumination gain at which a pair stops clearing the floor, found by bisection on the live
 * curve rather than written down. Returns `null` if it still clears at `maxGain`.
 *
 * Bisection is legitimate here even though separation is NOT monotone in gain — it rises before
 * it collapses — because what is being located is the LAST gain that clears, scanned coarsely
 * first. The scan step is small enough to catch the dip: measured, brandBright/refusal rises from
 * 17.9 at gain 1 to 20.3 at gain 4, falls through the floor at 6.3, and is 0.0 by gain 12 (both
 * entries clip to #FFFFFF).
 */
export function illuminationCeiling(a: BrandKey, b: BrandKey, maxGain = 512): number | null {
  const STEP = 0.01;
  for (let g = 1; g <= maxGain; g += STEP) {
    if (separationThroughComposite(a, b, g) < CATEGORICAL_FLOOR_DE2000) return +g.toFixed(2);
  }
  return null;
}

export interface SeparationFailure {
  readonly a: BrandKey;
  readonly b: BrandKey;
  readonly categoryA: CategoryId;
  readonly categoryB: CategoryId;
  readonly deltaE2000: number;
  readonly reason: string;
}

/**
 * Every claim pair that fails the floor at a given illumination gain, with the number.
 *
 * Returns the failures rather than throwing, for the reason `assertBrandFidelity` gives: two
 * colours a reader cannot tell apart is a defect to SHOW, not a reason to blank the surface.
 */
export function separationFailures(gain = 1): readonly SeparationFailure[] {
  const out: SeparationFailure[] = [];
  for (const [a, b] of claimPairs()) {
    const d = separationThroughComposite(a, b, gain);
    if (d >= CATEGORICAL_FLOOR_DE2000) continue;
    out.push({
      a, b, categoryA: categoryOf(a), categoryB: categoryOf(b), deltaE2000: +d.toFixed(2),
      reason: `${a} (${categoryOf(a)}) and ${b} (${categoryOf(b)}) are different claims but arrive `
        + `${d.toFixed(1)} CIEDE2000 apart at illumination gain ${gain}, under the floor of `
        + `${CATEGORICAL_FLOOR_DE2000}. A reader cannot reliably tell them apart, so absence can `
        + `read as a value — the failure §6 rule 6 exists to prevent.`,
    });
  }
  return Object.freeze(out);
}
