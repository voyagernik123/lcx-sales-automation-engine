import { useRef } from 'react';
import { markOf, observe } from '@/lib/figMarks';

/**
 * THE ARRIVAL BLOOM (THE PRODUCTION, P5) — one hook on the S4 store.
 *
 * S4's `lib/figMarks.ts` keeps, per figure id, the value it showed the last time the operator ARRIVED (rollover happens once
 * per arrival, in the arrival store). A GL chart that carries an `arrivalKey` asks this hook, once per mount, whether its
 * data has CHANGED since that mark. If it has, the chart's emissive marks bloom once — the flat renderers multiply their
 * bloom gain by `1 + bloom · k · (1 − t)` over the ENTRANCE tween, so the glow rides the transition that already runs and
 * decays with it: no timer of its own (the one-clock rule), nothing at rest, and under reduced motion the entrance resolves
 * on the first frame, so there is no bloom to see and none is scheduled.
 *
 * The decision is taken once, at mount, from the mark as it stood — the chart is not asked to re-decide as data streams in;
 * the NEXT arrival compares against the mark this mount observed. A first reading (no mark) does not bloom: nothing changed
 * since nothing was seen, and inventing a change would be the lie the mark exists to prevent.
 *
 * `signature` is a number the chart derives from its data (a sum or hash of the values it draws); `null` means "nothing to
 * compare" and observes nothing.
 */
export function useArrivalBloom(arrivalKey: string | undefined, signature: number | null): number {
  const decided = useRef<number | null>(null);
  if (decided.current === null) {
    if (!arrivalKey || signature === null || !Number.isFinite(signature)) {
      decided.current = 0;
    } else {
      const mark = markOf(arrivalKey);
      decided.current = mark != null && mark.value !== signature ? 1 : 0;
      observe(arrivalKey, signature, new Date().toISOString());
    }
  }
  return decided.current;
}

/** A stable signature for a list of numbers: order-sensitive, finite, cheap. */
export function arrivalSignature(values: readonly (number | null | undefined)[]): number | null {
  let h = 0, n = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    n += 1;
    h = (h * 31 + Math.round(v * 1000)) % 2147483647;
  }
  return n === 0 ? null : h;
}
