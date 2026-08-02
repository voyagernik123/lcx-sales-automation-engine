-- ──────────────────────────────────────────────────────────────────────────────
--  0063 — LCX MARKETING: THE DESK'S MEMORY, AND THE CRISIS ROOM'S RECORD
--
--  Two engines had no caller and therefore no storage:
--  `packages/shared/src/marketing/precedent.ts` (1 596 lines) and `crisis.ts`
--  (2 792 lines). Both are pure and total by design, so neither could ever grow a
--  table of its own — `precedent.ts` holds no handle and no inbound text ON PURPOSE
--  (its §0 argument), and `crisis.ts` needs zero data to be READ. What they need is a
--  place for the desk's own answers and the incident record to LIVE, and this is it.
--
--  ══ 1. `marketing_own_statement` — LCX'S OWN WORDS, AND ONLY THOSE ══
--  The corpus `findPrecedent` searches. Its whole retention argument is an ABSENCE, so
--  the absence is in the schema and not in a comment: there is no `author_handle`, no
--  `author_display`, no `inbound_body`, no `target_permalink` and no `x_comment_id`
--  column on this table, and there must never be one. Third-party content belongs in
--  `marketing_x_reply`, which 0046 puts on the 90-day sweep. That split is the reason
--  this table may be retained for years while that one may not.
--
--  WHY IT IS NOT `marketing_record` (0061). That table is the Art 68(9) evidence file:
--  regime, mandatory elements, embargo and holdings snapshots, close-out state. It
--  holds none of the four axes contradiction debt is computed from — polarity, named
--  timeframe, a keyed quantitative assertion, and the claim's expiry as snapshotted at
--  use. A JOIN could not recover them because they were never recorded. Two tables,
--  one subject: 0061 answers "what did we publish and under which rules", 0063 answers
--  "what did we SAY, and does it disagree with what we said before".
--
--  THE FIVE-YEAR CLOCK IS SET HERE AND SWEPT BY NOTHING YET. `retention_expires_at` is
--  NOT NULL with a CHECK holding it inside five to seven years of `stated_at`, so a row
--  cannot be written without a stated expiry — but NO sweeper deletes on it, in this
--  migration or in any code that reads this table today. The API says so in the payload
--  (`retentionSweepImplemented: false`) rather than letting a column imply a promise.
--  `ASSUMED_OWN_STATEMENT_RETENTION_DAYS` = 2 557 is a POLICY DEFAULT pending the DPO
--  ruling, which is why `precedent.ts:CorpusWindow.retentionPolicyResolved` is the
--  literal `false` and not a column.
--
--  ══ 2. THE CRISIS ROOM'S THREE TABLES ══
--  `marketing_crisis_incident` — when the DESK BECAME AWARE (not when the incident
--  began), which is the only start instant `assessTimeToFirstStatement` may use.
--  `marketing_crisis_statement_instance` — one composed statement, its tri-slot body,
--  and the hash the clearances bind to.
--  `marketing_crisis_clearance` — one row per clear. Parallel by construction: there is
--  no sequence column and no "current step", because CERC gathers reputation, policy
--  and SME simultaneously and a serial chain is what makes a regulated desk too slow to
--  matter. Ordering cannot be reintroduced by a later UPDATE because there is nothing
--  to order.
--
--  ══ 3. WHAT IS DELIBERATELY ABSENT FROM ALL FOUR TABLES ══
--   · NO `published_at`, NO `permalink`, NO `posted` column, and no credential column
--     anywhere. There is no X API key and never will be; a human posts by hand outside
--     this system. `first_statement_at` on the incident is TESTIMONY — a named person
--     asserting they published at a time — and `first_statement_source` records that it
--     is testimony rather than an observation. Nothing in this compartment can publish.
--   · NO clock-suppression columns. `validateClockSuppression` exists and this router
--     does not offer suppression, so a column for it would be a control nobody can
--     exercise. The clock reports `suppression: null` and says so.
--   · NO override or force column on any clearance. `FOUR_EYES_UNACHIEVABLE` is a fact
--     the record states; it is not a flag somebody can clear.
-- ──────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
--  §1 THE PRECEDENT INDEX — the desk's own statements
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_own_statement (
  id                     bigserial PRIMARY KEY,

  -- The stable id `PrecedentStatement.id` carries and every debt item names. Text,
  -- because a debt key printed in a board pack must survive a table reload.
  statement_uid          text NOT NULL UNIQUE,

  -- OUR text, as cleared. Never anyone else's.
  body                   text NOT NULL,
  CONSTRAINT marketing_own_statement_body_nonempty CHECK (length(btrim(body)) > 0),

  -- `StatementKind`. Drives the staleness horizon and nothing else.
  kind                   text NOT NULL,
  CONSTRAINT marketing_own_statement_kind CHECK (kind IN (
    'position', 'fact', 'quantitative', 'commitment', 'refusal_to_comment'
  )),

  -- `QuestionKey` or NULL. NULL means never classified; it is never guessed.
  question_key           text,

  -- `Polarity`. A RECORDED field, not a re-read of the text: a classifier that
  -- re-derives polarity in August from a sentence cleared in March gives a debt
  -- figure that changes when the classifier changes.
  polarity               text NOT NULL DEFAULT 'not_a_yes_no',
  CONSTRAINT marketing_own_statement_polarity CHECK (polarity IN (
    'affirms', 'denies', 'declines_to_say', 'not_a_yes_no'
  )),

  -- A timeframe the statement named, normalised by the desk when recorded. NULL is
  -- the commonest and safest case, and silence is NOT a competing timeframe.
  named_timeframe        text,

  -- `StatementStanding`. Debt is computed over `standing` only: a retraction means
  -- the desk did the thing it was supposed to do.
  standing               text NOT NULL DEFAULT 'standing',
  CONSTRAINT marketing_own_statement_standing CHECK (standing IN (
    'standing', 'superseded', 'retracted', 'never_published'
  )),

  -- Explicit lineage. NULL on both sides of a differing pair is exactly the state
  -- contradiction debt exists to surface, so neither side may be inferred.
  supersedes             text,
  superseded_by          text,
  CONSTRAINT marketing_own_statement_no_self_supersede CHECK (
    (supersedes IS NULL OR supersedes <> statement_uid)
    AND (superseded_by IS NULL OR superseded_by <> statement_uid)
  ),

  -- When the desk said it in public, or cleared it if it never went out.
  stated_at              timestamptz NOT NULL,
  cleared_by             text NOT NULL,
  cleared_at             timestamptz NOT NULL,
  CONSTRAINT marketing_own_statement_cleared_by_named CHECK (length(btrim(cleared_by)) > 0),

  -- Set when a scheduled re-read is owed. NULL means no review was ever scheduled,
  -- which `stalenessOf` reports as an axis NOT CHECKED rather than as `current`.
  review_due_at          timestamptz,

  -- The preclearance entry it derived from, if any. Feeds M8's derivation rate.
  derived_from_approved_language_id text,

  -- Binds the record to the exact text, so an edit cannot inherit a clearance.
  -- Computed server-side from `body`; never accepted from a client.
  content_hash           text NOT NULL,
  CONSTRAINT marketing_own_statement_hash_shape CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  -- `PrecedentSubject[]`, `ClaimReference[]`, `QuantitativeAssertion[]`. JSONB because
  -- each is a list per statement and the join is on a DERIVED key (`subjectKey`), which
  -- the engine owns. A subject table would put a second implementation of `subjectKey`
  -- in SQL, and a second implementation of a key is how two statements about ETH fail
  -- to meet.
  subjects               jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantitative           jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT marketing_own_statement_subjects_array CHECK (jsonb_typeof(subjects) = 'array'),
  CONSTRAINT marketing_own_statement_claims_array CHECK (jsonb_typeof(claims) = 'array'),
  CONSTRAINT marketing_own_statement_quantitative_array CHECK (jsonb_typeof(quantitative) = 'array'),

  -- The five-year clock, stated per row. See the header: it is SET here and swept by
  -- nothing, and the API reports that rather than implying a sweeper exists.
  retention_expires_at   timestamptz NOT NULL,
  retention_basis        text NOT NULL DEFAULT 'assumed_mica_art_8_2_pending_dpo_ruling',
  -- The bound is five years to seven years AND A DAY, and the odd extra day is not
  -- sloppiness: the API writes `stated_at + make_interval(days => 2557)`
  -- (`ASSUMED_OWN_STATEMENT_RETENTION_DAYS`, seven years including two leap days), and a
  -- seven-calendar-year span that contains only one leap day is 2 556 days. Without the
  -- extra day the row written by the engine's own constant would fail its own CHECK for
  -- some start dates and pass for others, which is the worst kind of constraint.
  CONSTRAINT marketing_own_statement_retention_window CHECK (
    retention_expires_at >= stated_at + interval '5 years'
    AND retention_expires_at <= stated_at + interval '7 years 1 day'
  ),

  recorded_by            text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE marketing_own_statement IS
  'LCX''s own cleared statements — the corpus findPrecedent searches. Holds no handle, no inbound reply text and no third-party name, which is the reason it may be retained past the 90-day sweep that removes marketing_x_reply. Adding any third-party identifier column to this table destroys that argument.';

-- The retrieval order `findPrecedent` breaks ties on, and the window `corpusWindow`
-- computes: both read `stated_at` descending over the standing set.
CREATE INDEX IF NOT EXISTS marketing_own_statement_stated_idx
  ON marketing_own_statement (stated_at DESC);

CREATE INDEX IF NOT EXISTS marketing_own_statement_standing_idx
  ON marketing_own_statement (standing, stated_at DESC);

CREATE INDEX IF NOT EXISTS marketing_own_statement_question_idx
  ON marketing_own_statement (question_key)
  WHERE question_key IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
--  §2 THE CRISIS ROOM
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_crisis_incident (
  id                     bigserial PRIMARY KEY,
  incident_uid           text NOT NULL UNIQUE,

  -- `IncidentType` / `ImpactSeverity` / `IncidentPhase`, checked here so a row cannot
  -- carry a value `ttfsBudget` would index with `undefined` and return NaN minutes for.
  incident_type          text NOT NULL,
  CONSTRAINT marketing_crisis_incident_type CHECK (incident_type IN (
    'outage', 'security_incident', 'hack_rumour', 'depeg',
    'delisting', 'regulatory_action', 'peer_contagion', 'impersonation'
  )),
  severity               text NOT NULL,
  CONSTRAINT marketing_crisis_incident_severity CHECK (severity IN ('none', 'low', 'medium', 'high')),
  phase                  text NOT NULL DEFAULT 'initial',
  CONSTRAINT marketing_crisis_incident_phase CHECK (phase IN (
    'preparation', 'initial', 'maintenance', 'recovery'
  )),

  -- WHEN THE DESK BECAME AWARE. Not when the incident began, and not `created_at`:
  -- the two differ by however long it took somebody to open the record, and using the
  -- insert time would flatter the desk by exactly that amount.
  opened_at              timestamptz NOT NULL,
  opened_by              text NOT NULL,
  CONSTRAINT marketing_crisis_incident_opened_by_named CHECK (length(btrim(opened_by)) > 0),

  -- TESTIMONY, not observation. A named human asserts they published, by hand,
  -- outside this system. There is no publish path here and there must never be one.
  first_statement_at     timestamptz,
  first_statement_by     text,
  first_statement_source text,
  CONSTRAINT marketing_crisis_incident_first_statement_testimony CHECK (
    first_statement_at IS NULL
    OR (first_statement_by IS NOT NULL AND first_statement_source = 'operator_testimony')
  ),

  -- Stated by a human. Nothing infers "this is legally sensitive" from text.
  legal_implications     boolean NOT NULL DEFAULT false,
  -- Counsel actually engaged, NAMED — never a boolean. Art 94 classification.
  counsel_named          text,

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_crisis_incident_open_idx
  ON marketing_crisis_incident (opened_at DESC);

CREATE TABLE IF NOT EXISTS marketing_crisis_statement_instance (
  id                     bigserial PRIMARY KEY,
  instance_uid           text NOT NULL UNIQUE,
  incident_uid           text NOT NULL
    REFERENCES marketing_crisis_incident (incident_uid) ON DELETE RESTRICT,

  -- Monotonic within the incident. Gives the "one story straight" audit its spine,
  -- and UNIQUE so two concurrent composers cannot both be statement 3.
  seq                    integer NOT NULL,
  CONSTRAINT marketing_crisis_instance_seq_positive CHECK (seq >= 1),

  -- `HoldingStatementId` and its version, or NULL/NULL for ad hoc. NOT a foreign key:
  -- the library is IN CODE (`crisis.ts:HOLDING_STATEMENTS`) precisely so it is readable
  -- at 03:00 with an empty database, and a FK to a table would undo that.
  statement_id           text,
  statement_version      integer,
  library_version        integer NOT NULL,
  ad_hoc                 boolean NOT NULL,
  CONSTRAINT marketing_crisis_instance_ad_hoc_or_preclear CHECK (
    (ad_hoc = true AND statement_id IS NULL AND statement_version IS NULL)
    OR (ad_hoc = false AND statement_id IS NOT NULL AND statement_version IS NOT NULL)
  ),

  authored_by            text NOT NULL,
  CONSTRAINT marketing_crisis_instance_authored_by_named CHECK (length(btrim(authored_by)) > 0),
  authored_at            timestamptz NOT NULL,
  phase                  text NOT NULL,
  CONSTRAINT marketing_crisis_instance_phase CHECK (phase IN (
    'preparation', 'initial', 'maintenance', 'recovery'
  )),

  -- `StatementBody` — the CERC tri-slot, whole. JSONB rather than three columns
  -- because `known` and `notKnown` are LISTS and `renderStatementText` composes them;
  -- flattening them to text here would put a second renderer in the database.
  body                   jsonb NOT NULL,
  CONSTRAINT marketing_crisis_instance_body_object CHECK (jsonb_typeof(body) = 'object'),

  -- Clearances bind to THESE BYTES. Change the text and every clearance recorded
  -- against the old hash is void — `assessClearance` returns `void_content_changed`.
  content_hash           text NOT NULL,
  CONSTRAINT marketing_crisis_instance_hash_shape CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  -- Acknowledged by a human, never auto-satisfied. `HoldingPrecondition[]`.
  preconditions_acknowledged text[] NOT NULL DEFAULT '{}',

  carries_promotional_content boolean NOT NULL DEFAULT false,
  is_inside_information_disclosure boolean NOT NULL DEFAULT false,
  -- Art 88(1): a disclosure and a marketing communication "shall not" be combined.
  -- The resolution is two adjacent artefacts, so one row may not be both.
  CONSTRAINT marketing_crisis_instance_not_both CHECK (
    NOT (carries_promotional_content AND is_inside_information_disclosure)
  ),

  -- `recovery` phase only: the named assertion that residual unknowns are closed.
  residual_unknowns_closed jsonb,

  supersedes             text,

  -- The verdict at composition time, recorded so a later reader can see the statement
  -- was assessed rather than assumed. Recomputed on every read; never trusted as
  -- the answer, which is why the API returns a fresh `StatementCompleteness`.
  complete_at_compose    boolean NOT NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_crisis_instance_seq_unique UNIQUE (incident_uid, seq)
);

CREATE INDEX IF NOT EXISTS marketing_crisis_instance_incident_idx
  ON marketing_crisis_statement_instance (incident_uid, seq);

CREATE TABLE IF NOT EXISTS marketing_crisis_clearance (
  id                     bigserial PRIMARY KEY,
  instance_uid           text NOT NULL
    REFERENCES marketing_crisis_statement_instance (instance_uid) ON DELETE RESTRICT,

  role                   text NOT NULL,
  CONSTRAINT marketing_crisis_clearance_role CHECK (role IN ('reputation', 'policy', 'sme', 'legal')),
  mode                   text NOT NULL,
  CONSTRAINT marketing_crisis_clearance_mode CHECK (mode IN ('blocking', 'advisory')),

  -- WHO cleared comes from the session, never from a request field.
  reviewer               text NOT NULL,
  CONSTRAINT marketing_crisis_clearance_reviewer_named CHECK (length(btrim(reviewer)) > 0),
  cleared_at             timestamptz NOT NULL,

  -- CERC's reviewer question, recorded as an assertion rather than a click. A `false`
  -- is a REFUSAL to clear, not a pending clearance, and it is kept as a row.
  headline_test          boolean NOT NULL,

  -- The bytes this clear was given against. Compared, never assumed equal.
  content_hash           text NOT NULL,
  CONSTRAINT marketing_crisis_clearance_hash_shape CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  comment                text,

  created_at             timestamptz NOT NULL DEFAULT now(),

  -- One clear per reviewer per lane per set of bytes. A reviewer who changes their
  -- mind about the same text amends the same row; a reviewer clearing NEW text
  -- creates a new row, which is what makes `void_content_changed` visible.
  CONSTRAINT marketing_crisis_clearance_unique UNIQUE (instance_uid, role, reviewer, content_hash)
);

CREATE INDEX IF NOT EXISTS marketing_crisis_clearance_instance_idx
  ON marketing_crisis_clearance (instance_uid);

COMMENT ON TABLE marketing_crisis_clearance IS
  'One row per clear, gathered in parallel. There is no sequence column and no current-step column: CERC gathers reputation, policy and SME simultaneously, and a serial chain is what makes a regulated desk structurally too slow to matter in a crisis.';

-- ── 5. ROW LEVEL SECURITY ────────────────────────────────────────────────────
--  FOUR TABLES, FOUR LINES, AND THIS FILE SHIPPED WITHOUT THEM. 0062 records the same
--  omission and why it matters: Supabase exposes every `public` table through its
--  auto-generated REST API, so an anon key reads whatever RLS does not stop.
--
--  WHAT WAS REACHABLE HERE, and it is worse than the gate ledger's. `marketing_own_statement`
--  is every position the desk has ever taken, including rows whose standing is
--  `never_published` — text LCX decided NOT to say. `marketing_crisis_incident` is the
--  existence, type, severity and awareness time of an incident the desk has not announced,
--  which is inside information under MiCA Art 87 by construction: knowing that LCX opened
--  a `custody_incident` at 02:14 is price-sensitive before any statement exists.
--  `marketing_crisis_statement_instance` holds the unpublished draft of that statement, and
--  `marketing_crisis_clearance` holds named colleagues' reviews of it.
--
--  RLS ENABLED WITH NO POLICY IS DENY-ALL. The API connects as the owner and bypasses RLS,
--  so nothing legitimate changes; nothing holding an anon key can read a row.
--  `marketing/__tests__/gateDecisionMigration.test.ts` scans every marketing migration for
--  this generically — it is what caught this file.
ALTER TABLE marketing_own_statement                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_crisis_incident               ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_crisis_statement_instance     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_crisis_clearance              ENABLE ROW LEVEL SECURITY;
