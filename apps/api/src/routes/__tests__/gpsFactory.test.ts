import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { factoryTemplate, getOffer } from '@lcx/shared';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * THE FACTORY AT ITS BOUNDARIES (G5). What is pinned:
 *
 *  · D10 AS A STATUS CODE — a generate over missing client inputs is a 409 whose
 *    payload IS the chase list, and the model is never consulted.
 *  · THE SLOT JOIN IS EXACT — portal facts stored under the catalogue's own
 *    sentences fill the template's slots; the prompt carries the client's words.
 *  · NOTHING DEFECTIVE IS STORED — same contract as dossiers, same evidence.
 *  · QA ACCEPTANCE REACHES THE ONE REVIEW GATE — recordDeliverableReview is
 *    called with the QA human, and its refusal is reported, never swallowed.
 */

const complete = vi.hoisted(() => vi.fn());
vi.mock('../../ai/llm.js', () => ({ llm: { complete } }));

const recordDeliverableReview = vi.hoisted(() => vi.fn());
vi.mock('../../gps/deliveryDesk.js', async (orig) => {
  const real = await orig<typeof import('../../gps/deliveryDesk.js')>();
  return { ...real, recordDeliverableReview };
});

const state = vi.hoisted(() => ({
  migrated: true as boolean | null,
  engagementRows: [] as Record<string, unknown>[],
  factRows: [] as Record<string, unknown>[],
  draftRows: [] as Record<string, unknown>[],
  statusRows: [] as Record<string, unknown>[],
  actualRows: [] as Record<string, unknown>[],
  acceptedDraftRows: [] as Record<string, unknown>[],
  qaRowCount: 1,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (sql.includes("to_regclass('gps_draft')")) {
        if (state.migrated === null) throw new Error('probe boom');
        return { rows: [{ rel: state.migrated ? 'gps_draft' : null }] };
      }
      if (sql.includes('FROM gps_engagement e JOIN gps_client c')) return { rows: state.engagementRows };
      if (sql.includes('FROM gps_portal_fact')) return { rows: state.factRows };
      if (sql.includes('FROM gps_dossier')) return { rows: [] };
      if (sql.includes("SET status = 'superseded'")) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO gps_draft')) {
        return {
          rows: [{
            id: 31, engagement_id: params[0], deliverable_id: params[1], offer_key: params[2],
            version: 1, status: 'draft', draft_text: params[3], model: params[4],
            slots_filled: params[5], generated_by: params[6],
            generated_at: '2026-08-22T15:00:00.000Z',
            decided_by: null, decided_at: null, decision_note: null,
          }],
        };
      }
      if (sql.startsWith('UPDATE gps_draft')) {
        return state.qaRowCount === 0
          ? { rows: [], rowCount: 0 }
          : {
              rowCount: 1,
              rows: [{
                id: params[0], engagement_id: 'eng-1', deliverable_id: 'del-1', offer_key: 'mica_whitepaper',
                version: 1, status: params[1], draft_text: 'kept', model: 'openrouter', slots_filled: 7,
                generated_by: 'nik', generated_at: '2026-08-22T15:00:00.000Z',
                decided_by: params[2], decided_at: '2026-08-22T16:00:00.000Z', decision_note: params[3],
              }],
            };
      }
      if (sql.includes('SELECT status FROM gps_draft WHERE id')) return { rows: state.statusRows };
      if (sql.includes("status = 'accepted'") && sql.includes('FROM gps_draft')) return { rows: state.acceptedDraftRows };
      if (sql.includes('SELECT * FROM gps_draft WHERE engagement_id')) return { rows: state.draftRows };
      if (sql.includes('INSERT INTO gps_stage_actual')) {
        return {
          rows: [{
            id: 41, engagement_id: params[0], stage: params[1], hours: params[2],
            cost_cents: params[3], note: params[4], recorded_by: params[5],
            recorded_at: '2026-08-22T15:30:00.000Z',
          }],
        };
      }
      if (sql.includes('FROM gps_stage_actual')) return { rows: state.actualRows };
      if (sql.includes('MIN(due_by)')) return { rows: [{ next_due: null }] };
      throw new Error(`unexpected SQL: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { gpsFactoryRoutes } = await import('../gpsFactory.js');

function app() {
  const a = new Hono<{ Variables: AuthVariables }>();
  a.use('*', async (c, next) => {
    c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'operator' } as never);
    await next();
  });
  a.route('/factory', gpsFactoryRoutes);
  return a;
}

const CATALOGUE_INPUTS = getOffer('mica_whitepaper')!.requiredClientInputs;
const TEMPLATE = factoryTemplate('mica_whitepaper');
const COMPLIANT = TEMPLATE.sections.map((h) => `${h}\nDrafted content.`).join('\n');
const OK_LLM = (text: string) => ({
  text, usedLlm: true, status: 'ok', code: null, detail: '', rule: '', provider: 'openrouter', httpStatus: 200,
});

beforeEach(() => {
  complete.mockReset();
  recordDeliverableReview.mockReset();
  recordDeliverableReview.mockResolvedValue({ ok: true, value: { id: 'del-1', reviewedBy: 'nik', reviewedAt: '' }, operator: 'nik' });
  state.migrated = true;
  state.engagementRows = [{ id: 'eng-1', offer_key: 'mica_whitepaper', client_name: 'Sable Protocol', status: 'in_delivery', scope_snapshot: {} }];
  state.factRows = CATALOGUE_INPUTS.map((k) => ({ fact_key: k, fact_value: `answered: ${k.slice(0, 30)}` }));
  state.draftRows = [];
  state.statusRows = [];
  state.actualRows = [];
  state.acceptedDraftRows = [];
  state.qaRowCount = 1;
  state.queries = [];
});

describe('Stage 1 — the draft refuses to run ahead of the client', () => {
  const gen = () => app().request('/factory/engagements/eng-1/draft', { method: 'POST', body: JSON.stringify({ deliverableId: 'del-1' }) });

  it('409s over missing inputs with the CHASE LIST, and the model is never consulted', async () => {
    state.factRows = []; // the client has answered nothing
    const res = await gen();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('SLOTS_MISSING');
    expect(body.gaps.map((g: { label: string }) => g.label)).toEqual([...CATALOGUE_INPUTS]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('generates over filled slots — the prompt carries the client’s own words', async () => {
    complete.mockResolvedValue(OK_LLM(COMPLIANT));
    const res = await gen();
    expect(res.status).toBe(200);
    const [task, opts] = complete.mock.calls[0];
    expect(opts.feature).toBe('gps-factory-draft');
    expect(String(task)).toContain(`answered: ${CATALOGUE_INPUTS[0].slice(0, 30)}`);
    expect(String(opts.system)).toContain('[FACT REQUIRED:');
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_draft'))!;
    expect(insert.params[1]).toBe('del-1');
    expect(insert.params[6]).toBe('nik');
    // Undecided predecessors were superseded in the same act.
    expect(state.queries.some((q) => q.sql.includes("SET status = 'superseded'"))).toBe(true);
  });

  it('a defective model response is 422 with the bill, and nothing is stored', async () => {
    complete.mockResolvedValue(OK_LLM('A confident document with none of the required sections.'));
    const res = await gen();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('DRAFT_INVALID');
    expect(body.defects.length).toBeGreaterThan(0);
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_draft'))).toBe(false);
  });
});

describe('Stage 2 — QA through the one review gate', () => {
  const qa = (body: unknown) => app().request('/factory/drafts/31/qa', { method: 'POST', body: JSON.stringify(body) });

  it('acceptance marks the linked deliverable reviewed via the desk’s own function', async () => {
    const res = await qa({ decision: 'accepted' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reviewRecorded).toBe(true);
    expect(recordDeliverableReview.mock.calls[0][1]).toEqual({ deliverableId: 'del-1', operator: 'nik' });
  });

  it('a review-gate refusal is REPORTED beside the QA acceptance, never swallowed', async () => {
    recordDeliverableReview.mockResolvedValue({ ok: false, code: 'conflict_gate', message: 'conflict position absent' });
    const body = await (await qa({ decision: 'accepted' })).json();
    expect(body.data.reviewRecorded).toBe(false);
    expect(body.data.reviewDetail).toContain('conflict');
  });

  it('rework demands its note, and a decided draft is not re-decided', async () => {
    expect((await qa({ decision: 'rework' })).status).toBe(400);
    state.qaRowCount = 0;
    state.statusRows = [{ status: 'accepted' }];
    const res = await qa({ decision: 'rework', note: 'section F is thin' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_DECIDED');
  });
});

describe('effort truth and the read', () => {
  it('records stage actuals with the human attributed', async () => {
    const res = await app().request('/factory/engagements/eng-1/actuals', {
      method: 'POST', body: JSON.stringify({ stage: 'internal_qa', hours: 3.5, costCents: 0, note: 'clause review' }),
    });
    expect(res.status).toBe(200);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_stage_actual'))!;
    expect(insert.params).toEqual(['eng-1', 'internal_qa', 3.5, 0, 'clause review', 'nik']);
  });

  it('refuses an invented stage', async () => {
    const res = await app().request('/factory/engagements/eng-1/actuals', {
      method: 'POST', body: JSON.stringify({ stage: 'vibes', hours: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('pre-migration, the slot state still reads and says migrated:false', async () => {
    state.migrated = false;
    const res = await app().request('/factory/engagements/eng-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.migrated).toBe(false);
    expect(body.data.slotState.gaps).toEqual([]);
    expect(body.data.drafts).toEqual([]);
  });
});

describe('Stage 3 — a partner deliverable enters as the next version', () => {
  it('inserts a version whose provenance names the partner, and supersedes the undecided one', async () => {
    const res = await app().request('/factory/engagements/eng-1/partner-deliverable', {
      method: 'POST',
      body: JSON.stringify({ draftText: 'Counsel opinion, in counsel\'s own structure.', partnerLabel: 'Counsel One' }),
    });
    expect(res.status).toBe(200);
    // Supersede first, then insert — a second undecided version is not created.
    expect(state.queries.some((q) => q.sql.includes("SET status = 'superseded'"))).toBe(true);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_draft'))!;
    expect(String(insert.params[4])).toBe('partner:Counsel One');
    expect(String(insert.params[3])).toContain('Counsel opinion');
  });

  it('refuses an unattributed or empty deliverable', async () => {
    const noLabel = await app().request('/factory/engagements/eng-1/partner-deliverable', {
      method: 'POST', body: JSON.stringify({ draftText: 'text', partnerLabel: '  ' }),
    });
    expect(noLabel.status).toBe(400);
    expect((await noLabel.json()).error).toContain('unattributed');

    const empty = await app().request('/factory/engagements/eng-1/partner-deliverable', {
      method: 'POST', body: JSON.stringify({ draftText: '   ', partnerLabel: 'Counsel One' }),
    });
    expect(empty.status).toBe(400);
  });

  it('does NOT shape-validate the partner text against our template', async () => {
    /* Our Stage-1 output must carry the template headings; counsel's opinion must not
       be refused for lacking them. The QA gate is where a human judges it. */
    const res = await app().request('/factory/engagements/eng-1/partner-deliverable', {
      method: 'POST',
      body: JSON.stringify({ draftText: 'No headings at all. Just prose.', partnerLabel: 'Counsel One' }),
    });
    expect(res.status).toBe(200);
  });
});
