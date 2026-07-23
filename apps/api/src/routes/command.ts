/**
 * LCX COMMAND API (Wave 1) — the CEO's US-launch command deck. Read endpoints
 * over the command_* program objects + a one-screen overview aggregate, plus a
 * governed re-seed. Every list degrades to [] when the tables aren't present yet
 * (migration 0040 pending), so the deck renders empty rather than erroring.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { buildCommandOverview } from '../command/overview.js';
import { seedCommand } from '../command/seed.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const commandRoutes = new Hono<{ Variables: AuthVariables }>();

/** Small helper: run a read, degrade to [] if the table is missing. */
async function list(sql: string): Promise<Record<string, unknown>[]> {
  try { return (await getPool().query(sql)).rows as Record<string, unknown>[]; }
  catch { return []; }
}

commandRoutes.get('/overview', requireOperator, async (c) => {
  try {
    const data = await buildCommandOverview(getPool());
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[command] overview error:', err);
    return c.json({ error: 'Failed to build command overview', code: 'COMMAND_ERROR' }, 500);
  }
});

commandRoutes.get('/products', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, name, type, status, owner, notes, source FROM command_products ORDER BY name`), meta: meta() }));

commandRoutes.get('/partners', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, name, type, subtype, pipeline_stage, capability_score, tier, primary_contact, terms, notes, source FROM command_partners ORDER BY (capability_score IS NULL), capability_score DESC, name`), meta: meta() }));

commandRoutes.get('/workstreams', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, name, owner, status, source FROM command_workstreams ORDER BY id`), meta: meta() }));

commandRoutes.get('/tasks', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, workstream, title, owner, to_char(target_date,'YYYY-MM-DD') AS target_date, status, depends_on, notes, source FROM command_tasks ORDER BY workstream, id`), meta: meta() }));

commandRoutes.get('/decisions', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, phase, decision, recommendation, status, chosen, decided_by, decided_at FROM command_decisions ORDER BY phase, id`), meta: meta() }));

commandRoutes.get('/risks', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, category, title, likelihood, impact, mitigation, phase FROM command_risks ORDER BY id`), meta: meta() }));

commandRoutes.get('/financials', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, area, item, value, unit, assumption, source FROM command_financial_assumptions ORDER BY area, id`), meta: meta() }));

commandRoutes.get('/launch', requireOperator, async (c) =>
  c.json({ data: await list(`SELECT id, name, target_date, confirmed, note FROM command_launch_targets ORDER BY id`), meta: meta() }));

/**
 * POST /v1/command/seed — (re)load the strategy extract into the command_*
 * tables. Idempotent. Governed by requireOperator; also runnable as the
 * `command_seed` intel job.
 */
commandRoutes.post('/seed', requireOperator, async (c) => {
  try {
    const result = await seedCommand(getPool());
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[command] seed error:', err);
    return c.json({ error: 'Failed to seed command data', code: 'COMMAND_SEED_ERROR' }, 500);
  }
});
