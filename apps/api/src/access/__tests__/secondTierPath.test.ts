import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { WORKSPACES, capAtLeast } from '@lcx/shared';
import {
  invalidateEntitlements,
  isSecondTierPrincipal,
  loadEntitlements,
  secondTierMayHold,
} from '../entitlements.js';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

/**
 * THE SECOND-TIER SIGN-IN WAS A DEAD END.
 *
 * `middleware/auth.ts` mints `ext:<local>` for any @lcx.com address plus
 * SECONDARY_PASSCODE — a feature Nik asked for by name (45990fa). After unknown
 * principals correctly stopped being classified as machines, that colleague:
 *
 *   1. held zero compartments, and
 *   2. `loadEntitlements` never even queried the grant table for them, so an
 *      approved request could not take effect, and
 *   3. `POST /v1/access/requests` refused them outright with NOT_A_MEMBER.
 *
 * Signed in successfully, could see nothing, could not ask — while
 * `middleware/workspace.ts` promises the 403 is "a request-access surface, never
 * a dead end". These tests pin the door open and pin its ceiling shut.
 */

const PASS = 'test#1234';
const SECOND = 'second#tier#1234';

/** A pool whose grant rows are swapped per test. */
let grantRows: Array<{ workspace: string; capability: string }> = [];
let missingTable = false;
const pool = {
  query: async () => {
    if (missingTable) throw Object.assign(new Error('relation "entitlements" does not exist'), { code: '42P01' });
    return { rows: grantRows, rowCount: grantRows.length };
  },
} as unknown as pg.Pool;

beforeEach(() => {
  grantRows = [];
  missingTable = false;
  invalidateEntitlements();
});

describe('an ext: principal is recognised as a person, not a machine', () => {
  it('identifies second-tier ids and nothing else', () => {
    expect(isSecondTierPrincipal('ext:someone')).toBe(true);
    for (const id of ['ext:', 'ext', 'external:x', 'operator', 'ai', 'monitor:x', 'nik', '']) {
      expect(isSecondTierPrincipal(id), id).toBe(false);
    }
  });
});

describe('a governed grant to a second-tier principal actually takes effect', () => {
  it('honours a grant row on a standard compartment', async () => {
    // Before the fix this returned {} — the query never ran, so `decide_access_request`
    // could write the row and the request path would still see nothing.
    grantRows = [{ workspace: 'sales', capability: 'view' }];
    expect(await loadEntitlements(pool, 'ext:someone')).toEqual({ sales: 'view' });
  });

  it('still gives an ungranted second-tier principal nothing', async () => {
    const ents = await loadEntitlements(pool, 'ext:someone');
    expect(ents).toEqual({});
    for (const ws of WORKSPACES) expect(capAtLeast(ents[ws.id], 'view'), ws.id).toBe(false);
  });

  it('drops EVERY elevated compartment even if a row exists in the database', async () => {
    const elevated = WORKSPACES.filter((w) => w.sensitivity === 'elevated');
    expect(elevated.length).toBeGreaterThan(0);
    grantRows = elevated.map((w) => ({ workspace: w.id, capability: 'operate' }));
    const ents = await loadEntitlements(pool, 'ext:someone');
    expect(ents).toEqual({});
    for (const w of elevated) expect(capAtLeast(ents[w.id], 'view'), w.id).toBe(false);
  });

  it('specifically never hands out gps or governance', async () => {
    // gps holds third-party client material; governance re-exposes GPS action
    // params verbatim through /v1/audit.
    grantRows = [
      { workspace: 'gps', capability: 'operate' },
      { workspace: 'governance', capability: 'approve' },
    ];
    const ents = await loadEntitlements(pool, 'ext:someone');
    expect(capAtLeast(ents.gps, 'view')).toBe(false);
    expect(capAtLeast(ents.governance, 'view')).toBe(false);
    expect(secondTierMayHold('gps')).toBe(false);
    expect(secondTierMayHold('governance')).toBe(false);
  });

  it('clamps approve to operate — auth.ts pins the role, this pins the capability', async () => {
    grantRows = [{ workspace: 'sales', capability: 'approve' }];
    const ents = await loadEntitlements(pool, 'ext:someone');
    expect(ents.sales).toBe('operate');
    for (const ws of WORKSPACES) expect(capAtLeast(ents[ws.id], 'approve'), ws.id).toBe(false);
  });

  it('does not fail open pre-0042 — the no-lockout covenant is for the founding desk', async () => {
    missingTable = true;
    expect(await loadEntitlements(pool, 'ext:someone')).toEqual({});
  });

  it('leaves the machine principals exactly as they were', async () => {
    grantRows = [{ workspace: 'gps', capability: 'operate' }];
    for (const id of ['operator', 'ai', 'monitor:token_risk']) {
      const ents = await loadEntitlements(pool, id);
      const expected = WORKSPACES.filter((w) => w.machineAccess).map((w) => w.id).sort();
      expect(Object.keys(ents).sort(), id).toEqual(expected);
      expect(capAtLeast(ents.gps, 'view'), id).toBe(false);
      invalidateEntitlements();
    }
  });
});

describe('POST /v1/access/requests: the door a second-tier colleague can knock on', () => {
  const app = createApp();
  const ext = { Authorization: `Bearer newperson@lcx.com:${SECOND}`, 'Content-Type': 'application/json' };
  const machine = { Authorization: 'Bearer dev-operator-key-change-me', 'Content-Type': 'application/json' };
  const ask = (headers: Record<string, string>, body: unknown) =>
    app.request('/v1/access/requests', { method: 'POST', headers, body: JSON.stringify(body) });

  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.DESK_PASSCODE = PASS;
    process.env.SECONDARY_PASSCODE = SECOND;
  });
  afterAll(async () => {
    delete process.env.SECONDARY_PASSCODE;
    await closeDb();
  });

  it('no longer refuses them as NOT_A_MEMBER', async () => {
    // Justification deliberately too short, so the assertion needs no database:
    // reaching VALIDATION proves the membership wall is gone.
    const res = await ask(ext, { workspace: 'sales', justification: 'short' });
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe('VALIDATION');
  });

  it('refuses an elevated compartment truthfully instead of banking an ungrantable request', async () => {
    for (const ws of WORKSPACES.filter((w) => w.sensitivity === 'elevated')) {
      const res = await ask(ext, { workspace: ws.id, justification: 'need this for the client work' });
      expect(res.status, ws.id).toBe(403);
      expect((await res.json() as { code: string }).code, ws.id).toBe('SECOND_TIER_FORBIDDEN');
    }
  });

  it('still refuses the machine key — machines do not negotiate access', async () => {
    const res = await ask(machine, { workspace: 'sales', justification: 'cron would like more' });
    expect(res.status).toBe(403);
    expect((await res.json() as { code: string }).code).toBe('NOT_A_MEMBER');
  });

  it('still requires a credential', async () => {
    const res = await app.request('/v1/access/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(res.status).toBe(401);
  });
});
