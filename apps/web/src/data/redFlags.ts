export interface RemediationItem {
  id: string;
  label: string;
}

export interface RedFlag {
  id: string;
  title: string;
  risk: 'Critical' | 'High' | 'Medium';
  description: string;
  consequences: string;
  remediations: RemediationItem[];
  prob: number;
  sev: number;
}

export const redFlags: RedFlag[] = [
  {
    id: 'entity_status',
    title: 'Unverified U.S. Entity & MSB Status',
    risk: 'Critical',
    description: 'LCX USA may not have completed its Delaware entity formation alignment or finished its federal FinCEN MSB registration before processing test transactions.',
    consequences: 'Operating a money transmission service without proper federal registration is a federal felony under 18 U.S.C. § 1960, triggering immediate cease-and-desist orders.',
    prob: 5,
    sev: 5,
    remediations: [
      { id: 'delaware_cert', label: 'Obtain Delaware Certificate of Good Standing for LCX USA' },
      { id: 'fincen_cert', label: 'Verify FinCEN MSB Registration Number and file status' },
      { id: 'tax_id', label: 'Confirm active IRS Employer Identification Number (EIN)' }
    ]
  },
  {
    id: 'mica_conflation',
    title: 'European Compliance Conflation',
    risk: 'High',
    description: 'LCX official marketing materials imply that its Liechtenstein registration and EU MiCA passporting permit operations inside the U.S. market.',
    consequences: 'FTC and state Attorneys General treat false claims of domestic regulatory status as deceptive advertising, generating high litigation and consumer protection liability.',
    prob: 3,
    sev: 4,
    remediations: [
      { id: 'marketing_review', label: 'Audit LCX website and remove European passporting overlap claims' },
      { id: 'disclaimer_insert', label: 'Add prominent U.S. retail exclusion notice to non-U.S. product pages' }
    ]
  },
  {
    id: 'custody_control',
    title: 'Custody & Control Point Ambiguity',
    risk: 'Critical',
    description: 'Product definitions describe transactions as "non-custodial" (Option A), but architecture plans indicate LCX USA retains temporary control hooks over private keys or settlement assets.',
    consequences: 'If regulators determine LCX USA retains "control of virtual currency," it will be classified as a money transmitter in nearly all states, triggering retroactive licensing violations.',
    prob: 4,
    sev: 5,
    remediations: [
      { id: 'architecture_audit', label: 'Conduct a third-party code audit of wallet key-generation procedures' },
      { id: 'custody_legal', label: 'Secure a formal legal opinion outlining control definitions for Option A' }
    ]
  },
  {
    id: 'stablecoin_issuance',
    title: 'Unlicensed Stablecoin Issuance',
    risk: 'High',
    description: 'Internal documentation outlines a roadmap to issue an LCX-branded fiat-backed stablecoin for liquidity pool trading without first securing money transmitter licenses.',
    consequences: 'Stablecoin issuance is a top enforcement target for federal regulators (FinCEN/SEC) and state banks, carrying high risks of asset freezes.',
    prob: 3,
    sev: 4,
    remediations: [
      { id: 'reserve_audit', label: 'Draft a trust agreement structure for stablecoin fiat reserves' },
      { id: 'license_check', label: 'Defer stablecoin issuance until money transmitter coverage is active in major states' }
    ]
  },
  {
    id: 'lcx_token_securities',
    title: 'LCX Token Securities Classification',
    risk: 'Critical',
    description: 'Offering the LCX Utility Token to U.S. retail users without an SEC registration statement or a formal opinion letter classifying it as a digital commodity.',
    consequences: 'The SEC classifies tokens with exchange-utility discounts and staking rewards as investment contracts, creating registration violation risks and retail refund liabilities.',
    prob: 5,
    sev: 5,
    remediations: [
      { id: 'howey_opinion', label: 'Obtain a formal U.S. counsel legal opinion under the Howey Test' },
      { id: 'institutional_only', label: 'Restrict LCX Token listing to qualified institutional buyers (QIBs) initially' }
    ]
  },
  {
    id: 'banking_gap',
    title: 'Sponsorship Banking Deficit',
    risk: 'High',
    description: 'Attempting to launch fiat-enabled services (Phase 2) without finalized sponsor bank agreements for ACH and wire settlement pipelines.',
    consequences: 'Without sponsor banking connections, fiat deposits cannot clear, stalling all state money transmitter application approvals.',
    prob: 3,
    sev: 3,
    remediations: [
      { id: 'sponsor_bank', label: 'Finalize a clearing agreement with a U.S. chartered partner bank' },
      { id: 'fiat_escrow', label: 'Establish audited customer reserve escrow account policies' }
    ]
  },
  {
    id: 'ny_premature_entry',
    title: 'New York Premature Entry',
    risk: 'Critical',
    description: 'Allowing New York residents to access non-custodial or custodial trading interfaces before securing an approved New York DFS BitLicense.',
    consequences: 'NYDFS enforces the BitLicense regime aggressively. Premature access triggers multi-million dollar penalties and blocks future licensing approvals.',
    prob: 4,
    sev: 5,
    remediations: [
      { id: 'geofence_ny', label: 'Implement IP geofencing and strict KYC blockers for NY residents' },
      { id: 'institutional_opinion', label: 'Secure a legal memorandum outlining NY institutional-only safe harbors' }
    ]
  },
  {
    id: 'ftc_marketing_liability',
    title: 'Unregulated Compliance Claims',
    risk: 'Medium',
    description: 'Marketing claims labeling the exchange platform as "fully compliant" or "regulated" before all state Money Transmitter Licenses are approved.',
    consequences: 'FTC advertising enforcement and state attorney general suits for misrepresenting regulatory compliance status.',
    prob: 2,
    sev: 2,
    remediations: [
      { id: 'marketing_policy', label: 'Adopt a compliance approval review process for public announcements' },
      { id: 'disclosures_tos', label: 'Add risk disclosures directly to all marketing landing pages' }
    ]
  }
];
