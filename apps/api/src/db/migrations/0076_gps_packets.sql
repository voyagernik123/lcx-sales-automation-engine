-- 0076 · G0 — THE FOUNDER PACKETS: the sell-side price register, and the decision record.
--
-- Two tables, one phase (GPS_REVENUE_100X_PLAN.md §G0, approved 2026-08-21):
--
--  1 · gps_price_band — the register gpsInputs.ts has PROMISED since it shipped: every
--      write there refuses with PRICE_BAND_REGISTER_ABSENT carrying this exact DDL and the
--      instruction to "land this same text as the next free numbered file". This is that
--      file. The section between the BEGIN/END VERBATIM markers is byte-identical to
--      PRICE_BAND_REGISTER_DDL (apps/api/src/routes/gpsInputs.ts) — extracted from the
--      export, not retyped — and gpsPackets.test.ts asserts the two never drift.
--
--  2 · gps_packet_decision — the append-only record of what the owner decided about each
--      founder packet. The FINAL payload (his edits included) is stored as the JSON the
--      apply step ran on, because "what did I actually approve" must be answerable from
--      one row forever. No UPDATE path: a change of mind is a NEW decision row, and the
--      newest row per kind wins — same append-only reasoning as the desk-mode ledger.
--
-- RLS ON, NO POLICIES on both — deny-all to the anon key; the API connects as the owner
-- and bypasses it, exactly as 0052:214 and 0047:333.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: no client material enters
-- through anything here. gps_price_band holds five integer-cent bands stated by a named
-- human; gps_packet_decision holds the owner's decisions about the five founder packets —
-- and one of those decisions IS the DPO question itself (packet_kind = 'dpo_memo': whether
-- LCX acts as controller or processor for client-supplied confidential material, and on
-- what DPA terms). This table RECORDS that answer; it does not act on it — G4's portal
-- reads the standing dpo_memo decision and ships exactly what it permits, and until such
-- a decision exists the intake lockout keeps refusing every upload surface as before.
-- final_proposal is jsonb and was admitted to intakeLockout.test.ts's frozen jsonb set
-- with a full review: keys AND values bounded at the only writer, no read republication.

-- ── BEGIN VERBATIM PRICE_BAND_REGISTER_DDL ─────────────────────────────────────
-- GPS PRICE BANDS — the SELL side. Idempotent, forward-only.
-- Paste into the Supabase SQL editor, then land this same text as the next free
-- numbered file in apps/api/src/db/migrations/.
CREATE TABLE IF NOT EXISTS gps_price_band (
  offer_key   text PRIMARY KEY
                CHECK (offer_key IN (
                  'diagnostic', 'mica_whitepaper',
                  'legal_opinion_coordination', 'gtm_sprint',
                  'marketing_activation'
                )),
  low_cents   bigint NOT NULL CHECK (low_cents  > 0),
  mid_cents   bigint NOT NULL CHECK (mid_cents  > 0),
  high_cents  bigint NOT NULL CHECK (high_cents > 0),
  currency    text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  stated_by   text NOT NULL CHECK (length(btrim(stated_by)) > 0
                                   AND length(stated_by) <= 120),
  stated_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gps_price_band_ascending
    CHECK (low_cents <= mid_cents AND mid_cents <= high_cents)
);

ALTER TABLE gps_price_band ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_price_band IS
  'GPS price band: what LCX SELLS one offer for, low/mid/high, integer cents, stated by a named human. The SELL side - gps_rate_card is the COST side and the two must never be conflated. No client_id: a price that varies by client is a negotiated price and lives on gps_engagement. Absent rows are not an error - the compiled placeholder (packages/shared/src/gps/catalogue.ts TODO_PRICE_BANDS) is used instead and every surface badges it as a placeholder.';
-- ── END VERBATIM PRICE_BAND_REGISTER_DDL ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS gps_packet_decision (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  packet_kind   text NOT NULL CHECK (packet_kind IN (
                  'price_bands', 'effort_triples', 'rate_cards',
                  'perimeter_seed', 'dpo_memo'
                )),
  decision      text NOT NULL CHECK (decision IN (
                  'approved', 'approved_with_edits', 'rejected'
                )),
  -- The FINAL proposal the decision was made on — the owner's edits included. jsonb so
  -- the apply step and any later audit read the same bytes the approval saw. Never a
  -- document store: the shapes here are the five typed proposals and nothing else, and
  -- the API validates with packetProposalDefects before any INSERT.
  final_proposal jsonb NOT NULL,
  -- What the apply step did, recorded honestly: rate_cards and dpo_memo are
  -- 'recorded_only' BY DESIGN (bench empty / G4 reads the decision later), so a
  -- three-state 'applied' boolean would lie about them.
  apply_state   text NOT NULL CHECK (apply_state IN (
                  'applied', 'recorded_only', 'apply_failed'
                )),
  apply_detail  text NOT NULL CHECK (length(btrim(apply_detail)) > 0),
  decided_by    text NOT NULL CHECK (length(btrim(decided_by)) > 0
                                     AND length(decided_by) <= 120),
  decided_at    timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS gps_packet_decision_kind_idx
  ON gps_packet_decision (packet_kind, decided_at DESC);

ALTER TABLE gps_packet_decision ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_packet_decision IS
  'Append-only record of founder-packet decisions (G0). One row per decision; the newest row per packet_kind is the standing decision. final_proposal is the exact JSON the apply step ran on - what the owner approved, edits included. apply_state distinguishes applied (rows written), recorded_only (deliberate: rate_cards await a named partner, dpo_memo is read by G4), and apply_failed (decision stands, apply must be retried).';
