import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { listNotifications, markRead } from '../notifications/service.js';

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

notificationRoutes.get('/', requireOperator, async (c) => {
  try {
    const result = await listNotifications(Number(c.req.query('limit')) || 30);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[notifications] list error:', err);
    return c.json({ error: 'Failed to list notifications', code: 'NOTIF_ERROR' }, 500);
  }
});

notificationRoutes.post('/read-all', requireOperator, async (c) => {
  await markRead('all');
  return c.json({ data: { ok: true }, meta: meta() });
});

notificationRoutes.post('/:id/read', requireOperator, async (c) => {
  await markRead(c.req.param('id'));
  return c.json({ data: { ok: true }, meta: meta() });
});
