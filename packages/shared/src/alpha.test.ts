import { describe, expect, it } from 'vitest';
import { ach, assess, dealValue, listingPropensity, timingWindow, winnability, type SignalBundle } from './alpha.js';

const base: SignalBundle = {
  marketCapUsd: 50_000_000, volume24hUsd: 3_000_000, priceChange30d: 5, tokenAgeDays: 500,
  tvlUsd: 10_000_000, chainCount: 3, tvlChange7d: 2, category: 'Dexs',
  githubCommits30d: 25, githubStars: 400, teamSize: 5, devStatus: 'Working product',
  euScore: 70, usPostScore: 40, propensityScore: 60, priorityScore: 65,
  listedOnLcx: false, competitorExchangeCount: 3, recommendedMarket: 'eu', contactCount: 1,
  dataConfidence: 80,
};

describe('alpha — composite scores', () => {
  it('propensity: listed-on-LCX collapses it; active dev lifts it', () => {
    const live = listingPropensity(base).score;
    const listed = listingPropensity({ ...base, listedOnLcx: true }).score;
    const dead = listingPropensity({ ...base, githubCommits30d: 0, teamSize: 0, devStatus: null, tvlUsd: null }).score;
    expect(listed).toBeLessThan(live);
    expect(live).toBeGreaterThan(dead);
  });

  it('timing: on rivals-not-LCX + momentum ⇒ hotter than a quiet token', () => {
    const hot = timingWindow({ ...base, priceChange30d: 40, competitorExchangeCount: 6 });
    const quiet = timingWindow({ ...base, priceChange30d: -20, competitorExchangeCount: 0, tvlChange7d: 0, githubCommits30d: 0 });
    expect(hot.score).toBeGreaterThan(quiet.score);
    expect(['hot', 'warming']).toContain(hot.window);
    expect(quiet.window).toBe('quiet');
  });

  it('deal value: bigger + more liquid ⇒ higher USD estimate, within the package range', () => {
    const big = dealValue({ ...base, marketCapUsd: 3e9, volume24hUsd: 5e8 }).usd;
    const small = dealValue({ ...base, marketCapUsd: 2e6, volume24hUsd: 5e4 }).usd;
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(15_000);
    expect(big).toBeLessThanOrEqual(250_000);
  });

  it('winnability: EU fit is the LCX edge; already-listed kills it', () => {
    const euFit = winnability(base).score;
    const noEu = winnability({ ...base, euScore: 10, recommendedMarket: 'us_first' }).score;
    const listed = winnability({ ...base, listedOnLcx: true }).score;
    expect(euFit).toBeGreaterThan(noEu);
    expect(listed).toBeLessThan(euFit);
  });

  it('winnability: the EU-first bonus fires on eu_first (not just eu)', () => {
    const euFirst = winnability({ ...base, recommendedMarket: 'eu_first' }).score;
    const noneMkt = winnability({ ...base, recommendedMarket: 'none' }).score;
    expect(euFirst).toBeGreaterThan(noneMkt);
  });

  it('conviction: strong target scores high; thin data discounts it', () => {
    const strong = assess(base).conviction.score;
    const thin = assess({ ...base, dataConfidence: 10 }).conviction.score;
    expect(strong).toBeGreaterThan(thin);
    expect(strong).toBeGreaterThan(40);
  });

  it('every score is explainable (drivers) and carries confidence', () => {
    const a = assess(base);
    expect(a.conviction.drivers.length).toBeGreaterThan(0);
    expect(a.propensity.confidence).toBeGreaterThan(0);
    expect(a.propensity.confidence).toBeLessThanOrEqual(100);
  });
});

describe('alpha — ACH', () => {
  it('rivals-not-LCX + momentum + dev ⇒ leans "list soon"', () => {
    const r = ach({ ...base, priceChange30d: 30, competitorExchangeCount: 5, githubCommits30d: 30 });
    expect(r.verdict).toBe('list_soon');
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('already listed ⇒ leans "no list"', () => {
    const r = ach({ ...base, listedOnLcx: true });
    expect(r.verdict).toBe('no_list');
  });

  it('probabilities are a normalized distribution', () => {
    const r = ach(base);
    const sum = r.probabilities.list_soon + r.probabilities.list_later + r.probabilities.no_list;
    expect(sum).toBeCloseTo(1, 5);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
  });
});
