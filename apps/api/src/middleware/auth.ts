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
 *  2. A desk sign-in `email:passcode` (roster email from @lcx/shared TEAM +
 *     the shared DESK_PASSCODE) — both validated server-side; work attributes
 *     to the person. A bare email is rejected: the desk is passcode-gated.
 *
 * The shared key authenticates as a plain 'operator'. The email path sets the
 * real member `id` (for attribution) AND the member's real `role` — so approver
 * privileges (deal sign-off) are now enforced server-side, not just on the
 * client. Roster 'viewer' members (none today) fall back to 'operator', the
 * base API tier; a dedicated read-only tier is out of scope for this pass.
 */
export function resolvePrincipal(
  authHeader: string | undefined,
  apiKeyHeader: string | undefined,
): OperatorPrincipal | null {
  const key = extractApiKey(authHeader, apiKeyHeader);
  if (!key) return null;

  // 1) Shared operator API key (timing-safe) — cron, integrations, machines.
  if (safeEqual(key, env.operatorApiKey)) {
    return { id: 'operator', role: 'operator', authMethod: 'api_key' };
  }

  // 2) Desk sign-in — the credential is `email:passcode` (LCX OS gate,
  //    2026-07-24). The email must be on the roster AND the passcode must
  //    match DESK_PASSCODE (timing-safe). A bare email is no longer a key:
  //    both halves are required, so a leaked address alone opens nothing.
  const sep = key.indexOf(':');
  if (sep > 0) {
    const email = key.slice(0, sep);
    const passcode = key.slice(sep + 1);
    const member = findMemberByEmail(email);
    if (member && safeEqual(passcode, env.deskPasscode)) {
      return {
        id: member.id,
        role: member.role === 'approver' ? 'approver' : 'operator',
        authMethod: 'email',
      };
    }
  }
  return null;
}

export const requireOperator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  // The LCX OS workspace gate (middleware/workspace.ts) may have authenticated
  // this request already — one resolution per request, never two.
  if (c.get('operator')) {
    await next();
    return;
  }

  const principal = resolvePrincipal(c.req.header('authorization'), c.req.header('x-api-key'));
  if (principal) {
    c.set('operator', principal);
    await next();
    return;
  }

  return c.json(
    {
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    },
    401,
  );
});
