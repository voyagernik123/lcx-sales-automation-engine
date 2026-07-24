import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb, getPool } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { workspaceForApiPath } from '@lcx/shared';

/**
 * LCX ONE Phase 2 — compartment proofs (the red-team pass).
 *
 * These tests attack the fabric the way an adversary would: escalate
 * privilege, slip past a compartment gate on a lookalike path, forge a
 * step-up, read what you shouldn't, and abuse the machine key. Every one must
 * be refused. This suite is a permanent part of the gate — if a future change
 * opens any of these doors, CI goes red.
 *
 * DB-agnostic: the fail-open loader serves the full-desk picture pre-0042, so
 * the roster (nik/monty approvers, sam operator) reasons identically here.
 */
const KEY = 'dev-operator-key-change-me';
const PASS = 'test#1234';
const nik = { Authorization: `Bearer nik@lcx.com:${PASS}` };   // approver
const sam = { Authorization: `Bearer sam@lcx.com:${PASS}` };   // operator
const machine = { Authorization: `Bearer ${KEY}` };
const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });

describe('LCX OS red-team: compartment proofs', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = KEY;
    process.env.DESK_PASSCODE = PASS;
    invalidateEntitlements();
  });
  afterAll(async () => { await closeDb(); });

  describe('privilege escalation', () => {
    it('blocks an operator from every governed access action', async () => {
      for (const [action, subjectType, subjectId, params] of [
        ['grant_entitlement', 'member', 'monty', { workspace: 'distribution', capability: 'approve', justification: 'escalation attempt via grant' }],
        ['revoke_entitlement', 'member', 'monty', { workspace: 'command', justification: 'escalation via revoke', stepUpPasscode: PASS }],
        ['set_member_profile', 'member', 'monty', { unit: 'Hijack' }],
      ] as const) {
        const res = await app.request(`/v1/actions/${action}/invoke`, {
          method: 'POST', headers: json(sam),
          body: JSON.stringify({ subjectType, subjectId, params }),
        });
        expect(res.status, action).toBe(403);
      }
    });

    it('does not let an operator self-grant approve by editing their own row', async () => {
      const res = await app.request('/v1/actions/grant_entitlement/invoke', {
        method: 'POST', headers: json(sam),
        body: JSON.stringify({ subjectType: 'member', subjectId: 'sam', params: { workspace: 'governance', capability: 'approve', justification: 'self escalation' } }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('step-up cannot be forged', () => {
    it('rejects a revoke with a wrong step-up passcode (approver, real target)', async () => {
      const res = await app.request('/v1/actions/revoke_entitlement/invoke', {
        method: 'POST', headers: json(nik),
        body: JSON.stringify({ subjectType: 'member', subjectId: 'sam', params: { workspace: 'command', justification: 'test', stepUpPasscode: 'not-the-passcode' } }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('STEP_UP_REQUIRED');
    });

    it('rejects a revoke that omits the step-up entirely (schema)', async () => {
      const res = await app.request('/v1/actions/revoke_entitlement/invoke', {
        method: 'POST', headers: json(nik),
        body: JSON.stringify({ subjectType: 'member', subjectId: 'sam', params: { workspace: 'command', justification: 'test' } }),
      });
      expect(res.status).toBe(400); // VALIDATION — stepUpPasscode required
    });
  });

  describe('compartment gate cannot be bypassed by path tricks', () => {
    it('maps only segment-exact API prefixes to a workspace', () => {
      expect(workspaceForApiPath('/v1/command')).toBe('command');
      expect(workspaceForApiPath('/v1/command/x')).toBe('command');
      expect(workspaceForApiPath('/v1/commander')).toBeNull();     // lookalike
      expect(workspaceForApiPath('/v1/command-x')).toBeNull();     // hyphen splice
      expect(workspaceForApiPath('/v1/COMMAND')).toBeNull();       // case
    });

    it('401s at the gate before anything downstream sees an anonymous request', async () => {
      const res = await app.request('/v1/distribution/whatever');
      expect(res.status).toBe(401);
    });

    it('rejects a bare email — a leaked address is not a credential', async () => {
      const res = await app.request('/v1/me', { headers: { Authorization: 'Bearer nik@lcx.com' } });
      expect(res.status).toBe(401);
    });
  });

  describe('purpose-based reads', () => {
    it('refuses a member dossier read with no purpose (428)', async () => {
      const res = await app.request('/v1/access/members/sam', { headers: nik });
      expect(res.status).toBe(428);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('PURPOSE_REQUIRED');
    });

    it('refuses a thin purpose (< 8 chars)', async () => {
      const res = await app.request('/v1/access/members/sam', { headers: { ...nik, 'X-Purpose': 'audit' } });
      expect(res.status).toBe(428);
    });

    it('keeps the dossier + activity approver-only (operator → 403)', async () => {
      const dossier = await app.request('/v1/access/members/nik', { headers: { ...sam, 'X-Purpose': 'operator trying to read up' } });
      expect(dossier.status).toBe(403);
      const activity = await app.request('/v1/access/activity', { headers: sam });
      expect(activity.status).toBe(403);
    });
  });

  describe('machine key scope', () => {
    it('passes compartment gates (operate) but never reaches approver-only reads', async () => {
      // Through the workspace gate: 404 (no distribution route yet), not 403.
      const gate = await app.request('/v1/distribution/whatever', { headers: machine });
      expect(gate.status).toBe(404);
      // But the shared key is a plain operator — approver-only surfaces refuse it.
      const activity = await app.request('/v1/access/activity', { headers: machine });
      expect(activity.status).toBe(403);
    });

    it('cannot invoke an approver-only governed action', async () => {
      const res = await app.request('/v1/actions/grant_entitlement/invoke', {
        method: 'POST', headers: json(machine),
        body: JSON.stringify({ subjectType: 'member', subjectId: 'sam', params: { workspace: 'distribution', capability: 'view', justification: 'machine escalation' } }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('IDOR / request integrity', () => {
    it('rejects an access request without a substantive justification', async () => {
      const res = await app.request('/v1/access/requests', {
        method: 'POST', headers: json(sam),
        body: JSON.stringify({ workspace: 'distribution', justification: 'x' }),
      });
      expect(res.status).toBe(400);
    });

    it('does not leak other members’ pending requests to a non-approver', async () => {
      // Only meaningful with 0042 applied; skip cleanly in the fail-open world.
      const pool = getPool();
      try { await pool.query(`SELECT 1 FROM access_requests LIMIT 1`); }
      catch { return; }
      // Seed a request owned by monty, then read as sam (operator).
      await pool.query(
        `INSERT INTO access_requests (member_id, workspace, capability, justification)
         VALUES ('monty','distribution','view','redteam idor probe seed')`,
      );
      try {
        const res = await app.request('/v1/access/requests', { headers: sam });
        expect(res.status).toBe(200);
        const { data } = (await res.json()) as { data: Array<{ member_id: string }> };
        expect(data.every((r) => r.member_id === 'sam'), 'operator saw another member’s requests').toBe(true);
      } finally {
        await pool.query(`DELETE FROM access_requests WHERE justification='redteam idor probe seed'`);
      }
    });
  });
});
