import { Hono } from 'hono';
import { TEAM } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';

/**
 * Protected probe — the client's source of truth for identity and role.
 * The principal's `role` is now server-authoritative (set from the desk roster
 * in requireOperator), and we attach the resolved member profile so the client
 * shows the same name/role the API is enforcing — not a client-side guess.
 */
export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.get('/', requireOperator, (c) => {
  const operator = c.get('operator');
  const member = TEAM.find((m) => m.id === operator.id) ?? null;
  return c.json({
    data: {
      ...operator,
      // `canApprove` is derived once here so the client never has to re-map
      // the role → capability itself; the server owns that decision.
      canApprove: operator.role === 'approver',
      member: member ? { id: member.id, name: member.name, email: member.email, role: member.role } : null,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
  });
});
