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
    expect(r.p10Cents).toBeLessThanOrEqual(r.p50Cents);
    expect(r.p50Cents).toBeLessThanOrEqual(r.p90Cents);
    expect(r.p90Cents).toBeLessThanOrEqual(3 * 2_000_000);
    expect(r.expectedCents).toBeGreaterThan(0);
  });

  it('excludes closed deals from the simulation', () => {
    const r = monteCarloForecast([deal({ stage: 'won' }), deal({ id: 'd2', stage: 'lost' })]);
    expect(r.deals.length).toBe(0);
    expect(r.p90Cents).toBe(0);
  });
});
