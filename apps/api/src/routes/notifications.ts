import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { listNotifications, markRead } from '../notifications/service.js';
import { notificationBus, mintStreamToken, verifyStreamToken, type NotificationEvent } from '../notifications/events.js';

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Mint a short-lived token for the SSE stream (EventSource cannot send an
 * Authorization header, so the browser exchanges its operator key for this).
 */
notificationRoutes.post('/stream-token', requireOperator, (c) => {
  return c.json({ data: { token: mintStreamToken(), ttlSeconds: 600 }, meta: meta() });
});

/** Real-time notification stream (SSE). Auth via ?token= from /stream-token. */
notificationRoutes.get('/stream', (c) => {
  const token = c.req.query('token') ?? '';
  if (!verifyStreamToken(token)) {
    return c.json({ error: 'Invalid or expired stream token', code: 'UNAUTHORIZED' }, 401);
  }

  return streamSSE(c, async (stream) => {
    let alive = true;
    const onNotification = (event: NotificationEvent) => {
      void stream.writeSSE({ event: 'notification', data: JSON.stringify(event) });
    };
    notificationBus.on('notification', onNotification);
    stream.onAbort(() => {
      alive = false;
      notificationBus.off('notification', onNotification);
    });

    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ ok: true }) });

    // Heartbeat keeps proxies (Render/Cloudflare) from closing the socket;
    // also bounds the connection to the token's spirit (~30 min max).
    for (let i = 0; alive && i < 120; i++) {
      await stream.sleep(15_000);
      if (!alive) break;
      await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
    }
    notificationBus.off('notification', onNotification);
  });
});

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
