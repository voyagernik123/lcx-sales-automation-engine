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
