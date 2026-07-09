-- Enhance deals table with proposal, win/loss, package details
ALTER TABLE deals ADD COLUMN IF NOT EXISTS proposal_snapshot JSONB;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS proposal_generated_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS win_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS loss_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS loss_category TEXT;
-- loss_category: price | volume | liquidity | dd | mica | timeline | competitor | other
ALTER TABLE deals ADD COLUMN IF NOT EXISTS handoff_id UUID REFERENCES handoffs(id) ON DELETE SET NULL;

-- Deal events timeline
CREATE TABLE IF NOT EXISTS deal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- stage_change | note | objection | proposal_generated | won | lost | owner_change
  actor TEXT NOT NULL DEFAULT 'operator',
  old_stage TEXT,
  new_stage TEXT,
  content TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id);

-- Objection log
CREATE TABLE IF NOT EXISTS deal_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- price | volume | liquidity | dd | mica | timeline | competitor | other
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | blocker
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolution TEXT,
  raised_by TEXT DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deal_objections_deal ON deal_objections(deal_id);
