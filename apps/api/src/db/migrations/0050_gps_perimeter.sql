-- ──────────────────────────────────────────────
--  0050 — GPS THE CONFLICT WALL: the perimeter a human entered, and the
--         disclosure VERSION that was actually given
--
--  Phase 9 of GPS_100X_PLAN.md (§5). 0047 recorded the conflict DECISION per
--  engagement. This file records the two things that decision rests on and that
--  nothing in 49 migrations could hold:
--
--    gps_jurisdiction_profile  what a QUALIFIED HUMAN said about a service in a
--                              jurisdiction — sourced, dated, and EXPIRING.
--    gps_disclosure_record     which VERSION of which compiled disclosure text a
--                              named client was actually given, and when.
--
--  ══════════════════════════════════════════════════════════════════════════
--  ══ NO REGULATORY FACT IS ASSERTED, INFERRED OR SEEDED BY THIS FILE.     ══
--  ══════════════════════════════════════════════════════════════════════════
--  Web access failed for the whole programme (GPS_100X_PLAN.md §10: "Invent
--  regulatory facts — nothing here asserts a regulatory conclusion"), so every
--  regulatory sentence available to this system is unverified recalled training
--  data. The response is not to guess in a safe-looking direction — "prohibited
--  unless proven otherwise" is still a legal conclusion nobody here is entitled
--  to make. It is to STORE a position a qualified human entered, to make that
--  position EXPIRE, and to REFUSE while it is missing, unreviewed or stale.
--  `packages/shared/src/gps/perimeter.ts` is the enforcement half
--  (`gateService`); this file is the record half. Neither originates a position.
--
--  THE TABLE SHIPS EMPTY, ON PURPOSE. There is no INSERT of placeholder rows
--  below. `PERIMETER_PROFILES` (perimeter.ts:244) already carries compiled
--  placeholders that are double-locked expired-on-arrival (`reviewed:false` AND
--  `reviewBy = enteredAt`), and the API falls back to them when this table is
--  empty — so the gate refuses either way. Writing those same placeholders into
--  this table would be strictly worse: a row here has an `entered_by` column,
--  and a placeholder sitting in it would look like a human position with an
--  accountable name against it. An empty table is the honest state, and it is
--  reported as such (`profilesSource: 'compiled_placeholder'`).
--
--  ══ NO ARTIFACT, DOCUMENT, ATTACHMENT OR BYTES COLUMN EXISTS HERE. ══
--  The lockout of 0047 and 0049 stands unchanged and is machine-enforced over
--  this file too: `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers
--  every migration whose text mentions a `gps_` table (not by filename), and
--  fails on a byte-bearing type, on a column NAME shaped like an encoded
--  document, and on any NEW json/jsonb column — that set is frozen at exactly
--  `scope_snapshot`, which is why nothing here is jsonb even where a jsonb blob
--  of "the entry" would have been convenient. Decision D2 (LCX DPO: controller
--  vs processor for a third party's confidential material) is still UNANSWERED.
--
--  Idempotent throughout: every statement is IF NOT EXISTS, CREATE OR REPLACE,
--  DROP-then-CREATE for the trigger, or COMMENT (which replaces). Re-running the
--  file is a no-op, and a database restored from 0042→0050 alone comes up with
--  the same constraints, the same trigger and the same RLS posture.
-- ──────────────────────────────────────────────


-- ── The jurisdiction perimeter ────────────────────────────────────────────────
--  ONE ROW PER (jurisdiction, offer). Plan §5, 9.3.
--
--  NO client_id COLUMN, AND THAT IS DELIBERATE — it is the one place this
--  compartment departs from 0047's rule that every table carries the client
--  dimension from the first migration (`0047_gps.sql:38`). This is POLICY, not
--  client data: what may be delivered in Liechtenstein does not depend on who is
--  paying. A perimeter that could be scoped per client is a perimeter that gets
--  negotiated per client, which is the failure mode this whole table exists to
--  prevent. It also means these rows are not confidential third-party material —
--  they are our own recorded position — and the RLS block at the foot of the file
--  says so rather than repeating 0047's reasoning by rote.
--
--  WHY A TABLE AT ALL, when 0047 argued that the offer catalogue must live in
--  reviewed code (`0047_gps.sql:21`): the two are different in kind. The
--  catalogue is OURS and changes by code review. A jurisdictional position is
--  entered by a qualified human — quite possibly counsel who does not have a
--  pull request — on a date, against a source, with a review deadline. Requiring
--  a deploy to record what a lawyer said would mean it is not recorded. The
--  ENFORCEMENT still lives in reviewed code (`perimeter.ts:609 gateService`), and
--  it treats a row from this table exactly as it treats a compiled one.
CREATE TABLE IF NOT EXISTS gps_jurisdiction_profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NORMALISED KEY, not the free text a human typed. `normaliseJurisdiction`
  -- (perimeter.ts:166) maps 'LI'/'FL'/'Liechtenstein' onto one key, and the API
  -- normalises before writing, so 'eu' and 'EU' cannot become two positions that
  -- disagree. Lowercase is asserted by a CHECK rather than trusted.
  jurisdiction  text NOT NULL CHECK (jurisdiction = lower(btrim(jurisdiction))
                                     AND length(btrim(jurisdiction)) > 0),

  -- The database's copy of the closed OfferKey union, same as
  -- `0047_gps.sql:140`. A position on one service NEVER transfers to another —
  -- that is why the grain is (jurisdiction, offer) and not jurisdiction alone.
  offer_key     text NOT NULL
                  CHECK (offer_key IN (
                    'diagnostic', 'mica_whitepaper',
                    'legal_opinion_coordination', 'gtm_sprint',
                    'marketing_activation'
                  )),

  -- Mirrors ServiceClass (perimeter.ts:51). Four values, and note what is NOT
  -- among them: 'unknown'. Unknown is the ABSENCE of a row, never a row — a
  -- storable 'unknown' would let someone record ignorance as a position and then
  -- point at the record. `PerimeterClass` (perimeter.ts:71) adds 'unknown' in the
  -- type system only, where it cannot be persisted.
  service_class text NOT NULL
                  CHECK (service_class IN (
                    'permitted', 'counsel_required', 'partner_required', 'prohibited'
                  )),

  -- WHAT THIS POSITION RESTS ON, in the entering human's words. NOT NULL and
  -- non-blank by CHECK, because `perimeterEntryDefects` (perimeter.ts:268) treats
  -- a blank source as a defect that makes the row refuse — enforcing it here means
  -- the most dangerous row imaginable (a reviewed 'permitted' with no source)
  -- cannot be created at all, rather than being created and then flagged.
  source        text NOT NULL CHECK (length(btrim(source)) > 0),

  -- Optional URL for the source. NOTHING IN GPS FETCHES, RESOLVES, MIRRORS OR
  -- VALIDATES IT — same standing rule as `external_location`
  -- (`0049_gps_delivery.sql:28`), for the same reason: a link the server
  -- dereferences is a link that turns a note into an integration. It is a
  -- reference for a human reader, typed by a human, and it is never followed.
  source_url    text,

  -- THE ACCOUNTABLE HUMAN. A name, never a service account and never a role.
  -- 'UNASSIGNED' is refused explicitly because that is the sentinel the compiled
  -- placeholders use (perimeter.ts:221) and it must not be launderable into a
  -- real row by copy-paste.
  entered_by    text NOT NULL CHECK (length(btrim(entered_by)) > 0
                                     AND upper(btrim(entered_by)) <> 'UNASSIGNED'),
  entered_at    timestamptz NOT NULL DEFAULT now(),

  -- THE EXPIRY. Not a reminder, not a hint: `gateService` REFUSES once now() is
  -- past it (perimeter.ts:660), and the refusal says the perimeter is not
  -- extended by the fact that nobody got round to re-reviewing it. A position on
  -- a regulated activity that nobody has looked at for a year is not a position.
  review_by     timestamptz NOT NULL CHECK (review_by >= entered_at),

  -- WHY the class is what it is. Client-facing refusals quote it
  -- (perimeter.ts:649), so an empty note produces a refusal that explains nothing.
  note          text NOT NULL CHECK (length(btrim(note)) > 0),

  -- REVIEWED IS DERIVED, NEVER STORED AS A BOOLEAN.
  --
  -- `PerimeterEntry.reviewed` (perimeter.ts:113) is the flag that decides whether
  -- a row can authorise work, and a bare boolean column is one careless UPDATE
  -- away from true with nobody's name against it. So the fact recorded is the
  -- REVIEW ITSELF — who, and when — and the API computes `reviewed` as
  -- `reviewed_at IS NOT NULL`. Same discipline as margin in 0047
  -- (`0047_gps.sql:163`): derive the thing that must not go stale.
  --
  -- The reviewer may be a different human from the enterer and usually should be.
  reviewed_by   text,
  reviewed_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Both halves of the review or neither. A reviewed_at with no reviewer is an
  -- unattributed clearance; a reviewer with no date cannot expire.
  CONSTRAINT gps_jurisdiction_profile_review_pair
    CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT gps_jurisdiction_profile_reviewer_named
    CHECK (reviewed_by IS NULL OR (length(btrim(reviewed_by)) > 0
                                   AND upper(btrim(reviewed_by)) <> 'UNASSIGNED')),
  -- A review cannot predate the thing it reviewed.
  CONSTRAINT gps_jurisdiction_profile_review_after_entry
    CHECK (reviewed_at IS NULL OR reviewed_at >= entered_at)
);

-- ONE CURRENT POSITION per (jurisdiction, offer), enforced rather than left to
-- application discipline. Two rows disagreeing about the same cell is the state
-- in which the gate's answer depends on row order, i.e. on nothing.
CREATE UNIQUE INDEX IF NOT EXISTS gps_jurisdiction_profile_cell_idx
  ON gps_jurisdiction_profile (jurisdiction, offer_key);

-- The review queue: what expires next. Ascending, because the interesting end is
-- the overdue one.
CREATE INDEX IF NOT EXISTS gps_jurisdiction_profile_review_by_idx
  ON gps_jurisdiction_profile (review_by);

-- Unreviewed drafts are their own worklist: entered, and authorising nothing
-- until somebody reviews them. Partial, because it is the only way this is read.
CREATE INDEX IF NOT EXISTS gps_jurisdiction_profile_unreviewed_idx
  ON gps_jurisdiction_profile (entered_at)
  WHERE reviewed_at IS NULL;


-- ── The disclosure record ─────────────────────────────────────────────────────
--  THE VERSION IS THE POINT OF THIS TABLE. Plan §5, 9.2: "a disclosure you
--  cannot reproduce is not a disclosure."
--
--  0047 already stores the wording verbatim
--  (`gps_conflict_check.disclosure_text_used`, `0047_gps.sql:288`) and that
--  column is right and stays. What it cannot answer is the question an auditor
--  actually asks: WHICH POLICY produced those words, and is this the wording our
--  policy said to use at that date? Text without a version cannot be checked
--  against policy; a version without text cannot be reproduced once the policy
--  text is edited. `disclosureRecord()` (disclosure.ts:521) returns both because
--  both must land, and this table is where they land.
--
--  MANY ROWS PER ENGAGEMENT, unlike the conflict check's UNIQUE(engagement_id).
--  Four templates exist (disclosure.ts:198) and an engagement can require three
--  of them at once — the standing employee-conflict statement always, the
--  cleared-with-disclosure wording when that was the decision, the role limit on
--  legal-opinion coordination, the not-established notice while the perimeter is
--  unreviewed. One row per (engagement, template, version).
--
--  APPEND-ONLY, AND NOT ON TRUST — see the trigger below. Correcting a
--  disclosure means ISSUING one (a new row, new date, possibly a new version),
--  never editing what a client was told.
CREATE TABLE IF NOT EXISTS gps_disclosure_record (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carried directly, exactly as `0047_gps.sql:257` argues for the conflict
  -- check: "show me every disclosure this client was given" must not depend on a
  -- join being written correctly, and it is the question that gets asked under
  -- pressure.
  client_id        uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  engagement_id    uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,

  -- Mirrors DisclosureId (disclosure.ts:153). NOT a CHECK against the four known
  -- ids, and that is a considered exception to 0047's "the database keeps a copy
  -- of the closed union" rule: the disclosure library is expected to gain
  -- templates, and a CHECK here would make adding one a migration. The union is
  -- enforced where it can be enforced honestly — `renderDisclosure` REFUSES an
  -- unknown id (disclosure.ts:374) rather than rendering an empty string, so no
  -- unknown id can reach this table through the API at all.
  template_id      text NOT NULL CHECK (length(btrim(template_id)) > 0),

  -- THE AUDIT KEY. `DisclosureTemplate.version` (disclosure.ts:166), bumped on
  -- any text change however small.
  template_version integer NOT NULL CHECK (template_version >= 1),

  -- Sum of every template version at the moment of issue
  -- (`DISCLOSURE_LIBRARY_VERSION`, disclosure.ts:491). One integer that changes
  -- whenever ANY template changes, so a stored record can be placed against the
  -- library it came from in a single comparison.
  library_version  integer NOT NULL CHECK (library_version >= 1),

  -- THE EXACT WORDS, VERBATIM. Deliberately duplicated with
  -- `gps_conflict_check.disclosure_text_used` rather than joined to it: this row
  -- must remain a complete, self-contained record of what was said even if the
  -- conflict check is later amended (0047 permits an amend), and reproducing a
  -- historical disclosure reads THIS text — never the library, which holds only
  -- the current wording and refuses to answer for an older version
  -- (`version_mismatch`, disclosure.ts:382).
  text_used        text NOT NULL CHECK (length(btrim(text_used)) > 0),

  -- WAS THE COUNTERPARTY LCX-ADJACENT, as asserted by the human issuing this.
  --
  -- Plan §5, 9.4 (the employee-conflict register). It lives here rather than on
  -- the engagement because it is an ASSERTION MADE AT A MOMENT, by a named person,
  -- and it is one of the inputs `appliesWhen` uses (disclosure.ts:216) — so
  -- storing it beside the text is what makes the render reproducible instead of
  -- merely repeatable. NOTHING INFERS IT: `project_id IS NOT NULL` on the
  -- engagement would understate it (a client can be a listing applicant without
  -- ever being linked to a `projects` row), and understating adjacency silently
  -- drops a required disclosure. Where it has never been asserted the API treats
  -- adjacency as UNKNOWN and computes required disclosures as if it were true —
  -- the direction that produces more disclosure, never less — and says on the
  -- surface that it is doing so.
  lcx_adjacent     boolean NOT NULL,

  -- WAS THE WORDING COUNSEL-REVIEWED WHEN IT WAS GIVEN?
  --
  -- `DisclosureUseRecord.unreviewed` (disclosure.ts:518) says "stored, not
  -- inferred later", and that is the whole reason this column exists rather than
  -- being recomputed from the current constant. Today
  -- `DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED` is true (disclosure.ts:45): the wording
  -- was written by an engineer, not a lawyer. When counsel eventually reviews the
  -- library and that constant flips, every record written before the review must
  -- still say it was unreviewed — recomputing would retroactively claim a review
  -- that never touched these words, which is the exact class of quiet falsehood
  -- this compartment exists to make impossible.
  unreviewed       boolean NOT NULL,

  -- THE NAMED HUMAN who issued it, from `c.get('operator')` and never a body
  -- field. Approver-only at the route, for the reason `0047_gps.sql:278` and
  -- `routes/gps.ts:417` set out: the shared machine key holds `gps` at operate,
  -- so requiring approver is what keeps a cron job from authoring a compliance
  -- record. Text, not an FK: the roster is compiled code (operators.ts).
  decided_by       text NOT NULL CHECK (length(btrim(decided_by)) > 0),
  decided_at       timestamptz NOT NULL DEFAULT now(),

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ONE ROW PER (engagement, template, version). Re-issuing the same version is
-- refused by the API with the existing row attached rather than silently
-- duplicated; a NEW version is a new row and both survive, which is the history.
CREATE UNIQUE INDEX IF NOT EXISTS gps_disclosure_record_issue_idx
  ON gps_disclosure_record (engagement_id, template_id, template_version);

-- "What was this engagement's disclosure position" — the conflict wall's read.
CREATE INDEX IF NOT EXISTS gps_disclosure_record_engagement_idx
  ON gps_disclosure_record (engagement_id, decided_at DESC);

-- "Everything this client was ever told", newest first.
CREATE INDEX IF NOT EXISTS gps_disclosure_record_client_idx
  ON gps_disclosure_record (client_id, decided_at DESC);

-- "Who still has v1 of the standing statement" — the read that matters the day a
-- template is corrected and somebody has to work out who was told what.
CREATE INDEX IF NOT EXISTS gps_disclosure_record_template_idx
  ON gps_disclosure_record (template_id, template_version, decided_at DESC);


-- ── Append-only, enforced by the database ─────────────────────────────────────
--  WHY A TRIGGER AND NOT A COMMENT. RLS cannot do this: the API connects as the
--  database owner and owners bypass RLS (the arrangement 0042 relies on).
--  TRIGGERS DO FIRE FOR THE OWNER, so this is the one mechanism available that
--  binds the code that is actually running. Plan §1 D8 — "no claim without a
--  mechanism": if the wall says a disclosure record is immutable, something has
--  to make it so, and application discipline is not something.
--
--  UPDATE ONLY. DELETE is deliberately left alone, because `ON DELETE CASCADE`
--  from gps_client is how a client's data is erased when erasure is required, and
--  a table that cannot be cascaded out of would turn a GDPR obligation into a
--  migration. The property being protected is that WHAT WE TOLD A CLIENT CANNOT
--  BE REWRITTEN, not that the row is eternal.
--
--  Idempotent: CREATE OR REPLACE FUNCTION, then DROP TRIGGER IF EXISTS before
--  CREATE TRIGGER — the same shape `0009_market_columns.sql:60` uses.
CREATE OR REPLACE FUNCTION gps_disclosure_record_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'gps_disclosure_record is append-only: a disclosure that was given to a client cannot be edited. Issue a new disclosure instead (a new row, with its own template_version and decided_at). See 0050_gps_perimeter.sql.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gps_disclosure_record_no_update ON gps_disclosure_record;
CREATE TRIGGER trg_gps_disclosure_record_no_update
  BEFORE UPDATE ON gps_disclosure_record
  FOR EACH ROW EXECUTE FUNCTION gps_disclosure_record_no_update();


-- ── What these tables are, in the database itself ─────────────────────────────
--  0049 ended this way for a reason worth repeating: the person most likely to
--  misuse a column is the one who never opened the migration, and `\d+` is where
--  they will be looking. COMMENT replaces, so re-running the file is a no-op.
COMMENT ON TABLE gps_jurisdiction_profile IS
  'GPS jurisdiction perimeter: a position a QUALIFIED HUMAN entered about one service in one jurisdiction, with its source, its author and its EXPIRY. Policy, not client data — it carries no client_id and must never vary by client. The system enforces it (packages/shared/src/gps/perimeter.ts gateService) and refuses while a position is missing, unreviewed, malformed or past review_by; it never originates one. See 0050_gps_perimeter.sql.';

COMMENT ON COLUMN gps_jurisdiction_profile.review_by IS
  'EXPIRY, not a reminder. Past this instant gateService refuses with perimeter_stale. The perimeter is not extended by nobody getting round to the review.';

COMMENT ON COLUMN gps_jurisdiction_profile.reviewed_at IS
  'Set only by a review, alongside reviewed_by. PerimeterEntry.reviewed is DERIVED from this being non-null — there is deliberately no reviewed boolean to flip.';

COMMENT ON COLUMN gps_jurisdiction_profile.source_url IS
  'Human-typed reference to the source. Nothing in GPS fetches, resolves, mirrors or validates it, and nothing may be built that does — the same rule as gps_evidence_request.external_location (0049_gps_delivery.sql).';

COMMENT ON TABLE gps_disclosure_record IS
  'GPS disclosure record: WHICH VERSION of which compiled disclosure text a client was actually given, with the verbatim words, the library version, the asserting human and the date. Append-only, enforced by trigger: a disclosure that was given cannot be edited, only superseded by issuing another. See 0050_gps_perimeter.sql.';

COMMENT ON COLUMN gps_disclosure_record.template_version IS
  'The audit key. Text alone cannot be checked against policy and a version alone cannot be reproduced once the text is edited, so both are stored (disclosure.ts disclosureRecord).';

COMMENT ON COLUMN gps_disclosure_record.text_used IS
  'The exact wording the client received, verbatim. Reproducing a historical disclosure reads THIS, never the library — the library holds only current wording and refuses to answer under an older version number.';

COMMENT ON COLUMN gps_disclosure_record.lcx_adjacent IS
  'Asserted by the named human at the moment of issue, never inferred from project_id. Where it has never been asserted, the API treats adjacency as unknown and requires MORE disclosure, not less.';


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED IN THE FILE, not left to a dashboard button — 0042, 0043, 0046, 0047
--  and 0049 each declare their own, and the reason it is repeated per file rather
--  than centralised is that a database restored from these files alone must come
--  up SECURE. Supabase's SQL editor offers "Run and enable RLS" when it sees a
--  CREATE TABLE in `public` without it; taking that option leaves the security
--  posture living in a click nobody records and no diff shows.
--
--  WHAT EACH OF THESE TWO ACTUALLY EXPOSES, because the answer differs and
--  repeating 0047's paragraph by rote would obscure that:
--
--    gps_disclosure_record IS third-party material of the most sensitive kind
--    this compartment holds. Every row names a client, an engagement, and the
--    fact that an exchange employee's conflict position required disclosure to
--    them. Read through Supabase's auto-generated REST API with the anon key, the
--    table is a list of "which token projects were told there was a conflict" —
--    commercially damaging to them, and to LCX.
--
--    gps_jurisdiction_profile is OUR OWN recorded position and holds no client
--    data at all. RLS is enabled anyway, for two reasons. First, an unauthenticated
--    reader who can enumerate which services we consider prohibited where has our
--    compliance posture, which is not public. Second and more important, without
--    RLS the anon role would reach the table at all — and a table whose rows decide
--    whether work may be quoted is the last table in the schema that should be
--    reachable by a key that ships in a web bundle. It is enabled for WRITE-side
--    reasons as much as read-side ones.
--
--  WHY IT CANNOT BREAK LCX OS. The API connects as the database owner, which
--  bypasses RLS — proven in production by `entitlements` being RLS-enabled while
--  the workspace switcher works. NO POLICIES are defined because no non-owner role
--  should reach these tables at all: RLS with no policy is deny-all, which is
--  exactly the intent.
--
--  WHAT RLS DOES NOT DO here, so nobody quotes it as more than it is. It does not
--  scope reads between desk members — that is the entitlement gate, granted for
--  `gps` by `0047_gps.sql:324` and NOT re-granted here, because the compartment
--  already exists and re-seeding it would imply Phase 9 widened access when it did
--  not. It does not stop `/v1/search` reading across compartments (plan §4 S0.2);
--  these two tables are deliberately NOT added to `apps/api/src/routes/search.ts`.
--  And it does not make the disclosure record immutable — the trigger above does
--  that, because owners bypass RLS and would otherwise bypass the whole claim.
ALTER TABLE gps_jurisdiction_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_disclosure_record    ENABLE ROW LEVEL SECURITY;
