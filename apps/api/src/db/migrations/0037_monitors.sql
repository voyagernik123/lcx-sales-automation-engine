-- ──────────────────────────────────────────────
--  0037 — Palantir-grade Phase 3.1: object monitors (the standing watch)
--
--  A monitor is a saved condition over an object set that, when it fires,
--  executes a governed action (registry, Phase 3.2). The machine watches so the
--  desk doesn't have to. monitor_fires dedupes — a subject fires a monitor once
--  (until cleared), so a nightly tick doesn't re-notify on the same match.
--
--  Idempotent. New tables → RLS enabled (API's postgres owner bypasses it —
--  same pattern as 0029–0031, 0035–0036).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        text NOT NULL,
  name         text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  subject_type text NOT NULL DEFAULT 'project',
  filter       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {tier,band,category,listedOnLcx,minMcap,maxMcap}
  condition    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {metric,op,threshold}
  action       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {id,params}
  last_run_at  timestamptz,
  last_match_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_monitors_owner ON monitors (owner, created_at DESC);

CREATE TABLE IF NOT EXISTS monitor_fires (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  subject_id text NOT NULL,
  fired_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_fires_uniq ON monitor_fires (monitor_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_monitor_fires_monitor ON monitor_fires (monitor_id, fired_at DESC);

ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_fires ENABLE ROW LEVEL SECURITY;
