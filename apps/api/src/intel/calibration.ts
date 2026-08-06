import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { DEFAULT_ORG_ID } from './observations.js';
import {
  MIN_RESOLVED_FOR_CALIBRATION,
  PLATFORM_FORECAST_MIGRATION,
  asOfAnchors,
  environmentFor,
  environmentLabel,
  type AsOfAnchors,
  type SubjectAnchor,
} from '../kpi/platformForecast.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CALIBRATION (Wave 6) — and the reason its numbers were fiction until now.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT THIS FILE USED TO DO. For each score/signal it read the LATEST observation
 *  per subject and compared won deals against the universe: lift (won median ÷
 *  universe median) and quintile capture (share of won deals in the top 20%).
 *
 *  WHY THAT MEASURED THE PLATFORM'S OWN THUMB. `packages/shared/src/alpha.ts`
 *  deliberately subtracts 40 points from listing propensity (alpha.ts:114-117) and
 *  50 from winnability (alpha.ts:232-235) once `listed_on_lcx` is true, and
 *  suppresses the competitor-gap term in timing for the same reason
 *  (alpha.ts:141). Conviction is a blend of all three, so it inherits every one of
 *  them. EVERY WON DEAL IS LISTED — `labels/calibrate.ts:59` says so in as many
 *  words. So the "validated" score already contained a penalty the platform applied
 *  AFTER the outcome, and the lift computed from it was a measurement of the
 *  adjustment, not of the prediction. It was reported as "does the alpha predict
 *  wins?" on the scorecard.
 *
 *  THOSE PENALTIES ARE CORRECT AND ARE NOT TOUCHED. A project already on LCX is not
 *  a listing prospect; the −40/−50 is the right answer to the question `alpha.ts`
 *  asks. The defect was entirely here: reading a post-outcome value and calling it a
 *  prediction.
 *
 *  ══ WHAT THE FIX IS, AND THE HISTORY THAT TURNS OUT NOT TO EXIST ══
 *  The honest read is the value AS OF the instant the prediction was made. Two
 *  things are needed for that and exactly one of them exists:
 *
 *    1. A PREDICTION INSTANT. It did not exist anywhere in 0000–0073 and now does:
 *       `platform_forecast` (0074), read through `asOfAnchors`. Until that migration
 *       is applied and an engine writes to it, there is no instant to read as of,
 *       and this file REFUSES rather than falling back to the latest value.
 *
 *    2. THE SCORE'S OWN HISTORY. For the four SCORE metrics IT DOES NOT EXIST AND
 *       CANNOT BE RECOVERED. `intel/alpha.ts:30` opens every recompute with
 *
 *           DELETE FROM observations WHERE predicate = ANY($1::text[])
 *
 *       over exactly `listing_propensity, timing_window, deal_value_usd,
 *       winnability, conviction, ach_verdict`. So at most ONE row per subject per
 *       alpha predicate survives, it is always the newest, and it was computed
 *       against the CURRENT `projects.listed_on_lcx`. An as-of query cannot help:
 *       for an anchor before the last recompute it finds nothing, and for an anchor
 *       after it, it finds the penalised row again. There is no instant at which the
 *       surviving value is uncontaminated for a won subject.
 *
 *       So the score metrics return `CALIBRATION_SCORE_HISTORY_DESTROYED_BY_RECOMPUTE`
 *       with their real counts, and no lift. The counts are the finding. Making them
 *       measurable is a change to `intel/alpha.ts` (record each pass as a forecast
 *       instead of deleting the previous one), which is another lane's file.
 *
 *       THE SAME IS TRUE OF TWO OF THE FOUR "SIGNALS", and this file used to state the
 *       opposite as a fact. `intel/backfill.ts:34` runs
 *
 *           DELETE FROM observations WHERE source IN ('coingecko','internal')
 *                                     AND predicate = ANY(BACKFILL_PREDICATES)
 *
 *       and that list contains `market_cap_usd` (rewritten at backfill.ts:74, source
 *       'coingecko') and `priority_score` (backfill.ts:85, source 'internal', which is
 *       the internal model's own output and not an outside signal at all). One row per
 *       subject survives, always the newest. Those two therefore refuse with
 *       `CALIBRATION_HISTORY_DESTROYED_BY_BACKFILL` and their real counts.
 *
 *  Only `tvl_usd` (connectors/defillama.ts) and `github_commits_30d`
 *  (connectors/github.ts) are genuinely append-only, so only those two get an as-of
 *  read — once there are anchors, once the anchors are provably pre-outcome, and once
 *  the won sample clears the floor.
 *
 *  ══ AND THE ANCHOR ITSELF HAS TO BE EARNED ══
 *  `asOfAnchors` gives the EARLIEST resolved prediction instant per subject, which a
 *  later after-the-fact pass cannot drag forward. That is necessary and not sufficient:
 *  the forecast ledger cannot see `deals`, so it cannot know when a project was actually
 *  won. A subject whose earliest recorded call is not strictly BEFORE its own `won_at`
 *  — or whose `won_at` is unknown — has no honest as-of instant at all, and is excluded
 *  from every figure and counted under `CALIBRATION_ANCHOR_POSTDATES_OUTCOME` rather
 *  than read at an instant after the fact.
 *
 *  ══ THE HEADLINE IS A REFUSAL, AND IT SHIPS AS THE HEADLINE ══
 *  On the day this landed: 0074 unapplied, no engine writing forecasts, so EVERY
 *  metric refuses. That is the honest state of "are we any good?" and it is stated
 *  up front rather than buried under a plausible-looking 1.4×.
 */

/* ══════════════════════════════════════════════════════════════════════════════ */
/* CODES + RULES                                                                   */
/* ══════════════════════════════════════════════════════════════════════════════ */

export const CALIBRATION_CODES = {
  /** The four alpha scores have no surviving history to read as of. See the header. */
  SCORE_HISTORY_DESTROYED: 'CALIBRATION_SCORE_HISTORY_DESTROYED_BY_RECOMPUTE',
  /**
   * Same mechanism, different writer: `intel/backfill.ts` DELETEs its predicates on
   * every run, so `market_cap_usd` and `priority_score` keep exactly one row each.
   */
  BACKFILL_HISTORY_DESTROYED: 'CALIBRATION_HISTORY_DESTROYED_BY_BACKFILL',
  /**
   * The subject's earliest recorded prediction instant is NOT before the outcome it
   * would be validated against, so no honest as-of read exists for it. Excluded, counted.
   */
  ANCHOR_POSTDATES_OUTCOME: 'CALIBRATION_ANCHOR_POSTDATES_OUTCOME',
  /** Anchors exist, rows for this predicate exist, and none is readable at or before any anchor. */
  NO_VALUE_AS_OF_ANCHOR: 'CALIBRATION_NO_VALUE_READABLE_AS_OF_ANCHOR',
  /** Nothing anywhere carries this predicate. Genuinely empty — the third state. */
  NO_OBSERVATION_OF_METRIC: 'CALIBRATION_NO_OBSERVATION_OF_METRIC',
  /** The universe median is 0, so a lift (a RATIO against it) is undefined, not small. */
  LIFT_UNDEFINED: 'CALIBRATION_LIFT_UNDEFINED_ZERO_UNIVERSE_MEDIAN',
  /** The top-quintile threshold is at or below the whole distribution, so "top 20%" is everyone. */
  QUINTILE_DEGENERATE: 'CALIBRATION_QUINTILE_THRESHOLD_DEGENERATE',
  /** 0074 is not applied, so no prediction instant exists to read as of. */
  ANCHOR_LEDGER_ABSENT: 'CALIBRATION_PREDICTION_INSTANT_LEDGER_ABSENT',
  /** 0074 is applied and no subject has a resolved forecast. Distinct from the above. */
  NO_ANCHORED_SUBJECT: 'CALIBRATION_NO_ANCHORED_SUBJECT',
  /** Anchored won subjects exist but are below the floor. Carries the real n. */
  N_BELOW_FLOOR: 'CALIBRATION_WON_SAMPLE_BELOW_FLOOR',
  /** The universe side is below the floor, so its median is withheld too. */
  UNIVERSE_BELOW_FLOOR: 'CALIBRATION_UNIVERSE_SAMPLE_BELOW_FLOOR',
  /** No database could be named for the figure. */
  ENVIRONMENT_UNNAMED: 'CALIBRATION_ENVIRONMENT_UNNAMED',
  /** A stored snapshot written before this fix, whose lift came from the contaminated read. */
  SNAPSHOT_PREDATES_FIX: 'CALIBRATION_SNAPSHOT_PREDATES_AS_OF_FIX',
} as const;

export type CalibrationCode = (typeof CALIBRATION_CODES)[keyof typeof CALIBRATION_CODES];

export interface CalibrationRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

const RULE_ABSENT_REFUSES: CalibrationRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
    + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
};

const RULE_NO_LAUNDERING: CalibrationRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. If you cannot know, say you cannot know.',
};

const RULE_ENVIRONMENT_LABEL: CalibrationRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an environment label',
  text: 'Every figure carries an ObservationFrame and an environment label where it came from a database.',
};

export interface CalibrationRefusal {
  readonly code: CalibrationCode;
  readonly sentence: string;
  readonly rule: CalibrationRuleCitation;
  /** The n this refusal is about, where there is one. */
  readonly n: number | null;
  /** The history that is missing, named exactly. Null when the refusal is not about history. */
  readonly missingHistory: string | null;
  readonly environment: string | null;
}

/**
 * What was observed, when, over what window — on every metric, figure or refusal.
 */
export interface CalibrationFrame {
  /** Which database. `null` refuses; no figure renders off an unnamed environment. */
  readonly environment: string | null;
  /**
   * WHAT WAS ACTUALLY READ. The third member exists because the first was asserted as
   * fact even when the as-of read came back with nothing — the frame testified to a read
   * that had not happened as described, which is an inference laundered into a
   * provenance claim.
   */
  readonly observed:
    | 'observation_value_as_of_prediction_instant'
    | 'no_value_readable_as_of_prediction_instant'
    | 'subject_counts_only_no_value_read';
  readonly asOf: string;
  /** Earliest / latest anchor instant that actually fed the figure. */
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly anchorBasis: 'resolved_platform_forecast' | 'no_anchor_available' | 'ledger_absent';
  readonly anchorMigration: string;
  /** Subjects with a prediction instant, and therefore readable as of it. */
  readonly subjectsAnchored: number;
  /**
   * Subjects with an observation of this metric and NO prediction instant. EXCLUDED
   * from every figure and named here — a silently shorter sample is how a lift moves
   * for a reason nobody can see.
   */
  readonly subjectsWithoutAnchor: number;
  /**
   * COVERAGE, NOT READABILITY, and the two were indistinguishable on the wire.
   * `sampleUniverse` / `sampleWon` mean different things in different branches — real
   * coverage in the refusing branches, the as-of readable count in the scoring one — so
   * "we hold no market-cap data" and "we hold it and cannot read it as of anything"
   * rendered identically as 0. These two are always the coverage count: subjects that
   * carry this predicate at all, and how many of those are won.
   */
  readonly subjectsWithMetric: number;
  readonly wonSubjectsWithMetric: number;
  /**
   * Won subjects excluded because their earliest recorded prediction instant does not
   * precede their win. Not a smaller sample: a named exclusion.
   */
  readonly wonSubjectsAnchorPostdatesOutcome: number;
  readonly minWonSample: number;
}

export type CalibrationVerdict = 'predictive' | 'weak' | 'insufficient' | 'unmeasurable';

export interface MetricCalibration {
  metricKey: string;
  kind: 'score' | 'signal';
  lift: number | null;
  quintileCapture: number | null;
  wonMedian: number | null;
  universeMedian: number | null;
  sampleWon: number;
  sampleUniverse: number;
  /**
   * 'unmeasurable' IS NOT 'insufficient' AND THE TWO MUST NOT BE COLLAPSED.
   * 'insufficient' means the sample is too small yet — wait and it resolves.
   * 'unmeasurable' means the value cannot be read at all: the history was deleted,
   * or there is no instant to read it as of. Waiting does not fix that; a code
   * change does. Reporting both as 'insufficient' would leave the scorecard saying
   * "nearly there" about something that will never arrive.
   */
  verdict: CalibrationVerdict;
  /** EVERY refusal that applies, not the first one found. */
  refusals: readonly CalibrationRefusal[];
  frame: CalibrationFrame;
}

/**
 * The four alpha scores. Every one of them is written by `intel/alpha.ts`, which
 * DELETEs the previous pass, and every one of them carries a listing-status
 * adjustment. Both facts are why they are unmeasurable rather than merely sparse.
 */
const SCORE_METRICS = ['conviction', 'listing_propensity', 'winnability', 'timing_window'];

/**
 * The signals whose history IS REAL, and it is two of them, not four.
 *
 * `tvl_usd` is written by `connectors/defillama.ts:105` with source 'defillama' and
 * `github_commits_30d` by `connectors/github.ts:91` with source 'github'. Nothing in
 * this repo deletes either — no DELETE anywhere names those predicates or those sources
 * — so every pass appends and an as-of read is a genuine read of what was observable
 * when the call was made.
 */
const SIGNAL_METRICS_APPEND_ONLY = ['tvl_usd', 'github_commits_30d'];

/**
 * THE TWO "SIGNALS" WHOSE HISTORY IS DELETED, and the sentence this file used to carry
 * about them was false: "Signals from outside the platform. Nothing deletes these, so
 * their history is real and an as-of read means something."
 *
 * `intel/backfill.ts:34` opens every run with
 *
 *     DELETE FROM observations WHERE source IN ('coingecko','internal')
 *                               AND predicate = ANY(BACKFILL_PREDICATES)
 *
 * and `BACKFILL_PREDICATES` contains `market_cap_usd` — written back at backfill.ts:74
 * with source 'coingecko' — and `priority_score` — backfill.ts:85, source 'internal'.
 * So exactly one row per subject survives for each, and it is always the newest: the
 * IDENTICAL mechanism this file diagnoses for the alpha scores, and it was routed into
 * the branch that computes a lift and prints a verdict instead of the branch that
 * refuses.
 *
 * `priority_score` is also not "from outside the platform" in any sense — it is the
 * internal model's own output, read out of `scores` by backfill.ts:47.
 *
 * Making these measurable is a change to `intel/backfill.ts` (append a new observation
 * instead of deleting the previous one), which is another lane's file.
 */
const SIGNAL_METRICS_HISTORY_DELETED = ['market_cap_usd', 'priority_score'];

/** How `intel/backfill.ts` destroys the history, named exactly, for the refusal. */
const BACKFILL_DELETER =
  'observations rows for predicate=%P prior to the latest backfill pass — deleted by intel/backfill.ts '
  + "(DELETE FROM observations WHERE source IN ('coingecko','internal') AND predicate = ANY(BACKFILL_PREDICATES)) "
  + 'on every run';

/**
 * ONE METRIC, AND WHETHER ANYTHING DELETES ITS HISTORY.
 *
 * The deletion is a property of the PREDICATE and its writer, not of `kind`, and that
 * distinction is the whole of the second defect this file carried: the branch that
 * refuses was selected by `kind === 'score'`, so two predicates whose history is deleted
 * by a different writer went down the branch that computes a lift and prints a verdict.
 * `kind` stays what it always was — how the scorecard groups the row — and
 * `historyDestroyedBy` is what decides whether a value may be read at all.
 */
interface MetricSpec {
  readonly predicate: string;
  readonly kind: 'score' | 'signal';
  readonly historyDestroyedBy: {
    readonly code: CalibrationCode;
    /** Completes "…the only surviving observation of it is the newest one, because ___". */
    readonly why: string;
    /** `%P` is replaced by the predicate. Names the rows that are gone and who deleted them. */
    readonly missingHistory: string;
  } | null;
}

const ALPHA_DELETER = {
  code: CALIBRATION_CODES.SCORE_HISTORY_DESTROYED,
  why:
    'every alpha recompute deletes the previous pass, and that newest value carries the listing-status '
    + 'adjustment alpha.ts applies once a project is on LCX — which every won deal is.',
  missingHistory:
    'observations rows for predicate=%P prior to the latest alpha pass — deleted by '
    + 'intel/alpha.ts (DELETE FROM observations WHERE predicate = ANY(ALPHA_PREDICATES)) on every run',
} as const;

const BACKFILL_DELETED = {
  code: CALIBRATION_CODES.BACKFILL_HISTORY_DESTROYED,
  why:
    'every backfill pass deletes its own predicates before rewriting them (intel/backfill.ts:34), so exactly '
    + 'one row per subject survives and it is always the newest — the same mechanism that makes the alpha '
    + 'scores unmeasurable, with a different writer.',
  missingHistory: BACKFILL_DELETER,
} as const;

const METRICS: readonly MetricSpec[] = [
  ...SCORE_METRICS.map((predicate) => ({ predicate, kind: 'score' as const, historyDestroyedBy: ALPHA_DELETER })),
  ...SIGNAL_METRICS_APPEND_ONLY.map((predicate) => ({
    predicate, kind: 'signal' as const, historyDestroyedBy: null,
  })),
  ...SIGNAL_METRICS_HISTORY_DELETED.map((predicate) => ({
    predicate, kind: 'signal' as const, historyDestroyedBy: BACKFILL_DELETED,
  })),
];

/**
 * Below this many anchored won deals, no lift and no capture — the counts only.
 *
 * IT IS `MIN_RESOLVED_FOR_CALIBRATION`, which is `MIN_N_FOR_RATE` (8), and it is
 * deliberately the SAME constant the GPS loop uses rather than a second 8 that
 * happens to agree. The argument is in `packages/shared/src/gps/calibration.ts:224-242`:
 * at n = 3 a Wilson 95% interval spans 76 points, at n = 8 it spans 56, so 8 is not
 * a claim of sufficiency but the point where a reader can see the width. This file
 * previously held its own `MIN_WON_SAMPLE = 8` — two floors that agreed by
 * coincidence are one edit away from disagreeing, and a platform with two accuracy
 * floors has none.
 *
 * WHAT CHANGED BESIDES THE NAME: below the floor the old code still RETURNED the
 * lift and the medians and left the verdict at 'insufficient', so the number reached
 * the API and only the web layer chose not to draw it (`Scorecard.tsx:132`). A
 * number that exists in the payload gets quoted. Now it is null and a refusal
 * carrying the real n takes its place.
 */
const MIN_WON_SAMPLE = MIN_RESOLVED_FOR_CALIBRATION;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* READS                                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

interface CountRow {
  universe_n: string;
  won_n: string;
  unanchored_n: string;
}

/**
 * How many subjects carry this predicate at all, and how many of those are won.
 *
 * COUNTS ONLY — NO VALUE IS SELECTED. This is what the score metrics report instead
 * of a lift: a count of records is a fact about our own coverage, not a measurement
 * of the world, so it is safe to report where the value is not. It is also the honest
 * answer to "how far off is this" — `sample_won` is what has to grow.
 */
async function counts(
  pool: pg.Pool,
  predicate: string,
  anchoredIds: readonly string[],
): Promise<{ universeN: number; wonN: number; unanchoredN: number }> {
  const { rows } = await pool.query<CountRow>(
    `SELECT
       (SELECT count(DISTINCT subject_id) FROM observations
         WHERE predicate = $1 AND value_num IS NOT NULL) AS universe_n,
       (SELECT count(DISTINCT o.subject_id) FROM observations o
          JOIN deals d ON d.project_id::text = o.subject_id AND d.stage = 'won'
         WHERE o.predicate = $1 AND o.value_num IS NOT NULL) AS won_n,
       (SELECT count(DISTINCT o.subject_id) FROM observations o
         WHERE o.predicate = $1 AND o.value_num IS NOT NULL
           AND NOT (o.subject_id = ANY($2::text[]))) AS unanchored_n`,
    [predicate, anchoredIds],
  );
  return {
    universeN: Number(rows[0]?.universe_n ?? 0),
    wonN: Number(rows[0]?.won_n ?? 0),
    unanchoredN: Number(rows[0]?.unanchored_n ?? 0),
  };
}

interface AsOfRow {
  universe_n: string;
  won_n: string;
  universe_median: string | null;
  won_median: string | null;
  won_top: string;
  unanchored_n: string;
  contaminated_won_n: string;
  quintile_degenerate: boolean | null;
}

/**
 * The as-of read: for each anchored subject, the last observation of `predicate`
 * AT OR BEFORE that subject's prediction instant.
 *
 * `observed_at <= a.as_of` IS HALF THE FIX. The old query was
 * `DISTINCT ON (subject_id) … ORDER BY subject_id, observed_at DESC` with no bound,
 * which for a won subject returns a value observed after the outcome. Anchors are
 * passed as parallel arrays through `unnest` rather than `= ANY(...)` — see
 * `intel/alpha.ts:137` for why an array literal is the reliable form here.
 *
 * `a.as_of < w.won_at` IS THE OTHER HALF, and without it the first half was decorative.
 * The bound is only worth anything if the anchor itself predates the outcome, and the
 * forecast ledger cannot know that — it can only guarantee a forecast is at or before
 * ITS OWN outcome row. `deals.won_at` is where this file finds out when the subject was
 * really decided, so a won subject is admitted ONLY when its earliest recorded call is
 * strictly before its win. The rest are counted in `contaminated_won_n` and excluded —
 * from the universe as well as from the won side, because a post-outcome value in the
 * denominator moves the lift exactly as far as one in the numerator.
 *
 * MEDIANS ARE NEAREST-RANK (`percentile_disc`), NOT INTERPOLATED. `percentile_cont`
 * returns the mean of the two middle values at an even n, which is a number no subject
 * ever had — and this lane's other half (`kpi/platformForecast.ts:median`) argues the
 * opposite rule for itself in as many words: "every number reported is one that was
 * measured". Two halves of one lane disagreeing about what a median is, with the
 * interpolated one reaching the screen, is not a defensible split.
 *
 * `unanchored_n` counts subjects that have the predicate and no instant, so the
 * exclusion is visible in the frame instead of just making the sample smaller.
 */
async function asOfRead(
  pool: pg.Pool,
  predicate: string,
  anchors: ReadonlyMap<string, SubjectAnchor>,
): Promise<{
  universeN: number;
  wonN: number;
  universeMedian: number | null;
  wonMedian: number | null;
  wonTop: number;
  unanchoredN: number;
  contaminatedWonN: number;
  quintileDegenerate: boolean;
}> {
  const ids = [...anchors.keys()];
  const instants = ids.map((id) => anchors.get(id)!.asOf);
  const { rows } = await pool.query<AsOfRow>(
    `WITH anchor(subject_id, as_of) AS (
       SELECT * FROM unnest($2::text[], $3::timestamptz[])
     ),
     won AS (
       SELECT d.project_id::text AS pid, min(d.won_at) AS won_at
         FROM deals d
        WHERE d.stage = 'won'
        GROUP BY d.project_id
     ),
     -- A won subject is readable only as of an instant STRICTLY BEFORE its win. An
     -- unknown won_at is not a pass: it is an unknown, and it refuses.
     won_ok AS (
       SELECT w.pid FROM won w JOIN anchor a ON a.subject_id = w.pid
        WHERE w.won_at IS NOT NULL AND a.as_of < w.won_at
     ),
     won_bad AS (
       SELECT w.pid FROM won w JOIN anchor a ON a.subject_id = w.pid
        WHERE w.won_at IS NULL OR a.as_of >= w.won_at
     ),
     elig AS (
       SELECT a.subject_id, a.as_of FROM anchor a
        WHERE NOT EXISTS (SELECT 1 FROM won_bad b WHERE b.pid = a.subject_id)
     ),
     m AS (
       SELECT DISTINCT ON (o.subject_id) o.subject_id, o.value_num AS v
         FROM observations o
         JOIN elig a ON a.subject_id = o.subject_id
        WHERE o.predicate = $1 AND o.value_num IS NOT NULL
          AND o.observed_at <= a.as_of
        ORDER BY o.subject_id, o.observed_at DESC
     ),
     wonm AS (SELECT m.v FROM won_ok JOIN m ON m.subject_id = won_ok.pid),
     thr AS (SELECT percentile_disc(0.8) WITHIN GROUP (ORDER BY v) AS t, min(v) AS lo FROM m)
     SELECT
       (SELECT count(*) FROM m) AS universe_n,
       (SELECT count(*) FROM wonm) AS won_n,
       (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY v) FROM m) AS universe_median,
       (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY v) FROM wonm) AS won_median,
       (SELECT count(*) FROM wonm, thr WHERE wonm.v >= thr.t) AS won_top,
       (SELECT count(DISTINCT o.subject_id) FROM observations o
          WHERE o.predicate = $1 AND o.value_num IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM anchor a WHERE a.subject_id = o.subject_id)) AS unanchored_n,
       (SELECT count(*) FROM won_bad) AS contaminated_won_n,
       -- "The top quintile" means nothing when the threshold sits at or below the
       -- bottom of the distribution: every subject is in it and the capture is 100% by
       -- construction. Flagged here, refused above.
       (SELECT thr.t <= thr.lo FROM thr) AS quintile_degenerate`,
    [predicate, ids, instants],
  );
  const r = rows[0];
  return {
    universeN: Number(r?.universe_n ?? 0),
    wonN: Number(r?.won_n ?? 0),
    universeMedian: r?.universe_median != null ? Number(r.universe_median) : null,
    wonMedian: r?.won_median != null ? Number(r.won_median) : null,
    wonTop: Number(r?.won_top ?? 0),
    unanchoredN: Number(r?.unanchored_n ?? 0),
    contaminatedWonN: Number(r?.contaminated_won_n ?? 0),
    quintileDegenerate: r?.quintile_degenerate === true,
  };
}

function frame(args: {
  environment: string | null;
  anchors: AsOfAnchors;
  observed: CalibrationFrame['observed'];
  subjectsAnchored: number;
  subjectsWithoutAnchor: number;
  /** Real coverage of the predicate, whatever the branch. Never the readable count. */
  coverage: { universeN: number; wonN: number };
  wonSubjectsAnchorPostdatesOutcome: number;
  window: { from: string | null; to: string | null };
}): CalibrationFrame {
  return {
    environment: args.environment,
    observed: args.observed,
    asOf: new Date().toISOString(),
    windowFrom: args.window.from,
    windowTo: args.window.to,
    anchorBasis: !args.anchors.ledgerPresent
      ? 'ledger_absent'
      : args.subjectsAnchored === 0
        ? 'no_anchor_available'
        : 'resolved_platform_forecast',
    anchorMigration: args.anchors.migration,
    subjectsAnchored: args.subjectsAnchored,
    subjectsWithoutAnchor: args.subjectsWithoutAnchor,
    subjectsWithMetric: args.coverage.universeN,
    wonSubjectsWithMetric: args.coverage.wonN,
    wonSubjectsAnchorPostdatesOutcome: args.wonSubjectsAnchorPostdatesOutcome,
    minWonSample: MIN_WON_SAMPLE,
  };
}

/**
 * One metric, calibrated or refused.
 *
 * The deleted-history branch is UNCONDITIONAL and does not consult the anchors, which
 * looks like a missing feature and is the opposite. An as-of read against a table whose
 * history was deleted returns either nothing (anchor before the last recompute) or the
 * current post-outcome row (anchor after it) — and the second case is silent
 * contamination that LOOKS like it was fixed. There is no anchor that makes the
 * surviving row honest, so no anchor is consulted.
 *
 * `historyDestroyedBy` is what selects that branch, NOT `kind`. Two of the four
 * "signals" have their history deleted too, by a different writer (`intel/backfill.ts`),
 * and routing on `kind` is exactly how they ended up in the branch that computes a lift.
 */
async function calibrateMetric(
  pool: pg.Pool,
  spec: MetricSpec,
  anchors: AsOfAnchors,
  environment: string | null,
): Promise<MetricCalibration> {
  const predicate = spec.predicate;
  const kind = spec.kind;
  const refusals: CalibrationRefusal[] = [];
  if (environment === null) {
    refusals.push({
      code: CALIBRATION_CODES.ENVIRONMENT_UNNAMED,
      sentence:
        'No database can be named for this figure, so no figure is expressed. A calibration whose '
        + 'environment is unstated cannot be told apart from a laptop\'s.',
      rule: RULE_ENVIRONMENT_LABEL,
      n: null,
      missingHistory: null,
      environment: null,
    });
  }

  const anchorWindow = (() => {
    const xs = [...anchors.bySubject.values()].map((a) => a.asOf).sort();
    return { from: xs[0] ?? null, to: xs[xs.length - 1] ?? null };
  })();

  /*
   * COVERAGE IS READ FOR EVERY METRIC, IN EVERY BRANCH. It used to be read only where
   * the code was about to refuse, which left `sampleUniverse` meaning "real coverage"
   * in one branch and "as-of readable count" in another — so 0 could mean "we hold no
   * rows of this predicate" or "we hold nine and cannot read one of them as of any
   * anchor", and the two rendered identically. The frame now carries coverage
   * separately from whatever fed the figure.
   */
  const c = await counts(pool, predicate, [...anchors.bySubject.keys()]);
  const coverage = { universeN: c.universeN, wonN: c.wonN };

  const refused = (
    verdict: CalibrationVerdict,
    observed: CalibrationFrame['observed'],
    samples: { won: number; universe: number },
    postdates = 0,
  ): MetricCalibration => ({
    metricKey: predicate,
    kind,
    lift: null,
    quintileCapture: null,
    wonMedian: null,
    universeMedian: null,
    sampleWon: samples.won,
    sampleUniverse: samples.universe,
    verdict,
    refusals,
    frame: frame({
      environment,
      anchors,
      observed,
      subjectsAnchored: anchors.bySubject.size,
      subjectsWithoutAnchor: c.unanchoredN,
      coverage,
      wonSubjectsAnchorPostdatesOutcome: postdates,
      window: anchorWindow,
    }),
  });

  /* ── History deleted by its own writer: unmeasurable, with the real counts. ── */
  if (spec.historyDestroyedBy) {
    refusals.push({
      code: spec.historyDestroyedBy.code,
      sentence:
        `No lift is expressed for ${predicate}: the only surviving observation of it is the newest one, `
        + `because ${spec.historyDestroyedBy.why} `
        + `The ${c.wonN} won and ${c.universeN} universe subjects that carry it are the finding.`,
      rule: RULE_NO_LAUNDERING,
      n: c.wonN,
      missingHistory: spec.historyDestroyedBy.missingHistory.replace('%P', predicate),
      environment,
    });
    return refused('unmeasurable', 'subject_counts_only_no_value_read', { won: c.wonN, universe: c.universeN });
  }

  /* ── No prediction instant: refuse, but still report coverage. ── */
  if (!anchors.ledgerPresent || anchors.bySubject.size === 0) {
    refusals.push(
      !anchors.ledgerPresent
        ? {
            code: CALIBRATION_CODES.ANCHOR_LEDGER_ABSENT,
            sentence:
              `No value can be read as of a prediction instant on this environment: migration `
              + `${PLATFORM_FORECAST_MIGRATION} (platform_forecast) has not been applied, so no prediction `
              + 'has an instant. The latest value is NOT used as a substitute — that substitution is the '
              + 'defect this refusal replaces.',
            rule: RULE_ABSENT_REFUSES,
            n: c.wonN,
            missingHistory: `platform_forecast (${PLATFORM_FORECAST_MIGRATION}) — the table does not exist here`,
            environment,
          }
        : {
            code: CALIBRATION_CODES.NO_ANCHORED_SUBJECT,
            sentence:
              'The forecast ledger exists and no subject has a resolved forecast, so there is no instant to '
              + 'read any value as of. This is an empty ledger, not a missing one, and not a lift of zero.',
            rule: RULE_ABSENT_REFUSES,
            n: 0,
            missingHistory: 'platform_forecast rows with a resolved outcome for subject_type=project',
            environment,
          },
    );
    return refused('unmeasurable', 'subject_counts_only_no_value_read', { won: c.wonN, universe: c.universeN });
  }

  /* ── The genuine as-of read. ── */
  const r = await asOfRead(pool, predicate, anchors.bySubject);

  /*
   * A won subject whose earliest recorded call does not precede its win has no honest
   * as-of instant, and `asOfRead` has already excluded it from BOTH sides. It is named
   * here rather than left to show up as a smaller n, because "the anchor postdates the
   * outcome" is the exact defect this whole lane exists to remove and it must never
   * again be invisible.
   */
  if (r.contaminatedWonN > 0) {
    refusals.push({
      code: CALIBRATION_CODES.ANCHOR_POSTDATES_OUTCOME,
      sentence:
        `${r.contaminatedWonN} won ${r.contaminatedWonN === 1 ? 'subject' : 'subjects'} could not be read as of `
        + 'any prediction instant that precedes the win, so they were excluded from the won side AND from the '
        + 'universe. Either the earliest recorded forecast for them was made after the deal closed, or the deal '
        + 'carries no won_at to compare against. Reading them at the instant on file would have returned the '
        + 'post-outcome value — the original defect, through the new seam.',
      rule: RULE_NO_LAUNDERING,
      n: r.contaminatedWonN,
      missingHistory: 'a platform_forecast row for these subjects dated before deals.won_at',
      environment,
    });
  }

  /*
   * NOTHING READABLE AT ALL IS NOT A SMALL SAMPLE. This used to fall through to the
   * floor refusal and report "0 won subjects … below the stated minimum of 8" with
   * verdict 'insufficient' — collapsing three states into one and telling the operator
   * to wait for something that will never arrive. Which of the two it is comes from
   * COVERAGE, not from the as-of read.
   */
  if (r.universeN === 0) {
    const nothingHeld = c.universeN === 0;
    refusals.push(
      nothingHeld
        ? {
            code: CALIBRATION_CODES.NO_OBSERVATION_OF_METRIC,
            sentence:
              `Nothing on this environment carries ${predicate}: there is no observation of it for any subject, `
              + 'won or otherwise. This is an empty predicate, not a lift of zero and not a small sample — when '
              + 'the connector that writes it runs, this resolves on its own.',
            rule: RULE_ABSENT_REFUSES,
            n: 0,
            missingHistory: `observations rows for predicate=${predicate} — none exist here`,
            environment,
          }
        : {
            code: CALIBRATION_CODES.NO_VALUE_AS_OF_ANCHOR,
            sentence:
              `${c.universeN} subject${c.universeN === 1 ? '' : 's'} carr${c.universeN === 1 ? 'ies' : 'y'} `
              + `${predicate} and not one of them has a value recorded at or before its prediction instant, so `
              + 'nothing could be read as of anything. Every value on file postdates every anchor. More recent '
              + 'observations do not fix this; earlier history would, and it does not exist.',
            rule: RULE_ABSENT_REFUSES,
            n: 0,
            missingHistory:
              `observations rows for predicate=${predicate} dated at or before the anchored prediction instants`,
            environment,
          },
    );
    return refused(
      nothingHeld ? 'insufficient' : 'unmeasurable',
      'no_value_readable_as_of_prediction_instant',
      { won: 0, universe: 0 },
      r.contaminatedWonN,
    );
  }

  const wonBelowFloor = r.wonN < MIN_WON_SAMPLE;
  const universeBelowFloor = r.universeN < MIN_WON_SAMPLE;

  if (wonBelowFloor) {
    refusals.push({
      code: CALIBRATION_CODES.N_BELOW_FLOOR,
      sentence:
        `${r.wonN} won ${r.wonN === 1 ? 'subject' : 'subjects'} could be read as of a prediction instant, `
        + `below the stated minimum of ${MIN_WON_SAMPLE}. The count is the finding; no lift and no capture `
        + 'are expressed, because a median ratio at this n moves by more than its own value on one deal.',
      rule: RULE_ABSENT_REFUSES,
      n: r.wonN,
      missingHistory: null,
      environment,
    });
  }
  if (universeBelowFloor) {
    refusals.push({
      code: CALIBRATION_CODES.UNIVERSE_BELOW_FLOOR,
      sentence:
        `${r.universeN} universe ${r.universeN === 1 ? 'subject' : 'subjects'} could be read as of a `
        + `prediction instant, below the stated minimum of ${MIN_WON_SAMPLE}, so the universe median is `
        + 'withheld as well — it is the denominator of the lift.',
      rule: RULE_ABSENT_REFUSES,
      n: r.universeN,
      missingHistory: null,
      environment,
    });
  }

  /*
   * A LIFT IS A RATIO AND A RATIO AGAINST 0 IS UNDEFINED, NOT WEAK. The first cut
   * guarded the division with a truthiness test on `universeMedian`, so a universe
   * median of exactly 0 produced lift = null with an EMPTY refusals array, verdict
   * 'weak' — a stated finding about the metric — and a quintile capture of 100% that
   * `Scorecard.tsx:132` drew, because it only blanks a cell on verdict 'insufficient'.
   * Undefined arithmetic is absent data and absent data refuses, with a code.
   */
  const liftUndefined = r.universeMedian == null || r.universeMedian === 0;
  if (liftUndefined && !wonBelowFloor && !universeBelowFloor && environment !== null) {
    refusals.push({
      code: CALIBRATION_CODES.LIFT_UNDEFINED,
      sentence:
        `The universe median of ${predicate} as of the prediction instants is `
        + `${r.universeMedian == null ? 'unreadable' : '0'}, so a lift — which is a RATIO against it — has no `
        + 'value at all. This is not a weak lift and it is not a lift of zero; there is no number here. A '
        + 'measure that survives a zero denominator (a difference, not a ratio) would be a code change.',
      rule: RULE_NO_LAUNDERING,
      n: r.wonN,
      missingHistory: null,
      environment,
    });
  }

  /*
   * AND A "TOP QUINTILE" THAT CONTAINS EVERYONE MEASURES NOTHING. When the 80th
   * percentile sits at or below the bottom of the distribution — every value ties the
   * threshold, which is what an all-zero or single-valued distribution does — the
   * capture is 100% by construction and reads as the strongest possible result.
   */
  if (r.quintileDegenerate && !wonBelowFloor && !universeBelowFloor && environment !== null) {
    refusals.push({
      code: CALIBRATION_CODES.QUINTILE_DEGENERATE,
      sentence:
        `The top-quintile threshold for ${predicate} is at or below the lowest value in the universe, so every `
        + 'subject is inside the "top 20%" and the capture would have been 100% whatever the deals did. No '
        + 'capture is expressed. This is what a distribution with no spread looks like, not a result.',
      rule: RULE_NO_LAUNDERING,
      n: r.universeN,
      missingHistory: null,
      environment,
    });
  }

  const suppress = wonBelowFloor || universeBelowFloor || environment === null;
  const lift =
    !suppress && !liftUndefined && r.wonMedian != null
      ? Math.round((r.wonMedian / r.universeMedian!) * 100) / 100
      : null;
  const quintileCapture =
    !suppress && !liftUndefined && !r.quintileDegenerate && r.wonN > 0
      ? Math.round((r.wonTop / r.wonN) * 100) / 100
      : null;
  /*
   * An unnamed environment is UNMEASURABLE, not insufficient: no amount of further
   * sample makes a figure whose database nobody can name reportable, so it must not
   * read as "nearly there" the way a small n legitimately does. An undefined lift is
   * unmeasurable for the same reason — more subjects at the same distribution still
   * divide by zero — and it must never fall through to 'weak', which is a FINDING.
   */
  const verdict: CalibrationVerdict =
    environment === null
      ? 'unmeasurable'
      : suppress
        ? 'insufficient'
        : liftUndefined
          ? 'unmeasurable'
          : lift != null && lift >= 1.3
            ? 'predictive'
            : 'weak';

  return {
    metricKey: predicate,
    kind,
    lift,
    // Every figure below shares the lift's fate. The old code returned the medians
    // and the capture alongside a suppressed verdict, which put the numbers in the
    // payload for anything downstream to quote.
    quintileCapture,
    wonMedian: suppress || liftUndefined ? null : r.wonMedian,
    universeMedian: universeBelowFloor || environment === null ? null : r.universeMedian,
    sampleWon: r.wonN,
    sampleUniverse: r.universeN,
    verdict,
    refusals,
    frame: frame({
      environment,
      anchors,
      observed: 'observation_value_as_of_prediction_instant',
      subjectsAnchored: anchors.bySubject.size,
      subjectsWithoutAnchor: r.unanchoredN,
      coverage,
      wonSubjectsAnchorPostdatesOutcome: r.contaminatedWonN,
      window: anchorWindow,
    }),
  };
}

/** Marks a snapshot row as written by the as-of loop. Read back by `getCalibration`. */
const CALIBRATION_SCHEMA_MARKER = 'as_of_v1';

export async function computeCalibration(
  pool: pg.Pool,
  opts?: { readonly databaseUrl?: string | null },
): Promise<{ metrics: MetricCalibration[]; snapshotted: number }> {
  // `databaseUrl: null` means "I cannot name one" and reaches ENVIRONMENT_UNNAMED;
  // `undefined` still falls back to the process. See `environmentFor`.
  const environment = environmentFor(opts);
  // One anchor read for the whole pass: the instants do not depend on the metric.
  const anchors = await asOfAnchors(pool, 'project');

  const metrics: MetricCalibration[] = [];
  for (const spec of METRICS) metrics.push(await calibrateMetric(pool, spec, anchors, environment));

  // Idempotent per day: clear today's snapshots, then re-insert.
  await pool.query(`DELETE FROM model_calibrations WHERE snapshot_date = CURRENT_DATE::text`);
  for (const m of metrics) {
    await pool.query(
      `INSERT INTO model_calibrations
         (org_id, metric_key, kind, lift, quintile_capture, won_median, universe_median, sample_won, sample_universe, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        DEFAULT_ORG_ID,
        m.metricKey,
        m.kind,
        m.lift,
        m.quintileCapture,
        m.wonMedian,
        m.universeMedian,
        m.sampleWon,
        m.sampleUniverse,
        // `schema` is what lets `getCalibration` tell an as-of row from the rows the
        // contaminated loop wrote — those are still in the table on production.
        JSON.stringify({ schema: CALIBRATION_SCHEMA_MARKER, verdict: m.verdict, refusals: m.refusals, frame: m.frame }),
      ],
    );
  }
  return { metrics, snapshotted: metrics.length };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* READ SIDE (route + scorecard)                                                   */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface CalibrationView {
  latest: MetricCalibration[];
  history: { snapshotDate: string; metricKey: string; lift: number | null }[];
  /**
   * Snapshot rows whose figures were withheld because they predate the as-of fix.
   * Counted rather than dropped: a history that silently got shorter is how a trend
   * line changes shape for a reason nobody can see.
   */
  historySuppressed: number;
  refusals: readonly CalibrationRefusal[];
}

const snapshotPredatesFix = (metricKey: string, environment: string | null): CalibrationRefusal => ({
  code: CALIBRATION_CODES.SNAPSHOT_PREDATES_FIX,
  sentence:
    `The stored ${metricKey} snapshot was written before the as-of fix, so its lift came from the latest `
    + 'observation — post-outcome, and carrying the listing penalty alpha.ts applies to every listed project. '
    + 'The figure is withheld rather than redrawn. Run the calibrate job to replace it.',
  rule: RULE_NO_LAUNDERING,
  n: null,
  missingHistory: null,
  environment,
});

/**
 * Latest calibration per metric + short history for trend.
 *
 * WHY IT SUPPRESSES ITS OWN STORED ROWS. `model_calibrations` on production holds
 * snapshots written by the contaminated loop, and this function served them straight
 * to `/v1/intel/calibration` and the scorecard. Fixing the compute path without
 * fixing the read path would leave the same wrong number on screen until the next
 * job run — and any row that has no `meta.schema` marker is one of those rows.
 *
 * `pool` is optional so a test can point this at its own schema. Production passes
 * nothing and gets `getDb()`, exactly as before.
 */
export async function getCalibration(pool?: pg.Pool): Promise<CalibrationView> {
  const environment = environmentLabel(process.env.DATABASE_URL);
  const run = async (text: string): Promise<Record<string, unknown>[]> => {
    if (pool) return (await pool.query(text)).rows as Record<string, unknown>[];
    const res = await getDb().execute(sql.raw(text));
    return (res.rows ?? []) as Record<string, unknown>[];
  };

  const latestRows = await run(`
    SELECT DISTINCT ON (metric_key) metric_key, kind, lift, quintile_capture, won_median, universe_median,
           sample_won, sample_universe, meta, snapshot_date
    FROM model_calibrations ORDER BY metric_key, snapshot_date DESC, created_at DESC
  `);

  const refusals: CalibrationRefusal[] = [];
  const latest: MetricCalibration[] = latestRows.map((r) => {
    const meta = (r.meta ?? {}) as { schema?: string; verdict?: string; refusals?: CalibrationRefusal[]; frame?: CalibrationFrame };
    const stale = meta.schema !== CALIBRATION_SCHEMA_MARKER;
    const metricKey = r.metric_key as string;
    if (stale) refusals.push(snapshotPredatesFix(metricKey, environment));
    return {
      metricKey,
      kind: (r.kind as 'score' | 'signal') ?? 'score',
      lift: stale || r.lift == null ? null : Number(r.lift),
      quintileCapture: stale || r.quintile_capture == null ? null : Number(r.quintile_capture),
      wonMedian: stale || r.won_median == null ? null : Number(r.won_median),
      universeMedian: stale || r.universe_median == null ? null : Number(r.universe_median),
      sampleWon: Number(r.sample_won ?? 0),
      sampleUniverse: Number(r.sample_universe ?? 0),
      verdict: stale ? 'unmeasurable' : ((meta.verdict as CalibrationVerdict) ?? 'unmeasurable'),
      refusals: stale ? [snapshotPredatesFix(metricKey, environment)] : (meta.refusals ?? []),
      frame:
        meta.frame ?? {
          // A stored row with no frame gets one that says so, rather than a
          // plausible-looking frame invented at read time.
          environment,
          observed: 'subject_counts_only_no_value_read',
          asOf: (r.snapshot_date as string) ?? new Date().toISOString(),
          windowFrom: null,
          windowTo: null,
          anchorBasis: 'no_anchor_available',
          anchorMigration: PLATFORM_FORECAST_MIGRATION,
          subjectsAnchored: 0,
          // 0 here is "this stored row does not say", which is why `observed` above is
          // the counts-only member: a stored row with no frame gets one that admits it
          // knows nothing, never a plausible-looking frame invented at read time.
          subjectsWithoutAnchor: 0,
          subjectsWithMetric: 0,
          wonSubjectsWithMetric: 0,
          wonSubjectsAnchorPostdatesOutcome: 0,
          minWonSample: MIN_WON_SAMPLE,
        },
    };
  });

  const histRows = await run(`
    SELECT snapshot_date, metric_key, lift, meta FROM model_calibrations
    ORDER BY snapshot_date DESC LIMIT 60
  `);
  let historySuppressed = 0;
  const history: CalibrationView['history'] = [];
  for (const r of histRows) {
    const meta = (r.meta ?? {}) as { schema?: string };
    if (meta.schema !== CALIBRATION_SCHEMA_MARKER) {
      historySuppressed += 1;
      continue;
    }
    history.push({
      snapshotDate: r.snapshot_date as string,
      metricKey: r.metric_key as string,
      lift: r.lift != null ? Number(r.lift) : null,
    });
  }

  return { latest, history, historySuppressed, refusals };
}
