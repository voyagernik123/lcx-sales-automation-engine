-- 0010 — assisted-channel outreach tasks (LinkedIn / Telegram touches are
--         materialized here by the scheduler and executed by a human via the
--         Send Queue UI; they are never auto-sent).

CREATE TABLE IF NOT EXISTS outreach_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  step_index INTEGER NOT NULL,
  touch_index INTEGER NOT NULL,
  channel TEXT NOT NULL,                  -- linkedin | telegram
  action TEXT NOT NULL,                   -- connection_request | message | telegram_dm
  subject TEXT,
  body TEXT NOT NULL,
  edited_body TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | skipped
  due_at TIMESTAMPTZ NOT NULL,
  snoozed_until TIMESTAMPTZ,
  sent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_seq_step ON outreach_tasks (sequence_id, step_index);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON outreach_tasks (status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON outreach_tasks (project_id);
