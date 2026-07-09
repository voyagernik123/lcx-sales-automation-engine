export interface ReplyStats {
  sent: number;
  replied: number;
  rate: number;
}

export interface FunnelCounts {
  enrolled: number;
  replied: number;
  proposal: number;
  won: number;
}

export interface StalledDeal {
  id: string;
  projectName: string;
  stage: string;
  daysSinceUpdate: number;
  blocker: string;
}

export interface PostListingExpansion {
  totalWon: number;
  withExpansion: number;
  expansionRevenue: number;
}

export interface WeeklyView {
  hot: number;
  stalled: number;
  overdue: number;
}

export interface KpiDashboard {
  newHighScoreLeadsThisWeek: number;
  replyRateBySource: Record<string, ReplyStats>;
  replyRateByChannel: Record<string, ReplyStats>;
  avgDaysFirstTouchToHandoff: number | null;
  avgDaysHandoffToProposal: number | null;
  avgDaysProposalToWon: number | null;
  funnel: FunnelCounts;
  revenueByStream: Record<string, number>;
  topObjections: { category: string; count: number }[];
  stalledDeals: StalledDeal[];
  postListingExpansion: PostListingExpansion;
  weeklyView: WeeklyView;
}

export interface PostListingTrigger {
  id: string;
  dealId: string;
  projectId: string;
  projectName: string;
  triggerDay: number;
  triggerType: string;
  status: string;
  draftContent: string | null;
  taskSummary: string | null;
  dueAt: string;
  createdAt: string;
  completedAt: string | null;
}

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  campaign_upsell: 'Campaign Upsell',
  mm_referral: 'MM Referral',
  mica_legal: 'MiCA/Legal',
  trading_incentives: 'Trading Incentives',
};

export const TRIGGER_DAY_LABELS: Record<number, string> = {
  30: '30-Day',
  60: '60-Day',
  90: '90-Day',
};

export const REVENUE_STREAM_LABELS: Record<string, string> = {
  listing: 'Listing ($20K)',
  marketing: 'Marketing ($20K)',
  liquidity: 'Liquidity ($10K)',
  dual: 'Dual EU+US ($50K)',
  emt: 'EMT ($30K)',
  custom: 'Custom',
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
