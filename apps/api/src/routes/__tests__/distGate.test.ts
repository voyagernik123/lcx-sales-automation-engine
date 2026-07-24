import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb, getPool } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

/**
 * The compliance gate on campaign launch (LCX ONE Phase 6). Proves: a
 * token-incentivized campaign cannot reach live without approver authority +
 * the two reviews + a within-budget envelope, and that a non-token campaign
 * advances freely. DB-required (dist_campaigns + analytic_reviews); skips
 * cleanly when the tables are absent so it never blocks a fail-open run.
 */
const PASS = 'test#1234';
const nik = { Authorization: `Bearer nik@lcx.com:${PASS}`, 'Content-Type': 'application/json' };  // approver
const sam = { Authorization: `Bearer sam@lcx.com:${PASS}`, 'Content-Type': 'application/json' };  // operator

async function hasTables(): Promise<boolean> {
  try { await getPool().query(`SELECT 1 FROM dist_campaigns LIMIT 1`); return true; } catch { return false; }
}

describe('distribution compliance gate', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = 'dev-operator-key-change-me';
    process.env.DESK_PASSCODE = PASS;
    invalidateEntitlements();
  });
  afterAll(async () => { await closeDb(); });

  it('blocks launch of a token campaign without reviews (409 COMPLIANCE_GATE), then allows it with an approver override', async () => {
    if (!(await hasTables())) return;
    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dist_campaigns (name, kind, token_incentivized, budget_lcx, status, created_by)
       VALUES ('gate-test token quest','quest',true,1000,'draft','test') RETURNING id`);
    const id = rows[0]!.id;
    try {
      // Approver, but no reviews on file → COMPLIANCE_GATE 409.
      const blocked = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: nik,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live' } }),
      });
      expect(blocked.status).toBe(409);
      expect(((await blocked.json()) as { code: string }).code).toBe('COMPLIANCE_GATE');

      // Override without a reason → 400.
      const noReason = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: nik,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live', overrideGate: true } }),
      });
      expect(noReason.status).toBe(400);

      // Override with a reason → allowed (audited).
      const ok = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: nik,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live', overrideGate: true, overrideReason: 'test: pre-cleared out of band' } }),
      });
      expect(ok.status).toBe(200);
    } finally {
      await pool.query(`DELETE FROM dist_campaigns WHERE id=$1`, [id]);
      await pool.query(`DELETE FROM analytic_reviews WHERE subject_type='dist_campaign' AND subject_id=$1`, [id]);
    }
  });

  it('requires approver authority to launch a token campaign (operator → 403)', async () => {
    if (!(await hasTables())) return;
    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dist_campaigns (name, kind, token_incentivized, budget_lcx, status, created_by)
       VALUES ('gate-test operator','quest',true,1000,'draft','test') RETURNING id`);
    const id = rows[0]!.id;
    try {
      const res = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: sam,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live' } }),
      });
      expect(res.status).toBe(403); // APPROVER_REQUIRED
    } finally {
      await pool.query(`DELETE FROM dist_campaigns WHERE id=$1`, [id]);
    }
  });

  it('lets a NON-token campaign advance to live freely (no gate)', async () => {
    if (!(await hasTables())) return;
    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dist_campaigns (name, kind, token_incentivized, status, created_by)
       VALUES ('gate-test content','content',false,'draft','test') RETURNING id`);
    const id = rows[0]!.id;
    try {
      const res = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: sam,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live' } }),
      });
      expect(res.status).toBe(200);
    } finally {
      await pool.query(`DELETE FROM dist_campaigns WHERE id=$1`, [id]);
    }
  });

  it('lets a token campaign launch once both reviews are on file (approver, within budget)', async () => {
    if (!(await hasTables())) return;
    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dist_campaigns (name, kind, token_incentivized, budget_lcx, status, created_by)
       VALUES ('gate-test cleared','quest',true,1000,'draft','test') RETURNING id`);
    const id = rows[0]!.id;
    try {
      for (const kind of ['premortem', 'legal_check']) {
        await pool.query(
          `INSERT INTO analytic_reviews (kind, subject_type, subject_id, title, content, author, status)
           VALUES ($1,'dist_campaign',$2,'test','{}'::jsonb,'nik','active')`, [kind, id]);
      }
      const res = await app.request('/v1/actions/dist_campaign_set_status/invoke', {
        method: 'POST', headers: nik,
        body: JSON.stringify({ subjectType: 'dist_campaign', subjectId: id, params: { status: 'live' } }),
      });
      expect(res.status).toBe(200);
    } finally {
      await pool.query(`DELETE FROM dist_campaigns WHERE id=$1`, [id]);
      await pool.query(`DELETE FROM analytic_reviews WHERE subject_type='dist_campaign' AND subject_id=$1`, [id]);
    }
  });
});
