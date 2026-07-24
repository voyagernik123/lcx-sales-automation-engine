import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb, getPool } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

const TEST_KEY = 'dev-operator-key-change-me';
const PASS = 'test#1234';
const nik = { Authorization: `Bearer nik@lcx.com:${PASS}` };
const sam = { Authorization: `Bearer sam@lcx.com:${PASS}` };

/**
 * LCX OS fabric (Phase 1 + front-door hardening 2026-07-24): the passcode
 * gate, the compartment gates end to end, the full-desk covenant, machine
 * passage, and the governed access actions. DB-agnostic where possible: the
 * fail-open loader serves the identical full-desk picture pre-0042.
 */
describe('LCX OS front door + workspace gates', () => {
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

  it('rejects a bare email — the desk is passcode-gated now', async () => {
    const res = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer nik@lcx.com' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong passcode and a departed member alike', async () => {
    const wrong = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer nik@lcx.com:hunter2' },
    });
    expect(wrong.status).toBe(401);
    const departed = await app.request('/v1/me', {
      headers: { Authorization: `Bearer jatin@lcx.com:${PASS}` },
    });
    expect(departed.status).toBe(401);
  });

  it('admits email:passcode with the real role attached', async () => {
    const res = await app.request('/v1/me', { headers: nik });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; role: string; entitlements: Record<string, string> } };
    expect(data.id).toBe('nik');
    expect(data.role).toBe('approver');
    expect(data.entitlements.distribution).toBeDefined();
  });

  it('honors the full-desk covenant: sam holds every compartment', async () => {
    const res = await app.request('/v1/access/me', { headers: sam });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { memberId: string; entitlements: Record<string, string>; workspaces: Array<{ id: string }> } };
    expect(data.memberId).toBe('sam');
    expect(data.workspaces).toHaveLength(6);
    for (const ws of ['command', 'sales', 'intel', 'regulatory', 'distribution', 'governance']) {
      expect(data.entitlements[ws], ws).toBe('operate');
    }
  });

  it('enforces revocation end to end (revoke → 403 shape → restore)', async () => {
    // Only meaningful with 0042 applied — skip cleanly pre-migration.
    const pool = getPool();
    try {
      await pool.query(`SELECT 1 FROM entitlements LIMIT 1`);
    } catch {
      return; // table absent: fail-open world, revocation not yet storable
    }
    try {
      await pool.query(`DELETE FROM entitlements WHERE member_id='sam' AND workspace='distribution'`);
      invalidateEntitlements('sam');
      const res = await app.request('/v1/distribution/anything', { headers: sam });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string; workspace: string; needed: string };
      expect(body.code).toBe('WORKSPACE_FORBIDDEN');
      expect(body.workspace).toBe('distribution');
      expect(body.needed).toBe('view');
    } finally {
      await pool.query(
        `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
         VALUES ('sam','distribution','operate','test-restore','access.test restore')
         ON CONFLICT (member_id, workspace) DO UPDATE SET capability='operate'`,
      );
      invalidateEntitlements('sam');
    }
  });

  it('lets machines (shared key) through every gate at operate-tier', async () => {
    const res = await app.request('/v1/distribution/anything', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(404); // through the gate; Phase 3 brings the routes
  });

  it('demands a real justification for access requests', async () => {
    const res = await app.request('/v1/access/requests', {
      method: 'POST',
      headers: { ...sam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'distribution', justification: 'pls' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION');
  });

  it('keeps the governed access actions approver-only (grant as operator → 403)', async () => {
    const res = await app.request('/v1/actions/grant_entitlement/invoke', {
      method: 'POST',
      headers: { ...sam, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'member', subjectId: 'monty',
        params: { workspace: 'distribution', capability: 'view', justification: 'test escalation attempt' },
      }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses self-lockout: an approver cannot revoke their own governance access', async () => {
    const res = await app.request('/v1/actions/revoke_entitlement/invoke', {
      method: 'POST',
      headers: { ...nik, 'Content-Type': 'application/json' },
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
