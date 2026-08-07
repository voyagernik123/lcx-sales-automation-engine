import { describe, expect, it } from 'vitest';
import { OFFER_KEYS, type OfferKey } from './types.js';
import {
  FLOOR_EFFORT_POINTS,
  FLOOR_REFUSAL_CODES,
  PARTNER_ASSERTION_IS_A_CLAIM,
  PARTNER_BENCH,
  benchHeadroom,
  canAcceptEngagement,
  capabilityCoversJurisdiction,
  headroomFor,
  inputEmpty,
  inputLoaded,
  inputNotLoaded,
  inputWithheld,
  isAssertedPartner,
  isPriceFloor,
  marginAtRisk,
  meetsSeniority,
  partnerAssertionDefects,
  partnerScorecard,
  priceFloor,
  rateCardCostCents,
  rateCardStatus,
  type ActiveEngagementRef,
  type FloorEffortInput,
  type FloorRefusalCode,
  type Partner,
  type PartnerAssertion,
  type PartnerCapability,
  type PriceFloorOutcome,
  type PriceFloorRequest,
  type RateCard,
  type RecordedOutcome,
  type Seniority,
} from './partners.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const cap = (
  offerKey: OfferKey,
  seniority: Seniority = 'senior',
  jurisdictions: readonly string[] = [],
): PartnerCapability => ({ offerKey, seniority, jurisdictions, evidence: null });

const card = (
  offerKey: OfferKey,
  unit: RateCard['unit'],
  amountCents: number,
  expectedUnits: number | null = null,
  validUntil: string | null = '2027-01-01T00:00:00Z',
): RateCard => ({
  offerKey,
  unit,
  amountCents,
  expectedUnits,
  currency: 'USD',
  validUntil,
  statedBy: 'nikhil',
  statedAt: '2026-07-01T00:00:00Z',
});

/**
 * The attribution the owner's 2026-08-07 decision requires on every bench member.
 * A fixture, not a default: `partnerAssertionDefects` is what decides whether a real
 * one is well-formed, and the tests below hand it broken ones on purpose.
 */
const assertion = (over: Partial<PartnerAssertion> = {}): PartnerAssertion => ({
  assertedBy: 'nikhil.sharma@lcx.com',
  assertedAt: '2026-08-07T09:00:00.000Z',
  basis: 'Delivered two MiCA papers with us in 2025; rate confirmed by email 6 Aug.',
  ...over,
});

function mkPartner(id: string, name: string, over: Partial<Partner> = {}): Partner {
  return {
    id,
    name,
    assertion: assertion(),
    active: true,
    capabilities: [cap('mica_whitepaper')],
    rateCards: [card('mica_whitepaper', 'fixed', 600_000)],
    capacity: { maxConcurrent: 2, statedBy: 'nikhil', statedAt: '2026-07-01T00:00:00Z', unavailableUntil: null },
    notes: null,
    ...over,
  };
}

const NOW = '2026-07-31T00:00:00Z';

const engagement = (offerKey: OfferKey, partnerId: string | null, id = `e_${offerKey}_${partnerId}`): ActiveEngagementRef => ({
  engagementId: id,
  offerKey,
  partnerId,
});

/* ── Rate cards ─────────────────────────────────────────────────────────── */

describe('rate card', () => {
  it('derives engagement cost per unit type', () => {
    expect(rateCardCostCents(card('mica_whitepaper', 'fixed', 600_000))).toBe(600_000);
    // $1,500/day × 5 days = $7,500
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 150_000, 5))).toBe(750_000);
    // $250/hour × 120 hours = $30,000
    expect(rateCardCostCents(card('marketing_activation', 'hourly', 25_000, 120))).toBe(3_000_000);
  });

  it('returns null — never 1 unit, never 0 — when a metered card has no unit count', () => {
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 150_000, null))).toBeNull();
    expect(rateCardCostCents(card('gtm_sprint', 'hourly', 25_000, 0))).toBeNull();
  });

  // A 0c rate card is an unfilled form. Pricing it literally reports cost 0 —
  // i.e. 100% margin on a partner working for nothing — which is the single most
  // expensive lie this file could tell a proposal.
  it('REFUSES a zero or negative amount on every unit type — 0 is not free', () => {
    expect(rateCardCostCents(card('mica_whitepaper', 'fixed', 0))).toBeNull();
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 0, 5))).toBeNull();
    expect(rateCardCostCents(card('marketing_activation', 'hourly', 0, 120))).toBeNull();
    expect(rateCardCostCents(card('mica_whitepaper', 'fixed', -1))).toBeNull();
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', -150_000, 5))).toBeNull();
    // Rounds to zero rather than being written as zero — same refusal.
    expect(rateCardCostCents(card('mica_whitepaper', 'fixed', 0.4))).toBeNull();
  });

  // THE SINGLE-UNIT CONTRACT `underwrite.ts:443` NOW STANDS ON. Its metered branch
  // asks this function what ONE unit costs, because effort there is a triple and
  // not a unit count, and refuses when the answer is null. It previously tested
  // `amountCents <= 0` itself and so skipped the round-to-zero guard entirely,
  // quoting a 0.0001c/day card at 100% margin. Loosening either assertion below
  // reopens that hole, which is why they are pinned here and not only there.
  it('prices ONE unit in whole cents, or refuses — the contract the metered underwriting branch uses', () => {
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 0.0001, 1))).toBeNull();
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 0.4, 1))).toBeNull();
    expect(rateCardCostCents(card('marketing_activation', 'hourly', 0.0001, 1))).toBeNull();
    // Non-null answers are integers, so the derived rate is whole cents and the
    // caller never multiplies a fraction through a distribution.
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 0.6, 1))).toBe(1);
    expect(rateCardCostCents(card('gtm_sprint', 'day_rate', 150_000, 1))).toBe(150_000);
  });

  it('degrades a zero-amount card to cost_not_derivable rather than margin_intact', () => {
    const r = marginAtRisk(
      { offerKey: 'mica_whitepaper', priceCents: 1_800_000, quotedVendorCostCents: 600_000, currency: 'USD' },
      mkPartner('p_free', 'Free', { rateCards: [card('mica_whitepaper', 'fixed', 0)] }),
      { asOf: NOW },
    );
    // Before the fix: verdict 'margin_intact', rateCardCostCents 0,
    // impliedMarginPct 100, reasons "Quote is conservative".
    expect(r.verdict).toBe('cost_not_derivable');
    expect(r.rateCardCostCents).toBeNull();
    expect(r.impliedMarginPct).toBeNull();
    expect(r.atRiskCents).toBeNull();
  });

  it('treats a missing validity date as unusable, not as valid forever', () => {
    expect(rateCardStatus(card('mica_whitepaper', 'fixed', 600_000, null, null), NOW)).toBe('no_validity_stated');
    expect(rateCardStatus(card('mica_whitepaper', 'fixed', 600_000, null, 'not-a-date'), NOW)).toBe('no_validity_stated');
  });

  it('expires on the stated date', () => {
    const c = card('mica_whitepaper', 'fixed', 600_000, null, '2026-07-31T00:00:00Z');
    expect(rateCardStatus(c, '2026-07-30T00:00:00Z')).toBe('usable');
    expect(rateCardStatus(c, '2026-07-31T00:00:00Z')).toBe('usable'); // inclusive
    expect(rateCardStatus(c, '2026-08-01T00:00:00Z')).toBe('expired');
  });
});

/* ── Jurisdiction: entered, never inferred ──────────────────────────────── */

describe('jurisdiction matching', () => {
  it('matches on trimmed, case-insensitive equality', () => {
    const c = cap('mica_whitepaper', 'senior', ['Liechtenstein', ' Germany ']);
    expect(capabilityCoversJurisdiction(c, 'liechtenstein')).toBe(true);
    expect(capabilityCoversJurisdiction(c, 'GERMANY')).toBe(true);
  });

  it('never infers containment: "EU" does not cover Liechtenstein, "DE" does not cover Germany', () => {
    const c = cap('mica_whitepaper', 'senior', ['EU', 'DE']);
    expect(capabilityCoversJurisdiction(c, 'Liechtenstein')).toBe(false);
    expect(capabilityCoversJurisdiction(c, 'Germany')).toBe(false);
  });

  it('empty coverage covers nothing, and an unstated requirement is not a refusal', () => {
    const c = cap('gtm_sprint', 'senior', []);
    expect(capabilityCoversJurisdiction(c, 'Germany')).toBe(false);
    expect(capabilityCoversJurisdiction(c, null)).toBe(true);
    expect(capabilityCoversJurisdiction(c, '  ')).toBe(true);
  });
});

describe('seniority', () => {
  it('orders associate < senior < principal', () => {
    expect(meetsSeniority('principal', 'senior')).toBe(true);
    expect(meetsSeniority('senior', 'senior')).toBe(true);
    expect(meetsSeniority('associate', 'senior')).toBe(false);
  });
});

/* ── Bench headroom arithmetic ──────────────────────────────────────────── */

describe('benchHeadroom', () => {
  it('the real bench today is empty: every offer is blocked, with that reason', () => {
    const b = benchHeadroom(OFFER_KEYS, PARTNER_BENCH, []);
    expect(PARTNER_BENCH).toHaveLength(0);
    expect(b.perOffer).toHaveLength(OFFER_KEYS.length);
    expect(b.perOffer.every((o) => o.headroom === 0 && o.blocked)).toBe(true);
    expect(b.totalSpareSlots).toBe(0);
    expect(headroomFor(b, 'mica_whitepaper')?.reasons[0].label).toBe(
      'No partner on the bench can deliver mica_whitepaper',
    );
  });

  it('sums spare slots across capable partners, counting active work on ANY offer', () => {
    // Anna: cap 2, can do white papers AND GTM. Ben: cap 1, white papers only.
    const anna = mkPartner('p_anna', 'Anna', {
      capabilities: [cap('mica_whitepaper'), cap('gtm_sprint')],
      rateCards: [card('mica_whitepaper', 'fixed', 600_000), card('gtm_sprint', 'day_rate', 150_000, 5)],
      capacity: { maxConcurrent: 2, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: null },
    });
    const ben = mkPartner('p_ben', 'Ben', {
      capacity: { maxConcurrent: 1, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: null },
    });
    // Anna already runs one GTM sprint — which eats a slot she could have used
    // for a white paper, because the cap is on the human.
    const active = [engagement('gtm_sprint', 'p_anna')];

    const b = benchHeadroom(['mica_whitepaper', 'gtm_sprint'], [anna, ben], active, { asOf: NOW });
    const wp = headroomFor(b, 'mica_whitepaper')!;
    const gtm = headroomFor(b, 'gtm_sprint')!;

    expect(wp.headroom).toBe(2); // Anna (2−1=1) + Ben (1−0=1)
    expect(gtm.headroom).toBe(1); // Anna only
    expect(wp.activeNow).toBe(0);
    expect(gtm.activeNow).toBe(1);
    expect(wp.capablePartnerIds).toEqual(['p_anna', 'p_ben']);
    expect(wp.reasons.map((r) => r.label)).toEqual([
      'Anna: 1 of 2 slots free',
      'Ben: 1 of 1 slot free',
    ]);

    // The per-offer numbers share Anna's slot, so they are NOT additive.
    expect(b.totalSpareSlots).toBe(2);
    expect(wp.headroom + gtm.headroom).toBeGreaterThan(b.totalSpareSlots);
    expect(b.perOfferIndependent).toBe(false);
    expect(b.availabilityEvaluated).toBe(true);
  });

  it('says at capacity, with the count, instead of just 0', () => {
    const anna = mkPartner('p_anna', 'Anna');
    const active = [
      engagement('mica_whitepaper', 'p_anna', 'e1'),
      engagement('gtm_sprint', 'p_anna', 'e2'),
    ];
    const wp = headroomFor(benchHeadroom(['mica_whitepaper'], [anna], active), 'mica_whitepaper')!;
    expect(wp.headroom).toBe(0);
    expect(wp.blocked).toBe(true);
    expect(wp.perPartner[0]).toMatchObject({ maxConcurrent: 2, activeCount: 2, spare: 0, exclusion: 'at_capacity' });
    expect(wp.reasons.map((r) => r.label)).toContain('Anna: at capacity (2/2)');
  });

  it('surfaces engagements sold with no partner: they occupy no slot and are the real hazard', () => {
    const b = benchHeadroom(['mica_whitepaper'], [mkPartner('p_anna', 'Anna')], [
      engagement('mica_whitepaper', null, 'e_unstaffed'),
    ]);
    expect(b.unstaffedActiveCount).toBe(1);
    expect(headroomFor(b, 'mica_whitepaper')!.headroom).toBe(2); // nobody's slot was consumed
    expect(headroomFor(b, 'mica_whitepaper')!.activeNow).toBe(1); // but a client is waiting
  });

  it('skips availability when no asOf is given, and reports that it skipped it', () => {
    const onLeave = mkPartner('p_anna', 'Anna', {
      capacity: { maxConcurrent: 2, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: '2026-09-01T00:00:00Z' },
    });
    const blind = benchHeadroom(['mica_whitepaper'], [onLeave], []);
    expect(blind.availabilityEvaluated).toBe(false);
    expect(headroomFor(blind, 'mica_whitepaper')!.headroom).toBe(2);

    const dated = benchHeadroom(['mica_whitepaper'], [onLeave], [], { asOf: NOW });
    expect(dated.availabilityEvaluated).toBe(true);
    expect(headroomFor(dated, 'mica_whitepaper')!.headroom).toBe(0);
    expect(headroomFor(dated, 'mica_whitepaper')!.perPartner[0].exclusion).toBe('unavailable');
  });

  it('counts capacity without a rate card by default, but flags margin as unknown', () => {
    const noCard = mkPartner('p_cara', 'Cara', { rateCards: [] });
    const open = headroomFor(benchHeadroom(['mica_whitepaper'], [noCard], []), 'mica_whitepaper')!;
    expect(open.headroom).toBe(2);
    expect(open.quotablePartnerIds).toEqual([]);
    expect(open.reasons.map((r) => r.label)).toContain(
      '1 capable partner(s) have no usable rate card — margin unknown',
    );

    const strict = headroomFor(
      benchHeadroom(['mica_whitepaper'], [noCard], [], { requireRateCard: true }),
      'mica_whitepaper',
    )!;
    expect(strict.headroom).toBe(0);
    expect(strict.perPartner[0].exclusion).toBe('no_rate_card');
  });

  it('treats a nonsense capacity as zero rather than NaN', () => {
    const broken = mkPartner('p_x', 'Broken', {
      capacity: { maxConcurrent: Number.NaN, statedBy: 'x', statedAt: NOW, unavailableUntil: null },
    });
    const r = headroomFor(benchHeadroom(['mica_whitepaper'], [broken], []), 'mica_whitepaper')!;
    expect(r.headroom).toBe(0);
    expect(r.perPartner[0].maxConcurrent).toBe(0);
  });
});

/* ── The hard gate: every refusal names itself ──────────────────────────── */

describe('canAcceptEngagement — refusals', () => {
  it('refuses on an empty bench, and marks later gates skipped rather than passed', () => {
    const d = canAcceptEngagement('mica_whitepaper', PARTNER_BENCH, []);
    expect(d.accepted).toBe(false);
    expect(d.refusalCode).toBe('no_capable_partner');
    expect(d.reason).toContain('No partner on the bench has a recorded capability');
    expect(d.eligiblePartnerIds).toEqual([]);
    expect(d.gates).toHaveLength(7);
    expect(d.gates[0]).toMatchObject({ code: 'no_capable_partner', passed: false, skipped: false });
    expect(d.gates.slice(1).every((g) => g.skipped && !g.passed)).toBe(true);
  });

  it('refuses when no partner records the requested jurisdiction, and does not infer one', () => {
    const anna = mkPartner('p_anna', 'Anna', {
      capabilities: [cap('mica_whitepaper', 'senior', ['Liechtenstein', 'EU'])],
    });
    const d = canAcceptEngagement('mica_whitepaper', [anna], [], { jurisdiction: 'Germany', asOf: NOW });
    expect(d.refusalCode).toBe('jurisdiction_not_covered');
    expect(d.reason).toContain('"Germany"');
    expect(d.reason).toContain('never inferred');
    // Accepts the string that was actually entered.
    expect(canAcceptEngagement('mica_whitepaper', [anna], [], { jurisdiction: 'liechtenstein', asOf: NOW }).accepted).toBe(true);
  });

  it('refuses below the required seniority', () => {
    const junior = mkPartner('p_j', 'Junior', { capabilities: [cap('mica_whitepaper', 'associate')] });
    const d = canAcceptEngagement('mica_whitepaper', [junior], [], { minSeniority: 'principal', asOf: NOW });
    expect(d.refusalCode).toBe('below_required_seniority');
    expect(d.reason).toContain('Principal');
  });

  it('refuses when the only capable partner is off the bench', () => {
    const gone = mkPartner('p_g', 'Gone', { active: false });
    expect(canAcceptEngagement('mica_whitepaper', [gone], [], { asOf: NOW }).refusalCode).toBe('all_partners_inactive');
  });

  it('refuses when the only capable partner is unavailable at the stated date', () => {
    const away = mkPartner('p_a', 'Away', {
      capacity: { maxConcurrent: 2, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: '2026-09-01T00:00:00Z' },
    });
    expect(canAcceptEngagement('mica_whitepaper', [away], [], { asOf: NOW }).refusalCode).toBe('all_partners_unavailable');
    // Without a date the window cannot be checked — and the decision says so.
    const blind = canAcceptEngagement('mica_whitepaper', [away], []);
    expect(blind.accepted).toBe(true);
    expect(blind.availabilityEvaluated).toBe(false);
    expect(blind.stalenessEvaluated).toBe(false);
  });

  it('refuses by default when the margin is unknown — no rate card, or a stale one', () => {
    const noCard = mkPartner('p_c', 'Cara', { rateCards: [] });
    const missing = canAcceptEngagement('mica_whitepaper', [noCard], [], { asOf: NOW });
    expect(missing.refusalCode).toBe('no_usable_rate_card');
    expect(missing.reason).toContain('margin');

    const stale = mkPartner('p_s', 'Stale', {
      rateCards: [card('mica_whitepaper', 'fixed', 600_000, null, '2026-01-01T00:00:00Z')],
    });
    expect(canAcceptEngagement('mica_whitepaper', [stale], [], { asOf: NOW }).refusalCode).toBe('no_usable_rate_card');

    // Caller may opt out — capacity still exists, the margin is just unknown.
    const opted = canAcceptEngagement('mica_whitepaper', [noCard], [], { asOf: NOW, requireRateCard: false });
    expect(opted.accepted).toBe(true);
    expect(opted.gates.find((g) => g.code === 'no_usable_rate_card')?.detail).toContain('margin may be unknown');
  });

  it('refuses when the bench is full, quoting the capacity that is full', () => {
    const solo = mkPartner('p_solo', 'Solo', {
      capacity: { maxConcurrent: 1, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: null },
    });
    const d = canAcceptEngagement('mica_whitepaper', [solo], [engagement('mica_whitepaper', 'p_solo')], { asOf: NOW });
    expect(d.refusalCode).toBe('bench_at_capacity');
    expect(d.reason).toContain('Solo: at capacity (1/1)');
    expect(d.headroom).toBe(0);
  });

  it('accepts only with a named partner holding a free slot', () => {
    const anna = mkPartner('p_anna', 'Anna');
    const full = mkPartner('p_ben', 'Ben', {
      capacity: { maxConcurrent: 1, statedBy: 'nikhil', statedAt: NOW, unavailableUntil: null },
    });
    const d = canAcceptEngagement('mica_whitepaper', [anna, full], [engagement('mica_whitepaper', 'p_ben')], { asOf: NOW });
    expect(d.accepted).toBe(true);
    expect(d.reason).toBeNull();
    expect(d.refusalCode).toBeNull();
    expect(d.eligiblePartnerIds).toEqual(['p_anna']);
    expect(d.headroom).toBe(2);
    expect(d.gates.every((g) => g.passed && !g.skipped)).toBe(true);
  });
});

/* ── Scorecard: real outcomes only ──────────────────────────────────────── */

const outcome = (over: Partial<RecordedOutcome> = {}): RecordedOutcome => ({
  engagementId: 'e1',
  partnerId: 'p_anna',
  offerKey: 'mica_whitepaper',
  quotedPriceCents: 1_800_000,
  quotedVendorCostCents: 600_000,
  finalPriceCents: null,
  actualVendorCostCents: null,
  dueAt: null,
  deliveredAt: null,
  reworkRounds: null,
  acceptedFirstPass: null,
  ...over,
});

describe('partnerScorecard — zero data', () => {
  it('fabricates nothing and says "no data"', () => {
    const s = partnerScorecard('p_anna', []);
    expect(s.sampleSize).toBe(0);
    expect(s.confidence).toBe('no_data');
    expect(s.onTimeRate).toBeNull();
    expect(s.reworkRate).toBeNull();
    expect(s.marginQuotedPct).toBeNull();
    expect(s.marginRealisedPct).toBeNull();
    expect(s.marginDeltaPct).toBeNull();
    expect(s.firstPassAcceptanceRate).toBeNull();
    expect(s.onTimeSample + s.reworkSample + s.marginSample + s.firstPassSample).toBe(0);
    expect(s.notes.join(' ')).toContain('no data');
  });

  it('does not borrow another partner\'s record', () => {
    const s = partnerScorecard('p_ben', [outcome({ partnerId: 'p_anna', acceptedFirstPass: true })]);
    expect(s.sampleSize).toBe(0);
    expect(s.firstPassAcceptanceRate).toBeNull();
  });

  it('reports per-metric nulls: a delivered engagement with no cost recorded has no margin', () => {
    const s = partnerScorecard('p_anna', [
      outcome({ dueAt: '2026-06-01', deliveredAt: '2026-06-01', acceptedFirstPass: true }),
    ]);
    expect(s.onTimeRate).toBe(100);
    expect(s.onTimeSample).toBe(1);
    expect(s.firstPassAcceptanceRate).toBe(100);
    expect(s.marginRealisedPct).toBeNull(); // actualVendorCostCents was never recorded
    expect(s.marginSample).toBe(0);
    expect(s.reworkRate).toBeNull(); // unknown, NOT zero rework
    expect(s.notes.join(' ')).toContain('no data on margin');
  });
});

describe('partnerScorecard — one data point', () => {
  it('is an anecdote and labels itself as one', () => {
    const s = partnerScorecard('p_anna', [
      outcome({
        dueAt: '2026-06-01T00:00:00Z',
        deliveredAt: '2026-05-28T00:00:00Z',
        reworkRounds: 0,
        acceptedFirstPass: true,
        actualVendorCostCents: 600_000,
      }),
    ]);
    expect(s.sampleSize).toBe(1);
    expect(s.confidence).toBe('anecdote');
    expect(s.onTimeRate).toBe(100);
    expect(s.reworkRate).toBe(0);
    expect(s.marginQuotedPct).toBe(67); // (1,800,000 − 600,000) / 1,800,000
    expect(s.marginRealisedPct).toBe(67);
    expect(s.marginDeltaPct).toBe(0);
    expect(s.notes.join(' ')).toContain('anecdote, not a track record');
  });

  it('counts a late delivery as late, not as unknown', () => {
    const s = partnerScorecard('p_anna', [
      outcome({ dueAt: '2026-06-01T00:00:00Z', deliveredAt: '2026-06-09T00:00:00Z' }),
    ]);
    expect(s.onTimeRate).toBe(0);
    expect(s.onTimeSample).toBe(1);
  });
});

describe('partnerScorecard — margin is money-weighted', () => {
  it('does not let a $2k diagnostic outweigh a $25k white paper', () => {
    const s = partnerScorecard('p_anna', [
      // $25,000 white paper: quoted $5,000 cost, actually invoiced $8,000.
      outcome({ engagementId: 'e_wp', quotedPriceCents: 2_500_000, quotedVendorCostCents: 500_000, actualVendorCostCents: 800_000, reworkRounds: 2 }),
      // $2,000 diagnostic: on cost.
      outcome({ engagementId: 'e_dx', offerKey: 'diagnostic', quotedPriceCents: 200_000, quotedVendorCostCents: 40_000, actualVendorCostCents: 40_000, reworkRounds: 0 }),
    ]);
    expect(s.sampleSize).toBe(2);
    expect(s.confidence).toBe('anecdote'); // 2 engagements is still an anecdote
    expect(s.marginSample).toBe(2);
    // Money-weighted: (2,000,000 + 160,000) / 2,700,000 = 80%
    expect(s.marginQuotedPct).toBe(80);
    // Money-weighted: (1,700,000 + 160,000) / 2,700,000 = 69%
    expect(s.marginRealisedPct).toBe(69);
    // The naive mean of per-engagement percentages would have been 74% — which
    // is the flattering number, and the reason this is money-weighted.
    expect(s.marginRealisedPct).not.toBe(74);
    expect(s.marginDeltaPct).toBe(-11);
    expect(s.notes.join(' ')).toContain('11 points below quote');
    expect(s.reworkRate).toBe(50); // 1 of 2 engagements needed unscoped rework
  });

  it('bands confidence by sample size — a stated prior, reviewed quarterly', () => {
    const many = (n: number): RecordedOutcome[] =>
      Array.from({ length: n }, (_, i) => outcome({ engagementId: `e${i}` }));
    expect(partnerScorecard('p_anna', many(2)).confidence).toBe('anecdote');
    expect(partnerScorecard('p_anna', many(3)).confidence).toBe('indicative');
    expect(partnerScorecard('p_anna', many(7)).confidence).toBe('indicative');
    expect(partnerScorecard('p_anna', many(8)).confidence).toBe('established');
  });
});

/* ── Margin at risk: the three real engagement sizes ────────────────────── */

describe('marginAtRisk — worked $10k / $18k / $25k engagements', () => {
  it('$10,000 GTM sprint: a 5-day card at $1,500/day erodes $3,000 of quoted margin', () => {
    const anna = mkPartner('p_anna', 'Anna', {
      capabilities: [cap('gtm_sprint')],
      rateCards: [card('gtm_sprint', 'day_rate', 150_000, 5)],
    });
    const r = marginAtRisk(
      { offerKey: 'gtm_sprint', priceCents: 1_000_000, quotedVendorCostCents: 450_000, currency: 'USD' },
      anna,
      { asOf: NOW },
    );
    expect(r.quotedMarginCents).toBe(550_000);
    expect(r.quotedMarginPct).toBe(55);
    expect(r.rateCardCostCents).toBe(750_000);
    expect(r.impliedMarginCents).toBe(250_000);
    expect(r.impliedMarginPct).toBe(25);
    expect(r.atRiskCents).toBe(300_000);
    expect(r.verdict).toBe('margin_eroded');
    expect(r.rateCardStatus).toBe('usable');
  });

  it('$18,000 white paper on a fixed card: margin intact, nothing at risk', () => {
    const r = marginAtRisk(
      { offerKey: 'mica_whitepaper', priceCents: 1_800_000, quotedVendorCostCents: 600_000, currency: 'USD' },
      mkPartner('p_anna', 'Anna'),
      { asOf: NOW },
    );
    expect(r.verdict).toBe('margin_intact');
    expect(r.atRiskCents).toBe(0);
    expect(r.impliedMarginCents).toBe(1_200_000);
    expect(r.impliedMarginPct).toBe(67);
    expect(r.reasons.join(' ')).toContain('matches the rate card exactly');
  });

  it('$25,000 activation at $250/hour × 120 hours: the engagement LOSES $5,000', () => {
    const dee = mkPartner('p_dee', 'Dee', {
      capabilities: [cap('marketing_activation')],
      rateCards: [card('marketing_activation', 'hourly', 25_000, 120)],
    });
    const r = marginAtRisk(
      { offerKey: 'marketing_activation', priceCents: 2_500_000, quotedVendorCostCents: 500_000, currency: 'USD' },
      dee,
      { asOf: NOW },
    );
    expect(r.quotedMarginCents).toBe(2_000_000); // the quote claims $20,000 of margin
    expect(r.quotedMarginPct).toBe(80);
    expect(r.rateCardCostCents).toBe(3_000_000);
    expect(r.impliedMarginCents).toBe(-500_000);
    expect(r.impliedMarginPct).toBe(-20);
    // $20,000 of claimed margin against a $5,000 loss = $25,000 at risk.
    expect(r.atRiskCents).toBe(2_500_000);
    expect(r.verdict).toBe('margin_negative');
    expect(r.reasons.join(' ')).toContain('Do not accept at this price');
  });
});

describe('marginAtRisk — refuses to invent numbers', () => {
  const quote = { offerKey: 'mica_whitepaper' as OfferKey, priceCents: 1_800_000, quotedVendorCostCents: 600_000, currency: 'USD' };

  it('says not_capable rather than pricing a partner who cannot do the work', () => {
    const r = marginAtRisk(quote, mkPartner('p_g', 'Gtm Only', { capabilities: [cap('gtm_sprint')] }));
    expect(r.verdict).toBe('not_capable');
    expect(r.rateCardCostCents).toBeNull();
    expect(r.atRiskCents).toBeNull();
  });

  it('distinguishes "no risk found" from "risk not computable"', () => {
    const noCard = marginAtRisk(quote, mkPartner('p_c', 'Cara', { rateCards: [] }));
    expect(noCard.verdict).toBe('no_rate_card');
    expect(noCard.atRiskCents).toBeNull(); // NOT 0
    expect(noCard.quotedMarginCents).toBe(1_200_000); // the quote's own arithmetic still holds

    const metered = marginAtRisk(
      { ...quote, offerKey: 'gtm_sprint' },
      mkPartner('p_m', 'Metered', {
        capabilities: [cap('gtm_sprint')],
        rateCards: [card('gtm_sprint', 'day_rate', 150_000, null)],
      }),
    );
    expect(metered.verdict).toBe('cost_not_derivable');
    expect(metered.atRiskCents).toBeNull();
    expect(metered.reasons.join(' ')).toContain('rather than guessing');
  });

  it('never converts currency', () => {
    const eur = mkPartner('p_e', 'Euro', {
      rateCards: [{ ...card('mica_whitepaper', 'fixed', 600_000), currency: 'EUR' }],
    });
    const r = marginAtRisk(quote, eur, { asOf: NOW });
    expect(r.verdict).toBe('currency_mismatch');
    expect(r.rateCardCostCents).toBeNull();
    expect(r.reasons.join(' ')).toContain('No FX conversion');
  });

  it('reports staleness beside the verdict instead of hiding a loss behind it', () => {
    const stale = mkPartner('p_s', 'Stale', {
      capabilities: [cap('mica_whitepaper')],
      rateCards: [card('mica_whitepaper', 'fixed', 2_000_000, null, '2026-01-01T00:00:00Z')],
    });
    const r = marginAtRisk(quote, stale, { asOf: NOW });
    expect(r.verdict).toBe('margin_negative'); // the loss is still the headline
    expect(r.rateCardStatus).toBe('expired');
    expect(r.stalenessEvaluated).toBe(true);
    expect(r.reasons.join(' ')).toContain('expired');

    const undated = marginAtRisk(quote, stale);
    expect(undated.rateCardStatus).toBeNull(); // cannot judge without a date
    expect(undated.stalenessEvaluated).toBe(false);
  });

  it('makes a scope overrun visible at quote time via the unit override', () => {
    const anna = mkPartner('p_anna', 'Anna', {
      capabilities: [cap('gtm_sprint')],
      rateCards: [card('gtm_sprint', 'day_rate', 150_000, 5)],
    });
    const asScoped = marginAtRisk(
      { offerKey: 'gtm_sprint', priceCents: 1_000_000, quotedVendorCostCents: 750_000, currency: 'USD' },
      anna,
      { asOf: NOW },
    );
    expect(asScoped.verdict).toBe('margin_intact');

    const overrun = marginAtRisk(
      { offerKey: 'gtm_sprint', priceCents: 1_000_000, quotedVendorCostCents: 750_000, currency: 'USD', expectedUnitsOverride: 9 },
      anna,
      { asOf: NOW },
    );
    expect(overrun.rateCardCostCents).toBe(1_350_000);
    expect(overrun.verdict).toBe('margin_negative');
    expect(overrun.atRiskCents).toBe(600_000); // 250,000 quoted margin → −350,000 implied
    expect(overrun.reasons.join(' ')).toContain('scoped at 9 units against a card assuming 5');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ASSERTION — who put this partner on the bench                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('partner assertion', () => {
  it('accepts a complete assertion and reports nothing wrong with it', () => {
    const p = mkPartner('p_anna', 'Anna Reiter');
    expect(partnerAssertionDefects(p)).toEqual([]);
    expect(isAssertedPartner(p)).toBe(true);
  });

  // Every defect, not the first: a human told one thing at a time submits the form
  // four times and learns the surface is hostile.
  it('reports EVERY defect at once, each with its own code', () => {
    const broken = mkPartner('  ', '  ', {
      assertion: { assertedBy: '   ', assertedAt: '', basis: '' },
    });
    const codes = partnerAssertionDefects(broken).map((d) => d.code).sort();
    expect(codes).toEqual([
      'PARTNER_ASSERTED_AT_BLANK',
      'PARTNER_ASSERTED_BY_BLANK',
      'PARTNER_ASSERTION_BASIS_BLANK',
      'PARTNER_ID_BLANK',
      'PARTNER_NAME_BLANK',
    ]);
    expect(isAssertedPartner(broken)).toBe(false);
  });

  it('refuses to interpret an unparseable assertion date rather than defaulting it', () => {
    const p = mkPartner('p_x', 'X', { assertion: assertion({ assertedAt: 'last tuesday' }) });
    const codes = partnerAssertionDefects(p).map((d) => d.code);
    expect(codes).toEqual(['PARTNER_ASSERTED_AT_UNPARSEABLE']);
    expect(partnerAssertionDefects(p)[0].sentence).toContain('last tuesday');
  });

  // The basis is the only field a reviewer can argue with, so a whitespace-only
  // basis must not satisfy the requirement the decision was made about.
  it('treats a whitespace-only basis as no basis', () => {
    const p = mkPartner('p_x', 'X', { assertion: assertion({ basis: '   \n  ' }) });
    expect(partnerAssertionDefects(p).map((d) => d.code)).toEqual(['PARTNER_ASSERTION_BASIS_BLANK']);
  });

  it('states in exported data that an assertion is a claim and not a verification', () => {
    expect(PARTNER_ASSERTION_IS_A_CLAIM).toMatch(/not verified/i);
    expect(PARTNER_ASSERTION_IS_A_CLAIM).toMatch(/not a reference check/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FLOOR                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

const ENV = 'supabase:db.test.supabase.co/postgres';

const effortReal = (over: Partial<FloorEffortInput> = {}): FloorEffortInput => ({
  offerKey: 'mica_whitepaper',
  optimisticDays: 8,
  likelyDays: 15,
  pessimisticDays: 30,
  statedBy: 'nikhil.sharma@lcx.com',
  statedAt: '2026-08-06T10:00:00.000Z',
  isPlaceholder: false,
  ...over,
});

/** The shipped placeholder's shape — `underwrite.ts` stamps exactly these. */
const effortPlaceholder = (): FloorEffortInput => ({
  ...effortReal(),
  statedBy: 'system:placeholder',
  statedAt: '1970-01-01T00:00:00.000Z',
  isPlaceholder: true,
});

function floorReq(over: Partial<PriceFloorRequest> = {}): PriceFloorRequest {
  return {
    offerKey: 'mica_whitepaper',
    partner: mkPartner('p_anna', 'Anna Reiter', {
      rateCards: [card('mica_whitepaper', 'day_rate', 150_000, 5)],
    }),
    card: inputLoaded(card('mica_whitepaper', 'day_rate', 150_000, 5)),
    hoursPerDay: inputEmpty('hours_per_day is null on the row: this is not an hourly card'),
    passThroughCents: inputLoaded(0),
    effort: inputLoaded(effortReal()),
    effortPoint: 'likely',
    quoteCurrency: 'USD',
    asOf: NOW,
    environment: ENV,
    ...over,
  };
}

const codesOf = (o: PriceFloorOutcome): readonly FloorRefusalCode[] =>
  o.kind === 'refused' ? o.refusals.map((r) => r.code) : [];

describe('price floor — the arithmetic', () => {
  it('multiplies the day rate by the effort point the caller named, and says which', () => {
    // $1,500/day × 15 likely days = $22,500.
    const likely = priceFloor(floorReq());
    expect(isPriceFloor(likely)).toBe(true);
    if (!isPriceFloor(likely)) return;
    expect(likely.floorCents).toBe(2_250_000);
    expect(likely.currency).toBe('USD');
    expect(likely.frame.effortPoint).toBe('likely');
    expect(likely.frame.effortDays).toBe(15);
    expect(likely.frame.unitsCharged).toBe(15);

    // $1,500/day × 30 pessimistic days = $45,000. Same card, double the floor —
    // which is the whole reason the point is stated rather than assumed.
    const pess = priceFloor(floorReq({ effortPoint: 'pessimistic' }));
    expect(isPriceFloor(pess)).toBe(true);
    if (!isPriceFloor(pess)) return;
    expect(pess.floorCents).toBe(4_500_000);
    expect(pess.frame.effortDays).toBe(30);
  });

  it('offers no optimistic point at all — the floor a salesperson would reach for', () => {
    expect(FLOOR_EFFORT_POINTS).toEqual(['likely', 'pessimistic']);
    expect(FLOOR_EFFORT_POINTS).not.toContain('optimistic');
  });

  it('adds the pass-through, and reports it separately rather than folding it in', () => {
    const withCounselFee = priceFloor(floorReq({ passThroughCents: inputLoaded(500_000) }));
    expect(isPriceFloor(withCounselFee)).toBe(true);
    if (!isPriceFloor(withCounselFee)) return;
    expect(withCounselFee.floorCents).toBe(2_750_000);
    expect(withCounselFee.frame.passThroughCents).toBe(500_000);
    expect(withCounselFee.reasons.join(' ')).toContain('500000 cents of pass-through');
  });

  it('converts DAYS to HOURS only with a stated hours-per-day, never an assumed 8', () => {
    const hourly = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'hourly', 25_000)),
      hoursPerDay: inputLoaded(7),
      partner: mkPartner('p_anna', 'Anna Reiter', { rateCards: [card('mica_whitepaper', 'hourly', 25_000)] }),
    }));
    expect(isPriceFloor(hourly)).toBe(true);
    if (!isPriceFloor(hourly)) return;
    // $250/hour × 15 days × 7 hours = $26,250. With an assumed 8 it would be $30,000
    // — a $3,750 error in a floor, in the direction that looks safer.
    expect(hourly.floorCents).toBe(2_625_000);
    expect(hourly.frame.hoursPerDay).toBe(7);
    expect(hourly.frame.unitsCharged).toBe(105);
  });

  it('prices a fixed fee without consulting the effort triple at all', () => {
    const fixed = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'fixed', 600_000)),
      // A PLACEHOLDER triple, which on a metered card is a hard refusal. On a fixed
      // fee it is irrelevant, and refusing on it would be inventing a dependency.
      effort: inputLoaded(effortPlaceholder()),
    }));
    expect(isPriceFloor(fixed)).toBe(true);
    if (!isPriceFloor(fixed)) return;
    expect(fixed.floorCents).toBe(600_000);
    expect(fixed.frame.effortPoint).toBeNull();
    expect(fixed.frame.effortDays).toBeNull();
    expect(fixed.frame.unitsCharged).toBeNull();
    expect(fixed.reasons.join(' ')).toContain('the effort triple never entered this arithmetic');
  });

  it('carries the environment, the asOf and the attribution onto the figure', () => {
    const f = priceFloor(floorReq());
    expect(isPriceFloor(f)).toBe(true);
    if (!isPriceFloor(f)) return;
    expect(f.frame.environment).toBe(ENV);
    expect(f.frame.asOf).toBe(NOW);
    expect(f.frame.assertedBy).toBe('nikhil.sharma@lcx.com');
    expect(f.frame.assertionBasis).toContain('Delivered two MiCA papers');
    expect(f.frame.assertionIsAClaim).toBe(PARTNER_ASSERTION_IS_A_CLAIM);
    expect(f.frame.rateStatedBy).toBe('nikhil');
    expect(f.frame.rateCardStatus).toBe('usable');
    expect(f.frame.method).toBe('rate_card_unit_cost × effort_at_stated_point + pass_through');
  });

  it('names what the floor excludes, so it is not read as a break-even', () => {
    const f = priceFloor(floorReq());
    if (!isPriceFloor(f)) throw new Error('expected a floor');
    const excludes = f.frame.excludes.join(' ');
    expect(excludes).toMatch(/overhead/i);
    expect(excludes).toMatch(/unbilled founder time/i);
    expect(excludes).toMatch(/rework/i);
    expect(f.reasons.join(' ')).toContain('LOSES money');
  });

  it('says a partner is off the bench without pretending the rate is not a rate', () => {
    const f = priceFloor(floorReq({
      partner: mkPartner('p_anna', 'Anna Reiter', {
        active: false,
        rateCards: [card('mica_whitepaper', 'day_rate', 150_000, 5)],
      }),
    }));
    expect(isPriceFloor(f)).toBe(true);
    if (!isPriceFloor(f)) return;
    expect(f.reasons.join(' ')).toContain('OFF THE BENCH');
  });

  it('never returns a fractional cent', () => {
    // 333c/day × 15 days = 4,995c exactly; a 0.5c/day card would round, not drift.
    const f = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'day_rate', 333, 5)),
      passThroughCents: inputLoaded(7),
    }));
    if (!isPriceFloor(f)) throw new Error('expected a floor');
    expect(Number.isInteger(f.floorCents)).toBe(true);
    expect(f.floorCents).toBe(5_002);
  });
});

describe('price floor — the refusals', () => {
  it('refuses when nobody named the database the rate came from', () => {
    expect(codesOf(priceFloor(floorReq({ environment: null })))).toContain('FLOOR_ENVIRONMENT_UNSTATED');
    expect(codesOf(priceFloor(floorReq({ environment: '   ' })))).toContain('FLOOR_ENVIRONMENT_UNSTATED');
  });

  // Elsewhere in this module a missing asOf SKIPS the staleness check and says so.
  // A floor may not: it is held to as a policy, and an expired rate becomes one.
  it('refuses without an asOf instead of skipping the expiry check', () => {
    expect(codesOf(priceFloor(floorReq({ asOf: null })))).toContain('FLOOR_AS_OF_ABSENT');
    expect(codesOf(priceFloor(floorReq({ asOf: 'not a date' })))).toContain('FLOOR_AS_OF_ABSENT');
  });

  it('refuses on an unattributed partner, naming the fields that are missing', () => {
    const out = priceFloor(floorReq({
      partner: mkPartner('p_ghost', 'Ghost', {
        assertion: { assertedBy: '', assertedAt: '', basis: '' },
        rateCards: [card('mica_whitepaper', 'day_rate', 150_000, 5)],
      }),
    }));
    expect(codesOf(out)).toContain('FLOOR_PARTNER_NOT_ASSERTED');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    const r = out.refusals.find((x) => x.code === 'FLOOR_PARTNER_NOT_ASSERTED')!;
    expect(r.sentence).toContain('PARTNER_ASSERTED_BY_BLANK');
    expect(r.rule.provision).toBe('a partner is asserted by a named human');
    expect(r.environment).toBe(ENV);
  });

  it('refuses when the partner has no recorded capability for the offer', () => {
    const out = priceFloor(floorReq({
      partner: mkPartner('p_anna', 'Anna Reiter', {
        capabilities: [cap('gtm_sprint')],
        rateCards: [card('mica_whitepaper', 'day_rate', 150_000, 5)],
      }),
    }));
    expect(codesOf(out)).toContain('FLOOR_PARTNER_NOT_CAPABLE');
  });

  // The doctrine this whole request shape exists for.
  it('keeps not-loaded, withheld and genuinely-absent as three different answers', () => {
    expect(codesOf(priceFloor(floorReq({ card: inputNotLoaded('the registry was never queried') }))))
      .toContain('FLOOR_RATE_CARD_NOT_LOADED');
    expect(codesOf(priceFloor(floorReq({ card: inputWithheld('gps compartment: view not granted') }))))
      .toContain('FLOOR_RATE_CARD_WITHHELD');
    expect(codesOf(priceFloor(floorReq({ card: inputEmpty('no row for (p_anna, mica_whitepaper)') }))))
      .toContain('FLOOR_RATE_CARD_ABSENT');

    // …and the same three for the effort register, on a metered card.
    expect(codesOf(priceFloor(floorReq({ effort: inputNotLoaded('not read') })))).toContain('FLOOR_EFFORT_NOT_LOADED');
    expect(codesOf(priceFloor(floorReq({ effort: inputWithheld('withheld') })))).toContain('FLOOR_EFFORT_WITHHELD');
    expect(codesOf(priceFloor(floorReq({ effort: inputEmpty('no row') })))).toContain('FLOOR_EFFORT_ABSENT');
  });

  it('says the refusal list is incomplete while the card unit is unknown', () => {
    const out = priceFloor(floorReq({ card: inputEmpty('no row'), effort: inputEmpty('no row') }));
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    // The effort is ALSO missing, and it is deliberately not reported: whether it is
    // needed depends on a unit nobody has. The refusal says that rather than
    // implying the card is the only obstacle.
    expect(codesOf(out)).not.toContain('FLOOR_EFFORT_ABSENT');
    expect(out.refusals[0].sentence).toContain('not exhaustive');
  });

  it('REFUSES a floor built on the shipped placeholder triple', () => {
    const out = priceFloor(floorReq({ effort: inputLoaded(effortPlaceholder()) }));
    expect(codesOf(out)).toContain('FLOOR_EFFORT_IS_PLACEHOLDER');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    const r = out.refusals.find((x) => x.code === 'FLOOR_EFFORT_IS_PLACEHOLDER')!;
    expect(r.sentence).toContain('system:placeholder');
    expect(r.rule.provision).toBe('an inference is never laundered into a certainty');
    expect(r.remedyOwner).toBe('the founder');
  });

  it('refuses an expired card and a card with no expiry, differently', () => {
    const expired = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'day_rate', 150_000, 5, '2026-01-01T00:00:00Z')),
    }));
    expect(codesOf(expired)).toContain('FLOOR_RATE_CARD_EXPIRED');

    const noValidity = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'day_rate', 150_000, 5, null)),
    }));
    expect(codesOf(noValidity)).toContain('FLOOR_RATE_CARD_NO_VALIDITY');
    expect(codesOf(noValidity)).not.toContain('FLOOR_RATE_CARD_EXPIRED');
  });

  it('refuses a currency mismatch and converts nothing', () => {
    const out = priceFloor(floorReq({ quoteCurrency: 'EUR' }));
    expect(codesOf(out)).toContain('FLOOR_RATE_CARD_CURRENCY_MISMATCH');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals.find((r) => r.code === 'FLOOR_RATE_CARD_CURRENCY_MISMATCH')!.sentence)
      .toContain('Nothing here converts');
  });

  it('refuses a card or a triple belonging to a different offer', () => {
    expect(codesOf(priceFloor(floorReq({ card: inputLoaded(card('gtm_sprint', 'day_rate', 150_000, 5)) }))))
      .toContain('FLOOR_RATE_CARD_OFFER_MISMATCH');
    expect(codesOf(priceFloor(floorReq({ effort: inputLoaded(effortReal({ offerKey: 'gtm_sprint' })) }))))
      .toContain('FLOOR_EFFORT_OFFER_MISMATCH');
  });

  it('refuses a zero, sub-cent or unusable rate rather than pricing the work as free', () => {
    expect(codesOf(priceFloor(floorReq({ card: inputLoaded(card('mica_whitepaper', 'day_rate', 0, 5)) }))))
      .toContain('FLOOR_RATE_NOT_DERIVABLE');
    // 0.01c/day × 15 days rounds to 0 cents — the round-to-zero case the guard in
    // `rateCardCostCents` exists for, reached through that function rather than
    // re-tested here.
    expect(codesOf(priceFloor(floorReq({ card: inputLoaded(card('mica_whitepaper', 'day_rate', 0.01, 5)) }))))
      .toContain('FLOOR_RATE_NOT_DERIVABLE');
  });

  it('refuses an effort point that is zero, negative or not a number', () => {
    expect(codesOf(priceFloor(floorReq({ effort: inputLoaded(effortReal({ likelyDays: 0 })) }))))
      .toContain('FLOOR_EFFORT_UNUSABLE');
    expect(codesOf(priceFloor(floorReq({ effort: inputLoaded(effortReal({ likelyDays: Number.NaN })) }))))
      .toContain('FLOOR_EFFORT_UNUSABLE');
    expect(codesOf(priceFloor(floorReq({
      effortPoint: 'pessimistic',
      effort: inputLoaded(effortReal({ pessimisticDays: -3 })),
    })))).toContain('FLOOR_EFFORT_UNUSABLE');
  });

  it('refuses an hourly card with no hours-per-day on the row', () => {
    const out = priceFloor(floorReq({
      card: inputLoaded(card('mica_whitepaper', 'hourly', 25_000)),
      hoursPerDay: inputEmpty('hours_per_day is null'),
    }));
    expect(codesOf(out)).toContain('FLOOR_HOURS_PER_DAY_ABSENT');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals.find((r) => r.code === 'FLOOR_HOURS_PER_DAY_ABSENT')!.sentence)
      .toContain('Assuming 8');
  });

  // 0 pass-through is a truthful value written by the person entering the card;
  // NOT LOADED is not, and the difference is counsel's whole fee on one offer.
  it('accepts a stated pass-through of 0 and refuses an unstated one', () => {
    expect(isPriceFloor(priceFloor(floorReq({ passThroughCents: inputLoaded(0) })))).toBe(true);
    expect(codesOf(priceFloor(floorReq({ passThroughCents: inputNotLoaded('column not read') }))))
      .toContain('FLOOR_PASS_THROUGH_UNUSABLE');
    expect(codesOf(priceFloor(floorReq({ passThroughCents: inputLoaded(-1) }))))
      .toContain('FLOOR_PASS_THROUGH_UNUSABLE');
  });

  it('returns EVERY refusal, not the first one found', () => {
    const out = priceFloor(floorReq({
      environment: null,
      asOf: null,
      card: inputNotLoaded('never queried'),
      passThroughCents: inputNotLoaded('never read'),
      partner: mkPartner('p_ghost', 'Ghost', {
        assertion: { assertedBy: '', assertedAt: '', basis: '' },
        capabilities: [],
      }),
    }));
    const codes = codesOf(out);
    expect(codes).toContain('FLOOR_ENVIRONMENT_UNSTATED');
    expect(codes).toContain('FLOOR_AS_OF_ABSENT');
    expect(codes).toContain('FLOOR_PARTNER_NOT_ASSERTED');
    expect(codes).toContain('FLOOR_PARTNER_NOT_CAPABLE');
    expect(codes).toContain('FLOOR_RATE_CARD_NOT_LOADED');
    expect(codes).toContain('FLOOR_PASS_THROUGH_UNUSABLE');
    expect(codes.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every refusal a stable code, a rule, a named missing input and an owner', () => {
    const out = priceFloor(floorReq({ card: inputEmpty('no row') }));
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    for (const r of out.refusals) {
      expect(FLOOR_REFUSAL_CODES).toContain(r.code);
      expect(r.rule.instrument).toBe('LCX_HOUSE_DOCTRINE');
      expect(r.rule.text.length).toBeGreaterThan(20);
      expect(r.missing.trim()).not.toBe('');
      expect(['the partner', 'the founder', 'the desk', 'the server']).toContain(r.remedyOwner);
      expect(r.sentence).not.toMatch(/\b0 cents\b/);
    }
  });

  it('never produces a floor of 0 and never a floor with an unusable input', () => {
    // Everything that could produce a zero — a zero rate, a zero day count, a
    // zero-rounding product — is a refusal, so the union of the two is empty.
    const attempts: PriceFloorOutcome[] = [
      priceFloor(floorReq({ card: inputLoaded(card('mica_whitepaper', 'fixed', 0)) })),
      priceFloor(floorReq({ effort: inputLoaded(effortReal({ likelyDays: 0 })) })),
      priceFloor(floorReq({ card: inputLoaded(card('mica_whitepaper', 'day_rate', 0.001, 5)) })),
    ];
    for (const a of attempts) {
      expect(a.kind).toBe('refused');
    }
  });
});
