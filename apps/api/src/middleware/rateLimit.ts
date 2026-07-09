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

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300,
};

const buckets = new Map<string, BucketEntry>();

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
    cleanup();

    const operator = c.get('operator');
    const key = operator ? `auth:${operator.id}` : `ip:${c.req.header('x-forwarded-for') ?? 'unknown'}`;

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
