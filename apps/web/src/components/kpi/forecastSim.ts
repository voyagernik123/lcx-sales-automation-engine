/**
 * Client-side Monte Carlo re-simulation of the pipeline forecast.
 *
 * Why not call @lcx/shared's monteCarloForecast directly: (1) it returns only
 * percentiles, and the distribution histogram needs the full run totals to
 * bin; (2) it re-derives win probabilities from stage/priority/staleness, but
 * GET /v1/kpis/forecast doesn't return priorityScore — and the doctrine says
 * the chart must be built from the *same* per-deal winProbability figures the
 * "See the math" table shows. So this replays the identical engine (same
 * Bernoulli-sum model, same mulberry32 PRNG, same seed convention) over the
 * server-published probabilities — and over their scenario-adjusted variants.
 */

export interface SimDeal {
  /** Win probability 0..1. */
  p: number;
  /** Deal value (same unit in = same unit out; the KPI endpoints use dollars). */
  value: number;
}

export interface SimSummary {
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  /** Deterministic Σ p·value — the formula stated in the disclosure. */
  expected: number;
  /** Ascending run totals (length = runs). */
  totals: number[];
}

/** Mulberry32 — the same tiny seeded PRNG @lcx/shared uses, for reproducibility. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateTotals(deals: SimDeal[], opts: { runs?: number; seed?: number } = {}): SimSummary {
  const runs = opts.runs ?? 10_000;
  const rand = mulberry32(opts.seed ?? 42);

  const totals = new Array<number>(runs);
  for (let i = 0; i < runs; i++) {
    let total = 0;
    for (const d of deals) {
      if (rand() < d.p) total += d.value;
    }
    totals[i] = total;
  }
  totals.sort((a, b) => a - b);

  const pct = (p: number) => (runs > 0 ? totals[Math.min(runs - 1, Math.floor((p / 100) * runs))] : 0);
  const expected = deals.reduce((s, d) => s + d.p * d.value, 0);

  return { runs, p10: pct(10), p50: pct(50), p90: pct(90), expected, totals };
}

/** Bin ascending totals into `bins` equal-width buckets over `domain`. */
export function binTotals(totals: number[], domain: [number, number], bins: number): number[] {
  const [lo, hi] = domain;
  const span = Math.max(1e-9, hi - lo);
  const counts = new Array<number>(bins).fill(0);
  for (const t of totals) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((t - lo) / span) * bins)));
    counts[idx] += 1;
  }
  return counts;
}
