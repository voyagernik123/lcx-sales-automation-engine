-- Add columns to outreach_sequences
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES outreach_sequences(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_index INTEGER DEFAULT 0,
  touch_index INTEGER DEFAULT 1,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(sequence_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Sequence enrollments
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  enrolled_by TEXT NOT NULL DEFAULT 'operator',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_enrollments_project ON sequence_enrollments(project_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_sequence ON sequence_enrollments(sequence_id);
