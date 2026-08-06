import { describe, expect, it } from 'vitest';
import { dealWinProbability, monteCarloForecast } from './index.js';

const deal = (over: Partial<Parameters<typeof dealWinProbability>[0]> = {}) => ({
  id: 'd1',
  stage: 'proposal',
  packageValueCents: 2_000_000, // $20k
  priorityScore: 35,
  daysSinceUpdate: 0,
  ...over,
});

describe('dealWinProbability', () => {
  it('is monotonic across stages', () => {
    const stages = ['not_started', 'contacted', 'discovery', 'proposal', 'negotiating'];
    const probs = stages.map((stage) => dealWinProbability(deal({ stage })));
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeGreaterThan(probs[i - 1]);
  });

  it('won is certain, lost is zero', () => {
    expect(dealWinProbability(deal({ stage: 'won' }))).toBe(1);
    expect(dealWinProbability(deal({ stage: 'lost' }))).toBe(0);
  });

  it('staleness decays but never below 40% of base', () => {
    const fresh = dealWinProbability(deal());
    const stale = dealWinProbability(deal({ daysSinceUpdate: 30 }));
    const ancient = dealWinProbability(deal({ daysSinceUpdate: 365 }));
    expect(stale).toBeLessThan(fresh);
    expect(ancient).toBeGreaterThanOrEqual(fresh * 0.4 * 0.99);
  });

  it('higher priority raises the probability', () => {
    expect(dealWinProbability(deal({ priorityScore: 40 }))).toBeGreaterThan(
      dealWinProbability(deal({ priorityScore: 0 })),
    );
  });

  it('never exceeds 95% for open deals', () => {
    expect(dealWinProbability(deal({ stage: 'negotiating', priorityScore: 100 }))).toBeLessThanOrEqual(0.95);
  });
});

describe('monteCarloForecast', () => {
  it('is reproducible for a fixed seed', () => {
    const deals = [deal(), deal({ id: 'd2', stage: 'negotiating' })];
    const a = monteCarloForecast(deals, { runs: 2000, seed: 7 });
    const b = monteCarloForecast(deals, { runs: 2000, seed: 7 });
    expect(a.p50Cents).toBe(b.p50Cents);
    expect(a.p90Cents).toBe(b.p90Cents);
  });

  it('produces ordered percentiles bounded by the total pipeline', () => {
    const deals = [deal(), deal({ id: 'd2' }), deal({ id: 'd3', stage: 'negotiating' })];
    const r = monteCarloForecast(deals, { runs: 5000 });
    // Three priceable deals, so the distribution exists and nothing is withheld.
    expect(r.distributionRefusal).toBeNull();
    expect(r.p10Cents!).toBeLessThanOrEqual(r.p50Cents!);
    expect(r.p50Cents!).toBeLessThanOrEqual(r.p90Cents!);
    expect(r.p90Cents!).toBeLessThanOrEqual(3 * 2_000_000);
    expect(r.expectedCents!).toBeGreaterThan(0);
  });

  it('excludes closed deals from the simulation — an EMPTY pipeline is a genuine 0, not a refusal', () => {
    // The third state: nothing is open, so nothing can book. 0 is the honest
    // answer here and `distributionRefusal` must stay null. Contrast with the
    // all-unpriceable case below, where 0 would be a lie.
    const r = monteCarloForecast([deal({ stage: 'won' }), deal({ id: 'd2', stage: 'lost' })]);
    expect(r.deals.length).toBe(0);
    expect(r.p90Cents).toBe(0);
    expect(r.distributionRefusal).toBeNull();
  });
});

/**
 * An unpriced deal is NOT a $0 deal. It is excluded and NAMED.
 *
 * WHAT THIS DOES NOT DO, stated so nobody writes it in a release note: the
 * exclusion does not move p10/p50/p90 or the expectation. A Bernoulli term
 * worth 0 cents contributes 0 to every path total and 0 to Σp·value, so the
 * distribution is identical in law to the old `?? 0` coercion — the invariance
 * test below passes against the old code too. What changes is that the deal is
 * named in `unpriced` and no longer sits in `deals[]` looking priced at zero.
 */
describe('monteCarloForecast — unpriced deals are named and excluded (value-neutral, not a correction)', () => {
  it('excluding an unpriced deal moves no figure at all, and names it', () => {
    const priced = [deal(), deal({ id: 'd2', stage: 'negotiating' })];
    const withUnpriced = [...priced, deal({ id: 'no_price', packageValueCents: null })];

    const a = monteCarloForecast(priced, { runs: 4000, seed: 3 });
    const b = monteCarloForecast(withUnpriced, { runs: 4000, seed: 3 });

    // Not "the figures rise": they are the same figures. This pins the identity.
    expect(b.p10Cents).toBe(a.p10Cents);
    expect(b.p50Cents).toBe(a.p50Cents);
    expect(b.p90Cents).toBe(a.p90Cents);
    expect(b.expectedCents).toBe(a.expectedCents);

    // The observable change is the naming, and only the naming.
    expect(b.unpriced.count).toBe(1);
    expect(b.unpriced.ids).toEqual(['no_price']);
    expect(b.unpriced.code).toBe('UNPRICED_DEAL_EXCLUDED');
    expect(b.unpriced.rule).toMatch(/not zero cents/);
    expect(b.deals.map((d) => d.id)).not.toContain('no_price');
    expect(a.unpriced.count).toBe(0);
  });

  it('an all-unpriced pipeline REFUSES the percentiles — it does not report a $0 quarter', () => {
    const r = monteCarloForecast([deal({ packageValueCents: null }), deal({ id: 'd2', packageValueCents: null })], { runs: 500 });
    // The figures a surface would print. Every one of them must be null, not 0.
    expect(r.p10Cents).toBeNull();
    expect(r.p50Cents).toBeNull();
    expect(r.p90Cents).toBeNull();
    expect(r.expectedCents).toBeNull();
    expect(r.p50Cents).not.toBe(0);
    expect(r.distributionRefusal?.code).toBe('ALL_OPEN_DEALS_UNPRICEABLE');
    expect(r.distributionRefusal?.rule).toMatch(/Reporting 0 would assert a \$0 quarter/);
    expect(r.deals.length).toBe(0);
    expect(r.unpriced.count).toBe(2);
    expect(r.decisiveness.length).toBe(0);
  });

  it('one priceable deal is enough to report a distribution, with the rest named beside it', () => {
    const r = monteCarloForecast([deal(), deal({ id: 'no_price', packageValueCents: null })], { runs: 500, seed: 4 });
    expect(r.p50Cents).not.toBeNull();
    expect(r.distributionRefusal).toBeNull();
    expect(r.unpriced.count).toBe(1);
  });

  it('closed deals are excluded before pricing, so a won unpriced deal is not counted as unpriced', () => {
    const r = monteCarloForecast([deal({ stage: 'won', packageValueCents: null })], { runs: 200 });
    expect(r.unpriced.count).toBe(0);
  });

  it('an unrecognised stage is excluded and named, never given the 5% fallback', () => {
    const r = monteCarloForecast([deal({ id: 'weird', stage: 'zzz' }), deal({ id: 'ok' })], { runs: 1000, seed: 5 });
    expect(r.unrateable.count).toBe(1);
    expect(r.unrateable.ids).toEqual(['weird']);
    expect(r.unrateable.code).toBe('UNRATEABLE_STAGE_EXCLUDED');
    expect(r.deals.map((d) => d.id)).toEqual(['ok']);
    expect(r.decisiveness.map((d) => d.id)).toEqual(['ok']);
    // …and it is not double-counted as unpriced (it has a price; the stage is the problem).
    expect(r.unpriced.count).toBe(0);
  });

  it('a pipeline of nothing but unrateable stages refuses too', () => {
    const r = monteCarloForecast([deal({ id: 'a', stage: 'qualified' })], { runs: 200 });
    expect(r.p50Cents).toBeNull();
    expect(r.distributionRefusal?.code).toBe('ALL_OPEN_DEALS_UNPRICEABLE');
    expect(r.unrateable.count).toBe(1);
  });
});

describe('monteCarloForecast — which deal decides the quarter', () => {
  it('the conditional swing converges to the deal value (the analytic identity)', () => {
    // Deals are drawn independently, so E[book|won] − E[book|lost] is exactly
    // this deal's value. The measured swing is therefore a convergence check on
    // the run count — NOT independent information about decisiveness.
    const deals = [deal({ id: 'big', packageValueCents: 9_000_000 }), deal({ id: 'small', packageValueCents: 100_000, stage: 'negotiating' })];
    const r = monteCarloForecast(deals, { runs: 20_000, seed: 17 });
    const big = r.decisiveness.find((d) => d.id === 'big')!;
    expect(big.code).toBeNull();
    expect(big.swingCode).toBeNull();
    expect(Math.abs(big.swingCents! - 9_000_000)).toBeLessThan(4 * big.swingStdErr!);
    expect(big.wonRuns + big.lostRuns).toBe(20_000);
  });

  it('a swing swamped by its own standard error is WITHHELD, not published as a fact', () => {
    // The same fixture as above, and this is the row that made the guard
    // necessary: the small deal's raw swing comes back at 42,796 cents with a
    // standard error of 87,519 — SE ≈ 2× the point estimate, and the analytic
    // truth is 100,000, so the "measured" figure is off by 57%. Publishing it
    // beside the big deal's converged number would rank noise against signal.
    const deals = [deal({ id: 'big', packageValueCents: 9_000_000 }), deal({ id: 'small', packageValueCents: 100_000, stage: 'negotiating' })];
    const r = monteCarloForecast(deals, { runs: 20_000, seed: 17 });
    const small = r.decisiveness.find((d) => d.id === 'small')!;
    expect(small.swingCode).toBe('SE_EXCEEDS_MAGNITUDE');
    expect(small.swingCents).toBeNull();
    expect(small.swingStdErr).toBeNull();
    // Both arms were thick, so this is NOT an arm refusal — a different reason,
    // a different code. The two are never collapsed.
    expect(small.code).toBeNull();
    expect(small.wonRuns).toBeGreaterThan(1000);
    expect(small.lostRuns).toBeGreaterThan(1000);
  });

  it('the p50 swing separates the deal that decides the quarter from one that cannot MEASURABLY', () => {
    const deals = [
      deal({ id: 'whale', packageValueCents: 20_000_000 }),
      deal({ id: 'minnow', packageValueCents: 50_000, stage: 'negotiating' }),
      deal({ id: 'mid', packageValueCents: 3_000_000, stage: 'discovery' }),
    ];
    const r = monteCarloForecast(deals, { runs: 20_000, seed: 23 });
    const whale = r.decisiveness.find((d) => d.id === 'whale')!;
    const minnow = r.decisiveness.find((d) => d.id === 'minnow')!;
    // The whale's swing is enormous relative to its own SE: a real answer.
    expect(whale.p50SwingPct!).toBeGreaterThan(20 * whale.p50SwingStdErr!);
    expect(r.decisiveness[0].id).toBe('whale'); // ranked most decisive first
    // The minnow's is INSIDE its own noise. The old code printed it to 0.1pp
    // with no SE and let its SIGN flip on the seed (negative in 16 of 40 seeds
    // at the production run count), which asserts that landing a deal makes the
    // quarter LESS likely to clear its own median — impossible under
    // independent draws. It is now withheld with a code.
    expect(minnow.p50SwingPct).toBeNull();
    expect(minnow.p50SwingCode).toBe('SE_EXCEEDS_MAGNITUDE');
  });

  it('the ranking key never ships without its standard error, and never claims ±0', () => {
    // A dominant deal clears the threshold in every winning run and in no losing
    // run. The plain Wald SE of that is exactly 0; publishing "±0.00" would be a
    // claim of zero uncertainty from a boundary count, so the SE is computed on
    // the Agresti–Coull point and stays strictly positive.
    const deals = [deal({ id: 'big', packageValueCents: 9_000_000 }), deal({ id: 'small', packageValueCents: 100_000, stage: 'negotiating' })];
    const r = monteCarloForecast(deals, { runs: 20_000, seed: 17 });
    const big = r.decisiveness.find((d) => d.id === 'big')!;
    expect(big.p50SwingPct).toBe(100);
    expect(big.p50SwingStdErr!).toBeGreaterThan(0);
    for (const d of r.decisiveness) {
      // The invariant: a published figure always carries its SE, and a withheld
      // one always carries a code. Never a number without an error bar.
      expect(d.p50SwingPct === null).toBe(d.p50SwingStdErr === null);
      expect(d.p50SwingPct === null).toBe(d.p50SwingCode !== null);
      expect(d.swingCents === null).toBe(d.swingStdErr === null);
      expect(d.swingCents === null).toBe(d.swingCode !== null);
    }
  });

  it('a withheld row is APPENDED, never sorted above a measured one by a sentinel', () => {
    // The old sort mapped a refusal to `?? -1`, which sits inside the real range
    // of p50SwingPct (a percentage-point difference on [-100,100]). Any deal
    // measured below −1 therefore sorted BELOW a withheld row. Here a
    // longshot's arms are too thin to condition on while three other deals are
    // measured; the refusal must be last regardless of the numbers.
    const r = monteCarloForecast([
      deal({ id: 'anchor', packageValueCents: 20_000_000 }),
      deal({ id: 'tiny1', packageValueCents: 40_000, stage: 'negotiating' }),
      deal({ id: 'tiny2', packageValueCents: 30_000, stage: 'negotiating' }),
      deal({ id: 'longshot', stage: 'not_started', priorityScore: 0, daysSinceUpdate: 365 }),
    ], { runs: 60, seed: 1 });
    const ids = r.decisiveness.map((d) => d.id);
    expect(ids[ids.length - 1]).toBe('longshot');
    expect(r.decisiveness[ids.length - 1].code).toBe('INSUFFICIENT_ARM');
    // Everything above the refusal is measured, and in descending order.
    const measured = r.decisiveness.slice(0, -1);
    expect(measured.every((d) => d.p50SwingPct !== null)).toBe(true);
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i].p50SwingPct!).toBeLessThanOrEqual(measured[i - 1].p50SwingPct!);
    }
  });

  it('an arm with too few runs refuses with INSUFFICIENT_ARM rather than averaging one path', () => {
    // p ≈ 0.0056 (not_started × lowest priority × full staleness decay): at 50
    // runs the won arm is empty, so no conditional mean exists.
    const r = monteCarloForecast(
      [deal({ id: 'longshot', stage: 'not_started', priorityScore: 0, daysSinceUpdate: 365 })],
      { runs: 50, seed: 2 },
    );
    const d = r.decisiveness[0];
    expect(d.wonRuns).toBeLessThan(2);
    expect(d.code).toBe('INSUFFICIENT_ARM');
    expect(d.swingCents).toBeNull();
    expect(d.swingCode).toBe('INSUFFICIENT_ARM');
    expect(d.p50SwingPct).toBeNull();
    expect(d.p50SwingCode).toBe('INSUFFICIENT_ARM');
  });

  it('is reproducible for a fixed seed', () => {
    const deals = [deal(), deal({ id: 'd2', stage: 'negotiating', packageValueCents: 500_000 })];
    const a = monteCarloForecast(deals, { runs: 3000, seed: 31 });
    const b = monteCarloForecast(deals, { runs: 3000, seed: 31 });
    expect(a.decisiveness).toEqual(b.decisiveness);
  });
});
