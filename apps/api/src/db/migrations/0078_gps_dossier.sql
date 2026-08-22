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
