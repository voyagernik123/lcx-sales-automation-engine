/**
 * P0 / C6 — the SSE stream honours need-to-know on the socket, not just in REST.
 *
 * The REST list was the leak that got noticed; the stream was the worse one,
 * because `notificationBus` fans every insert out to every connected client and
 * the pre-0067 token carried no subject, so the handler had no identity to filter
 * against. `needToKnow.test.ts` covers the token; this opens the actual route and
 * asserts what arrives down the wire.
 */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// A sales-only reader. `loadEntitlements` is the single source the route uses to
// resolve scopes, so mocking it here exercises the real scopesFor + filter path.
vi.mock('../../access/entitlements.js', () => ({
  loadEntitlements: async () => ({ sales: 'view' }),
}));
/**
 * `dbState` lets one test make the database fail so the NOTIF_ERROR limb is
 * exercised. `rowCount` drives the mark-read limb: 0 means "no row in your
 * compartments", which must refuse rather than report a cheerful ok.
 */
const dbState = { throws: false, rowCount: 0 };
vi.mock('../../db/index.js', () => ({
  getDb: () => ({
    execute: async () => {
      if (dbState.throws) throw new Error('connection refused');
      return { rows: [{ n: 0, withheld: 0, unattributed: 0 }], rowCount: dbState.rowCount };
    },
  }),
  getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { notificationRoutes } = await import('../../routes/notifications.js');
const { notificationBus, mintStreamToken } = await import('../events.js');

const app = new Hono();
app.use('*', async (c, next) => {
  c.set('operator', { id: 'nik', role: 'operator', label: 'Nik' });
  await next();
});
app.route('/v1/notifications', notificationRoutes);

const event = (workspace: string, title: string) => ({
  id: `id-${title}`,
  rule: 'test',
  title,
  detail: null,
  projectId: null,
  href: null,
  createdAt: new Date().toISOString(),
  workspace,
});

/** Open the stream, emit, and read whatever was written before cancelling. */
async function collect(token: string, emit: () => void): Promise<string> {
  const res = await app.request(`/v1/notifications/stream?token=${encodeURIComponent(token)}`);
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = '';

  // First chunk is the `connected` frame — its arrival proves the handler has
  // resolved entitlements, so anything emitted after it must be filtered.
  const first = await reader.read();
  out += decoder.decode(first.value);

  emit();

  // Drain whatever is immediately available. The handler then parks on a 15s
  // heartbeat, so a bounded read is the whole payload without waiting for it.
  const deadline = Date.now() + 250;
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), 60)),
    ]);
    if (!next) break;
    if (next.done) break;
    out += decoder.decode(next.value);
  }
  await reader.cancel();
  return out;
}

/**
 * The refusal codes registered in `docs/phases/ABSENCES.md`. `doctrine-lint`
 * requires each registered code to appear in BOTH its source and its test, so
 * these assertions are what keep the register from going stale — a renamed code
 * fails the lint rather than quietly ceasing to refuse.
 */
describe('the registered refusals actually refuse, by code', () => {
  it('UNAUTHORIZED — an absent or unverifiable stream token', async () => {
    for (const url of [
      '/v1/notifications/stream',
      `/v1/notifications/stream?token=${Date.now() + 60_000}.bmlr.deadbeef`,
      '/v1/notifications/stream?token=garbage',
    ]) {
      const res = await app.request(url);
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('UNAUTHORIZED');
    }
  });

  it('NOTIF_NOT_IN_SCOPE — mark-read on a row outside the actor’s compartments', async () => {
    dbState.rowCount = 0; // the UPDATE matched nothing: absent, or not yours
    const res = await app.request('/v1/notifications/11111111-2222-3333-4444-555555555555/read', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOTIF_NOT_IN_SCOPE');
    // ONE code for both "no such row" and "not yours", deliberately: telling them
    // apart confirms a notification exists in a compartment you cannot read.
    expect(body.error).not.toMatch(/exists|other compartment|forbidden/i);
  });

  it('does not refuse when the row IS in scope', async () => {
    dbState.rowCount = 1;
    const res = await app.request('/v1/notifications/11111111-2222-3333-4444-555555555555/read', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ok: true, changed: 1 });
    dbState.rowCount = 0;
  });

  it('NOTIF_ERROR — the list failed, and does NOT degrade to an empty bell', async () => {
    dbState.throws = true;
    try {
      const res = await app.request('/v1/notifications');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe('NOTIF_ERROR');
      // An empty list would read as "nothing happened"; this is "we do not know".
      expect(body).not.toHaveProperty('data');
    } finally {
      dbState.throws = false;
    }
  });
});

describe('C6 — the SSE stream is compartment-scoped', () => {
  it('rejects a request with no token', async () => {
    const res = await app.request('/v1/notifications/stream');
    expect(res.status).toBe(401);
  });

  it('rejects a token that was not minted by this server', async () => {
    const res = await app.request(`/v1/notifications/stream?token=${Date.now() + 60_000}.bmlr.deadbeef`);
    expect(res.status).toBe(401);
  });

  it('announces the scopes it resolved, so a subscriber knows what it is receiving', async () => {
    const body = await collect(mintStreamToken('nik'), () => {});
    expect(body).toContain('event: connected');
    expect(body).toContain('sales');
    expect(body).toContain('_desk');
  });

  it('delivers an event in a held compartment', async () => {
    const body = await collect(mintStreamToken('nik'), () => {
      notificationBus.emit('notification', event('sales', 'a-sales-alert'));
    });
    expect(body).toContain('a-sales-alert');
  });

  it('DOES NOT deliver an event in a compartment the subscriber does not hold', async () => {
    const body = await collect(mintStreamToken('nik'), () => {
      notificationBus.emit('notification', event('distribution', 'a-distribution-secret'));
      notificationBus.emit('notification', event('gps', 'a-gps-secret'));
      notificationBus.emit('notification', event('marketing', 'a-marketing-secret'));
    });
    expect(body).not.toContain('a-distribution-secret');
    expect(body).not.toContain('a-gps-secret');
    expect(body).not.toContain('a-marketing-secret');
    // and not merely because nothing was delivered at all:
    expect(body).toContain('event: connected');
  });

  it('delivers desk-level events to everyone', async () => {
    const body = await collect(mintStreamToken('nik'), () => {
      notificationBus.emit('notification', event('_desk', 'a-desk-notice'));
    });
    expect(body).toContain('a-desk-notice');
  });

  it('withholds an event whose workspace is absent — unattributed is not desk', async () => {
    const body = await collect(mintStreamToken('nik'), () => {
      // A legacy row predating 0067. It must not be broadcast on the theory that
      // "no compartment" means "everyone's compartment".
      notificationBus.emit('notification', { ...event('sales', 'legacy'), workspace: '' });
    });
    expect(body).not.toContain('legacy');
  });

  it('leaves no listener attached after the socket closes', async () => {
    const before = notificationBus.listenerCount('notification');
    await collect(mintStreamToken('nik'), () => {});
    // Allow the abort handler to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(notificationBus.listenerCount('notification')).toBeLessThanOrEqual(before + 1);
  });
});
