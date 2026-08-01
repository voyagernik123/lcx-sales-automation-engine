/**
 * GLOBAL SERVICES (GPS) — the domain types for the services business.
 *
 * Scope of this file: Phase 1 of `GPS_IMPLEMENTATION_PLAN.md` — Offer →
 * Proposal → Deposit. It models what is SOLD and what is COLLECTED. It does
 * NOT model delivery artifacts: there is deliberately no artifact, document,
 * attachment or upload type anywhere in this file, because Phase 3 (delivery) is
 * gated on decision D2 — whether LCX legal/DPO accepts third-party client
 * confidential material on LCX infrastructure (plan §3, §4 S0.4). Absence is
 * enforced by a ratchet test, not by discipline; adding a type here would be the
 * first step in defeating it.
 *
 * WHAT IS NOT IMPORTED, ON PURPOSE. `packages/shared/src/alpha.ts` looks like it
 * belongs here and does not. Its composites are wired to LCX LISTING propensity:
 * `listedOnLcx: true` REDUCES the score (`alpha.ts:80`) and `dealValue` anchors
 * on a listing's size and liquidity (`alpha.ts:157`). For a services business
 * that is inverted — an already-listed project is an excellent client, it still
 * needs documentation, GTM and distribution. Reusing those scores would
 * systematically down-rank the best prospects (plan §1.2). The raw signal
 * bundle and the Admiralty provenance grading are reusable; the composites are
 * not, and targeting is out of Phase 1 anyway.
 *
 * Money is integer cents throughout, matching `payment_milestones`
 * (`0024_dealdesk_ext.sql:37`) and `PackageConfig.basePrice`
 * (`packages/shared/src/deals/index.ts:3`). Never floats: a $17,500 engagement
 * with a partner cost and a margin is three roundings away from a wrong number
 * on an invoice.
 */

/**
 * Who signs the contract with the client — LCX itself, or a separate vehicle.
 *
 * THIS IS CONFIGURATION, NOT A CONSTANT, AND THAT IS A DECISION NOT AN OMISSION.
 * The founder is an LCX employee and LCX is an EU/Liechtenstein regulated
 * exchange; whether the services business contracts as LCX or as an external
 * entity is deliberately undecided (plan §3, D1 — answered "design for both").
 * Hard-coding either answer would make the eventual decision a rewrite, because
 * four things derive from it: the conflict-check disclosure text, the invoice
 * header, where a delivery artifact may be stored, and the referral wording.
 *
 * So it travels as a field with a default: one enum column on `gps_engagement`
 * and one field on a quote satisfies D1 without blocking Phase 1. It is not
 * blocking now; it becomes blocking at Phase 3 (artifact storage target).
 */
export type ContractingEntity = 'lcx' | 'external';

/** The default until D1 is answered. Stated once, here, so it is greppable. */
export const DEFAULT_CONTRACTING_ENTITY: ContractingEntity = 'lcx';

/**
 * The five offers, as a CLOSED union.
 *
 * Four of these have actually been sold, manually, for ~$250k total; the fifth
 * (`diagnostic`) is the paid front door. Closed rather than `string` so that
 * adding a sixth offer is a typechecked change across the catalogue, the API and
 * the UI at once — the plan explicitly refuses a 10-offer catalogue (§8): four
 * have ever been sold, and an aspirational menu is how a services business
 * ends up quoting work it cannot staff.
 */
export type OfferKey =
  | 'diagnostic'
  | 'mica_whitepaper'
  | 'legal_opinion_coordination'
  | 'gtm_sprint'
  | 'marketing_activation';

/** Every offer key, in catalogue order. Kept beside the union so they cannot drift. */
export const OFFER_KEYS: readonly OfferKey[] = [
  'diagnostic',
  'mica_whitepaper',
  'legal_opinion_coordination',
  'gtm_sprint',
  'marketing_activation',
] as const;

/**
 * A band, not a price. Scoped professional services do not have one number:
 * the same white paper is different work for a utility token and for an EMT.
 *
 * A band is also how a quote stays honest without a discount-approval theatre —
 * quoting below `min` is a real exception someone signs off on, rather than a
 * multiplier nobody remembers choosing. (Contrast `buildProposalTiers`,
 * `deals/index.ts:93`, which manufactures Essential/Growth/Premium by ×0.7/×1.6
 * off a base price. That is right for listing SKUs and wrong here: services
 * tiers differ in SCOPE, not by arithmetic.)
 */
export interface PriceBandCents {
  /** Inclusive floor, integer cents. */
  min: number;
  /** Inclusive ceiling, integer cents. */
  max: number;
}

/**
 * One sellable offer. This is the substance of the business: outcome, what is
 * in, what is explicitly OUT, what the client must give us, who delivers, what
 * it costs us, and what "done" means.
 */
export interface ServiceOffer {
  key: OfferKey;
  /** Client-facing name. Goes on the proposal verbatim. */
  name: string;
  /**
   * The OUTCOME, in one sentence, stated as what the client ends up holding —
   * not as activity. "A submission-ready white paper package" is an outcome;
   * "white paper support" is a retainer waiting to overrun.
   */
  outcome: string;
  /** What is in scope. Each line is a thing a client could point at and check. */
  inclusions: readonly string[];

  /**
   * WHAT IS NOT IN SCOPE — and the reason this interface exists at all.
   *
   * Exclusions are the single most protective sentence in a services proposal,
   * and the current proposal snapshot HAS NO FIELD FOR THEM: `ProposalSnapshot`
   * (`packages/shared/src/deals/index.ts:69`) emits `inclusions`, `tiers`,
   * `claimsUsed` and `disclaimer` only. With a partner delivering a $10–25k
   * engagement, an unstated exclusion is an unbilled scope overrun that eats the
   * whole margin — and, worse, for an exchange employee selling adjacent
   * services, an unstated exclusion is an implied promise about listing or
   * regulatory outcome that nobody ever made.
   *
   * Every offer in the catalogue must disclaim, at minimum: guaranteed listing
   * (on LCX or anywhere), regulator approval, legal advice, and any
   * market-making / price / volume outcome.
   */
  exclusions: readonly string[];

  /**
   * What the client must supply before work can start. This is the honest
   * version of "delays were on their side": if it is not listed here, a missing
   * input is our problem.
   *
   * NOTE: naming an input here does NOT create a place to upload it. Phase 1 has
   * no intake path by construction (D2 / plan §4 S0.4) — these are collected in
   * conversation and by whatever channel the client already uses.
   */
  requiredClientInputs: readonly string[];

  /**
   * The partner or specialist who actually delivers. NULL for every offer today
   * and honestly so: there is no partner bench yet (plan §3, D5 — blocking
   * Phase 2). Partners deliver, the founder sells and coordinates, so bench
   * depth per offer IS the concurrency cap — and a null here means the
   * engagement cannot be staffed, not that it is unassigned.
   *
   * When names exist they belong in the EXISTING `partners` table
   * (`0024_dealdesk_ext.sql:66`) — not a new one. `command_partners`
   * (`0040_command.sql:29`) is already the second; a third would be a mess.
   */
  partnerOwner: string | null;

  /**
   * What we expect to pay the partner, integer cents. First-class from day one,
   * not a Phase-4 concern: at $10–25k with a subcontractor delivering, one
   * scope overrun eats the engagement, and there is no margin column anywhere
   * in 47 migrations. A placeholder until D5 supplies real rate cards — see
   * CATALOGUE_TODOS.
   */
  expectedVendorCostCents: number;

  /**
   * How the client and we agree it is finished. Written to be checkable by
   * someone who is not us. This is what makes partner delivery safe: a partner
   * is paid against these, not against effort.
   */
  acceptanceCriteria: readonly string[];

  /** The quotable range. Placeholder until D4; see PRICE_BANDS_TODO. */
  priceBandCents: PriceBandCents;

  /**
   * How this engagement leads to the next one, in one sentence. Repeat business
   * is the point of a services business — and note that repeat business is
   * impossible on `deals` at the DB level (`0033_deals_unique_project.sql:12`
   * puts a UNIQUE INDEX on `deals(project_id)`), which is precisely why
   * engagements get their own table.
   */
  renewalPath: string;

  /** True for the paid front door. Exactly one offer should set this. */
  isDiagnostic: boolean;

  /**
   * Whether the fee is credited against a subsequent engagement.
   *
   * Load-bearing commercially: typical engagements are $10–25k, so a diagnostic
   * must be ~$1.5–3k AND creditable. A $5–10k non-creditable diagnostic is
   * 20–50% of the whole deal and will not sell (plan §3, D4).
   */
  creditableAgainstEngagement: boolean;
}

/**
 * The engagement lifecycle: sell → deliver → collect.
 *
 * Deliberately NOT `DealStage` (`deals/index.ts:34`). A deal stage tracks a
 * PURSUIT and ends at won/lost; an engagement's interesting half starts after
 * "won" — money in, work done, money collected. A services business dies of
 * delivered-and-never-collected, not of lost deals.
 *
 * Two states are compliance machinery rather than sales stages:
 *  - `conflict_pending` — the founder is an LCX employee. A conflict check must
 *    be recorded (see `gps_conflict_check`) before anything is issued to a
 *    client. Making it a status means "we forgot" is visible in a list view
 *    rather than discoverable in an audit.
 *  - `deposit_paid` — separate from `accepted` because acceptance is a signature
 *    and a deposit is cash, and only one of those pays a partner.
 *
 * HONESTY NOTE: the delivery-side states (`in_delivery` … `collected`) are
 * declared because the lifecycle is only comprehensible whole, but Phase 1 ships
 * NO delivery surfaces and no artifact intake (D2, plan §4 S0.4). Reaching them
 * today means a human moved the status by hand.
 */
export type EngagementStatus =
  | 'draft'
  | 'conflict_pending'
  | 'proposed'
  | 'accepted'
  | 'deposit_paid'
  | 'in_delivery'
  | 'delivered'
  | 'invoiced'
  | 'collected'
  | 'closed_lost'
  | 'cancelled';

/** Lifecycle order. The SQL CHECK in 0047_gps.sql mirrors this list exactly. */
export const ENGAGEMENT_STATUSES: readonly EngagementStatus[] = [
  'draft', 'conflict_pending', 'proposed', 'accepted', 'deposit_paid',
  'in_delivery', 'delivered', 'invoiced', 'collected', 'closed_lost', 'cancelled',
] as const;

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  draft: 'Draft',
  conflict_pending: 'Conflict check pending',
  proposed: 'Proposal issued',
  accepted: 'Accepted',
  deposit_paid: 'Deposit paid',
  in_delivery: 'In delivery',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  collected: 'Collected',
  closed_lost: 'Closed — lost',
  cancelled: 'Cancelled',
};

/** Nothing further is expected to happen. */
export function isTerminalEngagementStatus(s: EngagementStatus): boolean {
  return s === 'collected' || s === 'closed_lost' || s === 'cancelled';
}

/**
 * The conflict-check decision. `cleared_with_disclosure` is the realistic
 * common case, not an edge: an LCX employee selling adjacent services will
 * usually proceed WITH a disclosure, and the value of the record is that the
 * exact disclosure text used is kept alongside the decision.
 */
export type ConflictDecision = 'cleared' | 'cleared_with_disclosure' | 'declined';

/**
 * Margin in integer cents. Pure, total, and deliberately allowed to go negative:
 * a quote below vendor cost must show as −$2,000 at quote time, not be clamped
 * to zero and discovered at invoice time. Callers decide what to do with a
 * negative; hiding it here would be the whole failure mode.
 */
export function marginCents(priceCents: number, vendorCostCents: number): number {
  return Math.round(priceCents) - Math.round(vendorCostCents);
}

/**
 * Margin as a percentage of PRICE (gross margin), 0 decimal places, e.g. 62.
 *
 * Percent-of-price, not markup-on-cost — they differ a lot at these numbers
 * (a $20k price on $8k cost is 60% margin but 150% markup) and quoting the
 * flattering one is how a services P&L gets lied to.
 *
 * Returns null rather than 0/NaN/Infinity when price is 0 or absent: "no price
 * yet" is not "zero margin", and a UI must be able to tell those apart.
 */
export function marginPct(priceCents: number, vendorCostCents: number): number | null {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  const pct = Math.round((marginCents(priceCents, vendorCostCents) / priceCents) * 100);
  /*
   * `+ 0` NORMALISES NEGATIVE ZERO, and that is not cosmetic.
   *
   * `Math.round(-0.004)` is `-0`. `JSON.stringify(-0)` is `"0"`, so a $10 median LOSS
   * on a $250,000 price serialised as `0` — and `(-0 < 0) === false`, so the margin-floor
   * check in `underwrite.ts` put `p50_margin_below_floor` in `passed` with
   * `observed: 0`. The audit record then stated a loss as "0%" AND as cleared.
   *
   * The rounding itself stays: a percent is a percent. What is removed is the one value
   * that is simultaneously negative for arithmetic and non-negative for every comparison
   * a reader would write. Callers that need the sign of a small loss read the CENTS,
   * which are exact — see `p50MarginIsLoss`.
   */
  return pct === 0 ? 0 : pct;
}

// ── Row shapes ────────────────────────────────────────────────────────────────
//  These mirror `apps/api/src/db/migrations/0047_gps.sql` column-for-column so
//  the API and web layers share one vocabulary. They are the API's serialised
//  shape (camelCase, ISO strings), not raw pg rows.
//
//  Note `clientId` on BOTH engagement and conflict check. Every GPS table
//  carries the client dimension from the FIRST migration (plan §4 S0.3):
//  retrofitting a tenancy seam onto rows that already exist is a rewrite, and
//  today no row anywhere in the platform says "this belongs to client X".

/** Lifecycle of the client relationship itself, independent of any engagement. */
export type ClientStatus = 'prospect' | 'active' | 'dormant' | 'declined';

export interface GpsClient {
  id: string;
  name: string;
  /** The contracting counterparty's registered name, if it differs from `name`. */
  legalEntity: string | null;
  /**
   * Human-entered free text, NOT an enum. Every jurisdiction rule in this
   * programme is unverified recalled training data (plan §0), so the system
   * records what a human typed and refuses to infer a perimeter from it.
   */
  jurisdiction: string | null;
  primaryContact: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GpsEngagement {
  id: string;
  clientId: string;
  /** Null when the client is not a tracked project in the BD pipeline. */
  projectId: string | null;
  offerKey: OfferKey;
  contractingEntity: ContractingEntity;
  /**
   * The offer AS QUOTED, frozen. The catalogue is versioned code and will
   * change; what the client agreed to must not change with it.
   */
  scopeSnapshot: unknown;
  priceCents: number;
  vendorCostCents: number;
  /** ISO-4217, uppercase. Stored per engagement — partners invoice in their own. */
  currency: string;
  status: EngagementStatus;
  /** Desk member id (`operators.ts`), the person accountable. */
  owner: string | null;
  depositRequiredCents: number;
  depositPaidAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One per engagement. The artifact that makes an exchange employee's services
 * business defensible — and the one piece of compliance machinery that genuinely
 * did not exist anywhere in the platform (plan §5).
 */
export interface GpsConflictCheck {
  id: string;
  clientId: string;
  engagementId: string;
  /** What was actually checked, in the checker's words. */
  checkPerformed: string;
  decision: ConflictDecision;
  /** Desk member id. A named human, never a service account. */
  decidedBy: string;
  /**
   * The disclosure text ACTUALLY USED, stored verbatim. Not a template id: the
   * template will be edited, and the defensible record is what the client was
   * actually told on the day.
   */
  disclosureTextUsed: string | null;
  decidedAt: string;
}
