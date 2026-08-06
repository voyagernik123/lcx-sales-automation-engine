import type pg from 'pg';
import { MIN_N_FOR_RATE, wilson95Pct, type OutcomeRecord } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE FORECAST LEDGER (F2) — "are we any good?" becomes a falsifiable question.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT DID NOT EXIST. Nothing in 0000–0073 pairs a prediction with an outcome.
 *  `model_calibrations` (0031) stores the RESULT of a calibration and none of its
 *  inputs. `observations` (0029) stores values with no horizon and no notion of
 *  resolution. `gps_outcome` (0050) stores what happened and joins the quoted side
 *  in from `gps_engagement`, with no instant at which anything was predicted. So
 *  every accuracy claim was unfalsifiable — not wrong, UNFALSIFIABLE, which is
 *  worse, because nothing could ever contradict it. Migration 0074 adds the two
 *  relations; this module is the only thing that reads or writes them.
 *
 *  THIS IS THE ONE SHAPE, NOT A THIRD SILO. Calibration already existed twice —
 *  `intel/calibration.ts` (lift of a score over won deals) and
 *  `packages/shared/src/gps/calibration.ts` (win/loss over decided engagements,
 *  read by `gps/loop.ts`). Both answer the same question about different subjects,
 *  and neither could say WHEN the prediction was made, which is what made the first
 *  one measure its own thumb (see `asOfAnchors` below). The shape here is the union
 *  of what both need: engine + version + subject + metric + instant + horizon, and
 *  an outcome appended later. `gpsOutcomeToForecast` maps the GPS side onto it
 *  without a schema of its own; `intel/calibration.ts` consumes `asOfAnchors`.
 *
 *  THE HONEST HEADLINE IS A REFUSAL AND IT SHIPS AS THE HEADLINE. There is
 *  nowhere near enough resolved history to claim calibration — on the day this
 *  landed there was NONE, because nothing had ever written a forecast row. So the
 *  first thing every figure carries is its n and, below the floor, a refusal
 *  instead of a percentage. A calibration figure computed from a handful of
 *  resolved forecasts is the single most dangerous number this platform could
 *  print, because it is precisely the number a human would act on.
 */

/* ══════════════════════════════════════════════════════════════════════════════ */
/* CODES, RULES, THRESHOLDS                                                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** Named by every refusal this module returns and by `intel/calibration.ts`. */
export const PLATFORM_FORECAST_MIGRATION = '0074_platform_forecast.sql';

export const PLATFORM_FORECAST_CODES = {
  /** 0074 is not applied here. NOT the same as "no forecasts have been made". */
  LEDGER_ABSENT: 'PLATFORM_FORECAST_LEDGER_ABSENT',
  /** The ledger exists and is empty. A genuinely-empty ledger, stated as such. */
  NONE_RECORDED: 'PLATFORM_FORECAST_NONE_RECORDED',
  /** Forecasts exist; none has an outcome yet. Third state, distinct from both above. */
  NONE_RESOLVED: 'PLATFORM_FORECAST_NONE_RESOLVED',
  /** Resolved, but fewer than `MIN_RESOLVED_FOR_CALIBRATION`. Counts only. */
  N_BELOW_FLOOR: 'PLATFORM_FORECAST_N_BELOW_FLOOR',
  /** No database could be named for the figure. Nothing renders without one. */
  ENVIRONMENT_UNNAMED: 'PLATFORM_FORECAST_ENVIRONMENT_UNNAMED',
  /** An UPDATE or DELETE was attempted against either table. Raised by 0074. */
  APPEND_ONLY: 'PLATFORM_FORECAST_APPEND_ONLY',
  /** An outcome dated before its prediction. Raised by 0074's guard trigger. */
  OUTCOME_PRECEDES_PREDICTION: 'PLATFORM_FORECAST_OUTCOME_PRECEDES_PREDICTION',
  /** An outcome for a forecast id that does not exist. */
  SUBJECT_UNKNOWN: 'PLATFORM_FORECAST_SUBJECT_UNKNOWN',
  /** A probability outcome that is neither 0 nor 1 — see `scoreResolved`. */
  OUTCOME_NOT_BINARY: 'PLATFORM_FORECAST_OUTCOME_NOT_BINARY',
  /**
   * The identity tuple already holds a DIFFERENT prediction. The offered one was NOT
   * stored (0074 forbids an overwrite) and is NOT reported as stored either.
   */
  IDENTITY_HOLDS_DIFFERENT_PREDICTION: 'PLATFORM_FORECAST_IDENTITY_HOLDS_DIFFERENT_PREDICTION',
  /**
   * A number Postgres accepts in a `numeric` column and JavaScript cannot carry:
   * 'NaN', '±Infinity', or a magnitude past 1e308. Excluded from every figure, named.
   */
  VALUE_NOT_FINITE: 'PLATFORM_FORECAST_VALUE_NOT_FINITE',
  /** A resolved row with nothing on the side the score needs. Excluded and counted. */
  VALUE_NOT_SCORABLE: 'PLATFORM_FORECAST_VALUE_NOT_SCORABLE',
  /** A Date that carries no instant (`new Date('nope')`). Refused, never coerced to now. */
  INSTANT_INVALID: 'PLATFORM_FORECAST_INSTANT_INVALID',
  /** 0074 refused the row on one of its own constraints. The constraint name travels. */
  REJECTED_BY_LEDGER: 'PLATFORM_FORECAST_REJECTED_BY_LEDGER',
} as const;

export type PlatformForecastCode = (typeof PLATFORM_FORECAST_CODES)[keyof typeof PLATFORM_FORECAST_CODES];

export interface ForecastRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

/*
 * The citations are declared here rather than imported from
 * `packages/shared/src/marks/mark.ts`, which already has the same three sentences.
 * They are NOT exported through `packages/shared/src/index.ts` — that barrel is this
 * package's only entry point and adding a line to it belongs to another lane. A
 * duplicated sentence is a smaller cost than an unreachable import, and the wording
 * is kept identical so the two can be diffed.
 */
const RULE_ABSENT_REFUSES: ForecastRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
    + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
};

const RULE_NO_LAUNDERING: ForecastRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. If you cannot know, say you cannot know.',
};

const RULE_ENVIRONMENT_LABEL: ForecastRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an environment label',
  text: 'Every figure carries an ObservationFrame and an environment label where it came from a database.',
};

/**
 * Below this many RESOLVED forecasts in a group, no accuracy figure is expressed —
 * the counts are the finding.
 *
 * IT IS `MIN_N_FOR_RATE`, DELIBERATELY, AND NOT A SECOND NUMBER. That constant
 * (`packages/shared/src/gps/calibration.ts:243`) already carries the argument in
 * full: a Wilson 95% interval at the worst case p̂ = 0.5 spans 76 points at n = 3
 * and 56 points at n = 8, so 8 is not a claim of sufficiency — it is the point
 * where the interval stops covering nearly the whole range and a reader can see the
 * width. `intel/calibration.ts` independently picked 8 for the same reason. Two
 * silos agreeing on 8 by coincidence is one edit away from disagreeing, and a
 * platform with two accuracy floors has none, so this is a re-export of the same
 * constant rather than a copy of its value.
 */
export const MIN_RESOLVED_FOR_CALIBRATION = MIN_N_FOR_RATE;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* SHAPES                                                                          */
/* ══════════════════════════════════════════════════════════════════════════════ */

export type PredictionKind = 'probability' | 'ordinal' | 'scalar' | 'category';
export type OutcomeKind = 'resolved' | 'unresolvable';

export interface ForecastRefusal {
  readonly code: PlatformForecastCode;
  /** One sentence, to the operator, active voice. Carries the real n where there is one. */
  readonly sentence: string;
  readonly rule: ForecastRuleCitation;
  /** The n the refusal is about, or null when n was not the question. */
  readonly n: number | null;
  /** Null only where no database was reached at all. */
  readonly environment: string | null;
}

/**
 * What was observed, when, over what window — carried by every figure and by every
 * refusal group, so a number cannot be quoted without the shape of its evidence.
 */
export interface ForecastObservationFrame {
  /** Which database. `null` refuses; nothing renders off an unnamed environment. */
  readonly environment: string | null;
  readonly observed: 'resolved_platform_forecasts';
  /** When this frame was computed. */
  readonly asOf: string;
  /** Earliest / latest `predicted_at` among the forecasts that ACTUALLY fed the figure. */
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly windowBasis: 'observed_from_resolved_forecasts' | 'nothing_resolved' | 'ledger_absent';
  /** Horizon span of the same rows. A figure pooled over 7-day and 400-day calls says so. */
  readonly horizonDaysObserved: { readonly min: number; readonly max: number } | null;
  readonly resolved: number;
  readonly unresolvable: number;
  /** Horizon has not elapsed yet. Not a miss. */
  readonly pending: number;
  /** Horizon elapsed with no outcome recorded. THE COUNT THAT HIDES MISSES. */
  readonly overdue: number;
  /** Outcome rows replaced by a later append. Reported, never dropped. */
  readonly superseded: number;
  readonly floor: number;
}

export interface ForecastPredictionInput {
  readonly engine: string;
  readonly engineVersion: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly metricKey: string;
  readonly kind: PredictionKind;
  /** Required for every kind except 'category'. 0–1 for 'probability'. */
  readonly predictedNum?: number | null;
  /** Required for 'category', forbidden otherwise. */
  readonly predictedLabel?: string | null;
  /** The instant the call was made. Never defaulted — see 0074's comment. */
  readonly predictedAt: Date;
  readonly horizonDays: number;
  /** The ObservationFrame of the inputs the engine saw. Stored as given. */
  readonly inputsFrame?: unknown;
}

export interface ForecastOutcomeInput {
  readonly forecastId: string;
  readonly kind: OutcomeKind;
  readonly observedNum?: number | null;
  readonly observedLabel?: string | null;
  readonly observedAt: Date;
  readonly source: string;
  /** Required when `kind` is 'unresolvable' — the reason is the whole content of the row. */
  readonly note?: string | null;
  readonly provenance: 'observed' | 'reconstructed';
}

export interface ResolvedForecast {
  readonly forecastId: string;
  readonly engine: string;
  readonly engineVersion: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly metricKey: string;
  readonly kind: PredictionKind;
  readonly predictedNum: number | null;
  readonly predictedLabel: string | null;
  readonly predictedAt: string;
  readonly horizonDays: number;
  readonly environment: string;
  readonly observedNum: number | null;
  readonly observedLabel: string | null;
  readonly observedAt: string;
  readonly outcomeSource: string;
  readonly provenance: 'observed' | 'reconstructed';
  /** Earlier outcome rows for this forecast that this one supersedes. */
  readonly supersededOutcomes: number;
}

/**
 * The accuracy figure for one group, expressed ONLY above the floor.
 *
 * NO PROBABILITY FORECAST GETS A PERCENTAGE. "73% accurate" is the shape a reader
 * remembers and it is not a property of a probabilistic forecaster at all — a forecaster
 * that says 30% and is right 30% of the time is perfectly calibrated and would score 70%
 * "wrong". So the probability branch expresses a Brier score and a skill score against
 * its own base rate, and nothing that can be quoted as an accuracy.
 *
 * `agreementPct` ON THE CATEGORY BRANCH IS AN ACCURACY PERCENTAGE, and saying "there is
 * no accuracyPct in this union" was true by field name only. For a CATEGORY prediction it
 * is the right figure — either the label matched or it did not — and it carries its own
 * Wilson interval so the width is visible. It is only dangerous when the two label
 * vocabularies cannot ever match, which is what the GPS adapter used to do; see the note
 * on `gpsOutcomeToForecast`.
 */
export type PlatformForecastFigure =
  | {
      readonly kind: 'brier';
      /** Mean (p − o)². Lower is better; 0.25 is what a constant 0.5 scores. */
      readonly brier: number;
      /** The same score for "always predict the observed base rate" — the reference. */
      readonly referenceBrier: number;
      /** 1 − brier/reference. Positive means the engine beat its own base rate. Null when the reference is 0. */
      readonly skill: number | null;
      readonly meanPredicted: number;
      readonly baseRatePct: number;
      readonly baseRateInterval95Pct: { readonly lowPct: number; readonly highPct: number } | null;
    }
  | {
      readonly kind: 'absolute_error';
      readonly meanAbsoluteError: number;
      readonly medianAbsoluteError: number;
      /** Named, because an ordinal 0–100 and a day count are both numbers. */
      readonly unit: 'points_of_the_predicted_metric';
    }
  | {
      readonly kind: 'agreement';
      readonly agreed: number;
      readonly disagreed: number;
      readonly agreementPct: number;
      readonly interval95Pct: { readonly lowPct: number; readonly highPct: number } | null;
    };

export interface PlatformForecastGroup {
  readonly engine: string;
  readonly engineVersion: string;
  readonly metricKey: string;
  readonly kind: PredictionKind;
  /** Null whenever anything in `refusals` applies. Never 0 for "nothing resolved". */
  readonly figure: PlatformForecastFigure | null;
  readonly refusals: readonly ForecastRefusal[];
  readonly frame: ForecastObservationFrame;
}

export interface PlatformForecastCalibration {
  readonly groups: readonly PlatformForecastGroup[];
  /** Applies to the whole surface: ledger absent, nothing recorded, no environment. */
  readonly refusals: readonly ForecastRefusal[];
  readonly frame: ForecastObservationFrame;
  readonly ledgerPresent: boolean;
  readonly migration: string;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* ENVIRONMENT LABEL                                                               */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * `kind:host/db` for a connection string, or `null` when it cannot be named.
 *
 * A LOCAL COPY OF `marks/mark.ts:752`, and the duplication is deliberate: that
 * function is not exported through `packages/shared/src/index.ts`, whose only
 * consumers reach it through `deals/index.ts`, and editing that barrel is another
 * lane's file. The semantics are copied exactly, including the two that matter —
 * CREDENTIALS DO NOT SURVIVE (host and database name only), and an unparseable or
 * empty string returns `null` rather than the string 'unknown', because a sentinel
 * satisfies a `string` type and once shipped a price labelled 'unknown'.
 */
export function environmentLabel(databaseUrl: string | null | undefined): string | null {
  const raw = (databaseUrl ?? '').trim();
  if (raw === '') return null;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host === '') return null;
    const db = u.pathname.replace(/^\//, '');
    const where = db === '' ? host : `${host}/${db}`;
    const kind = /(^|\.)supabase\.(co|com|net)$/i.test(host)
      ? 'supabase'
      : host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'local'
        : 'external';
    return `${kind}:${where}`;
  } catch {
    return null;
  }
}

/**
 * The environment label for a figure, from an explicit URL or from the process.
 *
 * `databaseUrl: null` MEANS "I CANNOT NAME ONE" AND IS NOT A MISSING ARGUMENT. Every
 * entry point here used to read `opts?.databaseUrl ?? process.env.DATABASE_URL`, which
 * quietly stamped the PROCESS's database name onto a figure whose caller had
 * explicitly said it had none — so the one input that most obviously has to produce
 * ENVIRONMENT_UNNAMED was the one input that could not, and only the empty string got
 * there. `undefined`, or no `opts` at all, still falls back to the process: that is a
 * caller who never spoke about the database, not one who disclaimed it.
 */
export function environmentFor(opts?: { readonly databaseUrl?: string | null }): string | null {
  if (opts && opts.databaseUrl === null) return null;
  return environmentLabel(opts?.databaseUrl ?? process.env.DATABASE_URL);
}

/**
 * The instant, or null for a Date that carries none.
 *
 * `new Date('not a date').toISOString()` throws `RangeError: Invalid time value`, which
 * used to leave `recordForecast` (whose return type promises a refusal path) rejecting
 * instead. An unparseable instant is absent data and absent data refuses.
 */
const instantOf = (d: Date): string | null => {
  const t = d instanceof Date ? d.getTime() : Number.NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * Is this a number the ledger may hold and the reader may print?
 *
 * `numeric` ACCEPTS 'NaN' AND '±Infinity' IN POSTGRES, and `JSON.stringify(NaN)` is
 * `null` — so a NaN that reached the ledger came back out as a figure key that is
 * present and null, indistinguishable from one that was deliberately withheld and with
 * no refusal beside it. The 1e308 bound is the same fact one step earlier: a numeric
 * larger than that becomes `Infinity` the moment `Number()` touches it.
 */
const JS_SAFE_MAGNITUDE = 1e308;
const isFiniteFigure = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= JS_SAFE_MAGNITUDE;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* PROBES AND WRITES                                                               */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Is 0074 applied here?
 *
 * `to_regclass` respects `search_path`, which is what makes the test suite's scoped
 * schemas mean anything. The literal contains no input.
 */
export async function platformForecastLedgerPresent(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query<{ present: boolean }>(
    `SELECT to_regclass('platform_forecast') IS NOT NULL
        AND to_regclass('platform_forecast_outcome') IS NOT NULL AS present`,
  );
  return rows[0]?.present === true;
}

const ledgerAbsent = (environment: string | null): ForecastRefusal => ({
  code: PLATFORM_FORECAST_CODES.LEDGER_ABSENT,
  sentence:
    `No forecast can be recorded or read on this environment: migration ${PLATFORM_FORECAST_MIGRATION} `
    + '(tables platform_forecast, platform_forecast_outcome) has not been applied. This is the absence of '
    + 'the ledger, which is a different finding from an empty one.',
  rule: RULE_ABSENT_REFUSES,
  n: null,
  environment,
});

const environmentUnnamed = (): ForecastRefusal => ({
  code: PLATFORM_FORECAST_CODES.ENVIRONMENT_UNNAMED,
  sentence:
    'No database can be named for this figure, so no figure is expressed. A forecast whose environment '
    + 'is unstated cannot be told apart from a laptop\'s, and that mistake has already been made here.',
  rule: RULE_ENVIRONMENT_LABEL,
  n: null,
  environment: null,
});

export type RecordResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly refusal: ForecastRefusal };

/** Map a Postgres error raised by 0074's triggers onto our stable codes. */
function codeFromPgError(err: unknown): PlatformForecastCode | null {
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of Object.values(PLATFORM_FORECAST_CODES)) {
    if (msg.includes(code)) return code;
  }
  return null;
}

/** True when the failure was 0074 refusing a mutation. Exported so callers can assert it. */
export function isAppendOnlyRefusal(err: unknown): boolean {
  return codeFromPgError(err) === PLATFORM_FORECAST_CODES.APPEND_ONLY;
}

const instantInvalid = (field: string, environment: string | null): ForecastRefusal => ({
  code: PLATFORM_FORECAST_CODES.INSTANT_INVALID,
  sentence:
    `The ${field} of this record carries no instant — an Invalid Date — so nothing about it can be dated `
    + 'and it was refused. It is NOT defaulted to now(): a prediction dated to the moment it was filed is a '
    + 'prediction with a zero horizon, which is the contamination this ledger exists to stop.',
  rule: RULE_ABSENT_REFUSES,
  n: null,
  environment,
});

const valueNotFinite = (field: string, value: number, environment: string | null): ForecastRefusal => ({
  code: PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE,
  sentence:
    `The ${field} of this record is ${String(value)}, which is not a number any figure can be computed from, `
    + 'so it was refused rather than stored. Postgres would have accepted it in a numeric column and JSON '
    + 'would have serialised it back out as null — a figure key that is present and empty, with no refusal '
    + 'beside it and nothing to tell it apart from one deliberately withheld.',
  rule: RULE_ABSENT_REFUSES,
  n: null,
  environment,
});

/**
 * A refusal when the failure was 0074 declining the row, or null when it was not.
 *
 * Matched on SQLSTATE, not on message text: 23514 check_violation (every CHECK in 0074,
 * including the value-matches-kind one and the finite bounds), 23502 not_null_violation,
 * 22003 numeric_value_out_of_range, 22007/22P02 malformed input. Anything else is NOT a
 * refusal and is rethrown — a broken deployment must not read as "the data was bad".
 * The constraint name travels in the sentence, because "the ledger refused this row"
 * without saying which rule it applied is not an explanation.
 */
function rejectedByLedger(err: unknown, environment: string | null): ForecastRefusal | null {
  const e = err as { code?: string; constraint?: string } | null;
  const sqlstate = typeof e?.code === 'string' ? e.code : '';
  if (!['23514', '23502', '22003', '22007', '22P02'].includes(sqlstate)) return null;
  const named = e?.constraint ? `constraint ${e.constraint}` : `SQLSTATE ${sqlstate}`;
  return {
    code: PLATFORM_FORECAST_CODES.REJECTED_BY_LEDGER,
    sentence:
      `Migration ${PLATFORM_FORECAST_MIGRATION} refused this row on ${named}, so no prediction was recorded. `
      + 'The ledger is the authority on what a well-formed prediction is and this was not one; the refusal is '
      + 'returned rather than thrown so a job can report it beside the rows it did record.',
    rule: RULE_ABSENT_REFUSES,
    n: null,
    environment,
  };
}

interface IdentityRow {
  id: string;
  prediction_kind: string;
  predicted_num: string | null;
  predicted_label: string | null;
  horizon_days: number;
  inserted: boolean;
}

/** Same number, allowing for `numeric` coming back as a differently-scaled string. */
const sameNum = (stored: string | null, offered: number | null | undefined): boolean => {
  const o = offered ?? null;
  if (stored === null || o === null) return stored === null && o === null;
  return Number(stored) === o;
};

/**
 * Record a prediction.
 *
 * `ON CONFLICT DO NOTHING` on the identity index, then a RETURNING-or-select: a job
 * re-running over the same pass must not double the corpus the n-floor is measured
 * against, so re-recording an identical call returns the EXISTING id rather than an
 * error — "this prediction is already on file" is not a failure.
 *
 * BUT THE IDENTITY INDEX DOES NOT COVER THE VALUE, AND THE FIRST CUT OF THIS REPORTED
 * SUCCESS FOR A PREDICTION IT HAD NOT STORED. `(engine, engine_version, subject_type,
 * subject_id, metric_key, predicted_at)` says nothing about `predicted_num`, so a
 * SECOND, DIFFERENT call at the same instant was swallowed by DO NOTHING and the
 * pre-existing id was handed back with ok:true. The caller was told its number was in
 * the ledger; the ledger held somebody else's. So the existing row is read back and
 * COMPARED, and a genuine disagreement is a refusal — 0074 will not let it be
 * overwritten, and this will not let it be silently dropped either. Which of the two
 * is right is not a question this function can answer, so it does not guess.
 */
export async function recordForecast(
  pool: pg.Pool,
  input: ForecastPredictionInput,
  opts?: { readonly databaseUrl?: string | null },
): Promise<RecordResult> {
  const environment = environmentFor(opts);
  if (environment === null) return { ok: false, refusal: environmentUnnamed() };
  if (!(await platformForecastLedgerPresent(pool))) {
    return { ok: false, refusal: ledgerAbsent(environment) };
  }

  const predictedAt = instantOf(input.predictedAt);
  if (predictedAt === null) {
    return { ok: false, refusal: instantInvalid('predictedAt', environment) };
  }
  if (input.predictedNum != null && !isFiniteFigure(input.predictedNum)) {
    return { ok: false, refusal: valueNotFinite('predictedNum', input.predictedNum, environment) };
  }

  let rows: IdentityRow[];
  try {
    // The `existing` CTE runs against the statement's own snapshot, so it sees a
    // pre-existing conflicting row and never the row `ins` is inserting. `ORDER BY
    // inserted DESC` is what makes the branch below deterministic — the bare
    // `UNION ALL … LIMIT 1` this replaces bounded the WHOLE union and relied on
    // Postgres happening to emit the CTE's row first.
    ({ rows } = await pool.query<IdentityRow>(
      `WITH ins AS (
         INSERT INTO platform_forecast
           (engine, engine_version, subject_type, subject_id, metric_key, prediction_kind,
            predicted_num, predicted_label, predicted_at, horizon_days, inputs_frame, environment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11::jsonb,$12)
         ON CONFLICT (engine, engine_version, subject_type, subject_id, metric_key, predicted_at)
           DO NOTHING
         RETURNING id, prediction_kind, predicted_num, predicted_label, horizon_days
       ),
       existing AS (
         SELECT id, prediction_kind, predicted_num, predicted_label, horizon_days
           FROM platform_forecast
          WHERE engine=$1 AND engine_version=$2 AND subject_type=$3 AND subject_id=$4
            AND metric_key=$5 AND predicted_at=$9::timestamptz
          LIMIT 1
       )
       SELECT * FROM (
         SELECT id, prediction_kind, predicted_num, predicted_label, horizon_days, true  AS inserted FROM ins
         UNION ALL
         SELECT id, prediction_kind, predicted_num, predicted_label, horizon_days, false AS inserted FROM existing
       ) u
       ORDER BY inserted DESC
       LIMIT 1`,
      [
        input.engine,
        input.engineVersion,
        input.subjectType,
        input.subjectId,
        input.metricKey,
        input.kind,
        input.predictedNum ?? null,
        input.predictedLabel ?? null,
        predictedAt,
        input.horizonDays,
        JSON.stringify(input.inputsFrame ?? {}),
        environment,
      ],
    ));
  } catch (err) {
    // 0074's own constraints (value-matches-kind, positive horizon, non-empty text,
    // finite numbers) become refusals rather than rejections: `RecordResult` promises
    // a refusal path and a calibration job handed a probability of 1.0000000000000002
    // by ordinary floating point used to die instead of refusing. Anything that is NOT
    // one of 0074's constraints still throws — an unexpected failure laundered into a
    // refusal would read as "the data was bad" about a broken deployment.
    const refusal = rejectedByLedger(err, environment);
    if (refusal) return { ok: false, refusal };
    throw err;
  }

  const row = rows[0]!;
  if (row.inserted !== true) {
    const differs =
      row.prediction_kind !== input.kind
      || !sameNum(row.predicted_num, input.predictedNum ?? null)
      || (row.predicted_label ?? null) !== (input.predictedLabel ?? null)
      || Number(row.horizon_days) !== input.horizonDays;
    if (differs) {
      return {
        ok: false,
        refusal: {
          code: PLATFORM_FORECAST_CODES.IDENTITY_HOLDS_DIFFERENT_PREDICTION,
          sentence:
            `A DIFFERENT prediction is already on file for ${input.engine}@${input.engineVersion} / `
            + `${input.subjectType} ${input.subjectId} / ${input.metricKey} at `
            + `${predictedAt}: the ledger holds ${row.prediction_kind} `
            + `${row.predicted_num ?? row.predicted_label ?? 'null'} over ${row.horizon_days} days, and this `
            + `call offered ${input.kind} ${input.predictedNum ?? input.predictedLabel ?? 'null'} over `
            + `${input.horizonDays} days. Nothing was overwritten and nothing was silently dropped. Which of `
            + 'the two is the real call is not something this function can know, so it does not choose: record '
            + 'the new one at its own instant, or bump the engine version.',
          rule: RULE_NO_LAUNDERING,
          n: null,
          environment,
        },
      };
    }
  }
  return { ok: true, id: row.id };
}

/**
 * Append an outcome. NEVER an UPDATE of the prediction — 0074 makes that impossible
 * at the database, and this function is the only writer that needs to exist.
 *
 * A second outcome for the same forecast is legal and is a CORRECTION: the reader
 * takes the latest by `seq` and reports how many it superseded. Nothing is lost, and
 * "this number was revised" stays visible.
 */
export async function recordForecastOutcome(
  pool: pg.Pool,
  input: ForecastOutcomeInput,
  opts?: { readonly databaseUrl?: string | null },
): Promise<RecordResult> {
  const environment = environmentFor(opts);
  if (!(await platformForecastLedgerPresent(pool))) {
    return { ok: false, refusal: ledgerAbsent(environment) };
  }
  const observedAt = instantOf(input.observedAt);
  if (observedAt === null) {
    return { ok: false, refusal: instantInvalid('observedAt', environment) };
  }
  if (input.observedNum != null && !isFiniteFigure(input.observedNum)) {
    return { ok: false, refusal: valueNotFinite('observedNum', input.observedNum, environment) };
  }
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO platform_forecast_outcome
         (forecast_id, outcome_kind, observed_num, observed_label, observed_at, source, note, provenance)
       VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8)
       RETURNING id`,
      [
        input.forecastId,
        input.kind,
        input.observedNum ?? null,
        input.observedLabel ?? null,
        observedAt,
        input.source,
        input.note ?? null,
        input.provenance,
      ],
    );
    return { ok: true, id: rows[0]!.id };
  } catch (err) {
    const code = codeFromPgError(err);
    if (code === PLATFORM_FORECAST_CODES.OUTCOME_PRECEDES_PREDICTION) {
      return {
        ok: false,
        refusal: {
          code,
          sentence:
            'This outcome is dated before the prediction it resolves, so it measures nothing and was '
            + 'refused. Record the instant the outcome actually happened, or record it as unresolvable.',
          rule: RULE_NO_LAUNDERING,
          n: null,
          environment,
        },
      };
    }
    if (code === PLATFORM_FORECAST_CODES.SUBJECT_UNKNOWN) {
      return {
        ok: false,
        refusal: {
          code,
          sentence: `No prediction ${input.forecastId} exists, so there is nothing for this outcome to resolve.`,
          rule: RULE_ABSENT_REFUSES,
          n: null,
          environment,
        },
      };
    }
    const rejected = rejectedByLedger(err, environment);
    if (rejected) return { ok: false, refusal: rejected };
    throw err;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE AS-OF SEAM — what `intel/calibration.ts` needs and could not have            */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface SubjectAnchor {
  /**
   * The EARLIEST resolved prediction instant for the subject, and the reason it is the
   * earliest is the whole of this lane's headline defect.
   *
   * THIS WAS `max(predicted_at)` AND THAT DID NOT HOLD. The argument for max() was that
   * 0074's guard trigger forbids an outcome dated before its prediction, so a resolved
   * prediction is at or before its own outcome. That is true and it is not the claim
   * that matters: the trigger relates a forecast to ITS OWN outcome row, and says
   * nothing about the instant the SUBJECT's real-world outcome happened — the deal's
   * win date lives in another table the ledger cannot see. So a pass that records a
   * forecast for an already-won project, and resolves it against the win it can read
   * today, is perfectly legal, and `max()` deliberately picks that latest one as the
   * anchor. The as-of read then returns the current, post-outcome value and the whole
   * fix evaporates. That is not hypothetical: `intel/alpha.ts` is instructed to record
   * each scheduled pass at the pass instant, which produces exactly this row for every
   * subject already decided.
   *
   * `min()` is the earliest defensible instant — the first call anyone made about this
   * subject — and it cannot be dragged later by an after-the-fact pass. It is still not
   * a GUARANTEE that the anchor precedes the outcome (if every recorded call postdates
   * the win, the earliest one does too), which is why `outcomeAt` and
   * `predictionsAtOrAfterOwnOutcome` travel beside it and why the caller must bound the
   * anchor against the outcome IT is validating against. `intel/calibration.ts` does
   * that with `deals.won_at` and refuses the subjects that fail it.
   */
  readonly asOf: string;
  /**
   * The earliest outcome instant among the subject's resolved forecasts.
   *
   * `asOf <= outcomeAt` ALWAYS, by the trigger, so this is NOT a contamination check —
   * it is what a caller needs to see how much room there is between the two, and to
   * cross-check its own notion of when the subject was decided.
   */
  readonly outcomeAt: string;
  /**
   * Resolved predictions for this subject recorded at or after that earliest outcome
   * instant. Non-zero means the ledger holds calls made about a subject already
   * decided — legal, sometimes deliberate, and never usable as an as-of anchor.
   */
  readonly predictionsAtOrAfterOwnOutcome: number;
}

export interface AsOfAnchors {
  /** False when 0074 is unapplied. Then `bySubject` is empty and MUST NOT read as "no predictions". */
  readonly ledgerPresent: boolean;
  readonly migration: string;
  /** subjectId → its anchor. Resolved forecasts only. */
  readonly bySubject: ReadonlyMap<string, SubjectAnchor>;
}

/**
 * The prediction instants for a subject type, for an as-of read of `observations`.
 *
 * WHY THIS FUNCTION IS THE WHOLE POINT OF F2. `intel/calibration.ts` read
 * `DISTINCT ON (subject_id) … ORDER BY observed_at DESC` — the LATEST value — and
 * then compared won deals against the universe. For a won deal that value is
 * post-outcome, and `packages/shared/src/alpha.ts` subtracts 40 from listing
 * propensity (alpha.ts:114-117) and 50 from winnability (alpha.ts:232-235) once
 * `listed_on_lcx` is true. Every won deal is listed. The loop was therefore
 * "validating" a score that already contained a penalty the loop itself caused, and
 * the lift it printed was a measurement of the platform's own thumb on the scale.
 *
 * Returning an empty map when the ledger is missing would reproduce the same class
 * of error one level up, so `ledgerPresent` is a separate field and the caller has
 * to branch on it.
 *
 * WHAT THIS FUNCTION STILL CANNOT DO, stated because the comment it replaces claimed
 * otherwise: it cannot certify that an anchor precedes the subject's real outcome. It
 * knows about forecasts and their recorded outcomes, not about `deals`. It reports
 * everything a caller needs to make that judgement (`SubjectAnchor`) and leaves the
 * judgement — and the refusal — to the caller that knows what "the outcome" is.
 */
export async function asOfAnchors(pool: pg.Pool, subjectType: string): Promise<AsOfAnchors> {
  if (!(await platformForecastLedgerPresent(pool))) {
    return { ledgerPresent: false, migration: PLATFORM_FORECAST_MIGRATION, bySubject: new Map() };
  }
  const { rows } = await pool.query<{
    subject_id: string;
    as_of: string;
    outcome_at: string;
    after_own_outcome: string;
  }>(
    `WITH resolved AS (
       SELECT f.subject_id, f.predicted_at, latest.observed_at
         FROM platform_forecast f
         JOIN LATERAL (
           SELECT o.outcome_kind, o.observed_at
             FROM platform_forecast_outcome o
            WHERE o.forecast_id = f.id
            ORDER BY o.seq DESC
            LIMIT 1
         ) latest ON true
        WHERE f.subject_type = $1
          AND latest.outcome_kind = 'resolved'
     ),
     agg AS (
       SELECT subject_id, min(predicted_at) AS as_of, min(observed_at) AS outcome_at
         FROM resolved
        GROUP BY subject_id
     )
     SELECT a.subject_id,
            to_char(a.as_of      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of,
            to_char(a.outcome_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS outcome_at,
            (SELECT count(*) FROM resolved r
              WHERE r.subject_id = a.subject_id AND r.predicted_at >= a.outcome_at) AS after_own_outcome
       FROM agg a`,
    [subjectType],
  );
  return {
    ledgerPresent: true,
    migration: PLATFORM_FORECAST_MIGRATION,
    bySubject: new Map(
      rows.map((r) => [
        r.subject_id,
        {
          asOf: r.as_of,
          outcomeAt: r.outcome_at,
          predictionsAtOrAfterOwnOutcome: Number(r.after_own_outcome ?? 0),
        },
      ]),
    ),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* READ + SCORE                                                                    */
/* ══════════════════════════════════════════════════════════════════════════════ */

interface CensusRow {
  engine: string | null;
  engine_version: string | null;
  metric_key: string | null;
  prediction_kind: string | null;
  resolved: string;
  unresolvable: string;
  pending: string;
  overdue: string;
  superseded: string;
  recorded: string;
}

interface Census {
  /** The whole ledger. `engine` is null on this row. */
  readonly total: CensusRow;
  /** Keyed exactly as the groups are, so a group's frame carries ITS counts. */
  readonly byGroup: ReadonlyMap<string, CensusRow>;
}

/**
 * Every forecast on file, classified. Four states, never collapsed:
 * resolved / unresolvable / pending (horizon still open) / overdue (horizon closed
 * with nothing recorded). `overdue` is the one that matters most — a platform that
 * quietly stops resolving its bad calls shows up here and nowhere else.
 *
 * GROUPING SETS gives the per-group counts AND the total in one pass, and the reason
 * it has to be per-group is a defect this had on its first run: a group frame that
 * reported the group's own `resolved` beside the WHOLE LEDGER's `overdue` reads as
 * one number about one thing, and three of the counts belonged to something else.
 */
async function census(pool: pg.Pool): Promise<Census> {
  const { rows } = await pool.query<CensusRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (o.forecast_id) o.forecast_id, o.outcome_kind
         FROM platform_forecast_outcome o
        ORDER BY o.forecast_id, o.seq DESC
     ),
     sup AS (
       SELECT o2.forecast_id, count(*) AS n
         FROM platform_forecast_outcome o2
        WHERE EXISTS (SELECT 1 FROM platform_forecast_outcome o3
                       WHERE o3.forecast_id = o2.forecast_id AND o3.seq > o2.seq)
        GROUP BY o2.forecast_id
     )
     SELECT f.engine, f.engine_version, f.metric_key, f.prediction_kind,
       count(*) FILTER (WHERE l.outcome_kind = 'resolved')      AS resolved,
       count(*) FILTER (WHERE l.outcome_kind = 'unresolvable')  AS unresolvable,
       count(*) FILTER (WHERE l.outcome_kind IS NULL
                          AND now() < f.predicted_at + f.horizon_days * INTERVAL '1 day') AS pending,
       count(*) FILTER (WHERE l.outcome_kind IS NULL
                          AND now() >= f.predicted_at + f.horizon_days * INTERVAL '1 day') AS overdue,
       COALESCE(sum(sup.n), 0) AS superseded,
       count(*) AS recorded
     FROM platform_forecast f
     LEFT JOIN latest l ON l.forecast_id = f.id
     LEFT JOIN sup ON sup.forecast_id = f.id
     GROUP BY GROUPING SETS ((f.engine, f.engine_version, f.metric_key, f.prediction_kind), ())`,
  );
  const empty: CensusRow = {
    engine: null, engine_version: null, metric_key: null, prediction_kind: null,
    resolved: '0', unresolvable: '0', pending: '0', overdue: '0', superseded: '0', recorded: '0',
  };
  const byGroup = new Map<string, CensusRow>();
  let total = empty;
  for (const r of rows) {
    if (r.engine === null) total = r;
    else byGroup.set(groupKey(r.engine, r.engine_version!, r.metric_key!, r.prediction_kind!), r);
  }
  return { total, byGroup };
}

/**
 * NUL as the separator, not a space or a colon: `engine` and `metric_key` are free
 * text with only a non-empty CHECK on them, and a space in either would split one
 * group in two, or fuse two into one, without anything looking wrong on screen.
 */
const GROUP_KEY_SEP = '\u0000';
const groupKey = (engine: string, version: string, metric: string, kind: string): string =>
  [engine, version, metric, kind].join(GROUP_KEY_SEP);

interface ResolvedRow {
  forecast_id: string;
  engine: string;
  engine_version: string;
  subject_type: string;
  subject_id: string;
  metric_key: string;
  prediction_kind: string;
  predicted_num: string | null;
  predicted_label: string | null;
  predicted_at: string;
  horizon_days: number;
  environment: string;
  observed_num: string | null;
  observed_label: string | null;
  observed_at: string;
  source: string;
  provenance: string;
  superseded: string;
}

/** Every forecast whose LATEST outcome row resolves it, with the supersede count kept. */
export async function listResolvedForecasts(pool: pg.Pool): Promise<readonly ResolvedForecast[]> {
  const { rows } = await pool.query<ResolvedRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (o.forecast_id)
              o.forecast_id, o.outcome_kind, o.observed_num, o.observed_label,
              o.observed_at, o.source, o.provenance, o.seq
         FROM platform_forecast_outcome o
        ORDER BY o.forecast_id, o.seq DESC
     )
     SELECT f.id AS forecast_id, f.engine, f.engine_version, f.subject_type, f.subject_id,
            f.metric_key, f.prediction_kind, f.predicted_num, f.predicted_label,
            to_char(f.predicted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS predicted_at,
            f.horizon_days, f.environment,
            l.observed_num, l.observed_label,
            to_char(l.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,
            l.source, l.provenance,
            (SELECT count(*) FROM platform_forecast_outcome o2
              WHERE o2.forecast_id = f.id AND o2.seq < l.seq) AS superseded
       FROM platform_forecast f
       JOIN latest l ON l.forecast_id = f.id
      WHERE l.outcome_kind = 'resolved'
      ORDER BY f.predicted_at ASC, f.id ASC`,
  );
  return rows.map((r) => ({
    forecastId: r.forecast_id,
    engine: r.engine,
    engineVersion: r.engine_version,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    metricKey: r.metric_key,
    kind: r.prediction_kind as PredictionKind,
    predictedNum: r.predicted_num != null ? Number(r.predicted_num) : null,
    predictedLabel: r.predicted_label,
    predictedAt: r.predicted_at,
    horizonDays: Number(r.horizon_days),
    environment: r.environment,
    observedNum: r.observed_num != null ? Number(r.observed_num) : null,
    observedLabel: r.observed_label,
    observedAt: r.observed_at,
    outcomeSource: r.source,
    provenance: r.provenance as 'observed' | 'reconstructed',
    supersededOutcomes: Number(r.superseded ?? 0),
  }));
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  // Odd length takes the middle value; even takes the LOWER of the two middles
  // rather than their mean, so every number reported is one that was measured.
  // Same reason as `marks/mark.ts:429` (nearest rank, no interpolation).
  return s.length % 2 === 1 ? s[mid]! : s[mid - 1]!;
};

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/**
 * The figure for one group, or a refusal.
 *
 * Returns refusals as well as a figure because a group can be above the floor and
 * still have a member the arithmetic cannot use — a probability resolved to 0.5, for
 * instance. Those are named and EXCLUDED from the figure, never coerced to the
 * nearest plausible value, and the exclusion travels in the group's refusals so a
 * shrinking n is visible.
 */
function scoreResolved(
  rows: readonly ResolvedForecast[],
  kind: PredictionKind,
  environment: string | null,
): { figure: PlatformForecastFigure | null; refusals: ForecastRefusal[] } {
  const refusals: ForecastRefusal[] = [];

  if (kind === 'probability') {
    const pairs: { p: number; o: number }[] = [];
    let nonBinary = 0;
    let notFinite = 0;
    for (const r of rows) {
      const p = r.predictedNum;
      const o = r.observedNum;
      if ((p != null && !isFiniteFigure(p)) || (o != null && !isFiniteFigure(o))) {
        notFinite += 1;
        continue;
      }
      if (p == null || o == null || (o !== 0 && o !== 1)) {
        nonBinary += 1;
        continue;
      }
      pairs.push({ p, o });
    }
    if (notFinite > 0) refusals.push(notFiniteRows(notFinite, environment));
    if (nonBinary > 0) {
      refusals.push({
        code: PLATFORM_FORECAST_CODES.OUTCOME_NOT_BINARY,
        sentence:
          `${nonBinary} probability forecast${nonBinary === 1 ? '' : 's'} resolved to something other than `
          + '0 or 1 and were excluded from the score. A probability is a claim about an event that either '
          + 'happened or did not; rounding the outcome would invent the event.',
        rule: RULE_NO_LAUNDERING,
        n: nonBinary,
        environment,
      });
    }
    if (pairs.length < MIN_RESOLVED_FOR_CALIBRATION) {
      refusals.push(belowFloor(pairs.length, environment));
      return { figure: null, refusals };
    }
    const base = mean(pairs.map((x) => x.o));
    const brier = mean(pairs.map((x) => (x.p - x.o) ** 2));
    const referenceBrier = mean(pairs.map((x) => (base - x.o) ** 2));
    const successes = pairs.filter((x) => x.o === 1).length;
    if (![base, brier, referenceBrier].every(isFiniteFigure)) {
      refusals.push(figureNotFinite('brier', environment));
      return { figure: null, refusals };
    }
    return {
      figure: {
        kind: 'brier',
        brier: round4(brier),
        referenceBrier: round4(referenceBrier),
        // Null rather than Infinity/1 when every outcome was identical: with no
        // variance in the outcome there is no reference to have beaten, and a
        // "skill" of 1 off a constant outcome is the most flattering possible lie.
        skill: referenceBrier === 0 ? null : round4(1 - brier / referenceBrier),
        meanPredicted: round4(mean(pairs.map((x) => x.p))),
        baseRatePct: Math.round(base * 100),
        baseRateInterval95Pct: wilson95Pct(successes, pairs.length),
      },
      refusals,
    };
  }

  if (kind === 'category') {
    const usable = rows.filter((r) => r.predictedLabel != null && r.observedLabel != null);
    if (usable.length < rows.length) {
      refusals.push(notScorableRows(rows.length - usable.length, 'a label on both sides', environment));
    }
    if (usable.length < MIN_RESOLVED_FOR_CALIBRATION) {
      refusals.push(belowFloor(usable.length, environment));
      return { figure: null, refusals };
    }
    const agreed = usable.filter((r) => r.predictedLabel === r.observedLabel).length;
    return {
      figure: {
        kind: 'agreement',
        agreed,
        disagreed: usable.length - agreed,
        agreementPct: Math.round((agreed / usable.length) * 100),
        interval95Pct: wilson95Pct(agreed, usable.length),
      },
      refusals,
    };
  }

  // ordinal | scalar
  const errs: number[] = [];
  let notFinite = 0;
  let notScorable = 0;
  for (const r of rows) {
    const p = r.predictedNum;
    const o = r.observedNum;
    if (p == null || o == null) {
      // A resolved row whose outcome arrived as a LABEL for a numeric prediction. It
      // used to be filtered out in silence, so above the floor a shrinking n had
      // nothing to explain it.
      notScorable += 1;
      continue;
    }
    if (!isFiniteFigure(p) || !isFiniteFigure(o)) {
      notFinite += 1;
      continue;
    }
    errs.push(Math.abs(p - o));
  }
  if (notScorable > 0) refusals.push(notScorableRows(notScorable, 'a number on both sides', environment));
  if (notFinite > 0) refusals.push(notFiniteRows(notFinite, environment));
  if (errs.length < MIN_RESOLVED_FOR_CALIBRATION) {
    refusals.push(belowFloor(errs.length, environment));
    return { figure: null, refusals };
  }
  const meanErr = mean(errs);
  const medianErr = median(errs);
  // Every input is finite by construction above, and a sum of finite doubles can still
  // reach Infinity. `round4(Infinity)` serialises as null, which is why this is checked
  // rather than assumed: a null figure key with no refusal beside it is exactly the
  // shape the doctrine forbids.
  if (!isFiniteFigure(meanErr) || !isFiniteFigure(medianErr)) {
    refusals.push(figureNotFinite('absolute_error', environment));
    return { figure: null, refusals };
  }
  return {
    figure: {
      kind: 'absolute_error',
      meanAbsoluteError: round4(meanErr),
      medianAbsoluteError: round4(medianErr),
      unit: 'points_of_the_predicted_metric',
    },
    refusals,
  };
}

/** Rows the ledger accepted before 0074's finite bounds existed, or from another writer. */
function notFiniteRows(n: number, environment: string | null): ForecastRefusal {
  return {
    code: PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE,
    sentence:
      `${n} resolved forecast${n === 1 ? '' : 's'} in this group carr${n === 1 ? 'ies' : 'y'} a value that is `
      + 'not a finite number (NaN, ±Infinity, or past 1e308) and w'
      + `${n === 1 ? 'as' : 'ere'} excluded from the figure. Postgres accepts these in a numeric column; `
      + 'JSON turns them back into null, which would have put an empty figure key on screen with nothing '
      + 'saying why.',
    rule: RULE_ABSENT_REFUSES,
    n,
    environment,
  };
}

/** Resolved, but with nothing on the side the arithmetic needs. */
function notScorableRows(n: number, needs: string, environment: string | null): ForecastRefusal {
  return {
    code: PLATFORM_FORECAST_CODES.VALUE_NOT_SCORABLE,
    sentence:
      `${n} resolved forecast${n === 1 ? '' : 's'} in this group ${n === 1 ? 'does' : 'do'} not carry ${needs}, `
      + `so ${n === 1 ? 'it was' : 'they were'} excluded from the figure. The exclusion is named because an n `
      + 'that quietly got smaller is how a figure moves for a reason nobody can see.',
    rule: RULE_ABSENT_REFUSES,
    n,
    environment,
  };
}

/** The arithmetic ran and did not produce a number. Refused, never serialised as null. */
function figureNotFinite(which: string, environment: string | null): ForecastRefusal {
  return {
    code: PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE,
    sentence:
      `The ${which} figure for this group did not evaluate to a finite number, so no figure is expressed. `
      + 'This is a refusal and not an empty field: JSON would have rendered the result as null, which is '
      + 'indistinguishable from a value deliberately withheld.',
    rule: RULE_ABSENT_REFUSES,
    n: null,
    environment,
  };
}

function belowFloor(n: number, environment: string | null): ForecastRefusal {
  return {
    code: n === 0 ? PLATFORM_FORECAST_CODES.NONE_RESOLVED : PLATFORM_FORECAST_CODES.N_BELOW_FLOOR,
    sentence:
      n === 0
        ? 'No forecast in this group has been resolved, so there is no accuracy to express. This is not 0% and it is not 100%.'
        : `${n} resolved forecast${n === 1 ? '' : 's'} is below the stated minimum of `
          + `${MIN_RESOLVED_FOR_CALIBRATION}; the count is the finding and no accuracy figure is expressed.`,
    rule: RULE_ABSENT_REFUSES,
    n,
    environment,
  };
}

function frameFor(
  rows: readonly ResolvedForecast[],
  c: CensusRow | null,
  environment: string | null,
  ledgerPresent: boolean,
): ForecastObservationFrame {
  const instants = rows.map((r) => r.predictedAt).sort();
  const horizons = rows.map((r) => r.horizonDays);
  return {
    environment,
    observed: 'resolved_platform_forecasts',
    asOf: new Date().toISOString(),
    windowFrom: instants[0] ?? null,
    windowTo: instants[instants.length - 1] ?? null,
    windowBasis: !ledgerPresent
      ? 'ledger_absent'
      : rows.length === 0
        ? 'nothing_resolved'
        : 'observed_from_resolved_forecasts',
    horizonDaysObserved: horizons.length
      ? { min: Math.min(...horizons), max: Math.max(...horizons) }
      : null,
    resolved: rows.length,
    unresolvable: Number(c?.unresolvable ?? 0),
    pending: Number(c?.pending ?? 0),
    overdue: Number(c?.overdue ?? 0),
    superseded: Number(c?.superseded ?? 0),
    floor: MIN_RESOLVED_FOR_CALIBRATION,
  };
}

/**
 * The calibration surface, grouped by (engine, version, metric).
 *
 * GROUPED BY VERSION AND NOT POOLED ACROSS IT. Pooling two versions of a scorer
 * reviews a model that never existed, and it is the fastest way to make a
 * regression invisible: the old version's good calls carry the new version's bad
 * ones. It also means the floor bites HARDER — a version bump resets every n to
 * zero — and that is correct rather than inconvenient.
 */
export async function computePlatformForecastCalibration(
  pool: pg.Pool,
  opts?: { readonly databaseUrl?: string | null },
): Promise<PlatformForecastCalibration> {
  const environment = environmentFor(opts);
  const present = await platformForecastLedgerPresent(pool);
  const refusals: ForecastRefusal[] = [];
  if (environment === null) refusals.push(environmentUnnamed());

  if (!present) {
    refusals.push(ledgerAbsent(environment));
    return {
      groups: [],
      refusals,
      frame: frameFor([], null, environment, false),
      ledgerPresent: false,
      migration: PLATFORM_FORECAST_MIGRATION,
    };
  }

  const c = await census(pool);
  const rows = await listResolvedForecasts(pool);
  const frame = frameFor(rows, c.total, environment, true);

  if (Number(c.total.recorded ?? 0) === 0) {
    refusals.push({
      code: PLATFORM_FORECAST_CODES.NONE_RECORDED,
      sentence:
        'The forecast ledger exists and no engine has ever written to it, so nothing on this platform has '
        + 'made a recorded prediction. Until one does, no accuracy claim about it can be true or false.',
      rule: RULE_ABSENT_REFUSES,
      n: 0,
      environment,
    });
  }

  // An unnamed environment suppresses every figure — the same rule `marks/mark.ts`
  // applies to a price. The counts still travel, because a count is not a figure
  // about the world, it is a fact about our own records.
  const suppressAll = environment === null;

  const byGroup = new Map<string, ResolvedForecast[]>();
  for (const r of rows) {
    const key = groupKey(r.engine, r.engineVersion, r.metricKey, r.kind);
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(r);
    else byGroup.set(key, [r]);
  }

  const groups: PlatformForecastGroup[] = [...byGroup.entries()]
    .map(([key, rs]) => {
      const [engine, engineVersion, metricKey, kind] =
        key.split(GROUP_KEY_SEP) as [string, string, string, PredictionKind];
      /*
       * THE GROUP IS SCORED EVEN WHEN THE FIGURE IS SUPPRESSED, and only the figure is
       * dropped. Replacing the whole call with `{ figure: null, refusals:
       * [environmentUnnamed()] }` — which is what this did — DELETED the group's other
       * refusals: a group that was also below the floor, or had nothing resolved, or had
       * non-binary outcomes excluded, lost every one of those and reported the
       * environment as its only problem. The house rule is to return EVERY refusal, not
       * the first one found, and an unnamed environment is not a licence to stop looking.
       */
      const scored = scoreResolved(rs, kind, environment);
      return {
        engine,
        engineVersion,
        metricKey,
        kind,
        figure: suppressAll ? null : scored.figure,
        refusals: suppressAll ? [environmentUnnamed(), ...scored.refusals] : scored.refusals,
        // THIS GROUP'S counts, not the whole ledger's. See `census`.
        frame: frameFor(rs, c.byGroup.get(key) ?? null, environment, true),
      };
    })
    .sort((a, b) =>
      a.engine.localeCompare(b.engine)
      || a.engineVersion.localeCompare(b.engineVersion)
      || a.metricKey.localeCompare(b.metricKey));

  return { groups, refusals, frame, ledgerPresent: true, migration: PLATFORM_FORECAST_MIGRATION };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE GPS ADAPTER — the second call site, onto the same shape                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface ForecastPair {
  readonly prediction: ForecastPredictionInput;
  readonly outcome: Omit<ForecastOutcomeInput, 'forecastId'>;
}

/**
 * What the mapping produced, AND what it deliberately did not.
 *
 * `omitted` EXISTS BECAUSE A DROPPED FORECAST IS ABSENT DATA and absent data refuses.
 * A caller looping over an array of pairs cannot tell "GPS has no such prediction" from
 * "this version of the adapter forgot", and the difference is the entire question the
 * ledger was built to answer.
 */
export interface GpsForecastMapping {
  readonly pairs: readonly ForecastPair[];
  readonly omitted: readonly {
    readonly metricKey: string;
    /** Why nothing was recorded. One sentence, to the operator. */
    readonly reason: string;
  }[];
}

/**
 * A decided GPS engagement, as forecast rows.
 *
 * WHY AN ADAPTER AND NOT A SECOND TABLE. `OutcomeRecord`
 * (`packages/shared/src/gps/calibration.ts:158`) already holds a prediction and an
 * outcome in one value: `factorScoresAtQuote` is what the underwriter believed at
 * quote time and `disposition` is what happened. What it cannot hold is WHEN the
 * quote was made — it carries `decidedAt` only — so `weightReviewPacket` can compare
 * the arms but nothing can say a factor was predictive AS OF a date, and a re-derived
 * factor score under a newer definition is indistinguishable from the original.
 * Mapping onto `platform_forecast` fixes both, without GPS growing a ledger of its
 * own.
 *
 * `quotedAt` IS A REQUIRED ARGUMENT AND NOT DEFAULTED TO `decidedAt`. Dating the
 * quote to the decision would make every horizon zero and every forecast trivially
 * "resolved at the instant it was made", which is the contamination this whole
 * module exists to stop — so the caller has to know the real instant. GPS does not
 * store it today; see the note in this lane's handover.
 */
export function gpsOutcomeToForecast(
  record: OutcomeRecord,
  args: {
    readonly engineVersion: string;
    readonly quotedAt: Date;
    readonly decidedAt: Date;
    readonly horizonDays: number;
  },
): GpsForecastMapping {
  const pairs: ForecastPair[] = [];
  const base = {
    engine: 'gps.underwrite',
    engineVersion: args.engineVersion,
    subjectType: 'gps_engagement',
    subjectId: record.engagementId,
    predictedAt: args.quotedAt,
    horizonDays: args.horizonDays,
  } as const;

  /*
   * NO WIN FORECAST IS RECORDED, AND THAT IS THE FINDING RATHER THAN A GAP.
   *
   * THE FIRST CUT OF THIS SHIPPED A LIE. It recorded `engagement_won` as a CATEGORY
   * prediction with `predictedLabel: 'quoted'` and resolved it with `observedLabel =
   * disposition` ('won' | 'lost'). 'quoted' is not a disposition and can never equal
   * one, so the agreement branch scored 0 for every row FOREVER — and above the floor of
   * 8 the platform would have expressed a real-looking figure asserting the underwriting
   * engine was wrong 100% of the time. The comment above it described different code
   * ("recorded as an ordinal 1, never as a fabricated 0.65"), so nothing on the page
   * said what the rows actually were.
   *
   * The two ways out are both worse than refusing. Recording `predictedLabel: 'won'`
   * asserts the desk predicted a win on every engagement it quoted, which no desk does
   * and nothing in GPS says. Recording an ordinal 1, or a probability, invents a number
   * (`OutcomeRecord` carries `factorScoresAtQuote`, `offerKey` and a quoted price —
   * nothing in `packages/shared/src/gps` turns any of those into a win probability). So
   * the win side is OMITTED and says so: an inference is never laundered into a
   * certainty. When GPS grows a real win-probability model, its caller passes the
   * probability and this omission disappears on its own.
   */
  const omitted = [
    {
      metricKey: 'engagement_won',
      reason:
        'No win forecast is recorded for this engagement: nothing in GPS produces a win probability at quote '
        + 'time, and neither the quoted price nor the factor scores is one. A prediction invented here would '
        + 'be scored against the real disposition and read as the underwriting engine\'s accuracy.',
    },
  ];

  // The quoted price against the realised one. `realisedPriceCents` is nullable and
  // a null is UNRESOLVABLE, not a zero: `gps/loop.ts:122` records that defaulting it
  // to the quoted price is what destroyed every slippage figure once already.
  pairs.push({
    prediction: {
      ...base,
      metricKey: 'price_cents',
      kind: 'scalar',
      predictedNum: record.quotedPriceCents,
      inputsFrame: { offerKey: record.offerKey, partner: record.partner },
    },
    outcome:
      record.realisedPriceCents == null
        ? {
            kind: 'unresolvable',
            observedAt: args.decidedAt,
            source: 'gps_outcome',
            note:
              'No realised price is on file for this engagement — lost, or won and not yet invoiced. '
              + 'Recorded as unresolvable so it stays out of both the accuracy figure and the pending count.',
            provenance: 'observed',
          }
        : {
            kind: 'resolved',
            observedNum: record.realisedPriceCents,
            observedAt: args.decidedAt,
            source: 'gps_outcome',
            provenance: 'observed',
          },
  });

  return { pairs, omitted };
}
