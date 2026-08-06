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
 * THREE LAYERS GUARD THE CEILING, AND ONLY ONE OF THEM IS CURRENTLY APPLIED:
 *   1. Compile-time. `types.ts`'s `HonestFigures<T>` resolves to `never` when a payload
 *      carries a forbidden field name, and tsc rejects it — WHERE A TYPE USES IT. NOTHING
 *      IN THIS REPOSITORY DOES. It is a definition and its own tests, so today it guards
 *      nothing; the honest reading is "available", not "in force". Wrapping the marketing
 *      response contracts in it is the outstanding work, and it is named in
 *      `MARKETING_CONTRACTS_OWED` rather than implied by this paragraph.
 *   2. Runtime. `assertHonestPayloadAll` (§3) walks a payload — nested, with a per-path
 *      cycle guard — and returns EVERY forbidden key it carries, because a value crossing
 *      a JSON boundary from a route or an AI response has no compile-time identity at all.
 *      THIS ONE IS WIRED: `apps/web/src/lib/api/marketing.ts`'s `unwrap` runs it on every
 *      marketing read and throws the whole refusal, so a route that started returning
 *      `impressions` fails the read instead of reaching a component. It had zero production
 *      callers when this paragraph first claimed both layers were proofs.
 *
 *      AND IT IS A GUARD ABOUT ITS OWN LIMITS. Past `MAX_PAYLOAD_DEPTH` it refuses with
 *      `PAYLOAD_TOO_DEEP_TO_VERIFY` rather than returning "clean": for three waves the
 *      truncation branch returned the same value as a completed clean walk, so "checked
 *      and honest" and "never looked" were indistinguishable at the call site. That is the
 *      exact laundering the ceiling exists to prevent, committed by the ceiling.
 *
 *      THE SAME RULE NOW COVERS EVERY OTHER THING IT CANNOT READ, which the first version
 *      of that fix did not. A `Map` or `Set` with contents refuses with
 *      `PAYLOAD_NOT_WALKABLE`; a typed array, `DataView` or `ArrayBuffer` has its NAMED
 *      properties checked and only its BYTES skipped; and enumerable inherited properties
 *      are read, because `Object.keys` cannot see them and `Object.create({impressions:1})`
 *      was reported clean. Three containers returned `[]` — the completed-clean value — for
 *      a walk that never happened, which is the depth defect again in three new places.
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

/** Case and separators stripped. `Impressions`, `impression_count` and `impression count`
 *  all reduce to the same key; `impressions7d` does not, and that is stated in §3. */
const normaliseFieldName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const NORMALISED_FORBIDDEN: ReadonlySet<string> = new Set(
  FORBIDDEN_METRIC_FIELD_NAMES.map(normaliseFieldName),
);

/** An array index or a typed-array byte offset: a digit string, never a field name. */
const INDEX_KEY = /^(?:0|[1-9][0-9]*)$/;

/**
 * How large a byte view the ceiling will enumerate before it refuses instead.
 *
 * A typed array answers any key enumeration with one key per byte. Measured here: 4,096
 * elements costs 0.28ms per enumeration, the same order as the 0.68ms the walk pays for a
 * whole realistic 4,400-key payload; 1,000,000 elements costs 184ms. So the ceiling reads
 * the names on a small view and REFUSES a large one — it never silently skips either, which
 * is what the first version of this fix did to both.
 *
 * Nothing in this compartment returns a byte view in a JSON payload, so this is a guard for
 * F1's server-side middleware rather than a live constraint. If it ever fires on a real
 * response, the fix is at the route: hand the ceiling the metadata object and keep the bytes
 * out of the walked payload.
 */
const MAX_BYTE_VIEW_ELEMENTS = 4_096;

/**
 * THE 25 KEYS THE 38 DECLARED NAMES ACTUALLY REDUCE TO.
 *
 * Exported because the gap between 38 and 25 is the kind of arithmetic a reader assumes
 * rather than checks: `FORBIDDEN_METRIC_FIELD_NAMES.length` looks like the size of the
 * blocklist and is not.
 */
export const NORMALISED_FORBIDDEN_FIELD_NAMES: readonly string[] = [...NORMALISED_FORBIDDEN];

/**
 * THE THIRTEEN SPELLINGS THAT CAN NEVER BE THE REASON A PAYLOAD IS CAUGHT — REPORTED,
 * NOT DELETED.
 *
 * Every one is the snake_case twin of a camelCase name already in the table, and the
 * matcher strips separators before it looks, so removing them would change nothing about
 * what is banned. They stay for two reasons and both are load-bearing:
 *
 *  · `FORBIDDEN_FIELD_TABLE` is `Record<ForbiddenMetricField, true>`, which is what
 *    makes the union and the runtime list provably the same set. Dropping a key here
 *    without dropping the union member is a tsc error; dropping both would delete the
 *    only written statement that `impression_count` is banned — and that is the spelling
 *    a Postgres row and a Python-authored payload actually arrive with.
 *  · The table is READ by humans deciding whether a field name is allowed. A reader
 *    looking for `share_of_voice` and finding only `shareOfVoice` has to know the
 *    normalisation rule to conclude anything, and a blocklist that requires an inference
 *    is a blocklist that gets guessed at.
 *
 * Derived rather than hand-listed, so it cannot drift from the table it describes.
 */
export const REDUNDANT_UNDER_NORMALISATION: readonly ForbiddenMetricField[] = (() => {
  const firstSeen = new Set<string>();
  const redundant: ForbiddenMetricField[] = [];
  for (const name of FORBIDDEN_METRIC_FIELD_NAMES) {
    const key = normaliseFieldName(name);
    if (firstSeen.has(key)) redundant.push(name);
    else firstSeen.add(key);
  }
  return redundant;
})();

const CEILING_RULE = DESK_POLICY(
  'the honesty ceiling',
  'Impressions, reach, follower delta, engagement rate, click-through, share of voice and aggregate audience sentiment are unobtainable without an X credential, and the two ratios among them need a denominator that does not exist. No payload this compartment renders may carry a field named after one of them.',
);

/**
 * HOW DEEP THE WALKER GOES, AND WHY THE NUMBER MOVED FROM 8 TO 32.
 *
 * 8 was chosen for cost and was never the binding constraint: the walk measures 0.68ms
 * at p95 over a realistic 200-row payload of ~4,400 keys, and depth does not drive that
 * — breadth does. What 8 actually did was decide how much of a payload went UNCHECKED,
 * because past it the walker returned `null`. Measured on the old code: a forbidden key
 * was caught at nesting up to 9 and missed from 10, and since an array consumes a level
 * of its own, an alternating array/object payload went unchecked from four alternations.
 *
 * Raising it is not a loosening, it is the other half of making the boundary REFUSE.
 * A limit that answers "I could not verify this" has to sit above every payload the
 * compartment honestly returns, or the ceiling stops being a guard and becomes an outage
 * on the desk's own reads. 32 still bounds the recursion, which is all the constant was
 * ever for.
 *
 * WHERE 32 CAME FROM, said precisely so nobody reads it as measured. It is an estimate off
 * the TYPE DECLARATIONS in `contracts/` — the deepest declared shape nests roughly a dozen
 * levels once the array rungs are counted — and not an observation of production JSON,
 * which this lane had no environment to sample. So 32 is headroom over a reading, not a
 * margin over a measurement. If the API middleware in F1 ever refuses a real payload on
 * this limit, the limit is the thing that was wrong, and the refusal names the path so the
 * argument can be had with evidence instead of with two guesses.
 */
export const MAX_PAYLOAD_DEPTH = 32;

/**
 * The refusal a bounded walker owes its caller when it ran out of depth.
 *
 * ── THIS CODE IS NOT IN `RefusalCode`, AND THAT IS RECORDED RATHER THAN HIDDEN ──
 * `RefusalCode` and `REFUSAL_CODES` live in `types.ts`, which this lane does not own, so
 * the code is declared here and the refusal type widened locally. The consequence is
 * real and is the only reason to say so out loud: `loop.ts refusalCodeFrequency`
 * enumerates `REFUSAL_CODES` to report the gates that have NEVER FIRED, and a code
 * outside that array is invisible to it. Folding this one in is a two-line change in
 * `types.ts` — one union member, one array entry — and it is owed.
 *
 * It is a distinct code rather than a reuse of `METRIC_NOT_OBSERVABLE` or
 * `FETCH_OUTCOME_UNKNOWN` because those two mean "this number cannot be observed" and
 * "the channel did not answer". This one means "the instrument did not finish looking",
 * which has a different owner and a different fix: the payload's shape, not the data.
 * `types.ts` records the same argument about the four approval-regime codes that were
 * `DATA_ABSENT_NOT_ZERO` until someone noticed one bucket cannot answer two questions.
 */
export const PAYLOAD_TOO_DEEP_CODE = 'PAYLOAD_TOO_DEEP_TO_VERIFY';

/**
 * The refusal a walker owes its caller for a CONTAINER IT CANNOT ENUMERATE.
 *
 * ── WHY THIS CODE EXISTS AT ALL, WHICH IS AN ADMISSION ────────────────────────
 * The first version of the depth fix wrote "a check that did not run is not a check that
 * passed" and then committed that exact error three more times in the same function. A
 * `Map` with entries, a `Set` with members and a typed array all fell out of the walk
 * through a bare `return`, which produced `[]` — the SAME value a completed clean walk
 * produces. `assertHonestPayloadAll(new Map([['impressions', 1]]))` answered "clean", and
 * a test asserted that a real `impressions` property planted on a `Uint8Array` was
 * correctly ignored. It was not ignored, it was UNREAD, and those are the two states this
 * whole module exists to keep apart.
 *
 * Same ledger entry as `PAYLOAD_TOO_DEEP_CODE`: NOT in `RefusalCode`/`REFUSAL_CODES`,
 * because `types.ts` is not this lane's file, so `loop.ts refusalCodeFrequency` cannot see
 * it either. Folding both in is a four-line change there and it is owed.
 *
 * It is distinct from `PAYLOAD_TOO_DEEP_TO_VERIFY` because the fix is different: too-deep
 * is about the walker's bound, and this one is about a value that cannot be serialised to
 * JSON at all (`JSON.stringify(new Map([['a',1]]))` is `{}`), so the owner's action is to
 * convert the container before it becomes a response, not to raise a limit.
 */
export const PAYLOAD_NOT_WALKABLE_CODE = 'PAYLOAD_NOT_WALKABLE';

/** `RefusalCode` plus the two codes the ceiling needs and `types.ts` does not yet hold. */
export type CeilingRefusalCode =
  | RefusalCode
  | typeof PAYLOAD_TOO_DEEP_CODE
  | typeof PAYLOAD_NOT_WALKABLE_CODE;

/** A `Refusal` in every respect except that its code may be the ceiling's own. */
export interface CeilingRefusal extends Omit<Refusal, 'code'> {
  readonly code: CeilingRefusalCode;
}

const DEPTH_RULE = DESK_POLICY(
  'the honesty ceiling — a check that did not run is not a check that passed',
  'The ceiling walks a payload to a bounded depth. Where the payload is deeper than the walker goes, the answer is that it could not be verified — which is a refusal. Returning "clean" for "did not look" would launder an unchecked payload into a checked one, which is the same error the ceiling exists to catch.',
);

const UNWALKABLE_RULE = DESK_POLICY(
  'the honesty ceiling — a container the guard cannot enumerate is not a container it cleared',
  'The ceiling reads FIELD NAMES. A Map or a Set holds its contents somewhere no property enumeration reaches, so the guard cannot say whether a forbidden name is in there. The answer is that it could not be verified — a refusal — and not the empty list a completed clean walk returns. Such a value also cannot survive JSON serialisation, so a payload carrying one is already not the payload a caller will receive.',
);

/** As `refusal`, but over the widened code set. Same shape, same ruleset stamp. */
function ceilingRefusal(
  code: CeilingRefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null = null,
): CeilingRefusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: OBSERVATION_RULESET_VERSION };
}

/**
 * Walk a payload and return EVERY forbidden field name it carries, plus a refusal for
 * any branch the walker could not finish. An empty array means the payload is clean of
 * the names this compartment bans, all the way down.
 *
 * WHY A RUNTIME CHECK EXISTS ALONGSIDE `HonestFigures<T>`: the compile-time ban only
 * protects values whose type passed through the wrapper. A row from a route body, a
 * parsed AI response or a JSON column has no compile-time identity, and
 * `impressions: 12000` inside one of those is exactly how a number nobody can defend
 * reaches a screen.
 *
 * ── WHY PLURAL, WHEN IT USED TO RETURN THE FIRST AND STOP ──
 * The house pattern is two files over: "EVERY refusal, then one 422 — never the first
 * one found" (`apps/api/src/routes/marketingDesk.ts`, and `marketingGates.ts` dedupes
 * the plural list). A gate that reports one banned field per attempt gets routed around
 * one field per attempt, and a payload with four of them takes four deploys to clean.
 * This is about to become platform middleware, where that difference is the whole cost.
 *
 * ── THE CYCLE GUARD IS PER-PATH, AND THE OLD ONE WAS NOT ──
 * The previous `WeakSet` was added to and never removed, which makes it a permanent
 * first-visit-wins dedupe rather than a cycle guard. With `S = { q: { impressions: 1 } }`
 * shared between a branch the depth limit truncated and a branch it could have checked,
 * the verdict depended on `Object.keys` order: the truncated visit marked `S` seen and
 * the checkable visit was skipped. Same object, same payload, opposite answer. The set
 * here holds only the nodes on the CURRENT path and is unwound on the way back up, so it
 * still terminates on a cycle and no longer suppresses a sibling.
 *
 * ── AND THAT MADE IT EXPONENTIAL, WHICH THE `cleared` MEMO PUTS BACK ──
 * A per-path set alone turns the walk from O(distinct NODES) into O(distinct PATHS).
 * Measured on `let n = {leaf:true}; for (i<L) n = {a:n, b:n}` — a shared-reference DAG with
 * no cycle in it — the per-path guard on its own ran L=16 in 24ms, L=18 in 87ms, L=20 in
 * 380ms and L=22 in 1,840ms: a clean 4x per level, i.e. 2^L visits, unbounded to ~2^32 at
 * `MAX_PAYLOAD_DEPTH`. That was latent in the browser, where the payload is `JSON.parse`
 * output and therefore a tree, and NOT latent for F1's API middleware, which walks
 * pre-serialisation objects where a shared module constant (every `DESK_POLICY` citation is
 * one) appears in dozens of places.
 *
 * `cleared` restores linearity without restoring the dedupe defect, because it records a
 * PROOF rather than a visit. An entry means: this exact node was walked starting at that
 * depth, the walk reached the bottom of its own subtree, and it produced NOTHING —
 * no forbidden name, no truncation, and no cycle cut inside it. Such a subtree is clean at
 * any SHALLOWER depth too, since a shallower start has strictly more budget and the shape
 * is identical, so a later visit at `depth <= recorded` can be skipped soundly. A visit at
 * a DEEPER depth is not skipped, because it might truncate where the first did not.
 *
 * The three conditions are all load-bearing and the third is the subtle one: a subtree
 * whose walk was cut short by the cycle guard was not proved clean BY ITSELF — it leaned on
 * an ancestor having enumerated the cut node — and that ancestor is not on the path the
 * second time. So a cycle cut anywhere inside disqualifies the memo entry. The consequence
 * is only lost sharing on payloads that contain cycles, which JSON cannot.
 *
 * WHAT IT DOES NOT CATCH, said plainly: an engagement rate computed and named `score`.
 * Nothing mechanical catches that. What makes the gap survivable is that such a field
 * still needs an `ObservationFrame` to render beside it, and a frame over notification
 * mail refuses to supply a denominator (§1, §3 `observedRate`).
 *
 * Case and separators are normalised, so `Impressions` and `impression_count` are both
 * caught; `impressions7d` is not, and that is stated rather than implied.
 *
 * ── WHAT IS READ, AND WHAT IS REFUSED FOR BEING UNREADABLE ──
 * Enumerable INHERITED properties are read (`for…in`, not `Object.keys`), because
 * `Object.create({ impressions: 1 })` used to answer clean. Class methods are
 * non-enumerable so this adds nothing for an instance, which is why it is not a cost.
 * A typed array, `DataView` or `ArrayBuffer` has its NAMED properties checked and only its
 * numeric byte indices skipped — a byte index cannot normalise to a forbidden name, so
 * skipping the indices loses nothing while skipping the object lost a real `impressions`.
 * Past `MAX_BYTE_VIEW_ELEMENTS` even the enumeration is the cost, and the view is REFUSED
 * `PAYLOAD_NOT_WALKABLE` rather than skipped in silence. A `Map` or
 * `Set` WITH CONTENTS refuses `PAYLOAD_NOT_WALKABLE`: its entries live where no property
 * enumeration reaches, so "clean" would be a claim about something never read. An EMPTY
 * `Map`/`Set` is not refused — there is nothing unchecked in it.
 */
export function assertHonestPayloadAll(payload: unknown): readonly CeilingRefusal[] {
  const found: CeilingRefusal[] = [];
  /* Only the ancestors of the node being visited. Removed on the way back up — see the
     docblock: a permanent set is a dedupe, and a dedupe suppresses real findings. */
  const onPath = new Set<object>();
  /* node -> the DEEPEST depth at which its whole subtree was proved clean and
     self-contained. See the docblock; this is what keeps the walk linear. */
  const cleared = new Map<object, number>();
  /* Incremented on every cycle cut, so a subtree that relied on one can be told apart from
     one that walked itself to the bottom. Only ever compared, never reported. */
  let cycleCuts = 0;

  const walk = (node: unknown, depth: number, path: string): void => {
    if (node === null || typeof node !== 'object') return;
    if (onPath.has(node)) {
      /* A GENUINE CYCLE: this node is one of its own ancestors, so its keys were already
         enumerated further up this same path and descending again cannot find anything new.
         That is why this `return` is silent where the depth and Map/Set branches refuse —
         the check DID run, at the ancestor. The counter records that this subtree's verdict
         leaned on that fact, which is what disqualifies it from `cleared`. */
      cycleCuts += 1;
      return;
    }

    const clearedAt = cleared.get(node);
    if (clearedAt !== undefined && depth <= clearedAt) return; // proved clean with less budget

    if (depth > MAX_PAYLOAD_DEPTH) {
      found.push(
        ceilingRefusal(
          PAYLOAD_TOO_DEEP_CODE,
          `Refused: this payload nests deeper than ${String(MAX_PAYLOAD_DEPTH)} levels, and the honesty ceiling stopped at ${path === '' ? 'the root' : path}. Everything below that point is UNCHECKED — it is not known to be clean, and a payload the guard could not finish reading may not be presented as one that passed it.`,
          DEPTH_RULE,
          {
            kind: 'supply_data',
            missing: `a payload the ceiling can walk to the bottom, or a raised depth limit justified by the shape that needs it (stopped at ${path === '' ? 'the root' : path})`,
            whoCanSupply: 'whoever owns the route or contract producing this shape',
          },
          path === '' ? null : path,
        ),
      );
      return;
    }

    onPath.add(node);
    const foundBefore = found.length;
    const cutsBefore = cycleCuts;

    /* A container whose contents no property enumeration reaches. REFUSED, not skipped:
       `[]` is what a completed clean walk returns, and handing it back for a value that was
       never read is the not-loaded/genuinely-empty collapse this module is about. Size zero
       is exempt because there is then nothing unread. */
    if (node instanceof Map || node instanceof Set) {
      if (node.size > 0) {
        const kind = node instanceof Map ? 'Map' : 'Set';
        const at = path === '' ? 'the root' : path;
        found.push(
          ceilingRefusal(
            PAYLOAD_NOT_WALKABLE_CODE,
            `Refused: this payload carries a ${kind} with ${String(node.size)} ${node.size === 1 ? 'entry' : 'entries'} at ${at}, and the honesty ceiling cannot enumerate it. Whether a forbidden field name is inside is UNKNOWN — not known to be absent — and a container the guard could not read may not be presented as one that passed it. A ${kind} also serialises to '{}', so a caller would not receive these entries at all.`,
            UNWALKABLE_RULE,
            {
              kind: 'supply_data',
              missing: `the same data as a plain object or array, so the ceiling can read its field names (a ${kind} at ${at})`,
              whoCanSupply: 'whoever owns the route or function producing this shape',
            },
            path === '' ? null : path,
          ),
        );
      }
    } else if (ArrayBuffer.isView(node) || node instanceof ArrayBuffer) {
      /* THE BYTES ARE SKIPPED. THE OBJECT IS NOT — and where the bytes cannot be skipped
         cheaply, the object is REFUSED rather than passed.
         A typed array answers any key enumeration with ONE KEY PER BYTE: measured on this
         machine, 1,000,000 keys off a 1MB `Uint8Array` costs 184ms with
         `getOwnPropertyNames` and 78ms with `Object.keys`, against 0.68ms for a whole
         realistic 4,400-key payload. A byte index is a digit string and cannot normalise to
         a forbidden name, so reading them buys nothing.
         The earlier fix skipped the whole object to avoid that, and so lost its NAMED
         properties — `Object.assign(new Uint8Array(4), { impressions: 1 })` was reported
         clean, with a test asserting that as correct. Enumerating own names and filtering
         the indices costs 0.28ms at 4,096 elements, which is the bound below; above it the
         enumeration itself is the cost, and the honest answer is that the guard did not
         look. No descent either way — the values under a byte view are bytes. */
      const elements = 'length' in node && typeof node.length === 'number' ? node.length : 0;
      if (elements > MAX_BYTE_VIEW_ELEMENTS) {
        const at = path === '' ? 'the root' : path;
        found.push(
          ceilingRefusal(
            PAYLOAD_NOT_WALKABLE_CODE,
            `Refused: this payload carries a ${elements > 0 ? 'byte view' : 'buffer'} of ${String(elements)} elements at ${at}, and the honesty ceiling did not read its field names — enumerating them would materialise one key per byte, which is the cost the ceiling refuses to pay on a read path. Whether a forbidden field name is hung on it is UNKNOWN, not known to be absent.`,
            UNWALKABLE_RULE,
            {
              kind: 'supply_data',
              missing: `the metadata as a plain object beside the bytes rather than as properties on the view, or a view of at most ${String(MAX_BYTE_VIEW_ELEMENTS)} elements (found ${String(elements)} at ${at})`,
              whoCanSupply: 'whoever owns the route or function producing this shape',
            },
            path === '' ? null : path,
          ),
        );
      } else {
        for (const key of Object.getOwnPropertyNames(node)) {
          if (INDEX_KEY.test(key)) continue;
          refuseIfForbidden(key, path === '' ? key : `${path}.${key}`);
        }
      }
    } else if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], depth + 1, `${path}[${String(i)}]`);
      }
      /* An array can also carry NAMED properties. JSON cannot produce one, a hand-built
         server-side payload can, and `{ rows: Object.assign([], { ctr: 1 }) }` would
         otherwise walk only the index side. */
      for (const key in node) {
        if (INDEX_KEY.test(key)) continue;
        visitKey(node as unknown as Record<string, unknown>, key, path === '' ? key : `${path}.${key}`, depth);
      }
    } else {
      /* `for…in`, NOT `Object.keys`. The difference is enumerable INHERITED properties:
         `Object.create({ impressions: 1 })` answered clean under `Object.keys`, because the
         banned name is on the prototype. Class methods and everything on `Object.prototype`
         are non-enumerable, so this costs nothing on an ordinary object or instance and
         closes a hole that a non-JSON server-side value can walk straight through. */
      for (const key in node) {
        visitKey(node as Record<string, unknown>, key, path === '' ? key : `${path}.${key}`, depth);
      }
    }

    onPath.delete(node);
    /* THE MEMO RECORDS A PROOF, NOT A VISIT — see the docblock. All three conditions:
       nothing found in this subtree, no cycle cut inside it, and (implied by the first) no
       truncation. Anything less and a shallower revisit could have a different, correct
       answer, which is exactly the defect the per-path guard was introduced to fix. */
    if (found.length === foundBefore && cycleCuts === cutsBefore) {
      const prior = cleared.get(node);
      if (prior === undefined || depth > prior) cleared.set(node, depth);
    }
  };

  /** One banned-name check, one refusal, one path. Used by every enumeration branch. */
  function refuseIfForbidden(key: string, where: string): boolean {
    if (!NORMALISED_FORBIDDEN.has(normaliseFieldName(key))) return false;
    found.push(
      ceilingRefusal(
        'METRIC_NOT_OBSERVABLE',
        `Refused: this payload carries a field named '${key}' at ${where}. That metric cannot be observed without an X credential, so any value in that field was inferred, proxied or invented — and the honest answer is to show the row as unavailable instead.`,
        CEILING_RULE,
        {
          kind: 'not_recoverable',
          why: 'There is no keyless source for this metric. Renaming the field would hide the problem rather than fix it.',
        },
        where,
      ),
    );
    return true;
  }

  function visitKey(node: Record<string, unknown>, key: string, where: string, depth: number): void {
    /* Do NOT descend into a refused field. The finding is the NAME, and a second banned
       name nested under an already-refused path is the same defect reported twice at a path
       nobody will render. */
    if (refuseIfForbidden(key, where)) return;
    walk(node[key], depth + 1, where);
  }

  walk(payload, 0, '');
  /* NO CAP AND NO DEDUPE, deliberately. Every entry has a distinct path, so there is
     nothing to dedupe (unlike `marketingGates.ts`, where two gates legitimately produce
     one code for one fact). A payload with 4,400 banned keys returns 4,400 refusals,
     which is the truth about that payload; the cost of finding them all is the 0.68ms
     the walk already pays. */
  return found;
}

/**
 * The single-refusal form: the FIRST violation, or `null` for a clean payload.
 *
 * Kept because callers read exactly that — `apps/web/src/lib/api/marketing.ts`'s
 * `unwrap` and `apps/api/.../marketingGatesMetrics.test.ts` both treat `null` as the
 * pass. `null` now means what it always claimed to mean: the walk finished and found
 * nothing. It no longer doubles as "the walk stopped early", which is the defect
 * `PAYLOAD_TOO_DEEP_CODE` exists to name.
 *
 * A caller building a report or a middleware response should call
 * `assertHonestPayloadAll` instead: one banned field at a time is a control that gets
 * routed around one field at a time.
 *
 * ── WHICH ONE IS "FIRST", AND WHY IT IS NOT WALK ORDER ──
 * It used to be `all[0]`, i.e. whichever the walker met first. On
 * `{ a: <33 levels>, z: { ctr: 1 } }` that is the DEPTH refusal, so the sentence and code a
 * caller renders described the payload's shape while the actual forbidden metric sat in
 * `.refusals`, which — checked, not assumed — no production surface in this repo reads. The
 * screen therefore said "too deep to verify" about a payload whose real problem was a named
 * unobservable metric.
 *
 * A NAMED FORBIDDEN FIELD OUTRANKS A CONTAINER THE WALKER COULD NOT READ. It is the more
 * actionable finding (there is a field and a path to delete, versus a shape to argue about),
 * and it is a certainty rather than an unknown. Walk order still decides between two
 * refusals of the same rank, so `{ ctr: 1, sov: 2 }` still answers `ctr`. The plural form is
 * untouched and remains in walk order — a report must not reorder its own findings.
 */
export function assertHonestPayload(payload: unknown): CeilingRefusal | null {
  const all = assertHonestPayloadAll(payload);
  if (all.length === 0) return null;
  return all.find((r) => r.code === 'METRIC_NOT_OBSERVABLE') ?? all[0]!;
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

/**
 * A WHOLE-PERCENT SHARE THAT CANNOT ROUND ITS WAY TO "ALL" OR TO "NONE".
 *
 * ══ THE DEFECT THIS EXISTS TO KILL, WITH THE FAILING INPUT ══
 * `observedRate` above reports `pct` to one decimal, so 199 of 200 is `99.5` and reads as
 * what it is. A panel that wanted a whole number re-implemented the arithmetic instead of
 * calling this file — `Math.round((withPostTime / openRows) * 100)` — and 199 of 200
 * rendered as **`100%`** in a headline whose own docblock said it was written to stop
 * exactly that. 398/400 and 999/1000 do the same, and the queue's coverage query has no
 * cap, so a desk with 200-plus open rows reaches it in the ordinary course. The guard test
 * beside it used 70/120 → 58%, so `queryByText('100%')` passed trivially and would have
 * kept passing at 199/200.
 *
 * ══ THE RULE, WHICH IS AN EXACTNESS RULE AND NOT A ROUNDING PREFERENCE ══
 * The two endpoints of this scale are the only two values a reader treats as claims about
 * the population rather than as approximations. `100` asserts "every one of them"; `0`
 * asserts "not a single one". So each is returned if and only if it is literally true, and
 * every genuinely partial share is clamped into `[1, 99]`. A share of 99.5% displays as
 * `99` — understated, which is the safe direction here, because the number is a coverage
 * figure and the cost of overstating it is a reader trusting a clock that has holes in it.
 *
 * `null` for a denominator that cannot carry a share: absent, never `0`. A caller that
 * gets `null` must render its refusal sentence, not a dash beside a confident label.
 *
 * WHY IT LIVES HERE. The barrel above this compartment records fourteen collisions, ten of
 * them process metrics implemented twice, and states the reason: "a second implementation
 * of a threshold is how a suppressed rate becomes an expressed one." This is that, in the
 * one direction that hands an operator a false certainty about their own desk. One
 * implementation, in the file that owns honest measurement.
 */
export function partialSharePct(part: number, whole: number): number | null {
  if (!Number.isInteger(part) || !Number.isInteger(whole)) return null;
  if (whole <= 0 || part < 0 || part > whole) return null;
  if (part === 0) return 0;
  if (part === whole) return 100;
  return Math.min(99, Math.max(1, Math.round((part / whole) * 100)));
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
