import { describe, expect, it } from 'vitest';
import {
  DELIVERY_FINISHED_STATUSES, MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT,
  isDeliveryFinished, observedEffortEvidence, waterfallShape,
  type StageActualInput, type StatedTriple,
} from './waterfall.js';
import { OFFER_KEYS } from './types.js';

/**
 * The closing leg of G5, and the two fabrications it refuses.
 *
 * FIRST DRAFT OF THIS MODULE DIVIDED RECORDED HOURS BY A HARDCODED 8 to get days, then
 * compared those days against the effort triple — and the plan pushes that comparison
 * into a price. `CostModel.hoursPerDay` is nullable precisely because the divisor is a
 * fact on the partner's rate card, and underwriting already REFUSES to price an hourly
 * card that has none. So hours are always reported and days are reported only when a
 * divisor was stated; `no_hours_per_day_stated` is the verdict in between.
 *
 * IT ALSO COUNTED IN-FLIGHT ENGAGEMENTS. An engagement still in delivery has recorded
 * PART of its hours, so mixing it in drags the median down — toward quoting cheaper
 * than the work costs. Only finished engagements feed an inferential figure now; the
 * rest are reported separately so they are visible rather than silently included.
 */

const row = (over: Partial<StageActualInput> = {}): StageActualInput => ({
  engagementId: 'e1', offerKey: 'mica_whitepaper', stage: 'ai_draft',
  hours: 8, costCents: 0, engagementStatus: 'delivered', recordedAt: '2026-08-20T00:00:00.000Z',
  ...over,
});

/** n engagements of `hours` each, split across the three stages. */
const engagements = (
  n: number, hours: number,
  over: Partial<StageActualInput> = {},
) =>
  Array.from({ length: n }, (_, i) => [
    row({ ...over, engagementId: `e${i}`, stage: 'ai_draft', hours: hours / 2 }),
    row({ ...over, engagementId: `e${i}`, stage: 'internal_qa', hours: hours / 4 }),
    row({ ...over, engagementId: `e${i}`, stage: 'partner', hours: hours / 4, costCents: 120_000 }),
  ]).flat();

const TRIPLE: StatedTriple = {
  offerKey: 'mica_whitepaper', optimisticDays: 8, likelyDays: 12, pessimisticDays: 16,
};
const HPD = { hoursPerDayByOffer: { mica_whitepaper: 8 } } as const;

describe('the divisor is never invented', () => {
  it('reports HOURS and refuses DAYS when no hours-per-day is stated', () => {
    const o = waterfallShape(engagements(4, 96), [TRIPLE]).byOffer[0];
    expect(o.observedHours).toEqual({ min: 96, median: 96, max: 96 });
    expect(o.observedDays).toBeNull();
    expect(o.hoursPerDayUsed).toBeNull();
    expect(o.verdict).toBe('no_hours_per_day_stated');
    expect(o.reading).toContain('without inventing the divisor');
    // Critically: NO verdict is passed on the triple when days do not exist.
    expect(o.reading).not.toContain('ABOVE');
    expect(o.reading).not.toContain('holding');
  });

  it('derives days, and echoes the divisor, once the card states one', () => {
    const o = waterfallShape(engagements(4, 96), [TRIPLE], HPD).byOffer[0];
    expect(o.hoursPerDayUsed).toBe(8);
    expect(o.observedDays).toEqual({ min: 12, median: 12, max: 12 });
    expect(o.verdict).toBe('inside_band');
  });

  it('treats a zero or negative divisor as no divisor at all', () => {
    for (const bad of [0, -8]) {
      const o = waterfallShape(engagements(3, 96), [TRIPLE], { hoursPerDayByOffer: { mica_whitepaper: bad } }).byOffer[0];
      expect(o.observedDays).toBeNull();
      expect(o.verdict).toBe('no_hours_per_day_stated');
    }
  });
});

describe('in-flight engagements never bias the median', () => {
  it('names the finished statuses and excludes everything else', () => {
    expect(DELIVERY_FINISHED_STATUSES).toEqual(['delivered', 'invoiced', 'collected']);
    expect(isDeliveryFinished('in_delivery')).toBe(false);
    // Terminal but not delivered: a partial spend on work that stopped, not a total.
    expect(isDeliveryFinished('closed_lost')).toBe(false);
    expect(isDeliveryFinished('cancelled')).toBe(false);
  });

  it('excludes a partly-recorded in-flight engagement from the median and reports it', () => {
    const shape = waterfallShape([
      ...engagements(3, 96),                                        // finished, 12d each
      ...engagements(1, 8, { engagementStatus: 'in_delivery' })      // 1h so far — would drag it down
        .map((r) => ({ ...r, engagementId: 'wip-1' })),
    ], [TRIPLE], HPD);
    const o = shape.byOffer[0];
    expect(o.engagements).toBe(3);
    expect(o.observedDays!.median).toBe(12);
    expect(o.observedDays!.min).toBe(12); // NOT 1 — the in-flight row is not a sample
    expect(o.inFlight).toEqual({ engagements: 1, totalHours: 8 });
    expect(o.reading).toContain('still in delivery are excluded');
    expect(o.reading).toContain('bias this toward cheaper quotes');
    expect(shape.engagementsInFlight).toBe(1);
    expect(shape.engagementsMeasured).toBe(3);
  });

  it('says so honestly when EVERY engagement is still in flight', () => {
    const o = waterfallShape(engagements(2, 40, { engagementStatus: 'in_delivery' }), [TRIPLE], HPD).byOffer[0];
    expect(o.engagements).toBe(0);
    expect(o.observedHours).toBeNull();
    expect(o.verdict).toBe('withheld_small_n');
    expect(o.reading).toContain('No FINISHED engagement');
  });
});

describe('observed values are facts and always print', () => {
  it('reports order statistics at n=1 with the verdict withheld', () => {
    const o = waterfallShape(engagements(1, 80), [TRIPLE], HPD).byOffer[0];
    expect(o.observedDays).toEqual({ min: 10, median: 10, max: 10 });
    expect(o.verdict).toBe('withheld_small_n');
    expect(o.reading).toContain(`needs ${MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT}`);
  });

  it('counts each stage independently and never infers one from another', () => {
    const o = waterfallShape([
      row({ engagementId: 'a', stage: 'ai_draft', hours: 8 }),
      row({ engagementId: 'b', stage: 'ai_draft', hours: 8 }),
      row({ engagementId: 'a', stage: 'partner', hours: 16, costCents: 200_000 }),
    ], []).byOffer[0];
    expect(o.stages.find((x) => x.stage === 'ai_draft')!.engagements).toBe(2);
    expect(o.stages.find((x) => x.stage === 'partner')!.engagements).toBe(1);
    const qa = o.stages.find((x) => x.stage === 'internal_qa')!;
    expect(qa.engagements).toBe(0);
    expect(qa.meanHoursPerEngagement).toBeNull();
  });

  it('the median is an OBSERVED sample, never the mean of two', () => {
    const o = waterfallShape([
      row({ engagementId: 'x1', hours: 16 }), row({ engagementId: 'x2', hours: 32 }),
      row({ engagementId: 'x3', hours: 160 }), row({ engagementId: 'x4', hours: 320 }),
    ], []).byOffer[0];
    expect([16, 32, 160, 320]).toContain(o.observedHours!.median);
    expect(o.observedHours!.min).toBe(16);
    expect(o.observedHours!.max).toBe(320);
  });

  it('carries the most recent recording instant, for a measured triple to cite', () => {
    const o = waterfallShape([
      row({ engagementId: 'a', recordedAt: '2026-08-01T00:00:00.000Z' }),
      row({ engagementId: 'b', recordedAt: '2026-08-19T00:00:00.000Z' }),
    ], []).byOffer[0];
    expect(o.lastRecordedAt).toBe('2026-08-19T00:00:00.000Z');
  });
});

describe('the verdict, once it is earned', () => {
  it('above_pessimistic says every price on this triple underwrote a cost that does not happen', () => {
    const o = waterfallShape(engagements(3, 200), [TRIPLE], HPD).byOffer[0];
    expect(o.verdict).toBe('above_pessimistic');
    expect(o.reading).toContain('Re-approve the effort-triples packet');
  });

  it('below_optimistic names the opposite risk', () => {
    const o = waterfallShape(engagements(3, 32), [TRIPLE], HPD).byOffer[0];
    expect(o.verdict).toBe('below_optimistic');
  });

  it('no_triple_stated when there is no baseline to judge against', () => {
    const o = waterfallShape(engagements(5, 72), [], HPD).byOffer[0];
    expect(o.verdict).toBe('no_triple_stated');
    expect(o.reading).toContain('nothing to compare');
  });
});

describe('blind spots and purity', () => {
  it('names every offer with no recorded actuals rather than implying zero effort', () => {
    const s = waterfallShape(engagements(2, 80, { offerKey: 'diagnostic' }), []);
    expect(s.offersWithNoActuals).toEqual(OFFER_KEYS.filter((k) => k !== 'diagnostic'));
    expect(s.engagementsMeasured).toBe(2);
  });

  it('never mutates its inputs', () => {
    const triples = [{ ...TRIPLE }];
    const rows = engagements(4, 240);
    const before = JSON.stringify({ triples, rows });
    waterfallShape(rows, triples, HPD);
    expect(JSON.stringify({ triples, rows })).toBe(before);
  });

  it('is deterministic regardless of row order', () => {
    const rows = engagements(3, 88);
    const a = waterfallShape(rows, [TRIPLE], HPD);
    const b = waterfallShape([...rows].reverse(), [TRIPLE], HPD);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('observedEffortEvidence — the line that closes the loop', () => {
  it('cites hours, the divisor and the instant — never a day figure it cannot derive', () => {
    const noDivisor = observedEffortEvidence(waterfallShape(engagements(3, 200), [TRIPLE]));
    expect(noDivisor[0].claim).toContain('recorded hour(s)');
    expect(noDivisor[0].claim).toContain('NOT expressed in days');

    const withDivisor = observedEffortEvidence(waterfallShape(engagements(3, 200), [TRIPLE], HPD));
    expect(withDivisor[0].claim).toContain("at the card's 8h/day");
    expect(withDivisor[0].basis).toContain('gps_stage_actual');
    expect(withDivisor[0].basis).toContain('most recently 2026-08-20');
  });

  it('is EMPTY when nothing finished has been measured', () => {
    expect(observedEffortEvidence(waterfallShape([], [TRIPLE]))).toEqual([]);
    expect(observedEffortEvidence(
      waterfallShape(engagements(2, 40, { engagementStatus: 'in_delivery' }), [TRIPLE], HPD),
    )).toEqual([]);
  });
});
