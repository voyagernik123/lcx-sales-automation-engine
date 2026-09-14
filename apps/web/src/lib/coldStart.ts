/**
 * THE API IS ASLEEP, NOT DOWN — and the sign-in screen has to know the difference.
 *
 * Render's free tier spins the API down after fifteen idle minutes and a cold start takes 30–60 s. The
 * first visitor after a quiet spell is the one who wakes it, and that visitor is exactly the person the
 * desk is being shown to. One probe on arrival failing therefore says nothing about the service; it says
 * the container is booting. Seen on production 2026-09-14 08:30 UTC: the sign-in page read "API DOWN"
 * while /health answered 200 ninety seconds later with uptimeSeconds 134.
 *
 * So the probe is a LOOP with a budget: try, and if nothing answers, say "waking" and try again every
 * few seconds until either the API answers or the budget — longer than any cold start we have measured —
 * is spent. Only then is it "down". Each attempt is bounded on its own, because a booting container may
 * accept the socket and answer nothing for a while.
 */
export type WakePhase = 'waking' | 'up' | 'down';

export interface WakeOptions {
  /** Total time to keep trying before declaring the API down. Default 90 s. */
  budgetMs?: number;
  /** Pause between attempts. Default 5 s. */
  intervalMs?: number;
  /** Deadline for a single attempt. Default 8 s. */
  attemptTimeoutMs?: number;
  /** Stops the loop (an unmounted screen must not keep probing). */
  signal?: AbortSignal;
  /** Injected for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function waitForApi(
  probe: (signal: AbortSignal) => Promise<unknown>,
  onPhase: (phase: WakePhase, elapsedMs: number) => void,
  o: WakeOptions = {},
): Promise<'up' | 'down' | 'aborted'> {
  const budget = o.budgetMs ?? 90_000;
  const interval = o.intervalMs ?? 5_000;
  const attemptTimeout = o.attemptTimeoutMs ?? 8_000;
  const now = o.now ?? (() => Date.now());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = now();
  for (;;) {
    if (o.signal?.aborted) return 'aborted';
    const ctl = new AbortController();
    const onOuterAbort = () => ctl.abort();
    o.signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimeout(() => ctl.abort(), attemptTimeout);
    try {
      await probe(ctl.signal);
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onOuterAbort);
      if (o.signal?.aborted) return 'aborted';
      onPhase('up', now() - t0);
      return 'up';
    } catch {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onOuterAbort);
    }
    if (o.signal?.aborted) return 'aborted';
    const elapsed = now() - t0;
    if (elapsed + interval >= budget) {
      onPhase('down', elapsed);
      return 'down';
    }
    onPhase('waking', elapsed);
    await sleep(interval);
  }
}
