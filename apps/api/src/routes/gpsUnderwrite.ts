import { Hono } from 'hono';
import type { Context, MiddlewareHandler, Next } from 'hono';
import {
  DEFAULT_EFFORT_UPLIFTS,
  DEFAULT_ISSUE_POLICY,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  ISSUE_POLICY_IS_A_STATED_PRIOR,
  PERCENTILE_METHOD,
  UNDERWRITE_METHOD,
  placeholderEffortTriples,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  ISSUE_GUARD_FAILS_CLOSED,
  MIN_DECISION_SAMPLES,
  PLACEHOLDER_CARD_CANNOT_PRICE,
  RATE_CARDS_ARE_PLACEHOLDERS,
  SERVER_FACT_FIELDS,
  UNDERWRITING_MIGRATION,
  UNDERWRITING_MIGRATION_SPEC,
  buildUnderwriting,
  engagementHasPartnerColumn,
  guardProposalIssue,
  tightenPolicy,
  underwritingRegistries,
  validateUnderwriteBody,
  type UnderwriteInput,
  type UnderwritingResult,
} from '../gps/underwrite.js';

/**
 * GLOBAL SERVICES (GPS) — PHASE 7 UNDERWRITING ROUTES.
 *
 *   POST /underwriting            price + offer + partner → the margin DISTRIBUTION
 *   POST /underwriting/sensitivity   the same run, projected to the overrun ladder
 *   POST /underwriting/argument      the same run, projected to the devil's advocate
 *   GET  /underwriting/engagements/:id  the same, from the ROW — what the guard sees
 *   GET  /underwriting/policy        the appetite, the placeholders, what is missing
 *
 * Exported and NOT MOUNTED. The wiring instruction is at the bottom of this
 * docblock and it matters more than usual, because mounting this in the wrong place
 * trips a ratchet.
 *
 * ── ONE SIMULATION, THREE PROJECTIONS ────────────────────────────────────────
 * `/sensitivity` and `/argument` do not re-run anything: both call
 * `buildUnderwriting` and return a FIELD of the single seeded result, exactly as
 * `buildUnderwriteResponse` produced it. Two runs would be two opinions on one
 * screen, and a p50 that differs by $40 between two panels teaches the desk to
 * distrust the instrument. They exist as separate routes so a panel can refresh one
 * without re-reading the rest, not so it can get a second answer.
 *
 * ── EXPLORATION IS NOT ISSUANCE ──────────────────────────────────────────────
 * Everything here is READ-ONLY and nothing is persisted; an underwriting is a
 * computation over rows. The POST verb is used because the inputs are a body, not
 * because state changes. The block decision on these responses is ADVISORY: the
 * authoritative one is `requireUnderwritingClearance` below, which reads the
 * engagement row and ignores every request field. `meta.issueDecisionIsAdvisory`
 * says so on every response, because a surface that shows a green light computed
 * from a body the caller chose is the "warns but permits" failure in reverse.
 *
 * ── MIGRATION-PENDING DISCIPLINE ─────────────────────────────────────────────
 * Same as `routes/gps.ts`, with one deliberate difference: there is no 503 here,
 * because there is no write. When the registries are absent the answer is 200 with
 * a well-shaped body whose underwriting is a REFUSAL naming the missing migration
 * (`meta.migrated: false`). Validation still runs BEFORE any probe — a malformed
 * request is malformed in every environment.
 *
 * ── ATTRIBUTION ──────────────────────────────────────────────────────────────
 * `c.get('operator')`, never a body field, for the effort triple's `statedBy`, the
 * policy's `statedBy` and the guard's `evaluatedBy`. A body field naming who stated
 * a risk appetite would make the record a claim about who set it rather than a
 * record of it — the rule the conflict check already applies to `decidedBy`
 * (`routes/gps.ts:438`).
 *
 * ── THERE IS NO ARTIFACT INTAKE HERE ─────────────────────────────────────────
 * No client material reaches these routes: the inputs are numbers, an offer key and
 * a partner id. Decision D2 (LCX legal/DPO — controller vs processor for a third
 * party's confidential material) is UNANSWERED and
 * `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers this file by path.
 *
 * ══ WIRING (a human does this; this file edits nothing else) ══════════════════
 *  1. In `apps/api/src/routes/gps.ts`, mount this router INSIDE `gpsRoutes`:
 *         gpsRoutes.route('/underwriting', gpsUnderwriteRoutes);
 *     NOT in `app.ts`. `intakeLockout.test.ts:315` asserts that the only router
 *     mounted under `/v1/gps` is `gpsRoutes` — a second `app.route('/v1/gps', …)`
 *     fails the build, by design, because the ratchet discovers files by path and a
 *     router mounted from elsewhere escapes it. Mounting inside `gpsRoutes` also
 *     keeps `requireWorkspace('gps')` in front of everything here.
 *  2. On the proposal route in the same file, add ONE middleware token:
 *         gpsRoutes.post('/engagements/:id/proposal',
 *           requireOperator, requireUnderwritingClearance, async (c) => { … });
 *     Nothing inside that handler changes; `deploySafety.test.ts` still sees its
 *     `isMigrated()` probe.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

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
 * Everything the three body routes share: validate, resolve the appetite, run the
 * one simulation. Returns the result or the response to send instead — so a caller
 * cannot forget a step and quietly underwrite on a loosened policy.
 */
async function runFromBody(
  c: Context<{ Variables: AuthVariables }>,
): Promise<{ ok: true; result: UnderwritingResult; input: UnderwriteInput } | { ok: false; res: Response }> {
  const body = await jsonBody(c);

  // ONE clock read per request, before anything else, so that the staleness check,
  // the `asOf` consistency check and every timestamp on the response share a single
  // instant. Two `Date.now()` calls in one request is how a figure ends up dated a
  // millisecond after the rate card it was refused for.
  const now = new Date();
  const asOf = now.toISOString();

  // Validation BEFORE the probe, on every path: a malformed request is malformed in
  // every environment, and answering "awaiting migration" to a bad body sends the
  // desk to the database over a typo.
  const validated = validateUnderwriteBody(body, now.getTime());
  if (!validated.ok) {
    return { ok: false, res: c.json({ error: validated.error, code: validated.code }, 400) };
  }

  const operator = c.get('operator')?.id ?? 'unknown';
  const policy = tightenPolicy(validated.input.policy, operator, asOf);
  if (!policy.ok) {
    return {
      ok: false,
      res: c.json(
        { error: policy.reason, code: 'POLICY_CANNOT_BE_LOOSENED', data: { field: policy.field } },
        400,
      ),
    };
  }

  const result = await buildUnderwriting(getPool(), validated.input, {
    operator,
    asOf,
    policy: policy.policy,
    tightened: policy.tightened,
  });
  return { ok: true, result, input: validated.input };
}

/** The envelope every underwriting response shares. */
function envelope(result: UnderwritingResult) {
  return {
    ...meta(),
    migrated: result.provenance.registries.rateCards,
    /** The block decision here is a preview; the guard decides on issue. */
    issueDecisionIsAdvisory: true,
    authoritativeAt: 'POST /v1/gps/engagements/:id/proposal (requireUnderwritingClearance)',
    provenance: result.provenance,
  };
}

export const gpsUnderwriteRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * UNDERWRITE A PRICE THE FOUNDER IS STILL TYPING.
 *
 * The whole screen in one payload: the margin distribution with p10/p50/p90 beside
 * (never inside) the estimate, `pLoss` with its ICD-203 wording, the variance
 * attribution, the overrun ladder, the block decision and the three arguments
 * against the quote. `data` is the shared `UnderwriteResponse` and NOTHING ELSE —
 * the API adds no field to it, so the web imports that one declaration and there is
 * no second copy to drift (the `counts` / `clientCount` / `openValueCents` failure,
 * `GPS_100X_PLAN.md` §1 D8). Server-side facts the shared type has no room for
 * travel in `meta.provenance`.
 */
gpsUnderwriteRoutes.post('/', requireOperator, async (c) => {
  try {
    const run = await runFromBody(c);
    if (!run.ok) return run.res;
    return c.json({ data: run.result.response, meta: envelope(run.result) });
  } catch (err) {
    console.error('[gps] underwrite error:', err);
    return c.json({ error: 'Failed to underwrite this quote', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * WHAT A SCOPE SLIP DOES TO THE MARGIN, at +10/+25/+50% effort by default.
 *
 * The baseline row (0%) is included by the engine and is byte-identical to the
 * distribution `POST /` returns for the same inputs, so the two panels cannot
 * disagree. `monotone` is on the payload: median margin non-increasing and P(loss)
 * non-decreasing is arithmetic here rather than statistical (common random
 * numbers), so a surface can state the property from data — and a regression in the
 * sampler becomes visible instead of silent.
 */
gpsUnderwriteRoutes.post('/sensitivity', requireOperator, async (c) => {
  try {
    const run = await runFromBody(c);
    if (!run.ok) return run.res;
    return c.json({
      data: run.result.response.sensitivity,
      meta: {
        ...envelope(run.result),
        defaultUpliftsPct: DEFAULT_EFFORT_UPLIFTS,
        requestedUpliftsPct: run.input.uplifts ?? DEFAULT_EFFORT_UPLIFTS,
      },
    });
  } catch (err) {
    console.error('[gps] underwrite sensitivity error:', err);
    return c.json({ error: 'Failed to build the overrun sensitivity', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * THE SYSTEM ARGUES BACK (D4) — the three most likely reasons this runs over.
 *
 * From recorded outcomes when any exist, from the offer's own exclusions before
 * then, and it says WHICH on every response. A candidate with zero occurrences is
 * never promoted to a "most likely reason" merely because its category exists.
 * `meta.provenance.outcomes.statement` carries what the outcome form never asked
 * for, so an argument that cannot be raised reads as a gap in the record rather
 * than as evidence it has never happened.
 */
gpsUnderwriteRoutes.post('/argument', requireOperator, async (c) => {
  try {
    const run = await runFromBody(c);
    if (!run.ok) return run.res;
    return c.json({ data: run.result.response.devilsAdvocate, meta: envelope(run.result) });
  } catch (err) {
    console.error('[gps] underwrite argument error:', err);
    return c.json({ error: 'Failed to build the argument against this quote', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * WHAT THE GUARD WILL SAY, BEFORE ANYONE CLICKS ISSUE.
 *
 * A GET with no body, because every input is a server fact: the price, currency and
 * offer from `gps_engagement`, the partner from its assignment, the rate from the
 * registry, the appetite from the server policy. It calls `guardProposalIssue` —
 * THE SAME FUNCTION the middleware calls — so the preview and the enforcement
 * cannot disagree. A separate "check" implementation is how a UI ends up showing
 * green while the server refuses.
 *
 * 200 WITH A REFUSAL IN THE BODY, not 409: the question asked was "what would
 * happen", and the honest answer to that question is not an error. A missing
 * engagement is still a 404, because that is a client mistake rather than a
 * refusal.
 */
gpsUnderwriteRoutes.get('/engagements/:id', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);

    const decision = await guardProposalIssue(getPool(), id, {
      operator: c.get('operator')?.id ?? 'unknown',
      asOf: new Date().toISOString(),
    });
    if (decision.code === 'NOT_FOUND') {
      return c.json({ error: decision.reason, code: 'NOT_FOUND' }, 404);
    }
    return c.json({
      data: decision,
      meta: {
        ...meta(),
        migrated: decision.code !== 'MIGRATION_PENDING',
        issueDecisionIsAdvisory: false,
        provenance: decision.provenance,
      },
    });
  } catch (err) {
    console.error('[gps] underwrite engagement error:', err);
    return c.json({ error: 'Failed to underwrite this engagement', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * THE APPETITE, THE PLACEHOLDERS, AND WHAT IS MISSING — as data.
 *
 * So the screen renders the ONE EDITABLE BLOCK from the server rather than
 * hard-coding five rows that will drift the first time an offer is added, and so
 * "why can nothing be underwritten here" is answerable without reading the source.
 * `unresolvedInputs` is deliberately a list of sentences and not a boolean: the
 * founder needs to know WHICH of the four inputs to supply first.
 */
gpsUnderwriteRoutes.get('/policy', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const [registries, partnerColumn] = await Promise.all([
      underwritingRegistries(pool),
      engagementHasPartnerColumn(pool),
    ]);

    const unresolvedInputs: string[] = [];
    if (!registries.rateCards) {
      unresolvedInputs.push(
        `No partner rate card registry on this environment (migration ${UNDERWRITING_MIGRATION}). `
        + 'Until one exists, nothing can be underwritten and no proposal can be issued: '
        + PLACEHOLDER_CARD_CANNOT_PRICE,
      );
    }
    if (!registries.effortTriples) {
      unresolvedInputs.push(
        'No effort-triple registry, so partner-days per engagement come from the shipped placeholder. '
        + 'GPS_100X_PLAN.md §12 names this as the one input that turns this screen from a prior into a model, '
        + 'and only the founder can supply it.',
      );
    }
    if (!partnerColumn) {
      unresolvedInputs.push(
        'Engagements cannot record who is delivering them, so no engagement can be underwritten from its row.',
      );
    }
    if (DEFAULT_ISSUE_POLICY.minP50MarginPct === null) {
      unresolvedInputs.push(
        'No minimum margin floor has been set, so only P(loss) can block an issue. A floor is a founder '
        + 'decision and is deliberately not invented here.',
      );
    }

    return c.json({
      data: {
        policy: DEFAULT_ISSUE_POLICY,
        policyNotice: ISSUE_POLICY_IS_A_STATED_PRIOR,
        perimeterGateNotice: ISSUE_GUARD_FAILS_CLOSED,
        method: UNDERWRITE_METHOD,
        percentileMethod: PERCENTILE_METHOD,
        minDecisionSamples: MIN_DECISION_SAMPLES,
        /** Fields a caller may not supply, with the reason each is refused. */
        serverFacts: SERVER_FACT_FIELDS,
        rateCardsArePlaceholders: RATE_CARDS_ARE_PLACEHOLDERS,
        placeholderCardCannotPrice: PLACEHOLDER_CARD_CANNOT_PRICE,
        effortTriplesArePlaceholders: EFFORT_TRIPLES_ARE_PLACEHOLDERS,
        /** The one editable block, from data. Every row is badged `isPlaceholder`. */
        placeholderEffortTriples: placeholderEffortTriples(),
        registries: { ...registries, engagementPartnerColumn: partnerColumn },
        migration: UNDERWRITING_MIGRATION_SPEC,
        unresolvedInputs,
      },
      meta: { ...meta(), migrated: registries.rateCards },
    });
  } catch (err) {
    console.error('[gps] underwrite policy error:', err);
    return c.json({ error: 'Failed to load the underwriting policy', code: 'GPS_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE GUARD, AS ONE MIDDLEWARE TOKEN                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * INSTALL THIS ON THE PROPOSAL ROUTE. It is the difference between an instrument
 * and a warning label.
 *
 *     gpsRoutes.post('/engagements/:id/proposal',
 *       requireOperator, requireUnderwritingClearance, async (c) => { … });
 *
 * A middleware rather than a call inside the handler, for one specific reason:
 * `issueProposal` MOVES THE ENGAGEMENT TO `proposed` before it assembles anything
 * (`service.ts:975` → `setEngagementStatus`). A check placed inside the handler
 * would therefore have to be first — and "first, before the other thing, please
 * remember" is not a control. In front of the handler, the state cannot move at all
 * when the guard refuses.
 *
 * It runs AFTER `requireOperator` because the refusal is attributed to a named
 * session, and BEFORE the handler because that is the whole point. It reads the
 * path parameter and nothing else from the request: there is no body field, header
 * or query string that changes the answer.
 *
 * On a refusal it answers with the guard's own status (503 while 0047 is pending,
 * 404 for an unknown engagement, 409 for everything else) and its own code, and it
 * LOGS the refusal with the operator's id — the only durable trace available, since
 * there is no table to record a blocked issue in. A refusal ledger is named in the
 * hand-off notes as a decision for a human, not something quietly skipped.
 */
export const requireUnderwritingClearance: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
) => {
  const id = c.req.param('id');
  if (!isUuid(id)) {
    // Let the handler answer its own 400 for a malformed id: the guard has nothing
    // to say about a path that does not name an engagement, and pre-empting it
    // would change the error a client already branches on.
    return next();
  }

  let decision;
  try {
    decision = await guardProposalIssue(getPool(), id, {
      operator: c.get('operator')?.id ?? 'unknown',
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    // FAIL CLOSED. An underwriting that threw is an underwriting that did not
    // happen, and the one thing this middleware may never do is wave through what
    // it could not evaluate.
    console.error('[gps] underwriting clearance error:', err);
    return c.json(
      {
        error:
          'The margin on this proposal could not be underwritten, so issuing it is refused. '
          + ISSUE_GUARD_FAILS_CLOSED,
        code: 'UNDERWRITING_UNAVAILABLE',
      },
      409,
    );
  }

  if (!decision.allowed) {
    console.warn(
      `[gps] proposal issue REFUSED for engagement ${id} by ${decision.evaluatedBy}: ${decision.code}`,
    );
    return c.json(
      {
        error: decision.reason,
        code: decision.code,
        data: {
          remedy: decision.remedy,
          issue: decision.issue,
          underwriting: decision.underwriting,
          provenance: decision.provenance,
          policyNotice: decision.policyNotice,
          perimeterGateNotice: decision.perimeterGateNotice,
        },
      },
      decision.status,
    );
  }

  return next();
};
