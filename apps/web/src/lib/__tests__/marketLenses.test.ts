import { describe, expect, it } from 'vitest';
import { classifyZone, getLens, isPlottable, LENSES, normalize, summarize } from '@/components/market/marketLenses';
import type { MapPoint } from '@/lib/api/bd';

function pt(over: Partial<MapPoint> = {}): MapPoint {
  return {
    id: over.id ?? 'p', name: 'X', ticker: 'X', marketCapUsd: 100_000_000, volume24hUsd: 10_000_000,
    priceChange30d: 5, category: 'DeFi', region: 'eu', listedOnLcx: false, band: 'high',
    priorityScore: 70, propensityScore: 80, euScore: 75, usPreScore: 40, usPostScore: 50,
    recommendedMarket: 'eu', ...over,
  };
}

describe('market lenses', () => {
  it('exposes 4 distinct lenses each with 4 named zones + a target corner', () => {
    expect(LENSES).toHaveLength(4);
    for (const l of LENSES) {
      expect(Object.keys(l.zones)).toEqual(['tr', 'tl', 'br', 'bl']);
      expect(l.zones[l.target]).toBeTruthy();
    }
  });

  it('opportunity: eligibility = best of EU/US, quadrant by both thresholds', () => {
    const lens = getLens('opportunity');
    // eu 75 vs us-post 50 → eligibility 75 (≥60), propensity 80 (≥50) → prime (tr)
    expect(classifyZone(lens, pt())).toBe('tr');
    // low eligibility, high propensity → keen-not-eligible (tl)
    expect(classifyZone(lens, pt({ euScore: 30, usPostScore: 20, propensityScore: 80 }))).toBe('tl');
    // eligible, low intent → br
    expect(classifyZone(lens, pt({ propensityScore: 20 }))).toBe('br');
  });

  it('drops points that lack an axis value (unplottable, not mis-placed at 0)', () => {
    const lens = getLens('momentum');
    expect(isPlottable(lens, pt({ volume24hUsd: null }))).toBe(false);
    expect(classifyZone(lens, pt({ priceChange30d: null }))).toBeNull();
  });

  it('normalize handles linear and log domains and clamps out-of-range', () => {
    const lin = getLens('opportunity').x; // [0,100] linear
    expect(normalize(lin, 50)).toBeCloseTo(0.5);
    expect(normalize(lin, 999)).toBe(1); // clamped
    const log = getLens('scale').x; // [1e6, 5e9] log
    expect(normalize(log, 1_000_000)).toBeCloseTo(0);
    expect(normalize(log, 5_000_000_000)).toBeCloseTo(1);
  });

  it('summarize rolls up count, mcap, listed and zone distribution', () => {
    const lens = getLens('opportunity');
    const s = summarize(lens, [pt(), pt({ id: 'b', listedOnLcx: true, propensityScore: 20 })]);
    expect(s.count).toBe(2);
    expect(s.listed).toBe(1);
    expect(s.totalMcap).toBe(200_000_000);
    expect(s.zoneCounts.tr).toBe(1);
    expect(s.zoneCounts.br).toBe(1);
  });
});
