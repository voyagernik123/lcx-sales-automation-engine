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
