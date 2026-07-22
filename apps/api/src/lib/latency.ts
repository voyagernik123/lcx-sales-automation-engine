/**
 * In-memory request-latency recorder (Phase 4.3). A fixed-size ring buffer of
 * recent request durations, used to compute the API p95 SLO without a table or
 * external APM. Deliberately process-local and best-effort: it resets on deploy
 * (which is fine — the SLO reads "recent" latency, not historical), and adds
 * nothing to the request's own hot path beyond a push into a preallocated array.
 */
const CAPACITY = 1000;
const buf = new Float64Array(CAPACITY);
let count = 0; // total ever recorded (for the write index)
let filled = 0; // how many slots are populated (≤ CAPACITY)

/** Record one request's duration in milliseconds. */
export function recordLatency(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  buf[count % CAPACITY] = ms;
  count++;
  if (filled < CAPACITY) filled++;
}

/** Percentile (0–100) over the recent window, or null when there's no data. */
export function latencyPercentile(p: number): number | null {
  if (filled === 0) return null;
  const arr = Array.from(buf.subarray(0, filled)).sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
  return Math.round(arr[idx]);
}

export interface LatencySnapshot {
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export function latencySnapshot(): LatencySnapshot {
  return { samples: filled, p50: latencyPercentile(50), p95: latencyPercentile(95), p99: latencyPercentile(99) };
}

/** Test-only: clear the buffer. */
export function _resetLatency(): void {
  count = 0; filled = 0; buf.fill(0);
}
