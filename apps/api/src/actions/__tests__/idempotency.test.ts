/**
 * Replay protection on the governed invoke path (Phase 3.3).
 *
 * The defect: a transport failure loses the RESPONSE, not the request. With no
 * key, a retry re-executed the action and wrote a second object_actions row and a
 * second audit_log entry — the audit spine made to record one action as two by a
 * flaky network.
 *
 * The discriminating test here uses `track`, whose result depends on state it
 * changes: the first run returns `promoted: true`, a second run on the same
 * already-tracked project would return `promoted: false`. So "the replay returned
 * `promoted: true`" is proof the stored result came back rather than the executor
 * running again — which a fixed-result action like `flag_review` could not
 * distinguish.
 *
 * The fake pool below models `action_idempotency` in memory. It is a model, not
 * Postgres: it proves the control flow, NOT that the SQL is valid or that the
 * ON CONFLICT race is atomic. The DB-backed block at the bottom covers the SQL
 * against real Postgres and SKIPS silently when there is no database, so treat a
 * green run on a machine without one as saying nothing about the SQL.
 */

import type pg from 'pg';
import { describe, it, expect } from 'vitest';
import { invokeAction, ActionError } from '../registry.js';

function pgError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

interface Row { actor: string; result: Record<string, unknown> | null; createdAt: number }

/**
 * @param idemError thrown by every action_idempotency statement, to exercise the
 *   fail-open branch and its opposite.
 */
function fakePool(opts: { idemError?: Error } = {}) {
  const store = new Map<string, Row>();
  const sqls: string[] = [];
  let clock = 1_000_000;
  let tracked = false;

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      sqls.push(sql);

      if (/action_idempotency/.test(sql)) {
        if (opts.idemError) throw opts.idemError;
        const key = params.slice(0, 4).join('|');
        const row = store.get(key);
        if (/INSERT INTO action_idempotency/.test(sql)) {
          if (row) return { rows: [], rowCount: 0 };
          store.set(key, { actor: String(params[4]), result: null, createdAt: clock });
          return { rows: [], rowCount: 1 };
        }
        if (/SELECT result/.test(sql)) {
          return row
            ? { rows: [{ result: row.result, age_ms: String(clock - row.createdAt) }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (/SET result=/.test(sql)) {
          if (row) row.result = JSON.parse(String(params[4])) as Record<string, unknown>;
          return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (/SET actor=/.test(sql)) {           // stale takeover
          if (row && row.result === null) { row.actor = String(params[4]); row.createdAt = clock; return { rows: [], rowCount: 1 }; }
          return { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM action_idempotency/.test(sql)) {
          if (row && row.result === null) { store.delete(key); return { rows: [], rowCount: 1 }; }
          return { rows: [], rowCount: 0 };
        }
      }

      // `track` is a real state change: it promotes only once.
      if (/UPDATE projects SET tier=/.test(sql)) {
        const first = !tracked;
        tracked = true;
        return { rows: [], rowCount: first ? 1 : 0 };
      }
      if (/UPDATE deals SET owner/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };

  return {
    pool: pool as unknown as pg.Pool,
    sqls,
    ledgerWrites: () => sqls.filter((s) => /INSERT INTO object_actions/.test(s)).length,
    auditWrites: () => sqls.filter((s) => /INSERT INTO audit_log/.test(s)).length,
    idemQueries: () => sqls.filter((s) => /action_idempotency/.test(s)).length,
    advance: (ms: number) => { clock += ms; },
    reservations: store,
  };
}

const trackCall = (pool: pg.Pool, idempotencyKey?: string) => invokeAction(pool, 'track', {
  subjectType: 'project', subjectId: 'proj-1', params: {},
  actor: 'operator', role: 'operator', idempotencyKey,
});

describe('a retry under the same Idempotency-Key does not re-execute', () => {
  it('returns the ORIGINAL result and writes exactly one ledger + audit row', async () => {
    const p = fakePool();
    const first = await trackCall(p.pool, 'key-a');
    expect(first).toEqual({ tier: 'tracked', promoted: true });
    expect(p.ledgerWrites()).toBe(1);

    const replay = await trackCall(p.pool, 'key-a');
    // Re-executing would answer promoted:false, because the project is already
    // tracked. promoted:true is only possible from the stored result.
    expect(replay).toEqual({ tier: 'tracked', promoted: true });
    expect(p.ledgerWrites(), 'the replay wrote a second ledger row').toBe(1);
    expect(p.auditWrites(), 'the replay wrote a second audit row').toBe(1);
  });

  it('does re-execute under a DIFFERENT key — the key is the intent, not the action', async () => {
    const p = fakePool();
    await trackCall(p.pool, 'key-a');
    const second = await trackCall(p.pool, 'key-b');
    expect(second).toEqual({ tier: 'tracked', promoted: false });
    expect(p.ledgerWrites()).toBe(2);
  });

  it('still double-writes with NO key, which is the unfixed behaviour and why the header matters', async () => {
    // Pinned deliberately. Idempotency is opt-in per request; a caller that sends
    // no key gets exactly what it got before Phase 3.3, and this test is what
    // stops that fact being quietly forgotten.
    const p = fakePool();
    await trackCall(p.pool);
    await trackCall(p.pool);
    expect(p.ledgerWrites()).toBe(2);
    expect(p.idemQueries(), 'no key must mean no dedupe traffic at all').toBe(0);
  });

  it('treats a blank or whitespace-only header as no key rather than an error', async () => {
    const p = fakePool();
    await expect(trackCall(p.pool, '   ')).resolves.toBeTruthy();
    expect(p.idemQueries()).toBe(0);
  });

  it('rejects an over-long key instead of storing it truncated', async () => {
    // Truncating would silently merge two distinct intents into one key.
    const p = fakePool();
    await expect(trackCall(p.pool, 'x'.repeat(201))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(p.ledgerWrites()).toBe(0);
  });
});

describe('a concurrent duplicate is refused, not executed', () => {
  it('answers IDEMPOTENT_IN_FLIGHT 409 while the original is still running', async () => {
    const p = fakePool();
    // Simulate the original having reserved but not finished.
    p.reservations.set(['track', 'project', 'proj-1', 'key-c'].join('|'), { actor: 'operator', result: null, createdAt: 1_000_000 });
    await expect(trackCall(p.pool, 'key-c')).rejects.toMatchObject({ code: 'IDEMPOTENT_IN_FLIGHT' });
    expect(p.ledgerWrites(), 'refused, but it executed anyway').toBe(0);
  });

  it('takes over a reservation abandoned longer than the stale window', async () => {
    // Otherwise a process that died mid-execute would 409 that key forever.
    const p = fakePool();
    p.reservations.set(['track', 'project', 'proj-1', 'key-d'].join('|'), { actor: 'operator', result: null, createdAt: 1_000_000 });
    p.advance(61_000);
    await expect(trackCall(p.pool, 'key-d')).resolves.toEqual({ tier: 'tracked', promoted: true });
    expect(p.ledgerWrites()).toBe(1);
  });
});

describe('a key is only spent by an action that actually happened', () => {
  it('releases the reservation when the executor throws, so the retry can run', async () => {
    const p = fakePool();
    const assign = (owner: string) => invokeAction(p.pool, 'assign', {
      subjectType: 'deal', subjectId: 'deal-1', params: { owner },
      actor: 'operator', role: 'operator', idempotencyKey: 'key-e',
    });
    // 'nobody' is not on the desk roster → the executor refuses.
    await expect(assign('nobody')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(p.reservations.size, 'a failed action left its key spent').toBe(0);
    await expect(assign('operator')).resolves.toMatchObject({ owner: 'operator' });
  });

  it('does not consume the key when PARAM VALIDATION fails', async () => {
    // Reservation happens after validation on purpose: a client that fixes its
    // params and retries under the same key must not be handed the old refusal.
    const p = fakePool();
    const call = (params: Record<string, unknown>) => invokeAction(p.pool, 'assign', {
      subjectType: 'deal', subjectId: 'deal-1', params,
      actor: 'operator', role: 'operator', idempotencyKey: 'key-f',
    });
    await expect(call({})).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(p.idemQueries(), 'a request refused at validation touched the dedupe table').toBe(0);
    await expect(call({ owner: 'operator' })).resolves.toBeTruthy();
  });
});

describe('the dedupe table follows the same 42P01 discipline as the gates', () => {
  it('fails open when the table does not exist, and says so in the ledger', async () => {
    const p = fakePool({ idemError: pgError('42P01', 'relation "action_idempotency" does not exist') });
    const result = await trackCall(p.pool, 'key-g');
    expect(result).toBeTruthy();
    // The write must land — migration 0045 goes in by hand after the deploy.
    expect(p.ledgerWrites()).toBe(1);
  });

  it('records idempotencyDegraded so a duplicate row is not mistaken for a real second action', async () => {
    const p = fakePool({ idemError: pgError('42P01', 'relation "action_idempotency" does not exist') });
    await trackCall(p.pool, 'key-h');
    const insert = p.sqls.findIndex((s) => /INSERT INTO object_actions/.test(s));
    expect(insert).toBeGreaterThanOrEqual(0);
    // Re-run capturing binds, since sqls only holds statements.
    const captured: unknown[][] = [];
    const wrapped = {
      query: async (sql: string, params: unknown[] = []) => {
        captured.push([sql, ...params]);
        if (/action_idempotency/.test(sql)) throw pgError('42P01', 'relation "action_idempotency" does not exist');
        return { rows: [], rowCount: 1 };
      },
    } as unknown as pg.Pool;
    await invokeAction(wrapped, 'track', {
      subjectType: 'project', subjectId: 'proj-1', params: {},
      actor: 'operator', role: 'operator', idempotencyKey: 'key-h',
    });
    const ledger = captured.find((c) => /INSERT INTO object_actions/.test(String(c[0])))!;
    const recorded = JSON.parse(String(ledger[5])) as Record<string, unknown>;
    expect(recorded.idempotencyDegraded).toBe(true);
    expect(String(recorded.idempotencyDegradedReason)).toMatch(/42P01/);
  });

  for (const [code, message] of [
    ['57014', 'canceling statement due to statement timeout'],
    ['42501', 'permission denied for table action_idempotency'],
    ['ECONNRESET', 'read ECONNRESET'],
  ] as Array<[string, string]>) {
    it(`propagates ${code} rather than silently dropping replay protection`, async () => {
      // A broken dedupe table quietly becoming NO dedupe is the same class of bug
      // as the gates: the caller believes it is protected and it is not.
      const p = fakePool({ idemError: pgError(code, message) });
      await expect(trackCall(p.pool, 'key-i')).rejects.toThrow(message);
      expect(p.ledgerWrites()).toBe(0);
    });
  }
});

/* ── The SQL itself, against real Postgres. ──
 * The fake above cannot tell a valid statement from an invalid one. This block
 * runs the exact statements invokeAction issues. It SKIPS when there is no
 * database or 0045 has not been applied — so a green run here proves nothing on
 * its own; check that the assertions actually ran. */
describe('migration 0045 SQL', () => {
  it('claims, replays and releases against real Postgres', async () => {
    const { getPool, closeDb } = await import('../../db/index.js');
    let pool: pg.Pool;
    try {
      pool = getPool();
      await pool.query('SELECT 1 FROM action_idempotency LIMIT 1');
    } catch {
      return; // no DB, or 0045 not applied
    }
    const binds = ['test_action', 'test', 'sql-check', `k-${Date.now()}`];
    try {
      const claim = await pool.query(
        `INSERT INTO action_idempotency (action, subject_type, subject_id, idem_key, actor)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (action, subject_type, subject_id, idem_key) DO NOTHING`,
        [...binds, 'operator'],
      );
      expect(claim.rowCount).toBe(1);

      // The second claim must lose — this is the property the whole design rests on.
      const dup = await pool.query(
        `INSERT INTO action_idempotency (action, subject_type, subject_id, idem_key, actor)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (action, subject_type, subject_id, idem_key) DO NOTHING`,
        [...binds, 'operator'],
      );
      expect(dup.rowCount).toBe(0);

      const { rows } = await pool.query<{ result: unknown; age_ms: string }>(
        `SELECT result, (EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint AS age_ms
           FROM action_idempotency
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`, binds);
      expect(rows[0]!.result).toBeNull();
      expect(Number(rows[0]!.age_ms)).toBeGreaterThanOrEqual(0);

      const done = await pool.query(
        `UPDATE action_idempotency SET result=$5::jsonb, completed_at=now()
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`,
        [...binds, JSON.stringify({ ok: true })]);
      expect(done.rowCount).toBe(1);

      // A completed reservation must NOT be releasable — the DELETE is guarded on
      // result IS NULL so a late failure path cannot erase a published result.
      const released = await pool.query(
        `DELETE FROM action_idempotency
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4 AND result IS NULL`, binds);
      expect(released.rowCount).toBe(0);
    } finally {
      await pool!.query(
        `DELETE FROM action_idempotency WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`, binds);
      await closeDb();
    }
  });
});

describe('ActionError carries the 409 for a caller that must not retry immediately', () => {
  it('IDEMPOTENT_IN_FLIGHT is a 409, not a 500', () => {
    const err = new ActionError('IDEMPOTENT_IN_FLIGHT', 'x', 409);
    expect(err.status).toBe(409);
  });
});
