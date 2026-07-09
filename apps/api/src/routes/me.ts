import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';

/**
 * Protected probe — proves API-key auth works.
 * Expand with real operator routes in later slices.
 */
export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.get('/', requireOperator, (c) => {
  const operator = c.get('operator');
  return c.json({
    data: operator,
    meta: {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
  });
});
