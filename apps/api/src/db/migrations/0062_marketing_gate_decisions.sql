-- ──────────────────────────────────────────────────────────────────────────────
--  0062 — LCX MARKETING: THE GATE LEDGER, CORROBORATIONS, AND ONE RENAME
--
--  Three things the wiring pass needed and the three build waves could not add,
--  because none of them owned both an engine and a write path.
--
--  ══ 1. WHY A GATE DECISION IS RECORDED AT ALL ══
--  Doctrine rule 5: nothing leaves without a record. `claimSafety` and `abuse` were
--  148KB of engine that NOTHING CALLED on a write path — so there was no verdict to
--  record, and no table to record it in. Now `marketing/outboundGate.ts` is consulted
--  on both paths that produce or approve outbound text, and a verdict nobody can
--  re-read afterwards is not a control: it is a runtime opinion that vanished.
--
--  BOTH OUTCOMES ARE RECORDED, not only refusals. "The gate cleared this" is the
--  claim a desk will need to defend under Art 8(2) produce-on-demand, and a ledger
--  holding only refusals cannot distinguish "cleared" from "never checked" — which is
--  precisely the conflation the whole compartment is built to prevent.
--
--  ══ 2. CORROBORATIONS HAD NOWHERE TO LIVE ══
--  0059 added the sender-authentication columns (`sender_auth_state`,
--  `sender_dkim_domain`, `sender_auth_evidence`) and the `quarantined` /
--  `quarantine_code` lane, so DKIM/ARC evidence and quarantine state ARE persisted.
--  What was still missing is the corroboration list: `provenanceLadder.ts` decides an
--  item's rung by WHICH independent channels agreed with it, and that is a list per
--  row, not a column. Without it the ladder could compute a grade and then forget the
--  reasoning, leaving `source_grade` as a number with no evidence behind it.
--
--  ONE ROW PER CHANNEL OBSERVATION, agreements and DISAGREEMENTS alike. A disagreement
--  is the interesting case and must not be averaged away: if the email says handle X
--  and oEmbed says handle Y for the same post id, that belongs in quarantine, and the
--  row explaining why has to survive.
--
--  ══ 3. THE RENAME, AND WHY IT IS SAFE TO DO IN PLACE ══
--  `source_kind` held `manual_paste`, while `packages/shared/src/marketing/types.ts`
--  calls the same channel `operator_paste` and `provenanceLadder.ts` called it
--  `human_paste`. Three spellings of one concept, and `SOURCE_GRADE` was
--  `Record<string, string>` read with `?? 'C3'` — so the moment the ladder handed its
--  channel to the store, a colleague's paste would be recorded at the grade of an
--  anonymous mailbox with `sender_auth_state: 'unverified'`. No type error, because
--  every key was a string.
--
--  The code now shares ONE union. This UPDATE moves the rows that were written under
--  the old spelling. There is no CHECK constraint on `source_kind` (0046 and 0059 add
--  none), so this is a value migration and not a constraint change; it is idempotent,
--  and it touches only rows carrying the retired spelling.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. The outbound gate ledger ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_outbound_gate_decision (
  id                bigserial PRIMARY KEY,

  -- The reply this draft answers, when there is one. Nullable because a desk-authored
  -- original post has no inbound row, and refusing to record THAT verdict would leave
  -- the least-supervised path as the only unrecorded one.
  --
  -- NO FOREIGN KEY, AND AFTER 90 DAYS THIS POINTS AT NOTHING. That is the retention split
  -- doing what 0061 designed rather than a defect, and it is written down here so nobody
  -- "fixes" it: the 90-day sweep destroys `marketing_x_reply` (third-party personal data,
  -- minimised), while a gate verdict is LCX's own control record and is exactly what Art
  -- 8(2) produce-on-demand asks for. An `ON DELETE CASCADE` here would delete the evidence
  -- that the desk checked, on a schedule set by somebody else's privacy clock; an
  -- `ON DELETE RESTRICT` would block the sweep and turn a data-minimisation duty into a
  -- broken cron. So the reference is deliberately weak, and a reader of an old row must
  -- treat a missing reply as "swept", never as "no such reply".
  --
  -- What DOES cascade is `marketing_reply_corroboration` below, and that is the opposite
  -- judgement for the opposite reason: a corroboration is a statement ABOUT a stranger's
  -- post, so it has no life of its own once the post is gone.
  reply_id          bigint,

  -- 'draft' (text was produced) or 'clearance' (text was approved for a human to
  -- paste). The same text is gated twice on purpose: the STATE moves under words that
  -- have not changed, so a draft cleared at 09:00 naming an asset that entered
  -- mnpi_pending at 10:00 must not approve at 11:00.
  phase             text NOT NULL CHECK (phase IN ('draft', 'clearance')),

  -- The authenticated principal. Never a body field: a verdict the client could
  -- attribute to somebody else is not a record.
  actor             text NOT NULL CHECK (length(btrim(actor)) > 0),

  allowed           boolean NOT NULL,
  disposition       text NOT NULL CHECK (disposition IN ('clear','stripped','flagged','refused')),

  -- Hash, NOT the text. The gated bytes must be identifiable so a later approval can be
  -- tied to the same draft, but this table is a control ledger and does not need a
  -- second copy of every draft the desk ever wrote — and on the refusal path the text
  -- is exactly what should not be spread further.
  text_sha256       text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),

  -- What the lexical extractor believed the text named. Recorded because a clear
  -- verdict means "clear for these symbols" and never "clear": a reviewer has to be
  -- able to see that the gate was looking at SOL and not at the Solana listing named
  -- in prose. An empty array is a real answer and is not the same as NULL.
  assets_extracted  text[] NOT NULL DEFAULT '{}',

  -- The refusal codes, so `loop.ts refusalCodeFrequency` can report which gates have
  -- never fired against real traffic rather than only against tests.
  refusal_codes     text[] NOT NULL DEFAULT '{}',

  -- The dotted rule ids of the ERROR-severity violations that blocked, e.g.
  -- 'deal_closing.invitation_to_transact'. A separate column from `refusal_codes`
  -- because they are a different vocabulary — a `RefusalCode` from the shared union
  -- against a `MarketingViolation.rule` string — and merging them would corrupt the
  -- refusal-frequency read with ids that are not codes. Recorded because these were
  -- computed and discarded: `allowed=false, refusal_codes={}` with nothing else would
  -- be a blocked draft whose reason is nowhere.
  violation_codes   text[] NOT NULL DEFAULT '{}',

  -- Set when a gate THREW. Distinct from a refusal on the merits: 'the check failed'
  -- and 'the text failed' are different facts and the desk must not read the first as
  -- the second. Both produce allowed=false.
  gate_error        text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- The read the desk needs: what happened to this reply, newest first.
CREATE INDEX IF NOT EXISTS marketing_gate_decision_reply_idx
  ON marketing_outbound_gate_decision (reply_id, created_at DESC);

-- The refusal-frequency read across a window.
CREATE INDEX IF NOT EXISTS marketing_gate_decision_created_idx
  ON marketing_outbound_gate_decision (created_at DESC);

COMMENT ON TABLE marketing_outbound_gate_decision IS
  'Every outbound-gate verdict, cleared and refused alike. Written by '
  'marketing/outboundGate.ts on both paths that produce or approve outbound text. '
  'Holds a hash of the gated bytes rather than the bytes.';

COMMENT ON COLUMN marketing_outbound_gate_decision.assets_extracted IS
  'Symbols found by the LEXICAL extractor. A clear verdict covers only these; an asset '
  'named in prose, in lower case, or by project name is not detected.';

-- ── 2. Corroborations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_reply_corroboration (
  id             bigserial PRIMARY KEY,

  reply_id       bigint NOT NULL
                   REFERENCES marketing_x_reply (id) ON DELETE CASCADE,

  -- The independent channel that was consulted. Mirrors `IngestChannel` plus the
  -- corroboration-only channels: oEmbed is X's own official documented endpoint and is
  -- the one channel a forger of SMTP cannot also control, which is what makes it
  -- corroboration rather than a second read of the same claim.
  channel        text NOT NULL CHECK (channel IN (
                   'oembed', 'syndication_embed', 'mirror_discovery',
                   'x_notification_email', 'operator_paste'
                 )),

  -- Which field this channel spoke to.
  field          text NOT NULL CHECK (field IN (
                   'author_handle', 'author_display', 'post_text',
                   'posted_at', 'post_id', 'language'
                 )),

  -- agrees / disagrees / could_not_check. THREE outcomes, because "we asked and the
  -- channel was unreachable" is not disagreement — deleted, protected, rate-limited
  -- and unreachable are four different things and only the first two are facts about
  -- the post. Collapsing them would let a channel outage silently lower a queue's
  -- grade with nobody told.
  outcome        text NOT NULL CHECK (outcome IN ('agrees', 'disagrees', 'could_not_check')),

  -- The channel's value, kept ONLY where it disagreed. On agreement it is by
  -- definition already in the row, and storing a second copy of a stranger's post text
  -- for every corroborated reply would re-create the data-minimisation problem
  -- `raw_email` had.
  observed_value text,

  -- Free-text reason, e.g. 'oembed_unavailable: HTTP 429'. Diagnostic, not a grade.
  detail         text,

  -- True for channels whose standing is a judgement call rather than documented —
  -- cdn.syndication.twimg.com is X's own embed backend but undocumented. Recorded per
  -- row so the desk can see how much of a grade rests on it.
  undocumented   boolean NOT NULL DEFAULT false,

  observed_at    timestamptz NOT NULL DEFAULT now()
);

-- One verdict per channel per field per row: a retried corroboration updates rather
-- than accumulating, so a flapping channel cannot inflate the evidence count.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_reply_corroboration_unique_idx
  ON marketing_reply_corroboration (reply_id, channel, field);

CREATE INDEX IF NOT EXISTS marketing_reply_corroboration_reply_idx
  ON marketing_reply_corroboration (reply_id);

COMMENT ON TABLE marketing_reply_corroboration IS
  'One row per independent channel observation behind a reply''s Admiralty grade. '
  'Disagreements are recorded, not averaged away: a handle mismatch between the email '
  'and oEmbed belongs in quarantine and the reason must survive.';

-- ── 3. ROW LEVEL SECURITY ────────────────────────────────────────────────────
--  THIS FILE SHIPPED WITHOUT THESE TWO LINES, and that was the whole defect: 0046,
--  0060 and 0061 each end with `ENABLE ROW LEVEL SECURITY` on every table they
--  create, this one ended with none, and nothing generic scanned the directory —
--  0060 and 0061 were each covered by their OWN per-migration assertion, and the only
--  ratchet that iterates files is GPS-scoped to 0052-0056.
--
--  What was reachable: Supabase exposes `public` tables through its auto-generated
--  REST API, so an anon key could read the complete refusal-code history of the desk,
--  `assets_extracted` — which symbols marketing was drafting about BEFORE any
--  announcement, i.e. the Art 90 inside information itself — and `observed_value` on
--  every corroboration that disagreed.
--
--  RLS enabled with NO policy is deny-all. The API connects as the owner and bypasses
--  RLS, so nothing legitimate changes; nothing holding an anon key can read a row.
--  `marketing/__tests__/gateDecisionMigration.test.ts` now scans EVERY marketing
--  migration for this, generically, so the next file cannot forget it either.
ALTER TABLE marketing_outbound_gate_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_reply_corroboration    ENABLE ROW LEVEL SECURITY;


-- ── 4. One concept, one spelling ─────────────────────────────────────────────
-- Idempotent and scoped to the retired value. See the header for why the three
-- spellings were a defect and not a preference.
UPDATE marketing_x_reply
   SET source_kind = 'operator_paste'
 WHERE source_kind = 'manual_paste';

COMMIT;
