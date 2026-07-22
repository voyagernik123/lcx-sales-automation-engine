/**
 * Object monitors (Palantir-grade Phase 3.1) — the standing watch.
 *
 * A monitor = an object-set filter + a condition + a governed action. The
 * evaluator compiles filter+condition to ONE parameterized SQL query (metrics
 * and operators come from whitelists, never interpolated), finds matching
 * subjects, fires the action exactly once per subject (monitor_fires dedupe)
 * through the action registry (Phase 3.2), and records the run. The machine
 * watches so the desk doesn't have to.
 */
import type pg from 'pg';
import { invokeAction, ACTION_REGISTRY } from '../actions/registry.js';

/** Whitelisted metric → SQL expression. User input never reaches SQL directly. */
const METRIC_SQL: Record<string, string> = {
  conviction: 'conv.conviction',
  priority_score: 's.priority_score',
  propensity_score: 's.propensity_score',
  eu_score: 's.eu_score',
  us_post_score: 's.us_post_score',
  market_cap_usd: 'p.market_cap_usd',
  volume_24h_usd: 'p.volume_24h_usd',
  exchange_count: 'p.exchange_count',
  price_change_30d: 'p.price_change_30d',
};
const OP_SQL: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '<>' };

export interface MonitorFilter {
  tier?: string; band?: string; category?: string; listedOnLcx?: boolean;
  minMcap?: number; maxMcap?: number;
}
export interface MonitorCondition { metric?: string; op?: string; threshold?: number }
export interface MonitorAction { id?: string; params?: Record<string, unknown> }

export interface MonitorRow {
  id: string; owner: string; name: string; enabled: boolean; subjectType: string;
  filter: MonitorFilter; condition: MonitorCondition; action: MonitorAction;
  lastRunAt: string | null; lastMatchCount: number; createdAt: string;
}

export function isValidMonitor(m: { condition?: MonitorCondition; action?: MonitorAction }): string | null {
  const metric = m.condition?.metric;
  const op = m.condition?.op;
  if (!metric || !(metric in METRIC_SQL)) return `Unknown metric: ${metric}`;
  if (!op || !(op in OP_SQL)) return `Unknown operator: ${op}`;
  if (typeof m.condition?.threshold !== 'number') return 'threshold must be a number';
  const actionId = m.action?.id;
  if (!actionId || !ACTION_REGISTRY[actionId]) return `Unknown action: ${actionId}`;
  return null;
}

/** Compile a monitor to a parameterized SELECT of matching subject ids. */
function buildQuery(m: MonitorRow): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const where: string[] = [];
  const f = m.filter ?? {};
  // Monitors operate on the tracked tier unless the filter overrides.
  where.push(`p.tier = $${params.push(f.tier && ['tracked', 'catalog'].includes(f.tier) ? f.tier : 'tracked')}`);
  if (f.band) where.push(`s.band = $${params.push(f.band)}`);
  if (f.category) where.push(`p.category = $${params.push(f.category)}`);
  if (typeof f.listedOnLcx === 'boolean') where.push(`p.listed_on_lcx = $${params.push(f.listedOnLcx)}`);
  if (typeof f.minMcap === 'number') where.push(`p.market_cap_usd >= $${params.push(f.minMcap)}`);
  if (typeof f.maxMcap === 'number') where.push(`p.market_cap_usd <= $${params.push(f.maxMcap)}`);

  const metricExpr = METRIC_SQL[m.condition.metric as string];
  const op = OP_SQL[m.condition.op as string];
  where.push(`${metricExpr} ${op} $${params.push(m.condition.threshold)}`);

  const sql = `
    SELECT p.id
    FROM projects p
    LEFT JOIN LATERAL (SELECT eu_score, us_post_score, propensity_score, priority_score, band
                       FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1) s ON true
    LEFT JOIN LATERAL (SELECT value_num AS conviction FROM observations
                       WHERE subject_type='project' AND subject_id = p.id::text AND predicate='conviction'
                       ORDER BY observed_at DESC LIMIT 1) conv ON true
    WHERE ${where.join(' AND ')}
    LIMIT 500`;
  return { sql, params };
}

export interface MonitorTickStats { monitors: number; matched: number; fired: number }

/** Evaluate all enabled monitors; fire actions on newly-matched subjects. */
export async function evaluateMonitors(pool: pg.Pool): Promise<MonitorTickStats> {
  const { rows: monitors } = await pool.query(`SELECT * FROM monitors WHERE enabled = true`);
  let matched = 0;
  let fired = 0;

  for (const raw of monitors as Record<string, unknown>[]) {
    const m = mapMonitor(raw);
    if (isValidMonitor(m)) continue; // skip malformed monitors defensively
    let matchIds: string[] = [];
    try {
      const { sql, params } = buildQuery(m);
      const { rows } = await pool.query(sql, params);
      matchIds = rows.map((r) => String((r as Record<string, unknown>).id));
    } catch (err) {
      console.warn(`[monitors] ${m.id} query failed:`, err instanceof Error ? err.message : err);
      continue;
    }
    matched += matchIds.length;

    // Fire once per subject: INSERT dedupe returns only genuinely new matches.
    let newlyFired: string[] = [];
    if (matchIds.length > 0) {
      const values: unknown[] = [];
      const tuples = matchIds.map((sid, i) => { values.push(m.id, sid); return `($${i * 2 + 1}::uuid,$${i * 2 + 2})`; });
      const { rows: ins } = await pool.query(
        `INSERT INTO monitor_fires (monitor_id, subject_id) VALUES ${tuples.join(',')}
         ON CONFLICT (monitor_id, subject_id) DO NOTHING RETURNING subject_id`,
        values,
      );
      newlyFired = ins.map((r) => String((r as Record<string, unknown>).subject_id));
    }

    for (const sid of newlyFired) {
      try {
        await invokeAction(pool, m.action.id as string, {
          subjectType: m.subjectType,
          subjectId: sid,
          params: { ...(m.action.params ?? {}), ...defaultActionParams(m) },
          actor: `monitor:${m.id}`,
          role: 'operator',
        });
        fired++;
      } catch (err) {
        console.warn(`[monitors] ${m.id} action failed for ${sid}:`, err instanceof Error ? err.message : err);
      }
    }

    await pool.query(`UPDATE monitors SET last_run_at = now(), last_match_count = $2 WHERE id = $1`, [m.id, matchIds.length]);
  }

  return { monitors: monitors.length, matched, fired };
}

/** Give notify/create_task a sensible default title if the monitor didn't set one. */
function defaultActionParams(m: MonitorRow): Record<string, unknown> {
  const p = m.action.params ?? {};
  if ((m.action.id === 'notify' || m.action.id === 'create_task') && !p.title) {
    return { title: `Monitor: ${m.name}` };
  }
  return {};
}

function mapMonitor(r: Record<string, unknown>): MonitorRow {
  return {
    id: String(r.id), owner: String(r.owner), name: String(r.name), enabled: r.enabled === true,
    subjectType: String(r.subject_type ?? 'project'),
    filter: (r.filter ?? {}) as MonitorFilter,
    condition: (r.condition ?? {}) as MonitorCondition,
    action: (r.action ?? {}) as MonitorAction,
    lastRunAt: (r.last_run_at as string) ?? null,
    lastMatchCount: Number(r.last_match_count ?? 0),
    createdAt: String(r.created_at),
  };
}

/* ── CRUD ── */

export async function listMonitors(pool: pg.Pool): Promise<MonitorRow[]> {
  const { rows } = await pool.query(`SELECT * FROM monitors ORDER BY created_at DESC LIMIT 200`);
  return rows.map((r) => mapMonitor(r as Record<string, unknown>));
}

export async function createMonitor(pool: pg.Pool, owner: string, m: Partial<MonitorRow>): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO monitors (owner, name, enabled, subject_type, filter, condition, action)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) RETURNING id`,
    [owner, (m.name ?? 'Untitled monitor').slice(0, 120), m.enabled !== false, m.subjectType ?? 'project',
     JSON.stringify(m.filter ?? {}), JSON.stringify(m.condition ?? {}), JSON.stringify(m.action ?? {})],
  );
  return rows[0].id as string;
}

export async function updateMonitor(pool: pg.Pool, id: string, m: Partial<MonitorRow>): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (m.name !== undefined) { sets.push(`name = $${i++}`); params.push(m.name.slice(0, 120)); }
  if (m.enabled !== undefined) { sets.push(`enabled = $${i++}`); params.push(m.enabled); }
  if (m.filter !== undefined) { sets.push(`filter = $${i++}::jsonb`); params.push(JSON.stringify(m.filter)); }
  if (m.condition !== undefined) { sets.push(`condition = $${i++}::jsonb`); params.push(JSON.stringify(m.condition)); }
  if (m.action !== undefined) { sets.push(`action = $${i++}::jsonb`); params.push(JSON.stringify(m.action)); }
  if (sets.length === 0) return false;
  sets.push(`updated_at = now()`);
  params.push(id);
  const { rowCount } = await pool.query(`UPDATE monitors SET ${sets.join(', ')} WHERE id = $${i}`, params);
  return (rowCount ?? 0) > 0;
}

export async function deleteMonitor(pool: pg.Pool, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM monitors WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/** Recent fires for a monitor, joined to project names — the activity feed. */
export async function monitorActivity(pool: pg.Pool, id: string, limit = 50) {
  const { rows } = await pool.query(
    `SELECT mf.subject_id, mf.fired_at, p.name, p.ticker
     FROM monitor_fires mf LEFT JOIN projects p ON p.id::text = mf.subject_id
     WHERE mf.monitor_id = $1 ORDER BY mf.fired_at DESC LIMIT $2`,
    [id, limit],
  );
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { subjectId: x.subject_id, name: x.name ?? null, ticker: x.ticker ?? null, firedAt: x.fired_at };
  });
}
