import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { CountUp } from '../CountUp';

/**
 * The count roll-up (TERMINAL T1 #18).
 *
 * Every assertion here is a rule the phase that built the juice layer already wrote down,
 * being enforced instead of restated:
 *
 *   · a no-op gets no celebration — an unchanged count must not animate, and neither must
 *     a first render, which is an arrival rather than a change
 *   · `prefers-reduced-motion` goes STRAIGHT to the value — no animation, not a fast one
 *   · overshoot is rationed to commit moments, and a metric moving is not a commit
 *
 * ── WHY THE FRAME LOOP IS DRIVEN BY HAND. jsdom's `requestAnimationFrame` fires on a
 * timer, so a test that waited for it would be asserting against whatever number the
 * easing happened to have reached — flaky, and it could not see the frames in between,
 * which is where the "does it overshoot" answer lives. Replacing rAF with a queue makes
 * the frames the test's to advance and lets the strongest assertions be about the
 * intermediate values rather than the endpoint. It also means `requestAnimationFrame` NOT
 * BEING CALLED is directly observable, which is the whole of the reduced-motion and
 * no-op guarantees: "it did not animate" is a claim about scheduling, and checking the
 * final text alone cannot distinguish it from "it animated and finished".
 */

let frames: FrameRequestCallback[] = [];
let raf: ReturnType<typeof vi.fn>;

/** Run every frame currently queued, at timestamp `ts`. */
function tick(ts: number) {
  const due = frames;
  frames = [];
  act(() => {
    for (const cb of due) cb(ts);
  });
}

/** OS-level reduce-motion, which is what `juiceEnabled()` reads through `matchMedia`. */
function setReducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  frames = [];
  raf = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a no-op gets no celebration', () => {
  it('does not animate on first render', () => {
    // Arriving at a page is not a change. A tile that rolls 0 → 47 on mount is the
    // slot-machine version of this component, and it is what makes animated numbers read
    // as advertising rather than as instrumentation.
    const { container } = render(<CountUp value={47} />);
    expect(container.textContent).toBe('47');
    expect(raf, 'the first render scheduled an animation — the count rolled up from 0').not.toHaveBeenCalled();
  });

  it('does not animate when the new value equals the old one', () => {
    const { rerender } = render(<CountUp value={12} />);
    rerender(<CountUp value={12} />);
    // The feel follows the truth. Motion on an unchanged number teaches the operator to
    // trust a feeling that does not correspond to a change in the record.
    expect(raf, 'an unchanged count animated').not.toHaveBeenCalled();
  });

  it('does animate when the value actually changes, so the guard above is not just "it never animates"', () => {
    // The positive control. Without it, deleting the animation entirely would make every
    // other test in this describe block pass.
    const { rerender } = render(<CountUp value={12} />);
    rerender(<CountUp value={47} />);
    expect(raf).toHaveBeenCalledTimes(1);
  });
});

describe('reduced motion', () => {
  it('skips straight to the value rather than animating faster', () => {
    setReducedMotion(true);
    const { rerender, container } = render(<CountUp value={12} />);
    rerender(<CountUp value={47} />);

    expect(container.textContent, 'the value did not arrive immediately').toBe('47');
    expect(
      raf,
      'a frame was requested for an operator who asked the OS for less motion — a shorter ' +
        'roll is still a roll, and CSS cannot reduce this one because the animated thing is text',
    ).not.toHaveBeenCalled();
  });
});

describe('the motion itself', () => {
  it('rolls through intermediate values and lands exactly on the target', () => {
    const { rerender, container } = render(<CountUp value={0} />);
    rerender(<CountUp value={100} />);

    tick(0); // first frame establishes the clock; nothing has elapsed yet
    expect(container.textContent).toBe('0');

    tick(80); // half of --t-state
    const mid = Number(container.textContent);
    expect(mid, 'no intermediate value was rendered — this is a snap with extra steps').toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    tick(160);
    // Exactly, not 99: the last frame writes the true value rather than an interpolation
    // of it, or the tile ends one short of the record it is reporting.
    expect(container.textContent).toBe('100');
  });

  it('never overshoots, because a changing metric is not a commit', () => {
    // Overshoot (`--e-snap`, 12% back-out) is rationed to a governed write landing. A
    // count that moved because a date range moved must not bounce, or the one piece of
    // motion in the app that means "this was committed" stops meaning it.
    const { rerender, container } = render(<CountUp value={0} />);
    rerender(<CountUp value={50} />);

    const seen: number[] = [];
    for (const ts of [0, 20, 40, 60, 80, 100, 120, 140, 159, 160]) {
      tick(ts);
      seen.push(Number(container.textContent));
    }

    expect(seen.some((v) => v > 0 && v < 50), 'nothing was interpolated').toBe(true);
    for (const v of seen) {
      expect(v, `overshot the target: ${seen.join(', ')}`).toBeLessThanOrEqual(50);
      expect(v, `dipped below the starting value: ${seen.join(', ')}`).toBeGreaterThanOrEqual(0);
    }
    // Monotone, so it settles rather than oscillating around the answer.
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  it('continues from what is on screen when the value changes mid-roll', () => {
    // Two range changes in quick succession. Seeding the second roll from the previous
    // PROP would restart it at 0 — the number visibly jumping backwards, which is rule 2
    // broken by a race instead of by an easing curve.
    const { rerender, container } = render(<CountUp value={0} />);
    rerender(<CountUp value={100} />);
    tick(0);
    tick(80);
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(0);

    rerender(<CountUp value={200} />);
    tick(200);
    expect(Number(container.textContent)).toBeGreaterThanOrEqual(mid);
    tick(400);
    expect(container.textContent).toBe('200');
  });

  it('does not jump BACKWARDS when the second change reverses direction', () => {
    /*
     * The assertion above was a decoration and this is why. Seeding the second roll from
     * the previous PROP instead of from `shownRef` survives it: with two rises, the
     * previous prop (100) sits ABOVE the number actually on screen (87.5), so a
     * prop-seeded restart jumps FORWARD and `>= mid` still holds. The bug it is supposed
     * to catch is a visible discontinuity, and only a reversal exposes it — roll DOWN
     * first, so the previous prop is BELOW what the operator can see, and a prop-seeded
     * restart has to jump backwards past it.
     */
    const { rerender, container } = render(<CountUp value={100} />);
    rerender(<CountUp value={0} />);
    tick(0);
    tick(80);
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    // Direction reverses mid-flight, as it does when a refresh lands while a range
    // change is still rolling.
    rerender(<CountUp value={50} />);
    const seen: number[] = [];
    for (const ts of [200, 240, 280, 320, 360] as const) {
      tick(ts);
      seen.push(Number(container.textContent));
    }
    for (const v of seen) {
      expect(
        v,
        `the count jumped back below what was on screen (${mid}): ${seen.join(', ')} — the ` +
          'roll restarted from the previous prop rather than from the displayed value',
      ).toBeGreaterThanOrEqual(mid);
    }
    expect(container.textContent).toBe('50');
  });

  it('formats every frame, not just the last one', () => {
    // The reason this is JS and not a CSS counter: `@property` can interpolate a number
    // and cannot format one, and every consumer here needs a separator or a unit.
    const { rerender, container } = render(
      <CountUp value={1000} format={(n) => `$${Math.round(n).toLocaleString()}`} />,
    );
    expect(container.textContent).toBe('$1,000');
    rerender(<CountUp value={2000} format={(n) => `$${Math.round(n).toLocaleString()}`} />);
    tick(0);
    tick(80);
    expect(container.textContent).toMatch(/^\$1,\d{3}$/);
  });

  it('takes its duration from the motion vocabulary, not from a number typed here', () => {
    // Phase D's ratchet reads stylesheets and Tailwind class names; it cannot see a
    // hardcoded `160` inside a `.tsx` file, which makes this the one animation in the app
    // whose adherence to the vocabulary is on the honour system. So the honour is
    // asserted: shorten `--t-state` and the roll must finish sooner.
    document.documentElement.style.setProperty('--t-state', '40ms');
    try {
      const { rerender, container } = render(<CountUp value={0} />);
      rerender(<CountUp value={10} />);
      tick(0);
      tick(40);
      expect(
        container.textContent,
        'still rolling at t=40ms with --t-state at 40ms — the duration is a literal, not the token',
      ).toBe('10');
    } finally {
      document.documentElement.style.removeProperty('--t-state');
    }
  });

  it('reads the value the BUILT stylesheet actually emits, which is `.16s` and not `160ms`', () => {
    /*
     * FOUND BY CHECKING THE ARTIFACT, NOT THE IDEA OF IT. `globals.css` is authored as
     * `--t-state: 160ms`, and every test above that touches the token writes `40ms`,
     * because that is what the source says. Loading the production build in Chromium and
     * asking for the computed value returns:
     *
     *     getComputedStyle(document.documentElement).getPropertyValue('--t-state') → ".16s"
     *
     * The CSS minifier rewrites the duration into its shortest legal form, so the branch
     * of `motionDurationMs` that runs in production is the SECONDS branch — the one the
     * `40ms` test never exercises. Had that branch been missing, `parseFloat('.16s')`
     * would have produced a 0.16ms animation: one frame, a snap, the feature silently
     * absent in the shipped app and green in every test. This asserts the real string.
     */
    document.documentElement.style.setProperty('--t-state', '.16s');
    try {
      const { rerender, container } = render(<CountUp value={0} />);
      rerender(<CountUp value={100} />);
      tick(0);
      tick(80);
      expect(
        Number(container.textContent),
        'already finished at t=80ms — `.16s` was parsed as 0.16ms, so the roll is a snap in production',
      ).toBeLessThan(100);
      tick(160);
      expect(container.textContent).toBe('100');
    } finally {
      document.documentElement.style.removeProperty('--t-state');
    }
  });

  it('keeps digits from reflowing the tile while they roll', () => {
    // `.num-hero`, the class on every stat tile that consumes this, uses PROPORTIONAL
    // digits on purpose ("tabular only in columns"). Proportional digits change width as
    // they change value, so a roll-up without this class reflows its own container on
    // most frames.
    const { container } = render(<CountUp value={5} />);
    expect(container.querySelector('span')).toHaveClass('num-tabular');
  });
});
