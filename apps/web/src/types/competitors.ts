import { SourceAuthority } from './ontology';

export type CompetitorStatus = 'public' | 'private' | 'blocked' | 'defunct';
export type ThreatLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
export type ClarityActPosition = 'strong_beneficiary' | 'moderate' | 'minimal' | 'irrelevant' | 'blocked';
export type LegalSeverity = 'Resolution' | 'Fine' | 'Settlement' | 'Lawsuit' | 'Criminal';

export interface LegalEvent {
  id: string;
  year: number;
  event: string;
  regulator: string;
  outcome: string;
  severity: LegalSeverity;
  amount?: string;
  status: 'Resolved' | 'Ongoing';
}

export interface CompetitorLicenseProfile {
  bitLicense: boolean;
  fincenMSB: boolean;
  spdiCharter: boolean;
  occTrustCharter: boolean;
  nyTrustCharter: boolean;
  finraBD: boolean;
  cfdtcDCO: boolean;
  euMiCA: boolean;
  otherLicenses: string[];
}

export interface CompetitorFinancials {
  revenue: string;
  revenueYear: number;
  netIncome?: string;
  quarterlyVolume: string;
  assetsOnPlatform: string;
  valuation?: string;
  employees?: number;
}

export interface CompetitorHoweyProfile {
  avgScore: number;
  lowestScoreAsset: string;
  highestScoreAsset: string;
  listingStrategy: 'Greenlist-only' | 'Selective' | 'Broad' | 'Aggressive';
  notes: string;
}

export interface ClarityActAssessment {
  position: ClarityActPosition;
  preClarityMTLCount: number;
  postClarityMTLCount: number;
  costSavingsEstimate: string;
  strategicShift: string;
}

export interface CompetitiveInsight {
  vulnerability: string;
  asymmetry: string;
  watchItem: string;
}

export interface Competitor {
  id: string;
  name: string;
  ticker?: string;
  hq: string;
  founded: number;
  status: CompetitorStatus;
  users: string;
  financials: CompetitorFinancials;
  licenses: CompetitorLicenseProfile;
  statePresence: string[];
  legalHistory: LegalEvent[];
  howeyProfile: CompetitorHoweyProfile;
  clarityAct: ClarityActAssessment;
  threatLevel: ThreatLevel;
  marketShare: number;
  sourceAuthority: SourceAuthority;
  insights: CompetitiveInsight;
  notes: string;
}

export interface CompetitorStateOverlap {
  competitorId: string;
  statePresence: string[];
  lcxPhase1Overlap: string[];
  lcxPhase2Overlap: string[];
  lcxPhase3Overlap: string[];
  unservedByBoth: string[];
  onlyCompetitor: string[];
  onlyLCX: string[];
}

export interface CompetitiveHeatmapCell {
  prob: number;
  sev: number;
  competitorIds: string[];
  label: string;
}

export type CompetitorSortField =
  | 'name'
  | 'users'
  | 'revenue'
  | 'quarterlyVolume'
  | 'assetsOnPlatform'
  | 'marketShare'
  | 'mtlCount'
  | 'threatLevel'
  | 'howeyScore'
  | 'clarityActPosition';
