import { Competitor } from './competitors';

export type Status = 'Ready' | 'Conditional' | 'Blocked' | 'Needs verification' | 'Deferred';
export type Phase = 'Pre-launch' | 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Post-CLARITY';
export type SourceAuthority = 1 | 2 | 3 | 4 | 5;
export type Confidence = 'High' | 'Medium' | 'Low';
export type VerificationStatus = 'Verified' | 'Inferred' | 'Uncertain';

export type Tier = 'Tier 1 - Maximum friction' | 'Tier 2 - High friction' | 'Tier 3 - Medium friction' | 'Tier 4 - Lower friction' | 'Unresearched';

export interface State {
  id: string; name: string; abbreviation: string;
  regimeType: 'Money transmitter' | 'Virtual currency' | 'Hybrid' | 'No general MTL' | 'Special purpose' | 'Unknown';
  status: Status; phase: Phase; priority: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unassessed';
  tier: Tier;
  primaryPainPoint?: string;
  estCost?: string;
  estTimeline?: string;
  regulator?: string;
  notes: string; sourceAuthority: SourceAuthority; confidence: Confidence;
  minNetWorth?: string;
  suretyBond?: string;
  sandboxAvailable: boolean;
  sandboxNotes?: string;
  nmlsRequired: boolean;
}
export interface License {
  id: string; name: string; abbreviation: string; description: string;
  issuingAuthority: string; requirements: string[]; exemptions: string[]; sourceAuthority: SourceAuthority;
}
export type Domain =
  | 'Entity and corporate setup'
  | 'Federal MSB / BSA baseline'
  | 'State money transmission and consumer protection'
  | 'Custody and wallet architecture'
  | 'Payments rails and banking'
  | 'Asset listing and token classification'
  | 'Surveillance, travel-rule, sanctions, and reporting'
  | 'Product and customer operations'
  | 'Marketing, disclosures, and complaint resolution';

export interface Requirement {
  id: string; name: string; description: string; domain: Domain;
  trigger: string; status: Status; phase: Phase; sourceAuthority: SourceAuthority; confidence: Confidence;
  preemptedUnderClarity?: boolean;
  preemptionDescription?: string;
}
export interface Product {
  id: string; name: string; description: string;
  category: 'Exchange' | 'Custody' | 'Fiat' | 'Stablecoin' | 'DeFi' | 'Token';
  status: Status; phase: Phase; requirements: string[]; risks: string[]; sourceAuthority: SourceAuthority;
  howeyScore?: number;
  howeyAnalysis?: {
    investmentOfMoney: string;
    commonEnterprise: string;
    profitExpectation: string;
    effortsOfOthers: string;
  };
}
export interface DomainMeta { id: string; name: Domain; description: string; }
export interface PhaseMeta { id: string; name: Phase; description: string; }

export type ReadinessStatus = 'Not Started' | 'In Progress' | 'Counsel Review' | 'Complete';
export interface ReadinessItem {
  id: string;
  category: 'Corporate' | 'Documents' | 'Surveillance';
  name: string;
  description: string;
  status: ReadinessStatus;
  gatingFor: string;
  notes: string;
}


export interface RegulatoryNode {
  id: string; type: 'state' | 'license' | 'requirement' | 'product' | 'domain' | 'phase' | 'competitor';
  label: string; status: Status; phase: Phase;
  data: State | License | Requirement | Product | DomainMeta | PhaseMeta | Competitor;
  connections: string[];
}
export interface OntologyGraph {
  nodes: RegulatoryNode[];
  edges: Array<{ id: string; source: string; target: string; type: 'requires' | 'triggers' | 'governs' | 'classifies' | 'enables' | 'competes_in' | 'holds_license' | 'offers_product' | 'satisfies_requirement'; label?: string }>;
}
export interface ScenarioInput { nodeId: string; attribute: 'status' | 'phase'; value: Status | Phase; }
export interface ScenarioOutput { nodeId: string; attribute: 'status' | 'phase'; currentValue: Status | Phase; projectedValue: Status | Phase; reason: string; }
export interface Scenario { id: string; name: string; description: string; inputs: ScenarioInput[]; outputs: ScenarioOutput[]; }
