-- 0024 — Deal Desk extended: e-signature tracking, invoice/billing TRACKING ONLY,
-- post-listing success reviews, partner/referral, competitive intel, virtual data room.
-- Idempotent. HARD RULE: no money movement — invoices/milestones are status records
-- only; the data room stores capped inline blobs, not real object storage.

-- ─── 5-4 E-signature (provider + mock, tracking) ───
CREATE TABLE IF NOT EXISTS signature_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'mock',      -- mock | docusign
  document_name TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',      -- sent | signed | declined | voided
  signing_url   TEXT,
  external_id   TEXT,
  sent_at       TIMESTAMPTZ,
  signed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signature_requests_deal ON signature_requests (deal_id, created_at DESC);

-- ─── 5-5 Payment & billing — TRACKING ONLY, never executes transfers ───
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  amount_cents   BIGINT NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  status         TEXT NOT NULL DEFAULT 'draft',     -- draft | sent | paid | overdue
  due_date       DATE,
  crypto_address TEXT,                              -- display/reference only, never used to move funds
  line_items     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_deal ON invoices (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status, due_date);

CREATE TABLE IF NOT EXISTS payment_milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'pending',     -- pending | invoiced | paid
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_invoice ON payment_milestones (invoice_id);

-- ─── 5-7 Post-listing success automation ───
CREATE TABLE IF NOT EXISTS success_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deal_id      UUID REFERENCES deals(id) ON DELETE SET NULL,
  review_type  TEXT NOT NULL DEFAULT 'QBR',          -- QBR | health
  scheduled_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'scheduled',    -- scheduled | completed | skipped
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_success_reviews_project ON success_reviews (project_id, scheduled_at);
-- one review per (deal, type, scheduled slot) so regeneration on won does not duplicate
CREATE UNIQUE INDEX IF NOT EXISTS idx_success_reviews_dedup
  ON success_reviews (deal_id, review_type, scheduled_at)
  WHERE deal_id IS NOT NULL;

-- ─── 5-8 Partner / referral ───
CREATE TABLE IF NOT EXISTS partners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'referral',    -- referral | reseller | market_maker | advisor
  commission_pct NUMERIC NOT NULL DEFAULT 0,
  contact        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_name ON partners (name);

CREATE TABLE IF NOT EXISTS referrals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  deal_id          UUID REFERENCES deals(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'new',        -- new | qualified | won | lost | paid
  commission_cents BIGINT NOT NULL DEFAULT 0,          -- tracked accrual only, no payout execution
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_partner ON referrals (partner_id, created_at DESC);

-- ─── 5-9 Competitive deal intelligence ───
CREATE TABLE IF NOT EXISTS deal_competitors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  competitor_name  TEXT NOT NULL,
  their_offer_cents BIGINT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_competitors_deal ON deal_competitors (deal_id, created_at DESC);

-- ─── 5-10 Virtual data room (metadata + capped inline blobs, NOT real storage) ───
CREATE TABLE IF NOT EXISTS data_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_rooms_deal ON data_rooms (deal_id);

CREATE TABLE IF NOT EXISTS data_room_docs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_room_id UUID NOT NULL REFERENCES data_rooms(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'text/plain',
  access_level TEXT NOT NULL DEFAULT 'internal',    -- internal | client | public
  content      TEXT,                                -- text or base64, capped at ~200KB by the service
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_data_room_docs_room ON data_room_docs (data_room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_room_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_room_id UUID NOT NULL REFERENCES data_rooms(id) ON DELETE CASCADE,
  doc_id       UUID REFERENCES data_room_docs(id) ON DELETE SET NULL,
  actor        TEXT NOT NULL DEFAULT 'operator',
  action       TEXT NOT NULL DEFAULT 'view',        -- view | upload | download
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_data_room_access_room ON data_room_access (data_room_id, created_at DESC);
