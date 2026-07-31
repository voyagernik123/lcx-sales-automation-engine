/**
 * GLOBAL SERVICES (GPS) routes — the eighth compartment's API.
 *   GET  /v1/gps/clients                      the client list
 *   POST /v1/gps/clients                      create a client
 *   GET  /v1/gps/engagements                  the pipeline (filterable)
 *   GET  /v1/gps/engagements/:id              one engagement + its conflict check
 *   POST /v1/gps/engagements                  create an engagement (conflict_pending)
 *   POST /v1/gps/quote                        price an offer AND SHOW THE MARGIN
 *   POST /v1/gps/engagements/:id/proposal     issue the proposal
 *   POST /v1/gps/engagements/:id/conflict-check   record the conflict decision
 *   POST /v1/gps/engagements/:id/status       move the engagement
 *   GET  /v1/gps/summary                      the desk summary
 *
 * The whole namespace is guarded at 'view' by `requireWorkspace('gps')`, mounted
 * from the workspace registry's `apiPrefixes` (`packages/shared/src/workspaces.ts`,
 * `apiPrefixes: ['/v1/gps']`) in app.ts — which this file deliberately does not
 * edit. `gps` is `legacy:false`, i.e. DEFAULT-DENY: `legacyEntitlements` filters on
 * that flag, so a roster member who was never granted `gps` gets nothing here even
 * though they can read six other compartments. That is why this compartment may
 * hold a third party's commercial terms at all.
 *
 * ══ THERE IS NO UPLOAD, ATTACHMENT, MULTIPART OR FILE ROUTE IN THIS FILE. ══
 * Not an omission — the load-bearing safety property of Phase 1. Accepting an
 * unpublished white paper draft, legal facts or cap-table material is the moment
 * LCX becomes a processor for a third party's confidential data, and decision D2
 * (LCX legal/DPO: controller vs processor, the subprocessor chain through
 * Supabase/Render/Cloudflare/OpenRouter, retention, erasure) is UNANSWERED.
 * `GPS_IMPLEMENTATION_PLAN.md` §4 S0.4 requires the system to be INCAPABLE of
 * accepting a client document, not merely discouraged from it. There is no column
 * to write one to (`0047_gps.sql:26`) and `__tests__/noIntake.test.ts` fails the
 * build if a route appears here that could accept one.
 *
 * MIGRATION-PENDING DISCIPLINE, copied from `routes/marketing.ts` because the
 * deploy ordering fact is identical: 0047 is applied by hand and the code ships on
 * a push to main. Reads answer 200 with an empty, well-shaped body and
 * `migrated: false`; writes answer 503, never 500; validation runs BEFORE the
 * probe, because a malformed request is malformed in every environment.
 *
 * ATTRIBUTION IS ALWAYS `c.get('operator')`, NEVER A BODY FIELD. On the conflict
 * check that is the difference between a compliance record and a suggestion.
 *
 * ── PROVENANCE OF THIS FILE, 2026-07-31 ────────────────────────────────────
 * RECONSTRUCTED from `dist/routes/gps.js` (a `tsc` emit, which preserves
 * comments) after `src/routes/gps.ts` was replaced on disk by a symlink pointing
 * at itself — unreadable, `ELOOP` on every read, and the three ratchet tests that
 * read this file as text failed with it. Nothing else on disk or in git held the
 * original: the file was untracked. Type annotations, `import type` lines and the
 * `as` casts are erased by the emit and were therefore re-derived here from the
 * service's exported types, then verified by `tsc` and by the ratchets. Runtime
 * behaviour comes from the emit and is unchanged. If anything below reads as
 * subtly un-idiomatic against its neighbours, that is why.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  CATALOGUE_TODOS,
  ENGAGEMENT_STATUSES,
  OFFERS,
  OFFER_KEYS,
  PRICE_BANDS_ARE_PLACEHOLDERS,
  type ClientStatus,
  type ConflictDecision,
  type ContractingEntity,
  type EngagementStatus,
  type OfferKey,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  TODO_DEPOSIT_PCT,
  createClient,
  createEngagement,
  deskSummary,
  emptyDeskSummary,
  getConflictCheck,
  getEngagement,
  isMigrated,
  issueProposal,
  listClients,
  listEngagements,
  quoteOffer,
  recordConflictCheck,
  setEngagementStatus,
  type IssueProposalResult,
  type StatusChangeResult,
} from '../gps/service.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Reads degrade to this; writes answer 503 with it. Never 500: a 500 during the
 * deploy-before-migration window reads as "the platform is down", and the desk
 * acts on that reading rather than on "run one migration".
 */
const NOT_MIGRATED = {
  error: 'GLOBAL SERVICES is awaiting migration 0047 on this environment',
  code: 'MIGRATION_PENDING',
};

const CLIENT_STATUSES: readonly ClientStatus[] = ['prospect', 'active', 'dormant', 'declined'];
const CONFLICT_DECISIONS: readonly ConflictDecision[] = ['cleared', 'cleared_with_disclosure', 'declined'];
const CONTRACTING_ENTITIES: readonly ContractingEntity[] = ['lcx', 'external'];

/**
 * Postgres will reject a malformed uuid with 22P02, which surfaces as a 500. A
 * cheap shape check turns "not a uuid" into the 400 it actually is, and keeps a
 * path-parameter typo out of the error logs.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * Money validation. Integer cents, non-negative, and bounded.
 *
 * The upper bound is not paranoia: `price_cents` is `bigint`, so a fat-fingered
 * 20-digit number would be accepted by the database and then arrive back in
 * JavaScript beyond `Number.MAX_SAFE_INTEGER`, where the margin arithmetic stops
 * being exact. $1bn is four orders of magnitude above any plausible engagement,
 * so nothing real is refused.
 */
const MAX_CENTS = 100_000_000_000;
function badCents(v: unknown): boolean {
  if (v === undefined || v === null) return false; // absent is fine — defaults apply
  return typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CENTS;
}

/** Trim, collapse to null when empty. Text fields are optional throughout 0047. */
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

export const gpsRoutes = new Hono<{ Variables: AuthVariables }>();

/* ── The catalogue and the quote: both DB-FREE ──────────────────────────────
 *
 * These two handlers touch no table, so they carry no `isMigrated` probe — and
 * that is asserted, not assumed: `__tests__/deploySafety.test.ts` requires every
 * handler in this file to either probe OR appear on its DB-free allow-list AND
 * contain no `getPool`. So they keep working during the migration window, and a
 * later edit that adds a query to one of them fails the ratchet rather than
 * quietly returning 500 on a Sunday.
 */

/**
 * The offer catalogue, as the API sees it.
 *
 * PRICES ARE BADGED, NOT PRESENTED. `PRICE_BANDS_ARE_PLACEHOLDERS` is still true
 * (`catalogue.ts:58`, decision D4 — only the founder can set bands and he has not
 * supplied them), so the flag travels with every band and `todos` names what is
 * missing. A surface that renders these as agreed prices is misusing the
 * response; there is nothing this route can do about that except say so on it.
 */
gpsRoutes.get('/offers', requireOperator, (c) =>
  c.json({
    data: {
      offers: OFFERS,
      priceBandsArePlaceholders: PRICE_BANDS_ARE_PLACEHOLDERS,
      depositPct: TODO_DEPOSIT_PCT,
      todos: CATALOGUE_TODOS,
    },
    meta: meta(),
  }),
);

/**
 * Quote an offer — and return the MARGIN.
 *
 * This is the endpoint the whole compartment exists for. Partners and specialists
 * deliver; the founder sells and coordinates. So the number that decides whether
 * an engagement is worth taking is price minus vendor cost, at quote time, on the
 * same screen as the price — not in a spreadsheet afterwards. Every other pricing
 * surface in this platform returns a price alone.
 *
 * Nothing is persisted here. A quote becomes real by creating an engagement,
 * which freezes it into `scope_snapshot`.
 */
gpsRoutes.post('/quote', requireOperator, async (c) => {
  const body = await jsonBody(c);
  if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

  const offerKey = body.offerKey as OfferKey;
  if (!OFFER_KEYS.includes(offerKey)) {
    return c.json({ error: `offerKey must be one of ${OFFER_KEYS.join(', ')}`, code: 'VALIDATION' }, 400);
  }
  if (badCents(body.priceCents) || badCents(body.vendorCostCents)) {
    return c.json(
      { error: 'priceCents and vendorCostCents must be non-negative integer cents', code: 'VALIDATION' },
      400,
    );
  }
  if (
    body.contractingEntity !== undefined
    && !CONTRACTING_ENTITIES.includes(body.contractingEntity as ContractingEntity)
  ) {
    return c.json({ error: 'contractingEntity must be lcx or external', code: 'VALIDATION' }, 400);
  }

  return c.json({
    data: quoteOffer({
      offerKey: offerKey,
      priceCents: body.priceCents as number | undefined,
      vendorCostCents: body.vendorCostCents as number | undefined,
      contractingEntity: body.contractingEntity as ContractingEntity | undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
    }),
    meta: meta(),
  });
});

/* ── Clients ──────────────────────────────────────────────────────────────── */

gpsRoutes.get('/clients', requireOperator, async (c) => {
  try {
    // Cast then MEMBERSHIP-TEST, rather than casting after the test: `query()`
    // returns `string | undefined` and the point of the next line is to reject
    // anything not in the list, undefined included.
    const raw = c.req.query('status') as ClientStatus;
    const status = CLIENT_STATUSES.includes(raw) ? raw : undefined;
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: [], meta: { ...meta(), migrated: false } });
    }
    const rows = await listClients(pool, { status, limit: Number(c.req.query('limit') ?? 100) });
    return c.json({ data: rows, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] clients error:', err);
    return c.json({ error: 'Failed to load clients', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Create a client.
 *
 * `possibleDuplicates` comes back rather than a 409: `gps_client_name_idx`
 * (`0047_gps.sql:95`) is deliberately NOT unique because two real companies can
 * share a name, so the API surfaces the ambiguity to a human instead of refusing
 * a legitimate second client to protect against a duplicate someone can see.
 */
gpsRoutes.post('/clients', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const name = text(body.name, 200);
    if (!name) return c.json({ error: 'name is required', code: 'VALIDATION' }, 400);
    if (body.status !== undefined && !CLIENT_STATUSES.includes(body.status as ClientStatus)) {
      return c.json({ error: `status must be one of ${CLIENT_STATUSES.join(', ')}`, code: 'VALIDATION' }, 400);
    }

    // Validation FIRST, probe second — a bad payload is bad in every environment.
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const created = await createClient(getPool(), {
      name,
      legalEntity: text(body.legalEntity, 300),
      // Free text, never validated against a jurisdiction list: no regulatory
      // fact in this programme is verified (plan §0), so the system records what
      // a human typed and infers no perimeter from it (`0047_gps.sql:67`).
      jurisdiction: text(body.jurisdiction, 200),
      primaryContact: text(body.primaryContact, 200),
      status: body.status as ClientStatus | undefined,
    });
    return c.json({ data: created, meta: meta() }, 201);
  } catch (err) {
    console.error('[gps] create client error:', err);
    return c.json({ error: 'Failed to create client', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Engagements ──────────────────────────────────────────────────────────── */

gpsRoutes.get('/engagements', requireOperator, async (c) => {
  try {
    const clientId = c.req.query('clientId');
    if (clientId !== undefined && !isUuid(clientId)) {
      return c.json({ error: 'clientId must be a uuid', code: 'VALIDATION' }, 400);
    }
    const rawStatus = c.req.query('status') as EngagementStatus;
    const status = ENGAGEMENT_STATUSES.includes(rawStatus)
      ? rawStatus : undefined;

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: [], meta: { ...meta(), migrated: false } });
    }
    const rows = await listEngagements(pool, {
      clientId, status,
      owner: c.req.query('owner') || undefined,
      limit: Number(c.req.query('limit') ?? 100),
    });
    return c.json({ data: rows, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] engagements error:', err);
    return c.json({ error: 'Failed to load engagements', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * One engagement, WITH its conflict check attached.
 *
 * Joined into a single read on purpose: the two facts a desk needs about an
 * engagement are what it is worth and whether the conflict position is recorded,
 * and a screen that has to make a second request for the second one is a screen
 * that will eventually render without it.
 */
gpsRoutes.get('/engagements/:id', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);

    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: null, meta: { ...meta(), migrated: false } });
    }
    const engagement = await getEngagement(pool, id);
    if (!engagement) return c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404);
    const conflictCheck = await getConflictCheck(pool, id);
    return c.json({
      data: { engagement, conflictCheck },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] engagement error:', err);
    return c.json({ error: 'Failed to load engagement', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Create an engagement.
 *
 * It lands in `conflict_pending`, not `draft` — see `createEngagement`. The
 * founder is an LCX employee and LCX is a regulated exchange; an engagement whose
 * conflict position has not been recorded is not a draft, it is an open question,
 * and the status makes that visible in a list view rather than discoverable in an
 * audit.
 *
 * The price and the frozen scope come from `quoteOffer`, so the response carries
 * the same margin the quote showed. `owner` is accepted from the body because it
 * is an ASSIGNMENT (who is accountable for this engagement) rather than an
 * attribution — attribution comes from the session, and the only place it matters
 * is the conflict check and the proposal.
 */
gpsRoutes.post('/engagements', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    if (!isUuid(body.clientId)) {
      return c.json({ error: 'clientId must be a uuid', code: 'VALIDATION' }, 400);
    }
    if (!OFFER_KEYS.includes(body.offerKey as OfferKey)) {
      return c.json({ error: `offerKey must be one of ${OFFER_KEYS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    if (body.projectId !== undefined && body.projectId !== null && !isUuid(body.projectId)) {
      return c.json({ error: 'projectId must be a uuid when supplied', code: 'VALIDATION' }, 400);
    }
    if (badCents(body.priceCents) || badCents(body.vendorCostCents)) {
      return c.json(
        { error: 'priceCents and vendorCostCents must be non-negative integer cents', code: 'VALIDATION' },
        400,
      );
    }
    if (
      body.contractingEntity !== undefined
      && !CONTRACTING_ENTITIES.includes(body.contractingEntity as ContractingEntity)
    ) {
      return c.json({ error: 'contractingEntity must be lcx or external', code: 'VALIDATION' }, 400);
    }

    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    try {
      const created = await createEngagement(getPool(), {
        clientId: body.clientId,
        offerKey: body.offerKey as OfferKey,
        projectId: (body.projectId as string | null | undefined) ?? null,
        contractingEntity: body.contractingEntity as ContractingEntity | undefined,
        priceCents: body.priceCents as number | undefined,
        vendorCostCents: body.vendorCostCents as number | undefined,
        currency: typeof body.currency === 'string' ? body.currency : undefined,
        owner: text(body.owner, 100),
      });
      return c.json({ data: created, meta: meta() }, 201);
    } catch (err) {
      // 23503 = FK violation on client_id. An unknown client is a 404 the caller
      // can act on, not a 500 — `gps_engagement.client_id` REFERENCES gps_client.
      if ((err as { code?: string }).code === '23503') {
        return c.json({ error: 'client not found', code: 'NOT_FOUND' }, 404);
      }
      throw err;
    }
  } catch (err) {
    console.error('[gps] create engagement error:', err);
    return c.json({ error: 'Failed to create engagement', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The conflict check ───────────────────────────────────────────────────── */

/**
 * Record the conflict check. THE GOVERNED ACT of this compartment.
 *
 * `requireApprover` ON PURPOSE, and it does more than gate a role.
 *
 * `access/entitlements.ts:39` `machineMap()` loops `WORKSPACE_IDS` granting
 * `operate`, so the SHARED MACHINE KEY holds `gps` at operate — plan §1.5 records
 * "isolation from the shared machine key: ABSENT", and 0047 has now put client data
 * behind that key. The shared key authenticates as `{ id: 'operator', role:
 * 'operator' }` (`middleware/auth.ts:58`), while the desk email path resolves the
 * roster member's real role (`auth.ts:73`). So requiring `approver` here means a
 * cron job, an integration or anything holding `OPERATOR_API_KEY` CANNOT author a
 * conflict decision, no matter that it holds the compartment. Only monty or nik,
 * signed in as themselves, can — which is what `0047_gps.sql:278` means by "a
 * named human, never a service account".
 *
 * The cost is real and accepted: sam holds `operate` (0047) and therefore cannot
 * record a check, so an engagement he creates waits for an approver. For the one
 * artifact that makes an exchange employee's services business defensible, a
 * bottleneck of two people is the correct trade.
 *
 * `decidedBy` is `c.get('operator').id`. A body field naming the decider would
 * make the record a claim about who decided rather than a record of it.
 */
gpsRoutes.post('/engagements/:id/conflict-check', requireOperator, requireApprover, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);

    const checkPerformed = text(body.checkPerformed, 4000);
    if (!checkPerformed) {
      return c.json({
        error: 'checkPerformed is required — describe what was actually checked, not that it was',
        code: 'VALIDATION',
      }, 400);
    }
    const decision = body.decision as ConflictDecision;
    if (!CONFLICT_DECISIONS.includes(decision)) {
      return c.json({ error: `decision must be one of ${CONFLICT_DECISIONS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const disclosure = text(body.disclosureTextUsed, 8000);
    // A disclosure decision with no disclosure wording is an empty gesture. The
    // whole value of the row is the text the client was actually given on the day
    // (`0047_gps.sql:288`), so the one case that requires it demands it.
    if (decision === 'cleared_with_disclosure' && !disclosure) {
      return c.json({
        error: 'disclosureTextUsed is required for cleared_with_disclosure — store the exact wording used',
        code: 'VALIDATION',
      }, 400);
    }

    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await recordConflictCheck(getPool(), {
      engagementId: id,
      checkPerformed,
      decision: decision,
      decidedBy: operator?.id ?? 'unknown',
      disclosureTextUsed: disclosure,
      amend: body.amend === true,
    });

    if (!result.ok) {
      if (result.reason === 'engagement_not_found') {
        return c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404);
      }
      // 409, not an upsert: `engagement_id` is UNIQUE and the table is
      // append-correct. Replacing a recorded disclosure has to be an explicit
      // `amend: true`, because the alternative is losing what a client was told.
      return c.json({
        error: 'a conflict check is already recorded for this engagement — resend with amend: true to replace it',
        code: 'ALREADY_RECORDED',
        data: { existing: result.existing },
      }, 409);
    }
    return c.json({ data: result, meta: meta() }, result.amended ? 200 : 201);
  } catch (err) {
    console.error('[gps] conflict check error:', err);
    return c.json({ error: 'Failed to record conflict check', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Issuing the proposal, and moving the engagement ──────────────────────── */

/**
 * Refusals shared by the proposal route and the status route.
 *
 * Both go through `setEngagementStatus`, so both can be refused by the conflict
 * gate or by terminality, and both must say the same thing when they are. One
 * translation function rather than two keeps the codes identical — a UI branching
 * on `CONFLICT_CHECK_MISSING` should not have to know which route it called.
 */
function refusal(
  c: Context<{ Variables: AuthVariables }>,
  result: Extract<StatusChangeResult | IssueProposalResult, { ok: false }>,
) {
  switch (result.reason) {
    case 'not_found':
      return c.json({ error: 'engagement not found', code: 'NOT_FOUND' }, 404);
    case 'no_price':
      return c.json(
        { error: 'engagement has no price — quote it before issuing a proposal', code: 'NO_PRICE' },
        409,
      );
    case 'terminal':
      return c.json({
        error: `engagement is ${result.from} and cannot be moved — open a new engagement instead`,
        code: 'TERMINAL',
      }, 409);
    case 'conflict_check_declined':
      return c.json({
        error: 'the conflict check for this engagement was DECLINED — it may not proceed',
        code: 'CONFLICT_CHECK_DECLINED',
        data: { engagement: result.engagement },
      }, 409);
    default:
      return c.json({
        error: 'no conflict check is recorded for this engagement — it has been parked in conflict_pending',
        code: 'CONFLICT_CHECK_MISSING',
        data: { engagement: result.engagement },
      }, 409);
  }
}

/**
 * Issue the proposal.
 *
 * The response is SPLIT into `clientFacing` and `internal` (see `Proposal` in the
 * service): the vendor cost and the margin live under `internal` so that the first
 * surface to render "the proposal" cannot put what we pay our partner on a page a
 * client is reading. A ratchet test asserts no cost or margin field appears under
 * `clientFacing`.
 *
 * Attribution is the session's operator. Nothing is stored as a document — the
 * client-facing terms were already frozen into `scope_snapshot` at creation, and
 * generating a file here would be the first step across the D2 line.
 */
gpsRoutes.post('/engagements/:id/proposal', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const result = await issueProposal(getPool(), id, operator?.id ?? 'unknown');
    if (!result.ok) return refusal(c, result);
    return c.json({ data: result, meta: meta() }, 201);
  } catch (err) {
    console.error('[gps] proposal error:', err);
    return c.json({ error: 'Failed to issue proposal', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * Move the engagement by hand.
 *
 * The delivery-side statuses (`in_delivery` … `collected`) are reachable here and
 * that is HONEST rather than complete: Phase 1 ships no delivery surfaces and no
 * artifact intake, so reaching them means a human moved the status because the
 * work happened outside the system. The alternative — refusing the transitions —
 * would leave the desk unable to record that it collected the money.
 *
 * `depositRequiredCents` is accepted here because the deposit term is a
 * placeholder (`TODO_DEPOSIT_PCT`, D4 unanswered) and a human must be able to
 * override it at acceptance without editing code.
 */
gpsRoutes.post('/engagements/:id/status', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!isUuid(id)) return c.json({ error: 'id must be a uuid', code: 'VALIDATION' }, 400);
    if (!body) return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);
    if (!ENGAGEMENT_STATUSES.includes(body.status as EngagementStatus)) {
      return c.json(
        { error: `status must be one of ${ENGAGEMENT_STATUSES.join(', ')}`, code: 'VALIDATION' },
        400,
      );
    }
    if (badCents(body.depositRequiredCents)) {
      return c.json(
        { error: 'depositRequiredCents must be non-negative integer cents', code: 'VALIDATION' },
        400,
      );
    }
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

    const result = await setEngagementStatus(
      getPool(), id, body.status as EngagementStatus,
      { depositRequiredCents: body.depositRequiredCents as number | undefined },
    );
    if (!result.ok) return refusal(c, result);
    return c.json({ data: result.engagement, meta: meta() });
  } catch (err) {
    console.error('[gps] status error:', err);
    return c.json({ error: 'Failed to set status', code: 'GPS_ERROR' }, 500);
  }
});

/* ── The desk summary ─────────────────────────────────────────────────────── */

/**
 * What the desk looks at first.
 *
 * Money is totalled PER CURRENCY and never summed across them (see `DeskSummary`):
 * `currency` is per engagement, there is no FX source in this repo, and one
 * confident wrong total is worse than several honest ones. `gaps` counts the things
 * to be uncomfortable about — chiefly live engagements with no conflict check.
 *
 * Degrades to `emptyDeskSummary()` with `migrated: false` while 0047 is pending, so
 * the compartment renders its banner instead of its error state.
 */
gpsRoutes.get('/summary', requireOperator, async (c) => {
  try {
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: emptyDeskSummary(), meta: meta() });
    }
    return c.json({ data: await deskSummary(pool), meta: meta() });
  } catch (err) {
    console.error('[gps] summary error:', err);
    return c.json({ error: 'Failed to load summary', code: 'GPS_ERROR' }, 500);
  }
});
