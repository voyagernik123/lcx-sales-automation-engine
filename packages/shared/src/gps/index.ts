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

/**
 * The lifecycle. Shared because it was private to `gps/actions.ts` while
 * `routes/gps.ts` shipped a generic status setter that could write the two
 * statuses the gates stand in front of. See `lifecycle.ts`.
 */
export type { ManualTransitionRefusal } from './lifecycle.js';
export {
  GATED_ENGAGEMENT_STATUSES,
  isGatedEngagementStatus,
  MANUAL_ENGAGEMENT_TARGETS,
  MANUAL_ENGAGEMENT_TRANSITIONS,
  ENGAGEMENT_STATUS_REQUIRES_REASON,
  checkManualTransition,
} from './lifecycle.js';

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
  // The state VOCABULARIES, not just their types. A route that validates a body
  // field against a hand-written array is how a seventh evidence status gets
  // invented at the edge; these are the only lists.
  MILESTONE_STATES, MILESTONE_STATE_LABELS, DELIVERABLE_STATES, EVIDENCE_STATUSES,
  COLLECTION_FOLLOW_UP_STATUSES, DELIVERY_ACTOR_LABELS, WIP_STATUSES,
} from './delivery.js';

/* ── Phase 6 — the book: what is actually on it, and what is binding ──────────
 * `Driver` is deliberately NOT re-exported here even though `book.ts` and `loop.ts`
 * both re-export it: it originates in `alpha.ts` and the ROOT barrel already
 * publishes it (`../index.ts:107`). Re-exporting it from two paths is TS2308.
 * `BenchHeadroom` / `MarginRealisation` / `WipLoad` are likewise already published
 * by the Phase 2/3/5 blocks above.
 */
export type {
  BookPosition, ConcentrationBasis, ValueAxis, ConcentrationHolder, ConcentrationBand,
  AxisConcentration, CurrencyHolder, CurrencyMix, CurrencyConcentration,
  ConcentrationOptions, BookConcentration, FunnelStage, FunnelStageCount,
  FunnelConversion, AgingBracketKey, AgingBracketDef, AgingBracket, AgingProfile,
  OldestUnpaidDeposit, CurrencyFunnel, CashConversion, ConstraintCode,
  ConstraintEvidence, ConstraintCheck, BindingConstraint, BindingConstraintInput,
  BookHealthGrade, BookHealthInput, BookHealth, BookPlaceholders, BookUnresolved,
  BookResponse,
} from './book.js';
export {
  UNATTRIBUTED, ageInDays, isOpenPosition, positionValueCents,
  VALUE_AXES, AXIS_LABEL,
  SINGLE_HOLDER_ALARM_SHARE_PCT, SINGLE_HOLDER_WATCH_SHARE_PCT, TOP3_ALARM_SHARE_PCT,
  bookConcentration, FUNNEL_STAGES, FUNNEL_STAGE_LABELS,
  AGING_BRACKETS, bracketForAgeDays, AGED_DEPOSIT_ALARM_DAYS, cashConversion,
  // The single currency normaliser. Every funnel and axis keys by it, so any
  // consumer that filters positions by currency must key by it too — see the
  // docblock: the cash.aging drill did not, and matched nothing.
  normaliseCurrency,
  CONSTRAINT_LABEL, CONSTRAINT_PRECEDENCE, bindingConstraint,
  BOOK_HEALTH_GRADE_LABEL, BOOK_HEALTH_BANDS, bookHealthGrade,
  CONCENTRATION_PENALTY_WEIGHTS, bookHealth,
} from './book.js';

/* ── Phase 7 — underwriting: a distribution, never a single number ────────────
 * Percentiles are nearest-rank order statistics (no interpolation, so no
 * fractional-cent percentile and n=1 is defined). `EFFORT_TRIPLES_ARE_PLACEHOLDERS`
 * stays exported because every surface that prints a distribution must be able to
 * say the effort behind it was invented.
 */
export type {
  EffortTriple, CostModel, UnderwriteQuote, UnderwriteVerdict, UnderwritingBasis,
  ExcludedOutcome, OutcomeBlend, UnderwriteDriver, MarginDistribution,
  StochasticInputKey, VarianceContribution, VarianceAttribution, UnderwriteOptions,
  Underwriting, OverrunPoint, OverrunSensitivity, IssuePolicy, IssueBlockCode,
  IssueCheck, IssueDecision, DevilsAdvocateSource, OverrunArgument, DevilsAdvocate,
  ServiceOfferLike, UnderwriteRequest, UnderwriteResponse,
} from './underwrite.js';
export {
  EFFORT_TRIPLES_ARE_PLACEHOLDERS, placeholderEffortTriple, placeholderEffortTriples,
  effortFromRequest, effortToDuration, isZeroVarianceEffort,
  UNDERWRITE_VERDICT_LABEL, isRefusal, BASIS_LABEL, MIN_OUTCOMES_FOR_MEASURED,
  outcomeBlend, resolveBasis, PERCENTILE_METHOD, orderStatisticIndex,
  STOCHASTIC_INPUT_LABEL, DEFAULT_SAMPLE_COUNT, DEFAULT_SEED, VARIANCE_METHOD,
  UNDERWRITE_METHOD, underwrite, DEFAULT_EFFORT_UPLIFTS, OVERRUN_METHOD,
  overrunSensitivity, ISSUE_POLICY_IS_A_STATED_PRIOR, DEFAULT_ISSUE_POLICY,
  shouldBlockIssue, devilsAdvocate, buildUnderwriteResponse,
} from './underwrite.js';

/* ── Phase 8 — origination: why now, and what we do not know ──────────────────*/
export type {
  FactInput, FactProvenance, TriggerKind, TriggerState, TriggerInput, WhyNowTrigger,
  RefusalDisposition, RefusalEntry, RefusalLedger, OriginationInput, QueueRow,
  DeferredCut, OriginationQueue, OriginationOptions, BriefSection, AssertionStatus,
  BriefEstimate, BriefAssertion, ProposedOpening, BriefViolationCode, BriefViolation,
  BriefIntegrity, BriefDraft, ResearchBrief, UnknownsInput, OriginationResponse,
  BriefResponse,
} from './origination.js';
export {
  FACT_STALE_CONFIDENCE, FACT_HALF_LIFE_DAYS, factProvenance, provenanceLabel,
  TRIGGER_KIND_LABELS, TRIGGER_SHELF_LIFE_DAYS, TRIGGER_SHELF_LIFE_BASIS,
  resolveTrigger, refusalLedger, SCORING_FIELDS, QUEUE_CAPACITY_DEFAULT,
  buildOriginationQueue, BRIEF_SECTION_LABELS, BRIEF_SECTION_ORDER, briefEstimate,
  briefIntegrity, sealBrief, deriveUnknowns, originationResponse,
} from './origination.js';

/* ── Phase 9 — the regulatory perimeter ───────────────────────────────────────
 * `PerimeterStatus` is ALIASED to `PerimeterEntryStatus`. `targeting.ts` already
 * publishes a different `PerimeterStatus` through this barrel (line 78) — a
 * target-screening verdict ('in_perimeter' | 'outside_perimeter' | 'unknown').
 * Perimeter's is the freshness/well-formedness state of a jurisdiction ROW. Two
 * unrelated things; exporting both under one name is TS2308, and picking one
 * silently would let a caller read a row's staleness as a screening verdict.
 * `apps/api/src/gps/origination.ts:87` and `routes/gpsOrigination.ts:68` mean the
 * targeting one, so that name keeps its meaning and the newcomer is the one renamed.
 */
export type {
  ServiceClass, PerimeterClass, PerimeterEntry, JurisdictionProfile,
  PerimeterStatus as PerimeterEntryStatus, PerimeterClassification,
  ServiceGateCode, ServiceGateResult, ServiceGateInput, ServiceGateDecision,
} from './perimeter.js';
export {
  SERVICE_CLASS_LABEL, normaliseJurisdiction,
  PERIMETER_IS_UNREVIEWED, PERIMETER_UNREVIEWED_REASON, PERIMETER_PROFILES,
  getJurisdictionProfile, perimeterEntryDefects,
  PERIMETER_STATUS_LABEL, PERIMETER_REVIEW_WARNING_DAYS, classify,
  SERVICE_GATE_ORDER, gateService,
} from './perimeter.js';

/* ── Phase 9 — disclosures: exact version pins, and a throw on a blank field ──*/
export type {
  ProhibitedPromise, DisclosureField, DisclosureContext, DisclosureId,
  DisclosureTemplate, DisclosureErrorCode, RenderOptions, RenderedDisclosure,
  DisclosureUseRecord, DisclosureLibrarySnapshot,
} from './disclosure.js';
export {
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED, DISCLOSURES_UNREVIEWED_REASON,
  PROHIBITED_PROMISES, PROHIBITED_PROMISE_LABEL, PROHIBITED_PROMISE_SENTENCE,
  CONTRACTING_ENTITY_DISCLOSURE_NAME, DISCLOSURE_TEMPLATES, getDisclosureTemplate,
  DisclosureError, renderDisclosure, requiredDisclosures, missingDisclosures,
  DISCLOSURE_LIBRARY_VERSION, disclosureRecord, getDisclosureLibrarySnapshot,
} from './disclosure.js';

/* ── Phase 10 — the delivery desk view ────────────────────────────────────────
 * `ProgressDisplay` is a discriminated union whose `blocked` variant has NO `pct`
 * field, so no surface can type "57% done" on a blocked engagement — the compiler
 * refuses. Keep it exported as the union, never widened.
 */
export type {
  ScopeDriftDirection, ScopeDriftCode, ScopeDriftFailure, CriterionCoverage,
  ScopeDriftVerdict, LiveMilestoneState, PlanRow, EngagementPlan, ProgressDisplay,
  BlockerRow, ProgressView, EvidenceChaseRow, EvidenceChase, AcceptanceRow,
  AcceptanceView, WipCeiling, AnotherEngagementAnswer, WipView,
  DeliveryEngagementRef, DeliveryNoticeCode, DeliveryNotice, DeliveryLockoutNotice,
  DeliveryResponse, DeliveryResponseInput,
} from './deliveryView.js';
export {
  SCOPE_DRIFT_MECHANISM, classifyScopeDrift, composeEngagementPlan,
  composeProgressView, EXTERNAL_REFERENCE_IS_INERT, composeEvidenceChase,
  REVIEW_GATE_MECHANISM, REVIEW_GATE_DB_CONSTRAINT, composeAcceptanceView,
  composeWipView, composeDeliveryResponse,
} from './deliveryView.js';

/* ── Phase 12 — the loop: capture, review, and a rate that refuses to appear ──
 * `proposedWeightChanges: never[]` makes auto-adjusting a scoring weight
 * inexpressible, and `SuppressibleRate.pct` is `number | null` — never `number`.
 */
export type {
  LoopVolumeStatement, Interval95Pct, SuppressibleRate, CaptureSubject,
  OutcomeCaptureDraft, CaptureFieldKey, CaptureFieldStatus, CaptureFieldState,
  CaptureBlockerCode, CaptureBlocker, CaptureCompleteness, OutcomeCaptureForm,
  ReviewFactorRow, ReviewPacket, EvidenceVerdict, Conclusion, CalibrationHealthView,
  ProposingActionId, MonitorOp, BookMonitorKey, BookMonitorCondition,
  BookMonitorProposal, BookMonitorSpec, WbrGpsInput, WbrGpsBlock, LoopDataSource,
  LoopResponse, LoopInput,
} from './loop.js';
export {
  LOOP_VOLUME_STATEMENT, suppressibleRate, EMPTY_OUTCOME_CAPTURE_DRAFT,
  outcomeCaptureForm, FACTOR_VERDICT_LABELS, reviewPacket, EVIDENCE_VERDICT_LABELS,
  calibrationHealthView, BOOK_MONITOR_SPECS, registerableBookMonitors, wbrGpsBlock,
  loopResponse,
} from './loop.js';
