/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  CATEGORICAL SEPARATION — the invariant order preservation does not imply, pinned.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  §6 rule 5's replacement is ORDER SURVIVES: the tone map is monotone per channel, so a denser
 *  mark never renders lighter than a sparser one. This file exists because that sentence is true
 *  and insufficient. Monotone is not injective. A monotone curve can map "this is our data"
 *  (#2C6BFF) and "no measurement exists" (#6B7A99) onto the same pixel and still preserve every
 *  order there is — and measured off a framebuffer, the shipped rig puts them 4.56 CIEDE2000
 *  apart at the brightest fragment of a lit marker, from 14.21 at the palette.
 *
 *  WHAT EACH TEST HERE CAN FAIL ON, because a test whose failure mode is not stated is how
 *  `assertBrandFidelity` came to be believed:
 *    · the CIEDE2000 implementation — twelve pairs of published test data, including the
 *      mean-hue-wrap and blue-rotation cases that are the standard way the formula is got wrong;
 *    · the PARTITION — a palette key added, renamed, or moved between claim and scenery;
 *    · the PIPELINE — the seven pinned separations are reproduced through the LIVE
 *      `toneMapComposite`, so a shoulder change or a curve change moves them, and the negative
 *      control below proves it by driving the shoulder to 0.45 and watching the number move.
 *
 *  WHAT IT DOES NOT CLAIM. It does not read a pixel. The GPU numbers it pins were measured with a
 *  Playwright/SwiftShader harness (see docs/3d/w2/CATEGORICAL_SEPARATION.md for the method and the
 *  per-surface results); what this file proves is that the CPU path still reproduces them, which
 *  is the part that can silently drift.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL_FLOOR_DE2000,
  CATEGORICAL_POLICY,
  ENCODE_CLIP_RADIANCE,
  PALETTE_CATEGORIES,
  RAMP_CHROMA_FLOOR,
  TONE_ASYMPTOTE,
  categoryOf,
  chromaOf,
  claimPairs,
  deltaE2000,
  deltaE2000Lab,
  deltaE76,
  differentClaim,
  illuminationCeiling,
  labOf,
  pixelAt,
  reinhard,
  separationFailures,
  separationThroughComposite,
  type CategoryId,
  type Lab,
} from './categorical.js';
import { BRAND, BRAND_HEX, type BrandKey } from './colour.js';
import { TONE_SHOULDER, toneMapComposite } from './tonemap.js';
import { sceneTheme } from './theme.js';

const KEYS = Object.keys(BRAND_HEX) as BrandKey[];

describe('the colour-difference metric is the published one', () => {
  /**
   * Sharma, Wu & Dalal's CIEDE2000 test data. These are not decoration: rows 4-6 are the pairs
   * whose mean hue straddles 0/360, and rows 8-9 are the ones the RT rotation term dominates.
   * An implementation that averages hue naively passes the easy rows and fails these, and every
   * colour in this palette except `reference` sits in the hue region RT governs.
   */
  const CASES: ReadonlyArray<readonly [Lab, Lab, number]> = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
    [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];

  it('reproduces all twelve published pairs to four decimals', () => {
    expect(CASES).toHaveLength(12);
    for (const [a, b, expected] of CASES) {
      expect(deltaE2000Lab(a, b)).toBeCloseTo(expected, 4);
    }
  });

  it('is symmetric, which the formula is not obviously guaranteed to be after the G correction', () => {
    for (const [a, b] of CASES) expect(deltaE2000Lab(a, b)).toBeCloseTo(deltaE2000Lab(b, a), 10);
  });

  it('CIE76 is optimistic on exactly the pair this whole file is about, by 4.8x', () => {
    /* THIS IS WHY NOBODY CAUGHT IT. Every existing number in this repo — brand-fidelity.json,
       tonemap.ts's header, colour.ts's table — is CIE76. On brand/refusal it reads 68.2, which
       looks like an enormous margin. CIEDE2000 reads 14.2, which is 1.4x the floor. CIE76 has no
       chroma weighting, so it charges full Euclidean price for a b*-axis gap the eye discounts. */
    const e76 = deltaE76(BRAND.brand, BRAND.refusal);
    const e00 = deltaE2000(BRAND.brand, BRAND.refusal);
    expect(e76).toBeCloseTo(68.23, 1);
    expect(e00).toBeCloseTo(14.21, 1);
    expect(e76 / e00).toBeGreaterThan(4.5);
  });
});

describe('the category partition is derived, total and disjoint', () => {
  it('classifies every palette key exactly once', () => {
    expect(KEYS.length).toBeGreaterThan(0);
    expect(Object.keys(PALETTE_CATEGORIES).sort()).toEqual([...KEYS].sort());
    const valid: readonly CategoryId[] = ['density', 'annotation', 'absence', 'scenery'];
    for (const k of KEYS) expect(valid).toContain(categoryOf(k));
  });

  it('puts the density ramp together and the two opposite claims apart', () => {
    expect(categoryOf('brand')).toBe('density');
    expect(categoryOf('brandBright')).toBe('density');
    expect(categoryOf('brandDeep')).toBe('density');
    expect(categoryOf('reference')).toBe('annotation');
    expect(categoryOf('refusal')).toBe('absence');
  });

  it('agrees with theme.ts on which keys are scenery, so the two derivations cannot drift', () => {
    /* semantic.ts derives DATA_KEYS the same way. Two hand-written lists of one boundary is how a
       boundary rots; if `SceneTheme` gains a field named after a data colour, theme.test.ts fails
       first and this fails second. */
    const sceneryFields = new Set(Object.keys(sceneTheme('dark')));
    for (const k of KEYS) {
      expect(categoryOf(k) === 'scenery').toBe(sceneryFields.has(k));
    }
  });

  it('takes the chroma cut from the ramp, and both sides of it clear by a wide factor', () => {
    /* If this margin ever narrows, the partition is being decided by a coin flip and the doc's
       claim that "any cut between 19 and 70 gives the same answers" has stopped being true. */
    expect(RAMP_CHROMA_FLOOR).toBeCloseTo(chromaOf(BRAND.brandDeep), 6);
    expect(RAMP_CHROMA_FLOOR).toBeCloseTo(40.2, 1);
    expect(chromaOf(BRAND.refusal)).toBeCloseTo(18.62, 1);
    expect(chromaOf(BRAND.reference)).toBeCloseTo(70.5, 1);
    expect(RAMP_CHROMA_FLOOR / chromaOf(BRAND.refusal)).toBeGreaterThan(2);
    expect(chromaOf(BRAND.reference) / RAMP_CHROMA_FLOOR).toBeGreaterThan(1.5);
  });

  it('records why hue is NOT the discriminator: it would split the ramp', () => {
    /* semantic.ts's HUE_BUCKET_DEG is 15 — "the granularity at which hues get separate names".
       brandBright is 18.0 degrees from the anchor, OUTSIDE it, so a hue-bucket derivation would
       file the top of the density ramp as a separate claim. That is the measurement that chose
       the naming derivation, and it is here so a future reader does not re-try hue. */
    const hue = (k: BrandKey): number => {
      const [, a, b] = labOf(BRAND[k]);
      return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    };
    const gap = Math.abs(((hue('brand') - hue('brandBright')) + 540) % 360 - 180);
    expect(gap).toBeCloseTo(18.0, 1);
    expect(gap).toBeGreaterThan(15);
  });

  it('governs cross-claim pairs only — not the ramp ends, not scenery', () => {
    /* THE QUALIFIER IS THE DESIGN. brandDeep and brandBright are the two ends of one ramp and are
       allowed to be close; forcing them apart would be inventing contrast the data does not have.
       brandDeep and rule are 5.1 apart at the palette BY DESIGN, because rule recedes. */
    expect(differentClaim('brand', 'refusal')).toBe(true);
    expect(differentClaim('brandBright', 'brandDeep')).toBe(false);
    expect(differentClaim('brandDeep', 'rule')).toBe(false);
    expect(deltaE2000(BRAND.brandDeep, BRAND.rule)).toBeLessThan(CATEGORICAL_FLOOR_DE2000);

    const pairs = claimPairs().map(([a, b]) => `${a}|${b}`);
    expect(pairs).toHaveLength(7);
    expect(pairs).toContain('brand|refusal');
    expect(pairs).toContain('brandBright|refusal');
    expect(pairs).not.toContain('brand|brandBright');
    expect(pairs.some((p) => p.includes('rule') || p.includes('plate'))).toBe(false);
  });
});

describe('the CPU model reproduces the GPU, so a pipeline change moves these numbers', () => {
  /**
   * Measured 2026-08-15 by rendering each palette entry as a flat mark at exactly its linear value
   * into the scene target, resolving the composite with plate 0 and bloom gain 0, and reading the
   * framebuffer back — the same configuration `docs/3d/brand-fidelity.mjs` calls `compositeOnly`.
   * Driver: ANGLE/SwiftShader. Seven pairs, seven agreements.
   */
  const GPU_AT_GAIN_1: Readonly<Record<string, number>> = {
    'brand|reference': 52.56,
    'brand|refusal': 13.34,
    'brandBright|reference': 43.5,
    'brandBright|refusal': 17.91,
    'brandDeep|reference': 57.96,
    'brandDeep|refusal': 24.08,
    'reference|refusal': 38.65,
  };

  it('reproduces every measured framebuffer separation to within 0.05', () => {
    const pairs = claimPairs();
    expect(pairs).toHaveLength(Object.keys(GPU_AT_GAIN_1).length);
    for (const [a, b] of pairs) {
      const recorded = GPU_AT_GAIN_1[`${a}|${b}`];
      expect(recorded, `no recorded GPU value for ${a}|${b}`).toBeDefined();
      expect(separationThroughComposite(a, b, 1)).toBeCloseTo(recorded!, 1);
    }
  });

  it('reproduces the recorded brand pixel itself, #2c68dc', () => {
    /* The same byte triple docs/3d/brand-fidelity.json records for `compositeOnly`. If this moves,
       the separations above are being computed on a different pipeline than the one measured. */
    expect(pixelAt('brand', 1)).toEqual([44, 104, 220]);
  });

  it('drives the local curve off the live shoulder and every pinned number moves — the negative control', () => {
    /*
     * Without this, "the CPU model reproduces the GPU" could be true of a constant. The
     * perturbation is TONE_SHOULDER 0.40 -> 0.45, the same one that broke brandPixel.test.ts with
     * "CPU says 216, the GPU wrote 220" while all 15 assertions in look.test.ts passed — and it
     * lands on the same byte here: brand's blue goes 220 -> 216.
     *
     * MEASURED SENSITIVITY, recorded because it is small and a reader should know how small: the
     * SEPARATION between two colours moves far less than either pixel does, 13.338 -> 13.524, a
     * move of 0.19. It clears the pin's own tolerance (toBeCloseTo(x, 1) admits 0.05) by 3.7x, so
     * the pin above does catch it — but a separation is a difference of differences, and anyone
     * adding a looser tolerance here should know they are one decimal from a blind gate.
     */
    expect(pixelAt('brand', 1)).toEqual([44, 104, 220]);
    expect(pixelAt('brand', 1, 0.45)).toEqual([44, 104, 216]);

    const live = separationThroughComposite('brand', 'refusal', 1);
    const perturbed = separationThroughComposite('brand', 'refusal', 1, 0.45);
    expect(live).toBeCloseTo(13.338, 2);
    expect(perturbed).toBeCloseTo(13.524, 2);
    expect(Math.abs(perturbed - live)).toBeGreaterThan(0.05);

    /* And it moves the VERDICT-BEARING number by 1.14, six times as much: a shoulder change is a
       change to how badly the categories collapse, not only to a pixel. */
    expect(separationThroughComposite('brandBright', 'refusal', 8)).toBeCloseTo(7.718, 2);
    expect(separationThroughComposite('brandBright', 'refusal', 8, 0.45)).toBeCloseTo(6.578, 2);
  });

  it('ties the local curve to the shipped one, so it cannot become a second copy free to drift', () => {
    for (const c of [0, 0.05, 0.25, 0.5, 1, 1.6666, 2, 8, 120] as const) {
      expect(reinhard([c, c, c], TONE_SHOULDER)).toEqual(toneMapComposite([c, c, c]));
    }
  });
});

describe('the arithmetic of the ceiling — why any bright rig destroys a category', () => {
  it('separates the output asymptote from the encode clip, because they are different numbers', () => {
    /* The asymptote 1/s = 2.50 is the number people quote. The one that limits the pipeline is
       1/(1-s) = 1.667, where the curve's OUTPUT reaches 1.0 and the 8-bit encode saturates. */
    expect(TONE_ASYMPTOTE).toBeCloseTo(2.5, 6);
    expect(ENCODE_CLIP_RADIANCE).toBeCloseTo(1.6667, 3);
    expect(toneMapComposite([ENCODE_CLIP_RADIANCE, 0, 0])[0]).toBeCloseTo(1, 10);
    /* 0.74 of a stop of headroom above linear 1.0 — and brand blue's blue channel is at 1.0. */
    expect(Math.log2(ENCODE_CLIP_RADIANCE)).toBeCloseTo(0.737, 2);
    expect(BRAND.brand[2]).toBeCloseTo(1, 10);
  });

  it('collapses every claim pair to zero once both entries clear the clip', () => {
    /* Not a limit argument — an equality. At gain 120, the gain GlobeReliefGl.tsx:515 runs its
       markers at, brand, brandBright, reference and refusal all encode to #FFFFFF. */
    for (const k of ['brand', 'brandBright', 'reference', 'refusal'] as const) {
      expect(pixelAt(k, 120)).toEqual([255, 255, 255]);
    }
    expect(separationThroughComposite('brand', 'refusal', 120)).toBe(0);
  });

  it('locates the gain at which each pair stops clearing the floor, from the live curve', () => {
    /* Both are inside the range the repo's own rigs use: GlobeReliefGl passes lightColour 6.6 and
       ambientGain 120. A number here that a rig cannot reach would make this invariant academic. */
    expect(illuminationCeiling('brandBright', 'refusal')).toBeCloseTo(6.26, 1);
    expect(illuminationCeiling('brand', 'refusal')).toBeCloseTo(45.64, 1);
    expect(illuminationCeiling('brandBright', 'refusal')!).toBeLessThan(6.6);
    expect(illuminationCeiling('brand', 'refusal')!).toBeLessThan(120);
  });
});

describe('the palette clears the floor and the rig is what breaks it', () => {
  it('has no failure at gain 1 — the defect is the lighting, not the hexes', () => {
    /* Important for who owns the fix. If the palette itself failed, the answer would be a retune;
       it does not, so the answer is about the rig and the material. The tightest pair is
       brand/refusal at 13.34 against a floor of 10 — 1.33x, not a comfortable margin. */
    expect(separationFailures(1)).toEqual([]);
    const tightest = Math.min(...claimPairs().map(([a, b]) => separationThroughComposite(a, b, 1)));
    expect(tightest).toBeCloseTo(13.34, 1);
    expect(tightest).toBeGreaterThan(CATEGORICAL_FLOOR_DE2000);
  });

  it('fails at gain 8, and names the pair and the number', () => {
    const failures = separationFailures(8);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.a).toBe('brandBright');
    expect(failures[0]!.b).toBe('refusal');
    expect(failures[0]!.categoryA).toBe('density');
    expect(failures[0]!.categoryB).toBe('absence');
    expect(failures[0]!.deltaE2000).toBeCloseTo(7.72, 1);
    expect(failures[0]!.reason).toContain('7.7');
    expect(failures[0]!.reason).toContain('rule 6');
  });
});

describe('ORDER SURVIVES and CATEGORICAL SEPARATION are different claims', () => {
  it('holds order at exactly the gain where the categories have already merged', () => {
    /* THE WHOLE POINT OF THIS FILE, in one test. At gain 8 the transform is strictly monotone —
       so "a denser mark never renders lighter than a sparser one" is TRUE — and at the same gain
       brandBright and refusal are 7.7 apart, under the floor. A reader can still tell which of two
       density marks is denser, and can no longer tell a measured mark from an unmeasured one. */
    const GAIN = 8;
    let previous = -Infinity;
    for (let c = 0; c <= 4; c += 0.01) {
      const mapped = toneMapComposite([c * GAIN, 0, 0])[0];
      expect(mapped).toBeGreaterThan(previous);
      previous = mapped;
    }
    expect(separationThroughComposite('brandBright', 'refusal', GAIN))
      .toBeLessThan(CATEGORICAL_FLOOR_DE2000);
  });

  it('states both, and does not claim a hex', () => {
    expect(CATEGORICAL_POLICY).toContain('DIFFERENT CATEGORIES');
    expect(CATEGORICAL_POLICY).toContain('order preservation does not imply it');
    /* The same discipline TONE_POLICY and STATUS_POLICY follow: a printed sentence may name a
       category and a measurement, never a pixel a lit surface cannot deliver. */
    expect(CATEGORICAL_POLICY).not.toMatch(/exact/i);
  });
});
