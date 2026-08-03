-- ════════════════════════════════════════════════════════════════════════════
--  0065 — THE SHORT LIMB OF THE HOLDINGS DECLARATION
-- ════════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS CHANGES. `marketing_holdings_declaration.holds` (0060) is a BOOLEAN, so
--  a declaration can say "I hold spot" or "I hold nothing" and nothing else. This file
--  adds ONE column, `short_position`, so the declaration can also say — or explicitly
--  NOT say — whether the member holds a SHORT position.
--
--  WHY IT MATTERS, precisely. MiCA Art 91(3)(c) makes it market manipulation to voice
--  an opinion on a crypto-asset while holding a position in it without simultaneously
--  disclosing that conflict to the public, with fines on a NATURAL PERSON from
--  EUR 700 000 (Art 111(2)(d)). The Article says "an opinion", not "a favourable
--  opinion": a staffer who is short an asset and calls it a dead project is inside the
--  same definition. `packages/shared/src/marketing/abuse.ts` records this as a NAMED
--  GAP at its stance classifier — with a boolean, a short seller's row says
--  `holds = false`, which reads as "no position", and the bearish draft clears.
--
--  ══ THE ONE THING THIS COLUMN MUST NEVER DO ══
--  'not_asked' MUST NEVER BE READ AS "NO SHORT POSITION". They are different facts:
--  one is an answer, the other is the absence of a question. The CHECK below makes
--  'not_asked' a first-class value rather than a NULL, for exactly that reason — a
--  nullable boolean invites `COALESCE(short, false)` in some later query, and that one
--  expression would convert "nobody asked" into "declared flat" and clear a draft that
--  should refuse. There is no NULL to coalesce here. `bearishLimbOf`
--  (packages/shared/src/marketing/contracts/holdings.ts) maps both 'not_asked' and
--  'declined' to `unknown`, and unknown refuses.
--
--  ══ WHAT THIS FILE DOES NOT DECIDE, AND CANNOT ══
--  WHETHER LCX MAY REQUIRE STAFF TO DISCLOSE SHORT POSITIONS IS AN HR AND LEGAL
--  QUESTION. Asking an employee about positions in a personal account outside the firm
--  engages employment law and GDPR — a new purpose, a new lawful basis and a new
--  retention answer, and the DPO item in LCX_MARKETING_100X_PLAN.md §7 is still open.
--  This migration therefore makes the answer STORABLE and makes NOT ASKING the
--  default. The switch that decides whether the question is ever put is one line of
--  application code (`SHORT_QUESTION_POLICY` in apps/api/src/marketing/abuseRegister.ts)
--  and it ships set to 'not_asked'. Nothing in this file asserts a legal position and
--  nothing in it obliges anyone to answer anything.
--
--  ══ NO ROW IS SEEDED, AND THE BACKFILL IS TRUE ══
--  0060 ships both perimeter tables EMPTY on purpose: a holdings position is a fact
--  only the person holding it knows, and a placeholder in this table would read as a
--  position somebody took. This file seeds nothing either. Existing rows — if any
--  exist on an environment — are backfilled to 'not_asked' by the column DEFAULT, and
--  that value is TRUE of them: they were written before the question existed, so
--  nobody was asked. This is a backfill that states a fact, not one that guesses.
--
--  ══ FORWARD-ONLY, ADDITIVE, IDEMPOTENT ══
--  One ADD COLUMN, one ADD CONSTRAINT, one index, three COMMENTs. No DROP, no DELETE,
--  no TRUNCATE, no ALTER COLUMN TYPE. `holds` is untouched and keeps its meaning
--  (the long/spot limb), so every existing query, every existing index and the
--  append-only trigger all keep working unchanged. Re-running this file is a no-op.
--  A human pastes it into the Supabase SQL editor by hand.
--
--  Applies to: marketing_holdings_declaration (0060_marketing_abuse.sql)

-- ── The column ────────────────────────────────────────────────────────────────
--  NOT NULL with a DEFAULT rather than nullable, per the argument above. Postgres 11+
--  adds a non-volatile-default column without rewriting the table, so this is safe on
--  a live table regardless of its size.
ALTER TABLE marketing_holdings_declaration
  ADD COLUMN IF NOT EXISTS short_position text NOT NULL DEFAULT 'not_asked';

-- ── The vocabulary, as a CHECK ────────────────────────────────────────────────
--  The 0047 convention: the database keeps its own copy of the application's union so
--  a value the application never emits cannot arrive through psql, a fixture or a
--  future route. The four values mirror `SHORT_POSITION_ANSWERS` in
--  packages/shared/src/marketing/contracts/holdings.ts, and the mirror is held by a
--  test that reads both sides (apps/api/src/routes/__tests__/marketingHoldingsShort.test.ts)
--  rather than by this comment.
--
--    holds_short  affirmatively short → a BEARISH statement needs the disclosure IN
--                 the post. It does not forbid speaking.
--    no_short     affirmatively NOT short. The only value that clears the bearish limb.
--    declined     asked, and chose not to answer. A legitimate outcome, kept distinct
--                 from not_asked because it names a different party's gap.
--    not_asked    the question was never put. THE DEFAULT. Never "no".
--
--  ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so the DO block is how this file
--  stays re-runnable — the same shape 0060 uses for its trigger.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'marketing_holdings_declaration_short_position_check'
       AND conrelid = 'marketing_holdings_declaration'::regclass
  ) THEN
    ALTER TABLE marketing_holdings_declaration
      ADD CONSTRAINT marketing_holdings_declaration_short_position_check
      CHECK (short_position IN ('holds_short', 'no_short', 'declined', 'not_asked'));
  END IF;
END
$$;

-- ── The supervision read ──────────────────────────────────────────────────────
--  "Which current declarations leave the short question unanswered" is the query an
--  approver runs to see how much of the desk the bearish limb cannot clear. Partial,
--  because the answered rows are not what anyone is looking for, and it keeps the
--  index small on a table that is mostly answered once the question is asked.
CREATE INDEX IF NOT EXISTS marketing_holdings_declaration_short_unknown_idx
  ON marketing_holdings_declaration (asset_symbol, member_id)
  WHERE short_position IN ('declined', 'not_asked');

-- ── What it is, in the database itself ────────────────────────────────────────
--  COMMENT replaces, so re-running this file is a no-op. The person most likely to
--  misread this column is the one who never opened this migration, and `\d+` is where
--  they will be looking.
COMMENT ON COLUMN marketing_holdings_declaration.short_position IS
  'THE SHORT LIMB of MiCA Art 91(3)(c), which `holds` (a boolean) cannot express. One of holds_short | no_short | declined | not_asked. ''not_asked'' IS NOT ''no_short'': it means the question was never put, and it is the DEFAULT — every row written before 0065 carries it, truthfully. Both ''not_asked'' and ''declined'' resolve to bearishLimb=unknown, which REFUSES; only ''no_short'' clears the bearish limb. Whether staff are asked at all is an HR/legal decision held in application code (SHORT_QUESTION_POLICY, apps/api/src/marketing/abuseRegister.ts), which ships set to not_asked. See 0065_marketing_holdings_position.sql.';

COMMENT ON COLUMN marketing_holdings_declaration.holds IS
  'THE LONG/SPOT LIMB — unchanged in meaning by 0065, which added short_position beside it rather than widening this. true = a conflict disclosure is required IN THE POST for a statement about this asset (Art 91(3)(c) "simultaneously ... to the public"); it does not forbid speaking. false = an affirmative declaration of no LONG position, and it says NOTHING about a short one: read short_position for that, and do not read false as flat.';

COMMENT ON TABLE marketing_holdings_declaration IS
  'LCX MARKETING staff holdings declaration: whether one named member of staff holds one named asset LONG (holds) and/or SHORT (short_position, added by 0065), when they declared it, and when that declaration expires (renew_by). Exists because MiCA Art 91(3)(c) makes voicing an opinion on an asset you hold, without simultaneous public disclosure, market manipulation — fines on a natural person from EUR 700 000 (Art 111(2)(d)) — and the Article is direction-neutral, so the bearish limb needs an answer of its own. SELF-SERVICE ONLY (member_id is the declarer, taken from the session; there is no on-behalf path) and APPEND-ONLY by trigger: an amendment is a new row chained by supersedes_id, because the earlier value is the evidence. A stale or absent declaration REFUSES, and short_position=''not_asked'' is not an answer. See 0060_marketing_abuse.sql and 0065_marketing_holdings_position.sql.';
