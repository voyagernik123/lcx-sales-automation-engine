/**
 * Object monitor routes (Phase 3.1).
 *   GET    /v1/monitors                list
 *   POST   /v1/monitors                create
 *   PATCH  /v1/monitors/:id            update
 *   DELETE /v1/monitors/:id            delete
 *   GET    /v1/monitors/:id/activity   recent fires
 *   POST   /v1/monitors/tick           evaluate all now (also run by cron)
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  listMonitors, createMonitor, updateMonitor, deleteMonitor, monitorActivity,
  evaluateMonitors, isValidMonitor, type MonitorRow,
} from '../intel/monitors.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const monitorRoutes = new Hono<{ Variables: AuthVariables }>();

monitorRoutes.get('/', requireOperator, async (c) => {
  try {
    return c.json({ data: await listMonitors(getPool()), meta: meta() });
  } catch (err) {
    console.error('[monitors] list error:', err);
    return c.json({ error: 'Failed to list monitors', code: 'MONITOR_ERROR' }, 500);
  }
});

monitorRoutes.post('/', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  const body = await c.req.json<Partial<MonitorRow>>().catch(() => ({} as Partial<MonitorRow>));
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  const invalid = isValidMonitor({ condition: body.condition, action: body.action });
  if (invalid) return c.json({ error: invalid, code: 'VALIDATION' }, 400);
  try {
    const id = await createMonitor(getPool(), owner, body);
    return c.json({ data: { id }, meta: meta() }, 201);
  } catch (err) {
    console.error('[monitors] create error:', err);
    return c.json({ error: 'Failed to create monitor', code: 'MONITOR_ERROR' }, 500);
  }
});

monitorRoutes.patch('/:id', requireOperator, async (c) => {
  const body = await c.req.json<Partial<MonitorRow>>().catch(() => ({} as Partial<MonitorRow>));
  if (body.condition || body.action) {
    const invalid = isValidMonitor({ condition: body.condition, action: body.action });
    if (invalid) return c.json({ error: invalid, code: 'VALIDATION' }, 400);
  }
  try {
    const ok = await updateMonitor(getPool(), c.req.param('id'), body);
    return ok ? c.json({ data: { updated: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[monitors] update error:', err);
    return c.json({ error: 'Failed to update monitor', code: 'MONITOR_ERROR' }, 500);
  }
});

monitorRoutes.delete('/:id', requireOperator, async (c) => {
  try {
    const ok = await deleteMonitor(getPool(), c.req.param('id'));
    return ok ? c.json({ data: { deleted: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[monitors] delete error:', err);
    return c.json({ error: 'Failed to delete monitor', code: 'MONITOR_ERROR' }, 500);
  }
});

monitorRoutes.get('/:id/activity', requireOperator, async (c) => {
  try {
    return c.json({ data: await monitorActivity(getPool(), c.req.param('id')), meta: meta() });
  } catch (err) {
    console.error('[monitors] activity error:', err);
    return c.json({ error: 'Failed to load activity', code: 'MONITOR_ERROR' }, 500);
  }
});

monitorRoutes.post('/tick', requireOperator, async (c) => {
  try {
    return c.json({ data: await evaluateMonitors(getPool()), meta: meta() });
  } catch (err) {
    console.error('[monitors] tick error:', err);
    return c.json({ error: 'Monitor tick failed', code: 'MONITOR_ERROR' }, 500);
  }
});
