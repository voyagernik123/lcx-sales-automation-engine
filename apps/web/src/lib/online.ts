/**
 * Honest connectivity state (TERMINAL Phase 2).
 *
 * Phase 2 lets reads be served from local state, but GOVERNED WRITES STAY
 * ONLINE — there is no offline write queue, by design. Every gate reads its
 * inputs at write time, and three of them fail OPEN when that read throws
 * (apps/api/src/actions/registry.ts:205, registry.ts:632,
 * apps/api/src/routes/reviews.ts:212-213). A write queued on a laptop and
 * replayed later would be judged against truth that has since changed, and in a
 * degraded state a fail-open gate degrades into an unconditional pass. So
 * offline is read-only, and this module exists to say so honestly.
 *
 * `navigator.onLine` alone is not enough to do that. The flag reports LINK
 * state: it is true on a captive portal, true when DNS is broken, and true when
 * our API specifically is unreachable. Only `false` is worth trusting, and even
 * then only until a request actually completes. So the state machine combines
 * the flag with real evidence — the outcome of requests we actually made.
 *
 * Dependency-free and React-free on purpose: the bundle budget has ~22KB of
 * headroom (828/850KB), and `classify` stays a pure function so the interesting
 * logic is testable with no DOM (following perf.ts / useWindowedRows.ts).
 */

export type Connectivity = 'online' | 'degraded' | 'offline';

/** The outcome of one request, as connectivity evidence. */
export type RequestOutcome = 'ok' | 'network-error';

/**
 * Everything the decision depends on. Passed explicitly so the rules can be
 * tested as a table rather than by mocking `navigator`.
 */
export interface Evidence {
  /** `navigator.onLine` — link state only. */
  link: boolean;
  /** Consecutive transport failures with no intervening success. */
  consecutiveFailures: number;
  /** `Date.now()` of the last request that reached the API, or null. */
  lastSuccessAt: number | null;
}

/**
 * One failure is noise — a request killed by a route change, a single dropped
 * packet, an API restart. Two in a row with nothing succeeding in between is a
 * pattern worth telling the operator about.
 */
export const DEGRADED_AFTER_FAILURES = 2;

/**
 * How long a completed request keeps overriding `link: false`. On a network
 * whose flag lies (VPN transitions, some virtual interfaces) a round-trip that
 * actually landed is stronger evidence than the flag — but only recently, or a
 * genuine disconnect would be masked for the rest of the session.
 */
export const LINK_OVERRIDE_MS = 10_000;

/** How often we re-check while unhealthy. Prod rate-limits to 240 req/min; this
 *  costs 2/min, and nothing at all while healthy. */
export const RECHECK_MS = 30_000;

/**
 * The whole decision, pure. `now` is a parameter rather than a `Date.now()`
 * call so the freshness window is testable.
 */
export function classify(e: Evidence, now: number): Connectivity {
  if (!e.link) {
    const provenReachable = e.lastSuccessAt !== null && now - e.lastSuccessAt < LINK_OVERRIDE_MS;
    if (!provenReachable) return 'offline';
  }
  // Link up (or claimed up) but our requests are not landing: captive portal,
  // dead DNS, or the API is down. Read-only either way.
  if (e.consecutiveFailures >= DEGRADED_AFTER_FAILURES) return 'degraded';
  return 'online';
}

/**
 * True for the errors that mean "the request never reached the API". An
 * ApiError with a 500 is NOT one of these — the API answered, so the network is
 * fine and the operator should not be told they are offline. Aborts are the
 * caller cancelling, not a failure.
 *
 * Duplicated rather than reused from errors.ts on purpose: errors.ts imports
 * ApiError from apiClient, and apiClient is the intended caller of
 * recordNetworkResult() below — importing it here would close a cycle.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (err instanceof Error && err.name === 'AbortError') return false;
  if (err instanceof TypeError) return true; // fetch's transport failure
  return err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message);
}

/* ── live state ───────────────────────────────────────────────────────────── */

let consecutiveFailures = 0;
let lastSuccessAt: number | null = null;

type Listener = (state: Connectivity) => void;
const listeners = new Set<Listener>();

const link = (): boolean =>
  typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine;

/** Current connectivity, computed fresh — never a stale cached flag. */
export function connectivity(): Connectivity {
  return classify({ link: link(), consecutiveFailures, lastSuccessAt }, Date.now());
}

/**
 * The last published state. Seeded from reality rather than assumed 'online': an
 * app that boots on a dead network would otherwise have this disagree with the
 * truth, and the eventual 'online' event would be swallowed as "no change",
 * leaving the banner up after the connection returned.
 */
let last: Connectivity = connectivity();

/**
 * True only when governed writes are safe to attempt. `degraded` counts as not
 * online: the link being up is exactly the case where a write would be accepted
 * by the browser and then silently judged against inputs we could not read.
 */
export function isOnline(): boolean {
  return connectivity() === 'online';
}

/** Subscribe to connectivity changes. Returns an unsubscribe. */
export function subscribeOnline(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notify only on a real transition, so subscribers don't re-render on noise. */
function publish(): void {
  const next = connectivity();
  if (next === last) return;
  last = next;
  for (const l of listeners) {
    try {
      l(next);
    } catch {
      // A subscriber that throws must not stop the others from being told, and
      // must never propagate into the request path that called us.
    }
  }
}

/**
 * Record the outcome of a request. This is the "real evidence" half of the
 * signal: call it from the API client for every request, whatever the result.
 * A 4xx/5xx is an 'ok' here — the API answered.
 *
 * Never throws: it sits on the request path.
 */
export function recordNetworkResult(outcome: RequestOutcome): void {
  if (outcome === 'ok') {
    consecutiveFailures = 0;
    lastSuccessAt = Date.now();
  } else {
    consecutiveFailures += 1;
  }
  publish();
}

/** Convenience for a catch block: records only if `err` is a transport failure. */
export function recordRequestError(err: unknown): void {
  if (isNetworkError(err)) recordNetworkResult('network-error');
}

/** Test-only. */
export function _resetOnline(): void {
  consecutiveFailures = 0;
  lastSuccessAt = null;
  last = connectivity();
}

/* ── the watch ────────────────────────────────────────────────────────────── */

let watchers = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let probeFn: (() => Promise<unknown>) | null = null;
let probeInFlight = false;

/**
 * Ask the API whether it is there. Never throws — it runs from a timer and from
 * an event handler.
 */
async function probeOnce(): Promise<void> {
  if (watchers === 0 || probeInFlight || !probeFn) return;
  // Nobody is reading a banner in a hidden tab, and a suspended tab's timers
  // fire in a burst on restore. Skip rather than spend the request.
  if (typeof document !== 'undefined' && document.hidden) return;
  probeInFlight = true;
  try {
    await probeFn();
    recordNetworkResult('ok');
  } catch (err) {
    // A probe rejected for a non-transport reason (401, 500) still proves the
    // API answered — that is reachable, not offline.
    recordNetworkResult(isNetworkError(err) ? 'network-error' : 'ok');
  } finally {
    probeInFlight = false;
  }
}

function onOffline(): void {
  publish();
}

function onOnlineEvent(): void {
  publish(); // the flag alone may already have cleared 'offline'
  void probeOnce(); // ...but confirm it: the flag lies on a captive portal
}

/**
 * Wire the browser events and, while unhealthy, a slow recovery probe. Returns a
 * teardown.
 *
 * The probe deliberately does NOT run while healthy — that would be polling for
 * an answer we already have. It runs on exactly two occasions: the moment the
 * link claims to be back (one request, because the flag going true proves
 * nothing) and every RECHECK_MS while we believe we are degraded or offline.
 * That is 2 req/min at worst against a 240 req/min budget.
 *
 * Ref-counted, so several consumers of useConnectivity share one interval
 * instead of each opening their own probe loop.
 *
 * `probe` is injected rather than imported so this module keeps no dependency on
 * the API client (see the cycle note on isNetworkError).
 */
export function startConnectivityWatch(probe?: () => Promise<unknown>): () => void {
  if (probe) probeFn = probe;
  watchers += 1;

  if (watchers === 1) {
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnlineEvent);
    }
    interval = setInterval(() => {
      if (connectivity() === 'online') return;
      void probeOnce();
    }, RECHECK_MS);
  }

  let released = false;
  return () => {
    if (released) return; // a double teardown must not drop someone else's watch
    released = true;
    watchers -= 1;
    if (watchers > 0) return;
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnlineEvent);
    }
  };
}
