-- Add recommended_market to scores table
ALTER TABLE scores ADD COLUMN IF NOT EXISTS recommended_market TEXT DEFAULT 'none';
ALTER TABLE scores ADD COLUMN IF NOT EXISTS us_intel_signals JSONB DEFAULT '{}'::jsonb;
