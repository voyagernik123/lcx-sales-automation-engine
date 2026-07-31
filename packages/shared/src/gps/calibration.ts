/**
 * GPS CALIBRATION — the quarterly review instrument, sized for ~29 engagements a
 * year.
 *
 * WHAT THIS FILE IS NOT, STATED FIRST BECAUSE IT IS THE WHOLE DESIGN.
 * This is not a learning loop. It cannot be, and pretending otherwise is the
 * failure mode this programme exists to avoid (`GPS_IMPLEMENTATION_PLAN.md` §8:
 * "ontology / missions / agent graph … This is the vanity-project surface").
 * The plan is explicit at §7: "With ~29 outcomes a year, weights cannot be
 * learned. They are a **stated prior**, reviewed quarterly against won/lost".
 *
 * Do the arithmetic once, here, so nobody has to re-derive it in a review
 * meeting. ~29 engagements/year across 5 offers (`OFFER_KEYS`, `types.ts:68`) is
 * ~6 outcomes per offer per year. The Phase-4 prior has six factors (`need`,
 * `abilityToPay`, `urgency`, `access`, `expectedMargin`, `deliveryComplexity` —
 * plan §7).
 * Six free parameters fitted to six observations per offer is not a model, it is
 * an interpolation of noise; and the whole dataset (29) is smaller than a single
 * quarter of a real sales pipeline. Any function in this file that returned a
 * fitted weight would be lying about its evidence.
 *
 * So what this file DOES:
 *   1. Records outcomes in a closed vocabulary (`OutcomeRecord`), so the reasons
 *      are countable rather than free text nobody can aggregate.
 *   2. Counts won/lost per offer, and REFUSES to express a rate below a stated
 *      threshold (`MIN_N_FOR_RATE`) — "33% win rate" off three deals is the most
 *      common way a small services business talks itself into a bad decision.
 *   3. Measures quoted-vs-realised MARGIN per offer and per partner. This is the
 *      single most important number in a partner-delivered business and almost
 *      nothing in the repo tracks it: a grep for `margin` / `cost_cents` across
 *      every migration in `apps/api/src/db/migrations/` that predates
 *      `0047_gps.sql` returns nothing at all, which is why `vendorCostCents` had
 *      to be first-class in Phase 1 (`types.ts:161`) and why realisation has to
 *      be measured here rather than assumed.
 *   4. Produces a REVIEW PACKET for a human (`weightReviewPacket`). It never
 *      adjusts a weight. The type system says so: `autoAdjustmentApplied: false`
 *      is a literal-typed field, so a future edit that starts auto-tuning cannot
 *      keep this shape without a compile error.
 *   5. States, in plain language, what the current data volume can and cannot
 *      support (`calibrationHealth`) — including "not a model, and not on this
 *      timescale".
 *
 * Pure and total: no I/O, no DB, no LLM, no clock. Every function is a fold over
 * an array the caller supplies. Money is integer cents throughout, matching
 * `types.ts:26`; a variance is therefore in cents², which is an awkward unit and
 * the honest one — see `MarginGroup.slippageVarianceCents2`.
 *
 * THERE IS NO STORAGE FOR ANY OF THIS YET, and that is stated here rather than
 * discovered later. `0047_gps.sql` creates `gps_client`, `gps_engagement` and
 * `gps_conflict_check` and nothing else: there is no outcome table, and no
 * realised-price or realised-vendor-cost column anywhere (`0047_gps.sql:168`
 * stores only the QUOTED `vendor_cost_cents`, and notes that margin is derived,
 * never stored). So `OutcomeRecord` is a shape a caller must assemble by hand
 * today; the functions below are complete and tested, and the persistence they
 * would read from is not built. Treat every reference to "records on file" as
 * "records the caller supplied".
 */
import { OFFER_KEYS, marginCents, marginPct, type OfferKey } from './types.js';

/* ── Closed vocabularies ──────────────────────────────────────────────────── */

/**
 * The two outcomes that are calibration evidence.
 *
 * `cancelled` engagements (`EngagementStatus`, `types.ts:227`) are deliberately
 * NOT here: a client who cancels after acceptance tells us about delivery, not
 * about whether the offer sells. That exclusion is a survivorship bias and this
 * comment is the disclosure — `calibrationHealth` repeats it in prose, because a
 * bias nobody is told about is indistinguishable from a mistake.
 */
export type OutcomeDisposition = 'won' | 'lost';

/**
 * Why we won — closed, and short on purpose.
 *
 * Free text cannot be counted, and a 20-value enum is never populated
 * consistently by one person. These seven are the distinctions that would change
 * a decision: if `referral` and `existing_relationship` dominate, the answer is
 * to work the network, not to build a discovery engine (plan §8).
 */
export type WinReason =
  | 'referral'
  | 'existing_relationship'
  | 'regulatory_deadline'
  | 'price'
  | 'speed_to_start'
  | 'partner_credibility'
  | 'sole_bidder'
  | 'unknown';

/**
 * Why we lost. `no_decision` is separated from `lost_to_competitor` because they
 * demand opposite responses — one is a qualification failure, the other a
 * positioning failure — and lumping them into "lost" hides which one is
 * happening.
 */
export type LossReason =
  | 'price_too_high'
  | 'no_budget'
  | 'timing_wrong'
  | 'lost_to_competitor'
  | 'did_it_in_house'
  | 'no_decision'
  | 'scope_mismatch'
  | 'conflict_or_compliance_block'
  | 'no_partner_available'
  | 'unknown';

export type OutcomeReason = WinReason | LossReason;

export const WIN_REASONS: readonly WinReason[] = [
  'referral', 'existing_relationship', 'regulatory_deadline', 'price',
  'speed_to_start', 'partner_credibility', 'sole_bidder', 'unknown',
] as const;

export const LOSS_REASONS: readonly LossReason[] = [
  'price_too_high', 'no_budget', 'timing_wrong', 'lost_to_competitor',
  'did_it_in_house', 'no_decision', 'scope_mismatch',
  'conflict_or_compliance_block', 'no_partner_available', 'unknown',
] as const;

/**
 * `unknown` is in BOTH lists, which is why this is a function and not a Record
 * lookup. Keeping `unknown` legal for both dispositions matters: the alternative
 * is that a rushed entry picks a plausible-sounding reason, and an invented
 * reason is worse than an admitted gap — it survives into a count and gets acted
 * on.
 */
export function isReasonValidFor(disposition: OutcomeDisposition, reason: OutcomeReason): boolean {
  return disposition === 'won'
    ? (WIN_REASONS as readonly string[]).includes(reason)
    : (LOSS_REASONS as readonly string[]).includes(reason);
}

/* ── The record ───────────────────────────────────────────────────────────── */

/**
 * One decided engagement. The unit of everything in this file.
 *
 * QUOTED vs REALISED is the axis the whole record is built around, and it is
 * four fields rather than two because both sides of the margin move: price
 * drifts down in negotiation and vendor cost drifts up in delivery, and a single
 * "final margin" number cannot tell you which happened. At $10–25k with a
 * partner delivering, one scope overrun eats the engagement (`types.ts:157`), so
 * the review must be able to name the side that leaked.
 *
 * Nulls are meaningful, never zero-filled: a lost deal has no realised price,
 * and `realisedPriceCents: 0` would drag every mean toward zero.
 *
 * TWO FIELDS ARE RECORDED AND NOT YET AGGREGATED, stated so nobody infers a
 * capability from a field name: nothing in this file summarises `cycleTimeDays`
 * or `acceptanceFirstPass`. They are captured now because they are unrecoverable
 * later — nobody reconstructs whether a deliverable passed first time eighteen
 * months on — and because at current volume a mean cycle time over 3 engagements
 * would be exactly the kind of number `MIN_N_FOR_RATE` exists to suppress. When
 * there are enough of them, they get their own function and their own threshold.
 */
export interface OutcomeRecord {
  /** `gps_engagement.id`. The join key back to the frozen scope snapshot. */
  engagementId: string;
  /**
   * Carried on every GPS row from the first migration (plan §4 S0.3). Present
   * here so a future "which clients churn" question does not need a backfill —
   * this file does not group by it today, and does not pretend to.
   */
  clientId: string;
  offerKey: OfferKey;
  disposition: OutcomeDisposition;
  /** Must satisfy `isReasonValidFor(disposition, reason)`; validated at the edge. */
  reason: OutcomeReason;

  /** What we put on the proposal, integer cents. Always known. */
  quotedPriceCents: number;
  /** What was actually invoiced. Null for `lost`, and for won-but-not-yet-billed. */
  realisedPriceCents: number | null;
  /** What we expected to pay the partner at quote time, integer cents. */
  quotedVendorCostCents: number;
  /** What the partner actually invoiced. Null until the partner has billed. */
  realisedVendorCostCents: number | null;

  /** First contact to decision, whole days. Null when the start date is unknown. */
  cycleTimeDays: number | null;
  /**
   * Did the client accept the deliverable without a rework round?
   *
   * The closest thing to a partner-quality metric that exists without a survey,
   * and it is the leading indicator of the reputational risk that IS the moat:
   * rework is a failed delivery that has not admitted it yet. Null for `lost`
   * and for anything not yet delivered — NOT false, because "no delivery" and
   * "failed first pass" are opposite facts.
   */
  acceptanceFirstPass: boolean | null;
  /** Partner/specialist identifier. Null when unstaffed or delivered in-house. */
  partner: string | null;

  /**
   * The Phase-4 factor scores AS THEY WERE AT QUOTE TIME, keyed by factor name.
   *
   * Snapshotted rather than recomputed, for the same reason `scopeSnapshot`
   * exists (`types.ts:328`): the scoring code is versioned and will change, and
   * a review of "did the prior discriminate" is meaningless if the inputs have
   * been silently re-derived under a newer definition. Null when the engagement
   * predates scoring — `weightReviewPacket` counts those as absent evidence
   * rather than treating a missing factor as 0.
   */
  factorScoresAtQuote: Readonly<Record<string, number>> | null;

  /** ISO-8601 date the outcome was decided. Used only for ordering/windowing. */
  decidedAt: string;
}

/* ── Stated thresholds ────────────────────────────────────────────────────── */

/**
 * The volume assumption everything here is sized against. ~29 engagements/year
 * is the founder's own realistic figure, not a target.
 */
export const ASSUMED_ANNUAL_ENGAGEMENT_VOLUME = 29;

/**
 * Below this many decided engagements in a group, `winLossSummary` returns the
 * raw counts and a NULL rate.
 *
 * WHY 8, ARGUED RATHER THAN ASSERTED. The threshold's job is to make the
 * reported number less misleading than the counts it replaces. Take the honest
 * measure — a Wilson 95% interval at the worst case p̂ = 0.5:
 *
 *   n = 3  → roughly 12%–88%   (a 76-point interval; the "33% win rate" case)
 *   n = 8  → roughly 22%–78%   (56 points)
 *   n = 20 → roughly 30%–70%   (40 points)
 *
 * None of these is good. There is no n available at 29 engagements/year that
 * makes a win rate a decision-grade number, so picking 8 is not a claim that 8
 * is sufficient — it is the point where the interval stops spanning almost the
 * entire range and a reader can at least see the width. 8 is also ~14 months of
 * a single offer's volume (29 ÷ 5 offers ≈ 5.8/yr), i.e. it deliberately means
 * MOST OFFERS WILL SHOW NULL FOR OVER A YEAR. That is the correct behaviour, and
 * `interval95Pct` is returned alongside every non-null rate so the width travels
 * with the number instead of being dropped in the retelling.
 *
 * Reviewed quarterly by a human alongside the weights; not tuned by code.
 */
export const MIN_N_FOR_RATE = 8;

/**
 * Minimum records per ARM (won and lost separately) before `weightReviewPacket`
 * will describe a factor as having apparently separated the two.
 *
 * 5 because below that a single engagement moves an arm's mean by more than 20%,
 * so the "separation" is one deal's idiosyncrasy. Per-arm, not total: 12 wins and
 * 1 loss carries no information about what distinguishes them.
 */
export const MIN_N_PER_ARM_FOR_SEPARATION = 5;

/**
 * |standardised separation| below this reads as "no apparent separation".
 *
 * 0.5 is Cohen's conventional medium-effect boundary. Used as a floor, not a
 * test: at n≈5–10 per arm a d of 0.3 is indistinguishable from noise, and
 * reporting it as a finding would invite a weight change on nothing. Nothing in
 * this file computes a p-value, because a p-value at these n would be decoration
 * that lends false authority.
 */
export const MIN_STANDARDISED_SEPARATION = 0.5;

/* ── Small internal helpers ───────────────────────────────────────────────── */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Sample variance with the n−1 (Bessel) denominator, and null for n < 2.
 *
 * n−1 because these are samples of an ongoing process, not a census of a fixed
 * population — the population variance would understate dispersion, which is the
 * wrong direction to be wrong in when the number being estimated is margin risk.
 * Null rather than 0 at n = 1: one observation has no dispersion, and a printed
 * 0 would read as "perfectly consistent".
 */
function sampleVariance(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Wilson score interval for a binomial proportion, 95% (z = 1.96), returned in
 * whole percentage points.
 *
 * Wilson rather than the normal approximation p̂ ± z·√(p̂(1−p̂)/n): at n < 30 the
 * normal interval is both too narrow and capable of returning bounds outside
 * [0, 1], and an interval that says "−4% to 70%" destroys trust in the whole
 * instrument.
 */
export function wilson95Pct(successes: number, n: number): { lowPct: number; highPct: number } | null {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || n <= 0 || successes < 0 || successes > n) return null;
  const z = 1.96;
  const p = successes / n;
  const z2n = (z * z) / n;
  const denom = 1 + z2n;
  const centre = (p + z2n / 2) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const lo = Math.max(0, centre - half);
  const hi = Math.min(1, centre + half);
  return { lowPct: Math.round(lo * 100), highPct: Math.round(hi * 100) };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* WIN / LOSS                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Counts and, only if earned, a rate. */
export interface WinLossAggregate {
  won: number;
  lost: number;
  /** won + lost. The name is `sampleSize` and not `total` on purpose: it is the
   *  thing a reader must see next to any rate, so it is named as statistics. */
  sampleSize: number;
  /**
   * Win rate in whole percent, or NULL when `sampleSize < MIN_N_FOR_RATE`.
   *
   * Null is the load-bearing behaviour of this module. A caller that wants to
   * print something must handle the null branch, which forces the UI to show
   * "2 won / 1 lost" instead of "67%".
   */
  winRatePct: number | null;
  /** Wilson 95% interval, present exactly when `winRatePct` is. */
  interval95Pct: { lowPct: number; highPct: number } | null;
  /** True when the rate was withheld. Explicit so a UI need not compare to a const. */
  rateSuppressed: boolean;
  /** Plain-language reason, or null when a rate was expressed. */
  suppressionReason: string | null;
}

export interface WinLossRow extends WinLossAggregate {
  offerKey: OfferKey;
  /** Loss reasons by descending count, then alphabetical for determinism. */
  topLossReasons: Array<{ reason: LossReason; count: number }>;
  /** Win reasons by descending count, then alphabetical. */
  topWinReasons: Array<{ reason: WinReason; count: number }>;
}

export interface WinLossSummary {
  /**
   * One row per offer in catalogue order — INCLUDING offers with zero outcomes.
   * A missing row is invisible; a row reading "0 won / 0 lost" is the finding
   * that the offer has never been decided, which is exactly what a review of a
   * five-offer catalogue needs to see.
   */
  byOffer: WinLossRow[];
  /** All offers pooled. Reaches `MIN_N_FOR_RATE` long before any single offer. */
  overall: WinLossAggregate;
  /** Echoed so a rendered report carries its own threshold. */
  minNForRate: number;
}

function countBy<T extends string>(values: T[]): Array<{ reason: T; count: number }> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function aggregate(records: OutcomeRecord[]): WinLossAggregate {
  const won = records.filter((r) => r.disposition === 'won').length;
  const lost = records.filter((r) => r.disposition === 'lost').length;
  const sampleSize = won + lost;
  if (sampleSize < MIN_N_FOR_RATE) {
    return {
      won,
      lost,
      sampleSize,
      winRatePct: null,
      interval95Pct: null,
      rateSuppressed: true,
      suppressionReason:
        sampleSize === 0
          ? 'No decided engagements — nothing to express a rate over.'
          : `${sampleSize} decided engagement${sampleSize === 1 ? '' : 's'} is below the stated minimum of ${MIN_N_FOR_RATE}; reporting counts only.`,
    };
  }
  return {
    won,
    lost,
    sampleSize,
    winRatePct: Math.round((won / sampleSize) * 100),
    interval95Pct: wilson95Pct(won, sampleSize),
    rateSuppressed: false,
    suppressionReason: null,
  };
}

/**
 * Win/loss by offer, with the n attached and the rate withheld below threshold.
 *
 * Worked example, and the reason the function exists. Three `mica_whitepaper`
 * outcomes — one won, two lost — produce `{ won: 1, lost: 2, sampleSize: 3,
 * winRatePct: null }`, not 33%. A 33% would then be compared against a
 * `gtm_sprint` "50%" computed off two deals, and the catalogue would get pruned
 * on the strength of five data points. The counts are the finding; the rate is
 * not available yet, and saying so is the product.
 */
export function winLossSummary(records: readonly OutcomeRecord[]): WinLossSummary {
  const all = [...records];
  const byOffer = OFFER_KEYS.map<WinLossRow>((offerKey) => {
    const rs = all.filter((r) => r.offerKey === offerKey);
    return {
      offerKey,
      ...aggregate(rs),
      topLossReasons: countBy(
        rs.filter((r) => r.disposition === 'lost').map((r) => r.reason as LossReason),
      ),
      topWinReasons: countBy(
        rs.filter((r) => r.disposition === 'won').map((r) => r.reason as WinReason),
      ),
    };
  });
  return { byOffer, overall: aggregate(all), minNForRate: MIN_N_FOR_RATE };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* MARGIN REALISATION                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Where a partner-delivered engagement's margin is credited when no partner is
 * named — in-house delivery, or delivery that was never attributed.
 *
 * These records are NOT dropped from `byPartner`. If they were, the per-partner
 * groups would not reconcile to `overall`, and a reconciliation gap is exactly
 * where a margin problem hides: the deals nobody owns are the deals nobody
 * checked.
 */
export const UNATTRIBUTED_PARTNER = '(unattributed)';

/**
 * Quoted vs realised margin for one grouping (an offer, a partner, or all).
 *
 * Every cents figure is an integer. `slippageVarianceCents2` is in cents SQUARED
 * — a genuinely awkward unit that is kept because the alternative (silently
 * converting to dollars², or reporting only the standard deviation) hides that
 * variance is not on the same scale as the mean. Read `slippageStdDevCents`.
 */
export interface MarginGroup {
  kind: 'offer' | 'partner' | 'overall';
  /** Offer key, partner name, or `'ALL'`. */
  key: string;
  /** Engagements with COMPLETE quoted and realised figures. Denominator of every mean. */
  n: number;

  quotedMarginMeanCents: number;
  realisedMarginMeanCents: number;
  /** Mean of per-engagement gross margin % (of price), skipping engagements with no price. */
  quotedMarginPctMean: number | null;
  realisedMarginPctMean: number | null;

  /**
   * realised − quoted margin, mean, cents. NEGATIVE means margin was given away.
   * Signed, never absolute: the sign is the entire message.
   */
  slippageMeanCents: number;
  /** Sample variance (n−1) of margin slippage, cents². Null when n < 2. */
  slippageVarianceCents2: number | null;
  /** √variance, cents. Null when n < 2. The number to quote in a review. */
  slippageStdDevCents: number | null;
  /** The single worst (most negative) slippage observed. Null when n = 0. */
  worstSlippageCents: number | null;
  /** The best (most positive) slippage observed. Null when n = 0. */
  bestSlippageCents: number | null;

  /**
   * Which side leaked. `slippage ≈ priceSlippage − costSlippage`, so a review can
   * say "we discounted" versus "the partner overran" instead of only "margin was
   * down". Each may differ from the identity by ±1 cent because all three are
   * rounded independently from unrounded means.
   */
  priceSlippageMeanCents: number;
  costSlippageMeanCents: number;

  /** Engagements delivered at a REALISED loss. A count, not a rate — see MIN_N_FOR_RATE. */
  negativeRealisedMarginCount: number;
}

/** One engagement reduced to the four numbers this section needs. */
interface Realised {
  quotedMargin: number;
  realisedMargin: number;
  quotedPct: number | null;
  realisedPct: number | null;
  priceSlip: number;
  costSlip: number;
}

/** Complete = won, with both realised figures present. Anything else is excluded and counted. */
function toRealised(r: OutcomeRecord): Realised | null {
  if (r.disposition !== 'won') return null;
  if (!isNum(r.realisedPriceCents) || !isNum(r.realisedVendorCostCents)) return null;
  if (!isNum(r.quotedPriceCents) || !isNum(r.quotedVendorCostCents)) return null;
  return {
    quotedMargin: marginCents(r.quotedPriceCents, r.quotedVendorCostCents),
    realisedMargin: marginCents(r.realisedPriceCents, r.realisedVendorCostCents),
    quotedPct: marginPct(r.quotedPriceCents, r.quotedVendorCostCents),
    realisedPct: marginPct(r.realisedPriceCents, r.realisedVendorCostCents),
    priceSlip: Math.round(r.realisedPriceCents) - Math.round(r.quotedPriceCents),
    costSlip: Math.round(r.realisedVendorCostCents) - Math.round(r.quotedVendorCostCents),
  };
}

function meanOfDefined(xs: Array<number | null>): number | null {
  const ys = xs.filter(isNum);
  return ys.length ? Math.round(mean(ys)) : null;
}

function marginGroup(kind: MarginGroup['kind'], key: string, rows: Realised[]): MarginGroup {
  const slips = rows.map((r) => r.realisedMargin - r.quotedMargin);
  const variance = sampleVariance(slips);
  return {
    kind,
    key,
    n: rows.length,
    quotedMarginMeanCents: Math.round(mean(rows.map((r) => r.quotedMargin))),
    realisedMarginMeanCents: Math.round(mean(rows.map((r) => r.realisedMargin))),
    quotedMarginPctMean: meanOfDefined(rows.map((r) => r.quotedPct)),
    realisedMarginPctMean: meanOfDefined(rows.map((r) => r.realisedPct)),
    slippageMeanCents: Math.round(mean(slips)),
    slippageVarianceCents2: variance == null ? null : Math.round(variance),
    slippageStdDevCents: variance == null ? null : Math.round(Math.sqrt(variance)),
    worstSlippageCents: slips.length ? Math.min(...slips) : null,
    bestSlippageCents: slips.length ? Math.max(...slips) : null,
    priceSlippageMeanCents: Math.round(mean(rows.map((r) => r.priceSlip))),
    costSlippageMeanCents: Math.round(mean(rows.map((r) => r.costSlip))),
    negativeRealisedMarginCount: rows.filter((r) => r.realisedMargin < 0).length,
  };
}

export interface MarginRealisation {
  /** Offers that have at least one complete engagement, in catalogue order. */
  byOffer: MarginGroup[];
  /**
   * Partners, WORST MEAN SLIPPAGE FIRST — this is an action list, and the partner
   * quoting accurately does not need attention. Ties broken by key for
   * determinism.
   */
  byPartner: MarginGroup[];
  /** All complete engagements pooled. Null when there are none. */
  overall: MarginGroup | null;
  /** Won engagements skipped because a realised figure was still null. */
  excludedIncompleteRealisation: number;
  /** Lost engagements. No margin was realised on them; they are not a data gap. */
  excludedLost: number;
  /** Offers with zero complete engagements — the blind spots, named. */
  offersWithNoRealisationData: OfferKey[];
}

/**
 * Quoted vs realised margin, per offer and per partner, with the dispersion.
 *
 * WHY THIS IS THE MOST IMPORTANT FUNCTION HERE. Partners deliver; the founder
 * sells and coordinates. Margin is price − vendor cost (`marginCents`,
 * `types.ts:268`) and at a $10–25k ticket a single scope overrun eats the deal.
 * Nothing in the platform has ever measured it: `vendor_cost_cents` arrives with
 * `0047_gps.sql`, and before that a grep for margin or cost across the 47
 * migrations finds nothing. So the first quarter this runs, the honest answer is
 * mostly `offersWithNoRealisationData` — and that list is itself the finding.
 *
 * Worked example. One won `gtm_sprint`: quoted $20,000 on an $8,000 partner cost
 * (margin $12,000); realised $19,000 invoiced against a $10,000 partner invoice
 * (margin $9,000). Slippage is −$3,000, of which −$1,000 is discount and $2,000
 * is cost overrun — `priceSlippageMeanCents: -100_000` and
 * `costSlippageMeanCents: 200_000`. One engagement gives no variance
 * (`slippageVarianceCents2: null`), which is the point: one overrun is an
 * anecdote, and this function refuses to dress it as a trend.
 */
export function marginRealisation(records: readonly OutcomeRecord[]): MarginRealisation {
  const all = [...records];
  const paired = all
    .map((r) => ({ record: r, realised: toRealised(r) }))
    .filter((p): p is { record: OutcomeRecord; realised: Realised } => p.realised != null);

  const byOffer = OFFER_KEYS.map((offerKey) => {
    const rows = paired.filter((p) => p.record.offerKey === offerKey).map((p) => p.realised);
    return rows.length ? marginGroup('offer', offerKey, rows) : null;
  }).filter((g): g is MarginGroup => g != null);

  const partnerKeys = [...new Set(paired.map((p) => p.record.partner ?? UNATTRIBUTED_PARTNER))];
  const byPartner = partnerKeys
    .map((key) =>
      marginGroup(
        'partner',
        key,
        paired.filter((p) => (p.record.partner ?? UNATTRIBUTED_PARTNER) === key).map((p) => p.realised),
      ),
    )
    .sort((a, b) => a.slippageMeanCents - b.slippageMeanCents || a.key.localeCompare(b.key));

  const covered = new Set(byOffer.map((g) => g.key));
  return {
    byOffer,
    byPartner,
    overall: paired.length ? marginGroup('overall', 'ALL', paired.map((p) => p.realised)) : null,
    excludedIncompleteRealisation: all.filter((r) => r.disposition === 'won' && toRealised(r) == null).length,
    excludedLost: all.filter((r) => r.disposition === 'lost').length,
    offersWithNoRealisationData: OFFER_KEYS.filter((k) => !covered.has(k)),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* WEIGHT REVIEW — for a human, quarterly                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The Phase-4 prior, keyed by factor name — `need`, `abilityToPay`, `urgency`,
 * `access`, `expectedMargin`, `deliveryComplexity` (the six terms of plan §7).
 *
 * Typed as an open `Record<string, number>` rather than importing the targeting
 * module's own weight type ON PURPOSE: this file must not become a reason the
 * scoring module cannot add or rename a factor, and calibration reviewing
 * targeting is the right direction for a dependency to point — not the reverse.
 * `TargetingWeights` is declared there as `Record<TargetFactorKey, number>`,
 * which is assignable to this type, so a caller passes `WEIGHTS_V1` directly with
 * no adapter. (Had it been declared as an `interface`, it would NOT be assignable
 * — interfaces get no implicit index signature — and this comment is here so the
 * next person understands why that declaration style matters.)
 *
 * The cost of the open record is that a typo in a factor name shows up as a
 * zero-evidence row rather than a compile error, which is why unrecognised
 * factors are reported explicitly (`weighted: false`) instead of being dropped.
 */
export type PriorWeights = Readonly<Record<string, number>>;

export type FactorVerdict =
  | 'insufficient_evidence'
  | 'no_apparent_separation'
  | 'apparent_separation_toward_won'
  | 'apparent_separation_toward_lost';

export interface FactorReviewRow {
  factor: string;
  /** Null when the factor was observed in snapshots but carries no weight. */
  currentWeight: number | null;
  /** False for an observed-but-unweighted factor. */
  weighted: boolean;
  nWon: number;
  nLost: number;
  /** Mean factor score among won engagements, 2 dp. Null when the arm is empty. */
  meanWhenWon: number | null;
  meanWhenLost: number | null;
  /** meanWhenWon − meanWhenLost, 2 dp. Null when either arm is empty. */
  separation: number | null;
  /**
   * Cohen's d — separation ÷ pooled standard deviation, 2 dp. Null when either
   * arm has n < 2 or the pooled sd is 0. Reported instead of a p-value because a
   * p-value at n≈6 per arm would lend false authority to noise.
   */
  standardisedSeparation: number | null;
  verdict: FactorVerdict;
  /** One sentence a reviewer can read aloud. Never phrased as a recommendation. */
  note: string;
}

export interface WeightReviewPacket {
  recordsConsidered: number;
  recordsWithFactorScores: number;
  /** Engagements decided before scoring existed. Absent evidence, not zero evidence. */
  recordsMissingFactorScores: number;
  factors: FactorReviewRow[];

  /**
   * The weights EXACTLY as supplied — a frozen shallow copy, byte-identical in
   * value to the input.
   *
   * This function DOES NOT ADJUST WEIGHTS, and that is a design decision rather
   * than an unfinished feature. Plan §7: with ~29 outcomes a year the weights are
   * a stated prior reviewed quarterly. Six factors fitted to a few dozen
   * outcomes, most of which share a handful of loss reasons, produces a weight
   * vector that tracks last quarter's luck; and because the score decides who
   * gets pursued, the fitted weights would then generate the very data that
   * confirms them. The loop is not merely underpowered, it is self-fulfilling.
   * A human changes the prior, or nobody does.
   */
  weightsReviewed: PriorWeights;
  /** Literal `false`. A future auto-tuner cannot satisfy this type. */
  autoAdjustmentApplied: false;
  /** Literal `true`. There is no code path that acts on this packet. */
  humanReviewRequired: true;
  headline: string;
  /** Caveats that must travel with the numbers into the review meeting. */
  caveats: string[];
}

/** Cohen's d with the pooled sample sd. Null when it cannot be computed honestly. */
function cohensD(wonVals: number[], lostVals: number[]): number | null {
  const vw = sampleVariance(wonVals);
  const vl = sampleVariance(lostVals);
  if (vw == null || vl == null) return null;
  const dfW = wonVals.length - 1;
  const dfL = lostVals.length - 1;
  const pooled = Math.sqrt((dfW * vw + dfL * vl) / (dfW + dfL));
  if (!(pooled > 0)) return null; // zero within-arm spread: separation is undefined, not infinite
  return (mean(wonVals) - mean(lostVals)) / pooled;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * What a human needs in order to review the Phase-4 prior for a quarter.
 *
 * Reads: for each weighted factor, did it actually run higher on the deals we
 * won than on the deals we lost, and on how many observations? Where the honest
 * answer is "we cannot tell", the verdict is `insufficient_evidence` — which at
 * ~29 engagements/year will be most rows for a long time, and is the intended
 * output rather than a failure of the function.
 *
 * DIRECTION IS NOT CORRECTNESS. `apparent_separation_toward_lost` does not mean a
 * factor is broken: `deliveryComplexity` is SUBTRACTED in the plan's formula
 * (§7), so scoring higher on lost deals is the direction it was designed to have.
 * This function does not know any factor's intended sign, and inventing one would
 * be the first step toward auto-adjustment. It reports; the reviewer interprets.
 */
export function weightReviewPacket(
  records: readonly OutcomeRecord[],
  currentWeights: PriorWeights,
): WeightReviewPacket {
  const all = [...records];
  const scored = all.filter((r) => r.factorScoresAtQuote != null);

  // Weighted factors first, in the caller's own key order (so a rendered packet
  // matches the scoring module's presentation), then any factor seen in a
  // snapshot but absent from the weights, alphabetically.
  const weightedKeys = Object.keys(currentWeights);
  const observedKeys = [...new Set(scored.flatMap((r) => Object.keys(r.factorScoresAtQuote ?? {})))]
    .filter((k) => !weightedKeys.includes(k))
    .sort();

  const factors = [...weightedKeys, ...observedKeys].map<FactorReviewRow>((factor) => {
    const valuesFor = (d: OutcomeDisposition): number[] =>
      scored
        .filter((r) => r.disposition === d)
        .map((r) => r.factorScoresAtQuote?.[factor])
        .filter(isNum);
    const wonVals = valuesFor('won');
    const lostVals = valuesFor('lost');
    const nWon = wonVals.length;
    const nLost = lostVals.length;
    const mWon = nWon ? round2(mean(wonVals)) : null;
    const mLost = nLost ? round2(mean(lostVals)) : null;
    const separation = mWon != null && mLost != null ? round2(mWon - mLost) : null;
    const d = nWon && nLost ? cohensD(wonVals, lostVals) : null;
    const dRounded = d == null ? null : round2(d);
    const weighted = weightedKeys.includes(factor);

    let verdict: FactorVerdict;
    let note: string;
    if (nWon < MIN_N_PER_ARM_FOR_SEPARATION || nLost < MIN_N_PER_ARM_FOR_SEPARATION) {
      verdict = 'insufficient_evidence';
      note = `${nWon} won / ${nLost} lost scored engagements; ${MIN_N_PER_ARM_FOR_SEPARATION} of each is the stated minimum before any separation is described. No conclusion available.`;
    } else if (dRounded == null) {
      verdict = 'insufficient_evidence';
      note = 'Scores show no spread within one or both arms, so a standardised separation is undefined. Check whether this factor is actually being varied at quote time.';
    } else if (Math.abs(dRounded) < MIN_STANDARDISED_SEPARATION) {
      verdict = 'no_apparent_separation';
      note = `Means differ by ${separation} (d=${dRounded}), below the ${MIN_STANDARDISED_SEPARATION} floor this instrument will call a separation at these sample sizes.`;
    } else if (dRounded > 0) {
      verdict = 'apparent_separation_toward_won';
      note = `Scored higher on won engagements (${mWon} vs ${mLost}, d=${dRounded}) on ${nWon}+${nLost} observations. Apparent only — not a significance test, and not a reason to change a weight on its own.`;
    } else {
      verdict = 'apparent_separation_toward_lost';
      note = `Scored higher on LOST engagements (${mLost} vs ${mWon}, d=${dRounded}). Expected for a factor the formula subtracts; a reviewer must confirm the intended sign.`;
    }
    if (!weighted) note += ' Observed in snapshots but carries no weight in the supplied prior.';

    return {
      factor,
      currentWeight: weighted ? currentWeights[factor] : null,
      weighted,
      nWon,
      nLost,
      meanWhenWon: mWon,
      meanWhenLost: mLost,
      separation,
      standardisedSeparation: dRounded,
      verdict,
      note,
    };
  });

  const conclusive = factors.filter((f) => f.verdict !== 'insufficient_evidence').length;
  return {
    recordsConsidered: all.length,
    recordsWithFactorScores: scored.length,
    recordsMissingFactorScores: all.length - scored.length,
    factors,
    // Frozen COPY: the caller's object is never touched, and the returned object
    // cannot be edited in place by a downstream renderer.
    weightsReviewed: Object.freeze({ ...currentWeights }),
    autoAdjustmentApplied: false,
    humanReviewRequired: true,
    headline:
      conclusive === 0
        ? `No factor has enough evidence to describe. ${scored.length} scored outcome${scored.length === 1 ? '' : 's'} on record; the prior stands unchanged until a human decides otherwise.`
        : `${conclusive} of ${factors.length} factors show an apparent pattern; the remaining ${factors.length - conclusive} have insufficient evidence. Weights unchanged — this packet is for a human decision.`,
    caveats: [
      'Nothing here is a significance test. At ~29 engagements a year, no factor can be validated statistically.',
      'Direction is not correctness: a factor the formula subtracts is SUPPOSED to score higher on lost engagements.',
      'Lost engagements are scored at quote time by the same person who then pursued or dropped them, so the score influenced the outcome it is being tested against.',
      'Cancelled engagements are not in this data at all; only won and lost are outcomes here.',
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CALIBRATION HEALTH — the honest statement                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Greppable honesty marker, in the manner of `PRICE_BANDS_ARE_PLACEHOLDERS`
 * (`catalogue.ts`). If a future surface claims this module learns anything, this
 * string is the counter-evidence and the grep that finds it.
 */
export const CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL =
  'GPS calibration counts outcomes and prepares them for human review. It fits nothing, learns nothing, and adjusts no weight. At ~29 engagements a year that is the only defensible design.';

export interface CalibrationHealth {
  recordCount: number;
  wonCount: number;
  lostCount: number;

  /** Offers with at least one decided engagement. */
  offersWithAnyOutcome: number;
  /** Offers whose n has reached `MIN_N_FOR_RATE` — a win rate may be quoted for these. */
  offersWhereRateCanBeExpressed: OfferKey[];
  /** Distinct partner keys with at least one complete quoted-and-realised engagement. */
  partnersWithMarginData: number;
  /** Engagements with both realised figures — the denominator of every margin number. */
  recordsWithCompleteMarginData: number;

  /** Pooled across offers. Reached long before any single offer's rate. */
  canExpressOverallWinRate: boolean;
  /** Both arms have `MIN_N_PER_ARM_FOR_SEPARATION` scored engagements. */
  canReviewFactorSeparation: boolean;
  /** Any complete quoted-vs-realised margin at all. */
  canMeasureMarginRealisation: boolean;
  /**
   * Literal `false`, permanently. Not "false for now": 29 outcomes a year against
   * a six-factor prior will not become trainable by waiting, because the world the
   * early data describes has changed by the time enough of it exists.
   */
  canTrainAModel: false;

  assumedAnnualVolume: number;
  /** Volume ÷ 5 offers, if demand were even — it will not be. ~5.8/year. */
  assumedAnnualVolumePerOffer: number;
  /**
   * Years until the BEST-covered offer reaches `MIN_N_FOR_RATE` at the assumed
   * volume. Null when one already has. Deliberately reported: it converts "not
   * enough data" into "come back in about a year", which is the fact that stops
   * someone building a learning loop this quarter.
   */
  estimatedYearsToFirstOfferRate: number | null;

  /** Plain language, safe to render verbatim. Ordered most important first. */
  statements: string[];
  headline: string;
}

/**
 * What can and cannot be concluded from the data on hand, in plain language.
 *
 * Written to be pasted into a review deck without editing, because the failure
 * mode is not that someone reads a caveat and ignores it — it is that the caveat
 * never leaves the codebase and a rate arrives in a slide with no n beside it.
 */
export function calibrationHealth(records: readonly OutcomeRecord[]): CalibrationHealth {
  const all = [...records];
  const wl = winLossSummary(all);
  const mr = marginRealisation(all);

  const perOffer = Math.round((ASSUMED_ANNUAL_ENGAGEMENT_VOLUME / OFFER_KEYS.length) * 10) / 10;
  const offersWithAnyOutcome = wl.byOffer.filter((r) => r.sampleSize > 0).length;
  const rateOffers = wl.byOffer.filter((r) => r.winRatePct != null).map((r) => r.offerKey);
  const bestOfferN = Math.max(0, ...wl.byOffer.map((r) => r.sampleSize));
  const shortfall = Math.max(0, MIN_N_FOR_RATE - bestOfferN);
  const estimatedYearsToFirstOfferRate =
    shortfall === 0 ? null : Math.round((shortfall / perOffer) * 10) / 10;

  const scored = all.filter((r) => r.factorScoresAtQuote != null);
  const scoredWon = scored.filter((r) => r.disposition === 'won').length;
  const scoredLost = scored.filter((r) => r.disposition === 'lost').length;
  const canReviewFactorSeparation =
    scoredWon >= MIN_N_PER_ARM_FOR_SEPARATION && scoredLost >= MIN_N_PER_ARM_FOR_SEPARATION;

  const statements: string[] = [];
  if (all.length === 0) {
    statements.push('No outcomes have been recorded. Nothing about win rates, margin or scoring factors can be concluded — including that things are going well.');
  } else {
    statements.push(
      wl.overall.winRatePct == null
        ? `${all.length} decided engagement${all.length === 1 ? '' : 's'} on record (${wl.overall.won} won, ${wl.overall.lost} lost). That is below the stated minimum of ${MIN_N_FOR_RATE}, so no win rate is reported — the counts are the finding.`
        : `${all.length} decided engagements (${wl.overall.won} won, ${wl.overall.lost} lost). Pooled win rate ${wl.overall.winRatePct}%, 95% interval ${wl.overall.interval95Pct?.lowPct}–${wl.overall.interval95Pct?.highPct}% — quote the interval, not the point.`,
    );
    statements.push(
      rateOffers.length === 0
        ? `No individual offer has reached ${MIN_N_FOR_RATE} decided engagements, so per-offer win rates are all withheld. Comparing offers on the current data would be comparing noise.`
        : `Per-offer win rates are available for ${rateOffers.length} of ${OFFER_KEYS.length} offers (${rateOffers.join(', ')}); the rest are withheld for insufficient n.`,
    );
    statements.push(
      mr.overall == null
        ? `No engagement yet has both a realised price and a realised partner cost, so margin realisation is entirely unmeasured. ${mr.excludedIncompleteRealisation} won engagement${mr.excludedIncompleteRealisation === 1 ? ' is' : 's are'} waiting on realised figures.`
        : `Margin realisation is measurable on ${mr.overall.n} engagement${mr.overall.n === 1 ? '' : 's'}: mean slippage ${mr.overall.slippageMeanCents} cents (${mr.overall.slippageMeanCents < 0 ? 'margin given away' : 'margin held or better'}), ${mr.overall.slippageStdDevCents == null ? 'dispersion not computable at n=1' : `sd ${mr.overall.slippageStdDevCents} cents`}. ${mr.overall.negativeRealisedMarginCount} delivered at a realised loss.`,
    );
    statements.push(
      canReviewFactorSeparation
        ? `Factor scores exist on ${scored.length} engagements (${scoredWon} won / ${scoredLost} lost), enough for a human to look at apparent separation — not enough for any statistical claim.`
        : `Factor scores exist on ${scored.length} engagements (${scoredWon} won / ${scoredLost} lost). Below ${MIN_N_PER_ARM_FOR_SEPARATION} per arm, so the weight review will report insufficient evidence for every factor.`,
    );
  }
  if (estimatedYearsToFirstOfferRate != null) {
    statements.push(`At the assumed ${ASSUMED_ANNUAL_ENGAGEMENT_VOLUME} engagements a year (~${perOffer} per offer), the best-covered offer needs about ${estimatedYearsToFirstOfferRate} more year${estimatedYearsToFirstOfferRate === 1 ? '' : 's'} to reach ${MIN_N_FOR_RATE}.`);
  }
  // Always last, always present, at every data volume.
  statements.push(`No amount of waiting makes this a trainable dataset: ${ASSUMED_ANNUAL_ENGAGEMENT_VOLUME} outcomes a year against a six-factor prior means the weights stay a stated prior, reviewed by a human each quarter (GPS_IMPLEMENTATION_PLAN.md §7).`);
  statements.push('Only won and lost engagements count as outcomes here. Cancelled ones are excluded, which biases this view toward engagements that reached a decision.');

  return {
    recordCount: all.length,
    wonCount: wl.overall.won,
    lostCount: wl.overall.lost,
    offersWithAnyOutcome,
    offersWhereRateCanBeExpressed: rateOffers,
    partnersWithMarginData: mr.byPartner.length,
    recordsWithCompleteMarginData: mr.overall?.n ?? 0,
    canExpressOverallWinRate: wl.overall.winRatePct != null,
    canReviewFactorSeparation,
    canMeasureMarginRealisation: mr.overall != null,
    canTrainAModel: false,
    assumedAnnualVolume: ASSUMED_ANNUAL_ENGAGEMENT_VOLUME,
    assumedAnnualVolumePerOffer: perOffer,
    estimatedYearsToFirstOfferRate,
    statements,
    headline:
      all.length === 0
        ? 'No outcome data. Every number this module could produce is unavailable, and that is the honest report.'
        : `${all.length} outcome${all.length === 1 ? '' : 's'} recorded; ${rateOffers.length} of ${OFFER_KEYS.length} offers can support a win rate; margin realisation ${mr.overall == null ? 'unmeasured' : `measured on ${mr.overall.n}`}. Review instrument only — nothing here is learned.`,
  };
}
