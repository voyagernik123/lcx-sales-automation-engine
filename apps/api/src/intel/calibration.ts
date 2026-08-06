import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { DEFAULT_ORG_ID } from './observations.js';
import {
  MIN_RESOLVED_FOR_CALIBRATION,
  PLATFORM_FORECAST_MIGRATION,
  asOfAnchors,
  environmentLabel,
  type AsOfAnchors,
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
 *  The SIGNAL metrics are different: nothing deletes `tvl_usd` or
 *  `github_commits_30d`, so their history is real and an as-of read is a genuine
 *  read of what was observable when the call was made. Those are computed — once
 *  there are anchors, and once the won sample clears the floor.
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
  readonly observed:
    | 'observation_value_as_of_prediction_instant'
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
 * Signals from outside the platform. Nothing deletes these, so their history is
 * real and an as-of read means something.
 */
const SIGNAL_METRICS = ['tvl_usd', 'github_commits_30d', 'market_cap_usd', 'priority_score'];

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
}

/**
 * The as-of read: for each anchored subject, the last observation of `predicate`
 * AT OR BEFORE that subject's prediction instant.
 *
 * `observed_at <= a.as_of` IS THE WHOLE FIX. The old query was
 * `DISTINCT ON (subject_id) … ORDER BY subject_id, observed_at DESC` with no bound,
 * which for a won subject returns a value observed after the outcome. Anchors are
 * passed as parallel arrays through `unnest` rather than `= ANY(...)` — see
 * `intel/alpha.ts:137` for why an array literal is the reliable form here.
 *
 * `unanchored_n` counts subjects that have the predicate and no instant, so the
 * exclusion is visible in the frame instead of just making the sample smaller.
 */
async function asOfRead(
  pool: pg.Pool,
  predicate: string,
  anchors: ReadonlyMap<string, string>,
): Promise<{
  universeN: number;
  wonN: number;
  universeMedian: number | null;
  wonMedian: number | null;
  wonTop: number;
  unanchoredN: number;
}> {
  const ids = [...anchors.keys()];
  const instants = ids.map((id) => anchors.get(id)!);
  const { rows } = await pool.query<AsOfRow>(
    `WITH anchor(subject_id, as_of) AS (
       SELECT * FROM unnest($2::text[], $3::timestamptz[])
     ),
     m AS (
       SELECT DISTINCT ON (o.subject_id) o.subject_id, o.value_num AS v
         FROM observations o
         JOIN anchor a ON a.subject_id = o.subject_id
        WHERE o.predicate = $1 AND o.value_num IS NOT NULL
          AND o.observed_at <= a.as_of
        ORDER BY o.subject_id, o.observed_at DESC
     ),
     won AS (SELECT DISTINCT project_id::text AS pid FROM deals WHERE stage = 'won'),
     wonm AS (SELECT m.v FROM won JOIN m ON m.subject_id = won.pid),
     thr AS (SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY v) AS t FROM m)
     SELECT
       (SELECT count(*) FROM m) AS universe_n,
       (SELECT count(*) FROM wonm) AS won_n,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM m) AS universe_median,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM wonm) AS won_median,
       (SELECT count(*) FROM wonm, thr WHERE wonm.v >= thr.t) AS won_top,
       (SELECT count(DISTINCT o.subject_id) FROM observations o
          WHERE o.predicate = $1 AND o.value_num IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM anchor a WHERE a.subject_id = o.subject_id)) AS unanchored_n`,
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
  };
}

function frame(
  environment: string | null,
  anchors: AsOfAnchors,
  observed: CalibrationFrame['observed'],
  subjectsAnchored: number,
  subjectsWithoutAnchor: number,
  window: { from: string | null; to: string | null },
): CalibrationFrame {
  return {
    environment,
    observed,
    asOf: new Date().toISOString(),
    windowFrom: window.from,
    windowTo: window.to,
    anchorBasis: !anchors.ledgerPresent
      ? 'ledger_absent'
      : subjectsAnchored === 0
        ? 'no_anchor_available'
        : 'resolved_platform_forecast',
    anchorMigration: anchors.migration,
    subjectsAnchored,
    subjectsWithoutAnchor,
    minWonSample: MIN_WON_SAMPLE,
  };
}

/**
 * One metric, calibrated or refused.
 *
 * The score branch is UNCONDITIONAL and does not consult the anchors, which looks
 * like a missing feature and is the opposite. An as-of read against a table whose
 * history was deleted returns either nothing (anchor before the last recompute) or
 * the current penalised row (anchor after it) — and the second case is silent
 * contamination that LOOKS like it was fixed. There is no anchor that makes the
 * surviving alpha row honest, so no anchor is consulted.
 */
async function calibrateMetric(
  pool: pg.Pool,
  predicate: string,
  kind: 'score' | 'signal',
  anchors: AsOfAnchors,
  environment: string | null,
): Promise<MetricCalibration> {
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
    const xs = [...anchors.bySubject.values()].sort();
    return { from: xs[0] ?? null, to: xs[xs.length - 1] ?? null };
  })();

  /* ── The score metrics: unmeasurable, with their real counts. ── */
  if (kind === 'score') {
    const c = await counts(pool, predicate, [...anchors.bySubject.keys()]);
    refusals.push({
      code: CALIBRATION_CODES.SCORE_HISTORY_DESTROYED,
      sentence:
        `No lift is expressed for ${predicate}: the only surviving observation of it is the newest one, `
        + 'because every alpha recompute deletes the previous pass, and that newest value carries the '
        + 'listing-status adjustment alpha.ts applies once a project is on LCX — which every won deal is. '
        + `The ${c.wonN} won and ${c.universeN} universe subjects that carry it are the finding.`,
      rule: RULE_NO_LAUNDERING,
      n: c.wonN,
      missingHistory:
        'observations rows for predicate=' + predicate + ' prior to the latest alpha pass — deleted by '
        + 'intel/alpha.ts (DELETE FROM observations WHERE predicate = ANY(ALPHA_PREDICATES)) on every run',
      environment,
    });
    return {
      metricKey: predicate,
      kind,
      lift: null,
      quintileCapture: null,
      wonMedian: null,
      universeMedian: null,
      sampleWon: c.wonN,
      sampleUniverse: c.universeN,
      verdict: 'unmeasurable',
      refusals,
      frame: frame(
        environment,
        anchors,
        'subject_counts_only_no_value_read',
        anchors.bySubject.size,
        c.unanchoredN,
        anchorWindow,
      ),
    };
  }

  /* ── No prediction instant: refuse, but still report coverage. ── */
  if (!anchors.ledgerPresent || anchors.bySubject.size === 0) {
    const c = await counts(pool, predicate, [...anchors.bySubject.keys()]);
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
    return {
      metricKey: predicate,
      kind,
      lift: null,
      quintileCapture: null,
      wonMedian: null,
      universeMedian: null,
      sampleWon: c.wonN,
      sampleUniverse: c.universeN,
      verdict: 'unmeasurable',
      refusals,
      frame: frame(
        environment,
        anchors,
        'subject_counts_only_no_value_read',
        anchors.bySubject.size,
        c.unanchoredN,
        anchorWindow,
      ),
    };
  }

  /* ── The genuine as-of read. ── */
  const r = await asOfRead(pool, predicate, anchors.bySubject);
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

  const suppress = wonBelowFloor || universeBelowFloor || environment === null;
  const lift =
    !suppress && r.wonMedian != null && r.universeMedian
      ? Math.round((r.wonMedian / r.universeMedian) * 100) / 100
      : null;
  const quintileCapture = !suppress && r.wonN > 0 ? Math.round((r.wonTop / r.wonN) * 100) / 100 : null;
  // An unnamed environment is UNMEASURABLE, not insufficient: no amount of further
  // sample makes a figure whose database nobody can name reportable, so it must not
  // read as "nearly there" the way a small n legitimately does.
  const verdict: CalibrationVerdict =
    environment === null
      ? 'unmeasurable'
      : suppress
        ? 'insufficient'
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
    wonMedian: suppress ? null : r.wonMedian,
    universeMedian: universeBelowFloor || environment === null ? null : r.universeMedian,
    sampleWon: r.wonN,
    sampleUniverse: r.universeN,
    verdict,
    refusals,
    frame: frame(
      environment,
      anchors,
      'observation_value_as_of_prediction_instant',
      anchors.bySubject.size,
      r.unanchoredN,
      anchorWindow,
    ),
  };
}

/** Marks a snapshot row as written by the as-of loop. Read back by `getCalibration`. */
const CALIBRATION_SCHEMA_MARKER = 'as_of_v1';

export async function computeCalibration(
  pool: pg.Pool,
  opts?: { readonly databaseUrl?: string | null },
): Promise<{ metrics: MetricCalibration[]; snapshotted: number }> {
  const environment = environmentLabel(opts?.databaseUrl ?? process.env.DATABASE_URL);
  // One anchor read for the whole pass: the instants do not depend on the metric.
  const anchors = await asOfAnchors(pool, 'project');

  const metrics: MetricCalibration[] = [];
  for (const k of SCORE_METRICS) metrics.push(await calibrateMetric(pool, k, 'score', anchors, environment));
  for (const k of SIGNAL_METRICS) metrics.push(await calibrateMetric(pool, k, 'signal', anchors, environment));

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
          subjectsWithoutAnchor: 0,
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
