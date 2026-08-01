import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  EVIDENCE_STATUSES,
  MILESTONE_STATES,
  REVIEW_GATE_DB_CONSTRAINT,
  REVIEW_GATE_MECHANISM,
  type DeliverableOwner,
  type EvidenceStatus,
  type MilestoneState,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  DELIVERY_SCHEMA_GAPS,
  acceptDeliverable,
  createDeliverable,
  deliveryDesk,
  deskWip,
  isDeliveryMigrated,
  recordDeliverableReview,
  recordMilestoneState,
  requestEvidence,
  setEvidenceStatus,
  type DeliveryWrite,
} from '../gps/deliveryDesk.js';

/**
 * GLOBAL SERVICES (GPS) — P10 DELIVERY ROUTES. The face of a 4,564-line engine.
 *
 *   GET  /engagements/:id/delivery      the whole delivery screen, composed
 *   GET  /engagements/:id/plan          milestones + the scope-drift verdict
 *   GET  /engagements/:id/progress      progress, with no percentage when blocked
 *   GET  /engagements/:id/evidence      the chase list
 *   GET  /engagements/:id/acceptance    acceptance, with every refusal reason
 *   GET  /wip                           the coordination ceiling, desk-wide
 *   POST /engagements/:id/milestones/:key/state   record a milestone's state
 *   POST /engagements/:id/deliverables            declare what the client will receive
 *   POST /engagements/:id/evidence                ask the client for an input
 *   POST /deliverables/:id/review                 record the LCX review (approver)
 *   POST /deliverables/:id/accept                 accept it (approver)
 *   POST /evidence/:id/status                     settle a request
 *
 * ══ THIS ROUTER IS NOT MOUNTED BY THIS FILE, AND MUST NOT BE MOUNTED IN app.ts. ══
 *  `apps/api/src/gps/__tests__/intakeLockout.test.ts:315-333` fences the `/v1/gps`
 *  prefix: it reads every `.route('/v1/gps…', X)` in `app.ts` and asserts X is
 *  `gpsRoutes` and nothing else, because anything served under that prefix is inside
 *  the GPS compartment and must be inside the ratchet. So this router is mounted
 *  INTO `gpsRoutes` (`gpsRoutes.route('/', gpsDeliveryRoutes)` in `routes/gps.ts`),
 *  never beside it. Mounting it in `app.ts` turns that assertion red — which is the
 *  ratchet working, not a bug in it.
 *
 *  Mounting inside `gpsRoutes` also inherits the compartment gate rather than
 *  re-declaring it: `app.ts:99-101` applies `requireWorkspace('gps', 'view')` to
 *  every prefix in the workspace constitution's `apiPrefixes`, and `gps` is
 *  `legacy:false` — DEFAULT-DENY, so a roster member who was never granted `gps` gets
 *  nothing here even though they can read six other compartments. That is why this
 *  compartment may hold a third party's delivery record at all.
 *
 * ══ THERE IS NO UPLOAD, ATTACHMENT, MULTIPART OR FILE ROUTE IN THIS FILE. ══
 *  Not an omission — the load-bearing safety property of GPS Phase 3, and the whole
 *  reason a delivery layer could ship before decision D2 (LCX legal/DPO: controller
 *  vs processor for a third party's unpublished regulatory filings and
 *  privileged-adjacent legal work product, the subprocessor chain through
 *  Supabase/Render/Cloudflare/OpenRouter, retention, erasure) has been answered.
 *  Bodies are read as JSON and by no other means; `externalLocation` is a string an
 *  operator types about where the material already lives in the CLIENT's systems,
 *  and nothing here resolves it, retrieves it, copies it or previews it. The ratchet
 *  above discovers this file by path and fails the build on any byte door.
 *
 * MIGRATION-PENDING DISCIPLINE, and note WHICH migration. `routes/gps.ts` probes
 *  0047; these routes need 0049's three delivery tables, so they probe those instead
 *  (`isDeliveryMigrated`). One probe covers both files: 0049's composite foreign key
 *  (engagement_id, client_id) → gps_engagement means 0049 CANNOT have been applied
 *  without 0047. Reads answer 200 with an empty, well-shaped body and
 *  `migrated: false`; writes answer 503, never 500; validation runs BEFORE the probe,
 *  because a malformed request is malformed in every environment.
 *
 * ATTRIBUTION IS ALWAYS `c.get('operator')`, NEVER A BODY FIELD.
 *
 * EVERY RESPONSE CARRIES THE GAP LEDGER, IN `meta` AND NEVER IN `data`.
 *  `meta.schemaGaps` names each field the shared domain needs that 0049 has no column
 *  for; `meta.unmapped` names each ROW whose stored value had no faithful shared
 *  literal; `meta.scopeBasis` says which acceptance criteria the drift verdict was
 *  measured against. They live in `meta` because `data` is the shared declaration and
 *  nothing may be added to it here. Several numbers on this
 *  wire — "blocking delivery", "outside the plan" — are computed from values the API
 *  substituted because the database had none, and an operator is entitled to know
 *  which (D8: no claim without a mechanism). A surface that drops these is presenting
 *  an assumption as a record.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Reads degrade to this; writes answer 503 with it. Never 500: a 500 during the
 * deploy-before-migration window reads as "the platform is down", and the desk acts
 * on that reading rather than on "run one migration".
 */
const NOT_MIGRATED = {
  error: 'GLOBAL SERVICES delivery is awaiting migration 0049 on this environment',
  code: 'MIGRATION_PENDING',
};

/** Postgres rejects a malformed uuid with 22P02, which surfaces as a 500. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Trim, collapse to null when empty. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** A body that is not JSON is a 400, not an unhandled throw. */
async function jsonBody(c: Context<{ Variables: AuthVariables }>): Promise<Record<string, unknown> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * `DeliverableOwner` is `Extract<DeliveryActor, 'us' | 'partner'>` (`delivery.ts:92`)
 * and the domain exports no array for it, unlike `MILESTONE_STATES` and
 * `EVIDENCE_STATUSES` which are imported above rather than copied. Annotating the
 * literal with the union means `tsc` rejects a member that is not one, and a member
 * added to the union without being added here is the one gap — noted rather than
 * pretended away.
 */
const DELIVERABLE_OWNERS: readonly DeliverableOwner[] = ['us', 'partner'];

/** ISO-8601 or nothing. A date the database would reject is a 400, not a 500. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * One translation from a `DeliveryWrite` refusal to an HTTP answer, shared by all six
 * writes so a UI branching on `code` does not have to know which route it called —
 * the same reasoning `routes/gps.ts:510` gives for its `refusal()`.
 *
 * 409 rather than 400 for every refusal that is about STATE: the request was
 * well-formed and the system is saying no. `acceptance_refused` carries the engine's
 * whole verdict, so the surface can print the reasons in the engine's order (hardest
 * gate first) instead of one summarised sentence.
 */
function writeRefusal(
  c: Context<{ Variables: AuthVariables }>,
  result: Extract<DeliveryWrite<unknown>, { ok: false }>,
) {
  const notFound =
    result.code === 'engagement_not_found'
    || result.code === 'deliverable_not_found'
    || result.code === 'evidence_not_found';
  if (notFound) return c.json({ error: result.message, code: 'NOT_FOUND' }, 404);
  return c.json(
    {
      error: result.message,
      code: result.code.toUpperCase(),
      data: result.detail ?? null,
      // The review gate is the refusal most likely to be argued with, so its
      // mechanism travels with every refusal rather than only with that one (D8).
      mechanism: REVIEW_GATE_MECHANISM,
      dbConstraint: REVIEW_GATE_DB_CONSTRAINT,
    },
    409,
  );
}

export const gpsDeliveryRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── The reads ─────────────────────────────────────────────────────────────────
 *
 * THE FIVE ENGAGEMENT READS ARE PROJECTIONS OF ONE COMPOSITION, and that is a
 * deliberate trade of four extra queries for a property worth more than them: every
 * panel is built from the same rows at the same `asOf`, so the plan panel and the
 * progress panel cannot disagree about which milestone is blocked. Two independent
 * reads a second apart is exactly how a screen ends up showing "57% complete" beside
 * "blocked", which is the specific lie `ProgressDisplay` was shaped to make
 * impossible (`deliveryView.ts:412`).
 *
 * At ~29 engagements a year and one operator, four queries per panel is free. If it
 * ever is not, the fix is one request for `/delivery` and client-side slicing — not
 * five divergent queries.
 */

/**
 * Read the delivery composition, or produce the answer for the three cases that are
 * not a composition: a bad uuid (400), a pending migration (200 with
 * `migrated: false`), an unknown engagement (404).
 *
 * THE ONE PERMITTED INDIRECTION FOR THE MIGRATION PROBE. `__tests__/deliveryDesk.test.ts`
 * requires every handler in this file to probe, and allows a handler to satisfy that
 * by calling `readDesk` INSTEAD — then asserts separately that `readDesk` itself
 * probes. That keeps the ratchet exact rather than approximate: the indirection is
 * named in one place and verified, which is the same discipline
 * `gps/__tests__/deploySafety.test.ts:97` applies to its DB-free allow-list.
 */
type DeskRead =
  | { readonly kind: 'early'; readonly res: Response }
  | { readonly kind: 'ok'; readonly desk: NonNullable<Awaited<ReturnType<typeof deliveryDesk>>> };

async function readDesk(c: Context<{ Variables: AuthVariables }>): Promise<DeskRead> {
  const id = c.req.param('id');
  if (!isUuid(id)) {
    return { kind: 'early', res: c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400) };
  }
  if (!(await isDeliveryMigrated(getPool()))) {
    return { kind: 'early', res: c.json({ data: null, meta: { ...meta(), migrated: false } }) };
  }
  const desk = await deliveryDesk(getPool(), id);
  if (!desk) {
    return { kind: 'early', res: c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404) };
  }
  return { kind: 'ok', desk };
}

/**
 * The whole delivery screen for one engagement.
 *
 * `data.response` is `DeliveryResponse` — THE ONE DECLARATION, in
 * `packages/shared/src/gps/deliveryView.ts`. The web layer imports that same
 * interface and MUST NOT re-declare it in `apps/web/src/lib/api/`: a hand-copied
 * response interface claiming fields the API never returned took production down
 * this week, and `tsc` believed the copy while the mocked test agreed with it.
 */
gpsDeliveryRoutes.get('/engagements/:id/delivery', requireOperator, async (c) => {
  try {
    const read = await readDesk(c);
    if (read.kind === 'early') return read.res;
    const desk = read.desk;
    // `data` IS `DeliveryResponse`, unwrapped — not `{ response: … }`.
    // `apps/web/src/lib/api/gpsDelivery.ts:70` reads this endpoint as
    // `{ data: DeliveryResponse }` and imports that one declaration from shared, so an
    // extra level of nesting here is the same class of break as a hand-copied
    // interface: `tsc` on the web side would pass against the shared type while the
    // runtime payload had a different shape. Everything the API adds ON TOP of the
    // engine's output — the scope basis, the per-row substitutions, the gap ledger —
    // lives in `meta`, where it cannot collide with the shared declaration.
    return c.json({
      data: desk.response,
      meta: {
        ...meta(),
        migrated: true,
        scopeBasis: desk.scopeBasis,
        unmapped: desk.unmapped,
        schemaGaps: DELIVERY_SCHEMA_GAPS,
      },
    });
  } catch (err) {
    console.error('[gps-delivery] delivery error:', err);
    return c.json({ error: 'Failed to load delivery', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The plan, and the drift verdict either way.
 *
 * `deriveMilestones` refuses a plan that has drifted from the sale in BOTH
 * directions and it refuses by THROWING (`delivery.ts:609`), which on a server is a
 * 500 and on a screen is nothing. `plan.drift` is that throw turned into a
 * displayable verdict: on failure it carries the engine's own message verbatim
 * (naming the offer, the criterion and the index) and `rows` is empty BY REFUSAL, not
 * by absence. On success it is a positive assertion with its mechanism attached —
 * every criterion sold is delivered by a named milestone, and every milestone answers
 * to one.
 *
 * `scopeBasis` says WHICH criteria the verdict was measured against: the ones frozen
 * at sale, or the current catalogue when the snapshot has none. Those are different
 * claims and a surface must be able to tell them apart.
 */
gpsDeliveryRoutes.get('/engagements/:id/plan', requireOperator, async (c) => {
  try {
    const read = await readDesk(c);
    if (read.kind === 'early') return read.res;
    const desk = read.desk;
    return c.json({
      data: { asOf: desk.response.asOf, engagement: desk.response.engagement, plan: desk.response.plan },
      meta: {
        ...meta(), migrated: true, scopeBasis: desk.scopeBasis,
        unmapped: desk.unmapped, schemaGaps: DELIVERY_SCHEMA_GAPS,
      },
    });
  } catch (err) {
    console.error('[gps-delivery] plan error:', err);
    return c.json({ error: 'Failed to load plan', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Progress — and the percentage is STRUCTURALLY ABSENT when anything is blocked.
 *
 * `progress.display` is a discriminated union whose `blocked` variant has no `pct`
 * field at all (`deliveryView.ts:412`). A surface cannot render "60% done" on a
 * blocked engagement because it cannot narrow to a shape that has the number. Counts
 * survive into that variant on purpose: "3 of 5 complete, and one blocked" is a fact
 * about the plan, whereas the percentage is the thing that reads as momentum.
 */
gpsDeliveryRoutes.get('/engagements/:id/progress', requireOperator, async (c) => {
  try {
    const read = await readDesk(c);
    if (read.kind === 'early') return read.res;
    const desk = read.desk;
    return c.json({
      data: { asOf: desk.response.asOf, progress: desk.response.progress, notices: desk.response.notices },
      meta: { ...meta(), migrated: true, schemaGaps: DELIVERY_SCHEMA_GAPS },
    });
  } catch (err) {
    console.error('[gps-delivery] progress error:', err);
    return c.json({ error: 'Failed to load progress', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The evidence chase list.
 *
 * OVERDUE IS DERIVED AGAINST THIS RESPONSE'S `asOf`, NEVER STORED
 * (`isEvidenceOverdue`, `delivery.ts:868`): a stored flag is wrong the moment nobody
 * runs the job that sets it. `unmanaged` counts outstanding requests with no due date
 * — not overdue, which is worse, because nothing will ever flag them.
 *
 * `lockout` and `evidence.referenceNotice` travel on the response so a surface cannot
 * render this list without the sentence that says `externalLocation` is a note a
 * human typed about where the material lives in the client's own systems, and that
 * GPS never resolves it.
 */
gpsDeliveryRoutes.get('/engagements/:id/evidence', requireOperator, async (c) => {
  try {
    const read = await readDesk(c);
    if (read.kind === 'early') return read.res;
    const desk = read.desk;
    return c.json({
      data: { asOf: desk.response.asOf, evidence: desk.response.evidence, lockout: desk.response.lockout },
      meta: { ...meta(), migrated: true, unmapped: desk.unmapped, schemaGaps: DELIVERY_SCHEMA_GAPS },
    });
  } catch (err) {
    console.error('[gps-delivery] evidence error:', err);
    return c.json({ error: 'Failed to load evidence', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Acceptance, with every refusal reason on every row.
 *
 * `AcceptanceRow.verdict` is `canAccept`'s output unmodified — state, the boolean,
 * and every reason in the engine's order, hardest gate first. Nothing is filtered out
 * of the list: a deliverable that cannot be accepted appears WITH its reasons rather
 * than being quietly excluded (D2).
 *
 * The rule itself lives in two places and neither is this file:
 * `canAccept` (`delivery.ts:927`) states it where an operator can be told BEFORE they
 * try, and `gps_deliverable_no_acceptance_before_review`
 * (`0049_gps_delivery.sql:328`) enforces it against every caller including hand-run
 * SQL. `gateMechanism` and `gateDbConstraint` on the response name both.
 */
gpsDeliveryRoutes.get('/engagements/:id/acceptance', requireOperator, async (c) => {
  try {
    const read = await readDesk(c);
    if (read.kind === 'early') return read.res;
    const desk = read.desk;
    return c.json({
      data: { asOf: desk.response.asOf, acceptance: desk.response.acceptance, lockout: desk.response.lockout },
      meta: { ...meta(), migrated: true, unmapped: desk.unmapped, schemaGaps: DELIVERY_SCHEMA_GAPS },
    });
  } catch (err) {
    console.error('[gps-delivery] acceptance error:', err);
    return c.json({ error: 'Failed to load acceptance', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The coordination ceiling, DESK-WIDE — the answer to "can he take another one".
 *
 * Not scoped to an engagement, because the ceiling is his and everything already
 * running draws on it. Partners deliver; he sells and coordinates AROUND A FULL-TIME
 * LCX JOB, so coordination hours are the real capacity cap and WIP is a first-class
 * number rather than a report.
 *
 * EVERY HOUR HERE IS A PLACEHOLDER. `wip.basisIsMeasured` is false and
 * `wip.basisNote` says so BESIDE the number instead of quietly shading it (D3): only
 * the founder can supply the real figures. Read the shape and the ordering, not the
 * magnitudes. `hourDrivers` attributes every hour in the committed total to the
 * engagement that caused it, derived leave-one-out from the engine's own total so the
 * drivers cannot disagree with the number they explain (D1).
 */
gpsDeliveryRoutes.get('/wip', requireOperator, async (c) => {
  try {
    if (!(await isDeliveryMigrated(getPool()))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false } });
    }
    const { wip, gaps } = await deskWip(getPool());
    return c.json({ data: { wip }, meta: { ...meta(), migrated: true, schemaGaps: gaps } });
  } catch (err) {
    console.error('[gps-delivery] wip error:', err);
    return c.json({ error: 'Failed to load WIP', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The governed writes ───────────────────────────────────────────────────────
 *
 * VALIDATION BEFORE THE PROBE, on every one of them. A malformed request is
 * malformed in every environment, so answering 503 for a bad uuid would tell the
 * caller to retry something that can never succeed.
 *
 * REVIEW AND ACCEPTANCE REQUIRE `approver`; the rest require `operator`. That split
 * is not about seniority — it is about the shared machine key.
 * `access/entitlements.ts:39` `machineMap()` loops `WORKSPACE_IDS` granting
 * `operate`, so anything holding `OPERATOR_API_KEY` holds `gps` at operate and
 * authenticates as `{ id: 'operator' }` (`middleware/auth.ts:58`), while a desk
 * sign-in resolves the roster member's real role (`auth.ts:73`). Requiring
 * `approver` therefore means A CRON JOB OR AN INTEGRATION CANNOT SIGN OFF A REVIEW
 * OR RECORD A CLIENT'S ACCEPTANCE, no matter that it holds the compartment — the
 * same reasoning `routes/gps.ts:415` gives for the conflict check, and the same
 * accepted cost: sam holds `operate` (0047) and therefore cannot review or accept,
 * so work he coordinates waits for an approver. For the two events that let a
 * partner be paid and an invoice be raised, a bottleneck of two named people is the
 * correct trade. Second-tier `@lcx.com` sign-ins are always `operator`
 * (`auth.ts:78-110`), so they are outside both gates by construction.
 */

/**
 * Record the state of one milestone.
 *
 * The key is validated against the plan DERIVED FROM THE OFFER AS SOLD, not stored
 * as typed: an unknown key comes back 409 with the plan's keys attached rather than
 * creating a state row for work nobody sold.
 */
gpsDeliveryRoutes.post('/engagements/:id/milestones/:key/state', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const key = text(c.req.param('key'), 120);
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!key) return c.json({ error: 'a milestone key is required', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const state = body.state as MilestoneState;
    if (!MILESTONE_STATES.includes(state)) {
      return c.json(
        { error: `state must be one of ${MILESTONE_STATES.join(', ')}`, code: 'VALIDATION' },
        400,
      );
    }
    const blockedReason = text(body.blockedReason, 2000);
    // Asked for here so the answer is a 400 naming the field. The RULE lives in
    // gps_milestone_blocked_needs_reason (0049_gps_delivery.sql:180) and stands for
    // every caller including hand-run SQL; this is the polite version of it.
    if (state === 'blocked' && !blockedReason) {
      return c.json({
        error:
          'blockedReason is required for a blocked milestone — say what is actually stuck, in your own words. '
          + 'An unexplained block looks handled in a list view and is not.',
        code: 'VALIDATION',
      }, 400);
    }

    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await recordMilestoneState(getPool(), {
      engagementId: id,
      milestoneKey: key,
      state,
      blockedReason,
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({ data: result.value, meta: { ...meta(), recordedBy: result.operator } });
  } catch (err) {
    console.error('[gps-delivery] milestone state error:', err);
    return c.json({ error: 'Failed to record milestone state', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Declare a deliverable — what the client will receive, TRACKED AND NEVER HELD.
 *
 * `externalLocation` is a sentence an operator types about where the material
 * already lives in the CLIENT's own systems ("counsel's secure portal", "their data
 * room, folder 3"). It is stored as inert text and shown to a human. NOTHING IN GPS
 * RESOLVES IT, and the length and shape rules that make a smuggled payload fail
 * loudly are CHECK constraints in 0049 (`:298`), deliberately not re-implemented
 * here: a rejected `data:` URI comes back as the database's own refusal naming the
 * constraint, which is the answer that stays true if this handler is ever bypassed.
 */
gpsDeliveryRoutes.post('/engagements/:id/deliverables', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const title = text(body.title, 300);
    if (!title) {
      return c.json({
        error: 'title is required — name what the client receives, not a filename',
        code: 'VALIDATION',
      }, 400);
    }
    const owner = (body.owner ?? 'partner') as DeliverableOwner;
    if (!DELIVERABLE_OWNERS.includes(owner)) {
      return c.json({ error: `owner must be one of ${DELIVERABLE_OWNERS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    if (body.reviewRequired !== undefined && typeof body.reviewRequired !== 'boolean') {
      return c.json({ error: 'reviewRequired must be a boolean', code: 'VALIDATION' }, 400);
    }

    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await createDeliverable(getPool(), {
      engagementId: id,
      title,
      owner,
      // Defaults TRUE at the column (0049:268) and in the domain
      // (REVIEW_REQUIRED_BY_DEFAULT, delivery.ts:701). Turning it off is a visible,
      // per-row act, never the quiet path.
      reviewRequired: body.reviewRequired === undefined ? true : body.reviewRequired === true,
      externalLocation: text(body.externalLocation, 500),
      externalLocationNote: text(body.externalLocationNote, 1000),
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({ data: result.value, meta: { ...meta(), recordedBy: result.operator } }, 201);
  } catch (err) {
    console.error('[gps-delivery] create deliverable error:', err);
    return c.json({ error: 'Failed to create deliverable', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Ask the client, their counsel or a partner for an input we need.
 *
 * THE ASKING IS AS FAR AS THIS SYSTEM GOES. `description` is prose about the
 * material and is the closest GPS ever gets to it; there is no column for what comes
 * back and no route that could accept one. Naming a required input does not create a
 * place to upload it (`types.ts:135`).
 */
gpsDeliveryRoutes.post('/engagements/:id/evidence', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const description = text(body.description, 4000);
    if (!description) {
      return c.json({
        error: 'description is required — say what you need in words the client could act on',
        code: 'VALIDATION',
      }, 400);
    }
    // A due date is OPTIONAL and its absence is REPORTED, never defaulted to "soon":
    // an outstanding request with no date is not overdue, it is unmanaged, and
    // EvidenceChase.unmanaged counts exactly that (deliveryView.ts:640).
    if (body.dueBy !== undefined && body.dueBy !== null && !isoDate(body.dueBy)) {
      return c.json({ error: 'dueBy must be an ISO-8601 timestamp when supplied', code: 'VALIDATION' }, 400);
    }

    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await requestEvidence(getPool(), {
      engagementId: id,
      description,
      // A LABEL, deliberately not an email address and not a contact row: the less
      // third-party personal data sits on a licensed exchange's infrastructure, the
      // smaller the question D2 has to answer (0049:396).
      requestedFrom: text(body.requestedFrom, 200),
      dueBy: isoDate(body.dueBy),
      externalLocation: text(body.externalLocation, 500),
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({ data: result.value, meta: { ...meta(), requestedBy: result.operator } }, 201);
  } catch (err) {
    console.error('[gps-delivery] request evidence error:', err);
    return c.json({ error: 'Failed to record the request', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Settle an evidence request: it arrived, or it was waived.
 *
 * `received` means A HUMAN TICKED THAT THE CLIENT PROVIDED IT, WHEREVER THEY
 * PROVIDED IT — in a call, in their own portal, to counsel directly. It does not
 * mean anything arrived here and there is no column it could have arrived in
 * (`0049_gps_delivery.sql:373`).
 *
 * `refused` and `partially_received` are REFUSED rather than approximated: 0049 has
 * no literal for either, and storing a client's refusal as an open request is a
 * delivery date slipping with no named cause. The refusal says which literal is
 * missing.
 */
gpsDeliveryRoutes.post('/evidence/:id/status', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const status = body.status as EvidenceStatus;
    if (!EVIDENCE_STATUSES.includes(status)) {
      return c.json({ error: `status must be one of ${EVIDENCE_STATUSES.join(', ')}`, code: 'VALIDATION' }, 400);
    }

    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await setEvidenceStatus(getPool(), {
      evidenceId: id,
      status,
      externalLocation: text(body.externalLocation, 500),
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({ data: result.value, meta: { ...meta(), recordedBy: result.operator } });
  } catch (err) {
    console.error('[gps-delivery] evidence status error:', err);
    return c.json({ error: 'Failed to settle the request', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Record that a named human at LCX reviewed the deliverable.
 *
 * `reviewedBy` is the SESSION's operator and `reviewedAt` is the database's clock.
 * There is no body field for either, and that is the whole value of the row: an
 * unattributed sign-off is worse than none, because it looks like assurance.
 * `gps_deliverable_review_is_attributed` (`0049:320`) refuses a date without a name
 * whatever this handler does.
 *
 * Honest limit, stated because the row cannot state it: attribution is only as
 * strong as the shared DESK_PASSCODE until per-person credentials exist, so this is
 * self-asserted today (`0049:270`). Requiring `approver` narrows it to two named
 * people and excludes the machine key; it does not make it a signature.
 */
gpsDeliveryRoutes.post('/deliverables/:id/review', requireOperator, requireApprover, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await recordDeliverableReview(getPool(), {
      deliverableId: id,
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({
      data: result.value,
      meta: { ...meta(), reviewedBy: result.operator, mechanism: REVIEW_GATE_MECHANISM },
    });
  } catch (err) {
    console.error('[gps-delivery] review error:', err);
    return c.json({ error: 'Failed to record the review', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Accept a deliverable — the commercial event, and the most guarded write here.
 *
 * `canAccept` runs BEFORE the write and its refusal comes back WHOLE: every reason,
 * in the engine's order, hardest gate first. Nothing is summarised into one
 * sentence, because the operator has to tell a client something more useful than
 * REVIEW_OUTSTANDING.
 *
 * If the engine allows it and `gps_deliverable_no_acceptance_before_review`
 * (`0049:328`) refuses it anyway, the constraint's name comes back. That means this
 * code and the database disagree about the same rule, which is worth seeing rather
 * than smoothing over.
 */
gpsDeliveryRoutes.post('/deliverables/:id/accept', requireOperator, requireApprover, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!(await isDeliveryMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await acceptDeliverable(getPool(), {
      deliverableId: id,
      operator: operator?.id ?? 'unknown',
    });
    if (!result.ok) return writeRefusal(c, result);
    return c.json({
      data: result.value,
      // 0049 has no accepted_by column, so the acceptor is named on the response and
      // forgotten by the row — DELIVERY_SCHEMA_GAPS carries that gap and the ALTER
      // that closes it.
      meta: { ...meta(), acceptedBy: result.operator, schemaGaps: DELIVERY_SCHEMA_GAPS },
    });
  } catch (err) {
    console.error('[gps-delivery] accept error:', err);
    return c.json({ error: 'Failed to accept the deliverable', code: 'GPS_ERROR' }, 500);
  }
});
