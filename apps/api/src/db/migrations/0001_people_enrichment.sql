ALTER TABLE people
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS contactability_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enriched_by text DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_people_role ON people (role);
