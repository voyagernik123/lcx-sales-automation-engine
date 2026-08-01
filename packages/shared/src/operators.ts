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

/**
 * Is this email allowed on the desk?
 *
 * NOTE THE SCOPE, because it has been misread: this is a ROSTER check, not a
 * domain check. Only the three people in TEAM pass. For the second-tier
 * sign-in — any colleague's address plus SECONDARY_PASSCODE — use
 * `isLcxDomainEmail` below, which is the domain gate.
 */
export function isAllowedEmail(email: string): boolean {
  return findMemberByEmail(email) !== null;
}

/** The one domain the second tier will admit. */
export const LCX_EMAIL_DOMAIN = 'lcx.com';

/**
 * Exactly one @, and the part after it is exactly `lcx.com`.
 *
 * WHAT THIS DELIBERATELY REFUSES, because a loose check here is the difference
 * between "any colleague" and "anyone on the internet":
 *   - `nik@lcx.com.evil.example` — the classic suffix trick; an `endsWith` on
 *     'lcx.com' would let it through, an `includes` even more so.
 *   - `nik@sub.lcx.com` — a subdomain is not the domain, and whoever controls a
 *     subdomain's mail is not necessarily LCX IT.
 *   - `a@lcx.com@b.com`, `nik@LCX.com ` (handled by normalizeEmail), and an empty
 *     local part.
 */
export function isLcxDomainEmail(email: string): boolean {
  const e = normalizeEmail(email);
  const at = e.indexOf('@');
  if (at <= 0) return false;                       // no @, or empty local part
  if (e.indexOf('@', at + 1) !== -1) return false; // a second @
  return e.slice(at + 1) === LCX_EMAIL_DOMAIN;     // exact, not endsWith
}

/**
 * People who have LEFT. Refused on the second tier even though their address
 * still matches the domain.
 *
 * WHY THIS LIST HAS TO EXIST. Migration `0042_lcx_os_access.sql:69-70` does
 * `DELETE FROM entitlements WHERE member_id IN ('rida','jatin')` — deliberately
 * stripping residual access when they left. The second-tier sign-in admits any
 * address on the LCX domain, so without this list it would hand that access
 * straight back, and their mailbox would not even need to still work: nothing on
 * this path sends mail or verifies control of the address.
 *
 * A literal, exactly like FOUNDING_MEMBER_IDS in workspaces.ts, and for the same
 * reason: deriving it from anything would re-open the hole the next time the
 * source of truth drifted.
 *
 * OFFBOARDING IS NOW TWO STEPS, not one: add the address here, AND rotate
 * SECONDARY_PASSCODE. The rotation is the part that actually revokes — this list
 * only stops the lazy attempt. That is the honest limit of a shared secret and it
 * is the tradeoff the second tier was accepted with.
 */
export const DEPARTED_MEMBER_EMAILS: readonly string[] = [
  'rida@lcx.com',
  'jatin@lcx.com',
];

/** True when this address belongs to someone who has left. */
export function hasDeparted(email: string): boolean {
  return DEPARTED_MEMBER_EMAILS.includes(normalizeEmail(email));
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
