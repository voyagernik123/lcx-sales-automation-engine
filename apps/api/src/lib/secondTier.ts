/**
 * SECOND-TIER SIGN-IN — the observability that makes a shared secret survivable.
 *
 * `SECONDARY_PASSCODE` lets any @lcx.com address into the desk without a roster
 * edit and a deploy. Nik asked for this on 2026-08-01, was shown the tradeoff, and
 * reaffirmed it. This module is the guardrail that came with the decision.
 *
 * IT DOES NOT MAKE THE CREDENTIAL SAFE. A short shared passcode is guessable and
 * unattributable, and no amount of logging changes that: the audit row can only
 * ever name the credential, not the human. What this buys is the three things you
 * actually need when a shared secret is in play:
 *
 *   1. YOU KNOW IT IS BEING USED. A silent second door is the dangerous kind. Every
 *      distinct address that arrives on this path is recorded, so `GET /v1/me`-style
 *      surfaces and an operator can see who has been coming in.
 *   2. YOU KNOW WHEN TO ROTATE. A passcode leaks by spreading, and spreading looks
 *      like an address you did not expect. `unexpected()` is the signal to rotate.
 *   3. BRUTE FORCE COSTS SOMETHING. A four-digit secret is ~10^4 guesses. The
 *      throttle below turns that from seconds into something a monitor can notice,
 *      per source, without locking out a colleague who fat-fingers it twice.
 *
 * In-memory on purpose. This is a single API process on Render; a table would add a
 * write to the auth path — the hottest path in the system — and the value here is
 * operational awareness, not a legal record. The real audit spine already records
 * WHAT was done and under which principal id (`ext:<local-part>`, visibly distinct
 * from a roster id). Restarting the process forgets who signed in, which is an
 * accepted limit, not an oversight.
 */

/** Addresses seen on the second-tier path, and how often. */
const seen = new Map<string, { first: number; last: number; count: number }>();

/** Per-key failure counters for the throttle. Cleared on success. */
const failures = new Map<string, { n: number; until: number }>();

/**
 * How many wrong secondary passcodes before a key is refused, and for how long.
 *
 * Five, not one: a colleague mistyping a shared code twice must not be locked out,
 * and an aggressive lockout on a SHARED secret is a denial-of-service against the
 * whole team — anyone can trip it for everyone if the key were global. It is keyed
 * per source rather than globally for exactly that reason.
 *
 * Thirty seconds, not an hour: enough that 10^4 guesses becomes ~17 hours of
 * sustained, obvious traffic rather than a few seconds, while a real person who
 * finally remembers the code is not punished for a minute.
 *
 * ── WHO CALLS THIS, AND WHY THAT SENTENCE IS HERE ────────────────────────────
 * From the day it was written until 2026-08-15, NOTHING did. `secondTierThrottled`
 * and `secondTierFailed` were exported, documented, and never imported by a single
 * caller — not even by a test. Twenty wrong guesses from one address all returned
 * 401 and the twenty-first, with the right code, returned 200. The control was
 * designed, written, and never connected.
 *
 * It is now enforced in `middleware/auth.ts resolvePrincipal`, immediately before
 * the SECONDARY_PASSCODE comparison, keyed by `secondTierThrottleKey()` in that
 * same file — read the comment there for why the source identifier is what it is
 * and what it costs when it collapses. If you are reading this because you are
 * moving that logic, the invariant to preserve is that the ONLY door this closes
 * is the second tier: the shared operator key and the roster's DESK_PASSCODE must
 * keep working while it is shut, or an attacker's failures become the desk's outage.
 */
export const SECOND_TIER_MAX_FAILURES = 5;
export const SECOND_TIER_LOCK_MS = 30_000;

/** True when this key is currently throttled and must be refused without checking. */
export function secondTierThrottled(key: string, now = Date.now()): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (now >= f.until) {
    failures.delete(key);
    return false;
  }
  return f.n >= SECOND_TIER_MAX_FAILURES;
}

/** Record a failed second-tier attempt. */
export function secondTierFailed(key: string, now = Date.now()): void {
  const f = failures.get(key) ?? { n: 0, until: 0 };
  f.n += 1;
  f.until = now + SECOND_TIER_LOCK_MS;
  failures.set(key, f);
}

/**
 * A credential on this key authenticated. Clears the throttle WITHOUT recording a
 * second-tier session.
 *
 * Separate from `secondTierSeen` because the two success paths are different events.
 * A roster member who signs in with DESK_PASSCODE — or with SECONDARY_PASSCODE, which
 * resolves to their real identity — has proved they hold a working credential, so the
 * failure budget for their source must reset; but they did NOT come in as an `ext:`
 * principal, and recording them in `seen` would inflate the one number this module
 * exists to make watchable ("who is using the second door"). Reset the counter, record
 * nothing.
 */
export function secondTierCleared(key: string): void {
  failures.delete(key);
}

/** A successful second-tier sign-in. Clears the throttle for that key. */
export function secondTierSeen(email: string, key?: string, now = Date.now()): void {
  if (key) failures.delete(key);
  const hit = seen.get(email);
  if (hit) {
    hit.last = now;
    hit.count += 1;
  } else {
    seen.set(email, { first: now, last: now, count: 1 });
  }
}

export interface SecondTierUse {
  email: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

/** Who has used the second tier, most recent first. For an operator surface. */
export function secondTierUsage(): SecondTierUse[] {
  return [...seen.entries()]
    .map(([email, v]) => ({
      email,
      firstSeen: new Date(v.first).toISOString(),
      lastSeen: new Date(v.last).toISOString(),
      count: v.count,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

/**
 * Addresses that are NOT on the roster — i.e. people the second tier let in who
 * could not have signed in otherwise. This is the number to watch: it is the
 * population that grows when a passcode spreads.
 */
export function secondTierUnexpected(rosterEmails: readonly string[]): SecondTierUse[] {
  const roster = new Set(rosterEmails.map((e) => e.toLowerCase()));
  return secondTierUsage().filter((u) => !roster.has(u.email));
}

/** Test-only. */
export function _resetSecondTier(): void {
  seen.clear();
  failures.clear();
}
