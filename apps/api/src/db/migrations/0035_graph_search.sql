-- ──────────────────────────────────────────────
--  0035 — Palantir-grade Phase 1: real object search + saved explorations
--
--  (a) pg_trgm trigram indexes so ILIKE '%q%' over the 54k-row projects table
--      (unified /v1/search, Cmd-K) is fast instead of a full scan.
--  (b) explorations — saved Sales-Graph views, shared across the desk.
--
--  Idempotent. New table gets RLS enabled (deny-by-default for anon/authenticated;
--  the API connects as the postgres owner and bypasses RLS — same pattern as
--  migrations 0029–0031).
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_projects_name_trgm   ON projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_ticker_trgm ON projects USING gin (ticker gin_trgm_ops);

CREATE TABLE IF NOT EXISTS explorations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      text NOT NULL,                              -- member id / email
  name       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { seed:{type,id,label}, nodes:[...], edges:[...] }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_explorations_owner ON explorations (owner, updated_at DESC);

ALTER TABLE explorations ENABLE ROW LEVEL SECURITY;
