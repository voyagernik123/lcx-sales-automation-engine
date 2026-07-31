import type { OfferKey } from './types.js';
import { marginCents, marginPct } from './types.js';

/**
 * GLOBAL SERVICES (GPS) — THE PARTNER BENCH, as pure domain logic.
 *
 * Phase 2 of `GPS_IMPLEMENTATION_PLAN.md` (decision D5). Partners and
 * specialists DELIVER; the founder sells and coordinates. Two consequences run
 * through every function below:
 *
 *  1. BENCH DEPTH PER OFFER IS THE CONCURRENCY CAP ON THE WHOLE BUSINESS. Not a
 *     reporting nicety — if nobody on the bench can deliver a MiCA white paper,
 *     the business cannot accept a MiCA white paper, whatever the pipeline says.
 *     `benchHeadroom` computes that number and, more importantly, says WHY it is
 *     what it is.
 *  2. PARTNER QUALITY IS THE PRODUCT, and one failed delivery destroys the moat
 *     (the founder's reputation and referral network). So `canAcceptEngagement`
 *     is a HARD GATE that can say NO with a reason, following plan §7: "a gated
 *     target is excluded with a reason, not ranked low" — never a silent
 *     multiply-by-zero.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  NO THIRD PARTNER TABLE. THIS FILE IS THE DOMAIN MODEL AND THE ENGINES ONLY.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Two partner tables already exist:
 *    · `partners`         — `apps/api/src/db/migrations/0024_dealdesk_ext.sql:66`
 *                           (id, name, type, commission_pct, contact) — the
 *                           referral/reseller bench, already joined by
 *                           `referrals.partner_id` (`0024_dealdesk_ext.sql:79`).
 *    · `command_partners` — `apps/api/src/db/migrations/0040_command.sql:29`
 *                           (LiquidityProvider | Bank | Custodian …) — the LCX
 *                           COMMAND counterparty bench, a different population.
 *  A third would be absurd, and the plan says so explicitly (§5 "Extensions":
 *  "`partners` (`0024_dealdesk_ext.sql:66`) gains capability, rate card,
 *  capacity"; §5 "Cut or deferred" lists `partner` (third table),
 *  `partner_capability` and `commercial_quote` as CUT). PERSISTENCE FOR
 *  EVERYTHING HERE WILL EXTEND `partners` — capability/rate-card/capacity rows
 *  hang off `partners.id`. Nothing in this file performs or implies I/O: no DB,
 *  no fetch, no clock (see the `asOf` discipline note below), no LLM.
 *
 * NO CALIBRATION, AND THAT IS SAID IN CODE. ~29 engagements a year is the
 * realistic volume. That number kills any pretence of a learned model: every
 * threshold in this file (the scorecard confidence bands, the erosion verdicts)
 * is a STATED PRIOR to be reviewed quarterly against recorded outcomes, exactly
 * as plan §7 requires — not a fitted weight. Where a prior is used it is named
 * as one.
 *
 * NO FLATTERING DEFAULTS. `partnerScorecard` returns `null` for every metric it
 * has no evidence for and reports the per-metric sample size beside it. A bench
 * of unproven partners must LOOK unproven: a 1-engagement partner showing "100%
 * on time" ranked above a 12-engagement partner showing 92% is how a bench gets
 * staffed by luck.
 *
 * THE `asOf` DISCIPLINE. Staleness and availability are time-dependent, and a
 * pure function may not read the clock. So `asOf` is always a caller-supplied
 * ISO instant. When it is omitted, the time-dependent checks are SKIPPED and the
 * result says they were skipped (`availabilityEvaluated`, `stalenessEvaluated`)
 * rather than quietly passing. A skipped check that reports itself as passed is
 * the same defect as a fabricated metric.
 *
 * Money is integer cents throughout, matching `types.ts` and
 * `payment_milestones` (`0024_dealdesk_ext.sql:37`). At $10–25k engagements with
 * a subcontractor delivering, margin is the whole game and floats are three
 * roundings from a wrong invoice.
 */

/* ── Capability ──────────────────────────────────────────────────────────── */

/**
 * Seniority as the partner themselves states it, for the specific offer.
 *
 * Per-capability rather than per-partner: the same person can be a principal on
 * legal-opinion coordination and an associate on marketing activation, and
 * flattening that to one label on the partner row is how the wrong person gets
 * proposed for the wrong engagement.
 *
 * Deliberately NOT a rate driver in this file. A seniority→rate multiplier would
 * be an invented number; the rate card is the only source of cost (see
 * `RateCard`). Seniority is here so a human can read the bench, and so a future
 * staffing rule has a field to key on.
 */
export type Seniority = 'principal' | 'senior' | 'associate';

export const SENIORITY_LABEL: Record<Seniority, string> = {
  principal: 'Principal',
  senior: 'Senior',
  associate: 'Associate',
};

/** Ordered weakest → strongest, for display and for `atLeastSeniority` gates. */
export const SENIORITY_ORDER: readonly Seniority[] = ['associate', 'senior', 'principal'] as const;

/** True when `have` meets or exceeds `want`. Total, no throw on unknowns. */
export function meetsSeniority(have: Seniority, want: Seniority): boolean {
  return SENIORITY_ORDER.indexOf(have) >= SENIORITY_ORDER.indexOf(want);
}

/**
 * What one partner can deliver: one offer, at one seniority, in the
 * jurisdictions a HUMAN TYPED.
 *
 * JURISDICTIONS ARE FREE TEXT AND ARE NEVER INFERRED. This mirrors
 * `GpsClient.jurisdiction` (`types.ts:310`) and the same hard reason: no
 * regulatory fact in this programme is verifiable (plan §0 — everything
 * regulatory is recalled training data). So there is no jurisdiction enum, no
 * hierarchy, and no containment logic anywhere in this file. "EU" does NOT
 * satisfy a requirement for "Liechtenstein", and "DE" does NOT satisfy
 * "Germany" — a match is a case-insensitive, trimmed EQUALITY against what a
 * human entered. That will produce false negatives ("we do cover that, the
 * string just differs"), and false negatives are the correct failure direction:
 * a false positive here means proposing a partner into a jurisdiction nobody
 * ever confirmed they can work in.
 */
export interface PartnerCapability {
  offerKey: OfferKey;
  seniority: Seniority;
  /**
   * Human-entered jurisdiction strings. EMPTY means "none stated" — treated as
   * covering NOTHING when a jurisdiction is required, never as "covers
   * everywhere". Silence is not a licence.
   */
  jurisdictions: readonly string[];
  /**
   * Free-text evidence for the claim: prior engagements, named counsel
   * relationship, the referral that produced them. Not scored — read by a human
   * before a $10–25k engagement is handed over.
   */
  evidence: string | null;
}

/** The comparison used for every jurisdiction check. Trim + case, nothing more. */
function normJurisdiction(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Does this capability cover `jurisdiction`?
 *
 * `null`/blank `jurisdiction` means the caller did not state one, which returns
 * `true`: not stating a jurisdiction cannot be a refusal reason, because a
 * diagnostic or a GTM sprint frequently has no jurisdictional dimension at all.
 * The refusal belongs to the caller that KNOWS a jurisdiction matters.
 */
export function capabilityCoversJurisdiction(
  cap: PartnerCapability,
  jurisdiction: string | null | undefined,
): boolean {
  if (jurisdiction == null || jurisdiction.trim() === '') return true;
  const want = normJurisdiction(jurisdiction);
  return cap.jurisdictions.some((j) => normJurisdiction(j) === want);
}

/* ── Rate card ───────────────────────────────────────────────────────────── */

/**
 * How the partner charges. `fixed` is the only unit that is safe to quote
 * against without a second assumption, which is why the other two carry
 * `expectedUnits` and why a missing `expectedUnits` yields `null` cost rather
 * than a guess.
 */
export type RateUnit = 'fixed' | 'day_rate' | 'hourly';

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  fixed: 'Fixed fee',
  day_rate: 'Day rate',
  hourly: 'Hourly',
};

/**
 * WHAT ONE PARTNER COSTS US, per offer, in integer cents.
 *
 * `validUntil` is not optional bookkeeping — IT IS THE POINT OF THIS TYPE. A
 * stale rate destroys margin silently: the quote is built from a number the
 * partner stopped honouring two quarters ago, the invoice arrives higher, and
 * the overrun eats a $10–25k engagement's whole margin. `types.ts:161` calls the
 * catalogue's `expectedVendorCostCents` a placeholder for exactly this reason
 * (D5: no named partners, so no rate cards).
 *
 * `validUntil: null` therefore means NO VALIDITY WAS EVER STATED, and that is
 * treated as UNUSABLE, not as "valid forever" (`rateCardStatus` returns
 * `'no_validity_stated'`). A rate with no expiry is a rate nobody re-confirmed.
 */
export interface RateCard {
  offerKey: OfferKey;
  unit: RateUnit;
  /** Cost to US, integer cents. Per day for `day_rate`, per hour for `hourly`. */
  amountCents: number;
  /**
   * Units we expect to buy for one engagement of this offer. REQUIRED for
   * `day_rate`/`hourly` and ignored for `fixed`. Null on a metered unit means
   * the engagement cost CANNOT BE DERIVED — `rateCardCostCents` returns null and
   * every consumer must handle that rather than assume 1.
   */
  expectedUnits: number | null;
  /** ISO-4217, uppercase. Partners invoice in their own currency (`types.ts:331`). */
  currency: string;
  /** ISO date/instant after which this rate must be re-confirmed. See docblock. */
  validUntil: string | null;
  /** Who on our side recorded it. A named human, never a service account. */
  statedBy: string;
  /** ISO instant the rate was recorded. */
  statedAt: string;
}

export type RateCardStatus = 'usable' | 'no_validity_stated' | 'expired';

/**
 * Usability of a rate card at an instant the CALLER supplies.
 *
 * `asOf` is required. There is no default-to-now: a pure function that reads the
 * clock is untestable, and worse, a caller who forgot to pass a date would get a
 * confident answer about staleness that depends on when the process happened to
 * run. Callers that genuinely have no date must skip the check and SAY they
 * skipped it (`AcceptanceDecision.stalenessEvaluated`).
 */
export function rateCardStatus(card: RateCard, asOf: string): RateCardStatus {
  if (card.validUntil == null || card.validUntil.trim() === '') return 'no_validity_stated';
  const until = Date.parse(card.validUntil);
  const at = Date.parse(asOf);
  // An unparseable date is not "fine". Refuse to interpret it.
  if (!Number.isFinite(until) || !Number.isFinite(at)) return 'no_validity_stated';
  return at <= until ? 'usable' : 'expired';
}

/**
 * The cost of ONE engagement of this offer under this rate card, integer cents,
 * or `null` when it cannot be derived.
 *
 * Null, not zero and not a guessed unit count. A metered rate with no expected
 * units is exactly the case where a fabricated default (1 day? 10 days?) would
 * put an invented margin on a proposal.
 */
export function rateCardCostCents(card: RateCard): number | null {
  if (!Number.isFinite(card.amountCents) || card.amountCents < 0) return null;
  if (card.unit === 'fixed') return Math.round(card.amountCents);
  const units = card.expectedUnits;
  if (units == null || !Number.isFinite(units) || units <= 0) return null;
  return Math.round(card.amountCents * units);
}

/* ── Capacity and the partner ────────────────────────────────────────────── */

/**
 * How much this partner can run AT ONCE — across all offers, not per offer.
 *
 * Per-partner and not per-offer on purpose: a specialist running two white
 * papers cannot also run a GTM sprint just because the sprint is a different
 * offer key. The cap is on the human. This is the single most consequential
 * number in the file, and `CATALOGUE_TODOS` already flags that nobody has
 * supplied it (`catalogue.ts:504` — "Concurrency cap per offer … Without it the
 * system will happily sell more than can be delivered").
 *
 * `statedBy`/`statedAt` exist because this number is a CLAIM someone made, not a
 * measurement. When a partner over-promises capacity and misses, the record of
 * who stated what is the only way the prior gets corrected.
 */
export interface Capacity {
  /** Concurrent engagements this partner will accept. 0 is legitimate: "full". */
  maxConcurrent: number;
  /** Who told us. A named human. */
  statedBy: string;
  /** ISO instant. */
  statedAt: string;
  /**
   * ISO instant until which the partner is unavailable (leave, another client,
   * illness), or null. Evaluated only when the caller supplies `asOf` — see the
   * `asOf` discipline note in the file header.
   */
  unavailableUntil: string | null;
}

/**
 * A bench member. Persisted as an extension of `partners`
 * (`0024_dealdesk_ext.sql:66`) — see the file header. `id` is that row's UUID.
 */
export interface Partner {
  id: string;
  name: string;
  /**
   * False takes the partner out of every headroom calculation and every
   * acceptance decision, without deleting the history their scorecard is built
   * from. Off-boarding a partner must not silently rewrite past margin.
   */
  active: boolean;
  capabilities: readonly PartnerCapability[];
  /** One card per offer they can deliver. A capability with no card cannot be quoted. */
  rateCards: readonly RateCard[];
  capacity: Capacity;
  /** Free text. The referral path, the relationship owner, the caveats. */
  notes: string | null;
}

/**
 * THE BENCH IS EMPTY, AND THAT IS THE TRUTH RATHER THAN AN OVERSIGHT.
 *
 * D5 is unanswered: there are no named partners and no rate cards
 * (`catalogue.ts:495`), which is why `ServiceOffer.partnerOwner` is null on all
 * five offers (`types.ts:152`) and every `expectedVendorCostCents` is a
 * placeholder. Exported as a real empty array, not omitted, so a surface can
 * render "no bench — nothing can be staffed" from data instead of from a
 * hard-coded string, and so `benchHeadroom(OFFER_KEYS, PARTNER_BENCH, [])`
 * honestly returns 0 everywhere with the reason `no_capable_partner`.
 *
 * When names arrive they are ROWS, not entries here: this constant stays empty
 * and the engines take partners as arguments.
 */
export const PARTNER_BENCH: readonly Partner[] = [];

/**
 * An engagement currently occupying a partner's slot.
 *
 * Deliberately minimal — id, offer, partner — and deliberately NOT
 * `GpsEngagement` (`types.ts:317`). The headroom engine needs to know that a
 * slot is taken; giving it price, status and scope snapshot would invite it to
 * start making commercial judgements it has no business making. The CALLER
 * decides which statuses count as occupying (a sane rule: `accepted`,
 * `deposit_paid`, `in_delivery`; `types.ts:216`), because that policy belongs
 * where the statuses live, not here.
 */
export interface ActiveEngagementRef {
  engagementId: string;
  offerKey: OfferKey;
  /** Null when the engagement was sold without a named partner — which is the bug. */
  partnerId: string | null;
}

/* ── Bench headroom ─────────────────────────────────────────────────────── */

/**
 * One line of the explanation for a headroom number, in SLOTS.
 *
 * Shaped like `Driver` (`packages/shared/src/alpha.ts:41`) and deliberately not
 * importing it: `Driver.points` are score points on a 0–100 composite, and
 * conflating "3 points of propensity" with "3 deliverable engagements" is how a
 * capacity number ends up rendered as a score and rounded. Same pattern, own
 * unit. (`types.ts:13` states the wider rule that GPS does not reuse alpha's
 * composites.)
 */
export interface HeadroomReason {
  label: string;
  /** Slots this line contributes. 0 for a line that explains an exclusion. */
  slots: number;
}

/** Why a capable partner contributed nothing. Null when they contributed. */
export type PartnerExclusion =
  | 'inactive'
  | 'unavailable'
  | 'at_capacity'
  | 'no_rate_card';

export interface PartnerSlotDetail {
  partnerId: string;
  partnerName: string;
  maxConcurrent: number;
  /** Engagements of ANY offer currently occupying this partner. */
  activeCount: number;
  /** Slots contributed to this offer's headroom. Never negative. */
  spare: number;
  exclusion: PartnerExclusion | null;
}

export interface OfferHeadroom {
  offerKey: OfferKey;
  /** How many MORE engagements of this offer the bench can take. */
  headroom: number;
  /** Nothing more can be accepted. A caller must be able to test this directly. */
  blocked: boolean;
  /** Partners with a matching capability (before capacity/availability). */
  capablePartnerIds: readonly string[];
  /** Capable AND holding a usable rate card, i.e. quotable with known margin. */
  quotablePartnerIds: readonly string[];
  /** Active engagements of THIS offer right now. */
  activeNow: number;
  reasons: readonly HeadroomReason[];
  perPartner: readonly PartnerSlotDetail[];
}

export interface BenchHeadroom {
  perOffer: readonly OfferHeadroom[];
  /**
   * The real simultaneous ceiling: total spare slots across the bench.
   *
   * THIS IS NOT THE SUM OF THE PER-OFFER NUMBERS AND MUST NOT BE PRESENTED AS
   * ONE. A partner capable of three offers contributes their spare slot to all
   * three headroom figures, because each is the answer to "if the next deal were
   * THIS offer, could we take it?". Summing them would trip
   * `totalSpareSlots` × 3 and license selling three engagements into one slot.
   */
  totalSpareSlots: number;
  /** False whenever any partner is capable of more than one requested offer. */
  perOfferIndependent: boolean;
  /** False when no `asOf` was supplied, so `unavailableUntil` was NOT applied. */
  availabilityEvaluated: boolean;
  /**
   * Active engagements with `partnerId: null` — sold and unstaffable. They
   * consume nobody's slot, which is precisely why they are surfaced: they are
   * invisible to the arithmetic and fatal to the moat.
   */
  unstaffedActiveCount: number;
}

export interface BenchOptions {
  /** ISO instant. Omit and availability windows are skipped AND reported as skipped. */
  asOf?: string;
  /** Human-entered jurisdiction string. Matched by equality only — see `PartnerCapability`. */
  jurisdiction?: string | null;
  /** Minimum seniority the engagement needs. Omit for none. */
  minSeniority?: Seniority;
  /**
   * Count only partners holding a rate card for the offer. Default FALSE here:
   * a partner with no recorded rate can still deliver, so excluding them would
   * understate real capacity. `canAcceptEngagement` defaults it to TRUE, because
   * accepting is a commercial act and an unknown cost is an unknown margin.
   */
  requireRateCard?: boolean;
}

const nonNegInt = (v: number): number =>
  Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/** The capability for this offer that also satisfies jurisdiction + seniority. */
function matchingCapability(
  partner: Partner,
  offerKey: OfferKey,
  opts: BenchOptions,
): PartnerCapability | null {
  for (const cap of partner.capabilities) {
    if (cap.offerKey !== offerKey) continue;
    if (!capabilityCoversJurisdiction(cap, opts.jurisdiction)) continue;
    if (opts.minSeniority && !meetsSeniority(cap.seniority, opts.minSeniority)) continue;
    return cap;
  }
  return null;
}

/** Usable rate card for the offer, honouring `asOf` when one was supplied. */
function usableRateCard(partner: Partner, offerKey: OfferKey, asOf?: string): RateCard | null {
  for (const card of partner.rateCards) {
    if (card.offerKey !== offerKey) continue;
    // With no asOf we cannot judge staleness; the card counts, and the caller is
    // told staleness was not evaluated rather than being told it passed.
    if (asOf == null) return card;
    if (rateCardStatus(card, asOf) === 'usable') return card;
  }
  return null;
}

function isUnavailable(partner: Partner, asOf?: string): boolean {
  const until = partner.capacity.unavailableUntil;
  if (asOf == null || until == null || until.trim() === '') return false;
  const u = Date.parse(until);
  const a = Date.parse(asOf);
  if (!Number.isFinite(u) || !Number.isFinite(a)) return false;
  return a < u;
}

/**
 * HOW MANY MORE ENGAGEMENTS OF EACH OFFER THE BENCH CAN TAKE, AND WHY.
 *
 * The "why" is not decoration. A bare 0 gets argued with; "0 — nobody on the
 * bench can deliver a MiCA white paper" ends the argument, and "0 — Anna is at
 * capacity (2/2)" starts a different, useful one. Same shape as the plan's gate
 * discipline (§7): a refusal always carries its reason.
 *
 * Arithmetic, stated plainly:
 *   headroom(offer) = Σ over partners P where P is active, available, capable of
 *                     `offer` (jurisdiction + seniority satisfied) and — if
 *                     `requireRateCard` — holds a usable rate card, of
 *                     max(0, P.capacity.maxConcurrent − P.activeEngagements)
 * where `P.activeEngagements` counts engagements of EVERY offer, because the cap
 * is on the human, not on the offer (see `Capacity`).
 */
export function benchHeadroom(
  offerKeys: readonly OfferKey[],
  partners: readonly Partner[],
  activeEngagements: readonly ActiveEngagementRef[],
  opts: BenchOptions = {},
): BenchHeadroom {
  const activeByPartner = new Map<string, number>();
  let unstaffedActiveCount = 0;
  for (const e of activeEngagements) {
    if (e.partnerId == null) { unstaffedActiveCount += 1; continue; }
    activeByPartner.set(e.partnerId, (activeByPartner.get(e.partnerId) ?? 0) + 1);
  }

  const perOffer: OfferHeadroom[] = [];
  const spareByPartner = new Map<string, number>();
  const offerCountByPartner = new Map<string, number>();

  for (const offerKey of offerKeys) {
    const capable = partners.filter((p) => matchingCapability(p, offerKey, opts) != null);
    const quotable = capable.filter((p) => usableRateCard(p, offerKey, opts.asOf) != null);
    const quotableIds = new Set(quotable.map((p) => p.id));
    const activeNow = activeEngagements.filter((e) => e.offerKey === offerKey).length;

    const perPartner: PartnerSlotDetail[] = [];
    const reasons: HeadroomReason[] = [];
    let headroom = 0;

    for (const p of capable) {
      offerCountByPartner.set(p.id, (offerCountByPartner.get(p.id) ?? 0) + 1);
      const max = nonNegInt(p.capacity.maxConcurrent);
      const activeCount = activeByPartner.get(p.id) ?? 0;
      const rawSpare = Math.max(0, max - activeCount);

      let exclusion: PartnerExclusion | null = null;
      if (!p.active) exclusion = 'inactive';
      else if (isUnavailable(p, opts.asOf)) exclusion = 'unavailable';
      else if (opts.requireRateCard === true && !quotableIds.has(p.id)) exclusion = 'no_rate_card';
      else if (rawSpare === 0) exclusion = 'at_capacity';

      const spare = exclusion == null ? rawSpare : 0;
      headroom += spare;
      spareByPartner.set(p.id, Math.max(spareByPartner.get(p.id) ?? 0, spare));
      perPartner.push({ partnerId: p.id, partnerName: p.name, maxConcurrent: max, activeCount, spare, exclusion });

      if (exclusion == null) {
        reasons.push({ label: `${p.name}: ${spare} of ${max} slot${max === 1 ? '' : 's'} free`, slots: spare });
      } else if (exclusion === 'at_capacity') {
        reasons.push({ label: `${p.name}: at capacity (${activeCount}/${max})`, slots: 0 });
      } else if (exclusion === 'unavailable') {
        reasons.push({ label: `${p.name}: unavailable until ${p.capacity.unavailableUntil}`, slots: 0 });
      } else if (exclusion === 'inactive') {
        reasons.push({ label: `${p.name}: off the bench (inactive)`, slots: 0 });
      } else {
        reasons.push({ label: `${p.name}: no usable rate card for this offer`, slots: 0 });
      }
    }

    if (capable.length === 0) {
      // The honest headline for the state the business is actually in today
      // (PARTNER_BENCH is empty, D5 unanswered).
      reasons.unshift({ label: `No partner on the bench can deliver ${offerKey}`, slots: 0 });
    } else if (quotable.length < capable.length) {
      // Deliverable but un-quotable is a real and separate hazard: capacity
      // exists, margin is unknown. Said once per offer, not per partner.
      reasons.push({
        label: `${capable.length - quotable.length} capable partner(s) have no usable rate card — margin unknown`,
        slots: 0,
      });
    }

    perOffer.push({
      offerKey,
      headroom,
      blocked: headroom === 0,
      capablePartnerIds: capable.map((p) => p.id),
      quotablePartnerIds: quotable.map((p) => p.id),
      activeNow,
      reasons,
      perPartner,
    });
  }

  let totalSpareSlots = 0;
  for (const v of spareByPartner.values()) totalSpareSlots += v;
  let perOfferIndependent = true;
  for (const [pid, count] of offerCountByPartner) {
    if (count > 1 && (spareByPartner.get(pid) ?? 0) > 0) perOfferIndependent = false;
  }

  return {
    perOffer,
    totalSpareSlots,
    perOfferIndependent,
    availabilityEvaluated: opts.asOf != null,
    unstaffedActiveCount,
  };
}

/** Lookup helper so callers do not re-scan `perOffer` by hand. */
export function headroomFor(bench: BenchHeadroom, offerKey: OfferKey): OfferHeadroom | null {
  return bench.perOffer.find((o) => o.offerKey === offerKey) ?? null;
}

/* ── The hard gate ──────────────────────────────────────────────────────── */

/**
 * Why we cannot take this engagement. One code per distinguishable cause,
 * because "no" is only useful if it says which "no" it is: `no_capable_partner`
 * is a recruiting problem, `bench_at_capacity` is a scheduling problem, and
 * `jurisdiction_not_covered` is a scoping conversation with the client.
 */
export type RefusalCode =
  | 'no_capable_partner'
  | 'jurisdiction_not_covered'
  | 'below_required_seniority'
  | 'all_partners_inactive'
  | 'all_partners_unavailable'
  | 'no_usable_rate_card'
  | 'bench_at_capacity';

/** One evaluated gate. `skipped` gates were never reached — not silently passed. */
export interface GateResult {
  code: RefusalCode;
  passed: boolean;
  skipped: boolean;
  detail: string;
}

export interface AcceptanceDecision {
  offerKey: OfferKey;
  accepted: boolean;
  /** Human-readable refusal. Null if and only if `accepted` is true. */
  reason: string | null;
  refusalCode: RefusalCode | null;
  /** Partners who could take it now. Empty on refusal. */
  eligiblePartnerIds: readonly string[];
  headroom: number;
  /** Every gate, in order, including the ones not reached. */
  gates: readonly GateResult[];
  /** False when no `asOf` was supplied: rate-card expiry was NOT checked. */
  stalenessEvaluated: boolean;
  /** False when no `asOf` was supplied: `unavailableUntil` was NOT checked. */
  availabilityEvaluated: boolean;
}

/**
 * CAN WE ACCEPT THIS ENGAGEMENT? A hard gate that can, and regularly should,
 * say NO.
 *
 * Selling what cannot be delivered is the fastest way to destroy the moat: the
 * partner bench IS the product, and one failed delivery costs the referral
 * network that produced ~$250k of manual sales. So this function refuses by
 * default and only accepts when a named, active, available, capable partner has
 * a free slot — and, unless the caller opts out, a rate card so the margin is
 * known before the commitment rather than after it.
 *
 * Gate order is deliberate, cheapest and most fundamental first, and each gate
 * is recorded (`gates`) so a refusal is auditable rather than a mystery. Gates
 * after the failing one are marked `skipped`, never `passed`: reporting an
 * unevaluated check as passed is how a gate becomes theatre.
 *
 * `requireRateCard` defaults to TRUE here and FALSE in `benchHeadroom` — those
 * are different questions. Headroom asks "how much could be delivered"; this
 * asks "may we commit", and committing at an unknown cost is committing to an
 * unknown margin on a $10–25k engagement where one overrun eats the deal.
 */
export function canAcceptEngagement(
  offerKey: OfferKey,
  partners: readonly Partner[],
  activeEngagements: readonly ActiveEngagementRef[],
  opts: BenchOptions = {},
): AcceptanceDecision {
  const requireRateCard = opts.requireRateCard !== false;
  const effective: BenchOptions = { ...opts, requireRateCard };
  const gates: GateResult[] = [];
  const order: RefusalCode[] = [
    'no_capable_partner',
    'jurisdiction_not_covered',
    'below_required_seniority',
    'all_partners_inactive',
    'all_partners_unavailable',
    'no_usable_rate_card',
    'bench_at_capacity',
  ];

  const refuse = (code: RefusalCode, detail: string): AcceptanceDecision => {
    gates.push({ code, passed: false, skipped: false, detail });
    for (const c of order.slice(order.indexOf(code) + 1)) {
      gates.push({ code: c, passed: false, skipped: true, detail: 'not reached' });
    }
    return {
      offerKey,
      accepted: false,
      reason: detail,
      refusalCode: code,
      eligiblePartnerIds: [],
      headroom: 0,
      gates,
      stalenessEvaluated: opts.asOf != null,
      availabilityEvaluated: opts.asOf != null,
    };
  };
  const pass = (code: RefusalCode, detail: string): void => {
    gates.push({ code, passed: true, skipped: false, detail });
  };

  // 1. Capability, ignoring jurisdiction and seniority so the next two gates can
  //    tell "we do not do this at all" apart from "not there / not at that level".
  const byOffer = partners.filter((p) => p.capabilities.some((c) => c.offerKey === offerKey));
  if (byOffer.length === 0) {
    return refuse('no_capable_partner', `No partner on the bench has a recorded capability for ${offerKey}.`);
  }
  pass('no_capable_partner', `${byOffer.length} partner(s) claim ${offerKey}.`);

  // 2. Jurisdiction — equality against human-entered strings, never inference.
  const byJur = byOffer.filter((p) =>
    p.capabilities.some((c) => c.offerKey === offerKey && capabilityCoversJurisdiction(c, opts.jurisdiction)),
  );
  if (byJur.length === 0) {
    return refuse(
      'jurisdiction_not_covered',
      `No partner records ${offerKey} coverage for "${opts.jurisdiction}". Coverage is what a human entered; it is never inferred, so confirm with the partner rather than assuming.`,
    );
  }
  pass('jurisdiction_not_covered', opts.jurisdiction ? `Covered for "${opts.jurisdiction}".` : 'No jurisdiction required.');

  // 3. Seniority.
  const bySen = byJur.filter((p) => matchingCapability(p, offerKey, effective) != null);
  if (bySen.length === 0) {
    return refuse(
      'below_required_seniority',
      `No partner covering ${offerKey} is at ${opts.minSeniority ? SENIORITY_LABEL[opts.minSeniority] : 'the required'} level or above.`,
    );
  }
  pass('below_required_seniority', opts.minSeniority ? `At least ${SENIORITY_LABEL[opts.minSeniority]}.` : 'No seniority floor set.');

  // 4/5. On the bench, and actually around.
  const activeOnes = bySen.filter((p) => p.active);
  if (activeOnes.length === 0) {
    return refuse('all_partners_inactive', `Every partner capable of ${offerKey} is off the bench (inactive).`);
  }
  pass('all_partners_inactive', `${activeOnes.length} active.`);

  const available = activeOnes.filter((p) => !isUnavailable(p, opts.asOf));
  if (available.length === 0) {
    return refuse('all_partners_unavailable', `Every partner capable of ${offerKey} is unavailable at ${opts.asOf}.`);
  }
  pass(
    'all_partners_unavailable',
    opts.asOf == null ? 'Availability NOT evaluated: no asOf supplied.' : `${available.length} available at ${opts.asOf}.`,
  );

  // 6. Known cost. Skipped only if the caller explicitly opted out.
  const withCard = available.filter((p) => usableRateCard(p, offerKey, opts.asOf) != null);
  if (requireRateCard && withCard.length === 0) {
    return refuse(
      'no_usable_rate_card',
      `No available partner has a usable rate card for ${offerKey}, so the margin on this engagement is unknown. A stale or missing rate is how a $10–25k engagement quietly loses its margin.`,
    );
  }
  pass(
    'no_usable_rate_card',
    requireRateCard
      ? `${withCard.length} with a usable rate card${opts.asOf == null ? ' (staleness NOT evaluated: no asOf supplied)' : ''}.`
      : 'Rate card not required by caller — margin may be unknown.',
  );

  // 7. A free slot. Delegated to `benchHeadroom` so there is exactly one place
  //    where slot arithmetic lives.
  const bench = benchHeadroom([offerKey], partners, activeEngagements, effective);
  const row = headroomFor(bench, offerKey);
  const eligible = (row?.perPartner ?? []).filter((d) => d.exclusion == null && d.spare > 0);
  if (!row || row.headroom <= 0) {
    const detail = (row?.reasons ?? []).map((r) => r.label).join('; ');
    return refuse(
      'bench_at_capacity',
      `Every partner capable of ${offerKey} is at capacity. ${detail}`.trim(),
    );
  }
  pass('bench_at_capacity', `${row.headroom} slot(s) free.`);

  return {
    offerKey,
    accepted: true,
    reason: null,
    refusalCode: null,
    eligiblePartnerIds: eligible.map((d) => d.partnerId),
    headroom: row.headroom,
    gates,
    stalenessEvaluated: opts.asOf != null,
    availabilityEvaluated: opts.asOf != null,
  };
}

/* ── Scorecard, from recorded outcomes only ─────────────────────────────── */

/**
 * ONE FINISHED ENGAGEMENT, AS RECORDED. The only input to a scorecard.
 *
 * Every field is nullable because in reality half of them will be missing, and a
 * missing field must reduce the sample rather than be filled in with something
 * agreeable. There is no `rating`, no `stars`, no `qualityScore`: an opinion
 * field would immediately become the ranking key and would be unfalsifiable.
 * Persisted alongside `gps_engagement` (`types.ts:317`), not as a partner
 * property — the outcome belongs to the engagement.
 */
export interface RecordedOutcome {
  engagementId: string;
  partnerId: string;
  offerKey: OfferKey;
  /** Price to the client as quoted, integer cents. */
  quotedPriceCents: number;
  /** Vendor cost as quoted at acceptance, integer cents. */
  quotedVendorCostCents: number;
  /** Price actually invoiced if it changed (change order). Null → quoted stands. */
  finalPriceCents: number | null;
  /** What the partner actually invoiced us. Null → margin cannot be realised. */
  actualVendorCostCents: number | null;
  /** ISO date the deliverable was due per the acceptance criteria. */
  dueAt: string | null;
  /** ISO date it actually landed. Null → on-time is UNKNOWN, not late. */
  deliveredAt: string | null;
  /** Revision rounds beyond those included in scope. Null → unknown, not zero. */
  reworkRounds: number | null;
  /** Client accepted without a rework round. Null → unknown, not true. */
  acceptedFirstPass: boolean | null;
}

/**
 * How much a scorecard is worth. Bands, not a number, because a number invites
 * arithmetic on it.
 *
 * THRESHOLDS ARE A STATED PRIOR, REVIEWED QUARTERLY — NOT LEARNED. At ~29
 * engagements a year across the whole business, a single partner reaching n=8
 * takes years; nothing here can be fitted, and plan §7 says so explicitly
 * ("With ~29 outcomes a year, weights cannot be learned. They are a stated
 * prior, reviewed quarterly against won/lost"). The bands exist so a
 * 1-engagement partner is never displayed as proven.
 */
export type ScorecardConfidence = 'no_data' | 'anecdote' | 'indicative' | 'established';

export const SCORECARD_CONFIDENCE_LABEL: Record<ScorecardConfidence, string> = {
  no_data: 'No data',
  anecdote: 'Anecdote (1–2 engagements)',
  indicative: 'Indicative (3–7 engagements)',
  established: 'Established (8+ engagements)',
};

export interface PartnerScorecard {
  partnerId: string;
  /** Recorded outcomes for this partner. 0 is common and is reported as such. */
  sampleSize: number;
  confidence: ScorecardConfidence;
  /** 0–100, or null when no outcome recorded both a due date and a delivery date. */
  onTimeRate: number | null;
  onTimeSample: number;
  /** 0–100 share of engagements needing at least one unscoped rework round. */
  reworkRate: number | null;
  reworkSample: number;
  /** Money-weighted quoted gross margin %, or null. */
  marginQuotedPct: number | null;
  /** Money-weighted realised gross margin %, or null. */
  marginRealisedPct: number | null;
  /** realised − quoted, in percentage points. Negative = we lost margin. */
  marginDeltaPct: number | null;
  marginSample: number;
  /** 0–100 first-pass client acceptance, or null. */
  firstPassAcceptanceRate: number | null;
  firstPassSample: number;
  /**
   * Plain-language caveats, always populated. Contains the literal phrase
   * "no data" when there is none, so a surface cannot render a blank card as a
   * clean one.
   */
  notes: readonly string[];
}

function bandFor(n: number): ScorecardConfidence {
  if (n <= 0) return 'no_data';
  if (n <= 2) return 'anecdote';
  if (n <= 7) return 'indicative';
  return 'established';
}

const pct = (numerator: number, denominator: number): number =>
  Math.round((numerator / denominator) * 100);

/**
 * A PARTNER'S RECORD, DERIVED ENTIRELY FROM RECORDED OUTCOMES.
 *
 * Four metrics, each with its OWN sample size, because they have different
 * denominators: on-time needs a due date and a delivery date; realised margin
 * needs an actual invoice; first-pass acceptance needs someone to have recorded
 * it. Sharing one sample size across four metrics would let a 6-of-6 first-pass
 * record imply a 6-of-6 margin record.
 *
 * NO FLATTERING DEFAULTS ANYWHERE. Every metric is `null` when its denominator
 * is 0 and `notes` says so. "100% on time (n=1)" is already dangerous; "100% on
 * time (n=0)" would be a lie the bench gets staffed from.
 *
 * Margin is MONEY-WEIGHTED (Σ margin / Σ price), not the mean of per-engagement
 * percentages: averaging percentages lets a $2k diagnostic and a $25k white
 * paper count equally, and the $25k one is where the money is. Same
 * percent-of-price convention as `marginPct` (`types.ts:282`) so the two never
 * disagree.
 */
export function partnerScorecard(
  partnerId: string,
  outcomes: readonly RecordedOutcome[],
): PartnerScorecard {
  const mine = outcomes.filter((o) => o.partnerId === partnerId);
  const notes: string[] = [];

  if (mine.length === 0) {
    return {
      partnerId,
      sampleSize: 0,
      confidence: 'no_data',
      onTimeRate: null,
      onTimeSample: 0,
      reworkRate: null,
      reworkSample: 0,
      marginQuotedPct: null,
      marginRealisedPct: null,
      marginDeltaPct: null,
      marginSample: 0,
      firstPassAcceptanceRate: null,
      firstPassSample: 0,
      notes: ['no data — no recorded engagement outcomes for this partner'],
    };
  }

  // On time.
  const timed = mine.filter((o) => {
    if (o.dueAt == null || o.deliveredAt == null) return false;
    return Number.isFinite(Date.parse(o.dueAt)) && Number.isFinite(Date.parse(o.deliveredAt));
  });
  const onTimeCount = timed.filter((o) => Date.parse(o.deliveredAt as string) <= Date.parse(o.dueAt as string)).length;
  const onTimeRate = timed.length > 0 ? pct(onTimeCount, timed.length) : null;
  if (timed.length === 0) notes.push('no data on timeliness — no outcome records both a due date and a delivery date');

  // Rework: share of engagements that needed at least one unscoped round.
  const reworked = mine.filter((o) => o.reworkRounds != null && Number.isFinite(o.reworkRounds));
  const reworkRate = reworked.length > 0
    ? pct(reworked.filter((o) => (o.reworkRounds as number) > 0).length, reworked.length)
    : null;
  if (reworked.length === 0) notes.push('no data on rework — rework rounds were never recorded');

  // Margin, money-weighted.
  const priced = mine.filter((o) => {
    const price = o.finalPriceCents ?? o.quotedPriceCents;
    return o.actualVendorCostCents != null && Number.isFinite(price) && price > 0;
  });
  let sumPrice = 0;
  let sumQuotedMargin = 0;
  let sumRealisedMargin = 0;
  for (const o of priced) {
    const price = (o.finalPriceCents ?? o.quotedPriceCents) as number;
    sumPrice += price;
    sumQuotedMargin += marginCents(price, o.quotedVendorCostCents);
    sumRealisedMargin += marginCents(price, o.actualVendorCostCents as number);
  }
  const marginQuotedPct = priced.length > 0 ? pct(sumQuotedMargin, sumPrice) : null;
  const marginRealisedPct = priced.length > 0 ? pct(sumRealisedMargin, sumPrice) : null;
  const marginDeltaPct =
    marginQuotedPct != null && marginRealisedPct != null ? marginRealisedPct - marginQuotedPct : null;
  if (priced.length === 0) notes.push('no data on margin — no outcome records what the partner actually invoiced');

  // First-pass client acceptance.
  const judged = mine.filter((o) => o.acceptedFirstPass != null);
  const firstPassAcceptanceRate = judged.length > 0
    ? pct(judged.filter((o) => o.acceptedFirstPass === true).length, judged.length)
    : null;
  if (judged.length === 0) notes.push('no data on first-pass acceptance — never recorded');

  const confidence = bandFor(mine.length);
  if (confidence === 'anecdote') {
    notes.push(
      `low confidence: ${mine.length} recorded engagement${mine.length === 1 ? '' : 's'} — this is an anecdote, not a track record, and must not be ranked against a proven partner`,
    );
  }
  if (marginDeltaPct != null && marginDeltaPct < 0) {
    notes.push(`realised margin ran ${Math.abs(marginDeltaPct)} points below quote`);
  }

  return {
    partnerId,
    sampleSize: mine.length,
    confidence,
    onTimeRate,
    onTimeSample: timed.length,
    reworkRate,
    reworkSample: reworked.length,
    marginQuotedPct,
    marginRealisedPct,
    marginDeltaPct,
    marginSample: priced.length,
    firstPassAcceptanceRate,
    firstPassSample: judged.length,
    notes,
  };
}

/* ── Margin at risk, before acceptance ──────────────────────────────────── */

/**
 * The commercial facts of a quote, and nothing else. Not `GpsEngagement`
 * (`types.ts:317`): this engine must be callable on a quote that has never been
 * saved, which is the entire point of computing it BEFORE acceptance.
 */
export interface QuotedEngagement {
  offerKey: OfferKey;
  /** Price to the client, integer cents. */
  priceCents: number;
  /** Vendor cost as it appears on the quote, integer cents. */
  quotedVendorCostCents: number;
  /** ISO-4217, uppercase. Compared against the rate card — never converted. */
  currency: string;
  /**
   * Units this specific engagement needs, overriding the rate card's
   * `expectedUnits`. This is where a scope overrun becomes visible: the card says
   * 5 days, this job is 9, and the margin consequence appears at quote time.
   */
  expectedUnitsOverride?: number | null;
}

export type MarginVerdict =
  | 'not_capable'
  | 'no_rate_card'
  | 'cost_not_derivable'
  | 'currency_mismatch'
  | 'margin_intact'
  | 'margin_eroded'
  | 'margin_negative';

export interface MarginAtRisk {
  offerKey: OfferKey;
  partnerId: string;
  verdict: MarginVerdict;
  quotedPriceCents: number;
  quotedVendorCostCents: number;
  quotedMarginCents: number;
  quotedMarginPct: number | null;
  /** Cost implied by the partner's own rate card. Null when not derivable. */
  rateCardCostCents: number | null;
  impliedMarginCents: number | null;
  impliedMarginPct: number | null;
  /**
   * Quoted margin minus implied margin, integer cents. POSITIVE means the quote
   * claims more margin than the rate card supports — that is the money at risk.
   * Negative means the quote is conservative.
   */
  atRiskCents: number | null;
  /** Null when `asOf` was not supplied: staleness cannot be judged without a date. */
  rateCardStatus: RateCardStatus | null;
  stalenessEvaluated: boolean;
  reasons: readonly string[];
}

/**
 * WHAT THIS QUOTE'S MARGIN LOOKS LIKE AGAINST THE PARTNER'S OWN RATE CARD —
 * BEFORE anyone accepts it.
 *
 * The failure this exists to prevent: a $10–25k engagement quoted from a
 * remembered cost, delivered by a partner whose day rate implies something
 * higher, and the overrun discovered when the partner's invoice arrives. `47`
 * migrations of this platform had no margin column at all (`types.ts:158`); this
 * is the number that had nowhere to live.
 *
 * Refuses to invent anything:
 *  · not capable → `not_capable`, no numbers implied about a partner who cannot
 *    do the work.
 *  · no card, or a metered card with no unit count → `no_rate_card` /
 *    `cost_not_derivable`, and `atRiskCents` is `null`. NOT 0 — "no risk found"
 *    and "risk not computable" are opposite statements.
 *  · card in a different currency → `currency_mismatch`. There is no FX rate in
 *    this module and there must not be one: a pure function inventing a rate is
 *    a wrong invoice with extra steps. Convert upstream, deliberately, then call
 *    again.
 *
 * Staleness does NOT override the verdict, it travels beside it
 * (`rateCardStatus`): an expired card still tells you the direction of the risk,
 * and suppressing "this quote is $5,000 underwater" behind "the rate is old"
 * would hide the more urgent fact. Both are reported.
 */
export function marginAtRisk(
  engagement: QuotedEngagement,
  partner: Partner,
  opts: { asOf?: string } = {},
): MarginAtRisk {
  const reasons: string[] = [];
  const quotedMarginCents = marginCents(engagement.priceCents, engagement.quotedVendorCostCents);
  const quotedMarginPct = marginPct(engagement.priceCents, engagement.quotedVendorCostCents);
  const base = {
    offerKey: engagement.offerKey,
    partnerId: partner.id,
    quotedPriceCents: Math.round(engagement.priceCents),
    quotedVendorCostCents: Math.round(engagement.quotedVendorCostCents),
    quotedMarginCents,
    quotedMarginPct,
    rateCardCostCents: null as number | null,
    impliedMarginCents: null as number | null,
    impliedMarginPct: null as number | null,
    atRiskCents: null as number | null,
    rateCardStatus: null as RateCardStatus | null,
    stalenessEvaluated: opts.asOf != null,
  };

  const capable = partner.capabilities.some((c) => c.offerKey === engagement.offerKey);
  if (!capable) {
    reasons.push(`${partner.name} has no recorded capability for ${engagement.offerKey}; margin against their rate card is meaningless.`);
    return { ...base, verdict: 'not_capable', reasons };
  }

  const card = partner.rateCards.find((c) => c.offerKey === engagement.offerKey);
  if (!card) {
    reasons.push(`${partner.name} has no rate card for ${engagement.offerKey}, so the quoted cost of ${base.quotedVendorCostCents} cents is unverified. Margin risk is UNKNOWN, not zero.`);
    return { ...base, verdict: 'no_rate_card', reasons };
  }

  const status = opts.asOf != null ? rateCardStatus(card, opts.asOf) : null;
  if (status === 'expired') {
    reasons.push(`Rate card expired ${card.validUntil}; the implied cost below is the last rate the partner confirmed, not a current one.`);
  } else if (status === 'no_validity_stated') {
    reasons.push('Rate card states no validity date, so it cannot be treated as current — re-confirm before quoting.');
  }

  if (card.currency.toUpperCase() !== engagement.currency.toUpperCase()) {
    reasons.push(`Quote is in ${engagement.currency.toUpperCase()} and the rate card is in ${card.currency.toUpperCase()}. No FX conversion is performed here; convert upstream and re-run.`);
    return { ...base, rateCardStatus: status, verdict: 'currency_mismatch', reasons };
  }

  // The override is what makes a scope overrun visible before acceptance.
  const units = engagement.expectedUnitsOverride ?? card.expectedUnits;
  const effectiveCard: RateCard = { ...card, expectedUnits: units };
  const cost = rateCardCostCents(effectiveCard);
  if (cost == null) {
    reasons.push(`${RATE_UNIT_LABEL[card.unit]} card with no unit count for this engagement — the implied cost cannot be derived. Supply expectedUnits rather than guessing.`);
    return { ...base, rateCardStatus: status, verdict: 'cost_not_derivable', reasons };
  }
  if (engagement.expectedUnitsOverride != null && card.expectedUnits != null && engagement.expectedUnitsOverride !== card.expectedUnits) {
    reasons.push(`This engagement is scoped at ${engagement.expectedUnitsOverride} units against a card assuming ${card.expectedUnits}.`);
  }

  const impliedMarginCents = marginCents(engagement.priceCents, cost);
  const impliedMarginPct = marginPct(engagement.priceCents, cost);
  const atRiskCents = quotedMarginCents - impliedMarginCents;

  let verdict: MarginVerdict;
  if (impliedMarginCents < 0) {
    verdict = 'margin_negative';
    reasons.push(`At the partner's own rate this engagement LOSES ${Math.abs(impliedMarginCents)} cents. Do not accept at this price.`);
  } else if (atRiskCents > 0) {
    verdict = 'margin_eroded';
    reasons.push(`Rate card implies ${cost} cents of cost against ${base.quotedVendorCostCents} quoted: ${atRiskCents} cents of margin at risk.`);
  } else {
    verdict = 'margin_intact';
    reasons.push(atRiskCents === 0
      ? 'Quoted cost matches the rate card exactly.'
      : `Quote is conservative: the rate card implies ${Math.abs(atRiskCents)} cents LESS cost than quoted.`);
  }

  return {
    ...base,
    rateCardCostCents: cost,
    impliedMarginCents,
    impliedMarginPct,
    atRiskCents,
    rateCardStatus: status,
    verdict,
    reasons,
  };
}
