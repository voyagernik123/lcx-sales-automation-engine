import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  computeKpis,
  createPostListingTriggers,
  listTriggers,
  updateTriggerStatus,
  kpisToCsv,
} from '../kpi/service.js';
import { computeForecast } from '../kpi/forecast.js';
import { isUndefinedColumn } from '../lib/pg.js';

export const kpiRoutes = new Hono<{ Variables: AuthVariables }>();

kpiRoutes.get('/', requireOperator, async (c) => {
  try {
    const kpis = await computeKpis();
    return c.json({ data: kpis, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[kpis] compute error:', err);
    return c.json({ error: 'Failed to compute KPIs', code: 'QUERY_ERROR' }, 500);
  }
});

kpiRoutes.get('/export', requireOperator, async (c) => {
  try {
    const kpis = await computeKpis();
    const csv = kpisToCsv(kpis);
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="lcx-kpis-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(csv);
  } catch (err) {
    console.error('[kpis] export error:', err);
    return c.json({ error: 'Failed to export KPIs', code: 'QUERY_ERROR' }, 500);
  }
});

/** GET /v1/kpis/history?days=30 — daily KPI snapshots (kpi_daily_snapshots) for trends. */
kpiRoutes.get('/history', requireOperator, async (c) => {
  try {
    const raw = Number.parseInt(c.req.query('days') ?? '30', 10);
    const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const db = getDb();
    const result = await db.execute(sql`
      SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, new_high_score_leads_week,
             reply_rate_email_sent, reply_rate_email_replied,
             reply_rate_linkedin_sent, reply_rate_linkedin_replied,
             funnel_enrolled, funnel_replied, funnel_proposal, funnel_won,
             revenue_listing, revenue_marketing, revenue_liquidity,
             revenue_dual, revenue_emt, revenue_custom,
             stalled_deal_count, total_won, with_expansion, expansion_revenue,
             hot_deals, stalled_deals, overdue_actions
      FROM kpi_daily_snapshots
      WHERE snapshot_date >= ${cutoff}
      ORDER BY snapshot_date ASC
    `);

    const n = (v: unknown) => Number(v ?? 0);
    const data = (result.rows ?? []).map((r: Record<string, unknown>) => {
      const totalRevenue =
        n(r.revenue_listing) + n(r.revenue_marketing) + n(r.revenue_liquidity) +
        n(r.revenue_dual) + n(r.revenue_emt) + n(r.revenue_custom);
      return {
        date: String(r.snapshot_date),
        newHighScoreLeadsWeek: n(r.new_high_score_leads_week),
        emailSent: n(r.reply_rate_email_sent),
        emailReplied: n(r.reply_rate_email_replied),
        linkedinSent: n(r.reply_rate_linkedin_sent),
        linkedinReplied: n(r.reply_rate_linkedin_replied),
        funnelEnrolled: n(r.funnel_enrolled),
        funnelReplied: n(r.funnel_replied),
        funnelProposal: n(r.funnel_proposal),
        funnelWon: n(r.funnel_won),
        revenueListing: n(r.revenue_listing),
        revenueMarketing: n(r.revenue_marketing),
        revenueLiquidity: n(r.revenue_liquidity),
        revenueDual: n(r.revenue_dual),
        revenueEmt: n(r.revenue_emt),
        revenueCustom: n(r.revenue_custom),
        totalRevenue,
        stalledDealCount: n(r.stalled_deal_count),
        totalWon: n(r.total_won),
        withExpansion: n(r.with_expansion),
        expansionRevenue: n(r.expansion_revenue),
        hotDeals: n(r.hot_deals),
        stalledDeals: n(r.stalled_deals),
        overdueActions: n(r.overdue_actions),
      };
    });

    return c.json({ data, meta: { days, timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[kpis] history error:', err);
    return c.json({ error: 'Failed to load KPI history', code: 'QUERY_ERROR' }, 500);
  }
});

/* ─── Post-listing triggers ─── */


/** GET /v1/kpis/forecast — win probability per open deal + Monte Carlo quarter. */
kpiRoutes.get('/forecast', requireOperator, async (c) => {
  try {
    const forecast = await computeForecast();
    return c.json({
      data: forecast,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[kpis] forecast error:', err);
    return c.json({ error: 'Failed to compute forecast', code: 'FORECAST_ERROR' }, 500);
  }
});

/**
 * GET /v1/kpis/forecast-history?days=90 — stored daily forecast snapshots
 * ({p10,p50,p90,expected} written by the kpi_snapshot job, migration 0028).
 * Degrades to an empty list when the forecast column is missing.
 */
kpiRoutes.get('/forecast-history', requireOperator, async (c) => {
  const raw = Number.parseInt(c.req.query('days') ?? '90', 10);
  const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, forecast
      FROM kpi_daily_snapshots
      WHERE forecast IS NOT NULL AND snapshot_date >= ${cutoff}
      ORDER BY snapshot_date ASC
    `);

    const n = (v: unknown) => Number(v ?? 0);
    const data = (result.rows ?? []).map((r: Record<string, unknown>) => {
      const f = (r.forecast ?? {}) as Record<string, unknown>;
      return {
        date: String(r.snapshot_date),
        p10: n(f.p10),
        p50: n(f.p50),
        p90: n(f.p90),
        expected: n(f.expected),
      };
    });

    return c.json({ data, meta: { days, timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return c.json({ data: [], meta: { days, timestamp: new Date().toISOString(), version: env.version } });
    }
    console.error('[kpis] forecast-history error:', err);
    return c.json({ error: 'Failed to load forecast history', code: 'QUERY_ERROR' }, 500);
  }
});

kpiRoutes.get('/triggers', requireOperator, async (c) => {
  try {
    const projectId = c.req.query('projectId') ?? undefined;
    const triggers = await listTriggers(projectId);
    return c.json({ data: triggers, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[kpis] triggers list error:', err);
    return c.json({ error: 'Failed to list triggers', code: 'QUERY_ERROR' }, 500);
  }
});

kpiRoutes.post('/triggers', requireOperator, async (c) => {
  try {
    const body = await c.req.json<{ dealId: string; projectId: string; wonAt: string }>();
    if (!body.dealId || !body.projectId || !body.wonAt) {
      return c.json({ error: 'Missing required fields: dealId, projectId, wonAt', code: 'VALIDATION' }, 400);
    }
    const count = await createPostListingTriggers(body.dealId, body.projectId, new Date(body.wonAt));
    return c.json({ data: { created: count }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[kpis] triggers create error:', err);
    return c.json({ error: 'Failed to create triggers', code: 'QUERY_ERROR' }, 500);
  }
});

kpiRoutes.patch('/triggers/:id', requireOperator, async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json<{ status: 'pending' | 'drafted' | 'completed' | 'skipped'; draftContent?: string }>();
    if (!body.status) {
      return c.json({ error: 'Missing required field: status', code: 'VALIDATION' }, 400);
    }
    await updateTriggerStatus(id, body.status, body.draftContent);
    return c.json({ data: { id, status: body.status }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[kpis] triggers update error:', err);
    return c.json({ error: 'Failed to update trigger', code: 'QUERY_ERROR' }, 500);
  }
});
