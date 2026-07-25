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

  /**
   * WHEN each route was last taken (added for the coach, T1 #21).
   *
   * Stamped here rather than at the call sites because the two places that produce this
   * data — `components/layout/Sidebar.tsx` and `hooks/useGoGrammar.ts` — are owned by
   * other streams in this run, and because `recordUse` already knew the moment and was
   * throwing it away. The coach needs it to tell "went back to the mouse" apart from
   * "has not needed that workspace lately", which is the difference between a useful
   * observation and a lecture about something the operator did right.
   */
  it('stamps only the route that was actually taken', () => {
    recordUse(CAP, 'pointer', T0);
    expect(adoption()[0]).toMatchObject({ lastSlowAt: T0, lastFastAt: 0 });

    recordUse(CAP, 'keyboard', T0 + 500);
    // The pointer stamp must survive a later keyboard use, or "adopted, then went back
    // to the mouse" becomes unrecoverable.
    expect(adoption()[0]).toMatchObject({ lastSlowAt: T0, lastFastAt: T0 + 500 });
  });

  it('reports 0, not epoch 1970, for a route never taken', () => {
    // 0 is the coach's "unknown", and it has to be distinguishable from a real stamp:
    // a ledger written before this phase has no stamps at all, and reading those as 56
    // years ago would mark every mastered capability forgotten on upgrade.
    recordUse(CAP, 'keyboard', T0);
    expect(adoption()[0]!.lastSlowAt).toBe(0);
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

describe('when the browser refuses to persist', () => {
  /**
   * The Phase 7 audit measured this: a capability already at two PERSISTED slow uses
   * produced **50 nudges in 50 pointer uses**, because `markShown` could not write the
   * cooldown or the shown-count, so every call re-read a ledger that never advanced. The
   * feature whose entire design is "stay quiet" became a nag — in private browsing or on
   * a full quota, i.e. exactly where an operator cannot explain why.
   *
   * The cause was a lie in `persistence.ts`: its `set` catch said "in-memory only" and
   * there was no in-memory anything.
   */
  function refuseWrites(): () => void {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function denied() {
      throw new DOMException('QuotaExceededError');
    };
    return () => {
      Storage.prototype.setItem = real;
    };
  }

  it('still shows at most one nudge across fifty pointer uses', () => {
    // Prime the ledger on disk first, so the precondition matches the audit's exactly.
    recordUse(CAP, 'pointer');
    recordUse(CAP, 'pointer');

    const restore = refuseWrites();
    try {
      let shown = 0;
      for (let i = 0; i < 50; i++) {
        const n = nudgeFor(CAP, T0 + i * 10);
        if (n) {
          markShown(CAP, T0 + i * 10);
          shown++;
        }
        recordUse(CAP, 'pointer');
      }
      // One inside the cooldown window. Before the in-memory tier this was 50.
      expect(shown, `${shown} nudges in 50 uses — the cooldown is not being retained`).toBe(1);
    } finally {
      restore();
    }
  });

  it('reads back a value written while persistence was failing', () => {
    const restore = refuseWrites();
    try {
      recordUse('memory-only-capability', 'keyboard');
      recordUse('memory-only-capability', 'keyboard');
      // Two keyboard uses is adoption. If the write vanished, this is false and the
      // engine would keep teaching a shortcut the operator has demonstrably adopted.
      expect(isAdopted('memory-only-capability')).toBe(true);
    } finally {
      restore();
    }
  });
});
