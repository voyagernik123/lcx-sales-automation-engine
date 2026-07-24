import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth.js';
import { getPool } from '../db/index.js';

/**
 * requirePurpose(resource) — the Palantir checkpoint (LCX ONE Phase 2).
 *
 * Sensitive reads (a colleague's access dossier, the full audit trail, a
 * cross-workspace export) demand a stated reason before they resolve. The
 * purpose arrives in the `X-Purpose` header, must be substantive (≥8 chars),
 * and is written to the audit spine BEFORE the handler runs — so the record of
 * "who looked, at what, and why" exists even if the read itself later errors.
 *
 * Missing/thin purpose → 428 PURPOSE_REQUIRED, which the web turns into a
 * one-line purpose prompt rather than a dead end. Layer after requireOperator.
 */
export function requirePurpose(resource: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const purpose = (c.req.header('x-purpose') ?? '').trim();
    if (purpose.length < 8) {
      return c.json(
        {
          error: `A stated purpose (≥8 chars) is required to view ${resource}`,
          code: 'PURPOSE_REQUIRED',
          resource,
        },
        428,
      );
    }
    const actor = c.get('operator')?.id ?? 'unknown';
    // Checkpoint first, read second — the access record is not contingent on
    // the read succeeding. Best-effort: a logging hiccup must not block the
    // legitimate read it is meant to accompany.
    try {
      await getPool().query(
        `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
         VALUES ($1, 'purpose:access', $2, $3, $4::jsonb)`,
        [actor, resource, c.req.param('id') ?? resource, JSON.stringify({ purpose, path: c.req.path })],
      );
    } catch {
      /* audit unavailable — proceed; the gate's job is the prompt, not the log */
    }
    await next();
  });
}
