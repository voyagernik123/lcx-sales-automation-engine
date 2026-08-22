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
