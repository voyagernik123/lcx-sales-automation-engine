import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { WORKSPACES } from '@lcx/shared';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * THE SERVICES LIMB OF THE WEEKLY REVIEW, AND THE LEAK IT REFUSES TO BE.
 *
 * `routes/gpsLoop.ts` carries a wiring note instructing that `kpi/wbr.ts` fill its
 * `gps?: WbrGpsBlock` slot from `loopSnapshot(...).wbr` inside `composeWbr`. Following
 * it would put the services book inside `wbr_reports.payload`, which `getWbrForWeek`
 * returns verbatim to any `/v1/wbr` caller — and `/v1/wbr` is GOVERNANCE, while `gps`
 * is a separate, non-legacy grant. The Monday cron would also be persisting, as the
 * shared machine principal, a compartment that principal cannot read.
 *
 * So these tests assert the shape of the fix, not the happy path:
 *   1. a governance-only reader gets NO gps limb, and is TOLD it was withheld;
 *   2. a `gps` holder gets it;
 *   3. a `gps` key already sitting in a stored payload is STRIPPED rather than served;
 *   4. a past week is withheld with a reason, because the figures are cumulative;
 *   5. cash is per currency — no single total across currencies.
 */

const loadEntitlements = vi.hoisted(() => vi.fn());
vi.mock('../../access/entitlements.js', () => ({ loadEntitlements }));

const loopSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../gps/loop.js', () => ({ loopSnapshot }));

const state = vi.hoisted(() => ({
  report: {} as Record<string, unknown>,
  invoiceRows: [] as Record<string, unknown>[],
  invoiceTableMissing: false,
}));

vi.mock('../../kpi/wbr.js', () => ({
  getLatestWbr: async () => state.report,
  getWbrForWeek: async () => state.report,
  listWbrWeeks: async () => ['2026-08-17'],
  weekStartOf: () => '2026-08-17',
}));

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (/FROM gps_invoice/.test(sql)) {
        if (state.invoiceTableMissing) throw new Error('relation "gps_invoice" does not exist');
        return { rows: state.invoiceRows };
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { wbrRoutes } = await import('../wbr.js');

const app = () => {
  const a = new Hono<{ Variables: AuthVariables }>();
  a.use('*', async (c, next) => {
    c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'operator' } as never);
    await next();
  });
  a.route('/v1/wbr', wbrRoutes);
  return a;
};

const get = async (q = '') => {
  const res = await app().request(`/v1/wbr${q}`);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

beforeEach(() => {
  loadEntitlements.mockReset();
  loopSnapshot.mockReset();
  loopSnapshot.mockResolvedValue({ wbr: { weekStart: '2026-08-17', lines: ['services line'] } });
  state.report = { weekStart: '2026-08-17', exceptions: [], commitments: [] };
  state.invoiceRows = [];
  state.invoiceTableMissing = false;
});

describe('the compartment boundary', () => {
  it('confirms gps and governance are genuinely different grants', () => {
    const gps = WORKSPACES.find((w) => w.id === 'gps');
    const governance = WORKSPACES.find((w) => w.id === 'governance');
    // If these ever converge, the withholding below stops being necessary — and the
    // test should be deleted deliberately rather than quietly passing for a new reason.
    expect(gps?.legacy).toBe(false);
    expect(governance?.legacy).toBe(true);
  });

  it('WITHHOLDS the limb from a governance-only reader, and says so', async () => {
    loadEntitlements.mockResolvedValue({ governance: 'operate' });
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.data.report.gps).toBeUndefined();
    expect(body.data.gpsDisposition.state).toBe('withheld_no_grant');
    expect(body.data.gpsDisposition.detail).toContain('withheld deliberately');
    // The services composer is never even invoked for an unentitled reader.
    expect(loopSnapshot).not.toHaveBeenCalled();
  });

  it('includes it for a gps holder', async () => {
    loadEntitlements.mockResolvedValue({ governance: 'operate', gps: 'view' });
    const { body } = await get();
    expect(body.data.gpsDisposition.state).toBe('included');
    expect(body.data.report.gps.lines).toEqual(['services line']);
  });

  it('STRIPS a gps key that is already in the stored payload', async () => {
    /* Defence in depth: getWbrForWeek casts raw jsonb to WbrReport, so a hand-run
       insert or a restored dump could carry a limb nobody checked. */
    state.report = { weekStart: '2026-08-17', gps: { lines: ['LEAKED FROM PAYLOAD'] } };
    loadEntitlements.mockResolvedValue({ governance: 'operate' });
    const { body } = await get();
    expect(JSON.stringify(body)).not.toContain('LEAKED FROM PAYLOAD');
    expect(body.data.report.gps).toBeUndefined();
  });

  it('withholds an unresolvable entitlement rather than showing the limb', async () => {
    loadEntitlements.mockRejectedValue(new Error('db down'));
    const { body } = await get();
    expect(body.data.gpsDisposition.state).toBe('unreadable');
    expect(body.data.report.gps).toBeUndefined();
  });
});

describe('the week, and the cash', () => {
  it('withholds a PAST week with the cumulative-figures reason', async () => {
    loadEntitlements.mockResolvedValue({ gps: 'view' });
    state.report = { weekStart: '2026-06-01' };
    const { body } = await get('?week=2026-06-01');
    expect(body.data.gpsDisposition.state).toBe('withheld_historical_week');
    expect(body.data.gpsDisposition.detail).toContain('cumulative');
    expect(body.data.report.gps).toBeUndefined();
  });

  it('reports cash PER CURRENCY and never one total across them', async () => {
    loadEntitlements.mockResolvedValue({ gps: 'view' });
    state.invoiceRows = [
      { id: 1, status: 'issued', amount_cents: 1_000_000, currency: 'USD', issued_at: '2026-08-01T00:00:00Z', paid_at: null },
      { id: 2, status: 'issued', amount_cents: 2_000_000, currency: 'EUR', issued_at: '2026-08-10T00:00:00Z', paid_at: null },
      { id: 3, status: 'paid', amount_cents: 500_000, currency: 'USD', issued_at: '2026-07-01T00:00:00Z', paid_at: '2026-08-18T00:00:00Z' },
    ];
    const { body } = await get();
    const cash = body.data.gpsDisposition.cash;
    expect(cash.state).toBe('measured');
    expect(cash.open).toHaveLength(2);
    expect(cash.open.map((r: any) => r.currency)).toEqual(['EUR', 'USD']);
    // No field anywhere carries a cross-currency sum of the two open invoices.
    expect(JSON.stringify(cash)).not.toContain('3000000');
    expect(cash.paidThisWeek).toEqual([{ currency: 'USD', count: 1, amountCents: 500_000 }]);
    // The oldest open invoice is the chase list's first line, by its immutable number.
    expect(cash.oldestOpen.number).toBe('GPS-000001');
  });

  it('says register-absent rather than zero when 0082 is unapplied', async () => {
    loadEntitlements.mockResolvedValue({ gps: 'view' });
    state.invoiceTableMissing = true;
    const { body } = await get();
    expect(body.data.gpsDisposition.cash.state).toBe('register_absent');
    expect(body.data.gpsDisposition.cash.note).toContain('not-loaded, not zero');
  });
});
