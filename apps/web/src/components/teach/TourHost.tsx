import { Suspense, lazy, useState } from 'react';
import { useAccessStore } from '@/stores/useAccessStore';
import { settleTour, tourSettled } from './tourSeen';

/**
 * The eager gate for the first run (T1 #19).
 *
 * Same shape as `ManualHost` and `HintLayer`, and for the sharper of their two
 * reasons: the body carries every step prompt and predicate, and the initial bundle
 * had 9KB of headroom for this whole phase. Nothing here is fetched for an operator
 * who has already had their first run — which, after week one, is everyone, forever.
 * The gate is two reads and a boolean.
 *
 * IT WAITS FOR THE ENTITLEMENTS, AND IT NEVER FAKES THEM. `me` is null until
 * `useAccessStore.load()` resolves, and it STAYS null if that call fails (the store
 * catches, keeps the previous picture and lets the API remain the enforcer). Rendering
 * on a null map would generate a tour with no workspace steps — a tour that silently
 * teaches a restricted operator's version of the app to someone who holds all six
 * compartments, or worse, to someone whose compartments simply had not arrived yet.
 * So: no entitlements, no tour, and nothing recorded as settled, so the operator gets
 * their first run on the next launch instead of losing it to a network hiccup.
 *
 * `tourSettled()` is read ONCE, in a state initialiser, rather than on every render.
 * It is a localStorage hit, and this component re-renders whenever the access store
 * changes.
 *
 * WHAT THIS GATE DELIBERATELY DOES NOT DO: re-render itself when the tour settles. The
 * first version did — `onSettle` set local state — and it made the farewell card
 * unreachable, which I only found by driving the built bundle: the tour records
 * "finished" the moment the operator arrives at the end, so the gate unmounted the body
 * in the same commit and the operator's reward for completing the tour was the panel
 * vanishing mid-sentence. Recording and hiding are two different events. The BODY owns
 * hiding (it renders null once dismissed); this gate only answers "was it already
 * settled when the shell mounted?", which is the question that matters on the next
 * launch.
 */
const TourBody = lazy(() => import('./Tour').then((m) => ({ default: m.Tour })));

export function TourHost() {
  const me = useAccessStore((s) => s.me);
  const [settled] = useState(() => tourSettled());

  if (settled || !me) return null;

  // No Suspense fallback, same as the manual and the hint layer: a spinner that
  // flashes for 30ms is worse than a panel that appears 30ms late, and nothing is
  // blocked on it — the app is fully usable while the chunk arrives.
  return (
    <Suspense fallback={null}>
      {/* `settleTour` passed straight through: it is a module-level function, so it is
        * already referentially stable and needs no `useCallback`. */}
      <TourBody entitlements={me.entitlements} onSettle={settleTour} />
    </Suspense>
  );
}
