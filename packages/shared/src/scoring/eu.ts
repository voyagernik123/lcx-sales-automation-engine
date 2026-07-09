import type { ScoreInputProject, ScoreInputContact, ScoreInputSignal, EuScoreResult, ReasonTrail } from './types.js';
import { computeBand } from './types.js';

const ESMA_SOURCES = new Set(['esma_main', 'esma_casp', 'esma_emt']);
const PRE_TGE_SOURCES = new Set(['pre_tge', 'potential']);
const PIPELINE_SOURCE = new Set(['pipeline']);
const TOP100_SOURCE = new Set(['top100']);

const DESIRABLE_CATEGORIES = new Set([
  'defi', 'l1', 'l2', 'infrastructure', 'interoperability',
  'zkevm', 'modular', 'data availability', 'oracle', 'rwa',
]);
const MODERATE_CATEGORIES = new Set([
  'gaming', 'nft', 'social', 'dao', 'depin',
]);

function scoreEuNeed(p: ScoreInputProject): { points: number; note: string } {
  if (ESMA_SOURCES.has(p.source) && p.esmaTokenId) {
    return { points: 18, note: `ESMA-notified token ${p.esmaTokenId} with EU jurisdiction` };
  }
  if (ESMA_SOURCES.has(p.source) && p.jurisdiction) {
    const euLike = ['DE', 'FR', 'ES', 'IT', 'NL', 'MT', 'LT', 'EE', 'PT', 'AT', 'IE', 'LU', 'FI', 'BE', 'SK', 'SI', 'LV', 'HR', 'CY', 'GR', 'PL', 'BG', 'RO', 'HU', 'CZ', 'DK', 'SE'];
    if (euLike.includes(p.jurisdiction)) {
      return { points: 14, note: `ESMA-notified in EU jurisdiction ${p.jurisdiction}` };
    }
    return { points: 10, note: `ESMA-notified in ${p.jurisdiction}` };
  }
  if (p.esmaTokenId) {
    return { points: 12, note: `Has ESMA token ID ${p.esmaTokenId}` };
  }
  if (PRE_TGE_SOURCES.has(p.source)) {
    return { points: 8, note: 'Pre-TGE / potential listing — EU MiCA gateway needed' };
  }
  if (PIPELINE_SOURCE.has(p.source)) {
    return { points: 6, note: 'In pipeline LCX — EU MiCA relevance deemed' };
  }
  if (p.jurisdiction) {
    const euLike = ['DE', 'FR', 'ES', 'IT', 'NL', 'MT', 'LT', 'EE', 'PT', 'AT', 'IE', 'LU', 'FI', 'BE', 'SK', 'SI', 'LV', 'HR', 'CY', 'GR', 'PL', 'BG', 'RO', 'HU', 'CZ', 'DK', 'SE'];
    if (euLike.includes(p.jurisdiction)) {
      return { points: 8, note: `EU jurisdiction ${p.jurisdiction} — MiCA applies` };
    }
    return { points: 4, note: `Non-EU jurisdiction ${p.jurisdiction}` };
  }
  return { points: 2, note: 'No EU/MiCA signal detected' };
}

function scoreWillingness(p: ScoreInputProject, contacts: ScoreInputContact[]): { points: number; note: string } {
  let score = 0;
  const signals: string[] = [];

  if (p.listedOnLcx) {
    score += 8;
    signals.push('already on LCX');
  }
  if (p.marketCap) {
    const num = parseFloat(p.marketCap.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
      if (num >= 100_000_000) { score += 8; signals.push(`raise/mcap $${(num / 1_000_000).toFixed(0)}M`); }
      else if (num >= 10_000_000) { score += 6; signals.push(`raise/mcap $${(num / 1_000_000).toFixed(0)}M`); }
      else { score += 4; signals.push(`raise/mcap $${(num / 1_000_000).toFixed(1)}M`); }
    }
  }
  if (TOP100_SOURCE.has(p.source)) {
    score += 4;
    signals.push('top-100 ranked project');
  }
  if (PIPELINE_SOURCE.has(p.source) && !p.listedOnLcx) {
    score += 4;
    signals.push('in pipeline — active BD engagement');
  }
  if (contacts.length > 0 && contacts.some((c) => c.email)) {
    score += 2;
    signals.push('contact email available');
  }
  if (p.ticker) {
    score += 2;
    signals.push('has ticker');
  }

  const capped = Math.min(score, 16);
  return { points: capped, note: signals.length > 0 ? signals.join('; ') : 'No willingness signals' };
}

function scoreTiming(p: ScoreInputProject): { points: number; note: string } {
  if (PRE_TGE_SOURCES.has(p.source)) {
    return { points: 14, note: 'Pre-TGE — imminent listing window' };
  }
  if (p.source === 'potential') {
    return { points: 10, note: 'Potential lead — timing not confirmed' };
  }
  if (ESMA_SOURCES.has(p.source)) {
    if (p.esmaTokenId && p.jurisdiction) {
      return { points: 10, note: `ESMA-notified ${p.esmaTokenId} — notification date known` };
    }
    return { points: 8, note: 'ESMA-filed — regulatory timeline active' };
  }
  if (TOP100_SOURCE.has(p.source)) {
    return { points: 8, note: 'Top-100 — market timing relevant' };
  }
  if (PIPELINE_SOURCE.has(p.source)) {
    return { points: 6, note: 'Pipeline project — active engagement' };
  }
  return { points: 4, note: 'No timing trigger identified' };
}

function scoreLiquidity(p: ScoreInputProject): { points: number; note: string } {
  let score = 0;
  const signals: string[] = [];

  if (p.marketCap) {
    const num = parseFloat(p.marketCap.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
      if (num >= 50_000_000) { score += 8; signals.push('large raise/mcap'); }
      else if (num >= 5_000_000) { score += 6; signals.push('moderate raise/mcap'); }
      else { score += 4; signals.push('small raise/mcap'); }
    }
  }
  if (p.ticker) {
    score += 4;
    signals.push('ticker assigned');
  }
  if (p.chain) {
    score += 2;
    signals.push(`chain: ${p.chain}`);
  }
  if (TOP100_SOURCE.has(p.source)) {
    score += 2;
    signals.push('top-100 — institutional liquidity expected');
  }

  return { points: Math.min(score, 12), note: signals.length > 0 ? signals.join('; ') : 'No liquidity data' };
}

function scoreCategory(p: ScoreInputProject): { points: number; note: string } {
  const cat = (p.category || '').toLowerCase().trim();
  if (!cat) {
    return { points: 4, note: 'No category specified' };
  }
  if (DESIRABLE_CATEGORIES.has(cat)) {
    return { points: 10, note: `Desirable category: ${cat}` };
  }
  if (MODERATE_CATEGORIES.has(cat)) {
    return { points: 7, note: `Moderate category: ${cat}` };
  }
  return { points: 5, note: `Category: ${cat}` };
}

function scoreMomentum(p: ScoreInputProject): { points: number; note: string } {
  let score = 0;
  const signals: string[] = [];

  if (TOP100_SOURCE.has(p.source)) {
    score += 6;
    signals.push('top-100 ranked');
  }
  if (p.marketCap) {
    const num = parseFloat(p.marketCap.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num >= 10_000_000) {
      score += 4;
      signals.push('high raise/mcap');
    }
  }
  if (p.esmaTokenId && ESMA_SOURCES.has(p.source)) {
    score += 2;
    signals.push('ESMA-vetted');
  }
  if (PIPELINE_SOURCE.has(p.source) || PRE_TGE_SOURCES.has(p.source)) {
    score += 2;
    signals.push('active BD pipeline');
  }
  if (p.listedOnLcx) {
    score += 2;
    signals.push('listed on LCX');
  }

  return { points: Math.min(score, 10), note: signals.length > 0 ? signals.join('; ') : 'No momentum signals' };
}

function scoreContactability(contacts: ScoreInputContact[]): { points: number; note: string } {
  if (contacts.length === 0) {
    return { points: 0, note: 'No contacts available' };
  }

  let best = 0;
  for (const c of contacts) {
    if (c.email && c.name) { best = Math.max(best, 10); }
    else if (c.telegram && c.name) { best = Math.max(best, 8); }
    else if (c.email) { best = Math.max(best, 7); }
    else if (c.telegram) { best = Math.max(best, 6); }
    else if (c.linkedin) { best = Math.max(best, 5); }
    else if (c.name) { best = Math.max(best, 4); }
  }

  const note = best >= 10 ? 'Email + name available' :
    best >= 8 ? 'Telegram + name available' :
    best >= 6 ? 'Direct contact channel available' :
    best >= 4 ? 'Contact name available' :
    'No usable contact info';
  return { points: best, note };
}

function scoreRisk(p: ScoreInputProject): { points: number; note: string } {
  let score = 0;
  const signals: string[] = [];

  if (p.whitepaperUrl) {
    score += 4;
    signals.push('whitepaper published');
  }
  if (p.jurisdiction) {
    const highTrust = ['DE', 'FR', 'ES', 'IT', 'NL', 'MT', 'LI', 'CH', 'SG', 'AE', 'JP', 'KR', 'GB'];
    const euLike = ['DE', 'FR', 'ES', 'IT', 'NL', 'MT', 'LT', 'EE', 'PT', 'AT', 'IE', 'LU', 'FI', 'BE', 'SK', 'SI', 'LV', 'HR', 'CY', 'GR', 'PL', 'BG', 'RO', 'HU', 'CZ', 'DK', 'SE'];
    if (highTrust.includes(p.jurisdiction)) {
      score += 4;
      signals.push(`high-trust jurisdiction ${p.jurisdiction}`);
    } else if (euLike.includes(p.jurisdiction)) {
      score += 3;
      signals.push(`EU jurisdiction ${p.jurisdiction}`);
    } else {
      score += 1;
      signals.push(`jurisdiction ${p.jurisdiction}`);
    }
  }
  if (p.esmaTokenId) {
    score += 2;
    signals.push('ESMA token ID on file');
  }
  if (p.ticker) {
    score += 1;
    signals.push('ticker assigned');
  }
  if (p.chain) {
    score += 1;
    signals.push(`chain: ${p.chain}`);
  }

  return { points: Math.min(score, 10), note: signals.length > 0 ? signals.join('; ') : 'No risk data' };
}

export function scoreEu(
  project: ScoreInputProject,
  contacts: ScoreInputContact[],
  _signals?: ScoreInputSignal[],
): EuScoreResult {
  const results: ReasonTrail[] = [];

  const need = scoreEuNeed(project);
  results.push({ code: 'EU_NEED', factor: 'EU/MiCA need', points: need.points, max: 18, note: need.note });

  const will = scoreWillingness(project, contacts);
  results.push({ code: 'WILLINGNESS', factor: 'Willingness to pay', points: will.points, max: 16, note: will.note });

  const timing = scoreTiming(project);
  results.push({ code: 'TIMING', factor: 'Timing trigger', points: timing.points, max: 14, note: timing.note });

  const liq = scoreLiquidity(project);
  results.push({ code: 'LIQUIDITY', factor: 'Liquidity readiness', points: liq.points, max: 12, note: liq.note });

  const cat = scoreCategory(project);
  results.push({ code: 'CATEGORY', factor: 'Category fit', points: cat.points, max: 10, note: cat.note });

  const mom = scoreMomentum(project);
  results.push({ code: 'MOMENTUM', factor: 'Momentum', points: mom.points, max: 10, note: mom.note });

  const cont = scoreContactability(contacts);
  results.push({ code: 'CONTACT', factor: 'Contactability', points: cont.points, max: 10, note: cont.note });

  const risk = scoreRisk(project);
  results.push({ code: 'RISK', factor: 'Risk clearance', points: risk.points, max: 10, note: risk.note });

  const total = results.reduce((sum, r) => sum + r.points, 0);
  const band = computeBand(total);

  return { score: total, band, reasons: results };
}
