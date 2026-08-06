-- ──────────────────────────────────────────────
--  0074 — THE FORECAST LEDGER. "Are we any good?" becomes a falsifiable question.
--
--  WHAT WAS FALSE. Across 0000–0073 there is no relation that pairs a prediction
--  with an outcome. `model_calibrations` (0031) stores the RESULT of a calibration
--  and none of its inputs; `observations` (0029) stores values with no notion of a
--  horizon or a resolution; `gps_outcome` (0050) stores what happened with the
--  quoted side joined in from `gps_engagement` and no instant at which anything was
--  predicted. So every accuracy claim this platform could make was unfalsifiable —
--  not wrong, unfalsifiable, which is worse, because nothing could ever contradict
--  it.
--
--  WORSE, THE ONE LOOP THAT CLAIMED TO MEASURE PREDICTION MEASURED ITS OWN THUMB.
--  `intel/calibration.ts` read the LATEST observation per subject, and
--  `packages/shared/src/alpha.ts` subtracts 40 from listing propensity and 50 from
--  winnability once `listed_on_lcx` is true (alpha.ts:114-117, :232-235). Every won
--  deal is listed. So the "validated" score already contained a penalty the
--  platform itself applied AFTER the outcome, and the lift computed from it was
--  measuring the adjustment, not the prediction. A forecast row exists so that the
--  value being validated is the value that was on the screen when the call was
--  made, and nothing else.
--
--  WHAT THIS DOES.
--    platform_forecast          — one immutable row per prediction: what, by which
--                                 engine at which version, for which subject, at
--                                 which instant, over what horizon.
--    platform_forecast_outcome  — append-only rows saying what actually happened.
--
--  WHY TWO TABLES AND NOT NULLABLE OUTCOME COLUMNS. A nullable `observed_num` on
--  the prediction row makes resolution an UPDATE, and an UPDATE is exactly how a
--  prediction stops being one: whoever types the outcome is one keystroke from
--  correcting the prediction to match it. That is not a hypothetical — it is the
--  same failure `gps/loop.ts:277-281` documents, where copying the quoted price
--  onto the outcome row at close made every slippage figure quietly zero. Here the
--  prediction table takes a BEFORE UPDATE OR DELETE trigger and cannot be edited at
--  all; a correction is APPENDED as another outcome row and the reader counts the
--  superseded ones out loud.
--
--  WHAT THIS DELIBERATELY DOES NOT DO. It computes nothing. There is no view that
--  returns an accuracy, no generated column holding a hit flag, and no default
--  anywhere that would let an absent outcome read as a correct one. Every figure is
--  computed in `kpi/platformForecast.ts`, which refuses below a stated n.
--
--  ZERO DROP / DELETE / TRUNCATE of existing data. Two new tables, six indexes, two
--  functions, five triggers, and two finite-value constraints added by the DO block at
--  the end (see the note there for why they are not in the table bodies). Idempotent —
--  re-running it on a database that already has the tables adds the constraints and
--  changes nothing else. RLS on both (the API's postgres owner bypasses), matching
--  0042/0071.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_forecast (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',

  -- WHICH ENGINE, AT WHICH VERSION. Both NOT NULL and neither defaulted. A
  -- calibration pooled across two versions of a scorer is a review of a model that
  -- never existed; `gps/calibration.ts:198-205` already learned this about
  -- `factor_scores_at_quote` and this is the same rule with a column behind it.
  engine         text NOT NULL CHECK (length(btrim(engine)) > 0),
  engine_version text NOT NULL CHECK (length(btrim(engine_version)) > 0),

  subject_type   text NOT NULL CHECK (length(btrim(subject_type)) > 0),
  subject_id     text NOT NULL CHECK (length(btrim(subject_id)) > 0),

  -- WHAT WAS PREDICTED. `metric_key` names the quantity ('conviction',
  -- 'deal_won', 'cycle_time_days'); `prediction_kind` says how to read the value,
  -- because a 0.7 probability and a 0.7 on a 0–100 ordinal are not the same claim
  -- and a single numeric column would let them be averaged together.
  metric_key     text NOT NULL CHECK (length(btrim(metric_key)) > 0),
  prediction_kind text NOT NULL CHECK (prediction_kind IN ('probability', 'ordinal', 'scalar', 'category')),
  predicted_num   numeric,
  predicted_label text,

  -- THE INSTANT. Supplied by the caller, not defaulted to now(): a forecast
  -- reconstructed from a job run that happened at 03:00 must carry 03:00, and a
  -- DEFAULT now() would silently date every backfilled row to the backfill.
  predicted_at   timestamptz NOT NULL,

  -- THE HORIZON, in days. Without it "the outcome has not happened yet" and "the
  -- prediction was wrong" are the same row.
  horizon_days   integer NOT NULL CHECK (horizon_days > 0),

  -- What was observable when the call was made: the ObservationFrame, stored as
  -- given. Never read back as a figure; it exists so a reader can see what the
  -- engine could and could not see.
  inputs_frame   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- WHICH DATABASE THIS CAME FROM. NOT NULL, non-empty, and 'unknown' is refused:
  -- `marks/mark.ts:443-451` records a price shipping with environment 'unknown'
  -- because a sentinel string satisfied a `string` type and an emptiness check.
  -- The constraint is here so the same sentinel cannot be stored at all.
  environment    text NOT NULL CHECK (length(btrim(environment)) > 0 AND lower(btrim(environment)) <> 'unknown'),

  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_txid  bigint NOT NULL DEFAULT txid_current(),

  -- The value must match the kind it declares. A probability outside [0,1] is not a
  -- probability, and a category with a number attached invites the number being
  -- averaged.
  CONSTRAINT platform_forecast_value_matches_kind CHECK (
    (prediction_kind = 'probability'
       AND predicted_num IS NOT NULL AND predicted_num >= 0 AND predicted_num <= 1
       AND predicted_label IS NULL)
 OR (prediction_kind IN ('ordinal', 'scalar')
       AND predicted_num IS NOT NULL AND predicted_label IS NULL)
 OR (prediction_kind = 'category'
       AND predicted_label IS NOT NULL AND predicted_num IS NULL)
  )
);

COMMENT ON TABLE platform_forecast IS
  'Immutable predictions (0074). One row per (engine, engine_version, subject, '
  'metric, instant). Outcomes live in platform_forecast_outcome and are APPENDED; '
  'this table cannot be updated or deleted. Read by kpi/platformForecast.ts.';

-- Idempotency for a job that re-runs over the same pass. Same engine, same version,
-- same subject, same metric, same instant is the SAME prediction — inserting it
-- twice would double the corpus an n-floor is measured against, which is the one
-- number that must not be inflatable. Guarded here rather than by convention
-- because `intel/alpha.ts:30` shows how a re-run is normally made idempotent in
-- this repo (a DELETE), and a DELETE is not available on this table by design.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pforecast_identity
  ON platform_forecast (engine, engine_version, subject_type, subject_id, metric_key, predicted_at);

CREATE INDEX IF NOT EXISTS idx_pforecast_subject
  ON platform_forecast (subject_type, subject_id, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pforecast_engine
  ON platform_forecast (engine, engine_version, metric_key, predicted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pforecast_seq ON platform_forecast (seq);

-- ══════════════════════════════════════════════════════════════════════════════
--  THE OUTCOMES. Append-only, and deliberately WITHOUT a unique key on
--  forecast_id: a correction is a new row, and the reader reports how many earlier
--  rows it superseded rather than losing them.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_forecast_outcome (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id    uuid NOT NULL REFERENCES platform_forecast(id),

  -- 'unresolvable' IS A FIRST-CLASS OUTCOME, not a missing row. A subject that was
  -- deleted, a horizon that passed with no observable result, a deal cancelled
  -- rather than won or lost: recording it as unresolvable keeps it OUT of the
  -- accuracy numerator AND out of the pending count, so neither reads as a silent
  -- exclusion. `gps/calibration.ts:120` makes the same distinction for 'cancelled'.
  outcome_kind   text NOT NULL CHECK (outcome_kind IN ('resolved', 'unresolvable')),
  observed_num   numeric,
  observed_label text,

  -- When the outcome HAPPENED. Compared against the prediction's instant by the
  -- trigger below.
  observed_at    timestamptz NOT NULL,
  source         text NOT NULL CHECK (length(btrim(source)) > 0),
  note           text,
  provenance     text NOT NULL CHECK (provenance IN ('observed', 'reconstructed')),

  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_txid  bigint NOT NULL DEFAULT txid_current(),

  CONSTRAINT platform_forecast_outcome_value_matches_kind CHECK (
    (outcome_kind = 'resolved' AND (observed_num IS NOT NULL OR observed_label IS NOT NULL))
 OR (outcome_kind = 'unresolvable' AND observed_num IS NULL AND observed_label IS NULL AND note IS NOT NULL)
  )
);

COMMENT ON TABLE platform_forecast_outcome IS
  'Append-only outcomes for platform_forecast (0074). A correction is a NEW row; '
  'the latest by seq wins and the superseded count is reported, never dropped.';

CREATE INDEX IF NOT EXISTS idx_pfoutcome_forecast
  ON platform_forecast_outcome (forecast_id, seq DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pfoutcome_seq ON platform_forecast_outcome (seq);

-- ══════════════════════════════════════════════════════════════════════════════
--  THE TRIGGERS.
-- ══════════════════════════════════════════════════════════════════════════════

-- A prediction you can edit is not a prediction. Same doctrine as 0070/0071, and
-- the error code is the one `kpi/platformForecast.ts` matches on.
CREATE OR REPLACE FUNCTION platform_forecast_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'PLATFORM_FORECAST_APPEND_ONLY: %.% is append-only; % is refused',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
  USING ERRCODE = '42501',
        HINT = 'Record what happened by INSERTing into platform_forecast_outcome. '
            || 'An outcome that overwrites the prediction destroys the only thing '
            || 'that made it a forecast.';
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pforecast_append_only ON platform_forecast;
CREATE TRIGGER trg_pforecast_append_only
  BEFORE UPDATE OR DELETE ON platform_forecast
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pforecast_no_truncate ON platform_forecast;
CREATE TRIGGER trg_pforecast_no_truncate
  BEFORE TRUNCATE ON platform_forecast
  FOR EACH STATEMENT EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pfoutcome_append_only ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_append_only
  BEFORE UPDATE OR DELETE ON platform_forecast_outcome
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pfoutcome_no_truncate ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_no_truncate
  BEFORE TRUNCATE ON platform_forecast_outcome
  FOR EACH STATEMENT EXECUTE FUNCTION platform_forecast_forbid_mutation();

-- THE CONTAMINATION GUARD, IN SQL.
--
-- An outcome observed BEFORE the prediction was made is the same defect that made
-- the old calibration loop meaningless, wearing different clothes: it resolves a
-- forecast against information that predates it. A CHECK cannot see the other
-- table, so this is a trigger. It refuses the row rather than clamping the instant,
-- because a clamped instant is a lie that survives in the ledger.
CREATE OR REPLACE FUNCTION platform_forecast_outcome_after_prediction() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  p_at timestamptz;
BEGIN
  SELECT predicted_at INTO p_at FROM platform_forecast WHERE id = NEW.forecast_id;
  IF p_at IS NULL THEN
    -- Unreachable through the FK, kept because a future ON DELETE path would make
    -- it reachable and a NULL comparison below would then pass silently.
    RAISE EXCEPTION 'PLATFORM_FORECAST_SUBJECT_UNKNOWN: no prediction % exists', NEW.forecast_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.observed_at < p_at THEN
    RAISE EXCEPTION
      'PLATFORM_FORECAST_OUTCOME_PRECEDES_PREDICTION: outcome observed at % predates the prediction made at %',
      NEW.observed_at, p_at
      USING ERRCODE = '22007',
            HINT = 'A forecast resolved against information older than itself measures '
                || 'nothing. Record the real instant, or record it as unresolvable.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pfoutcome_after_prediction ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_after_prediction
  BEFORE INSERT ON platform_forecast_outcome
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_outcome_after_prediction();

-- ══════════════════════════════════════════════════════════════════════════════
--  NaN AND ±Infinity ARE VALID `numeric` VALUES IN POSTGRES, AND THEY BECAME A
--  FIGURE THAT WAS PRESENT AND EMPTY.
--
--  The value-matches-kind CHECK above bounds the 'probability' kind only, and it does
--  so by accident of arithmetic: NaN sorts ABOVE every number in Postgres, so
--  `NaN <= 1` is false and the row is refused. For 'ordinal' and 'scalar' the check
--  only requires `predicted_num IS NOT NULL`, and `INSERT … VALUES ('NaN')` was
--  accepted. `kpi/platformForecast.ts` then computed a mean over it and
--  `JSON.stringify(NaN)` is `null` — so `meanAbsoluteError: null` shipped beside a
--  computed `medianAbsoluteError: 2`, with no refusal, indistinguishable from a figure
--  deliberately withheld. That is the one shape the doctrine forbids outright.
--
--  THE BOUND IS ±1e308 AND NOT ±Infinity, deliberately. The reader is JavaScript: a
--  numeric larger than about 1.8e308 becomes `Infinity` the moment `Number()` touches
--  it, so a value the database considers finite can still arrive as one that is not.
--  1e308 is a round number below that edge. NaN fails `<= 1e308` (it sorts above
--  everything) and ±Infinity fail their respective sides, so all three are refused by
--  the same expression.
--
--  ADDED IN A DO BLOCK, not in the CREATE TABLE bodies above, because those are
--  `IF NOT EXISTS`: on a database where 0074 has already run, a constraint added to the
--  table body would never be applied. This form is correct on a fresh database and on
--  one that already has the tables, which is what "idempotent" has to mean here.
-- ══════════════════════════════════════════════════════════════════════════════
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'platform_forecast_predicted_num_finite'
       AND conrelid = 'platform_forecast'::regclass
  ) THEN
    ALTER TABLE platform_forecast
      ADD CONSTRAINT platform_forecast_predicted_num_finite CHECK (
        predicted_num IS NULL
        OR (predicted_num >= -1e308::numeric AND predicted_num <= 1e308::numeric)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'platform_forecast_outcome_observed_num_finite'
       AND conrelid = 'platform_forecast_outcome'::regclass
  ) THEN
    ALTER TABLE platform_forecast_outcome
      ADD CONSTRAINT platform_forecast_outcome_observed_num_finite CHECK (
        observed_num IS NULL
        OR (observed_num >= -1e308::numeric AND observed_num <= 1e308::numeric)
      );
  END IF;
END
$do$;

ALTER TABLE platform_forecast         ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_forecast_outcome ENABLE ROW LEVEL SECURITY;
