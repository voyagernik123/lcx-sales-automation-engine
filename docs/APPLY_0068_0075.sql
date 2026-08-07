-- ==========================================================================
-- LCX --- APPLY MIGRATIONS 0068 THROUGH 0075, IN ONE TRANSACTION
--
-- Generated from the repository at commit e9cec7f.
-- Paste this whole file into the Supabase SQL editor and run it ONCE.
--
-- WHY ONE SCRIPT AND NOT EIGHT PASTES
--   All eight files are transaction-safe: none uses CREATE INDEX CONCURRENTLY.
--   (0069 and 0072 each carry a comment explaining why they deliberately do NOT,
--   exactly so a file stays atomic.) So the batch is wrapped in one BEGIN/COMMIT
--   and is ALL-OR-NOTHING: if any statement fails, nothing is applied.
--
-- THE PART THAT IS EASY TO GET WRONG
--   apps/api/src/db/migrate.ts records every applied file in _migrations
--   (file, checksum), where checksum is the sha256 of that file's exact text, and
--   it re-compares that digest on EVERY later run. Applying the SQL WITHOUT
--   writing those ledger rows would leave the application believing all eight are
--   still pending: the next "npm run migrate" would try to re-apply them and fail
--   on objects that already exist.
--
--   The INSERTs at the foot of this file write those eight rows with the real
--   digests. DO NOT EDIT THE SQL ABOVE THEM. An edit changes the digest, and the
--   runner then throws "was EDITED AFTER IT WAS APPLIED" --- which is a deliberate
--   ratchet, not a bug. If you need a change, ship it as a NEW migration.
--
-- SAFE TO RUN TWICE
--   The guard below aborts with a clear message if ANY of the eight is already
--   recorded, so a second run cannot half-apply anything.
--
-- WHAT THIS TURNS ON --- all of it is already built, tested and CI-green, and all
-- of it is INERT until this runs:
--   0068  listing_labels dedupe key, and stage_changed_at stops being overwritten
--   0069  the audit index that schema.ts DECLARED and never created --- every
--         actor-filtered /v1/audit read is a full table scan until this lands ---
--         plus two partial indexes over control markers that have been written
--         since 2026-07-24 and never read
--   0070  THE SEAL. audit_log becomes hash-chained and append-only BY TRIGGER.
--         Nothing is retro-sealed: rows written before it keep seal_seq NULL and
--         report as AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE --- a third state, neither
--         intact nor broken, because those rows were mutable their whole life.
--         0070 has NO BYPASS on purpose: a switch a test can flip is a switch an
--         attacker can flip. Read F9 in docs/phases/P5_EVIDENCE.md before trusting
--         the chain against anyone holding the database credential itself.
--   0071  entitlement_events --- AS OF, so revoking a grant stops destroying it
--   0072  the verdict-broker join, projects.ticker_norm to asset_symbol
--   0073  ONE MOUTH shadow-mode observation ledger
--   0074  platform_forecast + outcomes, append-only by trigger. A correction is an
--         APPEND; nothing may update a prediction.
--   0075  gps_partner_registry + capability --- F5, attribution ENFORCED by CHECK
--
-- AFTER RUNNING
--   1. The SELECT at the bottom should return exactly 8 rows.
--   2. From the repo run:  npm run migrate -w @lcx/api
--      It must print "already applied" for all eight and apply nothing. That is
--      the real proof the ledger and the schema now agree.
-- ==========================================================================

BEGIN;

-- The runner adds this column on its first run; harmless if already present.
ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum TEXT;

-- ---- GUARD: refuse rather than half-apply ---------------------------------
DO $guard$
DECLARE
  already TEXT;
BEGIN
  SELECT string_agg(file, ', ' ORDER BY file) INTO already
    FROM _migrations
   WHERE file IN ('0068_listing_labels_dedupe.sql', '0069_audit_control_markers.sql', '0070_audit_seal.sql', '0071_grant_ledger.sql', '0072_verdict_broker.sql', '0073_one_mouth_shadow.sql', '0074_platform_forecast.sql', '0075_gps_partner_registry.sql');

  IF already IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORTED - these are already applied: %. Nothing was changed. Apply only the missing files, or ask for a script scoped to them.', already;
  END IF;
END
$guard$;

-- ==========================================================================
-- 0068_listing_labels_dedupe.sql
-- sha256 0230e2db15df3ea348bb94afe7eebb9a3f486c251e47614e00108a82e84d6518
-- ==========================================================================

-- 0068 — listing_labels: stop a unique index from destroying a real contract.
--
-- ══ THE DEFECT ══
-- 0013_propensity.sql:22 created
--
--   CREATE UNIQUE INDEX idx_labels_source_record ON listing_labels (source, record_name);
--
-- with the extractor upserting `ON CONFLICT (source, record_name)`
-- (apps/api/src/labels/extract.ts:131). The key is the COUNTERPARTY'S NAME, so two
-- contracts with the same counterparty are one row. 'Vulcan Forged' appears twice in
-- LCX's closed book and one of those contracts is silently overwritten on every
-- extract run — the second row's fees replace the first's and the first is gone.
--
-- TWO REAL CONTRACTS WITH THE SAME COUNTERPARTY NAME IS A FACT, NOT A DATA ERROR. A
-- counterparty that lists a second token, or renegotiates, or takes a marketing
-- package a year after its listing, is normal commercial behaviour. The schema was
-- asserting it cannot happen, and the assertion was enforced by deletion.
--
-- OF THOSE THREE, THIS MIGRATION FIXES ONE: the second TOKEN. The other two — a
-- renegotiation and a later package on the same token — still collapse, and the reason
-- they cannot be fixed from this data is set out under THE KEY below. Saying "two
-- contracts under one name is a fact" and then keying on something that separates only
-- some of those cases is a partial fix, and it is labelled as one rather than described
-- as a solution.
--
-- The measured consequence, on production 2026-08-06: `source='closed'` reports 36
-- rows. The mark engine (packages/shared/src/marks/mark.ts) refuses below K=5
-- comparables per stratum, so with 36 contracts every single collapsed row moves a
-- stratum toward refusing — the index does not merely lose a record, it suppresses
-- quotes that the book could support.
--
-- 0013 CANNOT BE EDITED. It is applied on production and byte-pinned in
-- apps/api/src/db/migrationLedger.ts; db/__tests__/migrationImmutability.test.ts fails
-- on any edit, correctly. So the fix is delivered here.
--
-- ══ WHAT THIS DOES, AND DOES NOT, DO ══
-- NO DATA IS DROPPED, DELETED OR TRUNCATED. One INDEX is dropped and replaced, which is
-- the only way to change a uniqueness constraint. Adding the generated column rewrites
-- the table's tuples in place (815 rows) and preserves every one of them.
--
-- THIS DOES NOT RECOVER THE ROW ALREADY LOST. The collapsed 'Vulcan Forged' contract
-- was never written; it exists only in the source CSV. After this is applied, the
-- extractor has to be re-run against `data/seeds/LCX Listings - Closed Token
-- Listings.csv` to restore it. Nothing in this file pretends otherwise.
--
-- ══ THE KEY, AND WHY IT IS NOT A CONTENT HASH ══
-- The CSV carries no contract id, so contract identity is not available as a column. The
-- FIRST version of this migration keyed on a content fingerprint —
--   md5(ticker | listing_fee_usd | marketing_fee_usd | liquidity_amount_usd | stage)
-- — and justified it with the sentence "two rows that differ in any of those fields are
-- two facts and must both survive". THAT SENTENCE WAS WRONG, and the wrongness was the
-- whole design:
--
--   A CORRECTED VALUE IS NOT A SECOND CONTRACT. Put the fee columns in the key and a
--   correction becomes a new row. Row exists with listing_fee_usd = 25000; the CSV is
--   corrected to 20000; the fingerprint changes; ON CONFLICT finds no match; INSERT. The
--   closed book then holds BOTH the wrong fee and the right fee for ONE contract, and
--   `loadClosedBook` selects both, the census counts n=2, and both totals enter the
--   sorted array the median is picked from. The same mechanism duplicated every pipeline
--   row whose `stage` advanced. A migration whose stated purpose is to stop the schema
--   destroying contracts would have started fabricating them.
--
-- So the key holds ONLY what distinguishes one contract from another under the same
-- counterparty name, and NONE of the mutable payload: the counterparty's TOKEN. On
-- production the two 'Vulcan Forged' closed rows carry $LAVA and $PYR, so the token is
-- exactly the axis the old index was collapsing. `coalesce(ticker, '')` is IMMUTABLE, so
-- it is legal in a generated expression; a bare `ticker` column could not be used in the
-- key at all, because NULL is not equal to NULL in a unique index and every untickered
-- row would then be admitted repeatedly.
--
-- The fee and stage columns stay OUT of the key and therefore stay live in the
-- extractor's DO UPDATE, which is what makes a correction a correction.
--
-- WHAT THIS STILL DOES NOT DISTINGUISH, stated because the previous version overclaimed:
-- two contracts with the same counterparty AND the same token — a renegotiation, or a
-- marketing package taken a year after the listing — remain one row. That is not solved
-- here and cannot be from this data: nothing in the CSV separates "the same contract
-- re-exported" from "a second contract on the same token", and inventing a discriminator
-- would either duplicate every row on every run or key on the money again. Fixing it
-- needs a contract identifier in the export, which is a CRM change, not a migration.
--
-- `stage_changed_at` is DELIBERATELY NOT in the key, for one reason: casting a
-- timestamptz to text is STABLE, not IMMUTABLE, so Postgres rejects it in a generated
-- expression. (The previous version of this file gave a SECOND reason — "the extractor
-- rewrites that field on every run" — and it is FALSE. `labels/extract.ts:131-140`'s
-- DO UPDATE SET list is project_id, outcome, listing_fee_usd, marketing_fee_usd,
-- liquidity_amount_usd, stage, stage_trail, raw; `stage_changed_at` is absent from it, so
-- on an existing row the field keeps its original value forever and is written on INSERT
-- only. It is stated here because the mark engine derives its ObservationFrame window
-- from exactly that column, and a reader who believed the old sentence would believe
-- close dates on the closed book are being refreshed. They are not.)
--
-- ══ THE CALLER CHANGE THIS REQUIRES — READ BEFORE APPLYING ══
-- `ON CONFLICT (source, record_name)` will fail with SQLSTATE 42P10 ("there is no
-- unique or exclusion constraint matching the ON CONFLICT specification") once the old
-- index is gone. Postgres cannot infer a three-column index from a two-column
-- specification, and there is no key that both admits duplicates and satisfies the old
-- clause — those two requirements are contradictory, which is why this needs a code
-- change and not only a migration.
--
-- BEFORE OR WITH APPLYING THIS, apps/api/src/labels/extract.ts:131 must become
--   ON CONFLICT (source, record_name, contract_discriminator) DO UPDATE SET ...
-- and the existing DO UPDATE SET list is kept AS IT IS — every assignment in it remains
-- meaningful, because none of those columns is in the key. Adding
-- `stage_changed_at = EXCLUDED.stage_changed_at` to that list is worth doing in the same
-- change (see the note above: it is currently never refreshed, and the mark engine's
-- window comes from it), but it is not required for this migration to be safe. That file
-- belongs to another lane and is untouched here.
--
-- Until both land, this migration stays unapplied and the extractor keeps working
-- exactly as it does today. `extract.ts` is a hand-run CLI script, not a served route,
-- so nothing user-facing depends on the ordering.

ALTER TABLE listing_labels
  ADD COLUMN IF NOT EXISTS contract_discriminator TEXT
  GENERATED ALWAYS AS (coalesce(ticker, '')) STORED;

COMMENT ON COLUMN listing_labels.contract_discriminator IS
  'What separates two contracts filed under the same counterparty name: the token. Exists because '
  '(source, record_name) is not unique in reality — two contracts with the same counterparty name is a '
  'fact, and the unique index in 0013 enforced the opposite by overwriting one of them. IT IS NOT A '
  'CONTENT HASH AND MUST NOT BECOME ONE: putting the fee or stage columns in the key would make a '
  'CORRECTED FEE insert a second row, leaving the wrong and the right fee both in the closed book and '
  'both feeding the mark engine''s median. Those columns stay in the extractor''s DO UPDATE instead. '
  'Not derived from stage_changed_at either: that cast is STABLE, not IMMUTABLE, so Postgres rejects it '
  'in a generated expression.';

-- Order matters: create the replacement first, so there is no window in which the
-- table has no uniqueness constraint at all and a concurrent extract run could double
-- every row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_contract
  ON listing_labels (source, record_name, contract_discriminator);

DROP INDEX IF EXISTS idx_labels_source_record;

-- The mark engine reads `source='closed'` and joins to projects. Both columns are
-- already indexed individually (0013:20-21); this composite serves the engine's actual
-- predicate without a second scan.
CREATE INDEX IF NOT EXISTS idx_labels_source_outcome ON listing_labels (source, outcome);

COMMENT ON TABLE listing_labels IS
  'Ground-truth closed and pipeline contracts extracted from LCX''s CRM exports. THE FEE COLUMNS ARE '
  'listing_fee_usd AND marketing_fee_usd. liquidity_amount_usd IS NOT REVENUE — it is capital placed '
  'alongside a market maker, and an earlier pass that summed it reported $816,500 as LCX''s book when '
  'the fee total was $634,500. Never include it in a fee mark.';

-- ==========================================================================
-- 0069_audit_control_markers.sql
-- sha256 a12fabe5ef35125aed1db50a0bc0b8606fa423e43598f7c1d1e76bf4b717be9b
-- ==========================================================================

-- ──────────────────────────────────────────────
--  0069 — THE CONTROL MARKERS BECOME READABLE (LCX OS 100x, P3a)
--
--  WHY. Since 2026-07-24/25 `actions/registry.ts` has stamped six markers onto
--  BOTH `audit_log.meta` AND `object_actions.params` on every governed act:
--    gateDegraded / gateDegradedReason        the control did NOT run
--    overrideSat / overrideGate / overrideReason  it ran, a human accepted the risk
--    idempotencyDegraded / …Reason            the replay guard was not held
--  They are written from three call sites in three compartments (the SAT gate on
--  dec_01/dec_19, the campaign-launch limb, and the GPS discount limb — which is
--  firing on EVERY quote today because PRICE_BANDS_ARE_PLACEHOLDERS is true).
--
--  NOTHING HAS EVER READ THEM. So the audit row for "this decision passed its
--  controls" and the row for "this decision succeeded while its control did not
--  run" are indistinguishable to every reader in the system, including the person
--  signing a board file, a WBR, or a regulator response against it.
--
--  THIS MIGRATION ADDS NO COLUMN AND NO TABLE. The facts are already recorded;
--  they were merely unaffordable to read. It makes the two marker families cheap,
--  and it creates an index the ORM has been claiming for months and never emitted.
--
--  ZERO DROP / DELETE / TRUNCATE / UPDATE. Three CREATE INDEX IF NOT EXISTS and
--  three COMMENTs. Nothing here can lose a row, so no Supabase
--  destructive-operations warning applies.
--
--  NOT `CONCURRENTLY`, DELIBERATELY. `db/migrate.ts` applies a file as one
--  `client.query(sql)` — the simple-query protocol, which Postgres wraps in an
--  implicit transaction — and CREATE INDEX CONCURRENTLY cannot run inside one. It
--  would fail at apply time, not degrade. `audit_log` is small enough today that
--  the brief ACCESS EXCLUSIVE is cheaper than splitting this file into three
--  hand-run statements; if that stops being true, run the three statements below
--  by hand with CONCURRENTLY and record the file as applied.
-- ──────────────────────────────────────────────

-- ── The two marker families, as TWO partial indexes ──────────────────────────
--
-- TWO AND NOT ONE. `access/controlRegister.ts` issues one query per family, each
-- whose WHERE clause matches one predicate below exactly, and merges the two result
-- sets by row id — a row carrying markers from both families comes back from both
-- scans and is deduped there.
--
-- THE FIRST DRAFT OF THIS COMMENT WAS WRONG AND IS CORRECTED RATHER THAN DELETED,
-- because the wrong version is the one a future reader would otherwise re-derive.
-- It claimed a single query asking for all four keys at once "would imply neither of
-- two narrower indexes" and would therefore be a sequential scan. MEASURED ON
-- PostgreSQL 16.14, that is false: the planner splits the four-way OR and does a
-- BitmapOr across BOTH partial indexes. Both forms use the indexes.
--
-- What is actually true, from the two plans:
--   two queries   Index Scan using idx_audit_control_degraded, Index Cond on
--                 created_at, NO sort node — the index's `created_at DESC` order
--                 satisfies the ORDER BY, so LIMIT stops early.
--   one query     Bitmap Heap Scan + BitmapOr + Sort (quicksort). The bitmap loses
--                 index ordering, so every matching row in the window must be
--                 fetched and sorted before LIMIT can apply, and each partial index
--                 is scanned TWICE (once per OR branch it matches).
-- So the two-query form is chosen for ordered, early-terminating reads and not
-- because the alternative cannot use an index. On today's tiny marker counts the
-- difference is microseconds; it matters when the GPS limb has marked a year of
-- quotes.
--
-- `jsonb_exists` (the `?` operator) is IMMUTABLE, which is what makes it legal in
-- an index predicate. Key EXISTENCE is the predicate, not truthiness: `overrideSat`
-- is an optional client-supplied boolean, so `{overrideSat: false}` puts the key in
-- `meta` without an override having happened. The index is therefore a deliberate
-- SUPERSET and the reader evaluates the value. An index that tried to be exact
-- would silently drop rows the moment a new marker spelling arrived.
--
-- WHAT THE SUPERSET COST BEFORE IT WAS UNDERSTOOD, recorded here because the index is
-- where a future reader will look for the reason. `access/controlRegister.ts` COUNTED
-- marked acts with these same key-existence predicates while its row reader narrowed to
-- `=== true`, so one `{"chosen":"Option A","overrideSat":false}` row — reachable from
-- the production command palette — was counted as marked, excluded from the register,
-- and reconciled by nothing. Measured on 16.14 with five real overrides plus that one
-- row: key existence 6, actually overridden 5, and the page could render "MARKED ACTS
-- IN WINDOW · 1" above "NO MARKED ACTS IN THIS WINDOW".
--
-- The counting predicate is now `meta ->> 'k' = 'true'` on all four keys. THESE INDEXES
-- DID NOT NEED TO CHANGE and must not: a partial index whose predicate is a superset of
-- a query's predicate still serves that query — the planner adds a recheck on the heap
-- tuple. Narrowing the index to truthiness would trade a recheck for silently dropping
-- every future marker whose spelling is not `'true'`.
--
-- `created_at DESC` leads because every read of this register is windowed by time
-- and then ranked by consequence in application code, so the ORDER BY comes free.
--
-- `entity, entity_id` follow — the polymorphic subject the review join keys on. NOT
-- claimed as an index-only scan, because it is not one: the register also selects
-- `meta`, `actor` and `action`, so the heap tuple is fetched regardless. Carrying the
-- subject in the index costs two more columns and buys the option of a covering plan
-- for a future count-only read; today it buys nothing measurable and is included on
-- that basis rather than a performance one.

CREATE INDEX IF NOT EXISTS idx_audit_control_degraded
  ON audit_log (created_at DESC, entity, entity_id)
  WHERE meta ? 'gateDegraded' OR meta ? 'idempotencyDegraded';

CREATE INDEX IF NOT EXISTS idx_audit_control_override
  ON audit_log (created_at DESC, entity, entity_id)
  WHERE meta ? 'overrideSat' OR meta ? 'overrideGate';

-- ── The index the ORM declared and never created ─────────────────────────────
--
-- `db/schema.ts` (the auditLog table's index list) contains `index('idx_audit_actor')`
-- WITH NO `.on(...)` CALL. Drizzle emits nothing for a column-less index, so this
-- index has never existed in any environment while the schema file has asserted it
-- for months — which is worse than an absent index, because a reader checking
-- whether the audit log is indexed finds a name and stops looking.
--
-- Consequence today: `/v1/audit?actor=…` (routes/audit.ts) filters on `al.actor`
-- with `ORDER BY al.created_at DESC` and is a FULL SCAN of the compliance trail on
-- every page of every actor-filtered read.
--
-- `(actor, created_at DESC)` and not `(actor)` alone: the route always sorts by
-- created_at, so the two-column form serves the filter and the sort together.
--
-- schema.ts IS NOT EDITED BY THIS PASS — another lane owns that file. Its
-- declaration still needs correcting to `.on(t.actor, t.createdAt)` so the ORM and
-- the database stop disagreeing; until then the index exists but nothing in the
-- TypeScript says which columns it has.
--
-- STILL UNINDEXED, STATED RATHER THAN IMPLIED: the `action` filter on the same
-- route. Serving it needs either a plain `(action, created_at DESC)` btree for the
-- equality form or `text_pattern_ops` for the `action LIKE 'action:%'` prefix form
-- the control register uses for its denominator counts. Which of those is right is
-- a decision about how the audit log is queried, not a side effect of this pass, so
-- it is deliberately left out and the register reports its denominators as a
-- sequential scan rather than pretending otherwise.

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_log (actor, created_at DESC);

COMMENT ON INDEX idx_audit_control_degraded IS
  'Governed acts whose meta carries gateDegraded or idempotencyDegraded — a control '
  'that did NOT run, or a replay guard that was not held. Read by '
  'access/controlRegister.ts. Key EXISTENCE only: the reader evaluates the value, so '
  'this index is a deliberate superset of the rows the register reports.';

COMMENT ON INDEX idx_audit_control_override IS
  'Governed acts whose meta carries overrideSat or overrideGate — a control that ran '
  'and whose blocking finding a human accepted with a recorded reason. Kept SEPARATE '
  'from idx_audit_control_degraded so that each family can be read by a query whose '
  'WHERE clause matches one predicate exactly and is therefore served by an ORDERED '
  'index scan. A single four-way-OR query does use both indexes (measured on PG '
  '16.14) but only via BitmapOr, which loses the ordering and forces a sort.';

COMMENT ON INDEX idx_audit_actor IS
  'Actor-filtered audit reads (routes/audit.ts). Created by 0069 because '
  'db/schema.ts declared index(''idx_audit_actor'') with no .on() columns, which '
  'Drizzle emits as nothing — the name existed in the TypeScript and the index never '
  'existed in any database.';

-- ==========================================================================
-- 0070_audit_seal.sql
-- sha256 3b9d556d9127a7442d33ec65f2c2cc1764c12c0b928722f4d010334e907496ff
-- ==========================================================================

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

-- ==========================================================================
-- 0071_grant_ledger.sql
-- sha256 d24427e6a3f1ebc62f2842a1ae87213a7af01dc1bc652aa0c4f85ae58d3504a6
-- ==========================================================================

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

-- ==========================================================================
-- 0072_verdict_broker.sql
-- sha256 4e922bf300a3235015c430ef241c8095b36c210b97be4459e90a43562dd5fa0f
-- ==========================================================================

-- ──────────────────────────────────────────────
--  0072 — THE VERDICT BROKER'S JOIN, MADE AUDITABLE (LCX OS 100x, F4)
--
--  WHY. `access/verdictBroker.ts` lets one compartment learn THAT another holds
--  something, and its verdict, without reading it. Its first real question is the
--  largest uninsured liability on this platform: is an asset inside the listing
--  perimeter? MiCA Art 88 requires the disclosure of inside information to be its own
--  artefact, Art 90(1) prohibits onward disclosure, and Art 91(3)(c) attaches PERSONAL
--  liability — from roughly EUR 700,000, on the named human, not on the company.
--  Today the control between "sales is negotiating a listing" and "marketing names the
--  asset in public" is a free-text paragraph in a policy.
--
--  THE JOIN IS  projects.ticker_norm  ↔  marketing_asset_embargo.asset_symbol.
--
--  ══ WHAT WAS VERIFIED BEFORE ANYTHING WAS RELIED ON ═════════════════════════
--  THE CHECK ON `asset_symbol` IS ALREADY THERE, so this migration does not add it.
--  0060_marketing_abuse.sql declares, on the column:
--        CHECK (asset_symbol = upper(btrim(asset_symbol))
--               AND length(asset_symbol) BETWEEN 1 AND 20)
--  That was checked in 0060 itself rather than assumed from a comment, because the
--  whole read path depends on it: `access/otherLedger.ts` normalises its subject and
--  then queries for equality, which is only sound if the stored side cannot hold
--  ' SOL' or 'sol'.
--
--  ══ THE HALF THAT IS NOT ENFORCED, AND WHAT THIS FILE DOES ABOUT IT ═════════
--  `projects.ticker_norm` IS DOCUMENTED AS cleanTicker(ticker) AND NOTHING ENFORCES
--  IT. There is no CHECK. A row holding 'sol' or ' SOL' is legal, can never equal any
--  CHECK-normalised asset_symbol, and makes the join return ZERO ROWS — which on a
--  conflict check reads as "this asset is clear". A silent false negative on a
--  personal-liability control is the worst shape a defect can take here: it looks
--  like an answer.
--
--  AND THE GENERATOR ITSELF CAN PRODUCE SUCH A VALUE. `cleanTicker` in
--  apps/api/src/import/types.ts is  trim → strip a leading '$' → toUpperCase, IN THAT
--  ORDER, so cleanTicker('$ sol') is ' SOL': the '$' is removed after the trim and the
--  space it was hiding is never trimmed again. Every writer of ticker_norm
--  (import/resolve.ts, connectors/catalog.ts, connectors/runner.ts,
--  seed/backfill-keys.ts) goes through that function, so every writer can emit it.
--
--  SO THIS MIGRATION DOES NOT ADD A CHECK TO `projects`, DELIBERATELY. A CHECK — even
--  NOT VALID, which skips existing rows — would start REJECTING the catalog and runner
--  inserts the moment one feed carries '$ sol'. Breaking the importer to enforce a
--  join is the wrong trade: the read path already REFUSES a denormalised value under
--  OTHER_LEDGER_TICKER_NOT_NORMALISED and OTHER_LEDGER_TICKER_UNUSABLE rather than
--  querying with it, so the false negative is already closed in code. What was missing
--  is the ability to ask HOW MANY such rows exist, which is the index below. Making
--  `cleanTicker` correct is a change to import/types.ts and is a separate, reviewable
--  edit — not something to smuggle in behind a constraint.
--
--  NO NEW TABLE. NO NEW COLUMN. One partial index and three COMMENTs. Everything the
--  broker needs was already recorded; what was missing was a way to see it.
--
--  ZERO DROP / DELETE / TRUNCATE / UPDATE. Nothing here can lose a row, so no
--  Supabase destructive-operations warning applies.
--
--  NOT `CONCURRENTLY`, for the reason 0069 states: `db/migrate.ts` applies a file as
--  one `client.query(sql)`, which Postgres wraps in an implicit transaction, and
--  CREATE INDEX CONCURRENTLY cannot run inside one. It would fail at apply time rather
--  than degrade. The predicate below is false for every well-formed row, so on a
--  healthy `projects` the index is empty and the build is a single sequential pass.
--
--  WHAT IT COSTS, STATED HONESTLY. Not "one boolean": every INSERT and every UPDATE of
--  `projects` evaluates the predicate, which is a btrim, a regexp_replace, an upper, a
--  length and two comparisons. That is microseconds on a table this size and nothing is
--  written to the index for a well-formed row — but it is more than one boolean, and an
--  earlier draft of this comment said one boolean.
-- ──────────────────────────────────────────────

-- ── The detector: every projects row whose ticker_norm cannot join ────────────
--
-- A PARTIAL INDEX WHOSE PREDICATE IS THE CODE'S REFUSAL SET. It indexes nothing on a
-- database where every ticker_norm is normalised, and it turns "are there rows that
-- would silently miss the embargo join?" from a full sequential scan with a function
-- call per row into an index-only scan that is usually empty.
--
-- ══ THE PREDICATE MIRRORS WHAT THE CODE REFUSES, AND THE FIRST VERSION DID NOT ══
-- The point of this index is that its count answers "how many rows would silently miss
-- this join?", i.e. how many rows `access/otherLedger.ts assetSymbolForProject` REFUSES.
-- If the two disagree, the index under-reports and the number is worse than no number.
-- The first version was `ticker_norm <> upper(btrim(ticker_norm))` and it disagreed in
-- three ways, all in the direction of under-reporting:
--
--   1. btrim VS .trim(). Postgres `btrim(string)` WITH NO SECOND ARGUMENT STRIPS SPACES
--      ONLY. JS `.trim()` strips all whitespace. So a stored 'SOL' || chr(9) (tab) is
--      REFUSED by the code (cleanTicker trims the tab, giving 'SOL' <> the stored value)
--      and the old predicate was FALSE for it — because btrim left the tab alone and
--      upper() of the result equalled the stored value. The set is now explicit.
--      (The same asymmetry means 'SOL'||chr(9) is a LEGAL asset_symbol under 0060's
--      btrim-based CHECK, and no subject this read path can produce will ever equal it,
--      so a genuine embargo on such a symbol reads as `empty`. THAT one is not fixable
--      from here — it is 0060's CHECK — and it is named rather than papered over.)
--
--      AND THE SET ITSELF HAD THE SAME CLASS OF BUG, VERIFIED AGAINST A REAL SERVER.
--      It was written E' \t\n\r\f\v'. Postgres' escape-string syntax defines \b \f \n \r
--      \t and the numeric forms AND NOTHING ELSE: "any other character following a
--      backslash is taken literally", so E'\v' IS THE LETTER v, not U+000B.
--        select length(E' \t\n\r\f\v'), ascii(right(E' \t\n\r\f\v',1));  →  6 | 118
--      That set therefore trimmed a lowercase 'v' and did NOT trim a vertical tab, so a
--      stored 'SOL' || chr(11) — refused by the code, because JS .trim() strips U+000B —
--      was still invisible to this index, which is the exact under-report this section
--      claims to have closed. \x0B is the documented hex form and is 11:
--        select ascii(right(E' \t\n\r\f\x0B',1));                        →  11
--      (No well-formed row was falsely indexed by the old set: a normalised ticker_norm
--      is uppercase, so it cannot contain a lowercase 'v'. The fault was one-directional
--      — under-reporting — which is the direction that matters here.)
--   2. THE LEADING '$'. cleanTicker strips it, so a stored '$SOL' is refused by the code
--      (cleanTicker('$SOL') = 'SOL' <> '$SOL'), while '$SOL' IS its own upper(btrim(...))
--      and was invisible to the old predicate. regexp_replace now mirrors the strip.
--   3. THE LENGTH BOUND. 0060 caps asset_symbol at 20 and the code refuses a longer
--      stored value under OTHER_LEDGER_TICKER_UNUSABLE. The old predicate ignored length.
--
-- So the predicate below is cleanTicker's own definition, in SQL, in cleanTicker's own
-- order (trim → strip a leading '$' → upper), plus 0060's length bound. btrim, upper and
-- regexp_replace are all IMMUTABLE, which is what makes them legal in an index predicate.
--
-- STILL NOT CLOSED, and stated rather than implied: JS `.trim()` also strips non-ASCII
-- whitespace (U+00A0, U+2028, …) and JS `toUpperCase()` and Postgres `upper()` differ for
-- some non-ASCII input (German ß among them). A ticker containing either would be refused
-- by the code and invisible here. No ticker in this book is non-ASCII, so the residual is
-- named and not chased.
--
-- The blank case is EXCLUDED: a ticker_norm that is empty or all whitespace is not a
-- normalisation fault, it is an ABSENT ticker, which `otherLedger.ts` reports as
-- `no_ticker` under OTHER_LEDGER_TICKER_ABSENT — a different state and a different job.
-- Excluded explicitly rather than leaving a reader to wonder which bucket it fell in.
CREATE INDEX IF NOT EXISTS idx_projects_ticker_norm_unjoinable
  ON projects (id)
  WHERE ticker_norm IS NOT NULL
    AND btrim(ticker_norm, E' \t\n\r\f\x0B') <> ''
    AND (length(ticker_norm) > 20
         OR ticker_norm <> upper(regexp_replace(btrim(ticker_norm, E' \t\n\r\f\x0B'), '^\$', '')));

COMMENT ON INDEX idx_projects_ticker_norm_unjoinable IS
  'Rows whose ticker_norm is not its own cleanTicker() output, or is longer than the 20 '
  'characters 0060 allows, and therefore CANNOT equal any '
  'marketing_asset_embargo.asset_symbol. Each such row makes the listing-perimeter join '
  'return zero rows for that project, and zero rows on a conflict check reads as "clear" '
  '— a false negative on a MiCA Art 91(3)(c) personal liability control. THE PREDICATE IS '
  'DELIBERATELY THE SET access/otherLedger.ts REFUSES (codes '
  'OTHER_LEDGER_TICKER_NOT_NORMALISED and OTHER_LEDGER_TICKER_UNUSABLE), so this count '
  'answers "how many rows does the read path refuse?" and not a looser question. Created '
  'by 0072 because nothing could ask. Expected to be EMPTY: if it is not, the listed '
  'projects need re-normalising and the read path refuses them in the meantime rather '
  'than answering. Known producer: cleanTicker(''$ sol'') returns '' SOL'' '
  '(apps/api/src/import/types.ts strips the ''$'' after the trim). NOT covered: non-ASCII '
  'whitespace and non-ASCII case, where JS trim/toUpperCase and Postgres btrim/upper '
  'disagree — refused by code, invisible here.';

COMMENT ON COLUMN projects.ticker_norm IS
  'cleanTicker(ticker). ALSO THE JOIN KEY INTO LCX MARKETING''s market-abuse register: '
  'access/otherLedger.ts joins it to marketing_asset_embargo.asset_symbol to answer, '
  'VERDICT-ONLY, whether an asset sits inside the listing perimeter. That column is '
  'CHECK-enforced to upper(btrim(...)), 1-20 chars (0060); this one is NOT enforced, so '
  'a denormalised value here is a SILENT join miss and not a cosmetic problem. See '
  'idx_projects_ticker_norm_unjoinable.';

COMMENT ON COLUMN marketing_asset_embargo.asset_symbol IS
  'The asset symbol, uppercase-asserted by CHECK (0060). READ CROSS-COMPARTMENT, '
  'VERDICT-ONLY: access/verdictBroker.ts answers whether an entry exists for a symbol, '
  'what it means for the asker, and how many entries are being withheld. It never returns '
  'state, event_ref, source_ref, entered_by or any window — those are the onward '
  'disclosure MiCA Art 90(1) prohibits, and routes/audit.ts withholds this same column '
  'from readers without the marketing compartment for exactly that reason. THE VERDICT '
  'DOES READ `state`: a live in-window entry recording ''clear'', ''announced'' or '
  '''exempt_offer'' is NOT reported as restricted, because three of the four states 0060 '
  'allows are not a block and deriving the verdict from row existence alone published an '
  'inference as a certainty. Whether GPS may ask the question at all is the owner''s '
  'decision and ships DEFAULT-DENY behind GPS_MAY_READ_LISTING_VERDICT; with it unset the '
  'broker returns VERDICT_BROKER_CROSS_READ_NOT_AUTHORISED, never an empty, and an '
  'UNPOPULATED register is NOT-LOADED rather than a genuine absence. Written by two '
  'paths: the governed marketing_embargo_enter action (approver-gated), and '
  'access/otherLedger.ts when a deal reaches ''proposal'' (state ''mnpi_pending'', '
  'event_ref ''deal-proposal:<dealId>''). That second path uses NO ON CONFLICT clause: a '
  '23505 raises and is branched on, per the prohibition in '
  'apps/api/src/marketing/abuseRegister.ts, and a collision with a lifted or a foreign '
  'live entry is a REFUSAL, never a signal reported as in force.';

-- ==========================================================================
-- 0073_one_mouth_shadow.sql
-- sha256 40515bd01a104ba5316714a121f4d80ee01e42fb3d443ae913ab51f0425863f6
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────────
--  0073 — ONE MOUTH, SHADOW MODE: the observation ledger for the Title VI engine
--         run over everything that leaves the building.
--
--  ══ WHAT WAS TRUE BEFORE THIS FILE ══
--  `marketing/outboundGate.ts gateOutboundText` composes the two engines that carry
--  the MiCA Title VI limbs — Art 90 (embargo), Art 91(3)(c) (the author's own
--  position), Art 88(1) (disclosure mixed with marketing). It is consulted on
--  exactly two paths, both of them MARKETING DRAFTS: `POST /v1/marketing/:id/draft`
--  and `POST /v1/marketing/draft/:id/approve`.
--
--  Sales email (`messages`, `outreach_tasks`) and campaign copy (`dist_campaigns`)
--  leave the building without ever meeting it. Same company, same regulator, same
--  personal liability of roughly EUR 700,000 under Art 91(3)(c) — and a different
--  number of gates, which is nought.
--
--  ══ WHY THIS TABLE IS SHADOW-ONLY, AND WHY THAT IS NOT TIMIDITY ══
--  Switching enforcement on over traffic whose base rate nobody has measured is how
--  a desk gets an outage at 02:00, turns the control off, and never turns it back on.
--  That failure is already recorded in this repository (`marketingMemory.test.ts`):
--  when a gate refuses everything, humans stop using the gate and the real risk goes
--  UP. So this ledger exists to PRODUCE THE NUMBER that justifies enforcement, and
--  the two CHECK constraints below make it structurally incapable of recording that
--  anything was stopped:
--
--      mode    text    CHECK (mode = 'shadow')
--      blocked boolean CHECK (blocked = false)
--
--  A row here therefore cannot be read as evidence that a send was prevented. If and
--  when enforcement lands it needs its own migration and its own column — not a
--  relaxed constraint on this one, because relaxing it would retroactively change
--  what every row already written means.
--
--  ══ WHAT IS RECORDED, AND WHAT DELIBERATELY IS NOT ══
--  A hash of the gated bytes and a LOCATOR — table, row id, and which columns were
--  concatenated — never the text. Same judgement as 0062: a control ledger does not
--  need a second copy of every sales email, and on the would-refuse path the text is
--  precisely what should not be copied further. The locator is what makes a finding
--  actionable: it is enough to go and read the original.
--
--  `text_sha256` IS THE SAME DIGEST 0062 STORES (`gateTextSha256`, sha256 of the
--  UTF-8 bytes), so a shadow observation and a real gate verdict over the same bytes
--  join on that column, and the `gate:<16 hex>` reference an operator already quotes
--  resolves against both.
--
--  ══ NO UNIQUENESS. REPEATED OBSERVATION IS THE MEASUREMENT ══
--  The same template email observed on forty sends is forty rows, and that is the
--  point: the shadow count is a base rate over a window, not a catalogue of distinct
--  texts. `COUNT(DISTINCT text_sha256)` is published beside the row count so a reader
--  can see how much of the number is one template repeating.
--
--  ══ THE COLUMN THAT KEEPS TWO REFUSALS APART ══
--  `perimeter_attributable` marks an observation whose would-be refusal is caused by
--  the REGISTER rather than by the words: EMBARGO_REGISTER_ABSENT,
--  HOLDINGS_DECLARATION_MISSING, ASSET_STATE_UNKNOWN. Every one of those fires today
--  on every text naming any symbol, because `marketing_asset_embargo` is
--  `not_attested` by design until the desk attests it. Without this column the shadow
--  count would read ~100% and mean nothing, and "the words are unlawful" would be
--  indistinguishable from "we have not attested our own register". They are different
--  findings with different owners.
--
--  ══ AND THE THIRD CAUSE, WHICH IS `gate_error` AND NOT A CODE ══
--  A would-be refusal has THREE possible causes, not two: the register is unattested,
--  the words are unlawful, or THE CHECK NEVER RAN. The third cannot be read off
--  `refusal_codes`, because `outboundGate.ts gateFailure` labels its own crash
--  `ASSET_STATE_UNKNOWN` — a code in the list above. So a reader (and
--  `marketing/oneMouth.ts`) must attribute using BOTH columns:
--
--      gate_error IS NOT NULL              the check did not complete. Nothing is known
--                                          about the text or about the register.
--      perimeter_attributable AND no error  the register is unattested.
--      neither                              the words.
--
--  `perimeter_attributable` is therefore written FALSE on every observation carrying a
--  `gate_error`, whatever code the failure stamped. The first version of the writer did
--  the opposite, and a window of connection resets was reported as an unattested
--  register — a claim about a register nothing had read.
--
--  Zero DROP / DELETE / TRUNCATE. One table, four indexes, RLS on (deny-all with no
--  policy; the API connects as the owner and bypasses it), matching 0046/0060/0062.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS marketing_one_mouth_shadow (
  id                     bigserial PRIMARY KEY,

  -- SHADOW, PINNED BY CONSTRAINT. See the header: a row in this table may never be
  -- read as "a send was stopped", and a CHECK is the only form of that promise which
  -- survives the next person to touch the writing code.
  mode                   text NOT NULL DEFAULT 'shadow' CHECK (mode = 'shadow'),
  blocked                boolean NOT NULL DEFAULT false CHECK (blocked = false),

  -- Which mouth. Three, and the union is closed here so a fourth surface cannot be
  -- folded into the count without a migration that says so.
  surface                text NOT NULL CHECK (surface IN (
                           'sales_email', 'assisted_touch', 'dist_campaign'
                         )),

  -- ENOUGH TO FIND THE TEXT AGAIN. A finding a human cannot go and read is a number,
  -- not evidence. `locator_columns` records WHICH bytes were gated ('subject+body'),
  -- because a hash over a different composition is a hash of something else.
  --
  -- IT MAY NAME SOMETHING THAT IS NOT A COLUMN, and it must say so when it does. The
  -- campaign composition includes three CONSTANT task labels and a fallback description
  -- the export substitutes for a NULL `detail` — neither is stored anywhere on
  -- `dist_campaigns`. A locator reading `name+detail+task_labels` sent an operator to a
  -- row holding two of the three parts, with no way to recompute the digest, which is
  -- the one thing this field exists for. See SOURCE_COLUMNS in marketing/oneMouth.ts.
  locator_table          text NOT NULL CHECK (length(btrim(locator_table)) > 0),
  locator_row_id         text NOT NULL CHECK (length(btrim(locator_row_id)) > 0),
  locator_columns        text NOT NULL CHECK (length(btrim(locator_columns)) > 0),

  -- The principal the Art 91(3)(c) limb was resolved against.
  actor                  text NOT NULL CHECK (length(btrim(actor)) > 0),

  -- FALSE when the source row records no sender, so `actor` is a stated placeholder
  -- rather than a person. Those observations still refuse — a text whose author is
  -- unknown cannot have its holdings limb cleared — but they are not evidence about a
  -- named colleague, and a count that mixed the two would be unusable for either
  -- purpose.
  actor_attributed       boolean NOT NULL,

  text_sha256            text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  text_chars             integer NOT NULL CHECK (text_chars >= 0),

  -- WOULD have blocked, had this been enforcement. Nothing was blocked.
  would_block            boolean NOT NULL,
  disposition            text NOT NULL CHECK (disposition IN (
                           'clear', 'stripped', 'flagged', 'refused'
                         )),

  -- The UNSCOPED refusal codes, as 0062's `refusal_codes` column holds them: the Art 90
  -- limb is named here even where a drafter's own copy of the refusal deliberately did
  -- not name it. Scoping an explanation must not scope the evidence.
  refusal_codes          text[] NOT NULL DEFAULT '{}',

  -- The provisions those refusals cite, e.g. 'MiCA Art 91(3)(c)'. A separate column
  -- from `refusal_codes` and NOT positionally paired with it: the scoped Art 90 limb
  -- collapses several codes into one sentence, so the two lists can legitimately differ
  -- in length. Recorded because a count without the rule it applies is a statistic
  -- nobody can act on.
  rules_cited            text[] NOT NULL DEFAULT '{}',

  -- Dotted `MarketingViolation.rule` ids of the ERROR-severity findings that would have
  -- blocked, e.g. 'title_vi.directional_with_no_named_asset'. A different vocabulary
  -- from `refusal_codes`; merging them would corrupt any refusal-frequency read.
  violation_codes        text[] NOT NULL DEFAULT '{}',

  -- What the LEXICAL extractor believed the text named, extracted server-side from the
  -- text itself. An empty array is a real answer and is not NULL.
  assets_extracted       text[] NOT NULL DEFAULT '{}',

  -- See the header. Keeps "our register is unattested" out of "our copy is unlawful".
  perimeter_attributable boolean NOT NULL,

  -- Set when a gate THREW. 'the check failed' and 'the text failed' are different
  -- facts; in shadow mode neither one stops anything, and conflating them would make
  -- the base rate unreadable.
  gate_error             text,

  observed_at            timestamptz NOT NULL DEFAULT now()
);

-- The base-rate read over a window.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_observed_idx
  ON marketing_one_mouth_shadow (observed_at DESC);

-- The per-mouth split — which surface is producing the findings.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_surface_idx
  ON marketing_one_mouth_shadow (surface, observed_at DESC);

-- "What has this row ever been observed to say", for the locator an operator holds.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_locator_idx
  ON marketing_one_mouth_shadow (locator_table, locator_row_id, observed_at DESC);

-- The join to 0062: the same bytes gated for real on another path.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_sha_idx
  ON marketing_one_mouth_shadow (text_sha256);

COMMENT ON TABLE marketing_one_mouth_shadow IS
  'SHADOW MODE. Title VI gate verdicts computed over outbound sales email and campaign '
  'copy, recorded and counted, blocking nothing. Written by marketing/oneMouth.ts. '
  'Holds a hash and a locator, never the text. mode and blocked are CHECK-pinned so a '
  'row here can never be read as evidence that a send was prevented.';

COMMENT ON COLUMN marketing_one_mouth_shadow.would_block IS
  'What enforcement WOULD have done. Nothing was blocked — see the blocked column, '
  'which is CHECK-pinned to false.';

COMMENT ON COLUMN marketing_one_mouth_shadow.perimeter_attributable IS
  'True when the would-be refusal is caused by the register being unattested '
  '(EMBARGO_REGISTER_ABSENT / HOLDINGS_DECLARATION_MISSING / ASSET_STATE_UNKNOWN) '
  'rather than by the words. FALSE on every row with a gate_error, whatever code the '
  'failure carried: ASSET_STATE_UNKNOWN is also what gateFailure stamps on its own '
  'crash, and "the check never ran" is a third cause with a third owner. Read this '
  'column together with gate_error, never alone. Without this split the base rate '
  'reads ~100% and means nothing.';

COMMENT ON COLUMN marketing_one_mouth_shadow.rules_cited IS
  'The provisions the refusals cite. NOT positionally paired with refusal_codes: the '
  'scoped Art 90 limb collapses several codes into one sentence.';

-- RLS with no policy is deny-all. Supabase exposes public tables through its
-- auto-generated REST API, and `assets_extracted` on this table is a list of symbols
-- the desk is drafting about before any announcement — which is the Art 90 inside
-- information itself. The API connects as the owner and bypasses RLS, so nothing
-- legitimate changes.
ALTER TABLE marketing_one_mouth_shadow ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ==========================================================================
-- 0074_platform_forecast.sql
-- sha256 2122715b1fdcc5f2fd603383bf991a604e8522845940665beba2a51937bdbfda
-- ==========================================================================

-- ──────────────────────────────────────────────
--  0074 — THE FORECAST LEDGER. "Are we any good?" becomes a falsifiable question.
--
--  WHAT WAS FALSE. Across 0000–0073 there is no relation that pairs a prediction
--  with an outcome. `model_calibrations` (0031) stores the RESULT of a calibration
--  and none of its inputs; `observations` (0029) stores values with no notion of a
--  horizon or a resolution; `gps_outcome` (0050) stores what happened with the
--  quoted side joined in from `gps_engagement` and no instant at which anything was
--  predicted. So every accuracy claim this platform could make was unfalsifiable —
--  not wrong, unfalsifiable, which is worse, because nothing could ever contradict
--  it.
--
--  WORSE, THE ONE LOOP THAT CLAIMED TO MEASURE PREDICTION MEASURED ITS OWN THUMB.
--  `intel/calibration.ts` read the LATEST observation per subject, and
--  `packages/shared/src/alpha.ts` subtracts 40 from listing propensity and 50 from
--  winnability once `listed_on_lcx` is true (alpha.ts:114-117, :232-235). Every won
--  deal is listed. So the "validated" score already contained a penalty the
--  platform itself applied AFTER the outcome, and the lift computed from it was
--  measuring the adjustment, not the prediction. A forecast row exists so that the
--  value being validated is the value that was on the screen when the call was
--  made, and nothing else.
--
--  WHAT THIS DOES.
--    platform_forecast          — one immutable row per prediction: what, by which
--                                 engine at which version, for which subject, at
--                                 which instant, over what horizon.
--    platform_forecast_outcome  — append-only rows saying what actually happened.
--
--  WHY TWO TABLES AND NOT NULLABLE OUTCOME COLUMNS. A nullable `observed_num` on
--  the prediction row makes resolution an UPDATE, and an UPDATE is exactly how a
--  prediction stops being one: whoever types the outcome is one keystroke from
--  correcting the prediction to match it. That is not a hypothetical — it is the
--  same failure `gps/loop.ts:277-281` documents, where copying the quoted price
--  onto the outcome row at close made every slippage figure quietly zero. Here the
--  prediction table takes a BEFORE UPDATE OR DELETE trigger and cannot be edited at
--  all; a correction is APPENDED as another outcome row and the reader counts the
--  superseded ones out loud.
--
--  WHAT THIS DELIBERATELY DOES NOT DO. It computes nothing. There is no view that
--  returns an accuracy, no generated column holding a hit flag, and no default
--  anywhere that would let an absent outcome read as a correct one. Every figure is
--  computed in `kpi/platformForecast.ts`, which refuses below a stated n.
--
--  ZERO DROP / DELETE / TRUNCATE of existing data. Two new tables, six indexes, two
--  functions, five triggers, and two finite-value constraints added by the DO block at
--  the end (see the note there for why they are not in the table bodies). Idempotent —
--  re-running it on a database that already has the tables adds the constraints and
--  changes nothing else. RLS on both (the API's postgres owner bypasses), matching
--  0042/0071.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_forecast (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',

  -- WHICH ENGINE, AT WHICH VERSION. Both NOT NULL and neither defaulted. A
  -- calibration pooled across two versions of a scorer is a review of a model that
  -- never existed; `gps/calibration.ts:198-205` already learned this about
  -- `factor_scores_at_quote` and this is the same rule with a column behind it.
  engine         text NOT NULL CHECK (length(btrim(engine)) > 0),
  engine_version text NOT NULL CHECK (length(btrim(engine_version)) > 0),

  subject_type   text NOT NULL CHECK (length(btrim(subject_type)) > 0),
  subject_id     text NOT NULL CHECK (length(btrim(subject_id)) > 0),

  -- WHAT WAS PREDICTED. `metric_key` names the quantity ('conviction',
  -- 'deal_won', 'cycle_time_days'); `prediction_kind` says how to read the value,
  -- because a 0.7 probability and a 0.7 on a 0–100 ordinal are not the same claim
  -- and a single numeric column would let them be averaged together.
  metric_key     text NOT NULL CHECK (length(btrim(metric_key)) > 0),
  prediction_kind text NOT NULL CHECK (prediction_kind IN ('probability', 'ordinal', 'scalar', 'category')),
  predicted_num   numeric,
  predicted_label text,

  -- THE INSTANT. Supplied by the caller, not defaulted to now(): a forecast
  -- reconstructed from a job run that happened at 03:00 must carry 03:00, and a
  -- DEFAULT now() would silently date every backfilled row to the backfill.
  predicted_at   timestamptz NOT NULL,

  -- THE HORIZON, in days. Without it "the outcome has not happened yet" and "the
  -- prediction was wrong" are the same row.
  horizon_days   integer NOT NULL CHECK (horizon_days > 0),

  -- What was observable when the call was made: the ObservationFrame, stored as
  -- given. Never read back as a figure; it exists so a reader can see what the
  -- engine could and could not see.
  inputs_frame   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- WHICH DATABASE THIS CAME FROM. NOT NULL, non-empty, and 'unknown' is refused:
  -- `marks/mark.ts:443-451` records a price shipping with environment 'unknown'
  -- because a sentinel string satisfied a `string` type and an emptiness check.
  -- The constraint is here so the same sentinel cannot be stored at all.
  environment    text NOT NULL CHECK (length(btrim(environment)) > 0 AND lower(btrim(environment)) <> 'unknown'),

  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_txid  bigint NOT NULL DEFAULT txid_current(),

  -- The value must match the kind it declares. A probability outside [0,1] is not a
  -- probability, and a category with a number attached invites the number being
  -- averaged.
  CONSTRAINT platform_forecast_value_matches_kind CHECK (
    (prediction_kind = 'probability'
       AND predicted_num IS NOT NULL AND predicted_num >= 0 AND predicted_num <= 1
       AND predicted_label IS NULL)
 OR (prediction_kind IN ('ordinal', 'scalar')
       AND predicted_num IS NOT NULL AND predicted_label IS NULL)
 OR (prediction_kind = 'category'
       AND predicted_label IS NOT NULL AND predicted_num IS NULL)
  )
);

COMMENT ON TABLE platform_forecast IS
  'Immutable predictions (0074). One row per (engine, engine_version, subject, '
  'metric, instant). Outcomes live in platform_forecast_outcome and are APPENDED; '
  'this table cannot be updated or deleted. Read by kpi/platformForecast.ts.';

-- Idempotency for a job that re-runs over the same pass. Same engine, same version,
-- same subject, same metric, same instant is the SAME prediction — inserting it
-- twice would double the corpus an n-floor is measured against, which is the one
-- number that must not be inflatable. Guarded here rather than by convention
-- because `intel/alpha.ts:30` shows how a re-run is normally made idempotent in
-- this repo (a DELETE), and a DELETE is not available on this table by design.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pforecast_identity
  ON platform_forecast (engine, engine_version, subject_type, subject_id, metric_key, predicted_at);

CREATE INDEX IF NOT EXISTS idx_pforecast_subject
  ON platform_forecast (subject_type, subject_id, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pforecast_engine
  ON platform_forecast (engine, engine_version, metric_key, predicted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pforecast_seq ON platform_forecast (seq);

-- ══════════════════════════════════════════════════════════════════════════════
--  THE OUTCOMES. Append-only, and deliberately WITHOUT a unique key on
--  forecast_id: a correction is a new row, and the reader reports how many earlier
--  rows it superseded rather than losing them.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_forecast_outcome (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id    uuid NOT NULL REFERENCES platform_forecast(id),

  -- 'unresolvable' IS A FIRST-CLASS OUTCOME, not a missing row. A subject that was
  -- deleted, a horizon that passed with no observable result, a deal cancelled
  -- rather than won or lost: recording it as unresolvable keeps it OUT of the
  -- accuracy numerator AND out of the pending count, so neither reads as a silent
  -- exclusion. `gps/calibration.ts:120` makes the same distinction for 'cancelled'.
  outcome_kind   text NOT NULL CHECK (outcome_kind IN ('resolved', 'unresolvable')),
  observed_num   numeric,
  observed_label text,

  -- When the outcome HAPPENED. Compared against the prediction's instant by the
  -- trigger below.
  observed_at    timestamptz NOT NULL,
  source         text NOT NULL CHECK (length(btrim(source)) > 0),
  note           text,
  provenance     text NOT NULL CHECK (provenance IN ('observed', 'reconstructed')),

  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_txid  bigint NOT NULL DEFAULT txid_current(),

  CONSTRAINT platform_forecast_outcome_value_matches_kind CHECK (
    (outcome_kind = 'resolved' AND (observed_num IS NOT NULL OR observed_label IS NOT NULL))
 OR (outcome_kind = 'unresolvable' AND observed_num IS NULL AND observed_label IS NULL AND note IS NOT NULL)
  )
);

COMMENT ON TABLE platform_forecast_outcome IS
  'Append-only outcomes for platform_forecast (0074). A correction is a NEW row; '
  'the latest by seq wins and the superseded count is reported, never dropped.';

CREATE INDEX IF NOT EXISTS idx_pfoutcome_forecast
  ON platform_forecast_outcome (forecast_id, seq DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pfoutcome_seq ON platform_forecast_outcome (seq);

-- ══════════════════════════════════════════════════════════════════════════════
--  THE TRIGGERS.
-- ══════════════════════════════════════════════════════════════════════════════

-- A prediction you can edit is not a prediction. Same doctrine as 0070/0071, and
-- the error code is the one `kpi/platformForecast.ts` matches on.
CREATE OR REPLACE FUNCTION platform_forecast_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'PLATFORM_FORECAST_APPEND_ONLY: %.% is append-only; % is refused',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
  USING ERRCODE = '42501',
        HINT = 'Record what happened by INSERTing into platform_forecast_outcome. '
            || 'An outcome that overwrites the prediction destroys the only thing '
            || 'that made it a forecast.';
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pforecast_append_only ON platform_forecast;
CREATE TRIGGER trg_pforecast_append_only
  BEFORE UPDATE OR DELETE ON platform_forecast
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pforecast_no_truncate ON platform_forecast;
CREATE TRIGGER trg_pforecast_no_truncate
  BEFORE TRUNCATE ON platform_forecast
  FOR EACH STATEMENT EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pfoutcome_append_only ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_append_only
  BEFORE UPDATE OR DELETE ON platform_forecast_outcome
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_forbid_mutation();

DROP TRIGGER IF EXISTS trg_pfoutcome_no_truncate ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_no_truncate
  BEFORE TRUNCATE ON platform_forecast_outcome
  FOR EACH STATEMENT EXECUTE FUNCTION platform_forecast_forbid_mutation();

-- THE CONTAMINATION GUARD, IN SQL.
--
-- An outcome observed BEFORE the prediction was made is the same defect that made
-- the old calibration loop meaningless, wearing different clothes: it resolves a
-- forecast against information that predates it. A CHECK cannot see the other
-- table, so this is a trigger. It refuses the row rather than clamping the instant,
-- because a clamped instant is a lie that survives in the ledger.
CREATE OR REPLACE FUNCTION platform_forecast_outcome_after_prediction() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  p_at timestamptz;
BEGIN
  SELECT predicted_at INTO p_at FROM platform_forecast WHERE id = NEW.forecast_id;
  IF p_at IS NULL THEN
    -- Unreachable through the FK, kept because a future ON DELETE path would make
    -- it reachable and a NULL comparison below would then pass silently.
    RAISE EXCEPTION 'PLATFORM_FORECAST_SUBJECT_UNKNOWN: no prediction % exists', NEW.forecast_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.observed_at < p_at THEN
    RAISE EXCEPTION
      'PLATFORM_FORECAST_OUTCOME_PRECEDES_PREDICTION: outcome observed at % predates the prediction made at %',
      NEW.observed_at, p_at
      USING ERRCODE = '22007',
            HINT = 'A forecast resolved against information older than itself measures '
                || 'nothing. Record the real instant, or record it as unresolvable.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pfoutcome_after_prediction ON platform_forecast_outcome;
CREATE TRIGGER trg_pfoutcome_after_prediction
  BEFORE INSERT ON platform_forecast_outcome
  FOR EACH ROW EXECUTE FUNCTION platform_forecast_outcome_after_prediction();

-- ══════════════════════════════════════════════════════════════════════════════
--  NaN AND ±Infinity ARE VALID `numeric` VALUES IN POSTGRES, AND THEY BECAME A
--  FIGURE THAT WAS PRESENT AND EMPTY.
--
--  The value-matches-kind CHECK above bounds the 'probability' kind only, and it does
--  so by accident of arithmetic: NaN sorts ABOVE every number in Postgres, so
--  `NaN <= 1` is false and the row is refused. For 'ordinal' and 'scalar' the check
--  only requires `predicted_num IS NOT NULL`, and `INSERT … VALUES ('NaN')` was
--  accepted. `kpi/platformForecast.ts` then computed a mean over it and
--  `JSON.stringify(NaN)` is `null` — so `meanAbsoluteError: null` shipped beside a
--  computed `medianAbsoluteError: 2`, with no refusal, indistinguishable from a figure
--  deliberately withheld. That is the one shape the doctrine forbids outright.
--
--  THE BOUND IS ±1e308 AND NOT ±Infinity, deliberately. The reader is JavaScript: a
--  numeric larger than about 1.8e308 becomes `Infinity` the moment `Number()` touches
--  it, so a value the database considers finite can still arrive as one that is not.
--  1e308 is a round number below that edge. NaN fails `<= 1e308` (it sorts above
--  everything) and ±Infinity fail their respective sides, so all three are refused by
--  the same expression.
--
--  ADDED IN A DO BLOCK, not in the CREATE TABLE bodies above, because those are
--  `IF NOT EXISTS`: on a database where 0074 has already run, a constraint added to the
--  table body would never be applied. This form is correct on a fresh database and on
--  one that already has the tables, which is what "idempotent" has to mean here.
-- ══════════════════════════════════════════════════════════════════════════════
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'platform_forecast_predicted_num_finite'
       AND conrelid = 'platform_forecast'::regclass
  ) THEN
    ALTER TABLE platform_forecast
      ADD CONSTRAINT platform_forecast_predicted_num_finite CHECK (
        predicted_num IS NULL
        OR (predicted_num >= -1e308::numeric AND predicted_num <= 1e308::numeric)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'platform_forecast_outcome_observed_num_finite'
       AND conrelid = 'platform_forecast_outcome'::regclass
  ) THEN
    ALTER TABLE platform_forecast_outcome
      ADD CONSTRAINT platform_forecast_outcome_observed_num_finite CHECK (
        observed_num IS NULL
        OR (observed_num >= -1e308::numeric AND observed_num <= 1e308::numeric)
      );
  END IF;
END
$do$;

ALTER TABLE platform_forecast         ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_forecast_outcome ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 0075_gps_partner_registry.sql
-- sha256 bde64f17d3746800f97256c0d8716b71b7c076575c08a725b55452e2de846673
-- ==========================================================================

-- ──────────────────────────────────────────────
--  0075 — GPS PARTNER REGISTRY: the delivery bench, as rows a named human asserted
--
--  THE DECISION THIS FILE IS. On 2026-08-07 the owner answered the question that
--  blocked the bench: A NAMED HUMAN MAY ASSERT A PARTNER NAME AND A RATE CARD,
--  ATTRIBUTED TO THEM. Everything below is that sentence as a schema, and the
--  attribution is the load-bearing half of it — not provenance decoration.
--
--  WHAT WAS BROKEN, EXACTLY. `grep -rl partner_registry` over this repository
--  returned ONE file before this migration: `LCX_OS_100X_PLAN.md`, where F5 is
--  listed as "NAMED, NOT BUILT". Four namespaces name partners and TWO MIGRATIONS
--  REFUSE THE FOREIGN KEY IN PROSE:
--
--    · 0052_gps_underwriting.sql:52  "TEXT, NOT AN FK. The bench is not a table
--      (`partners.ts:305`: 'When names arrive they are ROWS, not entries here'),
--      and 0047 set the precedent with `owner`. An FK to the BD `partners` table
--      (0024_dealdesk_ext.sql:66) would silently equate a referral counterparty
--      with a delivery partner."
--    · 0049_gps_delivery.sql:156  "Text, not an FK: the roster is compiled code,
--      and the partner bench does not exist yet (plan §3, D5)."
--
--  BOTH REFUSALS WERE RIGHT AND ONLY ONE OF THEM IS NOW STALE. 0052's premise —
--  "the bench is not a table" — is what this file removes, so `gps_rate_card` gets
--  its foreign key at the foot of this migration. 0049's is NOT removed: that
--  column (`gps_milestone.owner`) holds EITHER a desk member id from compiled
--  `operators.ts` OR a partner's name, and an FK on a column with two populations
--  in it would reject every internal owner. It stays text, and it stays text
--  deliberately rather than by omission.
--
--  ══ AND THIS IS NOT THE THIRD PARTNER TABLE 0047 REFUSED ═════════════════════
--  0047_gps.sql:19 says: "`partners` (0024_dealdesk_ext.sql:66) already exists and
--  so does `command_partners` (0040_command.sql:29); a THIRD partner table is
--  refused." That refusal held while a delivery partner had nothing a referral
--  counterparty lacked. It has three things now, and none of them fits `partners`:
--    1. an ASSERTION — who put them on the bench, when, on what basis;
--    2. a per-offer rate card with an EXPIRY (`gps_rate_card`, 0052);
--    3. a concurrency cap, which is the capacity ceiling on the whole business.
--  `partners` is five columns wide, carries `commission_pct` (meaningless for a
--  subcontractor we PAY), and is joined by `referrals.partner_id` — so bolting
--  three shapes onto it would make every referral row a half-filled bench member,
--  and `SELECT * FROM partners` on the BD desk would start returning a third
--  party's rate basis.
--
--  SO THE TWO ARE LINKED RATHER THAN MERGED: `bd_partner_id` below is a NULLABLE
--  reference to `partners(id)` for the case where one legal entity is both, and
--  NULL there means NOBODY STATED A LINK — never "these are different people".
--  That is the difference between a fourth silo and a reconciled book.
--
--  ══ D2, THE DECISION THIS COMPARTMENT TURNS ON ══════════════════════════════
--  D2 — is LCX controller or processor for a third party's confidential material,
--  what is the subprocessor chain through Supabase/Render/Cloudflare/OpenRouter,
--  what is the retention, what is the erasure path — was ANSWERED YES by the owner
--  on 2026-08-02 (see 0057_gps_artifact.sql:4-31). GPS may hold client documents,
--  and it holds them in EXACTLY ONE COLUMN of one table (`gps_artifact_blob.bytes`,
--  0058) behind one reviewed surface, with a size ceiling, a verified MIME
--  allowlist, a server-computed digest, a retention date and an audit row on every
--  read.
--
--  NOTHING IN THIS FILE IS THAT, AND THAT IS THE POINT OF SAYING SO. A partner
--  registry is a natural place for someone to want to attach a CV, an engagement
--  letter, a signed NDA or a rate sheet PDF — and every one of those is a document
--  arriving on a table with none of the six controls above. So there is NO artifact,
--  attachment, location, url, mime, filename or byte column here, and there is no
--  free-text field intended to hold one: `assertion_basis`, `evidence` and `notes`
--  are bounded prose about a person, not a place to paste a file. A partner's
--  paperwork goes through the intake surface or it does not enter this system.
--  `intakeLockout.test.ts` discovers migrations by CONTENT and will fail the build
--  on a byte-bearing column or a byte-shaped column NAME in this file.
--
--  D2 also does not reach the SUBJECTS of these rows. A named subcontractor is a
--  living person and this table holds their name, their availability and a sentence
--  about why we believe in them; the DPO question answered in August was about a
--  CLIENT's confidential material, not about a partner's personal data. Nothing here
--  claims that second question has been asked.
--
--  NO client_id, for the reason 0052:28 gives about rate cards and for one more:
--  a bench member is not a client's asset. A partner scoped to a client is a
--  negotiated arrangement, which lives on the engagement.
--
--  NO margin, cost, floor or price column. Every one of those is DERIVED
--  (`priceFloor`, `marginAtRisk`, packages/shared/src/gps/partners.ts); a stored
--  copy is the stale number a screen quotes after the rate changed. In particular
--  there is NO `floor_cents`: the floor is a function of a rate card and an effort
--  triple, and materialising it would let it outlive both.
--
--  Idempotent and forward-only. Applied BY HAND in the Supabase SQL editor —
--  nothing wires this runner into the deploy (`db/migrate.ts`).
--
--  PREREQUISITE: 0052_gps_underwriting.sql must be applied first. The foreign key
--  at the foot of this file targets `gps_rate_card`, and if that table is absent
--  this migration fails LOUDLY with 42P01 naming it — which is the correct
--  outcome. A guard that skipped the FK would leave a database that looks migrated
--  and has no referential integrity between a rate and the partner charging it.
-- ──────────────────────────────────────────────

-- ── The bench ─────────────────────────────────────────────────────────────────
--  ONE ROW PER DELIVERY PARTNER, keyed by the SAME text `partner_id` that
--  `gps_rate_card` (0052:56) and `gps_engagement.partner_id` (0052:189) already
--  carry. Not a new uuid: a surrogate key would have forced every existing rate
--  card to be re-pointed, and a re-pointing migration is where rows get orphaned.
CREATE TABLE IF NOT EXISTS gps_partner_registry (
  -- The join key the rest of the compartment already uses. Same CHECK shape as
  -- gps_rate_card.partner_id so a value legal there is legal here and vice versa.
  partner_id       text PRIMARY KEY
                     CHECK (length(btrim(partner_id)) > 0 AND length(partner_id) <= 120),

  -- What a human calls them. NOT NULL: an id alone cannot be checked against a
  -- memory, and "who is delivering this" is answered by a person, not by a slug.
  partner_name     text NOT NULL
                     CHECK (length(btrim(partner_name)) > 0 AND length(partner_name) <= 200),

  -- ══ THE ATTRIBUTION. THIS IS THE DECISION, NOT METADATA AROUND IT. ══════════
  -- The owner did not decide "partners may exist". He decided a NAMED HUMAN MAY
  -- ASSERT ONE, ATTRIBUTED TO THEM. So all three fields are NOT NULL with a
  -- non-blank CHECK: an unattributed row must be IMPOSSIBLE rather than
  -- discouraged, because a convention is enforced by whoever is paying attention
  -- and this one is the only thing standing behind every margin figure downstream.
  --
  -- A named human, never a service account. The shared machine key holds `gps` at
  -- operate (`access/entitlements.ts:39`), so a row written by a cron job would be
  -- an unattributable cost basis. Same posture as gps_conflict_check.decided_by
  -- (0047:286) and gps_rate_card.stated_by (0052:112), with the same honest limit:
  -- attribution is only as strong as the shared DESK_PASSCODE until per-person
  -- credentials exist. That limit is stated on the screen, not hidden here.
  asserted_by      text NOT NULL
                     CHECK (length(btrim(asserted_by)) > 0 AND length(asserted_by) <= 120),

  -- NO DEFAULT on the assertion instant would be defensible either way; now() is
  -- used because the row cannot be written except by the route, which writes it in
  -- the same statement, and a NULL here would mean "asserted at a time nobody
  -- recorded" — which the CHECK below cannot express but the NOT NULL can prevent.
  asserted_at      timestamptz NOT NULL DEFAULT now(),

  -- ON WHAT BASIS. Free text, REQUIRED, and deliberately not an enum: when a
  -- partner misses a delivery, the sentence that says why they were believed is
  -- the only thing a reviewer can argue with, and a category would compress it to
  -- nothing. Bounded at 2000 so it is a paragraph and not a channel — every other
  -- free-text field in this compartment carries the same kind of ceiling for the
  -- reason 0052's `currency` post-mortem gives (`intakeLockout.test.ts`: a text
  -- column with no length on a server with no bodyLimit is a document-sized door).
  assertion_basis  text NOT NULL
                     CHECK (length(btrim(assertion_basis)) > 0 AND length(assertion_basis) <= 2000),

  -- Off-boarding without rewriting history. FALSE takes the partner out of every
  -- headroom calculation and every acceptance decision while leaving the rows that
  -- past margin was computed from exactly where they are (`Partner.active`,
  -- packages/shared/src/gps/partners.ts).
  active           boolean NOT NULL DEFAULT true,

  -- CONCURRENCY CAP — how many engagements of ANY offer this partner will take at
  -- once. The cap is on the HUMAN and not on the offer, which is why it is one
  -- column here and not a row per offer.
  --
  -- NULLABLE, AND NULL IS "NOBODY ASKED" RATHER THAN "UNLIMITED". `CATALOGUE_TODOS`
  -- has flagged this as unsupplied since Phase 2 ("Without it the system will
  -- happily sell more than can be delivered"). 0 is a legitimate STATED value
  -- meaning "full", which is exactly why it may not double as the unknown.
  max_concurrent   integer CHECK (max_concurrent >= 0 AND max_concurrent <= 100),

  -- Who stated the cap, and when. Separate from the assertion attribution because
  -- the cap is a different claim, usually made later and usually by the partner
  -- rather than by us. Both NULL or both set — enforced below.
  capacity_stated_by text CHECK (capacity_stated_by IS NULL
                                 OR (length(btrim(capacity_stated_by)) > 0
                                     AND length(capacity_stated_by) <= 120)),
  capacity_stated_at timestamptz,

  -- Unavailable until this instant (leave, another client, illness), or NULL for
  -- "no window recorded". Evaluated only against a caller-supplied `asOf`; nothing
  -- in this schema or in the engines reads the clock.
  unavailable_until  timestamptz,

  -- THE LINK TO THE BD BENCH, not a merge of it. NULL means NOBODY STATED A LINK
  -- and never "not the same entity" — the two are different facts and collapsing
  -- them would let an unasked question read as an answered one.
  --
  -- ON DELETE RESTRICT: deleting a referral counterparty that a delivery partner
  -- is linked to must FAIL rather than silently unlink, because the unlink would
  -- be an unrecorded change to who we believe this partner is.
  bd_partner_id    uuid REFERENCES partners(id) ON DELETE RESTRICT,

  -- The referral path, the relationship owner, the caveats. Free text, bounded.
  notes            text CHECK (notes IS NULL OR length(notes) <= 4000),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- A capacity figure with no author is a guess with a schema. Either the whole
  -- claim is recorded or none of it is.
  CONSTRAINT gps_partner_registry_capacity_is_attributed
    CHECK ((max_concurrent IS NULL AND capacity_stated_by IS NULL AND capacity_stated_at IS NULL)
           OR (max_concurrent IS NOT NULL AND capacity_stated_by IS NOT NULL
               AND capacity_stated_at IS NOT NULL))
);

-- "Who is on the bench right now" — the read behind every staffing question.
CREATE INDEX IF NOT EXISTS gps_partner_registry_active_idx
  ON gps_partner_registry (active, partner_name);

-- The partners whose capacity nobody has ever stated: the population that makes
-- the concurrency cap unknowable, as a scan of exactly those rows.
CREATE INDEX IF NOT EXISTS gps_partner_registry_no_capacity_idx
  ON gps_partner_registry (partner_id)
  WHERE max_concurrent IS NULL;

-- One delivery partner per BD counterparty. A partial UNIQUE index rather than a
-- column constraint so the NULLs — "no link stated", the ordinary case — do not
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS gps_partner_registry_bd_link_idx
  ON gps_partner_registry (bd_partner_id)
  WHERE bd_partner_id IS NOT NULL;


-- ── What one partner can deliver ──────────────────────────────────────────────
--  ONE ROW PER (PARTNER, OFFER). Per-capability seniority and jurisdictions,
--  exactly as `PartnerCapability` (packages/shared/src/gps/partners.ts) models it:
--  the same person can be a principal on legal-opinion coordination and an
--  associate on marketing activation, and flattening that onto the partner row is
--  how the wrong person gets proposed for the wrong engagement.
CREATE TABLE IF NOT EXISTS gps_partner_capability (
  partner_id       text NOT NULL
                     REFERENCES gps_partner_registry(partner_id) ON DELETE CASCADE,

  -- The database's copy of OfferKey, same closed union and same reason as
  -- 0047_gps.sql:139 and 0052:62 — a typo fails here rather than creating a
  -- capability for an offer that does not exist.
  offer_key        text NOT NULL
                     CHECK (offer_key IN (
                       'diagnostic', 'mica_whitepaper',
                       'legal_opinion_coordination', 'gtm_sprint',
                       'marketing_activation'
                     )),

  seniority        text NOT NULL CHECK (seniority IN ('principal', 'senior', 'associate')),

  -- JURISDICTIONS ARE FREE TEXT AND ARE NEVER INFERRED — an array of what a human
  -- typed. No enum, no hierarchy, no containment: "EU" does NOT satisfy a
  -- requirement for "Liechtenstein" and "DE" does not satisfy "Germany", because
  -- no regulatory fact in this programme is verifiable and a false positive here
  -- means proposing a partner into a jurisdiction nobody confirmed they can work
  -- in. Matching is trimmed, case-insensitive EQUALITY in
  -- `capabilityCoversJurisdiction`, and it lives there rather than in SQL so there
  -- is one definition of the comparison.
  --
  -- DEFAULT '{}' with NOT NULL: an empty array means NONE STATED, which the engine
  -- treats as covering NOTHING when a jurisdiction is required. Silence is not a
  -- licence, and NULL would invite `coalesce(jurisdictions, ...)` somewhere.
  jurisdictions    text[] NOT NULL DEFAULT '{}',

  -- Prior engagements, the named counsel relationship, the referral that produced
  -- them. Not scored — read by a human before a $10-25k engagement is handed over.
  evidence         text CHECK (evidence IS NULL OR length(evidence) <= 2000),

  stated_by        text NOT NULL
                     CHECK (length(btrim(stated_by)) > 0 AND length(stated_by) <= 120),
  stated_at        timestamptz NOT NULL DEFAULT now(),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (partner_id, offer_key)
);

-- "Who can deliver this offer" — the read behind partner selection and behind
-- bench headroom, which is the concurrency cap on the whole business.
CREATE INDEX IF NOT EXISTS gps_partner_capability_offer_idx
  ON gps_partner_capability (offer_key, seniority);


-- ── The foreign key two migrations refused in prose ───────────────────────────
--  NOW IT CAN EXIST, because the thing it points at exists. `gps_rate_card`
--  (0052) is what a named partner charges LCX for one offer, and until this
--  migration there was nothing to constrain `partner_id` against — so a rate card
--  could name a partner who was never asserted by anyone, which is exactly the
--  unattributed cost basis the owner's decision was about.
--
--  DROP-THEN-ADD rather than a DO block: Postgres has no ADD CONSTRAINT IF NOT
--  EXISTS, and `intakeLockout.test.ts` forbids DDL against a gps_ table inside a
--  routine body (a table created inside PL/pgSQL is invisible to its column
--  ratchets). Two top-level statements are idempotent, readable, and visible to
--  every check in that file.
--
--  IF THIS FAILS, IT FAILS LOUDLY AND CORRECTLY. A rate card naming a partner who
--  is not in the registry violates it, and the fix is to assert that partner —
--  with who, when and on what basis — not to drop the constraint. There is no
--  ON DELETE CASCADE: removing a partner who has rate cards must FAIL, because
--  cascading would silently delete the cost basis that past quotes were built on.
ALTER TABLE gps_rate_card
  DROP CONSTRAINT IF EXISTS gps_rate_card_partner_fk;
ALTER TABLE gps_rate_card
  ADD CONSTRAINT gps_rate_card_partner_fk
  FOREIGN KEY (partner_id) REFERENCES gps_partner_registry(partner_id) ON DELETE RESTRICT;

--  `gps_engagement.partner_id` (0052:189) is deliberately NOT given the same
--  constraint. It is nullable and NULL BLOCKS PROPOSAL ISSUANCE rather than being
--  inferred; an FK there would additionally forbid recording an engagement whose
--  partner left the bench, and the correct handling of that is `active = false` on
--  the registry row, which preserves the history. If it is ever added it belongs
--  in its own migration with its own argument, not as a side effect of this one.


-- ── Row Level Security ────────────────────────────────────────────────────────
--  Declared here, not left to a dashboard button, for the reason 0047:333 gives:
--  Supabase offers "Run and enable RLS" when it sees a CREATE TABLE in `public`
--  without it, and taking that option leaves the security posture living in a
--  click nobody records.
--
--  This registry is the NAMES AND TERMS OF THIRD-PARTY SUBCONTRACTORS. Without
--  RLS, anyone holding the project's anon key could read the bench — who LCX uses,
--  and by joining `gps_rate_card`, what they charge — out of the auto-generated
--  REST API. That is a competitor's shopping list.
--
--  NO POLICIES, deliberately: RLS with no policy is deny-all, which is the intent.
--  The API connects as the database owner and bypasses RLS, the same arrangement
--  0042 relies on and 0047/0049/0050/0052 repeat. RLS closes the anon-key path and
--  nothing more — it does not scope reads between desk members (that is the
--  entitlement gate).
ALTER TABLE gps_partner_registry   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_partner_capability ENABLE ROW LEVEL SECURITY;


-- ── What `\d+` tells the next person ──────────────────────────────────────────
COMMENT ON TABLE gps_partner_registry IS
  'GPS delivery bench: one row per partner who DELIVERS an offer, ASSERTED BY A NAMED HUMAN (asserted_by / asserted_at / assertion_basis, all NOT NULL) under the owner decision of 2026-08-07. Distinct from `partners` (0024, referral counterparties) and `command_partners` (0040, LCX COMMAND counterparties); `bd_partner_id` links to the first where one entity is both, and NULL there means NOBODY STATED A LINK rather than "different people". `gps_rate_card.partner_id` now references this table. See 0075_gps_partner_registry.sql.';

COMMENT ON COLUMN gps_partner_registry.assertion_basis IS
  'ON WHAT BASIS this partner was put on the bench. Required and free text on purpose: when a partner misses, this sentence is the only thing a reviewer can argue with, and an enum would compress it to a category. It is a CLAIM, not a verification — no reference check is implied by its presence.';

COMMENT ON COLUMN gps_partner_registry.max_concurrent IS
  'Concurrency cap across ALL offers, because the cap is on the human. NULL means NOBODY HAS STATED IT and 0 means FULL — the two must never be collapsed, which is why there is no DEFAULT. Attribution is enforced with the whole claim by gps_partner_registry_capacity_is_attributed.';

COMMENT ON COLUMN gps_partner_registry.bd_partner_id IS
  'Optional link to the BD referral bench (`partners`, 0024_dealdesk_ext.sql:66) where one legal entity is both a referral counterparty and a delivery partner. NULL means no link was stated, NOT that they are different entities. ON DELETE RESTRICT: deleting the BD row must fail rather than silently unlink.';

COMMENT ON TABLE gps_partner_capability IS
  'What one GPS partner can deliver: one row per (partner, offer), with the seniority and the jurisdictions A HUMAN TYPED. Jurisdictions are matched by trimmed case-insensitive EQUALITY in packages/shared/src/gps/partners.ts and are NEVER inferred — "EU" does not cover Liechtenstein — because a false positive means proposing a partner into a jurisdiction nobody confirmed. An empty array means NONE STATED, which covers nothing.';

COMMENT ON CONSTRAINT gps_rate_card_partner_fk ON gps_rate_card IS
  'The foreign key 0052_gps_underwriting.sql:52 and 0049_gps_delivery.sql:156 both refused in prose, on the premise that the delivery bench was not a table. It is one now (0075). A rate card may no longer name a partner nobody asserted.';

-- ==========================================================================
-- THE LEDGER. Without these eight rows the application still believes every
-- migration above is pending. Digests are sha256 of each file's exact text.
-- ==========================================================================

INSERT INTO _migrations (file, checksum) VALUES
  ('0068_listing_labels_dedupe.sql', '0230e2db15df3ea348bb94afe7eebb9a3f486c251e47614e00108a82e84d6518'),
  ('0069_audit_control_markers.sql', 'a12fabe5ef35125aed1db50a0bc0b8606fa423e43598f7c1d1e76bf4b717be9b'),
  ('0070_audit_seal.sql', '3b9d556d9127a7442d33ec65f2c2cc1764c12c0b928722f4d010334e907496ff'),
  ('0071_grant_ledger.sql', 'd24427e6a3f1ebc62f2842a1ae87213a7af01dc1bc652aa0c4f85ae58d3504a6'),
  ('0072_verdict_broker.sql', '4e922bf300a3235015c430ef241c8095b36c210b97be4459e90a43562dd5fa0f'),
  ('0073_one_mouth_shadow.sql', '40515bd01a104ba5316714a121f4d80ee01e42fb3d443ae913ab51f0425863f6'),
  ('0074_platform_forecast.sql', '2122715b1fdcc5f2fd603383bf991a604e8522845940665beba2a51937bdbfda'),
  ('0075_gps_partner_registry.sql', 'bde64f17d3746800f97256c0d8716b71b7c076575c08a725b55452e2de846673');

COMMIT;

-- ---- VERIFY: expect exactly 8 rows, each with a non-null checksum ---------
SELECT file, checksum
  FROM _migrations
 WHERE file >= '0068' AND file < '0076'
 ORDER BY file;
