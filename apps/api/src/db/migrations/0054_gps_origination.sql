-- ──────────────────────────────────────────────
--  0054 — GPS ORIGINATION: the curated watchlist and the openings drafted at it
--
--  `apps/api/src/routes/gpsOrigination.ts:108` has named this file since Phase 8
--  and it was never written, so every origination read reports `migrated: false`
--  and every write answers 503. This is that file. The column list is taken from
--  the code that already reads and writes these rows — `TARGET_COLS`
--  (`apps/api/src/gps/origination.ts:179`) and `OPENING_COLS` (:761) — so a read
--  and this schema cannot drift apart.
--
--  TWO TABLES, plus a dependency that already exists:
--    gps_target            one CURATED target. Not discovery: the plan explicitly
--                          does not build a global sourcing engine, and the 500-row
--                          ceiling in `listTargetRecords` is the statement of that.
--    gps_outreach_opening  what was drafted at a target, by whom, and whether the
--                          brief supported it. APPEND-ONLY by convention: a
--                          rewritten opening is a new row (`latestOpening` reads
--                          the newest), because what was said to a client is the
--                          record an exchange employee's services business has to
--                          be able to produce.
--    observations          NOT CREATED HERE. 0029_spine.sql owns the provenance
--                          ledger and origination writes facts and why-now triggers
--                          into it under subject_type 'gps_target'. The probe
--                          (`origination.ts:117`) requires all three, because
--                          origination without provenance is a ranking with no
--                          sources.
--
--  ══ NO ARTIFACT, ATTACHMENT, LOCATION, URL OR MIME COLUMN EXISTS HERE ════════
--  Decision D2 — whether LCX's legal/DPO accepts controller vs processor for a
--  third party's confidential material, and the subprocessor chain through
--  Supabase/Render/Cloudflare/OpenRouter, retention and erasure — is UNANSWERED, so
--  the compartment stays physically incapable of holding a client document rather
--  than discouraged from it (0047_gps.sql:26-36). A target is the stage at which
--  someone will most want to attach "their deck"; there is nowhere to put it, and
--  `intakeLockout.test.ts` reads this file's content to keep it that way.
--
--  EVERY SOURCE LIVES IN `observations`, NEVER IN A COLUMN HERE. The three
--  provenance columns below (`evidence_*`) are the Admiralty grade of the ROW ITSELF
--  and nothing more; a fact's source, url and observation date are ledger rows, which
--  is what lets the brief mark an unsourced value UNVERIFIED instead of laundering
--  it.
--
--  client_id IS NULLABLE HERE, unlike every table 0047 and 0049 created, and that
--  is the point of the table: a TARGET IS NOT YET A CLIENT. Most rows will never
--  have one, and requiring it would mean inventing a gps_client row for every
--  company anyone thought about. Where it is set, the single-column FK to
--  gps_client(id) makes drift impossible — there is no parent pair to disagree with,
--  which is why 0049's composite-FK guard has no analogue here.
--
--  Idempotent, forward-only, no destructive statement. Applied BY HAND in the
--  Supabase SQL editor; nothing wires the runner into a deploy (`db/migrate.ts`).
-- ──────────────────────────────────────────────

-- ── The curated target ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_target (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What we call them. Capped at the route's own limit (`text(body.name, 200)`), so
  -- an oversized payload is refused at the edge and refused again here.
  name                            text NOT NULL
                                    CHECK (length(btrim(name)) > 0 AND length(name) <= 200),

  -- HUMAN-ENTERED FREE TEXT, NOT AN ENUM, for exactly the reason 0047_gps.sql:67
  -- gives: a jurisdiction enum would imply the system knows which jurisdictions are
  -- inside a perimeter it has never been told about. The perimeter gate reads this
  -- string and reports `unknown` rather than guessing.
  jurisdiction                    text CHECK (jurisdiction IS NULL OR length(jurisdiction) <= 200),

  -- NULLABLE — see the header. Set only once the target really is a client on file.
  -- ON DELETE SET NULL, and NOT the CASCADE 0047 uses: a target is OUR OWN watchlist
  -- entry, so deleting the client record must not delete the record that we were
  -- pursuing them. The row falls back to being an unlinked prospect, which is what it
  -- was before, and no orphan is left behind because the column is nullable by design.
  client_id                       uuid REFERENCES gps_client(id) ON DELETE SET NULL,

  -- 'watchlist' is the default the writer relies on (`origination.ts:586`
  -- COALESCE($5, 'watchlist')); 'dropped' is the human exclusion the queue honours.
  -- NO CHECK LISTING THE VALUES, and that is deliberate rather than lazy: the route
  -- accepts any 40-character label and no closed union for it exists in shared, so a
  -- CHECK here would turn a value the API accepts into a 500. The length cap is the
  -- ratchet — it makes an encoded payload fail loudly instead of arriving quietly.
  status                          text NOT NULL DEFAULT 'watchlist'
                                    CHECK (length(btrim(status)) > 0 AND length(status) <= 40),

  -- ── The three gates. Every one is a RECORDED HUMAN DECISION, and every default
  -- is the SAFE end of it: not screened, perimeter unknown, conflict unresolved. A
  -- default of 'clear' would let an unexamined target rank beside an examined one.
  screening                       text NOT NULL DEFAULT 'not_screened'
                                    CHECK (screening IN ('clear', 'concern', 'not_screened')),
  perimeter                       text NOT NULL DEFAULT 'unknown'
                                    CHECK (perimeter IN ('in_perimeter', 'outside_perimeter', 'unknown')),
  conflict                        text NOT NULL DEFAULT 'unresolved'
                                    CHECK (conflict IN (
                                      'cleared', 'cleared_with_disclosure', 'declined', 'unresolved'
                                    )),

  -- The two hard refusals. A prospect who demands a guaranteed regulatory outcome,
  -- or whose materials are materially misleading, is refused by the engine — not
  -- down-ranked. Stored as facts because the refusal has to be explainable months
  -- later.
  demands_guaranteed_outcome      boolean NOT NULL DEFAULT false,
  materially_misleading           boolean NOT NULL DEFAULT false,

  -- WHO DECIDES, as a label and a role. Deliberately not a contacts table and not
  -- an email or phone number: the same minimise-third-party-personal-data posture
  -- 0046 and 0047_gps.sql:75 took. `is_budget_holder` is NULLABLE because "nobody
  -- established whether they hold the budget" is a real state the confidence term
  -- charges for, and false would assert they do not.
  decision_maker_name             text CHECK (decision_maker_name IS NULL OR length(decision_maker_name) <= 200),
  decision_maker_role             text CHECK (decision_maker_role IS NULL OR length(decision_maker_role) <= 200),
  decision_maker_is_budget_holder boolean,

  -- Offer keys, as an array, constrained to the same closed union the scalar
  -- `offer_key` carries — a need the catalogue cannot serve is not a need this
  -- system can act on. `<@` is a containment test, so NULL and '{}' both pass.
  identified_needs                text[]
                                    CHECK (
                                      identified_needs IS NULL
                                      OR identified_needs <@ ARRAY[
                                        'diagnostic', 'mica_whitepaper',
                                        'legal_opinion_coordination', 'gtm_sprint',
                                        'marketing_activation'
                                      ]::text[]
                                    ),

  -- The offer we would lead with. The database's copy of OfferKey, same reason as
  -- 0047_gps.sql:139.
  offer_key                       text
                                    CHECK (offer_key IS NULL OR offer_key IN (
                                      'diagnostic', 'mica_whitepaper',
                                      'legal_opinion_coordination', 'gtm_sprint',
                                      'marketing_activation'
                                    )),

  -- NULL IS NOT ZERO, AND THE DISTINCTION IS SCORED. NULL means "we have not
  -- established a budget"; 0 means "they told us zero". `deriveAbilityToPay` treats
  -- them differently and `computeConfidence` charges only one of them, so a DEFAULT 0
  -- here would flatter every under-researched target in the queue
  -- (`origination.ts:150`).
  stated_budget_cents             bigint CHECK (stated_budget_cents >= 0),
  capital_proxy_cents             bigint CHECK (capital_proxy_cents >= 0),

  intro_path                      text
                                    CHECK (intro_path IS NULL OR intro_path IN (
                                      'direct_relationship', 'warm_referral', 'cold'
                                    )),

  -- WHY NOW, as a dated fact. `deadline_kind` may be recorded without a date — the
  -- route permits it and the engine treats an undated deadline as no deadline — so
  -- there is deliberately no CHECK tying the two together: it would 500 on a payload
  -- the API accepts.
  deadline_at                     timestamptz,
  deadline_kind                   text
                                    CHECK (deadline_kind IS NULL OR deadline_kind IN (
                                      'regulatory', 'commercial', 'self_imposed'
                                    )),

  -- What we would quote and expect to pay. Not a commitment and not a margin:
  -- margin stays derived (`marginCents`), here as everywhere in GPS.
  quoted_price_cents              bigint CHECK (quoted_price_cents >= 0),
  expected_vendor_cost_cents      bigint CHECK (expected_vendor_cost_cents >= 0),

  -- ── Delivery complexity: FIVE FLAGS PLUS THE MOMENT SOMEONE LOOKED.
  -- The timestamp is load-bearing, not decoration. `complexity` is null in the
  -- domain unless `complexity_assessed_at` is set, so "nobody has assessed delivery
  -- complexity" and "assessed, and none of the five fire" are DIFFERENT states:
  -- `deriveDeliveryComplexity` scores the first as unknown (no points, lower
  -- confidence) and the second as a genuine zero penalty. Five booleans alone would
  -- have made every unassessed target look clean.
  complexity_no_named_partner     boolean,
  complexity_scope_undefined      boolean,
  complexity_multi_jurisdiction   boolean,
  complexity_translation_required boolean,
  complexity_client_side_dependencies boolean,
  complexity_assessed_at          timestamptz,

  -- ── The Admiralty grade OF THIS ROW. Reliability A–F, credibility 1–6, and the
  -- date it was observed. `ageDays` is DERIVED from the date on every read and never
  -- stored: a stored age is wrong the day after it is written, and this is the number
  -- `computeConfidence` decays the grade by. An undated grade is allowed and is
  -- charged −10 confidence rather than being rejected.
  evidence_reliability            text
                                    CHECK (evidence_reliability IS NULL
                                           OR evidence_reliability IN ('A','B','C','D','E','F')),
  evidence_credibility            integer
                                    CHECK (evidence_credibility IS NULL
                                           OR (evidence_credibility BETWEEN 1 AND 6)),
  evidence_observed_at            timestamptz,

  -- WHO PUT IT ON THE LIST. Never rewritten by a later save (`ON CONFLICT (id) DO
  -- UPDATE` leaves it alone), because that is the one fact a subsequent edit must not
  -- be able to launder. Text, not an FK: the roster is compiled code (operators.ts).
  created_by                      text CHECK (created_by IS NULL OR length(created_by) <= 120),

  created_at                      timestamptz NOT NULL DEFAULT now(),
  -- THE OBSERVATION DATE OF EVERY GATE FINDING IN THE BRIEF. A gate is derived from
  -- the decisions on this row, so the row's age is the finding's age.
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- The watchlist read: newest first, bounded at 500 by the caller.
CREATE INDEX IF NOT EXISTS gps_target_created_idx
  ON gps_target (created_at DESC);

-- The same read filtered to one status — how 'dropped' is excluded from the queue
-- and how the refusal ledger is assembled.
CREATE INDEX IF NOT EXISTS gps_target_status_idx
  ON gps_target (status, created_at DESC);

-- "Which targets are already clients", and the FK's own lookup. Partial, because
-- most rows carry no client.
CREATE INDEX IF NOT EXISTS gps_target_client_idx
  ON gps_target (client_id)
  WHERE client_id IS NOT NULL;

-- The population a human has to clear before outreach: anything unscreened, outside
-- the perimeter or with an unresolved conflict. Partial so it is a scan of exactly
-- the rows that block.
CREATE INDEX IF NOT EXISTS gps_target_gates_open_idx
  ON gps_target (updated_at DESC)
  WHERE screening <> 'clear' OR perimeter <> 'in_perimeter' OR conflict = 'unresolved';


-- ── The opening drafted at a target ───────────────────────────────────────────
--  APPEND-ONLY, latest-wins on read (`latestOpening`), exactly as the observations
--  ledger is: a rewritten opening does not erase the one before it. What was drafted
--  about a client, and by whom, is the record this business needs to be able to
--  produce, and an UPDATE would destroy it. There is no `updated_at` here for that
--  reason — a row that could be updated would invite one.
CREATE TABLE IF NOT EXISTS gps_outreach_opening (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  target_id           uuid NOT NULL REFERENCES gps_target(id) ON DELETE CASCADE,

  -- THE WORDS THEMSELVES, capped at the route's own limit (2000). This is prose a
  -- named desk member drafted and the brief-integrity engine cleared; it is not a
  -- document, a reference to one, or a place to put either.
  opening_text        text NOT NULL
                        CHECK (length(btrim(opening_text)) > 0 AND length(opening_text) <= 2000),

  -- The assertion ids the opening leaned on, so a claim in an outreach message can be
  -- traced to the ledger row that supports it. Capped at the route's 20: an opening
  -- that cites more than twenty facts is not an opening.
  cited_assertion_ids text[]
                        CHECK (cited_assertion_ids IS NULL
                               OR cardinality(cited_assertion_ids) <= 20),

  -- TRUE when the opening deliberately asserts nothing about the client — the
  -- honest form when the brief has nothing sourced to say. Recorded rather than
  -- inferred from an empty citation list, because "we chose to claim nothing" and
  -- "we cited nothing" are different acts.
  asserts_nothing     boolean NOT NULL DEFAULT false,

  -- WHETHER THE BRIEF SUPPORTED IT AT THE MOMENT OF DRAFTING. Stored, never
  -- recomputed: the integrity engine and the facts behind it both change, and
  -- recomputing would retroactively bless or condemn a message already sent. Same
  -- discipline as gps_disclosure_record.unreviewed (0050_gps_perimeter.sql).
  integrity_ok        boolean NOT NULL,

  -- A NAMED DESK MEMBER, enforced at the route (`NAMED_HUMAN_REQUIRED`): an opening
  -- aimed at a client may not be authored by the shared machine key. Same honest
  -- limit as every attribution in this compartment — only as strong as the shared
  -- DESK_PASSCODE until per-person credentials exist.
  drafted_by          text NOT NULL CHECK (length(btrim(drafted_by)) > 0
                                           AND length(drafted_by) <= 120),

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- `latestOpening`: newest per target, tie-broken by id so the result is
-- deterministic rather than dependent on physical row order.
CREATE INDEX IF NOT EXISTS gps_outreach_opening_target_idx
  ON gps_outreach_opening (target_id, created_at DESC, id DESC);

-- Everything a named human drafted, newest first — the review read.
CREATE INDEX IF NOT EXISTS gps_outreach_opening_drafted_by_idx
  ON gps_outreach_opening (drafted_by, created_at DESC);

-- Openings drafted while the brief did NOT support them. Small by definition and
-- the only population worth reviewing.
CREATE INDEX IF NOT EXISTS gps_outreach_opening_integrity_idx
  ON gps_outreach_opening (created_at DESC)
  WHERE integrity_ok = false;


-- ── Row Level Security ────────────────────────────────────────────────────────
--  Declared here rather than in a dashboard click, for the reason 0047_gps.sql:333
--  sets out. Supabase exposes `public` tables through its auto-generated REST API,
--  and these two rows say WHICH COMPANIES AN EXCHANGE EMPLOYEE IS APPROACHING, what
--  their conflict and perimeter position is, and the words being said to them. That
--  is third-party material and a reputational exposure at once. NO POLICIES: RLS with
--  no policy is deny-all, which is the intent; the API connects as the owner and
--  bypasses it, and the entitlement gate does the per-member scoping.
ALTER TABLE gps_target           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_outreach_opening ENABLE ROW LEVEL SECURITY;


-- ── What `\d+` tells the next person ──────────────────────────────────────────
COMMENT ON TABLE gps_target IS
  'GPS origination target: ONE CURATED prospect, with the three gates (screening, perimeter, conflict) as recorded human decisions and every default at the safe end. client_id is NULLABLE because a target is not yet a client. NOTHING here is a source: facts and why-now triggers live in `observations` (0029) under subject_type gps_target, which is what lets the brief mark an unsourced value UNVERIFIED instead of laundering it. No artifact column exists anywhere in GPS — decision D2 (DPO: controller vs processor) is unanswered. See 0054_gps_origination.sql.';

COMMENT ON COLUMN gps_target.complexity_assessed_at IS
  'THE DIFFERENCE BETWEEN UNKNOWN AND ZERO. Null means nobody assessed delivery complexity, and the engine scores that as unknown — not as "none of the five flags fire". Five booleans without this column would have made every unassessed target look clean.';

COMMENT ON COLUMN gps_target.stated_budget_cents IS
  'NULL means no budget was established; 0 means they said zero. Scored differently, and charged differently by computeConfidence — hence no DEFAULT.';

COMMENT ON COLUMN gps_target.evidence_observed_at IS
  'The observation date of this row''s Admiralty grade. Age is DERIVED from it on every read and never stored: a stored age is wrong the day after it is written.';

COMMENT ON TABLE gps_outreach_opening IS
  'GPS outreach opening: what was drafted at a target, the assertion ids it cited, whether the brief supported it AT THE TIME, and the named human who drafted it. APPEND-ONLY by convention — a rewritten opening is a new row and the previous one survives, because what was said to a client is the record this business must be able to produce. There is deliberately no updated_at. See 0054_gps_origination.sql.';

COMMENT ON COLUMN gps_outreach_opening.integrity_ok IS
  'Stored, never recomputed. The integrity engine and the facts behind it both change; recomputing would retroactively bless or condemn a message that has already been sent.';
