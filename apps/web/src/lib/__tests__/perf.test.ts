/**
 * The instrument must be trustworthy before it is used to justify anything.
 * These tests pin the properties that make a reported p95 honest: an empty set
 * reports null rather than 0, percentiles use the same nearest-rank definition as
 * the API ring, the window is bounded, a double-stop cannot double-count, and
 * backgrounded-tab stalls never enter the frame distribution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  percentile,
  settleStats,
  percentiles,
  recordInteraction,
  recordFrame,
  interactionStats,
  frameStats,
  bySurface,
  cacheHitRate,
  drainPending,
  restorePending,
  beginInteraction,
  _resetPerf,
  BUDGET_INTERACTION_MS,
} from '@/lib/perf';

describe('percentile maths', () => {
  it('returns null on an empty set — never 0, which would read as "fast"', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentiles([])).toEqual({ samples: 0, p50: null, p95: null, p99: null });
  });

  it('matches nearest-rank on a known distribution', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
  });

  it('is order-independent', () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(percentile([1, 3, 5, 7, 9], 50));
  });

  it('handles a single sample', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it('does not mutate the caller’s array', () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe('interaction recording', () => {
  beforeEach(() => _resetPerf());

  it('rejects impossible samples rather than recording them', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: Number.NaN, cached: false });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: -5, cached: false });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: Infinity, cached: false });
    expect(interactionStats().samples).toBe(0);
  });

  it('computes p95 across recorded interactions', () => {
    for (const ms of [10, 20, 30, 40, 500]) {
      recordInteraction({ kind: 'nav', phase: 'paint', surface: '/deal-board', ms, cached: false });
    }
    const s = interactionStats();
    expect(s.samples).toBe(5);
    expect(s.p95).toBe(500); // the tail is the point of a p95
  });

  it('attributes p95 per surface, worst first, so a breach names the guilty page', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/fast', ms: 12, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/fast', ms: 15, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/slow', ms: 900, cached: false });

    const rows = bySurface();
    expect(rows[0].surface).toBe('/slow');
    expect(rows[0].paintP95).toBe(900);
    expect(rows[1].surface).toBe('/fast');
    expect(rows[1].paintP95!).toBeLessThan(BUDGET_INTERACTION_MS);
  });

  it('reports the cache-hit rate that the p95 depends on', () => {
    expect(cacheHitRate()).toBeNull(); // no data ≠ 0%
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: 10, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: 10, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: 200, cached: false });
    expect(cacheHitRate()).toBe(67);
  });

  it('bounds the window so a long session cannot grow without limit', () => {
    for (let i = 0; i < 500; i += 1) {
      recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: i + 1, cached: false });
    }
    expect(interactionStats().samples).toBeLessThanOrEqual(200);
  });
});

describe('beginInteraction', () => {
  beforeEach(() => _resetPerf());

  it('records one sample and returns the elapsed time', () => {
    const i = beginInteraction('palette', '/command');
    const ms = i.paint({ cached: true });
    expect(ms).toBeGreaterThanOrEqual(0);
    const s = interactionStats();
    expect(s.samples).toBe(1);
    expect(cacheHitRate()).toBe(100);
  });

  it('is idempotent — a double-stop must not double-count', () => {
    const i = beginInteraction('nav', '/a');
    i.paint();
    i.paint();
    i.paint();
    expect(interactionStats().samples).toBe(1);
  });

  it('records paint and settle independently, on the same interaction', () => {
    const i = beginInteraction('nav', '/deal-board');
    i.paint({ cached: true });
    i.settle({ cached: false });

    expect(interactionStats().samples).toBe(1);
    expect(settleStats().samples).toBe(1);
    // settle can never be earlier than paint on the same interaction
    expect(settleStats().p95!).toBeGreaterThanOrEqual(interactionStats().p95!);
  });
});

describe('the anti-gaming invariant (why settle exists)', () => {
  beforeEach(() => _resetPerf());

  /**
   * The failure mode this guards is subtle and would have made the whole Phase 2
   * number meaningless: if only intent→paint were published, then moving a slow
   * read to network-only — which governance safety REQUIRES for gate inputs,
   * entitlements and audit surfaces — deletes a slow sample from the paint
   * distribution. The headline p95 would improve while the app got slower.
   */
  it('paint p95 alone would improve when a slow read is moved off the cache', () => {
    // Before: the slow authoritative read is on the paint path.
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/x', ms: 20, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/x', ms: 900, cached: false });
    const paintBefore = interactionStats().p95!;

    _resetPerf();

    // After: that read became network-only, so it no longer paints — it settles.
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/x', ms: 20, cached: true });
    recordInteraction({ kind: 'nav', phase: 'settle', surface: '/x', ms: 900, cached: false });
    const paintAfter = interactionStats().p95!;
    const settleAfter = settleStats().p95!;

    // Paint "improved" dramatically...
    expect(paintAfter).toBeLessThan(paintBefore);
    // ...but settle still tells the truth about what the operator waited for.
    expect(settleAfter).toBe(900);
  });

  it('settle is reported per surface too, so a breach is attributable', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/slow', ms: 30, cached: true });
    recordInteraction({ kind: 'nav', phase: 'settle', surface: '/slow', ms: 1200, cached: false });

    const row = bySurface().find((r) => r.surface === '/slow')!;
    expect(row.paintP95).toBe(30);
    expect(row.settleP95).toBe(1200);
  });

  it('ranks surfaces by settle, not paint — the slowest FELT surface comes first', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/looks-fast', ms: 10, cached: true });
    recordInteraction({ kind: 'nav', phase: 'settle', surface: '/looks-fast', ms: 2000, cached: false });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/honest', ms: 90, cached: true });
    recordInteraction({ kind: 'nav', phase: 'settle', surface: '/honest', ms: 120, cached: false });

    expect(bySurface()[0].surface).toBe('/looks-fast');
  });
});

describe('flush queue', () => {
  beforeEach(() => _resetPerf());

  it('drains pending samples exactly once', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: 10, cached: true });
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/b', ms: 20, cached: true });

    expect(drainPending()).toHaveLength(2);
    expect(drainPending()).toHaveLength(0);

    // ...but the local window keeps them, so the HUD does not blank on flush.
    expect(interactionStats().samples).toBe(2);
  });

  it('restores samples after a failed flush so a network blip loses nothing', () => {
    recordInteraction({ kind: 'nav', phase: 'paint', surface: '/a', ms: 10, cached: true });
    const batch = drainPending();
    restorePending(batch);
    expect(drainPending()).toHaveLength(1);
  });
});

describe('frame sampling', () => {
  beforeEach(() => _resetPerf());

  it('discards backgrounded-tab stalls instead of recording catastrophic frames', () => {
    recordFrame(16);
    recordFrame(8);
    recordFrame(0); // impossible
    recordFrame(-1); // impossible
    const s = frameStats();
    expect(s.samples).toBe(2);
    expect(s.p95).toBe(16);
  });
});

describe('hidden-tab poisoning guard', () => {
  beforeEach(() => _resetPerf());

  /**
   * requestAnimationFrame does not fire while a tab is hidden. Navigations in a
   * background tab therefore queue, and every callback fires at once when the tab
   * is restored — each measuring from minutes ago. Verified live: a double-rAF in
   * a hidden tab never fired at all. Without this guard the p95 fills with
   * multi-second samples no operator ever experienced.
   */
  it('discards an interaction that began while the document was hidden', () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const i = beginInteraction('nav', '/background');
    spy.mockReturnValue(false); // tab restored; the queued rAF now fires
    i.paint();
    i.settle();
    spy.mockRestore();

    expect(interactionStats().samples).toBe(0);
    expect(settleStats().samples).toBe(0);
  });

  it('still returns the elapsed time to the caller, it just does not record it', () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const i = beginInteraction('nav', '/background');
    const ms = i.paint();
    spy.mockRestore();
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(interactionStats().samples).toBe(0);
  });

  it('records normally when the tab is visible throughout', () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const i = beginInteraction('nav', '/foreground');
    i.paint();
    spy.mockRestore();
    expect(interactionStats().samples).toBe(1);
  });
});
