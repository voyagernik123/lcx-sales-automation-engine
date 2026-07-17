import { describe, expect, it } from 'vitest';
import {
  classifyZone,
  getColorMode,
  getLens,
  histogram,
  isPlottable,
  LENSES,
  normalize,
  summarize,
} from '@/components/market/marketLenses';
import type { MapPoint } from '@/lib/api/bd';

function pt(over: Partial<MapPoint> = {}): MapPoint {
  return {
    id: over.id ?? 'p', name: 'X', ticker: 'X', marketCapUsd: 100_000_000, volume24hUsd: 10_000_000,
    priceChange30d: 5, category: 'DeFi', region: 'eu', listedOnLcx: false, exchangeCount: 3, band: 'high',
    priorityScore: 70, propensityScore: 80, euScore: 75, usPreScore: 40, usPostScore: 50,
    recommendedMarket: 'eu', ...over,
  };
}

describe('market lenses', () => {
  it('exposes 5 distinct lenses each with 4 named zones + a target corner', () => {
    expect(LENSES).toHaveLength(5);
    for (const l of LENSES) {
      expect(Object.keys(l.zones)).toEqual(['tr', 'tl', 'br', 'bl']);
      expect(l.zones[l.target]).toBeTruthy();
    }
  });

  it('competitive lens plots by exchange reach (0 is valid, not dropped)', () => {
    const lens = getLens('competitive');
    // 5 competitor exchanges (≥3), eligible (best EU/US 75) → we-can-win (tr)
    expect(classifyZone(lens, pt({ exchangeCount: 5 }))).toBe('tr');
    // nobody lists it → x=0 is plottable, lands bottom-left
    expect(isPlottable(lens, pt({ exchangeCount: 0 }))).toBe(true);
    expect(classifyZone(lens, pt({ exchangeCount: 0, euScore: 20, usPostScore: 10 }))).toBe('bl');
  });

  it('gap color mode flags competitor-listed tokens LCX is missing', () => {
    const gap = getColorMode('gap');
    expect(gap.key(pt({ exchangeCount: 6, listedOnLcx: false }))).toBe('gap-strong');
    expect(gap.key(pt({ exchangeCount: 2, listedOnLcx: false }))).toBe('gap');
    expect(gap.key(pt({ exchangeCount: 6, listedOnLcx: true }))).toBe('listed');
    expect(gap.key(pt({ exchangeCount: 0, listedOnLcx: false }))).toBe('none');
  });

  it('histogram buckets values across the axis domain, summing to n', () => {
    const axis = getLens('opportunity').x; // [0,100] linear
    const h = histogram(axis, [5, 20, 90, 95], 10);
    expect(h.reduce((a, b) => a + b, 0)).toBe(4);
    expect(h[0]).toBe(1); // 5 → first decile
    expect(h[9]).toBe(2); // 90, 95 → last decile
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
