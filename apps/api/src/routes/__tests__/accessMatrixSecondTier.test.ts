import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEAM } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ACCESS YOU CANNOT SEE IS ACCESS YOU CANNOT REVIEW OR REVOKE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `GET /v1/access/matrix` is the one screen an approver uses to answer "who holds
 *  what". It built its answer as `TEAM.map(...)`, so every entitlement row whose
 *  `member_id` is not one of the three roster ids was SELECTed out of the database and
 *  then silently dropped on the next line.
 *
 *  That became a hole the moment the second-tier sign-in started working end to end: an
 *  `ext:<local>` colleague can file a request, an approver can approve it,
 *  `decide_access_request` writes the row keyed by `req.member_id`, and
 *  `loadEntitlements` honours it. So a live grant existed that the governance surface
 *  did not show — the approver could only find it by reading `GET /requests` and
 *  remembering what they had clicked.
 *
 *  What this does NOT do is invent an identity. A second-tier principal has no name, no
 *  email and no roster role, so they are a SEPARATE list rather than a synthetic TEAM
 *  entry; putting a fabricated name in the grid would make the matrix look like it knows
 *  who signed in, and the honest limit of a shared passcode is that it does not.
 */

const rows: Array<{
  member_id: string; workspace: string; capability: string;
  granted_by: string; justification: string | null; granted_at: string;
}> = [];
let missingTable = false;

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (missingTable) {
        throw Object.assign(new Error('relation "entitlements" does not exist'), { code: '42P01' });
      }
      if (/FROM entitlements/.test(sql)) return { rows, rowCount: rows.length };
      if (/FROM member_profiles/.test(sql)) return { rows: [], rowCount: 0 };
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
  }),
  getDb: () => { throw new Error('getDb is not used by the access matrix'); },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { createApp } = await import('../../app.js');

const PASS = 'test#1234';
const app = createApp();
/** Nik is an approver on the roster; `/matrix` is approver-only. */
const approver = { Authorization: `Bearer nik@lcx.com:${PASS}` };

interface Matrix {
  data: {
    members: Array<{ id: string; entitlements: unknown[] }>;
    secondTier: Array<{
      id: string; localPart: string; role: string;
      entitlements: Array<{ workspace: string; capability: string }>;
      limits: string;
    }>;
    dbLive: boolean;
  };
}

const grant = (member_id: string, workspace: string, capability: string) => ({
  member_id, workspace, capability,
  granted_by: 'nik', justification: 'covering the filing', granted_at: '2026-07-30T00:00:00.000Z',
});

const matrix = async (): Promise<Matrix> => {
  const res = await app.request('/v1/access/matrix', { headers: approver });
  expect(res.status).toBe(200);
  return (await res.json()) as Matrix;
};

beforeAll(() => {
  process.env.ALLOW_DB_SKIP = 'true';
  process.env.DESK_PASSCODE = PASS;
});
afterAll(() => {
  delete process.env.DESK_PASSCODE;
});
beforeEach(() => {
  rows.length = 0;
  missingTable = false;
});

describe('the matrix shows second-tier grants', () => {
  it('still shows the roster, so nothing that worked has stopped', async () => {
    rows.push(grant('nik', 'gps', 'approve'));
    const body = await matrix();
    expect(body.data.members.map((m) => m.id)).toEqual(TEAM.map((m) => m.id));
    expect(body.data.members.find((m) => m.id === 'nik')!.entitlements).toHaveLength(1);
  });

  it('surfaces an ext: holder that the TEAM.map dropped', async () => {
    rows.push(grant('ext:priya', 'sales', 'operate'));
    const body = await matrix();
    // The regression, stated as the assertion: this was [] while the grant was live.
    expect(body.data.secondTier).toHaveLength(1);
    const [p] = body.data.secondTier;
    expect(p!.id).toBe('ext:priya');
    expect(p!.localPart).toBe('priya');
    expect(p!.entitlements).toEqual([expect.objectContaining({ workspace: 'sales', capability: 'operate' })]);
  });

  it('groups every grant a colleague holds under one entry, sorted and deduplicated', async () => {
    rows.push(grant('ext:priya', 'sales', 'operate'));
    rows.push(grant('ext:priya', 'marketing', 'view'));
    rows.push(grant('ext:anders', 'sales', 'view'));
    rows.push(grant('nik', 'governance', 'approve'));
    const body = await matrix();
    expect(body.data.secondTier.map((s) => s.id)).toEqual(['ext:anders', 'ext:priya']);
    expect(body.data.secondTier.find((s) => s.id === 'ext:priya')!.entitlements).toHaveLength(2);
  });

  it('states the limit, so a reader does not mistake the row for the effective grant', async () => {
    // `loadEntitlements` caps an ext: map AFTER reading it. A matrix that showed the row
    // without saying so would report access the principal does not actually have.
    rows.push(grant('ext:priya', 'sales', 'operate'));
    const [p] = (await matrix()).data.secondTier;
    expect(p!.role).toBe('operator');
    expect(p!.limits).toMatch(/not an attributable/);
    expect(p!.limits).toMatch(/entitlements\.ts/);
  });

  it('is empty when nobody outside the roster holds anything', async () => {
    // Non-vacuity in the other direction: the list must not be populated by accident.
    rows.push(grant('nik', 'gps', 'approve'), grant('sam', 'sales', 'view'));
    expect((await matrix()).data.secondTier).toEqual([]);
  });

  it('degrades to an empty list pre-0042 rather than 500ing', async () => {
    missingTable = true;
    const body = await matrix();
    expect(body.data.dbLive).toBe(false);
    expect(body.data.secondTier).toEqual([]);
  });

  it('is still approver-only', async () => {
    rows.push(grant('ext:priya', 'sales', 'operate'));
    const res = await app.request('/v1/access/matrix', {
      headers: { Authorization: `Bearer sam@lcx.com:${PASS}` },
    });
    expect(res.status).toBe(403);
  });
});
