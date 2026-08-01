/**
 * Tests for GPS origination.
 *
 * These assert the four properties that make this module an instrument rather
 * than a projection of `targeting.ts`, and each is written to fail if a later
 * edit quietly re-introduces the defect it guards:
 *
 *   1. A GATED TARGET CANNOT REACH THE QUEUE, and its gate reaches the ledger
 *      with the reason attached. Asserted on both sides — presence in the ledger
 *      AND absence from the rows — because "it disappeared" and "it was refused"
 *      look identical if you only check one.
 *   2. A WALL AND A TASK ARE DIFFERENT THINGS. `disposition` is derived
 *      pessimistically: one unrecoverable gate makes the entry a wall no matter
 *      how many curable gates sit beside it.
 *   3. CONFIDENCE IS NOT A TERM IN THE SCORE — asserted STRUCTURALLY, not
 *      arithmetically. Two rows differing only in evidence grade must be
 *      byte-identical in `score`/`rawScore`/`drivers`, and `QueueRow` must expose
 *      no score-like key beyond those two.
 *   4. A BRIEF CANNOT ASSERT WITHOUT PROVENANCE, and a brief that knows nothing
 *      is valid provided it says so.
 *
 * Every test that touches a date pins `asOf`. Nothing here reads the wall clock
 * except the two assertions that deliberately check the default-clock path.
 */
import { describe, expect, it } from 'vitest';
import {
  BRIEF_SECTION_ORDER,
  FACT_STALE_CONFIDENCE,
  QUEUE_CAPACITY_DEFAULT,
  SCORING_FIELDS,
  TRIGGER_SHELF_LIFE_DAYS,
  briefEstimate,
  briefIntegrity,
  buildOriginationQueue,
  deriveUnknowns,
  factProvenance,
  originationResponse,
  provenanceLabel,
  refusalLedger,
  resolveTrigger,
  sealBrief,
  type BriefAssertion,
  type BriefDraft,
  type FactInput,
  type OriginationInput,
  type TriggerInput,
} from './origination.js';
import { GATE_KEYS, TARGET_FACTOR_KEYS, type GpsTarget } from './targeting.js';

const ASOF = '2026-07-31T00:00:00.000Z';
const asOfMs = Date.parse(ASOF);
const daysAgo = (d: number): string => new Date(asOfMs - d * 86_400_000).toISOString();

/** Passes every gate, with the weakest possible funding evidence. Mirrors `targeting.test.ts`. */
const BARE: GpsTarget = {
  id: 't-bare',
  name: 'Bare Passing Target',
  screening: 'clear',
  perimeter: 'in_perimeter',
  conflict: 'cleared',
  decisionMaker: { name: 'A. Sponsor', role: 'CFO', isBudgetHolder: true },
  demandsGuaranteedOutcome: false,
  materiallyMisleading: false,
  capitalProxyCents: 10_000_000,
};

const t = (over: Partial<GpsTarget>): GpsTarget => ({ ...BARE, ...over });
const input = (over: Partial<GpsTarget>, rest: Omit<OriginationInput, 'target'> = {}): OriginationInput => ({
  target: t(over),
  ...rest,
});

const TRIGGER: TriggerInput = {
  kind: 'regulatory_deadline',
  statement: 'Published a MiCA white-paper deadline of 30 September in their own investor update.',
  occurredIso: daysAgo(10),
  source: { sourceId: 'news', credibility: 2, observedIso: daysAgo(10) },
};

/* ── 1. A firing gate never reaches the queue ─────────────────────────────── */

describe('the queue never carries a gated target', () => {
  it('a fired gate puts the target in the ledger with its reason and out of the rows', () => {
    const q = buildOriginationQueue(
      [
        input({ id: 't-ok', name: 'Eligible Co' }),
        input({ id: 't-gated', name: 'Sanctioned Co', screening: 'concern' }),
      ],
      { asOf: ASOF },
    );

    expect(q.rows.map((r) => r.targetId)).toEqual(['t-ok']);
    expect(q.rows.some((r) => r.targetId === 't-gated')).toBe(false);

    const entry = q.refusals.entries.find((e) => e.targetId === 't-gated');
    expect(entry).toBeDefined();
    expect(entry?.gates.map((g) => g.key)).toContain('sanctions_concern');
    expect(entry?.primary.reason).toMatch(/sanctions\/AML screen returned a concern/i);
  });

  it('a target with the HIGHEST possible evidence is still excluded if one gate fires', () => {
    // The defect this guards: a gate implemented as a large negative weight. A
    // perfect target that is sanctioned must be absent from the ranking entirely,
    // not ranked last.
    const perfect: Partial<GpsTarget> = {
      id: 't-perfect',
      name: 'Perfect But Sanctioned',
      screening: 'concern',
      identifiedNeeds: ['mica_whitepaper', 'gtm_sprint', 'marketing_activation'],
      offerKey: 'mica_whitepaper',
      statedBudgetCents: 2_500_000,
      quotedPriceCents: 2_000_000,
      expectedVendorCostCents: 600_000,
      introPath: 'direct_relationship',
      deadlineIso: new Date(asOfMs + 20 * 86_400_000).toISOString(),
      deadlineKind: 'regulatory',
      complexity: {},
      evidence: { reliability: 'A', credibility: 1, ageDays: 1 },
    };
    const q = buildOriginationQueue([input(perfect)], { asOf: ASOF });
    expect(q.rows).toHaveLength(0);
    expect(q.refusals.entries).toHaveLength(1);
    // Confidence on a refusal is present and HIGH — "we excluded this on good
    // evidence" is a different statement from "we excluded it on a rumour".
    expect(q.refusals.entries[0].confidence.band).toBe('high');
  });

  it('every gate key is present in byGate, including the ones that never fired', () => {
    const q = buildOriginationQueue([input({ id: 't-c', screening: 'concern' })], { asOf: ASOF });
    expect(Object.keys(q.refusals.byGate).sort()).toEqual([...GATE_KEYS].sort());
    expect(q.refusals.byGate.sanctions_concern).toBe(1);
    // An absent key would read as "not checked" — the same class of lie the
    // three-state ScreeningResult exists to prevent.
    expect(q.refusals.byGate.materially_misleading).toBe(0);
  });
});

/* ── 2. Recoverable vs wall ───────────────────────────────────────────────── */

describe('refusal ledger distinguishes a task from a wall', () => {
  it('an unresolved conflict is a TASK with a remedy', () => {
    const q = buildOriginationQueue([input({ id: 't-conf', conflict: 'unresolved' })], { asOf: ASOF });
    const e = q.refusals.entries[0];
    expect(e.disposition).toBe('task');
    expect(e.wallCount).toBe(0);
    expect(e.recoverableCount).toBe(1);
    expect(e.remedies).toHaveLength(1);
    expect(e.remedies[0]).toMatch(/GpsConflictCheck/);
    expect(e.summary).toMatch(/^.*: TASK — /);
  });

  it('a DECLINED conflict is a WALL with no remedy — the same field, the opposite action', () => {
    const q = buildOriginationQueue([input({ id: 't-dec', conflict: 'declined' })], { asOf: ASOF });
    const e = q.refusals.entries[0];
    expect(e.disposition).toBe('wall');
    expect(e.wallCount).toBe(1);
    expect(e.remedies).toEqual([]);
    expect(e.primary.recoverable).toBe(false);
  });

  it('one wall beside four tasks is still a wall, and the wall is primary', () => {
    // The pessimistic roll-up. A "mostly curable" majority vote is how a
    // sanctioned entity ends up on a to-do list.
    const q = buildOriginationQueue(
      [
        input({
          id: 't-mixed',
          name: 'Mixed Co',
          screening: 'concern', // wall
          conflict: 'unresolved', // task
          decisionMaker: null, // task
          perimeter: 'outside_perimeter', // task
          jurisdiction: 'Somewhere',
          capitalProxyCents: null, // task
          demandsGuaranteedOutcome: true, // task
        }),
      ],
      { asOf: ASOF },
    );
    const e = q.refusals.entries[0];
    expect(e.gates.length).toBeGreaterThan(4);
    expect(e.recoverableCount).toBeGreaterThan(3);
    expect(e.disposition).toBe('wall');
    expect(e.primary.key).toBe('sanctions_concern');
    // Remedies for the curable gates are still carried on a wall entry: the
    // sanctions answer may change, and the record of what else was wrong matters.
    expect(e.remedies.length).toBe(e.recoverableCount);
  });

  it('ledger tallies walls and tasks separately, and refusalLedger works standalone', () => {
    const q = buildOriginationQueue(
      [
        input({ id: 'w1', screening: 'concern' }),
        input({ id: 'w2', materiallyMisleading: true }),
        input({ id: 'k1', conflict: 'unresolved' }),
        input({ id: 'ok' }),
      ],
      { asOf: ASOF },
    );
    expect(q.refusals.walls).toBe(2);
    expect(q.refusals.tasks).toBe(1);
    expect(q.rows.map((r) => r.targetId)).toEqual(['ok']);
    // The ledger is composable on its own — refusals are half the product, not a
    // subordinate part of the queue.
    expect(refusalLedger([]).entries).toEqual([]);
    expect(refusalLedger([]).byGate.no_decision_maker).toBe(0);
  });
});

/* ── 3. Confidence is not a term in the score — asserted structurally ─────── */

describe('confidence sits beside the score and never inside it', () => {
  const SCORED: Partial<GpsTarget> = {
    identifiedNeeds: ['mica_whitepaper'],
    offerKey: 'mica_whitepaper',
    statedBudgetCents: 2_000_000,
    quotedPriceCents: 2_000_000,
    expectedVendorCostCents: 800_000,
    introPath: 'warm_referral',
    complexity: {},
  };

  it('two rows differing ONLY in evidence grade have identical score, rawScore and drivers', () => {
    const q = buildOriginationQueue(
      [
        input({ ...SCORED, id: 'a', name: 'Alpha', evidence: { reliability: 'A', credibility: 1, ageDays: 0 } }),
        input({ ...SCORED, id: 'b', name: 'Bravo', evidence: { reliability: 'E', credibility: 5, ageDays: 300 } }),
      ],
      { asOf: ASOF },
    );
    const [a, b] = [q.rows.find((r) => r.targetId === 'a')!, q.rows.find((r) => r.targetId === 'b')!];

    expect(a.score).toBe(b.score);
    expect(a.rawScore).toBe(b.rawScore);
    expect(a.drivers).toEqual(b.drivers);
    // …and the confidence moved a long way. If a future edit folds confidence into
    // the score, the three assertions above go red before anyone reads the diff.
    expect(a.confidence).toBeGreaterThan(b.confidence);
    expect(a.band).toBe('high');
    expect(b.band).toBe('low');
  });

  it('QueueRow exposes no score-like key beyond score and rawScore', () => {
    // The guard against `confidenceAdjustedScore` / `weightedScore` ever appearing:
    // a blended field cannot be added without this test naming it.
    const q = buildOriginationQueue([input({ ...SCORED, id: 'a' })], { asOf: ASOF });
    const scoreKeys = Object.keys(q.rows[0]).filter((k) => /score/i.test(k));
    expect(scoreKeys.sort()).toEqual(['rawScore', 'score']);
    // And confidence is a sibling, not nested inside anything score-shaped.
    expect(typeof q.rows[0].confidence).toBe('number');
    expect(q.rows[0]).toHaveProperty('band');
  });

  it('the driver trail contains only the six factor terms and sums to rawScore', () => {
    const q = buildOriginationQueue([input({ ...SCORED, id: 'a' })], { asOf: ASOF });
    const row = q.rows[0];
    expect(row.drivers).toHaveLength(TARGET_FACTOR_KEYS.length);
    const sum = row.drivers.reduce((s, d) => s + d.points, 0);
    expect(Math.round(sum * 1000) / 1000).toBe(row.rawScore);
    // No driver mentions evidence, provenance or confidence — the trail is the
    // score's own arithmetic, nothing else.
    expect(row.drivers.some((d) => /confidence|evidence|provenance/i.test(d.label))).toBe(false);
  });
});

/* ── The capacity cut is a reported exclusion, not a truncation ───────────── */

describe('the queue is finite by construction and says what it cut', () => {
  const many = (n: number): OriginationInput[] =>
    Array.from({ length: n }, (_, i) =>
      input({
        id: `t${i}`,
        name: `Target ${String(i).padStart(2, '0')}`,
        identifiedNeeds: ['mica_whitepaper'],
        // Descending budgets so the ranking is deterministic and known.
        statedBudgetCents: 3_000_000 - i * 100_000,
        offerKey: 'mica_whitepaper',
      }),
    );

  it('defaults to a day of work and reports the deferred rows by name', () => {
    const q = buildOriginationQueue(many(20), { asOf: ASOF });
    expect(q.capacity).toBe(QUEUE_CAPACITY_DEFAULT);
    expect(q.rows).toHaveLength(QUEUE_CAPACITY_DEFAULT);
    expect(q.deferred.count).toBe(8);
    expect(q.deferred.targetIds).toHaveLength(8);
    expect(q.deferred.reason).toMatch(/capacity rule, not by a gate/);
    expect(q.deferred.lowestQueuedScore).not.toBeNull();
    expect(q.deferred.highestDeferredScore).not.toBeNull();
    expect(q.deferred.lowestQueuedScore!).toBeGreaterThanOrEqual(q.deferred.highestDeferredScore!);
    // Ranks are 1-based and contiguous.
    expect(q.rows.map((r) => r.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('an empty cut still carries a sentence, and a nonsense capacity throws', () => {
    const q = buildOriginationQueue(many(3), { asOf: ASOF });
    expect(q.deferred.count).toBe(0);
    expect(q.deferred.reason).toMatch(/Nothing deferred/);
    expect(q.deferred.highestDeferredScore).toBeNull();
    expect(() => buildOriginationQueue(many(3), { asOf: ASOF, capacity: 0 })).toThrow(/capacity/);
    expect(() => buildOriginationQueue(many(3), { asOf: ASOF, capacity: Number.NaN })).toThrow(/capacity/);
  });

  it('a duplicate target id throws rather than picking a winner silently', () => {
    expect(() => buildOriginationQueue([input({ id: 'dup' }), input({ id: 'dup' })], { asOf: ASOF })).toThrow(
      /duplicate target id/,
    );
  });

  it('carries the weights basis so a ranking can print "stated prior, not fitted"', () => {
    const q = buildOriginationQueue([input({ id: 'a' })], { asOf: ASOF });
    expect(q.weightsVersion).toBe('v1');
    expect(q.weightsBasis.learnedFromOutcomes).toBe(false);
    expect(q.triggerBasis.learnedFromOutcomes).toBe(false);
    expect(q.asOf).toBe(ASOF);
  });
});

/* ── counts exist and are derived from the arrays beside them ─────────────── */

describe('originationResponse counts', () => {
  it('considered equals queued + deferred + refused, always', () => {
    const q = buildOriginationQueue(
      [
        input({ id: 'a', identifiedNeeds: ['gtm_sprint'] }),
        input({ id: 'b', identifiedNeeds: ['gtm_sprint'] }),
        input({ id: 'c', screening: 'concern' }),
        input({ id: 'd', conflict: 'unresolved' }),
      ],
      { asOf: ASOF, capacity: 1 },
    );
    const res = originationResponse(q, ASOF);
    expect(res.counts).toEqual({ considered: 4, queued: 1, deferred: 1, refused: 2, walls: 1, tasks: 1 });
    expect(res.counts.considered).toBe(res.counts.queued + res.counts.deferred + res.counts.refused);
    expect(res.counts.refused).toBe(res.queue.refusals.entries.length);
    expect(res.counts.queued).toBe(res.queue.rows.length);
    expect(res.generatedIso).toBe(ASOF);
  });
});

/* ── FactProvenance — a stale B2 and a fresh A1 cannot render alike ───────── */

describe('per-fact provenance', () => {
  const fresh: FactInput = { field: 'statedBudgetCents', sourceId: 'manual', reliability: 'A', credibility: 1, observedIso: daysAgo(2) };
  const stale: FactInput = { field: 'statedBudgetCents', sourceId: 'manual', reliability: 'B', credibility: 2, observedIso: daysAgo(210) };

  it('a fresh A1 and a stale B2 differ in grade, age, confidence and staleness', () => {
    const a = factProvenance(fresh, asOfMs);
    const b = factProvenance(stale, asOfMs);
    expect(a.admiralty).toBe('A1');
    expect(b.admiralty).toBe('B2');
    expect(a.ageDays).toBe(2);
    expect(b.ageDays).toBe(210);
    expect(a.confidence).toBeGreaterThan(b.confidence);
    expect(a.stale).toBe(false);
    expect(b.stale).toBe(true);
    // The renderer cannot print them identically: the only label helper bakes the
    // age in beside the grade.
    expect(provenanceLabel(a)).not.toBe(provenanceLabel(b));
    expect(provenanceLabel(a)).toMatch(/^A1 · 2d · /);
    expect(provenanceLabel(b)).toMatch(/^B2 · 210d · /);
  });

  it('an undated fact is charged a half-life and is never fresh', () => {
    const undated = factProvenance({ field: 'x', sourceId: 'manual', reliability: 'A', credibility: 1 }, asOfMs);
    const dated = factProvenance({ field: 'x', sourceId: 'manual', reliability: 'A', credibility: 1, observedIso: ASOF }, asOfMs);
    expect(undated.undated).toBe(true);
    expect(undated.ageDays).toBeNull();
    expect(undated.confidence).toBeLessThan(dated.confidence);
    expect(provenanceLabel(undated)).toMatch(/undated/);
    // Omitting the date must never be the cheapest way to look fresh.
    expect(undated.stale).toBe(true);
  });

  it('defaults are honest: unknown source degrades to F, unstated credibility to 6', () => {
    const p = factProvenance({ field: 'x', sourceId: 'not-a-real-source', observedIso: ASOF }, asOfMs);
    expect(p.reliability).toBe('F');
    expect(p.credibility).toBe(6);
    expect(p.confidence).toBe(0);
    expect(p.stale).toBe(true);
    expect(p.confidence).toBeLessThan(FACT_STALE_CONFIDENCE);
  });

  it('a scoring field with a value and no source is named on the row', () => {
    const q = buildOriginationQueue(
      [
        input(
          { id: 'a', statedBudgetCents: 2_000_000, introPath: 'warm_referral', identifiedNeeds: ['gtm_sprint'] },
          { facts: [{ field: 'statedBudgetCents', sourceId: 'manual', credibility: 2, observedIso: daysAgo(3) }] },
        ),
      ],
      { asOf: ASOF },
    );
    const row = q.rows[0];
    expect(row.provenance).toHaveLength(1);
    expect(row.unprovenanced).toContain('introPath');
    expect(row.unprovenanced).toContain('identifiedNeeds');
    expect(row.unprovenanced).not.toContain('statedBudgetCents');
    expect(row.advisories.some((a) => /carry no source/.test(a))).toBe(true);
  });

  it('SCORING_FIELDS covers every scoring input that can be sourced', () => {
    // A seventh scoring input added to `targeting.ts` must show up here rather
    // than be silently under-reported as always-provenanced.
    const factors = new Set(SCORING_FIELDS.map((f) => f.factor));
    expect([...factors].sort()).toEqual([...TARGET_FACTOR_KEYS].sort());
  });
});

/* ── The why-now trigger carries its date and its grade ───────────────────── */

describe('why-now trigger', () => {
  it('carries the statement, the date, the age and the Admiralty grade', () => {
    const tr = resolveTrigger(TRIGGER, asOfMs);
    expect(tr.ageDays).toBe(10);
    expect(tr.state).toBe('fresh');
    expect(tr.shelfLifeDays).toBe(TRIGGER_SHELF_LIFE_DAYS.regulatory_deadline);
    expect(tr.provenance.admiralty).toBe('C2'); // news defaults to C reliability
    expect(tr.provenance.ageDays).toBe(10);
    expect(tr.futureDated).toBe(false);
  });

  it('ages, then expires, per the stated shelf life of its kind', () => {
    const inbound: TriggerInput = {
      kind: 'inbound_request',
      statement: 'Asked us for a MiCA scoping call.',
      occurredIso: daysAgo(15),
      source: { sourceId: 'internal', credibility: 1 },
    };
    expect(resolveTrigger(inbound, asOfMs).state).toBe('ageing'); // 15d of a 21d shelf life
    expect(resolveTrigger({ ...inbound, occurredIso: daysAgo(40) }, asOfMs).state).toBe('expired');
    expect(resolveTrigger({ ...inbound, occurredIso: daysAgo(3) }, asOfMs).state).toBe('fresh');
    expect(resolveTrigger({ ...inbound, occurredIso: null }, asOfMs).state).toBe('undated');
  });

  it('a future-dated event is shown, not silently corrected', () => {
    const tr = resolveTrigger({ ...TRIGGER, occurredIso: new Date(asOfMs + 30 * 86_400_000).toISOString() }, asOfMs);
    expect(tr.futureDated).toBe(true);
    expect(tr.ageDays).toBeLessThan(0);
  });

  it('a row with no trigger says so out loud, and one with an expired trigger says that', () => {
    const q = buildOriginationQueue(
      [
        input({ id: 'none', identifiedNeeds: ['gtm_sprint'] }),
        input(
          { id: 'old', identifiedNeeds: ['gtm_sprint'] },
          { trigger: { ...TRIGGER, kind: 'inbound_request', occurredIso: daysAgo(90) } },
        ),
        input({ id: 'live', identifiedNeeds: ['gtm_sprint'] }, { trigger: TRIGGER }),
      ],
      { asOf: ASOF },
    );
    const byId = new Map(q.rows.map((r) => [r.targetId, r]));
    expect(byId.get('none')!.triggerState).toBe('absent');
    expect(byId.get('none')!.trigger).toBeNull();
    expect(byId.get('none')!.advisories.some((a) => /not a reason to call today/.test(a))).toBe(true);
    expect(byId.get('old')!.triggerState).toBe('expired');
    expect(byId.get('old')!.advisories.some((a) => /shelf life/.test(a))).toBe(true);
    expect(byId.get('live')!.triggerState).toBe('fresh');
    // The trigger never touches the score: all three have the same evidence.
    expect(new Set(q.rows.map((r) => r.score)).size).toBe(1);
  });
});

/* ── 4. The brief: no claim without a mechanism ───────────────────────────── */

const sourced = (over: Partial<BriefAssertion> = {}): BriefAssertion => ({
  id: 'a1',
  section: 'ability_to_pay',
  text: 'They closed a $4m round in June 2026.',
  status: 'SOURCED',
  provenance: factProvenance(
    { field: 'capitalProxyCents', sourceId: 'news', reliability: 'B', credibility: 2, observedIso: daysAgo(20) },
    asOfMs,
  ),
  ...over,
});

const draft = (over: Partial<BriefDraft> = {}): BriefDraft => ({
  targetId: 't-1',
  name: 'Example Co',
  asOf: ASOF,
  score: 62,
  confidence: 58,
  band: 'medium',
  gates: [],
  assertions: [sourced()],
  unknowns: [],
  trigger: resolveTrigger(TRIGGER, asOfMs),
  proposedOpening: null,
  ...over,
});

describe('briefIntegrity', () => {
  it('a fully sourced brief passes and reports its own composition', () => {
    const r = briefIntegrity(draft());
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.assertions).toBe(1);
    expect(r.sourced).toBe(1);
    expect(r.unverified).toBe(0);
    expect(r.meanProvenanceConfidence).toBeGreaterThan(0);
    expect(r.onlyUnknowns).toBe(false);
  });

  it('catches an assertion presented as sourced with no provenance — BLOCKING', () => {
    const r = briefIntegrity(draft({ assertions: [sourced({ provenance: null })] }));
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.code === 'assertion_without_provenance');
    expect(v).toBeDefined();
    expect(v?.blocking).toBe(true);
    expect(v?.assertionId).toBe('a1');
    expect(v?.detail).toMatch(/Attach a source and grade, or mark it UNVERIFIED/);
    expect(r.meanProvenanceConfidence).toBeNull();
  });

  it('an explicitly UNVERIFIED assertion is allowed; mislabelling either way is not', () => {
    const ok = briefIntegrity(
      draft({ assertions: [sourced({ status: 'UNVERIFIED', provenance: null, text: 'They may be raising again.' })] }),
    );
    expect(ok.ok).toBe(true);
    expect(ok.unverified).toBe(1);

    // Grade beside the word UNVERIFIED: a reader cannot tell which to believe.
    const mislabelled = briefIntegrity(draft({ assertions: [sourced({ status: 'UNVERIFIED' })] }));
    expect(mislabelled.ok).toBe(false);
    expect(mislabelled.violations.map((v) => v.code)).toContain('unverified_carries_provenance');
  });

  it('a stale or undated source is a quality finding, not a lie — non-blocking', () => {
    const stale = briefIntegrity(
      draft({
        assertions: [
          sourced({
            provenance: factProvenance(
              { field: 'capitalProxyCents', sourceId: 'news', reliability: 'C', credibility: 3, observedIso: daysAgo(300) },
              asOfMs,
            ),
          }),
        ],
      }),
    );
    expect(stale.ok).toBe(true);
    const v = stale.violations.find((x) => x.code === 'provenance_stale');
    expect(v?.blocking).toBe(false);
    expect(v?.detail).toMatch(/re-check before quoting it/);

    const undated = briefIntegrity(
      draft({ assertions: [sourced({ provenance: factProvenance({ field: 'x', sourceId: 'manual', credibility: 2 }, asOfMs) })] }),
    );
    expect(undated.ok).toBe(true);
    expect(undated.violations.map((x) => x.code)).toContain('provenance_undated');
  });

  it('duplicate assertion ids block, because a citation to them is ambiguous', () => {
    const r = briefIntegrity(draft({ assertions: [sourced(), sourced({ text: 'Something else.' })] }));
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('duplicate_assertion_id');
  });
});

describe('the proposed opening cannot smuggle an unverified claim into a client conversation', () => {
  it('an opening citing an UNVERIFIED assertion is BLOCKING — the worst failure in the system', () => {
    const r = briefIntegrity(
      draft({
        assertions: [sourced({ id: 'u1', status: 'UNVERIFIED', provenance: null, text: 'They are unhappy with their current agency.' })],
        proposedOpening: {
          text: 'I hear the current agency has not been delivering — we scope this narrowly.',
          citedAssertionIds: ['u1'],
          approvedForSend: false,
        },
      }),
    );
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.code === 'opening_cites_unverified');
    expect(v?.blocking).toBe(true);
    expect(v?.detail).toMatch(/Verify it or rewrite the opening/);
  });

  it('an opening citing nothing must declare that it asserts nothing', () => {
    const bad = briefIntegrity(
      draft({ proposedOpening: { text: 'Saw the deadline — worth a call?', citedAssertionIds: [], approvedForSend: false } }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.violations.map((v) => v.code)).toContain('opening_without_citations');

    const good = briefIntegrity(
      draft({
        proposedOpening: {
          text: 'Do you have MiCA white-paper work planned for this quarter?',
          citedAssertionIds: [],
          assertsNothing: true,
          approvedForSend: false,
        },
      }),
    );
    expect(good.ok).toBe(true);
  });

  it('an opening citing an assertion that is not in the brief blocks', () => {
    const r = briefIntegrity(
      draft({ proposedOpening: { text: 'x', citedAssertionIds: ['ghost'], approvedForSend: false } }),
    );
    expect(r.violations.find((v) => v.code === 'opening_cites_unknown_assertion')?.blocking).toBe(true);
  });
});

describe('a brief that knows nothing', () => {
  it('a brief of ONLY unknowns is valid and says so', () => {
    const r = briefIntegrity(
      draft({
        assertions: [],
        unknowns: ['Identified need — not established.', 'No why-now trigger recorded.'],
        trigger: null,
        score: null,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.onlyUnknowns).toBe(true);
    expect(r.assertions).toBe(0);
    expect(r.sourced).toBe(0);
    expect(r.meanProvenanceConfidence).toBeNull();
    expect(r.violations).toEqual([]);
  });

  it('a brief with no assertions AND no unknowns is BLOCKING — the empty page reads as "no concerns"', () => {
    const r = briefIntegrity(draft({ assertions: [], unknowns: [] }));
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toEqual(['empty_brief']);
    expect(r.onlyUnknowns).toBe(false);
  });
});

describe('sealBrief and the printable shape', () => {
  it('the only constructor of a ResearchBrief attaches the verdict and a date', () => {
    const sealed = sealBrief(draft(), '2026-08-01T09:00:00.000Z');
    expect(sealed.generatedIso).toBe('2026-08-01T09:00:00.000Z');
    expect(sealed.integrity.ok).toBe(true);
    // Sealing does not launder a failing brief — it records the failure on it.
    const failing = sealBrief(draft({ assertions: [sourced({ provenance: null })] }), ASOF);
    expect(failing.integrity.ok).toBe(false);
    expect(failing.integrity.violations[0].code).toBe('assertion_without_provenance');
  });

  it('has no free-prose field for an unchecked claim to hide in', () => {
    const sealed = sealBrief(draft(), ASOF);
    const stringKeys = Object.entries(sealed)
      .filter(([, v]) => typeof v === 'string')
      .map(([k]) => k)
      .sort();
    // Only identifiers, timestamps and ONE closed union (`band`) are strings. A
    // `headline` or `summary` here would be a claim nothing can check, and adding
    // one cannot pass this test without a reviewer being told about it by name.
    expect(stringKeys).toEqual(['asOf', 'band', 'generatedIso', 'name', 'targetId']);
  });

  it('sections have a stable printed running order', () => {
    expect(BRIEF_SECTION_ORDER).toContain('risk');
    expect(new Set(BRIEF_SECTION_ORDER).size).toBe(BRIEF_SECTION_ORDER.length);
  });

  it('estimates speak ICD-203, with confidence separate from likelihood', () => {
    const e = briefEstimate(0.72, { sampleSize: 3, meanConfidence: 70 });
    expect(e.pct).toBe(72);
    expect(e.term).toBe('likely');
    expect(e.confidence).toBe('high');
    // Same likelihood, different confidence — the two are orthogonal.
    expect(briefEstimate(0.72, { sampleSize: 0, meanConfidence: 10 })).toMatchObject({ pct: 72, term: 'likely', confidence: 'low' });
  });
});

describe('deriveUnknowns', () => {
  it('lists unanswered factors in TARGET_FACTOR_KEYS order, plus the confidence penalties', () => {
    const q = buildOriginationQueue([input({ id: 'a', screening: 'not_screened', perimeter: 'unknown' })], { asOf: ASOF });
    const row = q.rows[0];
    const unknowns = deriveUnknowns({
      missingFactors: row.missingFactors,
      confidencePenalties: row.confidencePenalties,
      triggerState: row.triggerState,
      unprovenanced: row.unprovenanced,
    });
    expect(unknowns.length).toBeGreaterThan(3);
    expect(unknowns).toContain('Identified need — not established.');
    expect(unknowns).toContain('Sanctions/AML screen not performed.');
    expect(unknowns).toContain('Jurisdiction perimeter unrecorded.');
    expect(unknowns).toContain('No why-now trigger recorded.');
    // Order is the canonical factor order, not the input order, so two briefs of
    // the same target diff meaningfully.
    const needIdx = unknowns.indexOf('Identified need — not established.');
    const urgencyIdx = unknowns.indexOf('Urgency — not established.');
    expect(needIdx).toBeGreaterThanOrEqual(0);
    expect(needIdx).toBeLessThan(urgencyIdx);
  });

  it('is empty when nothing is unknown', () => {
    expect(deriveUnknowns({ missingFactors: [], triggerState: 'fresh' })).toEqual([]);
  });
});
