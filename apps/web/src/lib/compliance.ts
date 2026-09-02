import { State, Status, Phase, ReadinessStatus } from '@/types/ontology';
import { states as allStates } from '@/data/states'; // direct, not the barrel — see Sidebar.tsx (P5 byte pre-step)

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

// The function that used to live here was a djb2 hash printed with a 'sha256_'
// prefix and a hardcoded 'bcf1c3' tail. It had zero callers; BriefGenerator.tsx
// carried its own identical copy. A fabricated cryptographic digest on a
// document whose default addressees are the board, state regulators and the SEC
// is the single worst thing this lane found, so both copies are gone and what
// follows is a real digest or an explicit refusal.

export interface BriefSelection {
  template: string;
  signatory: string;
  states: string[];
  products: string[];
}

/**
 * The exact bytes that get hashed. Versioned, because a digest is only
 * meaningful if the thing it covers is pinned: if the payload shape ever
 * changes, the version changes with it and old hexes stop matching by design.
 * State and product lists are sorted so that click order cannot alter the hex.
 */
export function briefSelectionPayload(selection: BriefSelection): string {
  return [
    'lcx-brief-selection/v1',
    `template=${selection.template}`,
    `signatory=${selection.signatory}`,
    `states=${[...selection.states].sort().join(',')}`,
    `products=${[...selection.products].sort().join(',')}`,
  ].join('\n');
}

export type DigestUnavailableCode = 'DIGEST_NO_WEBCRYPTO' | 'DIGEST_FAILED';

export type DigestResult =
  | { kind: 'digest'; algorithm: 'SHA-256'; hex: string }
  | { kind: 'unavailable'; code: DigestUnavailableCode; rule: string };

const DIGEST_RULES: Record<DigestUnavailableCode, string> = {
  DIGEST_NO_WEBCRYPTO:
    'SubtleCrypto is unavailable in this context (it requires a secure origin), so no digest can be computed. None is printed.',
  DIGEST_FAILED: 'The digest computation failed, so no digest is printed.',
};

/**
 * SHA-256 over the selection payload, or a refusal. Covers the SELECTION
 * PARAMETERS ONLY — the memo body is contentEditable, so no digest computed
 * here says anything about the words on the page, and the surface must say so.
 */
export async function computeSelectionDigest(selection: BriefSelection): Promise<DigestResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return { kind: 'unavailable', code: 'DIGEST_NO_WEBCRYPTO', rule: DIGEST_RULES.DIGEST_NO_WEBCRYPTO };
  }
  try {
    const bytes = new TextEncoder().encode(briefSelectionPayload(selection));
    const buffer = await subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return { kind: 'digest', algorithm: 'SHA-256', hex };
  } catch {
    return { kind: 'unavailable', code: 'DIGEST_FAILED', rule: DIGEST_RULES.DIGEST_FAILED };
  }
}
