/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  DEAL PACKAGES AND PROPOSALS — inclusions here, PRICES FROM THE BOOK.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS DELETED IN THIS WAVE, AND WHY IT COULD NOT BE CORRECTED IN PLACE:
 *
 *  · `PackageConfig.basePrice`. `listing` and `marketing` each carried
 *    `2_000_000` — a hardcoded $20,000 nobody sourced. LCX's real median fee across
 *    its 36 closed contracts, measured on production 2026-08-06, is $12,500. The
 *    default was 60% ABOVE the book and pointed at customers. There is no single
 *    right number to put in its place: there is a stratum of comparable closed
 *    contracts, or a refusal (`marks/mark.ts`).
 *
 *  · `DEAL_PACKAGE.standardPrice` / `premiumPrice` ($50,000 / $100,000). Same defect,
 *    never read by any caller, which is the only reason nobody had quoted them.
 *
 *  · The 0.7× / 1.6× tier multipliers, AND — the part that mattered more — the
 *    `Math.round(x / 100_000) * 100_000` that snapped both onto a $1,000 grid. Any
 *    real mark fed through it was quantised before display, so a measured $12,499
 *    became $12,000. Tiers are now the observed p25 / median / p75 of the stratum:
 *    three totals real counterparties actually paid, with the spread visible.
 *
 *  · `essentialPrice > 0 ? essentialPrice : packageValue`. That expression collapsed
 *    all three tiers to 0 when `packageValue` was 0 — which is exactly the shape a
 *    refusal takes when it is passed through as a number instead of stopping the call.
 *    Both quoting functions now return a discriminated union, so a refusal cannot be
 *    read as money by anything downstream.
 *
 * WHY THE EXPORTED NAMES SURVIVED. `defaultPackageValue`, `buildProposalTiers` and
 * `generateProposal` are named individually in `packages/shared/src/index.ts`, which is
 * this package's ONLY entry point. Renaming them means editing that barrel, and a
 * missing barrel line is invisible until an emit build in Docker order fails with
 * TS2305 — this repo has been bitten by that twice (`barrelReachability.test.ts`).
 * The names stayed; the contracts changed.
 */
import {
  censusOfComparables,
  environmentLabelFromDatabaseUrl,
  isFeeMark,
  markToContract,
  type FeeMark,
  type MarkComparable,
  type MarkObservationFrame,
  type MarkOutcome,
  type MarkRefusal,
  type MarkStratumCensus,
  type MarkStratumFeatures,
} from '../marks/mark.js';

export interface PackageConfig {
  type: 'listing' | 'marketing' | 'liquidity' | 'dual' | 'emt' | 'custom';
  label: string;
  description: string;
  /** What the desk delivers. This file's only remaining claim about a package. */
  includes: string[];
}

export interface DealPackage {
  packages: PackageConfig[];
  standardIncludes: string[];
  premiumIncludes: string[];
}

export const PACKAGES: PackageConfig[] = [
  { type: 'listing', label: 'Standard Listing', description: 'Standard token listing on LCX exchange', includes: ['Technical integration', 'Market surveillance', 'Compliance review', 'Trading pair setup'] },
  { type: 'marketing', label: 'Marketing Package', description: 'Promotional campaign support', includes: ['Social media campaign', 'Exchange announcement', 'Community AMA', 'Newsletter feature'] },
  { type: 'liquidity', label: 'Liquidity Support', description: 'Market making and liquidity provision', includes: ['Market maker introduction', 'Liquidity pool support', 'MM referral network'] },
  { type: 'dual', label: 'Dual Listing (EU+US)', description: 'Concurrent listing on LCX EU and US platforms', includes: ['EU compliance package', 'US pre/post CLARITY advisory', 'Dual market surveillance', 'Cross-border legal opinion'] },
  { type: 'emt', label: 'EMT Package', description: 'Electronic Money Token support', includes: ['EMT compliance framework', 'Custody solution', 'ESMA reporting', 'MiCA WP support'] },
  { type: 'custom', label: 'Custom Package', description: 'Tailored package', includes: ['Consultation', 'Custom integration'] },
];

export const DEAL_PACKAGE: DealPackage = {
  packages: PACKAGES,
  standardIncludes: ['Standard listing', 'Marketing support', 'Liquidity introduction', 'Compliance review'],
  premiumIncludes: ['Priority listing', 'Full marketing campaign', 'Dedicated market maker', 'Legal opinion (MiCA WP)', 'MM referral network', 'Cross-border advisory'],
};

export const STAGES = ['not_started', 'contacted', 'discovery', 'proposal', 'negotiating', 'won', 'lost'] as const;
export type DealStage = typeof STAGES[number];

export const STAGE_LABELS: Record<DealStage, string> = {
  not_started: 'Not Started',
  contacted: 'Contacted',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

const STAGE_ORDER: Record<DealStage, number> = {
  not_started: 0, contacted: 1, discovery: 2, proposal: 3, negotiating: 4, won: 5, lost: 5,
};

export function canTransition(from: DealStage, to: DealStage): boolean {
  if (from === 'won' || from === 'lost') return false;
  if (to === 'won' || to === 'lost') return true;
  return STAGE_ORDER[to] > STAGE_ORDER[from];
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* QUOTING — a mark, or a refusal. Never a number with no contract behind it.       */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * `MARK_PACKAGE_TYPE_UNKNOWN` is declared here rather than in `marks/mark.ts` because
 * it is a fact about this catalogue, not about the book. It replaces
 * `defaultPackageValue`'s old `?? 0` — an unrecognised package type used to quote ZERO
 * DOLLARS, which is the silent-zero collapse the doctrine forbids, and which the
 * previous test suite asserted on purpose.
 */
const PACKAGE_TYPE_UNKNOWN = (packageType: string): MarkRefusal => ({
  code: 'MARK_PACKAGE_TYPE_UNKNOWN',
  sentence: `'${packageType}' is not a package type this desk offers, so there is nothing to price. `
    + `Known types: ${PACKAGES.map((p) => p.type).join(', ')}.`,
  rule: {
    instrument: 'LCX_HOUSE_DOCTRINE',
    provision: 'absent data refuses',
    text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
      + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
  },
  stratum: null,
  stratumN: null,
  environment: null,
});

const HOUSE_RULE_ABSENT_REFUSES = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
    + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
} as const;

/**
 * A hand price that is not a price. Raised here rather than in `marks/mark.ts` because it
 * is a fact about the REQUEST, not the book — the same reason `MARK_PACKAGE_TYPE_UNKNOWN`
 * lives here while its code is declared in the engine's one closed list.
 */
const OPERATOR_PRICE_NOT_A_PRICE = (p: { priceCents: number; operatorId: string; rationale: string }): MarkRefusal => ({
  code: 'MARK_OPERATOR_PRICE_NOT_A_PRICE',
  sentence: 'A hand-negotiated price was requested but what arrived is not one: it must be a whole number of '
    + 'cents of at least 1, name the operator, and state the reason it was negotiated. '
    + `Received ${JSON.stringify({ priceCents: p.priceCents, operatorId: p.operatorId, rationale: p.rationale })}. `
    + 'The reason is not paperwork — a hand price with no recorded reason is indistinguishable from the '
    + 'unsourced literal this desk just deleted.',
  rule: HOUSE_RULE_ABSENT_REFUSES,
  stratum: null,
  stratumN: null,
  environment: null,
});

/**
 * THE BOOK, AS THE API HANDS IT OVER.
 *
 * These functions take the comparables rather than a pre-computed `MarkOutcome`, and
 * that is a packaging decision, stated because it looks like a design smell:
 * `packages/shared/package.json` publishes ONE entry point and `src/index.ts` names its
 * exports individually, so a caller in `apps/api` cannot reach `markToContract` or
 * `censusOfComparables` unless a line is added to that barrel — which belongs to a
 * different lane this wave. Routing the book through the three functions the barrel
 * ALREADY names keeps the whole path reachable with no barrel edit. `marks/mark.ts`
 * remains the engine and is directly testable.
 */
export interface PackageQuoteInput {
  /** The project being quoted. */
  readonly target: MarkStratumFeatures;
  /** LCX's closed contracts, joined to their projects' market features. */
  readonly comparables: readonly MarkComparable[];
  /**
   * The connection string the comparables were read from.
   *
   * CREDENTIALS DO NOT SURVIVE. `environmentLabelFromDatabaseUrl` keeps the host and
   * database name and nothing else, and `marks/mark.test.ts` asserts a password handed
   * in never appears in the label. The label is what makes it impossible to mistake a
   * laptop's numbers for LCX's book — which is a mistake that has already been made.
   */
  readonly databaseUrl: string;
  /**
   * Set when the book could not be READ — a missing relation, a failed query. Distinct
   * from an empty book, and answered with a different refusal code.
   */
  readonly bookUnreadableReason?: string | null;
}

function markFrom(input: PackageQuoteInput): { mark: MarkOutcome; census: MarkStratumCensus } {
  const environment = environmentLabelFromDatabaseUrl(input.databaseUrl);
  return {
    mark: markToContract({
      target: input.target,
      comparables: input.comparables,
      environment,
      bookUnreadableReason: input.bookUnreadableReason ?? null,
    }),
    census: censusOfComparables(input.comparables, environment),
  };
}

export type PackageQuote =
  | {
    readonly kind: 'quoted';
    readonly packageType: string;
    /** Integer cents. The stratum's median closed fee — NOT rounded to any grid. */
    readonly valueCents: number;
    readonly frame: MarkObservationFrame;
    readonly census: MarkStratumCensus;
  }
  | {
    readonly kind: 'refused';
    /** Non-empty by type — see `ProposalOutcome`'s note on the empty-refusals branch. */
    readonly refusals: readonly [MarkRefusal, ...MarkRefusal[]];
    /**
     * THE ENGINE REPORTING ITS OWN THINNESS. A refusal that says "this stratum is
     * empty" without saying which strata are not is unactionable — the operator cannot
     * tell a missing `category` column from a genuinely new kind of counterparty. The
     * census travels with the refusal so the first real run answers that.
     */
    readonly census: MarkStratumCensus;
  };

/**
 * The opening number on a new deal.
 *
 * WAS: `defaultPackageValue(pkgType: string): number` — a lookup into a table of
 * literals, returning $20,000 for a listing and 0 for anything it did not recognise.
 *
 * NOW: it needs the book, and it will refuse. The arity change is deliberate — it forces
 * every call site to confront that a price requires comparables.
 */
export function defaultPackageValue(packageType: string, input: PackageQuoteInput): PackageQuote {
  const { mark, census } = markFrom(input);
  const refusals: MarkRefusal[] = [];
  const pkg = PACKAGES.find((p) => p.type === packageType);
  if (!pkg) refusals.push(PACKAGE_TYPE_UNKNOWN(packageType));
  // EVERY refusal, not the first: an operator who fixes the package type and is only
  // then told the stratum is empty learns to route around the control.
  if (!isFeeMark(mark)) refusals.push(...mark.refusals);
  // `nonEmpty` rather than `.length > 0`, so the guard and the TYPE are the same fact:
  // the refused branch cannot be reached with an empty reason list.
  const bad = nonEmpty(refusals);
  if (bad != null) return { kind: 'refused', refusals: bad, census };
  const m = mark as FeeMark;
  return { kind: 'quoted', packageType, valueCents: m.medianCents, frame: m.frame, census };
}

export interface ProposalTier {
  name: string;
  /** Integer cents. A total some counterparty actually paid — see `basis`. */
  priceCents: number;
  /**
   * WHICH OBSERVED QUANTILE THIS PRICE IS. Carried so a tier cannot be re-presented
   * as a list price: `stratum_p75` means "a quarter of comparable contracts closed at
   * or above this", which is a defensible sentence in a negotiation. A multiplier is
   * not.
   *
   * `operator_supplied` is the one basis that is NOT from the book — a price a human
   * negotiated and stated a reason for. It never appears alongside a stratum basis in
   * the same tier list, because the two are answers to different questions.
   */
  basis: 'stratum_p25' | 'stratum_median' | 'stratum_p75' | 'operator_supplied';
  inclusions: string[];
  recommended: boolean;
}

export type ProposalTiers =
  | {
    readonly kind: 'tiers';
    readonly tiers: readonly ProposalTier[];
    readonly frame: MarkObservationFrame;
    /**
     * THE MARK THE TIERS WERE PRICED FROM, returned rather than recomputed by the
     * caller. `generateProposal` used to call `markFrom` a SECOND time and then needed
     * an `isFeeMark` narrowing whose else-branch returned `{ kind: 'refused',
     * refusals: [] }` — a refusal carrying no refusal, which the route would have
     * rendered as an empty list reading "nothing happened". Threading the mark through
     * deletes the branch rather than commenting that it is unreachable.
     */
    readonly mark: FeeMark;
    /**
     * FALSE WHEN p25, MEDIAN AND p75 ARE THE SAME NUMBER.
     *
     * With K=5 and real clustered fees this is a likely shape — LCX's closed book has
     * many contracts at exactly $12,500 — and three identical prices presented as
     * Essential / Growth / Premium is a fabricated ladder. When it is false, `tiers`
     * holds FEWER THAN THREE entries: see `dedupeByPrice`.
     */
    readonly spreadObserved: boolean;
    readonly census: MarkStratumCensus;
  }
  | {
    readonly kind: 'refused';
    /** Non-empty by type — see `ProposalOutcome`'s note on the empty-refusals branch. */
    readonly refusals: readonly [MarkRefusal, ...MarkRefusal[]];
    readonly census: MarkStratumCensus;
  };

/**
 * THREE PRICES THAT ARE ONE PRICE ARE ONE TIER.
 *
 * The quantiles of a tight stratum coincide. Rendering `[$12,500, $12,500, $12,500]` as
 * a good/better/best ladder invents a spread the book does not contain, and the test
 * that was supposed to catch it was titled "keeps the tiers ascending" while asserting
 * `toBeLessThanOrEqual`, which passes on a flat list.
 *
 * So identical prices collapse. Where two tiers share a price the MEDIAN's row survives,
 * and that preference is a claim about inclusions, not a tie-break: the comparables that
 * produced the number were contracts for the standard package, so the median row's
 * inclusions are the ones the price was actually observed against. Keeping the Premium
 * row instead would hand a counterparty the marketing-and-liquidity bundle at a price
 * nobody paid for that bundle; keeping the Essential row would quietly trim what they
 * get at an unchanged price. Both are inventions about what LCX sold.
 *
 * What comes back is STRICTLY ascending by construction — one to three entries, each a
 * distinct observed total.
 */
const BASIS_PREFERENCE: Record<string, number> = { stratum_median: 0, stratum_p25: 1, stratum_p75: 2 };

function dedupeByPrice(tiers: readonly ProposalTier[], recommendPriceCents: number): ProposalTier[] {
  const byPrice = new Map<number, ProposalTier>();
  for (const t of tiers) {
    const held = byPrice.get(t.priceCents);
    const rank = BASIS_PREFERENCE[t.basis] ?? 99;
    if (held == null || rank < (BASIS_PREFERENCE[held.basis] ?? 99)) byPrice.set(t.priceCents, t);
  }
  return [...byPrice.values()]
    .sort((a, b) => a.priceCents - b.priceCents)
    // The recommendation is a PRICE, not a row: whichever tier survives at the median's
    // price carries it. Keying it off the row would leave nothing recommended whenever
    // the median's own row lost the collapse.
    .map((t) => ({ ...t, recommended: t.priceCents === recommendPriceCents }));
}

/**
 * Tiers anchored on the OBSERVED SPREAD of the comparable stratum:
 *   Essential — p25 of closed fees, trimmed inclusions
 *   Growth    — the median (recommended)
 *   Premium   — p75, plus the marketing and liquidity bundle
 *
 * The old version multiplied one invented number by two invented constants and then
 * rounded the results to $1,000. Every part of that is gone. `mark.ts` computes the
 * quantiles by nearest rank with no interpolation, so every price is a contract that
 * exists — and where the quantiles coincide there are fewer than three tiers, because
 * the book contains fewer than three prices.
 */
export function buildProposalTiers(packageType: string, input: PackageQuoteInput): ProposalTiers {
  const { mark, census } = markFrom(input);
  const refusals: MarkRefusal[] = [];
  const pkg = PACKAGES.find((p) => p.type === packageType);
  if (!pkg) refusals.push(PACKAGE_TYPE_UNKNOWN(packageType));
  if (!isFeeMark(mark)) refusals.push(...mark.refusals);
  const bad = nonEmpty(refusals);
  if (bad != null) return { kind: 'refused', refusals: bad, census };

  const m = mark as FeeMark;
  const base = pkg!.includes;
  const marketing = PACKAGES.find((p) => p.type === 'marketing')?.includes ?? [];
  const liquidity = PACKAGES.find((p) => p.type === 'liquidity')?.includes ?? [];

  const tiers = dedupeByPrice([
    {
      name: 'Essential',
      priceCents: m.p25Cents,
      basis: 'stratum_p25',
      inclusions: base.slice(0, Math.max(2, base.length - 1)),
      recommended: false,
    },
    {
      name: 'Growth',
      priceCents: m.medianCents,
      basis: 'stratum_median',
      inclusions: base,
      recommended: true,
    },
    {
      name: 'Premium',
      priceCents: m.p75Cents,
      basis: 'stratum_p75',
      inclusions: [...base, ...marketing.slice(0, 2), ...liquidity.slice(0, 1)],
      recommended: false,
    },
  ], m.medianCents);

  return {
    kind: 'tiers',
    frame: m.frame,
    mark: m,
    spreadObserved: tiers.length > 1,
    census,
    tiers,
  };
}

/**
 * A PRICE A HUMAN NEGOTIATED, WITH THE REASON RECORDED.
 *
 * WHY THIS EXISTS. `POST /v1/deals/:id/proposal` reads only the deal's package TYPE; it
 * never read `deal.packageValue`. So an operator who had hand-negotiated $50,000 and
 * PATCHed it onto the deal got one of two outcomes when they generated the document:
 * a 422 (the common case, since most projects on production cannot resolve a stratum),
 * leaving them with no proposal at any price; or a 200 that silently REWROTE their
 * $50,000 to the stratum median. Refusing to use the number and overwriting it were the
 * only two behaviours available, and the hand-priced path had quietly disappeared.
 *
 * It is an EXPLICIT REQUEST rather than an inference from the stored value, and that is
 * deliberate: `deals.package_value` carries no provenance column, so a stored number
 * could be a hand-negotiated price, a stratum median from an earlier run, or the
 * $20,000 literal this wave deleted. Guessing between those three is the collapse this
 * lane exists to remove. The operator says which, in the request, and says why.
 */
export interface OperatorSuppliedPrice {
  /** Integer cents, at least 1. */
  readonly priceCents: number;
  /** Who. Recorded on the document, not just in a log. */
  readonly operatorId: string;
  /** WHY. A hand price with no stated reason is an unsourced number — see the code. */
  readonly rationale: string;
}

/**
 * WHERE THE NUMBER ON THIS DOCUMENT CAME FROM. A discriminated union, so no surface can
 * read an operator's price as a book figure or vice versa.
 */
export type ProposalPricing =
  | {
    readonly basis: 'mark_to_contract';
    /** The mark this proposal was struck from, frame and all. */
    readonly mark: FeeMark;
    /** False ⇒ the stratum's quantiles coincided and there is only one price. */
    readonly spreadObserved: boolean;
  }
  | {
    readonly basis: 'operator_supplied';
    readonly operator: OperatorSuppliedPrice;
    readonly quotedAt: string;
    /**
     * WHAT THE BOOK SAID WHEN IT WAS ASKED. The book is consulted even when the price
     * comes from a human, and its refusals are recorded on the document — so nobody can
     * later read a hand price as though it had been marked, and nobody can claim the
     * book was never consulted.
     */
    readonly markRefusals: readonly MarkRefusal[];
  };

export interface ProposalSnapshot {
  projectName: string;
  projectTicker: string | null;
  packageType: string;
  /**
   * Integer cents: the mark's MEDIAN, or the operator's own figure — `pricing.basis`
   * says which. Field name unchanged because
   * `apps/web/src/pages/LeadDetail.tsx:1429` renders it and `apps/web/src/types/bd.ts`
   * declares its own copy of this interface — a rename would be a silent runtime
   * `undefined` on that screen, in a compartment this lane may not edit.
   */
  packageValue: number;
  jurisdiction: string | null;
  inclusions: string[];
  /**
   * Priced at the stratum's p25 / median / p75 — ONE TO THREE ENTRIES, because
   * coincident quantiles collapse rather than presenting one price three times. An
   * operator-supplied proposal carries exactly one tier: there is no observed spread
   * around a negotiated number, and manufacturing one would be the deleted multiplier
   * returning under a new name.
   */
  tiers: ProposalTier[];
  /**
   * The mark this proposal was struck from, or `null` when a human priced it.
   * `null` is not "no provenance" — `pricing` carries it. The field stays for the
   * readers that already reach for `mark.frame`.
   */
  mark: FeeMark | null;
  readonly pricing: ProposalPricing;
  /** One sentence a salesperson can read aloud when asked where the price came from. */
  priceBasis: string;
  claimsUsed: string[];
  disclaimer: string;
  generatedAt: string;
  validUntil: string;
}

export type ProposalOutcome =
  | { readonly kind: 'quoted'; readonly snapshot: ProposalSnapshot; readonly census: MarkStratumCensus }
  | {
    readonly kind: 'refused';
    /**
     * NON-EMPTY BY TYPE. A refused outcome whose reason list is empty renders as "a
     * refusal happened" followed by nothing — an empty list that reads as "nothing
     * happened", which the doctrine forbids. There was such a return in this file
     * (`{ kind: 'refused', refusals: [] }` on an unreachable branch); the branch is
     * gone and the type now makes the shape unconstructible.
     */
    readonly refusals: readonly [MarkRefusal, ...MarkRefusal[]];
    readonly census: MarkStratumCensus;
  };

/** The `refusals` array as a non-empty tuple, or `null` when it is empty. */
function nonEmpty(refusals: readonly MarkRefusal[]): readonly [MarkRefusal, ...MarkRefusal[]] | null {
  return refusals.length > 0 ? (refusals as readonly [MarkRefusal, ...MarkRefusal[]]) : null;
}

const PROPOSAL_DISCLAIMER =
  'This proposal is provided for informational purposes only and does not constitute a binding offer. All packages and pricing are subject to negotiation and final agreement. Regulatory compliance is subject to applicable laws.';

/** The provenance sentence. Assembled from the frame so it cannot drift from it. */
function priceBasisOf(m: FeeMark, spreadObserved: boolean): string {
  const f = m.frame;
  const window = f.windowBasis === 'observed_from_comparables' && f.windowFrom != null
    ? `closed between ${f.windowFrom.slice(0, 10)} and ${(f.windowTo ?? f.windowFrom).slice(0, 10)}`
    : 'close dates not recorded on these contracts';
  return `Priced from ${f.stratumN} comparable closed contracts (${f.stratum.mcap} cap, `
    + `${f.stratum.vol} turnover, category ${f.stratum.categoryFit ? 'fit' : 'unfit'}, `
    + `chain ${f.stratum.chainFit ? 'fit' : 'unfit'}), `
    + `${window}, observed on ${f.environment}. Line items: ${f.lineItemsObserved.join(' + ') || 'none'}; `
    + `${f.lineItemExcluded} is capital placed alongside a market maker and is EXCLUDED. `
    + `Quantiles by ${f.quantileMethod.replace(/_/g, ' ')}.`
    + (spreadObserved
      ? ''
      : ' The stratum\'s p25, median and p75 are the SAME total, so there is one observed price'
        + ' and one tier — the book shows no spread here.');
}

/**
 * The provenance sentence for a hand-negotiated price. It says, on the face of the
 * document, that the book did NOT produce this number — including what the book said
 * when it was asked.
 */
function operatorPriceBasisOf(p: OperatorSuppliedPrice, quotedAt: string, refusals: readonly MarkRefusal[]): string {
  const bookSaid = refusals.length > 0
    ? `LCX's closed book was consulted and refused: ${refusals.map((r) => r.code).join(', ')}.`
    : 'LCX\'s closed book could have priced this deal and was NOT used.';
  return `Priced BY HAND at $${(p.priceCents / 100).toLocaleString('en-US')} by ${p.operatorId} on `
    + `${quotedAt.slice(0, 10)}. Stated reason: ${p.rationale.trim()} `
    + `${bookSaid} This figure is NOT marked to any stratum of comparable contracts, carries no `
    + 'observation frame and no environment label, and must not be presented as a market rate.';
}

export function generateProposal(params: {
  projectName: string;
  projectTicker: string | null;
  packageType: string;
  jurisdiction: string | null;
  claimsUsed: string[];
  book: PackageQuoteInput;
  /**
   * Set to quote a HAND-NEGOTIATED price instead of marking to the book. The book is
   * still read (for the census and to record what it said), but it does not set the
   * price. See `OperatorSuppliedPrice`.
   */
  operatorPrice?: OperatorSuppliedPrice | null;
}): ProposalOutcome {
  const pkg = PACKAGES.find((p) => p.type === params.packageType);

  /* ── THE HAND-PRICED PATH ── */
  if (params.operatorPrice != null) {
    const op = params.operatorPrice;
    const { mark, census } = markFrom(params.book);
    const refusals: MarkRefusal[] = [];
    if (!pkg) refusals.push(PACKAGE_TYPE_UNKNOWN(params.packageType));
    if (!Number.isInteger(op.priceCents) || op.priceCents < 1
      || op.operatorId.trim() === '' || op.rationale.trim() === '') {
      refusals.push(OPERATOR_PRICE_NOT_A_PRICE(op));
    }
    const bad = nonEmpty(refusals);
    if (bad != null) return { kind: 'refused', refusals: bad, census };

    const quotedAt = new Date().toISOString();
    const markRefusals = isFeeMark(mark) ? [] : mark.refusals;
    return {
      kind: 'quoted',
      census,
      snapshot: {
        projectName: params.projectName,
        projectTicker: params.projectTicker,
        packageType: params.packageType,
        packageValue: op.priceCents,
        jurisdiction: params.jurisdiction,
        inclusions: pkg?.includes ?? [],
        // ONE tier. A negotiated number has no observed spread around it, and inventing
        // one is the 0.7x / 1.6x multiplier this wave deleted, wearing a new label.
        tiers: [{
          name: 'Proposed',
          priceCents: op.priceCents,
          basis: 'operator_supplied',
          inclusions: pkg?.includes ?? [],
          recommended: true,
        }],
        mark: null,
        pricing: { basis: 'operator_supplied', operator: op, quotedAt, markRefusals },
        priceBasis: operatorPriceBasisOf(op, quotedAt, markRefusals),
        claimsUsed: params.claimsUsed,
        disclaimer: PROPOSAL_DISCLAIMER,
        generatedAt: quotedAt,
        validUntil: new Date(Date.parse(quotedAt) + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  /* ── THE MARKED PATH ── */
  const tiers = buildProposalTiers(params.packageType, params.book);
  // No narrowing needed: `ProposalTiers`'s refused variant is itself a non-empty tuple,
  // so the empty reason list is unconstructible upstream rather than checked here.
  if (tiers.kind === 'refused') return { kind: 'refused', refusals: tiers.refusals, census: tiers.census };

  // The mark rides back ON the tiers result. It used to be recomputed here with a second
  // `markFrom` call, which needed an else-branch that returned an empty refusals array.
  const m = tiers.mark;
  return {
    kind: 'quoted',
    census: tiers.census,
    snapshot: {
      projectName: params.projectName,
      projectTicker: params.projectTicker,
      packageType: params.packageType,
      packageValue: m.medianCents,
      jurisdiction: params.jurisdiction,
      inclusions: pkg?.includes ?? [],
      tiers: [...tiers.tiers],
      mark: m,
      pricing: { basis: 'mark_to_contract', mark: m, spreadObserved: tiers.spreadObserved },
      priceBasis: priceBasisOf(m, tiers.spreadObserved),
      claimsUsed: params.claimsUsed,
      disclaimer: PROPOSAL_DISCLAIMER,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}
