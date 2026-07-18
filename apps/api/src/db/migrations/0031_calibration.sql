-- 0031 — the learning loop (Wave 6). Idempotent, forward-only.
--
-- model_calibrations: periodic snapshots of how well each score/signal actually
-- discriminated won deals from the universe. Storing snapshots is what lets the
-- platform show it is sharpening over time (signal decay / improvement).

CREATE TABLE IF NOT EXISTS model_calibrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES orgs(id) ON DELETE CASCADE,
  snapshot_date    TEXT NOT NULL DEFAULT (CURRENT_DATE::text),
  metric_key       TEXT NOT NULL,               -- conviction | winnability | tvl_usd | ...
  kind             TEXT NOT NULL DEFAULT 'score', -- score | signal
  lift             NUMERIC,                      -- won median ÷ universe median
  quintile_capture NUMERIC,                      -- share of won deals in the top-20% by this metric
  won_median       NUMERIC,
  universe_median  NUMERIC,
  sample_won       INTEGER NOT NULL DEFAULT 0,
  sample_universe  INTEGER NOT NULL DEFAULT 0,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calib_metric_date ON model_calibrations (metric_key, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_calib_date ON model_calibrations (snapshot_date);
