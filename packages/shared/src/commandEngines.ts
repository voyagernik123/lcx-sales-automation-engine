/**
 * LCX COMMAND decision engines (100X Phase 2) — the strategy's models made
 * executable. Pure, deterministic, seedable; nothing here mutates stored truth
 * (what-ifs are overlays). Consumed by /v1/command/engines/* and the Phase-3
 * instruments.
 *
 *   lp*        — weighted scorecard re-scoring, rank-flip sensitivity, set analysis
 *   rfi*       — returned commercial terms → blended cost (bps) at a volume mix
 *   waitlist*  — funnel Monte Carlo (P10/50/90) + marginal-$ ranking
 *   readiness* — listing readiness (path-aware), token DD (legal HARD GATE),
 *                and the composite program-readiness dial
 */
import { mulberry32, sampleTriangular } from './launchSim.js';

/* ── Shared shapes (mirror the compiled deep seed) ── */
export interface EngineDim { key: string; label: string; weight: number }
export interface EngineRow { subjectId: string; subjectLabel: string; scores: Record<string, number>; tier?: string | null }

/* ════════ 2.1 LP OPTIMIZER ════════ */

export interface RescoredRow extends EngineRow {
  weighted: number;
  rank: number;
}

/** Re-score with (possibly edited) weights. Weights are normalized to sum 1. */
export function rescore(dims: EngineDim[], rows: EngineRow[], weightOverrides?: Record<string, number>): RescoredRow[] {
  const w: Record<string, number> = {};
  let sum = 0;
  for (const d of dims) {
    const v = Math.max(0, weightOverrides?.[d.key] ?? d.weight);
    w[d.key] = v;
    sum += v;
  }
  if (sum <= 0) throw new Error('weights sum to zero');
  const out = rows.map((r) => {
    let acc = 0;
    for (const d of dims) acc += (r.scores[d.key] ?? 0) * (w[d.key] / sum);
    return { ...r, weighted: Math.round(acc * 100) / 100, rank: 0 };
  });
  out.sort((a, b) => b.weighted - a.weighted || a.subjectLabel.localeCompare(b.subjectLabel));
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

export interface SensitivityEntry {
  dimKey: string;
  dimLabel: string;
  currentWeight: number;
  /** Weight at which rank #1 and #2 would tie (holding other weights proportional); null = no flip in [0, 0.6]. */
  flipWeight: number | null;
  /** weighted-score gap change per +0.01 weight on this dim (positive widens #1's lead). */
  gapPerHundredth: number;
}

/**
 * Rank-flip sensitivity: for each dimension, scan its weight over [0, 0.6]
 * (renormalizing the rest proportionally) and find where the current #1 and #2
 * would tie. Deterministic scan at 0.005 resolution.
 */
export function sensitivity(dims: EngineDim[], rows: EngineRow[]): SensitivityEntry[] {
  const base = rescore(dims, rows);
  if (base.length < 2) return [];
  const [top, second] = base;
  return dims.map((d) => {
    const gapAt = (wk: number): number => {
      const overrides: Record<string, number> = {};
      // Keep other dims at original weights; set this dim to wk (rescore normalizes).
      for (const dd of dims) overrides[dd.key] = dd.key === d.key ? wk : dd.weight;
      const rs = rescore(dims, rows, overrides);
      const t = rs.find((r) => r.subjectId === top.subjectId)!;
      const s = rs.find((r) => r.subjectId === second.subjectId)!;
      return t.weighted - s.weighted;
    };
    const g0 = gapAt(d.weight);
    const g1 = gapAt(d.weight + 0.01);
    let flip: number | null = null;
    let prev = gapAt(0);
    for (let wk = 0.005; wk <= 0.6001; wk += 0.005) {
      const g = gapAt(wk);
      if ((prev > 0 && g <= 0) || (prev < 0 && g >= 0)) { flip = Math.round(wk * 1000) / 1000; break; }
      prev = g;
    }
    return {
      dimKey: d.key,
      dimLabel: d.label,
      currentWeight: d.weight,
      flipWeight: flip,
      gapPerHundredth: Math.round((g1 - g0) * 1000) / 1000,
    };
  });
}

export interface SetAnalysis {
  strengths: Array<{ dimKey: string; dimLabel: string; best: number; coveredBy: string }>;
  gaps: Array<{ dimKey: string; dimLabel: string; best: number }>;
  /** Herfindahl over the set's weighted shares — 1/n = perfectly balanced. */
  concentration: number;
}

/** Analyze a chosen LP set: per-dimension coverage (best score) and balance. */
export function analyzeSet(dims: EngineDim[], rows: EngineRow[], selectedIds: string[]): SetAnalysis {
  const chosen = rows.filter((r) => selectedIds.includes(r.subjectId));
  if (chosen.length === 0) return { strengths: [], gaps: [], concentration: 0 };
  const strengths: SetAnalysis['strengths'] = [];
  const gaps: SetAnalysis['gaps'] = [];
  for (const d of dims) {
    let best = -1; let by = '';
    for (const r of chosen) {
      const v = r.scores[d.key] ?? 0;
      if (v > best) { best = v; by = r.subjectLabel; }
    }
    if (best >= 4) strengths.push({ dimKey: d.key, dimLabel: d.label, best, coveredBy: by });
    else gaps.push({ dimKey: d.key, dimLabel: d.label, best });
  }
  const weights = rescore(dims, chosen).map((r) => r.weighted);
  const tot = weights.reduce((s, v) => s + v, 0) || 1;
  const concentration = Math.round(weights.reduce((s, v) => s + (v / tot) ** 2, 0) * 1000) / 1000;
  return { strengths, gaps, concentration };
}

/* ════════ 2.2 RFI ECONOMICS ════════ */

export interface RfiTerms {
  partnerId: string;
  label: string;
  /** Spread strings as returned, e.g. "2–4", "5-12", "20–60" (bps). */
  btcEthSpreadBps?: string | number | null;
  majorsSpreadBps?: string | number | null;
  altSpreadBps?: string | number | null;
  /** Free-text quality facts. */
  credit?: string | null;
  settlementCycle?: string | null;
  oes?: string | null;
  feeModel?: string | null;
}
export interface VolumeMix { btcEthPct: number; majorsPct: number; altsPct: number; monthlyVolumeUsd: number }
export interface RfiEconomics {
  partnerId: string;
  label: string;
  blendedBps: number | null;
  monthlyCostUsd: number | null;
  qualityScore: number; // 0–5
  missing: string[];
}

/** "2–4" | "5-12" | 7 → midpoint bps; null when unparseable. */
export function parseSpreadBps(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const single = String(v).match(/(\d+(?:\.\d+)?)/);
  return single ? Number(single[1]) : null;
}

export function rfiEconomics(terms: RfiTerms, mix: VolumeMix): RfiEconomics {
  const shares = [mix.btcEthPct, mix.majorsPct, mix.altsPct].map((p) => Math.max(0, p));
  const shareSum = shares.reduce((s, v) => s + v, 0);
  const missing: string[] = [];
  const spreads = [
    parseSpreadBps(terms.btcEthSpreadBps),
    parseSpreadBps(terms.majorsSpreadBps),
    parseSpreadBps(terms.altSpreadBps),
  ];
  (['BTC/ETH spread', 'majors spread', 'alt spread'] as const).forEach((lbl, i) => {
    if (spreads[i] == null && shares[i] > 0) missing.push(lbl);
  });
  let blended: number | null = null;
  if (shareSum > 0 && spreads.every((s, i) => s != null || shares[i] === 0)) {
    blended = 0;
    for (let i = 0; i < 3; i++) blended += (spreads[i] ?? 0) * (shares[i] / shareSum);
    blended = Math.round(blended * 100) / 100;
  }
  let quality = 0;
  const credit = (terms.credit ?? '').toLowerCase();
  if (credit.includes('credit')) quality += 2; else if (credit.includes('pre-fund') || credit.includes('prefund')) quality += 1;
  const settle = (terms.settlementCycle ?? '').toLowerCase();
  if (settle.includes('24/7')) quality += 1.5; else if (settle.includes('t+1')) quality += 1;
  if ((terms.oes ?? '').trim()) quality += 1.5;
  quality = Math.min(5, Math.round(quality * 10) / 10);
  return {
    partnerId: terms.partnerId,
    label: terms.label,
    blendedBps: blended,
    monthlyCostUsd: blended != null ? Math.round(mix.monthlyVolumeUsd * (blended / 10_000)) : null,
    qualityScore: quality,
    missing,
  };
}

/* ════════ 2.3 WAITLIST FUNNEL MONTE CARLO ════════ */

export interface FunnelChannelInput {
  channelId: string;
  label: string;
  type: string; // Paid | Organic
  budget: number;
  cac: number | null;         // paid channels
  organicSignups?: number | null; // organic channels
  locked?: boolean;           // e.g. mainstream paid gated pre-certification
}
export interface FunnelParams { waitlistToVerified: number; verifiedToFunded: number }
export interface WaitlistSimResult {
  runs: number;
  waitlist: { p10: number; p50: number; p90: number };
  verified: { p10: number; p50: number; p90: number };
  funded: { p10: number; p50: number; p90: number };
  totalPaidBudget: number;
  blendedCacPerFundedP50: number | null;
  /** Funded accounts added per extra $1k, per unlocked paid channel (at current CAC). */
  marginal: Array<{ channelId: string; label: string; fundedPerExtra1k: number }>;
  lockedChannels: string[];
}

export function waitlistSim(
  channels: FunnelChannelInput[],
  params: FunnelParams,
  opts: { runs?: number; seed?: number } = {},
): WaitlistSimResult {
  const runs = Math.min(Math.max(Math.round(opts.runs ?? 2000), 100), 20000);
  const rng = mulberry32((opts.seed ?? 42) >>> 0);
  const active = channels.filter((c) => !c.locked);
  const lockedChannels = channels.filter((c) => c.locked).map((c) => c.label);
  const wl: number[] = new Array(runs);
  const vf: number[] = new Array(runs);
  const fd: number[] = new Array(runs);
  for (let r = 0; r < runs; r++) {
    let signups = 0;
    for (const c of active) {
      if (c.type === 'Paid' && c.cac && c.cac > 0 && c.budget > 0) {
        // CAC uncertainty: ±30% triangular around the planned figure.
        const cac = sampleTriangular(rng, { min: c.cac * 0.7, mode: c.cac, max: c.cac * 1.3 });
        signups += c.budget / Math.max(cac, 1);
      } else if (c.organicSignups) {
        signups += sampleTriangular(rng, { min: c.organicSignups * 0.6, mode: c.organicSignups, max: c.organicSignups * 1.2 });
      }
    }
    const v = signups * sampleTriangular(rng, { min: Math.max(0.1, params.waitlistToVerified - 0.1), mode: params.waitlistToVerified, max: Math.min(0.95, params.waitlistToVerified + 0.1) });
    const f = v * sampleTriangular(rng, { min: Math.max(0.1, params.verifiedToFunded - 0.1), mode: params.verifiedToFunded, max: Math.min(0.95, params.verifiedToFunded + 0.1) });
    wl[r] = signups; vf[r] = v; fd[r] = f;
  }
  const pack = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    const p = (q: number) => Math.round(arr[Math.min(arr.length - 1, Math.max(0, Math.ceil((q / 100) * arr.length) - 1))] ?? 0);
    return { p10: p(10), p50: p(50), p90: p(90) };
  };
  const totalPaidBudget = active.filter((c) => c.type === 'Paid').reduce((s, c) => s + (c.budget || 0), 0);
  const funded = pack(fd);
  const marginal = active
    .filter((c) => c.type === 'Paid' && c.cac && c.cac > 0)
    .map((c) => ({
      channelId: c.channelId,
      label: c.label,
      fundedPerExtra1k: Math.round((1000 / (c.cac as number)) * params.waitlistToVerified * params.verifiedToFunded * 10) / 10,
    }))
    .sort((a, b) => b.fundedPerExtra1k - a.fundedPerExtra1k);
  return {
    runs,
    waitlist: pack(wl),
    verified: pack(vf),
    funded,
    totalPaidBudget,
    blendedCacPerFundedP50: funded.p50 > 0 && totalPaidBudget > 0 ? Math.round(totalPaidBudget / funded.p50) : null,
    marginal,
    lockedChannels,
  };
}

/* ════════ 2.4 READINESS ENGINES ════════ */

export interface BlockerState { num: number; severity: string | null; category: string | null; status: string }
export interface RequirementState { num: number; path: string | null; status: string | null }

const SEV_WEIGHT: Record<string, number> = { Critical: 3, High: 2, Medium: 1, Low: 0.5 };
const REQ_DONE = /^(done|complete|completed|adopted|live|selected|signed)/i;
const REQ_PARTIAL = /(progress|design|draft|adopt|stand up|select|confirm|plan|decide|depends)/i;

/** Listing readiness: path-aware ('A' | 'B'), 0–100 with per-category breakdown. */
export function listingReadiness(blockers: BlockerState[], requirements: RequirementState[], path: 'A' | 'B' = 'A'): {
  score: number;
  blockerScore: number;
  requirementScore: number;
  byCategory: Array<{ category: string; total: number; open: number }>;
} {
  let sevTotal = 0, sevResolved = 0;
  const cat = new Map<string, { total: number; open: number }>();
  for (const b of blockers) {
    const w = SEV_WEIGHT[b.severity ?? ''] ?? 1;
    sevTotal += w;
    const resolved = b.status === 'resolved';
    const half = b.status === 'mitigating';
    sevResolved += resolved ? w : half ? w / 2 : 0;
    const c = b.category ?? 'Other';
    const e = cat.get(c) ?? { total: 0, open: 0 };
    e.total++;
    if (!resolved) e.open++;
    cat.set(c, e);
  }
  const relevant = requirements.filter((r) => !r.path || r.path === 'Both' || r.path === path);
  let reqTotal = 0, reqDone = 0;
  for (const r of relevant) {
    reqTotal += 1;
    const s = r.status ?? '';
    reqDone += REQ_DONE.test(s) ? 1 : REQ_PARTIAL.test(s) ? 0.35 : 0;
  }
  const blockerScore = sevTotal > 0 ? sevResolved / sevTotal : 0;
  const requirementScore = reqTotal > 0 ? reqDone / reqTotal : 0;
  return {
    score: Math.round((blockerScore * 0.55 + requirementScore * 0.45) * 100),
    blockerScore: Math.round(blockerScore * 100),
    requirementScore: Math.round(requirementScore * 100),
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.open - a.open),
  };
}

export interface DdDim { dimension: string; weightPct: number; gate: boolean }

/** Token DD: weighted 0–100; the legal GATE hard-fails regardless of score. */
export function tokenDdScore(dims: DdDim[], scores: Record<string, number>, gatePassed: boolean): {
  gated: boolean; score: number | null; breakdown: Array<{ dimension: string; contribution: number }>;
} {
  const gateDims = dims.filter((d) => d.gate);
  if (gateDims.length > 0 && !gatePassed) return { gated: true, score: null, breakdown: [] };
  let total = 0;
  const breakdown = dims.map((d) => {
    const s = Math.min(5, Math.max(0, scores[d.dimension] ?? 0));
    const contribution = Math.round((s / 5) * d.weightPct * 10) / 10;
    total += contribution;
    return { dimension: d.dimension, contribution };
  });
  return { gated: false, score: Math.round(total), breakdown };
}

export interface ProgramReadinessInput {
  gatingDone: number; gatingTotal: number;
  blockers: BlockerState[];
  requirements: RequirementState[];
  /** Count of target LPs signed/onboarding out of the 3-LP launch set. */
  lpsCommitted: number; lpTarget: number;
  /** Waitlist foundation tasks done fraction (0–1). */
  growthFoundation: number;
  path?: 'A' | 'B';
}

/** The deck's headline dial: composite 0–100 with sub-dials. */
export function programReadiness(inp: ProgramReadinessInput): {
  score: number;
  dials: Array<{ key: string; label: string; score: number; weight: number }>;
} {
  const lr = listingReadiness(inp.blockers, inp.requirements, inp.path ?? 'A');
  const dials = [
    { key: 'gating', label: 'Gating chain', score: inp.gatingTotal > 0 ? Math.round((inp.gatingDone / inp.gatingTotal) * 100) : 0, weight: 0.35 },
    { key: 'blockers', label: 'Blockers resolved', score: lr.blockerScore, weight: 0.25 },
    { key: 'requirements', label: 'Listing requirements', score: lr.requirementScore, weight: 0.15 },
    { key: 'liquidity', label: 'LP commitment', score: inp.lpTarget > 0 ? Math.round(Math.min(1, inp.lpsCommitted / inp.lpTarget) * 100) : 0, weight: 0.15 },
    { key: 'growth', label: 'Growth foundation', score: Math.round(Math.min(1, Math.max(0, inp.growthFoundation)) * 100), weight: 0.1 },
  ];
  const score = Math.round(dials.reduce((s, d) => s + d.score * d.weight, 0));
  return { score, dials };
}
