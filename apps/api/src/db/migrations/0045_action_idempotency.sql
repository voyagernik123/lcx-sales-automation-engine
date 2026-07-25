-- ──────────────────────────────────────────────
--  0045 — replay protection for POST /v1/actions/:id/invoke
--
--  THE DEFECT this closes: a transport failure means the RESPONSE was lost, not
--  that the request was. There was no idempotency key on the governed invoke
--  route, so a retry of an APPENDING action ran it twice — a second
--  dist_campaigns row, and (for every action, appending or not) a second
--  object_actions row and a second audit_log entry. The audit spine the whole
--  programme is judged against could be made to record an action that happened
--  once as having happened twice, by nothing more exotic than a flaky network.
--
--  THE KEY is (action, subject_type, subject_id, idem_key) — the client generates
--  idem_key once per user intent and reuses it across transport retries of that
--  intent. NOT keyed on params: two different param sets under one key is a
--  client bug, and executing the second one is the worse of the two answers.
--
--  result IS NULL means RESERVED (in flight); non-null means COMPLETE and a
--  retry replays it. That is why result is nullable and why the reservation is
--  claimed with INSERT .. ON CONFLICT DO NOTHING — one statement, so two
--  concurrent retries cannot both win. A read-then-write check would let both
--  through, which is the race that actually happens.
--
--  actor is recorded but NOT part of the key. Two operators cannot collide by
--  accident (keys are uuids), and if they somehow shared one, the second must be
--  refused rather than silently given the first's result — so the column exists
--  to make that visible in the audit, not to widen the key.
--
--  FAIL-OPEN: the API treats 42P01 on these tables as "0045 has not landed yet"
--  and proceeds without replay protection, stamping idempotencyDegraded on the
--  ledger row so the gap is legible. Every other error propagates. Same rule as
--  access/entitlements.ts and the two SAT gates.
--
--  NO PRUNING JOB EXISTS. Rows accumulate. The index on created_at is here so a
--  future sweep is cheap, but nothing deletes them today and this comment must
--  not be read as saying otherwise — at desk volumes (single-digit governed
--  writes per minute) that is a rounding error for now, not a solved problem.
--
--  Idempotent. RLS on (the API's postgres owner bypasses it).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS action_idempotency (
  action       text NOT NULL,                 -- ACTION_REGISTRY id
  subject_type text NOT NULL,
  subject_id   text NOT NULL,
  idem_key     text NOT NULL,                 -- the Idempotency-Key header, verbatim
  actor        text NOT NULL,                 -- who claimed the reservation
  result       jsonb,                          -- NULL = reserved/in-flight, non-null = complete
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (action, subject_type, subject_id, idem_key)
);

-- The takeover check reads age off created_at, and a future sweep will scan on
-- it. Partial on the in-flight rows only: those are the ones the hot path looks
-- at, and they are a tiny minority of the table.
CREATE INDEX IF NOT EXISTS idx_action_idempotency_inflight
  ON action_idempotency (created_at)
  WHERE result IS NULL;

ALTER TABLE action_idempotency ENABLE ROW LEVEL SECURITY;
