-- ──────────────────────────────────────────────
--  0038 — Palantir-grade Phase 3.3/3.4: named scenarios + PIRs
--
--  scenarios — saved, shareable what-if worlds (the dials as a named object,
--  so the desk can fork/compare instead of one ephemeral local set).
--  pirs — Priority Intelligence Requirements: the named questions that drive
--  collection, so every sensor serves a stated requirement (CIA collection
--  management). Ops surfaces coverage against them.
--
--  Idempotent. New tables → RLS enabled (API's postgres owner bypasses it).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      text NOT NULL,
  name       text NOT NULL,
  deltas     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {closeRateDelta, valueDelta, timelineShiftDays}
  shared     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenarios_owner ON scenarios (owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS pirs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      text NOT NULL,
  name       text NOT NULL,
  question   text NOT NULL DEFAULT '',
  sources    text[] NOT NULL DEFAULT '{}',          -- collection sources that serve this PIR
  priority   integer NOT NULL DEFAULT 3,             -- 1 (highest) .. 5
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pirs_priority ON pirs (priority, created_at DESC);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pirs ENABLE ROW LEVEL SECURITY;
