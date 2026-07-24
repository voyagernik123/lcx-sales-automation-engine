import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CloudOff } from 'lucide-react';
import { getHealth } from '@/lib/apiClient';
import { connectivity, subscribeOnline, startConnectivityWatch, type Connectivity } from '@/lib/online';

/**
 * Live connectivity, for any surface that needs to disable a governed action
 * rather than let the operator fire it into a dead network.
 */
export function useConnectivity(): Connectivity {
  const [state, setState] = useState<Connectivity>(connectivity);

  useEffect(() => {
    // The banner is where the recovery probe lives, so connectivity is only
    // watched while a surface is actually rendering it. getHealth is injected
    // here rather than imported by lib/online.ts, which stays free of any
    // dependency on the API client.
    const stopWatch = startConnectivityWatch(() => getHealth());
    const off = subscribeOnline(setState);
    setState(connectivity()); // in case it moved between render and effect
    return () => {
      off();
      stopWatch();
    };
  }, []);

  return state;
}

/**
 * The read-only strip. Renders nothing while healthy.
 *
 * The copy has to be exact about the boundary, because the boundary is a
 * deliberate design decision and not a missing feature: reads come from local
 * state, writes do not queue. Every gate reads its inputs at write time and
 * three of them fail OPEN on a read error (registry.ts:205, registry.ts:632,
 * reviews.ts:212-213), so a write replayed later would be judged against truth
 * that has since moved — and a fail-open gate in a degraded state is an
 * unconditional pass. Better to say "not now" than to approve something blind.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const state = useConnectivity();
  if (state === 'online') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex shrink-0 items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5',
        'dark:border-amber-800 dark:bg-amber-950/20',
        className,
      )}
    >
      <CloudOff size={13} className="mt-px shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="shrink-0 text-micro font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        {state === 'offline' ? 'Offline' : 'Connection degraded'}
      </span>
      <span className="min-w-0 text-micro text-amber-800/90 dark:text-amber-300/80">
        {state === 'offline'
          ? 'No network. '
          : 'The network is up but the API is not answering. '}
        Reads are served from local state and may be stale. Governed actions stay unavailable until the
        connection returns — every gate reads its inputs at the moment of the write, so a queued action
        would be judged against truth that has since changed.
      </span>
    </div>
  );
}
