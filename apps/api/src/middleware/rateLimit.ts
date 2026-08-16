import { createMiddleware } from 'hono/factory';
import { findMemberByEmail } from '@lcx/shared';
import { env } from '../lib/env.js';
import { safeEqual } from '../lib/safeEqual.js';
import type { AuthVariables } from './auth.js';

interface BucketEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  /**
   * Hard ceiling on how many DISTINCT buckets are tracked at once. See
   * `MAX_TRACKED_BUCKETS`. Exposed on the config so a test can exercise the overflow
   * path without issuing four thousand requests.
   */
  maxBuckets: number;
}

const isProd = process.env.NODE_ENV === 'production';

/**
 * How many distinct buckets may exist before new keys are folded into one shared
 * overflow bucket.
 *
 * WHY THERE IS A CEILING AT ALL. Every bucket key costs a `Map` entry that `cleanup()`
 * will not reclaim until the window expires, so anything able to mint keys can grow the
 * map inside a window — a memory-exhaustion path on a single-threaded process.
 *
 * IT IS NO LONGER THE ONLY DEFENCE, AND THAT MATTERS. Until 2026-08-16 the key derived
 * from a caller-supplied credential, so this ceiling was the single thing standing between
 * a rotating caller and an unbounded map — and, measured, it was also the single thing
 * bounding the guessing rate: 4096 minted buckets plus one shared overflow bucket of 240
 * is 4,336 evaluated guesses per window, which is exactly the 88.55 guesses/second a
 * 195-second flood produced. Since `bucketKey` below, the caller-facing families have
 * FIXED cardinality and cannot be grown at all; only `auth:` and `key:` can grow, and both
 * of those require the server to have accepted a real secret first. The ceiling is now the
 * belt to that pair of braces.
 *
 * WHICH KEYS MAY BE FOLDED INTO THE OVERFLOW BUCKET, AND WHY THE LIST IS SHORT. Folding is
 * a REFUSAL mechanism dressed as a memory mechanism: a key that lands in the overflow
 * bucket is throttled by whoever else is in it. Applying it to a family that cannot grow
 * the map buys no memory and costs a real outage — measured on 2026-08-16, a
 * credential-rotating flood put the no-credential family (webhooks, unsubscribe, SSE) into
 * the overflow bucket and returned it `{401: 124, 429: 60}` while it sent nothing but
 * credential-free requests. `unauth:` is ONE key and `claim:` is at most (roster + 2); they
 * are therefore never folded. See `FOLDABLE`.
 *
 * WHY 4096. The legitimate population of distinct credentials that actually authenticate is
 * the `@lcx/shared` roster plus the shared `OPERATOR_API_KEY` plus whatever second-tier
 * addresses are in use — order tens, not thousands — so real traffic cannot approach this.
 */
const MAX_TRACKED_BUCKETS = 4096;

/** Every foldable key that arrives once the ceiling is reached shares this one bucket. */
const OVERFLOW_KEY = 'overflow:shared';

/** A dashboard page fires several requests; 60/min starved one busy tab.
    Prod stays conservative per credential; dev is effectively unthrottled. */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: isProd ? 240 : 1200,
  maxBuckets: MAX_TRACKED_BUCKETS,
};

const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 300,
  maxBuckets: MAX_TRACKED_BUCKETS,
};

const buckets = new Map<string, BucketEntry>();

/**
 * Credentials the SERVER has authenticated, by hash, mapped to when that proof expires.
 * Insertion order is kept as recency order by `markProven`, so eviction is O(1).
 */
const provenCredentials = new Map<string, number>();

/**
 * How long a credential stays PROVEN after the last request in which the server itself
 * authenticated it.
 *
 * NOT A SECURITY PARAMETER — it cannot admit anything. It only decides whether a
 * legitimate caller's next request is counted in a bucket of its own or in the shared
 * bucket for the identity it claims. So it is chosen from the two ways it can be wrong:
 *   · too SHORT and someone who steps away for a coffee comes back cold, and is then
 *     collateral if their own claimed identity is under attack at that moment.
 *   · too LONG and a rotated or retired credential keeps a slot it should not.
 * Thirty minutes sits between those, and erring early costs one request.
 */
const PROVEN_TTL_MS = 30 * 60_000;

/**
 * Ceiling on the proven-credential table. Only the SERVER can insert here (see
 * `markProven`), so this is not the attacker-facing bound — the real bound is the number
 * of credentials that actually authenticate, which is order tens. It exists so that if a
 * future route ever sets `operator` without validating anything, the failure is a bounded
 * table and an eviction, not an unbounded one.
 */
const MAX_PROVEN_CREDENTIALS = 1024;

/** Non-cryptographic hash so bucket keys never hold API-key material. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * THE CREDENTIAL THIS REQUEST PRESENTS, normalized EXACTLY the way
 * `middleware/auth.ts extractApiKey` normalizes it — `X-API-Key` wins over
 * `Authorization`, the `Bearer`/`ApiKey` scheme is stripped, whitespace is trimmed, and
 * an `Authorization` header in any other scheme is not a credential at all.
 *
 * IT MUST MATCH auth.ts OR THE HEADER WIDENS THE BUCKET AGAIN. Hashing the raw header
 * string (what this file used to do) gave ONE credential at least four buckets —
 * `X-API-Key: K`, `Authorization: Bearer K`, `Authorization: ApiKey K`,
 * `Authorization: Bearer  K` — each a different string, each a different bucket, all the
 * same principal. Normalizing first means the bucket is the CREDENTIAL, not the spelling.
 *
 * THE DRIFT IS FAIL-SAFE SINCE THE PROVEN-CREDENTIAL TABLE EXISTS, which is worth saying
 * so nobody relaxes about it. If this extraction ever diverges from auth.ts, the hash
 * recorded on the way out will not match the hash looked up on the way in, so a legitimate
 * credential simply never becomes proven and stays in its claimed-identity bucket. That is
 * an availability regression, loud and self-inflicted; it cannot hand anyone a bucket they
 * did not earn. Keep them in step anyway.
 *
 * Duplicated rather than imported because `extractApiKey` is module-private in auth.ts,
 * and this middleware runs on every request including ones auth never sees. If auth's
 * extraction changes, change this with it.
 */
function presentedCredential(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const apiKeyHeader = c.req.header('x-api-key');
  if (apiKeyHeader && apiKeyHeader.trim()) return apiKeyHeader.trim();
  const authHeader = c.req.header('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(/\s+/, 2);
  if (!token) return null;
  const s = scheme.toLowerCase();
  if (s !== 'bearer' && s !== 'apikey') return null;
  return token.trim() || null;
}

/**
 * WHO THIS CREDENTIAL CLAIMS TO BE — collapsed to a set whose size is fixed by the CODE,
 * not by the caller. This is the whole fix, so it is worth stating precisely why.
 *
 * A credential has two parts and they are not equally dangerous. `middleware/auth.ts`
 * splits a desk sign-in at the FIRST colon into `email:passcode`: the passcode is the
 * SECRET, unbounded and freely chosen by whoever is typing; the email is the IDENTITY, and
 * the set of identities that can mean anything is `@lcx/shared TEAM` — three rows of
 * committed source. Guessing a passcode necessarily varies the secret half and necessarily
 * holds the identity half still, because a guess against nobody is not a guess.
 *
 * So the bucket is keyed on the identity half and never on the secret half:
 *   · a roster email        → `member:<id>`   (bounded by TEAM, three today)
 *   · any other `a:b` shape → `other`         (one bucket: second-tier and junk claims)
 *   · no colon at all       → `opaque`        (one bucket: `OPERATOR_API_KEY`-shaped)
 *
 * WHAT THAT BUYS, AND IT IS BOTH HALVES OF THE PROBLEM AT ONCE:
 *   · An attacker rotating the passcode against `nik@lcx.com` stays in ONE bucket however
 *     many strings they try — rotation stops being an escape, which is finding #2.
 *   · A rested colleague signing in as `monty@lcx.com` with the CORRECT passcode is in a
 *     DIFFERENT bucket and is untouched by that attack — which is what the source-keyed
 *     attempt of 2026-08-15 could not do, because it put attacker and victim in the same
 *     bucket and then had to refuse both.
 *
 * WHAT IT DOES NOT BUY, STATED BECAUSE IT IS THE RESIDUAL AND IT IS REAL. An attacker who
 * targets ONE identity can spend that identity's failure budget, and a caller who is BOTH
 * cold (see `isProven`) AND the target is then refused until the window rolls. That is the
 * classic account lockout, and unlike the source-keyed attempt it costs the attacker their
 * whole budget against that one identity and leaves every other operator, the shared API
 * key and all credential-free traffic working. See the measured numbers in
 * `docs/3d/AUDIT_PENTEST.md`.
 *
 * NO NEW DISCLOSURE. `member:<id>` vs `other` is observable from the outside as a
 * difference in when throttling starts, i.e. it tells an attacker whether an address is on
 * the roster. The roster is committed at `packages/shared/src/operators.ts` and is already
 * public, so this reveals nothing that a checkout does not.
 */
function claimedIdentity(cred: string): string {
  const sep = cred.indexOf(':');
  if (sep <= 0) return 'opaque';
  const member = findMemberByEmail(cred.slice(0, sep));
  return member ? `member:${member.id}` : 'other';
}

/*
 * ── A CREDENTIAL THAT IS ALREADY CORRECT MUST NEVER WAIT TO BE RECOGNISED ───────────
 *
 * This is the piece two previous attempts at this control both missed, and each shipped an
 * outage because of it. Their shape was: unproven credentials share a bucket, and a credential
 * becomes "proven" only after the server authenticates it once. That warm-up is the defect —
 * a caller arriving COLD, with a perfectly correct secret, is refused on the strength of
 * somebody else's failures, and cannot become warm because the refusal happens before the
 * promotion can fire. Self-sealing.
 *
 * Measured, on the version this replaces: a COLD `OPERATOR_API_KEY` — the shared credential CRON
 * uses — returned {429: 80} with first_200 null, while the same key WARM returned {200: 80}. Every
 * colon-free string an attacker invents shares the bucket the API key lands in, so an attacker who
 * knows nothing at all can hold cron out indefinitely. The attempt before that locked out a roster
 * operator holding the CORRECT passcode for 40 consecutive seconds.
 *
 * THE RESOLUTION IS TO ASK THE QUESTION THE BUCKET WAS AVOIDING. Comparing the presented credential
 * against the secrets this process already holds is a constant-time string compare — no database,
 * no KDF — so it is affordable before deciding to refuse. A caller who matches gets their own
 * bucket on request one, cold or warm.
 *
 * AND AN ATTACKER CANNOT USE THIS TO MINT BUCKETS, which is the property that makes it safe:
 * minting one requires PRESENTING A SECRET THAT IS ALREADY CORRECT. If they can do that, the
 * throttle is not what is protecting anything. Every wrong guess still falls through to the shared
 * claim bucket and is still counted.
 *
 * `deskPasscodeIsPublicDefault` is honoured here too, so a deployment running on the committed dev
 * fallback does not hand out private buckets to anyone holding a value from a checkout.
 */
function matchesKnownSecret(cred: string): boolean {
  if (safeEqual(cred, env.operatorApiKey)) return true;
  const sep = cred.indexOf(':');
  if (sep <= 0) return false;
  const secret = cred.slice(sep + 1);
  if (secret === '') return false;
  if (!env.deskPasscodeIsPublicDefault && safeEqual(secret, env.deskPasscode)) return true;
  return env.secondaryPasscode !== '' && safeEqual(secret, env.secondaryPasscode);
}

/** Has the SERVER authenticated this credential recently? Never a claim the caller makes. */
function isProven(hash: string, now: number): boolean {
  const expiry = provenCredentials.get(hash);
  if (expiry === undefined) return false;
  if (now >= expiry) {
    provenCredentials.delete(hash);
    return false;
  }
  return true;
}

/**
 * Record that a credential AUTHENTICATED. The only caller is the tail of the middleware,
 * gated on `c.get('operator')` being set after the downstream chain has run — which in
 * this codebase happens in exactly two places (`middleware/auth.ts requireOperator` and
 * `middleware/workspace.ts requireWorkspace`), both immediately after `resolvePrincipal`
 * returned a principal. The promotion is therefore server-derived; a caller cannot ask
 * for it.
 */
function markProven(hash: string, now: number): void {
  // delete-then-set so Map iteration order IS recency order, making the eviction below
  // O(1) and least-recently-proven-first.
  provenCredentials.delete(hash);
  if (provenCredentials.size >= MAX_PROVEN_CREDENTIALS) {
    for (const [k, expiry] of provenCredentials) {
      if (now >= expiry) provenCredentials.delete(k);
    }
    while (provenCredentials.size >= MAX_PROVEN_CREDENTIALS) {
      const oldest = provenCredentials.keys().next();
      if (oldest.done) break;
      provenCredentials.delete(oldest.value);
    }
  }
  provenCredentials.set(hash, now + PROVEN_TTL_MS);
}

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function sweepExpired(now: number): void {
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  sweepExpired(now);
  for (const [hash, expiry] of provenCredentials) {
    if (now >= expiry) provenCredentials.delete(hash);
  }
}

/** Test-only. Clears every bucket, every proof, and the cleanup clock. */
export function _resetRateLimit(): void {
  buckets.clear();
  provenCredentials.clear();
  lastCleanup = Date.now();
}

/** Test-only. How many distinct buckets are currently live. */
export function _rateLimitBucketCount(): number {
  return buckets.size;
}

/** Test-only. How many credentials the server has authenticated and not yet forgotten. */
export function _provenCredentialCount(): number {
  return provenCredentials.size;
}

/**
 * Which bucket family a request belongs to. The family decides two things that used to be
 * tangled together: whether the key may be folded into the shared overflow bucket, and
 * whether the bucket counts REQUESTS or only FAILURES.
 */
type Family = 'auth' | 'proven' | 'claim' | 'unauth';

/**
 * Families whose key set a caller can grow, and which therefore need the memory ceiling.
 * Growing either one requires the server to have accepted a real secret first, so this is
 * a backstop against a future mistake rather than against a caller. `claim` and `unauth`
 * are fixed-cardinality by construction and are NEVER folded — folding them is how a
 * credential flood came to 429 the webhook path (see MAX_TRACKED_BUCKETS).
 */
const FOLDABLE: ReadonlySet<Family> = new Set<Family>(['auth', 'proven']);

interface Keyed {
  key: string;
  family: Family;
  /** The credential's hash, or null when the request carried no credential. */
  credHash: string | null;
}

/**
 * ── THE BUCKET KEY. THREE ROUNDS OF THIS DEFECT, AND WHAT FINALLY SATISFIES BOTH SIDES ──
 *
 * ROUND ONE. The key was `key:<djb2(credential)>:<first X-Forwarded-For hop>`. That header
 * is client-written, so ONE holder of ONE valid credential minted a fresh bucket per
 * request by rotating it and the 240/min cap never tripped. Fixed by removing every header
 * from the key, and no header has been in it since — `X-Forwarded-For` appears nowhere in
 * this file.
 *
 * ROUND TWO. The replacement was `key:<djb2(credential)>` for anything presenting a
 * credential. But this middleware is mounted at `app.ts:136`, BEFORE any route auth, so at
 * that point "the credential" is an arbitrary string the caller chose. Measured on a local
 * production build, `GET /v1/me` with `nik@lcx.com:<x>`:
 *
 *     300 requests, ONE wrong passcode     -> {401: 240, 429: 60}   the cap fires
 *     300 requests, a NEW wrong passcode   -> {401: 300, 429:  0}   the cap never fires
 *     195 s / 20 connections               -> 17,339 evaluated guesses = 88.55/second
 *
 * Guessing a passcode inherently rotates the credential string, so the guessing attack and
 * the bucket-minting attack are the same keystrokes.
 *
 * ROUND THREE, THE ONE THAT WAS REVERTED. Unproven credentials were pooled into one bucket
 * PER SOURCE (`pre:<tcp peer>`). It did cut guessing to 4.00/s — and it made any laptop a
 * platform-wide outage: `TRUSTED_PROXY_HOPS` is unset in `render.yaml`, so every caller on
 * earth collapses to Render's edge address and that pool is ONE GLOBAL BUCKET. A roster
 * approver with the CORRECT passcode, arriving cold, was refused 180/180 times across
 * three window rollovers. Attacker and victim were in the same bucket, so refusing the
 * attacker meant refusing the victim.
 *
 * WHY NO AMOUNT OF TUNING SAVED ROUND THREE, since the next person will want to try. With
 * attacker and victim sharing a bucket, the victim is admitted only in the sliver of each
 * window before the attacker refills it, so
 *
 *     victim admissions over T  ≈  (permitted guess rate) × T ÷ (attacker's raw request rate)
 *
 * Measured constants here: raw request rate 8,640/s at 20 connections. To give a cold
 * victim even five chances in 180 s you must permit ≥240 guesses/second — WORSE than the
 * 88.55/s the defect already allows. Round three's own numbers fit the same line: 4.00/s
 * over 180 s predicts 0.08 admissions, and it measured zero. A shared pre-auth bucket
 * cannot be tuned out of this; it has to stop being shared.
 *
 * ── WHAT THE KEY IS NOW ───────────────────────────────────────────────────────────────
 *   · `auth:<operator id>`   — a principal the chain already resolved.
 *   · `key:<hash>`           — a credential THE SERVER AUTHENTICATED, within PROVEN_TTL_MS.
 *   · `claim:<identity>`     — a credential presented but not proven, bucketed by the
 *                              IDENTITY it claims (see `claimedIdentity`), never by the
 *                              secret it guesses. At most (roster + 2) keys.
 *   · `unauth:shared`        — no credential at all. One key, its own family.
 *
 * The set of keys a caller can reach without holding a secret is now FIXED BY THE CODE, so
 * there is nothing to mint; and the attacker's bucket is the identity they are attacking,
 * so refusing them does not refuse anybody else.
 *
 * ── WHICH BRANCHES ARE LIVE, MEASURED RATHER THAN READ ────────────────────────────────
 * `auth:` is DEAD at the global mount. `rateLimit()` is mounted above every route-level
 * `requireOperator`, so `c.get('operator')` is undefined on the way IN for every request
 * the platform serves; the branch is kept because it is correct whenever a limiter IS
 * mounted after auth (`authRateLimit`, which nothing mounts today). The CONTINUATION runs
 * after auth, which is what makes the promotion at the bottom of this file possible. Both
 * facts are asserted in `__tests__/rateLimitKey.test.ts` rather than assumed.
 */
function bucketKey(
  c: {
    req: { header: (n: string) => string | undefined };
    get: (k: 'operator') => AuthVariables['operator'] | undefined;
  },
  now: number,
): Keyed {
  const operator = c.get('operator');
  const cred = presentedCredential(c);
  const credHash = cred === null ? null : djb2(cred);
  if (operator) return { key: `auth:${operator.id}`, family: 'auth', credHash };
  if (cred === null || credHash === null) return { key: 'unauth:shared', family: 'unauth', credHash: null };
  if (isProven(credHash, now)) return { key: `key:${credHash}`, family: 'proven', credHash };
  /* Correct on arrival beats warm. See `matchesKnownSecret` — this is what stops a cold cron
     job or a cold operator being collateral of somebody else's failed guesses. */
  if (matchesKnownSecret(cred)) return { key: `key:${credHash}`, family: 'proven', credHash };
  return { key: `claim:${claimedIdentity(cred)}`, family: 'claim', credHash };
}

/** Test-only. The key this request would be counted under, without counting it. */
export function _rateLimitKeyFor(c: Parameters<typeof bucketKey>[0]): string {
  return bucketKey(c, Date.now()).key;
}

/** Get the live bucket for a key, resetting it if its window has rolled. */
function liveBucket(key: string, windowMs: number, now: number): BucketEntry {
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  return entry;
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    // Never rate-limit liveness probes — a 429 here would make the platform
    // health check flap and mark the service down.
    const path = c.req.path;
    if (path === '/health' || path === '/') return next();

    const now = Date.now();
    cleanup(now);

    const { key: firstChoice, family, credHash } = bucketKey(c, now);
    let key = firstChoice;

    // A foldable key with no live bucket may only claim a new slot while there is room.
    // Sweep first — expired entries are free to reclaim — then fold into the shared
    // overflow bucket rather than growing the map without bound.
    if (FOLDABLE.has(family) && !buckets.has(key) && buckets.size >= cfg.maxBuckets) {
      sweepExpired(now);
      if (buckets.size >= cfg.maxBuckets) key = OVERFLOW_KEY;
    }

    const entry = liveBucket(key, cfg.windowMs, now);

    /*
     * ── WHAT THE BUCKET COUNTS, AND WHY THE `claim:` FAMILY COUNTS SOMETHING ELSE ──────
     *
     * Every other family counts REQUESTS, because every other family is a caller the
     * server has already identified — a resolved principal, a proven credential, or the
     * credential-free traffic that has no identity to be confused with anyone else's.
     * Counting their requests is an ordinary quota.
     *
     * `claim:` counts FAILURES ONLY, and the difference is the whole reason a cold
     * legitimate caller survives. A shared bucket that counts requests refuses whoever
     * arrives after it is full, and "whoever arrives" includes the person holding the
     * right passcode — that is precisely how the source-keyed attempt became an outage.
     * A bucket that counts only requests THAT FAILED TO AUTHENTICATE can be filled by
     * nobody except someone guessing: a legitimate sign-in, however many parallel requests
     * a cold browser fires, contributes exactly nothing to it and can never be the reason
     * it trips.
     *
     * THE REFUSAL IS `>=`, NOT `>`, AND IT IS DELIBERATELY BEFORE THE CHARGE. The budget
     * is spent by evaluated failures that have already happened; this request has not been
     * evaluated yet, so it is measured against what previous guesses did, never against
     * itself. A correct credential arriving at a bucket with budget left is admitted
     * without any comparison being needed here.
     *
     * REFUSED REQUESTS DO NOT CHARGE, so a sustained attack cannot hold the window open
     * past its own expiry — the same reasoning `lib/secondTier.ts` gives for not counting
     * refusals. The window closes `windowMs` after the guess that opened it.
     */
    const failuresOnly = family === 'claim';
    if (!failuresOnly) entry.count++;

    c.header('X-RateLimit-Limit', String(cfg.maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, cfg.maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (failuresOnly ? entry.count >= cfg.maxRequests : entry.count > cfg.maxRequests) {
      return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
    }

    /*
     * THE VERDICT, AND WHY IT IS DOWN HERE RATHER THAN UP THERE.
     *
     * This middleware runs BEFORE auth; its CONTINUATION runs after it. Hono hands the
     * same `Context` to every layer, so once `next()` resolves, `c.get('operator')` is the
     * SERVER's verdict on the credential this request carried. That is the one moment in
     * the request where "is this string an identity?" has a truthful answer, and it is the
     * only input to both branches below. The caller supplies the credential; the server
     * supplies the proof.
     *
     * `finally`, so a downstream throw neither stops credentials from being promoted nor
     * silently drops a failure from the budget — either would be invisible and would look
     * like a rate-limit bug weeks later. It rethrows exactly as before.
     *
     * The failure is charged through `liveBucket` rather than to the `entry` captured
     * above, because a slow request can outlive its own window and the charge belongs to
     * the window it lands in.
     */
    try {
      await next();
    } finally {
      if (credHash !== null) {
        if (c.get('operator')) markProven(credHash, now);
        else if (failuresOnly) liveBucket(key, cfg.windowMs, Date.now()).count++;
      }
    }
  });
}

export function authRateLimit() {
  return rateLimit(AUTH_LIMIT);
}
