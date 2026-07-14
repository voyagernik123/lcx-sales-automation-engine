/**
 * The 5 people this internal tool is shared with. No per-person accounts in
 * the database yet (deals/tasks still attribute to a shared 'operator'
 * string) — this roster exists purely to (a) resolve a verified Google
 * login to a human identity, and (b) gate the domain so only @lcx.com
 * addresses are ever treated as authenticated, independent of whatever the
 * Google OAuth consent screen allows.
 */
export interface RosterOperator {
  id: string;
  name: string;
  email: string;
}

export const OPERATOR_ROSTER: RosterOperator[] = [
  { id: 'monty', name: 'Monty', email: 'monty@lcx.com' },
  { id: 'sam', name: 'Sam', email: 'sam@lcx.com' },
  { id: 'nik', name: 'Nik', email: 'nik@lcx.com' },
  { id: 'rida', name: 'Rida', email: 'rida@lcx.com' },
  { id: 'jatin', name: 'Jatin', email: 'jatin@lcx.com' },
];

export const ALLOWED_EMAIL_DOMAIN = 'lcx.com';

export function findOperatorByEmail(email: string): RosterOperator | null {
  const normalized = email.trim().toLowerCase();
  return OPERATOR_ROSTER.find(o => o.email.toLowerCase() === normalized) ?? null;
}

export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === ALLOWED_EMAIL_DOMAIN;
}

/** Display-name fallback for an @lcx.com address not yet in the named roster. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
