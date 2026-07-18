import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth.js';

/**
 * requirePermission(resource, action) — baseline RBAC gate.
 *
 * Both API tiers — operator and approver — clear the baseline (approver ⊇
 * operator), so this passes any authenticated desk principal through. A future
 * read-only 'viewer' tier, or per-resource checks against the `permissions`
 * table seeded in migration 0019, would be denied here.
 *
 * Usage (opt-in per route, does not replace requireOperator):
 *   route.post('/', requireOperator, requirePermission('notes', 'create'), handler)
 */
export function requirePermission(resource: string, action: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const operator = c.get('operator');

    // operator + approver both clear the baseline tier.
    if (operator?.role === 'operator' || operator?.role === 'approver') {
      await next();
      return;
    }

    // Placeholder for future per-role checks against the permissions table.
    return c.json(
      {
        error: `Forbidden: ${action} on ${resource}`,
        code: 'FORBIDDEN',
      },
      403,
    );
  });
}

/**
 * requireApprover — gate for actions only an approver may take (e.g. signing
 * off a deal above an operator's authority). Enforced server-side: an operator
 * principal, or the shared API key, is rejected with 403. Layer it after
 * requireOperator:
 *   route.post('/approve', requireOperator, requireApprover, handler)
 */
export const requireApprover = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const operator = c.get('operator');
  if (operator?.role === 'approver') {
    await next();
    return;
  }
  return c.json(
    {
      error: 'Forbidden: this action requires approver authority',
      code: 'FORBIDDEN_REQUIRES_APPROVER',
    },
    403,
  );
});
