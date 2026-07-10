-- 0018 — the auto-task dedup index (0016) allows only ONE open non-manual task
--         per deal, which is right for auto_stage/auto_stalled but wrong for
--         the multi-step launchpad checklist. Exclude 'launchpad' — it dedups
--         itself by title.

DROP INDEX IF EXISTS idx_tasks_auto_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_auto_dedup ON tasks (kind, deal_id)
  WHERE status = 'open' AND kind NOT IN ('manual', 'launchpad') AND deal_id IS NOT NULL;
