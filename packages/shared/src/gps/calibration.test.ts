/**
 * Behavioural tests for the GPS calibration instrument.
 *
 * The first describe block is the one that matters. Everything else here is
 * arithmetic; the n-threshold suppression is the DESIGN, and a regression that
 * lets a win rate escape off three data points would defeat the module's whole
 * purpose while leaving every other test green.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_N_FOR_RATE,
  MIN_N_PER_ARM_FOR_SEPARATION,
  ASSUMED_ANNUAL_ENGAGEMENT_VOLUME,
  UNATTRIBUTED_PARTNER,
  WIN_REASONS,
  LOSS_REASONS,
  isReasonValidFor,
  wilson95Pct,
  winLossSummary,
  marginRealisation,
  weightReviewPacket,
  calibrationHealth,
  type OutcomeRecord,
  type PriorWeights,
} from './calibration.js';
import { OFFER_KEYS } from './types.js';

/**
 * A won engagement: $20,000 quoted on an $8,000 partner cost, realised exactly as
 * quoted. Overridden per test so each case states only what it is about.
 */
function won(over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    engagementId: 'eng-1',
    clientId: 'cli-1',
    offerKey: 'gtm_sprint',
    disposition: 'won',
    reason: 'referral',
    quotedPriceCents: 2_000_000,
    realisedPriceCents: 2_000_000,
    quotedVendorCostCents: 800_000,
    realisedVendorCostCents: 800_000,
    cycleTimeDays: 30,
    acceptanceFirstPass: true,
    partner: 'partner-a',
    factorScoresAtQuote: null,
    decidedAt: '2026-01-15',
    ...over,
  };
}

/** A lost engagement. Realised figures are null, never 0 — see `OutcomeRecord`. */
function lost(over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return won({
    disposition: 'lost',
    reason: 'price_too_high',
    realisedPriceCents: null,
    realisedVendorCostCents: null,
    acceptanceFirstPass: null,
    ...over,
  });
}

/** n records, alternating won/lost, all on one offer. */
function mix(offerKey: OutcomeRecord['offerKey'], wonN: number, lostN: number): OutcomeRecord[] {
  return [
    ...Array.from({ length: wonN }, (_, i) => won({ offerKey, engagementId: `${offerKey}-w${i}` })),
    ...Array.from({ length: lostN }, (_, i) => lost({ offerKey, engagementId: `${offerKey}-l${i}` })),
  ];
}

/* ══════════════════════════════════════════════════════════════════════════ */

describe('winLossSummary — the n threshold (the point of this module)', () => {
  it('refuses to say "33%" off three data points: counts yes, rate null', () => {
    const s = winLossSummary(mix('mica_whitepaper', 1, 2));
    const row = s.byOffer.find((r) => r.offerKey === 'mica_whitepaper')!;
    expect(row.won).toBe(1);
    expect(row.lost).toBe(2);
    expect(row.sampleSize).toBe(3);
    expect(row.winRatePct).toBeNull(); // NOT 33
    expect(row.interval95Pct).toBeNull();
    expect(row.rateSuppressed).toBe(true);
    expect(row.suppressionReason).toContain(String(MIN_N_FOR_RATE));
  });

  it('suppresses at MIN_N_FOR_RATE − 1 and expresses at exactly MIN_N_FOR_RATE', () => {
    const below = winLossSummary(mix('gtm_sprint', 4, MIN_N_FOR_RATE - 5));
    const at = winLossSummary(mix('gtm_sprint', 4, MIN_N_FOR_RATE - 4));
    const rowBelow = below.byOffer.find((r) => r.offerKey === 'gtm_sprint')!;
    const rowAt = at.byOffer.find((r) => r.offerKey === 'gtm_sprint')!;
    expect(rowBelow.sampleSize).toBe(MIN_N_FOR_RATE - 1);
    expect(rowBelow.winRatePct).toBeNull();
    expect(rowAt.sampleSize).toBe(MIN_N_FOR_RATE);
    expect(rowAt.winRatePct).toBe(50);
    expect(rowAt.rateSuppressed).toBe(false);
    expect(rowAt.suppressionReason).toBeNull();
  });

  it('attaches the Wilson interval so the width travels with the rate (4/8 → 22–78%)', () => {
    const s = winLossSummary(mix('gtm_sprint', 4, 4));
    const row = s.byOffer.find((r) => r.offerKey === 'gtm_sprint')!;
    expect(row.winRatePct).toBe(50);
    // The reason MIN_N_FOR_RATE=8 is argued rather than asserted: even at the
    // threshold the true rate could be anywhere from a quarter to three quarters.
    expect(row.interval95Pct).toEqual({ lowPct: 22, highPct: 78 });
  });

  it('pools to a rate across offers even while every single offer is suppressed', () => {
    const records = [
      ...mix('diagnostic', 1, 1),
      ...mix('mica_whitepaper', 1, 1),
      ...mix('legal_opinion_coordination', 1, 1),
      ...mix('gtm_sprint', 1, 1),
    ];
    const s = winLossSummary(records);
    expect(s.overall.sampleSize).toBe(8);
    expect(s.overall.winRatePct).toBe(50);
    for (const row of s.byOffer) expect(row.winRatePct).toBeNull();
  });

  it('emits a row for every offer including never-decided ones, in catalogue order', () => {
    const s = winLossSummary(mix('diagnostic', 2, 0));
    expect(s.byOffer.map((r) => r.offerKey)).toEqual([...OFFER_KEYS]);
    const empty = s.byOffer.find((r) => r.offerKey === 'marketing_activation')!;
    expect(empty.sampleSize).toBe(0);
    expect(empty.winRatePct).toBeNull();
    expect(empty.suppressionReason).toContain('No decided engagements');
  });

  it('counts reasons, most frequent first, deterministically', () => {
    const s = winLossSummary([
      lost({ offerKey: 'gtm_sprint', reason: 'no_budget', engagementId: 'a' }),
      lost({ offerKey: 'gtm_sprint', reason: 'no_budget', engagementId: 'b' }),
      lost({ offerKey: 'gtm_sprint', reason: 'timing_wrong', engagementId: 'c' }),
      won({ offerKey: 'gtm_sprint', reason: 'referral', engagementId: 'd' }),
    ]);
    const row = s.byOffer.find((r) => r.offerKey === 'gtm_sprint')!;
    expect(row.topLossReasons).toEqual([
      { reason: 'no_budget', count: 2 },
      { reason: 'timing_wrong', count: 1 },
    ]);
    expect(row.topWinReasons).toEqual([{ reason: 'referral', count: 1 }]);
  });

  it('echoes its own threshold so a rendered report carries it', () => {
    expect(winLossSummary([]).minNForRate).toBe(MIN_N_FOR_RATE);
    expect(winLossSummary([]).overall.sampleSize).toBe(0);
  });
});

describe('reason vocabulary', () => {
  it('rejects a loss reason on a win and vice versa', () => {
    expect(isReasonValidFor('won', 'referral')).toBe(true);
    expect(isReasonValidFor('won', 'no_budget')).toBe(false);
    expect(isReasonValidFor('lost', 'no_budget')).toBe(true);
    expect(isReasonValidFor('lost', 'referral')).toBe(false);
  });

  it('accepts "unknown" for both, because an invented reason is worse than an admitted gap', () => {
    expect(isReasonValidFor('won', 'unknown')).toBe(true);
    expect(isReasonValidFor('lost', 'unknown')).toBe(true);
    expect(WIN_REASONS).toContain('unknown');
    expect(LOSS_REASONS).toContain('unknown');
  });
});

describe('wilson95Pct', () => {
  it('never returns a bound outside 0–100', () => {
    expect(wilson95Pct(0, 10)!.lowPct).toBe(0);
    expect(wilson95Pct(10, 10)!.highPct).toBe(100);
  });

  it('narrows as n grows', () => {
    const small = wilson95Pct(5, 10)!;
    const large = wilson95Pct(50, 100)!;
    expect(large.highPct - large.lowPct).toBeLessThan(small.highPct - small.lowPct);
  });

  it('returns null for impossible inputs rather than NaN', () => {
    expect(wilson95Pct(1, 0)).toBeNull();
    expect(wilson95Pct(9, 8)).toBeNull();
    expect(wilson95Pct(-1, 8)).toBeNull();
    expect(wilson95Pct(1.5, 8)).toBeNull();
  });
});

describe('marginRealisation — the worked example from the docblock', () => {
  // $20,000 quoted on $8,000 cost (margin $12,000); invoiced $19,000 against a
  // $10,000 partner invoice (margin $9,000). −$3,000 of slippage, of which
  // −$1,000 is discount and $2,000 is partner overrun.
  const overrun = won({
    quotedPriceCents: 2_000_000,
    quotedVendorCostCents: 800_000,
    realisedPriceCents: 1_900_000,
    realisedVendorCostCents: 1_000_000,
  });

  it('splits slippage into the discount side and the cost-overrun side', () => {
    const g = marginRealisation([overrun]).overall!;
    expect(g.n).toBe(1);
    expect(g.quotedMarginMeanCents).toBe(1_200_000);
    expect(g.realisedMarginMeanCents).toBe(900_000);
    expect(g.slippageMeanCents).toBe(-300_000);
    expect(g.priceSlippageMeanCents).toBe(-100_000);
    expect(g.costSlippageMeanCents).toBe(200_000);
    // The identity that makes the split readable: slippage = price − cost movement.
    expect(g.slippageMeanCents).toBe(g.priceSlippageMeanCents - g.costSlippageMeanCents);
  });

  it('reports gross margin percent of price on both sides (60% quoted → 47% realised)', () => {
    const g = marginRealisation([overrun]).overall!;
    expect(g.quotedMarginPctMean).toBe(60);
    expect(g.realisedMarginPctMean).toBe(47); // 900_000 / 1_900_000 = 47.4%
  });

  it('refuses to imply a trend from one engagement: no variance at n = 1', () => {
    const g = marginRealisation([overrun]).overall!;
    expect(g.slippageVarianceCents2).toBeNull();
    expect(g.slippageStdDevCents).toBeNull();
    expect(g.worstSlippageCents).toBe(-300_000);
    expect(g.bestSlippageCents).toBe(-300_000);
  });
});

describe('marginRealisation — variance arithmetic', () => {
  // Three engagements, all quoted at margin $12,000, realised at $11,000 /
  // $12,000 / $13,000. Slippages: −100_000, 0, +100_000 cents.
  // mean = 0; sample variance = (1e10 + 0 + 1e10) / (3−1) = 1e10 cents²;
  // sd = 100_000 cents = $1,000.
  const spread = [
    won({ engagementId: 'a', realisedPriceCents: 1_900_000 }),
    won({ engagementId: 'b', realisedPriceCents: 2_000_000 }),
    won({ engagementId: 'c', realisedPriceCents: 2_100_000 }),
  ];

  it('uses the n−1 denominator and reports cents² plus a readable sd', () => {
    const g = marginRealisation(spread).overall!;
    expect(g.n).toBe(3);
    expect(g.slippageMeanCents).toBe(0);
    expect(g.slippageVarianceCents2).toBe(10_000_000_000);
    expect(g.slippageStdDevCents).toBe(100_000);
    expect(g.worstSlippageCents).toBe(-100_000);
    expect(g.bestSlippageCents).toBe(100_000);
  });

  it('a mean of zero does not mean nothing happened — the sd is the finding', () => {
    const g = marginRealisation(spread).overall!;
    // Two engagements moved $1,000 in opposite directions. A mean-only report
    // would say "margin held exactly".
    expect(g.slippageMeanCents).toBe(0);
    expect(g.slippageStdDevCents).toBeGreaterThan(0);
  });

  it('counts engagements delivered at a realised loss', () => {
    const g = marginRealisation([
      won({ engagementId: 'x', realisedPriceCents: 700_000 }), // $7,000 against an $8,000 cost
      won({ engagementId: 'y' }),
    ]).overall!;
    expect(g.negativeRealisedMarginCount).toBe(1);
    expect(g.n).toBe(2);
  });
});

describe('marginRealisation — grouping and exclusions', () => {
  const records = [
    won({ engagementId: 'a', partner: 'sloppy', realisedVendorCostCents: 1_100_000 }), // −300_000
    won({ engagementId: 'b', partner: 'tight', realisedVendorCostCents: 700_000 }), // +100_000
    won({ engagementId: 'c', partner: null }), // 0, unattributed
    won({ engagementId: 'd', realisedPriceCents: null }), // won, not yet billed
    lost({ engagementId: 'e', offerKey: 'mica_whitepaper' }),
  ];

  it('ranks partners worst mean slippage first — it is an action list', () => {
    const m = marginRealisation(records);
    expect(m.byPartner.map((g) => g.key)).toEqual(['sloppy', UNATTRIBUTED_PARTNER, 'tight']);
    expect(m.byPartner[0].slippageMeanCents).toBe(-300_000);
    expect(m.byPartner[2].slippageMeanCents).toBe(100_000);
  });

  it('keeps unattributed deliveries in byPartner so the groups reconcile to overall', () => {
    const m = marginRealisation(records);
    const summed = m.byPartner.reduce((a, g) => a + g.n, 0);
    expect(summed).toBe(m.overall!.n);
    expect(m.overall!.n).toBe(3);
  });

  it('excludes lost and not-yet-billed engagements, and counts each separately', () => {
    const m = marginRealisation(records);
    expect(m.excludedLost).toBe(1);
    expect(m.excludedIncompleteRealisation).toBe(1);
  });

  it('names the offers with no margin evidence at all — the blind spots', () => {
    const m = marginRealisation(records);
    expect(m.byOffer.map((g) => g.key)).toEqual(['gtm_sprint']);
    // The lost mica_whitepaper contributed no realised margin, so it is a blind spot too.
    expect(m.offersWithNoRealisationData).toContain('mica_whitepaper');
    expect(m.offersWithNoRealisationData).not.toContain('gtm_sprint');
    expect(m.offersWithNoRealisationData).toHaveLength(OFFER_KEYS.length - 1);
  });

  it('returns a null overall rather than a zero-filled group when there is nothing', () => {
    const m = marginRealisation([lost()]);
    expect(m.overall).toBeNull();
    expect(m.byOffer).toEqual([]);
    expect(m.byPartner).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The plan §7 prior, keyed and valued as the targeting module states it
 * (`WEIGHTS_V1`). Written out rather than imported: calibration must not depend
 * on the module it reviews. Only the weights' immutability is asserted here.
 */
const PRIOR: PriorWeights = {
  need: 30,
  abilityToPay: 25,
  expectedMargin: 20,
  access: 15,
  urgency: 10,
  deliveryComplexity: 15,
};

/** Records carrying one factor's quote-time score, won arm then lost arm. */
function scoredOn(factor: string, wonVals: number[], lostVals: number[]): OutcomeRecord[] {
  return [
    ...wonVals.map((v, i) => won({ engagementId: `w${i}`, factorScoresAtQuote: { [factor]: v } })),
    ...lostVals.map((v, i) => lost({ engagementId: `l${i}`, factorScoresAtQuote: { [factor]: v } })),
  ];
}

describe('weightReviewPacket — never adjusts a weight', () => {
  it('does not mutate the caller’s weights and returns a frozen copy', () => {
    const mutable: Record<string, number> = { ...PRIOR };
    const before = { ...mutable };
    const packet = weightReviewPacket(scoredOn('need', [8, 8, 9, 7, 8], [3, 4, 3, 2, 3]), mutable);
    expect(mutable).toEqual(before); // input untouched
    expect(packet.weightsReviewed).toEqual(before); // output equal in value
    expect(packet.weightsReviewed).not.toBe(mutable); // and not the same object
    expect(Object.isFrozen(packet.weightsReviewed)).toBe(true);
  });

  it('states in its own type that no adjustment happened', () => {
    const packet = weightReviewPacket([], PRIOR);
    expect(packet.autoAdjustmentApplied).toBe(false);
    expect(packet.humanReviewRequired).toBe(true);
  });

  it('reports every factor as insufficient evidence when a strong-looking signal has no n', () => {
    // Need runs 9 on wins and 2 on losses — a huge apparent effect on 3+3 deals.
    const packet = weightReviewPacket(scoredOn('need', [9, 9, 9], [2, 2, 2]), PRIOR);
    expect(packet.factors.every((f) => f.verdict === 'insufficient_evidence')).toBe(true);
    const need = packet.factors.find((f) => f.factor === 'need')!;
    expect(need.nWon).toBe(3);
    expect(need.nLost).toBe(3);
    expect(need.note).toContain(String(MIN_N_PER_ARM_FOR_SEPARATION));
    expect(packet.headline).toContain('No factor has enough evidence');
  });
});

describe('weightReviewPacket — what it says when there is something to say', () => {
  // Five per arm, i.e. MIN_N_PER_ARM_FOR_SEPARATION. If that const rises, these
  // arrays must grow with it, and the expected d changes.
  it('describes an apparent separation toward won, with Cohen’s d', () => {
    const packet = weightReviewPacket(scoredOn('need', [8, 8, 9, 7, 8], [3, 4, 3, 2, 3]), PRIOR);
    const need = packet.factors.find((f) => f.factor === 'need')!;
    expect(need.meanWhenWon).toBe(8);
    expect(need.meanWhenLost).toBe(3);
    expect(need.separation).toBe(5);
    // pooled sd = √((4·0.5 + 4·0.5)/8) = √0.5 = 0.7071 → d = 5 / 0.7071 = 7.07
    expect(need.standardisedSeparation).toBe(7.07);
    expect(need.verdict).toBe('apparent_separation_toward_won');
    expect(need.currentWeight).toBe(PRIOR.need);
    expect(packet.headline).toContain('for a human decision');
  });

  it('calls a reversed factor "toward lost" without calling it wrong', () => {
    const packet = weightReviewPacket(
      scoredOn('deliveryComplexity', [3, 4, 3, 2, 3], [8, 8, 9, 7, 8]),
      PRIOR,
    );
    const dc = packet.factors.find((f) => f.factor === 'deliveryComplexity')!;
    expect(dc.standardisedSeparation).toBe(-7.07);
    expect(dc.verdict).toBe('apparent_separation_toward_lost');
    // The formula subtracts DeliveryComplexity, so this is the expected direction.
    expect(dc.note).toContain('subtracts');
  });

  it('reports no apparent separation below the standardised floor', () => {
    const packet = weightReviewPacket(scoredOn('urgency', [5, 6, 5, 4, 5], [5, 4, 5, 6, 5]), PRIOR);
    const u = packet.factors.find((f) => f.factor === 'urgency')!;
    expect(u.separation).toBe(0);
    expect(u.standardisedSeparation).toBe(0);
    expect(u.verdict).toBe('no_apparent_separation');
  });

  it('will not report separation when a factor never varies within an arm', () => {
    const packet = weightReviewPacket(scoredOn('access', [5, 5, 5, 5, 5], [2, 2, 2, 2, 2]), PRIOR);
    const a = packet.factors.find((f) => f.factor === 'access')!;
    expect(a.standardisedSeparation).toBeNull();
    expect(a.verdict).toBe('insufficient_evidence');
    expect(a.note).toContain('no spread');
  });

  it('surfaces a factor observed in snapshots but absent from the prior', () => {
    const packet = weightReviewPacket(
      [won({ engagementId: 'a', factorScoresAtQuote: { need: 5, mystery: 3 } })],
      { need: 1 },
    );
    expect(packet.factors.map((f) => f.factor)).toEqual(['need', 'mystery']);
    const mystery = packet.factors.find((f) => f.factor === 'mystery')!;
    expect(mystery.weighted).toBe(false);
    expect(mystery.currentWeight).toBeNull();
    expect(mystery.note).toContain('carries no weight');
  });

  it('counts engagements that predate scoring as absent evidence, not as zeros', () => {
    const packet = weightReviewPacket(
      [
        won({ engagementId: 'a', factorScoresAtQuote: { need: 9 } }),
        won({ engagementId: 'b', factorScoresAtQuote: null }),
        lost({ engagementId: 'c', factorScoresAtQuote: null }),
      ],
      { need: 1 },
    );
    expect(packet.recordsConsidered).toBe(3);
    expect(packet.recordsWithFactorScores).toBe(1);
    expect(packet.recordsMissingFactorScores).toBe(2);
    const need = packet.factors.find((f) => f.factor === 'need')!;
    expect(need.nWon).toBe(1);
    expect(need.nLost).toBe(0); // not 2 zero-scored losses
    expect(need.meanWhenLost).toBeNull();
    expect(need.separation).toBeNull();
  });

  it('keeps the weighted factors in the caller’s own key order', () => {
    const packet = weightReviewPacket([], PRIOR);
    expect(packet.factors.map((f) => f.factor)).toEqual(Object.keys(PRIOR));
  });

  it('always ships the caveats that must reach the review meeting', () => {
    const packet = weightReviewPacket([], PRIOR);
    expect(packet.caveats.length).toBeGreaterThanOrEqual(4);
    expect(packet.caveats.join(' ')).toContain('significance test');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('calibrationHealth — 0 records', () => {
  const h = calibrationHealth([]);

  it('says nothing can be concluded, including that things are going well', () => {
    expect(h.recordCount).toBe(0);
    expect(h.canExpressOverallWinRate).toBe(false);
    expect(h.canMeasureMarginRealisation).toBe(false);
    expect(h.canReviewFactorSeparation).toBe(false);
    expect(h.offersWithAnyOutcome).toBe(0);
    expect(h.offersWhereRateCanBeExpressed).toEqual([]);
    expect(h.statements[0]).toContain('No outcomes have been recorded');
    expect(h.headline).toContain('No outcome data');
  });

  it('converts "not enough data" into a date: ~1.4 years to the first quotable rate', () => {
    expect(h.assumedAnnualVolume).toBe(ASSUMED_ANNUAL_ENGAGEMENT_VOLUME);
    expect(h.assumedAnnualVolumePerOffer).toBe(5.8); // 29 / 5 offers
    expect(h.estimatedYearsToFirstOfferRate).toBe(1.4); // 8 / 5.8
  });
});

describe('calibrationHealth — 3 records', () => {
  const h = calibrationHealth(mix('mica_whitepaper', 1, 2));

  it('reports counts, withholds every rate, and names the wait', () => {
    expect(h.recordCount).toBe(3);
    expect(h.wonCount).toBe(1);
    expect(h.lostCount).toBe(2);
    expect(h.offersWithAnyOutcome).toBe(1);
    expect(h.canExpressOverallWinRate).toBe(false);
    expect(h.offersWhereRateCanBeExpressed).toEqual([]);
    expect(h.estimatedYearsToFirstOfferRate).toBe(0.9); // (8 − 3) / 5.8
    expect(h.statements.join(' ')).toContain('the counts are the finding');
  });

  it('measures margin on the one won engagement without implying a trend', () => {
    expect(h.canMeasureMarginRealisation).toBe(true);
    expect(h.recordsWithCompleteMarginData).toBe(1);
    expect(h.statements.join(' ')).toContain('dispersion not computable at n=1');
  });
});

describe('calibrationHealth — 40 records', () => {
  // 8 per offer (4 won / 4 lost) — roughly 16 months of the assumed volume, and
  // the first point at which every offer can support a (very wide) rate.
  const records = OFFER_KEYS.flatMap((k) => mix(k, 4, 4));
  const h = calibrationHealth(records);

  it('unlocks rates for every offer once each reaches the threshold', () => {
    expect(h.recordCount).toBe(40);
    expect(h.canExpressOverallWinRate).toBe(true);
    expect(h.offersWhereRateCanBeExpressed).toEqual([...OFFER_KEYS]);
    expect(h.estimatedYearsToFirstOfferRate).toBeNull();
    expect(h.statements.join(' ')).toContain('quote the interval, not the point');
  });

  it('still refuses to be a model, and says why at every data volume', () => {
    expect(h.canTrainAModel).toBe(false);
    expect(h.statements.join(' ')).toContain('stated prior');
    expect(h.headline).toContain('nothing here is learned');
    // The same sentence is present with zero data, so the claim never quietly changes.
    expect(calibrationHealth([]).statements.join(' ')).toContain('stated prior');
  });

  it('discloses the survivorship bias in its own output, not only in a comment', () => {
    expect(h.statements.join(' ')).toContain('Cancelled');
  });

  it('reports margin coverage over the won half only', () => {
    expect(h.recordsWithCompleteMarginData).toBe(20);
    expect(h.partnersWithMarginData).toBe(1);
  });

  it('cannot review factor separation while no engagement carries factor scores', () => {
    expect(h.canReviewFactorSeparation).toBe(false);
    const scored = calibrationHealth(scoredOn('need', [8, 8, 9, 7, 8], [3, 4, 3, 2, 3]));
    expect(scored.canReviewFactorSeparation).toBe(true);
  });
});
