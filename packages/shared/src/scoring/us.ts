import type { ScoreInputProject, ScoreInputContact, ScoreInputSignal, UsScoreResult, ReasonTrail, RedFlagResult } from './types.js';
import { computeBand } from './types.js';

interface UsFactorWeights {
  howeyRisk: number;
  stateMtl: number;
  usEntity: number;
  competitorGap: number;
  instRails: number;
  payLiquidity: number;
}

const PRE_CLARITY: UsFactorWeights = {
  howeyRisk: 25,
  stateMtl: 20,
  usEntity: 20,
  competitorGap: 12,
  instRails: 10,
  payLiquidity: 13,
};

const POST_CLARITY: UsFactorWeights = {
  howeyRisk: 15,
  stateMtl: 20,
  usEntity: 20,
  competitorGap: 12,
  instRails: 18,
  payLiquidity: 15,
};

function baseHoweyRisk(p: ScoreInputProject, signals: ScoreInputSignal[]): { score: number; note: string } {
  let risk = 50;
  const factors: string[] = [];

  // ESMA-vetted tokens are lower risk (EU regulatory review reduces Howey uncertainty)
  if (p.esmaTokenId) { risk -= 20; factors.push('ESMA-vetted'); }
  if (p.whitepaperUrl) { risk -= 10; factors.push('whitepaper published'); }
  if (p.ticker) { risk -= 5; factors.push('ticker assigned'); }
  if (p.listedOnLcx) { risk -= 10; factors.push('already listed on LCX (EU-compliant venue)'); }

  // US jurisdiction = higher federal securities risk
  if (p.jurisdiction === 'US' || p.jurisdiction === 'USA') { risk += 20; factors.push('US jurisdiction — direct Howey scrutiny'); }
  if (p.source === 'top100') { risk -= 5; factors.push('top-100 — market-proven'); }

  // Check signals for security token indicators
  for (const s of signals || []) {
    const payload = s.payload || {};
    const notes = String(payload.notes || payload.raw || '').toLowerCase();
    if (notes.includes('security token') || notes.includes('security')) {
      risk += 30; factors.push('security token indicator');
    }
  }

  const rawCategories = ['real estate', 'equity', 'commodity'];
  const cat = (p.category || '').toLowerCase();
  if (rawCategories.includes(cat)) { risk += 15; factors.push(`category ${cat} — Howey risk`); }

  const finalScore = Math.max(0, Math.min(100, 100 - risk));
  const note = factors.length > 0 ? factors.join('; ') : 'Default risk assessment';
  return { score: finalScore, note };
}

function baseStateMtl(p: ScoreInputProject, contacts: ScoreInputContact[]): { score: number; note: string } {
  let score = 30;
  const factors: string[] = [];

  if (p.jurisdiction) {
    const usRelevant = ['US', 'USA', 'DE', 'FR', 'ES', 'IT', 'NL', 'MT', 'LT', 'SG', 'AE', 'GB', 'CH'];
    if (usRelevant.includes(p.jurisdiction)) {
      score += 20; factors.push(`jurisdiction ${p.jurisdiction} — MTL-relevant`);
    } else {
      score += 10; factors.push(`jurisdiction ${p.jurisdiction}`);
    }
  }
  if (p.esmaTokenId) { score += 10; factors.push('ESMA-identified — KYC/AML ready'); }
  if (p.dti) { score += 10; factors.push('DTI coded — regulatory classification available'); }
  if (p.whitepaperUrl) { score += 10; factors.push('whitepaper — compliance assessment possible'); }
  if (p.listedOnLcx) { score += 10; factors.push('already on LCX — compliance infrastructure exists'); }
  if (p.website) {
    try {
      const domain = new URL(p.website).hostname.replace('www.', '');
      if (domain.endsWith('.io') || domain.endsWith('.com')) { score += 5; factors.push('established domain'); }
    } catch { /* ignore invalid URLs */ }
  }
  if (contacts.some((c) => c.linkedin)) { score += 5; factors.push('team LinkedIn available'); }

  return { score: Math.min(score, 100), note: factors.length > 0 ? factors.join('; ') : 'No MTL data' };
}

function baseUsEntity(p: ScoreInputProject, contacts: ScoreInputContact[]): { score: number; note: string } {
  let score = 20;
  const factors: string[] = [];

  if (p.jurisdiction === 'US' || p.jurisdiction === 'USA') {
    score += 30; factors.push('US-based entity');
  }
  if (p.esmaTokenId) { score += 15; factors.push('ESMA-identified — entity on file'); }
  if (contacts.length > 0) { score += 15; factors.push(`${contacts.length} contact(s) available`); }
  if (contacts.some((c) => c.linkedin)) { score += 10; factors.push('team LinkedIn profiles'); }
  if (contacts.some((c) => c.email)) { score += 10; factors.push('direct email contact'); }
  if (p.website) { score += 10; factors.push('website — entity identity verified'); }
  if (p.listedOnLcx) { score += 10; factors.push('listed on LCX — entity vetted'); }

  return { score: Math.min(score, 100), note: factors.length > 0 ? factors.join('; ') : 'No entity data' };
}

function baseCompetitorGap(p: ScoreInputProject): { score: number; note: string } {
  let score = 40;
  const factors: string[] = [];

  const cat = (p.category || '').toLowerCase().trim();
  const highGapCategories = new Set(['l1', 'l2', 'infrastructure', 'interoperability', 'zkevm', 'modular', 'data availability', 'rwa', 'defi']);
  const moderateGap = new Set(['depin', 'gaming', 'oracle', 'payments']);

  if (highGapCategories.has(cat)) { score += 25; factors.push(`high-competition gap category: ${cat}`); }
  else if (moderateGap.has(cat)) { score += 15; factors.push(`moderate-gap category: ${cat}`); }
  else if (cat) { score += 10; factors.push(`category: ${cat}`); }

  if (p.ticker) { score += 10; factors.push('ticker — market identity'); }
  if (TOP100_SOURCE.has(p.source)) { score += 15; factors.push('top-100 — proven market position'); }
  if (p.marketCap) {
    const num = parseFloat(p.marketCap.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num >= 10_000_000) { score += 10; factors.push('significant raise/mcap'); }
  }

  return { score: Math.min(score, 100), note: factors.length > 0 ? factors.join('; ') : 'Default gap assessment' };
}

function baseInstRails(p: ScoreInputProject): { score: number; note: string } {
  let score = 20;
  const factors: string[] = [];

  if (p.whitepaperUrl) { score += 15; factors.push('whitepaper — institutional-grade docs'); }
  if (p.dti) { score += 15; factors.push('DTI code — regulatory classification'); }
  if (p.esmaTokenId) { score += 15; factors.push('ESMA ID — institutional identifier'); }
  if (p.listedOnLcx) { score += 15; factors.push('already on compliant venue'); }
  if (p.jurisdiction) {
    const instFriendly = ['DE', 'FR', 'ES', 'NL', 'MT', 'LT', 'SG', 'AE', 'GB', 'CH', 'JP'];
    if (instFriendly.includes(p.jurisdiction)) { score += 10; factors.push(`institution-friendly jurisdiction ${p.jurisdiction}`); }
  }
  if (p.chain) { score += 5; factors.push(`chain: ${p.chain}`); }

  return { score: Math.min(score, 100), note: factors.length > 0 ? factors.join('; ') : 'No institutional data' };
}

function basePayLiquidity(p: ScoreInputProject): { score: number; note: string } {
  let score = 10;
  const factors: string[] = [];

  if (p.marketCap) {
    const num = parseFloat(p.marketCap.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) {
      if (num >= 50_000_000) { score += 35; factors.push(`raise/mcap $${(num / 1_000_000).toFixed(0)}M`); }
      else if (num >= 5_000_000) { score += 25; factors.push(`raise/mcap $${(num / 1_000_000).toFixed(0)}M`); }
      else { score += 15; factors.push(`raise/mcap $${(num / 1_000_000).toFixed(1)}M`); }
    }
  }
  if (p.ticker) { score += 15; factors.push('ticker assigned'); }
  if (p.chain) { score += 10; factors.push(`chain: ${p.chain}`); }
  if (TOP100_SOURCE.has(p.source)) { score += 15; factors.push('top-100 — liquidity expected'); }
  if (p.listedOnLcx) { score += 15; factors.push('listed on LCX — trading active'); }
  if (PRE_TGE_SOURCES.has(p.source)) { score += 10; factors.push('pre-TGE — liquidity pending'); }

  return { score: Math.min(score, 100), note: factors.length > 0 ? factors.join('; ') : 'No liquidity data' };
}

function checkRedFlags(p: ScoreInputProject, signals: ScoreInputSignal[]): RedFlagResult {
  const reasons: ReasonTrail[] = [];
  const redFlags: string[] = [];

  for (const s of signals || []) {
    const notes = JSON.stringify(s.payload || {}).toLowerCase();
    if (notes.includes('security token')) {
      reasons.push({ code: 'RED_SECURITY', factor: 'Red flag', points: -30, max: 0, note: 'Security token indicator — compliance barrier' });
      redFlags.push('security token');
    }
    if (notes.includes('dead') || notes.includes('defunct') || notes.includes('abandoned')) {
      reasons.push({ code: 'RED_DEAD', factor: 'Red flag', points: -30, max: 0, note: 'Project flagged as dead/defunct' });
      redFlags.push('dead project');
    }
  }

  const cat = (p.category || '').toLowerCase();
  if (cat.includes('security') || cat.includes('equity')) {
    reasons.push({ code: 'RED_CATEGORY', factor: 'Red flag', points: -20, max: 0, note: `Category "${cat}" suggests security classification` });
    redFlags.push('security category');
  }

  if (!p.website && !p.whitepaperUrl && !p.ticker) {
    reasons.push({ code: 'RED_NODATA', factor: 'Red flag', points: -10, max: 0, note: 'No website, whitepaper, or ticker — insufficient data' });
    redFlags.push('insufficient data');
  }

  return { flagged: redFlags.length > 0, reasons };
}

const TOP100_SOURCE = new Set(['top100']);
const PRE_TGE_SOURCES = new Set(['pre_tge', 'potential']);

function applyWeights(base: number, weight: number): number {
  return Math.round(base * weight / 100);
}

function computeUsScore(
  p: ScoreInputProject,
  contacts: ScoreInputContact[],
  signals: ScoreInputSignal[],
  weights: UsFactorWeights,
  modeLabel: string,
): { score: number; reasons: ReasonTrail[] } {
  const h = baseHoweyRisk(p, signals);
  const s = baseStateMtl(p, contacts);
  const e = baseUsEntity(p, contacts);
  const c = baseCompetitorGap(p);
  const i = baseInstRails(p);
  const l = basePayLiquidity(p);

  const howeyPoints = applyWeights(h.score, weights.howeyRisk);
  const statePoints = applyWeights(s.score, weights.stateMtl);
  const entityPoints = applyWeights(e.score, weights.usEntity);
  const compPoints = applyWeights(c.score, weights.competitorGap);
  const instPoints = applyWeights(i.score, weights.instRails);
  const payPoints = applyWeights(l.score, weights.payLiquidity);

  const total = howeyPoints + statePoints + entityPoints + compPoints + instPoints + payPoints;

  const reasons: ReasonTrail[] = [
    { code: `US_HOWEY_${modeLabel}`, factor: 'Howey/federal securities risk', points: howeyPoints, max: weights.howeyRisk, note: h.note },
    { code: `US_MTL_${modeLabel}`, factor: 'State MTL / 50-state feasibility', points: statePoints, max: weights.stateMtl, note: s.note },
    { code: `US_ENTITY_${modeLabel}`, factor: 'US entity / users / team', points: entityPoints, max: weights.usEntity, note: e.note },
    { code: `US_COMP_${modeLabel}`, factor: 'Competitor gap (26 profiles)', points: compPoints, max: weights.competitorGap, note: c.note },
    { code: `US_INST_${modeLabel}`, factor: 'Institutional rails fit', points: instPoints, max: weights.instRails, note: i.note },
    { code: `US_PAY_${modeLabel}`, factor: 'Pay + liquidity', points: payPoints, max: weights.payLiquidity, note: l.note },
  ];

  return { score: Math.min(total, 100), reasons };
}

export function scoreUs(
  project: ScoreInputProject,
  contacts: ScoreInputContact[],
  signals?: ScoreInputSignal[],
): UsScoreResult {
  const signalsArr = signals || [];

  const redFlag = checkRedFlags(project, signalsArr);

  const pre = computeUsScore(project, contacts, signalsArr, PRE_CLARITY, 'PRE');
  const post = computeUsScore(project, contacts, signalsArr, POST_CLARITY, 'POST');

  const preScore = Math.max(0, pre.score + redFlag.reasons.reduce((s, r) => s + r.points, 0));
  const postScore = Math.max(0, post.score + redFlag.reasons.reduce((s, r) => s + r.points, 0));

  const allReasons = [...pre.reasons, ...post.reasons, ...redFlag.reasons];
  const band = computeBand(Math.max(preScore, postScore));

  return {
    preScore,
    postScore,
    band,
    reasons: allReasons,
    redFlag,
  };
}
