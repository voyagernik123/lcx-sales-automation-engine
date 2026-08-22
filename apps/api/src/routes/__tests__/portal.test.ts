import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { getOffer } from '@lcx/shared';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * THE CLIENT PLANE AT ITS BORDER (G4, doctrine D9). What these tests defend:
 *
 *  1. THE SESSION IS THE WHOLE AUTHORITY — no header, wrong header, expired and
 *     revoked each answer with their OWN code, and nothing else on the surface
 *     runs first.
 *  2. MINIMUM DISCLOSURE IS STRUCTURAL — the view never carries a milestone
 *     owner, and the blocked state carries its reason and no percent. Asserted on
 *     the serialised wire, not on intentions.
 *  3. ONE ACCEPTANCE DOOR — the client's accept reaches the SAME
 *     `acceptDeliverable` the desk uses, attributed 'portal:<label>', and a desk
 *     refusal passes through verbatim.
 *  4. THE UPLOAD DOOR IS SHUT BY A DECISION, NOT A TODO — three states off the
 *     dpo_memo packet decision, each with its sentence, and an intent event
 *     recorded either way.
 *  5. MINTING IS AN APPROVER ACT and the token appears exactly once: the INSERT
 *     carries a 64-hex digest that is NOT the token in the response.
 */

const acceptDeliverable = vi.hoisted(() => vi.fn());
vi.mock('../../gps/deliveryDesk.js', async (orig) => {
  const real = await orig<typeof import('../../gps/deliveryDesk.js')>();
  return { ...real, acceptDeliverable };
});

const state = vi.hoisted(() => ({
  migrated: true as boolean | null,
  sessionRows: [] as Record<string, unknown>[],
  engagementRows: [] as Record<string, unknown>[],
  milestoneRows: [] as Record<string, unknown>[],
  deliverableRows: [] as Record<string, unknown>[],
  factRows: [] as Record<string, unknown>[],
  packetTable: true,
  dpoRows: [] as Record<string, unknown>[],
  ownedDeliverable: true,
  revokeCount: 1,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (sql.includes("to_regclass('gps_portal_session')")) {
        if (state.migrated === null) throw new Error('probe boom');
        return { rows: [{ rel: state.migrated ? 'gps_portal_session' : null }] };
      }
      if (sql.includes('FROM gps_portal_session WHERE token_digest')) return { rows: state.sessionRows };
      if (sql.includes('UPDATE gps_portal_session SET last_seen_at')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE gps_portal_session SET revoked_at')) {
        return { rows: state.revokeCount > 0 ? [{ id: params[0] }] : [], rowCount: state.revokeCount };
      }
      if (sql.includes('SELECT id FROM gps_portal_session WHERE id')) return { rows: [{ id: params[0] }] };
      if (sql.includes('FROM gps_portal_session WHERE engagement_id')) return { rows: state.sessionRows };
      if (sql.includes('INSERT INTO gps_portal_session')) {
        return { rows: [{ id: 'sess-new', expires_at: '2026-09-05T00:00:00.000Z' }] };
      }
      if (sql.includes('SELECT id, client_id FROM gps_engagement')) return { rows: state.engagementRows };
      if (sql.includes('SELECT offer_key FROM gps_engagement')) return { rows: state.engagementRows };
      if (sql.includes('FROM gps_engagement e JOIN gps_client c')) return { rows: state.engagementRows };
      if (sql.includes('FROM gps_milestone')) return { rows: state.milestoneRows };
      if (sql.includes('FROM gps_deliverable WHERE id')) return { rows: state.ownedDeliverable ? [{ id: params[0] }] : [] };
      if (sql.includes('FROM gps_deliverable')) return { rows: state.deliverableRows };
      if (sql.includes('FROM gps_portal_fact')) return { rows: state.factRows };
      if (sql.includes('INSERT INTO gps_portal_fact')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO gps_portal_event')) return { rows: [], rowCount: 1 };
      if (sql.includes("to_regclass('gps_packet_decision')")) {
        return { rows: [{ rel: state.packetTable ? 'gps_packet_decision' : null }] };
      }
      if (sql.includes('FROM gps_packet_decision')) return { rows: state.dpoRows };
      throw new Error(`unexpected SQL: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { portalRoutes } = await import('../portal.js');
const { gpsPortalAdminRoutes } = await import('../gpsPortal.js');

const TOKEN = 'a'.repeat(64);

const SESSION_ROW = {
  id: 'sess-1', engagement_id: 'eng-1', client_id: 'cli-1',
  token_digest: 'd'.repeat(64), label: 'founder@sable.example',
  minted_by: 'nik', minted_at: '2026-08-22T00:00:00.000Z',
  expires_at: '2027-01-01T00:00:00.000Z', revoked_at: null, revoked_by: null,
  last_seen_at: '2026-08-22T00:00:00.000Z',
};

const ENGAGEMENT_ROW = {
  id: 'eng-1', client_id: 'cli-1', offer_key: 'mica_whitepaper', status: 'in_delivery',
  price_cents: '2500000', currency: 'USD',
  scope_snapshot: {
    offerKey: 'mica_whitepaper',
    exclusions: ['No legal advice'],
    requiredClientInputs: ['Tokenomics', 'Issuer details'],
    internalOnlyNote: 'vendor cost is 60% of price',
  },
  deposit_required_cents: '500000', deposit_paid_at: null, client_name: 'Sable Protocol',
};

function portalApp() {
  const app = new Hono();
  app.route('/v1/portal', portalRoutes);
  return app;
}

function adminApp(role: 'operator' | 'approver' = 'approver') {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', async (c, next) => {
    c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role } as never);
    await next();
  });
  app.route('/portal-admin', gpsPortalAdminRoutes);
  return app;
}

const get = (path: string, token: string | null = TOKEN) =>
  portalApp().request(`/v1/portal${path}`, {
    headers: {
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}`,
    },
  });

const post = (path: string, body: unknown, token: string | null = TOKEN) =>
  portalApp().request(`/v1/portal${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}`,
    },
  });

beforeEach(() => {
  acceptDeliverable.mockReset();
  acceptDeliverable.mockResolvedValue({
    ok: true,
    value: { id: 'del-1', acceptedAt: '2026-08-22T10:00:00.000Z', verdict: { canAccept: true } },
    operator: 'portal:founder@sable.example',
  });
  state.migrated = true;
  state.sessionRows = [{ ...SESSION_ROW }];
  state.engagementRows = [{ ...ENGAGEMENT_ROW }];
  state.milestoneRows = [{
    id: 'm1', ordinal: 0, name: 'Draft delivered', status: 'blocked',
    due_by: null, completed_at: null, blocked_reason: 'waiting on tokenomics from the client CFO',
  }];
  state.deliverableRows = [{
    id: 'del-1', name: 'MiCA white paper — submission draft', status: 'in_review',
    review_required: true, reviewed_at: null, accepted_at: null,
  }];
  state.factRows = [];
  state.packetTable = true;
  state.dpoRows = [];
  state.ownedDeliverable = true;
  state.revokeCount = 1;
  state.queries = [];
});

describe('the session gate — three refusals, three sentences', () => {
  it('401s a missing token before anything else runs', async () => {
    const res = await get('/engagement', null);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_REQUIRED');
  });

  it('distinguishes invalid, expired and revoked — each its own code', async () => {
    state.sessionRows = [];
    expect((await (await get('/engagement')).json()).code).toBe('SESSION_INVALID');
    state.sessionRows = [{ ...SESSION_ROW, expires_at: '2026-01-01T00:00:00.000Z' }];
    expect((await (await get('/engagement')).json()).code).toBe('SESSION_EXPIRED');
    state.sessionRows = [{ ...SESSION_ROW, revoked_at: '2026-08-21T00:00:00.000Z', revoked_by: 'nik' }];
    expect((await (await get('/engagement')).json()).code).toBe('SESSION_REVOKED');
  });

  it('answers 503 with the migration named when 0080 is not applied', async () => {
    state.migrated = false;
    const res = await get('/engagement');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('0080_gps_portal.sql');
  });
});

describe('the scoped view — minimum disclosure as a wire fact', () => {
  it('carries honest milestone states and NEVER a staffing name or a percent', async () => {
    const res = await get('/engagement');
    expect(res.status).toBe(200);
    const body = await res.json();
    const m = body.data.milestones[0];
    expect(m.status).toBe('blocked');
    expect(m.blockedReason).toContain('waiting on tokenomics');
    // Structural: no owner field exists anywhere on the client wire, and no percent.
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('"owner"');
    expect(wire).not.toMatch(/percent|pct/i);
  });

  it('whitelists the scope snapshot — internal fields never travel', async () => {
    const body = await (await get('/engagement')).json();
    expect(body.data.engagement.exclusions).toEqual(['No legal advice']);
    expect(body.data.engagement.requiredClientInputs).toEqual(['Tokenomics', 'Issuer details']);
    expect(JSON.stringify(body)).not.toContain('internalOnlyNote');
    expect(JSON.stringify(body)).not.toContain('vendor cost');
  });

  it('the upload gate state travels with the view, so the page cannot invent a button', async () => {
    const body = await (await get('/engagement')).json();
    expect(body.data.uploadGate.state).toBe('undecided');
    expect(body.data.uploadGate.detail).toMatch(/DPO/);
  });
});

describe('typed facts — the offer’s own closed set', () => {
  it('stores known keys and records the event', async () => {
    // The closed set is the CATALOGUE's own list — the fixture key is read from it,
    // never retyped, so a reworded input breaks this test instead of the portal.
    const realKey = getOffer('mica_whitepaper')!.requiredClientInputs[0];
    const res = await post('/facts', { facts: [{ factKey: realKey, factValue: 'Fixed supply of 100M, no inflation.' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).data.stored).toBe(1);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_portal_fact'))!;
    expect(insert.params[2]).toBe(realKey);
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_portal_event') && String(q.params[2]) === 'facts_submitted')).toBe(true);
  });

  it('refuses an unknown key BY NAME, and stores nothing', async () => {
    const res = await post('/facts', { facts: [{ factKey: 'freeform_notes', factValue: 'x' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('freeform_notes');
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_portal_fact'))).toBe(false);
  });
});

describe('client acceptance — the desk’s own door', () => {
  it('calls acceptDeliverable with portal attribution and records the event', async () => {
    const res = await post('/deliverables/del-1/accept', {});
    expect(res.status).toBe(200);
    expect(acceptDeliverable.mock.calls[0][1]).toEqual({
      deliverableId: 'del-1',
      operator: 'portal:founder@sable.example',
    });
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_portal_event') && String(q.params[2]) === 'acceptance_recorded')).toBe(true);
  });

  it('a desk refusal passes through verbatim — the gates bind the client too', async () => {
    acceptDeliverable.mockResolvedValue({
      ok: false,
      code: 'acceptance_refused',
      message: 'Acceptance refused (review_pending): the review gate has not run.',
    });
    const res = await post('/deliverables/del-1/accept', {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('review gate');
  });

  it('a deliverable outside this session’s engagement is NOT_FOUND, and the desk door never runs', async () => {
    state.ownedDeliverable = false;
    const res = await post('/deliverables/other/accept', {});
    expect(res.status).toBe(404);
    expect(acceptDeliverable).not.toHaveBeenCalled();
  });
});

describe('the upload door — a decision, not a TODO', () => {
  it('refuses while undecided, recording the intent', async () => {
    const res = await post('/upload-intent', { note: 'tokenomics deck ready' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('UPLOAD_AWAITS_DPO_DECISION');
    expect(body.data.readinessRecorded).toBe(true);
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_portal_event') && String(q.params[2]) === 'upload_refused')).toBe(true);
  });

  it('refuses with a DIFFERENT code when the approved decision forbids uploads', async () => {
    state.dpoRows = [{ decision: 'approved', option: 'controller_only_no_uploads' }];
    const res = await post('/upload-intent', {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('UPLOAD_FORBIDDEN_BY_DPO');
  });

  it('records readiness when the decision permits — and still receives no bytes', async () => {
    state.dpoRows = [{ decision: 'approved', option: 'adopt_processor_dpa' }];
    const res = await post('/upload-intent', { note: 'deck ready' });
    expect(res.status).toBe(200);
    expect((await res.json()).data.recorded).toBe(true);
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_portal_event') && String(q.params[2]) === 'upload_intent_recorded')).toBe(true);
  });
});

describe('minting — an approver act, and the token appears once', () => {
  it('refuses a plain operator', async () => {
    const res = await adminApp('operator').request('/portal-admin/engagements/eng-1/invite', {
      method: 'POST', body: JSON.stringify({ label: 'founder@sable.example' }),
    });
    expect(res.status).toBe(403);
  });

  it('mints with a label, stores a DIGEST, and returns the token exactly once', async () => {
    const res = await adminApp().request('/portal-admin/engagements/eng-1/invite', {
      method: 'POST', body: JSON.stringify({ label: 'founder@sable.example' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.shownOnce).toBe(true);
    const token = body.data.url.split('#t=')[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_portal_session'))!;
    const digest = String(insert.params[2]);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // The stored value can never reproduce the link: digest ≠ token.
    expect(digest).not.toBe(token);
    expect(insert.params[3]).toBe('founder@sable.example');
    expect(insert.params[4]).toBe('nik');
  });

  it('refuses a mint without a label — attribution is the point of the field', async () => {
    const res = await adminApp().request('/portal-admin/engagements/eng-1/invite', {
      method: 'POST', body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('revocation is once, attributed, and 409s a re-revoke', async () => {
    const first = await adminApp().request('/portal-admin/sessions/sess-1/revoke', { method: 'POST' });
    expect(first.status).toBe(200);
    const upd = state.queries.find((q) => q.sql.includes('UPDATE gps_portal_session SET revoked_at'))!;
    expect(upd.params).toEqual(['sess-1', 'nik']);
    state.revokeCount = 0;
    const second = await adminApp().request('/portal-admin/sessions/sess-1/revoke', { method: 'POST' });
    expect(second.status).toBe(409);
  });
});
