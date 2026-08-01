import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
  DISCLOSURES_UNREVIEWED_REASON,
  DISCLOSURE_LIBRARY_VERSION,
  DisclosureError,
  ENGAGEMENT_STATUSES,
  OFFER_KEYS,
  PERIMETER_IS_UNREVIEWED,
  PERIMETER_REVIEW_WARNING_DAYS,
  PERIMETER_UNREVIEWED_REASON,
  SERVICE_CLASS_LABEL,
  SERVICE_GATE_ORDER,
  getDisclosureLibrarySnapshot,
  normaliseJurisdiction,
  type EngagementStatus,
  type OfferKey,
  type ServiceClass,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { isMigrated } from '../gps/service.js';
import {
  conflictWall,
  emptyWall,
  engagementDisclosureView,
  enterPosition,
  gateQuote,
  isPerimeterMigrated,
  loadPerimeter,
  perimeterView,
  recordDisclosure,
  reviewPosition,
  secondTierView,
  standingLimits,
  type ConflictPosition,
} from '../gps/conflict.js';

/**
 * GLOBAL SERVICES — THE CONFLICT WALL (Phase 9). The defensibility instrument.
 *
 *   GET  /wall                              every engagement's conflict position
 *   GET  /engagements/:id/disclosures       one engagement: the words, both sides
 *   POST /engagements/:id/disclosures       issue one, and record ITS VERSION
 *   GET  /perimeter                         the jurisdiction × offer grid
 *   POST /perimeter                         a human enters a position
 *   POST /perimeter/:id/review              a SECOND human reviews it
 *   POST /quote-gate                        may this be quoted into this place?
 *   GET  /policy                            the compiled library and the four limits
 *   GET  /sessions                          who came in on the shared passcode
 *
 * `export const gpsConflictRoutes` — THIS FILE DOES NOT MOUNT ITSELF. `app.ts` is
 * owned by a human wiring pass, and there is a live constraint it must respect:
 * `gps/__tests__/intakeLockout.test.ts:315` asserts that the ONLY router mounted
 * under `/v1/gps` is `gpsRoutes`, because the artifact lockout discovers files by
 * path and anything else served on that prefix would sit outside it. Composing
 * this router INTO `gpsRoutes` keeps that property true; mounting it separately
 * under `/v1/gps*` will fail that ratchet, and it should.
 *
 * WHY THIS IS A SEPARATE FILE FROM `routes/gps.ts` rather than nine more handlers
 * in it: `gps.ts` is Phase 1's sell path and is the subject of three source-level
 * ratchets that read it as text (`deploySafety`, `noIntake`, `intakeLockout`).
 * Phase 9 is a different concern — the record that makes the business defensible
 * — and keeping it separate means a change here cannot alter the shape those
 * ratchets are pattern-matching over there.
 *
 * ══ THERE IS NO UPLOAD, ATTACHMENT, MULTIPART OR FILE ROUTE IN THIS FILE. ══
 * The lockout of Phases 1 and 3 stands: decision D2 (LCX legal/DPO — controller
 * vs processor for a third party's confidential material) is still UNANSWERED, so
 * the system must remain INCAPABLE of accepting a client's material rather than
 * merely discouraged from it. Bodies are read as JSON and by no other means, and
 * `intakeLockout.test.ts` fails the build if that changes.
 *
 * THE DISCLOSURE TEXT IS NEVER READ FROM A REQUEST. `POST .../disclosures` takes a
 * template id and the human's assertions; the words are rendered server-side from
 * the compiled library and stored with their version. If a route accepted the
 * wording, the reviewed policy would be advisory and the column an auditor reads
 * would hold whatever the last caller sent.
 *
 * ATTRIBUTION IS ALWAYS `c.get('operator')`, NEVER A BODY FIELD — and the three
 * acts that create a record are `requireApprover`, following
 * `routes/gps.ts:439`. That is not role theatre: `access/entitlements.ts:39`
 * grants the SHARED MACHINE KEY `operate` on every workspace, so `operate` alone
 * would let a cron job or an integration author a compliance record. Second-tier
 * sign-in is also capped at `operator` (`middleware/auth.ts:94`), so a colleague
 * on the shared passcode can read this wall and change nothing on it.
 *
 * MIGRATION-PENDING DISCIPLINE, copied from `routes/gps.ts:34` because the deploy
 * ordering fact is identical — and here there are TWO migrations to be honest
 * about. 0047 (the compartment) and 0050 (this phase) land separately, so reads
 * degrade with `migrated` / `perimeterMigrated` flags and writes answer 503 naming
 * the migration that is missing. Validation always runs BEFORE the probe: a
 * malformed request is malformed in every environment.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** One clock per request. Passed down so nothing below reads the time twice. */
const nowIso = () => new Date().toISOString();

const NOT_MIGRATED_0047 = {
  error: 'GLOBAL SERVICES is awaiting migration 0047 on this environment',
  code: 'MIGRATION_PENDING',
};

/**
 * A distinct code from 0047's, on purpose. "The compartment does not exist yet"
 * and "the conflict wall's tables do not exist yet" are different operational
 * facts with different one-line fixes, and a UI that shows the same banner for
 * both sends someone to look at the wrong migration.
 */
const NOT_MIGRATED_0050 = {
  error: 'The conflict wall is awaiting migration 0050 on this environment',
  code: 'MIGRATION_PENDING_PERIMETER',
};

const SERVICE_CLASSES: readonly ServiceClass[] = [
  'permitted', 'counsel_required', 'partner_required', 'prohibited',
];

const CONFLICT_POSITIONS: readonly ConflictPosition[] = [
  'cleared', 'cleared_with_disclosure', 'declined', 'missing',
];

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Trim, collapse empty to null. */
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

const VALIDATION = 'VALIDATION';
const bad = (c: Context<{ Variables: AuthVariables }>, error: string) =>
  c.json({ error, code: VALIDATION }, 400);

/**
 * Translate a `DisclosureError` into a status and a code, with the ENGINE'S OWN
 * MESSAGE intact.
 *
 * The message is the product here (D2): "version 1 was requested but the library
 * is compiled at 2 — reproduce a historical disclosure from the stored text, not
 * from here" is what a person needs, and replacing it with "Bad Request" would
 * throw away the only part that helps. `unknown_template` is the caller's typo,
 * so 400; every other code means the request was well formed and the state
 * refuses it, so 409.
 */
function disclosureRefusal(c: Context<{ Variables: AuthVariables }>, err: DisclosureError) {
  const code = `DISCLOSURE_${err.code.toUpperCase()}`;
  const status = err.code === 'unknown_template' ? 400 : 409;
  return c.json({ error: err.message, code, data: { templateId: err.templateId } }, status);
}

export const gpsConflictRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── The wall ─────────────────────────────────────────────────────────────────── */

/**
 * EVERY ENGAGEMENT'S CONFLICT POSITION, IN ONE READ. Plan §5, 9.1.
 *
 * `missing` is a first-class position rather than an absent field, and it arrives
 * with `blocking` set when the engagement is at or past `proposed` — the states
 * `service.ts:760` already refuses to enter without a check. The database enforces
 * that; this makes it legible, which is the half that was missing.
 *
 * Nothing is filtered out for being gated. Each row carries the whole
 * `ServiceGateDecision` from the perimeter — code, reason, remedy, recoverable,
 * and every gate including the ones never reached — so a refusal appears WITH its
 * reason instead of as a row that quietly is not there (D2).
 *
 * `counts` are taken BEFORE `position` filtering, so narrowing the view to the
 * missing rows cannot make the total look smaller than it is.
 */
gpsConflictRoutes.get('/wall', requireOperator, async (c) => {
  try {
    const asOf = nowIso();
    const clientId = c.req.query('clientId');
    if (clientId !== undefined && !isUuid(clientId)) {
      return bad(c, 'clientId must be a uuid');
    }
    const rawStatus = c.req.query('status') as EngagementStatus;
    const rawPosition = c.req.query('position') as ConflictPosition;

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: emptyWall(asOf), meta: { ...meta(), migrated: false } });
    }
    const wall = await conflictWall(pool, asOf, {
      clientId,
      status: ENGAGEMENT_STATUSES.includes(rawStatus) ? rawStatus : undefined,
      position: CONFLICT_POSITIONS.includes(rawPosition) ? rawPosition : undefined,
      limit: Number(c.req.query('limit') ?? 200),
    });
    return c.json({ data: wall, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] conflict wall error:', err);
    return c.json({ error: 'Failed to load the conflict wall', code: 'GPS_ERROR' }, 500);
  }
});

/* ── One engagement's disclosure position ─────────────────────────────────────── */

/**
 * THE WORDS, ON BOTH SIDES. What was recorded, and what would be issued now.
 *
 * A READ ISSUES NOTHING. `drafts[].text` is rendered on the fly so a human can see
 * the exact wording before deciding, and `drafts[].recorded` says whether that
 * disclosure has actually been given. Nothing here writes, and the two facts are
 * separate fields precisely so a surface cannot present a preview as a record.
 *
 * A draft that CANNOT be produced comes back with `error` and `errorCode` rather
 * than being dropped — a client with no jurisdiction on file cannot be handed the
 * "position not established" notice, which names the jurisdiction, and that is a
 * finding rather than a blank.
 */
gpsConflictRoutes.get('/engagements/:id/disclosures', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return bad(c, 'id must be a uuid');

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false } });
    }
    const view = await engagementDisclosureView(pool, id, nowIso());
    if (!view) return c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: view, meta: { ...meta(), migrated: true } });
  } catch (err) {
    if (err instanceof DisclosureError) return disclosureRefusal(c, err);
    console.error('[gps] disclosure view error:', err);
    return c.json({ error: 'Failed to load disclosures', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * ISSUE A DISCLOSURE, AND RECORD THE VERSION. THE GOVERNED ACT OF PHASE 9.
 *
 * APPROVER-ONLY. Same reasoning as the conflict check (`routes/gps.ts:417`): the
 * shared machine key holds `gps` at `operate`, so requiring `approver` is what
 * stops a cron job, an integration, or a colleague on the second-tier passcode
 * from authoring the record that says a client was told something.
 *
 * `lcxAdjacent` IS REQUIRED AND NOT DEFAULTED. It decides whether the
 * cleared-with-disclosure wording applies (disclosure.ts:216), so a default would
 * be the system quietly answering a conflict question on the desk's behalf. A
 * missing or non-boolean value is a 400 that says to assert it.
 *
 * There is NO text field. The words come from the compiled library.
 */
gpsConflictRoutes.post('/engagements/:id/disclosures', requireOperator, requireApprover, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return bad(c, 'id must be a uuid');
    if (!body) return bad(c, 'body must be a JSON object');

    const templateId = text(body.templateId, 200);
    if (!templateId) {
      return bad(c, 'templateId is required — the wording comes from the compiled library, never from this request');
    }
    if (typeof body.lcxAdjacent !== 'boolean') {
      return bad(
        c,
        'lcxAdjacent must be true or false — whether this counterparty is or may become an LCX listing applicant is asserted by a human and never inferred, so there is no default',
      );
    }
    if (
      body.version !== undefined
      && (typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 1)
    ) {
      return bad(c, 'version, when supplied, must be a positive integer');
    }

    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED_0047, 503);
    if (!(await isPerimeterMigrated(pool))) return c.json(NOT_MIGRATED_0050, 503);

    const operator = c.get('operator');
    const result = await recordDisclosure(pool, {
      engagementId: id,
      templateId,
      version: body.version as number | undefined,
      lcxAdjacent: body.lcxAdjacent,
      decidedBy: operator?.id ?? 'unknown',
      asOf: nowIso(),
    });

    if (!result.ok) {
      if (result.reason === 'engagement_not_found') {
        return c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404);
      }
      // 409 and never an overwrite: the row is append-only in the database
      // (0050's BEFORE UPDATE trigger), because rewriting what a client was told
      // is the one thing this table exists to make impossible. Correcting a
      // disclosure means issuing another one.
      return c.json({
        error: 'this disclosure is already recorded for this engagement at this version — issue a new version instead of replacing it',
        code: 'ALREADY_RECORDED',
        data: { existing: result.existing },
      }, 409);
    }
    return c.json({
      data: {
        stored: result.stored,
        // Echoed so the response is self-explaining (D1): the words, whether the
        // template actually applied, and the exact context they were derived from.
        applies: result.rendered.applies,
        unreviewed: result.rendered.unreviewed,
        unreviewedReason: DISCLOSURES_UNREVIEWED_REASON,
        context: result.context,
      },
      meta: meta(),
    }, 201);
  } catch (err) {
    if (err instanceof DisclosureError) return disclosureRefusal(c, err);
    console.error('[gps] record disclosure error:', err);
    return c.json({ error: 'Failed to record the disclosure', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The perimeter ────────────────────────────────────────────────────────────── */

/**
 * THE JURISDICTION PERIMETER, READ. Plan §5, 9.3.
 *
 * NO `isMigrated` PROBE, AND THAT IS DELIBERATE RATHER THAN AN OVERSIGHT. This
 * handler answers before either migration exists, because there is something true
 * to say in that window: the compiled placeholders are what the gate is enforcing,
 * they are expired on arrival, and they authorise nothing. `source` and
 * `sourceReason` say which perimeter answered, and `storedRowCount: 0` is the
 * number that matters. A blank screen would have implied the question was
 * unanswerable when the answer is "nobody has entered a position".
 *
 * `holes` is the most important field here. The grid is (jurisdictions present) ×
 * (every offer), so a jurisdiction classified for one service and unclassified for
 * the other four shows four holes instead of looking complete (D2).
 */
gpsConflictRoutes.get('/perimeter', requireOperator, async (c) => {
  try {
    const asOf = nowIso();
    const view = perimeterView(await loadPerimeter(getPool()), asOf);
    return c.json({
      data: {
        ...view,
        // The vocabulary a dense surface needs, sent once rather than hard-coded
        // in the client: the four classes and their labels, and the gate order so
        // a refusal can be shown in the sequence it was evaluated.
        serviceClassLabels: SERVICE_CLASS_LABEL,
        gateOrder: SERVICE_GATE_ORDER,
        reviewWarningDays: PERIMETER_REVIEW_WARNING_DAYS,
        placeholdersAreUnreviewed: PERIMETER_IS_UNREVIEWED,
        unreviewedReason: PERIMETER_UNREVIEWED_REASON,
      },
      meta: { ...meta(), perimeterMigrated: await isPerimeterMigrated(getPool()) },
    });
  } catch (err) {
    console.error('[gps] perimeter error:', err);
    return c.json({ error: 'Failed to load the perimeter', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * A HUMAN ENTERS A POSITION. APPROVER-ONLY.
 *
 * THE ROW ARRIVES UNREVIEWED AND THEREFORE AUTHORISES NOTHING. There is no
 * `reviewed` field to send: review is a separate act by a different person
 * (`POST /perimeter/:id/review`), so a single request can never open a cell. The
 * response carries the resulting gate decision precisely so the person who just
 * typed it sees `perimeter_unreviewed` come straight back at them rather than
 * assuming the work is now permitted (D4 — the system argues back).
 *
 * A `reviewBy` IN THE PAST IS ACCEPTED. Counsel's two-year-old memo with an annual
 * review cycle is genuinely stale, and refusing to record it would mean the desk
 * cannot write down what it actually holds. It is recorded truthfully and the gate
 * refuses it as `perimeter_stale`, which is the honest outcome; the alternative
 * quietly encourages someone to type a future date to make the form accept it.
 *
 * `enteredBy` is the SESSION's operator, never a body field — and it is not a
 * claim of qualification. The qualified determination goes in `source` as a
 * citation; `entered_by` is accountability for having transcribed it faithfully.
 */
gpsConflictRoutes.post('/perimeter', requireOperator, requireApprover, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return bad(c, 'body must be a JSON object');

    const rawJurisdiction = text(body.jurisdiction, 200);
    if (!rawJurisdiction) return bad(c, 'jurisdiction is required');
    const jurisdiction = normaliseJurisdiction(rawJurisdiction);
    if (!jurisdiction) {
      return bad(c, 'jurisdiction must contain word characters — it is folded to a lookup key before it is stored');
    }
    const offerKey = body.offerKey as OfferKey;
    if (!OFFER_KEYS.includes(offerKey)) {
      return bad(c, `offerKey must be one of ${OFFER_KEYS.join(', ')} — a position on one service never transfers to another`);
    }
    const serviceClass = body.serviceClass as ServiceClass;
    if (!SERVICE_CLASSES.includes(serviceClass)) {
      return bad(c, `serviceClass must be one of ${SERVICE_CLASSES.join(', ')} — there is deliberately no 'unknown': unknown is the absence of a row`);
    }
    const source = text(body.source, 4000);
    if (!source) {
      return bad(c, 'source is required — cite what this position rests on. A position with no source cannot authorise work and will refuse as malformed');
    }
    const note = text(body.note, 4000);
    if (!note) {
      return bad(c, 'note is required — client-facing refusals quote it, so an empty note produces a refusal that explains nothing');
    }
    const reviewByRaw = text(body.reviewBy, 40);
    if (!reviewByRaw || !Number.isFinite(Date.parse(reviewByRaw))) {
      return bad(c, 'reviewBy must be an ISO instant — it is the EXPIRY of this position, and the gate refuses once it has passed');
    }
    const reviewBy = new Date(Date.parse(reviewByRaw)).toISOString();

    const pool = getPool();
    if (!(await isPerimeterMigrated(pool))) return c.json(NOT_MIGRATED_0050, 503);

    const operator = c.get('operator');
    const result = await enterPosition(pool, {
      jurisdiction,
      offerKey,
      serviceClass,
      source,
      // Never resolved, fetched or validated — a note to a human, capped in
      // length. A scheme check here would imply something reads it.
      sourceUrl: text(body.sourceUrl, 1000),
      note,
      reviewBy,
      enteredBy: operator?.id ?? 'unknown',
      supersede: body.supersede === true,
    });

    if (!result.ok) {
      return c.json({
        error: 'a position is already recorded for this jurisdiction and offer — resend with supersede: true to replace it, which resets its review',
        code: 'ALREADY_RECORDED',
        data: { existing: result.existing },
      }, 409);
    }
    const gate = await gateQuote(pool, { jurisdiction, offer: offerKey, asOf: nowIso() });
    return c.json({
      data: {
        position: result.position,
        superseded: result.superseded,
        gate: gate.decision,
        authorisesWorkNow: gate.decision.allowed,
      },
      meta: meta(),
    }, result.superseded ? 200 : 201);
  } catch (err) {
    console.error('[gps] enter position error:', err);
    return c.json({ error: 'Failed to record the position', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * A SECOND HUMAN REVIEWS IT. APPROVER-ONLY, AND FOUR-EYES.
 *
 * `reviewPosition` refuses when the reviewer is the person who entered the row.
 * Without that, "reviewed" would mean "typed twice by one person" and the
 * distinction between an entry and a review would be decorative — which is
 * exactly the D8 failure ("if a surface says verified, something verified it").
 *
 * The cost is accepted and stated: two named approvers hold `approve`
 * (`0047_gps.sql:327`), so both must act to open any cell, and one person acting
 * alone can open none.
 */
gpsConflictRoutes.post('/perimeter/:id/review', requireOperator, requireApprover, async (c) => {
  try {
    const id = c.req.param('id');
    const body = (await jsonBody(c)) ?? {};
    if (!isUuid(id)) return bad(c, 'id must be a uuid');

    let reviewBy: string | null = null;
    const raw = text(body.reviewBy, 40);
    if (raw !== null) {
      if (!Number.isFinite(Date.parse(raw))) {
        return bad(c, 'reviewBy, when supplied, must be an ISO instant');
      }
      reviewBy = new Date(Date.parse(raw)).toISOString();
    }

    const pool = getPool();
    if (!(await isPerimeterMigrated(pool))) return c.json(NOT_MIGRATED_0050, 503);

    const operator = c.get('operator');
    const result = await reviewPosition(pool, id, operator?.id ?? 'unknown', { reviewBy });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return c.json({ error: 'position not found', code: 'NOT_FOUND' }, 404);
      }
      return c.json({
        error: `${result.enteredBy} entered this position and may not also review it — a second qualified human must`,
        code: 'SELF_REVIEW_REFUSED',
      }, 409);
    }
    const gate = await gateQuote(pool, {
      jurisdiction: result.position.jurisdiction,
      offer: result.position.offerKey,
      asOf: nowIso(),
    });
    return c.json({
      data: {
        position: result.position,
        gate: gate.decision,
        // A reviewed position is still not necessarily permission: a reviewed
        // `counsel_required` cell refuses until an engagement names its counsel,
        // and a reviewed `prohibited` cell refuses permanently.
        authorisesWorkNow: gate.decision.allowed,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[gps] review position error:', err);
    return c.json({ error: 'Failed to review the position', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * MAY THIS SERVICE BE QUOTED INTO THIS JURISDICTION?
 *
 * The gate `routes/gps.ts POST /quote` does not run, exposed here rather than
 * bolted into that handler because `gps.ts` belongs to another owner and its
 * shape is what three source-level ratchets are matching over. A quote screen
 * calls this and shows the refusal beside the price.
 *
 * NOTHING IS WRITTEN AND NOTHING IS PERSISTED. A gate result is a reading of the
 * record at an instant, not an event: storing "the perimeter said yes on Tuesday"
 * would create a second, stale authority that does not notice the position
 * expiring on Wednesday.
 *
 * `counselEngaged` and `localPartnerId` are NAMES AND IDS, NOT FLAGS, and no
 * combination of them clears a prohibition — `gateService` evaluates
 * `service_prohibited` before staleness and has no override argument at all.
 */
gpsConflictRoutes.post('/quote-gate', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return bad(c, 'body must be a JSON object');

    const offer = body.offerKey as OfferKey;
    if (!OFFER_KEYS.includes(offer)) {
      return bad(c, `offerKey must be one of ${OFFER_KEYS.join(', ')}`);
    }
    // Free text, deliberately not validated against a jurisdiction list: no
    // regulatory fact in this programme is verified, so an unlisted string
    // resolves to `unknown_jurisdiction` and REFUSES, which is the answer.
    const jurisdiction = text(body.jurisdiction, 200);

    const result = await gateQuote(getPool(), {
      jurisdiction,
      offer,
      asOf: nowIso(),
      counselEngaged: text(body.counselEngaged, 300),
      localPartnerId: text(body.localPartnerId, 200),
    });
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[gps] quote gate error:', err);
    return c.json({ error: 'Failed to evaluate the perimeter', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Policy, and the second door ──────────────────────────────────────────────── */

/**
 * THE COMPILED POLICY, AS DATA. Plan §5, 9.2 and 9.4.
 *
 * Versions and titles without the texts, plus the four things GPS may never
 * promise. The four are surfaced because the standing statement's wording is
 * COMPOSED from those same sentences (disclosure.ts:190), so what a client is
 * handed and what the desk reads here are identical by construction rather than by
 * two people remembering to edit both.
 *
 * `unreviewed` travels with it and is true: this wording was written by an
 * engineer, not a lawyer. A surface that renders it without that badge is
 * misusing the response.
 */
gpsConflictRoutes.get('/policy', requireOperator, (c) =>
  c.json({
    data: {
      library: getDisclosureLibrarySnapshot(),
      libraryVersion: DISCLOSURE_LIBRARY_VERSION,
      unreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
      unreviewedReason: DISCLOSURES_UNREVIEWED_REASON,
      standingLimits: standingLimits(),
    },
    meta: meta(),
  }),
);

/**
 * WHO CAME IN ON THE SHARED PASSCODE. Plan §5, 9.5.
 *
 * APPROVER-ONLY, and the reason is not seniority. `unexpected` is the list of
 * non-roster addresses that have used the second tier — i.e. exactly what someone
 * who should not be here would want to know before deciding whether they have been
 * noticed. Second-tier sign-in is itself capped at `operator`
 * (`middleware/auth.ts:94`), so this endpoint is unreachable by the credential it
 * reports on, which is the property that makes it worth having.
 *
 * DB-free: the store is in memory (`lib/secondTier.ts:22`), so this answers during
 * any migration window, and `limits` carries the honest caveats — a restart forgets
 * every session, and a shared secret names a credential rather than a person.
 */
gpsConflictRoutes.get('/sessions', requireOperator, requireApprover, (c) =>
  c.json({ data: secondTierView(nowIso()), meta: meta() }),
);
