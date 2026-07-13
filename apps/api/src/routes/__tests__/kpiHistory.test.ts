/**
 * Integration tests for GET /v1/kpis/history (daily KPI snapshots).
 * Runs against the local dev database (same convention as features.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { closeDb, getDb } from '../../db/index.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}` };

describe('GET /v1/kpis/history', () => {
  const app = createApp();
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
    // Idempotent seed: one snapshot for today so the window is never empty.
    await getDb().execute(sql`
      INSERT INTO kpi_daily_snapshots (snapshot_date, funnel_enrolled, funnel_replied, funnel_proposal, funnel_won, revenue_listing)
      VALUES (${today}, 12, 5, 3, 1, 2000000)
      ON CONFLICT (snapshot_date) DO UPDATE SET
        funnel_enrolled = EXCLUDED.funnel_enrolled,
        funnel_replied = EXCLUDED.funnel_replied,
        funnel_proposal = EXCLUDED.funnel_proposal,
        funnel_won = EXCLUDED.funnel_won,
        revenue_listing = EXCLUDED.revenue_listing
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects unauthenticated access', async () => {
    const res = await app.request('/v1/kpis/history');
    expect(res.status).toBe(401);
  });

  it('returns snapshots ascending by date with camelCase fields', async () => {
    const res = await app.request('/v1/kpis/history?days=30', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta.days).toBe(30);

    const dates = body.data.map((s: { date: string }) => s.date);
    expect([...dates].sort()).toEqual(dates);

    const todayRow = body.data.find((s: { date: string }) => s.date === today);
    expect(todayRow).toBeTruthy();
    expect(todayRow.funnelEnrolled).toBe(12);
    expect(todayRow.funnelReplied).toBe(5);
    expect(todayRow.funnelProposal).toBe(3);
    expect(todayRow.funnelWon).toBe(1);
    expect(todayRow.totalRevenue).toBeGreaterThanOrEqual(2000000);
  });

  it('clamps and defaults a bad days param instead of erroring', async () => {
    const res = await app.request('/v1/kpis/history?days=notanumber', { headers: AUTH });
    expect(res.status).toBe(200);
    expect((await res.json()).meta.days).toBe(30);

    const clamped = await app.request('/v1/kpis/history?days=99999', { headers: AUTH });
    expect(clamped.status).toBe(200);
    expect((await clamped.json()).meta.days).toBe(365);
  });
});
