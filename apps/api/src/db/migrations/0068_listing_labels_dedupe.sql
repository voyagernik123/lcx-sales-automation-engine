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
