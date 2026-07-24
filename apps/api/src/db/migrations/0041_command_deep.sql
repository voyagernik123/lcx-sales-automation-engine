-- ──────────────────────────────────────────────
--  0041 — LCX COMMAND 100X Phase 1: the mutable program state
--
--  Design split (zero-drift): the full-fidelity REFERENCE ontology (weighted
--  scorecards, provider matrices, funnel model, policy outlines, 100 sources)
--  is compiled from the strategy workbooks into a versioned TS module and
--  served read-only — it cannot drift from the strategy. Postgres holds ONLY
--  the state the desk operates on:
--
--  command_rfi          — one row per partner as RFIs go out; the 20 commercial
--                         fields land in `values` jsonb; provenance grade
--                         upgrades C3→B2 (returned) →A1 (signed).
--  command_requirements — the 14 listing requirements; desk flips status.
--  command_blockers     — the 12 launch blockers; desk tracks resolution.
--
--  Idempotent. RLS on (API's postgres owner bypasses).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS command_rfi (
  partner_id  text PRIMARY KEY,               -- pt_b2c2, …
  status      text NOT NULL DEFAULT 'not_issued',  -- not_issued | issued | returned | signed
  owner       text,
  grade       text,                            -- B2 on return, A1 on signing (C3 = public baseline)
  values      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- keyed by the 20 RFI field keys
  issued_at   timestamptz,
  returned_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_requirements (
  num         integer PRIMARY KEY,             -- 1..14 (stable ids from the checklist)
  requirement text NOT NULL,
  detail      text,
  path        text,                            -- A | B | Both
  owner       text,
  status      text,                            -- as authored, then desk-updated
  source_refs text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_blockers (
  num          integer PRIMARY KEY,            -- 1..12
  blocker      text NOT NULL,
  category     text,
  severity     text,                           -- Critical | High | Medium
  detail       text,
  owner        text,
  resolves_via text,
  status       text NOT NULL DEFAULT 'open',   -- open | mitigating | resolved
  source_refs  text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE command_rfi          ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_blockers     ENABLE ROW LEVEL SECURITY;
