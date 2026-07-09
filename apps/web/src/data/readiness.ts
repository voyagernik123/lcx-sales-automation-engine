import { ReadinessItem } from '@/types/ontology';

export const readinessItems: ReadinessItem[] = [
  // Corporate Setup Items
  {
    id: 'CORP_DE_C',
    category: 'Corporate',
    name: 'Delaware C-Corp Incorporation',
    description: 'Establish the primary U.S. operating legal entity (LCX USA Inc.).',
    status: 'Complete',
    gatingFor: 'U.S. Corporate Operations',
    notes: 'LCX USA Inc. has been successfully incorporated in the state of Delaware.'
  },
  {
    id: 'CORP_PARENT',
    category: 'Corporate',
    name: 'Intercompany licensing & IP Agreement',
    description: 'Draft the transfer pricing, trademark, and software licensing agreement between Liechtenstein parent (LCX AG) and LCX USA.',
    status: 'In Progress',
    gatingFor: 'Corporate Structure / Transfer Pricing',
    notes: 'Drafting in progress by European and U.S. counsel; critical for regulatory separation.'
  },
  {
    id: 'CORP_CFIUS',
    category: 'Corporate',
    name: 'CFIUS Passive Investor Filing',
    description: 'Prepare and submit the CFIUS voluntary filing or construct strict passive covenants (<10% voting, no board seats) to satisfy national security clearance.',
    status: 'Not Started',
    gatingFor: 'Foreign Parent Control Clearance',
    notes: 'Required due to foreign ownership (>25% voting/ownership control by LCX AG) of critical digital asset infrastructure.'
  },
  // Documents Gating Items
  {
    id: 'DOC_TOS',
    category: 'Documents',
    name: 'U.S.-Specific Terms of Service',
    description: 'Create a custom U.S. user agreement including class-action waivers and mandatory arbitration covenants. European MiCA-aligned terms cannot be reused.',
    status: 'In Progress',
    gatingFor: 'User Onboarding & Trading',
    notes: 'Under review by U.S. regulatory counsel. Mandatory before any customer onboarding.'
  },
  {
    id: 'DOC_PRIVACY',
    category: 'Documents',
    name: 'U.S. Privacy Policy',
    description: 'Draft a GLBA-compliant (Gramm-Leach-Bliley Act) privacy policy covering financial customer data protection and state overlays (CCPA/CPRA).',
    status: 'In Progress',
    gatingFor: 'User Onboarding & Trading',
    notes: 'Drafting concurrent with Terms of Service.'
  },
  {
    id: 'DOC_RISK',
    category: 'Documents',
    name: 'Consumer Risk Disclosures',
    description: 'Draft prominent disclosures explaining volatility, lack of FDIC/SIPC insurance, and state-specific disclosure mandates (e.g., NY/TX consumer notices).',
    status: 'Counsel Review',
    gatingFor: 'Asset Listings & User Interface',
    notes: 'Draft completed; currently undergoing counsel review for specific state money transmitter disclosures.'
  },
  {
    id: 'DOC_SAR',
    category: 'Documents',
    name: 'Suspicious Activity Report (SAR) Filing SOP',
    description: 'Establish standard operating procedures for the detection, internal escalation, and FinCEN filing of SARs within the 30-day statutory window.',
    status: 'Not Started',
    gatingFor: 'Federal BSA/AML Compliance Program',
    notes: 'Required as part of the federal baseline compliance stack.'
  },
  {
    id: 'DOC_COMPLAINT',
    category: 'Documents',
    name: 'State Complaint Resolution Flow',
    description: 'Define complaint handling pathways and consumer hotline disclosures required by state banking regulators (e.g., Texas and Florida consumer notice pages).',
    status: 'In Progress',
    gatingFor: 'State Money Transmitter Licenses (MTLs)',
    notes: 'Drafting procedures to integrate with customer support software.'
  },
  // Surveillance & Controls Stack
  {
    id: 'SURV_OFAC',
    category: 'Surveillance',
    name: 'OFAC Real-Time Sanctions Screening',
    description: 'Integrate transaction-blocking software to screen users and addresses against OFAC Specially Designated Nationals (SDNs) lists in real-time.',
    status: 'Counsel Review',
    gatingFor: 'Transaction Processing',
    notes: 'Vendor selection completed (Elliptic/Chainalysis); API integration under review.'
  },
  {
    id: 'SURV_TRUST',
    category: 'Surveillance',
    name: 'TRUST Network Travel Rule Integration',
    description: 'Integrate the TRUST (Travel Rule Universal Safe Harbor) protocol to securely transmit sender/receiver details for transactions >= $3,000.',
    status: 'Not Started',
    gatingFor: 'Custodial Asset Transmission',
    notes: 'Requires active membership approval and technical integration with TRUST nodes.'
  },
  {
    id: 'SURV_CCO',
    category: 'Surveillance',
    name: 'U.S.-Resident Chief Compliance Officer (CCO)',
    description: 'Appoint a dedicated compliance officer with physical residency in the United States, as required for federal FinCEN registration and state bank license applications.',
    status: 'In Progress',
    gatingFor: 'FinCEN Registration & State Licensing',
    notes: 'Recruitment is active; local residency is a hard regulatory gate.'
  }
];
