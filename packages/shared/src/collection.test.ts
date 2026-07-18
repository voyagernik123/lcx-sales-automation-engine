import { describe, expect, it } from 'vitest';
import { CONNECTORS, getConnector, isStale } from './collection.js';

describe('collection registry', () => {
  it('defines free connectors with a freshness SLA each', () => {
    expect(CONNECTORS.length).toBeGreaterThanOrEqual(3);
    for (const c of CONNECTORS) {
      expect(c.freshnessDays).toBeGreaterThan(0);
      expect(c.source).toBeTruthy();
    }
    expect(getConnector('defillama')?.source).toBe('defillama');
    expect(getConnector('coinpaprika_detail')?.source).toBe('coinpaprika');
  });

  it('never-collected data is always stale', () => {
    expect(isStale(null, 7)).toBe(true);
    expect(isStale(undefined, 7)).toBe(true);
  });

  it('fresh vs stale respects the SLA window', () => {
    const now = Date.parse('2026-07-18T00:00:00Z');
    const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString();
    const tenDaysAgo = new Date(now - 10 * 86_400_000).toISOString();
    expect(isStale(twoDaysAgo, 7, now)).toBe(false); // within SLA
    expect(isStale(tenDaysAgo, 7, now)).toBe(true); // past SLA
  });
});
