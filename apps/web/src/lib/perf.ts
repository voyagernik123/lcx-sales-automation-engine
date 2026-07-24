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
 * `settle` — intent → the last authoritative region resolved. What "correct" means.
 *
 * Measuring only `paint` would make the instrument actively dishonest: every read
 * moved to network-only (which is exactly what governance safety requires for
 * gate inputs, entitlements and audit surfaces) REMOVES a slow sample from the
 * paint distribution, so p95 would improve as the app got slower. `settle` is the
 * number that cannot be gamed that way. Deleting it is a breaking change to the
 * Phase 2 gate.
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
 * Intent → last authoritative region resolved. The "correct" number, and the one
 * that cannot be improved by moving reads off the cache. Always read alongside
 * interactionStats().
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
      const ms = now() - t0;
      if (implausible(ms)) return ms; // measured, but not recorded — see above
      recordInteraction({ kind, surface, phase: 'paint', ms, cached: opts.cached ?? false });
      return ms;
    },
    /**
     * Every authoritative region has resolved — revalidation done, network-only
     * reads returned. This is the number that stays honest when a read is moved
     * off the cache for governance reasons.
     */
    settle(opts: { cached?: boolean } = {}): number {
      if (settleDone) return 0;
      settleDone = true;
      const ms = now() - t0;
      if (implausible(ms)) return ms;
      recordInteraction({ kind, surface, phase: 'settle', ms, cached: opts.cached ?? false });
      return ms;
    },
  };
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
