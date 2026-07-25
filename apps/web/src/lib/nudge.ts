import { fastPathFor } from './fastPath';
import { storage } from './persistence';

/**
 * The nudge engine (TERMINAL Phase 6).
 *
 * The plan calls this "the research-backed core… what actually converts clickers into
 * operators": when you accomplish something the slow way, the terminal shows the fast
 * way AT THAT MOMENT, IN PLACE — and stops once you have adopted it.
 *
 * All three of those clauses are load-bearing, and the whole design is about the
 * third. A feature that suggests keyboard shortcuts is trivial to write and almost
 * always ends up switched off, because the failure mode is not "the suggestion was
 * wrong" — it is that being told the same thing eleven times is an insult, and the
 * eleventh time costs you the operator's willingness to read anything the app says
 * again. So this module is mostly rules about staying quiet:
 *
 *   1. ONLY WHAT THEY HAVE NEVER DONE. One successful use of the fast path proves
 *      they know it exists. After that, doing it with the mouse is a choice, and
 *      correcting a choice is nagging.
 *   2. ADOPTION IS TWO USES, NOT ONE. One could be an accident or a misfire; two is a
 *      habit forming. At two we go permanently silent for that capability.
 *   3. THREE IGNORED NUDGES MEANS NO. If they have seen it three times and still use
 *      the mouse, they have answered. Continuing is the app arguing with them.
 *   4. AT MOST ONE NUDGE IN VIEW, AND A COOLDOWN. Two suggestions at once is a
 *      tutorial, which is the thing Phase 6 is explicitly designed not to be.
 *   5. NEVER DURING THE ACTION. A nudge appears after the work succeeded, never as a
 *      modal in the way — the operator's task always wins.
 *
 * Counters are per operator (the storage layer scopes by signed-in email) because
 * adoption is a property of a person, not a machine, and this app runs on shared Macs.
 */

const KEY = 'teach:nudge';

/**
 * Two uses of the fast path is a habit; one could be a misfire.
 *
 * Exported for `lib/coach.ts`, which has to agree with this engine about what
 * adoption means. Two modules with two different thresholds would tell one operator
 * two different stories about the same key, and that is how both stop being believed.
 */
export const ADOPTED_AT = 2;
/** Three shown-and-ignored is an answer. */
const GIVE_UP_AFTER = 3;
/**
 * Quiet period after any nudge, across all capabilities. Long enough that a nudge is
 * an event rather than a stream — an operator doing five things in a row should get
 * at most one suggestion, not five.
 */
export const COOLDOWN_MS = 10 * 60 * 1000;

interface Record_ {
  /** Times the capability was reached the slow way. */
  slow: number;
  /** Times it was reached the fast way. */
  fast: number;
  /** Nudges shown for it. */
  shown: number;
  /**
   * When the fast and slow paths were last taken, epoch ms — 0 or absent for "never,
   * or before this was recorded".
   *
   * Added for the coach (T1 #21), and added HERE rather than at the call sites because
   * the two call sites that produce this data — `components/layout/Sidebar.tsx` and
   * `hooks/useGoGrammar.ts` — are owned by other streams in this run. `recordUse`
   * already knows the capability, the route and the moment; the timestamp is the one
   * thing it was throwing away.
   *
   * ABSENT IS NOT "LONG AGO". Every ledger written before this phase has no
   * timestamps, and treating a missing stamp as epoch 0 would make every capability
   * an operator had already mastered read as forgotten the moment they upgraded. The
   * coach must therefore treat 0 as unknown; see `coach.ts`.
   */
  lastFastAt?: number;
  lastSlowAt?: number;
}

type Ledger = Record<string, Record_ | undefined>;

interface State {
  ledger: Ledger;
  /** Epoch ms of the last nudge shown, for the global cooldown. */
  lastShownAt: number;
}

const EMPTY: State = { ledger: {}, lastShownAt: 0 };

function read(): State {
  const s = storage.get<State>(KEY, EMPTY);
  // Defensive: a hand-edited or older-shaped value must degrade to "teach me", not
  // throw inside a click handler.
  return s && typeof s === 'object' && s.ledger ? s : EMPTY;
}

function write(next: State): void {
  storage.set(KEY, next);
}

function rec(ledger: Ledger, capability: string): Record_ {
  return ledger[capability] ?? { slow: 0, fast: 0, shown: 0 };
}

export type Route = 'pointer' | 'keyboard';

/**
 * Record that a capability was used, and how.
 *
 * `keyboard` covers the command line and the chords alike: the distinction that
 * matters to an operator is hand-on-mouse versus hands-on-keys, not which key.
 */
export function recordUse(capability: string, via: Route, now: number = Date.now()): void {
  const state = read();
  const current = rec(state.ledger, capability);
  write({
    ...state,
    ledger: {
      ...state.ledger,
      [capability]: {
        ...current,
        slow: via === 'pointer' ? current.slow + 1 : current.slow,
        fast: via === 'keyboard' ? current.fast + 1 : current.fast,
        lastSlowAt: via === 'pointer' ? now : current.lastSlowAt,
        lastFastAt: via === 'keyboard' ? now : current.lastFastAt,
      },
    },
  });
}

export interface Nudge {
  capability: string;
  keys: string[];
  what: string;
}

/**
 * Should we teach this capability right now?
 *
 * Called immediately after a successful pointer-driven use. Returns null far more
 * often than not, which is the intended behaviour rather than a sign it is broken.
 *
 * `now` is injectable so the cooldown is testable without waiting ten minutes or
 * mocking the clock globally.
 */
export function nudgeFor(capability: string, now: number = Date.now()): Nudge | null {
  const state = read();
  const r = rec(state.ledger, capability);

  // Rule 1 & 2: they know it, or they have adopted it.
  if (r.fast >= 1) return null;
  // Rule 3: they have been told and have answered.
  if (r.shown >= GIVE_UP_AFTER) return null;
  // Rule 4: cooldown, across every capability.
  if (now - state.lastShownAt < COOLDOWN_MS) return null;
  // Not on the very first use. Doing something once with the mouse is how anyone
  // finds a feature; interrupting that is the app correcting someone for exploring.
  if (r.slow < 2) return null;

  const fast = fastPathFor(capability);
  if (!fast) return null;

  return { capability, keys: fast.keys, what: fast.what };
}

/** Mark a nudge as having been shown. Separate from `nudgeFor` so a caller that decides not to render one does not burn a slot. */
export function markShown(capability: string, now: number = Date.now()): void {
  const state = read();
  const current = rec(state.ledger, capability);
  write({
    lastShownAt: now,
    ledger: { ...state.ledger, [capability]: { ...current, shown: current.shown + 1 } },
  });
}

/**
 * The operator dismissed a nudge explicitly.
 *
 * Treated as a full stop for that capability, not as one of three. Clicking the ×
 * is a clearer answer than ignoring it, and honouring it is the difference between a
 * suggestion and a nag.
 */
export function dismissNudge(capability: string, now: number = Date.now()): void {
  const state = read();
  const current = rec(state.ledger, capability);
  write({
    lastShownAt: now,
    ledger: { ...state.ledger, [capability]: { ...current, shown: GIVE_UP_AFTER } },
  });
}

/** Has the operator adopted this? For the P7 audit and the coach's ordering. */
export function isAdopted(capability: string): boolean {
  return rec(read().ledger, capability).fast >= ADOPTED_AT;
}

/**
 * What the operator has and has not picked up.
 *
 * Exported for the spaced-repetition coach and for the operator's own audit: being
 * able to see "you use ⌘K constantly and have never used `g`" is more motivating than
 * any nudge, and it is the honest version of a progress bar.
 */
export function adoption(): Array<{
  capability: string;
  slow: number;
  fast: number;
  adopted: boolean;
  /** Epoch ms, or 0 for never / not recorded. See `Record_`: 0 means unknown, not long ago. */
  lastFastAt: number;
  lastSlowAt: number;
}> {
  const { ledger } = read();
  return Object.entries(ledger)
    .filter((entry): entry is [string, Record_] => !!entry[1])
    .map(([capability, r]) => ({
      capability,
      slow: r.slow,
      fast: r.fast,
      adopted: r.fast >= ADOPTED_AT,
      lastFastAt: r.lastFastAt ?? 0,
      lastSlowAt: r.lastSlowAt ?? 0,
    }))
    // Most-used-the-slow-way first: that is where a coach's attention belongs.
    .sort((a, b) => b.slow - a.slow);
}

/** Test-only. */
export function _resetNudges(): void {
  storage.remove(KEY);
}
