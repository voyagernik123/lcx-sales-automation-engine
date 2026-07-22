import { describe, it, expect } from 'vitest';
import { likelihood, estimativeConfidence, estimativePhrase } from './estimative.js';
import { admiraltyCode, newsReliability } from './provenance.js';

describe('estimative language (ICD-203)', () => {
  it('maps probabilities to the right likelihood terms', () => {
    expect(likelihood(0.02).term).toBe('almost no chance');
    expect(likelihood(0.1).term).toBe('very unlikely');
    expect(likelihood(0.3).term).toBe('unlikely');
    expect(likelihood(0.5).term).toBe('roughly even chance');
    expect(likelihood(0.72).term).toBe('likely');
    expect(likelihood(0.88).term).toBe('very likely');
    expect(likelihood(0.98).term).toBe('almost certain');
  });

  it('accepts either 0–1 fractions or 0–100 percentages', () => {
    expect(likelihood(0.72).pct).toBe(72);
    expect(likelihood(72).pct).toBe(72);
    expect(likelihood(72).term).toBe('likely');
  });

  it('clamps out-of-range input and handles non-finite', () => {
    expect(likelihood(150).pct).toBe(100); // >100 percent clamps down
    expect(likelihood(-1).pct).toBe(0); // negative fraction clamps to 0
    expect(likelihood(NaN).term).toBe('roughly even chance');
    expect(likelihood(1).pct).toBe(100); // exactly 1.0 → treated as a fraction
  });

  it('derives confidence orthogonally from sample size + quality', () => {
    expect(estimativeConfidence({ sampleSize: 5, meanConfidence: 80 })).toBe('high');
    expect(estimativeConfidence({ sampleSize: 1, meanConfidence: 50 })).toBe('moderate');
    expect(estimativeConfidence({ sampleSize: 0, meanConfidence: 0 })).toBe('low');
  });

  it('lets open assumptions knock confidence down', () => {
    expect(estimativeConfidence({ sampleSize: 5, meanConfidence: 80, openAssumptions: 2 })).toBe('moderate');
    expect(estimativeConfidence({ sampleSize: 1, meanConfidence: 40, openAssumptions: 3 })).toBe('low');
  });

  it('phrases likelihood + confidence together', () => {
    expect(estimativePhrase(0.72, 'moderate')).toBe('Likely (72%) · moderate confidence');
  });
});

describe('Admiralty grading helpers', () => {
  it('formats the full code', () => {
    expect(admiraltyCode('B', 2)).toBe('B2');
    expect(admiraltyCode('A', 1)).toBe('A1');
  });
  it('grades news outlets by provenance', () => {
    expect(newsReliability('sec')).toBe('A');
    expect(newsReliability('coindesk')).toBe('B');
    expect(newsReliability('gnews-listings')).toBe('D');
    expect(newsReliability('unknown-blog')).toBe('D');
  });
});
