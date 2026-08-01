import type { Pool } from 'pg';
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { OfferKey, ServiceGateDecision } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { ActionError } from '../actions/types.js';
import { gateQuote, loadSubject, type PerimeterSource } from './conflict.js';

/**
 * GLOBAL SERVICES — THE PERIMETER GATE, INSTALLED ON THE WRITE PATHS.
 *
 * `gateService` (`packages/shared/src/gps/perimeter.ts:609`) has always been able
 * to answer "may we sell this service into this jurisdiction". Until this file it
 * was called from SIX places and every one of them was a READ — the grid, the
 * wall, the disclosure view, an advisory `POST /conflict/quote-gate` with no
 * caller. `POST /quote`, `POST /engagements` and the two paths that move an
 * engagement to `proposed` never consulted it. A prohibited, unreviewed or expired
 * position therefore refused on a screen and permitted every act the screen was
 * describing. `0050_gps_perimeter.sql:338` told an auditor reading `\d+` that "the
 * system enforces it", which was the widest-audience false claim in the
 * compartment.
 *
 * This module is the enforcement. It adds NO judgement of its own: every decision
 * is `gateService`'s, reached through `gateQuote`, and there is deliberately no
 * override parameter, no `force`, no `acceptRisk` — see the docblock on
 * `gateService`, which explains why a boolean that defeats a regulatory refusal is
 * the most dangerous field this codebase could grow.
 *
 * ── IT FAILS CLOSED ──────────────────────────────────────────────────────────
 * A gate that permits what it could not evaluate is the door every bypass uses.
 * A throw inside the load or the gate is a refusal (`PERIMETER_UNAVAILABLE`), not
 * a pass, on exactly the reasoning `ISSUE_GUARD_FAILS_CLOSED` states for the
 * underwriting guard.
 *
 * ── IT WILL REFUSE TODAY, AND THAT IS THE POINT ──────────────────────────────
 * No human has entered a position, so `loadPerimeter` serves the compiled
 * placeholders, which are expired on arrival and double-locked. Every gate
 * therefore refuses with `perimeter_stale`/`perimeter_unreviewed` and a remedy
 * naming the act required: a qualified human enters a sourced, signed, dated
 * position and a SECOND human reviews it. That is not a regression — it is the
 * compartment finally behaving the way its own schema comment claims. Filling the
 * matrix is one of the founder inputs the plan already lists.
 *
 * ── WHERE IT IS INSTALLED ────────────────────────────────────────────────────
 *   POST /v1/gps/quote                        `perimeterClearanceFor` (jurisdiction from body)
 *   POST /v1/gps/engagements                  `perimeterClearanceFor` (jurisdiction from gps_client)
 *   POST /v1/gps/engagements/:id/proposal     `requirePerimeterClearance` middleware
 *   action `gps_proposal_issue`                `assertPerimeterCleared` inside execute
 *   action `gps_engagement_accept`             `assertPerimeterCleared` inside execute
 *   POST /v1/gps/deliverables/:id/accept      `guardDeliverablePerimeter`
 *   POST /v1/gps/loop/outcome                 `guardEngagementPerimeter`
 *
 * The proposal pair matters together: the REST route and the action route perform
 * the same transition to `proposed`, and a guard mounted on one router is a guard
 * with a second door beside it.
 *
 * ── WHERE IT IS DELIBERATELY *NOT* INSTALLED ─────────────────────────────────
 * Enumerated, with the reason, in `__tests__/integrity.test.ts` — which asserts the
 * list is EXHAUSTIVE, so a write path added to the compartment without either a
 * guard or a stated exemption turns that suite red. In one line: the five internal
 * delivery writers (milestone state, deliverable declaration, evidence request,
 * evidence status, LCX review) record work on an engagement the perimeter already
 * cleared at creation and again at issue, and none of them moves money or tells a
 * client anything — the client-facing event downstream of all five is ACCEPTANCE,
 * which is guarded. The four origination writers cannot be guarded honestly: a
 * target may have no `gps_client` row at all, and its `jurisdiction` is free text an
 * operator typed into a request body, so a gate there would read its verdict from
 * the caller — and refusing to RECORD that a prospect sits in a prohibited
 * jurisdiction would remove the only way to write down the refusal.
 */

export const PERIMETER_GATE_FAILS_CLOSED =
  'The jurisdictional perimeter is enforced on every path that prices, opens or issues GPS work. '
  + 'A position that is missing, unreviewed, malformed, past its review date or recorded as prohibited '
  + 'refuses the act — including when the perimeter could not be read at all.';

export type PerimeterGuardStatus = 404 | 409;

export interface PerimeterClearance {
  allowed: boolean;
  /** HTTP status for a refusal. 200 when allowed. */
  status: 200 | PerimeterGuardStatus;
  /** `gateService`'s own code, or a guard-level one. Null iff allowed. */
  code: string | null;
  reason: string | null;
  remedy: string | null;
  /** False when the answer is a wall rather than a task (a recorded prohibition). */
  recoverable: boolean;
  /** The session this refusal is attributed to. Never a body field. */
  evaluatedBy: string;
  jurisdiction: string | null;
  offerKey: OfferKey | null;
  perimeterSource: PerimeterSource | null;
  perimeterSourceReason: string | null;
  /** The full gate trail (D1) — every gate in order, including the unreached ones. */
  decision: ServiceGateDecision | null;
  failsClosedNotice: string;
}

export interface PerimeterGuardInput {
  jurisdiction: string | null | undefined;
  offerKey: OfferKey;
  evaluatedBy: string;
  asOf: string;
  /** The NAME of counsel actually engaged. Clears `counsel_required`, nothing else. */
  counselEngaged?: string | null;
  localPartnerId?: string | null;
}

/**
 * Gate one (jurisdiction, offer) pair. The primitive every installation uses.
 *
 * Note what is NOT here: no branch on `perimeterSource`. A compiled-placeholder
 * perimeter refuses on the same footing as a database one, because "nobody has
 * entered a position" and "somebody entered a position that says no" are both
 * reasons not to proceed, and distinguishing them in order to permit one of them
 * is the bypass this file exists to remove. The source is REPORTED so the refusal
 * can say which record answered.
 */
export async function perimeterClearanceFor(
  pool: Pool,
  input: PerimeterGuardInput,
): Promise<PerimeterClearance> {
  const shell = {
    evaluatedBy: input.evaluatedBy,
    jurisdiction: input.jurisdiction ?? null,
    offerKey: input.offerKey,
    failsClosedNotice: PERIMETER_GATE_FAILS_CLOSED,
  };

  let gated;
  try {
    gated = await gateQuote(pool, {
      jurisdiction: input.jurisdiction,
      offer: input.offerKey,
      asOf: input.asOf,
      counselEngaged: input.counselEngaged ?? null,
      localPartnerId: input.localPartnerId ?? null,
    });
  } catch (err) {
    console.error('[gps] perimeter clearance error:', err);
    return {
      ...shell,
      allowed: false,
      status: 409,
      code: 'PERIMETER_UNAVAILABLE',
      reason:
        'The jurisdictional perimeter could not be read, so this act is refused. '
        + PERIMETER_GATE_FAILS_CLOSED,
      remedy: 'Retry once the perimeter is readable. Do not proceed on the basis that the check did not run.',
      recoverable: true,
      perimeterSource: null,
      perimeterSourceReason: null,
      decision: null,
    };
  }

  const d = gated.decision;
  return {
    ...shell,
    allowed: d.allowed,
    status: d.allowed ? 200 : 409,
    code: d.allowed ? null : d.code,
    reason: d.reason,
    remedy: d.remedy,
    recoverable: d.recoverable,
    perimeterSource: gated.perimeterSource,
    perimeterSourceReason: gated.perimeterSourceReason,
    decision: d,
  };
}

/**
 * Gate an EXISTING engagement, reading the jurisdiction from its client row.
 *
 * The jurisdiction is never taken from the request. A caller who could name the
 * jurisdiction their proposal is gated against could name a permitted one — the
 * same reason `requireUnderwritingClearance` reads the row and ignores every
 * request field.
 */
export async function guardEngagementPerimeter(
  pool: Pool,
  engagementId: string,
  ctx: { evaluatedBy: string; asOf: string },
): Promise<PerimeterClearance> {
  let subject;
  try {
    subject = await loadSubject(pool, engagementId);
  } catch (err) {
    console.error('[gps] perimeter subject load error:', err);
    return {
      allowed: false,
      status: 409,
      code: 'PERIMETER_UNAVAILABLE',
      reason:
        'The engagement could not be read, so its jurisdictional perimeter could not be evaluated and this act is refused. '
        + PERIMETER_GATE_FAILS_CLOSED,
      remedy: 'Retry once the engagement is readable.',
      recoverable: true,
      evaluatedBy: ctx.evaluatedBy,
      jurisdiction: null,
      offerKey: null,
      perimeterSource: null,
      perimeterSourceReason: null,
      decision: null,
      failsClosedNotice: PERIMETER_GATE_FAILS_CLOSED,
    };
  }

  if (!subject) {
    return {
      allowed: false,
      status: 404,
      code: 'NOT_FOUND',
      reason: 'engagement not found',
      remedy: null,
      recoverable: true,
      evaluatedBy: ctx.evaluatedBy,
      jurisdiction: null,
      offerKey: null,
      perimeterSource: null,
      perimeterSourceReason: null,
      decision: null,
      failsClosedNotice: PERIMETER_GATE_FAILS_CLOSED,
    };
  }

  return perimeterClearanceFor(pool, {
    jurisdiction: subject.clientJurisdiction,
    offerKey: subject.offerKey,
    evaluatedBy: ctx.evaluatedBy,
    asOf: ctx.asOf,
  });
}

/**
 * Gate a DELIVERABLE by resolving the engagement it belongs to.
 *
 * `POST /deliverables/:id/accept` is the commercial event at the far end of
 * delivery — the write that makes work invoiceable — and it names a deliverable,
 * not an engagement. So the engagement id is read from `gps_deliverable` and the
 * jurisdiction from `gps_client` through it. Nothing here is taken from the request
 * beyond the path id, for the reason `guardEngagementPerimeter` states.
 *
 * The lookup fails closed on its own terms: a throw is `PERIMETER_UNAVAILABLE`
 * (409), never a pass. A missing deliverable is a 404 rather than a refusal,
 * because "no such row" is not a jurisdictional answer.
 */
export async function guardDeliverablePerimeter(
  pool: Pool,
  deliverableId: string,
  ctx: { evaluatedBy: string; asOf: string },
): Promise<PerimeterClearance> {
  const unreadable = (reason: string, status: PerimeterGuardStatus, code: string, remedy: string | null) => ({
    allowed: false,
    status,
    code,
    reason,
    remedy,
    recoverable: true,
    evaluatedBy: ctx.evaluatedBy,
    jurisdiction: null,
    offerKey: null,
    perimeterSource: null,
    perimeterSourceReason: null,
    decision: null,
    failsClosedNotice: PERIMETER_GATE_FAILS_CLOSED,
  } satisfies PerimeterClearance);

  let engagementId: string | null = null;
  try {
    const res = await pool.query(
      'SELECT engagement_id FROM gps_deliverable WHERE id = $1',
      [deliverableId],
    );
    const row = (res.rows as Array<{ engagement_id: string }>)[0];
    engagementId = row?.engagement_id ?? null;
  } catch (err) {
    console.error('[gps] perimeter deliverable load error:', err);
    return unreadable(
      'The deliverable could not be read, so its jurisdictional perimeter could not be evaluated and this act is refused. '
      + PERIMETER_GATE_FAILS_CLOSED,
      409,
      'PERIMETER_UNAVAILABLE',
      'Retry once the deliverable is readable. Do not proceed on the basis that the check did not run.',
    );
  }

  if (!engagementId) return unreadable('deliverable not found', 404, 'NOT_FOUND', null);

  return guardEngagementPerimeter(pool, engagementId, ctx);
}

/** The body a refusal puts on the wire. Same shape from the middleware and the route. */
export function perimeterRefusalBody(cl: PerimeterClearance) {
  return {
    error: cl.reason,
    code: cl.code,
    data: {
      remedy: cl.remedy,
      recoverable: cl.recoverable,
      jurisdiction: cl.jurisdiction,
      offerKey: cl.offerKey,
      perimeterSource: cl.perimeterSource,
      perimeterSourceReason: cl.perimeterSourceReason,
      gates: cl.decision?.gates ?? null,
      classification: cl.decision?.classification ?? null,
      failsClosedNotice: cl.failsClosedNotice,
    },
  };
}

/**
 * IN FRONT OF THE PROPOSAL ROUTE, for the reason `requireUnderwritingClearance`
 * gives: `issueProposal` moves the engagement to `proposed` before it assembles
 * anything, so a check inside the handler would have to be first, and "first,
 * before the other thing, please remember" is not a control.
 */
export const requirePerimeterClearance: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
) => {
  const id = c.req.param('id');
  // Let the handler answer its own 400 for a malformed id — the guard has nothing
  // to say about a path that does not name an engagement.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) return next();

  const cl = await guardEngagementPerimeter(getPool(), id as string, {
    evaluatedBy: c.get('operator')?.id ?? 'unknown',
    asOf: new Date().toISOString(),
  });
  if (!cl.allowed) {
    console.warn(`[gps] perimeter REFUSED engagement ${id} for ${cl.evaluatedBy}: ${cl.code}`);
    return c.json(perimeterRefusalBody(cl), cl.status as PerimeterGuardStatus);
  }
  return next();
};

/**
 * The same gate as a THROW, for the governed-action path.
 *
 * `gps_proposal_issue` reaches `status='proposed'` through
 * `POST /v1/actions/:id/invoke`, which no GPS router middleware sits in front of.
 * The gate therefore has to belong to the operation rather than to one router:
 * `assertConflictCleared` already established the shape and this follows it.
 *
 * Throws `ActionError` rather than a bespoke class so `/v1/actions` maps the status
 * and the code with no new branch — a refusal that needs its own handler is a
 * refusal that gets forgotten in the next route.
 */
export async function assertPerimeterCleared(
  pool: Pool,
  engagementId: string,
  ctx: { evaluatedBy: string; asOf: string },
): Promise<PerimeterClearance> {
  const cl = await guardEngagementPerimeter(pool, engagementId, ctx);
  if (!cl.allowed) {
    throw new ActionError(
      cl.code ?? 'PERIMETER_REFUSED',
      cl.reason ?? 'The jurisdictional perimeter refuses this act.',
      cl.status === 404 ? 404 : 409,
      {
        remedy: cl.remedy,
        recoverable: cl.recoverable,
        jurisdiction: cl.jurisdiction,
        offerKey: cl.offerKey,
        perimeterSource: cl.perimeterSource,
        gates: cl.decision?.gates ?? null,
        failsClosedNotice: cl.failsClosedNotice,
      },
    );
  }
  return cl;
}
