import { Hono } from 'hono';
import { actionsFor, isServerAction, TEAM, type TeamRole } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { listObservations, recordObservation } from '../intel/observations.js';
import { executeAction, getObjectState, listWatchlist } from '../intel/actions.js';
import { getCoverage } from '../intel/collect.js';

export const intelRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** The desk role of the authenticated operator (email principals carry a real id). */
function roleOf(operatorId: string): TeamRole {
  return TEAM.find((m) => m.id === operatorId)?.role ?? 'operator';
}

function requireSubject(c: { req: { query: (k: string) => string | undefined } }) {
  const subjectType = c.req.query('subjectType');
  const subjectId = c.req.query('subjectId');
  return subjectType && subjectId ? { subjectType, subjectId } : null;
}

/** GET /v1/intel/observations?subjectType=&subjectId= — the sourced picture of an object. */
intelRoutes.get('/observations', requireOperator, async (c) => {
  const subj = requireSubject(c);
  if (!subj) return c.json({ error: 'subjectType and subjectId required', code: 'VALIDATION' }, 400);
  try {
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100) || 100));
    const data = await listObservations(subj.subjectType, subj.subjectId, limit);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] observations error:', err);
    return c.json({ error: 'Failed to load observations', code: 'INTEL_ERROR' }, 500);
  }
});

/** POST /v1/intel/observations — record a manual, attributed observation. */
intelRoutes.post('/observations', requireOperator, async (c) => {
  const body = await c.req.json<{
    subjectType?: string; subjectId?: string; predicate?: string;
    value?: unknown; unit?: string; source?: string; sourceUrl?: string;
  }>();
  if (!body.subjectType || !body.subjectId || !body.predicate) {
    return c.json({ error: 'subjectType, subjectId, predicate required', code: 'VALIDATION' }, 400);
  }
  try {
    const id = await recordObservation({
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      predicate: body.predicate,
      value: body.value ?? null,
      unit: body.unit ?? null,
      source: body.source ?? 'manual',
      sourceUrl: body.sourceUrl ?? null,
      actor: c.get('operator').id,
    });
    return c.json({ data: { id }, meta: meta() }, 201);
  } catch (err) {
    console.error('[intel] record observation error:', err);
    return c.json({ error: 'Failed to record observation', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/actions?subjectType=&subjectId= — available actions + current state. */
intelRoutes.get('/actions', requireOperator, async (c) => {
  const subj = requireSubject(c);
  if (!subj) return c.json({ error: 'subjectType and subjectId required', code: 'VALIDATION' }, 400);
  try {
    const role = roleOf(c.get('operator').id);
    const available = actionsFor(subj.subjectType, role);
    const state = await getObjectState(subj.subjectType, subj.subjectId);
    return c.json({ data: { available, state }, meta: meta() });
  } catch (err) {
    console.error('[intel] actions list error:', err);
    return c.json({ error: 'Failed to load actions', code: 'INTEL_ERROR' }, 500);
  }
});

/** POST /v1/intel/actions — execute a governed server action (write-back + audit). */
intelRoutes.post('/actions', requireOperator, async (c) => {
  const body = await c.req.json<{
    subjectType?: string; subjectId?: string; action?: string; params?: Record<string, unknown>;
  }>();
  if (!body.subjectType || !body.subjectId || !body.action) {
    return c.json({ error: 'subjectType, subjectId, action required', code: 'VALIDATION' }, 400);
  }
  if (!isServerAction(body.action)) {
    return c.json({ error: 'Not an executable action', code: 'CLIENT_ONLY' }, 400);
  }
  try {
    const out = await executeAction({
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      action: body.action,
      actor: c.get('operator').id,
      params: body.params,
    });
    return c.json({ data: out, meta: meta() });
  } catch (err) {
    console.error('[intel] execute action error:', err);
    return c.json({ error: 'Failed to execute action', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/coverage?subjectType=&subjectId= — which free sensors have fresh data. */
intelRoutes.get('/coverage', requireOperator, async (c) => {
  const subj = requireSubject(c);
  if (!subj) return c.json({ error: 'subjectType and subjectId required', code: 'VALIDATION' }, 400);
  try {
    const data = await getCoverage(subj.subjectType, subj.subjectId);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] coverage error:', err);
    return c.json({ error: 'Failed to load coverage', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/watchlist?subjectType= — the org watchlist. */
intelRoutes.get('/watchlist', requireOperator, async (c) => {
  try {
    const data = await listWatchlist(c.req.query('subjectType'));
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] watchlist error:', err);
    return c.json({ error: 'Failed to load watchlist', code: 'INTEL_ERROR' }, 500);
  }
});
