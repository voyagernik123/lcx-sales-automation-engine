import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { DISTRIBUTION_DEEP_SEED } from '../seed/distribution/data.js';
import { seedDistribution } from '../distribution/seed.js';

/**
 * DISTRIBUTION COMMAND API (LCX ONE Phase 3). Mounted under /v1/distribution,
 * which the LCX OS fabric already guards at requireWorkspace('distribution',
 * 'view') in app.ts — so every route here is inside the compartment.
 *
 * GET /deep       — the full compiled ontology, merged with live desk state
 *                   (listings) when 0043 is applied; degrades to reference-only.
 * GET /listings   — the surface pipeline (live state).
 * GET /campaigns  — the campaign registry (live state).
 * POST /seed      — (re)ensure a listing row per surface; non-clobbering.
 */
export const distributionRoutes = new Hono<{ Variables: AuthVariables }>();

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string }).code === '42P01';
}

distributionRoutes.get('/deep', requireOperator, async (c) => {
  const pool = getPool();
  let listings: Array<Record<string, unknown>> = [];
  let dbLive = true;
  try {
    listings = (await pool.query(`SELECT * FROM dist_listings ORDER BY surface_id`)).rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    dbLive = false;
  }
  return c.json({ data: { reference: DISTRIBUTION_DEEP_SEED, listings, live: { listings: dbLive } } });
});

distributionRoutes.get('/listings', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT * FROM dist_listings ORDER BY surface_id`);
    return c.json({ data: rows, meta: { dbLive: true } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ data: [], meta: { dbLive: false } });
    throw err;
  }
});

distributionRoutes.get('/campaigns', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT * FROM dist_campaigns ORDER BY created_at DESC LIMIT 200`);
    return c.json({ data: rows, meta: { dbLive: true } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ data: [], meta: { dbLive: false } });
    throw err;
  }
});

distributionRoutes.post('/seed', requireOperator, async (c) => {
  const result = await seedDistribution(getPool());
  if (result === null) {
    return c.json({ error: 'Distribution tables pending migration 0043', code: 'DB_NOT_READY' }, 503);
  }
  return c.json({ data: result });
});
