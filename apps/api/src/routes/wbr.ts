/**
 * Weekly Business Review (Phase 4.1). Reads the report the `wbr` job composes
 * and persists every Monday; falls back to composing live when none is stored
 * yet, so the surface is never empty. Regeneration is done through the standard
 * job trigger (POST /v1/intel/jobs/wbr), keeping one governed path per job.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { getLatestWbr, getWbrForWeek, listWbrWeeks } from '../kpi/wbr.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const wbrRoutes = new Hono<{ Variables: AuthVariables }>();

/** GET /v1/wbr — latest stored review (or a live one if none stored) + the weeks available. */
wbrRoutes.get('/', requireOperator, async (c) => {
  try {
    const week = c.req.query('week');
    const pool = getPool();
    const report = week ? await getWbrForWeek(pool, week) : await getLatestWbr(pool);
    if (!report) return c.json({ error: 'No review for that week', code: 'NOT_FOUND' }, 404);
    const weeks = await listWbrWeeks(pool);
    return c.json({ data: { report, weeks }, meta: meta() });
  } catch (err) {
    console.error('[wbr] load error:', err);
    return c.json({ error: 'Failed to load WBR', code: 'WBR_ERROR' }, 500);
  }
});
