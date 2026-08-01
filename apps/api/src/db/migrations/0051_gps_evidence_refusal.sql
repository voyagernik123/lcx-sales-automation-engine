-- ──────────────────────────────────────────────
--  0051 — GPS EVIDENCE: 'refused' AND 'partially_received' GET A DB LITERAL
--
--  Closes the one DB↔TS enum divergence in the delivery compartment where the
--  shared union carried a state the database could not hold.
--
--  ══ THE DIVERGENCE, AND WHY THIS DIRECTION ══════════════════════════════════
--  0049_gps_delivery.sql:417 constrained gps_evidence_request.status to
--  open | satisfied | waived | cancelled. `EvidenceStatus`
--  (packages/shared/src/gps/delivery.ts:780) is
--  requested | partially_received | received | waived | refused. Three of those
--  translate (open↔requested, satisfied↔received, waived↔waived, and `cancelled`
--  maps IN to waived and is reported per row as lossy). Two had no literal at all.
--
--  The alternative was dropping `refused` from the union. It was rejected because
--  `refused` is not decoration: delivery.ts:769 makes it a first-class outcome
--  ("a client entitled to say 'no, you may not see our cap table' must be
--  answerable in the system, because the alternative is an open request that
--  silently ages and a delivery date that slips with no named cause"),
--  `composeEvidenceChase` counts it, and `deliveryNotices` raises an
--  `evidence_refused` refusal from it. Dropping the literal would not simplify the
--  system — it would delete the ability to record a client's refusal and leave the
--  request ageing as though it were still open, which is the exact failure the
--  union was written to prevent. `partially_received` is in the same entry of
--  `DELIVERY_SCHEMA_GAPS` (apps/api/src/gps/deliveryDesk.ts:335) and is added with
--  it, because closing half of a stated gap leaves the ledger entry a half-truth.
--
--  A CAST WAS NEVER AN OPTION. Nothing here or in the API coerces `refused` into
--  `open`. Before this migration the write was REFUSED with the missing literal
--  named (deliveryDesk.ts `EVIDENCE_STATUS_TO_DB`); after it the write succeeds.
--  In an environment where this file has not yet been applied, the UPDATE trips
--  the old CHECK and `constraintRefusal()` turns it into a structured refusal
--  naming the constraint — a 409, never a 500 and never a silent downgrade.
--
--  ══ NO NEW TABLE, NO NEW COLUMN, NO NEW SURFACE — AND D2 IS STILL OPEN ══════
--  There is no artifact column here and there is none anywhere in the GPS schema,
--  because decision D2 is UNANSWERED: LCX's legal/DPO has not said whether LCX is
--  controller vs processor for a third party's confidential material, nor settled
--  the subprocessor chain (Supabase/Render/Cloudflare/OpenRouter), retention or
--  erasure. Until it does, the system must be INCAPABLE of accepting a client
--  document, not merely discouraged (GPS_IMPLEMENTATION_PLAN.md §4 S0.4).
--  Widening a status CHECK does not touch that: what this file makes recordable is
--  the client's ANSWER about a document ("no, you may not see our cap table"), not
--  the document. If you are here to add a column, that is the question you are
--  deciding — read 0047_gps.sql:26-36 before you do.
--
--  This file adds nothing that could hold a client document:
--  no bytea, no json, no text column of any kind, no table, no index, no grant.
--  The Phase-3 intake lockout (apps/api/src/gps/__tests__/intakeLockout.test.ts)
--  is untouched by it, and `external_location` keeps the shape CHECKs 0049 gave
--  it — a typed reference nothing resolves.
--
--  IDEMPOTENT. Dropping a named constraint IF EXISTS and re-adding it is safe to
--  re-run; the CHECK is recreated with the same name so a third run is a no-op.
-- ──────────────────────────────────────────────

ALTER TABLE gps_evidence_request
  DROP CONSTRAINT IF EXISTS gps_evidence_request_status_check;

ALTER TABLE gps_evidence_request
  ADD CONSTRAINT gps_evidence_request_status_check
  CHECK (status IN (
    -- The four 0049 shipped. `open` and `satisfied` remain the DB spelling of
    -- `requested` and `received`; `cancelled` remains the settled-no-further-
    -- expectation state that maps in to `waived` and is reported as lossy.
    'open', 'satisfied', 'waived', 'cancelled',
    -- New. Both are recorded states, not derived ones: only an operator relaying
    -- what the counterparty said can put a row here.
    'refused', 'partially_received'
  ));

-- The satisfied_at biconditional (0049:442) is deliberately left exactly as it
-- was: `(status = 'satisfied') = (satisfied_at IS NOT NULL)`. A refused or
-- partially received request has no satisfaction timestamp, so it satisfies the
-- existing constraint unchanged — and a future edit that tried to stamp one would
-- still fail loudly rather than dating a satisfaction that did not happen.
--
-- NOT DONE HERE, and stated rather than implied: `resolution_note` still does not
-- exist, so a refusal can now be RECORDED but its reason still cannot be. That
-- remains its own entry in DELIVERY_SCHEMA_GAPS and travels on the delivery
-- response; this file does not silently retire it.
