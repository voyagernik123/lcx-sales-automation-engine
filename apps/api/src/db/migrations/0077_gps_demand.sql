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
