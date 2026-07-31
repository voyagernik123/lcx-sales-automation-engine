/**
 * GLOBAL SERVICES (GPS) — barrel for the eighth compartment's shared layer.
 *
 * Phase 1 only: Offer → Proposal → Deposit. There is deliberately NOTHING here
 * for client artifacts, uploads or document storage — that is Phase 3, gated on
 * decision D2 (LCX DPO: controller vs processor for third-party confidential
 * material) and enforced absent by a ratchet test, not by discipline. See
 * `GPS_IMPLEMENTATION_PLAN.md` §4 S0.4.
 */

export type {
  ContractingEntity,
  OfferKey,
  PriceBandCents,
  ServiceOffer,
  EngagementStatus,
  ConflictDecision,
  ClientStatus,
  GpsClient,
  GpsEngagement,
  GpsConflictCheck,
} from './types.js';

export {
  DEFAULT_CONTRACTING_ENTITY,
  OFFER_KEYS,
  ENGAGEMENT_STATUSES,
  ENGAGEMENT_STATUS_LABELS,
  isTerminalEngagementStatus,
  marginCents,
  marginPct,
} from './types.js';

export type { CatalogueTodo } from './catalogue.js';
export {
  OFFERS,
  getOffer,
  DIAGNOSTIC_OFFER,
  bandMidpointCents,
  CATALOGUE_TODOS,
  CATALOGUE_DEFAULT_CONTRACTING_ENTITY,
  NO_LEGAL_ADVICE_EXCLUSION,
  PRICE_BANDS_ARE_PLACEHOLDERS,
} from './catalogue.js';

/* ── Phase 2 — the partner bench ──────────────────────────────────────────────
 * Domain model and engines ONLY. Persistence EXTENDS the existing `partners`
 * table (0024_dealdesk_ext.sql:66); `command_partners` (0040_command.sql:29) is
 * already a second one, and GPS_IMPLEMENTATION_PLAN.md §5 rules out a third.
 * With partners delivering and the founder only selling and coordinating, bench
 * depth per offer IS the concurrency cap on the business — which is why
 * `canAcceptEngagement` can say no.
 */
export type {
  Seniority, PartnerCapability, RateUnit, RateCard, RateCardStatus, Capacity, Partner,
  ActiveEngagementRef, HeadroomReason, PartnerExclusion, PartnerSlotDetail,
  OfferHeadroom, BenchHeadroom, BenchOptions, RefusalCode, GateResult,
  AcceptanceDecision, RecordedOutcome, ScorecardConfidence, PartnerScorecard,
  QuotedEngagement, MarginVerdict, MarginAtRisk,
} from './partners.js';
export {
  SENIORITY_LABEL, SENIORITY_ORDER, RATE_UNIT_LABEL, PARTNER_BENCH,
  SCORECARD_CONFIDENCE_LABEL,
  meetsSeniority, capabilityCoversJurisdiction, rateCardStatus, rateCardCostCents,
  benchHeadroom, headroomFor, canAcceptEngagement, partnerScorecard, marginAtRisk,
} from './partners.js';

/* ── Phase 4 — surgical targeting: hard GATES, then an additive SCORE ─────────
 * Replaces the mandate's 8-factor multiplicative formula, which collapsed toward
 * zero and let its own two penalties own the ranking (plan §1.3). Confidence is
 * computed SEPARATELY and reported beside the score, never inside it — folding it
 * in is what made the original gameable by weakening its protections.
 * Deliberately does NOT reuse alpha.ts composite scores: `listingPropensity`
 * treats `listedOnLcx` as REDUCING opportunity (alpha.ts:80), which is inverted
 * for a services business.
 */
export type {
  TargetFactorKey, TargetingWeights, ScreeningResult, PerimeterStatus,
  TargetConflictStatus, DeadlineKind, DecisionMaker, DeliveryComplexityFlags,
  TargetEvidence, GpsTarget, GateKey, GateHit, FactorOutcome, ConfidenceBand,
  TargetConfidence, TargetAssessment, AssessOptions, TargetRanking,
} from './targeting.js';
export {
  TARGET_FACTOR_KEYS, FACTOR_LABELS, WEIGHTS_V1, WEIGHTS_V1_BASIS,
  COMPLEXITY_FLAG_WEIGHTS, GATE_KEYS,
  evaluateGates, deriveNeed, deriveAbilityToPay, deriveUrgency, deriveAccess,
  deriveExpectedMargin, deriveDeliveryComplexity, confidenceBand, computeConfidence,
  assessTarget, rankTargets,
} from './targeting.js';

/* ── Phase 5 — calibration, sized honestly to ~29 engagements a year ──────────
 * A REVIEW INSTRUMENT, not a model. At that volume nothing is learnable, so
 * `MIN_N_FOR_RATE` suppresses rate-shaped output on small n (returning raw counts
 * and a null rate rather than "33%" off three data points), and
 * `weightReviewPacket` never mutates weights — a human reviews the prior
 * quarterly. Margin realisation matters most: nothing in the 47 prior migrations
 * tracked cost at all.
 */
export type {
  OutcomeDisposition, WinReason, LossReason, OutcomeReason, OutcomeRecord,
  WinLossAggregate, WinLossRow, WinLossSummary, MarginGroup, MarginRealisation,
  PriorWeights, FactorVerdict, FactorReviewRow, WeightReviewPacket, CalibrationHealth,
} from './calibration.js';
export {
  WIN_REASONS, LOSS_REASONS, ASSUMED_ANNUAL_ENGAGEMENT_VOLUME,
  MIN_N_FOR_RATE, MIN_N_PER_ARM_FOR_SEPARATION, MIN_STANDARDISED_SEPARATION,
  UNATTRIBUTED_PARTNER, CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL,
  isReasonValidFor, wilson95Pct, winLossSummary, marginRealisation,
  weightReviewPacket, calibrationHealth,
} from './calibration.js';

/* ── Phase 3 — delivery, WITHOUT anywhere to put a client's document ──────────
 * Everything AROUND the artifact: the request for it, its status, acceptance of
 * the work, and the audit of who asked and when — while the artifact itself stays
 * wherever the client and counsel already keep it. `EvidenceRequest.externalLocation`
 * is a reference an operator TYPES; nothing fetches, resolves, previews or copies
 * it, and `NO_CLIENT_DOCUMENT_STORE_REASON` carries the why (D2: LCX's DPO has not
 * answered controller-vs-processor for third-party confidential material).
 * Enforced by `apps/api/src/gps/__tests__/intakeLockout.test.ts`, which was
 * mutation-tested against 12 adversarial edits — each went red on its intended
 * assertion — so this is a lock, not an omission.
 *
 * `deriveMilestones` THROWS on scope drift in BOTH directions: a sold acceptance
 * criterion no milestone delivers, and a milestone claiming no criterion. That is
 * the difference between a plan and a decoration.
 */
export type {
  DeliveryActor, DeliverableOwner, MilestoneState, MilestoneSpec, Milestone,
  DeliverableState, Deliverable, EvidenceCounterparty, EvidenceStatus, EvidenceRequest,
  AcceptanceState, AcceptanceBlockerCode, AcceptanceBlocker, AcceptanceVerdict,
  ProgressState, ProgressBlocker, EngagementProgress, DeliveryLoadInput, WipLoad,
} from './delivery.js';
export {
  NO_CLIENT_DOCUMENT_STORE_REASON,
  deriveMilestones, deriveMilestonesForOffer,
  REVIEW_REQUIRED_BY_DEFAULT, reviewSatisfied,
  isEvidenceSettled, isEvidenceOutstanding, isEvidenceOverdue,
  canAccept, engagementProgress,
  COORDINATION_HOURS_ARE_PLACEHOLDERS, TODO_COORDINATION_CAPACITY_HOURS_PER_WEEK,
  wipLoad,
} from './delivery.js';
