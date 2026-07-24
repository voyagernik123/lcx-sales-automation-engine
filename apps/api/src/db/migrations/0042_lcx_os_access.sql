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
--  NO-LOCKOUT BACKFILL: the three-person desk (nik, monty, sam) receives
--  every workspace at role-mapped capability (desk decision 2026-07-24).
--  The API also fail-opens to this same picture if this migration has not
--  landed yet — deploy order can never lock the desk out.
--
--  Idempotent. RLS on (API's postgres owner bypasses).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS member_profiles (
  member_id  text PRIMARY KEY,               -- roster id: nik, monty, sam
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
-- Desk decision 2026-07-24: the roster is Nik + Monty (approvers) and Sam
-- (operator); all three hold every compartment. Grants remain governed and
-- revocable — this is the starting picture, not a bypass.
INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
SELECT m.member_id, w.workspace, m.cap, 'backfill-0042', 'Phase-1 no-lockout covenant: full-desk access per Nik (2026-07-24)'
FROM (VALUES
  ('monty', 'approve'), ('nik', 'approve'), ('sam', 'operate')
) AS m(member_id, cap)
CROSS JOIN (VALUES ('command'), ('sales'), ('intel'), ('regulatory'), ('distribution'), ('governance')) AS w(workspace)
ON CONFLICT (member_id, workspace) DO NOTHING;

-- Departed members leave no residual access or pending requests.
DELETE FROM entitlements    WHERE member_id IN ('rida', 'jatin');
DELETE FROM access_requests WHERE member_id IN ('rida', 'jatin');

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
