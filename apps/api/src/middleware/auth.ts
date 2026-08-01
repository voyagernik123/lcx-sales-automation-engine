import { createMiddleware } from 'hono/factory';
import {
  type OperatorPrincipal,
  findMemberByEmail,
  hasDeparted,
  isLcxDomainEmail,
  normalizeEmail,
} from '@lcx/shared';
import { secondTierSeen } from '../lib/secondTier.js';
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

    // 3) SECOND-TIER SIGN-IN — any @lcx.com address plus SECONDARY_PASSCODE.
    //
    //    Requested explicitly by Nik (2026-08-01) after being shown the tradeoff
    //    and reaffirming: the wider team must be able to work without waiting on
    //    a roster edit and a deploy. This is a deliberate, documented widening,
    //    not an oversight — the notes below exist so nobody later "discovers" it
    //    and assumes it was a mistake.
    //
    //    WHAT IT DELIBERATELY IS NOT:
    //      - Not `approver`. Second tier is always 'operator', so the two
    //        approve-gated acts (discount approval, clearing a conflict) stay with
    //        the named roster. Handing approve-tier to a short shared secret would
    //        exceed what was asked and cannot be undone from an audit log.
    //      - Not domain-optional. `isAllowedEmail` still gates on the LCX domain,
    //        so this is "any colleague", never "anyone on the internet".
    //      - Not silent. `id` is `ext:<local-part>`, which is visibly distinct from
    //        a roster id in every audit row, and `secondTierSeen()` records the
    //        session (see lib/secondTier.ts) because the honest limit of a shared
    //        secret is that the row names the credential, not the person.
    //
    //    THE RISK, STATED PLAINLY AND ACCEPTED BY THE OWNER: a shared passcode is
    //    guessable and unattributable. `gps` holds third parties' unpublished
    //    regulatory filings and legal work product. If a client ever asks who read
    //    their file, the answer this path can give is "someone holding the
    //    secondary passcode". Rotate SECONDARY_PASSCODE when anyone leaves, and
    //    prefer per-person credentials when there is time to build them.
    if (env.secondaryPasscode && safeEqual(passcode, env.secondaryPasscode)) {
      const normalized = normalizeEmail(email);
      // `isLcxDomainEmail`, NOT `isAllowedEmail` — the latter is a ROSTER check
      // (operators.ts:47), so using it here would have admitted only the three
      // people who can already sign in, i.e. the feature would have done nothing.
      // Caught before shipping; the domain gate is exact, not endsWith, so
      // `nik@lcx.com.evil.example` and `nik@sub.lcx.com` are refused.
      //
      // `hasDeparted` refuses people who LEFT. 0042 deliberately deleted their
      // entitlements; without this the second tier hands that access straight back,
      // and their mailbox need not even work — nothing here verifies control of the
      // address. Rotating SECONDARY_PASSCODE is what actually revokes; this list
      // only stops the lazy attempt.
      if (isLcxDomainEmail(normalized) && !hasDeparted(normalized)) {
        // A roster member who typed the SECONDARY passcode is still themselves —
        // resolve to their real id and role rather than shadowing them with an
        // `ext:` principal, or their audit history would fork by which password
        // they happened to use.
        const known = findMemberByEmail(normalized);
        if (known) {
          return {
            id: known.id,
            role: known.role === 'approver' ? 'approver' : 'operator',
            authMethod: 'email',
          };
        }
        const local = normalized.slice(0, normalized.indexOf('@')).replace(/[^a-z0-9._-]/g, '') || 'unknown';
        secondTierSeen(normalized);
        return { id: `ext:${local}`, role: 'operator', authMethod: 'email' };
      }
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
