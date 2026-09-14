import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForApi } from '../coldStart';

/**
 * The sign-in probe is a loop with a budget, not a single request. These pin the three outcomes and
 * the one non-outcome (an unmounted screen stops probing).
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('waitForApi — a cold start is "waking", not "down"', () => {
  it('reports waking after each failed attempt and up when the API finally answers', async () => {
    let calls = 0;
    const probe = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new TypeError('Failed to fetch');
      return { ok: true };
    });
    const phases: string[] = [];
    const p = waitForApi(probe, (ph, ms) => phases.push(`${ph}@${Math.round(ms / 1000)}`), { intervalMs: 5_000, budgetMs: 90_000 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBe('up');
    expect(phases).toEqual(['waking@0', 'waking@5', 'up@10']);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('declares down only when the budget is spent', async () => {
    const probe = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const phases: string[] = [];
    const p = waitForApi(probe, (ph) => phases.push(ph), { intervalMs: 5_000, budgetMs: 20_000 });
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBe('down');
    // 0 s fail → waking, 5 s fail → waking, 10 s fail → waking, 15 s fail → 15 + 5 >= 20 → down
    expect(phases).toEqual(['waking', 'waking', 'waking', 'down']);
    expect(probe).toHaveBeenCalledTimes(4);
  });

  it('bounds a single attempt: a probe that never settles is abandoned at the attempt timeout', async () => {
    let aborted = 0;
    const probe = vi.fn((signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted++; reject(new DOMException('aborted', 'AbortError')); })));
    const phases: string[] = [];
    const p = waitForApi(probe, (ph) => phases.push(ph), { attemptTimeoutMs: 8_000, intervalMs: 5_000, budgetMs: 15_000 });
    await vi.advanceTimersByTimeAsync(8_000); // first attempt times out → waking
    await vi.advanceTimersByTimeAsync(5_000); // sleep
    await vi.advanceTimersByTimeAsync(8_000); // second attempt times out at 21 s ≥ budget → down
    expect(await p).toBe('down');
    expect(aborted).toBe(2);
    expect(phases).toEqual(['waking', 'down']);
  });

  it('stops probing when the caller aborts (an unmounted screen)', async () => {
    const probe = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const ctl = new AbortController();
    const phases: string[] = [];
    const p = waitForApi(probe, (ph) => phases.push(ph), { intervalMs: 5_000, budgetMs: 90_000, signal: ctl.signal });
    await vi.advanceTimersByTimeAsync(0);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toBe('aborted');
    expect(probe).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(['waking']);
  });
});
