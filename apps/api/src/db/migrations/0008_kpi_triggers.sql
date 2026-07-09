-- KPI daily snapshots for dashboard aggregation
CREATE TABLE IF NOT EXISTS kpi_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Lead generation
  new_high_score_leads_week INTEGER DEFAULT 0,
  -- Reply metrics
  reply_rate_email_sent INTEGER DEFAULT 0,
  reply_rate_email_replied INTEGER DEFAULT 0,
  reply_rate_linkedin_sent INTEGER DEFAULT 0,
  reply_rate_linkedin_replied INTEGER DEFAULT 0,
  -- Timeline aggregates (in hours, stored as cents to avoid float drift)
  avg_hours_first_touch_to_handoff INTEGER,
  avg_hours_handoff_to_proposal INTEGER,
  avg_hours_proposal_to_won INTEGER,
  -- Funnel
  funnel_enrolled INTEGER DEFAULT 0,
  funnel_replied INTEGER DEFAULT 0,
  funnel_proposal INTEGER DEFAULT 0,
  funnel_won INTEGER DEFAULT 0,
  -- Revenue by stream (cents)
  revenue_listing INTEGER DEFAULT 0,
  revenue_marketing INTEGER DEFAULT 0,
  revenue_liquidity INTEGER DEFAULT 0,
  revenue_dual INTEGER DEFAULT 0,
  revenue_emt INTEGER DEFAULT 0,
  revenue_custom INTEGER DEFAULT 0,
  -- Objections (stored as JSON for flexibility)
  top_objections JSONB DEFAULT '[]'::jsonb,
  -- Stalled deals
  stalled_deal_count INTEGER DEFAULT 0,
  -- Post-listing
  total_won INTEGER DEFAULT 0,
  with_expansion INTEGER DEFAULT 0,
  expansion_revenue INTEGER DEFAULT 0,
  -- Hot/stalled/overdue
  hot_deals INTEGER DEFAULT 0,
  stalled_deals INTEGER DEFAULT 0,
  overdue_actions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date ON kpi_daily_snapshots(snapshot_date);

-- Post-listing 30/60/90 triggers
CREATE TABLE IF NOT EXISTS post_listing_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_day INTEGER NOT NULL CHECK (trigger_day IN (30, 60, 90)),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('campaign_upsell', 'mm_referral', 'mica_legal', 'trading_incentives')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'drafted', 'completed', 'skipped')),
  draft_content TEXT,
  task_summary TEXT,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_triggers_deal ON post_listing_triggers(deal_id);
CREATE INDEX IF NOT EXISTS idx_triggers_due ON post_listing_triggers(due_at);
CREATE INDEX IF NOT EXISTS idx_triggers_status ON post_listing_triggers(status);
