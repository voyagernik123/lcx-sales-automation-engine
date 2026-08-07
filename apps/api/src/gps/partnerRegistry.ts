import type { Pool } from 'pg';
import {
  CURRENCY_CODE_RE,
  OFFER_KEYS,
  inputEmpty,
  inputLoaded,
  inputNotLoaded,
  partnerAssertionDefects,
  priceFloor,
  rateCardCostCents,
  type FloorEffortInput,
  type FloorEffortPoint,
  type OfferKey,
  type Partner,
  type PartnerCapability,
  type PartnerRegistryBenchMember,
  type PriceFloorOutcome,
  type RateCard,
  type RateUnit,
  type Seniority,
  type SuppliedInput,
} from '@lcx/shared';
// ONE copy of the environment label in this process, not a second one. The shared
// `environmentLabelFromDatabaseUrl` (packages/shared/src/marks/mark.ts:752) is not
// reachable through the root barrel, so `kpi/platformForecast.ts:308` already holds
// an exact copy with the semantics that matter — credentials do not survive, and an
// unparseable string is `null` rather than the sentinel 'unknown'. Importing that one
// is one fewer copy than writing a third.
import { environmentLabel } from '../kpi/platformForecast.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SERVICES (GPS) — THE PARTNER REGISTRY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE DECISION THIS FILE IMPLEMENTS. On 2026-08-07 the owner answered the question
 * that blocked the delivery bench: A NAMED HUMAN MAY ASSERT A PARTNER NAME AND A
 * RATE CARD, ATTRIBUTED TO THEM. Every write here records who, when and on what
 * basis, and refuses when any of the three is missing.
 *
 * ── THE DEADLOCK THIS BREAKS ─────────────────────────────────────────────────
 * `routes/gpsInputs.ts:1172` builds its partner list from
 * `SELECT DISTINCT partner_id FROM gps_rate_card` plus `PARTNER_BENCH` — a compiled
 * empty array. So the only way to enter the FIRST rate card was to insert a
 * `gps_rate_card` row BY HAND in the Supabase SQL editor, which its own refusal
 * says out loud. A rate card was the only way to become a partner, and being a
 * partner was the only way to have a rate card. That is why the registry is a table
 * and not a screen: it is the entry point that has no predecessor.
 *
 * ── THREE STATES, NEVER COLLAPSED ────────────────────────────────────────────
 * Every read returns a `SuppliedInput` (`packages/shared/src/gps/partners.ts`):
 * `not_loaded` when the relation does not exist on this environment or the query
 * was not run, `withheld` when a clearance stops it, `empty` when it was looked for
 * and is genuinely absent, `loaded` otherwise. A registry that has not been migrated
 * must never answer the same way as a bench nobody has hired into — the first is one
 * SQL file, the second is a month of conversations.
 *
 * ── NOTHING HERE COMPUTES A FLOOR ────────────────────────────────────────────
 * `floorFor` LOADS rows and hands them to `priceFloor`
 * (`packages/shared/src/gps/partners.ts`), which is pure, has no clock, no database
 * and no default. This file supplies the two things that function refuses to invent
 * for itself: the instant (`asOf`) and the environment label. If the arithmetic ever
 * appears in this file, the floor has two definitions and the one on the screen will
 * be whichever ran last.
 *
 * ── NO CLIENT MATERIAL REACHES THIS FILE ─────────────────────────────────────
 * The inputs are a partner id, a display name, a sentence of basis, five offer keys,
 * a three-letter currency and integer cents. Decision D2 (LCX legal/DPO, controller
 * vs processor for a third party's confidential material) was answered YES on
 * 2026-08-02 for ONE reviewed intake surface (`routes/gpsArtifact.ts`), and this is
 * not it: no byte, no filename, no mime type, no location, no outbound fetch.
 * `gps/__tests__/intakeLockout.test.ts` discovers this file by path.
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE MIGRATION, AND THE PROBE THAT IS NEVER ITSELF THE ERROR                 */
/* ══════════════════════════════════════════════════════════════════════════ */

export const PARTNER_REGISTRY_MIGRATION = '0075_gps_partner_registry.sql';

/**
 * Reads degrade to this and writes answer 503 with it — never 500. A 500 during the
 * deploy-before-migration window reads as "the platform is down", and the desk acts
 * on that reading instead of on "apply one migration".
 */
export const PARTNER_REGISTRY_NOT_MIGRATED = {
  code: 'PARTNER_REGISTRY_ABSENT',
  reason:
    `No partner registry exists on this environment: migration ${PARTNER_REGISTRY_MIGRATION} `
    + '(tables gps_partner_registry, gps_partner_capability) has not been applied. This is NOT "the bench '
    + 'is empty" — nobody has been asked yet, because there is nowhere to record an answer.',
} as const;

export interface PartnerRegistryPresence {
  registry: boolean;
  capabilities: boolean;
  rateCards: boolean;
  effortTriples: boolean;
}

let presenceCache: PartnerRegistryPresence | null = null;

/**
 * Which relations exist. ONE round trip, FOUR booleans, separately reported because
 * applying half a migration is a real state and each half fails differently: no
 * registry means nobody can be asserted; no rate cards means nobody can be costed;
 * no effort triples means only a fixed-fee card can produce a floor.
 *
 * `to_regclass` returns NULL on absence instead of throwing, exactly as
 * `gps/service.ts:80`, `gps/loop.ts:154` and `gps/underwrite.ts:223`, so the probe
 * cannot be the thing that breaks.
 */
export async function partnerRegistryPresence(pool: Pool): Promise<PartnerRegistryPresence> {
  if (presenceCache !== null) return presenceCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_partner_registry')   IS NOT NULL AS registry,
              to_regclass('public.gps_partner_capability') IS NOT NULL AS capabilities,
              to_regclass('public.gps_rate_card')          IS NOT NULL AS rate_cards,
              to_regclass('public.gps_effort_triple')      IS NOT NULL AS effort_triples`,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    presenceCache = {
      registry: Boolean(row?.registry),
      capabilities: Boolean(row?.capabilities),
      rateCards: Boolean(row?.rate_cards),
      effortTriples: Boolean(row?.effort_triples),
    };
  } catch {
    // A database that cannot answer this cannot serve a bench either. Report absent
    // rather than propagating, and let the refusal carry the reason.
    presenceCache = { registry: false, capabilities: false, rateCards: false, effortTriples: false };
  }
  return presenceCache;
}

/** Test-only: forget the probe. */
export function _resetPartnerRegistryProbes(): void {
  presenceCache = null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ROW NORMALISATION — `bigint` and `numeric` arrive as strings                */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `bigint` and `numeric` are handed back by node-postgres as STRINGS, because
 * neither fits a JS number in general. Ours do; the driver cannot know that.
 *
 * Returns `null` rather than `0` for anything unreadable, on the rule this whole
 * compartment runs on: a 0 that means "could not read the column" is the same defect
 * as a 0 that means "free".
 */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};

const isoOrNull = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const OFFER_KEY_SET: ReadonlySet<string> = new Set<string>(OFFER_KEYS);
const RATE_UNITS: ReadonlySet<string> = new Set<string>(['fixed', 'day_rate', 'hourly']);
const SENIORITIES: ReadonlySet<string> = new Set<string>(['principal', 'senior', 'associate']);

/* ══════════════════════════════════════════════════════════════════════════ */
/* READING THE BENCH                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

const REGISTRY_COLS = `partner_id, partner_name, asserted_by, asserted_at, assertion_basis,
  active, max_concurrent, capacity_stated_by, capacity_stated_at, unavailable_until,
  bd_partner_id, notes`;

/**
 * A partner row plus the two facts the domain `Partner` cannot carry: whether the
 * capacity was ever stated, and the BD link.
 *
 * ALIASED, NOT REDECLARED. The wire shape is `PartnerRegistryBenchMember`
 * (`packages/shared/src/gps/partners.ts`), which the route, the page and both their
 * tests measure themselves against. A second interface here that happened to match
 * today is the `GpsSummary` failure again: two hand-written artefacts agreeing with
 * each other is not a contract.
 */
export type BenchMember = PartnerRegistryBenchMember;

export type BenchReading = SuppliedInput<readonly BenchMember[]>;

function rowToMember(
  row: Record<string, unknown>,
  capabilities: readonly PartnerCapability[],
  rateCards: readonly RateCard[],
): BenchMember | null {
  const id = textOrNull(row.partner_id);
  const name = textOrNull(row.partner_name);
  const assertedBy = textOrNull(row.asserted_by);
  const assertedAt = isoOrNull(row.asserted_at);
  const basis = textOrNull(row.assertion_basis);
  // A row that cannot make a well-formed partner is DROPPED rather than repaired.
  // The schema forbids all four being absent (NOT NULL + CHECK), so a row that gets
  // here is a row written before 0075 or by hand around it, and inventing
  // "asserted by unknown" for it is precisely the unattributed cost basis the
  // migration exists to prevent.
  if (id === null || name === null || assertedBy === null || assertedAt === null || basis === null) return null;

  const maxConcurrent = numOrNull(row.max_concurrent);
  return {
    partner: {
      id,
      name,
      assertion: { assertedBy, assertedAt, basis },
      active: row.active !== false,
      capabilities,
      rateCards,
      capacity: {
        // 0 when nobody stated it, and `capacityStated: false` beside it. The engine
        // reads 0 as "no spare slot", which refuses to staff — the safe direction.
        maxConcurrent: maxConcurrent ?? 0,
        statedBy: textOrNull(row.capacity_stated_by) ?? 'not stated',
        statedAt: isoOrNull(row.capacity_stated_at) ?? assertedAt,
        unavailableUntil: isoOrNull(row.unavailable_until),
      },
      notes: textOrNull(row.notes),
    },
    capacityStated: maxConcurrent !== null,
    bdPartnerId: textOrNull(row.bd_partner_id),
  };
}

function rowToCapability(row: Record<string, unknown>): PartnerCapability | null {
  const offerKey = textOrNull(row.offer_key);
  const seniority = textOrNull(row.seniority);
  if (offerKey === null || !OFFER_KEY_SET.has(offerKey)) return null;
  if (seniority === null || !SENIORITIES.has(seniority)) return null;
  const raw = row.jurisdictions;
  const jurisdictions = Array.isArray(raw)
    ? raw.map((j) => (typeof j === 'string' ? j : '')).filter((j) => j.trim() !== '')
    : [];
  return {
    offerKey: offerKey as OfferKey,
    seniority: seniority as Seniority,
    jurisdictions,
    evidence: textOrNull(row.evidence),
  };
}

function rowToRateCard(row: Record<string, unknown>): RateCard | null {
  const offerKey = textOrNull(row.offer_key);
  const unit = textOrNull(row.unit);
  const amountCents = numOrNull(row.amount_cents);
  if (offerKey === null || !OFFER_KEY_SET.has(offerKey)) return null;
  if (unit === null || !RATE_UNITS.has(unit)) return null;
  if (amountCents === null) return null;
  return {
    offerKey: offerKey as OfferKey,
    unit: unit as RateUnit,
    amountCents,
    expectedUnits: numOrNull(row.expected_units),
    currency: (textOrNull(row.currency) ?? '').toUpperCase(),
    // NULL survives as null. `rateCardStatus` reads it as `no_validity_stated`,
    // which is UNUSABLE — never "valid forever".
    validUntil: isoOrNull(row.valid_until),
    statedBy: textOrNull(row.stated_by) ?? 'unknown',
    statedAt: isoOrNull(row.stated_at) ?? '1970-01-01T00:00:00.000Z',
  };
}

/**
 * THE BENCH, WITH ITS CAPABILITIES AND ITS RATE CARDS — or the state that says why
 * there is none.
 *
 * Three queries, not one join: the capability and rate-card relations can each be
 * absent independently (0075 and 0052 are applied by hand, in any order a human
 * happens to run them), and a join against a missing relation is a 42P01 for a
 * schema fact the code could have asked about first.
 */
export async function loadBench(pool: Pool): Promise<BenchReading> {
  const presence = await partnerRegistryPresence(pool);
  if (!presence.registry) {
    return inputNotLoaded(PARTNER_REGISTRY_NOT_MIGRATED.reason);
  }

  const rows = (await pool.query(
    `SELECT ${REGISTRY_COLS} FROM gps_partner_registry ORDER BY partner_name ASC`,
  )).rows as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    return inputEmpty(
      'The partner registry exists and holds no rows: nobody has asserted a delivery partner yet. '
      + 'This is a conversation to have, not a migration to apply.',
    );
  }

  const capsByPartner = new Map<string, PartnerCapability[]>();
  if (presence.capabilities) {
    const capRows = (await pool.query(
      'SELECT partner_id, offer_key, seniority, jurisdictions, evidence FROM gps_partner_capability',
    )).rows as Array<Record<string, unknown>>;
    for (const r of capRows) {
      const pid = textOrNull(r.partner_id);
      const cap = rowToCapability(r);
      if (pid === null || cap === null) continue;
      const list = capsByPartner.get(pid) ?? [];
      list.push(cap);
      capsByPartner.set(pid, list);
    }
  }

  const cardsByPartner = new Map<string, RateCard[]>();
  if (presence.rateCards) {
    const cardRows = (await pool.query(
      `SELECT partner_id, offer_key, unit, amount_cents, expected_units, currency,
              valid_until, stated_by, stated_at
         FROM gps_rate_card`,
    )).rows as Array<Record<string, unknown>>;
    for (const r of cardRows) {
      const pid = textOrNull(r.partner_id);
      const card = rowToRateCard(r);
      if (pid === null || card === null) continue;
      const list = cardsByPartner.get(pid) ?? [];
      list.push(card);
      cardsByPartner.set(pid, list);
    }
  }

  const members: BenchMember[] = [];
  for (const row of rows) {
    const pid = textOrNull(row.partner_id) ?? '';
    const m = rowToMember(row, capsByPartner.get(pid) ?? [], cardsByPartner.get(pid) ?? []);
    if (m !== null) members.push(m);
  }
  return inputLoaded(members);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* WRITING — every write is an assertion by a named human                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/** A refusal from this module. Same shape the GPS input desk already renders. */
export interface RegistryRefusal {
  code: string;
  reason: string;
  /** The rule this applies, quoted. "Invalid input" teaches nobody which field. */
  rule: string;
  field: string | null;
}

export type RegistryWrite<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: RegistryRefusal; status: 400 | 409 | 503 };

const refusal = (code: string, reason: string, rule: string, field: string | null = null): RegistryRefusal =>
  ({ code, reason, rule, field });

const RULE_ATTRIBUTION =
  'The owner decided on 2026-08-07 that a named human may assert a partner and a rate card, ATTRIBUTED '
  + 'TO THEM. gps_partner_registry enforces who / when / on what basis with NOT NULL + CHECK, not by '
  + 'convention, because an unattributed cost basis is one nobody stands behind.';

const RULE_ZERO_IS_A_REFUSAL =
  'rateCardCostCents (packages/shared/src/gps/partners.ts) returns null for a rate of zero, a negative '
  + 'rate, or a product that rounds to zero. A 0c card is an unfilled form, never a partner working for '
  + 'nothing: read literally it underwrites at 100% margin with pLoss 0 and prints "quote is '
  + 'conservative" on a proposal.';

const RULE_VALIDITY =
  'RateCard.validUntil (packages/shared/src/gps/partners.ts): null means NO VALIDITY WAS EVER STATED and '
  + 'is treated as UNUSABLE, not as valid forever. A rate with no expiry is a rate nobody re-confirmed.';

const RULE_CURRENCY =
  'Currency is a CLOSED three-letter pattern on every GPS route, never a free string: a text column with '
  + 'no length, on a server with no bodyLimit, is a document-sized channel into a compartment that must '
  + 'not hold documents.';

const RULE_UNITS =
  'expected_units is nullable because null legitimately means "the cost cannot be derived" '
  + '(0052_gps_underwriting.sql:77), and rateCardCostCents returns null rather than assuming 1. A card '
  + 'whose cost cannot be derived is useless to the desk entering it, so it is refused at the edge.';

const RULE_HOURS_PER_DAY =
  'hours_per_day lives on the card and never on a request (0052_gps_underwriting.sql:82): the effort '
  + 'triple is in DAYS, and an assumed 8 is an invented number on a proposal.';

const RULE_OFFER_KEYS =
  'offer_key is a closed union of the five catalogue offers, in the schema and at the edge, so a typo '
  + 'fails rather than creating a rate for an offer that does not exist.';

const MAX_NAME = 200;
const MAX_BASIS = 2000;
const MAX_ID = 120;
const MAX_NOTES = 4000;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface AssertPartnerInput {
  partnerId: string;
  partnerName: string;
  assertionBasis: string;
  /** From `c.get('operator')`. NEVER a body field — see the route's docblock. */
  assertedBy: string;
  /** ISO instant, supplied by the caller. Nothing here reads the clock. */
  assertedAt: string;
  active?: boolean;
  /** NULL means NOBODY STATED IT. 0 means FULL. The two never collapse. */
  maxConcurrent?: number | null;
  unavailableUntil?: string | null;
  bdPartnerId?: string | null;
  notes?: string | null;
}

/**
 * ASSERT A PARTNER ONTO THE DELIVERY BENCH.
 *
 * Validation runs BEFORE the probe on every write, because a malformed request is
 * malformed in every environment and answering "awaiting migration" to a typo sends
 * the desk to the database for nothing.
 *
 * `partnerAssertionDefects` — the SHARED predicate — decides whether the attribution
 * is well-formed. Not a second copy of the rule here: the domain model, the database
 * CHECK and this route would then be three definitions of "attributed", and the one
 * that drifted would be the one deciding what reaches the column.
 */
export async function assertPartner(
  pool: Pool,
  input: AssertPartnerInput,
): Promise<RegistryWrite<{ partnerId: string; created: boolean }>> {
  const partnerId = (input.partnerId ?? '').trim();
  const partnerName = (input.partnerName ?? '').trim();
  const basis = (input.assertionBasis ?? '').trim();
  const assertedBy = (input.assertedBy ?? '').trim();
  const assertedAt = isoOrNull(input.assertedAt);

  const defects = partnerAssertionDefects({
    id: partnerId,
    name: partnerName,
    assertion: { assertedBy, assertedAt: assertedAt ?? '', basis },
  });
  if (defects.length > 0) {
    const first = defects[0]!;
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        first.code,
        // EVERY defect in one sentence, not the first: a human told one thing at a
        // time submits the form four times and learns the surface is hostile.
        defects.map((d) => d.sentence).join(' '),
        RULE_ATTRIBUTION,
        first.field,
      ),
    };
  }
  if (partnerId.length > MAX_ID || partnerName.length > MAX_NAME || basis.length > MAX_BASIS) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'PARTNER_FIELD_TOO_LONG',
        `partnerId ≤ ${MAX_ID}, partnerName ≤ ${MAX_NAME}, assertionBasis ≤ ${MAX_BASIS} characters. `
        + 'The ceilings are the schema\'s, and they are a channel control as much as a data one.',
        RULE_CURRENCY,
        partnerId.length > MAX_ID ? 'partnerId' : partnerName.length > MAX_NAME ? 'partnerName' : 'assertionBasis',
      ),
    };
  }

  const maxConcurrent = input.maxConcurrent ?? null;
  if (maxConcurrent !== null && (!Number.isInteger(maxConcurrent) || maxConcurrent < 0 || maxConcurrent > 100)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'CAPACITY_NOT_A_COUNT',
        'maxConcurrent must be a whole number of engagements between 0 and 100, or absent. Absent means '
        + 'NOBODY HAS STATED IT; 0 means the partner is FULL. They are different facts and this system '
        + 'will not let one stand in for the other.',
        'gps_partner_registry.max_concurrent: NULL is "nobody asked", 0 is "full" (0075).',
        'maxConcurrent',
      ),
    };
  }

  const notes = textOrNull(input.notes ?? null);
  if (notes !== null && notes.length > MAX_NOTES) {
    return {
      ok: false,
      status: 400,
      refusal: refusal('PARTNER_FIELD_TOO_LONG', `notes ≤ ${MAX_NOTES} characters.`, RULE_CURRENCY, 'notes'),
    };
  }

  const bdPartnerId = textOrNull(input.bdPartnerId ?? null);
  if (bdPartnerId !== null && !UUID_RE.test(bdPartnerId)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'BD_PARTNER_ID_NOT_A_UUID',
        'bdPartnerId must be the uuid of a row in the BD `partners` table, or absent. Absent means NOBODY '
        + 'STATED A LINK — it never means "this is a different entity".',
        'gps_partner_registry.bd_partner_id REFERENCES partners(id) ON DELETE RESTRICT (0075).',
        'bdPartnerId',
      ),
    };
  }

  const unavailableUntil = input.unavailableUntil == null ? null : isoOrNull(input.unavailableUntil);
  if (input.unavailableUntil != null && unavailableUntil === null) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'UNAVAILABLE_UNTIL_UNREADABLE',
        `'${String(input.unavailableUntil).slice(0, 40)}' is not a date this system can compare against. `
        + 'It is refused rather than interpreted.',
        'Availability windows are evaluated against a caller-supplied asOf; nothing here reads the clock.',
        'unavailableUntil',
      ),
    };
  }

  const presence = await partnerRegistryPresence(pool);
  if (!presence.registry) {
    return {
      ok: false,
      status: 503,
      refusal: refusal(
        PARTNER_REGISTRY_NOT_MIGRATED.code,
        PARTNER_REGISTRY_NOT_MIGRATED.reason,
        `${PARTNER_REGISTRY_MIGRATION} creates gps_partner_registry; nothing applies migrations on deploy.`,
        null,
      ),
    };
  }

  const existing = await pool.query(
    'SELECT partner_id FROM gps_partner_registry WHERE partner_id = $1',
    [partnerId],
  );
  const created = existing.rows.length === 0;

  // UPSERT, and the assertion is REPLACED rather than accumulated. A second
  // assertion of the same partner is a new claim by a new person and the row records
  // the current one; the history of who believed what lives in the audit trail, not
  // in a column this screen would have to render as a list.
  await pool.query(
    `INSERT INTO gps_partner_registry
       (partner_id, partner_name, asserted_by, asserted_at, assertion_basis, active,
        max_concurrent, capacity_stated_by, capacity_stated_at, unavailable_until,
        bd_partner_id, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (partner_id) DO UPDATE
       SET partner_name = EXCLUDED.partner_name,
           asserted_by = EXCLUDED.asserted_by,
           asserted_at = EXCLUDED.asserted_at,
           assertion_basis = EXCLUDED.assertion_basis,
           active = EXCLUDED.active,
           max_concurrent = EXCLUDED.max_concurrent,
           capacity_stated_by = EXCLUDED.capacity_stated_by,
           capacity_stated_at = EXCLUDED.capacity_stated_at,
           unavailable_until = EXCLUDED.unavailable_until,
           bd_partner_id = EXCLUDED.bd_partner_id,
           notes = EXCLUDED.notes,
           updated_at = now()`,
    [
      partnerId, partnerName, assertedBy, assertedAt, basis, input.active !== false,
      maxConcurrent,
      // The capacity claim travels whole or not at all — the CHECK in 0075 enforces
      // it, and sending two of three fields would be a 23514 the operator cannot read.
      maxConcurrent === null ? null : assertedBy,
      maxConcurrent === null ? null : assertedAt,
      unavailableUntil, bdPartnerId, notes,
    ],
  );

  return { ok: true, value: { partnerId, created } };
}

export interface RecordCapabilityInput {
  partnerId: string;
  offerKey: string;
  seniority: string;
  jurisdictions: readonly string[];
  evidence: string | null;
  statedBy: string;
  statedAt: string;
}

/**
 * WHAT THIS PARTNER CAN DELIVER. Refuses for a partner nobody asserted, because a
 * capability is a claim ABOUT a partner and there is nothing to make it about.
 */
export async function recordCapability(
  pool: Pool,
  input: RecordCapabilityInput,
): Promise<RegistryWrite<{ partnerId: string; offerKey: OfferKey }>> {
  const partnerId = (input.partnerId ?? '').trim();
  const offerKey = (input.offerKey ?? '').trim();
  const seniority = (input.seniority ?? '').trim();

  if (!OFFER_KEY_SET.has(offerKey)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'OFFER_KEY_UNKNOWN',
        `offerKey must be one of: ${OFFER_KEYS.join(', ')}.`,
        RULE_OFFER_KEYS,
        'offerKey',
      ),
    };
  }
  if (!SENIORITIES.has(seniority)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'SENIORITY_UNKNOWN',
        'seniority must be principal, senior or associate — per capability, not per partner: the same '
        + 'person can be a principal on one offer and an associate on another.',
        'Seniority is per-capability (packages/shared/src/gps/partners.ts) and is deliberately NOT a rate '
        + 'driver: a seniority→rate multiplier would be an invented number.',
        'seniority',
      ),
    };
  }

  const jurisdictions = (input.jurisdictions ?? [])
    .map((j) => (typeof j === 'string' ? j.trim() : ''))
    .filter((j) => j !== '' && j.length <= 120);

  const presence = await partnerRegistryPresence(pool);
  if (!presence.registry || !presence.capabilities) {
    return {
      ok: false,
      status: 503,
      refusal: refusal(
        PARTNER_REGISTRY_NOT_MIGRATED.code,
        PARTNER_REGISTRY_NOT_MIGRATED.reason,
        `${PARTNER_REGISTRY_MIGRATION} creates gps_partner_capability.`,
        null,
      ),
    };
  }

  const known = await pool.query(
    'SELECT partner_id FROM gps_partner_registry WHERE partner_id = $1',
    [partnerId],
  );
  if (known.rows.length === 0) {
    return {
      ok: false,
      status: 409,
      refusal: refusal(
        'PARTNER_NOT_ASSERTED',
        `No partner "${partnerId}" has been asserted. Assert them first — with who, when and on what `
        + 'basis — rather than letting a capability create a partner nobody stands behind.',
        RULE_ATTRIBUTION,
        'partnerId',
      ),
    };
  }

  await pool.query(
    `INSERT INTO gps_partner_capability
       (partner_id, offer_key, seniority, jurisdictions, evidence, stated_by, stated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (partner_id, offer_key) DO UPDATE
       SET seniority = EXCLUDED.seniority,
           jurisdictions = EXCLUDED.jurisdictions,
           evidence = EXCLUDED.evidence,
           stated_by = EXCLUDED.stated_by,
           stated_at = EXCLUDED.stated_at,
           updated_at = now()`,
    [
      partnerId, offerKey, seniority, jurisdictions,
      textOrNull(input.evidence), input.statedBy, isoOrNull(input.statedAt),
    ],
  );

  return { ok: true, value: { partnerId, offerKey: offerKey as OfferKey } };
}

export interface EnterRateCardInput {
  partnerId: string;
  offerKey: string;
  unit: string;
  amountCents: number;
  expectedUnits: number | null;
  hoursPerDay: number | null;
  fixedCostCents: number;
  currency: string;
  validUntil: string;
  statedBy: string;
  statedAt: string;
  partnerLabel: string | null;
}

/**
 * WHAT THIS PARTNER CHARGES US FOR ONE OFFER.
 *
 * ── WHY THIS WRITE LIVES HERE AND NOT ONLY IN `routes/gpsInputs.ts` ──────────
 * That route already writes `gps_rate_card`, and it refuses every attempt with
 * `PARTNER_BENCH_EMPTY` because its partner list comes from `PARTNER_BENCH` (an
 * empty compiled array) plus the partners already ON a rate card. Its own refusal
 * tells the operator to insert a row by hand in the SQL editor. This function is the
 * same write with the registry as its source of names, so the first card can be
 * entered by a human at a screen.
 *
 * THAT IS A DUPLICATE WRITER UNTIL SOMEBODY REMOVES ONE, and saying so is the point:
 * `routes/gpsInputs.ts` belongs to another lane, so this file cannot delete its copy.
 * The wiring note on the route names the one-line change — its partner list should
 * read the registry, and its INSERT should call this function.
 *
 * THE VALIDATION IS STRICTER THAN THE SCHEMA, in the same three places
 * `routes/gpsInputs.ts` is, and for the same reasons: `amount_cents >= 0` permits
 * zero, `expected_units` is nullable, and neither CHECK can see the derived cost.
 */
export async function enterRateCard(
  pool: Pool,
  input: EnterRateCardInput,
): Promise<RegistryWrite<{ partnerId: string; offerKey: OfferKey; derivedCostCents: number | null }>> {
  const partnerId = (input.partnerId ?? '').trim();
  const offerKey = (input.offerKey ?? '').trim();
  const unit = (input.unit ?? '').trim();

  if (!OFFER_KEY_SET.has(offerKey)) {
    return { ok: false, status: 400, refusal: refusal('OFFER_KEY_UNKNOWN', `offerKey must be one of: ${OFFER_KEYS.join(', ')}.`, RULE_OFFER_KEYS, 'offerKey') };
  }
  if (!RATE_UNITS.has(unit)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'RATE_UNIT_UNKNOWN',
        'unit must be fixed, day_rate or hourly. `fixed` is the only one that can be quoted against '
        + 'without a second assumption, which is why the other two need a unit count.',
        'RateUnit (packages/shared/src/gps/partners.ts) and 0052_gps_underwriting.sql:70.',
        'unit',
      ),
    };
  }

  const amountCents = input.amountCents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'RATE_NOT_POSITIVE',
        'amountCents must be greater than zero. The column permits 0 and this refuses it: a rate of zero '
        + 'prices the partner as free, and a proposal underwritten against free labour is the most '
        + 'flattering lie this table could tell.',
        RULE_ZERO_IS_A_REFUSAL,
        'amountCents',
      ),
    };
  }

  const fixedCostCents = input.fixedCostCents;
  if (!Number.isFinite(fixedCostCents) || fixedCostCents < 0 || !Number.isInteger(fixedCostCents)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'PASS_THROUGH_NOT_A_COST',
        'fixedCostCents must be a whole number of cents, zero or more. Zero is a legitimate value meaning '
        + '"no pass-through", and it must be STATED rather than left out: on legal-opinion coordination '
        + "the pass-through is counsel's own fee, the largest single line in the floor.",
        RULE_ZERO_IS_A_REFUSAL,
        'fixedCostCents',
      ),
    };
  }

  const currency = (input.currency ?? '').trim().toUpperCase();
  if (!CURRENCY_CODE_RE.test(currency)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal('CURRENCY_NOT_ISO_4217', 'currency must be three letters, e.g. USD. Nothing here converts.', RULE_CURRENCY, 'currency'),
    };
  }

  const expectedUnits = input.expectedUnits;
  if (unit !== 'fixed' && (expectedUnits === null || !Number.isFinite(expectedUnits) || expectedUnits <= 0)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'EXPECTED_UNITS_REQUIRED',
        `A ${unit} card needs expectedUnits — how many days or hours one engagement of this offer buys. `
        + 'Without it the engagement cost cannot be derived, and nothing here will assume 1.',
        RULE_UNITS,
        'expectedUnits',
      ),
    };
  }

  const hoursPerDay = input.hoursPerDay;
  if (unit === 'hourly' && (hoursPerDay === null || !Number.isFinite(hoursPerDay) || hoursPerDay <= 0)) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'HOURS_PER_DAY_REQUIRED',
        'An hourly card needs hoursPerDay, because the effort triple is in DAYS. Assuming 8 would put an '
        + 'invented number into every floor and every margin built on this card.',
        RULE_HOURS_PER_DAY,
        'hoursPerDay',
      ),
    };
  }

  const validUntil = isoOrNull(input.validUntil);
  if (validUntil === null) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'RATE_CARD_VALIDITY_REQUIRED',
        'validUntil is required: the date this partner confirmed the rate to. A rate with no expiry is a '
        + 'rate nobody re-confirmed, and it is treated as unusable rather than valid forever — so a card '
        + 'entered without one could never produce a floor or a margin.',
        RULE_VALIDITY,
        'validUntil',
      ),
    };
  }

  // THE DERIVED COST, THROUGH THE SHARED FUNCTION rather than a comparison written
  // here. A 0.4c/day card with 1 day passes every check above and rounds to nothing.
  const derivedCostCents = rateCardCostCents({
    offerKey: offerKey as OfferKey,
    unit: unit as RateUnit,
    amountCents,
    expectedUnits: unit === 'fixed' ? null : expectedUnits,
    currency,
    validUntil,
    statedBy: input.statedBy,
    statedAt: input.statedAt,
  });
  if (derivedCostCents === null) {
    return {
      ok: false,
      status: 400,
      refusal: refusal(
        'RATE_BELOW_ONE_CENT',
        'This card derives no positive whole-cent cost for one engagement. A rate that rounds to nothing '
        + 'is an unfilled form, not a cheap partner.',
        RULE_ZERO_IS_A_REFUSAL,
        'amountCents',
      ),
    };
  }

  const presence = await partnerRegistryPresence(pool);
  if (!presence.rateCards) {
    return {
      ok: false,
      status: 503,
      refusal: refusal(
        'RATE_CARD_REGISTER_ABSENT',
        'There is nowhere to record a partner rate card on this environment: no gps_rate_card relation '
        + 'exists. Apply 0052_gps_underwriting.sql.',
        '0052_gps_underwriting.sql:51 creates gps_rate_card; nothing applies migrations on deploy.',
        null,
      ),
    };
  }
  if (!presence.registry) {
    return {
      ok: false,
      status: 503,
      refusal: refusal(
        PARTNER_REGISTRY_NOT_MIGRATED.code,
        PARTNER_REGISTRY_NOT_MIGRATED.reason,
        `${PARTNER_REGISTRY_MIGRATION} creates gps_partner_registry.`,
        null,
      ),
    };
  }

  const known = await pool.query(
    'SELECT partner_name FROM gps_partner_registry WHERE partner_id = $1',
    [partnerId],
  );
  if (known.rows.length === 0) {
    return {
      ok: false,
      status: 409,
      refusal: refusal(
        'PARTNER_NOT_ASSERTED',
        `No partner "${partnerId}" has been asserted, so there is nobody for this rate to belong to. A card `
        + 'that creates its own partner is how a typo becomes a second partner and a margin gets attributed '
        + 'to nobody. Assert the partner first.',
        RULE_ATTRIBUTION,
        'partnerId',
      ),
    };
  }

  // The label is the registry's name, NEVER a caller-supplied string: two names for
  // one partner_id is how a rate gets attributed to the wrong person on a screen.
  const partnerLabel = textOrNull(known.rows[0]?.partner_name) ?? partnerId;

  await pool.query(
    `INSERT INTO gps_rate_card
       (partner_id, offer_key, unit, amount_cents, expected_units, hours_per_day,
        fixed_cost_cents, currency, valid_until, stated_by, stated_at, partner_label, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (partner_id, offer_key) DO UPDATE
       SET unit = EXCLUDED.unit,
           amount_cents = EXCLUDED.amount_cents,
           expected_units = EXCLUDED.expected_units,
           hours_per_day = EXCLUDED.hours_per_day,
           fixed_cost_cents = EXCLUDED.fixed_cost_cents,
           currency = EXCLUDED.currency,
           valid_until = EXCLUDED.valid_until,
           stated_by = EXCLUDED.stated_by,
           stated_at = EXCLUDED.stated_at,
           partner_label = EXCLUDED.partner_label,
           updated_at = now()`,
    [
      partnerId, offerKey, unit, amountCents,
      unit === 'fixed' ? null : expectedUnits,
      unit === 'hourly' ? hoursPerDay : null,
      fixedCostCents, currency, validUntil, input.statedBy, isoOrNull(input.statedAt), partnerLabel,
    ],
  );

  return { ok: true, value: { partnerId, offerKey: offerKey as OfferKey, derivedCostCents } };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FLOOR — loaded here, computed there                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface FloorRequest {
  partnerId: string;
  offerKey: OfferKey;
  effortPoint: FloorEffortPoint;
  currency: string;
  /** ONE clock read per request, upstream, so every figure shares one instant. */
  asOf: string;
}

export interface FloorAnswer {
  outcome: PriceFloorOutcome;
  /** What the request could see, so a surface can distinguish absent from unmigrated. */
  presence: PartnerRegistryPresence;
  migration: string;
}

/**
 * LOAD THE THREE INPUTS AND HAND THEM TO THE PURE FUNCTION.
 *
 * Everything absent is expressed as the STATE it is absent in — a missing relation
 * is `not_loaded` and names the migration; a missing row is `empty` and names the
 * conversation. `priceFloor` turns each into its own refusal code, so the desk is
 * told "apply 0052" or "ask the partner", never a single "no floor available".
 */
export async function floorFor(pool: Pool, req: FloorRequest): Promise<FloorAnswer> {
  const presence = await partnerRegistryPresence(pool);
  const environment = environmentLabel(process.env.DATABASE_URL);

  // The partner. A registry that does not exist yields a partner that cannot be
  // asserted, and `priceFloor` refuses on the attribution rather than on a null.
  let partner: Partner = {
    id: req.partnerId,
    name: req.partnerId,
    assertion: { assertedBy: '', assertedAt: '', basis: '' },
    active: true,
    capabilities: [],
    rateCards: [],
    capacity: { maxConcurrent: 0, statedBy: 'not stated', statedAt: '', unavailableUntil: null },
    notes: null,
  };
  if (presence.registry) {
    const bench = await loadBench(pool);
    if (bench.state === 'loaded') {
      const found = bench.value.find((m) => m.partner.id === req.partnerId);
      if (found) partner = found.partner;
    }
  }

  // The rate card.
  let card: SuppliedInput<RateCard> = inputNotLoaded(
    `No rate card registry exists on this environment: migration 0052_gps_underwriting.sql (table `
    + 'gps_rate_card) has not been applied.',
  );
  let passThrough: SuppliedInput<number> = inputNotLoaded('gps_rate_card was not read: the relation does not exist.');
  let hoursPerDay: SuppliedInput<number> = inputNotLoaded('gps_rate_card was not read: the relation does not exist.');
  if (presence.rateCards) {
    const rows = (await pool.query(
      `SELECT offer_key, unit, amount_cents, expected_units, hours_per_day, fixed_cost_cents,
              currency, valid_until, stated_by, stated_at
         FROM gps_rate_card WHERE partner_id = $1 AND offer_key = $2`,
      [req.partnerId, req.offerKey],
    )).rows as Array<Record<string, unknown>>;
    const row = rows[0];
    if (row === undefined) {
      const note = `The rate card registry exists and holds no row for (${req.partnerId}, ${req.offerKey}).`;
      card = inputEmpty(note);
      passThrough = inputEmpty(note);
      hoursPerDay = inputEmpty(note);
    } else {
      const parsed = rowToRateCard(row);
      card = parsed === null
        ? inputEmpty(`The row for (${req.partnerId}, ${req.offerKey}) could not be read as a rate card.`)
        : inputLoaded(parsed);
      const fixedCost = numOrNull(row.fixed_cost_cents);
      passThrough = fixedCost === null
        ? inputEmpty('fixed_cost_cents is null on the row, which the schema forbids — it is not read as 0.')
        : inputLoaded(fixedCost);
      const hpd = numOrNull(row.hours_per_day);
      hoursPerDay = hpd === null
        ? inputEmpty('hours_per_day is null on the row.')
        : inputLoaded(hpd);
    }
  }

  // The effort triple. NOTE what is NOT here: no fallback to
  // `placeholderEffortTriple`. `underwrite.ts` falls back and labels the result a
  // placeholder, which is right for a distribution and wrong for a floor — a floor
  // is quoted as a line nobody may cross.
  let effort: SuppliedInput<FloorEffortInput> = inputNotLoaded(
    'No effort register exists on this environment: migration 0052_gps_underwriting.sql (table '
    + 'gps_effort_triple) has not been applied.',
  );
  if (presence.effortTriples) {
    const rows = (await pool.query(
      `SELECT offer_key, optimistic_days, likely_days, pessimistic_days, stated_by, stated_at
         FROM gps_effort_triple WHERE offer_key = $1`,
      [req.offerKey],
    )).rows as Array<Record<string, unknown>>;
    const row = rows[0];
    if (row === undefined) {
      effort = inputEmpty(`No effort triple is on record for ${req.offerKey}.`);
    } else {
      const o = numOrNull(row.optimistic_days);
      const l = numOrNull(row.likely_days);
      const p = numOrNull(row.pessimistic_days);
      effort = (o === null || l === null || p === null)
        ? inputEmpty(`The effort triple row for ${req.offerKey} has a day count that could not be read.`)
        : inputLoaded({
          offerKey: req.offerKey,
          optimisticDays: o,
          likelyDays: l,
          pessimisticDays: p,
          statedBy: textOrNull(row.stated_by) ?? 'unknown',
          statedAt: isoOrNull(row.stated_at) ?? '1970-01-01T00:00:00.000Z',
          // A ROW IS A HUMAN'S FIGURE BY CONSTRUCTION. The shipped placeholder is
          // never written to this table — `underwrite.ts` substitutes it in memory —
          // so a row here is somebody's answer and `isPlaceholder` is false.
          isPlaceholder: false,
        });
    }
  }

  return {
    outcome: priceFloor({
      offerKey: req.offerKey,
      partner,
      card,
      hoursPerDay,
      passThroughCents: passThrough,
      effort,
      effortPoint: req.effortPoint,
      quoteCurrency: req.currency,
      asOf: req.asOf,
      environment,
    }),
    presence,
    migration: PARTNER_REGISTRY_MIGRATION,
  };
}
