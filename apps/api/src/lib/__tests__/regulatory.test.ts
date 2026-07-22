import { describe, it, expect } from 'vitest';
import { deriveRegulatoryPosture } from '../regulatory.js';

describe('deriveRegulatoryPosture', () => {
  it('flags ESMA-registered tokens as the MiCA moat (strong)', () => {
    const p = deriveRegulatoryPosture({ esmaTokenId: '5493...ABC', region: 'eu', source: 'esma_main' });
    expect(p.isMicaRegistry).toBe(true);
    expect(p.tone).toBe('strong');
    expect(p.label).toMatch(/MiCA/);
    expect(p.facets.some((f) => f.label === 'ESMA / MiCA')).toBe(true);
    expect(p.facets.some((f) => f.label === 'ESMA token id')).toBe(true);
  });

  it('treats esma-sourced rows as MiCA-relevant even without a token id', () => {
    const p = deriveRegulatoryPosture({ source: 'esma_casp', region: 'eu' });
    expect(p.isMicaRegistry).toBe(true);
    expect(p.facets[0].value).toMatch(/CASP/);
  });

  it('classifies US-focused tokens as Howey-exposed (watch)', () => {
    const p = deriveRegulatoryPosture({ region: 'us', source: 'coingecko' });
    expect(p.isMicaRegistry).toBe(false);
    expect(p.tone).toBe('watch');
    expect(p.label).toMatch(/US/);
  });

  it('degrades to Unclassified for a bare catalog token', () => {
    const p = deriveRegulatoryPosture({ source: 'coinpaprika' });
    expect(p.label).toBe('Unclassified');
    expect(p.isMicaRegistry).toBe(false);
  });

  it('includes DTI and jurisdiction facets when present', () => {
    const p = deriveRegulatoryPosture({ dti: 'ABCD1234', jurisdiction: 'Liechtenstein', region: 'eu' });
    expect(p.facets.some((f) => f.label === 'DTI' && f.value === 'ABCD1234')).toBe(true);
    expect(p.facets.some((f) => f.label === 'Jurisdiction' && f.value === 'Liechtenstein')).toBe(true);
  });
});
