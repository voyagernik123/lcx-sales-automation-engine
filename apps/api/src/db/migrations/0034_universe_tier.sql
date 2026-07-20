-- ──────────────────────────────────────────────
--  0034 — two-tier universe (catalog + tracked)
--  Scale the token universe to 50k+ without blowing the storage budget.
--
--  Every free-source token identity lands as a lean `catalog` row (name/ticker/
--  chain/contract only — no scores, no observations). Only `tracked` rows run
--  the expensive intel pipeline (enrichment → scores → observations → Targets),
--  so growing the count 6.5× adds only identity rows (~1KB each) instead of the
--  ~18KB/row (scores + ~16 observations) that a scored project costs.
--
--  Heavy jobs (score_refresh, backfill_observations, collect, enrich) filter to
--  tier='tracked'. Catalog rows are searchable/countable/promotable; a user (or
--  the top-mcap promotion pass) moves one into 'tracked' to start deep tracking.
--
--  Backfill: every project that already has a score is, by definition, tracked.
--  Idempotent — re-running only re-affirms tracked rows, never demotes.
-- ──────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'catalog';

-- Existing universe is fully enriched + scored → promote it all to tracked.
UPDATE projects SET tier = 'tracked'
WHERE tier <> 'tracked'
  AND (id IN (SELECT project_id FROM scores) OR last_enriched_at IS NOT NULL);

-- The hot filter for every heavy job's WHERE tier='tracked' scan, and for the
-- catalog/tracked split the read paths use.
CREATE INDEX IF NOT EXISTS idx_projects_tier ON projects (tier);

-- Tracked rows are ordered/enriched by market cap; this partial index keeps the
-- promotion pass ("top catalog rows by mcap → tracked") and tracked scans cheap.
CREATE INDEX IF NOT EXISTS idx_projects_tier_mcap
  ON projects (tier, market_cap_usd DESC NULLS LAST);
