import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { listQueue, markTaskSent, skipTask, snoozeTask } from '../outreach/queue.js';
import { nextSendWindowStart } from '../outreach/sendWindow.js';

export const queueRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** GET /v1/outreach/queue — due assisted-channel touches + cap guidance. */
queueRoutes.get('/', requireOperator, async (c) => {
  try {
    const qs = c.req.query();
    const result = await listQueue({
      channel: qs.channel || undefined,
      status: qs.status || undefined,
      limit: qs.limit ? Number(qs.limit) : undefined,
    });
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[queue] list error:', err);
    return c.json({ error: 'Failed to list queue', code: 'QUEUE_ERROR' }, 500);
  }
});

/** GET /v1/outreach/queue/config — non-secret operator config for the UI. */
queueRoutes.get('/config', requireOperator, (c) => {
  return c.json({
    data: { lcxTelegramHandle: env.lcxTelegramHandle || null },
    meta: meta(),
  });
});

queueRoutes.post('/:id/sent', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ body?: string }>().catch(() => ({ body: undefined }));
  const result = await markTaskSent(id, operator.id, body.body);
  if (!result.ok) return c.json({ error: result.error, code: 'QUEUE_SENT_ERROR' }, 409);
  return c.json({ data: { id, status: 'sent' }, meta: meta() });
});

queueRoutes.post('/:id/skip', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  const result = await skipTask(id, operator.id);
  if (!result.ok) return c.json({ error: result.error, code: 'QUEUE_SKIP_ERROR' }, 409);
  return c.json({ data: { id, status: 'skipped' }, meta: meta() });
});

queueRoutes.post('/:id/snooze', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ until?: string }>().catch(() => ({ until: undefined }));
  const until = body.until ? new Date(body.until) : nextSendWindowStart();
  if (Number.isNaN(until.getTime())) {
    return c.json({ error: 'Invalid until date', code: 'VALIDATION' }, 400);
  }
  const result = await snoozeTask(id, until, operator.id);
  if (!result.ok) return c.json({ error: result.error, code: 'QUEUE_SNOOZE_ERROR' }, 409);
  return c.json({ data: { id, snoozedUntil: until.toISOString() }, meta: meta() });
});
