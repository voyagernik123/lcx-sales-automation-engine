import { Hono } from 'hono';
import { actionsFor, isServerAction, TEAM, type TeamRole } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { listObservations, recordObservation } from '../intel/observations.js';
import { executeAction, getObjectState, listWatchlist } from '../intel/actions.js';
import { getCoverage } from '../intel/collect.js';
import { getAssessment, listTargets } from '../intel/alpha.js';
import { listIndications } from '../intel/iw.js';
import { backtestAlpha } from '../intel/backtest.js';
import { buildCoverageReport } from '../intel/report.js';
import { buildDailyBrief } from '../intel/brief.js';

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

/** GET /v1/intel/assessment?subjectId= — the full alpha assessment for a project. */
intelRoutes.get('/assessment', requireOperator, async (c) => {
  const subjectId = c.req.query('subjectId');
  if (!subjectId) return c.json({ error: 'subjectId required', code: 'VALIDATION' }, 400);
  try {
    const data = await getAssessment(subjectId);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] assessment error:', err);
    return c.json({ error: 'Failed to load assessment', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/targets — the ripe-now target list, ranked by conviction. */
intelRoutes.get('/targets', requireOperator, async (c) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 25) || 25));
    const minConviction = Math.max(0, Number(c.req.query('minConviction') ?? 0) || 0);
    const data = await listTargets(limit, minConviction);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] targets error:', err);
    return c.json({ error: 'Failed to load targets', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/indications — current Indications & Warning list. */
intelRoutes.get('/indications', requireOperator, async (c) => {
  try {
    const data = await listIndications(Math.min(100, Number(c.req.query('limit') ?? 50) || 50));
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] indications error:', err);
    return c.json({ error: 'Failed to load indications', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/backtest — signal-validity discrimination test. */
intelRoutes.get('/backtest', requireOperator, async (c) => {
  try {
    const data = await backtestAlpha();
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] backtest error:', err);
    return c.json({ error: 'Failed to run backtest', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/report?subjectId= — the analyst coverage report for a project. */
intelRoutes.get('/report', requireOperator, async (c) => {
  const subjectId = c.req.query('subjectId');
  if (!subjectId) return c.json({ error: 'subjectId required', code: 'VALIDATION' }, 400);
  try {
    const data = await buildCoverageReport(subjectId);
    if (!data) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] report error:', err);
    return c.json({ error: 'Failed to build report', code: 'INTEL_ERROR' }, 500);
  }
});

/** GET /v1/intel/brief — the Daily Intelligence Brief (PDB). */
intelRoutes.get('/brief', requireOperator, async (c) => {
  try {
    const data = await buildDailyBrief();
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[intel] brief error:', err);
    return c.json({ error: 'Failed to build brief', code: 'INTEL_ERROR' }, 500);
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
