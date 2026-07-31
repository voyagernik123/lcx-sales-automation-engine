-- ──────────────────────────────────────────────
--  0047 — GLOBAL SERVICES (GPS): the eighth compartment's data spine
--
--  The services business the founder has already sold ~$250k of, by hand:
--  MiCA white papers, legal-opinion coordination, GTM/TGE sprints, marketing
--  activation, plus a paid diagnostic front door. Phase 1 of
--  GPS_IMPLEMENTATION_PLAN.md — offer → proposal → deposit. Nothing else.
--
--  THREE TABLES, AND WHY EACH IS UNAVOIDABLE
--    gps_client         the third party. No row anywhere in 46 prior migrations
--                       says "this belongs to client X".
--    gps_engagement     the sold unit of work (NOT a deal — see below).
--    gps_conflict_check the record that makes an exchange employee's services
--                       business defensible. The one piece of compliance
--                       machinery that genuinely did not exist.
--
--  WHAT IS DELIBERATELY REUSED, NOT RECREATED. `payment_milestones`
--  (0024_dealdesk_ext.sql:37) IS the invoice schedule — this file adds no
--  second one. `partners` (0024_dealdesk_ext.sql:66) already exists and so does
--  `command_partners` (0040_command.sql:29); a THIRD partner table is refused.
--  The offer catalogue, price bands and exclusions live in reviewed code
--  (packages/shared/src/gps/catalogue.ts), not in a table: policy in a table is
--  policy that changes without code review, and every exclusion is a sentence
--  that limits a regulated exchange's exposure.
--
--  ══ NO ARTIFACT, DOCUMENT OR ATTACHMENT COLUMN EXISTS IN THIS FILE. ══
--  That is a decision, not an oversight, and it is the load-bearing safety
--  property of the whole compartment. Receiving an unpublished white paper
--  draft, legal facts or cap-table material is the moment LCX becomes a
--  processor for non-LCX confidential data — and decision D2 (does LCX
--  legal/DPO accept that: controller vs processor, the subprocessor chain
--  through Supabase/Render/Cloudflare/OpenRouter, retention, erasure) is
--  UNANSWERED. So the system must be physically incapable of accepting a client
--  document, not merely discouraged from it. A ratchet test asserts no upload
--  route exists; do not add a column here that would give one somewhere to
--  write. Plan §2, §3 D2, §4 S0.4.
--
--  CLIENT DIMENSION FROM THE FIRST MIGRATION. Every table below carries
--  client_id, including gps_conflict_check which could have reached it through
--  the engagement. Retrofitting a tenancy seam onto rows that already exist is
--  a rewrite (plan §4 S0.3), and a conflict check that can be scoped by client
--  without a join is a conflict check someone will actually run.
--
--  Idempotent: every statement is IF NOT EXISTS or ON CONFLICT DO NOTHING, so
--  re-running the file is a no-op and a database restored from it alone comes up
--  with the same constraints and the same RLS posture.
-- ──────────────────────────────────────────────

-- ── The client ────────────────────────────────────────────────────────────────
--  A third party, and NOT a `projects` row. `projects` is the LCX listing
--  pipeline: a services client may never be a listing prospect (and LCX listing
--  is currently unavailable), while a listing prospect is not automatically a
--  services client. Conflating them would put a client's commercial terms in
--  front of the BD desk, which is the need-to-know boundary the eighth
--  compartment exists to draw.
CREATE TABLE IF NOT EXISTS gps_client (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What we call them day to day.
  name            text NOT NULL,

  -- The registered counterparty that would actually sign. Nullable: at prospect
  -- stage nobody knows it yet, and demanding it early is how a pipeline gets
  -- filled with half-invented entity names.
  legal_entity    text,

  -- HUMAN-ENTERED FREE TEXT, NOT AN ENUM, AND NOT VALIDATED.
  -- No regulatory fact in this programme was verifiable (plan §0: web access
  -- failed all session; everything regulatory is recalled training data with a
  -- May 2026 cutoff). A jurisdiction enum would imply the system knows which
  -- jurisdictions are inside a perimeter it has never been told. It records
  -- what a human typed and infers nothing from it.
  jurisdiction    text,

  -- One contact, as a label ("Anna Kim, COO"). Deliberately NOT an email, phone
  -- number or contact table: minimising third-party personal data on LCX
  -- infrastructure is the same GDPR posture 0046 took, and Phase 1 needs no
  -- more than a name to hold a conversation.
  primary_contact text,

  status          text NOT NULL DEFAULT 'prospect'
                    CHECK (status IN ('prospect', 'active', 'dormant', 'declined')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The list view: active clients first is wrong, most-recently-touched is right.
CREATE INDEX IF NOT EXISTS gps_client_status_idx
  ON gps_client (status, updated_at DESC);

-- Name lookup while typing. Not UNIQUE: two real companies can share a name,
-- and a unique constraint here would block a legitimate second client to
-- protect against a duplicate a human can see and merge.
CREATE INDEX IF NOT EXISTS gps_client_name_idx
  ON gps_client (lower(name));


-- ── The engagement ────────────────────────────────────────────────────────────
--  WHY THIS IS NOT `deals`, PROVED RATHER THAN ASSERTED.
--
--  0033_deals_unique_project.sql:12 creates
--      CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_project_unique ON deals (project_id)
--  — ONE DEAL PER PROJECT, FOREVER. A client who buys a white paper in March and
--  a GTM sprint in June would get a constraint violation on the second sale.
--  Repeat business — the entire renewal and referral end of a services business,
--  and the only end that compounds — is impossible on `deals` at the database
--  level today.
--
--  That index is NOT dropped. Other code and other reads depend on one-deal-per-
--  project semantics, and quietly relaxing a uniqueness guarantee under them is
--  how a data-integrity bug gets introduced to fix a modelling mistake. A pursuit
--  is not a delivery; the engagement gets its own table and both stay correct.
--
--  DEPOSIT STATE, HONESTLY. `payment_milestones` (0024_dealdesk_ext.sql:37) is
--  the invoice schedule and is reused for scheduling — but note the real seam:
--  it hangs off `invoices(deal_id)` → `deals`, so it cannot currently attach to a
--  gps_engagement without an `invoices` change that is out of this migration's
--  scope. Phase 1 therefore tracks the deposit on the engagement itself
--  (deposit_required_cents / deposit_paid_at) as the minimum needed to answer
--  "has the money arrived", and the invoice link is deliberately deferred rather
--  than faked. Anyone wiring invoices to engagements should read this paragraph
--  first.
CREATE TABLE IF NOT EXISTS gps_engagement (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id              uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,

  -- Nullable ON PURPOSE: a services client may not be a tracked project in the
  -- LCX listing pipeline, and most will not be. NO FK to projects(id) is added
  -- for exactly that reason — a nullable FK would still tempt a join that
  -- assumes every client is a prospect. Set it when the two really are the same
  -- entity, leave it null otherwise.
  project_id             uuid,

  -- Matches OfferKey in packages/shared/src/gps/types.ts. The CHECK is the
  -- database's copy of that closed union: a typo in an API payload fails here
  -- rather than creating an engagement for an offer that does not exist.
  offer_key              text NOT NULL
                           CHECK (offer_key IN (
                             'diagnostic', 'mica_whitepaper',
                             'legal_opinion_coordination', 'gtm_sprint',
                             'marketing_activation'
                           )),

  -- D1 (plan §3) answered "design for both", so this is CONFIGURATION with a
  -- default, never a rewrite. Disclosure text, invoice header, referral wording
  -- and (at Phase 3) the artifact storage target all derive from it. Default
  -- 'lcx' matches DEFAULT_CONTRACTING_ENTITY in shared.
  contracting_entity     text NOT NULL DEFAULT 'lcx'
                           CHECK (contracting_entity IN ('lcx', 'external')),

  -- The offer AS QUOTED, frozen at quote time. The catalogue is versioned code
  -- and will change; what this client agreed to must not change with it. This
  -- is a SCOPE snapshot — inclusions, exclusions, acceptance criteria, required
  -- inputs — and explicitly NOT a place for client-supplied documents (see the
  -- header: no artifact storage anywhere in this file, D2 unanswered).
  scope_snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Integer cents, both of them, matching payment_milestones.amount_cents.
  price_cents            bigint NOT NULL DEFAULT 0,

  -- WHAT WE EXPECT TO PAY THE PARTNER. There is no margin column anywhere in the
  -- 46 preceding migrations, and margin is the business: partners deliver, the
  -- founder sells and coordinates, and at $10–25k one scope overrun eats the
  -- engagement. Margin is DERIVED, never stored (marginCents in
  -- packages/shared/src/gps/types.ts) so it cannot go stale against the price.
  vendor_cost_cents      bigint NOT NULL DEFAULT 0,

  -- Per engagement, not global: a partner may invoice in EUR against a USD price,
  -- and pretending one currency exists is how an FX loss becomes invisible.
  currency               text NOT NULL DEFAULT 'USD',

  -- Mirrors EngagementStatus in packages/shared/src/gps/types.ts, in lifecycle
  -- order. 'conflict_pending' is a status rather than a checkbox so a missing
  -- conflict check is visible in a list view instead of discoverable in an audit.
  -- The delivery-side states are declared because the lifecycle is only
  -- comprehensible whole; Phase 1 ships no delivery surfaces.
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN (
                             'draft', 'conflict_pending', 'proposed', 'accepted',
                             'deposit_paid', 'in_delivery', 'delivered',
                             'invoiced', 'collected', 'closed_lost', 'cancelled'
                           )),

  -- Desk roster id (packages/shared/src/operators.ts). Text, not an FK: the
  -- roster is compiled code, not a table.
  owner                  text,

  -- Deposit state. Required amount is set at acceptance; paid_at is the only
  -- fact that matters before a partner is committed.
  deposit_required_cents bigint NOT NULL DEFAULT 0,
  deposit_paid_at        timestamptz,

  -- When the client accepted. Distinct from deposit_paid_at because a signature
  -- is not cash, and only one of the two pays a partner.
  accepted_at            timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Everything for one client, newest first — the client page.
CREATE INDEX IF NOT EXISTS gps_engagement_client_idx
  ON gps_engagement (client_id, created_at DESC);

-- The pipeline board: what is at each stage, oldest-touched first so the stalled
-- ones surface rather than hide.
CREATE INDEX IF NOT EXISTS gps_engagement_status_idx
  ON gps_engagement (status, updated_at DESC);

-- "What do I own" — the only read a seller does every morning.
CREATE INDEX IF NOT EXISTS gps_engagement_owner_idx
  ON gps_engagement (owner, status);

-- Accepted work with no deposit yet: the collections list, and the reason the
-- deposit columns exist at all. Partial index because it is the only rows anyone
-- queries this way.
CREATE INDEX IF NOT EXISTS gps_engagement_awaiting_deposit_idx
  ON gps_engagement (accepted_at)
  WHERE deposit_paid_at IS NULL AND accepted_at IS NOT NULL;

-- Mix by offer, for the quarterly question "what are we actually selling".
CREATE INDEX IF NOT EXISTS gps_engagement_offer_idx
  ON gps_engagement (offer_key, status);

-- Only populated when the client really is a tracked project; partial so the
-- index does not carry a row for the majority that are not.
CREATE INDEX IF NOT EXISTS gps_engagement_project_idx
  ON gps_engagement (project_id)
  WHERE project_id IS NOT NULL;


-- ── The conflict check ────────────────────────────────────────────────────────
--  THE ARTIFACT THAT MAKES THIS BUSINESS DEFENSIBLE.
--
--  The founder is an employee of LCX, an EU/Liechtenstein regulated exchange,
--  selling services to the same population of token projects that apply to list.
--  The severe risk in this programme is not a lost deal; it is the PERCEPTION
--  that paying for services buys listing influence (plan §9). The mitigation is
--  not a policy document nobody reads — it is one row, per engagement, naming
--  what was checked, what was decided, by whom, on what date, and the exact
--  disclosure text the client was given.
--
--  ONE ROW PER ENGAGEMENT, enforced by UNIQUE on engagement_id rather than left
--  to application discipline. Not one per client: a client's second engagement is
--  a fresh conflict position (their token may now be in a listing application),
--  and a check performed in March is not a check for June.
--
--  This table is APPEND-CORRECT: a decision that changes should be a new
--  engagement's check or an amended row with a new decided_at, never a rewrite
--  of history. Nothing here cascades a delete from anywhere except its own
--  engagement.
CREATE TABLE IF NOT EXISTS gps_conflict_check (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carried directly (plan §4 S0.3) even though it is reachable through the
  -- engagement: "show me every conflict decision for this client" must not
  -- depend on a join being written correctly.
  client_id            uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,

  -- UNIQUE: exactly one current check per engagement.
  engagement_id        uuid NOT NULL UNIQUE
                         REFERENCES gps_engagement(id) ON DELETE CASCADE,

  -- WHAT WAS ACTUALLY CHECKED, in the checker's own words — not a template id
  -- and not a boolean. A boolean records that someone clicked; this records what
  -- they looked at (is this project in a listing application? does the desk hold
  -- a position? has anyone at LCX been asked to influence an outcome?). NOT NULL
  -- because an empty check is worse than no table.
  check_performed      text NOT NULL,

  decision             text NOT NULL
                         CHECK (decision IN (
                           'cleared', 'cleared_with_disclosure', 'declined'
                         )),

  -- A NAMED HUMAN from the desk roster, never a service account. Text rather
  -- than an FK because the roster is compiled code (operators.ts), and NOT NULL
  -- because an unattributed compliance decision is not a compliance decision.
  --
  -- HONEST LIMIT: attribution today is only as strong as the shared DESK_PASSCODE
  -- (plan §1.5 — per-person credentials do not exist yet), so this field is
  -- self-asserted. It is still the record that must exist, and it becomes
  -- properly attributable the moment per-person auth does.
  decided_by           text NOT NULL,

  -- THE DISCLOSURE TEXT ACTUALLY USED, stored verbatim, not a template
  -- reference. The template will be edited; the defensible record is what this
  -- client was actually told on this day. Nullable only because a plain
  -- 'cleared' or 'declined' decision may involve no disclosure at all.
  disclosure_text_used text,

  decided_at           timestamptz NOT NULL DEFAULT now()
);

-- Every decision for a client, newest first — the question compliance asks.
CREATE INDEX IF NOT EXISTS gps_conflict_check_client_idx
  ON gps_conflict_check (client_id, decided_at DESC);

-- Declined and disclosed decisions are the reviewable population; scanning by
-- decision over time is the review itself.
CREATE INDEX IF NOT EXISTS gps_conflict_check_decision_idx
  ON gps_conflict_check (decision, decided_at DESC);


-- ── Extending the no-lockout covenant to the eighth compartment ───────────────
--  `gps` is declared legacy:false (packages/shared/src/workspaces.ts), i.e.
--  DEFAULT-DENY, and as of commit d62b965 that flag is load-bearing:
--  `legacyEntitlements` filters on it, so the fail-open path no longer reaches a
--  post-LCX-OS compartment and a newly-added roster member gets nothing here.
--  That property is why this compartment may hold third-party client material at
--  all.
--
--  0042 seeded grants for the six workspaces that existed then and 0046 added
--  the seventh, so an eighth has no rows and nobody can open it — not even the
--  desk. The covenant is therefore extended EXPLICITLY here, in the same shape
--  and with the same capabilities 0042 and 0046 used.
--
--  Deliberately a visible, audited grant rather than a change to the default-deny
--  rule: a fourth person still gets nothing until an approver grants it through
--  the access-request flow. For a compartment holding a third party's commercial
--  terms that is the entire point.
INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
SELECT m.member_id, 'gps', m.cap, 'backfill-0047',
       'Eighth compartment (GLOBAL SERVICES): no-lockout covenant extended to the founding desk'
FROM (VALUES
  ('monty', 'approve'), ('nik', 'approve'), ('sam', 'operate')
) AS m(member_id, cap)
ON CONFLICT (member_id, workspace) DO NOTHING;


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED HERE, not left to a dashboard button — 0042, 0043 and 0046 each
--  declare their own, and this file follows them for the same reason: Supabase's
--  SQL editor offers "Run and enable RLS" when it sees a CREATE TABLE in
--  `public` without it, and taking that option leaves the security posture living
--  in a click nobody records. A database restored from this file alone would come
--  up with RLS OFF and nothing would say so.
--
--  WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE IN THE PLATFORM. Supabase exposes
--  `public` tables through its auto-generated REST API. Without RLS, anyone
--  holding the project's anon key could read gps_client and gps_engagement —
--  which is a THIRD PARTY'S CONFIDENTIAL COMMERCIAL TERMS (who they are, what
--  they are paying, what we pay the partner, and their conflict position) held on
--  a regulated exchange's infrastructure. 0046 protected personal data; this
--  protects other companies' contract terms and our own margin. Both are real
--  exposures; this one also ends the client relationship.
--
--  WHY IT CANNOT BREAK LCX OS. The API connects as the database owner, which
--  bypasses RLS — the same arrangement 0042 relies on, proven by `entitlements`
--  being RLS-enabled while the workspace switcher works in production today. NO
--  POLICIES are defined because no non-owner role should reach these tables at
--  all: RLS with no policy is deny-all, which is exactly the intent.
--
--  WHAT RLS DOES NOT DO, so nobody quotes it as more than it is: it does not
--  scope reads BETWEEN desk members (that is the entitlement gate above), and it
--  does not stop `/v1/search` reading across compartments — that hole is open
--  today and is plan §4 S0.2, owned separately. RLS here closes the anon-key
--  path, nothing more.
ALTER TABLE gps_client         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_engagement     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_conflict_check ENABLE ROW LEVEL SECURITY;
