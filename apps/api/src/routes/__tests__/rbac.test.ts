/**
 * RBAC (Wave 7) — the API is now the authority on who may sign off a deal, not
 * the client. These lock in: (1) the principal carries the desk member's real
 * role, (2) approver-only actions reject operators + the shared key with 403,
 * and (3) the Ops observability endpoint returns its governance shape.
 * Runs against the local dev database (same convention as features.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

const TEST_KEY = 'dev-operator-key-change-me';
const FAKE_ID = '00000000-0000-0000-0000-000000000000';

const decide = (app: ReturnType<typeof createApp>, cred: string) =>
  app.request(`/v1/dealdesk/approvals/${FAKE_ID}/decide`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cred}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approved' }),
  });

describe('Wave 7 RBAC', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });
  afterAll(async () => {
    await closeDb();
  });

  describe('/v1/me carries the authoritative role', () => {
    it('shared API key authenticates as a plain operator (cannot approve)', async () => {
      const res = await app.request('/v1/me', { headers: { Authorization: `Bearer ${TEST_KEY}` } });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.role).toBe('operator');
      expect(data.canApprove).toBe(false);
    });

    it('an operator email resolves to operator, canApprove false', async () => {
      const res = await app.request('/v1/me', { headers: { Authorization: 'Bearer sam@lcx.com:test#1234' } });
      const { data } = await res.json();
      expect(data.role).toBe('operator');
      expect(data.canApprove).toBe(false);
      expect(data.member?.role).toBe('operator');
    });

    it('an approver email resolves to approver, canApprove true', async () => {
      const res = await app.request('/v1/me', { headers: { Authorization: 'Bearer nik@lcx.com:test#1234' } });
      const { data } = await res.json();
      expect(data.role).toBe('approver');
      expect(data.canApprove).toBe(true);
      expect(data.member?.role).toBe('approver');
    });
  });

  describe('deal sign-off is approver-only, enforced server-side', () => {
    it('rejects the shared operator key with 403', async () => {
      const res = await decide(app, TEST_KEY);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN_REQUIRES_APPROVER');
    });

    it('rejects an operator email with 403', async () => {
      const res = await decide(app, 'sam@lcx.com:test#1234');
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN_REQUIRES_APPROVER');
    });

    it('lets an approver through the gate (404 for a missing approval, not 403)', async () => {
      const res = await decide(app, 'nik@lcx.com:test#1234');
      expect(res.status).not.toBe(403);
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('NOT_FOUND');
    });
  });

  describe('/v1/intel/ops observability shape', () => {
    it('returns the governance panels', async () => {
      const res = await app.request('/v1/intel/ops', { headers: { Authorization: `Bearer ${TEST_KEY}` } });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.summary).toBeTruthy();
      expect(typeof data.summary.jobsTracked).toBe('number');
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(Array.isArray(data.freshness)).toBe(true);
      expect(Array.isArray(data.gaps)).toBe(true);
      expect(Array.isArray(data.compliance)).toBe(true);
      // Each connector's freshness lenses are disjoint (errored ≠ never-collected).
      for (const f of data.freshness) {
        expect(f.fresh + f.stale + f.errored + f.neverCollected).toBeLessThanOrEqual(f.tracked);
      }
    });
  });
});
