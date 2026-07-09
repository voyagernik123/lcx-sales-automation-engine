-- Handoffs — human takeover when a reply is detected
CREATE TABLE IF NOT EXISTS handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  trigger_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  trigger_reason TEXT NOT NULL DEFAULT 'reply',
  status TEXT NOT NULL DEFAULT 'open',
  -- open | in_progress | resolved_won_path | resolved_lost | re_nurture
  assigned_to TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_project ON handoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_assigned ON handoffs(assigned_to);

-- Handoff events — timeline of actions on a handoff
CREATE TABLE IF NOT EXISTS handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id UUID NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- created | assigned | note | status_change | re_enrolled
  actor TEXT NOT NULL DEFAULT 'system',
  content TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_he_handoff ON handoff_events(handoff_id);
CREATE INDEX IF NOT EXISTS idx_he_type ON handoff_events(event_type);

-- Add handoff_status to outreach_sequences for quick filtering
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS handoff_id UUID REFERENCES handoffs(id) ON DELETE SET NULL;

-- Suppression tracking for handoff
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS handoff_id UUID REFERENCES handoffs(id) ON DELETE SET NULL;
