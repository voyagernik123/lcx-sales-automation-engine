-- ──────────────────────────────────────────────
--  0039 — Palantir-grade Phase 4: THE OPERATING SYSTEM
--
--  decisions   — the institutional decision log. Every consequential call
--                (deal closes past negotiating, monitor creation, suppressions)
--                gets a structured memo: context, options, decision, rationale,
--                owner, and a review-by date. Six months on, "why did we pass on
--                X?" has an answer, and the outcome is filled in at review.
--  wbr_reports — the auto-composed Weekly Business Review, upserted by the `wbr`
--                job (Monday 06:00 UTC) so every Monday's review is durable and
--                the /wbr page loads instantly with WoW deltas and exceptions.
--
--  Ownership (4.4) reuses columns that already exist: deals.owner (0000),
--  monitors.owner (0037), pirs.owner (0038) — no new columns needed here.
--
--  Idempotent. New tables → RLS enabled (the API's postgres owner bypasses it).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  context            text NOT NULL DEFAULT '',
  options_considered text NOT NULL DEFAULT '',
  decision           text NOT NULL DEFAULT '',
  rationale          text NOT NULL DEFAULT '',
  owner              text NOT NULL,
  subject_type       text,                              -- 'deal' | 'project' | 'monitor' | null
  subject_id         text,
  review_by          date,                              -- when to revisit; null = no scheduled review
  outcome            text,                              -- filled at review
  outcome_at         timestamptz,
  source             text NOT NULL DEFAULT 'manual',    -- manual | deal_close | monitor | suppression
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decisions_owner   ON decisions (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_review  ON decisions (review_by) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_subject ON decisions (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS wbr_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL UNIQUE,                    -- Monday of the review week
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wbr_week ON wbr_reports (week_start DESC);

ALTER TABLE decisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wbr_reports ENABLE ROW LEVEL SECURITY;
