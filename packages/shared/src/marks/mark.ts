/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  MARK TO CONTRACT — what LCX has actually been paid, or a refusal.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every price this platform quoted before this module was invented. `PACKAGES[]`
 * carried `basePrice: 2_000_000` (a hardcoded $20,000) and `alpha.ts` manufactured a
 * "deal value" as `15_000 + blended * 235_000` from market cap — its own comment
 * admitting the anchors were CHOSEN to land in the desk's range. Neither number came
 * from a contract.
 *
 * The contracts were on disk the whole time, in `listing_labels` (migration 0013).
 * MEASURED ON PRODUCTION 2026-08-06, and every figure here is labelled with where it
 * was measured because an earlier pass reported laptop numbers as if they were LCX's
 * book — which is the error class this module exists to remove:
 *
 *   listing_labels                                   815 rows
 *   source='closed'                                   36 rows
 *   project_id resolved                              810 rows (5 NULL)
 *   FEE revenue on closed (listing + marketing)   $634,500
 *   MEDIAN FEE on closed                           $12,500
 *   listing_fee 0 or NULL                          24 of 36
 *   liquidity_amount_usd, separately               $177,000
 *
 * So the hardcoded $20,000 default was 60% ABOVE the real median. That is the size of
 * the lie, and it was pointed at customers.
 *
 * ── liquidity_amount_usd IS NOT A FEE, AND IS NOT IN THIS MODULE'S INPUT TYPE ──
 * It is capital placed alongside a market maker — LCX's money at risk, not LCX's
 * revenue. An earlier pass summed it into the book and reported $816,500. The column
 * is right there in `0013_propensity.sql:13` and populated by `labels/extract.ts:66`,
 * one careless SUM from reproducing that error. So `MarkComparable` HAS NO LIQUIDITY
 * FIELD: the mistake is not guarded against, it is made structurally impossible, and
 * `mark.test.ts` asserts the identifier appears nowhere in this file.
 *
 * ── PURE ──
 * No I/O, no clock, no environment read. The caller supplies the comparables, the
 * window and the environment label; this module decides only whether it is willing to
 * quote. `deals.ts` does the reading.
 */
import {
  mcapBand, volMcapBand, categoryFits, chainFits,
  type McapBand, type VolBand,
} from '../scoring/propensity/features.js';

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE LINE ITEMS A FEE MARK MAY BE BUILT FROM                                     */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * The two columns that are revenue. A closed list, not a loop over the row's keys,
 * so adding a money column to `listing_labels` cannot silently enter a fee mark.
 */
export const MARK_FEE_LINE_ITEMS = ['listing_fee_usd', 'marketing_fee_usd'] as const;
export type MarkFeeLineItem = typeof MARK_FEE_LINE_ITEMS[number];

/**
 * Named so it renders. A frame that lists what was included and stays silent about
 * what was excluded invites the reader to assume the total is everything LCX received
 * from the counterparty. It is not — see the header.
 */
export const MARK_EXCLUDED_LINE_ITEM = 'liquidity_amount_usd' as const;

/**
 * THE CLOSED BOOK'S WINDOW AS MEASURED ON PRODUCTION, and it is NOT used as a
 * fallback. It exists so a caller can compare the window a run actually observed
 * against the window the book is known to span, and notice a run that saw a fifth of
 * the book. Substituting it when the comparables carry no dates would be asserting a
 * window nobody observed, which is the laundering this module refuses to do.
 */
export const CLOSED_BOOK_WINDOW_AS_MEASURED = {
  from: '2024-02-02',
  to: '2026-02-03',
  measuredOn: '2026-08-06',
  measuredAgainst: 'LCX production (Supabase)',
} as const;

/**
 * K — the fewest contracts this module will quote from.
 *
 * A JUDGEMENT, not a derivation, and recorded as one. Five is the smallest count
 * where a nearest-rank median has two observations either side of it, so one unusual
 * contract cannot move the quote to itself. Below that a "median" is a single deal
 * wearing a statistic's clothes.
 *
 * The consequence is deliberate and must not be softened: with 36 closed contracts
 * spread over four band dimensions, MOST STRATA REFUSE. That is the correct output on
 * day one — `censusOfComparables` reports how many strata clear K so the first real
 * run answers the question rather than us guessing at it here.
 */
export const MARK_MIN_COMPARABLES = 5;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE STRATUM — the existing feature bands, with absence kept apart from "no"      */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * A comparable and a target are alike when all four band dimensions agree. The bands
 * are the ones already calibrated for propensity
 * (`scoring/propensity/features.ts:32-67`) — a second, private notion of "similar
 * project" would be a second thing to keep in step.
 *
 * `categoryFit` and `chainFit` are `boolean | null`, NOT boolean. `categoryFits(null)`
 * returns `false`, which reads as "this project's category does not match the won-deal
 * profile" when the truth is "nobody recorded a category". Collapsing those two is the
 * three-states violation, and here it would be load-bearing: on production only 89 of
 * 810 joined rows carry `projects.category`, so a boolean would sweep 721 unknowns
 * into a single enormous "does not fit" stratum and hand it a confident median.
 */
export interface MarkStratum {
  readonly mcap: McapBand | null;
  readonly vol: VolBand | null;
  readonly categoryFit: boolean | null;
  readonly chainFit: boolean | null;
}

/** The features a project must have for a stratum to be resolvable. */
export interface MarkStratumFeatures {
  readonly marketCapUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly category: string | null;
  readonly chain: string | null;
}

const present = (s: string | null): boolean => s != null && s.trim() !== '';

/**
 * NaN AND Infinity ARE NOT NUMBERS FOR THIS PURPOSE, AND THE BANDS CANNOT SAY SO.
 *
 * `mcapBand` (features.ts:32) tests `mcapUsd <= 0` — false for NaN — and then three `<`
 * comparisons, all false for NaN, so NaN falls THROUGH to `'large'`; `volMcapBand`
 * falls through to `'hot'`. A market cap with no numeric meaning was therefore placed
 * in the LARGEST band and the HOTTEST turnover band and got a confident quote.
 *
 * The guard is here rather than in `features.ts` because that module is another
 * compartment's calibrated code with other callers, and changing what it returns for
 * NaN would move propensity scores in a lane this one does not own. So this module
 * refuses to hand it a value it cannot band, and the absence flows into
 * MARK_STRATUM_UNRESOLVED like every other absence.
 */
const finiteOrNull = (v: number | null): number | null =>
  v != null && Number.isFinite(v) ? v : null;

export function stratumOf(f: MarkStratumFeatures): MarkStratum {
  const mcap = finiteOrNull(f.marketCapUsd);
  const vol = finiteOrNull(f.volume24hUsd);
  return {
    mcap: mcapBand(mcap),
    vol: volMcapBand(vol, mcap),
    categoryFit: present(f.category) ? categoryFits(f.category) : null,
    chainFit: present(f.chain) ? chainFits(f.chain) : null,
  };
}

const dim = (v: boolean | null): string => (v == null ? 'unknown' : v ? 'fit' : 'unfit');

/** Stable, human-readable, and the string a refusal names. */
export function stratumKey(s: MarkStratum): string {
  return `mcap=${s.mcap ?? 'unknown'}|vol=${s.vol ?? 'unknown'}|cat=${dim(s.categoryFit)}|chain=${dim(s.chainFit)}`;
}

/**
 * Fully resolved = all four dimensions known.
 *
 * The strictest honest rule available. A mark drawn from a stratum with an unresolved
 * dimension is a mark over a mixed population that is being described as a narrow one,
 * and the description is what a customer reads.
 */
export function isStratumResolved(s: MarkStratum): boolean {
  return s.mcap != null && s.vol != null && s.categoryFit != null && s.chainFit != null;
}

export function sameStratum(a: MarkStratum, b: MarkStratum): boolean {
  return a.mcap === b.mcap && a.vol === b.vol && a.categoryFit === b.categoryFit && a.chainFit === b.chainFit;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE COMPARABLE                                                                  */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * One closed contract, joined to its project's market features.
 *
 * Fees arrive in WHOLE USD because that is what `listing_labels.listing_fee_usd`
 * holds; everything this module returns is integer CENTS, which is the repo's money
 * type everywhere else.
 *
 * THERE IS NO LIQUIDITY FIELD ON THIS TYPE. See the header — the camelCase identifier
 * is deliberately absent from the whole module, and `mark.test.ts` greps for it.
 */
export interface MarkComparable extends MarkStratumFeatures {
  readonly recordName: string;
  readonly listingFeeUsd: number | null;
  readonly marketingFeeUsd: number | null;
  /** When the contract closed, if the row records it. ISO date or datetime. */
  readonly closedAt: string | null;
}

/**
 * The observed fee total for one contract, or `null` when the contract records no fee
 * at all.
 *
 * ZERO IS TREATED AS UNOBSERVED, and the reason is in the extractor:
 * `labels/extract.ts:23-27`'s `parseFee` returns `null` for anything `<= 0`, so a `0`
 * in the column cannot have come from a CSV that said "$0". It came from a loader that
 * had nothing to write. Reading it as a free listing would drag the median down with
 * contracts whose price nobody recorded — and on production `listing_fee` is 0 or NULL
 * on 24 of 36 closed rows, so this decision moves the number a great deal.
 *
 * A contract with a marketing fee and no listing fee is still a comparable: its total
 * is the marketing fee alone, and the frame names which line items it contributed.
 *
 * ── A SUB-CENT TOTAL IS ALSO UNOBSERVED, AND THIS WAS A LIVE $0.00 QUOTE ──
 * The first version of this function tested `usd <= 0` and THEN converted, so a fee of
 * `0.004` passed the gate, `Math.round(0.004 * 100)` produced 0 CENTS, and the contract
 * was recorded as an OBSERVED line item at zero. Five of those cleared K and
 * `markToContract` returned `[0, 0, 0]` — a proposal quoting nothing, persisted and
 * ready to send. Such values reach the column for real: `labels/extract.ts:23-27`'s
 * `parseFee` strips every non-digit, so a CSV cell of `"1.5M"` becomes `1.5` and
 * `"0.004"` becomes `0.004`, and its only check is `n > 0`.
 *
 * So the conversion happens FIRST and the floor is applied to the CENTS: a total that
 * does not round to at least one cent is not a price, and reads exactly like the 0 and
 * the NULL above — unobserved. The line items are summed before rounding so a contract
 * is judged on its total, not on each half separately.
 *
 * The floor is ONE CENT, the smallest amount this repo's money type can hold, and not a
 * dollar: this module will not invent a plausibility threshold the extractor does not
 * have. A $0.01 mark would be visibly absurd on a quote; a $0.00 mark is a silent zero,
 * and only the second is a doctrine failure.
 */
export function observedFeeOf(
  c: MarkComparable,
): { readonly cents: number; readonly lineItems: readonly MarkFeeLineItem[] } | null {
  const lineItems: MarkFeeLineItem[] = [];
  let usdTotal = 0;
  const take = (usd: number | null, item: MarkFeeLineItem): void => {
    if (usd == null || !Number.isFinite(usd) || usd <= 0) return;
    usdTotal += usd;
    lineItems.push(item);
  };
  take(c.listingFeeUsd, 'listing_fee_usd');
  take(c.marketingFeeUsd, 'marketing_fee_usd');
  if (lineItems.length === 0) return null;
  const cents = Math.round(usdTotal * 100);
  // Sub-cent totals are unobserved, not free. See the note above.
  if (cents < 1) return null;
  return { cents, lineItems };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* REFUSALS — a stable code, a sentence, the rule it applies                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

export const MARK_REFUSAL_CODES = [
  /** The caller did not say which database this was computed against. */
  'MARK_ENVIRONMENT_NOT_STATED',
  /** The comparable book could not be read — NOT the same as it being empty. */
  'MARK_COMPARABLE_BOOK_UNREADABLE',
  /** The target is missing a band dimension, so there is no stratum to compare within. */
  'MARK_STRATUM_UNRESOLVED',
  /** The stratum exists and holds fewer than K priced contracts. */
  'MARK_STRATUM_BELOW_K',
  /** Contracts are present in the stratum but not one of them records a fee. */
  'MARK_NO_FEE_LINE_ITEM_OBSERVED',
  /** Asked for a price from market data alone. There is no such price. */
  'MARK_NOT_DERIVABLE_FROM_MARKET_DATA',
  /**
   * A package type the catalogue does not offer. RAISED BY `deals/index.ts`, not by
   * this module — it is a fact about the catalogue, not the book — but the code lives
   * in this one closed list so a surface has a single union to branch on. It replaces
   * `defaultPackageValue`'s old `?? 0`, which quoted zero dollars for a typo.
   */
  'MARK_PACKAGE_TYPE_UNKNOWN',
  /**
   * An operator asked for a proposal at a HAND-NEGOTIATED price, and what arrived was
   * not one: a non-integer or non-positive number of cents, or a price with no stated
   * rationale. RAISED BY `deals/index.ts` for the same reason as the code above — it is
   * a fact about the request, not the book.
   *
   * The rationale is not paperwork. A hand price with no reason recorded is exactly the
   * unsourced number this module exists to delete; the difference between $50,000
   * because a human negotiated it and $50,000 because a literal was in a config file is
   * ONLY the recorded reason, so a price without one is refused.
   */
  'MARK_OPERATOR_PRICE_NOT_A_PRICE',
] as const;
export type MarkRefusalCode = typeof MARK_REFUSAL_CODES[number];

export function isMarkRefusalCode(v: unknown): v is MarkRefusalCode {
  return typeof v === 'string' && (MARK_REFUSAL_CODES as readonly string[]).includes(v);
}

/**
 * The rule a refusal applies. `instrument` is the house doctrine, not a regulation —
 * these refusals are statistical and editorial, and dressing them as MiCA provisions
 * would devalue the citations that really are MiCA provisions.
 */
export interface MarkRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

const RULE_ABSENT_REFUSES: MarkRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
    + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
};

const RULE_NO_LAUNDERING: MarkRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. If you cannot know, say you cannot know.',
};

const RULE_THREE_STATES: MarkRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'three states are never collapsed',
  text: 'Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty.',
};

const RULE_ENVIRONMENT_LABEL: MarkRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an environment label',
  text: 'Every figure carries an ObservationFrame and an environment label where it came from a database.',
};

export interface MarkRefusal {
  readonly code: MarkRefusalCode;
  /** One sentence, to the operator, active voice. Names the stratum and its n. */
  readonly sentence: string;
  readonly rule: MarkRuleCitation;
  /** The stratum the refusal is about, where there is one. */
  readonly stratum: MarkStratum | null;
  /** How many priced contracts were in it. `null` when that was not the question. */
  readonly stratumN: number | null;
  /** `null` only where no database was involved at all (see `alpha.ts`). */
  readonly environment: string | null;
}

/**
 * THE REFUSAL A SCORE BUILT FROM MARKET DATA MUST CARRY.
 *
 * Exported because `alpha.ts` needs it: `dealValue` used to return a manufactured USD
 * figure and now returns this instead. Market cap and 24h volume are facts about a
 * token's trading; a listing fee is the outcome of a negotiation. No function of the
 * former is the latter, and the arithmetic that pretended otherwise is deleted.
 */
export const MARKET_DATA_IS_NOT_A_PRICE: MarkRefusal = {
  code: 'MARK_NOT_DERIVABLE_FROM_MARKET_DATA',
  sentence: 'No deal value is quoted here. Market cap and liquidity describe how a token trades, '
    + 'not what a counterparty agreed to pay; price this from the closed book via marks/mark.ts.',
  rule: RULE_NO_LAUNDERING,
  stratum: null,
  stratumN: null,
  environment: null,
};

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE OBSERVATION FRAME                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * What the window could and could not see, carried on every mark. A quantile with no
 * frame does not render — the same discipline the marketing compartment applies to
 * every figure it shows (`marketing/types.ts:1931`). This is a separate declaration
 * rather than an import because the fields differ: that frame describes a social
 * listening window, this one describes a book of contracts.
 */
export interface MarkObservationFrame {
  /** Which database this was computed against. Never empty — an empty one refuses. */
  readonly environment: string;
  /** Earliest / latest close date among the contracts that ACTUALLY fed the mark. */
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly windowBasis: 'observed_from_comparables' | 'unknown_no_dated_comparable';
  /** The book's known span, for comparison. Never substituted for the above. */
  readonly bookWindowAsMeasured: typeof CLOSED_BOOK_WINDOW_AS_MEASURED;
  /** Line items that contributed to at least one contract in this stratum. */
  readonly lineItemsObserved: readonly MarkFeeLineItem[];
  /** Line items no contract in this stratum recorded. Shown, not omitted. */
  readonly lineItemsNeverObserved: readonly MarkFeeLineItem[];
  /** Named on screen so the total is not read as everything the counterparty paid. */
  readonly lineItemExcluded: typeof MARK_EXCLUDED_LINE_ITEM;
  readonly stratum: MarkStratum;
  /** Priced contracts in the stratum. This is the n the quantiles are over. */
  readonly stratumN: number;
  readonly comparablesConsidered: number;
  /** In-stratum contracts that recorded no fee at all, so could not be priced. */
  readonly comparablesWithoutAnyFeeLineItem: number;
  readonly quantileMethod: 'nearest_rank_no_interpolation';
  readonly minComparables: number;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE MARK                                                                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Three quantiles, all integer cents, all of them a total some counterparty actually
 * paid. NOT a point estimate: a single number reads as precision this book cannot
 * support at n=5, so the spread travels with the middle.
 */
export interface FeeMark {
  readonly kind: 'marked';
  readonly currency: 'USD';
  readonly p25Cents: number;
  readonly medianCents: number;
  readonly p75Cents: number;
  readonly frame: MarkObservationFrame;
}

export type MarkOutcome = FeeMark | { readonly kind: 'refused'; readonly refusals: readonly MarkRefusal[] };

export function isFeeMark(o: MarkOutcome): o is FeeMark {
  return o.kind === 'marked';
}

/**
 * NEAREST RANK, NO INTERPOLATION.
 *
 * The usual median of an even-length sample is the mean of the middle two, which for
 * $10,000 and $15,000 produces $12,500 — a price NOBODY WAS EVER CHARGED. Every
 * number this module returns has to be a total from a real contract, because that is
 * the only claim it can defend when a counterparty asks where it came from.
 */
function nearestRank(sortedAsc: readonly number[], q: number): number {
  const n = sortedAsc.length;
  // ceil(q·n) in 1-based ranks, clamped into the array. n >= 1 is the caller's job.
  const rank = Math.min(n, Math.max(1, Math.ceil(q * n)));
  return sortedAsc[rank - 1]!;
}

export interface MarkRequest {
  /** The project being quoted. */
  readonly target: MarkStratumFeatures;
  readonly comparables: readonly MarkComparable[];
  /**
   * Which database the comparables came from, e.g. `supabase:db.xxxx.supabase.co/postgres`.
   *
   * `string | null`, AND THE NULL IS THE POINT. `environmentLabelFromDatabaseUrl` used to
   * return the literal string `'unknown'` when it could not parse a connection string,
   * and this field was typed `string`, so `'unknown'` satisfied the compiler, satisfied
   * the `env === ''` guard below, and A PRICE SHIPPED with `frame.environment: 'unknown'`.
   * The one input the whole module was written for — a figure whose database nobody can
   * name — failed OPEN. Typing the absence as `null` makes the compiler force the branch
   * at every call site instead of trusting a sentinel string.
   */
  readonly environment: string | null;
  /**
   * Set when the book could not be read at all — a missing relation, a failed query.
   * NOT the same as an empty book, and the two must not answer the same way.
   */
  readonly bookUnreadableReason?: string | null;
}

/**
 * Mark one project to LCX's closed book, or refuse.
 *
 * EVERY refusal is returned, not the first found — the house pattern
 * (`routes/marketingDesk.ts:1207-1214`). An operator told only that the environment is
 * unstated, who fixes that and is then told the stratum is empty, routes around the
 * control.
 *
 * THE STRATUM IS NEVER WIDENED. There is no fallback to "mcap band alone", no drop of
 * the category dimension, no national average. A widened stratum answers a different
 * question in the same shape, and the shape is what gets quoted.
 */
export function markToContract(req: MarkRequest): MarkOutcome {
  const refusals: MarkRefusal[] = [];
  const raw = req.environment == null ? '' : req.environment.trim();
  /*
   * `'unknown'` REFUSES TOO, AND IT IS NOT BELT-AND-BRACES.
   *
   * The label helper now returns `null`, so the compiler catches the path it used to
   * take. This second test catches the OTHER way the sentinel arrives: a caller — an
   * older payload replayed, a JSON round-trip through a persisted snapshot, a hand-built
   * request — passing the literal word through. `'unknown'` is not the name of a
   * database, so it cannot satisfy a rule that requires one to be named. There is no
   * legitimate environment whose label is the word 'unknown'.
   */
  const env = raw.toLowerCase() === 'unknown' ? '' : raw;

  if (env === '') {
    refusals.push({
      code: 'MARK_ENVIRONMENT_NOT_STATED',
      sentence: raw === ''
        ? 'No environment label was supplied, so this mark cannot say which book it read. '
          + 'A figure measured on a laptop and a figure measured on LCX production are not interchangeable.'
        : `The environment label was '${raw}', which does not name a database, so this mark cannot say `
          + 'which book it read. A figure measured on a laptop and a figure measured on LCX production '
          + 'are not interchangeable.',
      rule: RULE_ENVIRONMENT_LABEL,
      stratum: null,
      stratumN: null,
      environment: null,
    });
  }

  if (req.bookUnreadableReason != null && req.bookUnreadableReason.trim() !== '') {
    refusals.push({
      code: 'MARK_COMPARABLE_BOOK_UNREADABLE',
      sentence: `The closed book could not be read (${req.bookUnreadableReason.trim()}), which is not the `
        + 'same as the book being empty. No quote is produced from an unread book.',
      rule: RULE_THREE_STATES,
      stratum: null,
      stratumN: null,
      environment: env === '' ? null : env,
    });
    // An unread book makes every stratum question unanswerable, so stop here rather
    // than also reporting n=0 — which would read as "we looked and found nothing".
    return { kind: 'refused', refusals };
  }

  const stratum = stratumOf(req.target);
  if (!isStratumResolved(stratum)) {
    const missing = [
      stratum.mcap == null ? 'market cap' : null,
      stratum.vol == null ? '24h volume (needs market cap too)' : null,
      stratum.categoryFit == null ? 'category' : null,
      stratum.chainFit == null ? 'chain' : null,
    ].filter((s): s is string => s != null);
    refusals.push({
      code: 'MARK_STRATUM_UNRESOLVED',
      sentence: `This project cannot be placed in a comparable stratum: ${missing.join(', ')} `
        + `not recorded. Stratum so far is ${stratumKey(stratum)} — supply the missing field or price it by hand.`,
      rule: RULE_ABSENT_REFUSES,
      stratum,
      stratumN: null,
      environment: env === '' ? null : env,
    });
    return { kind: 'refused', refusals };
  }

  const inStratum = req.comparables.filter((c) => sameStratum(stratumOf(c), stratum));
  const priced = inStratum
    .map((c) => observedFeeOf(c))
    .filter((f): f is NonNullable<ReturnType<typeof observedFeeOf>> => f != null);
  const withoutFee = inStratum.length - priced.length;

  if (priced.length === 0) {
    refusals.push({
      code: inStratum.length === 0 ? 'MARK_STRATUM_BELOW_K' : 'MARK_NO_FEE_LINE_ITEM_OBSERVED',
      sentence: inStratum.length === 0
        ? `Stratum ${stratumKey(stratum)} holds 0 closed contracts (K=${MARK_MIN_COMPARABLES}). `
          + 'There is nothing to mark against and the stratum will not be widened to manufacture one.'
        : `Stratum ${stratumKey(stratum)} holds ${inStratum.length} closed contract(s) and not one of them `
          + 'records a listing or marketing fee of at least one cent, so no price was ever observed here.',
      rule: RULE_ABSENT_REFUSES,
      stratum,
      stratumN: 0,
      environment: env === '' ? null : env,
    });
    return { kind: 'refused', refusals };
  }

  if (priced.length < MARK_MIN_COMPARABLES) {
    refusals.push({
      code: 'MARK_STRATUM_BELOW_K',
      sentence: `Stratum ${stratumKey(stratum)} holds ${priced.length} priced closed contract(s), below `
        + `K=${MARK_MIN_COMPARABLES}. A median over ${priced.length} is one deal wearing a statistic's clothes, `
        + 'and the stratum will not be widened to reach K.',
      rule: RULE_NO_LAUNDERING,
      stratum,
      stratumN: priced.length,
      environment: env === '' ? null : env,
    });
    return { kind: 'refused', refusals };
  }

  if (refusals.length > 0) return { kind: 'refused', refusals };

  const totals = priced.map((p) => p.cents).sort((a, b) => a - b);

  /*
   * THE ZERO-QUANTILE INVARIANT, IN CODE RATHER THAN IN A TEST.
   *
   * `mark.test.ts` asserted "never returns a zero or negative quantile" against ONE
   * fixture, which meant the invariant lived in the test and nothing enforced it — and
   * sub-cent fees violated it in production shape (see `observedFeeOf`). `observedFeeOf`
   * is now the guarantee: it returns `null` below one cent, so `totals[0] >= 1` holds by
   * construction and this branch is UNREACHABLE TODAY. It is here because the guarantee
   * is one function away, a future line item could reintroduce a zero, and the failure
   * mode is a document quoting $0.00 to a counterparty. It reuses
   * MARK_NO_FEE_LINE_ITEM_OBSERVED rather than minting a code that nothing can emit:
   * a total that rounds below a cent IS the absence of an observed fee.
   */
  if (totals[0]! < 1) {
    refusals.push({
      code: 'MARK_NO_FEE_LINE_ITEM_OBSERVED',
      sentence: `Stratum ${stratumKey(stratum)} produced ${priced.length} fee total(s) of which the lowest `
        + 'rounds below one cent, so at least one "priced" contract carries no price. No quote is produced '
        + 'from a book that would put $0.00 on a proposal.',
      rule: RULE_ABSENT_REFUSES,
      stratum,
      stratumN: priced.length,
      environment: env,
    });
    return { kind: 'refused', refusals };
  }
  const observed = new Set<MarkFeeLineItem>();
  for (const p of priced) for (const li of p.lineItems) observed.add(li);

  // The window is what the contracts that fed the mark actually say. When none of
  // them carries a date the frame says so — it does not borrow the book's span.
  const dates = inStratum
    .map((c) => c.closedAt)
    .filter((d): d is string => d != null && d.trim() !== '' && Number.isFinite(Date.parse(d)))
    .sort();

  return {
    kind: 'marked',
    currency: 'USD',
    p25Cents: nearestRank(totals, 0.25),
    medianCents: nearestRank(totals, 0.5),
    p75Cents: nearestRank(totals, 0.75),
    frame: {
      environment: env,
      windowFrom: dates[0] ?? null,
      windowTo: dates[dates.length - 1] ?? null,
      windowBasis: dates.length > 0 ? 'observed_from_comparables' : 'unknown_no_dated_comparable',
      bookWindowAsMeasured: CLOSED_BOOK_WINDOW_AS_MEASURED,
      lineItemsObserved: MARK_FEE_LINE_ITEMS.filter((li) => observed.has(li)),
      lineItemsNeverObserved: MARK_FEE_LINE_ITEMS.filter((li) => !observed.has(li)),
      lineItemExcluded: MARK_EXCLUDED_LINE_ITEM,
      stratum,
      stratumN: priced.length,
      comparablesConsidered: req.comparables.length,
      comparablesWithoutAnyFeeLineItem: withoutFee,
      quantileMethod: 'nearest_rank_no_interpolation',
      minComparables: MARK_MIN_COMPARABLES,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE CENSUS — the engine reports its own thinness rather than hiding it           */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface MarkStratumCount {
  readonly key: string;
  readonly stratum: MarkStratum;
  /** Contracts in the stratum, priced or not. */
  readonly n: number;
  /** Of those, how many record a fee. This is the number K is tested against. */
  readonly nPriced: number;
  readonly meetsK: boolean;
}

/**
 * How thin is the stratification, really?
 *
 * On production only 89 of 810 joined rows carry `projects.category` and only 318 of
 * 810 carry `market_cap_usd`, so most strata will refuse. Rather than assert what that
 * implies, this returns the counts and lets the first real run say. The coverage
 * fields are the diagnosis: if `fullyStratifiable` is far below
 * `comparablesConsidered`, the fix is enrichment, not a lower K.
 */
export interface MarkStratumCensus {
  /** `null` when the connection string could not be parsed — never the word 'unknown'. */
  readonly environment: string | null;
  readonly comparablesConsidered: number;
  readonly withMarketCap: number;
  readonly withVolumeBand: number;
  readonly withCategory: number;
  readonly withChain: number;
  readonly withAnyFeeLineItem: number;
  readonly fullyStratifiable: number;
  readonly strata: readonly MarkStratumCount[];
  readonly strataMeetingK: number;
  readonly minComparables: number;
}

export function censusOfComparables(
  comparables: readonly MarkComparable[],
  environment: string | null,
): MarkStratumCensus {
  const buckets = new Map<string, { stratum: MarkStratum; n: number; nPriced: number }>();
  let withMarketCap = 0;
  let withVolumeBand = 0;
  let withCategory = 0;
  let withChain = 0;
  let withAnyFee = 0;
  let fullyStratifiable = 0;

  for (const c of comparables) {
    const s = stratumOf(c);
    if (s.mcap != null) withMarketCap++;
    if (s.vol != null) withVolumeBand++;
    if (s.categoryFit != null) withCategory++;
    if (s.chainFit != null) withChain++;
    const fee = observedFeeOf(c);
    if (fee != null) withAnyFee++;
    if (!isStratumResolved(s)) continue;
    fullyStratifiable++;
    const key = stratumKey(s);
    const b = buckets.get(key) ?? { stratum: s, n: 0, nPriced: 0 };
    b.n++;
    if (fee != null) b.nPriced++;
    buckets.set(key, b);
  }

  const strata: MarkStratumCount[] = [...buckets.entries()]
    .map(([key, b]) => ({ key, stratum: b.stratum, n: b.n, nPriced: b.nPriced, meetsK: b.nPriced >= MARK_MIN_COMPARABLES }))
    .sort((a, b) => b.nPriced - a.nPriced || a.key.localeCompare(b.key));

  const envTrimmed = environment == null ? '' : environment.trim();
  return {
    // Same rule as `markToContract`: an unnamed database is `null`, not a word that
    // reads like a name. A census is a database figure too.
    environment: envTrimmed === '' || envTrimmed.toLowerCase() === 'unknown' ? null : envTrimmed,
    comparablesConsidered: comparables.length,
    withMarketCap,
    withVolumeBand,
    withCategory,
    withChain,
    withAnyFeeLineItem: withAnyFee,
    fullyStratifiable,
    strata,
    strataMeetingK: strata.filter((s) => s.meetsK).length,
    minComparables: MARK_MIN_COMPARABLES,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE ENVIRONMENT LABEL                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Turn a connection string into a label a human can read on a quote.
 *
 * `NODE_ENV` is the wrong source: a production build pointed at a laptop's Postgres
 * reports `production` and that is exactly the confusion that put local numbers into a
 * report as LCX's book. The database's own host is the fact that matters.
 *
 * CREDENTIALS ARE NEVER IN THE OUTPUT. Host, port and database name only — this string
 * ends up in a proposal snapshot, an audit row and, eventually, on a customer-facing
 * screen.
 *
 * ── A PARSE FAILURE RETURNS `null`, AND THE PREVIOUS VERSION'S `'unknown'` WAS A LIE ──
 * This function used to return the literal string `'unknown'` and its own comment
 * claimed `markToContract` "treats [it] as unstated and refuses on" it. It did not:
 * `markToContract` refused only on the EMPTY string, so an empty or unparseable
 * `DATABASE_URL` produced a fully quoted price carrying `frame.environment: 'unknown'`.
 * The one input this module was written to catch was the one it waved through.
 *
 * `null` is the fix that the compiler can enforce rather than a fix that depends on a
 * downstream string comparison being remembered.
 */
export function environmentLabelFromDatabaseUrl(url: string): string | null {
  const raw = (url ?? '').trim();
  if (raw === '') return null;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host === '') return null;
    const db = u.pathname.replace(/^\//, '');
    const where = db === '' ? host : `${host}/${db}`;
    const kind = /(^|\.)supabase\.(co|com|net)$/i.test(host)
      ? 'supabase'
      : host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'local'
        : 'external';
    return `${kind}:${where}`;
  } catch {
    return null;
  }
}
