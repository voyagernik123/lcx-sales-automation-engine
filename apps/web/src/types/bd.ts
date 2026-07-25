import type { ScoreBand, ReasonTrail } from '@lcx/shared';

export type Market = 'eu' | 'us';

export type RecommendedMarket = 'eu_first' | 'us_first' | 'dual' | 'none';

export const MARKET_RECOMMENDATION_LABELS: Record<string, string> = {
  eu_first: 'EU First',
  us_first: 'US First',
  dual: 'Dual',
  none: 'Unclear',
};

export const MARKET_RECOMMENDATION_COLORS: Record<string, string> = {
  eu_first: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
  us_first: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  dual: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
  none: 'text-slate-500 bg-slate-50 dark:bg-slate-900/50',
};

export interface BdLead {
  id: string;
  name: string;
  ticker: string | null;
  website: string | null;
  source: string;
  chain: string | null;
  jurisdiction: string | null;
  category: string | null;
  listedOnLcx: boolean | null;
  euScore: number;
  usPreScore: number;
  usPostScore: number;
  band: ScoreBand;
  recommendedMarket?: RecommendedMarket;
  propensityScore?: number;
  priorityScore?: number;
  marketCapUsd?: number | null;
  /** Universe tier: 'tracked' (deep-intel core) | 'catalog' (identity-only). */
  tier?: 'tracked' | 'catalog';
  lastEnrichedAt?: string | null;
  peopleCount: number;
  verifiedContactCount: number;
  createdAt: string;
  updatedAt: string;
  hasContact: boolean;
  marketTag: Market | 'both' | null;
  /** When set, the lead is snoozed out of triage until this ISO timestamp. */
  snoozedUntil?: string | null;
}

/**
 * US intelligence signal cluster computed server-side by the scoring
 * orchestrator (`us-intel.ts`). Every field is optional — older score rows
 * predate the signals and the UI must degrade gracefully.
 * All 0–100 scores read "higher = better/easier"; redFlagCount is a raw count
 * where fewer is better.
 */
export interface UsIntelSignals {
  stateMtlDifficulty?: { score: number; tier?: string | null };
  productFeasibility?: { score: number; product?: string | null };
  competitivePosition?: { score: number };
  howeyHeuristic?: { score: number };
  redFlagCount?: number;
}

export interface GateCheck {
  pass: boolean;
  reasons: string[];
  band: string;
  hasVerifiedContact: boolean;
  suppressed: boolean;
  totalContacts: number;
}

export interface BdPipelineResponse {
  data: BdLead[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    timestamp: string;
    version: string;
  };
}

export interface BdFilters {
  market: Market | 'both' | null;
  minScore: number;
  source: string;
  band: ScoreBand | '';
  listedOnLcx: boolean | null;
  hasContact: boolean | null;
  marketRecommendation: RecommendedMarket | '';
  sort: 'priority' | 'propensity' | 'eu_score' | 'us_pre' | 'us_post' | 'market_cap' | 'name' | 'created';
  order: 'asc' | 'desc';
  search: string;
  /**
   * Universe tier scope. 'tracked' (default) keeps the workable lead queue to
   * the deep-intel core; 'all' opens the full 50k+ catalog for browsing/promotion.
   */
  tier: 'tracked' | 'all';
}

export const BD_BAND_ORDER: ScoreBand[] = [
  'immediate',
  'high',
  'nurture',
  'watch',
  'archive',
  'unscored',
];

export const BAND_LABELS: Record<ScoreBand, string> = {
  immediate: 'Immediate',
  high: 'High',
  nurture: 'Nurture',
  watch: 'Watch',
  archive: 'Archive',
  unscored: 'Unscored',
};

export const BAND_COLORS: Record<ScoreBand, string> = {
  immediate: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  high: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800',
  nurture: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  watch: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700',
  archive: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  unscored: 'text-grey bg-ice-soft dark:bg-navy-deep border-line',
};

export function deriveMarketTag(lead: BdLead): Market | 'both' | null {
  const j = (lead.jurisdiction ?? '').toUpperCase();
  if (!j) return null;
  const euJurisdictions = [
    'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'GR',
    'FI', 'SE', 'DK', 'PL', 'CZ', 'HU', 'RO', 'SK', 'BG', 'HR',
    'LT', 'LV', 'EE', 'SI', 'LU', 'CY', 'MT',
  ];
  const isEu = euJurisdictions.includes(j);
  const isUs = j === 'US';
  if (isEu && isUs) return 'both';
  if (isEu) return 'eu';
  if (isUs) return 'us';
  return null;
}

export function deriveNextAction(band: ScoreBand): string {
  switch (band) {
    case 'immediate': return 'Begin outreach';
    case 'high': return 'Schedule call';
    case 'nurture': return 'Send intro';
    case 'watch': return 'Monitor';
    case 'archive': return 'No action';
    case 'unscored': return 'Score first';
  }
}

export function deriveStage(band: ScoreBand): string {
  switch (band) {
    case 'immediate': return 'Hot lead';
    case 'high': return 'Warm lead';
    case 'nurture': return 'Nurturing';
    case 'watch': return 'Monitoring';
    case 'archive': return 'Archived';
    case 'unscored': return 'New';
  }
}

/* ── Lead detail types ── */

export interface LeadPerson {
  id: string;
  projectId: string;
  name: string;
  title: string | null;
  role: string;
  linkedin: string | null;
  linkedinStatus?: string;
  email: string | null;
  emailStatus: string;
  telegram: string | null;
  verified: boolean;
  contactabilityScore: number;
  enrichedBy: string | null;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSignal {
  id: string;
  projectId: string;
  kind: string;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface LeadScore {
  id: string;
  projectId: string;
  euScore: number;
  usPreScore: number;
  usPostScore: number;
  band: ScoreBand;
  reasons: ReasonTrail[];
  computedAt: string;
  /** "Why they'll pay" — explainable propensity model output (optional until re-score lands). */
  propensityScore?: number;
  /** priority = propensity × eligibility gate (see combinePriority in @lcx/shared). */
  priorityScore?: number;
  propensityReasons?: ReasonTrail[];
  usIntelSignals?: UsIntelSignals;
}

export interface LeadSource {
  id: string;
  projectId: string;
  source: string;
  externalId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LeadDetail {
  id: string;
  name: string;
  website: string | null;
  ticker: string | null;
  chain: string | null;
  source: string;
  esmaTokenId: string | null;
  dti: string | null;
  jurisdiction: string | null;
  whitepaperUrl: string | null;
  category: string | null;
  marketCap: string | null;
  listedOnLcx: boolean | null;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  score: LeadScore | null;
  people: LeadPerson[];
  sources: LeadSource[];
  signals: LeadSignal[];
  deals: unknown[];
  regulatoryPosture?: RegulatoryPosture;
}

export type PostureTone = 'strong' | 'neutral' | 'watch';
export interface PostureFacet { label: string; value: string; tone?: PostureTone }
export interface RegulatoryPosture {
  label: string;
  tone: PostureTone;
  isMicaRegistry: boolean;
  facets: PostureFacet[];
}

export interface LeadDetailResponse {
  data: LeadDetail;
  meta: { timestamp: string; version: string };
}

/* ── Draft types ── */

export interface DraftGenerateRequest {
  contactName: string;
  contactTitle?: string;
  contactRole?: string;
  touchIndex?: number;
  channel?: 'email' | 'linkedin' | 'telegram';
  jurisdiction?: 'eu' | 'us';
  clarityEnacted?: boolean;
  market?: string;
}

export interface DraftOutput {
  subject: string;
  body: string;
  channel: 'email' | 'linkedin' | 'telegram';
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
  channel: string;
  touchIndex: number;
  claimsUsed: string[];
  requiresHumanReview: boolean;
  operatorEdited: boolean;
  approved: boolean;
  sent: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── Claim library types ── */

export interface Claim {
  id: string;
  category: string;
  text: string;
  jurisdiction: string[];
  riskLevel: string;
  requiresHumanReview: boolean;
  version: number;
  active: boolean;
}

export interface ClaimLibrarySnapshot {
  version: number;
  claims: Claim[];
  updatedAt: string;
}

export type Channel = 'email' | 'linkedin' | 'telegram';

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
};

export const TOUCH_LABELS: Record<number, string> = {
  1: 'Touch 1 — Introduction',
  2: 'Touch 2 — Listing',
  3: 'Touch 3 — Liquidity',
  4: 'Touch 4 — Direct CTA',
  5: 'Touch 5 — Final Follow-up',
};

export const CLAIM_CATEGORY_LABELS: Record<string, string> = {
  eu_access: 'EU Access',
  mica_awareness: 'MiCA Awareness',
  us_path: 'US Path',
  listing_package: 'Listing Package',
  liquidity: 'Liquidity',
  marketing: 'Marketing',
};

export const CLAIM_RISK_COLORS: Record<string, string> = {
  low: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  medium: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  high: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

/* ── Outreach / Sequence types ── */

export interface SequenceRecord {
  id: string;
  projectId: string;
  personId: string | null;
  channel: string;
  status: string;
  steps: unknown[];
  currentStep: number;
  fromEmail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  handoffId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  sequenceId: string | null;
  projectId: string;
  stepIndex: number;
  touchIndex: number;
  toEmail: string;
  toName: string | null;
  subject: string;
  body: string;
  provider: string;
  providerMessageId: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SEQUENCE_STATUS_COLORS: Record<string, string> = {
  draft: 'text-slate-500 bg-slate-50 dark:bg-slate-900/50',
  active: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  paused: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  completed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  handoff: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
};

export const LINKEDIN_STATUS_COLORS: Record<string, string> = {
  none: 'text-slate-500 bg-slate-50 dark:bg-slate-900/50',
  pending: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  connected: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  messaged: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  replied: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
  declined: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

export const MESSAGE_STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-500 bg-slate-50 dark:bg-slate-900/50',
  sent: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  delivered: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  bounced: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
  complained: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

export const HANDOFF_STATUS_COLORS: Record<string, string> = {
  open: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  in_progress: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  resolved_won_path: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  resolved_lost: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
  re_nurture: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
};

export const STAGE_COLORS: Record<string, string> = {
  not_started: 'text-slate-500 bg-slate-50 dark:bg-slate-900/50',
  contacted: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  discovery: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  proposal: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
  negotiating: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
  won: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  lost: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

export const STAGE_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  contacted: 'Contacted',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

export interface DealRecord {
  id: string;
  projectId: string;
  stage: string;
  packageType: string;
  packageValue: number | null;
  proposalSnapshot: ProposalSnapshot | null;
  proposalGeneratedAt: string | null;
  winReason: string | null;
  lossReason: string | null;
  lossCategory: string | null;
  handoffId: string | null;
  owner: string;
  notes: string | null;
  wonAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalTier {
  name: string;
  priceCents: number;
  inclusions: string[];
  recommended: boolean;
}

export interface ProposalSnapshot {
  projectName: string;
  projectTicker: string | null;
  packageType: string;
  packageValue: number;
  jurisdiction: string | null;
  inclusions: string[];
  tiers?: ProposalTier[];
  claimsUsed: string[];
  disclaimer: string;
  generatedAt: string;
  validUntil: string;
}

export interface DealEvent {
  id: string;
  dealId: string;
  eventType: string;
  actor: string;
  oldStage: string | null;
  newStage: string | null;
  content: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface DealObjection {
  id: string;
  dealId: string;
  category: string;
  description: string;
  severity: string;
  resolved: boolean;
  resolution: string | null;
  raisedBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

export const HANDOFF_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved_won_path: 'Won',
  resolved_lost: 'Lost',
  re_nurture: 'Re-nurture',
};

export interface HandoffRecord {
  id: string;
  projectId: string;
  personId: string | null;
  channel: string;
  triggerMessageId: string | null;
  triggerReason: string;
  status: string;
  assignedTo: string | null;
  summary: string | null;
  projectName?: string;
  projectTicker?: string;
  personName?: string;
  personEmail?: string;
  personLinkedin?: string;
  personTelegram?: string;
  events?: HandoffEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface HandoffEvent {
  id: string;
  handoffId: string;
  eventType: string;
  actor: string;
  content: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  createdAt: string;
}


