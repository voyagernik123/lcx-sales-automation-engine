/**
 * GLOBAL SERVICES (GPS) — TARGETING. Hard gates first, then an additive score,
 * with confidence reported BESIDE the score and never inside it.
 *
 * ── WHAT THIS REPLACES, AND WHY ───────────────────────────────────────────────
 * The mandate (§6) specified:
 *
 *   Priority = Need × AbilityToPay × Urgency × Access × RegulatoryFeasibility ×
 *              PartnerFit × ExpectedMargin × EvidenceConfidence
 *              − ReputationRisk − DeliveryComplexity
 *
 * That formula is not imperfect, it is unusable, for four independent reasons
 * (`GPS_IMPLEMENTATION_PLAN.md` §1.3):
 *
 *  1. COLLAPSE. Eight factors in [0,1] multiplied collapse toward zero — eight
 *     independent 0.7s ≈ 0.058. Every real target lands in a band narrower than
 *     the noise in the inputs, so the ranking is noise with a decimal point.
 *  2. THE PENALTIES OWN THE RANKING. Two ADDITIVE penalties subtracted from a
 *     product that small dominate it completely. The formula effectively sorts
 *     by `−ReputationRisk − DeliveryComplexity`: it selects for EASY AND SAFE
 *     rather than for VALUABLE. That is the opposite of a targeting tool.
 *  3. CONFIDENCE INSIDE THE PRODUCT IS GAMEABLE. `EvidenceConfidence` as a
 *     multiplicand conflates "we are unsure" with "it is bad". The cheapest way
 *     to raise any score becomes weakening the two terms that exist to protect
 *     the business — so the formula rewards deleting its own safeguards.
 *  4. A SINGLE ZERO IS A SILENT DELETE. One factor at 0 zeroes the product with
 *     no reason, no audit trail, and no way to tell "sanctioned" from "we never
 *     asked about the budget".
 *
 * The replacement (plan §7) is three separated mechanisms:
 *
 *   GATES   → binary, auditable, each carrying an explicit REASON. A gated
 *             target is EXCLUDED WITH A REASON (`score === null`), never ranked
 *             low. Exclusion is a sentence a human can read and argue with.
 *   SCORE   → additive, weighted, bounded 0–100, with a `Driver[]` trail whose
 *             points are literally percentage points of an ideal target, so any
 *             ranking is explainable in one sentence.
 *   CONFIDENCE → computed separately from Admiralty grade, evidence age and
 *             field completeness; reported BESIDE the score. Sort by score,
 *             BAND by confidence.
 *
 * ── WHAT IS DELIBERATELY NOT IMPORTED ────────────────────────────────────────
 * None of `alpha.ts`'s composite scores are reused, and that is a correctness
 * requirement rather than a preference. `listingPropensity` (`alpha.ts:80`)
 * subtracts 40 points for `listedOnLcx: true`, and `dealValue` (`alpha.ts:157`)
 * anchors on "a listing's value scales with the token's size and liquidity".
 * For a services business that is INVERTED: an already-listed project is an
 * EXCELLENT client — it still needs documentation, GTM, distribution and
 * marketing. Reusing those composites would systematically down-rank the best
 * prospects (plan §1.2). `winnability` and `conviction` inherit the same defect
 * through `listedOnLcx`.
 *
 * What IS reused, and only this: the raw `SignalBundle` FIELDS (as a capital
 * proxy of last resort), the Admiralty grading in `provenance.ts`, and the
 * `Driver { label, points }` / separate-confidence PATTERN. The `Driver` and
 * `SignalBundle` imports below are type-only for exactly that reason.
 *
 * No I/O, no DB, no LLM, no network, no mutation of its inputs. Deterministic
 * given an explicit `asOf`; the ONLY ambient dependency in the file is
 * `Date.now()` when a caller omits `asOf`, which is stated on `AssessOptions`
 * rather than hidden. Money is integer cents throughout.
 */
import type { Driver, SignalBundle } from '../alpha.js';
import type { Credibility, Reliability } from '../provenance.js';
import { admiraltyCode, confidenceFrom } from '../provenance.js';
import type { ConflictDecision, OfferKey } from './types.js';
import { OFFER_KEYS, marginPct } from './types.js';

/* ── Local numeric helpers ─────────────────────────────────────────────────────
 * Deliberately re-declared rather than exported from `alpha.ts`: they are that
 * file's private implementation detail, and widening its public surface to share
 * three one-liners would create an import edge from GPS to the listing scorer
 * that a later reader would reasonably read as permission to reuse the
 * composites too. Three lines is cheaper than that misunderstanding.
 */
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Linear normalisation into 0..1 across [min,max]; outside the range saturates. */
const lin = (v: number, min: number, max: number): number =>
  max === min ? (v >= max ? 1 : 0) : clamp01((v - min) / (max - min));

/** Log-scale normalisation into 0..1 — for money-like magnitudes spanning decades. */
const logNorm = (v: number, min: number, max: number): number => {
  if (!(v > 0)) return 0;
  const lo = Math.log10(Math.max(min, 1));
  const hi = Math.log10(Math.max(max, 10));
  if (hi <= lo) return 0;
  return clamp01((Math.log10(Math.min(Math.max(v, min), max)) - lo) / (hi - lo));
};

/** A finite number or null. `NaN`/`Infinity`/`undefined` are all "we don't know". */
const num = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : null;

/* ── Weights ───────────────────────────────────────────────────────────────── */

/** The six terms of plan §7. Keys are stable; surfaces label from FACTOR_LABELS. */
export type TargetFactorKey =
  | 'need'
  | 'abilityToPay'
  | 'urgency'
  | 'access'
  | 'expectedMargin'
  | 'deliveryComplexity';

/** Evaluation and display order. Positive terms first, the penalty last. */
export const TARGET_FACTOR_KEYS: readonly TargetFactorKey[] = [
  'need',
  'abilityToPay',
  'expectedMargin',
  'access',
  'urgency',
  'deliveryComplexity',
] as const;

export const FACTOR_LABELS: Record<TargetFactorKey, string> = {
  need: 'Identified need',
  abilityToPay: 'Ability to pay',
  urgency: 'Urgency',
  access: 'Access to the decision maker',
  expectedMargin: 'Expected margin',
  deliveryComplexity: 'Delivery complexity',
};

/**
 * Maximum points each factor can contribute. The five positive weights sum to
 * EXACTLY 100, which is what makes a driver trail readable: a point in the trail
 * is a percentage point of a perfect target, so "62, held back by no margin
 * evidence (0 of 20)" is a complete explanation. `deliveryComplexity` is
 * SUBTRACTED, so the raw range is −15..100 and the reported score is clamped to
 * 0..100 (`rawScore` keeps the unclamped value for audit).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THESE WEIGHTS ARE A STATED PRIOR. THEY ARE NOT LEARNED AND CANNOT BE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Realistic volume is ~29 engagements a year. Fitting six weights to ~29
 *  outcomes — with the outcomes correlated (same seller, same four offers, same
 *  network) and the label noisy (a deal lost to timing looks like a deal lost to
 *  fit) — would produce a model whose error bars exceed the spread between any
 *  two targets. Anyone who ships a "calibration loop" against 29 rows a year has
 *  built a random number generator with a changelog.
 *
 *  So: the numbers below are a JUDGEMENT, written down where it can be argued
 *  with, and reviewed QUARTERLY against won/lost by a human. The reasoning, so
 *  the review has something to disagree with:
 *
 *   need 30           — the largest term because the business sells four narrow,
 *                       scoped offers. A target with no identified need is not a
 *                       slow deal, it is not a deal; nothing else recovers it.
 *   abilityToPay 25   — engagements are $10–25k and a partner must be paid on
 *                       delivery. A target that cannot fund the vendor cost is a
 *                       loss dressed as a pipeline entry.
 *   expectedMargin 20 — margin = price − vendor cost, and one scope overrun eats
 *                       a whole deal. Margin is scored, not assumed.
 *   access 15         — partner quality and reputation ARE the product, and the
 *                       distribution channel is a referral network. A warm path
 *                       is worth more here than in a business with a funnel.
 *   urgency 10        — the smallest positive term ON PURPOSE. Urgency is the
 *                       factor a hopeful seller most easily talks himself into,
 *                       and a stated deadline is the cheapest thing for a target
 *                       to say. It moves the ranking least.
 *   deliveryComplexity 15 (penalty) — capped deliberately BELOW the sum of the
 *                       value terms. The mandate's formula failed because its
 *                       penalties owned the ranking; a penalty that can veto a
 *                       high-value target reintroduces exactly that. Complexity
 *                       that should actually stop us is a GATE, not a penalty.
 */
export type TargetingWeights = Record<TargetFactorKey, number>;

export const WEIGHTS_V1: TargetingWeights = {
  need: 30,
  abilityToPay: 25,
  expectedMargin: 20,
  access: 15,
  urgency: 10,
  deliveryComplexity: 15,
};

/**
 * The provenance of `WEIGHTS_V1`, as data rather than as a comment nobody reads,
 * so a surface can print "stated prior, reviewed quarterly" next to a ranking
 * instead of implying a calibration that does not exist.
 */
export const WEIGHTS_V1_BASIS = {
  version: 'v1' as const,
  statedOn: '2026-07-31',
  reviewCadence: 'quarterly' as const,
  /** False, and it will stay false at this volume. See the docblock above. */
  learnedFromOutcomes: false,
  annualOutcomeVolume: 29,
  basis:
    'Judgement of the founder-stated economics: four scoped offers, $10–25k engagements, partner-delivered, sold through a referral network. Reviewed quarterly against won/lost; never fitted.',
} as const;

/* ── The input ─────────────────────────────────────────────────────────────── */

/**
 * The result of a sanctions / AML screen. Three states, not a boolean, because
 * "not screened" and "clear" must never be the same value in a system operated
 * by an employee of an EU/Liechtenstein regulated exchange. A boolean `false`
 * reads as clear at every call site that forgets to check.
 */
export type ScreeningResult = 'clear' | 'concern' | 'not_screened';

/**
 * Whether the target's jurisdiction is inside the perimeter we will currently
 * work in. STATED BY A HUMAN, never inferred: every jurisdiction rule in this
 * programme is unverified recalled training data (plan §0), and `GpsClient.
 * jurisdiction` is deliberately free text (`types.ts:310`) for the same reason.
 * A function here that parsed "Cayman" into a perimeter decision would be
 * inventing legal advice.
 */
export type PerimeterStatus = 'in_perimeter' | 'outside_perimeter' | 'unknown';

/**
 * Conflict state at the moment of targeting.
 *
 * `'unresolved'` is a first-class value rather than `null` ON PURPOSE. Plan §7
 * lists "unresolved conflict" as a HARD GATE, and a gate that fires on a missing
 * field would violate the rule that missing data degrades confidence rather than
 * excluding a target. So the caller must SAY which it is: the conflict check is
 * not third-party data we might happen to lack, it is an internal artifact
 * (`GpsConflictCheck`, `types.ts:348`) whose absence is itself the finding. The
 * resulting gate is recoverable — "perform the check", not "walk away".
 */
export type TargetConflictStatus = ConflictDecision | 'unresolved';

/** Who can actually sign. Named, because "the team" cannot sign a contract. */
export interface DecisionMaker {
  name: string;
  role: string;
  /**
   * Whether this person controls the budget. A named champion who must go and
   * ask someone else is a real but weaker path, so this discounts Access rather
   * than clearing or firing a gate.
   */
  isBudgetHolder?: boolean | null;
}

/** What kind of deadline drives Urgency. Not all deadlines are equally real. */
export type DeadlineKind = 'regulatory' | 'commercial' | 'self_imposed';

/**
 * The things that make an engagement hard to DELIVER, as named flags rather than
 * an opaque 0..1. Each flag is a sentence someone can contest, and the weights
 * are visible in `COMPLEXITY_FLAG_WEIGHTS` below.
 */
export interface DeliveryComplexityFlags {
  /**
   * No named partner or specialist for the offer. This is the true capacity
   * constraint of the business — partners deliver, the founder sells and
   * coordinates — and today `partnerOwner` is null on all five catalogue offers
   * (`catalogue.ts`, decision D5). Weighted heaviest of the flags.
   */
  noNamedPartner?: boolean | null;
  /** Scope is not yet written down as inclusions/exclusions/acceptance criteria. */
  scopeUndefined?: boolean | null;
  /** More than one jurisdiction in play — multiplies review, not just wordcount. */
  multiJurisdiction?: boolean | null;
  /** Translation or localisation required. */
  translationRequired?: boolean | null;
  /** Delivery blocks on inputs only the client can supply (`requiredClientInputs`). */
  clientSideDependencies?: boolean | null;
}

/** Weights inside the complexity penalty. Sum > 1 on purpose; the total is capped. */
export const COMPLEXITY_FLAG_WEIGHTS: Record<keyof DeliveryComplexityFlags, number> = {
  noNamedPartner: 0.35,
  scopeUndefined: 0.25,
  clientSideDependencies: 0.15,
  multiJurisdiction: 0.15,
  translationRequired: 0.1,
};

/**
 * How good the evidence behind this target is. Feeds CONFIDENCE ONLY — it is
 * never a term in the score, which is the whole point of the replacement.
 */
export interface TargetEvidence {
  /** Admiralty source reliability A–F (`provenance.ts:12`). */
  reliability: Reliability;
  /** Admiralty information credibility 1–6 (`provenance.ts:13`). */
  credibility: Credibility;
  /**
   * Age in days of the NEWEST supporting evidence. Passed in rather than derived
   * from a timestamp so this module needs no clock for it (the only clock
   * dependency is the deadline, and that takes an explicit `asOf`).
   */
  ageDays?: number | null;
}

/**
 * One prospective client, as targeting sees it.
 *
 * Every scoring input is optional and nullable, and that is load-bearing: a real
 * target is assembled from partial information, and the module's contract is
 * that a null contributes ZERO POINTS and LOWERS CONFIDENCE. There is no
 * midpoint default anywhere in this file — a missing factor is never silently
 * treated as 0.5, and never as good.
 *
 * The gate inputs are NOT optional, because each of them is a decision someone
 * has to make rather than a fact we might not have collected.
 */
export interface GpsTarget {
  id: string;
  name: string;

  // ── Gate inputs (required: each is a stated decision, not a collected fact) ──
  screening: ScreeningResult;
  perimeter: PerimeterStatus;
  conflict: TargetConflictStatus;
  /**
   * A named human who can sign. `null` fires the no-decision-maker gate: with
   * engagements at $10–25k and a partner to pay, "we are talking to the
   * community manager" is not a pipeline entry.
   */
  decisionMaker: DecisionMaker | null;
  /**
   * True when the target has asked for a guaranteed listing, guaranteed
   * regulatory approval, or any promised market/price/volume outcome. An
   * absolute gate: the founder is an employee of the exchange, every catalogue
   * offer explicitly disclaims these (`catalogue.ts` exclusions), and one
   * implied promise is a career-and-licence event, not a lost deal.
   */
  demandsGuaranteedOutcome: boolean;
  /**
   * True when facts the target has given us are known to be materially
   * misleading. A RECORDED FINDING, not an inference: nothing in this file
   * detects deception. (`SignalBundle.washTradingFlag` is treated as a
   * confidence and ability-to-pay signal, NOT as this gate — a wash-trading
   * heuristic is not a finding that someone lied to us.)
   */
  materiallyMisleading: boolean;

  // ── Scoring inputs (all optional; null ⇒ zero points + lower confidence) ──
  /**
   * Which catalogue offers this target has an identified need for.
   *
   * `undefined`/`null` = we have not established need (unknown → 0 points, lower
   * confidence). `[]` = we looked and there is none (an explicit finding → 0
   * points, and confidence is NOT penalised, because the field is answered).
   * That distinction is the difference between "call them" and "don't".
   *
   * Note there is no listing offer to name here, and that is correct: LCX
   * listing is currently UNAVAILABLE, so a need for one cannot be represented.
   */
  identifiedNeeds?: readonly OfferKey[] | null;
  /** The offer being scoped, when one has been chosen. Sets the budget reference. */
  offerKey?: OfferKey | null;
  /** Budget the target has actually stated, integer cents. Strongest evidence. */
  statedBudgetCents?: number | null;
  /**
   * A capital proxy in integer cents when no budget is stated — a closed raise,
   * treasury, or annual revenue. Weaker than a stated budget and capped lower.
   */
  capitalProxyCents?: number | null;
  /**
   * Raw market signals, reused from the listing pipeline as a capital proxy OF
   * LAST RESORT. Fields only — none of `alpha.ts`'s composites are consulted.
   */
  market?: SignalBundle | null;
  /** How we reach the decision maker. */
  introPath?: 'direct_relationship' | 'warm_referral' | 'cold' | null;
  /** ISO date of the deadline driving the work, if there is a real one. */
  deadlineIso?: string | null;
  deadlineKind?: DeadlineKind | null;
  /** The price under discussion, integer cents. */
  quotedPriceCents?: number | null;
  /** What we expect to pay the partner for this scope, integer cents. */
  expectedVendorCostCents?: number | null;
  /**
   * Delivery complexity flags. `undefined` means nobody has assessed complexity
   * — see the honest-asymmetry note on `deriveDeliveryComplexity`.
   */
  complexity?: DeliveryComplexityFlags | null;
  /** Evidence quality for the confidence calculation. */
  evidence?: TargetEvidence | null;
  /** Free-text jurisdiction as a human typed it, for display beside the gate. */
  jurisdiction?: string | null;
}

/* ── Hard gates ────────────────────────────────────────────────────────────── */

/** The seven hard gates of plan §7. A closed union so surfaces can be exhaustive. */
export type GateKey =
  | 'sanctions_concern'
  | 'no_decision_maker'
  | 'no_budget_or_capital_proxy'
  | 'jurisdiction_outside_perimeter'
  | 'unresolved_conflict'
  | 'demands_guaranteed_outcome'
  | 'materially_misleading';

/** Evaluation order: the two that end a conversation first, then the curable ones. */
export const GATE_KEYS: readonly GateKey[] = [
  'sanctions_concern',
  'materially_misleading',
  'demands_guaranteed_outcome',
  'jurisdiction_outside_perimeter',
  'unresolved_conflict',
  'no_decision_maker',
  'no_budget_or_capital_proxy',
] as const;

/**
 * One fired gate. `reason` is the whole point: the mandate's formula excluded by
 * multiplying by zero, which is indistinguishable from a low score and leaves no
 * audit trail. Here an excluded target carries a sentence.
 */
export interface GateHit {
  key: GateKey;
  /** One sentence, written for a human reading an exclusion list. */
  reason: string;
  /**
   * Whether the gate can be CURED — by us doing work, or by the target changing
   * their ask. Not part of the plan's spec and added deliberately: "perform the
   * conflict check" and "this entity appears on a sanctions list" are both
   * exclusions, but only one of them is a task. Without this, a worklist cannot
   * tell them apart and both end up ignored.
   */
  recoverable: boolean;
  /** What would clear it. Null when the answer is "walk away". */
  remedy: string | null;
}

/**
 * Evaluate every hard gate and return ALL that fire, in `GATE_KEYS` order.
 *
 * ALL, not the first: a target blocked on sanctions AND on a guaranteed-listing
 * demand must not look like a one-fix job. Fixing the cheap gate would otherwise
 * make it re-enter the ranking with the serious problem invisible.
 *
 * Pure and total. Returns `[]` for an eligible target.
 */
export function evaluateGates(t: GpsTarget): GateHit[] {
  const hits: GateHit[] = [];

  if (t.screening === 'concern') {
    hits.push({
      key: 'sanctions_concern',
      reason:
        'A sanctions/AML screen returned a concern. No work may be scoped, quoted or discussed until compliance clears it.',
      recoverable: false,
      remedy: null,
    });
  }

  if (t.materiallyMisleading) {
    hits.push({
      key: 'materially_misleading',
      reason:
        'Facts supplied by this target are recorded as materially misleading. Any deliverable would rest on them, and the deliverable carries our name.',
      recoverable: false,
      remedy: null,
    });
  }

  if (t.demandsGuaranteedOutcome) {
    hits.push({
      key: 'demands_guaranteed_outcome',
      reason:
        'The target requires a guaranteed listing, regulatory approval or market outcome. Every offer in the catalogue explicitly disclaims all three, and the seller is an employee of a regulated exchange.',
      recoverable: true,
      remedy:
        'Only proceed if the target accepts the exclusions in writing; the demand itself must be withdrawn, not softened.',
    });
  }

  if (t.perimeter === 'outside_perimeter') {
    hits.push({
      key: 'jurisdiction_outside_perimeter',
      reason: t.jurisdiction
        ? `Jurisdiction "${t.jurisdiction}" is recorded as outside the current working perimeter.`
        : 'The target is recorded as outside the current working perimeter.',
      recoverable: true,
      remedy:
        'A human decision to extend the perimeter — with counsel — or a different contracting entity. Never inferred from the jurisdiction string.',
    });
  }

  if (t.conflict === 'declined') {
    hits.push({
      key: 'unresolved_conflict',
      reason:
        'The conflict check was DECLINED. This is a final answer, not a pending task.',
      recoverable: false,
      remedy: null,
    });
  } else if (t.conflict === 'unresolved') {
    hits.push({
      key: 'unresolved_conflict',
      reason:
        'No conflict check has been recorded. The seller is an LCX employee, so nothing may be issued to this target until one exists.',
      recoverable: true,
      remedy:
        'Record a GpsConflictCheck with a decision and, where relevant, the exact disclosure text used.',
    });
  }

  if (t.decisionMaker == null) {
    hits.push({
      key: 'no_decision_maker',
      reason:
        'No named person who can sign. At $10–25k with a partner to pay on delivery, an unnamed sponsor is not a pipeline entry.',
      recoverable: true,
      remedy: 'Identify and name the budget holder, or the person who can reach them.',
    });
  }

  if (!hasFundingEvidence(t)) {
    hits.push({
      key: 'no_budget_or_capital_proxy',
      reason:
        'No stated budget and no capital proxy of any kind. Nothing here shows the target can fund the partner cost, let alone the fee.',
      recoverable: true,
      remedy:
        'A stated budget, or a capital proxy: a closed raise, treasury size, or revenue.',
    });
  }

  return hits;
}

/**
 * Is there ANY funding evidence — a stated budget, an explicit capital proxy, or
 * a market-derived proxy?
 *
 * Kept separate from the ability-to-pay SCORE because the two questions differ:
 * this one is "is there evidence at all" (a gate), the score is "how strong is
 * it". A target with a $500 budget passes the gate and scores badly, which is
 * the honest outcome; conflating them would exclude cheap targets silently.
 *
 * `volume24hUsd` is deliberately NOT accepted as evidence — it is the field wash
 * trading fabricates, and it is not capital in any case. Market cap and TVL only.
 */
function hasFundingEvidence(t: GpsTarget): boolean {
  if ((num(t.statedBudgetCents) ?? 0) > 0) return true;
  if ((num(t.capitalProxyCents) ?? 0) > 0) return true;
  const m = t.market;
  if (m) {
    if ((num(m.marketCapUsd) ?? 0) > 0) return true;
    if ((num(m.tvlUsd) ?? 0) > 0) return true;
  }
  return false;
}

/* ── Factor derivation ─────────────────────────────────────────────────────── */

/**
 * One derived factor. `value` is `null` for UNKNOWN and that is a distinct state
 * from `0` throughout this file: null contributes zero points AND lowers
 * confidence, while an explicit 0 contributes zero points and does NOT lower
 * confidence, because the question was answered. There is no 0.5 fallback
 * anywhere — inventing a midpoint is how a scoring system starts lying.
 */
export interface FactorOutcome {
  /** 0..1, or null for "we do not know". */
  value: number | null;
  /** Short parenthetical for the driver label, e.g. "budget $18,000 vs $20,000 ref". */
  detail: string | null;
  /** A non-gating note worth putting in front of a human. */
  advisory: string | null;
}

/**
 * Dollar anchors for normalising a budget into 0..1.
 *
 * These come from the two ranges the founder actually stated — engagements are
 * $10–25k, and the diagnostic must be ~$1.5–3k to sell as a front door — NOT
 * from `catalogue.ts`, whose bands are explicitly placeholders
 * (`PRICE_BANDS_ARE_PLACEHOLDERS === true`). Importing those would launder
 * placeholder money into a ranking. These two numbers are normalisation anchors
 * only; nothing here is ever quoted to anyone.
 */
const BUDGET_REFERENCE_CENTS = 2_000_000; // $20,000 — midpoint of the stated $10–25k
const DIAGNOSTIC_REFERENCE_CENTS = 225_000; // $2,250 — midpoint of the stated $1.5–3k

const budgetReferenceCents = (offerKey: OfferKey | null | undefined): number =>
  offerKey === 'diagnostic' ? DIAGNOSTIC_REFERENCE_CENTS : BUDGET_REFERENCE_CENTS;

const usd = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * NEED — how many of the five catalogue offers this target has an identified need
 * for. One clear need is already most of the value (0.6); breadth adds, because a
 * target with two or three needs is a relationship rather than a transaction, and
 * repeat business is the point of a services business (`types.ts:180`).
 *
 * The `[]` vs `undefined` distinction is enforced here and matters: "we looked
 * and found none" scores 0 with full confidence, "we never asked" scores 0 with
 * reduced confidence. The first is a decision, the second is a task.
 */
export function deriveNeed(t: GpsTarget): FactorOutcome {
  const needs = t.identifiedNeeds;
  if (needs == null) {
    return { value: null, detail: null, advisory: 'Need has not been established with this target.' };
  }
  const valid = needs.filter((k) => OFFER_KEYS.includes(k));
  const dropped = needs.length - valid.length;
  const k = new Set(valid).size;
  const value = k === 0 ? 0 : Math.min(1, 0.6 + 0.2 * (k - 1));

  let advisory: string | null = null;
  if (dropped > 0) {
    advisory = `${dropped} identified need(s) are not offers in the catalogue and were ignored. The catalogue is five offers on purpose (plan §8).`;
  } else if (k === 0) {
    advisory = 'No need for any catalogue offer was found. This is a finding, not missing data.';
  } else if (t.offerKey != null && !valid.includes(t.offerKey)) {
    advisory = `Scoped offer "${t.offerKey}" is not among the identified needs — the scope and the diagnosis disagree.`;
  }
  return { value, detail: k === 0 ? 'none found' : `${k} of ${OFFER_KEYS.length} offers`, advisory };
}

/**
 * ABILITY TO PAY — a strict evidence ladder, each rung capped BELOW the one above
 * it, so weaker evidence can never reach the same conclusion as a stated number:
 *
 *   stated budget          → up to 1.00
 *   explicit capital proxy → up to 0.80   (a closed raise / treasury / revenue)
 *   market cap or TVL      → up to 0.60   (reused SignalBundle fields)
 *   …and ×0.5 again if `washTradingFlag` is set → 0.30
 *
 * `volume24hUsd` is never used: it is the field wash trading fabricates, and
 * trading volume is not the target's capital in the first place.
 *
 * A budget below a quarter of the reference scores 0 rather than null. That is
 * deliberate — "they have $3k for a $20k engagement" is information, and it
 * belongs in the score, not in the confidence.
 */
export function deriveAbilityToPay(t: GpsTarget): FactorOutcome {
  const ref = budgetReferenceCents(t.offerKey);

  const stated = num(t.statedBudgetCents);
  if (stated != null && stated > 0) {
    const value = lin(stated / ref, 0.25, 1);
    return {
      value,
      detail: `stated ${usd(stated)} vs ${usd(ref)} reference`,
      advisory:
        stated < ref * 0.5
          ? `Stated budget ${usd(stated)} is under half the ${usd(ref)} reference; the scope will have to shrink or the answer is no.`
          : null,
    };
  }

  const proxy = num(t.capitalProxyCents);
  if (proxy != null && proxy > 0) {
    // $100k…$100M, log scale — capital raised spans decades, not a linear range.
    const value = logNorm(proxy, 10_000_000, 10_000_000_000) * 0.8;
    return {
      value,
      detail: `capital proxy ${usd(proxy)} (capped at 0.80 — not a stated budget)`,
      advisory: 'Ability to pay rests on a capital proxy. Ask for a budget before quoting.',
    };
  }

  const m = t.market;
  const marketUsd = Math.max(num(m?.marketCapUsd) ?? 0, num(m?.tvlUsd) ?? 0);
  if (marketUsd > 0) {
    const washed = m?.washTradingFlag === true;
    const value = logNorm(marketUsd, 1_000_000, 1_000_000_000) * 0.6 * (washed ? 0.5 : 1);
    return {
      value,
      detail: `market/TVL proxy $${Math.round(marketUsd).toLocaleString('en-US')} (capped at ${washed ? '0.30' : '0.60'})`,
      advisory: washed
        ? 'Wash trading is suspected, so market size is weak evidence of capital. Fake liquidity is worse than no data.'
        : 'Ability to pay is inferred from market size only — the weakest rung of the ladder.',
    };
  }

  // Unreachable via assessTarget (the funding gate fires first) but kept total:
  // this function is exported and must behave for a direct caller.
  return { value: null, detail: null, advisory: 'No funding evidence of any kind.' };
}

/**
 * URGENCY — days until the deadline, discounted by how real the deadline is.
 *
 * The smallest positive weight in the model (10 of 100) because urgency is the
 * factor a hopeful seller most easily talks himself into, and a deadline is the
 * cheapest thing a target can claim. Shape: ≤30 days is maximal, decaying to
 * 0.25 at six months and 0.05 beyond a year.
 *
 * A deadline in the PAST scores maximal with an advisory. Past-due means either
 * genuinely urgent or already lost, and this module cannot tell which — but it
 * must not quietly score it as "not urgent", which is the one reading that is
 * certainly wrong.
 *
 * `deadlineKind` discounts deadlines we know to be soft (commercial ×0.85,
 * self-imposed ×0.6). An ABSENT kind applies no discount, because not knowing a
 * deadline's nature is not evidence that it is soft; the advisory says so.
 */
export function deriveUrgency(t: GpsTarget, asOfMs: number): FactorOutcome {
  if (t.deadlineIso == null || t.deadlineIso === '') {
    return { value: null, detail: null, advisory: 'No deadline recorded — nothing is forcing a decision.' };
  }
  const ms = Date.parse(t.deadlineIso);
  if (!Number.isFinite(ms)) {
    return { value: null, detail: null, advisory: `Deadline "${t.deadlineIso}" could not be parsed and was ignored.` };
  }
  const days = (ms - asOfMs) / 86_400_000;

  let base: number;
  let advisory: string | null = null;
  if (days < 0) {
    base = 1;
    advisory = `The deadline passed ${Math.round(-days)} day(s) ago. Either this is the most urgent target on the list or it is already lost — a human must decide which.`;
  } else if (days <= 30) {
    base = 1;
  } else if (days <= 180) {
    base = 1 - 0.75 * ((days - 30) / 150); // 30d → 1.00, 180d → 0.25
  } else if (days <= 365) {
    base = 0.25 - 0.2 * ((days - 180) / 185); // 180d → 0.25, 365d → 0.05
  } else {
    base = 0.05;
  }

  const kind = t.deadlineKind ?? null;
  const mult = kind === 'self_imposed' ? 0.6 : kind === 'commercial' ? 0.85 : 1;
  if (kind == null && advisory == null) {
    advisory = 'Deadline kind not recorded, so no softness discount was applied. A regulatory deadline and a self-imposed one are not the same fact.';
  }

  return {
    value: clamp01(base * mult),
    detail: `${Math.round(days)}d${kind ? `, ${kind}` : ''}`,
    advisory,
  };
}

/**
 * ACCESS — how we reach the person who can sign.
 *
 * Weighted 15 rather than the 5-or-so a funnel business would give it, because
 * distribution here IS a referral network and partner reputation IS the product.
 * A cold path scores 0.15 rather than 0: cold outreach occasionally works, and a
 * 0 would be indistinguishable from unknown in the trail.
 *
 * The budget-holder discount applies only when `isBudgetHolder` is EXPLICITLY
 * false. Null means unrecorded, and unrecorded is not the same as "cannot sign".
 */
export function deriveAccess(t: GpsTarget): FactorOutcome {
  const path = t.introPath ?? null;
  if (path == null) {
    return { value: null, detail: null, advisory: 'No route to the decision maker recorded.' };
  }
  const base = path === 'direct_relationship' ? 1 : path === 'warm_referral' ? 0.7 : 0.15;
  const holder = t.decisionMaker?.isBudgetHolder ?? null;
  const value = clamp01(base * (holder === false ? 0.8 : 1));
  return {
    value,
    detail: path.replace(/_/g, ' ') + (holder === false ? ', not the budget holder' : ''),
    advisory:
      path === 'cold'
        ? 'Cold path. This business runs on referrals; a cold target costs more attention than the score suggests.'
        : holder == null && t.decisionMaker != null
          ? 'Whether the named contact controls the budget is unrecorded.'
          : null,
  };
}

/**
 * EXPECTED MARGIN — gross margin on the scope under discussion, from
 * `marginPct` (`types.ts:282`), mapped 0%…70% → 0…1.
 *
 * NO FALLBACK TO THE CATALOGUE, ON PURPOSE. It would be trivial to substitute
 * `bandMidpointCents(offer)` and `offer.expectedVendorCostCents` when a quote is
 * absent, and it would be wrong: both are explicit placeholders pending decisions
 * D4 and D5 (`catalogue.ts`, `PRICE_BANDS_ARE_PLACEHOLDERS === true`). Feeding
 * them in would turn 20 of the 100 points into invented money that ranks real
 * targets. So margin is NULL until a real price and a real vendor cost exist.
 *
 * The honest consequence: today most targets will score with 20 points
 * unavailable and correspondingly lower confidence. That is the true state of the
 * business, and the fix is a rate card, not a default.
 */
export function deriveExpectedMargin(t: GpsTarget): FactorOutcome {
  const price = num(t.quotedPriceCents);
  const cost = num(t.expectedVendorCostCents);
  if (price == null || cost == null) {
    return {
      value: null,
      detail: null,
      advisory:
        'No margin evidence: a quoted price and an expected vendor cost are both required. Catalogue bands and vendor costs are placeholders (D4/D5) and are deliberately not substituted.',
    };
  }
  const pct = marginPct(price, cost);
  if (pct == null) {
    return { value: null, detail: null, advisory: 'Quoted price is zero or negative, so margin is undefined.' };
  }
  return {
    value: lin(pct, 0, 70),
    detail: `${pct}% of ${usd(price)}`,
    advisory:
      pct <= 0
        ? `The quote is at or below the ${usd(cost)} vendor cost — this engagement loses money as scoped.`
        : pct < 30
          ? `${pct}% margin leaves no room for a scope overrun, and one overrun eats the deal.`
          : null,
  };
}

/**
 * DELIVERY COMPLEXITY — the one SUBTRACTED term, from named flags so it can be
 * argued with rather than asserted.
 *
 * A KNOWN AND ACCEPTED ASYMMETRY: an absent `complexity` object yields null,
 * which by this module's own rule contributes zero points — and for a penalty,
 * zero points means NO PENALTY. Unassessed complexity therefore looks easy. Two
 * reasons that is still the right call: (a) the alternative, assuming complexity
 * when nobody has looked, reproduces exactly the mandate's failure of letting
 * penalties own the ranking; (b) complexity severe enough to stop us belongs in a
 * GATE, not here. The cost is paid in confidence and in an advisory, both of
 * which fire on this path.
 *
 * Capped at 1.0 (so at most 15 points) even when every flag is set.
 */
export function deriveDeliveryComplexity(t: GpsTarget): FactorOutcome {
  const flags = t.complexity;
  if (flags == null) {
    return {
      value: null,
      detail: null,
      advisory:
        'Delivery complexity has not been assessed, so NO penalty was applied. An unassessed target looks easier than it is.',
    };
  }
  const on = (Object.keys(COMPLEXITY_FLAG_WEIGHTS) as (keyof DeliveryComplexityFlags)[]).filter(
    (k) => flags[k] === true,
  );
  const raw = on.reduce((acc, k) => acc + COMPLEXITY_FLAG_WEIGHTS[k], 0);
  return {
    value: clamp01(raw),
    detail: on.length === 0 ? 'none flagged' : on.join(', '),
    advisory: flags.noNamedPartner === true
      ? 'No named partner for this work. Partners deliver; without one the engagement cannot be staffed at all (D5).'
      : null,
  };
}

/* ── Confidence — computed separately, reported beside the score ────────────── */

export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * Confidence is deliberately a SEPARATE OBJECT rather than a number on the score,
 * because the defect being fixed here is confidence having been a multiplicand.
 * Keeping it structurally beside the score makes folding it back in a visible
 * change to a type rather than a quiet edit to an expression.
 */
export interface TargetConfidence {
  /** 0–100. Never multiplied into the score. Used to BAND and to tie-break. */
  confidence: number;
  band: ConfidenceBand;
  /** e.g. "B2", or null when no evidence grade was supplied at all. */
  admiralty: string | null;
  /** 0–100 from Admiralty grade decayed by evidence age (`provenance.ts:100`). */
  gradeConfidence: number;
  /** Fraction of the six scoring factors that have a value, 0..1. */
  completeness: number;
  /** Which factors are unknown — so a human knows what to go and get. */
  missingFactors: TargetFactorKey[];
  /** Signed adjustments, same `Driver` shape as the score trail. */
  penalties: Driver[];
}

/**
 * Display bands. A `low` band does not mean "bad target", it means DO NOT ACT ON
 * THIS RANKING YET — go and get evidence. Keeping that as a band rather than a
 * score adjustment is the entire point of the separation.
 */
export function confidenceBand(confidence: number): ConfidenceBand {
  return confidence >= 65 ? 'high' : confidence >= 40 ? 'medium' : 'low';
}

/**
 * Evidence half-life, days. `provenance.ts` defaults to 30, which suits market
 * data; a target's situation — funding, sponsor, deadline — turns over on roughly
 * a quarterly cadence, so half a quarter is the honest half-life here. Stated as
 * a constant so a reviewer can argue with the number instead of finding it inline.
 */
const EVIDENCE_HALF_LIFE_DAYS = 45;

/**
 * f(Admiralty grade, evidence age, field completeness) — plan §7, in that order.
 *
 * The blend is the geometric-ish `sqrt(coverage × quality)` shape that
 * `alpha.ts:67` already uses, so the two layers read the same way: it punishes a
 * high grade on almost no fields, and punishes many fields from a bad source,
 * without letting either alone carry the number.
 *
 * NO EVIDENCE AT ALL grades as F6 — "reliability unknown / cannot be judged" —
 * which yields 0. That is not a punishment, it is an accurate description.
 *
 * Missing FACTORS are charged once, through `completeness`. The explicit
 * penalties below cover things completeness cannot see: an unperformed sanctions
 * screen, unrecorded evidence age, an unrecorded jurisdiction perimeter, and
 * suspected wash trading.
 *
 * Confidence is computed for GATED targets too. "We excluded this on D5 evidence
 * that is 200 days old" is a materially different statement from "we excluded it
 * on a confirmed regulator filing", and a reviewer needs to be able to tell.
 */
export function computeConfidence(
  t: GpsTarget,
  factors: Record<TargetFactorKey, number | null>,
): TargetConfidence {
  const ev = t.evidence ?? null;
  const reliability: Reliability = ev?.reliability ?? 'F';
  const credibility: Credibility = ev?.credibility ?? 6;
  const ageDays = num(ev?.ageDays);
  const gradeConfidence = confidenceFrom(reliability, credibility, ageDays ?? 0, EVIDENCE_HALF_LIFE_DAYS);

  const missingFactors = TARGET_FACTOR_KEYS.filter((k) => factors[k] == null);
  const completeness = (TARGET_FACTOR_KEYS.length - missingFactors.length) / TARGET_FACTOR_KEYS.length;

  const blended = Math.sqrt((gradeConfidence / 100) * completeness) * 100;

  const penalties: Driver[] = [];
  if (t.screening === 'not_screened') {
    // The heaviest penalty here, and heavier than any other missing field: an
    // unperformed sanctions screen is the one gap that can end a career at a
    // regulated exchange. It is NOT a gate — gating on it would exclude on
    // missing data — so it lands on confidence, hard.
    penalties.push({ label: 'Sanctions/AML screen not performed', points: -20 });
  }
  if (ev != null && ageDays == null) {
    penalties.push({ label: 'Evidence age not recorded', points: -10 });
  }
  if (t.perimeter === 'unknown') {
    // Not a gate: gating on unknown would exclude on missing data, which is the
    // behaviour this module exists to remove. It is a confidence problem instead.
    penalties.push({ label: 'Jurisdiction perimeter unrecorded', points: -10 });
  }
  if (t.market?.washTradingFlag === true) {
    penalties.push({ label: 'Wash trading suspected in the market data', points: -15 });
  }

  const total = penalties.reduce((a, d) => a + d.points, 0);
  const confidence = Math.max(0, Math.min(100, Math.round(blended + total)));

  return {
    confidence,
    band: confidenceBand(confidence),
    admiralty: ev == null ? null : admiraltyCode(reliability, credibility),
    gradeConfidence,
    completeness: Math.round(completeness * 100) / 100,
    missingFactors,
    penalties,
  };
}

/* ── Assessment ────────────────────────────────────────────────────────────── */

export interface TargetAssessment {
  targetId: string;
  name: string;
  /** True when NO gate fired. The only targets that get a score. */
  eligible: boolean;
  /** Every gate that fired, with reasons. Empty for an eligible target. */
  gates: GateHit[];
  /**
   * 0–100, or NULL when gated. Null rather than 0 so a gated target cannot be
   * sorted into a ranking by accident — the type forces a caller to handle
   * exclusion explicitly, which a 0 would not.
   */
  score: number | null;
  /** The unclamped sum of the drivers (can be negative). Null when gated. */
  rawScore: number | null;
  /** Signed contributions; they sum exactly to `rawScore`. All six, always. */
  drivers: Driver[];
  /** The normalised 0..1 factor values, null for unknown. */
  factors: Record<TargetFactorKey, number | null>;
  /** Beside the score, never inside it. */
  confidence: TargetConfidence;
  /** Non-gating notes a human should read before acting. */
  advisories: string[];
  weightsVersion: 'v1';
  /** The whole assessment in one sentence, for a list row or a log line. */
  summary: string;
}

export interface AssessOptions {
  /**
   * The moment to measure deadlines against. Injectable so the module is pure and
   * testable; defaults to now, which makes the urgency term time-dependent — pass
   * it explicitly anywhere the output is compared or stored.
   */
  asOf?: string | Date | number;
  /** Override the stated prior. Validated: all six must be finite and ≥ 0. */
  weights?: TargetingWeights;
}

function resolveAsOfMs(asOf: AssessOptions['asOf']): number {
  if (asOf == null) return Date.now();
  if (typeof asOf === 'number') return asOf;
  if (asOf instanceof Date) return asOf.getTime();
  const ms = Date.parse(asOf);
  if (!Number.isFinite(ms)) throw new Error(`asOf is not a parseable date: ${asOf}`);
  return ms;
}

/**
 * Reject unusable weights loudly. `commandEngines.ts:38` throws on a zero weight
 * sum for the same reason: a silently-degraded scorecard is worse than a stack
 * trace, because it produces a ranking that looks fine.
 */
function assertWeights(w: TargetingWeights): void {
  for (const k of TARGET_FACTOR_KEYS) {
    const v = w[k];
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`targeting weight "${k}" must be a finite number ≥ 0 (got ${String(v)})`);
    }
  }
}

/**
 * Gate, then score, then measure confidence — in that order, and the order is the
 * design. Nothing about the score can readmit a gated target, and nothing about
 * confidence can move the score.
 */
export function assessTarget(t: GpsTarget, opts: AssessOptions = {}): TargetAssessment {
  const weights = opts.weights ?? WEIGHTS_V1;
  assertWeights(weights);
  const asOfMs = resolveAsOfMs(opts.asOf);

  const gates = evaluateGates(t);
  const eligible = gates.length === 0;

  const outcomes: Record<TargetFactorKey, FactorOutcome> = {
    need: deriveNeed(t),
    abilityToPay: deriveAbilityToPay(t),
    expectedMargin: deriveExpectedMargin(t),
    access: deriveAccess(t),
    urgency: deriveUrgency(t, asOfMs),
    deliveryComplexity: deriveDeliveryComplexity(t),
  };

  const factors = Object.fromEntries(
    TARGET_FACTOR_KEYS.map((k) => [k, outcomes[k].value]),
  ) as Record<TargetFactorKey, number | null>;

  // Drivers are integers so that they SUM EXACTLY to rawScore. A trail that does
  // not add up is a trail nobody trusts twice.
  const drivers: Driver[] = TARGET_FACTOR_KEYS.map((k) => {
    const w = weights[k];
    const penalty = k === 'deliveryComplexity';
    const o = outcomes[k];
    if (o.value == null) {
      return { label: `${FACTOR_LABELS[k]} — unknown (0 of ${penalty ? `−${w}` : w})`, points: 0 };
    }
    const points = Math.round(o.value * w) * (penalty ? -1 : 1);
    const detail = o.detail ? `${o.detail}` : `${Math.round(o.value * 100)}%`;
    return { label: `${FACTOR_LABELS[k]} — ${detail} (${points} of ${penalty ? `−${w}` : w})`, points };
  });

  const rawScore = drivers.reduce((a, d) => a + d.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  const confidence = computeConfidence(t, factors);

  const advisories = TARGET_FACTOR_KEYS.map((k) => outcomes[k].advisory).filter(
    (a): a is string => a != null,
  );

  // Zeros last, then largest absolute contribution first. Stable within a group
  // because Array.prototype.sort is stable and the input is in factor order.
  const ordered = [...drivers].sort((a, b) => {
    const az = a.points === 0 ? 1 : 0;
    const bz = b.points === 0 ? 1 : 0;
    return az - bz || Math.abs(b.points) - Math.abs(a.points);
  });

  return {
    targetId: t.id,
    name: t.name,
    eligible,
    gates,
    score: eligible ? score : null,
    rawScore: eligible ? rawScore : null,
    drivers: ordered,
    factors,
    confidence,
    advisories,
    weightsVersion: WEIGHTS_V1_BASIS.version,
    summary: buildSummary(t, gates, eligible ? score : null, ordered, confidence),
  };
}

function buildSummary(
  t: GpsTarget,
  gates: GateHit[],
  score: number | null,
  drivers: Driver[],
  conf: TargetConfidence,
): string {
  if (score == null) {
    const extra = gates.length > 1 ? ` (+${gates.length - 1} more gate${gates.length > 2 ? 's' : ''})` : '';
    return `${t.name}: EXCLUDED — ${gates[0]?.reason ?? 'gated'}${extra}`;
  }
  const lead = drivers.find((d) => d.points > 0);
  const drag = drivers.find((d) => d.points < 0) ?? drivers.find((d) => d.points === 0);
  const led = lead ? ` led by ${lead.label}` : ' with nothing scoring';
  const held = drag ? `; held back by ${drag.label}` : '';
  return `${t.name}: ${score}/100${led}${held} — confidence ${conf.confidence}/100 (${conf.band}).`;
}

/* ── Ranking ───────────────────────────────────────────────────────────────── */

export interface TargetRanking {
  /** Eligible targets, best first. Sorted by SCORE; confidence only tie-breaks. */
  ranked: TargetAssessment[];
  /** Gated targets, in input order, each carrying its reasons. Never ranked. */
  excluded: TargetAssessment[];
  weights: TargetingWeights;
  weightsVersion: 'v1';
}

/**
 * Assess a list and split it in two.
 *
 * SORT BY SCORE, BAND BY CONFIDENCE (plan §7). Confidence appears here only as a
 * tie-break between equal scores, which is the strongest form of "orthogonal"
 * that a single ordered list can express: a low-confidence target keeps its rank
 * and carries a visible band, rather than being quietly demoted for the sin of
 * being under-researched.
 *
 * `excluded` is returned rather than dropped. A discarded target with no record
 * is how the same unqualifiable prospect gets re-sourced every quarter.
 */
export function rankTargets(
  targets: readonly GpsTarget[],
  opts: AssessOptions = {},
): TargetRanking {
  const weights = opts.weights ?? WEIGHTS_V1;
  const assessed = targets.map((t) => assessTarget(t, { ...opts, weights }));
  const ranked = assessed
    .filter((a) => a.eligible)
    .sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        b.confidence.confidence - a.confidence.confidence ||
        a.name.localeCompare(b.name),
    );
  return {
    ranked,
    excluded: assessed.filter((a) => !a.eligible),
    weights,
    weightsVersion: WEIGHTS_V1_BASIS.version,
  };
}
