import { beforeEach, describe, expect, it } from 'vitest';
import { PARETO_LIMIT, REVIEW_INTERVALS_MS, coachReport, reviewIntervalMs } from '../coach';
import { COOLDOWN_MS, _resetNudges, dismissNudge, nudgeFor, recordUse } from '../nudge';

/**
 * The shortcut coach (TERMINAL T1 #21).
 *
 * Most of this file is about what the coach REFUSES to say, for the same reason most of
 * `nudge.test.ts` is: the failure mode of a shortcut coach is never a wrong suggestion,
 * it is being told the same thing until you stop reading anything the app says. The
 * coach spends the same budget the nudge engine spends, so it inherits the same
 * restraint, and the four assertions that matter here are:
 *
 *   · it says nothing at all until there is something to say
 *   · it never corrects a first slow use (the nudge engine's rule, mirrored)
 *   · reading it does not silence the nudge engine (pull, not push)
 *   · nothing decays with time — no counter goes down while you are away
 *
 * `now` is passed explicitly everywhere rather than faking the clock, so the interval
 * rules are legible in the test instead of hidden in a mock.
 */

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** Two capabilities that have a real fast path, and one that does not. */
const SALES = 'go-ws-sales';
const INTEL = 'go-ws-intel';
const NO_FAST_PATH = 'some-mouse-only-thing';

beforeEach(() => {
  localStorage.clear();
  _resetNudges();
});

describe('what it shows, and when it shows nothing', () => {
  it('renders nothing on day one rather than a table of zeroes', () => {
    // A pull surface that greets a new operator with an empty scoreboard has taught
    // them that this screen is where learning happens — when the claim of the phase is
    // that the app teaches in the middle of the work.
    expect(coachReport(T0)).toBeNull();
  });

  it('stays silent for capabilities that have no faster way to do them', () => {
    recordUse(NO_FAST_PATH, 'pointer', T0);
    recordUse(NO_FAST_PATH, 'pointer', T0 + 1);
    // Naming something with no shortcut is a scold with no remedy attached.
    expect(coachReport(T0 + 2)).toBeNull();
  });

  it('cards a capability still being reached with the mouse, with the key that fixes it', () => {
    recordUse(SALES, 'pointer', T0);
    recordUse(SALES, 'pointer', T0 + 1000);

    const report = coachReport(T0 + 2000)!;
    expect(report.cards).toHaveLength(1);
    expect(report.cards[0]).toMatchObject({
      capability: SALES,
      standing: 'learning',
      keys: ['g', '2'],
      slow: 2,
    });
    // Shared wording with the manual and the nudge, so one key never gets described
    // two different ways.
    expect(report.cards[0]!.what).toContain('SALES ENGINE');
  });

  it('never cards a capability on its first slow use', () => {
    // THE RESTRAINT RULE, mirrored from `nudgeFor` (`if (r.slow < 2) return null`).
    // Doing something once with the mouse is how anyone finds a feature. The push
    // surface refuses to interrupt that; the pull surface must not contradict it, or an
    // operator who came here for help gets corrected for exploring.
    recordUse(SALES, 'pointer', T0);

    const report = coachReport(T0 + 1)!;
    expect(report).not.toBeNull();
    expect(
      report.cards,
      'one mouse use produced a card — the coach is now correcting exploration',
    ).toEqual([]);
    // But the capability still counts as tracked, so the honest numbers include it.
    expect(report.tracked).toBe(1);
  });

  it('says nothing about a shortcut the operator used correctly this morning', () => {
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1000);

    const report = coachReport(T0 + 2000)!;
    expect(report.cards).toEqual([]);
    expect(report.mastered).toBe(1);
  });

  it('shows at most three cards, because the point is the 20% that matters', () => {
    const many = ['go-desk', 'go-ws-command', SALES, INTEL, 'go-ws-regulatory', 'go-ws-distribution'];
    many.forEach((cap, i) => {
      recordUse(cap, 'pointer', T0 + i * 10);
      recordUse(cap, 'pointer', T0 + i * 10 + 1);
    });

    const report = coachReport(T0 + 10_000)!;
    expect(report.cards).toHaveLength(PARETO_LIMIT);
    // Ranked, not truncated arbitrarily: everything here is `learning`, so the
    // tie-break is how much mouse work is being spent.
    expect(report.tracked).toBe(many.length);
  });
});

describe('spaced repetition', () => {
  it('calls it a regression when an adopted shortcut is reached by mouse again', () => {
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1000);
    recordUse(SALES, 'pointer', T0 + 2000);
    recordUse(SALES, 'pointer', T0 + 3000);

    const report = coachReport(T0 + 4000)!;
    expect(report.cards[0]).toMatchObject({ capability: SALES, standing: 'regressed' });
    // They had it and lost it, so they are no longer counted as having mastered it —
    // the number tracks the truth rather than the high-water mark.
    expect(report.mastered).toBe(0);
  });

  it('ranks a regression above active friction and both above rust', () => {
    // Regressed: adopted, then back to the mouse.
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1);
    recordUse(SALES, 'pointer', T0 + 2);
    // Learning: lots of mouse, never a key.
    recordUse('go-desk', 'pointer', T0);
    recordUse('go-desk', 'pointer', T0 + 1);
    recordUse('go-desk', 'pointer', T0 + 2);
    // Rusty: adopted and quiet, never regressed.
    recordUse(INTEL, 'keyboard', T0);
    recordUse(INTEL, 'keyboard', T0 + 1);

    const report = coachReport(T0 + 60 * DAY)!;
    expect(report.cards.map((c) => c.standing)).toEqual(['regressed', 'learning', 'rusty']);
  });

  it('expands the review interval as the habit gets more established', () => {
    // The Leitner box. A key used fifteen times does not need mentioning after three
    // days; a key used exactly twice might.
    expect(reviewIntervalMs(2)).toBe(REVIEW_INTERVALS_MS[0]);
    expect(reviewIntervalMs(3)).toBe(REVIEW_INTERVALS_MS[1]);
    expect(reviewIntervalMs(99)).toBe(REVIEW_INTERVALS_MS[REVIEW_INTERVALS_MS.length - 1]);
    for (let i = 1; i < REVIEW_INTERVALS_MS.length; i++) {
      expect(REVIEW_INTERVALS_MS[i]!).toBeGreaterThan(REVIEW_INTERVALS_MS[i - 1]!);
    }
  });

  it('does not call a shortcut rusty until its own interval has actually elapsed', () => {
    recordUse(INTEL, 'keyboard', T0);
    recordUse(INTEL, 'keyboard', T0 + 1);

    const due = T0 + 1 + reviewIntervalMs(2);
    expect(coachReport(due - 1)!.cards).toEqual([]);
    expect(coachReport(due)!.cards[0]).toMatchObject({ standing: 'rusty' });
  });

  it('does not read a ledger written before timestamps existed as rust', () => {
    // Every stored ledger from Phase 6 has slow/fast/shown counts and no stamps.
    // Treating a missing stamp as epoch 0 would greet an upgrading operator with every
    // capability they have mastered marked forgotten — the app forgetting what they
    // know, dressed up as them forgetting it.
    localStorage.setItem(
      'lcx-os:anon:teach:nudge:v1',
      JSON.stringify({ lastShownAt: 0, ledger: { [INTEL]: { slow: 0, fast: 4, shown: 0 } } }),
    );

    const report = coachReport(T0 + 5 * 365 * DAY)!;
    expect(report.cards).toEqual([]);
    expect(report.mastered).toBe(1);
  });
});

describe('honest competence', () => {
  it('counts mastery, remaining slow fallbacks and keyboard share from real uses only', () => {
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1);
    recordUse(INTEL, 'pointer', T0 + 2);
    recordUse(INTEL, 'pointer', T0 + 3);
    recordUse(INTEL, 'pointer', T0 + 4);

    const report = coachReport(T0 + 5)!;
    expect(report.tracked).toBe(2);
    expect(report.mastered).toBe(1);
    // Three pointer uses on a capability they have not adopted. Not a score out of ten,
    // not a grade — the count of times the slow path was taken.
    expect(report.slowFallbacks).toBe(3);
    expect(report.keyboardShare).toBeCloseTo(2 / 5);
  });

  it('counts slow fallbacks only on capabilities NOT yet adopted', () => {
    /*
     * The assertion above cannot see this. There, the only capability with pointer uses
     * was also the only unadopted one, so "all slow uses" and "slow uses on unadopted
     * capabilities" are the same number and dropping the `!adoptedEver` guard changes
     * nothing. The footer says "N mouse trips left ON THE REST", so an adopted
     * capability's mouse use must not be counted: the operator who reaches for the mouse
     * once on a shortcut they own has not added to the work they have left to do.
     */
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1);
    recordUse(SALES, 'pointer', T0 + 2); // adopted, and a pointer use anyway
    recordUse(INTEL, 'pointer', T0 + 3);
    recordUse(INTEL, 'pointer', T0 + 4);

    const report = coachReport(T0 + 5)!;
    expect(
      report.slowFallbacks,
      'a mouse use on an ADOPTED shortcut was counted as a fallback left to eliminate',
    ).toBe(2);
  });

  it('reports no median time-to-decision, because nothing measures one', () => {
    recordUse(SALES, 'keyboard', T0);
    const report = coachReport(T0 + 1)!;
    // The plan asks for the operator's median time-to-decision. Nothing in this app
    // times the interval between opening a decision and committing it — `recordUse`
    // receives a capability and a route, never a duration. So the claim is withdrawn
    // rather than approximated: no field here may imply a latency the app never
    // measured, and this assertion fails the day one is added without the timer.
    expect(Object.keys(report).sort()).toEqual([
      'cards',
      'keyboardShare',
      'mastered',
      'slowFallbacks',
      'tracked',
    ]);
  });
});

describe('no dark patterns', () => {
  it('lets nothing decay: idle time alone changes not one number', () => {
    // THE ANTI-URGENCY INVARIANT, and the specific trap for a spaced-repetition
    // feature. A score that drains while you are away is what makes review feel
    // mandatory, and mandatory review on an internal decision instrument buys more
    // opens and worse decisions. The only thing that may move these numbers is
    // something the operator actually did.
    recordUse(SALES, 'keyboard', T0);
    recordUse(SALES, 'keyboard', T0 + 1);
    recordUse(INTEL, 'pointer', T0 + 2);
    recordUse(INTEL, 'pointer', T0 + 3);

    const today = coachReport(T0 + 4)!;
    const nextYear = coachReport(T0 + 365 * DAY)!;

    for (const field of ['tracked', 'mastered', 'slowFallbacks', 'keyboardShare'] as const) {
      expect(nextYear[field], `${field} changed with nothing but the passage of time`).toBe(
        today[field],
      );
    }
  });

  it('does not silence the nudge engine by being read', () => {
    // `markShown` is what burns the ten-minute cooldown and the three-strikes count. A
    // coach that recorded "I showed you this" would switch off the in-place nudge — the
    // one intervention the research says converts anybody — as a side effect of the
    // operator opening Settings.
    recordUse(SALES, 'pointer', T0);
    recordUse(SALES, 'pointer', T0 + 1);
    expect(nudgeFor(SALES, T0 + 2)).not.toBeNull();

    for (let i = 0; i < 5; i++) coachReport(T0 + 3 + i);

    expect(
      nudgeFor(SALES, T0 + 10),
      'reading the coach silenced the nudge engine — the pull surface is writing to the ledger',
    ).not.toBeNull();
    // And it did not move the cooldown either, which a write would have done.
    expect(nudgeFor(INTEL, T0 + 11)).toBeNull(); // INTEL has no slow uses yet, so still null
    recordUse(INTEL, 'pointer', T0 + 12);
    recordUse(INTEL, 'pointer', T0 + 13);
    expect(nudgeFor(INTEL, T0 + 14)).not.toBeNull();
    expect(COOLDOWN_MS).toBeGreaterThan(0);
  });

  it('still lists a capability whose nudge was dismissed, because this surface was asked for', () => {
    // Deliberate asymmetry. Dismissing the in-place nudge is an answer to being
    // interrupted, and it is honoured there permanently. It is not an instruction to
    // hide the information from the operator who later goes looking for it — that would
    // make the dismissal a trap.
    recordUse(SALES, 'pointer', T0);
    recordUse(SALES, 'pointer', T0 + 1);
    dismissNudge(SALES, T0 + 2);

    expect(nudgeFor(SALES, T0 + 3)).toBeNull();
    expect(coachReport(T0 + 4)!.cards[0]).toMatchObject({ capability: SALES });
  });
});
