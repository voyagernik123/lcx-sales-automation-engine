/**
 * Graph / search-around routes (Palantir-grade Phase 1.1).
 *   GET /v1/graph/:type/:id/related — typed, counted link groups for any object.
 *
 * The single primitive the "graph is the navigation" experience is built on:
 * inspectors render the groups as pivot chips, and the /graph page expands them
 * into a force-directed view.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { capAtLeast } from '@lcx/shared';
import { loadEntitlements } from '../access/entitlements.js';
import { RELATED_RESOLVERS, isResolvableType, type ResolveContext } from '../graph/links.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const graphRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── Saved explorations (Phase 1.4) — shared Sales-Graph views ── */

graphRoutes.get('/explorations', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, owner, name, payload, updated_at FROM explorations ORDER BY updated_at DESC LIMIT 100`,
    );
    return c.json({ data: rows.map((r) => ({
      id: r.id, owner: r.owner, name: r.name, payload: r.payload, updatedAt: r.updated_at,
    })), meta: meta() });
  } catch (err) {
    console.error('[graph] explorations list error:', err);
    return c.json({ error: 'Failed to list explorations', code: 'GRAPH_ERROR' }, 500);
  }
});

graphRoutes.post('/explorations', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  const body = await c.req.json<{ name?: string; payload?: unknown }>().catch(() => ({} as { name?: string; payload?: unknown }));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return c.json({ error: 'Name required', code: 'VALIDATION' }, 400);
  const payloadStr = JSON.stringify(body.payload ?? {});
  if (payloadStr.length > 300_000) return c.json({ error: 'Exploration too large', code: 'VALIDATION' }, 413);
  try {
    const { rows } = await getPool().query(
      `INSERT INTO explorations (owner, name, payload) VALUES ($1, $2, $3::jsonb) RETURNING id, updated_at`,
      [owner, name, payloadStr],
    );
    return c.json({ data: { id: rows[0].id, name, owner, updatedAt: rows[0].updated_at }, meta: meta() }, 201);
  } catch (err) {
    console.error('[graph] exploration save error:', err);
    return c.json({ error: 'Failed to save exploration', code: 'GRAPH_ERROR' }, 500);
  }
});

graphRoutes.delete('/explorations/:id', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  try {
    // Owners delete their own; the shared 'operator' key can prune any.
    const { rowCount } = await getPool().query(
      `DELETE FROM explorations WHERE id = $1 AND (owner = $2 OR $2 = 'operator')`,
      [c.req.param('id'), owner],
    );
    if ((rowCount ?? 0) === 0) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { deleted: true }, meta: meta() });
  } catch (err) {
    console.error('[graph] exploration delete error:', err);
    return c.json({ error: 'Failed to delete exploration', code: 'GRAPH_ERROR' }, 500);
  }
});

graphRoutes.get('/:type/:id/related', requireOperator, async (c) => {
  const { type, id } = c.req.param();
  if (!isResolvableType(type)) {
    return c.json({ error: `No search-around for type: ${type}`, code: 'VALIDATION' }, 400);
  }
  if (!id || id.length > 128) {
    return c.json({ error: 'Bad id', code: 'VALIDATION' }, 400);
  }
  try {
    /*
     * S5: the reader's entitlements travel into every resolver. The route itself has no workspace gate
     * (it spans compartments — routeCompartmentCoverage declares it), so the compartment decision is made
     * per GROUP, and a group the reader does not hold comes back WITHHELD rather than missing.
     */
    const ents = await loadEntitlements(getPool(), c.get('operator').id);
    const ctx: ResolveContext = { holds: (ws) => capAtLeast(ents[ws], 'view') };
    const groups = await RELATED_RESOLVERS[type]!(getPool(), id, ctx);
    const totalLinks = groups.reduce((n, g) => n + g.count, 0);
    return c.json({ data: { type, id, groups, totalLinks }, meta: meta() });
  } catch (err) {
    console.error('[graph] related error:', err);
    return c.json({ error: 'Failed to resolve related objects', code: 'GRAPH_ERROR' }, 500);
  }
});
