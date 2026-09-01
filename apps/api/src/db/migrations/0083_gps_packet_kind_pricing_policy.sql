-- 0083 — WIDEN gps_packet_decision.packet_kind TO ADMIT 'pricing_policy'.
--
-- THE DEFECT THIS FIXES, found by running the packet apply against a scratch
-- database built from this very chain (2026-09-01): 0079 added the pricing-policy
-- packet to PACKET_KINDS in code, but the CHECK on gps_packet_decision (0076:64)
-- still enumerated only the original five kinds. Approving the sixth packet
-- therefore ALWAYS failed at the decision INSERT with
-- gps_packet_decision_packet_kind_check — the one founder decision the register
-- could not record, discovered only when the decision write was finally exercised.
--
-- The new constraint is NAMED, so the next kind widens it by name instead of
-- guessing the auto-generated one from an error message, as this migration had to.
--
-- THE COMPARTMENT'S POSTURE, restated because this file alters a gps_ table:
-- gps_packet_decision stores FOUNDER DECISIONS and their proposals — our own
-- text, never client material. The D2 / DPO question (controller vs processor
-- for third-party confidential documents) is answered, dated and attributed —
-- one of the six decisions this very table records is that answer (packet_kind
-- 'dpo_memo') — and nothing here adds bytes, columns or storage for client
-- documents: the one-column-for-bytes design stays where 0057 put it.

ALTER TABLE gps_packet_decision
  DROP CONSTRAINT IF EXISTS gps_packet_decision_packet_kind_check;

ALTER TABLE gps_packet_decision
  ADD CONSTRAINT gps_packet_decision_packet_kind_check CHECK (packet_kind IN (
    'price_bands', 'effort_triples', 'rate_cards',
    'perimeter_seed', 'dpo_memo', 'pricing_policy'
  ));
