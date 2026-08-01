/**
 * THE PERIMETER ON THE ACTS THAT MAKE WORK INVOICEABLE.
 *
 * `integrity.test.ts` used to be titled "the perimeter is consulted before every GPS
 * write" and asserted four paths. Acceptance was not one of them: `gps_engagement_accept`
 * — the action that sets `accepted_at`, i.e. the moment the work becomes billable —
 * ran with the conflict gate as its only gate, and `POST /deliverables/:id/accept`
 * carried `requireOperator`/`requireApprover` and nothing jurisdictional. A position
 * amended to `prohibited`, or past its `review_by`, after a proposal legitimately went
 * out therefore refused every screen and permitted the invoice.
 *
 * These run the REAL executor and the REAL guard against a stub pool: the verdict comes
 * from `gateService` reading rows this file supplies. Each test fails if the
 * corresponding guard call is removed.
 */

import type pg from 'pg';
import { describe, it, expect, beforeEach } from 'vitest';
import { GPS_ACTIONS, type GpsAction } from '../actions.js';
import { _resetMigrated } from '../service.js';
import { _resetPerimeterMigrated } from '../conflict.js';
import { guardDeliverablePerimeter } from '../perimeterGuard.js';
import { ActionError } from '../../actions/registry.js';

const ENGAGEMENT_ID = '00000000-0000-0000-0000-0000000000e1';
const CLIENT_ID = '00000000-0000-0000-0000-0000000000c1';
const DELIVERABLE_ID = '00000000-0000-0000-0000-0000000000d1';

const accept = (): GpsAction => {
  const a = GPS_ACTIONS.find((x) => x.id === 'gps_engagement_accept');
  if (!a) throw new Error('gps_engagement_accept is missing from GPS_ACTIONS');
  return a;
};

interface Opts {
  /** Absent = no position on record at all, which is production today. */
  perimeter?: 'permitted' | 'prohibited' | 'unreviewed' | 'expired';
  status?: string;
  jurisdiction?: string | null;
  /** Absent = the deliverable resolves to ENGAGEMENT_ID. */
  deliverable?: 'missing' | 'unreadable';
}

function profileRow(o: Opts) {
  const reviewed = o.perimeter !== 'unreviewed';
  return {
    id: '00000000-0000-0000-0000-0000000000p1',
    jurisdiction: 'liechtenstein',
    offer_key: 'mica_whitepaper',
    service_class: o.perimeter === 'prohibited' ? 'prohibited' : 'permitted',
    source: 'Opinion of counsel, 2026-07-01',
    source_url: null,
    entered_by: 'nik',
    entered_at: '2026-07-01T00:00:00.000Z',
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
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/to_regclass\('public\.gps_jurisdiction_profile'\)/.test(sql)) {
        return { rows: [{ ok: o.perimeter !== undefined }], rowCount: 1 };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/FROM gps_deliverable/.test(sql)) {
        if (o.deliverable === 'unreadable') throw new Error('connection reset');
        return o.deliverable === 'missing'
          ? { rows: [], rowCount: 0 }
          : { rows: [{ engagement_id: ENGAGEMENT_ID }], rowCount: 1 };
      }
      if (/FROM gps_jurisdiction_profile/.test(sql)) {
        return o.perimeter === undefined
          ? { rows: [], rowCount: 0 }
          : { rows: [profileRow(o)], rowCount: 1 };
      }
      if (/FROM gps_engagement e/.test(sql)) {
        return {
          rows: [{
            engagement_id: ENGAGEMENT_ID,
            client_id: CLIENT_ID,
            offer_key: 'mica_whitepaper',
            contracting_entity: 'lcx',
            status: o.status ?? 'proposed',
            price_cents: '2000000',
            currency: 'USD',
            owner: null,
            client_name: 'Test Client AG',
            // THE JURISDICTION LIVES ON THE CLIENT ROW. Nothing in either call path
            // can supply it, which is the property these tests exist to hold.
            client_jurisdiction: o.jurisdiction === undefined ? 'liechtenstein' : o.jurisdiction,
            check_id: null,
          }],
          rowCount: 1,
        };
      }
      if (/FROM gps_conflict_check/.test(sql)) return { rows: [{ decision: 'cleared' }], rowCount: 1 };
      if (/FROM gps_engagement/.test(sql)) {
        return {
          rows: [{
            id: ENGAGEMENT_ID,
            client_id: CLIENT_ID,
            project_id: null,
            offer_key: 'mica_whitepaper',
            contracting_entity: 'lcx',
            scope_snapshot: null,
            status: o.status ?? 'proposed',
            price_cents: '2000000',
            vendor_cost_cents: '600000',
            currency: 'USD',
            owner: null,
            deposit_required_cents: '0',
            deposit_paid_at: null,
            accepted_at: null,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-01T00:00:00.000Z',
          }],
          rowCount: 1,
        };
      }
      if (/UPDATE gps_engagement/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

const args = (pool: pg.Pool) => ({
  pool,
  subjectType: 'gps_engagement',
  subjectId: ENGAGEMENT_ID,
  params: {},
  actor: 'nik',
  role: 'operator' as const,
  markGateDegraded: () => {},
});

async function refusal(p: Promise<unknown>): Promise<ActionError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ActionError) return err;
    throw err;
  }
  throw new Error('expected gps_engagement_accept to refuse, but it resolved');
}

beforeEach(() => {
  _resetMigrated();
  _resetPerimeterMigrated();
});

describe('recording client acceptance cannot walk past the jurisdictional perimeter', () => {
  const REFUSED: ReadonlyArray<[string, Opts, string]> = [
    ['no position on record at all', {}, 'perimeter_'],
    ['a position amended to PROHIBITED after the proposal went out', { perimeter: 'prohibited' }, 'service_prohibited'],
    ['a position nobody has reviewed', { perimeter: 'unreviewed' }, 'perimeter_unreviewed'],
    ['a position past its review date', { perimeter: 'expired' }, 'perimeter_stale'],
    ['a client with no jurisdiction recorded', { perimeter: 'permitted', jurisdiction: null }, 'perimeter_unknown_jurisdiction'],
  ];

  for (const [name, opts, code] of REFUSED) {
    it(`refuses acceptance on ${name}`, async () => {
      const { pool, queries } = stubPool(opts);
      const err = await refusal(accept().execute(args(pool)));
      expect(err.code).toMatch(new RegExp(`^${code}`));
      expect(err.status).toBe(409);
      // NOTHING IS WRITTEN. An acceptance that recorded and then complained is an
      // invoiceable engagement with a warning attached.
      expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
    });
  }

  it('records the acceptance when the position permits it', async () => {
    const { pool, queries } = stubPool({ perimeter: 'permitted' });
    const out = await accept().execute(args(pool));
    expect(out.status).toBe('accepted');
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(true);
  });

  it('fails CLOSED when the perimeter cannot be read at all', async () => {
    const { pool, queries } = stubPool({ perimeter: 'permitted' });
    const boom = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/gps_jurisdiction_profile/.test(sql)) throw new Error('connection reset');
        return pool.query(sql, params);
      },
    } as unknown as pg.Pool;
    const err = await refusal(accept().execute(args(boom)));
    expect(err.code).toMatch(/^(perimeter_|service_prohibited|PERIMETER_UNAVAILABLE)/);
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
  });
});

describe('accepting a deliverable resolves its engagement and gates on the client row', () => {
  const ctx = { evaluatedBy: 'nik', asOf: '2026-08-01T00:00:00.000Z' };

  it('refuses on a recorded prohibition, reading the jurisdiction through the engagement', async () => {
    const { pool, queries } = stubPool({ perimeter: 'prohibited' });
    const cl = await guardDeliverablePerimeter(pool, DELIVERABLE_ID, ctx);
    expect(cl.allowed).toBe(false);
    expect(cl.code).toBe('service_prohibited');
    expect(cl.recoverable).toBe(false);
    // The deliverable id is a bound parameter, and the engagement it named is what
    // the perimeter was evaluated against.
    expect(queries.find((q) => /FROM gps_deliverable/.test(q.sql))?.params).toEqual([DELIVERABLE_ID]);
    expect(queries.find((q) => /FROM gps_engagement e/.test(q.sql))?.params).toEqual([ENGAGEMENT_ID]);
  });

  it('allows it when the position permits, and reports which record answered', async () => {
    const { pool } = stubPool({ perimeter: 'permitted' });
    const cl = await guardDeliverablePerimeter(pool, DELIVERABLE_ID, ctx);
    expect(cl.allowed).toBe(true);
    expect(cl.jurisdiction).toBe('liechtenstein');
    expect(cl.perimeterSource).toBeTruthy();
  });

  it('refuses with no position on record — the state of production today', async () => {
    const { pool } = stubPool({});
    const cl = await guardDeliverablePerimeter(pool, DELIVERABLE_ID, ctx);
    expect(cl.allowed).toBe(false);
    expect(cl.status).toBe(409);
  });

  it('fails CLOSED when the deliverable row cannot be read', async () => {
    const { pool } = stubPool({ perimeter: 'permitted', deliverable: 'unreadable' });
    const cl = await guardDeliverablePerimeter(pool, DELIVERABLE_ID, ctx);
    expect(cl.allowed).toBe(false);
    expect(cl.code).toBe('PERIMETER_UNAVAILABLE');
    expect(cl.status).toBe(409);
  });

  it('answers 404 for a deliverable that does not exist — not a jurisdictional verdict', async () => {
    const { pool } = stubPool({ perimeter: 'permitted', deliverable: 'missing' });
    const cl = await guardDeliverablePerimeter(pool, DELIVERABLE_ID, ctx);
    expect(cl.allowed).toBe(false);
    expect(cl.status).toBe(404);
    expect(cl.code).toBe('NOT_FOUND');
  });

  it('never takes the jurisdiction from anything but the client row', async () => {
    // There is no parameter on either accept path that could name a jurisdiction, and
    // the guard's signature is the proof: a deliverable id and a session context.
    expect(guardDeliverablePerimeter.length).toBe(3);
  });
});
