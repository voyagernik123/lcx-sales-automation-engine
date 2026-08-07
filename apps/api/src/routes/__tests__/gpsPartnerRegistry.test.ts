import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PARTNER REGISTRY, AT THE ROUTE BOUNDARY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THE FAKE POOL IS FOR. A small in-memory stand-in over the statements these
 * routes issue. It THROWS on any SQL it does not recognise, so an unexpected — or an
 * interpolated — query fails loudly here rather than in production, and it records
 * every (sql, params) pair so parameterisation is asserted rather than assumed. The
 * technique is `routes/__tests__/gpsInputs.test.ts`'s, for the same reason.
 *
 * WHAT THESE DO NOT PROVE. Nothing here runs against Postgres.
 * `gps_partner_registry` and `gps_partner_capability` DO NOT EXIST ON ANY DATABASE:
 * `0075_gps_partner_registry.sql` is unapplied everywhere, and its CHECK constraints,
 * its foreign key onto `gps_rate_card` and its RLS posture cannot be verified until a
 * human applies it. What is tested is the code's behaviour on both sides of that
 * fact — including that the refusal names the migration.
 *
 * ══ THE BRIDGE, AND WHY IT IS HERE ═══════════════════════════════════════════
 * `@lcx/shared` publishes exactly one entry point and `packages/shared/src/gps/index.ts`
 * re-exports `partners.js` through a hand-written NAME LIST. The floor engine and the
 * assertion predicate are new exports in that module and the list has not been
 * extended — that line belongs to whoever owns the barrel, and a lane that edits a
 * barrel collides with every other lane.
 *
 * So the mock below is NOT a stand-in for the engine: it spreads the REAL module,
 * from its real file, over the real barrel. The only fiction is the specifier. The
 * last test in this file asserts exactly that — that the function these routes call
 * is identical to the one `partners.ts` exports, and that once the barrel line lands
 * the barrel exports that same function object. Delete the mock when it does.
 */
const sharedPartners = await import('../../../../../packages/shared/src/gps/partners.js');

vi.mock('@lcx/shared', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const partners = await import('../../../../../packages/shared/src/gps/partners.js');
  return { ...real, ...partners };
});

interface RegistryRow {
  partner_id: string;
  partner_name: string;
  asserted_by: string;
  asserted_at: string;
  assertion_basis: string;
  active: boolean;
  max_concurrent: string | null;
  capacity_stated_by: string | null;
  capacity_stated_at: string | null;
  unavailable_until: string | null;
  bd_partner_id: string | null;
  notes: string | null;
}

interface CapabilityRow {
  partner_id: string;
  offer_key: string;
  seniority: string;
  jurisdictions: string[];
  evidence: string | null;
}

interface CardRow {
  partner_id: string;
  offer_key: string;
  unit: string;
  /** STRINGS on purpose: node-postgres hands `numeric` and `bigint` back as text. */
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

interface TripleRow {
  offer_key: string;
  optimistic_days: string;
  likely_days: string;
  pessimistic_days: string;
  stated_by: string;
  stated_at: string;
}

const registry = new Map<string, RegistryRow>();
const capabilities = new Map<string, CapabilityRow>();
const cards = new Map<string, CardRow>();
const triples = new Map<string, TripleRow>();

let registryTable = true;
let capabilityTable = true;
let cardTable = true;
let tripleTable = true;

const calls: Array<{ sql: string; params: readonly unknown[] }> = [];

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });

  if (/to_regclass/.test(sql)) {
    return {
      rows: [{
        registry: registryTable,
        capabilities: capabilityTable,
        rate_cards: cardTable,
        effort_triples: tripleTable,
      }],
    };
  }

  if (/INSERT INTO gps_partner_registry/.test(sql)) {
    if (!registryTable) throw new Error('relation "gps_partner_registry" does not exist');
    const [id, name, by, at, basis, active, maxc, capBy, capAt, unavail, bd, notes] =
      params as [string, string, string, string, string, boolean, number | null, string | null, string | null, string | null, string | null, string | null];
    registry.set(id, {
      partner_id: id,
      partner_name: name,
      asserted_by: by,
      asserted_at: at,
      assertion_basis: basis,
      active,
      max_concurrent: maxc === null ? null : String(maxc),
      capacity_stated_by: capBy,
      capacity_stated_at: capAt,
      unavailable_until: unavail,
      bd_partner_id: bd,
      notes,
    });
    return { rows: [] };
  }

  if (/INSERT INTO gps_partner_capability/.test(sql)) {
    if (!capabilityTable) throw new Error('relation "gps_partner_capability" does not exist');
    const [id, offer, seniority, jurisdictions, evidence] =
      params as [string, string, string, string[], string | null];
    capabilities.set(`${id}|${offer}`, {
      partner_id: id, offer_key: offer, seniority, jurisdictions, evidence,
    });
    return { rows: [] };
  }

  if (/INSERT INTO gps_rate_card/.test(sql)) {
    if (!cardTable) throw new Error('relation "gps_rate_card" does not exist');
    const [id, offer, unit, amount, units, hpd, fixedCost, currency, validUntil, statedBy, statedAt, label] =
      params as [string, string, string, number, number | null, number | null, number, string, string, string, string, string | null];
    // THE FOREIGN KEY 0075 ADDS, ENFORCED HERE TOO. Without it this fake would
    // accept a card for a partner nobody asserted and the test would prove less than
    // the schema does.
    if (registryTable && !registry.has(id)) {
      throw new Error('insert or update on table "gps_rate_card" violates foreign key constraint "gps_rate_card_partner_fk"');
    }
    cards.set(`${id}|${offer}`, {
      partner_id: id,
      offer_key: offer,
      unit,
      amount_cents: String(amount),
      expected_units: units === null ? null : String(units),
      hours_per_day: hpd === null ? null : String(hpd),
      fixed_cost_cents: String(fixedCost),
      currency,
      valid_until: validUntil,
      stated_by: statedBy,
      stated_at: statedAt,
      partner_label: label,
    });
    return { rows: [] };
  }

  if (/SELECT partner_id FROM gps_partner_registry WHERE partner_id/.test(sql)
      || /SELECT partner_name FROM gps_partner_registry WHERE partner_id/.test(sql)) {
    if (!registryTable) throw new Error('relation "gps_partner_registry" does not exist');
    const row = registry.get(String(params[0]));
    return { rows: row ? [row] : [] };
  }

  if (/FROM gps_partner_registry/.test(sql)) {
    if (!registryTable) throw new Error('relation "gps_partner_registry" does not exist');
    return { rows: [...registry.values()] };
  }

  if (/FROM gps_partner_capability/.test(sql)) {
    if (!capabilityTable) throw new Error('relation "gps_partner_capability" does not exist');
    return { rows: [...capabilities.values()] };
  }

  if (/FROM gps_rate_card/.test(sql)) {
    if (!cardTable) throw new Error('relation "gps_rate_card" does not exist');
    const wantsOne = /WHERE partner_id = \$1 AND offer_key = \$2/.test(sql);
    if (wantsOne) {
      const row = cards.get(`${String(params[0])}|${String(params[1])}`);
      return { rows: row ? [row] : [] };
    }
    return { rows: [...cards.values()] };
  }

  if (/FROM gps_effort_triple/.test(sql)) {
    if (!tripleTable) throw new Error('relation "gps_effort_triple" does not exist');
    const row = triples.get(String(params[0]));
    return { rows: row ? [row] : [] };
  }

  throw new Error(`fake pool: unexpected SQL — ${sql.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  getDb: () => { throw new Error('getDb is not used by the GPS partner registry'); },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { gpsPartnerRegistryRoutes, ISO_4217_AT_THE_EDGE, CURRENCY_CODE_RE } =
  await import('../gpsPartnerRegistry.js');
const { _resetPartnerRegistryProbes } = await import('../../gps/partnerRegistry.js');

/**
 * The operator is pre-set, so `requireOperator` returns early
 * (`middleware/auth.ts:146`) and the REAL middleware runs rather than a stub.
 */
const app = new Hono();
app.use('*', async (c, next) => {
  c.set('operator', { id: 'nikhil.sharma@lcx.com', role: 'approver', authMethod: 'email' });
  await next();
});
app.route('/partner-registry', gpsPartnerRegistryRoutes);

/** No operator, no pre-set: what an unauthenticated caller actually gets. */
const anonApp = new Hono();
anonApp.route('/partner-registry', gpsPartnerRegistryRoutes);

beforeEach(() => {
  registry.clear();
  capabilities.clear();
  cards.clear();
  triples.clear();
  calls.length = 0;
  query.mockClear();
  registryTable = true;
  capabilityTable = true;
  cardTable = true;
  tripleTable = true;
  process.env.DATABASE_URL = 'postgresql://u:p@db.test.supabase.co:5432/postgres';
  _resetPartnerRegistryProbes();
});

type Json = Record<string, any>;

async function get(path: string): Promise<{ status: number; body: Json }> {
  const res = await app.request(`/partner-registry${path}`);
  return { status: res.status, body: (await res.json()) as Json };
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Json }> {
  const res = await app.request(`/partner-registry${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

const partner = (over: Json = {}): Json => ({
  partnerId: 'counsel-one',
  partnerName: 'Counsel One AG',
  assertionBasis: 'Delivered the Cardano notification pack in March; rate confirmed by email 6 Aug.',
  ...over,
});

const rateCard = (over: Json = {}): Json => ({
  offerKey: 'mica_whitepaper',
  unit: 'day_rate',
  amountCents: 150_000,
  expectedUnits: 5,
  fixedCostCents: 0,
  currency: 'USD',
  validUntil: '2027-01-01',
  ...over,
});

const seedTriple = (over: Partial<TripleRow> = {}): void => {
  triples.set('mica_whitepaper', {
    offer_key: 'mica_whitepaper',
    optimistic_days: '8',
    likely_days: '15',
    pessimistic_days: '30',
    stated_by: 'nikhil.sharma@lcx.com',
    stated_at: '2026-08-06T10:00:00.000Z',
    ...over,
  });
};

/* ══════════════════════════════════════════════════════════════════════════ */

describe('reading the bench', () => {
  it('answers 200 with the migration named when the registry does not exist', async () => {
    registryTable = false;
    const { status, body } = await get('');
    expect(status).toBe(200);
    expect(body.data.bench.state).toBe('not_loaded');
    expect(body.data.bench.note).toContain('0075_gps_partner_registry.sql');
    expect(body.data.bench.note).toContain('NOT "the bench is empty"');
    expect(body.meta.migrated).toBe(false);
  });

  it('answers "genuinely empty" with a different note when the table exists and is bare', async () => {
    const { status, body } = await get('');
    expect(status).toBe(200);
    expect(body.data.bench.state).toBe('empty');
    expect(body.data.bench.note).toContain('nobody has asserted a delivery partner yet');
    expect(body.data.bench.note).not.toContain('0075');
    expect(body.meta.migrated).toBe(true);
  });

  it('carries the caveat that an assertion is a claim, as data', async () => {
    const { body } = await get('');
    expect(body.data.assertionIsAClaim).toMatch(/not verified/i);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await anonApp.request('/partner-registry');
    expect(res.status).toBe(401);
  });
});

describe('asserting a partner', () => {
  it('records who asserted it, when, and on what basis', async () => {
    const { status, body } = await post('/partners', partner());
    expect(status).toBe(201);
    expect(body.data.created).toBe(true);
    expect(body.data.assertedBy).toBe('nikhil.sharma@lcx.com');

    const row = registry.get('counsel-one')!;
    expect(row.asserted_by).toBe('nikhil.sharma@lcx.com');
    expect(row.assertion_basis).toContain('Cardano');
    expect(Number.isFinite(Date.parse(row.asserted_at))).toBe(true);
  });

  // The rule the whole decision turns on: the record is OF who asserted it, not a
  // claim ABOUT who asserted it.
  it('takes the asserter from the operator and IGNORES a body field claiming otherwise', async () => {
    await post('/partners', partner({ assertedBy: 'someone.else@example.com' }));
    expect(registry.get('counsel-one')!.asserted_by).toBe('nikhil.sharma@lcx.com');
  });

  it('refuses a partner with no basis, and says every defect at once', async () => {
    const { status, body } = await post('/partners', partner({ assertionBasis: '   ', partnerName: '' }));
    expect(status).toBe(400);
    expect(body.data.refusal.reason).toContain('No basis stated');
    expect(body.data.refusal.reason).toContain('name a human recognises');
    expect(body.data.refusal.rule).toContain('2026-08-07');
    expect(registry.size).toBe(0);
  });

  it('never writes an unattributed row even when the caller is unauthenticated', async () => {
    const res = await anonApp.request('/partner-registry/partners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(partner()),
    });
    expect(res.status).toBe(401);
    expect(registry.size).toBe(0);
  });

  it('keeps "nobody stated a capacity" apart from "the partner is full"', async () => {
    await post('/partners', partner());
    expect(registry.get('counsel-one')!.max_concurrent).toBeNull();
    expect(registry.get('counsel-one')!.capacity_stated_by).toBeNull();

    await post('/partners', partner({ maxConcurrent: 0 }));
    expect(registry.get('counsel-one')!.max_concurrent).toBe('0');
    // The claim travels whole: a stated cap carries who stated it and when.
    expect(registry.get('counsel-one')!.capacity_stated_by).toBe('nikhil.sharma@lcx.com');
    expect(registry.get('counsel-one')!.capacity_stated_at).not.toBeNull();
  });

  it('refuses a capacity that is not a whole count', async () => {
    const { status, body } = await post('/partners', partner({ maxConcurrent: 2.5 }));
    expect(status).toBe(400);
    expect(body.code).toBe('CAPACITY_NOT_A_COUNT');
  });

  it('refuses a bd link that is not a uuid, and says what NULL there means', async () => {
    const { status, body } = await post('/partners', partner({ bdPartnerId: 'counsel-one' }));
    expect(status).toBe(400);
    expect(body.code).toBe('BD_PARTNER_ID_NOT_A_UUID');
    expect(body.data.refusal.reason).toContain('never means "this is a different entity"');
  });

  it('answers 503 and names the migration when there is nowhere to record it', async () => {
    registryTable = false;
    const { status, body } = await post('/partners', partner());
    expect(status).toBe(503);
    expect(body.code).toBe('PARTNER_REGISTRY_ABSENT');
    expect(body.data.refusal.rule).toContain('0075_gps_partner_registry.sql');
  });

  // Validation before the probe, on every write: a malformed request is malformed in
  // every environment, and answering "awaiting migration" to a typo sends the desk
  // to the database for nothing.
  it('validates BEFORE probing, so a bad body gets 400 on an unmigrated environment', async () => {
    registryTable = false;
    const { status, body } = await post('/partners', partner({ assertionBasis: '' }));
    expect(status).toBe(400);
    expect(body.code).toBe('PARTNER_ASSERTION_BASIS_BLANK');
  });

  it('parameterises every statement — no value is interpolated into SQL', async () => {
    await post('/partners', partner({ partnerName: "Robert'); DROP TABLE gps_rate_card;--" }));
    for (const call of calls) {
      expect(call.sql).not.toContain('DROP TABLE');
    }
    expect(registry.get('counsel-one')!.partner_name).toContain('DROP TABLE');
  });
});

describe('rate cards, which now have a partner to belong to', () => {
  it('refuses a card for a partner nobody asserted', async () => {
    const { status, body } = await post('/partners/ghost/rate-cards', rateCard());
    expect(status).toBe(409);
    expect(body.code).toBe('PARTNER_NOT_ASSERTED');
    expect(cards.size).toBe(0);
  });

  it('accepts a card for an asserted partner and labels it from the registry', async () => {
    await post('/partners', partner());
    const { status, body } = await post('/partners/counsel-one/rate-cards', rateCard());
    expect(status).toBe(200);
    expect(body.data.derivedCostCents).toBe(750_000);
    const row = cards.get('counsel-one|mica_whitepaper')!;
    // The label is the registry's name, never a caller-supplied string.
    expect(row.partner_label).toBe('Counsel One AG');
    expect(row.stated_by).toBe('nikhil.sharma@lcx.com');
  });

  it('refuses a rate of zero — the column permits it and this does not', async () => {
    await post('/partners', partner());
    const { status, body } = await post('/partners/counsel-one/rate-cards', rateCard({ amountCents: 0 }));
    expect(status).toBe(400);
    expect(body.code).toBe('RATE_NOT_POSITIVE');
    expect(body.data.refusal.rule).toContain('unfilled form');
  });

  it('refuses a rate that rounds to nothing, through the shared guard', async () => {
    await post('/partners', partner());
    const { status, body } = await post('/partners/counsel-one/rate-cards',
      rateCard({ amountCents: 0.05, expectedUnits: 5 }));
    expect(status).toBe(400);
    expect(body.code).toBe('RATE_BELOW_ONE_CENT');
  });

  it('refuses an omitted pass-through rather than reading it as zero', async () => {
    await post('/partners', partner());
    const body = rateCard();
    delete body.fixedCostCents;
    const res = await post('/partners/counsel-one/rate-cards', body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASS_THROUGH_NOT_A_COST');
    expect(res.body.data.refusal.reason).toContain("counsel's own fee");
  });

  it('accepts a STATED pass-through of zero', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/rate-cards', rateCard({ fixedCostCents: 0 }));
    expect(res.status).toBe(200);
    expect(cards.get('counsel-one|mica_whitepaper')!.fixed_cost_cents).toBe('0');
  });

  it('refuses an hourly card with no hours per day', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/rate-cards',
      rateCard({ unit: 'hourly', amountCents: 25_000, expectedUnits: 40 }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('HOURS_PER_DAY_REQUIRED');
  });

  it('refuses a metered card with no unit count, and never assumes 1', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/rate-cards', rateCard({ expectedUnits: null }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXPECTED_UNITS_REQUIRED');
  });

  it('refuses a card with no expiry — a rate nobody re-confirmed', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/rate-cards', rateCard({ validUntil: '' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RATE_CARD_VALIDITY_REQUIRED');
  });

  it('refuses a currency that is not three letters, at the edge', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/rate-cards', rateCard({ currency: 'US DOLLARS' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CURRENCY_NOT_ISO_4217');
  });

  it('uses the same currency pattern the shared contract declares', () => {
    // The literal in the route file exists because a ratchet requires it; this is
    // what stops it becoming a second opinion.
    expect(ISO_4217_AT_THE_EDGE.source).toBe(CURRENCY_CODE_RE.source);
    expect(ISO_4217_AT_THE_EDGE.flags).toBe(CURRENCY_CODE_RE.flags);
  });
});

describe('capabilities', () => {
  it('refuses a capability for a partner nobody asserted', async () => {
    const res = await post('/partners/ghost/capabilities', { offerKey: 'mica_whitepaper', seniority: 'senior' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PARTNER_NOT_ASSERTED');
  });

  it('stores the jurisdictions a human typed, and expands nothing', async () => {
    await post('/partners', partner());
    const res = await post('/partners/counsel-one/capabilities', {
      offerKey: 'mica_whitepaper',
      seniority: 'principal',
      jurisdictions: ['Liechtenstein', ' EU '],
    });
    expect(res.status).toBe(200);
    // Trimmed, and NOT expanded: "EU" does not become Liechtenstein, Germany, …
    expect(capabilities.get('counsel-one|mica_whitepaper')!.jurisdictions).toEqual(['Liechtenstein', 'EU']);
  });

  it('refuses an unknown offer key and an unknown seniority', async () => {
    await post('/partners', partner());
    expect((await post('/partners/counsel-one/capabilities', { offerKey: 'nope', seniority: 'senior' })).body.code)
      .toBe('OFFER_KEY_UNKNOWN');
    expect((await post('/partners/counsel-one/capabilities', { offerKey: 'mica_whitepaper', seniority: 'god' })).body.code)
      .toBe('SENIORITY_UNKNOWN');
  });
});

describe('the floor', () => {
  const floorUrl = '/floor?partnerId=counsel-one&offerKey=mica_whitepaper&effortPoint=likely&currency=USD';

  async function completeBench(): Promise<void> {
    await post('/partners', partner());
    await post('/partners/counsel-one/capabilities', { offerKey: 'mica_whitepaper', seniority: 'principal', jurisdictions: [] });
    await post('/partners/counsel-one/rate-cards', rateCard());
    seedTriple();
  }

  it('computes the floor from an asserted partner, a live card and a real triple', async () => {
    await completeBench();
    const { status, body } = await get(floorUrl);
    expect(status).toBe(200);
    // $1,500/day × 15 likely days = $22,500.
    expect(body.data.floor.floorCents).toBe(2_250_000);
    expect(body.data.floor.currency).toBe('USD');
    expect(body.data.refusals).toEqual([]);
  });

  it('carries the environment label and the attribution onto the figure', async () => {
    await completeBench();
    const { body } = await get(floorUrl);
    expect(body.data.floor.frame.environment).toBe('supabase:db.test.supabase.co/postgres');
    // Credentials do not survive into the label.
    expect(body.data.floor.frame.environment).not.toContain('p@');
    expect(body.data.floor.frame.assertedBy).toBe('nikhil.sharma@lcx.com');
    expect(body.data.floor.frame.assertionBasis).toContain('Cardano');
    expect(body.data.floor.frame.excludes.join(' ')).toMatch(/overhead/i);
  });

  it('refuses when nobody can name the database the rate came from', async () => {
    await completeBench();
    process.env.DATABASE_URL = '';
    const { body } = await get(floorUrl);
    expect(body.data.floor).toBeNull();
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_ENVIRONMENT_UNSTATED');
  });

  it('refuses with the effort triple ABSENT, not with a placeholder floor', async () => {
    await post('/partners', partner());
    await post('/partners/counsel-one/capabilities', { offerKey: 'mica_whitepaper', seniority: 'principal', jurisdictions: [] });
    await post('/partners/counsel-one/rate-cards', rateCard());
    // No triple seeded. `underwrite.ts` would substitute the shipped placeholder and
    // label the result; a floor may not, because a floor is quoted as a line.
    const { body } = await get(floorUrl);
    expect(body.data.floor).toBeNull();
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_EFFORT_ABSENT');
    expect(body.data.refusals.find((r: Json) => r.code === 'FLOOR_EFFORT_ABSENT').remedyOwner).toBe('the founder');
  });

  it('refuses with the rate card ABSENT when the partner is asserted and uncosted', async () => {
    await post('/partners', partner());
    seedTriple();
    const { body } = await get(floorUrl);
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_RATE_CARD_ABSENT');
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_PARTNER_NOT_CAPABLE');
  });

  it('refuses NOT LOADED, differently, when the rate card relation does not exist', async () => {
    await post('/partners', partner());
    seedTriple();
    cardTable = false;
    _resetPartnerRegistryProbes();
    const { body } = await get(floorUrl);
    const codes = body.data.refusals.map((r: Json) => r.code);
    expect(codes).toContain('FLOOR_RATE_CARD_NOT_LOADED');
    expect(codes).not.toContain('FLOOR_RATE_CARD_ABSENT');
  });

  it('refuses for a partner who was never asserted', async () => {
    seedTriple();
    const { body } = await get('/floor?partnerId=ghost&offerKey=mica_whitepaper&effortPoint=likely&currency=USD');
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_PARTNER_NOT_ASSERTED');
  });

  it('refuses an expired card rather than quoting the last rate the partner honoured', async () => {
    await completeBench();
    cards.get('counsel-one|mica_whitepaper')!.valid_until = '2020-01-01';
    const { body } = await get(floorUrl);
    expect(body.data.floor).toBeNull();
    expect(body.data.refusals.map((r: Json) => r.code)).toContain('FLOOR_RATE_CARD_EXPIRED');
  });

  it('offers no optimistic point', async () => {
    const { status, body } = await get('/floor?partnerId=counsel-one&offerKey=mica_whitepaper&effortPoint=optimistic&currency=USD');
    expect(status).toBe(400);
    expect(body.code).toBe('EFFORT_POINT_UNKNOWN');
    expect(body.data.refusal.reason).toContain('salesperson under pressure');
  });

  it('refuses a missing partnerId, an unknown offer and a bad currency at the edge', async () => {
    expect((await get('/floor?offerKey=mica_whitepaper&effortPoint=likely&currency=USD')).body.code)
      .toBe('PARTNER_ID_REQUIRED');
    expect((await get('/floor?partnerId=x&offerKey=nope&effortPoint=likely&currency=USD')).body.code)
      .toBe('OFFER_KEY_UNKNOWN');
    expect((await get('/floor?partnerId=x&offerKey=mica_whitepaper&effortPoint=likely&currency=DOLLARS')).body.code)
      .toBe('CURRENCY_NOT_ISO_4217');
  });

  it('gives the pessimistic point a different, higher floor', async () => {
    await completeBench();
    const { body } = await get('/floor?partnerId=counsel-one&offerKey=mica_whitepaper&effortPoint=pessimistic&currency=USD');
    // $1,500/day × 30 pessimistic days = $45,000.
    expect(body.data.floor.floorCents).toBe(4_500_000);
  });

  it('answers 200 with refusals — never a 404 — when there is no floor', async () => {
    registryTable = false;
    cardTable = false;
    tripleTable = false;
    const { status, body } = await get(floorUrl);
    expect(status).toBe(200);
    expect(body.data.floor).toBeNull();
    expect(body.data.refusals.length).toBeGreaterThan(0);
    expect(body.meta.migrated).toBe(false);
  });
});

describe('the payload is held to the shared contract, not to a description of it', () => {
  /**
   * `partnerRegistryDeskDefects` is declared once, in
   * `packages/shared/src/gps/partners.ts`, and is run HERE over a real serialised HTTP
   * response and THERE over the page's fixture
   * (`apps/web/src/pages/__tests__/gpsPartnerRegistry.test.tsx`). Neither side
   * describes the shape; both are measured against one executable predicate.
   */
  it('matches the desk contract on a loaded bench, an empty one and an unmigrated one', async () => {
    expect(sharedPartners.partnerRegistryDeskDefects((await get('')).body.data)).toEqual([]);

    await post('/partners', partner());
    const loaded = (await get('')).body.data;
    expect(loaded.bench.state).toBe('loaded');
    expect(sharedPartners.partnerRegistryDeskDefects(loaded)).toEqual([]);

    registryTable = false;
    _resetPartnerRegistryProbes();
    expect(sharedPartners.partnerRegistryDeskDefects((await get('')).body.data)).toEqual([]);
  });

  it('matches the floor contract whether it answers with a figure or with refusals', async () => {
    const url = '/floor?partnerId=counsel-one&offerKey=mica_whitepaper&effortPoint=likely&currency=USD';
    expect(sharedPartners.partnerRegistryFloorDefects((await get(url)).body.data)).toEqual([]);

    await post('/partners', partner());
    await post('/partners/counsel-one/capabilities', { offerKey: 'mica_whitepaper', seniority: 'principal', jurisdictions: [] });
    await post('/partners/counsel-one/rate-cards', rateCard());
    seedTriple();
    const priced = (await get(url)).body.data;
    expect(priced.floor).not.toBeNull();
    expect(sharedPartners.partnerRegistryFloorDefects(priced)).toEqual([]);
  });

  it('would notice an unattributed member arriving on the wire', async () => {
    await post('/partners', partner());
    // The one defect that looks completely normal on screen: a bench member with no
    // assertion. The predicate is what stops it rendering as an ordinary row.
    const desk = (await get('')).body.data;
    desk.bench.members[0].partner.assertion.assertedBy = '';
    expect(sharedPartners.partnerRegistryDeskDefects(desk).join(' '))
      .toContain('PARTNER_ASSERTED_BY_BLANK');
  });
});

describe('the barrel line this lane still needs', () => {
  /**
   * NOT an assertion about whether the barrel has been wired — that would fail before
   * the line lands (a red suite for a known-pending edit) or after it (punishing the
   * person who fixed it). It asserts the BRIDGE IS HONEST: the engine these routes
   * call is the same function object `partners.ts` exports, so every test above is a
   * test of the real thing; and IF the barrel already exports it, that it is the same
   * object there too.
   */
  it('routes the real engine, whatever the specifier resolves to', async () => {
    const viaBridge = await import('@lcx/shared');
    expect((viaBridge as Record<string, unknown>).priceFloor).toBe(sharedPartners.priceFloor);

    const viaBarrel = await vi.importActual<Record<string, unknown>>('@lcx/shared');
    if (Object.prototype.hasOwnProperty.call(viaBarrel, 'priceFloor')) {
      // The barrel line has landed. Delete the vi.mock at the top of this file.
      expect(viaBarrel.priceFloor).toBe(sharedPartners.priceFloor);
    }
  });
});
