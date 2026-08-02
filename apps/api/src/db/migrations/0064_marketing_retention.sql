-- ═══════════════════════════════════════════════════════════════════════════════
--  0064 — MARKETING RETENTION. The clock, and the evidence that it ran.
-- ═══════════════════════════════════════════════════════════════════════════════
--
--  NEEDS APPLYING BY HAND. Nothing in this file takes effect until a human pastes
--  it into the Supabase SQL editor. Until then `isRetentionMigrated` returns false,
--  `runRetentionClock` REFUSES to delete anything, and `GET /v1/marketing/retention`
--  reports that whether retention has ever run cannot be answered here.
--
--  WHY THIS MIGRATION EXISTS — the defect, not the feature.
--
--  0046 gives every inbound row a 90-day `retention_expires_at` and `sweepExpired`
--  deletes on it. That half runs today, on the ingest tick. 0061 designs the other
--  half: LCX's own cleared statements on a five-to-seven year clock in
--  `marketing_record`. Nothing ever called `writeRecord`, so `marketing_record` is
--  empty on every environment, and `sweepExpiredRecords` had no caller either.
--
--  So the operating behaviour of the compartment before this file was: on day 91
--  the third-party row is destroyed, the LCX side was never written, and the record
--  MiCA wants for five years is gone. Not "retention is partly wired" — retention
--  deleted everything and kept nothing. This migration gives the clock the two
--  things it needs to be a clock: somewhere to record that it ran, and somewhere to
--  record that a row was held rather than destroyed.
--
--  THE SPLIT THIS IMPLEMENTS IS A STATED DEFAULT, NOT A RULING.
--    · LCX's own statements  → `marketing_record`, five years (Art 68(9) inferred,
--                              extendable to seven on a competent authority's
--                              request), swept only when no legal hold stands.
--    · Third-party content   → `marketing_x_reply`, 90 days, DELETED outright when
--                              nothing of LCX's depends on it, and MINIMISED to a
--                              hash when something does.
--  THE OWNER STILL OWES A DPO RULING on whether LCX statements may be retained past
--  the 90-day sweep and whether a minimised excerpt of the message they answered may
--  be kept with them. See `RETENTION_DPO_RULING_OUTSTANDING` in
--  `apps/api/src/marketing/record.ts`, returned in every retention payload.
--
--  THE FIVE-TO-SEVEN YEARS IS AN INFERENCE, NOT A CITATION. MiCA sets no express
--  retention period for a CASP's marketing communications; the period is read off
--  Art 68(9) (CASP records, which reach marketing by function) together with Art
--  88(1). Anything shorter is indefensible, but it remains an inference, and
--  `RETENTION_INFERENCE_CAVEAT` is printed wherever the number appears.
--
--  ── HOW ART 17 ERASURE AND THE MiCA RECORD ARE RECONCILED ──
--  By whose words they are, and the difficulty is genuinely in one case only.
--    · The stranger's words go. Their inbound rows are deleted, drafts cascade
--      (0046), and any excerpt of their message inside an LCX record is NULLed and
--      stamped `context_minimised_at` (0061).
--    · LCX's own cleared statements stay, under Art 17(3)(b) — processing necessary
--      for compliance with a legal obligation — and the count and the exemption are
--      REPORTED to the data subject. Silently keeping them would be the violation.
--    · What crosses the boundary is a sha256, not text: `body_hash` below and
--      `inbound_context_hash` in 0061. A later paste-back can be proved identical
--      without holding a stranger's words for five years.
--    · THE COLLISION CASE: an inbound row that an approved LCX statement depends on
--      and that nobody has recorded. Deleting it destroys the MiCA record; keeping
--      it whole breaches minimisation. It is held with its BODY MINIMISED and
--      `retention_hold_reason` stated, it appears in the jeopardy list until
--      resolved, and past the grace period the system escalates rather than
--      persisting — "retained for compliance" with no end date is exactly what
--      storage limitation forbids.
--
--  ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──
--   · NO DROP, NO DELETE, NO TRUNCATE, NO ALTER COLUMN TYPE. Every statement is
--     additive and re-runnable. A human pastes this by hand, possibly twice, and a
--     migration that deleted rows would erase evidence the moment somebody ran it
--     to "set things up".
--   · It does not change 0046's 90-day period. That number is the DPO's to set.
--   · It does not shorten `marketing_record`'s five-year floor. 0061 expresses that
--     as a CHECK constraint precisely so a later change cannot quietly move it.
--   · It stores no credential, no token, no session, and no path that posts to X.
--   · It adds no column holding a stranger's words. `body_hash` is a digest;
--     `retention_hold_reason` is LCX's own sentence about LCX's own decision.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ══ 1. THE RUN LEDGER ═════════════════════════════════════════════════════════
--  A retention duty you cannot evidence you honoured is a duty you have not
--  honoured. That is the argument 0061 makes for logging an erasure, and it applies
--  with more force to a sweep: an erasure leaves a log row, a sweep leaves NOTHING
--  — the rows it acted on are gone, so there is no artefact to inspect afterwards
--  and no way to tell "retention ran and there was nothing due" from "retention has
--  never run".
--
--  So the ledger is the gate, not a nicety: `runRetentionClock` refuses to delete a
--  single row on an environment where this table does not exist.
--
--  `mode` distinguishes a look from an act. A dry run writes a row too — knowing
--  somebody checked, and when, is worth recording — with NULL counts, because a dry
--  run deleted nothing and a 0 would read as "nothing was due".
CREATE TABLE IF NOT EXISTS marketing_retention_run (
  id                          bigserial PRIMARY KEY,

  -- Supplied by the caller, never `now()`: the same inputs must produce the same
  -- report, and a test that cannot fix the clock cannot assert on the boundary.
  ran_at                      timestamptz NOT NULL,

  -- A named human, or a named scheduled job. Never blank — the engine refuses
  -- RETENTION_ACTOR_UNNAMED before it reaches this table.
  ran_by                      text NOT NULL,
  CONSTRAINT marketing_retention_run_attributed CHECK (btrim(ran_by) <> ''),

  mode                        text NOT NULL,
  CONSTRAINT marketing_retention_run_mode_known CHECK (mode IN ('dry_run', 'enforce')),

  -- NULLABLE ON PURPOSE, all four. NULL means "this run did not do that part" —
  -- a dry run, or an enforcing run on an environment where 0061 is absent so the
  -- long clock could not execute. A 0 here means it ran and found nothing due.
  -- Collapsing the two would make the ledger unable to answer the one question it
  -- exists for.
  third_party_rows_deleted    integer,
  third_party_rows_minimised  integer,
  record_rows_expired         integer,

  -- Rows HELD rather than deleted because an approved LCX statement on each is not
  -- yet in `marketing_record`. A non-zero value here is a standing finding, not a
  -- statistic: it is the count of MiCA records that are one sweep from being lost.
  jeopardy_rows               integer NOT NULL DEFAULT 0,
  CONSTRAINT marketing_retention_run_jeopardy_sane CHECK (jeopardy_rows >= 0),

  -- The refusal codes this run emitted, so the ledger records what the run REFUSED
  -- as well as what it did. A run that deleted nothing because it refused looks
  -- identical to a run with nothing to do unless this column is here.
  refusal_codes               text[] NOT NULL DEFAULT '{}',

  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- "When did retention last actually run?" — the read the posture makes on every
-- request. Partial on `enforce` because a dry run is not evidence that anything was
-- swept, and the staleness check must not be satisfied by somebody looking.
CREATE INDEX IF NOT EXISTS marketing_retention_run_enforced_idx
  ON marketing_retention_run (ran_at DESC) WHERE mode = 'enforce';

CREATE INDEX IF NOT EXISTS marketing_retention_run_at_idx
  ON marketing_retention_run (ran_at DESC);

COMMENT ON TABLE marketing_retention_run IS
  'One row per retention clock run, dry or enforcing. The gate for the sweep: runRetentionClock refuses to delete anything where this table is absent, because an unrecorded deletion is indistinguishable from data loss. NULL counts mean that part did not run; 0 means it ran and nothing was due.';
COMMENT ON COLUMN marketing_retention_run.jeopardy_rows IS
  'Inbound rows held rather than deleted because an approved LCX statement on each has no row in marketing_record. Non-zero is a finding: that many MiCA records are one jeopardy-blind sweep away from being destroyed.';


-- ══ 2. THE COLUMNS MINIMISATION NEEDS ═════════════════════════════════════════
--  ADD COLUMN IF NOT EXISTS only. No existing column's type, nullability or default
--  is touched, so this is safe to paste twice and safe to paste on an environment
--  where 0059/0060/0061 have not landed.
--
--  WHY MINIMISE RATHER THAN DELETE, in the one case where the two duties collide:
--  deleting the row destroys the only evidence of what LCX said on it, and keeping
--  the stranger's message whole past its retention period breaches minimisation. The
--  body is therefore replaced by a marker, its sha256 is kept, and the reason for the
--  hold is written down. The stranger's words are gone on schedule; the fact that
--  LCX answered, and the ability to prove a later paste-back is the same text, are
--  not.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS body_hash             text,
  ADD COLUMN IF NOT EXISTS body_minimised_at     timestamptz,
  ADD COLUMN IF NOT EXISTS retention_hold_reason text;

COMMENT ON COLUMN marketing_x_reply.body_hash IS
  'sha256 of the inbound body as received, written when the body is minimised. Lets a later paste-back be proved identical without retaining a stranger''s words. NULL means the body has never been minimised — it is not a hash of nothing.';
COMMENT ON COLUMN marketing_x_reply.body_minimised_at IS
  'When the third-party body was replaced by its hash. Distinguishes "we never held this text" from "we held it and minimised it on this date", which are different answers to a data subject and to an authority.';
COMMENT ON COLUMN marketing_x_reply.retention_hold_reason IS
  'Why this row is retained past its stated expiry. Written only for the collision case: an approved LCX statement on this reply is not yet in marketing_record. A hold with no reason is indefinite retention with a compliance label on it.';

-- The row's own retention class, re-declared idempotently.
--
-- 0061 adds this column too, and that is not a mistake here: 0061 is PENDING, and
-- this file must not require it. `IF NOT EXISTS` makes the overlap a no-op in either
-- order, and the alternative — depending on an unapplied migration — is how a
-- hand-applied schema ends up in a state no file describes.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS retention_class text;


-- ══ 3. THE INDEXES THE JEOPARDY READ AND THE GDPR PATHS NEED ══════════════════
--  The jeopardy query joins `marketing_reply_draft` on `reply_id` filtered to
--  approved, and 0046 indexed `reply_id` alone. The partial index is the one that
--  matters: approved drafts are a small fraction of the table and this read runs on
--  every retention posture request.
CREATE INDEX IF NOT EXISTS marketing_reply_draft_approved_idx
  ON marketing_reply_draft (reply_id) WHERE status = 'approved';

--  GDPR Art 15 and Art 17 both look a handle up, and 0046 indexed status, retention,
--  post id and parse_failed — everything the desk reads and nothing a data subject
--  needs. Re-declared here for the same reason as `retention_class` above: 0061 has
--  it, 0061 is pending, and an erasure path that table-scans is one that gets done by
--  hand in a SQL console with no record that it happened.
--
--  `lower(author_handle)`: X handles are case-insensitive, so an index on the raw
--  column would let `@LCXFan` survive a request from `@lcxfan`. Every lookup in
--  `record.ts` lowercases to match.
CREATE INDEX IF NOT EXISTS marketing_x_reply_author_lower_idx
  ON marketing_x_reply (lower(author_handle));

--  The sweep read: rows past expiry, oldest first. 0046 indexed
--  `retention_expires_at`; this adds the composite the held-row exclusion uses so the
--  clock does not scan the whole table to find the few rows it must skip.
CREATE INDEX IF NOT EXISTS marketing_x_reply_retention_held_idx
  ON marketing_x_reply (retention_expires_at) WHERE body_minimised_at IS NOT NULL;


-- ══ 4. THE RECORD-SIDE INDEX, GUARDED ═════════════════════════════════════════
--  `marketing_record` arrives with 0061, which is PENDING. Creating an index on a
--  table that does not exist would abort this whole file for a human pasting it into
--  the SQL editor, so the statement is guarded by a `to_regclass` probe — the same
--  cheap NULL-returning lookup the API's migration gates use, chosen for the same
--  reason: the check itself can never be the thing that errors.
--
--  If 0061 lands after this file, its own `CREATE INDEX IF NOT EXISTS` creates the
--  index and this block was a no-op. Either order works, which is the property a
--  hand-applied schema actually needs.
DO $$
BEGIN
  IF to_regclass('public.marketing_record') IS NOT NULL THEN
    -- The jeopardy anti-join: "is there a record carrying this x_comment_id?"
    CREATE INDEX IF NOT EXISTS marketing_record_comment_idx
      ON marketing_record (x_comment_id);
    -- The long clock's sweep read, skipping held rows.
    CREATE INDEX IF NOT EXISTS marketing_record_retention_idx
      ON marketing_record (retention_expires_at) WHERE legal_hold = false;
  END IF;
END
$$;


-- ══ 5. ROW LEVEL SECURITY ═════════════════════════════════════════════════════
--  Declared here rather than clicked, for the reason 0046 and 0061 both spell out:
--  Supabase exposes `public` tables through its auto-generated REST API, so without
--  RLS anyone holding the project's anon key could read this ledger — which names
--  who ran a deletion, when, and how many rows of a licensed exchange's regulatory
--  record it destroyed.
--
--  RLS enabled with NO policy is deny-all, which is the intent. The API connects as
--  the database owner and bypasses RLS, so nothing legitimate breaks — the same
--  arrangement 0042 relies on and production has proven.
ALTER TABLE marketing_retention_run ENABLE ROW LEVEL SECURITY;
