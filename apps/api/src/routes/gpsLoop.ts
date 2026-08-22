import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  LOSS_REASONS,
  TARGET_FACTOR_KEYS,
  WEIGHTS_V1,
  WIN_REASONS,
  calibrationHealthView,
  marginRealisation,
  outcomeCaptureForm,
  reviewPacket,
  winLossSummary,
  type OutcomeCaptureDraft,
  type OutcomeDisposition,
  type OutcomeReason,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { isMigrated } from '../gps/service.js';
import { guardEngagementPerimeter, perimeterRefusalBody, perimeterStamp } from '../gps/perimeterGuard.js';
import {
  OUTCOME_MIGRATION,
  OUTCOME_MIGRATION_SPEC,
  OUTCOME_NOT_MIGRATED,
  emptyLoopSnapshot,
  getCaptureSubject,
  getStoredDraft,
  healthView,
  isOutcomeMigrated,
  loopSnapshot,
  marginView,
  monitorsView,
  rateBreaches,
  rateHonestyBreaches,
  recordOutcome,
  reviewView,
  winLossView,
} from '../gps/loop.js';

/**
 * GLOBAL SERVICES — Phase 12: THE OUTCOME LOOP, as an API.
 *
 *   GET  /outcome/:engagementId  the capture form for one engagement (blockers included)
 *   POST /outcome                record the outcome at close
 *   GET  /win-loss               win/loss summary — RATE SUPPRESSED BELOW n=8
 *   GET  /margin                 margin realisation, signed, cents
 *   GET  /review                 the quarterly weight-review packet
 *   GET  /health                 what can and cannot be concluded
 *   GET  /monitors               the five monitor SPECS, as data for a human to register
 *   GET  /                       all of the above in one response (LoopResponse)
 *
 * NOT MOUNTED BY THIS FILE, and the mount is not a free choice — see the wiring
 * note at the foot of this comment.
 *
 * ══ WHAT EVERY HANDLER RETURNS ══
 * `data` is ALWAYS a type declared in `packages/shared/src/gps/` — `WinLossSummary`,
 * `MarginRealisation`, `ReviewPacket`, `CalibrationHealthView`, `OutcomeCaptureForm`,
 * `LoopResponse`, or a `Pick` of `LoopResponse`. Nothing is re-shaped on the way
 * out and there is no API-local response interface, so `apps/web` has exactly one
 * declaration to import. A hand-copied web interface that declared fields the API
 * never returned crashed production this week; `tsc` believed the copy and the
 * mocked test agreed with it.
 *
 * ══ THE RATE IS THE POINT ══
 * Below `MIN_N_FOR_RATE` (8) the responses carry raw counts and a NULL rate. That
 * is asserted HERE, not only in the engine: `rateHonestyBreaches` runs over the
 * payload before it is serialised on both handlers that carry a rate, and a breach
 * REFUSES the response (500, `RATE_SUPPRESSION_BREACH`) rather than publishing a
 * percentage computed on three engagements. A refused response is recoverable; a
 * "33%" is not — it gets screenshotted into a deck and outlives the bug that
 * produced it.
 *
 * ══ MIGRATION-PENDING DISCIPLINE ══
 * `gps_outcome` DOES NOT EXIST YET (`OUTCOME_MIGRATION_SPEC` in `../gps/loop.ts`
 * specifies exactly what a human must apply). Reads answer 200 with a well-shaped
 * body composed on ZERO records and `migrated: false`; the write answers 503 with
 * the migration named, never 500. VALIDATION RUNS BEFORE THE PROBE, because a
 * malformed request is malformed in every environment — copied from
 * `routes/gps.ts`, where the same ordering is a ratchet.
 *
 * ══ NO CLIENT MATERIAL, STILL ══
 * An outcome is nine scalars plus a map of quote-time factor scores. There is no
 * upload, no multipart, no attachment field and no location an operator could type
 * here; `c.req.json` is the only reader in this file. Decision D2 (LCX DPO:
 * controller vs processor for third-party confidential material) is UNANSWERED and
 * `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers this file by path.
 *
 * ══ WIRING (files this phase does not own) ══
 *  1. MOUNT IT FROM INSIDE THE GPS ROUTER, i.e. `gpsRoutes.route('/loop', gpsLoopRoutes)`
 *     in `routes/gps.ts` — NOT `app.route('/v1/gps/loop', gpsLoopRoutes)` in app.ts.
 *     `intakeLockout.test.ts` fences the prefix: it asserts that every router
 *     mounted under `/v1/gps` in app.ts is `gpsRoutes`, so a second mount there
 *     turns the lockout red. Nesting keeps app.ts at one `/v1/gps` registration and
 *     keeps this router inside the compartment's `requireWorkspace('gps')` gate,
 *     which is where it belongs — this is the table holding what clients paid and
 *     what partners charged.
 *  2. `packages/shared/src/gps/index.ts` must export the Phase-12 block from
 *     `./loop.js` (the shared contract lists the symbols). Until it does, this file
 *     does not typecheck: every import above comes from `@lcx/shared`, deliberately,
 *     because the alternative is a deep import the package's `exports` map forbids.
 *  3. `apps/api/src/kpi/wbr.ts:76` — add `gps?: WbrGpsBlock` beside `program?` /
 *     `distribution?`, then fill it from `loopSnapshot(...).wbr`.
 *  4. A sixth `GPS_ACTIONS` entry (`apps/api/src/gps/actions.ts`) —
 *     `gps.outcome.record`, subjectType `gps_engagement`, minRole `operator` — so the
 *     write goes through `invokeAction` and lands in `object_actions` and the
 *     hash-chained `audit_log`. Until then `recorded_by`/`recorded_at` on the row are
 *     the only attribution, which `../gps/loop.ts` states rather than implies.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** Same shape check `routes/gps.ts` uses: a bad uuid is a 400, not a 22P02 → 500. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** YYYY-MM-DD, and a real calendar day: `2026-02-31` is a 400, not a rolled-over March. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isCalendarDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Money bound, matching `routes/gps.ts`: `bigint` in the database would accept a
 * 20-digit fat-finger and hand it back beyond `Number.MAX_SAFE_INTEGER`, where the
 * margin arithmetic stops being exact.
 *
 * NEGATIVES ARE NOT REJECTED HERE. `outcomeCaptureForm` has a
 * `negative_realised_figure` blocker with wording the surface already shows, and a
 * 400 would replace that reasoned refusal with a bare validation error (D2). Only
 * the shapes the engine cannot describe — non-integer, non-finite, absurd
 * magnitude — are refused at this boundary.
 */
const MAX_CENTS = 100_000_000_000;
function badCents(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  return typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > MAX_CENTS;
}

/** A body that is not JSON is a 400, not an unhandled throw. */
async function jsonBody(c: Context<{ Variables: AuthVariables }>): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await c.req.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const ALL_REASONS: readonly string[] = [...WIN_REASONS, ...LOSS_REASONS];

export const gpsLoopRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── The book-wide reads ──────────────────────────────────────────────────── */

/**
 * The whole loop. `?engagementId=` adds the capture block; without it `capture` is
 * null, which is a stated state of `LoopResponse` and not an omission.
 */
gpsLoopRoutes.get('/', requireOperator, async (c) => {
  const engagementId = c.req.query('engagementId');
  if (engagementId !== undefined && !isUuid(engagementId)) {
    return c.json({ error: 'engagementId must be a uuid', code: 'VALIDATION' }, 400);
  }
  const asOf = new Date().toISOString();
  try {
    const pool = getPool();
    if (!(await isOutcomeMigrated(pool))) {
      return c.json({ data: emptyLoopSnapshot(asOf), meta: { ...meta(), migrated: false, pendingMigration: OUTCOME_MIGRATION } });
    }
    const data = await loopSnapshot(pool, { asOf, engagementId: engagementId ?? null });

    // The one rate this response carries is the WBR's pooled win rate, and it is
    // gated on the way out for the same reason /win-loss is: the engine being right
    // has never been the failure mode.
    const breaches = rateBreaches('wbr.pooledWinRate', data.wbr.pooledWinRate);
    if (breaches.length > 0) {
      console.error('[gps.loop] REFUSED to publish a rate:', breaches);
      return c.json({ error: 'Refused to publish a win rate below the stated minimum sample size', code: 'RATE_SUPPRESSION_BREACH', breaches }, 500);
    }
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps.loop] snapshot error:', err);
    return c.json({ error: 'Failed to compose the outcome loop', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * Win/loss. THE SUPPRESSION IS ENFORCED HERE, not assumed from the engine.
 *
 * `WinLossSummary.byOffer` includes offers with zero outcomes — a missing row is
 * invisible, while a row reading "0 won / 0 lost" is the finding that the offer has
 * never been decided. That is what a review of a five-offer catalogue needs.
 */
gpsLoopRoutes.get('/win-loss', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const migrated = await isOutcomeMigrated(pool);
    const data = migrated ? await winLossView(pool) : winLossSummary([]);
    const breaches = rateHonestyBreaches(data);
    if (breaches.length > 0) {
      console.error('[gps.loop] REFUSED to publish a rate:', breaches);
      return c.json(
        {
          error: 'Refused to publish a win rate below the stated minimum sample size',
          code: 'RATE_SUPPRESSION_BREACH',
          breaches,
        },
        500,
      );
    }
    return c.json({ data, meta: { ...meta(), migrated, minNForRate: data.minNForRate } });
  } catch (err) {
    console.error('[gps.loop] win/loss error:', err);
    return c.json({ error: 'Failed to summarise win/loss', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * Margin realisation. Signed, integer cents.
 *
 * A realised LOSS (partner cost above price) arrives as a negative margin and a
 * negative slippage, and is counted in `negativeRealisedMarginCount`. Nothing on
 * this path takes an absolute value or clamps at zero: at $10–25k one scope overrun
 * eats the engagement, so the loss is the number the founder most needs to see.
 */
gpsLoopRoutes.get('/margin', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const migrated = await isOutcomeMigrated(pool);
    const data = migrated ? await marginView(pool) : marginRealisation([]);
    return c.json({ data, meta: { ...meta(), migrated } });
  } catch (err) {
    console.error('[gps.loop] margin error:', err);
    return c.json({ error: 'Failed to compute margin realisation', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * The quarterly review packet. READ-ONLY IN THE STRONGEST SENSE: there is no PATCH
 * or POST beside it, `proposedWeightChanges` is typed `never[]`, and `WEIGHTS_V1`
 * is the same frozen object after the request as before it.
 *
 * "FROZEN" IS NOW LITERAL. When this sentence was written `WEIGHTS_V1` was a plain
 * mutable object literal in `targeting.ts` and nothing enforced the claim — the only
 * frozen copy was the shallow one `weightReviewPacket` publishes. It is
 * `Object.freeze`d at the declaration now, so a write throws in strict mode (all ESM),
 * and `packet.weightsMutated` is DERIVED by comparing the weights the packet was
 * computed with against it rather than being a hard-coded `false` on the object whose
 * purpose is that assertion (D8).
 */
gpsLoopRoutes.get('/review', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const migrated = await isOutcomeMigrated(pool);
    const data = migrated ? await reviewView(pool) : reviewPacket([], WEIGHTS_V1);
    return c.json({ data, meta: { ...meta(), migrated } });
  } catch (err) {
    console.error('[gps.loop] review error:', err);
    return c.json({ error: 'Failed to compose the review packet', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/** What can and cannot be concluded. Six conclusions at every n, including zero. */
gpsLoopRoutes.get('/health', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const migrated = await isOutcomeMigrated(pool);
    const data = migrated ? await healthView(pool) : calibrationHealthView([]);
    return c.json({ data, meta: { ...meta(), migrated } });
  } catch (err) {
    console.error('[gps.loop] health error:', err);
    return c.json({ error: 'Failed to assess calibration health', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * The monitor specifications — DEFINITIONS, for a human to register through the
 * existing spine (`POST /v1/monitors`). Each proposes; none acts.
 *
 * DB-FREE, therefore no probe: it reads code constants only, and it keeps working
 * during the migration window. `METRIC_SQL` (`apps/api/src/intel/monitors.ts`)
 * whitelists nine asset metrics and has no GPS subject type, so NO spec can be
 * registered today; each spec's `wiringRequired` names exactly what to add, and
 * `registerableMonitorKeys` is the two whose thresholds do not rest on placeholder
 * prices, a bench that does not exist, or a perimeter-review date nobody supplied.
 */
gpsLoopRoutes.get('/monitors', requireOperator, async (c) => {
  /* MEASURED, not asserted: `monitorsView` probes the five registers and reports per
     monitor which inputs are still missing. A monitor that cannot be registered says
     WHY, in the owner's own terms, instead of being quietly absent from a list. */
  try {
    return c.json({ data: await monitorsView(getPool()), meta: meta() });
  } catch (err) {
    console.error('[gps] monitors view error:', err);
    return c.json({ error: 'Failed to read monitor registrability', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Capture: the record that has to exist at close ───────────────────────── */

/**
 * The capture form for one engagement.
 *
 * Works while 0050 is pending — the form is built from `gps_engagement` (0047), so
 * an operator can see the fields and the blockers before there is anywhere to save
 * them. `meta.outcomeStoreMigrated` distinguishes "nothing recorded yet" from
 * "cannot record yet"; collapsing those two is how a desk concludes the system lost
 * its data.
 */
gpsLoopRoutes.get('/outcome/:engagementId', requireOperator, async (c) => {
  const engagementId = c.req.param('engagementId');
  if (!isUuid(engagementId)) {
    return c.json({ error: 'engagementId must be a uuid', code: 'VALIDATION' }, 400);
  }
  try {
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false, outcomeStoreMigrated: false } });
    }
    const subject = await getCaptureSubject(pool, engagementId);
    if (!subject) return c.json({ error: 'Engagement not found', code: 'NOT_FOUND' }, 404);

    const storeReady = await isOutcomeMigrated(pool);
    const draft = storeReady ? await getStoredDraft(pool, engagementId) : undefined;
    const data = outcomeCaptureForm(subject, draft);
    return c.json({
      data,
      meta: { ...meta(), migrated: true, outcomeStoreMigrated: storeReady, pendingMigration: storeReady ? null : OUTCOME_MIGRATION },
    });
  } catch (err) {
    console.error('[gps.loop] capture form error:', err);
    return c.json({ error: 'Failed to build the capture form', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * Record the outcome at close.
 *
 * FIVE OUTCOMES, and the difference between them is the whole design:
 *   400 — the request is not describable (bad uuid, non-integer cents, unknown
 *         reason string, malformed date). Checked BEFORE the probe.
 *   404 — no such engagement.
 *   503 — describable and correct, but `gps_outcome` does not exist yet.
 *   409 — the jurisdictional perimeter refuses this jurisdiction/offer pair. Not a
 *         statement about the entry; see the gate below the probe.
 *   422 — describable, but these facts do not constitute a record. The response
 *         carries the FULL `OutcomeCaptureForm`, so the blockers, the per-field
 *         status and the reason options travel with the refusal instead of a toast
 *         saying "invalid" (D2). Nothing is written.
 *   200 — recorded, idempotently, attributed to `c.get('operator').id`.
 *
 * `minRole` is operator, not approver: the person who closed the engagement is the
 * only person who knows what was actually invoiced, and putting a second signature
 * in front of a bookkeeping fact is how books stop being kept. The approver gate
 * belongs on the proposal (where it already is), not on the record of what happened.
 */
gpsLoopRoutes.post('/outcome', requireOperator, async (c) => {
  const b = await jsonBody(c);
  if (!b) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

  const engagementId = b.engagementId;
  if (!isUuid(engagementId)) return c.json({ error: 'engagementId must be a uuid', code: 'VALIDATION' }, 400);

  const disposition = b.disposition;
  if (disposition !== undefined && disposition !== null && disposition !== 'won' && disposition !== 'lost') {
    return c.json({ error: "disposition must be 'won' or 'lost'", code: 'VALIDATION' }, 400);
  }
  const reason = b.reason;
  if (reason !== undefined && reason !== null && !ALL_REASONS.includes(reason as string)) {
    // A reason outside the union is a 400; a reason that is real but belongs to the
    // OTHER disposition is a 422 with `reason_invalid_for_disposition`, because that
    // one is a decision the operator can fix from the form.
    return c.json({ error: `reason must be one of ${ALL_REASONS.join(', ')}`, code: 'VALIDATION' }, 400);
  }
  if (badCents(b.realisedPriceCents) || badCents(b.realisedVendorCostCents)) {
    return c.json({ error: 'realised figures must be integer cents', code: 'VALIDATION' }, 400);
  }
  const cycle = b.cycleTimeDays;
  if (cycle !== undefined && cycle !== null && (typeof cycle !== 'number' || !Number.isInteger(cycle) || cycle < 0 || cycle > 3650)) {
    return c.json({ error: 'cycleTimeDays must be a whole number of days between 0 and 3650', code: 'VALIDATION' }, 400);
  }
  const firstPass = b.acceptanceFirstPass;
  if (firstPass !== undefined && firstPass !== null && typeof firstPass !== 'boolean') {
    // Never coerced. Null and false are opposite facts ("not delivered" vs "failed
    // first pass"), so a truthiness cast here would invent a quality signal.
    return c.json({ error: 'acceptanceFirstPass must be true, false or null', code: 'VALIDATION' }, 400);
  }
  const decidedAt = b.decidedAt;
  if (decidedAt !== undefined && decidedAt !== null && !isCalendarDate(decidedAt)) {
    return c.json({ error: 'decidedAt must be a real calendar date, YYYY-MM-DD', code: 'VALIDATION' }, 400);
  }
  const scores = factorScoreMap(b.factorScoresAtQuote);
  if (scores === false) {
    return c.json(
      {
        error:
          'factorScoresAtQuote must be an object of finite numbers keyed only by '
          + `${TARGET_FACTOR_KEYS.join(', ')}. It is the one jsonb column in this `
          + 'compartment and it holds scores, not free-form keys.',
        code: 'VALIDATION',
      },
      400,
    );
  }
  const partnerRaw = b.partner;
  if (partnerRaw !== undefined && partnerRaw !== null && typeof partnerRaw !== 'string') {
    return c.json({ error: 'partner must be a string or null', code: 'VALIDATION' }, 400);
  }

  const draft: OutcomeCaptureDraft = {
    disposition: (disposition ?? null) as OutcomeDisposition | null,
    reason: (reason ?? null) as OutcomeReason | null,
    realisedPriceCents: (b.realisedPriceCents ?? null) as number | null,
    realisedVendorCostCents: (b.realisedVendorCostCents ?? null) as number | null,
    cycleTimeDays: (cycle ?? null) as number | null,
    acceptanceFirstPass: (firstPass ?? null) as boolean | null,
    partner: typeof partnerRaw === 'string' && partnerRaw.trim() ? partnerRaw.trim().slice(0, 200) : null,
    decidedAt: (decidedAt ?? null) as string | null,
    factorScoresAtQuote: scores,
  };

  try {
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ error: 'GLOBAL SERVICES is awaiting migration 0047 on this environment', code: 'MIGRATION_PENDING' }, 503);
    }
    const subject = await getCaptureSubject(pool, engagementId);
    if (!subject) return c.json({ error: 'Engagement not found', code: 'NOT_FOUND' }, 404);

    if (!(await isOutcomeMigrated(pool))) {
      // 503 with the DDL named, so the answer is "run one file", not "the platform
      // is down". The form is included: the operator can see their entry was
      // acceptable and that the only missing thing is the table.
      return c.json(
        { ...OUTCOME_NOT_MIGRATED, migration: OUTCOME_MIGRATION_SPEC, form: outcomeCaptureForm(subject, draft) },
        503,
      );
    }

    /*
     * THE JURISDICTIONAL PERIMETER, IMMEDIATELY BEFORE THE WRITE.
     *
     * This route records a REALISED price and vendor cost against a named client's
     * engagement, and those figures are what `margin`, `win-loss` and the calibration
     * behind the next quote are computed from. It ran with the perimeter never
     * consulted, so a jurisdiction whose position is prohibited, unreviewed or past
     * its review date could still book realised revenue and then price future work
     * off it.
     *
     * REFUSING HERE DESTROYS NOTHING, which is why the gate is defensible on a
     * record-keeping route: `gps_outcome` is the analytic book, not the audit trail —
     * the engagement row, the proposal and `object_actions`/`audit_log` are unaffected —
     * and the refusal is recoverable, so the same facts record unchanged once a
     * qualified human enters the position. A 409 here means "the position is missing or
     * says no", never "your entry was wrong": that answer is the 422 below.
     *
     * The jurisdiction is read from `gps_client` through the engagement id, never from
     * the body — `engagementId` names the subject and decides nothing else. Placed
     * after the 503 so an unmigrated environment still gets "run one file", and last
     * before `recordOutcome` because that is where a reader looks for the thing that
     * stops the write.
     */
    const cleared = await guardEngagementPerimeter(pool, engagementId, {
      evaluatedBy: c.get('operator').id,
      asOf: new Date().toISOString(),
    });
    if (!cleared.allowed) {
      console.warn(`[gps.loop] perimeter REFUSED outcome for ${engagementId}: ${cleared.code}`);
      return c.json(perimeterRefusalBody(cleared), cleared.status as 404 | 409);
    }

    const { form, stored } = await recordOutcome(pool, {
      subject,
      draft,
      // ATTRIBUTION IS THE PRINCIPAL, NEVER A BODY FIELD. On a margin figure that
      // is the difference between a record and a rumour.
      recordedBy: c.get('operator').id,
    });
    if (!stored) {
      return c.json(
        { error: 'These facts do not yet constitute an outcome record', code: 'CAPTURE_BLOCKED', data: form, meta: { ...meta(), migrated: true, stored: false } },
        422,
      );
    }
    /*
     * STAMPED, AND IT MATTERS MORE HERE THAN ANYWHERE. A recorded outcome is the
     * analytic book the next quote is priced off (`calibration.ts`), so an outcome
     * booked in a jurisdiction with no legal position on file propagates into every
     * later price. The stamp travels with the record rather than only with the
     * refusal, which is what makes that traceable afterwards.
     */
    return c.json({
      data: { ...form, ...perimeterStamp(cleared) },
      meta: { ...meta(), migrated: true, stored: true, perimeterAdvisory: cleared.advisory },
    });
  } catch (err) {
    console.error('[gps.loop] record outcome error:', err);
    return c.json({ error: 'Failed to record the outcome', code: 'GPS_LOOP_ERROR' }, 500);
  }
});

/**
 * jsonb factor scores → a map of finite numbers, `null` when absent, or `false`
 * when the shape is wrong. Three-valued on purpose: absent is legitimate (the
 * engagement predates scoring) and must not be confused with malformed.
 */
/**
 * THE ONLY DOOR INTO THE ONE JSONB COLUMN GPS ADDS, so it is the door that has to
 * hold the intake lockout.
 *
 * `intakeLockout.test.ts` proves by CONTENT that no GPS table can hold bytes — no
 * bytea, no large object, no url/mime/filename column. It is blind to exactly one
 * shape, jsonb, which is why the set of jsonb columns is frozen and every addition
 * is reviewed. `gps_outcome.factor_scores_at_quote` (0053) is the second member of
 * that set, and it is written from THIS BODY FIELD.
 *
 * VALUES were already closed: a non-finite-number value refuses the whole request,
 * so no base64 string, nested object or array gets in.
 *
 * KEYS WERE NOT, and that was the hole. `Record<string, number>` accepted any key
 * name, of any length, in any quantity — so a payload could ride in the KEYS
 * (`{"<base64 chunk>": 1}`), and unlike a bad value it would survive: the read-side
 * `factorScores` (gps/loop.ts:244) filters values, not keys, and
 * `calibration.ts:732` publishes `Object.keys(...)` back out as `observedKeys`. A
 * write channel plus a read channel is a file store with extra steps.
 *
 * So the keys are now the six the scorer actually has. This is what 0053's own
 * comment already promised — "keyed by the six literal factor names in
 * TARGET_FACTOR_KEYS and nothing else" — and it was not true anywhere until here.
 *
 * REFUSED, NOT DROPPED. Silently discarding an unrecognised factor would throw away
 * a score the operator typed and report success; and a lockout that quietly ignores
 * what it will not store teaches nobody. The 400 names the offending key.
 */
export function factorScoreMap(v: unknown): Readonly<Record<string, number>> | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return false;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!(TARGET_FACTOR_KEYS as readonly string[]).includes(k)) return false;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
    out[k] = raw;
  }
  return out;
}
