-- 0013 — listing propensity: ground-truth labels from LCX's own deals +
--         propensity/priority columns on scores.

CREATE TABLE IF NOT EXISTS listing_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  record_name TEXT NOT NULL,
  ticker TEXT,
  source TEXT NOT NULL,            -- closed | pipeline | deals
  outcome TEXT NOT NULL,           -- won | lost | stalled | active
  listing_fee_usd NUMERIC,
  marketing_fee_usd NUMERIC,
  liquidity_amount_usd NUMERIC,
  stage TEXT,
  stage_trail JSONB,
  stage_changed_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_labels_project ON listing_labels (project_id);
CREATE INDEX IF NOT EXISTS idx_labels_outcome ON listing_labels (outcome);
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_source_record ON listing_labels (source, record_name);

ALTER TABLE scores ADD COLUMN IF NOT EXISTS propensity_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS propensity_reasons JSONB NOT NULL DEFAULT '[]';
ALTER TABLE scores ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS model_version TEXT;
CREATE INDEX IF NOT EXISTS idx_scores_priority ON scores (priority_score DESC);

-- KPI snapshots become upsertable by date
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshot_date ON kpi_daily_snapshots (snapshot_date);
