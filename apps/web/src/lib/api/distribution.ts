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
    sources: DistSource[];
  };
  listings: DistListing[];
  live: { listings: boolean };
}

export const fetchDistributionDeep = () =>
  request<{ data: DistributionDeep }>(`/v1/distribution/deep`, { auth: true }).then((r) => r.data);

export const fetchDistListings = () =>
  request<{ data: DistListing[] }>(`/v1/distribution/listings`, { auth: true }).then((r) => r.data);

export async function seedDistribution(): Promise<{ listings: number }> {
  return (await request<{ data: { listings: number } }>(`/v1/distribution/seed`, { auth: true, method: 'POST' })).data;
}
