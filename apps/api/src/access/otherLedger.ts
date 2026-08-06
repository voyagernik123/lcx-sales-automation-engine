import type pg from 'pg';
import { capAtLeast, type DealStage, type EntitlementMap } from '@lcx/shared';
import { cleanTicker } from '../import/types.js';
import { isMachinePrincipal } from './entitlements.js';
import {
  type BrokeredAnswer,
  type BrokeredQuestion,
  type ProbeResult,
  brokerGate,
  brokerVerdict,
  envFlagIsOn,
} from './verdictBroker.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE OTHER LEDGER — the listing pipeline and the market-abuse register, joined.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE LARGEST UNINSURED LIABILITY ON THIS PLATFORM, and it is uninsured because the
 * control is prose. MiCA Art 88 requires disclosure of inside information to be its
 * own artefact; Art 90(1) prohibits onward disclosure of it; Art 91(3)(c) attaches
 * PERSONAL liability — from roughly EUR 700,000, on the named human, not on the
 * company. The act that triggers all three is small and ordinary: somebody on one
 * desk names an asset in public while another desk is negotiating its listing.
 * Today what stands between those two facts is a free-text paragraph in a policy.
 *
 * THE TWO SIDES ALREADY EXIST AND WERE NEVER CONNECTED:
 *   · THE PIPELINE. `deals.stage` reaching `proposal` is the moment LCX holds
 *     unpublished, price-significant information about an asset. Nothing about that
 *     moment is visible to the marketing perimeter.
 *   · THE REGISTER. `marketing_asset_embargo` (0060) is the perimeter's own record
 *     of which assets carry inside information, and `marketing/outboundGate.ts`
 *     already refuses a draft naming an embargoed asset. It only knows what a human
 *     typed into it.
 *
 * THE JOIN IS `projects.ticker_norm` ↔ `marketing_asset_embargo.asset_symbol`, and
 * it is safe in exactly one direction. VERIFIED, not assumed:
 *   · `asset_symbol` IS CHECK-ENFORCED. `0060_marketing_abuse.sql` declares
 *     `CHECK (asset_symbol = upper(btrim(asset_symbol)) AND length(...) BETWEEN 1
 *     AND 20)`. The brief asked for that claim to be verified before being relied
 *     on; it holds, so 0072 does not add it.
 *   · `projects.ticker_norm` IS NOT. It is documented as `cleanTicker(ticker)`
 *     (`db/schema.ts`) and indexed (`idx_projects_ticker_norm`), but NO constraint
 *     enforces the normalisation. A row holding `sol` is legal, can never equal any
 *     `asset_symbol`, and would make this join return zero rows — which reads as
 *     "this asset is clear". THAT IS THE FAILURE MODE THIS FILE REFUSES RATHER THAN
 *     ANSWERS: `assetSymbolForProject` compares the stored value against its own
 *     normalisation and returns a refusal, and 0072 adds the partial index that
 *     makes "how many such rows exist?" answerable in one scan.
 *
 * `asset_symbol` has NO Drizzle definition in `db/schema.ts` (which another lane
 * owns), so every read and write here is raw SQL through the pool, with the value
 * ALWAYS a bound parameter. There is no string concatenation of a value into a
 * statement anywhere in this file, and `__tests__/otherLedger.test.ts` asserts the
 * symbol appears in `params` and never in the statement text.
 *
 * ══ THE DECISION THAT IS NOT THIS FILE'S ═════════════════════════════════════
 * WHETHER GPS MAY READ THE LISTING PIPELINE, EVEN VERDICT-ONLY, IS THE OWNER'S CALL
 * AND HE HAS NOT MADE IT. So the read half SHIPS DEFAULT-DENY. The mechanism is
 * complete and both states are tested; with the flag off, `askListingPipeline`
 * returns `VERDICT_BROKER_CROSS_READ_NOT_AUTHORISED` — a refusal naming the rule and
 * the variable. NOT a silent empty. NOT a 0. NOT unreachable code either: the tests
 * exercise both states, so the authorised path has been run.
 *
 * FLIPPING IT IS ONE ENVIRONMENT VARIABLE AND HIS DECISION:
 *   GPS_MAY_READ_LISTING_VERDICT=1
 * set in the Render dashboard. Unset or empty closes it again. There is no code
 * change, no deploy and no migration on either side of that switch. The same
 * shape as the two other unresolved-decision gates in this codebase: `lib/env.ts`
 * `secondaryPasscode` (no default, deliberately, because the safe state is off) and
 * `gps/artifact.ts` (inert until the owner answered decision D2).
 */

/* ── The codes ────────────────────────────────────────────────────────────────
 * Stable strings. A dashboard, an alert and a regulator's report key off them.
 */
export const OTHER_LEDGER_CODES = {
  /** No ticker at all. An absence, and absences refuse rather than render blank. */
  TICKER_ABSENT: 'OTHER_LEDGER_TICKER_ABSENT',
  /** A ticker outside the bounds 0060's CHECK will accept. */
  TICKER_UNUSABLE: 'OTHER_LEDGER_TICKER_UNUSABLE',
  /** `projects.ticker_norm` holds a value that is not its own normalisation. */
  TICKER_NOT_NORMALISED: 'OTHER_LEDGER_TICKER_NOT_NORMALISED',
  /** The named project does not exist. Different from "has no ticker". */
  PROJECT_UNKNOWN: 'OTHER_LEDGER_PROJECT_UNKNOWN',
  /** The project id is not a uuid, so it was never put to the database. */
  PROJECT_ID_UNUSABLE: 'OTHER_LEDGER_PROJECT_ID_UNUSABLE',
  /** The register or the projects table could not be read on this database. */
  REGISTER_UNAVAILABLE: 'OTHER_LEDGER_REGISTER_UNAVAILABLE',
  /** The deal id is not a uuid, so no stable idempotency key can be derived. */
  DEAL_ID_UNUSABLE: 'OTHER_LEDGER_DEAL_ID_UNUSABLE',
  /** A machine, a role, or the UNASSIGNED sentinel as the accountable human. */
  SIGNAL_AUTHOR_NOT_HUMAN: 'OTHER_LEDGER_SIGNAL_AUTHOR_NOT_HUMAN',
  /** The minute pointer fails 0060's `source_ref` regex. */
  SOURCE_REF_UNUSABLE: 'OTHER_LEDGER_SOURCE_REF_UNUSABLE',
  /** The review window is outside the range this path will write. */
  REVIEW_WINDOW_UNUSABLE: 'OTHER_LEDGER_REVIEW_WINDOW_UNUSABLE',
  /** The writer does not hold the sales compartment at operate. */
  WRITER_NOT_ENTITLED: 'OTHER_LEDGER_WRITER_NOT_ENTITLED',
  /** The INSERT was absorbed and no cause can be found. Never reported as success. */
  SIGNAL_WRITE_UNCONFIRMED: 'OTHER_LEDGER_SIGNAL_WRITE_UNCONFIRMED',
  /**
   * A DIFFERENT live entry holds this asset, so 0060's one-live-row-per-asset index
   * refuses this deal's own entry — and no retry can ever create it while that entry
   * lives. THIS IS A REFUSAL AND NOT A SUCCESS, which is the whole point of the code:
   * the perimeter is closed by somebody else's row that a named human may lift at any
   * moment, and there would then be no record that this deal ever reached proposal.
   */
  SIGNAL_BLOCKED_BY_LIVE_ENTRY: 'OTHER_LEDGER_SIGNAL_BLOCKED_BY_LIVE_ENTRY',
  /**
   * This deal's own entry exists AND HAS BEEN LIFTED by a named human, so nothing is
   * in force and 0060's `(asset_symbol, event_ref)` index — which includes lifted
   * rows — means it can never be re-entered under this key. A lifted entry is history,
   * not a control, and reporting it as `already_recorded` was the collapse of three
   * states into one.
   */
  SIGNAL_LIFTED_NOT_IN_FORCE: 'OTHER_LEDGER_SIGNAL_LIFTED_NOT_IN_FORCE',
} as const;

export type OtherLedgerCode = (typeof OTHER_LEDGER_CODES)[keyof typeof OTHER_LEDGER_CODES];

export interface OtherLedgerRefusal {
  readonly code: OtherLedgerCode;
  readonly message: string;
  readonly rule: string;
}

const RULE_JOIN_MUST_MATCH =
  'House doctrine: an inference is never laundered into a certainty. The two sides of this '
  + 'join are normalised differently — 0060 CHECK-enforces asset_symbol, nothing enforces '
  + 'projects.ticker_norm — so a value that cannot match is REFUSED rather than queried. A '
  + 'query that cannot match returns zero rows, and on a conflict check zero rows reads as '
  + '"clear". See 0072_verdict_broker.sql for the detector.';

const RULE_ABSENT_REFUSES =
  'House doctrine: absent data refuses. It never renders 0, never an estimate, and never an '
  + 'empty list that reads as "nothing happened".';

const RULE_ACCOUNTABLE_HUMAN =
  '0060_marketing_abuse.sql — marketing_asset_embargo.entered_by is THE ACCOUNTABLE HUMAN: '
  + 'never a service account, never a role, and the UNASSIGNED sentinel is refused explicitly '
  + 'so a compiled placeholder cannot be laundered into a real row.';

const RULE_REGISTER_SHAPE =
  '0060_marketing_abuse.sql — event_ref and source_ref are regex-constrained so no prose (and '
  + 'therefore no inside information) can be written into the reference to it. This file '
  + 'validates against the same expressions before the INSERT, so the refusal names the field '
  + 'instead of surfacing a raw constraint violation.';

const RULE_NEVER_SILENT =
  'House doctrine: absent data refuses, and every refusal is returned — not the first one '
  + 'found (routes/marketingDesk.ts). A market-abuse signal that could not be written must '
  + 'block the act that needed it, never be skipped quietly.';

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE SYMBOL. Both sides of the join, in one place.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * 0060's CHECKs, mirrored as expressions so a refusal can name the field rather
 * than surface a Postgres constraint name to an operator. If 0060 and these ever
 * disagree, 0060 wins and `__tests__/otherLedger.test.ts` is where that shows up.
 */
export const EMBARGO_EVENT_REF_RE = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
export const EMBARGO_SOURCE_REF_RE = /^[a-z0-9][a-z0-9._:/-]{0,119}$/;

/** 0060: `length(asset_symbol) BETWEEN 1 AND 20`. */
const SYMBOL_MAX_LENGTH = 20;

export type SymbolNormalisation =
  | { readonly ok: true; readonly symbol: string }
  | { readonly ok: false; readonly code: OtherLedgerCode; readonly message: string; readonly rule: string };

/**
 * The one normalisation used on BOTH sides. It is `cleanTicker` — the function
 * `projects.ticker_norm` is documented as holding the output of — followed by 0060's
 * length bound. Deliberately NOT a second, local, "better" normalisation: two
 * normalisers in one join is how `SOL` and `sol` become two facts.
 */
export function normaliseAssetSymbol(raw: string | null | undefined): SymbolNormalisation {
  const symbol = cleanTicker(raw ?? undefined);
  if (symbol === undefined || symbol === '') {
    return {
      ok: false,
      code: OTHER_LEDGER_CODES.TICKER_ABSENT,
      message: 'No asset symbol was given, so no question can be asked and no signal can be written. '
        + 'This is an absence and it refuses; it is not an asset that is clear.',
      rule: RULE_ABSENT_REFUSES,
    };
  }
  if (symbol.length > SYMBOL_MAX_LENGTH) {
    return {
      ok: false,
      code: OTHER_LEDGER_CODES.TICKER_UNUSABLE,
      message: `'${symbol.slice(0, SYMBOL_MAX_LENGTH)}…' is ${symbol.length} characters and the register `
        + `accepts 1 to ${SYMBOL_MAX_LENGTH} (0060: a symbol is a symbol, and the bound also means the `
        + 'column cannot hold a sentence). Nothing was queried and nothing was written.',
      rule: RULE_REGISTER_SHAPE,
    };
  }
  /*
   * `cleanTicker` DOES NOT ALWAYS SATISFY 0060'S CHECK, and this is the one place that
   * matters. It is `trim → strip a leading '$' → toUpperCase`, in that order, so
   * `'$ sol'` becomes `' SOL'` — the `$` is removed AFTER the trim and the space it
   * was hiding is never trimmed again. `upper(btrim(' SOL'))` is `'SOL'`, so `' SOL'`
   * fails 0060's CHECK on the write side and can never equal any stored
   * `asset_symbol` on the read side.
   *
   * SO THE POST-CONDITION IS ASSERTED RATHER THAN ASSUMED, and a value that fails it
   * REFUSES. It does not get quietly re-trimmed: a second normalisation here would be
   * the second normaliser this function's own comment forbids, and it would silently
   * disagree with whatever is already stored in `projects.ticker_norm` — where the
   * same `cleanTicker` output is what got written. Fixing the generator is a change to
   * `import/types.ts`, which this pass does not own; see the returned message.
   *
   * NOT ASSERTED: that JS `toUpperCase` and Postgres `upper` agree for every input.
   * They differ for some non-ASCII characters (German ß among them). No ticker in this
   * book is non-ASCII, so the gap is named and not closed.
   */
  if (symbol !== symbol.trim().toUpperCase()) {
    return {
      ok: false,
      code: OTHER_LEDGER_CODES.TICKER_UNUSABLE,
      message: `cleanTicker() produced '${symbol}', which is not equal to upper(btrim(...)) of itself, so `
        + 'it fails the CHECK 0060 puts on marketing_asset_embargo.asset_symbol and can never match a '
        + 'stored symbol. Nothing was queried and nothing was written — a query with this value would '
        + 'return zero rows and zero rows would read as "this asset is clear". The input contained a '
        + '\'$\' followed by whitespace, which cleanTicker strips in the wrong order (apps/api/src/'
        + 'import/types.ts).',
      rule: RULE_JOIN_MUST_MATCH,
    };
  }
  return { ok: true, symbol };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A value that arrived from an HTTP boundary, read as text without throwing.
 *
 * The types on this module's inputs say `string`. The HTTP boundary does not honour
 * them: a missing query parameter or an absent JSON field is `undefined`, and calling
 * `.trim()` on it raises a TypeError — a 500 with no code, out of the module whose
 * entire thesis is that absent data refuses UNDER A STABLE CODE. So every text input
 * is read through here and the existing absence branches produce the right refusal.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export type ProjectSymbolOutcome =
  | { readonly kind: 'symbol'; readonly symbol: string }
  /**
   * The project exists and carries no ticker. An absence, not a miss — AND IT CARRIES
   * A CODE, A MESSAGE AND A RULE like every other refusal in this file. It used to be
   * the bare `{ kind: 'no_ticker' }`: one property, nothing to alert on, nothing to
   * register in ABSENCES.md, and the easiest thing in the world for a conflict check
   * to fall through as "nothing to check, clear". `TICKER_ABSENT` was already written
   * for exactly this case and was not being used on it.
   */
  | {
      readonly kind: 'no_ticker';
      readonly code: typeof OTHER_LEDGER_CODES.TICKER_ABSENT;
      readonly message: string;
      readonly rule: string;
    }
  | { readonly kind: 'refused'; readonly code: OtherLedgerCode; readonly message: string; readonly rule: string };

const NO_TICKER: ProjectSymbolOutcome = {
  kind: 'no_ticker',
  code: OTHER_LEDGER_CODES.TICKER_ABSENT,
  message: 'This project exists and carries no ticker at all, so there is no symbol to put to the '
    + 'market-abuse register and NOTHING HAS BEEN ESTABLISHED about whether the asset behind it is '
    + 'restricted. This is an absence and it refuses. It is not a project whose asset is clear, and a '
    + 'caller that treats it as one has turned a missing input into a clean answer.',
  rule: RULE_ABSENT_REFUSES,
};

/**
 * Resolve a project to the symbol the register would be keyed by.
 *
 * THE REFUSAL IN THE MIDDLE OF THIS FUNCTION IS THE POINT OF THE FUNCTION. A stored
 * `ticker_norm` that is not its own normalisation is not a cosmetic problem: it is a
 * value that CANNOT match a CHECK-normalised `asset_symbol`, so the join silently
 * returns nothing and the conflict check reads clean. Refusing means a human sees
 * `OTHER_LEDGER_TICKER_NOT_NORMALISED` and fixes the row; answering would mean
 * nobody ever learns.
 *
 * THE ID IS VALIDATED BEFORE THE QUERY, and the reason is a refusal that used to state
 * a falsehood. `projects.id` is a uuid, so a non-uuid reaches `WHERE id = $1`, Postgres
 * raises 22P02, and the blanket catch below reported `REGISTER_UNAVAILABLE` — "The
 * projects table could not be read". THAT SENTENCE WAS NOT TRUE: the table read fine
 * and the input was bad. It also collapsed bad-input into not-loaded, so an operator
 * chasing a migration problem was chasing a typo while a real REGISTER_UNAVAILABLE was
 * indistinguishable from one. The write path already validated its `dealId` this way;
 * the read path did not.
 */
export async function assetSymbolForProject(pool: pg.Pool, projectId: string): Promise<ProjectSymbolOutcome> {
  const id = asText(projectId).trim();
  if (!UUID_RE.test(id)) {
    return {
      kind: 'refused',
      code: OTHER_LEDGER_CODES.PROJECT_ID_UNUSABLE,
      message: `'${id.slice(0, 64)}' is not a uuid, and projects.id is one, so this was NOT put to the `
        + 'database — a malformed id would raise 22P02 and be reported as a table that could not be '
        + 'read, which is a false statement about the database and hides the real fault. Nothing has '
        + 'been established about any embargo.',
      rule: RULE_ABSENT_REFUSES,
    };
  }

  let stored: string | null;
  try {
    const { rows } = await pool.query<{ ticker_norm: string | null }>(
      `SELECT ticker_norm FROM projects WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return {
        kind: 'refused',
        code: OTHER_LEDGER_CODES.PROJECT_UNKNOWN,
        message: 'No project with that id exists on this database, so nothing can be said about its '
          + 'asset. This is not the same as a project with no ticker, and it is not "clear".',
        rule: RULE_ABSENT_REFUSES,
      };
    }
    stored = rows[0]?.ticker_norm ?? null;
  } catch {
    return {
      kind: 'refused',
      code: OTHER_LEDGER_CODES.REGISTER_UNAVAILABLE,
      message: 'The projects table could not be read, so the asset behind this deal is unknown. '
        + 'NOT-LOADED, not empty: nothing has been established about any embargo.',
      rule: RULE_ABSENT_REFUSES,
    };
  }

  if (stored === null || stored.trim() === '') return NO_TICKER;

  const normalised = normaliseAssetSymbol(stored);
  if (!normalised.ok) {
    return { kind: 'refused', code: normalised.code, message: normalised.message, rule: normalised.rule };
  }
  if (normalised.symbol !== stored) {
    return {
      kind: 'refused',
      code: OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED,
      message: `projects.ticker_norm holds a value that is not its own normalisation, so it can never `
        + `equal a marketing_asset_embargo.asset_symbol — that column is CHECK-enforced to `
        + `upper(btrim(...)) by 0060. Querying with it would return zero rows and zero rows would read `
        + `as "this asset is clear". The row must be re-normalised (cleanTicker) before this join can be `
        + `trusted; 0072_verdict_broker.sql adds the partial index that lists every such row in one scan.`,
      rule: RULE_JOIN_MUST_MATCH,
    };
  }
  return { kind: 'symbol', symbol: normalised.symbol };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  DIRECTION (a) — GPS LEARNS THAT AN ASSET IS IN THE LISTING PIPELINE.
 *  VERDICT ONLY. DEFAULT-DENY.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The one variable that authorises the read. See the file header: the owner's call. */
export const GPS_LISTING_VERDICT_ENV = 'GPS_MAY_READ_LISTING_VERDICT';

/**
 * WHAT MAY CROSS THE BOUNDARY, and it is one word and a count.
 *
 *   restricted          a live entry is in force, inside its window, and its recorded
 *                       state is `mnpi_pending`: unpublished price-significant
 *                       information exists. The asset may not be named and no
 *                       engagement may reference it without the marketing desk.
 *   conditional         a live entry is in force and inside its window, and it is NOT
 *                       `mnpi_pending` — it is `announced` or `exempt_offer`. Neither
 *                       is a hard block and NEITHER IS A FREE HAND. 0060: an
 *                       `announced` asset still requires the marketing to be a
 *                       SEPARATE artefact from the disclosure (Art 88(1)), and an
 *                       `exempt_offer` sits under an Art 4(2)/(3) exemption that Art
 *                       4(4) can destroy with one sentence in one post — which
 *                       `packages/shared/src/marketing/abuse.ts:1155` raises as a
 *                       violation rather than clearing. So: route it through the
 *                       marketing desk, do not treat it as clear.
 *   clear_on_record     a live entry is in force, inside its window, and every such
 *                       entry records `clear` — "publicly announced, or never inside
 *                       information" (0060). THIS IS THE DESK'S RECORDED POSITION WITH
 *                       A REVIEW DATE ON IT, not a permission and not the absence of a
 *                       restriction. It is a distinct verdict from `empty` precisely
 *                       because somebody looked at this asset and wrote that down.
 *   stale_unresolved    a live entry exists and is PAST its review_by or its declared
 *                       window. 0060 is explicit that this is not a lift — "an embargo
 *                       is not lifted by the calendar; it is lifted by a named human" —
 *                       so the state is UNKNOWN, and unknown refuses. Reported
 *                       separately so a reader can tell an active decision from a
 *                       lapsed one and chase the right human.
 *   history_only        the register holds entries about this asset and none is live.
 *                       There is no restriction in force. Kept distinct from a genuine
 *                       absence because they are different facts and only one of them
 *                       means "we have never had inside information about this".
 *
 * ══ WHY THE VERDICT READS `state` AT ALL, WHICH IT DID NOT ═══════════════════
 * The first version of this file derived `restricted` from the mere EXISTENCE of a
 * live, in-window row. 0060 allows four states and THREE of them are not a block:
 * `clear`, `announced` and `exempt_offer`. So every asset the desk had ever marked
 * `clear` — the register's own way of saying the asset CAN be named — was published
 * across the boundary as "the asset may not be named". That is an inference from row
 * existence stated as a certainty about a restriction, i.e. the one thing the house
 * doctrine names. The register's own loader never did it: `abuseRegister.ts:445` maps
 * a live, fresh row to `row.state`, not to a constant.
 *
 * WHAT DELIBERATELY DOES NOT CROSS: the state STRING itself, the event slug, the
 * minute pointer, the window, the review date, and the name of the human who entered
 * it. The verdict is a projection onto WHAT THE ASKER MUST DO, and it is coarser than
 * the state on purpose — `conditional` deliberately does not say which of the two
 * non-blocking-but-not-clear states produced it. Anything finer would be the onward
 * disclosure Art 90(1) prohibits, which is the finding `routes/audit.ts` records from
 * the other side, where the SYMBOL in `entity_id` was itself the disclosure. And note
 * which distinction the shared engine already treats as non-secret:
 * `abuse.ts embargoStateIsWithholdable()` says only `mnpi_pending` and `unknown` are
 * withholdable — `clear`, `announced` and `exempt_offer` are not.
 */
export type ListingPipelineVerdict =
  | 'restricted'
  | 'conditional'
  | 'clear_on_record'
  | 'stale_unresolved'
  | 'history_only';

export interface RegisterCounts {
  /**
   * Does `marketing_asset_embargo` hold ANY row at all, for any asset?
   *
   * NOT DERIVED FROM `total`, and that is the point of it existing. See
   * `verdictFromRegisterCounts`.
   */
  readonly registerPopulated: boolean;
  readonly total: number;
  readonly live: number;
  readonly liveFresh: number;
  /** Of the live, in-window entries: how many record `mnpi_pending`. */
  readonly liveFreshMnpi: number;
  /** Of the live, in-window entries: how many record `announced` or `exempt_offer`. */
  readonly liveFreshConditional: number;
  /** Of the live, in-window entries: how many record `clear`. */
  readonly liveFreshClear: number;
}

/**
 * Counts → verdict. Separated from the query so the interpretation is testable
 * without a database, because the interesting cases are the incoherent ones.
 *
 * ══ AN UNPOPULATED REGISTER IS NOT-LOADED, NOT A GENUINE ABSENCE ═════════════
 * FIRST, before anything is counted. `total === 0` used to map straight to `none`,
 * which the broker turns into `empty` — a labelled, frame-carrying, environment-
 * stamped ZERO whose message says "This is a genuine absence". On an
 * ENTIRELY UNPOPULATED register that sentence is false, and 0060 SEEDS NOTHING, so
 * on the current production database it was the default answer for every asset: the
 * exact false clean this module was built to prevent, shipped with an ObservationFrame
 * on it.
 *
 * The file that owns the table already had the right answer and this one did not
 * copy it: `marketing/abuseRegister.ts:399-410` runs `SELECT EXISTS (SELECT 1 FROM
 * marketing_asset_embargo)` FIRST and refuses with `cause: 'register_empty'`,
 * commented "AN EMPTY REGISTER REFUSES AND SAYS IT IS EMPTY. It is not evidence that
 * nothing is under embargo — nobody has told this table anything yet". There is now
 * one answer to that question in the codebase instead of two.
 *
 * A populated register with `total === 0` for THIS symbol IS a genuine absence, and
 * that is why the two facts are carried separately and never derived from each other.
 *
 * ══ INCOHERENT COUNTS ARE `unavailable`, NOT A GUESS ═════════════════════════
 * `live > total` and `liveFresh > live` are impossible for the query below; if they
 * arrive, the query and this function disagree about what they are counting and
 * neither number can be reported. So is a state partition that does not add up: the
 * three `liveFresh*` buckets cover exactly 0060's four legal states, so if their sum
 * is not `liveFresh` then a state exists that this function has never heard of — and
 * silently bucketing an unknown inside-information state is how a fifth state added
 * to 0060 in a year's time would quietly read as `clear_on_record`.
 *
 * The broker turns `unavailable` into NOT-LOADED, which is the honest answer — the
 * tempting alternatives (clamp, or fall through to `none`) both end in a conflict
 * check reading clean.
 */
export function verdictFromRegisterCounts(counts: RegisterCounts): ProbeResult<ListingPipelineVerdict> {
  const { registerPopulated, total, live, liveFresh, liveFreshMnpi, liveFreshConditional, liveFreshClear } = counts;

  const sane = [total, live, liveFresh, liveFreshMnpi, liveFreshConditional, liveFreshClear]
    .every((n) => Number.isInteger(n) && n >= 0);
  if (!sane || live > total || liveFresh > live) {
    return { kind: 'unavailable', detail: 'register counts are mutually inconsistent' };
  }
  if (liveFreshMnpi + liveFreshConditional + liveFreshClear !== liveFresh) {
    return {
      kind: 'unavailable',
      detail: 'the recorded states of the live entries do not partition into the states 0060 declares',
    };
  }

  if (!registerPopulated) {
    return { kind: 'unavailable', detail: 'register_empty' };
  }

  if (total === 0) return { kind: 'none' };
  if (liveFreshMnpi > 0) return { kind: 'holding', verdict: 'restricted', withheldCount: total };
  if (liveFreshConditional > 0) return { kind: 'holding', verdict: 'conditional', withheldCount: total };
  if (liveFreshClear > 0) return { kind: 'holding', verdict: 'clear_on_record', withheldCount: total };
  if (live > 0) return { kind: 'holding', verdict: 'stale_unresolved', withheldCount: total };
  return { kind: 'holding', verdict: 'history_only', withheldCount: total };
}

/**
 * SEVEN AGGREGATES, ONE STATEMENT, NO ROWS.
 *
 * It returns counts and not rows on purpose: a `SELECT *` here would pull the event
 * slug and the minute pointer into this process, and the only thing standing between
 * that and a response would then be a mapping function nobody edits carefully. The
 * statement cannot leak what it never selects — including the state STRING, which is
 * counted per bucket and never returned.
 *
 * `register_populated` IS AN UNCORRELATED SUBQUERY over the whole table and not a
 * function of the `WHERE` clause, because "nobody has told this table anything" and
 * "nothing is recorded about SOL" are different facts and the second is only
 * meaningful once the first is false. Same shape as `abuseRegister.ts:399`.
 *
 * The state buckets are LITERALS IN THE STATEMENT, matched against 0060's own CHECK
 * list. `announced` and `exempt_offer` share a bucket because they share a verdict.
 *
 * The staleness test is done IN SQL against `now()` rather than in JavaScript against
 * a clock this process holds, so the answer cannot drift with a caller's `Date`.
 * Served by `marketing_asset_embargo_history_idx` (asset_symbol, entered_at DESC),
 * which 0060 already declares — 0072 adds no index here.
 */
const LIVE_AND_FRESH = `lifted_at IS NULL
             AND review_by > now()
             AND (embargoed_until IS NULL OR embargoed_until > now())`;

const REGISTER_COUNT_SQL = `
  SELECT EXISTS (SELECT 1 FROM marketing_asset_embargo) AS register_populated,
         count(*)::int AS total,
         count(*) FILTER (WHERE lifted_at IS NULL)::int AS live,
         count(*) FILTER (WHERE ${LIVE_AND_FRESH})::int AS live_fresh,
         count(*) FILTER (
           WHERE ${LIVE_AND_FRESH}
             AND state = 'mnpi_pending'
         )::int AS live_fresh_mnpi,
         count(*) FILTER (
           WHERE ${LIVE_AND_FRESH}
             AND state IN ('announced', 'exempt_offer')
         )::int AS live_fresh_conditional,
         count(*) FILTER (
           WHERE ${LIVE_AND_FRESH}
             AND state = 'clear'
         )::int AS live_fresh_clear
    FROM marketing_asset_embargo
   WHERE asset_symbol = $1`;

export const LISTING_PIPELINE_QUESTION: BrokeredQuestion<ListingPipelineVerdict> = {
  id: 'gps.asks.marketing.asset_in_listing_perimeter',
  asker: 'gps',
  holder: 'marketing',
  holderTable: 'marketing_asset_embargo',
  rule:
    'MiCA Art 90(1) prohibits onward disclosure of inside information, and Art 91(3)(c) attaches '
    + 'personal liability to the breach. So the perimeter answers WHETHER an asset is restricted and '
    + 'never WHY: the substance stays in the compartment that decided it (0060 — this register '
    + 'records the POINTER, not the reason). Art 88(1) is the reason a lifted-but-announced asset is '
    + 'still not a free hand.',
  authorisationEnvVar: GPS_LISTING_VERDICT_ENV,
  authorised: () => envFlagIsOn(GPS_LISTING_VERDICT_ENV),
  captures: 'whether LCX MARKETING\'s asset register holds any entry for this symbol, whether one is '
    + 'live and inside its window, and how many entries are being withheld.',
  doesNotCapture: [
    'the recorded state of any entry',
    'which event the entry is about (event_ref)',
    'where the decision is minuted (source_ref)',
    'who entered or lifted it, and when',
    'the embargo window and the review date',
    'anything about assets other than the one asked about',
  ],
  normaliseSubject: (raw) => {
    const out = normaliseAssetSymbol(raw);
    return out.ok
      ? { ok: true, subject: out.symbol }
      : { ok: false, detail: `${out.code}: ${out.message}` };
  },
  probe: async (pool, subject) => {
    interface CountRow {
      register_populated: boolean;
      total: number;
      live: number;
      live_fresh: number;
      live_fresh_mnpi: number;
      live_fresh_conditional: number;
      live_fresh_clear: number;
    }
    let row: CountRow | undefined;
    try {
      const res = await pool.query<CountRow>(REGISTER_COUNT_SQL, [subject]);
      row = res.rows[0];
    } catch (err) {
      // Logged HERE and not returned: a Postgres error can quote a column, a
      // constraint or a value, and all three belong to the other compartment.
      console.warn('[access.otherLedger] register probe failed:', (err as { code?: string })?.code ?? err);
      return { kind: 'unavailable', detail: 'register read failed' };
    }
    if (!row) {
      // An aggregate always returns one row. If it did not, we did not observe zero.
      return { kind: 'unavailable', detail: 'aggregate returned no row' };
    }
    const out = verdictFromRegisterCounts({
      registerPopulated: row.register_populated === true,
      total: row.total,
      live: row.live,
      liveFresh: row.live_fresh,
      liveFreshMnpi: row.live_fresh_mnpi,
      liveFreshConditional: row.live_fresh_conditional,
      liveFreshClear: row.live_fresh_clear,
    });
    if (out.kind === 'unavailable') {
      /* WHY THIS IS LOGGED AND NOT RETURNED. The broker deliberately does not carry a
       * probe's `detail` onto the answer, so `register_empty` and "the relation is not
       * migrated" and "the read failed" are one NOT-LOADED answer to the asker — which
       * is correct, they are all "we did not establish anything". But they are three
       * different JOBS for three different people, so the distinction is written where
       * an operator can act on it. `abuseRegister.ts` makes the same split
       * (`registerPresent` / `registerEmpty` are carried separately behind one code). */
      console.warn('[access.otherLedger] register probe unavailable:', out.detail);
    }
    return out;
  },
};

/**
 * GPS's conflict check asks whether an asset sits inside the listing perimeter.
 *
 * WITH THE FLAG OFF THIS IS A REFUSAL, and that refusal is the correct output of an
 * unmade decision — not a defect and not a placeholder. A caller must treat
 * `not_loaded` as "unknown, ask a human", never as "clear". The three states are
 * distinguishable at the JSON boundary by construction: `not_loaded` has no
 * `withheldCount` property at all.
 */
export function askListingPipeline(
  pool: pg.Pool,
  asking: { readonly entitlements: EntitlementMap; readonly symbol: string },
): Promise<BrokeredAnswer<ListingPipelineVerdict>> {
  return brokerVerdict(pool, LISTING_PIPELINE_QUESTION, {
    entitlements: asking.entitlements,
    subject: asking.symbol,
  });
}

export type ProjectListingAnswer =
  | { readonly kind: 'answer'; readonly answer: BrokeredAnswer<ListingPipelineVerdict> }
  | {
      readonly kind: 'no_ticker';
      readonly code: typeof OTHER_LEDGER_CODES.TICKER_ABSENT;
      readonly message: string;
      readonly rule: string;
    }
  | { readonly kind: 'refused'; readonly refusal: OtherLedgerRefusal };

/**
 * The same question asked about a deal's project. Refuses on a denormalised row.
 *
 * ══ THE GATE RUNS FIRST HERE TOO, WHICH IT DID NOT ═══════════════════════════
 * This entry point has to resolve a symbol from `projects` before it can ask the
 * question, and it used to do that FIRST — so a principal holding ZERO compartments,
 * with the cross-read flag off, still got a three-way oracle on the projects table:
 * whether the id exists (`PROJECT_UNKNOWN`), whether it has a ticker (`no_ticker`),
 * and whether its `ticker_norm` is denormalised (`TICKER_NOT_NORMALISED`). One query
 * ran and one fact about another compartment's object came back. The module's central
 * claim — "entitlement is decided BEFORE any query" — was true of `brokerVerdict` and
 * false of this function, which is worse than not making the claim.
 *
 * `brokerGate` is now called before `assetSymbolForProject`, so BOTH entry points
 * apply the same two gates in the same order and the refusal an unentitled caller
 * gets is the broker's own `not_loaded` answer with nothing read.
 */
export async function askListingPipelineForProject(
  pool: pg.Pool,
  asking: { readonly entitlements: EntitlementMap; readonly projectId: string },
): Promise<ProjectListingAnswer> {
  const gated = brokerGate(LISTING_PIPELINE_QUESTION, asking.entitlements);
  if (gated) return { kind: 'answer', answer: gated };

  const resolved = await assetSymbolForProject(pool, asking.projectId);
  if (resolved.kind === 'no_ticker') return resolved;
  if (resolved.kind === 'refused') {
    return {
      kind: 'refused',
      refusal: { code: resolved.code, message: resolved.message, rule: resolved.rule },
    };
  }
  return {
    kind: 'answer',
    answer: await askListingPipeline(pool, {
      entitlements: asking.entitlements,
      symbol: resolved.symbol,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  DIRECTION (b) — A DEAL REACHING `proposal` WRITES THE EMBARGO SIGNAL.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * WHICH STAGES COUNT AS HAVING REACHED PROPOSAL, listed rather than ordered.
 *
 * `STAGE_ORDER` in `packages/shared/src/deals/index.ts:93` gives `lost` THE SAME RANK
 * AS `won` (both 5). So the obvious implementation — "order(to) >= order(proposal)"
 * — would have written an MNPI signal for every deal that died in discovery, i.e.
 * embargoed an asset because a conversation ended. That is not a hypothetical: it is
 * what that table says, and it is why this is a list.
 *
 * (`STAGE_ORDER` is module-PRIVATE — `const STAGE_ORDER`, no `export`, referenced only
 * by `stageAdvanced` in the same file. An earlier draft of this comment called it
 * exported. It is not, which is why this file duplicates the list rather than
 * importing the ranking and inverting it.)
 *
 * A deal that reached proposal and later goes to `lost` is already signalled; the
 * signal is lifted by a named human at the register, not by a stage change.
 */
const STAGES_AT_OR_PAST_PROPOSAL: readonly DealStage[] = ['proposal', 'negotiating', 'won'];

/**
 * Did this transition REACH proposal — i.e. cross into the region where LCX holds
 * unpublished price-significant information about the asset? A move WITHIN that
 * region is not a crossing, which is what makes the write idempotent at the source
 * as well as at the database.
 */
export function reachesProposal(from: DealStage, to: DealStage): boolean {
  return STAGES_AT_OR_PAST_PROPOSAL.includes(to) && !STAGES_AT_OR_PAST_PROPOSAL.includes(from);
}

/**
 * The idempotency key. `(asset_symbol, event_ref)` is UNIQUE in 0060 specifically so
 * that a retried write collides instead of forging a second history, and this derives
 * the same key from the same deal every time.
 *
 * IT CONTAINS THE DEAL ID AND NOTHING ELSE. 0060's regex forbids spaces so that prose
 * — and therefore inside information — cannot be written into the reference to it;
 * a deal id is an opaque internal key and satisfies that in substance as well as in
 * form. The caller's `dealId` is validated as a uuid before it reaches here.
 */
export function proposalSignalEventRef(dealId: string): string {
  return `deal-proposal:${dealId.toLowerCase()}`;
}

/** 0060 refuses this sentinel explicitly so a compiled placeholder cannot become a row. */
const UNASSIGNED = 'UNASSIGNED';

export interface ProposalSignalInput {
  readonly entitlements: EntitlementMap;
  readonly dealId: string;
  /** Raw. Normalised here; both sides of the join use one normaliser. */
  readonly ticker: string | null;
  /** The accountable human who moved the deal. Never a machine, never a role. */
  readonly enteredBy: string;
  /** Where the act is minuted. A POINTER — 0060 forbids prose in this field. */
  readonly sourceRef: string;
  /** Days until a human must look again. 0060 makes review_by NOT NULL for a reason. */
  readonly reviewInDays: number;
}

/**
 * THREE OUTCOMES AND NO FOURTH, and the count went DOWN by one on purpose.
 *
 * `recorded` and `already_recorded` are the only non-refusals, and BOTH of them mean
 * THIS DEAL'S OWN ENTRY IS IN THE REGISTER AND LIVE. Everything else is a refusal, so
 * a caller in `routes/deals.ts` that stops on `refused` cannot advance a deal on a
 * control that is not in force.
 *
 * WHAT USED TO BE HERE AND WHY IT WENT. `already_restricted` was an ok-shaped outcome
 * meaning "a DIFFERENT live entry holds this asset". 0060's
 * `marketing_asset_embargo_live_idx` is UNIQUE on `(asset_symbol) WHERE lifted_at IS
 * NULL`, so in that situation this deal's own row was NOT written and CANNOT be written
 * while the other entry lives — no retry, ever. A caller reading it as success would
 * let the deal advance behind somebody else's row, which a named human may lift at any
 * time (that is what lifts are for), leaving the asset unprotected and NO record that
 * any deal ever reached proposal on it. It is now `SIGNAL_BLOCKED_BY_LIVE_ENTRY`, a
 * refusal, so the stage change stops and a human resolves it.
 *
 * And `already_recorded` used to be returned for a row with this deal's `event_ref`
 * WHETHER OR NOT IT HAD BEEN LIFTED, because the cause was counted with no
 * `lifted_at IS NULL` filter while 0060's `(asset_symbol, event_ref)` index includes
 * lifted rows. So once a human lifted this deal's own entry, every later call said
 * "This exact signal was already recorded" while nothing at all was in force — three
 * states (live / lifted, asset open / absent) collapsed into one non-refusal. The
 * lifted case is now `SIGNAL_LIFTED_NOT_IN_FORCE`, also a refusal.
 */
export type ProposalSignalOutcome =
  | {
      readonly kind: 'recorded';
      readonly assetSymbol: string;
      readonly eventRef: string;
      readonly id: string;
      readonly reviewBy: string | null;
    }
  /**
   * This exact signal was already recorded AND IS LIVE. The idempotent repeat, and the
   * liveness is OBSERVED on the row rather than inferred from a count.
   */
  | { readonly kind: 'already_recorded'; readonly assetSymbol: string; readonly eventRef: string }
  | { readonly kind: 'refused'; readonly refusals: readonly OtherLedgerRefusal[] };

/**
 * A deal reaching `proposal` writes the embargo signal.
 *
 * WHY `mnpi_pending` AND NOT A SOFTER STATE. A listing proposal is unpublished,
 * price-significant information about the asset by construction; 0060's own
 * vocabulary calls that `mnpi_pending` and makes it a hard block. It is a literal in
 * the statement rather than a caller argument, because a caller-chosen state is a
 * caller-chosen exemption. A desk that disagrees lifts the entry at the register,
 * with a name against the lift — which is exactly the record that has been missing.
 *
 * WHAT THIS WRITE IS NOT. It is NOT the marketing desk's governed embargo entry.
 * `marketing_embargo_enter` requires an approver and lands an `object_actions` row;
 * this path has neither, because it is triggered by a sales act and no governed
 * action may be registered from this file (`actions/registry.ts` merges a fixed list
 * and THROWS on collision — the same limit `gps/artifact.ts` and
 * `gps/deliveryDesk.ts` record). The consequence is precise and is not hidden: a
 * signal written here appears in the register and in `marketing_asset_embargo`'s own
 * history, and NOT in the governed action ledger or the generated command grammar.
 * Closing that is a `sales.deal.listing_signal` entry in the action registry, which
 * is another lane's file.
 *
 * THE SIDE EFFECT WORTH STATING PLAINLY: a row written here makes
 * `marketing/outboundGate.ts` refuse drafts naming that asset. So a sales operator
 * moving a deal now closes a marketing perimeter. That direction is deliberate — it
 * fails toward silence rather than toward a market-abuse breach — but it is a new way
 * for one desk to block another and the desk should know it exists before it fires.
 *
 * AND THE FAILURE MODE THAT IS NOT CLOSED HERE: if this returns `refused`, the caller
 * MUST refuse the stage transition too. A swallowed refusal means the deal advances
 * with no signal, which is the uncontrolled state. This function cannot enforce that
 * — the call site is `routes/deals.ts`, which this pass does not own — so it is
 * stated on the type (`refused` is not an `ok` variant with a warning) and recorded
 * as an open item.
 *
 * EVERY REFUSAL IS RETURNED, not the first one found, and NOTHING is written while
 * any input is refused. The house pattern (`routes/marketingDesk.ts`), and here it
 * also means an operator fixes one form instead of six.
 */
export async function recordProposalListingSignal(
  pool: pg.Pool,
  input: ProposalSignalInput,
): Promise<ProposalSignalOutcome> {
  const refusals: OtherLedgerRefusal[] = [];
  const add = (code: OtherLedgerCode, message: string, rule: string) => {
    if (!refusals.some((r) => r.code === code)) refusals.push({ code, message, rule });
  };

  /* The writer is inside `sales`, at operate. NOT `marketing`: requiring the holding
   * compartment would mean only the marketing desk could record a sales act, which is
   * the arrangement that left this control as prose in the first place. */
  if (!capAtLeast(input.entitlements.sales, 'operate')) {
    add(
      OTHER_LEDGER_CODES.WRITER_NOT_ENTITLED,
      'Recording a listing signal is a sales act and requires the sales compartment at operate or '
        + 'above. Nothing was written.',
      RULE_NEVER_SILENT,
    );
  }

  const dealId = asText(input.dealId).trim();
  if (!UUID_RE.test(dealId)) {
    add(
      OTHER_LEDGER_CODES.DEAL_ID_UNUSABLE,
      'The deal id is not a uuid, so no stable idempotency key can be derived from it — and without '
        + 'one a retry would forge a second entry in a register that is history.',
      RULE_REGISTER_SHAPE,
    );
  }

  const symbol = normaliseAssetSymbol(input.ticker);
  if (!symbol.ok) add(symbol.code, symbol.message, symbol.rule);

  const author = asText(input.enteredBy).trim();
  /*
   * THE MACHINE CHECK CASE-FOLDS, WHICH IT DID NOT. The UNASSIGNED test was already
   * `toUpperCase()`d and the machine test was not, so `author` went to
   * `isMachinePrincipal` verbatim against an exact-match allowlist of `['operator',
   * 'ai']` plus `/^monitor:/`. `'Operator'`, `'OPERATOR'`, `'AI'` and `'Monitor:x'`
   * were therefore ACCEPTED as the accountable human on a market-abuse signal, while
   * the refusal message below claims the opposite in plain words. `middleware/auth.ts`
   * mints lowercase ids so this was not reachable through the front door today, but a
   * refusal that states more than the code does is a defect on its own terms, and this
   * is the one field 0060 calls THE ACCOUNTABLE HUMAN.
   */
  if (author === '' || author.toUpperCase() === UNASSIGNED || isMachinePrincipal(author.toLowerCase())) {
    /* `ext:<local-part>` IS accepted: a colleague on the second-tier passcode is a
     * name, and a signal entered by a named colleague is strictly better than none.
     * The shared machine key, `ai` and `monitor:<id>` are not names — 0060 refuses an
     * unattributable market-abuse decision on its face, and a deal moved by a machine
     * should stop and wait for a human rather than embargo an asset anonymously. */
    add(
      OTHER_LEDGER_CODES.SIGNAL_AUTHOR_NOT_HUMAN,
      'A market-abuse signal needs an accountable human. A machine principal (the shared operator '
        + 'key, `ai`, `monitor:<id>`), a blank, or the UNASSIGNED sentinel is refused, and the deal '
        + 'must not advance until a named person moves it.',
      RULE_ACCOUNTABLE_HUMAN,
    );
  }

  if (!EMBARGO_SOURCE_REF_RE.test(asText(input.sourceRef))) {
    add(
      OTHER_LEDGER_CODES.SOURCE_REF_UNUSABLE,
      'source_ref must be a lowercase slug pointer matching 0060\'s expression — no spaces, so the '
        + 'inside information cannot be written into the reference to itself.',
      RULE_REGISTER_SHAPE,
    );
  }

  if (!Number.isInteger(input.reviewInDays) || input.reviewInDays < 1 || input.reviewInDays > 90) {
    add(
      OTHER_LEDGER_CODES.REVIEW_WINDOW_UNUSABLE,
      'reviewInDays must be a whole number of days between 1 and 90. 0 would write a review date at '
        + 'the instant of entry, which is an entry that is stale on arrival; beyond 90 days is an '
        + 'embargo nobody re-examines, which 0060 treats as no state at all.',
      RULE_REGISTER_SHAPE,
    );
  }

  if (refusals.length > 0 || !symbol.ok) return { kind: 'refused', refusals };

  const eventRef = proposalSignalEventRef(dealId);
  /* Belt and braces: the derived key is checked against 0060's own regex rather than
   * trusted because it was derived. A uuid always passes; a future change to the
   * prefix that does not would fail here instead of at the constraint. */
  if (!EMBARGO_EVENT_REF_RE.test(eventRef)) {
    return {
      kind: 'refused',
      refusals: [{
        code: OTHER_LEDGER_CODES.DEAL_ID_UNUSABLE,
        message: `The derived event_ref '${eventRef}' does not satisfy 0060's expression, so the write `
          + 'was not attempted.',
        rule: RULE_REGISTER_SHAPE,
      }],
    };
  }

  try {
    /*
     * NO `ON CONFLICT` CLAUSE. THE COLLISION RAISES AND IS CAUGHT.
     *
     * The first version used untargeted `ON CONFLICT DO NOTHING` and then named the
     * cause from two COUNTs. That is a PROHIBITION in the file that owns this table, in
     * writing, with the incident attached — `marketing/abuseRegister.ts:1190-1198`:
     * "NO `ON CONFLICT DO NOTHING` ANYWHERE IN THIS FILE. `service.ts:130` uses it for
     * reply ingest and plan §1 defect 7 records what that cost: a pre-claimed id
     * silently destroyed a real reply, and the count called it a duplicate." Absorbing
     * a write and then inferring what happened from counts is exactly that mechanism,
     * and defects 4 and 5 of this lane's review were its direct consequences: two of
     * four outcomes reported a control that was not in force.
     *
     * `enterEmbargo` (abuseRegister.ts:1232-1249) is the sanctioned pattern and it is
     * forty lines below the prohibition: let 23505 raise, then read `err.constraint`.
     * The cause is then OBSERVED.
     *
     * WHY A ROW READ AS WELL AS THE CONSTRAINT NAME. 0060 declares two unique indexes
     * this INSERT can violate:
     *   · marketing_asset_embargo_event_idx  (asset_symbol, event_ref) — includes
     *     LIFTED rows, so it fires for this deal's own entry whether or not it is live
     *   · marketing_asset_embargo_live_idx   (asset_symbol) WHERE lifted_at IS NULL
     * A repeat write on a live entry of our own violates BOTH, and Postgres reports
     * only whichever index it checked first — so the constraint name alone cannot tell
     * `already_recorded` from `SIGNAL_BLOCKED_BY_LIVE_ENTRY`. `explainSignalCollision`
     * reads THE ONE ROW keyed by (asset_symbol, event_ref) and asks whether it exists
     * and whether it is live. That is an observation about a specific row, not a count
     * over a set, and it distinguishes all three cases with certainty. The constraint
     * name is carried into the message because it says which rule the database applied.
     */
    const res = await pool.query<{ id: string; review_by: Date | string | null }>(
      `INSERT INTO marketing_asset_embargo
         (asset_symbol, event_ref, state, source_ref, entered_by, review_by)
       VALUES ($1, $2, 'mnpi_pending', $3, $4, now() + make_interval(days => $5::int))
       RETURNING id, review_by`,
      [symbol.symbol, eventRef, asText(input.sourceRef), author, input.reviewInDays],
    );

    const row = res.rows[0];
    if (!row) {
      /* Cannot happen for a plain INSERT ... RETURNING that did not raise, and is
       * refused rather than reported as success anyway — the caller is about to advance
       * a deal on the strength of it. `enterEmbargo` refuses the same shape under
       * EMBARGO_WRITE_UNCONFIRMED for the same reason. */
      return {
        kind: 'refused',
        refusals: [{
          code: OTHER_LEDGER_CODES.SIGNAL_WRITE_UNCONFIRMED,
          message: 'The insert raised no error and returned no row, so the signal cannot be treated as '
            + 'recorded. The deal must not advance on the strength of this call — re-read the register.',
          rule: RULE_NEVER_SILENT,
        }],
      };
    }

    const reviewBy = row.review_by instanceof Date
      ? row.review_by.toISOString()
      : row.review_by === null || row.review_by === undefined
        ? null
        : String(row.review_by);
    return { kind: 'recorded', assetSymbol: symbol.symbol, eventRef, id: String(row.id), reviewBy };
  } catch (err) {
    const { code, constraint } = pgError(err);
    if (code === UNIQUE_VIOLATION) {
      return explainSignalCollision(pool, symbol.symbol, eventRef, constraint);
    }
    console.warn('[access.otherLedger] signal write failed:', code ?? err);
    return {
      kind: 'refused',
      refusals: [{
        code: OTHER_LEDGER_CODES.REGISTER_UNAVAILABLE,
        message: 'The market-abuse register could not be written, so no signal exists for this deal. '
          + 'A missing signal is not a permission: the stage change must be refused, not completed '
          + 'quietly.',
        rule: RULE_NEVER_SILENT,
      }],
    };
  }
}

/** Postgres' unique-violation code, named so the branch below reads as intent. */
const UNIQUE_VIOLATION = '23505';

function pgError(err: unknown): { code?: string; constraint?: string } {
  return typeof err === 'object' && err !== null ? (err as { code?: string; constraint?: string }) : {};
}

/**
 * A unique violation happened. WHICH ONE, AND WHAT IS ACTUALLY IN FORCE?
 *
 * ONE STATEMENT, ONE ROW, TWO BOOLEANS. It reads the row keyed by this deal's own
 * idempotency key and selects `lifted_at IS NULL` — not `lifted_at`, not `lifted_by`.
 * The date and the name of whoever lifted an entry are the marketing compartment's, and
 * this function runs for a sales caller; the fact of liveness is what the decision needs
 * and it is all that is read.
 *
 * THE THREE ANSWERS, AND NONE OF THEM IS THE OTHERS:
 *   · the row exists and is LIVE       → `already_recorded`. The idempotent repeat, and
 *                                        the only non-refusal here.
 *   · the row exists and was LIFTED    → `SIGNAL_LIFTED_NOT_IN_FORCE`. A named human
 *                                        lifted this deal's own entry, so the perimeter
 *                                        is OPEN, and 0060's event index includes lifted
 *                                        rows so it can never be re-entered under this
 *                                        key. Reporting this as "already recorded" was
 *                                        the false clean.
 *   · no such row                      → `SIGNAL_BLOCKED_BY_LIVE_ENTRY`. The collision
 *                                        was the one-live-row-per-asset index and the
 *                                        live row belongs to a DIFFERENT event. This
 *                                        deal has no entry of its own and cannot get one
 *                                        while that row lives.
 * If the read itself fails we do not know which, and not knowing is `UNCONFIRMED`.
 */
async function explainSignalCollision(
  pool: pg.Pool,
  assetSymbol: string,
  eventRef: string,
  constraint: string | undefined,
): Promise<ProposalSignalOutcome> {
  const named = constraint ? `The database refused it under '${constraint}'. ` : '';
  let rows: readonly { live: boolean }[];
  try {
    const res = await pool.query<{ live: boolean }>(
      `SELECT (lifted_at IS NULL) AS live
         FROM marketing_asset_embargo
        WHERE asset_symbol = $1 AND event_ref = $2`,
      [assetSymbol, eventRef],
    );
    rows = res.rows;
  } catch (err) {
    console.warn('[access.otherLedger] collision cause unreadable:', pgError(err).code ?? err);
    return {
      kind: 'refused',
      refusals: [{
        code: OTHER_LEDGER_CODES.SIGNAL_WRITE_UNCONFIRMED,
        message: `${named}The register then could not be re-read, so which entry refused the write — and `
          + 'therefore whether any control is in force for this asset — is UNKNOWN. The deal must not '
          + 'advance on the strength of this call.',
        rule: RULE_NEVER_SILENT,
      }],
    };
  }

  const own = rows[0];
  if (own === undefined) {
    return {
      kind: 'refused',
      refusals: [{
        code: OTHER_LEDGER_CODES.SIGNAL_BLOCKED_BY_LIVE_ENTRY,
        message: `${named}${assetSymbol} already carries a LIVE register entry for a DIFFERENT event, and `
          + '0060 permits exactly one live entry per asset, so this deal\'s own signal was NOT written and '
          + 'cannot be written while that entry lives — no retry will ever create it. THIS IS NOT "already '
          + 'protected": the other entry may be lifted by a named human at any moment, and there would then '
          + 'be no record anywhere that this deal reached proposal on this asset. Either lift the live entry '
          + 'and re-enter it through the marketing desk so both events are on the record, or refuse the '
          + 'stage change. Do not advance the deal on a control that belongs to somebody else.',
        rule: RULE_NEVER_SILENT,
      }],
    };
  }

  if (own.live === true) {
    return { kind: 'already_recorded', assetSymbol, eventRef };
  }

  return {
    kind: 'refused',
    refusals: [{
      code: OTHER_LEDGER_CODES.SIGNAL_LIFTED_NOT_IN_FORCE,
      message: `${named}This deal's own entry for ${assetSymbol} EXISTS AND HAS BEEN LIFTED, so no embargo `
        + 'is in force and the asset can be named. 0060\'s (asset_symbol, event_ref) index includes lifted '
        + 'rows, so this signal can never be re-entered under this key. A lifted entry is history, not a '
        + 'control: the perimeter is OPEN and the deal must not rely on it. A named human decided to lift '
        + 'it — if that decision no longer holds, the marketing desk enters a NEW event, which is what 0060 '
        + 'requires for every state change.',
      rule: RULE_NEVER_SILENT,
    }],
  };
}
