import { createMiddleware } from 'hono/factory';
import type { OperatorPrincipal } from '@lcx/shared';
import { env } from '../lib/env.js';

export type AuthVariables = {
  operator: OperatorPrincipal;
};

function extractApiKey(authHeader: string | undefined, apiKeyHeader: string | undefined): string | null {
  if (apiKeyHeader && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(/\s+/, 2);
  if (!token) return null;
  if (scheme.toLowerCase() === 'bearer' || scheme.toLowerCase() === 'apikey') {
    return token.trim();
  }
  return null;
}

/** Timing-safe compare for API keys (constant-time when lengths match). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Require operator API key via:
 * - Authorization: Bearer <OPERATOR_API_KEY>
 * - Authorization: ApiKey <OPERATOR_API_KEY>
 * - X-API-Key: <OPERATOR_API_KEY>
 */
export const requireOperator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const key = extractApiKey(c.req.header('authorization'), c.req.header('x-api-key'));

  if (!key || !safeEqual(key, env.operatorApiKey)) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      401,
    );
  }

  c.set('operator', {
    id: 'operator',
    role: 'operator',
    authMethod: 'api_key',
  });

  await next();
});
