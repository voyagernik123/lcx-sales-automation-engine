import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth.js';

interface BucketEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  /**
   * Hard ceiling on how many DISTINCT buckets are tracked at once. See
   * `MAX_TRACKED_BUCKETS`. Exposed on the config so a test can exercise the overflow
   * path without issuing four thousand requests.
   */
  maxBuckets: number;
}

const isProd = process.env.NODE_ENV === 'production';

/**
 * How many distinct buckets may exist before new keys are folded into one shared
 * overflow bucket.
 *
 * WHY THERE IS A CEILING AT ALL. The key derives from a caller-supplied credential, and
 * nothing at this layer can tell a REAL credential from a random string — route auth
 * runs later. So a caller rotating `X-API-Key: <random>` mints a bucket per request. It
 * only ever reaches a cheap 401, but each attempt leaves a `Map` entry that `cleanup()`
 * will not reclaim until the window expires, so the map grows without bound inside a
 * window. That is a memory-exhaustion path on a single-threaded process.
 *
 * WHY 4096, AND WHAT IT COSTS. The legitimate population of distinct credentials is the
 * `@lcx/shared` roster plus the shared `OPERATOR_API_KEY` plus whatever second-tier
 * addresses are in use — order tens, not thousands — so real traffic cannot approach
 * this. THE COST, STATED PLAINLY: while an attacker holds the map at the ceiling, a
 * credential that has NO live bucket yet lands in the shared overflow bucket and can be
 * throttled by that attacker's volume. Credentials already holding a bucket are
 * unaffected. That is a bounded, temporary degradation traded against an unbounded map;
 * it is a choice, not an oversight.
 */
const MAX_TRACKED_BUCKETS = 4096;

/** Every key that arrives once the ceiling is reached shares this one bucket. */
const OVERFLOW_KEY = 'overflow:shared';

/** A dashboard page fires several requests; 60/min starved one busy tab.
    Prod stays conservative per credential; dev is effectively unthrottled. */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: isProd ? 240 : 1200,
  maxBuckets: MAX_TRACKED_BUCKETS,
};

const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300,
  maxBuckets: MAX_TRACKED_BUCKETS,
};

const buckets = new Map<string, BucketEntry>();

/** Non-cryptographic hash so bucket keys never hold API-key material. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * THE CREDENTIAL THIS REQUEST PRESENTS, normalized EXACTLY the way
 * `middleware/auth.ts extractApiKey` normalizes it — `X-API-Key` wins over
 * `Authorization`, the `Bearer`/`ApiKey` scheme is stripped, whitespace is trimmed, and
 * an `Authorization` header in any other scheme is not a credential at all.
 *
 * IT MUST MATCH auth.ts OR THE HEADER WIDENS THE BUCKET AGAIN. Hashing the raw header
 * string (what this file used to do) gave ONE credential at least four buckets —
 * `X-API-Key: K`, `Authorization: Bearer K`, `Authorization: ApiKey K`,
 * `Authorization: Bearer  K` — each a different string, each a different bucket, all the
 * same principal. Normalizing first means the bucket is the CREDENTIAL, not the spelling.
 *
 * Duplicated rather than imported because `extractApiKey` is module-private in auth.ts,
 * and this middleware runs on every request including ones auth never sees. If auth's
 * extraction changes, change this with it.
 */
function presentedCredential(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const apiKeyHeader = c.req.header('x-api-key');
  if (apiKeyHeader && apiKeyHeader.trim()) return apiKeyHeader.trim();
  const authHeader = c.req.header('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(/\s+/, 2);
  if (!token) return null;
  const s = scheme.toLowerCase();
  if (s !== 'bearer' && s !== 'apikey') return null;
  return token.trim() || null;
}

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function sweepExpired(now: number): void {
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  sweepExpired(now);
}

/** Test-only. Clears every bucket and the cleanup clock. */
export function _resetRateLimit(): void {
  buckets.clear();
  lastCleanup = Date.now();
}

/** Test-only. How many distinct buckets are currently live. */
export function _rateLimitBucketCount(): number {
  return buckets.size;
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    // Never rate-limit liveness probes — a 429 here would make the platform
    // health check flap and mark the service down.
    const path = c.req.path;
    if (path === '/health' || path === '/') return next();

    const now = Date.now();
    cleanup(now);

    /*
     * THE BUCKET KEY WAS WIDENED BY A HEADER THE CLIENT WRITES ITSELF.
     *
     * This used to key authenticated traffic as `key:<hash>:<ip>`, where `<ip>` was the
     * FIRST hop of `X-Forwarded-For`. `X-Forwarded-For` is client-supplied: anything
     * upstream may append, but nothing stops a caller putting whatever it likes in the
     * first position. Since this middleware is mounted at `app.ts` `app.use('*',
     * rateLimit())` — BEFORE any route auth — that composite was the working identity for
     * every authenticated request in all eight compartments. One holder of ONE valid
     * credential minted a FRESH BUCKET PER REQUEST just by rotating that header, so the
     * cap never tripped, and the only request-rate throttle in front of the
     * `/v1/distribution/engines/*` scans did not exist in practice.
     *
     * THE FIX: for a request that presents a credential, the bucket is keyed on the
     * CREDENTIAL ALONE. No header can widen it because no header is in the key.
     *
     * WHAT THAT COSTS, STATED. Everyone authenticating with the SHARED `OPERATOR_API_KEY`
     * now shares ONE bucket — cron, integrations, and any browser configured with it.
     * That is the honest consequence of a shared secret: the limiter can only throttle
     * the credential it is shown, and it is shown one credential. Desk sign-ins
     * (`email:passcode`) are per-person strings and keep per-person buckets, which is
     * where the human traffic is.
     *
     * SHARED EGRESS IPs ARE NOT AFFECTED, and are better off. Two colleagues behind one
     * office NAT were already told apart only by their credentials (the ip half was
     * identical for both); now the ip half is gone entirely, so nothing about their
     * network path can put them in each other's bucket.
     *
     * `operator` is checked first for the route-scoped limiters (`authRateLimit`), which
     * may be mounted after auth has resolved a principal. At the global mount it is
     * always unset, which is why the credential branch is the one that matters.
     *
     * UNAUTHENTICATED — and anything auth would not accept, e.g. `Authorization: Basic …`
     * — shares ONE bucket rather than one-per-IP, for the same spoofability reason: a
     * per-IP key lets an attacker rotate fake IPs to evade the limit, and a single shared
     * cap cannot be evaded that way. Those endpoints (webhooks, unsubscribe, SSE) are
     * individually crypto-gated (HMAC/signature), so the bucket is defense-in-depth and
     * low legitimate volume keeps it clear.
     */
    const operator = c.get('operator');
    const cred = presentedCredential(c);
    let key = operator
      ? `auth:${operator.id}`
      : cred
        ? `key:${djb2(cred)}`
        : 'unauth:shared';

    let entry = buckets.get(key);

    // A key with no live bucket may only claim a new slot while there is room. Sweep
    // first — expired entries are free to reclaim — then fold into the shared overflow
    // bucket rather than growing the map without bound.
    if (!entry && buckets.size >= cfg.maxBuckets) {
      sweepExpired(now);
      if (buckets.size >= cfg.maxBuckets) {
        key = OVERFLOW_KEY;
        entry = buckets.get(key);
      }
    }

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
