# Security findings — 2026-08-06, front-door / authentication angle

Authorised white-box review of our own platform. No production system, LCX account or real
credential was touched: every finding below was established from source and from local
in-process probes.

**Every finding here was verified by me directly** — I re-read each cited line and re-ran the
call-site checks myself rather than accepting the reporting agent's word. Where I say
CONFIRMED, I mean I looked.

---

## The chain that matters

F1, F2 and F3 are one attack, not three issues:

1. The front-door passcode may silently be a **publicly committed literal** (F1).
2. Nothing effectively **rate-limits** guesses at it (F2).
3. The lockout written to stop guessing **never runs** (F3).

So the credential may be known, and if it is not, it can be guessed at network speed.

---

## F1 — CRITICAL (code now fixed; **one action is yours**) — the front door fails OPEN

**Where:** `apps/api/src/lib/env.ts:35` → consumed at `apps/api/src/middleware/auth.ts:77`

`deskPasscode` read `process.env.DESK_PASSCODE ?? 'test#1234'`. Every other real secret on the
next line up goes through `required()`, whose own comment says why:

> Fail CLOSED in production: a dev convenience fallback … must NEVER stand in for a real secret
> in prod

The front-door passcode was the single secret that skipped that helper. With a plain `??`, an
unset `DESK_PASSCODE` in production produced **no boot error and no log line** — it silently
became the literal on that line.

**Both halves of the credential are public.** The roster emails are committed at
`packages/shared/src/operators.ts:25-27`, two of them (`monty@lcx.com`, `nik@lcx.com`) with
`role: 'approver'`. The fallback string is committed in `env.ts` and in test fixtures.
`auth.ts:77` compares the supplied passcode and returns `role: 'approver'` on a match.

**Impact:** `nik@lcx.com:test#1234` becomes a session as a named **approver** — the highest desk
role, which clears deal sign-off and conflict-clearing — reaching every compartment that
principal's entitlements grant. That is an authentication bypass.

**Fixed in code:** `deskPasscode: required('DESK_PASSCODE', 'test#1234')`. Unset in production now
throws at boot. An API that refuses to start is a visible five-minute problem; an API that starts
with a publicly-known front-door passcode is an invisible one. 136 middleware/lib tests pass
(tests run outside `NODE_ENV=production`, so the dev fallback still applies there).

### ⚠ YOURS, AND IT BLOCKS THE NEXT DEPLOY

The fix is deliberately fail-closed, which means:

1. **Check whether `DESK_PASSCODE` is set in the Render environment.**
   - **If it is not set:** production is running with the public literal right now. Set it to a
     fresh value, then rotate — do not reuse `test#1234`.
   - **If it is set:** you were never exposed; the code was one missing env var away from it.
2. **Do not deploy the fix until that variable is set.** With `DESK_PASSCODE` unset, the new code
   crashes the API on boot. I have committed it but **not pushed it**, for exactly this reason.

I cannot check or set Render environment variables, and I should not handle the value.

---

## F2 — HIGH — the rate limiter cannot throttle a credential guess

**Where:** `apps/api/src/middleware/rateLimit.ts:81-85` — CONFIRMED by reading it.

```
const rawKey = c.req.header('x-api-key') ?? c.req.header('authorization');
const key = operator ? `auth:${operator.id}`
          : rawKey  ? `key:${djb2(rawKey)}:${ip ?? 'local'}`
                    : 'unauth:shared';
```

For an unauthenticated caller, the bucket key includes **a hash of the raw credential**. Since
the credential is `email:passcode`, every distinct guess hashes differently and therefore lands
in **its own fresh bucket** with a full budget. The limiter throttles repeat use of one
credential; it cannot throttle guessing.

**Impact:** both the desk passcode and the second-tier passcode can be guessed at server
throughput. This is the amplifier that turns any short secret into a practical online break. The
second-tier secret is a six-digit-class shared code — on the order of 10⁶ candidates, which is
minutes at any real request rate.

**Fix:** for credentialed-but-unverified traffic, key the pre-auth limiter on something the
attacker does not control — a single shared bucket, or the client IP alone. A per-credential key
by construction hands every guess its own budget.

---

## F3 — HIGH — the brute-force lockout is dead code

**Where:** `apps/api/src/lib/secondTier.ts` defines `SECOND_TIER_MAX_FAILURES`,
`secondTierThrottled` and `secondTierFailed`. CONFIRMED: **zero non-test call sites** for either
function. Only `secondTierSeen` is wired, at `auth.ts:138`, and that merely records usage.

The comment in `env.ts` describes `lib/secondTier.ts` as "the usage recording that makes a shared
secret operationally survivable." The recording runs. **The throttle does not.**

**Impact:** the one guardrail claimed to make a shared, guessable second-tier secret survivable
does not execute. With F2, that secret has no rate limiting at any layer. A successful guess
yields an `ext:<local>` operator session on every compartment the second tier holds.

**Fix:** in `resolvePrincipal`'s second-tier branch, call `secondTierThrottled(key)` before
comparing and refuse if throttled; call `secondTierFailed(key)` on a wrong passcode; keep the
existing `secondTierSeen(key)` on success so it clears.

---

## F5 — MEDIUM — two `safeEqual` implementations, and auth uses the weaker one

**Where:** `apps/api/src/middleware/auth.ts:30` hand-rolls a `charCodeAt` XOR loop, while
`apps/api/src/lib/safeEqual.ts:9` already wraps Node's `crypto.timingSafeEqual`. The front-door
comparison uses the hand-rolled one. Both return early on a length mismatch, so both leak length.

Not the weak link while F1–F3 stand, but there is no reason for the local copy to exist.
**Fix:** import `lib/safeEqual.ts` in `auth.ts` and delete the local function.

---

## F4 — LOW — the SSE stream token travels in the URL

**Where:** `apps/api/src/routes/notifications.ts:41` — `c.req.query('token')`. CONFIRMED.

A live credential in a query string appears in access logs, proxy logs and `Referer` headers.
Bounded: the token is subject-bound, read-only, already filtered to the subject's own
compartments, and short-TTL — so there is no cross-compartment escalation. Anyone reading a
captured URL inside the TTL can replay that one reader's own bell.

**Fix:** accept it from a header where the EventSource client allows, redact the `token`
parameter in the access-log pipeline, and set `Referrer-Policy: no-referrer` on the stream page.

---

## Not yet attacked

Three angles were mid-flight when work paused and have produced no report: the compartment
boundary, the audit seal (0070), and secrets/supply-chain. Still unrun: SQL injection, client-side
XSS, AI/prompt-injection trust, and DoS/complexity.

I did independently confirm one thing on the secrets angle: **no secret ships in the web bundle.**
Six credential shapes and a JWT scan over `apps/web/dist/assets/*.js` all returned zero, only
`.env.example` files are tracked, and `VITE_API_KEY` is dev-only by a deliberate
`import.meta.env.DEV` guard that Vite dead-code-strips from production builds
(`apps/web/src/lib/apiClient.ts:58`) — verified in both the source and the built artifact.
