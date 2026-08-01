/**
 * GLOBAL SERVICES (GPS) — ORIGINATION routes, Phase 8.
 *   GET  /v1/gps/origination                        the queue, the cut, the ledger, the counts
 *   GET  /v1/gps/origination/refusals               the refusal ledger on its own (D2)
 *   GET  /v1/gps/origination/targets                the curated watchlist, thin
 *   POST /v1/gps/origination/targets                create or replace one target
 *   GET  /v1/gps/origination/:targetId/brief        the research brief, sealed (8.4)
 *   POST /v1/gps/origination/:targetId/facts        record provenance for one field (8.3)
 *   POST /v1/gps/origination/:targetId/why-now      record the why-now trigger (8.1)
 *   POST /v1/gps/origination/:targetId/opening      draft an opening — DRAFT ONLY (8.5)
 *
 * EXPORTED, NOT MOUNTED. `app.ts` and the workspace registry belong to the wiring
 * pass. Two notes for whoever does that mount, because both are traps:
 *
 *  1. `__tests__/intakeLockout.test.ts` ("mounts nothing under /v1/gps except the
 *     reviewed GPS router") asserts that every `app.route('/v1/gps…', X)` names
 *     `gpsRoutes`. Mounting THIS router directly in app.ts turns that assertion
 *     red. The intended shape is `gpsRoutes.route('/', gpsOriginationRoutes)`
 *     inside `routes/gps.ts`, which keeps one router on the prefix and keeps this
 *     compartment inside the ratchet that discovers files by path.
 *  2. `requireWorkspace('gps')` comes from the registry prefix, not from here.
 *     `gps` is `legacy:false` — DEFAULT-DENY — which is why this compartment may
 *     hold a third party's commercial terms at all.
 *
 * ══ THERE IS NO UPLOAD, ATTACHMENT, MULTIPART OR FILE ROUTE IN THIS FILE ══
 * Decision D2 (LCX legal/DPO: controller vs processor for a third party's
 * confidential material, the subprocessor chain, retention, erasure) is UNANSWERED,
 * so GPS is INCAPABLE of accepting a client document rather than discouraged from
 * it. Bodies are read as JSON and by no other means; migration 0050 adds no column
 * a document could be written to.
 *
 * MIGRATION-PENDING DISCIPLINE, copied from `routes/gps.ts:33` because the deploy
 * ordering fact is identical — the API ships on a push to main and 0050 is applied
 * by hand. Reads answer 200 with an empty, well-shaped body and `migrated: false`;
 * writes answer 503, NEVER 500, because a 500 in that window reads as "the platform
 * is down" and that is the reading people act on. Validation runs BEFORE the probe,
 * because a malformed request is malformed in every environment.
 *
 * ── NOTHING HERE SENDS ANYTHING ───────────────────────────────────────────────
 * `POST /:targetId/opening` writes a DRAFT. `ProposedOpening.approvedForSend` is
 * the literal `false` in the shared type, `gps_outreach_opening` has no approver,
 * recipient, channel or sent_at column, and no module reachable from here can
 * transmit. Approval-and-send is a governed action for `gps/actions.ts` behind
 * `invokeAction`, and this phase deliberately does not add it.
 *
 * ATTRIBUTION IS ALWAYS `c.get('operator')`, never a body field.
 *
 * ── THE ONE PENDING WIRING EDIT ───────────────────────────────────────────────
 * The engine is imported from the bare `@lcx/shared` specifier and
 * `packages/shared/src/gps/index.ts` does not re-export `origination.ts` yet, so
 * this file does not type-check until the wiring pass adds that line. That was the
 * lesser of the measured evils: a deep relative import is TS6059 under the API's
 * `rootDir`, and a deep `node_modules/@lcx/shared/src/…` import type-checks and
 * then cannot resolve in the container (`apps/api/Dockerfile` ships
 * `packages/shared/dist` only). A compile error beats a boot crash.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  OFFER_KEYS,
  TRIGGER_KIND_LABELS,
  buildOriginationQueue,
  originationResponse,
  type Credibility,
  type DeadlineKind,
  type DeliveryComplexityFlags,
  type OfferKey,
  type PerimeterStatus,
  type Reliability,
  type ScreeningResult,
  type TargetConflictStatus,
  type TriggerKind,
} from '@lcx/shared';
import { findMemberById } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  PROVENANCEABLE_FIELDS,
  TRIGGER_KINDS,
  briefFor,
  evaluateOpening,
  isOriginationMigrated,
  latestOpening,
  listTargetRecords,
  queueFor,
  recordTargetFact,
  recordTargetTrigger,
  saveOpening,
  saveTarget,
} from '../gps/origination.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Reads degrade to this shape's `migrated: false`; writes answer 503 with it. The
 * message names the migration because "one migration is pending" and "the platform
 * is down" require completely different reactions from the desk.
 */
const NOT_MIGRATED = {
  error: 'GPS ORIGINATION is awaiting migration 0050 on this environment',
  code: 'MIGRATION_PENDING',
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const SCREENINGS: readonly ScreeningResult[] = ['clear', 'concern', 'not_screened'];
const PERIMETERS: readonly PerimeterStatus[] = ['in_perimeter', 'outside_perimeter', 'unknown'];
const CONFLICTS: readonly TargetConflictStatus[] = [
  'cleared', 'cleared_with_disclosure', 'declined', 'unresolved',
];
const INTRO_PATHS = ['direct_relationship', 'warm_referral', 'cold'] as const;
const DEADLINE_KINDS: readonly DeadlineKind[] = ['regulatory', 'commercial', 'self_imposed'];
const RELIABILITIES: readonly Reliability[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Money validation. Integer cents, non-negative, bounded — the same ceiling and the
 * same reasoning as `routes/gps.ts:124`: `bigint` columns would happily take a
 * 20-digit fat-finger and hand it back beyond `Number.MAX_SAFE_INTEGER`, where the
 * arithmetic stops being exact.
 */
const MAX_CENTS = 100_000_000_000;
function badCents(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  return typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CENTS;
}

/** Trim, collapse to null when empty. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** An ISO instant, or null. Rejects anything Date.parse cannot read. */
function iso(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** A body that is not a JSON object is a 400, not an unhandled throw. */
async function jsonBody(c: Context<{ Variables: AuthVariables }>): Promise<Record<string, unknown> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * `capacity` from the query string.
 *
 * Absent means "let the engine apply its own stated prior" (`QUEUE_CAPACITY_DEFAULT`
 * = 12, a judgement about how much real calling fits in his day). This route does
 * NOT re-declare that default: a second copy of a prior is a second thing to review.
 * Out-of-range is a 400 rather than a clamp, because a silent clamp answers a
 * question the caller did not ask.
 */
const MAX_CAPACITY = 200;
function readCapacity(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) return 'invalid';
  return n;
}

/**
 * The instant the whole request is measured against.
 *
 * ONE clock per request, read once and threaded through every engine call, so the
 * queue's `asOf`, the provenance ages, the trigger shelf lives and the brief's
 * `generatedIso` cannot disagree by the milliseconds a slow query takes. `asOf` is
 * accepted from the query string for reproducing a payload exactly — the engines are
 * pure given it, which is the property that makes a dated printed brief (D7) mean
 * anything.
 */
function readAsOf(raw: string | undefined): number | 'invalid' {
  if (raw === undefined || raw === '') return Date.now();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 'invalid';
}

const VALIDATION = (error: string) => ({ error, code: 'VALIDATION' });

export const gpsOriginationRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── The queue, and the refusals ───────────────────────────────────────────── */

/**
 * THE QUEUE — slice 8.1, and the first surface `rankTargets` has ever had.
 *
 * The empty body served while 0050 is pending is built by the REAL ENGINE over zero
 * inputs, not written by hand. `buildOriginationQueue([])` produces the same shape
 * with `counts` all zero and the weights basis attached, so the pending state and
 * the live state cannot differ in shape — which is how the last hand-written empty
 * body in this compartment came to claim a `counts` field the API never returned.
 */
gpsOriginationRoutes.get('/origination', requireOperator, async (c) => {
  try {
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const capacity = readCapacity(c.req.query('capacity'));
    if (capacity === 'invalid') {
      return c.json(VALIDATION(`capacity must be an integer between 1 and ${MAX_CAPACITY}`), 400);
    }

    const pool = getPool();
    if (!(await isOriginationMigrated(pool))) {
      const empty = originationResponse(
        buildOriginationQueue([], { asOf: asOfMs, capacity: capacity ?? undefined }),
        new Date(asOfMs).toISOString(),
      );
      return c.json({ data: empty, meta: { ...meta(), migrated: false } });
    }
    const data = await queueFor(pool, { asOfMs, capacity: capacity ?? undefined });
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] origination queue error:', err);
    return c.json({ error: 'Failed to build the origination queue', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * THE REFUSAL LEDGER on its own — slice 8.2, the D2 centrepiece.
 *
 * Served from the SAME `queueFor` call the queue route uses, and the ledger is read
 * off that response rather than rebuilt. Two code paths would eventually disagree
 * about who was refused, and the version a reviewer would find is whichever one the
 * screen happened to call.
 *
 * `capacity` is not a parameter here on purpose: capacity defers, it never refuses,
 * and letting it appear on this route would invite the reading that a target can be
 * refused for not fitting in a day.
 */
gpsOriginationRoutes.get('/origination/refusals', requireOperator, async (c) => {
  try {
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);

    const pool = getPool();
    const migrated = await isOriginationMigrated(pool);
    const response = migrated
      ? await queueFor(pool, { asOfMs })
      : originationResponse(buildOriginationQueue([], { asOf: asOfMs }), new Date(asOfMs).toISOString());
    return c.json({
      data: {
        generatedIso: response.generatedIso,
        asOf: response.queue.asOf,
        refusals: response.queue.refusals,
        counts: response.counts,
      },
      meta: { ...meta(), migrated },
    });
  } catch (err) {
    console.error('[gps] refusal ledger error:', err);
    return c.json({ error: 'Failed to build the refusal ledger', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The curated watchlist ─────────────────────────────────────────────────── */

/**
 * The persisted targets, thin: identity, the recorded decisions, and who put each
 * one on the list. Not a second ranking — the queue is the ranking. This exists
 * because `DeferredCut.targetIds` and a refusal entry both name ids, and a surface
 * holding an id with no name has to guess.
 */
gpsOriginationRoutes.get('/origination/targets', requireOperator, async (c) => {
  try {
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const limitRaw = c.req.query('limit');
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      return c.json(VALIDATION('limit must be a positive integer'), 400);
    }

    const pool = getPool();
    if (!(await isOriginationMigrated(pool))) {
      return c.json({ data: [], meta: { ...meta(), migrated: false } });
    }
    const records = await listTargetRecords(pool, {
      asOfMs, limit, status: c.req.query('status') || undefined,
    });
    return c.json({ data: records, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] targets error:', err);
    return c.json({ error: 'Failed to load targets', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Create or REPLACE one target. A save states the whole target, not a patch — see
 * `TargetWrite` in `gps/origination.ts` for why, and for why an omitted decision
 * degrades to the unflattering default (`not_screened`, `unknown`, `unresolved`)
 * rather than to the reassuring one.
 *
 * `jurisdiction` is free text and NOTHING PARSES IT. Every jurisdiction rule in this
 * programme is unverified (plan §0), so the perimeter is a separate, human-stated
 * field (`perimeter`) and a string like "Cayman" infers no legal conclusion here.
 *
 * `identifiedNeeds` distinguishes three states and the API preserves all three:
 * ABSENT/null = need not established (unknown, zero points, confidence penalty),
 * `[]` = we looked and there is none (an answered field, no confidence penalty), a
 * list = the offers needed. That distinction is the difference between "call them"
 * and "don't", and collapsing it is why lead lists are useless.
 */
gpsOriginationRoutes.post('/origination/targets', requireOperator, async (c) => {
  try {
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const body = await jsonBody(c);
    if (!body) return c.json(VALIDATION('body must be a JSON object'), 400);

    const name = text(body.name, 200);
    if (!name) return c.json(VALIDATION('name is required'), 400);
    if (body.id !== undefined && body.id !== null && !isUuid(body.id)) {
      return c.json(VALIDATION('id must be a uuid when supplied (omit it to create)'), 400);
    }
    if (body.clientId !== undefined && body.clientId !== null && !isUuid(body.clientId)) {
      return c.json(VALIDATION('clientId must be a uuid when supplied'), 400);
    }
    if (body.screening !== undefined && !SCREENINGS.includes(body.screening as ScreeningResult)) {
      return c.json(VALIDATION(`screening must be one of ${SCREENINGS.join(', ')}`), 400);
    }
    if (body.perimeter !== undefined && !PERIMETERS.includes(body.perimeter as PerimeterStatus)) {
      return c.json(VALIDATION(`perimeter must be one of ${PERIMETERS.join(', ')}`), 400);
    }
    if (body.conflict !== undefined && !CONFLICTS.includes(body.conflict as TargetConflictStatus)) {
      return c.json(VALIDATION(`conflict must be one of ${CONFLICTS.join(', ')}`), 400);
    }
    if (body.offerKey !== undefined && body.offerKey !== null && !OFFER_KEYS.includes(body.offerKey as OfferKey)) {
      return c.json(VALIDATION(`offerKey must be one of ${OFFER_KEYS.join(', ')}`), 400);
    }
    if (
      body.introPath !== undefined && body.introPath !== null
      && !INTRO_PATHS.includes(body.introPath as (typeof INTRO_PATHS)[number])
    ) {
      return c.json(VALIDATION(`introPath must be one of ${INTRO_PATHS.join(', ')}`), 400);
    }
    if (
      body.deadlineKind !== undefined && body.deadlineKind !== null
      && !DEADLINE_KINDS.includes(body.deadlineKind as DeadlineKind)
    ) {
      return c.json(VALIDATION(`deadlineKind must be one of ${DEADLINE_KINDS.join(', ')}`), 400);
    }
    if (badCents(body.statedBudgetCents) || badCents(body.capitalProxyCents)
      || badCents(body.quotedPriceCents) || badCents(body.expectedVendorCostCents)) {
      return c.json(VALIDATION('money fields must be non-negative integer cents'), 400);
    }

    let needs: OfferKey[] | null = null;
    if (Array.isArray(body.identifiedNeeds)) {
      const bad = body.identifiedNeeds.filter((k) => !OFFER_KEYS.includes(k as OfferKey));
      if (bad.length > 0) {
        return c.json(VALIDATION(`identifiedNeeds may only contain ${OFFER_KEYS.join(', ')}`), 400);
      }
      needs = body.identifiedNeeds as OfferKey[];
    } else if (body.identifiedNeeds !== undefined && body.identifiedNeeds !== null) {
      return c.json(VALIDATION('identifiedNeeds must be an array of offer keys, [] or null'), 400);
    }

    const rawFlags = (body.complexity ?? null) as Record<string, unknown> | null;
    if (rawFlags !== null && (typeof rawFlags !== 'object' || Array.isArray(rawFlags))) {
      return c.json(VALIDATION('complexity must be an object of boolean flags, or null'), 400);
    }
    const complexity: DeliveryComplexityFlags | null = rawFlags === null ? null : {
      noNamedPartner: boolOrNull(rawFlags.noNamedPartner),
      scopeUndefined: boolOrNull(rawFlags.scopeUndefined),
      multiJurisdiction: boolOrNull(rawFlags.multiJurisdiction),
      translationRequired: boolOrNull(rawFlags.translationRequired),
      clientSideDependencies: boolOrNull(rawFlags.clientSideDependencies),
    };

    const evidence = (body.evidence ?? null) as Record<string, unknown> | null;
    if (evidence !== null && (typeof evidence !== 'object' || Array.isArray(evidence))) {
      return c.json(VALIDATION('evidence must be an object, or null'), 400);
    }
    const reliability = evidence?.reliability;
    if (reliability !== undefined && reliability !== null && !RELIABILITIES.includes(reliability as Reliability)) {
      return c.json(VALIDATION(`evidence.reliability must be one of ${RELIABILITIES.join(', ')}`), 400);
    }
    const credibility = evidence?.credibility;
    if (
      credibility !== undefined && credibility !== null
      && (typeof credibility !== 'number' || !Number.isInteger(credibility) || credibility < 1 || credibility > 6)
    ) {
      return c.json(VALIDATION('evidence.credibility must be an integer 1–6 (Admiralty)'), 400);
    }

    if (!(await isOriginationMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const record = await saveTarget(getPool(), {
      id: (body.id as string | null | undefined) ?? null,
      name,
      jurisdiction: text(body.jurisdiction, 200),
      clientId: (body.clientId as string | null | undefined) ?? null,
      status: text(body.status, 40),
      screening: (body.screening as ScreeningResult | undefined) ?? null,
      perimeter: (body.perimeter as PerimeterStatus | undefined) ?? null,
      conflict: (body.conflict as TargetConflictStatus | undefined) ?? null,
      demandsGuaranteedOutcome: boolOrNull(body.demandsGuaranteedOutcome),
      materiallyMisleading: boolOrNull(body.materiallyMisleading),
      decisionMakerName: text(body.decisionMakerName, 200),
      decisionMakerRole: text(body.decisionMakerRole, 200),
      decisionMakerIsBudgetHolder: boolOrNull(body.decisionMakerIsBudgetHolder),
      identifiedNeeds: needs,
      offerKey: (body.offerKey as OfferKey | null | undefined) ?? null,
      statedBudgetCents: (body.statedBudgetCents as number | undefined) ?? null,
      capitalProxyCents: (body.capitalProxyCents as number | undefined) ?? null,
      introPath: (body.introPath as (typeof INTRO_PATHS)[number] | null | undefined) ?? null,
      deadlineIso: iso(body.deadlineIso),
      deadlineKind: (body.deadlineKind as DeadlineKind | null | undefined) ?? null,
      quotedPriceCents: (body.quotedPriceCents as number | undefined) ?? null,
      expectedVendorCostCents: (body.expectedVendorCostCents as number | undefined) ?? null,
      complexity,
      // SUPPLYING FLAGS IS THE ASSESSMENT. The timestamp is what separates "nobody
      // has looked at delivery complexity" from "looked, and none of the five flags
      // fire" — the engine scores those differently and a schema of five booleans
      // alone would have made every unassessed target look clean.
      complexityAssessedIso: complexity === null ? null : (iso(body.complexityAssessedAt) ?? new Date(asOfMs).toISOString()),
      evidenceReliability: (reliability as Reliability | null | undefined) ?? null,
      evidenceCredibility: (credibility as Credibility | null | undefined) ?? null,
      // Allowed to be absent, unlike a fact's `observedIso` below, and the asymmetry
      // is not an oversight: an undated evidence grade is charged −10 confidence by
      // `computeConfidence` and says so on the row, whereas an undated OBSERVATION
      // would be stored in a NOT NULL column and come back looking fresh.
      evidenceObservedIso: iso((evidence ?? {}).observedIso),
      createdBy: operator?.id ?? 'unknown',
    }, asOfMs);
    return c.json({ data: record, meta: meta() }, body.id ? 200 : 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      return c.json({ error: 'client not found', code: 'NOT_FOUND' }, 404);
    }
    console.error('[gps] save target error:', err);
    return c.json({ error: 'Failed to save the target', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The brief — slice 8.4 ─────────────────────────────────────────────────── */

/**
 * One target's research brief, SEALED, with its refusal beside it.
 *
 * `refusal` travels WITH the brief rather than instead of it. A brief for a refused
 * target is legitimate — you still need to know who they are before you write the
 * decline — but a surface that renders one without the gate has rebuilt the silent
 * exclusion this phase exists to remove (D2).
 *
 * The response carries `brief.integrity`, and a caller must read it: `ok: false`
 * means the brief must not be carried into a client conversation, and
 * `integrity.violations` says which sentence is the problem and why. The route
 * answers 200 for a brief that fails integrity ON PURPOSE — the failure is a
 * PROPERTY OF THE BRIEF, not of the request, and hiding it behind a 4xx would leave
 * a surface with nothing to render except an error, which is how "no concerns"
 * becomes the reading.
 */
gpsOriginationRoutes.get('/origination/:targetId/brief', requireOperator, async (c) => {
  try {
    const targetId = c.req.param('targetId');
    if (!isUuid(targetId)) return c.json(VALIDATION('targetId must be a uuid'), 400);
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);

    const pool = getPool();
    if (!(await isOriginationMigrated(pool))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false } });
    }
    const data = await briefFor(pool, targetId, { asOfMs });
    if (data == null) return c.json({ error: 'target not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] brief error:', err);
    return c.json({ error: 'Failed to build the brief', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Provenance — slice 8.3 ────────────────────────────────────────────────── */

/**
 * Record the source of ONE scoring field.
 *
 * `field` must be one of the engine's `SCORING_FIELDS`: provenance for anything else
 * would be a grade attached to nothing, and the surface would have nowhere to print
 * it. The list comes from `packages/shared/src/gps/origination.ts:521`, so a seventh
 * scoring input in `targeting.ts` becomes recordable here without an edit.
 *
 * `observedIso` IS REQUIRED, and the refusal is the interesting part.
 * `observations.observed_at` is NOT NULL (0029_spine.sql:38), so an undated fact
 * stored here would come back looking as if it had been observed the moment it was
 * typed. Omitting the date is the cheapest way to fake freshness in any provenance
 * system, so this says no with a reason rather than laundering it into a grade that
 * looks fresh. `factProvenance` still supports the undated case for callers that can
 * represent it honestly; this storage cannot.
 *
 * `sourceUrl` is recorded and NEVER DEREFERENCED. Nothing in GPS retrieves anything.
 */
gpsOriginationRoutes.post('/origination/:targetId/facts', requireOperator, async (c) => {
  try {
    const targetId = c.req.param('targetId');
    if (!isUuid(targetId)) return c.json(VALIDATION('targetId must be a uuid'), 400);
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const body = await jsonBody(c);
    if (!body) return c.json(VALIDATION('body must be a JSON object'), 400);

    const field = text(body.field, 80);
    if (!field || !PROVENANCEABLE_FIELDS.includes(field)) {
      return c.json(
        VALIDATION(`field must be one of the scoring inputs: ${PROVENANCEABLE_FIELDS.join(', ')}`),
        400,
      );
    }
    const sourceId = text(body.sourceId, 80);
    if (!sourceId) {
      return c.json(VALIDATION('sourceId is required — an unsourced fact is not a fact'), 400);
    }
    const observedIso = iso(body.observedIso);
    if (!observedIso) {
      return c.json(
        VALIDATION(
          'observedIso is required and must be a parseable date — say WHEN this was observed to be true. '
          + 'An undated fact would be stored as if it were observed today, which is the one thing a provenance record must not do.',
        ),
        400,
      );
    }
    if (
      body.reliability !== undefined && body.reliability !== null
      && !RELIABILITIES.includes(body.reliability as Reliability)
    ) {
      return c.json(VALIDATION(`reliability must be one of ${RELIABILITIES.join(', ')}`), 400);
    }
    const credibility = body.credibility;
    if (
      credibility !== undefined && credibility !== null
      && (typeof credibility !== 'number' || !Number.isInteger(credibility) || credibility < 1 || credibility > 6)
    ) {
      return c.json(VALIDATION('credibility must be an integer 1–6 (Admiralty)'), 400);
    }

    if (!(await isOriginationMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const { provenance } = await recordTargetFact(getPool(), {
      targetId,
      fact: {
        field,
        label: text(body.label, 120),
        sourceId,
        sourceUrl: text(body.sourceUrl, 500),
        reliability: (body.reliability as Reliability | null | undefined) ?? null,
        credibility: (credibility as Credibility | null | undefined) ?? null,
        observedIso,
      },
      actor: operator?.id ?? 'unknown',
    }, asOfMs);
    return c.json({ data: { targetId, provenance }, meta: meta() }, 201);
  } catch (err) {
    console.error('[gps] record fact error:', err);
    return c.json({ error: 'Failed to record the fact', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The why-now trigger — slice 8.1 ───────────────────────────────────────── */

/**
 * Record the why-now.
 *
 * `kind` is a closed union and `statement` describes the EVENT. Free text with no
 * kind is how a why-now column decays into restating the score ("good fit"), and the
 * shelf life that ages this record is per-kind (`TRIGGER_SHELF_LIFE_DAYS`) — an
 * inbound request goes stale in 21 days, a regulatory deadline in 180.
 *
 * `occurredIso` MAY be omitted here, unlike a fact's `observedIso`, because
 * `TriggerState` has an `'undated'` state that says so on the surface and the event
 * date is stored where NULL is representable — see `toTriggerInput` in
 * `gps/origination.ts` for the two-clock reasoning.
 *
 * The source is mandatory: an unsourced why-now is a rumour with a date.
 */
gpsOriginationRoutes.post('/origination/:targetId/why-now', requireOperator, async (c) => {
  try {
    const targetId = c.req.param('targetId');
    if (!isUuid(targetId)) return c.json(VALIDATION('targetId must be a uuid'), 400);
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const body = await jsonBody(c);
    if (!body) return c.json(VALIDATION('body must be a JSON object'), 400);

    const kind = text(body.kind, 40);
    if (!kind || !TRIGGER_KINDS.includes(kind)) {
      return c.json(VALIDATION(`kind must be one of ${Object.keys(TRIGGER_KIND_LABELS).join(', ')}`), 400);
    }
    const statement = text(body.statement, 1000);
    if (!statement) {
      return c.json(
        VALIDATION('statement is required — describe the EVENT, not why the target is attractive'),
        400,
      );
    }
    const sourceId = text(body.sourceId, 80);
    if (!sourceId) {
      return c.json(VALIDATION('sourceId is required — an unsourced why-now is a rumour with a date'), 400);
    }
    if (
      body.reliability !== undefined && body.reliability !== null
      && !RELIABILITIES.includes(body.reliability as Reliability)
    ) {
      return c.json(VALIDATION(`reliability must be one of ${RELIABILITIES.join(', ')}`), 400);
    }
    const credibility = body.credibility;
    if (
      credibility !== undefined && credibility !== null
      && (typeof credibility !== 'number' || !Number.isInteger(credibility) || credibility < 1 || credibility > 6)
    ) {
      return c.json(VALIDATION('credibility must be an integer 1–6 (Admiralty)'), 400);
    }
    if (body.occurredIso !== undefined && body.occurredIso !== null && iso(body.occurredIso) === null) {
      return c.json(VALIDATION('occurredIso must be a parseable date when supplied'), 400);
    }

    if (!(await isOriginationMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const trigger = await recordTargetTrigger(getPool(), {
      targetId,
      kind: kind as TriggerKind,
      statement,
      occurredIso: iso(body.occurredIso),
      sourceId,
      sourceUrl: text(body.sourceUrl, 500),
      reliability: (body.reliability as Reliability | null | undefined) ?? null,
      credibility: (credibility as Credibility | null | undefined) ?? null,
      actor: operator?.id ?? 'unknown',
    }, asOfMs);
    return c.json({ data: { targetId, trigger }, meta: meta() }, 201);
  } catch (err) {
    console.error('[gps] record why-now error:', err);
    return c.json({ error: 'Failed to record the why-now trigger', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The proposed opening — slice 8.5. A DRAFT. NOTHING SENDS. ─────────────── */

/**
 * Draft an opening for a target, and refuse to store one the brief cannot support.
 *
 * WHAT THIS ROUTE DOES NOT DO, because the words "outreach" and "opening" invite the
 * assumption: it does not send, queue, schedule, enrol or address anything. There is
 * no recipient, channel or subject in the body; there is no such column in
 * `gps_outreach_opening`; `ProposedOpening.approvedForSend` is the literal `false` in
 * the shared type, so no code path can construct an approved one; and nothing
 * importable from here can transmit. Approval-and-send is a governed action for
 * `gps/actions.ts` behind `invokeAction`, with its own audit row, and it is
 * deliberately not part of this phase.
 *
 * THE REFUSAL IS THE FEATURE. The text is composed into the brief and sealed BEFORE
 * anything is written, and a blocking integrity violation is a 409 carrying the
 * violation codes — `opening_cites_unverified` when the line leans on a claim nobody
 * sourced, `opening_cites_unknown_assertion` when it cites a sentence that is not in
 * the brief, `opening_without_citations` when it cites nothing and does not declare
 * that it asserts nothing. That last forced choice removes the third option, which is
 * an uncited sentence that quietly asserts something about a client.
 *
 * A NAMED HUMAN, NEVER A SERVICE ACCOUNT. `access/entitlements.ts:39` `machineMap()`
 * grants every workspace at `operate` to the SHARED MACHINE KEY, so a cron or an
 * integration holding `OPERATOR_API_KEY` reaches this compartment. Requiring the
 * actor to be a roster member (the same `assertNamedHuman` mechanism as
 * `gps/actions.ts:156`) keeps a machine principal from authoring a sentence intended
 * for a third party, while leaving every desk member — including sam at `operate` —
 * able to draft. Role is the wrong lever here; personhood is the right one.
 */
gpsOriginationRoutes.post('/origination/:targetId/opening', requireOperator, async (c) => {
  try {
    const targetId = c.req.param('targetId');
    if (!isUuid(targetId)) return c.json(VALIDATION('targetId must be a uuid'), 400);
    const asOfMs = readAsOf(c.req.query('asOf'));
    if (asOfMs === 'invalid') return c.json(VALIDATION('asOf must be a parseable date'), 400);
    const body = await jsonBody(c);
    if (!body) return c.json(VALIDATION('body must be a JSON object'), 400);

    const openingText = text(body.openingText, 2000);
    if (!openingText) return c.json(VALIDATION('openingText is required'), 400);

    const cited = body.citedAssertionIds ?? [];
    if (!Array.isArray(cited) || cited.some((v) => typeof v !== 'string' || v.trim() === '')) {
      return c.json(VALIDATION('citedAssertionIds must be an array of assertion ids'), 400);
    }
    if (cited.length > 20) {
      return c.json(VALIDATION('citedAssertionIds may not exceed 20 entries'), 400);
    }
    if (body.assertsNothing !== undefined && typeof body.assertsNothing !== 'boolean') {
      return c.json(VALIDATION('assertsNothing must be a boolean when supplied'), 400);
    }
    const assertsNothing = body.assertsNothing === true;

    const operator = c.get('operator');
    const actor = operator?.id ?? 'unknown';
    if (!findMemberById(actor)) {
      return c.json({
        error:
          `An opening aimed at a client must be drafted by a named desk member — '${actor}' is a machine or unknown principal.`,
        code: 'NAMED_HUMAN_REQUIRED',
      }, 403);
    }

    if (!(await isOriginationMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const evaluated = await evaluateOpening(getPool(), {
      targetId,
      text: openingText,
      citedAssertionIds: cited as string[],
      assertsNothing,
      asOfMs,
    });
    if (evaluated == null) return c.json({ error: 'target not found', code: 'NOT_FOUND' }, 404);

    if (!evaluated.ok) {
      const blocking = evaluated.response.brief.integrity.violations.filter((v) => v.blocking);
      return c.json({
        error:
          'This opening is refused: the brief cannot support it. Nothing was stored, and nothing was sent.',
        code: 'BRIEF_INTEGRITY',
        data: {
          violations: blocking,
          codes: blocking.map((v) => v.code),
          integrity: evaluated.response.brief.integrity,
        },
      }, 409);
    }

    const stored = await saveOpening(getPool(), {
      targetId,
      text: openingText,
      citedAssertionIds: cited as string[],
      assertsNothing,
      integrityOk: true,
      draftedBy: actor,
    });
    // The brief is returned WITH the draft in place so the caller reads the same
    // verdict the GET will produce, and `approvedForSend: false` travels on it.
    return c.json({
      data: {
        opening: stored,
        approvedForSend: false as const,
        brief: evaluated.response.brief,
        refusal: evaluated.response.refusal,
      },
      meta: meta(),
    }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      return c.json({ error: 'target not found', code: 'NOT_FOUND' }, 404);
    }
    console.error('[gps] opening draft error:', err);
    return c.json({ error: 'Failed to draft the opening', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The latest stored draft for a target, on its own.
 *
 * Exists so a surface can show "there is already a draft, written by monty on the
 * 4th" without pulling the whole brief. `approvedForSend` is returned as the literal
 * `false` beside it, because the one question a reader of a stored draft asks is
 * whether it went out, and the answer is that nothing in this system can make it.
 */
gpsOriginationRoutes.get('/origination/:targetId/opening', requireOperator, async (c) => {
  try {
    const targetId = c.req.param('targetId');
    if (!isUuid(targetId)) return c.json(VALIDATION('targetId must be a uuid'), 400);

    const pool = getPool();
    if (!(await isOriginationMigrated(pool))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false } });
    }
    const opening = await latestOpening(pool, targetId);
    return c.json({
      data: opening === null ? null : { opening, approvedForSend: false as const },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] opening read error:', err);
    return c.json({ error: 'Failed to load the opening draft', code: 'GPS_ERROR' }, 500);
  }
});
