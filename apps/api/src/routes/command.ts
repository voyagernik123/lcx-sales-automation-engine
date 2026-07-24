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

/**
 * GET /v1/command/deep — the FULL-FIDELITY program ontology (100X Phase 1).
 * `reference` is the compiled, git-versioned strategy extract (weighted
 * scorecards with dimensions, capability detail, connectivity, rail providers,
 * GENIUS policy, licensing checklist, funnel model + scenarios, referral +
 * guardrails, 90-day plan, tooling, DD framework, policy outline, budget,
 * dependency edges, exec dashboard, roadmap, consolidated risks, decision
 * enrichment, 100 graded sources). `rfi`/`requirements`/`blockers` are the
 * desk-mutable rows — they degrade to the compiled defaults before 0041.
 */
commandRoutes.get('/deep', requireOperator, async (c) => {
  try {
    const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
    const ref = COMMAND_DEEP_SEED as unknown as Record<string, unknown>;
    const [rfi, requirements, blockers] = await Promise.all([
      list(`SELECT partner_id, status, owner, grade, values, issued_at, returned_at, updated_at FROM command_rfi ORDER BY partner_id`),
      list(`SELECT num, requirement, detail, path, owner, status, updated_at FROM command_requirements ORDER BY num`),
      list(`SELECT num, blocker, category, severity, detail, owner, resolves_via, status, updated_at FROM command_blockers ORDER BY num`),
    ]);
    return c.json({
      data: {
        reference: ref,
        rfi,
        requirements: requirements.length ? requirements : (ref.requirements as unknown[]),
        blockers: blockers.length ? blockers : (ref.blockers as unknown[]),
        live: { requirements: requirements.length > 0, blockers: blockers.length > 0 },
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[command] deep error:', err);
    return c.json({ error: 'Failed to load deep ontology', code: 'COMMAND_DEEP_ERROR' }, 500);
  }
});

/* ── 100X Phase 2 — the decision engines over the deep ontology ── */

/**
 * GET /v1/command/readiness — the composite program-readiness dial (0–100 +
 * five sub-dials), computed from LIVE state: gating tasks, blocker/requirement
 * status (0041 tables, compiled fallback), LP pipeline commitment, and the
 * growth-foundation task. Degrades to zeros before seeding, never errors.
 */
commandRoutes.get('/readiness', requireOperator, async (c) => {
  try {
    const { programReadiness } = await import('@lcx/shared');
    const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
    const ref = COMMAND_DEEP_SEED as unknown as { requirements: Array<{ num: number; path: string | null; status: string | null }>; blockers: Array<{ num: number; severity: string | null; category: string | null }> };
    const gatingIds = ['t_bsa', 't_counsel', 't_bankselect', 't_msb', 't_mtl', 't_3lp', 't_oes', 't_fiat_live', 't_surveil', 't_listpolicy'];
    const DONE = new Set(['done', 'complete', 'completed', 'live']);
    const [gt, blockRows, reqRows, lpRows, growth] = await Promise.all([
      list(`SELECT id, status FROM command_tasks WHERE id = ANY('{${gatingIds.join(',')}}')`),
      list(`SELECT num, severity, category, status FROM command_blockers`),
      list(`SELECT num, path, status FROM command_requirements`),
      list(`SELECT pipeline_stage FROM command_partners WHERE id IN ('pt_b2c2','pt_falconx','pt_cumberland')`),
      list(`SELECT status FROM command_tasks WHERE id = 't_waitlist_tool'`),
    ]);
    const blockers = blockRows.length
      ? blockRows.map((r) => ({ num: Number(r.num), severity: (r.severity as string) ?? null, category: (r.category as string) ?? null, status: String(r.status ?? 'open') }))
      : ref.blockers.map((b) => ({ num: b.num, severity: b.severity, category: b.category, status: 'open' }));
    const requirements = reqRows.length
      ? reqRows.map((r) => ({ num: Number(r.num), path: (r.path as string) ?? null, status: (r.status as string) ?? null }))
      : ref.requirements.map((q) => ({ num: q.num, path: q.path, status: q.status }));
    const lpsCommitted = lpRows.filter((r) => ['signed', 'incumbent_onboarding', 'in_progress'].includes(String(r.pipeline_stage))).length;
    const growthDone = growth.length > 0 && DONE.has(String(growth[0].status)) ? 1 : String(growth[0]?.status ?? '') === 'in_progress' ? 0.5 : 0;
    const data = programReadiness({
      gatingDone: gt.filter((r) => DONE.has(String(r.status))).length,
      gatingTotal: gatingIds.length,
      blockers, requirements,
      lpsCommitted, lpTarget: 3,
      growthFoundation: growthDone,
    });
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[command] readiness error:', err);
    return c.json({ error: 'Readiness computation failed', code: 'COMMAND_ENGINE_ERROR' }, 500);
  }
});

/**
 * POST /v1/command/engines/lp-rescore {weights?, selectedIds?} — live weight
 * editing over the LP scorecard: re-rank + rank-flip sensitivity + set
 * analysis. A pure what-if: stored truth is never mutated.
 */
commandRoutes.post('/engines/lp-rescore', requireOperator, async (c) => {
  const body = await c.req.json<{ weights?: Record<string, number>; selectedIds?: string[] }>()
    .catch(() => ({} as { weights?: Record<string, number>; selectedIds?: string[] }));
  try {
    const { rescore, sensitivity, analyzeSet } = await import('@lcx/shared');
    const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
    const lp = (COMMAND_DEEP_SEED as unknown as { scorecards: { lp: { dimensions: Array<{ key: string; label: string; weight: number }>; rows: Array<{ subjectId: string; subjectLabel: string; scores: Record<string, number>; tier: string | null }> } } }).scorecards.lp;
    const weights: Record<string, number> = {};
    if (body.weights) {
      for (const d of lp.dimensions) {
        const v = Number(body.weights[d.key]);
        weights[d.key] = Number.isFinite(v) && v >= 0 && v <= 1 ? v : d.weight;
      }
    }
    const rows = rescore(lp.dimensions, lp.rows, body.weights ? weights : undefined);
    const sens = sensitivity(lp.dimensions, lp.rows);
    const set = analyzeSet(lp.dimensions, lp.rows,
      Array.isArray(body.selectedIds) && body.selectedIds.length ? body.selectedIds.map(String).slice(0, 10) : ['pt_b2c2', 'pt_falconx', 'pt_cumberland']);
    return c.json({ data: { dimensions: lp.dimensions, rows, sensitivity: sens, setAnalysis: set }, meta: meta() });
  } catch (err) {
    console.error('[command] lp-rescore error:', err);
    return c.json({ error: 'LP rescore failed', code: 'COMMAND_ENGINE_ERROR' }, 500);
  }
});

/**
 * POST /v1/command/engines/waitlist-sim {budgets?} — the funnel Monte Carlo on
 * the strategy's channel model; budgets override per channelId (what-if only).
 * Mainstream paid stays LOCKED until the MSB + MTL tasks are done (live check).
 */
commandRoutes.post('/engines/waitlist-sim', requireOperator, async (c) => {
  const body = await c.req.json<{ budgets?: Record<string, number>; runs?: number }>()
    .catch(() => ({} as { budgets?: Record<string, number>; runs?: number }));
  try {
    const { waitlistSim } = await import('@lcx/shared');
    const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
    const funnel = (COMMAND_DEEP_SEED as unknown as { funnel: { channels: Array<{ channelId: string; label: string; type: string; budget: number; cac: number | null; signupsEst: number | null }>; conversions: { waitlistToVerified: number; verifiedToFunded: number } } }).funnel;
    const DONE = new Set(['done', 'complete', 'completed', 'live']);
    const gateRows = await list(`SELECT id, status FROM command_tasks WHERE id IN ('t_msb','t_mtl')`);
    const adsUnlocked = gateRows.length === 2 && gateRows.every((r) => DONE.has(String(r.status)));
    const channels = funnel.channels.map((ch) => {
      const override = Number(body.budgets?.[ch.channelId]);
      const budget = Number.isFinite(override) && override >= 0 && override <= 10_000_000 ? override : ch.budget;
      const isMainstream = ch.channelId.includes('google_meta_x') || ch.label.toLowerCase().includes('google');
      return {
        channelId: ch.channelId, label: ch.label, type: ch.type, budget,
        cac: ch.cac, organicSignups: ch.type === 'Organic' ? ch.signupsEst : null,
        locked: isMainstream && !adsUnlocked,
      };
    });
    const data = waitlistSim(channels, funnel.conversions, { runs: Number(body.runs) || 2000, seed: 42 });
    return c.json({ data: { ...data, adsUnlocked }, meta: meta() });
  } catch (err) {
    console.error('[command] waitlist-sim error:', err);
    return c.json({ error: 'Waitlist simulation failed', code: 'COMMAND_ENGINE_ERROR' }, 500);
  }
});

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
