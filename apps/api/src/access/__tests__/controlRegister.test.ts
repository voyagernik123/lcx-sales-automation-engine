import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSEQUENCE_WEIGHTS,
  CONTROL_REGISTER_CONTRACT,
  MARKER_BOUNDARY,
  MARKER_EPOCHS,
  PROGRAM_CRITICAL_SUBJECTS,
  loadControlRegister,
} from '../controlRegister.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CONTROL THAT DID NOT RUN — the register nothing was reading.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `actions/registry.ts` has stamped `gateDegraded`, `gateDegradedReason`,
 * `overrideSat`, `overrideGate`, `overrideReason` and `idempotencyDegraded` onto
 * `audit_log.meta` since 2026-07-24/25. Nothing read them. So the audit row for a
 * governed act whose control PASSED and the row for one that SUCCEEDED WHILE ITS
 * CONTROL DID NOT RUN look identical to every reader, including whoever signs the
 * board file against them.
 *
 * These tests exist because this surface changes a NUMBER A HUMAN ACTS ON — the rank
 * order of which governed acts need a review filed. Written before the module, so
 * they are a specification and not a description.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. RANK IS CONSEQUENCE, NOT RECENCY. The fixture puts the worst finding OLDEST
 *     on purpose: a recency sort would invert every assertion here.
 *  2. THE SCORE IS NOT LAUNDERED. Every point is attributed to a named component
 *     and the components sum to the total, so a human can disagree with the weights
 *     rather than with a number.
 *  3. THE THREE STATES ARE NEVER COLLAPSED. `rows === null` (not loaded) is a
 *     different fact from `rows === []` (genuinely no markers) is a different fact
 *     from a pre-marker row (UNVERIFIABLE — unknown, NOT clean).
 *  4. THE REGISTER CANNOT CLAIM COMPLETENESS. `coverage.complete` is the literal
 *     `false`, and a recursive scan asserts the payload carries no ratio, no
 *     percentage and no "all passed" string anywhere.
 *  5. EVERY REFUSAL IS RETURNED, each with a code and the rule it cites — the house
 *     pattern (marketingDesk.ts), not the first one found.
 *  6. THE MARKETING GATE-ERROR LEDGER IS READ WITHOUT OPENING A SECOND DOOR. It is
 *     the fourth control vocabulary and had zero readers; its COUNT is governance
 *     information, its text is not, and the payload proves the text is absent.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake that dispatches on SQL text, so they prove the shape of the
 * reads and all of the interpretation, and NOTHING about whether Postgres agrees
 * with the SQL. The planner's use of 0069's partial indexes is likewise unproven
 * here — see the migration's own comment for why the two families are two queries.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** The one error the whole codebase treats as "the migration has not landed". */
const missingTable = (rel: string) =>
  Object.assign(new Error(`relation "${rel}" does not exist`), { code: '42P01' });

type Row = Record<string, unknown>;

interface Answers {
  degraded?: Row[] | Error;
  override?: Row[] | Error;
  frame?: Row[] | Error;
  reviews?: Row[] | Error;
  gateErrors?: Row[] | Error;
}

/**
 * A pool that answers each of the register's five reads independently, because the
 * point of most of these tests is that ONE read failing does not fabricate a value
 * for the others. Dispatch is on distinctive SQL text rather than call order: call
 * order is an implementation detail and a test that pins it fails on a refactor
 * that changed nothing.
 */
function fakePool(a: Answers): { pool: pg.Pool; sql: string[] } {
  const sql: string[] = [];
  const answer = (v: Row[] | Error | undefined) => {
    if (v instanceof Error) throw v;
    const rows = v ?? [];
    return { rows, rowCount: rows.length };
  };
  const pool = {
    query: async (text: string) => {
      sql.push(text);
      // The gate-error read is an aggregate, so Postgres ALWAYS returns exactly one
      // row. Defaulting to a zero row keeps the fake from handing the module an
      // answer the real database cannot give (and which it would rightly call
      // not-loaded rather than empty).
      if (/marketing_outbound_gate_decision/.test(text)) {
        return answer(a.gateErrors ?? [{ n: '0', earliest: null, latest: null }]);
      }
      if (/analytic_reviews/.test(text)) return answer(a.reviews);
      if (/'idempotencyDegraded'/.test(text) && !/'overrideSat'/.test(text)) return answer(a.degraded);
      if (/'overrideSat'/.test(text) && !/MIN\(/.test(text)) return answer(a.override);
      return answer(a.frame);
    },
  } as unknown as pg.Pool;
  return { pool, sql };
}

/**
 * A denominator row that agrees with a given marker count.
 *
 * EVERY COLUMN THE MODULE READS IS PRESENT, and that is now load-bearing: `int()`
 * returns `null` rather than `0` for a missing key, and a null in any denominator
 * raises DENOMINATOR_UNREADABLE. A fixture that omits a column is therefore a fixture
 * that tests the refusal path by accident — which is what a `0`-defaulting helper used
 * to hide. `marked_pre_boundary_all_time` is the column added so
 * `unverifiable.governedActsAllTime` is computed on the same definition as its
 * in-window sibling.
 */
function frame(over: Row = {}): Row[] {
  return [{
    earliest_row: new Date('2026-06-01T00:00:00.000Z'),
    governed_all_time: '400',
    governed_pre_boundary_all_time: '120',
    governed_in_window: '200',
    governed_in_window_pre_boundary: '0',
    marked_in_window: '0',
    marked_in_window_pre_boundary: '0',
    marked_pre_boundary_all_time: '0',
    ...over,
  }];
}

const NOW = new Date('2026-08-06T12:00:00.000Z');

/** An audit row as `audit_log` actually returns one. */
function auditRow(over: Row & { meta?: Row }): Row {
  return {
    id: 'a1',
    actor: 'nikhil.sharma@lcx.com',
    action: 'action:command_decide',
    entity: 'command_decision',
    entity_id: 'dec_07',
    created_at: new Date('2026-08-01T09:00:00.000Z'),
    meta: {},
    ...over,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  1. RANK BY CONSEQUENCE, NOT BY RECENCY
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the register ranks by consequence computed from the data', () => {
  /**
   * THE FIXTURE IS ARRANGED SO RECENCY GIVES THE WRONG ANSWER. `old_gate` is the
   * oldest row and the worst finding (a control that did not run, on a
   * program-critical decision, never reviewed). `new_override` is the newest and
   * the mildest (a human accepted a documented risk and the review landed after).
   */
  const degraded = [
    auditRow({
      id: 'old_gate',
      entity: 'command_decision',
      entity_id: 'dec_01',
      created_at: new Date('2026-08-01T09:00:00.000Z'),
      meta: {
        gateDegraded: true,
        gateDegradedReason: 'analytic_reviews does not exist (42P01) — the SAT gate was NOT evaluated',
      },
    }),
  ];
  const override = [
    auditRow({
      id: 'new_override',
      action: 'action:dist_campaign_status',
      entity: 'dist_campaign',
      entity_id: 'camp_9',
      created_at: new Date('2026-08-05T09:00:00.000Z'),
      meta: { overrideGate: true, overrideReason: 'launch window; legal signed off by email' },
    }),
  ];
  const reviews = [{
    subject_type: 'dist_campaign',
    subject_id: 'camp_9',
    kind: 'legal_check',
    created_at: new Date('2026-08-05T10:00:00.000Z'),
  }];

  it('puts the un-reviewed gate-not-evaluated row above the newer, remediated override', async () => {
    const { pool } = fakePool({ degraded, override, reviews, frame: frame({ marked_in_window: '2' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).not.toBeNull();
    expect(reg.rows!.map((r) => r.auditId)).toEqual(['old_gate', 'new_override']);
    // The inversion this test exists for, stated as its own assertion.
    expect(reg.rows![0].occurredAt < reg.rows![1].occurredAt).toBe(true);
  });

  it('reads the findings, the reasons and the remediation off the row itself', async () => {
    const { pool } = fakePool({ degraded, override, reviews, frame: frame({ marked_in_window: '2' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    const [gate, ovr] = reg.rows!;

    expect(gate.findings).toEqual(['gate_not_evaluated']);
    expect(gate.gateDegradedReason).toMatch(/SAT gate was NOT evaluated/);
    expect(gate.programCritical).toBe(true);
    expect(gate.remediation).toBe('not_filed');
    expect(gate.reviewKindsAfter).toEqual([]);

    expect(ovr.findings).toEqual(['override_accepted']);
    expect(ovr.overrideReason).toMatch(/legal signed off/);
    expect(ovr.programCritical).toBe(false);
    expect(ovr.remediation).toBe('filed');
    expect(ovr.reviewKindsAfter).toEqual(['legal_check']);
    expect(ovr.firstReviewAfter).toBe('2026-08-05T10:00:00.000Z');
  });

  it('does NOT count a review filed BEFORE the act as remediation', async () => {
    // The marker says the control was not evaluated AT THE TIME. A review that
    // predates the act cannot be the one that was missing.
    const { pool } = fakePool({
      degraded: [],
      override,
      reviews: [{ ...reviews[0], created_at: new Date('2026-08-04T09:00:00.000Z') }],
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows![0].remediation).toBe('not_filed');
    expect(reg.rows![0].reviewKindsAfter).toEqual([]);
  });

  it('counts recurrence on the same subject and charges for it', async () => {
    const twice = [
      auditRow({ id: 'r1', entity_id: 'dec_07', created_at: new Date('2026-08-01T09:00:00.000Z'), meta: { gateDegraded: true } }),
      auditRow({ id: 'r2', entity_id: 'dec_07', created_at: new Date('2026-08-02T09:00:00.000Z'), meta: { gateDegraded: true } }),
      auditRow({ id: 'r3', entity_id: 'dec_08', created_at: new Date('2026-08-03T09:00:00.000Z'), meta: { gateDegraded: true } }),
    ];
    const { pool } = fakePool({ degraded: twice, frame: frame({ marked_in_window: '3' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    const byId = new Map(reg.rows!.map((r) => [r.auditId, r]));
    expect(byId.get('r1')!.recurrence).toBe(2);
    expect(byId.get('r2')!.recurrence).toBe(2);
    expect(byId.get('r3')!.recurrence).toBe(1);
    expect(byId.get('r1')!.consequence).toBeGreaterThan(byId.get('r3')!.consequence);
  });

  it('charges an unattributable machine actor and not a named human', async () => {
    const rows = [
      auditRow({ id: 'human', actor: 'nikhil.sharma@lcx.com', entity_id: 'dec_07', meta: { gateDegraded: true } }),
      auditRow({ id: 'machine', actor: 'operator', entity_id: 'dec_08', meta: { gateDegraded: true } }),
    ];
    const { pool } = fakePool({ degraded: rows, frame: frame({ marked_in_window: '2' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    const byId = new Map(reg.rows!.map((r) => [r.auditId, r]));
    expect(byId.get('machine')!.actorIsMachine).toBe(true);
    expect(byId.get('human')!.actorIsMachine).toBe(false);
    expect(byId.get('machine')!.consequence - byId.get('human')!.consequence)
      .toBe(CONSEQUENCE_WEIGHTS.unattributableActor);
  });

  it('reports a row carrying markers from BOTH families exactly once', async () => {
    // `invokeAction` stamps the degradation markers and the client's override flag
    // onto the same `recorded` object, so one row can satisfy both partial indexes
    // and comes back from both queries.
    const both = auditRow({
      id: 'both',
      meta: { gateDegraded: true, overrideSat: true, overrideReason: 'time-critical' },
    });
    const { pool } = fakePool({ degraded: [both], override: [both], frame: frame({ marked_in_window: '1' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).toHaveLength(1);
    expect(reg.rows![0].findings).toEqual(['gate_not_evaluated', 'override_accepted']);
  });

  it('treats an override flag sent as `false` as no override at all', async () => {
    // `overrideSat` is an optional client-supplied boolean, so `{overrideSat:false}`
    // puts the KEY in meta without an override having happened. 0069's index
    // predicate is key existence — a deliberate superset — and the value is judged
    // here. Without this the register would invent findings.
    const row = auditRow({ id: 'noop', meta: { overrideSat: false } });
    const { pool } = fakePool({ override: [row], frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).toEqual([]);
  });

  /**
   * ── THE COUNT AND THE LIST MUST AGREE ABOUT THE SAME ROW ────────────────────
   *
   * THE DEFECT THIS PINS, which shipped and was caught in review: the denominator
   * FILTER matched on jsonb KEY EXISTENCE while the row reader narrowed to `=== true`,
   * so a single `{overrideSat: false}` row was COUNTED as marked, EXCLUDED from the
   * register, and reconciled by no refusal. With that row alone in the window the page
   * rendered "MARKED ACTS IN WINDOW · 1" directly above "NO MARKED ACTS IN THIS
   * WINDOW", and `cleanInWindow` was short by one.
   *
   * The old version of the test above asserted `rows` and NEVER the counts, which is
   * exactly how the defect passed a suite that documented the superset behaviour.
   */
  it('does not count a `false` override as marked — the counts and the list agree', async () => {
    const row = auditRow({ id: 'noop', meta: { chosen: 'Option A', overrideSat: false } });
    // What real Postgres now returns for this window: the truthiness FILTER matches
    // nothing, so `marked_in_window` is 0 even though the index predicate matched.
    const { pool } = fakePool({ override: [row], frame: frame({ marked_in_window: '0' }) });
    const reg = await loadControlRegister(pool, { now: NOW });

    expect(reg.rows).toEqual([]);
    expect(reg.counts.markedInWindow).toBe(0);
    // The superset IS visible, as itself: one row was fetched, none was publishable.
    expect(reg.counts.scanned).toBe(1);
    expect(reg.counts.shown).toBe(0);
    // 200 governed acts, none marked ⇒ 200 clean. Under-reported by one before the fix.
    expect(reg.counts.cleanInWindow).toBe(200);
    // And the superset is NOT mistaken for truncation.
    expect(reg.refusals.map((r) => r.code)).not.toContain('CONTROL_REGISTER_TRUNCATED');
    expect(reg.refusals.map((r) => r.code)).not.toContain('MARKER_COUNT_DISAGREES');
  });

  it('counts marked acts by TRUTHINESS in SQL, not by jsonb key existence', async () => {
    const { pool, sql } = fakePool({ frame: frame() });
    await loadControlRegister(pool, { now: NOW });
    const denom = sql.find((s) => /MIN\(/.test(s))!;
    // The four keys are compared to the literal 'true', which is `=== true` in SQL.
    for (const key of ['gateDegraded', 'idempotencyDegraded', 'overrideSat', 'overrideGate']) {
      expect(denom, `the denominator must test ${key} by value`)
        .toMatch(new RegExp(`al\\.meta ->> '${key}' = 'true'`));
    }
    // And NOT by key existence, which is what made the count a superset of the list.
    expect(denom).not.toMatch(/al\.meta \? '/);
    // The SCANS keep key existence, because that is what 0069's partial indexes are.
    const scan = sql.find((s) => /'gateDegraded'/.test(s) && !/MIN\(/.test(s))!;
    expect(scan).toMatch(/al\.meta \? 'gateDegraded'/);
  });

  it('emits MARKER_COUNT_DISAGREES when the count is smaller than the list', async () => {
    // Not reachable while both reads share one predicate — which is the point: if it
    // ever fires, one of the two reads is wrong and the register says so rather than
    // choosing which of itself to believe.
    const rows = [
      auditRow({ id: 'd1', entity_id: 'dec_07', meta: { gateDegraded: true } }),
      auditRow({ id: 'd2', entity_id: 'dec_08', meta: { gateDegraded: true } }),
    ];
    const { pool } = fakePool({ degraded: rows, frame: frame({ marked_in_window: '1' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    const r = reg.refusals.find((x) => x.code === 'MARKER_COUNT_DISAGREES');
    expect(r).toBeDefined();
    expect(r!.sentence).toMatch(/disagree/);
    // Both numbers travel in the sentence so a reader can see which way round it is.
    expect(r!.sentence).toMatch(/\b2\b/);
    expect(r!.sentence).toMatch(/\b1\b/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  2. THE SCORE IS ATTRIBUTED, NOT ASSERTED
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the consequence score is not laundered into a certainty', () => {
  it('attributes every point to a named component that sums to the total', async () => {
    const { pool } = fakePool({
      degraded: [auditRow({
        id: 'x',
        actor: 'operator',
        entity: 'command_decision',
        entity_id: 'dec_19',
        meta: { gateDegraded: true, idempotencyDegraded: true, overrideSat: true },
      })],
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    const row = reg.rows![0];
    const summed = row.consequenceComponents.reduce((n, c) => n + c.points, 0);
    expect(summed).toBe(row.consequence);
    // Each component says WHY in words a human can argue with.
    for (const c of row.consequenceComponents) {
      expect(c.because.length).toBeGreaterThan(20);
      expect(c.points).toBeGreaterThan(0);
    }
    expect(row.consequenceComponents.map((c) => c.key)).toContain('programCritical');
  });

  it('names the two program-critical subjects it privileges, from registry.ts', async () => {
    expect(PROGRAM_CRITICAL_SUBJECTS).toEqual([
      { subjectType: 'command_decision', subjectId: 'dec_01' },
      { subjectType: 'command_decision', subjectId: 'dec_19' },
    ]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  3. THREE STATES, NEVER COLLAPSED
 * ════════════════════════════════════════════════════════════════════════════ */
describe('not-loaded, genuinely-empty and unverifiable are three different facts', () => {
  it('NOT LOADED: audit_log absent gives rows === null and NO count of any kind', async () => {
    const err = missingTable('audit_log');
    const { pool } = fakePool({ degraded: err, override: err, frame: err });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).toBeNull();
    expect(reg.counts.markedInWindow).toBeNull();
    expect(reg.counts.cleanInWindow).toBeNull();
    expect(reg.counts.governedActsInWindow).toBeNull();
    /*
     * `scanned` and `shown` USED TO BE TYPED `number` AND PUBLISHED AS 0 HERE — two
     * fabricated zeros among three honest nulls, in the payload whose sibling fields
     * are documented as null "when the audit log was not read". The type made it
     * impossible for any caller to tell "nothing was scanned" from "we could not look".
     */
    expect(reg.counts.scanned).toBeNull();
    expect(reg.counts.shown).toBeNull();
    // Not one count in the payload is a number when nothing was read.
    expect(Object.values(reg.counts).every((v) => v === null)).toBe(true);
    expect(reg.frame.earliestReachableRow).toBeNull();
    // And the null above is labelled: not-read, NOT an empty table.
    expect(reg.frame.auditLogEmpty).toBeNull();
    expect(reg.refusals.map((r) => r.code)).toContain('AUDIT_LOG_ABSENT');
  });

  it('GENUINELY EMPTY: no markers gives rows === [] plus the window and the earliest row', async () => {
    const { pool } = fakePool({ frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW, windowDays: 30 });
    expect(reg.rows).toEqual([]);
    expect(reg.counts.markedInWindow).toBe(0);
    expect(reg.counts.scanned).toBe(0);
    expect(reg.counts.shown).toBe(0);
    // "Nothing found" is only interpretable beside what was searched.
    expect(reg.frame.windowFrom).toBe('2026-07-07T12:00:00.000Z');
    expect(reg.frame.windowTo).toBe('2026-08-06T12:00:00.000Z');
    expect(reg.frame.windowDays).toBe(30);
    expect(reg.frame.earliestReachableRow).toBe('2026-06-01T00:00:00.000Z');
    expect(reg.frame.auditLogEmpty).toBe(false);
  });

  /**
   * ── AN EMPTY audit_log IS NOT AN UNREADABLE ONE ─────────────────────────────
   *
   * The fixture is the exact row real Postgres returns for the denominator aggregate
   * over a table with zero rows: `MIN(created_at)` is NULL and every `COUNT(*) FILTER`
   * is 0. `iso(null)` gave `earliestReachableRow: null` — byte-identical to the 42P01
   * path asserted above — and the page rendered it as "The oldest reachable audit row
   * could not be READ, so the depth of this window is unknown". It was read. It is
   * empty. That is an absence claimed about a successful read, in the one field whose
   * declared job is keeping the two apart, and no test in the lane covered it.
   */
  it('EMPTY TABLE: a read that found zero rows is not a read that failed', async () => {
    const { pool } = fakePool({
      frame: [{
        earliest_row: null,
        governed_all_time: '0',
        governed_pre_boundary_all_time: '0',
        governed_in_window: '0',
        governed_in_window_pre_boundary: '0',
        marked_in_window: '0',
        marked_in_window_pre_boundary: '0',
        marked_pre_boundary_all_time: '0',
      }],
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).toEqual([]);
    // THE FIELD THAT DISTINGUISHES THEM, which is the whole fix.
    expect(reg.frame.auditLogEmpty).toBe(true);
    expect(reg.frame.earliestReachableRow).toBeNull();
    // Every count is a genuine zero, not a null: the read succeeded.
    expect(reg.counts).toEqual({
      markedInWindow: 0, scanned: 0, shown: 0, governedActsInWindow: 0, cleanInWindow: 0,
    });
    // Nothing to refuse: an empty log is a fact, and it is not AUDIT_LOG_ABSENT.
    expect(reg.refusals.map((r) => r.code)).not.toContain('AUDIT_LOG_ABSENT');
    expect(reg.refusals.map((r) => r.code)).not.toContain('DENOMINATOR_UNREADABLE');
  });

  it('distinguishes an empty table from one whose oldest timestamp cannot be read', async () => {
    // A third combination the page has its own sentence for: rows exist, the timestamp
    // does not parse. Previously indistinguishable from both of the above.
    const { pool } = fakePool({ frame: frame({ earliest_row: 'not-a-date' }) });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.frame.auditLogEmpty).toBe(false);
    expect(reg.frame.earliestReachableRow).toBeNull();
  });

  it('DENOMINATOR UNREADABLE: an unusable aggregate refuses instead of publishing zeros', async () => {
    // `int()` mapped undefined/null/non-numeric to 0, so a denominator read that came
    // back unusable was published as `markedInWindow: 0, governedActsInWindow: 0,
    // cleanInWindow: 0` with `refusals: []` — an estimate of zero from the module whose
    // entire purpose is refusing to estimate.
    const { pool } = fakePool({ frame: [{ earliest_row: null }] });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.counts.markedInWindow).toBeNull();
    expect(reg.counts.governedActsInWindow).toBeNull();
    expect(reg.counts.cleanInWindow).toBeNull();
    expect(reg.refusals.map((r) => r.code)).toContain('DENOMINATOR_UNREADABLE');
    // And it is NOT reported as an empty audit log, which is a different finding.
    expect(reg.refusals.map((r) => r.code)).not.toContain('AUDIT_LOG_ABSENT');
  });

  it('does not throw when a timestamp on a marker row cannot be parsed', async () => {
    // `iso()` called `new Date(v).toISOString()` with no validity guard, so any
    // non-parseable date propagated a RangeError out of the module and the route
    // turned it into a 500 on the audit surface. Low reachability (pg parses
    // timestamptz to Date) and this is the only date helper the module has.
    const { pool } = fakePool({
      degraded: [auditRow({ id: 'bad', created_at: 'not-a-date', meta: { gateDegraded: true } })],
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows).toHaveLength(1);
    // Falls back to the window start rather than throwing or inventing a date.
    expect(reg.rows![0].occurredAt).toBe(reg.frame.windowFrom);
  });

  it('UNVERIFIABLE: pre-marker acts are their own bucket with the boundary named', async () => {
    const { pool } = fakePool({
      frame: frame({ governed_in_window: '50', governed_in_window_pre_boundary: '12', marked_in_window: '0' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW, windowDays: 60 });
    expect(reg.unverifiable.governedActsInWindow).toBe(12);
    expect(reg.unverifiable.governedActsAllTime).toBe(120);
    expect(reg.unverifiable.boundary).toBe(MARKER_BOUNDARY);
    // Those 12 are NOT in the clean count. 50 acts, 12 unverifiable, 38 clean.
    expect(reg.counts.cleanInWindow).toBe(38);
    const refusal = reg.refusals.find((r) => r.code === 'PRE_MARKER_ACTS_UNVERIFIABLE');
    expect(refusal).toBeDefined();
    expect(refusal!.sentence).toMatch(/UNKNOWN/);
    expect(refusal!.sentence).not.toMatch(/clean/i);
  });

  it('computes BOTH unverifiable figures on the same definition — no marker, pre-boundary', async () => {
    /*
     * `governedActsInWindow` subtracted pre-boundary MARKED acts and
     * `governedActsAllTime` on the very next line did not — two fields under ONE
     * leading comment ("predate the boundary and CARRY NO MARKER") answering two
     * different questions the moment a pre-boundary marked act existed. Here 30
     * pre-boundary governed acts all-time of which 7 are marked ⇒ 23 unverifiable, and
     * 10 in-window of which 4 are marked ⇒ 6.
     */
    const { pool } = fakePool({
      frame: frame({
        governed_in_window: '50',
        governed_in_window_pre_boundary: '10',
        marked_in_window: '4',
        marked_in_window_pre_boundary: '4',
        governed_pre_boundary_all_time: '30',
        marked_pre_boundary_all_time: '7',
      }),
    });
    const reg = await loadControlRegister(pool, { now: NOW, windowDays: 60 });
    expect(reg.unverifiable.governedActsInWindow).toBe(6);
    expect(reg.unverifiable.governedActsAllTime).toBe(23);
  });

  it('names every marker commit and date, and takes the LATEST as the boundary', async () => {
    expect(MARKER_EPOCHS.length).toBeGreaterThanOrEqual(4);
    for (const e of MARKER_EPOCHS) {
      expect(e.commit).toMatch(/^[0-9a-f]{7}$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.site.length).toBeGreaterThan(5);
    }
    const latest = MARKER_EPOCHS.map((e) => e.date).sort().at(-1)!;
    // Conservative on purpose: the GPS limb's marker is the youngest, so a row older
    // than it cannot be verified against every marker the register reads.
    expect(MARKER_BOUNDARY.startsWith(latest)).toBe(true);
    expect(latest).toBe('2026-07-31');
  });

  it('REVIEWS NOT LOADED: remediation is `unknown`, never `not_filed`', async () => {
    const { pool } = fakePool({
      degraded: [auditRow({ id: 'x', meta: { gateDegraded: true } })],
      reviews: missingTable('analytic_reviews'),
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.rows![0].remediation).toBe('unknown');
    // null, not [] — "we did not look" is not "nothing was filed".
    expect(reg.rows![0].reviewKindsAfter).toBeNull();
    expect(reg.refusals.map((r) => r.code)).toContain('REVIEW_REGISTER_ABSENT');
    // Unknown is charged like unremediated: absence must never rank as safety.
    expect(reg.rows![0].consequenceComponents.map((c) => c.key)).toContain('unremediatedOrUnknown');
  });

  it('clamps a negative clean count to zero rather than reporting a negative', async () => {
    // Only reachable if the marker predicate and the `action:%` predicate ever
    // disagree — a marked row whose action is not registry-mediated. Reported as a
    // refusal instead of an arithmetic artefact a reader would have to explain.
    const { pool } = fakePool({
      frame: frame({ governed_in_window: '1', marked_in_window: '5' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.counts.cleanInWindow).toBe(0);
    expect(reg.refusals.map((r) => r.code)).toContain('DENOMINATOR_DISAGREES');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  4. THE REGISTER CANNOT CLAIM COMPLETENESS
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the register labels itself structurally incomplete', () => {
  it('carries coverage.complete === false and says what it does not cover', async () => {
    const { pool } = fakePool({ frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.coverage.complete).toBe(false);
    expect(reg.coverage.covers.length).toBeGreaterThan(0);
    expect(reg.coverage.doesNotCover.length).toBeGreaterThan(2);
    expect(reg.coverage.statement).toMatch(/cannot/i);
  });

  it('contains no ratio, no percentage and no all-passed claim anywhere in the payload', async () => {
    const { pool } = fakePool({
      degraded: [auditRow({ id: 'x', meta: { gateDegraded: true } })],
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });

    const keys: string[] = [];
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) { keys.push(k); walk(val); }
        return;
      }
      if (typeof v === 'string') strings.push(v);
    };
    walk(reg);

    // A denominator the register does not have must not appear as a field name.
    for (const k of keys) {
      expect(k, `field name ${k} implies a denominator this register does not have`)
        .not.toMatch(/percent|pct|ratio|rate$|score$|allPassed|passRate/i);
    }
    const blob = strings.join(' ');
    expect(blob).not.toMatch(/100%/);
    expect(blob).not.toMatch(/all controls passed/i);
  });

  it('says the ranking is over a truncated population when it is', async () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      auditRow({ id: `m${i}`, entity_id: `dec_${i}`, meta: { gateDegraded: true } }));
    const { pool } = fakePool({ degraded: many, frame: frame({ marked_in_window: '900' }) });
    const reg = await loadControlRegister(pool, { now: NOW, limit: 3 });
    expect(reg.counts.markedInWindow).toBe(900);
    expect(reg.counts.scanned).toBe(3);
    const r = reg.refusals.find((x) => x.code === 'CONTROL_REGISTER_TRUNCATED');
    expect(r).toBeDefined();
    expect(r!.sentence).toMatch(/900/);
  });

  /**
   * ── THE SECOND TRUNCATION, WHICH THE REFUSAL DID NOT GUARD ──────────────────
   *
   * `limit` is applied TWICE: once per marker family in SQL, and again to the merged
   * ranked list (`rows.slice(0, limit)`). The refusal compared `markedInWindow` against
   * `scanned`, so when each family returns FEWER than `limit` rows but their union
   * exceeds it, `markedInWindow === scanned` and half the register vanished with no
   * admission at all. Measured before the fix: limit 3, three `gateDegraded` rows and
   * three `overrideSat` rows, `marked_in_window` 6 ⇒ scanned 6, shown 3, rows 3, and
   * `refusals` held only PRE_MARKER_ACTS_UNVERIFIABLE.
   *
   * At the production default this is the shape of any window holding ~150 GPS-discount
   * acts plus ~150 SAT/campaign acts — 100 marked acts dropped from a governance list
   * that reads as complete.
   */
  it('admits truncation when the MERGE drops rows even though each family fit', async () => {
    const degraded = Array.from({ length: 3 }, (_, i) =>
      auditRow({ id: `g${i}`, entity_id: `dec_g${i}`, meta: { gateDegraded: true } }));
    const override = Array.from({ length: 3 }, (_, i) =>
      auditRow({ id: `o${i}`, entity_id: `dec_o${i}`, meta: { overrideSat: true } }));
    const { pool } = fakePool({ degraded, override, frame: frame({ marked_in_window: '6' }) });
    const reg = await loadControlRegister(pool, { now: NOW, limit: 3 });

    // Neither family hit the SQL limit, so the old guard saw 6 === 6 and said nothing.
    expect(reg.counts.markedInWindow).toBe(6);
    expect(reg.counts.scanned).toBe(6);
    expect(reg.counts.shown).toBe(3);
    expect(reg.rows).toHaveLength(3);

    const r = reg.refusals.find((x) => x.code === 'CONTROL_REGISTER_TRUNCATED');
    expect(r, 'half the marked acts are missing and nothing said so').toBeDefined();
    // Every number in the arithmetic is in the sentence: found, interpreted, published.
    expect(r!.sentence).toMatch(/6 marked acts exist/);
    expect(r!.sentence).toMatch(/6 audit row\(s\) were fetched/);
    expect(r!.sentence).toMatch(/3 are published/);
  });

  it('admits the merge truncation even when the denominator could not be read', async () => {
    // The second limb of the guard is independent of `markedInWindow`, so a register
    // whose denominator is unreadable still cannot publish a short list in silence.
    const degraded = Array.from({ length: 2 }, (_, i) =>
      auditRow({ id: `g${i}`, entity_id: `dec_g${i}`, meta: { gateDegraded: true } }));
    const { pool } = fakePool({ degraded, frame: [{ earliest_row: null }] });
    const reg = await loadControlRegister(pool, { now: NOW, limit: 1 });
    expect(reg.counts.markedInWindow).toBeNull();
    expect(reg.counts.shown).toBe(1);
    expect(reg.refusals.map((r) => r.code)).toContain('CONTROL_REGISTER_TRUNCATED');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  5. EVERY REFUSAL, WITH ITS RULE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('refusals are returned in full, each citing its rule', () => {
  it('returns ALL of them when several absences coincide, not the first found', async () => {
    const { pool } = fakePool({
      degraded: [auditRow({ id: 'x', meta: { gateDegraded: true } })],
      reviews: missingTable('analytic_reviews'),
      gateErrors: missingTable('marketing_outbound_gate_decision'),
      frame: frame({ marked_in_window: '1', governed_in_window: '10', governed_in_window_pre_boundary: '4' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    const codes = reg.refusals.map((r) => r.code);
    expect(codes).toContain('REVIEW_REGISTER_ABSENT');
    expect(codes).toContain('GATE_ERROR_LEDGER_ABSENT');
    expect(codes).toContain('PRE_MARKER_ACTS_UNVERIFIABLE');
    expect(codes.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every refusal a stable code and a cited rule with text', async () => {
    const err = missingTable('audit_log');
    const { pool } = fakePool({
      degraded: err, override: err, frame: err,
      reviews: missingTable('analytic_reviews'),
      gateErrors: missingTable('marketing_outbound_gate_decision'),
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.refusals.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const r of reg.refusals) {
      expect(r.code).toMatch(/^[A-Z][A-Z_]+$/);
      expect(seen.has(r.code), `duplicate refusal ${r.code}`).toBe(false);
      seen.add(r.code);
      expect(r.sentence.length).toBeGreaterThan(30);
      expect(r.rule.instrument.length).toBeGreaterThan(0);
      expect(r.rule.provision.length).toBeGreaterThan(0);
      expect(r.rule.text.length).toBeGreaterThan(30);
    }
  });

  /* ══ THE EXPORTED FUNCTION IS SAFE ON ITS OWN, NOT ONLY BEHIND THE ROUTE ══════
   *
   * Only the HTTP route clamped, so every one of these was measured against the
   * exported function before the guard existed:
   *   windowDays NaN / ±Infinity / 1e15 / 1e21  → THREW `Invalid time value`
   *   windowDays -30                            → windowFrom AFTER windowTo, published
   *                                               as `windowDays: -30`, no refusal
   *   limit 0 / -5 / NaN / 0.5                  → rows [] and shown 0 while scanned 1,
   *                                               so the page rendered "NO MARKED ACTS
   *                                               IN THIS WINDOW" for a window holding
   *                                               a marked act
   */
  it('never inverts the window, and says so when it clamps', async () => {
    const { pool } = fakePool({ frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW, windowDays: -30 });
    expect(reg.frame.windowFrom < reg.frame.windowTo).toBe(true);
    expect(reg.frame.windowDays).toBe(1);
    const r = reg.refusals.find((x) => x.code === 'REGISTER_OPTIONS_CLAMPED');
    expect(r).toBeDefined();
    expect(r!.sentence).toMatch(/requested as -30/);
    expect(r!.sentence).toMatch(/applied as 1/);
  });

  it('does not throw on a non-finite window, and does not silently accept it either', async () => {
    for (const windowDays of [NaN, Infinity, -Infinity, 1e21]) {
      const { pool } = fakePool({ frame: frame() });
      const reg = await loadControlRegister(pool, { now: NOW, windowDays });
      expect(reg.frame.windowFrom < reg.frame.windowTo).toBe(true);
      expect(reg.frame.windowDays).toBeGreaterThanOrEqual(1);
      expect(reg.frame.windowDays).toBeLessThanOrEqual(730);
      expect(reg.refusals.map((x) => x.code)).toContain('REGISTER_OPTIONS_CLAMPED');
    }
  });

  it('never publishes an empty register because `limit` was zero', async () => {
    const { pool } = fakePool({
      degraded: [auditRow({ id: 'x', meta: { gateDegraded: true } })],
      frame: frame({ marked_in_window: '1' }),
    });
    const reg = await loadControlRegister(pool, { now: NOW, limit: 0 });
    // A marked act was fetched and interpreted, so it is LISTED — not silently dropped.
    expect(reg.rows).toHaveLength(1);
    expect(reg.counts.shown).toBe(1);
    expect(reg.refusals.map((x) => x.code)).toContain('REGISTER_OPTIONS_CLAMPED');
  });

  it('leaves in-range options alone and emits no clamp refusal', async () => {
    const { pool } = fakePool({ frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW, windowDays: 30, limit: 50 });
    expect(reg.frame.windowDays).toBe(30);
    expect(reg.refusals.map((x) => x.code)).not.toContain('REGISTER_OPTIONS_CLAMPED');
  });

  it('propagates a database error that is NOT 42P01 instead of reporting an absence', async () => {
    // The bare-catch failure this repo has paid for twice: a broken database must
    // not read as an empty register.
    const boom = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    const { pool } = fakePool({ frame: boom });
    await expect(loadControlRegister(pool, { now: NOW })).rejects.toThrow(/deadlock/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6. THE FOURTH VOCABULARY, READ WITHOUT OPENING A SECOND DOOR
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the marketing gate-error ledger gets its first reader', () => {
  it('reports the count and withholds the text — present-but-withheld, not empty', async () => {
    const { pool } = fakePool({
      frame: frame(),
      gateErrors: [{
        n: '7',
        earliest: new Date('2026-07-20T00:00:00.000Z'),
        latest: new Date('2026-08-05T00:00:00.000Z'),
      }],
    });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.gateErrors.state).toBe('present_but_withheld');
    expect(reg.gateErrors.count).toBe(7);
    expect(reg.gateErrors.earliest).toBe('2026-07-20T00:00:00.000Z');
    expect(reg.refusals.map((r) => r.code)).toContain('GATE_ERROR_DETAIL_WITHHELD');

    // No reply id, no error text, no asset symbol can leave through governance.
    const blob = JSON.stringify(reg.gateErrors);
    expect(blob).not.toMatch(/reply/i);
    expect(blob).not.toMatch(/gate_error|gateErrorText/);
  });

  it('distinguishes zero gate errors from an absent ledger', async () => {
    const empty = await loadControlRegister(
      fakePool({ frame: frame(), gateErrors: [{ n: '0', earliest: null, latest: null }] }).pool,
      { now: NOW },
    );
    expect(empty.gateErrors.state).toBe('empty');
    expect(empty.gateErrors.count).toBe(0);
    expect(empty.refusals.map((r) => r.code)).not.toContain('GATE_ERROR_LEDGER_ABSENT');

    const absent = await loadControlRegister(
      fakePool({ frame: frame(), gateErrors: missingTable('marketing_outbound_gate_decision') }).pool,
      { now: NOW },
    );
    expect(absent.gateErrors.state).toBe('not_loaded');
    expect(absent.gateErrors.count).toBeNull();
    expect(absent.refusals.map((r) => r.code)).toContain('GATE_ERROR_LEDGER_ABSENT');
  });

  it('an unreadable aggregate is not an empty ledger', async () => {
    // `int()` used to make `{n: null}` into `count: 0`, and the page renders 0 as "This
    // ledger was read and is genuinely empty." Unreachable against real Postgres —
    // COUNT never returns NULL — but it is the mechanism by which the fake-pool suite
    // is structurally unable to notice a shape error, which the header admits only in
    // the abstract.
    const { pool } = fakePool({ frame: frame(), gateErrors: [{ n: null, earliest: null, latest: null }] });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.gateErrors.state).toBe('not_loaded');
    expect(reg.gateErrors.count).toBeNull();
    const codes = reg.refusals.map((r) => r.code);
    expect(codes).toContain('GATE_ERROR_COUNT_UNREADABLE');
    // A separate code from the missing-relation case: two facts, two sentences.
    expect(codes).not.toContain('GATE_ERROR_LEDGER_ABSENT');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  7. THE READS THEMSELVES
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the reads are the shape production already uses', () => {
  it('joins reviews on the polymorphic subject with status=active, as registry.ts does', async () => {
    const { pool, sql } = fakePool({
      degraded: [auditRow({ id: 'x', meta: { gateDegraded: true } })],
      frame: frame({ marked_in_window: '1' }),
    });
    await loadControlRegister(pool, { now: NOW });
    const review = sql.find((s) => /analytic_reviews/.test(s))!;
    expect(review).toMatch(/subject_type/);
    expect(review).toMatch(/subject_id/);
    expect(review).toMatch(/status\s*=\s*'active'/);
  });

  it('asks for the two marker families as TWO queries so 0069 partial indexes apply', async () => {
    const { pool, sql } = fakePool({ frame: frame() });
    await loadControlRegister(pool, { now: NOW });
    const degraded = sql.filter((s) => /'gateDegraded'/.test(s) && /'idempotencyDegraded'/.test(s) && !/'overrideSat'/.test(s));
    const override = sql.filter((s) => /'overrideSat'/.test(s) && /'overrideGate'/.test(s) && !/'gateDegraded'/.test(s));
    expect(degraded).toHaveLength(1);
    expect(override).toHaveLength(1);
    // Exactly the predicates 0069 indexes, or the planner will not use them.
    const migration = readFileSync(
      resolve(HERE, '../../db/migrations/0069_audit_control_markers.sql'), 'utf8',
    );
    expect(migration).toMatch(/WHERE meta \? 'gateDegraded' OR meta \? 'idempotencyDegraded'/);
    expect(migration).toMatch(/WHERE meta \? 'overrideSat' OR meta \? 'overrideGate'/);
  });

  it('reads audit_log and never object_actions, so one act is not counted twice', async () => {
    const { pool, sql } = fakePool({ frame: frame() });
    await loadControlRegister(pool, { now: NOW });
    expect(sql.some((s) => /audit_log/.test(s))).toBe(true);
    expect(sql.some((s) => /object_actions/.test(s))).toBe(false);
  });

  it('carries an environment label and a contract id on the frame', async () => {
    const { pool } = fakePool({ frame: frame() });
    const reg = await loadControlRegister(pool, { now: NOW });
    expect(reg.contract).toBe(CONTROL_REGISTER_CONTRACT);
    expect(reg.frame.environment.length).toBeGreaterThan(0);
    expect(reg.frame.source).toBe('audit_log.meta');
    expect(reg.frame.observedAt).toBe('2026-08-06T12:00:00.000Z');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  8. THE CONTRACT CROSSES THE BOUNDARY ONCE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the web mirror of the contract has not drifted', () => {
  /**
   * `packages/shared` is off-limits to this lane, so the contract cannot live where
   * both sides import it — which is the arrangement `lib/api/gps.ts:60` records the
   * post-mortem of: a hand-written copy in `lib/api/` claimed three fields the API
   * had never returned, `tsc` believed the copy because a copy is syntactically
   * perfect, and the page's own test agreed because it mocked the module.
   *
   * ── THE FIRST VERSION OF THIS RATCHET DID NOT GUARD THAT, AND IS RECORDED HERE
   *    RATHER THAN QUIETLY REPLACED ─────────────────────────────────────────────
   * It grepped `\bfieldName\b` over the ENTIRE web file and asserted only the
   * API→web direction. Both holes were demonstrated by a reviewer:
   *
   *  · WRONG DIRECTION. `gps.ts:60`'s failure is a WEB MIRROR CLAIMING FIELDS THE API
   *    NEVER RETURNED. Adding `passRatePct`, `clientCount` and `openValueCents` to the
   *    web `ControlRegisterCounts` — two of gps.ts's three actual phantom fields, plus
   *    a `passRate` spelling this suite forbids on the API side — PASSED.
   *  · DEFEATED BY PROSE. Adding `readonly review`, `readonly complete` and
   *    `readonly counts` to the API contract and leaving the mirror untouched PASSED,
   *    because all three words appear in governance.ts's 30-line comment banner.
   *
   * So: comments are stripped from both files, only 2-space-indented field
   * DECLARATIONS are extracted, and the two name SETS must be EQUAL.
   */

  /**
   * `Interface.field` pairs — declarations only, comments stripped.
   *
   * PAIRS AND NOT BARE NAMES, because a bare-name set has one more hole: a phantom
   * field lands undetected as long as its name appears on SOME other interface. Adding
   * `readonly complete: boolean` to `ControlRegisterCounts` was invisible to the
   * name-set version, since `complete` is a legitimate field of
   * `ControlRegisterCoverage`. `gps.ts:60`'s `counts` phantom is exactly that shape —
   * a plausible name that exists elsewhere in the payload.
   */
  function declaredFields(source: string, requireReadonly: boolean): Set<string> {
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '\n')   // block comments, including the JSDoc banners
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments, without eating `https://`
    const re = requireReadonly
      ? /^ {2}readonly ([A-Za-z][A-Za-z0-9]*)\??:/gm
      : /^ {2}([A-Za-z][A-Za-z0-9]*)\??:/gm;
    const out = new Set<string>();
    for (const iface of stripped.matchAll(/export interface ([A-Za-z][A-Za-z0-9]*)\s*\{([\s\S]*?)\n\}/g)) {
      for (const f of iface[2].matchAll(re)) out.add(`${iface[1]}.${f[1]}`);
    }
    return out;
  }

  const apiSource = () => readFileSync(resolve(HERE, '../controlRegister.ts'), 'utf8');
  const webSource = () => readFileSync(resolve(HERE, '../../../../web/src/lib/api/governance.ts'), 'utf8');

  /**
   * The API's response contract: from the marker-epoch interface (`MarkerEpoch` is part
   * of the payload, on `unverifiable.epochs`) down to `Internals`. The slice STOPS at
   * `Internals` because `ControlRegisterOptions` below it is server-side INPUT and is
   * deliberately not mirrored.
   */
  const apiContract = (src: string) =>
    src.slice(src.indexOf('/* ── The marker epochs'), src.indexOf('/* ── Internals'));

  /**
   * The web mirror's declarations stop at `fetchControlRegister`, whose inline `params`
   * object is a REQUEST shape (`windowDays`, `limit`, `signal`) and not part of the
   * response contract.
   */
  const webContract = (src: string) => src.slice(0, src.indexOf('export async function fetchControlRegister'));

  it('declares every API response field in apps/web/src/lib/api/governance.ts', () => {
    const api = declaredFields(apiContract(apiSource()), true);
    const web = declaredFields(webContract(webSource()), false);
    expect(api.size).toBeGreaterThan(20);
    const missing = [...api].filter((f) => !web.has(f));
    expect(missing, `the web mirror is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares NO field the API does not return — the direction gps.ts:60 actually failed in', () => {
    const api = declaredFields(apiContract(apiSource()), true);
    const web = declaredFields(webContract(webSource()), false);
    expect(web.size).toBeGreaterThan(20);
    const phantom = [...web].filter((f) => !api.has(f));
    expect(phantom, `the web mirror claims fields the API never returns: ${phantom.join(', ')}`).toEqual([]);
  });

  it('names the same interfaces on both sides', () => {
    const iface = (src: string) =>
      new Set([...declaredFields(src, /readonly/.test(src)) ].map((p) => p.split('.')[0]));
    const api = iface(apiContract(apiSource()));
    const web = iface(webContract(webSource()));
    expect([...api].sort()).toEqual([...web].sort());
  });

  it('is not satisfiable by comment prose, nor by a name borrowed from another interface', () => {
    // The three holes, asserted as properties of the extractor rather than as a story.
    const commented = [
      '/**',
      ' * A banner mentioning passRatePct and clientCount and openValueCents.',
      ' */',
      'export interface X {',
      '  readonly realField: string; // trailing note about phantomField',
      '}',
      'export interface Y {',
      '  readonly borrowed: string;',
      '}',
    ].join('\n');
    const found = declaredFields(commented, true);
    expect([...found].sort()).toEqual(['X.realField', 'Y.borrowed']);
    // Comment prose is invisible to it, in both directions.
    expect(found.has('X.passRatePct')).toBe(false);
    expect(found.has('X.phantomField')).toBe(false);
    // And a name that is legitimate on Y does NOT license itself on X.
    expect(found.has('X.borrowed')).toBe(false);
    // The un-anchored grep the first version used WOULD have been satisfied by all three.
    for (const word of ['passRatePct', 'phantomField', 'borrowed']) {
      expect(new RegExp(`\\b${word}\\b`).test(commented)).toBe(true);
    }
  });
});
