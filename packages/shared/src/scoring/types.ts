export type ScoreBand = 'immediate' | 'high' | 'nurture' | 'watch' | 'archive' | 'unscored';

export interface ReasonTrail {
  code: string;
  factor: string;
  points: number;
  max: number;
  note: string;
}

export const BAND_THRESHOLDS: { band: ScoreBand; min: number }[] = [
  { band: 'immediate', min: 85 },
  { band: 'high', min: 75 },
  { band: 'nurture', min: 60 },
  { band: 'watch', min: 40 },
  { band: 'archive', min: 0 },
];

export function computeBand(score: number): ScoreBand {
  for (const t of BAND_THRESHOLDS) {
    if (score >= t.min) return t.band;
  }
  return 'archive';
}

export function maxBand(...bands: ScoreBand[]): ScoreBand {
  const rank: Record<ScoreBand, number> = {
    immediate: 5,
    high: 4,
    nurture: 3,
    watch: 2,
    archive: 1,
    unscored: 0,
  };
  let best: ScoreBand = 'unscored';
  for (const b of bands) {
    if (rank[b] > rank[best]) best = b;
  }
  return best;
}

export interface RedFlagResult {
  flagged: boolean;
  reasons: ReasonTrail[];
}

export interface ScoreInputProject {
  name: string;
  website?: string;
  ticker?: string;
  chain?: string;
  jurisdiction?: string;
  whitepaperUrl?: string;
  category?: string;
  marketCap?: string;
  source: string;
  esmaTokenId?: string;
  dti?: string;
  listedOnLcx: boolean;
}

export interface ScoreInputContact {
  name?: string;
  email?: string;
  telegram?: string;
  linkedin?: string;
}

export interface ScoreInputSignal {
  kind: string;
  payload?: Record<string, unknown>;
}

export interface ScoreContext {
  clarityEnacted: boolean;
}

export interface EuScoreResult {
  score: number;
  band: ScoreBand;
  reasons: ReasonTrail[];
}

export interface UsScoreResult {
  preScore: number;
  postScore: number;
  band: ScoreBand;
  reasons: ReasonTrail[];
  redFlag: RedFlagResult;
}

export type RecommendedMarket = 'eu_first' | 'us_first' | 'dual' | 'none';

export interface ProjectScoreResult {
  euScore: number;
  usPreScore: number;
  usPostScore: number;
  band: ScoreBand;
  reasons: ReasonTrail[];
  redFlag: RedFlagResult;
  recommendedMarket: RecommendedMarket;
  usIntelSignals?: {
    stateMtlDifficulty: { score: number; tier: string | null };
    productFeasibility: { score: number; product: string | null };
    competitivePosition: { score: number };
    howeyHeuristic: { score: number };
    redFlagCount: number;
  };
  computedAt: string;
}
