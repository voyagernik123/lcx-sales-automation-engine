import type { DraftOutput, DraftInput } from './types.js';

const DEAL_CLOSING_PHRASES = [
  'sign up',
  'create an account',
  'register now',
  'open an account',
  'start trading',
  'make a deposit',
  'start your free trial',
  'buy {{ticker}}',
  'purchase {{ticker}}',
];

const INVENTED_LICENSE_PHRASES = [
  /SEC[- ]registered/i,
  /SEC[- ]approved/i,
  /SEC[- ]licensed/i,
  /FINRA[- ]approved/i,
  /FINRA[- ]registered\b/i,
  /MSB[- ]registered\b/i,
  /NYDFS[- ]licensed/i,
  /federally[- ]insured/i,
  /FDIC[- ]insured/i,
];

export interface RuleViolation {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: RuleViolation[];
}

/** LinkedIn caps connection-request notes at 300 chars (after variable fill). */
export const LINKEDIN_CONNECT_NOTE_MAX = 300;

export function validateConnectionNote(body: string): ValidationResult {
  const violations: RuleViolation[] = [];
  if (body.length > LINKEDIN_CONNECT_NOTE_MAX) {
    violations.push({
      rule: 'connect_note_length',
      severity: 'error',
      message: `Connection note is ${body.length} chars — LinkedIn caps at ${LINKEDIN_CONNECT_NOTE_MAX}`,
    });
  }
  return { valid: violations.length === 0, violations };
}

export function validateDraftOutput(
  draft: DraftOutput,
  input: DraftInput,
): ValidationResult {
  const violations: RuleViolation[] = [];

  // Rule 1: Tag person - contact name must be in body
  if (!draft.body.includes(input.contactName)) {
    violations.push({
      rule: 'tag_person',
      severity: 'error',
      message: `Draft must mention the contact (${input.contactName})`,
    });
  }

  // Rule 2: 1 project-specific hook - must mention project name
  if (!draft.body.includes(input.projectName)) {
    violations.push({
      rule: 'project_hook',
      severity: 'error',
      message: `Draft must include a project-specific hook mentioning ${input.projectName}`,
    });
  }

  // Rule 3: 1 question - body must contain at least one question
  if (!draft.body.includes('?')) {
    violations.push({
      rule: 'has_question',
      severity: 'error',
      message: 'Draft must include at least one question to drive conversation',
    });
  }

  // Rule 4: 1 benefit claim used
  if (!draft.claimsUsed || draft.claimsUsed.length === 0) {
    violations.push({
      rule: 'has_benefit',
      severity: 'error',
      message: 'Draft must include at least one approved benefit claim',
    });
  }

  // Rule 5: Sell next conversation, not full package
  for (const phrase of DEAL_CLOSING_PHRASES) {
    const filled = phrase.replace('{{ticker}}', input.projectTicker ?? '');
    if (draft.body.toLowerCase().includes(filled.toLowerCase())) {
      violations.push({
        rule: 'no_deal_closing',
        severity: 'error',
        message: `Draft contains deal-closing language: "${phrase}"`,
      });
    }
  }

  // Rule 6: No invented licenses
  for (const regex of INVENTED_LICENSE_PHRASES) {
    if (regex.test(draft.body)) {
      violations.push({
        rule: 'no_invented_licenses',
        severity: 'error',
        message: `Draft may reference a license LCX does not hold`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function validateClaimsUsed(claimsUsed: string[]): ValidationResult {
  const violations: RuleViolation[] = [];
  for (const id of claimsUsed) {
    if (!id.startsWith('eu-') && !id.startsWith('mica-') && !id.startsWith('us-') && !id.startsWith('listing-') && !id.startsWith('liquidity-') && !id.startsWith('marketing-')) {
      violations.push({
        rule: 'unknown_claim',
        severity: 'error',
        message: `Claim "${id}" is not from the approved library`,
      });
    }
  }
  return { valid: violations.length === 0, violations };
}
