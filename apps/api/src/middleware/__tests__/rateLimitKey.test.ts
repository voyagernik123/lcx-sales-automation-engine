import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { _rateLimitBucketCount, _resetRateLimit, rateLimit } from '../rateLimit.js';
import { createApp } from '../../app.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

/**
 * THE RATE LIMITER KEYED AUTHENTICATED TRAFFIC ON A HEADER THE CLIENT WRITES ITSELF.
 *
 * The bucket key was `key:${djb2(rawKey)}:${ip}`, where `ip` was the FIRST hop of
 * `X-Forwarded-For` — a header anyone may set to anything. `app.ts` mounts this at
 * `app.use('*', rateLimit())`, BEFORE any route auth, so that composite was the working
 * identity for every authenticated request in all eight compartments. One holder of ONE
 * valid credential minted a FRESH BUCKET PER REQUEST by rotating that header, so the
 * 240/min cap never tripped, and the only request-rate throttle in front of the
 * `/v1/distribution/engines/*` scans did not exist in practice.
 *
 * A second, quieter widening lived in the same line: the key hashed the RAW HEADER STRING,
 * so one credential got a different bucket for `X-API-Key: K`, `Authorization: Bearer K`
 * and `Authorization: ApiKey K` — three spellings of the same principal,
 * `middleware/auth.ts extractApiKey` accepts all three, and the limiter counted them apart.
 *
 * ── NOT A TIMING TEST ─────────────────────────────────────────────────────────────
 * Nothing here reads a clock or sleeps. The observable is `X-RateLimit-Remaining`, which
 * the middleware writes from the bucket it just incremented: if a request lands in a
 * fresh bucket the header goes back to its maximum, and if it lands in the shared bucket
 * the header steps down. A monotone step-down across a rotating header IS the proof that
 * the header no longer participates in the key.
 */

const remaining = (res: Response): number => Number(res.headers.get('X-RateLimit-Remaining'));

/** A real Hono with only this middleware mounted — nothing mocked, nothing else in the way. */
function bare(cfg?: Parameters<typeof rateLimit>[0]): Hono {
  const app = new Hono();
  app.use('*', rateLimit(cfg));
  app.get('/health', (c) => c.text('ok'));
  app.get('/x', (c) => c.text('ok'));
  return app;
}

describe('rate-limit bucket key — no header may widen it', () => {
  beforeEach(() => _resetRateLimit());

  it('a rotating X-Forwarded-For does NOT reset the bucket for one credential', async () => {
    const app = bare({ maxRequests: 100 });
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/x', {
        headers: { Authorization: 'Bearer creds-A', 'X-Forwarded-For': `203.0.113.${i}` },
      });
      seen.push(remaining(res));
    }
    // Before the fix every entry was 99: each rotation minted a fresh bucket.
    expect(seen).toEqual([99, 98, 97, 96, 95]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('the cap actually TRIPS under rotation — the 429 is reached, not merely counted', async () => {
    const app = bare({ maxRequests: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/x', {
        headers: { 'X-API-Key': 'creds-B', 'X-Forwarded-For': `198.51.100.${i}, 10.0.0.1` },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('one credential is ONE bucket however the header spells it', async () => {
    const app = bare({ maxRequests: 100 });
    const spellings = [
      { 'X-API-Key': 'creds-C' },
      { Authorization: 'Bearer creds-C' },
      { Authorization: 'ApiKey creds-C' },
      { Authorization: 'bearer  creds-C' },
    ];
    const seen: number[] = [];
    for (const headers of spellings) {
      seen.push(remaining(await app.request('/x', { headers })));
    }
    expect(seen).toEqual([99, 98, 97, 96]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('does NOT collapse everyone into one bucket — two credentials stay independent', async () => {
    // The fix must not be "one global bucket". A desk sign-in is `email:passcode`, so
    // distinct people carry distinct credentials and must keep distinct buckets.
    const app = bare({ maxRequests: 100 });
    const a = remaining(await app.request('/x', { headers: { Authorization: 'Bearer nik@lcx.com:pw' } }));
    const b = remaining(await app.request('/x', { headers: { Authorization: 'Bearer sam@lcx.com:pw' } }));
    expect(a).toBe(99);
    expect(b).toBe(99);
    expect(_rateLimitBucketCount()).toBe(2);
  });

  it('legitimate shared-egress clients are unaffected: same credential, different IPs, still counted together', async () => {
    // The point of removing the ip half is that the network path can no longer move a
    // caller between buckets — in EITHER direction. Two office NATs, one credential.
    const app = bare({ maxRequests: 100 });
    const first = remaining(await app.request('/x', { headers: { Authorization: 'Bearer creds-D', 'X-Forwarded-For': '192.0.2.7' } }));
    const second = remaining(await app.request('/x', { headers: { Authorization: 'Bearer creds-D', 'X-Forwarded-For': '192.0.2.99' } }));
    expect([first, second]).toEqual([99, 98]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  /* ── the unauthenticated path ────────────────────────────────────────────── */

  it('no credential shares ONE bucket, and a rotating X-Forwarded-For cannot widen it', async () => {
    const app = bare({ maxRequests: 100 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(remaining(await app.request('/x', { headers: { 'X-Forwarded-For': `203.0.113.${i}` } })));
    }
    expect(seen).toEqual([99, 98, 97, 96]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('a rotating Authorization scheme auth would never accept mints NO buckets', async () => {
    // `middleware/auth.ts extractApiKey` only reads `Bearer` and `ApiKey`. Anything else
    // is not a credential, so it must not be allowed to act as one here either — otherwise
    // `Authorization: Basic <random>` is a fresh bucket per request all over again.
    const app = bare({ maxRequests: 100 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(remaining(await app.request('/x', { headers: { Authorization: `Basic ${i}-${'x'.repeat(i)}` } })));
    }
    expect(seen).toEqual([99, 98, 97, 96]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('bounds the bucket map: a rotating junk X-API-Key cannot grow it without limit', async () => {
    // Nothing at this layer can tell a real credential from a random string — route auth
    // runs later — so the residual rotation surface is bounded by a ceiling instead.
    // Beyond it, new keys share one overflow bucket and therefore DO throttle.
    const app = bare({ maxRequests: 5, maxBuckets: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await app.request('/x', { headers: { 'X-API-Key': `junk-${i}` } })).status);
    }
    // 3 credentials claim real slots; every later one lands in the shared overflow bucket,
    // which trips after 5.
    expect(_rateLimitBucketCount()).toBeLessThanOrEqual(4); // 3 tracked + 1 overflow
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
  });

  /* ── the invariant that must not regress ─────────────────────────────────── */

  it('never rate-limits the liveness probe', async () => {
    const app = bare({ maxRequests: 1 });
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/health')).status).toBe(200);
    }
  });
});

describe('rate-limit bucket key — through the real app mount', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = 'dev-operator-key-change-me';
    invalidateEntitlements();
  });
  beforeEach(() => _resetRateLimit());

  it('the globally mounted limiter shares one bucket across a rotating X-Forwarded-For', async () => {
    // Asserted against `createApp()` rather than a stand-in, because the defect was
    // positional: the limiter runs at `app.use('*')` BEFORE route auth, which is exactly
    // why the credential (not the resolved principal) has to be the key.
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.request('/v1/distribution/campaigns', {
        headers: {
          Authorization: 'Bearer dev-operator-key-change-me',
          'X-Forwarded-For': `203.0.113.${100 + i}`,
        },
      });
      seen.push(remaining(res));
    }
    const [first] = seen;
    expect(seen).toEqual([first, first - 1, first - 2, first - 3]);
    expect(_rateLimitBucketCount()).toBe(1);
  });
});
