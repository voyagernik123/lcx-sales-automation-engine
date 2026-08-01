import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  BOOK_MONITOR_SPECS,
  MIN_N_FOR_RATE,
  WEIGHTS_V1,
  type OfferKey,
} from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHASE 12 — THE OUTCOME LOOP, AT THE ROUTE BOUNDARY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THESE ASSERT OVER SERIALISED JSON AND NOT OVER ENGINE RETURN VALUES.
 * `packages/shared/src/gps/loop.test.ts` already proves the engine suppresses a
 * rate below `MIN_N_FOR_RATE`, refuses to mint a record from a blocked draft, and
 * cannot express a weight change. None of that has ever been the failure mode. The
 * failure mode is a route, a mapper, an envelope or a later refactor putting the
 * number BACK — `?? 0` on a null rate, a `Math.abs` on a negative margin, a
 * convenience field computed in the handler. So every assertion below goes through
 * `app.request(...)` and reads `await res.json()`: the bytes a browser would get.
 *
 * WHAT THE FAKE POOL IS FOR. It is a tiny in-memory Postgres stand-in that stores
 * what the INSERT binds and returns it from the SELECT, so a loss genuinely ROUND
 * TRIPS — write a realised cost above the realised price, read it back, and see a
 * negative margin. A mock that only recorded the call could not catch a mapper that
 * dropped the sign. It also THROWS on any SQL it does not recognise, which is how
 * an unexpected query (or an interpolated one) fails loudly here rather than in
 * production.
 *
 * WHAT THESE DO NOT PROVE. Nothing here runs against Postgres: the CHECK
 * constraints, the ON CONFLICT target and the RLS posture of `gps_outcome` are
 * described in `OUTCOME_MIGRATION_SPEC` and cannot be verified until a human
 * applies that migration — `serviceDb.test.ts` is where that verification lives for
 * 0047 and is where this table's belongs too, behind `GPS_TEST_DATABASE_URL`.
 */

const ENGAGEMENT_A = '11111111-1111-4111-8111-111111111111';
const ENGAGEMENT_B = '22222222-2222-4222-8222-222222222222';
const ENGAGEMENT_C = '33333333-3333-4333-8333-333333333333';
const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface FakeEngagement {
  id: string;
  client_id: string;
  offer_key: OfferKey;
  status: string;
  /** STRINGS on purpose: node-postgres hands back `bigint` as a string. */
  price_cents: string;
  vendor_cost_cents: string;
}

const engagements = new Map<string, FakeEngagement>();
const outcomes = new Map<string, Record<string, unknown>>();
let outcomeTableExists = true;
let engagementTableExists = true;

/** Every (sql, params) pair the code issued, for the parameterisation assertions. */
const calls: Array<{ sql: string; params: unknown[] }> = [];

function seedEngagement(id: string, priceCents: number, vendorCostCents: number, status = 'delivered'): void {
  engagements.set(id, {
    id,
    client_id: CLIENT_A,
    offer_key: 'diagnostic',
    status,
    price_cents: String(priceCents),
    vendor_cost_cents: String(vendorCostCents),
  });
}

/** The joined row shape `OUTCOME_SELECT` produces — quoted side from the engagement. */
function joined(engagementId: string): Record<string, unknown> | null {
  const o = outcomes.get(engagementId);
  const e = engagements.get(engagementId);
  if (!o || !e) return null;
  return {
    engagement_id: engagementId,
    client_id: e.client_id,
    offer_key: e.offer_key,
    disposition: o.disposition,
    reason: o.reason,
    price_cents: e.price_cents,
    vendor_cost_cents: e.vendor_cost_cents,
    realised_price_cents: o.realised_price_cents === null ? null : String(o.realised_price_cents),
    realised_vendor_cost_cents: o.realised_vendor_cost_cents === null ? null : String(o.realised_vendor_cost_cents),
    cycle_time_days: o.cycle_time_days,
    acceptance_first_pass: o.acceptance_first_pass,
    partner: o.partner,
    factor_scores_at_quote: o.factor_scores_at_quote,
    decided_at: o.decided_at,
  };
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });

  if (/to_regclass\('public\.gps_engagement'\)/.test(sql)) return { rows: [{ ok: engagementTableExists }] };
  if (/to_regclass\('public\.gps_outcome'\)/.test(sql)) return { rows: [{ ok: outcomeTableExists }] };

  if (/INSERT INTO gps_outcome/.test(sql)) {
    const [engagementId, disposition, reason, rp, rc, cycle, firstPass, partner, scores, decidedAt, recordedBy] = params;
    outcomes.set(String(engagementId), {
      disposition, reason,
      realised_price_cents: rp, realised_vendor_cost_cents: rc,
      cycle_time_days: cycle, acceptance_first_pass: firstPass, partner,
      factor_scores_at_quote: typeof scores === 'string' ? JSON.parse(scores) : scores,
      decided_at: decidedAt, recorded_by: recordedBy,
    });
    return { rows: [] };
  }

  if (/FROM gps_outcome o/.test(sql)) {
    const rows = [...outcomes.keys()].map(joined).filter((r): r is Record<string, unknown> => r !== null);
    if (/decided_at >= \$1::date/.test(sql)) {
      const weekStart = String(params[0]);
      const end = new Date(`${weekStart}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 7);
      const endStr = end.toISOString().slice(0, 10);
      return { rows: rows.filter((r) => String(r.decided_at) >= weekStart && String(r.decided_at) < endStr) };
    }
    return { rows };
  }

  if (/FROM gps_outcome WHERE engagement_id = \$1/.test(sql)) {
    const o = outcomes.get(String(params[0]));
    return { rows: o ? [o] : [] };
  }

  if (/FROM gps_engagement WHERE id = \$1/.test(sql)) {
    const e = engagements.get(String(params[0]));
    return { rows: e ? [e] : [] };
  }

  throw new Error(`fake pool: unexpected SQL — ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  getDb: () => { throw new Error('getDb is not used by the GPS loop'); },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { gpsLoopRoutes } = await import('../../routes/gpsLoop.js');
const { _resetOutcomeMigrated, OUTCOME_MIGRATION } = await import('../loop.js');
const { _resetMigrated } = await import('../service.js');

/**
 * A tiny app with the operator pre-set. `requireOperator` returns early when
 * `c.get('operator')` is already populated (`middleware/auth.ts:146`), so this
 * exercises the real middleware rather than replacing it.
 */
const app = new Hono();
app.use('*', async (c, next) => {
  c.set('operator', { id: 'nik', role: 'approver', label: 'Nik' });
  await next();
});
app.route('/loop', gpsLoopRoutes);

beforeEach(() => {
  engagements.clear();
  outcomes.clear();
  calls.length = 0;
  query.mockClear();
  outcomeTableExists = true;
  engagementTableExists = true;
  _resetOutcomeMigrated();
  _resetMigrated();
});

type Json = Record<string, unknown>;

async function get(path: string): Promise<{ status: number; body: Json }> {
  const res = await app.request(`/loop${path}`);
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as Json };
  } catch (err) {
    throw new Error(`GET /loop${path} -> ${res.status} non-JSON body: ${text.slice(0, 200)}`);
  }
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Json }> {
  const res = await app.request(`/loop${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

/** Walk any JSON value, yielding every object node. Used by the absence assertions. */
function* nodes(value: unknown): Generator<Json> {
  if (Array.isArray(value)) { for (const v of value) yield* nodes(v); return; }
  if (value && typeof value === 'object') {
    yield value as Json;
    for (const v of Object.values(value as Json)) yield* nodes(v);
  }
}

/** Record three decided outcomes: 2 won, 1 lost. n=3, far below MIN_N_FOR_RATE. */
async function seedThreeOutcomes(): Promise<void> {
  seedEngagement(ENGAGEMENT_A, 1_500_000, 900_000);
  seedEngagement(ENGAGEMENT_B, 1_200_000, 700_000);
  seedEngagement(ENGAGEMENT_C, 1_000_000, 600_000, 'proposed');
  await post('/outcome', {
    engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'price',
    realisedPriceCents: 1_500_000, realisedVendorCostCents: 900_000,
    decidedAt: '2026-07-27', partner: 'Partner One',
  });
  await post('/outcome', {
    engagementId: ENGAGEMENT_B, disposition: 'won', reason: 'price',
    realisedPriceCents: 1_100_000, realisedVendorCostCents: 750_000,
    decidedAt: '2026-07-28', partner: 'Partner One',
  });
  await post('/outcome', {
    engagementId: ENGAGEMENT_C, disposition: 'lost', reason: 'price_too_high',
    decidedAt: '2026-07-29',
  });
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1 · THE RATE IS SUPPRESSED AT THE ROUTE BOUNDARY                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('below MIN_N_FOR_RATE the wire carries counts and a null rate', () => {
  it('the fixture really is below the threshold — otherwise the rest proves nothing', () => {
    expect(MIN_N_FOR_RATE).toBe(8);
  });

  it('GET /win-loss withholds the pooled rate on n=3 and says why', async () => {
    await seedThreeOutcomes();
    const { status, body } = await get('/win-loss');
    expect(status).toBe(200);

    const data = body.data as Json;
    const overall = data.overall as Json;
    expect(overall.sampleSize).toBe(3);
    expect(overall.won).toBe(2);
    expect(overall.lost).toBe(1);
    // The whole point: NULL, not 67, and not 0.
    expect(overall.winRatePct).toBeNull();
    expect(overall.rateSuppressed).toBe(true);
    expect(typeof overall.suppressionReason).toBe('string');
    expect(overall.interval95Pct).toBeNull();
    // The threshold travels with the report so a printed page carries its own bar.
    expect((body.meta as Json).minNForRate).toBe(MIN_N_FOR_RATE);
  });

  it('no node anywhere in the win/loss payload expresses a rate on too few observations', async () => {
    await seedThreeOutcomes();
    const { body } = await get('/win-loss');
    const offenders: string[] = [];
    for (const node of nodes(body)) {
      const n = node.sampleSize ?? node.n;
      const pct = node.winRatePct ?? node.pct;
      if (typeof n === 'number' && n < MIN_N_FOR_RATE && typeof pct === 'number') {
        offenders.push(`${pct}% on n=${n}`);
      }
    }
    expect(offenders, 'a percentage reached the wire on fewer than the stated minimum observations').toEqual([]);
  });

  it('every offer row is present, including the four that have never been decided', async () => {
    await seedThreeOutcomes();
    const { body } = await get('/win-loss');
    const rows = (body.data as Json).byOffer as Json[];
    // A missing row is invisible; a row reading 0 won / 0 lost is the finding.
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.winRatePct).toBeNull();
  });

  it('the loop response withholds the WBR pooled rate too', async () => {
    await seedThreeOutcomes();
    const { status, body } = await get('');
    expect(status).toBe(200);
    const wbr = (body.data as Json).wbr as Json;
    const pooled = wbr.pooledWinRate as Json;
    expect(pooled.pct).toBeNull();
    expect(pooled.counts).toEqual({ won: 2, lost: 1 });
    expect(pooled.suppressionReason).toContain('8');
    // The printable lines must say WITHHELD rather than omit the figure.
    expect((wbr.lines as string[]).join(' ')).toContain('WITHHELD');
  });

  it('calibration health reports what cannot be concluded rather than an empty state', async () => {
    await seedThreeOutcomes();
    const { body } = await get('/health');
    const data = body.data as Json;
    expect((data.conclusions as Json[])).toHaveLength(6);
    const winRate = (data.conclusions as Json[]).find((x) => x.key === 'overall_win_rate') as Json;
    expect(winRate.answerable).toBe(false);
    expect(winRate.n).toBe(3);
    expect(winRate.answer.toString().length).toBeGreaterThan(0);
    expect(data.verdict).not.toBe('no_outcomes_at_all');
    expect((data.cannotConclude as string[]).length).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2 · A LOSS ROUND-TRIPS AS A NEGATIVE MARGIN                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a realised cost above the realised price is a loss, and stays one', () => {
  const overrun = async (): Promise<void> => {
    // $10,000 sold, $6,000 quoted to the partner, $14,000 actually invoiced by them.
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    const { status } = await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral',
      realisedPriceCents: 1_000_000, realisedVendorCostCents: 1_400_000,
      decidedAt: '2026-07-27', partner: 'Partner One',
    });
    expect(status).toBe(200);
  };

  it('binds the overrun exactly as typed — no clamp, no absolute value', async () => {
    await overrun();
    const insert = calls.find((x) => /INSERT INTO gps_outcome/.test(x.sql));
    expect(insert).toBeDefined();
    expect(insert?.params[4]).toBe(1_400_000);
    expect(insert?.params[3]).toBe(1_000_000);
  });

  it('reads back as a negative realised margin and a negative slippage', async () => {
    await overrun();
    const { status, body } = await get('/margin');
    expect(status).toBe(200);
    const overall = (body.data as Json).overall as Json;
    expect(overall.n).toBe(1);
    expect(overall.quotedMarginMeanCents).toBe(400_000);
    // −$4,000 realised against +$4,000 quoted: $8,000 of margin given away.
    expect(overall.realisedMarginMeanCents).toBe(-400_000);
    expect(overall.slippageMeanCents).toBe(-800_000);
    expect(overall.worstSlippageCents).toBe(-800_000);
    expect(overall.negativeRealisedMarginCount).toBe(1);
    // The side that leaked is named: the partner overran, we did not discount.
    expect(overall.priceSlippageMeanCents).toBe(0);
    expect(overall.costSlippageMeanCents).toBe(800_000);
  });

  it('the capture form itself reports the negative realised margin', async () => {
    await overrun();
    const { body } = await get(`/outcome/${ENGAGEMENT_A}`);
    const form = body.data as Json;
    expect(form.quotedMarginCents).toBe(400_000);
    expect(form.realisedMarginCents).toBe(-400_000);
    expect(form.marginSlippageCents).toBe(-800_000);
  });

  it('the partner action list carries the loss under the partner who caused it', async () => {
    await overrun();
    const { body } = await get('/margin');
    const byPartner = (body.data as Json).byPartner as Json[];
    expect(byPartner[0].key).toBe('Partner One');
    expect(byPartner[0].slippageMeanCents).toBe(-800_000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 3 · ABSENT REALISED FIGURES STAY ABSENT                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a win with no partner invoice yet is incomplete, not zero', () => {
  it('binds null and is counted as an exclusion rather than a break-even', async () => {
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    const { status } = await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral', decidedAt: '2026-07-27',
    });
    expect(status).toBe(200);

    const insert = calls.find((x) => /INSERT INTO gps_outcome/.test(x.sql));
    // A `?? 0` here would read as "invoiced nothing" and as a 100% discount.
    expect(insert?.params[3]).toBeNull();
    expect(insert?.params[4]).toBeNull();

    const { body } = await get('/margin');
    expect((body.data as Json).overall).toBeNull();
    expect((body.data as Json).excludedIncompleteRealisation).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 4 · THE REVIEW PACKET DOES NOT MUTATE WEIGHTS                               */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the review packet reports; it does not adjust', () => {
  it('leaves WEIGHTS_V1 byte-identical after a request', async () => {
    await seedThreeOutcomes();
    const before = JSON.stringify(WEIGHTS_V1);
    const { status, body } = await get('/review');
    expect(status).toBe(200);
    expect(JSON.stringify(WEIGHTS_V1)).toBe(before);
    expect((body.data as Json).weightsMutated).toBe(false);
    expect((body.data as Json).weightsAreAStatedPrior).toBe(true);
    expect((body.data as Json).proposedWeightChanges).toEqual([]);
    expect((body.data as Json).weightChangeMechanism).toContain('human');
  });

  it('the payload contains no field a fitted weight could be written into', async () => {
    await seedThreeOutcomes();
    const { body } = await get('/review');
    for (const node of nodes(body)) {
      for (const key of ['weightsAfter', 'fittedWeight', 'newWeight', 'suggestedWeight', 'pValue']) {
        expect(Object.keys(node), `the review payload exposes ${key}`).not.toContain(key);
      }
    }
  });

  it('offers no write route beside the read — a review is not an apply', async () => {
    // Hono answers 404 for a method/path it has no handler for. The absence of the
    // route IS the mechanism; there is nothing to authorise.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await app.request('/loop/review', { method });
      expect(res.status, `${method} /loop/review is routed`).toBe(404);
    }
  });

  it('states that no factor is reviewable at this n instead of ranking three of them', async () => {
    await seedThreeOutcomes();
    const { body } = await get('/review');
    const rows = (body.data as Json).rows as Json[];
    // No outcome here carries factorScoresAtQuote, so every factor is unreviewable.
    for (const row of rows) expect(row.insufficientEvidence).toBe(true);
    expect((body.data as Json).noFactorReviewable).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 5 · MONITORS PROPOSE, THEY DO NOT ACT                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the monitor specs are definitions for a human to register', () => {
  it('every spec is condition → propose, with no executable half', async () => {
    const { status, body } = await get('/monitors');
    expect(status).toBe(200);
    const specs = (body.data as Json).monitors as Json[];
    expect(specs).toHaveLength(BOOK_MONITOR_SPECS.length);
    for (const spec of specs) {
      expect(spec.mutatesState).toBe(false);
      expect(spec.requiresHumanAction).toBe(true);
      expect(Object.keys(spec)).not.toContain('action');
      expect(Object.keys(spec)).not.toContain('execute');
      expect(['notify', 'create_task']).toContain((spec.proposes as Json).actionId);
      expect((spec.proposes as Json).decisionRequested.toString().length).toBeGreaterThan(0);
      // The SQL a human must add is DOCUMENTATION. Nothing here concatenates it.
      expect(typeof (spec.condition as Json).sqlExpressionNeeded).toBe('string');
      expect((spec.wiringRequired as string[]).length).toBeGreaterThan(0);
    }
  });

  it('only the specs that do not rest on placeholders are offered for registration', async () => {
    const { body } = await get('/monitors');
    const specs = (body.data as Json).monitors as Json[];
    const keys = (body.data as Json).registerableMonitorKeys as string[];
    expect(keys).toHaveLength(2);
    for (const spec of specs) {
      const offered = keys.includes(spec.key as string);
      expect(offered, `${spec.key} is offered while blockedOnPlaceholders=${spec.blockedOnPlaceholders}`)
        .toBe(spec.blockedOnPlaceholders === false);
      if (spec.blockedOnPlaceholders) expect(spec.enabledOnRegistration).toBe(false);
    }
  });

  it('reads no table at all — the specs are code constants', async () => {
    await get('/monitors');
    expect(query).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 6 · THE REFUSALS: BLOCKED CAPTURE, AND THE PENDING MIGRATION                */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a draft that is not a record is refused with its reasons, and nothing is written', () => {
  it('422 with the full form when a win is claimed before acceptance', async () => {
    seedEngagement(ENGAGEMENT_C, 1_000_000, 600_000, 'proposed');
    const { status, body } = await post('/outcome', {
      engagementId: ENGAGEMENT_C, disposition: 'won', reason: 'referral', decidedAt: '2026-07-27',
    });
    expect(status).toBe(422);
    expect(body.code).toBe('CAPTURE_BLOCKED');
    const codes = ((body.data as Json).blockers as Json[]).map((x) => x.code);
    expect(codes).toContain('won_before_acceptance');
    // The refusal carries the fields and the legal reasons, not just a message.
    expect(((body.data as Json).fields as Json[]).length).toBeGreaterThan(0);
    expect(calls.some((x) => /INSERT INTO/.test(x.sql))).toBe(false);
    expect(outcomes.size).toBe(0);
  });

  it('422, not 400, for a negative realised figure — the engine owns that wording', async () => {
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    const { status, body } = await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral',
      realisedPriceCents: -5, decidedAt: '2026-07-27',
    });
    expect(status).toBe(422);
    expect(((body.data as Json).blockers as Json[]).map((x) => x.code)).toContain('negative_realised_figure');
    expect(outcomes.size).toBe(0);
  });

  it('400 for shapes the engine cannot describe, and the probe is never reached', async () => {
    outcomeTableExists = false;
    const bad = await post('/outcome', { engagementId: 'not-a-uuid', disposition: 'won' });
    expect(bad.status).toBe(400);
    const badCents = await post('/outcome', { engagementId: ENGAGEMENT_A, realisedPriceCents: 12.5 });
    expect(badCents.status).toBe(400);
    const badReason = await post('/outcome', { engagementId: ENGAGEMENT_A, reason: 'because' });
    expect(badReason.status).toBe(400);
    const badDate = await post('/outcome', { engagementId: ENGAGEMENT_A, decidedAt: '2026-02-31' });
    expect(badDate.status).toBe(400);
    // Validation runs BEFORE the probe: a malformed request is malformed everywhere.
    expect(query).not.toHaveBeenCalled();
  });
});

describe('while gps_outcome does not exist', () => {
  it('the write answers 503 with the migration named, and writes nothing', async () => {
    outcomeTableExists = false;
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    const { status, body } = await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral', decidedAt: '2026-07-27',
    });
    expect(status).toBe(503);
    expect(body.code).toBe('MIGRATION_PENDING');
    expect((body.migration as Json).file).toBe(OUTCOME_MIGRATION);
    // The DDL travels with the refusal, so the answer is "run one file".
    expect(((body.migration as Json).columns as string[]).length).toBeGreaterThan(8);
    expect(calls.some((x) => /INSERT INTO/.test(x.sql))).toBe(false);
  });

  it('the reads answer 200, well-shaped, and say the book was unreadable', async () => {
    outcomeTableExists = false;
    const wl = await get('/win-loss');
    expect(wl.status).toBe(200);
    expect((wl.body.meta as Json).migrated).toBe(false);
    expect(((wl.body.data as Json).overall as Json).winRatePct).toBeNull();

    const loop = await get('');
    expect(loop.status).toBe(200);
    expect((loop.body.meta as Json).migrated).toBe(false);
    const notices = (loop.body.data as Json).notices as string[];
    expect(notices[0]).toContain(OUTCOME_MIGRATION);
    // "unreadable", not "empty" — the desk must not read this as data loss.
    expect(notices[0]).toContain('not an empty book');

    const margin = await get('/margin');
    expect((margin.body.data as Json).overall).toBeNull();
    const health = await get('/health');
    expect((health.body.data as Json).verdict).toBe('no_outcomes_at_all');
  });

  it('the capture form still works, because it is built from gps_engagement', async () => {
    outcomeTableExists = false;
    seedEngagement(ENGAGEMENT_A, 1_500_000, 900_000);
    const { status, body } = await get(`/outcome/${ENGAGEMENT_A}`);
    expect(status).toBe(200);
    expect((body.meta as Json).outcomeStoreMigrated).toBe(false);
    expect((body.data as Json).quotedMarginCents).toBe(600_000);
    // Distinguishable from "nothing recorded yet", which is the whole point.
    expect((body.meta as Json).pendingMigration).toBe(OUTCOME_MIGRATION);
  });

  it('the write answers 503 for 0047 too, before it looks for the engagement', async () => {
    engagementTableExists = false;
    const { status, body } = await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral', decidedAt: '2026-07-27',
    });
    expect(status).toBe(503);
    expect(body.error).toContain('0047');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 7 · IDEMPOTENCY, ATTRIBUTION, PARAMETERISATION                              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('recording the same close twice corrects one row', () => {
  it('upserts on the primary key rather than adding a second win to the book', async () => {
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    const draft = {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral',
      realisedPriceCents: 900_000, realisedVendorCostCents: 600_000, decidedAt: '2026-07-27',
    };
    await post('/outcome', draft);
    await post('/outcome', { ...draft, realisedPriceCents: 950_000 });

    expect(outcomes.size).toBe(1);
    const insert = calls.find((x) => /INSERT INTO gps_outcome/.test(x.sql));
    expect(insert?.sql).toMatch(/ON CONFLICT \(engagement_id\) DO UPDATE/);

    const { body } = await get('/win-loss');
    // At ~29 engagements a year a duplicated outcome is a 3% error in every rate.
    expect(((body.data as Json).overall as Json).won).toBe(1);
    const margin = await get('/margin');
    expect(((margin.body.data as Json).overall as Json).n).toBe(1);
  });

  it('attributes the row to the authenticated operator, never to a body field', async () => {
    seedEngagement(ENGAGEMENT_A, 1_000_000, 600_000);
    await post('/outcome', {
      engagementId: ENGAGEMENT_A, disposition: 'won', reason: 'referral', decidedAt: '2026-07-27',
      recordedBy: 'somebody-else', recorded_by: 'somebody-else',
    });
    const insert = calls.find((x) => /INSERT INTO gps_outcome/.test(x.sql));
    expect(insert?.params[10]).toBe('nik');
    expect(insert?.params).not.toContain('somebody-else');
  });

  it('binds every value — no identifier or amount is ever in the SQL text', async () => {
    await seedThreeOutcomes();
    await get('');
    expect(calls.length).toBeGreaterThan(4);
    for (const { sql } of calls) {
      expect(sql, 'a uuid appears in SQL text').not.toContain(ENGAGEMENT_A);
      expect(sql, 'a uuid appears in SQL text').not.toContain(CLIENT_A);
      expect(sql, 'an amount appears in SQL text').not.toContain('1500000');
      expect(sql, 'a date appears in SQL text').not.toContain('2026-07-27');
    }
  });

  it('windows the WBR week half-open, so the following Monday is not double-counted', async () => {
    await seedThreeOutcomes();
    await get('');
    const weekQuery = calls.find((x) => /decided_at >= \$1::date/.test(x.sql));
    expect(weekQuery).toBeDefined();
    expect(weekQuery?.sql).toMatch(/decided_at\s+<\s+\(\$1::date \+ INTERVAL '7 days'\)/);
    expect(weekQuery?.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 8 · WHAT THE RESPONSES REFUSE TO CONTAIN                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('absence, asserted', () => {
  it('no response carries a field a client document could occupy', async () => {
    await seedThreeOutcomes();
    for (const path of ['', '/win-loss', '/margin', '/review', '/health', '/monitors', `/outcome/${ENGAGEMENT_A}`]) {
      const { body } = await get(path);
      for (const node of nodes(body)) {
        for (const key of Object.keys(node)) {
          expect(
            /upload|attachment|artifact|blobUrl|fileName|documentUrl/i.test(key),
            `${path} exposes '${key}' — decision D2 (controller vs processor) is unanswered`,
          ).toBe(false);
        }
      }
    }
  });

  it('the volume statement travels on every surface that carries a number', async () => {
    await seedThreeOutcomes();
    for (const path of ['', '/review', '/health', '/monitors']) {
      const { body } = await get(path);
      const volume = (body.data as Json).volume as Json;
      expect(volume, `${path} omits the volume statement`).toBeDefined();
      expect(volume.assumedAnnualEngagementVolume).toBe(29);
      expect(volume.learns).toBe(false);
      expect(volume.adjustsWeights).toBe(false);
      expect(volume.isTrainableDataset).toBe(false);
    }
  });

  it('discloses the survivorship bias on the loop response', async () => {
    await seedThreeOutcomes();
    const { body } = await get('');
    expect(((body.data as Json).notices as string[]).join(' ')).toContain('Cancelled engagements are excluded');
  });
});
