import { Competitor } from '@/types/competitors';

export function parseNumericRevenue(revenue: string): number {
  const cleaned = revenue.replace(/[^0-9.BbMmTtKk]/g, '');
  if (/[Tt]/.test(cleaned)) return parseFloat(cleaned) * 1_000_000_000_000;
  if (/[Bb]/.test(cleaned)) return parseFloat(cleaned) * 1_000_000_000;
  if (/[Mm]/.test(cleaned)) return parseFloat(cleaned) * 1_000_000;
  if (/[Kk]/.test(cleaned)) return parseFloat(cleaned) * 1_000;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseNumericUsers(users: string): number {
  const cleaned = users.replace(/[^0-9.MmKk]/g, '');
  if (/[Mm]/.test(cleaned)) return parseFloat(cleaned) * 1_000_000;
  if (/[Kk]/.test(cleaned)) return parseFloat(cleaned) * 1_000;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseNumericAssets(assets: string): number {
  if (assets.includes('Consolidated') || assets.includes('Not disclosed') || assets.includes('Unknown') || assets.includes('Undisclosed')) return 0;
  return parseNumericRevenue(assets);
}

export function parseNumericVolume(volume: string): number {
  if (volume.includes('Negligible') || volume.includes('Not disclosed') || volume.includes('Undisclosed')) return 0;
  return parseNumericRevenue(volume);
}

export interface CompetitorScores {
  id: string;
  name: string;
  regulatoryCoverage: number;
  marketVolume: number;
  preClarityRegulatory: number;
  postClarityRegulatory: number;
  marketShare: number;
  threatLevel: string;
  quadrant: 'leaders' | 'regulatoryHedge' | 'volumeRiders' | 'outsiders';
  postClarityQuadrant: 'leaders' | 'regulatoryHedge' | 'volumeRiders' | 'outsiders';
}

export function computeRegulatoryScore(competitor: Competitor, postClarity: boolean): number {
  if (!postClarity) {
    let score = 0;
    const mtlCount = competitor.statePresence.length;
    score += (mtlCount / 50) * 40;
    if (competitor.licenses.fincenMSB) score += 10;
    if (competitor.licenses.bitLicense) score += 15;
    if (competitor.licenses.spdiCharter || competitor.licenses.nyTrustCharter) score += 15;
    if (competitor.licenses.occTrustCharter) score += 10;
    if (competitor.licenses.cfdtcDCO) score += 5;
    if (competitor.licenses.finraBD) score += 5;
    return Math.min(100, score);
  }

  let score = 0;
  if (competitor.licenses.fincenMSB) score += 15;
  if (competitor.licenses.bitLicense) score += 10;
  if (competitor.licenses.spdiCharter || competitor.licenses.nyTrustCharter) score += 20;
  if (competitor.licenses.occTrustCharter) score += 25;
  if (competitor.licenses.cfdtcDCO) score += 10;
  if (competitor.licenses.finraBD) score += 10;
  if (competitor.licenses.euMiCA) score += 10;
  return Math.min(100, score);
}

function computeMarketVolumeScore(competitor: Competitor, maxUsers: number, maxVolume: number, maxAssets: number, maxRevenue: number): number {
  const userWeight = 30;
  const volumeWeight = 30;
  const assetWeight = 25;
  const revenueWeight = 15;

  const users = parseNumericUsers(competitor.users);
  const volume = parseNumericVolume(competitor.financials.quarterlyVolume);
  const assets = parseNumericAssets(competitor.financials.assetsOnPlatform);
  const revenue = parseNumericRevenue(competitor.financials.revenue);

  let totalWeight = 0;
  let score = 0;

  if (users > 0 && maxUsers > 0) {
    score += (users / maxUsers) * userWeight;
    totalWeight += userWeight;
  }
  if (volume > 0 && maxVolume > 0) {
    score += (volume / maxVolume) * volumeWeight;
    totalWeight += volumeWeight;
  }
  if (assets > 0 && maxAssets > 0) {
    score += (assets / maxAssets) * assetWeight;
    totalWeight += assetWeight;
  }
  if (revenue > 0 && maxRevenue > 0) {
    score += (revenue / maxRevenue) * revenueWeight;
    totalWeight += revenueWeight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((score / totalWeight) * 100);
}

function determineQuadrant(regulatory: number, volume: number): 'leaders' | 'regulatoryHedge' | 'volumeRiders' | 'outsiders' {
  if (regulatory >= 50 && volume >= 50) return 'leaders';
  if (regulatory >= 50 && volume < 50) return 'regulatoryHedge';
  if (regulatory < 50 && volume >= 50) return 'volumeRiders';
  return 'outsiders';
}

export function computeAllScores(competitors: Competitor[]): CompetitorScores[] {
  const numericUsers = competitors.map(c => parseNumericUsers(c.users));
  const numericVolumes = competitors.map(c => parseNumericVolume(c.financials.quarterlyVolume));
  const numericAssets = competitors.map(c => parseNumericAssets(c.financials.assetsOnPlatform));
  const numericRevenues = competitors.map(c => parseNumericRevenue(c.financials.revenue));

  const maxUsers = Math.max(...numericUsers, 1);
  const maxVolume = Math.max(...numericVolumes, 1);
  const maxAssets = Math.max(...numericAssets, 1);
  const maxRevenue = Math.max(...numericRevenues, 1);

  return competitors.map(c => {
    const preClarityReg = computeRegulatoryScore(c, false);
    const postClarityReg = computeRegulatoryScore(c, true);
    const marketVol = computeMarketVolumeScore(c, maxUsers, maxVolume, maxAssets, maxRevenue);

    return {
      id: c.id,
      name: c.name,
      regulatoryCoverage: preClarityReg,
      marketVolume: marketVol,
      preClarityRegulatory: preClarityReg,
      postClarityRegulatory: postClarityReg,
      marketShare: c.marketShare,
      threatLevel: c.threatLevel,
      quadrant: determineQuadrant(preClarityReg, marketVol),
      postClarityQuadrant: determineQuadrant(postClarityReg, marketVol),
    };
  });
}

export const QUADRANT_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  leaders: {
    fill: 'rgba(6, 182, 212, 0.15)',
    stroke: 'rgba(6, 182, 212, 0.6)',
    text: 'rgb(6, 182, 212)',
  },
  regulatoryHedge: {
    fill: 'rgba(34, 197, 94, 0.12)',
    stroke: 'rgba(34, 197, 94, 0.5)',
    text: 'rgb(34, 197, 94)',
  },
  volumeRiders: {
    fill: 'rgba(245, 158, 11, 0.12)',
    stroke: 'rgba(245, 158, 11, 0.5)',
    text: 'rgb(245, 158, 11)',
  },
  outsiders: {
    fill: 'rgba(239, 68, 68, 0.08)',
    stroke: 'rgba(239, 68, 68, 0.35)',
    text: 'rgb(239, 68, 68)',
  },
};

export const QUADRANT_LABELS: Record<string, string> = {
  leaders: 'LEADERS',
  regulatoryHedge: 'REGULATORY HEDGE',
  volumeRiders: 'VOLUME RIDERS',
  outsiders: 'OUTSIDERS',
};

export const QUADRANT_DESCRIPTIONS: Record<string, string> = {
  leaders: 'Dominant coverage + maximum volume',
  regulatoryHedge: 'Strong licenses, niche focus',
  volumeRiders: 'High volume, building coverage',
  outsiders: 'Limited or no US access',
};
