-- 0025 — Phase-6 analytics: market intelligence feed + custom report builder.
-- Idempotent. References projects(id, ticker_norm), deals, handoffs, messages,
-- job_runs, scores (read-only from application code; no FKs added to those here
-- beyond project_id where a hard link is useful).

-- ── market_news — free market-intelligence feed (news.ts connector) ──
CREATE TABLE IF NOT EXISTS market_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                 -- cryptopanic | rss | manual
  title TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ,
  tickers TEXT[] NOT NULL DEFAULT '{}', -- raw tickers extracted from the item
  relevance_score INTEGER NOT NULL DEFAULT 0, -- # of matched tracked projects
  matched_project_ids UUID[] NOT NULL DEFAULT '{}',
  external_id TEXT,                     -- stable per-source id for dedup
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Dedup on (source, external_id) when the source gives a stable id; fall back
-- to (source, url) for feeds that don't.
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_news_ext ON market_news (source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_news_url ON market_news (source, url) WHERE external_id IS NULL AND url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_news_published ON market_news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_news_relevance ON market_news (relevance_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_news_tickers ON market_news USING GIN (tickers);

-- ── saved_reports — custom report builder definitions ──
CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- { entity, filters:[{column,op,value}], groupBy, metric } — validated
  -- against a fixed allowlist in reportBuilder.ts (never interpolated raw).
  config JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created ON saved_reports (created_at DESC);
