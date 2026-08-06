-- ──────────────────────────────────────────────
--  0070 — THE SEAL. `audit_log` becomes what six files already call it.
--
--  WHAT WAS FALSE. `0000_equal_beyonder.sql:1-9` creates `audit_log` as seven
--  columns with no constraints: no chain, no append-only guarantee, nothing that
--  stops an UPDATE or a DELETE. `0029_spine.sql:6` nonetheless refers to it in
--  prose as "the hash-chained audit_log", and so do
--  `actions/registry.ts:5`, `gps/actions.ts:10`, `intel/actions.ts:77`,
--  `gps/loop.ts:480`, `gps/deliveryDesk.ts:881`, `db/schema.ts:651`,
--  `packages/shared/src/actions.ts:5` and `web/src/pages/PracticeRange.tsx:292`.
--  The ONLY chain that existed anywhere was `web/src/stores/useAuditStore.ts` —
--  browser-local, user-clearable, and a 64-bit non-cryptographic mixer.
--  `web/src/lib/readPolicy.ts:19-20` is the one place that already said so.
--
--  WHAT THIS DOES. Three controls, in the database, not by convention:
--
--   1. A REAL CHAIN. Every row inserted from now on carries
--        row_digest = sha256( canonical_content || RS || prev_digest )
--      where prev_digest is the row_digest of the previous sealed row (or the
--      named genesis constant for the first). SHA-256 is Postgres 11+ built-in
--      (`sha256(bytea)`) — NO pgcrypto dependency, because an extension the
--      production database does not have is a migration that fails at 3am.
--
--   2. APPEND-ONLY, ENFORCED. A BEFORE UPDATE OR DELETE trigger that RAISES, and
--      a BEFORE TRUNCATE trigger that RAISES. A comment asking people not to
--      update a row is not a control.
--
--   3. A NAMED BOUNDARY. `audit_seal_state` records the instant sealing began,
--      how many rows predate it, and which row is the last unsealed one — AND IS
--      ITSELF IMMUTABLE, by the same three triggers. The first draft protected the
--      DATA and left the METADATA THE VERDICT DEPENDS ON fully mutable: one
--      `UPDATE audit_seal_state SET pre_seal_rows = 0` (nothing refused it) turned
--      "2 rows predate the seal and are unverifiable" into "no unsealed rows" while
--      the two rows sat in the table. `access/seal.ts` no longer trusts this row
--      either — it counts `seal_seq IS NULL` live and reports any divergence under
--      AUDIT_SEAL_UNSEALED_ROWS_PRESENT / AUDIT_SEAL_UNSEALED_COUNT_DIVERGED. Both
--      halves are needed: the trigger stops the edit, the live count means the
--      report does not depend on the trigger having been there all along.
--
--  WHAT THIS DELIBERATELY DOES NOT DO: RETRO-SEAL. Every row written before this
--  migration has no digest and cannot honestly acquire one — computing a digest
--  now over content that was mutable for months would assert an integrity that
--  was never held, and would produce a chain that LOOKS verified back to 2026-06.
--  Those rows stay `seal_seq IS NULL` and `access/seal.ts` reports them as a
--  THIRD state (`AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE`), never as intact and never as
--  broken.
--
--  0029_spine.sql CANNOT BE FIXED. It is byte-pinned in `db/migrationLedger.ts`
--  and CI fails on any edit, so its "the hash-chained audit_log" line stays wrong
--  in the file forever. From the moment this migration is APPLIED the claim
--  becomes true of the sealed region, which is the only repair available.
--
--  ══ APPLYING THIS BREAKS ONE TEST, ON PURPOSE ══
--  `routes/__tests__/intel100x.test.ts:49` cleans up with
--  `DELETE FROM audit_log WHERE entity_id = ...`. Trigger (2) refuses it. That
--  file is owned by another lane; the DELETE must go before 0070 is applied. It
--  was NOT weakened here — a bypass a test can set is a bypass an attacker can
--  set, and the whole point of this file is that the control is not optional.
--
--  ZERO DROP / DELETE / TRUNCATE of data. Three columns, one sequence, one index,
--  one state table, six functions, five triggers. Idempotent. RLS on the new
--  table (the API's postgres owner bypasses), matching 0042.
-- ──────────────────────────────────────────────

-- ── The chain columns. All three are NULL on every pre-existing row, and that
-- ── NULL is the load-bearing signal: it means "this row predates the seal".
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seal_seq    bigint;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_digest text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS row_digest  text;

COMMENT ON COLUMN audit_log.seal_seq IS
  'Chain position. NULL means the row predates 0070 and is NOT covered by the seal.';
COMMENT ON COLUMN audit_log.prev_digest IS
  'row_digest of the preceding sealed row, or the genesis constant for the first.';
COMMENT ON COLUMN audit_log.row_digest IS
  'sha256(canonical_content || RS || prev_digest). See audit_seal_content().';

-- The chain order. A sequence, NOT created_at: `now()` is transaction-start time,
-- so two concurrent transactions can share a timestamp to the microsecond and a
-- chain ordered by it would have no defined order at exactly the point where the
-- ordering matters.
CREATE SEQUENCE IF NOT EXISTS audit_log_seal_seq AS bigint START 1;

-- Partial + unique: the tail lookup in the insert trigger is one index descent,
-- and two rows can never claim the same chain position. Pre-seal rows (NULL) are
-- outside the index entirely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_seal_seq
  ON audit_log (seal_seq) WHERE seal_seq IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
--  THE CANONICAL SERIALISATION. Defined here, explicitly, and mirrored in
--  `access/seal.ts` (AUDIT_SEAL_CANON_VERSION / canonicalAuditContent).
--
--  A chain over an unstable serialisation is theatre: if the same row can produce
--  two different strings, "the digest does not match" stops meaning "tampered"
--  and the verifier becomes noise everybody learns to ignore. So:
--
--   · FIELD ORDER IS FIXED and written out, not derived from the column order —
--     an `ALTER TABLE ... ADD COLUMN` must not silently change every digest.
--   · EVERY FIELD IS LENGTH-PREFIXED (`octet_length:value`). Without it,
--     actor='a', action='bc' and actor='ab', action='c' serialise identically,
--     and an attacker who controls two adjacent fields can move a boundary
--     without changing the digest.
--   · NULL AND EMPTY STRING ARE DIFFERENT. NULL is `-1:`, '' is `0:`. `entity`
--     and `entity_id` are nullable and the difference is real.
--   · jsonb IS WALKED, NOT CAST. `meta::text` relies on jsonb's internal key
--     order (length-then-bytewise), which is an implementation detail of the
--     server version. Keys are sorted `COLLATE "C"` here so the ordering is a
--     property of THIS definition and survives a major-version upgrade.
--   · TIMESTAMPS ARE ISO-8601 UTC AT MICROSECOND PRECISION, formatted, never
--     locale- or TimeZone-dependent.
-- ══════════════════════════════════════════════════════════════════════════════

-- Canonical jsonb. Objects: {"k":v,...} with keys sorted C-collation. Arrays keep
-- their order (order is meaning in a JSON array). Scalars use jsonb's own scalar
-- text, which is deterministic for a given value.
CREATE OR REPLACE FUNCTION audit_seal_canon_json(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $fn$
DECLARE
  k     text;
  el    jsonb;
  parts text[] := ARRAY[]::text[];
BEGIN
  CASE jsonb_typeof(v)
    WHEN 'object' THEN
      FOR k IN SELECT key FROM jsonb_object_keys(v) AS t(key) ORDER BY key COLLATE "C" LOOP
        parts := parts || (to_jsonb(k)::text || ':' || audit_seal_canon_json(v -> k));
      END LOOP;
      RETURN '{' || array_to_string(parts, ',') || '}';
    WHEN 'array' THEN
      FOR el IN SELECT value FROM jsonb_array_elements(v) AS t(value) LOOP
        parts := parts || audit_seal_canon_json(el);
      END LOOP;
      RETURN '[' || array_to_string(parts, ',') || ']';
    ELSE
      RETURN v::text;
  END CASE;
END;
$fn$;

-- One field, length-prefixed. NOT STRICT: a STRICT function returns NULL for a
-- NULL argument, which would make the whole content string NULL and every digest
-- NULL — i.e. the seal would silently switch itself off for any row with a NULL
-- `entity`. That is most of them.
CREATE OR REPLACE FUNCTION audit_seal_field(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN v IS NULL THEN '-1:' ELSE octet_length(v)::text || ':' || v END
$fn$;

-- The canonical content of one audit row. Record-separator (U+001E) delimited,
-- version-tagged first so a future v2 cannot be confused with a v1 digest.
CREATE OR REPLACE FUNCTION audit_seal_content(
  p_id         uuid,
  p_actor      text,
  p_action     text,
  p_entity     text,
  p_entity_id  text,
  p_meta       jsonb,
  p_created_at timestamptz
) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT 'lcx-audit-seal-v1'
      || E'\x1e' || audit_seal_field(p_id::text)
      || E'\x1e' || audit_seal_field(p_actor)
      || E'\x1e' || audit_seal_field(p_action)
      || E'\x1e' || audit_seal_field(p_entity)
      || E'\x1e' || audit_seal_field(p_entity_id)
      || E'\x1e' || audit_seal_field(audit_seal_canon_json(p_meta))
      || E'\x1e' || audit_seal_field(
           to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$fn$;

CREATE OR REPLACE FUNCTION audit_seal_digest(p_content text, p_prev text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT encode(sha256(convert_to(p_content || E'\x1e' || p_prev, 'UTF8')), 'hex')
$fn$;

-- ══════════════════════════════════════════════════════════════════════════════
--  THE BOUNDARY. One row, recorded BEFORE the insert trigger exists, so it
--  describes the log as it was at the instant of sealing and can never be
--  confused by rows the trigger goes on to seal.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_seal_state (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sealed_from     timestamptz NOT NULL,
  canon_version   text        NOT NULL,
  genesis_digest  text        NOT NULL,
  pre_seal_rows   bigint      NOT NULL,
  boundary_row_id uuid,                    -- NULL only if audit_log was empty
  boundary_row_at timestamptz,
  note            text        NOT NULL
);

INSERT INTO audit_seal_state (
  id, sealed_from, canon_version, genesis_digest,
  pre_seal_rows, boundary_row_id, boundary_row_at, note
)
SELECT
  1,
  now(),
  'lcx-audit-seal-v1',
  -- sha256('lcx.audit_log/seal/v1/genesis'). A named constant rather than 64
  -- zeros, so a chain rooted here cannot be confused with one rooted anywhere
  -- else, and the root is reproducible by anyone from the string alone.
  'b2dd1adc4b93df88adaefee9df5adbafd1048d2f898d56279b09ac686d07281a',
  (SELECT count(*) FROM audit_log WHERE seal_seq IS NULL),
  (SELECT id FROM audit_log WHERE seal_seq IS NULL ORDER BY created_at DESC, id DESC LIMIT 1),
  (SELECT max(created_at) FROM audit_log WHERE seal_seq IS NULL),
  'Rows created before sealed_from carry no digest and were NOT retro-sealed: '
  || 'they were mutable and unchained for their whole life, so a digest computed '
  || 'now would assert an integrity that was never held. They are reported as '
  || 'AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE — neither intact nor broken.'
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE audit_seal_state IS
  'The audit seal boundary: when the chain began and what predates it (0070).';

-- ══════════════════════════════════════════════════════════════════════════════
--  THE TRIGGERS.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_seal_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_prev text;
BEGIN
  /*
   * SERIALISE THE APPEND. Two concurrent transactions that both read the same
   * tail would both write prev_digest = X and the chain would FORK — two rows
   * claiming the same predecessor, which a verifier can only report as broken
   * even though nobody tampered with anything. The unique index on seal_seq
   * stops the duplicate position; it does not stop the fork, because nextval()
   * is non-transactional and hands out two different numbers happily.
   *
   * The lock is held to transaction end, so audit appends are serialised. That
   * is a real throughput ceiling and it is the correct trade for this table:
   * this desk writes single-digit audit rows per action, and a chain that is
   * occasionally forked is not a chain.
   *
   * ══ THE LOCK-ORDER INVARIANT THIS INTRODUCES, AND THE ENUMERATION IT RESTS ON ══
   * Inside an explicit transaction, this lock is now taken by an INSERT that used
   * to take nothing. An earlier draft of this comment claimed "today exactly one
   * place audits inside a transaction — gps/service.ts:768". THAT WAS FALSE, and it
   * was the whole basis of the safety argument, so here is the enumeration that was
   * never done. `grep -l 'INSERT INTO audit_log|schema.auditLog'` over apps/api/src
   * at this commit, keeping the sites inside an explicit BEGIN / db.transaction:
   *
   *   · gps/service.ts:768          BEGIN → gps_engagement FOR UPDATE → audit.   OK
   *   · marketing/service.ts:816    BEGIN(:790) → UPDATE marketing_reply_draft →
   *                                 UPDATE marketing_x_reply → audit.            OK
   *   · marketing/service.ts:896    BEGIN(:875) → UPDATE draft → UPDATE reply →
   *                                 audit.                                        OK
   *   · outreach/handoffs.ts:348    tx → UPDATE handoffs → INSERT handoff_events →
   *                                 audit.                                        OK
   *   · routes/deals.ts:519,:524    db.transaction(:510) → UPDATE projects →
   *                                 UPDATE deals → INSERT deal_events → AUDIT →
   *                                 … → SAVEPOINT INSERT INTO decisions (:568).
   *                                 INVERTED: the audit lock is acquired and then
   *                                 held across further domain writes.
   *
   * So four of the five satisfy DOMAIN WRITES → AUDIT ADVISORY LOCK. `deals.ts`
   * does not: it holds this lock while inserting into `decisions` and while doing
   * the rest of that transaction's work. That is survivable today for a stated
   * reason rather than by luck — `decisions` (0039_operating_system.sql:18) has no
   * foreign keys, so its INSERT takes no row lock any other transaction here
   * competes for, and no enumerated site locks a `decisions` row and then appends
   * to audit_log. It is NOT a general guarantee: a new transaction that touches a
   * row deals.ts writes after :519 and then audits would deadlock against it.
   *
   * IF YOU ARE WRITING ONE: take the domain locks first, and audit LAST. This
   * invariant is documented and NOT enforced by a test or a lint — the enumeration
   * above is a snapshot of one commit, and the failure mode is that somebody adds
   * the sixth site without redoing it. Autocommit inserts (`middleware/purpose.ts`,
   * `middleware/workspace.ts`, `invokeAction`) are unaffected — the lock is
   * released at the end of their implicit transaction, immediately.
   */
  PERFORM pg_advisory_xact_lock(hashtext('lcx.audit_log.seal.v1'));

  SELECT row_digest INTO v_prev
    FROM audit_log
   WHERE seal_seq IS NOT NULL
   ORDER BY seal_seq DESC
   LIMIT 1;

  -- First sealed row roots at the genesis constant. Inlined rather than read from
  -- audit_seal_state: if that row were ever missing, reading it would make every
  -- audit write fail, and an audit table that refuses writes is worse than one
  -- with a stated boundary gap.
  IF v_prev IS NULL THEN
    v_prev := 'b2dd1adc4b93df88adaefee9df5adbafd1048d2f898d56279b09ac686d07281a';
  END IF;

  NEW.id         := COALESCE(NEW.id, gen_random_uuid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.seal_seq    := nextval('audit_log_seal_seq');
  NEW.prev_digest := v_prev;
  NEW.row_digest  := audit_seal_digest(
    audit_seal_content(NEW.id, NEW.actor, NEW.action, NEW.entity, NEW.entity_id,
                       NEW.meta, NEW.created_at),
    v_prev);
  RETURN NEW;
END;
$fn$;

-- Append-only. The stable code AUDIT_SEAL_APPEND_ONLY is in the message text
-- because that is what `access/seal.ts` and its tests match on; SQLSTATE 42501
-- (insufficient_privilege) is used so generic pg error handling treats it as the
-- permission refusal it is rather than an internal error.
CREATE OR REPLACE FUNCTION audit_seal_forbid_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'AUDIT_SEAL_APPEND_ONLY: audit_log is append-only; % on row % is refused',
    TG_OP, OLD.id
  USING ERRCODE = '42501',
        HINT = 'Correct an audit row by APPENDING a correcting row. Editing or '
            || 'deleting one breaks the hash chain and destroys the evidence the '
            || 'rest of this platform''s honesty claims rest on.';
  RETURN NULL;
END;
$fn$;

-- Separate function: OLD is unassigned in a statement-level trigger, so the row
-- version above would fail with "record old is not assigned yet" and the refusal
-- would arrive as a PL/pgSQL bug rather than as this control.
CREATE OR REPLACE FUNCTION audit_seal_forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'AUDIT_SEAL_APPEND_ONLY: audit_log is append-only; TRUNCATE is refused'
  USING ERRCODE = '42501';
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_audit_seal_insert ON audit_log;
CREATE TRIGGER trg_audit_seal_insert
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_seal_before_insert();

DROP TRIGGER IF EXISTS trg_audit_seal_append_only ON audit_log;
CREATE TRIGGER trg_audit_seal_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_seal_forbid_row_mutation();

DROP TRIGGER IF EXISTS trg_audit_seal_no_truncate ON audit_log;
CREATE TRIGGER trg_audit_seal_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_seal_forbid_truncate();

-- ══════════════════════════════════════════════════════════════════════════════
--  THE BOUNDARY RECORD IS IMMUTABLE TOO.
--
--  Protecting the rows and leaving the row that DESCRIBES them editable is not a
--  control, it is a control-shaped object. `pre_seal_rows`, `genesis_digest` and
--  `canon_version` are all surfaced as fact by `access/seal.ts`, and one UPDATE of
--  the first erased the entire pre-seal segment from the report while the unsealed
--  rows stayed in the table.
--
--  A separate function from the audit_log one only because the message names the
--  table; the code token and SQLSTATE are identical, so `isAppendOnlyRefusal()`
--  recognises both without change. The INSERT above is unaffected (this is
--  UPDATE/DELETE/TRUNCATE only) and re-running the migration is still safe:
--  `ON CONFLICT (id) DO NOTHING` performs no UPDATE.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION audit_seal_state_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'AUDIT_SEAL_APPEND_ONLY: audit_seal_state is the seal boundary and is immutable; % is refused',
    TG_OP
  USING ERRCODE = '42501',
        HINT = 'The boundary is what the verifier cites when it refuses to speak for '
            || 'the pre-seal rows. Editing it does not change the rows; it only makes '
            || 'the report lie about them.';
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_audit_seal_state_immutable ON audit_seal_state;
CREATE TRIGGER trg_audit_seal_state_immutable
  BEFORE UPDATE OR DELETE ON audit_seal_state
  FOR EACH ROW EXECUTE FUNCTION audit_seal_state_forbid_mutation();

DROP TRIGGER IF EXISTS trg_audit_seal_state_no_truncate ON audit_seal_state;
CREATE TRIGGER trg_audit_seal_state_no_truncate
  BEFORE TRUNCATE ON audit_seal_state
  FOR EACH STATEMENT EXECUTE FUNCTION audit_seal_state_forbid_mutation();

ALTER TABLE audit_seal_state ENABLE ROW LEVEL SECURITY;
