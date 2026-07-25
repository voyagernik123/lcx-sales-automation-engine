import { ADOPTED_AT, adoption } from './nudge';
import { fastPathFor } from './fastPath';

/**
 * The shortcut coach (TERMINAL T1 #21) — spaced repetition, PULLED not pushed.
 *
 * ── WHY THIS IS A PULL SURFACE, which is the only interesting decision in the file.
 *
 * The satisficing literature (IEEE, "Being Good Enough Is Good Enough") is the reason
 * this feature exists at all: operators plateau on a slower method and never transition,
 * expertise notwithstanding. Its follow-up ("Intermodal Improvement", Springer 2020) is
 * the reason the PUSH half of the answer already exists and is deliberately almost
 * silent — nudging at the moment of use is the only intervention that moves anyone, and
 * `lib/nudge.ts` is that, hedged with five separate rules about staying quiet.
 *
 * A drill that interrupts is therefore not an addition to the nudge engine, it is a
 * withdrawal from the same account. The engine's whole budget is the operator's
 * willingness to read one thing the app says; a coach that reviews you on Tuesdays
 * spends that budget and the nudge goes quiet with it. So this module computes and
 * ranks, and shows nothing until asked. `pages/Settings.tsx` is where it is asked.
 *
 * ── WHAT "SPACED REPETITION" MEANS HERE, and what it cannot mean.
 *
 * A flashcard scheduler knows when you last recalled a card and shows it again as the
 * interval expands. The analogue is exact for the interval and inexact for the recall:
 * we can see when a capability was last reached by keyboard and when it was last
 * reached by mouse, and nothing else. That turns out to be enough for the only two
 * signals worth acting on:
 *
 *   REGRESSED — adopted (≥2 keyboard uses) and then reached by MOUSE again. This is the
 *     honest forgetting signal, and it is much better than time alone: time-since-use
 *     cannot tell "I forgot the key" from "I have not needed that workspace this month",
 *     and a coach that confuses the two is lecturing you about something you did right.
 *   RUSTY — adopted, no mouse fallback since, but quiet for longer than its review
 *     interval, which EXPANDS with how well established the habit is (the Leitner box).
 *     Ranked below regression, and phrased as an observation, never a deadline.
 *
 * ── HONEST COMPETENCE, AND ONE CLAIM WITHDRAWN.
 *
 * The plan asks for "their median time-to-decision, commands mastered, slow-path
 * fallbacks remaining". The last two are computable from the ledger and are here.
 * TIME-TO-DECISION IS NOT, and is not faked: nothing in this app times the interval
 * between opening a decision and committing it. `recordUse` gets a capability and a
 * route, not a duration, and the two call sites that could start a clock are owned by
 * other streams this run. So the competence numbers here are keyboard share, mastered
 * count and remaining slow fallbacks — all measured — and the median is left unbuilt
 * rather than approximated by something that sounds like it.
 *
 * ── NO DARK PATTERNS, ENCODED RATHER THAN PROMISED.
 *
 * No streaks, no guilt, no urgency, no variable reward. The specific trap for a
 * spaced-repetition feature is a number that DECAYS while you are away, because decay
 * is what makes review feel mandatory. Nothing here decays: pass any `now` you like and
 * every REPORTED FIGURE — `tracked`, `mastered`, `slowFallbacks`, `keyboardShare` — comes
 * out the same. `__tests__/coach.test.ts` asserts that as an invariant, because it is the
 * one property that a future "helpful" edit would break first.
 *
 * `cards` is the deliberate exception and the wording above used to blur it: a `rusty`
 * card does appear from the passage of time alone, which is what the review interval IS.
 * The distinction that matters is that time can add an observation to a list the operator
 * chose to open, and cannot subtract from anything they have earned.
 */

/**
 * How many cards the coach will ever return.
 *
 * The brief is "the 20% of commands worth 80% of your speed", and the honest way to
 * implement a Pareto slice is to rank and truncate rather than to list everything and
 * call the top of the list important. Three is also about what a person will actually
 * read in a settings panel they opened for another reason.
 */
export const PARETO_LIMIT = 3;

/**
 * Review intervals by Leitner box, in ms. The better established the habit, the longer
 * before its absence is worth mentioning — a capability used by keyboard fifteen times
 * does not need a mention after two days.
 *
 * Deliberately coarse and deliberately long. These are shortcuts on an internal
 * instrument, not vocabulary for an exam: at these intervals a working week of ordinary
 * use produces no cards at all, which is the intended output.
 */
const DAY = 24 * 60 * 60 * 1000;
export const REVIEW_INTERVALS_MS = [3 * DAY, 10 * DAY, 30 * DAY, 90 * DAY];

/** Where the operator stands on one capability. */
export type Standing =
  /** Fewer than two keyboard uses. Not a failure — most capabilities start here. */
  | 'learning'
  /** Two or more keyboard uses, most recent route was the keyboard. */
  | 'adopted'
  /** Adopted, then reached by mouse again. The forgetting signal. */
  | 'regressed'
  /** Adopted, still theirs, but quiet for longer than its review interval. */
  | 'rusty';

export interface CoachCard {
  capability: string;
  /** From `fastPathFor`, so the coach and the manual say the same thing about a key. */
  keys: string[];
  what: string;
  standing: Standing;
  slow: number;
  fast: number;
  /** ms since the last keyboard use; null when that is genuinely unknown (see below). */
  quietFor: number | null;
}

export interface CoachReport {
  /** At most `PARETO_LIMIT`, worst first. Empty is a normal and good answer. */
  cards: CoachCard[];
  /** Capabilities with a fast path that this operator has touched at all. */
  tracked: number;
  /** Of those, the ones they have adopted and not regressed on. */
  mastered: number;
  /** Pointer uses still being spent on capabilities they have not adopted. */
  slowFallbacks: number;
  /** Share of all recorded uses that went by keyboard, 0..1. Self-referential by construction. */
  keyboardShare: number;
}

/**
 * The review interval for a capability with `fast` keyboard uses behind it.
 *
 * Exported for the test, which pins the expansion rather than trusting the array to
 * stay sorted.
 */
export function reviewIntervalMs(fast: number): number {
  const box = Math.min(Math.max(fast - ADOPTED_AT, 0), REVIEW_INTERVALS_MS.length - 1);
  return REVIEW_INTERVALS_MS[box]!;
}

/**
 * What the coach would say if asked right now, or null if it should render nothing.
 *
 * Null means "this operator has no history with any capability that has a fast path" —
 * day one, or a fresh machine. A table of zeroes then would be a tutorial with extra
 * steps, and it would teach the operator that this screen is where learning happens
 * when the actual claim of the phase is that the app teaches in the middle of the work.
 * `pages/Settings.tsx` renders nothing at all on null.
 *
 * PURE. It reads the ledger and never writes to it, which is not a stylistic
 * preference: `markShown` is what burns the nudge engine's ten-minute cooldown and its
 * three-strikes count, so a coach that recorded "I showed you this" would silence the
 * in-place nudge — the intervention the research says is the only one that works — as a
 * side effect of the operator opening Settings.
 *
 * `now` is a parameter for the same reason it is one in `nudge.ts`: the rules are about
 * elapsed time, and reading it from an argument keeps the rule visible in the test
 * instead of hidden in a clock mock.
 */
export function coachReport(now: number = Date.now()): CoachReport | null {
  const rows = adoption()
    // Only capabilities with a KNOWN fast path. Listing something there is no faster
    // way to do is a scold with no remedy attached.
    .map((r) => ({ ...r, path: fastPathFor(r.capability) }))
    .filter((r) => r.path !== null && r.slow + r.fast > 0);

  if (rows.length === 0) return null;

  const cards: CoachCard[] = [];
  let mastered = 0;
  let slowFallbacks = 0;
  let slowTotal = 0;
  let fastTotal = 0;

  for (const r of rows) {
    slowTotal += r.slow;
    fastTotal += r.fast;

    const adoptedEver = r.fast >= ADOPTED_AT;
    if (!adoptedEver) slowFallbacks += r.slow;

    // 0 is "not recorded", NOT epoch 1970. A ledger written before this phase carries
    // no stamps, and reading a missing stamp as 56 years ago would greet an upgrading
    // operator with every mastered capability marked rusty — the app forgetting what
    // they know, dressed up as them forgetting it.
    const quietFor = r.lastFastAt > 0 ? Math.max(0, now - r.lastFastAt) : null;
    const wentBackToTheMouse = adoptedEver && r.lastSlowAt > 0 && r.lastSlowAt > r.lastFastAt;
    const isRusty =
      adoptedEver && !wentBackToTheMouse && quietFor !== null && quietFor >= reviewIntervalMs(r.fast);

    const standing: Standing = !adoptedEver
      ? 'learning'
      : wentBackToTheMouse
        ? 'regressed'
        : isRusty
          ? 'rusty'
          : 'adopted';

    if (adoptedEver && standing !== 'regressed') mastered += 1;

    // WHAT IS WORTH RESURFACING. `adopted` never produces a card: telling someone
    // about a key they used correctly this morning is the nag this whole design is
    // arranged to avoid.
    //
    // And a capability the operator is still LEARNING never produces a card on one slow
    // use. Doing something once with the mouse is how anyone finds a feature; the nudge
    // engine refuses to interrupt that (`nudgeFor`: `if (r.slow < 2) return null`) and
    // the pull surface must not contradict it, or the operator gets corrected for
    // exploring in the one place they went looking for help.
    //
    // THAT FLOOR IS SCOPED TO `learning` DELIBERATELY, and this comment used to overstate
    // it as covering every standing. One mouse use on a capability they have ALREADY
    // adopted does card, as `regressed`, and that is right for the opposite reason:
    // there is no exploration left to protect on a key they have used twice, so a
    // fallback there is signal rather than discovery.
    const worthResurfacing =
      standing === 'regressed' || standing === 'rusty' || (standing === 'learning' && r.slow >= 2);

    if (worthResurfacing) {
      cards.push({
        capability: r.capability,
        keys: r.path!.keys,
        what: r.path!.what,
        standing,
        slow: r.slow,
        fast: r.fast,
        quietFor,
      });
    }
  }

  // Regression first — they had this and lost it, which is both the strongest signal
  // and the cheapest thing to fix. Then active friction (learning, still reaching for
  // the mouse right now). Rusty last: "you have not used this lately" is the weakest
  // of the three claims and the one most likely to be about their week rather than
  // about their skill.
  const RANK: Record<Standing, number> = { regressed: 0, learning: 1, rusty: 2, adopted: 3 };
  cards.sort((a, b) => RANK[a.standing] - RANK[b.standing] || b.slow - a.slow || a.capability.localeCompare(b.capability));

  const uses = slowTotal + fastTotal;

  return {
    cards: cards.slice(0, PARETO_LIMIT),
    tracked: rows.length,
    mastered,
    slowFallbacks,
    keyboardShare: uses > 0 ? fastTotal / uses : 0,
  };
}
