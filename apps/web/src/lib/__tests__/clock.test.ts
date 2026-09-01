import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  HEARTBEAT_MS, REDUCED_MOTION_FLOOR_MS,
  _resetClockForTests, corrected, every, now, onFrame, phase, serverOffsetMs, setServerNow, useClock,
} from '../clock';

/**
 * THE ONE CLOCK — tested for the property the instrument is named after: two readers of
 * "now" cannot disagree. Every assertion is on values the test itself produced under fake
 * timers, never on wall-clock luck.
 */

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
  _resetClockForTests();
  reduced = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (q: string) => ({ matches: /reduce/.test(q) && reduced, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});
afterEach(() => { _resetClockForTests(); vi.useRealTimers(); });

describe('one timebase', () => {
  it('two subscribers on the same period receive the SAME instant on the SAME tick — drift is zero by construction', () => {
    const a: number[] = [], b: number[] = [];
    every(1000, (t) => a.push(t.nowMs));
    // The second subscriber joins 700 ms later — alignment is to the epoch, not to subscription.
    vi.advanceTimersByTime(700);
    every(1000, (t) => b.push(t.nowMs));
    vi.advanceTimersByTime(3000);
    expect(a.length).toBeGreaterThanOrEqual(3);
    // Every tick b saw, a saw at the identical instant.
    for (const v of b) expect(a).toContain(v);
    // And every delivered instant lies within ONE heartbeat of an epoch second boundary — the
    // displays change together, on the second, never at a moment of subscription.
    for (const v of [...a, ...b]) expect(v % 1000).toBeLessThan(HEARTBEAT_MS);
  });

  it('a 60 s poller and a 30 s poller fire in the same heartbeat when their boundaries coincide', () => {
    const sixty: number[] = [], thirty: number[] = [];
    every(60_000, (t) => sixty.push(t.nowMs));
    every(30_000, (t) => thirty.push(t.nowMs));
    vi.advanceTimersByTime(120_000);
    expect(sixty).toHaveLength(2);
    expect(thirty).toHaveLength(4);
    for (const s of sixty) expect(thirty).toContain(s);
  });

  it('does not fire on subscription — the first paint never waits for a tick', () => {
    const fn = vi.fn();
    every(1000, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    // Still inside the first second bucket: the boundary has not been crossed.
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('the server wins', () => {
  it('setServerNow shifts now() by the measured offset and marks the clock corrected', () => {
    expect(corrected()).toBe(false);
    const local = now();
    setServerNow(new Date(local + 5_000).toISOString());
    expect(corrected()).toBe(true);
    expect(serverOffsetMs()).toBe(5_000);
    expect(now() - local).toBeGreaterThanOrEqual(5_000);
  });

  it('ignores a non-finite instant rather than corrupting the timebase', () => {
    setServerNow('not a date');
    expect(corrected()).toBe(false);
    expect(serverOffsetMs()).toBe(0);
  });

  it('phase() is computed on the corrected clock, so every rotator agrees after a correction', () => {
    setServerNow(now() + 1_500); // move to :01.5 within the 6 s period
    const p = phase(6000);
    expect(p).toBeCloseTo(((now() % 6000) / 6000), 6);
    expect(phase(0)).toBe(0);
  });
});

describe('an idle app owns zero timers', () => {
  it('starts the heartbeat on the first subscription and stops it on the last unsubscription', () => {
    expect(vi.getTimerCount()).toBe(0);
    const off1 = every(1000, () => {});
    const off2 = every(5000, () => {});
    expect(vi.getTimerCount()).toBe(1); // ONE interval, not two
    off1();
    expect(vi.getTimerCount()).toBe(1);
    off2();
    expect(vi.getTimerCount()).toBe(0);
    off2(); // double release is a no-op, never someone else's clock
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a throwing subscriber does not stop the others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    every(1000, () => { throw new Error('boom'); });
    every(1000, good);
    vi.advanceTimersByTime(1000);
    expect(good).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('reduced motion is a cadence floor', () => {
  it('a 250 ms subscriber is delivered no faster than once per second when the OS asks for less motion', () => {
    reduced = true;
    const fn = vi.fn();
    every(HEARTBEAT_MS, fn);
    vi.advanceTimersByTime(3000);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(3);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [t] of fn.mock.calls) expect((t as { nowMs: number }).nowMs % REDUCED_MOTION_FLOOR_MS).toBeLessThan(HEARTBEAT_MS);
  });

  it('onFrame falls back to the heartbeat under reduced motion instead of scheduling frames', () => {
    reduced = true;
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const fn = vi.fn();
    const off = onFrame(fn);
    vi.advanceTimersByTime(2000);
    // Delivered by the interval at the floor cadence, with the preference visible on the tick.
    expect(fn).toHaveBeenCalled();
    for (const [t] of fn.mock.calls) expect((t as { reducedMotion: boolean }).reducedMotion).toBe(true);
    off();
    raf.mockRestore();
  });
});

describe('useClock', () => {
  it('re-renders on the shared second and two hooks agree', () => {
    const a = renderHook(() => useClock(1000));
    const b = renderHook(() => useClock(1000));
    const first = a.result.current;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(a.result.current).toBeGreaterThan(first);
    expect(a.result.current).toBe(b.result.current);
    a.unmount(); b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
