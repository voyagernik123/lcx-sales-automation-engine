-- ──────────────────────────────────────────────
--  0056 — GPS DELIVERY: four columns and one unique index the code substitutes for
--
--  `DELIVERY_SCHEMA_GAPS` (`apps/api/src/gps/deliveryDesk.ts:314`) is a ledger of
--  domain fields with no column behind them, each carrying the substitution the code
--  made and the consequence for the numbers on screen. This file closes the four
--  entries whose `closedBy` is a plain additive column, and adds the unique index the
--  first entry says is missing. Every one is an ALTER on a table 0049 created, so a
--  reader of this file should read 0049_gps_delivery.sql first.
--
--  WHAT EACH ONE FIXES, as an effect and not as a nicety:
--    gps_milestone.milestone_key       + UNIQUE (engagement_id, milestone_key)
--        Today `name` doubles as the derived plan key and there is NO unique index,
--        so two concurrent state writes for the same milestone create two rows and
--        the second is INVISIBLE — the composer keys by name and takes one.
--    gps_deliverable.milestone_key
--        Today every deliverable reports `outsideThePlan`, so the notice "scope
--        delivered that may never have been priced" fires on a healthy engagement and
--        the count is a schema gap being read as a scope finding.
--    gps_deliverable.review_basis
--        The decision "this needed no legal review" is recorded NOWHERE, which is
--        precisely the decision someone asks about later.
--    gps_deliverable.accepted_by
--        accepted_at is stored and the acceptor is not, so the commercial event that
--        lets an invoice be raised is unattributed — on a route that authenticates
--        the acceptor and requires approver authority.
--    gps_disclosure_record.text_sha256
--        A disclosure's verbatim text is stored and there is no digest of it, so
--        "is this row still the words we think it is" needs the whole text moved to be
--        answered, and two rows that should carry identical wording cannot be compared
--        at all.
--
--  ADDITIVE ONLY, AND NOTHING IS BACKFILLED. Every column is NULLABLE with no
--  DEFAULT, and that is the decision rather than the easy path: a default would
--  fabricate a value for every row already on file. A null review_basis means nobody
--  recorded the basis, a null accepted_by means the acceptor was not captured, and the
--  code must keep saying so — the corresponding DELIVERY_SCHEMA_GAPS entries describe
--  what the code substitutes and stay true until the WRITERS are changed, which is a
--  code change in files this migration does not own.
--
--  ══ NO ARTIFACT, ATTACHMENT, LOCATION, URL OR MIME COLUMN IS ADDED HERE ══════
--  Decision D2 — LCX legal/DPO on controller vs processor for a third party's
--  confidential material, the subprocessor chain (Supabase/Render/Cloudflare/
--  OpenRouter), retention and erasure — is UNANSWERED, so the compartment stays
--  physically incapable of holding a client document (0047_gps.sql:26-36).
--
--  `text_sha256` IS A DIGEST OF TEXT WE ALREADY STORE, NOT A REFERENCE TO A FILE.
--  Read that sentence before adding anything beside it. It is computed over
--  `gps_disclosure_record.text_used`, a column that has held the verbatim disclosure
--  since 0050. It is NOT a checksum of an uploaded document, and a size, a mime type
--  or a filename appearing next to it would be three references pretending not to be
--  a file — `intakeLockout.test.ts` deliberately does not fire on `sha256` alone
--  (its docblock says so), which makes the reviewer the control here rather than the
--  regex.
--
--  Idempotent and forward-only: ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT
--  EXISTS throughout, no DROP, no DELETE, no rewrite. Applied BY HAND in the Supabase
--  SQL editor.
-- ──────────────────────────────────────────────

-- ── The milestone key ─────────────────────────────────────────────────────────
--  THE JOIN BETWEEN A DERIVED PLAN AND RECORDED STATE. The plan (title, intent,
--  owner, quoted acceptance criteria) is derived from the offer AS SOLD and never
--  from a stored copy, because a stored copy can disagree with the sale
--  (`deliveryView.ts:250-256`). This column is the key that recorded state is filed
--  under — nothing more, and deliberately NOT a display name.
--  THE LENGTH CHECKS ARE INLINE ON THE ADD COLUMN, and that is deliberate: the
--  re-runnable alternative is DROP CONSTRAINT IF EXISTS followed by ADD CONSTRAINT
--  (the shape 0051 used to widen an enum), and every DROP in a statement pasted into
--  the Supabase SQL editor raises a destructive-operation warning that costs the
--  person applying this a round trip to decide about. `ADD COLUMN IF NOT EXISTS` with
--  an inline CHECK is idempotent as a whole — a second run skips the column and its
--  constraint together — and it contains no DROP at all.
ALTER TABLE gps_milestone   ADD COLUMN IF NOT EXISTS milestone_key text
  CHECK (milestone_key IS NULL OR (length(btrim(milestone_key)) > 0 AND length(milestone_key) <= 80));
ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS milestone_key text
  CHECK (milestone_key IS NULL OR (length(btrim(milestone_key)) > 0 AND length(milestone_key) <= 80));

-- ONE ROW PER (engagement, milestone key). This is the gap's real damage: without
-- it, two genuinely concurrent writes for the same milestone both succeed and the
-- composer silently reads one of them. PARTIAL, so the rows that predate the column
-- (and any row a human types outside the plan) do not collide on NULL — a unique
-- index would not have collided on them anyway, and the WHERE clause says that is
-- intended rather than accidental.
CREATE UNIQUE INDEX IF NOT EXISTS gps_milestone_engagement_key_uniq
  ON gps_milestone (engagement_id, milestone_key)
  WHERE milestone_key IS NOT NULL;

-- Deliverables filed under a plan step — the read that turns `outsideThePlan` from
-- "every row" into an actual scope finding.
CREATE INDEX IF NOT EXISTS gps_deliverable_milestone_key_idx
  ON gps_deliverable (engagement_id, milestone_key)
  WHERE milestone_key IS NOT NULL;


-- ── Why a deliverable did or did not need review, and who accepted it ─────────
--  `review_basis` is the SENTENCE, in the reviewer's words, behind
--  `review_required`: "coordination only, no LCX work product" is the answer to the
--  question that gets asked a year later, and 0049 had nowhere to put it. Free text
--  and capped, for the same reason 0049 capped `external_location_note`: a length cap
--  makes an encoded payload fail loudly instead of arriving quietly.
ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS review_basis text
  CHECK (review_basis IS NULL OR length(review_basis) <= 1000);

--  `accepted_by` is the NAMED HUMAN who accepted, alongside the accepted_at 0049
--  already stores. Text, not an FK: the roster is compiled code (operators.ts). Same
--  honest limit as every attribution in this compartment — self-asserted until
--  per-person credentials exist, and still the record that has to exist.
ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS accepted_by text
  CHECK (accepted_by IS NULL OR (length(btrim(accepted_by)) > 0 AND length(accepted_by) <= 120));

-- NOT ADDED, and stated rather than implied: an acceptance with an acceptor but no
-- date, or vice versa, is not constrained here. 0049 already holds
-- `gps_deliverable_accepted_has_a_date`; tying accepted_by to accepted_at would make
-- every row 0049 accepted BEFORE this column existed violate a new constraint the
-- moment someone touched it, which is a backfill dressed as a check.


-- ── A digest of the disclosure we already store ───────────────────────────────
--  64 lowercase hex characters, or nothing. The pattern is a CLOSED SHAPE rather than
--  a length cap — the distinction `intakeLockout.test.ts` draws about `currency` —
--  so this column cannot become a channel: 64 hex characters is 32 bytes and no
--  document fits in it, whatever anyone intends.
--
--  NULLABLE AND NEVER BACKFILLED. Computing digests for the rows already on file
--  would need an UPDATE, and gps_disclosure_record is APPEND-ONLY, enforced by the
--  trigger 0050 installed (`trg_gps_disclosure_record_no_update`) — so the backfill
--  would not merely be undesirable, it would RAISE. A null digest means the row
--  predates the column, which is the truth and is what any reader must treat it as.
ALTER TABLE gps_disclosure_record ADD COLUMN IF NOT EXISTS text_sha256 text
  CONSTRAINT gps_disclosure_record_sha_is_a_digest
  CHECK (text_sha256 IS NULL OR text_sha256 ~ '^[0-9a-f]{64}$');

-- "Who else was told exactly these words" — the read the day a template turns out to
-- have been wrong. Partial, because a row with no digest cannot answer it.
CREATE INDEX IF NOT EXISTS gps_disclosure_record_sha_idx
  ON gps_disclosure_record (text_sha256)
  WHERE text_sha256 IS NOT NULL;


-- ── What `\d+` tells the next person ──────────────────────────────────────────
COMMENT ON COLUMN gps_milestone.milestone_key IS
  'The DERIVED PLAN KEY this recorded state is filed under (e.g. inputs_received), not a display name — the title, intent, owner and acceptance criteria come from the plan derived off the offer as sold, never from a stored copy. UNIQUE per engagement where non-null: without that, two concurrent writes for one milestone create two rows and the composer silently reads one. See 0056_gps_delivery_gaps.sql.';

COMMENT ON COLUMN gps_deliverable.review_basis IS
  'WHY THIS DID OR DID NOT NEED REVIEW, in the reviewer''s words. NULL means nobody recorded a basis — it does not mean review was unnecessary, and the delivery surface must keep saying so until a writer supplies it.';

COMMENT ON COLUMN gps_deliverable.accepted_by IS
  'The NAMED HUMAN who accepted, alongside accepted_at. Text, not an FK: the roster is compiled code. Self-asserted until per-person credentials exist, and still the record that has to exist — acceptance is the commercial event an invoice rests on.';

COMMENT ON COLUMN gps_disclosure_record.text_sha256 IS
  'sha256 of text_used, 64 lowercase hex. A DIGEST OF TEXT ALREADY STORED IN THIS TABLE — not a checksum of an uploaded document, and nothing in GPS accepts one. NULL means the row predates this column: gps_disclosure_record is append-only by trigger, so there is no backfill and never will be.';
