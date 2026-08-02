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
 * ── THE GATE IS NOW ADVISORY WHERE THE PERIMETER IS EMPTY (owner, 2026-08-02) ─
 * The paragraph that stood here said the gate "will refuse today, and that is the
 * point". It did: no human has entered a position, so `loadPerimeter` serves the
 * compiled placeholders, which are expired on arrival and double-locked, so every
 * quote in every jurisdiction was refused. The owner's decision is that the desk
 * keeps quoting and every artifact carries the truth instead — so a refusal whose
 * code reports the ABSENCE of a position (`perimeterDisposition`,
 * `packages/shared/src/gps/perimeter.ts`) no longer stops the write. What replaces
 * the 409 is not silence:
 *
 *   1. the gate still RUNS, in the same order, and reaches the same code;
 *   2. the code it reached is WRITTEN to `audit_log` as
 *      `gps_perimeter.advisory_pass`, with the jurisdiction, the offer, the reason
 *      and the authenticated actor — and if that row cannot be written the act is
 *      refused, because an unrecorded pass is the thing this file exists to prevent;
 *   3. the clearance carries `legalPositionOnFile: false` and the notice sentence,
 *      which every quote, proposal and engagement response stamps.
 *
 * TWO THINGS STILL REFUSE, and neither is negotiable: a position recorded as
 * PROHIBITED (a human wrote down that this is forbidden; the emptiness of the rest
 * of the matrix is not an argument against them), and a perimeter that could not be
 * READ at all. Advisory operation is the consequence of an EMPTY perimeter, never of
 * an unreadable one.
 *
 * IT SELF-HEALS, WITH NO SETTING TO CHANGE BACK. There is no flag, no environment
 * variable and no parameter anywhere in this path. The moment a reviewed, sourced,
 * unexpired position exists for a jurisdiction × offer pair, `classify` returns `ok`
 * for it, no absence code can be produced for it, and that pair refuses again —
 * while its neighbours, still unwritten, stay advisory. Filling the matrix is one of
 * the founder inputs the plan already lists, and doing it is what turns the gate
 * back on, one cell at a time.
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

/**
 * Named `…_DISCIPLINE` and not `…_FAILS_CLOSED`, which is what it was called until
 * 2026-08-02. The gate stopped failing closed on that date, by the owner's explicit
 * decision, for the MISSING / unreviewed / malformed / stale cases — those now proceed
 * and are recorded. It still fails closed on PROHIBITED and on a perimeter it could not
 * read. A constant called FAILS_CLOSED describing a gate that mostly does not is exactly
 * the kind of comment this compartment treats as a defect, so the name moved rather than
 * the text: every sentence below was already accurate.
 */
export const PERIMETER_GATE_DISCIPLINE =
  'The jurisdictional perimeter is consulted on every path that prices, opens or issues GPS work, and '
  + 'its verdict is recorded on every one. A position recorded as PROHIBITED refuses the act, and so '
  + 'does a perimeter that could not be read. A position that is MISSING, unreviewed, malformed or past '
  + 'its review date does not refuse: the act proceeds, the gate code and the actor are written to the '
  + 'audit log, and the artifact carries "no legal position on file". The moment a reviewed, sourced, '
  + 'unexpired position exists for that jurisdiction and offer, that pair refuses again — no code change '
  + 'and no setting.';

export type PerimeterGuardStatus = 404 | 409;

/**
 * The `audit_log.action` for a recorded advisory pass. One string, so a query for
 * "everything we quoted with no position on file" is one filter and not a guess.
 * `audit_log` is in the 0000 spine and applied everywhere, so this needs no migration.
 */
export const PERIMETER_ADVISORY_ACTION = 'gps_perimeter.advisory_pass';

/**
 * The refusal used when the gate WOULD have passed advisory but the record of that
 * pass could not be written. Failing closed here is the whole difference between an
 * advisory gate and a disabled one.
 */
export const PERIMETER_ADVISORY_UNRECORDED = 'PERIMETER_ADVISORY_UNRECORDED';

/**
 * The stamp for a clearance where no perimeter question was ANSWERED at all — the
 * engagement or deliverable could not be read, or does not exist. It is deliberately
 * not the "no legal position on file" notice: that sentence belongs on an artifact
 * that was produced, and nothing is produced here.
 */
const UNEVALUATED_STAMP = {
  legalPositionOnFile: false,
  legalPositionGateCode: null,
  legalPositionNotice:
    'The jurisdictional perimeter could not be evaluated for this act, so no legal position could be '
    + 'read either way. This is a refusal, not a stamp.',
  advisory: false,
} as const;

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
  perimeterGateNotice: string;

  /* ── THE STAMP. Three fields, on every clearance, allowed or not ─────────────
   * These are what a client-facing artifact must carry, and they are the fields
   * `apps/web` reads. FALSE is the answer everywhere in production today, so a
   * surface that forgets them prints a proposal that looks cleared and is not.
   */
  /** True iff a reviewed, well-formed, unexpired human position exists for this pair. */
  legalPositionOnFile: boolean;
  /** The gate code behind that answer — `perimeter_stale` today. Null when a position is on file. */
  legalPositionGateCode: string | null;
  /** The sentence to print. Non-null exactly when `legalPositionOnFile` is false. */
  legalPositionNotice: string | null;
  /** True when the gate refused for want of a position and the act proceeded anyway. */
  advisory: boolean;
}

export interface PerimeterGuardInput {
  jurisdiction: string | null | undefined;
  offerKey: OfferKey;
  evaluatedBy: string;
  asOf: string;
  /** The NAME of counsel actually engaged. Clears `counsel_required`, nothing else. */
  counselEngaged?: string | null;
  localPartnerId?: string | null;
  /**
   * What the advisory pass is recorded AGAINST. An engagement id where there is one;
   * a quote has no row yet, and `null` is the honest entity_id for it rather than a
   * borrowed one. Never a jurisdiction or an offer — those travel in `meta`.
   */
  subject?: { entity: string; entityId: string | null };
}

/**
 * IS THE PERIMETER GENUINELY EMPTY, OR DID IT MERELY FAIL TO LOAD?
 *
 * This probe is what keeps "advisory operation is the consequence of an EMPTY
 * perimeter, never of an unreadable one" a fact rather than a sentence. Without it
 * the claim was false: `loadPerimeter` treats a throw inside `isPerimeterMigrated`
 * as "not migrated" and serves the compiled placeholders, which produce
 * `perimeter_stale` — an ABSENCE code. So a connection reset, or a stale cached
 * probe from one failure at start-up, would have turned every BLOCKING pair in a
 * filled-in matrix into an advisory pass, silently, for as long as the cache lived.
 *
 * Returns null when the question could not be answered, and the caller then refuses.
 *
 * `tablePresent: false` is NOT a failure: an unapplied migration is a knowable
 * state, and it is the state the compiled placeholders exist for.
 */
async function readPerimeterExtent(
  pool: Pool,
): Promise<{ tablePresent: boolean; storedRows: number } | null> {
  try {
    const reg = await pool.query(
      `SELECT to_regclass('public.gps_jurisdiction_profile') IS NOT NULL AS present`,
    );
    const present = Boolean((reg.rows as Array<{ present: boolean | null }>)[0]?.present);
    if (!present) return { tablePresent: false, storedRows: 0 };
    const counted = await pool.query('SELECT count(*)::int AS n FROM gps_jurisdiction_profile');
    return { tablePresent: true, storedRows: Number((counted.rows as Array<{ n: number }>)[0]?.n ?? 0) };
  } catch (err) {
    console.error('[gps] perimeter extent probe error:', err);
    return null;
  }
}

/**
 * Write the record of an advisory pass. Returns false if it could not be written,
 * and the caller then refuses — see `PERIMETER_ADVISORY_UNRECORDED`.
 *
 * WHAT IS IN THE ROW, AND WHY EACH FIELD. The gate code and reason, because "we
 * quoted anyway" is only answerable six months later if the sentence the gate
 * produced on the day is in the row. The jurisdiction as the human typed it AND as
 * the perimeter normalised it, because a lookup miss on a spelling is a different
 * finding from a lookup miss on a place. The offer, because a position is per
 * jurisdiction × offer and a row that named only the country would be unactionable.
 * The actor from the authenticated session, never a body field — the same property
 * `integrity.test.ts` asserts for every other attribution in this compartment.
 */
async function recordAdvisoryPass(
  pool: Pool,
  input: PerimeterGuardInput,
  d: ServiceGateDecision,
  source: PerimeterSource,
): Promise<boolean> {
  const subject = input.subject ?? { entity: 'gps_perimeter', entityId: null };
  try {
    await pool.query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.evaluatedBy,
        PERIMETER_ADVISORY_ACTION,
        subject.entity,
        subject.entityId,
        JSON.stringify({
          gateCode: d.code,
          gateReason: d.reason,
          remedy: d.remedy,
          jurisdictionInput: input.jurisdiction ?? null,
          jurisdictionKey: d.classification.jurisdiction,
          offerKey: input.offerKey,
          serviceClass: d.classification.serviceClass,
          classificationStatus: d.classification.status,
          evaluatedBy: input.evaluatedBy,
          asOf: input.asOf,
          perimeterSource: source,
          legalPositionOnFile: false,
          notice: d.disposition.notice,
          note:
            'The perimeter gate refused for want of a human-entered position and the act was allowed to '
            + 'proceed. This row is the refusal. It is not an authorisation, and nothing about it makes '
            + 'the act cleared — see PERIMETER_GATE_DISCIPLINE.',
        }),
      ],
    );
    return true;
  } catch (err) {
    console.error('[gps] perimeter advisory record error:', err);
    return false;
  }
}

/**
 * Gate one (jurisdiction, offer) pair. The primitive every installation uses.
 *
 * Note what is NOT here: no branch on `perimeterSource`. A compiled-placeholder
 * perimeter and an empty database table are answered identically, because they are
 * the same fact — nobody has entered a position — and the distinction was never
 * what decided anything. The source is REPORTED so the record can say which
 * perimeter answered.
 *
 * Note also what is not a parameter: nothing here takes an instruction about how
 * to treat a refusal. Whether a refusal blocks is read off `d.disposition`, which
 * is read off the record.
 */
export async function perimeterClearanceFor(
  pool: Pool,
  input: PerimeterGuardInput,
): Promise<PerimeterClearance> {
  const shell = {
    evaluatedBy: input.evaluatedBy,
    jurisdiction: input.jurisdiction ?? null,
    offerKey: input.offerKey,
    perimeterGateNotice: PERIMETER_GATE_DISCIPLINE,
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
        + PERIMETER_GATE_DISCIPLINE,
      remedy: 'Retry once the perimeter is readable. Do not proceed on the basis that the check did not run.',
      recoverable: true,
      perimeterSource: null,
      perimeterSourceReason: null,
      decision: null,
      ...UNEVALUATED_STAMP,
    };
  }

  const d = gated.decision;
  const stamp = {
    legalPositionOnFile: d.disposition.legalPositionOnFile,
    legalPositionGateCode: d.disposition.gateCode,
    legalPositionNotice: d.disposition.notice,
  };
  const rest = {
    perimeterSource: gated.perimeterSource,
    perimeterSourceReason: gated.perimeterSourceReason,
    decision: d,
  };

  // The advisory path: the gate refused for want of a position, so the act proceeds
  // and the refusal is written down. `blocked` is read, never `allowed` — those are
  // now different questions and conflating them is the whole bug class here.
  if (!d.allowed && !d.disposition.blocked) {
    // Confirm the emptiness before acting on it. A perimeter that could not be read,
    // or one whose table holds rows the load did not use, is not an empty one.
    const extent = await readPerimeterExtent(pool);
    const trustworthy =
      extent !== null && !(extent.storedRows > 0 && gated.perimeterSource !== 'database');
    if (!trustworthy) {
      return {
        ...shell, ...rest, ...stamp,
        allowed: false,
        status: 409,
        code: 'PERIMETER_UNAVAILABLE',
        reason:
          'The perimeter refused this act for want of a human-entered position, but whether the '
          + 'perimeter is actually empty could not be confirmed — '
          + (extent === null
            ? 'the table could not be read.'
            : `${extent.storedRows} entered position(s) exist and the gate answered from `
              + `${gated.perimeterSource} instead.`)
          + ' An act proceeds on an absent position, never on an unreadable one. '
          + PERIMETER_GATE_DISCIPLINE,
        remedy: 'Retry once the perimeter table is readable. Do not proceed on the basis that the check did not run.',
        recoverable: true,
        advisory: false,
      };
    }
    const recorded = await recordAdvisoryPass(pool, input, d, gated.perimeterSource);
    if (!recorded) {
      return {
        ...shell, ...rest, ...stamp,
        allowed: false,
        status: 409,
        code: PERIMETER_ADVISORY_UNRECORDED,
        reason:
          `The perimeter refused this act with "${d.code}" and no position is on file, so it would have `
          + 'proceeded on an advisory basis — but the record of that could not be written, and an '
          + 'unrecorded pass is indistinguishable from no gate at all. Refused. '
          + PERIMETER_GATE_DISCIPLINE,
        remedy: 'Retry once the audit log is writable. The gate itself has nothing against this act.',
        recoverable: true,
        advisory: false,
      };
    }
    console.warn(
      `[gps] perimeter ADVISORY PASS ${input.offerKey} / ${input.jurisdiction ?? '(no jurisdiction)'} `
      + `for ${input.evaluatedBy}: ${d.code} recorded, not enforced`,
    );
    return {
      ...shell, ...rest, ...stamp,
      allowed: true,
      status: 200,
      // The refusal channel is empty because nothing is being refused. The gate's
      // verdict is not lost: it is in `legalPositionGateCode`, in the whole
      // `decision`, and in the audit row just written.
      code: null,
      reason: null,
      remedy: d.remedy,
      recoverable: true,
      advisory: true,
    };
  }

  return {
    ...shell, ...rest, ...stamp,
    allowed: d.allowed,
    status: d.allowed ? 200 : 409,
    code: d.allowed ? null : d.code,
    reason: d.reason,
    remedy: d.remedy,
    recoverable: d.recoverable,
    advisory: false,
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
        + PERIMETER_GATE_DISCIPLINE,
      remedy: 'Retry once the engagement is readable.',
      recoverable: true,
      evaluatedBy: ctx.evaluatedBy,
      jurisdiction: null,
      offerKey: null,
      perimeterSource: null,
      perimeterSourceReason: null,
      decision: null,
      perimeterGateNotice: PERIMETER_GATE_DISCIPLINE,
      ...UNEVALUATED_STAMP,
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
      perimeterGateNotice: PERIMETER_GATE_DISCIPLINE,
      ...UNEVALUATED_STAMP,
    };
  }

  return perimeterClearanceFor(pool, {
    jurisdiction: subject.clientJurisdiction,
    offerKey: subject.offerKey,
    evaluatedBy: ctx.evaluatedBy,
    asOf: ctx.asOf,
    // An advisory pass on an existing engagement is recorded AGAINST that engagement,
    // so `/v1/audit` shows it on the same entity as its conflict check and its status
    // moves rather than in a heap of anonymous perimeter rows.
    subject: { entity: 'gps_engagement', entityId: engagementId },
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
    perimeterGateNotice: PERIMETER_GATE_DISCIPLINE,
    ...UNEVALUATED_STAMP,
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
      + PERIMETER_GATE_DISCIPLINE,
      409,
      'PERIMETER_UNAVAILABLE',
      'Retry once the deliverable is readable. Do not proceed on the basis that the check did not run.',
    );
  }

  if (!engagementId) return unreadable('deliverable not found', 404, 'NOT_FOUND', null);

  return guardEngagementPerimeter(pool, engagementId, ctx);
}

/**
 * THE STAMP, FOR EVERY QUOTE, PROPOSAL AND ENGAGEMENT RESPONSE.
 *
 * `apps/web` reads exactly these three keys to print "no legal position on file"
 * beside a price. They are flat and plainly named on purpose: a nested
 * `perimeter.stamp.legalPosition.onFile` is a key one refactor away from being
 * silently absent, and an absent key here renders as a proposal that looks cleared.
 *
 * Spread it into the response body (`...perimeterStamp(cl)`) rather than nesting it,
 * on the ALLOWED path as well as the refused one — the allowed path is the one that
 * produces a document a client reads.
 */
export function perimeterStamp(cl: PerimeterClearance) {
  return {
    legalPositionOnFile: cl.legalPositionOnFile,
    legalPositionGateCode: cl.legalPositionGateCode,
    legalPositionNotice: cl.legalPositionNotice,
  };
}

/** The body a refusal puts on the wire. Same shape from the middleware and the route. */
export function perimeterRefusalBody(cl: PerimeterClearance) {
  return {
    error: cl.reason,
    code: cl.code,
    data: {
      ...perimeterStamp(cl),
      remedy: cl.remedy,
      recoverable: cl.recoverable,
      jurisdiction: cl.jurisdiction,
      offerKey: cl.offerKey,
      perimeterSource: cl.perimeterSource,
      perimeterSourceReason: cl.perimeterSourceReason,
      gates: cl.decision?.gates ?? null,
      classification: cl.decision?.classification ?? null,
      perimeterGateNotice: cl.perimeterGateNotice,
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
        ...perimeterStamp(cl),
        remedy: cl.remedy,
        recoverable: cl.recoverable,
        jurisdiction: cl.jurisdiction,
        offerKey: cl.offerKey,
        perimeterSource: cl.perimeterSource,
        gates: cl.decision?.gates ?? null,
        perimeterGateNotice: cl.perimeterGateNotice,
      },
    );
  }
  return cl;
}
