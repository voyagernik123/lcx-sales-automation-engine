-- ──────────────────────────────────────────────
--  0042 — LCX ONE Phase 1: LCX OS — identity, entitlements & access requests
--
--  Design split (zero-drift): WHAT EXISTS — the workspace constitution
--  (6 workspaces, their routes, missions, sensitivity tiers) — is compiled in
--  @lcx/shared/workspaces.ts and can never drift from the code that enforces
--  it. Postgres holds only WHO MAY ENTER:
--
--  member_profiles — mutable enrichment of the compiled roster (unit, title).
--  entitlements    — member × workspace → capability (view|operate|approve).
--                    Every row is a governed grant: who gave it, when, why.
--  access_requests — the need-to-know front door: a member asks, an approver
--                    decides, the trail is permanent.
--
--  NO-LOCKOUT BACKFILL: the 5 current roster members receive entitlements
--  matching exactly what they can do today (legacy workspaces role-mapped;
--  the new 'distribution' compartment is approver-only until delegated).
--  The API also fail-opens to these same legacy grants if this migration has
--  not landed yet — deploy order can never lock the desk out.
--
--  Idempotent. RLS on (API's postgres owner bypasses).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS member_profiles (
  member_id  text PRIMARY KEY,               -- roster id: nik, monty, sam, rida, jatin
  unit       text,                            -- Exec | BD | AI Labs | Legal | Ops
  title      text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  member_id     text NOT NULL,
  workspace     text NOT NULL,                -- command | sales | intel | regulatory | distribution | governance
  capability    text NOT NULL CHECK (capability IN ('view', 'operate', 'approve')),
  granted_by    text NOT NULL,                -- roster id or 'backfill-0042'
  justification text,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, workspace)
);

CREATE TABLE IF NOT EXISTS access_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     text NOT NULL,
  workspace     text NOT NULL,
  capability    text NOT NULL DEFAULT 'view' CHECK (capability IN ('view', 'operate', 'approve')),
  justification text NOT NULL,                -- purpose-based access: the "why" is mandatory
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status, created_at DESC);

-- ── The no-lockout backfill (mirrors legacyEntitlements() in @lcx/shared) ──
-- approvers (monty, nik): approve on all 6 workspaces incl. the new compartment
-- operators (sam, rida, jatin): operate on the 5 legacy workspaces; distribution default-deny
INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
SELECT m.member_id, w.workspace, m.cap, 'backfill-0042', 'Phase-1 no-lockout covenant: preserves pre-LCX-OS access'
FROM (VALUES
  ('monty', 'approve'), ('nik', 'approve'),
  ('sam', 'operate'), ('rida', 'operate'), ('jatin', 'operate')
) AS m(member_id, cap)
CROSS JOIN (VALUES ('command'), ('sales'), ('intel'), ('regulatory'), ('governance')) AS w(workspace)
ON CONFLICT (member_id, workspace) DO NOTHING;

INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
VALUES
  ('monty', 'distribution', 'approve', 'backfill-0042', 'New compartment: approvers own it until delegated'),
  ('nik',   'distribution', 'approve', 'backfill-0042', 'New compartment: approvers own it until delegated')
ON CONFLICT (member_id, workspace) DO NOTHING;

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
