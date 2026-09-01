import { useEffect, useState } from 'react';
import { every, now } from '@/lib/clock';

/**
 * React: the shared "now", re-rendering when the one clock crosses a multiple of `everyMs`
 * (default one second). Two components using this hook on one screen re-render on the same
 * tick with the same value — the footer and a page's "x min ago" can never disagree.
 *
 * Kept apart from `lib/clock.ts` so the clock itself stays React-free (its contract; see
 * that file's header). This is the only React in the timebase.
 */
export function useClock(everyMs = 1000): number {
  const [t, setT] = useState(() => now());
  useEffect(() => every(everyMs, (tk) => setT(tk.nowMs)), [everyMs]);
  return t;
}
