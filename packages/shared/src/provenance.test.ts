import { describe, expect, it } from 'vitest';
import { confidenceFrom, getSource, RELIABILITY_LABEL, SOURCES } from './provenance.js';

describe('provenance', () => {
  it('confidence is highest for A/1 and lowest for F/6', () => {
    expect(confidenceFrom('A', 1)).toBe(100);
    expect(confidenceFrom('F', 6)).toBe(0);
    expect(confidenceFrom('C', 3)).toBeGreaterThan(0);
    expect(confidenceFrom('C', 3)).toBeLessThan(100);
  });

  it('confidence is monotonic in reliability (better source ⇒ ≥ confidence)', () => {
    expect(confidenceFrom('A', 3)).toBeGreaterThan(confidenceFrom('C', 3));
    expect(confidenceFrom('C', 3)).toBeGreaterThan(confidenceFrom('E', 3));
  });

  it('confidence is monotonic in credibility (better claim ⇒ ≥ confidence)', () => {
    expect(confidenceFrom('B', 1)).toBeGreaterThan(confidenceFrom('B', 4));
  });

  it('staleness decays confidence, halving at the half-life', () => {
    const fresh = confidenceFrom('A', 1, 0, 30);
    const oneHalfLife = confidenceFrom('A', 1, 30, 30);
    const twoHalfLives = confidenceFrom('A', 1, 60, 30);
    expect(oneHalfLife).toBe(Math.round(fresh * 0.5));
    expect(twoHalfLives).toBeLessThan(oneHalfLife);
  });

  it('known sources resolve; unknown ids degrade to an F stub', () => {
    expect(getSource('defillama').label).toBe('DefiLlama');
    expect(getSource('defillama').defaultReliability).toBe('A');
    expect(getSource('who-knows').defaultReliability).toBe('F');
    expect(Object.keys(SOURCES)).toContain('github');
    expect(RELIABILITY_LABEL.A).toMatch(/reliable/i);
  });
});
