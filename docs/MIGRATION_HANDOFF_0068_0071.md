# Migrations 0068–0071 — production handoff

**Status:** on disk, in `PENDING_MIGRATIONS`, pushed. **Not applied to production.**
Applying them is yours; everything below is what I verified so the decision is informed.

**Verified before writing this:** all four apply cleanly, in order, to a database built from
`0000` with nothing in it (`npm run ci-mirror`), and the full api suite passes against that
database — 124 files, 2,481 passed, 9 skipped. That is the same check CI runs, and it is the
only thing that proves these apply in order against a virgin schema.

Run them in the Supabase SQL editor, **one file at a time, in this order**, pasting the file
contents from `apps/api/src/db/migrations/`. Each is idempotent (`IF NOT EXISTS` throughout),
so a re-paste is safe.

---

## Order and what each one costs

### 1. `0068_listing_labels_dedupe.sql` — the unique index that was deleting contracts

`0013_propensity.sql:22` made `(source, record_name)` unique on `listing_labels`, and
`record_name` is the **counterparty's name**. Two contracts with the same counterparty were
therefore one row: **'Vulcan Forged' appears twice in the closed book and lost one on every
extract run.** This replaces that index with `(source, record_name, contract_discriminator)`,
where the discriminator is a stored generated column holding `coalesce(ticker, '')`.

- **No data is dropped.** One index is dropped and replaced — the only way to change a
  uniqueness constraint. The replacement is created *first*, so there is no window where the
  table has no uniqueness constraint at all.
- **It needed a code change, and that change is now in** (`labels/extract.ts`, commit
  `on this branch`). Without it the first extract run after applying this fails with `42P10`:
  Postgres cannot infer a three-column unique index from a two-column `ON CONFLICT`. I proved
  both halves against the mirror — the old clause raises
  *"no unique or exclusion constraint matching the ON CONFLICT specification"*, the new one
  keeps both Vulcan Forged rows.
- **It does not recover the row already lost.** That contract was never written. Re-run the
  extractor against `data/seeds/LCX Listings - Closed Token Listings.csv` afterwards.
- `extract.ts` is a hand-run CLI. Nothing served depends on it, so there is no live blast radius.

**Verify:**
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'listing_labels'
  AND indexname IN ('idx_labels_contract','idx_labels_source_record');
-- expect: idx_labels_contract present, idx_labels_source_record ABSENT
```

### 2. `0069_audit_control_markers.sql` — the control markers become readable

Three indexes on `audit_log`. No new column, no new table.

Two partial indexes over the marker families `gateDegraded`/`idempotencyDegraded` and
`overrideSat`/`overrideGate`, which `actions/registry.ts` has been **writing since 2026-07-24
and nothing has ever read**. Plus `idx_audit_actor` — which `db/schema.ts` declares as
`index('idx_audit_actor')` with **no `.on()` columns**, so Drizzle emitted nothing and the index
has never existed in any environment while the schema file asserted it. Every actor-filtered
`/v1/audit` read is a full scan today.

- **Safe to apply alone.** No `DROP`, `DELETE`, `TRUNCATE` or `UPDATE`. It references no other
  migration and adds nothing any code requires — `access/controlRegister.ts` reads the markers
  correctly without it, just sequentially. Applying it changes no result, only query time.
- Takes `ACCESS EXCLUSIVE` on `audit_log` briefly. **Do not add `CONCURRENTLY`** if you hand-run
  the statements through the repo's runner: it sends the file as one simple query, Postgres wraps
  that in an implicit transaction, and `CREATE INDEX CONCURRENTLY` errors inside one.

**Verify:**
```sql
SELECT count(*) FROM pg_indexes WHERE tablename = 'audit_log'
  AND indexname IN ('idx_audit_actor','idx_audit_control_markers','idx_audit_override_markers');
-- expect: 3
```

### 3. `0070_audit_seal.sql` — THE SEAL ⚠ the one to read before running

`audit_log` becomes hash-chained and append-only — which six live files and `0029_spine.sql:6`
have **asserted since Phase 3**, while `0000_equal_beyonder.sql:1-9` created seven columns and no
constraints. Adds three nullable columns, a sequence, a partial unique index, six functions, the
`audit_seal_state` table and **five triggers**. SHA-256 comes from the Postgres 11+ built-in, so
it needs no extension and no `pgcrypto`.

**After this, `UPDATE` and `DELETE` on `audit_log` are refused by trigger, and so is `TRUNCATE`.**
Corrections are made by appending a correcting row. This is deliberate and has **no bypass** — a
switch a test can flip is a switch an attacker can flip, and the control being non-optional is the
entire value of a hash-chained audit log.

- **I checked the whole tree for production code that mutates `audit_log`: there is none.** The
  only non-test match anywhere is a comment. So nothing served breaks.
- It did break exactly one test — a cleanup doing `DELETE FROM audit_log` — and the cleanup was
  removed rather than the control weakened. Already fixed and pushed.
- **Nothing is retro-sealed.** Rows written before this keep `seal_seq IS NULL` and
  `access/seal.ts` reports them as `AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE` — a third state that is
  neither intact nor broken, because those rows were mutable and unchained for their whole life
  and a digest computed now would assert an integrity that was never held. No `DROP`, `DELETE`
  or `TRUNCATE` anywhere in the file.
- Until it is applied, `verifyAuditSeal` returns `AUDIT_SEAL_NOT_INSTALLED` rather than a green
  chain, so nothing reads as sealed while it is not.
- Shares `audit_log` with 0069, so applying both takes `ACCESS EXCLUSIVE` twice. Order between
  those two does not matter.

**Verify:**
```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal;
-- expect: trg_audit_seal_insert, trg_audit_seal_append_only, trg_audit_seal_no_truncate
SELECT count(*) AS unsealed_pre_seal_rows FROM audit_log WHERE seal_seq IS NULL;
-- this number is EXPECTED to be non-zero: it is the pre-seal segment, and seal.ts reports it
```

### 4. `0071_grant_ledger.sql` — the grant ledger

`entitlement_events`, append-only, so revoking stops destroying the grant it revokes. Two tables,
four indexes, three functions, three triggers.

- **The part to weigh: two of those triggers are on `entitlements`.** Every insert/update of a
  grant row now also writes an event row, and a `DELETE` nobody attributed writes one too.
- No data is dropped. The genesis reconstruction derives from existing rows and is guarded on the
  events table being empty, so re-running the file cannot double it.
- **Independent of 0070 in both directions** — different tables, no shared functions — so either
  may be applied alone.
- `registry.ts` revoke already calls `recordRevocation`, written for a database where this has
  *not* landed: the `42P01` is caught, the revocation still takes effect, and the action returns
  `historyRecorded: false` with `ENTITLEMENT_LEDGER_UNRECORDED`. So leaving 0071 unapplied costs
  history, never access — **but every revocation in that window is permanently
  unreconstructable**, which is the argument for applying it before the next revocation rather
  than after.

**Verify:**
```sql
SELECT to_regclass('entitlement_events') IS NOT NULL AS ledger_exists;
SELECT count(*) AS reconstructed_genesis_events FROM entitlement_events;
```

---

## One thing to know about the sequence

0069 and 0070 both take `ACCESS EXCLUSIVE` on `audit_log`. On a busy instance, apply them in a
quiet window. Neither holds it for long — 0069 builds three indexes, 0070 adds nullable columns
and attaches triggers — but a lock is a lock.

If you would rather stage them: **0069 alone is a no-op on correctness** and is the safest thing
here. **0068 is the one that fixes a live data-loss bug.** 0070 and 0071 are the evidential
layer, and both are safe to apply independently.

## After applying

```bash
npm run ci-mirror        # proves the same schema still passes the api suite locally
```

Then re-run the labels extractor once, to write back the contract 0013 was deleting:

```bash
npx tsx apps/api/src/labels/extract.ts
```

There is **no npm script for this** — `apps/api/package.json` defines only dev/start/build/
type-check/migrate/test, so the file is invoked directly. It reads
`data/seeds/LCX Listings - Closed Token Listings.csv` and needs `DATABASE_URL` pointing at
production for the write to land where you want it.
