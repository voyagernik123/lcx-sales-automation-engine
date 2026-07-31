/**
 * Tests for GPS targeting.
 *
 * These are written against the three properties that make the replacement a
 * replacement rather than a reshuffle of the mandate's formula:
 *
 *   1. A gated target is EXCLUDED WITH A REASON and has NO score — it can never
 *      appear in a ranking, however good its other factors are.
 *   2. The score is ADDITIVE and its driver trail SUMS to it, so a rank is
 *      arithmetic anyone can check by hand.
 *   3. Confidence moves INDEPENDENTLY of the score in both directions — same
 *      score with different confidence, and same confidence with different score.
 *
 * `asOf` is pinned in every test that touches a deadline; nothing here depends on
 * the wall clock.
 */
import { describe, expect, it } from 'vitest';
import {
  assessTarget,
  confidenceBand,
  deriveAbilityToPay,
  deriveDeliveryComplexity,
  deriveExpectedMargin,
  deriveNeed,
  deriveUrgency,
  evaluateGates,
  rankTargets,
  COMPLEXITY_FLAG_WEIGHTS,
  FACTOR_LABELS,
  GATE_KEYS,
  TARGET_FACTOR_KEYS,
  WEIGHTS_V1,
  WEIGHTS_V1_BASIS,
  type GpsTarget,
} from './targeting.js';

/** Pinned "today". Every deadline in this file is relative to this instant. */
const ASOF = '2026-07-31T00:00:00.000Z';
const asOfMs = Date.parse(ASOF);
const inDays = (d: number): string => new Date(asOfMs + d * 86_400_000).toISOString();

/**
 * A target that passes every gate and has NO scoring evidence at all. Every
 * fixture below is this plus the specific evidence under test, so a test's
 * arithmetic is only ever about the fields it names.
 */
const BARE: GpsTarget = {
  id: 't-bare',
  name: 'Bare Passing Target',
  screening: 'clear',
  perimeter: 'in_perimeter',
  conflict: 'cleared',
  decisionMaker: { name: 'A. Sponsor', role: 'CFO', isBudgetHolder: true },
  demandsGuaranteedOutcome: false,
  materiallyMisleading: false,
  // The funding gate needs *some* evidence; the weakest possible rung so it
  // contributes almost nothing to ability-to-pay.
  capitalProxyCents: 10_000_000, // $100k — the floor of the proxy log range
};

const t = (over: Partial<GpsTarget>): GpsTarget => ({ ...BARE, ...over });

describe('hard gates', () => {
  it('a clean target fires no gates and is eligible', () => {
    expect(evaluateGates(BARE)).toEqual([]);
    expect(assessTarget(BARE, { asOf: ASOF }).eligible).toBe(true);
  });

  it('each of the seven gates fires with a reason, and every key is reachable', () => {
    const cases: Array<[string, Partial<GpsTarget>]> = [
      ['sanctions_concern', { screening: 'concern' }],
      ['materially_misleading', { materiallyMisleading: true }],
      ['demands_guaranteed_outcome', { demandsGuaranteedOutcome: true }],
      ['jurisdiction_outside_perimeter', { perimeter: 'outside_perimeter' }],
      ['unresolved_conflict', { conflict: 'unresolved' }],
      ['no_decision_maker', { decisionMaker: null }],
      ['no_budget_or_capital_proxy', { capitalProxyCents: null }],
    ];
    const fired = new Set<string>();
    for (const [key, over] of cases) {
      const hits = evaluateGates(t(over));
      expect(hits.map((h) => h.key)).toContain(key);
      const hit = hits.find((h) => h.key === key)!;
      // A reason, not a multiply-by-zero. This is the whole point of the gate layer.
      expect(hit.reason.length).toBeGreaterThan(20);
      expect(hit.reason).toMatch(/\.$/);
      fired.add(key);
    }
    expect([...fired].sort()).toEqual([...GATE_KEYS].sort());
  });

  it('distinguishes a declined conflict (walk away) from an unresolved one (do the check)', () => {
    const declined = evaluateGates(t({ conflict: 'declined' }))[0];
    const unresolved = evaluateGates(t({ conflict: 'unresolved' }))[0];
    expect(declined.key).toBe('unresolved_conflict');
    expect(declined.recoverable).toBe(false);
    expect(declined.remedy).toBeNull();
    expect(unresolved.recoverable).toBe(true);
    expect(unresolved.remedy).toMatch(/GpsConflictCheck/);
  });

  it('cleared_with_disclosure is a pass — it is the realistic common case', () => {
    expect(evaluateGates(t({ conflict: 'cleared_with_disclosure' }))).toEqual([]);
  });

  it('"not screened" does not gate, but a screening concern does', () => {
    // Not screened is missing data: it must degrade confidence, not exclude.
    expect(evaluateGates(t({ screening: 'not_screened' })).map((h) => h.key)).toEqual([]);
    expect(evaluateGates(t({ screening: 'concern' })).map((h) => h.key)).toEqual(['sanctions_concern']);
  });

  it('an unknown perimeter does not gate (that would exclude on missing data)', () => {
    const a = assessTarget(t({ perimeter: 'unknown' }), { asOf: ASOF });
    expect(a.eligible).toBe(true);
    // …it is charged to confidence instead.
    expect(a.confidence.penalties.map((p) => p.label)).toContain('Jurisdiction perimeter unrecorded');
  });

  it('returns ALL fired gates, so a two-problem target cannot look like a one-fix job', () => {
    const hits = evaluateGates(
      t({ screening: 'concern', demandsGuaranteedOutcome: true, decisionMaker: null }),
    );
    expect(hits.map((h) => h.key)).toEqual([
      'sanctions_concern',
      'demands_guaranteed_outcome',
      'no_decision_maker',
    ]);
    expect(hits.some((h) => !h.recoverable)).toBe(true);
  });

  it('accepts market cap or TVL as the funding gate\'s last-resort evidence, but never volume', () => {
    expect(evaluateGates(t({ capitalProxyCents: null, market: { marketCapUsd: 5_000_000 } }))).toEqual([]);
    expect(evaluateGates(t({ capitalProxyCents: null, market: { tvlUsd: 2_000_000 } }))).toEqual([]);
    // Volume is the field wash trading fabricates, and is not capital anyway.
    expect(
      evaluateGates(t({ capitalProxyCents: null, market: { volume24hUsd: 900_000_000 } })).map((h) => h.key),
    ).toEqual(['no_budget_or_capital_proxy']);
  });

  it('a zero or negative budget is not funding evidence', () => {
    expect(evaluateGates(t({ capitalProxyCents: 0, statedBudgetCents: 0 })).map((h) => h.key)).toEqual([
      'no_budget_or_capital_proxy',
    ]);
    expect(evaluateGates(t({ capitalProxyCents: null, statedBudgetCents: -1 })).map((h) => h.key)).toEqual([
      'no_budget_or_capital_proxy',
    ]);
  });
});

describe('a gated target is excluded, never ranked low', () => {
  it('has score === null and rawScore === null even when every factor is perfect', () => {
    const perfectButSanctioned = t({
      id: 't-sanctioned',
      name: 'Perfect But Sanctioned',
      screening: 'concern',
      identifiedNeeds: ['mica_whitepaper', 'gtm_sprint', 'marketing_activation'],
      statedBudgetCents: 5_000_000,
      introPath: 'direct_relationship',
      deadlineIso: inDays(14),
      deadlineKind: 'regulatory',
      quotedPriceCents: 2_000_000,
      expectedVendorCostCents: 400_000,
      complexity: {},
      evidence: { reliability: 'A', credibility: 1, ageDays: 0 },
    });
    const a = assessTarget(perfectButSanctioned, { asOf: ASOF });
    expect(a.eligible).toBe(false);
    expect(a.score).toBeNull();
    expect(a.rawScore).toBeNull();
    // The factors are still computed and shown — we exclude with reasons, not by
    // pretending we know nothing.
    expect(a.factors.need).toBe(1);
    expect(a.summary).toContain('EXCLUDED');
    expect(a.summary).toContain('sanctions/AML');
  });

  it('never appears in rankTargets().ranked, and is preserved in .excluded', () => {
    const strong = t({ id: 'ok', name: 'Eligible', identifiedNeeds: ['gtm_sprint'] });
    const gated = t({ id: 'bad', name: 'Gated', screening: 'concern', identifiedNeeds: ['gtm_sprint'] });
    const { ranked, excluded } = rankTargets([gated, strong], { asOf: ASOF });
    expect(ranked.map((r) => r.targetId)).toEqual(['ok']);
    expect(excluded.map((r) => r.targetId)).toEqual(['bad']);
    expect(excluded[0].gates[0].reason).toBeTruthy();
    // Nothing in ranked may carry a null score — the type and the sort agree.
    expect(ranked.every((r) => typeof r.score === 'number')).toBe(true);
  });
});

describe('factor derivation — need', () => {
  it('separates "never asked" (null) from "looked and found none" (0)', () => {
    expect(deriveNeed(t({ identifiedNeeds: undefined })).value).toBeNull();
    expect(deriveNeed(t({ identifiedNeeds: [] })).value).toBe(0);
    // The advisory is the difference a human acts on.
    expect(deriveNeed(t({ identifiedNeeds: undefined })).advisory).toMatch(/not been established/);
    expect(deriveNeed(t({ identifiedNeeds: [] })).advisory).toMatch(/finding, not missing data/);
  });

  it('one need is 0.6, and breadth adds 0.2 up to a cap of 1.0', () => {
    expect(deriveNeed(t({ identifiedNeeds: ['gtm_sprint'] })).value).toBeCloseTo(0.6, 10);
    expect(deriveNeed(t({ identifiedNeeds: ['gtm_sprint', 'mica_whitepaper'] })).value).toBeCloseTo(0.8, 10);
    expect(
      deriveNeed(t({ identifiedNeeds: ['gtm_sprint', 'mica_whitepaper', 'marketing_activation'] })).value,
    ).toBeCloseTo(1, 10);
    expect(
      deriveNeed(
        t({
          identifiedNeeds: [
            'gtm_sprint', 'mica_whitepaper', 'marketing_activation', 'legal_opinion_coordination', 'diagnostic',
          ],
        }),
      ).value,
    ).toBe(1);
  });

  it('de-duplicates and drops keys that are not catalogue offers', () => {
    expect(deriveNeed(t({ identifiedNeeds: ['gtm_sprint', 'gtm_sprint'] })).value).toBeCloseTo(0.6, 10);
    const bogus = deriveNeed(t({ identifiedNeeds: ['gtm_sprint', 'listing' as never] }));
    expect(bogus.value).toBeCloseTo(0.6, 10);
    expect(bogus.advisory).toMatch(/not offers in the catalogue/);
  });

  it('flags a scoped offer that the diagnosis does not support', () => {
    const o = deriveNeed(t({ identifiedNeeds: ['gtm_sprint'], offerKey: 'mica_whitepaper' }));
    expect(o.advisory).toMatch(/scope and the diagnosis disagree/);
  });
});

describe('factor derivation — ability to pay', () => {
  it('scores a stated budget against the $20k reference', () => {
    expect(deriveAbilityToPay(t({ statedBudgetCents: 2_000_000 })).value).toBe(1); // $20k = ref
    expect(deriveAbilityToPay(t({ statedBudgetCents: 5_000_000 })).value).toBe(1); // above ref saturates
    expect(deriveAbilityToPay(t({ statedBudgetCents: 1_100_000 })).value).toBeCloseTo(0.4, 10); // $11k
    expect(deriveAbilityToPay(t({ statedBudgetCents: 500_000 })).value).toBe(0); // $5k = the 0.25× floor
  });

  it('uses the diagnostic reference when the diagnostic is the scoped offer', () => {
    // $2,250 is a real budget for a $1.5–3k front door and a derisory one for a
    // $10–25k engagement. Same number, opposite verdicts.
    expect(deriveAbilityToPay(t({ offerKey: 'diagnostic', statedBudgetCents: 225_000 })).value).toBe(1);
    expect(deriveAbilityToPay(t({ offerKey: 'mica_whitepaper', statedBudgetCents: 225_000 })).value).toBe(0);
  });

  it('caps each weaker rung of the evidence ladder below the one above it', () => {
    const stated = deriveAbilityToPay(t({ statedBudgetCents: 100_000_000 })).value!;
    const proxy = deriveAbilityToPay(t({ capitalProxyCents: 100_000_000_000 })).value!;
    const market = deriveAbilityToPay(t({ capitalProxyCents: null, market: { marketCapUsd: 5e9 } })).value!;
    const washed = deriveAbilityToPay(
      t({ capitalProxyCents: null, market: { marketCapUsd: 5e9, washTradingFlag: true } }),
    ).value!;
    expect(stated).toBe(1);
    expect(proxy).toBeCloseTo(0.8, 10);
    expect(market).toBeCloseTo(0.6, 10);
    expect(washed).toBeCloseTo(0.3, 10);
    expect(stated).toBeGreaterThan(proxy);
    expect(proxy).toBeGreaterThan(market);
    expect(market).toBeGreaterThan(washed);
  });

  it('ignores 24h volume entirely, at any size', () => {
    const o = deriveAbilityToPay(t({ capitalProxyCents: null, market: { volume24hUsd: 9e9 } }));
    expect(o.value).toBeNull();
  });

  it('warns when the budget is under half the reference', () => {
    expect(deriveAbilityToPay(t({ statedBudgetCents: 900_000 })).advisory).toMatch(/under half/);
    expect(deriveAbilityToPay(t({ statedBudgetCents: 1_900_000 })).advisory).toBeNull();
  });
});

describe('factor derivation — urgency', () => {
  const u = (over: Partial<GpsTarget>) => deriveUrgency(t(over), asOfMs);

  it('is maximal inside 30 days and decays to 0.05 beyond a year', () => {
    expect(u({ deadlineIso: inDays(7) }).value).toBe(1);
    expect(u({ deadlineIso: inDays(30) }).value).toBe(1);
    expect(u({ deadlineIso: inDays(105) }).value).toBeCloseTo(0.625, 10);
    expect(u({ deadlineIso: inDays(180) }).value).toBeCloseTo(0.25, 10);
    expect(u({ deadlineIso: inDays(365) }).value).toBeCloseTo(0.05, 10);
    expect(u({ deadlineIso: inDays(900) }).value).toBeCloseTo(0.05, 10);
  });

  it('discounts soft deadlines and does NOT discount an unrecorded kind', () => {
    expect(u({ deadlineIso: inDays(7), deadlineKind: 'regulatory' }).value).toBeCloseTo(1, 10);
    expect(u({ deadlineIso: inDays(7), deadlineKind: 'commercial' }).value).toBeCloseTo(0.85, 10);
    expect(u({ deadlineIso: inDays(7), deadlineKind: 'self_imposed' }).value).toBeCloseTo(0.6, 10);
    const unknownKind = u({ deadlineIso: inDays(7) });
    expect(unknownKind.value).toBeCloseTo(1, 10);
    expect(unknownKind.advisory).toMatch(/kind not recorded/);
  });

  it('treats a past deadline as maximal and says a human must decide', () => {
    const past = u({ deadlineIso: inDays(-10) });
    expect(past.value).toBe(1);
    expect(past.advisory).toMatch(/passed 10 day/);
  });

  it('returns null — not 0 — for no deadline and for an unparseable one', () => {
    expect(u({ deadlineIso: null }).value).toBeNull();
    expect(u({ deadlineIso: 'next Q3ish' }).value).toBeNull();
    expect(u({ deadlineIso: 'next Q3ish' }).advisory).toMatch(/could not be parsed/);
  });
});

describe('factor derivation — expected margin', () => {
  it('maps gross margin 0%…70% onto 0…1', () => {
    expect(deriveExpectedMargin(t({ quotedPriceCents: 2_000_000, expectedVendorCostCents: 400_000 })).value).toBe(1);
    expect(
      deriveExpectedMargin(t({ quotedPriceCents: 2_000_000, expectedVendorCostCents: 700_000 })).value,
    ).toBeCloseTo(65 / 70, 10);
    expect(
      deriveExpectedMargin(t({ quotedPriceCents: 2_000_000, expectedVendorCostCents: 1_400_000 })).value,
    ).toBeCloseTo(30 / 70, 10);
  });

  it('scores a loss-making quote at 0 and names the vendor cost', () => {
    const o = deriveExpectedMargin(t({ quotedPriceCents: 1_000_000, expectedVendorCostCents: 1_200_000 }));
    expect(o.value).toBe(0);
    expect(o.advisory).toMatch(/loses money as scoped/);
    expect(o.advisory).toContain('$12,000');
  });

  it('warns that a thin margin has no room for an overrun', () => {
    const o = deriveExpectedMargin(t({ quotedPriceCents: 2_000_000, expectedVendorCostCents: 1_600_000 }));
    expect(o.advisory).toMatch(/no room for a scope overrun/);
  });

  it('is null — never a catalogue placeholder — when price or vendor cost is absent', () => {
    for (const over of [
      { quotedPriceCents: 2_000_000 },
      { expectedVendorCostCents: 700_000 },
      {},
    ] as Partial<GpsTarget>[]) {
      const o = deriveExpectedMargin(t({ offerKey: 'mica_whitepaper', ...over }));
      expect(o.value).toBeNull();
      expect(o.advisory).toMatch(/placeholders \(D4\/D5\)/);
    }
  });

  it('is null when the quoted price is zero, because margin is then undefined', () => {
    const o = deriveExpectedMargin(t({ quotedPriceCents: 0, expectedVendorCostCents: 100_000 }));
    expect(o.value).toBeNull();
    expect(o.advisory).toMatch(/zero or negative/);
  });
});

describe('factor derivation — delivery complexity', () => {
  it('sums named flag weights and caps at 1.0', () => {
    expect(deriveDeliveryComplexity(t({ complexity: {} })).value).toBe(0);
    expect(deriveDeliveryComplexity(t({ complexity: { scopeUndefined: true } })).value).toBeCloseTo(0.25, 10);
    expect(
      deriveDeliveryComplexity(t({ complexity: { noNamedPartner: true, scopeUndefined: true } })).value,
    ).toBeCloseTo(0.6, 10);
    const all = deriveDeliveryComplexity(
      t({
        complexity: {
          noNamedPartner: true, scopeUndefined: true, multiJurisdiction: true,
          translationRequired: true, clientSideDependencies: true,
        },
      }),
    );
    expect(all.value).toBe(1);
    expect(Object.values(COMPLEXITY_FLAG_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('applies NO penalty when complexity is unassessed, and says so out loud', () => {
    const o = deriveDeliveryComplexity(t({ complexity: undefined }));
    expect(o.value).toBeNull();
    expect(o.advisory).toMatch(/NO penalty was applied/);
  });

  it('names the unstaffable case explicitly — partners deliver', () => {
    expect(deriveDeliveryComplexity(t({ complexity: { noNamedPartner: true } })).advisory).toMatch(
      /cannot be staffed/,
    );
  });
});

/**
 * A fully-evidenced eligible target. Its score is checked by hand below, term by
 * term, so any change to a weight or a curve breaks a test with an explanation.
 */
const STRONG: GpsTarget = t({
  id: 't-strong',
  name: 'Strong Target',
  identifiedNeeds: ['mica_whitepaper', 'gtm_sprint'],
  offerKey: 'mica_whitepaper',
  statedBudgetCents: 2_000_000,
  introPath: 'direct_relationship',
  deadlineIso: inDays(60),
  deadlineKind: 'regulatory',
  quotedPriceCents: 2_000_000,
  expectedVendorCostCents: 700_000,
  complexity: { clientSideDependencies: true },
  evidence: { reliability: 'A', credibility: 1, ageDays: 0 },
});

describe('the additive score — arithmetic anyone can check by hand', () => {
  it('the five positive weights sum to exactly 100, so a point is a percentage point', () => {
    const positives = TARGET_FACTOR_KEYS.filter((k) => k !== 'deliveryComplexity');
    expect(positives.reduce((a, k) => a + WEIGHTS_V1[k], 0)).toBe(100);
    // The penalty is capped below the value terms on purpose (see WEIGHTS_V1).
    expect(WEIGHTS_V1.deliveryComplexity).toBeLessThan(WEIGHTS_V1.need);
  });

  it('scores STRONG at 90 = 24 + 25 + 19 + 15 + 9 − 2', () => {
    const a = assessTarget(STRONG, { asOf: ASOF });
    const points = Object.fromEntries(
      TARGET_FACTOR_KEYS.map((k) => [k, a.drivers.find((d) => d.label.startsWith(FACTOR_LABELS[k]))!.points]),
    );
    expect(points).toEqual({
      need: 24,                // 2 of 5 offers → 0.8 × 30
      abilityToPay: 25,        // $20k stated vs $20k reference → 1.0 × 25
      expectedMargin: 19,      // 65% of $20,000 → (65/70) × 20 = 18.57 → 19
      access: 15,              // direct relationship, budget holder → 1.0 × 15
      urgency: 9,              // 60d regulatory → 0.85 × 10 = 8.5 → 9
      deliveryComplexity: -2,  // client-side dependencies → 0.15 × −15 = −2.25 → −2
    });
    expect(a.rawScore).toBe(90);
    expect(a.score).toBe(90);
  });

  it('the drivers always sum exactly to rawScore, and there are always six of them', () => {
    for (const target of [STRONG, BARE, t({ identifiedNeeds: [], complexity: { scopeUndefined: true } })]) {
      const a = assessTarget(target, { asOf: ASOF });
      expect(a.drivers).toHaveLength(TARGET_FACTOR_KEYS.length);
      expect(a.drivers.reduce((s, d) => s + d.points, 0)).toBe(a.rawScore);
    }
  });

  it('orders drivers by absolute contribution with the zero-point ones last', () => {
    const a = assessTarget(t({ identifiedNeeds: ['gtm_sprint'], introPath: 'warm_referral' }), { asOf: ASOF });
    const nonZero = a.drivers.filter((d) => d.points !== 0);
    const zero = a.drivers.filter((d) => d.points === 0);
    expect(a.drivers.slice(0, nonZero.length)).toEqual(nonZero);
    expect(zero.length).toBeGreaterThan(0);

    // A zero-point driver is one of two different things, and the label says
    // which: an UNKNOWN factor, or an answered factor that is genuinely worth
    // nothing. Both contribute 0 points; only the first lowers confidence. This
    // is the distinction the mandate's multiply-by-zero destroyed.
    const unknown = zero.filter((d) => d.label.includes('unknown'));
    const answeredZero = zero.filter((d) => !d.label.includes('unknown'));
    expect(unknown.some((d) => d.label.startsWith(FACTOR_LABELS.expectedMargin))).toBe(true);
    // A $100k capital proxy sits on the floor of the log range: answered, worth 0.
    expect(answeredZero.some((d) => d.label.startsWith(FACTOR_LABELS.abilityToPay))).toBe(true);
    expect(a.confidence.missingFactors).toContain('expectedMargin');
    expect(a.confidence.missingFactors).not.toContain('abilityToPay');
  });

  it('clamps a net-negative target to 0 while keeping the raw sum auditable', () => {
    const hopeless = t({
      id: 't-hopeless',
      name: 'Hopeless But Eligible',
      identifiedNeeds: [],
      statedBudgetCents: 100_000, // $1k — passes the funding gate, scores nothing
      capitalProxyCents: null,
      introPath: null,
      deadlineIso: null,
      quotedPriceCents: 1_000_000,
      expectedVendorCostCents: 1_500_000,
      complexity: {
        noNamedPartner: true, scopeUndefined: true, multiJurisdiction: true,
        translationRequired: true, clientSideDependencies: true,
      },
    });
    const a = assessTarget(hopeless, { asOf: ASOF });
    // Eligible, not excluded: a target that cannot pay is a bad score, not a gate.
    expect(a.eligible).toBe(true);
    expect(a.rawScore).toBe(-15);
    expect(a.score).toBe(0);
  });

  it('rejects unusable weights loudly rather than degrading silently', () => {
    expect(() => assessTarget(STRONG, { asOf: ASOF, weights: { ...WEIGHTS_V1, need: -1 } })).toThrow(/need/);
    expect(() => assessTarget(STRONG, { asOf: ASOF, weights: { ...WEIGHTS_V1, access: NaN } })).toThrow(/access/);
  });

  it('honours overridden weights, so a quarterly review can be tried out', () => {
    // Zero the urgency term: STRONG loses exactly its 9 urgency points.
    const a = assessTarget(STRONG, { asOf: ASOF, weights: { ...WEIGHTS_V1, urgency: 0 } });
    expect(a.score).toBe(81);
  });

  it('rejects an unparseable asOf instead of silently using now', () => {
    expect(() => assessTarget(STRONG, { asOf: 'whenever' })).toThrow(/asOf/);
  });
});

describe('missing data degrades honestly — zero points, never a midpoint', () => {
  it('drops exactly the missing factor\'s points and never substitutes 0.5', () => {
    const withMargin = assessTarget(STRONG, { asOf: ASOF });
    const noMargin = assessTarget(
      t({ ...STRONG, quotedPriceCents: null, expectedVendorCostCents: null }),
      { asOf: ASOF },
    );
    expect(withMargin.score).toBe(90);
    expect(noMargin.score).toBe(71); // 90 − 19, the margin term removed entirely
    // A 0.5 default would have produced 90 − 19 + 10 = 81. It must not.
    expect(noMargin.score).not.toBe(81);
    expect(noMargin.factors.expectedMargin).toBeNull();
  });

  it('labels an unknown factor as unknown in the trail, at zero points', () => {
    const a = assessTarget(t({ ...STRONG, introPath: null }), { asOf: ASOF });
    const access = a.drivers.find((d) => d.label.startsWith(FACTOR_LABELS.access))!;
    expect(access.points).toBe(0);
    expect(access.label).toBe('Access to the decision maker — unknown (0 of 15)');
  });

  it('every missing factor also lowers confidence and is named for follow-up', () => {
    const bare = assessTarget(
      t({ ...BARE, evidence: { reliability: 'A', credibility: 1, ageDays: 0 } }),
      { asOf: ASOF },
    );
    const full = assessTarget(STRONG, { asOf: ASOF });
    expect(bare.confidence.completeness).toBeLessThan(full.confidence.completeness);
    expect(bare.confidence.confidence).toBeLessThan(full.confidence.confidence);
    expect(bare.confidence.missingFactors.sort()).toEqual(
      ['access', 'deliveryComplexity', 'expectedMargin', 'need', 'urgency'].sort(),
    );
    expect(full.confidence.missingFactors).toEqual([]);
  });
});

describe('confidence moves independently of the score', () => {
  it('same score, different confidence — evidence quality cannot move a rank', () => {
    const good = assessTarget(t({ ...STRONG, evidence: { reliability: 'A', credibility: 1, ageDays: 0 } }), { asOf: ASOF });
    const poor = assessTarget(t({ ...STRONG, evidence: { reliability: 'D', credibility: 5, ageDays: 0 } }), { asOf: ASOF });
    expect(good.score).toBe(poor.score);
    expect(good.confidence.confidence).toBe(100);
    expect(poor.confidence.confidence).toBe(55); // sqrt(0.30 × 1.0) × 100
    expect(good.confidence.admiralty).toBe('A1');
    expect(poor.confidence.admiralty).toBe('D5');
  });

  it('same confidence, different score — a weaker budget cannot look like weaker evidence', () => {
    const rich = assessTarget(STRONG, { asOf: ASOF });
    const poorer = assessTarget(t({ ...STRONG, statedBudgetCents: 1_100_000 }), { asOf: ASOF });
    expect(poorer.score).toBe(75); // 90 − 25 + 10 ($11k → 0.4 × 25)
    expect(poorer.confidence).toEqual(rich.confidence);
  });

  it('decays with evidence age and charges an unrecorded age', () => {
    const fresh = assessTarget(t({ ...STRONG, evidence: { reliability: 'A', credibility: 1, ageDays: 0 } }), { asOf: ASOF });
    const halfLife = assessTarget(t({ ...STRONG, evidence: { reliability: 'A', credibility: 1, ageDays: 45 } }), { asOf: ASOF });
    const old = assessTarget(t({ ...STRONG, evidence: { reliability: 'A', credibility: 1, ageDays: 90 } }), { asOf: ASOF });
    const undated = assessTarget(t({ ...STRONG, evidence: { reliability: 'A', credibility: 1 } }), { asOf: ASOF });
    expect([fresh, halfLife, old, undated].map((a) => a.score)).toEqual([90, 90, 90, 90]);
    expect(fresh.confidence.gradeConfidence).toBe(100);
    expect(halfLife.confidence.gradeConfidence).toBe(50); // one 45-day half-life
    expect(old.confidence.gradeConfidence).toBe(25);
    expect(halfLife.confidence.confidence).toBe(71); // sqrt(0.5) × 100
    expect(undated.confidence.confidence).toBe(90); // 100 − 10 for the unrecorded age
    expect(undated.confidence.penalties.map((p) => p.label)).toEqual(['Evidence age not recorded']);
  });

  it('no recorded evidence at all is confidence 0, however complete the fields', () => {
    const a = assessTarget(t({ ...STRONG, evidence: null }), { asOf: ASOF });
    expect(a.score).toBe(90); // the score is unaffected — that is the orthogonality
    expect(a.confidence.completeness).toBe(1);
    expect(a.confidence.gradeConfidence).toBe(0); // graded F6: reliability unknown
    expect(a.confidence.confidence).toBe(0);
    expect(a.confidence.admiralty).toBeNull();
    expect(a.confidence.band).toBe('low');
  });

  it('charges suspected wash trading to confidence, not to the score directly', () => {
    const base = t({ ...STRONG, evidence: { reliability: 'A', credibility: 1, ageDays: 0 } });
    const clean = assessTarget(base, { asOf: ASOF });
    const washed = assessTarget(
      t({ ...base, market: { marketCapUsd: 5e8, washTradingFlag: true } }),
      { asOf: ASOF },
    );
    // STRONG pays from a stated budget, so the market fields never reach the score.
    expect(washed.score).toBe(clean.score);
    expect(washed.confidence.confidence).toBe(clean.confidence.confidence - 15);
  });

  it('bands at 65 and 40', () => {
    expect(confidenceBand(100)).toBe('high');
    expect(confidenceBand(65)).toBe('high');
    expect(confidenceBand(64)).toBe('medium');
    expect(confidenceBand(40)).toBe('medium');
    expect(confidenceBand(39)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });

  it('cannot be gamed: nothing that weakens a protection raises the score', () => {
    const baseline = assessTarget(STRONG, { asOf: ASOF }).score!;
    // Adding complexity only ever subtracts.
    expect(
      assessTarget(t({ ...STRONG, complexity: { noNamedPartner: true, clientSideDependencies: true } }), { asOf: ASOF })
        .score!,
    ).toBeLessThan(baseline);
    // Deleting the evidence grade — the mandate's cheapest exploit, because
    // EvidenceConfidence was a multiplicand — moves the score not at all.
    expect(assessTarget(t({ ...STRONG, evidence: null }), { asOf: ASOF }).score!).toBe(baseline);
    // And a target that demands a guarantee is excluded, not re-scored.
    const demanding = assessTarget(t({ ...STRONG, demandsGuaranteedOutcome: true }), { asOf: ASOF });
    expect(demanding.score).toBeNull();
  });

  it('states plainly that the weights are a prior and not learned', () => {
    expect(WEIGHTS_V1_BASIS.learnedFromOutcomes).toBe(false);
    expect(WEIGHTS_V1_BASIS.reviewCadence).toBe('quarterly');
    expect(WEIGHTS_V1_BASIS.annualOutcomeVolume).toBe(29);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  WORKED EXAMPLES — three contrasting targets, full output asserted.
 *
 *  These exist so a reader can see what the module SAYS, not just that it
 *  arithmetics correctly. Each one is a shape the founder actually meets.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 1. A strong pre-TGE project: real deadline, stated budget, warm referral. */
const PRE_TGE: GpsTarget = {
  id: 'gps-pretge',
  name: 'Helvetia Protocol',
  screening: 'clear',
  perimeter: 'in_perimeter',
  jurisdiction: 'Liechtenstein',
  conflict: 'cleared_with_disclosure', // the realistic common case for an LCX employee
  decisionMaker: { name: 'M. Brunner', role: 'Founder & CEO', isBudgetHolder: true },
  demandsGuaranteedOutcome: false,
  materiallyMisleading: false,
  identifiedNeeds: ['mica_whitepaper', 'legal_opinion_coordination', 'gtm_sprint'],
  offerKey: 'mica_whitepaper',
  statedBudgetCents: 2_500_000, // $25k
  introPath: 'warm_referral',
  deadlineIso: inDays(75),
  deadlineKind: 'regulatory',
  quotedPriceCents: 2_200_000, // $22k
  expectedVendorCostCents: 900_000, // $9k to counsel/specialist
  complexity: { clientSideDependencies: true },
  evidence: { reliability: 'B', credibility: 2, ageDays: 10 },
};

/**
 * 2. An ALREADY-LISTED project with a documentation gap. The case that
 *    `alpha.ts` gets backwards: `listingPropensity` would subtract 40 points for
 *    `listedOnLcx` (`alpha.ts:109`) and `winnability` another 50 (`alpha.ts:200`).
 *    Here it is simply a client — with weak evidence, which is what actually
 *    holds it back.
 */
const LISTED_GAP: GpsTarget = {
  id: 'gps-listed',
  name: 'Alpine Yield DAO',
  screening: 'clear',
  perimeter: 'in_perimeter',
  jurisdiction: 'Switzerland',
  conflict: 'cleared',
  decisionMaker: { name: 'S. Frick', role: 'Head of BD', isBudgetHolder: false },
  demandsGuaranteedOutcome: false,
  materiallyMisleading: false,
  identifiedNeeds: ['mica_whitepaper'],
  offerKey: 'mica_whitepaper',
  statedBudgetCents: null,
  capitalProxyCents: null,
  market: { marketCapUsd: 120_000_000, tvlUsd: 40_000_000, listedOnLcx: true, dataConfidence: 70 },
  introPath: 'warm_referral',
  deadlineIso: null,
  quotedPriceCents: null,
  expectedVendorCostCents: null,
  complexity: { scopeUndefined: true, clientSideDependencies: true },
  evidence: { reliability: 'A', credibility: 2, ageDays: 30 },
};

/** 3. A sanctioned entity that would otherwise have scored very well. */
const SANCTIONED: GpsTarget = {
  id: 'gps-sanctioned',
  name: 'Obsidian Bridge Ltd',
  screening: 'concern',
  perimeter: 'unknown',
  jurisdiction: 'undisclosed',
  conflict: 'unresolved',
  decisionMaker: null,
  demandsGuaranteedOutcome: true,
  materiallyMisleading: false,
  identifiedNeeds: ['mica_whitepaper', 'gtm_sprint'],
  statedBudgetCents: 4_000_000, // $40k — twice the reference, and irrelevant
  introPath: 'direct_relationship',
  deadlineIso: inDays(20),
  deadlineKind: 'regulatory',
  complexity: {},
  evidence: { reliability: 'C', credibility: 3, ageDays: 5 },
};

describe('worked example 1 — a strong pre-TGE project', () => {
  const a = assessTarget(PRE_TGE, { asOf: ASOF });

  it('is eligible with no gates', () => {
    expect(a.gates).toEqual([]);
    expect(a.eligible).toBe(true);
  });

  it('scores 89/100 with a complete driver trail', () => {
    expect(a.factors).toEqual({
      need: 1,                       // three of five offers
      abilityToPay: 1,               // $25k stated against a $20k reference
      expectedMargin: 59 / 70,       // $22k − $9k = 59% gross
      access: 0.7,                   // warm referral to the budget holder
      urgency: 0.775,                // 75 days to a regulatory deadline
      deliveryComplexity: 0.15,      // client-side inputs only
    });
    expect(a.drivers.map((d) => d.points)).toEqual([30, 25, 17, 11, 8, -2]);
    expect(a.rawScore).toBe(89);
    expect(a.score).toBe(89);
  });

  it('reports confidence of 83 (high) BESIDE the score, from a B2 grade 10 days old', () => {
    expect(a.confidence.admiralty).toBe('B2');
    expect(a.confidence.gradeConfidence).toBe(69); // 0.80 × 0.80, decayed 10/45 days
    expect(a.confidence.completeness).toBe(1);
    expect(a.confidence.confidence).toBe(83); // sqrt(0.69 × 1.00) × 100
    expect(a.confidence.band).toBe('high');
    expect(a.confidence.penalties).toEqual([]);
  });

  it('explains itself in one sentence', () => {
    expect(a.summary).toBe(
      'Helvetia Protocol: 89/100 led by Identified need — 3 of 5 offers (30 of 30); held back by ' +
        'Delivery complexity — clientSideDependencies (-2 of −15) — confidence 83/100 (high).',
    );
  });
});

describe('worked example 2 — a listed project with a documentation gap', () => {
  const a = assessTarget(LISTED_GAP, { asOf: ASOF });

  it('is NOT penalised for already being listed — the alpha.ts inversion is absent', () => {
    const unlisted = assessTarget(
      { ...LISTED_GAP, market: { ...LISTED_GAP.market, listedOnLcx: false } },
      { asOf: ASOF },
    );
    expect(a.score).toBe(unlisted.score);
    expect(a.confidence.confidence).toBe(unlisted.confidence.confidence);
  });

  it('scores 30/100 — held back by evidence gaps, not by the client\'s quality', () => {
    expect(a.factors.need).toBeCloseTo(0.6, 10);
    expect(a.factors.abilityToPay).toBeCloseTo(0.4158, 3); // $120m mcap proxy, capped at 0.60
    expect(a.factors.expectedMargin).toBeNull(); // no quote yet, and no placeholder substituted
    expect(a.factors.urgency).toBeNull(); // nothing forcing a decision
    expect(a.factors.access).toBeCloseTo(0.56, 10); // warm referral × not the budget holder
    expect(a.factors.deliveryComplexity).toBeCloseTo(0.4, 10);
    expect(a.rawScore).toBe(30); // 18 + 10 + 0 + 8 + 0 − 6
    expect(a.score).toBe(30);
  });

  it('bands medium on confidence and names exactly what to go and get', () => {
    expect(a.confidence.admiralty).toBe('A2');
    expect(a.confidence.completeness).toBeCloseTo(0.67, 2); // 4 of 6 factors
    expect(a.confidence.confidence).toBe(62);
    expect(a.confidence.band).toBe('medium');
    expect(a.confidence.missingFactors.sort()).toEqual(['expectedMargin', 'urgency']);
  });

  it('carries the advisories a human needs before calling', () => {
    expect(a.advisories).toContain('Ability to pay is inferred from market size only — the weakest rung of the ladder.');
    expect(a.advisories.some((x) => /placeholders \(D4\/D5\)/.test(x))).toBe(true);
    expect(a.advisories.some((x) => /No deadline recorded/.test(x))).toBe(true);
    expect(a.advisories.some((x) => /controls the budget is unrecorded/.test(x))).toBe(false);
  });
});

describe('worked example 3 — a sanctioned entity', () => {
  const a = assessTarget(SANCTIONED, { asOf: ASOF });

  it('is excluded with four reasons and no score at all', () => {
    expect(a.eligible).toBe(false);
    expect(a.score).toBeNull();
    expect(a.rawScore).toBeNull();
    expect(a.gates.map((g) => g.key)).toEqual([
      'sanctions_concern',
      'demands_guaranteed_outcome',
      'unresolved_conflict',
      'no_decision_maker',
    ]);
  });

  it('marks the sanctions hit as a walk-away and the rest as work', () => {
    const byKey = Object.fromEntries(a.gates.map((g) => [g.key, g]));
    expect(byKey.sanctions_concern.recoverable).toBe(false);
    expect(byKey.sanctions_concern.remedy).toBeNull();
    expect(byKey.unresolved_conflict.recoverable).toBe(true);
    expect(byKey.no_decision_maker.recoverable).toBe(true);
  });

  it('would have scored well, which is exactly why the gates run first', () => {
    // Same target with the compliance problems removed:
    //   need 24 (2 offers) + pay 25 ($40k) + margin 0 (no quote) + access 15
    //   + urgency 10 (20d regulatory) − complexity 0 = 74.
    const cleaned = assessTarget(
      {
        ...SANCTIONED,
        screening: 'clear',
        perimeter: 'in_perimeter',
        conflict: 'cleared',
        demandsGuaranteedOutcome: false,
        decisionMaker: { name: 'R. Vance', role: 'COO', isBudgetHolder: true },
      },
      { asOf: ASOF },
    );
    expect(cleaned.score).toBe(74);
    // A high-scoring target and an excluded one are the SAME target. The
    // mandate's formula would have ranked it by a small product and a penalty.
    expect(a.score).toBeNull();
  });

  it('says so in one sentence, with the gate count', () => {
    expect(a.summary).toBe(
      'Obsidian Bridge Ltd: EXCLUDED — A sanctions/AML screen returned a concern. ' +
        'No work may be scoped, quoted or discussed until compliance clears it. (+3 more gates)',
    );
  });
});

describe('ranking the three worked examples together', () => {
  const { ranked, excluded, weightsVersion } = rankTargets([SANCTIONED, LISTED_GAP, PRE_TGE], { asOf: ASOF });

  it('ranks by score, excludes the gated one, and reports the weights version', () => {
    expect(ranked.map((r) => [r.name, r.score])).toEqual([
      ['Helvetia Protocol', 89],
      ['Alpine Yield DAO', 30],
    ]);
    expect(excluded.map((r) => r.name)).toEqual(['Obsidian Bridge Ltd']);
    expect(weightsVersion).toBe('v1');
  });

  it('bands by confidence without reordering by it', () => {
    expect(ranked.map((r) => r.confidence.band)).toEqual(['high', 'medium']);
    // Give the weaker target perfect evidence. Its confidence jumps 62 → 82 and
    // its band medium → high, and its RANK does not move at all: it is still a
    // 30/100 target, now a well-evidenced one. (82 rather than 100 because two of
    // the six factors are still unknown — completeness is part of confidence.)
    const { ranked: r2 } = rankTargets(
      [{ ...LISTED_GAP, evidence: { reliability: 'A', credibility: 1, ageDays: 0 } }, PRE_TGE],
      { asOf: ASOF },
    );
    expect(r2.map((r) => r.name)).toEqual(['Helvetia Protocol', 'Alpine Yield DAO']);
    expect(r2[1].score).toBe(30);
    expect(r2[1].confidence.confidence).toBe(82);
    expect(r2[1].confidence.band).toBe('high');
  });

  it('breaks a score tie by confidence, then by name — deterministically', () => {
    const lowConf = { ...PRE_TGE, id: 'a', name: 'Aaa Corp', evidence: { reliability: 'D' as const, credibility: 4 as const, ageDays: 0 } };
    const highConf = { ...PRE_TGE, id: 'z', name: 'Zzz Corp', evidence: { reliability: 'A' as const, credibility: 1 as const, ageDays: 0 } };
    const { ranked: r } = rankTargets([lowConf, highConf], { asOf: ASOF });
    expect(r.map((x) => x.score)).toEqual([89, 89]);
    expect(r.map((x) => x.name)).toEqual(['Zzz Corp', 'Aaa Corp']);
  });
});

describe('an unperformed sanctions screen is a confidence problem, not a gate', () => {
  it('costs 20 confidence points and leaves the score untouched', () => {
    const screened = assessTarget(STRONG, { asOf: ASOF });
    const not = assessTarget(t({ ...STRONG, screening: 'not_screened' }), { asOf: ASOF });
    expect(not.eligible).toBe(true); // excluding on a missing check is the old defect
    expect(not.score).toBe(screened.score);
    expect(not.confidence.penalties.map((p) => p.label)).toEqual(['Sanctions/AML screen not performed']);
    expect(not.confidence.confidence).toBe(screened.confidence.confidence - 20);
  });

  it('is the heaviest of the confidence penalties', () => {
    const worst = assessTarget(
      t({
        ...STRONG,
        screening: 'not_screened',
        perimeter: 'unknown',
        market: { marketCapUsd: 1e8, washTradingFlag: true },
        evidence: { reliability: 'A', credibility: 1 },
      }),
      { asOf: ASOF },
    );
    expect(worst.confidence.penalties.map((p) => p.points)).toEqual([-20, -10, -10, -15]);
    expect(worst.confidence.confidence).toBe(45); // 100 − 55
    expect(worst.score).toBe(90); // …and every point of that is untouched
  });
});

describe('the module claims nothing it cannot do', () => {
  it('is deterministic for the same inputs and does not mutate them', () => {
    const before = JSON.stringify(PRE_TGE);
    const a = assessTarget(PRE_TGE, { asOf: ASOF });
    const b = assessTarget(PRE_TGE, { asOf: ASOF });
    expect(JSON.stringify(PRE_TGE)).toBe(before);
    expect(a).toEqual(b);
  });

  it('handles NaN and Infinity as "unknown" rather than as numbers', () => {
    const nonsense = t({
      ...STRONG,
      statedBudgetCents: Number.NaN,
      capitalProxyCents: Number.POSITIVE_INFINITY,
    });
    // At the factor level: no usable number, so no points and nothing invented.
    expect(deriveAbilityToPay(nonsense).value).toBeNull();
    // At the gate level: non-finite is the absence of evidence that it is, so the
    // funding gate fires and the target is excluded with a reason rather than
    // ranked on a NaN.
    const a = assessTarget(nonsense, { asOf: ASOF });
    expect(a.eligible).toBe(false);
    expect(a.gates.map((g) => g.key)).toEqual(['no_budget_or_capital_proxy']);
    expect(a.score).toBeNull();
    // Supply a real budget and the arithmetic is exactly STRONG's again — the
    // Infinity still sitting in capitalProxyCents never reaches the score.
    const fixed = assessTarget(t({ ...nonsense, statedBudgetCents: 2_000_000 }), { asOf: ASOF });
    expect(fixed.score).toBe(90);
    expect(Number.isInteger(fixed.rawScore)).toBe(true);
  });
});
