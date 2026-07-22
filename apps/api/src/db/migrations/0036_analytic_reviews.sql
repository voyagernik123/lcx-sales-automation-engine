-- ──────────────────────────────────────────────
--  0036 — Palantir-grade Phase 2: human structured analytic techniques (SATs)
--
--  CIA tradecraft, human-in-the-loop: Key Assumptions Check, Premortem, and
--  Devil's Advocate reviews attached to a deal or project. One generic table
--  (kind + structured JSONB content) so new techniques don't need new schema.
--
--  Deals over a value threshold can't advance past negotiating without a
--  premortem (enforced in the app with an audited override) — governance meets
--  tradecraft. This table is the record.
--
--  Idempotent. New table → RLS enabled (deny-by-default for anon/authenticated;
--  the API's postgres owner bypasses it — same pattern as 0029–0031, 0035).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytic_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,                       -- key_assumptions | premortem | devils_advocate
  subject_type text NOT NULL,                       -- deal | project
  subject_id   text NOT NULL,
  title        text NOT NULL DEFAULT '',
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- structured per kind
  author       text NOT NULL,                        -- operator id
  status       text NOT NULL DEFAULT 'active',        -- draft | active | resolved
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytic_reviews_subject ON analytic_reviews (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytic_reviews_kind ON analytic_reviews (kind);

ALTER TABLE analytic_reviews ENABLE ROW LEVEL SECURITY;
