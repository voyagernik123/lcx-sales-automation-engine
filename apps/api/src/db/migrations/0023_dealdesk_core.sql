-- 0023 — Deal Desk core: negotiation playbooks, BATNA tracker, approval workflows.
-- Idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING). No money movement anywhere —
-- BATNA/approval amounts are tracking figures only.

-- ─── 5-2 Negotiation playbooks ───
CREATE TABLE IF NOT EXISTS negotiation_playbooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  steps      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playbooks_name ON negotiation_playbooks (name);

-- BATNA (Best Alternative To a Negotiated Agreement) tracker, one row per deal.
CREATE TABLE IF NOT EXISTS batna_tracker (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  our_floor_cents       BIGINT,
  their_offer_cents     BIGINT,
  competitor_offer_cents BIGINT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batna_deal ON batna_tracker (deal_id);

-- ─── 5-3 Approval workflows ───
CREATE TABLE IF NOT EXISTS approval_authority (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role            TEXT NOT NULL,
  max_discount_pct NUMERIC NOT NULL DEFAULT 0,
  max_value_cents BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_authority_role ON approval_authority (role);

CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  requested_by    TEXT NOT NULL DEFAULT 'operator',
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reason          TEXT,
  discount_pct    NUMERIC,
  deal_value_cents BIGINT,
  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_deal ON approval_requests (deal_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL DEFAULT 0,
  role        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  decided_by  TEXT,
  decided_at  TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_request ON approval_steps (request_id, step_order);

-- ─── Seeds (idempotent) ───
INSERT INTO negotiation_playbooks (name, steps) VALUES
  ('Standard Listing Negotiation', '[
    {"order": 1, "title": "Anchor on full package value", "detail": "Open at list price; frame LCX distribution + compliance as the value driver, not the fee."},
    {"order": 2, "title": "Trade concessions, never give", "detail": "Every discount must be matched by a longer term, faster signature, or an added stream (MM, marketing)."},
    {"order": 3, "title": "Hold the floor", "detail": "Do not cross the BATNA floor. If they push past it, escalate for approval rather than conceding."},
    {"order": 4, "title": "Close on urgency", "detail": "Use the next listing window as the natural deadline to force a decision."}
  ]'::jsonb),
  ('Competitive Displacement', '[
    {"order": 1, "title": "Isolate the competitor offer", "detail": "Get the competing quote on the table and log it in the BATNA tracker."},
    {"order": 2, "title": "Reframe on total cost", "detail": "Position LCX regulatory standing and EU reach against the competitor headline number."},
    {"order": 3, "title": "Match selectively", "detail": "Only match price where the competitor is genuinely comparable; otherwise differentiate."},
    {"order": 4, "title": "Lock switching cost", "detail": "Offer migration support to raise the cost of choosing the competitor."}
  ]'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO approval_authority (role, max_discount_pct, max_value_cents) VALUES
  ('rep',      10, 5000000),
  ('manager',  25, 20000000),
  ('director', 40, 100000000),
  ('vp',       100, 9223372036854775807)
ON CONFLICT (role) DO NOTHING;
