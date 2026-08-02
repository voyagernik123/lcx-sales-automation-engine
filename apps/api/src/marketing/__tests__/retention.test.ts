import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { _resetRecordMigrated } from '../record.js';
import {
  CLOCK_STALE_AFTER_DAYS,
  JEOPARDY_GRACE_DAYS,
  MINIMISED_BODY_MARKER,
  QUEUE_MIGRATION_REQUIRED,
  RECORD_MIGRATION_REQUIRED,
  RETENTION_ERASURE_RECONCILIATION,
  RETENTION_MIGRATION,
  RETENTION_REFUSAL_CODES,
  _resetRetentionMigrated,
  readJeopardy,
  retentionPosture,
  runRetentionClock,
} from '../retention.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE FIVE-YEAR CLOCK. Every assertion here fails if the behaviour is removed.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT THIS FILE IS REALLY PROTECTING. Before `retention.ts` existed, migration
 *  0046's 90-day sweep ran on the mail tick and nothing had ever written an LCX
 *  statement to the five-year register — so on day 91 the compartment destroyed the
 *  third-party row and retained nothing at all. The tests below are grouped around
 *  the four ways that failure can come back:
 *
 *   1. a sweep that deletes when it cannot see which rows carry a record (§2, §4);
 *   2. a count of 0 standing in for "we could not look" (§5);
 *   3. a run nobody can evidence (§3, §6);
 *   4. a hold that quietly becomes indefinite retention (§4).
 *
 *  THE STUB POOL BEHAVES LIKE POSTGRES ON THE POINTS THAT MATTER: `to_regclass`
 *  answers per table so a migration can be present or absent independently, DELETE
 *  and UPDATE report a rowCount, and every statement is recorded so a test can assert
 *  that a destructive statement was NOT issued. Asserting the absence of a DELETE is
 *  the only way to test a refusal that protects data.
 */

type Call = { sql: string; params: unknown[] };

interface Fixture {
  calls: Call[];
  present: Record<string, boolean>;
  jeopardyRows: Array<{
    id: number; x_comment_id: string | null; status: string;
    retention_expires_at: string; approved_drafts: number;
  }>;
  heldBodies: Array<{ id: number; body: string }>;
  runLedger: Array<{ n: number; last_at: string | null; ran_by: string | null }>;
  queueDueCount: number | null;
  recordDueCount: number | null;
  ledgerInsertThrows: boolean;
  deleteRowCount: number;
  updateRowCount: number;
  recordDeleteRowCount: number;
}

function fixture(over: Partial<Fixture> = {}): { pool: Pool; f: Fixture } {
  const f: Fixture = {
    calls: [],
    present: {
      'public.marketing_retention_run': true,
      'public.marketing_x_reply': true,
      'public.marketing_record': true,
    },
    jeopardyRows: [],
    heldBodies: [],
    runLedger: [{ n: 3, last_at: '2026-08-01T00:00:00.000Z', ran_by: 'nik' }],
    queueDueCount: 5,
    recordDueCount: 0,
    ledgerInsertThrows: false,
    deleteRowCount: 7,
    updateRowCount: 0,
    recordDeleteRowCount: 2,
    ...over,
  };

  const query = async (sql: string, params: unknown[] = []) => {
    f.calls.push({ sql, params });

    const reg = /to_regclass\('([^']+)'\)/.exec(sql);
    if (reg) return { rows: [{ ok: f.present[reg[1]!] === true }], rowCount: 1 };

    if (/FROM marketing_x_reply r/.test(sql)) {
      return { rows: f.jeopardyRows, rowCount: f.jeopardyRows.length };
    }
    if (/SELECT id, body FROM marketing_x_reply/.test(sql)) {
      return { rows: f.heldBodies, rowCount: f.heldBodies.length };
    }
    if (/UPDATE marketing_x_reply/.test(sql)) {
      return { rows: [], rowCount: f.updateRowCount };
    }
    if (/DELETE FROM marketing_x_reply/.test(sql)) {
      return { rows: [], rowCount: f.deleteRowCount };
    }
    if (/DELETE FROM marketing_record/.test(sql)) {
      return { rows: [], rowCount: f.recordDeleteRowCount };
    }
    if (/count\(\*\)::int AS n FROM marketing_x_reply/.test(sql)) {
      if (f.queueDueCount === null) throw new Error('relation is unreadable');
      return { rows: [{ n: f.queueDueCount }], rowCount: 1 };
    }
    if (/count\(\*\)::int AS n\s+FROM marketing_record/.test(sql)) {
      if (f.recordDueCount === null) throw new Error('relation is unreadable');
      return { rows: [{ n: f.recordDueCount }], rowCount: 1 };
    }
    if (/FROM marketing_retention_run/.test(sql) && /max\(ran_at\)/.test(sql)) {
      const row = f.runLedger[0]!;
      return { rows: [{ n: row.n, last_at: row.last_at }], rowCount: 1 };
    }
    if (/SELECT ran_by FROM marketing_retention_run/.test(sql)) {
      return { rows: [{ ran_by: f.runLedger[0]!.ran_by }], rowCount: 1 };
    }
    if (/INSERT INTO marketing_retention_run/.test(sql)) {
      if (f.ledgerInsertThrows) throw new Error('permission denied for table marketing_retention_run');
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  return { pool: { query } as unknown as Pool, f };
}

const NOW = new Date('2026-08-03T12:00:00.000Z');
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

const destructive = (calls: Call[]) =>
  calls.filter((c) => /^\s*(DELETE|UPDATE|TRUNCATE)/i.test(c.sql.trim()));

beforeEach(() => {
  _resetRetentionMigrated();
  _resetRecordMigrated();
  delete process.env.MARKETING_RETENTION_DAYS;
});

/* ── §1 the refusal vocabulary ─────────────────────────────────────────────── */

describe('the refusal vocabulary', () => {
  it('gives every code a rule and a rule text, so no refusal cites nothing', () => {
    expect(RETENTION_REFUSAL_CODES.length).toBeGreaterThan(0);
    // Non-vacuity: a codes list built from an empty table would pass the loop below.
    expect(RETENTION_REFUSAL_CODES).toContain('RETENTION_STATEMENTS_IN_JEOPARDY');
  });

  it('states the erasure/MiCA reconciliation in the code, not only in a comment', () => {
    // The tension between Art 17(1) and the inferred Art 68(9) retention is the whole
    // difficulty of this compartment, and the operator answering the request is the
    // one who needs the paragraph. If it stops being returned, this fails.
    expect(RETENTION_ERASURE_RECONCILIATION).toContain('Art 17(3)(b)');
    expect(RETENTION_ERASURE_RECONCILIATION).toContain('sha256');
    expect(RETENTION_ERASURE_RECONCILIATION).toMatch(/minimis/i);
  });
});

/* ── §2 jeopardy: the read that must not answer "none" ─────────────────────── */

describe('readJeopardy refuses rather than reporting nothing at risk', () => {
  it('refuses when the record register is absent — every statement is at risk, not none', async () => {
    const { pool } = fixture({
      present: {
        'public.marketing_retention_run': true,
        'public.marketing_x_reply': true,
        'public.marketing_record': false,
      },
    });
    const res = await readJeopardy(pool, { now: NOW });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('RETENTION_RECORD_REGISTER_ABSENT');
    expect(res.sentence).toContain('Every approved statement');
    expect(res.remedy).toContain(RECORD_MIGRATION_REQUIRED);
  });

  it('refuses when the inbound queue is absent', async () => {
    const { pool } = fixture({
      present: {
        'public.marketing_retention_run': true,
        'public.marketing_x_reply': false,
        'public.marketing_record': true,
      },
    });
    const res = await readJeopardy(pool, { now: NOW });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('RETENTION_QUEUE_ABSENT');
    expect(res.remedy).toContain(QUEUE_MIGRATION_REQUIRED);
  });

  it('finds only approved drafts with no record, and counts days as a floor', async () => {
    const { pool, f } = fixture({
      jeopardyRows: [
        {
          id: 41, x_comment_id: 'c-41', status: 'answered',
          // 36 hours away: a floor of 1 day, not a rounded 2.
          retention_expires_at: new Date(NOW.getTime() + 36 * 3_600_000).toISOString(),
          approved_drafts: 1,
        },
      ],
    });
    const res = await readJeopardy(pool, { now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([{
      replyId: 41,
      xCommentId: 'c-41',
      status: 'answered',
      retentionExpiresAt: new Date(NOW.getTime() + 36 * 3_600_000).toISOString(),
      daysUntilExpiry: 1,
      approvedDrafts: 1,
    }]);

    // The predicate is the finding, so it is pinned: an approved draft AND no record
    // carrying the same comment id. Dropping either half turns this read into either
    // "every expiring row" or "every row with a draft".
    const sql = f.calls.find((c) => /FROM marketing_x_reply r/.test(c.sql))!.sql;
    expect(sql).toMatch(/d\.status = 'approved'/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/FROM marketing_record m/);
    expect(sql).toMatch(/m\.x_comment_id = r\.x_comment_id/);
  });
});

/* ── §3 the run refuses before it deletes ──────────────────────────────────── */

describe('the clock refuses before it deletes anything', () => {
  it('will not run unattributed, and probes nothing first', async () => {
    const { pool, f } = fixture();
    const res = await runRetentionClock(pool, { ranBy: '   ', now: NOW });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('RETENTION_ACTOR_UNNAMED');
    // Validation before the probe: a blank actor is blank on every environment.
    expect(f.calls).toHaveLength(0);
  });

  it('refuses when the run ledger is absent AND ISSUES NO DELETE', async () => {
    const { pool, f } = fixture({
      present: {
        'public.marketing_retention_run': false,
        'public.marketing_x_reply': true,
        'public.marketing_record': true,
      },
    });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('RETENTION_LEDGER_ABSENT');
    expect(res.sentence).toContain(RETENTION_MIGRATION);
    // THE ASSERTION THAT MATTERS. An unevidenced deletion is indistinguishable from
    // data loss, so the gate must stop the sweep and not merely annotate it.
    expect(destructive(f.calls)).toHaveLength(0);
  });

  it('refuses when the record register is absent and DELETES NOTHING — it will not sweep blind', async () => {
    const { pool, f } = fixture({
      present: {
        'public.marketing_retention_run': true,
        'public.marketing_x_reply': true,
        'public.marketing_record': false,
      },
    });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('RETENTION_RECORD_REGISTER_ABSENT');
    // Without the record register the clock cannot tell which rows carry an unrecorded
    // LCX statement. Deleting anyway is exactly how the MiCA record was lost before.
    expect(destructive(f.calls)).toHaveLength(0);
  });
});

/* ── §4 the split, enforced ────────────────────────────────────────────────── */

describe('a dry run touches nothing and is still recorded', () => {
  it('issues no destructive statement and writes a ledger row with null counts', async () => {
    const { pool, f } = fixture();
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'dry_run', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(destructive(f.calls)).toHaveLength(0);
    expect(res.value.thirdPartyRowsDeleted).toBeNull();
    expect(res.value.thirdPartyRowsMinimised).toBeNull();
    expect(res.value.recordRowsExpired).toBeNull();
    expect(res.value.recorded).toBe(true);

    // A dry run still writes a row: knowing somebody looked, and when, is evidence.
    const insert = f.calls.find((c) => /INSERT INTO marketing_retention_run/.test(c.sql))!;
    expect(insert.params[2]).toBe('dry_run');
    expect(insert.params[3]).toBeNull();
    expect(insert.params[4]).toBeNull();
  });
});

describe('enforce: LCX statements survive, the stranger\'s words do not', () => {
  const held = {
    id: 41, x_comment_id: 'c-41', status: 'answered',
    retention_expires_at: iso(-1), approved_drafts: 1,
  };

  it('minimises the held row to a hash instead of deleting it', async () => {
    const body = 'is LCX actually regulated or is that marketing?';
    const { pool, f } = fixture({
      jeopardyRows: [held],
      heldBodies: [{ id: 41, body }],
      updateRowCount: 1,
    });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.thirdPartyRowsMinimised).toBe(1);

    const update = f.calls.find((c) => /UPDATE marketing_x_reply/.test(c.sql))!;
    // The marker replaces the body: the stranger's words go on schedule.
    expect(update.params[1]).toBe(MINIMISED_BODY_MARKER);
    expect(String(update.params[1])).not.toContain('regulated');
    // The hash is of the ORIGINAL body, so a later paste-back can be proved identical.
    expect(update.params[4]).toEqual([createHash('sha256').update(body, 'utf8').digest('hex')]);
    // And it is computed in Node, not by pgcrypto, which may not be enabled.
    expect(update.sql).not.toMatch(/digest\(/);
    // A stated reason, or the hold is indefinite retention with a compliance label.
    expect(String(update.params[3])).toContain('marketing_record');
  });

  it('excludes the held ids from the delete, by id and not by predicate', async () => {
    const { pool, f } = fixture({
      jeopardyRows: [held],
      heldBodies: [{ id: 41, body: 'x' }],
      updateRowCount: 1,
    });
    await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    const del = f.calls.find((c) => /DELETE FROM marketing_x_reply/.test(c.sql))!;
    expect(del.sql).toMatch(/NOT \(id = ANY\(\$2::bigint\[\]\)\)/);
    expect(del.params[1]).toEqual([41]);
  });

  it('sweeps expired records but never one under legal hold', async () => {
    const { pool, f } = fixture();
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.recordRowsExpired).toBe(2);
    const del = f.calls.find((c) => /DELETE FROM marketing_record/.test(c.sql))!;
    // THE RATCHET. Art 68(9)'s seven-year extension exists so records do not expire
    // mid-investigation. Both halves of the guard are pinned.
    expect(del.sql).toMatch(/legal_hold = false/);
    expect(del.sql).toMatch(/legal_hold_until IS NULL OR legal_hold_until < \$1/);
  });

  it('reports jeopardy as a refusal, and escalates past the grace period', async () => {
    const { pool } = fixture({
      jeopardyRows: [
        { ...held, retention_expires_at: iso(-(JEOPARDY_GRACE_DAYS + 5)) },
      ],
      heldBodies: [{ id: 41, body: 'x' }],
      updateRowCount: 1,
    });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const codes = res.value.refusals.map((r) => r.code);
    expect(codes).toContain('RETENTION_STATEMENTS_IN_JEOPARDY');
    // A compliance hold with no end date is what storage limitation forbids, so the
    // hold escalates rather than persisting quietly.
    expect(codes).toContain('RETENTION_JEOPARDY_PAST_GRACE');
  });

  it('does not escalate a hold that is still inside the grace period', async () => {
    const { pool } = fixture({
      jeopardyRows: [{ ...held, retention_expires_at: iso(-1) }],
      heldBodies: [{ id: 41, body: 'x' }],
      updateRowCount: 1,
    });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.refusals.map((r) => r.code)).not.toContain('RETENTION_JEOPARDY_PAST_GRACE');
  });
});

/* ── §5 the posture never reports a comfortable zero ───────────────────────── */

describe('the posture reports null where it could not look', () => {
  it('answers 200-shaped on an environment with nothing applied, and refuses inside', async () => {
    const { pool } = fixture({
      present: {
        'public.marketing_retention_run': false,
        'public.marketing_x_reply': false,
        'public.marketing_record': false,
      },
    });
    const p = await retentionPosture(pool, { now: NOW });
    // dueForSweep must be null, NOT 0: "nothing is overdue" is a claim, and this
    // environment cannot make it.
    expect(p.shortClock.dueForSweep).toBeNull();
    expect(p.longClock.dueForSweep).toBeNull();
    expect(p.shortClock.registerPresent).toBe(false);
    expect(p.longClock.registerPresent).toBe(false);
    expect(p.jeopardy).toBeNull();
    expect(p.runsRecorded).toBeNull();
    const codes = p.refusals.map((r) => r.code);
    expect(codes).toContain('RETENTION_LEDGER_ABSENT');
    // The record-register refusal rides on the clock it is about, so a surface renders
    // it beside the number it explains rather than in a general banner. The top-level
    // list carries the jeopardy read's own refusal, which on this environment is the
    // absent queue — the first thing that makes the question unanswerable.
    expect(p.longClock.refusals.map((r) => r.code)).toContain('RETENTION_RECORD_REGISTER_ABSENT');
    expect(codes).toContain('RETENTION_QUEUE_ABSENT');
  });

  it('reports null rather than 0 when a count throws', async () => {
    const { pool } = fixture({ queueDueCount: null });
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.shortClock.dueForSweep).toBeNull();
    expect(p.shortClock.refusals.map((r) => r.code)).toContain('RETENTION_QUEUE_ABSENT');
  });

  it('says the clock has NEVER run when the ledger is empty', async () => {
    const { pool } = fixture({ runLedger: [{ n: 0, last_at: null, ran_by: null }] });
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.lastRunAt).toBeNull();
    expect(p.runsRecorded).toBe(0);
    expect(p.refusals.map((r) => r.code)).toContain('RETENTION_CLOCK_NEVER_RAN');
  });

  it('calls a run stale once it is older than the interval it claims to keep', async () => {
    const { pool } = fixture({
      runLedger: [{
        n: 1,
        last_at: iso(-(CLOCK_STALE_AFTER_DAYS + 1)),
        ran_by: 'cron',
      }],
    });
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.lastRunBy).toBe('cron');
    expect(p.refusals.map((r) => r.code)).toContain('RETENTION_CLOCK_STALE');
  });

  it('does not call a fresh run stale', async () => {
    const { pool } = fixture({ runLedger: [{ n: 1, last_at: iso(-1), ran_by: 'cron' }] });
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.refusals.map((r) => r.code)).not.toContain('RETENTION_CLOCK_STALE');
  });

  it('only counts ENFORCING runs as evidence that retention ran', async () => {
    const { pool, f } = fixture();
    await retentionPosture(pool, { now: NOW });
    const read = f.calls.find((c) => /max\(ran_at\)/.test(c.sql))!;
    // A dry run is somebody looking, not a sweep. If this filter goes, a desk that
    // only ever previewed would report itself compliant.
    expect(read.sql).toMatch(/mode = 'enforce'/);
  });

  it('carries the two standing facts on every read', async () => {
    const { pool } = fixture();
    const p = await retentionPosture(pool, { now: NOW });
    const codes = p.refusals.map((r) => r.code);
    // A second, jeopardy-blind sweep still runs on the mail tick: the protection here
    // is partial, and nothing may read as though it were complete.
    expect(codes).toContain('RETENTION_COMPETING_SWEEP');
    // The split is a stated default, not a DPO ruling.
    expect(codes).toContain('RETENTION_DPO_RULING_PENDING');
    expect(p.dpoRulingOutstanding).toMatch(/OUTSTANDING DPO RULING/);
    expect(p.inferenceCaveat).toMatch(/INFERENCE, NOT CITATION/);
  });

  it('refuses a period that is not a usable number of days', async () => {
    process.env.MARKETING_RETENTION_DAYS = 'ninety';
    const { pool } = fixture();
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.shortClock.periodDays).toBeNull();
    expect(p.shortClock.refusals.map((r) => r.code)).toContain('RETENTION_PERIOD_UNDEFINED');
  });

  it('reports the long clock in years and the short clock in days', async () => {
    const { pool } = fixture();
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.shortClock.periodDays).toBe(90);
    expect(p.shortClock.periodYears).toBeNull();
    expect(p.longClock.periodYears).toBe(5);
    expect(p.longClock.cls).toBe('lcx_statement');
    expect(p.longClock.register).toBe('marketing_record');
  });

  it('raises jeopardy on the posture, not only inside a run', async () => {
    const { pool } = fixture({
      jeopardyRows: [{
        id: 9, x_comment_id: 'c-9', status: 'answered',
        retention_expires_at: iso(3), approved_drafts: 1,
      }],
    });
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.jeopardy).toHaveLength(1);
    expect(p.refusals.map((r) => r.code)).toContain('RETENTION_STATEMENTS_IN_JEOPARDY');
  });
});

/* ── §6 a run that cannot be evidenced says so ─────────────────────────────── */

describe('a sweep that could not be recorded reports that it was not', () => {
  it('returns RETENTION_RUN_NOT_RECORDED and recorded:false', async () => {
    const { pool } = fixture({ ledgerInsertThrows: true });
    const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.recorded).toBe(false);
    expect(res.value.refusals.map((r) => r.code)).toContain('RETENTION_RUN_NOT_RECORDED');
    // The counts are the only remaining trace, so they must still be reported.
    expect(res.value.thirdPartyRowsDeleted).toBe(7);
  });
});
