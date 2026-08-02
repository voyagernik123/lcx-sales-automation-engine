/**
 * THE HONESTY LAYER — what a window could see, and the only numbers derived from it.
 *
 * This module exists because the marketing compartment has no X credential and never
 * will, and the tempting response to that is a dashboard of plausible numbers. Every
 * figure here therefore travels with an `ObservationFrame` that states what the window
 * DID and DID NOT capture, and the frame is not decoration: `observedRate` (§3) reads
 * it and REFUSES when the completeness field says there is no denominator.
 *
 * THE ONE SENTENCE THIS MODULE ENFORCES: notification emails are a controversy-skewed
 * census of one edge type in a graph centred on LCX, not a sample of anything. They
 * arrive only when someone mentioned, replied to or quoted us, only when X decided to
 * send a notification, and only when the forwarding rule passed it on. Anything shaped
 * like a market measurement computed over that population is wrong by construction —
 * share of voice trivially approaches 1, mention volume falls when X changes its
 * batching, and sentiment is negative-skewed because controversy is what triggers
 * delivery. So the compartment measures THE DESK instead: twelve process metrics, every
 * one computable from records the desk owns completely.
 *
 * WHERE THOSE TWELVE ARE COMPUTED, AND WHY NOT HERE. This file owns the FRAME, the
 * `Figure` and the ceiling; `loop.ts` (M8) owns the ARITHMETIC. That split was not the
 * first shape: both files were written with all twelve, independently, and the
 * duplicates disagreed — two `contradictionDebt`s, two clearance-latency medians, two
 * absence conventions. A second implementation of a threshold is how a suppressed rate
 * becomes an expressed one, so the computations were deleted from here rather than
 * reconciled into an average of two opinions. What survives is §4's
 * `PROCESS_METRIC_DEFINITIONS`, which is vocabulary rather than measurement: it is
 * `Record<ProcessMetricKey, …>`, so a thirteenth metric will not compile until someone
 * has written down what it counts and when it refuses. Read that table to learn what a
 * metric means; call `loop.ts` to get its number.
 *
 * THREE LAYERS GUARD THE CEILING, AND ONLY THE FIRST TWO ARE PROOFS:
 *   1. Compile-time. `types.ts`'s `HonestFigures<T>` resolves to `never` when a
 *      payload carries a forbidden field name. tsc rejects it.
 *   2. Runtime. `assertHonestPayload` (§3) walks a payload — nested, with a cycle
 *      guard — and refuses on a forbidden key, because a value crossing a JSON
 *      boundary from a route or an AI response has no compile-time identity at all.
 *   3. Review. Neither layer catches an engagement rate named `score`. That gap is
 *      stated here rather than left for someone to discover; what makes it survivable
 *      is that a figure with no honest frame has nothing to render beside it.
 *
 * ABSENCE IS NEVER ZERO, AND THE CONVERSE MATTERS TOO. A rate over an empty
 * denominator is refused, not 0% — `0/0` on a chart is indistinguishable from "we
 * never fail". But an OBSERVED zero over a census we hold completely is a real
 * measurement and is returned as one: "no refusal fired this week, over 214 assessed
 * drafts" is information, and refusing it would be its own dishonesty. The distinction
 * is exactly whether the denominator was observed, which is why every metric here
 * takes its population count as an explicit input.
 *
 * Pure and total: no I/O, no clock, no randomness. `asOf` is always supplied. A
 * staleness or breach metric that read the clock could not be tested for what it says
 * about a deadline that passed last Tuesday, which is the whole behaviour under test.
 */
import {
  INSTRUMENTS,
  PROCESS_METRIC_KEYS,
  type FetchOutcome,
  type Figure,
  type ForbiddenMetricField,
  type InboundSourceKind,
  type Instant,
  type LowerBound,
  type ObservationFrame,
  type ProcessMetricKey,
  type Refusal,
  type RefusalCode,
  type RuleCitation,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 CITATIONS AND THE RULESET STAMP                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

export const OBSERVATION_RULESET_VERSION = 1;

/** The desk's own policy, cited when a refusal here is ours rather than the law's. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

function refusal(
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null = null,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: OBSERVATION_RULESET_VERSION };
}

const NO_DENOMINATOR_RULE = DESK_POLICY(
  'doctrine rule 3 — never claim a number you cannot observe',
  'A rate needs a denominator that was actually counted. Where the population is unobservable — every social metric without an X credential — the rate is refused rather than approximated, and where the population is observable but empty the rate is refused rather than reported as zero.',
);

const ABSENCE_RULE = DESK_POLICY(
  'doctrine rule 3 — absent data produces a refusal, never a zero',
  'A zero and an absence look identical on a chart and mean opposite things. A metric with no observations refuses and says which records were missing.',
);

const FRAME_RULE = DESK_POLICY(
  'every figure carries an observation frame',
  'A number with no statement of what its window could and could not see is unfalsifiable. Frames on social sources must name their blind spots and must not claim a denominator.',
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE OBSERVATION FRAME — WHAT THE WINDOW COULD AND COULD NOT SEE          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The window a figure was computed over. `lastSuccessfulPollAt` is required, not
 * optional: a fall in a line must be readable as a pipeline fault rather than a market
 * signal, and a caller who is allowed to forget the field will forget it.
 */
export interface ObservationWindow {
  readonly from: Instant;
  readonly to: Instant;
  /** The instant the metric was computed as at. Always passed; never read from a clock. */
  readonly asOf: Instant;
  /** When this channel last succeeded. `null` means never. */
  readonly lastSuccessfulPollAt: Instant | null;
}

/**
 * THE CENSUS SENTENCE. Rendered next to anything derived from notification mail.
 * It is the single most load-bearing paragraph in the compartment's honesty posture,
 * so it lives in code rather than in a tooltip someone can delete.
 */
export const NOTIFICATION_CENSUS_DISCLOSURE =
  'Notification emails are a controversy-skewed census of one edge type in a graph centred on LCX, not a sample of the conversation. An item appears here only if it mentioned, replied to or quoted us, only if X chose to send a notification, and only if the forwarding rule passed it on. Counts derived from it are lower bounds on our own inbox, never measurements of reach, volume or opinion.';

/**
 * Per-source profile of what a window sees. A `Record` over `InboundSourceKind`, so
 * adding a source to the vocabulary makes this file fail to compile until someone has
 * written down what that source cannot see.
 *
 * `completeness` is deliberately never `complete_first_party` for a social channel: the
 * one thing no social source can be is complete.
 */
export const SOURCE_OBSERVATION_PROFILE: Record<
  InboundSourceKind,
  {
    readonly captures: string;
    readonly doesNotCapture: readonly string[];
    readonly knownBiases: readonly string[];
    readonly completeness: ObservationFrame['completeness'];
  }
> = {
  own_record: {
    captures:
      'What the desk itself wrote down: drafts, refusals, clearances, decisions not to respond, and the instants attached to each. The only population in this table the desk holds completely.',
    doesNotCapture: [
      'anything agreed verbally and never recorded — a clearance nodded through in a call is invisible here',
      'anything the retention sweep has already removed',
      'the effect of any of it on anybody outside LCX',
    ],
    knownBiases: [
      'it flatters a desk that records selectively: an unrecorded decision cannot appear as a gap',
    ],
    completeness: 'census_of_own_corpus',
  },
  x_notification_email: {
    captures:
      'Replies, mentions and quotes that triggered an X notification to the monitored mailbox and survived the forwarding rule.',
    doesNotCapture: [
      'posts about LCX that never mentioned, replied to or quoted the account',
      'notifications X batched, digested, throttled or simply did not send',
      'anything the forwarding rule filtered out or the mailbox rejected',
      'impressions, reach, follower counts, reposts and bookmarks — absent from the mail entirely',
      'deletions and edits made after the notification was sent',
      'quote posts and replies from accounts that block or mute LCX',
    ],
    knownBiases: [
      'controversy-weighted delivery: an argument generates more notifications than agreement',
      'platform-side filtering the desk cannot inspect or reproduce',
      'mail-forwarding latency, which makes the arrival time not the post time',
    ],
    completeness: 'unknown_no_denominator',
  },
  operator_paste: {
    captures: 'Items a named colleague judged worth entering, and the desk records they created.',
    doesNotCapture: [
      'anything nobody in the workspace saw or thought to enter',
      'the population any entered item was drawn from',
    ],
    knownBiases: [
      'selection by human attention: what an operator noticed on the day they were looking',
    ],
    completeness: 'census_of_own_corpus',
  },
  oembed: {
    captures:
      'For one post whose URL we already hold: author name, post text, language and the platform timestamp, from the official documented endpoint.',
    doesNotCapture: [
      'any post whose URL we do not already have — there is no keyless discovery',
      'engagement counters of any kind',
      'protected, deleted or suspended posts',
    ],
    knownBiases: ['per-post lookup only, so the set observed is the set someone chose to look up'],
    completeness: 'unknown_no_denominator',
  },
  syndication_embed: {
    captures:
      "Likes and conversation count for one post id, from X's own undocumented embed backend, at the stated fetch time.",
    doesNotCapture: [
      'reposts, quotes, bookmarks and impressions — checked field by field and absent',
      'any timeline or search: both syndication timeline endpoints return 200 with zero bytes',
    ],
    knownBiases: [
      'undocumented endpoint: its shape may change without notice and its ToS standing is a judgement call, not a technical fact',
      'off by default, so the observed set is whatever an operator opted into',
    ],
    completeness: 'unknown_no_denominator',
  },
  mirror_discovery: {
    captures: 'Post ids only, from a public third-party mirror, for corroboration through oEmbed.',
    doesNotCapture: [
      'text — a mirror is a third party who would control what this instrument believes LCX said, so no text is stored from here',
      'any guarantee of completeness, ordering or freshness',
    ],
    knownBiases: [
      'third-party operator with no accountability to LCX and no stated retention or filtering policy',
    ],
    completeness: 'unknown_no_denominator',
  },
  regulator_feed: {
    captures:
      'Published ESMA RSS items and FMA sitemap entries, including investor-warning entries, as at the last successful poll.',
    doesNotCapture: [
      'anything a regulator has not yet published',
      'FMA items outside the typed sitemaps — the FMA publishes no RSS at all',
      'non-public supervisory correspondence',
    ],
    knownBiases: ['publication lag between a decision and its appearance in a feed'],
    completeness: 'complete_first_party',
  },
  news_feed: {
    captures: 'Items from the keyless RSS spine already running, as at the last successful poll.',
    doesNotCapture: [
      'outlets not on the feed list',
      'paywalled or JavaScript-rendered coverage',
      'anything an outlet published and then unpublished',
    ],
    knownBiases: [
      'feed-list selection, which is a choice made once and rarely revisited',
      'a 2xx response with zero bytes reads as silence unless the fetch layer distinguishes it',
    ],
    completeness: 'unknown_no_denominator',
  },
  first_party_site: {
    captures: 'Files fetched from LCX\'s own site, which we control and can re-fetch.',
    doesNotCapture: ['pages behind auth', 'anything the site has not published'],
    knownBiases: ['a DNS or RPZ block on the apex domain would read as "LCX has no blog"'],
    completeness: 'complete_first_party',
  },
};

/** Sources for which no honest denominator exists. A rate over these is refused. */
export const SOURCES_WITHOUT_DENOMINATOR: readonly InboundSourceKind[] = [
  'x_notification_email',
  'oembed',
  'syndication_embed',
  'mirror_discovery',
  'news_feed',
] as const;

/**
 * Build the frame for a source. Total over `InboundSourceKind`.
 *
 * `extraBlindSpots` is appended, never substituted: a caller may know something more
 * that this window missed, but may not talk the standing blind spots away.
 */
export function frameFor(
  source: InboundSourceKind,
  window: ObservationWindow,
  extraBlindSpots: readonly string[] = [],
): ObservationFrame {
  const profile = SOURCE_OBSERVATION_PROFILE[source];
  return {
    source,
    captures: profile.captures,
    doesNotCapture: [...profile.doesNotCapture, ...extraBlindSpots],
    knownBiases: profile.knownBiases,
    completeness: profile.completeness,
    windowFrom: window.from,
    windowTo: window.to,
    lastSuccessfulPollAt: window.lastSuccessfulPollAt,
  };
}

/** The notification-mail frame, with the census sentence attached as a bias. */
export function notificationFrame(
  window: ObservationWindow,
  extraBlindSpots: readonly string[] = [],
): ObservationFrame {
  const base = frameFor('x_notification_email', window, extraBlindSpots);
  return { ...base, knownBiases: [NOTIFICATION_CENSUS_DISCLOSURE, ...base.knownBiases] };
}

/**
 * The frame for a metric computed over the desk's OWN records — drafts, clearances,
 * refusals, triage decisions, statements. This is the frame every process metric in
 * `loop.ts` carries, and it is the only one that may legitimately support a rate.
 *
 * THE GAP THAT WAS NAMED HERE IS NOW CLOSED. `ObservationFrame.source` had no member
 * meaning "the desk's own record", so this function labelled a census of our own
 * decisions `operator_paste` — which reads on a panel as "a human typed this in" and
 * understates how complete the population is. `own_record` was added to
 * `InboundSourceKind` in the integration pass and is used here. `completeness:
 * 'census_of_own_corpus'` still carries the load-bearing half of the meaning.
 */
export function ownCorpusFrame(
  window: ObservationWindow,
  captures: string,
  doesNotCapture: readonly string[] = [],
): ObservationFrame {
  return {
    source: 'own_record',
    captures,
    doesNotCapture: [
      ...doesNotCapture,
      'anything that happened outside this workspace, including text a colleague published without recording it here',
      'records already removed by the retention sweep',
    ],
    knownBiases: [
      'this is a census of the desk, not of the market: it measures what the desk did, and says nothing about what the audience saw',
    ],
    completeness: 'census_of_own_corpus',
    windowFrom: window.from,
    windowTo: window.to,
    lastSuccessfulPollAt: window.lastSuccessfulPollAt,
  };
}

/**
 * Is this frame honest? `null` means yes.
 *
 * Checks the three ways a frame lies: claiming a denominator a social source cannot
 * have, naming no blind spots at all, and a window that runs backwards.
 */
export function checkFrame(frame: ObservationFrame): Refusal | null {
  if (frame.captures.trim() === '') {
    return refusal(
      'OBSERVATION_FRAME_MISSING',
      'This frame does not say what the window captured, so nothing derived from it can be read.',
      FRAME_RULE,
      { kind: 'supply_data', missing: 'what this window captured', whoCanSupply: 'the caller building the frame' },
    );
  }
  if (frame.doesNotCapture.length === 0) {
    return refusal(
      'OBSERVATION_FRAME_MISSING',
      'This frame names no blind spots. Every channel this compartment reads has them, so an empty list means they were not written down rather than that none exist.',
      FRAME_RULE,
      { kind: 'supply_data', missing: 'the named absences for this window', whoCanSupply: 'the caller building the frame' },
    );
  }
  if (
    SOURCES_WITHOUT_DENOMINATOR.includes(frame.source) &&
    frame.completeness !== 'unknown_no_denominator'
  ) {
    return refusal(
      'OBSERVATION_FRAME_MISSING',
      `A ${frame.source} window cannot be complete: its completeness is recorded as '${frame.completeness}', which claims a population this channel does not have.`,
      FRAME_RULE,
      { kind: 'not_recoverable', why: 'There is no keyless population for this channel, so no window over it can be described as complete.' },
      frame.completeness,
    );
  }
  const from = Date.parse(frame.windowFrom);
  const to = Date.parse(frame.windowTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return refusal(
      'OBSERVATION_FRAME_MISSING',
      `This frame's window runs from ${frame.windowFrom} to ${frame.windowTo}, which is not a period anything can be counted over.`,
      FRAME_RULE,
      { kind: 'supply_data', missing: 'a window whose end is at or after its start', whoCanSupply: 'the caller building the frame' },
    );
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 FIGURES — A NUMBER WITH ITS FRAME, OR A REFUSAL                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Wrap a value with its frame. The frame is CHECKED here, so a dishonest frame cannot
 * be smuggled in behind a legitimate number — which is the failure mode of every
 * system that treats provenance as metadata.
 */
export function measured<T>(value: T, frame: ObservationFrame): Figure<T> {
  const bad = checkFrame(frame);
  if (bad !== null) return { kind: 'absent', refusal: bad };
  return { kind: 'measured', value, frame };
}

/** The absent branch. Exported so callers never hand-build a `Figure`. */
export function absent<T = never>(r: Refusal): Figure<T> {
  return { kind: 'absent', refusal: r };
}

/**
 * A count that is a lower bound, said so in its type and in its name.
 *
 * Reply counts from notification mail are lower bounds: X batches, digests and
 * throttles, and the forwarding rule filters further. `atLeast` is the field name for
 * the same reason `repliesObserved` is: a number called `value` gets re-presented as a
 * total three screens later, and nobody remembers where it came from.
 */
export function lowerBound<M extends string>(
  metric: M,
  atLeast: number,
  frame: ObservationFrame,
): Figure<LowerBound<M>> {
  if (!Number.isFinite(atLeast) || atLeast < 0 || !Number.isInteger(atLeast)) {
    return absent(
      refusal(
        'DATA_ABSENT_NOT_ZERO',
        `'${String(atLeast)}' is not a whole number of observed ${metric}, so no lower bound can be stated.`,
        ABSENCE_RULE,
        { kind: 'supply_data', missing: `an observed count of ${metric}`, whoCanSupply: 'the ingest layer' },
      ),
    );
  }
  const bad = checkFrame(frame);
  if (bad !== null) return absent(bad);
  return { kind: 'measured', value: { kind: 'lower_bound', metric, atLeast, frame }, frame };
}

/**
 * Turn a three-state fetch into a figure.
 *
 * `no_data_confirmed` becomes a figure ONLY when the caller supplies what zero means
 * for that metric. That is the whole distinction the tri-state exists for: a confirmed
 * absence is a real observation, an unconfirmed one is not, and a fetcher that checked
 * `res.ok` and parsed an empty body knows the difference only if someone made it say so.
 */
export function fetchOutcomeToFigure<T>(
  outcome: FetchOutcome<T>,
  frame: ObservationFrame,
  zeroValue?: T,
): Figure<T> {
  switch (outcome.kind) {
    case 'data':
      return measured(outcome.value, frame);
    case 'no_data_confirmed':
      if (zeroValue === undefined) {
        return absent(
          refusal(
            'DATA_ABSENT_NOT_ZERO',
            `The channel confirmed there was nothing to return (${outcome.basis}), but this metric has no defined zero, so it renders as absent rather than as 0.`,
            ABSENCE_RULE,
            { kind: 'not_recoverable', why: 'A metric with no meaningful zero cannot report a confirmed absence as a number.' },
          ),
        );
      }
      return measured(zeroValue, frame);
    case 'unknown':
      return absent(
        refusal(
          'FETCH_OUTCOME_UNKNOWN',
          `The channel neither returned data nor confirmed there was none (${outcome.reason}), so this reads as unknown. A 2xx response with no body is not evidence of absence.`,
          ABSENCE_RULE,
          { kind: 'wait_until', condition: 'the next successful poll of this channel' },
        ),
      );
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE HONESTY CEILING, ENFORCED AT RUNTIME                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The forbidden field names, as a TABLE keyed by the union.
 *
 * Keying a `Record<ForbiddenMetricField, true>` proves both directions at compile time:
 * a name in the union but missing here is a tsc error, and a name here that is not in
 * the union is also a tsc error. The runtime array is then DERIVED from the table, so
 * the two cannot drift — which is the failure this shape exists to prevent, because a
 * blocklist that silently loses an entry is worse than no blocklist.
 */
const FORBIDDEN_FIELD_TABLE: Record<ForbiddenMetricField, true> = {
  impressions: true,
  impressionCount: true,
  impression_count: true,
  views: true,
  viewCount: true,
  view_count: true,
  reach: true,
  reachCount: true,
  uniqueReach: true,
  unique_reach: true,
  followers: true,
  followerCount: true,
  follower_count: true,
  followerDelta: true,
  follower_delta: true,
  followerGrowth: true,
  follower_growth: true,
  newFollowers: true,
  engagementRate: true,
  engagement_rate: true,
  clickThroughRate: true,
  click_through_rate: true,
  ctr: true,
  clickRate: true,
  shareOfVoice: true,
  share_of_voice: true,
  sov: true,
  audienceSentiment: true,
  audience_sentiment: true,
  sentimentScore: true,
  sentiment_score: true,
  netSentiment: true,
  net_sentiment: true,
  sentimentPct: true,
  sentiment_pct: true,
  bestTimeToPost: true,
  audienceDemographics: true,
  audienceGeography: true,
};

/** Derived, never hand-listed. See `FORBIDDEN_FIELD_TABLE`. */
export const FORBIDDEN_METRIC_FIELD_NAMES: readonly ForbiddenMetricField[] = Object.keys(
  FORBIDDEN_FIELD_TABLE,
) as readonly ForbiddenMetricField[];

const NORMALISED_FORBIDDEN: ReadonlySet<string> = new Set(
  FORBIDDEN_METRIC_FIELD_NAMES.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '')),
);

const CEILING_RULE = DESK_POLICY(
  'the honesty ceiling',
  'Impressions, reach, follower delta, engagement rate, click-through, share of voice and aggregate audience sentiment are unobtainable without an X credential, and the two ratios among them need a denominator that does not exist. No payload this compartment renders may carry a field named after one of them.',
);

const MAX_PAYLOAD_DEPTH = 8;

/**
 * Walk a payload and refuse on a forbidden field name. `null` means the payload is
 * clean of the names this compartment bans.
 *
 * WHY A RUNTIME CHECK EXISTS ALONGSIDE `HonestFigures<T>`: the compile-time ban only
 * protects values whose type passed through the wrapper. A row from a route body, a
 * parsed AI response or a JSON column has no compile-time identity, and
 * `impressions: 12000` inside one of those is exactly how a number nobody can defend
 * reaches a screen.
 *
 * WHAT IT DOES NOT CATCH, said plainly: an engagement rate computed and named `score`.
 * Nothing mechanical catches that. What makes the gap survivable is that such a field
 * still needs an `ObservationFrame` to render beside it, and a frame over notification
 * mail refuses to supply a denominator (§1, §3 `observedRate`).
 *
 * Case and separators are normalised, so `Impressions` and `impression_count` are both
 * caught; `impressions7d` is not, and that is stated rather than implied.
 */
export function assertHonestPayload(payload: unknown): Refusal | null {
  const seen = new WeakSet<object>();

  const walk = (node: unknown, depth: number, path: string): Refusal | null => {
    if (depth > MAX_PAYLOAD_DEPTH || node === null || typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const found = walk(node[i], depth + 1, `${path}[${String(i)}]`);
        if (found !== null) return found;
      }
      return null;
    }

    for (const key of Object.keys(node)) {
      const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (NORMALISED_FORBIDDEN.has(normalised)) {
        const where = path === '' ? key : `${path}.${key}`;
        return refusal(
          'METRIC_NOT_OBSERVABLE',
          `Refused: this payload carries a field named '${key}' at ${where}. That metric cannot be observed without an X credential, so any value in that field was inferred, proxied or invented — and the honest answer is to show the row as unavailable instead.`,
          CEILING_RULE,
          {
            kind: 'not_recoverable',
            why: 'There is no keyless source for this metric. Renaming the field would hide the problem rather than fix it.',
          },
          where,
        );
      }
      const found = walk((node as Record<string, unknown>)[key], depth + 1, path === '' ? key : `${path}.${key}`);
      if (found !== null) return found;
    }
    return null;
  };

  return walk(payload, 0, '');
}

/**
 * A denominator, and whether it was actually counted.
 *
 * This type is the runtime half of the honesty ceiling. A caller cannot pass a bare
 * number as a denominator: they must state that it is a total over a corpus the desk
 * holds, or declare it unobservable — in which case the rate is refused and the caller
 * gets a sentence naming what the ratio would have needed to count.
 */
export type Denominator =
  | {
      readonly kind: 'own_corpus_total';
      readonly value: number;
      /** What the number counts, e.g. 'drafts assessed in the window'. */
      readonly counts: string;
    }
  | {
      readonly kind: 'unobservable';
      readonly wouldNeedToCount: string;
      readonly why: string;
    };

/** A rate the compartment is willing to state, with both of its inputs visible. */
export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
  readonly ratio: number;
  /** Rounded to one decimal place, for rendering. The ratio is the number of record. */
  readonly pct: number;
  readonly counts: string;
}

/**
 * THE FUNCTION NO CALLER CAN GET A REACH NUMBER OUT OF.
 *
 * Four refusals, and each is a distinct dishonesty:
 *  1. `unobservable` denominator → `METRIC_NOT_OBSERVABLE`, not recoverable. This is
 *     the reach and share-of-voice case.
 *  2. A frame whose completeness admits no denominator → the same refusal, even if the
 *     caller passed a plausible number. The frame outranks the argument.
 *  3. Denominator 0 → `DATA_ABSENT_NOT_ZERO`. `0/0` is not 0%; a chart cannot tell the
 *     difference between "never failed" and "never tried".
 *  4. Numerator larger than the census it is drawn from, or either input not a
 *     non-negative integer → the inputs disagree, so one of them is wrong and the
 *     answer is neither number.
 */
export function observedRate(spec: {
  readonly metric: string;
  readonly numerator: number;
  readonly denominator: Denominator;
  readonly frame: ObservationFrame;
}): Figure<Rate> {
  const { metric, numerator, denominator, frame } = spec;

  if (denominator.kind === 'unobservable') {
    return absent(
      refusal(
        'METRIC_NOT_OBSERVABLE',
        `Refused: ${metric} is a ratio and its denominator would have to count ${denominator.wouldNeedToCount}. ${denominator.why} No keyless source provides it, so this compartment shows the row as unavailable rather than a proxy nobody can defend.`,
        NO_DENOMINATOR_RULE,
        { kind: 'not_recoverable', why: denominator.why },
        metric,
      ),
    );
  }

  if (frame.completeness === 'unknown_no_denominator') {
    return absent(
      refusal(
        'METRIC_NOT_OBSERVABLE',
        `Refused: ${metric} was asked for over a ${frame.source} window, which has no population to divide by. A ratio computed over it approaches 1 by construction and means nothing.`,
        NO_DENOMINATOR_RULE,
        { kind: 'not_recoverable', why: 'The window itself records that it has no denominator.' },
        metric,
      ),
    );
  }

  const bad = checkFrame(frame);
  if (bad !== null) return absent(bad);

  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator.value) ||
    numerator < 0 ||
    denominator.value < 0
  ) {
    return absent(
      refusal(
        'DATA_ABSENT_NOT_ZERO',
        `Refused: ${metric} was given ${String(numerator)} of ${String(denominator.value)}, and a count must be a whole number that is not negative. One of the two inputs is wrong, so neither is reported.`,
        ABSENCE_RULE,
        { kind: 'supply_data', missing: `whole counts for ${metric}`, whoCanSupply: 'the caller assembling the metric' },
        metric,
      ),
    );
  }

  if (denominator.value === 0) {
    return absent(
      refusal(
        'DATA_ABSENT_NOT_ZERO',
        `Refused: ${metric} has nothing to divide by — there were no ${denominator.counts} in this window. Zero of zero is not 0%, and on a chart the two are indistinguishable while meaning opposite things.`,
        ABSENCE_RULE,
        { kind: 'wait_until', condition: `at least one of: ${denominator.counts}` },
        metric,
      ),
    );
  }

  if (numerator > denominator.value) {
    return absent(
      refusal(
        'METRIC_NOT_OBSERVABLE',
        `Refused: ${metric} counted ${String(numerator)} out of ${String(denominator.value)} ${denominator.counts}. The numerator cannot exceed the census it is drawn from, so this is a join defect rather than a rate.`,
        ABSENCE_RULE,
        { kind: 'supply_data', missing: `a numerator drawn from the same population as ${denominator.counts}`, whoCanSupply: 'the caller assembling the metric' },
        metric,
      ),
    );
  }

  const ratio = numerator / denominator.value;
  return measured(
    {
      numerator,
      denominator: denominator.value,
      ratio,
      pct: Math.round(ratio * 1000) / 10,
      counts: denominator.counts,
    },
    frame,
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE TWELVE PROCESS METRICS — MEASURING THE DESK, NOT THE MARKET          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * What each metric counts, why it is honest, and when it refuses — as data, so a panel
 * can render the definition next to the number and a reader can argue with it.
 *
 * `Record<ProcessMetricKey, ...>` makes this total: a thirteenth metric added to the
 * vocabulary will not compile until someone has written down what it refuses on.
 */
export const PROCESS_METRIC_DEFINITIONS: Record<
  ProcessMetricKey,
  { readonly label: string; readonly counts: string; readonly whyHonest: string; readonly refusesWhen: string }
> = {
  time_to_first_statement: {
    label: 'Time to first statement',
    counts: 'Minutes from incident detection to the first published statement, against the severity budget.',
    whyHonest: 'Both timestamps are the desk\'s own records; no audience data is involved.',
    refusesWhen: 'No incidents in the window — a mean over zero incidents would read as instant response.',
  },
  clearance_latency_by_role: {
    label: 'Clearance latency by role',
    counts: 'Minutes from clearance request to clearance granted, per lane.',
    whyHonest: 'Shows which lane is the bottleneck before a crisis proves it.',
    refusesWhen: 'A lane with no completed clearances refuses rather than reporting 0 minutes.',
  },
  precleared_derivation_rate: {
    label: 'Precleared derivation rate',
    counts: 'Published items derived from cleared language, over all published items.',
    whyHonest: 'Both counts are ours; the denominator is the desk\'s own publication record.',
    refusesWhen: 'Nothing was published in the window.',
  },
  claim_provenance_rate: {
    label: 'Claim provenance rate',
    counts: 'Quantitative claims carrying a source reference, over all quantitative claims used.',
    whyHonest: 'A census of our own drafts.',
    refusesWhen: 'No quantitative claims were made in the window.',
  },
  contradiction_debt: {
    label: 'Contradiction debt',
    counts: 'Live statement pairs that differ on a mechanically checkable axis with no supersedes link.',
    whyHonest: 'Exact and reproducible by hand from the two records it names.',
    refusesWhen: 'The corpus is empty, which is not the same as owing nothing.',
  },
  line_staleness: {
    label: 'Line staleness',
    counts: 'Cleared lines past their review date, and claims used after their validity ended.',
    whyHonest: 'Dates the desk set itself, checked against an explicit asOf.',
    refusesWhen: 'No cleared lines exist to be stale.',
  },
  not_known_non_empty_rate: {
    label: 'notKnown non-empty rate',
    counts: 'Initial-phase statements that admitted uncertainty, over all initial-phase statements.',
    whyHonest: 'Reads directly off the statement bodies the desk published.',
    refusesWhen: 'No initial-phase statements were issued.',
  },
  refusal_rate_by_code: {
    label: 'Refusal codes by frequency',
    counts: 'Every refusal code, with how often it fired and which never fired at all.',
    whyHonest: 'The only honest read on whether the gates are load-bearing or ornamental.',
    refusesWhen: 'Nothing was assessed in the window, so there was no opportunity for a gate to fire.',
  },
  retraction_count: {
    label: 'Retractions',
    counts: 'Linked corrections and withdrawals. Deletions are not retractions and are counted separately.',
    whyHonest: 'A census of our own linked records; a hard delete would leave no record, which is why it is banned.',
    refusesWhen: 'Nothing was published in the window.',
  },
  next_update_breach_count: {
    label: 'Next-update breaches',
    counts: 'Statements whose promised next update passed with no follow-up.',
    whyHonest: 'A deadline the desk set itself, checked against an explicit asOf.',
    refusesWhen: 'No statement in the window promised a next update.',
  },
  ignore_with_rationale_rate: {
    label: 'Ignore-with-rationale rate',
    counts: 'Decisions not to respond that carry a rationale, over all decisions not to respond.',
    whyHonest: 'Converts silence from absence of evidence into evidence.',
    refusesWhen: 'No decisions not to respond were recorded.',
  },
  question_coverage: {
    label: 'Question coverage',
    counts: 'Anticipated questions with a live cleared line, over all anticipated questions.',
    whyHonest: 'Measures preparation, which is the artefact of triage that survives a crisis.',
    refusesWhen: 'No questions have been anticipated — an empty list is not full coverage.',
  },
};

/** Every key has a definition, and every definition has a key. */
export const PROCESS_METRICS_DEFINED: readonly ProcessMetricKey[] = PROCESS_METRIC_KEYS;
