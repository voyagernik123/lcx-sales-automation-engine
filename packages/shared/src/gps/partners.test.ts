import { describe, expect, it } from 'vitest';
import { OFFER_KEYS, type OfferKey } from './types.js';
import {
  PARTNER_BENCH,
  benchHeadroom,
  canAcceptEngagement,
  capabilityCoversJurisdiction,
  headroomFor,
  marginAtRisk,
  meetsSeniority,
  partnerScorecard,
  rateCardCostCents,
  rateCardStatus,
  type ActiveEngagementRef,
  type Partner,
  type PartnerCapability,
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

function mkPartner(id: string, name: string, over: Partial<Partner> = {}): Partner {
  return {
    id,
    name,
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
