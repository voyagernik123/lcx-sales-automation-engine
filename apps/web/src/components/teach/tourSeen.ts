import { storage } from '@/lib/persistence';

/**
 * "Has this operator already had their first run?" — and NOTHING else (T1 #19).
 *
 * WHY THIS IS A SEPARATE MODULE FROM `lib/tour.ts`, which is where it obviously
 * belongs. `TourHost` is eager: something already resident has to decide whether to
 * fetch the tour at all, exactly as `useManual` owns `?` for the lazy manual. If that
 * gate imported `lib/tour.ts`, Rollup would place `lib/tour.ts` in the entry chunk
 * (it is reachable from the entry) and the lazy body would import it back out — so
 * every step prompt, every predicate and the generation logic would ship in the
 * initial bundle for the operators who never see the tour again. Tree-shaking does
 * not save it: `tourFor` IS used, just from the other chunk.
 *
 * That is not a hypothetical. `hooks/useHints.ts` carries the same note for the same
 * reason, and Phase 6 lost 9KB of headroom to one convenient import of exactly this
 * shape. This phase started with 9KB. So the eager surface is this file: one key and
 * two functions.
 *
 * PER OPERATOR, WHICH IS THE POINT. `lib/persistence.ts` scopes every key by the
 * signed-in email; these are shared Macs and Phase 2 fixed a real leak where they
 * were not. An operator who dismissed the tour must never see it again, and the
 * person who sits down after them must still get theirs. Both halves are the same
 * requirement, and only the scoped key delivers them.
 */

const KEY = 'teach:tour';

/** How the tour ended. Recorded, but nothing branches on it — see below. */
export type TourOutcome = 'skipped' | 'finished';

interface Settled {
  how: TourOutcome;
  /** Epoch ms, for a human reading localStorage during a support call. */
  at: number;
}

/**
 * Has this operator settled the tour, either way?
 *
 * SKIPPED AND FINISHED ARE TREATED IDENTICALLY, deliberately. The research this
 * phase is written against says to assume nobody reads anything, so an operator who
 * dismissed the tour and got it again has been taught that the app does not listen —
 * which is a more expensive lesson than any shortcut the tour could have installed.
 * "They only skipped it, we'll offer it once more" is precisely how that happens.
 */
export function tourSettled(): boolean {
  const s = storage.get<Settled | null>(KEY, null);
  // Defensive about the shape rather than the presence: a hand-edited or older value
  // must resolve to "already settled" rather than throwing inside a render, because
  // the failure mode of a throw here is a blank shell at sign-in.
  return s !== null && typeof s === 'object';
}

/** Record that it is over. Idempotent. */
export function settleTour(how: TourOutcome): void {
  storage.set<Settled>(KEY, { how, at: Date.now() });
}

/** Test-only: forget the tour so it appears again. Never called by the app. */
export function _resetTourSeen(): void {
  storage.remove(KEY);
}
