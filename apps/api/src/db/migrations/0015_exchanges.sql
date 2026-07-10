-- 0015 — competitive exchange tracking: where each project is already listed.
--         Feeds the exchangeCount propensity feature and gap analysis
--         ("listed on N exchanges but not on LCX").

CREATE TABLE IF NOT EXISTS exchange_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  exchange_id TEXT NOT NULL,      -- provider slug, e.g. 'binance', 'lcx'
  exchange_name TEXT NOT NULL,
  category TEXT,                  -- Spot | Futures | ...
  pairs_count INTEGER NOT NULL DEFAULT 1,
  volume_24h_usd NUMERIC,
  source TEXT NOT NULL,           -- coinpaprika | coingecko
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, exchange_id)
);
CREATE INDEX IF NOT EXISTS idx_exch_project ON exchange_listings (project_id);
CREATE INDEX IF NOT EXISTS idx_exch_exchange ON exchange_listings (exchange_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS exchange_count INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exchanges_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_projects_exchange_count ON projects (exchange_count);
