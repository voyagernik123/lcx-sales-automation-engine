/**
 * What these tests are FOR: the GPS actions are the only write paths that touch a
 * third party's commercial terms while the operator is an employee of a regulated
 * exchange. The properties asserted below are the ones whose loss would not be
 * visible in any surface — a capability quietly downgraded, a gate reachable
 * around, a compliance record authored by a machine, an audit row that names no
 * object.
 *
 * They run against a STUB POOL, not Postgres: the api suite is deliberately
 * database-free (see the same note in actions/__tests__/gateFailOpen.test.ts:20).
 * That is a real limit — they prove the control flow around each query and the
 * shape of the SQL, not that Postgres behaves as assumed. The CHECK constraints
 * and the UNIQUE on gps_conflict_check.engagement_id are verified by applying
 * 0047_gps.sql, not here.
 *
 * Executors are called DIRECTLY rather than through `invokeAction`, because the
 * wiring into ACTION_REGISTRY is owned by another change. The permission gates
 * therefore cannot be exercised end-to-end here; instead each requirement is
 * asserted twice — the DECLARATION on the action, and (for the approver
 * requirement) the line in registry.ts that turns that declaration into a
 * capability check. If either half moves, one of these fails.
 */

import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PRICE_BANDS_ARE_PLACEHOLDERS, ENGAGEMENT_STATUSES } from '@lcx/shared';
import { GPS_ACTIONS, type GpsAction } from '../actions.js';
import { ActionError } from '../../actions/registry.js';

const byId = (id: string): GpsAction => {
  const a = GPS_ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`no such GPS action: ${id}`);
  return a;
};

const ENGAGEMENT_ID = '00000000-0000-0000-0000-0000000000e1';
const CLIENT_ID = '00000000-0000-0000-0000-0000000000c1';

interface Recorded { sql: string; params: unknown[] }

/** Raw-row shape (snake_case, bigints as strings) exactly as `pg` returns it. */
function engagementRow(over: Record<string, unknown> = {}) {
  return {
    id: ENGAGEMENT_ID,
    client_id: CLIENT_ID,
    offer_key: 'mica_whitepaper',
    status: 'draft',
    price_cents: '0',
    // $8,000 expected partner cost — so a $6,000 quote is genuinely below cost
    // and the margin half of the discount gate has something real to catch.
    vendor_cost_cents: '800000',
    owner: null as string | null,
    ...over,
  };
}

interface StubOpts {
  engagement?: Record<string, unknown> | null;
  conflict?: { decision: string } | null;
  /** A prior gps_discount_approve in object_actions, for exactly this price. */
  approvedPriceCents?: number;
  approvedBy?: string;
  /** Rows affected by the UPDATE, so a lost optimistic-concurrency race is testable. */
  updateRowCount?: number;
  /** [pattern, error] — the query matching the pattern throws. */
  fail?: [RegExp, Error];
}

function pgError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function stubPool(opts: StubOpts = {}) {
  const queries: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (opts.fail && opts.fail[0].test(sql)) throw opts.fail[1];
      if (/FROM gps_engagement/.test(sql)) {
        const row = opts.engagement === undefined ? engagementRow() : opts.engagement;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/FROM gps_conflict_check/.test(sql)) {
        return { rows: opts.conflict ? [opts.conflict] : [], rowCount: opts.conflict ? 1 : 0 };
      }
      if (/FROM object_actions/.test(sql)) {
        const asked = String(params[2]);
        const hit = opts.approvedPriceCents !== undefined && asked === String(opts.approvedPriceCents);
        return hit
          ? { rows: [{ actor: opts.approvedBy ?? 'monty', created_at: '2026-07-30T10:00:00.000Z' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO gps_conflict_check/.test(sql)) {
        return { rows: [{ id: '00000000-0000-0000-0000-0000000000cc' }], rowCount: 1 };
      }
      if (/UPDATE gps_engagement/.test(sql)) {
        return { rows: [], rowCount: opts.updateRowCount ?? 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

/** An ActionContext, minus the parts invokeAction owns. Collects degradations. */
function ctx(pool: pg.Pool, over: { params?: Record<string, unknown>; actor?: string; role?: 'operator' | 'approver'; subjectId?: string } = {}) {
  const degradations: string[] = [];
  return {
    args: {
      pool,
      subjectType: 'gps_engagement',
      subjectId: over.subjectId ?? ENGAGEMENT_ID,
      params: over.params ?? {},
      actor: over.actor ?? 'nik',
      role: over.role ?? 'operator',
      markGateDegraded: (reason: string) => degradations.push(reason),
    },
    degradations,
  };
}

/** The ActionError a call is expected to fail with — asserted on `code`, never on prose. */
async function failsWith(promise: Promise<unknown>): Promise<ActionError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ActionError) return err;
    throw err;
  }
  throw new Error('expected the action to refuse, but it resolved');
}

/**
 * Comments survive into `Function.prototype.toString()` and these executors quote
 * their own defect classes verbatim, so source assertions must strip them — the
 * same reasoning (and the same helper) as actions/__tests__/authority.test.ts:33.
 */
function codeOnly(fn: (...args: never[]) => unknown): string {
  return fn
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ─────────────────────────── capability requirements ─────────────────────── */

describe('capability requirements', () => {
  /**
   * The whole permission surface of the compartment, in one table. A change to
   * any cell has to be made here too, which is the point: a downgrade from
   * approver to operator on the concession action is a one-word edit that no
   * screen would show.
   */
  const EXPECTED: Record<string, { minRole: 'operator' | 'approver'; workspace: 'gps' }> = {
    gps_conflict_declare: { minRole: 'operator', workspace: 'gps' },
    gps_proposal_issue: { minRole: 'operator', workspace: 'gps' },
    gps_discount_approve: { minRole: 'approver', workspace: 'gps' },
    gps_engagement_accept: { minRole: 'operator', workspace: 'gps' },
    gps_status_change: { minRole: 'operator', workspace: 'gps' },
  };

  it('exports exactly the five Phase 1 actions, with unique ids', () => {
    const ids = GPS_ACTIONS.map((a) => a.id).sort();
    expect(ids).toEqual(Object.keys(EXPECTED).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(Object.entries(EXPECTED))('%s declares its minRole and compartment', (id, want) => {
    const a = byId(id);
    expect(a.minRole).toBe(want.minRole);
    // Untagged actions rely on minRole alone (registry.ts:95-99). A GPS action
    // must never be untagged: without `workspace` it would be invocable by any
    // desk member, defeating the eighth compartment entirely.
    expect(a.workspace).toBe(want.workspace);
  });

  it('issuing a proposal needs operate, approving a concession needs approve', () => {
    // Stated separately from the table because these two are the requirement, not
    // an incidental property: the selling motion must not need a second person,
    // and the concession must.
    expect(byId('gps_proposal_issue').minRole).toBe('operator');
    expect(byId('gps_discount_approve').minRole).toBe('approver');
  });

  it('invokeAction still maps approver-only actions to the approve capability', () => {
    // The `minRole: 'approver'` declaration above only requires the 'approve'
    // CAPABILITY because registry.ts derives one from the other. If that mapping
    // is ever changed to always require 'operate', every assertion above would
    // still pass while an operate-tier member could approve a concession — so the
    // coupling is pinned here, at its source.
    const registry = readFileSync(new URL('../../actions/registry.ts', import.meta.url), 'utf8');
    expect(registry).toMatch(/action\.minRole === 'approver' \? 'approve' : 'operate'/);
    // …and that the role check itself is still unconditional.
    expect(registry).toMatch(/action\.minRole === 'approver' && input\.role !== 'approver'/);
  });
});

/* ──────────────────────────── the audit path ──────────────────────────────── */

describe('every action declares an audit path', () => {
  const KNOWN_TABLES = new Set(['gps_engagement', 'gps_conflict_check']);

  it.each(GPS_ACTIONS.map((a) => [a.id, a] as const))('%s names the object its audit row points at', (_id, a) => {
    // invokeAction writes audit_log(entity, entity_id) from subjectType/subjectId
    // (registry.ts:1107-1111), so a wildcard subject type would produce audit rows
    // for client commercial decisions that name no object.
    expect(a.auditSubjectType).toBe('gps_engagement');
    expect(a.subjectTypes).toEqual([a.auditSubjectType]);
    expect(a.subjectTypes).not.toContain('*');
    expect(Array.isArray(a.auditWrites)).toBe(true);
    for (const t of a.auditWrites) expect(KNOWN_TABLES.has(t), t).toBe(true);
  });

  it('only the concession action writes no table, and says so', () => {
    // An empty auditWrites is honest for gps_discount_approve — its authorisation
    // exists solely as the object_actions row — and would be a BUG anywhere else,
    // meaning an action that claims to change state and does not.
    const empty = GPS_ACTIONS.filter((a) => a.auditWrites.length === 0).map((a) => a.id);
    expect(empty).toEqual(['gps_discount_approve']);
  });
});

/* ───────────────── a concession cannot be self-approved ──────────────────── */

describe('a discount cannot be self-approved, and not at operate level at all', () => {
  const approve = byId('gps_discount_approve');
  const goodParams = { priceCents: 600_000, reason: 'strategic first engagement with a referring counterparty' };

  it('is unreachable at operate level by declaration (registry.ts enforces it)', () => {
    // Both halves matter: `minRole` makes invokeAction refuse role='operator' with
    // FORBIDDEN (registry.ts:1006), and the same field makes the workspace gate
    // demand 'approve' rather than 'operate' (registry.ts:1015) — so sam, granted
    // gps at 'operate' by 0047_gps.sql:328, is refused before the executor runs.
    expect(approve.minRole).toBe('approver');
    expect(approve.workspace).toBe('gps');
  });

  it('refuses when the approver owns the engagement', async () => {
    const { pool } = stubPool({ engagement: engagementRow({ owner: 'nik' }) });
    const err = await failsWith(approve.execute(ctx(pool, { params: goodParams, actor: 'nik', role: 'approver' }).args));
    expect(err.code).toBe('SELF_APPROVAL');
    expect(err.status).toBe(403);
  });

  it('allows a different approver on the same engagement', async () => {
    const { pool } = stubPool({ engagement: engagementRow({ owner: 'nik' }) });
    const out = await approve.execute(ctx(pool, { params: goodParams, actor: 'monty', role: 'approver' }).args);
    expect(out.approvedBy).toBe('monty');
    expect(out.approvedPriceCents).toBe(600_000);
    // Margin travels into the ledger with the approval, so the record shows what
    // was given away: $6,000 against an $8,000 partner cost.
    expect(out.marginCentsAtApproval).toBe(-200_000);
  });

  it('refuses a machine principal even though the shared key holds gps at operate', async () => {
    // access/entitlements.ts:39 grants every workspace to the shared machine key.
    // A concession authored by 'operator', 'monitor:x' or 'ai' would be an
    // unattributable authorisation of a price cut on a client.
    for (const actor of ['operator', 'monitor:deadline', 'ai']) {
      const { pool } = stubPool();
      const err = await failsWith(approve.execute(ctx(pool, { params: goodParams, actor, role: 'approver' }).args));
      expect(err.code, actor).toBe('NAMED_HUMAN_REQUIRED');
    }
  });

  it('has no client-supplied flag that could bypass either check', () => {
    // The defect pinned by actions/__tests__/authority.test.ts was exactly this:
    // `overrideGate: true` in the payload defeating an authority requirement. The
    // executor must not consult any override/force/self flag, and must not read
    // `role` (which would imply the executor re-deciding authority instead of
    // invokeAction enforcing it).
    const source = codeOnly(approve.execute);
    expect(source).not.toMatch(/params\.(override|force|self|bypass|skip)/i);
    expect(source).not.toMatch(/\brole\b/);
    // The self-approval comparison itself is present.
    expect(source).toMatch(/row\.owner === actor/);
  });

  it('requires a non-blank reason of substance', () => {
    const bad = [
      { priceCents: 600_000 },
      { priceCents: 600_000, reason: '            ' },
      { priceCents: 600_000, reason: 'cheap' },
      { priceCents: 0, reason: 'a perfectly good written reason here' },
      { priceCents: 600_000.5, reason: 'a perfectly good written reason here' },
    ];
    for (const params of bad) expect(approve.paramsSchema.safeParse(params).success, JSON.stringify(params)).toBe(false);
    expect(approve.paramsSchema.safeParse(goodParams).success).toBe(true);
  });
});

/* ─────────────────────────── the conflict gate ───────────────────────────── */

describe('the conflict gate guards both client-facing boundaries', () => {
  const issue = byId('gps_proposal_issue');
  const accept = byId('gps_engagement_accept');
  const priced = { priceCents: 2_000_000 }; // $20,000 on an $8,000 cost — nothing else can block it

  it('refuses to issue a proposal with no conflict decision on file', async () => {
    const { pool } = stubPool({ conflict: null });
    const err = await failsWith(issue.execute(ctx(pool, { params: priced }).args));
    expect(err.code).toBe('CONFLICT_CHECK_REQUIRED');
    expect(err.status).toBe(409);
  });

  it('refuses to issue when the conflict check was declined', async () => {
    const { pool } = stubPool({ conflict: { decision: 'declined' } });
    const err = await failsWith(issue.execute(ctx(pool, { params: priced }).args));
    expect(err.code).toBe('CONFLICT_DECLINED');
  });

  it('refuses to record acceptance when the check was amended to declined afterwards', async () => {
    // The engagement legitimately reached 'proposed' while cleared; the check was
    // then amended. Re-running the gate at acceptance is the only thing that
    // catches this — which is why it is not "redundant".
    const { pool } = stubPool({ engagement: engagementRow({ status: 'proposed' }), conflict: { decision: 'declined' } });
    const err = await failsWith(accept.execute(ctx(pool).args));
    expect(err.code).toBe('CONFLICT_DECLINED');
  });

  it('issues once cleared, freezing the catalogue scope and not caller input', async () => {
    const { pool, queries } = stubPool({ conflict: { decision: 'cleared_with_disclosure' } });
    const out = await issue.execute(ctx(pool, { params: priced }).args);
    expect(out.status).toBe('proposed');
    expect(out.marginCents).toBe(1_200_000);
    expect(out.marginPct).toBe(60);
    expect(out.conflictDecision).toBe('cleared_with_disclosure');

    const update = queries.find((q) => /UPDATE gps_engagement/.test(q.sql))!;
    const snapshot = JSON.parse(String(update.params[4])) as Record<string, unknown>;
    expect(snapshot.offerKey).toBe('mica_whitepaper');
    // The exclusions are the sentences that stop a proposal implying a listing or
    // regulatory outcome; they must be in the frozen scope, from the catalogue.
    expect((snapshot.exclusions as string[]).length).toBeGreaterThan(3);
    expect(JSON.stringify(snapshot.exclusions)).toMatch(/listing/i);
    // A snapshot taken today must admit on its face that the band was a placeholder.
    expect(snapshot.priceBandsArePlaceholders).toBe(PRICE_BANDS_ARE_PLACEHOLDERS);
  });

  it('FAILS CLOSED when the conflict table does not exist yet', async () => {
    // The deliberate divergence from registry.ts:46-62, which fails OPEN on 42P01.
    // What is gated here is a document sent to a third party, and the cost of
    // refusing is one migration and a retry. If this ever starts returning a
    // proposal instead of a refusal, an unchecked proposal can reach a client.
    const { pool } = stubPool({ fail: [/FROM gps_conflict_check/, pgError('42P01', 'relation "gps_conflict_check" does not exist')] });
    const err = await failsWith(issue.execute(ctx(pool, { params: priced }).args));
    expect(err.code).toBe('GATE_UNAVAILABLE');
    expect(err.status).toBe(503);
  });

  it('propagates any other database error rather than treating it as an open gate', async () => {
    // 57014 (statement timeout) is the error that silently disabled the registry's
    // gates for seven phases (gateFailOpen.test.ts). It must not be a refusal code
    // and must not be a pass.
    const { pool } = stubPool({ fail: [/FROM gps_conflict_check/, pgError('57014', 'canceling statement due to statement timeout')] });
    await expect(issue.execute(ctx(pool, { params: priced }).args)).rejects.toThrow(/statement timeout/);
  });
});

/* ─────────────────────────── the discount gate ───────────────────────────── */

describe('the discount gate binds an approval to one exact price', () => {
  const issue = byId('gps_proposal_issue');
  const cleared = { conflict: { decision: 'cleared' } } as const;
  const belowCost = { priceCents: 600_000 }; // $6,000 against the $8,000 partner cost

  it('refuses a price at or below partner cost with no prior approval', async () => {
    const { pool } = stubPool({ ...cleared });
    const err = await failsWith(issue.execute(ctx(pool, { params: belowCost }).args));
    expect(err.code).toBe('DISCOUNT_APPROVAL_REQUIRED');
    expect(err.data?.marginCents).toBe(-200_000);
  });

  it('treats a zero margin as needing approval too', async () => {
    // Exactly at cost is not "fine": it is an engagement that pays the founder
    // nothing and absorbs any overrun personally.
    const { pool } = stubPool({ ...cleared });
    const err = await failsWith(issue.execute(ctx(pool, { params: { priceCents: 800_000 } }).args));
    expect(err.code).toBe('DISCOUNT_APPROVAL_REQUIRED');
  });

  it('does NOT accept an approval granted at a different price', async () => {
    // The failure this prevents: approve $7,000, issue at $5,000. The ledger
    // lookup matches on params->>'priceCents', so it finds nothing here.
    const { pool } = stubPool({ ...cleared, approvedPriceCents: 700_000 });
    const err = await failsWith(issue.execute(ctx(pool, { params: { priceCents: 500_000 } }).args));
    expect(err.code).toBe('DISCOUNT_APPROVAL_REQUIRED');
  });

  it('accepts an approval for exactly that price, and records who gave it', async () => {
    const { pool, queries } = stubPool({ ...cleared, approvedPriceCents: 600_000, approvedBy: 'monty' });
    const out = await issue.execute(ctx(pool, { params: belowCost }).args);
    expect(out.status).toBe('proposed');
    expect(out.discountApprovedBy).toBe('monty');
    // The lookup is bound to this engagement and this action id, not to any
    // approval anywhere.
    const lookup = queries.find((q) => /FROM object_actions/.test(q.sql))!;
    expect(lookup.sql).toMatch(/action\s*=\s*'gps_discount_approve'/);
    expect(lookup.params).toEqual(['gps_engagement', ENGAGEMENT_ID, '600000']);
  });

  it('does not look for an approval at all when the price clears both halves', async () => {
    const { pool, queries } = stubPool({ ...cleared });
    await issue.execute(ctx(pool, { params: { priceCents: 2_000_000 } }).args);
    expect(queries.find((q) => /FROM object_actions/.test(q.sql))).toBeUndefined();
  });

  it('records that the band half of the gate did not run while the bands are placeholders', async () => {
    const { pool } = stubPool({ ...cleared });
    const c = ctx(pool, { params: { priceCents: 2_000_000 } });
    await issue.execute(c.args);
    if (PRICE_BANDS_ARE_PLACEHOLDERS) {
      // No real price bands have been supplied, so refusing a quote for falling
      // below an invented floor would present a made-up number as policy. The
      // skip must be RECORDED — invokeAction stamps gateDegraded into both the
      // ledger and the audit row (registry.ts:1090-1093) — not silent.
      expect(c.degradations).toHaveLength(1);
      expect(c.degradations[0]).toMatch(/PRICE_BANDS_ARE_PLACEHOLDERS/);
      expect(c.degradations[0]).toMatch(/NOT evaluated/);
    } else {
      // Real bands have landed: the gate must now run, and nothing may be marked
      // degraded on a clean issue. This branch is the reminder to add the
      // below-band assertions that could not exist while the bands were fake.
      expect(c.degradations).toHaveLength(0);
    }
  });

  it('refuses on a lost concurrency race rather than issuing against a stale read', async () => {
    const { pool } = stubPool({ ...cleared, updateRowCount: 0 });
    const err = await failsWith(issue.execute(ctx(pool, { params: { priceCents: 2_000_000 } }).args));
    expect(err.code).toBe('CONCURRENT_MODIFICATION');
  });

  it('never reassigns an engagement that already has an owner', async () => {
    const { pool, queries } = stubPool({ ...cleared, engagement: engagementRow({ owner: 'sam' }) });
    await issue.execute(ctx(pool, { params: { priceCents: 2_000_000 }, actor: 'nik' }).args);
    const update = queries.find((q) => /UPDATE gps_engagement/.test(q.sql))!;
    expect(update.sql).toMatch(/owner\s*=\s*COALESCE\(owner,/);
  });

  it('refuses to issue from a delivery-side or terminal status', async () => {
    for (const status of ['in_delivery', 'invoiced']) {
      const { pool } = stubPool({ ...cleared, engagement: engagementRow({ status }) });
      const err = await failsWith(issue.execute(ctx(pool, { params: { priceCents: 2_000_000 } }).args));
      expect(err.code, status).toBe('WRONG_STATUS');
    }
    const { pool } = stubPool({ ...cleared, engagement: engagementRow({ status: 'collected' }) });
    const err = await failsWith(issue.execute(ctx(pool, { params: { priceCents: 2_000_000 } }).args));
    expect(err.code).toBe('TERMINAL');
  });
});

/* ───────────────────────── the conflict record ───────────────────────────── */

describe('gps_conflict_declare records a decision a human is accountable for', () => {
  const declare = byId('gps_conflict_declare');
  const checkPerformed = 'Checked the LCX listing application queue, desk positions, and any inbound influence requests for this project.';

  it('refuses a machine principal — decided_by must be a named human', async () => {
    const { pool } = stubPool();
    const err = await failsWith(
      declare.execute(ctx(pool, { params: { checkPerformed, decision: 'cleared' }, actor: 'operator' }).args),
    );
    expect(err.code).toBe('NAMED_HUMAN_REQUIRED');
    expect(err.status).toBe(403);
  });

  it('rejects a check that records nothing, and a disclosure that discloses nothing', () => {
    const bad = [
      { checkPerformed: 'checked - fine', decision: 'cleared' },
      { checkPerformed: '   '.repeat(20), decision: 'cleared' },
      // The one shape that would be actively misleading in a review: asserts the
      // client was told something while recording nothing they were told.
      { checkPerformed, decision: 'cleared_with_disclosure' },
      { checkPerformed, decision: 'cleared_with_disclosure', disclosureTextUsed: '   ' },
      { checkPerformed, decision: 'no_conflict' },
    ];
    for (const params of bad) expect(declare.paramsSchema.safeParse(params).success, JSON.stringify(params)).toBe(false);
    expect(declare.paramsSchema.safeParse({ checkPerformed, decision: 'cleared' }).success).toBe(true);
    expect(
      declare.paramsSchema.safeParse({ checkPerformed, decision: 'cleared_with_disclosure', disclosureTextUsed: 'LCX employs the seller; this engagement confers no listing advantage.' }).success,
    ).toBe(true);
  });

  it('upserts one row per engagement and carries client_id directly', async () => {
    const { pool, queries } = stubPool();
    const out = await declare.execute(ctx(pool, { params: { checkPerformed, decision: 'cleared' }, actor: 'sam' }).args);
    expect(out.decidedBy).toBe('sam');
    expect(out.clientId).toBe(CLIENT_ID);
    const insert = queries.find((q) => /INSERT INTO gps_conflict_check/.test(q.sql))!;
    // UNIQUE(engagement_id) + the amendment path 0047_gps.sql:252-255 sanctions.
    expect(insert.sql).toMatch(/ON CONFLICT \(engagement_id\) DO UPDATE/);
    expect(insert.sql).toMatch(/decided_at\s*=\s*now\(\)/);
    // client_id is stored on the check itself, not reached through a join.
    expect(insert.params[0]).toBe(CLIENT_ID);
    expect(insert.params[4]).toBe('sam');
  });

  it('cancels the engagement when the position is declined', async () => {
    const { pool, queries } = stubPool();
    const out = await declare.execute(ctx(pool, { params: { checkPerformed, decision: 'declined' }, actor: 'nik' }).args);
    expect(out.engagementCancelled).toBe(true);
    const update = queries.find((q) => /UPDATE gps_engagement/.test(q.sql))!;
    expect(update.sql).toMatch(/status='cancelled'/);
    // Must not resurrect an engagement that already ended.
    expect(update.sql).toMatch(/status NOT IN \('collected','closed_lost','cancelled'\)/);
  });

  it('does not touch the engagement status when the position is cleared', async () => {
    const { pool, queries } = stubPool();
    await declare.execute(ctx(pool, { params: { checkPerformed, decision: 'cleared' }, actor: 'nik' }).args);
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });
});

/* ───────────── the manual status setter cannot go around the gates ────────── */

describe('gps_status_change cannot reach a gated status', () => {
  const change = byId('gps_status_change');
  /** The enum a client is offered, read from the generated schema the manifest publishes. */
  const offered = ((z.toJSONSchema(change.paramsSchema) as { properties?: { status?: { enum?: string[] } } })
    .properties?.status?.enum ?? []) as string[];

  it('does not offer proposed or accepted', () => {
    // THE LOAD-BEARING ASSERTION OF THIS FILE. If a generic status setter could
    // write 'proposed' or 'accepted', every gate above would be one call away from
    // being bypassed — no conflict check, no discount approval — and it would look
    // like a convenience feature.
    expect(offered).not.toContain('proposed');
    expect(offered).not.toContain('accepted');
    for (const s of ['proposed', 'accepted']) {
      expect(change.paramsSchema.safeParse({ status: s }).success, s).toBe(false);
    }
  });

  it('offers every other lifecycle status, so the enum cannot silently shrink', () => {
    const expected = ENGAGEMENT_STATUSES.filter((s) => s !== 'proposed' && s !== 'accepted');
    expect([...offered].sort()).toEqual([...expected].sort());
  });

  it('requires a reason to close an engagement as lost or cancelled', () => {
    for (const status of ['closed_lost', 'cancelled']) {
      expect(change.paramsSchema.safeParse({ status }).success, status).toBe(false);
      expect(change.paramsSchema.safeParse({ status, reason: '   ' }).success, status).toBe(false);
      expect(change.paramsSchema.safeParse({ status, reason: 'client shelved the token launch' }).success, status).toBe(true);
    }
    // Non-terminal moves do not need one — the status itself is the information.
    expect(change.paramsSchema.safeParse({ status: 'in_delivery' }).success).toBe(true);
  });

  it('will not commit a partner before the deposit has arrived', async () => {
    // accepted → in_delivery skips deposit_paid. Partners invoice us, so starting
    // delivery on a signature alone is how an engagement becomes a personal
    // liability.
    const { pool } = stubPool({ engagement: engagementRow({ status: 'accepted' }) });
    const err = await failsWith(change.execute(ctx(pool, { params: { status: 'in_delivery' } }).args));
    expect(err.code).toBe('ILLEGAL_TRANSITION');
    expect(err.data?.allowed).toEqual(['deposit_paid', 'closed_lost', 'cancelled']);

    const ok = stubPool({ engagement: engagementRow({ status: 'deposit_paid' }) });
    const out = await change.execute(ctx(ok.pool, { params: { status: 'in_delivery' } }).args);
    expect(out.status).toBe('in_delivery');
  });

  it('stamps deposit_paid_at only on the first arrival of cash', async () => {
    const { pool, queries } = stubPool({ engagement: engagementRow({ status: 'accepted' }) });
    await change.execute(ctx(pool, { params: { status: 'deposit_paid' } }).args);
    const update = queries.find((q) => /UPDATE gps_engagement/.test(q.sql))!;
    expect(update.sql).toMatch(/COALESCE\(deposit_paid_at, now\(\)\)/);
    // Optimistic concurrency: the transition was decided against this status.
    expect(update.sql).toMatch(/WHERE id = \$2 AND status = \$3/);
    expect(update.params).toEqual(['deposit_paid', ENGAGEMENT_ID, 'accepted']);
  });

  it('refuses to move a terminal engagement at all', async () => {
    for (const status of ['collected', 'closed_lost', 'cancelled']) {
      const { pool } = stubPool({ engagement: engagementRow({ status }) });
      const err = await failsWith(change.execute(ctx(pool, { params: { status: 'in_delivery' } }).args));
      expect(err.code, status).toBe('TERMINAL');
    }
  });

  it('refuses on a missing engagement rather than reporting success', async () => {
    const { pool } = stubPool({ engagement: null });
    const err = await failsWith(change.execute(ctx(pool, { params: { status: 'conflict_pending' } }).args));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
  });
});

/* ─────────────── ABSENCE: no client artifact intake exists ────────────────── */

describe('no action accepts client material (Phase 1 ratchet, D2 unanswered)', () => {
  /**
   * Phase 1 must be PHYSICALLY incapable of accepting a client document, because
   * whether LCX legal/DPO accepts third-party confidential material on LCX
   * infrastructure — controller vs processor, the subprocessor chain, retention,
   * erasure — is unanswered (plan §2, §3 D2, §4 S0.4). 0047_gps.sql creates no
   * artifact column; this asserts the API's action surface gives one nowhere to
   * come from. A param named `attachmentUrl` would be the first step in defeating
   * it, and it would look like a small convenience.
   */
  const FORBIDDEN = /file|upload|attach|document|artifact|blob|bucket|storage|url|uri|href|link|path|filename|mime|base64/i;

  it.each(GPS_ACTIONS.map((a) => [a.id, a] as const))('%s has no intake-shaped param', (_id, a) => {
    const schema = z.toJSONSchema(a.paramsSchema) as { properties?: Record<string, unknown> };
    for (const key of Object.keys(schema.properties ?? {})) {
      expect(FORBIDDEN.test(key), `param '${key}' on ${a.id} is intake-shaped`).toBe(false);
    }
  });

  it.each(GPS_ACTIONS.map((a) => [a.id, a] as const))('%s writes no intake-shaped column', (_id, a) => {
    // The other half: a param could be renamed innocently and still be written to
    // a storage column. Neither exists.
    const source = codeOnly(a.execute);
    for (const column of ['artifact', 'attachment', 'document_url', 'file_path', 'storage_key']) {
      expect(source.includes(column), `${a.id} references ${column}`).toBe(false);
    }
  });

  it('freezes scope from the catalogue, never from caller-supplied text', async () => {
    // scope_snapshot is jsonb and is the one place client-authored prose could be
    // smuggled into the database. Every field of it comes from getOffer().
    const { pool, queries } = stubPool({ conflict: { decision: 'cleared' } });
    await byId('gps_proposal_issue').execute(
      ctx(pool, {
        params: {
          priceCents: 2_000_000,
          // Unknown keys are stripped by z.object before an executor ever sees
          // them (this call bypasses validation, which makes the point stronger:
          // even handed straight to the executor, they reach nothing).
          inclusions: ['whatever the client asked for'],
          exclusions: [],
        },
      }).args,
    );
    const snapshot = JSON.parse(String(queries.find((q) => /UPDATE gps_engagement/.test(q.sql))!.params[4]));
    expect(snapshot.inclusions).not.toContain('whatever the client asked for');
    expect(snapshot.exclusions.length).toBeGreaterThan(3);
  });
});

/* ───────────────────────────── the wiring ────────────────────────────────── */

describe('the actions are actually reachable', () => {
  /**
   * An exported array nobody spreads into ACTION_REGISTRY is a dead export: no
   * route can invoke it, it is absent from the generated command grammar, and
   * every gate in this file guards nothing. This asserts the wiring in
   * `../actions/registry.ts` exists — it FAILS until that change lands, which is
   * the intent: an unwired governed action should not pass CI quietly.
   */
  it('every GPS action is registered under its own id', async () => {
    const { ACTION_REGISTRY } = await import('../../actions/registry.js');
    for (const a of GPS_ACTIONS) {
      expect(ACTION_REGISTRY[a.id], `${a.id} is not wired into ACTION_REGISTRY`).toBeDefined();
      expect(ACTION_REGISTRY[a.id]?.id).toBe(a.id);
      // The registry must not re-declare a weaker permission than the action does.
      expect(ACTION_REGISTRY[a.id]?.minRole).toBe(a.minRole);
      expect(ACTION_REGISTRY[a.id]?.workspace).toBe('gps');
    }
  });
});
