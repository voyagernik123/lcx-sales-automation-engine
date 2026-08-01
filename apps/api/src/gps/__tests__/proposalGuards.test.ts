/**
 * THE SECOND DOOR ONTO `status = 'proposed'`.
 *
 * `POST /v1/gps/engagements/:id/proposal` carries three middlewares —
 * `requireOperator`, `requirePerimeterClearance`, `requireUnderwritingClearance`.
 * `POST /v1/actions/gps_proposal_issue/invoke` reaches the SAME transition through
 * `invokeAction`, whose only middleware is `requireOperator`. For the whole of
 * Phases 6–12 the two guards existed on one door and not the other, and the
 * measured consequence was an engagement whose server-side underwriting gives
 * pLoss 0.9154 and p50 −308,151 being refused 409 by the REST route and issued 200
 * by the action.
 *
 * Every test here runs the REAL executor against the REAL engines over a stub pool.
 * Nothing is mocked: the perimeter decision comes from `gateService` reading rows
 * this file supplies, and the block decision comes from a 200,000-sample simulation
 * over a rate card this file supplies. Each one fails if the corresponding
 * `assert*Cleared` call is deleted from the executor.
 */

import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { describe, it, expect, beforeEach } from 'vitest';
import { GPS_ACTIONS, type GpsAction } from '../actions.js';
import { _resetMigrated } from '../service.js';
import { _resetPerimeterMigrated } from '../conflict.js';
import { _resetUnderwritingProbes } from '../underwrite.js';
import { ActionError } from '../../actions/registry.js';

const issue = (): GpsAction => {
  const a = GPS_ACTIONS.find((x) => x.id === 'gps_proposal_issue');
  if (!a) throw new Error('gps_proposal_issue is missing from GPS_ACTIONS');
  return a;
};

const ENGAGEMENT_ID = '00000000-0000-0000-0000-0000000000e1';
const CLIENT_ID = '00000000-0000-0000-0000-0000000000c1';

interface Opts {
  /** Absent = no position on record at all (production today). */
  perimeter?: 'permitted' | 'prohibited' | 'unreviewed' | 'expired';
  /** Absent = the underwriting registries do not exist (production today). */
  underwriting?: 'usable' | 'no_partner';
  /** The partner's cost per engagement, so a loss-making price can be built. */
  cardAmountCents?: string;
  status?: string;
  jurisdiction?: string | null;
}

function profileRow(o: Opts) {
  const cls = o.perimeter === 'prohibited' ? 'prohibited' : 'permitted';
  const reviewed = o.perimeter !== 'unreviewed';
  return {
    id: '00000000-0000-0000-0000-0000000000p1',
    jurisdiction: 'liechtenstein',
    offer_key: 'mica_whitepaper',
    service_class: cls,
    source: 'Opinion of counsel, 2026-07-01',
    source_url: null,
    entered_by: 'nik',
    entered_at: '2026-07-01T00:00:00.000Z',
    // An `expired` position is a position past its review date. Everything else
    // about it is well formed, which is the point: staleness alone must refuse.
    review_by: o.perimeter === 'expired' ? '2026-07-02T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
    note: 'Fixture position.',
    reviewed_by: reviewed ? 'monty' : null,
    reviewed_at: reviewed ? '2026-07-02T00:00:00.000Z' : null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
  };
}

function stubPool(o: Opts = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const engagement = {
    id: ENGAGEMENT_ID,
    client_id: CLIENT_ID,
    project_id: null,
    offer_key: 'mica_whitepaper',
    contracting_entity: 'lcx',
    scope_snapshot: null,
    status: o.status ?? 'draft',
    price_cents: '0',
    vendor_cost_cents: '600000',
    currency: 'USD',
    owner: null,
    deposit_required_cents: '0',
    deposit_paid_at: null,
    accepted_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/to_regclass\('public\.gps_jurisdiction_profile'\)/.test(sql)) {
        return { rows: [{ ok: o.perimeter !== undefined }], rowCount: 1 };
      }
      if (/to_regclass\('public\.gps_engagement'\)/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/to_regclass\('public\.gps_rate_card'\)/.test(sql)) {
        const on = o.underwriting !== undefined;
        return { rows: [{ rate_cards: on, effort_triples: on }], rowCount: 1 };
      }
      if (/information_schema\.columns/.test(sql)) {
        return o.underwriting !== undefined ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (/FROM gps_jurisdiction_profile/.test(sql)) {
        return o.perimeter === undefined
          ? { rows: [], rowCount: 0 }
          : { rows: [profileRow(o)], rowCount: 1 };
      }
      if (/FROM gps_engagement e/.test(sql)) {
        return {
          rows: [{
            engagement_id: engagement.id,
            client_id: engagement.client_id,
            offer_key: engagement.offer_key,
            contracting_entity: 'lcx',
            status: engagement.status,
            price_cents: engagement.price_cents,
            currency: 'USD',
            owner: null,
            client_name: 'Test Client AG',
            client_jurisdiction: o.jurisdiction === undefined ? 'liechtenstein' : o.jurisdiction,
            check_id: null,
          }],
          rowCount: 1,
        };
      }
      if (/SELECT partner_id FROM gps_engagement/.test(sql)) {
        return { rows: [{ partner_id: o.underwriting === 'no_partner' ? null : 'p_anna' }], rowCount: 1 };
      }
      if (/FROM gps_rate_card/.test(sql)) {
        return {
          rows: [{
            partner_id: 'p_anna', offer_key: 'mica_whitepaper', unit: 'day_rate',
            amount_cents: o.cardAmountCents ?? '60000', expected_units: '8',
            hours_per_day: null, fixed_cost_cents: '0', currency: 'USD',
            valid_until: '2099-01-01T00:00:00.000Z', stated_by: 'nik',
            stated_at: '2026-07-01T00:00:00.000Z', partner_label: 'Anna',
          }],
          rowCount: 1,
        };
      }
      if (/FROM gps_effort_triple/.test(sql)) {
        return {
          rows: [{
            optimistic_days: '6', likely_days: '8', pessimistic_days: '11',
            stated_by: 'nik', stated_at: '2026-07-01T00:00:00.000Z',
          }],
          rowCount: 1,
        };
      }
      if (/FROM gps_conflict_check/.test(sql)) return { rows: [{ decision: 'cleared' }], rowCount: 1 };
      if (/FROM gps_engagement/.test(sql)) return { rows: [engagement], rowCount: 1 };
      if (/FROM object_actions/.test(sql)) return { rows: [], rowCount: 0 };
      if (/UPDATE gps_engagement/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

function args(pool: pg.Pool, params: Record<string, unknown>) {
  return {
    pool,
    subjectType: 'gps_engagement',
    subjectId: ENGAGEMENT_ID,
    params,
    actor: 'nik',
    role: 'operator' as const,
    markGateDegraded: () => {},
  };
}

async function refusal(p: Promise<unknown>): Promise<ActionError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ActionError) return err;
    throw err;
  }
  throw new Error('expected gps_proposal_issue to refuse, but it resolved');
}

beforeEach(() => {
  _resetMigrated();
  _resetPerimeterMigrated();
  _resetUnderwritingProbes();
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE PERIMETER GATE                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the action path cannot walk past the jurisdictional perimeter', () => {
  const PRICED = { priceCents: 2_000_000 };

  /**
   * Each row is a state `gateService` refuses, and each is reachable in production:
   * the matrix is empty today, positions are entered unreviewed by construction,
   * and every compiled placeholder is expired on arrival.
   */
  const REFUSED: ReadonlyArray<[string, Opts, string]> = [
    ['no position on record at all', {}, 'perimeter_'],
    ['a recorded PROHIBITION', { perimeter: 'prohibited' }, 'service_prohibited'],
    ['a position nobody has reviewed', { perimeter: 'unreviewed' }, 'perimeter_unreviewed'],
    ['a position past its review date', { perimeter: 'expired' }, 'perimeter_stale'],
    ['a client with no jurisdiction recorded', { perimeter: 'permitted', jurisdiction: null }, 'perimeter_unknown_jurisdiction'],
  ];

  for (const [name, opts, code] of REFUSED) {
    it(`refuses on ${name}`, async () => {
      const { pool, queries } = stubPool({ underwriting: 'usable', ...opts });
      const err = await refusal(issue().execute(args(pool, PRICED)));
      expect(err.code).toMatch(new RegExp(`^${code}`));
      expect(err.status).toBe(409);
      // THE STATE MUST NOT HAVE MOVED. A refusal that already wrote is a warning.
      expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
    });
  }

  it('refuses when the perimeter itself cannot be read — it does not fail open', async () => {
    // A connection reset on the perimeter table. The probe catches internally and
    // reports "not migrated", so the compiled placeholders answer — and they are
    // expired-on-arrival and double-locked, so the gate still refuses. Whichever way
    // the failure lands, the required property is the same: a perimeter that could
    // not be read is a refusal, and nothing is written.
    const { pool, queries } = stubPool({ perimeter: 'permitted', underwriting: 'usable' });
    const boom = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/gps_jurisdiction_profile/.test(sql)) throw new Error('connection reset');
        return pool.query(sql, params);
      },
    } as unknown as pg.Pool;
    const err = await refusal(issue().execute(args(boom, PRICED)));
    expect(err.code).toMatch(/^(perimeter_|service_prohibited|PERIMETER_UNAVAILABLE)/);
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });

  it('carries the whole gate trail on the refusal, not just a boolean (D1/D2)', async () => {
    const { pool } = stubPool({ perimeter: 'prohibited', underwriting: 'usable' });
    const err = await refusal(issue().execute(args(pool, PRICED)));
    const gates = err.data?.gates as ReadonlyArray<{ code: string; passed: boolean }> | null;
    expect(Array.isArray(gates)).toBe(true);
    expect(gates!.find((g) => g.code === 'service_prohibited')!.passed).toBe(false);
    // Not recoverable: a recorded prohibition is a wall, not a task.
    expect(err.data?.recoverable).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE UNDERWRITING GUARD                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the action path cannot walk past shouldBlockIssue', () => {
  it('BLOCKS the founder loss case the REST route already refused', async () => {
    // The price CLEARS the discount gate — $6,100 against the $6,000 cost on the row
    // is a positive margin, so no approver is needed and the cheap check waves it
    // through. Only the distribution catches it: the partner's card is $800/day and
    // the effort triple is (6, 8, 11) days, so the expected cost is $6,400 and the
    // pessimistic tail is $8,800. P(loss) is far above the 20% ceiling.
    //
    // This is the exact shape the action path used to issue at 200 while the REST
    // route refused it at 409.
    const { pool, queries } = stubPool({
      perimeter: 'permitted', underwriting: 'usable', cardAmountCents: '80000',
    });
    const err = await refusal(issue().execute(args(pool, { priceCents: 610_000 })));
    expect(err.code).toBe('UNDERWRITING_BLOCKED');
    expect(err.status).toBe(409);
    const uw = err.data?.underwriting as { pLoss: number | null } | null;
    expect(uw?.pLoss).toBeGreaterThan(0.2);
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });

  it('refuses when no partner is assigned — an unknown margin is not a permitted one', async () => {
    const { pool, queries } = stubPool({ perimeter: 'permitted', underwriting: 'no_partner' });
    const err = await refusal(issue().execute(args(pool, { priceCents: 2_000_000 })));
    expect(err.code).toBe('UNDERWRITING_NO_PARTNER');
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });

  it('refuses while the underwriting registries are unapplied, rather than assuming', async () => {
    const { pool, queries } = stubPool({ perimeter: 'permitted' });
    const err = await refusal(issue().execute(args(pool, { priceCents: 2_000_000 })));
    expect(err.code).toBe('UNDERWRITING_PARTNER_UNASSIGNABLE');
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });

  it('underwrites the price being WRITTEN, not the one the row still holds', async () => {
    // The row's price is 0. The REST route never changes a price, so reading the row
    // is right there; this executor sets it in the same statement that moves the
    // status, so reading the row would underwrite a number about to be replaced —
    // and 0 would refuse every first issue with NO_PRICE.
    const { pool, queries } = stubPool({ perimeter: 'permitted', underwriting: 'usable' });
    const out = await issue().execute(args(pool, { priceCents: 2_000_000 }));
    expect(out.status).toBe('proposed');
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(true);
  });

  it('fails CLOSED when the underwriting throws', async () => {
    const { pool } = stubPool({ perimeter: 'permitted', underwriting: 'usable' });
    const boom = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM gps_rate_card/.test(sql)) throw new Error('statement timeout');
        return pool.query(sql, params);
      },
    } as unknown as pg.Pool;
    const err = await refusal(issue().execute(args(boom, { priceCents: 2_000_000 })));
    expect(err.code).toBe('UNDERWRITING_UNAVAILABLE');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE COST SIDE OF THE DISCOUNT GATE                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the below-cost gate is not self-authorising', () => {
  it('refuses vendorCostCents: 0 at the schema — no partner delivers for nothing', () => {
    // The exploit: `{priceCents: 400000, vendorCostCents: 0}` on an offer whose
    // recorded cost is $6,000 made `margin` positive, cleared the gate with no
    // approver, and persisted a row claiming 100% margin on a $2,000 loss.
    const parsed = issue().paramsSchema.safeParse({ priceCents: 400_000, vendorCostCents: 0 });
    expect(parsed.success).toBe(false);
  });

  it('evaluates the gate against the cost ALREADY ON THE ROW as well as the supplied one', async () => {
    // Supplied cost 1c (schema-legal), row cost $6,000, price $4,000. Against the
    // supplied number the margin looks like 99.9%; against the row it is a $2,000
    // loss, and the worse answer must stand.
    const { pool, queries } = stubPool({ perimeter: 'permitted', underwriting: 'usable' });
    const err = await refusal(issue().execute(args(pool, { priceCents: 400_000, vendorCostCents: 1 })));
    expect(err.code).toMatch(/DISCOUNT_APPROVAL_REQUIRED|UNDERWRITING_BLOCKED/);
    const reasons = (err.data?.reasons as string[] | undefined) ?? [];
    if (err.code === 'DISCOUNT_APPROVAL_REQUIRED') {
      expect(reasons.join(' ')).toMatch(/ALREADY RECORDED/);
    }
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* SOURCE-LEVEL: THE GUARDS PRECEDE THE WRITE                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('both guards are installed, in front of the UPDATE', () => {
  const src = readFileSync(new URL('../actions.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('const gps_proposal_issue'), src.indexOf('const gps_discount_approve'));

  it('calls the perimeter guard and the underwriting guard', () => {
    expect(body).toContain('assertPerimeterCleared(');
    expect(body).toContain('assertUnderwritingCleared(');
  });

  it('calls both BEFORE the statement that writes status = proposed', () => {
    const update = body.indexOf('UPDATE gps_engagement');
    expect(update).toBeGreaterThan(0);
    expect(body.indexOf('assertPerimeterCleared(')).toBeLessThan(update);
    expect(body.indexOf('assertUnderwritingCleared(')).toBeLessThan(update);
  });

  it('takes no override argument on either guard', () => {
    for (const word of ['force', 'override', 'bypass', 'acceptRisk', 'skipPerimeter', 'skipUnderwriting']) {
      expect(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), word).not.toContain(word);
    }
  });
});
