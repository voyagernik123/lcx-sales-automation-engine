import { beforeEach, describe, expect, it } from 'vitest';
import {
  COOLDOWN_MS,
  _resetNudges,
  adoption,
  dismissNudge,
  isAdopted,
  markShown,
  nudgeFor,
  recordUse,
} from '../nudge';

/**
 * The nudge engine's rules (TERMINAL Phase 6).
 *
 * Almost every test here asserts that the app STAYS QUIET, which is the right
 * proportion: a shortcut-suggesting feature is trivial to write and almost always
 * ends up switched off, because the failure is never "the suggestion was wrong" — it
 * is that being told the same thing eleven times costs you the operator's willingness
 * to read anything the app says again.
 *
 * `now` is passed explicitly rather than faking the clock, because the cooldown is a
 * rule about elapsed time and reading it from an argument makes the rule visible in
 * the test instead of hidden in a mock.
 */

const T0 = 1_000_000;
const CAP = 'go-ws-sales';

beforeEach(() => {
  localStorage.clear();
  _resetNudges();
});

/** Get the capability to the edge of eligibility: used twice, by mouse, never by key. */
function twoSlowUses() {
  recordUse(CAP, 'pointer');
  recordUse(CAP, 'pointer');
}

describe('when it teaches', () => {
  it('suggests the fast path after the mouse has been used twice', () => {
    twoSlowUses();
    const n = nudgeFor(CAP, T0);
    expect(n?.keys).toEqual(['g', '2']);
    expect(n?.what).toContain('SALES ENGINE');
  });

  it('says nothing on the very first mouse use', () => {
    // Doing something once with the mouse is how anyone finds a feature.
    // Interrupting that is the app correcting someone for exploring.
    recordUse(CAP, 'pointer');
    expect(nudgeFor(CAP, T0)).toBeNull();
  });

  it('says nothing for a capability with no known fast path', () => {
    recordUse('some-mouse-only-thing', 'pointer');
    recordUse('some-mouse-only-thing', 'pointer');
    expect(nudgeFor('some-mouse-only-thing', T0)).toBeNull();
  });
});

describe('when it goes quiet, which is most of the time', () => {
  it('never teaches a shortcut the operator has already used once', () => {
    // One successful use proves they know it exists. After that, using the mouse is
    // a choice, and correcting a choice is nagging.
    twoSlowUses();
    recordUse(CAP, 'keyboard');
    expect(nudgeFor(CAP, T0)).toBeNull();
  });

  it('gives up after three shown nudges', () => {
    twoSlowUses();
    for (let i = 0; i < 3; i++) markShown(CAP, T0 + i);
    // They have seen it three times and still use the mouse. That is an answer;
    // continuing would be the app arguing with them.
    expect(nudgeFor(CAP, T0 + COOLDOWN_MS * 10)).toBeNull();
  });

  it('treats an explicit dismissal as a full stop, not one of three', () => {
    twoSlowUses();
    dismissNudge(CAP, T0);
    // Clicking the × is a clearer answer than ignoring it. Honouring it is the
    // difference between a suggestion and a nag.
    expect(nudgeFor(CAP, T0 + COOLDOWN_MS * 10)).toBeNull();
  });

  it('holds a global cooldown, so five quick tasks do not produce five lessons', () => {
    twoSlowUses();
    markShown(CAP, T0);

    const other = 'go-ws-intel';
    recordUse(other, 'pointer');
    recordUse(other, 'pointer');
    // A DIFFERENT capability, well past its own eligibility — still silent, because
    // two suggestions in a row is a tutorial, which is the thing this phase is
    // explicitly designed not to be.
    expect(nudgeFor(other, T0 + COOLDOWN_MS - 1)).toBeNull();
    expect(nudgeFor(other, T0 + COOLDOWN_MS + 1)).not.toBeNull();
  });

  it('does not burn a cooldown slot for a nudge that was never rendered', () => {
    // `nudgeFor` is a question; `markShown` is the answer. A caller that asks and
    // then decides not to render must not silence the next one.
    twoSlowUses();
    expect(nudgeFor(CAP, T0)).not.toBeNull();
    expect(nudgeFor(CAP, T0)).not.toBeNull();
  });
});

describe('adoption', () => {
  it('counts two keyboard uses as adopted, one as not', () => {
    recordUse(CAP, 'keyboard');
    expect(isAdopted(CAP)).toBe(false);
    recordUse(CAP, 'keyboard');
    // One could be an accident or a misfire; two is a habit forming.
    expect(isAdopted(CAP)).toBe(true);
  });

  it('reports what is still done the slow way, worst first', () => {
    recordUse('go-ws-sales', 'pointer');
    recordUse('go-ws-sales', 'pointer');
    recordUse('go-ws-sales', 'pointer');
    recordUse('go-ws-intel', 'pointer');
    recordUse('command', 'keyboard');
    recordUse('command', 'keyboard');

    const rows = adoption();
    // Most-used-the-slow-way first: that is where a coach's attention belongs, and
    // showing an operator "you have never once used g" is more motivating than any
    // in-place nudge.
    expect(rows[0]).toMatchObject({ capability: 'go-ws-sales', slow: 3, adopted: false });
    expect(rows.find((r) => r.capability === 'command')).toMatchObject({ adopted: true });
  });

  it('starts empty rather than guessing', () => {
    expect(adoption()).toEqual([]);
    expect(isAdopted(CAP)).toBe(false);
  });
});

describe('durability', () => {
  it('survives a corrupt or older-shaped stored value', () => {
    // A hand-edited or migrated value must degrade to "teach me", never throw from
    // inside a click handler.
    localStorage.setItem('lcx-os:anon:teach:nudge:v1', JSON.stringify({ nonsense: true }));
    expect(() => recordUse(CAP, 'pointer')).not.toThrow();
    expect(() => nudgeFor(CAP, T0)).not.toThrow();
    expect(adoption).not.toThrow();
  });
});
