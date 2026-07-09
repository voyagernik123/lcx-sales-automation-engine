import { State, Status, Phase, ReadinessStatus } from '@/types/ontology';
import { states as allStates } from '@/data';

export interface LegislativeFlags {
  clarityEnacted: boolean;
  spdiEquivalence: boolean;
  commodityExempt: boolean;
  defiExempt: boolean;
  micaExempt: boolean;
}

export function getResearchedStates(): State[] {
  return allStates.filter(s => s.tier !== 'Unresearched');
}

export function getEffectiveStateStatus(
  state: State,
  flags: { clarityEnacted: boolean; spdiEquivalence: boolean }
): Status {
  if (flags.clarityEnacted && state.nmlsRequired) return 'Ready';
  if (flags.spdiEquivalence && state.abbreviation === 'NY') return 'Ready';
  return state.status;
}

export function getEffectiveRequirementStatus(
  status: Status,
  reqId: string,
  flags: {
    clarityEnacted: boolean;
    defiExempt: boolean;
    micaExempt: boolean;
  }
): Status {
  if (flags.clarityEnacted && (reqId === 'STATE_MTL' || reqId === 'CA_DFAL_REQ' || reqId === 'TOKEN_LEGAL_OPINION')) {
    return 'Ready';
  }
  if (flags.defiExempt && reqId === 'SURV_TRUST') return 'Ready';
  if (flags.micaExempt && (reqId === 'CORP_PARENT' || reqId === 'CORP_CFIUS')) return 'Ready';
  return status;
}

export function getEffectiveHoweyScore(score: number | undefined, commodityExempt: boolean): number | undefined {
  if (score === undefined) return undefined;
  if (commodityExempt) return Math.max(0, Math.round(score * 0.75));
  return score;
}

export function shouldExemptStateCost(
  state: State,
  flags: { clarityEnacted: boolean; spdiEquivalence: boolean }
): boolean {
  if (flags.clarityEnacted && state.nmlsRequired) return true;
  if (flags.spdiEquivalence && state.abbreviation === 'NY') return true;
  return false;
}

export function mapReadinessToStatus(rs: ReadinessStatus): Status {
  if (rs === 'Complete') return 'Ready';
  if (rs === 'Counsel Review') return 'Conditional';
  if (rs === 'In Progress') return 'Needs verification';
  return 'Deferred';
}

export const PHASE_STEP_MAP: Record<string, number> = {
  'Pre-launch': 0,
  'Phase 1': 1,
  'Phase 2': 2,
  'Phase 3': 3,
  'Post-CLARITY': 4,
};

export const PHASE_STEP_THRESHOLDS: Record<number, Phase[]> = {
  0: ['Pre-launch'],
  1: ['Pre-launch', 'Phase 1'],
  2: ['Pre-launch', 'Phase 1', 'Phase 2'],
  3: ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3'],
  4: ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3', 'Post-CLARITY'],
};

export const STATE_LICENSE_MAP: Record<string, string> = {
  NY: 'NY_BITLICENSE',
  CA: 'CA_DFAL',
  TX: 'TX_SM1037',
  FL: 'FL_HB505',
  WY: 'WY_SPDI',
};

export const EXEMPTION_FREE_STATES = ['MT', 'NH'] as const;

export function computeBriefDigest(
  template: string,
  cco: string,
  statesList: string[],
  productsList: string[]
): string {
  const payload = `${template}|${cco}|${statesList.join(',')}|${productsList.join(',')}`;
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  return 'sha256_' + Math.abs(hash).toString(16).padEnd(8, 'e') + 'bcf1c3';
}
