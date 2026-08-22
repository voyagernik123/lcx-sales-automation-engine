import { describe, expect, it } from 'vitest';
import {
  PRICE_PROPOSAL_METHOD, costQuantilesFrom, pricingPolicyDefects, proposePriceCents,
  type CostQuantiles,
} from './pricing.js';

/**
 * The inverse solver, held to the same standard as the forward simulation: integer
 * cents everywhere, observed order statistics only, and every conservatism NAMED in
 * the basis rather than silently inherited. The fixtures are hand-checkable — every
 * expected price below can be verified with a pocket calculator, which is the point
 * of a formula this small being a module at all.
 */

const Q: CostQuantiles = {
  p50CostCents: 500_000,   // $5,000
  p90CostCents: 800_000,   // $8,000
  p95CostCents: 900_000,   // $9,000
  maxCostCents: 1_200_000, // $12,000
};

describe('the policy bounds', () => {
  it('accepts the packet defaults and refuses both dials out of range, with the why', () => {
    expect(pricingPolicyDefects({ targetMarginPct: 0.45, pLossCeiling: 0.1 })).toEqual([]);
    expect(pricingPolicyDefects({ targetMarginPct: 0, pLossCeiling: 0.1 })[0]).toContain('(0, 0.9]');
    expect(pricingPolicyDefects({ targetMarginPct: 0.95, pLossCeiling: 0.1 })[0]).toContain('10×');
    expect(pricingPolicyDefects({ targetMarginPct: 0.45, pLossCeiling: 0.6 })[0]).toContain('donation schedule');
    expect(pricingPolicyDefects({ targetMarginPct: Number.NaN, pLossCeiling: Number.NaN })).toHaveLength(2);
  });
});

describe('costQuantilesFrom — the derivation the distribution already documents', () => {
  it('derives p95 and max cost from the margin tail at a fixed price', () => {
    const q = costQuantilesFrom({
      priceCents: 1_500_000,
      p50CostCents: 500_000,
      p90CostCents: 800_000,
      p05MarginCents: 600_000,  // → p95 cost 900k
      minMarginCents: 300_000,  // → max cost 1.2m
    });
    expect(q).toEqual(Q);
  });
});

describe('proposePriceCents', () => {
  it('margin floor binds when the target is ambitious: ceil(p50/(1−m))', () => {
    // ceil(500000 / 0.55) = 909091 > p90 cost 800000.
    const out = proposePriceCents(Q, { targetMarginPct: 0.45, pLossCeiling: 0.1 });
    if (!out.ok) throw new Error(out.defects.join('; '));
    expect(out.proposedPriceCents).toBe(909_091);
    expect(out.basis.bindingFloor).toBe('margin');
    expect(out.basis.lossQuantilePctUsed).toBe(90);
    expect(out.basis.conservativeSnap).toBeNull();
    expect(out.basis.method).toBe(PRICE_PROPOSAL_METHOD);
  });

  it('loss floor binds when the ceiling is strict: the p95 cost order statistic', () => {
    // ceil(500000 / 0.8) = 625000 < p95 cost 900000.
    const out = proposePriceCents(Q, { targetMarginPct: 0.2, pLossCeiling: 0.05 });
    if (!out.ok) throw new Error(out.defects.join('; '));
    expect(out.proposedPriceCents).toBe(900_000);
    expect(out.basis.bindingFloor).toBe('loss');
    expect(out.basis.lossQuantilePctUsed).toBe(95);
  });

  it('a ceiling between grid points snaps STRICTER and says so', () => {
    // 0.2 needs q80; the grid evidences it at q90. Snap named, floor raised, never lowered.
    const out = proposePriceCents(Q, { targetMarginPct: 0.2, pLossCeiling: 0.2 });
    if (!out.ok) throw new Error(out.defects.join('; '));
    expect(out.basis.lossQuantilePctUsed).toBe(90);
    expect(out.basis.conservativeSnap).toContain('0.10 grid point');
    expect(out.proposedPriceCents).toBe(800_000); // loss floor 800k > margin floor 625k
  });

  it('a ceiling below the smallest grid point prices at the worst sampled cost', () => {
    const out = proposePriceCents(Q, { targetMarginPct: 0.2, pLossCeiling: 0.01 });
    if (!out.ok) throw new Error(out.defects.join('; '));
    expect(out.proposedPriceCents).toBe(1_200_000);
    expect(out.basis.lossQuantilePctUsed).toBe(100);
    expect(out.basis.conservativeSnap).toContain('more samples, not more arithmetic');
  });

  it('reports "both" when the floors land on the same cent', () => {
    // p50 400000, m = 0.5 → margin floor 800000 = p90 cost.
    const q = { ...Q, p50CostCents: 400_000 };
    const out = proposePriceCents(q, { targetMarginPct: 0.5, pLossCeiling: 0.1 });
    if (!out.ok) throw new Error(out.defects.join('; '));
    expect(out.proposedPriceCents).toBe(800_000);
    expect(out.basis.bindingFloor).toBe('both');
  });

  it('refuses crossed or fractional order statistics instead of solving on them', () => {
    const crossed = proposePriceCents({ ...Q, p90CostCents: 950_000 }, { targetMarginPct: 0.45, pLossCeiling: 0.1 });
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.defects[0]).toContain('monotone');
    const fractional = proposePriceCents({ ...Q, p50CostCents: 500_000.5 }, { targetMarginPct: 0.45, pLossCeiling: 0.1 });
    expect(fractional.ok).toBe(false);
    if (!fractional.ok) expect(fractional.defects[0]).toContain('integer cents');
  });

  it('refuses a bad policy before touching the quantiles, returning every defect', () => {
    const out = proposePriceCents(Q, { targetMarginPct: 2, pLossCeiling: 0.9 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.defects).toHaveLength(2);
  });

  it('the proposal is always an integer number of cents', () => {
    for (const m of [0.3, 0.33, 0.45, 0.6, 0.9]) {
      const out = proposePriceCents(Q, { targetMarginPct: m, pLossCeiling: 0.1 });
      if (!out.ok) throw new Error(out.defects.join('; '));
      expect(Number.isInteger(out.proposedPriceCents)).toBe(true);
      // The margin floor genuinely delivers the target at the median.
      const p50Margin = (out.proposedPriceCents - Q.p50CostCents) / out.proposedPriceCents;
      expect(p50Margin).toBeGreaterThanOrEqual(m - 1e-9);
    }
  });
});
