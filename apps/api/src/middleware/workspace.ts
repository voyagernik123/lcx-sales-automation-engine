import { createMiddleware } from 'hono/factory';
import { type Capability, type WorkspaceId, capAtLeast, getWorkspace } from '@lcx/shared';
import type { AuthVariables } from './auth.js';
import { resolvePrincipal, secondTierThrottleKey } from './auth.js';
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
/**
 * Path prefixes whose REFUSALS are written to `audit_log`, not merely returned.
 *
 * Added 2026-08-02, when GPS gained a client-file intake surface. A refused download
 * of a client's document is itself the security event a regulator or a client asks
 * about — "who tried to read our file" has no answer if the 403 leaves no trace, and
 * this gate returns before any handler runs, so the handler cannot record it.
 *
 * Deliberately an ALLOWLIST and not every 403. Auditing all refusals across eight
 * compartments turns any 403-generating loop into unbounded INSERT traffic — a
 * write-amplification vector, and one an unauthenticated caller could aim. So the
 * cost is paid only where the refusal carries information: reads of stored client
 * bytes. Extending this list is a deliberate act; adding a compartment is not.
 *
 * PATTERNS, not prefixes, and the reason is a bug this nearly shipped with: the
 * artifact surface is mounted at BOTH `/v1/gps/artifacts/:id/…` and
 * `/v1/gps/engagements/:id/artifacts` (`routes/gpsArtifact.ts:128,174`). A
 * `startsWith('/v1/gps/artifacts')` prefix matches the first and silently misses the
 * second — so upload and list refusals would never have been recorded, while the
 * constant's name promised they were. Anchored regexes make the coverage checkable.
 */
export const AUDITED_REFUSAL_PATTERNS: readonly RegExp[] = [
  /^\/v1\/gps\/artifacts(?:\/|$)/,
  /^\/v1\/gps\/engagements\/[^/]+\/artifacts(?:\/|$)/,
];

/** `audit_log.action` for a refusal recorded by the compartment gate. One string, so
 *  "every attempt to read a client file that was turned away" is a single filter. */
export const WORKSPACE_REFUSAL_ACTION = 'workspace.access_refused';

export function refusalIsAudited(path: string): boolean {
  return AUDITED_REFUSAL_PATTERNS.some((p) => p.test(path));
}

export function requireWorkspace(ws: WorkspaceId, capability: Capability = 'view') {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    let operator = c.get('operator');
    if (!operator) {
      /*
       * THE THROTTLE KEY IS THE THIRD ARGUMENT, AND OMITTING IT SILENTLY DISARMS THE CONTROL.
       * `resolvePrincipal` takes no throttle when the key is absent — deliberately, so an
       * un-threaded caller can never feed a lockout it cannot see. The cost of that safe default
       * is that a call site which simply forgets the argument gets the PRE-FIX behaviour with no
       * error and no test failure. This site is that call site: every request entering through a
       * compartment gate authenticated here, and therefore bypassed the brute-force lockout
       * entirely while the front door enforced it.
       *
       * Found by tracing the call graph after the fix, not by a test — which is why the census in
       * `secondTierThrottle.test.ts` now asserts that EVERY call site passes a key, rather than
       * asserting that this one does.
       */
      const principal = resolvePrincipal(
        c.req.header('authorization'),
        c.req.header('x-api-key'),
        secondTierThrottleKey(c),
      );
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

    if (refusalIsAudited(new URL(c.req.url).pathname)) {
      // Best-effort by construction. A failure to WRITE the record must never turn a
      // refusal into anything other than a refusal — not a 500, and above all not a
      // pass. The catch is the point, not an oversight.
      try {
        await getPool().query(
          `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            operator.id,
            WORKSPACE_REFUSAL_ACTION,
            'workspace',
            ws,
            JSON.stringify({
              workspace: ws,
              needed: capability,
              held: entitlements[ws] ?? null,
              method: c.req.method,
              path: new URL(c.req.url).pathname,
              role: operator.role,
            }),
          ],
        );
      } catch {
        // Swallowed deliberately — see above.
      }
    }

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
