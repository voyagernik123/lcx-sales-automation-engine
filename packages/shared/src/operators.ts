/**
 * The desk roster — the people this internal tool is shared with.
 *
 * Email is the sign-in credential. This is a deliberately lightweight team
 * gate, NOT single-sign-on: entering your own LCX address on any browser
 * authorizes you there, and the API accepts that same address as your bearer
 * token. The list lives here in @lcx/shared so the web front door and the API
 * allowlist can never drift apart — one edit updates both.
 *
 * (Stronger auth — Google SSO with JWT verification — exists on the
 * feature/google-auth branch if per-person passwords/OAuth are ever needed.)
 */

export type TeamRole = 'viewer' | 'operator' | 'approver';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Desk leads (approver) sign off deals/invoices; others operate. */
  role: TeamRole;
}

export const TEAM: readonly TeamMember[] = [
  { id: 'monty', name: 'Monty', email: 'monty@lcx.com', role: 'approver' },
  { id: 'sam', name: 'Sam', email: 'sam@lcx.com', role: 'operator' },
  { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'approver' },
  { id: 'rida', name: 'Rida', email: 'rida@lcx.com', role: 'operator' },
  { id: 'jatin', name: 'Jatin', email: 'jatin@lcx.com', role: 'operator' },
];

/** Lowercase + trim, so "  Nik@LCX.com " matches "nik@lcx.com". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The team member who owns this email, or null if it's not on the desk. */
export function findMemberByEmail(email: string): TeamMember | null {
  const e = normalizeEmail(email);
  return TEAM.find((m) => m.email === e) ?? null;
}

/** Is this email allowed on the desk? */
export function isAllowedEmail(email: string): boolean {
  return findMemberByEmail(email) !== null;
}

/**
 * The team member with this id, or null. Used wherever ownership is stored by
 * id (deals.owner, monitors.owner, pirs.owner, decisions.owner) so the desk can
 * resolve a lane back to a person — and validate an assignment target. The
 * shared 'operator' catch-all (not a real person) resolves to null.
 */
export function findMemberById(id: string): TeamMember | null {
  return TEAM.find((m) => m.id === id) ?? null;
}

/** Display name for an owner id — the person's name, or the id itself. */
export function ownerLabel(id: string | null | undefined): string {
  if (!id) return 'Unassigned';
  if (id === 'operator') return 'Desk (shared)';
  return findMemberById(id)?.name ?? id;
}
