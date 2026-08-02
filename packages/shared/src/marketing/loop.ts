/**
 * MARKETING M8 — HONEST MEASUREMENT AND THE LOOP.
 *
 * This is the file where tools of this kind lie, so the constraint is stated first and
 * carried in the API surface rather than in a comment.
 *
 * THE ONLY OUTCOME SIGNAL AVAILABLE WITHOUT A CREDENTIAL is what arrives in X
 * notification email. That is not a sample. It is a census of one edge type in a graph
 * centred on LCX — items that mentioned, replied to or quoted us, AND triggered a
 * notification, AND survived a forwarding rule nobody in this repo can enumerate.
 * Delivery is controversy-weighted and X batches and throttles it silently. There is
 * therefore no denominator, so nothing here divides by one. Every count from that
 * channel is a LOWER BOUND (`LowerBound`, `types.ts`), and every figure carries the
 * `ObservationFrame` that says what its window could and could not see. A figure with
 * no frame does not render; it refuses.
 *
 * WHAT THIS FILE THEREFORE MEASURES IS THE DESK, NOT THE MARKET. Refusal codes by
 * frequency — the only honest read on whether the gates are load-bearing or
 * ornamental. Precleared-derivation rate. Claim-provenance rate. Contradiction debt
 * and line staleness, both COPIED from `precedent.ts` and never recomputed here, for
 * the reason `gps/loop.ts:10-12` gives: a second implementation of a threshold is how
 * a suppressed rate becomes an expressed one. Retraction count. Next-update breaches.
 * Per-role clearance latency. Time-to-first-statement against budget. That list is
 * less flattering than a reach chart and it cannot be gamed by an integration outage.
 *
 * WHAT IT REFUSES, IN CODE AND NOT IN A README: whether a post "performed". More
 * observed replies can mean a better post or an angrier one, and with this data the two
 * are indistinguishable — `refuseOutcomeComparison` says that sentence and cites why.
 * `MarketingVolumeStatement` carries `measuresPerformance: false` and `ranksAngles:
 * false` as LITERAL types, so an edit that starts ranking angles cannot keep this shape
 * without a compile error. That is the same device `gps/loop.ts:94-109` uses, applied
 * to a different lie.
 *
 * A LOOP THAT PRODUCES NO CHANGE IS DECORATION. The post-mortem structure (§6) has
 * four required parts — what was said, what was refused, what was learned, what
 * changed — and it reports `producedNoChange: true` visibly rather than letting an
 * empty change list pass as a completed review. It does not block; it names.
 *
 * Pure and total: no I/O, no DB, no clock, no randomness. `asOf` and every window
 * boundary are supplied by the caller.
 */
import {
  PROCESS_METRIC_KEYS,
  REFUSAL_CODES,
  REFUSED_METRICS,
  type ActorId,
  type ClearanceRole,
  type Figure,
  type IncidentPhase,
  type Instant,
  type ObservationFrame,
  type ProcessMetricKey,
  type RefusalCode,
  type RefusedMetricKey,
  type Refusal,
  type RuleCitation,
  INSTRUMENTS,
} from './types.js';
import {
  contradictionDebt,
  questionCoverage,
  stalenessOf,
  type ContradictionDebt,
  type PrecedentStatement,
  type QuantitativeAssertion,
  type StalenessVerdict,
} from './precedent.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE VOLUME STATEMENT — the constraint, in the response                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Carried on every response this module produces. Literal-typed on purpose.
 *
 * None of these fields is a feature flag and none is "false for now". They describe
 * what the available data can support: an inbound corpus with no denominator and a desk
 * publishing a handful of items a week cannot answer a performance question at any
 * sample size, because the missing thing is the population and not the count.
 * Anything that wants to flip one of these has to change this type, and changing this
 * type is a review — which is the point.
 */
export interface MarketingVolumeStatement {
  /** Permanently true. Repliers chose to reply; they are not a sample of an audience. */
  readonly sampleIsSelfSelected: true;
  /** Permanently true. Notification counts are censored from below by design. */
  readonly countsAreLowerBounds: true;
  /** Permanently false. There is no population frame to train against. */
  readonly isTrainableDataset: false;
  /** Permanently false. This module counts and reports; it does not learn. */
  readonly learns: false;
  /** Permanently false. It will not say which angle or pillar did better. */
  readonly ranksAngles: false;
  /** Permanently false. Performance needs a denominator that does not exist. */
  readonly measuresPerformance: false;
  /** Renderable, verbatim, next to any figure derived from inbound mail. */
  readonly statement: string;
}

export const MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK =
  'This module measures the desk, not the market. Counts from notification email are lower bounds on a self-selected, controversy-weighted set of replies with no denominator, so nothing here is expressed as a rate over an audience, and no post is compared to another for performance.';

export const MARKETING_VOLUME_STATEMENT: MarketingVolumeStatement = {
  sampleIsSelfSelected: true,
  countsAreLowerBounds: true,
  isTrainableDataset: false,
  learns: false,
  ranksAngles: false,
  measuresPerformance: false,
  statement: MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
};

/**
 * Compile-time proof that every family in the honesty ceiling still has an entry in
 * `REFUSED_METRICS`. If someone deletes one of these keys from `types.ts`, `tsc` fails
 * here instead of a panel quietly acquiring a tile for it.
 */
const _ceilingIsCovered: readonly RefusedMetricKey[] = [
  'impressions',
  'reach',
  'follower_delta',
  'engagement_rate',
  'click_through_rate',
  'share_of_voice',
  'audience_sentiment',
];
void _ceilingIsCovered;

/** Stamped onto every refusal this module emits. */
export const LOOP_RULESET_VERSION = 1;

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
): Refusal {
  return { code, sentence, rule, recovery, matched: null, ruleSetVersion: LOOP_RULESET_VERSION };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE TWO FRAMES — our own records, and the inbound census                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The frame for a metric computed over the desk's OWN records — drafts, clearances,
 * refusals, statements, silences. `completeness` is `census_of_own_corpus` because we
 * hold all of them, which is exactly why the process metrics are defensible and the
 * audience metrics are not.
 *
 * KNOWN IMPRECISION, named rather than hidden: `ObservationFrame.source` is an
 * `InboundSourceKind`, and that union has no member meaning "our own records" — it
 * enumerates ways things arrive from outside. `operator_paste` is the closest honest
 * choice, since these records exist because colleagues entered them. The frame's
 * `captures` string says what the population really is so nothing downstream reads the
 * source field as a claim that this data came from X. Adding an `own_records` member
 * belongs to whoever owns `types.ts`, not to this file.
 */
export function ownRecordsFrame(
  windowFrom: Instant,
  windowTo: Instant,
  options?: { readonly truncatedByRetention?: boolean },
): ObservationFrame {
  const doesNotCapture = [
    'anything the desk did without recording it here',
    'text a colleague published without pasting it back',
    'decisions taken in chat or in a call and never entered',
  ];
  if (options?.truncatedByRetention === true) {
    doesNotCapture.push(
      'anything before the retention boundary — the 90-day sweep removes the queue these records were derived from',
    );
  }
  return {
    source: 'operator_paste',
    captures:
      "the desk's own records inside the window: drafts, refusals, clearances, published close-outs, recorded statements and recorded silences. The population is ours, so this is a census rather than a sample.",
    doesNotCapture,
    knownBiases: [
      'a process that is not recorded is invisible, so improvements in recording look like changes in behaviour',
    ],
    completeness: 'census_of_own_corpus',
    windowFrom,
    windowTo,
    lastSuccessfulPollAt: null,
  };
}

/**
 * The frame for anything derived from X notification email. The absences and biases
 * are the researched ones and they are not editable downstream — a caller may set the
 * window and the last poll time, and nothing else.
 */
export function notificationCensusFrame(
  windowFrom: Instant,
  windowTo: Instant,
  lastSuccessfulPollAt: Instant | null,
): ObservationFrame {
  return {
    source: 'x_notification_email',
    captures:
      'mentions, replies and quotes directed at the LCX handle, as delivered by email and as parsed. Counts are lower bounds.',
    doesNotCapture: [
      'posts that do not mention us',
      'posts X chose not to email about, including anything batched into a digest',
      'anything the forwarding rule filtered out',
      'deleted posts, and posts with a limited audience',
      'every platform we do not receive mail from',
    ],
    knownBiases: [
      'controversy-weighted delivery: an angry thread emails more reliably than a quiet one',
      'platform-side filtering and throttling, applied without telling the recipient',
      'email delivery gaps, which reduce counts with no error anywhere',
    ],
    completeness: 'unknown_no_denominator',
    windowFrom,
    windowTo,
    lastSuccessfulPollAt,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE SUPPRESSIBLE PROCESS RATE — the null that must survive the wire       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Below this many items in the denominator, a percentage is not expressed.
 *
 * The device is `gps/calibration.ts`'s `MIN_N_FOR_RATE`, deliberately re-derived rather
 * than imported: 8 there is a claim about decided consulting engagements, and reusing
 * that number here would smuggle one domain's volume assumption into another. 10 is a
 * desk policy, chosen because "50% of the desk's drafts were precleared" off two drafts
 * is the sentence this threshold exists to prevent.
 */
export const MIN_N_FOR_PROCESS_RATE = 10;

/**
 * Whole minutes between two instants, or null when either does not parse.
 *
 * Null propagates into a reported `unreadableDates` count rather than into a zero: a
 * clearance whose timestamps cannot be read is not an instant clearance, and it must not
 * pull a median down.
 */
export function minutesBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60_000);
}

/**
 * A rate that may not be expressible, plus everything needed to render the refusal
 * instead.
 *
 * `pct: number | null`, NEVER `number`, and there is no `fallback` parameter: the only
 * way to get a number out of this when the threshold withheld one is to edit this
 * function, and a colocated test forbids that. `counts` is populated at every n
 * including zero, so a renderer always has something honest to print.
 */
export interface ProcessRate {
  readonly metric: ProcessMetricKey;
  /** Whole percent, or null when suppressed. Zero means zero, not "unknown". */
  readonly pct: number | null;
  readonly numerator: number;
  readonly denominator: number;
  readonly minN: number;
  readonly suppressed: boolean;
  /** Plain language, present exactly when `suppressed`. */
  readonly suppressionReason: string | null;
  /** What the numerator and denominator actually count, in words. */
  readonly definition: string;
  readonly frame: ObservationFrame;
}

/**
 * Build a process rate. Rounds to whole percent, which is all the precision a
 * two-digit denominator can carry.
 *
 * A denominator of zero is suppressed with its own sentence: nothing happened, which is
 * a different fact from "too few to express" and must not read as 0%.
 */
export function processRate(
  metric: ProcessMetricKey,
  numerator: number,
  denominator: number,
  definition: string,
  frame: ObservationFrame,
): ProcessRate {
  const suppressed = denominator < MIN_N_FOR_PROCESS_RATE;
  const suppressionReason =
    denominator === 0
      ? 'Nothing in the window to measure. This is an empty population, not a rate of zero.'
      : suppressed
        ? `${denominator} item${denominator === 1 ? '' : 's'} in the window is below the stated minimum of ${MIN_N_FOR_PROCESS_RATE}. The counts are the finding.`
        : null;
  return {
    metric,
    pct: suppressed ? null : Math.round((numerator / denominator) * 100),
    numerator,
    denominator,
    minN: MIN_N_FOR_PROCESS_RATE,
    suppressed,
    suppressionReason,
    definition,
    frame,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 WHAT CANNOT BE LEARNED — the refusals, with their arithmetic              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ask for a metric on the ceiling and get a typed no with a reason and a substitute,
 * rendered where the tile would have been.
 *
 * `REFUSED_METRICS` already holds the reasons (`types.ts`); this function turns one into
 * a `Refusal` so the surface handles it through the same path as every other refusal
 * instead of special-casing "missing tile".
 */
export function refuseUnobservableMetric(key: RefusedMetricKey): Refusal {
  const entry = REFUSED_METRICS[key];
  const substitute =
    entry.substitute === ''
      ? ' There is no honest substitute, so nothing is shown in its place.'
      : ` Instead: ${entry.substitute}`;
  return refusal(
    'METRIC_NOT_OBSERVABLE',
    `${key.replace(/_/g, ' ')} cannot be shown. ${entry.reason}${substitute}`,
    DESK_POLICY(
      'measurement.honesty_ceiling',
      'A metric that needs a denominator the compartment does not hold is refused with its reason and its substitute, never estimated and never rendered as zero.',
    ),
    entry.substitute === ''
      ? {
          kind: 'not_recoverable',
          why: 'It requires an X API credential or analytics access the compartment does not have and will not have.',
        }
      : { kind: 'different_surface', suggestion: entry.substitute },
  );
}

/**
 * The refusal at the centre of this file: did this post perform?
 *
 * Stated as arithmetic rather than as caution. `repliesObserved` is a lower bound on a
 * controversy-weighted delivery channel. Comparing two of them compares two lower
 * bounds of unknown and different tightness, and the direction of the difference is
 * uninterpretable: more replies can mean a better post or an angrier one. Nothing in
 * the available data separates those two, so the comparison is refused rather than
 * hedged.
 */
export function refuseOutcomeComparison(subject: string): Refusal {
  return refusal(
    'METRIC_NOT_OBSERVABLE',
    `Whether ${subject} performed cannot be answered here. Observed reply counts are lower bounds on a controversy-weighted channel with no denominator, so comparing two of them compares two lower bounds of unknown tightness — and more replies can mean a better post or an angrier one, which this data cannot separate.`,
    DESK_POLICY(
      'measurement.no_performance_claim',
      'The compartment does not assert that one item performed better than another. It reports counts, states them as lower bounds, states the N, and stops.',
    ),
    {
      kind: 'not_recoverable',
      why: 'The missing thing is the population, not the sample size. No amount of further collection through this channel supplies it.',
    },
  );
}

/**
 * The refusal that keeps the loop from becoming an optimiser: which angle, pillar or
 * message worked best.
 *
 * A handful of posts a month across several pillars, each measured by a censored count
 * of a self-selected set, is an interpolation of noise. Any ranking emitted from it
 * would be a lie with a chart attached.
 */
export function refuseAngleRanking(): Refusal {
  return refusal(
    'METRIC_NOT_OBSERVABLE',
    'This instrument will not rank angles or pillars against each other. A few posts a month, split across pillars, each measured by a censored count of a self-selected set of repliers, cannot support a comparison — a ranking off that data would be noise presented as a finding.',
    DESK_POLICY(
      'measurement.no_ranking',
      'The loop produces a packet for a human to read, never a ranking. Counts, N, and the frame — then it stops.',
    ),
    {
      kind: 'not_recoverable',
      why: 'The comparison needs a population frame per arm, and the channel provides none.',
    },
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 WHAT CAN BE LEARNED — the process metrics, each with its frame            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Wrap a value that may be genuinely unobservable.
 *
 * The distinction this exists to keep: a count of zero and an unavailable source are
 * different facts. `null` here means "the desk could not see", and it produces a
 * refusal a surface can render in place of the tile — never a 0 (doctrine rule 3).
 */
export function figureOrRefusal<T>(
  value: T | null,
  frame: ObservationFrame,
  metricName: string,
  whyUnavailable: string,
): Figure<T> {
  if (value == null) {
    return {
      kind: 'absent',
      refusal: refusal(
        'DATA_ABSENT_NOT_ZERO',
        `${metricName} is not being shown because the records it needs were not available for this window: ${whyUnavailable}. This is not a count of zero.`,
        DESK_POLICY(
          'measurement.absent_is_not_zero',
          'An unavailable source renders as a refusal naming what was missing, never as a zero, because a zero and an absence look identical on a chart and mean opposite things.',
        ),
        { kind: 'supply_data', missing: metricName, whoCanSupply: 'the desk, by recording the underlying items' },
      ),
    };
  }
  return { kind: 'measured', value, frame };
}

/* ──── 5.1 Refusal codes by frequency — the honest read on the gates ──── */

export interface RefusalEvent {
  readonly code: RefusalCode;
  readonly at: Instant;
  /** The item the refusal fired on. Ids only; never the refused text. */
  readonly itemId: string;
}

export interface RefusalFrequencyRow {
  readonly code: RefusalCode;
  readonly count: number;
}

/**
 * Counts by refusal code, plus the codes that never fired.
 *
 * The never-fired list is the reason this is worth building. A gate that has never
 * fired is either perfect or dead, and NOTHING IN THE DATA DISTINGUISHES THOSE TWO —
 * `neverFiredMeaning` says exactly that, so the panel cannot imply the gates are
 * healthy just because the list is long.
 *
 * Ordered by count descending, then by code ascending, so the same window always
 * renders in the same order.
 */
export interface RefusalFrequency {
  readonly rows: readonly RefusalFrequencyRow[];
  readonly total: number;
  readonly distinctCodes: number;
  readonly neverFired: readonly RefusalCode[];
  readonly neverFiredMeaning: string;
  readonly frame: ObservationFrame;
  readonly lines: readonly string[];
}

export function refusalCodeFrequency(
  events: readonly RefusalEvent[],
  frame: ObservationFrame,
): RefusalFrequency {
  const counts = new Map<RefusalCode, number>();
  for (const e of events) counts.set(e.code, (counts.get(e.code) ?? 0) + 1);

  const rows = [...counts.entries()]
    .map(([code, count]): RefusalFrequencyRow => ({ code, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.code < b.code ? -1 : 1));

  const neverFired = REFUSAL_CODES.filter((c) => !counts.has(c));

  const lines = [
    events.length === 0
      ? 'No refusal fired in this window. That is not evidence the gates are working — with a quiet week it is also what a broken gate looks like.'
      : `${events.length} refusal${events.length === 1 ? '' : 's'} fired across ${rows.length} distinct code${rows.length === 1 ? '' : 's'}.`,
    ...rows.slice(0, 10).map((r) => `${r.code}: ${r.count}`),
    `${neverFired.length} of ${REFUSAL_CODES.length} codes have never fired in this window.`,
  ];

  return {
    rows,
    total: events.length,
    distinctCodes: rows.length,
    neverFired,
    neverFiredMeaning:
      'A code that never fired is either a gate nothing has tripped or a gate that no longer works. This instrument cannot tell those apart, and does not claim to.',
    frame,
    lines,
  };
}

/* ──── 5.2 Precleared derivation and claim provenance ──── */

/** One item the desk published or cleared in the window. Our own words only. */
export interface DeskItemRecord {
  readonly id: string;
  readonly at: Instant;
  /** The cleared-language entry it derived from, or null when written fresh. */
  readonly derivedFromApprovedLanguageId: string | null;
  /** Figures the item asserted, with their source references. */
  readonly quantitative: readonly QuantitativeAssertion[];
}

/**
 * How much of what the desk said was derived from language already cleared, rather
 * than improvised. CERC's core preparedness prescription, as a number.
 */
export function preclearedDerivationRate(
  items: readonly DeskItemRecord[],
  frame: ObservationFrame,
): ProcessRate {
  const derived = items.filter((i) => i.derivedFromApprovedLanguageId != null).length;
  return processRate(
    'precleared_derivation_rate',
    derived,
    items.length,
    'Items derived from a cleared-language entry, over all items the desk cleared or published in the window.',
    frame,
  );
}

/**
 * How many of the figures the desk asserted carried a source reference.
 *
 * The denominator is ASSERTIONS, not items: one post with four unsourced numbers is
 * four defects, and counting it as one item would flatter it.
 */
export function claimProvenanceRate(
  items: readonly DeskItemRecord[],
  frame: ObservationFrame,
): ProcessRate {
  const assertions = items.flatMap((i) => i.quantitative);
  const sourced = assertions.filter((a) => a.sourceRef != null && a.sourceRef.trim() !== '').length;
  return processRate(
    'claim_provenance_rate',
    sourced,
    assertions.length,
    'Quantitative assertions carrying a source reference, over all quantitative assertions the desk made in the window.',
    frame,
  );
}

/* ──── 5.3 Per-role clearance latency ──── */

export interface ClearanceLatencyRecord {
  readonly role: ClearanceRole;
  readonly requestedAt: Instant;
  readonly clearedAt: Instant;
  readonly reviewer: ActorId;
}

/**
 * One lane's hold time.
 *
 * `medianMinutes` is withheld below `MIN_N_FOR_PROCESS_RATE` and `observations` carries
 * every individual latency instead, because the median of three numbers is those three
 * numbers with information thrown away. Showing the three is more useful and less
 * misleading than showing their middle value as a summary statistic.
 */
export interface ClearanceLatencyRow {
  readonly role: ClearanceRole;
  readonly n: number;
  readonly observations: readonly number[];
  readonly medianMinutes: number | null;
  readonly slowestMinutes: number | null;
  readonly suppressionReason: string | null;
  readonly sentence: string;
}

const CLEARANCE_ROLES_ALL: readonly ClearanceRole[] = ['reputation', 'policy', 'sme', 'legal'];

/**
 * Which lane is the bottleneck, before a crisis proves it.
 *
 * Every role is reported including the ones with no observations: a lane that cleared
 * nothing is the most interesting row on the table, and dropping empty rows hides it.
 */
export function clearanceLatencyByRole(
  records: readonly ClearanceLatencyRecord[],
  frame: ObservationFrame,
): { readonly rows: readonly ClearanceLatencyRow[]; readonly frame: ObservationFrame; readonly unreadableDates: number } {
  let unreadableDates = 0;
  const rows = CLEARANCE_ROLES_ALL.map((role): ClearanceLatencyRow => {
    const mine = records.filter((r) => r.role === role);
    const minutes: number[] = [];
    for (const r of mine) {
      const elapsed = minutesBetween(r.requestedAt, r.clearedAt);
      if (elapsed == null) {
        unreadableDates += 1;
        continue;
      }
      minutes.push(elapsed);
    }
    minutes.sort((a, b) => a - b);
    const n = minutes.length;
    const suppressed = n < MIN_N_FOR_PROCESS_RATE;
    const median =
      n === 0 || suppressed
        ? null
        : n % 2 === 1
          ? minutes[(n - 1) / 2]!
          : Math.round((minutes[n / 2 - 1]! + minutes[n / 2]!) / 2);
    return {
      role,
      n,
      observations: minutes,
      medianMinutes: median,
      slowestMinutes: n === 0 ? null : minutes[n - 1]!,
      suppressionReason:
        n === 0
          ? 'This lane cleared nothing in the window. That is an empty population, not a fast lane.'
          : suppressed
            ? `${n} observation${n === 1 ? '' : 's'} is below the stated minimum of ${MIN_N_FOR_PROCESS_RATE} for a median; the individual hold times are listed instead.`
            : null,
      sentence:
        n === 0
          ? `${role}: nothing cleared in this window.`
          : suppressed
            ? `${role}: ${n} clearance${n === 1 ? '' : 's'}, hold times ${minutes.join(', ')} minutes. No median at this n.`
            : `${role}: median ${median} minutes over ${n} clearances, slowest ${minutes[n - 1]}.`,
    };
  });
  return { rows, frame, unreadableDates };
}

/* ──── 5.4 Time to first statement, against budget ──── */

export interface FirstStatementRecord {
  readonly incidentId: string;
  readonly detectedAt: Instant;
  /** Null while the desk has still said nothing. */
  readonly firstStatementAt: Instant | null;
  /** The budget the desk set for this severity, in minutes. */
  readonly budgetMinutes: number;
}

/**
 * One incident's clock. Reported PER INCIDENT and never averaged.
 *
 * The reason it exists at all: on 9 March 2023 more than $40bn of withdrawal requests
 * hit Silicon Valley Bank in a single day. A desk that discovers its clearance path is
 * too slow during the incident discovers it too late, which is why the budget is stated
 * in advance and the breach is counted afterwards.
 *
 * `stillSilent` is a breach when the budget has already elapsed. Waiting is a decision
 * with a clock on it, not an absence of data.
 */
export interface FirstStatementRow {
  readonly incidentId: string;
  readonly elapsedMinutes: number | null;
  readonly budgetMinutes: number;
  readonly stillSilent: boolean;
  /** Null when the elapsed time could not be computed — never defaulted to "met". */
  readonly withinBudget: boolean | null;
  readonly sentence: string;
}

export function timeToFirstStatement(
  records: readonly FirstStatementRecord[],
  asOf: Instant,
  frame: ObservationFrame,
): {
  readonly rows: readonly FirstStatementRow[];
  readonly breachCount: number;
  readonly stillSilentCount: number;
  readonly notAssessable: number;
  readonly averageIsWithheld: string;
  readonly frame: ObservationFrame;
} {
  const rows = records.map((r): FirstStatementRow => {
    const stillSilent = r.firstStatementAt == null;
    const elapsed = minutesBetween(r.detectedAt, r.firstStatementAt ?? asOf);
    const withinBudget = elapsed == null ? null : elapsed <= r.budgetMinutes;
    return {
      incidentId: r.incidentId,
      elapsedMinutes: elapsed,
      budgetMinutes: r.budgetMinutes,
      stillSilent,
      withinBudget,
      sentence:
        elapsed == null
          ? `${r.incidentId}: the clock could not be read from the dates on file, so whether the budget was met is unknown.`
          : stillSilent
            ? `${r.incidentId}: still no statement after ${elapsed} minutes against a ${r.budgetMinutes}-minute budget.`
            : `${r.incidentId}: first statement after ${elapsed} minutes against a ${r.budgetMinutes}-minute budget — ${withinBudget === true ? 'within' : 'over'}.`,
    };
  });
  return {
    rows,
    breachCount: rows.filter((r) => r.withinBudget === false).length,
    stillSilentCount: rows.filter((r) => r.stillSilent).length,
    notAssessable: rows.filter((r) => r.withinBudget == null).length,
    averageIsWithheld:
      'No mean or median is offered across incidents. Incidents differ in severity and budget, so an average time-to-first-statement would compare clocks that were never set to the same target.',
    frame,
  };
}

/* ──── 5.5 next-update-by breaches ──── */

export interface NextUpdateCommitment {
  readonly itemId: string;
  readonly committedBy: ActorId;
  readonly nextUpdateBy: Instant;
  /** Null while the promised update has not been made. */
  readonly fulfilledAt: Instant | null;
}

/**
 * "Be credible" as a countable failure. A committed update time that passed without an
 * update is a breach whether or not anyone noticed.
 *
 * `recordsAvailable: false` produces a refusal rather than a zero — see
 * `figureOrRefusal`. Zero breaches and no records look identical in a count and mean
 * opposite things.
 */
export function nextUpdateBreachCount(
  input: { readonly commitments: readonly NextUpdateCommitment[]; readonly recordsAvailable: boolean },
  asOf: Instant,
  frame: ObservationFrame,
): {
  readonly count: Figure<number>;
  readonly breachedItemIds: readonly string[];
  readonly openCommitments: number;
  readonly sentence: string;
} {
  if (!input.recordsAvailable) {
    return {
      count: figureOrRefusal<number>(
        null,
        frame,
        'Next-update breaches',
        'the commitment records for this window were not available',
      ),
      breachedItemIds: [],
      openCommitments: 0,
      sentence: 'Next-update breaches: unknown for this window — the commitment records were not available.',
    };
  }
  const breached = input.commitments.filter((c) => {
    const deadline = Date.parse(c.nextUpdateBy);
    if (Number.isNaN(deadline)) return false;
    if (c.fulfilledAt == null) {
      const now = Date.parse(asOf);
      return !Number.isNaN(now) && now > deadline;
    }
    const done = Date.parse(c.fulfilledAt);
    return !Number.isNaN(done) && done > deadline;
  });
  const open = input.commitments.filter((c) => c.fulfilledAt == null).length;
  return {
    count: figureOrRefusal<number>(breached.length, frame, 'Next-update breaches', ''),
    breachedItemIds: breached.map((c) => c.itemId),
    openCommitments: open,
    sentence:
      breached.length === 0
        ? `No committed update time was missed across ${input.commitments.length} commitment${input.commitments.length === 1 ? '' : 's'} in the window.`
        : `${breached.length} committed update time${breached.length === 1 ? '' : 's'} missed: ${breached.map((c) => c.itemId).join(', ')}.`,
  };
}

/* ──── 5.6 Retractions — and why a deletion is not one ──── */

export interface RetractionRecord {
  readonly itemId: string;
  /** The item this corrects or withdraws. */
  readonly supersedes: string;
  readonly at: Instant;
  readonly reason: string;
}

/**
 * The only accuracy metric the desk can compute about itself.
 *
 * Deletions are counted SEPARATELY and are not retractions. SEC v. Bankman-Fried
 * records both a tweet and its deletion; the deletion destroyed the evidence of the
 * correction while preserving none of the original. A desk with many deletions and no
 * linked retractions is not accurate, it is unaccountable — so the two numbers sit next
 * to each other and the sentence says which is which.
 */
export function retractionCount(
  input: {
    readonly retractions: readonly RetractionRecord[];
    /** Items removed with no linked correction object. A finding, not a retraction. */
    readonly deletionsWithNoLinkedRecord: number;
    readonly recordsAvailable: boolean;
  },
  frame: ObservationFrame,
): {
  readonly linkedRetractions: Figure<number>;
  readonly deletionsWithNoLinkedRecord: number;
  readonly sentence: string;
} {
  if (!input.recordsAvailable) {
    return {
      linkedRetractions: figureOrRefusal<number>(
        null,
        frame,
        'Retractions',
        'the correction records for this window were not available',
      ),
      deletionsWithNoLinkedRecord: input.deletionsWithNoLinkedRecord,
      sentence: 'Retractions: unknown for this window — the correction records were not available.',
    };
  }
  return {
    linkedRetractions: figureOrRefusal<number>(input.retractions.length, frame, 'Retractions', ''),
    deletionsWithNoLinkedRecord: input.deletionsWithNoLinkedRecord,
    sentence: `${input.retractions.length} linked retraction${input.retractions.length === 1 ? '' : 's'} in the window, and ${input.deletionsWithNoLinkedRecord} item${input.deletionsWithNoLinkedRecord === 1 ? '' : 's'} removed with no linked correction record. A deletion is not a retraction: it removes the post and the evidence together.`,
  };
}

/* ──── 5.7 Crisis discipline and triage integrity ──── */

export interface CrisisStatementRecord {
  readonly id: string;
  readonly phase: IncidentPhase;
  /** Whether the statement's notKnown section actually said something. */
  readonly notKnownIsNonEmpty: boolean;
}

/**
 * The proxy for the anti-over-reassurance rule: how often an initial-phase statement
 * admitted what the desk did not yet know.
 *
 * The denominator is INITIAL-phase statements only. A maintenance-phase update with an
 * empty notKnown section is not the same defect, and pooling them would dilute the one
 * number that tracks the failure SEC v. Bankman-Fried ¶78 pleads as fraud.
 */
export function notKnownNonEmptyRate(
  statements: readonly CrisisStatementRecord[],
  frame: ObservationFrame,
): ProcessRate {
  const initial = statements.filter((s) => s.phase === 'initial');
  return processRate(
    'not_known_non_empty_rate',
    initial.filter((s) => s.notKnownIsNonEmpty).length,
    initial.length,
    'Initial-phase statements whose notKnown section was non-empty, over all initial-phase statements in the window.',
    frame,
  );
}

export interface TriageClosureRecord {
  readonly itemId: string;
  readonly closedAsIgnore: boolean;
  /** The recorded reason. Null or blank is the defect this metric counts. */
  readonly rationale: string | null;
}

/**
 * The integrity of the silence record: of the items the desk decided not to answer, how
 * many carry a reason a colleague could read six months later.
 *
 * A decision not to speak is a decision. An `ignore` with no rationale is
 * indistinguishable from an oversight, which is exactly the state that makes "why didn't
 * we say anything?" unanswerable.
 */
export function ignoreWithRationaleRate(
  closures: readonly TriageClosureRecord[],
  frame: ObservationFrame,
): ProcessRate {
  const ignored = closures.filter((c) => c.closedAsIgnore);
  const withReason = ignored.filter((c) => c.rationale != null && c.rationale.trim() !== '').length;
  return processRate(
    'ignore_with_rationale_rate',
    withReason,
    ignored.length,
    'Items closed without an answer that carry a recorded rationale, over all items closed without an answer in the window.',
    frame,
  );
}

/* ──── 5.8 Contradiction debt and line staleness — COPIED from precedent.ts ──── */

/**
 * The debt figure, lifted onto the measurement surface WITHOUT recomputation.
 *
 * `precedent.ts` owns the definition of the four axes and the standing/superseded
 * filter. This function calls it and copies the result. There is deliberately no
 * second threshold and no re-derivation here: a debt number that differs between the
 * desk panel and the weekly review is worse than either number alone, because the
 * argument then becomes about the tool.
 */
export interface ContradictionDebtMetric {
  readonly count: number;
  readonly byAxis: ContradictionDebt['byAxis'];
  /** Differences shown to a human and deliberately not counted. */
  readonly softFlagCount: number;
  readonly standingCompared: number;
  readonly definition: string;
  readonly frame: ObservationFrame;
  readonly sentence: string;
}

export function contradictionDebtMetric(
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  frame: ObservationFrame,
  options?: { readonly truncatedByRetention?: boolean },
): ContradictionDebtMetric {
  const debt: ContradictionDebt = contradictionDebt(corpus, asOf, options);
  return {
    count: debt.count,
    byAxis: debt.byAxis,
    softFlagCount: debt.softFlags.length,
    standingCompared: debt.standingCompared,
    definition: debt.definition,
    frame,
    sentence:
      debt.standingCompared === 0
        ? 'Contradiction debt: not computable — the precedent index holds no standing statements to compare. This is not a debt of zero.'
        : `Contradiction debt: ${debt.count} across ${debt.standingCompared} standing statements, with ${debt.softFlags.length} further difference${debt.softFlags.length === 1 ? '' : 's'} shown but deliberately not counted.`,
  };
}

/**
 * Line staleness as counts by verdict, copied from `precedent.ts`'s `stalenessOf`.
 *
 * Counts, not a rate: "84% of our lines are current" invites a target, and the useful
 * question is which lines are overdue rather than what fraction. `notAssessable` is
 * reported separately and never folded into `current`.
 */
export interface LineStalenessMetric {
  readonly byVerdict: Record<StalenessVerdict, number>;
  readonly staleStatementIds: readonly string[];
  readonly standingConsidered: number;
  readonly axesNotCheckedCount: number;
  readonly frame: ObservationFrame;
  readonly sentence: string;
}

export function lineStalenessMetric(
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  frame: ObservationFrame,
  currentClaimVersions?: ReadonlyMap<string, number>,
): LineStalenessMetric {
  const byVerdict: Record<StalenessVerdict, number> = {
    not_assessable: 0,
    rests_on_expired_claim: 0,
    rests_on_moved_claim_version: 0,
    review_overdue: 0,
    past_horizon: 0,
    current: 0,
  };
  const staleStatementIds: string[] = [];
  let axesNotCheckedCount = 0;
  const standing = corpus.filter((s) => s.standing === 'standing');
  for (const s of standing) {
    const assessment = stalenessOf(s, asOf, currentClaimVersions);
    byVerdict[assessment.verdict] += 1;
    if (assessment.verdict !== 'current') staleStatementIds.push(s.id);
    if (assessment.axesNotChecked.length > 0) axesNotCheckedCount += 1;
  }
  return {
    byVerdict,
    staleStatementIds,
    standingConsidered: standing.length,
    axesNotCheckedCount,
    frame,
    sentence:
      standing.length === 0
        ? 'Line staleness: nothing standing to assess.'
        : `Line staleness: ${staleStatementIds.length} of ${standing.length} standing statements are not current — ${byVerdict.rests_on_expired_claim} rest on an expired claim, ${byVerdict.review_overdue} are past a scheduled review, ${byVerdict.past_horizon} are past their horizon, and ${byVerdict.not_assessable} could not be assessed at all.`,
  };
}

/* ──── 5.9 Question coverage — copied from precedent.ts ──── */

export interface QuestionCoverageMetric {
  readonly covered: number;
  readonly total: number;
  readonly uncoveredKeys: readonly string[];
  readonly caveat: string;
  readonly frame: ObservationFrame;
  readonly sentence: string;
}

/**
 * How much of the anticipated-question set has a standing answer on file.
 *
 * A count and a list, not a percentage: the useful output is WHICH questions the desk
 * cannot answer consistently, and a coverage percentage hides exactly that.
 */
export function questionCoverageMetric(
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  frame: ObservationFrame,
): QuestionCoverageMetric {
  const { rows, coverageCaveat } = questionCoverage(corpus, asOf);
  const uncovered = rows.filter((r) => r.standingCount === 0);
  return {
    covered: rows.length - uncovered.length,
    total: rows.length,
    uncoveredKeys: uncovered.map((r) => r.key),
    caveat: coverageCaveat,
    frame,
    sentence: `${rows.length - uncovered.length} of ${rows.length} anticipated questions have a standing answer on file. ${uncovered.length} do not.`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 THE POST-MORTEM — four parts, and one of them is the point                */
/* ══════════════════════════════════════════════════════════════════════════ */

export const POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION =
  'A review that changed nothing is a record of attendance. If a period produced no rule, no precleared line, no threshold and no process change, that is the finding — and it is reported rather than hidden behind a completed checklist.';

/**
 * A learning, with the metric that supports it.
 *
 * `supportedBy` is a `ProcessMetricKey` — one of the twelve things the desk can honestly
 * measure — or null. Null is allowed because real learnings do come from reading the
 * items rather than the counts, but it is REPORTED as unevidenced, so the packet cannot
 * quietly fill up with opinions wearing the clothes of measurement.
 */
export interface Learning {
  readonly statement: string;
  readonly supportedBy: ProcessMetricKey | null;
  /** The figure or observation behind it, in words. */
  readonly evidence: string;
}

/** What actually changed as a result. `nothing_changed` is a real, statable outcome. */
export type LoopChangeKind =
  | 'rule_added'
  | 'rule_removed'
  | 'threshold_changed'
  | 'line_precleared'
  | 'process_changed'
  | 'owner_assigned'
  | 'nothing_changed';

export interface LoopChange {
  readonly kind: LoopChangeKind;
  readonly description: string;
  /** The named human who owns it. A change with no owner is a wish. */
  readonly owner: ActorId;
  readonly at: Instant;
}

export interface PostMortemInput {
  readonly periodFrom: Instant;
  readonly periodTo: Instant;
  /** Ids and one-line descriptions of what the desk published. Never the third party's text. */
  readonly whatWasSaid: readonly { readonly itemId: string; readonly summary: string }[];
  /** The refusals that fired in the period. */
  readonly refusals: readonly RefusalEvent[];
  readonly learnings: readonly Learning[];
  readonly changes: readonly LoopChange[];
  readonly frame: ObservationFrame;
}

/**
 * The post-mortem packet. A packet for a human to read, never a ranking.
 *
 * Three things it reports about itself, because a review instrument that cannot see its
 * own gaps is the thing it was built to replace:
 *  - `producedNoChange` — the period changed nothing.
 *  - `unevidencedLearnings` — how many learnings cite no measurable metric.
 *  - `refusesToRank` — literal `true`, so the shape itself says this is not a scoreboard.
 */
export interface PostMortemReport {
  readonly periodFrom: Instant;
  readonly periodTo: Instant;
  readonly saidCount: number;
  readonly refusalSummary: RefusalFrequency;
  readonly learnings: readonly Learning[];
  readonly changes: readonly LoopChange[];
  readonly unevidencedLearnings: number;
  readonly producedNoChange: boolean;
  /** Literal true. A future edit that wants to rank angles has to change this type. */
  readonly refusesToRank: true;
  readonly volume: MarketingVolumeStatement;
  readonly lines: readonly string[];
}

export function postMortem(input: PostMortemInput): PostMortemReport {
  const refusalSummary = refusalCodeFrequency(input.refusals, input.frame);
  const substantiveChanges = input.changes.filter((c) => c.kind !== 'nothing_changed');
  const producedNoChange = substantiveChanges.length === 0;
  const unevidencedLearnings = input.learnings.filter((l) => l.supportedBy == null).length;

  const lines: string[] = [
    `Marketing post-mortem, ${input.periodFrom} to ${input.periodTo}.`,
    `What was said: ${input.whatWasSaid.length} item${input.whatWasSaid.length === 1 ? '' : 's'}.`,
    `What was refused: ${refusalSummary.total} refusal${refusalSummary.total === 1 ? '' : 's'} across ${refusalSummary.distinctCodes} code${refusalSummary.distinctCodes === 1 ? '' : 's'}. ${refusalSummary.neverFiredMeaning}`,
    input.learnings.length === 0
      ? 'What was learned: nothing was recorded. An empty learnings list is a finding about the review, not about the period.'
      : `What was learned: ${input.learnings.length} item${input.learnings.length === 1 ? '' : 's'}, of which ${unevidencedLearnings} cite no measurable metric.`,
    producedNoChange
      ? `What changed: nothing. ${POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION}`
      : `What changed: ${substantiveChanges.length} change${substantiveChanges.length === 1 ? '' : 's'} — ${substantiveChanges.map((c) => `${c.kind} (${c.owner})`).join(', ')}.`,
    MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
  ];

  return {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    saidCount: input.whatWasSaid.length,
    refusalSummary,
    learnings: input.learnings,
    changes: input.changes,
    unevidencedLearnings,
    producedNoChange,
    refusesToRank: true,
    volume: MARKETING_VOLUME_STATEMENT,
    lines,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §7 THE WEEKLY BLOCK — what survives a print                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface WbrMarketingInput {
  /** Monday of the review week, YYYY-MM-DD. */
  readonly weekStart: string;
  /** ISO instant the block was composed. Printed, so a stale page is visible. */
  readonly generatedAt: Instant;
  readonly frame: ObservationFrame;
  readonly items: readonly DeskItemRecord[];
  readonly refusals: readonly RefusalEvent[];
  readonly clearances: readonly ClearanceLatencyRecord[];
  readonly closures: readonly TriageClosureRecord[];
  readonly crisisStatements: readonly CrisisStatementRecord[];
  /** The precedent corpus, for the two metrics copied from `precedent.ts`. */
  readonly precedentCorpus: readonly PrecedentStatement[];
  readonly currentClaimVersions?: ReadonlyMap<string, number>;
  readonly truncatedByRetention?: boolean;
}

/**
 * The marketing section of the weekly review.
 *
 * PRINTABLE MEANS `lines`. Every figure that survives the print is in there as a
 * sentence with its n and its qualification attached, because the failure mode is a rate
 * arriving in a slide with the denominator left behind on the screen it came from. The
 * structured fields are for the screen.
 *
 * Shaped to sit alongside the other compartments' blocks on the weekly report; wiring it
 * into `apps/api/src/kpi/wbr.ts` belongs to the integration pass, not to this file.
 */
export interface WbrMarketingBlock {
  readonly weekStart: string;
  readonly generatedAt: Instant;
  readonly refusals: RefusalFrequency;
  readonly precleared: ProcessRate;
  readonly claimProvenance: ProcessRate;
  readonly ignoreWithRationale: ProcessRate;
  readonly notKnownNonEmpty: ProcessRate;
  readonly contradictionDebt: ContradictionDebtMetric;
  readonly lineStaleness: LineStalenessMetric;
  readonly questionCoverage: QuestionCoverageMetric;
  readonly clearanceLatency: ReturnType<typeof clearanceLatencyByRole>;
  /** The metrics deliberately absent from this block, so their absence is legible. */
  readonly refusedMetrics: readonly RefusedMetricKey[];
  readonly volume: MarketingVolumeStatement;
  readonly lines: readonly string[];
}

export function wbrMarketingBlock(input: WbrMarketingInput): WbrMarketingBlock {
  const asOf = input.generatedAt;
  const frame = input.frame;
  const refusals = refusalCodeFrequency(input.refusals, frame);
  const precleared = preclearedDerivationRate(input.items, frame);
  const claimProvenance = claimProvenanceRate(input.items, frame);
  const ignoreWithRationale = ignoreWithRationaleRate(input.closures, frame);
  const notKnown = notKnownNonEmptyRate(input.crisisStatements, frame);
  const debt = contradictionDebtMetric(input.precedentCorpus, asOf, frame, {
    truncatedByRetention: input.truncatedByRetention ?? false,
  });
  const staleness = lineStalenessMetric(input.precedentCorpus, asOf, frame, input.currentClaimVersions);
  const coverage = questionCoverageMetric(input.precedentCorpus, asOf, frame);
  const latency = clearanceLatencyByRole(input.clearances, frame);

  const rateLine = (r: ProcessRate): string =>
    r.pct == null
      ? `${r.metric}: WITHHELD — ${r.numerator}/${r.denominator}. ${r.suppressionReason ?? ''}`.trim()
      : `${r.metric}: ${r.pct}% (${r.numerator}/${r.denominator}).`;

  const lines: string[] = [
    `Marketing — the desk, week of ${input.weekStart} (composed ${input.generatedAt}).`,
    refusals.lines[0]!,
    rateLine(precleared),
    rateLine(claimProvenance),
    rateLine(ignoreWithRationale),
    rateLine(notKnown),
    debt.sentence,
    staleness.sentence,
    coverage.sentence,
    ...latency.rows.map((r) => r.sentence),
    latency.unreadableDates > 0
      ? `${latency.unreadableDates} clearance record${latency.unreadableDates === 1 ? '' : 's'} had unreadable timestamps and were excluded rather than counted as instant.`
      : 'All clearance timestamps in the window were readable.',
    `Not shown, and why: ${(Object.keys(REFUSED_METRICS) as RefusedMetricKey[]).length} audience metrics are refused by construction. ${REFUSED_METRICS.share_of_voice.reason}`,
    MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
    `Window: ${frame.captures} Completeness: ${frame.completeness}.`,
  ];

  return {
    weekStart: input.weekStart,
    generatedAt: input.generatedAt,
    refusals,
    precleared,
    claimProvenance,
    ignoreWithRationale,
    notKnownNonEmpty: notKnown,
    contradictionDebt: debt,
    lineStaleness: staleness,
    questionCoverage: coverage,
    clearanceLatency: latency,
    refusedMetrics: Object.keys(REFUSED_METRICS) as RefusedMetricKey[],
    volume: MARKETING_VOLUME_STATEMENT,
    lines,
  };
}

/**
 * Every process metric this module implements, checked against `PROCESS_METRIC_KEYS`.
 *
 * All twelve have a function. Three of them are NOT in `wbrMarketingBlock`, and that is
 * a deliberate scoping choice rather than an omission: `time_to_first_statement` is
 * per-incident and averaging it across incidents with different budgets would compare
 * clocks never set to the same target, while `retraction_count` and
 * `next_update_breach_count` need correction and commitment records the weekly block is
 * not given. Call them directly with those records.
 *
 * A colocated test asserts this list against `PROCESS_METRIC_KEYS`, so a metric cannot
 * be added to the vocabulary without this file either implementing it or admitting the
 * gap through `unimplementedProcessMetrics`.
 */
export const IMPLEMENTED_PROCESS_METRICS: readonly ProcessMetricKey[] = [
  'time_to_first_statement',
  'clearance_latency_by_role',
  'precleared_derivation_rate',
  'claim_provenance_rate',
  'contradiction_debt',
  'line_staleness',
  'not_known_non_empty_rate',
  'refusal_rate_by_code',
  'retraction_count',
  'next_update_breach_count',
  'ignore_with_rationale_rate',
  'question_coverage',
];

/** Metrics named in the vocabulary with no implementation in this module. */
export function unimplementedProcessMetrics(): readonly ProcessMetricKey[] {
  return PROCESS_METRIC_KEYS.filter((k) => !IMPLEMENTED_PROCESS_METRICS.includes(k));
}
