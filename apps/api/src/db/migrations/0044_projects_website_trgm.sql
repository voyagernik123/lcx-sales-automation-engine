-- ──────────────────────────────────────────────
--  0044 — make the BD list's search predicate sargable
--
--  GET /v1/projects?search=x filters with
--    (name ILIKE '%x%' OR ticker ILIKE '%x%' OR website ILIKE '%x%')
--  0035 gave name and ticker trigram indexes, but website never got one — and a
--  bitmap OR needs EVERY branch indexed or it degrades to a full scan. So one
--  un-indexed branch made the whole search a seq scan of all 54k projects.
--
--  Measured on a 54,373-row copy (catalog-wide search, term 'chain'):
--    without this index  183 ms  (Seq Scan + Parallel Seq Scan, 53,560 rows discarded)
--    with this index      10 ms  (BitmapOr across all three trigram indexes)
--
--  Idempotent, and additive only — no plan regression is possible for queries
--  that don't touch website.
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_projects_website_trgm ON projects USING gin (website gin_trgm_ops);
