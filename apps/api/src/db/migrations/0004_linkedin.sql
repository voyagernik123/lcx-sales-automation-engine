-- Add linkedin_status to people
ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin_status TEXT DEFAULT 'none';
-- Values: none | pending | connected | messaged | replied | declined

-- Track LinkedIn daily/weekly usage
CREATE TABLE IF NOT EXISTS linkedin_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  action TEXT NOT NULL, -- connection_request | message
  count INTEGER NOT NULL DEFAULT 0,
  week_start DATE NOT NULL DEFAULT (date_trunc('week', CURRENT_DATE)::date),
  UNIQUE(date, action)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_usage_date ON linkedin_usage(date);

-- Provider campaign id on sequences
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'internal';
