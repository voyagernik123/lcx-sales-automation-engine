/**
 * GPS UNDERWRITING — tests for the crown-jewel phase.
 *
 * This module produces a NUMBER SOMEBODY WILL PRICE WORK FROM, so the tests are
 * heavier on arithmetic than the rest of GPS: analytic percentiles from the
 * triangular quantile function rather than snapshots, exact monotonicity rather
 * than a tolerance, and an integer-cents sweep over every money field.
 *
 * Every group also asserts ABSENCE — no float cent, no point estimate on the
 * distribution, `pLoss` null rather than 0 on a refusal, no perimeter exclusion
 * leaking into the devil's advocate. The bugs this phase can ship are all of that
 * shape: a plausible number where there should be a refusal.
 */

import { describe, expect, it } from 'vitest';
import { OFFER_KEYS, marginCents, marginPct, type OfferKey } from './types.js';
import { getOffer } from './catalogue.js';
import type { RateCard, RateUnit, RecordedOutcome } from './partners.js';
import {
  BASIS_LABEL,
  DEFAULT_EFFORT_UPLIFTS,
  DEFAULT_ISSUE_POLICY,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  MIN_OUTCOMES_FOR_MEASURED,
  PERCENTILE_METHOD,
  buildUnderwriteResponse,
  devilsAdvocate,
  effortFromRequest,
  effortToDuration,
  isRefusal,
  isZeroVarianceEffort,
  orderStatisticIndex,
  outcomeBlend,
  overrunSensitivity,
  placeholderEffortTriple,
  placeholderEffortTriples,
  resolveBasis,
  shouldBlockIssue,
  underwrite,
  type CostModel,
  type EffortTriple,
  type UnderwriteOptions,
  type UnderwriteQuote,
  type Underwriting,
} from './underwrite.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const ASOF = '2026-08-01T00:00:00.000Z';
const OPTS: UnderwriteOptions = { asOf: ASOF, samples: 20_000, seed: 7 };

const triple = (
  o: number,
  l: number,
  p: number,
  extra: Partial<EffortTriple> = {},
): EffortTriple => ({
  offerKey: 'mica_whitepaper',
  optimisticDays: o,
  likelyDays: l,
  pessimisticDays: p,
  statedBy: 'nik',
  statedAt: '2026-07-01T00:00:00.000Z',
  isPlaceholder: false,
  ...extra,
});

const card = (unit: RateUnit, amountCents: number, extra: Partial<RateCard> = {}): RateCard => ({
  offerKey: 'mica_whitepaper',
  unit,
  amountCents,
  expectedUnits: unit === 'fixed' ? null : 10,
  currency: 'USD',
  validUntil: '2027-01-01T00:00:00.000Z',
  statedBy: 'nik',
  statedAt: '2026-07-01T00:00:00.000Z',
  ...extra,
});

const model = (extra: Partial<CostModel> = {}): CostModel => ({
  offerKey: 'mica_whitepaper',
  partnerId: 'p1',
  partnerLabel: 'Specialist A',
  card: card('day_rate', 100_000), // $1,000/day
  effort: triple(4, 6, 8),
  hoursPerDay: null,
  fixedCostCents: 0,
  ...extra,
});

const quote = (extra: Partial<UnderwriteQuote> = {}): UnderwriteQuote => ({
  offerKey: 'mica_whitepaper',
  priceCents: 1_500_000, // $15,000
  currency: 'USD',
  ...extra,
});

const outcome = (id: string, extra: Partial<RecordedOutcome> = {}): RecordedOutcome => ({
  engagementId: id,
  partnerId: 'p1',
  offerKey: 'mica_whitepaper',
  quotedPriceCents: 1_500_000,
  quotedVendorCostCents: 600_000,
  finalPriceCents: null,
  actualVendorCostCents: 600_000,
  dueAt: null,
  deliveredAt: null,
  reworkRounds: null,
  acceptedFirstPass: null,
  ...extra,
});

/** Every money field the wire exposes, so the integer sweep cannot miss one. */
const moneyFields = (u: Underwriting): Array<[string, number]> => {
  const d = u.distribution;
  if (!d) return [['priceCents', u.priceCents]];
  return [
    ['priceCents', u.priceCents],
    ['p05', d.p05MarginCents], ['p10', d.p10MarginCents], ['p50', d.p50MarginCents],
    ['p90', d.p90MarginCents], ['p95', d.p95MarginCents],
    ['mean', d.meanMarginCents], ['min', d.minMarginCents], ['max', d.maxMarginCents],
    ['spread', d.spreadCents],
    ['p10Cost', d.p10CostCents], ['p50Cost', d.p50CostCents], ['p90Cost', d.p90CostCents],
  ];
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* EFFORT TRIPLES                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('effort triples', () => {
  it('ships a badged placeholder for every offer, and says so per-row', () => {
    expect(EFFORT_TRIPLES_ARE_PLACEHOLDERS).toBe(true);
    const all = placeholderEffortTriples();
    expect(all.map((t) => t.offerKey)).toEqual([...OFFER_KEYS]);
    for (const t of all) {
      expect(t.isPlaceholder).toBe(true);
      // A placeholder must never look freshly confirmed: the epoch, not today.
      expect(t.statedAt).toBe('1970-01-01T00:00:00.000Z');
      expect(t.statedBy).toBe('system:placeholder');
      expect(t.optimisticDays).toBeLessThanOrEqual(t.likelyDays);
      expect(t.likelyDays).toBeLessThanOrEqual(t.pessimisticDays);
      // Deliberately wide (see the TODO block): a narrow placeholder manufactures
      // a confident-looking band out of nothing.
      expect(t.pessimisticDays).toBeGreaterThan(t.likelyDays);
    }
  });

  it('clamps through resolveDuration rather than re-implementing the rules', () => {
    expect(effortToDuration(triple(-5, 6, 8))).toEqual({ min: 0, mode: 6, max: 8 });
    // Inverted input is repaired upward, never silently reordered downward.
    expect(effortToDuration(triple(10, 2, 4))).toEqual({ min: 10, mode: 10, max: 10 });
    expect(effortToDuration(triple(2, 6, 1))).toEqual({ min: 2, mode: 6, max: 6 });
  });

  /*
   * UNPINNED 2026-08-04, deliberately, and the old expectation was a defect.
   *
   * This assertion used to read `effortToDuration(triple(NaN, 6, 8))` ->
   * `{ min: 0, ... }`, and it passed because `resolveDuration` coerced a non-finite
   * override to 0. That is the laundering the launch-sim lane removed: NaN means
   * "nobody supplied a number", and 0 means "this work takes no time". For GPS the
   * consequence was not cosmetic — `min` feeds the optimistic leg of the cost
   * Monte Carlo, so an unreadable effort input produced a p10 cost approaching
   * zero, i.e. a free engagement, and the margin band widened downward off a value
   * nobody entered.
   *
   * `resolveDuration` now IGNORES an unusable override and lets the declared
   * default for the task's status stand, emitting a warning per dropped component
   * (launchSim.ts:289-299, overrideWarnings at :302). So the replacement figure is
   * GPS's own default rather than an invented one, and the drop is never silent.
   *
   * This test is in the GPS compartment and the change came from `launchSim.ts`,
   * which is exactly why it is worth keeping: it is the cross-compartment tripwire
   * that caught a shared clamp changing meaning under a compartment that delegates
   * to it. Do not re-pin it to 0.
   */
  it('lets the status default stand when an effort component is unreadable, never 0', () => {
    const resolved = effortToDuration(triple(Number.NaN, 6, 8));
    expect(resolved.min).toBeGreaterThan(0);
    expect(resolved).toEqual({ min: 5, mode: 6, max: 8 });
    // The whole point: an unreadable optimistic effort must not imply free work.
    expect(resolved.min).not.toBe(0);
  });

  it('detects the zero-variance collapse', () => {
    expect(isZeroVarianceEffort(triple(5, 5, 5))).toBe(true);
    expect(isZeroVarianceEffort(triple(4, 6, 8))).toBe(false);
    // Collapsed by clamping, not by equal inputs.
    expect(isZeroVarianceEffort(triple(9, 2, 3))).toBe(true);
  });

  it('placeholderEffortTriple stamps the offer it was asked for', () => {
    for (const k of OFFER_KEYS) expect(placeholderEffortTriple(k).offerKey).toBe(k);
  });

  it('effortFromRequest owns the placeholder flag so a mapper cannot lie about it', () => {
    const absent = effortFromRequest('gtm_sprint', null);
    expect(absent.isPlaceholder).toBe(true);
    expect(absent).toEqual(placeholderEffortTriple('gtm_sprint'));
    expect(effortFromRequest('gtm_sprint', undefined).isPlaceholder).toBe(true);

    const supplied = effortFromRequest('gtm_sprint', {
      optimisticDays: 5, likelyDays: 9, pessimisticDays: 14,
      statedBy: 'nik', statedAt: '2026-08-01T09:00:00.000Z',
    });
    expect(supplied.isPlaceholder).toBe(false);
    expect(supplied.offerKey).toBe('gtm_sprint');
    expect(supplied.likelyDays).toBe(9);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE PERCENTILE METHOD                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('orderStatisticIndex — nearest rank, hand-computed', () => {
  it('matches ceil(p/100 × n) − 1 exactly', () => {
    expect(orderStatisticIndex(10, 10)).toBe(0); // ceil(1) − 1
    expect(orderStatisticIndex(10, 50)).toBe(4); // ceil(5) − 1
    expect(orderStatisticIndex(10, 90)).toBe(8); // ceil(9) − 1
    expect(orderStatisticIndex(100, 5)).toBe(4);
    expect(orderStatisticIndex(100, 95)).toBe(94);
    expect(orderStatisticIndex(7, 50)).toBe(3); // ceil(3.5) − 1
  });

  it('is defined at n = 1 — the single-sample case cannot divide by zero', () => {
    for (const p of [5, 10, 50, 90, 95]) expect(orderStatisticIndex(1, p)).toBe(0);
  });

  it('never leaves the array, including on degenerate n', () => {
    expect(orderStatisticIndex(0, 50)).toBe(0);
    expect(orderStatisticIndex(-3, 50)).toBe(0);
    expect(orderStatisticIndex(5, 100)).toBe(4);
    expect(orderStatisticIndex(5, 0)).toBe(0);
    expect(orderStatisticIndex(Number.NaN, 50)).toBe(0);
  });

  it('is monotone in p, so no percentile can cross another', () => {
    let prev = -1;
    for (const p of [5, 10, 25, 50, 75, 90, 95, 100]) {
      const idx = orderStatisticIndex(37, p);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE DISTRIBUTION, AGAINST THE ANALYTIC TRIANGULAR QUANTILE                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The strongest test in this file. The inputs are chosen so the answer is
 * computable BY HAND from the triangular CDF, with no reference to the sampler:
 *
 *   effort ~ triangular(4, 6, 8) days, symmetric, so F(x) = (x−4)²/8 on [4, 6].
 *   rate = $1,000/day = 100_000c, price = $15,000 = 1_500_000c, no outcomes.
 *
 *   F(x) = 0.10 → x = 4 + √0.8  = 4.894427 days → cost   489_443c
 *   F(x) = 0.50 → x = 6                          → cost   600_000c
 *   F(x) = 0.90 → x = 8 − √0.8  = 7.105573 days → cost   710_557c
 *   mean = (4+6+8)/3 = 6 days                    → cost   600_000c
 *
 * and margin is price − cost, so the MARGIN p10 is the COST p90:
 *   p10 margin = 1_500_000 − 710_557 =   789_443c
 *   p50 margin =                         900_000c   (60% of price)
 *   p90 margin = 1_500_000 − 489_443 = 1_010_557c
 */
describe('margin distribution vs the analytic triangular quantile', () => {
  const u = underwrite(quote(), model(), OPTS);
  const d = u.distribution!;
  const near = (actual: number, expected: number, relTol = 0.01): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol);
  };

  it('underwrites and reports its own method', () => {
    expect(u.verdict).toBe('underwritten');
    expect(isRefusal(u.verdict)).toBe(false);
    expect(d.method).toBe(PERCENTILE_METHOD);
    expect(u.sampleCount).toBe(20_000);
    expect(u.seed).toBe(7);
  });

  it('hits the hand-computed percentiles within 1%', () => {
    near(d.p10MarginCents, 789_443);
    near(d.p50MarginCents, 900_000);
    near(d.p90MarginCents, 1_010_557);
    near(d.p05MarginCents, 763_246);
    near(d.p95MarginCents, 1_036_754);
    near(d.meanMarginCents, 900_000, 0.005);
    near(d.spreadCents, 221_114, 0.03);
    expect(d.p50MarginPct).toBe(60);
  });

  it('reports cost percentiles that are exactly the mirror of the margin ones', () => {
    // Derived, not separately sorted — the identity must hold to the cent.
    expect(d.p90CostCents).toBe(u.priceCents - d.p10MarginCents);
    expect(d.p50CostCents).toBe(u.priceCents - d.p50MarginCents);
    expect(d.p10CostCents).toBe(u.priceCents - d.p90MarginCents);
  });

  it('keeps every sample inside the triangular support', () => {
    // The distribution cannot produce a cost below 4 days or above 8 days of rate.
    expect(d.minMarginCents).toBeGreaterThanOrEqual(1_500_000 - 800_000);
    expect(d.maxMarginCents).toBeLessThanOrEqual(1_500_000 - 400_000);
  });

  it('orders the percentiles and never loses money at this price', () => {
    expect(d.p05MarginCents).toBeLessThanOrEqual(d.p10MarginCents);
    expect(d.p10MarginCents).toBeLessThanOrEqual(d.p50MarginCents);
    expect(d.p50MarginCents).toBeLessThanOrEqual(d.p90MarginCents);
    expect(d.p90MarginCents).toBeLessThanOrEqual(d.p95MarginCents);
    expect(u.pLoss).toBe(0);
    expect(u.lossSampleCount).toBe(0);
    expect(u.pLossLikelihood?.term).toBe('almost no chance');
  });

  it('names the variance driver with a contribution and a stated mechanism', () => {
    expect(u.varianceDriver?.input).toBe('effort');
    expect(u.varianceDriver?.contribution).toBeGreaterThan(0.9);
    expect(u.varianceDriver?.method).toContain('pinning');
    // Only effort varies here, and the note must say so rather than implying evidence.
    expect(u.varianceDriver?.note).toContain('Only one input varies');
  });

  it('publishes no point estimate of margin (D3)', () => {
    // A bare `marginCents` would immediately become the field every surface renders.
    expect('marginCents' in d).toBe(false);
    expect('marginCents' in u).toBe(false);
    expect(Object.keys(d).filter((k) => /^margin/i.test(k))).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE LOSS-MAKING QUOTE — the number that changes behaviour                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * $10,000 price against a $12,000 likely cost — effort ~ triangular(8, 12, 20)
 * days at $1,000/day. Analytically:
 *
 *   loss ⟺ cost > price ⟺ days > 10, and F(10) = (10−8)²/((20−8)(12−8)) = 4/48
 *   so P(loss) = 1 − 0.0833 = 0.9167
 *   median days = 20 − √(0.5 × 12 × 8) = 13.0718 → cost 1_307_180c
 *   median margin = 1_000_000 − 1_307_180 = −307_180c   ← NEGATIVE, not absolute
 */
describe('a deliberately loss-making quote', () => {
  const q = quote({ priceCents: 1_000_000, quotedVendorCostCents: 600_000 });
  const m = model({ effort: triple(8, 12, 20) });
  const u = underwrite(q, m, OPTS);
  const d = u.distribution!;

  it('reports a HIGH probability of loss, matching the analytic 91.7%', () => {
    expect(u.pLoss).toBeGreaterThan(0.88);
    expect(u.pLoss).toBeLessThan(0.95);
    expect(u.pLossLikelihood?.term).toBe('very likely');
    expect(u.lossSampleCount).toBeGreaterThan(17_000);
    // The fraction must be reconstructible by hand from the raw count.
    expect(u.lossSampleCount! / u.sampleCount).toBeCloseTo(u.pLoss!, 3);
  });

  it('produces a correct NEGATIVE margin, not an absolute value', () => {
    expect(d.p50MarginCents).toBeLessThan(0);
    expect(Math.abs(d.p50MarginCents - -307_180)).toBeLessThan(4_000);
    expect(d.p50MarginPct).toBe(-31);
    expect(d.p10MarginCents).toBeLessThan(d.p50MarginCents);
    expect(d.minMarginCents).toBeLessThan(0);
    // Cost above price is a real loss on the cost side too.
    expect(d.p50CostCents).toBeGreaterThan(u.priceCents);
  });

  it('says out loud that the price loses money, in reasons (D4)', () => {
    const joined = u.reasons.join(' | ');
    expect(joined).toMatch(/LOSES MONEY in \d+ of 20000 simulated outcomes/);
    expect(joined).toContain('very likely');
  });

  it('argues with the quoted vendor cost when the model disagrees with it', () => {
    // The quote books $6,000; the model's median is ~$13,000.
    expect(u.reasons.join(' | ')).toMatch(/books a vendor cost of 600000c/);
  });

  it('BLOCKS the issue rather than warning about it', () => {
    const decision = shouldBlockIssue(u);
    expect(decision.blocked).toBe(true);
    expect(decision.code).toBe('p_loss_above_threshold');
    // Both the threshold and the observation must be quotable by the UI and the
    // action registry from the same object.
    const failed = decision.failed[0]!;
    expect(failed.threshold).toBe(0.2);
    expect(failed.observed).toBe(u.pLoss);
    expect(decision.reason).toContain('BLOCKED');
    expect(decision.reason).toContain('20%');
    expect(decision.policy).toEqual(DEFAULT_ISSUE_POLICY);
  });

  /**
   * WIDENING THE APPETITE NO LONGER PERMITS A MEDIAN LOSS, and this test used to assert
   * that it did.
   *
   * `maxPLoss: 0.99` clears the P(loss) ceiling, and before `p50_margin_is_a_loss`
   * existed that was the whole gate: this quote — p50 margin −308,151c, i.e. the MEDIAN
   * outcome is a $3,081 loss — came back `blocked: false, code: 'ok'`. A risk appetite is
   * a statement about the tail. "Half of the simulated outcomes lose money" is not a tail
   * and no appetite makes it a price worth issuing, which is why the cents check is
   * unconditional and outranks the percentage floor.
   *
   * The appetite still does its job: the P(loss) check itself PASSES, and that is
   * asserted, so this is not the ceiling quietly becoming un-widenable.
   */
  it('still blocks a MEDIAN LOSS even when the P(loss) appetite is widened to 0.99', () => {
    const decision = shouldBlockIssue(u, { ...DEFAULT_ISSUE_POLICY, maxPLoss: 0.99, statedBy: 'nik' });
    expect(decision.blocked).toBe(true);
    expect(decision.code).toBe('p50_margin_is_a_loss');
    // The widened appetite was honoured — the ceiling is not un-widenable.
    expect(decision.passed.some((c) => c.code === 'p_loss_above_threshold')).toBe(true);
    const failed = decision.failed.find((c) => c.code === 'p50_margin_is_a_loss')!;
    expect(failed.unit).toBe('cents');
    expect(failed.observed).toBe(u.distribution!.p50MarginCents);
    expect(failed.threshold).toBe(0);
    expect(decision.reason).toMatch(/MEDIAN simulated outcome/);
    expect(decision.reason).toMatch(/Not a policy threshold/);
  });

  it('permits a quote whose median is positive once the appetite is widened', () => {
    // The counterpart, or the new check would read as "nothing can ever be widened".
    const healthy = underwrite(quote({ priceCents: 3_000_000 }), model(), OPTS);
    expect(healthy.distribution!.p50MarginCents).toBeGreaterThan(0);
    const decision = shouldBlockIssue(healthy, { ...DEFAULT_ISSUE_POLICY, maxPLoss: 0.99, statedBy: 'nik' });
    expect(decision.blocked).toBe(false);
    expect(decision.code).toBe('ok');
    // Permitted is not endorsed, and the reason has to say so.
    expect(decision.reason).toContain('not endorsed');
    expect(decision.passed.some((c) => c.code === 'p50_margin_is_a_loss')).toBe(true);
  });

  it('the median-loss check needs no policy floor set — it is unconditional', () => {
    // `minP50MarginPct` is null by default, so the percentage check is SKIPPED entirely.
    // That is what left a median loss unblocked once the ceiling was raised.
    expect(DEFAULT_ISSUE_POLICY.minP50MarginPct).toBeNull();
    const decision = shouldBlockIssue(u, { ...DEFAULT_ISSUE_POLICY, maxPLoss: 1, minP50MarginPct: null, statedBy: 'nik' });
    expect(decision.failed.some((c) => c.code === 'p50_margin_is_a_loss')).toBe(true);
    expect(decision.failed.some((c) => c.code === 'p50_margin_below_floor')).toBe(false);
  });
});

/**
 * `marginPct` RETURNED `-0`, AND JSON SERIALISED IT AS `0`.
 *
 * A $10 loss on a $250,000 price rounds to `-0`. `JSON.stringify(-0)` is `"0"` and
 * `(-0 < 0) === false`, so the margin-floor check put `p50_margin_below_floor` in
 * `passed` with `observed: 0` — an audit record stating a loss as "0%" and as cleared.
 */
describe('a rounded-to-nothing loss cannot present as zero margin', () => {
  it('never returns negative zero', () => {
    const pct = marginPct(25_000_000, 25_001_000); // a $10 loss
    expect(pct).toBe(0);
    expect(Object.is(pct, -0)).toBe(false);
    // The direction is recoverable from the exact figure, which is cents.
    expect(marginCents(25_000_000, 25_001_000)).toBe(-1_000);
  });

  it('is unchanged for every case that was already right', () => {
    expect(marginPct(1_800_000, 600_000)).toBe(67);
    expect(marginPct(2_500_000, 3_000_000)).toBe(-20);
    expect(marginPct(1_000_000, 1_000_000)).toBe(0);
    expect(marginPct(0, 100)).toBeNull();
    expect(marginPct(-1, 100)).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* DETERMINISM — the screen must not shimmer                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('determinism', () => {
  it('same inputs + same seed → deeply identical output, variance trail included', () => {
    const a = underwrite(quote(), model(), OPTS);
    const b = underwrite(quote(), model(), OPTS);
    expect(a).toEqual(b);
    expect(a.varianceDriver).toEqual(b.varianceDriver);
    expect(a.drivers).toEqual(b.drivers);
  });

  it('same inputs + same seed → identical sensitivity table', () => {
    expect(overrunSensitivity(quote(), model(), OPTS)).toEqual(overrunSensitivity(quote(), model(), OPTS));
  });

  it('a different seed moves the numbers — the seed is really the only randomness', () => {
    const a = underwrite(quote(), model(), { ...OPTS, seed: 1, samples: 500 });
    const b = underwrite(quote(), model(), { ...OPTS, seed: 2, samples: 500 });
    expect(a.distribution!.p50MarginCents).not.toBe(b.distribution!.p50MarginCents);
    expect(a.seed).toBe(1);
    expect(b.seed).toBe(2);
  });

  it('defaults the seed and sample count rather than reading a clock', () => {
    const u = underwrite(quote(), model(), { asOf: ASOF });
    expect(u.seed).toBe(42);
    expect(u.sampleCount).toBe(4_000);
    expect(u.asOf).toBe(ASOF);
  });

  it('clamps the sample count into [1, 20000]', () => {
    expect(underwrite(quote(), model(), { asOf: ASOF, samples: 0 }).sampleCount).toBe(1);
    expect(underwrite(quote(), model(), { asOf: ASOF, samples: -5 }).sampleCount).toBe(1);
    expect(underwrite(quote(), model(), { asOf: ASOF, samples: 1e9 }).sampleCount).toBe(20_000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* DEGENERATE CASES — collapse, single sample, zero price                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('zero-variance collapse', () => {
  it('a point effort triple gives one margin at every percentile', () => {
    // 5 days × $1,000 = $5,000 cost against a $15,000 price, exactly, always.
    const u = underwrite(quote(), model({ effort: triple(5, 5, 5) }), OPTS);
    const d = u.distribution!;
    expect(d.p05MarginCents).toBe(1_000_000);
    expect(d.p10MarginCents).toBe(1_000_000);
    expect(d.p50MarginCents).toBe(1_000_000);
    expect(d.p90MarginCents).toBe(1_000_000);
    expect(d.p95MarginCents).toBe(1_000_000);
    expect(d.meanMarginCents).toBe(1_000_000);
    expect(d.spreadCents).toBe(0);
    expect(u.pLoss).toBe(0);
  });

  it('refuses to name a variance driver when nothing varies', () => {
    const u = underwrite(quote(), model({ effort: triple(5, 5, 5) }), OPTS);
    expect(u.varianceDriver?.input).toBeNull();
    expect(u.varianceDriver?.contribution).toBe(0);
    expect(u.varianceDriver?.all).toEqual([]);
    expect(u.varianceDriver?.note).toContain('spread is zero');
  });

  it('a fixed-fee card removes the spread AND says whose risk that is', () => {
    const u = underwrite(quote(), model({ card: card('fixed', 700_000), effort: triple(4, 6, 8) }), OPTS);
    const d = u.distribution!;
    expect(d.p10MarginCents).toBe(800_000);
    expect(d.p90MarginCents).toBe(800_000);
    expect(d.spreadCents).toBe(0);
    expect(u.varianceDriver?.input).toBeNull();
    // A wide effort triple must not be credited with variance it cannot cause.
    expect(u.reasons.join(' | ')).toContain('overrun risk sits with');
  });

  it('a single sample is defined everywhere and produces no NaN', () => {
    const u = underwrite(quote(), model(), { asOf: ASOF, samples: 1, seed: 3 });
    const d = u.distribution!;
    expect(u.sampleCount).toBe(1);
    for (const [name, v] of moneyFields(u)) {
      expect(Number.isFinite(v), name).toBe(true);
      expect(Number.isNaN(v), name).toBe(false);
    }
    expect(d.p05MarginCents).toBe(d.p95MarginCents);
    expect(d.spreadCents).toBe(0);
    expect(d.meanMarginCents).toBe(d.p50MarginCents);
    expect(u.pLoss === 0 || u.pLoss === 1).toBe(true);
    expect(u.reasons.join(' | ')).toContain('percentiles are coarse');
  });

  it('a zero-price quote is underwritten as a total loss, with a null percentage', () => {
    const u = underwrite(quote({ priceCents: 0 }), model(), OPTS);
    const d = u.distribution!;
    expect(u.verdict).toBe('underwritten');
    expect(d.p50MarginCents).toBeLessThan(0);
    expect(d.p50MarginCents).toBe(-d.p50CostCents);
    // Null, not −100: there is no price to be a percentage of (`types.ts:282`).
    expect(d.p50MarginPct).toBeNull();
    expect(d.p10MarginPct).toBeNull();
    expect(u.pLoss).toBe(1);
    expect(u.reasons.join(' | ')).toContain('Price is zero');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* OVERRUN SENSITIVITY                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('overrunSensitivity', () => {
  const s = overrunSensitivity(quote(), model(), OPTS);

  it('opens on the baseline, byte-identical to the underwriting itself', () => {
    const u = underwrite(quote(), model(), OPTS);
    expect(s.points[0]!.effortUpliftPct).toBe(0);
    expect(s.points[0]!.p50MarginCents).toBe(u.distribution!.p50MarginCents);
    expect(s.points[0]!.p10MarginCents).toBe(u.distribution!.p10MarginCents);
    expect(s.points[0]!.pLoss).toBe(u.pLoss);
    expect(s.points[0]!.deltaP50Cents).toBe(0);
  });

  it('tests +10/+25/+50 by default', () => {
    expect(s.points.map((p) => p.effortUpliftPct)).toEqual([0, ...DEFAULT_EFFORT_UPLIFTS]);
  });

  it('is monotone by construction — margin down, P(loss) up, no exceptions', () => {
    expect(s.monotone).toBe(true);
    for (let i = 1; i < s.points.length; i++) {
      const prev = s.points[i - 1]!;
      const cur = s.points[i]!;
      expect(cur.p50MarginCents).toBeLessThanOrEqual(prev.p50MarginCents);
      expect(cur.p10MarginCents).toBeLessThanOrEqual(prev.p10MarginCents);
      expect(cur.p90MarginCents).toBeLessThanOrEqual(prev.p90MarginCents);
      expect(cur.pLoss).toBeGreaterThanOrEqual(prev.pLoss);
      expect(cur.deltaP50Cents).toBeLessThanOrEqual(0);
      expect(cur.deltaPLoss).toBeGreaterThanOrEqual(0);
    }
  });

  it('scales the median cost by the uplift, to the cent-ish', () => {
    // Baseline median cost ≈ 6 days × $1,000 = $6,000; +50% ≈ 9 days = $9,000.
    const base = quote().priceCents - s.points[0]!.p50MarginCents;
    const up50 = quote().priceCents - s.points[3]!.p50MarginCents;
    expect(up50 / base).toBeCloseTo(1.5, 2);
  });

  it('normalises a messy uplift ladder instead of trusting the caller', () => {
    const messy = overrunSensitivity(quote(), model(), { ...OPTS, samples: 500 }, [50, 10, 10, -5, Number.NaN, 25]);
    expect(messy.points.map((p) => p.effortUpliftPct)).toEqual([0, 10, 25, 50]);
  });

  it('reports no breakeven when the margin survives every tested overrun', () => {
    expect(s.breakevenUpliftPct).toBeNull();
    expect(s.reasons.join(' | ')).toContain('Even at +50% effort');
  });

  it('reports 0% when the median is already underwater before any overrun', () => {
    const bad = overrunSensitivity(quote({ priceCents: 1_000_000 }), model({ effort: triple(8, 12, 20) }), OPTS);
    expect(bad.breakevenUpliftPct).toBe(0);
    expect(bad.reasons.join(' | ')).toContain('already underwater');
  });

  it('finds the first tested overrun that sinks a thin quote', () => {
    // $7,000 price against ~$6,000 median cost: +25% effort (~$7,500) sinks it.
    const thin = overrunSensitivity(quote({ priceCents: 700_000 }), model(), OPTS);
    expect(thin.breakevenUpliftPct).toBe(25);
    expect(thin.reasons.join(' | ')).toContain('MEDIAN margin underwater');
  });

  it('produces identical rows for a fixed-fee card, and names the reason', () => {
    const fixed = overrunSensitivity(quote(), model({ card: card('fixed', 700_000) }), OPTS);
    const p50s = fixed.points.map((p) => p.p50MarginCents);
    expect(new Set(p50s).size).toBe(1);
    expect(fixed.monotone).toBe(true);
    expect(fixed.reasons.join(' | ')).toContain('does not change our cost at all');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* BASIS — prior → blended → measured, as arithmetic                           */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('outcomeBlend and the basis transition', () => {
  const ratioOutcomes = (n: number, ratio: number): RecordedOutcome[] =>
    Array.from({ length: n }, (_, i) =>
      outcome(`e${i}`, { quotedVendorCostCents: 600_000, actualVendorCostCents: Math.round(600_000 * ratio) }),
    );

  it('with no outcomes: prior, weight 0, no median, and it says so', () => {
    const b = outcomeBlend('mica_whitepaper', []);
    expect(b.basis).toBe('prior');
    expect(b.weight).toBe(0);
    expect(b.sampleSize).toBe(0);
    expect(b.medianRatio).toBeNull();
    expect(b.reason).toContain('a prior, not a measurement');
  });

  it('weights recorded outcomes at n/8 and lands on the documented bands', () => {
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(1, 1.2)).weight).toBe(0.125);
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(3, 1.2)).basis).toBe('blended');
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(3, 1.2)).weight).toBe(0.375);
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(MIN_OUTCOMES_FOR_MEASURED, 1.2)).weight).toBe(1);
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(MIN_OUTCOMES_FOR_MEASURED, 1.2)).basis).toBe('measured');
    // The cap holds above the threshold rather than exceeding 1.
    expect(outcomeBlend('mica_whitepaper', ratioOutcomes(40, 1.2)).weight).toBe(1);
  });

  it('names every excluded outcome with its reason, and excludes it from n (D2)', () => {
    const b = outcomeBlend('mica_whitepaper', [
      outcome('has-invoice'),
      outcome('no-invoice', { actualVendorCostCents: null }),
      outcome('zero-quote', { quotedVendorCostCents: 0 }),
      outcome('negative-actual', { actualVendorCostCents: -5 }),
    ]);
    expect(b.sampleSize).toBe(1);
    expect(b.excluded.map((e) => e.engagementId).sort()).toEqual(['negative-actual', 'no-invoice', 'zero-quote']);
    expect(b.excluded.find((e) => e.engagementId === 'no-invoice')!.reason).toContain('not equal to quoted');
    expect(b.excluded.find((e) => e.engagementId === 'zero-quote')!.reason).toContain('undefined');
  });

  it('scopes to the offer so a white paper cannot blend into a diagnostic', () => {
    const b = outcomeBlend('diagnostic', ratioOutcomes(8, 1.5));
    expect(b.sampleSize).toBe(0);
    expect(b.basis).toBe('prior');
    expect(b.excluded).toEqual([]);
  });

  it('reports a prior when outcomes exist but none is usable', () => {
    const b = outcomeBlend('mica_whitepaper', [outcome('x', { actualVendorCostCents: null })]);
    expect(b.basis).toBe('prior');
    expect(b.reason).toContain('none usable');
  });

  it('BLENDING MOVES THE NUMBERS — the label is arithmetic, not decoration (D8)', () => {
    const priorRun = underwrite(quote(), model(), OPTS);
    const measuredRun = underwrite(quote(), model(), { ...OPTS, outcomes: ratioOutcomes(8, 1.5) });
    // Partners invoiced 1.5× the quote, so the median cost must rise by ~50%.
    expect(measuredRun.distribution!.p50CostCents).toBeGreaterThan(priorRun.distribution!.p50CostCents * 1.4);
    expect(measuredRun.distribution!.p50MarginCents).toBeLessThan(priorRun.distribution!.p50MarginCents);
    expect(measuredRun.blend.medianRatio).toBe(1.5);
    expect(measuredRun.basis).toBe('measured');
  });

  it('caps at blended while a placeholder effort triple still drives the cost', () => {
    const u = underwrite(
      quote(),
      model({ effort: placeholderEffortTriple('mica_whitepaper') }),
      { ...OPTS, outcomes: ratioOutcomes(8, 1.5) },
    );
    expect(u.blend.basis).toBe('measured');
    expect(u.basis).toBe('blended');
    expect(u.basisReason).toContain('Capped at blended');
    expect(u.reasons.join(' | ')).toContain('EFFORT TRIPLE IS A PLACEHOLDER');
  });

  it('allows measured with a placeholder triple ONLY when effort cannot move cost', () => {
    const u = underwrite(
      quote(),
      model({ card: card('fixed', 700_000), effort: placeholderEffortTriple('mica_whitepaper') }),
      { ...OPTS, outcomes: ratioOutcomes(8, 1.5) },
    );
    expect(u.basis).toBe('measured');
  });

  it('resolveBasis is the whole rule, and it is testable on its own', () => {
    expect(resolveBasis('prior', true, true)).toBe('prior');
    expect(resolveBasis('blended', true, true)).toBe('blended');
    expect(resolveBasis('measured', true, true)).toBe('blended');
    expect(resolveBasis('measured', false, true)).toBe('measured');
    expect(resolveBasis('measured', true, false)).toBe('measured');
  });

  it('labels a bare prior on the surface, in reasons and in basisReason', () => {
    const u = underwrite(quote(), model(), OPTS);
    expect(u.basis).toBe('prior');
    expect(u.basisReason).toBe(`${BASIS_LABEL.prior}. ${u.blend.reason}`);
    expect(u.reasons.join(' | ')).toContain('BASIS: PRIOR');
  });

  it('attributes variance to the overrun when effort cannot vary', () => {
    const spread = [0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.2, 2.6].map((r, i) =>
      outcome(`e${i}`, { quotedVendorCostCents: 600_000, actualVendorCostCents: Math.round(600_000 * r) }),
    );
    const u = underwrite(quote(), model({ effort: triple(6, 6, 6) }), { ...OPTS, outcomes: spread });
    expect(u.varianceDriver?.input).toBe('outcome_overrun');
    expect(u.varianceDriver?.contribution).toBeGreaterThan(0.9);
    expect(u.varianceDriver?.all).toHaveLength(1);
  });

  it('ranks both inputs when both vary, and drops the single-input caveat', () => {
    const spread = [0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.2, 2.6].map((r, i) =>
      outcome(`e${i}`, { quotedVendorCostCents: 600_000, actualVendorCostCents: Math.round(600_000 * r) }),
    );
    const u = underwrite(quote(), model(), { ...OPTS, outcomes: spread });
    expect(u.varianceDriver?.all).toHaveLength(2);
    const inputs = u.varianceDriver!.all.map((c) => c.input).sort();
    expect(inputs).toEqual(['effort', 'outcome_overrun']);
    for (const c of u.varianceDriver!.all) {
      // Capped ABOVE at 1 — a share over 100% is impossible arithmetic. NOT clamped
      // below at 0: effort and the overrun ratio enter the cost multiplicatively, so
      // pinning one can WIDEN the band, and a negative share is the true measurement.
      // See the clamp note in `attributeVariance`.
      expect(c.contribution).toBeLessThanOrEqual(1);
    }
    // The single-input caveat is dropped when two inputs vary; the note is either null
    // or the not-decomposable refusal, never the "only one input varies" sentence.
    expect(u.varianceDriver?.note ?? '').not.toMatch(/Only one input varies/);
  });

  /**
   * THE CLAMP THAT REPORTED A NEGATIVE CONTRIBUTION AS 0%.
   *
   * `contribution` was `Math.max(0, removed / totalSpread)`. Over 79 seeds with ratios
   * in [0.1, 3.0], 79 of 158 candidate evaluations had `removed < 0` — pinning an input
   * left a WIDER band than the joint model, because the two stochastic inputs multiply.
   * Each of those rendered as "dominated by <label> (0%)", beside a NEGATIVE
   * `spreadExplainedCents` on the same object, which was never clamped.
   */
  it('refuses the attribution rather than reporting a negative share as 0%', () => {
    // A wide, skewed overrun distribution is what makes pinning widen the band.
    const wild = [0.1, 0.2, 0.5, 1.0, 1.6, 2.2, 2.8, 3.0].map((r, i) =>
      outcome(`w${i}`, { quotedVendorCostCents: 600_000, actualVendorCostCents: Math.round(600_000 * r) }),
    );
    const results = Array.from({ length: 40 }, (_, s) =>
      underwrite(quote(), model(), { ...OPTS, seed: 3_000 + s, outcomes: wild }).varianceDriver,
    ).filter((v): v is NonNullable<typeof v> => v != null);
    expect(results.length).toBeGreaterThan(0);

    for (const v of results) {
      if (v.input === null && v.label === 'Not decomposable') {
        // The refusal states the mechanism and does not claim 0% of anything.
        expect(v.note).toMatch(/MULTIPLICATIVELY/);
        expect(v.note).toMatch(/refused rather than reported as 0%/);
        expect(v.contribution).toBeLessThanOrEqual(0);
      }
      // The invariant that used to be violable: `contribution: 0` beside a negative
      // `spreadExplainedCents` can no longer coexist with a NAMED dominant input.
      if (v.input !== null) {
        expect(v.contribution).toBeGreaterThan(0);
        expect(v.spreadExplainedCents).toBeGreaterThan(0);
      }
    }

    // And at least one of the 40 seeds must actually exercise the refusal, or this
    // test is asserting over an empty set.
    const negatives = results.flatMap((v) => v.all).filter((c) => c.contribution < 0);
    expect(negatives.length, 'no seed produced a negative raw share — the fixture no longer reaches the case').toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* REFUSALS (D2) — a stated no, never a silent conversion or a default          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('refusals', () => {
  const cases: Array<[string, UnderwriteQuote, CostModel, string, RegExp]> = [
    [
      'currency mismatch is never converted',
      quote({ currency: 'USD' }),
      model({ card: card('day_rate', 100_000, { currency: 'EUR' }) }),
      'refused_currency_mismatch',
      /No FX conversion happens here/,
    ],
    [
      'an expired rate card cannot produce a band',
      quote(),
      model({ card: card('day_rate', 100_000, { validUntil: '2026-01-01T00:00:00.000Z' }) }),
      'refused_rate_card_expired',
      /expired on 2026-01-01/,
    ],
    [
      'a card with no validity date is not treated as valid forever',
      quote(),
      model({ card: card('day_rate', 100_000, { validUntil: null }) }),
      'refused_rate_card_no_validity_stated',
      /states no validity date/,
    ],
    [
      'an hourly card without hours-per-day is refused, not assumed at 8',
      quote(),
      model({ card: card('hourly', 20_000), hoursPerDay: null }),
      'refused_hours_per_day_not_stated',
      /an assumed 8 is an invented number/,
    ],
    [
      'a zero effort triple would report the work as free',
      quote(),
      model({ effort: triple(0, 0, 0) }),
      'refused_effort_is_zero',
      /would report the work as free/,
    ],
    [
      'a negative rate is not a rate',
      quote(),
      model({ card: card('day_rate', -100) }),
      'refused_rate_not_derivable',
      /not a usable rate/,
    ],
    [
      'a fixed-fee card that will not price refuses rather than guessing',
      quote(),
      model({ card: card('fixed', -1) }),
      'refused_rate_not_derivable',
      /does not price/,
    ],
    // Zero is the dangerous one: a negative amount was already refused, but 0
    // multiplied out to a zero cost basis and underwrote as 100% margin, pLoss 0,
    // nothing blocked — "this offer is pure profit" off an unfilled form.
    [
      'a ZERO fixed fee is an unfilled form, not a free partner',
      quote(),
      model({ card: card('fixed', 0) }),
      'refused_rate_not_derivable',
      /not a partner working for free/,
    ],
    [
      'a ZERO day rate is refused on the same footing as a negative one',
      quote(),
      model({ card: card('day_rate', 0) }),
      'refused_rate_not_derivable',
      /Zero is refused on the same footing as negative/,
    ],
    [
      'a ZERO hourly rate cannot bridge into a free cost basis',
      quote(),
      model({ card: card('hourly', 0), hoursPerDay: 8 }),
      'refused_rate_not_derivable',
      /not a usable rate/,
    ],
    [
      'a negative price is corrupt data, not a discount',
      quote({ priceCents: -500 }),
      model(),
      'refused_price_not_set',
      /corrupt data, not a discount/,
    ],
    [
      'a non-numeric price cannot be underwritten',
      quote({ priceCents: Number.NaN }),
      model(),
      'refused_price_not_set',
      /cannot be underwritten/,
    ],
  ];

  for (const [name, q, m, verdict, reasonPattern] of cases) {
    it(name, () => {
      const u = underwrite(q, m, OPTS);
      expect(u.verdict).toBe(verdict);
      expect(isRefusal(u.verdict)).toBe(true);
      // Nothing is produced. `null`, never 0: "no loss risk" and "loss risk not
      // computable" are opposite statements.
      expect(u.distribution).toBeNull();
      expect(u.pLoss).toBeNull();
      expect(u.pLossLikelihood).toBeNull();
      expect(u.lossSampleCount).toBeNull();
      expect(u.varianceDriver).toBeNull();
      // The reason reaches the caller, and the seed is still reproducible.
      expect(u.reasons.length).toBeGreaterThan(0);
      expect(u.reasons.join(' | ')).toMatch(reasonPattern);
      expect(u.seed).toBe(7);
      expect(u.rateCardStatus).toBeTruthy();
      // A proposal may not be issued against a margin nobody has.
      const decision = shouldBlockIssue(u);
      expect(decision.blocked).toBe(true);
      expect(decision.code).toBe('underwriting_refused');
      expect(decision.reason).toContain('could not be computed');
      // And no sensitivity table is fabricated from a refused baseline.
      const s = overrunSensitivity(q, m, OPTS);
      expect(s.points).toEqual([]);
      expect(s.breakevenUpliftPct).toBeNull();
      expect(s.verdict).toBe(verdict);
      expect(s.reasons.join(' | ')).toContain('four fictional rows');
    });
  }

  /**
   * THE FULL HOSTILE RATE-CARD SET, asserted in one place so a future edit to one
   * branch cannot quietly reopen the other.
   *
   * The last two rows are the ones that DID leak. The metered branch tested
   * `amountCents <= 0` itself instead of asking `rateCardCostCents`, so it skipped
   * that function's round-to-zero guard: a 0.0001c/day card is finite and positive,
   * passed, multiplied out to a cost basis of 0, and underwrote a $17,500 price at
   * p50 1,750,000c — 100% margin, pLoss 0, blocked=false — on work with a real
   * cost. Both branches now route through the same derivation.
   *
   * The string rows are not hypothetical: `pg` returns `numeric` columns as
   * strings, and `Number.isFinite('60000')` is false. A card that arrives as a
   * string must refuse rather than coerce, so the cast is the point of the case.
   */
  const fromPg = (v: string): number => v as unknown as number;
  const hostileCards: Array<[string, RateCard]> = [
    ['fixed 0', card('fixed', 0)],
    ['daily 0', card('day_rate', 0)],
    ['hourly 0', card('hourly', 0)],
    ['daily -1', card('day_rate', -1)],
    ['daily NaN', card('day_rate', Number.NaN)],
    ['daily "60000" (string from pg)', card('day_rate', fromPg('60000'))],
    ['fixed "0" (string from pg)', card('fixed', fromPg('0'))],
    ['fixed 0.4 (rounds to zero)', card('fixed', 0.4)],
    ['daily 0.0001 (rounds to zero)', card('day_rate', 0.0001)],
  ];

  for (const [label, hostile] of hostileCards) {
    it(`refuses a rate card of ${label} instead of quoting free work`, () => {
      const q = quote({ priceCents: 1_750_000 });
      const u = underwrite(q, model({ card: hostile, hoursPerDay: 8 }), OPTS);
      expect(u.verdict).toBe('refused_rate_not_derivable');
      expect(isRefusal(u.verdict)).toBe(true);
      // No band, and specifically no 100%-margin band off a zero cost basis.
      expect(u.distribution).toBeNull();
      expect(u.pLoss).toBeNull();
      expect(u.pLossLikelihood).toBeNull();
      expect(u.reasons.join(' | ')).toMatch(/not a usable rate|does not price/);
      // And the refusal reaches the gate, so nothing can be issued against it.
      expect(shouldBlockIssue(u).blocked).toBe(true);
      expect(overrunSensitivity(q, model({ card: hostile, hoursPerDay: 8 }), OPTS).points).toEqual([]);
    });
  }

  it('reports the currency mismatch before staleness when a card fails both', () => {
    const u = underwrite(
      quote(),
      model({ card: card('day_rate', 100_000, { currency: 'EUR', validUntil: '2026-01-01T00:00:00.000Z' }) }),
      OPTS,
    );
    expect(u.verdict).toBe('refused_currency_mismatch');
    expect(u.rateCardStatus).toBe('expired');
  });

  it('still reports a bad price in reasons when a cost refusal takes the verdict', () => {
    const u = underwrite(
      quote({ priceCents: -1, currency: 'USD' }),
      model({ card: card('day_rate', 100_000, { currency: 'EUR' }) }),
      OPTS,
    );
    expect(u.verdict).toBe('refused_currency_mismatch');
    expect(u.reasons.join(' | ')).toContain('corrupt data');
  });

  it('a usable card in a lowercase currency is not a mismatch', () => {
    const u = underwrite(quote({ currency: 'usd' }), model({ card: card('day_rate', 100_000, { currency: 'usd' }) }), OPTS);
    expect(u.verdict).toBe('underwritten');
    expect(u.currency).toBe('USD');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* INTEGER CENTS — no code path returns a fractional cent                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('money is integer cents on every path', () => {
  /** Chosen to force fractions at every multiplication in the chain. */
  const awkward = model({
    card: card('hourly', 12_345, { expectedUnits: 3 }),
    hoursPerDay: 7.5, // → 92_587.5 cents per day
    effort: triple(3.7, 6.3, 9.1), // fractional days
    fixedCostCents: 333_333,
  });
  const awkwardOutcomes: RecordedOutcome[] = [400_001, 333_333, 700_007].map((actual, i) =>
    outcome(`e${i}`, { quotedVendorCostCents: 300_000, actualVendorCostCents: actual }),
  );
  const opts: UnderwriteOptions = { asOf: ASOF, samples: 3_000, seed: 11, outcomes: awkwardOutcomes };

  it('keeps every distribution field an integer', () => {
    const u = underwrite(quote({ priceCents: 1_234_567 }), awkward, opts);
    expect(u.verdict).toBe('underwritten');
    for (const [name, v] of moneyFields(u)) {
      expect(Number.isInteger(v), `${name} = ${v}`).toBe(true);
    }
  });

  it('keeps every sensitivity row an integer', () => {
    const s = overrunSensitivity(quote({ priceCents: 1_234_567 }), awkward, opts, [7, 13, 33.3]);
    for (const p of s.points) {
      for (const [k, v] of Object.entries(p)) {
        if (k.endsWith('Cents')) expect(Number.isInteger(v), `${k} = ${v}`).toBe(true);
      }
    }
  });

  it('keeps every cents-denominated driver an integer, and labels its unit', () => {
    const u = underwrite(quote({ priceCents: 1_234_567 }), awkward, opts);
    expect(u.drivers.length).toBeGreaterThan(5);
    for (const d of u.drivers) {
      expect(['cents', 'days', 'pct', 'ratio', 'count']).toContain(d.unit);
      if (d.unit === 'cents') expect(Number.isInteger(d.points), `${d.label} = ${d.points}`).toBe(true);
    }
    // The pass-through appears as its own zero-spread line.
    expect(u.drivers.some((d) => d.label.includes('Pass-through'))).toBe(true);
  });

  it('keeps probabilities in [0,1] and out of the money fields', () => {
    const u = underwrite(quote({ priceCents: 1_234_567 }), awkward, opts);
    expect(u.pLoss).toBeGreaterThanOrEqual(0);
    expect(u.pLoss).toBeLessThanOrEqual(1);
    expect(u.blend.weight).toBe(0.375);
    expect(u.varianceDriver!.contribution).toBeGreaterThanOrEqual(0);
    expect(u.varianceDriver!.contribution).toBeLessThanOrEqual(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* DEVIL'S ADVOCATE (D4)                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('devilsAdvocate', () => {
  const offer = getOffer('mica_whitepaper');
  const u = underwrite(quote(), model(), OPTS);
  /** The perimeter lines, found the same way the module finds them: shared across offers. */
  const perimeter = offer.exclusions.filter((e) => getOffer('gtm_sprint').exclusions.includes(e));

  it('falls back to the offer exclusions with no outcomes, and SAYS it is inferring', () => {
    const da = devilsAdvocate(offer, u, []);
    expect(da.source).toBe('offer_exclusions');
    expect(da.sourceStatement).toContain('NO RECORDED OUTCOMES');
    expect(da.arguments).toHaveLength(3);
    expect(da.arguments.map((a) => a.rank)).toEqual([1, 2, 3]);
    // An inference carries no sample, and must not pretend to.
    for (const a of da.arguments) {
      expect(a.sampleSize).toBe(0);
      expect(a.denominator).toBe(0);
      expect(a.source).toBe('offer_exclusions');
      expect(a.evidence).toMatch(/not an observation|not observed/);
    }
    expect(da.whatWouldChangeThis).toContain('first recorded outcome');
  });

  it('never argues from a perimeter exclusion — those are promises, not overrun risks', () => {
    expect(perimeter.length).toBeGreaterThanOrEqual(4);
    const claims = devilsAdvocate(offer, u, []).arguments.map((a) => a.claim).join(' | ');
    for (const line of perimeter) expect(claims).not.toContain(line);
    expect(claims).not.toContain('No listing of any kind');
    expect(claims).not.toContain('No regulatory approval');
    expect(claims).not.toContain('No market-making');
  });

  it('tops up from required client inputs when every exclusion is perimeter', () => {
    const bare = { key: 'mica_whitepaper' as OfferKey, name: 'Bare', exclusions: perimeter, requiredClientInputs: ['The token economics document'] };
    const da = devilsAdvocate(bare, u, []);
    expect(da.arguments).toHaveLength(1);
    expect(da.arguments[0]!.claim).toContain('The token economics document');
    expect(da.arguments[0]!.evidence).toContain('no intake surface');
  });

  it('says there is nothing to argue with when the offer states no boundary at all', () => {
    const empty = { key: 'mica_whitepaper' as OfferKey, name: 'Empty', exclusions: [], requiredClientInputs: [] };
    const da = devilsAdvocate(empty, u, []);
    expect(da.source).toBe('none');
    expect(da.arguments).toEqual([]);
    expect(da.sourceStatement).toContain('no defensible scope boundary');
  });

  it('prefers recorded outcomes and ranks them by observed frequency', () => {
    const outcomes: RecordedOutcome[] = [
      // 3 of 3 overran on cost; 1 of 3 was late; 1 of 2 needed rework.
      outcome('a', { actualVendorCostCents: 900_000, dueAt: '2026-05-01', deliveredAt: '2026-05-01', reworkRounds: 0 }),
      outcome('b', { actualVendorCostCents: 780_000, dueAt: '2026-05-01', deliveredAt: '2026-06-01', reworkRounds: 2 }),
      outcome('c', { actualVendorCostCents: 660_000, dueAt: '2026-05-01', deliveredAt: '2026-04-20' }),
    ];
    const da = devilsAdvocate(offer, u, outcomes);
    expect(da.source).toBe('recorded_outcomes');
    expect(da.sourceStatement).toContain('3 recorded');
    expect(da.arguments.length).toBeGreaterThanOrEqual(2);
    // Cost overrun happened on every engagement, so it leads.
    expect(da.arguments[0]!.claim).toContain('invoices more than the quote assumed');
    expect(da.arguments[0]!.sampleSize).toBe(3);
    expect(da.arguments[0]!.denominator).toBe(3);
    expect(da.arguments[0]!.claim).toContain('the worst by 50%');
    for (const a of da.arguments) {
      expect(a.source).toBe('recorded_outcomes');
      expect(a.sampleSize).toBeGreaterThan(0);
      expect(a.evidence).toMatch(/\d+\/\d+ recorded outcomes/);
    }
    expect(da.arguments.length).toBeLessThanOrEqual(3);
  });

  it('does not promote a zero-occurrence category to a most-likely reason', () => {
    // Every recorded engagement came in on cost, on time, first pass. That is
    // evidence FOR the quote, so the panel must fall back and say so.
    const clean = [outcome('a'), outcome('b', { dueAt: '2026-05-01', deliveredAt: '2026-04-28', reworkRounds: 0, acceptedFirstPass: true })];
    const da = devilsAdvocate(offer, u, clean);
    expect(da.source).toBe('offer_exclusions');
    expect(da.sourceStatement).toContain('none showed an overrun');
    expect(da.sourceStatement).toContain('2 recorded');
  });

  it('scopes to the offer — another offer’s overruns are not evidence here', () => {
    const other = [outcome('x', { offerKey: 'gtm_sprint', actualVendorCostCents: 2_000_000 })];
    const da = devilsAdvocate(offer, u, other);
    expect(da.source).toBe('offer_exclusions');
    expect(da.sourceStatement).toContain('NO RECORDED OUTCOMES');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE WIRE — one assembly, and it discloses what it is standing on            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('buildUnderwriteResponse', () => {
  const res = buildUnderwriteResponse(
    quote(),
    model({ effort: placeholderEffortTriple('mica_whitepaper') }),
    OPTS,
  );

  it('assembles all four parts from ONE simulation of the same inputs', () => {
    expect(res.underwriting.verdict).toBe('underwritten');
    // The gate reads the same numbers the screen shows — it cannot disagree.
    const checks = [...res.issue.passed, ...res.issue.failed];
    expect(checks.some((c) => c.code === 'p_loss_above_threshold' && c.observed === res.underwriting.pLoss)).toBe(true);
    // The shipped placeholder triple (8/15/30 days at $1,000/day) is wide enough
    // to sink a $15,000 quote, so this fixture is BLOCKED — which is the correct
    // behaviour and worth pinning: the placeholder is not a flattering default.
    expect(res.issue.blocked).toBe(true);
    expect(res.issue.code).toBe('p_loss_above_threshold');
    expect(res.sensitivity.points[0]!.p50MarginCents).toBe(res.underwriting.distribution!.p50MarginCents);
    expect(res.devilsAdvocate.sourceStatement).toContain(getOffer('mica_whitepaper').name);
    expect(res.asOf).toBe(ASOF);
  });

  it('publishes the honesty flags verbatim rather than making a surface import them', () => {
    expect(res.effortTriplesArePlaceholders).toBe(true);
    expect(res.percentileMethod).toBe(PERCENTILE_METHOD);
    expect(res.policyNotice).toContain('stated default');
    expect(res.policyNotice).toContain('20%');
  });

  it('names every founder input the screen is standing on and does not have', () => {
    const joined = res.unresolvedInputs.join(' | ');
    expect(res.unresolvedInputs.length).toBe(3);
    expect(joined).toContain('Effort triple');
    // Flipped 2026-08-31: the founder approved real bands (APPROVED_PRICE_BANDS),
    // so the price-band notice LEAVING this list is now the guarded state — its
    // reappearance would mean the flag regressed to placeholder.
    expect(joined).not.toContain('Price bands are placeholders');
    expect(joined).toContain('No minimum margin floor');
    expect(joined).toContain('the distribution is a prior');
  });

  it('drops the placeholder notice once a real triple is supplied', () => {
    const real = buildUnderwriteResponse(quote(), model({ effort: triple(4, 6, 8) }), OPTS);
    expect(real.unresolvedInputs.join(' | ')).not.toContain('Effort triple');
    // …but the flag stays true until the shipped block is replaced.
    expect(real.effortTriplesArePlaceholders).toBe(true);
  });

  it('carries the refusal through every part rather than half a screen of numbers', () => {
    const refused = buildUnderwriteResponse(quote(), model({ card: card('day_rate', 100_000, { currency: 'CHF' }) }), OPTS);
    expect(refused.underwriting.distribution).toBeNull();
    expect(refused.sensitivity.points).toEqual([]);
    expect(refused.issue.blocked).toBe(true);
    expect(refused.issue.code).toBe('underwriting_refused');
    // The devil's advocate still works: it does not need a distribution.
    expect(refused.devilsAdvocate.arguments.length).toBeGreaterThan(0);
  });
});
