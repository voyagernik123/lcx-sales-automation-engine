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
  /*
   * F5 + THE FLOOR (2026-08-07). Unblocked by the owner's decision that a NAMED HUMAN may
   * assert a partner and a rate card, attributed to them — the one foundation the plan said
   * needed an answer before it could exist at all.
   *
   * `SuppliedInput<T>` is the reason this list grew rather than a convenience: the floor's
   * inputs each carry loaded / not_loaded / withheld / empty as a TYPE, so the three states
   * cannot collapse on the way to a price. A floor is the most dangerous number GPS can
   * print — it reads as a policy minimum — so every one of its twenty refusal codes is
   * exported too, and callers return ALL of them rather than the first.
   */
  PartnerAssertion, PartnerAssertionDefectCode, PartnerAssertionDefect,
  SuppliedInput, FloorEffortPoint, FloorEffortInput,
  FloorRefusalCode, FloorRuleCitation, FloorRemedyOwner, FloorRefusal,
  FloorObservationFrame, PriceFloorRequest, PriceFloorOutcome,
  PartnerRegistryRegisters, PartnerRegistryBenchMember, PartnerRegistryBench,
  PartnerRegistryDesk, PartnerRegistryFloorView,
} from './partners.js';
export {
  SENIORITY_LABEL, SENIORITY_ORDER, RATE_UNIT_LABEL, PARTNER_BENCH,
  SCORECARD_CONFIDENCE_LABEL,
  meetsSeniority, capabilityCoversJurisdiction, rateCardStatus, rateCardCostCents,
  benchHeadroom, headroomFor, canAcceptEngagement, partnerScorecard, marginAtRisk,
  // F5 + THE FLOOR — see the note in the type block above.
  PARTNER_ASSERTION_IS_A_CLAIM, PARTNER_REGISTRY_FLOOR_CONTRACT,
  FLOOR_EFFORT_POINTS, FLOOR_EFFORT_POINT_LABEL, FLOOR_REFUSAL_CODES, FLOOR_EXCLUDES,
  partnerAssertionDefects, isAssertedPartner,
  inputLoaded, inputNotLoaded, inputWithheld, inputEmpty,
  priceFloor, isPriceFloor,
  partnerRegistryDeskDefects, partnerRegistryFloorDefects,
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
  /*
   * THE OTHER LEDGER (2026-08-07). The owner's answer: GPS may read the listing pipeline
   * VERDICT ONLY, and every read is logged.
   *
   * `ListingPerimeterReading` is the whole design in one type — it carries a verdict, never
   * a pipeline row — because minimum disclosure is a property of what the function CAN
   * return, not a promise in a comment. A conflict wall that cannot see whether a services
   * client is a listing candidate is blind to the one case it exists for; this is the
   * plan's largest uninsured liability (Art 88/90/91(3)(c), ~EUR 700k PERSONAL).
   */
  ListingPerimeterCode, ListingPerimeterReading, ListingPerimeterFinding,
  ListingContradiction,
} from './disclosure.js';
export {
  GPS_LISTING_VERDICTS, listingPerimeterFinding, listingContradiction,
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
  /* G7: registerability MEASURED against what the registers hold, so the three
   * placeholder-blocked monitors light up on the day their inputs exist rather than
   * on the day someone edits a boolean. */
  MONITOR_INPUT_KEYS, MONITOR_INPUT_LABEL, monitorRegistrability,
} from './loop.js';
export type { MonitorInputKey, MonitorInputAvailability, MonitorRegistrability } from './loop.js';

/* ── THE INPUT DESK CONTRACT — the three inputs only a human can supply ───────
 * `contracts/inputs.ts` is the wire shape for `apps/api/src/routes/gpsInputs.ts` (price
 * bands, effort triples, rate cards) and for `apps/web/src/pages/GpsInputs.tsx`, plus
 * `deskContractDefects` — a runtime predicate BOTH sides are measured against, because
 * the `GpsSummary` crash was two hand-written artefacts agreeing with each other.
 *
 * WHOLESALE, unlike the twelve blocks above, and the reason is the failure mode this line
 * closes rather than a change of taste: a name list is a second place to forget, and a
 * symbol can be exported from its own module and still be invisible here — TS2305 at every
 * call site, with no signal until an emit build in Docker order fails. The blocks above
 * predate that lesson and are left alone because rewriting a working list buys nothing.
 *
 * WHAT THIS LINE UNBLOCKS. `apps/api/src/routes/gpsInputs.ts` carried its own copy of the
 * currency rule (`ISO_4217`) because it could not name `CURRENCY_CODE_RE`; the api now
 * imports the shared one and there is a single definition of what a currency code is. The
 * web page moves off its relative specifier at the same time.
 *
 * NO COLLISION TO ALIAS. Checked before the line was added: all nineteen symbols were
 * grepped against the whole of `packages/shared/src`, in declaration and re-export form,
 * and none matched. `GpsInputRefusalCode` is deliberately NOT named `RefusalCode` — that
 * name is already the one cross-compartment collision (`../index.ts:200`), resolved there
 * by precedence. A clash would be TS2308 on the shared emit build, and it would be aliased
 * HERE, inside this compartment, exactly as `PerimeterStatus as PerimeterEntryStatus` is
 * above — never in `../index.ts`. Reachability of every symbol through the root barrel is
 * asserted by `../barrelReachability.test.ts`, so this is a checked claim. */
export * from './contracts/inputs.js';

/* ── G0 — the founder packets ─────────────────────────────────────────────────
 * Five proposals the owner approves or edits (GPS_REVENUE_100X_PLAN.md §G0). The
 * validator is exported because the API's decide route runs THE SAME defect check
 * the builder's tests run — one bar, both sides of the approval.
 */
export type {
  PacketKind, PacketProvenance, PacketGrade, PacketEvidence, PacketPriceBandRow,
  PacketEffortTripleRow, RateCardProposalRow, PerimeterSeedRow, DpoOption,
  DpoMemoProposal, PacketProposal, FounderPacket,
} from './packets.js';
export {
  PACKET_KINDS, PROVENANCE_GRADE, buildFounderPackets, packetProposalDefects,
  placeholderBandFor,
} from './packets.js';

/* ── G1 — the demand layer ────────────────────────────────────────────────────
 * Four channels into one candidate queue (GPS_REVENUE_100X_PLAN.md §G1). Candidates
 * PROMOTE to origination targets by a human act; the validator is shared with the API
 * edge, and the Telegram parser is a sieve whose drop-report travels with its result.
 */
export type {
  DemandSource, OfferHypothesis, DemandCandidate, CrossfeedProjectInput,
  TelegramParseReport, TelegramParseResult, IntakeFields,
} from './demand.js';
export {
  DEMAND_SOURCES, SNIPPET_MAX, INTAKE_MESSAGE_MAX, demandCandidateDefects,
  crossfeedSignals, parseTelegramExport, partnerRoomCounterpart, intakeCandidate, referralCandidate,
} from './demand.js';

/* ── G2 — dossiers & outreach ─────────────────────────────────────────────────
 * The cite-or-refuse contract (GPS_REVENUE_100X_PLAN.md §G2, doctrine D10). The
 * validator is exported because the API refuses a model response with THE SAME
 * function these tests exercise — one bar on both sides of the LLM boundary, the
 * same shape G0 uses for packets. Outreach drafts pass through the marketing
 * outbound gate at the API; nothing here or there sends anything.
 */
export type {
  DossierFact, DossierTargetView, DossierPrompt, DossierDefectCode, DossierDefect,
  OutreachChannel, OutreachDefectCode, OutreachDefect,
} from './dossier.js';
export {
  DOSSIER_HEADINGS, MODEL_SECTION_CAVEAT, DOSSIER_MAX_CHARS,
  OUTREACH_CHANNELS, OUTREACH_MAX_CHARS,
  dossierFacts, buildDossierPrompt, dossierDefects,
  buildOutreachPrompt, outreachDefects,
} from './dossier.js';

/* ── G3 — the inverse solver and its two dials ────────────────────────────────
 * The owner's pricing policy (approved through the sixth founder packet) and the
 * arithmetic that turns it into a proposed price over the forward underwriting's
 * own cost order statistics. One bounds predicate (`pricingPolicyDefects`) serves
 * the packet validator, the solver and the API route — the same one-bar shape as
 * G0's packets and G2's dossiers.
 */
export type {
  PricingPolicyValues, CostQuantiles, PriceProposalBasis, PriceProposalOutcome,
} from './pricing.js';
export {
  PRICING_POLICY_BOUNDS, PRICE_PROPOSAL_METHOD,
  pricingPolicyDefects, costQuantilesFrom, proposePriceCents,
} from './pricing.js';

/* ── The perimeter grid's wire shape — one declaration, both sides ────────────
 * Moved from apps/api/src/gps/conflict.ts so the conflict-wall page can read the
 * DATABASE-backed view (real rows exist since the G0 packet landed) without
 * hand-mirroring a wire shape — the defect class that once shipped a crash
 * behind a green build. Types only; the composer stays in the API.
 */
export type {
  PerimeterSource, PerimeterCell, PerimeterHole, PerimeterView,
} from './perimeterView.js';

/* ── The stored target's wire shape — one declaration, both sides ─────────────
 * Moved from apps/api/src/gps/origination.ts for the cure surface: the refusal
 * ledger's remedies name fields (decision maker, budget, conflict) that the web
 * must WRITE BACK through the replace-not-patch save, so it must read the same
 * record the API composes — including evidenceObservedIso, which the derived
 * ageDays view drops and every cure would otherwise destroy. Types only.
 */
export type { TargetRecord } from './targetRecord.js';

/* ── G5 — the delivery factory's Stage 1 ──────────────────────────────────────
 * Templates whose client slots are DERIVED from the catalogue's own
 * requiredClientInputs — proposal, portal form and draft refusal read one list.
 * `slotGaps` is the D10 refusal (and the chase list); `composeDraftPrompt` throws
 * over a gap so no caller can skip the refusal; `draftDefects` holds the same
 * shape-or-refuse bar as dossiers. Truth-checking is Stage 2's job, by design.
 */
export type {
  FactorySlotSource, FactorySlot, FactoryTemplate, FactoryPrompt,
  DraftDefectCode, DraftDefect, FactoryStage,
} from './factory.js';
export {
  FACTORY_OFFER_KEYS, FACTORY_STAGES, DRAFT_MAX_CHARS,
  factoryTemplate, slotGaps, composeDraftPrompt, draftDefects,
} from './factory.js';

/* ── G6 — money ───────────────────────────────────────────────────────────────
 * The pure parts: the number IS the identity (immutable), aging mirrors the deposit
 * brackets and refuses to sum across currencies, and the chase is deterministic —
 * three facts and a question, no promise language — so the numbers are the invoice's
 * and nothing else. The API runs the chase through the outbound gate before anyone
 * sees it; nothing here sends.
 */
export type {
  InvoiceStatus, InvoiceAgingInput, InvoiceAgingBracket, InvoiceAging, ChaseInput,
} from './invoicing.js';
export {
  INVOICE_STATUSES, OPEN_INVOICE_STATUSES, CHASE_MAX_CHARS,
  formatInvoiceNumber, invoiceAging, buildChaseText,
} from './invoicing.js';

/* ── G5's closing leg — what the waterfall actually cost ──────────────────────
 * `gps_stage_actual` rows measured per offer. Observed order statistics print at any
 * n (a recorded hour is a fact); the VERDICT on a stated effort triple is an
 * inference and is withheld below MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT. Nothing here
 * mutates a triple — `observedEffortEvidence` feeds the effort-triples PACKET, so
 * the loop closes through a named human's approval exactly as decision 8 requires.
 */
export type {
  StageActualInput, StatedTriple, StageShape, TripleVerdict, OfferWaterfall, WaterfallShape,
  WaterfallOptions,
} from './waterfall.js';
export {
  MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT, WATERFALL_VOLUME_BASIS,
  DELIVERY_FINISHED_STATUSES, isDeliveryFinished,
  waterfallShape, observedEffortEvidence,
} from './waterfall.js';

/* ── G5 Stage 2 — diffable drafts ─────────────────────────────────────────────
 * A pure LCS line diff so a QA reviewer sees which CLAIM changed instead of
 * re-reading the whole draft. `diffHeadline` surfaces the one derived signal that
 * matters: whether a revision closed a [FACT REQUIRED] hole or opened a new one.
 */
export type { DiffKind, DiffLine, DraftDiff } from './draftDiff.js';
export { draftDiff, diffHeadline } from './draftDiff.js';
