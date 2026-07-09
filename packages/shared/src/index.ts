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

// Enrichment engine (Slice 4)
export type {
  CoinGeckoCoin, CoinGeckoMarketData,
  EnrichmentResult, EnrichmentReport,
  MatchResult, EnrichableProject,
  EnrichmentSignal, EnrichmentOutput,
} from './enrich/index.js';
export { CoinGeckoClient, matchProject, buildMatchIndex } from './enrich/index.js';
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
  generateDraft,
} from './claims/index.js';
export type { GenerateDraftOptions } from './claims/index.js';

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

// Deal desk + proposals (Slice 12)
export type {
  PackageConfig, DealPackage,
  DealStage, ProposalSnapshot,
} from './deals/index.js';
export {
  PACKAGES, DEAL_PACKAGE, STAGES, STAGE_LABELS,
  canTransition, defaultPackageValue, generateProposal,
} from './deals/index.js';
