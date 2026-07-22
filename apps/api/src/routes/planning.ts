/**
 * Scenarios (Phase 3.3) + PIRs (Phase 3.4).
 *   /v1/scenarios — named, shareable what-if worlds (the dials as objects).
 *   /v1/pirs      — Priority Intelligence Requirements that drive collection.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/* ── Scenarios ── */
export const scenarioRoutes = new Hono<{ Variables: AuthVariables }>();

scenarioRoutes.get('/', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT id, owner, name, deltas, shared, updated_at FROM scenarios ORDER BY updated_at DESC LIMIT 100`);
    return c.json({ data: rows.map((r) => ({ id: r.id, owner: r.owner, name: r.name, deltas: r.deltas, shared: r.shared, updatedAt: r.updated_at })), meta: meta() });
  } catch (err) {
    console.error('[scenarios] list error:', err);
    return c.json({ error: 'Failed to list scenarios', code: 'SCENARIO_ERROR' }, 500);
  }
});

scenarioRoutes.post('/', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  const body = await c.req.json<{ name?: string; deltas?: Record<string, number> }>().catch(() => ({} as { name?: string; deltas?: Record<string, number> }));
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  const d = body.deltas ?? {};
  const deltas = {
    closeRateDelta: clampNum(d.closeRateDelta, -0.5, 0.5),
    valueDelta: clampNum(d.valueDelta, -0.5, 0.5),
    timelineShiftDays: clampNum(d.timelineShiftDays, -180, 180),
  };
  try {
    const { rows } = await getPool().query(
      `INSERT INTO scenarios (owner, name, deltas) VALUES ($1,$2,$3::jsonb) RETURNING id`,
      [owner, body.name.trim().slice(0, 120), JSON.stringify(deltas)],
    );
    return c.json({ data: { id: rows[0].id }, meta: meta() }, 201);
  } catch (err) {
    console.error('[scenarios] create error:', err);
    return c.json({ error: 'Failed to save scenario', code: 'SCENARIO_ERROR' }, 500);
  }
});

scenarioRoutes.delete('/:id', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  try {
    const { rowCount } = await getPool().query(`DELETE FROM scenarios WHERE id=$1 AND (owner=$2 OR $2='operator')`, [c.req.param('id'), owner]);
    return (rowCount ?? 0) > 0 ? c.json({ data: { deleted: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[scenarios] delete error:', err);
    return c.json({ error: 'Failed to delete scenario', code: 'SCENARIO_ERROR' }, 500);
  }
});

/* ── PIRs ── */
export const pirRoutes = new Hono<{ Variables: AuthVariables }>();

pirRoutes.get('/', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT id, owner, name, question, sources, priority, updated_at FROM pirs ORDER BY priority ASC, updated_at DESC LIMIT 100`);
    return c.json({ data: rows.map((r) => ({ id: r.id, owner: r.owner, name: r.name, question: r.question, sources: r.sources, priority: r.priority, updatedAt: r.updated_at })), meta: meta() });
  } catch (err) {
    console.error('[pirs] list error:', err);
    return c.json({ error: 'Failed to list PIRs', code: 'PIR_ERROR' }, 500);
  }
});

pirRoutes.post('/', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  const body = await c.req.json<{ name?: string; question?: string; sources?: string[]; priority?: number }>().catch(() => ({} as { name?: string; question?: string; sources?: string[]; priority?: number }));
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  const sources = Array.isArray(body.sources) ? body.sources.filter((s) => typeof s === 'string').slice(0, 20) : [];
  const priority = Math.min(5, Math.max(1, Math.round(Number(body.priority ?? 3))));
  try {
    const { rows } = await getPool().query(
      `INSERT INTO pirs (owner, name, question, sources, priority) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [owner, body.name.trim().slice(0, 120), (body.question ?? '').slice(0, 500), sources, priority],
    );
    return c.json({ data: { id: rows[0].id }, meta: meta() }, 201);
  } catch (err) {
    console.error('[pirs] create error:', err);
    return c.json({ error: 'Failed to save PIR', code: 'PIR_ERROR' }, 500);
  }
});

pirRoutes.patch('/:id', requireOperator, async (c) => {
  const body = await c.req.json<{ name?: string; question?: string; sources?: string[]; priority?: number }>().catch(() => ({} as { name?: string; question?: string; sources?: string[]; priority?: number }));
  const sets: string[] = []; const params: unknown[] = []; let i = 1;
  if (body.name !== undefined) { sets.push(`name=$${i++}`); params.push(body.name.slice(0, 120)); }
  if (body.question !== undefined) { sets.push(`question=$${i++}`); params.push(body.question.slice(0, 500)); }
  if (body.sources !== undefined) { sets.push(`sources=$${i++}`); params.push(body.sources.filter((s) => typeof s === 'string').slice(0, 20)); }
  if (body.priority !== undefined) { sets.push(`priority=$${i++}`); params.push(Math.min(5, Math.max(1, Math.round(Number(body.priority))))); }
  if (sets.length === 0) return c.json({ error: 'Nothing to update', code: 'VALIDATION' }, 400);
  sets.push(`updated_at=now()`); params.push(c.req.param('id'));
  try {
    const { rowCount } = await getPool().query(`UPDATE pirs SET ${sets.join(', ')} WHERE id=$${i}`, params);
    return (rowCount ?? 0) > 0 ? c.json({ data: { updated: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[pirs] update error:', err);
    return c.json({ error: 'Failed to update PIR', code: 'PIR_ERROR' }, 500);
  }
});

pirRoutes.delete('/:id', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  try {
    const { rowCount } = await getPool().query(`DELETE FROM pirs WHERE id=$1 AND (owner=$2 OR $2='operator')`, [c.req.param('id'), owner]);
    return (rowCount ?? 0) > 0 ? c.json({ data: { deleted: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[pirs] delete error:', err);
    return c.json({ error: 'Failed to delete PIR', code: 'PIR_ERROR' }, 500);
  }
});

function clampNum(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
}
