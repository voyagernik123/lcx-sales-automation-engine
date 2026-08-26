-- ═══════════════════════════════════════════════════════════════════════════
-- APPLY 0075–0082 · the eight pending GPS migrations, in ledger order.
-- Generated 2026-08-26 from apps/api/src/db/migrations/ at commit 2dc4ae4.
-- Byte-for-byte concatenation — nothing edited, nothing summarised.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and run once.
-- It is wrapped in a single transaction: it either all lands or none of it does.
-- Every CREATE is IF NOT EXISTS, so re-running after a partial failure is safe.
--
-- PREREQUISITES (already applied on prod per the ledger): gps_client +
-- gps_engagement (0047), gps_deliverable (0049), gps_target (0054), partners
-- (0024). If any FK below fails, STOP — that means an earlier migration is
-- missing, and the fix is to apply it, never to edit this file.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────── 0075_gps_partner_registry.sql ───────────────────────────────

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

-- ─────────────────────────────── 0076_gps_packets.sql ───────────────────────────────

-- 0076 · G0 — THE FOUNDER PACKETS: the sell-side price register, and the decision record.
--
-- Two tables, one phase (GPS_REVENUE_100X_PLAN.md §G0, approved 2026-08-21):
--
--  1 · gps_price_band — the register gpsInputs.ts has PROMISED since it shipped: every
--      write there refuses with PRICE_BAND_REGISTER_ABSENT carrying this exact DDL and the
--      instruction to "land this same text as the next free numbered file". This is that
--      file. The section between the BEGIN/END VERBATIM markers is byte-identical to
--      PRICE_BAND_REGISTER_DDL (apps/api/src/routes/gpsInputs.ts) — extracted from the
--      export, not retyped — and gpsPackets.test.ts asserts the two never drift.
--
--  2 · gps_packet_decision — the append-only record of what the owner decided about each
--      founder packet. The FINAL payload (his edits included) is stored as the JSON the
--      apply step ran on, because "what did I actually approve" must be answerable from
--      one row forever. No UPDATE path: a change of mind is a NEW decision row, and the
--      newest row per kind wins — same append-only reasoning as the desk-mode ledger.
--
-- RLS ON, NO POLICIES on both — deny-all to the anon key; the API connects as the owner
-- and bypasses it, exactly as 0052:214 and 0047:333.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: no client material enters
-- through anything here. gps_price_band holds five integer-cent bands stated by a named
-- human; gps_packet_decision holds the owner's decisions about the five founder packets —
-- and one of those decisions IS the DPO question itself (packet_kind = 'dpo_memo': whether
-- LCX acts as controller or processor for client-supplied confidential material, and on
-- what DPA terms). This table RECORDS that answer; it does not act on it — G4's portal
-- reads the standing dpo_memo decision and ships exactly what it permits, and until such
-- a decision exists the intake lockout keeps refusing every upload surface as before.
-- final_proposal is jsonb and was admitted to intakeLockout.test.ts's frozen jsonb set
-- with a full review: keys AND values bounded at the only writer, no read republication.

-- ── BEGIN VERBATIM PRICE_BAND_REGISTER_DDL ─────────────────────────────────────
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
-- ── END VERBATIM PRICE_BAND_REGISTER_DDL ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS gps_packet_decision (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  packet_kind   text NOT NULL CHECK (packet_kind IN (
                  'price_bands', 'effort_triples', 'rate_cards',
                  'perimeter_seed', 'dpo_memo'
                )),
  decision      text NOT NULL CHECK (decision IN (
                  'approved', 'approved_with_edits', 'rejected'
                )),
  -- The FINAL proposal the decision was made on — the owner's edits included. jsonb so
  -- the apply step and any later audit read the same bytes the approval saw. Never a
  -- document store: the shapes here are the five typed proposals and nothing else, and
  -- the API validates with packetProposalDefects before any INSERT.
  final_proposal jsonb NOT NULL,
  -- What the apply step did, recorded honestly: rate_cards and dpo_memo are
  -- 'recorded_only' BY DESIGN (bench empty / G4 reads the decision later), so a
  -- three-state 'applied' boolean would lie about them.
  apply_state   text NOT NULL CHECK (apply_state IN (
                  'applied', 'recorded_only', 'apply_failed'
                )),
  apply_detail  text NOT NULL CHECK (length(btrim(apply_detail)) > 0),
  decided_by    text NOT NULL CHECK (length(btrim(decided_by)) > 0
                                     AND length(decided_by) <= 120),
  decided_at    timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS gps_packet_decision_kind_idx
  ON gps_packet_decision (packet_kind, decided_at DESC);

ALTER TABLE gps_packet_decision ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_packet_decision IS
  'Append-only record of founder-packet decisions (G0). One row per decision; the newest row per packet_kind is the standing decision. final_proposal is the exact JSON the apply step ran on - what the owner approved, edits included. apply_state distinguishes applied (rows written), recorded_only (deliberate: rate_cards await a named partner, dpo_memo is read by G4), and apply_failed (decision stands, apply must be retried).';

-- ─────────────────────────────── 0077_gps_demand.sql ───────────────────────────────

-- 0077 · G1 — THE DEMAND QUEUE: candidates from four channels, promoted by a human or
-- refused with a reason, never silently absorbed.
--
-- One table. A candidate is a LEAD FOR A SERVICE, not a service record: it carries an
-- identity (project name / link), a hypothesis (which offer, or 'unsure'), the REASON it
-- exists (citing the fields or the matched signal that argued for it — D1), a provenance
-- grade, and an idempotency key so a replayed export or a re-run crossfeed cannot double
-- the queue. Promotion writes an origination target through the SAME path a human uses
-- (POST /origination/targets); this table only records that it happened.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: no client material enters
-- here. The columns are typed text with hard caps — no jsonb, deliberately, so the frozen
-- jsonb review set (intakeLockout.test.ts) does not grow. Two columns carry personal-ish
-- data and each is bounded and justified: contact_email exists ONLY for inbound intake
-- (the requester typed their own address into a form that says why it is collected), and
-- snippet is the Telegram sieve's ≤240-char matched context — sender names, usernames and
-- ids are DROPPED at parse (packages/shared/src/gps/demand.ts) and counted in the drop
-- report, so what lands here is an announcement fragment, not a conversation.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner, exactly
-- as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_demand_candidate (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source           text NOT NULL CHECK (source IN (
                     'bd_crossfeed', 'inbound_intake', 'telegram_import', 'partner_referral'
                   )),
  source_ref       text NOT NULL CHECK (length(btrim(source_ref)) > 0
                                        AND length(source_ref) <= 200),
  project_name     text NOT NULL CHECK (length(btrim(project_name)) > 0
                                        AND length(project_name) <= 120),
  url              text CHECK (url IS NULL OR length(url) <= 300),
  chain            text CHECK (chain IS NULL OR length(chain) <= 80),
  jurisdiction     text CHECK (jurisdiction IS NULL OR length(jurisdiction) <= 200),
  offer_hypothesis text NOT NULL CHECK (offer_hypothesis IN (
                     'diagnostic', 'mica_whitepaper', 'legal_opinion_coordination',
                     'gtm_sprint', 'marketing_activation', 'unsure'
                   )),
  reason           text NOT NULL CHECK (length(btrim(reason)) > 0
                                        AND length(reason) <= 500),
  snippet          text CHECK (snippet IS NULL OR length(snippet) <= 240),
  provenance_grade text NOT NULL CHECK (provenance_grade IN ('B2', 'B3', 'C3')),
  contact_email    text CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  observed_at      timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN (
                     'proposed', 'promoted', 'refused'
                   )),
  refusal_reason   text CHECK (refusal_reason IS NULL OR (length(btrim(refusal_reason)) > 0
                                                          AND length(refusal_reason) <= 500)),
  promoted_target_id text,
  created_by       text NOT NULL CHECK (length(btrim(created_by)) > 0
                                        AND length(created_by) <= 120),
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  CONSTRAINT gps_demand_candidate_ref UNIQUE (source, source_ref),
  -- A refusal without a reason and a promotion without a target are both half-records;
  -- the CHECK makes each state carry its own evidence or not exist.
  CONSTRAINT gps_demand_refusal_reasoned
    CHECK (status <> 'refused' OR refusal_reason IS NOT NULL),
  CONSTRAINT gps_demand_promotion_targeted
    CHECK (status <> 'promoted' OR promoted_target_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS gps_demand_status_idx
  ON gps_demand_candidate (status, created_at DESC);

ALTER TABLE gps_demand_candidate ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_demand_candidate IS
  'GPS demand queue (G1): service-lead candidates from four channels with provenance and an idempotency key. Promotion to an origination target is a HUMAN act through the same route manual curation uses; refusal records its reason. No client material, no jsonb; contact_email only from consented inbound intake; telegram snippets are minimised at parse (<=240 chars, senders dropped).';

-- ─────────────────────────────── 0078_gps_dossier.sql ───────────────────────────────

-- 0078 · G2 — DOSSIERS & OUTREACH: what the model wrote, what it cited, and what the
-- gate said — stored as records of OUR OWN work, never as client material.
--
-- Two tables.
--
-- gps_dossier holds a model-drafted research dossier that SURVIVED the shared
-- validator (packages/shared/src/gps/dossier.ts): every claim in its register section
-- cites a numbered register fact, its model-knowledge section opens with the exact C3
-- caveat, and a response that broke that shape was refused upstream and never reached
-- this table. `fact_refs_cited >= 1` restates the floor of that contract in the
-- schema: a stored dossier grounded in nothing is inexpressible. Acceptance is a NAMED
-- HUMAN act (doctrine D10: an AI draft is provenance, not authority) — the CHECKs make
-- an acceptance without a person, or a rejection without a reason, half-records the
-- register refuses to hold.
--
-- gps_outreach_draft holds first-contact drafts TOGETHER WITH the marketing outbound
-- gate's verdict on them (the one-mouth rule: GPS drafts, marketing's gate judges, a
-- human sends — or does not — outside this system entirely). There is deliberately no
-- 'sent' state, no recipient column and no transport reference here: a table that
-- cannot say "sent" cannot quietly become a sender. The refusal codes stored are the
-- SCOPED ones a caller may see; the gate's unscoped ledger stays in marketing's own
-- decision table, written by the same `recordGateDecision` every marketing surface uses.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: nothing here is a third
-- party's confidential material. The dossier text and the outreach draft are LCX's own
-- generated work product about a target already on the curated register. The prompt
-- that produced them carries register fields ONLY and — by construction of the shared
-- fact builder, which has no field for one — no person's name, so what reaches the
-- model provider is business metadata LCX already holds under the register's basis.
-- No jsonb anywhere, so the frozen jsonb review set (intakeLockout.test.ts) does not
-- grow; every text column is hard-capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_dossier (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_id        uuid NOT NULL REFERENCES gps_target(id),
  offer_key        text NOT NULL CHECK (offer_key IN (
                     'diagnostic', 'mica_whitepaper', 'legal_opinion_coordination',
                     'gtm_sprint', 'marketing_activation', 'unsure'
                   )),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN (
                     'draft', 'accepted', 'rejected'
                   )),
  dossier_md       text NOT NULL CHECK (length(btrim(dossier_md)) > 0
                                        AND length(dossier_md) <= 20000),
  model            text NOT NULL CHECK (length(btrim(model)) > 0 AND length(model) <= 120),
  -- How many distinct register facts the surviving dossier cited. The validator
  -- refused zero-citation responses; this floor keeps that true against any future
  -- caller that skips the validator.
  fact_refs_cited  integer NOT NULL CHECK (fact_refs_cited >= 1),
  generated_by     text NOT NULL CHECK (length(btrim(generated_by)) > 0
                                        AND length(generated_by) <= 120),
  generated_at     timestamptz NOT NULL DEFAULT now(),
  decided_by       text CHECK (decided_by IS NULL OR (length(btrim(decided_by)) > 0
                                                      AND length(decided_by) <= 120)),
  decided_at       timestamptz,
  decision_note    text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  -- Acceptance and rejection each carry their own evidence or do not exist.
  CONSTRAINT gps_dossier_acceptance_named
    CHECK (status <> 'accepted' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT gps_dossier_rejection_reasoned
    CHECK (status <> 'rejected' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL
                                    AND decision_note IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gps_dossier_target_idx ON gps_dossier (target_id, generated_at DESC);

ALTER TABLE gps_dossier ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gps_outreach_draft (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_id          uuid NOT NULL REFERENCES gps_target(id),
  -- The accepted dossier the draft built on, when there was one. SET NULL, not
  -- CASCADE: losing the dossier must not silently erase the record that a draft
  -- existed and was judged.
  dossier_id         bigint REFERENCES gps_dossier(id) ON DELETE SET NULL,
  channel            text NOT NULL CHECK (channel IN (
                       'email', 'telegram', 'linkedin', 'x_public'
                     )),
  draft_text         text NOT NULL CHECK (length(btrim(draft_text)) > 0
                                          AND length(draft_text) <= 2000),
  model              text NOT NULL CHECK (length(btrim(model)) > 0 AND length(model) <= 120),
  -- The outbound gate's verdict, as of drafting. `gate_reference` is the digest
  -- prefix an approver can look up in marketing's decision ledger; the codes are the
  -- scoped refusals a drafter is allowed to see.
  gate_allowed       boolean NOT NULL,
  gate_disposition   text NOT NULL CHECK (length(gate_disposition) <= 40),
  gate_refusal_codes text NOT NULL DEFAULT '' CHECK (length(gate_refusal_codes) <= 2000),
  gate_reference     text NOT NULL CHECK (length(gate_reference) <= 64),
  created_by         text NOT NULL CHECK (length(btrim(created_by)) > 0
                                          AND length(created_by) <= 120),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_outreach_draft_target_idx
  ON gps_outreach_draft (target_id, created_at DESC);

ALTER TABLE gps_outreach_draft ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────── 0079_gps_pricing_policy.sql ───────────────────────────────

-- 0079 · G3 — THE PRICING POLICY: two dials, append-only, latest row live.
--
-- One tiny table, holding the owner's answer to "what may an engagement risk and
-- what must it earn": a target margin at the median outcome and a ceiling on the
-- probability of a realised loss. The inverse solver (packages/shared/src/gps/
-- pricing.ts) reads the LATEST row and refuses to propose a price without one —
-- so an unapproved policy is a stated refusal at the propose-price route, never a
-- default someone forgot they were using.
--
-- APPEND-ONLY, like gps_packet_decision: a change of mind is a NEW row with a new
-- author and instant, and the history of what the desk priced under is preserved.
-- There is no UPDATE path and no 'active' flag to flip — the ordering is the state.
--
-- The CHECKs restate pricing.ts's PRICING_POLICY_BOUNDS in the schema: a margin
-- target in (0, 0.9] and a loss ceiling in (0, 0.5]. Out-of-bounds dials are
-- refused twice before this table could see them (the packet validator and the
-- solver's own defect check); the constraints make a third writer impossible too.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: nothing here is or
-- touches client material — two numerics, a rationale in the owner's own words,
-- and an attribution. No jsonb, every text column capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_pricing_policy (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_margin_pct numeric(5, 4) NOT NULL CHECK (target_margin_pct > 0
                                                  AND target_margin_pct <= 0.9),
  p_loss_ceiling    numeric(5, 4) NOT NULL CHECK (p_loss_ceiling > 0
                                                  AND p_loss_ceiling <= 0.5),
  rationale         text NOT NULL CHECK (length(btrim(rationale)) > 0
                                         AND length(rationale) <= 2000),
  decided_by        text NOT NULL CHECK (length(btrim(decided_by)) > 0
                                         AND length(decided_by) <= 120),
  decided_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_pricing_policy_latest_idx
  ON gps_pricing_policy (decided_at DESC, id DESC);

ALTER TABLE gps_pricing_policy ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────── 0080_gps_portal.sql ───────────────────────────────

-- 0080 · G4 — THE PORTAL PLANE: the client inside the loop, in a separate country (D9).
--
-- Three tables, and one design rule across all of them: THE CLIENT PLANE HOLDS TYPED
-- FACTS AND EVENTS, NEVER BYTES AND NEVER A CREDENTIAL. A session row stores the
-- SHA-256 digest of its magic-link token — the token itself exists once, in the
-- response that minted it, and is carried to the client by a human. There is no
-- password, no email-verification loop, no account: a session is scoped to ONE
-- engagement, expires on a date the minting approver chose, and dies instantly on
-- revocation. `label` says who the link was cut for, in the approver's words, and it
-- is the attribution every portal act carries ('portal:<label>').
--
-- gps_portal_fact is the client answering `ServiceOffer.requiredClientInputs` — the
-- catalogue's own closed set per offer, validated at the edge against that list and
-- nothing else. APPEND-ONLY, latest row per key wins: a corrected answer is a new row,
-- and the history of what the client said first is evidence, not clutter. Values are
-- capped TEXT — a fact is a sentence or a link the desk reads; a fact long enough to
-- be a document is refused at the edge and unstorable here.
--
-- gps_portal_event is the client-plane audit floor: every session use, fact batch,
-- acceptance and refused upload-intent lands here with its session. G6 reads
-- 'acceptance_recorded' events as the commercial evidence that a CLIENT accepted the
-- deliverable an invoice derives from.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: this migration is the
-- one that could have opened the client-document door, and it does not. NO byte
-- column, NO filename column, NO storage reference exists here. The portal's upload
-- endpoint records an INTENT event and refuses the bytes with the reason, until the
-- dpo_memo packet decision (0076) exists, is approved, and recommends
-- adopt_processor_dpa — the decision D2 is waiting on, made by a named human, not
-- defaulted by a route. No jsonb anywhere; every text column hard-capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_portal_session (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  -- SHA-256 of the bearer token, hex. The token never lands anywhere.
  token_digest   text NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  label          text NOT NULL CHECK (length(btrim(label)) > 0 AND length(label) <= 254),
  minted_by      text NOT NULL CHECK (length(btrim(minted_by)) > 0 AND length(minted_by) <= 120),
  minted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoked_by     text CHECK (revoked_by IS NULL OR length(revoked_by) <= 120),
  last_seen_at   timestamptz,
  CONSTRAINT gps_portal_session_expiry_sane CHECK (expires_at > minted_at),
  -- A revocation without a revoker is a half-record; both or neither.
  CONSTRAINT gps_portal_session_revocation_named
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE INDEX IF NOT EXISTS gps_portal_session_engagement_idx
  ON gps_portal_session (engagement_id, minted_at DESC);

ALTER TABLE gps_portal_session ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gps_portal_fact (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES gps_portal_session(id),
  -- One of the engagement's offer's requiredClientInputs, verbatim. Validated at
  -- the edge against the catalogue; the cap here is the backstop.
  fact_key       text NOT NULL CHECK (length(btrim(fact_key)) > 0 AND length(fact_key) <= 200),
  fact_value     text NOT NULL CHECK (length(btrim(fact_value)) > 0 AND length(fact_value) <= 2000),
  submitted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_portal_fact_engagement_idx
  ON gps_portal_fact (engagement_id, fact_key, submitted_at DESC);

ALTER TABLE gps_portal_fact ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gps_portal_event (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES gps_portal_session(id),
  kind           text NOT NULL CHECK (kind IN (
                   'session_used', 'facts_submitted', 'acceptance_recorded',
                   'acceptance_refused', 'upload_intent_recorded', 'upload_refused'
                 )),
  -- What, in one capped sentence: the deliverable name, the fact count, the refusal
  -- reason. Never a document, never a token.
  detail         text NOT NULL CHECK (length(detail) <= 500),
  at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_portal_event_engagement_idx
  ON gps_portal_event (engagement_id, at DESC);

ALTER TABLE gps_portal_event ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────── 0081_gps_factory.sql ───────────────────────────────

-- 0081 · G5 — THE DELIVERY FACTORY: versioned drafts under QA, and the stage
-- actuals that finally measure the waterfall.
--
-- gps_draft holds Stage 1 output that SURVIVED the shared shape validator
-- (packages/shared/src/gps/factory.ts): every template section present, in order,
-- under the cap — and, upstream of that, generated only after `slotGaps` found
-- every required client input answered (D10: a draft never runs ahead of the
-- client's own facts; the model writes [FACT REQUIRED: …] markers, never plausible
-- inventions). Versions are per engagement and append-only: a rework is a NEW
-- version, the old one keeps its decision, and UNIQUE(engagement_id, version)
-- makes a version collision a refusal instead of a race.
--
-- QA IS THE EXISTING REVIEW GATE, NOT A PARALLEL ONE. When a draft linked to a
-- deliverable is QA-accepted, the service marks that deliverable reviewed through
-- the delivery desk's own `recordDeliverableReview` — so the 0049 constraint
-- ("accepted before reviewed is unstorable") now protects the whole waterfall:
-- client acceptance (G4 portal) is impossible until a named human accepted the
-- draft here. One gate, three stages leaning on it.
--
-- gps_stage_actual is the effort truth: hours and cost per stage, recorded by a
-- named human, append-only. This is the table the calibration loop was starving
-- for — G0's effort triples stop being estimates the day rows exist here.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: a draft is LCX's
-- own generated work product. Its prompt carries engagement facts and the client's
-- OWN TYPED answers from the portal (collected under a form that says why) — no
-- client document, no byte column, no filename, no storage reference here. No
-- jsonb; every text column hard-capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_draft (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  -- The deliverable this draft is FOR, when the plan has one. SET NULL keeps the
  -- draft history when a deliverable is re-planned.
  deliverable_id uuid REFERENCES gps_deliverable(id) ON DELETE SET NULL,
  offer_key      text NOT NULL CHECK (offer_key IN (
                   'diagnostic', 'mica_whitepaper', 'legal_opinion_coordination',
                   'gtm_sprint', 'marketing_activation'
                 )),
  version        integer NOT NULL CHECK (version >= 1),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN (
                   'draft', 'accepted', 'rework', 'superseded'
                 )),
  draft_text     text NOT NULL CHECK (length(btrim(draft_text)) > 0
                                      AND length(draft_text) <= 60000),
  model          text NOT NULL CHECK (length(btrim(model)) > 0 AND length(model) <= 120),
  -- How many required slots were filled at generation. The validator refused any
  -- generation with a gap; this floor keeps that true against future callers.
  slots_filled   integer NOT NULL CHECK (slots_filled >= 1),
  generated_by   text NOT NULL CHECK (length(btrim(generated_by)) > 0
                                      AND length(generated_by) <= 120),
  generated_at   timestamptz NOT NULL DEFAULT now(),
  decided_by     text CHECK (decided_by IS NULL OR (length(btrim(decided_by)) > 0
                                                    AND length(decided_by) <= 120)),
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  CONSTRAINT gps_draft_version_once UNIQUE (engagement_id, version),
  -- A QA acceptance carries its human; a rework carries its human AND its why.
  CONSTRAINT gps_draft_acceptance_named
    CHECK (status <> 'accepted' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT gps_draft_rework_reasoned
    CHECK (status <> 'rework' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL
                                  AND decision_note IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gps_draft_engagement_idx ON gps_draft (engagement_id, version DESC);

ALTER TABLE gps_draft ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gps_stage_actual (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  stage          text NOT NULL CHECK (stage IN ('ai_draft', 'internal_qa', 'partner')),
  hours          numeric(7, 2) NOT NULL CHECK (hours >= 0 AND hours <= 2000),
  cost_cents     bigint NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  note           text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by    text NOT NULL CHECK (length(btrim(recorded_by)) > 0
                                      AND length(recorded_by) <= 120),
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_stage_actual_engagement_idx
  ON gps_stage_actual (engagement_id, recorded_at DESC);

ALTER TABLE gps_stage_actual ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────── 0082_gps_invoice.sql ───────────────────────────────

-- 0082 · G6 — MONEY: invoices the book believes.
--
-- One table, and one invariant that is the whole point: AN INVOICE THAT DOES NOT
-- TRACE TO AN ACCEPTED DELIVERABLE IS INEXPRESSIBLE (plan §G6, D1/D8). deliverable_id
-- is NOT NULL and the service refuses to insert unless that deliverable's accepted_at
-- is set — i.e. a named human (desk QA) or the client (G4 portal) has accepted the
-- thing being billed. There is no free-form invoice path and no column for one.
--
-- THE NUMBER IS THE IDENTITY, so it is immutable by construction: invoice_number is
-- derived from the append-only `id` (GPS-000001…) in the shared layer, never stored
-- as a mutable string that could drift from the row it names. amount_cents and
-- currency are written once at issue and never updated — the only writes after issue
-- are STATUS TRANSITIONS, each into its own attributed columns, so the commercial
-- core is sealed like an audit row while the lifecycle still moves.
--
-- DISPUTES ARE A STATE, NOT A DELETE (plan §G6). void/disputed/paid each carry their
-- own reason/reference/actor/timestamp; a disputed invoice still exists, still ages,
-- and still shows in the book. A partial unique index lets a deliverable carry at
-- most one NON-void invoice — double-billing is a constraint violation, not a review
-- item — while a voided invoice may be re-issued.
--
-- RAILS STAY EXTERNAL (answer #10): marking paid is a governed action that RECORDS a
-- reference to a settlement that happened elsewhere. There is no bank integration,
-- no card field, no money movement — paid_reference is the human's proof, stored.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: an invoice is LCX's
-- own commercial record about its own engagement — no client material, no byte column.
-- No jsonb; every text column hard-capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_invoice (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  -- The accepted deliverable this bills. NOT NULL is the "traces to acceptance"
  -- invariant's first half; the service checking accepted_at is the second.
  deliverable_id uuid NOT NULL REFERENCES gps_deliverable(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  currency       text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status         text NOT NULL DEFAULT 'issued' CHECK (status IN (
                   'issued', 'paid', 'disputed', 'void'
                 )),
  issued_by      text NOT NULL CHECK (length(btrim(issued_by)) > 0 AND length(issued_by) <= 120),
  issued_at      timestamptz NOT NULL DEFAULT now(),
  -- Payment: a reference to a settlement that happened on an external rail.
  paid_at        timestamptz,
  paid_by        text CHECK (paid_by IS NULL OR length(paid_by) <= 120),
  paid_reference text CHECK (paid_reference IS NULL OR (length(btrim(paid_reference)) > 0
                                                        AND length(paid_reference) <= 200)),
  -- Dispute and void: states, each reasoned and attributed.
  disputed_at    timestamptz,
  disputed_by    text CHECK (disputed_by IS NULL OR length(disputed_by) <= 120),
  disputed_reason text CHECK (disputed_reason IS NULL OR (length(btrim(disputed_reason)) > 0
                                                          AND length(disputed_reason) <= 500)),
  voided_at      timestamptz,
  voided_by      text CHECK (voided_by IS NULL OR length(voided_by) <= 120),
  voided_reason  text CHECK (voided_reason IS NULL OR (length(btrim(voided_reason)) > 0
                                                       AND length(voided_reason) <= 500)),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Each terminal state carries its own evidence or does not exist.
  CONSTRAINT gps_invoice_paid_referenced
    CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL
                                AND paid_reference IS NOT NULL)),
  CONSTRAINT gps_invoice_dispute_reasoned
    CHECK (status <> 'disputed' OR (disputed_at IS NOT NULL AND disputed_by IS NOT NULL
                                    AND disputed_reason IS NOT NULL)),
  CONSTRAINT gps_invoice_void_reasoned
    CHECK (status <> 'void' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL
                               AND voided_reason IS NOT NULL)),
  -- The drift guard: an invoice's engagement and client agree with the engagement row.
  CONSTRAINT gps_invoice_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- At most one non-void invoice per deliverable: double-billing is a violation, not a
-- review item. A voided invoice frees the deliverable to be re-issued.
CREATE UNIQUE INDEX IF NOT EXISTS gps_invoice_one_per_deliverable
  ON gps_invoice (deliverable_id) WHERE status <> 'void';

CREATE INDEX IF NOT EXISTS gps_invoice_engagement_idx ON gps_invoice (engagement_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS gps_invoice_open_idx ON gps_invoice (status, issued_at) WHERE status IN ('issued', 'disputed');

ALTER TABLE gps_invoice ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ─────────────────────────── VERIFICATION (read-only) ───────────────────────────
-- Run this after the COMMIT. Every row must say present = true. This is the SAME
-- probe (to_regclass) every API surface uses, so true here means the 503s flip.
SELECT t.name, to_regclass(t.name) IS NOT NULL AS present
FROM (VALUES
  ('gps_partner_registry'), ('gps_partner_capability'), ('gps_price_band'), ('gps_packet_decision'),
  ('gps_demand_candidate'), ('gps_dossier'), ('gps_outreach_draft'),
  ('gps_pricing_policy'), ('gps_portal_session'), ('gps_portal_fact'),
  ('gps_portal_event'), ('gps_draft'), ('gps_stage_actual'), ('gps_invoice')
) AS t(name)
ORDER BY t.name;
