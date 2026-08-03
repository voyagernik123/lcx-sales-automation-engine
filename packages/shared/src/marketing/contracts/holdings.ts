/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE HOLDINGS DECLARATION — THE WIRE CONTRACT, AND THE SHORT-POSITION QUESTION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHY THIS FILE EXISTS. `0060_marketing_abuse.sql` created
 *  `marketing_holdings_declaration` and `marketing/abuseRegister.ts` joins against it,
 *  so the Art 91(3)(c) gate is real — but nothing could WRITE a declaration from a
 *  screen, so the register was permanently empty and the gate permanently refused.
 *  These are the shapes the three read routes in `apps/api/src/routes/marketingHoldings.ts`
 *  return and the shapes `apps/web/src/pages/MarketingHoldings.tsx` renders.
 *
 *  ── THE DEFECT THIS FILE IS MOSTLY ABOUT ────────────────────────────────────
 *  `marketing_holdings_declaration.holds` is a BOOLEAN, so a declaration can say
 *  "I hold spot" or "I hold nothing" and nothing else. Art 91(3)(c) is
 *  DIRECTION-NEUTRAL — `abuse.ts` records this as a NAMED GAP at its stance
 *  classifier: "`HoldingsDeclarationEntry.declared` cannot express a SHORT position,
 *  so the bearish limb currently only fires where the actor also holds spot."
 *
 *  A staffer who is short an asset and calls it a dead project is inside the Article.
 *  With a boolean, their `holds = false` row reads as "no position" and the draft
 *  clears. That is the conflation this file exists to break, and it is worth being
 *  precise about which conflation it is:
 *
 *      NOT ASKED  ≠  NO SHORT POSITION
 *
 *  An unanswered question is not an answer of "no". `SHORT_NOT_ASKED_IS_NOT_NO_SHORT`
 *  is the sentence a surface must show, and `bearishLimbOf` returns `unknown` — never
 *  `no_short_declared` — for both `not_asked` and `declined`. Unknown REFUSES.
 *
 *  ── WHAT THIS FILE DOES NOT DECIDE ──────────────────────────────────────────
 *  WHETHER LCX MAY ASK STAFF TO DISCLOSE SHORT POSITIONS IS AN HR AND LEGAL
 *  QUESTION, AND IT IS NOT DECIDED HERE OR ANYWHERE IN THIS REPOSITORY. Asking an
 *  employee about positions held in a personal account outside the firm engages
 *  employment law and GDPR (a new purpose, a new lawful basis, a new retention
 *  answer — the DPO item in LCX_MARKETING_100X_PLAN.md §7 is still open). No line of
 *  code can settle that, and a default that quietly assumed the answer would be a
 *  legal position asserted by an engineer.
 *
 *  So the question is made EXPRESSIBLE and left NOT COMPULSORY. The switch is one
 *  line — `SHORT_QUESTION_POLICY` in `apps/api/src/marketing/abuseRegister.ts` — it
 *  ships in the state that asks nothing, and `ShortQuestionPolicy` below documents
 *  the three settings a human may choose between. The API reports the live setting in
 *  every response so the surface never has to guess, and so a screenshot of the
 *  screen is evidence of which policy was in force when it was taken.
 *
 *  ── HOW THIS FILE IS REACHED. THE BARREL LINE HAS LANDED. ───────────────────
 *  `packages/shared/package.json` publishes exactly one entry point (`"."` →
 *  `src/index.ts`), so `@lcx/shared/marketing/contracts/holdings.js` resolves for
 *  neither `tsc` nor Vite, and out of `apps/api` a deep relative specifier fails the
 *  EMIT build with TS6059 (`not under rootDir`) — the Docker-order failure
 *  `gate-must-run-emit-build` exists to catch. `marketing/index.ts` now carries
 *  `export * from './contracts/holdings.js';`, so every consumer names this module as
 *  `@lcx/shared` and none of that bites:
 *
 *    · `apps/web/src/pages/MarketingHoldings.tsx` imports it from `@lcx/shared`. It
 *      was a relative path while the barrel line was outstanding.
 *    · `packages/shared/src/marketing/abuse.ts` can import it as an ordinary sibling
 *      when its owner closes the bearish limb — no barrel line needed for that either.
 *    · `apps/api` IMPORTS IT. `marketing/abuseRegister.ts` held api-side copies of the
 *      two vocabularies under the mirror convention 0060 uses for its CHECK
 *      constraints; those copies are DELETED and it re-exports the shared ones under
 *      the same names. `routes/__tests__/marketingHoldingsShort.test.ts` now asserts
 *      the single-sourcing (identity, plus no second literal in the api file) instead
 *      of holding two lists equal.
 *
 *  What is STILL mirrored, and deliberately: the four values as a CHECK in 0065. The
 *  database keeping its own copy is the 0047 convention and the one duplicate worth
 *  having, because it stops a value the application never emits arriving through psql.
 *  Reachability of every symbol here through the root barrel is asserted by
 *  `packages/shared/src/barrelReachability.test.ts`.
 *
 *  ── NO FACT ABOUT ANY REAL PERSON IS IN THIS FILE ───────────────────────────
 *  There are no seeded members, no seeded assets and no example positions, because a
 *  placeholder in a holdings register reads as a position somebody took. Every type
 *  here is a shape; every list is a vocabulary.
 */

import type { ActorId, AssetSymbol, HoldingsDeclarationState, Instant } from '../types.js';

/* ════════════════════════ §1 THE SHORT QUESTION ════════════════════════ */

/**
 * WHAT A DECLARATION CAN SAY ABOUT A SHORT POSITION. Four values, and the fourth is
 * the entire point of the widening.
 *
 *   holds_short  an affirmative declaration of a short position. A BEARISH statement
 *                about this asset needs the conflict disclosure IN THE POST, on the
 *                same reading of "simultaneously ... to the public" that the long limb
 *                already uses. It does not forbid speaking.
 *   no_short     an affirmative declaration of NO short position. This is an answer,
 *                and it is the only value that lets the bearish limb clear.
 *   declined     the member was asked and chose not to answer. A real and legitimate
 *                outcome while `SHORT_QUESTION_POLICY` is `voluntary`, kept SEPARATE
 *                from `not_asked` because "we never asked you" and "you declined" are
 *                different facts about different parties, and collapsing them would
 *                hide whose gap it is.
 *   not_asked    nobody put the question. THE DEFAULT, and the state every row written
 *                before 0065 carries — truthfully, because they were not asked.
 *
 * `declined` and `not_asked` are both UNKNOWN to the gate. They differ in who has to
 * act, which is what a refusal has to name, and never in whether the draft clears.
 */
export const SHORT_POSITION_ANSWERS = ['holds_short', 'no_short', 'declined', 'not_asked'] as const;
export type ShortPositionAnswer = (typeof SHORT_POSITION_ANSWERS)[number];

/** The answers that are an ANSWER. Neither of the other two may be read as one. */
export const SHORT_POSITION_ANSWERED: readonly ShortPositionAnswer[] = ['holds_short', 'no_short'];

/**
 * WHETHER THE QUESTION IS ASKED AT ALL — the three settings, and what each means for
 * every party. THE CHOICE BETWEEN THEM IS A HUMAN'S: see the header. The live value
 * is `SHORT_QUESTION_POLICY` in `apps/api/src/marketing/abuseRegister.ts`.
 *
 *   not_asked  The question is not put. The surface does not render it, and the API
 *              REFUSES a submitted short answer (`HOLDINGS_SHORT_QUESTION_NOT_ASKED`)
 *              rather than storing an answer to a question the firm never asked. Every
 *              row is written `not_asked`, so every bearish limb is `unknown` and every
 *              bearish draft refuses. THE SHIPPING DEFAULT, because it asserts nothing
 *              about employment law and its cost is a refusal, not a wrong pass.
 *   voluntary  The question is put and may be skipped. A skip stores `declined`. The
 *              bearish limb clears only for the members who answered `no_short`.
 *   required   A declaration without a short answer is refused
 *              (`HOLDINGS_SHORT_ANSWER_REQUIRED`). NOTE WHAT THIS SETTING DOES: it
 *              makes answering a condition of filing at all, so a member who will not
 *              answer cannot declare their LONG position either, and their drafts then
 *              refuse on `HOLDINGS_DECLARATION_MISSING`. That is a personnel
 *              consequence, not a technical one, and it is why this is not the default.
 */
export const SHORT_QUESTION_POLICIES = ['not_asked', 'voluntary', 'required'] as const;
export type ShortQuestionPolicy = (typeof SHORT_QUESTION_POLICIES)[number];

/** True when the surface should render the short question at all. */
export function shortQuestionIsAsked(policy: ShortQuestionPolicy): boolean {
  return policy !== 'not_asked';
}

/**
 * THE BEARISH LIMB OF Art 91(3)(c), as three values.
 *
 *   disclosure_required  a short position is declared; a bearish statement needs the
 *                        disclosure in the post
 *   no_short_declared    an affirmative "no short"; the bearish limb clears
 *   unknown              nobody knows, so nothing may pass on it
 *
 * THERE IS NO FOURTH VALUE MEANING "PROBABLY NOT". `unknown` is returned for BOTH
 * `not_asked` and `declined`, and a caller that wants to tell a member why must read
 * the raw `ShortPositionAnswer` — which is exactly the distinction the response shapes
 * below carry both of.
 */
export type BearishLimb = 'disclosure_required' | 'no_short_declared' | 'unknown';

export function bearishLimbOf(answer: ShortPositionAnswer): BearishLimb {
  switch (answer) {
    case 'holds_short':
      return 'disclosure_required';
    case 'no_short':
      return 'no_short_declared';
    // `declined` and `not_asked` are the whole reason this function exists. Written as
    // explicit cases rather than a default, so adding a fifth answer fails to compile
    // here instead of silently landing in the permissive branch.
    case 'declined':
    case 'not_asked':
      return 'unknown';
  }
}

/**
 * THE SENTENCE A SURFACE MUST SHOW beside any cell whose short answer is not an
 * answer. Exported as a constant so the screen, the API and the tests use the same
 * words, and so a future edit to the wording moves one string.
 */
export const SHORT_NOT_ASKED_IS_NOT_NO_SHORT =
  'NOT ASKED is not "no short position". Nobody has answered the short question for this asset, so a bearish statement about it cannot be cleared here — it refuses.';

/**
 * THE OTHER SENTENCE, and the more dangerous one. An empty holdings list is the state
 * a screen is most likely to render as reassurance.
 */
export const NOT_DECLARED_IS_NOT_CLEAR =
  'NOT DECLARED is the dangerous state, not a clean bill of health. An asset you have not declared refuses; an empty list means the register knows nothing about you, not that you hold nothing.';

/* ════════════════════════ §2 THE DERIVED POSITION ════════════════════════ */

/**
 * The four-plus-two states a LIVE declaration can express once the short answer is
 * carried alongside `holds`.
 *
 * `HoldingsDeclarationState` (`../types.js`) keeps `not_declared` and
 * `register_absent` — the two RESOLUTION OUTCOMES — out of the declaration vocabulary,
 * and this type follows it: nothing here can express "no answer", because a position
 * is what somebody said and those two are what nobody said.
 */
export type DeclaredPosition =
  /** Long spot, and an affirmative no-short. Fully answered. */
  | 'long_only'
  /** Long spot AND short. Fully answered; both limbs need the disclosure. */
  | 'long_and_short'
  /** Long spot; the short question is unanswered. The bearish limb is unknown. */
  | 'long_short_unknown'
  /** No spot, and a declared short. The limb the boolean could not see. */
  | 'short_only'
  /** Affirmatively flat both ways. The only state that clears both limbs. */
  | 'no_position'
  /** No spot; the short question is unanswered. Clears bullish, refuses bearish. */
  | 'flat_short_unknown';

export function positionOf(holds: boolean, short: ShortPositionAnswer): DeclaredPosition {
  const limb = bearishLimbOf(short);
  if (holds) {
    if (limb === 'disclosure_required') return 'long_and_short';
    return limb === 'no_short_declared' ? 'long_only' : 'long_short_unknown';
  }
  if (limb === 'disclosure_required') return 'short_only';
  return limb === 'no_short_declared' ? 'no_position' : 'flat_short_unknown';
}

/**
 * What a member reads on the screen. The two `_unknown` labels say UNKNOWN out loud,
 * because a label of "no short position" on a row nobody answered is precisely the
 * misreading `bearishLimbOf` refuses to make.
 */
export const POSITION_LABEL: Readonly<Record<DeclaredPosition, string>> = {
  long_only: 'Holds long · no short declared',
  long_and_short: 'Holds long AND short',
  long_short_unknown: 'Holds long · short position UNKNOWN',
  short_only: 'Holds short only',
  no_position: 'Holds neither',
  flat_short_unknown: 'No long position · short position UNKNOWN',
};

export const SHORT_ANSWER_LABEL: Readonly<Record<ShortPositionAnswer, string>> = {
  holds_short: 'Declared short',
  no_short: 'Declared no short',
  declined: 'Declined to answer',
  not_asked: 'NOT ASKED',
};

/* ════════════════════ §3 STALENESS, BEFORE IT IS STALE ════════════════════ */

/**
 * HOW LONG BEFORE `renew_by` A DECLARATION IS CALLED OUT AS EXPIRING.
 *
 * `loadHoldingsStates` already reports a declaration past `renew_by` as
 * `not_declared` and the engine already refuses on it — correctly, since a position
 * can change overnight. What nothing did was warn BEFORE the cliff, so the first
 * anybody learned of an expiry was a draft refusing at the moment somebody needed to
 * reply. Fourteen days is a working fortnight: long enough that a member on leave sees
 * it on their return, short enough that the warning still means something.
 *
 * IT IS A SURFACE AFFORDANCE ONLY. Nothing here changes when a declaration expires,
 * and `expiring` never clears anything — a live declaration inside its warning window
 * is still live, and an expired one still refuses.
 */
export const RENEWAL_WARN_DAYS = 14;

export type ExpiryBucket =
  /** Past `renew_by`. The engine reads this cell as `not_declared`; it REFUSES. */
  | 'expired'
  /** Live, but inside `RENEWAL_WARN_DAYS` of expiring. Live means live. */
  | 'expiring'
  /** Live, with more than the warning window left. */
  | 'live';

const DAY_MS = 86_400_000;

/**
 * Bucket a declaration by its renewal date. `now` is a parameter, never `Date.now()`
 * read inside — a function that reads the clock cannot be tested at a boundary, and
 * every boundary here is a day boundary.
 *
 * A `renewBy` that does not parse returns `expired`, which is the fail-closed
 * direction: an unreadable expiry date is not evidence that a declaration is live.
 */
export function expiryBucketOf(renewBy: Instant, now: Date): ExpiryBucket {
  const t = Date.parse(renewBy);
  if (!Number.isFinite(t)) return 'expired';
  const left = t - now.getTime();
  if (left <= 0) return 'expired';
  return left <= RENEWAL_WARN_DAYS * DAY_MS ? 'expiring' : 'live';
}

/* ════════════════════════ §4 THE WIRE SHAPES ════════════════════════ */

/**
 * ══ THE PAYLOAD CARRIES FACTS; THE SURFACE CARRIES WORDS AND DERIVATIONS. ══
 *
 * Every shape below is RAW: `holds`, `shortPosition`, `renewBy`, `state`. Not one of
 * them carries `position`, `bearishLimb`, `expiry` or a warning sentence, and that is a
 * decision rather than an omission.
 *
 * THIS SURVIVES THE BARREL LINE, and the reason is not the one it was written for. It was
 * originally "`apps/api` cannot import this module", which is no longer true. The reason it
 * still holds is the better one: anything derived that the API computed would be a SECOND
 * CALLER of `positionOf`, `bearishLimbOf` and `expiryBucketOf` deciding the same question on
 * the wire, and a payload that carries both `shortPosition` and a `bearishLimb` computed from
 * it can disagree with itself — a stale field is worse than an absent one. So the raw facts
 * travel and the derivations run once, at the surface that renders them.
 *
 * The same argument covers the sentences. `NOT_DECLARED_IS_NOT_CLEAR` and
 * `SHORT_NOT_ASKED_IS_NOT_NO_SHORT` are rendered by the screen from this module; putting
 * copies in the JSON would mean two wordings of the same warning, and the one an auditor
 * read would be whichever was updated last.
 */

/**
 * ONE ROW OF THE CHAIN — including the superseded ones, deliberately.
 *
 * `marketing_holdings_declaration` is append-only by trigger and an amendment INSERTS a
 * new row pointing at what it replaced, so the prior value is still there. It is
 * returned, and rendered, because THE OLD VALUE IS THE EVIDENCE: "what did this person
 * declare on the day that draft was approved" is the single question Art 91(3)(c) turns
 * on, and a surface that showed only the current row would be hiding the answer while
 * looking tidier.
 */
export interface HoldingsDeclarationRow {
  readonly id: string;
  readonly memberId: ActorId;
  readonly assetSymbol: AssetSymbol;
  /** The long/spot limb, as `holds` has meant since 0060. */
  readonly holds: boolean;
  /**
   * The short limb (0065). 'not_asked' on every row written before it, truthfully — and
   * 'not_asked' on every row at all while `SHORT_QUESTION_POLICY` asks nothing.
   */
  readonly shortPosition: ShortPositionAnswer;
  readonly declaredAt: Instant;
  readonly renewBy: Instant;
  /** True once a later row supersedes this one. A superseded row is history, not state. */
  readonly superseded: boolean;
  readonly supersedesId: string | null;
  /** The closed enum from `HOLDINGS_AMENDMENT_REASONS`; null on a first declaration. */
  readonly amendmentReason: string | null;
}

/**
 * `GET /v1/marketing/holdings` — one member's own chain, newest first.
 *
 * `registerPresent` false means 0060 has not been applied here; `registerEmpty` means it
 * has and nobody has ever declared anything; `shortLimbMigrated` false means 0065 has
 * not, so no short answer can be recorded at all. THREE DISTINCT ABSENCES, REPORTED AS
 * THEMSELVES — none of them is a zero and none of them is a clean bill of health.
 */
export interface HoldingsChainResponse {
  readonly memberId: ActorId;
  /** False when an approver is reading a colleague. The screen says whose page it is. */
  readonly viewerIsSubject: boolean;
  readonly registerPresent: boolean;
  readonly registerEmpty: boolean;
  readonly shortLimbMigrated: boolean;
  readonly migration: string;
  readonly shortMigration: string;
  /** Newest first, superseded rows included. */
  readonly rows: readonly HoldingsDeclarationRow[];
  readonly shortQuestionPolicy: ShortQuestionPolicy;
  readonly shortQuestionAsked: boolean;
}

/**
 * ONE (member, asset) CELL AS THE GATE SEES IT — the loud NOT DECLARED answer.
 *
 * `state` is the four-value resolution outcome from `loadHoldingsStates`, so a stale
 * declaration arrives here as `not_declared` exactly as the engine reads it, with
 * `stale` true to say WHY. `holds` and `shortPosition` are both null in that case:
 * withheld on purpose, because a stale 'no_short' rendered beside `not_declared` reads
 * as a cleared bearish limb.
 */
export interface HoldingsCellReading {
  readonly memberId: ActorId;
  readonly assetSymbol: AssetSymbol;
  readonly state: HoldingsDeclarationState;
  /** Null unless the state is a live declaration — never a defaulted `false`. */
  readonly holds: boolean | null;
  /** Null when there is no live declaration to read a short answer from. Not 'not_asked'. */
  readonly shortPosition: ShortPositionAnswer | null;
  readonly declaredAt: Instant | null;
  readonly renewBy: Instant | null;
  /** A declaration exists but has passed `renew_by`. The state is `not_declared`. */
  readonly stale: boolean;
  readonly amendments: number;
}

/**
 * `GET /v1/marketing/holdings/cells?symbols=…` — the join the engine performs, run for
 * NAMED symbols so a member can see what would refuse before they draft.
 *
 * This route exists because the chain cannot answer the question that matters. The
 * register knows the assets that WERE declared; it has no universe of assets to
 * subtract from, so it can never list the ones that were not. Naming symbols is what
 * turns silence into a `not_declared` answer somebody can act on.
 */
export interface HoldingsCellsResponse {
  readonly memberId: ActorId;
  readonly registerPresent: boolean;
  readonly registerEmpty: boolean;
  readonly shortLimbMigrated: boolean;
  readonly cells: readonly HoldingsCellReading[];
  /** The symbols whose state is `not_declared` or `register_absent`. The dangerous set. */
  readonly notDeclared: readonly AssetSymbol[];
  readonly shortQuestionPolicy: ShortQuestionPolicy;
  readonly shortQuestionAsked: boolean;
}

/**
 * `GET /v1/marketing/holdings/register` — APPROVER ONLY. Current rows across the desk.
 *
 * The supervision half of the authority model `listHoldings` already enforces: a member
 * reads their own, an approver reads everyone's. Not a second model — the same one read
 * the other way round. It carries no position size and no free text, because neither
 * table holds any.
 *
 * `membersWithNothingDeclared` is the roster minus the members with any current row. It
 * is the one honest census this data supports: it does not claim those members hold
 * nothing, it claims the register has never heard from them.
 */
export interface HoldingsRegisterResponse {
  readonly registerPresent: boolean;
  readonly registerEmpty: boolean;
  readonly shortLimbMigrated: boolean;
  /** Current declarations only, soonest renewal first. The chain is read per member. */
  readonly rows: readonly HoldingsDeclarationRow[];
  readonly membersWithNothingDeclared: readonly ActorId[];
  readonly shortQuestionPolicy: ShortQuestionPolicy;
  readonly shortQuestionAsked: boolean;
}

/* ════════════════════════ §5 THE MIRROR MANIFEST ════════════════════════ */

/**
 * THE KEYS EACH RESPONSE MUST CARRY, as data.
 *
 * The route builds these shapes by hand — it composes JSON, not `HoldingsChainResponse`
 * values — so the compiler does not check them against the interfaces above even now that
 * `apps/api` can name them. A comment asking the two sides to agree would be worth nothing;
 * `apps/api/src/routes/__tests__/marketingHoldings.test.ts` imports THIS constant and asserts
 * the live responses carry exactly these keys. Add a field on one side only and that test
 * fails.
 *
 * SORTED, so the assertion can compare sorted key lists and a reordering of either side
 * is not a failure.
 */
export const HOLDINGS_RESPONSE_KEYS = {
  chain: [
    'memberId', 'migration', 'registerEmpty', 'registerPresent', 'rows', 'shortLimbMigrated',
    'shortMigration', 'shortQuestionAsked', 'shortQuestionPolicy', 'viewerIsSubject',
  ],
  cells: [
    'cells', 'memberId', 'notDeclared', 'registerEmpty', 'registerPresent',
    'shortLimbMigrated', 'shortQuestionAsked', 'shortQuestionPolicy',
  ],
  register: [
    'membersWithNothingDeclared', 'registerEmpty', 'registerPresent', 'rows',
    'shortLimbMigrated', 'shortQuestionAsked', 'shortQuestionPolicy',
  ],
  row: [
    'amendmentReason', 'assetSymbol', 'declaredAt', 'holds', 'id', 'memberId', 'renewBy',
    'shortPosition', 'superseded', 'supersedesId',
  ],
  cell: [
    'amendments', 'assetSymbol', 'declaredAt', 'holds', 'memberId', 'renewBy',
    'shortPosition', 'stale', 'state',
  ],
} as const;

/* ════════════════════ §6 WHAT `abuse.ts` STILL HAS TO DO ════════════════════ */

/**
 * THE NAMED GAP IN `abuse.ts` IS NOT CLOSED BY THIS FILE, and this block is the
 * handover rather than a claim that it is.
 *
 * `abuse.ts:680` records it: "`HoldingsDeclarationEntry.declared` cannot express a
 * SHORT position, so the bearish limb currently only fires where the actor also holds
 * spot." That type is owned by `abuse.ts`, which is not this pass's file. Three
 * changes there, in order, close it:
 *
 *   1. `HoldingsDeclarationEntry` (abuse.ts:248) gains
 *      `readonly shortPosition: ShortPositionAnswer` — REQUIRED, not optional. An
 *      optional field would default to `undefined` at every existing construction
 *      site and a `?? 'no_short'` somewhere downstream is precisely the conflation
 *      this file exists to prevent. Making it required breaks every builder at compile
 *      time, which is the point; each one then has to say what it knows.
 *   2. The Art 91(3)(c) evaluation splits by `OpinionDirection`. For a BULLISH or
 *      undetermined opinion the existing `declared` join is unchanged. For a BEARISH
 *      one it reads `bearishLimbOf(entry.shortPosition)`:
 *        · `disclosure_required` → the conflict disclosure is required in the post,
 *          the same outcome `declared_holding` produces today
 *        · `no_short_declared`   → clears, on that limb only
 *        · `unknown`             → REFUSES on `HOLDINGS_DECLARATION_MISSING`, which is
 *          the existing code and needs no new one. The refusal text should name which
 *          limb is unanswered, and `SHORT_NOT_ASKED_IS_NOT_NO_SHORT` is the sentence.
 *   3. `loadHoldingsRegister` in `apps/api/src/marketing/abuseRegister.ts` already
 *      SELECTs `short_position` (0065) and hands it back on a parallel map keyed by
 *      `holdingsKey`, because it cannot put it on the entry until (1) lands. Once it
 *      has, the map folds into the entry and the parallel structure goes away.
 *
 * UNTIL (1) AND (2) LAND, THE BEARISH LIMB STILL ONLY FIRES ON SPOT. Nothing in this
 * pass changes what `assessMarketAbuse` decides — it makes the fact recordable,
 * readable and refusable, and the engine change is one file and one owner away.
 */

/* ════════════════════ §7 THE TWO THINGS A SURFACE MUST SAY ════════════════════ */

/**
 * THE COVERAGE SENTENCE. The limit most likely to be overstated by a screen that
 * renders a list and stops there.
 */
export const HOLDINGS_COVERAGE_LIMIT =
  'This page lists the assets that were declared. It cannot list the assets that were not: there is no universe of assets to compare against, so absence here is silence — never "holds nothing". Name a symbol to get a NOT DECLARED answer you can rely on.';

/**
 * The bearish limb of a CELL, where `null` means there is no live declaration at all
 * (register absent, never declared, or expired) as distinct from 'not_asked', which
 * means a live declaration whose short question was never put.
 *
 * Both are `unknown`. They are kept apart on the wire because they name different gaps
 * and a refusal has to name the right one; they are collapsed here because the GATE does
 * not care which kind of nothing it is looking at. There is no argument under which
 * either becomes `no_short_declared`.
 */
export function cellBearishLimb(answer: ShortPositionAnswer | null): BearishLimb {
  return answer === null ? 'unknown' : bearishLimbOf(answer);
}

/**
 * The one-line headline for a cell state. `not_declared` is deliberately the loudest
 * string in this module: it is the DANGEROUS state, and the failure mode this surface
 * exists to prevent is a screen rendering it as a tidy empty row.
 */
export const CELL_HEADLINE: Readonly<Record<HoldingsDeclarationState, string>> = {
  register_absent: 'NO REGISTER — nothing can be cleared for this asset',
  not_declared: 'NOT DECLARED — this asset REFUSES until you declare it',
  declared_none: 'Declared: no long position',
  declared_holding: 'Declared: holds long — disclosure required in the post',
};
