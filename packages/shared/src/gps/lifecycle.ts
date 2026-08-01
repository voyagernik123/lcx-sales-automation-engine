import { ENGAGEMENT_STATUSES, type EngagementStatus } from './types.js';

/**
 * THE ENGAGEMENT LIFECYCLE, IN ONE PLACE, BECAUSE IT WAS IN TWO AND THEY DISAGREED.
 *
 * `apps/api/src/gps/actions.ts` held this map privately and wrote, verbatim:
 *
 *   "If a generic status setter could write [proposed/accepted], every gate in
 *    this file would be one `gps_status_change` call away from being bypassed —
 *    which is the single most likely way this compartment's compliance property
 *    would be lost, and it would look like a convenience feature."
 *
 * `POST /v1/gps/engagements/:id/status` (`routes/gps.ts`) WAS that generic status
 * setter. It accepted every member of `ENGAGEMENT_STATUSES`, `proposed` included,
 * and `setEngagementStatus` enforced terminality and the conflict decision but no
 * edges. So `{"status":"proposed"}` moved an engagement the underwriting guard had
 * refused at 91% P(loss), and the perimeter guard had refused as prohibited,
 * straight past both — then `{"status":"collected"}` took it to cash in one hop,
 * skipping `accepted` and `deposit_paid`, i.e. skipping the two edges that encode
 * "a signature is not cash, and only one of the two pays a partner".
 *
 * Moved here so both callers read the SAME map. That is the whole fix: the
 * previous defect was not a missing rule, it was a rule that lived next to one of
 * its two enforcement points.
 */

/**
 * The two statuses no human may set by hand, on any route, through any action.
 *
 * They are produced ONLY by the guarded operations — `gps_proposal_issue` /
 * `POST …/proposal` for `proposed`, `gps_engagement_accept` for `accepted` —
 * because those are the transitions the conflict gate, the perimeter gate, the
 * underwriting guard and the discount gate stand in front of.
 */
export const GATED_ENGAGEMENT_STATUSES: readonly EngagementStatus[] = ['proposed', 'accepted'] as const;

export function isGatedEngagementStatus(s: EngagementStatus): boolean {
  return GATED_ENGAGEMENT_STATUSES.includes(s);
}

/** Everything a human may set by hand. `ENGAGEMENT_STATUSES` minus the gated two. */
export const MANUAL_ENGAGEMENT_TARGETS: readonly EngagementStatus[] =
  ENGAGEMENT_STATUSES.filter((s) => !isGatedEngagementStatus(s));

/**
 * The lifecycle as edges rather than as a comment.
 *
 * Two edges encode money rules and not taxonomy:
 *  - `deposit_paid` is reachable ONLY from `accepted`. A deposit against nothing
 *    signed is not a deposit.
 *  - `in_delivery` is reachable ONLY from `deposit_paid`. Partners deliver and
 *    partners invoice us, so committing a partner before the client's cash arrives
 *    is how a $10–25k engagement turns into a personal liability.
 *
 * `cancelled` is reachable from every live state; `closed_lost` only from the
 * pre-delivery states, because work that was delivered was not lost. Terminal
 * states are listed explicitly with empty edge lists so the record is total and a
 * new status cannot be added without deciding its edges.
 */
export const MANUAL_ENGAGEMENT_TRANSITIONS: Record<EngagementStatus, readonly EngagementStatus[]> = {
  draft: ['conflict_pending', 'closed_lost', 'cancelled'],
  conflict_pending: ['draft', 'closed_lost', 'cancelled'],
  proposed: ['draft', 'closed_lost', 'cancelled'],
  accepted: ['deposit_paid', 'closed_lost', 'cancelled'],
  deposit_paid: ['in_delivery', 'cancelled'],
  in_delivery: ['delivered', 'cancelled'],
  delivered: ['invoiced', 'cancelled'],
  invoiced: ['collected', 'cancelled'],
  collected: [],
  closed_lost: [],
  cancelled: [],
};

/** A status change into one of these must say why. */
export const ENGAGEMENT_STATUS_REQUIRES_REASON: readonly EngagementStatus[] = ['closed_lost', 'cancelled'];

export type ManualTransitionRefusal =
  | { ok: true }
  | { ok: false; code: 'STATUS_IS_GATED'; reason: string }
  | { ok: false; code: 'TRANSITION_NOT_ALLOWED'; reason: string };

/**
 * May a human move `from` → `to` by hand? Pure, total, and the single answer both
 * the REST route and the action path use.
 *
 * A no-op (`from === to`) is allowed rather than refused: it is how a caller
 * re-asserts a status idempotently, and refusing it would push callers into
 * "compare first, then set", which is the race the edge map exists to avoid.
 */
export function checkManualTransition(
  from: EngagementStatus,
  to: EngagementStatus,
): ManualTransitionRefusal {
  if (isGatedEngagementStatus(to)) {
    return {
      ok: false,
      code: 'STATUS_IS_GATED',
      reason:
        `"${to}" cannot be set by hand. It is produced only by the guarded operation `
        + `(${to === 'proposed' ? 'issue the proposal' : 'accept the engagement'}), which runs the `
        + 'conflict gate, the jurisdictional perimeter gate and the underwriting guard. A generic '
        + 'status setter that could write it would be a bypass of all three that looked like a '
        + 'convenience feature.',
    };
  }
  if (from === to) return { ok: true };
  if (!MANUAL_ENGAGEMENT_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      code: 'TRANSITION_NOT_ALLOWED',
      reason:
        `"${from}" cannot move to "${to}". Allowed from "${from}": `
        + `${MANUAL_ENGAGEMENT_TRANSITIONS[from].join(', ') || 'nothing — this status is terminal'}.`,
    };
  }
  return { ok: true };
}
