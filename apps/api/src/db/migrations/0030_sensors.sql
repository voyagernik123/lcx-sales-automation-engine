-- 0030 — the collection apparatus (Wave 1). Idempotent, forward-only.
--
--   project_identifiers — resolved external handles (coinpaprika id, defillama
--                         slug, gecko id, github repo, socials) that let the
--                         free connectors target a project.
--   collection_state    — per (object, source) freshness + gap ledger: what we
--                         collected, when, whether it errored, and when it's due
--                         again. This is what lets collection task itself.

-- ── project_identifiers (entity resolution v2) ──────────────────────
CREATE TABLE IF NOT EXISTS project_identifiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- coinpaprika_id | defillama_slug | gecko_id | cmc_id | github_repo | twitter | reddit
  value      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'internal',
  confidence INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_pid_project ON project_identifiers (project_id);
CREATE INDEX IF NOT EXISTS idx_pid_kind_value ON project_identifiers (kind, value);

-- ── collection_state (freshness + intelligence-gap ledger) ──────────
CREATE TABLE IF NOT EXISTS collection_state (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  source       TEXT NOT NULL,             -- connector id: defillama | coinpaprika_detail | github
  status       TEXT NOT NULL DEFAULT 'pending', -- ok | error | pending | skipped
  last_ok_at   TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error   TEXT,
  runs         INTEGER NOT NULL DEFAULT 0,
  next_due_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_type, subject_id, source)
);
CREATE INDEX IF NOT EXISTS idx_cstate_source_due ON collection_state (source, next_due_at);
CREATE INDEX IF NOT EXISTS idx_cstate_subject ON collection_state (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_cstate_status ON collection_state (status);
