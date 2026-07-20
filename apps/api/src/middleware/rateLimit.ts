import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth.js';

interface BucketEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const isProd = process.env.NODE_ENV === 'production';

/** A dashboard page fires several requests; 60/min starved one busy tab.
    Prod stays conservative per client+IP; dev is effectively unthrottled. */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: isProd ? 240 : 1200,
};

const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300,
};

const buckets = new Map<string, BucketEntry>();

/** Non-cryptographic hash so bucket keys never hold API-key material. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** First hop of a forwarded chain — "client, proxy1, proxy2" → "client". */
function firstForwardedIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const xff = c.req.header('x-forwarded-for');
  if (!xff) return null;
  return xff.split(',')[0].trim() || null;
}

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    // Never rate-limit liveness probes — a 429 here would make the platform
    // health check flap and mark the service down.
    const path = c.req.path;
    if (path === '/health' || path === '/') return next();

    cleanup();

    // Keying, most-specific first. NOTE: this middleware is mounted globally
    // (app.use('*')) and therefore runs BEFORE route-level auth populates
    // `operator` — so the api-key + ip composite is the working identity for
    // app traffic; the operator branch serves route-scoped limiters.
    //
    // Unauthenticated requests (webhooks, unsubscribe, SSE) share ONE bucket
    // rather than one-per-IP: `x-forwarded-for` is client-supplied and thus
    // spoofable, so a per-IP key lets an attacker rotate fake IPs to evade the
    // limit. A single shared cap can't be evaded that way; those endpoints are
    // also individually crypto-gated (HMAC/signature), so the bucket is purely
    // a defense-in-depth backstop and low legitimate volume keeps it clear.
    const operator = c.get('operator');
    const ip = firstForwardedIp(c);
    const rawKey = c.req.header('x-api-key') ?? c.req.header('authorization');
    const key = operator
      ? `auth:${operator.id}`
      : rawKey
        ? `key:${djb2(rawKey)}:${ip ?? 'local'}`
        : 'unauth:shared';

    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + cfg.windowMs };
      buckets.set(key, entry);
    }

    entry.count++;

    c.header('X-RateLimit-Limit', String(cfg.maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, cfg.maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > cfg.maxRequests) {
      return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
    }

    await next();
  });
}

export function authRateLimit() {
  return rateLimit(AUTH_LIMIT);
}
