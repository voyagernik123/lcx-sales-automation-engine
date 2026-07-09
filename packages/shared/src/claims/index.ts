export type {
  Jurisdiction,
  RiskLevel,
  ClaimCategory,
  Channel,
  Claim,
  ClaimLibrarySnapshot,
  DraftTemplate,
  DraftInput,
  DraftOutput,
  SavedDraft,
} from './types.js';

export {
  getClaims,
  getClaimsByCategory,
  getClaimById,
  getClaimsByJurisdiction,
  getClaimsForJurisdictionAndCategory,
  getClaimLibrarySnapshot,
  claimRequiresReview,
  CLAIM_DISCLAIMER,
} from './claims.js';

export {
  getTemplates,
  getTemplateByTouch,
  getTemplateById,
} from './templates.js';

export {
  validateDraftOutput,
  validateClaimsUsed,
} from './messageRules.js';
export type { RuleViolation, ValidationResult } from './messageRules.js';

export { generateDraft } from './draftEngine.js';
export type { GenerateDraftOptions } from './draftEngine.js';
