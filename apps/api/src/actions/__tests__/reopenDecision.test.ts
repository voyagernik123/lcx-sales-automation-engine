/**
 * `command_reopen_decision` — the inverse of the only governed write that mints
 * institutional memory (TERMINAL Phase 7, T1 #28).
 *
 * Three properties are worth a test here, and they are all properties the action
 * did NOT have before this change:
 *
 *  1. A reopen cannot be done with an empty justification. `z.string().min(1)`
 *     accepted `" "`, so the API would happily record a blank reason — and a blank
 *     reason in `audit_log.meta` is indistinguishable from no reason at all. The UI
 *     trims; the UI is not the authority.
 *
 *  2. A successful reopen RETRACTS the mirror. `command_decide` inserts a row into
 *     `decisions` (the Phase-4 decision log, which /decisions presents un-outcomed
 *     rows from as live calls). Reopening cleared `command_decisions` and left that
 *     row asserting a choice that no longer existed.
 *
 *  3. A REFUSED reopen retracts nothing. The retraction runs after the guarded
 *     UPDATE, so a reopen of an already-open decision must not annotate the log for
 *     something that did not happen.
 *
 * The fake pool proves control flow, gating and bind values. It CANNOT prove the SQL
 * parses, that `btrim`/`left` do what the comment claims, or that the
 * `NOT LIKE '%[REOPENED%'` re-annotation guard holds — a model pool answers whatever
 * it is told to. So the block at the bottom runs the executor's real statements
 * against real Postgres, and SKIPS (never silently passes) when DATABASE_URL is
 * unset. It calls `execute` directly rather than `invokeAction`, on purpose: routing
 * through invokeAction would make the result depend on whichever entitlement rows
 * this particular database happens to hold for `nik`, and a test whose verdict moves
 * with the environment is the failure mode this programme keeps paying for. Gates are
 * proved above against a fixture; SQL is proved below against a database.
 */

import type pg from 'pg';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { ACTION_REGISTRY, invokeAction, ActionError } from '../registry.js';
import { closeDb, getDb, getPool } from '../../db/index.js';
import { describeDb } from '../../test/db.js';

interface Call { sql: string; params: unknown[] }

/** @param decided does the guarded `UPDATE command_decisions … status='decided'` match a row? */
function fakePool(opts: { decided: boolean }) {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      // No entitlement rows: a roster approver falls back to legacyEntitlements,
      // i.e. 'approve' on every workspace. That is the loader's documented
      // no-lockout covenant, not a shortcut taken by this test.
      if (/FROM entitlements/.test(sql)) return { rows: [], rowCount: 0 };
      if (/UPDATE command_decisions/.test(sql)) return { rows: [], rowCount: opts.decided ? 1 : 0 };
      return { rows: [], rowCount: 1 };
    },
  };
  return {
    pool: pool as unknown as pg.Pool,
    calls,
    retractions: () => calls.filter((c) => /UPDATE decisions/.test(c.sql)),
    audits: () => calls.filter((c) => /INSERT INTO audit_log/.test(c.sql)),
  };
}

const AS_APPROVER = { subjectType: 'command_decision', subjectId: 'dec_01', actor: 'nik', role: 'approver' as const };

describe('command_reopen_decision demands a real justification', () => {
  it('refuses a blank reason — a space is not a recorded reason', async () => {
    const p = fakePool({ decided: true });
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', { ...AS_APPROVER, params: { reason: '   ' } }),
    ).rejects.toThrow(/reason cannot be blank/);
    // And nothing happened: the refusal is before execute.
    expect(p.calls.filter((c) => /UPDATE command_decisions/.test(c.sql))).toHaveLength(0);
  });

  it('refuses a missing reason', async () => {
    const p = fakePool({ decided: true });
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', { ...AS_APPROVER, params: {} }),
    ).rejects.toBeInstanceOf(ActionError);
  });

  it('accepts a reason that says something', async () => {
    const p = fakePool({ decided: true });
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', { ...AS_APPROVER, params: { reason: 'evidence was wrong' } }),
    ).resolves.toEqual({ reopened: true });
  });
});

describe('a reopen retracts the decision-log mirror it invalidates', () => {
  it('annotates the mirrored `decisions` row with who reopened it and why', async () => {
    const p = fakePool({ decided: true });
    await invokeAction(p.pool, 'command_reopen_decision', {
      ...AS_APPROVER, params: { reason: 'the OES survey came back contradicting it' },
    });
    const retractions = p.retractions();
    expect(retractions, 'the mirror must be retracted, or the decision log keeps a call nobody made').toHaveLength(1);
    const note = String(retractions[0]!.params[0]);
    expect(note).toContain('[REOPENED by nik]');
    expect(note).toContain('the OES survey came back contradicting it');
    // Scoped to THIS decision's command-sourced mirror, not the whole table.
    expect(retractions[0]!.params[1]).toBe('dec_01');
    expect(retractions[0]!.sql).toMatch(/subject_type='command_decision'/);
    expect(retractions[0]!.sql).toMatch(/source='command'/);
  });

  it('writes the reason into the audit spine as well as the log note', async () => {
    const p = fakePool({ decided: true });
    await invokeAction(p.pool, 'command_reopen_decision', { ...AS_APPROVER, params: { reason: 'decided pre-gate' } });
    const audit = p.audits();
    expect(audit).toHaveLength(1);
    expect(String(audit[0]!.params[4])).toContain('decided pre-gate');
  });

  it('retracts NOTHING when the reopen is refused', async () => {
    const p = fakePool({ decided: false }); // already open
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', { ...AS_APPROVER, params: { reason: 'mistake' } }),
    ).rejects.toThrow(/not found or not decided/i);
    expect(p.retractions(), 'annotating the log for a reopen that did not happen is a lie in the record').toHaveLength(0);
    expect(p.audits(), 'a refused action must not reach the audit spine').toHaveLength(0);
  });

  it('survives a decision-log that is not there — the reopen still lands', async () => {
    // Deliberately best-effort, exactly like the mirror INSERT in `command_decide`:
    // a lagging `decisions` table must not block the governance action.
    const calls: Call[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/FROM entitlements/.test(sql)) return { rows: [], rowCount: 0 };
        if (/UPDATE decisions/.test(sql)) {
          const err = new Error('relation "decisions" does not exist') as Error & { code: string };
          err.code = '42P01';
          throw err;
        }
        return { rows: [], rowCount: 1 };
      },
    } as unknown as pg.Pool;
    await expect(
      invokeAction(pool, 'command_reopen_decision', { ...AS_APPROVER, params: { reason: 'log is behind' } }),
    ).resolves.toEqual({ reopened: true });
    expect(calls.filter((c) => /INSERT INTO audit_log/.test(c.sql))).toHaveLength(1);
  });
});

describe('authority is still the server’s to decide', () => {
  it('an operator cannot reopen, whatever the client offered', async () => {
    const p = fakePool({ decided: true });
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', {
        ...AS_APPROVER, role: 'operator', params: { reason: 'I think it was wrong' },
      }),
    ).rejects.toThrow(/requires approver/);
    expect(p.calls.filter((c) => /UPDATE command_decisions/.test(c.sql))).toHaveLength(0);
  });

  it('does not apply to a subject type that is not a program decision', async () => {
    const p = fakePool({ decided: true });
    await expect(
      invokeAction(p.pool, 'command_reopen_decision', {
        ...AS_APPROVER, subjectType: 'deal', params: { reason: 'wrong object' },
      }),
    ).rejects.toThrow(/does not apply to deal/);
  });
});

/* ── the SQL itself, against a real Postgres ──────────────────────────────── */

describeDb('the reopen statements run against Postgres', () => {
  const action = ACTION_REGISTRY.command_reopen_decision!;
  const decisionId = `dec_reopen_test_${Date.now()}`;
  const run = (reason: string, actor = 'nik') =>
    action.execute({
      pool: getPool(), subjectType: 'command_decision', subjectId: decisionId,
      params: { reason }, actor, role: 'approver', markGateDegraded: () => {},
    });

  beforeAll(async () => {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO command_decisions (id, phase, decision, status, chosen, decided_by, decided_at)
      VALUES (${decisionId}, 'P1', 'reopen-test decision', 'decided', 'Option A', 'nik', now())`);
    await db.execute(sql`
      INSERT INTO decisions (title, context, decision, rationale, owner, subject_type, subject_id, source)
      VALUES ('US launch: reopen-test decision', 'ctx', 'Option A', 'the original rationale',
              'nik', 'command_decision', ${decisionId}, 'command')`);
  });

  afterAll(async () => {
    const db = getDb();
    await db.execute(sql`DELETE FROM decisions WHERE subject_id = ${decisionId}`);
    await db.execute(sql`DELETE FROM command_decisions WHERE id = ${decisionId}`);
    await closeDb();
  });

  it('un-decides the row and annotates the mirror, keeping the original rationale', async () => {
    await expect(run('the OES survey contradicted it')).resolves.toEqual({ reopened: true });

    const decision = await getDb().execute(sql`
      SELECT status, chosen, decided_by, decided_at FROM command_decisions WHERE id = ${decisionId}`);
    const row = (decision as unknown as { rows: Array<Record<string, unknown>> }).rows[0]!;
    expect(row.status).toBe('open');
    expect(row.chosen).toBeNull();
    expect(row.decided_by).toBeNull();
    expect(row.decided_at).toBeNull();

    const mirror = await getDb().execute(sql`
      SELECT rationale FROM decisions WHERE subject_id = ${decisionId}`);
    const rationale = String((mirror as unknown as { rows: Array<{ rationale: string }> }).rows[0]!.rationale);
    // WHAT THIS PROVES: the statement parses against real Postgres, and the
    // `rationale || $1` concatenation keeps the original text — replace it with a
    // bare `$1` and the first assertion below goes red.
    //
    // WHAT IT DOES NOT PROVE, measured rather than assumed: `btrim` and `left` are
    // along for the ride. The appended newlines are INTERIOR to the concatenation,
    // so btrim has nothing to trim, and the result here is ~155 characters against a
    // 4000 cap. Rewriting the SET clause as a bare `rationale || $1` — dropping both
    // functions — leaves all 12 tests in this file green. So neither is covered.
    // That is tolerable and deliberately recorded rather than papered over: the cap
    // mirrors `command_decide`'s `.slice(0, 4000)` for symmetry, and `decisions.rationale`
    // is unbounded `text`, so an over-long value would not error either way. btrim
    // only ever matters when the prior rationale is empty or blank.
    expect(rationale.startsWith('the original rationale')).toBe(true);
    expect(rationale).toContain('[REOPENED by nik]');
    expect(rationale).toContain('the OES survey contradicted it');
  });

  it('refuses a second reopen of an already-open decision', async () => {
    await expect(run('again')).rejects.toBeInstanceOf(ActionError);
  });

  it('does not stack a second annotation onto a mirror it already retracted', async () => {
    // Re-decide by hand, then reopen again: the NOT LIKE guard must leave the
    // already-annotated row alone rather than appending a second paragraph every
    // time the decision cycles.
    await getDb().execute(sql`
      UPDATE command_decisions SET status='decided', chosen='Option B', decided_by='nik', decided_at=now()
       WHERE id = ${decisionId}`);
    await expect(run('second thoughts')).resolves.toEqual({ reopened: true });

    const mirror = await getDb().execute(sql`
      SELECT rationale FROM decisions WHERE subject_id = ${decisionId}`);
    const rationale = String((mirror as unknown as { rows: Array<{ rationale: string }> }).rows[0]!.rationale);
    expect(rationale.match(/\[REOPENED/g) ?? []).toHaveLength(1);
    expect(rationale).not.toContain('second thoughts');
  });
});
