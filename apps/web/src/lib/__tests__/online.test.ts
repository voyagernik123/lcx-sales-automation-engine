/**
 * The banner tells operators that governed writes are unavailable, so a false
 * positive is expensive (a working desk told it is broken) and a false negative
 * is worse (a write fired into a dead network against fail-open gates). These
 * tests pin the rules that keep the signal honest: navigator.onLine is trusted
 * only in the direction it deserves, "link up but API dead" is degraded rather
 * than online, an API that answers 500 is not a network failure, and an aborted
 * request is not evidence of anything.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { _resetClockForTests } from '../clock';
import {
  classify,
  isNetworkError,
  isOnline,
  connectivity,
  subscribeOnline,
  recordNetworkResult,
  recordRequestError,
  startConnectivityWatch,
  _resetOnline,
  DEGRADED_AFTER_FAILURES,
  LINK_OVERRIDE_MS,
  type Evidence,
} from '@/lib/online';

const healthy: Evidence = { link: true, consecutiveFailures: 0, lastSuccessAt: null };
const NOW = 1_000_000;

describe('classify (pure)', () => {
  it('is online with a live link and nothing failing', () => {
    expect(classify(healthy, NOW)).toBe('online');
  });

  it('trusts navigator.onLine === false — the one direction worth trusting', () => {
    expect(classify({ ...healthy, link: false }, NOW)).toBe('offline');
  });

  it('lets a request that actually landed override a lying link flag', () => {
    const e: Evidence = { link: false, consecutiveFailures: 0, lastSuccessAt: NOW - 1_000 };
    expect(classify(e, NOW)).toBe('online');
  });

  it('stops honouring that override once the success goes stale', () => {
    const e: Evidence = { link: false, consecutiveFailures: 0, lastSuccessAt: NOW - LINK_OVERRIDE_MS - 1 };
    expect(classify(e, NOW)).toBe('offline');
  });

  /**
   * The case navigator.onLine cannot see, and the reason this module exists: a
   * captive portal, broken DNS, or a dead API all leave the flag true.
   */
  it('calls a live link with dead requests degraded, not online', () => {
    const e: Evidence = { link: true, consecutiveFailures: DEGRADED_AFTER_FAILURES, lastSuccessAt: NOW - 60_000 };
    expect(classify(e, NOW)).toBe('degraded');
  });

  it('tolerates a single failure — one dropped request is noise, not a state', () => {
    expect(classify({ ...healthy, consecutiveFailures: 1 }, NOW)).toBe('online');
  });

  it('prefers offline over degraded when the link is down too', () => {
    const e: Evidence = { link: false, consecutiveFailures: 5, lastSuccessAt: null };
    expect(classify(e, NOW)).toBe('offline');
  });
});

describe('isNetworkError', () => {
  it('treats a fetch transport failure as a network error', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('network request failed'))).toBe(true);
  });

  it('does not treat an API answer as a network error — the API replied', () => {
    // Shape of an ApiError without importing it (that import would cycle).
    const apiError = Object.assign(new Error('Internal error'), { name: 'ApiError', status: 500 });
    expect(isNetworkError(apiError)).toBe(false);
  });

  it('does not treat a caller-initiated abort as evidence', () => {
    expect(isNetworkError(new DOMException('aborted', 'AbortError'))).toBe(false);
    expect(isNetworkError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
  });
});

describe('recorded evidence', () => {
  beforeEach(() => _resetOnline());

  it('goes degraded after consecutive transport failures and recovers on a success', () => {
    expect(isOnline()).toBe(true);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');
    expect(connectivity()).toBe('degraded');
    expect(isOnline()).toBe(false); // degraded is NOT online — writes stay blocked

    recordNetworkResult('ok');
    expect(connectivity()).toBe('online');
  });

  it('resets the streak on any success, so alternating failures never latch', () => {
    recordNetworkResult('network-error');
    recordNetworkResult('ok');
    recordNetworkResult('network-error');
    expect(connectivity()).toBe('online');
  });

  it('ignores an error that is not a transport failure', () => {
    for (let i = 0; i < DEGRADED_AFTER_FAILURES + 2; i += 1) {
      recordRequestError(Object.assign(new Error('boom'), { name: 'ApiError', status: 500 }));
    }
    expect(connectivity()).toBe('online');
  });

  it('notifies subscribers on transitions only', () => {
    const seen: string[] = [];
    const off = subscribeOnline(s => seen.push(s));

    recordNetworkResult('network-error'); // still online — no transition
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');
    recordNetworkResult('ok');

    off();
    expect(seen).toEqual(['degraded', 'online']);

    recordNetworkResult('network-error');
    recordNetworkResult('network-error');
    expect(seen).toHaveLength(2); // unsubscribed
  });

  it('keeps a throwing subscriber from breaking the request path', () => {
    const offBad = subscribeOnline(() => {
      throw new Error('render exploded');
    });
    const seen: string[] = [];
    const offGood = subscribeOnline(s => seen.push(s));

    expect(() => {
      for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');
    }).not.toThrow();
    expect(seen).toEqual(['degraded']);

    offBad();
    offGood();
  });
});

describe('startConnectivityWatch', () => {
  beforeEach(() => {
    _resetOnline();
    _resetClockForTests();
    vi.useFakeTimers();
    // The probe rides the one clock (S1), whose buckets are aligned to the EPOCH. A 31 s
    // advance from an arbitrary instant can cross one or two 30 s boundaries; pinning the
    // instant half a second past a boundary makes each 31 s advance cross exactly one, so
    // the call counts below stay exact without weakening what they assert (one shared loop).
    vi.setSystemTime(new Date('2026-09-01T12:00:00.500Z'));
  });
  afterEach(() => { _resetClockForTests(); vi.useRealTimers(); });

  it('does not probe while healthy — there is nothing to find out', async () => {
    const probe = vi.fn().mockResolvedValue({});
    const stop = startConnectivityWatch(probe);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    stop();
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes while degraded and clears the state when the API answers', async () => {
    const probe = vi.fn().mockResolvedValue({});
    const stop = startConnectivityWatch(probe);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');

    await vi.advanceTimersByTimeAsync(31_000);
    stop();

    expect(probe).toHaveBeenCalled();
    expect(connectivity()).toBe('online');
  });

  it('stops probing after teardown', async () => {
    const probe = vi.fn().mockResolvedValue({});
    const stop = startConnectivityWatch(probe);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');
    stop();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(probe).not.toHaveBeenCalled();
  });

  it('shares one probe loop across consumers, and only stops on the last teardown', async () => {
    const probe = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const stopA = startConnectivityWatch(probe);
    const stopB = startConnectivityWatch(probe);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');

    await vi.advanceTimersByTimeAsync(31_000);
    expect(probe).toHaveBeenCalledTimes(1); // one interval, not two

    stopA();
    stopA(); // idempotent — must not release B's watch
    await vi.advanceTimersByTimeAsync(31_000);
    expect(probe).toHaveBeenCalledTimes(2);

    stopB();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('survives a probe that rejects with a transport error', async () => {
    const probe = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const stop = startConnectivityWatch(probe);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');

    await vi.advanceTimersByTimeAsync(31_000);
    stop();
    expect(connectivity()).toBe('degraded');
  });

  it('counts a probe rejected by the API (401/500) as reachable', async () => {
    const probe = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unauthorized'), { name: 'ApiError', status: 401 }));
    const stop = startConnectivityWatch(probe);
    for (let i = 0; i < DEGRADED_AFTER_FAILURES; i += 1) recordNetworkResult('network-error');

    await vi.advanceTimersByTimeAsync(31_000);
    stop();
    expect(connectivity()).toBe('online');
  });
});
