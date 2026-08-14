import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BRAND, BRAND_HEX, linearToHex, type BrandKey } from '../look/colour.js';
import { toneMapComposite, TONE_SHOULDER, TONE_MAP_GLSL, SRGB_ENCODE_GLSL } from '../look/tonemap.js';
import { PIPELINE_SOURCES } from '../look/pipeline.js';
import { LINES_VERT, LINES_FRAG, STROKE_CLIP_LINEAR, strokeClipRatio } from './lines.js';
import { POINTS_VERT, POINTS_FRAG, FALLOFF } from './points.js';

/**
 * THE INVARIANT A FLAT MARK GETS, AND WHY IT IS NOT THE ONE THE 3-D PATH GOT.
 *
 * `brandPixel.test.ts` retired "brand hex exact" for the lit path and replaced it with ORDER
 * SURVIVES, and for a lit mesh that replacement is forced: radiance is base colour × illumination,
 * so a shaded sphere is never a flat swatch and asking for one is a category error.
 *
 * A flat mark has no illumination to blame, so the burden here is higher and the question is a
 * real one: a 2-D shape filled with a data colour has no physical reason to lose its hex. This
 * file is what happened when it was asked, against bytes from `docs/3d/flat-fidelity.mjs`.
 *
 * ── WHAT THE MEASUREMENT SETTLED ───────────────────────────────────────────────────────────
 *
 * The finding this file answers said `points.ts:111` and `lines.ts:36` "multiply the data colour
 * by uGain and a falloff BEFORE the composite, so the flat chart path breaks the hex
 * independently of the tone map". Three parts of that are wrong and one is worse than stated:
 *
 *   1. AT UNIT GAIN THE PRIMITIVE ADDS NOTHING. `linesUnit` lands on the exact byte triple
 *      `brand-fidelity.json` records for a mark with no primitive in the path. There is no
 *      independent breakage to find at gain 1.
 *   2. THE TWO CAUSES ARE ONE. `uColour * uGain * (1 - uFade*t)` is a single scalar at a pixel,
 *      and the two rows measured through it are byte-identical on all seven colours.
 *   3. NEITHER FILE IS THE FLAT CHART PATH. `createPointCloud` has one caller in the repo and it
 *      is a docs harness; `createLineBatch`'s two callers are a lit 3-D environment and a
 *      perspective figure. The flat chart primitives are `flat/bars.ts` and `flat/strokes.ts`.
 *   4. AND THE SCALAR DOES SOMETHING WORSE THAN MOVE A HEX — it pins a channel at 255, which
 *      breaks ORDER, the invariant that replaced the one this finding was written against.
 *
 * So the flat path's invariant is neither "the hex survives" nor the lit path's bare monotonicity:
 *
 *   > A FLAT MARK'S HEX IS RECOVERABLE — the primitive applies exactly one scalar and the
 *   > composite is a known function — AND ORDER SURVIVES ONLY BELOW `STROKE_CLIP_LINEAR`.
 *   > Above it the mark stops encoding.
 *
 * Re-measure with:  node docs/3d/flat-fidelity.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/* Resolved from this file, not from `process.cwd()` — see the note in `brandPixel.test.ts`. */
const RECORD_PATH = resolve(HERE, '../../../../docs/3d/flat-fidelity.json');

interface Row { readonly pixel: string; readonly delta: readonly number[]; readonly deltaE: number }
interface Rung { readonly m: number; readonly gain: number; readonly pixel: string; readonly byte: number; readonly deltaE: number }
interface Measurement {
  readonly measuredAt: string;
  readonly driver: string;
  readonly hdr: boolean;
  readonly sourceHash: string;
  readonly toneShoulder: number;
  readonly clipLinear: number;
  readonly falloff: number;
  readonly fadeEquivGain: number;
  readonly rows: { readonly [k in BrandKey]: { readonly [cfg: string]: Row } };
  readonly ceiling: { readonly [k in BrandKey]: { readonly ceiling: number; readonly channel: number; readonly rungs: readonly Rung[] } };
  readonly points: {
    readonly [k in BrandKey]: {
      readonly noBlend: string; readonly additive: string; readonly channel: number;
      readonly rgbFactorAtCore: number; readonly alphaAtCore: number; readonly deliveredFraction: number;
      readonly halfMaxPx: { readonly noBlend: number | null; readonly additive: number | null };
    };
  };
}

const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as Measurement;
const KEYS = Object.keys(BRAND_HEX) as BrandKey[];

const bytesOf = (hex: string): [number, number, number] =>
  [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16)) as [number, number, number];

describe('the record is current, and was produced by the shaders in this package', () => {
  it('covers every palette colour and every configuration — walked, not listed', () => {
    expect(KEYS.length).toBeGreaterThan(0);
    for (const k of KEYS) {
      for (const cfg of ['linesUnit', 'linesFade', 'linesGainEquiv', 'linesShipped']) {
        expect(record.rows[k]?.[cfg]?.pixel, `${k}/${cfg} missing — re-run docs/3d/flat-fidelity.mjs`)
          .toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(record.ceiling[k]?.rungs?.length, `${k} has no ceiling sweep`).toBeGreaterThan(0);
      expect(record.points[k]?.additive, `${k} has no point deposit`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('the primitive AND composite sources have not changed since the pixels were read', () => {
    /*
     * `brand-fidelity.json`'s hash covers the composite chain and the palette and NEITHER
     * primitive — correctly, because that record deliberately measures no primitive. This
     * record's whole subject is what the primitives do before the composite, so an edit to
     * LINES_FRAG or POINTS_FRAG has to invalidate it. Without this hash, changing `uGain` to
     * `uGain * 0.9` in lines.ts would leave every assertion below comparing a stale record to
     * itself and passing forever, which is the failure mode `assertBrandFidelity` shipped for
     * months.
     */
    const live = createHash('sha256')
      .update([
        LINES_VERT + ' | ' + LINES_FRAG,
        POINTS_VERT + ' | ' + POINTS_FRAG,
        PIPELINE_SOURCES.composite, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, JSON.stringify(BRAND_HEX),
      ].join(' | '))
      .digest('hex').slice(0, 16);
    expect(live, `primitives or pipeline changed since ${record.measuredAt} — re-run: node docs/3d/flat-fidelity.mjs`)
      .toBe(record.sourceHash);
  });

  it('the measurement ran on an HDR target, or its ceiling sweep would be the target\'s limit', () => {
    /* An RGBA8 scene target clips at 1.0 during ACCUMULATION, before the composite ever sees the
       value. Every rung above 1.0 would then report the buffer's limit and the whole ceiling
       result would be a fact about the target rather than about the tone curve. */
    expect(record.hdr, `measured on an 8-bit scene target (${record.driver})`).toBe(true);
  });
});

describe('lines.ts is colour-transparent at unit gain — the hex shift is the composite\'s alone', () => {
  it('a rule at gain 1 lands exactly where the CPU tone map puts the palette constant', () => {
    /*
     * THE MEASUREMENT THAT DECIDES WHETHER THIS PRIMITIVE IS A CAUSE AT ALL.
     *
     * A `rule` covering the whole frame, gain 1, fade 0, plate 0, bloom 0 — a fully covered
     * pixel of a flat data mark, with no edge and no partial coverage anywhere near it. If
     * lines.ts damaged the colour on its own, these bytes would differ from what the composite
     * alone produces. Reproduced from the LIVE `toneMapComposite` rather than from
     * `brand-fidelity.json`, so this file does not depend on another instrument's record.
     *
     * ±1 for the RGBA16F round trip, matching `brandPixel.test.ts`'s tolerance.
     */
    for (const k of KEYS) {
      const predicted = bytesOf(linearToHex(toneMapComposite(BRAND[k])));
      const measured = bytesOf(record.rows[k].linesUnit!.pixel);
      for (let c = 0; c < 3; c++) {
        expect(
          Math.abs(predicted[c]! - measured[c]!),
          `${k} channel ${'rgb'[c]}: through lines.ts the GPU wrote ${measured[c]}, the composite alone predicts ${predicted[c]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('uGain and the fade are ONE scalar, so they are not two causes to report', () => {
    /*
     * `uColour * uGain * (1 - uFade*t)`. At the sampled pixel t is 0.50195, so fade 0.55 is a
     * factor of 0.72393 — and the instrument drew the same stroke a second time at exactly that
     * gain with no fade. Byte-identical on all seven means the falloff at line 36 has no
     * behaviour of its own to separate out.
     */
    expect(record.fadeEquivGain).toBeGreaterThan(0);
    expect(record.fadeEquivGain).toBeLessThan(1);
    for (const k of KEYS) {
      expect(
        record.rows[k].linesFade!.pixel,
        `${k}: the fade and the equivalent gain diverged, so they are not the same multiply`,
      ).toBe(record.rows[k].linesGainEquiv!.pixel);
    }
  });
});

describe('the scalar has a cliff, and ORDER — the invariant that replaced rule 5 — dies at it', () => {
  it('STROKE_CLIP_LINEAR is derived from the live shoulder and matches what was measured', () => {
    expect(STROKE_CLIP_LINEAR).toBeCloseTo(1 / (1 - TONE_SHOULDER), 10);
    expect(record.toneShoulder, 'the record was taken under a different shoulder').toBe(TONE_SHOULDER);
    expect(record.clipLinear).toBeCloseTo(STROKE_CLIP_LINEAR, 6);
  });

  it('`strokeClipRatio` reaches 1 at exactly the gain each colour was swept against', () => {
    /* Ties the exported helper to the bytes. Each key's ceiling is derived from ITS OWN
       brightest channel, so a palette entry added later is covered without a new case here. */
    for (const k of KEYS) {
      const ceiling = record.ceiling[k].ceiling;
      expect(strokeClipRatio({ colour: BRAND[k], gain: ceiling }), `${k}`).toBeCloseTo(1, 3);
      /* And the recorded channel is the one the helper maximises over. */
      const max = Math.max(...BRAND[k]);
      expect(BRAND[k][record.ceiling[k].channel], `${k} swept the wrong channel`).toBeCloseTo(max, 10);
    }
  });

  it('below the ceiling the byte moves with the data; at and above it, it does not', () => {
    /*
     * THE FAILURE, STATED AS THE BOUNDARY IT HAS.
     *
     * Under the ceiling the composite is strictly monotone and a reader comparing two marks is
     * comparing what the data says. At 1.0× the pinned channel reaches 255 and every rung above
     * it reports 255 as well — measured 0.9× → 248, 0.98× → 254, then 1.0×, 1.02×, 1.1×, 1.5×
     * and 2.0× all → 255. A stroke at twice its ceiling and one at exactly its ceiling render
     * the same pixel, so the top of any ramp built out of `gain` is flat.
     *
     * Both halves are derived from each rung's own multiple, not from a list of gains, and both
     * are asserted non-empty first: "every rung above the ceiling agrees" is trivially true of
     * no rungs.
     */
    for (const k of KEYS) {
      const rungs = record.ceiling[k].rungs;
      const below = rungs.filter((r) => r.m <= 0.9);
      const atOrAbove = rungs.filter((r) => r.m >= 1);
      expect(below.length, `${k}: nothing swept below the ceiling`).toBeGreaterThan(1);
      expect(atOrAbove.length, `${k}: nothing swept at or above the ceiling`).toBeGreaterThan(1);

      for (let i = 1; i < below.length; i++) {
        expect(
          below[i]!.byte,
          `${k}: gain ${below[i]!.gain} did not read brighter than ${below[i - 1]!.gain} below the ceiling`,
        ).toBeGreaterThan(below[i - 1]!.byte);
      }
      /* The pin, and the fact that the gains being compared really are different — otherwise
         this asserts that a number equals itself. */
      for (const r of atOrAbove) {
        expect(r.byte, `${k}: ${r.m}× the ceiling was not pinned`).toBe(255);
      }
      expect(
        atOrAbove[atOrAbove.length - 1]!.gain / atOrAbove[0]!.gain,
        `${k}: the pinned rungs are not far enough apart to prove anything`,
      ).toBeGreaterThan(1.5);
    }
  });

  it('overdriving costs more hue than the composite does, on every palette entry', () => {
    /*
     * DERIVED, and each entry is compared against ITS OWN floor rather than a shared number.
     * The floor is `linesUnit` — the same stroke at gain 1, which this file has already shown
     * is the composite acting alone. Driving to 2× the ceiling is strictly worse for all seven,
     * from `plate` (0 → 84.6) to `reference` (14.4 → 37.7).
     */
    for (const k of KEYS) {
      const top = record.ceiling[k].rungs.find((r) => r.m === 2);
      expect(top, `${k} was not swept at 2× its ceiling`).toBeTruthy();
      expect(
        top!.deltaE,
        `${k}: 2× the ceiling cost ${top!.deltaE} ΔE against ${record.rows[k].linesUnit!.deltaE} for the composite alone`,
      ).toBeGreaterThan(record.rows[k].linesUnit!.deltaE);
    }
  });

  it('and on the anchor it passes the transform the doctrine calls badly wrong', () => {
    /*
     * `look/colour.ts` names AgX "the fashionable default, and badly wrong" for moving brand
     * blue to `#467ECF`, ΔE76 41.1. Brand blue at 2× its ceiling lands `#51abff` at 48.9 — the
     * composite alone costs 18.3, so the scalar contributes more damage than the whole tone
     * curve does.
     *
     * THIS ASSERTS ON BRAND BLUE AND NOT ON THE PALETTE, and the first draft of it did the
     * opposite. Written as "every entry with real headroom exceeds AgX", it failed on
     * `reference`: 37.65, under 41.1. The threshold was not too high — the comparison was not
     * like for like. 41.1 is a measurement of AgX ON BRAND BLUE, so it bounds one colour and
     * says nothing about the other six. The general claim is the test above; this is the one
     * colour where the doctrine's own yardstick applies.
     */
    const AGX_ON_BRAND_BLUE = 41.1;
    const top = record.ceiling.brand.rungs.find((r) => r.m === 2);
    expect(top, 'brand was not swept at 2× its ceiling').toBeTruthy();
    expect(top!.deltaE, `brand blue at 2× its ceiling, against AgX's ${AGX_ON_BRAND_BLUE}`)
      .toBeGreaterThan(AGX_ON_BRAND_BLUE);
    expect(record.rows.brand.linesUnit!.deltaE, 'the composite floor moved').toBeLessThan(AGX_ON_BRAND_BLUE / 2);
  });
});

describe('points.ts applies its gaussian twice, which is a footprint defect and not a colour one', () => {
  it('the additive blend multiplies by an alpha the fragment already contains', () => {
    /*
     * Same shader, same fragment, two draws: one with blending OFF, which writes the rgb
     * straight, and one with the shipped `beginAdditive` (SRC_ALPHA/ONE), which multiplies that
     * rgb by the fragment's own alpha. The ratio IS that alpha. It is not 1, so the coverage
     * term at points.ts:111 is applied a second time by the blender.
     *
     * Stated without any shader constant in it: the delivered fraction is strictly less than
     * either factor alone, which is what "applied twice" means and nothing else does.
     */
    for (const k of KEYS) {
      const p = record.points[k];
      expect(p.alphaAtCore, `${k}: the blend contributed no alpha, so nothing is doubled`).toBeLessThan(1);
      expect(p.deliveredFraction, `${k}`).toBeLessThan(p.rgbFactorAtCore);
      expect(p.deliveredFraction, `${k}`).toBeLessThan(p.alphaAtCore);
    }
  });

  it('the deposit is narrower than FALLOFF describes, by the factor squaring predicts', () => {
    /*
     * A gaussian `exp(-a·r²)` has its half-max at `r = sqrt(ln2/a)`. Squaring it doubles `a`,
     * so the half-max radius shrinks by exactly 1/√2 = 0.707 — a signature that needs no
     * knowledge of FALLOFF, `near`, or the 0.55. Measured on a 64-px-wide deposit: 18 px
     * unblended, 12-13 px as shipped, a ratio of 0.67-0.72. The pedestal subtraction is why it
     * is not 0.707 exactly, so the band is generous in both directions and still excludes 1.
     */
    const SQUARED = 1 / Math.SQRT2;
    for (const k of KEYS) {
      const { noBlend, additive } = record.points[k].halfMaxPx;
      expect(noBlend, `${k}: no unblended half-max radius was found`).toBeTruthy();
      expect(additive, `${k}: no shipped half-max radius was found`).toBeTruthy();
      const ratio = additive! / noBlend!;
      expect(ratio, `${k}: the shipped deposit is not narrower than the unblended one`).toBeLessThan(1);
      expect(Math.abs(ratio - SQUARED), `${k}: ratio ${ratio.toFixed(3)} is not the 1/√2 of a squared gaussian`)
        .toBeLessThan(0.08);
    }
  });

  it('the core can never exceed the pedestal-subtracted peak FALLOFF defines', () => {
    /* `g = max(exp(-r²·FALLOFF) - exp(-FALLOFF), 0)` peaks at `1 - exp(-FALLOFF)` = 0.826, not
       at 1 — so even before the aerial-perspective term and the mass ramp, a deposit's core is
       17.4% down. Derived from the LIVE constant, so raising FALLOFF moves this bound. */
    const peak = 1 - Math.exp(-FALLOFF);
    expect(record.falloff, 'the record was taken at a different FALLOFF').toBe(FALLOFF);
    for (const k of KEYS) {
      expect(record.points[k].rgbFactorAtCore, `${k} exceeded the falloff's own peak`).toBeLessThan(peak);
    }
  });
});
