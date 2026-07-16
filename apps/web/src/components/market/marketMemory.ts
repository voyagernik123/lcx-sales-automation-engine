import { useCallback, useMemo, useState } from 'react';
import { storage } from '@/lib/persistence';
import { mergeVisitIds, type VisitStamp } from './gapMatrix';

/**
 * Two small pieces of per-operator memory shared by the market pages:
 *
 * - watchlist:  `lcx-os:watchlist:v1` — set of starred project ids.
 * - last visit: `lcx-os:lastvisit:v1` — per-page stamp (time + every id
 *   seen so far) powering the "+N new since Tue" screener-Δ chips.
 */

const WATCHLIST_KEY = 'watchlist';
const LASTVISIT_KEY = 'lastvisit';

export function useWatchlist(): { watched: Set<string>; toggleWatch: (id: string) => void } {
  const [ids, setIds] = useState<string[]>(() => storage.get<string[]>(WATCHLIST_KEY, []));
  const watched = useMemo(() => new Set(ids), [ids]);
  const toggleWatch = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      storage.set(WATCHLIST_KEY, next);
      return next;
    });
  }, []);
  return { watched, toggleWatch };
}

type VisitMap = Record<string, VisitStamp>;

/**
 * `prev` is the stamp left by the previous visit, captured once on mount so
 * the Δ chip stays stable while this visit updates the stored stamp.
 * Call `commit(ids)` after each successful data load.
 */
export function useLastVisit(page: 'gaps' | 'map'): {
  prev: VisitStamp | null;
  commit: (currentIds: string[]) => void;
} {
  const [prev] = useState<VisitStamp | null>(
    () => storage.get<VisitMap>(LASTVISIT_KEY, {})[page] ?? null,
  );
  const commit = useCallback(
    (currentIds: string[]) => {
      const all = storage.get<VisitMap>(LASTVISIT_KEY, {});
      all[page] = {
        ts: new Date().toISOString(),
        ids: mergeVisitIds(all[page]?.ids, currentIds),
      };
      storage.set(LASTVISIT_KEY, all);
    },
    [page],
  );
  return { prev, commit };
}
