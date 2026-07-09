-- 0009 — typed market columns, dedupe/blocking keys, denormalized contact counts,
--         scale indexes (trigram search, sort/filter), unique scores row per project.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS market_cap_usd NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS market_cap_rank INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS volume_24h_usd NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS price_usd NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS price_change_30d NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS token_age_days INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ticker_norm TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS people_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS verified_contact_count INTEGER NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_region ON projects (region);
CREATE INDEX IF NOT EXISTS idx_projects_mcap_rank ON projects (market_cap_rank) WHERE market_cap_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_last_enriched ON projects (last_enriched_at);
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_ticker_trgm ON projects USING gin (ticker gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_name_key ON projects (name_key);
CREATE INDEX IF NOT EXISTS idx_projects_domain ON projects (domain);
CREATE INDEX IF NOT EXISTS idx_projects_ticker_norm ON projects (ticker_norm);
CREATE INDEX IF NOT EXISTS idx_projects_people_count ON projects (people_count);
CREATE INDEX IF NOT EXISTS idx_scores_computed_at ON scores (computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_observed_at ON signals (observed_at);

-- Denormalized people counts, maintained by trigger
CREATE OR REPLACE FUNCTION sync_project_people_counts() RETURNS trigger AS $$
DECLARE
  pid uuid;
  pids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.project_id IS NOT NULL THEN
    pids := array_append(pids, NEW.project_id);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.project_id IS NOT NULL THEN
    pids := array_append(pids, OLD.project_id);
  END IF;
  FOREACH pid IN ARRAY pids LOOP
    UPDATE projects SET
      people_count = (SELECT COUNT(*) FROM people pl WHERE pl.project_id = pid),
      verified_contact_count = (
        SELECT COUNT(*) FROM people pl
        WHERE pl.project_id = pid
          AND (pl.email IS NOT NULL AND pl.email_status != 'invalid' OR pl.linkedin IS NOT NULL)
      )
    WHERE id = pid;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_people_counts ON people;
CREATE TRIGGER trg_people_counts
  AFTER INSERT OR UPDATE OR DELETE ON people
  FOR EACH ROW EXECUTE FUNCTION sync_project_people_counts();

-- One-time backfill of the counters
UPDATE projects p SET
  people_count = sub.pc,
  verified_contact_count = sub.vc
FROM (
  SELECT
    pr.id,
    COALESCE(cnt.pc, 0) AS pc,
    COALESCE(cnt.vc, 0) AS vc
  FROM projects pr
  LEFT JOIN (
    SELECT
      project_id,
      COUNT(*) AS pc,
      COUNT(*) FILTER (
        WHERE email IS NOT NULL AND email_status != 'invalid' OR linkedin IS NOT NULL
      ) AS vc
    FROM people
    WHERE project_id IS NOT NULL
    GROUP BY project_id
  ) cnt ON cnt.project_id = pr.id
) sub
WHERE p.id = sub.id
  AND (p.people_count != sub.pc OR p.verified_contact_count != sub.vc);

-- One scores row per project: keep the newest, then enforce uniqueness
DELETE FROM scores s USING scores s2
WHERE s.project_id = s2.project_id AND s.computed_at < s2.computed_at;
DELETE FROM scores s USING scores s2
WHERE s.project_id = s2.project_id AND s.computed_at = s2.computed_at AND s.id < s2.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_project_unique ON scores (project_id);
DROP INDEX IF EXISTS idx_scores_project;
