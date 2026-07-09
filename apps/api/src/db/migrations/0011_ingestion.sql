-- 0011 — staging-first ingestion: project_sources becomes the staging table
--         (unique per source+external_id, hash-gated change detection),
--         plus job_runs for connector/job tracking.

ALTER TABLE project_sources ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE project_sources ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE project_sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'; -- new | mapped | ignored
ALTER TABLE project_sources ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE project_sources ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE project_sources ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ DEFAULT NOW();

-- external_id must be present and unique per source for staging upserts
UPDATE project_sources SET external_id = id::text WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_src_source_external ON project_sources (source, external_id);
CREATE INDEX IF NOT EXISTS idx_src_status ON project_sources (status);
CREATE INDEX IF NOT EXISTS idx_src_last_changed ON project_sources (last_changed_at);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running | ok | failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  cursor JSONB
);
CREATE INDEX IF NOT EXISTS idx_job_runs_name ON job_runs (job_name, started_at DESC);
