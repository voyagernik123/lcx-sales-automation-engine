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

export const storage = {
  get<T>(key: string, d: T): T {
    try {
      const i = localStorage.getItem(mk(key));
      return i ? (JSON.parse(i) as T) : d;
    } catch {
      return d;
    }
  },
  set<T>(key: string, v: T): void {
    try {
      localStorage.setItem(mk(key), JSON.stringify(v));
    } catch {
      /* quota or disabled storage — in-memory only */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(mk(key));
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
