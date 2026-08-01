/**
 * Behavioural tests for THE LOOP wire layer.
 *
 * What matters here is not that the numbers add up — `calibration.test.ts` already
 * proves that over 43 cases. It is that the wire layer cannot LOSE the engine's
 * refusals on the way to a screen. Three regressions would each leave every other
 * test green while destroying the point of the phase:
 *
 *   1. a suppressed rate arriving as 0 instead of null,
 *   2. a review packet that adjusts the weights it was handed,
 *   3. "nothing can be concluded" rendering identically to "no data yet".
 *
 * Each has its own describe block, and each asserts an ABSENCE as well as a value.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOK_MONITOR_SPECS,
  EMPTY_OUTCOME_CAPTURE_DRAFT,
  LOOP_VOLUME_STATEMENT,
  calibrationHealthView,
  loopResponse,
  outcomeCaptureForm,
  registerableBookMonitors,
  reviewPacket,
  suppressibleRate,
  wbrGpsBlock,
  type CaptureSubject,
  type OutcomeCaptureDraft,
} from './loop.js';
import {
  ASSUMED_ANNUAL_ENGAGEMENT_VOLUME,
  MIN_N_FOR_RATE,
  MIN_N_PER_ARM_FOR_SEPARATION,
  winLossSummary,
  type OutcomeRecord,
  type PriorWeights,
} from './calibration.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function won(i: number, over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    engagementId: `eng-w-${i}`,
    clientId: `cli-${i}`,
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

function lost(i: number, over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    ...won(i),
    engagementId: `eng-l-${i}`,
    disposition: 'lost',
    reason: 'price_too_high',
    realisedPriceCents: null,
    realisedVendorCostCents: null,
    acceptanceFirstPass: null,
    ...over,
  };
}

/** n records, alternating won/lost, half of them carrying quote-time factor scores. */
function book(n: number, withScores = false): OutcomeRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const scores = withScores ? { need: i % 2 === 0 ? 80 : 30, urgency: 50 } : null;
    return i % 2 === 0
      ? won(i, { factorScoresAtQuote: scores })
      : lost(i, { factorScoresAtQuote: scores });
  });
}

/**
 * n records where every win is still UNBILLED — realised figures absent.
 *
 * This is the realistic early book, not a contrived one: a partner invoices weeks
 * after delivery, so for most of the first year every won engagement sits in
 * `excludedIncompleteRealisation` and the margin question has no answer either.
 * It is the only fixture in which n=3 honestly concludes NOTHING.
 */
function unbilledBook(n: number): OutcomeRecord[] {
  return book(n).map((r) =>
    r.disposition === 'won' ? { ...r, realisedPriceCents: null, realisedVendorCostCents: null } : r,
  );
}

const WEIGHTS: PriorWeights = Object.freeze({ need: 0.3, urgency: 0.2, access: 0.5 });

const SUBJECT: CaptureSubject = {
  engagementId: 'eng-1',
  clientId: 'cli-1',
  offerKey: 'gtm_sprint',
  status: 'delivered',
  quotedPriceCents: 2_000_000,
  quotedVendorCostCents: 800_000,
};

/* ══════════════════════════════════════════════════════════════════════════ */

describe('suppression survives the wire — a withheld rate is null, never 0', () => {
  it('reports null and the counts at n below MIN_N_FOR_RATE', () => {
    const records = book(3);
    const rate = suppressibleRate(winLossSummary(records).overall);

    expect(rate.pct).toBeNull();
    // The load-bearing assertion: not 0, not -1, not NaN, not '—'.
    expect(rate.pct).not.toBe(0);
    expect(rate.suppressed).toBe(true);
    expect(rate.suppressionReason).toMatch(/below the stated minimum/i);
    expect(rate.interval95Pct).toBeNull();
    // Something honest to render in the null branch.
    expect(rate.counts.won + rate.counts.lost).toBe(3);
    expect(rate.n).toBe(3);
    expect(rate.minN).toBe(MIN_N_FOR_RATE);
  });

  it('expresses a rate WITH its interval once the threshold is reached', () => {
    const rate = suppressibleRate(winLossSummary(book(MIN_N_FOR_RATE)).overall);

    expect(rate.pct).not.toBeNull();
    expect(rate.suppressed).toBe(false);
    expect(rate.suppressionReason).toBeNull();
    // D3: the width travels with the point estimate.
    expect(rate.interval95Pct).not.toBeNull();
    expect(rate.interval95Pct!.highPct).toBeGreaterThan(rate.interval95Pct!.lowPct);
  });

  it('an EMPTY book still yields null rather than a zero rate', () => {
    const rate = suppressibleRate(winLossSummary([]).overall);
    expect(rate.pct).toBeNull();
    expect(rate.counts).toEqual({ won: 0, lost: 0 });
  });

  it('carries the suppressed null all the way into the printable WBR block', () => {
    const block = wbrGpsBlock({
      weekStart: '2026-07-27',
      generatedAt: '2026-08-01T09:00:00.000Z',
      records: unbilledBook(3),
      recordsThisWeek: [],
      wip: null,
    });

    expect(block.pooledWinRate.pct).toBeNull();
    // And the printed line says WITHHELD rather than showing a number.
    expect(block.lines.join('\n')).toMatch(/WITHHELD/);
    expect(block.lines.join('\n')).not.toMatch(/win rate: 0%/i);
    // Unmeasurable margin is null, NOT a zero slippage — "we held our margin
    // exactly" and "nobody has invoiced yet" are opposite claims.
    expect(block.marginSlippageMeanCents).toBeNull();
    expect(block.awaitingRealisedFigures).toBe(2);
    expect(block.caveats.join(' ')).toMatch(/absent rather than zero/i);
  });

  it('a genuine zero slippage is reported as zero, not suppressed', () => {
    // The counterpart to the test above: `book(3)` realises exactly what it quoted,
    // so 0 is the measurement. Suppressing it would be the opposite error.
    const block = wbrGpsBlock({
      weekStart: '2026-07-27',
      generatedAt: '2026-08-01T09:00:00.000Z',
      records: book(3),
      recordsThisWeek: [],
      wip: null,
    });
    expect(block.marginSlippageMeanCents).toBe(0);
    expect(block.awaitingRealisedFigures).toBe(0);
  });

  it('the volume statement is on every response and states the constraint', () => {
    expect(LOOP_VOLUME_STATEMENT.assumedAnnualEngagementVolume).toBe(ASSUMED_ANNUAL_ENGAGEMENT_VOLUME);
    expect(LOOP_VOLUME_STATEMENT.minNForRate).toBe(MIN_N_FOR_RATE);
    expect(LOOP_VOLUME_STATEMENT.minNPerArmForSeparation).toBe(MIN_N_PER_ARM_FOR_SEPARATION);
    expect(LOOP_VOLUME_STATEMENT.isTrainableDataset).toBe(false);
    expect(LOOP_VOLUME_STATEMENT.learns).toBe(false);
    expect(LOOP_VOLUME_STATEMENT.adjustsWeights).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('the review packet reviews and changes nothing', () => {
  it('leaves the caller’s weights deep-equal after the call', () => {
    const mine: PriorWeights = { need: 0.3, urgency: 0.2, access: 0.5 };
    const before = JSON.parse(JSON.stringify(mine)) as PriorWeights;

    const packet = reviewPacket(book(20, true), mine);

    expect(mine).toEqual(before);
    expect(packet.packet.weightsReviewed).toEqual(before);
    // Not merely equal — no key gained, lost or reordered.
    expect(Object.keys(mine)).toEqual(Object.keys(before));
  });

  it('is unchanged by running twice on the same weights object', () => {
    const mine: PriorWeights = { need: 0.3, urgency: 0.2 };
    reviewPacket(book(20, true), mine);
    reviewPacket(book(20, true), mine);
    expect(mine).toEqual({ need: 0.3, urgency: 0.2 });
  });

  it('cannot express an adjustment', () => {
    const packet = reviewPacket(book(20, true), WEIGHTS);

    expect(packet.weightsMutated).toBe(false);
    expect(packet.weightsAreAStatedPrior).toBe(true);
    // `never[]` — the empty array is the only assignable value.
    expect(packet.proposedWeightChanges).toEqual([]);
    expect(packet.packet.autoAdjustmentApplied).toBe(false);
    expect(packet.packet.humanReviewRequired).toBe(true);
    expect(packet.weightChangeMechanism).toContain('a human edits');
    // ABSENCE: no field on the packet holds a post-review weight vector.
    expect(Object.keys(packet)).not.toContain('weightsAfter');
    expect(Object.keys(packet)).not.toContain('newWeights');
    expect(Object.keys(packet.packet)).not.toContain('weightsAfter');
  });

  it('reports insufficient evidence as ROWS, not as an absence, at small n', () => {
    const packet = reviewPacket(book(6, true), WEIGHTS);

    // One row per weighted factor even when nothing can be said about any of them.
    expect(packet.rows.length).toBeGreaterThanOrEqual(Object.keys(WEIGHTS).length);
    expect(packet.noFactorReviewable).toBe(true);
    expect(packet.insufficientEvidenceCount).toBe(packet.rows.length);
    for (const row of packet.rows) {
      expect(row.insufficientEvidence).toBe(true);
      expect(row.source.note).toMatch(/minimum|no conclusion|insufficient|spread/i);
      // n is on the row, so a printed table cannot lose it.
      expect(row.minNPerArm).toBe(MIN_N_PER_ARM_FOR_SEPARATION);
      expect(row.openNumbers.length).toBeGreaterThan(0);
    }
    expect(packet.headline).toMatch(/no factor is reviewable/i);
  });

  it('all four verdict keys are present even at zero count', () => {
    const packet = reviewPacket([], WEIGHTS);
    expect(Object.keys(packet.verdictCounts).sort()).toEqual([
      'apparent_separation_toward_lost',
      'apparent_separation_toward_won',
      'insufficient_evidence',
      'no_apparent_separation',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('calibration health gives materially different verdicts at n=0, 3 and 40', () => {
  const at0 = calibrationHealthView([]);
  const at3 = calibrationHealthView(book(3));
  const at40 = calibrationHealthView(book(40));
  /** Three outcomes, none billed — the case where the honest answer really is "nothing". */
  const at3Unbilled = calibrationHealthView(unbilledBook(3));

  it('three distinct verdicts, not three shades of empty', () => {
    expect(at0.verdict).toBe('no_outcomes_at_all');
    // Two of the three wins carry realised figures, so margin IS measurable on 2 —
    // which is why the verdict is `counts_only` and not `nothing_can_be_concluded`.
    // The distinction is deliberate: "we can measure margin on two engagements" and
    // "we can conclude nothing" are different reports and must not collapse.
    expect(at3.verdict).toBe('counts_only');
    expect(at40.verdict).toBe('per_offer_rates_available');

    const verdicts = new Set([at0.verdict, at3.verdict, at40.verdict]);
    expect(verdicts.size).toBe(3);
    // And the headlines differ, because the verdict alone is not what a human reads.
    expect(new Set([at0.headline, at3.headline, at40.headline]).size).toBe(3);
  });

  it('"nothing can be concluded" is a verdict, not an empty state', () => {
    expect(at3Unbilled.verdict).toBe('nothing_can_be_concluded');
    expect(at3Unbilled.isNothingConcludable).toBe(true);
    expect(at3Unbilled.health.recordCount).toBe(3);
    // It is ABOUT three records — it is not the n=0 report wearing a different label.
    expect(at3Unbilled.headline).toContain('3');
    expect(at3Unbilled.headline).not.toEqual(at0.headline);
    expect(at3Unbilled.headline).toMatch(/not "no data"|nothing/i);
  });

  it('n=0 and an unbilled n=3 both carry the full question list — never an empty array', () => {
    for (const view of [at0, at3Unbilled]) {
      expect(view.conclusions).toHaveLength(6);
      expect(view.isNothingConcludable).toBe(true);
      expect(view.canConclude).toEqual([]);
      expect(view.cannotConclude).toHaveLength(6);
      // Every unanswerable question still has a stated reason. No blanks, no dashes.
      for (const c of view.conclusions) {
        expect(c.answerable).toBe(false);
        expect(c.answer.length).toBeGreaterThan(20);
        expect(c.answer).not.toBe('\u2014');
      }
    }
  });

  it('distinguishes "no outcomes" from "three outcomes, nothing concludable"', () => {
    expect(at0.health.recordCount).toBe(0);
    expect(at3.health.recordCount).toBe(3);
    expect(at3.conclusions[0]!.n).toBe(3);
    expect(at0.conclusions[0]!.n).toBe(0);
    expect(at0.headline).toMatch(/no outcomes recorded/i);
    // Neither pretends the wait is over: at 3 decided engagements the best-covered
    // offer is still short of MIN_N_FOR_RATE, so the wait is reported in YEARS.
    expect(at3.estimatedYearsToFirstOfferRate).toBeGreaterThan(0);
    expect(at0.estimatedYearsToFirstOfferRate).toBeGreaterThan(0);
  });

  it('at n=3 the win rate is refused, however it is asked', () => {
    for (const view of [at3, at3Unbilled]) {
      const overall = view.conclusions.find((c) => c.key === 'overall_win_rate')!;
      const perOffer = view.conclusions.find((c) => c.key === 'per_offer_win_rate')!;
      expect(overall.answerable).toBe(false);
      expect(perOffer.answerable).toBe(false);
      expect(overall.answer).toMatch(/below the stated minimum/i);
      expect(overall.interval95Pct).toBeNull();
      expect(view.health.offersWhereRateCanBeExpressed).toEqual([]);
    }
  });

  it('at n=40 some questions answer and the model question still does not', () => {
    expect(at40.isNothingConcludable).toBe(false);
    expect(at40.canConclude.length).toBeGreaterThan(0);
    expect(at40.health.canExpressOverallWinRate).toBe(true);

    const model = at40.conclusions.find((c) => c.key === 'trainable_model')!;
    expect(model.answerable).toBe(false);
    expect(model.answer).toMatch(/not by waiting/i);
    expect(at40.health.canTrainAModel).toBe(false);
  });

  it('states what it may not conclude at every volume', () => {
    for (const view of [at0, at3, at3Unbilled, at40]) {
      expect(view.cannotConclude.length).toBeGreaterThan(0);
      expect(view.statements.length).toBeGreaterThan(0);
      expect(view.volume.learns).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */

describe('every book monitor proposes; none acts', () => {
  it('covers exactly the five conditions of plan §8 (12.4)', () => {
    expect(BOOK_MONITOR_SPECS.map((s) => s.key)).toEqual([
      'deposit_overdue',
      'conflict_missing',
      'margin_below_floor',
      'bench_headroom_zero',
      'perimeter_stale',
    ]);
  });

  it.each(BOOK_MONITOR_SPECS.map((s) => [s.key, s] as const))(
    '%s proposes to a human and mutates nothing',
    (_key, spec) => {
      expect(spec.mutatesState).toBe(false);
      expect(spec.requiresHumanAction).toBe(true);
      // Only the two proposal-shaped ids in the action registry.
      expect(['notify', 'create_task']).toContain(spec.proposes.actionId);
      // The fire ends at a decision someone has to make.
      expect(spec.proposes.decisionRequested.length).toBeGreaterThan(20);
      expect(spec.why.length).toBeGreaterThan(20);

      // ABSENCE: no spec carries anything that could execute or write.
      const keys = Object.keys(spec);
      for (const forbidden of ['action', 'execute', 'mutation', 'sql', 'onFire', 'apply']) {
        expect(keys).not.toContain(forbidden);
      }
      // The condition names a metric KEY, never an inline expression.
      expect(spec.condition.metric).toMatch(/^gps_[a-z0-9_]+$/);
      expect(spec.condition.metric).not.toMatch(/select|from|;/i);
      expect(typeof spec.condition.threshold).toBe('number');
      expect(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']).toContain(spec.condition.op);
    },
  );

  it('names the wiring each one needs instead of implying it works', () => {
    for (const spec of BOOK_MONITOR_SPECS) {
      expect(spec.wiringRequired.length).toBeGreaterThan(0);
    }
  });

  it('specs resting on placeholders are registered disabled', () => {
    for (const spec of BOOK_MONITOR_SPECS) {
      if (spec.blockedOnPlaceholders) expect(spec.enabledOnRegistration).toBe(false);
    }
    // Two of five could be enabled today; the honest count is asserted so a future
    // edit that quietly enables a placeholder-backed monitor fails here.
    expect(registerableBookMonitors().map((s) => s.key)).toEqual([
      'deposit_overdue',
      'conflict_missing',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('outcome capture makes an incomplete capture visibly incomplete', () => {
  it('an empty draft yields no record and says why', () => {
    const form = outcomeCaptureForm(SUBJECT, EMPTY_OUTCOME_CAPTURE_DRAFT);

    expect(form.record).toBeNull();
    expect(form.completeness).toBe('empty');
    expect(form.blockers.map((b) => b.code)).toEqual([
      'disposition_missing',
      'reason_missing',
      'decided_at_missing',
    ]);
    // Every field is listed even though every field is empty.
    expect(form.fields).toHaveLength(9);
    expect(form.realisedMarginCents).toBeNull();
    expect(form.marginSlippageCents).toBeNull();
  });

  it('a won engagement with no partner invoice yet is recordable AND incomplete', () => {
    const draft: OutcomeCaptureDraft = {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
      realisedPriceCents: 1_900_000,
    };
    const form = outcomeCaptureForm(SUBJECT, draft);

    expect(form.completeness).toBe('ready_awaiting_realisation');
    expect(form.record).not.toBeNull();
    expect(form.record!.realisedVendorCostCents).toBeNull();
    expect(form.missingForMarginRealisation).toEqual(['realisedVendorCostCents']);
    // Margin stays absent rather than being computed off a half pair.
    expect(form.realisedMarginCents).toBeNull();
    expect(form.headline).toMatch(/incomplete/i);

    const cost = form.fields.find((f) => f.key === 'realisedVendorCostCents')!;
    expect(cost.status).toBe('awaiting_external_event');
    expect(cost.consequenceIfAbsent).toMatch(/costSlippageMeanCents/);
  });

  it('a lost engagement is complete without realised figures', () => {
    const form = outcomeCaptureForm({ ...SUBJECT, status: 'closed_lost' }, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'lost',
      reason: 'no_decision',
      decidedAt: '2026-07-30',
    });

    expect(form.completeness).toBe('complete');
    expect(form.record!.realisedPriceCents).toBeNull();
    expect(form.missingForMarginRealisation).toEqual([]);
    expect(form.fields.find((f) => f.key === 'realisedPriceCents')!.status).toBe('not_applicable');
  });

  it('refuses a loss reason on a win, with the reason', () => {
    const form = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'price_too_high',
      decidedAt: '2026-07-30',
    });

    expect(form.record).toBeNull();
    expect(form.completeness).toBe('blocked');
    expect(form.blockers.map((b) => b.code)).toContain('reason_invalid_for_disposition');
    expect(form.blockers.find((b) => b.code === 'reason_invalid_for_disposition')!.field).toBe('reason');
  });

  it('argues back when a win is claimed before acceptance', () => {
    const form = outcomeCaptureForm({ ...SUBJECT, status: 'proposed' }, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
      realisedPriceCents: 2_000_000,
      realisedVendorCostCents: 800_000,
    });

    expect(form.record).toBeNull();
    expect(form.blockers.map((b) => b.code)).toContain('won_before_acceptance');
  });

  it('refuses realised figures on a loss and a negative realised amount', () => {
    const onLost = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'lost',
      reason: 'no_budget',
      decidedAt: '2026-07-30',
      realisedPriceCents: 500_000,
    });
    expect(onLost.blockers.map((b) => b.code)).toContain('realised_price_on_lost');

    const negative = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
      realisedPriceCents: -100,
    });
    expect(negative.blockers.map((b) => b.code)).toContain('negative_realised_figure');
    expect(negative.record).toBeNull();
  });

  it('never defaults the realised price to the quoted price', () => {
    const form = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
    });
    // Were this defaulted, priceSlippageMeanCents would read zero forever.
    expect(form.record!.realisedPriceCents).toBeNull();
    expect(form.record!.realisedPriceCents).not.toBe(SUBJECT.quotedPriceCents);
  });

  it('computes slippage only when both realised sides exist, and keeps the sign', () => {
    const form = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
      realisedPriceCents: 1_900_000,
      realisedVendorCostCents: 1_000_000,
    });

    expect(form.completeness).toBe('complete');
    expect(form.quotedMarginCents).toBe(1_200_000);
    expect(form.realisedMarginCents).toBe(900_000);
    expect(form.marginSlippageCents).toBe(-300_000); // negative = given away
    expect(form.openNumbers.map((d) => d.label)).toContain('Slippage (cents) = realised − quoted margin');
  });

  it('tells the operator which fields are recorded but not aggregated', () => {
    const form = outcomeCaptureForm(SUBJECT, {
      ...EMPTY_OUTCOME_CAPTURE_DRAFT,
      disposition: 'won',
      reason: 'referral',
      decidedAt: '2026-07-30',
      cycleTimeDays: 42,
      acceptanceFirstPass: true,
    });

    expect(form.fields.find((f) => f.key === 'cycleTimeDays')!.status).toBe('recorded_not_aggregated');
    expect(form.fields.find((f) => f.key === 'acceptanceFirstPass')!.status).toBe('recorded_not_aggregated');
  });

  it('offers only the reasons legal for the chosen disposition', () => {
    expect(outcomeCaptureForm(SUBJECT, EMPTY_OUTCOME_CAPTURE_DRAFT).reasonOptions).toBeNull();
    const winForm = outcomeCaptureForm(SUBJECT, { ...EMPTY_OUTCOME_CAPTURE_DRAFT, disposition: 'won' });
    expect(winForm.reasonOptions).toContain('referral');
    expect(winForm.reasonOptions).not.toContain('price_too_high');
    // `unknown` stays legal for both, deliberately (calibration.ts:126).
    expect(winForm.reasonOptions).toContain('unknown');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('the loop response', () => {
  const response = loopResponse({
    asOf: '2026-08-01T09:00:00.000Z',
    records: unbilledBook(3),
    recordsThisWeek: [],
    weekStart: '2026-07-27',
    currentWeights: WEIGHTS,
    wip: null,
  });

  it('carries every block on an almost-empty book', () => {
    expect(response.capture).toBeNull(); // no engagement named
    expect(response.review).toBeTruthy();
    expect(response.health.conclusions).toHaveLength(6);
    expect(response.monitors).toHaveLength(5);
    expect(response.wbr.lines.length).toBeGreaterThan(4);
    expect(response.dataSources.length).toBeGreaterThanOrEqual(4);
    expect(response.notices.length).toBeGreaterThan(2);
  });

  it('states the volume constraint and the exclusions at the top level', () => {
    expect(response.volume.isTrainableDataset).toBe(false);
    expect(response.notices.join(' ')).toMatch(/cancelled engagements are excluded/i);
    expect(response.notices.join(' ')).toMatch(/none acts/i);
    expect(response.notices.join(' ')).toMatch(/nothing on this page is concludable/i);
  });

  it('every block names its provenance and its absences (D1)', () => {
    for (const src of response.dataSources) {
      expect(src.asOf).toBe('2026-08-01T09:00:00.000Z');
      expect(src.reads.length).toBeGreaterThan(10);
      expect(['operator_entered', 'code_constant', 'derived']).toContain(src.sourceGrade);
    }
    const monitors = response.dataSources.find((s) => s.block === 'monitors')!;
    expect(monitors.sourceGrade).toBe('code_constant');
    expect(monitors.notPresent.join(' ')).toMatch(/METRIC_SQL/);
  });

  it('includes the capture form when an engagement is named', () => {
    const withCapture = loopResponse({
      asOf: '2026-08-01T09:00:00.000Z',
      records: unbilledBook(3),
      recordsThisWeek: [],
      weekStart: '2026-07-27',
      currentWeights: WEIGHTS,
      wip: null,
      capture: { subject: SUBJECT },
    });
    expect(withCapture.capture).not.toBeNull();
    expect(withCapture.capture!.record).toBeNull();
    expect(withCapture.dataSources.some((s) => s.block === 'capture')).toBe(true);
  });

  it('does not mutate the weights it was given', () => {
    const mine: PriorWeights = { need: 0.3 };
    loopResponse({
      asOf: '2026-08-01T09:00:00.000Z',
      records: book(20, true),
      recordsThisWeek: [],
      weekStart: '2026-07-27',
      currentWeights: mine,
      wip: null,
      capture: null,
    });
    expect(mine).toEqual({ need: 0.3 });
  });
});
