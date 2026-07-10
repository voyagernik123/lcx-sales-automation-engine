-- 0017 — configurable outreach cadences (replaces the hardcoded 5-touch).
--         A NULL/absent template still yields the default mixed cadence.

CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- steps: [{ touchIndex, delayDays, channel }] — bodies are drafted at enroll time
  steps JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seqtmpl_default ON sequence_templates (is_default);

-- Seed the current cadences so the picker isn't empty
INSERT INTO sequence_templates (id, name, description, steps, is_default)
VALUES
  (gen_random_uuid(), 'Standard 5-touch (mixed)',
   'Default cadence: email → email → LinkedIn → Telegram → email over 35 days',
   '[{"touchIndex":1,"delayDays":0,"channel":"email"},{"touchIndex":2,"delayDays":3,"channel":"email"},{"touchIndex":3,"delayDays":7,"channel":"linkedin"},{"touchIndex":4,"delayDays":14,"channel":"telegram"},{"touchIndex":5,"delayDays":35,"channel":"email"}]'::jsonb,
   TRUE),
  (gen_random_uuid(), 'LinkedIn-first (assisted)',
   'All-LinkedIn cadence for contacts with a profile but no verified email',
   '[{"touchIndex":1,"delayDays":0,"channel":"linkedin"},{"touchIndex":2,"delayDays":4,"channel":"linkedin"},{"touchIndex":3,"delayDays":10,"channel":"linkedin"},{"touchIndex":4,"delayDays":21,"channel":"linkedin"}]'::jsonb,
   FALSE),
  (gen_random_uuid(), 'Fast 3-touch',
   'Compressed cadence for hot leads: email → LinkedIn → email over 7 days',
   '[{"touchIndex":1,"delayDays":0,"channel":"email"},{"touchIndex":2,"delayDays":2,"channel":"linkedin"},{"touchIndex":3,"delayDays":7,"channel":"email"}]'::jsonb,
   FALSE)
ON CONFLICT DO NOTHING;
