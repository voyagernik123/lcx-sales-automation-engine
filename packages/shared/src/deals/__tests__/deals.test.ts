import { describe, it, expect } from 'vitest';
import { canTransition, generateProposal, defaultPackageValue, PACKAGES, STAGES, STAGE_LABELS } from '../index.js';

describe('Stage transition rules', () => {
  it('allows forward progression through stages', () => {
    expect(canTransition('not_started', 'contacted')).toBe(true);
    expect(canTransition('contacted', 'discovery')).toBe(true);
    expect(canTransition('discovery', 'proposal')).toBe(true);
    expect(canTransition('proposal', 'negotiating')).toBe(true);
  });

  it('allows jumping to won or lost from any non-terminal stage', () => {
    for (const stage of ['not_started', 'contacted', 'discovery', 'proposal', 'negotiating'] as const) {
      expect(canTransition(stage, 'won')).toBe(true);
      expect(canTransition(stage, 'lost')).toBe(true);
    }
  });

  it('blocks backwards transitions', () => {
    expect(canTransition('contacted', 'not_started')).toBe(false);
    expect(canTransition('discovery', 'contacted')).toBe(false);
    expect(canTransition('proposal', 'discovery')).toBe(false);
    expect(canTransition('negotiating', 'proposal')).toBe(false);
  });

  it('blocks transitions from terminal stages', () => {
    expect(canTransition('won', 'contacted')).toBe(false);
    expect(canTransition('won', 'lost')).toBe(false);
    expect(canTransition('lost', 'won')).toBe(false);
    expect(canTransition('lost', 'negotiating')).toBe(false);
  });

  it('has all 7 stages with labels', () => {
    expect(STAGES).toHaveLength(7);
    for (const s of STAGES) {
      expect(STAGE_LABELS[s]).toBeTruthy();
    }
  });
});

describe('Package defaults', () => {
  it('has 6 package types with correct base prices', () => {
    expect(PACKAGES).toHaveLength(6);
    const listing = PACKAGES.find(p => p.type === 'listing');
    expect(listing?.basePrice).toBe(2_000_000); // $20K
    const marketing = PACKAGES.find(p => p.type === 'marketing');
    expect(marketing?.basePrice).toBe(2_000_000);
    const liquidity = PACKAGES.find(p => p.type === 'liquidity');
    expect(liquidity?.basePrice).toBe(1_000_000); // $10K
  });

  it('defaultPackageValue returns correct price', () => {
    expect(defaultPackageValue('listing')).toBe(2_000_000);
    expect(defaultPackageValue('liquidity')).toBe(1_000_000);
    expect(defaultPackageValue('unknown')).toBe(0);
  });
});

describe('Proposal snapshot', () => {
  it('generates a complete proposal with correct fields', () => {
    const proposal = generateProposal({
      projectName: 'TestCoin',
      projectTicker: 'TST',
      packageType: 'listing',
      packageValue: 2_000_000,
      jurisdiction: 'EU',
      claimsUsed: ['LCX is regulated', 'MiCA compliant'],
    });

    expect(proposal.projectName).toBe('TestCoin');
    expect(proposal.projectTicker).toBe('TST');
    expect(proposal.packageType).toBe('listing');
    expect(proposal.packageValue).toBe(2_000_000);
    expect(proposal.jurisdiction).toBe('EU');
    expect(proposal.claimsUsed).toHaveLength(2);
    expect(proposal.inclusions.length).toBeGreaterThan(0);
    expect(proposal.disclaimer).toBeTruthy();
    expect(proposal.generatedAt).toBeTruthy();
    expect(proposal.validUntil).toBeTruthy();
  });

  it('sets 30-day validity from generation date', () => {
    const proposal = generateProposal({
      projectName: 'Test', projectTicker: null, packageType: 'listing', packageValue: 2_000_000, jurisdiction: null, claimsUsed: [],
    });
    const generated = new Date(proposal.generatedAt).getTime();
    const validUntil = new Date(proposal.validUntil).getTime();
    const diffDays = Math.round((validUntil - generated) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it('uses custom package inclusions', () => {
    const proposal = generateProposal({
      projectName: 'Test', projectTicker: null, packageType: 'custom', packageValue: 0, jurisdiction: null, claimsUsed: [],
    });
    expect(proposal.inclusions).toContain('Consultation');
    expect(proposal.inclusions).toContain('Custom integration');
  });
});
