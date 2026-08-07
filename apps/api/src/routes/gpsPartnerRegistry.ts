import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  CURRENCY_CODE_RE,
  FLOOR_EFFORT_POINTS,
  OFFER_KEYS,
  PARTNER_ASSERTION_IS_A_CLAIM,
  isPriceFloor,
  type FloorEffortPoint,
  type OfferKey,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  PARTNER_REGISTRY_MIGRATION,
  PARTNER_REGISTRY_NOT_MIGRATED,
  assertPartner,
  enterRateCard,
  floorFor,
  loadBench,
  partnerRegistryPresence,
  recordCapability,
  type RegistryRefusal,
} from '../gps/partnerRegistry.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SERVICES (GPS) — THE PARTNER REGISTRY ROUTES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   GET  /partner-registry                              the bench, as asserted
 *   POST /partner-registry/partners                     assert a partner
 *   POST /partner-registry/partners/:partnerId/capabilities   what they deliver
 *   POST /partner-registry/partners/:partnerId/rate-cards     what they charge
 *   GET  /partner-registry/floor                        the price floor, or why not
 *
 * Exported and NOT MOUNTED. See the WIRING block at the foot of this docblock; it
 * matters more than usual because mounting this in the wrong place trips a ratchet.
 *
 * ── WHAT THIS EXISTS TO UNBLOCK ──────────────────────────────────────────────
 * The owner answered the decision on 2026-08-07: A NAMED HUMAN MAY ASSERT A PARTNER
 * NAME AND A RATE CARD, ATTRIBUTED TO THEM. Before it, `POST /v1/gps/inputs/rate-cards`
 * refused EVERY write with `PARTNER_BENCH_EMPTY` and told the operator to insert a
 * row by hand in the Supabase SQL editor, because its partner list came from
 * `PARTNER_BENCH` — a compiled empty array — plus the partners already on a rate
 * card. A rate card was the only way to become a partner and being a partner was the
 * only way to have a rate card. These routes are the entry point that has no
 * predecessor.
 *
 * ── ATTRIBUTION IS `c.get('operator')`, NEVER A BODY FIELD ───────────────────
 * `assertedBy` and `statedBy` come from the authenticated operator. A body field
 * naming who asserted a partner would make the row a claim ABOUT who asserted it
 * rather than a record OF it — the rule `routes/gps.ts:438` already applies to
 * `decidedBy` on the conflict check, and the one this whole feature turns on.
 *
 * The honest limit is stated on the screen and repeated here: attribution is only as
 * strong as the shared DESK_PASSCODE until per-person credentials exist. That is a
 * real weakness of the record, not a reason to omit the field.
 *
 * ── ONE CLOCK READ PER REQUEST ───────────────────────────────────────────────
 * Every handler reads `new Date()` exactly once and passes the instant down. Two
 * `Date.now()` calls in one request is how a rate card ends up stamped a millisecond
 * after the floor that was refused for its expiry.
 *
 * ── MIGRATION-PENDING DISCIPLINE ─────────────────────────────────────────────
 * Copied from `routes/gps.ts` because the deploy ordering fact is identical: the
 * migration is applied by hand and the code ships on a push. Reads answer 200 with a
 * well-shaped body whose bench is a REFUSAL naming the migration; writes answer 503,
 * never 500; validation runs BEFORE the probe, because a malformed request is
 * malformed in every environment.
 *
 * ── NO CLIENT MATERIAL REACHES THESE ROUTES ──────────────────────────────────
 * The inputs are a partner id, a name, a sentence of basis, five offer keys, a
 * three-letter currency and integer cents. Decision D2 (LCX legal/DPO — controller
 * vs processor for a third party's confidential material) was answered YES on
 * 2026-08-02 for ONE reviewed intake surface (`routes/gpsArtifact.ts`), and this is
 * not it. `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers this file by
 * path and fails the build on a byte door or an intake-shaped route path.
 *
 * ══ WIRING (a human does this; this file edits nothing else) ══════════════════
 *  1. In `apps/api/src/routes/gps.ts`, mount this INSIDE `gpsRoutes`:
 *         import { gpsPartnerRegistryRoutes } from './gpsPartnerRegistry.js';
 *         gpsRoutes.route('/partner-registry', gpsPartnerRegistryRoutes);
 *     NOT in `app.ts`. `intakeLockout.test.ts` asserts the only router mounted under
 *     `/v1/gps` is `gpsRoutes` — a second `app.route('/v1/gps', …)` fails the build,
 *     by design. Mounting inside `gpsRoutes` is also what puts
 *     `requireWorkspace('gps','view')` in front of the reads and `…,'operate')` in
 *     front of the writes; `requireOperator` below is authentication, not
 *     authorisation, and the compartment gate is the floor.
 *  2. `apps/api/src/db/migrationLedger.ts`: add `'0075_gps_partner_registry.sql'` to
 *     `PENDING_MIGRATIONS`. Until then `db/__tests__/migrationImmutability.test.ts`
 *     fails — deliberately: a migration that arrives unaccounted for is exactly what
 *     that ratchet is for.
 *  3. OPTIONAL, and the reason the duplicate writer exists: teach
 *     `routes/gpsInputs.ts` to read its partner list from the registry
 *     (`loadBench`) instead of from `SELECT DISTINCT partner_id FROM gps_rate_card`
 *     plus `PARTNER_BENCH`, and to call `enterRateCard`. Then delete its INSERT.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * ISO-4217 AS A CLOSED PATTERN, DECLARED IN THIS FILE ON PURPOSE.
 *
 * The authoritative rule is `CURRENCY_CODE_RE` (`gps/contracts/inputs.ts:75`) and
 * this is not a second opinion: `__tests__/gpsPartnerRegistry.test.ts` asserts the
 * two sources are character-for-character identical, so they cannot drift.
 *
 * It is written out here because `intakeLockout.test.ts` requires every GPS route
 * file that reads `body.currency` to DECLARE a three-letter pattern in its own code,
 * and comments are stripped before that check. The reason behind that ratchet is a
 * real incident: `currency` was a `text` column with no length and no CHECK, read as
 * a bare string, on a server with no `bodyLimit` — a 112,000-character payload
 * reached the column and base32 survives `.toUpperCase()` losslessly, so a client
 * document was recoverable from it. Three bytes drawn from 26 letters is not a
 * channel into this compartment.
 */
const ISO_4217_AT_THE_EDGE = /^[A-Za-z]{3}$/;

/** A body that is not JSON is a 400, not an unhandled throw. */
async function jsonBody(c: Context<{ Variables: AuthVariables }>): Promise<Record<string, unknown> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const refusalBody = (r: RegistryRefusal) => ({
  error: r.reason,
  code: r.code,
  data: { refusal: r },
});

const NOT_JSON = {
  code: 'BODY_NOT_JSON',
  reason: 'The request body must be a JSON object.',
  rule: 'Every GPS route reads its body as JSON and by no other means; there is no parser in this compartment.',
  field: null,
} as const;

export const gpsPartnerRegistryRoutes = new Hono<{ Variables: AuthVariables }>();

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE BENCH                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE BENCH, AS ASSERTED — or the state that says why there is none.
 *
 * A read, so it never 503s: an environment without the migration answers 200 with
 * `bench.state: 'not_loaded'` and the migration named. The three states reach the
 * browser unflattened, because "nobody has been asked" and "there is nowhere to
 * record an answer" are different sentences with different remedies.
 */
gpsPartnerRegistryRoutes.get('/', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const [presence, bench] = [await partnerRegistryPresence(pool), await loadBench(pool)];
    return c.json({
      data: {
        contract: 'gps.partnerRegistry.v1',
        asOf: new Date().toISOString(),
        registers: presence,
        migration: PARTNER_REGISTRY_MIGRATION,
        // The caveat travels with the data, so a surface cannot render an asserted
        // bench as a verified one by forgetting to type a sentence.
        assertionIsAClaim: PARTNER_ASSERTION_IS_A_CLAIM,
        offerKeys: OFFER_KEYS,
        effortPoints: FLOOR_EFFORT_POINTS,
        bench: bench.state === 'loaded'
          ? { state: 'loaded' as const, members: bench.value }
          : { state: bench.state, note: bench.note, members: [] as never[] },
      },
      meta: { ...meta(), migrated: presence.registry },
    });
  } catch (err) {
    console.error('[gps] partner registry read error:', err);
    return c.json({ error: 'Failed to read the partner registry', code: 'GPS_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* ASSERTING A PARTNER                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

gpsPartnerRegistryRoutes.post('/partners', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (body === null) return c.json({ ...refusalBody(NOT_JSON), meta: meta() }, 400);

    // ONE clock read, and it is the assertion instant AND the response timestamp.
    const now = new Date().toISOString();
    const operator = c.get('operator')?.id ?? '';

    const result = await assertPartner(getPool(), {
      partnerId: str(body.partnerId),
      partnerName: str(body.partnerName),
      assertionBasis: str(body.assertionBasis),
      // NEVER `body.assertedBy`. The record is of who asserted it, not a claim about
      // who asserted it.
      assertedBy: operator,
      assertedAt: now,
      active: body.active !== false,
      maxConcurrent: numOrNull(body.maxConcurrent),
      unavailableUntil: typeof body.unavailableUntil === 'string' ? body.unavailableUntil : null,
      bdPartnerId: typeof body.bdPartnerId === 'string' ? body.bdPartnerId : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });

    if (!result.ok) {
      return c.json({ ...refusalBody(result.refusal), meta: { ...meta(), migrated: result.status !== 503 } }, result.status);
    }
    return c.json({
      data: { partnerId: result.value.partnerId, created: result.value.created, assertedBy: operator, assertedAt: now },
      meta: { ...meta(), migrated: true },
    }, result.value.created ? 201 : 200);
  } catch (err) {
    console.error('[gps] partner assertion error:', err);
    return c.json({ error: 'Failed to record this partner', code: 'GPS_ERROR' }, 500);
  }
});

gpsPartnerRegistryRoutes.post('/partners/:partnerId/capabilities', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (body === null) return c.json({ ...refusalBody(NOT_JSON), meta: meta() }, 400);

    const now = new Date().toISOString();
    const operator = c.get('operator')?.id ?? '';
    const raw = body.jurisdictions;

    const result = await recordCapability(getPool(), {
      partnerId: c.req.param('partnerId'),
      offerKey: str(body.offerKey),
      seniority: str(body.seniority),
      // Free text a human typed, never inferred and never expanded: "EU" does not
      // become Liechtenstein anywhere in this system.
      jurisdictions: Array.isArray(raw) ? raw.map((j) => str(j)) : [],
      evidence: typeof body.evidence === 'string' ? body.evidence : null,
      statedBy: operator,
      statedAt: now,
    });

    if (!result.ok) {
      return c.json({ ...refusalBody(result.refusal), meta: { ...meta(), migrated: result.status !== 503 } }, result.status);
    }
    return c.json({ data: result.value, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] partner capability error:', err);
    return c.json({ error: 'Failed to record this capability', code: 'GPS_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE RATE CARD                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

gpsPartnerRegistryRoutes.post('/partners/:partnerId/rate-cards', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (body === null) return c.json({ ...refusalBody(NOT_JSON), meta: meta() }, 400);

    // The currency is checked HERE against a closed three-letter pattern before it
    // reaches anything with a text column behind it. See ISO_4217_AT_THE_EDGE.
    const currency = str(body.currency).trim();
    if (!ISO_4217_AT_THE_EDGE.test(currency)) {
      return c.json({
        ...refusalBody({
          code: 'CURRENCY_NOT_ISO_4217',
          reason: 'currency must be exactly three letters, e.g. USD. Nothing in this system converts between '
            + 'currencies, so the card\'s currency and the quote\'s must match rather than be reconciled.',
          rule: 'Currency is a CLOSED pattern on every GPS route, never a free string — a text column with no '
            + 'length on a server with no bodyLimit is a document-sized channel into a compartment that must '
            + 'not hold documents.',
          field: 'currency',
        }),
        meta: meta(),
      }, 400);
    }

    const now = new Date().toISOString();
    const operator = c.get('operator')?.id ?? '';

    const result = await enterRateCard(getPool(), {
      partnerId: c.req.param('partnerId'),
      offerKey: str(body.offerKey),
      unit: str(body.unit),
      amountCents: numOrNull(body.amountCents) ?? Number.NaN,
      expectedUnits: numOrNull(body.expectedUnits),
      hoursPerDay: numOrNull(body.hoursPerDay),
      // NOT `?? 0`. An omitted pass-through is not a stated zero, and on
      // legal-opinion coordination the pass-through is counsel's whole fee.
      fixedCostCents: numOrNull(body.fixedCostCents) ?? Number.NaN,
      currency,
      validUntil: str(body.validUntil),
      statedBy: operator,
      statedAt: now,
      partnerLabel: null,
    });

    if (!result.ok) {
      return c.json({ ...refusalBody(result.refusal), meta: { ...meta(), migrated: result.status !== 503 } }, result.status);
    }
    return c.json({ data: { ...result.value, statedBy: operator, statedAt: now }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] rate card error:', err);
    return c.json({ error: 'Failed to record this rate card', code: 'GPS_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FLOOR                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE LOWEST PRICE AT WHICH THIS PARTNER, ON THIS OFFER, DOES NOT LOSE MONEY — or
 * every reason it cannot be computed.
 *
 * A GET with query parameters, because it is a read of three rows and a pure
 * function over them: nothing is persisted and nothing is decided. The answer is a
 * 200 whether it is a floor or a refusal — a 404 for "no rate card on file" would
 * read as "this URL is wrong", and the desk would go looking for a bug instead of
 * for a partner.
 */
gpsPartnerRegistryRoutes.get('/floor', requireOperator, async (c) => {
  try {
    const partnerId = (c.req.query('partnerId') ?? '').trim();
    const offerKey = (c.req.query('offerKey') ?? '').trim();
    const effortPoint = (c.req.query('effortPoint') ?? '').trim();
    const currency = (c.req.query('currency') ?? '').trim();

    if (partnerId === '' || partnerId.length > 120) {
      return c.json({
        ...refusalBody({
          code: 'PARTNER_ID_REQUIRED',
          reason: 'partnerId is required. A floor is a fact about one named partner delivering one offer; '
            + 'there is no bench-wide floor, because a bench-wide floor would be an average of rates from '
            + 'different people.',
          rule: 'priceFloor (packages/shared/src/gps/partners.ts) takes one partner and one offer.',
          field: 'partnerId',
        }),
        meta: meta(),
      }, 400);
    }
    if (!(OFFER_KEYS as readonly string[]).includes(offerKey)) {
      return c.json({
        ...refusalBody({
          code: 'OFFER_KEY_UNKNOWN',
          reason: `offerKey must be one of: ${OFFER_KEYS.join(', ')}.`,
          rule: 'offer_key is a closed union of the five catalogue offers, in the schema and at the edge.',
          field: 'offerKey',
        }),
        meta: meta(),
      }, 400);
    }
    if (!(FLOOR_EFFORT_POINTS as readonly string[]).includes(effortPoint)) {
      return c.json({
        ...refusalBody({
          code: 'EFFORT_POINT_UNKNOWN',
          reason: `effortPoint must be one of: ${FLOOR_EFFORT_POINTS.join(', ')}. There is deliberately no `
            + 'optimistic floor: a floor computed from the best case loses money in the ordinary case, and '
            + 'it is the one a salesperson under pressure would reach for.',
          rule: 'FloorEffortPoint (packages/shared/src/gps/partners.ts) offers likely and pessimistic only.',
          field: 'effortPoint',
        }),
        meta: meta(),
      }, 400);
    }
    if (!ISO_4217_AT_THE_EDGE.test(currency)) {
      return c.json({
        ...refusalBody({
          code: 'CURRENCY_NOT_ISO_4217',
          reason: 'currency must be exactly three letters, e.g. USD. The floor is quoted in the rate card\'s '
            + 'currency and a mismatch is a refusal, never a conversion.',
          rule: 'Currency is a CLOSED pattern on every GPS route, never a free string.',
          field: 'currency',
        }),
        meta: meta(),
      }, 400);
    }

    // ONE clock read, and it is what the rate card's expiry is judged against.
    const asOf = new Date().toISOString();
    const answer = await floorFor(getPool(), {
      partnerId,
      offerKey: offerKey as OfferKey,
      effortPoint: effortPoint as FloorEffortPoint,
      currency: currency.toUpperCase(),
      asOf,
    });

    return c.json({
      data: {
        contract: 'gps.partnerRegistry.floor.v1',
        asOf,
        partnerId,
        offerKey,
        effortPoint,
        registers: answer.presence,
        migration: answer.migration,
        floor: isPriceFloor(answer.outcome) ? answer.outcome : null,
        refusals: isPriceFloor(answer.outcome) ? [] : answer.outcome.refusals,
      },
      meta: { ...meta(), migrated: answer.presence.registry },
    });
  } catch (err) {
    console.error('[gps] floor error:', err);
    return c.json({ error: 'Failed to compute the floor', code: 'GPS_ERROR' }, 500);
  }
});

/** Named so the wiring block above can be checked against something. */
export const PARTNER_REGISTRY_ROUTE_PATHS: readonly string[] = [
  '/partner-registry',
  '/partner-registry/partners',
  '/partner-registry/partners/:partnerId/capabilities',
  '/partner-registry/partners/:partnerId/rate-cards',
  '/partner-registry/floor',
];

export { PARTNER_REGISTRY_NOT_MIGRATED, CURRENCY_CODE_RE, ISO_4217_AT_THE_EDGE };
