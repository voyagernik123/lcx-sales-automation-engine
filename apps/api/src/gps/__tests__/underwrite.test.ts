import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { DEFAULT_ISSUE_POLICY, DEFAULT_SAMPLE_COUNT, DEFAULT_SEED, OFFER_KEYS, type OfferKey } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHASE 7 — UNDERWRITING, AT THE ROUTE BOUNDARY AND AT THE GUARD.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THESE ASSERT OVER SERIALISED JSON AND OVER MIDDLEWARE ORDER.
 * `packages/shared/src/gps/underwrite.test.ts` (81 tests) already proves the engine
 * refuses a stale card, produces order-statistic percentiles, and returns
 * `blocked: true` with a quotable threshold on the founder's loss case. None of
 * that has ever been the failure mode. The failure modes this file exists for are
 * three, and all three live above the engine:
 *
 *   1. A MAPPER THAT DEFAULTS. `?? 0` on an absent price, `?? 'USD'` on an absent
 *      currency, an assumed 8 hours a day — each of which turns a refusal into a
 *      number, and one of which turns it into a permissive number.
 *   2. A REQUEST FIELD THAT MOVES THE THRESHOLD. `samples: 1`, a shopped `seed`, a
 *      backdated `asOf`, `policy: { maxPLoss: 1 }`. Every one of these is a way to
 *      get a blocked proposal issued without touching the price.
 *   3. A GUARD THAT WARNS. The block has to prevent the state change, not describe
 *      it, so the assertion is that the downstream handler NEVER RUNS.
 *
 * WHAT THE FAKE POOL IS FOR. A small in-memory Postgres stand-in over the six
 * queries this path issues. It THROWS on any SQL it does not recognise, which is
 * how an unexpected — or an interpolated — query fails loudly here rather than in
 * production, and it records every (sql, params) pair so the parameterisation can
 * be asserted rather than assumed.
 *
 * WHAT THESE DO NOT PROVE. Nothing here runs against Postgres. `gps_rate_card` and
 * `gps_effort_triple` DO NOT EXIST: their CHECK constraints, primary keys and RLS
 * posture are described in `UNDERWRITING_MIGRATION_SPEC` and cannot be verified
 * until a human applies that migration. `serviceDb.test.ts` is where that
 * verification lives for 0047 and is where these tables' belongs too.
 */

const ENGAGEMENT = '11111111-1111-4111-8111-111111111111';
const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'counsel-one';
const OFFER: OfferKey = 'mica_whitepaper';

/** $10k against a modelled ~$12k likely cost: the founder's loss case. */
const LOSS_PRICE_CENTS = 1_000_000;
/** $25k against the same cost: the top of the stated engagement range. */
const HEALTHY_PRICE_CENTS = 2_500_000;

interface RateCardRow {
  partner_id: string;
  offer_key: string;
  unit: string;
  /** STRINGS on purpose: node-postgres hands back `bigint` and `numeric` as text. */
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

const rateCards = new Map<string, RateCardRow>();
const effortTriples = new Map<string, Record<string, unknown>>();
const engagements = new Map<string, Record<string, unknown>>();

let rateCardTable = true;
let effortTripleTable = true;
let engagementTable = true;
let outcomeTable = false;
let partnerColumn = true;

const calls: Array<{ sql: string; params: unknown[] }> = [];

function seedCard(opts: Partial<RateCardRow> = {}): void {
  const row: RateCardRow = {
    partner_id: PARTNER,
    offer_key: OFFER,
    unit: 'day_rate',
    // $1,000 a day. With a 8/12/16-day triple the likely cost is $12,000.
    amount_cents: '100000',
    expected_units: null,
    hours_per_day: null,
    fixed_cost_cents: '0',
    currency: 'EUR',
    valid_until: '2099-12-31',
    stated_by: 'nik',
    stated_at: '2026-07-01T00:00:00.000Z',
    partner_label: 'Counsel One',
    ...opts,
  };
  rateCards.set(`${row.partner_id}|${row.offer_key}`, row);
}

function seedEffort(o = 8, l = 12, p = 16): void {
  effortTriples.set(OFFER, {
    optimistic_days: String(o),
    likely_days: String(l),
    pessimistic_days: String(p),
    stated_by: 'nik',
    stated_at: '2026-07-01T00:00:00.000Z',
  });
}

function seedEngagement(priceCents: number, opts: { partnerId?: string | null; status?: string } = {}): void {
  engagements.set(ENGAGEMENT, {
    id: ENGAGEMENT,
    client_id: CLIENT,
    project_id: null,
    offer_key: OFFER,
    contracting_entity: 'lcx',
    scope_snapshot: {
      offerKey: OFFER,
      offerName: 'MiCA white paper',
      exclusions: ['No legal advice', 'No listing on LCX or any venue'],
      requiredClientInputs: ['Tokenomics', 'Issuer details'],
    },
    price_cents: String(priceCents),
    vendor_cost_cents: '600000',
    currency: 'EUR',
    status: opts.status ?? 'conflict_pending',
    owner: 'nik',
    deposit_required_cents: '0',
    deposit_paid_at: null,
    accepted_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    partner_id: opts.partnerId === undefined ? PARTNER : opts.partnerId,
  });
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });

  if (/to_regclass\('public\.gps_rate_card'\)/.test(sql)) {
    return { rows: [{ rate_cards: rateCardTable, effort_triples: effortTripleTable }] };
  }
  if (/to_regclass\('public\.gps_engagement'\)/.test(sql)) return { rows: [{ ok: engagementTable }] };
  if (/to_regclass\('public\.gps_outcome'\)/.test(sql)) return { rows: [{ ok: outcomeTable }] };
  if (/information_schema\.columns/.test(sql)) return { rows: partnerColumn ? [{ ok: true }] : [] };

  if (/FROM gps_rate_card WHERE partner_id = \$1 AND offer_key = \$2/.test(sql)) {
    const row = rateCards.get(`${String(params[0])}|${String(params[1])}`);
    return { rows: row ? [row] : [] };
  }
  if (/FROM gps_effort_triple WHERE offer_key = \$1/.test(sql)) {
    const row = effortTriples.get(String(params[0]));
    return { rows: row ? [row] : [] };
  }
  if (/SELECT partner_id\s+FROM gps_engagement WHERE id = \$1/.test(sql)) {
    const e = engagements.get(String(params[0]));
    return { rows: e ? [{ partner_id: e.partner_id }] : [] };
  }
  if (/FROM gps_engagement\s+WHERE id = \$1/.test(sql)) {
    const e = engagements.get(String(params[0]));
    return { rows: e ? [e] : [] };
  }
  if (/FROM gps_outcome o/.test(sql)) return { rows: [] };

  throw new Error(`fake pool: unexpected SQL — ${sql.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  getDb: () => { throw new Error('getDb is not used by GPS underwriting'); },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { gpsUnderwriteRoutes, requireUnderwritingClearance } = await import('../../routes/gpsUnderwrite.js');
const { _resetUnderwritingProbes, MIN_DECISION_SAMPLES, validateUnderwriteBody, tightenPolicy } =
  await import('../underwrite.js');
const { _resetMigrated } = await import('../service.js');
const { _resetOutcomeMigrated } = await import('../loop.js');

/**
 * The operator is pre-set, so `requireOperator` returns early
 * (`middleware/auth.ts:146`) and the real middleware runs rather than a stub.
 */
const app = new Hono();
app.use('*', async (c, next) => {
  c.set('operator', { id: 'nik', role: 'approver', authMethod: 'email' });
  await next();
});
app.route('/underwriting', gpsUnderwriteRoutes);

/**
 * The proposal route AS IT WILL BE WIRED: `requireUnderwritingClearance` in front
 * of a handler that records whether it ran. `issueProposal` moves the engagement to
 * `proposed` before assembling anything, so "the handler did not run" is the
 * property that matters — not the status code.
 */
let handlerRan = 0;
const proposalApp = new Hono();
proposalApp.use('*', async (c, next) => {
  c.set('operator', { id: 'nik', role: 'approver', authMethod: 'email' });
  await next();
});
proposalApp.post('/engagements/:id/proposal', requireUnderwritingClearance, (c) => {
  handlerRan += 1;
  return c.json({ data: { issued: true } }, 201);
});

beforeEach(() => {
  rateCards.clear();
  effortTriples.clear();
  engagements.clear();
  calls.length = 0;
  query.mockClear();
  rateCardTable = true;
  effortTripleTable = true;
  engagementTable = true;
  outcomeTable = false;
  partnerColumn = true;
  handlerRan = 0;
  _resetUnderwritingProbes();
  _resetMigrated();
  _resetOutcomeMigrated();
});

type Json = Record<string, any>;

/**
 * Hono mounts a sub-router's `'/'` at the base path WITHOUT a trailing slash, so
 * `/underwriting/` is a 404 while `/underwriting` is the handler. Normalised here
 * once rather than in twenty call sites.
 */
const url = (path: string) => `/underwriting${path === '/' ? '' : path}`;

async function post(path: string, body: unknown): Promise<{ status: number; body: Json }> {
  const res = await app.request(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

async function get(path: string): Promise<{ status: number; body: Json }> {
  const res = await app.request(url(path));
  return { status: res.status, body: (await res.json()) as Json };
}

async function issue(id = ENGAGEMENT): Promise<{ status: number; body: Json }> {
  const res = await proposalApp.request(`/engagements/${id}/proposal`, { method: 'POST' });
  return { status: res.status, body: (await res.json()) as Json };
}

/** A complete, valid body. Tests remove one field at a time from this. */
function quote(priceCents: number): Record<string, unknown> {
  return { offerKey: OFFER, priceCents, currency: 'EUR', partnerId: PARTNER };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1 · THE LOSS-MAKING QUOTE IS REFUSED, WITH A REASON AND A THRESHOLD          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a price that loses money is blocked, and says by how much and against what', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16); // likely cost 12 × $1,000 = $12,000 against a $10,000 price
  });

  it('returns a distribution whose median margin is NEGATIVE and does not round it away', async () => {
    const { status, body } = await post('/', quote(LOSS_PRICE_CENTS));
    expect(status).toBe(200);
    const u = body.data.underwriting;
    expect(u.verdict).toBe('underwritten');
    expect(u.distribution.p50MarginCents).toBeLessThan(0);
    // A loss must be representable on the wire: no Math.abs, no clamp to 0.
    expect(u.distribution.p10MarginCents).toBeLessThanOrEqual(u.distribution.p50MarginCents);
    expect(Number.isInteger(u.distribution.p50MarginCents)).toBe(true);
  });

  it('reports P(loss) as a majority, in words as well as in a number', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    const u = body.data.underwriting;
    expect(u.pLoss).toBeGreaterThan(0.8);
    expect(u.lossSampleCount).toBeGreaterThan(0);
    // ICD-203 vocabulary (`estimative.ts`), one language for probability across the
    // platform — and the BAND travels with the term, so the word cannot be quoted
    // without the percentage range it stands for.
    expect(['very likely', 'almost certain']).toContain(u.pLossLikelihood.term);
    // The word and the number must agree — asserted rather than assumed, because a
    // verbal band that drifts from its probability is worse than no word at all.
    expect(u.pLossLikelihood.pct).toBe(Math.round(u.pLoss * 100));
  });

  it('BLOCKS the issue and quotes both sides of the comparison', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    const issue = body.data.issue;
    expect(issue.blocked).toBe(true);
    expect(issue.code).toBe('p_loss_above_threshold');
    // D1: the number that blocked, the number it was compared against, and who set it.
    const check = issue.failed.find((f: Json) => f.code === 'p_loss_above_threshold');
    expect(check.threshold).toBe(DEFAULT_ISSUE_POLICY.maxPLoss);
    expect(check.observed).toBe(body.data.underwriting.pLoss);
    expect(issue.reason).toMatch(/BLOCKED/);
    expect(issue.reason).toMatch(/% of simulated outcomes/);
    // An UNTOUCHED threshold stays attributed to the shipped default. Re-badging it
    // with the name of whoever opened the screen would fabricate a risk decision.
    expect(issue.policy.statedBy).toBe('system:default');
  });

  it('never presents the block threshold as an agreed figure', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    expect(body.data.policyNotice).toMatch(/stated default, not a founder-agreed risk appetite/);
  });

  it('argues back: three reasons it runs over, sourced, before any outcome exists', async () => {
    const { body } = await post('/argument', quote(LOSS_PRICE_CENTS));
    expect(body.data.source).toBe('offer_exclusions');
    expect(body.data.arguments.length).toBeGreaterThan(0);
    expect(body.data.arguments.length).toBeLessThanOrEqual(3);
    expect(body.data.sourceStatement).toMatch(/NO RECORDED OUTCOMES/);
    // Every exclusion-derived argument carries no sample, and says so numerically.
    for (const a of body.data.arguments) {
      expect(a.sampleSize).toBe(0);
      expect(a.denominator).toBe(0);
    }
    // What the outcome form never asked for is disclosed, so a missing argument
    // reads as a gap in the record rather than as evidence of absence.
    expect(body.meta.provenance.outcomes.statement).toMatch(/NOT captured/);
  });

  it('shows the overrun ladder, monotone, with the baseline as its first row', async () => {
    const { body } = await post('/sensitivity', quote(LOSS_PRICE_CENTS));
    expect(body.data.points[0].effortUpliftPct).toBe(0);
    expect(body.data.monotone).toBe(true);
    expect(body.meta.defaultUpliftsPct).toEqual([10, 25, 50]);
    // Already underwater before any overrun: breakeven is 0, not the first uplift.
    expect(body.data.breakevenUpliftPct).toBe(0);
    // The baseline row must be byte-identical to the distribution panel's median.
    const full = await post('/', quote(LOSS_PRICE_CENTS));
    expect(body.data.points[0].p50MarginCents).toBe(full.body.data.underwriting.distribution.p50MarginCents);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2 · THE HEALTHY QUOTE PASSES — AND "PERMITTED" IS EXPLAINED TOO              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a price with room in it is permitted, on a disclosed basis', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('produces a positive median margin and permits the issue', async () => {
    const { status, body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(status).toBe(200);
    expect(body.data.underwriting.verdict).toBe('underwritten');
    expect(body.data.underwriting.distribution.p50MarginCents).toBeGreaterThan(0);
    expect(body.data.underwriting.pLoss).toBeLessThanOrEqual(DEFAULT_ISSUE_POLICY.maxPLoss);
    expect(body.data.issue.blocked).toBe(false);
    expect(body.data.issue.code).toBe('ok');
  });

  it('explains the permission as well as the refusal, and does not call it an endorsement', async () => {
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.data.issue.passed.length).toBeGreaterThan(0);
    expect(body.data.issue.reason).toMatch(/Issuing is permitted/);
    expect(body.data.issue.reason).toMatch(/Permitted is not endorsed/);
  });

  it('uncertainty sits BESIDE the estimate: p10/p50/p90 present, all integers', async () => {
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    const d = body.data.underwriting.distribution;
    for (const key of ['p10MarginCents', 'p50MarginCents', 'p90MarginCents', 'p10CostCents', 'p50CostCents', 'p90CostCents']) {
      expect(Number.isInteger(d[key]), `${key} is not an integer number of cents`).toBe(true);
    }
    expect(d.p10MarginCents).toBeLessThanOrEqual(d.p50MarginCents);
    expect(d.p50MarginCents).toBeLessThanOrEqual(d.p90MarginCents);
  });

  it('still says the basis is a PRIOR, because nothing has been measured', async () => {
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.data.underwriting.basis).toBe('prior');
    expect(body.data.unresolvedInputs.join(' ')).toMatch(/not a measurement/);
    expect(body.meta.provenance.rateCard.onRecord).toBe(true);
    expect(body.meta.provenance.effort.source).toBe('recorded');
  });

  it('marks its own block decision as advisory, because the guard decides', async () => {
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.meta.issueDecisionIsAdvisory).toBe(true);
    expect(body.meta.authoritativeAt).toMatch(/proposal/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 3 · DETERMINISM — THE SCREEN MUST NOT SHIMMER                               */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('two identical requests produce identical numbers', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('the distribution, P(loss) and the variance attribution are byte-identical', async () => {
    const a = await post('/', quote(LOSS_PRICE_CENTS));
    const b = await post('/', quote(LOSS_PRICE_CENTS));
    expect(b.body.data.underwriting.distribution).toEqual(a.body.data.underwriting.distribution);
    expect(b.body.data.underwriting.pLoss).toBe(a.body.data.underwriting.pLoss);
    expect(b.body.data.underwriting.lossSampleCount).toBe(a.body.data.underwriting.lossSampleCount);
    expect(b.body.data.underwriting.varianceDriver).toEqual(a.body.data.underwriting.varianceDriver);
    expect(b.body.data.sensitivity.points).toEqual(a.body.data.sensitivity.points);
  });

  it('the seed and the sample count come from the server, and are reported', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    expect(body.data.underwriting.seed).toBe(DEFAULT_SEED);
    expect(body.data.underwriting.sampleCount).toBe(DEFAULT_SAMPLE_COUNT);
    expect(body.meta.provenance.seed).toBe(DEFAULT_SEED);
    expect(body.meta.provenance.minDecisionSamples).toBe(MIN_DECISION_SAMPLES);
    // The floor exists so that P(loss) is never counted over a handful of draws.
    expect(DEFAULT_SAMPLE_COUNT).toBeGreaterThanOrEqual(MIN_DECISION_SAMPLES);
  });

  it('the sensitivity route and the argument route read the SAME run', async () => {
    const full = await post('/', quote(LOSS_PRICE_CENTS));
    const sens = await post('/sensitivity', quote(LOSS_PRICE_CENTS));
    const arg = await post('/argument', quote(LOSS_PRICE_CENTS));
    expect(sens.body.data).toEqual(full.body.data.sensitivity);
    expect(arg.body.data).toEqual(full.body.data.devilsAdvocate);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 4 · THE RATCHET — THE BLOCK CANNOT BE BYPASSED BY WHAT YOU SEND OR OMIT      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('an omitted field REFUSES; it never defaults to something permissive', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  /**
   * One case per required field, driven off the complete body so that a field added
   * to the request later is still covered by the same loop. Each assertion checks
   * BOTH halves of the property: the request is refused, AND nothing that looks like
   * an underwriting comes back with it.
   */
  const REQUIRED = ['offerKey', 'priceCents', 'currency', 'partnerId'] as const;
  for (const field of REQUIRED) {
    it(`refuses a body with no ${field}, and returns no distribution at all`, async () => {
      const body = quote(LOSS_PRICE_CENTS);
      delete body[field];
      const { status, body: res } = await post('/', body);
      expect(status).toBe(400);
      expect(res.code).toBe('VALIDATION');
      expect(res.data).toBeUndefined();
      expect(JSON.stringify(res)).not.toMatch(/pLoss|p50MarginCents|blocked/);
    });
  }

  it('a missing price is not read as 0 — which would be a fictional loss or a free win', () => {
    // Asserted on the pure validator as well as on the route: this is the exact
    // place a later refactor would add `?? 0` for convenience.
    const outcome = validateUnderwriteBody(
      { offerKey: OFFER, currency: 'EUR', partnerId: PARTNER },
      Date.parse('2026-08-01T00:00:00.000Z'),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/not defaulted/);
  });

  it('an empty body refuses rather than underwriting a default engagement', async () => {
    const { status, body } = await post('/', {});
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION');
  });

  it('a body that is not an object refuses', async () => {
    const res = await app.request(url('/'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '"just a string"',
    });
    expect(res.status).toBe(400);
  });
});

describe('the four levers that would move P(loss) are server facts, and are REFUSED', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('refuses samples: 1, which would make P(loss) either 0 or 1 on one draw', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), samples: 1 });
    expect(status).toBe(400);
    expect(body.code).toBe('SERVER_FACT');
    expect(body.error).toMatch(/at 1 it is 0 or 1/);
  });

  it('refuses a caller-chosen seed, which would permit shopping for a passing draw', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), seed: 7 });
    expect(status).toBe(400);
    expect(body.code).toBe('SERVER_FACT');
    expect(body.error).toMatch(/shop for one/);
  });

  it('refuses a BACKDATED asOf, which would revive an expired rate card', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), asOf: '2020-01-01T00:00:00.000Z' });
    expect(status).toBe(400);
    expect(body.code).toBe('SERVER_FACT');
    expect(body.error).toMatch(/never used/);
  });

  it('tolerates an HONEST asOf, because the shared request type declares it required', async () => {
    // The web client is typed against `UnderwriteRequest`, where `asOf` is not
    // optional. Refusing it outright would 400 every well-behaved caller; the rule
    // is that it is checked and never used.
    const { status, body } = await post('/', { ...quote(HEALTHY_PRICE_CENTS), asOf: new Date().toISOString() });
    expect(status).toBe(200);
    expect(body.data.underwriting.verdict).toBe('underwritten');
  });

  it('treats an explicit null on an optional server fact as "not supplied"', async () => {
    const { status } = await post('/', { ...quote(HEALTHY_PRICE_CENTS), seed: null, samples: null, hoursPerDay: null });
    expect(status).toBe(200);
  });

  it('and the refusal matters: an expired card is refused on the SERVER clock', async () => {
    seedCard({ valid_until: '2020-01-01' });
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.data.underwriting.verdict).toBe('refused_rate_card_expired');
    expect(body.data.underwriting.distribution).toBeNull();
    expect(body.data.underwriting.pLoss).toBeNull();
    // Null and not 0: "no loss risk found" and "loss risk not computable" are
    // opposite statements, and only one of them may issue a proposal.
    expect(body.data.issue.blocked).toBe(true);
    expect(body.data.issue.code).toBe('underwriting_refused');
  });

  it('refuses a caller-supplied hoursPerDay, which is a lever on cost', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), hoursPerDay: 1 });
    expect(status).toBe(400);
    expect(body.code).toBe('SERVER_FACT');
    expect(body.error).toMatch(/belongs on the rate card row/);
  });

  it('an hourly card with no hours per day ON RECORD refuses instead of assuming 8', async () => {
    seedCard({ unit: 'hourly', amount_cents: '20000', hours_per_day: null });
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.data.underwriting.verdict).toBe('refused_hours_per_day_not_stated');
    expect(body.data.issue.blocked).toBe(true);
  });
});

describe('the appetite may be tightened by a request and never loosened', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('refuses a raised P(loss) ceiling — the bypass this endpoint exists to prevent', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), policy: { maxPLoss: 1 } });
    expect(status).toBe(400);
    expect(body.code).toBe('POLICY_CANNOT_BE_LOOSENED');
    expect(body.data.field).toBe('policy.maxPLoss');
  });

  it('refuses turning the refusal block off', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), policy: { blockOnRefusal: false } });
    expect(status).toBe(400);
    expect(body.code).toBe('POLICY_CANNOT_BE_LOOSENED');
  });

  it('refuses a body naming who set the appetite', async () => {
    const { status, body } = await post('/', { ...quote(LOSS_PRICE_CENTS), policy: { statedBy: 'someone else' } });
    expect(status).toBe(400);
    expect(body.data.field).toBe('policy.statedBy');
  });

  it('ACCEPTS a tighter ceiling, attributes it to the session, and names the change', async () => {
    const { status, body } = await post('/', { ...quote(HEALTHY_PRICE_CENTS), policy: { maxPLoss: 0.0 } });
    expect(status).toBe(200);
    expect(body.data.issue.policy.maxPLoss).toBe(0);
    expect(body.data.issue.policy.statedBy).toBe('nik');
    expect(body.meta.provenance.policyTightenedBy).toEqual(['maxPLoss 0.2 → 0']);
  });

  it('accepts a margin floor, which the server deliberately does not invent', async () => {
    const permissive = tightenPolicy(null, 'nik', '2026-08-01T00:00:00.000Z');
    expect(permissive.ok && permissive.policy.minP50MarginPct).toBeNull();
    const withFloor = tightenPolicy({ minP50MarginPct: 40 }, 'nik', '2026-08-01T00:00:00.000Z');
    expect(withFloor.ok && withFloor.policy.minP50MarginPct).toBe(40);
  });

  it('refuses an effort triple that names its own author', async () => {
    const { status, body } = await post('/', {
      ...quote(LOSS_PRICE_CENTS),
      effort: { optimisticDays: 1, likelyDays: 1, pessimisticDays: 1, statedBy: 'someone else' },
    });
    expect(status).toBe(400);
    expect(body.code).toBe('SERVER_FACT');
    expect(body.error).toMatch(/comes from the authenticated session/);
  });

  it('a request-supplied effort triple is attributed to the session and marked unpersisted', async () => {
    const { body } = await post('/', {
      ...quote(HEALTHY_PRICE_CENTS),
      effort: { optimisticDays: 2, likelyDays: 3, pessimisticDays: 4 },
    });
    expect(body.data.underwriting.effort.statedBy).toBe('nik');
    expect(body.meta.provenance.effort.source).toBe('request');
    expect(body.meta.provenance.effort.statement).toMatch(/NOT persisted/);
    // And it does not reach the guard, which reads the row or the placeholder.
    expect(body.meta.provenance.effort.statement).toMatch(/guard does not read it/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 5 · WITH NO RATE ON RECORD, THE PLACEHOLDER CANNOT PRODUCE A NUMBER          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the placeholder rate card is structurally incapable of pricing', () => {
  it('refuses on every offer in the catalogue when the registry is absent', async () => {
    rateCardTable = false;
    effortTripleTable = false;
    for (const offerKey of OFFER_KEYS) {
      _resetUnderwritingProbes();
      const { status, body } = await post('/', { offerKey, priceCents: HEALTHY_PRICE_CENTS, currency: 'EUR', partnerId: PARTNER });
      expect(status).toBe(200);
      expect(body.data.underwriting.verdict, `${offerKey} produced a number from a placeholder card`)
        .toBe('refused_rate_card_no_validity_stated');
      expect(body.data.underwriting.distribution).toBeNull();
      expect(body.data.underwriting.pLoss).toBeNull();
      expect(body.data.issue.blocked).toBe(true);
      expect(body.data.sensitivity.points).toEqual([]);
    }
  });

  it('degrades as a read: 200 with migrated:false, not a 500 or a bare error', async () => {
    rateCardTable = false;
    const { status, body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(status).toBe(200);
    expect(body.meta.migrated).toBe(false);
    expect(body.meta.provenance.rateCard.source).toBe('placeholder_registry_absent');
    expect(body.meta.provenance.rateCard.onRecord).toBe(false);
    expect(body.meta.provenance.refusedForMissingInputs).toBe(true);
    expect(body.meta.provenance.rateCard.statement).toMatch(/No number on this screen came from it/);
  });

  it('says which migration is missing, so the remedy is not a guess', async () => {
    rateCardTable = false;
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    expect(body.meta.provenance.migration).toMatch(/gps_underwriting\.sql$/);
    expect(body.meta.provenance.rateCard.statement).toMatch(/gps_rate_card/);
  });

  it('refuses a partner that is not in an EXISTING registry, and says so differently', async () => {
    seedCard(); // a card exists, but for a different partner
    seedEffort();
    const { body } = await post('/', { ...quote(HEALTHY_PRICE_CENTS), partnerId: 'someone-else' });
    expect(body.meta.provenance.rateCard.source).toBe('placeholder_not_on_record');
    expect(body.meta.provenance.rateCard.statement).toMatch(/The registry exists and this pair is not in it/);
    expect(body.data.issue.blocked).toBe(true);
  });

  it('still argues, still lists what is unresolved, and never shows an empty screen', async () => {
    rateCardTable = false;
    effortTripleTable = false;
    const { body } = await post('/', quote(HEALTHY_PRICE_CENTS));
    // A refusal is not a blank page: the reasons, the arguments and the missing
    // inputs are all present, which is what makes it actionable rather than a wall.
    expect(body.data.underwriting.reasons.length).toBeGreaterThan(0);
    expect(body.data.devilsAdvocate.arguments.length).toBeGreaterThan(0);
    expect(body.data.unresolvedInputs.length).toBeGreaterThanOrEqual(3);
    expect(body.data.effortTriplesArePlaceholders).toBe(true);
  });

  it('the policy route names every unresolved input rather than a boolean', async () => {
    rateCardTable = false;
    effortTripleTable = false;
    partnerColumn = false;
    const { status, body } = await get('/policy');
    expect(status).toBe(200);
    expect(body.data.unresolvedInputs.length).toBe(4);
    expect(body.data.rateCardsArePlaceholders).toBe(true);
    expect(body.data.minDecisionSamples).toBe(MIN_DECISION_SAMPLES);
    // The one editable block, rendered from data so it cannot drift from the source.
    expect(body.data.placeholderEffortTriples.length).toBe(OFFER_KEYS.length);
    for (const t of body.data.placeholderEffortTriples) expect(t.isPlaceholder).toBe(true);
    expect(body.data.serverFacts.map((f: Json) => f.field)).toContain('seed');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 6 · THE GUARD — ENFORCED, NOT REPORTED                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a blocked proposal cannot be issued, and the handler never runs', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('refuses the issue on a loss-making engagement, with the threshold and the observation', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    const { status, body } = await issue();
    expect(status).toBe(409);
    expect(body.code).toBe('UNDERWRITING_BLOCKED');
    // THE property. `issueProposal` moves the engagement to `proposed` before it
    // assembles anything, so a guard that merely reported would have let the state
    // move and then complained about it.
    expect(handlerRan).toBe(0);
    expect(body.data.issue.code).toBe('p_loss_above_threshold');
    const check = body.data.issue.failed[0];
    expect(check.threshold).toBe(DEFAULT_ISSUE_POLICY.maxPLoss);
    expect(check.observed).toBe(body.data.underwriting.pLoss);
    expect(body.error).toMatch(/BLOCKED/);
    expect(body.data.remedy).toMatch(/Raise the price, cut the scope/);
  });

  it('permits the issue when the quote has room in it', async () => {
    seedEngagement(HEALTHY_PRICE_CENTS);
    const { status, body } = await issue();
    expect(status).toBe(201);
    expect(body.data.issued).toBe(true);
    expect(handlerRan).toBe(1);
  });

  /**
   * THE BYPASS RATCHET AT THE GATE. Everything a caller could send is sent at once:
   * a raised ceiling, one sample, a chosen seed, a backdated clock, a fabricated
   * price, a cheaper partner. The guard reads the ENGAGEMENT ROW and the server
   * policy, so none of it can reach the decision — and unlike the exploratory route,
   * which answers 400, this must not even acknowledge the attempt: it blocks on the
   * real numbers.
   */
  it('ignores every field a caller could send, and still blocks', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    const res = await proposalApp.request(`/engagements/${ENGAGEMENT}/proposal?maxPLoss=1&samples=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        policy: { maxPLoss: 1, blockOnRefusal: false, statedBy: 'someone else' },
        samples: 1,
        seed: 999,
        asOf: '2020-01-01T00:00:00.000Z',
        priceCents: 9_999_999,
        partnerId: 'a-cheaper-partner',
        effort: { optimisticDays: 0, likelyDays: 0, pessimisticDays: 0 },
      }),
    });
    const body = (await res.json()) as Json;
    expect(res.status).toBe(409);
    expect(handlerRan).toBe(0);
    expect(body.data.issue.policy.maxPLoss).toBe(DEFAULT_ISSUE_POLICY.maxPLoss);
    expect(body.data.issue.policy.statedBy).toBe('system:default');
    expect(body.data.underwriting.sampleCount).toBe(DEFAULT_SAMPLE_COUNT);
    expect(body.data.underwriting.seed).toBe(DEFAULT_SEED);
    // The price underwritten is the ROW's, not the body's.
    expect(body.data.underwriting.priceCents).toBe(LOSS_PRICE_CENTS);
    expect(body.data.provenance.rateCard.partnerLabel).toBe('Counsel One');
  });

  it('refuses when no partner is assigned, rather than inferring the only card on record', async () => {
    seedEngagement(HEALTHY_PRICE_CENTS, { partnerId: null });
    const { status, body } = await issue();
    expect(status).toBe(409);
    expect(body.code).toBe('UNDERWRITING_NO_PARTNER');
    expect(handlerRan).toBe(0);
    expect(body.error).toMatch(/is a claim nobody has made/);
    expect(body.data.remedy).toMatch(/Assign the delivering partner/);
  });

  it('refuses when the engagement cannot even record who is delivering it', async () => {
    partnerColumn = false;
    seedEngagement(HEALTHY_PRICE_CENTS);
    const { status, body } = await issue();
    expect(status).toBe(409);
    expect(body.code).toBe('UNDERWRITING_PARTNER_UNASSIGNABLE');
    expect(handlerRan).toBe(0);
    expect(body.data.remedy).toMatch(/ADD COLUMN IF NOT EXISTS partner_id/);
  });

  it('FAILS CLOSED when there is no rate card registry at all', async () => {
    rateCardTable = false;
    effortTripleTable = false;
    seedEngagement(HEALTHY_PRICE_CENTS);
    const { status, body } = await issue();
    expect(status).toBe(409);
    expect(handlerRan).toBe(0);
    expect(body.data.issue.code).toBe('underwriting_refused');
    expect(body.data.provenance.refusedForMissingInputs).toBe(true);
    expect(body.data.remedy).toMatch(/Record the rate card/);
    expect(body.data.failsClosedNotice).toMatch(/every bypass goes through/);
  });

  it('refuses an unpriced engagement with the code the route already used', async () => {
    seedEngagement(0);
    const { status, body } = await issue();
    expect(status).toBe(409);
    expect(body.code).toBe('NO_PRICE');
    expect(handlerRan).toBe(0);
  });

  it('answers 404 for an unknown engagement and 503 while 0047 is pending', async () => {
    const unknown = await issue('22222222-2222-4222-8222-222222222222');
    expect(unknown.status).toBe(404);
    expect(handlerRan).toBe(0);

    engagementTable = false;
    _resetMigrated();
    seedEngagement(HEALTHY_PRICE_CENTS);
    const pending = await issue();
    expect(pending.status).toBe(503);
    expect(pending.body.code).toBe('MIGRATION_PENDING');
    expect(handlerRan).toBe(0);
  });

  it('lets a malformed id fall through to the handler\'s own 400 rather than inventing one', async () => {
    const res = await proposalApp.request('/engagements/not-a-uuid/proposal', { method: 'POST' });
    // The guard has nothing to say about a path that does not name an engagement.
    expect(res.status).toBe(201);
    expect(handlerRan).toBe(1);
  });

  it('the preview route and the guard are the same decision, not two implementations', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    const preview = await get(`/engagements/${ENGAGEMENT}`);
    const enforced = await issue();
    expect(preview.status).toBe(200); // "what would happen" is not an error
    expect(preview.body.data.allowed).toBe(false);
    expect(preview.body.data.code).toBe('UNDERWRITING_BLOCKED');
    expect(preview.body.data.issue.code).toBe(enforced.body.data.issue.code);
    expect(preview.body.data.underwriting.pLoss).toBe(enforced.body.data.underwriting.pLoss);
    expect(preview.body.data.evaluatedBy).toBe('nik');
  });

  it('argues about what was SOLD — the frozen snapshot — not about today\'s catalogue', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    const { body } = await get(`/engagements/${ENGAGEMENT}`);
    expect(body.data.allowed).toBe(false);
    expect(body.data.provenance.offerSource).toBe('scope_snapshot');
    expect(body.data.provenance.rateCard.onRecord).toBe(true);
  });

  it('and quotes the snapshot\'s OWN exclusion wording back at whoever is about to sign', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    const preview = await get(`/engagements/${ENGAGEMENT}`);
    expect(preview.body.data.provenance.offerSource).toBe('scope_snapshot');
    // The exploratory route, given no engagement, argues from the CATALOGUE instead —
    // and says which. The two are allowed to differ; what is not allowed is silence
    // about which one produced the argument.
    const exploratory = await post('/argument', quote(LOSS_PRICE_CENTS));
    expect(exploratory.body.meta.provenance.offerSource).toBe('catalogue');
  });

  it('falls back to the catalogue, and SAYS so, when the snapshot is not usable', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    // A snapshot from an older shape: no exclusion list to argue from.
    engagements.get(ENGAGEMENT)!.scope_snapshot = { offerName: 'MiCA white paper' };
    const { body } = await get(`/engagements/${ENGAGEMENT}`);
    expect(body.data.provenance.offerSource).toBe('catalogue');
    expect(body.data.allowed).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 7 · HYGIENE THAT HAS BITTEN THIS COMPARTMENT BEFORE                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Walk any JSON value, yielding every object node. */
function* nodes(value: unknown): Generator<Json> {
  if (Array.isArray(value)) { for (const v of value) yield* nodes(v); return; }
  if (value && typeof value === 'object') {
    yield value as Json;
    for (const v of Object.values(value as Json)) yield* nodes(v);
  }
}

describe('parameterised SQL, integer cents, and one declaration of the response', () => {
  beforeEach(() => {
    seedCard();
    seedEffort(8, 12, 16);
  });

  it('never interpolates a value into SQL — asserted by looking for the values', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    await issue();
    expect(calls.length).toBeGreaterThan(3);
    for (const { sql, params } of calls) {
      expect(sql, `an id was interpolated into: ${sql}`).not.toContain(ENGAGEMENT);
      expect(sql, `a partner id was interpolated into: ${sql}`).not.toContain(PARTNER);
      expect(sql).not.toMatch(/\$\{/);
      if (params.length > 0) expect(sql, `params passed but no placeholder in: ${sql}`).toMatch(/\$1/);
    }
  });

  it('binds the partner and the offer separately, so neither can smuggle the other', async () => {
    await post('/', quote(HEALTHY_PRICE_CENTS));
    const cardQuery = calls.find((c) => /FROM gps_rate_card/.test(c.sql));
    expect(cardQuery?.params).toEqual([PARTNER, OFFER]);
  });

  it('every cents figure on the wire is an integer', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    let checked = 0;
    for (const node of nodes(body)) {
      for (const [key, v] of Object.entries(node)) {
        if (!/Cents$/.test(key) || v === null || typeof v !== 'number') continue;
        checked += 1;
        expect(Number.isInteger(v), `${key} = ${v} is not an integer number of cents`).toBe(true);
      }
    }
    expect(checked, 'no cents fields were inspected — the walk is broken').toBeGreaterThan(10);
  });

  it('returns the SHARED response shape and adds no field of its own to it', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    // The `counts` / `clientCount` / `openValueCents` failure was a web interface
    // claiming fields the API never returned. The defence is that `data` is exactly
    // `UnderwriteResponse` — server-only facts live in `meta.provenance`, which no
    // shared type declares and no page depends on for a number.
    expect(Object.keys(body.data).sort()).toEqual([
      'asOf', 'devilsAdvocate', 'effortTriplesArePlaceholders', 'issue',
      'percentileMethod', 'policyNotice', 'sensitivity', 'underwriting', 'unresolvedInputs',
    ]);
  });

  it('states the percentile method beside the band rather than in a comment', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    expect(body.data.percentileMethod).toMatch(/order statistic/i);
    expect(body.data.underwriting.method).toMatch(/Monte Carlo/);
  });

  it('carries a driver trail on every figure it produces (D1)', async () => {
    const { body } = await post('/', quote(LOSS_PRICE_CENTS));
    expect(body.data.underwriting.drivers.length).toBeGreaterThan(0);
    for (const d of body.data.underwriting.drivers) {
      expect(typeof d.label).toBe('string');
      expect(typeof d.unit).toBe('string');
    }
  });

  it('the guard writes NOTHING — a refusal is observable, not recorded', async () => {
    seedEngagement(LOSS_PRICE_CENTS);
    calls.length = 0;
    await issue();
    // No INSERT, no UPDATE, no transaction. There is no table for a refusal record
    // and one is not invented here; the durable trace is the log line, and a refusal
    // ledger is named in the hand-off notes as a decision for a human.
    for (const { sql } of calls) {
      // Word-bounded: `updated_at` is a column on the engagement row, not a write.
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|FOR UPDATE)\b/i);
    }
  });
});
