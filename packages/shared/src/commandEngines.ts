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

/**
 * Why a row could not be ranked. Stable codes — they go on the wire and into refusal copy.
 *
 *   ENGINE_ROW_NO_DIMENSIONS_SCORED
 *     The row carries no usable score on ANY dimension. There is nothing to average, so
 *     there is no score. It is not last; it is unmeasured.
 *
 *   ENGINE_ROW_SCORED_DIMENSIONS_CARRY_NO_WEIGHT
 *     The row WAS scored, but every dimension it was scored on has weight 0 under this
 *     weighting. The renormalizing denominator is zero. This weighting is silent about
 *     this row — which is a different fact from "unscored", and gets a different code.
 */
export type RescoreRefusalCode =
  | 'ENGINE_ROW_NO_DIMENSIONS_SCORED'
  | 'ENGINE_ROW_SCORED_DIMENSIONS_CARRY_NO_WEIGHT';

/**
 * THE THREE STATES OF A CELL, kept apart.
 *
 * `EngineRow.scores` is typed `Record<string, number>`, but it is built from JSON that
 * crosses the wire and from a database, so at runtime a cell arrives in one of four
 * conditions and the old code collapsed three of them into the fourth:
 *
 *   key absent         → NOT SCORED.   Nobody assessed this dimension.        `absentDims`
 *   key present, null  → WITHHELD.     Somebody recorded that there is no value. `withheldDims`
 *   key present, junk  → MALFORMED.    NaN/Infinity/a string. Not a measurement. `malformedDims`
 *   key present, finite→ SCORED, and that includes a genuine 0.
 *
 * The last line is the half people forget. `?? 0` was wrong in both directions: it turned
 * absence into a zero measurement, and it made a real zero indistinguishable from absence.
 * Note also that `??` never caught NaN at all — a NaN cell propagated into `weighted`,
 * survived `Math.round`, and then poisoned the sort comparator, whose result for NaN is
 * implementation-defined ordering. That path is closed here too.
 */
export interface RowScoreCoverage {
  /** Dimensions with a usable finite score. A genuine 0 counts as scored. */
  scoredDims: number;
  /** How many dimensions were on offer. */
  totalDims: number;
  /** Keys with no entry in `scores` at all. */
  absentDims: string[];
  /** Keys explicitly present as `null` — recorded as having no value. */
  withheldDims: string[];
  /** Keys present but not a finite number. Not absence; bad data. */
  malformedDims: string[];
  /**
   * True when `scoredDims < totalDims`. A partial row's `weighted` is renormalized over
   * the dimensions it HAS, so it is not on the same footing as a fully-scored row and
   * must never be printed without its coverage beside it.
   */
  partial: boolean;
}

export interface RescoredRow extends EngineRow, RowScoreCoverage {
  /**
   * Always a real number — the mean of the dimensions actually scored, weighted and
   * renormalized over just those. Never a stand-in for absence: a row with nothing to
   * average is not here at all, it is in `unrankable`.
   */
  weighted: number;
  rank: number;
}

export interface UnrankableRow extends EngineRow, RowScoreCoverage {
  code: RescoreRefusalCode;
  reason: string;
  field: string;
  observed: string;
  permitted: string;
}

export interface RescoreResult {
  ranked: RescoredRow[];
  /**
   * Rows that carry no score under this weighting. NOT ranked, NOT zero, NOT sorted to
   * the bottom. A surface that shows `ranked` and drops this on the floor is telling the
   * reader that these subjects do not exist.
   */
  unrankable: UnrankableRow[];
}

/**
 * Re-score with (possibly edited) weights, over the dimensions each row ACTUALLY HAS.
 *
 * WHAT WAS WRONG. The line was:
 *
 *     acc += (r.scores[d.key] ?? 0) * (w[d.key] / sum)
 *
 * A subject that simply omitted a dimension was scored a genuine ZERO on it and then
 * RANKED against subjects that had been scored on every dimension. That is not a
 * conservative assumption, it is a fabricated measurement: the engine invented the worst
 * possible value for a question nobody answered and then published the consequence as a
 * rank. Recorded as owed in `docs/SECURITY_FINDINGS_2026-08-07.md`.
 *
 * WHAT IT DOES NOW. Each row is scored over the dimensions it has, with the weights
 * renormalized across exactly those — so a row scored on 6 of 10 dimensions is compared on
 * the 6 it was judged on, not punished on the 4 nobody assessed. What it was judged on
 * travels WITH it (`scoredDims`, `absentDims`, `withheldDims`, `malformedDims`), because
 * renormalizing without disclosing just moves the lie: a row scored 5/5 on one dimension
 * out of ten will now rank ABOVE a fully-scored 4.8, and that is only honest if the reader
 * can see it was judged on one tenth of the evidence. **`weighted` is not comparable
 * across rows with different `scoredDims`, and any surface that prints the rank owes the
 * reader the coverage next to it.**
 *
 * WHAT DID NOT CHANGE, AND WHAT IT COST TO MAKE THAT TRUE. A row scored on every
 * dimension is bit-identical to before — but NOT because "the denominator is the full
 * weight sum", which is the plausible argument this comment used to make and which is
 * FALSE IN DOUBLES. `sum(vᵢ·wᵢ)/S` and `sum(vᵢ·wᵢ/S)` agree in real arithmetic and
 * disagree in the last bits; swept over the same 0…0.6 weight grid `sensitivity` uses,
 * 55 of 3,630 points on the four shipped scorecards landed on opposite sides of a 2-dp
 * rounding boundary, moving four of `arch`'s eight published rank-flip thresholds by a
 * whole scan step. So the fully-scored row now takes `accExact` — the pre-change
 * expression, same terms, same order — and only a PARTIAL row is renormalized.
 * Measured against the real data rather than assumed: all four shipped scorecards
 * (`lp` 10×9, `channel` 6×12, `arch` 8×4, `twoPath` 6×3) have every row scored on every
 * dimension, so **nothing on any screen moves today**. The reachable case is the request
 * body: `POST /v1/distribution/engines/channel-mix` validates that `scores` is an object
 * with finite values but never that the dimension keys are present, so a caller can post
 * `scores: {}` and — before this change — get back a confident rank built on ten invented
 * zeroes.
 */
export function rescore(dims: EngineDim[], rows: EngineRow[], weightOverrides?: Record<string, number>): RescoredRow[] {
  return rescoreDetailed(dims, rows, weightOverrides).ranked;
}

/**
 * `rescore` plus the rows it could not rank.
 *
 * `rescore` keeps its exact old signature — `RescoredRow[]`, `weighted: number`, never
 * null — because four surfaces outside this package read `.weighted` and two of them call
 * `.toFixed(2)` on it (`GrowthEngines.tsx:78`, `CockpitPanels.tsx:145,147`,
 * `DeepOntologyPanel.tsx:123`, `ai/commandOperator.ts:138-140`), and widening the type to
 * `number | null` would break them at compile time in lanes that cannot be edited here.
 * So the unrankable rows leave through a second door instead of being smuggled through the
 * first one as zeroes. Callers that must show every subject — which is all of them — should
 * move to this function; until they do, an unrankable row is ABSENT from their list rather
 * than present and wrong, which is the lesser of the two failures but is still a failure.
 */
export function rescoreDetailed(dims: EngineDim[], rows: EngineRow[], weightOverrides?: Record<string, number>): RescoreResult {
  const w: Record<string, number> = {};
  let sum = 0;
  for (const d of dims) {
    const v = Math.max(0, weightOverrides?.[d.key] ?? d.weight);
    w[d.key] = v;
    sum += v;
  }
  // Unchanged precondition: with no weight anywhere there is no scorecard at all. Distinct
  // from the per-row no-weight case below, which is about one row under a live weighting.
  if (sum <= 0) throw new Error('weights sum to zero');

  const ranked: RescoredRow[] = [];
  const unrankable: UnrankableRow[] = [];

  for (const r of rows) {
    const scores = (r.scores ?? {}) as Record<string, unknown>;
    const absentDims: string[] = [];
    const withheldDims: string[] = [];
    const malformedDims: string[] = [];
    let acc = 0;
    let accExact = 0;
    let denom = 0;
    let scoredDims = 0;

    for (const d of dims) {
      if (!Object.prototype.hasOwnProperty.call(scores, d.key)) { absentDims.push(d.key); continue; }
      const v = scores[d.key];
      if (v === null || v === undefined) { withheldDims.push(d.key); continue; }
      if (typeof v !== 'number' || !Number.isFinite(v)) { malformedDims.push(d.key); continue; }
      scoredDims++;
      acc += v * w[d.key]!;
      denom += w[d.key]!;
      // THE ORIGINAL EXPRESSION, term for term, kept for the fully-scored case.
      // MEASURED, not assumed: `sum(v·w)/S` and `sum(v·w/S)` are the same number in
      // real arithmetic and NOT the same double. Sweeping the four shipped scorecards
      // over the same weight grid `sensitivity` uses (3,630 points) put 55 of them on
      // opposite sides of a 2-dp rounding boundary — all on rows scored on every
      // dimension. Four of `arch`'s eight published rank-flip thresholds moved a whole
      // scan step: licensing_regulatory_cover 0.46→0.465, custody_stays_at_lcx_fit
      // 0.40→0.405, economics_margin_control 0.43→0.435, control_flexibility
      // 0.38→0.385. Nothing about the absent-is-not-zero fix requires that, so the
      // fully-scored path keeps the exact terms it always had.
      accExact += v * (w[d.key]! / sum);
    }

    const coverage: RowScoreCoverage = {
      scoredDims,
      totalDims: dims.length,
      absentDims,
      withheldDims,
      malformedDims,
      partial: scoredDims < dims.length,
    };

    if (scoredDims === 0) {
      unrankable.push({
        ...r, ...coverage,
        code: 'ENGINE_ROW_NO_DIMENSIONS_SCORED',
        reason: `"${r.subjectLabel}" carries no usable score on any of the ${dims.length} dimension(s), so it has no weighted score. It is unmeasured, not last.`,
        field: 'rows[].scores',
        observed: `0 of ${dims.length} scored (absent: ${absentDims.length}, withheld: ${withheldDims.length}, malformed: ${malformedDims.length})`,
        permitted: 'at least 1 dimension with a finite score',
      });
      continue;
    }
    if (denom <= 0) {
      unrankable.push({
        ...r, ...coverage,
        code: 'ENGINE_ROW_SCORED_DIMENSIONS_CARRY_NO_WEIGHT',
        reason: `"${r.subjectLabel}" is scored only on dimension(s) carrying weight 0 under this weighting, so this weighting says nothing about it. Scoring it would require dividing by a zero denominator.`,
        field: 'dims[].weight',
        observed: `total weight 0 across the ${scoredDims} scored dimension(s)`,
        permitted: '> 0',
      });
      continue;
    }

    // Renormalize over what was actually scored. A fully-scored row does not take that
    // path at all: it takes `accExact`, which is the pre-change expression term for term,
    // so it is bit-identical — asserted rather than asserted-about by
    // `a fully-scored row is bit-identical to the pre-change expression` in the test file,
    // which sweeps the same weight grid `sensitivity` does.
    const weighted = scoredDims === dims.length ? accExact : acc / denom;
    ranked.push({ ...r, ...coverage, weighted: Math.round(weighted * 100) / 100, rank: 0 });
  }

  ranked.sort((a, b) => b.weighted - a.weighted || a.subjectLabel.localeCompare(b.subjectLabel));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return { ranked, unrankable };
}

export interface SensitivityEntry {
  dimKey: string;
  dimLabel: string;
  currentWeight: number;
  /** Weight at which rank #1 and #2 would tie (holding other weights proportional); null = no flip in [0, 0.6]. */
  flipWeight: number | null;
  /**
   * weighted-score gap change per +0.01 weight on this dim (positive widens #1's lead).
   * `null` when the gap is not evaluable at this weighting — see `gapAt` below. Null is
   * "could not be measured", NOT "no change"; 0 means the gap genuinely does not move.
   */
  gapPerHundredth: number | null;
}

/**
 * Rank-flip sensitivity: for each dimension, scan its weight over [0, 0.6]
 * (renormalizing the rest proportionally) and find where the current #1 and #2
 * would tie. Deterministic scan at 0.005 resolution.
 *
 * `base.length < 2` now means fewer than two RANKABLE rows — an unrankable row is no
 * longer counted as a comparable subject sitting at zero, which is what it was before.
 */
export function sensitivity(dims: EngineDim[], rows: EngineRow[]): SensitivityEntry[] {
  const base = rescore(dims, rows);
  if (base.length < 2) return [];
  const [top, second] = base;
  return dims.map((d) => {
    /**
     * Returns null when either subject has no rankable score AT THIS WEIGHTING.
     *
     * This is a crash that renormalizing introduced, closed here rather than discovered
     * later. The scan drives one dimension's weight to 0. A row scored ONLY on that
     * dimension then has a zero renormalizing denominator, so it is unrankable at that
     * point and drops out of `rs` — and the old code's `rs.find(...)!` asserted non-null
     * on a value that is now genuinely undefined, which is a TypeError on `.weighted`,
     * not a wrong number. Unreachable with today's four scorecards (every row is scored
     * on every dimension) and reachable from the channel-mix request body.
     */
    const gapAt = (wk: number): number | null => {
      const overrides: Record<string, number> = {};
      // Keep other dims at original weights; set this dim to wk (rescore normalizes).
      for (const dd of dims) overrides[dd.key] = dd.key === d.key ? wk : dd.weight;
      const rs = rescore(dims, rows, overrides);
      const t = rs.find((r) => r.subjectId === top.subjectId);
      const s = rs.find((r) => r.subjectId === second.subjectId);
      if (!t || !s) return null;
      return t.weighted - s.weighted;
    };
    const g0 = gapAt(d.weight);
    const g1 = gapAt(d.weight + 0.01);
    let flip: number | null = null;
    let prev = gapAt(0);
    for (let wk = 0.005; wk <= 0.6001; wk += 0.005) {
      const g = gapAt(wk);
      // An unevaluable point is skipped, not treated as a crossing. `prev` is left alone
      // so the comparison resumes against the last point that was actually measured.
      if (g === null) continue;
      if (prev !== null && ((prev > 0 && g <= 0) || (prev < 0 && g >= 0))) { flip = Math.round(wk * 1000) / 1000; break; }
      prev = g;
    }
    return {
      dimKey: d.key,
      dimLabel: d.label,
      currentWeight: d.weight,
      flipWeight: flip,
      gapPerHundredth: g0 !== null && g1 !== null ? Math.round((g1 - g0) * 1000) / 1000 : null,
    };
  });
}

export interface SetAnalysis {
  strengths: Array<{ dimKey: string; dimLabel: string; best: number; coveredBy: string }>;
  /**
   * `best` is null when NOBODY IN THE SET WAS SCORED on that dimension — an unassessed
   * dimension, not a dimension the set is bad at. The two need different answers: one is
   * "go and score it", the other is "go and fix it".
   */
  gaps: Array<{ dimKey: string; dimLabel: string; best: number | null; unassessed: boolean }>;
  /** Herfindahl over the set's weighted shares — 1/n = perfectly balanced. */
  concentration: number;
}

/**
 * Analyze a chosen LP set: per-dimension coverage (best score) and balance.
 *
 * THE SAME LAUNDERING AS `rescore`, three functions down, found while fixing that one and
 * fixed with it. `best` was computed as `max(scores[key] ?? 0)`, so a dimension nobody in
 * the set had been scored on came out as `best: 0` and was reported as a GAP — an
 * assertion that the set is uniformly terrible at something nobody ever looked at. Since
 * `best` takes a maximum, the invented zero could only ever understate.
 */
export function analyzeSet(dims: EngineDim[], rows: EngineRow[], selectedIds: string[]): SetAnalysis {
  const chosen = rows.filter((r) => selectedIds.includes(r.subjectId));
  if (chosen.length === 0) return { strengths: [], gaps: [], concentration: 0 };
  const strengths: SetAnalysis['strengths'] = [];
  const gaps: SetAnalysis['gaps'] = [];
  for (const d of dims) {
    let best: number | null = null; let by = '';
    for (const r of chosen) {
      const v = (r.scores ?? {})[d.key];
      // Same three-state read as rescore: absent and withheld are not zero, and a real 0
      // is a measurement that must be allowed to win when it is the only one there is.
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (best === null || v > best) { best = v; by = r.subjectLabel; }
    }
    if (best !== null && best >= 4) strengths.push({ dimKey: d.key, dimLabel: d.label, best, coveredBy: by });
    else gaps.push({ dimKey: d.key, dimLabel: d.label, best, unassessed: best === null });
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
