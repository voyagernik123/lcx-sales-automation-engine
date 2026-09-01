import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { composeWatch } from '../watch/watch.js';

/**
 * THE WATCH — GET /v1/watch?since=<ISO>   (S4 of INSTRUMENT_100X_PLAN.md)
 *
 * What changed since the operator last looked, in every compartment they hold, ranked by
 * consequence. NO WORKSPACE GATE on the route itself — deliberately: the watch spans compartments,
 * and `composeWatch` filters per item by the operator's entitlements (the same
 * loadEntitlements + capAtLeast pair the audit route uses). `requireOperator` is the floor.
 *
 * `since` is required and must parse; the caller owns the watermark (`lib/useArrival.ts` on the web
 * side). A watermark more than 30 days old is clamped — the record before that is the audit log's job,
 * not the arrival's — and the clamp is said in `absent`.
 */
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });
const MAX_LOOKBACK_MS = 30 * 86_400_000;

export const watchRoutes = new Hono<{ Variables: AuthVariables }>();

watchRoutes.get('/', requireOperator, async (c) => {
  try {
    const sinceRaw = c.req.query('since');
    const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
    if (!Number.isFinite(sinceMs)) {
      return c.json({ error: 'since is required and must be an ISO instant — the watch answers "since when", never "everything".', code: 'VALIDATION' }, 400);
    }
    const nowMs = Date.now();
    const clamped = nowMs - sinceMs > MAX_LOOKBACK_MS;
    const since = new Date(clamped ? nowMs - MAX_LOOKBACK_MS : sinceMs).toISOString();
    const operator = c.get('operator');
    const out = await composeWatch(getPool(), operator.id, since, new Date(nowMs).toISOString());
    if (clamped) out.absent.unshift(`The watermark was older than 30 days; the watch reads from ${since.slice(0, 10)}. Earlier changes are in the audit log.`);
    return c.json({ data: out, meta: meta() });
  } catch (err) {
    console.error('[watch] compose error:', err);
    return c.json({ error: 'The watch could not be composed', code: 'WATCH_ERROR' }, 500);
  }
});
