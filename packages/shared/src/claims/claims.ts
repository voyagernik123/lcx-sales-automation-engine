import type { Claim, ClaimLibrarySnapshot, ClaimCategory, Jurisdiction } from './types.js';

// Admin disclaimer — not legal advice
export const CLAIM_DISCLAIMER = 'This content is provided for informational purposes only and does not constitute legal advice. All claims are subject to the terms of service and applicable regulations.';

const CLAIMS: Claim[] = [
  // ── EU Access ──
  {
    id: 'eu-access-001',
    category: 'eu_access',
    text: 'LCX holds a registered securities exchange license in Liechtenstein, providing a regulated pathway for EU-wide access under MiCA\'s passporting framework.',
    jurisdiction: ['eu', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'eu-access-002',
    category: 'eu_access',
    text: 'As a MiCA-compliant exchange, LCX can service clients across all EU member states under a unified regulatory framework.',
    jurisdiction: ['eu', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'eu-access-003',
    category: 'eu_access',
    text: 'LCX provides institutional-grade custody and trading for digital assets through our regulated EU infrastructure, in compliance with applicable ESMA guidelines.',
    jurisdiction: ['eu'],
    riskLevel: 'medium',
    requiresHumanReview: true,
    version: 1,
    active: true,
  },

  // ── MiCA Awareness ──
  {
    id: 'mica-001',
    category: 'mica_awareness',
    text: 'MiCA establishes a comprehensive regulatory framework for crypto-assets across the EU, providing clarity for issuers and trading platforms operating in the region.',
    jurisdiction: ['eu', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'mica-002',
    category: 'mica_awareness',
    text: 'Under MiCA, LCX can passport its services across EU member states from its Liechtenstein base, ensuring broad market access for listed tokens.',
    jurisdiction: ['eu', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'mica-003',
    category: 'mica_awareness',
    text: 'MiCA\'s regulatory framework creates new opportunities for compliant token issuers seeking structured access to the EU market through regulated exchanges.',
    jurisdiction: ['eu', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },

  // ── US Path ──
  {
    id: 'us-path-001',
    category: 'us_path',
    text: 'LCX provides US investors access to regulated digital asset trading through our FINRA-affiliated broker-dealer infrastructure.',
    jurisdiction: ['us', 'global'],
    riskLevel: 'medium',
    requiresHumanReview: true,
    version: 1,
    active: true,
  },
  {
    id: 'us-path-002',
    category: 'us_path',
    text: 'LCX operates within the US regulatory framework and provides qualifying digital asset projects with compliant market access.',
    jurisdiction: ['us'],
    riskLevel: 'medium',
    requiresHumanReview: true,
    version: 1,
    active: true,
  },
  {
    id: 'us-path-003',
    category: 'us_path',
    text: 'The CLARITY Act establishes a defined regulatory perimeter for digital assets, enabling regulated exchanges like LCX to serve US clients with greater legal certainty.',
    jurisdiction: ['us', 'global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'us-path-004',
    category: 'us_path',
    text: 'With CLARITY enacted, LCX can offer expanded services to US-based token projects under a clear compliance framework.',
    jurisdiction: ['us'],
    riskLevel: 'medium',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },

  // ── Listing Package ──
  {
    id: 'listing-001',
    category: 'listing_package',
    text: 'LCX\'s listing package includes full due diligence, regulatory review, and seamless market integration across the exchange platform.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'listing-002',
    category: 'listing_package',
    text: 'Listed tokens benefit from LCX\'s institutional-grade infrastructure, including order book matching, cold storage custody, and fiat ramp support.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'listing-003',
    category: 'listing_package',
    text: 'LCX provides comprehensive launch support for new listings, including coordinated announcements, exchange notifications, and market integration.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },

  // ── Liquidity ──
  {
    id: 'liquidity-001',
    category: 'liquidity',
    text: 'LCX provides deep order book liquidity through a network of institutional market makers, reducing slippage for all traders.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'liquidity-002',
    category: 'liquidity',
    text: 'LCX\'s liquidity program ensures competitive spreads and sufficient depth for both retail and institutional trading volumes.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'liquidity-003',
    category: 'liquidity',
    text: 'Market-making partnerships at LCX provide ongoing liquidity management with dedicated support for token project teams.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },

  // ── Marketing ──
  {
    id: 'marketing-001',
    category: 'marketing',
    text: 'LCX offers strategic listing marketing support including homepage features, newsletter spotlights, and social media amplification.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'marketing-002',
    category: 'marketing',
    text: 'Listed tokens receive launch coordination support including press releases, exchange announcements, and community engagement.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
  {
    id: 'marketing-003',
    category: 'marketing',
    text: 'LCX\'s marketing team works with projects on go-to-market strategy, coordinating announcements for maximum visibility.',
    jurisdiction: ['global'],
    riskLevel: 'low',
    requiresHumanReview: false,
    version: 1,
    active: true,
  },
];

export function getClaims(): Claim[] {
  return CLAIMS.filter(c => c.active);
}

export function getClaimsByCategory(category: ClaimCategory): Claim[] {
  return getClaims().filter(c => c.category === category);
}

export function getClaimById(id: string): Claim | undefined {
  return getClaims().find(c => c.id === id);
}

export function getClaimsByJurisdiction(jurisdiction: Jurisdiction): Claim[] {
  return getClaims().filter(c => c.jurisdiction.includes(jurisdiction));
}

export function getClaimsForJurisdictionAndCategory(
  jurisdiction: Jurisdiction,
  category: ClaimCategory | undefined,
): Claim[] {
  return getClaims().filter(
    c => c.jurisdiction.includes(jurisdiction)
      && (!category || c.category === category),
  );
}

export function getClaimLibrarySnapshot(): ClaimLibrarySnapshot {
  return {
    version: 1,
    claims: getClaims(),
    updatedAt: '2026-07-09T00:00:00Z',
  };
}

export function claimRequiresReview(claimId: string): boolean {
  const claim = getClaimById(claimId);
  return claim ? claim.requiresHumanReview : true;
}
