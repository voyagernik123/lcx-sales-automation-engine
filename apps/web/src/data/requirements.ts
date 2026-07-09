import { Requirement } from '@/types/ontology';

export const requirements: Requirement[] = [
  {
    id: 'MSB_REG', name: 'Federal MSB Registration', domain: 'Federal MSB / BSA baseline',
    description: 'FinCEN Money Services Business registration and a BSA/AML program. Applies regardless of state licensing outcome — the federal floor that never goes away.',
    trigger: 'Any money transmission or exchange activity touching U.S. persons.',
    status: 'Needs verification', phase: 'Pre-launch', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'Federal baseline registration remains strictly mandatory under all legislative scenarios.'
  },
  {
    id: 'STATE_MTL', name: 'State Money Transmission License', domain: 'State money transmission and consumer protection',
    description: 'Direct fiat/crypto transmission on behalf of users triggers state MTL in the large majority of states. Serving even a single customer in a license-required state triggers that state’s jurisdiction, irrespective of the company’s domicile.',
    trigger: 'Direct transmission or custodial exchange activity with a resident of the state.',
    status: 'Blocked', phase: 'Phase 2', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: true, preemptionDescription: 'Under CLARITY, CFTC-registered digital commodities bypass state-by-state MTL requirements for commodity trading (partial preemption).'
  },
  {
    id: 'NY_BITLICENSE_REQ', name: 'New York BitLicense', domain: 'State money transmission and consumer protection',
    description: 'Custody, exchange, or transmission touching New York residents requires a standalone BitLicense; state MTL alone is not sufficient.',
    trigger: 'Any virtual currency business activity involving a New York resident.',
    status: 'Blocked', phase: 'Phase 3', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'NYDFS BitLicense is retained as a special state regime; CLARITY does not fully preempt New York virtual currency laws.'
  },
  {
    id: 'CA_DFAL_REQ', name: 'California DFAL Registration', domain: 'State money transmission and consumer protection',
    description: 'Effective July 1, 2026, digital financial asset business activity with California residents requires DFPI registration under DFAL. Enforcement posture untested but expected to be strict.',
    trigger: 'Digital financial asset business activity involving a California resident.',
    status: 'Blocked', phase: 'Phase 3', sourceAuthority: 1, confidence: 'Medium',
    preemptedUnderClarity: true, preemptionDescription: 'Digital financial asset registrations like California DFAL may be partially preempted for digital commodities.'
  },
  {
    id: 'CUSTODY_QUALIFIED', name: 'Qualified Custodian / Trust Charter', domain: 'Custody and wallet architecture',
    description: 'Any custodial or omnibus-custody product requires either a third-party qualified custodian relationship or a trust charter (e.g. Wyoming SPDI). No launch without a verified U.S. qualified custodian or trust charter.',
    trigger: 'Custodial exchange, fiat ramp, or stablecoin payment product.',
    status: 'Blocked', phase: 'Phase 2', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'Qualified custody requirements remain high under CLARITY, with explicit federal digital custody rules.'
  },
  {
    id: 'BANKING_PARTNER', name: 'Fiat Banking Partner Relationship', domain: 'Payments rails and banking',
    description: 'Fiat on/off ramps require a partner bank willing to service a crypto business; de-risking by banks is a live risk factor, not merely a theoretical one.',
    trigger: 'Any product that moves fiat currency.',
    status: 'Needs verification', phase: 'Phase 1', sourceAuthority: 2, confidence: 'Medium',
    preemptedUnderClarity: false, preemptionDescription: 'Banking partner access is governed by federal banking regulators (OCC, FDIC) and is not directly preempted.'
  },
  {
    id: 'TOKEN_LEGAL_OPINION', name: 'Per-Asset Token Legal Opinion', domain: 'Asset listing and token classification',
    description: 'Each listed asset needs an independent Howey-test / commodity-vs-security legal opinion. Blanket "the whole portfolio is fine" conclusions are explicitly disallowed by the research methodology.',
    trigger: 'Listing any token, including LCX Token itself.',
    status: 'Needs verification', phase: 'Phase 2', sourceAuthority: 1, confidence: 'Medium',
    preemptedUnderClarity: true, preemptionDescription: 'CLARITY establishes a clearer statutory split between digital commodities and securities, simplifying the opinion process.'
  },
  {
    id: 'SANCTIONS_SCREENING', name: 'OFAC Sanctions Screening', domain: 'Surveillance, travel-rule, sanctions, and reporting',
    description: 'Sanctions screening and travel-rule-adjacent transaction monitoring controls, independent of state licensing status.',
    trigger: 'Any transaction processing activity.',
    status: 'Needs verification', phase: 'Pre-launch', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'Federal sanctions screening remains mandatory under all U.S. treasury guidelines.'
  },
  {
    id: 'SAR_PROGRAM', name: 'Suspicious Activity Report (SAR) Program', domain: 'Surveillance, travel-rule, sanctions, and reporting',
    description: 'SAR filing and escalation pathway required as part of the BSA/AML program.',
    trigger: 'MSB registration is finalized.',
    status: 'Needs verification', phase: 'Pre-launch', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'SAR reporting program is a BSA requirement and remains fully in force.'
  },
  {
    id: 'MARKETING_DISCLOSURE', name: 'Marketing Claims Discipline', domain: 'Marketing, disclosures, and complaint resolution',
    description: 'Must not claim LCX USA is "licensed," "compliant," or "approved" in any U.S. jurisdiction before that is actually true, and must not claim EU MiCA compliance provides U.S. permission.',
    trigger: 'Any public-facing marketing or disclosure content.',
    status: 'Needs verification', phase: 'Pre-launch', sourceAuthority: 1, confidence: 'High',
    preemptedUnderClarity: false, preemptionDescription: 'FTC and state AG advertising rules regarding truth-in-advertising remain fully active.'
  },
];
