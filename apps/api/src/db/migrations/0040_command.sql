-- ──────────────────────────────────────────────
--  0040 — LCX COMMAND: the CEO's US-launch command deck (Wave 1 spine)
--
--  A new platform-within-the-platform. Models the whole US-launch program as a
--  governed operating picture: products, typed partners, workstreams, a task
--  DEPENDENCY GRAPH, the launch anchor, financial assumptions, risks, decisions.
--
--  Namespaced `command_*` — the existing `tasks` and `decisions` tables are the
--  Phase-4 desk objects and are DISTINCT from these program objects.
--
--  Non-fabrication rule honored at the schema level: everything the strategy did
--  not contain (partner contacts, terms, capability scores, dates) is nullable.
--
--  Idempotent. New tables → RLS enabled (the API's postgres owner bypasses it).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS command_products (
  id          text PRIMARY KEY,                 -- prod_exchange_usa, …
  name        text NOT NULL,
  type        text,                             -- CEX | Chain | DEX | Wallet | Explorer
  status      text,                             -- in_planning | testnet | in_progress | …
  owner       text,
  notes       text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_partners (
  id               text PRIMARY KEY,            -- pt_b2c2, …
  name             text NOT NULL,
  type             text,                        -- LiquidityProvider | Bank | StablecoinIssuer | OnRamp | Custodian | Prime | Aggregator | Surveillance | Compliance | MetalsDistributor
  subtype          text,
  pipeline_stage   text,                        -- incumbent_onboarding | recommended_rfi | recommended | evaluate | in_progress | select | support | hold_geoblock | exclude_pending_counsel | alternate | specialist
  capability_score numeric,                     -- analyst assessment; may be null
  tier             text,                        -- Tier 1..3; may be null
  primary_contact  text,                        -- null (gap)
  terms            text,                        -- null (gap)
  notes            text,
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_command_partners_type ON command_partners (type, pipeline_stage);

CREATE TABLE IF NOT EXISTS command_workstreams (
  id          text PRIMARY KEY,                 -- ws_p1, ws_exusa, …
  name        text NOT NULL,
  owner       text,
  status      text,                             -- active | planning
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_tasks (
  id           text PRIMARY KEY,                -- t_bsa, m_ex_m1, …
  workstream   text,                            -- FK-ish to command_workstreams.id (or 'cross')
  title        text NOT NULL,
  owner        text,
  target_date  date,                            -- null unless a dated milestone
  status       text,                            -- pending | not_started | open | in_progress | blocked | tentative | future
  depends_on   text[] NOT NULL DEFAULT '{}',    -- the dependency graph edges (task ids)
  notes        text,
  source       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_command_tasks_ws ON command_tasks (workstream, status);

CREATE TABLE IF NOT EXISTS command_decisions (
  id             text PRIMARY KEY,              -- dec_01, …
  phase          text,                          -- P1..P4
  decision       text NOT NULL,
  recommendation text,
  status         text NOT NULL DEFAULT 'open',  -- open | decided
  chosen         text,                          -- filled when decided (Wave 2)
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_command_decisions_phase ON command_decisions (phase, status);

CREATE TABLE IF NOT EXISTS command_risks (
  id          text PRIMARY KEY,                 -- rf_classify, …
  category    text,                             -- Regulatory | Operational | Market | Technical | Program
  title       text NOT NULL,
  likelihood  text,                             -- Low | Medium | High
  impact      text,                             -- Low | Medium | High | Critical
  mitigation  text,
  phase       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_command_risks_cat ON command_risks (category);

CREATE TABLE IF NOT EXISTS command_financial_assumptions (
  id          text PRIMARY KEY,                 -- fa_wl_base, …
  area        text,
  item        text NOT NULL,
  value       text,                             -- kept as text: values are ranges/models, not all numeric
  unit        text,
  assumption  boolean NOT NULL DEFAULT true,    -- true = planning assumption (not a confirmed company figure)
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The launch plan is a single evolving object: the anchor date + its gating chain.
CREATE TABLE IF NOT EXISTS command_launch_targets (
  id          text PRIMARY KEY,                 -- lt_ex_m1, …  (stable synthetic ids)
  name        text NOT NULL,
  target_date text,                             -- text: some are ranges ("2026-07-13 to Q3-Q4 2026")
  confirmed   boolean NOT NULL DEFAULT false,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE command_products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_partners               ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_workstreams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_decisions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_risks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_financial_assumptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_launch_targets         ENABLE ROW LEVEL SECURITY;
