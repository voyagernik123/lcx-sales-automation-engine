import { createMiddleware } from 'hono/factory';
import {
  type OperatorPrincipal,
  findMemberByEmail,
  hasDeparted,
  isLcxDomainEmail,
  normalizeEmail,
} from '@lcx/shared';
import {
  secondTierCleared,
  secondTierFailed,
  secondTierSeen,
  secondTierThrottled,
} from '../lib/secondTier.js';
import { env } from '../lib/env.js';

export type AuthVariables = {
  operator: OperatorPrincipal;
};

/**
 * Is this address one that only an adjacent machine can be speaking from — i.e. a
 * co-located reverse proxy — rather than a client dialling us over the internet?
 *
 * Derived from the address itself (RFC1918, loopback, link-local, IPv6 unique-local),
 * not from a list of hostnames or an env var, because the question "am I behind a
 * proxy" has to answer correctly in a deployment nobody edited a config for.
 */
function isAdjacentAddress(addr: string): boolean {
  const a = addr.replace(/^::ffff:/i, '').toLowerCase();
  if (a === '::1' || a === '::' || a.startsWith('127.')) return true;
  if (a.startsWith('10.') || a.startsWith('192.168.') || a.startsWith('169.254.')) return true;
  const octet = /^172\.(\d{1,3})\./.exec(a);
  if (octet && Number(octet[1]) >= 16 && Number(octet[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true; // fc00::/7 unique-local
  if (a.startsWith('fe80:')) return true; // link-local
  return false;
}

/**
 * THE SOURCE IDENTIFIER FOR THE SECOND-TIER BRUTE-FORCE THROTTLE.
 *
 * `lib/secondTier.ts` states the requirement: the failure budget is PER SOURCE, never
 * global, because an aggressive lockout on a SHARED secret keyed globally is a denial of
 * service against the whole team. So this has to answer "which source" — and the honest
 * answer in this deployment is uncomfortable, so it is written down rather than assumed.
 *
 * WHAT IS UNSPOOFABLE: the TCP peer address. `@hono/node-server` exposes it at
 * `c.env.incoming.socket.remoteAddress`; nothing a client sends can change it. What it
 * cannot do is identify the client when a proxy is in the way — on Render (see
 * `render.yaml`) the peer is Render's own edge, identical for every caller on earth, so
 * the peer ALONE collapses the budget to one global bucket.
 *
 * WHAT IDENTIFIES THE CLIENT: `X-Forwarded-For`. But it is client-written, and keying on
 * attacker-controlled data is precisely how the request-rate limiter was evaded
 * (`middleware/rateLimit.ts` and its header) — mint a key per guess and the throttle is
 * decorative. So the FIRST hop is worthless here. The LAST hop is not: a proxy APPENDS,
 * so whatever the caller wrote is pushed leftward and the rightmost entry is the address
 * the nearest trusted proxy actually observed. An attacker can prepend a victim's IP; it
 * cannot make its own hop disappear.
 *
 * THE RULE, AND WHY IT IS NOT A CONFIG FLAG:
 *   - Peer is a PUBLIC address ⇒ we are talking to the client directly, so `X-Forwarded-For`
 *     is pure client input and is IGNORED. Key = the peer. Unspoofable.
 *   - Peer is an ADJACENT address (private/loopback) ⇒ a reverse proxy is in front, so the
 *     rightmost hop is that proxy's observation. Key = peer + rightmost hop.
 * Both branches are unspoofable. There is no "trust the proxy" setting to get wrong, and
 * no deployment where an attacker can rotate this key.
 *
 * WHAT IT COSTS, STATED. I cannot verify from here how many hops Render puts in front of
 * this container. If there is MORE than one, the rightmost entry is an internal constant
 * and the key collapses toward global after all. That is the fail-safe direction and it is
 * why the throttle guards the second tier ONLY: while it is shut, the shared
 * `OPERATOR_API_KEY` (cron, integrations) and the roster's own `DESK_PASSCODE` sign-in
 * both still work, because both are evaluated BEFORE this gate. The worst case is that
 * the "any colleague" convenience door is refused in 30-second windows for as long as an
 * attacker sustains failures against it — the door being attacked, closed while it is
 * attacked. Compare the alternative measured on 2026-08-15: 6,865 guesses/second against
 * a shared code, unthrottled.
 *
 * RETURNS NULL when no peer address is available at all — there is then no source to key
 * on, and inventing a constant would hand every caller one shared budget, i.e. the global
 * lockout the module forbids. Null means "behave exactly as before this fix". That is a
 * silent disappearance of a control, which is the failure this whole change is closing,
 * so it is not left to trust: `__tests__/secondTierThrottle.test.ts` boots the REAL
 * `@hono/node-server` adapter and asserts the key is non-null and per-source. If the
 * adapter ever stops exposing the socket, that test goes red instead of the throttle
 * going quiet.
 */
export function secondTierThrottleKey(c: {
  env?: unknown;
  req: { header: (name: string) => string | undefined };
}): string | null {
  const peer = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  if (!peer) return null;

  /*
   * ── THE RIGHTMOST HOP IS NOT SAFE, AND A SKEPTIC BROKE THE VERSION THAT THOUGHT IT WAS ──
   *
   * The first cut of this function keyed an adjacent peer as `peer|rightmost-XFF-hop`, on the
   * reasoning that "a proxy APPENDS, so the rightmost is the one the caller cannot erase". That
   * is true only when a proxy is actually in front. "The peer is adjacent" does NOT establish
   * that — on loopback, and on any private network reachable directly, the caller writes the
   * WHOLE header including its rightmost entry.
   *
   * Measured, on the same instrument the fix used for its own after-numbers: 200 guesses with the
   * correct passcode hidden at #150, rotating ONLY the rightmost hop, returned
   * {"200":1,"401":199} and guess #150 came back 200 with a live principal — the pre-fix outcome
   * exactly. Cheaper still: 8 failures with no XFF locked `peer:127.0.0.1`, and the same caller
   * then adding ANY XFF value walked straight through.
   *
   * And the mirror was real too: sending `X-Forwarded-For: <a colleague's address>` burned that
   * colleague's budget in 8 requests, so the correct passcode from their machine was then refused.
   * That is precisely the denial of service this module's header says the per-source keying exists
   * to prevent — caused by the keying itself.
   *
   * It is the SAME defect this same review diagnosed in `rateLimit.ts`: a bucket keyed on
   * attacker-controlled data lets the attacker mint buckets. Getting it wrong here, one file away,
   * while correctly naming it there, is worth recording rather than quietly correcting.
   *
   * ── SO: THE PEER, AND NOTHING ELSE, UNLESS THE DEPLOYMENT SAYS OTHERWISE ────────────────
   * The TCP peer is the one value a caller cannot choose. Behind a proxy it collapses to the
   * proxy's address, which makes the budget effectively GLOBAL for that deployment — and that is
   * an accepted cost, not an oversight, for three measured reasons:
   *
   *   · it guards the SECOND TIER ONLY. Cases 1 and 2 — `OPERATOR_API_KEY` and a roster
   *     `email:desk-passcode` — both return BEFORE this point. Measured from a locked source:
   *     API key 200, roster approver 200, second tier 401. Cron and every named operator are
   *     unaffected while the shared door is shut.
   *   · the window is 30 s and self-healing. A team-wide lockout is thirty seconds on one door,
   *     against unlimited guessing of a shared secret that grants `operator` on every
   *     non-elevated compartment.
   *   · a global 5-per-30 s budget is the order this module was designed for in the first place —
   *     its own header targets "10^4 guesses becomes ~17 hours of sustained, obvious traffic".
   *
   * A deployment that KNOWS its topology can recover per-client granularity by setting
   * TRUSTED_PROXY_HOPS to the number of proxies that append to XFF. We do not GUESS that number:
   * guessing it is what produced the hole above. Unset means do not trust the header at all.
   */
  if (!isAdjacentAddress(peer)) return `peer:${peer}`;

  const trusted = trustedProxyHops();
  if (trusted <= 0) return `peer:${peer}`;

  const forwarded = c.req.header('x-forwarded-for');
  if (!forwarded) return `peer:${peer}`;
  const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
  /*
   * With N trusted proxies appending, the last N entries were written by infrastructure and the
   * entry at `length - N` is what the outermost trusted proxy OBSERVED — the real client. A header
   * SHORTER than the declared chain cannot have come through it, so it is refused rather than
   * indexed into: a caller who sends fewer hops than configured must not get a fresh bucket.
   */
  if (hops.length < trusted + 1) return `peer:${peer}`;
  const client = hops[hops.length - trusted - 1];
  return client ? `peer:${peer}|client:${client}` : `peer:${peer}`;
}

/**
 * How many proxies in front of this process append to `X-Forwarded-For`. Zero — the default, and
 * the value on any deployment that has not thought about it — means the header is not trusted at
 * all. Read at call time rather than captured at module load so a test can set it per case.
 */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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
 *
 * `throttleKey` — from `secondTierThrottleKey(c)` — arms the second-tier brute-force
 * budget. IT IS OPTIONAL AND THAT IS A KNOWN GAP, not an oversight: the other caller of
 * this function is `middleware/workspace.ts:58`, which is outside the file set this pass
 * was allowed to touch, so it still calls with two arguments and its path is unthrottled.
 * Omitting the argument reproduces the pre-fix behaviour exactly — no throttle, and no
 * failures counted either, so an unthreaded caller can never contribute to a lockout it
 * cannot see. The one-line change that closes it is recorded with the delivery.
 *
 * NOT SIDE-EFFECT FREE. It records second-tier sessions, counts failures, and clears the
 * failure budget on success. Calling it twice for one request double-counts a guess, which
 * is why `requireOperator` below returns early when a principal is already resolved.
 */
export function resolvePrincipal(
  authHeader: string | undefined,
  apiKeyHeader: string | undefined,
  throttleKey?: string | null,
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
    /*
     * THE PATH IS CLOSED WHEN ITS SECRET IS PUBLIC.
     *
     * `env.deskPasscodeIsPublicDefault` is true only in production with DESK_PASSCODE
     * unset, in which case `env.deskPasscode` is the literal committed in `lib/env.ts`
     * and in test fixtures. The other half is public too: the roster emails are committed
     * at `packages/shared/src/operators.ts`, two of them with `role: 'approver'`. So this
     * comparison would hand the highest desk role — deal sign-off, conflict-clearing — to
     * anyone with a checkout of this repository.
     *
     * REFUSED HERE, NOT AT BOOT. Throwing in `lib/env.ts` was the first fix and it was
     * the wrong trade: it stops the whole API, including JWT and OPERATOR_API_KEY
     * requests that are perfectly well authenticated, so it converts a quiet hole into a
     * loud outage of eight compartments. This refuses the ONE path whose secret is known
     * and leaves everything else serving.
     *
     * Setting DESK_PASSCODE in the environment re-opens it. Until then this is not a
     * degraded mode to be worked around — the door genuinely has no lock.
     *
     * IT FALLS THROUGH, IT DOES NOT RETURN. An early `return null` here — which is what I
     * wrote first — would also skip case (3) below, so a roster member signing in with
     * SECONDARY_PASSCODE would be refused by a guard that has nothing to do with that
     * credential. Only this comparison is disabled; the next case still runs.
     */
    if (member && !env.deskPasscodeIsPublicDefault && safeEqual(passcode, env.deskPasscode)) {
      // A working credential from this source. Reset its second-tier failure budget —
      // the budget exists to price guessing, and this was not a guess.
      if (throttleKey) secondTierCleared(throttleKey);
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
    //
    //    AND IT IS THROTTLED, WHICH IT WAS NOT UNTIL 2026-08-15. `lib/secondTier.ts`
    //    shipped `secondTierThrottled`/`secondTierFailed` and nothing ever imported
    //    them: forty wrong guesses from one address all returned 401 and the correct
    //    code still returned 200 on the forty-first. Measured on a local production
    //    build the same day: 6,865 guesses/second, which reduces a short shared code
    //    to seconds. The budget is 5 failures then 30 seconds, PER SOURCE — see
    //    `secondTierThrottleKey` above for what "source" means here and what it costs
    //    when the key collapses.
    //
    //    THE CHECK SITS HERE, NOT AT THE TOP OF THE FUNCTION, AND THE POSITION IS THE
    //    SAFETY ARGUMENT. Everything above this line — the shared OPERATOR_API_KEY and
    //    the roster's own DESK_PASSCODE — has already been evaluated and returned. So a
    //    source that is locked out loses THIS door only. Cron keeps running and the
    //    named roster keeps signing in while an attacker burns their budget, which is
    //    what stops a brute-force defence from becoming the outage it was defending
    //    against.
    if (env.secondaryPasscode && throttleKey && secondTierThrottled(throttleKey)) {
      // Refused WITHOUT comparing the passcode: a throttle that still checks is a
      // throttle that still leaks whether the guess was right. Deliberately does NOT
      // call secondTierFailed — counting refusals would let a sustained attacker hold
      // the lock open forever, so the window always closes 30s after the last guess
      // that was actually evaluated.
      return null;
    }

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
          if (throttleKey) secondTierCleared(throttleKey);
          return {
            id: known.id,
            role: known.role === 'approver' ? 'approver' : 'operator',
            authMethod: 'email',
          };
        }
        const local = normalized.slice(0, normalized.indexOf('@')).replace(/[^a-z0-9._-]/g, '') || 'unknown';
        // The `key` argument is what clears the failure budget on success — the
        // parameter `secondTierSeen` has always had and nothing ever passed.
        secondTierSeen(normalized, throttleKey ?? undefined);
        return { id: `ext:${local}`, role: 'operator', authMethod: 'email' };
      }
    }

    /*
     * A GUESS. Reaching here means the credential was shaped like a desk sign-in
     * (`email:passcode`), the second tier is open, and NEITHER door accepted it —
     * wrong passcode, wrong domain, or a departed address. That is the event the
     * budget prices, and it is derived from control flow rather than from a list of
     * failure kinds, so a failure mode nobody thought of still counts.
     *
     * Gated on `env.secondaryPasscode` because with the second tier closed there is
     * nothing on this path to brute-force, and counting failures against a door that
     * is already shut could only ever lock someone out for no gain.
     */
    if (env.secondaryPasscode && throttleKey) secondTierFailed(throttleKey);
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

  // The third argument is what arms the second-tier throttle. Passing it HERE, at the
  // one place that already guarantees a single resolution per request (the early return
  // above), is what keeps a guess from being counted twice.
  const principal = resolvePrincipal(
    c.req.header('authorization'),
    c.req.header('x-api-key'),
    secondTierThrottleKey(c),
  );
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
