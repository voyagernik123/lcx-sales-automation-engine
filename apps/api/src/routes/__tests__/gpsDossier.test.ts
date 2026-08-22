import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  DOSSIER_HEADINGS, MODEL_SECTION_CAVEAT, buildDossierPrompt,
} from '@lcx/shared';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * G2 AT ITS BOUNDARIES. The LLM and the outbound gate are mocked — their own suites
 * own their truth — and what is asserted HERE is the contract between them: a
 * defective model response is returned with its defects and stored NOWHERE; a valid
 * one is stored with its citation count; the gate is consulted on every outreach
 * draft with the operator attributed; a blocked draft is stored WITH its refusal
 * (the record of the "no" is the point); and the response verdict never carries the
 * gate's unscoped ledger.
 */

const complete = vi.hoisted(() => vi.fn());
vi.mock('../../ai/llm.js', () => ({ llm: { complete } }));

const gateOutboundText = vi.hoisted(() => vi.fn());
const recordGateDecision = vi.hoisted(() => vi.fn());
vi.mock('../../marketing/outboundGate.js', () => ({ gateOutboundText, recordGateDecision }));

const listTargetRecords = vi.hoisted(() => vi.fn());
vi.mock('../../gps/origination.js', async (orig) => {
  const real = await orig<typeof import('../../gps/origination.js')>();
  return { ...real, listTargetRecords };
});

const state = vi.hoisted(() => ({
  migrated: true as boolean | null,
  dossierRows: [] as Record<string, unknown>[],
  draftRows: [] as Record<string, unknown>[],
  acceptedRows: [] as Record<string, unknown>[],
  statusRows: [] as Record<string, unknown>[],
  updateRowCount: 1,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (sql.includes("to_regclass('gps_dossier')")) {
        if (state.migrated === null) throw new Error('probe boom');
        return { rows: [{ rel: state.migrated ? 'gps_dossier' : null }] };
      }
      if (sql.includes("status = 'accepted'")) return { rows: state.acceptedRows };
      if (sql.includes('SELECT * FROM gps_dossier WHERE target_id')) return { rows: state.dossierRows };
      if (sql.includes('SELECT * FROM gps_outreach_draft WHERE target_id')) return { rows: state.draftRows };
      if (sql.includes('INSERT INTO gps_dossier')) {
        return {
          rows: [{
            id: 11, target_id: params[0], offer_key: params[1], status: 'draft',
            dossier_md: params[2], model: params[3], fact_refs_cited: params[4],
            generated_by: params[5], generated_at: '2026-08-22T09:00:00.000Z',
            decided_by: null, decided_at: null, decision_note: null,
          }],
        };
      }
      if (sql.startsWith('UPDATE gps_dossier')) {
        return state.updateRowCount === 0
          ? { rows: [], rowCount: 0 }
          : {
              rowCount: 1,
              rows: [{
                id: params[0], target_id: 'tgt-1', offer_key: 'mica_whitepaper', status: params[1],
                dossier_md: 'kept', model: 'openrouter', fact_refs_cited: 2,
                generated_by: 'nik', generated_at: '2026-08-22T09:00:00.000Z',
                decided_by: params[2], decided_at: '2026-08-22T10:00:00.000Z', decision_note: params[3],
              }],
            };
      }
      if (sql.includes('SELECT status FROM gps_dossier WHERE id')) return { rows: state.statusRows };
      if (sql.includes('INSERT INTO gps_outreach_draft')) {
        return {
          rows: [{
            id: 21, target_id: params[0], dossier_id: params[1], channel: params[2],
            draft_text: params[3], model: params[4], gate_allowed: params[5],
            gate_disposition: params[6], gate_refusal_codes: params[7], gate_reference: params[8],
            created_by: params[9], created_at: '2026-08-22T09:30:00.000Z',
          }],
        };
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 70)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { gpsDossierRoutes } = await import('../gpsDossier.js');
const { toDossierView } = await import('../../gps/dossier.js');

function app(role: 'operator' | null = 'operator') {
  const a = new Hono<{ Variables: AuthVariables }>();
  a.use('*', async (c, next) => {
    if (role) c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role } as never);
    await next();
  });
  a.route('/dossiers', gpsDossierRoutes);
  return a;
}

const RECORD = {
  target: {
    id: 'tgt-1', name: 'Sable Protocol', jurisdiction: 'Germany', offerKey: 'mica_whitepaper',
    identifiedNeeds: ['mica_whitepaper'], introPath: 'warm_referral', statedBudgetCents: 1_800_000,
    evidence: { reliability: 'B', credibility: 2, ageDays: 12 },
    screening: 'clear', perimeter: 'in_perimeter', conflict: 'cleared',
    deadlineIso: null, deadlineKind: null,
    decisionMaker: { name: 'A Person', role: 'CTO', isBudgetHolder: true },
  },
  status: 'new', clientId: null, createdBy: 'nik',
  createdIso: '2026-08-20T00:00:00.000Z', updatedIso: '2026-08-20T00:00:00.000Z',
} as unknown as import('../../gps/origination.js').TargetRecord;

/** A response that satisfies the shared validator for THIS record's fact refs. */
function compliantText(): string {
  const refs = buildDossierPrompt(toDossierView(RECORD)).refs;
  return [
    DOSSIER_HEADINGS[0],
    `- Sable Protocol is a German-jurisdiction target. [${refs[0]}, ${refs[1]}]`,
    DOSSIER_HEADINGS[1],
    MODEL_SECTION_CAVEAT,
    'MiCA white papers follow the Annex structure.',
    DOSSIER_HEADINGS[2],
    'The register already hypothesises the white paper offer — start there.',
    DOSSIER_HEADINGS[3],
    '- A budget confirmation from the project.',
  ].join('\n');
}

const OK_LLM = (text: string) => ({
  text, usedLlm: true, status: 'ok', code: null, detail: '', rule: '', provider: 'openrouter', httpStatus: 200,
});

const CLEAR_VERDICT = {
  allowed: true, usableText: 'draft', disposition: 'clear', refusals: [], violations: [],
  blockingViolations: [], assetsExtracted: [], extractionCaveat: 'none', claimSafety: null,
  marketAbuse: null, gateError: null,
  embargoScope: { clearance: 'none', explanationWithheld: false, reference: 'gateref99', ring: 'approver' },
  ledgerOnly: { refusalCodes: ['THE_UNSCOPED_CODE'] },
};

beforeEach(() => {
  complete.mockReset();
  gateOutboundText.mockReset();
  recordGateDecision.mockReset();
  recordGateDecision.mockResolvedValue(true);
  listTargetRecords.mockReset();
  listTargetRecords.mockResolvedValue([RECORD]);
  state.migrated = true;
  state.dossierRows = [];
  state.draftRows = [];
  state.acceptedRows = [];
  state.statusRows = [];
  state.updateRowCount = 1;
  state.queries = [];
});

describe('the read', () => {
  it('refuses a read without a targetId', async () => {
    expect((await app().request('/dossiers')).status).toBe(400);
  });

  it('answers 200-empty with registerPresent:false when 0078 is not applied', async () => {
    state.migrated = false;
    const res = await app().request('/dossiers?targetId=tgt-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ dossiers: [], outreachDrafts: [], registerPresent: false });
    expect(body.meta.migrated).toBe(false);
  });
});

describe('generation — the validator sits between the model and the register', () => {
  const gen = () => app().request('/dossiers/generate', { method: 'POST', body: JSON.stringify({ targetId: 'tgt-1' }) });

  it('stores a compliant dossier with its citation count and the operator attributed', async () => {
    complete.mockResolvedValue(OK_LLM(compliantText()));
    const res = await gen();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dossier.id).toBe(11);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_dossier'))!;
    expect(insert.params[1]).toBe('mica_whitepaper');
    expect(insert.params[4]).toBe(2); // two distinct refs cited
    expect(insert.params[5]).toBe('nik');
    // The prompt reached the model with the system contract, not just the task.
    const [task, opts] = complete.mock.calls[0];
    expect(String(task)).toContain('Sable Protocol');
    expect(opts.feature).toBe('gps-dossier');
    expect(String(opts.system)).toContain(MODEL_SECTION_CAVEAT);
  });

  it('never hands the model a personal name — the view has no field for one', async () => {
    complete.mockResolvedValue(OK_LLM(compliantText()));
    await gen();
    const [task, opts] = complete.mock.calls[0];
    expect(String(task)).not.toContain('A Person');
    expect(String(opts.system)).not.toContain('A Person');
    expect(String(task)).toContain('CTO'); // the role travels
  });

  it('returns a defective response as 422 WITH the defects, and stores nothing', async () => {
    complete.mockResolvedValue(OK_LLM('A confident essay with no sections and no citations.'));
    const res = await gen();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('DOSSIER_INVALID');
    expect(body.defects.length).toBeGreaterThan(0);
    expect(body.rejectedText).toContain('confident essay');
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_dossier'))).toBe(false);
  });

  it('passes through the honest no-provider outcome as 503, distinct from a provider error', async () => {
    complete.mockResolvedValue({
      text: '', usedLlm: false, status: 'no_provider', code: 'AI_NO_PROVIDER',
      detail: 'No AI provider is configured.', rule: 'Absent data refuses.', provider: null, httpStatus: null,
    });
    const res = await gen();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('AI_NO_PROVIDER');
    expect(body.rule).toContain('refuses');
  });

  it('404s an unknown target before any model call', async () => {
    listTargetRecords.mockResolvedValue([]);
    const res = await gen();
    expect(res.status).toBe(404);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('the decision — a named human, once', () => {
  it('accepts with the operator recorded', async () => {
    const res = await app().request('/dossiers/11/decide', {
      method: 'POST', body: JSON.stringify({ decision: 'accepted' }),
    });
    expect(res.status).toBe(200);
    const upd = state.queries.find((q) => q.sql.startsWith('UPDATE gps_dossier'))!;
    expect(upd.params).toEqual([11, 'accepted', 'nik', null]);
  });

  it('refuses a rejection without a note', async () => {
    const res = await app().request('/dossiers/11/decide', {
      method: 'POST', body: JSON.stringify({ decision: 'rejected' }),
    });
    expect(res.status).toBe(400);
  });

  it('409s a second decision instead of overwriting the first', async () => {
    state.updateRowCount = 0;
    state.statusRows = [{ status: 'accepted' }];
    const res = await app().request('/dossiers/11/decide', {
      method: 'POST', body: JSON.stringify({ decision: 'rejected', note: 'stale' }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_DECIDED');
  });
});

describe('outreach — one mouth, and the verdict travels with the draft', () => {
  const draft = (channel = 'email') =>
    app().request('/dossiers/outreach', { method: 'POST', body: JSON.stringify({ targetId: 'tgt-1', channel }) });

  it('refuses an unknown channel', async () => {
    expect((await draft('carrier_pigeon')).status).toBe(400);
  });

  it('gates the draft as the operator in draft phase, stores verdict fields, never the unscoped ledger', async () => {
    complete.mockResolvedValue(OK_LLM('Honest note from the LCX services desk. Open to a short call?'));
    gateOutboundText.mockResolvedValue(CLEAR_VERDICT);
    const res = await draft();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.draft.gateAllowed).toBe(true);
    expect(body.data.verdict.allowed).toBe(true);
    expect(body.data.verdict.ledgerOnly).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('THE_UNSCOPED_CODE');
    expect(body.data.ledgerRecorded).toBe(true);
    const req = gateOutboundText.mock.calls[0][1];
    expect(req).toMatchObject({ verb: 'original', channel: 'email', actor: 'nik', phase: 'draft' });
    const rec = recordGateDecision.mock.calls[0][1];
    expect(rec).toMatchObject({ replyId: null, actor: 'nik', phase: 'draft' });
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_outreach_draft'))!;
    expect(insert.params[8]).toBe('gateref99');
  });

  it('a blocked draft is STORED with its refusal — the record of the no is the point', async () => {
    complete.mockResolvedValue(OK_LLM('Note that trips the gate.'));
    gateOutboundText.mockResolvedValue({
      ...CLEAR_VERDICT, allowed: false, disposition: 'blocked', usableText: null,
      refusals: [{ code: 'ART_90_SCOPED', message: 'ask the approver' }],
    });
    const res = await draft();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.draft.gateAllowed).toBe(false);
    expect(body.data.verdict.refusals[0].code).toBe('ART_90_SCOPED');
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_outreach_draft'))!;
    expect(insert.params[5]).toBe(false);
    expect(insert.params[7]).toBe('ART_90_SCOPED');
  });

  it('promise language dies before the gate is even consulted, and nothing is stored', async () => {
    complete.mockResolvedValue(OK_LLM('We guarantee your token will be listed.'));
    const res = await draft();
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('OUTREACH_INVALID');
    expect(gateOutboundText).not.toHaveBeenCalled();
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_outreach_draft'))).toBe(false);
  });

  it('builds on the latest ACCEPTED dossier’s angle when one exists', async () => {
    state.acceptedRows = [{
      id: 7,
      dossier_md: [DOSSIER_HEADINGS[2], 'Lead with the regulatory deadline.', DOSSIER_HEADINGS[3], '- x'].join('\n'),
    }];
    complete.mockResolvedValue(OK_LLM('Honest note from the LCX services desk.'));
    gateOutboundText.mockResolvedValue(CLEAR_VERDICT);
    await draft();
    const [task] = complete.mock.calls[0];
    expect(String(task)).toContain('Lead with the regulatory deadline.');
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_outreach_draft'))!;
    expect(insert.params[1]).toBe(7);
  });
});
