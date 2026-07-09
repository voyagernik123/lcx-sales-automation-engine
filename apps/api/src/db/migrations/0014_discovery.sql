-- 0014 — contact discovery queue: polite website crawls that extract and
--         MX-verify contact emails + social handles.

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed | blocked_robots
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_djobs_project_open ON discovery_jobs (project_id)
  WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_djobs_status ON discovery_jobs (status);
