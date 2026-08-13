/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE SHADOW BIAS SCALES WITH THE MAP THE TIER ACTUALLY RENDERS.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  Commit 38c01b1 gave the minimum quality tier a ONE-TAP shadow lookup, which is what `quality.ts`
 *  had been declaring and nothing had been reading. An adversarial pass then found the consequence
 *  that fix carried with it, and it is the sort of thing only shows up on hardware nobody tests on:
 *
 *  Depth error from a shadow map scales with TEXEL size. The constants 0.0009 and 0.0045 were tuned
 *  against the map an environment actually renders. The ladder shrinks that map —
 *  `shadowMapSizeFor('minimum', 1024)` is 256, a quarter of the linear resolution — where the bias
 *  needed to clear self-shadowing is roughly FOUR TIMES larger. Under 3x3 PCF the residual acne
 *  averaged into a three-level dither and read as softness. One tap does not average, so the same
 *  residual becomes hard binary speckle, on exactly the tier that exists for weak machines.
 *
 *  The scale is `baseline / actual`, against the environment's OWN baseline rather than a global
 *  constant. That is the load-bearing choice and it is what these tests mostly pin: at the full tier
 *  actual == baseline, so the scale is exactly 1.0 and every approved capture is unchanged BY
 *  CONSTRUCTION — including e4's and e6's 1536 maps, which a global-1024 reference would have altered
 *  while fixing the minimum tier. Trading one regression for another is not a fix.
 */
import { describe, expect, it } from 'vitest';
import { LIT_FRAG } from './lit.js';
import { QUALITY_TIERS, qualitySettings, shadowMapSizeFor } from './quality.js';

/** The JS side of the scale, mirroring what `createLitRenderer` computes before the uniform1f. */
function biasScale(baseline: number | undefined, actual: number): number {
  const s = baseline && baseline > 0 && actual > 0 ? baseline / actual : 1;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Every baseline in the programme. All seven shipping components use 1024; harnesses use both. */
const BASELINES = [1024, 1536] as const;

describe('the bias scale is 1.0 wherever a capture was approved', () => {
  it('is exactly 1.0 at the full tier, for every baseline', () => {
    expect(BASELINES.length).toBeGreaterThan(0);
    for (const baseline of BASELINES) {
      const actual = shadowMapSizeFor('full', baseline);
      /* The whole reason for scaling against the environment's own baseline rather than a global 1024:
         if this were not exactly 1, every full-tier capture in docs/3d would have silently moved. */
      expect(actual, `full tier must render the baseline itself at ${baseline}`).toBe(baseline);
      expect(biasScale(baseline, actual)).toBe(1);
    }
  });

  it('defaults to 1.0 when no baseline is passed, so an un-wired caller is unaffected', () => {
    expect(biasScale(undefined, 256)).toBe(1);
  });
});

describe('and it grows exactly as fast as the map shrinks', () => {
  it('compensates every rung of the ladder, at both baselines', () => {
    const seen: string[] = [];
    for (const baseline of BASELINES) {
      for (const tier of QUALITY_TIERS) {
        const actual = shadowMapSizeFor(tier, baseline);
        const scale = biasScale(baseline, actual);
        /* The claim is proportionality, not a table of magic numbers: bias x texel must be invariant,
           i.e. scale must equal baseline/actual. Asserting the ratio rather than the value means a
           change to the ladder's rungs cannot silently invalidate this test. */
        expect(scale, `${tier}@${baseline}`).toBeCloseTo(baseline / actual, 12);
        expect(scale).toBeGreaterThanOrEqual(1);
        seen.push(`${tier}@${baseline}=${actual}x${scale}`);
      }
    }
    expect(seen).toHaveLength(BASELINES.length * QUALITY_TIERS.length);
  });

  it('gives the minimum tier 4x the bias at a 1024 baseline, which is the case that bit', () => {
    /*
     * The specific number from the review. shadowMapSizeFor('minimum', 1024) is 256 — a quarter of the
     * linear resolution — and this is the tier that now takes one tap. Pinned as a number because it is
     * the one an operator would see speckle on.
     */
    const actual = shadowMapSizeFor('minimum', 1024);
    expect(actual).toBe(256);
    expect(biasScale(1024, actual)).toBe(4);
    /* And it is the one-tap tier: if this ever stops being 1, the speckle argument stops applying and
       this test should be re-read rather than trusted. */
    expect(qualitySettings('minimum').shadowTaps).toBe(1);
  });

  it('never DIVIDES the bias, which would cause acne rather than cure it', () => {
    /* A scale below 1 would mean the tier rendered a FINER map than the baseline. The ladder cannot do
       that (shadowMapSizeFor is capped at the baseline), and if it ever could, less bias on a coarser
       map is the wrong direction and should fail here rather than ship. */
    for (const baseline of BASELINES) {
      for (const tier of QUALITY_TIERS) {
        expect(shadowMapSizeFor(tier, baseline)).toBeLessThanOrEqual(baseline);
      }
    }
  });
});

describe('the shader consumes it, or none of the above means anything', () => {
  it('declares the uniform and multiplies the bias by it', () => {
    expect(LIT_FRAG).toContain('uniform float uShadowBiasScale;');
    expect(LIT_FRAG).toContain('max(0.0009, 0.0045 * (1.0 - NdotL)) * uShadowBiasScale');
  });

  it('applies it BEFORE the branch, so both tap counts get the same bias', () => {
    /*
     * The 1-tap and 9-tap paths must not disagree about bias — that was already pinned when the branch
     * was added, and scaling the bias is exactly the change that could break it by moving the
     * multiplication inside one arm.
     */
    const fn = LIT_FRAG.slice(LIT_FRAG.indexOf('float shadowFactor'), LIT_FRAG.indexOf('void main('));
    expect(fn.match(/float bias = /g) ?? []).toHaveLength(1);
    expect(fn.indexOf('float bias =')).toBeLessThan(fn.indexOf('if (uShadowTaps < 9)'));
    expect(fn.match(/uShadowBiasScale/g) ?? []).toHaveLength(1);
  });
});
