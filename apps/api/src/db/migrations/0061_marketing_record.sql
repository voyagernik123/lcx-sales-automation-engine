-- ──────────────────────────────────────────────────────────────────────────────
--  0061 — LCX MARKETING: THE RECORD (M7)
--
--  MiCA Art 8(2) is PRODUCE-ON-DEMAND. Art 8(3) says competent authorities "shall
--  not require prior approval" of marketing communications — which is exactly why
--  the retrospective production duty is the binding one, and why Art 7(3) matters:
--  the asking authority need NOT be the FMA. Any EEA host Member State whose
--  prospective holders saw the communication may ask. So the unit that has to be
--  reproducible is not "our tweets" but "the statements visible to prospective
--  holders in Member State X during period Y" — which is why `jurisdictions` and a
--  time window are first-class here instead of being inferred at export time.
--
--  Art 68(9) is the retention hook: records must be "sufficient to enable competent
--  authorities ... to ascertain whether [the CASP] complied with ALL obligations
--  including those with respect to ... prospective clients and to the integrity of
--  the market", kept FIVE years and up to SEVEN where the competent authority asks
--  before five have elapsed.
--
--  ══ THE HONEST CAVEAT, CARRIED IN THE SCHEMA AND NOT LAUNDERED ══
--  MiCA contains NO express retention period for a CASP's marketing communications.
--  Five-to-seven is an INFERENCE from Art 68(9) (CASP records) plus Art 88(1) (the
--  only explicit five-year publication duty in the disclosure space). That inference
--  is defensible and anything shorter is not — but it is an inference, so it is
--  recorded per row in `retention_basis` rather than presented as a citation. A row
--  can therefore say which theory it is retained under, and a later legal ruling can
--  be applied to exactly the rows it changes.
--
--  ══ THE CONTRADICTION THIS FILE DOES NOT PRETEND TO HAVE SOLVED ══
--  0046 gives every `marketing_x_reply` row a 90-day `retention_expires_at` and the
--  sweep deletes on it. Five years and ninety days cannot both be right for the same
--  bytes. This migration implements the SPLIT rather than picking a winner:
--
--    · LCX's OWN STATEMENTS  → `marketing_record`, retained 5y (extensible to 7y by
--      a named legal hold). These are the artefacts a regulator asks for.
--    · THIRD-PARTY CONTENT   → stays in `marketing_x_reply` under the 90-day sweep,
--      unchanged. A stranger's handle and message text is not evidence LCX needs for
--      five years; retaining it that long would be the data-minimisation failure the
--      retention duty is used to excuse.
--
--  The consequence is deliberate and is DISCLOSED BY THE BUNDLE, not hidden by it:
--  after 90 days a record's inbound context is gone, so the export states that the
--  parent context could not be reconstructed and why. An export that quietly omits
--  it would be worse than one that says so.
--
--  ⚠ THE OWNER STILL OWES A DPO RULING. May LCX's own published statements be
--  retained past the 90-day sweep, and may a minimised excerpt of the third-party
--  message it answered be retained with them? Until that is answered, this schema's
--  default is: LCX statement retained, third-party excerpt NOT copied into the
--  record (`inbound_context_excerpt` stays NULL and only the hash is kept). The
--  hash lets a later paste-back be proved identical without holding the text.
--
--  ══ GDPR POSTURE, STATED BECAUSE IT IS INCOMPLETE ══
--  The queue holds third parties' handles and message text. Today: lawful basis is
--  Art 6(1)(f) with NO legitimate-interests assessment on file; notice would run
--  under Art 14 with NO privacy notice to reference; there was no erasure or access
--  path; `author_handle` was unindexed so erasure-by-handle was a table scan nobody
--  would run; and the OpenRouter transfer was unrecorded per row. This file builds
--  the paths and the index and the transfer register, and it names the two things
--  that are still missing (the LIA reference and the notice reference) as COLUMNS
--  that start NULL, so their absence is queryable instead of forgotten.
--
--  ⚠ DPIA: per-handle scoring over time (a reputation score, a "difficult account"
--  flag, anything that accumulates a judgement about a named human across posts)
--  crosses into Art 35(3)(a) "evaluation or scoring" and needs a DPIA BEFORE it
--  ships. Nothing here stores such a score, and `record.ts` refuses to compute one
--  until a DPIA reference exists. That refusal is the control; this comment is not.
--
--  IDEMPOTENT. FORWARD-ONLY. No DROP, no DELETE, no TRUNCATE, no ALTER COLUMN TYPE
--  anywhere in this file — it only creates, and only adds columns that default to
--  the honest "not assessed" rather than to a flattering value.
--
--  APPLY BY HAND. Nothing applies this automatically: production migrations are run
--  in the Supabase SQL editor against credentials this repository does not hold. The
--  API degrades honestly until it lands (`isRecordMigrated` in
--  `apps/api/src/marketing/record.ts`) and every record surface refuses with
--  RECORD_REGISTER_ABSENT naming this filename.
-- ──────────────────────────────────────────────────────────────────────────────


-- ══ 1. THE RECORD ═════════════════════════════════════════════════════════════
--  One row per LCX communication that reached clearance. The snapshot discipline is
--  the whole design: `regime`, `mandatory_elements`, `embargo_snapshot`,
--  `holdings_snapshot`, `consideration_kind` and `desk_state` are facts AS AT
--  CLEARANCE, denormalised on purpose. Foreign keys resolved at read time would make
--  an export six months later show TODAY'S answers to YESTERDAY'S questions, which
--  has close to zero evidential value. This is the opposite of normal schema
--  instinct and it is intentional.
--
--  NOTE WHAT IS ABSENT: there is no `posted_by_system`, no `credential`, no
--  `scheduled_at`. This compartment cannot publish. `published_text` can only ever
--  arrive from a human pasting back what they actually posted, which is why
--  `close_out_state` starts at 'outstanding' and why an outstanding count is a
--  visible number rather than a rounding error.
CREATE TABLE IF NOT EXISTS marketing_record (
  id                    bigserial PRIMARY KEY,

  -- Deterministic, content-derived id (see `deriveRecordUid`). UNIQUE makes writing
  -- a record at-least-once harmless, the same way 0046 used `x_comment_id`.
  record_uid            text NOT NULL UNIQUE,

  -- Denormalised links, DELIBERATELY NOT FOREIGN KEYS.
  --
  -- A FK to marketing_x_reply(id) would tie this row's life to a row the 90-day
  -- sweep deletes, and 0046's draft table already cascades from it. Retention must
  -- SURVIVE deletion: taking a bad post down is the right operational move and the
  -- worst possible evidential move if the takedown destroys the record. So the link
  -- is by value, it may dangle, and a dangling link is reported by the bundle's
  -- completeness statement rather than treated as corruption.
  x_comment_id          text,
  draft_id              bigint,

  -- Which body of law governed this artefact, decided at clearance.
  regime                text NOT NULL,
  CONSTRAINT marketing_record_regime_known CHECK (regime IN (
    'casp_conduct', 'offer_promo', 'art_promo', 'emt_promo',
    'market_abuse', 'ucpd_paid_promotion', 'advice'
  )),

  -- FOUR EYES, at the schema level rather than in a code path someone can bypass.
  -- Art 68(4)-(6) wants policies that demonstrably OPERATED; an approval with no
  -- reviewer identity distinct from the drafter demonstrates a procedure existed,
  -- not that it worked.
  drafted_by            text NOT NULL,
  drafted_at            timestamptz NOT NULL,
  cleared_by            text,
  cleared_at            timestamptz,
  clearance_reason      text,
  CONSTRAINT marketing_record_four_eyes CHECK (
    cleared_by IS NULL OR cleared_by <> drafted_by
  ),
  CONSTRAINT marketing_record_clearance_paired CHECK (
    (cleared_by IS NULL) = (cleared_at IS NULL)
  ),

  -- LCX's own words, exact bytes as cleared, plus the hash that binds an approval to
  -- content instead of to a row id.
  statement_text        text NOT NULL,
  statement_hash        text NOT NULL,

  -- What was ACTUALLY published, obtainable only by paste-back. The difference
  -- between this and `statement_text` is the difference between evidence and an
  -- intention, so both are kept and the bundle prints both.
  published_text        text,
  published_hash        text,
  published_at          timestamptz,
  published_permalink   text,
  close_out_by          text,
  close_out_at          timestamptz,
  close_out_state       text NOT NULL DEFAULT 'outstanding',
  CONSTRAINT marketing_record_close_out_known CHECK (close_out_state IN (
    'outstanding',   -- cleared, nobody has said what went out. The honest default.
    'published',     -- pasted back, hashed
    'not_sent',      -- decided against. A decision not to speak is a decision.
    'withdrawn'      -- was published, then taken down. The record stays.
  )),
  withdrawn_at          timestamptz,
  withdrawal_reason     text,

  -- The third-party message this answered. HASH ALWAYS, TEXT ONLY IF THE DPO SAYS
  -- SO. `context_minimised_at` is written when the excerpt is dropped (or when the
  -- 90-day sweep removed the source row), so "we never had it" and "we had it and
  -- minimised it on this date" are distinguishable in an export.
  inbound_context_hash  text,
  inbound_context_excerpt text,
  context_minimised_at  timestamptz,

  -- Snapshots. jsonb because their shape is owned by
  -- `packages/shared/src/marketing/*` and a column per field would fossilise a
  -- vocabulary that is still growing. Written once at clearance.
  mandatory_elements    jsonb NOT NULL DEFAULT '[]'::jsonb,
  embargo_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  holdings_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  desk_state            jsonb NOT NULL DEFAULT '{}'::jsonb,
  consideration_kind    text NOT NULL DEFAULT 'unknown',

  -- Art 86(1) scope and Art 8(2) host-authority filtering. Arrays because "show me
  -- everything we ever said about TOKEN in Member State X" is the literal question.
  named_assets          text[] NOT NULL DEFAULT '{}',
  jurisdictions         text[] NOT NULL DEFAULT '{}',

  -- COMPLETENESS, RECORDED AT WRITE TIME. `snapshot_gaps` names each fact that was
  -- missing when the record was written; the export prints them verbatim. A bundle
  -- that cannot say what it is missing is a bundle that is lying by omission.
  snapshot_complete     boolean NOT NULL DEFAULT false,
  snapshot_gaps         text[] NOT NULL DEFAULT '{}',

  -- ── Retention ──
  retention_class       text NOT NULL,
  CONSTRAINT marketing_record_retention_class_known CHECK (retention_class IN (
    'lcx_statement',        -- ours. Retained long.
    'third_party_content'   -- not ours. Must not live here on the long clock.
  )),
  -- The theory, not a citation. See the header caveat.
  retention_basis       text NOT NULL DEFAULT 'inferred_art_68_9_plus_art_88_1',
  retention_expires_at  timestamptz NOT NULL,

  -- Art 68(9)'s "up to seven years where requested by the competent authority".
  -- A hold is a named human's act with a reason, never a boolean somebody flipped.
  legal_hold            boolean NOT NULL DEFAULT false,
  legal_hold_by         text,
  legal_hold_reason     text,
  legal_hold_until      timestamptz,
  CONSTRAINT marketing_record_legal_hold_accountable CHECK (
    legal_hold = false OR (legal_hold_by IS NOT NULL AND legal_hold_reason IS NOT NULL)
  ),

  -- THE RATCHET. Five years is the floor and seven the ceiling for our own
  -- statements, expressed in the schema so a later code change cannot quietly
  -- shorten it — the failure mode where records expire mid-investigation. No now()
  -- here, so this is immutable and checkable at insert.
  CONSTRAINT marketing_record_retention_window CHECK (
    retention_class <> 'lcx_statement'
    OR (retention_expires_at >= drafted_at + interval '5 years'
        AND retention_expires_at <= drafted_at + interval '7 years')
  ),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- The export read: a time window, newest first. Art 8(2) is a windowed question.
CREATE INDEX IF NOT EXISTS marketing_record_window_idx
  ON marketing_record (drafted_at DESC);

-- "Show me everything we said about TOKEN" (Art 86(1), Art 4(4)).
CREATE INDEX IF NOT EXISTS marketing_record_assets_idx
  ON marketing_record USING gin (named_assets);

-- Host-authority filtering (Art 7(3): the asker need not be the FMA).
CREATE INDEX IF NOT EXISTS marketing_record_jurisdictions_idx
  ON marketing_record USING gin (jurisdictions);

-- The outstanding paste-back count, which is the only honest measure of whether the
-- record is evidence or intention. Partial, because it is only ever read for one value.
CREATE INDEX IF NOT EXISTS marketing_record_outstanding_idx
  ON marketing_record (drafted_at) WHERE close_out_state = 'outstanding';

-- The retention sweep, and the reason a held row must be skipped by it.
CREATE INDEX IF NOT EXISTS marketing_record_retention_idx
  ON marketing_record (retention_expires_at) WHERE legal_hold = false;

-- The erasure/access join. `lower()` because X handles are case-insensitive and an
-- erasure that misses on case is an erasure that did not happen.
CREATE INDEX IF NOT EXISTS marketing_record_comment_idx
  ON marketing_record (x_comment_id);


-- ══ 2. EVERY REFUSAL THAT FIRED ON THE WAY ════════════════════════════════════
--  Doctrine rule 1 is "refuse, don't warn", and a refusal nobody can see afterwards
--  is indistinguishable from a warning. This table is what makes the refusal a
--  feature: the export shows a regulator not only the words that went out but every
--  gate the drafter hit on the way to them — including the ones an approver decided
--  to record and proceed past, with their name on it.
--
--  A refusal row can outlive the draft it fired on, which is why the link is by
--  `record_uid` value and there is no FK. Same reasoning as §1.
CREATE TABLE IF NOT EXISTS marketing_record_refusal (
  id              bigserial PRIMARY KEY,
  record_uid      text NOT NULL,

  -- Stable machine code (e.g. RECORD_REGISTER_EMPTY, HOLDINGS_DECLARATION_MISSING).
  code            text NOT NULL,
  -- The human sentence shown at the time. Stored, not regenerated: regenerating it
  -- at export time would show today's wording for yesterday's refusal.
  sentence        text NOT NULL,
  -- The provision that caused it. NOT NULL: a refusal with no rule behind it is an
  -- opinion, and an opinion is not defensible six months later.
  rule_cited      text NOT NULL,
  -- Where in the flow it fired: draft | clearance | close_out | export.
  phase           text NOT NULL DEFAULT 'draft',
  fired_at        timestamptz NOT NULL DEFAULT now(),

  -- An override is an ACT, not a setting. `prohibited` refusals are never
  -- overridable in code; this exists so that the ones which are, are attributable.
  overridden      boolean NOT NULL DEFAULT false,
  overridden_by   text,
  override_reason text,
  CONSTRAINT marketing_record_refusal_override_accountable CHECK (
    overridden = false OR (overridden_by IS NOT NULL AND override_reason IS NOT NULL)
  ),

  -- Writing the same refusal twice for the same record and phase is a retry, not a
  -- second event. Makes the write idempotent without an upsert that could rewrite
  -- the sentence.
  CONSTRAINT marketing_record_refusal_once UNIQUE (record_uid, code, phase)
);

CREATE INDEX IF NOT EXISTS marketing_record_refusal_record_idx
  ON marketing_record_refusal (record_uid, fired_at);

-- "Refusal codes by frequency" — M8's only honest read on whether the desk is
-- getting safer over time.
CREATE INDEX IF NOT EXISTS marketing_record_refusal_code_idx
  ON marketing_record_refusal (code, fired_at DESC);


-- ══ 3. WHICH PRE-APPROVED CLAIMS IT USED, AND AT WHICH VERSION ════════════════
--  `packages/shared/src/claims/` already versions every claim. The version AT USE is
--  the point: a claim that was true in March is a liability in August, and without
--  the version an export proves only that some sentence with that id existed.
CREATE TABLE IF NOT EXISTS marketing_record_claim (
  id             bigserial PRIMARY KEY,
  record_uid     text NOT NULL,
  claim_id       text NOT NULL,
  claim_version  integer NOT NULL,
  claim_category text,
  -- Was the pre-approved wording used verbatim, or paraphrased? A paraphrase is not
  -- a pre-approved claim, and the difference is the whole value of a claim library.
  verbatim       boolean NOT NULL DEFAULT false,
  -- The exact wording as used, hashed. Cheap, and it lets a later audit prove the
  -- verbatim flag was honest without storing the sentence twice.
  used_text_hash text,
  CONSTRAINT marketing_record_claim_once UNIQUE (record_uid, claim_id, claim_version)
);

CREATE INDEX IF NOT EXISTS marketing_record_claim_record_idx
  ON marketing_record_claim (record_uid);

-- The claim-expiry ledger's read path (M6): every use of a claim, newest first.
CREATE INDEX IF NOT EXISTS marketing_record_claim_claim_idx
  ON marketing_record_claim (claim_id, claim_version);


-- ══ 4. THE TRANSFER REGISTER (GDPR Art 30, Art 44-49) ═════════════════════════
--  A stranger's message text is sent to OpenRouter to draft a reply. That is a
--  disclosure of third-party personal data to a processor, very likely outside the
--  EEA, and until this table it happened with NO PER-ROW RECORD — so the Art 30
--  record of processing activities could not be reconstructed from the system that
--  did the processing, and a data subject exercising Art 15 could not be told who
--  their words were sent to.
--
--  WHAT IS STORED IS A PSEUDONYM, NOT AN ANONYM. `handle_hash` is a SHA-256 of the
--  lowercased handle. Recital 26 is explicit that pseudonymised data is still
--  personal data — a handle is short and public, so this hash is reversible by
--  anyone with a dictionary. It is here for data minimisation and joinability, not
--  as a claim that this table is out of scope. Do not describe it as anonymised.
--
--  `transfer_basis` DEFAULTS TO 'not_assessed' on purpose. That is the true state
--  today, and an honest absent value is a queryable liability; defaulting to 'sccs'
--  would be a compliance assertion no human ever made.
CREATE TABLE IF NOT EXISTS marketing_record_transfer (
  id              bigserial PRIMARY KEY,

  -- Either or both may be null: a transfer can happen at draft time, before any
  -- record exists, and it must still be recorded.
  record_uid      text,
  x_comment_id    text,
  handle_hash     text,

  processor       text NOT NULL,               -- 'openrouter', 'anthropic', ...
  model           text,
  purpose         text NOT NULL,               -- why the data left. Plain words.
  payload_kind    text NOT NULL,               -- inbound_reply_text | draft_text | ...
  payload_hash    text NOT NULL,               -- what left, provably, without keeping it

  contains_third_party_personal_data boolean NOT NULL,
  third_country   boolean NOT NULL,
  transfer_basis  text NOT NULL DEFAULT 'not_assessed',
  CONSTRAINT marketing_record_transfer_basis_known CHECK (transfer_basis IN (
    'not_assessed',        -- the truth today. Named, not hidden.
    'adequacy_art_45',
    'sccs_art_46',
    'derogation_art_49',
    'no_transfer_eea_only'
  )),

  requested_by    text,                        -- the human or job that caused it
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_record_transfer_record_idx
  ON marketing_record_transfer (record_uid);

-- The Art 15 answer: "who did you send my words to". Without this index the access
-- path is a table scan and therefore a path nobody uses.
CREATE INDEX IF NOT EXISTS marketing_record_transfer_handle_idx
  ON marketing_record_transfer (handle_hash);

CREATE INDEX IF NOT EXISTS marketing_record_transfer_when_idx
  ON marketing_record_transfer (occurred_at DESC);


-- ══ 5. ERASURE (Art 17) — RECORDS THAT IT HAPPENED, NEVER WHAT WAS ERASED ═════
--  The trap this table is shaped to avoid: an erasure log that keeps the erased text
--  "for the audit trail" is the copy that defeats the erasure. So there is no `body`
--  column, no handle in the clear, and no room for one.
--
--  It also records the part that is uncomfortable and mandatory: what was NOT erased
--  and under which exemption. Art 17(3)(b) (compliance with a legal obligation —
--  here the inferred Art 68(9) retention) and Art 17(3)(e) (legal claims) are the
--  two that apply. A data subject is entitled to be told that some material was
--  retained and why; silently keeping it is the actual violation.
CREATE TABLE IF NOT EXISTS marketing_erasure_log (
  id                bigserial PRIMARY KEY,
  handle_hash       text NOT NULL,
  requested_at      timestamptz,
  decided_at        timestamptz NOT NULL DEFAULT now(),
  decided_by        text NOT NULL,             -- a named human. Not a job name.
  basis             text NOT NULL,
  CONSTRAINT marketing_erasure_basis_known CHECK (basis IN (
    'art_17_1_a_purpose_fulfilled',
    'art_17_1_b_consent_withdrawn',
    'art_17_1_c_objection',
    'data_subject_request',
    'retention_expiry'
  )),
  replies_erased    integer NOT NULL DEFAULT 0,
  drafts_erased     integer NOT NULL DEFAULT 0,
  records_retained  integer NOT NULL DEFAULT 0,
  retained_basis    text,                      -- art_17_3_b | art_17_3_e | NULL
  notes             text,
  CONSTRAINT marketing_erasure_retention_explained CHECK (
    records_retained = 0 OR retained_basis IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS marketing_erasure_log_handle_idx
  ON marketing_erasure_log (handle_hash, decided_at DESC);


-- ══ 6. SUBJECT ACCESS (Art 15) ════════════════════════════════════════════════
--  Same shape, same discipline: the log records that an access request was answered
--  and how much was disclosed, never the disclosed content.
CREATE TABLE IF NOT EXISTS marketing_subject_access_log (
  id             bigserial PRIMARY KEY,
  handle_hash    text NOT NULL,
  requested_at   timestamptz,
  fulfilled_at   timestamptz NOT NULL DEFAULT now(),
  fulfilled_by   text NOT NULL,
  rows_disclosed integer NOT NULL DEFAULT 0,
  scope          text NOT NULL DEFAULT 'replies+drafts+transfers',
  notes          text
);

CREATE INDEX IF NOT EXISTS marketing_subject_access_log_handle_idx
  ON marketing_subject_access_log (handle_hash, fulfilled_at DESC);


-- ══ 7. THE INDEX THAT MAKES ERASURE POSSIBLE AT ALL ═══════════════════════════
--  0046 indexed status, retention, post id and parse_failed — everything the desk
--  reads, and nothing a data subject needs. Erasure-by-handle was a sequential scan,
--  which in practice means erasure happened by hand in a SQL console with no record
--  that it happened, or did not happen.
--
--  `lower(author_handle)`: X handles are case-insensitive, so an index on the raw
--  column would let `@LCXFan` survive a request from `@lcxfan`. Every lookup in
--  `record.ts` lowercases to match.
CREATE INDEX IF NOT EXISTS marketing_x_reply_author_lower_idx
  ON marketing_x_reply (lower(author_handle));


-- ══ 8. THE GDPR FIELDS 0046 DID NOT HAVE ══════════════════════════════════════
--  ADD COLUMN IF NOT EXISTS only — additive, idempotent, and no existing column's
--  type is touched. Each of these starts NULL or at an honest "not recorded" value
--  so that the gap is a queryable fact rather than a memory.
ALTER TABLE marketing_x_reply
  ADD COLUMN IF NOT EXISTS retention_class text,
  ADD COLUMN IF NOT EXISTS lawful_basis text,
  ADD COLUMN IF NOT EXISTS lawful_basis_assessment_ref text,
  ADD COLUMN IF NOT EXISTS privacy_notice_ref text,
  ADD COLUMN IF NOT EXISTS erasure_requested_at timestamptz;

-- Why these are NOT defaulted to 'art_6_1_f':
--   The lawful basis for holding a stranger's message is Art 6(1)(f) legitimate
--   interests, and Art 6(1)(f) is only available where a legitimate-interests
--   assessment exists. None is on file. Writing 'art_6_1_f' into every row by
--   default would manufacture the appearance of an assessment that was never done —
--   which is the exact pattern this programme keeps finding and correcting. The
--   basis is written per row by `record.ts` only when an assessment reference is
--   supplied, and rows with a NULL basis are the honest backlog.
COMMENT ON COLUMN marketing_x_reply.lawful_basis IS
  'GDPR Art 6 basis, written only alongside lawful_basis_assessment_ref. NULL means no assessment is on file for this row — an honest gap, not an omission to be defaulted away.';
COMMENT ON COLUMN marketing_x_reply.retention_class IS
  'third_party_content for every inbound row. LCX''s own statements live in marketing_record on the long clock; this table stays on the 90-day sweep. See the 0061 header and the outstanding DPO ruling.';


-- ══ 9. ROW LEVEL SECURITY ═════════════════════════════════════════════════════
--  Declared here rather than clicked, for the reason 0046 spells out: Supabase
--  exposes `public` tables through its auto-generated REST API, and these tables
--  hold third-party personal data plus five years of a licensed exchange's
--  regulatory record. RLS enabled with NO policy is deny-all, which is the intent —
--  the API connects as the owner and bypasses RLS, so nothing legitimate is broken
--  and nothing holding an anon key can read a word of this.
ALTER TABLE marketing_record              ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_record_refusal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_record_claim        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_record_transfer     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_erasure_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_subject_access_log  ENABLE ROW LEVEL SECURITY;


-- ══ WHAT THIS FILE DELIBERATELY DOES NOT DO ═══════════════════════════════════
--   · It does not shorten or lengthen 0046's 90-day sweep. That is the DPO's call
--     and it is still open; the split above is the interim answer, not the ruling.
--   · It does not store a per-handle score, a reputation number, a bot-likelihood or
--     any accumulated judgement about a named human. Art 35(3)(a) DPIA first.
--   · It does not delete anything. Erasure is executed by `record.ts` against 0046's
--     tables and RECORDED here; a migration that deleted rows would erase evidence
--     the moment a human pasted it into a SQL editor to "set things up".
--   · It stores no credential, no token and no session. There is still no path by
--     which this compartment can speak as LCX.
