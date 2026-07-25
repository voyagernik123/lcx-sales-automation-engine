/**
 * THE GATES FAILED OPEN ON ANY POSTGRES ERROR.
 *
 * Both SAT/compliance gates caught the reviews lookup with a bare `catch` and
 * substituted "all reviews present". That is the correct response to exactly ONE
 * condition — `42P01 undefined_table`, i.e. the migration has not landed yet, a
 * deploy-order fact the desk cannot be blocked on. It is the wrong response to
 * every other error, and the audit measured below shows why: a `57014` statement
 * timeout on a busy Postgres silently converted a gated action into an ungated
 * one, and nothing in `object_actions` or `audit_log` recorded that the gate had
 * been skipped. The same shape lived in `hasActivePremortem`, which the $25k deal
 * gate consumes.
 *
 * Why one test per code rather than one "it fails open" test: a single test is
 * what let this survive seven phases. `42P01` and `57014` must have OPPOSITE
 * outcomes, so only a per-code matrix can express the invariant.
 *
 * These run against a stub pool, not Postgres — the api suite is deliberately
 * database-free. That means they prove the control flow around the query, not
 * that Postgres emits these codes in these situations. The codes themselves come
 * from the Postgres error-code table; `ECONNRESET` is what `pg` surfaces on a
 * dropped socket and stands in here for "an error with no SQLSTATE at all".
 */

import type pg from 'pg';
import { describe, it, expect } from 'vitest';
import { invokeAction, ACTION_REGISTRY } from '../registry.js';

interface Recorded { sql: string; params: unknown[] }

function pgError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/**
 * A pool that answers every query the two gated executors make, except the
 * reviews lookup, which fails with the code under test.
 */
function stubPool(error: Error | null) {
  const queries: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (error && /FROM analytic_reviews/.test(sql)) throw error;
      if (/FROM dist_campaigns WHERE id/.test(sql)) {
        // token-incentivized and inside the emission envelope, so the ONLY
        // possible blocker is the reviews lookup — otherwise a pass would be
        // ambiguous between "gate open" and "gate satisfied elsewhere".
        return { rows: [{ token_incentivized: true, budget_lcx: '0' }], rowCount: 1 };
      }
      if (/UPDATE command_decisions/.test(sql)) {
        return { rows: [{ decision: 'exchange model', phase: 'Phase 1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

const ledgerRow = (queries: Recorded[]) => queries.find((q) => /INSERT INTO object_actions/.test(q.sql));
const auditRow = (queries: Recorded[]) => queries.find((q) => /INSERT INTO audit_log/.test(q.sql));

/** The two gated invocations, each with the params that reach the gate. */
const GATED = [
  {
    name: 'command_decide on a program-critical decision (SAT gate)',
    run: (pool: pg.Pool) => invokeAction(pool, 'command_decide', {
      subjectType: 'command_decision', subjectId: 'dec_01',
      params: { chosen: 'central limit order book' },
      // 'operator' is not a roster id, so it is treated as a machine principal
      // and loadEntitlements never touches the pool — keeping this test about
      // the gate and not about entitlements.
      actor: 'operator', role: 'operator' as const,
    }),
    refusalCode: 'SAT_REQUIRED',
  },
  {
    name: 'dist_campaign_set_status launching a token campaign (compliance gate)',
    run: (pool: pg.Pool) => invokeAction(pool, 'dist_campaign_set_status', {
      subjectType: 'dist_campaign', subjectId: '00000000-0000-0000-0000-000000000001',
      params: { status: 'live' },
      actor: 'operator', role: 'approver' as const,
    }),
    refusalCode: 'COMPLIANCE_GATE',
  },
];

/**
 * Faults, not deploy-order facts. Each one previously let the action through.
 *  57014 — statement timeout: the realistic one. A busy Postgres ungates writes.
 *  42501 — permission denied: a misconfigured grant ungates writes.
 *  40001 — serialization failure: retryable, and retry is the correct response.
 *  ECONNRESET — a dropped socket, no SQLSTATE at all.
 */
const FAULTS: Array<[string, string]> = [
  ['57014', 'canceling statement due to statement timeout'],
  ['42501', 'permission denied for table analytic_reviews'],
  ['40001', 'could not serialize access due to concurrent update'],
  ['ECONNRESET', 'read ECONNRESET'],
];

for (const gate of GATED) {
  describe(gate.name, () => {
    for (const [code, message] of FAULTS) {
      it(`rethrows ${code} instead of opening the gate`, async () => {
        const { pool, queries } = stubPool(pgError(code, message));
        await expect(gate.run(pool)).rejects.toThrow(message);
        // Not merely "an error happened": the action must not have executed and
        // must not have been recorded as if it had.
        expect(ledgerRow(queries), `${code} wrote an object_actions row`).toBeUndefined();
        expect(auditRow(queries), `${code} wrote an audit_log row`).toBeUndefined();
      });
    }

    it('fails open on 42P01, because the migration lands by hand', async () => {
      const { pool } = stubPool(pgError('42P01', 'relation "analytic_reviews" does not exist'));
      await expect(gate.run(pool)).resolves.toBeTruthy();
    });

    it('records gateDegraded in BOTH the ledger and the audit row when 42P01 fires', async () => {
      // The fallback being safe is not the same as it being legible. Before this,
      // a skipped gate was indistinguishable in the audit from a satisfied one —
      // which is the part that makes an ungated write undetectable after the fact.
      const { pool, queries } = stubPool(pgError('42P01', 'relation "analytic_reviews" does not exist'));
      await gate.run(pool);

      const ledger = ledgerRow(queries);
      const audit = auditRow(queries);
      expect(ledger).toBeDefined();
      expect(audit).toBeDefined();
      // params is the 5th bind on object_actions, meta the 5th on audit_log.
      const ledgerParams = JSON.parse(String(ledger!.params[4])) as Record<string, unknown>;
      const auditMeta = JSON.parse(String(audit!.params[4])) as Record<string, unknown>;
      expect(ledgerParams.gateDegraded).toBe(true);
      expect(auditMeta.gateDegraded).toBe(true);
      // And it says WHICH gate and WHY, or a reader still cannot act on it.
      expect(String(ledgerParams.gateDegradedReason)).toMatch(/42P01/);
      expect(String(ledgerParams.gateDegradedReason)).toMatch(/analytic_reviews/);
    });

    it('still refuses when the reviews query succeeds and returns nothing', async () => {
      // The fix must not have turned the gate off. With a working table and no
      // reviews on file, the refusal is the whole point.
      const { pool } = stubPool(null);
      await expect(gate.run(pool)).rejects.toMatchObject({ code: gate.refusalCode });
    });

    it('does not record gateDegraded when the gate ran normally', async () => {
      // A degraded marker that is always present is worth nothing.
      const { pool, queries } = stubPool(null);
      await gate.run(pool).catch(() => {});
      const ledger = ledgerRow(queries);
      if (ledger) {
        const params = JSON.parse(String(ledger.params[4])) as Record<string, unknown>;
        expect(params.gateDegraded).toBeUndefined();
      }
    });
  });
}

describe('gateDegraded cannot be forged by the client', () => {
  it('is stripped from params by the zod schema before it can reach the ledger', async () => {
    // If a caller could set it, the marker would be useless in the other
    // direction: an operator could stamp a normal write as degraded, or a
    // truthful marker could be pre-empted. z.object() strips unknown keys, so
    // this is a property of every action's schema, not of a special case.
    const parsed = ACTION_REGISTRY.command_decide.paramsSchema.safeParse({
      chosen: 'x', gateDegraded: true, gateDegradedReason: 'lies',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'gateDegraded' in parsed.data).toBe(false);
  });
});
