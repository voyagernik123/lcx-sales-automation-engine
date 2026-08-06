# Security findings — 2026-08-06

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

**Fixed in code — AND THE FIRST FIX WAS IN THE WRONG PLACE.** I first routed `deskPasscode`
through `required()`, which throws at boot when the variable is unset. That was right about the
danger and wrong about the remedy: an API that will not start takes down every compartment,
including every request that authenticates perfectly well by JWT or `OPERATOR_API_KEY`. It traded
a quiet hole for a loud outage.

It now fails closed **at the door**. `env.deskPasscodeIsPublicDefault` is true only in production
with `DESK_PASSCODE` unset, and `middleware/auth.ts` refuses THAT ONE PATH while everything else
keeps serving. It falls THROUGH rather than returning, because an early `return null` — which is
what I wrote first — would also skip case (3) and refuse a colleague signing in with
`SECONDARY_PASSCODE`, a credential this guard has nothing to do with.

Proven against the real modules under `NODE_ENV=production` with `DESK_PASSCODE` deleted: the
module boots, the flag is true, `nik@lcx.com:test#1234` → `null`, `SECONDARY_PASSCODE` still
admits, `OPERATOR_API_KEY` still admits, and setting `DESK_PASSCODE` re-opens the path. Six tests
pin all of it, including the fall-through.

### ►► YOURS — AND IT NO LONGER BLOCKS A DEPLOY ◄◄

This is **shipped** (`e009970`). The earlier version of this section said "do not deploy until the
variable is set"; that was true of the boot-throw design and is not true now. Nothing crashes
either way.

**Check whether `DESK_PASSCODE` is set in the Render environment.**

- **If it is NOT set:** production was running on the public literal, and as of this deploy that
  path is refused instead. Set a fresh value — do not reuse `test#1234` — and email sign-in comes
  back. Until you do, the roster can still get in via `SECONDARY_PASSCODE`.
- **If it IS set:** you were never exposed, and nothing about your sign-in changes.

I cannot read or set Render environment variables, and I should not handle the value.

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

## ROUND 2 — the angles that ran after the front door

Four more angles completed. Every finding below was **re-verified by me against the code**, not
taken from the reporting agent; two of them needed that, because their refute skeptics were killed
by a spend limit and they reached me with no independent check.

### F6 — HIGH (fixed) — the WBR had two doors with different locks

**Where:** `apps/api/src/routes/aiOperator.ts` `/wbr-narrative`, with
`packages/shared/src/workspaces.ts:131` and `:246`.

A principal holding **exactly `intel: operate`** read COMMAND and DISTRIBUTION content through
`POST /v1/ai/wbr-narrative`. Nothing in the handler is careless in isolation; the defect is
structural, and all four facts were verified directly:

1. `/v1/ai` appears in exactly ONE workspace's `apiPrefixes` (INTEL), so `app.ts` mounts exactly
   one compartment gate on that path.
2. `requireOperator` on the route is **authentication, not authorisation** — and `grep` finds zero
   `requireWorkspace` and zero `requirePurpose` in either AI route file.
3. `getLatestWbr` composes its report from `command_tasks`, `command_launch_targets`,
   `dist_campaigns` and `dist_listings`.
4. The **same report** at `/v1/wbr` is gated as GOVERNANCE (`sensitivity: 'elevated'`).

INTEL is the cheapest compartment in the system — `standard`, `legacy: true`, handed out by the
request-access flow, granted to a zero-row roster member by `legacyEntitlements`, and holdable by
a second-tier `ext:` principal. DISTRIBUTION is `legacy: false`: default-deny, reachable only
through an explicit audited grant. This path read it with none, and skipped the purpose prompt
both elevated compartments require, so it left no `purpose:access` trail either. The handler
returns `deterministic: report.narrative` unconditionally, so it never needed an LLM key.

**Fixed:** an explicit `requireWorkspace('governance', 'view')` on that registration. `view`
because composing a narrative reads and writes nothing — the requirement is to HOLD the
compartment, not to act in it. The regression test asserts the route table and the workspace
constitution rather than one live request, because that is the level the defect lived at.

### F7 — MEDIUM (fixed) — the honesty ceiling refused a number that has a denominator

**This one was mine**, shipped an hour earlier in `53eb728`. Mounting the ceiling globally applied
MARKETING's blocklist to every compartment, and `GET /v1/intel/conversation` collided: every 200
from that route had `data.sentimentScore` replaced by a refusal asserting the value was "inferred,
proxied or invented". `conversation.ts:76` computes it as `Math.round(((pos - neg) / total) * 100)`
over cue phrases in thread text the desk owns, with `total = pos + neg`. **The blocklist exists
because the X metrics have no denominator. This one has one.**

I fixed it wrongly first — scoping the middleware to marketing — and the existing suite caught it:
that would have stopped checking seven compartments to fix one field, and it broke two things the
tests rightly pin (distribution's ordinal `reach` must be exempted AND COUNTED, not never walked;
`/v1/tasks/summary` must still refuse `followerCount`). The correct fix is the mechanism the file
already had: a **shape-tested exemption**, where the shape is the whole `ConversationInsights`
census rather than the number, since an integer in [-100,100] is not distinctive.

### F8 — MEDIUM (fixed) — an allowlist checked with `in` is not an allowlist

`'constructor' in METRIC_SQL` is **true** (`hasOwnProperty` is false). `intel/monitors.ts:44`
validated `condition.metric` with `in`, so a monitor with `metric: 'constructor'` passed, and
`buildQuery` interpolated the coerced Object constructor into the WHERE clause:
`function Object() { [native code] } > $1`. Postgres rejects that — so it is **not injection**. The
damage is that the failure was caught and `continue`d BEFORE the `last_run_at` update, leaving a
governed standing watch that reads as `enabled` and never fires, indefinitely.

Fixing it **moved** the invisibility rather than closing it: the monitor now fails validation and
was skipped just as silently one branch earlier. Both skip paths now report into
`MonitorTickStats.failed`. Same `in` pattern also fixed in `graph/links.ts` and `ai/schedule.ts`.

### F9 — MEDIUM (OPEN, structural) — the audit chain is re-writable by the app's own DB role

**Where:** `0070_audit_seal.sql:336-348` + `access/seal.ts`. Confirmed on the CI mirror:
`audit_log` and `audit_seal_state` are both owned by role `lcx`, which is the role the API connects
as — and **ownership alone** is enough for `ALTER TABLE audit_log DISABLE TRIGGER ALL`. An attacker
with that credential can rewrite history and re-chain it using the database's own published
digest functions, because the chain is keyless and rooted at a published genesis constant. The
probe drove the real `verifyAuditSeal` and it reported the forged log as **intact, whole chain
covered** — only the head digest differed, and nothing records the expected head.

**Not exploitable today**: 0070 is not applied to production, and `verifyAuditSeal` has no
production caller. **The fix is structural and yours to schedule**: own the audit tables with a
role the application never connects as, and anchor the head digest outside the database
(a notarised checkpoint) so a re-chain becomes detectable. Optionally HMAC the digest with a key
the connection role cannot read.

### Confirmed NOT a problem

**No SQL injection.** The injection angle set out to break the house rule that every value is a
bound parameter and no value is concatenated, and **confirmed it instead** — with evidence rather
than by repeating the claim. Identifier interpolation is allowlist-derived throughout.

**No `dangerouslySetInnerHTML` and no SVG injection.** Zero occurrences in any component (the only
two hits are the test enforcing its absence and a comment describing it); zero `xlink:href`, zero
`createElementNS`, no assembled SVG strings. `external_location` really is uninterpreted — it is
rendered through a component, never an `<a href>`.

**Citation ids are a genuine allowlist** in all three AI operators, so a fabricated id never
reaches `citations[]`, and `AI_PROPOSABLE` is enforced twice.

## What is still NOT done, and should not be read as passed

- **A3, the compartment boundary, never completed** — its exploit agent died on the spend limit.
  This is the highest-severity angle for a compartmented platform and it owes a full run.
- **A5's refute phase never ran.** 21 of its 35 agents errored. Its prompt-injection and
  desktop-CSP halves reported clean, but *unverified* — treat as unfinished, not as passed.
- **DoS/complexity was never run at all.**
- **L16's readout has had no adversary pass.** I verified its wiring myself; the code inside it is
  unreviewed.
- The desktop shell still has `csp: null`, and the desk credential still lives in `localStorage`.
  No script-execution path was found, so this is a hardening gap rather than a finding — but the
  two together mean any future XSS is immediately credential theft.

## Not yet attacked

Three angles were mid-flight when work paused and have produced no report: the compartment
boundary, the audit seal (0070), and secrets/supply-chain. Still unrun: SQL injection, client-side
XSS, AI/prompt-injection trust, and DoS/complexity.

I did independently confirm one thing on the secrets angle: **no secret ships in the web bundle.**
Six credential shapes and a JWT scan over `apps/web/dist/assets/*.js` all returned zero, only
`.env.example` files are tracked, and `VITE_API_KEY` is dev-only by a deliberate
`import.meta.env.DEV` guard that Vite dead-code-strips from production builds
(`apps/web/src/lib/apiClient.ts:58`) — verified in both the source and the built artifact.
