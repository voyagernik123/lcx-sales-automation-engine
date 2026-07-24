import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { getHealth } from '@/lib/apiClient';
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
  const [api, setApi] = useState<{ ok: boolean; ms: number | null; at: Date | null }>({
    ok: true,
    ms: null,
    at: null,
  });
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    const ping = async () => {
      const t0 = performance.now();
      try {
        await getHealth();
        if (!stopped) setApi({ ok: true, ms: Math.round(performance.now() - t0), at: new Date() });
      } catch {
        if (!stopped) setApi(a => ({ ...a, ok: false }));
      }
    };
    void ping();
    const iv = setInterval(() => void ping(), 60_000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
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
      <span
        className="flex items-center gap-1.5"
        title={api.ok ? 'API connected' : 'API unreachable — retrying every 60s'}
      >
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            api.ok ? 'bg-emerald-500' : 'animate-pulse-beacon bg-red-500',
          )}
        />
        {api.ok ? (api.ms !== null ? `API ${api.ms}MS` : 'API') : 'API DOWN'}
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
      <span className="ml-auto hidden truncate text-grey/70 xl:inline">
        INTERNAL · NOT LEGAL ADVICE · US COUNSEL SIGN-OFF REQUIRED
      </span>
      <span title="Coordinated Universal Time">{utc} UTC</span>
      <span title="Build version">v{__APP_VERSION__}</span>
      {operator && (
        <span className="font-semibold text-navy" title={`Signed in as ${operator.name}`}>
          {operator.initials}
        </span>
      )}
    </footer>
  );
}
