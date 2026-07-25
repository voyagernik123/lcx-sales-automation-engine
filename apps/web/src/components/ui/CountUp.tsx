import { useEffect, useRef, useState } from 'react';
import { juiceEnabled, motionDurationMs } from '@/lib/juice';

/**
 * A count that ROLLS to its new value instead of snapping (TERMINAL T1 #18 — the last
 * unbuilt piece of the Phase 5 juice layer).
 *
 * The whole claim is small and worth stating precisely: when a number the operator is
 * looking at changes, they should be able to see THAT it changed. A stat that snaps from
 * 12 to 47 between two frames is indistinguishable from a stat that was always 47, so the
 * information "something moved" is lost — and on this desk that information is the reason
 * the number is on screen.
 *
 * ── FOUR RULES INHERITED FROM THE PHASE THAT BUILT THE JUICE LAYER, all of them tested
 *    in `__tests__/CountUp.test.tsx`:
 *
 * 1. A NO-OP GETS NO CELEBRATION. If the value did not change, nothing moves — not even
 *    a zero-length animation. Phase 5's rule is that the feel follows the truth, and a
 *    roll-up on an unchanged number teaches the operator to trust a feeling that does not
 *    correspond to a change in the record. This also covers the first render: arriving at
 *    a page is not a change, so a mounted `47` renders as `47` and never rolls up from 0.
 *    A count-up on mount is the slot-machine version of this component and it is exactly
 *    what makes number animation feel like advertising.
 *
 * 2. IT DOES NOT BOUNCE. Overshoot (`--e-snap`) is rationed to commit moments — a
 *    governed write landing — and a count changing because a date range moved is not a
 *    commit. The easing here is a plain ease-out that reaches the target and stops; the
 *    test asserts no intermediate value ever passes the target.
 *
 * 3. `prefers-reduced-motion` SKIPS STRAIGHT TO THE VALUE. Not a faster roll — no roll.
 *    Nothing is scheduled at all, which is why `lib/juice.ts` exports `juiceEnabled` in
 *    the first place ("callers that would do real WORK to animate — computing a count
 *    roll-up — can skip the work rather than doing it and having CSS discard the result").
 *    CSS could not have reduced this for us: the animated quantity is text content, so
 *    the blanket `@media (prefers-reduced-motion: reduce)` block in globals.css never
 *    sees it.
 *
 * 4. THE DURATION COMES FROM THE VOCABULARY, read from `--t-state` rather than typed
 *    here. A changing metric is a state change, which is what that token is for. See
 *    `motionDurationMs` for why reading it matters: Phase D's ratchet cannot see a
 *    hardcoded `160` inside a `.tsx` file, so this is the one place where staying inside
 *    the vocabulary is on the honour system, and the honour system is a token read.
 *
 * ── WHY rAF AND NOT CSS. There is no CSS transition for `textContent`. `@property` plus
 * a counter is a real technique and it cannot format — no thousands separators, no
 * currency, no "3 of 7" — and every consumer of this component needs formatting. So the
 * interpolation is in JS, done on the animation frame, writing to one piece of local
 * state on one node.
 *
 * ── ACCESSIBILITY, stated rather than assumed. This span is not a live region and must
 * not be put inside one: a number announced on every frame is 10 announcements of a
 * number that was wrong 9 times. For an operator using a screen reader the roll is
 * invisible and irrelevant, and the DOM text is the true value both before it starts and
 * after it ends. The bounded imprecision is the ~160ms in between, and the honest note is
 * that it exists rather than that it has been engineered away.
 */
export interface CountUpProps {
  /** The true value. Rendered as-is on mount; rolled to on change. */
  value: number;
  /**
   * How to render the interpolated number. Default rounds — a roll-up through 12.4
   * leads is nonsense, and every current consumer counts whole things.
   */
  format?: (n: number) => string;
  className?: string;
}

/**
 * Ease-out, and deliberately the boring one. `cubic-bezier(0.16, 1, 0.3, 1)` (`--e-out`)
 * is the app's easing for transitions, but replicating a bezier in JS to two decimal
 * places is more code than the effect is worth; `1 - (1 - t)³` is visually the same
 * family — fast start, settle — and, unlike `--e-snap`, it is mathematically incapable of
 * exceeding 1, which is rule 2 enforced by arithmetic rather than by taste.
 */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

const DEFAULT_FORMAT = (n: number) => String(Math.round(n));

export function CountUp({ value, format = DEFAULT_FORMAT, className }: CountUpProps) {
  const [shown, setShown] = useState(value);
  /**
   * What is currently on screen, mirrored in a ref.
   *
   * Two jobs. It seeds the roll from the DISPLAYED number rather than from the previous
   * prop, so a value that changes twice in quick succession continues from wherever the
   * first roll had got to instead of jumping backwards to its start — which would read as
   * the number bouncing, i.e. rule 2 broken by a race rather than by an easing curve. And
   * because it is written synchronously, the effect below can compare against it without
   * taking `shown` as a dependency and restarting itself on every frame.
   */
  const shownRef = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = shownRef.current;
    // Rule 1. Nothing changed, so nothing moves.
    if (from === value) return;

    // Rule 3. Straight to the value, no frames requested.
    if (!juiceEnabled()) {
      shownRef.current = value;
      setShown(value);
      return;
    }

    const duration = motionDurationMs('--t-state', 160);
    let start: number | null = null;

    const step = (ts: number) => {
      // The rAF timestamp is the clock, rather than `performance.now()` called at
      // schedule time: the gap between requesting a frame and being given one is
      // unbounded (a hidden tab produces none at all), and measuring from the first real
      // frame means a delayed start rolls over its full duration instead of appearing to
      // have already finished.
      if (start === null) start = ts;
      const t = duration > 0 ? Math.min(1, (ts - start) / duration) : 1;
      const next = t >= 1 ? value : from + (value - from) * easeOut(t);
      shownRef.current = next;
      setShown(next);
      // The last frame writes `value` exactly. Interpolating to 46.999 and formatting it
      // would leave the tile one short of the record it is reporting.
      if (t < 1) frame.current = requestAnimationFrame(step);
      else frame.current = null;
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [value]);

  return (
    // `num-tabular` is not optional here. `.num-hero` — the class on the stat tiles that
    // consume this — deliberately uses PROPORTIONAL digits ("tabular only in columns"),
    // and proportional digits change width as they change value, so an un-pinned roll-up
    // reflows its own container on most frames. Tabular figures make the roll move
    // vertically in place, which is the point, and cost one class.
    <span className={className ? `num-tabular ${className}` : 'num-tabular'}>{format(shown)}</span>
  );
}
