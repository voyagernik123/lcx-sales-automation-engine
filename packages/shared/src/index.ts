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
export { TEAM, normalizeEmail, findMemberByEmail, isAllowedEmail } from './operators.js';

// Intelligence spine (Wave 0) — provenance + actions
export type { Reliability, Credibility, SourceKind, SourceDef, Observation } from './provenance.js';
export { RELIABILITY_LABEL, CREDIBILITY_LABEL, SOURCES, getSource, confidenceFrom } from './provenance.js';
export type { ActionId, ActionDef } from './actions.js';
export { ACTION_DEFS, actionsFor, getAction, SERVER_ACTIONS, isServerAction } from './actions.js';
export type { ConnectorDef } from './collection.js';
export { CONNECTORS, getConnector, isStale } from './collection.js';

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
export type { ForecastDealInput, MonteCarloResult } from './forecast/index.js';
export { dealWinProbability, monteCarloForecast } from './forecast/index.js';
