import { describe, expect, it, beforeEach } from 'vitest';
import { recordLatency, latencyPercentile, latencySnapshot, _resetLatency } from '../lib/latency.js';
import { weekStartOf } from '../kpi/wbr.js';

/** Phase 4 pure helpers — the latency ring buffer and the WBR week math. */
describe('latency ring buffer (SLO p95)', () => {
  beforeEach(() => _resetLatency());

  it('reports no percentile until samples arrive', () => {
    expect(latencyPercentile(95)).toBeNull();
    expect(latencySnapshot().samples).toBe(0);
  });

  it('computes percentiles over the recorded window', () => {
    for (let i = 1; i <= 100; i++) recordLatency(i); // 1..100 ms
    const snap = latencySnapshot();
    expect(snap.samples).toBe(100);
    expect(snap.p50).toBe(50);
    expect(snap.p95).toBe(95);
    expect(snap.p99).toBe(99);
  });

  it('ignores invalid durations', () => {
    recordLatency(-5);
    recordLatency(Number.NaN);
    expect(latencySnapshot().samples).toBe(0);
  });

  it('keeps only the most recent CAPACITY samples (ring wrap)', () => {
    // Fill well past capacity with a low value, then a burst of highs.
    for (let i = 0; i < 1000; i++) recordLatency(10);
    for (let i = 0; i < 1000; i++) recordLatency(500);
    const snap = latencySnapshot();
    expect(snap.samples).toBe(1000); // capped at CAPACITY
    expect(snap.p50).toBe(500); // the old 10s have been overwritten
  });
});

describe('WBR week-start (Monday, UTC)', () => {
  it('maps any weekday to its Monday', () => {
    // 2026-07-22 is a Wednesday → Monday is 2026-07-20.
    expect(weekStartOf(new Date('2026-07-22T10:00:00Z'))).toBe('2026-07-20');
    // A Monday maps to itself.
    expect(weekStartOf(new Date('2026-07-20T00:00:00Z'))).toBe('2026-07-20');
    // A Sunday belongs to the week that started the previous Monday.
    expect(weekStartOf(new Date('2026-07-26T23:59:00Z'))).toBe('2026-07-20');
    // The next Monday rolls forward.
    expect(weekStartOf(new Date('2026-07-27T00:00:00Z'))).toBe('2026-07-27');
  });
});
