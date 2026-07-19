-- ──────────────────────────────────────────────
--  0032 — observations read-path indexes
--  The intel read layer (Targets, inspector Assessment, coverage reports) looks
--  up "latest observation of predicate P for subject S". The existing indexes
--  all lead with subject_type, so a (subject_id, predicate) lookup couldn't use
--  them and fell back to scanning the whole table — listTargets ran ~25s on the
--  ~128k-row prod observations table. These two indexes serve both access
--  patterns directly (per-subject LATERALs and the per-predicate DISTINCT ON).
-- ──────────────────────────────────────────────

-- Per-subject predicate lookups: WHERE subject_id=? AND predicate=? ORDER BY observed_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_obs_subject_pred_time
  ON observations (subject_id, predicate, observed_at DESC);

-- Per-predicate scans + DISTINCT ON (subject_id): WHERE predicate=? ORDER BY subject_id, observed_at DESC
CREATE INDEX IF NOT EXISTS idx_obs_pred_subject_time
  ON observations (predicate, subject_id, observed_at DESC);
