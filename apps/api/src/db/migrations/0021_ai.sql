-- 0021_ai.sql — Phase-3 AI/ML features
-- Usage telemetry for the gated LLM client + AI-derived columns on existing tables.

-- Every LLM/fallback call is logged here (feature tag, char counts, whether the
-- real LLM was used). Powers cost/telemetry with zero PII.
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature       text NOT NULL,
  input_chars   integer NOT NULL DEFAULT 0,
  output_chars  integer NOT NULL DEFAULT 0,
  used_llm      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log (feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log (created_at);

-- Sentiment (3-2) + narrative score (3-3) cached on the handoff/score rows so
-- the queue can sort by them without recomputing.
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS narrative_score INTEGER;

ALTER TABLE scores ADD COLUMN IF NOT EXISTS narrative_score INTEGER;
