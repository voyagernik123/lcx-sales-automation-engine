import { request } from '../apiClient';

/** DISTRIBUTION COMMAND (LCX ONE Phase 3) — mirrors apps/api/src/routes/distribution.ts. */

export interface DistSource { id: string; grade: string; label: string; url: string | null }
export interface DistRail {
  id: string; name: string; governance: string; model: string; traction: string;
  cost: string; fitForLcx: number; lcxNote: string; srcRefs: string[];
}
export interface DistSurface {
  id: string; name: string; category: string; audience: string; submit: string;
  telemetry: string | null; constraint: string | null; srcRefs: string[];
}
export interface DistCompetitor {
  id: string; name: string; focus: string; funding: string; playbook: string; threat: number; srcRefs: string[];
}
export interface DistGap { id: string; title: string; gap: string; lcxAngle: string }
export interface DistListing {
  surface_id: string; status: string; owner: string | null; rank_note: string | null;
  usage_note: string | null; url: string | null; updated_at: string;
}

export interface DistributionDeep {
  reference: {
    meta: { product: string; builtBy: string; thesis: string; asOf: string; dossier: string };
    payAgent: {
      tagline: string; custody: string;
      fees: Array<{ mode: string; fee: string; creatorReward: string; assets: string }>;
      rewardLoop: string; chains: string[]; surfaces: string[]; roadmap: string[]; srcRefs: string[];
    };
    rails: DistRail[];
    surfaces: DistSurface[];
    growthContext: Array<{ id: string; headline: string; implication: string; srcRefs: string[] }>;
    competitors: DistCompetitor[];
    funnel: { stages: string[]; params: Record<string, number>; note: string };
    gaps: DistGap[];
    geoQuestions: Array<{ id: string; query: string; intent: string; priority: string }>;
    personas: Array<{ id: string; name: string; channel: string; cadence: string; beat: string }>;
    sources: DistSource[];
  };
  listings: DistListing[];
  live: { listings: boolean };
}

export interface DistCampaign {
  id: string; name: string; surface_id: string | null; kind: string;
  token_incentivized: boolean; budget_lcx: string | null; status: string;
  detail: string | null; owner: string | null; created_at: string;
}
export const fetchDistCampaigns = () =>
  request<{ data: DistCampaign[] }>(`/v1/distribution/campaigns`, { auth: true }).then((r) => r.data);

/* Governed distribution actions (audited via the registry). */
async function invokeDist(actionId: string, subjectType: string, subjectId: string, params: Record<string, unknown>): Promise<void> {
  await request(`/v1/actions/${actionId}/invoke`, { auth: true, method: 'POST', body: { subjectType, subjectId, params } });
}
export const setListingStatus = (surfaceId: string, params: Record<string, unknown>) =>
  invokeDist('dist_listing_set_status', 'dist_listing', surfaceId, params);
export const createCampaign = (params: Record<string, unknown>) =>
  invokeDist('dist_campaign_create', 'distribution', 'new', params);
export const setCampaignStatus = (campaignId: string, status: string) =>
  invokeDist('dist_campaign_set_status', 'dist_campaign', campaignId, { status });

export const fetchDistributionDeep = () =>
  request<{ data: DistributionDeep }>(`/v1/distribution/deep`, { auth: true }).then((r) => r.data);

export const fetchDistListings = () =>
  request<{ data: DistListing[] }>(`/v1/distribution/listings`, { auth: true }).then((r) => r.data);

export async function seedDistribution(): Promise<{ listings: number }> {
  return (await request<{ data: { listings: number } }>(`/v1/distribution/seed`, { auth: true, method: 'POST' })).data;
}

/* ── Phase 4 — growth engines + x402 seller layer ── */

export interface ReferralSim {
  kFactor: number; viral: boolean;
  cumulativeCreators: { p10: number; p50: number; p90: number };
  cumulativePaidLinks: { p10: number; p50: number; p90: number };
  rewardCostLcx: { p10: number; p50: number; p90: number };
}
export interface Emission { emittedLcx: number; feeRevenueLcx: number; netTreasuryLcx: number; budgetUtilizationPct: number; withinBudget: boolean; status: string }
export interface QuestCac { fundedAgents: { p10: number; p50: number; p90: number }; totalBudgetUsd: number; blendedCacP50: number | null; marginal: Array<{ channelId: string; label: string; fundedPerExtra1kUsd: number }> }
export interface ChannelMix { rows: Array<{ subjectId: string; subjectLabel: string; weighted: number; rank: number }> }
export interface Presence { presenceScore: number; surfaces: Array<{ surfaceId: string; label: string; score: number }> }

const post = <T>(path: string, body: Record<string, unknown> = {}) =>
  request<{ data: T }>(path, { auth: true, method: 'POST', body }).then((r) => r.data);

export const runReferralSim = (body?: Record<string, unknown>) => post<ReferralSim>(`/v1/distribution/engines/referral-sim`, body);
export const runEmission = (body?: Record<string, unknown>) => post<Emission>(`/v1/distribution/engines/emission`, body);
export const runQuestCac = (body?: Record<string, unknown>) => post<QuestCac>(`/v1/distribution/engines/quest-cac`, body);
export const runChannelMix = (body?: Record<string, unknown>) => post<ChannelMix>(`/v1/distribution/engines/channel-mix`, body);
export const fetchPresence = () => request<{ data: Presence }>(`/v1/distribution/engines/presence`, { auth: true }).then((r) => r.data);

export interface X402Catalog {
  mode: string; seller: string;
  endpoints: Array<{ id: string; path: string; description: string; priceUsd: number; network: string; asset: string }>;
}
export const fetchX402Catalog = () => request<{ data: X402Catalog }>(`/v1/x402/catalog`, { auth: false }).then((r) => r.data);
