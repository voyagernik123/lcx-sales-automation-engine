import { Domain } from '@/types/ontology';

// The nine research domains the coordinator agent was instructed to organize findings around.
export const domains: { id: string; name: Domain; description: string }[] = [
  { id: 'ENTITY', name: 'Entity and corporate setup', description: 'U.S. entity formation and structuring — Delaware C-corp, Wyoming LLC, or Montana LLC options; foreign qualification triggers.' },
  { id: 'FEDERAL_MSB', name: 'Federal MSB / BSA baseline', description: 'FinCEN Money Services Business registration, BSA/AML program, and the federal floor that applies regardless of state licensing status.' },
  { id: 'STATE_MT', name: 'State money transmission and consumer protection', description: 'State-by-state money transmitter licensing, bonding, net worth, and consumer disclosure requirements.' },
  { id: 'CUSTODY', name: 'Custody and wallet architecture', description: 'Custody model selection (non-custodial, segregated, omnibus) and qualified custodian / trust charter requirements.' },
  { id: 'PAYMENTS', name: 'Payments rails and banking', description: 'Fiat on/off ramp banking relationships, partner bank risk, and de-risking exposure.' },
  { id: 'ASSET_LISTING', name: 'Asset listing and token classification', description: 'Howey-test analysis, SEC vs. CFTC jurisdiction, and self-listing conflict-of-interest disclosure for LCX Token and other listed assets.' },
  { id: 'SURVEILLANCE', name: 'Surveillance, travel-rule, sanctions, and reporting', description: 'Transaction monitoring, travel-rule-adjacent controls, OFAC sanctions screening, and SAR filing.' },
  { id: 'PRODUCT_OPS', name: 'Product and customer operations', description: 'Onboarding/KYC workflows, support escalation tiers, and record retention for exam response.' },
  { id: 'MARKETING', name: 'Marketing, disclosures, and complaint resolution', description: 'Advertising claims discipline (e.g. no "licensed/compliant/approved" claims) and complaint-handling chains.' },
];
