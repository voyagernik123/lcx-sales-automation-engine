/**
 * Alpha — the predictive intelligence layer (Wave 2).
 *
 * Pure, deterministic functions that turn a project's sourced signals into the
 * five composite scores the desk actually acts on — Listing Propensity, Timing
 * Window, Deal Value, Winnability, Conviction — plus an Analysis of Competing
 * Hypotheses (ACH) verdict. Everything is explainable (each score carries its
 * drivers) and honest about certainty (each carries a confidence derived from
 * the inputs). No LLM, no paid data — free-tier safe. Weights are a v1 prior to
 * be recalibrated by the backtest/learning loop (Wave 6).
 */

export interface SignalBundle {
  marketCapUsd?: number | null;
  volume24hUsd?: number | null;
  priceChange30d?: number | null;
  tokenAgeDays?: number | null;
  tvlUsd?: number | null;
  chainCount?: number | null;
  tvlChange7d?: number | null;
  category?: string | null;
  githubCommits30d?: number | null;
  githubStars?: number | null;
  teamSize?: number | null;
  devStatus?: string | null;
  euScore?: number | null;
  usPostScore?: number | null;
  propensityScore?: number | null;
  priorityScore?: number | null;
  listedOnLcx?: boolean;
  competitorExchangeCount?: number | null;
  recommendedMarket?: string | null;
  contactCount?: number | null;
  /** Mean confidence (0–100) of the observations that fed this bundle. */
  dataConfidence?: number;
}

export interface Driver {
  label: string;
  /** Signed contribution to the score, in points. */
  points: number;
}

export interface ScoreResult {
  score: number; // 0–100
  drivers: Driver[];
  confidence: number; // 0–100
}

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));
const n = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : null;

/** Normalize a value into 0–1 across a linear range. */
const lin = (v: number, min: number, max: number): number => clamp(((v - min) / (max - min)) * 1, 0, 1);
/** Normalize across a log range (for money-like magnitudes). */
const log = (v: number, min: number, max: number): number => {
  if (v <= 0) return 0;
  const l = Math.log10(Math.max(min, 1));
  const h = Math.log10(Math.max(max, 10));
  return clamp((Math.log10(Math.min(Math.max(v, min), max)) - l) / (h - l), 0, 1);
};

function baseConfidence(s: SignalBundle, used: (number | null)[]): number {
  const present = used.filter((x) => x != null).length;
  const coverage = used.length ? present / used.length : 0;
  const dc = (s.dataConfidence ?? 50) / 100;
  // Confidence is the geometric-ish blend of "how much did we know" and "how good was it".
  return Math.round(clamp(Math.sqrt(coverage * dc) * 100, 0, 100));
}

function top(drivers: Driver[], k = 5): Driver[] {
  return [...drivers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, k);
}

/* ── Listing Propensity — will they want to list? ─────────────────── */
export function listingPropensity(s: SignalBundle): ScoreResult {
  const drivers: Driver[] = [];
  // Anchor on the calibrated propensity model (chainFit etc.), then adjust.
  const anchor = n(s.propensityScore);
  let score = anchor ?? 40;
  if (anchor != null) drivers.push({ label: 'Propensity model', points: 0 }); // shown as the base

  const commits = n(s.githubCommits30d);
  if (commits != null) {
    const p = Math.round(lin(commits, 0, 60) * 14);
    if (p) drivers.push({ label: 'Active development', points: p });
    score += p;
  }
  const team = n(s.teamSize);
  if (team != null && team > 0) {
    const p = Math.min(6, team);
    drivers.push({ label: 'Named team', points: p });
    score += p;
  }
  if (s.devStatus && /working|live|beta/i.test(s.devStatus)) {
    drivers.push({ label: 'Working product', points: 6 });
    score += 6;
  }
  const tvl = n(s.tvlUsd);
  if (tvl != null && tvl > 0) {
    const p = Math.round(log(tvl, 1e5, 1e9) * 10);
    if (p) drivers.push({ label: 'Real TVL / traction', points: p });
    score += p;
  }
  if (s.listedOnLcx) {
    drivers.push({ label: 'Already on LCX', points: -40 });
    score -= 40;
  }
  return { score: Math.round(clamp(score)), drivers: top(drivers), confidence: baseConfidence(s, [anchor, commits, team, tvl]) };
}

/* ── Timing Window — are they in-market soon? ─────────────────────── */
export type TimingWindow = 'hot' | 'warming' | 'quiet';
export function timingWindow(s: SignalBundle): ScoreResult & { window: TimingWindow } {
  const drivers: Driver[] = [];
  let score = 25; // baseline

  const mom = n(s.priceChange30d);
  if (mom != null) {
    const p = Math.round(clamp(mom, -40, 60) * 0.6);
    drivers.push({ label: `30d momentum ${mom > 0 ? '+' : ''}${Math.round(mom)}%`, points: p });
    score += p;
  }
  const tvlmom = n(s.tvlChange7d);
  if (tvlmom != null && Math.abs(tvlmom) > 1) {
    const p = Math.round(clamp(tvlmom, -30, 40) * 0.4);
    drivers.push({ label: 'TVL trend (7d)', points: p });
    score += p;
  }
  // Competitive pressure: listed on rivals but not LCX → they need venues / parity.
  const rivals = n(s.competitorExchangeCount);
  if (rivals != null && rivals > 0 && !s.listedOnLcx) {
    const p = Math.round(lin(rivals, 0, 8) * 22);
    drivers.push({ label: `On ${rivals} competitor venue${rivals === 1 ? '' : 's'}, not LCX`, points: p });
    score += p;
  }
  const commits = n(s.githubCommits30d);
  if (commits != null && commits > 20) {
    drivers.push({ label: 'Dev surge', points: 8 });
    score += 8;
  }
  const sc = Math.round(clamp(score));
  const window: TimingWindow = sc >= 65 ? 'hot' : sc >= 42 ? 'warming' : 'quiet';
  return { score: sc, window, drivers: top(drivers), confidence: baseConfidence(s, [mom, tvlmom, rivals]) };
}

/* ── Deal Value — what's it worth? (USD estimate) ─────────────────── */
export function dealValue(s: SignalBundle): ScoreResult & { usd: number } {
  const drivers: Driver[] = [];
  const mcap = n(s.marketCapUsd) ?? 0;
  const vol = n(s.volume24hUsd) ?? 0;
  const tvl = n(s.tvlUsd) ?? 0;
  // A listing's value scales with the token's size and liquidity. Anchor tiers
  // (USD) chosen to land in the desk's real package range (~$15k–$250k).
  const sizeScore = log(mcap, 1e6, 5e9);
  const liqScore = log(Math.max(vol, tvl), 1e5, 1e9);
  const blended = 0.6 * sizeScore + 0.4 * liqScore;
  const usd = Math.round((15_000 + blended * 235_000) / 500) * 500;
  if (mcap > 0) drivers.push({ label: 'Market cap tier', points: Math.round(sizeScore * 60) });
  if (Math.max(vol, tvl) > 0) drivers.push({ label: 'Liquidity tier', points: Math.round(liqScore * 40) });
  return { score: Math.round(blended * 100), usd, drivers: top(drivers), confidence: baseConfidence(s, [n(s.marketCapUsd), n(s.volume24hUsd) ?? n(s.tvlUsd)]) };
}

/* ── Winnability — can LCX win this vs competitors? ───────────────── */
export function winnability(s: SignalBundle): ScoreResult {
  const drivers: Driver[] = [];
  let score = 30;

  // LCX's structural edge is EU/MiCA regulation.
  const eu = n(s.euScore);
  if (eu != null) {
    const p = Math.round(lin(eu, 0, 100) * 30);
    drivers.push({ label: 'EU/MiCA fit (LCX edge)', points: p });
    score += p;
  }
  if (s.recommendedMarket === 'eu' || s.recommendedMarket === 'eu_first' || s.recommendedMarket === 'dual') {
    drivers.push({ label: 'EU-first recommendation', points: 12 });
    score += 12;
  }
  // A listing gap (on rivals, not LCX) is winnable; being nowhere is harder to move.
  const rivals = n(s.competitorExchangeCount);
  if (rivals != null && !s.listedOnLcx) {
    if (rivals >= 1 && rivals <= 6) {
      drivers.push({ label: 'Winnable listing gap', points: 14 });
      score += 14;
    } else if (rivals > 6) {
      drivers.push({ label: 'Saturated (harder to differentiate)', points: -6 });
      score -= 6;
    }
  }
  const contacts = n(s.contactCount);
  if (contacts != null && contacts > 0) {
    drivers.push({ label: 'Warm path (known contacts)', points: 10 });
    score += 10;
  }
  if (s.listedOnLcx) {
    drivers.push({ label: 'Already listed', points: -50 });
    score -= 50;
  }
  return { score: Math.round(clamp(score)), drivers: top(drivers), confidence: baseConfidence(s, [eu, rivals, contacts]) };
}

/* ── Conviction — where to spend scarce attention (the ranking key) ── */
export interface AlphaAssessment {
  propensity: ScoreResult;
  timing: ScoreResult & { window: TimingWindow };
  value: ScoreResult & { usd: number };
  winnability: ScoreResult;
  conviction: ScoreResult;
  ach: AchResult;
}

export function assess(s: SignalBundle): AlphaAssessment {
  const propensity = listingPropensity(s);
  const timing = timingWindow(s);
  const value = dealValue(s);
  const win = winnability(s);

  // Conviction = the desk's position size: mostly winnability × propensity ×
  // prize, nudged by timing, then scaled by how much we actually know.
  const valueScore = value.score;
  const blend =
    0.34 * win.score + 0.30 * propensity.score + 0.18 * valueScore + 0.18 * timing.score;
  const conf = Math.round((win.confidence + propensity.confidence + value.confidence + timing.confidence) / 4);
  // Low data confidence discounts conviction so we don't chase ghosts.
  const convScore = Math.round(clamp(blend * (0.55 + 0.45 * (conf / 100))));
  const drivers: Driver[] = [
    { label: 'Winnability', points: Math.round(0.34 * win.score) },
    { label: 'Propensity', points: Math.round(0.30 * propensity.score) },
    { label: 'Timing', points: Math.round(0.18 * timing.score) },
    { label: 'Prize size', points: Math.round(0.18 * valueScore) },
  ];
  const conviction: ScoreResult = { score: convScore, drivers, confidence: conf };

  return { propensity, timing, value, winnability: win, conviction, ach: ach(s) };
}

/* ── ACH — Analysis of Competing Hypotheses ───────────────────────── */
export type Hypothesis = 'list_soon' | 'list_later' | 'no_list';

export const HYPOTHESIS_LABEL: Record<Hypothesis, string> = {
  list_soon: 'Will pursue an LCX listing within a quarter',
  list_later: 'A listing candidate, but not imminent',
  no_list: 'Unlikely to list on LCX',
};

export interface AchResult {
  verdict: Hypothesis;
  confidence: number; // 0–100, the margin of the leading hypothesis
  probabilities: Record<Hypothesis, number>;
  /** Most diagnostic evidence, strongest first. */
  evidence: { label: string; leans: Hypothesis; weight: number }[];
}

interface EvidenceItem {
  label: string;
  present: boolean;
  support: Record<Hypothesis, number>; // −2..+2 consistency per hypothesis
}

export function ach(s: SignalBundle): AchResult {
  const rivals = n(s.competitorExchangeCount) ?? 0;
  const mom = n(s.priceChange30d) ?? 0;
  const commits = n(s.githubCommits30d);
  const eu = n(s.euScore) ?? 0;
  const tvl = n(s.tvlUsd) ?? 0;

  const items: EvidenceItem[] = [
    {
      label: 'Listed on competitor venues but not LCX',
      present: rivals >= 1 && !s.listedOnLcx,
      support: { list_soon: 2, list_later: 1, no_list: -2 },
    },
    {
      label: 'Strong recent momentum',
      present: mom >= 15,
      support: { list_soon: 1, list_later: 0, no_list: -1 },
    },
    {
      label: 'Active development',
      present: commits != null && commits >= 10,
      support: { list_soon: 1, list_later: 1, no_list: -1 },
    },
    {
      label: 'Strong EU/MiCA fit',
      present: eu >= 60,
      support: { list_soon: 1, list_later: 1, no_list: -1 },
    },
    {
      label: 'Real on-chain traction (TVL)',
      present: tvl >= 1e6,
      support: { list_soon: 1, list_later: 1, no_list: -1 },
    },
    {
      label: 'Already listed on LCX',
      present: !!s.listedOnLcx,
      support: { list_soon: -5, list_later: -4, no_list: 5 },
    },
    {
      label: 'No development signal',
      present: commits === 0,
      support: { list_soon: -1, list_later: 0, no_list: 1 },
    },
  ];

  const totals: Record<Hypothesis, number> = { list_soon: 0, list_later: 0, no_list: 0 };
  const active = items.filter((i) => i.present);
  for (const i of active) {
    (Object.keys(totals) as Hypothesis[]).forEach((h) => (totals[h] += i.support[h]));
  }
  // Softmax-ish normalization into probabilities.
  const exps = (Object.keys(totals) as Hypothesis[]).map((h) => [h, Math.exp(totals[h] / 2)] as const);
  const sum = exps.reduce((a, [, e]) => a + e, 0) || 1;
  const probabilities = Object.fromEntries(exps.map(([h, e]) => [h, e / sum])) as Record<Hypothesis, number>;
  const ranked = (Object.keys(probabilities) as Hypothesis[]).sort((a, b) => probabilities[b] - probabilities[a]);
  const verdict = ranked[0];
  const confidence = Math.round((probabilities[ranked[0]] - probabilities[ranked[1]]) * 100);

  const evidence = active
    .map((i) => {
      const leans = (Object.keys(i.support) as Hypothesis[]).sort((a, b) => i.support[b] - i.support[a])[0];
      return { label: i.label, leans, weight: Math.abs(i.support[leans]) };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return { verdict, confidence: clamp(confidence, 0, 100), probabilities, evidence };
}
