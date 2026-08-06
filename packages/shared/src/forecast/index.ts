/**
 * Deal forecasting — win probability per open deal plus a Monte Carlo
 * quarterly revenue distribution. Deterministic and free: stage base rates
 * are hand-calibrated against LCX's own funnel history (36 won / ~880
 * pipeline records ≈ 4% overall), modified by priority and staleness.
 * A seeded PRNG keeps runs reproducible.
 *
 * Three rules the simulation enforces rather than smoothing over:
 *  - An open deal the model cannot price (null package value) or cannot rate (a
 *    stage with no base rate) is EXCLUDED AND NAMED. It is never valued at 0
 *    cents and never assigned a fallback probability.
 *
 *    READ THIS BEFORE WRITING A RELEASE NOTE: excluding an unpriced deal does
 *    NOT move the distribution. A Bernoulli term worth 0 cents contributes 0 to
 *    every path total, and expectedCents = Σ p·value is identical term for term,
 *    so p10/p50/p90 and the expectation are the same in law as they were under
 *    the old `?? 0` coercion (only the PRNG draw alignment changes, which is
 *    Monte Carlo noise, and measured 0 on a production-shaped call). What the
 *    exclusion buys is HONESTY: the deal is named in `unpriced`, and it no
 *    longer appears in `deals[]` as though it had been priced at zero.
 *  - If EVERY open deal is unpriceable the percentiles and the expectation are
 *    null with a code, never 0. A $0 quarter is a claim; "we could not price any
 *    of it" is a refusal, and the two must not render the same.
 *  - Every path knows its full winner set, so the per-deal conditional book is
 *    accumulated instead of discarded. Both decisiveness figures are withheld
 *    when their own standard error swamps them — see `DealDecisiveness`.
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

/** Stages the model has a calibrated base rate for. Anything else is unrateable. */
export function isRateableStage(stage: string): boolean {
  return Object.prototype.hasOwnProperty.call(STAGE_BASE_RATE, stage);
}

/**
 * Win probability = stage base × priority modifier × staleness decay.
 *  - priority 35+ (top of queue) boosts up to 1.3×; priority 0 dampens to 0.7×
 *  - each full week without movement decays by 10%, floored at 40% of base
 *
 * An unrecognised stage falls back to 0.05 HERE for callers that only want a
 * display number. `monteCarloForecast` does not use that fallback: it excludes
 * and names the deal instead (see `unrateable`), because 5% is an invented
 * estimate, not an observation. Check `isRateableStage` before trusting this.
 */
export function dealWinProbability(deal: ForecastDealInput): number {
  const base = STAGE_BASE_RATE[deal.stage] ?? 0.05;
  if (base === 0 || base === 1) return base;

  const priorityMod = Math.max(0.7, Math.min(1.3, 0.7 + (deal.priorityScore / 35) * 0.6));
  const weeksStale = Math.floor(Math.max(0, deal.daysSinceUpdate) / 7);
  const staleMod = Math.max(0.4, Math.pow(0.9, weeksStale));

  return Math.min(0.95, base * priorityMod * staleMod);
}

/** Why a decisiveness figure is withheld. Stable codes; the UI keys off these. */
export type DecisivenessRefusal = 'INSUFFICIENT_ARM' | 'SE_EXCEEDS_MAGNITUDE';

/**
 * Per-deal decisiveness, recovered from the paths the simulation already walks.
 * Every path knows its full winner set; before this it was thrown away and only
 * four scalars survived.
 *
 * Both figures carry their own standard error AND their own refusal code. A
 * Monte Carlo estimate whose SE exceeds its magnitude is not a small number, it
 * is no number, and neither one may be ranked at face value.
 */
export interface DealDecisiveness {
  id: string;
  /**
   * E[book | this deal won] − E[book | this deal lost], in cents.
   *
   * HONEST CAVEAT: deals are drawn independently, so this quantity is
   * analytically EXACTLY this deal's value — the measured number is a
   * convergence check on the run count, not independent information. Ranking on
   * it is ranking on value. `p50SwingPct` is the part that is not a restatement.
   */
  swingCents: number | null;
  /** Standard error of swingCents (pooled across the two arms). Null iff swingCents is. */
  swingStdErr: number | null;
  /** Set iff swingCents is null. */
  swingCode: DecisivenessRefusal | null;
  /**
   * Percentage-point change in P(book ≥ the unconditional p50) between this
   * deal landing and not landing. This is the non-degenerate answer to "which
   * deal decides the quarter": it depends on the deal's size RELATIVE to the
   * spread of the rest of the book, not on its size alone.
   *
   * Under independent draws this quantity CANNOT be negative — landing a deal
   * can only raise the odds of clearing a fixed threshold — so a measured value
   * at or below its own standard error (including any negative) is noise and is
   * withheld rather than printed and ranked.
   */
  p50SwingPct: number | null;
  /**
   * Standard error of p50SwingPct in percentage points (two independent arm
   * proportions). Null iff p50SwingPct is. This is the ranking key's own
   * uncertainty: without it a ±1pp sampling wobble reads as a fact.
   */
  p50SwingStdErr: number | null;
  /** Set iff p50SwingPct is null. */
  p50SwingCode: DecisivenessRefusal | null;
  /** Runs in which this deal won / lost. Both arms are needed for a conditional mean. */
  wonRuns: number;
  lostRuns: number;
  /** Set iff BOTH figures are withheld because an arm was too thin to condition on. */
  code: 'INSUFFICIENT_ARM' | null;
}

/** An open deal the model refused to simulate, with the rule it applied. */
export interface ForecastExclusion {
  code: 'UNPRICED_DEAL_EXCLUDED' | 'UNRATEABLE_STAGE_EXCLUDED';
  rule: string;
  count: number;
  ids: string[];
}

export interface MonteCarloResult {
  runs: number;
  /**
   * Percentiles and expectation in cents, or NULL with `distributionRefusal`
   * set. Null means "the simulation had nothing it could price" — it is NEVER
   * rendered as 0, which would assert a $0 quarter as a fact. An empty open
   * pipeline is a different state: that genuinely forecasts 0 and reports 0.
   */
  p10Cents: number | null;
  p50Cents: number | null;
  p90Cents: number | null;
  expectedCents: number | null;
  /** Set iff the percentiles above are null. Cites the rule it applies. */
  distributionRefusal: { code: 'ALL_OPEN_DEALS_UNPRICEABLE'; rule: string } | null;
  deals: { id: string; winProbability: number; valueCents: number }[];
  /**
   * Open deals with NO package value. They are EXCLUDED from the simulation and
   * named here — never coerced to 0 cents, which would appear in `deals[]` as a
   * deal genuinely priced at zero. The exclusion does not move the percentiles
   * (see the module header); it makes the gap visible.
   */
  unpriced: ForecastExclusion;
  /**
   * Open deals whose stage has no calibrated base rate. Excluded and named
   * rather than assigned the 5% fallback, which is an invented estimate.
   */
  unrateable: ForecastExclusion;
  /**
   * Deals ranked by how much they move the odds of the quarter (`p50SwingPct`,
   * descending). Rows whose ranking key is withheld are APPENDED in input
   * order — never mapped onto a sentinel number inside the value range, which
   * would sort a refusal above a measured row.
   */
  decisiveness: DealDecisiveness[];
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

const UNPRICED_RULE =
  'Absent data refuses: an unknown package value is not zero cents, so the deal is excluded from the distribution and named here.';
const UNRATEABLE_RULE =
  'Absent data refuses: a stage with no calibrated base rate has no win probability, so the deal is excluded rather than assigned the 5% fallback.';
const ALL_UNPRICEABLE_RULE =
  'Every open deal was excluded (unpriced or unrateable), so no distribution exists. Reporting 0 would assert a $0 quarter; this refuses instead.';

export function monteCarloForecast(
  deals: ForecastDealInput[],
  opts: { runs?: number; seed?: number } = {},
): MonteCarloResult {
  const runs = opts.runs ?? 10_000;
  const rand = mulberry32(opts.seed ?? 42);

  const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  // An unpriced deal is not a $0 deal, and an unrecognised stage is not a 5%
  // deal. Both leave the simulation entirely and are named in the result, so a
  // reader sees WHAT the forecast could not cover instead of a silently
  // narrower book.
  const unrateableIds = open.filter((d) => !isRateableStage(d.stage)).map((d) => d.id);
  const rateable = open.filter((d) => isRateableStage(d.stage));
  const unpricedIds = rateable.filter((d) => d.packageValueCents == null).map((d) => d.id);
  const scored = rateable
    .filter((d) => d.packageValueCents != null)
    .map((d) => ({
      id: d.id,
      winProbability: dealWinProbability(d),
      valueCents: d.packageValueCents as number,
    }));

  const n = scored.length;
  // Conditional accumulators: two arms per deal, so a path's total can be
  // attributed to every deal's outcome on that same path.
  const wonSum = new Float64Array(n);
  const wonSqSum = new Float64Array(n);
  const lostSum = new Float64Array(n);
  const lostSqSum = new Float64Array(n);
  const wonRuns = new Int32Array(n);
  const lostRuns = new Int32Array(n);
  const won = new Uint8Array(n); // this path's winner set, reused

  const totals = new Array<number>(runs);
  for (let i = 0; i < runs; i++) {
    let total = 0;
    for (let j = 0; j < n; j++) {
      const w = rand() < scored[j].winProbability ? 1 : 0;
      won[j] = w;
      if (w) total += scored[j].valueCents;
    }
    totals[i] = total;
    for (let j = 0; j < n; j++) {
      if (won[j]) { wonSum[j] += total; wonSqSum[j] += total * total; wonRuns[j]++; }
      else { lostSum[j] += total; lostSqSum[j] += total * total; lostRuns[j]++; }
    }
  }
  totals.sort((a, b) => a - b);

  const pct = (p: number) => totals[Math.min(runs - 1, Math.floor((p / 100) * runs))];
  const expected = scored.reduce((s, d) => s + d.winProbability * d.valueCents, 0);

  // Second pass for the threshold swing. The p50 is only known after the first
  // pass, and re-seeding the PRNG replays the identical paths, so this needs no
  // per-path storage and stays exactly reproducible.
  const threshold = n > 0 ? pct(50) : 0;
  const wonHits = new Int32Array(n);
  const lostHits = new Int32Array(n);
  if (n > 0) {
    const replay = mulberry32(opts.seed ?? 42);
    for (let i = 0; i < runs; i++) {
      let total = 0;
      for (let j = 0; j < n; j++) {
        const w = replay() < scored[j].winProbability ? 1 : 0;
        won[j] = w;
        if (w) total += scored[j].valueCents;
      }
      const hit = total >= threshold ? 1 : 0;
      for (let j = 0; j < n; j++) {
        if (won[j]) wonHits[j] += hit;
        else lostHits[j] += hit;
      }
    }
  }

  /** Variance OF THE MEAN of one arm from its running sums (sample variance, n−1). */
  const armVarOfMean = (sum: number, sqSum: number, k: number): number => {
    if (k < 2) return Number.NaN;
    const m = sum / k;
    const v = (sqSum - k * m * m) / (k - 1);
    return (v > 0 ? v : 0) / k;
  };
  /**
   * Variance OF THE MEAN of a 0/1 arm proportion, on the Agresti–Coull point
   * (hits+1)/(k+2). The plain Wald variance is EXACTLY 0 when an arm never
   * clears the threshold or always does, which would publish "±0.00" — a
   * claim of zero uncertainty from a boundary count. This never does that.
   */
  const propVarOfMean = (hits: number, k: number): number => {
    const p = (hits + 1) / (k + 2);
    return (p * (1 - p)) / k;
  };

  const rows: DealDecisiveness[] = scored.map((d, j): DealDecisiveness => {
    const wn = wonRuns[j];
    const ln = lostRuns[j];
    // One arm with fewer than two runs has no mean worth publishing — a deal
    // that won once in 20k runs cannot tell you what the book looks like when
    // it lands. Refuse rather than average a single path.
    if (wn < 2 || ln < 2) {
      return {
        id: d.id,
        swingCents: null, swingStdErr: null, swingCode: 'INSUFFICIENT_ARM',
        p50SwingPct: null, p50SwingStdErr: null, p50SwingCode: 'INSUFFICIENT_ARM',
        wonRuns: wn, lostRuns: ln, code: 'INSUFFICIENT_ARM',
      };
    }
    const swing = wonSum[j] / wn - lostSum[j] / ln;
    const swingSe = Math.sqrt(armVarOfMean(wonSum[j], wonSqSum[j], wn) + armVarOfMean(lostSum[j], lostSqSum[j], ln));
    const p50Swing = (wonHits[j] / wn - lostHits[j] / ln) * 100;
    const p50Se = 100 * Math.sqrt(propVarOfMean(wonHits[j], wn) + propVarOfMean(lostHits[j], ln));

    // An estimate inside its own noise is withheld, not ranked at face value.
    // This guard is NOT vacuous here (unlike the slope in launchSim.ts, where
    // non-negativity forces SE ≤ mean): the swing is a difference of two large
    // conditional means and a small deal's swing is routinely swamped by its
    // own SE at production run counts. Measured: a 100k-cent deal beside a
    // 9M-cent deal at 20k runs returns SE ≈ 2× the point estimate.
    const swingUsable = Math.abs(swing) > swingSe;
    // The threshold swing cannot be negative in law, so anything at or below
    // its SE — negatives included — is sampling noise.
    const p50Usable = p50Swing > p50Se;

    return {
      id: d.id,
      swingCents: swingUsable ? Math.round(swing) : null,
      swingStdErr: swingUsable ? Math.round(swingSe) : null,
      swingCode: swingUsable ? null : 'SE_EXCEEDS_MAGNITUDE',
      p50SwingPct: p50Usable ? Math.round(p50Swing * 10) / 10 : null,
      p50SwingStdErr: p50Usable ? Math.round(p50Se * 100) / 100 : null,
      p50SwingCode: p50Usable ? null : 'SE_EXCEEDS_MAGNITUDE',
      wonRuns: wn,
      lostRuns: ln,
      code: null,
    };
  });

  // Most decisive first on the threshold swing (not on raw value). Rows whose
  // key is withheld are APPENDED, not sorted with a sentinel: p50SwingPct is a
  // percentage-point difference whose real values reach below any sentinel we
  // could pick, so a sentinel would rank a refusal above a measured row.
  const decisiveness: DealDecisiveness[] = [
    ...rows.filter((r) => r.p50SwingPct !== null).sort((a, b) => b.p50SwingPct! - a.p50SwingPct!),
    ...rows.filter((r) => r.p50SwingPct === null),
  ];

  // THREE STATES, kept apart:
  //  - no open deals at all        → a genuine 0 (there is nothing to book)
  //  - open deals, none priceable  → REFUSAL: null percentiles + a code
  //  - some priceable              → the distribution over what could be priced,
  //                                  with the excluded deals named beside it
  const allExcluded = open.length > 0 && n === 0;

  return {
    runs,
    p10Cents: allExcluded ? null : pct(10),
    p50Cents: allExcluded ? null : pct(50),
    p90Cents: allExcluded ? null : pct(90),
    expectedCents: allExcluded ? null : Math.round(expected),
    distributionRefusal: allExcluded
      ? { code: 'ALL_OPEN_DEALS_UNPRICEABLE', rule: ALL_UNPRICEABLE_RULE }
      : null,
    deals: scored,
    unpriced: {
      code: 'UNPRICED_DEAL_EXCLUDED',
      rule: UNPRICED_RULE,
      count: unpricedIds.length,
      ids: unpricedIds,
    },
    unrateable: {
      code: 'UNRATEABLE_STAGE_EXCLUDED',
      rule: UNRATEABLE_RULE,
      count: unrateableIds.length,
      ids: unrateableIds,
    },
    decisiveness,
  };
}
