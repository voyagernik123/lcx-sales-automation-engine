/**
 * L2 · PRE-COMPENSATION — writing `inverseToneMap(target)` so the CURVE delivers the hex.
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD CONCLUSION WAS WRONG ────────────────────────────
 *
 * `tonemap.ts` recorded, on 2026-08-14, that "a data-preserving CURVE cannot work: brand
 * blue's blue channel is linear 1.0, so fixing it makes the curve identity at 1.0 and leaves
 * zero headroom above". That premise is correct and the conclusion drawn from it — that no
 * data-preserving fix exists — does not follow, because the fix is not a curve.
 *
 * The shipped map is `c/(1+0.4c)`. It is strictly increasing and injective on `[0, 2.5)`, so
 * it has an exact inverse `y/(1-0.4y)` there. Write the INVERSE of the colour you want into
 * the scene target and the LIVE, UNMODIFIED curve maps it back to the colour you want. The
 * curve is untouched. Its shoulder is untouched. Its headroom above the mark is what changes,
 * and that is the whole cost — measured below rather than asserted.
 *
 * MEASURED ON A REAL DRIVER, ANGLE/SwiftShader, RGBA16F scene target, the same instrument
 * shape as `docs/3d/brand-fidelity.mjs` and cross-checked against its record (a plain write
 * reproduces `brand-fidelity.json`'s `compositeOnly` byte for byte on all seven entries):
 *
 *     key          plain write        pre-compensated write
 *     brand        #2c68dc  ΔE 18.31  #2c6bff  ΔE 0.00
 *     reference    #dc843c  ΔE 14.35  #ff8a3d  ΔE 0.00
 *     brandBright  #7aa5dc  ΔE 12.74  #7fb2ff  ΔE 0.00
 *
 * Seven of seven land EXACT. The largest value this puts in the scene target is 1.6667,
 * against RGBA16F's 65504 — the format is not the constraint and never was.
 *
 * ── THE THREE COSTS, ALL MEASURED, ALL ENFORCED BY `precompensate` REFUSING ─────────────
 *
 * 1. HIGHLIGHT HEADROOM. `PRECOMP_CLIP` = 1.6667 is where the composite's output reaches 1.0
 *    and the framebuffer pins the channel at 255 — the same number `primitives/lines.ts`
 *    already exports as `STROKE_CLIP_LINEAR`, derived from the same shoulder. Pre-compensating
 *    a colour whose brightest channel is linear 1.0 puts that channel AT 1.6667, so its
 *    remaining headroom is exactly 1.0x: the mark is at the clip point before anything is
 *    added to it. Measured over a density sweep at 0.5/0.75/1.0/1.25/1.5/2.0x, plate 0,
 *    bloom 0, on the brightest channel:
 *
 *        brand, reference, brandBright   plain [173,200,220,235,248,255]  6 distinct
 *                                        pre-c [207,235,255,255,255,255]  3 distinct
 *        brandDeep, refusal, rule, plate plain and pre-c both              6 distinct
 *
 *    Half the resolvable density steps, gone, on exactly the three entries with a linear-1.0
 *    channel — and on none of the others. That is why `dstFactor` is a required field and
 *    `'one'` is refused: under `SRC_ALPHA/ONE` or `ONE/ONE` two overlapping marks SUM, and a
 *    field whose brightest channel starts pinned stops encoding density on the first overlap.
 *
 * 2. THE PLATE. The composite adds `uPlate` before the curve, so the value the curve sees is
 *    `plate + scene` and pre-compensating only `scene` misses. Measured with the default plate
 *    (`pipeline.ts:188`, `[0.0045, 0.0075, 0.0205]`): brand lands #306dff (ΔE 1.51), reference
 *    #ff8b48 (ΔE 4.73), plate itself #172139 (ΔE 6.69).
 *
 *    Subtracting the plate from the pre-compensated value is arithmetically exact and is NOT
 *    offered here, for a reason the arithmetic hides: `pipeline.ts:97` multiplies the plate by
 *    a VIGNETTE, `1 - uVignetteDepth*smoothstep(...)`, which varies per pixel from 0.38 to 1.0
 *    at the shipped depth of 0.62. A CPU function returning one `Linear` cannot know the pixel.
 *    Compensating for the full plate measures ΔE 0.00 where the vignette is 1.0 and up to
 *    ΔE 8.01 where it is 0.38 — an error that MOVES ACROSS THE FRAME, which is worse to debug
 *    than a constant one. So a non-zero plate is refused, and the remedy is the one all four
 *    flat chart surfaces already use: pass `plate: [0,0,0]` and let the DOM paint the ground.
 *
 * 3. THE BLOOM. Not named in the brief that sent this file, and it is the largest of the three
 *    on a shipping configuration. `FlatBars.tsx:135`, `FlatDial.tsx:172` and `FlatTrack.tsx:150`
 *    all pass `bloomGain: 0.3`, and bloom is added AFTER the mark and BEFORE the curve.
 *    Measured at bloomGain 0.3, plate 0: brandBright lands #8cc1ff (ΔE 10.20), reference
 *    #ff9744 (ΔE 6.94), brand #2d6dff (ΔE 1.56).
 *
 *    But brandDeep, rule and plate all measured ΔE 0.00 under the same bloom — because the
 *    bright pass thresholds on Rec.709 LUMINANCE (`pipeline.ts:49-50`) and those three fall
 *    below the ramp's floor. That is a DERIVED predicate, not a list: `luminance(pre) <
 *    threshold[0]` separates the three exact rows from the four inexact ones with no
 *    exceptions, so this file tests the luminance rather than naming the colours.
 */

import type { Linear } from './colour.js';
import { luminance } from './colour.js';
import { TONE_SHOULDER } from './tonemap.js';

/**
 * The pole of the inverse. `y/(1-s·y)` diverges at `y = 1/s` and is NEGATIVE above it, so a
 * target above this cannot be pre-compensated at all — asking for it silently returns a
 * negative colour, which renders BLACK.
 *
 * This is reachable in practice, not a theoretical bound: `colour.ts`'s `exposure(BRAND.brand,
 * 2)` is a 4x scale, and 4.0 > 2.5, so `inverseToneMap` on it returns −6.6667 in blue. Hence
 * `precompensate` refuses rather than returning it.
 */
export const PRECOMP_POLE = 1 / TONE_SHOULDER;

/**
 * The largest scene value that still moves a byte. `c/(1+s·c)` reaches 1.0 at `c = 1/(1-s)`,
 * and the framebuffer clamps there, so every scene value at or above this encodes 255.
 *
 * Deliberately derived from `TONE_SHOULDER` rather than written as 1.6667, and deliberately
 * NOT imported from `primitives/lines.ts` — that module exports the identical number as
 * `STROKE_CLIP_LINEAR` for the identical reason, and an L2 look module importing from an L1
 * primitive would invert the layering. Two derivations of one constant is the correct
 * duplication here; a hard-coded 1.6667 in either place would not be.
 */
export const PRECOMP_CLIP = 1 / (1 - TONE_SHOULDER);

/**
 * The exact inverse of `toneMapComposite`, per channel: `y/(1-s·y)`.
 *
 * `toneMapComposite(inverseToneMap(y)) === y` for every `y` in `[0, PRECOMP_POLE)`. Above the
 * pole it returns a negative or infinite value and the caller gets a black or NaN mark, which
 * is why `precompensate` exists and this is the raw arithmetic underneath it.
 */
export function inverseToneMap(c: Linear): Linear {
  return [
    c[0] / (1 - c[0] * TONE_SHOULDER),
    c[1] / (1 - c[1] * TONE_SHOULDER),
    c[2] / (1 - c[2] * TONE_SHOULDER),
  ];
}

/**
 * How many times over a pre-compensated mark can be added to itself before its brightest
 * channel pins at 255 and stops encoding.
 *
 * `PRECOMP_CLIP / max(inverseToneMap(target))`, which simplifies to `(1 - s·m)/(m·(1 - s))`
 * for `m = max(target)`. At `m = 1` that is exactly 1.0 — zero headroom — which is the honest
 * statement of cost 1 and the reason the three palette entries with a linear-1.0 channel lost
 * half their resolvable density steps in the sweep above.
 *
 * A caller with a mark that overlaps ITSELF only slightly (a mitre join, an arc boundary) can
 * read this number and decide; a caller drawing an accumulating field does not need to,
 * because `precompensate` refuses that outright.
 */
export function precompHeadroom(target: Linear): number {
  const pre = inverseToneMap(target);
  const m = Math.max(pre[0], pre[1], pre[2]);
  return m <= 0 ? Infinity : PRECOMP_CLIP / m;
}

/**
 * The `dstFactor` of the blend in force at the draw call, which is the ONE property that
 * decides fixed-density versus accumulating. Not the primitive, not the surface, not whether
 * the mark "looks like" a rule or a cloud.
 *
 *   `'one'`                 dst = src·srcFactor + dst. UNBOUNDED. Two overlapping marks sum.
 *   `'one-minus-src-alpha'` dst = src + dst·(1-a). A convex combination, bounded by the
 *                           larger contributor. Overlap REPLACES; it cannot accumulate.
 *   `'none'`                `gl.disable(gl.BLEND)`. The fragment replaces outright.
 *
 * Where each one is set, read off the source rather than assumed:
 *
 *   `'one'`                  `stage.ts:593` `beginAdditive` — SRC_ALPHA/ONE
 *                            `env/particles.ts:565` — ONE/ONE
 *   `'one-minus-src-alpha'`  `stage.ts:612` `beginAlpha` — ONE/ONE_MINUS_SRC_ALPHA
 *                            `env/volume.ts:484` — ONE/ONE_MINUS_SRC_ALPHA
 *   `'none'`                 `stage.ts:616` `beginOpaque`, `env/lit.ts:755`, `env/sky.ts:145`,
 *                            `env/ao.ts:312`, `env/dof.ts:180`
 */
export type BlendDest = 'one' | 'one-minus-src-alpha' | 'none';

/**
 * Everything about the composite that stands between the value written and the pixel.
 *
 * NOTHING HERE HAS A DEFAULT, and that is the point. `PipelineOptions` defaults live as inline
 * literals in `pipeline.ts` (plate at :188, bloomGain at :193, threshold at :155) and are not
 * exported, so a default here would be a SECOND copy that drifts silently — and the failure it
 * would produce is a `precompensate` that returns "exact" for a configuration it has never
 * seen. The whole value of this function is that its answer is exact; a convenient zero is how
 * §6 rule 5 came to claim a hex it did not deliver. A caller passes what it passes to
 * `pipeline.resolve`, or it does not get an answer.
 */
export interface CompositeSite {
  /** The blend destination factor at the draw call. See `BlendDest`. */
  readonly dstFactor: BlendDest;
  /** `PipelineOptions.plate` this surface passes. Must be all-zero — see cost 2 in the header. */
  readonly plate: Linear;
  /** `PipelineOptions.bloomGain` this surface passes. */
  readonly bloomGain: number;
  /** `PipelineOptions.threshold` this surface passes. Only read when `bloomGain > 0`. */
  readonly threshold: readonly [number, number];
  /**
   * The constant the fragment shader multiplies the uniform colour by before writing it —
   * `uGain` in `primitives/lines.ts:70`, `uGain·shade·a` in `flat/strokes.ts:56`,
   * `mask·(shade+edge)` in `flat/bars.ts:134`. Pre-compensation divides it out, so the value
   * the shader writes is `inverseToneMap(target)` exactly.
   *
   * IT MUST NOT BE A DATA-ENCODING SCALAR. `renderMotion.ts:100` drives `gain` from `stallT`,
   * which makes the gain an encoding channel; dividing that out would delete the encoding
   * rather than preserve the hex. Pass 1 and accept the mark is not hex-exact, or stop
   * encoding in the gain — this function cannot tell the two apart and does not try.
   */
  readonly shaderScale: number;
}

export interface PrecompRefusal {
  readonly kind: 'precomp-refused';
  readonly code:
    | 'ACCUMULATES'
    | 'TARGET_ABOVE_POLE'
    | 'PLATE_NOT_ZERO'
    | 'BLOOM_REACHES_MARK'
    | 'SCALE_NOT_POSITIVE';
  /** Carries the NUMBER that caused the refusal, so a caller can print it rather than guess. */
  readonly detail: string;
}

export function isPrecompRefusal(x: Linear | PrecompRefusal): x is PrecompRefusal {
  return typeof x === 'object' && x !== null && 'kind' in x;
}

/**
 * THE RULE, as one string a surface can print. Narrow on purpose: the previous sentence in
 * this area of the codebase claimed something universal ("brand hex exact") that was false
 * everywhere, and the correction it was replaced with claimed the opposite universal ("no
 * data-preserving fix exists") which is also false. This one states the exact perimeter.
 */
export const PRECOMP_RULE =
  'Pre-compensation writes inverseToneMap(target) into the scene target, so the LIVE, ' +
  'UNMODIFIED curve delivers the exact hex. Measured on a real driver, all seven palette ' +
  'entries land ΔE 0.00 against a plain write’s 18.31 for brand blue. It is valid ONLY ' +
  'for a FIXED-DENSITY mark — one whose blend dstFactor is not ONE — over a ZERO plate, with ' +
  'no bloom reaching it. For an ACCUMULATING field it is refused: it consumes the entire ' +
  'highlight range, taking brand blue from 6 resolvable density steps to 3 over the same ' +
  'sweep, because the mark starts at the 1.6667 clip point instead of below it.';

/**
 * The scene value to write so that the composite delivers `target` exactly — or a refusal
 * naming the number that makes it impossible.
 *
 * Returns rather than throws, for the reason `assertBrandFidelity` does: a surface that cannot
 * be hex-exact should SHOW that and draw the plain colour, not blank itself.
 */
export function precompensate(target: Linear, site: CompositeSite): Linear | PrecompRefusal {
  if (!(site.shaderScale > 0)) {
    return {
      kind: 'precomp-refused', code: 'SCALE_NOT_POSITIVE',
      detail: `shaderScale is ${site.shaderScale}; dividing by it yields a non-finite or negative colour`,
    };
  }
  /* Checked BEFORE the inverse is taken. Taking it first and testing the result for negativity
     would miss the pole itself, where the value is +Infinity rather than negative. */
  const over = [0, 1, 2].filter((i) => target[i]! >= PRECOMP_POLE);
  if (over.length > 0) {
    return {
      kind: 'precomp-refused', code: 'TARGET_ABOVE_POLE',
      detail:
        `channel(s) ${over.map((i) => 'rgb'[i]).join('')} at or above the pole ${PRECOMP_POLE} ` +
        `(${over.map((i) => target[i]!.toFixed(4)).join(', ')}); the inverse is not finite there`,
    };
  }
  if (site.dstFactor === 'one') {
    return {
      kind: 'precomp-refused', code: 'ACCUMULATES',
      detail:
        `dstFactor ONE: overlapping marks sum. Pre-compensation would leave ` +
        `${precompHeadroom(target).toFixed(4)}x of headroom before the ${PRECOMP_CLIP.toFixed(4)} ` +
        `clip, against ${(PRECOMP_CLIP / Math.max(target[0], target[1], target[2])).toFixed(4)}x ` +
        `for a plain write`,
    };
  }
  const nonZero = [0, 1, 2].filter((i) => site.plate[i]! !== 0);
  if (nonZero.length > 0) {
    return {
      kind: 'precomp-refused', code: 'PLATE_NOT_ZERO',
      detail:
        `plate [${site.plate.join(', ')}] is added before the curve and is scaled per pixel by ` +
        `the vignette (pipeline.ts:97), so no single value cancels it. Pass plate [0,0,0] — ` +
        `FlatBars/FlatDial/FlatTrack/FlatLine all already do`,
    };
  }
  const pre = inverseToneMap(target);
  if (site.bloomGain > 0) {
    /* The bright pass ramps on Rec.709 LUMINANCE from threshold[0] to threshold[1]
       (pipeline.ts:49-50), so a mark below the floor contributes nothing to the bloom and the
       gain is irrelevant to it. Measured at bloomGain 0.3, plate 0: brandDeep, rule and plate
       all land ΔE 0.00 and every entry above the floor does not — brandBright ΔE 10.20,
       reference ΔE 6.94, brand ΔE 1.56. The luminance is the predicate; the colours are not. */
    const lum = luminance(pre);
    if (lum >= site.threshold[0]) {
      return {
        kind: 'precomp-refused', code: 'BLOOM_REACHES_MARK',
        detail:
          `pre-compensated luminance ${lum.toFixed(4)} is at or above the bright-pass floor ` +
          `${site.threshold[0]}, so bloom is added to this mark before the curve at gain ` +
          `${site.bloomGain}`,
      };
    }
  }
  return [pre[0] / site.shaderScale, pre[1] / site.shaderScale, pre[2] / site.shaderScale];
}
