import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { getPool } from '../db/index.js';
import { loadEntitlements } from '../access/entitlements.js';
import {
  listNotifications,
  markRead,
  scopesFor,
  type NotificationScope,
} from '../notifications/service.js';
import { notificationBus, mintStreamToken, verifyStreamToken, type NotificationEvent } from '../notifications/events.js';

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * The compartments this actor may be shown, resolved per request from the live
 * grant table. Every handler below goes through this — there is no unscoped read
 * path left, because the unscoped default is exactly what leaked (0067).
 */
async function scopes(actorId: string): Promise<NotificationScope[]> {
  return scopesFor(await loadEntitlements(getPool(), actorId));
}

/**
 * Mint a short-lived token for the SSE stream (EventSource cannot send an
 * Authorization header, so the browser exchanges its operator key for this).
 * The token is bound to the requesting actor, so the stream can filter to what
 * that actor holds instead of broadcasting every compartment.
 */
notificationRoutes.post('/stream-token', requireOperator, (c) => {
  const operator = c.get('operator');
  return c.json({ data: { token: mintStreamToken(operator.id), ttlSeconds: 600 }, meta: meta() });
});

/** Real-time notification stream (SSE). Auth via ?token= from /stream-token. */
notificationRoutes.get('/stream', async (c) => {
  const verified = verifyStreamToken(c.req.query('token') ?? '');
  if (!verified) {
    return c.json({ error: 'Invalid or expired stream token', code: 'UNAUTHORIZED' }, 401);
  }

  // Entitlements are resolved ONCE at connect time and held for the life of the
  // socket. That is a deliberate, stated bound: a revoke landing mid-stream is
  // not seen until the client reconnects, which the 10-minute token TTL forces.
  // The alternative — re-reading grants on every event — would put a DB round
  // trip in the fan-out path of a bus that every insert fires.
  const allowed = new Set(await scopes(verified.subject));

  return streamSSE(c, async (stream) => {
    let alive = true;
    let withheld = 0;
    const onNotification = (event: NotificationEvent) => {
      // Compartment filter. An event this subscriber may not see is counted and
      // dropped, never delivered — and never silently, see the ping payload.
      if (!allowed.has(event.workspace as NotificationScope)) {
        withheld += 1;
        return;
      }
      void stream.writeSSE({ event: 'notification', data: JSON.stringify(event) });
    };
    notificationBus.on('notification', onNotification);
    stream.onAbort(() => {
      alive = false;
      notificationBus.off('notification', onNotification);
    });

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ ok: true, scopes: [...allowed] }),
    });

    // Heartbeat keeps proxies (Render/Cloudflare) from closing the socket; also
    // bounds the connection to the token's spirit (~30 min max). It carries the
    // running withheld count so a live redaction is visible rather than a gap
    // the operator has no way to notice.
    for (let i = 0; alive && i < 120; i++) {
      await stream.sleep(15_000);
      if (!alive) break;
      await stream.writeSSE({ event: 'ping', data: JSON.stringify({ at: Date.now(), withheld }) });
    }
    notificationBus.off('notification', onNotification);
  });
});

notificationRoutes.get('/', requireOperator, async (c) => {
  try {
    const operator = c.get('operator');
    const result = await listNotifications(
      await scopes(operator.id),
      Number(c.req.query('limit')) || 30,
    );
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[notifications] list error:', err);
    return c.json({ error: 'Failed to list notifications', code: 'NOTIF_ERROR' }, 500);
  }
});

notificationRoutes.post('/read-all', requireOperator, async (c) => {
  const operator = c.get('operator');
  const { changed } = await markRead('all', await scopes(operator.id));
  // `changed` is reported rather than a bare ok:true — "all" now means "all of
  // yours", and the caller is entitled to know that is a smaller set.
  return c.json({ data: { ok: true, changed }, meta: meta() });
});

notificationRoutes.post('/:id/read', requireOperator, async (c) => {
  const operator = c.get('operator');
  const { changed } = await markRead(c.req.param('id'), await scopes(operator.id));
  if (changed === 0) {
    // One code for "no such row" and "not yours" on purpose: distinguishing them
    // would confirm the existence of a notification in a compartment this actor
    // cannot read, which is the same leak by a narrower channel.
    return c.json(
      { error: 'No such notification in your compartments', code: 'NOTIF_NOT_IN_SCOPE' },
      404,
    );
  }
  return c.json({ data: { ok: true, changed }, meta: meta() });
});
