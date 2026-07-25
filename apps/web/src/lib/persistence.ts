/**
 * Local UI persistence, scoped to the signed-in operator.
 *
 * Why the scope exists: keys used to be `lcx-os:<key>:v1` with no operator in
 * them, and sign-out cleared only the credential. On a shared Mac — and every
 * member currently signs in with the SAME desk passcode — the next person
 * inherited the previous person's active workspace, filters, BD notes, deal
 * playbooks, scenario forks and local audit log. That is a real leak, not a
 * cosmetic one, so the operator is now part of every key.
 *
 * The scope is read straight from localStorage rather than from a store, on
 * purpose: `storage` is imported BY the stores, so importing a store here would
 * be a cycle, and store modules initialise (and call `get`) before any React
 * code runs. Reading the same key `apiClient` writes keeps it dependency-free
 * and correct at module-evaluation time.
 *
 * Note: this changes key names, so pre-existing local UI preferences are not
 * carried over. That is a deliberate, one-time cost — they are preferences, and
 * the alternative is leaving the leak in place.
 */

const VERSION = 'v1';

/** Must match EMAIL_KEY in lib/apiClient.ts — the signed-in operator's email. */
const OPERATOR_EMAIL_KEY = 'lcx_operator_email';

const PREFIX = 'lcx-os:';

/** Whose data is this? `anon` before sign-in (e.g. on the /select gate). */
function scope(): string {
  try {
    return (localStorage.getItem(OPERATOR_EMAIL_KEY) || 'anon').trim().toLowerCase() || 'anon';
  } catch {
    return 'anon';
  }
}

const mk = (k: string) => `${PREFIX}${scope()}:${k}:${VERSION}`;

/**
 * The scoped key for callers that talk to localStorage directly instead of going
 * through `storage` (the focus-session stats, screen log, last-seen stamps and
 * the zustand `persist` name). Use this rather than hand-writing an `lcx-os:`
 * key, or that data silently escapes the operator scope again.
 */
export function scopedKey(key: string): string {
  return mk(key);
}

/**
 * The in-memory tier, which the `set` catch below used to PROMISE and not provide.
 *
 * The old comment said "quota or disabled storage — in-memory only", and there was no
 * in-memory anything: a failed write was simply lost, and the next `get` returned the
 * default. The Phase 7 audit measured what that costs where it matters most — a
 * capability already at two persisted slow uses produced **50 nudges in 50 pointer
 * uses**, because `markShown` could not persist the cooldown or the shown-count. The
 * feature designed above all else not to nag became a nag, in exactly the conditions
 * (private browsing, full quota) where an operator is least able to explain why.
 *
 * A Map, not a second real store: it lives for the tab, which is the honest scope of a
 * fallback for "this browser will not persist". `get` reads it before the default so a
 * value written this session survives within the session, and `remove`/`clearAll` clear
 * it too — otherwise sign-out would leave the previous operator's state readable in
 * memory, which is the very thing the scoping above exists to prevent.
 */
const fallback = new Map<string, string>();

export const storage = {
  get<T>(key: string, d: T): T {
    const scoped = mk(key);
    // THE IN-MEMORY TIER WINS, and getting this backwards is why my first attempt at
    // this fix did not work: I read localStorage first, so a value written while writes
    // were failing was shadowed by the STALE persisted copy, and the 50-nudge nag
    // reproduced unchanged at 50.
    //
    // Precedence is safe because the fallback only ever holds values THIS module wrote,
    // and a successful write populates both — so where both exist they agree, and where
    // only the fallback exists it is strictly newer. The cost is that a write from
    // another tab would be shadowed for the life of this one; acceptable, because there
    // was no cross-tab sync here before either and the desk is a single window.
    const mem = fallback.get(scoped);
    if (mem !== undefined) {
      try {
        return JSON.parse(mem) as T;
      } catch {
        return d;
      }
    }
    try {
      const i = localStorage.getItem(scoped);
      if (i) return JSON.parse(i) as T;
    } catch {
      /* storage disabled entirely; the default is the honest answer */
    }
    return d;
  },
  set<T>(key: string, v: T): void {
    const scoped = mk(key);
    const json = JSON.stringify(v);
    try {
      localStorage.setItem(scoped, json);
      // Kept in step so a later read is served the same value whichever tier answers,
      // and so a quota failure PART WAY through a session does not silently revert to a
      // stale persisted value.
      fallback.set(scoped, json);
    } catch {
      // Quota, private browsing, or storage disabled by policy. The value survives the
      // tab, which is what the comment always claimed.
      fallback.set(scoped, json);
    }
  },
  remove(key: string): void {
    const scoped = mk(key);
    fallback.delete(scoped);
    try {
      localStorage.removeItem(scoped);
    } catch {
      /* ignore */
    }
  },
  /**
   * Drop every locally persisted key for EVERY operator. Called on sign-out so a
   * shared machine is left clean — scoping prevents silent inheritance, this
   * makes "sign out" mean what it says.
   */
  clearAll(): void {
    // The in-memory tier is part of "locally persisted" for this purpose: leaving it
    // behind would mean sign-out cleared the disk and not the tab, and the next operator
    // on a shared Mac is in the same tab.
    fallback.clear();
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) doomed.push(k);
      }
      for (const k of doomed) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
