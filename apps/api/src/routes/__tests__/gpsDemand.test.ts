import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * THE DEMAND QUEUE AT ITS BOUNDARIES — the gps routes and the one public door.
 *
 * The service functions are exercised against a recording fake pool (unknown SQL throws);
 * `saveTarget` is mocked because promotion's ONLY promise about it is "the same function
 * the curated watchlist uses, called with provenance folded in" — which is asserted on the
 * call, not re-tested. The public intake's tests are adversarial by construction: the
 * honeypot answer must be indistinguishable from success, unknown fields must die, and the
 * rate ceiling must actually count.
 */

const saveTarget = vi.hoisted(() => vi.fn());
vi.mock('../../gps/origination.js', async (orig) => {
  const real = await orig<typeof import('../../gps/origination.js')>();
  return { ...real, saveTarget };
});

const state = vi.hoisted(() => ({
  migrated: true as boolean | null,
  rows: [] as Record<string, unknown>[],
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  projects: [] as Record<string, unknown>[],
  insertRowCount: 1,
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (sql.includes("to_regclass('gps_demand_candidate')")) {
        if (state.migrated === null) throw new Error('probe boom');
        return { rows: [{ rel: state.migrated ? 'gps_demand_candidate' : null }] };
      }
      if (sql.startsWith('SELECT p.id')) return { rows: state.projects };
      if (sql.includes('INSERT INTO gps_demand_candidate')) return { rows: [], rowCount: state.insertRowCount };
      if (sql.includes('FROM gps_demand_candidate WHERE id')) return { rows: state.rows };
      if (sql.includes('FROM gps_demand_candidate WHERE status') || sql.includes('FROM gps_demand_candidate ORDER')) return { rows: state.rows };
      if (sql.includes('SELECT status FROM gps_demand_candidate')) return { rows: state.rows };
      if (sql.startsWith('UPDATE gps_demand_candidate')) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql.slice(0, 70)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { gpsDemandRoutes } = await import('../gpsDemand.js');
const { servicesIntakeRoutes } = await import('../servicesIntake.js');

function gpsApp(role: 'operator' | null = 'operator') {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', async (c, next) => {
    if (role) c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role } as never);
    await next();
  });
  app.route('/demand', gpsDemandRoutes);
  return app;
}

function publicApp() {
  const app = new Hono();
  app.route('/v1/services', servicesIntakeRoutes);
  return app;
}

const CANDIDATE_ROW = {
  id: 7, source: 'telegram_import', source_ref: 'tg:g:2', project_name: 'sableprotocol',
  url: 't.me/sableprotocol', chain: null, jurisdiction: null, offer_hypothesis: 'mica_whitepaper',
  reason: 'Telegram signal', snippet: 'MiCA white paper ahead of the EU listing', provenance_grade: 'C3',
  contact_email: null, observed_at: '2026-08-21T15:00:00.000Z', status: 'proposed',
  refusal_reason: null, promoted_target_id: null, created_by: 'nik',
  created_at: '2026-08-21T15:00:00.000Z', decided_at: null,
};

beforeEach(() => {
  saveTarget.mockReset();
  saveTarget.mockResolvedValue({ target: { id: 'tgt-1' }, status: 'new', clientId: null, createdBy: 'nik', createdIso: '', updatedIso: '' });
  state.migrated = true;
  state.rows = [];
  state.queries = [];
  state.projects = [];
  state.insertRowCount = 1;
});

describe('the crossfeed run', () => {
  it('projects rows through the shared rules and reports scanned/signals/inserted honestly', async () => {
    state.projects = [
      { id: 'p1', name: 'SABLE', chain: null, jurisdiction: 'Germany', eu_score: 88, band: 'nurture', listed_on_lcx: false, has_open_deal: false, days_since: 3 },
      { id: 'p2', name: 'HELIOS', chain: null, jurisdiction: null, eu_score: 10, band: 'high', listed_on_lcx: true, has_open_deal: false, days_since: 400 },
    ];
    const res = await gpsApp().request('/demand/crossfeed/run', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.projectsScanned).toBe(2);
    expect(body.data.signals).toBe(2); // p1→mica, p2→gtm
    expect(body.data.inserted).toBe(2);
    expect(body.data.duplicates).toBe(0);
  });

  it('a re-run reports duplicates instead of doubling the queue', async () => {
    state.projects = [{ id: 'p1', name: 'SABLE', chain: null, jurisdiction: null, eu_score: 88, band: null, listed_on_lcx: false, has_open_deal: false, days_since: 1 }];
    state.insertRowCount = 0; // ON CONFLICT DO NOTHING path
    const body = await (await gpsApp().request('/demand/crossfeed/run', { method: 'POST' })).json();
    expect(body.data.inserted).toBe(0);
    expect(body.data.duplicates).toBe(1);
  });
});

describe('the telegram import', () => {
  it('parses, minimises, inserts, and returns the drop-report beside the counts', async () => {
    const exportJson = {
      name: 'G', messages: [
        { id: 1, from: 'Someone Personal', text: 'MiCA white paper coming — t.me/sable for the listing' },
        { id: 2, from: 'Chatter', text: 'gm' },
      ],
    };
    const res = await gpsApp().request('/demand/telegram', { method: 'POST', body: JSON.stringify(exportJson) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.inserted).toBe(1);
    expect(body.data.report.messagesSeen).toBe(2);
    expect(body.data.report.sendersSeenAndDropped).toBe(2);
    // The insert params must not carry the sender anywhere.
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_demand_candidate'))!;
    expect(JSON.stringify(insert.params)).not.toContain('Someone Personal');
  });

  it('refuses an over-2MB export from its DECLARED size, before any buffering', async () => {
    /* The route reads Content-Length, not the body — c.req.text() would buffer the whole
       request before refusing, which the intake lockout's accessor rule forbids. The test
       declares the size the way a real client does. */
    const res = await gpsApp().request('/demand/telegram', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    });
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('EXPORT_TOO_LARGE');
  });
});

describe('promote and refuse — one-way decisions through the front door', () => {
  it('promote calls saveTarget with the provenance folded in, then records the target id', async () => {
    state.rows = [CANDIDATE_ROW];
    const res = await gpsApp().request('/demand/7/promote', { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).data.targetId).toBe('tgt-1');
    const w = saveTarget.mock.calls[0][1];
    expect(w.name).toBe('sableprotocol');
    expect(w.offerKey).toBe('mica_whitepaper');
    expect(w.identifiedNeeds).toEqual(['mica_whitepaper']);
    expect(w.evidenceReliability).toBe('C');
    expect(w.evidenceCredibility).toBe(3);
    expect(w.introPath).toBe('cold');
    expect(w.createdBy).toBe('nik');
    const upd = state.queries.find((q) => q.sql.startsWith('UPDATE gps_demand_candidate'))!;
    expect(upd.params).toEqual([7, 'tgt-1']);
  });

  it('an already-decided candidate cannot be re-promoted — 409, and saveTarget never runs', async () => {
    state.rows = [{ ...CANDIDATE_ROW, status: 'refused', refusal_reason: 'not a fit' }];
    const res = await gpsApp().request('/demand/7/promote', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(saveTarget).not.toHaveBeenCalled();
  });

  it('a refusal without a reason is refused itself', async () => {
    const res = await gpsApp().request('/demand/7/refuse', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reason is required/);
  });
});

describe('the public intake — hardened like it knows what it is', () => {
  const GOOD = {
    projectName: 'Sable Protocol', url: 'https://sable.example', email: 'founder@sable.example',
    offerInterest: 'mica_whitepaper', jurisdiction: 'Germany', message: 'Need a MiCA paper.', website: '',
  };
  const post = (body: unknown, ip = '203.0.113.7') =>
    publicApp().request('/v1/services/intake', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'x-forwarded-for': ip },
    });

  it('accepts a clean submission with {received:true} and nothing else', async () => {
    const res = await post(GOOD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_demand_candidate'))!;
    expect(insert.params[0]).toBe('inbound_intake');
    expect(insert.params[10]).toBe('founder@sable.example');
  });

  it('the honeypot answer is byte-identical to success, and nothing is inserted', async () => {
    /* A honeypot that answers differently is a bot-detector that trains the bot. The only
       observable difference is server-side: no INSERT happened. */
    const clean = await post(GOOD, '203.0.113.8');
    const trapped = await post({ ...GOOD, website: 'http://spam' }, '203.0.113.9');
    expect(trapped.status).toBe(clean.status);
    expect(await trapped.json()).toEqual({ received: true });
    const inserts = state.queries.filter((q) => q.sql.includes('INSERT INTO gps_demand_candidate'));
    expect(inserts).toHaveLength(1); // only the clean one
  });

  it('an unknown field dies at the first key', async () => {
    const res = await post({ ...GOOD, attachmentUrl: 'http://x' }, '203.0.113.10');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('attachmentUrl');
  });

  it('the sixth submission in an hour from one IP is 429', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post({ ...GOOD, projectName: `P${i}` }, '198.51.100.5')).status).toBe(200);
    }
    const sixth = await post({ ...GOOD, projectName: 'P6' }, '198.51.100.5');
    expect(sixth.status).toBe(429);
    // A different IP is unaffected — the bucket is per-caller, not global.
    expect((await post(GOOD, '198.51.100.6')).status).toBe(200);
  });

  it('an unapplied migration is OUR problem, not the visitor’s: accept, log, lose nothing silently', async () => {
    state.migrated = false;
    const res = await post(GOOD, '203.0.113.11');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
