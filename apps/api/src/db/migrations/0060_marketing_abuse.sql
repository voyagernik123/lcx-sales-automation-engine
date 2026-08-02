-- ──────────────────────────────────────────────
--  0060 — LCX MARKETING: THE MARKET-ABUSE PERIMETER
--
--  Phase M2 of LCX_MARKETING_100X_PLAN.md (§5). The two registers whose ABSENCE is
--  the reason the compartment could only review prose.
--
--    marketing_asset_embargo         which assets carry inside information that is
--                                    not yet public, who entered that, and until
--                                    when it is in force.
--    marketing_holdings_declaration  whether a named member of staff holds a named
--                                    asset, when they said so, and when that
--                                    declaration must be renewed.
--
--  WHY THESE TWO AND NOT A WORDING TABLE. MiCA's two worst exposures for a public
--  reply are invisible to a wording review (plan §0):
--
--    Art 90(1)  — a "coming soon" reply about an unannounced listing is unlawful
--                 disclosure of inside information. Art 87(1)(a) makes an
--                 unannounced listing decision inside information (precise, not
--                 public, price-significant) and Art 87(2)-(3) extend that to the
--                 intermediate steps of a protracted process. No sentence-quality
--                 check catches it; only an asset-state join does.
--    Art 91(3)(c) — voicing an opinion on an asset while holding a position in it,
--                 without SIMULTANEOUSLY disclosing that conflict to the public, is
--                 market manipulation, with fines on a natural person from
--                 EUR 700 000 (Art 111(2)(d)). "Simultaneously ... to the public"
--                 means the disclosure has to be in the post; a register filed with
--                 compliance does not satisfy it. What the register does is decide
--                 whether the post needs one — which is a join, not a judgement.
--
--  ══ NO LEGAL OR MARKET FACT IS ASSERTED, INFERRED OR SEEDED BY THIS FILE. ══
--  Both tables ship EMPTY, and that is the honest state, not an omission. An
--  embargo is a decision the listing side makes; a holdings position is a fact only
--  the person holding it knows. Neither is derivable from anything in this schema,
--  and seeding a placeholder would be strictly worse than an empty table: every row
--  here carries an accountable human's name, and a placeholder sitting in one would
--  read as a position someone took. The loader reports emptiness explicitly
--  (`registerEmpty`) and the engine refuses on it — an absent register produces a
--  refusal, never a zero and never a silent "clear". This is the GPS perimeter
--  pattern (`0050_gps_perimeter.sql:26-35`), which is now the house pattern.
--
--  ══ THERE IS NO FREE TEXT IN EITHER TABLE. ══
--  Not a style choice, and it is enforced by CHECK rather than asked for in a
--  comment. Two independent reasons:
--
--    1. THE EMBARGO REGISTER IS ITSELF INSIDE INFORMATION. The list of symbols
--       under embargo reveals unannounced listings; a prose column would invite a
--       reviewer to restate WHY, i.e. to write the inside information down in a
--       second place with a wider readership. So the substance is never recorded
--       here: `source_ref` is a slug pointing at where the decision is minuted, and
--       the regex on it makes a sentence physically unstorable.
--    2. THE HOLDINGS DECLARATION CARRIES PERSONAL LIABILITY. Art 91(3)(c) is
--       answered by a boolean about a named asset on a dated record, and by nothing
--       else. A free-text blob is not evidence: it cannot be joined against a draft,
--       and six months later "I think I mentioned I had some" is what it produces.
--       `holds` is a boolean, `amendment_reason` is a closed enum, and both action
--       params are ids/enums — `audit_log` has no retention sweep, so prose in a
--       param is prose kept forever.
--
--  ══ NO CREDENTIAL, NO POSTING PATH, NOTHING THAT CAN SPEAK FOR LCX. ══
--  Unchanged from 0046 and load-bearing: nothing in this file stores a token, and
--  neither table has a `posted`, `published`, `send` or `schedule` column. These
--  tables can only ever make a draft REFUSE. That is the whole of their power.
--
--  Idempotent and forward-only. Every statement is CREATE ... IF NOT EXISTS,
--  CREATE OR REPLACE, a guarded DO block, COMMENT (which replaces), or one of the
--  two `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` lines at the foot — which are the
--  ONLY ALTERs here, are re-runnable, and change no data. There is deliberately NO
--  DROP, DELETE, TRUNCATE and no ALTER COLUMN anywhere in the file: it is pasted into
--  the Supabase SQL editor by hand, and a destructive-operations warning is a round
--  trip nobody needs. That is also why the trigger creations below are guarded by
--  pg_trigger lookups rather than written as the usual DROP-then-CREATE pair.
--  `apps/api/src/marketing/__tests__/abuseRegisterMigration.test.ts` asserts each of
--  those claims against this file's text, so they cannot quietly stop being true.
-- ──────────────────────────────────────────────


-- ── The asset embargo register ────────────────────────────────────────────────
--  ONE LIVE ROW PER ASSET, enforced by a partial unique index below. A state
--  change is a NEW row: the live row is LIFTED (the only UPDATE the trigger
--  permits) and the next state is entered fresh. So the history of what the desk
--  believed, and when, survives — which is the evidence Art 68(9) asks for — and no
--  path exists that rewrites what was in force at the time a draft was refused.
--
--  NO CLIENT OR PROJECT DIMENSION, deliberately. This is a fact about an ASSET and
--  the desk's own knowledge of it. An embargo that could be scoped per audience is
--  an embargo that gets negotiated per audience.
CREATE TABLE IF NOT EXISTS marketing_asset_embargo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The symbol as the desk writes it. Uppercase is ASSERTED, not trusted: `sol`
  -- and `SOL` becoming two rows would mean the gate's answer depends on how the
  -- drafter typed it, which is the same failure `0050_gps_perimeter.sql:82` closed
  -- for jurisdictions. Bounded at 20 because a symbol is a symbol; the bound also
  -- means this column cannot hold a sentence.
  asset_symbol   text NOT NULL
                   CHECK (asset_symbol = upper(btrim(asset_symbol))
                          AND length(asset_symbol) BETWEEN 1 AND 20),

  -- WHICH EVENT this embargo is about, as an opaque internal slug — e.g.
  -- `listing-committee-2026-07-30`. Two purposes: it distinguishes successive
  -- embargoes on the same asset (an asset can be re-embargoed for a new event long
  -- after the first was announced), and it is the idempotency key for the write
  -- path, so a retried action collides instead of creating a second live embargo.
  --
  -- THE REGEX IS THE CONTROL, not decoration: no spaces means no prose, so the
  -- inside information cannot be written into the reference to itself. Lowercase
  -- so a slug cannot fork on case.
  event_ref      text NOT NULL CHECK (event_ref ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'),

  -- The recorded state. Mirrors `AssetEmbargoState`
  -- (packages/shared/src/marketing/types.ts §1.3) MINUS `unknown`, exactly as
  -- `0050_gps_perimeter.sql:100` excludes `unknown` from service_class and for the
  -- same reason: unknown is the ABSENCE of a live row, never a row. A storable
  -- `unknown` would let someone record ignorance as a position and then point at
  -- the record.
  --
  --   mnpi_pending  inside information exists and is not public → hard block
  --   announced     disclosed; Art 88(1) then requires the marketing to be a
  --                 SEPARATE artefact from the disclosure, so this is still a
  --                 refusal for a combined post — a different one, not silence
  --   clear         publicly announced, or never inside information
  --   exempt_offer  an Art 4(2)/(3) exemption is in force, and Art 4(4) can destroy
  --                 it, which is why it is recorded rather than assumed
  state          text NOT NULL
                   CHECK (state IN ('mnpi_pending', 'announced', 'clear', 'exempt_offer')),

  embargoed_from timestamptz NOT NULL DEFAULT now(),

  -- The declared end of the window, or NULL for open-ended (the honest default for
  -- "until the announcement, whenever that is"). NOTE WHAT PASSING THIS DOES NOT
  -- DO: it does not clear the asset. The loader treats a live row past its window
  -- as STALE and reports the asset as `unknown`, which refuses. An embargo is not
  -- lifted by the calendar; it is lifted by a named human.
  embargoed_until timestamptz,

  -- WHEN A HUMAN MUST LOOK AGAIN. Same discipline as
  -- `gps_jurisdiction_profile.review_by`: past this instant the row stops
  -- authorising anything and the loader reports `unknown`. A state on a
  -- price-sensitive asset that nobody has re-examined is not a state.
  review_by      timestamptz NOT NULL,

  -- WHERE THE DECISION IS MINUTED — a slug, never the reason. See the file header:
  -- this register is inside information, so it records the POINTER and the
  -- substance stays where it was decided. Regex-enforced for the same reason as
  -- event_ref. Approver-visible only (`listEmbargoRegister` in
  -- apps/api/src/marketing/abuseRegister.ts refuses a non-approver); an operator
  -- drafting gets only "this asset cannot be named, ask <entered_by>".
  source_ref     text NOT NULL CHECK (source_ref ~ '^[a-z0-9][a-z0-9._:/-]{0,119}$'),

  -- THE ACCOUNTABLE HUMAN. Never a service account, never a role. 'UNASSIGNED' is
  -- refused explicitly so the sentinel the compiled placeholders use elsewhere in
  -- this codebase cannot be laundered into a real row by copy-paste. The API
  -- additionally requires a roster member (the shared machine key, `ai` and
  -- `monitor:<id>` are refused before the INSERT) — that check is code, not this
  -- CHECK, because the roster lives in reviewed code and not in the database.
  entered_by     text NOT NULL CHECK (length(btrim(entered_by)) > 0
                                      AND upper(btrim(entered_by)) <> 'UNASSIGNED'),
  entered_at     timestamptz NOT NULL DEFAULT now(),

  -- THE LIFT. `in force` is DERIVED from `lifted_at IS NULL`, never stored as a
  -- boolean — the same reasoning as `gps_jurisdiction_profile.reviewed_at`
  -- (0050:137-145): a bare boolean is one careless UPDATE away from flipped with
  -- nobody's name against it.
  lifted_by      text,
  lifted_at      timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketing_asset_embargo_window
    CHECK (embargoed_until IS NULL OR embargoed_until > embargoed_from),
  CONSTRAINT marketing_asset_embargo_review_after_entry
    CHECK (review_by >= entered_at),
  -- Both halves of the lift or neither: a lifted_at with no name is an
  -- unattributed clearance of inside information, and a name with no date cannot
  -- be placed in time against a draft that was allowed through afterwards.
  CONSTRAINT marketing_asset_embargo_lift_pair
    CHECK ((lifted_by IS NULL) = (lifted_at IS NULL)),
  CONSTRAINT marketing_asset_embargo_lift_named
    CHECK (lifted_by IS NULL OR (length(btrim(lifted_by)) > 0
                                 AND upper(btrim(lifted_by)) <> 'UNASSIGNED')),
  CONSTRAINT marketing_asset_embargo_lift_after_entry
    CHECK (lifted_at IS NULL OR lifted_at >= entered_at)
);

-- ONE LIVE EMBARGO PER ASSET. Two live rows disagreeing about the same symbol is
-- the state in which the gate's answer depends on row order, i.e. on nothing.
-- Partial, so the whole history of lifted rows stays.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_asset_embargo_live_idx
  ON marketing_asset_embargo (asset_symbol) WHERE lifted_at IS NULL;

-- Idempotency of entry: the same event on the same asset is one row, so a retried
-- write collides (and the API reports the existing row) instead of forging a
-- second history.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_asset_embargo_event_idx
  ON marketing_asset_embargo (asset_symbol, event_ref);

-- The review queue: what goes stale next, ascending, because the interesting end
-- is the overdue one. Partial — a lifted row needs no review.
CREATE INDEX IF NOT EXISTS marketing_asset_embargo_review_idx
  ON marketing_asset_embargo (review_by) WHERE lifted_at IS NULL;

-- "Everything we ever recorded about this symbol", newest first — the read an
-- export or an investigation makes, and the reason the lifted rows are kept.
CREATE INDEX IF NOT EXISTS marketing_asset_embargo_history_idx
  ON marketing_asset_embargo (asset_symbol, entered_at DESC);


-- ── The only UPDATE an embargo row accepts is its own lift ────────────────────
--  WHY A TRIGGER AND NOT A COMMENT, and not RLS either: the API connects as the
--  database owner and owners BYPASS RLS (the arrangement 0042 relies on), while
--  triggers DO fire for the owner. So this is the one mechanism available that
--  binds the code actually running. `0050_gps_perimeter.sql:303` makes the same
--  argument for its append-only disclosure record.
--
--  WHAT IT PROTECTS. The evidential value of this table is that it says what the
--  desk KNEW AT THE TIME a draft was refused or allowed. An UPDATE that moved
--  `state` from 'mnpi_pending' to 'clear' in place would rewrite that, and every
--  draft cleared before the edit would retroactively look correctly cleared. So a
--  state change must be a new row, and re-lifting an already-lifted row — which
--  would silently move the lift's name and date — is refused outright.
--
--  DELETE is deliberately not touched. Nothing in the API deletes from this table,
--  and a table that cannot be deleted from turns a future erasure obligation into a
--  migration. The property being defended is that HISTORY CANNOT BE REWRITTEN, not
--  that a row is eternal.
CREATE OR REPLACE FUNCTION marketing_asset_embargo_lift_only() RETURNS trigger AS $$
BEGIN
  IF OLD.lifted_at IS NOT NULL THEN
    RAISE EXCEPTION
      'marketing_asset_embargo row % is already lifted (by % at %): re-lifting would move the name and date on a decision about inside information. Enter a NEW row for the new state. See 0060_marketing_abuse.sql.',
      OLD.id, OLD.lifted_by, OLD.lifted_at
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.lifted_at IS NULL THEN
    RAISE EXCEPTION
      'marketing_asset_embargo accepts no UPDATE other than a lift: set lifted_by and lifted_at, or enter a new row. See 0060_marketing_abuse.sql.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id <> OLD.id
     OR NEW.asset_symbol <> OLD.asset_symbol
     OR NEW.event_ref <> OLD.event_ref
     OR NEW.state <> OLD.state
     OR NEW.embargoed_from <> OLD.embargoed_from
     OR NEW.embargoed_until IS DISTINCT FROM OLD.embargoed_until
     OR NEW.review_by <> OLD.review_by
     OR NEW.source_ref <> OLD.source_ref
     OR NEW.entered_by <> OLD.entered_by
     OR NEW.entered_at <> OLD.entered_at
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION
      'marketing_asset_embargo is history: only lifted_by and lifted_at may change on an existing row. A different state, window, source or author is a NEW row. See 0060_marketing_abuse.sql.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Guarded rather than DROP-then-CREATE, so this file contains no destructive verb
-- for the Supabase editor to warn about. Re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_marketing_asset_embargo_lift_only'
       AND tgrelid = 'marketing_asset_embargo'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_marketing_asset_embargo_lift_only
      BEFORE UPDATE ON marketing_asset_embargo
      FOR EACH ROW EXECUTE FUNCTION marketing_asset_embargo_lift_only();
  END IF;
END
$$;


-- ── The staff holdings declaration ────────────────────────────────────────────
--  APPEND-ONLY, AND THE OLD VALUE IS THE EVIDENCE.
--
--  Art 91(3)(c) asks whether the person who voiced the opinion held a position AT
--  THE TIME. An amendment that overwrote the prior row would destroy the only
--  record capable of answering that, and would do so in the direction that always
--  flatters: "I declared none" is what an in-place edit leaves behind. So an
--  amendment INSERTS a new row pointing at the one it supersedes (`supersedes_id`),
--  both survive, and the chain is the history. The append-only property is enforced
--  by the trigger below, not asked for in this comment.
--
--  ONE BOOLEAN PER (person, asset), NEVER A BLOB. `holds` is the whole answer, and
--  it is the only shape that can be joined against a draft that names an asset.
--
--  SELF-SERVICE ONLY. There is no `declared_by` column and no on-behalf write path:
--  `member_id` IS the declarer, set by the API from the authenticated principal and
--  never from a request body. An approver can READ this register (that is the
--  supervision), and cannot author a declaration for somebody else — a position is
--  a fact only its holder knows, and a supervisor's guess recorded under an
--  employee's name is worse than no record, because it carries that employee's
--  personal liability. Adding an on-behalf path would require a migration, and that
--  friction is the point.
CREATE TABLE IF NOT EXISTS marketing_holdings_declaration (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The desk member's stable id (`ActorId`), as the roster spells it — a slug, so a
  -- display name or an email cannot land here and fork the register. The roster
  -- membership check itself is code (`findMemberById`), because the roster lives in
  -- reviewed code; this regex only fixes the SHAPE.
  member_id      text NOT NULL CHECK (member_id ~ '^[a-z0-9][a-z0-9._:-]{0,63}$'),

  -- Same normalisation as the embargo register, for the same reason: the join
  -- between the two is on this column, and a case fork would silently miss.
  asset_symbol   text NOT NULL
                   CHECK (asset_symbol = upper(btrim(asset_symbol))
                          AND length(asset_symbol) BETWEEN 1 AND 20),

  -- THE ANSWER. `true` means a conflict disclosure is required IN THE POST
  -- (Art 91(3)(c) "simultaneously ... to the public"), not that speaking is
  -- forbidden. `false` is an affirmative declaration of no position, which is a
  -- different fact from never having answered — the absence of a row is
  -- `not_declared`, and both refuse, but for different stated reasons.
  holds          boolean NOT NULL,

  declared_at    timestamptz NOT NULL DEFAULT now(),

  -- WHEN IT EXPIRES. A declaration is a snapshot of a position that can change the
  -- next morning, so it goes STALE: past `renew_by` the loader reports the cell as
  -- `not_declared` and the engine refuses. A register of year-old answers is a
  -- register that certifies nothing, and treating a stale answer as current is the
  -- one failure mode that would make this table actively misleading.
  renew_by       timestamptz NOT NULL,

  -- THE AMENDMENT CHAIN. Points at the row this one replaces; that row is left
  -- exactly as it was. NULL means this is the first declaration for the cell.
  supersedes_id  uuid REFERENCES marketing_holdings_declaration(id),

  -- WHY it was amended, as a CLOSED ENUM and never prose. A queryable reason is
  -- better evidence than a sentence (it can be counted, and "position_opened"
  -- against a draft approved the day before is a finding), and the action param
  -- that carries it therefore stays an enum — `audit_log` has no retention sweep,
  -- so prose in a param is prose retained indefinitely.
  amendment_reason text
                   CHECK (amendment_reason IN ('position_opened', 'position_closed',
                                               'earlier_entry_wrong', 'asset_renamed',
                                               'periodic_renewal')),

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketing_holdings_declaration_renew_after
    CHECK (renew_by > declared_at),
  -- An amendment without a reason is an unexplained change to a record with
  -- personal liability attached; a reason without a target is a reason for nothing.
  CONSTRAINT marketing_holdings_declaration_amend_pair
    CHECK ((supersedes_id IS NULL) = (amendment_reason IS NULL)),
  CONSTRAINT marketing_holdings_declaration_not_self
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

-- ONE ROOT PER CELL. The first declaration for (member, asset) is unique, so every
-- later one MUST chain — which is what makes "current" well defined without a
-- mutable `is_current` flag anywhere.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_holdings_declaration_root_idx
  ON marketing_holdings_declaration (member_id, asset_symbol)
  WHERE supersedes_id IS NULL;

-- A ROW MAY BE SUPERSEDED ONCE. Without this, two concurrent amendments both
-- pointing at the same parent would fork the chain and "the current declaration"
-- would again depend on row order. With it, the second one loses on a constraint
-- and the API tells the caller to re-read.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_holdings_declaration_chain_idx
  ON marketing_holdings_declaration (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

-- THE ENGINE'S READ: "for this asset, what did these people declare", newest first.
-- Asset leads because a draft names assets and then asks about its author.
CREATE INDEX IF NOT EXISTS marketing_holdings_declaration_cell_idx
  ON marketing_holdings_declaration (asset_symbol, member_id, declared_at DESC);

-- The renewal queue, ascending — the overdue end first.
CREATE INDEX IF NOT EXISTS marketing_holdings_declaration_renew_idx
  ON marketing_holdings_declaration (renew_by);

-- "Everything I have ever declared" — the member's own view, which is the only
-- view most of the desk should ever have of this table.
CREATE INDEX IF NOT EXISTS marketing_holdings_declaration_member_idx
  ON marketing_holdings_declaration (member_id, declared_at DESC);


-- ── Append-only, enforced by the database ─────────────────────────────────────
--  No UPDATE at all, for the reason set out above the table: the prior value is the
--  evidence, and Art 91(3)(c) is decided on what was declared when. Correcting a
--  declaration means MAKING one — a new row, with its own date and its own reason,
--  pointing at what it replaced.
--
--  DELETE is not blocked, for the same reason 0050 left it alone: erasure of an
--  employee's personal data may become an obligation, and a table nothing can
--  delete from turns that obligation into a migration. See the DPO item in
--  LCX_MARKETING_100X_PLAN.md §7 — the retention question for this table is open
--  and is the owner's, not this file's.
CREATE OR REPLACE FUNCTION marketing_holdings_declaration_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'marketing_holdings_declaration is append-only: a declaration that was made cannot be edited, because the earlier value is the evidence under MiCA Art 91(3)(c). Declare again — a new row with supersedes_id pointing at this one and an amendment_reason. See 0060_marketing_abuse.sql.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_marketing_holdings_declaration_no_update'
       AND tgrelid = 'marketing_holdings_declaration'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_marketing_holdings_declaration_no_update
      BEFORE UPDATE ON marketing_holdings_declaration
      FOR EACH ROW EXECUTE FUNCTION marketing_holdings_declaration_no_update();
  END IF;
END
$$;


-- ── No entitlement is seeded here, and that is deliberate ─────────────────────
--  `0046_marketing.sql:134` already extended the no-lockout covenant to the
--  `marketing` compartment (monty/nik at approve, sam at operate). Re-seeding those
--  rows here would imply M2 widened access when it did not: these two tables are
--  reached through the SAME compartment gate as the reply queue, and the extra
--  authority M2 introduces is expressed where it can be enforced — approver-only on
--  every embargo write, self-only on a holdings write — in
--  `apps/api/src/marketing/abuseRegister.ts`, not by handing anyone a new grant.


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED IN THE FILE, not left to a dashboard button. 0042, 0043, 0046, 0047,
--  0049 and 0050 each declare their own, because a database restored from these
--  files alone must come up SECURE — Supabase's SQL editor offers "Run and enable
--  RLS" when it sees a CREATE TABLE in `public` without it, and taking that option
--  leaves the security posture living in a click nobody records and no diff shows.
--
--  WHY IT MATTERS FOR THESE TWO SPECIFICALLY, because the answer differs and
--  repeating 0046's paragraph by rote would obscure that:
--
--    marketing_asset_embargo IS INSIDE INFORMATION. This is the sharpest exposure
--    in the schema. Supabase publishes `public` tables through its auto-generated
--    REST API, so without RLS anyone holding the project's anon key — which ships
--    inside a web bundle — could read the list of symbols a regulated exchange has
--    decided not to announce yet. That is a tradeable leak, and it would be LCX
--    itself committing the Art 90(1) unlawful disclosure this table exists to
--    prevent. Everything else about the table is a control; this line is the door.
--
--    marketing_holdings_declaration is EMPLOYEE PERSONAL DATA of a financial kind:
--    which members of staff hold which crypto-assets. Anon-key readable, it is a
--    ready-made list for anyone wanting to front-run, phish or pressure a named
--    individual at the exchange, and it is exactly the material Art 91(3)(c)
--    liability attaches to. GDPR-wise it is personal data processed for a legal
--    obligation; the lawful-basis record and the retention answer are M7's and the
--    DPO's (plan §7), and neither is asserted here.
--
--  WHY IT CANNOT BREAK LCX OS. The API connects as the database owner, which
--  bypasses RLS — proven in production by `entitlements` being RLS-enabled while
--  the workspace switcher works. NO POLICIES are defined because no non-owner role
--  should reach these tables at all: RLS with no policy is deny-all, which is the
--  intent.
--
--  WHAT RLS DOES NOT DO HERE, so nobody quotes it as more than it is:
--    · It does not scope reads BETWEEN desk members. Need-to-know inside the desk
--      is enforced in the service layer (`listEmbargoRegister` refuses a
--      non-approver; `listHoldings` refuses a viewer asking about someone else),
--      and those are ordinary code that a future route could bypass by writing its
--      own SQL. That is a real limit, stated rather than papered over.
--    · It does not make either table immutable. The two triggers above do that,
--      because owners bypass RLS and would otherwise bypass the whole claim.
--    · These tables are deliberately NOT added to `apps/api/src/routes/search.ts`.
--      A cross-compartment search that returned embargoed symbols would defeat the
--      first paragraph above from inside the building.
ALTER TABLE marketing_asset_embargo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_holdings_declaration  ENABLE ROW LEVEL SECURITY;


-- ── What these tables are, in the database itself ─────────────────────────────
--  The person most likely to misuse a column is the one who never opened the
--  migration, and `\d+` is where they will be looking. COMMENT replaces, so
--  re-running this file is a no-op.
COMMENT ON TABLE marketing_asset_embargo IS
  'LCX MARKETING market-abuse perimeter: which assets carry inside information that is not yet public, entered by a NAMED APPROVER, with a window and a review date. THIS TABLE IS ITSELF INSIDE INFORMATION (MiCA Art 87) — the list of symbols reveals unannounced listings, so it holds no free text and its detail is approver-only. One LIVE row per asset (partial unique index); a state change is a new row and the old one is LIFTED, never edited (trigger). Absence of a live row is `unknown`, which REFUSES — it is never `clear`. See 0060_marketing_abuse.sql.';

COMMENT ON COLUMN marketing_asset_embargo.state IS
  'Mirrors AssetEmbargoState (packages/shared/src/marketing/types.ts) minus `unknown`: unknown is the ABSENCE of a live row and must not be storable, or ignorance becomes a recordable position.';

COMMENT ON COLUMN marketing_asset_embargo.source_ref IS
  'A SLUG pointing at where the decision is minuted — never the reason, and never the information itself. The regex is the control: no spaces means no prose. Approver-visible only.';

COMMENT ON COLUMN marketing_asset_embargo.embargoed_until IS
  'The declared end of the window, or NULL for open-ended. Passing it does NOT clear the asset: a live row past its window is reported as `unknown` and refuses. An embargo is lifted by a named human, not by the calendar.';

COMMENT ON COLUMN marketing_asset_embargo.lifted_at IS
  'Set once, alongside lifted_by, by the lift action. `in force` is DERIVED from this being NULL — there is deliberately no in_force boolean to flip, and the trigger refuses a second lift.';

COMMENT ON TABLE marketing_holdings_declaration IS
  'LCX MARKETING staff holdings declaration: whether one named member of staff holds one named asset, when they declared it, and when that declaration expires (renew_by). Exists because MiCA Art 91(3)(c) makes voicing an opinion on an asset you hold, without simultaneous public disclosure, market manipulation — fines on a natural person from EUR 700 000 (Art 111(2)(d)). SELF-SERVICE ONLY (member_id is the declarer, taken from the session; there is no on-behalf path) and APPEND-ONLY by trigger: an amendment is a new row chained by supersedes_id, because the earlier value is the evidence. A stale or absent declaration REFUSES. See 0060_marketing_abuse.sql.';

COMMENT ON COLUMN marketing_holdings_declaration.holds IS
  'The whole answer, as a boolean, because that is what joins against a draft. true = a conflict disclosure is required IN THE POST (Art 91(3)(c) "simultaneously ... to the public"); it does not forbid speaking. false = an affirmative declaration of no position, which is a different fact from never having answered.';

COMMENT ON COLUMN marketing_holdings_declaration.renew_by IS
  'EXPIRY, not a reminder. Past this instant the cell is reported as not_declared and the engine refuses. A position can change overnight, so a register of year-old answers certifies nothing.';

COMMENT ON COLUMN marketing_holdings_declaration.supersedes_id IS
  'The amendment chain: points at the row this one replaces, which is left exactly as it was. The current declaration is the row nothing supersedes — enforced by two partial unique indexes, so there is no mutable is_current flag anywhere.';
