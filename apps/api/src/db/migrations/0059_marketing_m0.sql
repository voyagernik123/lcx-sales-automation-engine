-- ──────────────────────────────────────────────
--  0059 — LCX MARKETING: THE EIGHT LIVE DEFECTS
--
--  Phase M0 of LCX_MARKETING_100X_PLAN.md (§1, §5). NO NEW FEATURES. Every column
--  below exists because something the code already claimed was not true.
--
--  NUMBERING. 0058 is `0058_gps_artifact_custody.sql`, written by the GPS workflow
--  running alongside this one, so this file takes the next free number rather than
--  colliding with it. 0057 is likewise GPS.
--
--  WHAT IT ADDS, AND WHICH LIE EACH COLUMN ENDS
--
--    defect 1  FORGEABLE INGEST. The mailbox is a public write path — anyone who
--              learns its address can send it a hand-written email carrying one
--              x.com/<handle>/status/<digits> permalink and one line of prose, and
--              get a queue row with an attacker-chosen handle, comment id, display
--              name and body, graded C3 "fairly reliable". The reader fetched
--              `envelope` and read only `subject` and `date` out of it.
--                → sender_from, sender_auth_state, sender_dkim_domain,
--                  sender_auth_evidence, quarantined, quarantine_code
--
--    defect 4  WRONG CLOCK. `posted_at` was written from the EMAIL DATE HEADER, so
--              the desk's "oldest waiting" measured mail-forwarding latency; and
--              because it fell back to `received_at`, the figure flattered the desk
--              by exactly the delay it existed to expose.
--                → posted_on_displayed, posted_at_source
--
--    defect 5  'answered' WAS SET WHEN NOTHING WAS SENT. Status flipped on approval.
--              There is no send path in this compartment and there must never be
--              one, so "sent" can only ever be a human's assertion — and it is now
--              modelled as exactly that, separately from approval.
--                → marketing_reply_draft.sent_asserted_by / sent_asserted_at
--
--    defect 6  A PRE-CLAIMED ID DESTROYED A REAL REPLY. `ON CONFLICT DO NOTHING`
--              reported as "duplicates", with attacker-chosen ids.
--                → collision_of_comment_id (the losing content is KEPT, under a
--                  synthetic id, quarantined, with an audit row naming both)
--
--    defect 7  raw_email WAS NEVER CLEARED despite 0046 saying it was.
--                → raw_email_cleared_at, plus the COMMENT ON COLUMN below.
--
--              WHY 0046 ITSELF IS NOT EDITED. The correction was written into 0046
--              first, and `db/__tests__/migrationImmutability.test.ts` rejected it for
--              the right reason: 0046 has already been applied and `db/migrate.ts`
--              skips applied filenames, so editing it changes nothing in any
--              environment that ran it while making the repository claim otherwise —
--              which is how a false COMMENT survived in production in the first place.
--              The false sentence therefore STAYS in 0046, and the correction is
--              delivered here, where `COMMENT ON COLUMN` overwrites what the database
--              is actually holding.
--
--  ══ ADDITIVE, IDEMPOTENT, FORWARD-ONLY. ═══════════════════════════════════════
--  No DROP, no DELETE, no TRUNCATE, no ALTER COLUMN TYPE, no CHECK added to an
--  existing populated column. A human pastes this into Supabase by hand and a
--  destructive-operations warning costs a round trip. `posted_at` is deliberately
--  LEFT IN PLACE rather than dropped: dropping it would destroy the only record of
--  what the desk was previously told, and its meaning is corrected by comment and by
--  the code that no longer writes it.
--
--  ══ NO CREDENTIAL, NO POSTING PATH, NOTHING THAT CAN SPEAK FOR LCX. ═══════════
--  Nothing here stores a token, a cookie or a session, and nothing here creates a
--  state a posting path could read. The compartment still cannot post: an approved
--  draft is text a human copies, and `sent_asserted_at` records that a human says
--  they did — it does not cause it.
-- ──────────────────────────────────────────────


-- ══ 1. SENDER AUTHENTICATION, RECORDED PER ROW ════════════════════════════════
--  The evidence, not our summary of it. `sender_auth_evidence` holds the verbatim
--  `Authentication-Results` field from the mail provider LCX owns — the only such
--  field a consumer may believe (RFC 8601 §5) — so that a later dispute about
--  whether a row was genuine is settled by what the provider said at the time,
--  rather than by re-deriving it from a parser that has since changed.
--
--  WHY `sender_from` IS HERE AND WHY IT DECIDES NOTHING. A forwarded message fails
--  SPF by construction (the forwarder is the sender, RFC 7489) and `From:` is free
--  text, so it is stored as evidence of what the sender WROTE and never consulted
--  for acceptance. Recording it is how a forgery attempt becomes examinable.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS sender_from          text,
  ADD COLUMN IF NOT EXISTS sender_auth_state    text,
  ADD COLUMN IF NOT EXISTS sender_dkim_domain   text,
  ADD COLUMN IF NOT EXISTS sender_auth_evidence text,
  ADD COLUMN IF NOT EXISTS quarantined          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantine_code      text;

COMMENT ON COLUMN marketing_x_reply.sender_auth_state IS
  'dkim | arc | unverified | no_trust_anchor | operator_asserted. NULL on rows that predate 0059 — those were accepted with NO sender check at all and must be read as unverified, not as verified. An unconfigured trust anchor (no_trust_anchor) is a distinct state from a failed check: one means we could not ask, the other means we asked and the answer was no.';
COMMENT ON COLUMN marketing_x_reply.sender_from IS
  'The From: header verbatim. EVIDENCE ONLY — free text, spoofable, and SPF fails by construction on a forwarded message. Nothing is accepted because of this field.';
COMMENT ON COLUMN marketing_x_reply.quarantined IS
  'True when the row could not be authenticated, or when a genuine reply''s id was already claimed by different content. A quarantined row is shown to the desk and excluded from the drafting queue and from every SLA figure — visible, never promoted, never silently dropped.';

-- The queue read excludes quarantined rows, so it is the queue index that needs to
-- know about them. Partial, because the quarantined set is expected to be small.
CREATE INDEX IF NOT EXISTS marketing_x_reply_quarantined_idx
  ON marketing_x_reply (quarantined, received_at ASC) WHERE quarantined;

CREATE INDEX IF NOT EXISTS marketing_x_reply_sender_auth_idx
  ON marketing_x_reply (sender_auth_state);


-- ══ 2. TWO CLOCKS, WHICH WERE ONE ═════════════════════════════════════════════
--  `received_at` is when WE learned. `posted_on_displayed` is when X says the post
--  was written — and it is a DATE, not a timestamp, because the keyless oEmbed
--  endpoint returns "August 1, 2026" and nothing finer (see oembed.ts). Widening it
--  into an instant would invent a time of day, which is the same class of mistake as
--  the one this migration exists to fix.
--
--  `posted_at` STAYS, UNWRITTEN. Nothing in the code sets it any more. It is not
--  dropped because the rows it already contains are the record of what the desk was
--  shown, and because a hand-pasted DROP is exactly the round trip this file avoids.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS posted_on_displayed date,
  ADD COLUMN IF NOT EXISTS posted_at_source    text;

COMMENT ON COLUMN marketing_x_reply.posted_at IS
  'DEPRECATED AND NO LONGER WRITTEN (0059). It was populated from the notification email''s Date header, i.e. mail-forwarding latency, and any SLA computed from it measured the wrong thing. Existing values are kept as the record of what the desk was previously told. Post time now lives in posted_on_displayed.';
COMMENT ON COLUMN marketing_x_reply.posted_on_displayed IS
  'The calendar date X itself renders in its oEmbed embed. A DATE, deliberately: X prints no time of day, so there is none to store. NULL means the post time is NOT KNOWN — anything derived from it must refuse rather than substitute received_at.';
COMMENT ON COLUMN marketing_x_reply.posted_at_source IS
  'oembed_display_date when X''s own endpoint supplied the date; unknown otherwise. There is no third value: an email header date is not a post time and is never recorded as one.';


-- ══ 3. AN ID COLLISION IS NEVER INNOCENT ══════════════════════════════════════
--  x_comment_id is UNIQUE and a conflict was reported as the benign word
--  "duplicates". So: post a hostile reply, note its id from your own URL, email a
--  forged notification carrying that id with harmless text, and when X's real
--  notification arrives it is discarded as a duplicate. The complaint the
--  compartment exists to catch never reaches the desk.
--
--  A second sighting of the SAME content is still a duplicate and still harmless.
--  A second sighting of DIFFERENT content under one id is not, and the losing
--  content is now kept under a synthetic id that names the collision, quarantined,
--  with an audit_log row recording both fingerprints. Nothing is discarded.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS collision_of_comment_id text;

COMMENT ON COLUMN marketing_x_reply.collision_of_comment_id IS
  'Set on a row that was stored because its x_comment_id was already held by DIFFERENT content. Names the id that was already claimed. The row is quarantined and a human must decide which is genuine — the alternative, silently dropping one, is how a real complaint disappears.';

CREATE INDEX IF NOT EXISTS marketing_x_reply_collision_idx
  ON marketing_x_reply (collision_of_comment_id)
  WHERE collision_of_comment_id IS NOT NULL;


-- ══ 4. raw_email IS ACTUALLY CLEARED NOW ══════════════════════════════════════
--  0046 said "Cleared once parsed". Nothing in the repo cleared it: up to 20,000
--  characters of a third party's email — headers, addresses, whatever else the
--  forwarder included — sat in the row for the full 90-day retention window. That is
--  a GDPR data-minimisation failure with a comment asserting the opposite, which is
--  worse than the failure alone because it stops anyone looking.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS raw_email_cleared_at timestamptz;

COMMENT ON COLUMN marketing_x_reply.raw_email IS
  'The raw email, kept ONLY when parsing failed, so a customer''s comment is never silently dropped by a brittle regex. CLEARED by service.clearRawEmail once a human has triaged the row, and by service.sweepRawEmail after MARKETING_RAW_EMAIL_DAYS regardless — 0046 claimed this was already happening and it was not (0059).';
COMMENT ON COLUMN marketing_x_reply.raw_email_cleared_at IS
  'When raw_email was nulled. A queryable fact rather than a memory: NULL with a non-null raw_email means the sweep has not reached this row yet.';

-- The sweep looks for rows that still hold a raw body. Partial index, because the
-- overwhelming majority of rows never had one.
CREATE INDEX IF NOT EXISTS marketing_x_reply_raw_email_idx
  ON marketing_x_reply (received_at)
  WHERE raw_email IS NOT NULL;


-- ══ 5. APPROVED IS NOT SENT ═══════════════════════════════════════════════════
--  `status` flipped to 'answered' on approval. Nothing was sent — there is no send
--  path in this compartment and there must never be one — so the customer might
--  still be waiting while the queue reported them answered, and the SLA figure
--  inherited that.
--
--  THE HONEST MODEL. Approval is a named human saying "I would send this". Sending
--  happens outside this system, by hand, and the only thing this system can ever
--  hold is that human's ASSERTION that they did it. So it is stored as an assertion:
--  who said so, and when they said it. It is not evidence that a post exists; the
--  independent check on that is oEmbed, not this column.
--
--  The reply status vocabulary becomes:
--    new → triaged → drafted → approved_pending_send → sent | ignored
--  'answered' is retained as a legacy value on rows written before 0059 and is never
--  written again. NO CHECK CONSTRAINT is added: a CHECK on a populated column can
--  fail on paste, and this file must apply first time.
ALTER TABLE marketing_reply_draft
  ADD COLUMN IF NOT EXISTS sent_asserted_by text,
  ADD COLUMN IF NOT EXISTS sent_asserted_at timestamptz;

COMMENT ON COLUMN marketing_reply_draft.sent_asserted_by IS
  'The named human who asserts they pasted this text into X. AN ASSERTION, NOT AN OBSERVATION — this compartment has no posting path and no way to see X, so it cannot know. Corroborating that a post exists is oEmbed''s job.';

COMMENT ON COLUMN marketing_x_reply.status IS
  'new | triaged | drafted | approved_pending_send | sent | ignored. ''answered'' is a legacy value from before 0059, when approval alone flipped the status and the queue reported customers as answered while nothing had been sent.';
