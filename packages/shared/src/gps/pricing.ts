/**
 * G3 — THE INVERSE SOLVER: from "what may this engagement risk" to "what must it
 * charge" (GPS_REVENUE_100X_PLAN.md §G3).
 *
 * Underwriting answers the forward question: given a price, what is the margin
 * distribution and P(loss)? This module answers the inverse: given the owner's two
 * policy dials — a target median margin and a loss-probability ceiling — what is
 * the lowest price that honours both? Two floors, and the price is their max:
 *
 *   marginFloor = ceil( p50Cost / (1 − targetMarginPct) )
 *       The median outcome earns at least the target margin percentage.
 *   lossFloor   = cost quantile at (1 − pLossCeiling)
 *       The price covers cost in at least (1 − ceiling) of sampled outcomes,
 *       so P(realised loss) ≤ ceiling by construction over the same samples.
 *
 * ── WHY QUANTILES SNAP CONSERVATIVELY ────────────────────────────────────────
 * The underwriting distribution exposes observed order statistics at fixed
 * percentiles (p50/p90/p95 and the sampled extremes) — nearest-rank, never
 * interpolated (PERCENTILE_METHOD). A ceiling that falls between grid points is
 * evidenced at the NEXT STRICTER one: a 0.20 ceiling uses the p90 cost, never a
 * made-up q80. The snap always raises the floor, never lowers it, and the basis
 * names the snap so the owner sees the conservatism instead of inheriting it
 * silently. Inventing an interpolated quantile here would manufacture precision
 * the simulation never produced — the exact move PERCENTILE_METHOD exists to ban.
 *
 * ── WHAT THIS NUMBER IS AND IS NOT ───────────────────────────────────────────
 * A PROPOSAL. The owner edits or overrides the final price on every quote
 * (decision 4 of the 2026-08-21 record) and `shouldBlockIssue` keeps its veto at
 * issue regardless of what anyone typed. Cost quantiles are price-invariant in
 * the underwriting model (cost = rate × days × overrun; margin = price − cost),
 * which is what makes solving from a reference run legitimate: the caller
 * re-underwrites AT the proposed price and returns that full distribution as the
 * proof, so the proposal never travels without the forward check that verifies it.
 */

/** The owner's two dials, as approved through the pricing_policy packet. */
export interface PricingPolicyValues {
  /** Target margin at the MEDIAN outcome, 0–1 exclusive of the bounds below. */
  targetMarginPct: number;
  /** Acceptable probability of a realised loss, 0–1. */
  pLossCeiling: number;
}

/** The policy bounds, stated once and cited by the validator and the packet alike. */
export const PRICING_POLICY_BOUNDS = {
  targetMarginPct: { min: 0, max: 0.9, minExclusive: true, maxExclusive: false },
  pLossCeiling: { min: 0, max: 0.5, minExclusive: true, maxExclusive: false },
} as const;

export function pricingPolicyDefects(policy: PricingPolicyValues): string[] {
  const out: string[] = [];
  const m = policy.targetMarginPct;
  const c = policy.pLossCeiling;
  if (!Number.isFinite(m) || m <= 0 || m > 0.9) {
    out.push(`targetMarginPct must be a number in (0, 0.9] — got ${String(m)}. A 0 target prices at cost; above 0.9 the divisor manufactures a 10× price from arithmetic, not judgment.`);
  }
  if (!Number.isFinite(c) || c <= 0 || c > 0.5) {
    out.push(`pLossCeiling must be a number in (0, 0.5] — got ${String(c)}. A ceiling above 0.5 accepts losing more often than not, which is not a pricing policy but a donation schedule.`);
  }
  return out;
}

/**
 * Cost order statistics, integer cents, derived from one underwriting run. With a
 * fixed price, margin is strictly decreasing in cost, so the sample at margin
 * percentile P IS the sample at cost percentile (100 − P) — the same derivation
 * `MarginDistribution` documents for its own cost fields.
 */
export interface CostQuantiles {
  p50CostCents: number;
  p90CostCents: number;
  /** price − p05MarginCents. */
  p95CostCents: number;
  /** price − minMarginCents: the worst sampled cost. */
  maxCostCents: number;
}

/**
 * Derive the quantiles from an underwriting distribution and the price it ran at.
 * Shaped as a plain-data adapter so the API can feed it `Underwriting` without this
 * module importing the whole simulation surface.
 */
export function costQuantilesFrom(input: {
  priceCents: number;
  p50CostCents: number;
  p90CostCents: number;
  p05MarginCents: number;
  minMarginCents: number;
}): CostQuantiles {
  return {
    p50CostCents: input.p50CostCents,
    p90CostCents: input.p90CostCents,
    p95CostCents: input.priceCents - input.p05MarginCents,
    maxCostCents: input.priceCents - input.minMarginCents,
  };
}

export interface PriceProposalBasis {
  policy: PricingPolicyValues;
  quantiles: CostQuantiles;
  /** ceil(p50Cost / (1 − targetMarginPct)). */
  marginFloorCents: number;
  /** The cost order statistic the ceiling was evidenced at. */
  lossFloorCents: number;
  /** Which grid point evidenced the ceiling: 50, 90, 95, or 100 (sampled max). */
  lossQuantilePctUsed: 50 | 90 | 95 | 100;
  /** Named when the ceiling fell between grid points and was snapped stricter. */
  conservativeSnap: string | null;
  /** Which floor set the price. 'both' when they land on the same cent. */
  bindingFloor: 'margin' | 'loss' | 'both';
  method: string;
}

export type PriceProposalOutcome =
  | { ok: true; proposedPriceCents: number; basis: PriceProposalBasis }
  | { ok: false; defects: string[] };

export const PRICE_PROPOSAL_METHOD =
  'proposedPrice = max( ceil(p50Cost / (1 − targetMarginPct)), costQuantile(1 − pLossCeiling) ), integer cents, over the same seeded Monte Carlo samples the forward underwriting reports. Ceilings between the observed grid points (p50/p90/p95/max) are evidenced at the next stricter point — the snap can only raise the floor. The proposal is verified by re-underwriting at the proposed price; the forward run travels with it.';

/** The observed grid, strictest last. A ceiling is evidenced at the first entry that covers it. */
function lossGridPoint(ceiling: number, q: CostQuantiles): {
  cents: number; pct: 50 | 90 | 95 | 100; snap: string | null;
} {
  if (ceiling >= 0.5) {
    return {
      cents: q.p50CostCents, pct: 50,
      snap: ceiling === 0.5 ? null : `ceiling ${ceiling} evidenced at the 0.50 grid point (p50 cost) — the next stricter observed statistic.`,
    };
  }
  if (ceiling >= 0.1) {
    return {
      cents: q.p90CostCents, pct: 90,
      snap: ceiling === 0.1 ? null : `ceiling ${ceiling} evidenced at the 0.10 grid point (p90 cost) — the next stricter observed statistic.`,
    };
  }
  if (ceiling >= 0.05) {
    return {
      cents: q.p95CostCents, pct: 95,
      snap: ceiling === 0.05 ? null : `ceiling ${ceiling} evidenced at the 0.05 grid point (p95 cost) — the next stricter observed statistic.`,
    };
  }
  return {
    cents: q.maxCostCents, pct: 100,
    snap: `ceiling ${ceiling} is below the smallest observed grid point (0.05), so the price covers the WORST sampled cost — zero sampled losses. A tighter evidenced bound needs more samples, not more arithmetic.`,
  };
}

export function proposePriceCents(quantiles: CostQuantiles, policy: PricingPolicyValues): PriceProposalOutcome {
  const defects = pricingPolicyDefects(policy);
  const qs = [quantiles.p50CostCents, quantiles.p90CostCents, quantiles.p95CostCents, quantiles.maxCostCents];
  if (qs.some((v) => !Number.isInteger(v) || v < 0)) {
    defects.push('cost quantiles must be non-negative integer cents — a fractional or negative cost is not an observed sample.');
  } else if (!(quantiles.p50CostCents <= quantiles.p90CostCents
      && quantiles.p90CostCents <= quantiles.p95CostCents
      && quantiles.p95CostCents <= quantiles.maxCostCents)) {
    defects.push('cost quantiles must be monotone (p50 ≤ p90 ≤ p95 ≤ max) — crossed order statistics mean the distribution they came from is not one distribution.');
  }
  if (defects.length > 0) return { ok: false, defects };

  const marginFloorCents = Math.ceil(quantiles.p50CostCents / (1 - policy.targetMarginPct));
  const grid = lossGridPoint(policy.pLossCeiling, quantiles);
  const proposedPriceCents = Math.max(marginFloorCents, grid.cents);
  const bindingFloor: PriceProposalBasis['bindingFloor'] =
    marginFloorCents === grid.cents ? 'both' : marginFloorCents > grid.cents ? 'margin' : 'loss';

  return {
    ok: true,
    proposedPriceCents,
    basis: {
      policy,
      quantiles,
      marginFloorCents,
      lossFloorCents: grid.cents,
      lossQuantilePctUsed: grid.pct,
      conservativeSnap: grid.snap,
      bindingFloor,
      method: PRICE_PROPOSAL_METHOD,
    },
  };
}
