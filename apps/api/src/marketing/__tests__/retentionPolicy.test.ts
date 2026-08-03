import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { _resetRecordMigrated } from '../record.js';
import {
  RETENTION_POLICY,
  RETENTION_POLICY_ALTERNATIVES,
  RETENTION_POLICY_MINIMISE_EVERYTHING,
  RETENTION_POLICY_RETAIN_EVERYTHING,
  RETENTION_POLICY_SPLIT_DEFAULT,
  _resetRetentionMigrated,
  retentionPolicySweepShape,
  retentionPosture,
  runRetentionClock,
} from '../retention.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE RETENTION RULING IS A CONSTANT, AND THE SWEEP OBEYS IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  The conflict is genuine and unresolvable in code: the retention inferred from MiCA
 *  Art 68(9) wants LCX's records for five years, and migration 0046 deletes every
 *  inbound row at ninety days. Somebody has to choose. The choice is now
 *  `RETENTION_POLICY` and the written decision is `RETENTION_POLICY.md`.
 *
 *  WHAT EACH SECTION PREVENTS:
 *   §A a ruling that drifts from the document, or acquires a signature it does not have.
 *   §B a future edit that changes `RETENTION_POLICY` and changes nothing about the
 *      sweep — the constant becoming decoration. Every assertion here is derived from
 *      the policy object, so hardcoding the behaviour fails it.
 *   §C the ninety-day cascade reaching a row the ruling says to keep.
 *
 *  THE STUB POOL DOES NOT EVALUATE SQL. Where a guarantee lives in a predicate
 *  Postgres will run, the test pins the predicate TEXT and the parameter and says so
 *  rather than implying it observed a row survive.
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
  otherExpiredIds: number[];
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
    otherExpiredIds: [77, 78],
    deleteRowCount: 7,
    updateRowCount: 1,
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
    if (/SELECT id\s+FROM marketing_x_reply/.test(sql)) {
      return {
        rows: f.otherExpiredIds.map((id) => ({ id })),
        rowCount: f.otherExpiredIds.length,
      };
    }
    if (/UPDATE marketing_x_reply/.test(sql)) return { rows: [], rowCount: f.updateRowCount };
    if (/DELETE FROM marketing_x_reply/.test(sql)) return { rows: [], rowCount: f.deleteRowCount };
    if (/DELETE FROM marketing_record/.test(sql)) {
      return { rows: [], rowCount: f.recordDeleteRowCount };
    }
    if (/count\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 3 }], rowCount: 1 };
    if (/max\(ran_at\)/.test(sql)) {
      return { rows: [{ n: 1, last_at: '2026-08-02T00:00:00.000Z' }], rowCount: 1 };
    }
    if (/SELECT ran_by FROM marketing_retention_run/.test(sql)) {
      return { rows: [{ ran_by: 'nik' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  return { pool: { query } as unknown as Pool, f };
}

const NOW = new Date('2026-08-03T12:00:00.000Z');
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(resolve(HERE, '../../db/migrations/', file), 'utf8');
/** Comment lines stripped, so prose about CASCADE is not read as a statement. */
const body = (sql: string) =>
  sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const jeopardyRow = {
  id: 41, x_comment_id: 'c-41', status: 'answered',
  retention_expires_at: iso(-1), approved_drafts: 1,
};

const inboundDelete = (calls: Call[]) =>
  calls.filter((c) => /DELETE FROM marketing_x_reply/.test(c.sql));
const recordDelete = (calls: Call[]) =>
  calls.filter((c) => /DELETE FROM marketing_record/.test(c.sql));
const minimiseUpdate = (calls: Call[]) =>
  calls.filter((c) => /UPDATE marketing_x_reply AS r/.test(c.sql));
const holdUpdate = (calls: Call[]) =>
  calls.filter((c) => /UPDATE marketing_x_reply\s+SET retention_hold_reason/.test(c.sql));

beforeEach(() => {
  _resetRetentionMigrated();
  _resetRecordMigrated();
  delete process.env.MARKETING_RETENTION_DAYS;
});

/* ── §A the ruling, and what it does not claim ─────────────────────────────── */

describe('the policy of record is a constant with a document and no signature', () => {
  it('offers exactly three rulings, all pointing at the same document', () => {
    // Non-vacuity: the loop below would pass over an empty list.
    expect(RETENTION_POLICY_ALTERNATIVES).toHaveLength(3);
    expect(RETENTION_POLICY_ALTERNATIVES.map((p) => p.id)).toEqual([
      'split_default', 'retain_everything', 'minimise_everything',
    ]);
    for (const p of RETENTION_POLICY_ALTERNATIVES) {
      expect(p.document).toBe('RETENTION_POLICY.md');
      expect(p.tradeoff.length).toBeGreaterThan(80);
    }
  });

  it('claims NO DPO SIGNATURE, because there is none', () => {
    // THE ASSERTION THAT MATTERS MOST HERE. A name in this field would be a fabricated
    // approval by a real person. It fails the moment anybody invents one, and it is
    // meant to be deleted only by the same commit that adds a real signature to
    // RETENTION_POLICY.md.
    for (const p of RETENTION_POLICY_ALTERNATIVES) expect(p.signedByDpo).toBeNull();
    expect(RETENTION_POLICY.signedByDpo).toBeNull();
  });

  it('is one of the three, so the override cannot point at an ad-hoc object', () => {
    expect(RETENTION_POLICY_ALTERNATIVES).toContain(RETENTION_POLICY);
  });

  it('pins today\'s ruling: LCX statements long, third-party content minimised', () => {
    // WOULD CATCH: the ruling being changed in code without RETENTION_POLICY.md moving
    // with it. If this fails, one of the two is now lying about the other.
    expect(RETENTION_POLICY).toBe(RETENTION_POLICY_SPLIT_DEFAULT);
    expect(RETENTION_POLICY.expiredWithUnrecordedStatement).toBe('minimise_and_hold');
    expect(RETENTION_POLICY.expiredOtherwise).toBe('delete');
    expect(RETENTION_POLICY.lcxStatementYears).toBe(5);
    expect(RETENTION_POLICY.lcxStatementCeilingYears).toBe(7);
    expect(RETENTION_POLICY.sweepLcxStatements).toBe(true);
  });

  it('is returned in the posture, with the unsigned state said out loud', async () => {
    const { pool } = fixture();
    const p = await retentionPosture(pool, { now: NOW });
    expect(p.policy.id).toBe(RETENTION_POLICY.id);
    expect(p.policy.signedByDpo).toBeNull();
    const dpo = p.refusals.find((r) => r.code === 'RETENTION_DPO_RULING_PENDING')!;
    expect(dpo.sentence).toContain('NO DPO HAS SIGNED IT');
    expect(dpo.sentence).toContain('RETENTION_POLICY.md');
    // The long clock reports the period the ruling will actually keep, not a copy.
    expect(p.longClock.periodYears).toBe(RETENTION_POLICY.lcxStatementYears);
  });
});

/* ── §B the sweep reads the constant ───────────────────────────────────────── */

describe('the sweep does what the constant says, not what it once said', () => {
  it('issues exactly the statements retentionPolicySweepShape predicts for the ruling in force',
    async () => {
      const { pool, f } = fixture({
        jeopardyRows: [jeopardyRow],
        heldBodies: [{ id: 41, body: 'is LCX actually regulated?' }],
      });
      const res = await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      // EVERY expectation below is derived from RETENTION_POLICY. Change the constant
      // and this test changes with it; hardcode the behaviour and it fails.
      const shape = retentionPolicySweepShape(RETENTION_POLICY);
      expect(inboundDelete(f.calls).length > 0).toBe(shape.deletesExpiredRows);
      expect(minimiseUpdate(f.calls).length > 0).toBe(shape.minimisesBodies);
      expect(holdUpdate(f.calls).length > 0).toBe(shape.holdsBodiesIntact);
      expect(recordDelete(f.calls).length > 0).toBe(shape.sweepsRecords);
      expect(res.value.policy).toBe(RETENTION_POLICY);

      // The collision row is excluded from the delete iff the ruling protects it.
      const del = inboundDelete(f.calls)[0]!;
      expect(del.params[1]).toEqual(shape.protectsUnrecordedStatements ? [41] : []);
    });

  it('under retain_everything ISSUES NO DELETE AT ALL and holds the rows with a reason',
    async () => {
      const { pool, f } = fixture({
        jeopardyRows: [jeopardyRow],
        heldBodies: [{ id: 41, body: 'x' }],
        otherExpiredIds: [77, 78],
        updateRowCount: 2,
      });
      const res = await runRetentionClock(pool, {
        ranBy: 'nik', mode: 'enforce', now: NOW, policy: RETENTION_POLICY_RETAIN_EVERYTHING,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(inboundDelete(f.calls)).toHaveLength(0);
      expect(recordDelete(f.calls)).toHaveLength(0);
      expect(minimiseUpdate(f.calls)).toHaveLength(0);
      // Held with LCX's own sentence about LCX's own decision, naming the document.
      const holds = holdUpdate(f.calls);
      expect(holds.length).toBeGreaterThan(0);
      expect(String(holds.at(-1)!.params[1])).toContain('RETENTION_POLICY.md');
      // 0, not null: the sweep LOOKED and deleted none. Null means it could not look.
      expect(res.value.thirdPartyRowsDeleted).toBe(0);
      expect(res.value.thirdPartyRowsHeldIntact).toBeGreaterThan(0);
      expect(res.value.thirdPartyRowsMinimised).toBe(0);
      // And it says the long clock did not run, rather than reporting a quiet null.
      expect(res.value.refusals.map((r) => r.code)).toContain('RETENTION_DPO_RULING_PENDING');
      expect(res.value.recordRowsExpired).toBeNull();
    });

  it('under minimise_everything deletes the collision rows and says the record is GONE',
    async () => {
      const { pool, f } = fixture({
        jeopardyRows: [jeopardyRow],
        heldBodies: [{ id: 41, body: 'x' }],
      });
      const res = await runRetentionClock(pool, {
        ranBy: 'nik', mode: 'enforce', now: NOW, policy: RETENTION_POLICY_MINIMISE_EVERYTHING,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      // Nothing is minimised or held; the collision row is NOT excluded from the delete.
      expect(minimiseUpdate(f.calls)).toHaveLength(0);
      expect(holdUpdate(f.calls)).toHaveLength(0);
      expect(inboundDelete(f.calls)[0]!.params[1]).toEqual([]);
      // The refusal must not claim a hold that did not happen. This is the sentence an
      // operator reads for the truth, so it states the loss.
      const jr = res.value.refusals.find((r) => r.code === 'RETENTION_STATEMENTS_IN_JEOPARDY')!;
      expect(jr.sentence).toContain('DELETED with the rest');
      expect(jr.sentence).toContain('gone');
      expect(jr.sentence).not.toContain('held rather than deleted');
    });

  it('writes the ruling into the run ledger, so a past deletion can be explained', async () => {
    const { pool, f } = fixture();
    await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    const insert = f.calls.find((c) => /INSERT INTO marketing_retention_run/.test(c.sql))!;
    expect(String(insert.params[8])).toContain(`policy=${RETENTION_POLICY.id}`);
    expect(String(insert.params[8])).toContain('unsigned');
  });

  it('a dry run touches nothing under every one of the three rulings', async () => {
    for (const policy of RETENTION_POLICY_ALTERNATIVES) {
      const { pool, f } = fixture({
        jeopardyRows: [jeopardyRow], heldBodies: [{ id: 41, body: 'x' }],
      });
      const res = await runRetentionClock(pool, {
        ranBy: 'nik', mode: 'dry_run', now: NOW, policy,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // WOULD CATCH: an alternative whose hold path runs outside the enforce branch and
      // quietly writes on a dry run. A dry run is the mode an operator uses first.
      const wrote = f.calls.filter((c) => /^\s*(DELETE|UPDATE|TRUNCATE)/i.test(c.sql.trim()));
      expect(wrote, `dry run wrote under ${policy.id}`).toHaveLength(0);
      expect(res.value.thirdPartyRowsHeldIntact).toBeNull();
    }
  });
});

/* ── §C the cascade cannot reach a row the ruling keeps ────────────────────── */

describe('the ninety-day cascade cannot delete a row the policy says to keep', () => {
  it('0046 cascades only into the draft table, never into a register', () => {
    const sql = body(read('0046_marketing.sql'));
    // Non-vacuity: the file must actually contain the cascade this test reasons about.
    expect(sql).toMatch(/REFERENCES marketing_x_reply\(id\) ON DELETE CASCADE/);
    const cascades = sql.match(/REFERENCES\s+marketing_x_reply\(id\)\s+ON DELETE CASCADE/g) ?? [];
    expect(cascades).toHaveLength(1);
    // The one dependent is the draft table, and drafts are LCX text that is copied into
    // marketing_record when a statement is recorded — losing the draft row does not lose
    // the record.
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS marketing_reply_draft[\s\S]{0,400}ON DELETE CASCADE/);
  });

  it('0061 gives marketing_record NO foreign key to the swept table, so nothing cascades in', () => {
    const sql = body(read('0061_marketing_record.sql'));
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS marketing_record\b/);
    // THE PROOF, and it is a proof of ABSENCE: the register is linked to the inbound row
    // by value (`x_comment_id`), not by a foreign key, so DELETE FROM marketing_x_reply
    // cannot reach it however the sweep is written.
    expect(sql).not.toMatch(/marketing_record[\s\S]*?REFERENCES\s+marketing_x_reply/);
    expect(sql).toMatch(/x_comment_id/);
  });

  it('the inbound delete names one table and excludes the kept ids by id', async () => {
    const { pool, f } = fixture({
      jeopardyRows: [jeopardyRow], heldBodies: [{ id: 41, body: 'x' }],
    });
    await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    const del = inboundDelete(f.calls)[0]!;
    // One table, one predicate on expiry, and an id-list exclusion — no join and no
    // subquery through which the delete could reach another register.
    expect(del.sql).not.toMatch(/marketing_record/);
    expect(del.sql).not.toMatch(/USING|JOIN|SELECT/i);
    expect(del.sql).toMatch(/NOT \(id = ANY\(\$2::bigint\[\]\)\)/);
    expect(del.params[1]).toEqual([41]);
  });

  it('the long clock will not delete a record younger than the ruling\'s floor', async () => {
    const { pool, f } = fixture();
    await runRetentionClock(pool, { ranBy: 'nik', mode: 'enforce', now: NOW });
    const del = recordDelete(f.calls)[0]!;
    // The stub pool does not evaluate SQL, so what is asserted is the predicate TEXT and
    // the parameter: the floor comes from the policy, and it is ANDed with the row's own
    // expiry rather than replacing it. The semantic guarantee is Postgres's.
    expect(del.sql).toMatch(/drafted_at < \(\$1::timestamptz - make_interval\(years => \$2::int\)\)/);
    expect(del.params[1]).toBe(RETENTION_POLICY.lcxStatementYears);
    // And the Art 68(9) extension is still honoured: a legal hold is not a policy dial.
    expect(del.sql).toMatch(/legal_hold = false/);
    expect(del.sql).toMatch(/legal_hold_until IS NULL OR legal_hold_until < \$1/);
  });

  it('reads the floor from whichever ruling is passed, not from a constant of its own', async () => {
    const { pool, f } = fixture();
    await runRetentionClock(pool, {
      ranBy: 'nik', mode: 'enforce', now: NOW, policy: RETENTION_POLICY_MINIMISE_EVERYTHING,
    });
    expect(recordDelete(f.calls)[0]!.params[1])
      .toBe(RETENTION_POLICY_MINIMISE_EVERYTHING.lcxStatementYears);
  });
});

/* ── §D the document of record exists and matches the constant ─────────────── */

describe('RETENTION_POLICY.md is the document the constant points at', () => {
  const doc = readFileSync(resolve(HERE, '../../../../../RETENTION_POLICY.md'), 'utf8');

  it('exists at the path every policy names', () => {
    // WOULD CATCH: a constant citing a document that is not there, which is the same
    // thing as citing nothing.
    expect(RETENTION_POLICY.document).toBe('RETENTION_POLICY.md');
    expect(doc.length).toBeGreaterThan(4000);
  });

  it('states that nobody has signed it, in the document and not only in the code', () => {
    expect(doc).toMatch(/No Data Protection Officer has ruled on this document/);
    expect(doc).toMatch(/UNSIGNED/);
    expect(doc).toMatch(/not signed/);
  });

  it('carries mkt-r1\'s caveat rather than laundering the inference into a citation', () => {
    // THE POINT OF THE WHOLE DOCUMENT. It adopts an inference; if it ever stops saying
    // so, it is claiming an authority MiCA does not give it.
    expect(doc).toMatch(/no express retention period for a CASP's marketing communications/);
    expect(doc).toMatch(/INFERENCE, not text/);
    expect(doc).toMatch(/Art 68\(9\)/);
    expect(doc).toMatch(/mkt-r1-regulatory\.md/);
  });

  it('names the one line that overrides it, and both alternatives by their constant', () => {
    expect(doc).toContain('export const RETENTION_POLICY: RetentionPolicy = RETENTION_POLICY_SPLIT_DEFAULT;');
    expect(doc).toContain('RETENTION_POLICY_RETAIN_EVERYTHING');
    expect(doc).toContain('RETENTION_POLICY_MINIMISE_EVERYTHING');
    // The ruling in force must be the one the document describes as in force.
    expect(RETENTION_POLICY.id).toBe('split_default');
  });

  it('names who may override it — and it is not an engineer', () => {
    expect(doc).toMatch(/Data Protection Officer, or the accountable\s+management body/);
    expect(doc).toMatch(/Not an engineer, and not an\s+agent/);
  });
});
