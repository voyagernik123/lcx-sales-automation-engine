import { Phase } from '@/types/ontology';

export const phases: { id: string; name: Phase; description: string }[] = [
  { id: 'PRE_LAUNCH', name: 'Pre-launch', description: 'Entity formation, federal MSB registration, and baseline BSA/AML/sanctions program — required before any state-specific activity.' },
  { id: 'PHASE_1', name: 'Phase 1', description: 'Months 0-6. Launch-friendly, zero-or-low-licensing states with non-custodial software or wallet-only products (e.g. Montana, Colorado, New Hampshire, Utah).' },
  { id: 'PHASE_2', name: 'Phase 2', description: 'Months 6-18. Medium-friction states; add fiat ramps and custodial wallets via third-party custody partners (e.g. Wyoming, Illinois, Pennsylvania, Washington).' },
  { id: 'PHASE_3', name: 'Phase 3', description: 'Months 18-36. High-friction states; full exchange capability and omnibus custody in strict regimes (Texas, Florida, Massachusetts, New York, California).' },
  { id: 'POST_CLARITY', name: 'Post-CLARITY', description: 'Contingent phase if the CLARITY Act is enacted: federal digital-commodity registration path, partial state MTL preemption for commodity trading, and DeFi safe harbors — but BitLicense, custody rules, and LCX Token classification remain unresolved.' },
];
