/**
 * Phase-6 analytics routes (mounted alongside analyticsRoutes at /v1/analytics):
 *   GET  /drilldown        — underlying rows behind a KPI metric
 *   GET  /board-report     — deterministic board report snapshot
 *   GET  /news             — market intelligence feed
 *   POST /news/refresh     — manual pull from free sources
 *   GET  /bd-performance   — per-owner activity + conversion stats
 *   GET  /reports          — list saved reports
 *   POST /reports          — create a saved report
 *   GET  /reports/schema   — allowlist for the report builder UI
 *   POST /reports/run      — run an ad-hoc report config (not persisted)
 *   POST /reports/:id/run  — run a saved report
 *   GET  /anomalies        — statistical anomaly scan
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb, getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { buildBoardReport, type BoardPeriod } from '../analytics/boardReport.js';
import { runReport, describeReportSchema, ReportConfigError, type ReportConfig } from '../analytics/reportBuilder.js';
import { detectAnomalies } from '../analytics/anomaly.js';
import { refreshNews } from '../connectors/news.js';

export const analytics2Routes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/* ────────────────────────────────────────────── 6-2 KPI drill-down */

const DRILLDOWN_METRICS = ['enrolled', 'replied', 'proposal', 'won', 'stalled'] as const;
type DrilldownMetric = (typeof DRILLDOWN_METRICS)[number];

analytics2Routes.get('/drilldown', requireOperator, async (c) => {
  const qs = c.req.query();
  const metric = qs.metric as DrilldownMetric;
  if (!DRILLDOWN_METRICS.includes(metric)) {
    return c.json({ error: `metric must be one of: ${DRILLDOWN_METRICS.join(', ')}`, code: 'BAD_METRIC' }, 400);
  }
  const limit = Math.min(Number(qs.limit) || 200, 1000);
  const from = qs.from ? new Date(qs.from) : null;
  const to = qs.to ? new Date(qs.to) : null;
  const fromValid = from && !Number.isNaN(from.getTime());
  const toValid = to && !Number.isNaN(to.getTime());

  // Per-metric the date range applies to a different timestamp column.
  const dateCol: Record<DrilldownMetric, string> = {
    enrolled: 'se.enrolled_at',
    replied: 'h.created_at',
    proposal: 'd.updated_at',
    won: 'd.won_at',
    stalled: 'd.updated_at',
  };
  const rangeConds = [] as ReturnType<typeof sql>[];
  if (fromValid) rangeConds.push(sql`${sql.raw(dateCol[metric])} >= ${from!.toISOString()}::timestamptz`);
  if (toValid) rangeConds.push(sql`${sql.raw(dateCol[metric])} <= ${to!.toISOString()}::timestamptz`);
  const range = rangeConds.length ? sql` AND ${sql.join(rangeConds, sql` AND `)}` : sql``;

  const db = getDb();
  try {
    let query;
    switch (metric) {
      case 'enrolled':
        query = sql`
          SELECT se.id, se.project_id, p.name AS project_name, p.ticker,
                 se.enrolled_at AS ts, se.status, os.channel
          FROM sequence_enrollments se
          JOIN projects p ON p.id = se.project_id
          LEFT JOIN outreach_sequences os ON os.id = se.sequence_id
          WHERE TRUE ${range}
          ORDER BY se.enrolled_at DESC NULLS LAST LIMIT ${limit}`;
        break;
      case 'replied':
        query = sql`
          SELECT h.id, h.project_id, p.name AS project_name, p.ticker,
                 h.created_at AS ts, h.status, h.channel
          FROM handoffs h
          JOIN projects p ON p.id = h.project_id
          WHERE TRUE ${range}
          ORDER BY h.created_at DESC NULLS LAST LIMIT ${limit}`;
        break;
      case 'proposal':
        query = sql`
          SELECT d.id, d.project_id, p.name AS project_name, p.ticker,
                 d.updated_at AS ts, d.stage, d.package_type, d.package_value
          FROM deals d
          JOIN projects p ON p.id = d.project_id
          WHERE d.stage IN ('proposal','negotiating','won') ${range}
          ORDER BY d.updated_at DESC NULLS LAST LIMIT ${limit}`;
        break;
      case 'won':
        query = sql`
          SELECT d.id, d.project_id, p.name AS project_name, p.ticker,
                 d.won_at AS ts, d.stage, d.package_type, d.package_value
          FROM deals d
          JOIN projects p ON p.id = d.project_id
          WHERE d.stage = 'won' ${range}
          ORDER BY d.won_at DESC NULLS LAST LIMIT ${limit}`;
        break;
      case 'stalled':
        query = sql`
          SELECT d.id, d.project_id, p.name AS project_name, p.ticker,
                 d.updated_at AS ts, d.stage,
                 EXTRACT(DAY FROM (NOW() - d.updated_at)) AS days_since_update
          FROM deals d
          JOIN projects p ON p.id = d.project_id
          WHERE d.stage NOT IN ('won','lost','not_started')
            AND d.updated_at <= NOW() - INTERVAL '3 days' ${range}
          ORDER BY d.updated_at ASC LIMIT ${limit}`;
        break;
    }

    const result = await db.execute(query);
    const rows = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      projectId: r.project_id ?? null,
      projectName: r.project_name ?? null,
      ticker: r.ticker ?? null,
      timestamp: r.ts ?? null,
      stage: r.stage ?? null,
      status: r.status ?? null,
      channel: r.channel ?? null,
      packageType: r.package_type ?? null,
      packageValue: r.package_value != null ? Number(r.package_value) : null,
      daysSinceUpdate: r.days_since_update != null ? Number(r.days_since_update) : null,
    }));
    return c.json({ data: rows, meta: { ...meta(), metric, count: rows.length } });
  } catch (err) {
    console.error('[analytics2] drilldown error:', err);
    return c.json({ error: 'Drilldown failed', code: 'DRILLDOWN_ERROR' }, 500);
  }
});

/* ────────────────────────────────────────────── 6-4 board report */

analytics2Routes.get('/board-report', requireOperator, async (c) => {
  const p = c.req.query('period');
  const period: BoardPeriod = p === 'month' || p === 'quarter' ? p : 'week';
  try {
    const report = await buildBoardReport(getPool(), period);
    return c.json({ data: report, meta: meta() });
  } catch (err) {
    console.error('[analytics2] board-report error:', err);
    return c.json({ error: 'Board report failed', code: 'BOARD_REPORT_ERROR' }, 500);
  }
});

/* ────────────────────────────────────────────── 6-5 market news */

analytics2Routes.get('/news', requireOperator, async (c) => {
  const qs = c.req.query();
  const limit = Math.min(Number(qs.limit) || 100, 500);
  const minRelevance = Math.max(0, Number(qs.minRelevance) || 0);
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, source, title, url, published_at, tickers, relevance_score, matched_project_ids, created_at
      FROM market_news
      WHERE relevance_score >= ${minRelevance}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT ${limit}`);
    const data = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      source: r.source,
      title: r.title,
      url: r.url ?? null,
      publishedAt: r.published_at ?? null,
      tickers: (r.tickers as string[] | null) ?? [],
      relevanceScore: Number(r.relevance_score ?? 0),
      matchedProjectIds: (r.matched_project_ids as string[] | null) ?? [],
      createdAt: r.created_at,
    }));
    return c.json({ data, meta: { ...meta(), count: data.length } });
  } catch (err) {
    console.error('[analytics2] news error:', err);
    return c.json({ error: 'Failed to load news', code: 'NEWS_ERROR' }, 500);
  }
});

analytics2Routes.post('/news/refresh', requireOperator, async (c) => {
  try {
    const stats = await refreshNews(getPool());
    return c.json({ data: stats, meta: meta() });
  } catch (err) {
    console.error('[analytics2] news refresh error:', err);
    return c.json({ error: 'News refresh failed', code: 'NEWS_REFRESH_ERROR' }, 500);
  }
});

/* ────────────────────────────────────────────── 6-7 BD performance */

analytics2Routes.get('/bd-performance', requireOperator, async (c) => {
  const db = getDb();
  try {
    const dealRows = await db.execute(sql`
      SELECT COALESCE(owner, 'unassigned') AS owner,
             COUNT(*) AS deals_total,
             COUNT(*) FILTER (WHERE stage = 'won') AS won,
             COUNT(*) FILTER (WHERE stage = 'lost') AS lost,
             COUNT(*) FILTER (WHERE stage NOT IN ('won','lost','not_started')) AS open,
             COALESCE(SUM(package_value) FILTER (WHERE stage = 'won'), 0) AS won_value
      FROM deals GROUP BY COALESCE(owner, 'unassigned')`);

    const handoffRows = await db.execute(sql`
      SELECT COALESCE(assigned_to, 'unassigned') AS owner,
             COUNT(*) AS handoffs_total,
             COUNT(*) FILTER (WHERE status = 'closed') AS handoffs_closed
      FROM handoffs GROUP BY COALESCE(assigned_to, 'unassigned')`);

    interface OwnerStats {
      dealsTotal: number; won: number; lost: number; open: number;
      wonValue: number; winRate: number; handoffsTotal: number; handoffsClosed: number;
    }
    const byOwner: Record<string, OwnerStats> = {};
    for (const r of (dealRows.rows ?? [])) {
      const row = r as Record<string, unknown>;
      const owner = String(row.owner);
      const wonN = Number(row.won ?? 0);
      const lostN = Number(row.lost ?? 0);
      const closed = wonN + lostN;
      byOwner[owner] = {
        dealsTotal: Number(row.deals_total ?? 0),
        won: wonN,
        lost: lostN,
        open: Number(row.open ?? 0),
        wonValue: Number(row.won_value ?? 0),
        winRate: closed > 0 ? Math.round((wonN / closed) * 100) : 0,
        handoffsTotal: 0,
        handoffsClosed: 0,
      };
    }
    for (const r of (handoffRows.rows ?? [])) {
      const row = r as Record<string, unknown>;
      const owner = String(row.owner);
      if (!byOwner[owner]) {
        byOwner[owner] = { dealsTotal: 0, won: 0, lost: 0, open: 0, wonValue: 0, winRate: 0, handoffsTotal: 0, handoffsClosed: 0 };
      }
      byOwner[owner].handoffsTotal = Number(row.handoffs_total ?? 0);
      byOwner[owner].handoffsClosed = Number(row.handoffs_closed ?? 0);
    }

    const data = Object.entries(byOwner)
      .map(([owner, stats]) => ({ owner, ...stats }))
      .sort((a, b) => b.wonValue - a.wonValue || b.dealsTotal - a.dealsTotal);

    return c.json({ data, meta: { ...meta(), owners: data.length } });
  } catch (err) {
    console.error('[analytics2] bd-performance error:', err);
    return c.json({ error: 'BD performance failed', code: 'BD_PERF_ERROR' }, 500);
  }
});

/* ────────────────────────────────────────────── 6-8 custom report builder */

analytics2Routes.get('/reports/schema', requireOperator, (c) => {
  return c.json({ data: describeReportSchema(), meta: meta() });
});

analytics2Routes.get('/reports', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, name, description, config, created_by, created_at, updated_at
      FROM saved_reports ORDER BY created_at DESC LIMIT 200`);
    const data = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      name: r.name,
      description: r.description ?? null,
      config: r.config,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[analytics2] list reports error:', err);
    return c.json({ error: 'Failed to list reports', code: 'REPORTS_ERROR' }, 500);
  }
});

analytics2Routes.post('/reports', requireOperator, async (c) => {
  let body: { name?: string; description?: string; config?: ReportConfig };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_BODY' }, 400);
  }
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'name is required', code: 'BAD_BODY' }, 400);
  if (!body.config || typeof body.config !== 'object') {
    return c.json({ error: 'config is required', code: 'BAD_BODY' }, 400);
  }
  // Validate the config by running it; rejects unknown entities/columns/ops.
  try {
    await runReport(body.config);
  } catch (err) {
    if (err instanceof ReportConfigError) return c.json({ error: err.message, code: 'BAD_CONFIG' }, 400);
    throw err;
  }

  const db = getDb();
  const id = randomUUID();
  try {
    await db.execute(sql`
      INSERT INTO saved_reports (id, name, description, config)
      VALUES (${id}, ${name}, ${body.description ?? null}, ${JSON.stringify(body.config)}::jsonb)`);
    return c.json({ data: { id, name }, meta: meta() }, 201);
  } catch (err) {
    console.error('[analytics2] create report error:', err);
    return c.json({ error: 'Failed to save report', code: 'REPORT_SAVE_ERROR' }, 500);
  }
});

// Ad-hoc run (not persisted) — powers the builder UI "Run" button.
analytics2Routes.post('/reports/run', requireOperator, async (c) => {
  let config: ReportConfig;
  try {
    config = (await c.req.json()) as ReportConfig;
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_BODY' }, 400);
  }
  try {
    const result = await runReport(config);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    if (err instanceof ReportConfigError) return c.json({ error: err.message, code: 'BAD_CONFIG' }, 400);
    console.error('[analytics2] run report error:', err);
    return c.json({ error: 'Report failed', code: 'REPORT_RUN_ERROR' }, 500);
  }
});

analytics2Routes.post('/reports/:id/run', requireOperator, async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  try {
    const result = await db.execute(sql`SELECT config FROM saved_reports WHERE id = ${id} LIMIT 1`);
    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: 'Report not found', code: 'NOT_FOUND' }, 404);
    const config = row.config as ReportConfig;
    const report = await runReport(config);
    return c.json({ data: report, meta: meta() });
  } catch (err) {
    if (err instanceof ReportConfigError) return c.json({ error: err.message, code: 'BAD_CONFIG' }, 400);
    console.error('[analytics2] run saved report error:', err);
    return c.json({ error: 'Report failed', code: 'REPORT_RUN_ERROR' }, 500);
  }
});

/* ────────────────────────────────────────────── 6-10 anomalies */

analytics2Routes.get('/anomalies', requireOperator, async (c) => {
  try {
    const anomalies = await detectAnomalies(getPool());
    return c.json({ data: anomalies, meta: { ...meta(), count: anomalies.length } });
  } catch (err) {
    console.error('[analytics2] anomalies error:', err);
    return c.json({ error: 'Anomaly scan failed', code: 'ANOMALY_ERROR' }, 500);
  }
});
