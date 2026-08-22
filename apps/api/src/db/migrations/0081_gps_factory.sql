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
