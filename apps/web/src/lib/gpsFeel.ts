import { ApiError } from '@/lib/apiClient';
import { announce } from '@/lib/juice';
import { feedback } from '@/lib/feedback';
import { prefersReducedMotion } from '@/lib/motion';
import type { MarginVerdict, UnderwriteVerdict } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GPS — THE THREE OUTCOMES, AS THREE FEELS (Phase 11, the instrument pass)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG. `GpsUnderwriting.tsx` prints a refusal as a headline and a
 * `MarginDistribution` as a band, and both arrive with EXACTLY the same silence:
 * the operator presses Compute, something re-renders, and nothing about the
 * moment says which of the two happened. An instrument whose "no" is
 * indistinguishable from its "yes" until you read it is the thing that made this
 * front end read as slop. The asymmetry is the point of this module.
 *
 * THREE OUTCOMES, BECAUSE THERE ARE THREE. `underwrite.ts:291` calls seven of its
 * eight verdicts refusals and `shouldBlockIssue` blocks all seven — correctly, as
 * a RULE. As a FEELING they are not one thing. `refused_currency_mismatch` is the
 * instrument stopping the operator on facts that are on record. But
 * `refused_price_not_set` fires because the offer band is still the shipped
 * placeholder (`catalogue.ts`, `PRICE_BANDS_ARE_PLACEHOLDERS`) — a gap in what the
 * FOUNDER has supplied, not a thing the operator did. Shaking the screen at
 * someone for a missing input they cannot supply is the app scolding them for its
 * own empty shelf, so absent data gets its own, calmer feel.
 *
 *   committed     the action reached its conclusion and the system produced it.
 *   refused       a rule stopped it, applied to facts that ARE on record.
 *   undetermined  no conclusion was reached because a required input is NOT on
 *                 record. "We could not tell", said as such.
 *
 * `undetermined` IS A SOFTER FEEL AND NEVER A SOFTER RULE. Nothing here grants
 * anything: `shouldBlockIssue` (`underwrite.ts:1330`) still blocks all seven
 * verdicts, this module has no permission-shaped export, and the only difference
 * between the second and third outcome is which reaction the operator gets.
 *
 * IT DOES NOT GRADE THE NEWS, ONLY WHETHER THE INSTRUMENT ANSWERED. A
 * `margin_negative` verdict gets the same landed feel as `margin_intact`, and
 * that is deliberate: a falling cue for bad NEWS would be indistinguishable from
 * a falling cue for a REFUSAL, and refusal-versus-answer is the distinction an
 * operator cannot recover from the screen alone. How bad the answer is belongs to
 * the numbers and to `feedback.became(el, 'blocked')`, which is ambient by design.
 *
 * ── WHAT THIS MODULE OWNS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
 *
 * It owns the DECISION: verdict → outcome → which reaction. It owns no DOM, no
 * class, no timer, no animation and no policy about the four juice kinds, the two
 * synthesised cues or the haptic patterns. That policy lives in
 * `lib/feedback.ts`, which is the single entry point per event for the whole app,
 * and this module goes THROUGH it — `commit` / `refuse` / `refuseQuiet` /
 * `became`. `GpsSignal.channel` therefore names a feedback.ts entry point rather
 * than restating what that entry point plays; a local copy of "commit means snap
 * plus a rising cue plus an alignment tap" is a copy that would drift.
 *
 * NOTHING HERE BECOMES ON BY DEFAULT. The two opt-in channels keep the defaults
 * `feedback.ts:57` sets (sound OFF, haptics ON since ALIVE Phase 0) and this
 * module never reads or writes a `FeelPrefs` key. It adds no new channel of its
 * own, so there is no new default to get wrong — the third feel is composed
 * entirely from reactions that already shipped.
 *
 * REDUCED MOTION. This module never animates, so there is nothing here to animate
 * through: it starts no transition, sets no duration, and calls no
 * `scrollIntoView`. The class-toggling is `juice.ts`'s and the stylesheet collapses
 * every juice animation to 0.01ms under `prefers-reduced-motion: reduce`
 * (`globals.css:515`), which has a consequence worth being blunt about — with the
 * setting on, NO visual channel survives. A snap is 0.01ms, a shake is 0.01ms, and
 * a flash's `background-color` never reaches its 18% keyframe. That is why `speak`
 * is NEVER null on any of the three signals: with motion suppressed, sound off by
 * default and haptics absent outside the Tauri shell, the live region is the only
 * channel left that can tell the three outcomes apart. `motionSuppressed` is
 * reported so a caller doing JS-timed work — a count roll-up, a sweep — can skip
 * the work rather than compute a frame nobody sees; it deliberately does not change
 * the channel, because a second reduced-motion policy sitting next to the
 * stylesheet's is how the first one rots.
 */

/** The three things an operator needs to be able to tell apart without reading. */
export type GpsOutcome = 'committed' | 'refused' | 'undetermined';

/** Which `feedback.ts` entry point owns the reaction. Never a juice kind: see above. */
export type GpsChannel = 'commit' | 'refuse' | 'refuseQuiet' | 'became';

export interface GpsSignal {
  readonly outcome: GpsOutcome;
  readonly channel: GpsChannel;
  /** Only meaningful on `became`, which is the one channel that takes a tint. */
  readonly tint: 'live' | 'blocked' | 'warn' | 'info' | null;
  /**
   * Never null on any outcome. With reduced motion on, this is the only channel
   * that distinguishes the three — see the header.
   */
  readonly speak: 'polite' | 'assertive';
  /** What will be said. The caller's sentence when it has one, else the fallback. */
  readonly sentence: string;
  /** True when the OS asked for less motion. Reported, not acted on. See the header. */
  readonly motionSuppressed: boolean;
}

/**
 * What gets said when the caller has no sentence of its own.
 *
 * A REFUSAL HAS NO FALLBACK, and that is the same decision `feedback.refuseQuiet`
 * made for the same reason: the remedy prose lives with the surface that knows
 * which rule fired, and a generic "that was refused" announced over the top of it
 * would be worse prose crowding out the real one. A caller with no reason gets the
 * shake and the falling cue and stays quiet, so whoever holds the words can speak.
 */
const FALLBACK_SENTENCE: Record<'committed' | 'undetermined', string> = {
  committed: 'Committed.',
  undetermined: 'Not determined. Nothing was written, and nothing is claimed either way.',
};

const CHANNEL: Record<GpsOutcome, { channel: GpsChannel; tint: GpsSignal['tint']; speak: GpsSignal['speak'] }> = {
  /** Polite, not assertive: a landed write is good news, and good news that interrupts is nagging. */
  committed: { channel: 'commit', tint: null, speak: 'polite' },
  /** The one assertive announcement. It is the governed write that did NOT happen. */
  refused: { channel: 'refuse', tint: null, speak: 'assertive' },
  /**
   * `became`, not a refusal: absent data is a state the surface is IN, not a thing
   * the operator did. Amber rather than red because none of the three feels may be
   * alarming, and red is this app's word for blocked.
   */
  undetermined: { channel: 'became', tint: 'warn', speak: 'polite' },
};

/**
 * Decide what to signal. Pure — no DOM, no side effect, safe on the server.
 *
 * `motionSuppressed` is injectable because jsdom evaluates no media query, so the
 * reduced-motion behaviour would otherwise be untestable rather than merely
 * untested.
 */
export function gpsSignal(
  outcome: GpsOutcome,
  opts: { sentence?: string | null; motionSuppressed?: boolean } = {},
): GpsSignal {
  const spec = CHANNEL[outcome];
  const given = opts.sentence?.trim();
  const sentence = given && given.length > 0 ? given : outcome === 'refused' ? '' : FALLBACK_SENTENCE[outcome];
  return {
    outcome,
    // A refusal with no reason downgrades to the quiet variant rather than
    // inventing prose. Whitespace counts as no reason: `announce('   ')` is a live
    // region that changed and said nothing.
    channel: outcome === 'refused' && sentence === '' ? 'refuseQuiet' : spec.channel,
    tint: spec.tint,
    speak: spec.speak,
    sentence,
    motionSuppressed: opts.motionSuppressed ?? prefersReducedMotion(),
  };
}

/**
 * Fire the reaction for an outcome, and return what was fired.
 *
 * The element is the thing the outcome HAPPENED to — the row, the figure, the
 * Compute button — and may be null, exactly as every `feedback.*` call site may.
 * Returned rather than void so a test can assert the asymmetry at the call site
 * and not only in the table.
 *
 * Announce on commit as well, which `juice.commit` does not: with reduced motion
 * on, the snap is 0.01ms and an operator who cannot see the row change has no way
 * at all to know the write landed. Once for the sighted case, and the polite live
 * region is where it belongs.
 */
export function signalGps(el: Element | null | undefined, outcome: GpsOutcome, sentence?: string | null): GpsSignal {
  const signal = gpsSignal(outcome, { sentence });
  switch (signal.channel) {
    case 'commit':
      feedback.commit(el);
      announce(signal.sentence, 'polite');
      break;
    case 'refuse':
      feedback.refuse(el, signal.sentence);
      break;
    case 'refuseQuiet':
      feedback.refuseQuiet(el);
      break;
    case 'became':
      feedback.became(el, 'warn');
      announce(signal.sentence, 'polite');
      break;
  }
  return signal;
}

/* ── verdict → outcome ────────────────────────────────────────────────────────
 *
 * THE RULE THESE TABLES APPLY, ONCE, IN WORDS: `refused` when the facts needed to
 * decide are on record and a rule says no; `undetermined` when the facts are not
 * on record at all. Every row carries `because` — the reason IN the row, in the
 * manner of `marketingGrammar.ts`'s `MarketingNounReach`, because a classification
 * whose justification lives in a docblock is one nobody can check row by row.
 *
 * `because` is a REASON, not remedy prose. It is short enough to sit inside a
 * caller's sentence and is not a substitute for the engine's own `reasons[]`,
 * which are longer, specific to the instance, and the thing the surface prints.
 *
 * EXHAUSTIVENESS IS THE COMPILER'S JOB, not a runtime test's: both tables are
 * `Record<Verdict, …>` over a type-only import, so a new verdict in
 * `underwrite.ts` or `partners.ts` fails `tsc` here. That costs zero bytes —
 * `import type` is erased, and neither engine is pulled into the web bundle.
 */

interface Classified {
  readonly outcome: GpsOutcome;
  readonly because: string;
}

const UNDERWRITE: Record<UnderwriteVerdict, Classified> = {
  underwritten: { outcome: 'committed', because: 'the simulation produced a distribution' },

  // Facts on record, and a rule says no.
  refused_currency_mismatch: {
    outcome: 'refused',
    because: 'the quote and the rate card are in different currencies, and GPS never converts one into the other',
  },
  refused_rate_card_expired: {
    outcome: 'refused',
    because: 'the rate card has a validity date and it has passed',
  },

  // The input needed is not on record. Four of these five are the founder's to
  // supply, not the operator's — see the header on why they must not shake.
  refused_price_not_set: {
    outcome: 'undetermined',
    because: 'no usable price is on record for this offer, so there is nothing to underwrite against',
  },
  refused_rate_card_no_validity_stated: {
    outcome: 'undetermined',
    because: 'the rate card states no validity date, so whether it is current cannot be judged',
  },
  refused_hours_per_day_not_stated: {
    outcome: 'undetermined',
    because: 'an hourly card cannot become a day rate without hours per day, and GPS never assumes a working day',
  },
  refused_rate_not_derivable: {
    outcome: 'undetermined',
    because: 'the card amount does not price a single unit, so no cost per day can be derived from it',
  },
  refused_effort_is_zero: {
    outcome: 'undetermined',
    because: 'the effort triple is zero, so there is no work for a cost to be sampled over',
  },
};

const MARGIN: Record<MarginVerdict, Classified> = {
  // All three answered. The feel does not grade the news — see the header.
  margin_intact: { outcome: 'committed', because: 'the rate card supports the quoted margin' },
  margin_eroded: { outcome: 'committed', because: 'the rate card supports less margin than the quote claims' },
  margin_negative: { outcome: 'committed', because: 'the rate card implies a loss at this price' },

  not_capable: {
    outcome: 'refused',
    because: 'the partner is not recorded as capable of this offer, so no margin is implied about them',
  },
  currency_mismatch: {
    outcome: 'refused',
    because: 'the quote and the rate card are in different currencies, and GPS never converts one into the other',
  },

  no_rate_card: {
    outcome: 'undetermined',
    because: 'this partner has no rate card, so there is nothing to compare the quoted cost against',
  },
  cost_not_derivable: {
    outcome: 'undetermined',
    because: 'the card is metered and no unit count is on record, so the implied cost cannot be derived',
  },
};

/** How an underwriting verdict should feel, and why it lands where it does. */
export function underwriteFeel(verdict: UnderwriteVerdict): Classified {
  return UNDERWRITE[verdict];
}

/** How a margin-at-risk verdict should feel, and why it lands where it does. */
export function marginFeel(verdict: MarginVerdict): Classified {
  return MARGIN[verdict];
}

/**
 * How a failed request should feel.
 *
 * 4xx IS REFUSED AND 5xx IS UNDETERMINED, and the second half is the one that
 * matters. A 503 from an environment where the GPS migrations have not been
 * applied cannot answer the question, and a 500 leaves it genuinely unknown
 * whether the write landed — `artifactRefusal.ts:88` already says the operator
 * consequence out loud ("a retry after a silent success stores it twice"). Feeling
 * like a refusal would tell them a rule stopped them, which is a claim about the
 * server nothing here can make.
 *
 * A THROW THAT IS NOT AN `ApiError` is undetermined for the same reason: the
 * request may never have left, or it may have arrived and the answer may have been
 * lost. Nothing confirms either.
 */
export function requestFeel(err: unknown): GpsOutcome {
  if (!(err instanceof ApiError)) return 'undetermined';
  return err.status >= 400 && err.status < 500 ? 'refused' : 'undetermined';
}
