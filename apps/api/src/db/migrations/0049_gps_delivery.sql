-- ──────────────────────────────────────────────
--  0049 — GPS DELIVERY: everything around the artifact, and never the artifact
--
--  Phase 3 of GPS_IMPLEMENTATION_PLAN.md. 0047 modelled what is SOLD (client,
--  engagement, conflict check). This file models what happens after the deposit
--  lands: the milestones the work is broken into, the deliverables a partner
--  produces and a human accepts, and the evidence we asked the client for.
--
--  ══════════════════════════════════════════════════════════════════════════
--  ══ THE LOCK: THERE IS NO artifact, blob, bytea, attachment OR document   ══
--  ══ COLUMN ANYWHERE IN THIS FILE, AND THAT IS THE POINT OF THE FILE.     ══
--  ══════════════════════════════════════════════════════════════════════════
--
--  WHY. Decision D2 (plan §3) is UNANSWERED: LCX's DPO has not said whether LCX
--  may hold a third party's unpublished regulatory filings and
--  privileged-adjacent legal work product on its own infrastructure, nor whether
--  LCX would be CONTROLLER or PROCESSOR for that material, nor what the
--  subprocessor chain (Supabase, Render, Cloudflare, OpenRouter) means for it,
--  nor retention, nor erasure. LCX is an EU/Liechtenstein regulated exchange and
--  the founder is its employee; guessing that answer is not a technical risk, it
--  is a regulatory one.
--
--  So this schema is not "missing intake". It is BUILT SO INTAKE CANNOT HAPPEN.
--  A milestone knows it is late. A deliverable knows it was reviewed and
--  accepted. An evidence request knows who owes what and when. The artifact
--  itself stays exactly where the client and their counsel already keep it, and
--  GPS holds only what an operator TYPED about it.
--
--  WHAT `external_location` IS. A text field a human types: "client Notion,
--  Regulatory folder", "counsel's secure portal", "shared drive the client owns".
--  It is a NOTE TO A HUMAN. Nothing in GPS resolves it, fetches it, mirrors it,
--  previews it, or checks that it exists. There is no fetch and no copy — not on
--  a cron, not on a page load, not in the AI layer. Storing a URL that the system
--  then retrieves would recreate the exact exposure D2 is about, one indirection
--  further away from review.
--
--  WHAT D2 GATES, PRECISELY — because over-reading the gate would stall revenue
--  for no safety gain. Plan §2 applies one test per slice: "does this slice cause
--  LCX infrastructure to hold a third party's confidential material?" Tracking
--  that a milestone slipped does not. Receiving the draft does. Plan §4 S0.4
--  states the boundary in the same terms: "No upload endpoint, no storage bucket,
--  no attachment column ships until D2 is answered." Delivery TRACKING is
--  therefore in scope today; delivery INTAKE is not, and this file ships the
--  first without opening the second.
--
--  TURNING INTAKE ON MUST BE A DELIBERATE, REVIEWABLE ACT. It would require a
--  NEW migration that visibly adds a bytes-bearing column, in a diff that names
--  D2 and cites the DPO's answer, reviewed as the regulatory change it is. It
--  must never be reachable as a convenience — not by widening a column here, not
--  by writing a payload into `external_location` (see the length and shape CHECKs
--  below, which make that fail loudly rather than silently succeed), and not by
--  an integration deciding a "location" is something to download.
--
--  THE HONEST LIMIT OF THIS LOCK, stated so nobody quotes it as more than it is.
--  Every table below has free-text columns an operator types — a milestone name,
--  a blocked reason, a request description. A human can type a confidential FACT
--  into any of them, and no schema can stop that. What the schema stops is LCX
--  holding the client's MATERIAL: the file, the draft, the bytes. That is the
--  distinction D2 turns on, and it is worth having even though it is not total.
--  Operator training and the surfaces built on this schema carry the rest.
--
--  NO RETENTION SWEEP HERE, unlike 0046_marketing.sql:58. That file held third
--  party PERSONAL DATA scraped from notification mail and expired every row.
--  These rows are LCX's own record of work it performed and money it is owed;
--  auto-deleting them would destroy the commercial and audit trail an engagement
--  is defended with. Erasure of anything a client can demand back is part of the
--  D2 answer, not something this migration should pre-empt.
--
--  ENUM LITERALS ARE THE DATABASE'S COPY OF THE SHARED UNIONS. Every CHECK below
--  mirrors a closed union in packages/shared/src/gps/types.ts, the same
--  arrangement 0047_gps.sql:139 uses for `offer_key`: a typo in an API payload
--  fails at the database rather than creating a row for a state that does not
--  exist. The authoritative literal sets are:
--    milestone status  pending | in_progress | blocked | done | cancelled
--    deliverable owner partner | internal
--    deliverable stat. pending | in_progress | submitted | in_review |
--                      accepted | rejected | cancelled
--    evidence status   open | satisfied | waived | cancelled
--
--  NO ENTITLEMENT GRANTS IN THIS FILE — CHECKED, NOT ASSUMED. 0047_gps.sql:324
--  already inserts the `gps` covenant rows for monty/nik/sam with
--  `granted_by = 'backfill-0047'`. A second INSERT here would be a no-op under
--  its ON CONFLICT (member_id, workspace) DO NOTHING, but it would also imply
--  this file grants access it does not grant. The compartment is already open to
--  the desk and closed to everyone else; delivery adds no new principal.
--
--  IDEMPOTENT. Every statement is IF NOT EXISTS, an inline constraint on a
--  guarded CREATE TABLE, a COMMENT (which is idempotent by nature), or an
--  ALTER ... ENABLE ROW LEVEL SECURITY (which is a no-op when already on).
--  Re-running the file changes nothing, and a database restored from
--  0047 + this file alone comes up with the same constraints and the same RLS
--  posture — including the lock.
-- ──────────────────────────────────────────────


-- ── The seam that keeps the carried client_id honest ──────────────────────────
--  Every table below carries BOTH client_id and engagement_id (plan §4 S0.3, the
--  same rule 0047 applied to gps_conflict_check even though it could have reached
--  the client through the engagement). Carrying it makes "every deliverable for
--  this client" a scan rather than a join, and a query nobody has to write
--  correctly is a query that gets run.
--
--  The cost of carrying it is DRIFT: two columns can disagree, and a milestone
--  filed under the wrong client is precisely the confidentiality failure this
--  compartment exists to prevent. So it is not left to application discipline.
--  This unique index lets each table below declare a COMPOSITE foreign key on
--  (engagement_id, client_id) → gps_engagement (id, client_id), which makes a
--  mismatched pair unrepresentable rather than merely discouraged.
--
--  Why an index and not ALTER TABLE ... ADD CONSTRAINT UNIQUE: no migration in
--  this repo uses a DO block, and ADD CONSTRAINT has no IF NOT EXISTS form, so a
--  bare ALTER would break the file's re-runnability. A unique index is a valid
--  foreign-key target in PostgreSQL and CREATE UNIQUE INDEX IF NOT EXISTS is
--  idempotent, so this buys the guarantee without the style break.
--
--  It is also a useful index in its own right: gps_engagement is read by client
--  constantly (0047_gps.sql:204).
CREATE UNIQUE INDEX IF NOT EXISTS gps_engagement_id_client_key
  ON gps_engagement (id, client_id);


-- ── Milestones ────────────────────────────────────────────────────────────────
--  How the sold scope is broken into dated steps. This is the table that answers
--  "is this engagement actually moving", which for a one-seller business with
--  partners delivering is the only operational question that matters: he cannot
--  watch the work, so the schedule has to tell him when it stopped.
--
--  NOT `tasks` (0016_tasks_notifications.sql:3), and the reason is structural
--  rather than aesthetic. That table has no client dimension, no engagement
--  column, and — verified against every ALTER in the tree — NO ROW LEVEL
--  SECURITY, while 0042/0043/0046/0047 all declare their own. Folding GPS
--  delivery into it would put a named client's schedule on a desk-level,
--  RLS-less table reachable by the anon key, which is exactly the boundary the
--  eighth compartment was created to draw. Plan §5 listed `tasks` as the reuse
--  candidate for evidence requests; that ruling was made before the RLS gap was
--  checked, and reuse loses to the confidentiality property.
CREATE TABLE IF NOT EXISTS gps_milestone (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carried directly, and held true by the composite FK at the bottom of this
  -- table definition rather than by application discipline.
  client_id      uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  engagement_id  uuid NOT NULL,

  -- Display order within the engagement. NOT UNIQUE per engagement, on purpose:
  -- reordering a plan is a swap, and a swap needs a moment where two rows share
  -- an ordinal. A unique constraint would force either a deferred constraint or
  -- a three-step shuffle in every reorder, to protect against a duplicate a human
  -- can see on screen. 0047_gps.sql:93 refused a unique index on client name for
  -- the same reason.
  ordinal        integer NOT NULL DEFAULT 0 CHECK (ordinal >= 0),

  name           text NOT NULL,

  -- WHO IS ON THE HOOK, as a label: a desk member id (packages/shared/src/
  -- operators.ts) or a partner's name. Text, not an FK: the roster is compiled
  -- code, and the partner bench does not exist yet (plan §3, D5). Nullable
  -- because an unowned milestone is a real and reportable state — it is the
  -- thing that stalls — and forcing a placeholder owner would hide it.
  owner          text,

  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending', 'in_progress', 'blocked', 'done', 'cancelled'
                   )),

  due_by         timestamptz,
  completed_at   timestamptz,

  -- WHY IT IS STUCK, in the operator's words. Free text and not a code, because
  -- the useful version of this sentence is usually about the client ("waiting on
  -- the token economics section from their CFO") and no enum would have held it.
  blocked_reason text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- A blocked milestone with no reason is the failure mode this table exists to
  -- prevent: it looks handled in a list view and is not. Enforced, not reviewed.
  CONSTRAINT gps_milestone_blocked_needs_reason
    CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL),

  -- completed_at MEANS done. Without this, a row can carry a completion date
  -- while sitting in 'in_progress', and then two honest reads of the same table
  -- disagree about whether the work finished.
  CONSTRAINT gps_milestone_completed_implies_done
    CHECK (completed_at IS NULL OR status = 'done'),

  -- The drift guard described above. ON UPDATE CASCADE so that re-parenting an
  -- engagement to the correct client carries its milestones instead of being
  -- blocked by them; ON DELETE CASCADE so a deleted engagement leaves no orphan
  -- schedule behind (and a deleted client cascades through the engagement).
  CONSTRAINT gps_milestone_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- The plan view for one engagement, in the operator's chosen order.
CREATE INDEX IF NOT EXISTS gps_milestone_engagement_idx
  ON gps_milestone (engagement_id, ordinal);

-- "What is due, everywhere" — the morning read. Partial, because a done or
-- cancelled milestone is never in this answer and carrying it would double the
-- index for nothing.
CREATE INDEX IF NOT EXISTS gps_milestone_due_idx
  ON gps_milestone (due_by)
  WHERE status IN ('pending', 'in_progress', 'blocked');

-- Everything blocked, across every client. Small by definition, and the list a
-- coordinator has to clear before anything else moves.
CREATE INDEX IF NOT EXISTS gps_milestone_blocked_idx
  ON gps_milestone (client_id, due_by)
  WHERE status = 'blocked';

-- Every milestone for one client without a join — the point of carrying
-- client_id at all (plan §4 S0.3).
CREATE INDEX IF NOT EXISTS gps_milestone_client_idx
  ON gps_milestone (client_id, due_by);


-- ── Deliverables ──────────────────────────────────────────────────────────────
--  THE THING THE CLIENT BOUGHT — tracked, reviewed and accepted, but never held.
--
--  This is the table the whole lock is about, so read the two location columns
--  before adding anything near them. A deliverable row records that a white paper
--  exists, who wrote it, whether a human at LCX reviewed it, when the client
--  accepted it, and WHERE IT LIVES IN THE CLIENT'S OWN SYSTEMS. It does not
--  record the paper. There is no bytes-bearing column here and adding one is the
--  regulatory change described in the header, not a schema tweak.
--
--  ACCEPTANCE IS THE COMMERCIAL EVENT. `ServiceOffer.acceptanceCriteria`
--  (packages/shared/src/gps/types.ts:168) exists so a partner is paid against a
--  checkable result rather than against effort. accepted_at is where that lands:
--  at $10–25k with a subcontractor delivering, "delivered" and "accepted by the
--  client" being the same field is how a disputed engagement becomes unarguable
--  in the client's favour.
CREATE TABLE IF NOT EXISTS gps_deliverable (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id              uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  engagement_id          uuid NOT NULL,

  -- What it is, client-facing: "MiCA white paper — submission draft". A NAME, and
  -- deliberately not a filename: a filename is one careless step from being
  -- treated as a key into storage that must not exist.
  name                   text NOT NULL,

  -- WHO PRODUCES IT, and this one is an enum rather than a person's label,
  -- because partner-vs-internal is a commercial fact and not a staffing detail:
  -- it decides whether vendor_cost_cents (0047_gps.sql:168) is real spend on this
  -- line, and whether an LCX employee's own work product is what the client is
  -- receiving — which is a conflict-check consideration, not an admin one.
  -- Default 'partner' because partners deliver and the founder coordinates.
  owner                  text NOT NULL DEFAULT 'partner'
                           CHECK (owner IN ('partner', 'internal')),

  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'in_progress', 'submitted', 'in_review',
                             'accepted', 'rejected', 'cancelled'
                           )),

  -- DEFAULT TRUE, and that default is the decision. An exchange employee
  -- coordinating a regulated-adjacent deliverable should have looked at it before
  -- the client does; defaulting to false would make review the exception nobody
  -- notices skipping. Turning it off is a per-row, visible choice.
  review_required        boolean NOT NULL DEFAULT true,

  -- A NAMED HUMAN, same posture as gps_conflict_check.decided_by
  -- (0047_gps.sql:286): text because the roster is compiled code, and with the
  -- same honest limit — attribution is only as strong as the shared DESK_PASSCODE
  -- (plan §1.5) until per-person credentials exist, so this is self-asserted
  -- today. It is still the record that has to exist.
  reviewed_by            text,
  reviewed_at            timestamptz,

  -- When the CLIENT accepted. Distinct from reviewed_at (that is our side) and
  -- from status alone, because the date is what an invoice and a dispute both
  -- turn on.
  accepted_at            timestamptz,

  -- ══ HUMAN-ENTERED REFERENCE. NOT A FETCHABLE ADDRESS. ══
  -- What an operator TYPED about where the material already lives — the client's
  -- own workspace, counsel's portal, a drive the client controls. Nothing in GPS
  -- resolves, retrieves, mirrors or validates this string, and nothing may be
  -- built that does: retrieving it would put the material on LCX infrastructure
  -- by a longer route, which is the very thing D2 has not authorised.
  --
  -- The CHECKs below are a ratchet, not a scanner, and are described honestly as
  -- such: the length cap makes an encoded payload fail loudly instead of
  -- succeeding silently, and the prefix test rejects the single most likely
  -- accident — an inline data: URI pasted straight out of a browser. Neither
  -- inspects content. The real guarantee is that no route exists that writes
  -- bytes anywhere in this schema; a ratchet test asserts that absence
  -- (plan §4 S0.4).
  external_location      text
                           CONSTRAINT gps_deliverable_location_is_a_reference
                           CHECK (
                             external_location IS NULL
                             OR (length(external_location) <= 500
                                 AND external_location NOT LIKE 'data:%')
                           ),

  -- Free-text colour on the reference above ("ask Anna for access", "counsel
  -- holds the signed copy"). Capped for the same reason.
  external_location_note text
                           CONSTRAINT gps_deliverable_location_note_is_a_note
                           CHECK (
                             external_location_note IS NULL
                             OR length(external_location_note) <= 1000
                           ),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- A review with no reviewer is not a review. Same reasoning as
  -- gps_conflict_check.decided_by being NOT NULL: an unattributed sign-off is
  -- worse than none, because it looks like assurance.
  CONSTRAINT gps_deliverable_review_is_attributed
    CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL),

  -- THE ONE THAT EARNS ITS KEEP: a deliverable that requires review cannot be
  -- accepted before it was reviewed. This is the review gate itself, held in the
  -- database rather than in whichever handler happens to run — so no future
  -- endpoint, batch update or manual SQL can accept unreviewed work product on a
  -- regulated exchange employee's engagement.
  CONSTRAINT gps_deliverable_no_acceptance_before_review
    CHECK (NOT (review_required AND accepted_at IS NOT NULL AND reviewed_at IS NULL)),

  -- 'accepted' without a date is unauditable, and the date is what gets invoiced.
  CONSTRAINT gps_deliverable_accepted_has_a_date
    CHECK (status <> 'accepted' OR accepted_at IS NOT NULL),

  CONSTRAINT gps_deliverable_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- The engagement page: everything being produced, newest first.
CREATE INDEX IF NOT EXISTS gps_deliverable_engagement_idx
  ON gps_deliverable (engagement_id, created_at DESC);

-- Every deliverable for one client, by state — the client page and the
-- confidentiality-scoped read.
CREATE INDEX IF NOT EXISTS gps_deliverable_client_idx
  ON gps_deliverable (client_id, status);

-- THE REVIEW QUEUE, and the only reason review_required is a column rather than
-- a convention: work that needs LCX eyes and has not had them. Partial, because
-- an empty queue should cost nothing to read.
CREATE INDEX IF NOT EXISTS gps_deliverable_awaiting_review_idx
  ON gps_deliverable (engagement_id, created_at)
  WHERE review_required AND reviewed_at IS NULL;

-- What the partner bench is on the hook for, by state — the concurrency question
-- (plan §1.1: with partners delivering, bench depth IS the capacity cap).
CREATE INDEX IF NOT EXISTS gps_deliverable_owner_idx
  ON gps_deliverable (owner, status);


-- ── Evidence requests ─────────────────────────────────────────────────────────
--  THE REQUEST FOR THE THING, WHICH IS AS FAR AS THIS SYSTEM GOES.
--
--  `ServiceOffer.requiredClientInputs` (packages/shared/src/gps/types.ts:139) is
--  the promise that a missing input is our problem if we never asked for it. This
--  table is the asking: what we need, who we asked, when, by when, and whether it
--  ever arrived. Its own type comment already says the quiet part — "naming an
--  input here does NOT create a place to upload it" — and this table is the
--  faithful version of that sentence in SQL.
--
--  SO NOTE WHAT `satisfied_at` MEANS AND DOES NOT MEAN. It means a human ticked
--  that the client provided it, wherever they provided it: in a call, in their own
--  portal, to counsel directly. It does NOT mean anything arrived here, and there
--  is no column it could have arrived in. `external_location` is again a typed
--  note about where the client put it, never a handle GPS resolves.
--
--  WHY NOT `tasks` (0016_tasks_notifications.sql:3), which plan §5 nominated: the
--  same structural answer as for milestones. `tasks` has no client dimension and
--  no RLS, so an evidence request describing a client's unpublished token
--  economics would sit on a desk-level table exposed to the anon key. The plan's
--  reuse ruling predates that check; confidentiality wins over table count.
CREATE TABLE IF NOT EXISTS gps_evidence_request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id         uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  engagement_id     uuid NOT NULL,

  -- WHAT WE ASKED FOR, in words a client could act on: "the audited token
  -- allocation table as at 30 June". NOT NULL — a request nobody can read is not
  -- a request. This is a DESCRIPTION OF the material, and it is the closest this
  -- schema ever gets to the material itself.
  description       text NOT NULL,

  -- WHO WE ASKED, as a label ("client — COO", "their counsel at <firm>").
  -- Deliberately not an email address and not a contact table, the same
  -- data-minimisation posture as gps_client.primary_contact (0047_gps.sql:79):
  -- the less third-party personal data sits on a licensed exchange's
  -- infrastructure, the smaller the question D2 has to answer. Nullable because
  -- "we asked the client" is sometimes genuinely all that is known, and forcing a
  -- name invites an invented one.
  requested_from    text,

  -- WHEN WE ASKED. This is also the row's creation fact, and there is no separate
  -- created_at on purpose: two timestamps for one event drift, and then "when did
  -- we ask" has two answers in an argument about whose delay it was.
  requested_at      timestamptz NOT NULL DEFAULT now(),

  due_by            timestamptz,

  -- 'waived' is a real outcome and not a euphemism: sometimes the client cannot
  -- produce the input and the work proceeds narrowed. Recording that as waived
  -- rather than silently closing it is what keeps the scope conversation honest
  -- when the deliverable is later judged incomplete.
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'satisfied', 'waived', 'cancelled')),

  -- ══ HUMAN-ENTERED REFERENCE. NOT A FETCHABLE ADDRESS. ══
  -- Where the client says they put it. Typed, never resolved — see the
  -- gps_deliverable.external_location comment and the file header. Same ratchet
  -- CHECKs, same honest scope: they make a smuggled payload fail loudly, they do
  -- not inspect content, and the actual guarantee is the absence of any write
  -- path for bytes.
  external_location text
                      CONSTRAINT gps_evidence_request_location_is_a_reference
                      CHECK (
                        external_location IS NULL
                        OR (length(external_location) <= 500
                            AND external_location NOT LIKE 'data:%')
                      ),

  satisfied_at      timestamptz,

  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- An equivalence, not an implication in one direction: 'satisfied' without a
  -- date is unauditable, and a date without the status makes the chase list lie
  -- about what is outstanding. Both halves have to hold or the open-requests read
  -- below is wrong.
  CONSTRAINT gps_evidence_request_satisfied_iff_dated
    CHECK ((status = 'satisfied') = (satisfied_at IS NOT NULL)),

  CONSTRAINT gps_evidence_request_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Everything we have asked this engagement for, newest first.
CREATE INDEX IF NOT EXISTS gps_evidence_request_engagement_idx
  ON gps_evidence_request (engagement_id, requested_at DESC);

-- THE CHASE LIST: what is still outstanding, soonest due first. Partial because
-- open requests are the only rows anyone queries this way, and because a
-- satisfied request should not slow down the read that matters.
CREATE INDEX IF NOT EXISTS gps_evidence_request_open_idx
  ON gps_evidence_request (due_by)
  WHERE status = 'open';

-- By client, without a join (plan §4 S0.3).
CREATE INDEX IF NOT EXISTS gps_evidence_request_client_idx
  ON gps_evidence_request (client_id, status);


-- ── The lock, restated where a GUI will show it ────────────────────────────────
--  A header comment is only read by whoever opens this file. These live IN THE
--  DATABASE: they appear in psql's \d+, in Supabase's table editor, and in any
--  schema browser a future engineer or a reviewing auditor actually uses. The
--  person most likely to add the wrong column is the one who never opened 0049.
--
--  COMMENT is idempotent — it replaces, so re-running the file is a no-op.
COMMENT ON TABLE gps_deliverable IS
  'GPS delivery tracking. Records THAT a deliverable exists, was reviewed and was accepted. It never holds the material itself: no bytes column exists here and adding one requires the answer to decision D2 (whether LCX may hold third-party confidential material on its own infrastructure), not a schema tweak. See 0049_gps_delivery.sql.';

COMMENT ON COLUMN gps_deliverable.external_location IS
  'Human-typed reference to where the material already lives, in the client or counsel systems. Nothing in GPS reads, resolves, fetches or copies it, and nothing may be built that does. See 0049_gps_delivery.sql.';

COMMENT ON COLUMN gps_evidence_request.external_location IS
  'Human-typed reference to where the client says they put it. Nothing in GPS reads, resolves, fetches or copies it. See 0049_gps_delivery.sql.';

COMMENT ON COLUMN gps_evidence_request.description IS
  'A description OF what was asked for, typed by an operator. Never the material itself.';


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED HERE, not left to a dashboard button — the same reasoning 0042, 0043,
--  0046 and 0047 each state for themselves, and the reason it is repeated per
--  file rather than centralised: a database restored from these files alone must
--  come up SECURE. Supabase's SQL editor offers "Run and enable RLS" when it sees
--  a CREATE TABLE in `public` without it, and taking that option leaves the
--  security posture living in a click nobody records and no diff shows.
--
--  WHY IT MATTERS FOR THESE THREE TABLES SPECIFICALLY. Supabase exposes `public`
--  tables through its auto-generated REST API. Without RLS, anyone holding the
--  project's anon key could read gps_evidence_request — which describes, in
--  sentences, exactly what unpublished regulatory and legal material a named
--  third party is preparing — and gps_deliverable, which says where that material
--  is kept. 0046 protected personal data; 0047 protected other companies'
--  contract terms and our margin; this file protects the ROADMAP TO a client's
--  confidential filings. It is the most sensitive of the three even though it
--  holds no material, because a location plus a description is a target list.
--
--  WHY IT CANNOT BREAK LCX OS. The API connects as the database owner, which
--  bypasses RLS — the arrangement 0042 relies on, proven by `entitlements` being
--  RLS-enabled while the workspace switcher works in production today. NO POLICIES
--  are defined because no non-owner role should reach these tables at all: RLS
--  with no policy is deny-all, which is exactly the intent.
--
--  WHAT RLS DOES NOT DO, so nobody quotes it as more than it is. It does not scope
--  reads between desk members (that is the entitlement gate, already granted for
--  `gps` by 0047_gps.sql:324), and it does not stop `/v1/search` reading across
--  compartments — that hole is open today, is plan §4 S0.2, and these tables are
--  deliberately NOT added to `apps/api/src/routes/search.ts`, which currently
--  reads projects, people, deals, notes, news, command_* and dist_* and must not
--  learn to read a client's delivery record. RLS here closes the anon-key path
--  and nothing more.
ALTER TABLE gps_milestone        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_deliverable      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_evidence_request ENABLE ROW LEVEL SECURITY;
