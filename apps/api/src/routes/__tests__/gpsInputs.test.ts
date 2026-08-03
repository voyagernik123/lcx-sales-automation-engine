import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
/*
 * THE CONTRACT BY PACKAGE NAME, not by relative path any more.
 *
 * These five used to be imported from `../../../../../packages/shared/src/gps/contracts/inputs.js`
 * — legal in a test file, which the api tsconfig excludes from the emit build, and the only
 * way to reach them while `gps/index.ts` re-exported nothing. That barrel line has landed,
 * so the specifier is the same one the ROUTE uses. It matters for this file in particular:
 * a test that reached the contract by a path production code cannot use was a test that
 * could pass while the route's own import was broken.
 */
import {
  CURRENCY_CODE_RE,
  GPS_INPUT_REFUSAL_CODES,
  OFFER_KEYS,
  deskContractDefects,
  isGpsInputRefusalCode,
  refusalBodyDefects,
} from '@lcx/shared';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GPS INPUT DESK, AT THE ROUTE BOUNDARY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THE CONTRACT IS CHECKED AT RUNTIME AND NOT BY THE COMPILER.
 * `apps/web/src/lib/api/gps.ts:60` is the post-mortem: a hand-written `GpsSummary`
 * claiming `counts` / `clientCount` / `openValueCents` that the API has never sent.
 * `tsc` believed the copy; the page test mocked the boundary and asserted the page
 * against the same invented contract the page was written against; the two wrongs
 * agreed and production crashed. A response interface is a CLAIM about a runtime
 * payload, and the compiler cannot check a claim.
 *
 * So `deskContractDefects` — declared once, in
 * `packages/shared/src/gps/contracts/inputs.ts` — is run here over a SERIALISED HTTP
 * response, and in `apps/web/src/pages/__tests__/gpsInputs.test.tsx` over the fixture
 * the page renders. Neither side describes the shape; both are measured against one
 * executable predicate.
 *
 * WHAT THE FAKE POOL IS FOR. A small in-memory stand-in over the eight statements
 * this route issues. It THROWS on any SQL it does not recognise, so an unexpected —
 * or an interpolated — query fails loudly here rather than in production, and it
 * records every (sql, params) pair so parameterisation is asserted rather than
 * assumed.
 *
 * WHAT THESE DO NOT PROVE. Nothing here runs against Postgres. `gps_rate_card` and
 * `gps_effort_triple` exist on production; `gps_price_band` DOES NOT EXIST ANYWHERE —
 * its CHECK constraints, primary key and RLS posture are described by
 * `PRICE_BAND_REGISTER_DDL` and cannot be verified until a human applies it. The
 * refusal that says so is what is tested.
 */

const OFFER = 'mica_whitepaper';

interface BandRow {
  offer_key: string;
  low_cents: string;
  mid_cents: string;
  high_cents: string;
  currency: string;
  stated_by: string;
  stated_at: string;
}

interface TripleRow {
  offer_key: string;
  /** STRINGS on purpose: node-postgres hands `numeric` and `bigint` back as text. */
  optimistic_days: string;
  likely_days: string;
  pessimistic_days: string;
  stated_by: string;
  stated_at: string;
}

interface CardRow {
  partner_id: string;
  offer_key: string;
  unit: string;
  amount_cents: string;
  expected_units: string | null;
  hours_per_day: string | null;
  fixed_cost_cents: string;
  currency: string;
  valid_until: string | null;
  stated_by: string;
  stated_at: string;
  partner_label: string | null;
}

const bands = new Map<string, BandRow>();
const triples = new Map<string, TripleRow>();
const cards = new Map<string, CardRow>();

let bandTable = false;
let tripleTable = true;
let cardTable = true;

const calls: Array<{ sql: string; params: readonly unknown[] }> = [];

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });

  if (/to_regclass/.test(sql)) {
    return { rows: [{ price_bands: bandTable, effort_triples: tripleTable, rate_cards: cardTable }] };
  }

  if (/INSERT INTO gps_price_band/.test(sql)) {
    if (!bandTable) throw new Error('relation "gps_price_band" does not exist');
    const [offer, low, mid, high, currency, statedBy] = params as [string, number, number, number, string, string];
    bands.set(offer, {
      offer_key: offer,
      low_cents: String(low),
      mid_cents: String(mid),
      high_cents: String(high),
      currency,
      stated_by: statedBy,
      stated_at: '2026-08-03T00:00:00.000Z',
    });
    return { rows: [] };
  }

  if (/INSERT INTO gps_effort_triple/.test(sql)) {
    if (!tripleTable) throw new Error('relation "gps_effort_triple" does not exist');
    const [offer, o, l, p, statedBy] = params as [string, number, number, number, string];
    triples.set(offer, {
      offer_key: offer,
      optimistic_days: String(o),
      likely_days: String(l),
      pessimistic_days: String(p),
      stated_by: statedBy,
      stated_at: '2026-08-03T00:00:00.000Z',
    });
    return { rows: [] };
  }

  if (/INSERT INTO gps_rate_card/.test(sql)) {
    if (!cardTable) throw new Error('relation "gps_rate_card" does not exist');
    const [partnerId, offer, unit, amount, units, hpd, fixedCost, currency, validUntil, statedBy, label] =
      params as [string, string, string, number, number | null, number | null, number, string, string, string, string | null];
    cards.set(`${partnerId}|${offer}`, {
      partner_id: partnerId,
      offer_key: offer,
      unit,
      amount_cents: String(amount),
      expected_units: units === null ? null : String(units),
      hours_per_day: hpd === null ? null : String(hpd),
      fixed_cost_cents: String(fixedCost),
      currency,
      valid_until: validUntil,
      stated_by: statedBy,
      stated_at: '2026-08-03T00:00:00.000Z',
      partner_label: label,
    });
    return { rows: [] };
  }

  if (/SELECT DISTINCT partner_id/.test(sql)) {
    if (!cardTable) throw new Error('relation "gps_rate_card" does not exist');
    const seen = new Map<string, CardRow>();
    for (const c of cards.values()) if (!seen.has(c.partner_id)) seen.set(c.partner_id, c);
    return { rows: [...seen.values()].map((c) => ({ partner_id: c.partner_id, partner_label: c.partner_label })) };
  }

  if (/FROM gps_price_band/.test(sql)) {
    if (!bandTable) throw new Error('relation "gps_price_band" does not exist');
    return { rows: [...bands.values()] };
  }

  if (/FROM gps_effort_triple/.test(sql)) {
    if (!tripleTable) throw new Error('relation "gps_effort_triple" does not exist');
    return { rows: [...triples.values()] };
  }

  if (/FROM gps_rate_card/.test(sql)) {
    if (!cardTable) throw new Error('relation "gps_rate_card" does not exist');
    return { rows: [...cards.values()] };
  }

  throw new Error(`fake pool: unexpected SQL — ${sql.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  getDb: () => { throw new Error('getDb is not used by the GPS input desk'); },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { gpsInputsRoutes, _resetGpsInputProbes, PRICE_BAND_REGISTER_DDL } =
  await import('../gpsInputs.js');

/**
 * The operator is pre-set, so `requireOperator` returns early
 * (`middleware/auth.ts:146`) and the REAL middleware runs rather than a stub.
 */
const app = new Hono();
app.use('*', async (c, next) => {
  c.set('operator', { id: 'nik', role: 'approver', authMethod: 'email' });
  await next();
});
app.route('/inputs', gpsInputsRoutes);

/** No operator, no pre-set: what an unauthenticated caller actually gets. */
const anonApp = new Hono();
anonApp.route('/inputs', gpsInputsRoutes);

beforeEach(() => {
  bands.clear();
  triples.clear();
  cards.clear();
  calls.length = 0;
  query.mockClear();
  bandTable = false;
  tripleTable = true;
  cardTable = true;
  _resetGpsInputProbes();
});

type Json = Record<string, any>;

/** Hono mounts a sub-router's `'/'` at the base path WITHOUT a trailing slash. */
async function get(): Promise<{ status: number; body: Json }> {
  const res = await app.request('/inputs');
  return { status: res.status, body: (await res.json()) as Json };
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Json }> {
  const res = await app.request(`/inputs${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

const band = (over: Json = {}): Json =>
  ({ offerKey: OFFER, lowCents: 1_200_000, midCents: 1_800_000, highCents: 2_500_000, currency: 'USD', ...over });

const triple = (over: Json = {}): Json =>
  ({ offerKey: OFFER, optimisticDays: 4, likelyDays: 6, pessimisticDays: 10, ...over });

const card = (over: Json = {}): Json => ({
  offerKey: OFFER,
  partnerId: 'counsel-one',
  partnerLabel: 'Counsel One',
  unit: 'day_rate',
  amountCents: 200_000,
  expectedUnits: 6,
  fixedCostCents: 0,
  currency: 'USD',
  validUntil: '2027-01-01',
  ...over,
});

/** Put one partner on the bench THE ONLY WAY THIS SYSTEM ALLOWS: a row on file. */
function seedPartner(): void {
  cards.set(`counsel-one|diagnostic`, {
    partner_id: 'counsel-one',
    offer_key: 'diagnostic',
    unit: 'fixed',
    amount_cents: '40000',
    expected_units: null,
    hours_per_day: null,
    fixed_cost_cents: '0',
    currency: 'USD',
    valid_until: '2027-01-01T00:00:00.000Z',
    stated_by: 'nik',
    stated_at: '2026-07-01T00:00:00.000Z',
    partner_label: 'Counsel One',
  });
}

/* ═══════════════════════ the contract ════════════════════════════════════ */

describe('the payload IS the shared contract, measured not described', () => {
  it('emits a desk with no contract defects, over serialised JSON', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(deskContractDefects(body.data)).toEqual([]);
  });

  it('still conforms when every register is absent — the empty case is the shipped case', async () => {
    bandTable = false;
    tripleTable = false;
    cardTable = false;
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(deskContractDefects(body.data)).toEqual([]);
    expect(body.data.registers).toEqual({ priceBands: false, effortTriples: false, rateCards: false });
  });

  it('invents no refusal code the contract does not publish', async () => {
    const bad = [
      post('/price-bands', band({ lowCents: 0 })),
      post('/price-bands', band({ lowCents: 9_000_000 })),
      post('/price-bands', band({ currency: 'DOLLARS' })),
      post('/price-bands', band({ offerKey: 'not_an_offer' })),
      post('/price-bands', band({ midCents: 1.5 })),
      post('/effort-triples', triple({ optimisticDays: -1 })),
      post('/effort-triples', triple({ likelyDays: 99 })),
      post('/rate-cards', card({ amountCents: 0 })),
      post('/rate-cards', card({ unit: 'monthly' })),
      post('/rate-cards', card({ validUntil: '' })),
      post('/rate-cards', card({ validUntil: 'whenever' })),
      post('/rate-cards', card({ expectedUnits: null })),
      post('/rate-cards', card({ unit: 'hourly', hoursPerDay: null })),
      post('/rate-cards', card()),
    ];
    for (const r of await Promise.all(bad)) {
      expect(r.status, JSON.stringify(r.body)).not.toBe(200);
      expect(
        isGpsInputRefusalCode(r.body.code),
        `${String(r.body.code)} is not in GPS_INPUT_REFUSAL_CODES — a surface cannot branch on it`,
      ).toBe(true);
      expect(refusalBodyDefects(r.body)).toEqual([]);
    }
  });

  it('holds ONE definition of the closed currency pattern, imported and not copied', () => {
    /*
     * THIS ASSERTION CHANGED SHAPE WHEN THE BARREL LINE LANDED, and the new shape is
     * stronger. It used to compare two `.source` strings, because the route could not
     * import `CURRENCY_CODE_RE` (TS6059 out of `apps/api/src` on the emit build) and held
     * its own literal. `gps/index.ts` now re-exports `contracts/inputs.ts`, so the copy is
     * gone — and a drift assertion over a copy that no longer exists would pass forever
     * while saying nothing.
     *
     * So it reads the SOURCE for a second literal instead. A regex literal in this file is
     * a re-declaration of the rule, which is the state this test exists to prevent; the
     * import is what it requires. Add a local pattern and this goes red.
     */
    const src = readFileSync(resolve(HERE, '..', 'gpsInputs.ts'), 'utf8');
    expect(src, 'gpsInputs.ts must import the currency rule, not restate it')
      .toMatch(/import \{[\s\S]*?\bCURRENCY_CODE_RE\b[\s\S]*?\} from '@lcx\/shared'/);
    expect(
      [...src.matchAll(/\/\^\[A-Za-z\]\{3\}\$\//g)].length,
      'a second currency literal has appeared in gpsInputs.ts; the rule has one definition '
      + 'and it is CURRENCY_CODE_RE in packages/shared/src/gps/contracts/inputs.ts',
    ).toBe(0);
    // And the imported rule still means what the refusal says it means.
    expect(CURRENCY_CODE_RE.test('usd')).toBe(true);
    expect(CURRENCY_CODE_RE.test('USDT')).toBe(false);
  });

  /**
   * EVERY PUBLISHED CODE IS REACHABLE, AND NO REACHED CODE IS UNPUBLISHED.
   *
   * Both halves matter. A code in the contract that no request can produce is a
   * branch a surface writes and never exercises; a code the route emits that the
   * contract does not publish is the `GpsSummary` failure wearing a different hat.
   */
  it('reaches all 20 published codes, and no others', async () => {
    const observed = new Set<string>();
    const drive: Array<{ path: string; body: unknown; setup?: () => void }> = [
      { path: '/price-bands', body: [1, 2, 3] },
      { path: '/price-bands', body: band({ offerKey: 'listing_support' }) },
      { path: '/price-bands', body: band(), setup: () => { bandTable = false; } },
      { path: '/effort-triples', body: triple(), setup: () => { tripleTable = false; } },
      { path: '/rate-cards', body: card(), setup: () => { cardTable = false; } },
      { path: '/rate-cards', body: card(), setup: () => { cards.clear(); } },
      { path: '/rate-cards', body: card({ partnerId: 'nobody' }), setup: seedPartner },
      { path: '/price-bands', body: band({ lowCents: 0 }) },
      { path: '/price-bands', body: band({ lowCents: 2_600_000 }) },
      { path: '/price-bands', body: band({ midCents: 1.5 }) },
      { path: '/effort-triples', body: triple({ optimisticDays: -1 }) },
      { path: '/effort-triples', body: triple({ optimisticDays: 9 }) },
      { path: '/rate-cards', body: card({ amountCents: 0 }) },
      { path: '/rate-cards', body: card({ amountCents: 1, expectedUnits: 0.4 }) },
      { path: '/price-bands', body: band({ currency: 'USDT' }) },
      { path: '/rate-cards', body: card({ unit: 'monthly' }) },
      { path: '/rate-cards', body: card({ validUntil: '' }) },
      { path: '/rate-cards', body: card({ validUntil: 'soon' }) },
      { path: '/rate-cards', body: card({ expectedUnits: null }) },
      { path: '/rate-cards', body: card({ unit: 'hourly', expectedUnits: 40, hoursPerDay: 0 }) },
    ];

    for (const step of drive) {
      bandTable = true;
      tripleTable = true;
      cardTable = true;
      cards.clear();
      step.setup?.();
      _resetGpsInputProbes();
      const res = await app.request(`/inputs${step.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(step.body),
      });
      const body = (await res.json()) as Json;
      expect(res.status, `${step.path} ${JSON.stringify(step.body).slice(0, 80)} was accepted`).not.toBe(200);
      observed.add(String(body.code));
    }

    expect([...observed].sort()).toEqual([...GPS_INPUT_REFUSAL_CODES].sort());
  });
});

/* ═══════════ the distinction that is the whole point of the screen ══════════ */

describe('a placeholder band and an entered band do not render identically', () => {
  it('badges all five offers as compiled placeholders when nothing is on record', async () => {
    const { body } = await get();
    expect(body.data.priceBands).toHaveLength(OFFER_KEYS.length);
    for (const row of body.data.priceBands) {
      expect(row.source).toBe('compiled_placeholder');
      expect(row.midIsDerived).toBe(true);
      expect(row.statedBy).toBeNull();
      expect(String(row.placeholderNotice)).toContain('PLACEHOLDER, NOT A PRICE');
    }
    expect(body.data.counts.offersOnPlaceholderBand).toBe(OFFER_KEYS.length);
  });

  it('flips one offer to `entered`, with a stated mid and NO placeholder notice', async () => {
    bandTable = true;
    const written = await post('/price-bands', band());
    expect(written.status).toBe(200);

    const row = written.body.data.priceBands.find((b: Json) => b.offerKey === OFFER);
    expect(row.source).toBe('entered');
    // A stated mid is a decision. Only the compiled band derives it from min/max.
    expect(row.midIsDerived).toBe(false);
    expect(row.placeholderNotice).toBeNull();
    expect(row.midCents).toBe(1_800_000);
    expect(row.statedBy).toBe('nik');
    expect(written.body.data.counts.offersOnPlaceholderBand).toBe(OFFER_KEYS.length - 1);

    // …and the other four are untouched placeholders. A screen that flipped the flag
    // globally would hide four invented prices behind one real one.
    for (const other of written.body.data.priceBands.filter((b: Json) => b.offerKey !== OFFER)) {
      expect(other.source).toBe('compiled_placeholder');
    }
  });
});

describe('an effort triple is a prior until a human states one', () => {
  it('labels every offer `prior` with the reason, when nothing is on record', async () => {
    const { body } = await get();
    for (const row of body.data.effortTriples) {
      expect(row.basis).toBe('prior');
      expect(String(row.priorNotice)).toContain('PRIOR, NOT MEASURED');
    }
    expect(body.data.counts.offersOnPriorEffort).toBe(OFFER_KEYS.length);
  });

  it('moves one offer to `measured` on a write, and drops its notice', async () => {
    const written = await post('/effort-triples', triple());
    expect(written.status).toBe(200);
    const row = written.body.data.effortTriples.find((t: Json) => t.offerKey === OFFER);
    expect(row.basis).toBe('measured');
    expect(row.priorNotice).toBeNull();
    expect(row.likelyDays).toBe(6);
    expect(written.body.data.counts.offersOnPriorEffort).toBe(OFFER_KEYS.length - 1);
  });
});

/* ═══════════════════════ refusals, not warnings ═══════════════════════════ */

describe('validation is a refusal, and it cites the rule', () => {
  const cases: Array<{ what: string; path: string; body: Json; code: string; status: number }> = [
    { what: 'a zero rate', path: '/rate-cards', body: card({ amountCents: 0 }), code: 'RATE_NOT_POSITIVE', status: 400 },
    { what: 'a negative rate', path: '/rate-cards', body: card({ amountCents: -1 }), code: 'RATE_NOT_POSITIVE', status: 400 },
    { what: 'a fractional cent', path: '/rate-cards', body: card({ amountCents: 1.5 }), code: 'AMOUNT_NOT_INTEGER_CENTS', status: 400 },
    { what: 'a sub-cent engagement cost', path: '/rate-cards', body: card({ amountCents: 1, expectedUnits: 0.4 }), code: 'RATE_BELOW_ONE_CENT', status: 400 },
    { what: 'an unknown unit', path: '/rate-cards', body: card({ unit: 'monthly' }), code: 'RATE_UNIT_UNKNOWN', status: 400 },
    { what: 'a metered card with no units', path: '/rate-cards', body: card({ expectedUnits: null }), code: 'UNITS_NOT_STATED', status: 400 },
    { what: 'an hourly card with no hours per day', path: '/rate-cards', body: card({ unit: 'hourly', expectedUnits: 40, hoursPerDay: 0 }), code: 'HOURS_PER_DAY_NOT_STATED', status: 400 },
    { what: 'no validity', path: '/rate-cards', body: card({ validUntil: '' }), code: 'VALIDITY_NOT_STATED', status: 400 },
    { what: 'an unparseable validity', path: '/rate-cards', body: card({ validUntil: 'when we get round to it' }), code: 'VALIDITY_NOT_A_DATE', status: 400 },
    { what: 'a zero band floor', path: '/price-bands', body: band({ lowCents: 0 }), code: 'BAND_NOT_POSITIVE', status: 400 },
    { what: 'a negative band floor', path: '/price-bands', body: band({ lowCents: -100 }), code: 'BAND_NOT_POSITIVE', status: 400 },
    { what: 'a descending band', path: '/price-bands', body: band({ lowCents: 2_600_000 }), code: 'BAND_NOT_ASCENDING', status: 400 },
    { what: 'a transposed triple', path: '/effort-triples', body: triple({ optimisticDays: 9 }), code: 'EFFORT_NOT_ASCENDING', status: 400 },
    { what: 'negative days', path: '/effort-triples', body: triple({ optimisticDays: -1 }), code: 'EFFORT_NEGATIVE', status: 400 },
    { what: 'an unknown offer', path: '/effort-triples', body: triple({ offerKey: 'listing_support' }), code: 'OFFER_KEY_UNKNOWN', status: 400 },
    { what: 'a four-letter currency', path: '/price-bands', body: band({ currency: 'USDT' }), code: 'CURRENCY_NOT_ISO_4217', status: 400 },
    { what: 'a document-sized currency', path: '/price-bands', body: band({ currency: 'A'.repeat(112_000) }), code: 'CURRENCY_NOT_ISO_4217', status: 400 },
  ];

  for (const t of cases) {
    it(`refuses ${t.what} with ${t.code} and a citable rule`, async () => {
      bandTable = true;
      seedPartner();
      const r = await post(t.path, t.body);
      expect(r.status).toBe(t.status);
      expect(r.body.code).toBe(t.code);
      expect(String(r.body.data.rule).trim().length, 'a refusal must cite its rule').toBeGreaterThan(20);
      expect(refusalBodyDefects(r.body)).toEqual([]);
      // Nothing was written. A refusal that persists is a warning.
      expect(calls.filter((c) => /INSERT INTO/.test(c.sql))).toHaveLength(0);
    });
  }

  it('refuses a body that is not an object', async () => {
    const res = await app.request('/inputs/price-bands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[1,2,3]',
    });
    expect(res.status).toBe(400);
    expect((await res.json() as Json).code).toBe('BODY_NOT_AN_OBJECT');
  });

  it('validates BEFORE it probes, so a typo does not send the desk to the database', async () => {
    bandTable = false;
    tripleTable = false;
    cardTable = false;
    const r = await post('/price-bands', band({ lowCents: 0 }));
    // The refusal names the FIELD, not the migration: the request is wrong in every
    // environment, and answering "awaiting migration" would misdirect the operator.
    expect(r.body.code).toBe('BAND_NOT_POSITIVE');
    expect(query).not.toHaveBeenCalled();
  });
});

/* ═══════════════════ absent registers, and an empty bench ═════════════════ */

describe('an absent register refuses and says it is empty', () => {
  it('answers 503 with the DDL when there is nowhere to put a price band', async () => {
    bandTable = false;
    const r = await post('/price-bands', band());
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('PRICE_BAND_REGISTER_ABSENT');
    expect(r.body.meta.priceBandRegisterDdl).toContain('CREATE TABLE IF NOT EXISTS gps_price_band');
    expect(r.body.meta.priceBandRegisterDdl).toBe(PRICE_BAND_REGISTER_DDL);
    expect(r.body.meta.migrated).toBe(false);
  });

  it('ships DDL that is idempotent, forward-only and destroys nothing', () => {
    expect(PRICE_BAND_REGISTER_DDL).toContain('CREATE TABLE IF NOT EXISTS');
    expect(PRICE_BAND_REGISTER_DDL).toContain('ENABLE ROW LEVEL SECURITY');
    expect(PRICE_BAND_REGISTER_DDL).toContain('gps_price_band_ascending');
    for (const forbidden of ['DROP ', 'DELETE ', 'TRUNCATE ', 'ALTER COLUMN']) {
      expect(PRICE_BAND_REGISTER_DDL, `${forbidden}is destructive and a human pastes this by hand`)
        .not.toContain(forbidden);
    }
  });

  it('answers 503 when there is nowhere to put an effort triple', async () => {
    tripleTable = false;
    const r = await post('/effort-triples', triple());
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('EFFORT_REGISTER_ABSENT');
  });

  it('answers 503 when there is nowhere to put a rate card', async () => {
    cardTable = false;
    const r = await post('/rate-cards', card());
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('RATE_CARD_REGISTER_ABSENT');
  });

  it('puts the register refusals on the desk read as data, at 200', async () => {
    bandTable = false;
    tripleTable = false;
    cardTable = false;
    const { status, body } = await get();
    expect(status).toBe(200);
    const codes = body.data.refusals.map((r: Json) => r.code);
    expect(codes).toContain('PRICE_BAND_REGISTER_ABSENT');
    expect(codes).toContain('EFFORT_REGISTER_ABSENT');
    expect(codes).toContain('RATE_CARD_REGISTER_ABSENT');
    for (const r of body.data.refusals) expect(String(r.rule).length).toBeGreaterThan(20);
  });
});

describe('no partner name is invented', () => {
  it('offers no partner at all, and refuses the write, while the bench is empty', async () => {
    const { body } = await get();
    expect(body.data.partnerOptions).toEqual([]);
    const codes = body.data.refusals.map((r: Json) => r.code);
    expect(codes).toContain('PARTNER_BENCH_EMPTY');

    const r = await post('/rate-cards', card());
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PARTNER_BENCH_EMPTY');
    // It names BOTH places a human can put the first name, and neither is here.
    expect(r.body.error).toContain('PARTNER_BENCH');
    expect(r.body.error).toContain('gps_rate_card');
    expect(calls.filter((c) => /INSERT INTO/.test(c.sql))).toHaveLength(0);
  });

  it('accepts a card for a partner already on file, and refuses one that is not', async () => {
    seedPartner();

    const known = await post('/rate-cards', card());
    expect(known.status, JSON.stringify(known.body)).toBe(200);
    const row = known.body.data.rateCards.find((r: Json) => r.offerKey === OFFER);
    expect(row.partnerId).toBe('counsel-one');
    expect(row.status).toBe('usable');
    // 6 days at $2,000 = $12,000, derived by rateCardCostCents and not by this test's
    // arithmetic being copied into the route.
    expect(row.engagementCostCents).toBe(1_200_000);

    const unknown = await post('/rate-cards', card({ partnerId: 'a-firm-nobody-named' }));
    expect(unknown.status).toBe(409);
    expect(unknown.body.code).toBe('PARTNER_NOT_ON_BENCH');
    expect(unknown.body.error).toContain('counsel-one');
  });

  it('lists a partner on file as an option, with where the name came from', async () => {
    seedPartner();
    const { body } = await get();
    expect(body.data.partnerOptions).toEqual([
      { partnerId: 'counsel-one', label: 'Counsel One', origin: 'rate_card_on_file' },
    ]);
    expect(body.data.refusals.map((r: Json) => r.code)).not.toContain('PARTNER_BENCH_EMPTY');
  });
});

/* ══════════════════ reading a card that should never have existed ══════════ */

describe('a card on file that cannot be costed reports null, never zero', () => {
  it('returns null engagementCostCents for a zero card written before this route existed', async () => {
    seedPartner();
    cards.set('counsel-one|gtm_sprint', {
      partner_id: 'counsel-one',
      offer_key: 'gtm_sprint',
      unit: 'day_rate',
      // 0052:75 permits amount_cents >= 0, so this row is legal in the schema.
      amount_cents: '0',
      expected_units: '5',
      hours_per_day: null,
      fixed_cost_cents: '0',
      currency: 'USD',
      valid_until: '2027-01-01T00:00:00.000Z',
      stated_by: 'nik',
      stated_at: '2026-07-01T00:00:00.000Z',
      partner_label: 'Counsel One',
    });
    const { body } = await get();
    const row = body.data.rateCards.find((r: Json) => r.offerKey === 'gtm_sprint');
    expect(row.amountCents).toBe(0);
    // NOT 0, and not a 100%-margin free partner.
    expect(row.engagementCostCents).toBeNull();
  });

  it('reports a card with no stated validity as unusable rather than eternal', async () => {
    cards.set('counsel-one|diagnostic', {
      partner_id: 'counsel-one',
      offer_key: 'diagnostic',
      unit: 'fixed',
      amount_cents: '40000',
      expected_units: null,
      hours_per_day: null,
      fixed_cost_cents: '0',
      currency: 'USD',
      valid_until: null,
      stated_by: 'nik',
      stated_at: '2026-07-01T00:00:00.000Z',
      partner_label: null,
    });
    const { body } = await get();
    const row = body.data.rateCards[0];
    expect(row.status).toBe('no_validity_stated');
    expect(row.validUntil).toBeNull();
  });
});

/* ═════════════════════════ the boring guarantees ══════════════════════════ */

describe('the mechanics', () => {
  it('parameterises every statement — no value is ever interpolated', async () => {
    bandTable = true;
    seedPartner();
    await post('/price-bands', band());
    await post('/effort-triples', triple());
    await post('/rate-cards', card());
    const writes = calls.filter((c) => /INSERT INTO/.test(c.sql));
    expect(writes.length).toBe(3);
    for (const w of writes) {
      expect(w.params.length).toBeGreaterThan(0);
      expect(w.sql, 'a value reached the SQL text').not.toContain('1800000');
      expect(w.sql).not.toContain('counsel-one');
      expect(w.sql).toContain('$1');
    }
  });

  it('takes stated_by from the session and never from the body', async () => {
    await post('/effort-triples', triple({ statedBy: 'someone-else' }));
    const write = calls.find((c) => /INSERT INTO gps_effort_triple/.test(c.sql))!;
    expect(write.params).toContain('nik');
    expect(write.params).not.toContain('someone-else');
  });

  it('refuses an unauthenticated caller on every path', async () => {
    for (const [method, path] of [
      ['GET', '/inputs'],
      ['POST', '/inputs/price-bands'],
      ['POST', '/inputs/effort-triples'],
      ['POST', '/inputs/rate-cards'],
    ] as const) {
      const res = await anonApp.request(path, {
        method,
        ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('declares only path literals that name no document-shaped resource', () => {
    for (const r of gpsInputsRoutes.routes) {
      expect(r.path).not.toMatch(/upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i);
    }
  });

  it('answers a desk read with the offer names from the catalogue, not from the client', async () => {
    const { body } = await get();
    for (const row of body.data.priceBands) {
      expect(typeof row.offerName).toBe('string');
      expect(row.offerName.length).toBeGreaterThan(0);
    }
  });

  it('says what a human must still type, per input, as sentences', async () => {
    const { body } = await get();
    const text = (body.data.awaitingHuman as string[]).join(' | ');
    expect(text).toContain('PRICE BANDS');
    expect(text).toContain('EFFORT TRIPLES');
    expect(text).toContain('PARTNER NAMES');
  });
});
