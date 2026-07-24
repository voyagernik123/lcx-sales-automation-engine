import { createMiddleware } from 'hono/factory';
import { type Capability, type WorkspaceId, capAtLeast, getWorkspace } from '@lcx/shared';
import type { AuthVariables } from './auth.js';
import { resolvePrincipal } from './auth.js';
import { loadEntitlements } from '../access/entitlements.js';
import { getPool } from '../db/index.js';

/**
 * requireWorkspace(ws, capability) — the LCX OS compartment gate (Phase 1).
 *
 * Applied at the /v1 namespace mounts (app.ts) BEFORE the per-route
 * requireOperator, so it authenticates when it is first in line and stays
 * idempotent when it is not. Need-to-know: a member without an entitlement to
 * this workspace receives a structured 403 the web shell turns into a
 * request-access surface, never a dead end.
 *
 * Machines (shared key, monitors, ai) hold blanket 'operate' — cron never
 * breaks — while 'approve'-tier checks remain human-only by construction.
 */
export function requireWorkspace(ws: WorkspaceId, capability: Capability = 'view') {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    let operator = c.get('operator');
    if (!operator) {
      const principal = resolvePrincipal(c.req.header('authorization'), c.req.header('x-api-key'));
      if (!principal) {
        return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }
      c.set('operator', principal);
      operator = principal;
    }

    const entitlements = await loadEntitlements(getPool(), operator.id);
    if (capAtLeast(entitlements[ws], capability)) {
      await next();
      return;
    }

    const def = getWorkspace(ws);
    return c.json(
      {
        error: `Forbidden: ${def.name} requires '${capability}' access`,
        code: 'WORKSPACE_FORBIDDEN',
        workspace: ws,
        workspaceName: def.name,
        needed: capability,
      },
      403,
    );
  });
}
