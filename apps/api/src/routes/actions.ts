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
import { buildActionManifest } from '../actions/manifest.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const actionRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * `data` stays the 5-field array the monitor builder already consumes
 * (apps/web/src/lib/api/monitors.ts RegistryActionInfo), so this widening is
 * backward-compatible. The full grammar rides in `meta`, alongside the hash the
 * command line uses to notice that a client build is older than the API: the web
 * app embeds a generated copy of this manifest for a zero-latency, offline-capable
 * open, and the two apps deploy separately.
 */
actionRoutes.get('/', requireOperator, (c) => {
  const manifest = buildActionManifest();
  return c.json({
    data: listActions(),
    meta: { ...meta(), manifestHash: manifest.manifestHash, actions: manifest.actions, valueSets: manifest.valueSets },
  });
});

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
    if (err instanceof ActionError) {
      // Spread any structured detail alongside the code so the client can act on
      // a refusal without parsing prose. Phase 3's command line offers the remedy
      // for a gate, and it needs the machine-readable half to know which remedy.
      return c.json({ error: err.message, code: err.code, ...(err.data ?? {}) }, err.status as 400);
    }

    // A malformed subject id is the operator's mistake, not ours. Postgres
    // rejects a non-uuid for a uuid column with 22P02, which used to surface as
    // a bare 500 "Action failed" — indistinguishable from a server fault, and
    // something the command line will hit constantly once ids are typed by hand.
    if (isInvalidInput(err)) {
      return c.json(
        { error: 'That subject id is not valid for this object type.', code: 'VALIDATION' },
        400,
      );
    }

    console.error('[actions] invoke error:', err);
    return c.json({ error: 'Action failed', code: 'ACTION_ERROR' }, 500);
  }
});

/** Postgres 22P02 invalid_text_representation — e.g. 'probe' where a uuid is required. */
function isInvalidInput(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '22P02';
}
