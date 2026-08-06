export type {
  DbStatus,
  HealthResponse,
  ApiErrorBody,
  ApiSuccessBody,
  OperatorPrincipal,
} from './types/bd';

// Scoring engine (Slice 3 / Slice 13)
export type {
  ScoreBand, ReasonTrail, RedFlagResult,
  ScoreInputProject, ScoreInputContact, ScoreInputSignal,
  EuScoreResult, UsScoreResult, ProjectScoreResult,
  ScoreContext, RecommendedMarket,
} from './scoring/types.js';
export { computeBand, maxBand, BAND_THRESHOLDS } from './scoring/types.js';
export { scoreEu } from './scoring/eu.js';
export { scoreUs } from './scoring/us.js';
export { scoreProject } from './scoring/orchestrator.js';

// Listing propensity (who is most likely to pay)
export type {
  PropensityInput, PropensityWeights, PropensityResult, McapBand, VolBand,
} from './scoring/propensity/features.js';
export {
  scorePropensity, combinePriority, mcapBand, volMcapBand, categoryFits, chainFits,
} from './scoring/propensity/features.js';
export { PROPENSITY_WEIGHTS_V1, MODEL_VERSION } from './scoring/propensity/weights.js';

// Enrichment engine (Slice 4)
export type {
  CoinGeckoCoin, CoinGeckoMarketData, CoinGeckoMarketRow, CoinGeckoTicker,
  EnrichmentResult, EnrichmentReport,
  MatchResult, EnrichableProject,
  EnrichmentSignal, EnrichmentOutput,
  PaprikaTicker, PaprikaCoin, PaprikaMarket,
  LlamaProtocol, LlamaRaise,
  GtNewPool,
} from './enrich/index.js';
export {
  CoinGeckoClient, CoinPaprikaClient, DefiLlamaClient, GeckoTerminalClient,
  matchProject, buildMatchIndex,
} from './enrich/index.js';
export { enrichProject, enrichBatch, formatEnrichmentReport } from './enrich/index.js';

// Claim library + Draft engine (Slice 8)
export type {
  Jurisdiction, RiskLevel, ClaimCategory, Channel,
  Claim, ClaimLibrarySnapshot,
  DraftTemplate, DraftInput, DraftOutput, SavedDraft,
  RuleViolation, ValidationResult,
} from './claims/index.js';
export {
  getClaims, getClaimsByCategory, getClaimById,
  getClaimsByJurisdiction, getClaimsForJurisdictionAndCategory,
  getClaimLibrarySnapshot, claimRequiresReview,
  CLAIM_DISCLAIMER,
  getTemplates, getTemplateByTouch, getTemplateById,
  validateDraftOutput, validateClaimsUsed,
  validateConnectionNote, LINKEDIN_CONNECT_NOTE_MAX,
  generateDraft, generateReplyDrafts,
} from './claims/index.js';
export type { GenerateDraftOptions, ReplyAngle, ReplyDraftInput, ReplyDraftCandidate } from './claims/index.js';

// Outreach sequences (Slice 9)
export type {
  SequenceStatus,
  MessageStatus,
  EnrollmentStatus,
  SequenceStep,
  StepChannel,
  CadenceDay,
} from './outreach/index.js';
export { CADENCE, MIXED_CADENCE_CHANNELS, computeScheduledDate } from './outreach/index.js';

// Normalization helpers (dedupe keys, matcher, label joins)
export { squash, squashEntity } from './normalize.js';

// Desk roster + email allowlist (shared by the web front door and API auth)
export type { TeamMember, TeamRole } from './operators.js';
export {
  TEAM, normalizeEmail, findMemberByEmail, isAllowedEmail, findMemberById, ownerLabel,
  // Second-tier sign-in (2026-08-01): the DOMAIN gate — distinct from the roster
  // gate `isAllowedEmail` — plus the leavers list that keeps a departed colleague
  // from walking back in on a shared passcode.
  LCX_EMAIL_DOMAIN, isLcxDomainEmail, DEPARTED_MEMBER_EMAILS, hasDeparted,
} from './operators.js';
export type { WorkspaceId, Capability, EntitlementMap, WorkspaceDef } from './workspaces.js';
export {
  WORKSPACES, WORKSPACE_IDS, getWorkspace, capAtLeast,
  workspaceForPath, workspaceForApiPath, legacyEntitlements,
  FOUNDING_MEMBER_IDS,
} from './workspaces.js';

// Intelligence spine (Wave 0) — provenance + actions
export type { Reliability, Credibility, SourceKind, SourceDef, Observation } from './provenance.js';
export { RELIABILITY_LABEL, CREDIBILITY_LABEL, SOURCES, getSource, confidenceFrom, admiraltyCode, newsReliability } from './provenance.js';

// Estimative language (Phase 2.2) — ICD-203 tradecraft vocabulary.
export type { LikelihoodTerm, LikelihoodBand, Likelihood, ConfidenceLevel, ConfidenceInput } from './estimative.js';
export { LIKELIHOOD_BANDS, likelihood, estimativeConfidence, CONFIDENCE_LABEL, estimativePhrase } from './estimative.js';
export type { ActionId, ActionDef } from './actions.js';
export { ACTION_DEFS, actionsFor, getAction, SERVER_ACTIONS, isServerAction } from './actions.js';
export type { ConnectorDef } from './collection.js';
export { CONNECTORS, getConnector, isStale } from './collection.js';
export type {
  SignalBundle, Driver, ScoreResult, TimingWindow, AlphaAssessment, Hypothesis, AchResult,
} from './alpha.js';
export {
  listingPropensity, timingWindow, dealValue, winnability, assess, ach, HYPOTHESIS_LABEL,
} from './alpha.js';
export type { PlayFacts, Draft, PlayResult } from './plays.js';
export { selectPlay, renderPlay, PLAY_IDS } from './plays.js';
export type { Sentiment, ConversationInsights } from './conversation.js';
export { analyzeConversation } from './conversation.js';

// Deal desk + proposals (Slice 12)
export type {
  PackageConfig, DealPackage,
  DealStage, ProposalSnapshot, ProposalTier,
} from './deals/index.js';
export {
  PACKAGES, DEAL_PACKAGE, STAGES, STAGE_LABELS,
  canTransition, defaultPackageValue, generateProposal, buildProposalTiers,
} from './deals/index.js';

// Deal forecasting (win probability + Monte Carlo)
// `DealDecisiveness`, `DecisivenessRefusal` and `ForecastExclusion` are published
// here because consumers were otherwise reaching into
// '@lcx/shared/dist/forecast/index.js' or redeclaring the shape locally — and a
// second declaration of a refusal type is how two definitions of "withheld" drift
// apart. A name list is a place to forget (see the two `export *` notes below);
// these are the ones that were forgotten.
export type {
  ForecastDealInput, MonteCarloResult,
  DealDecisiveness, DecisivenessRefusal, ForecastExclusion,
} from './forecast/index.js';
export { dealWinProbability, monteCarloForecast } from './forecast/index.js';

// LCX COMMAND — launch-schedule Monte Carlo (Wave 2)
// `TaskCompression` is the MAGNITUDE limb (days bought per day of compression),
// added after this line was first written and missing from it: apps/web declared a
// structural copy of the row to compensate.
export type { SimTaskInput, DurationTriple, LaunchSimOptions, LaunchSimResult, TaskCriticality, TaskCompression } from './launchSim.js';
export { runLaunchSim, prepareGraph, sampleTriangular, resolveDuration, DEFAULT_DURATIONS } from './launchSim.js';

// LCX COMMAND — decision engines (100X Phase 2)
export type {
  EngineDim, EngineRow, RescoredRow, SensitivityEntry, SetAnalysis,
  RfiTerms, VolumeMix, RfiEconomics, FunnelChannelInput, FunnelParams, WaitlistSimResult,
  BlockerState, RequirementState, DdDim, ProgramReadinessInput,
} from './commandEngines.js';
export {
  rescore, sensitivity, analyzeSet, parseSpreadBps, rfiEconomics,
  waitlistSim, listingReadiness, tokenDdScore, programReadiness,
} from './commandEngines.js';

// GLOBAL SERVICES (GPS) — the services business, Phase 1: offer → proposal → deposit.
// Compiled offer catalogue + engagement domain. Prices are TODO placeholders
// (PRICE_BANDS_ARE_PLACEHOLDERS) and CATALOGUE_TODOS names what is still missing.
// No artifact/upload surface here by construction — Phase 3 is gated on the DPO
// question (GPS_IMPLEMENTATION_PLAN.md §4 S0.4).
//
// This is a WHOLESALE re-export, not a name list, and that is deliberate. The
// name list was the binding gap that made every `import … from '@lcx/shared'` in
// apps/api and apps/web a TS2305: a symbol could be in `gps/index.ts` and still be
// invisible here, which is a failure mode with no signal until an emit build in
// Docker order fails. `export *` cannot drift from the compartment it publishes.
// Collisions surface as TS2308 at compile time and are aliased inside
// `gps/index.ts` (see `PerimeterStatus as PerimeterEntryStatus` there), never here.
export * from './gps/index.js';

// MARKETING — the X desk. Pure engine: which regime applies (Art 66 vs Art 7 vs Title VI
// vs UCPD), the claim-safety gate with the strip-versus-refuse split, the Art 7
// boilerplate arithmetic that proves a listing promo cannot fit in a tweet, the
// engagement-verb adoption model, the RESIST 2 triage taxonomy, the market-abuse
// perimeter, the crisis room, desk mode including an Art 94 suspension, and the honesty
// ceiling that keeps reach, impressions and share-of-voice off every panel by making them
// a compile error. No I/O, no clock, no randomness anywhere in it.
//
// THERE IS NO X CREDENTIAL AND NEVER WILL BE, and nothing in this compartment posts,
// authenticates as, or holds a token for the LCX account. Drafts are handed to a human
// who sends by hand, outside this system.
//
// WHOLESALE, for the reason recorded above the GPS export and proved again here: this
// barrel's marketing entry did not exist, `marketing/index.ts` was a hand-maintained name
// list covering `types.ts` only, and `apps/api/src/marketing/abuseRegister.ts` therefore
// failed with eight TS2305s on symbols that WERE exported from their own module. A name
// list is a second place to forget, with no signal until an emit build in Docker order
// fails. Collisions surface as TS2308 at compile time and are resolved inside
// `marketing/index.ts` — see the fourteen recorded there, each of which was a duplicated
// rule rather than a naming accident.
export * from './marketing/index.js';

// THE ONE CROSS-COMPARTMENT COLLISION, resolved by precedence rather than by renaming a
// hundred call sites. `gps/partners.ts` and `marketing/types.ts` both export a type named
// `RefusalCode`, and two `export *` providing one name is a TS2308. An explicit named
// re-export in THIS module wins over both stars, which is what the compiler's own
// "consider explicitly re-exporting" message means.
//
// GPS keeps the unqualified name because it is the incumbent: it is already bound across
// apps/api and apps/web, and this compartment is the newcomer. Marketing's is published
// under a name that says which desk it belongs to.
//
// WHY THIS IS NOT COSMETIC. `apps/api/src/marketing/abuseRegister.ts:56-72` hit this and
// worked around it by QUOTING three code strings as a literal union, because
// `import type { RefusalCode } from '@lcx/shared'` silently resolved to GPS's union —
// which contains none of them — and produced an error that read as though the marketing
// vocabulary were wrong. Silent resolution to the wrong compartment's union is the exact
// failure this alias removes: `MarketingRefusalCode` cannot be mistaken for GPS's, and
// `PerimeterRefusalHint` is now a checked subset of it rather than three hopeful strings.
export type { RefusalCode } from './gps/index.js';
export type { RefusalCode as MarketingRefusalCode } from './marketing/index.js';

// DISTRIBUTION — growth engines (LCX ONE Phase 4)
export type {
  ReferralParams, ReferralSimResult, EmissionInput, EmissionResult,
  QuestChannelInput, QuestCacResult, ChannelMixResult,
  AttributionEvent, AttributionResult, PresenceInput, PresenceResult,
} from './distributionEngines.js';
export {
  referralViralitySim, emissionBudget, questCacSim,
  channelMix, attributeChannels, presenceScore,
} from './distributionEngines.js';

// GEOMETRY — the third dimension, as an engine rather than as decoration.
//
// A pure isometric projector and mesh builder. It takes a grid of z values and returns
// COORDINATES; it draws nothing, holds no DOM, and has no colour in it. `components/geometry`
// is the only thing that renders, which is what makes a figure on this platform recomputable
// by an auditor from the same numbers rather than merely inspectable.
//
// IT REFUSES ON THE SAME TERMS AS EVERY OTHER READING HERE. A grid with no environment, no
// observation date, no source, a degenerate axis, a non-finite z or nothing observed at all
// returns refusals with codes and rule citations instead of a figure — because a 3-D surface
// is the single most persuasive thing this platform can put on a screen, and a persuasive
// figure built on an absent measurement is worse than no figure. `null` is a cell nobody
// measured and draws as a HOLE; `WITHHELD` is a cell that was measured and may not be shown,
// and it counts and draws separately. Collapsing those two is the failure the doctrine names.
//
// WHOLESALE, for the reason recorded above the GPS and MARKETING exports and proved twice by
// it: a hand-maintained name list is a second place to forget, with no signal until an emit
// build in Docker order fails.
export * from './geometry/index.js';
