import type {
  ScoreInputProject, ScoreInputContact, ScoreInputSignal,
  ProjectScoreResult, ScoreBand,
} from './types.js';
import { maxBand } from './types.js';
import { scoreEu } from './eu.js';
import { scoreUs } from './us.js';
import { assessUsIntel, computeRecommendedMarket } from './us-intel.js';
import type { RecommendedMarket } from './us-intel.js';

export function scoreProject(
  project: ScoreInputProject,
  contacts: ScoreInputContact[],
  signals: ScoreInputSignal[],
): ProjectScoreResult & { recommendedMarket: RecommendedMarket } {
  const euResult = scoreEu(project, contacts, signals);
  const usResult = scoreUs(project, contacts, signals);
  const usIntel = assessUsIntel(project, contacts, signals);
  const recommendedMarket = computeRecommendedMarket(
    euResult.score, usResult.preScore, usResult.postScore, usIntel,
  );

  const overallBand: ScoreBand = maxBand(euResult.band, usResult.band);

  return {
    euScore: euResult.score,
    usPreScore: usResult.preScore,
    usPostScore: usResult.postScore,
    band: overallBand,
    reasons: [...euResult.reasons, ...usResult.reasons],
    redFlag: usResult.redFlag,
    recommendedMarket,
    usIntelSignals: {
      stateMtlDifficulty: { score: usIntel.stateMtlDifficulty.score, tier: usIntel.stateMtlDifficulty.tier },
      productFeasibility: { score: usIntel.productFeasibility.score, product: usIntel.productFeasibility.product },
      competitivePosition: { score: usIntel.competitivePosition.score },
      howeyHeuristic: { score: usIntel.howeyHeuristic.score },
      redFlagCount: usIntel.redFlagHeuristic.redFlags.length,
    },
    computedAt: new Date().toISOString(),
  };
}
