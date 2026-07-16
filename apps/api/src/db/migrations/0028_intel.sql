-- 0028 — deal playbook progress + daily forecast snapshots. Idempotent.
--
-- Both columns are optional intelligence extensions: every consumer guards
-- undefined-column (42703) and degrades gracefully, so production can lag
-- behind this migration safely.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS playbook JSONB;
ALTER TABLE kpi_daily_snapshots ADD COLUMN IF NOT EXISTS forecast JSONB;
