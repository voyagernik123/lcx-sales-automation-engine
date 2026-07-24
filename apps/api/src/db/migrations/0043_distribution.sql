-- ──────────────────────────────────────────────
--  0043 — LCX ONE Phase 3: DISTRIBUTION COMMAND — mutable desk state
--
--  Design split (zero-drift): the full-fidelity distribution ontology (rails,
--  surfaces, competitors, gap register, graded sources) is compiled in
--  apps/api/src/seed/distribution/data.ts and served read-only. Postgres holds
--  ONLY what the desk operates on:
--
--  dist_listings      — one row per surface as PayAgent is listed on it;
--                       status not_started → submitted → live → ranked, plus
--                       rank/usage telemetry the desk records.
--  dist_campaigns     — quest/incentive/content campaigns; lifecycle state
--                       (Phase 6 adds the compliance gate + budget cap).
--  dist_channel_facts — RFI-style graded overrides: C research baseline, B
--                       verified by us, A contractual. Never touches data.ts.
--
--  Reseeds preserve desk-set status (ON CONFLICT never clobbers). Idempotent.
--  RLS on (API's postgres owner bypasses). Gated by the 'distribution'
--  workspace at the API layer (requireWorkspace).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_listings (
  surface_id   text PRIMARY KEY,               -- matches a surfaces[].id in data.ts
  status       text NOT NULL DEFAULT 'not_started',  -- not_started | submitted | live | ranked
  owner        text,
  rank_note    text,                            -- desk-recorded rank / placement
  usage_note   text,                            -- desk-recorded sold/uses/reach
  url          text,                            -- the live listing URL once up
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dist_campaigns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  surface_id     text,                          -- which surface it runs on (optional)
  kind           text NOT NULL DEFAULT 'quest', -- quest | incentive | content | outreach
  token_incentivized boolean NOT NULL DEFAULT false,
  budget_lcx     numeric,                       -- projected LCX reward spend
  status         text NOT NULL DEFAULT 'draft', -- draft | compliance_review | approved | live | measured
  detail         text,
  owner          text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dist_campaigns_status ON dist_campaigns (status, created_at DESC);

CREATE TABLE IF NOT EXISTS dist_channel_facts (
  surface_id   text NOT NULL,
  key          text NOT NULL,                   -- e.g. 'cac_usd', 'reach', 'contact'
  value        text,
  grade        text NOT NULL DEFAULT 'C',       -- C research → B verified → A contractual
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (surface_id, key)
);

-- Seed one listing row per surface at not_started (idempotent; status preserved).
INSERT INTO dist_listings (surface_id, status, updated_by)
VALUES
  ('mcp_registry','not_started','seed-0043'),
  ('chatgpt_apps','not_started','seed-0043'),
  ('claude_connectors','not_started','seed-0043'),
  ('x402_bazaar','not_started','seed-0043'),
  ('agentic_market','not_started','seed-0043'),
  ('okx_ai','not_started','seed-0043'),
  ('virtuals_acp','not_started','seed-0043'),
  ('moltbook','not_started','seed-0043'),
  ('galxe','not_started','seed-0043'),
  ('layer3','not_started','seed-0043'),
  ('zealy','not_started','seed-0043'),
  ('kaito_studio','not_started','seed-0043'),
  ('geo','not_started','seed-0043'),
  ('erc8004','not_started','seed-0043')
ON CONFLICT (surface_id) DO NOTHING;

ALTER TABLE dist_listings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dist_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dist_channel_facts ENABLE ROW LEVEL SECURITY;
