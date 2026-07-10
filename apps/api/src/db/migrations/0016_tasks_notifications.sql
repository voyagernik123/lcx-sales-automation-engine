-- 0016 — operator tasks (manual + auto-generated) and in-app notifications.

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  handoff_id UUID REFERENCES handoffs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  kind TEXT NOT NULL DEFAULT 'manual', -- manual | auto_stage | auto_handoff | auto_stalled
  status TEXT NOT NULL DEFAULT 'open', -- open | done | dismissed
  due_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks (status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project2 ON tasks (project_id);
-- one open auto-task per (kind, deal) — rules re-run daily and must not spam
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_auto_dedup ON tasks (kind, deal_id) WHERE status = 'open' AND kind != 'manual' AND deal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_auto_handoff_dedup ON tasks (kind, handoff_id) WHERE status = 'open' AND kind != 'manual' AND handoff_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,             -- deal_stalled | competitor_listing | discovery_found | reply_received
  title TEXT NOT NULL,
  detail TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  href TEXT,                      -- SPA route to open
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications (read_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup ON notifications (dedup_key) WHERE dedup_key IS NOT NULL;
