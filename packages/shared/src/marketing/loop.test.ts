/**
 * Behavioural tests for M8 — honest measurement and the loop.
 *
 * These are the regressions that would leave the suite green while turning the module
 * into the vanity dashboard it exists instead of:
 *
 *   1. a suppressed rate arriving as 0 instead of null, or an empty population
 *      rendering identically to a small one,
 *   2. an unavailable record source counted as a zero rather than refused,
 *   3. a refusal for an unobservable metric losing its reason or its substitute,
 *   4. a post-mortem with no changes passing as a completed review,
 *   5. contradiction debt or line staleness being recomputed here with a second
 *      threshold instead of copied from `precedent.ts`,
 *   6. a median appearing under a handful of observations.
 *
 * Every window boundary and every `asOf` is explicit. Nothing reads the clock.
 */
import { describe, expect, it } from 'vitest';
import {
  IMPLEMENTED_PROCESS_METRICS,
  MARKETING_VOLUME_STATEMENT,
  MIN_N_FOR_PROCESS_RATE,
  POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION,
  claimProvenanceRate,
  clearanceLatencyByRole,
  contradictionDebtMetric,
  figureOrRefusal,
  ignoreWithRationaleRate,
  lineStalenessMetric,
  minutesBetween,
  nextUpdateBreachCount,
  notKnownNonEmptyRate,
  notificationCensusFrame,
  ownRecordsFrame,
  postMortem,
  preclearedDerivationRate,
  processRate,
  questionCoverageMetric,
  refuseAngleRanking,
  refuseOutcomeComparison,
  refuseUnobservableMetric,
  refusalCodeFrequency,
  retractionCount,
  timeToFirstStatement,
  unimplementedProcessMetrics,
  wbrMarketingBlock,
  type ClearanceLatencyRecord,
  type DeskItemRecord,
} from './loop.js';
import { contradictionDebt, type PrecedentStatement } from './precedent.js';
import { PROCESS_METRIC_KEYS, REFUSAL_CODES, REFUSED_METRICS, type RefusedMetricKey } from './types.js';

const FROM = '2026-07-27T00:00:00.000Z';
const TO = '2026-08-02T00:00:00.000Z';
const FRAME = ownRecordsFrame(FROM, TO);

function item(over: Partial<DeskItemRecord> = {}): DeskItemRecord {
  return {
    id: 'item-1',
    at: '2026-07-28T10:00:00.000Z',
    derivedFromApprovedLanguageId: null,
    quantitative: [],
    ...over,
  };
}

function statement(over: Partial<PrecedentStatement> = {}): PrecedentStatement {
  return {
    id: 'st-1',
    body: 'LCX has not announced a listing date for this asset.',
    kind: 'position',
    subjects: [{ kind: 'asset', symbol: 'ETH' }],
    questionKey: 'listing_request',
    polarity: 'denies',
    namedTimeframe: null,
    claims: [],
    quantitative: [],
    standing: 'standing',
    supersedes: null,
    supersededBy: null,
    statedAt: '2026-07-01T09:00:00.000Z',
    clearedBy: 'actor-nik',
    clearedAt: '2026-07-01T09:30:00.000Z',
    reviewDueAt: null,
    derivedFromApprovedLanguageId: null,
    contentHash: 'a'.repeat(64),
    ...over,
  };
}

/* ══ 1 · The volume statement, and the frames ══════════════════════════════ */

describe('the volume statement carries the constraint into every response', () => {
  it('is permanently non-learning, non-ranking and non-performance', () => {
    expect(MARKETING_VOLUME_STATEMENT.learns).toBe(false);
    expect(MARKETING_VOLUME_STATEMENT.ranksAngles).toBe(false);
    expect(MARKETING_VOLUME_STATEMENT.measuresPerformance).toBe(false);
    expect(MARKETING_VOLUME_STATEMENT.isTrainableDataset).toBe(false);
    expect(MARKETING_VOLUME_STATEMENT.sampleIsSelfSelected).toBe(true);
    expect(MARKETING_VOLUME_STATEMENT.countsAreLowerBounds).toBe(true);
  });

  it('gives the inbound census no denominator and names its biases', () => {
    const frame = notificationCensusFrame(FROM, TO, '2026-08-01T23:00:00.000Z');
    expect(frame.completeness).toBe('unknown_no_denominator');
    expect(frame.doesNotCapture.length).toBeGreaterThan(3);
    expect(frame.knownBiases.join(' ')).toMatch(/controversy/);
    expect(frame.lastSuccessfulPollAt).toBe('2026-08-01T23:00:00.000Z');
  });

  it('marks our own records as a census, and names the retention truncation when told of it', () => {
    expect(ownRecordsFrame(FROM, TO).completeness).toBe('census_of_own_corpus');
    const truncated = ownRecordsFrame(FROM, TO, { truncatedByRetention: true });
    expect(truncated.doesNotCapture.join(' ')).toMatch(/retention boundary/);
    expect(ownRecordsFrame(FROM, TO).doesNotCapture.join(' ')).not.toMatch(/retention boundary/);
  });
});

/* ══ 2 · Suppression survives, and zero is not absence ═════════════════════ */

describe('process rates', () => {
  it('withholds the percentage below the stated minimum and keeps the counts', () => {
    const r = processRate('precleared_derivation_rate', 1, 3, 'definition', FRAME);
    expect(r.pct).toBeNull();
    expect(r.suppressed).toBe(true);
    expect(r.numerator).toBe(1);
    expect(r.denominator).toBe(3);
    expect(r.suppressionReason).toMatch(new RegExp(`minimum of ${MIN_N_FOR_PROCESS_RATE}`));
  });

  it('distinguishes an empty population from a small one', () => {
    const empty = processRate('claim_provenance_rate', 0, 0, 'definition', FRAME);
    expect(empty.pct).toBeNull();
    expect(empty.suppressionReason).toMatch(/empty population, not a rate of zero/);
    const small = processRate('claim_provenance_rate', 0, 4, 'definition', FRAME);
    expect(small.suppressionReason).not.toMatch(/empty population/);
  });

  it('expresses a real zero as zero once the denominator is large enough', () => {
    const r = processRate('claim_provenance_rate', 0, 12, 'definition', FRAME);
    expect(r.pct).toBe(0);
    expect(r.suppressed).toBe(false);
    expect(r.suppressionReason).toBeNull();
  });

  it('counts assertions rather than items for claim provenance', () => {
    const items = [
      item({
        id: 'i-1',
        quantitative: [
          { metricKey: 'a', valueText: '1', unit: null, asOf: null, sourceRef: 'https://lcx.com/x' },
          { metricKey: 'b', valueText: '2', unit: null, asOf: null, sourceRef: null },
          { metricKey: 'c', valueText: '3', unit: null, asOf: null, sourceRef: '   ' },
        ],
      }),
    ];
    const r = claimProvenanceRate(items, FRAME);
    expect(r.denominator).toBe(3);
    // A blank source reference is not a source reference.
    expect(r.numerator).toBe(1);
  });

  it('measures preclearance over items and carries its frame', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ id: `i-${i}`, derivedFromApprovedLanguageId: i < 9 ? 'lang-1' : null }),
    );
    const r = preclearedDerivationRate(items, FRAME);
    expect(r.pct).toBe(75);
    expect(r.frame.completeness).toBe('census_of_own_corpus');
  });

  it('only counts ignored items in the ignore-with-rationale denominator', () => {
    const r = ignoreWithRationaleRate(
      [
        { itemId: 'a', closedAsIgnore: true, rationale: 'would amplify a small hostile thread' },
        { itemId: 'b', closedAsIgnore: true, rationale: null },
        { itemId: 'c', closedAsIgnore: false, rationale: null },
      ],
      FRAME,
    );
    expect(r.denominator).toBe(2);
    expect(r.numerator).toBe(1);
  });

  it('restricts notKnown to initial-phase statements', () => {
    const r = notKnownNonEmptyRate(
      [
        { id: 's1', phase: 'initial', notKnownIsNonEmpty: true },
        { id: 's2', phase: 'initial', notKnownIsNonEmpty: false },
        { id: 's3', phase: 'maintenance', notKnownIsNonEmpty: false },
      ],
      FRAME,
    );
    expect(r.denominator).toBe(2);
    expect(r.numerator).toBe(1);
  });
});

describe('an unavailable source refuses instead of returning zero', () => {
  it('refuses the next-update breach count when the records were not available', () => {
    const out = nextUpdateBreachCount({ commitments: [], recordsAvailable: false }, TO, FRAME);
    expect(out.count.kind).toBe('absent');
    if (out.count.kind === 'absent') {
      expect(out.count.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
      expect(out.count.refusal.sentence).toMatch(/not a count of zero/);
    }
    expect(out.sentence).toMatch(/unknown for this window/);
  });

  it('reports a genuine zero as a measured zero', () => {
    const out = nextUpdateBreachCount({ commitments: [], recordsAvailable: true }, TO, FRAME);
    expect(out.count.kind).toBe('measured');
    if (out.count.kind === 'measured') expect(out.count.value).toBe(0);
  });

  it('counts a missed deadline whether or not the update ever happened', () => {
    const out = nextUpdateBreachCount(
      {
        commitments: [
          { itemId: 'late', committedBy: 'a', nextUpdateBy: '2026-07-30T00:00:00.000Z', fulfilledAt: '2026-07-31T00:00:00.000Z' },
          { itemId: 'silent', committedBy: 'a', nextUpdateBy: '2026-07-30T00:00:00.000Z', fulfilledAt: null },
          { itemId: 'ontime', committedBy: 'a', nextUpdateBy: '2026-07-30T00:00:00.000Z', fulfilledAt: '2026-07-29T00:00:00.000Z' },
          { itemId: 'future', committedBy: 'a', nextUpdateBy: '2026-08-30T00:00:00.000Z', fulfilledAt: null },
        ],
        recordsAvailable: true,
      },
      TO,
      FRAME,
    );
    expect(out.breachedItemIds).toEqual(['late', 'silent']);
    expect(out.openCommitments).toBe(2);
  });

  it('keeps deletions separate from retractions and says a deletion is not one', () => {
    const out = retractionCount(
      {
        retractions: [{ itemId: 'r1', supersedes: 'p1', at: TO, reason: 'figure was wrong' }],
        deletionsWithNoLinkedRecord: 2,
        recordsAvailable: true,
      },
      FRAME,
    );
    expect(out.linkedRetractions.kind).toBe('measured');
    expect(out.deletionsWithNoLinkedRecord).toBe(2);
    expect(out.sentence).toMatch(/A deletion is not a retraction/);
  });

  it('refuses rather than reporting zero retractions when the records are missing', () => {
    const out = retractionCount(
      { retractions: [], deletionsWithNoLinkedRecord: 0, recordsAvailable: false },
      FRAME,
    );
    expect(out.linkedRetractions.kind).toBe('absent');
  });

  it('turns a null into a refusal and a value into a measured figure', () => {
    expect(figureOrRefusal(null, FRAME, 'Thing', 'the source was down').kind).toBe('absent');
    expect(figureOrRefusal(0, FRAME, 'Thing', '').kind).toBe('measured');
  });
});

/* ══ 3 · The refusals, with their reasons and substitutes ══════════════════ */

describe('the honesty ceiling is refused in code', () => {
  it('gives every refused metric a sentence carrying its reason', () => {
    for (const key of Object.keys(REFUSED_METRICS) as RefusedMetricKey[]) {
      const r = refuseUnobservableMetric(key);
      expect(r.code).toBe('METRIC_NOT_OBSERVABLE');
      expect(r.sentence).toContain(REFUSED_METRICS[key].reason);
      expect(r.rule.instrument).toBe('desk_policy');
    }
  });

  it('says there is no substitute where there is none, and offers one where there is', () => {
    const impressions = refuseUnobservableMetric('impressions');
    expect(impressions.sentence).toMatch(/no honest substitute/);
    expect(impressions.recovery.kind).toBe('not_recoverable');

    const engagement = refuseUnobservableMetric('engagement_rate');
    expect(engagement.sentence).toMatch(/Instead:/);
    expect(engagement.recovery.kind).toBe('different_surface');
  });

  it('refuses a performance comparison with the arithmetic, not with caution', () => {
    const r = refuseOutcomeComparison('yesterday’s listing post');
    expect(r.sentence).toMatch(/lower bounds of unknown tightness/);
    expect(r.sentence).toMatch(/angrier one/);
    expect(r.recovery.kind).toBe('not_recoverable');
    if (r.recovery.kind === 'not_recoverable') {
      expect(r.recovery.why).toMatch(/population, not the sample size/);
    }
  });

  it('refuses to rank angles at all', () => {
    const r = refuseAngleRanking();
    expect(r.sentence).toMatch(/will not rank angles/);
    expect(r.recovery.kind).toBe('not_recoverable');
  });
});

/* ══ 4 · Refusal frequency: the read on whether the gates are alive ════════ */

describe('refusal frequency', () => {
  const events = [
    { code: 'ART_90_ASSET_UNDER_EMBARGO' as const, at: TO, itemId: 'a' },
    { code: 'ART_90_ASSET_UNDER_EMBARGO' as const, at: TO, itemId: 'b' },
    { code: 'REGULATED_PROMISE_PRICE' as const, at: TO, itemId: 'c' },
  ];

  it('orders by count descending then code ascending, deterministically', () => {
    const forward = refusalCodeFrequency(events, FRAME).rows;
    const reversed = refusalCodeFrequency([...events].reverse(), FRAME).rows;
    expect(forward).toEqual(reversed);
    expect(forward[0]?.code).toBe('ART_90_ASSET_UNDER_EMBARGO');
    expect(forward[0]?.count).toBe(2);
  });

  it('enumerates the codes that never fired and refuses to interpret that', () => {
    const out = refusalCodeFrequency(events, FRAME);
    expect(out.neverFired.length).toBe(REFUSAL_CODES.length - 2);
    expect(out.neverFired).not.toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(out.neverFiredMeaning).toMatch(/cannot tell those apart/);
  });

  it('does not read a quiet window as evidence the gates work', () => {
    const out = refusalCodeFrequency([], FRAME);
    expect(out.total).toBe(0);
    expect(out.lines[0]).toMatch(/not evidence the gates are working/);
  });
});

/* ══ 5 · Clocks: no median on a handful, no average across incidents ═══════ */

describe('clearance latency', () => {
  function clearance(role: ClearanceLatencyRecord['role'], minutes: number, i: number): ClearanceLatencyRecord {
    const start = Date.parse('2026-07-28T09:00:00.000Z') + i * 3_600_000;
    return {
      role,
      requestedAt: new Date(start).toISOString(),
      clearedAt: new Date(start + minutes * 60_000).toISOString(),
      reviewer: `actor-${i}`,
    };
  }

  it('withholds the median under the threshold and lists the individual hold times', () => {
    const rows = clearanceLatencyByRole([clearance('policy', 30, 0), clearance('policy', 90, 1)], FRAME).rows;
    const policy = rows.find((r) => r.role === 'policy')!;
    expect(policy.medianMinutes).toBeNull();
    expect(policy.observations).toEqual([30, 90]);
    expect(policy.sentence).toMatch(/No median at this n/);
  });

  it('expresses a median once there are enough observations', () => {
    const records = Array.from({ length: 11 }, (_, i) => clearance('sme', (i + 1) * 10, i));
    const sme = clearanceLatencyByRole(records, FRAME).rows.find((r) => r.role === 'sme')!;
    expect(sme.n).toBe(11);
    expect(sme.medianMinutes).toBe(60);
    expect(sme.slowestMinutes).toBe(110);
  });

  it('reports every lane including the ones that cleared nothing', () => {
    const rows = clearanceLatencyByRole([], FRAME).rows;
    expect(rows.map((r) => r.role)).toEqual(['reputation', 'policy', 'sme', 'legal']);
    for (const r of rows) {
      expect(r.n).toBe(0);
      expect(r.medianMinutes).toBeNull();
      expect(r.suppressionReason).toMatch(/empty population, not a fast lane/);
    }
  });

  it('excludes unreadable timestamps rather than counting them as instant', () => {
    const out = clearanceLatencyByRole(
      [{ role: 'legal', requestedAt: 'whenever', clearedAt: TO, reviewer: 'a' }],
      FRAME,
    );
    expect(out.unreadableDates).toBe(1);
    expect(out.rows.find((r) => r.role === 'legal')!.n).toBe(0);
  });

  it('returns null minutes on an unreadable instant', () => {
    expect(minutesBetween('2026-07-28T09:00:00.000Z', '2026-07-28T10:30:00.000Z')).toBe(90);
    expect(minutesBetween('nope', TO)).toBeNull();
  });
});

describe('time to first statement', () => {
  it('treats continuing silence as a breach once the budget has elapsed', () => {
    const out = timeToFirstStatement(
      [
        { incidentId: 'inc-1', detectedAt: '2026-08-01T00:00:00.000Z', firstStatementAt: null, budgetMinutes: 60 },
        { incidentId: 'inc-2', detectedAt: '2026-08-01T23:30:00.000Z', firstStatementAt: '2026-08-01T23:50:00.000Z', budgetMinutes: 60 },
      ],
      TO,
      FRAME,
    );
    expect(out.rows[0]?.stillSilent).toBe(true);
    expect(out.rows[0]?.withinBudget).toBe(false);
    expect(out.rows[1]?.withinBudget).toBe(true);
    expect(out.breachCount).toBe(1);
    expect(out.stillSilentCount).toBe(1);
  });

  it('never reports an average across incidents, and says why', () => {
    const out = timeToFirstStatement([], TO, FRAME);
    expect(out.averageIsWithheld).toMatch(/never set to the same target/);
    expect(Object.keys(out)).not.toContain('meanMinutes');
    expect(Object.keys(out)).not.toContain('medianMinutes');
  });

  it('does not default an unreadable clock to "budget met"', () => {
    const out = timeToFirstStatement(
      [{ incidentId: 'inc-x', detectedAt: 'unknown', firstStatementAt: null, budgetMinutes: 60 }],
      TO,
      FRAME,
    );
    expect(out.rows[0]?.withinBudget).toBeNull();
    expect(out.notAssessable).toBe(1);
    expect(out.breachCount).toBe(0);
  });
});

/* ══ 6 · Debt and staleness are COPIED, not recomputed ═════════════════════ */

describe('contradiction debt and staleness come from precedent.ts unchanged', () => {
  const corpus = [
    statement({ id: 'st-yes', polarity: 'affirms', statedAt: '2026-06-01T00:00:00.000Z' }),
    statement({ id: 'st-no', polarity: 'denies', statedAt: '2026-07-01T00:00:00.000Z' }),
  ];

  it('reports exactly the count precedent.ts reports, with the same definition', () => {
    const direct = contradictionDebt(corpus, TO);
    const metric = contradictionDebtMetric(corpus, TO, FRAME);
    expect(metric.count).toBe(direct.count);
    expect(metric.byAxis).toEqual(direct.byAxis);
    expect(metric.definition).toBe(direct.definition);
    expect(metric.softFlagCount).toBe(direct.softFlags.length);
  });

  it('says "not computable" rather than zero when there is nothing standing to compare', () => {
    const metric = contradictionDebtMetric([], TO, FRAME);
    expect(metric.standingCompared).toBe(0);
    expect(metric.sentence).toMatch(/not computable/);
    expect(metric.sentence).toMatch(/not a debt of zero/);
  });

  it('counts staleness by verdict and keeps notAssessable out of current', () => {
    const metric = lineStalenessMetric(
      [
        statement({ id: 'fresh', kind: 'position', statedAt: '2026-07-20T00:00:00.000Z' }),
        statement({ id: 'unreadable', statedAt: 'March-ish' }),
        statement({
          id: 'expired',
          claims: [{ claimId: 'c', versionAtUse: 1, category: 'x', validTo: '2026-05-01' }],
        }),
      ],
      TO,
      FRAME,
    );
    expect(metric.byVerdict.current).toBe(1);
    expect(metric.byVerdict.not_assessable).toBe(1);
    expect(metric.byVerdict.rests_on_expired_claim).toBe(1);
    expect([...metric.staleStatementIds].sort()).toEqual(['expired', 'unreadable']);
  });

  it('ignores non-standing statements in staleness, as precedent.ts does in debt', () => {
    const metric = lineStalenessMetric([statement({ standing: 'retracted' })], TO, FRAME);
    expect(metric.standingConsidered).toBe(0);
    expect(metric.sentence).toMatch(/nothing standing to assess/);
  });

  it('reports the axes it could not check rather than implying a full pass', () => {
    const metric = lineStalenessMetric(
      [statement({ claims: [{ claimId: 'c', versionAtUse: 1, category: 'x', validTo: null }] })],
      TO,
      FRAME,
    );
    expect(metric.axesNotCheckedCount).toBe(1);
  });

  it('gives question coverage as a count and a list of the uncovered keys, never a percentage', () => {
    const metric = questionCoverageMetric([statement()], TO, FRAME);
    expect(metric.covered).toBe(1);
    expect(metric.uncoveredKeys.length).toBe(metric.total - 1);
    expect(metric.uncoveredKeys).toContain('are_you_solvent');
    expect(metric.sentence).not.toMatch(/%/);
    expect(metric.caveat).toMatch(/invisible to this table/);
  });
});

/* ══ 7 · A loop that produces no change is decoration ══════════════════════ */

describe('the post-mortem', () => {
  const base = {
    periodFrom: FROM,
    periodTo: TO,
    whatWasSaid: [{ itemId: 'i-1', summary: 'answered a withdrawal question' }],
    refusals: [{ code: 'REGULATED_PROMISE_PRICE' as const, at: TO, itemId: 'i-2' }],
    frame: FRAME,
  };

  it('names a period that changed nothing instead of letting it pass as complete', () => {
    const out = postMortem({ ...base, learnings: [], changes: [] });
    expect(out.producedNoChange).toBe(true);
    expect(out.lines.join(' ')).toContain(POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION);
  });

  it('treats an explicit "nothing changed" entry as no change, not as a change', () => {
    const out = postMortem({
      ...base,
      learnings: [],
      changes: [{ kind: 'nothing_changed', description: 'reviewed, nothing to alter', owner: 'actor-nik', at: TO }],
    });
    expect(out.producedNoChange).toBe(true);
  });

  it('clears the flag once a substantive change is recorded with an owner', () => {
    const out = postMortem({
      ...base,
      learnings: [],
      changes: [{ kind: 'line_precleared', description: 'added are_you_solvent line', owner: 'actor-nik', at: TO }],
    });
    expect(out.producedNoChange).toBe(false);
    expect(out.lines.join(' ')).toMatch(/line_precleared \(actor-nik\)/);
  });

  it('counts learnings that cite no measurable metric', () => {
    const out = postMortem({
      ...base,
      learnings: [
        { statement: 'the embargo gate is doing the work', supportedBy: 'refusal_rate_by_code', evidence: '2 of 3 refusals were embargo' },
        { statement: 'the queue feels calmer', supportedBy: null, evidence: 'impression from reading it' },
      ],
      changes: [],
    });
    expect(out.unevidencedLearnings).toBe(1);
    expect(out.lines.join(' ')).toMatch(/1 cite no measurable metric/);
  });

  it('names an empty learnings list as a finding about the review', () => {
    const out = postMortem({ ...base, learnings: [], changes: [] });
    expect(out.lines.join(' ')).toMatch(/finding about the review/);
  });

  it('refuses to rank, in the shape as well as in the prose', () => {
    const out = postMortem({ ...base, learnings: [], changes: [] });
    expect(out.refusesToRank).toBe(true);
    expect(out.volume.ranksAngles).toBe(false);
    expect(Object.keys(out)).not.toContain('bestAngle');
    expect(Object.keys(out)).not.toContain('ranking');
  });
});

/* ══ 8 · The weekly block, and the metric vocabulary ═══════════════════════ */

describe('the weekly block', () => {
  const input = {
    weekStart: '2026-07-27',
    generatedAt: TO,
    frame: FRAME,
    items: [item({ derivedFromApprovedLanguageId: 'lang-1' })],
    refusals: [{ code: 'ART_90_ASSET_UNDER_EMBARGO' as const, at: TO, itemId: 'i-9' }],
    clearances: [],
    closures: [],
    crisisStatements: [],
    precedentCorpus: [statement()],
  };

  it('prints a withheld rate as WITHHELD with its counts, never as a bare percentage', () => {
    const printed = wbrMarketingBlock(input).lines.join('\n');
    expect(printed).toMatch(/week of 2026-07-27/);
    expect(printed).toMatch(/precleared_derivation_rate: WITHHELD — 1\/1/);
    expect(printed).not.toMatch(/precleared_derivation_rate: 100%/);
  });

  it('states what it is not showing, and why', () => {
    const block = wbrMarketingBlock(input);
    expect(block.refusedMetrics.length).toBe(Object.keys(REFUSED_METRICS).length);
    expect(block.lines.join(' ')).toMatch(/Not shown, and why/);
    expect(block.lines.join(' ')).toContain(REFUSED_METRICS.share_of_voice.reason);
  });

  it('carries the volume statement and the window onto the printed block', () => {
    const block = wbrMarketingBlock(input);
    expect(block.volume.measuresPerformance).toBe(false);
    expect(block.lines.join(' ')).toMatch(/census_of_own_corpus/);
  });

  it('names unreadable clearance timestamps rather than silently dropping them', () => {
    const block = wbrMarketingBlock({
      ...input,
      clearances: [{ role: 'policy', requestedAt: 'nope', clearedAt: TO, reviewer: 'a' }],
    });
    expect(block.lines.join(' ')).toMatch(/had unreadable timestamps and were excluded/);
  });

  it('implements every metric in the vocabulary, and reports any it does not', () => {
    expect([...IMPLEMENTED_PROCESS_METRICS].sort()).toEqual([...PROCESS_METRIC_KEYS].sort());
    expect(unimplementedProcessMetrics()).toEqual([]);
  });
});
