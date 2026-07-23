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
 * GET /v1/command/launch-sim — the launch-schedule Monte Carlo (Wave 2).
 * Simulates program completion off the task dependency graph. Durations are
 * PLANNING ASSUMPTIONS (triangular by status; see @lcx/shared launchSim) — the
 * strategy contains no confirmed durations, so this is a planning simulation,
 * never a committed schedule. `?runs=` caps at 20k; seeded for reproducibility.
 */
commandRoutes.get('/launch-sim', requireOperator, async (c) => {
  try {
    const { runLaunchSim } = await import('@lcx/shared');
    const rows = await list(`SELECT id, title, status, depends_on FROM command_tasks`);
    if (rows.length === 0) {
      return c.json({ error: 'No program tasks — apply migration 0040 and seed first', code: 'NO_TASKS' }, 409);
    }
    const runs = Number(c.req.query('runs')) || 2000;
    const seed = Number(c.req.query('seed')) || 42;
    const result = runLaunchSim(
      rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        status: String(r.status ?? 'not_started'),
        dependsOn: Array.isArray(r.depends_on) ? (r.depends_on as unknown[]).map(String) : [],
      })),
      { runs, seed },
    );
    // Convert day offsets to calendar dates here (the sim itself is pure).
    const today = Date.now();
    const iso = (days: number) => new Date(today + days * 86_400_000).toISOString().slice(0, 10);
    return c.json({
      data: {
        ...result,
        p10Date: iso(result.p10Days),
        p50Date: iso(result.p50Days),
        p90Date: iso(result.p90Days),
        disclaimer: 'Planning simulation on ASSUMED durations (no confirmed task durations exist in the strategy). The launch anchor itself is unconfirmed.',
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[command] launch-sim error:', err);
    return c.json({ error: 'Launch simulation failed', code: 'COMMAND_SIM_ERROR' }, 500);
  }
});

/**
 * POST /v1/command/ask — the AI operator over the launch program (Wave 3).
 * Grounded in the command graph + planning simulation; deterministic program
 * readout when no ANTHROPIC_API_KEY is set (usedLlm:false). Read-only.
 */
commandRoutes.post('/ask', requireOperator, async (c) => {
  const body = await c.req.json<{ question?: string }>().catch(() => ({} as { question?: string }));
  const question = (body.question ?? '').trim();
  if (!question) return c.json({ error: 'question required', code: 'VALIDATION' }, 400);
  try {
    const { askProgram } = await import('../ai/commandOperator.js');
    const res = await askProgram(getPool(), question);
    if (!res) return c.json({ error: 'No program data — apply migration 0040 and seed first', code: 'NO_TASKS' }, 409);
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[command] ask error:', err);
    return c.json({ error: 'Program query failed', code: 'COMMAND_ASK_ERROR' }, 500);
  }
});

/**
 * GET /v1/command/partners/:id/bd-matches — cross-link a COMMAND partner to
 * BD-engine projects by name similarity (Wave 3): one graph, two platforms.
 */
commandRoutes.get('/partners/:id/bd-matches', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT name FROM command_partners WHERE id = $1 LIMIT 1`, [c.req.param('id')]);
    if (rows.length === 0) return c.json({ error: 'Partner not found', code: 'NOT_FOUND' }, 404);
    // Match on the first meaningful name token (e.g. "Cumberland (DRW)" → "Cumberland").
    const token = String(rows[0].name).split(/[\s(]/)[0]?.trim();
    if (!token || token.length < 3) return c.json({ data: [], meta: meta() });
    const { rows: matches } = await getPool().query(
      `SELECT id, name, ticker, tier FROM projects WHERE name ILIKE $1 ORDER BY (tier='tracked') DESC, name LIMIT 5`,
      [`%${token}%`],
    );
    return c.json({ data: matches, meta: meta() });
  } catch (err) {
    console.error('[command] bd-matches error:', err);
    return c.json({ error: 'Match lookup failed', code: 'COMMAND_ERROR' }, 500);
  }
});

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
