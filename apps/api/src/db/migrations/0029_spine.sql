-- 0029 — the intelligence spine (Wave 0). Idempotent, forward-only.
--
-- Four foundations that everything downstream hangs on:
--   orgs           — tenancy seam (default LCX org has a fixed id used as a constant)
--   observations   — provenance: every fact carries source, reliability, confidence, freshness
--   object_actions — governed action ledger (in addition to the hash-chained audit_log)
--   watchlist      — the first real Action target (a per-org pin on any object)
--
-- Existing tables are NOT org-scoped yet; back-fill is incremental in later waves.

-- ── orgs (tenancy seam) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO orgs (id, slug, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'lcx', 'LCX')
ON CONFLICT (id) DO NOTHING;

-- ── observations (the provenance spine) ─────────────────────────────
CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES orgs(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,            -- ontology object type: project | token | person | ...
  subject_id   TEXT NOT NULL,            -- the object's id (polymorphic)
  predicate    TEXT NOT NULL,            -- e.g. market_cap_usd | github_commits_30d | unlock_next_at
  value_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  value_num    NUMERIC,                  -- populated for numeric predicates (sort/range)
  unit         TEXT,
  source       TEXT NOT NULL,            -- canonical source id (see @lcx/shared SOURCES)
  source_url   TEXT,
  reliability  CHAR(1) NOT NULL DEFAULT 'C',   -- Admiralty A..F
  credibility  INTEGER NOT NULL DEFAULT 3,     -- Admiralty 1..6
  confidence   INTEGER NOT NULL DEFAULT 50,    -- derived 0..100
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when the fact was true
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when we fetched it
  job_run_id   UUID,
  actor        TEXT,                     -- operator id when manually recorded
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obs_subject ON observations (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_obs_pred ON observations (subject_type, subject_id, predicate, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_source ON observations (source);
CREATE INDEX IF NOT EXISTS idx_obs_predicate ON observations (predicate);

-- ── object_actions (governed action ledger) ─────────────────────────
CREATE TABLE IF NOT EXISTS object_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES orgs(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  action       TEXT NOT NULL,
  params       JSONB NOT NULL DEFAULT '{}'::jsonb,
  result       JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor        TEXT NOT NULL DEFAULT 'operator',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oact_subject ON object_actions (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oact_action ON object_actions (action);

-- ── watchlist (first Action target) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES orgs(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  note         TEXT,
  added_by     TEXT NOT NULL DEFAULT 'operator',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_subject ON watchlist (subject_type, subject_id);
