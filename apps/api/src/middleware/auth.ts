import { createMiddleware } from 'hono/factory';
import type { OperatorPrincipal } from '@lcx/shared';
import { findOperatorByEmail, isAllowedEmailDomain, nameFromEmail } from '@lcx/shared';
import { env } from '../lib/env.js';
import { verifySupabaseAccessToken } from '../lib/supabaseJwt.js';

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
 * Require an operator credential — either still works, checked in order:
 * - The shared static OPERATOR_API_KEY (local dev / tests / service calls).
 * - A Supabase-issued JWT from a real Google login, gated to @lcx.com.
 *
 * Sent as:
 * - Authorization: Bearer <token>
 * - Authorization: ApiKey <token>
 * - X-API-Key: <token>
 */
export const requireOperator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const token = extractApiKey(c.req.header('authorization'), c.req.header('x-api-key'));

  if (token && safeEqual(token, env.operatorApiKey)) {
    c.set('operator', { id: 'operator', role: 'operator', authMethod: 'api_key' });
    return next();
  }

  if (token) {
    const verified = await verifySupabaseAccessToken(token);
    if (verified && isAllowedEmailDomain(verified.email)) {
      const roster = findOperatorByEmail(verified.email);
      c.set('operator', {
        id: roster?.id ?? verified.email,
        role: 'operator',
        authMethod: 'google',
        email: verified.email,
        name: roster?.name ?? nameFromEmail(verified.email),
      });
      return next();
    }
  }

  return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
});
