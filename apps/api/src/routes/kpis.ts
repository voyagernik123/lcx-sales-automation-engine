import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { monteCarloForecast, dealWinProbability } from '@lcx/shared';
import {
  computeKpis,
  createPostListingTriggers,
  listTriggers,
  updateTriggerStatus,
  kpisToCsv,
} from '../kpi/service.js';

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

/* ─── Post-listing triggers ─── */


/** GET /v1/kpis/forecast — win probability per open deal + Monte Carlo quarter. */
kpiRoutes.get('/forecast', requireOperator, async (c) => {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT d.id, d.stage, d.package_value, p.name AS project_name,
             COALESCE(s.priority_score, 0) AS priority_score,
             FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400) AS days_since_update
      FROM deals d
      JOIN projects p ON p.id = d.project_id
      LEFT JOIN scores s ON s.project_id = d.project_id
      WHERE d.stage NOT IN ('won', 'lost')
    `);

    const inputs = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      stage: String(r.stage),
      packageValueCents: r.package_value != null ? Number(r.package_value) : null,
      priorityScore: Number(r.priority_score ?? 0),
      daysSinceUpdate: Number(r.days_since_update ?? 0),
      projectName: String(r.project_name),
    }));

    const mc = monteCarloForecast(inputs, { runs: 10_000 });
    return c.json({
      data: {
        runs: mc.runs,
        p10: mc.p10Cents / 100,
        p50: mc.p50Cents / 100,
        p90: mc.p90Cents / 100,
        expected: mc.expectedCents / 100,
        deals: inputs.map((d) => ({
          id: d.id,
          projectName: d.projectName,
          stage: d.stage,
          value: (d.packageValueCents ?? 0) / 100,
          winProbability: Math.round(dealWinProbability(d) * 100),
          daysSinceUpdate: d.daysSinceUpdate,
        })).sort((a, b) => b.winProbability * b.value - a.winProbability * a.value),
      },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[kpis] forecast error:', err);
    return c.json({ error: 'Failed to compute forecast', code: 'FORECAST_ERROR' }, 500);
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
