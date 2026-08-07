import { Hono } from 'hono';
import { capAtLeast } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { loadEntitlements } from '../access/entitlements.js';
import { env } from '../lib/env.js';
import { listTasks, createManualTask, setTaskStatus } from '../tasks/service.js';

export const taskRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

taskRoutes.get('/', requireOperator, async (c) => {
  try {
    const qs = c.req.query();
    /*
     * Resolved per request from the live grant table, never cached on the principal: a
     * revoke must take effect on the next read. Same shape as `notifications.ts:24`.
     */
    const operator = c.get('operator');
    const ents = await loadEntitlements(getPool(), operator.id);
    const tasks = await listTasks({
      status: qs.status || undefined,
      projectId: qs.projectId || undefined,
      limit: qs.limit ? Number(qs.limit) : undefined,
      mayReadSales: capAtLeast(ents.sales, 'view'),
    });
    return c.json({ data: tasks, meta: meta() });
  } catch (err) {
    console.error('[tasks] list error:', err);
    return c.json({ error: 'Failed to list tasks', code: 'TASKS_ERROR' }, 500);
  }
});

taskRoutes.post('/', requireOperator, async (c) => {
  const body = await c.req.json<{ title?: string; detail?: string; projectId?: string; dueAt?: string }>();
  if (!body.title?.trim()) return c.json({ error: 'Title required', code: 'VALIDATION' }, 400);
  const id = await createManualTask({
    title: body.title.trim(),
    detail: body.detail,
    projectId: body.projectId,
    dueAt: body.dueAt,
  });
  return c.json({ data: { id }, meta: meta() }, 201);
});

taskRoutes.post('/:id/done', requireOperator, async (c) => {
  const ok = await setTaskStatus(c.req.param('id'), 'done');
  if (!ok) return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  return c.json({ data: { status: 'done' }, meta: meta() });
});

taskRoutes.post('/:id/dismiss', requireOperator, async (c) => {
  const ok = await setTaskStatus(c.req.param('id'), 'dismissed');
  if (!ok) return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  return c.json({ data: { status: 'dismissed' }, meta: meta() });
});
