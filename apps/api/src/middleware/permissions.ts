import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth.js';

/**
 * requirePermission(resource, action) — RBAC gate.
 *
 * Real enforcement (consulting the `permissions` table seeded in migration 0019)
 * lands later. Today the system is single-operator: the operator role is
 * all-powerful, so this simply passes the request through. Non-operator roles
 * will be denied once multi-user auth is wired up.
 *
 * Usage (opt-in per route, does not replace requireOperator):
 *   route.post('/', requireOperator, requirePermission('notes', 'create'), handler)
 */
export function requirePermission(resource: string, action: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const operator = c.get('operator');

    // Operator bypass — full access while single-operator.
    if (operator?.role === 'operator') {
      await next();
      return;
    }

    // Placeholder for future per-role checks against the permissions table.
    // Until that exists, deny anything that isn't the operator.
    return c.json(
      {
        error: `Forbidden: ${action} on ${resource}`,
        code: 'FORBIDDEN',
      },
      403,
    );
  });
}
