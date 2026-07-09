import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
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
