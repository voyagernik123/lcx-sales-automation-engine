-- ──────────────────────────────────────────────
--  0046 — LCX MARKETING: the seventh compartment's data spine
--
--  First instrument: X (Twitter) reply triage. The marketing desk loses replies
--  under @lcx posts because nobody owns watching them.
--
--  THE SAFETY PROPERTY THIS SCHEMA ENCODES. LCX OS holds no X credential,
--  authenticates as nothing, and posts nothing. Replies arrive from X's OWN
--  notification emails, pulled from a mailbox we own — never scraped, never via
--  an API key on the @lcx account. So there is no credential here to leak and no
--  write path to abuse: the worst failure is a missed comment, never a post made
--  in LCX's name. Nothing in this file stores a token, and nothing should.
--
--  GDPR (LCX is EU/Liechtenstein regulated). Reply text and author handles are
--  personal data even though they are public. Hence:
--    - retention_expires_at on every row, set at insert, swept by the job
--    - no profile enrichment, no follower graph, no cross-post identity building
--    - the minimum fields needed to answer a customer, and nothing else
--
--  Idempotent.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_x_reply (
  id                  bigserial PRIMARY KEY,

  -- X's own id for the reply. UNIQUE is the entire dedupe strategy: the mail
  -- poller is at-least-once (a mailbox re-read, a retried cron tick, a forwarded
  -- duplicate) and this constraint is what makes that harmless.
  x_comment_id        text NOT NULL UNIQUE,

  -- The @lcx post being replied to. Nullable: some notification emails identify
  -- the reply without cleanly identifying the parent, and dropping the reply
  -- would be worse than storing it unparented.
  x_post_id           text,

  author_handle       text NOT NULL,
  author_display      text,
  body                text NOT NULL,

  -- When X says it was posted, vs when we learned about it. Both, because the
  -- gap is the thing an SLA is measured against.
  posted_at           timestamptz,
  received_at         timestamptz NOT NULL DEFAULT now(),

  -- new → triaged → drafted → answered | ignored. Drives the queue.
  status              text NOT NULL DEFAULT 'new',

  sentiment           text,

  -- Admiralty grade. An email-derived reply is NOT the same reliability as an
  -- official API read, and the platform already knows how to say so on screen.
  -- Recorded per row so a future paid source is visibly better-graded.
  source_grade        text NOT NULL DEFAULT 'C3',
  source_kind         text NOT NULL DEFAULT 'x_notification_email',

  -- Set at insert from MARKETING_RETENTION_DAYS. The sweep deletes on this, so
  -- retention is a property of the row rather than of remembering to run a script.
  retention_expires_at timestamptz NOT NULL,

  -- The raw email, kept ONLY when parsing failed, so a customer's comment is
  -- never silently dropped by a brittle regex. Cleared once parsed.
  raw_email           text,
  parse_failed        boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- The queue read: newest unanswered first.
CREATE INDEX IF NOT EXISTS marketing_x_reply_status_idx
  ON marketing_x_reply (status, received_at DESC);

-- The retention sweep.
CREATE INDEX IF NOT EXISTS marketing_x_reply_retention_idx
  ON marketing_x_reply (retention_expires_at);

-- Everything under one post, for threading a conversation.
CREATE INDEX IF NOT EXISTS marketing_x_reply_post_idx
  ON marketing_x_reply (x_post_id);

-- Anything a human still has to look at because the parser could not.
CREATE INDEX IF NOT EXISTS marketing_x_reply_parse_failed_idx
  ON marketing_x_reply (parse_failed) WHERE parse_failed;


-- ── Drafts ────────────────────────────────────────────────────────────────────
--  An AI-proposed answer. SEPARATE from the reply so the audit reads honestly:
--  one reply may be drafted several times, and every draft keeps its own record
--  of who approved it and what the model actually said.
--
--  There is NO 'posted' state and no posted_at. The system does not post to X —
--  an approved draft is text a human copies. That is a deliberate architectural
--  limit, not a missing feature: it is what makes a prompt-injected draft
--  incapable of reaching LCX customers on its own.
CREATE TABLE IF NOT EXISTS marketing_reply_draft (
  id            bigserial PRIMARY KEY,
  reply_id      bigint NOT NULL REFERENCES marketing_x_reply(id) ON DELETE CASCADE,

  body          text NOT NULL,
  used_llm      boolean NOT NULL DEFAULT false,

  -- Set when the sanitiser found a URL or an address-shaped token in the model's
  -- output. A flagged draft is still shown — with the finding — because hiding it
  -- would teach the operator that drafts are always clean.
  flagged       boolean NOT NULL DEFAULT false,
  flag_reason   text,

  status        text NOT NULL DEFAULT 'proposed',   -- proposed | approved | rejected
  approved_by   text,
  approved_at   timestamptz,
  reject_reason text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_reply_draft_reply_idx
  ON marketing_reply_draft (reply_id, created_at DESC);


-- ── Extending the no-lockout covenant to the new compartment ──────────────────
--  `marketing` is declared legacy:false, i.e. DEFAULT-DENY, and that is working
--  as intended: 0042 seeded grants for the six workspaces that existed then, so
--  a seventh has no rows and nobody can open it — not even the desk.
--
--  Proved rather than assumed: with the DB present, /v1/access/me returned
--  `workspaces` of length 7 while `entitlements.marketing` was undefined. The
--  registry lists the compartment; the grant table decides who enters.
--
--  So the covenant is extended EXPLICITLY here, the same shape 0042 used and with
--  the same capabilities. This is deliberately a visible, audited grant rather
--  than a change to the default-deny rule: a fourth person (a marketing hire)
--  still gets nothing until an approver grants it through the access-request
--  flow, which is the whole point of the compartment.
INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
SELECT m.member_id, 'marketing', m.cap, 'backfill-0046',
       'Seventh compartment (LCX MARKETING): no-lockout covenant extended to the founding desk'
FROM (VALUES
  ('monty', 'approve'), ('nik', 'approve'), ('sam', 'operate')
) AS m(member_id, cap)
ON CONFLICT (member_id, workspace) DO NOTHING;


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED HERE, not left to a dashboard button.
--
--  Supabase's SQL editor offers "Run and enable RLS" when it sees a CREATE TABLE
--  in `public` without it. Taking that option is correct — but it would leave the
--  security posture living in a click nobody records, so a database restored from
--  this file alone would come up with RLS OFF and nothing would say so. 0042 and
--  0043 both declare their own (three tables each); this file was the odd one out.
--
--  WHY IT MATTERS FOR THESE TABLES SPECIFICALLY. Supabase exposes `public` tables
--  through its auto-generated REST API. Without RLS, anyone holding the project's
--  anon key could read `marketing_x_reply` — which holds third-party PERSONAL DATA
--  (X handles and reply text) on a licensed exchange's infrastructure. That is a
--  GDPR exposure, not a hypothetical one.
--
--  WHY IT CANNOT BREAK LCX OS. The API connects as the database owner, which
--  bypasses RLS — the same arrangement 0042 relies on, proven by the fact that
--  `entitlements` is RLS-enabled and the workspace switcher works in production
--  today. No policies are defined because no non-owner role should reach these
--  tables at all: RLS with no policy is deny-all, which is the intent.
ALTER TABLE marketing_x_reply     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_reply_draft ENABLE ROW LEVEL SECURITY;
