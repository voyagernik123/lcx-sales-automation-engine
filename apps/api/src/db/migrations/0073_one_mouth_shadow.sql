-- ──────────────────────────────────────────────────────────────────────────────
--  0073 — ONE MOUTH, SHADOW MODE: the observation ledger for the Title VI engine
--         run over everything that leaves the building.
--
--  ══ WHAT WAS TRUE BEFORE THIS FILE ══
--  `marketing/outboundGate.ts gateOutboundText` composes the two engines that carry
--  the MiCA Title VI limbs — Art 90 (embargo), Art 91(3)(c) (the author's own
--  position), Art 88(1) (disclosure mixed with marketing). It is consulted on
--  exactly two paths, both of them MARKETING DRAFTS: `POST /v1/marketing/:id/draft`
--  and `POST /v1/marketing/draft/:id/approve`.
--
--  Sales email (`messages`, `outreach_tasks`) and campaign copy (`dist_campaigns`)
--  leave the building without ever meeting it. Same company, same regulator, same
--  personal liability of roughly EUR 700,000 under Art 91(3)(c) — and a different
--  number of gates, which is nought.
--
--  ══ WHY THIS TABLE IS SHADOW-ONLY, AND WHY THAT IS NOT TIMIDITY ══
--  Switching enforcement on over traffic whose base rate nobody has measured is how
--  a desk gets an outage at 02:00, turns the control off, and never turns it back on.
--  That failure is already recorded in this repository (`marketingMemory.test.ts`):
--  when a gate refuses everything, humans stop using the gate and the real risk goes
--  UP. So this ledger exists to PRODUCE THE NUMBER that justifies enforcement, and
--  the two CHECK constraints below make it structurally incapable of recording that
--  anything was stopped:
--
--      mode    text    CHECK (mode = 'shadow')
--      blocked boolean CHECK (blocked = false)
--
--  A row here therefore cannot be read as evidence that a send was prevented. If and
--  when enforcement lands it needs its own migration and its own column — not a
--  relaxed constraint on this one, because relaxing it would retroactively change
--  what every row already written means.
--
--  ══ WHAT IS RECORDED, AND WHAT DELIBERATELY IS NOT ══
--  A hash of the gated bytes and a LOCATOR — table, row id, and which columns were
--  concatenated — never the text. Same judgement as 0062: a control ledger does not
--  need a second copy of every sales email, and on the would-refuse path the text is
--  precisely what should not be copied further. The locator is what makes a finding
--  actionable: it is enough to go and read the original.
--
--  `text_sha256` IS THE SAME DIGEST 0062 STORES (`gateTextSha256`, sha256 of the
--  UTF-8 bytes), so a shadow observation and a real gate verdict over the same bytes
--  join on that column, and the `gate:<16 hex>` reference an operator already quotes
--  resolves against both.
--
--  ══ NO UNIQUENESS. REPEATED OBSERVATION IS THE MEASUREMENT ══
--  The same template email observed on forty sends is forty rows, and that is the
--  point: the shadow count is a base rate over a window, not a catalogue of distinct
--  texts. `COUNT(DISTINCT text_sha256)` is published beside the row count so a reader
--  can see how much of the number is one template repeating.
--
--  ══ THE COLUMN THAT KEEPS TWO REFUSALS APART ══
--  `perimeter_attributable` marks an observation whose would-be refusal is caused by
--  the REGISTER rather than by the words: EMBARGO_REGISTER_ABSENT,
--  HOLDINGS_DECLARATION_MISSING, ASSET_STATE_UNKNOWN. Every one of those fires today
--  on every text naming any symbol, because `marketing_asset_embargo` is
--  `not_attested` by design until the desk attests it. Without this column the shadow
--  count would read ~100% and mean nothing, and "the words are unlawful" would be
--  indistinguishable from "we have not attested our own register". They are different
--  findings with different owners.
--
--  ══ AND THE THIRD CAUSE, WHICH IS `gate_error` AND NOT A CODE ══
--  A would-be refusal has THREE possible causes, not two: the register is unattested,
--  the words are unlawful, or THE CHECK NEVER RAN. The third cannot be read off
--  `refusal_codes`, because `outboundGate.ts gateFailure` labels its own crash
--  `ASSET_STATE_UNKNOWN` — a code in the list above. So a reader (and
--  `marketing/oneMouth.ts`) must attribute using BOTH columns:
--
--      gate_error IS NOT NULL              the check did not complete. Nothing is known
--                                          about the text or about the register.
--      perimeter_attributable AND no error  the register is unattested.
--      neither                              the words.
--
--  `perimeter_attributable` is therefore written FALSE on every observation carrying a
--  `gate_error`, whatever code the failure stamped. The first version of the writer did
--  the opposite, and a window of connection resets was reported as an unattested
--  register — a claim about a register nothing had read.
--
--  Zero DROP / DELETE / TRUNCATE. One table, four indexes, RLS on (deny-all with no
--  policy; the API connects as the owner and bypasses it), matching 0046/0060/0062.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS marketing_one_mouth_shadow (
  id                     bigserial PRIMARY KEY,

  -- SHADOW, PINNED BY CONSTRAINT. See the header: a row in this table may never be
  -- read as "a send was stopped", and a CHECK is the only form of that promise which
  -- survives the next person to touch the writing code.
  mode                   text NOT NULL DEFAULT 'shadow' CHECK (mode = 'shadow'),
  blocked                boolean NOT NULL DEFAULT false CHECK (blocked = false),

  -- Which mouth. Three, and the union is closed here so a fourth surface cannot be
  -- folded into the count without a migration that says so.
  surface                text NOT NULL CHECK (surface IN (
                           'sales_email', 'assisted_touch', 'dist_campaign'
                         )),

  -- ENOUGH TO FIND THE TEXT AGAIN. A finding a human cannot go and read is a number,
  -- not evidence. `locator_columns` records WHICH bytes were gated ('subject+body'),
  -- because a hash over a different composition is a hash of something else.
  --
  -- IT MAY NAME SOMETHING THAT IS NOT A COLUMN, and it must say so when it does. The
  -- campaign composition includes three CONSTANT task labels and a fallback description
  -- the export substitutes for a NULL `detail` — neither is stored anywhere on
  -- `dist_campaigns`. A locator reading `name+detail+task_labels` sent an operator to a
  -- row holding two of the three parts, with no way to recompute the digest, which is
  -- the one thing this field exists for. See SOURCE_COLUMNS in marketing/oneMouth.ts.
  locator_table          text NOT NULL CHECK (length(btrim(locator_table)) > 0),
  locator_row_id         text NOT NULL CHECK (length(btrim(locator_row_id)) > 0),
  locator_columns        text NOT NULL CHECK (length(btrim(locator_columns)) > 0),

  -- The principal the Art 91(3)(c) limb was resolved against.
  actor                  text NOT NULL CHECK (length(btrim(actor)) > 0),

  -- FALSE when the source row records no sender, so `actor` is a stated placeholder
  -- rather than a person. Those observations still refuse — a text whose author is
  -- unknown cannot have its holdings limb cleared — but they are not evidence about a
  -- named colleague, and a count that mixed the two would be unusable for either
  -- purpose.
  actor_attributed       boolean NOT NULL,

  text_sha256            text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  text_chars             integer NOT NULL CHECK (text_chars >= 0),

  -- WOULD have blocked, had this been enforcement. Nothing was blocked.
  would_block            boolean NOT NULL,
  disposition            text NOT NULL CHECK (disposition IN (
                           'clear', 'stripped', 'flagged', 'refused'
                         )),

  -- The UNSCOPED refusal codes, as 0062's `refusal_codes` column holds them: the Art 90
  -- limb is named here even where a drafter's own copy of the refusal deliberately did
  -- not name it. Scoping an explanation must not scope the evidence.
  refusal_codes          text[] NOT NULL DEFAULT '{}',

  -- The provisions those refusals cite, e.g. 'MiCA Art 91(3)(c)'. A separate column
  -- from `refusal_codes` and NOT positionally paired with it: the scoped Art 90 limb
  -- collapses several codes into one sentence, so the two lists can legitimately differ
  -- in length. Recorded because a count without the rule it applies is a statistic
  -- nobody can act on.
  rules_cited            text[] NOT NULL DEFAULT '{}',

  -- Dotted `MarketingViolation.rule` ids of the ERROR-severity findings that would have
  -- blocked, e.g. 'title_vi.directional_with_no_named_asset'. A different vocabulary
  -- from `refusal_codes`; merging them would corrupt any refusal-frequency read.
  violation_codes        text[] NOT NULL DEFAULT '{}',

  -- What the LEXICAL extractor believed the text named, extracted server-side from the
  -- text itself. An empty array is a real answer and is not NULL.
  assets_extracted       text[] NOT NULL DEFAULT '{}',

  -- See the header. Keeps "our register is unattested" out of "our copy is unlawful".
  perimeter_attributable boolean NOT NULL,

  -- Set when a gate THREW. 'the check failed' and 'the text failed' are different
  -- facts; in shadow mode neither one stops anything, and conflating them would make
  -- the base rate unreadable.
  gate_error             text,

  observed_at            timestamptz NOT NULL DEFAULT now()
);

-- The base-rate read over a window.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_observed_idx
  ON marketing_one_mouth_shadow (observed_at DESC);

-- The per-mouth split — which surface is producing the findings.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_surface_idx
  ON marketing_one_mouth_shadow (surface, observed_at DESC);

-- "What has this row ever been observed to say", for the locator an operator holds.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_locator_idx
  ON marketing_one_mouth_shadow (locator_table, locator_row_id, observed_at DESC);

-- The join to 0062: the same bytes gated for real on another path.
CREATE INDEX IF NOT EXISTS marketing_one_mouth_sha_idx
  ON marketing_one_mouth_shadow (text_sha256);

COMMENT ON TABLE marketing_one_mouth_shadow IS
  'SHADOW MODE. Title VI gate verdicts computed over outbound sales email and campaign '
  'copy, recorded and counted, blocking nothing. Written by marketing/oneMouth.ts. '
  'Holds a hash and a locator, never the text. mode and blocked are CHECK-pinned so a '
  'row here can never be read as evidence that a send was prevented.';

COMMENT ON COLUMN marketing_one_mouth_shadow.would_block IS
  'What enforcement WOULD have done. Nothing was blocked — see the blocked column, '
  'which is CHECK-pinned to false.';

COMMENT ON COLUMN marketing_one_mouth_shadow.perimeter_attributable IS
  'True when the would-be refusal is caused by the register being unattested '
  '(EMBARGO_REGISTER_ABSENT / HOLDINGS_DECLARATION_MISSING / ASSET_STATE_UNKNOWN) '
  'rather than by the words. FALSE on every row with a gate_error, whatever code the '
  'failure carried: ASSET_STATE_UNKNOWN is also what gateFailure stamps on its own '
  'crash, and "the check never ran" is a third cause with a third owner. Read this '
  'column together with gate_error, never alone. Without this split the base rate '
  'reads ~100% and means nothing.';

COMMENT ON COLUMN marketing_one_mouth_shadow.rules_cited IS
  'The provisions the refusals cite. NOT positionally paired with refusal_codes: the '
  'scoped Art 90 limb collapses several codes into one sentence.';

-- RLS with no policy is deny-all. Supabase exposes public tables through its
-- auto-generated REST API, and `assets_extracted` on this table is a list of symbols
-- the desk is drafting about before any announcement — which is the Art 90 inside
-- information itself. The API connects as the owner and bypasses RLS, so nothing
-- legitimate changes.
ALTER TABLE marketing_one_mouth_shadow ENABLE ROW LEVEL SECURITY;

COMMIT;
