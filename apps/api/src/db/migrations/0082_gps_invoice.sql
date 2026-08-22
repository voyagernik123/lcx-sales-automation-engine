-- 0082 · G6 — MONEY: invoices the book believes.
--
-- One table, and one invariant that is the whole point: AN INVOICE THAT DOES NOT
-- TRACE TO AN ACCEPTED DELIVERABLE IS INEXPRESSIBLE (plan §G6, D1/D8). deliverable_id
-- is NOT NULL and the service refuses to insert unless that deliverable's accepted_at
-- is set — i.e. a named human (desk QA) or the client (G4 portal) has accepted the
-- thing being billed. There is no free-form invoice path and no column for one.
--
-- THE NUMBER IS THE IDENTITY, so it is immutable by construction: invoice_number is
-- derived from the append-only `id` (GPS-000001…) in the shared layer, never stored
-- as a mutable string that could drift from the row it names. amount_cents and
-- currency are written once at issue and never updated — the only writes after issue
-- are STATUS TRANSITIONS, each into its own attributed columns, so the commercial
-- core is sealed like an audit row while the lifecycle still moves.
--
-- DISPUTES ARE A STATE, NOT A DELETE (plan §G6). void/disputed/paid each carry their
-- own reason/reference/actor/timestamp; a disputed invoice still exists, still ages,
-- and still shows in the book. A partial unique index lets a deliverable carry at
-- most one NON-void invoice — double-billing is a constraint violation, not a review
-- item — while a voided invoice may be re-issued.
--
-- RAILS STAY EXTERNAL (answer #10): marking paid is a governed action that RECORDS a
-- reference to a settlement that happened elsewhere. There is no bank integration,
-- no card field, no money movement — paid_reference is the human's proof, stored.
--
-- D2, BECAUSE EVERY gps_ MIGRATION MUST TAKE A POSITION ON IT: an invoice is LCX's
-- own commercial record about its own engagement — no client material, no byte column.
-- No jsonb; every text column hard-capped.
--
-- RLS ON, NO POLICIES — deny-all to the anon key; the API connects as the owner,
-- exactly as 0052:214 and 0047:333.

CREATE TABLE IF NOT EXISTS gps_invoice (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_id  uuid NOT NULL REFERENCES gps_engagement(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  -- The accepted deliverable this bills. NOT NULL is the "traces to acceptance"
  -- invariant's first half; the service checking accepted_at is the second.
  deliverable_id uuid NOT NULL REFERENCES gps_deliverable(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  currency       text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status         text NOT NULL DEFAULT 'issued' CHECK (status IN (
                   'issued', 'paid', 'disputed', 'void'
                 )),
  issued_by      text NOT NULL CHECK (length(btrim(issued_by)) > 0 AND length(issued_by) <= 120),
  issued_at      timestamptz NOT NULL DEFAULT now(),
  -- Payment: a reference to a settlement that happened on an external rail.
  paid_at        timestamptz,
  paid_by        text CHECK (paid_by IS NULL OR length(paid_by) <= 120),
  paid_reference text CHECK (paid_reference IS NULL OR (length(btrim(paid_reference)) > 0
                                                        AND length(paid_reference) <= 200)),
  -- Dispute and void: states, each reasoned and attributed.
  disputed_at    timestamptz,
  disputed_by    text CHECK (disputed_by IS NULL OR length(disputed_by) <= 120),
  disputed_reason text CHECK (disputed_reason IS NULL OR (length(btrim(disputed_reason)) > 0
                                                          AND length(disputed_reason) <= 500)),
  voided_at      timestamptz,
  voided_by      text CHECK (voided_by IS NULL OR length(voided_by) <= 120),
  voided_reason  text CHECK (voided_reason IS NULL OR (length(btrim(voided_reason)) > 0
                                                       AND length(voided_reason) <= 500)),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Each terminal state carries its own evidence or does not exist.
  CONSTRAINT gps_invoice_paid_referenced
    CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL
                                AND paid_reference IS NOT NULL)),
  CONSTRAINT gps_invoice_dispute_reasoned
    CHECK (status <> 'disputed' OR (disputed_at IS NOT NULL AND disputed_by IS NOT NULL
                                    AND disputed_reason IS NOT NULL)),
  CONSTRAINT gps_invoice_void_reasoned
    CHECK (status <> 'void' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL
                               AND voided_reason IS NOT NULL)),
  -- The drift guard: an invoice's engagement and client agree with the engagement row.
  CONSTRAINT gps_invoice_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- At most one non-void invoice per deliverable: double-billing is a violation, not a
-- review item. A voided invoice frees the deliverable to be re-issued.
CREATE UNIQUE INDEX IF NOT EXISTS gps_invoice_one_per_deliverable
  ON gps_invoice (deliverable_id) WHERE status <> 'void';

CREATE INDEX IF NOT EXISTS gps_invoice_engagement_idx ON gps_invoice (engagement_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS gps_invoice_open_idx ON gps_invoice (status, issued_at) WHERE status IN ('issued', 'disputed');

ALTER TABLE gps_invoice ENABLE ROW LEVEL SECURITY;
