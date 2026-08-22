import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * MONEY AT ITS BOUNDARIES (G6). What is pinned:
 *
 *  1. AN INVOICE TRACES TO AN ACCEPTANCE OR IT DOES NOT EXIST — billing an
 *     unaccepted deliverable is a 409 NOT_TRACED and nothing is inserted.
 *  2. ISSUE / PAY / VOID ARE APPROVER ACTS; dispute and chase are operator.
 *  3. RAILS ARE EXTERNAL — pay without a reference is refused; the reference is
 *     what "paid" records.
 *  4. THE CHASE HAS ONE MOUTH — it is gated, its verdict returned, and it is
 *     NEVER sent (no send path, and a non-open invoice is not chased).
 *  5. THE NUMBER IS THE IDENTITY — GPS-000031 for id 31.
 */

const gateOutboundText = vi.hoisted(() => vi.fn());
const recordGateDecision = vi.hoisted(() => vi.fn());
vi.mock('../../marketing/outboundGate.js', () => ({ gateOutboundText, recordGateDecision }));

const state = vi.hoisted(() => ({
  migrated: true as boolean | null,
  deliverableRows: [] as Record<string, unknown>[],
  invoiceRows: [] as Record<string, unknown>[],
  agingRows: [] as Record<string, unknown>[],
  chaseRows: [] as Record<string, unknown>[],
  statusRows: [] as Record<string, unknown>[],
  transitionCount: 1,
  insertThrows: null as string | null,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (sql.includes("to_regclass('gps_invoice')")) {
        if (state.migrated === null) throw new Error('probe boom');
        return { rows: [{ rel: state.migrated ? 'gps_invoice' : null }] };
      }
      if (sql.includes('FROM gps_deliverable d JOIN gps_engagement e')) return { rows: state.deliverableRows };
      if (sql.includes('INSERT INTO gps_invoice')) {
        if (state.insertThrows) throw new Error(state.insertThrows);
        return {
          rows: [{
            id: 31, engagement_id: params[0], client_id: params[1], deliverable_id: params[2],
            amount_cents: params[3], currency: params[4], status: 'issued', issued_by: params[5],
            issued_at: '2026-08-22T15:00:00.000Z',
            paid_at: null, paid_by: null, paid_reference: null,
            disputed_at: null, disputed_by: null, disputed_reason: null,
            voided_at: null, voided_by: null, voided_reason: null,
          }],
        };
      }
      if (sql.startsWith('UPDATE gps_invoice')) {
        return state.transitionCount === 0
          ? { rows: [], rowCount: 0 }
          : {
              rowCount: 1,
              rows: [{
                id: params[0], engagement_id: 'eng-1', client_id: 'cli-1', deliverable_id: 'del-1',
                amount_cents: 1_500_000, currency: 'USD', status: sql.includes("'paid'") ? 'paid' : sql.includes("'disputed'") ? 'disputed' : 'void',
                issued_by: 'nik', issued_at: '2026-08-22T15:00:00.000Z',
                paid_at: sql.includes("'paid'") ? '2026-08-22T16:00:00.000Z' : null,
                paid_by: sql.includes("'paid'") ? params[1] : null,
                paid_reference: sql.includes("'paid'") ? params[2] : null,
                disputed_at: sql.includes("'disputed'") ? '2026-08-22T16:00:00.000Z' : null,
                disputed_by: sql.includes("'disputed'") ? params[1] : null,
                disputed_reason: sql.includes("'disputed'") ? params[2] : null,
                voided_at: sql.includes("'void'") ? '2026-08-22T16:00:00.000Z' : null,
                voided_by: sql.includes("'void'") ? params[1] : null,
                voided_reason: sql.includes("'void'") ? params[2] : null,
              }],
            };
      }
      if (sql.includes('SELECT status FROM gps_invoice WHERE id')) return { rows: state.statusRows };
      if (sql.includes("status IN ('issued','disputed')")) return { rows: state.agingRows };
      if (sql.includes('JOIN gps_client c ON c.id = i.client_id')) return { rows: state.chaseRows };
      if (sql.includes('SELECT * FROM gps_invoice')) return { rows: state.invoiceRows };
      throw new Error(`unexpected SQL: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { gpsInvoiceRoutes } = await import('../gpsInvoice.js');

function app(role: 'operator' | 'approver' = 'approver') {
  const a = new Hono<{ Variables: AuthVariables }>();
  a.use('*', async (c, next) => {
    c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role } as never);
    await next();
  });
  a.route('/invoices', gpsInvoiceRoutes);
  return a;
}

const ACCEPTED_DELIVERABLE = {
  id: 'del-1', engagement_id: 'eng-1', client_id: 'cli-1',
  accepted_at: '2026-08-21T00:00:00.000Z', name: 'Submission draft', currency: 'USD',
};

const CLEAR_VERDICT = {
  allowed: true, usableText: 'x', disposition: 'clear', refusals: [], violations: [],
  blockingViolations: [], assetsExtracted: [], extractionCaveat: 'none', claimSafety: null,
  marketAbuse: null, gateError: null,
  embargoScope: { clearance: 'none', explanationWithheld: false, reference: 'gateref42', ring: 'approver' },
  ledgerOnly: { refusalCodes: ['UNSCOPED'] },
};

beforeEach(() => {
  gateOutboundText.mockReset();
  gateOutboundText.mockResolvedValue(CLEAR_VERDICT);
  recordGateDecision.mockReset();
  recordGateDecision.mockResolvedValue(true);
  state.migrated = true;
  state.deliverableRows = [{ ...ACCEPTED_DELIVERABLE }];
  state.invoiceRows = [];
  state.agingRows = [];
  state.chaseRows = [{
    id: 31, amount_cents: 1_500_000, currency: 'USD', status: 'issued',
    issued_at: '2026-08-01T00:00:00.000Z', deliverable_name: 'Submission draft', client_name: 'Sable Protocol',
  }];
  state.statusRows = [];
  state.transitionCount = 1;
  state.insertThrows = null;
  state.queries = [];
});

describe('issue — traces to an acceptance or it does not exist', () => {
  const issue = (body: unknown, role: 'operator' | 'approver' = 'approver') =>
    app(role).request('/invoices/issue', { method: 'POST', body: JSON.stringify(body) });

  it('bills an accepted deliverable and numbers it from its identity', async () => {
    const res = await issue({ deliverableId: 'del-1', amountCents: 1_500_000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.invoice.number).toBe('GPS-000031');
    expect(body.data.invoice.amountCents).toBe(1_500_000);
    const insert = state.queries.find((q) => q.sql.includes('INSERT INTO gps_invoice'))!;
    expect(insert.params[5]).toBe('nik');
  });

  it('refuses to bill an UNACCEPTED deliverable — 409 NOT_TRACED, nothing inserted', async () => {
    state.deliverableRows = [{ ...ACCEPTED_DELIVERABLE, accepted_at: null }];
    const res = await issue({ deliverableId: 'del-1', amountCents: 1_500_000 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_TRACED');
    expect(state.queries.some((q) => q.sql.includes('INSERT INTO gps_invoice'))).toBe(false);
  });

  it('is an APPROVER act — a plain operator is 403', async () => {
    expect((await issue({ deliverableId: 'del-1', amountCents: 1_500_000 }, 'operator')).status).toBe(403);
  });

  it('refuses a non-positive amount and a double-bill', async () => {
    expect((await issue({ deliverableId: 'del-1', amountCents: 0 })).status).toBe(400);
    state.insertThrows = 'duplicate key value violates unique constraint "gps_invoice_one_per_deliverable"';
    const dup = await issue({ deliverableId: 'del-1', amountCents: 100 });
    expect(dup.status).toBe(409);
    expect((await dup.json()).code).toBe('ALREADY_INVOICED');
  });
});

describe('the lifecycle — states, each attributed', () => {
  it('pay records a reference (rails external) and refuses without one', async () => {
    expect((await app().request('/invoices/31/pay', { method: 'POST', body: JSON.stringify({}) })).status).toBe(400);
    const res = await app().request('/invoices/31/pay', { method: 'POST', body: JSON.stringify({ reference: 'SEPA-2026-88' }) });
    expect(res.status).toBe(200);
    const upd = state.queries.find((q) => q.sql.startsWith('UPDATE gps_invoice') && q.sql.includes("'paid'"))!;
    expect(upd.params).toEqual([31, 'nik', 'SEPA-2026-88', 'issued', 'disputed']);
  });

  it('dispute is a reasoned operator act; an illegal transition is 409', async () => {
    expect((await app('operator').request('/invoices/31/dispute', { method: 'POST', body: JSON.stringify({ reason: 'scope contested' }) })).status).toBe(200);
    state.transitionCount = 0;
    state.statusRows = [{ status: 'paid' }];
    const res = await app('operator').request('/invoices/31/dispute', { method: 'POST', body: JSON.stringify({ reason: 'too late' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ILLEGAL_TRANSITION');
  });

  it('void is an approver act and demands a reason', async () => {
    expect((await app('operator').request('/invoices/31/void', { method: 'POST', body: JSON.stringify({ reason: 'x' }) })).status).toBe(403);
    expect((await app().request('/invoices/31/void', { method: 'POST', body: JSON.stringify({}) })).status).toBe(400);
    expect((await app().request('/invoices/31/void', { method: 'POST', body: JSON.stringify({ reason: 'issued in error' }) })).status).toBe(200);
  });
});

describe('the chase — one mouth, never a send', () => {
  it('gates the deterministic draft, records it in the ledger, and returns the verdict — no send path', async () => {
    const res = await app('operator').request('/invoices/31/chase', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.draft).toContain('GPS-000031');
    expect(body.data.draft).toContain('$15,000');
    expect(body.data.verdict.allowed).toBe(true);
    expect(body.data.verdict.reference).toBe('gateref42');
    // The unscoped ledger never leaks into the response.
    expect(JSON.stringify(body)).not.toContain('UNSCOPED');
    const gateReq = gateOutboundText.mock.calls[0][1];
    expect(gateReq).toMatchObject({ verb: 'original', phase: 'draft', actor: 'nik' });
    expect(recordGateDecision).toHaveBeenCalledOnce();
  });

  it('does not chase a settled invoice', async () => {
    state.chaseRows = [{ ...state.chaseRows[0], status: 'paid' }];
    const res = await app('operator').request('/invoices/31/chase', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_OPEN');
    expect(gateOutboundText).not.toHaveBeenCalled();
  });
});

describe('the read', () => {
  it('answers 200-empty with the migration sentence when 0082 is absent', async () => {
    state.migrated = false;
    const res = await app().request('/invoices');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ invoices: [], aging: null, registerPresent: false });
    expect(body.meta.migrated).toBe(false);
  });
});
