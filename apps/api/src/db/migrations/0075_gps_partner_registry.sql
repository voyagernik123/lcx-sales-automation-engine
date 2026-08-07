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
