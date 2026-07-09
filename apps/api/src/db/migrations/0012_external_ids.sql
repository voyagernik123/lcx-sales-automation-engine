-- 0012 — provider id map: match a project to coingecko/coinpaprika/defillama
--         once, then every refresh is a bulk join instead of re-matching.

CREATE TABLE IF NOT EXISTS project_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,        -- coingecko | coinpaprika | defillama | geckoterminal
  external_id TEXT NOT NULL,
  matched_by TEXT NOT NULL,      -- ticker_exact | ticker_fuzzy | name_exact | staged | manual
  confidence TEXT NOT NULL DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id),
  UNIQUE (provider, project_id)
);

CREATE INDEX IF NOT EXISTS idx_extids_project ON project_external_ids (project_id);
