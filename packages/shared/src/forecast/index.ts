/**
 * Deal forecasting — win probability per open deal plus a Monte Carlo
 * quarterly revenue distribution. Deterministic and free: stage base rates
 * are hand-calibrated against LCX's own funnel history (36 won / ~880
 * pipeline records ≈ 4% overall), modified by priority and staleness.
 * A seeded PRNG keeps runs reproducible.
 */

export interface ForecastDealInput {
  id: string;
  stage: string;
  packageValueCents: number | null;
  priorityScore: number;
  daysSinceUpdate: number;
}

/** Stage-conditional base win rates (LCX funnel-informed, hand-set). */
const STAGE_BASE_RATE: Record<string, number> = {
  not_started: 0.02,
  contacted: 0.08,
  discovery: 0.2,
  proposal: 0.4,
  negotiating: 0.65,
  won: 1,
  lost: 0,
};

/**
 * Win probability = stage base × priority modifier × staleness decay.
 *  - priority 35+ (top of queue) boosts up to 1.3×; priority 0 dampens to 0.7×
 *  - each full week without movement decays by 10%, floored at 40% of base
 */
export function dealWinProbability(deal: ForecastDealInput): number {
  const base = STAGE_BASE_RATE[deal.stage] ?? 0.05;
  if (base === 0 || base === 1) return base;

  const priorityMod = Math.max(0.7, Math.min(1.3, 0.7 + (deal.priorityScore / 35) * 0.6));
  const weeksStale = Math.floor(Math.max(0, deal.daysSinceUpdate) / 7);
  const staleMod = Math.max(0.4, Math.pow(0.9, weeksStale));

  return Math.min(0.95, base * priorityMod * staleMod);
}

export interface MonteCarloResult {
  runs: number;
  p10Cents: number;
  p50Cents: number;
  p90Cents: number;
  expectedCents: number;
  deals: { id: string; winProbability: number; valueCents: number }[];
}

/** Mulberry32 — tiny seeded PRNG so forecasts are reproducible. */
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

export function monteCarloForecast(
  deals: ForecastDealInput[],
  opts: { runs?: number; seed?: number } = {},
): MonteCarloResult {
  const runs = opts.runs ?? 10_000;
  const rand = mulberry32(opts.seed ?? 42);

  const scored = deals
    .filter((d) => d.stage !== 'won' && d.stage !== 'lost')
    .map((d) => ({
      id: d.id,
      winProbability: dealWinProbability(d),
      valueCents: d.packageValueCents ?? 0,
    }));

  const totals = new Array<number>(runs);
  for (let i = 0; i < runs; i++) {
    let total = 0;
    for (const d of scored) {
      if (rand() < d.winProbability) total += d.valueCents;
    }
    totals[i] = total;
  }
  totals.sort((a, b) => a - b);

  const pct = (p: number) => totals[Math.min(runs - 1, Math.floor((p / 100) * runs))];
  const expected = scored.reduce((s, d) => s + d.winProbability * d.valueCents, 0);

  return {
    runs,
    p10Cents: pct(10),
    p50Cents: pct(50),
    p90Cents: pct(90),
    expectedCents: Math.round(expected),
    deals: scored,
  };
}
