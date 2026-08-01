import { beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { WORKSPACES } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  AN APPROVER CAN GRANT TO A SECOND-TIER COLLEAGUE, AND CANNOT OVER-GRANT.
 * ══════════════════════════════════════════════════════════════════════════════
 *  The second-tier sign-in (`middleware/auth.ts`, `ext:<local>` for an @lcx.com
 *  address plus SECONDARY_PASSCODE) was fixed in three places — the request surface
 *  takes their request, `decide_access_request` writes the row by `req.member_id`
 *  with no roster check, `loadEntitlements` reads and caps it. `grant_entitlement`
 *  was the fourth place and it was missed: it began
 *
 *      if (!findMemberById(subjectId)) throw new ActionError('NOT_FOUND', …)
 *
 *  so the DIRECT grant an approver reaches for first answered 404 "No roster member"
 *  while the request→approve path for the same decision worked. One door open, one
 *  shut, for the same act.
 *
 *  THE OTHER HALF IS THE CEILING. `loadEntitlements` caps an `ext:` map AFTER reading
 *  it, so a stored `gps` or `approve` grant is honoured by nothing. Allowing the row
 *  to be written would tell an approver they had granted access that does not exist —
 *  worse than the 404. So the ceiling is enforced at grant time, by the same
 *  `secondTierMayHold` the request surface asks.
 */

const notify = vi.fn(async () => {});
vi.mock('../../notifications/service.js', () => ({
  notify: (...args: unknown[]) => notify(...(args as [])),
}));

const { ACTION_REGISTRY } = await import('../registry.js');
const { ActionError } = await import('../types.js');

const grant = ACTION_REGISTRY.grant_entitlement!;

const writes: Array<{ sql: string; params: unknown[] }> = [];
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    writes.push({ sql, params });
    return { rows: [], rowCount: 1 };
  },
} as unknown as pg.Pool;

function run(subjectId: string, workspace: string, capability = 'view') {
  return grant.execute({
    pool,
    subjectType: 'member',
    subjectId,
    params: { workspace, capability, justification: 'covering the MiCA filing this week' },
    actor: 'nik',
    role: 'approver',
    markGateDegraded: () => {},
  });
}

const EXT = 'ext:priya';
const ELEVATED = WORKSPACES.filter((w) => w.sensitivity === 'elevated').map((w) => w.id);
const STANDARD = WORKSPACES.filter((w) => w.sensitivity !== 'elevated').map((w) => w.id);

beforeEach(() => {
  writes.length = 0;
  notify.mockClear();
});

describe('grant_entitlement reaches a second-tier principal', () => {
  it('has both kinds of compartment to test with — otherwise this file is vacuous', () => {
    expect(ELEVATED.length).toBeGreaterThan(0);
    expect(STANDARD.length).toBeGreaterThan(0);
    expect(ELEVATED).toContain('gps');
  });

  it('writes the grant instead of answering 404 No roster member', async () => {
    const out = await run(EXT, STANDARD[0]!, 'view');
    expect(out).toEqual({ memberId: EXT, workspace: STANDARD[0], capability: 'view' });
    const insert = writes.find((w) => /INSERT INTO entitlements/.test(w.sql));
    expect(insert, 'no grant row was written').toBeTruthy();
    expect(insert!.params[0]).toBe(EXT);
  });

  it('grants operate, which is the tier a second-tier principal may actually hold', async () => {
    await run(EXT, STANDARD[0]!, 'operate');
    const insert = writes.find((w) => /INSERT INTO entitlements/.test(w.sql))!;
    expect(insert.params[2]).toBe('operate');
  });

  it('still refuses a principal who is neither a roster member nor second-tier', async () => {
    // The 404 has to survive for everyone else, or this fix opened the grant table to
    // any string an approver types.
    for (const id of ['nobody', 'operator', 'ai', 'monitor:x', 'ext:', 'external:priya', '']) {
      await expect(run(id, STANDARD[0]!), id).rejects.toThrow(ActionError);
      await expect(run(id, STANDARD[0]!), id).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    expect(writes.filter((w) => /INSERT INTO entitlements/.test(w.sql))).toHaveLength(0);
  });
});

describe('the ceiling is refused at grant time, not clamped after it', () => {
  it('refuses every elevated compartment, so no ungrantable row is ever stored', async () => {
    for (const ws of ELEVATED) {
      await expect(run(EXT, ws), ws).rejects.toMatchObject({ code: 'SECOND_TIER_FORBIDDEN', status: 403 });
    }
    // THE property: nothing was written. A stored row that `loadEntitlements` then
    // drops is an approver believing they granted something that does nothing.
    expect(writes.filter((w) => /INSERT INTO entitlements/.test(w.sql))).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses an approve-tier grant, because auth.ts pins the role to operator', async () => {
    await expect(run(EXT, STANDARD[0]!, 'approve')).rejects.toMatchObject({
      code: 'SECOND_TIER_FORBIDDEN',
      status: 403,
    });
    expect(writes.filter((w) => /INSERT INTO entitlements/.test(w.sql))).toHaveLength(0);
  });

  it('applies neither bound to a real roster member', async () => {
    // A named person on the roster may hold gps at approve. The ceiling is about the
    // shared passcode, not about compartments being unreachable.
    await run('nik', 'gps', 'approve');
    const insert = writes.find((w) => /INSERT INTO entitlements/.test(w.sql))!;
    expect(insert.params[0]).toBe('nik');
    expect(insert.params[1]).toBe('gps');
    expect(insert.params[2]).toBe('approve');
  });

  it('asks the same function the request surface asks, so the two cannot disagree', async () => {
    // Behavioural, not a source grep: for every workspace, the grant and the request
    // surface must agree on whether a second-tier principal may hold it. `sensitivity`
    // is the single fact both read through `secondTierMayHold`.
    const { secondTierMayHold } = await import('../../access/entitlements.js');
    for (const w of WORKSPACES) {
      const granted = await run(EXT, w.id).then(() => true).catch(() => false);
      expect(granted, `${w.id} (${w.sensitivity})`).toBe(secondTierMayHold(w.id));
    }
  });
});
