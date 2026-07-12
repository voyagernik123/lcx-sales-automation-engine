-- 0022 — Phase-4 outreach operations: smart throttling / anti-burn (4-2),
--         mailbox health (4-4, read-only over messages), A/B testing (4-5),
--         and LinkedIn account warmup bookkeeping (4-8).
--
-- LOCKED RULE: LinkedIn/Telegram are NEVER auto-sent. linkedin_accounts here is
-- account management + rotation + health + warmup targets only — no sending.
-- Fully idempotent: safe to run repeatedly.

-- ── 4-2  Smart throttling + anti-burn ──────────────────────────────
CREATE TABLE IF NOT EXISTS sending_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  daily_cap INTEGER NOT NULL DEFAULT 50,
  sent_today INTEGER NOT NULL DEFAULT 0,
  reputation_score INTEGER NOT NULL DEFAULT 100, -- 0..100
  status TEXT NOT NULL DEFAULT 'active',          -- active | paused
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sending_domains_status ON sending_domains(status);

-- ── 4-5  A/B testing ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- variants: JSON array of variant labels, e.g. ["A","B"] or subject lines
  variants JSONB NOT NULL DEFAULT '[]',
  metric TEXT NOT NULL DEFAULT 'reply_rate', -- reply_rate | open_rate | meeting_rate
  status TEXT NOT NULL DEFAULT 'running',     -- running | paused | concluded
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);

CREATE TABLE IF NOT EXISTS ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL,
  variant TEXT NOT NULL,
  outcome BOOLEAN,                    -- NULL = pending, true = converted on metric
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ,
  UNIQUE (test_id, sequence_id)
);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_test ON ab_assignments(test_id);

-- ── 4-8  Warmup automation (bookkeeping only) ──────────────────────
CREATE TABLE IF NOT EXISTS linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  session_status TEXT NOT NULL DEFAULT 'unknown', -- active | expired | unknown
  daily_warmup_target INTEGER NOT NULL DEFAULT 20,
  warmup_day INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'warming',         -- warming | ready | paused
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_status ON linkedin_accounts(status);

-- Seed a default sending domain so the throttle picker isn't empty locally.
INSERT INTO sending_domains (domain, daily_cap, reputation_score, status)
VALUES ('mail.lcx.com', 50, 100, 'active')
ON CONFLICT (domain) DO NOTHING;
