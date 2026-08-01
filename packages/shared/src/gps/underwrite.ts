/**
 * GLOBAL SERVICES (GPS) — UNDERWRITING. Phase 7 of `GPS_100X_PLAN.md`.
 *
 * WHAT THIS IS FOR. Every CRM stores a price. None of them tells you the price is
 * wrong. `marginAtRisk` (`partners.ts:1059`) already answers "what does this quote
 * imply against the partner's rate card" — one number, one scenario, the happy
 * path. This module answers the question that actually changes behaviour:
 *
 *    at this price, in what FRACTION of plausible outcomes do we lose money?
 *
 * At $10–25k with a partner delivering, a 30% effort overrun is not a bad quarter,
 * it is the entire margin. `pLoss` is the number the founder does not currently
 * have anywhere, in any form, and it is the reason this phase exists.
 *
 * ── WHAT THIS MODULE IS NOT ────────────────────────────────────────────────────
 * IT IS NOT A MEASUREMENT. With zero recorded outcomes the distribution is driven
 * entirely by founder-entered effort triples that HAVE NOT BEEN SUPPLIED
 * (`GPS_100X_PLAN.md` §12: "P7 additionally wants effort triples per offer …
 * which only you can supply"). A Monte Carlo over invented inputs produces a
 * band that LOOKS like evidence, and that is a more dangerous artifact than no
 * band at all. Three defences, all in the data rather than in this comment:
 *
 *   1. `EFFORT_TRIPLES_ARE_PLACEHOLDERS` — exported, `true`, greppable, in the
 *      manner of `PRICE_BANDS_ARE_PLACEHOLDERS` (`catalogue.ts:58`) and
 *      `COORDINATION_HOURS_ARE_PLACEHOLDERS` (`delivery.ts:1173`).
 *   2. `Underwriting.basis` — `'prior' | 'blended' | 'measured'`, and it is not a
 *      label: the basis is DERIVED from the blend weight that actually moved the
 *      numbers (see `outcomeBlend`). A surface reading `'blended'` is reading a
 *      fact about the arithmetic, not a mood.
 *   3. `Underwriting.reasons` — populated on every path, never empty.
 *
 * ── REUSE, NOT REINVENTION ─────────────────────────────────────────────────────
 * The Monte Carlo machinery already exists and is tested: `mulberry32`,
 * `sampleTriangular` and `resolveDuration` (`launchSim.ts:78`, `:89`, `:160`). A
 * second seeded RNG and a second triangular sampler in the same package would be
 * two things to keep honest instead of one. The percentile METHOD is also
 * borrowed verbatim (`launchSim.ts:213`) — see `orderStatistic`.
 *
 * ── MONEY DISCIPLINE ───────────────────────────────────────────────────────────
 * Integer cents everywhere, and one rule enforced by construction: money is never
 * averaged into an output without an explicit `Math.round`, and every percentile
 * is an ORDER STATISTIC — an actually-observed sample, never an interpolation
 * between two of them. That is why no field in `MarginDistribution` can hold a
 * fractional cent, and the test asserts it field by field. `marginCents`
 * (`types.ts:268`) is used even in the hot loop so the rounding convention cannot
 * drift from the rest of the platform.
 */

import { mulberry32, resolveDuration, sampleTriangular, type DurationTriple } from '../launchSim.js';
import { likelihood, type Likelihood } from '../estimative.js';
import type { Driver } from '../alpha.js';
import { OFFER_KEYS, marginCents, marginPct, type OfferKey } from './types.js';
import { OFFERS, PRICE_BANDS_ARE_PLACEHOLDERS, getOffer } from './catalogue.js';
import {
  RATE_UNIT_LABEL,
  rateCardCostCents,
  rateCardStatus,
  type RateCard,
  type RateCardStatus,
  type RecordedOutcome,
} from './partners.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* EFFORT — the founder-supplied input that does not exist yet                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * HOW MANY PARTNER-DAYS ONE ENGAGEMENT OF THIS OFFER CONSUMES — as a range,
 * because a single number is the lie this whole module exists to remove.
 *
 * Same three-point shape as `DurationTriple` (`launchSim.ts:22`) and deliberately
 * NOT that type: a `DurationTriple` is `{min, mode, max}` calendar days for a task
 * in a dependency graph, and this is BILLABLE partner effort for an offer. They
 * sample identically (`effortToDuration` converts) and they mean different things;
 * one shared name would eventually put a task's elapsed time into a cost model.
 *
 * `statedBy` / `statedAt` / `isPlaceholder` exist because this is a CLAIM a human
 * made, not a measurement — the same discipline `Capacity` (`partners.ts:257`) and
 * `RateCard` (`partners.ts:183`) already apply. When a partner blows through a
 * pessimistic estimate, the record of who estimated it is the only route to a
 * corrected prior.
 */
export interface EffortTriple {
  offerKey: OfferKey;
  /** Everything goes right. Integer or fractional days; clamped to ≥ 0. */
  optimisticDays: number;
  /** The mode — what it normally takes. Clamped to ≥ `optimisticDays`. */
  likelyDays: number;
  /** It goes wrong in the ordinary ways. Clamped to ≥ `likelyDays`. */
  pessimisticDays: number;
  /** Who supplied it. A named human, never a service account. */
  statedBy: string;
  /** ISO instant it was recorded. */
  statedAt: string;
  /**
   * TRUE while this is the shipped placeholder rather than a founder-supplied
   * figure. Per-triple and not only global, so a half-supplied catalogue (three
   * real, two placeholder) can be rendered truthfully instead of all-or-nothing.
   */
  isPlaceholder: boolean;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TODO — EFFORT TRIPLES ARE PLACEHOLDERS. NOT MEASURED. NOT FOUNDER-SUPPLIED.
 *  DO NOT PRESENT A DISTRIBUTION BUILT FROM THESE AS A FORECAST.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `GPS_100X_PLAN.md` §12 names effort triples as the one input that "turns the
 *  underwriting screen from a prior into a model", and it is unsupplied. Every
 *  number below is a placeholder shaped only by the two facts on record: typical
 *  engagements are $10–25k, and the diagnostic is a ~$1.5–3k front door.
 *
 *  ONE BLOCK, on purpose, exactly as `TODO_PRICE_BANDS` (`catalogue.ts:61`) and
 *  `TODO_VENDOR_COSTS` (`catalogue.ts:76`) are single blocks: replacing them is
 *  one edit in one place, with no stale number surviving somewhere else.
 *
 *  The SPREADS are deliberately wide (pessimistic ≈ 2× likely). A narrow
 *  placeholder spread would manufacture a tight, confident-looking margin band
 *  out of nothing, which is the precise failure this phase was created to
 *  correct. Wide-and-labelled is honest; narrow-and-labelled is not, because
 *  nobody reads the label on a number that looks certain.
 *
 *  Flip `EFFORT_TRIPLES_ARE_PLACEHOLDERS` to `false` in the SAME COMMIT that
 *  supplies real triples — never before, and never "temporarily" for a demo.
 */
export const EFFORT_TRIPLES_ARE_PLACEHOLDERS = true;

/** TODO(D5/§12): replace with founder-supplied triples. Partner-days per engagement. */
const TODO_EFFORT_DAYS: Record<OfferKey, { o: number; l: number; p: number }> = {
  diagnostic: { o: 1, l: 2, p: 4 },
  mica_whitepaper: { o: 8, l: 15, p: 30 },
  legal_opinion_coordination: { o: 3, l: 6, p: 14 },
  gtm_sprint: { o: 6, l: 12, p: 24 },
  marketing_activation: { o: 8, l: 14, p: 28 },
};

/** Stamped on every placeholder triple so the provenance is in the row, not the docblock. */
const PLACEHOLDER_STATED_BY = 'system:placeholder';
/** Deliberately the epoch: a placeholder must never look freshly confirmed. */
const PLACEHOLDER_STATED_AT = '1970-01-01T00:00:00.000Z';

/**
 * The placeholder triple for an offer. Callers that have a real triple must pass
 * it explicitly; this is the fallback and it says so in every returned row.
 */
export function placeholderEffortTriple(offerKey: OfferKey): EffortTriple {
  const d = TODO_EFFORT_DAYS[offerKey];
  return {
    offerKey,
    optimisticDays: d.o,
    likelyDays: d.l,
    pessimisticDays: d.p,
    statedBy: PLACEHOLDER_STATED_BY,
    statedAt: PLACEHOLDER_STATED_AT,
    isPlaceholder: true,
  };
}

/**
 * Every placeholder triple, in catalogue order — so the UI can render the ONE
 * EDITABLE BLOCK from data instead of hard-coding five rows that will drift from
 * this file the first time an offer is added.
 */
export function placeholderEffortTriples(): readonly EffortTriple[] {
  return OFFER_KEYS.map(placeholderEffortTriple);
}

/**
 * Turn a request's optional effort override into a triple — and OWN the
 * `isPlaceholder` flag rather than letting a caller set it.
 *
 * This exists because the flag is the honesty mechanism, and a hand-written API
 * mapper is exactly where `isPlaceholder: false` gets typed next to a placeholder
 * by accident. One function decides: a supplied triple is real, an absent one is
 * the placeholder, and there is no third path.
 */
export function effortFromRequest(
  offerKey: OfferKey,
  supplied: { optimisticDays: number; likelyDays: number; pessimisticDays: number; statedBy: string; statedAt: string } | null | undefined,
): EffortTriple {
  if (supplied == null) return placeholderEffortTriple(offerKey);
  return {
    offerKey,
    optimisticDays: supplied.optimisticDays,
    likelyDays: supplied.likelyDays,
    pessimisticDays: supplied.pessimisticDays,
    statedBy: supplied.statedBy,
    statedAt: supplied.statedAt,
    isPlaceholder: false,
  };
}

/**
 * Convert an effort triple into the `{min, mode, max}` shape `sampleTriangular`
 * consumes — THROUGH `resolveDuration` (`launchSim.ts:160`) rather than around it.
 *
 * Why route through a function whose signature wants a `SimTaskInput`: that
 * function owns the clamping rules (min ≥ 0, mode ≥ min, max ≥ mode, NaN → 0) and
 * they are already covered by `launchSim`'s tests. Re-implementing three
 * `Math.max` calls here would be a second copy of a tested invariant, and the
 * copy is the one that would rot. The synthetic status string matches no key in
 * `DEFAULT_DURATIONS` (`launchSim.ts:29`), so the status default is never
 * consulted — the override supplies all three values.
 */
export function effortToDuration(effort: EffortTriple): DurationTriple {
  return resolveDuration(
    { id: 'gps_effort', status: '__gps_effort_no_status_default__', dependsOn: [] },
    { gps_effort: { min: effort.optimisticDays, mode: effort.likelyDays, max: effort.pessimisticDays } },
  );
}

/** True when the triple has collapsed to a point — no spread to sample. */
export function isZeroVarianceEffort(effort: EffortTriple): boolean {
  const d = effortToDuration(effort);
  return d.min === d.max;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* COST MODEL — rate card × effort, and the four things it refuses to do       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT ONE ENGAGEMENT COSTS US, AS A DISTRIBUTION. Rate card × effort triple.
 *
 * The card supplies the price of a unit; the triple supplies how many units this
 * offer consumes. Neither alone is a cost model, and the platform currently has
 * one of each and no join between them.
 */
export interface CostModel {
  offerKey: OfferKey;
  partnerId: string;
  /** For reason strings. The partner's name where known, else the id. */
  partnerLabel: string;
  /** The card the cost is drawn from. Its `currency` and `validUntil` are enforced. */
  card: RateCard;
  /** Partner-days per engagement. */
  effort: EffortTriple;
  /**
   * Billable hours per partner-day, for an `hourly` card ONLY.
   *
   * NULL IS A REFUSAL, NOT A DEFAULT. An effort triple is in days and an hourly
   * card is in hours; bridging them needs a number nobody has stated. Assuming 8
   * would put an invented 8 into a margin on a proposal — the same reasoning that
   * makes `rateCardCostCents` return null for a metered card with no
   * `expectedUnits` (`partners.ts:233`) rather than assume one unit.
   */
  hoursPerDay: number | null;
  /**
   * Cost that does not scale with effort, integer cents — a pass-through such as
   * counsel's own fee (`catalogue.ts:79` books exactly that shape for
   * `legal_opinion_coordination`). Added to every sample unchanged, so it shifts
   * the whole distribution and contributes NOTHING to its spread. That asymmetry
   * is the useful part: a $5,000 pass-through moves the median and does not make
   * the outcome less certain.
   */
  fixedCostCents: number;
}

/**
 * The commercial facts of the quote being underwritten, and nothing else.
 *
 * Deliberately not `GpsEngagement` (`types.ts:317`) and not `QuotedEngagement`
 * (`partners.ts:984`): this must be callable on a price a human is still typing,
 * which is the entire point of underwriting BEFORE issue. `quotedVendorCostCents`
 * is optional here — in `marginAtRisk` it is the subject, here it is only a
 * cross-check against the modelled median, and its absence must not stop the run.
 */
export interface UnderwriteQuote {
  offerKey: OfferKey;
  /** Price to the client, integer cents. */
  priceCents: number;
  /** ISO-4217, uppercase. Compared against the card — never converted. */
  currency: string;
  /**
   * The vendor cost written on the quote, if one has been written. When it
   * disagrees materially with the modelled median, that disagreement is surfaced
   * as a reason (D4) rather than silently overridden in either direction.
   */
  quotedVendorCostCents?: number | null;
}

/**
 * Every reason this module will decline to produce a distribution, plus the one
 * verdict that means it produced one.
 *
 * `underwritten` is the ONLY non-refusal. Everything else is a stated no with a
 * reason attached (D2), and `shouldBlockIssue` treats all of them as blocking —
 * a proposal whose margin could not be computed is not a proposal that may be
 * issued.
 */
export type UnderwriteVerdict =
  | 'underwritten'
  | 'refused_price_not_set'
  | 'refused_currency_mismatch'
  | 'refused_rate_card_expired'
  | 'refused_rate_card_no_validity_stated'
  | 'refused_hours_per_day_not_stated'
  | 'refused_rate_not_derivable'
  | 'refused_effort_is_zero';

export const UNDERWRITE_VERDICT_LABEL: Record<UnderwriteVerdict, string> = {
  underwritten: 'Underwritten',
  refused_price_not_set: 'Refused — no usable price',
  refused_currency_mismatch: 'Refused — currency mismatch',
  refused_rate_card_expired: 'Refused — rate card expired',
  refused_rate_card_no_validity_stated: 'Refused — rate card has no validity date',
  refused_hours_per_day_not_stated: 'Refused — hours per day not stated',
  refused_rate_not_derivable: 'Refused — rate not derivable',
  refused_effort_is_zero: 'Refused — effort triple is zero',
};

/** True for every verdict except the one that produced numbers. */
export function isRefusal(v: UnderwriteVerdict): boolean {
  return v !== 'underwritten';
}

/**
 * The two coefficients a cost sample needs, resolved once before the loop.
 * Internal: the loop must not re-inspect the card 4,000 times, and nothing
 * outside this module should be able to construct a cost basis by hand.
 */
interface CostBasis {
  /** Integer-or-fractional cents per effort day. 0 for a fixed-fee card. */
  centsPerDay: number;
  /** Integer cents added to every sample regardless of effort. */
  fixedCents: number;
  /** False for a fixed-fee card: effort cannot move the cost, and we must say so. */
  effortMatters: boolean;
  /** Human-readable statement of the arithmetic, for the driver trail (D1). */
  formula: string;
}

interface CostBasisResolution {
  basis: CostBasis | null;
  verdict: UnderwriteVerdict;
  reasons: string[];
  rateCardStatus: RateCardStatus;
}

/**
 * RESOLVE THE COST BASIS, OR REFUSE — with the reason, never with a conversion.
 *
 * Four refusals, and each one is a bug this module is deliberately unable to
 * introduce:
 *
 *  · CURRENCY MISMATCH. There is no FX rate in this file and there must not be
 *    one. `marginAtRisk` refuses identically (`partners.ts:1101`) and for the same
 *    reason: a pure function inventing a rate is a wrong invoice with extra steps.
 *  · EXPIRED / NO-VALIDITY CARD. This is where this module deliberately DIVERGES
 *    from `marginAtRisk`, which reports staleness beside its verdict rather than
 *    refusing (`partners.ts:1054`). That is right for a single deterministic
 *    figure — the direction of the risk is still informative when the rate is
 *    old. It is wrong here. A Monte Carlo turns a stale rate into a p10/p50/p90
 *    band, and a band communicates PRECISION. Rendering three confident
 *    percentiles off a rate the partner stopped honouring two quarters ago is the
 *    exact "reads well and is wrong" failure `GPS_100X_PLAN.md` §11 lists as a
 *    programme risk. So: refuse, name the date, and let a human re-confirm.
 *  · HOURLY CARD WITH NO HOURS-PER-DAY. See `CostModel.hoursPerDay`.
 *  · NON-DERIVABLE RATE. A negative or non-finite amount, or a `fixed` card that
 *    `rateCardCostCents` itself will not price (`partners.ts:233`).
 *
 * `asOf` is REQUIRED by the caller (see `UnderwriteOptions.asOf`), so staleness is
 * always evaluated. `marginAtRisk` permits skipping it and reports
 * `stalenessEvaluated: false`; this module does not offer that door, because the
 * only reason to underwrite without a date is not having thought about it.
 */
function resolveCostBasis(quote: UnderwriteQuote, model: CostModel, asOf: string): CostBasisResolution {
  const reasons: string[] = [];
  const card = model.card;
  const status = rateCardStatus(card, asOf);

  if (card.currency.toUpperCase() !== quote.currency.toUpperCase()) {
    reasons.push(
      `Quote is in ${quote.currency.toUpperCase()} and ${model.partnerLabel}'s rate card is in ${card.currency.toUpperCase()}. No FX conversion happens here; convert upstream, record the rate you used, and re-run.`,
    );
    return { basis: null, verdict: 'refused_currency_mismatch', reasons, rateCardStatus: status };
  }

  if (status === 'expired') {
    reasons.push(
      `${model.partnerLabel}'s rate card for ${quote.offerKey} expired on ${card.validUntil} (asOf ${asOf}). A distribution built on a rate nobody re-confirmed would show three confident percentiles and be wrong in all three. Re-confirm the rate, then underwrite.`,
    );
    return { basis: null, verdict: 'refused_rate_card_expired', reasons, rateCardStatus: status };
  }
  if (status === 'no_validity_stated') {
    reasons.push(
      `${model.partnerLabel}'s rate card for ${quote.offerKey} states no validity date, so it cannot be treated as current. A rate with no expiry is a rate nobody re-confirmed.`,
    );
    return { basis: null, verdict: 'refused_rate_card_no_validity_stated', reasons, rateCardStatus: status };
  }

  const fixedCents = Number.isFinite(model.fixedCostCents) ? Math.round(model.fixedCostCents) : 0;
  if (!Number.isFinite(model.fixedCostCents)) {
    reasons.push('Non-effort cost was not a finite number; treated as 0 and flagged rather than propagated as NaN.');
  }

  if (card.unit === 'fixed') {
    const fee = rateCardCostCents(card);
    if (fee == null) {
      reasons.push(
        `${model.partnerLabel}'s fixed-fee card for ${quote.offerKey} does not price (amount ${card.amountCents}). Nothing is assumed in its place.`,
      );
      return { basis: null, verdict: 'refused_rate_not_derivable', reasons, rateCardStatus: status };
    }
    reasons.push(
      `Fixed-fee card: cost does NOT vary with effort, so the overrun risk sits with ${model.partnerLabel}, not with us. The cost distribution is a point, and every margin percentile below is the same number.`,
    );
    return {
      basis: {
        centsPerDay: 0,
        fixedCents: fee + fixedCents,
        effortMatters: false,
        formula: `fixed fee ${fee}c${fixedCents ? ` + pass-through ${fixedCents}c` : ''}`,
      },
      verdict: 'underwritten',
      reasons,
      rateCardStatus: status,
    };
  }

  if (!Number.isFinite(card.amountCents) || card.amountCents < 0) {
    reasons.push(`${RATE_UNIT_LABEL[card.unit]} card amount is ${card.amountCents}, which is not a usable rate.`);
    return { basis: null, verdict: 'refused_rate_not_derivable', reasons, rateCardStatus: status };
  }

  let centsPerDay: number;
  let formula: string;
  if (card.unit === 'hourly') {
    const hpd = model.hoursPerDay;
    if (hpd == null || !Number.isFinite(hpd) || hpd <= 0) {
      reasons.push(
        `${model.partnerLabel}'s card is hourly and the effort triple is in DAYS. Bridging them needs billable hours per day, which nobody has stated. Supply it deliberately — an assumed 8 is an invented number on a proposal.`,
      );
      return { basis: null, verdict: 'refused_hours_per_day_not_stated', reasons, rateCardStatus: status };
    }
    centsPerDay = card.amountCents * hpd;
    formula = `${card.amountCents}c/hour × ${hpd}h/day × effort days${fixedCents ? ` + pass-through ${fixedCents}c` : ''}`;
  } else {
    centsPerDay = card.amountCents;
    formula = `${card.amountCents}c/day × effort days${fixedCents ? ` + pass-through ${fixedCents}c` : ''}`;
  }

  const dur = effortToDuration(model.effort);
  if (dur.max <= 0) {
    reasons.push(
      `${RATE_UNIT_LABEL[card.unit]} card with an all-zero effort triple for ${quote.offerKey}: the model would report the work as free. Supply optimistic/likely/pessimistic days before underwriting.`,
    );
    return { basis: null, verdict: 'refused_effort_is_zero', reasons, rateCardStatus: status };
  }

  return { basis: { centsPerDay, fixedCents, effortMatters: true, formula }, verdict: 'underwritten', reasons, rateCardStatus: status };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* BASIS — prior / blended / measured, as arithmetic and not as a label        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHERE THE NUMBERS CAME FROM. The single most important field in this module.
 *
 *  · `prior`    — nothing has been measured. The band is a founder-entered guess
 *                 propagated through arithmetic. It is a PRIOR WEARING A MODEL'S
 *                 CLOTHES and must be rendered as one.
 *  · `blended`  — some realised outcomes exist and are moving the numbers, but not
 *                 enough of them to stand alone.
 *  · `measured` — the cost side is drawn entirely from recorded outcomes.
 *
 * This is not a display string. It is derived from `OutcomeBlend.weight`, which is
 * the probability a sample actually draws an empirical figure instead of the
 * prior's neutral 1.00 — so a surface reading `'blended'` is reading a fact about
 * the arithmetic that produced the percentiles beside it (D8).
 */
export type UnderwritingBasis = 'prior' | 'blended' | 'measured';

export const BASIS_LABEL: Record<UnderwritingBasis, string> = {
  prior: 'Prior — no recorded outcomes; this is a founder estimate propagated through arithmetic',
  blended: 'Blended — part recorded outcomes, part prior',
  measured: 'Measured — cost drawn from recorded outcomes',
};

/**
 * Outcomes needed before the cost side stands on its own.
 *
 * 8 is `SCORECARD_CONFIDENCE_LABEL`'s "Established (8+ engagements)" threshold
 * (`partners.ts:819`) reused verbatim, not a second opinion invented here. At ~29
 * engagements a year across the whole business, one offer reaching n=8 takes
 * years, and pretending otherwise with a lower bar is how a 2-engagement sample
 * gets displayed as a model. A STATED PRIOR, reviewed quarterly — not fitted.
 */
export const MIN_OUTCOMES_FOR_MEASURED = 8;

/** One recorded outcome this offer could not use, and the reason. Never silent (D2). */
export interface ExcludedOutcome {
  engagementId: string;
  reason: string;
}

/**
 * The empirical half of the cost model: how much MORE partners actually invoiced
 * than the quote said they would, per recorded outcome.
 *
 * The ratio is `actualVendorCostCents / quotedVendorCostCents` — realised over
 * quoted. The prior's implicit claim is 1.00 ("we cost what we said"). Every
 * sample draws either an observed ratio (probability `weight`) or the prior's 1.00
 * (probability `1 − weight`), so the recorded outcomes bite in proportion to how
 * many of them there are. `weight = min(1, n / 8)`.
 *
 * TWO HONEST CONSEQUENCES, stated because a surface will be tempted to promise the
 * opposite:
 *  · The band does NOT necessarily narrow as outcomes land. If partners routinely
 *    invoice 1.3× the quote, the band MOVES DOWN and may WIDEN. That is the model
 *    telling the truth for the first time, not a regression.
 *  · A ratio is not a cause. It says the cost came in higher; `devilsAdvocate` is
 *    where the candidate reasons live, also drawn from these same rows.
 */
export interface OutcomeBlend {
  offerKey: OfferKey;
  /** Usable outcomes for this offer — the denominator of everything here. */
  sampleSize: number;
  /** 0–1, 4 dp. The probability a sample draws an observed ratio. */
  weight: number;
  basis: UnderwritingBasis;
  /** Observed realised/quoted cost ratios, ascending, 4 dp. */
  ratios: readonly number[];
  /** Median observed ratio (order statistic), or null with no usable outcomes. */
  medianRatio: number | null;
  /** Outcomes for this offer that were dropped, each with its reason. */
  excluded: readonly ExcludedOutcome[];
  reason: string;
}

/** 4-dp rounding for RATIOS AND PROBABILITIES ONLY. Never applied to money. */
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

export function outcomeBlend(offerKey: OfferKey, outcomes: readonly RecordedOutcome[]): OutcomeBlend {
  const mine = outcomes.filter((o) => o.offerKey === offerKey);
  const excluded: ExcludedOutcome[] = [];
  const ratios: number[] = [];

  for (const o of mine) {
    if (o.actualVendorCostCents == null) {
      excluded.push({ engagementId: o.engagementId, reason: 'No partner invoice recorded — realised cost is unknown, not equal to quoted.' });
      continue;
    }
    if (!Number.isFinite(o.quotedVendorCostCents) || o.quotedVendorCostCents <= 0) {
      excluded.push({ engagementId: o.engagementId, reason: `Quoted vendor cost was ${o.quotedVendorCostCents}; an overrun ratio against zero is undefined.` });
      continue;
    }
    if (!Number.isFinite(o.actualVendorCostCents) || o.actualVendorCostCents < 0) {
      excluded.push({ engagementId: o.engagementId, reason: `Realised vendor cost was ${o.actualVendorCostCents}, which is not a usable figure.` });
      continue;
    }
    ratios.push(round4(o.actualVendorCostCents / o.quotedVendorCostCents));
  }

  ratios.sort((a, b) => a - b);
  const n = ratios.length;
  const weight = round4(Math.min(1, n / MIN_OUTCOMES_FOR_MEASURED));
  const basis: UnderwritingBasis = n === 0 ? 'prior' : n >= MIN_OUTCOMES_FOR_MEASURED ? 'measured' : 'blended';
  const median = n === 0 ? null : ratios[orderStatisticIndex(n, 50)];

  const reason =
    n === 0
      ? mine.length === 0
        ? `No recorded outcome for ${offerKey}. The cost side is entirely the effort triple and the rate card — a prior, not a measurement.`
        : `${mine.length} recorded outcome${mine.length === 1 ? '' : 's'} for ${offerKey}, none usable (see excluded). The cost side remains a prior.`
      : `${n} usable outcome${n === 1 ? '' : 's'} for ${offerKey}; median realised/quoted cost ratio ${median}. Recorded outcomes carry ${Math.round(weight * 100)}% of the cost draw (n/${MIN_OUTCOMES_FOR_MEASURED}, capped at 100%).`;

  return { offerKey, sampleSize: n, weight, basis, ratios, medianRatio: median, excluded, reason };
}

/**
 * The basis a caller may honestly claim, given what is measured AND what is still
 * a placeholder.
 *
 * `outcomeBlend` can reach `'measured'` on the cost-overrun dimension alone, and
 * that would OVERCLAIM while the effort triple driving the cost is still the
 * shipped placeholder: eight recorded invoices tell you how wrong the quotes were,
 * not how many days the work takes. So `measured` degrades to `blended` whenever a
 * placeholder effort triple can still move the answer.
 *
 * `effortMatters` is false for a fixed-fee card — effort cannot move the cost at
 * all there, so a placeholder triple is harmless and `measured` stands.
 */
export function resolveBasis(
  blendBasis: UnderwritingBasis,
  effortIsPlaceholder: boolean,
  effortMatters: boolean,
): UnderwritingBasis {
  if (blendBasis === 'measured' && effortIsPlaceholder && effortMatters) return 'blended';
  return blendBasis;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PERCENTILES — one method, stated, defined at n = 1                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE PERCENTILE METHOD, STATED ONCE: nearest-rank order statistic, no
 * interpolation. Index = `ceil(p/100 × n) − 1`, clamped to `[0, n−1]`.
 *
 * Copied deliberately from `launchSim.ts:213` so the two Monte Carlos in this
 * package cannot report percentiles two different ways — a p50 that means
 * something different on the underwriting screen than on the launch screen is a
 * bug nobody would ever find.
 *
 * THREE PROPERTIES THIS BUYS, all of which matter here:
 *  1. Every reported percentile is an ACTUALLY OBSERVED sample. Interpolating
 *     between two adjacent samples produces a half-cent, and a half-cent in a
 *     money field is how a float gets onto an invoice.
 *  2. It is defined at n = 1: `ceil(p/100 × 1) − 1` is 0 for every p in (0, 100],
 *     so a single-sample run reports that one sample at every percentile rather
 *     than dividing by zero. The band is then honestly degenerate.
 *  3. It is monotone in p, so p05 ≤ p10 ≤ p50 ≤ p90 ≤ p95 always holds on sorted
 *     input — no percentile can cross another.
 *
 * THE COST: on small n the resolution is coarse (at n = 10 the p05 and p10 are the
 * same sample). That is a property of having ten samples, not of the estimator,
 * and `Underwriting.sampleCount` is reported so a surface can say so.
 */
export const PERCENTILE_METHOD =
  'Nearest-rank order statistic, index = ceil(p/100 × n) − 1 clamped to [0, n−1]. No interpolation, so every percentile is an observed sample and no percentile can be a fractional cent. Defined at n = 1.';

export function orderStatisticIndex(n: number, p: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const idx = Math.ceil((p / 100) * n) - 1;
  return Math.min(n - 1, Math.max(0, idx));
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE DRIVER TRAIL (D1)                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * One line of "what produced this number".
 *
 * EXTENDS `Driver` (`alpha.ts:41`) rather than redeclaring it, so any component
 * that already renders a driver trail accepts these unchanged. But `Driver.points`
 * means SCORE POINTS on a 0–100 composite, and here it carries cents, days or a
 * ratio — the exact conflation `HeadroomReason` (`partners.ts:330`) refused to
 * risk. `unit` is the fix: it is required, and a renderer that ignores it will
 * print "600000 points" and be visibly wrong rather than quietly wrong.
 */
export interface UnderwriteDriver extends Driver {
  unit: 'cents' | 'days' | 'pct' | 'ratio' | 'count';
  /** The formula, the source, or the caveat. Null when the label says it all. */
  detail: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE DISTRIBUTION                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * REALISED MARGIN AS A DISTRIBUTION. Integer cents at every percentile, and
 * uncertainty BESIDE the estimate rather than folded into it (D3).
 *
 * There is no single `marginCents` field here and that omission is the design. A
 * point estimate on a decision-bearing number is banned by doctrine, and the
 * moment one exists it becomes the field every surface renders and every
 * subsequent calculation consumes. `p50MarginCents` is the median, labelled as
 * such, and it never appears without `p10`/`p90` beside it.
 *
 * Cost percentiles are DERIVED from the margin order statistics rather than taken
 * from a separately sorted cost array: with a fixed price, margin is a strictly
 * decreasing function of cost, so the sample at the 10th margin percentile IS the
 * sample at the 90th cost percentile. Deriving guarantees
 * `p10MarginCents === priceCents − p90CostCents` exactly; two independent sorts
 * would disagree at the edges and a founder would eventually notice.
 */
export interface MarginDistribution {
  p05MarginCents: number;
  p10MarginCents: number;
  p50MarginCents: number;
  p90MarginCents: number;
  p95MarginCents: number;
  /** Arithmetic mean, rounded to whole cents. Reported because it is not the median. */
  meanMarginCents: number;
  /** The literal worst and best sampled outcomes. */
  minMarginCents: number;
  maxMarginCents: number;
  /** p90 − p10. The band width, and the thing `varianceDriver` explains. */
  spreadCents: number;
  /** Gross margin as a percent of price at each percentile. Null when price is 0. */
  p10MarginPct: number | null;
  p50MarginPct: number | null;
  p90MarginPct: number | null;
  /** Cost at the matching percentile — see the docblock on derivation. */
  p10CostCents: number;
  p50CostCents: number;
  p90CostCents: number;
  method: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE SIMULATION                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/** The inputs that are allowed to be random. Two, both named, both attributable. */
export type StochasticInputKey = 'effort' | 'outcome_overrun';

export const STOCHASTIC_INPUT_LABEL: Record<StochasticInputKey, string> = {
  effort: 'Partner effort (days)',
  outcome_overrun: 'Realised-vs-quoted cost overrun (recorded outcomes)',
};

export const DEFAULT_SAMPLE_COUNT = 4000;
/** 42, the same default seed `runLaunchSim` uses (`launchSim.ts:173`). */
export const DEFAULT_SEED = 42;
const MIN_SAMPLES = 1;
const MAX_SAMPLES = 20_000;

interface SimParams {
  priceCents: number;
  basis: CostBasis;
  duration: DurationTriple;
  blend: OutcomeBlend;
  samples: number;
  seed: number;
  /** Fractional uplift applied to sampled effort. 0 for the baseline run. */
  effortUplift: number;
  /** Pin one input at its central value, for variance attribution. */
  freeze: StochasticInputKey | null;
}

interface SimOutput {
  /** Integer cents, ascending. */
  marginsAsc: number[];
  lossCount: number;
  /** Sum of integer margins — safe in a double at 20k × ±$25k. */
  marginSum: number;
}

/**
 * ONE MONTE CARLO PASS.
 *
 * TWO INVARIANTS THAT THE REST OF THIS MODULE DEPENDS ON, so they are stated here
 * rather than discovered later:
 *
 * 1. THE DRAW ORDER IS FIXED AND EVERY DRAW IS CONSUMED, even when the input it
 *    feeds is frozen. Skipping the effort draw in a freeze run would shift the RNG
 *    stream, so the overrun ratios in that run would be different numbers, and the
 *    "spread removed by pinning effort" would be measuring the reseeding rather
 *    than the effort. Consuming-and-ignoring makes every run in an `underwrite()`
 *    call use the SAME random numbers (common random numbers), which is also why
 *    `overrunSensitivity` can assert exact monotonicity instead of hoping for it.
 *
 * 2. COST IS MONOTONE NON-DECREASING IN `effortUplift`, per sample, exactly. Every
 *    step in the chain is monotone: `days × (1+u)`, `× centsPerDay ≥ 0`,
 *    `Math.round`, `+ fixedCents`, `× ratio ≥ 0`, `Math.round`. So margin is
 *    monotone NON-INCREASING in the uplift for every individual sample, and
 *    therefore at every order statistic. `overrunSensitivity`'s monotonicity is a
 *    property of the arithmetic, not a statistical tendency — a test may assert it
 *    with `toBeLessThanOrEqual` and never flake.
 *
 * Money: `Math.round` twice, never a float in a margin. `marginCents`
 * (`types.ts:268`) does the subtraction so the rounding convention matches the
 * platform's.
 */
function simulate(p: SimParams): SimOutput {
  const rng = mulberry32(p.seed);
  const margins = new Array<number>(p.samples);
  const ratios = p.blend.ratios;
  const n = ratios.length;
  const frozenRatio = p.blend.medianRatio ?? 1;
  const uplift = 1 + p.effortUplift;
  let lossCount = 0;
  let marginSum = 0;

  for (let i = 0; i < p.samples; i++) {
    // Invariant 1: three draws, always, in this order.
    const sampledDays = sampleTriangular(rng, p.duration);
    const coin = rng();
    const pick = rng();

    const days = (p.freeze === 'effort' ? p.duration.mode : sampledDays) * uplift;
    const ratio =
      p.freeze === 'outcome_overrun'
        ? frozenRatio
        : n > 0 && coin < p.blend.weight
          ? (ratios[Math.min(n - 1, Math.floor(pick * n))] ?? 1)
          : 1;

    const modelledCost = Math.round(p.basis.centsPerDay * days) + p.basis.fixedCents;
    const cost = Math.round(modelledCost * ratio);
    const m = marginCents(p.priceCents, cost);
    margins[i] = m;
    marginSum += m;
    if (m < 0) lossCount++;
  }

  margins.sort((a, b) => a - b);
  return { marginsAsc: margins, lossCount, marginSum };
}

function buildDistribution(priceCents: number, out: SimOutput): MarginDistribution {
  const a = out.marginsAsc;
  const n = a.length;
  const at = (pct: number): number => a[orderStatisticIndex(n, pct)] ?? 0;
  const p05 = at(5);
  const p10 = at(10);
  const p50 = at(50);
  const p90 = at(90);
  const p95 = at(95);
  // The only place money is averaged, and it is rounded in the same expression.
  const mean = Math.round(out.marginSum / (n || 1));
  return {
    p05MarginCents: p05,
    p10MarginCents: p10,
    p50MarginCents: p50,
    p90MarginCents: p90,
    p95MarginCents: p95,
    meanMarginCents: mean,
    minMarginCents: a[0] ?? 0,
    maxMarginCents: a[n - 1] ?? 0,
    spreadCents: p90 - p10,
    // `marginPct` reconstructs the cost from the margin — exact, since both are
    // integer cents and price is fixed. Null at price 0 (`types.ts:282`).
    p10MarginPct: marginPct(priceCents, priceCents - p10),
    p50MarginPct: marginPct(priceCents, priceCents - p50),
    p90MarginPct: marginPct(priceCents, priceCents - p90),
    // Order-reversing: the 10th-percentile margin is the 90th-percentile cost.
    p10CostCents: priceCents - p90,
    p50CostCents: priceCents - p50,
    p90CostCents: priceCents - p10,
    method: PERCENTILE_METHOD,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* VARIANCE ATTRIBUTION — which input owns the spread                          */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface VarianceContribution {
  input: StochasticInputKey;
  label: string;
  /** Share of the p10–p90 spread that disappears when this input is pinned. 0–1. */
  contribution: number;
  /** The residual spread with this input pinned, integer cents. */
  spreadIfPinnedCents: number;
}

export interface VarianceAttribution {
  /** The dominant input. Null when nothing in the model is stochastic. */
  input: StochasticInputKey | null;
  label: string;
  contribution: number;
  totalSpreadCents: number;
  /** `totalSpread − spreadIfPinned` for the dominant input, integer cents. */
  spreadExplainedCents: number;
  /** Every candidate, not only the winner. */
  all: readonly VarianceContribution[];
  /** The mechanism, stated (D8). */
  method: string;
  /** Populated when the answer needs a caveat — degenerate spread, single input. */
  note: string | null;
}

export const VARIANCE_METHOD =
  'One-at-a-time pinning under common random numbers: each stochastic input is fixed at its central value (effort at its mode, the overrun ratio at its observed median) while every other draw stays byte-identical, and the input is credited with the share of the p10–p90 margin spread that disappears. Pinning is an approximation — contributions are shares of the observed spread and do not sum to 1 when inputs interact multiplicatively, as cost and overrun do here.';

/**
 * WHICH INPUT OWNS THE SPREAD — because "the margin might be anywhere between
 * $2k and $11k" is not actionable, and "it is almost all the effort estimate, and
 * that estimate is a placeholder" is.
 *
 * Only genuinely stochastic inputs are candidates, and both exclusions are
 * load-bearing rather than tidy:
 *  · A fixed-fee card makes effort irrelevant to cost, so effort is not a
 *    candidate no matter how wide its triple is. Crediting a wide triple with
 *    variance it cannot cause would send the founder to renegotiate the wrong
 *    number.
 *  · A zero-variance triple (o == p) and a zero blend weight are likewise not
 *    candidates. With neither present the spread is genuinely zero, `input` is
 *    null, and `note` says so instead of naming an arbitrary winner.
 */
function attributeVariance(base: SimParams, totalSpread: number, effortIsStochastic: boolean): VarianceAttribution {
  const candidates: StochasticInputKey[] = [];
  if (effortIsStochastic) candidates.push('effort');
  // `weight > 0` alone: with a single recorded outcome the ratios array has one
  // entry but the MIXTURE (observed ratio with probability w, else 1.00) is still
  // stochastic. A candidate whose ratios happen to be identical simply scores 0,
  // which is the honest answer rather than an omission.
  if (base.blend.weight > 0) candidates.push('outcome_overrun');

  if (candidates.length === 0 || totalSpread <= 0) {
    return {
      input: null,
      label: 'No stochastic input',
      contribution: 0,
      totalSpreadCents: totalSpread,
      spreadExplainedCents: 0,
      all: [],
      method: VARIANCE_METHOD,
      note:
        totalSpread <= 0
          ? 'The p10–p90 spread is zero: every sampled outcome produced the same margin. Nothing varies, so nothing can dominate.'
          : 'No input in this model varies. The single reported margin is arithmetic, not a forecast.',
    };
  }

  const all: VarianceContribution[] = candidates.map((input) => {
    const pinned = simulate({ ...base, freeze: input });
    const a = pinned.marginsAsc;
    const nn = a.length;
    const residual =
      (a[orderStatisticIndex(nn, 90)] ?? 0) - (a[orderStatisticIndex(nn, 10)] ?? 0);
    const removed = totalSpread - residual;
    return {
      input,
      label: STOCHASTIC_INPUT_LABEL[input],
      contribution: round4(Math.min(1, Math.max(0, removed / totalSpread))),
      spreadIfPinnedCents: residual,
    };
  });

  all.sort((x, y) => y.contribution - x.contribution);
  const top = all[0]!;
  return {
    input: top.input,
    label: top.label,
    contribution: top.contribution,
    totalSpreadCents: totalSpread,
    spreadExplainedCents: totalSpread - top.spreadIfPinnedCents,
    all,
    method: VARIANCE_METHOD,
    note:
      candidates.length === 1
        ? `Only one input varies in this model (${top.label}), so it necessarily dominates. That is a statement about the model's shape, not evidence that it is the real driver.`
        : null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE UNDERWRITING                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface UnderwriteOptions {
  /**
   * REQUIRED. The instant staleness is judged against. There is no
   * default-to-now: a pure function that reads the clock is untestable, and a
   * caller who forgot the date would get a confident answer about a rate card's
   * validity that depends on when the process happened to run
   * (`partners.ts:207`). `marginAtRisk` allows skipping it and reports
   * `stalenessEvaluated: false`; this module does not offer that door.
   */
  asOf: string;
  /**
   * Recorded outcomes across the whole book. Filtered to this offer internally, so
   * a caller cannot accidentally blend a white paper's overruns into a diagnostic.
   */
  outcomes?: readonly RecordedOutcome[];
  /** Clamped to [1, 20000]. 1 is permitted so the degenerate case is testable. */
  samples?: number;
  seed?: number;
}

/**
 * THE OUTPUT. One interface for both the refusal and the answer, matching
 * `MarginAtRisk` (`partners.ts:1009`) — verdict plus nullable numbers plus
 * reasons — rather than a discriminated union, so the API layer and the web layer
 * narrow the same way they already do everywhere else in GPS.
 *
 * `reasons` is never empty, on any path.
 */
export interface Underwriting {
  verdict: UnderwriteVerdict;
  offerKey: OfferKey;
  partnerId: string;
  /** Echoed uppercase. Never converted (see `resolveCostBasis`). */
  currency: string;
  priceCents: number;
  asOf: string;

  /** Null on every refusal. */
  distribution: MarginDistribution | null;
  /**
   * P(realised margin < 0), 0–1 at 4 dp. THE NUMBER THAT CHANGES BEHAVIOUR, and
   * the one figure this entire phase exists to produce. Null on a refusal —
   * never 0, because "no loss risk found" and "loss risk not computable" are
   * opposite statements (`partners.ts:1047`).
   */
  pLoss: number | null;
  /** The same probability in ICD-203 words (`estimative.ts:52`). One vocabulary. */
  pLossLikelihood: Likelihood | null;
  /** Raw count behind `pLoss`, so the fraction can be checked by hand. */
  lossSampleCount: number | null;
  varianceDriver: VarianceAttribution | null;

  basis: UnderwritingBasis;
  basisReason: string;
  blend: OutcomeBlend;

  effort: EffortTriple;
  /** The clamped triple actually sampled, after `resolveDuration`. */
  effortDays: DurationTriple;
  effortIsPlaceholder: boolean;

  rateCardStatus: RateCardStatus;
  /** Reported even on refusal: reproducing a refusal matters as much as a result. */
  seed: number;
  sampleCount: number;

  drivers: readonly UnderwriteDriver[];
  reasons: readonly string[];
  method: string;
}

export const UNDERWRITE_METHOD =
  'Monte Carlo over two inputs: partner effort sampled from a triangular(optimistic, likely, pessimistic) distribution, and a realised-vs-quoted cost overrun ratio bootstrapped from recorded outcomes with weight n/8. Cost = round(rate × days) + pass-through, then × overrun ratio, rounded. Margin = price − cost, integer cents. Seeded (mulberry32) and fully deterministic: identical inputs and seed produce identical output.';

/**
 * THE DISTRIBUTION OF REALISED MARGIN ON THIS QUOTE — or a stated refusal.
 *
 * The one function this phase exists for. Given a price, a partner's rate card and
 * an effort triple, it answers "in what fraction of plausible outcomes does this
 * engagement lose money", with the trail that produced the answer and the honest
 * label for where the inputs came from.
 *
 * DETERMINISM IS A FEATURE, NOT AN ACCIDENT. Same inputs + same seed → byte-
 * identical output, including the variance attribution. A quote screen that
 * re-renders on every keystroke must not shimmer: a p50 that wobbles by $40
 * between two identical renders teaches the founder to distrust the instrument,
 * and he would be right to.
 *
 * VERDICT PRECEDENCE. Cost-basis refusals are evaluated before the price, because
 * a currency mismatch or an expired card means nothing downstream can be computed
 * whatever the price is. A bad price is still reported in `reasons` in that case,
 * so nothing is lost — only the single `verdict` slot is contested.
 */
export function underwrite(quote: UnderwriteQuote, model: CostModel, opts: UnderwriteOptions): Underwriting {
  const priceCents = Number.isFinite(quote.priceCents) ? Math.round(quote.priceCents) : Number.NaN;
  const currency = quote.currency.toUpperCase();
  const samples = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(opts.samples ?? DEFAULT_SAMPLE_COUNT)));
  const seed = (opts.seed ?? DEFAULT_SEED) >>> 0;
  const blend = outcomeBlend(quote.offerKey, opts.outcomes ?? []);
  const duration = effortToDuration(model.effort);
  const resolution = resolveCostBasis(quote, model, opts.asOf);
  const reasons: string[] = [...resolution.reasons];

  const priceUnusable = !Number.isFinite(priceCents) || priceCents < 0;
  if (priceUnusable) {
    reasons.push(
      `Price is ${quote.priceCents}, which cannot be underwritten. A negative or non-numeric price is corrupt data, not a discount — and a cost distribution against it would report a fictional profit.`,
    );
  }

  const shell = {
    offerKey: quote.offerKey,
    partnerId: model.partnerId,
    currency,
    priceCents: Number.isFinite(priceCents) ? priceCents : 0,
    asOf: opts.asOf,
    basis: resolveBasis(blend.basis, model.effort.isPlaceholder, resolution.basis?.effortMatters ?? true),
    blend,
    effort: model.effort,
    effortDays: duration,
    effortIsPlaceholder: model.effort.isPlaceholder,
    rateCardStatus: resolution.rateCardStatus,
    seed,
    sampleCount: samples,
    method: UNDERWRITE_METHOD,
  };

  if (resolution.basis == null || priceUnusable) {
    const verdict = resolution.basis == null ? resolution.verdict : 'refused_price_not_set';
    return {
      ...shell,
      verdict,
      distribution: null,
      pLoss: null,
      pLossLikelihood: null,
      lossSampleCount: null,
      varianceDriver: null,
      basisReason: `No distribution was produced (${UNDERWRITE_VERDICT_LABEL[verdict]}), so there is no basis to report. ${BASIS_LABEL[shell.basis]} describes only what the inputs WOULD have been.`,
      drivers: [
        { label: 'Price to client', points: shell.priceCents, unit: 'cents', detail: currency },
        { label: 'Refusal', points: 0, unit: 'count', detail: UNDERWRITE_VERDICT_LABEL[verdict] },
      ],
      reasons,
    };
  }

  const costBasis = resolution.basis;
  const effortIsStochastic = costBasis.effortMatters && duration.max > duration.min;
  const base: SimParams = { priceCents, basis: costBasis, duration, blend, samples, seed, effortUplift: 0, freeze: null };
  const out = simulate(base);
  const distribution = buildDistribution(priceCents, out);
  const pLoss = round4(out.lossCount / samples);
  const pLossL = likelihood(pLoss);
  const varianceDriver = attributeVariance(base, distribution.spreadCents, effortIsStochastic);
  const basis = resolveBasis(blend.basis, model.effort.isPlaceholder, costBasis.effortMatters);
  const likelyCost = Math.round(costBasis.centsPerDay * duration.mode) + costBasis.fixedCents;

  /* ── The system argues back (D4) ─────────────────────────────────────────── */

  if (priceCents === 0) {
    reasons.push('Price is zero, so every outcome is a loss of the full cost. Margin percentages are null rather than −100%: there is no price to be a percentage of.');
  }
  if (out.lossCount > 0) {
    reasons.push(
      `At ${currency} ${(priceCents / 100).toFixed(2)} this engagement LOSES MONEY in ${out.lossCount} of ${samples} simulated outcomes (${(pLoss * 100).toFixed(1)}% — ${pLossL.term}).`,
    );
  } else {
    reasons.push(`No simulated outcome loses money at this price, under these inputs. That is a statement about the inputs, not a guarantee: the pessimistic effort figure is the ceiling this model knows about, and reality is not bounded by it.`);
  }
  if (basis === 'prior') {
    reasons.push(
      'BASIS: PRIOR. Nothing here has been measured. The band is a founder estimate propagated through arithmetic — it will change shape, possibly a lot, the first time a real partner invoice is recorded.',
    );
  }
  if (model.effort.isPlaceholder) {
    reasons.push(
      `EFFORT TRIPLE IS A PLACEHOLDER (${duration.min}/${duration.mode}/${duration.max} days, stated by ${model.effort.statedBy}). It was not supplied by the founder and is not measured. Replace it in one block before quoting from this screen.`,
    );
  }
  if (!costBasis.effortMatters) {
    reasons.push('Because the partner works to a fixed fee, the cost has no spread: every percentile below is the same number and the overrun risk is theirs, not ours.');
  }
  if (samples < 200) {
    reasons.push(`Only ${samples} samples: the percentiles are coarse and adjacent ones may be the same observation. Raise the sample count before reading the tails.`);
  }
  const quoted = quote.quotedVendorCostCents;
  if (quoted != null && Number.isFinite(quoted) && quoted >= 0) {
    const gap = distribution.p50CostCents - Math.round(quoted);
    const tolerance = Math.max(1, Math.round(Math.abs(Math.round(quoted)) * 0.1));
    if (Math.abs(gap) > tolerance) {
      reasons.push(
        gap > 0
          ? `The quote books a vendor cost of ${Math.round(quoted)}c; the model's MEDIAN cost is ${distribution.p50CostCents}c — ${gap}c higher. The quoted margin is optimistic by that amount at the median alone.`
          : `The quote books a vendor cost of ${Math.round(quoted)}c; the model's median cost is ${distribution.p50CostCents}c — ${-gap}c lower. The quote is conservative, which is safe but may be leaving price on the table.`,
      );
    }
  }

  const drivers: UnderwriteDriver[] = [
    { label: 'Price to client', points: priceCents, unit: 'cents', detail: currency },
    {
      label: 'Effort — optimistic / likely / pessimistic',
      points: duration.mode,
      unit: 'days',
      detail: `${duration.min} / ${duration.mode} / ${duration.max} days · stated by ${model.effort.statedBy} at ${model.effort.statedAt}${model.effort.isPlaceholder ? ' · PLACEHOLDER' : ''}`,
    },
    { label: 'Cost at likely effort', points: -likelyCost, unit: 'cents', detail: costBasis.formula },
    { label: 'Median modelled cost (p50)', points: -distribution.p50CostCents, unit: 'cents', detail: `${RATE_UNIT_LABEL[model.card.unit]} card, ${model.card.currency.toUpperCase()}, valid until ${model.card.validUntil ?? 'NOT STATED'}` },
    { label: 'Median margin (p50)', points: distribution.p50MarginCents, unit: 'cents', detail: distribution.p50MarginPct == null ? 'no price, so no percentage' : `${distribution.p50MarginPct}% of price` },
    { label: 'Band width (p90 − p10)', points: distribution.spreadCents, unit: 'cents', detail: varianceDriver.input == null ? 'nothing varies' : `dominated by ${varianceDriver.label} (${Math.round(varianceDriver.contribution * 100)}%)` },
    { label: 'P(margin < 0)', points: Math.round(pLoss * 1000) / 10, unit: 'pct', detail: `${out.lossCount} of ${samples} samples · ${pLossL.term}` },
    { label: 'Recorded outcomes used', points: blend.sampleSize, unit: 'count', detail: blend.reason },
    { label: 'Outcome blend weight', points: blend.weight, unit: 'ratio', detail: `${Math.round(blend.weight * 100)}% of the cost draw comes from recorded outcomes (n/${MIN_OUTCOMES_FOR_MEASURED})` },
    { label: 'Samples', points: samples, unit: 'count', detail: `seed ${seed} · deterministic` },
  ];
  if (costBasis.fixedCents !== 0 && model.card.unit !== 'fixed') {
    drivers.splice(3, 0, { label: 'Pass-through cost (no spread)', points: -costBasis.fixedCents, unit: 'cents', detail: 'Shifts the whole distribution; contributes nothing to its width.' });
  }

  return {
    ...shell,
    verdict: 'underwritten',
    basis,
    distribution,
    pLoss,
    pLossLikelihood: pLossL,
    lossSampleCount: out.lossCount,
    varianceDriver,
    basisReason: `${BASIS_LABEL[basis]}. ${blend.reason}${basis === 'blended' && blend.basis === 'measured' ? ' Capped at blended because the effort triple driving cost is still a placeholder.' : ''}`,
    drivers,
    reasons,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* OVERRUN SENSITIVITY — what a scope slip costs, before signature             */
/* ══════════════════════════════════════════════════════════════════════════ */

/** The default uplifts, per `GPS_100X_PLAN.md` §3 slice 7.4: +10 / +25 / +50%. */
export const DEFAULT_EFFORT_UPLIFTS: readonly number[] = [10, 25, 50] as const;

export interface OverrunPoint {
  /** 0 for the baseline, then 10, 25, 50 … */
  effortUpliftPct: number;
  p10MarginCents: number;
  p50MarginCents: number;
  p90MarginCents: number;
  p50MarginPct: number | null;
  pLoss: number;
  /** Median margin minus the baseline's. ≤ 0 by construction — see `simulate`. */
  deltaP50Cents: number;
  /** P(loss) minus the baseline's. ≥ 0 by construction. */
  deltaPLoss: number;
}

export interface OverrunSensitivity {
  verdict: UnderwriteVerdict;
  offerKey: OfferKey;
  partnerId: string;
  currency: string;
  priceCents: number;
  seed: number;
  sampleCount: number;
  /** Baseline first, then one per uplift, ascending. Empty on a refusal. */
  points: readonly OverrunPoint[];
  /**
   * The smallest TESTED uplift at which the median margin goes negative, or null
   * if none of them does. "Tested" is load-bearing: this is not a solved
   * breakeven, it is the first of the uplifts you asked about that breaks.
   */
  breakevenUpliftPct: number | null;
  /**
   * Asserted, not assumed: median margin non-increasing and P(loss)
   * non-decreasing across the points. True by construction (`simulate` invariant
   * 2); the field exists so a surface can state the property from data rather than
   * from a comment, and so a regression in the sampler is visible instead of
   * silent (D8).
   */
  monotone: boolean;
  reasons: readonly string[];
  method: string;
}

export const OVERRUN_METHOD =
  'The sampled effort is multiplied by (1 + uplift) and everything else is held byte-identical — same seed, same draw order, same overrun ratios (common random numbers). So each uplift is compared against the baseline sample-by-sample, not run-against-run, and the resulting monotonicity is arithmetic rather than statistical.';

/**
 * WHAT A SCOPE SLIP DOES TO THE MARGIN, AT $10–25k, BEFORE ANYONE SIGNS.
 *
 * The founder's engagements are small enough that a 25% effort overrun is not a
 * dented quarter, it is the whole margin. The point of this function is that the
 * number appears BEFORE signature rather than in the partner's invoice.
 *
 * The 0% point is included deliberately, as the first row: a sensitivity table
 * whose baseline lives on a different screen invites the reader to compare against
 * a half-remembered figure. It is byte-identical to `underwrite`'s distribution for
 * the same inputs and seed, and the test asserts that.
 */
export function overrunSensitivity(
  quote: UnderwriteQuote,
  model: CostModel,
  opts: UnderwriteOptions,
  uplifts: readonly number[] = DEFAULT_EFFORT_UPLIFTS,
): OverrunSensitivity {
  const priceCents = Number.isFinite(quote.priceCents) ? Math.round(quote.priceCents) : Number.NaN;
  const currency = quote.currency.toUpperCase();
  const samples = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(opts.samples ?? DEFAULT_SAMPLE_COUNT)));
  const seed = (opts.seed ?? DEFAULT_SEED) >>> 0;
  const blend = outcomeBlend(quote.offerKey, opts.outcomes ?? []);
  const duration = effortToDuration(model.effort);
  const resolution = resolveCostBasis(quote, model, opts.asOf);
  const reasons: string[] = [...resolution.reasons];
  const shell = {
    offerKey: quote.offerKey,
    partnerId: model.partnerId,
    currency,
    priceCents: Number.isFinite(priceCents) ? priceCents : 0,
    seed,
    sampleCount: samples,
    method: OVERRUN_METHOD,
  };

  const priceUnusable = !Number.isFinite(priceCents) || priceCents < 0;
  if (resolution.basis == null || priceUnusable) {
    const verdict = resolution.basis == null ? resolution.verdict : 'refused_price_not_set';
    reasons.push('No sensitivity table is produced when the baseline cannot be underwritten: scaling an effort figure we refused to cost would produce four fictional rows instead of one honest refusal.');
    return { ...shell, verdict, points: [], breakevenUpliftPct: null, monotone: true, reasons };
  }

  const costBasis = resolution.basis;
  const base: SimParams = { priceCents, basis: costBasis, duration, blend, samples, seed, effortUplift: 0, freeze: null };
  // Ascending, de-duplicated, non-negative, with the baseline first.
  const ladder = [0, ...uplifts.filter((u) => Number.isFinite(u) && u > 0)]
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .sort((a, b) => a - b);

  let baselineP50 = 0;
  let baselinePLoss = 0;
  const points: OverrunPoint[] = ladder.map((upliftPct, i) => {
    const out = simulate({ ...base, effortUplift: upliftPct / 100 });
    const dist = buildDistribution(priceCents, out);
    const pLoss = round4(out.lossCount / samples);
    if (i === 0) {
      baselineP50 = dist.p50MarginCents;
      baselinePLoss = pLoss;
    }
    return {
      effortUpliftPct: upliftPct,
      p10MarginCents: dist.p10MarginCents,
      p50MarginCents: dist.p50MarginCents,
      p90MarginCents: dist.p90MarginCents,
      p50MarginPct: dist.p50MarginPct,
      pLoss,
      deltaP50Cents: dist.p50MarginCents - baselineP50,
      deltaPLoss: round4(pLoss - baselinePLoss),
    };
  });

  let monotone = true;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.p50MarginCents > points[i - 1]!.p50MarginCents) monotone = false;
    if (points[i]!.pLoss < points[i - 1]!.pLoss) monotone = false;
  }
  if (!monotone) {
    reasons.push('MONOTONICITY VIOLATED: a larger effort overrun produced a better margin. That is arithmetically impossible under common random numbers, so the sampler is wrong — do not trust any number on this table.');
  }

  // The baseline is INCLUDED in the breakeven search: when the median is already
  // underwater at 0%, `breakevenUpliftPct: 0` reads correctly as "before any
  // overrun at all", whereas skipping the baseline would report the first uplift
  // and imply the quote was sound until then.
  const broken = points.find((p) => p.p50MarginCents < 0);
  if (!costBasis.effortMatters) {
    reasons.push('Fixed-fee card: an effort overrun does not change our cost at all, so every row below is identical. The overrun risk sits with the partner. Confirm the fixed fee covers the scope you are about to sell.');
  } else if (broken && broken.effortUpliftPct === 0) {
    reasons.push(`The MEDIAN margin is already underwater (${broken.p50MarginCents}c) before any overrun. This is not an overrun problem; the price is below the modelled cost.`);
  } else if (broken) {
    reasons.push(`A ${broken.effortUpliftPct}% effort overrun puts the MEDIAN margin underwater (${broken.p50MarginCents}c). Half the outcomes lose money at that point, not the tail.`);
  } else {
    const worst = points[points.length - 1]!;
    reasons.push(`Even at +${worst.effortUpliftPct}% effort the median margin stays positive (${worst.p50MarginCents}c, ${worst.p50MarginPct == null ? 'n/a' : `${worst.p50MarginPct}%`}), with P(loss) ${(worst.pLoss * 100).toFixed(1)}%.`);
  }

  return { ...shell, verdict: 'underwritten', points, breakevenUpliftPct: broken?.effortUpliftPct ?? null, monotone, reasons };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE GOVERNED REFUSAL — blocked, not warned about                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHEN A PROPOSAL MAY NOT BE ISSUED.
 *
 * `GPS_100X_PLAN.md` §3 slice 7.3: "P(loss) above a threshold blocks issuing the
 * proposal through the governed action rather than warning politely." A warning is
 * a thing you click past at 23:00 to get a quote out; a block is a decision
 * someone has to overturn on the record. Those are different products.
 *
 * `statedBy` / `statedAt` are on the policy because a threshold is a HUMAN'S RISK
 * APPETITE, not a fact about the world. When a blocked proposal turns out to have
 * been fine, the record of who set 20% is how the number gets revisited.
 */
export interface IssuePolicy {
  /** 0–1. STRICTLY above this blocks. */
  maxPLoss: number;
  /**
   * Median gross margin as a percent of price, below which issuing is blocked.
   * NULL BY DEFAULT AND THAT IS DELIBERATE: no margin floor has been supplied, and
   * inventing one here would put a fabricated business rule between the founder
   * and his own quote. `CATALOGUE_TODOS` (`catalogue.ts:477`) is where the missing
   * commercial inputs are already tracked; this is one of them.
   */
  minP50MarginPct: number | null;
  /** Any refusal verdict blocks. Present as a field so the policy is fully legible. */
  blockOnRefusal: boolean;
  /**
   * FALSE by default. Blocking every quote whose basis is a prior would block every
   * quote on day one — there are no recorded outcomes — and an instrument that
   * refuses everything gets routed around, which loses both the block AND the
   * label. The prior is disclosed instead. Flip this on once outcomes exist.
   */
  blockOnPriorBasis: boolean;
  /** FALSE by default, same reasoning: every triple is a placeholder today. */
  blockOnPlaceholderEffort: boolean;
  /** Who set this appetite. A named human, or `system:default` for the shipped prior. */
  statedBy: string;
  statedAt: string;
}

/**
 * Greppable marker: the shipped threshold is a STATED PRIOR, not a derived or
 * agreed figure. In the manner of `PRICE_BANDS_ARE_PLACEHOLDERS` (`catalogue.ts:58`)
 * and `CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL` (`calibration.ts:822`).
 */
export const ISSUE_POLICY_IS_A_STATED_PRIOR =
  'The 20% P(loss) block threshold is a stated default, not a founder-agreed risk appetite and not derived from outcomes. It exists so the governed block has a number to quote; it should be reviewed the first time it blocks something.';

export const DEFAULT_ISSUE_POLICY: IssuePolicy = {
  maxPLoss: 0.2,
  minP50MarginPct: null,
  blockOnRefusal: true,
  blockOnPriorBasis: false,
  blockOnPlaceholderEffort: false,
  statedBy: 'system:default',
  statedAt: PLACEHOLDER_STATED_AT,
};

export type IssueBlockCode =
  | 'ok'
  | 'underwriting_refused'
  | 'p_loss_above_threshold'
  | 'p50_margin_below_floor'
  | 'basis_is_prior'
  | 'effort_is_placeholder';

/** One check, with both sides of it, so a UI never has to reconstruct the comparison. */
export interface IssueCheck {
  code: IssueBlockCode;
  name: string;
  /** The policy's value. A string for label-valued checks such as the basis. */
  threshold: number | string;
  observed: number | string;
  unit: 'ratio' | 'pct' | 'label';
}

export interface IssueDecision {
  blocked: boolean;
  /** `'ok'` when nothing blocked. Otherwise the HIGHEST-precedence failing check. */
  code: IssueBlockCode;
  /** One sentence, written to be quoted verbatim by both the screen and the action registry. */
  reason: string;
  /** Every failing check, in precedence order — not just the first. */
  failed: readonly IssueCheck[];
  /** Every check that ran and passed, so "allowed" is explained too (D2). */
  passed: readonly IssueCheck[];
  /** Echoed in full so the registry and the screen cannot quote different numbers. */
  policy: IssuePolicy;
}

/**
 * THE BLOCK DECISION. Pure, and it takes the `Underwriting` rather than the quote,
 * so the block can never disagree with the numbers on screen: there is exactly one
 * simulation and both the display and the gate read it.
 *
 * PRECEDENCE, and why: a refusal outranks everything, because a proposal whose
 * margin could not be computed at all is a worse thing to issue than one with a
 * known 40% chance of losing money. Then P(loss), then the margin floor, then the
 * two disclosure-grade checks that are off by default.
 */
export function shouldBlockIssue(u: Underwriting, policy: IssuePolicy = DEFAULT_ISSUE_POLICY): IssueDecision {
  const failed: IssueCheck[] = [];
  const passed: IssueCheck[] = [];

  const refusalCheck: IssueCheck = {
    code: 'underwriting_refused',
    name: 'Underwriting produced a distribution',
    threshold: 'underwritten',
    observed: u.verdict,
    unit: 'label',
  };
  if (isRefusal(u.verdict)) {
    if (policy.blockOnRefusal) failed.push(refusalCheck);
    else passed.push(refusalCheck);
  } else {
    passed.push(refusalCheck);
  }

  // P(loss) and the margin floor are only meaningful when a distribution exists.
  if (!isRefusal(u.verdict) && u.pLoss != null) {
    const c: IssueCheck = { code: 'p_loss_above_threshold', name: 'P(margin < 0) within appetite', threshold: policy.maxPLoss, observed: u.pLoss, unit: 'ratio' };
    (u.pLoss > policy.maxPLoss ? failed : passed).push(c);

    if (policy.minP50MarginPct != null) {
      const observed = u.distribution?.p50MarginPct;
      const c2: IssueCheck = {
        code: 'p50_margin_below_floor',
        name: 'Median margin at or above floor',
        threshold: policy.minP50MarginPct,
        observed: observed ?? 'not computable (price is 0)',
        unit: 'pct',
      };
      (observed == null || observed < policy.minP50MarginPct ? failed : passed).push(c2);
    }
  }

  if (policy.blockOnPriorBasis) {
    const c: IssueCheck = { code: 'basis_is_prior', name: 'Basis is not a bare prior', threshold: 'blended or measured', observed: u.basis, unit: 'label' };
    (u.basis === 'prior' ? failed : passed).push(c);
  }
  if (policy.blockOnPlaceholderEffort) {
    const c: IssueCheck = { code: 'effort_is_placeholder', name: 'Effort triple is founder-supplied', threshold: 'not a placeholder', observed: u.effortIsPlaceholder ? 'placeholder' : 'supplied', unit: 'label' };
    (u.effortIsPlaceholder ? failed : passed).push(c);
  }

  const ORDER: IssueBlockCode[] = ['underwriting_refused', 'p_loss_above_threshold', 'p50_margin_below_floor', 'basis_is_prior', 'effort_is_placeholder'];
  failed.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
  const top = failed[0];

  if (!top) {
    return {
      blocked: false,
      code: 'ok',
      reason:
        u.pLoss == null
          ? `Issuing is permitted: no policy check blocked it. ${ISSUE_POLICY_IS_A_STATED_PRIOR}`
          : `Issuing is permitted: P(loss) ${(u.pLoss * 100).toFixed(1)}% is within the ${(policy.maxPLoss * 100).toFixed(0)}% appetite set by ${policy.statedBy}. Permitted is not endorsed — the basis is "${u.basis}".`,
      failed,
      passed,
      policy,
    };
  }

  const reason = ((): string => {
    switch (top.code) {
      case 'underwriting_refused':
        return `BLOCKED: the margin on this quote could not be computed (${UNDERWRITE_VERDICT_LABEL[u.verdict]}). A proposal may not be issued against a margin nobody has. Fix the input named in the underwriting reasons, then re-run.`;
      case 'p_loss_above_threshold':
        return `BLOCKED: this price loses money in ${((u.pLoss ?? 0) * 100).toFixed(1)}% of simulated outcomes, above the ${(policy.maxPLoss * 100).toFixed(0)}% ceiling set by ${policy.statedBy} at ${policy.statedAt}. Raise the price, cut the scope, or have the threshold changed on the record.`;
      case 'p50_margin_below_floor':
        return `BLOCKED: median margin ${u.distribution?.p50MarginPct == null ? 'is not computable' : `is ${u.distribution.p50MarginPct}%`}, below the ${policy.minP50MarginPct}% floor set by ${policy.statedBy}.`;
      case 'basis_is_prior':
        return `BLOCKED: the underwriting basis is a bare prior (no recorded outcomes) and this policy requires a measured or blended basis before issuing.`;
      case 'effort_is_placeholder':
        return `BLOCKED: the effort triple for ${u.offerKey} is still the shipped placeholder, and this policy requires a founder-supplied triple before issuing.`;
      default:
        return 'BLOCKED.';
    }
  })();

  return { blocked: true, code: top.code, reason, failed, passed, policy };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* DEVIL'S ADVOCATE (D4) — the three most likely reasons this runs over         */
/* ══════════════════════════════════════════════════════════════════════════ */

export type DevilsAdvocateSource = 'recorded_outcomes' | 'offer_exclusions' | 'none';

export interface OverrunArgument {
  /** 1 = most likely. */
  rank: number;
  /** The argument, addressed to the person about to sign. */
  claim: string;
  /** What supports it — a count over a denominator, or the exclusion's own wording. */
  evidence: string;
  source: DevilsAdvocateSource;
  /** Occurrences. 0 for an exclusion-derived argument, which has no sample at all. */
  sampleSize: number;
  /** The denominator the sample is out of. 0 when there is none. */
  denominator: number;
}

export interface DevilsAdvocate {
  source: DevilsAdvocateSource;
  /**
   * WHICH SOURCE WAS USED, in words, always. The brief for this function requires
   * it and so does D8: "drawn from three recorded overruns" and "inferred from the
   * exclusions because nothing has been recorded" are arguments of completely
   * different weight, and a reader cannot tell them apart from the claims alone.
   */
  sourceStatement: string;
  arguments: readonly OverrunArgument[];
  /** The falsifier — what evidence would change this answer. */
  whatWouldChangeThis: string;
}

/**
 * Exclusions that belong to THIS offer rather than to the whole business.
 *
 * The four perimeter exclusions (no listing, no regulatory approval, no legal
 * advice, no market outcome) are appended to every offer by
 * `withUniversalExclusions` (`catalogue.ts:424`) and are NOT overrun risks — they
 * are promises nobody is allowed to make. "This engagement will run over because
 * we do not guarantee a listing" is nonsense, and shipping it would discredit the
 * whole panel.
 *
 * `UNIVERSAL_EXCLUSIONS` is private to the catalogue, so they are identified by a
 * property instead of by identity: a perimeter line appears in MORE THAN ONE
 * offer's list. That is robust to the count changing and to a fifth perimeter line
 * being added later, which a hard-coded `slice(0, -4)` would not be. The one
 * offer that substitutes a sharper legal-advice line (`catalogue.ts:425`) keeps it
 * as offer-specific, which is correct: a client asking us to review counsel's
 * conclusions is exactly an unbilled scope overrun.
 */
function offerSpecificExclusions(offer: ServiceOfferLike): string[] {
  const shared = new Set<string>();
  const seen = new Set<string>();
  for (const o of OFFERS) {
    for (const e of o.exclusions) {
      if (seen.has(e)) shared.add(e);
      seen.add(e);
    }
  }
  return offer.exclusions.filter((e) => !shared.has(e));
}

/**
 * The shape `devilsAdvocate` needs from an offer — a structural subset of
 * `ServiceOffer` (`types.ts:99`), so a FROZEN `scopeSnapshot` (`types.ts:328`) can
 * be passed instead of today's catalogue entry. What the client agreed to is what
 * should be argued about; the catalogue is versioned code and will have moved on.
 */
export interface ServiceOfferLike {
  key: OfferKey;
  name: string;
  exclusions: readonly string[];
  requiredClientInputs: readonly string[];
}

interface Candidate {
  rate: number;
  count: number;
  denominator: number;
  claim: string;
  evidence: string;
}

/**
 * THE SYSTEM ARGUES BACK. The three most likely reasons this engagement runs over.
 *
 * Recorded outcomes when they exist, the offer's own exclusions before then, and it
 * SAYS which. Ranked by observed frequency, and a candidate with zero occurrences
 * is not promoted to a "most likely reason" merely because its category exists —
 * "0 of 5 engagements ran late" is evidence FOR the quote, not against it.
 */
export function devilsAdvocate(
  offer: ServiceOfferLike,
  u: Underwriting,
  outcomes: readonly RecordedOutcome[] = [],
): DevilsAdvocate {
  const mine = outcomes.filter((o) => o.offerKey === offer.key);
  const candidates: Candidate[] = [];
  const add = (count: number, denominator: number, claim: string, evidence: string): void => {
    if (count > 0 && denominator > 0) candidates.push({ rate: count / denominator, count, denominator, claim, evidence });
  };

  const withCosts = mine.filter((o) => o.actualVendorCostCents != null && o.quotedVendorCostCents > 0);
  const overran = withCosts.filter((o) => (o.actualVendorCostCents as number) > o.quotedVendorCostCents);
  const worstOverrunPct = overran.length
    ? Math.max(...overran.map((o) => Math.round((((o.actualVendorCostCents as number) - o.quotedVendorCostCents) / o.quotedVendorCostCents) * 100)))
    : 0;
  add(
    overran.length,
    withCosts.length,
    `The partner invoices more than the quote assumed. It has happened on ${overran.length} of ${withCosts.length} recorded ${offer.name} engagement${withCosts.length === 1 ? '' : 's'}, the worst by ${worstOverrunPct}%.`,
    `${overran.length}/${withCosts.length} recorded outcomes with a realised vendor cost above the quoted one.`,
  );

  const withDates = mine.filter((o) => o.dueAt != null && o.deliveredAt != null);
  const late = withDates.filter((o) => Date.parse(o.deliveredAt as string) > Date.parse(o.dueAt as string));
  add(
    late.length,
    withDates.length,
    `Delivery slips past the date in the acceptance criteria, and coordination days you do not bill for accumulate while it does.`,
    `${late.length}/${withDates.length} recorded outcomes delivered after their due date.`,
  );

  const withRework = mine.filter((o) => o.reworkRounds != null);
  const reworked = withRework.filter((o) => (o.reworkRounds as number) >= 1);
  add(
    reworked.length,
    withRework.length,
    `Unscoped revision rounds. Each one is partner days nobody quoted, and the client will not perceive them as extra work.`,
    `${reworked.length}/${withRework.length} recorded outcomes needed at least one rework round beyond scope.`,
  );

  const withFirstPass = mine.filter((o) => o.acceptedFirstPass != null);
  const rejected = withFirstPass.filter((o) => o.acceptedFirstPass === false);
  add(
    rejected.length,
    withFirstPass.length,
    `The client does not accept on the first pass, which restarts coordination on a deliverable already paid for.`,
    `${rejected.length}/${withFirstPass.length} recorded outcomes were not accepted first pass.`,
  );

  const withFinal = mine.filter((o) => o.finalPriceCents != null);
  const conceded = withFinal.filter((o) => (o.finalPriceCents as number) < o.quotedPriceCents);
  add(
    conceded.length,
    withFinal.length,
    `The price comes down after the work is under way, so the overrun lands on a smaller number than the one underwritten.`,
    `${conceded.length}/${withFinal.length} recorded outcomes invoiced below the quoted price.`,
  );

  candidates.sort((a, b) => b.rate - a.rate || b.count - a.count);
  const top = candidates.slice(0, 3);

  if (top.length > 0) {
    return {
      source: 'recorded_outcomes',
      sourceStatement: `Drawn from ${mine.length} recorded ${offer.name} outcome${mine.length === 1 ? '' : 's'}. These are observed frequencies on a small sample, not rates — at this volume nothing here is statistically established (${BASIS_LABEL[u.basis]}).`,
      arguments: top.map((c, i) => ({ rank: i + 1, claim: c.claim, evidence: c.evidence, source: 'recorded_outcomes' as const, sampleSize: c.count, denominator: c.denominator })),
      whatWouldChangeThis: `A recorded outcome that contradicts the top argument, or enough outcomes to reach n=${MIN_OUTCOMES_FOR_MEASURED} and move the basis to measured.`,
    };
  }

  const specific = offerSpecificExclusions(offer);
  const fromExclusions: OverrunArgument[] = specific.slice(0, 3).map((e, i) => ({
    rank: i + 1,
    claim: `The client asks for something this offer excludes, and the exclusion is where the argument happens: "${e}" Saying no costs goodwill; saying yes costs unbilled partner days.`,
    evidence: `Offer exclusion, ${offer.name}. No engagement has been recorded, so this is an inference from what the offer refuses to cover, not an observation.`,
    source: 'offer_exclusions' as const,
    sampleSize: 0,
    denominator: 0,
  }));
  // A late client input is the most ordinary services overrun there is, so it tops
  // up the list rather than being left out when an offer has few exclusions.
  for (const input of offer.requiredClientInputs) {
    if (fromExclusions.length >= 3) break;
    fromExclusions.push({
      rank: fromExclusions.length + 1,
      claim: `A required client input arrives late or incomplete: "${input}" The partner's days are booked and the calendar does not wait, so the effort lands compressed and over.`,
      // NOTE the wording: GPS has no intake surface for client material and the
      // domain-layer ratchet (`delivery.test.ts:639`) forbids even the vocabulary
      // of one in code. Chasing a late input is a conversation, not a queue item.
      evidence: `Required client input, ${offer.name}. Inferred from scope, not observed — and chasing it is a conversation, because GPS deliberately has no intake surface for client material (Phase 3 is gated on D2).`,
      source: 'offer_exclusions' as const,
      sampleSize: 0,
      denominator: 0,
    });
  }

  if (fromExclusions.length === 0) {
    return {
      source: 'none',
      sourceStatement: `No recorded outcome for ${offer.name} and no offer-specific exclusion or required client input to reason from. There is nothing here to argue with, and that is itself the finding: an offer with no stated exclusions has no defensible scope boundary.`,
      arguments: [],
      whatWouldChangeThis: 'Write the exclusions for this offer, or record one outcome.',
    };
  }

  return {
    source: 'offer_exclusions',
    sourceStatement:
      mine.length === 0
        ? `NO RECORDED OUTCOMES for ${offer.name}. Every argument below is inferred from the offer's own exclusions and required inputs — a reasoned guess about where scope breaks, carrying no sample and no frequency.`
        : `${mine.length} recorded ${offer.name} outcome${mine.length === 1 ? '' : 's'} exist but none showed an overrun, a late delivery, a rework round, a first-pass rejection or a price concession. The arguments below therefore fall back to the offer's exclusions and are inferences, not observations.`,
    arguments: fromExclusions,
    whatWouldChangeThis: `The first recorded outcome for ${offer.name}: it replaces every inference below with an observation, in either direction.`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* WIRE TYPES — ONE declaration, imported by the API and by the web            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE REQUEST.
 *
 * NOTE WHAT IS ABSENT: the rate card. The server loads it by `partnerId` +
 * `offerKey`. A client-supplied rate card would let the browser choose its own cost
 * basis and then read back a margin that agrees with it — the underwriting would
 * become a mirror. The card, its currency and its `validUntil` are server facts.
 */
export interface UnderwriteRequest {
  offerKey: OfferKey;
  /** Integer cents. The number the founder is typing. */
  priceCents: number;
  /** ISO-4217. Compared against the card, never converted. */
  currency: string;
  /** Optional cross-check against the modelled median. */
  quotedVendorCostCents?: number | null;
  partnerId: string;
  /**
   * Founder-supplied effort override. When absent the shipped PLACEHOLDER is used
   * and `effortTriplesArePlaceholders` on the response says so — the request cannot
   * silently promote a placeholder to a real figure.
   */
  effort?: {
    optimisticDays: number;
    likelyDays: number;
    pessimisticDays: number;
    statedBy: string;
    statedAt: string;
  } | null;
  /** Required for an hourly card; a refusal when absent (never assumed). */
  hoursPerDay?: number | null;
  /** Non-effort pass-through cost, integer cents. */
  fixedCostCents?: number | null;
  samples?: number;
  seed?: number;
  /** REQUIRED. Staleness is judged against this and nothing else. */
  asOf: string;
  /** Defaults to +10/+25/+50. */
  effortUpliftsPct?: number[];
  /** Partial override of `DEFAULT_ISSUE_POLICY`. */
  policy?: Partial<IssuePolicy>;
}

/**
 * THE RESPONSE. The whole underwriting screen in one payload.
 *
 * THE CONTRACT RULE: this is the ONLY declaration of this shape. The API returns it
 * and the web imports it from here. GPS has already shipped the other way round —
 * a hand-copied web interface claiming `counts` / `clientCount` / `openValueCents`
 * that the API never returned, which typechecked, passed a mocked page test, and
 * exploded when the migrations landed (`GPS_100X_PLAN.md` §1 D8). One declaration,
 * imported twice.
 */
export interface UnderwriteResponse {
  asOf: string;
  underwriting: Underwriting;
  sensitivity: OverrunSensitivity;
  issue: IssueDecision;
  devilsAdvocate: DevilsAdvocate;
  /** Global honesty flag, mirrored onto the wire so a surface never has to import it. */
  effortTriplesArePlaceholders: boolean;
  /** Verbatim `ISSUE_POLICY_IS_A_STATED_PRIOR`, so the block threshold is never presented as agreed. */
  policyNotice: string;
  /** Verbatim `PERCENTILE_METHOD` — the surface states the method beside the band. */
  percentileMethod: string;
  /**
   * Founder inputs this screen is standing on and does not have. Rendered as a
   * blocking banner, not a footnote: every number on the screen is arithmetic over
   * these, and `GPS_100X_PLAN.md` §10 forbids presenting a placeholder as a price.
   */
  unresolvedInputs: readonly string[];
}

/**
 * Run the whole underwriting in one call, so the API route is a data-loading
 * function and not a place where a fifth opinion about the numbers can appear.
 *
 * `offer` defaults to the current catalogue entry; pass the engagement's frozen
 * `scopeSnapshot` (`types.ts:328`) instead when underwriting something already
 * sold — the devil's advocate should argue about what the client agreed to.
 */
export function buildUnderwriteResponse(
  quote: UnderwriteQuote,
  model: CostModel,
  opts: UnderwriteOptions,
  offer: ServiceOfferLike = getOffer(quote.offerKey),
  uplifts: readonly number[] = DEFAULT_EFFORT_UPLIFTS,
  policy: IssuePolicy = DEFAULT_ISSUE_POLICY,
): UnderwriteResponse {
  const underwriting = underwrite(quote, model, opts);
  const sensitivity = overrunSensitivity(quote, model, opts, uplifts);
  const issue = shouldBlockIssue(underwriting, policy);
  const advocate = devilsAdvocate(offer, underwriting, opts.outcomes ?? []);

  const unresolved: string[] = [];
  if (model.effort.isPlaceholder) {
    unresolved.push(`Effort triple for ${offer.name} is a placeholder (${underwriting.effortDays.min}/${underwriting.effortDays.mode}/${underwriting.effortDays.max} days). GPS_100X_PLAN.md §12: only the founder can supply it, and it is the input that turns this screen from a prior into a model.`);
  }
  if (PRICE_BANDS_ARE_PLACEHOLDERS) {
    unresolved.push('Price bands are placeholders (decision D4). The price this quote is underwritten against is a number the founder has not agreed.');
  }
  if (policy.minP50MarginPct == null) {
    unresolved.push('No minimum margin floor has been set, so only P(loss) can block an issue. A floor is a founder decision and is deliberately not invented here.');
  }
  if (underwriting.basis === 'prior') {
    unresolved.push('No recorded outcomes exist for this offer, so the distribution is a prior. It is not a measurement and must not be presented as one.');
  }

  return {
    asOf: opts.asOf,
    underwriting,
    sensitivity,
    issue,
    devilsAdvocate: advocate,
    effortTriplesArePlaceholders: EFFORT_TRIPLES_ARE_PLACEHOLDERS,
    policyNotice: ISSUE_POLICY_IS_A_STATED_PRIOR,
    percentileMethod: PERCENTILE_METHOD,
    unresolvedInputs: unresolved,
  };
}
