-- ════════════════════════════════════════════════════════════════════════════
--  0066 — THE GPS PRICE BAND REGISTER (the SELL side)
-- ════════════════════════════════════════════════════════════════════════════
--
--  WHY THIS FILE EXISTS. `apps/api/src/routes/gpsInputs.ts` serves the three input
--  desks the founder must fill in by hand: price bands, effort triples and rate cards.
--  Two of the three registers already have tables — `gps_effort_triple` and
--  `gps_rate_card` (0052_gps_underwriting.sql). The SELL side had none, so every price
--  in the system was the compiled placeholder at
--  `packages/shared/src/gps/catalogue.ts:61` and there was nowhere to put a real one.
--
--  THIS IS THE SAME TEXT THE ROUTE HANDS THE OPERATOR. `PRICE_BAND_REGISTER_DDL`
--  (`routes/gpsInputs.ts:674`) is returned in the `meta` of every refusal that says the
--  register is absent, so an operator can paste it without finding this file. The two
--  are held identical by `db/__tests__/gpsPriceBandMigration.test.ts`, which asserts
--  every statement of the constant appears here — a second copy of DDL that drifts is a
--  table whose CHECKs depend on which copy was run.
--
--  ══ WHAT IS NOT IN THIS TABLE, AND WHY EACH ABSENCE IS A DECISION ══
--   · NO `client_id`. A price that varies by client is not a band, it is a negotiated
--     price, and that already lives on `gps_engagement`. Same reasoning as 0052:28.
--   · NO DEFAULT on any money column. A defaulted 0 prices the work as free.
--   · `mid_cents` IS STORED rather than derived. `bandMidpointCents`
--     (`packages/shared/src/gps/types.ts`) rounds the average of min and max — a
--     sensible default and a terrible record of a decision. A stored mid is the
--     difference between "he chose it" and "arithmetic chose it".
--   · AN ORDERING CHECK, unlike `gps_effort_triple` (0052:153, which deliberately has
--     none because `resolveDuration` clamps a transposed triple). Nothing clamps a
--     price band. The route refuses first with `BAND_NOT_ASCENDING`, so this CHECK can
--     only fire on SQL typed by hand — where a hard error is the right answer.
--   · NO SEEDED ROW. An invented price is worse than no price: the surface badges an
--     absent row as `PLACEHOLDER` and strikes the number through, and a seeded row
--     would be indistinguishable from a decision the founder made.
--
--  ══ D2, THE UNANSWERED DPO QUESTION, AND WHY IT DOES NOT BITE HERE ══
--  Every GPS migration names it. D2 is "controller vs processor for third-party
--  confidential material", answered YES for client artifacts on 2026-08-02 (0057). It
--  does not arise for this table: a price band is LCX's own commercial position, holds
--  no client identifier, no personal data beyond `stated_by` (an internal operator's
--  name, already held throughout this schema) and no third-party material of any kind.
--  Stated rather than left to inference, because "it does not apply" and "nobody
--  checked" look identical in a migration that simply omits the question.
--
--  ══ FORWARD-ONLY, ADDITIVE, IDEMPOTENT ══
--  One CREATE TABLE IF NOT EXISTS, one ALTER … ENABLE ROW LEVEL SECURITY, one COMMENT.
--  No DROP, no DELETE, no TRUNCATE, no ALTER COLUMN TYPE, and no policy — RLS on with
--  no policy is deny-all to the anon key, which is the intent. The API connects as the
--  owner and bypasses it, exactly as 0052:214 and 0047:333. Re-running is a no-op.
--  A human pastes this into the Supabase SQL editor by hand.

-- GPS PRICE BANDS — the SELL side. Idempotent, forward-only.
-- Paste into the Supabase SQL editor, then land this same text as the next free
-- numbered file in apps/api/src/db/migrations/.
CREATE TABLE IF NOT EXISTS gps_price_band (
  offer_key   text PRIMARY KEY
                CHECK (offer_key IN (
                  'diagnostic', 'mica_whitepaper',
                  'legal_opinion_coordination', 'gtm_sprint',
                  'marketing_activation'
                )),
  low_cents   bigint NOT NULL CHECK (low_cents  > 0),
  mid_cents   bigint NOT NULL CHECK (mid_cents  > 0),
  high_cents  bigint NOT NULL CHECK (high_cents > 0),
  currency    text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  stated_by   text NOT NULL CHECK (length(btrim(stated_by)) > 0
                                   AND length(stated_by) <= 120),
  stated_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gps_price_band_ascending
    CHECK (low_cents <= mid_cents AND mid_cents <= high_cents)
);

ALTER TABLE gps_price_band ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_price_band IS
  'GPS price band: what LCX SELLS one offer for, low/mid/high, integer cents, stated by a named human. The SELL side - gps_rate_card is the COST side and the two must never be conflated. No client_id: a price that varies by client is a negotiated price and lives on gps_engagement. Absent rows are not an error - the compiled placeholder (packages/shared/src/gps/catalogue.ts TODO_PRICE_BANDS) is used instead and every surface badges it as a placeholder.';
