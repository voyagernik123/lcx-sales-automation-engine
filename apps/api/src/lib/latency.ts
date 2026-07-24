/**
 * In-memory percentile rings (Phase 4.3; generalised in TERMINAL Phase 2).
 *
 * A fixed-size ring buffer of recent durations, used to compute p95 SLOs without
 * a table or an external APM. Deliberately process-local and best-effort: it
 * resets on deploy (fine — these SLOs read "recent", not historical) and adds
 * nothing to the hot path beyond a push into a preallocated array.
 *
 * TERMINAL Phase 2 needed two more of these for client-reported UI latency, so
 * the buffer became a factory rather than a second copy of the percentile maths.
 * The original module-level API is preserved verbatim on top of the default ring.
 */

const CAPACITY = 1000;

export interface LatencySnapshot {
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface Ring {
  /** Record one duration in milliseconds. Non-finite/negative values are ignored. */
  record(ms: number): void;
  /** Percentile (0–100) over the recent window, or null when there's no data. */
  percentile(p: number): number | null;
  snapshot(): LatencySnapshot;
  /** Test-only: clear the buffer. */
  reset(): void;
}

export function createRing(capacity: number = CAPACITY): Ring {
  const buf = new Float64Array(capacity);
  let count = 0; // total ever recorded (drives the write index)
  let filled = 0; // populated slots (≤ capacity)

  function percentile(p: number): number | null {
    if (filled === 0) return null;
    const arr = Array.from(buf.subarray(0, filled)).sort((a, b) => a - b);
    const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
    return Math.round(arr[idx]);
  }

  return {
    record(ms: number): void {
      if (!Number.isFinite(ms) || ms < 0) return;
      buf[count % capacity] = ms;
      count++;
      if (filled < capacity) filled++;
    },
    percentile,
    snapshot(): LatencySnapshot {
      return { samples: filled, p50: percentile(50), p95: percentile(95), p99: percentile(99) };
    },
    reset(): void {
      count = 0;
      filled = 0;
      buf.fill(0);
    },
  };
}

/* ── API request latency (the original ring, unchanged behaviour) ─────────── */

const apiRing = createRing();

/** Record one request's duration in milliseconds. */
export function recordLatency(ms: number): void {
  apiRing.record(ms);
}

/** Percentile (0–100) over the recent window, or null when there's no data. */
export function latencyPercentile(p: number): number | null {
  return apiRing.percentile(p);
}

export function latencySnapshot(): LatencySnapshot {
  return apiRing.snapshot();
}

/** Test-only: clear the buffer. */
export function _resetLatency(): void {
  apiRing.reset();
}

/* ── Client-reported UI latency (TERMINAL Phase 2) ────────────────────────── */

/**
 * Interaction latency and frame time as measured IN THE CLIENT and flushed to
 * POST /v1/perf. Separate rings because they are different quantities with
 * different budgets (100ms vs 16ms) — and neither is the API request p95.
 *
 * Honesty note carried from the original: this is one API process's view of
 * whichever clients happened to flush to it, and it resets on deploy. The SLO
 * rows surface the sample count so the number is never read as more than it is.
 */
export const uiInteractionRing = createRing();
/**
 * Intent → last authoritative region resolved. Published BESIDE the paint ring,
 * never instead of it: if only paint were reported, moving a read to network-only
 * (which governance safety requires for gate inputs) would delete a slow sample
 * from the paint distribution and the headline p95 would improve as the app got
 * slower. This ring is the one that cannot be gamed that way.
 */
export const uiSettleRing = createRing();
export const uiFrameRing = createRing();

/** Test-only. */
export function _resetUiRings(): void {
  uiInteractionRing.reset();
  uiSettleRing.reset();
  uiFrameRing.reset();
}
