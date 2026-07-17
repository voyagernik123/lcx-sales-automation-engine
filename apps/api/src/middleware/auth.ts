import { createMiddleware } from 'hono/factory';
import { type OperatorPrincipal, findMemberByEmail } from '@lcx/shared';
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
 * Authenticate the request against one of two credentials, passed via
 * `Authorization: Bearer <cred>`, `Authorization: ApiKey <cred>`, or
 * `X-API-Key: <cred>`:
 *
 *  1. The shared `OPERATOR_API_KEY` — for cron jobs, integrations, and any
 *     browser that has the key set. Attributes work to a generic "operator".
 *  2. A desk member's email address (see @lcx/shared TEAM) — the per-person
 *     sign-in. Because the allowlist is validated server-side, entering your
 *     email on ANY browser authorizes you there; work attributes to you.
 *
 * `role` is 'operator' for both (single-tier API RBAC today); the email path
 * additionally sets the real member `id` for attribution.
 */
export const requireOperator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const key = extractApiKey(c.req.header('authorization'), c.req.header('x-api-key'));

  if (key) {
    // 1) Shared operator API key (timing-safe).
    if (safeEqual(key, env.operatorApiKey)) {
      c.set('operator', { id: 'operator', role: 'operator', authMethod: 'api_key' });
      await next();
      return;
    }

    // 2) Desk email allowlist — the credential IS the member's email.
    const member = findMemberByEmail(key);
    if (member) {
      c.set('operator', { id: member.id, role: 'operator', authMethod: 'email' });
      await next();
      return;
    }
  }

  return c.json(
    {
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    },
    401,
  );
});
