import { beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { WATCH_CAP, nothingRecordedSince } from '@lcx/shared';

vi.mock('../../access/entitlements.js', () => ({ loadEntitlements: vi.fn() }));
vi.mock('../../gps/invoicing.js', () => ({
  isInvoiceMigrated: vi.fn(async () => false),
  invoiceAgingSummary: vi.fn(),
}));
vi.mock('../../gps/conflict.js', () => ({
  loadPerimeter: vi.fn(async () => ({ source: 'compiled_placeholder', sourceReason: '', stored: [], profiles: [] })),
  perimeterView: vi.fn(() => ({ reviewWarningDays: 30, cells: [] })),
}));

import { loadEntitlements } from '../../access/entitlements.js';
import { composeWatch } from '../watch.js';

/**
 * THE WATCH's composer, against a fake pool. What is under test is the CONTRACT, not SQL:
 * entitlement filters before any register is asked; ranking is the stated prior; a register the
 * environment lacks is said in `absent`; and the cap reports its remainder as a count.
 */

const SINCE = '2026-09-01T00:00:00.000Z';
const AS_OF = '2026-09-02T00:00:00.000Z';

function fakePool(rowsFor: (sql: string) => unknown[], missingTables: string[] = []) {
  const asked: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (/to_regclass/.test(sql)) return { rows: [{ rel: missingTables.includes(String(params?.[0])) ? null : 'x' }] };
      asked.push(sql);
      return { rows: rowsFor(sql) };
    }),
  } as unknown as pg.Pool;
  return { pool, asked };
}

describe('composeWatch', () => {
  beforeEach(() => vi.mocked(loadEntitlements).mockReset());

  it('entitlement is the FIRST filter: a sales-only operator never asks gps, marketing or governance tables', async () => {
    vi.mocked(loadEntitlements).mockResolvedValue({ sales: 'view' });
    const { pool, asked } = fakePool(() => []);
    const out = await composeWatch(pool, 'op', SINCE, AS_OF);
    expect(asked.some((s) => /FROM gps_|FROM marketing_|FROM decisions/.test(s))).toBe(false);
    expect(asked.some((s) => /FROM deals/.test(s))).toBe(true);
    expect(Object.keys(out.byWorkspace)).toEqual(['sales']);
    expect(out.byWorkspace.sales).toEqual({ changed: 0, top: null });
    expect(out.items).toEqual([]);
    expect(out.absent).toContain(nothingRecordedSince(SINCE));
    expect(out.rankingBasis).toBe('stated_prior');
  });

  it('ranks money above activity regardless of recency, dates every item by the record, and routes it', async () => {
    vi.mocked(loadEntitlements).mockResolvedValue({ sales: 'operate' });
    const { pool } = fakePool((sql) => {
      if (/FROM audit_log/.test(sql)) return [{ id: 1, actor: 'nik', action: 'project.track', entity: 'projects', entity_id: 'abc12345-x', created_at: new Date('2026-09-01T12:00:00Z') }];
      if (/FROM deals/.test(sql)) return [{ id: 7, stage: 'won', won_at: new Date('2026-09-01T08:00:00Z'), updated_at: new Date('2026-09-01T08:00:00Z') }];
      return [];
    });
    const out = await composeWatch(pool, 'op', SINCE, AS_OF);
    expect(out.items.map((i) => i.kind)).toEqual(['money', 'activity']);
    expect(out.items[0]).toMatchObject({ rank: 0, source: 'table', href: '/deal-board', at: '2026-09-01T08:00:00.000Z', title: 'deal won' });
    expect(out.items[1]).toMatchObject({ rank: 1, source: 'audit', href: '/bd-pipeline/abc12345-x', title: 'project track' });
    expect(out.byWorkspace.sales).toEqual({ changed: 2, top: out.items[0] });
    expect(out.absent).toEqual([]);
  });

  it('a register the environment lacks is SAID once, never skipped silently', async () => {
    vi.mocked(loadEntitlements).mockResolvedValue({ governance: 'view' });
    const { pool } = fakePool(() => [], ['decisions']);
    const out = await composeWatch(pool, 'op', SINCE, AS_OF);
    expect(out.absent.filter((a) => a === 'decisions does not exist on this environment.')).toHaveLength(1);
  });

  it('caps at WATCH_CAP and reports the remainder as a count, never dropping it', async () => {
    vi.mocked(loadEntitlements).mockResolvedValue({ sales: 'view' });
    const { pool } = fakePool((sql) =>
      /FROM handoffs/.test(sql)
        ? Array.from({ length: WATCH_CAP + 8 }, (_, i) => ({ id: i, status: 'open', updated_at: new Date(Date.parse(SINCE) + (i + 1) * 60_000) }))
        : [],
    );
    const out = await composeWatch(pool, 'op', SINCE, AS_OF);
    expect(out.items).toHaveLength(WATCH_CAP);
    expect(out.unranked).toBe(8);
    expect(out.byWorkspace.sales?.changed).toBe(WATCH_CAP + 8);
  });

  it('a compartment the operator does not hold has NO key — absence, not a zero that reads as quiet', async () => {
    vi.mocked(loadEntitlements).mockResolvedValue({ sales: 'view', gps: 'none' as never });
    const { pool } = fakePool(() => []);
    const out = await composeWatch(pool, 'op', SINCE, AS_OF);
    expect('gps' in out.byWorkspace).toBe(false);
  });
});
