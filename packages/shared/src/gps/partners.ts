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
 *  THE BENCH IS A TABLE NOW, AND THIS FILE IS STILL ONLY THE DOMAIN MODEL.
 * ══════════════════════════════════════════════════════════════════════════════
 *  UPDATED 2026-08-07, when the owner answered the decision this file was written
 *  against: A NAMED HUMAN MAY ASSERT A PARTNER NAME AND RATE CARD, ATTRIBUTED TO
 *  THEM. `gps_partner_registry` (`0075_gps_partner_registry.sql`) is that answer as
 *  rows — the DELIVERY bench, keyed by the same text `partner_id` that
 *  `gps_rate_card` (`0052:56`) already carries, so nothing had to be re-keyed.
 *
 *  IT IS STILL NOT A THIRD COPY OF `partners`. The paragraph below refused a third
 *  partner table and the refusal held for as long as its premise did: there was
 *  nothing a delivery partner had that a referral counterparty did not, so a second
 *  population was unjustified. That premise is gone. A delivery partner carries an
 *  ASSERTION (who put them on the bench, when, on what basis), a per-offer rate card
 *  with an expiry, and a concurrency cap — none of which `partners`
 *  (`0024_dealdesk_ext.sql:66`, five columns, `commission_pct`) can hold, and the
 *  one thing it does hold, a commission on a referral, is meaningless here. Bolting
 *  three shapes onto a table joined by `referrals.partner_id` would have made every
 *  referral row a half-filled bench member. The registry links to `partners` INSTEAD
 *  of absorbing it: `bd_partner_id` is a nullable reference for the case where one
 *  legal entity is both, and NULL there means NOBODY STATED A LINK — never "these
 *  are different people".
 *
 *  Nothing in this file performs or implies I/O: no DB, no fetch, no clock (see the
 *  `asOf` discipline note below), no LLM.
 *
 *  Two partner tables already existed when this was written:
 *    · `partners`         — `apps/api/src/db/migrations/0024_dealdesk_ext.sql:66`
 *                           (id, name, type, commission_pct, contact) — the
 *                           referral/reseller bench, already joined by
 *                           `referrals.partner_id` (`0024_dealdesk_ext.sql:79`).
 *    · `command_partners` — `apps/api/src/db/migrations/0040_command.sql:29`
 *                           (LiquidityProvider | Bank | Custodian …) — the LCX
 *                           COMMAND counterparty bench, a different population.
 *  The plan said so too (§5 "Extensions": "`partners`
 *  (`0024_dealdesk_ext.sql:66`) gains capability, rate card, capacity"; §5 "Cut or
 *  deferred" lists `partner` (third table), `partner_capability` and
 *  `commercial_quote` as CUT). That plan predates the owner's decision, and it is
 *  recorded here rather than quietly overwritten: the registry is a DEPARTURE from
 *  §5, taken deliberately, for the reason in the block above.
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
 *
 * ZERO IS A REFUSAL, NOT A FREE PARTNER. `amountCents <= 0` returns null. A rate
 * card of 0 is an unfilled form, never a partner working for nothing, and the
 * consequence of reading it literally is the worst output this file can produce:
 * cost 0 → 100% margin → `margin_intact` → "Quote is conservative" on a
 * proposal, and in `underwrite.ts` a p50 margin equal to the whole price with
 * pLoss 0 and nothing blocked. Round-to-zero is caught too: a metered card at
 * 0.4c/unit with 1 unit would otherwise price at exactly 0 cents. Placeholders
 * use a NEGATIVE sentinel (`underwrite.ts` docblock) precisely so that a
 * not-yet-known rate can never be mistaken for a known-free one; this guard is
 * what makes both directions refuse instead of only one.
 *
 * THE COVERAGE IS ONLY AS WIDE AS THE CALLERS, and this docblock previously
 * implied otherwise. The round-to-zero guard lives HERE; it protects nothing in a
 * caller that re-implements the test. `underwrite.ts` did exactly that on the
 * metered branch — a bare `amountCents <= 0` — so a 0.0001c/day card skipped this
 * function entirely and underwrote at 100% margin with pLoss 0, the precise
 * outcome the paragraph above says is refused. That branch now derives its rate
 * through this function (`underwrite.ts:443`, `expectedUnits: 1` = the cost of one
 * unit). Anything that needs the guarantee must ask this function for the number
 * rather than inspect `amountCents` and decide for itself.
 */
export function rateCardCostCents(card: RateCard): number | null {
  if (!Number.isFinite(card.amountCents) || card.amountCents <= 0) return null;
  if (card.unit === 'fixed') {
    const fee = Math.round(card.amountCents);
    return fee > 0 ? fee : null;
  }
  const units = card.expectedUnits;
  if (units == null || !Number.isFinite(units) || units <= 0) return null;
  const cost = Math.round(card.amountCents * units);
  return cost > 0 ? cost : null;
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
 * WHO PUT THIS PARTNER ON THE BENCH, WHEN, AND ON WHAT BASIS.
 *
 * The owner answered the decision that blocked the bench on 2026-08-07: A NAMED
 * HUMAN MAY ASSERT A PARTNER NAME AND RATE CARD, ATTRIBUTED TO THEM. This type is
 * that answer, and the attribution is the whole of it rather than metadata around
 * it — the decision was not "partners may exist", it was "a partner exists BECAUSE
 * a named person said so, and the record says who".
 *
 * WHY `basis` IS REQUIRED AND IS NOT AN ENUM. Every figure downstream of a partner
 * — the margin at risk, the price floor, the bench headroom that caps the business
 * — rests on somebody's claim that this person will deliver this work at this rate.
 * When a partner misses, the only route to a corrected prior is the sentence that
 * says WHY they were believed in the first place ("delivered the Cardano paper in
 * March", "counsel's own recommendation, unverified"). An enum would compress that
 * to a category and lose the only part a reviewer can argue with. Free text is
 * therefore deliberate, and blank is refused rather than defaulted.
 *
 * WHAT THIS IS NOT. It is not a verification, not a reference check, and not a
 * claim that the basis is TRUE. `PARTNER_ASSERTION_IS_A_CLAIM` says so in a string
 * a surface can render, because "asserted by Nik on 7 Aug" reads as provenance and
 * a reader will supply the confidence that nobody wrote down.
 */
export interface PartnerAssertion {
  /** A NAMED HUMAN. Never a service account, never a body field the caller chose. */
  assertedBy: string;
  /** ISO instant the assertion was recorded. */
  assertedAt: string;
  /** On what basis — free text, required, never blank. See the docblock. */
  basis: string;
}

/**
 * Greppable honesty marker, in the manner of `PRICE_BANDS_ARE_PLACEHOLDERS`
 * (`catalogue.ts:58`). Exported so a surface renders the caveat from data rather
 * than from a sentence somebody remembered to type.
 */
export const PARTNER_ASSERTION_IS_A_CLAIM =
  'A partner on this bench is ASSERTED BY A NAMED HUMAN, not verified. The attribution records who '
  + 'believed it and on what basis; it is not a reference check, not a credential, and not evidence '
  + 'that the basis is true. Every figure derived from this partner inherits that limit.';

/** One thing wrong with an assertion. One code per distinguishable cause. */
export type PartnerAssertionDefectCode =
  | 'PARTNER_NAME_BLANK'
  | 'PARTNER_ID_BLANK'
  | 'PARTNER_ASSERTED_BY_BLANK'
  | 'PARTNER_ASSERTED_AT_BLANK'
  | 'PARTNER_ASSERTED_AT_UNPARSEABLE'
  | 'PARTNER_ASSERTION_BASIS_BLANK';

export interface PartnerAssertionDefect {
  code: PartnerAssertionDefectCode;
  field: 'id' | 'name' | 'assertedBy' | 'assertedAt' | 'basis';
  sentence: string;
}

const blank = (v: unknown): boolean => typeof v !== 'string' || v.trim() === '';

/**
 * EVERY defect, not the first — the house pattern (`marks/mark.ts`,
 * `routes/marketingDesk.ts:1207`). A human told only that the basis is missing,
 * who fixes it and is then told the date is unparseable, learns to submit twice
 * rather than to fill the form in.
 *
 * Returns `[]` for a well-formed assertion. THE CALLER DECIDES what to do with a
 * defect; this function neither throws nor repairs, because a repaired assertion
 * ("asserted by unknown") is exactly the unattributed row the database CHECK and
 * this function both exist to make impossible.
 */
export function partnerAssertionDefects(
  partner: { id: string; name: string; assertion: PartnerAssertion },
): readonly PartnerAssertionDefect[] {
  const out: PartnerAssertionDefect[] = [];
  if (blank(partner.id)) {
    out.push({ code: 'PARTNER_ID_BLANK', field: 'id', sentence: 'A partner needs an id: it is the key every rate card and every engagement joins on.' });
  }
  if (blank(partner.name)) {
    out.push({ code: 'PARTNER_NAME_BLANK', field: 'name', sentence: 'A partner needs a name a human recognises. An id alone cannot be checked against a memory.' });
  }
  const a = partner.assertion;
  if (a == null || blank(a.assertedBy)) {
    out.push({ code: 'PARTNER_ASSERTED_BY_BLANK', field: 'assertedBy', sentence: 'No named human asserted this partner. An unattributed bench member is a cost basis nobody stands behind.' });
  }
  if (a == null || blank(a.assertedAt)) {
    out.push({ code: 'PARTNER_ASSERTED_AT_BLANK', field: 'assertedAt', sentence: 'No date of assertion. Without one nothing can say how old the claim is, and staleness is the failure mode a bench has.' });
  } else if (!Number.isFinite(Date.parse(a.assertedAt))) {
    out.push({ code: 'PARTNER_ASSERTED_AT_UNPARSEABLE', field: 'assertedAt', sentence: `"${a.assertedAt}" is not a date this system can read. It is refused rather than interpreted.` });
  }
  if (a == null || blank(a.basis)) {
    out.push({ code: 'PARTNER_ASSERTION_BASIS_BLANK', field: 'basis', sentence: 'No basis stated. When this partner misses, the basis is the only thing a reviewer can argue with.' });
  }
  return out;
}

/** True when the assertion carries who, when and on what basis, all three. */
export function isAssertedPartner(
  partner: { id: string; name: string; assertion: PartnerAssertion },
): boolean {
  return partnerAssertionDefects(partner).length === 0;
}

/**
 * A bench member. Persisted in `gps_partner_registry`
 * (`0075_gps_partner_registry.sql`) — see the file header. `id` is that row's
 * `partner_id`, the SAME text key `gps_rate_card.partner_id` (`0052:56`) already
 * carries, so no rate card had to be re-keyed for the registry to exist.
 */
export interface Partner {
  id: string;
  name: string;
  /**
   * WHO SAID THIS PARTNER EXISTS. Required, not optional: an optional attribution
   * is one that is absent on the rows that matter. `gps_partner_registry` enforces
   * the same rule with NOT NULL + CHECK rather than by convention.
   */
  assertion: PartnerAssertion;
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
 * THE COMPILED BENCH IS EMPTY, PERMANENTLY, AND THAT IS NOW A DESIGN RATHER THAN A
 * BLOCKED DECISION.
 *
 * It used to say "D5 is unanswered". D5 is answered — a named human may assert a
 * partner — and the answer did NOT fill this array. Names arrive as ROWS in
 * `gps_partner_registry`, because a partner asserted in compiled code carries no
 * assertion: there is nobody to attribute a constant to, and `git blame` is not an
 * attribution a screen can render or a reviewer can challenge.
 *
 * Exported as a real empty array, not omitted, so a surface can render "no compiled
 * bench" from data instead of from a hard-coded string, and so
 * `benchHeadroom(OFFER_KEYS, PARTNER_BENCH, [])` honestly returns 0 everywhere with
 * the reason `no_capable_partner` for any caller that has not loaded the registry.
 *
 * A CALLER PASSING THIS WHERE IT MEANT TO PASS THE REGISTRY GETS ZERO, NOT AN
 * ERROR, and that is the one hazard of the shape. It is why `benchHeadroom` reports
 * `No partner on the bench can deliver …` rather than a bare 0, and why the API
 * loader (`apps/api/src/gps/partnerRegistry.ts`) distinguishes a registry that was
 * NOT LOADED from one that is genuinely empty.
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

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FLOOR — the lowest price at which this partner, on this offer, does not */
/* lose money. And the twenty ways it refuses to be one.                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  WHY THE FLOOR IS THE MOST DANGEROUS NUMBER IN THIS SYSTEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `loop.ts:1123` has said since Phase 12 that the margin-below-floor monitor is
 *  registered DISABLED because "A HUMAN MUST SUPPLY THE FLOOR … 0 is a stand-in for
 *  'at least do not lose money', not a policy". With an asserted partner and a real
 *  rate card the floor becomes computable, and the moment it is computable it
 *  becomes quotable — which is the hazard. A floor reads as a POLICY MINIMUM. Nobody
 *  discounts below one. If it were arithmetic over the shipped placeholders
 *  (`TODO_EFFORT_DAYS`, `underwrite.ts:128`, wide by design and stamped
 *  `statedBy: 'system:placeholder'`), the desk would be holding a line invented by a
 *  literal in a source file, and the label on it would be read once and then never
 *  again.
 *
 *  So this function REFUSES far more often than it answers, and it refuses with a
 *  code that names the missing input and the person who alone can supply it. Twenty
 *  codes, because "no floor" is only useful if it says WHICH no:
 *  `FLOOR_RATE_CARD_ABSENT` is a conversation with a partner,
 *  `FLOOR_EFFORT_IS_PLACEHOLDER` is a conversation with the founder, and
 *  `FLOOR_RATE_CARD_EXPIRED` is a diary entry that was missed.
 *
 *  ── WHAT IT COVERS, AND WHAT IT DOES NOT ────────────────────────────────────
 *  The floor is ONE PARTNER'S COST FOR ONE ENGAGEMENT OF ONE OFFER. It is not a
 *  break-even price for the business: it contains no overhead, no unbilled founder
 *  time, no payment-terms cost, no tax, and no allowance for the rework a fixed
 *  scope absorbs. `frame.excludes` carries that list to the screen, because a number
 *  called "floor" with none of those in it will otherwise be read as one that has
 *  them.
 *
 *  ── AND IT IS THE COST SIDE ONLY ────────────────────────────────────────────
 *  Nothing here reads a price band. `PRICE_BANDS_ARE_PLACEHOLDERS` is still true and
 *  this function does not touch it, does not import `catalogue.ts`, and cannot flip
 *  it. A floor is what we must not go below; a band is what we intend to charge, and
 *  a real floor beside a placeholder band is exactly the honest half-state this
 *  programme is in.
 */

/**
 * WHICH POINT OF THE EFFORT TRIPLE THE FLOOR IS COMPUTED AT — stated by the caller,
 * never defaulted.
 *
 * `optimistic` IS DELIBERATELY NOT AN OPTION. A floor computed from the best case is
 * a floor that loses money in the ordinary case, and it is the one a salesperson
 * under pressure would reach for. The type makes it unreachable rather than
 * discouraged. `likely` is the mode — the ordinary engagement — and `pessimistic` is
 * the one to hold a line at when a scope overrun would be fatal; the choice belongs
 * to the human pricing the deal, and the answer says which was used.
 */
export type FloorEffortPoint = 'likely' | 'pessimistic';

export const FLOOR_EFFORT_POINTS: readonly FloorEffortPoint[] = ['likely', 'pessimistic'] as const;

export const FLOOR_EFFORT_POINT_LABEL: Record<FloorEffortPoint, string> = {
  likely: 'Likely (the mode)',
  pessimistic: 'Pessimistic (it goes wrong in the ordinary ways)',
};

/**
 * An effort triple, STRUCTURALLY. Field-for-field compatible with `EffortTriple`
 * (`underwrite.ts:99`) and deliberately not an import of it: `underwrite.ts`
 * imports this module, so naming its type here would close a cycle. A type-only
 * import is erased and would be harmless at runtime, but the cycle would be real for
 * anyone who later needed a value from it, and the first person to need one would
 * discover it in a Docker emit rather than here. Callers pass an `EffortTriple`
 * directly; TypeScript's structural typing accepts it with no cast.
 */
export interface FloorEffortInput {
  offerKey: OfferKey;
  optimisticDays: number;
  likelyDays: number;
  pessimisticDays: number;
  statedBy: string;
  statedAt: string;
  /** TRUE while this is the shipped placeholder rather than a human-supplied figure. */
  isPlaceholder: boolean;
}

/**
 * THE THREE STATES, NEVER COLLAPSED — the shape every input to the floor arrives in.
 *
 * Same vocabulary as `intel/witnesses.ts:143` (`not_loaded` / `withheld` / absent)
 * and a separate declaration for the same reason that file gives: a `WitnessReading`
 * carries a numeric value, an Admiralty reliability and an observation instant, none
 * of which a rate card has. What is shared is the DISCIPLINE, and it is the reason
 * this is a discriminated union rather than `T | null`:
 *
 *   · `not_loaded`  the query was never run. A caller that forgot to load the
 *                   registry must not be told the partner has no rate card.
 *   · `withheld`    it exists and this caller may not see it. Collapsing this into
 *                   `empty` turns a need-to-know boundary into a data gap, and a
 *                   data gap invites somebody to go and "fix" it by entering one.
 *   · `empty`       it was looked for and is genuinely not there. The only one of
 *                   the three that is a conversation with a partner.
 */
export type SuppliedInput<T> =
  | { readonly state: 'loaded'; readonly value: T }
  | { readonly state: 'not_loaded'; readonly note: string }
  | { readonly state: 'withheld'; readonly note: string }
  | { readonly state: 'empty'; readonly note: string };

export const inputLoaded = <T>(value: T): SuppliedInput<T> => ({ state: 'loaded', value });
export const inputNotLoaded = <T>(note: string): SuppliedInput<T> => ({ state: 'not_loaded', note });
export const inputWithheld = <T>(note: string): SuppliedInput<T> => ({ state: 'withheld', note });
export const inputEmpty = <T>(note: string): SuppliedInput<T> => ({ state: 'empty', note });

/**
 * WHY A FLOOR IS NOT AVAILABLE. Twenty codes, one per distinguishable cause,
 * because the remedy differs for every one of them and a shared code would send the
 * desk to the wrong person.
 */
export type FloorRefusalCode =
  /* The frame itself. */
  | 'FLOOR_ENVIRONMENT_UNSTATED'
  | 'FLOOR_AS_OF_ABSENT'
  /* The partner. */
  | 'FLOOR_PARTNER_NOT_ASSERTED'
  | 'FLOOR_PARTNER_NOT_CAPABLE'
  /* The rate card — three absence states, then three usability states. */
  | 'FLOOR_RATE_CARD_NOT_LOADED'
  | 'FLOOR_RATE_CARD_WITHHELD'
  | 'FLOOR_RATE_CARD_ABSENT'
  | 'FLOOR_RATE_CARD_OFFER_MISMATCH'
  | 'FLOOR_RATE_CARD_EXPIRED'
  | 'FLOOR_RATE_CARD_NO_VALIDITY'
  | 'FLOOR_RATE_CARD_CURRENCY_MISMATCH'
  | 'FLOOR_RATE_NOT_DERIVABLE'
  /* The effort triple — the same three absence states, then two usability ones. */
  | 'FLOOR_EFFORT_NOT_LOADED'
  | 'FLOOR_EFFORT_WITHHELD'
  | 'FLOOR_EFFORT_ABSENT'
  | 'FLOOR_EFFORT_IS_PLACEHOLDER'
  | 'FLOOR_EFFORT_OFFER_MISMATCH'
  | 'FLOOR_EFFORT_UNUSABLE'
  /* The two numbers that live on the card row and are not on `RateCard`. */
  | 'FLOOR_HOURS_PER_DAY_ABSENT'
  | 'FLOOR_PASS_THROUGH_UNUSABLE';

export const FLOOR_REFUSAL_CODES: readonly FloorRefusalCode[] = [
  'FLOOR_ENVIRONMENT_UNSTATED', 'FLOOR_AS_OF_ABSENT',
  'FLOOR_PARTNER_NOT_ASSERTED', 'FLOOR_PARTNER_NOT_CAPABLE',
  'FLOOR_RATE_CARD_NOT_LOADED', 'FLOOR_RATE_CARD_WITHHELD', 'FLOOR_RATE_CARD_ABSENT',
  'FLOOR_RATE_CARD_OFFER_MISMATCH', 'FLOOR_RATE_CARD_EXPIRED', 'FLOOR_RATE_CARD_NO_VALIDITY',
  'FLOOR_RATE_CARD_CURRENCY_MISMATCH', 'FLOOR_RATE_NOT_DERIVABLE',
  'FLOOR_EFFORT_NOT_LOADED', 'FLOOR_EFFORT_WITHHELD', 'FLOOR_EFFORT_ABSENT',
  'FLOOR_EFFORT_IS_PLACEHOLDER', 'FLOOR_EFFORT_OFFER_MISMATCH', 'FLOOR_EFFORT_UNUSABLE',
  'FLOOR_HOURS_PER_DAY_ABSENT', 'FLOOR_PASS_THROUGH_UNUSABLE',
] as const;

/**
 * The rule a refusal cites. Same shape and same instrument as `MarkRuleCitation`
 * (`marks/mark.ts:299`), declared here rather than imported because `marks/` is the
 * closed-book pricing compartment and GPS does not depend on it — the alternative
 * was a dependency edge between two compartments for four string constants.
 */
export interface FloorRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

const RULE_ABSENT_REFUSES: FloorRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never a default, never an estimate. A refusal '
    + 'carries a stable code and cites the rule it applies.',
};

const RULE_THREE_STATES: FloorRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'three states are never collapsed',
  text: 'Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty.',
};

const RULE_NO_LAUNDERING: FloorRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. A placeholder that has been through '
    + 'arithmetic is still a placeholder, and a floor is read as a policy.',
};

const RULE_ENVIRONMENT_LABEL: FloorRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an environment label',
  text: 'Every figure carries an observation frame and an environment label where it came from a '
    + 'database.',
};

const RULE_ATTRIBUTION: FloorRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'a partner is asserted by a named human',
  text: 'A partner and a rate card are ASSERTED BY A NAMED HUMAN and the record carries who, when '
    + 'and on what basis. An unattributed assertion is not a weaker record; it is not a record.',
};

/** Who alone can close this gap. Not a role in the app — a person on a phone. */
export type FloorRemedyOwner = 'the partner' | 'the founder' | 'the desk' | 'the server';

export interface FloorRefusal {
  readonly code: FloorRefusalCode;
  /** One sentence, to the operator, active voice. Names the partner and the offer. */
  readonly sentence: string;
  readonly rule: FloorRuleCitation;
  /** The input that is missing, named as the person who supplies it would name it. */
  readonly missing: string;
  readonly remedyOwner: FloorRemedyOwner;
  /** `null` only where no database was involved at all. */
  readonly environment: string | null;
}

/**
 * WHAT THE FLOOR COULD AND COULD NOT SEE. Carried on every floor; a floor with no
 * frame does not render, the same discipline `MarkObservationFrame`
 * (`marks/mark.ts:372`) applies to a quantile.
 */
export interface FloorObservationFrame {
  /** Which database the rate card and the effort triple were read from. Never empty. */
  readonly environment: string;
  /** The instant the expiry was judged against. Never the process clock. */
  readonly asOf: string;
  readonly offerKey: OfferKey;
  readonly partnerId: string;
  readonly partnerName: string;
  /** WHO PUT THIS PARTNER ON THE BENCH — carried onto every figure derived from them. */
  readonly assertedBy: string;
  readonly assertedAt: string;
  readonly assertionBasis: string;
  readonly assertionIsAClaim: typeof PARTNER_ASSERTION_IS_A_CLAIM;
  /** The card, as it was read. */
  readonly rateUnit: RateUnit;
  readonly rateAmountCents: number;
  readonly rateStatedBy: string;
  readonly rateStatedAt: string;
  readonly rateValidUntil: string;
  readonly rateCardStatus: RateCardStatus;
  /**
   * `null` for a `fixed` card, and the null is a FACT rather than a gap: a fixed fee
   * is the cost of the engagement whatever the effort, so the triple never entered
   * the arithmetic and its placeholder status is irrelevant to this figure.
   */
  readonly effortPoint: FloorEffortPoint | null;
  readonly effortDays: number | null;
  readonly effortStatedBy: string | null;
  readonly effortStatedAt: string | null;
  /** Hours per partner-day. Non-null only for an `hourly` card. */
  readonly hoursPerDay: number | null;
  /** Units the rate was multiplied by. `null` for a fixed fee. */
  readonly unitsCharged: number | null;
  /** Pass-through that does not scale with effort, e.g. counsel's own fee. */
  readonly passThroughCents: number;
  readonly method: 'rate_card_unit_cost × effort_at_stated_point + pass_through';
  /** Named on screen so the floor is not read as a break-even for the business. */
  readonly excludes: readonly string[];
}

/**
 * The floor, in integer cents, in the CARD'S currency — which is checked against the
 * quote's rather than converted.
 */
export interface PriceFloor {
  readonly kind: 'floor';
  readonly floorCents: number;
  readonly currency: string;
  readonly frame: FloorObservationFrame;
  /** Plain sentences for a human. Never empty. */
  readonly reasons: readonly string[];
}

export type PriceFloorOutcome =
  | PriceFloor
  | { readonly kind: 'refused'; readonly refusals: readonly FloorRefusal[] };

export function isPriceFloor(o: PriceFloorOutcome): o is PriceFloor {
  return o.kind === 'floor';
}

/**
 * Everything the floor needs, and NOTHING it could choose for itself.
 *
 * Note what is absent: no amount, no rate, no day count, no currency conversion and
 * no clock. Every number comes from a row a named human wrote, and the two the
 * CALLER supplies — `asOf` and `environment` — are the two the caller alone can know
 * and are both refused when absent.
 */
export interface PriceFloorRequest {
  readonly offerKey: OfferKey;
  /** The partner, as asserted. `assertion` is checked, not assumed. */
  readonly partner: Partner;
  /**
   * The rate card for this (partner, offer). Three-state: a registry that was never
   * queried is not a partner without a rate.
   */
  readonly card: SuppliedInput<RateCard>;
  /**
   * Hours per partner-day, from the card row (`gps_rate_card.hours_per_day`,
   * `0052:86`). Consulted ONLY for an `hourly` card. It lives on the card and never
   * on the request in the API, for the reason 0052 gives: a caller-supplied 8 is an
   * invented number on a proposal, and a caller who wanted a cheaper floor would
   * supply 1.
   */
  readonly hoursPerDay: SuppliedInput<number>;
  /**
   * Pass-through cost that does not scale with effort, integer cents
   * (`gps_rate_card.fixed_cost_cents`, `0052:91`). The column is NOT NULL DEFAULT 0
   * and 0 there is a truthful "no pass-through" written by the person who entered
   * the card — which is why a loaded 0 is accepted here while a NOT LOADED one
   * refuses.
   */
  readonly passThroughCents: SuppliedInput<number>;
  /** Partner-days per engagement of this offer. Three-state, and a placeholder refuses. */
  readonly effort: SuppliedInput<FloorEffortInput>;
  readonly effortPoint: FloorEffortPoint;
  /** The currency the floor is wanted in. Compared to the card's; NEVER converted. */
  readonly quoteCurrency: string;
  /** ISO instant the expiry is judged at. `null` refuses — see `FLOOR_AS_OF_ABSENT`. */
  readonly asOf: string | null;
  /** e.g. `supabase:db.xxxx.supabase.co/postgres`. `null` refuses. */
  readonly environment: string | null;
}

/**
 * What a floor is NOT, carried to the screen as data. Every line is a real cost this
 * arithmetic does not contain.
 */
export const FLOOR_EXCLUDES: readonly string[] = [
  'No overhead, no software, no insurance and no cost of capital.',
  'No unbilled founder time — selling, scoping, coordination and the readout are not in any rate card.',
  'No allowance for rework absorbed inside a fixed scope, which is where a fixed-price engagement usually loses.',
  'No tax, no payment-processing cost and no cost of late payment terms.',
  'No currency movement: the floor is in the card\'s currency and nothing here converts.',
  'Nothing about what the client will pay. This is the cost side; the price band is a separate, still-placeholder number.',
];

const finitePositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Appended to every refusal that leaves the card's UNIT unknown.
 *
 * Whether an effort triple is needed at all depends on the unit — a fixed fee needs
 * none — so with no card the effort checks are skipped, and a refusal list that
 * silently stops early teaches the desk that this surface reveals one obstacle per
 * attempt. It says so instead.
 */
const CARD_UNKNOWN_UNIT_NOTE =
  ' The card\'s unit is unknown, so whether an effort triple is even needed cannot be checked yet: '
  + 'this list of refusals is not exhaustive.';

/**
 * THE LOWEST PRICE AT WHICH THIS OFFER, DELIVERED BY THIS PARTNER, DOES NOT LOSE
 * MONEY — or every reason it cannot be computed.
 *
 * EVERY refusal is returned, not the first one found. An operator told only that the
 * rate card is missing, who obtains it and is then told the effort triple is a
 * placeholder, learns that the system reveals one obstacle per attempt — and starts
 * routing around it rather than through it.
 *
 * The arithmetic, stated plainly, for the three units:
 *   fixed     floor = amountCents + passThrough                    (effort unused)
 *   day_rate  floor = round(amountCents × days@point) + passThrough
 *   hourly    floor = round(amountCents × days@point × hoursPerDay) + passThrough
 * where `days@point` is `likelyDays` or `pessimisticDays` as the caller stated, and
 * the multiplication goes through `rateCardCostCents` rather than being written out
 * here — that function owns the zero and round-to-zero guards, and a second copy of
 * a guard is the copy that rots (`rateCardCostCents`, the "COVERAGE IS ONLY AS WIDE
 * AS THE CALLERS" paragraph).
 */
export function priceFloor(req: PriceFloorRequest): PriceFloorOutcome {
  const refusals: FloorRefusal[] = [];
  const env = req.environment != null && req.environment.trim() !== '' ? req.environment.trim() : null;
  const partnerLabel = req.partner?.name?.trim() || req.partner?.id || 'this partner';

  const refuse = (
    code: FloorRefusalCode,
    sentence: string,
    rule: FloorRuleCitation,
    missing: string,
    remedyOwner: FloorRemedyOwner,
  ): void => {
    refusals.push({ code, sentence, rule, missing, remedyOwner, environment: env });
  };

  /* ── The frame, first. A figure with no environment does not exist. ─────── */
  if (env === null) {
    refuse(
      'FLOOR_ENVIRONMENT_UNSTATED',
      'No floor is quoted: nothing recorded which database the rate card was read from. A cost basis '
      + 'whose environment nobody can name may have come from a developer\'s laptop.',
      RULE_ENVIRONMENT_LABEL,
      'the environment label of the connection the rows were read on',
      'the server',
    );
  }
  const asOf = typeof req.asOf === 'string' && Number.isFinite(Date.parse(req.asOf)) ? req.asOf : null;
  if (asOf === null) {
    refuse(
      'FLOOR_AS_OF_ABSENT',
      'No floor is quoted: no instant was supplied to judge the rate card\'s expiry against. Elsewhere in '
      + 'this module a missing `asOf` SKIPS the staleness check and says it skipped it; a floor may not, '
      + 'because a floor is held to as a policy and an expired rate silently becomes one.',
      RULE_ABSENT_REFUSES,
      'the instant to evaluate the rate card against (asOf)',
      'the server',
    );
  }

  /* ── The partner, and the attribution that is the point of them. ────────── */
  const assertionDefects = partnerAssertionDefects(req.partner);
  if (assertionDefects.length > 0) {
    refuse(
      'FLOOR_PARTNER_NOT_ASSERTED',
      `No floor is quoted for ${partnerLabel}: the bench record is not properly asserted `
      + `(${assertionDefects.map((d) => d.code).join(', ')}). A cost basis nobody stands behind cannot `
      + 'become a price nobody may go below.',
      RULE_ATTRIBUTION,
      assertionDefects.map((d) => d.field).join(', '),
      'the desk',
    );
  }

  const capable = req.partner?.capabilities?.some((c) => c.offerKey === req.offerKey) === true;
  if (!capable) {
    refuse(
      'FLOOR_PARTNER_NOT_CAPABLE',
      `No floor is quoted: ${partnerLabel} has no recorded capability for ${req.offerKey}, so the cost of `
      + 'them delivering it is not a fact this system holds.',
      RULE_ABSENT_REFUSES,
      `a recorded capability for ${req.offerKey} on this partner`,
      'the desk',
    );
  }

  /* ── The rate card: three absence states, then usability. ───────────────── */
  let card: RateCard | null = null;
  if (req.card.state === 'not_loaded') {
    refuse(
      'FLOOR_RATE_CARD_NOT_LOADED',
      `No floor is quoted: the rate card registry was never read on this request, so nothing here knows `
      + `whether ${partnerLabel} has a rate for ${req.offerKey}. This is NOT "they have no rate card".`
      + CARD_UNKNOWN_UNIT_NOTE,
      RULE_THREE_STATES,
      req.card.note,
      'the server',
    );
  } else if (req.card.state === 'withheld') {
    refuse(
      'FLOOR_RATE_CARD_WITHHELD',
      `No floor is quoted: a rate card exists for ${partnerLabel} on ${req.offerKey} and this caller may not `
      + 'see it. Nothing is missing from the record — the gap is in the clearance, and entering a second '
      + 'card to work around it would put two cost bases on one partner.' + CARD_UNKNOWN_UNIT_NOTE,
      RULE_THREE_STATES,
      req.card.note,
      'the desk',
    );
  } else if (req.card.state === 'empty') {
    refuse(
      'FLOOR_RATE_CARD_ABSENT',
      `No floor is quoted: ${partnerLabel} has no rate card for ${req.offerKey}. Nobody has said what they `
      + 'charge, so there is no number below which this engagement loses money — there is no number at all.'
      + CARD_UNKNOWN_UNIT_NOTE,
      RULE_ABSENT_REFUSES,
      `a rate card for ${partnerLabel} on ${req.offerKey}: unit, amount, currency and an expiry`,
      'the partner',
    );
  } else {
    card = req.card.value;
  }

  let status: RateCardStatus | null = null;
  if (card !== null) {
    if (card.offerKey !== req.offerKey) {
      refuse(
        'FLOOR_RATE_CARD_OFFER_MISMATCH',
        `No floor is quoted: the supplied rate card is for ${card.offerKey} and the floor was asked for `
        + `${req.offerKey}. A rate for one offer is not a rate for another, however similar the work looks.`,
        RULE_ABSENT_REFUSES,
        `a rate card whose offerKey is ${req.offerKey}`,
        'the server',
      );
      card = null;
    } else if (asOf !== null) {
      status = rateCardStatus(card, asOf);
      if (status === 'expired') {
        refuse(
          'FLOOR_RATE_CARD_EXPIRED',
          `No floor is quoted: ${partnerLabel}'s rate card for ${req.offerKey} expired on ${card.validUntil}. `
          + 'The last rate they confirmed is still on file and is deliberately not used here — a floor is a '
          + 'line the desk holds, and holding a line at a price the partner stopped honouring is how a '
          + 'margin disappears between the quote and the invoice.',
          RULE_ABSENT_REFUSES,
          `a re-confirmed rate from ${partnerLabel}, with a new expiry`,
          'the partner',
        );
      } else if (status === 'no_validity_stated') {
        refuse(
          'FLOOR_RATE_CARD_NO_VALIDITY',
          `No floor is quoted: ${partnerLabel}'s rate card for ${req.offerKey} states no expiry. A rate with `
          + 'no expiry is a rate nobody re-confirmed, and it is treated as unusable rather than as valid '
          + 'forever.',
          RULE_ABSENT_REFUSES,
          'an expiry date on the rate card (valid_until)',
          'the partner',
        );
      }
    }
  }

  if (card !== null) {
    const cardCcy = (card.currency ?? '').toUpperCase();
    const quoteCcy = (req.quoteCurrency ?? '').toUpperCase();
    if (cardCcy === '' || quoteCcy === '' || cardCcy !== quoteCcy) {
      refuse(
        'FLOOR_RATE_CARD_CURRENCY_MISMATCH',
        `No floor is quoted: the rate card is in ${cardCcy || '(none stated)'} and the floor was asked for in `
        + `${quoteCcy || '(none stated)'}. Nothing here converts — a pure function inventing an FX rate is a `
        + 'wrong invoice with extra steps. Convert upstream, deliberately, and ask again.',
        RULE_NO_LAUNDERING,
        'one currency, or a deliberate conversion performed upstream',
        'the desk',
      );
    }
  }

  /* ── The effort triple. Metered cards only — see `effortPoint` on the frame. */
  const metered = card !== null && card.unit !== 'fixed';
  let effort: FloorEffortInput | null = null;
  if (metered) {
    if (req.effort.state === 'not_loaded') {
      refuse(
        'FLOOR_EFFORT_NOT_LOADED',
        `No floor is quoted: the effort register was never read on this request, so nothing here knows how `
        + `many partner-days ${req.offerKey} takes. This is NOT "no triple has been supplied".`,
        RULE_THREE_STATES,
        req.effort.note,
        'the server',
      );
    } else if (req.effort.state === 'withheld') {
      refuse(
        'FLOOR_EFFORT_WITHHELD',
        `No floor is quoted: an effort triple for ${req.offerKey} exists and this caller may not see it.`,
        RULE_THREE_STATES,
        req.effort.note,
        'the desk',
      );
    } else if (req.effort.state === 'empty') {
      refuse(
        'FLOOR_EFFORT_ABSENT',
        `No floor is quoted: no effort triple is on record for ${req.offerKey}. A metered rate needs a `
        + 'quantity, and the shipped placeholder is deliberately NOT substituted here.',
        RULE_ABSENT_REFUSES,
        `optimistic / likely / pessimistic partner-days for ${req.offerKey}`,
        'the founder',
      );
    } else {
      effort = req.effort.value;
      if (effort.isPlaceholder) {
        refuse(
          'FLOOR_EFFORT_IS_PLACEHOLDER',
          `No floor is quoted: the effort triple for ${req.offerKey} is still the shipped placeholder `
          + `(stated by "${effort.statedBy}"). A floor computed from a placeholder is arithmetic over an `
          + 'invented input that would read on screen as a policy minimum — the most dangerous number this '
          + 'system could produce.',
          RULE_NO_LAUNDERING,
          `a founder-supplied effort triple for ${req.offerKey}, replacing TODO_EFFORT_DAYS`,
          'the founder',
        );
        effort = null;
      } else if (effort.offerKey !== req.offerKey) {
        refuse(
          'FLOOR_EFFORT_OFFER_MISMATCH',
          `No floor is quoted: the supplied effort triple is for ${effort.offerKey} and the floor was asked `
          + `for ${req.offerKey}.`,
          RULE_ABSENT_REFUSES,
          `an effort triple whose offerKey is ${req.offerKey}`,
          'the server',
        );
        effort = null;
      }
    }
  }

  const days = effort === null
    ? null
    : req.effortPoint === 'pessimistic' ? effort.pessimisticDays : effort.likelyDays;
  if (metered && effort !== null && !finitePositive(days)) {
    refuse(
      'FLOOR_EFFORT_UNUSABLE',
      `No floor is quoted: the ${FLOOR_EFFORT_POINT_LABEL[req.effortPoint]} value of the effort triple for `
      + `${req.offerKey} is ${String(days)}, which cannot be multiplied by a rate. It is refused rather than `
      + 'clamped, because a clamped zero would price the work as free.',
      RULE_ABSENT_REFUSES,
      `a positive ${req.effortPoint} day count for ${req.offerKey}`,
      'the founder',
    );
  }

  /* ── The two numbers that live on the card ROW and not on `RateCard`. ───── */
  let hoursPerDay: number | null = null;
  if (card !== null && card.unit === 'hourly') {
    if (req.hoursPerDay.state === 'loaded' && finitePositive(req.hoursPerDay.value)) {
      hoursPerDay = req.hoursPerDay.value;
    } else {
      refuse(
        'FLOOR_HOURS_PER_DAY_ABSENT',
        `No floor is quoted: ${partnerLabel}'s card for ${req.offerKey} is hourly and the effort triple is in `
        + 'DAYS. Bridging them needs hours-per-day, which nobody stated. Assuming 8 would put an invented '
        + 'number into a floor.',
        RULE_ABSENT_REFUSES,
        'hours_per_day on the rate card',
        'the partner',
      );
    }
  }

  let passThrough: number | null = null;
  if (req.passThroughCents.state === 'loaded'
      && typeof req.passThroughCents.value === 'number'
      && Number.isFinite(req.passThroughCents.value)
      && req.passThroughCents.value >= 0) {
    passThrough = Math.round(req.passThroughCents.value);
  } else {
    refuse(
      'FLOOR_PASS_THROUGH_UNUSABLE',
      'No floor is quoted: the pass-through cost on the rate card is missing or not a non-negative number. '
      + 'It is NOT assumed to be zero here — a missing pass-through on a legal-opinion coordination is '
      + "counsel's own fee, and assuming it away understates the floor by the largest single line in it.",
      RULE_ABSENT_REFUSES,
      'fixed_cost_cents on the rate card (0 is a legitimate value; absent is not)',
      'the desk',
    );
  }

  /* ── The arithmetic, only if nothing above objected. ─────────────────────── */
  if (refusals.length > 0 || card === null || passThrough === null || env === null || asOf === null) {
    return { kind: 'refused', refusals };
  }

  const units = card.unit === 'fixed'
    ? null
    : card.unit === 'hourly'
      ? (days as number) * (hoursPerDay as number)
      : (days as number);

  const unitCost = rateCardCostCents({ ...card, expectedUnits: units });
  if (unitCost === null) {
    refuse(
      'FLOOR_RATE_NOT_DERIVABLE',
      `No floor is quoted: ${partnerLabel}'s rate for ${req.offerKey} (${RATE_UNIT_LABEL[card.unit]}, `
      + `${card.amountCents} cents) does not derive a positive cost for ${units === null ? 'one engagement' : `${units} unit(s)`}. `
      + 'A card at zero, at a fraction of a cent, or one whose product rounds to nothing is an unfilled '
      + 'form — never a partner working for free.',
      RULE_ABSENT_REFUSES,
      'a positive rate on the card',
      'the partner',
    );
    return { kind: 'refused', refusals };
  }

  const floorCents = unitCost + passThrough;
  const reasons: string[] = [];
  reasons.push(
    card.unit === 'fixed'
      ? `${partnerLabel} charges a fixed ${unitCost} cents for one ${req.offerKey}.`
      : `${partnerLabel} charges ${card.amountCents} cents per ${card.unit === 'hourly' ? 'hour' : 'day'}, `
        + `and ${req.offerKey} is stated at ${days} partner-day(s) at the ${req.effortPoint} point`
        + `${card.unit === 'hourly' ? `, ${hoursPerDay} hour(s) per day` : ''} — ${unitCost} cents.`,
  );
  if (passThrough > 0) {
    reasons.push(`Plus ${passThrough} cents of pass-through that does not scale with effort.`);
  } else {
    reasons.push('No pass-through was recorded on the card, and the card states that as 0 rather than leaving it blank.');
  }
  reasons.push(
    `Below ${floorCents} cents this engagement LOSES money on ${partnerLabel}'s own rate. It is not a target, `
    + 'a recommendation or a break-even for the business — see what it excludes.',
  );
  if (card.unit === 'fixed') {
    reasons.push(
      'The card is a fixed fee, so the effort triple never entered this arithmetic: the placeholder status of '
      + `${req.offerKey}'s triple is irrelevant to this figure, which is why no placeholder refusal appears.`,
    );
  }
  if (req.partner.active === false) {
    reasons.push(
      `${partnerLabel} is OFF THE BENCH (active: false). The floor is a fact about their rate, not a permission `
      + 'to staff them — `canAcceptEngagement` is the gate for that and it will refuse.',
    );
  }

  return {
    kind: 'floor',
    floorCents,
    currency: card.currency.toUpperCase(),
    reasons,
    frame: {
      environment: env,
      asOf,
      offerKey: req.offerKey,
      partnerId: req.partner.id,
      partnerName: req.partner.name,
      assertedBy: req.partner.assertion.assertedBy,
      assertedAt: req.partner.assertion.assertedAt,
      assertionBasis: req.partner.assertion.basis,
      assertionIsAClaim: PARTNER_ASSERTION_IS_A_CLAIM,
      rateUnit: card.unit,
      rateAmountCents: card.amountCents,
      rateStatedBy: card.statedBy,
      rateStatedAt: card.statedAt,
      // Non-null by construction: `status` is only ever `'usable'` on this path.
      rateValidUntil: card.validUntil as string,
      rateCardStatus: status ?? 'usable',
      effortPoint: card.unit === 'fixed' ? null : req.effortPoint,
      effortDays: card.unit === 'fixed' ? null : (days as number),
      effortStatedBy: effort?.statedBy ?? null,
      effortStatedAt: effort?.statedAt ?? null,
      hoursPerDay,
      unitsCharged: units,
      passThroughCents: passThrough,
      method: 'rate_card_unit_cost × effort_at_stated_point + pass_through',
      excludes: FLOOR_EXCLUDES,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE WIRE — one declaration of the registry payload, measured on both sides  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHY THE WIRE SHAPE IS DECLARED ONCE, HERE, AND CHECKED AT RUNTIME.
 *
 * `apps/web/src/lib/api/gps.ts:60` is the post-mortem for the alternative: a
 * hand-written `GpsSummary` claiming three fields the API had never sent. `tsc`
 * believed the copy; the page test mocked the boundary and asserted the page against
 * the same invented contract the page was written against; the two wrongs agreed and
 * production crashed when the migrations landed.
 *
 * So the route and the page import THESE types, and `partnerRegistryDeskDefects` —
 * an executable predicate, not a description — is run over a real serialised HTTP
 * response in the route test and over the page's fixture in the page test. A
 * compiler cannot check a claim about a runtime payload; this can.
 */
export const PARTNER_REGISTRY_CONTRACT = 'gps.partnerRegistry.v1' as const;
export const PARTNER_REGISTRY_FLOOR_CONTRACT = 'gps.partnerRegistry.floor.v1' as const;

/** Which relations exist on the environment that answered. */
export interface PartnerRegistryRegisters {
  readonly registry: boolean;
  readonly capabilities: boolean;
  readonly rateCards: boolean;
  readonly effortTriples: boolean;
}

/**
 * A bench member on the wire: the domain partner, plus the two facts the domain type
 * cannot carry.
 */
export interface PartnerRegistryBenchMember {
  readonly partner: Partner;
  /**
   * FALSE means NOBODY STATED A CAPACITY, and `partner.capacity.maxConcurrent` is 0
   * in that case — which the engines read as "no spare slot". Both facts travel
   * because 0-because-full and 0-because-unknown must not render alike.
   */
  readonly capacityStated: boolean;
  /** `null` means NOBODY STATED A LINK to the BD bench, never "a different entity". */
  readonly bdPartnerId: string | null;
}

export type PartnerRegistryBench =
  | { readonly state: 'loaded'; readonly members: readonly PartnerRegistryBenchMember[] }
  | {
    readonly state: 'not_loaded' | 'withheld' | 'empty';
    readonly note: string;
    readonly members: readonly PartnerRegistryBenchMember[];
  };

export interface PartnerRegistryDesk {
  readonly contract: typeof PARTNER_REGISTRY_CONTRACT;
  readonly asOf: string;
  readonly registers: PartnerRegistryRegisters;
  /** The migration a surface tells an operator to run. Never hard-coded in the browser. */
  readonly migration: string;
  readonly assertionIsAClaim: string;
  readonly offerKeys: readonly OfferKey[];
  readonly effortPoints: readonly FloorEffortPoint[];
  readonly bench: PartnerRegistryBench;
}

export interface PartnerRegistryFloorView {
  readonly contract: typeof PARTNER_REGISTRY_FLOOR_CONTRACT;
  readonly asOf: string;
  readonly partnerId: string;
  readonly offerKey: string;
  readonly effortPoint: string;
  readonly registers: PartnerRegistryRegisters;
  readonly migration: string;
  /** Exactly one of these is populated. A floor and a refusal are never both true. */
  readonly floor: PriceFloor | null;
  readonly refusals: readonly FloorRefusal[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function registerDefects(v: unknown, where: string): string[] {
  if (!isRecord(v)) return [`${where}: registers is not an object`];
  const out: string[] = [];
  for (const k of ['registry', 'capabilities', 'rateCards', 'effortTriples']) {
    if (typeof v[k] !== 'boolean') out.push(`${where}: registers.${k} is not a boolean`);
  }
  return out;
}

/**
 * EVERY defect in the desk payload, as strings. `[]` means it matches the contract.
 *
 * The check that matters most is the last one: a `loaded` bench whose members carry
 * no assertion. A member rendered without who/when/basis is exactly the
 * unattributed partner the owner's decision was about, and it would look completely
 * normal on screen.
 */
export function partnerRegistryDeskDefects(wire: unknown): readonly string[] {
  const out: string[] = [];
  if (!isRecord(wire)) return ['desk: wire is not an object'];
  if (wire.contract !== PARTNER_REGISTRY_CONTRACT) out.push(`desk: contract is not ${PARTNER_REGISTRY_CONTRACT}`);
  if (typeof wire.asOf !== 'string' || !Number.isFinite(Date.parse(wire.asOf))) out.push('desk: asOf is not an instant');
  if (typeof wire.migration !== 'string' || wire.migration.trim() === '') out.push('desk: migration is not named');
  if (typeof wire.assertionIsAClaim !== 'string' || !/not verified/i.test(wire.assertionIsAClaim)) {
    out.push('desk: assertionIsAClaim does not carry the caveat, so a surface could render an asserted bench as a verified one');
  }
  if (!Array.isArray(wire.offerKeys) || wire.offerKeys.length === 0) out.push('desk: offerKeys is empty');
  if (!Array.isArray(wire.effortPoints) || wire.effortPoints.some((p) => p === 'optimistic')) {
    out.push('desk: effortPoints is empty or offers an optimistic floor');
  }
  out.push(...registerDefects(wire.registers, 'desk'));

  const bench = wire.bench;
  if (!isRecord(bench)) {
    out.push('desk: bench is not an object');
    return out;
  }
  const state = bench.state;
  if (state !== 'loaded' && state !== 'not_loaded' && state !== 'withheld' && state !== 'empty') {
    out.push('desk: bench.state is not one of loaded / not_loaded / withheld / empty');
  }
  if (state !== 'loaded' && (typeof bench.note !== 'string' || bench.note.trim() === '')) {
    out.push('desk: a bench that is not loaded carries no note saying which absence this is');
  }
  if (!Array.isArray(bench.members)) {
    out.push('desk: bench.members is not an array');
    return out;
  }
  if (state !== 'loaded' && bench.members.length > 0) {
    out.push('desk: a bench that is not loaded carries members anyway');
  }
  for (const [i, m] of bench.members.entries()) {
    if (!isRecord(m) || !isRecord(m.partner)) {
      out.push(`desk: bench.members[${i}] is not a member`);
      continue;
    }
    const p = m.partner as unknown as { id: string; name: string; assertion: PartnerAssertion };
    for (const d of partnerAssertionDefects(p)) {
      out.push(`desk: bench.members[${i}] (${String(p.id)}) ${d.code}`);
    }
    if (typeof m.capacityStated !== 'boolean') {
      out.push(`desk: bench.members[${i}] does not say whether a capacity was ever stated`);
    }
  }
  return out;
}

/** Every defect in the floor wire. `[]` means it matches the contract. */
export function partnerRegistryFloorDefects(wire: unknown): readonly string[] {
  const out: string[] = [];
  if (!isRecord(wire)) return ['floor: wire is not an object'];
  if (wire.contract !== PARTNER_REGISTRY_FLOOR_CONTRACT) out.push(`floor: contract is not ${PARTNER_REGISTRY_FLOOR_CONTRACT}`);
  if (typeof wire.asOf !== 'string' || !Number.isFinite(Date.parse(wire.asOf))) out.push('floor: asOf is not an instant');
  out.push(...registerDefects(wire.registers, 'floor'));

  const floor = wire.floor;
  const refusals = wire.refusals;
  if (!Array.isArray(refusals)) {
    out.push('floor: refusals is not an array');
    return out;
  }
  // A FLOOR AND A REFUSAL ARE NEVER BOTH TRUE. A wire carrying both would let a
  // surface render the number and drop the reason it should not be trusted.
  if (floor !== null && refusals.length > 0) out.push('floor: a floor and refusals arrived together');
  if (floor === null && refusals.length === 0) out.push('floor: neither a floor nor a reason there is none');

  if (floor !== null) {
    if (!isRecord(floor)) return [...out, 'floor: floor is not an object'];
    if (typeof floor.floorCents !== 'number' || !Number.isInteger(floor.floorCents) || floor.floorCents <= 0) {
      out.push('floor: floorCents is not a positive whole number of cents');
    }
    if (typeof floor.currency !== 'string' || !/^[A-Z]{3}$/.test(floor.currency)) out.push('floor: currency is not ISO-4217');
    const frame = floor.frame;
    if (!isRecord(frame)) {
      out.push('floor: the figure carries no observation frame');
    } else {
      if (typeof frame.environment !== 'string' || frame.environment.trim() === '') {
        out.push('floor: the frame names no environment, so nobody can say which database this came from');
      }
      if (typeof frame.assertedBy !== 'string' || frame.assertedBy.trim() === '') {
        out.push('floor: the frame does not say who asserted the partner this figure rests on');
      }
      if (!Array.isArray(frame.excludes) || frame.excludes.length === 0) {
        out.push('floor: the frame does not say what the floor excludes, so it reads as a break-even');
      }
    }
  }

  for (const [i, r] of refusals.entries()) {
    if (!isRecord(r)) {
      out.push(`floor: refusals[${i}] is not a refusal`);
      continue;
    }
    if (typeof r.code !== 'string' || !(FLOOR_REFUSAL_CODES as readonly string[]).includes(r.code)) {
      out.push(`floor: refusals[${i}] carries no stable code`);
    }
    if (typeof r.sentence !== 'string' || r.sentence.trim() === '') out.push(`floor: refusals[${i}] says nothing`);
    if (!isRecord(r.rule) || typeof r.rule.text !== 'string') out.push(`floor: refusals[${i}] cites no rule`);
    if (typeof r.missing !== 'string' || r.missing.trim() === '') out.push(`floor: refusals[${i}] does not name what is missing`);
  }
  return out;
}
