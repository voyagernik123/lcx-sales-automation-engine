/**
 * Listing Propensity — deterministic, explainable prediction of "will this
 * project pay LCX for a listing", calibrated offline against LCX's own
 * won-deal labels (see apps/api/src/labels/calibrate.ts). Runtime is a
 * weighted sum of coarse feature buckets with reason trails, exactly like the
 * regulatory factors — never fitted coefficients (n=36 positives).
 */
import type { ReasonTrail } from '../types.js';

export interface PropensityInput {
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  tokenAgeDays: number | null;
  /** Months since the most recent funding round (null = unknown/none). */
  fundingMonthsAgo: number | null;
  /** Raise size in $M of that round. */
  fundingAmountM: number | null;
  exchangeCount: number | null;
  category: string | null;
  chain: string | null;
  region: 'eu' | 'us' | 'other' | null;
  /** ESMA/MiCA registry presence — projects already paying for EU compliance. */
  isMicaRegistry: boolean;
  hasVerifiedContact: boolean;
  isPreTge: boolean;
  listedOnLcx: boolean;
}

export type McapBand = 'micro' | 'small' | 'mid' | 'large';
export type VolBand = 'illiquid' | 'normal' | 'hot';

export function mcapBand(mcapUsd: number | null): McapBand | null {
  if (mcapUsd == null || mcapUsd <= 0) return null;
  if (mcapUsd < 10_000_000) return 'micro';
  if (mcapUsd < 100_000_000) return 'small';
  if (mcapUsd < 1_000_000_000) return 'mid';
  return 'large';
}

export function volMcapBand(volumeUsd: number | null, mcapUsd: number | null): VolBand | null {
  if (volumeUsd == null || mcapUsd == null || mcapUsd <= 0) return null;
  const ratio = volumeUsd / mcapUsd;
  if (ratio < 0.005) return 'illiquid';
  if (ratio < 0.05) return 'normal';
  return 'hot';
}

/** Categories over-represented in LCX's closed deals. */
const FIT_CATEGORIES = [
  'defi', 'exchange', 'infrastructure', 'infra', 'gaming', 'gamefi',
  'rwa', 'real world', 'payments', 'trading', 'launchpad', 'oracle',
];

/** LCX lists ERC20-first — EVM chains dominate the won set. */
const FIT_CHAINS = ['ethereum', 'eth', 'erc20', 'base', 'bsc', 'binance', 'polygon', 'arbitrum', 'optimism'];

export function categoryFits(category: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return FIT_CATEGORIES.some((f) => c.includes(f));
}

export function chainFits(chain: string | null): boolean {
  if (!chain) return false;
  const c = chain.toLowerCase();
  return FIT_CHAINS.some((f) => c.includes(f));
}

export interface PropensityWeights {
  mcap: Record<McapBand, number>;
  vol: Record<VolBand, number>;
  funding: { m6: number; m12: number; m24: number; older: number };
  tokenAge: { newborn: number; young: number; mature: number };
  exchanges: { none: number; few: number; several: number; many: number };
  categoryFit: number;
  chainFit: number;
  euPresence: number;
  verifiedContact: number;
  preTge: number;
  /** Hard cap applied when the project is already listed on LCX. */
  alreadyListedCap: number;
}

export interface PropensityResult {
  score: number;
  reasons: ReasonTrail[];
}

export function scorePropensity(input: PropensityInput, w: PropensityWeights): PropensityResult {
  const reasons: ReasonTrail[] = [];
  let total = 0;
  const add = (code: string, factor: string, points: number, note: string, max = 20) => {
    if (points === 0) return;
    total += points;
    reasons.push({ code, factor, points, max, note });
  };

  const mb = mcapBand(input.marketCapUsd);
  if (mb) add('PROP_MCAP', 'Market cap band', w.mcap[mb], `${mb} cap`);

  const vb = volMcapBand(input.volume24hUsd, input.marketCapUsd);
  if (vb) add('PROP_VOL', 'Volume/mcap', w.vol[vb], `${vb} turnover`);

  if (input.fundingMonthsAgo != null) {
    const f = input.fundingMonthsAgo;
    const pts = f <= 6 ? w.funding.m6 : f <= 12 ? w.funding.m12 : f <= 24 ? w.funding.m24 : w.funding.older;
    const amt = input.fundingAmountM ? ` ($${input.fundingAmountM}M)` : '';
    add('PROP_FUNDING', 'Funding recency', pts, `raised ${Math.round(f)}mo ago${amt}`);
  }

  if (input.tokenAgeDays != null) {
    const a = input.tokenAgeDays;
    const pts = a < 180 ? w.tokenAge.newborn : a < 720 ? w.tokenAge.young : w.tokenAge.mature;
    add('PROP_AGE', 'Token age', pts, a < 180 ? 'launched <6mo' : a < 720 ? 'growth stage' : 'mature token');
  }

  if (input.exchangeCount != null) {
    const e = input.exchangeCount;
    const pts = e === 0 ? w.exchanges.none : e <= 5 ? w.exchanges.few : e <= 15 ? w.exchanges.several : w.exchanges.many;
    add('PROP_EXCH', 'Exchange coverage', pts, `${e} listings — ${e <= 5 ? 'expansion mode' : e === 0 ? 'first CEX' : 'well covered'}`);
  }

  if (categoryFits(input.category)) {
    add('PROP_CAT', 'Category fit', w.categoryFit, `${input.category} matches won-deal profile`);
  }
  if (chainFits(input.chain)) {
    add('PROP_CHAIN', 'Chain fit', w.chainFit, `${input.chain} — ERC20/EVM listing path`);
  }
  if (input.region === 'eu' || input.isMicaRegistry) {
    add('PROP_EU', 'EU/MiCA presence', w.euPresence, input.isMicaRegistry ? 'MiCA registry — already spending on EU compliance' : 'EU-based');
  }
  if (input.hasVerifiedContact) {
    add('PROP_CONTACT', 'Reachable', w.verifiedContact, 'verified contact on file');
  }
  if (input.isPreTge) {
    add('PROP_PRETGE', 'Pre-TGE', w.preTge, 'pre-launch — hungry for listing partners');
  }

  let score = Math.max(0, Math.min(100, Math.round(total)));

  if (input.listedOnLcx) {
    score = Math.min(score, w.alreadyListedCap);
    reasons.push({
      code: 'PROP_LISTED',
      factor: 'Already listed',
      points: 0,
      max: 0,
      note: `already on LCX — capped at ${w.alreadyListedCap} (expansion handled by deal desk)`,
    });
  }

  return { score, reasons };
}

/**
 * Priority = propensity gated by regulatory eligibility. A project we cannot
 * list is never a priority no matter how likely it is to pay.
 */
export function combinePriority(propensityScore: number, eligibilityScore: number): number {
  const gate = eligibilityScore >= 60 ? 1.0 : eligibilityScore >= 40 ? 0.7 : 0.4;
  return Math.round(propensityScore * gate);
}
