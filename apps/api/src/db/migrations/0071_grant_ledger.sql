-- ──────────────────────────────────────────────
--  0071 — THE GRANT LEDGER. "Who could see this on date D" becomes answerable.
--
--  WHAT WAS FALSE. `entitlements` (0042) is a CURRENT-STATE table: one row per
--  (member, workspace), and `actions/registry.ts` revoke DELETES it. So the act
--  of revoking destroys the only evidence the grant ever existed. A regulator
--  asking "who could read the GPS compartment on 12 July" gets no answer, and the
--  platform has no way to distinguish "nobody held it" from "we deleted the row".
--  0042 itself deletes two members' rows outright (`0042:69`) and
--  `routes/__tests__/access.test.ts:119` deletes another by hand.
--
--  WHAT THIS DOES. `entitlement_events` — append-only, never deleted, replayed by
--  `access/asOf.ts` to answer entitlement as of any instant.
--
--  WHY THE EVENTS ARE WRITTEN BY A TRIGGER, NOT BY EVERY CALL SITE. There are
--  THREE writers into `entitlements` today: `grant_entitlement`,
--  `decide_access_request` (both `registry.ts`, both `ON CONFLICT DO UPDATE`) and
--  0042's backfill. A fourth arriving without its ledger line would be a silent
--  hole that looks like "nobody was granted anything that week". An AFTER
--  INSERT OR UPDATE trigger on `entitlements` covers all of them, present and
--  future, including a hand-run grant in the Supabase SQL editor.
--
--  REVOKE IS ATTRIBUTED BY THE APPLICATION, WITH A NET UNDERNEATH. `granted_by`
--  is a column, so the trigger can name who granted; there is no `revoked_by`
--  column anywhere, so a DELETE trigger cannot know who did it or why.
--  `registry.ts` therefore inserts the revoke event itself — named actor, the
--  step-up justification — inside the same transaction as the DELETE. The AFTER
--  DELETE trigger fires only when no attributed event was recorded in that
--  transaction, and records `attribution = 'unattributed'`. An out-of-band
--  `DELETE FROM entitlements` in psql therefore still leaves a trace; it just
--  cannot claim to know who was responsible, which is the truth.
--
--  ══ THE GENESIS BACKFILL, AND WHAT REPLAY CANNOT KNOW ══
--  This migration reconstructs one `grant` event per surviving `entitlements`
--  row, carrying that row's real `granted_at` and `granted_by`. For the founding
--  desk those are 0042's backfill rows, so replay reaches back to the 0042
--  instant and can name it.
--
--  THE RECONSTRUCTION IS NOT A HISTORY, and `provenance = 'reconstructed'` says
--  so. It is a photograph of the surviving rows, and it is wrong in BOTH
--  directions for any instant before this migration:
--    · it cannot see a grant that was made and then revoked (row deleted) —
--      replay would UNDER-report;
--    · it cannot see a revocation at all, so a compartment revoked in June looks
--      held continuously — replay would OVER-report.
--  Neither error is conservative, so `access/asOf.ts` REFUSES for any instant
--  before `ledger_floor` rather than interpolating. It never returns an empty
--  holder set for an instant it cannot see: an empty set reads as "they held
--  nothing", which is a different and much worse claim than "we cannot know".
--
--  ZERO DROP / DELETE / TRUNCATE of data. Two new tables, four indexes, three
--  functions, three triggers, and INSERTs derived from existing rows. Idempotent.
--  RLS on both new tables (the API's postgres owner bypasses), matching 0042.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entitlement_events (
  seq           bigint GENERATED ALWAYS AS IDENTITY,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     text NOT NULL,
  workspace     text NOT NULL,
  event         text NOT NULL CHECK (event IN ('grant', 'revoke')),
  -- The capability GRANTED. NULL on a revoke, and the CHECK below makes that a
  -- rule rather than a habit: a revoke with a capability would read as a partial
  -- downgrade, which this system has no concept of.
  capability    text CHECK (capability IN ('view', 'operate', 'approve')),
  actor         text NOT NULL,
  justification text,
  -- WHEN IT HAPPENED vs WHEN WE WROTE IT DOWN. Reconstructed rows carry the
  -- original granted_at in occurred_at and this migration's clock in recorded_at;
  -- collapsing the two would date the whole reconstruction to today and make the
  -- 0042 genesis invisible.
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  -- The transaction that wrote the row. Used by the DELETE net below to tell "the
  -- application already recorded this revocation" from "somebody deleted a row".
  recorded_txid bigint NOT NULL DEFAULT txid_current(),
  provenance    text NOT NULL CHECK (provenance IN ('observed', 'reconstructed')),
  attribution   text NOT NULL CHECK (attribution IN ('named', 'unattributed')),
  CONSTRAINT entitlement_events_capability_matches_event CHECK (
    (event = 'grant'  AND capability IS NOT NULL) OR
    (event = 'revoke' AND capability IS NULL)
  )
);

COMMENT ON TABLE entitlement_events IS
  'Append-only entitlement history (0071). Replayed by access/asOf.ts. Rows with '
  'provenance=reconstructed are a photograph of surviving entitlements rows at the '
  'ledger floor, NOT observed history — see entitlement_ledger_state.';

CREATE INDEX IF NOT EXISTS idx_ent_events_subject
  ON entitlement_events (member_id, workspace, occurred_at DESC, seq DESC);
CREATE INDEX IF NOT EXISTS idx_ent_events_workspace
  ON entitlement_events (workspace, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ent_events_occurred
  ON entitlement_events (occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_events_seq ON entitlement_events (seq);

-- ══════════════════════════════════════════════════════════════════════════════
--  THE FLOOR. One row naming the two instants a replay has to refuse below.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS entitlement_ledger_state (
  id                        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- From here the ledger is COMPLETE: every grant and every revoke is observed.
  ledger_floor              timestamptz NOT NULL,
  -- The earliest occurred_at any reconstructed event carries — in practice the
  -- 0042 genesis backfill. Nothing before this instant exists in any form.
  earliest_reconstructed_at timestamptz,
  reconstructed_events      bigint NOT NULL,
  note                      text NOT NULL
);

COMMENT ON TABLE entitlement_ledger_state IS
  'The entitlement replay boundary (0071): complete from ledger_floor, '
  'reconstruction-only between earliest_reconstructed_at and the floor, nothing '
  'at all before that.';

-- ══════════════════════════════════════════════════════════════════════════════
--  THE TRIGGERS.
-- ══════════════════════════════════════════════════════════════════════════════

-- Append-only, same doctrine as 0070: a history you can edit is not a history.
CREATE OR REPLACE FUNCTION entitlement_events_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'ENTITLEMENT_LEDGER_APPEND_ONLY: entitlement_events is append-only; % is refused',
    TG_OP
  USING ERRCODE = '42501',
        HINT = 'Correct the record by APPENDING an event. The point of this table '
            || 'is that revoking no longer destroys the grant.';
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ent_events_append_only ON entitlement_events;
CREATE TRIGGER trg_ent_events_append_only
  BEFORE UPDATE OR DELETE ON entitlement_events
  FOR EACH ROW EXECUTE FUNCTION entitlement_events_forbid_mutation();

DROP TRIGGER IF EXISTS trg_ent_events_no_truncate ON entitlement_events;
CREATE TRIGGER trg_ent_events_no_truncate
  BEFORE TRUNCATE ON entitlement_events
  FOR EACH STATEMENT EXECUTE FUNCTION entitlement_events_forbid_mutation();

-- Every write into `entitlements` becomes a grant event. Fires on UPDATE too:
-- `ON CONFLICT DO UPDATE SET capability=...` is a capability CHANGE, and a change
-- that left no event would make replay report the old tier forever.
CREATE OR REPLACE FUNCTION entitlements_record_grant() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO entitlement_events (
    member_id, workspace, event, capability, actor, justification,
    occurred_at, provenance, attribution
  ) VALUES (
    NEW.member_id, NEW.workspace, 'grant', NEW.capability,
    NEW.granted_by, NEW.justification,
    -- granted_at is set by the same statement (DEFAULT now() / granted_at=now()),
    -- so this is the grant's own instant rather than the trigger's.
    COALESCE(NEW.granted_at, now()),
    'observed',
    'named'
  );
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_entitlements_record_grant ON entitlements;
CREATE TRIGGER trg_entitlements_record_grant
  AFTER INSERT OR UPDATE ON entitlements
  FOR EACH ROW EXECUTE FUNCTION entitlements_record_grant();

-- The net. `registry.ts` inserts an attributed revoke event and then deletes, in
-- one transaction; this fires afterwards, sees that event, and does nothing. When
-- nothing recorded it — 0042's departed-member cleanup, a hand-run DELETE, a test
-- fixture — it records the revocation with attribution 'unattributed' rather than
-- inventing an actor.
CREATE OR REPLACE FUNCTION entitlements_record_revoke_net() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM entitlement_events
     WHERE member_id = OLD.member_id
       AND workspace = OLD.workspace
       AND event = 'revoke'
       AND recorded_txid = txid_current()
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO entitlement_events (
    member_id, workspace, event, capability, actor, justification,
    occurred_at, provenance, attribution
  ) VALUES (
    OLD.member_id, OLD.workspace, 'revoke', NULL,
    'unattributed:' || session_user,
    'Row deleted from entitlements with no attributed revoke event in the same '
    || 'transaction. The revocation is real; who did it and why is not recorded '
    || 'anywhere, and this row does not pretend otherwise.',
    now(),
    'observed',
    'unattributed'
  );
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_entitlements_record_revoke ON entitlements;
CREATE TRIGGER trg_entitlements_record_revoke
  AFTER DELETE ON entitlements
  FOR EACH ROW EXECUTE FUNCTION entitlements_record_revoke_net();

-- ══════════════════════════════════════════════════════════════════════════════
--  THE GENESIS RECONSTRUCTION. One grant event per surviving entitlements row,
--  carrying its real granted_at/granted_by. Guarded on emptiness rather than
--  ON CONFLICT: the events table has no natural key (that is the point of an
--  append-only log), so re-running this migration must not double the corpus.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO entitlement_events (
  member_id, workspace, event, capability, actor, justification,
  occurred_at, provenance, attribution
)
SELECT
  e.member_id, e.workspace, 'grant', e.capability, e.granted_by,
  COALESCE(e.justification, '(no justification recorded on the 0042-era row)'),
  e.granted_at,
  'reconstructed',
  -- granted_by is NOT NULL in 0042 and carries either a roster id or
  -- 'backfill-0042'; both name a responsible party, so 'named' is honest here.
  'named'
FROM entitlements e
WHERE NOT EXISTS (SELECT 1 FROM entitlement_events);

INSERT INTO entitlement_ledger_state (
  id, ledger_floor, earliest_reconstructed_at, reconstructed_events, note
)
SELECT
  1,
  now(),
  (SELECT min(occurred_at) FROM entitlement_events WHERE provenance = 'reconstructed'),
  (SELECT count(*) FROM entitlement_events WHERE provenance = 'reconstructed'),
  'Complete from ledger_floor. Between earliest_reconstructed_at and the floor '
  || 'only surviving grants are visible: revocations in that window left no trace '
  || '(revoke DELETEd the row) and grants that were already revoked are gone '
  || 'entirely, so a replay there would be wrong in both directions and refuses '
  || 'instead. Before earliest_reconstructed_at nothing exists in any form.'
ON CONFLICT (id) DO NOTHING;

ALTER TABLE entitlement_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_ledger_state ENABLE ROW LEVEL SECURITY;
