/**
 * US Intelligence Signal Extractors
 *
 * Maps project features → signals derived from the codebase's regulatory assets:
 *   - states.ts       → MTL difficulty tier, phase feasibility, sandbox availability
 *   - competitors.ts  → competitive gap, CLARITY Act positioning
 *   - Howey/redFlags  → securities risk heuristics
 *   - product catalog → product feasibility (which LCX products fit this project)
 *
 * Planning heuristics only — not legal advice.
 */
import type { ScoreInputProject, ScoreInputContact, ScoreInputSignal } from './types.js';

/* ─── State MTL difficulty tiers (derived from states.ts) ─── */

const MTL_TIERS: Record<string, { tier: string; phase: number }> = {
  NY: { tier: 'Tier 1 - Maximum friction', phase: 3 },
  CA: { tier: 'Tier 1 - Maximum friction', phase: 3 },
  HI: { tier: 'Tier 1 - Maximum friction', phase: 3 },
  TX: { tier: 'Tier 2 - High friction', phase: 2 },
  FL: { tier: 'Tier 2 - High friction', phase: 2 },
  AL: { tier: 'Tier 2 - High friction', phase: 2 },
  AK: { tier: 'Tier 2 - High friction', phase: 2 },
  AR: { tier: 'Tier 2 - High friction', phase: 2 },
  AZ: { tier: 'Tier 2 - High friction', phase: 2 },
  CT: { tier: 'Tier 2 - High friction', phase: 2 },
  DC: { tier: 'Tier 2 - High friction', phase: 2 },
  DE: { tier: 'Tier 2 - High friction', phase: 2 },
  GA: { tier: 'Tier 2 - High friction', phase: 2 },
  IA: { tier: 'Tier 2 - High friction', phase: 2 },
  ID: { tier: 'Tier 2 - High friction', phase: 2 },
  IL: { tier: 'Tier 2 - High friction', phase: 2 },
  IN: { tier: 'Tier 2 - High friction', phase: 2 },
  KS: { tier: 'Tier 2 - High friction', phase: 2 },
  KY: { tier: 'Tier 2 - High friction', phase: 2 },
  LA: { tier: 'Tier 2 - High friction', phase: 2 },
  MA: { tier: 'Tier 2 - High friction', phase: 2 },
  MD: { tier: 'Tier 2 - High friction', phase: 2 },
  ME: { tier: 'Tier 2 - High friction', phase: 2 },
  MI: { tier: 'Tier 2 - High friction', phase: 2 },
  MN: { tier: 'Tier 2 - High friction', phase: 2 },
  MO: { tier: 'Tier 2 - High friction', phase: 2 },
  MS: { tier: 'Tier 2 - High friction', phase: 2 },
  NC: { tier: 'Tier 2 - High friction', phase: 2 },
  ND: { tier: 'Tier 2 - High friction', phase: 2 },
  NE: { tier: 'Tier 2 - High friction', phase: 2 },
  NH: { tier: 'Tier 4 - Lower friction', phase: 1 },
  NJ: { tier: 'Tier 2 - High friction', phase: 2 },
  NM: { tier: 'Tier 4 - Lower friction', phase: 1 },
  NV: { tier: 'Tier 3 - Moderate friction', phase: 2 },
  OH: { tier: 'Tier 2 - High friction', phase: 2 },
  OK: { tier: 'Tier 2 - High friction', phase: 2 },
  OR: { tier: 'Tier 2 - High friction', phase: 2 },
  MT: { tier: 'Tier 4 - Lower friction', phase: 1 },
  PA: { tier: 'Tier 2 - High friction', phase: 2 },
  RI: { tier: 'Tier 2 - High friction', phase: 2 },
  SC: { tier: 'Tier 4 - Lower friction', phase: 1 },
  SD: { tier: 'Tier 4 - Lower friction', phase: 1 },
  TN: { tier: 'Tier 2 - High friction', phase: 2 },
  UT: { tier: 'Tier 4 - Lower friction', phase: 1 },
  VA: { tier: 'Tier 2 - High friction', phase: 2 },
  VT: { tier: 'Tier 4 - Lower friction', phase: 1 },
  WA: { tier: 'Tier 2 - High friction', phase: 2 },
  WI: { tier: 'Tier 2 - High friction', phase: 2 },
  WV: { tier: 'Tier 2 - High friction', phase: 2 },
  WY: { tier: 'Tier 3 - Moderate friction', phase: 2 },
};

/* ─── Product feasibility mapping ─── */



/* ─── Signal extractors ─── */

export interface UsIntelSignals {
  stateMtlDifficulty: { score: number; tier: string | null; note: string };
  productFeasibility: { score: number; product: string | null; note: string };
  competitivePosition: { score: number; note: string };
  howeyHeuristic: { score: number; note: string };
  redFlagHeuristic: { score: number; redFlags: string[] };
}

/**
 * Derives state MTL difficulty signal from the project's jurisdiction.
 * A US jurisdiction triggers MTL analysis — higher friction = more readiness needed.
 */
export function extractStateMtlSignal(project: ScoreInputProject): { score: number; tier: string | null; note: string } {
  const jur = project.jurisdiction ?? '';
  const upper = jur.toUpperCase();

  // Direct US state match
  const state = MTL_TIERS[upper];
  if (state) {
    const tierScores: Record<string, number> = {
      'Tier 1 - Maximum friction': 10,
      'Tier 2 - High friction': 25,
      'Tier 3 - Moderate friction': 50,
      'Tier 4 - Lower friction': 70,
    };
    const score = tierScores[state.tier] ?? 30;
    return { score, tier: state.tier, note: `${jur} — MTL ${state.tier} (phase ${state.phase})` };
  }

  // Country-level
  if (upper === 'US' || upper === 'USA') {
    return { score: 20, tier: null, note: 'US entity — multi-state MTL analysis needed (50-state assessment)' };
  }

  // Non-US: check if a jurisdiction has established crypto regulatory framework
  const cryptoFriendly = ['SG', 'AE', 'GB', 'CH', 'JP', 'KR', 'AU', 'MT', 'LT', 'EE'];
  if (cryptoFriendly.includes(upper)) {
    return { score: 60, tier: null, note: `${project.jurisdiction} — established crypto framework, lower US MTL barrier` };
  }

  return { score: 40, tier: null, note: 'Non-US jurisdiction — US MTL not directly applicable but entity structure matters' };
}

/**
 * Maps project category/features to feasible LCX US products.
 * Higher score = better product fit.
 */
export function extractProductFeasibility(project: ScoreInputProject): { score: number; product: string | null; note: string } {
  const cat = (project.category ?? '').toLowerCase().trim();

  // Direct category → product mapping
  if (cat === 'defi' || cat === 'l1' || cat === 'l2' || cat === 'infrastructure') {
    return { score: 65, product: 'exchange', note: `${cat} project — strong exchange listing candidate (Howey analysis required)` };
  }
  if (cat === 'rwa') {
    return { score: 45, product: 'exchange', note: 'RWA token — exchange listing with securities law diligence needed' };
  }
  if (cat === 'stablecoin' || cat === 'payments') {
    return { score: 55, product: 'stablecoin_rails', note: 'Payment/stablecoin — Stablecoin Payment Rails product fit (Phase 2)' };
  }
  if (cat === 'wallet' || cat === 'infra') {
    return { score: 70, product: 'noncustodial_wallet', note: 'Infrastructure/wallet — Non-Custodial Wallet/API product (Phase 1, low risk)' };
  }

  if (project.esmaTokenId) {
    return { score: 50, product: 'exchange', note: 'ESMA-vetted token — dual listing candidate (EU+US)' };
  }

  if (project.source === 'top100') {
    return { score: 40, product: 'exchange', note: 'Top-100 project — exchange listing product feasible' };
  }

  return { score: 30, product: null, note: 'No clear product fit — consultation needed' };
}

/**
 * Competitive position derived from market category, source, and size.
 * Higher score = stronger competitive moat / less competitive pressure.
 */
export function extractCompetitivePosition(project: ScoreInputProject): { score: number; note: string } {
  let score = 50;
  const signals: string[] = [];

  // Top-100 = proven competitor
  if (project.source === 'top100') {
    score += 15;
    signals.push('top-100 project — established market position');
  }

  // ESMA-vetted = regulatory head start vs US-only competitors
  if (project.esmaTokenId) {
    score += 10;
    signals.push('ESMA-vetted — EU regulatory head start post-CLARITY');
  }

  // Early-stage projects have more to gain from listing
  const preTgeSources = new Set(['pre_tge', 'potential', 'pipeline']);
  if (preTgeSources.has(project.source)) {
    score += 10;
    signals.push('early stage — high upside from US market access');
  }

  // Category-based competitive dynamics
  const cat = (project.category ?? '').toLowerCase().trim();
  const nicheCategories = new Set(['rwa', 'depin', 'gaming', 'oracle', 'data availability', 'modular', 'zkevm']);
  if (nicheCategories.has(cat)) {
    score += 10;
    signals.push(`niche category ${cat} — less exchange competition`);
  }

  if (project.listedOnLcx) {
    score += 5;
    signals.push('already LCX-listed — proven compliance bar');
  }

  return { score: Math.min(score, 100), note: signals.length > 0 ? signals.join('; ') : 'Standard competitive position' };
}

/**
 * Howey test heuristic derived from project features.
 * This is a planning heuristic, not a legal opinion.
 * Base risk: if listed on LCX (EU-vetted), lower Howey concern; if US jurisdiction, higher.
 */
export function extractHoweyHeuristic(project: ScoreInputProject, signals: ScoreInputSignal[]): { score: number; note: string } {
  let riskLevel = 50;
  const factors: string[] = [];

  // LCX-listed = EU compliance vetting reduces US Howey uncertainty
  if (project.listedOnLcx) {
    riskLevel -= 15;
    factors.push('LCX-listed — EU regulatory vetting reduces Howey ambiguity');
  }

  // ESMA token = regulatory classification exists
  if (project.esmaTokenId) {
    riskLevel -= 10;
    factors.push('ESMA-identified — token classification available');
  }

  // Whitepaper = transparency reduces risk
  if (project.whitepaperUrl) {
    riskLevel -= 10;
    factors.push('whitepaper published — token economics transparent');
  }

  // US jurisdiction = direct Howey scrutiny
  const jur = (project.jurisdiction ?? '').toUpperCase();
  if (jur === 'US' || jur === 'USA') {
    riskLevel += 20;
    factors.push('US jurisdiction — direct SEC Howey scrutiny');
  }

  // Category risk
  const cat = (project.category ?? '').toLowerCase();
  const highRiskCats = ['security', 'equity', 'real estate', 'commodity'];
  if (highRiskCats.includes(cat)) {
    riskLevel += 15;
    factors.push(`category "${cat}" — higher Howey risk`);
  }

  // Signal scan for security indicators
  for (const s of signals ?? []) {
    const notes = JSON.stringify(s.payload ?? {}).toLowerCase();
    if (notes.includes('security token') || notes.includes('security')) {
      riskLevel += 25;
      factors.push('security token indicator in signals');
    }
  }

  const finalScore = Math.max(0, Math.min(100, 100 - riskLevel));
  return { score: finalScore, note: factors.length > 0 ? factors.join('; ') : 'Default Howey heuristic — no material signals' };
}

/**
 * Red flag pattern scanner from the redFlags.ts risk patterns.
 * Maps known risk patterns to project features.
 */
export function extractRedFlagHeuristic(project: ScoreInputProject): { score: number; redFlags: string[] } {
  const flags: string[] = [];
  let penalty = 0;

  // Entity status risk
  if (!project.website && !project.whitepaperUrl) {
    flags.push('No website or whitepaper — entity verification risk');
    penalty += 15;
  }

  // Custody/control ambiguity — projects without clear legal structure
  if (!project.jurisdiction) {
    flags.push('No jurisdiction specified — custody/control ambiguity');
    penalty += 10;
  }

  // Securities classification risk by category
  const cat = (project.category ?? '').toLowerCase();
  if (cat.includes('security') || cat.includes('equity')) {
    flags.push(`Category "${cat}" — potential securities classification`);
    penalty += 20;
  }

  // NY premature entry risk — projects with US jurisdictions not ready for NY
  const jur = (project.jurisdiction ?? '').toUpperCase();
  if (jur === 'NY') {
    flags.push('New York entity — BitLicense complexity (Critical risk factor)');
    penalty += 25;
  }

  // MiCA conflation risk — EU-only projects assumed US-ready
  if (project.esmaTokenId && (jur !== 'US' && jur !== 'USA')) {
    flags.push('EU compliance does not equal US compliance — MiCA conflation risk');
    penalty += 10;
  }

  // Stablecoin projects without licensing clarity
  if (cat === 'stablecoin' && (jur !== 'US' && jur !== 'USA')) {
    flags.push('Stablecoin without US licensing framework');
    penalty += 15;
  }

  return { score: Math.max(0, 100 - penalty), redFlags: flags };
}

/**
 * Full US intelligence assessment for a project.
 * Returns aggregate signals and recommended market orientation.
 */
export function assessUsIntel(
  project: ScoreInputProject,
  _contacts: ScoreInputContact[],
  signals: ScoreInputSignal[],
): UsIntelSignals {
  const stateMtl = extractStateMtlSignal(project);
  const productF = extractProductFeasibility(project);
  const compPos = extractCompetitivePosition(project);
  const howeyH = extractHoweyHeuristic(project, signals);
  const redFlagH = extractRedFlagHeuristic(project);

  return {
    stateMtlDifficulty: stateMtl,
    productFeasibility: productF,
    competitivePosition: compPos,
    howeyHeuristic: howeyH,
    redFlagHeuristic: redFlagH,
  };
}

export type RecommendedMarket = 'eu_first' | 'us_first' | 'dual' | 'none';

/**
 * Determines recommended market based on EU vs US scores and intelligence signals.
 */
export function computeRecommendedMarket(
  euScore: number,
  usPreScore: number,
  usPostScore: number,
  signals: UsIntelSignals,
): RecommendedMarket {
  const effectiveUsScore = Math.max(usPreScore, usPostScore);
  const diff = euScore - effectiveUsScore;
  const hasMtlPath = signals.stateMtlDifficulty.score >= 25; // at least moderate path

  // Strong US signal but EU weak
  if (effectiveUsScore >= 65 && euScore < 40 && hasMtlPath) return 'us_first';

  // Strong EU but weak US
  if (euScore >= 65 && effectiveUsScore < 40) return 'eu_first';

  // Both strong
  if (euScore >= 55 && effectiveUsScore >= 55 && hasMtlPath) return 'dual';

  // Both weak or unclear
  if (euScore < 40 && effectiveUsScore < 40) return 'none';

  // Moderate scores — default to EU-first unless US is clearly better
  if (diff < -15 && hasMtlPath) return 'us_first';
  if (diff > 15) return 'eu_first';

  // Default tiebreaker: EU-first (existing LCX infrastructure)
  return 'eu_first';
}
