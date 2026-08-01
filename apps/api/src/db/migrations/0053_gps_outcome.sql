-- ──────────────────────────────────────────────
--  0053 — GPS OUTCOME: what actually happened, per engagement, once
--
--  `apps/api/src/gps/loop.ts:97` has named this file since Phase 10 and it was
--  never written, so outcome capture answers 503 and every rate, win/loss split
--  and realised-margin figure on the loop surface reads from nothing. This is that
--  file, built to `OUTCOME_MIGRATION_SPEC` (loop.ts:117) so the 503's promise and
--  the schema cannot disagree.
--
--  ONE ROW PER ENGAGEMENT, and the primary key IS the idempotency key: closing the
--  same engagement twice CORRECTS one row (`ON CONFLICT (engagement_id) DO UPDATE`,
--  loop.ts:495) instead of adding a second win. At ~29 engagements a year
--  (ASSUMED_ANNUAL_ENGAGEMENT_VOLUME) a duplicated outcome is a 3% error in every
--  rate on every surface.
--
--  WHY NOT COLUMNS ON gps_engagement. Four of these fields could live there; five
--  cannot without damage. `disposition`/`reason` would duplicate `status` and let a
--  row say status='collected', disposition='lost'. `factor_scores_at_quote` is a
--  snapshot whose whole point is being frozen against a versioned scorer
--  (`calibration.ts:150`), and a nullable jsonb on the pipeline table invites a
--  recompute-in-place. And an outcome needs its own recorded_by/recorded_at, which
--  is the attribution `updated_at` on the engagement destroys on the next status
--  change.
--
--  NO client_id, AND THIS IS THE ONE PLACE IN GPS THAT DEPARTS FROM 0047's RULE.
--  0047_gps.sql:38 carries client_id on every table so a per-client read needs no
--  join, and 0049 enforced it with a composite FK. Here the writer is fixed: the
--  INSERT in `loop.ts:495` names its columns explicitly and supplies no client_id,
--  and the reader already takes the client from the parent
--  (`OUTCOME_SELECT`: `e.client_id ... JOIN gps_engagement e`). A NOT NULL
--  client_id would make every outcome write fail; a nullable one would be a drift
--  guard that never fires, because a composite FK with a NULL half is not checked.
--  So the client dimension is the JOIN, and it CANNOT drift because engagement_id
--  is the primary key and cascades from the engagement. What it costs: "every
--  outcome for this client" is a join, not a scan. Closing it properly means adding
--  client_id to the INSERT in loop.ts in the same commit as a composite FK, and
--  that is a code change, not a migration.
--
--  ══ NO ARTIFACT, ATTACHMENT, LOCATION, URL OR MIME COLUMN EXISTS HERE ════════
--  Decision D2 — controller vs processor for a third party's confidential material,
--  the subprocessor chain (Supabase/Render/Cloudflare/OpenRouter), retention,
--  erasure — is UNANSWERED by LCX's legal/DPO. The compartment stays physically
--  incapable of holding a client document (0047_gps.sql:26-36).
--  `intakeLockout.test.ts` discovers migrations by CONTENT and fails the build on a
--  byte-bearing column or a byte-shaped name, this file included.
--
--  Idempotent, forward-only. Applied BY HAND in the Supabase SQL editor; nothing
--  wires the runner into the deploy (`db/migrate.ts`).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gps_outcome (
  -- THE PRIMARY KEY, not a surrogate id with a unique index beside it. One outcome
  -- per engagement is the invariant, and making it the key means no code path can
  -- create a second.
  engagement_id              uuid PRIMARY KEY
                               REFERENCES gps_engagement(id) ON DELETE CASCADE,

  -- Mirrors OutcomeDisposition (`calibration.ts:71`). CANCELLED IS NOT A
  -- DISPOSITION: it is the excluded case, and the exclusion is disclosed on every
  -- response rather than being folded into 'lost' — a cancelled engagement is not
  -- a loss to anyone, and counting it as one moves the win rate.
  disposition                text NOT NULL CHECK (disposition IN ('won', 'lost')),

  -- Validated against WIN_REASONS / LOSS_REASONS at the edge by `isReasonValidFor`,
  -- and deliberately NOT a CHECK listing twelve literals: this is one union that is
  -- expected to grow from review, and a CHECK here would go stale against it and
  -- turn a newly-agreed reason into a 500. Length-capped because it is text on a
  -- server with no bodyLimit — the door `currency` went through
  -- (`intakeLockout.test.ts`).
  reason                     text NOT NULL CHECK (length(btrim(reason)) > 0
                                                  AND length(reason) <= 80),

  -- NULLABLE. Null for a loss and for a win that is not yet invoiced. NEVER
  -- defaulted to price_cents: that default reads as a zero discount forever and
  -- destroys `priceSlippageMeanCents` (`calibration.ts:526`).
  realised_price_cents       bigint CHECK (realised_price_cents >= 0),

  -- NULLABLE, same reason. NO CHECK RELATES THIS TO realised_price_cents: a
  -- realised loss (cost > price) is a real, expected state and the number the
  -- founder most needs to see. A CHECK would make it unrepresentable and turn a bad
  -- engagement into a 500.
  realised_vendor_cost_cents bigint CHECK (realised_vendor_cost_cents >= 0),

  -- Stored and NOT aggregated by anything (`calibration.ts:150`). The capture form
  -- says so, rather than implying a dashboard that does not exist.
  cycle_time_days            integer CHECK (cycle_time_days >= 0),

  -- NULLABLE, and NULL IS NOT FALSE: "not delivered" and "failed first pass" are
  -- opposite facts, and collapsing them would report delivery quality on
  -- engagements that were never delivered.
  acceptance_first_pass      boolean,

  -- NULLABLE. Text, not an FK: the delivery bench is not a table (0047 precedent
  -- for `owner`). This is the name `marginRealisation.byPartner` groups by, which is
  -- the action list — so a misspelling splits a partner in two and is visible on
  -- the surface rather than silently merged.
  partner                    text CHECK (partner IS NULL OR length(partner) <= 120),

  -- THE FROZEN SNAPSHOT, and the only jsonb column this file adds. It holds the
  -- six factor scores AS THEY WERE AT QUOTE, produced by a versioned scorer
  -- (`targeting.ts` WEIGHTS_V1) and NEVER recomputed: recomputing would score a
  -- decided engagement against today's weights and then call the agreement
  -- evidence. NULL means the engagement predates scoring, which
  -- `weightReviewPacket` counts as absent evidence rather than as a zero.
  --
  -- IT IS NOT A PLACE FOR A DOCUMENT. It holds numbers keyed by the six literal
  -- factor names in TARGET_FACTOR_KEYS and nothing else, and that is enforced at the
  -- ONLY door into this column: `factorScoreMap` (`routes/gpsLoop.ts`) refuses the
  -- whole request on a key the scorer does not have, or on a value that is not a
  -- finite number. So the most this column can hold is six numbers.
  --
  -- An earlier draft of this comment credited the READ side — "`factorScores()`
  -- drops any key it does not recognise" — and that was not true: `gps/loop.ts:244`
  -- filters VALUES and passes every key through, and `calibration.ts:732` publishes
  -- those keys back out as `observedKeys`. Keys were the open half, which is what the
  -- jsonb review found. Pinned by `gps/__tests__/loopFactorKeyLockout.test.ts`.
  --
  -- The jsonb surface of the GPS schema is FROZEN by `intakeLockout.test.ts` precisely
  -- so that adding this column is a reviewed act — D2 is unanswered and jsonb is the
  -- one shape that ratchet cannot see inside.
  factor_scores_at_quote     jsonb,

  -- A DECISION DATE, not a timestamptz. The weekly business review windows on it,
  -- and a timestamptz would make the Monday boundary depend on the reader's time
  -- zone — the same outcome landing in different weeks for two people.
  decided_at                 date NOT NULL,

  -- The desk roster id from `c.get('operator').id`, NEVER a body field. This is
  -- what makes the row a record rather than a suggestion; a margin figure nobody is
  -- named against is a rumour. Same honest limit as every other attribution in this
  -- compartment: only as strong as the shared DESK_PASSCODE until per-person
  -- credentials exist (GPS_IMPLEMENTATION_PLAN.md §1.5).
  recorded_by                text NOT NULL CHECK (length(btrim(recorded_by)) > 0
                                                  AND length(recorded_by) <= 120),
  recorded_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  -- A REALISED FIGURE ON A LOSS is a contradiction the capture engine already
  -- refuses and then nulls anyway (`packages/shared/src/gps/loop.ts:416` raises the
  -- blocking finding; :505 writes null on a loss regardless). Held here as well,
  -- because the engine is one code path and this table will outlive it: a row that
  -- says we lost and were paid corrupts the win rate and the realised margin at
  -- once. Nothing legitimate writes such a row today, so this CHECK is a floor and
  -- not a behaviour change.
  CONSTRAINT gps_outcome_loss_realises_nothing
    CHECK (
      disposition <> 'lost'
      OR (realised_price_cents IS NULL
          AND realised_vendor_cost_cents IS NULL
          AND acceptance_first_pass IS NULL)
    )
);

-- The WBR week window, and every ORDER BY in `loop.ts`.
CREATE INDEX IF NOT EXISTS gps_outcome_decided_idx
  ON gps_outcome (decided_at DESC);

-- Win/loss counts — the aggregate every rate on the surface is built from.
CREATE INDEX IF NOT EXISTS gps_outcome_disposition_idx
  ON gps_outcome (disposition);

-- `marginRealisation.byPartner` is the action list. Partial, because an outcome
-- with no named partner is never in that answer.
CREATE INDEX IF NOT EXISTS gps_outcome_partner_idx
  ON gps_outcome (partner)
  WHERE partner IS NOT NULL;

-- Realised margin per offer over time: the join in OUTCOME_SELECT is by
-- engagement_id (the primary key), and this is the covering read for the
-- disposition-by-date scan the weekly review does.
CREATE INDEX IF NOT EXISTS gps_outcome_disposition_decided_idx
  ON gps_outcome (disposition, decided_at DESC);


-- ── Row Level Security ────────────────────────────────────────────────────────
--  Declared here, never left to the Supabase "Run and enable RLS" button, for the
--  reason 0047_gps.sql:333 sets out: a posture that lives in a click is a posture
--  nobody can restore from this file.
--
--  THIS IS THE MOST SENSITIVE TABLE IN THE COMPARTMENT. Every row is what a named
--  third party actually paid and what the partner actually charged — LCX's margin
--  per counterparty. Without RLS anyone holding the project's anon key could read
--  it through Supabase's auto-generated REST API. NO POLICIES: RLS with no policy
--  is deny-all, which is the intent, and the API connects as the owner and bypasses
--  it (the same arrangement 0042 proved in production).
ALTER TABLE gps_outcome ENABLE ROW LEVEL SECURITY;


-- ── What `\d+` tells the next person ──────────────────────────────────────────
COMMENT ON TABLE gps_outcome IS
  'GPS outcome: ONE ROW PER ENGAGEMENT recording what actually happened — won or lost, why, what was realised on both sides, and who recorded it. The primary key IS the idempotency key: re-closing an engagement corrects the row instead of double-counting the book. It carries NO client_id on purpose (the client comes from the JOIN to gps_engagement, which cannot drift because engagement_id is the key). Nothing here is derived: margin is computed by packages/shared/src/gps/calibration.ts, never stored. See 0053_gps_outcome.sql.';

COMMENT ON COLUMN gps_outcome.factor_scores_at_quote IS
  'FROZEN snapshot of the six factor scores as they were at quote, keyed by TARGET_FACTOR_KEYS. Never recomputed — recomputing would score a decided engagement against today''s weights and then call the agreement evidence. NULL means the engagement predates scoring, which is counted as absent evidence, not as zero.';

COMMENT ON COLUMN gps_outcome.realised_price_cents IS
  'NULLABLE, and absent must stay absent: marginRealisation counts an incomplete realisation separately (excludedIncompleteRealisation). There is deliberately no DEFAULT — defaulting to the quoted price would read as a zero discount forever.';

COMMENT ON COLUMN gps_outcome.decided_at IS
  'A DECISION DATE, deliberately date and not timestamptz: the weekly review windows on it, and a timestamptz would put the same outcome in different weeks for readers in different zones.';
