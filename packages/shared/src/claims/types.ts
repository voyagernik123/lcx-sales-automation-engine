export type Jurisdiction = 'eu' | 'us' | 'global';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ClaimCategory =
  | 'eu_access'
  | 'mica_awareness'
  | 'us_path'
  | 'listing_package'
  | 'liquidity'
  | 'marketing';

export type Channel = 'email' | 'linkedin' | 'telegram';

export interface Claim {
  id: string;
  category: ClaimCategory;
  text: string;
  jurisdiction: Jurisdiction[];
  riskLevel: RiskLevel;
  requiresHumanReview: boolean;
  version: number;
  active: boolean;
}

export interface ClaimLibrarySnapshot {
  version: number;
  claims: Claim[];
  updatedAt: string;
}

export interface DraftTemplate {
  id: string;
  touchIndex: number;
  channel: Channel;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface DraftInput {
  projectName: string;
  projectTicker: string | null;
  projectWebsite: string | null;
  projectChain: string | null;
  projectEuScore: number | null;
  projectUsPreScore: number | null;
  projectUsPostScore: number | null;
  projectBand: string;
  scoreReasons: { code: string; factor: string; points: number; note: string }[];
  contactName: string;
  contactTitle: string | null;
  contactRole: string;
  jurisdiction: Jurisdiction;
  clarityEnacted: boolean;
  touchIndex: number;
  channel: Channel;
  market: string | null;
}

export interface DraftOutput {
  subject: string;
  body: string;
  channel: Channel;
  touchIndex: number;
  claimsUsed: string[];
  requiresHumanReview: boolean;
  templateId: string;
  operatorEdited: boolean;
}

export interface SavedDraft {
  id: string;
  projectId: string;
  contactName: string;
  subject: string;
  body: string;
  channel: Channel;
  touchIndex: number;
  claimsUsed: string[];
  requiresHumanReview: boolean;
  operatorEdited: boolean;
  approved: boolean;
  sent: boolean;
  createdAt: string;
  updatedAt: string;
}
