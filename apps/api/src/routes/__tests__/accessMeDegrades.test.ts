import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * "LOGIN ISSUE AND API DOWN" — and it was one unguarded `await`.
 *
 * `GET /v1/access/me` is the whole login path: `useAccessStore.load()` calls it and nothing
 * else to establish who the operator is. It began with
 *
 *     const entitlements = await loadEntitlements(pool, operator.id)
 *
 * with no try/catch. `entitlements.ts` deliberately propagates any database error that is not
 * `42P01` — correct, because a broken database must not silently grant access — so on
 * 2026-08-10, with Postgres unreachable and the driver returning `ENETUNREACH`, this route
 * returned 500. The client's `me` stayed null, `useMyWorkspaces()` returned `[]`, and the
 * operator signed in successfully and landed on an EMPTY workspace launcher with every panel
 * erroring.
 *
 * AUTHENTICATION NEVER TOUCHES THE DATABASE — the roster is a compiled constant and the
 * passcode comparison is in middleware. Identity, role and the workspace constitution were
 * all available the entire time. This is the liveness/readiness mistake from `health.ts` one
 * layer up: a degraded answer turned into no answer.
 *
 * The fix must hold two things at once, and both are asserted below: the route answers, AND
 * it grants nothing it cannot verify.
 */

const loadEntitlements = vi.hoisted(() => vi.fn());
vi.mock('../../access/entitlements.js', () => ({
  loadEntitlements,
  isSecondTierPrincipal: () => false,
  secondTierMayHold: () => true,
  invalidateEntitlements: () => undefined,
}));

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  checkDb: vi.fn(async () => 'down'),
  getLastDbError: vi.fn(() => null),
  closeDb: vi.fn(async () => undefined),
}));

vi.mock('../../notifications/service.js', () => ({ notify: vi.fn(async () => undefined) }));

const AUTH = { Authorization: 'Bearer nik@lcx.com:test#1234' };
const load = async () => (await import('../access.js')).accessRoutes;

/** What an unreachable Postgres actually looks like to `pg`. */
const unreachable = () => Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });

beforeEach(() => {
  vi.resetModules();
  loadEntitlements.mockReset();
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the login path survives an unreachable database', () => {
  it('GET /me is 200 when the grants cannot be read — THE ASSERTION THAT WOULD HAVE CAUGHT IT', async () => {
    loadEntitlements.mockRejectedValue(unreachable());
    const res = await (await load()).request('/me', { headers: AUTH });
    expect(res.status).toBe(200);
  });

  it('and identity is intact, because identity never needed the database', async () => {
    loadEntitlements.mockRejectedValue(unreachable());
    const body = await (await (await load()).request('/me', { headers: AUTH })).json();
    expect(body.data.memberId).toBeTruthy();
    expect(['operator', 'approver']).toContain(body.data.role);
    // The workspace constitution is compiled into @lcx/shared, not queried.
    expect(body.data.workspaces.length).toBeGreaterThan(0);
  });

  it('GRANTS NOTHING IT CANNOT VERIFY — the map is empty, never legacy and never full', async () => {
    /*
     * The security half of the fix, and the half a careless repair would break. `loadEntitlements`
     * has a deliberate narrow fail-OPEN for a missing table (pre-0042 deploy order). A broken
     * DATABASE must not reuse it: that would hand every compartment to whoever signed in during
     * an outage.
     */
    loadEntitlements.mockRejectedValue(unreachable());
    const body = await (await (await load()).request('/me', { headers: AUTH })).json();
    expect(body.data.entitlements).toEqual({});
  });

  it('says the grants are UNKNOWN rather than letting empty be read as none', async () => {
    // Three states, never collapsed. `{}` on its own is a definite claim ("you hold nothing")
    // that the server is in no position to make.
    loadEntitlements.mockRejectedValue(unreachable());
    const body = await (await (await load()).request('/me', { headers: AUTH })).json();
    expect(body.data.entitlementsUnavailable.code).toBe('ENETUNREACH');
    expect(body.data.entitlementsUnavailable.reason).toMatch(/unreachable/i);
  });

  it('reports dbLive false — it used to report TRUE with the database unreachable', async () => {
    /*
     * `dbLive` only ever meant "the 0042 tables exist": only `42P01` set it false and every
     * other error rethrew. So a field named "is the database live" answered TRUE precisely
     * when it was not, and every client reading it was misled exactly when it mattered.
     */
    loadEntitlements.mockRejectedValue(unreachable());
    const body = await (await (await load()).request('/me', { headers: AUTH })).json();
    expect(body.data.dbLive).toBe(false);
  });

  it('does not 500 when only the PROFILE query fails', async () => {
    // The profile is one of four fields. Losing it must not cost the other three.
    loadEntitlements.mockResolvedValue({ sales: 'operate' });
    query.mockRejectedValue(unreachable());
    const res = await (await load()).request('/me', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profile).toBeNull();
    expect(body.data.entitlements).toEqual({ sales: 'operate' });
    expect(body.data.dbLive).toBe(false);
  });
});

describe('and it stays quiet when nothing is wrong', () => {
  it('omits entitlementsUnavailable entirely on a healthy read', async () => {
    loadEntitlements.mockResolvedValue({ sales: 'operate', command: 'view' });
    const body = await (await (await load()).request('/me', { headers: AUTH })).json();
    expect(body.data.entitlementsUnavailable).toBeUndefined();
    expect(body.data.dbLive).toBe(true);
    expect(body.data.entitlements).toEqual({ sales: 'operate', command: 'view' });
  });

  it('still refuses an unauthenticated request — none of this loosened the gate', async () => {
    loadEntitlements.mockRejectedValue(unreachable());
    expect((await (await load()).request('/me')).status).toBe(401);
  });

  it('still refuses a wrong passcode', async () => {
    loadEntitlements.mockRejectedValue(unreachable());
    const res = await (await load()).request('/me', {
      headers: { Authorization: 'Bearer nik@lcx.com:wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('LEAKS NOTHING — the degraded body carries no host, address or connection string', async () => {
    loadEntitlements.mockRejectedValue(
      Object.assign(new Error('connect ENETUNREACH 2a05:d014:1e9b:b301::1:5432'), { code: 'ENETUNREACH' }),
    );
    const raw = await (await (await load()).request('/me', { headers: AUTH })).text();
    // Only the CODE crosses the boundary. The driver's message is not echoed.
    expect(raw).not.toContain('2a05');
    expect(raw).not.toContain('5432');
  });
});
