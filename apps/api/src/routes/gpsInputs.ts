import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  CURRENCY_CODE_RE,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  OFFER_KEYS,
  PARTNER_BENCH,
  PRICE_BANDS_ARE_PLACEHOLDERS,
  bandMidpointCents,
  getOffer,
  placeholderEffortTriple,
  rateCardCostCents,
  rateCardStatus,
  type OfferKey,
  type RateCard,
  type RateUnit,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

/**
 * GLOBAL SERVICES (GPS) — THE INPUT DESK.
 *
 *   GET  /inputs                 every offer's band, effort triple and rate card
 *   POST /inputs/price-bands     the SELL price, low / mid / high
 *   POST /inputs/effort-triples  partner-days, optimistic / likely / pessimistic
 *   POST /inputs/rate-cards      what a NAMED partner charges LCX for one offer
 *
 * Mounted inside `gpsRoutes` at '/inputs' — see the WIRING block at the foot of this docblock.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `0052_gps_underwriting.sql` created `gps_rate_card` and `gps_effort_triple` and a
 * human applied both on production. Nothing ever wrote to them: there was no route
 * and no screen, so three inputs only a human can supply had nowhere to be typed,
 * every price on this platform is still `TODO_PRICE_BANDS` (`catalogue.ts:61`) and
 * every margin distribution is still labelled `basis: 'prior'`.
 *
 * ── THE SELL SIDE HAS NO REGISTER, AND THAT IS REPORTED, NOT PAPERED OVER ────
 * 0052 created the COST side only, deliberately (`0052:28-35`: a rate that varies by
 * client is not a rate card). So `gps_price_band` does not exist, this route probes
 * for it, and a write refuses with `PRICE_BAND_REGISTER_ABSENT` carrying the exact
 * DDL a human pastes. Reads still answer 200 with every band badged
 * `source: 'compiled_placeholder'` — which is the distinction the screen is for.
 *
 * ── VALIDATION IS A REFUSAL, AND IT IS STRICTER THAN THE SCHEMA ──────────────
 * Three of these checks exist because the schema cannot make them:
 *
 *  · `amount_cents bigint NOT NULL CHECK (amount_cents >= 0)` (`0052:75`) PERMITS
 *    ZERO. A zero card underwrites at 100% margin with pLoss 0 and prints "quote is
 *    conservative" on a proposal (`partners.ts:233`). The pen test found exactly
 *    that, and a sub-cent card slipping past a bare `<= 0` beside it. So the rate is
 *    refused here at 0, at a fraction of a cent, and — through
 *    `rateCardCostCents`, never a re-implementation of it — whenever the DERIVED
 *    engagement cost rounds to nothing.
 *  · `gps_effort_triple` has NO ordering CHECK, on purpose (`0052:153`): a CHECK
 *    would turn a transposed pair into a 500 rather than a visibly odd triple.
 *    Ordering is therefore this route's job, and `optimistic <= likely <=
 *    pessimistic` is refused before the INSERT rather than clamped after it.
 *  · `expected_units` is NULLABLE (`0052:77`) because null legitimately means "the
 *    cost cannot be derived". A rate card whose cost cannot be derived is useless to
 *    the desk that is entering it, so a metered unit without units is refused here
 *    while the column stays nullable for rows that predate this route.
 *
 * Every refusal carries a stable code and a `rule` citation. `data.rule` is not
 * decoration: "invalid input" teaches nobody which of eleven numbers is wrong.
 *
 * ── NO PARTNER NAME IS INVENTED HERE ─────────────────────────────────────────
 * A rate card's `partnerId` must already be a name the system has: on the compiled
 * bench (`PARTNER_BENCH`, `partners.ts:332`) or on a card already on file. The bench
 * is an EMPTY ARRAY today — decision D5 — so every write refuses with
 * `PARTNER_BENCH_EMPTY` and the desk says so at the top of the screen rather than
 * offering an empty dropdown. That refusal is the honest state of the business, and
 * inventing a plausible counsel name to make the screen demonstrable would be the
 * single worst thing this file could do.
 *
 * ── ATTRIBUTION ──────────────────────────────────────────────────────────────
 * `stated_by` is `c.get('operator')`, never a body field — a body field naming who
 * stated a price would make the row a claim about who set it rather than a record of
 * it. It is only as strong as a shared passcode, which is stated on the surface.
 *
 * ── THERE IS NO CLIENT MATERIAL ON THIS ROUTE ────────────────────────────────
 * The inputs are numbers, five offer keys, a three-letter currency and a partner id.
 * No body field carries anything else. Decision D2 is unanswered and
 * `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers this file by path.
 *
 * ── THIS FILE DECLARES NO RESPONSE TYPE ─────────────────────────────────────
 * The contract is `packages/shared/src/gps/contracts/inputs.ts` and there is exactly one
 * copy of it. `gps/index.ts` re-exports it, so this file names `CURRENCY_CODE_RE` from
 * `@lcx/shared` and no longer holds its own currency literal. The PAYLOADS are still built
 * as plain objects — `c.json` takes JSON, so an annotation would not check the wire — and
 * they are held to the contract by `deskContractDefects` / `refusalBodyDefects` running
 * over a real HTTP response in `__tests__/gpsInputs.test.ts`, which is the only check that
 * sees the shape as the browser receives it.
 *
 * ══ WIRING — DONE ════════════════════════════════════════════════════════════
 *  1. `apps/api/src/routes/gps.ts` mounts this INSIDE `gpsRoutes`, at '/inputs':
 *         gpsRoutes.route('/inputs', gpsInputsRoutes);
 *     NOT in `app.ts`. `intakeLockout.test.ts` asserts the only router mounted under
 *     `/v1/gps` is `gpsRoutes`, and mounting inside it is also what puts
 *     `requireWorkspace('gps','view')` in front of the GET and `…,'operate')` in front of
 *     the three writes. Verified per path and per method — including that the mount is at
 *     '/inputs' and not '/', which would shadow `GET /v1/gps` — in
 *     `__tests__/gpsInputsMount.test.ts`.
 *  2. Nothing else. The writes carry `requireOperator` themselves, which is
 *     authentication and not authorisation; the compartment gate is the floor.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * ISO-4217 as a CLOSED PATTERN, three letters, not a length cap.
 *
 * `currency` was the door: a `text` column with no length and no CHECK, on a server
 * with no `bodyLimit`, reached through a field nothing validated — and base32
 * survives `.toUpperCase()` losslessly, so a client document was recoverable from
 * it. Three bytes drawn from 26 letters is not a channel into this compartment.
 *
 * THERE IS NOW EXACTLY ONE DEFINITION OF THIS RULE, and this line is the import of it.
 * The pattern used to be duplicated here as a local `ISO_4217` because
 * `packages/shared/src/gps/contracts/inputs.ts` was reachable from no barrel, so this file
 * could not name `CURRENCY_CODE_RE` at all — a deep relative specifier type-checks and then
 * fails the emit build with TS6059 in Docker order. `gps/index.ts` now re-exports that
 * module, so the duplicate is deleted rather than held in step by a drift assertion. A
 * duplicated validation rule is one that eventually disagrees with itself, and the copy that
 * drifted would be the one deciding what reaches the column.
 */
const ISO_4217 = CURRENCY_CODE_RE;

const RATE_UNITS: readonly RateUnit[] = ['fixed', 'day_rate', 'hourly'];

const OFFER_KEY_SET: ReadonlySet<string> = new Set<string>(OFFER_KEYS);

/* ══════════════════════════════════════════════════════════════════════════ */
/* REFUSALS                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Mirrors `GpsInputRefusalCode`; the test asserts every code used here is in it. */
type Code = string;

interface Refusal {
  code: Code;
  reason: string;
  rule: string;
  field: string | null;
}

const refuse = (code: Code, reason: string, rule: string, field: string | null = null): Refusal =>
  ({ code, reason, rule, field });

/** The wire body. Identical to the contract's `refusalBody`, and tested to be. */
function refusalBody(r: Refusal) {
  return { error: r.reason, code: r.code, data: { rule: r.rule, field: r.field } };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PROBES — cached per process, and never themselves the error                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface InputRegisterPresence {
  priceBands: boolean;
  effortTriples: boolean;
  rateCards: boolean;
}

let presence: InputRegisterPresence | null = null;

/**
 * Which registers exist. ONE round trip, THREE booleans, reported separately
 * because applying part of the schema is a real state and "bands are missing" is a
 * different sentence from "nothing is here".
 *
 * `to_regclass` returns NULL on absence rather than throwing, so the probe cannot be
 * the thing that breaks — the same construction as `underwrite.ts:201`.
 */
export async function inputRegisters(): Promise<InputRegisterPresence> {
  if (presence !== null) return presence;
  try {
    const res = await getPool().query(
      `SELECT to_regclass('public.gps_price_band')    IS NOT NULL AS price_bands,
              to_regclass('public.gps_effort_triple') IS NOT NULL AS effort_triples,
              to_regclass('public.gps_rate_card')     IS NOT NULL AS rate_cards`,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    presence = {
      priceBands: Boolean(row?.price_bands),
      effortTriples: Boolean(row?.effort_triples),
      rateCards: Boolean(row?.rate_cards),
    };
  } catch {
    // A database that cannot answer this cannot hold a cost basis either. Absent,
    // and the refusal carries the reason.
    presence = { priceBands: false, effortTriples: false, rateCards: false };
  }
  return presence;
}

/** Test-only: forget the probe. */
export function _resetGpsInputProbes(): void {
  presence = null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ROW NORMALISATION — `bigint` and `numeric` both arrive as STRINGS             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A finite number, or NULL. There is no `?? 0` anywhere in this file, and that is
 * the point: a defaulted 0 on a price is free work, and a defaulted 0 on an effort
 * triple is a zero-variance distribution that reads as certainty.
 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const textOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE CITATIONS — one copy each, so a refusal and a notice cannot disagree      */
/* ══════════════════════════════════════════════════════════════════════════ */

const RULE_ZERO_IS_A_REFUSAL =
  'packages/shared/src/gps/partners.ts:233 (rateCardCostCents — ZERO IS A REFUSAL, NOT A FREE PARTNER); '
  + '0052_gps_underwriting.sql:75 permits amount_cents >= 0, so the schema cannot make this check';

const RULE_EFFORT_ORDER =
  'optimistic <= likely <= pessimistic. gps_effort_triple carries NO ordering CHECK by design '
  + '(0052_gps_underwriting.sql:153), so the refusal has to happen at this route';

const RULE_CURRENCY =
  "a closed three-letter code. 0052_gps_underwriting.sql:98 CHECK (currency ~ '^[A-Z]{3}$'); "
  + 'ratcheted at the edge by apps/api/src/gps/__tests__/intakeLockout.test.ts:1026';

const RULE_VALIDITY =
  'RateCard.validUntil (packages/shared/src/gps/partners.ts:179): null means NO VALIDITY WAS EVER '
  + 'STATED and is treated as UNUSABLE, not as valid forever';

const RULE_UNITS =
  '0052_gps_underwriting.sql:77 — null expected_units on a metered unit means the cost CANNOT be '
  + 'derived; rateCardCostCents returns null rather than assuming 1 unit';

const RULE_HOURS_PER_DAY =
  'CONSTRAINT gps_rate_card_hourly_needs_hours_per_day (0052_gps_underwriting.sql:126) — the effort '
  + 'triple is in DAYS, so an hourly card cannot be converted without hours per day';

const RULE_BENCH_EMPTY =
  'PARTNER_BENCH is an empty array (packages/shared/src/gps/partners.ts:332) and no rate card names a '
  + 'partner either. Decision D5 — who is on the delivery bench — is unanswered, and a partner name is '
  + 'not something this system may invent';

const RULE_OFFER_KEYS =
  'OfferKey is a closed union of five (packages/shared/src/gps/types.ts:60), mirrored as a CHECK in '
  + '0052_gps_underwriting.sql:62';

const RULE_BAND_ORDER =
  'low <= mid <= high. A band whose floor exceeds its ceiling quotes below its own minimum on every '
  + 'read, and nothing clamps a price band the way resolveDuration clamps an effort triple';

const RULE_BAND_POSITIVE =
  'a band edge of 0 or less prices the work as free. PriceBandCents is integer cents '
  + '(packages/shared/src/gps/types.ts:87) and there is no such thing as a $0 engagement here';

const RULE_INTEGER_CENTS =
  'integer cents. A fraction of a cent cannot be invoiced and rounds silently — the same class of '
  + 'defect as the sub-cent rate card the pen test found';

/**
 * The sentence rendered beside every band that is still compiled. Quoted from the
 * catalogue's own reasoning rather than re-argued here, so there is one account of
 * why these numbers must not be quoted.
 */
const PLACEHOLDER_BAND_NOTICE =
  'PLACEHOLDER, NOT A PRICE. This band is TODO_PRICE_BANDS in packages/shared/src/gps/catalogue.ts:61, '
  + 'shaped by two facts the founder gave in passing (a $10–25k typical engagement, and a $1.5–3k '
  + 'creditable diagnostic) and agreed by nobody. It is badged by PRICE_BANDS_ARE_PLACEHOLDERS '
  + '(catalogue.ts:58) and must not be quoted to a client. Only the founder can replace it.';

const PRIOR_EFFORT_NOTICE =
  'PRIOR, NOT MEASURED. No effort triple is on record for this offer, so the shipped placeholder is in '
  + 'use (EFFORT_TRIPLES_ARE_PLACEHOLDERS, packages/shared/src/gps/underwrite.ts) and every margin '
  + 'distribution built from it is labelled basis: prior. Its spread is deliberately wide — a narrow '
  + 'placeholder would manufacture a confident-looking band out of nothing. GPS_100X_PLAN.md §12 names '
  + 'this as the one input that turns the underwriting screen from a prior into a model.';

const PRICE_BAND_REGISTER_ABSENT_REASON =
  'There is nowhere to record a price band on this environment: no gps_price_band relation exists. '
  + '0052_gps_underwriting.sql created the COST side only — gps_rate_card is what a partner charges LCX '
  + '(0052:28-35) and a rate card is deliberately not a price. Apply the DDL on meta.priceBandRegisterDdl '
  + 'in the Supabase SQL editor and land the same text as the next free numbered migration.';

/* ══════════════════════════════════════════════════════════════════════════ */
/* READS                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

interface EnteredBand {
  lowCents: number;
  midCents: number;
  highCents: number;
  currency: string;
  statedBy: string | null;
  statedAt: string | null;
}

/**
 * Bands ON RECORD, keyed by offer. A row whose money does not parse is DROPPED
 * rather than repaired: the offer then falls back to the compiled placeholder, which
 * is visibly a placeholder, instead of rendering a NaN that JSON turns into null and
 * a screen turns into "$0".
 */
async function loadEnteredBands(present: boolean): Promise<Map<string, EnteredBand>> {
  const out = new Map<string, EnteredBand>();
  if (!present) return out;
  const res = await getPool().query(
    `SELECT offer_key, low_cents, mid_cents, high_cents, currency, stated_by, stated_at
       FROM gps_price_band`,
  );
  for (const raw of res.rows as Array<Record<string, unknown>>) {
    const key = textOrNull(raw.offer_key);
    const low = numOrNull(raw.low_cents);
    const mid = numOrNull(raw.mid_cents);
    const high = numOrNull(raw.high_cents);
    const currency = textOrNull(raw.currency);
    if (key === null || low === null || mid === null || high === null || currency === null) continue;
    if (!OFFER_KEY_SET.has(key)) continue;
    out.set(key, {
      lowCents: low,
      midCents: mid,
      highCents: high,
      currency: currency.toUpperCase(),
      statedBy: textOrNull(raw.stated_by),
      statedAt: isoOrNull(raw.stated_at),
    });
  }
  return out;
}

interface EnteredTriple {
  optimisticDays: number;
  likelyDays: number;
  pessimisticDays: number;
  statedBy: string | null;
  statedAt: string | null;
}

/** Triples ON RECORD. Same drop-rather-than-repair rule as the bands. */
async function loadEnteredTriples(present: boolean): Promise<Map<string, EnteredTriple>> {
  const out = new Map<string, EnteredTriple>();
  if (!present) return out;
  const res = await getPool().query(
    `SELECT offer_key, optimistic_days, likely_days, pessimistic_days, stated_by, stated_at
       FROM gps_effort_triple`,
  );
  for (const raw of res.rows as Array<Record<string, unknown>>) {
    const key = textOrNull(raw.offer_key);
    const o = numOrNull(raw.optimistic_days);
    const l = numOrNull(raw.likely_days);
    const p = numOrNull(raw.pessimistic_days);
    if (key === null || o === null || l === null || p === null) continue;
    if (!OFFER_KEY_SET.has(key)) continue;
    out.set(key, {
      optimisticDays: o,
      likelyDays: l,
      pessimisticDays: p,
      statedBy: textOrNull(raw.stated_by),
      statedAt: isoOrNull(raw.stated_at),
    });
  }
  return out;
}

/**
 * Rate cards ON RECORD, with `status` and the derived engagement cost.
 *
 * The cost comes from `rateCardCostCents` and from nowhere else. That function is
 * where the zero guard and the round-to-zero guard live, and the docblock on it says
 * plainly that a caller which inspects `amountCents` and decides for itself inherits
 * neither — which is exactly how a 0.0001c/day card once underwrote at 100% margin.
 */
async function loadRateCards(present: boolean, asOf: string) {
  if (!present) return [];
  const res = await getPool().query(
    `SELECT offer_key, partner_id, partner_label, unit, amount_cents, expected_units,
            hours_per_day, fixed_cost_cents, currency, valid_until, stated_by, stated_at
       FROM gps_rate_card
      ORDER BY offer_key, partner_id`,
  );
  const rows = [];
  for (const raw of res.rows as Array<Record<string, unknown>>) {
    const key = textOrNull(raw.offer_key);
    const partnerId = textOrNull(raw.partner_id);
    const amount = numOrNull(raw.amount_cents);
    const currency = textOrNull(raw.currency);
    const unit = textOrNull(raw.unit);
    if (key === null || partnerId === null || amount === null || currency === null || unit === null) continue;
    if (!OFFER_KEY_SET.has(key) || !RATE_UNITS.includes(unit as RateUnit)) continue;
    const offerKey = key as OfferKey;
    const validUntil = isoOrNull(raw.valid_until);
    const card: RateCard = {
      offerKey,
      unit: unit as RateUnit,
      amountCents: amount,
      expectedUnits: numOrNull(raw.expected_units),
      currency: currency.toUpperCase(),
      validUntil,
      statedBy: textOrNull(raw.stated_by) ?? 'unknown',
      statedAt: isoOrNull(raw.stated_at) ?? asOf,
    };
    rows.push({
      offerKey,
      offerName: getOffer(offerKey).name,
      partnerId,
      partnerLabel: textOrNull(raw.partner_label),
      unit: card.unit,
      amountCents: card.amountCents,
      expectedUnits: card.expectedUnits,
      hoursPerDay: numOrNull(raw.hours_per_day),
      fixedCostCents: numOrNull(raw.fixed_cost_cents) ?? 0,
      currency: card.currency,
      validUntil,
      status: rateCardStatus(card, asOf),
      engagementCostCents: rateCardCostCents(card),
      statedBy: card.statedBy,
      statedAt: card.statedAt,
    });
  }
  return rows;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE DESK                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * USD, from `catalogue.ts:60` ("Integer cents, USD"), and stated here rather than
 * assumed silently. The placeholder bands have no currency column to read; the
 * moment a band is ENTERED its own currency is used.
 */
const PLACEHOLDER_BAND_CURRENCY = 'USD';

/**
 * The names this system HAS, from the two places it can have them and no third.
 *
 * The compiled bench is authoritative when it has entries; a partner already named
 * on a card is included because the first name to arrive will arrive as a row (see
 * `PARTNER_BENCH`'s own docblock: "When names arrive they are ROWS, not entries
 * here"), and a desk that could not then re-use it would be unusable.
 */
function partnerOptions(cardPartners: ReadonlyArray<{ partnerId: string; partnerLabel: string | null }>) {
  const out = new Map<string, { partnerId: string; label: string; origin: string }>();
  for (const p of PARTNER_BENCH) {
    out.set(p.id, { partnerId: p.id, label: p.name, origin: 'compiled_bench' });
  }
  for (const c of cardPartners) {
    if (out.has(c.partnerId)) continue;
    out.set(c.partnerId, {
      partnerId: c.partnerId,
      label: c.partnerLabel ?? c.partnerId,
      origin: 'rate_card_on_file',
    });
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * EVERY OFFER, EVERY INPUT, AND WHERE EACH NUMBER CAME FROM.
 *
 * Assembled once, from one clock read, so the staleness of a rate card and the
 * timestamp on the payload cannot disagree by a millisecond. Absent registers are
 * not an error: the desk answers 200 with the compiled placeholders badged as such
 * and the refusal on `refusals`, because "why can nothing be typed here" has to be
 * answerable without reading the source.
 */
async function buildDesk(asOf: string) {
  const registers = await inputRegisters();
  const [bands, triples, cards] = await Promise.all([
    loadEnteredBands(registers.priceBands),
    loadEnteredTriples(registers.effortTriples),
    loadRateCards(registers.rateCards, asOf),
  ]);

  const priceBands = OFFER_KEYS.map((offerKey) => {
    const offer = getOffer(offerKey);
    const entered = bands.get(offerKey);
    if (entered) {
      return {
        offerKey,
        offerName: offer.name,
        source: 'entered' as const,
        lowCents: entered.lowCents,
        midCents: entered.midCents,
        highCents: entered.highCents,
        currency: entered.currency,
        // A stated mid is a decision, not arithmetic. Only the compiled band derives it.
        midIsDerived: false,
        statedBy: entered.statedBy,
        statedAt: entered.statedAt,
        placeholderNotice: null,
      };
    }
    return {
      offerKey,
      offerName: offer.name,
      source: 'compiled_placeholder' as const,
      lowCents: offer.priceBandCents.min,
      midCents: bandMidpointCents(offer),
      highCents: offer.priceBandCents.max,
      currency: PLACEHOLDER_BAND_CURRENCY,
      // `PriceBandCents` has only min/max, so the mid is the midpoint and nobody chose it.
      midIsDerived: true,
      statedBy: null,
      statedAt: null,
      placeholderNotice: PLACEHOLDER_BAND_NOTICE,
    };
  });

  const effortTriples = OFFER_KEYS.map((offerKey) => {
    const offer = getOffer(offerKey);
    const entered = triples.get(offerKey);
    if (entered) {
      return {
        offerKey,
        offerName: offer.name,
        basis: 'measured' as const,
        optimisticDays: entered.optimisticDays,
        likelyDays: entered.likelyDays,
        pessimisticDays: entered.pessimisticDays,
        statedBy: entered.statedBy,
        statedAt: entered.statedAt,
        priorNotice: null,
      };
    }
    const shipped = placeholderEffortTriple(offerKey);
    return {
      offerKey,
      offerName: offer.name,
      basis: 'prior' as const,
      optimisticDays: shipped.optimisticDays,
      likelyDays: shipped.likelyDays,
      pessimisticDays: shipped.pessimisticDays,
      statedBy: null,
      statedAt: null,
      priorNotice: PRIOR_EFFORT_NOTICE,
    };
  });

  const options = partnerOptions(cards);
  const offersWithACard = new Set(cards.map((c) => c.offerKey));

  const refusals: Refusal[] = [];
  if (!registers.priceBands) {
    refusals.push(refuse(
      'PRICE_BAND_REGISTER_ABSENT',
      PRICE_BAND_REGISTER_ABSENT_REASON,
      'no gps_price_band relation; 0052_gps_underwriting.sql created the cost side only (0052:28-35)',
    ));
  }
  if (!registers.effortTriples) {
    refusals.push(refuse(
      'EFFORT_REGISTER_ABSENT',
      'There is nowhere to record an effort triple on this environment: no gps_effort_triple relation '
      + 'exists. Apply 0052_gps_underwriting.sql. Until then every distribution stays on the shipped prior.',
      '0052_gps_underwriting.sql:157 creates gps_effort_triple; nothing applies migrations on deploy',
    ));
  }
  if (!registers.rateCards) {
    refusals.push(refuse(
      'RATE_CARD_REGISTER_ABSENT',
      'There is nowhere to record a partner rate card on this environment: no gps_rate_card relation '
      + 'exists. Apply 0052_gps_underwriting.sql. Until then nothing can be underwritten at all.',
      '0052_gps_underwriting.sql:51 creates gps_rate_card; nothing applies migrations on deploy',
    ));
  }
  if (options.length === 0) {
    refusals.push(refuse(
      'PARTNER_BENCH_EMPTY',
      'No partner can be named on any offer, because this system knows no partner names. The delivery '
      + 'bench is empty and no rate card names one either. Only a human can supply the names — nothing '
      + 'here will invent a plausible one to make this screen look finished.',
      RULE_BENCH_EMPTY,
      'partnerId',
    ));
  }

  /**
   * WHAT ONLY A HUMAN CAN SUPPLY. Sentences and not a boolean, because the founder
   * needs to know WHICH input to type first, and the count of offers still on a
   * placeholder is the number that says how far from a model this desk is.
   */
  const awaitingHuman: string[] = [];
  const placeholderBands = priceBands.filter((b) => b.source === 'compiled_placeholder').length;
  const priorEfforts = effortTriples.filter((t) => t.basis === 'prior').length;
  const noPartner = OFFER_KEYS.filter((k) => !offersWithACard.has(k)).length;

  if (placeholderBands > 0) {
    awaitingHuman.push(
      `PRICE BANDS: ${placeholderBands} of ${OFFER_KEYS.length} offers are still priced from the compiled `
      + 'placeholder. Only the founder can state a real low/mid/high. Nothing on this platform may quote '
      + `these numbers while PRICE_BANDS_ARE_PLACEHOLDERS is ${String(PRICE_BANDS_ARE_PLACEHOLDERS)}.`,
    );
  }
  if (priorEfforts > 0) {
    awaitingHuman.push(
      `EFFORT TRIPLES: ${priorEfforts} of ${OFFER_KEYS.length} offers have no measured triple, so their `
      + 'margin distribution is a prior — a guess with error bars, not a model. '
      + `EFFORT_TRIPLES_ARE_PLACEHOLDERS is ${String(EFFORT_TRIPLES_ARE_PLACEHOLDERS)}.`,
    );
  }
  if (options.length === 0) {
    awaitingHuman.push(
      'PARTNER NAMES: the delivery bench is empty (decision D5). Until a human names at least one '
      + 'partner, no rate card can be written, no offer can be staffed and no proposal can be issued.',
    );
  } else if (noPartner > 0) {
    awaitingHuman.push(
      `NAMED PARTNER: ${noPartner} of ${OFFER_KEYS.length} offers have no rate card, so no partner is on `
      + 'the hook for them and their cost basis is the catalogue placeholder.',
    );
  }

  return {
    contract: 'gps.inputs.v1',
    asOf,
    registers,
    priceBands,
    effortTriples,
    rateCards: cards,
    partnerOptions: options,
    refusals,
    awaitingHuman,
    counts: {
      offersOnPlaceholderBand: placeholderBands,
      offersOnPriorEffort: priorEfforts,
      offersWithNoPartner: noPartner,
    },
    priceBandRegisterDdl: PRICE_BAND_REGISTER_DDL,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE REGISTER THAT DOES NOT EXIST YET                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE DDL A HUMAN PASTES, verbatim, so the screen can show it rather than describe
 * it and so this file's refusal cannot disagree with the column list its own INSERT
 * uses. Same posture as `UNDERWRITING_MIGRATION_SPEC` (`gps/underwrite.ts`).
 *
 * Idempotent and forward-only: every statement is IF NOT EXISTS or a repeatable
 * ALTER/COMMENT, so re-running it is a no-op. There is NO DROP, DELETE, TRUNCATE or
 * ALTER COLUMN TYPE. Landing it as a numbered file in `apps/api/src/db/migrations/`
 * is a human's act in a commit that says so — nothing here applies migrations, and
 * this route does not own a migration file.
 *
 * SHAPE NOTES, because each is a decision:
 *  · NO `client_id`. A price that varies by client is not a band — it is a negotiated
 *    price, and that already lives on `gps_engagement`. Same reasoning as `0052:28`.
 *  · `mid_cents` IS STORED. `PriceBandCents` (`types.ts:87`) carries only min/max and
 *    `bandMidpointCents` rounds their average to whole dollars — a sensible default
 *    and a terrible record of a decision. Storing a stated mid is the difference
 *    between "he chose it" and "arithmetic chose it".
 *  · AN ORDERING CHECK, unlike `gps_effort_triple` (`0052:153`, which deliberately
 *    has none because `resolveDuration` clamps a transposed triple). Nothing clamps a
 *    price band. This route refuses first with `BAND_NOT_ASCENDING`, so the CHECK can
 *    only fire on SQL typed by hand — where a hard error is the right answer.
 *  · NO DEFAULT on any money column. A defaulted 0 prices the work as free.
 *  · RLS ON, NO POLICIES — deny-all to the anon key, which is the intent. The API
 *    connects as the owner and bypasses it, exactly as `0052:214` and `0047:333`.
 */
export const PRICE_BAND_REGISTER_DDL = `-- GPS PRICE BANDS — the SELL side. Idempotent, forward-only.
-- Paste into the Supabase SQL editor, then land this same text as the next free
-- numbered file in apps/api/src/db/migrations/.
CREATE TABLE IF NOT EXISTS gps_price_band (
  offer_key   text PRIMARY KEY
                CHECK (offer_key IN (
                  'diagnostic', 'mica_whitepaper',
                  'legal_opinion_coordination', 'gtm_sprint',
                  'marketing_activation'
                )),
  low_cents   bigint NOT NULL CHECK (low_cents  > 0),
  mid_cents   bigint NOT NULL CHECK (mid_cents  > 0),
  high_cents  bigint NOT NULL CHECK (high_cents > 0),
  currency    text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  stated_by   text NOT NULL CHECK (length(btrim(stated_by)) > 0
                                   AND length(stated_by) <= 120),
  stated_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gps_price_band_ascending
    CHECK (low_cents <= mid_cents AND mid_cents <= high_cents)
);

ALTER TABLE gps_price_band ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_price_band IS
  'GPS price band: what LCX SELLS one offer for, low/mid/high, integer cents, stated by a named human. The SELL side - gps_rate_card is the COST side and the two must never be conflated. No client_id: a price that varies by client is a negotiated price and lives on gps_engagement. Absent rows are not an error - the compiled placeholder (packages/shared/src/gps/catalogue.ts TODO_PRICE_BANDS) is used instead and every surface badges it as a placeholder.';
`;

/* ══════════════════════════════════════════════════════════════════════════ */
/* REQUEST READING                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/** A body that is not JSON is a refusal, not an unhandled throw. */
async function jsonBody(c: Context<{ Variables: AuthVariables }>): Promise<Record<string, unknown> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const BODY_NOT_AN_OBJECT = refuse(
  'BODY_NOT_AN_OBJECT',
  'The request body must be a JSON object naming one offer and its numbers.',
  'every write on this desk takes a single JSON object; there is no array form and no form encoding',
);

/** The offer key, or a refusal. Validated against the closed union, never trusted. */
function readOfferKey(body: Record<string, unknown>): { ok: true; offerKey: OfferKey } | { ok: false; refusal: Refusal } {
  const raw = body.offerKey;
  if (typeof raw === 'string' && OFFER_KEY_SET.has(raw)) return { ok: true, offerKey: raw as OfferKey };
  return {
    ok: false,
    refusal: refuse(
      'OFFER_KEY_UNKNOWN',
      `offerKey must be one of the five catalogue offers: ${OFFER_KEYS.join(', ')}.`,
      RULE_OFFER_KEYS,
      'offerKey',
    ),
  };
}

/**
 * The currency, uppercased, or a refusal.
 *
 * Deliberately NOT `typeof body.currency === 'string' ? body.currency : undefined` —
 * that exact read is what let a 112,000-character payload into a `text` column, and
 * `intakeLockout.test.ts:1027` fails the build on it. The pattern decides, and it
 * decides before the value is retained.
 */
function readCurrency(body: Record<string, unknown>): { ok: true; currency: string } | { ok: false; refusal: Refusal } {
  const raw = body.currency;
  if (typeof raw === 'string' && ISO_4217.test(raw)) return { ok: true, currency: raw.toUpperCase() };
  return {
    ok: false,
    refusal: refuse(
      'CURRENCY_NOT_ISO_4217',
      'currency must be exactly three letters, e.g. USD. Nothing here converts between currencies, so '
      + 'the code recorded is the code that will be invoiced.',
      RULE_CURRENCY,
      'currency',
    ),
  };
}

/**
 * An integer-cents money field, or a refusal naming which one it was.
 *
 * `min` is the floor the caller wants enforced: 1 for a price or a rate (zero is an
 * unfilled form, never free work) and 0 for a pass-through that legitimately may be
 * nothing. Fractions are refused rather than rounded — a rounded cent is a silent
 * edit to a number somebody typed.
 */
function readCents(
  body: Record<string, unknown>,
  field: string,
  min: 0 | 1,
  zeroCode: 'BAND_NOT_POSITIVE' | 'RATE_NOT_POSITIVE',
  zeroRule: string,
): { ok: true; value: number } | { ok: false; refusal: Refusal } {
  const raw = body[field];
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      refusal: refuse(zeroCode, `${field} must be a finite number of integer cents.`, zeroRule, field),
    };
  }
  if (!Number.isInteger(n)) {
    return {
      ok: false,
      refusal: refuse(
        'AMOUNT_NOT_INTEGER_CENTS',
        `${field} must be whole cents; ${String(raw)} is a fraction of a cent.`,
        RULE_INTEGER_CENTS,
        field,
      ),
    };
  }
  if (n < min) {
    return {
      ok: false,
      refusal: refuse(
        zeroCode,
        min === 1
          ? `${field} must be greater than zero. Zero is an unfilled form, not free work.`
          : `${field} may not be negative.`,
        zeroRule,
        field,
      ),
    };
  }
  return { ok: true, value: n };
}

/** A day count: finite and ≥ 0. Fractional days are legitimate (half a day is real). */
function readDays(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: number } | { ok: false; refusal: Refusal } {
  const raw = body[field];
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return {
      ok: false,
      refusal: refuse(
        'EFFORT_NEGATIVE',
        `${field} must be a finite number of person-days, zero or more.`,
        'gps_effort_triple CHECK (optimistic_days / likely_days / pessimistic_days >= 0), '
        + '0052_gps_underwriting.sql:165',
        field,
      ),
    };
  }
  return { ok: true, value: n };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ROUTER                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export const gpsInputsRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * THE WHOLE DESK, IN ONE READ.
 *
 * Gated at 'view' by `requireWorkspace('gps')` on the mount prefix — not declared
 * here, because a per-router gate is a second thing to forget. `requireOperator` is
 * still named so the payload can be attributed and so an unauthenticated caller gets
 * a 401 rather than a 403 from the compartment gate.
 *
 * 200 EVEN WITH NOTHING APPLIED. The refusals are IN the body, on `data.refusals`,
 * because "there is nowhere to type a price band" is an answer to the question the
 * screen asked, not a failure to answer it.
 */
gpsInputsRoutes.get('/', requireOperator, async (c) => {
  try {
    const asOf = new Date().toISOString();
    const data = await buildDesk(asOf);
    return c.json({
      data,
      meta: {
        ...meta(),
        migrated: data.registers.effortTriples && data.registers.rateCards,
        priceBandRegisterDdl: PRICE_BAND_REGISTER_DDL,
      },
    });
  } catch (err) {
    console.error('[gps] input desk error:', err);
    return c.json({ error: 'Failed to load the GPS input desk', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * STATE A PRICE BAND — low / mid / high, integer cents, one offer.
 *
 * An upsert keyed on the offer, because a band is a CURRENT POSITION and not an
 * event log: two rows for one offer would mean two prices, and whichever a read
 * happened to order first would win. The previous value is not versioned here and
 * this route does not pretend otherwise — a price-band history table is a decision
 * nobody has taken, and it is named in the hand-off rather than quietly invented.
 */
gpsInputsRoutes.post('/price-bands', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return c.json(refusalBody(BODY_NOT_AN_OBJECT), 400);

    // Validation BEFORE the probe, on every path: a malformed request is malformed in
    // every environment, and answering "awaiting migration" to a bad body sends the
    // desk to the database over a typo.
    const key = readOfferKey(body);
    if (!key.ok) return c.json(refusalBody(key.refusal), 400);

    const currency = readCurrency(body);
    if (!currency.ok) return c.json(refusalBody(currency.refusal), 400);

    const low = readCents(body, 'lowCents', 1, 'BAND_NOT_POSITIVE', RULE_BAND_POSITIVE);
    if (!low.ok) return c.json(refusalBody(low.refusal), 400);
    const mid = readCents(body, 'midCents', 1, 'BAND_NOT_POSITIVE', RULE_BAND_POSITIVE);
    if (!mid.ok) return c.json(refusalBody(mid.refusal), 400);
    const high = readCents(body, 'highCents', 1, 'BAND_NOT_POSITIVE', RULE_BAND_POSITIVE);
    if (!high.ok) return c.json(refusalBody(high.refusal), 400);

    if (!(low.value <= mid.value && mid.value <= high.value)) {
      return c.json(refusalBody(refuse(
        'BAND_NOT_ASCENDING',
        `A band must ascend: low ${low.value} ≤ mid ${mid.value} ≤ high ${high.value} does not hold. `
        + 'Nothing downstream reorders these, so the quote would open below its own floor.',
        RULE_BAND_ORDER,
        'midCents',
      )), 400);
    }

    const registers = await inputRegisters();
    if (!registers.priceBands) {
      // 503, never 500 and never a silent success: the write did not happen and the
      // environment is why. The DDL travels WITH the refusal so the person reading it
      // has the fix in hand.
      return c.json({
        ...refusalBody(refuse(
          'PRICE_BAND_REGISTER_ABSENT',
          PRICE_BAND_REGISTER_ABSENT_REASON,
          'no gps_price_band relation; 0052_gps_underwriting.sql created the cost side only (0052:28-35)',
        )),
        meta: { ...meta(), migrated: false, priceBandRegisterDdl: PRICE_BAND_REGISTER_DDL },
      }, 503);
    }

    const statedBy = c.get('operator')?.id ?? 'unknown';
    await getPool().query(
      `INSERT INTO gps_price_band
         (offer_key, low_cents, mid_cents, high_cents, currency, stated_by, stated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (offer_key) DO UPDATE
         SET low_cents = EXCLUDED.low_cents,
             mid_cents = EXCLUDED.mid_cents,
             high_cents = EXCLUDED.high_cents,
             currency = EXCLUDED.currency,
             stated_by = EXCLUDED.stated_by,
             stated_at = now(),
             updated_at = now()`,
      [key.offerKey, low.value, mid.value, high.value, currency.currency, statedBy],
    );

    // The desk is re-read rather than patched client-side, so the row the screen shows
    // is the row the database holds and `source` flips to 'entered' from data.
    const data = await buildDesk(new Date().toISOString());
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] price band write error:', err);
    return c.json({ error: 'Failed to record this price band', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * STATE AN EFFORT TRIPLE — optimistic / likely / pessimistic person-days.
 *
 * The ordering check is the whole point of this handler existing rather than an
 * INSERT: `gps_effort_triple` carries no ordering CHECK on purpose (`0052:153`), and
 * `resolveDuration` CLAMPS a transposed triple downstream — which means a transposed
 * triple never errors, it just quietly becomes a different triple than the one
 * somebody typed. Refusing here is the only place that difference is visible.
 */
gpsInputsRoutes.post('/effort-triples', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return c.json(refusalBody(BODY_NOT_AN_OBJECT), 400);

    const key = readOfferKey(body);
    if (!key.ok) return c.json(refusalBody(key.refusal), 400);

    const o = readDays(body, 'optimisticDays');
    if (!o.ok) return c.json(refusalBody(o.refusal), 400);
    const l = readDays(body, 'likelyDays');
    if (!l.ok) return c.json(refusalBody(l.refusal), 400);
    const p = readDays(body, 'pessimisticDays');
    if (!p.ok) return c.json(refusalBody(p.refusal), 400);

    if (!(o.value <= l.value && l.value <= p.value)) {
      return c.json(refusalBody(refuse(
        'EFFORT_NOT_ASCENDING',
        `A triple must ascend: optimistic ${o.value} ≤ likely ${l.value} ≤ pessimistic ${p.value} does `
        + 'not hold. Downstream this would be CLAMPED rather than rejected, so the model would silently '
        + 'run on a triple nobody stated.',
        RULE_EFFORT_ORDER,
        'likelyDays',
      )), 400);
    }

    const registers = await inputRegisters();
    if (!registers.effortTriples) {
      return c.json({
        ...refusalBody(refuse(
          'EFFORT_REGISTER_ABSENT',
          'There is nowhere to record an effort triple on this environment: no gps_effort_triple relation '
          + 'exists. Apply 0052_gps_underwriting.sql.',
          '0052_gps_underwriting.sql:157 creates gps_effort_triple; nothing applies migrations on deploy',
        )),
        meta: { ...meta(), migrated: false },
      }, 503);
    }

    const statedBy = c.get('operator')?.id ?? 'unknown';
    await getPool().query(
      `INSERT INTO gps_effort_triple
         (offer_key, optimistic_days, likely_days, pessimistic_days, stated_by, stated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (offer_key) DO UPDATE
         SET optimistic_days = EXCLUDED.optimistic_days,
             likely_days = EXCLUDED.likely_days,
             pessimistic_days = EXCLUDED.pessimistic_days,
             stated_by = EXCLUDED.stated_by,
             stated_at = now(),
             updated_at = now()`,
      [key.offerKey, o.value, l.value, p.value, statedBy],
    );

    const data = await buildDesk(new Date().toISOString());
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] effort triple write error:', err);
    return c.json({ error: 'Failed to record this effort triple', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * RECORD WHAT A NAMED PARTNER CHARGES LCX FOR ONE OFFER.
 *
 * Upsert on (partner_id, offer_key), which is the primary key `0052:129` declares and
 * therefore the rule that "one card per offer they can deliver" already means.
 *
 * THE PARTNER MUST ALREADY HAVE A NAME IN THIS SYSTEM. That is checked against the
 * compiled bench and the cards on file, and today both are empty — so this route
 * refuses every write with `PARTNER_BENCH_EMPTY` and says who has to fix it. It would
 * be trivial to accept any string and let the first card create its own partner; that
 * is precisely how a typo becomes a second partner and a margin gets attributed to
 * nobody. The first name is a human's decision, in one of two places, and the refusal
 * names both.
 */
gpsInputsRoutes.post('/rate-cards', requireOperator, async (c) => {
  try {
    const body = await jsonBody(c);
    if (!body) return c.json(refusalBody(BODY_NOT_AN_OBJECT), 400);

    const key = readOfferKey(body);
    if (!key.ok) return c.json(refusalBody(key.refusal), 400);

    const unitRaw = body.unit;
    if (typeof unitRaw !== 'string' || !RATE_UNITS.includes(unitRaw as RateUnit)) {
      return c.json(refusalBody(refuse(
        'RATE_UNIT_UNKNOWN',
        `unit must be one of ${RATE_UNITS.join(', ')}.`,
        'RateUnit (packages/shared/src/gps/partners.ts:161), mirrored as a CHECK in '
        + '0052_gps_underwriting.sql:70',
        'unit',
      )), 400);
    }
    const unit = unitRaw as RateUnit;

    const currency = readCurrency(body);
    if (!currency.ok) return c.json(refusalBody(currency.refusal), 400);

    const amount = readCents(body, 'amountCents', 1, 'RATE_NOT_POSITIVE', RULE_ZERO_IS_A_REFUSAL);
    if (!amount.ok) return c.json(refusalBody(amount.refusal), 400);

    const fixedCost = readCents(body, 'fixedCostCents', 0, 'RATE_NOT_POSITIVE', RULE_ZERO_IS_A_REFUSAL);
    if (!fixedCost.ok) return c.json(refusalBody(fixedCost.refusal), 400);

    // Metered units need a unit count. The COLUMN is nullable because null honestly
    // means "the cost cannot be derived" (0052:77) — but a card the desk cannot cost
    // is a card the desk should not have accepted, so it is refused at the door.
    let expectedUnits: number | null = null;
    if (unit !== 'fixed') {
      const n = numOrNull(body.expectedUnits);
      if (n === null || n <= 0) {
        return c.json(refusalBody(refuse(
          'UNITS_NOT_STATED',
          `A ${unit} card needs expectedUnits — how many units one engagement of this offer buys. `
          + 'Nothing here assumes 1: an assumed unit count is an invented number on a proposal.',
          RULE_UNITS,
          'expectedUnits',
        )), 400);
      }
      expectedUnits = n;
    }

    // Hourly only, because the effort triple is in DAYS. It lives on the card and
    // never on a request: a caller who wanted a better-looking margin would supply 1.
    let hoursPerDay: number | null = null;
    if (unit === 'hourly') {
      const n = numOrNull(body.hoursPerDay);
      if (n === null || n <= 0) {
        return c.json(refusalBody(refuse(
          'HOURS_PER_DAY_NOT_STATED',
          'An hourly card needs hoursPerDay, because effort is recorded in days and nothing here will '
          + 'assume an 8-hour day on a proposal.',
          RULE_HOURS_PER_DAY,
          'hoursPerDay',
        )), 400);
      }
      hoursPerDay = n;
    }

    const validUntilRaw = body.validUntil;
    if (typeof validUntilRaw !== 'string' || validUntilRaw.trim() === '') {
      return c.json(refusalBody(refuse(
        'VALIDITY_NOT_STATED',
        'validUntil is required. A rate with no expiry is a rate nobody re-confirmed, and it is treated '
        + 'as UNUSABLE rather than as valid forever — so a card saved without one could never be '
        + 'underwritten against.',
        RULE_VALIDITY,
        'validUntil',
      )), 400);
    }
    const validUntil = isoOrNull(validUntilRaw);
    if (validUntil === null) {
      return c.json(refusalBody(refuse(
        'VALIDITY_NOT_A_DATE',
        `validUntil must be a date this system can compare against. '${validUntilRaw.slice(0, 40)}' is not.`,
        RULE_VALIDITY,
        'validUntil',
      )), 400);
    }

    /**
     * THE DERIVED COST DECIDES, NOT `amountCents`.
     *
     * `rateCardCostCents` is where the zero guard AND the round-to-zero guard live,
     * and its own docblock is explicit that a caller which inspects `amountCents` and
     * decides for itself inherits neither — which is how a 0.0001c/day card once
     * underwrote at 100% margin with pLoss 0. A card whose engagement cost cannot be
     * derived, or rounds to nothing, is refused here rather than saved and refused
     * later by every read.
     */
    const asOf = new Date().toISOString();
    const statedBy = c.get('operator')?.id ?? 'unknown';
    const probe: RateCard = {
      offerKey: key.offerKey,
      unit,
      amountCents: amount.value,
      expectedUnits,
      currency: currency.currency,
      validUntil,
      statedBy,
      statedAt: asOf,
    };
    if (rateCardCostCents(probe) === null) {
      return c.json(refusalBody(refuse(
        'RATE_BELOW_ONE_CENT',
        'The cost of one engagement under this card rounds to nothing, so it cannot be underwritten. A '
        + 'card that prices at zero produces 100% margin and P(loss) 0 — the most flattering lie this '
        + 'table can tell.',
        RULE_ZERO_IS_A_REFUSAL,
        'amountCents',
      )), 400);
    }

    const registers = await inputRegisters();
    if (!registers.rateCards) {
      return c.json({
        ...refusalBody(refuse(
          'RATE_CARD_REGISTER_ABSENT',
          'There is nowhere to record a partner rate card on this environment: no gps_rate_card relation '
          + 'exists. Apply 0052_gps_underwriting.sql.',
          '0052_gps_underwriting.sql:51 creates gps_rate_card; nothing applies migrations on deploy',
        )),
        meta: { ...meta(), migrated: false },
      }, 503);
    }

    const known = await getPool().query(
      'SELECT DISTINCT partner_id, partner_label FROM gps_rate_card',
    );
    const options = partnerOptions(
      (known.rows as Array<Record<string, unknown>>)
        .map((r) => ({ partnerId: textOrNull(r.partner_id), partnerLabel: textOrNull(r.partner_label) }))
        .filter((r): r is { partnerId: string; partnerLabel: string | null } => r.partnerId !== null),
    );

    const partnerId = textOrNull(body.partnerId);
    if (options.length === 0) {
      // 409, not 400: the request is well-formed and the system's own state is what
      // makes it impossible. A 400 would tell the operator they typed something wrong.
      return c.json({
        ...refusalBody(refuse(
          'PARTNER_BENCH_EMPTY',
          'This system knows no partner names, so no rate card can name one. A human must supply the '
          + 'first name — either by adding a Partner to PARTNER_BENCH in '
          + 'packages/shared/src/gps/partners.ts:332, or by inserting one gps_rate_card row by hand in '
          + 'the Supabase SQL editor. Nothing here will invent a name to make this screen work.',
          RULE_BENCH_EMPTY,
          'partnerId',
        )),
        meta: { ...meta(), migrated: true },
      }, 409);
    }
    if (partnerId === null || !options.some((o) => o.partnerId === partnerId)) {
      return c.json({
        ...refusalBody(refuse(
          'PARTNER_NOT_ON_BENCH',
          'partnerId must be a partner this system already knows. Known: '
          + options.map((o) => o.partnerId).join(', ')
          + '. A card that creates its own partner is how a typo becomes a second partner and a margin '
          + 'gets attributed to nobody.',
          RULE_BENCH_EMPTY,
          'partnerId',
        )),
        meta: { ...meta(), migrated: true },
      }, 409);
    }

    const partnerLabel = textOrNull(body.partnerLabel);
    await getPool().query(
      `INSERT INTO gps_rate_card
         (partner_id, offer_key, unit, amount_cents, expected_units, hours_per_day,
          fixed_cost_cents, currency, valid_until, stated_by, stated_at, partner_label, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11, now())
       ON CONFLICT (partner_id, offer_key) DO UPDATE
         SET unit = EXCLUDED.unit,
             amount_cents = EXCLUDED.amount_cents,
             expected_units = EXCLUDED.expected_units,
             hours_per_day = EXCLUDED.hours_per_day,
             fixed_cost_cents = EXCLUDED.fixed_cost_cents,
             currency = EXCLUDED.currency,
             valid_until = EXCLUDED.valid_until,
             stated_by = EXCLUDED.stated_by,
             stated_at = now(),
             partner_label = EXCLUDED.partner_label,
             updated_at = now()`,
      [
        partnerId, key.offerKey, unit, amount.value, expectedUnits, hoursPerDay,
        fixedCost.value, currency.currency, validUntil, statedBy, partnerLabel,
      ],
    );

    const data = await buildDesk(new Date().toISOString());
    return c.json({ data, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] rate card write error:', err);
    return c.json({ error: 'Failed to record this rate card', code: 'GPS_ERROR' }, 500);
  }
});
