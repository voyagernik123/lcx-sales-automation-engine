import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

const TEST_KEY = 'dev-operator-key-change-me';

/**
 * LCX OS fabric (Phase 1) — the compartment gates, end to end through the app:
 * need-to-know 403s, the no-lockout covenant, machine passage, and the
 * governed access actions' role gate. DB-agnostic by design: with 0042 applied
 * these run against real entitlements; without it the fail-open loader serves
 * the identical legacy picture — the covenant IS the test.
 */
describe('LCX OS workspace gates', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = TEST_KEY;
    invalidateEntitlements();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('401s an anonymous request at the gate itself', async () => {
    const res = await app.request('/v1/command/overview');
    expect(res.status).toBe(401);
  });

  it('default-denies the new distribution compartment to operators (403 + structured shape)', async () => {
    const res = await app.request('/v1/distribution/anything', {
      headers: { Authorization: 'Bearer jatin@lcx.com' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; workspace: string; needed: string };
    expect(body.code).toBe('WORKSPACE_FORBIDDEN');
    expect(body.workspace).toBe('distribution');
    expect(body.needed).toBe('view');
  });

  it('admits approvers to the new compartment (gate passes → 404, no route yet)', async () => {
    const res = await app.request('/v1/distribution/anything', {
      headers: { Authorization: 'Bearer nik@lcx.com' },
    });
    expect(res.status).toBe(404); // the gate said yes; Phase 3 brings the routes
  });

  it('honors the no-lockout covenant: operators keep every legacy workspace', async () => {
    for (const path of ['/v1/command/overview', '/v1/wbr', '/v1/kpis']) {
      const res = await app.request(path, { headers: { Authorization: 'Bearer jatin@lcx.com' } });
      expect(res.status, path).not.toBe(403);
    }
  });

  it('lets machines (shared key) through every gate at operate-tier', async () => {
    const res = await app.request('/v1/distribution/anything', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(404); // through the gate, no route to serve
  });

  it('exposes the constitution + my entitlements on /v1/access/me', async () => {
    const res = await app.request('/v1/access/me', {
      headers: { Authorization: 'Bearer jatin@lcx.com' },
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { memberId: string; entitlements: Record<string, string>; workspaces: Array<{ id: string }> };
    };
    expect(data.memberId).toBe('jatin');
    expect(data.workspaces).toHaveLength(6);
    expect(data.entitlements.distribution).toBeUndefined();
    expect(data.entitlements.sales).toBeDefined();
  });

  it('demands a real justification for access requests', async () => {
    const res = await app.request('/v1/access/requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer jatin@lcx.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'distribution', justification: 'pls' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION');
  });

  it('keeps the governed access actions approver-only (grant as operator → 403)', async () => {
    const res = await app.request('/v1/actions/grant_entitlement/invoke', {
      method: 'POST',
      headers: { Authorization: 'Bearer jatin@lcx.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'member', subjectId: 'sam',
        params: { workspace: 'distribution', capability: 'view', justification: 'test escalation attempt' },
      }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses self-lockout: an approver cannot revoke their own governance access', async () => {
    const res = await app.request('/v1/actions/revoke_entitlement/invoke', {
      method: 'POST',
      headers: { Authorization: 'Bearer nik@lcx.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'member', subjectId: 'nik',
        params: { workspace: 'governance', justification: 'sawing off the branch' },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SELF_LOCKOUT');
  });
});
