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
  validateConnectionNote,
  LINKEDIN_CONNECT_NOTE_MAX,
} from './messageRules.js';
export type { RuleViolation, ValidationResult } from './messageRules.js';

export { generateDraft } from './draftEngine.js';
export type { GenerateDraftOptions } from './draftEngine.js';

export { generateReplyDrafts } from './replyEngine.js';
export type { ReplyAngle, ReplyDraftInput, ReplyDraftCandidate } from './replyEngine.js';
