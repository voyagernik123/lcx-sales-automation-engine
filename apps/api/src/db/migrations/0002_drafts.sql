CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  touch_index INTEGER NOT NULL DEFAULT 1,
  claims_used JSONB NOT NULL DEFAULT '[]',
  requires_human_review BOOLEAN NOT NULL DEFAULT false,
  operator_edited BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_sent ON drafts(sent);
