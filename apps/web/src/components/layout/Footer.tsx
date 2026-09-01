import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { getHealth } from '@/lib/apiClient';
import { corrected, every, setServerNow } from '@/lib/clock';
import { useClock } from '@/lib/useClock';
import { connectivity, subscribeOnline, type Connectivity } from '@/lib/online';
import { useOperatorStore } from '@/stores';
import { KpiTicker } from './KpiTicker';
import {
  onPerfChange,
  interactionStats,
  settleStats,
  cacheHitRate,
  startFrameSampler,
  BUDGET_INTERACTION_MS,
} from '@/lib/perf';
import { startPerfFlush } from '@/lib/perfFlush';

/**
 * Status bar — the terminal frame of the session. Connection + latency,
 * sync age, live pipeline facts, UTC clock, build. Everything here is real
 * telemetry; nothing is decorative.
 */
export function Footer() {
  const operator = useOperatorStore(s => s.operator);
  const [api, setApi] = useState<{ ms: number | null; at: Date | null }>({ ms: null, at: null });
  // THE ONE CLOCK (S1). This used to be a private `setInterval` — one of eight under every
  // route — and the second it showed was this component's alone. Now every "now" on the
  // screen re-renders on the same epoch-aligned tick as this one.
  const clock = new Date(useClock(1000));

  /**
   * WHERE THE DOT'S TRUTH COMES FROM — and why it is no longer this component's
   * own opinion.
   *
   * This footer used to keep a private `ok` flag flipped by a single /health ping
   * every 60s. Any one rejection painted a red API DOWN and left it there for up
   * to a minute. That produced a status bar reading API DOWN on a page that was
   * concurrently loading its data from that same API — observed in production on
   * the Reply Desk, with the Marketing summary, the KPI ticker and the reply count
   * all rendering from live responses beside a red light.
   *
   * Worse, the app already had a better answer. `lib/online` accumulates evidence
   * from EVERY request the client makes (apiClient's noteTransport), needs two
   * consecutive transport failures before it will say 'degraded', and — by its own
   * rule — counts a 4xx/5xx as proof the API answered. `OfflineBanner` has always
   * used it. So the desk carried two contradicting connectivity indicators and
   * this one was the weaker: it could not tell "nothing answered" from "answered
   * 500", and it forgot every other request in flight.
   *
   * Now there is one authority. The ping below survives only to MEASURE — it
   * supplies the latency number and the sync age, and feeds `lib/online` on the
   * way through like any other request.
   */
  const [conn, setConn] = useState<Connectivity>(() => connectivity());

  useEffect(() => {
    const off = subscribeOnline(setConn);
    setConn(connectivity()); // in case it moved between render and effect
    return off;
  }, []);

  useEffect(() => {
    let stopped = false;
    const ping = async () => {
      const t0 = performance.now();
      try {
        const health = await getHealth();
        // The server's instant corrects the one clock every surface reads. The ping already
        // existed to measure latency; carrying the timestamp costs nothing and settles
        // "whose now" for the whole application.
        setServerNow(health.timestamp);
        if (!stopped) setApi({ ms: Math.round(performance.now() - t0), at: new Date() });
      } catch {
        // Deliberately no state change: `getHealth` already reported this outcome
        // to `lib/online` through the request path, and that is what the dot
        // reads. Recording a second, dumber verdict here is the bug this replaced.
        // `at` is retained — it means "age of the last round-trip that landed",
        // which a failure does not invalidate.
      }
    };
    void ping();
    const off = every(60_000, () => void ping());
    return () => {
      stopped = true;
      off();
    };
  }, []);

  // ── The speed-floor HUD (TERMINAL Phase 2) ───────────────────────────────
  // Two numbers, never one. PAINT is intent → the screen showing local state
  // (the "instant" number, budget 100ms). SETTLE is intent → every authoritative
  // region resolved (the number that stays honest when a read is deliberately
  // moved off the cache for governance reasons — otherwise the headline p95 would
  // improve as the desk got slower). The cache-hit rate is shown alongside so a
  // good number can always be traced to its cause rather than trusted blindly.
  const [perf, setPerf] = useState(() => ({
    paint: interactionStats(),
    settle: settleStats(),
    hit: cacheHitRate(),
  }));

  useEffect(() => {
    const refresh = () =>
      setPerf({ paint: interactionStats(), settle: settleStats(), hit: cacheHitRate() });
    const offPerf = onPerfChange(refresh);
    const stopFrames = startFrameSampler();
    const stopFlush = startPerfFlush();
    return () => {
      offPerf();
      stopFrames();
      stopFlush();
    };
  }, []);

  const utc = clock.toISOString().slice(11, 19);
  const syncedSec = api.at ? Math.max(0, Math.round((clock.getTime() - api.at.getTime()) / 1000)) : null;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-card px-3 font-mono text-[10px] tracking-wide text-grey">
      {/*
        Three states, not two. DEGRADED is the one that was missing and the one
        that was misreported as DOWN: requests are not landing cleanly, but
        something is answering. Only a proven-unreachable API earns red.
      */}
      <span
        className="flex items-center gap-1.5"
        title={
          conn === 'online'
            ? 'API connected'
            : conn === 'degraded'
              ? 'Requests are not landing cleanly — reads may be served from local state, and governed writes are held. Re-checking every 30s.'
              : 'API unreachable — retrying every 30s'
        }
      >
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            conn === 'online'
              ? 'bg-emerald-500'
              : conn === 'degraded'
                ? 'bg-amber-500'
                : 'bg-red-500',
          )}
        />
        {conn === 'online'
          ? api.ms !== null
            ? `API ${api.ms}MS`
            : 'API'
          : conn === 'degraded'
            ? 'API DEGRADED'
            : 'API DOWN'}
      </span>
      {syncedSec !== null && (
        <span title="Age of the last successful API round-trip">
          SYNC {syncedSec < 90 ? `${syncedSec}S` : `${Math.round(syncedSec / 60)}M`}
        </span>
      )}
      {perf.paint.p95 !== null && (
        <span
          className={clsx(perf.paint.p95 > BUDGET_INTERACTION_MS && 'text-amber-500')}
          title={
            `UI p95 — what you actually feel.\n` +
            `PAINT ${perf.paint.p95}ms (budget ${BUDGET_INTERACTION_MS}ms): intent → screen showing local state.\n` +
            (perf.settle.p95 !== null
              ? `SETTLE ${perf.settle.p95}ms: intent → every authoritative region resolved.\n`
              : '') +
            (perf.hit !== null ? `Cache hits ${perf.hit}% of paints.\n` : '') +
            `${perf.paint.samples} samples this session.`
          }
        >
          UI {perf.paint.p95}
          {perf.settle.p95 !== null && `/${perf.settle.p95}`}MS
        </span>
      )}
      <KpiTicker />
      {/* Was `text-grey/70`, measured at 3.16:1 light / 3.93:1 dark against the
          footer surface — under the 4.5:1 minimum, and this is the legal
          disclaimer, i.e. the last text in the app that should be hard to read.
          The alpha was the whole problem: the token at full strength is 6.13:1
          light / 6.71:1 dark. */}
      <span className="ml-auto hidden truncate text-grey xl:inline">
        INTERNAL · NOT LEGAL ADVICE · US COUNSEL SIGN-OFF REQUIRED
      </span>
      {/* Never "UTC" on a guess: until the server has answered once, this is the machine's
        * own clock and the label says so. */}
      <span title={corrected()
        ? 'Coordinated Universal Time — corrected against the server'
        : 'This machine\'s clock — the server has not answered yet, so the offset is unknown'}>
        {utc} {corrected() ? 'UTC' : 'UTC (local)'}
      </span>
      <span title="Build version">v{__APP_VERSION__}</span>
      {operator && (
        <span className="font-semibold text-navy" title={`Signed in as ${operator.name}`}>
          {operator.initials}
        </span>
      )}
    </footer>
  );
}
