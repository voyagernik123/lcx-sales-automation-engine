import { mulberry32, sampleTriangular } from './launchSim.js';
import { rescore, sensitivity, type EngineDim, type EngineRow } from './commandEngines.js';

/**
 * DISTRIBUTION growth engines (LCX ONE Phase 4) — the models that turn the
 * PayAgent distribution ontology into decisions. Pure + deterministic (seeded
 * RNG), so the API can compute over the compiled seed and the tests can pin
 * exact outputs. Nothing here reads the DB or the network.
 *
 *  4.1a referralViralitySim   — the LCX-rebate loop as a K-factor Monte Carlo
 *  4.1b emissionBudget        — reward emission vs fee revenue vs treasury cap
 *  4.1c questCacSim           — quest/campaign CAC Monte Carlo (gate-aware)
 *  4.1d channelMix            — weighted rescore + rank-flip sensitivity
 *  4.1e attributeChannels     — merge UTM / referral / on-chain → funded agents
 *  4.1f presenceScore         — normalize sold/uses/rank + SOV → 0–100
 */

/* ════════ 4.1a REFERRAL VIRALITY (K-factor Monte Carlo) ════════ */

export interface ReferralParams {
  /** New link creators seeded per period (the top of the loop). */
  seedCreators: number;
  /** P(a created link actually gets paid) — triangular ±. */
  paidLinkConversion: number;
  /** Avg paid links a funded creator generates per period. */
  linksPerCreator: number;
  /** P(a paid creator refers another creator) = the viral branch. */
  agentReferralRate: number;
  /** LCX minted to the creator per paid link (reward cost). */
  creatorRewardLcx: number;
  /** Periods to project. */
  periods: number;
}

export interface ReferralSimResult {
  runs: number;
  kFactor: number;                       // expected new creators spawned per creator
  viral: boolean;                        // k >= 1 → self-sustaining
  cumulativeCreators: { p10: number; p50: number; p90: number };
  cumulativePaidLinks: { p10: number; p50: number; p90: number };
  rewardCostLcx: { p10: number; p50: number; p90: number };
}

function pack(arr: number[]): { p10: number; p50: number; p90: number } {
  const a = [...arr].sort((x, y) => x - y);
  const p = (q: number) => Math.round(a[Math.min(a.length - 1, Math.max(0, Math.ceil((q / 100) * a.length) - 1))] ?? 0);
  return { p10: p(10), p50: p(50), p90: p(90) };
}

export function referralViralitySim(params: ReferralParams, opts: { runs?: number; seed?: number } = {}): ReferralSimResult {
  const runs = Math.min(Math.max(Math.round(opts.runs ?? 2000), 100), 20000);
  const rng = mulberry32((opts.seed ?? 42) >>> 0);
  const periods = Math.min(Math.max(Math.round(params.periods), 1), 24);
  // K = links per creator × P(paid) × P(referral): expected downstream creators.
  const kFactor = Math.round(params.linksPerCreator * params.paidLinkConversion * params.agentReferralRate * 1000) / 1000;

  const creatorsOut: number[] = new Array(runs);
  const linksOut: number[] = new Array(runs);
  const costOut: number[] = new Array(runs);
  for (let r = 0; r < runs; r++) {
    let activeCreators = params.seedCreators;
    let totalCreators = params.seedCreators;
    let totalPaidLinks = 0;
    for (let t = 0; t < periods; t++) {
      const conv = sampleTriangular(rng, {
        min: Math.max(0.02, params.paidLinkConversion - 0.1),
        mode: params.paidLinkConversion,
        max: Math.min(0.95, params.paidLinkConversion + 0.1),
      });
      const links = activeCreators * params.linksPerCreator;
      const paid = links * conv;
      totalPaidLinks += paid;
      // Each paid link may spawn a new creator via the referral branch.
      const spawned = paid * sampleTriangular(rng, {
        min: Math.max(0, params.agentReferralRate - 0.05),
        mode: params.agentReferralRate,
        max: Math.min(1, params.agentReferralRate + 0.05),
      });
      activeCreators = spawned;
      totalCreators += spawned;
      if (activeCreators < 0.01) break; // loop died out
    }
    creatorsOut[r] = Math.round(totalCreators);
    linksOut[r] = Math.round(totalPaidLinks);
    costOut[r] = Math.round(totalPaidLinks * params.creatorRewardLcx);
  }
  return {
    runs,
    kFactor,
    viral: kFactor >= 1,
    cumulativeCreators: pack(creatorsOut),
    cumulativePaidLinks: pack(linksOut),
    rewardCostLcx: pack(costOut),
  };
}

/* ════════ 4.1b EMISSION BUDGET ════════ */

export interface EmissionInput {
  projectedPaidLinks: number;
  creatorRewardLcx: number;      // minted per paid link
  serviceFeeLcx: number;         // accrues to PayAgent per paid link
  treasuryBudgetLcx: number;     // the cap for this period
}

export interface EmissionResult {
  emittedLcx: number;            // total minted to creators
  feeRevenueLcx: number;         // accrued to the service
  netTreasuryLcx: number;        // fee - emission (can be negative)
  budgetUtilizationPct: number;  // emitted / budget
  withinBudget: boolean;
  status: 'healthy' | 'watch' | 'breach';
}

/** The economics behind "token-incentivized, done well" — Phase-6 gates on it. */
export function emissionBudget(inp: EmissionInput): EmissionResult {
  const emitted = Math.round(inp.projectedPaidLinks * inp.creatorRewardLcx);
  const feeRevenue = Math.round(inp.projectedPaidLinks * inp.serviceFeeLcx);
  const util = inp.treasuryBudgetLcx > 0 ? Math.round((emitted / inp.treasuryBudgetLcx) * 1000) / 10 : Infinity;
  const status: EmissionResult['status'] = util > 100 ? 'breach' : util > 80 ? 'watch' : 'healthy';
  return {
    emittedLcx: emitted,
    feeRevenueLcx: feeRevenue,
    netTreasuryLcx: feeRevenue - emitted,
    budgetUtilizationPct: util === Infinity ? 100 : util,
    withinBudget: emitted <= inp.treasuryBudgetLcx,
    status,
  };
}

/* ════════ 4.1c QUEST CAC (Monte Carlo, compliance-gate-aware) ════════ */

export interface QuestChannelInput {
  channelId: string;
  label: string;
  budgetUsd: number;
  cacUsd: number;                // planned cost per funded agent
  /** Compliance gate: a locked channel contributes nothing until cleared. */
  locked?: boolean;
}

export interface QuestCacResult {
  runs: number;
  fundedAgents: { p10: number; p50: number; p90: number };
  totalBudgetUsd: number;
  blendedCacP50: number | null;
  lockedChannels: string[];
  marginal: Array<{ channelId: string; label: string; fundedPerExtra1kUsd: number }>;
}

export function questCacSim(channels: QuestChannelInput[], opts: { runs?: number; seed?: number } = {}): QuestCacResult {
  const runs = Math.min(Math.max(Math.round(opts.runs ?? 2000), 100), 20000);
  const rng = mulberry32((opts.seed ?? 42) >>> 0);
  const active = channels.filter((c) => !c.locked);
  const locked = channels.filter((c) => c.locked).map((c) => c.label);
  const funded: number[] = new Array(runs);
  for (let r = 0; r < runs; r++) {
    let f = 0;
    for (const c of active) {
      if (c.cacUsd > 0 && c.budgetUsd > 0) {
        const cac = sampleTriangular(rng, { min: c.cacUsd * 0.7, mode: c.cacUsd, max: c.cacUsd * 1.3 });
        f += c.budgetUsd / Math.max(cac, 1);
      }
    }
    funded[r] = f;
  }
  const fd = pack(funded);
  const totalBudget = active.reduce((s, c) => s + (c.budgetUsd || 0), 0);
  return {
    runs,
    fundedAgents: fd,
    totalBudgetUsd: totalBudget,
    blendedCacP50: fd.p50 > 0 && totalBudget > 0 ? Math.round(totalBudget / fd.p50) : null,
    lockedChannels: locked,
    marginal: active
      .filter((c) => c.cacUsd > 0)
      .map((c) => ({ channelId: c.channelId, label: c.label, fundedPerExtra1kUsd: Math.round((1000 / c.cacUsd) * 10) / 10 }))
      .sort((a, b) => b.fundedPerExtra1kUsd - a.fundedPerExtra1kUsd),
  };
}

/* ════════ 4.1d CHANNEL-MIX OPTIMIZER (rescore + sensitivity) ════════ */

export interface ChannelMixResult {
  dimensions: EngineDim[];
  rows: Array<EngineRow & { weighted: number; rank: number }>;
  sensitivity: ReturnType<typeof sensitivity>;
}

/** The LP-optimizer pattern aimed at channels: reach × agent-density × cost ×
 *  compliance-risk × effort, live-reweightable, with rank-flip sensitivity. */
export function channelMix(dims: EngineDim[], rows: EngineRow[], weightOverrides?: Record<string, number>): ChannelMixResult {
  const scored = rescore(dims, rows, weightOverrides);
  const effectiveDims = weightOverrides
    ? dims.map((d) => (weightOverrides[d.key] != null ? { ...d, weight: weightOverrides[d.key]! } : d))
    : dims;
  return {
    dimensions: effectiveDims,
    rows: scored.map((r) => ({ ...r, weighted: r.weighted, rank: r.rank })),
    sensitivity: sensitivity(effectiveDims, rows),
  };
}

/* ════════ 4.1e ATTRIBUTION ════════ */

export interface AttributionEvent {
  channelId: string;
  /** How the funded agent was attributed to the channel. */
  kind: 'utm' | 'referral_code' | 'onchain';
  fundedAgents: number;
}

export interface AttributionResult {
  byChannel: Array<{ channelId: string; fundedAgents: number; byKind: Record<string, number>; sharePct: number }>;
  totalFunded: number;
}

/** Merge UTM + referral-code + on-chain-event signals into per-channel
 *  funded-agent attribution. On-chain wins ties (hardest evidence) — but here
 *  we simply sum distinct signals, since a funded agent is counted once per
 *  event row the caller supplies (dedup is the caller's job upstream). */
export function attributeChannels(events: AttributionEvent[]): AttributionResult {
  const map = new Map<string, { total: number; byKind: Record<string, number> }>();
  for (const e of events) {
    const cur = map.get(e.channelId) ?? { total: 0, byKind: {} };
    cur.total += e.fundedAgents;
    cur.byKind[e.kind] = (cur.byKind[e.kind] ?? 0) + e.fundedAgents;
    map.set(e.channelId, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + v.total, 0);
  const byChannel = [...map.entries()]
    .map(([channelId, v]) => ({
      channelId,
      fundedAgents: v.total,
      byKind: v.byKind,
      sharePct: total > 0 ? Math.round((v.total / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.fundedAgents - a.fundedAgents);
  return { byChannel, totalFunded: total };
}

/* ════════ 4.1f PRESENCE SCORE (marketplace-rank + SOV) ════════ */

export interface PresenceInput {
  surfaceId: string;
  label: string;
  /** live | ranked contributes; not_started | submitted score low. */
  status: 'not_started' | 'submitted' | 'live' | 'ranked';
  /** Normalized 0–1 usage signal (sold/uses vs a cap the caller sets). */
  usage?: number;
  /** Normalized 0–1 rank signal (1 = top placement). */
  rank?: number;
}

export interface PresenceResult {
  surfaces: Array<{ surfaceId: string; label: string; score: number }>;
  /** 0–100 composite: how present PayAgent is across the machine economy. */
  presenceScore: number;
}

const STATUS_WEIGHT: Record<PresenceInput['status'], number> = {
  not_started: 0, submitted: 0.25, live: 0.6, ranked: 0.8,
};

export function presenceScore(surfaces: PresenceInput[]): PresenceResult {
  if (surfaces.length === 0) return { surfaces: [], presenceScore: 0 };
  const scored = surfaces.map((s) => {
    const base = STATUS_WEIGHT[s.status];
    // usage + rank lift a live listing the rest of the way to 1.0.
    const lift = ((s.usage ?? 0) * 0.12) + ((s.rank ?? 0) * 0.08);
    const score = Math.round(Math.min(1, base + (base > 0 ? lift : 0)) * 100);
    return { surfaceId: s.surfaceId, label: s.label, score };
  });
  const presence = Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length);
  return { surfaces: scored.sort((a, b) => b.score - a.score), presenceScore: presence };
}
