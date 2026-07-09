import { License } from '@/types/ontology';

// Grounded in the LCX USA state-by-state licensing matrix and token classification research.
export const licenses: License[] = [
  {
    id: 'MTL', name: 'State Money Transmission License', abbreviation: 'MTL',
    description: 'Baseline state-level license required for direct fiat/crypto transmission on behalf of users in most U.S. states (Montana and New Hampshire are the notable exceptions identified so far).',
    issuingAuthority: 'State banking/financial regulator (varies by state)',
    requirements: ['NMLS application', 'Surety bond', 'Minimum net worth', 'AML/BSA program', 'Business plan and financial statements'],
    exemptions: ['Non-custodial software/API-only models (state-dependent, unverified)', 'Montana (no general MTL)'],
    sourceAuthority: 1,
  },
  {
    id: 'NY_BITLICENSE', name: 'New York BitLicense', abbreviation: 'BitLicense',
    description: 'Heightened virtual currency license under 23 NYCRR Part 200. Required for any virtual currency custody, exchange, or transmission activity touching New York residents.',
    issuingAuthority: 'NYDFS',
    requirements: ['NYDFS application', 'Organizational documents', 'AML/KYC policies', 'Cybersecurity plan', '24/7 surveillance', 'Dedicated CCO/COO', '$100K+ capital', '$500K net worth minimum'],
    exemptions: [],
    sourceAuthority: 1,
  },
  {
    id: 'CA_DFAL', name: 'California Digital Financial Assets Law', abbreviation: 'DFAL',
    description: 'New California licensing regime (CA Fin Code §22100) effective July 1, 2026 covering any digital financial asset business activity with CA residents. Untested; DFPI enforcement posture expected to mirror New York.',
    issuingAuthority: 'DFPI',
    requirements: ['DFPI/NMLS application', 'Business plan', 'Financial statements', 'Compliance programs', 'Monthly compliance reporting', 'Recordkeeping', 'AML/KYC'],
    exemptions: [],
    sourceAuthority: 1,
  },
  {
    id: 'WY_SPDI', name: 'Wyoming Special Purpose Depository Institution Charter', abbreviation: 'SPDI',
    description: 'Full bank-style charter for custodial or fiduciary digital asset services. No FDIC insurance; requires Federal Reserve master account access. Kraken Financial is the cited precedent.',
    issuingAuthority: 'WY DFS',
    requirements: ['WYDFS application', 'Business plan', 'Capital plan', 'Community benefit plan', 'Banking-level controls'],
    exemptions: [],
    sourceAuthority: 1,
  },
  {
    id: 'TX_SM1037', name: 'Texas MTL + Supervisory Memorandum 1037', abbreviation: 'SM 1037',
    description: 'Texas MTL plus SM 1037 (2021), which treats stablecoins as "money" and requires a detailed crypto compliance program. TX-DOB brought an active enforcement action (Bitstop Futures, March 2026).',
    issuingAuthority: 'TX-DOB',
    requirements: ['NMLS application', 'AML program', 'Financial statements', 'Virtual-currency-specific AML controls', 'Supervision program', '$500K net worth + $500K surety bond'],
    exemptions: [],
    sourceAuthority: 1,
  },
  {
    id: 'FL_HB505', name: 'Florida MTL + HB 505 Kiosk Amendment', abbreviation: 'HB 505',
    description: 'Florida MTL plus HB 505 (2026), which adds kiosk-operator-specific licensing requirements effective July 1, 2026. A proposed amendment would extend MTL to exchange-only activity.',
    issuingAuthority: 'OFR',
    requirements: ['NMLS/OFR application', 'BSA/AML program', 'Business plan', 'Enhanced kiosk controls', '$500K net worth + $500K surety bond'],
    exemptions: [],
    sourceAuthority: 1,
  },
];
