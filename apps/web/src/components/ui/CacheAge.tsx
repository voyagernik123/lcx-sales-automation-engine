import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { clsx } from 'clsx';
import { cacheAge, cacheAgeLabel, servedFrom } from '@/lib/readCache';
import { every } from '@/lib/clock';
import { formatDateTime } from '@/lib/format';

/**
 * "This number is not live" — the one affordance for read-cache age (handover,
 * T1 #22).
 *
 * Production sits behind 165-195ms of fixed infrastructure latency before our
 * code runs, so the local read cache is not an optimisation; it is the only
 * mechanism available, and it serves real values that three people make funded
 * decisions on. `storedAt` was recorded from the day the cache shipped and shown
 * nowhere, which made a cached figure visually identical to a live one — the
 * offline banner was the only signal, and it says "the API is down", not "THIS
 * figure is four minutes old".
 *
 * THREE DELIBERATE CHOICES.
 *
 * 1. Nothing renders for a live value. `cacheAge` returns null unless the body a
 *    surface received came out of the cache, so the chip is the DIFFERENCE, not a
 *    decoration on every panel. A badge on everything teaches nothing.
 * 2. The visible text is an age, not a clock time, and it re-renders on a 30s
 *    tick — but only while an age is actually being shown. Without the tick an
 *    offline desk would sit at "4m old" for an hour, which is a new lie of exactly
 *    the kind this exists to remove. The precise stamp is in the tooltip.
 * 3. It borrows SourceChip's shape verbatim (mono, 10px, bordered, 9px icon) in
 *    the neutral C3 tone, because provenance already has a visual language in this
 *    app and a fifth one would be noise. It shouts at nobody; an affordance that
 *    shouts gets ignored.
 *
 * WHY READING MODULE STATE IN RENDER IS SAFE HERE. `cacheAge` is a plain read of a
 * Map that only `apiClient.request()` writes, and it only writes when it hands a
 * body to a caller — which is always the same tick that makes a surface call
 * setState with that body. So the chip is re-rendered by the very event that can
 * change its answer, and no subscription is needed. A background revalidation
 * deliberately does not update the record (see readCache), because its fresh body
 * never reaches the surface.
 */

export interface CacheAgeState {
  /** Milliseconds since the served body was received. */
  ageMs: number;
  /** When it was received. */
  storedAt: number;
}

/**
 * The age of the body currently displayed for `path`, or null when it is live.
 * `path` is the same string passed to `request()`; query order does not matter,
 * it is canonicalised.
 */
export function useCacheAge(path: string): CacheAgeState | null {
  const [, tick] = useState(0);
  const ageMs = cacheAge(path);
  const showing = ageMs !== null;

  // Only tick while something is on screen to keep honest. Keyed on `showing`
  // rather than on `ageMs` so a label crossing 4m→5m does not reinstall a timer.
  useEffect(() => {
    if (!showing) return;
    // On the one clock: every age label on screen crosses 4m→5m on the same tick.
    return every(30_000, () => tick((n) => n + 1));
  }, [showing]);

  if (ageMs === null) return null;
  const p = servedFrom(path);
  return { ageMs, storedAt: p ? p.storedAt : Date.now() - ageMs };
}

/**
 * Renders nothing when the value is live. `path` is the endpoint the surface's
 * figures came from.
 */
export function CacheAge({ path, className }: { path: string; className?: string }) {
  const state = useCacheAge(path);
  if (!state) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded border border-line bg-ice-soft/60 px-1 py-px font-mono text-[10px] font-bold text-grey-dark dark:bg-ice-soft/10',
        className,
      )}
      title={`Served from this Mac's read cache — received ${formatDateTime(state.storedAt)} and not re-checked since. The live value may differ.`}
    >
      <History size={9} /> {cacheAgeLabel(state.ageMs)}
    </span>
  );
}
