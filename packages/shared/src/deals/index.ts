export interface PackageConfig {
  type: 'listing' | 'marketing' | 'liquidity' | 'dual' | 'emt' | 'custom';
  label: string;
  basePrice: number; // cents (USD whole dollars * 100)
  description: string;
  includes: string[];
}

export interface DealPackage {
  packages: PackageConfig[];
  standardPrice: number;
  premiumPrice: number;
  standardIncludes: string[];
  premiumIncludes: string[];
}

export const PACKAGES: PackageConfig[] = [
  { type: 'listing', label: 'Standard Listing', basePrice: 2_000_000, description: 'Standard token listing on LCX exchange', includes: ['Technical integration', 'Market surveillance', 'Compliance review', 'Trading pair setup'] },
  { type: 'marketing', label: 'Marketing Package', basePrice: 2_000_000, description: 'Promotional campaign support', includes: ['Social media campaign', 'Exchange announcement', 'Community AMA', 'Newsletter feature'] },
  { type: 'liquidity', label: 'Liquidity Support', basePrice: 1_000_000, description: 'Market making and liquidity provision', includes: ['Market maker introduction', 'Liquidity pool support', 'MM referral network'] },
  { type: 'dual', label: 'Dual Listing (EU+US)', basePrice: 5_000_000, description: 'Concurrent listing on LCX EU and US platforms', includes: ['EU compliance package', 'US pre/post CLARITY advisory', 'Dual market surveillance', 'Cross-border legal opinion'] },
  { type: 'emt', label: 'EMT Package', basePrice: 3_000_000, description: 'Electronic Money Token support', includes: ['EMT compliance framework', 'Custody solution', 'ESMA reporting', 'MiCA WP support'] },
  { type: 'custom', label: 'Custom Package', basePrice: 0, description: 'Tailored package', includes: ['Consultation', 'Custom integration'] },
];

export const DEAL_PACKAGE: DealPackage = {
  packages: PACKAGES,
  standardPrice: 5_000_000,
  premiumPrice: 10_000_000,
  standardIncludes: ['Standard listing', 'Marketing support', 'Liquidity introduction', 'Compliance review'],
  premiumIncludes: ['Priority listing', 'Full marketing campaign', 'Dedicated market maker', 'Legal opinion (MiCA WP)', 'MM referral network', 'Cross-border advisory'],
};

export const STAGES = ['not_started', 'contacted', 'discovery', 'proposal', 'negotiating', 'won', 'lost'] as const;
export type DealStage = typeof STAGES[number];

export const STAGE_LABELS: Record<DealStage, string> = {
  not_started: 'Not Started',
  contacted: 'Contacted',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

const STAGE_ORDER: Record<DealStage, number> = {
  not_started: 0, contacted: 1, discovery: 2, proposal: 3, negotiating: 4, won: 5, lost: 5,
};

export function canTransition(from: DealStage, to: DealStage): boolean {
  if (from === 'won' || from === 'lost') return false;
  if (to === 'won' || to === 'lost') return true;
  return STAGE_ORDER[to] > STAGE_ORDER[from];
}

export function defaultPackageValue(pkgType: string): number {
  const pkg = PACKAGES.find(p => p.type === pkgType);
  return pkg?.basePrice ?? 0;
}

export interface ProposalSnapshot {
  projectName: string;
  projectTicker: string | null;
  packageType: string;
  packageValue: number;
  jurisdiction: string | null;
  inclusions: string[];
  claimsUsed: string[];
  disclaimer: string;
  generatedAt: string;
  validUntil: string;
}

export function generateProposal(params: {
  projectName: string;
  projectTicker: string | null;
  packageType: string;
  packageValue: number;
  jurisdiction: string | null;
  claimsUsed: string[];
}): ProposalSnapshot {
  const pkg = PACKAGES.find(p => p.type === params.packageType);
  return {
    projectName: params.projectName,
    projectTicker: params.projectTicker,
    packageType: params.packageType,
    packageValue: params.packageValue,
    jurisdiction: params.jurisdiction,
    inclusions: pkg?.includes ?? [],
    claimsUsed: params.claimsUsed,
    disclaimer: 'This proposal is provided for informational purposes only and does not constitute a binding offer. All packages and pricing are subject to negotiation and final agreement. Regulatory compliance is subject to applicable laws.',
    generatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
