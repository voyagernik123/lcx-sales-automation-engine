/**
 * The speed-floor instrument (TERMINAL Phase 2).
 *
 * We are not allowed to claim a latency number we did not measure, so this lands
 * before any caching work. It measures what an operator actually feels — the gap
 * between an intent (a keystroke, a click, a route change) and the screen showing
 * the result — not server request time, which the API already tracks separately.
 *
 * Measured baseline that motivates all of this: every request to production costs
 * ~165-195ms of fixed infrastructure latency before our code runs (a 204 preflight
 * that touches nothing costs the same as a real query; the origin is GCP us-west1
 * behind Cloudflare). A p95 under 100ms is therefore unreachable over the network
 * — only serving a surface from local state can meet the budget.
 *
 * Dependency-free on purpose: no web-vitals, no PerformanceObserver polyfill. The
 * bundle has a hard budget (400KB/chunk, 850KB initial) and the maths is small
 * enough to own. The ring and percentile are pure functions so they can be
 * unit-tested with no DOM, following useWindowedRows.ts.
 */

/** What kind of intent the operator expressed. */
export type InteractionKind = 'nav' | 'palette' | 'inspector' | 'filter' | 'keynav';

/**
 * TWO numbers, always published together. This is not optional.
 *
 * `paint`  — intent → the screen showing local state. What "instant" means.
 * `settle` — intent → the read layer going quiet. What "correct" costs.
 *
 * Measuring only `paint` would make the instrument actively dishonest: every read
 * moved to network-only (which is exactly what governance safety requires for
 * gate inputs, entitlements and audit surfaces) stops being on the paint path.
 * The surface then paints a skeleton fast and the operator's real wait becomes
 * invisible, so the headline p95 IMPROVES as the desk gets slower. `settle` is
 * the number that cannot be gamed that way. Deleting it is a breaking change to
 * the Phase 2 gate.
 *
 * ── what `settle` actually measures, stated exactly (T1 #23) ────────────────
 *
 * For eleven weeks this comment claimed "the last authoritative region resolved"
 * while the only wiring in the app registered `settle` as a SECOND `afterPaint`
 * callback back-to-back with `paint` — two callbacks, same frame, same number.
 * Settle was a copy of paint, which is precisely the single-metric instrument the
 * paragraph above calls dishonest, wearing two names. Exposure was zero only
 * because paint happened to be equally read-independent; the claim was false the
 * whole time.
 *
 * The definition now implemented, and the reason it is the right one: settle is
 * **intent → the moment the read layer last went quiet**, where quiet means zero
 * requests in flight (`readCache.inFlightCount()`), held quiet for
 * `SETTLE_QUIET_MS` so one read chaining into another is not mistaken for
 * quiescence. Held-quiet detection is a confirmation, not the measurement: the
 * sample records the instant quiet BEGAN, so the guard window is not added to the
 * number.
 *
 * This has the property the two-metric design exists for, and it is the only
 * candidate examined that does: move a read from cache to network-only and paint
 * gets FASTER (the surface renders its skeleton) while settle gets SLOWER by the
 * whole round trip. `settleWhenQuiet` below is mutation-proven against exactly
 * that scenario in __tests__/settle.test.ts. Rejected alternatives: "the loading
 * state clearing" (per-surface opt-in — a surface that never adopts it reports
 * nothing, and the metric silently covers less of the desk over time), and "the
 * last read for the surface resolving" (needs a surface→read attribution the read
 * layer does not have; it coalesces by canonical path across call sites).
 *
 * Known limits, so nobody has to rediscover them:
 * - Resolution is ±`SETTLE_TICK_MS`, because the probe is a count and not a
 *   timestamp — the moment quiet began is only observable on the next poll.
 * - A polling surface never goes quiet. Those are ABANDONED at
 *   `SETTLE_CEILING_MS` and record nothing, rather than recording the ceiling as
 *   though it were a measurement.
 * - Navigating away before quiet cancels the watcher, so settle has FEWER
 *   samples than paint. Read `settleStats().samples` before trusting the p95.
 */
export type Phase = 'paint' | 'settle';

export interface Sample {
  kind: InteractionKind;
  /** The route the operator was on — so a breach names the guilty surface. */
  surface: string;
  phase: Phase;
  ms: number;
  /** True when the data came from local state rather than the network. */
  cached: boolean;
}

/* ── pure ring + percentile (mirrors apps/api/src/lib/latency.ts) ──────────── */

const CAPACITY = 200;

export interface Percentiles {
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

/**
 * Exact percentile over a set of samples. Same nearest-rank definition the API
 * ring uses, so client and server numbers are comparable rather than subtly
 * different. Returns null on an empty set — never 0, which would read as "fast".
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const arr = [...values].sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
  return Math.round(arr[idx]);
}

export function percentiles(values: readonly number[]): Percentiles {
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

/* ── the live rings ───────────────────────────────────────────────────────── */

let samples: Sample[] = [];
let frames: number[] = [];
/** Samples not yet flushed to the API. Kept apart so a flush never loses data. */
let pending: Sample[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

/** Subscribe to sample changes (the HUD). Returns an unsubscribe. */
export function onPerfChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Record a completed interaction. */
export function recordInteraction(s: Sample): void {
  if (!Number.isFinite(s.ms) || s.ms < 0) return;
  samples.push(s);
  if (samples.length > CAPACITY) samples = samples.slice(-CAPACITY);
  pending.push(s);
  notify();
}

/** Record one frame duration in ms (from the frame sampler). */
export function recordFrame(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  frames.push(ms);
  if (frames.length > CAPACITY) frames = frames.slice(-CAPACITY);
}

/** Intent → local paint. The "instant" number. */
export function interactionStats(): Percentiles {
  return percentiles(samples.filter((s) => s.phase === 'paint').map((s) => s.ms));
}

/**
 * Intent → the read layer going quiet. The "correct" number, and the one that
 * cannot be improved by moving reads off the cache — a read moved to network-only
 * leaves the paint distribution and lands in this one. Always read alongside
 * interactionStats().
 *
 * `samples` here is legitimately LOWER than interactionStats().samples: a
 * navigation abandoned before the surface settled records a paint and no settle,
 * on purpose (see the `Phase` docs). Do not read the two counts as a discrepancy.
 */
export function settleStats(): Percentiles {
  return percentiles(samples.filter((s) => s.phase === 'settle').map((s) => s.ms));
}

export function frameStats(): Percentiles {
  return percentiles(frames);
}

/**
 * Per-surface p95, worst first — the gate is per-surface ("the ten most-used
 * surfaces"), not a global average that a fast page could hide a slow one behind.
 * Reports BOTH numbers per surface, for the reason in the Phase docs.
 */
export function bySurface(): Array<{
  surface: string;
  paintP95: number | null;
  settleP95: number | null;
  samples: number;
}> {
  const groups = new Map<string, { paint: number[]; settle: number[] }>();
  for (const s of samples) {
    let g = groups.get(s.surface);
    if (!g) {
      g = { paint: [], settle: [] };
      groups.set(s.surface, g);
    }
    (s.phase === 'paint' ? g.paint : g.settle).push(s.ms);
  }
  return [...groups.entries()]
    .map(([surface, g]) => ({
      surface,
      paintP95: percentile(g.paint, 95),
      settleP95: percentile(g.settle, 95),
      samples: g.paint.length + g.settle.length,
    }))
    .sort((a, b) => (b.settleP95 ?? b.paintP95 ?? 0) - (a.settleP95 ?? a.paintP95 ?? 0));
}

/**
 * Cache-hit rate over the paint samples — the mechanism the paint p95 depends on.
 * Published next to the p95 so a good number can always be traced to a cause
 * rather than taken on faith.
 */
export function cacheHitRate(): number | null {
  const paints = samples.filter((s) => s.phase === 'paint');
  if (paints.length === 0) return null;
  return Math.round((paints.filter((s) => s.cached).length / paints.length) * 100);
}

/** Take and clear the un-flushed samples. */
export function drainPending(): Sample[] {
  const out = pending;
  pending = [];
  return out;
}

/** Put samples back after a failed flush, so a network blip loses no data. */
export function restorePending(s: readonly Sample[]): void {
  pending = [...s, ...pending];
}

export function frameSamplesForFlush(): number[] {
  return [...frames];
}

/* ── read attribution ─────────────────────────────────────────────────────── */

/**
 * Every GET reports whether it was served locally. This is what lets a paint
 * sample be labelled `cached` honestly, and it is why the HUD can show a
 * cache-hit rate next to the p95 — a good latency number should always be
 * traceable to a cause rather than believed on its own.
 */
let readHits = 0;
let readMisses = 0;

export function noteRead(cached: boolean): void {
  if (cached) readHits += 1;
  else readMisses += 1;
}

export function readTally(): { hits: number; misses: number } {
  return { hits: readHits, misses: readMisses };
}

/** Test-only. */
export function _resetPerf(): void {
  samples = [];
  frames = [];
  pending = [];
  readHits = 0;
  readMisses = 0;
}

/* ── measuring an interaction ──────────────────────────────────────────────── */

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Begin timing an interaction. Call the returned function when the result is
 * ON SCREEN, not when the promise resolves — those differ by a React render and
 * a paint, and the operator only believes the second one.
 *
 * Honesty rule: measure to the paint that shows the RESULT. Stopping the clock
 * when a skeleton appears would report a flattering number for a surface that
 * still feels slow, which is the exact self-deception this instrument exists to
 * prevent.
 */
/**
 * A real interaction never takes this long. Anything above it is a tab that was
 * suspended, a machine that slept, or a debugger pause — time the operator did
 * not actually spend waiting, and recording it would poison the percentile.
 */
const MAX_PLAUSIBLE_MS = 10_000;

const hidden = (): boolean => typeof document !== 'undefined' && document.hidden === true;

export function beginInteraction(kind: InteractionKind, surface: string) {
  const t0 = now();
  // Captured at the start because of a specific trap: requestAnimationFrame does
  // NOT fire while a tab is hidden, so navigations in a background tab queue up
  // and every callback fires at once when the tab is restored — each measuring
  // from minutes ago. Without this guard the p95 fills with multi-second samples
  // no operator ever experienced.
  const startedHidden = hidden();
  let paintDone = false;
  let settleDone = false;
  /**
   * When the paint landed. Kept so `settle` can be FLOORED at it: settle is
   * reported from a timestamp that a watcher observed in the past, and a surface
   * whose reads all resolved before the paint would otherwise report a settle
   * EARLIER than its own paint — a negative wait, which is not a thing an
   * operator can experience. perf.test.ts pins settle ≥ paint; this is what makes
   * that structural instead of incidental.
   */
  let paintAt: number | null = null;

  /** True when this sample cannot be an honest measure of felt latency. */
  const implausible = (ms: number): boolean =>
    startedHidden || hidden() || ms > MAX_PLAUSIBLE_MS;

  return {
    /**
     * The screen now shows the operator something real — from cache or from the
     * network, whichever arrived. Call this on the paint that shows the RESULT,
     * never on a skeleton: stopping the clock at a skeleton reports a flattering
     * number for a surface that still feels slow, which is exactly the
     * self-deception this instrument exists to prevent.
     */
    paint(opts: { cached?: boolean } = {}): number {
      if (paintDone) return 0; // idempotent — a double-stop must not double-count
      paintDone = true;
      const t = now();
      paintAt = t;
      const ms = t - t0;
      if (implausible(ms)) return ms; // measured, but not recorded — see above
      recordInteraction({ kind, surface, phase: 'paint', ms, cached: opts.cached ?? false });
      return ms;
    },
    /**
     * The read layer went quiet — every request this interaction started has
     * returned. This is the number that stays honest when a read is moved off the
     * cache for governance reasons: that read leaves the paint path and lands
     * here.
     *
     * `at` is the instant quiet BEGAN, supplied by `settleWhenQuiet` because it is
     * necessarily in the past by the time the quiet window confirms it. Passing it
     * rather than reading the clock here is the difference between reporting the
     * operator's wait and reporting the operator's wait plus our own guard window.
     * Callers that genuinely know they are settling right now may omit it.
     *
     * Do NOT wire this to a bare `afterPaint`. That is what made settle a second
     * copy of paint for eleven weeks (see the `Phase` docs), and
     * __tests__/settle.test.ts fails if the shell goes back to it.
     */
    settle(opts: { cached?: boolean; at?: number } = {}): number {
      if (settleDone) return 0;
      settleDone = true;
      // Floored at the paint: a settle before the thing settled is not a measurement.
      const at = Math.max(opts.at ?? now(), paintAt ?? t0);
      const ms = at - t0;
      if (implausible(ms)) return ms;
      recordInteraction({ kind, surface, phase: 'settle', ms, cached: opts.cached ?? false });
      return ms;
    },
  };
}

/** The handle `beginInteraction` hands back. */
export type Interaction = ReturnType<typeof beginInteraction>;

/**
 * How long the read layer must stay at zero in flight before the surface counts
 * as settled. Guards the common shape where one read's response triggers the
 * next — a dependent read starting 30ms after the first resolves would otherwise
 * be measured as two separate settles, the first of them a lie.
 *
 * 120ms is the value the Phase 2 e2e harness (e2e/speedfloor.spec.ts:200) already
 * used for the same judgement, kept identical so the two cannot disagree about the
 * THRESHOLD for "settled". It does NOT inflate the sample here: the recorded
 * instant is when quiet began, not when it was confirmed.
 *
 * Narrowed by the adversarial pass, because the stronger claim was wrong and would
 * have cost somebody an afternoon: the harness and this instrument still report
 * DIFFERENT NUMBERS for the same navigation. speedfloor stops its clock at
 * `performance.now()` after confirming quiet and waiting two more frames, so its
 * settle runs ~120ms + a frame pair HIGHER than the HUD's for the same event.
 * Whoever un-fixmes that spec has to reconcile the two before comparing them, and
 * the shared constant does not do it for them.
 */
export const SETTLE_QUIET_MS = 120;

/**
 * Poll interval, and therefore the resolution of a settle sample. The probe is a
 * COUNT, not a timestamp, so "the moment the last read resolved" is only
 * observable on the next tick — every settle is up to this much late. Stated
 * rather than hidden: against a 600ms budget a ±16ms quantisation is acceptable,
 * against the 100ms paint budget it would not have been, which is one more reason
 * paint is not measured this way.
 */
export const SETTLE_TICK_MS = 16;

/**
 * Give up after this long and record NOTHING. A surface that polls never goes
 * quiet, and recording the ceiling would put a fabricated 10s sample into the p95
 * of a surface that may be perfectly fast. An absent sample is honest; an invented
 * one is not. Same threshold as `implausible()`, which would discard it anyway.
 */
export const SETTLE_CEILING_MS = MAX_PLAUSIBLE_MS;

/**
 * Record `settle` when the read layer goes quiet, rather than when the screen
 * paints (T1 #23).
 *
 * `readsInFlight` is injected rather than imported so this module stays
 * dependency-free (see the file header) and so the tests can drive the state
 * machine deterministically. In the app it is `readCache.inFlightCount`.
 *
 * Call this FROM the paint callback, not from the route effect. Called earlier,
 * the route's lazy chunk may not have loaded yet, so no child has issued a read,
 * so the probe reads zero and the watcher would settle on an empty screen — the
 * "stop the clock at a skeleton" self-deception this instrument exists to
 * prevent. (`settle`'s floor at the paint timestamp is a second line of defence
 * against the same mistake, not a substitute for calling this in the right place.)
 *
 * Returns a cancel function. Cancelling records nothing: if the operator navigated
 * away before the surface settled, we did not observe it settling and must not
 * claim a number for it.
 */
export function settleWhenQuiet(
  i: Interaction,
  readsInFlight: () => number,
  opts: {
    cached?: () => boolean;
    quietMs?: number;
    tickMs?: number;
    ceilingMs?: number;
  } = {},
): () => void {
  const quietMs = opts.quietMs ?? SETTLE_QUIET_MS;
  const tickMs = opts.tickMs ?? SETTLE_TICK_MS;
  const ceilingMs = opts.ceilingMs ?? SETTLE_CEILING_MS;

  const startedAt = now();
  let quietSince: number | null = null;
  /**
   * The pending poll, and the ONLY thing keeping this watcher alive — clearing it
   * is what cancellation means. An earlier draft also carried a `stopped` boolean
   * checked at the top of `tick`. It was removed on evidence: mutating away either
   * mechanism on its own left the behaviour correct, because `setTimeout` here is
   * the sole scheduler and `tick` is never reached by any other path, so neither
   * half could be made to fail. Two redundant guards where one is provable is one
   * guard and one comment.
   */
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const tick = (): void => {
    const t = now();

    if (readsInFlight() > 0) {
      // Busy again — any earlier quiet was a gap between chained reads, not the end.
      quietSince = null;
    } else if (quietSince === null) {
      quietSince = t;
    }

    if (quietSince !== null && t - quietSince >= quietMs) {
      i.settle({ cached: opts.cached?.() ?? false, at: quietSince });
      stop();
      return;
    }

    if (t - startedAt > ceilingMs) {
      stop(); // never quiet — record nothing, see SETTLE_CEILING_MS
      return;
    }

    timer = setTimeout(tick, tickMs);
  };

  tick();
  return stop;
}

/**
 * Wait for the browser to actually paint, then stop the clock. Two rAFs: the
 * first fires before the upcoming paint, the second after it — the standard way
 * to observe "the user can now see this" without a PerformanceObserver.
 */
export function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame !== 'function') {
    fn();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/* ── frame sampler ────────────────────────────────────────────────────────── */

let frameHandle: number | null = null;

/**
 * Sample frame-to-frame time continuously. Cheap (one rAF, one subtraction) and
 * the only way to see whether the juice layer in Phase 5 breaks the 16ms budget.
 * Long gaps (tab hidden, machine asleep) are discarded rather than recorded as
 * catastrophic frames — they would poison the percentile with non-UI stalls.
 */
export function startFrameSampler(): () => void {
  if (typeof requestAnimationFrame !== 'function') return () => {};
  let last = now();
  const tick = () => {
    const t = now();
    const dt = t - last;
    last = t;
    if (dt < 1000) recordFrame(dt); // ignore backgrounded/suspended gaps
    frameHandle = requestAnimationFrame(tick);
  };
  frameHandle = requestAnimationFrame(tick);
  return () => {
    if (frameHandle != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameHandle);
    }
    frameHandle = null;
  };
}

/** The approved budgets. Referenced by the HUD and the SLO rows alike. */
export const BUDGET_INTERACTION_MS = 100;
export const BUDGET_FRAME_MS = 16;
