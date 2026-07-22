/**
 * Governed action routes (Phase 3.2).
 *   GET  /v1/actions            — the registry (for the monitor builder / UI).
 *   POST /v1/actions/:id/invoke — the one governed mutation path.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { listActions, invokeAction, ActionError, type ActorRole } from '../actions/registry.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const actionRoutes = new Hono<{ Variables: AuthVariables }>();

actionRoutes.get('/', requireOperator, (c) => c.json({ data: listActions(), meta: meta() }));

actionRoutes.post('/:id/invoke', requireOperator, async (c) => {
  const op = c.get('operator');
  const body = await c.req.json<{ subjectType?: string; subjectId?: string; params?: Record<string, unknown> }>()
    .catch(() => ({} as { subjectType?: string; subjectId?: string; params?: Record<string, unknown> }));
  if (!body.subjectType || !body.subjectId) {
    return c.json({ error: 'subjectType and subjectId required', code: 'VALIDATION' }, 400);
  }
  try {
    const result = await invokeAction(getPool(), c.req.param('id'), {
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      params: body.params,
      actor: op.id,
      role: (op.role === 'approver' ? 'approver' : 'operator') as ActorRole,
    });
    return c.json({ data: { action: c.req.param('id'), result }, meta: meta() });
  } catch (err) {
    if (err instanceof ActionError) return c.json({ error: err.message, code: err.code }, err.status as 400);
    console.error('[actions] invoke error:', err);
    return c.json({ error: 'Action failed', code: 'ACTION_ERROR' }, 500);
  }
});
