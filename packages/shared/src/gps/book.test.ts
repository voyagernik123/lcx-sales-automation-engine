/**
 * Behavioural tests for THE BOOK (GPS Phase 6).
 *
 * Four groups matter more than the rest, and they are the four ways this module
 * could pass a review and still be wrong:
 *
 *  1. HERFINDAHL ARITHMETIC, worked by hand. An index nobody has checked against
 *     paper is a plausible-looking number, and plausible-looking numbers are the
 *     exact complaint this phase exists to answer.
 *  2. THE REFUSALS. A negative-margin holder excluded from the index, an
 *     unattributed partner bracketed rather than guessed, a conversion rate
 *     suppressed below `MIN_N_FOR_RATE`, a receivable that cannot be aged. Each
 *     is a place where returning a confident 0 would look better and be a lie,
 *     so each has a test asserting the ABSENCE of the number and the PRESENCE of
 *     the reason.
 *  3. `bindingConstraint` reaching every distinct verdict — including "nothing is
 *     limiting you, you are simply not selling", which is the one a capacity
 *     gauge can never say and the reason the function is not called
 *     `utilisation`.
 *  4. NO FLOAT MONEY, asserted structurally by walking every `*Cents` field of a
 *     fully populated response, including when the caller feeds floats in.
 */
import { describe, expect, it } from 'vitest';
import {
  AGED_DEPOSIT_ALARM_DAYS,
  AGING_BRACKETS,
  CONSTRAINT_PRECEDENCE,
  SINGLE_HOLDER_ALARM_SHARE_PCT,
  VALUE_AXES,
  ageInDays,
  bindingConstraint,
  bookConcentration,
  bookHealth,
  bracketForAgeDays,
  cashConversion,
  isOpenPosition,
  positionValueCents,
  type BookPosition,
  type BookResponse,
  type CashConversion,
} from './book.js';
import { MIN_N_FOR_RATE } from './calibration.js';

const ASOF = '2026-08-01T00:00:00Z';

/** `ASOF` minus n whole days, as an ISO instant. Keeps every age intentional. */
function daysAgo(n: number): string {
  return new Date(Date.parse(ASOF) - n * 86_400_000).toISOString();
}

/**
 * A healthy position: $20,000 on an $8,000 partner cost, deposit banked. Every
 * test overrides only the fields it is about, so a failure names its own cause.
 */
function pos(over: Partial<BookPosition> = {}): BookPosition {
  return {
    engagementId: 'eng-1',
    clientId: 'cli-1',
    clientName: 'Alpha Ltd',
    offerKey: 'gtm_sprint',
    status: 'in_delivery',
    currency: 'USD',
    priceCents: 2_000_000,
    vendorCostCents: 800_000,
    jurisdiction: 'Liechtenstein',
    partner: 'partner-a',
    depositRequiredCents: 600_000,
    acceptedAt: daysAgo(40),
    depositPaidAt: daysAgo(38),
    createdAt: daysAgo(60),
    ...over,
  };
}

/** A position worth exactly `marginCents` of margin, with no vendor cost to reason about. */
function marginOnly(id: string, clientId: string, marginCents: number, over: Partial<BookPosition> = {}): BookPosition {
  return pos({
    engagementId: id,
    clientId,
    clientName: clientId.toUpperCase(),
    priceCents: marginCents,
    vendorCostCents: 0,
    ...over,
  });
}

/* ── 1 · Herfindahl arithmetic, by hand ───────────────────────────────────── */

describe('Herfindahl arithmetic', () => {
  it('a single client is exactly 1.0, and normalisation REFUSES rather than reporting 0', () => {
    const c = bookConcentration(
      [marginOnly('e1', 'cli-1', 500_000), marginOnly('e2', 'cli-1', 300_000), marginOnly('e3', 'cli-1', 200_000)],
      ASOF,
    );
    const axis = c.perCurrency[0].byAxis.client;

    expect(axis.hhi).toBe(1);
    expect(axis.hhiPoints).toBe(10_000);
    expect(axis.effectiveHolders).toBe(1);
    expect(axis.holderCount).toBe(1);
    expect(axis.dominant?.sharePct).toBe(100);
    expect(axis.dominant?.positions).toBe(3);
    expect(axis.top3SharePct).toBe(100);

    // A one-holder book is the MOST concentrated book possible. Rescaling it
    // against its own floor would produce 0, which reads as perfectly even.
    expect(axis.normalisedHhi).toBeNull();
  });

  it('two equal holders is 0.5 and three equal holders is 0.3333', () => {
    const two = bookConcentration(
      [marginOnly('e1', 'cli-1', 400_000), marginOnly('e2', 'cli-2', 400_000)],
      ASOF,
    ).perCurrency[0].byAxis.client;
    expect(two.hhi).toBe(0.5);
    expect(two.hhiPoints).toBe(5_000);
    expect(two.effectiveHolders).toBe(2);
    // At the even-split floor the normalised index is 0 — which is meaningful
    // here, unlike the single-holder case above.
    expect(two.normalisedHhi).toBe(0);

    const three = bookConcentration(
      [marginOnly('e1', 'cli-1', 300_000), marginOnly('e2', 'cli-2', 300_000), marginOnly('e3', 'cli-3', 300_000)],
      ASOF,
    ).perCurrency[0].byAxis.client;
    expect(three.hhi).toBe(0.3333);
    expect(three.effectiveHolders).toBe(3);
    expect(three.normalisedHhi).toBe(0);
  });

  it('60/30/10 is 0.46, with the rollup and the dominant holder named', () => {
    // 0.6² + 0.3² + 0.1² = 0.36 + 0.09 + 0.01 = 0.46
    const axis = bookConcentration(
      [
        marginOnly('e1', 'cli-1', 600_000),
        marginOnly('e2', 'cli-2', 300_000),
        marginOnly('e3', 'cli-3', 100_000),
      ],
      ASOF,
    ).perCurrency[0].byAxis.client;

    expect(axis.hhi).toBe(0.46);
    expect(axis.hhiPoints).toBe(4_600);
    expect(axis.effectiveHolders).toBe(2.2); // 1 / 0.46 = 2.17…
    expect(axis.normalisedHhi).toBe(0.19); // (0.46 − 1/3) / (1 − 1/3)
    expect(axis.holders.map((h) => h.sharePct)).toEqual([60, 30, 10]);
    expect(axis.dominant?.key).toBe('cli-1');
    expect(axis.top3SharePct).toBe(100);
  });

  it('holders are ordered by value then key, so a keyboard list cannot reorder under the cursor', () => {
    const axis = bookConcentration(
      [marginOnly('e1', 'cli-b', 100_000), marginOnly('e2', 'cli-a', 100_000), marginOnly('e3', 'cli-c', 500_000)],
      ASOF,
    ).perCurrency[0].byAxis.client;
    expect(axis.holders.map((h) => h.key)).toEqual(['cli-c', 'cli-a', 'cli-b']);
  });

  it('says the consequence out loud when one holder passes the alarm share', () => {
    const axis = bookConcentration(
      [
        marginOnly('e1', 'cli-1', 700_000, { partner: 'partner-a' }),
        marginOnly('e2', 'cli-2', 300_000, { partner: 'partner-b' }),
      ],
      ASOF,
    ).perCurrency[0].byAxis.partner;

    expect(axis.dominant?.sharePct).toBeGreaterThanOrEqual(SINGLE_HOLDER_ALARM_SHARE_PCT);
    // The plan's requirement: the ENGINE must be able to say it, not the CSS.
    expect(axis.headline).toContain('one resignation removes it');
    expect(axis.headline).toContain('partner-a');
  });
});

/* ── 2 · The refusals ─────────────────────────────────────────────────────── */

describe('concentration refusals', () => {
  it('excludes a loss-making holder from the index and NAMES it, rather than counting a loss as diversification', () => {
    const axis = bookConcentration(
      [
        marginOnly('e1', 'cli-good', 1_000_000),
        // Price below vendor cost: −$2,000 of margin.
        pos({ engagementId: 'e2', clientId: 'cli-bad', clientName: 'CLI-BAD', priceCents: 600_000, vendorCostCents: 800_000 }),
      ],
      ASOF,
    ).perCurrency[0].byAxis.client;

    expect(axis.hhi).toBe(1); // computed over the one positive holder
    expect(axis.holderCount).toBe(1);
    expect(axis.excludedNonPositive).toHaveLength(1);
    expect(axis.excludedNonPositive[0]).toMatchObject({ key: 'cli-bad', valueCents: -200_000 });
    expect(axis.notes.join(' ')).toContain('would count a');
  });

  it('brackets an unattributed partner instead of guessing, and the band is not a point', () => {
    // partner-a: 600k attributed. Two unattributed positions of 200k each.
    const axis = bookConcentration(
      [
        marginOnly('e1', 'cli-1', 600_000, { partner: 'partner-a' }),
        marginOnly('e2', 'cli-2', 200_000, { partner: null }),
        marginOnly('e3', 'cli-3', 200_000, { partner: null }),
      ],
      ASOF,
    ).perCurrency[0].byAxis.partner;

    expect(axis.hhi).toBe(1); // over what is known
    expect(axis.coveragePct).toBe(60);
    expect(axis.unattributedPositions).toBe(2);
    expect(axis.unattributedPositiveCents).toBe(400_000);
    // 0.6² = 0.36 attributed. u = 0.4 over 2 positions.
    // low  = 0.36 + 0.4²/2 = 0.44   (each unattributed is a different partner)
    // high = 0.36 + 0.4²   = 0.52   (all unattributed are one partner)
    expect(axis.band).not.toBeNull();
    expect(axis.band!.low).toBe(0.44);
    expect(axis.band!.high).toBe(0.52);
    expect(axis.band!.isPoint).toBe(false);
    expect(axis.notes.join(' ')).toContain('no partner column');
  });

  it('collapses the band to a point when nothing is unattributed', () => {
    const axis = bookConcentration(
      [marginOnly('e1', 'cli-1', 600_000), marginOnly('e2', 'cli-2', 400_000)],
      ASOF,
    ).perCurrency[0].byAxis.client;
    expect(axis.band!.isPoint).toBe(true);
    expect(axis.band!.low).toBe(axis.band!.high);
    expect(axis.band!.low).toBe(axis.hhi);
  });

  it('returns null — not 0 — when there is nothing to measure, because an empty book is not a diversified one', () => {
    const c = bookConcentration([], ASOF);
    expect(c.perCurrency).toHaveLength(0);
    expect(c.currencyMix.hhi).toBeNull();
    expect(c.notes.join(' ')).toContain('not the same as a diversified one');

    const allUnattributed = bookConcentration(
      [marginOnly('e1', 'cli-1', 100_000, { partner: null }), marginOnly('e2', 'cli-2', 100_000, { partner: null })],
      ASOF,
    ).perCurrency[0].byAxis.partner;
    expect(allUnattributed.hhi).toBeNull();
    expect(allUnattributed.effectiveHolders).toBeNull();
    // The band survives: 1/2 .. 1 is still the honest reading.
    expect(allUnattributed.band).toEqual(expect.objectContaining({ low: 0.5, high: 1, isPoint: false }));
  });

  it('excludes terminal positions from exposure and says how many', () => {
    const c = bookConcentration(
      [marginOnly('e1', 'cli-1', 100_000), marginOnly('e2', 'cli-2', 100_000, { status: 'collected' })],
      ASOF,
    );
    expect(c.positionCount).toBe(1);
    expect(c.scope).toBe('open');
    expect(c.notes.join(' ')).toContain('history, not exposure');

    const all = bookConcentration(
      [marginOnly('e1', 'cli-1', 100_000), marginOnly('e2', 'cli-2', 100_000, { status: 'collected' })],
      ASOF,
      { includeTerminal: true },
    );
    expect(all.positionCount).toBe(2);
    expect(all.scope).toBe('all');
  });

  it('groups free-text jurisdictions case-insensitively but keeps the spelling a human typed', () => {
    const axis = bookConcentration(
      [
        marginOnly('e1', 'cli-1', 100_000, { jurisdiction: 'Liechtenstein' }),
        marginOnly('e2', 'cli-2', 100_000, { jurisdiction: '  liechtenstein ' }),
      ],
      ASOF,
    ).perCurrency[0].byAxis.jurisdiction;
    expect(axis.holderCount).toBe(1);
    expect(axis.dominant?.label).toBe('Liechtenstein');
  });
});

/* ── 3 · Currencies are never pooled ──────────────────────────────────────── */

describe('currency discipline', () => {
  const mixed = [
    marginOnly('e1', 'cli-1', 600_000, { currency: 'USD' }),
    marginOnly('e2', 'cli-2', 400_000, { currency: 'USD' }),
    marginOnly('e3', 'cli-3', 900_000, { currency: 'EUR' }),
  ];

  it('computes every axis WITHIN one currency and never adds them together', () => {
    const c = bookConcentration(mixed, ASOF);
    expect(c.currencies).toEqual(['EUR', 'USD']);
    expect(c.perCurrency).toHaveLength(2);

    const eur = c.perCurrency.find((x) => x.currency === 'EUR')!;
    const usd = c.perCurrency.find((x) => x.currency === 'USD')!;
    expect(eur.totalValueCents).toBe(900_000);
    expect(usd.totalValueCents).toBe(1_000_000);
    // EUR has one client, so it is a one-holder book in its own right.
    expect(eur.byAxis.client.hhi).toBe(1);
    expect(usd.byAxis.client.hhi).toBe(0.52); // 0.6² + 0.4²

    // THE ABSENCE THAT MATTERS: no field anywhere holds 1,900,000.
    expect(c.crossCurrencyTotalCents).toBeNull();
    expect(c.notes.join(' ')).toContain('no pooled total');
  });

  it('measures the currency axis in POSITION COUNT, because a share of value would need a rate', () => {
    const mix = bookConcentration(mixed, ASOF).currencyMix;
    expect(mix.basis).toBe('position_count');
    // 2 USD of 3, 1 EUR of 3 → (2/3)² + (1/3)² = 0.5556
    expect(mix.hhi).toBe(0.5556);
    expect(mix.dominant).toMatchObject({ currency: 'USD', positions: 2, valueCents: 1_000_000 });
    expect(mix.crossCurrencyTotalCents).toBeNull();
    expect(mix.headline).toContain('per currency only');
  });

  it('groups a missing currency under UNKNOWN rather than assuming USD', () => {
    const c = bookConcentration([marginOnly('e1', 'cli-1', 100_000, { currency: '' })], ASOF);
    expect(c.currencies).toEqual(['UNKNOWN']);
    expect(c.notes.join(' ')).toContain('rather than assumed to be USD');
  });
});

/* ── 4 · Cash aging boundaries ────────────────────────────────────────────── */

describe('aging bracket boundaries', () => {
  it('files every boundary day in exactly one bracket, with no off-by-one at the edges', () => {
    const cases: [number, string][] = [
      [0, 'd0_7'], [7, 'd0_7'],
      [8, 'd8_30'], [30, 'd8_30'],
      [31, 'd31_60'], [60, 'd31_60'],
      [61, 'd61_90'], [90, 'd61_90'],
      [91, 'd90_plus'], [3_650, 'd90_plus'],
    ];
    for (const [days, key] of cases) expect(bracketForAgeDays(days)).toBe(key);
  });

  it('brackets are contiguous and non-overlapping by construction', () => {
    for (let i = 0; i < AGING_BRACKETS.length - 1; i += 1) {
      expect(AGING_BRACKETS[i].maxDays).not.toBeNull();
      expect(AGING_BRACKETS[i + 1].minDays).toBe(AGING_BRACKETS[i].maxDays! + 1);
    }
    expect(AGING_BRACKETS[AGING_BRACKETS.length - 1].maxDays).toBeNull();
  });

  it('REFUSES a negative or non-finite age instead of filing it in the newest bracket', () => {
    // A future-dated acceptance is a data fault. Filing it under 0–7d hides it
    // in the one column nobody investigates.
    expect(bracketForAgeDays(-1)).toBeNull();
    expect(bracketForAgeDays(Number.NaN)).toBeNull();
    expect(bracketForAgeDays(Number.POSITIVE_INFINITY)).toBeNull();
    expect(ageInDays('2026-09-01T00:00:00Z', ASOF)).toBeNull();
    expect(ageInDays(null, ASOF)).toBeNull();
    expect(ageInDays('not-a-date', ASOF)).toBeNull();
  });

  it('ages unpaid deposits from accepted_at and reports the oldest with its own currency', () => {
    const cash = cashConversion(
      [
        pos({ engagementId: 'e1', status: 'accepted', acceptedAt: daysAgo(5), depositPaidAt: null, depositRequiredCents: 100_000 }),
        pos({ engagementId: 'e2', status: 'accepted', acceptedAt: daysAgo(30), depositPaidAt: null, depositRequiredCents: 200_000 }),
        pos({ engagementId: 'e3', status: 'accepted', acceptedAt: daysAgo(31), depositPaidAt: null, depositRequiredCents: 300_000, clientName: 'Late Ltd' }),
      ],
      ASOF,
    );
    const aging = cash.perCurrency[0].depositAging;
    const byKey = Object.fromEntries(aging.brackets.map((b) => [b.key, b]));

    expect(byKey.d0_7.count).toBe(1);
    expect(byKey.d0_7.amountCents).toBe(100_000);
    expect(byKey.d8_30.count).toBe(1); // exactly 30 days stays in 8–30
    expect(byKey.d31_60.count).toBe(1);
    expect(aging.count).toBe(3);
    expect(aging.amountCents).toBe(600_000);
    expect(aging.oldestDays).toBe(31);
    expect(aging.unaged).toBe(0);
    expect(aging.anchor).toBe('accepted_at');

    expect(cash.oldestUnpaidDeposit).toMatchObject({
      engagementId: 'e3', clientName: 'Late Ltd', days: 31, currency: 'USD', depositRequiredCents: 300_000,
    });
    expect(cash.agedDepositCount).toBe(1); // only e3 is past 30 days
  });

  it('counts an unageable deposit rather than dropping it or dating it today', () => {
    const cash = cashConversion(
      [pos({ status: 'accepted', acceptedAt: '2026-12-01T00:00:00Z', depositPaidAt: null })],
      ASOF,
    );
    const aging = cash.perCurrency[0].depositAging;
    expect(aging.count).toBe(0);
    expect(aging.unaged).toBe(1);
    expect(aging.unagedReason).toContain('dated in the future');
    expect(aging.oldestDays).toBeNull();
    expect(cash.oldestUnpaidDeposit).toBeNull();
  });

  it('a paid deposit ages nothing, and a terminal engagement is not chased', () => {
    const cash = cashConversion(
      [
        pos({ engagementId: 'e1', acceptedAt: daysAgo(200), depositPaidAt: daysAgo(199) }),
        pos({ engagementId: 'e2', status: 'cancelled', acceptedAt: daysAgo(300), depositPaidAt: null }),
      ],
      ASOF,
    );
    expect(cash.awaitingDepositCount).toBe(0);
    expect(cash.oldestUnpaidDeposit).toBeNull();
  });
});

/* ── 5 · The funnel ───────────────────────────────────────────────────────── */

describe('cash conversion funnel', () => {
  it('is cumulative — a collected engagement has also been booked', () => {
    const cash = cashConversion([pos({ status: 'collected', depositPaidAt: daysAgo(30) })], ASOF);
    const byStage = Object.fromEntries(cash.perCurrency[0].stages.map((s) => [s.stage, s.count]));
    expect(byStage).toEqual({ booked: 1, accepted: 1, deposit: 1, invoiced: 1, collected: 1 });
  });

  it('does not count a draft or a pending conflict check as booked', () => {
    const cash = cashConversion(
      [
        pos({ engagementId: 'e1', status: 'draft', acceptedAt: null, depositPaidAt: null }),
        pos({ engagementId: 'e2', status: 'conflict_pending', acceptedAt: null, depositPaidAt: null }),
      ],
      ASOF,
    );
    expect(cash.perCurrency[0].stages.find((s) => s.stage === 'booked')!.count).toBe(0);
  });

  it('reads the deposit TIMESTAMP, so a deposit banked without a signature is still counted', () => {
    // 0047_gps.sql permits exactly this; a status-only reading would lose it.
    const cash = cashConversion(
      [pos({ status: 'proposed', acceptedAt: null, depositPaidAt: daysAgo(3) })],
      ASOF,
    );
    const byStage = Object.fromEntries(cash.perCurrency[0].stages.map((s) => [s.stage, s.count]));
    expect(byStage.deposit).toBe(1);
    expect(byStage.accepted).toBe(0);
  });

  it('SUPPRESSES the rate below MIN_N_FOR_RATE and returns the counts instead', () => {
    const three = Array.from({ length: 3 }, (_, i) =>
      pos({ engagementId: `e${i}`, clientId: `cli-${i}`, status: 'proposed', acceptedAt: null, depositPaidAt: null }),
    );
    const conv = cashConversion(three, ASOF).perCurrency[0].conversions.find((c) => c.from === 'booked')!;
    expect(conv.fromCount).toBe(3);
    expect(conv.ratePct).toBeNull();
    expect(conv.suppressedReason).toContain(String(MIN_N_FOR_RATE));
  });

  it('expresses the rate once the denominator is large enough', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) =>
        pos({ engagementId: `p${i}`, clientId: `cli-p${i}`, status: 'proposed', acceptedAt: null, depositPaidAt: null }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        pos({ engagementId: `a${i}`, clientId: `cli-a${i}`, status: 'accepted', acceptedAt: daysAgo(2), depositPaidAt: null }),
      ),
    ];
    const conv = cashConversion(rows, ASOF).perCurrency[0].conversions.find((c) => c.from === 'booked')!;
    expect(conv.fromCount).toBe(8);
    expect(conv.toCount).toBe(4);
    expect(conv.ratePct).toBe(50);
    expect(conv.suppressedReason).toBeNull();
  });

  it('REFUSES to age receivables when invoiced_at does not exist, and never substitutes updated_at', () => {
    const cash = cashConversion([pos({ status: 'invoiced', depositPaidAt: daysAgo(50) })], ASOF);
    expect(cash.receivableAnchorAvailable).toBe(false);
    expect(cash.receivableAgingRefusal).toContain('no `invoiced_at` column');
    expect(cash.receivableAgingRefusal).toContain('updated_at');
    const r = cash.perCurrency[0].receivableAging;
    expect(r.count).toBe(0);
    expect(r.unaged).toBe(1);
    expect(cash.awaitingCollectionCount).toBe(1);
  });

  it('ages receivables the moment a caller can supply the anchor', () => {
    const cash = cashConversion(
      [pos({ status: 'invoiced', depositPaidAt: daysAgo(50), invoicedAt: daysAgo(45) })],
      ASOF,
    );
    expect(cash.receivableAnchorAvailable).toBe(true);
    expect(cash.receivableAgingRefusal).toBeNull();
    expect(cash.perCurrency[0].receivableAging.oldestDays).toBe(45);
  });

  it('keeps collected cash separate per currency and never totals it', () => {
    const cash = cashConversion(
      [
        pos({ engagementId: 'e1', status: 'collected', currency: 'USD', priceCents: 1_000_000 }),
        pos({ engagementId: 'e2', status: 'collected', currency: 'EUR', priceCents: 2_000_000 }),
      ],
      ASOF,
    );
    expect(cash.perCurrency.map((c) => [c.currency, c.collectedCents])).toEqual([
      ['EUR', 2_000_000], ['USD', 1_000_000],
    ]);
    expect(cash.crossCurrencyTotalCents).toBeNull();
  });
});

/* ── 6 · The binding constraint ───────────────────────────────────────────── */

/** A book with no cash pressure at all. */
const CLEAN_CASH: CashConversion = cashConversion([pos({ depositPaidAt: daysAgo(30) })], ASOF);
/** One accepted engagement whose deposit is 45 days unpaid. */
const PRESSURED_CASH: CashConversion = cashConversion(
  [pos({ status: 'accepted', acceptedAt: daysAgo(45), depositPaidAt: null, clientName: 'Slow Co' })],
  ASOF,
);

/** Every supply constraint clear and demand present: nothing should bind. */
function healthyInput(over: Partial<Parameters<typeof bindingConstraint>[0]> = {}) {
  return {
    benchSpareSlots: 2,
    offersWithNamedPartner: 3,
    unstaffableActive: 0,
    coordinationHoursPerWeek: 4,
    capacityHoursPerWeek: 12,
    coordinationHoursArePlaceholders: false,
    cash: CLEAN_CASH,
    liveOpportunities: 3,
    blockingQuotingDecisions: 0,
    priceBandsArePlaceholders: false,
    ...over,
  };
}

describe('bindingConstraint', () => {
  it('names an absent bench as the constraint, not as full capacity', () => {
    const b = bindingConstraint(healthyInput({ offersWithNamedPartner: 0, benchSpareSlots: 0 }));
    expect(b.code).toBe('unstaffable_offers');
    expect(b.reason).toContain('No offer in the catalogue names a delivering partner');
    expect(b.remedy).toContain('D5');
  });

  it('flags engagements already sold onto an offer with no partner', () => {
    const b = bindingConstraint(healthyInput({ offersWithNamedPartner: 3, unstaffableActive: 2 }));
    expect(b.code).toBe('unstaffable_offers');
    expect(b.reason).toContain('2 active engagements');
    expect(b.reason).toContain('invisible to the capacity arithmetic');
  });

  it('names bench capacity when partners exist and have no slot', () => {
    const b = bindingConstraint(healthyInput({ benchSpareSlots: 0 }));
    expect(b.code).toBe('bench_capacity');
    expect(b.reason).toContain('Zero spare slots');
  });

  it('names his own coordination hours, and says money will not relieve them', () => {
    const b = bindingConstraint(healthyInput({ coordinationHoursPerWeek: 12, capacityHoursPerWeek: 12 }));
    expect(b.code).toBe('coordination_hours');
    expect(b.reason).toContain('no amount of money relieves');
    expect(b.remedy).toContain('Reduce scope');
  });

  it('names the client and the amount when cash is the constraint', () => {
    const b = bindingConstraint(healthyInput({ cash: PRESSURED_CASH }));
    expect(b.code).toBe('cash_collection');
    expect(b.reason).toContain('Slow Co');
    expect(b.reason).toContain('45 days');
    expect(b.reason).toContain('USD 6,000.00');
    expect(b.reason).toContain('stop delivery starting');
  });

  it('names quotability, and admits it blocks the instrument rather than the business', () => {
    const b = bindingConstraint(healthyInput({ priceBandsArePlaceholders: true, blockingQuotingDecisions: 2 }));
    expect(b.code).toBe('quotability');
    expect(b.reason).toContain('placeholder');
    // The founder has closed ~$250k of these manually. A tool that called its own
    // missing config "the constraint on the business" would be flattering itself.
    expect(b.reason).toContain('blocks the instrument, not the business');
  });

  it('SAYS "you are simply not selling" when nothing on the supply side binds', () => {
    const b = bindingConstraint(healthyInput({ liveOpportunities: 0 }));
    expect(b.code).toBe('demand');
    expect(b.reason).toContain('Nothing is limiting you — you are simply not selling');
    expect(b.remedy).toContain('rankTargets()');
  });

  it('reports nothing binding, with no remedy, when the book genuinely has headroom', () => {
    const b = bindingConstraint(healthyInput());
    expect(b.code).toBe('none');
    expect(b.remedy).toBeNull();
    expect(b.reason).toContain('execution, not the book');
    expect(b.considered.every((c) => !c.binds)).toBe(true);
  });

  it('refuses to declare the book unconstrained when a check could not run', () => {
    const b = bindingConstraint(healthyInput({ benchSpareSlots: null, coordinationHoursPerWeek: null }));
    expect(b.code).toBe('insufficient_data');
    expect(b.unevaluable).toEqual(['bench_capacity', 'coordination_hours']);
    expect(b.reason).toContain('is not a conclusion this data supports');
  });

  it('a null input can never bind — a missing figure is not a clear one', () => {
    const b = bindingConstraint(healthyInput({ benchSpareSlots: null }));
    const check = b.considered.find((c) => c.code === 'bench_capacity')!;
    expect(check.evaluable).toBe(false);
    expect(check.binds).toBe(false);
    expect(check.reason).toContain('Not tested');
  });

  it('returns every candidate in precedence order whether it bound or not (D2)', () => {
    const b = bindingConstraint(healthyInput({ offersWithNamedPartner: 0, benchSpareSlots: 0, cash: PRESSURED_CASH }));
    expect(b.considered.map((c) => c.code)).toEqual([...CONSTRAINT_PRECEDENCE]);
    // Three constraints bind; the hardest wall wins and the others stay visible.
    expect(b.code).toBe('unstaffable_offers');
    expect(b.considered.filter((c) => c.binds).map((c) => c.code)).toContain('cash_collection');
  });

  it('ranks cash above quotability, because one is a client conversation and the other is config', () => {
    const b = bindingConstraint(healthyInput({ cash: PRESSURED_CASH, priceBandsArePlaceholders: true }));
    expect(b.code).toBe('cash_collection');
  });

  it('reports confidence beside the verdict, degraded by placeholders rather than hidden', () => {
    const solid = bindingConstraint(healthyInput({ cash: CLEAN_CASH }));
    const shaky = bindingConstraint(
      healthyInput({ benchSpareSlots: null, offersWithNamedPartner: null, coordinationHoursArePlaceholders: true, priceBandsArePlaceholders: true }),
    );
    expect(shaky.confidence).toBe('low');
    expect(solid.confidence).not.toBe('low');
    expect(solid.confidenceBasis).toContain('never folded into it');
  });

  it('every figure behind the verdict is traceable to what produced it (D1)', () => {
    const b = bindingConstraint(healthyInput({ cash: PRESSURED_CASH }));
    expect(b.evidence.length).toBeGreaterThanOrEqual(8);
    for (const e of b.evidence) {
      expect(e.source.length).toBeGreaterThan(0);
      expect(e.value.length).toBeGreaterThan(0);
    }
    expect(b.evidence.find((e) => e.label === 'Bench spare slots')!.source).toContain('benchHeadroom()');
    expect(b.evidence.find((e) => e.label === 'Oldest unpaid deposit')!.value).toContain('45d');
  });
});

/* ── 7 · Book health ──────────────────────────────────────────────────────── */

/**
 * Three equal clients, one partner, one offer, one jurisdiction. Client
 * concentration is inside tolerance; the other three axes are single-holder.
 */
const THREE_CLIENTS: BookPosition[] = [
  marginOnly('e1', 'cli-1', 300_000),
  marginOnly('e2', 'cli-2', 300_000),
  marginOnly('e3', 'cli-3', 300_000),
];

function healthOf(positions: readonly BookPosition[], over: Record<string, unknown> = {}) {
  const concentration = bookConcentration(positions, ASOF);
  const cash = cashConversion(positions, ASOF);
  const constraint = bindingConstraint(healthyInput({ cash }));
  return bookHealth({ positions, concentration, cash, constraint, ...over });
}

describe('bookHealth', () => {
  it('drivers sum to exactly the score, so the number can be reconstructed by addition (D1)', () => {
    const h = healthOf(THREE_CLIENTS);
    // 100 base − client 0 (hhi 0.3333 is inside tolerance) − partner 10 − offer 5
    // − jurisdiction 3 − nothing else = 82.
    expect(h.score).toBe(82);
    expect(h.drivers.reduce((a, d) => a + d.points, 0)).toBe(h.score);
    expect(h.drivers.find((d) => d.label.startsWith('Base'))!.points).toBe(100);
    expect(h.grade).toBe('healthy');
  });

  it('does NOT fold confidence into the score — the alpha.ts:230 pattern is deliberately not followed', () => {
    const bare = healthOf(THREE_CLIENTS);
    const withHistory = healthOf(THREE_CLIENTS, { collectionHistory: { collected: 7, total: 8 } });
    expect(withHistory.score).toBe(bare.score);
    expect(withHistory.drivers).toEqual(bare.drivers);
    expect(bare.confidenceBasis).toContain('never multiplies the score');
  });

  it('states no ICD-203 likelihood without a base rate, and says why', () => {
    const h = healthOf(THREE_CLIENTS);
    expect(h.collectionOutlook).toBeNull();
    expect(h.collectionOutlookRefusal).toContain('invented precision');
    expect(h.collectionOutlookRefusal).toContain('no outcome table');
  });

  it('uses the ICD-203 lexicon the moment a realised base rate exists', () => {
    const h = healthOf(THREE_CLIENTS, { collectionHistory: { collected: 7, total: 8 } });
    expect(h.collectionOutlook).not.toBeNull();
    expect(h.collectionOutlook!.likelihood.term).toBe('very likely'); // 7/8 = 87.5%
    expect(h.collectionOutlook!.phrase).toContain('n=8');
    expect(h.collectionOutlook!.sampleSize).toBe(8);
    expect(h.collectionOutlookRefusal).toBeNull();
  });

  it('puts a BAND on the score when attribution is missing, and a point when it is not', () => {
    const attributed = healthOf(THREE_CLIENTS);
    expect(attributed.scoreBand.isPoint).toBe(true);
    expect(attributed.scoreBand.low).toBe(attributed.score);
    expect(attributed.scoreBand.high).toBe(attributed.score);

    const partial = healthOf([
      marginOnly('e1', 'cli-1', 300_000, { partner: 'partner-a' }),
      marginOnly('e2', 'cli-2', 300_000, { partner: null }),
      marginOnly('e3', 'cli-3', 300_000, { partner: null }),
    ]);
    expect(partial.scoreBand.isPoint).toBe(false);
    expect(partial.scoreBand.high).toBeGreaterThan(partial.scoreBand.low);
    expect(partial.scoreBand.basis).toContain('unattributed');
  });

  it('charges a loss-making position and argues back about it (D4)', () => {
    const h = healthOf([
      marginOnly('e1', 'cli-1', 600_000),
      pos({ engagementId: 'e2', clientId: 'cli-2', priceCents: 500_000, vendorCostCents: 900_000 }),
    ]);
    expect(h.drivers.find((d) => d.label.includes('below vendor cost'))!.points).toBe(-7);
    expect(h.statements.join(' ')).toContain('no volume that fixes that');
  });

  it('charges an aged deposit exactly once, never in both cash and the constraint', () => {
    const positions = [pos({ status: 'accepted', acceptedAt: daysAgo(45), depositPaidAt: null })];
    const concentration = bookConcentration(positions, ASOF);
    const cash = cashConversion(positions, ASOF);
    const constraint = bindingConstraint(healthyInput({ cash }));
    const h = bookHealth({ positions, concentration, cash, constraint });

    expect(constraint.code).toBe('cash_collection');
    expect(h.drivers.find((d) => d.label.includes('unpaid beyond'))!.points).toBe(-8);
    // The constraint driver exists and is worth zero — the deduction is not doubled.
    expect(h.drivers.find((d) => d.label.startsWith('Binding constraint'))!.points).toBe(0);
    expect(h.drivers.reduce((a, d) => a + d.points, 0)).toBe(h.score);
  });

  it('refuses to call an empty book healthy', () => {
    const h = healthOf([]);
    expect(h.headline).toContain('empty screen, not a healthy one');
    expect(h.confidence).toBe('low');
  });

  it('names the dominant holder in the driver label, not just in a tooltip', () => {
    const h = healthOf([
      marginOnly('e1', 'cli-1', 900_000),
      marginOnly('e2', 'cli-2', 100_000),
    ]);
    const client = h.drivers.find((d) => d.label.startsWith('Client concentration'))!;
    expect(client.label).toContain('CLI-1');
    expect(client.label).toContain('90%');
    expect(client.points).toBeLessThan(0);
  });

  it('scores an unmeasurable axis at zero and says so, rather than passing it as clean', () => {
    const h = healthOf([
      marginOnly('e1', 'cli-1', 300_000, { partner: null }),
      marginOnly('e2', 'cli-2', 300_000, { partner: null }),
    ]);
    const partner = h.drivers.find((d) => d.label.startsWith('Delivering partner concentration'))!;
    expect(partner.points).toBe(0);
    expect(partner.label).toContain('not measurable');
    expect(h.statements.join(' ')).toContain('cannot be measured');
  });

  it('grades down as the book deteriorates', () => {
    const single = healthOf([marginOnly('e1', 'cli-1', 1_000_000)]);
    const spread = healthOf(THREE_CLIENTS);
    expect(single.score).toBeLessThan(spread.score);
    expect(['watch', 'strained', 'critical']).toContain(single.grade);
  });
});

/* ── 8 · No float money, anywhere ─────────────────────────────────────────── */

/** Every key ending in `Cents` must hold an integer or null. Recursive. */
function assertIntegerCents(node: unknown, path = '$'): number {
  let checked = 0;
  if (Array.isArray(node)) {
    node.forEach((v, i) => { checked += assertIntegerCents(v, `${path}[${i}]`); });
    return checked;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/Cents\d?$/.test(k)) {
        if (v !== null && v !== undefined) {
          expect(typeof v, `${path}.${k}`).toBe('number');
          expect(Number.isInteger(v), `${path}.${k} = ${String(v)} is not an integer`).toBe(true);
          checked += 1;
        }
      } else {
        checked += assertIntegerCents(v, `${path}.${k}`);
      }
    }
  }
  return checked;
}

describe('money is integer cents everywhere', () => {
  it('never emits a fractional cent, even when the caller hands us floats', () => {
    // A float price and a float cost is what a careless caller produces; the
    // engine must not propagate it into an amount that reaches an invoice.
    const positions = [
      pos({ engagementId: 'e1', clientId: 'cli-1', priceCents: 1_999_999.7, vendorCostCents: 800_000.4, depositRequiredCents: 599_999.6 }),
      pos({ engagementId: 'e2', clientId: 'cli-2', priceCents: 1_000_000.5, vendorCostCents: 333_333.33, status: 'accepted', acceptedAt: daysAgo(45), depositPaidAt: null, currency: 'EUR' }),
      pos({ engagementId: 'e3', clientId: 'cli-3', priceCents: 700_000, vendorCostCents: 250_000, status: 'invoiced', invoicedAt: daysAgo(20) }),
    ];
    const concentration = bookConcentration(positions, ASOF, { includeTerminal: true });
    const cash = cashConversion(positions, ASOF);
    const constraint = bindingConstraint(healthyInput({ cash }));
    const health = bookHealth({ positions, concentration, cash, constraint });

    const n =
      assertIntegerCents(concentration, 'concentration') +
      assertIntegerCents(cash, 'cash') +
      assertIntegerCents(health, 'health');
    // Guard the guard: a walker that found nothing would pass silently.
    expect(n).toBeGreaterThan(30);
  });

  it('positionValueCents rounds rather than truncating, and margin may go negative', () => {
    expect(positionValueCents(pos({ priceCents: 100.6, vendorCostCents: 0 }), 'margin')).toBe(101);
    expect(positionValueCents(pos({ priceCents: 100, vendorCostCents: 350 }), 'margin')).toBe(-250);
    expect(positionValueCents(pos({ priceCents: 100.4, vendorCostCents: 900 }), 'price')).toBe(100);
  });
});

/* ── 9 · Structural absences ──────────────────────────────────────────────── */

describe('deliberate absences', () => {
  it('exposes no cross-currency total on any surface', () => {
    const positions = [
      marginOnly('e1', 'cli-1', 500_000, { currency: 'USD' }),
      marginOnly('e2', 'cli-2', 500_000, { currency: 'EUR' }),
    ];
    const c = bookConcentration(positions, ASOF);
    const cash = cashConversion(positions, ASOF);
    expect(c.crossCurrencyTotalCents).toBeNull();
    expect(c.currencyMix.crossCurrencyTotalCents).toBeNull();
    expect(cash.crossCurrencyTotalCents).toBeNull();
    // And no per-currency figure has quietly absorbed the other currency.
    for (const ccy of c.perCurrency) expect(ccy.totalValueCents).toBe(500_000);
  });

  it('covers all four value axes on every currency, so none can be silently dropped', () => {
    const c = bookConcentration([marginOnly('e1', 'cli-1', 100_000)], ASOF);
    for (const ccy of c.perCurrency) {
      expect(Object.keys(ccy.byAxis).sort()).toEqual([...VALUE_AXES].sort());
    }
  });

  it('states the aged-deposit threshold as an exported constant, so a surface highlights where the engine speaks', () => {
    expect(AGED_DEPOSIT_ALARM_DAYS).toBe(30);
    const justInside = cashConversion(
      [pos({ status: 'accepted', acceptedAt: daysAgo(AGED_DEPOSIT_ALARM_DAYS), depositPaidAt: null })],
      ASOF,
    );
    const justOutside = cashConversion(
      [pos({ status: 'accepted', acceptedAt: daysAgo(AGED_DEPOSIT_ALARM_DAYS + 1), depositPaidAt: null })],
      ASOF,
    );
    expect(justInside.agedDepositCount).toBe(0);
    expect(justOutside.agedDepositCount).toBe(1);
  });
});

/* ── 10 · The wire contract ───────────────────────────────────────────────── */

describe('BookResponse is the one declaration both sides import', () => {
  /**
   * This is a COMPILE-TIME test wearing a runtime test's clothes. Building a
   * complete `BookResponse` literal here means any field added, removed or
   * retyped in `book.ts` breaks this file — which is the closest a shared package
   * can get to enforcing that the API and the web agree.
   *
   * The failure it guards against actually happened: a web-side copy of a GPS
   * summary interface declared `counts` / `clientCount` / `openValueCents`, the
   * API never returned them, and the page crashed when real migrations landed.
   */
  it('builds end to end with nothing invented and nothing missing', () => {
    const positions = [pos({ engagementId: 'e1', clientId: 'cli-1' })];
    const concentration = bookConcentration(positions, ASOF);
    const cash = cashConversion(positions, ASOF);
    const constraint = bindingConstraint(healthyInput({ cash }));

    const response: BookResponse = {
      migrated: true,
      asOf: ASOF,
      positionCount: positions.length,
      openPositionCount: positions.filter(isOpenPosition).length,
      currencies: concentration.currencies,
      concentration,
      cash,
      health: bookHealth({ positions, concentration, cash, constraint }),
      // Null in production today: no bench (D5), no outcome table.
      capacity: null,
      wip: null,
      marginRealisation: null,
      placeholders: {
        priceBandsArePlaceholders: true,
        vendorCostsArePlaceholders: true,
        coordinationHoursArePlaceholders: true,
        blockingQuotingDecisions: 2,
        partnerRateCardsSupplied: false,
      },
      unresolved: [
        {
          field: 'priceBandCents',
          owner: 'founder',
          whyItMatters: 'Every quoted number derives from it.',
          consequence: 'No proposal can be issued at a number anyone would honour.',
          blocking: true,
        },
      ],
    };

    expect(response.migrated).toBe(true);
    expect(response.openPositionCount).toBe(1);
    expect(response.capacity).toBeNull();
    // A placeholder is never presented as a measurement.
    expect(response.placeholders.priceBandsArePlaceholders).toBe(true);
    expect(response.unresolved[0].blocking).toBe(true);
  });

  it('distinguishes "not migrated" from "an empty book", which GPS previously could not', () => {
    const empty = bookConcentration([], ASOF);
    const notMigrated: Pick<BookResponse, 'migrated' | 'positionCount'> = { migrated: false, positionCount: 0 };
    const migratedButEmpty: Pick<BookResponse, 'migrated' | 'positionCount'> = { migrated: true, positionCount: 0 };
    expect(notMigrated.migrated).not.toBe(migratedButEmpty.migrated);
    expect(empty.positionCount).toBe(0);
  });
});
