/**
 * Behavioural tests for the precedent index.
 *
 * Four regressions would each leave a green suite while destroying the point of the
 * module, so each has its own describe block and each asserts an ABSENCE as well as a
 * value:
 *
 *   1. `no_match` rendering identically to `corpus_empty` — "the desk has not answered
 *      this" collapsing into "the desk cannot see what it answered".
 *   2. the best near-miss being returned as precedent when nothing clears the floor.
 *   3. contradiction debt drifting into a heuristic — counting a soft flag, counting a
 *      pair that carries an explicit supersedes link, or counting a retracted
 *      statement.
 *   4. a staleness verdict of `current` on a statement whose date could not be read,
 *      or whose claim-version axis was never checked.
 *
 * Every fixture is dated explicitly. Nothing here reads the clock, because a test that
 * passes in August and fails in September is not a test.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRADICTION_AXES,
  CONTRADICTION_DEBT_DEFINITION,
  GROUPING_IS_LEXICAL_NOT_SEMANTIC,
  MAX_PRECEDENT_HITS,
  MIN_TRIGRAM_SIMILARITY,
  QUESTION_KEYS,
  QUESTION_LABEL,
  QUESTION_SURFACE_FORMS,
  classifyQuestion,
  contradictionDebt,
  corpusWindow,
  daysBetween,
  findPrecedent,
  precedentPanel,
  questionCoverage,
  stalenessOf,
  subjectKey,
  trigramSimilarity,
  type PrecedentStatement,
  type PrecedentQuery,
} from './precedent.js';
// The compartment's ONE lexical normaliser. It used to be declared here and again,
// byte-identically, in `adoption.ts`; it decides what "the same words" means, which is a
// rule and not a helper, so it lives in the vocabulary and both callers import it.
import { normaliseForMatch } from './types.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const ASOF = '2026-08-02T00:00:00.000Z';

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

const QUERY: PrecedentQuery = {
  subjects: [{ kind: 'asset', symbol: 'ETH' }],
  questionKey: 'listing_request',
  draftBody: 'We have not announced a listing date for this asset.',
  claimIds: [],
};

/* ══ 1 · Absence is three different facts ══════════════════════════════════ */

describe('an empty corpus and an unmatched corpus are different answers', () => {
  it('refuses with DATA_ABSENT_NOT_ZERO when the index holds nothing', () => {
    const out = findPrecedent(QUERY, [], ASOF);
    expect(out.outcome).toBe('corpus_empty');
    expect(out.hits).toEqual([]);
    expect(out.refusal?.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(out.refusal?.recovery.kind).toBe('supply_data');
    expect(out.comparedCount).toBe(0);
    // The sentence must not claim the desk said nothing.
    expect(out.sentence).not.toMatch(/has not answered/);
  });

  it('says the desk has not answered this when the corpus is populated and nothing matches', () => {
    const corpus = [
      statement({
        id: 'st-other',
        subjects: [{ kind: 'asset', symbol: 'SOL' }],
        questionKey: 'fee_question',
        body: 'Trading fees are published on the fee schedule page.',
      }),
    ];
    const out = findPrecedent(QUERY, corpus, ASOF);
    expect(out.outcome).toBe('no_match');
    expect(out.hits).toEqual([]);
    expect(out.refusal).not.toBeNull();
    expect(out.refusal?.code).not.toBe('DATA_ABSENT_NOT_ZERO');
    expect(out.sentence).toMatch(/has not answered this before/);
    expect(out.comparedCount).toBe(1);
  });

  it('never returns an empty hit list without a refusal to render in its place', () => {
    for (const out of [findPrecedent(QUERY, [], ASOF), findPrecedent(QUERY, [statement({ id: 'x', subjects: [], questionKey: null, body: 'zzz' })], ASOF)]) {
      if (out.hits.length === 0) expect(out.refusal).not.toBeNull();
    }
  });

  it('reports the retention question as unresolved on every window, including an empty one', () => {
    expect(corpusWindow([], false).retentionPolicyResolved).toBe(false);
    expect(corpusWindow([statement()], true).retentionPolicyResolved).toBe(false);
    expect(corpusWindow([], false).statement).toMatch(/cannot see/);
    expect(corpusWindow([statement()], true).statement).toMatch(/retention boundary/);
  });
});

/* ══ 2 · The near-miss must not be promoted ════════════════════════════════ */

describe('retrieval will not present the best near-miss as precedent', () => {
  const nearMiss = statement({
    id: 'st-near',
    subjects: [{ kind: 'asset', symbol: 'DOT' }],
    questionKey: 'token_availability',
    body: 'Deposits and withdrawals for this network are operating normally today.',
  });

  it('withholds a statement below the similarity floor even when it is the only candidate', () => {
    const query: PrecedentQuery = {
      subjects: [],
      questionKey: null,
      draftBody: 'Will you ever consider adding a governance token to the roadmap?',
      claimIds: [],
    };
    expect(trigramSimilarity(query.draftBody, nearMiss.body)).toBeLessThan(MIN_TRIGRAM_SIMILARITY);
    const out = findPrecedent(query, [nearMiss], ASOF);
    expect(out.outcome).toBe('no_match');
    expect(out.hits).toEqual([]);
  });

  it('ranks a recorded question key above a coincidence of vocabulary', () => {
    const keyed = statement({ id: 'st-keyed', body: 'Unrelated wording entirely: qqq wwww.' });
    const wordy = statement({
      id: 'st-wordy',
      subjects: [],
      questionKey: null,
      body: 'We have not announced a listing date for this asset.',
    });
    const out = findPrecedent({ ...QUERY, subjects: [] }, [wordy, keyed], ASOF);
    expect(out.outcome).toBe('hits');
    expect(out.hits[0]?.statement.id).toBe('st-keyed');
    expect(out.hits[0]?.matchBasis).toBe('question_key');
    expect(out.hits[1]?.matchBasis).toBe('trigram');
  });

  it('shows at most MAX_PRECEDENT_HITS and reports how many matched in total', () => {
    const corpus = Array.from({ length: 7 }, (_, i) => statement({ id: `st-${i}` }));
    const out = findPrecedent(QUERY, corpus, ASOF);
    expect(out.hits.length).toBe(MAX_PRECEDENT_HITS);
    expect(out.sentence).toMatch(/7 prior statements matched/);
  });

  it('orders identically however the corpus is shuffled', () => {
    const corpus = [
      statement({ id: 'st-a', statedAt: '2026-06-01T00:00:00.000Z' }),
      statement({ id: 'st-b', statedAt: '2026-07-01T00:00:00.000Z' }),
      statement({ id: 'st-c', statedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    const forward = findPrecedent(QUERY, corpus, ASOF).hits.map((h) => h.statement.id);
    const reversed = findPrecedent(QUERY, [...corpus].reverse(), ASOF).hits.map((h) => h.statement.id);
    expect(forward).toEqual(reversed);
    // Newest first within a tier, so the most recent position leads.
    expect(forward).toEqual(['st-b', 'st-a', 'st-c']);
  });

  it('attaches a staleness verdict to every hit, so no hit reads as simply "what we said"', () => {
    const out = findPrecedent(QUERY, [statement()], ASOF);
    expect(out.hits[0]?.staleness.sentence.length).toBeGreaterThan(0);
  });

  it('scores trigram similarity symmetrically and refuses to score empty text as identical', () => {
    expect(trigramSimilarity('abcdef', 'abcdef')).toBe(1);
    expect(trigramSimilarity('abcdef', 'ghijkl')).toBe(0);
    expect(trigramSimilarity('', '')).toBe(0);
    expect(trigramSimilarity('one two three', 'two three four')).toBe(
      trigramSimilarity('two three four', 'one two three'),
    );
  });
});

/* ══ 3 · Contradiction debt is exact, not a heuristic ══════════════════════ */

describe('contradiction debt counts only mechanically checkable differences', () => {
  const yes = statement({
    id: 'st-yes',
    polarity: 'affirms',
    statedAt: '2026-06-01T00:00:00.000Z',
    body: 'Yes, that asset is supported.',
  });
  const no = statement({
    id: 'st-no',
    polarity: 'denies',
    statedAt: '2026-07-01T00:00:00.000Z',
    body: 'No, that asset is not supported.',
  });

  it('counts a standing yes against a standing no on the same subject', () => {
    const debt = contradictionDebt([yes, no], ASOF);
    expect(debt.count).toBe(1);
    expect(debt.items[0]?.axis).toBe('polarity');
    expect(debt.items[0]?.leftId).toBe('st-yes');
    expect(debt.items[0]?.rightId).toBe('st-no');
    expect(debt.items[0]?.sentence).toMatch(/neither supersedes the other/);
    expect(debt.definition).toBe(CONTRADICTION_DEBT_DEFINITION);
    expect(debt.standingCompared).toBe(2);
  });

  it('does not count the pair once one side explicitly supersedes the other', () => {
    const debt = contradictionDebt(
      [{ ...yes, supersededBy: 'st-no' }, { ...no, supersedes: 'st-yes' }],
      ASOF,
    );
    expect(debt.count).toBe(0);
    expect(debt.pairsExplicitlyLinked).toBe(1);
  });

  it('does not count a retracted or never-published statement', () => {
    expect(contradictionDebt([yes, { ...no, standing: 'retracted' }], ASOF).count).toBe(0);
    expect(contradictionDebt([yes, { ...no, standing: 'never_published' }], ASOF).count).toBe(0);
    expect(contradictionDebt([yes, { ...no, standing: 'superseded' }], ASOF).count).toBe(0);
  });

  it('does not count two statements that share neither a subject nor a question key', () => {
    const elsewhere = { ...no, subjects: [{ kind: 'asset' as const, symbol: 'SOL' }], questionKey: null };
    expect(contradictionDebt([{ ...yes, questionKey: null }, elsewhere], ASOF).count).toBe(0);
  });

  it('treats "declines to say" as a soft flag and keeps it out of the count', () => {
    const debt = contradictionDebt([yes, { ...no, polarity: 'declines_to_say' }], ASOF);
    expect(debt.count).toBe(0);
    expect(debt.softFlags).toHaveLength(1);
    expect(debt.softFlags[0]?.reason).toBe('polarity_versus_declined_to_say');
    expect(debt.softFlags[0]?.countedAsDebt).toBe(false);
    expect(debt.softFlags[0]?.whyNotDebt.length).toBeGreaterThan(0);
  });

  it('counts two different named timeframes and soft-flags a timeframe against silence', () => {
    const q3 = statement({ id: 'st-q3', namedTimeframe: 'Q3 2026', statedAt: '2026-06-01T00:00:00.000Z' });
    const q4 = statement({ id: 'st-q4', namedTimeframe: 'Q4 2026', statedAt: '2026-07-01T00:00:00.000Z' });
    const debt = contradictionDebt([q3, q4], ASOF);
    expect(debt.byAxis.named_timeframe).toBe(1);
    expect(debt.items[0]?.leftDetail).toBe('Q3 2026');
    expect(debt.items[0]?.rightDetail).toBe('Q4 2026');

    const silent = contradictionDebt([q3, statement({ id: 'st-silent' })], ASOF);
    expect(silent.byAxis.named_timeframe).toBe(0);
    expect(silent.softFlags.map((f) => f.reason)).toContain('timeframe_added_or_dropped');
  });

  it('ignores case and punctuation when comparing a named timeframe', () => {
    const a = statement({ id: 'st-tf-a', namedTimeframe: 'Q3 2026' });
    const b = statement({ id: 'st-tf-b', namedTimeframe: 'q3, 2026' });
    expect(contradictionDebt([a, b], ASOF).byAxis.named_timeframe).toBe(0);
  });

  it('counts the same figure as at the same date with two values, and not a later restatement', () => {
    const base = {
      metricKey: 'listed_assets',
      unit: null,
      sourceRef: null,
    };
    const sameDate = contradictionDebt(
      [
        statement({ id: 'st-n1', quantitative: [{ ...base, valueText: '120', asOf: '2026-06-30' }] }),
        statement({ id: 'st-n2', quantitative: [{ ...base, valueText: '140', asOf: '2026-06-30' }] }),
      ],
      ASOF,
    );
    expect(sameDate.byAxis.quantitative_value).toBe(1);
    expect(sameDate.items[0]?.sentence).toMatch(/listed_assets/);

    const laterDate = contradictionDebt(
      [
        statement({ id: 'st-n1', quantitative: [{ ...base, valueText: '120', asOf: '2026-06-30' }] }),
        statement({ id: 'st-n2', quantitative: [{ ...base, valueText: '140', asOf: '2026-07-31' }] }),
      ],
      ASOF,
    );
    expect(laterDate.byAxis.quantitative_value).toBe(0);
    expect(laterDate.softFlags.map((f) => f.reason)).toContain(
      'quantitative_restated_for_a_later_date',
    );
  });

  it('counts a differing unit on the same figure as a contradiction', () => {
    const debt = contradictionDebt(
      [
        statement({ id: 'st-u1', quantitative: [{ metricKey: 'volume', valueText: '40', unit: 'm USD', asOf: '2026-06-30', sourceRef: null }] }),
        statement({ id: 'st-u2', quantitative: [{ metricKey: 'volume', valueText: '40', unit: 'bn USD', asOf: '2026-06-30', sourceRef: null }] }),
      ],
      ASOF,
    );
    expect(debt.byAxis.quantitative_value).toBe(1);
  });

  it('counts a standing statement resting on an expired claim as one-sided debt', () => {
    const debt = contradictionDebt(
      [
        statement({
          id: 'st-exp',
          claims: [{ claimId: 'claim-mica-status', versionAtUse: 2, category: 'mica_awareness', validTo: '2026-07-01' }],
        }),
      ],
      ASOF,
    );
    expect(debt.count).toBe(1);
    expect(debt.items[0]?.axis).toBe('expired_claim');
    expect(debt.items[0]?.rightId).toBeNull();
    expect(debt.items[0]?.sentence).toMatch(/expired 2026-07-01/);
  });

  it('does not count a claim whose validTo is still in the future, or absent', () => {
    const future = statement({
      id: 'st-fut',
      claims: [{ claimId: 'c1', versionAtUse: 1, category: 'x', validTo: '2026-12-31' }],
    });
    const openEnded = statement({
      id: 'st-open',
      claims: [{ claimId: 'c2', versionAtUse: 1, category: 'x', validTo: null }],
    });
    expect(contradictionDebt([future], ASOF).count).toBe(0);
    expect(contradictionDebt([openEnded], ASOF).count).toBe(0);
  });

  it('keeps count equal to items and excludes soft flags from it', () => {
    const debt = contradictionDebt(
      [yes, no, { ...statement({ id: 'st-decl', polarity: 'declines_to_say' }) }],
      ASOF,
    );
    expect(debt.count).toBe(debt.items.length);
    expect(debt.softFlags.length).toBeGreaterThan(0);
    expect(debt.count).toBeLessThan(debt.items.length + debt.softFlags.length);
  });

  it('produces the same items in the same order however the corpus is ordered', () => {
    const corpus = [
      yes,
      no,
      statement({ id: 'st-q3', namedTimeframe: 'Q3 2026' }),
      statement({ id: 'st-q4', namedTimeframe: 'Q4 2026' }),
    ];
    const a = contradictionDebt(corpus, ASOF).items.map((i) => i.key);
    const b = contradictionDebt([...corpus].reverse(), ASOF).items.map((i) => i.key);
    expect(a).toEqual(b);
    // Axis order is the declared order, so a panel groups the same way every time.
    const axes = contradictionDebt(corpus, ASOF).items.map((i) => i.axis);
    const ranks = axes.map((ax) => CONTRADICTION_AXES.indexOf(ax));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });

  it('reports every axis in byAxis even at zero, so a dead axis is visible', () => {
    const debt = contradictionDebt([], ASOF);
    expect(Object.keys(debt.byAxis).sort()).toEqual([...CONTRADICTION_AXES].sort());
    expect(debt.count).toBe(0);
    expect(debt.standingCompared).toBe(0);
  });
});

/* ══ 4 · Staleness never flatters an unreadable or unchecked statement ══════ */

describe('line staleness', () => {
  it('calls a 45-day-old figure past its horizon and a 45-day-old position current', () => {
    const at = '2026-06-18T00:00:00.000Z'; // 45 days before ASOF
    expect(stalenessOf(statement({ kind: 'quantitative', statedAt: at }), ASOF).verdict).toBe('past_horizon');
    expect(stalenessOf(statement({ kind: 'position', statedAt: at }), ASOF).verdict).toBe('current');
  });

  it('never expires a refusal to comment', () => {
    const old = stalenessOf(
      statement({ kind: 'refusal_to_comment', statedAt: '2021-01-01T00:00:00.000Z' }),
      ASOF,
    );
    expect(old.verdict).toBe('current');
    expect(old.horizonDays).toBeNull();
  });

  it('refuses to call a statement current when its date cannot be read', () => {
    const out = stalenessOf(statement({ statedAt: 'sometime in March' }), ASOF);
    expect(out.verdict).toBe('not_assessable');
    expect(out.ageDays).toBeNull();
    expect(out.sentence).toMatch(/not being treated as current/);
  });

  it('ranks an expired claim above a mere horizon breach', () => {
    const out = stalenessOf(
      statement({
        kind: 'quantitative',
        statedAt: '2026-01-01T00:00:00.000Z',
        claims: [{ claimId: 'c-exp', versionAtUse: 1, category: 'x', validTo: '2026-05-01' }],
      }),
      ASOF,
    );
    expect(out.verdict).toBe('rests_on_expired_claim');
    expect(out.expiredClaimIds).toEqual(['c-exp']);
    // The horizon breach is still reported — precedence picks the verdict, not the reasons.
    expect(out.reasons.length).toBeGreaterThan(1);
  });

  it('reports the claim-version axis as unchecked when no library versions are supplied', () => {
    const withClaim = statement({
      claims: [{ claimId: 'c-1', versionAtUse: 1, category: 'x', validTo: null }],
    });
    const unchecked = stalenessOf(withClaim, ASOF);
    expect(unchecked.axesNotChecked.join(' ')).toMatch(/claim version movement/);
    expect(unchecked.sentence).toMatch(/not checked/);

    const checked = stalenessOf(withClaim, ASOF, new Map([['c-1', 3]]));
    expect(checked.verdict).toBe('rests_on_moved_claim_version');
    expect(checked.movedClaimIds).toEqual(['c-1']);

    const same = stalenessOf(withClaim, ASOF, new Map([['c-1', 1]]));
    expect(same.verdict).toBe('current');
    expect(same.axesNotChecked.join(' ')).not.toMatch(/claim version movement/);
  });

  it('flags an overdue scheduled review and reports by how long', () => {
    const out = stalenessOf(statement({ reviewDueAt: '2026-07-03T00:00:00.000Z' }), ASOF);
    expect(out.verdict).toBe('review_overdue');
    expect(out.reviewOverdueByDays).toBe(30);
  });

  it('does not invent a review date, and says the axis was not checked', () => {
    const out = stalenessOf(statement({ reviewDueAt: null }), ASOF);
    expect(out.reviewOverdueByDays).toBeNull();
    expect(out.axesNotChecked.join(' ')).toMatch(/scheduled review/);
  });

  it('keeps the sign on daysBetween and returns null on an unreadable date', () => {
    expect(daysBetween('2026-07-01T00:00:00.000Z', '2026-07-31T00:00:00.000Z')).toBe(30);
    expect(daysBetween('2026-08-31T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBe(-30);
    expect(daysBetween('not a date', ASOF)).toBeNull();
    expect(daysBetween(null, ASOF)).toBeNull();
  });
});

/* ══ 5 · The question ontology, and its stated limits ══════════════════════ */

describe('question grouping is lexical and says so', () => {
  it('groups a single unambiguous match and names the terms that fired', () => {
    const out = classifyQuestion('Where is my withdrawal? It has been three days.');
    expect(out.key).toBe('withdrawal_status');
    expect(out.basis).toBe('lexical_single_match');
    expect(out.matchedTerms[0]?.terms.length).toBeGreaterThan(0);
    expect(out.limitation).toBe(GROUPING_IS_LEXICAL_NOT_SEMANTIC);
  });

  it('refuses to pick between two matched keys and reports both candidates', () => {
    const out = classifyQuestion('When will you list this token and what are the fees?');
    expect(out.basis).toBe('ambiguous');
    expect(out.key).toBeNull();
    expect(out.candidates.length).toBeGreaterThan(1);
    expect(out.candidates).toContain('listing_request');
    expect(out.candidates).toContain('fee_question');
  });

  it('keeps ungrouped and ambiguous as different facts', () => {
    const ungrouped = classifyQuestion('Just dropping by to say hello to everyone here.');
    expect(ungrouped.basis).toBe('ungrouped');
    expect(ungrouped.key).toBeNull();
    expect(ungrouped.candidates).toEqual([]);
    // Same null key, different basis — a caller can tell an ontology gap from a tie.
    expect(ungrouped.basis).not.toBe('ambiguous');
  });

  it('lets an operator override the vocabulary and never argues with them', () => {
    const out = classifyQuestion('Where is my withdrawal?', 'complaint');
    expect(out.key).toBe('complaint');
    expect(out.basis).toBe('operator_assigned');
  });

  it('requires a directional qualifier before calling something price speculation', () => {
    expect(classifyQuestion('What is the price shown on the ETH pair?').key).not.toBe('price_speculation');
    expect(classifyQuestion('Will the price moon after the listing?').key).toBe('price_speculation');
  });

  it('does not match a term inside a longer word', () => {
    // 'list' must not fire on 'listen'.
    const out = classifyQuestion('Can you listen to your users for once, please?');
    expect(out.candidates).not.toContain('listing_request');
  });

  it('normalises punctuation to spaces rather than deleting it', () => {
    expect(normaliseForMatch('Fees.Now')).toBe(' fees now ');
  });

  it('holds a label and a surface-form entry for every key', () => {
    for (const key of QUESTION_KEYS) {
      expect(QUESTION_LABEL[key].length).toBeGreaterThan(0);
      expect(QUESTION_SURFACE_FORMS[key]).toBeDefined();
    }
  });
});

/* ══ 6 · Subjects, coverage and the panel ══════════════════════════════════ */

describe('subjects and coverage', () => {
  it('makes asset symbols comparable across case and whitespace', () => {
    expect(subjectKey({ kind: 'asset', symbol: ' eth ' })).toBe(subjectKey({ kind: 'asset', symbol: 'ETH' }));
    expect(subjectKey({ kind: 'peer', organisation: 'Celsius' })).not.toBe(
      subjectKey({ kind: 'asset', symbol: 'Celsius' }),
    );
  });

  it('reports a key with no standing answer as a gap in the index, not as proof of silence', () => {
    const { rows, coverageCaveat } = questionCoverage([statement()], ASOF);
    const solvency = rows.find((r) => r.key === 'are_you_solvent');
    expect(solvency?.standingCount).toBe(0);
    expect(solvency?.worstStaleness).toBeNull();
    expect(solvency?.sentence).toMatch(/not proof the desk has never answered/);
    expect(coverageCaveat).toMatch(/invisible to this table/);
  });

  it('counts only standing statements towards coverage', () => {
    const { rows } = questionCoverage([statement({ standing: 'retracted' })], ASOF);
    expect(rows.find((r) => r.key === 'listing_request')?.standingCount).toBe(0);
  });
});

describe('the drafting-room panel', () => {
  it('carries the definition, the window and the disclosures into its printable lines', () => {
    const panel = precedentPanel(QUERY, [statement()], ASOF, { truncatedByRetention: true });
    expect(panel.lookup.outcome).toBe('hits');
    expect(panel.disclosures).toContain(CONTRADICTION_DEBT_DEFINITION);
    expect(panel.lines.join(' ')).toMatch(/retention boundary/);
    expect(panel.lines.join(' ')).toMatch(/cleared by actor-nik/);
  });

  it('distinguishes "no debt on this subject" from "nothing to compare"', () => {
    const empty = precedentPanel(QUERY, [], ASOF);
    expect(empty.lines.join(' ')).toMatch(/not computable/);
    const populated = precedentPanel(QUERY, [statement()], ASOF);
    expect(populated.lines.join(' ')).toMatch(/none, across 1 standing statements/);
  });

  it('shows only the debt that touches this subject, and says how much exists elsewhere', () => {
    const corpus = [
      statement({ id: 'st-yes', polarity: 'affirms', statedAt: '2026-06-01T00:00:00.000Z' }),
      statement({ id: 'st-no', polarity: 'denies', statedAt: '2026-07-01T00:00:00.000Z' }),
      statement({
        id: 'st-sol-a',
        subjects: [{ kind: 'asset', symbol: 'SOL' }],
        questionKey: 'token_availability',
        polarity: 'affirms',
      }),
      statement({
        id: 'st-sol-b',
        subjects: [{ kind: 'asset', symbol: 'SOL' }],
        questionKey: 'token_availability',
        polarity: 'denies',
      }),
    ];
    const panel = precedentPanel(QUERY, corpus, ASOF);
    expect(panel.debt.count).toBe(2);
    expect(panel.relevantDebt).toHaveLength(1);
    expect(panel.relevantDebt[0]?.leftId).toBe('st-yes');
  });
});

/* ══ 7 · The GDPR shape of the record, at compile time ═════════════════════ */

describe('the record holds no third-party personal data', () => {
  it('has no field for an inbound author, handle, display name or permalink', () => {
    // Compile-time assertions: if any of these keys is ever added to
    // `PrecedentStatement`, the file stops type-checking and the retention argument in
    // the module header stops being true at the same moment.
    type Forbidden = 'authorHandle' | 'handle' | 'authorDisplay' | 'permalink' | 'replyBody' | 'targetHandle';
    type Leaked = Extract<keyof PrecedentStatement, Forbidden>;
    const noneLeaked: Leaked extends never ? true : false = true;
    expect(noneLeaked).toBe(true);
  });
});
