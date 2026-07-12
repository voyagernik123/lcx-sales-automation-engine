-- 0026 — external integrations: meeting scheduling, email sync, social
-- mentions (twitter + telegram/discord), and calendar events. Idempotent.

-- 2-9 Meeting scheduling ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 30,
  availability JSONB NOT NULL DEFAULT '{"days":[1,2,3,4,5],"startHour":9,"endHour":17,"tz":"Europe/Berlin"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  meeting_link_id UUID REFERENCES meeting_links(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled | no_show
  attendee_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings (project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON meetings (scheduled_at DESC);

-- 2-10 Email sync (Gmail / Outlook) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'inbound', -- inbound | outbound
  external_id TEXT NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_project ON email_threads (project_id, occurred_at DESC);

-- 4-7 / 4-9 Social + chat mentions (twitter, telegram, discord) ─────────
CREATE TABLE IF NOT EXISTS social_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- twitter | telegram | discord
  author TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sentiment TEXT NOT NULL DEFAULT 'neutral', -- positive | neutral | negative
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_mentions_project ON social_mentions (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_mentions_platform ON social_mentions (platform);

-- 4-10 Calendar events (recorded from meetings) ─────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | tentative | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_meeting ON calendar_events (meeting_id);
