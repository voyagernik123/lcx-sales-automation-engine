-- ──────────────────────────────────────────────
--  0052 — GPS UNDERWRITING: the rate cards and effort triples that do not exist
--
--  `apps/api/src/gps/underwrite.ts:114` has named this file since Phase 9 and it
--  was never written, so every underwriting on this platform refuses with
--  UNDERWRITING_REGISTRY_ABSENT. This is that file, built to the spec the code
--  already carries as data (`UNDERWRITING_MIGRATION_SPEC`, underwrite.ts:129) so
--  the refusal message and the schema cannot disagree.
--
--  TWO TABLES AND ONE COLUMN, and the shape is the spec's, not a new opinion:
--    gps_rate_card      what a NAMED PARTNER charges LCX for ONE OFFER, with the
--                       expiry that makes it re-confirmable.
--    gps_effort_triple  partner-days per engagement of an offer. Per OFFER, never
--                       per partner — a cheap partner must not become a fast one
--                       on no evidence (`underwrite.ts:83`).
--    gps_engagement.partner_id  WHO IS DELIVERING. Genuinely per engagement, and
--                       the only thing that says whose rate to underwrite against.
--
--  ══ NO ARTIFACT, ATTACHMENT, LOCATION, URL OR MIME COLUMN EXISTS HERE ════════
--  Decision D2 — does LCX's legal/DPO accept controller vs processor for a third
--  party's confidential material, and the subprocessor chain through
--  Supabase/Render/Cloudflare/OpenRouter, retention and erasure — is UNANSWERED.
--  So the system stays physically incapable of holding a client document rather
--  than merely discouraged (0047_gps.sql:26-36, GPS_IMPLEMENTATION_PLAN.md §4
--  S0.4). `intakeLockout.test.ts` discovers migrations by CONTENT and will fail the
--  build on a byte-bearing column or a byte-shaped name, including in this file.
--
--  NO client_id ON EITHER TABLE, AND THAT IS THE DECISION. 0047 put client_id on
--  every table it created; these two are POLICY-SHAPED, like
--  gps_jurisdiction_profile (0050_gps_perimeter.sql), and a rate that varies by
--  client is not a rate card — it is a negotiated price, which already lives on the
--  engagement. Carrying client_id would also break the primary key the reader
--  depends on (`underwrite.ts:430` reads by (partner_id, offer_key) alone) and
--  would invite "what did we charge THIS client's partner", a question whose answer
--  must come from the engagement, not from the bench.
--
--  NO MARGIN, COST OR p_loss COLUMN. All three are derived (`marginCents`,
--  packages/shared/src/gps/types.ts); a stored copy is the stale number a screen
--  quotes after the rate changed.
--
--  Idempotent and forward-only: every statement is IF NOT EXISTS, so re-running
--  the file is a no-op. Applied BY HAND in the Supabase SQL editor — nothing wires
--  this runner into the deploy (`db/migrate.ts`).
-- ──────────────────────────────────────────────

-- ── Rate cards ────────────────────────────────────────────────────────────────
--  ONE CARD PER (PARTNER, OFFER), which is exactly what `Partner.rateCards`
--  (`packages/shared/src/gps/partners.ts:176`) means by "one card per offer they
--  can deliver". The composite primary key IS that rule, so a second card for the
--  same pair cannot be inserted and quietly win a read.
CREATE TABLE IF NOT EXISTS gps_rate_card (
  -- TEXT, NOT AN FK. The bench is not a table (`partners.ts:305`: "When names
  -- arrive they are ROWS, not entries here") and 0047 set the precedent with
  -- `owner`. An FK to the BD `partners` table (0024_dealdesk_ext.sql:66) would
  -- silently equate a referral counterparty with a delivery partner.
  partner_id       text NOT NULL CHECK (length(btrim(partner_id)) > 0
                                        AND length(partner_id) <= 120),

  -- The database's copy of OfferKey, same closed union and same reason as
  -- 0047_gps.sql:139: a typo in a payload fails here rather than creating a rate
  -- card for an offer that does not exist.
  offer_key        text NOT NULL
                     CHECK (offer_key IN (
                       'diagnostic', 'mica_whitepaper',
                       'legal_opinion_coordination', 'gtm_sprint',
                       'marketing_activation'
                     )),

  -- Mirrors RateUnit (`partners.ts:161`).
  unit             text NOT NULL CHECK (unit IN ('fixed', 'day_rate', 'hourly')),

  -- COST TO US per unit, integer cents. NO DEFAULT: a defaulted 0 prices the work
  -- as free, and a proposal underwritten against free labour is the most flattering
  -- lie this table could tell.
  amount_cents     bigint NOT NULL CHECK (amount_cents >= 0),

  -- NULLABLE, and null on a metered unit means the cost CANNOT be derived.
  -- `rateCardCostCents` returns null rather than assuming 1 (`partners.ts:233`);
  -- do NOT add DEFAULT 1 here — it would invent a quantity nobody stated.
  expected_units   numeric CHECK (expected_units > 0),

  -- NULLABLE, required only for an hourly card because the effort triple is in
  -- DAYS. It lives HERE and never on the request: an assumed 8 is an invented
  -- number on a proposal, and a caller who wanted a better-looking margin would
  -- supply 1.
  hours_per_day    numeric CHECK (hours_per_day > 0),

  -- Pass-through that does not scale with effort — counsel's own fee
  -- (`catalogue.ts:79`). Defaulted to 0 because "no pass-through" is the ordinary
  -- case and 0 states it truthfully.
  fixed_cost_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_cost_cents >= 0),

  -- ISO-4217, uppercase, as a CLOSED PATTERN rather than a length cap. Partners
  -- invoice in their own currency; NOTHING HERE CONVERTS, and a mismatch against
  -- the quote is a refusal upstream, never a silent conversion. The pattern is the
  -- same ratchet `gps/actions.ts` applies at the edge — three bytes drawn from 26
  -- letters is not a channel into the compartment.
  currency         text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

  -- NULLABLE, AND NULL IS UNUSABLE RATHER THAN FOREVER. `rateCardStatus` returns
  -- `no_validity_stated` and the underwriting refuses (`underwrite.ts:385`). NO
  -- DEFAULT, deliberately: a defaulted expiry is a fabricated re-confirmation date,
  -- the precise failure `RateCard.validUntil` exists to prevent.
  valid_until      date,

  -- A NAMED HUMAN, never a service account and never a body field: the shared
  -- machine key holds `gps` at operate (`access/entitlements.ts:39`), so a card
  -- written by a cron job would be an unattributable cost basis. Same posture as
  -- gps_conflict_check.decided_by (0047_gps.sql:286), with the same honest limit —
  -- attribution is only as strong as the shared DESK_PASSCODE until per-person
  -- credentials exist.
  stated_by        text NOT NULL CHECK (length(btrim(stated_by)) > 0
                                        AND length(stated_by) <= 120),
  stated_at        timestamptz NOT NULL DEFAULT now(),

  -- Display name for the reason strings only. NEVER used to join — the join key is
  -- partner_id, and a label that drifts must not be able to re-point a rate.
  partner_label    text CHECK (partner_label IS NULL OR length(partner_label) <= 200),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- An hourly card with no hours per day cannot be converted from the effort
  -- triple's DAYS, so it would price at null and refuse anyway. Refusing at write
  -- time names the missing field to the person who can supply it.
  CONSTRAINT gps_rate_card_hourly_needs_hours_per_day
    CHECK (unit <> 'hourly' OR hours_per_day IS NOT NULL),

  PRIMARY KEY (partner_id, offer_key)
);

-- "Who can deliver this offer, and at what" — the read behind partner selection.
CREATE INDEX IF NOT EXISTS gps_rate_card_offer_idx
  ON gps_rate_card (offer_key, valid_until);

-- THE RE-CONFIRMATION LIST: cards that expire soonest, and the ones that never
-- stated a validity at all. Partial on the second so the "nobody re-confirmed
-- this" population is a scan of exactly those rows.
CREATE INDEX IF NOT EXISTS gps_rate_card_expiry_idx
  ON gps_rate_card (valid_until NULLS FIRST);

CREATE INDEX IF NOT EXISTS gps_rate_card_no_validity_idx
  ON gps_rate_card (partner_id, offer_key)
  WHERE valid_until IS NULL;


-- ── Effort triples ────────────────────────────────────────────────────────────
--  PARTNER-DAYS PER ENGAGEMENT OF ONE OFFER — the input GPS_100X_PLAN.md §12 says
--  only the founder can supply, and which "turns the underwriting screen from a
--  prior into a model". Until a row exists here, `underwrite.ts` uses the shipped
--  placeholder and says so on every response (`isPlaceholder`).
--
--  NO CHECK ORDERS THE THREE, on purpose. `resolveDuration` (`launchSim.ts:160`)
--  already clamps them (min ≥ 0, mode ≥ min, max ≥ mode) and that clamping is
--  tested; a CHECK here would turn a transposed pair into a 500 instead of a
--  visibly odd triple a human can correct.
CREATE TABLE IF NOT EXISTS gps_effort_triple (
  offer_key        text PRIMARY KEY
                     CHECK (offer_key IN (
                       'diagnostic', 'mica_whitepaper',
                       'legal_opinion_coordination', 'gtm_sprint',
                       'marketing_activation'
                     )),

  optimistic_days  numeric NOT NULL CHECK (optimistic_days >= 0),
  likely_days      numeric NOT NULL CHECK (likely_days >= 0),
  pessimistic_days numeric NOT NULL CHECK (pessimistic_days >= 0),

  -- The founder, by name. A triple with no author is a guess with a schema.
  stated_by        text NOT NULL CHECK (length(btrim(stated_by)) > 0
                                        AND length(stated_by) <= 120),
  stated_at        timestamptz NOT NULL DEFAULT now(),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);


-- ── Who is delivering this engagement ─────────────────────────────────────────
--  NULLABLE, AND NULL BLOCKS ISSUANCE RATHER THAN BEING INFERRED. With one card on
--  record it is tempting to guess the partner, but "this engagement will be
--  delivered by X" is a claim nobody made, and the margin printed on a proposal
--  must not rest on one (D8). Text, not an FK, for the same reason as
--  gps_rate_card.partner_id above.
--
--  `underwrite.ts:223` probes for this column SEPARATELY from the two tables,
--  because a deploy where the tables exist and the column does not is the expected
--  middle state of applying this file by hand.
ALTER TABLE gps_engagement ADD COLUMN IF NOT EXISTS partner_id text;

-- Every engagement a named partner is on the hook for — the read behind capacity
-- and behind "who is carrying our concentration risk".
CREATE INDEX IF NOT EXISTS gps_engagement_partner_idx
  ON gps_engagement (partner_id, status)
  WHERE partner_id IS NOT NULL;


-- ── Row Level Security ────────────────────────────────────────────────────────
--  Declared here, not left to a dashboard button, for the reason 0047_gps.sql:333
--  gives: Supabase offers "Run and enable RLS" when it sees a CREATE TABLE in
--  `public` without it, and taking that option leaves the security posture living
--  in a click nobody records.
--
--  gps_rate_card is WHAT A NAMED THIRD PARTY CHARGES LCX per offer — the most
--  commercially sensitive table in this compartment after gps_outcome, and it is
--  also the whole of LCX's cost basis. Without RLS, anyone holding the project's
--  anon key could read the bench's pricing out of the auto-generated REST API.
--
--  NO POLICIES, deliberately: RLS with no policy is deny-all, which is the intent.
--  The API connects as the database owner and bypasses RLS, the same arrangement
--  0042 relies on and 0047/0049/0050 repeat. RLS closes the anon-key path and
--  nothing more — it does not scope reads between desk members (that is the
--  entitlement gate).
ALTER TABLE gps_rate_card     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_effort_triple ENABLE ROW LEVEL SECURITY;


-- ── What `\d+` tells the next person ──────────────────────────────────────────
--  The person most likely to misuse a column is the one who never opened the
--  migration. COMMENT replaces, so re-running the file is a no-op.
COMMENT ON TABLE gps_rate_card IS
  'GPS rate card: what a NAMED PARTNER charges LCX for ONE OFFER, with its unit, its currency, the human who stated it and its EXPIRY. Cost basis, not client data — it carries no client_id and must never vary by client. Read by packages/shared/src/gps/partners.ts rateCardCostCents via apps/api/src/gps/underwrite.ts; a card past valid_until, or with none stated, is UNUSABLE and the underwriting refuses rather than pricing against it. See 0052_gps_underwriting.sql.';

COMMENT ON COLUMN gps_rate_card.valid_until IS
  'EXPIRY, and NULL means UNUSABLE rather than forever: rateCardStatus returns no_validity_stated and the underwriting refuses. There is deliberately no DEFAULT — a defaulted expiry is a re-confirmation date nobody gave.';

COMMENT ON COLUMN gps_rate_card.hours_per_day IS
  'Required only for an hourly card, because the effort triple is in DAYS. It lives on the card and never on the request: a caller-supplied 8 is an invented number on a proposal.';

COMMENT ON TABLE gps_effort_triple IS
  'GPS effort triple: partner-days per engagement of ONE OFFER, three-point, stated by a named human. Per offer and NOT per partner — a per-partner triple would let a cheap partner also be modelled as a fast one on no evidence. Absent rows are not an error: underwrite.ts falls back to the shipped placeholder and labels every figure derived from it as a placeholder. See 0052_gps_underwriting.sql.';

COMMENT ON COLUMN gps_engagement.partner_id IS
  'WHO IS DELIVERING. Nullable, and NULL BLOCKS PROPOSAL ISSUANCE rather than being inferred from the only rate card on file: "X will deliver this" is a claim a human makes. Text, not an FK — the delivery bench is not a table.';
