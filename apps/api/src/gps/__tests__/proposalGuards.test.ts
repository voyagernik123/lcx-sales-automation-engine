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
import { PERIMETER_ADVISORY_ACTION, guardEngagementPerimeter } from '../perimeterGuard.js';
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
  perimeter?: 'permitted' | 'prohibited' | 'unreviewed' | 'expired' | 'counsel_required';
  /** The engagement's offer. A position on one offer is not a position on another. */
  offerKey?: string;
  /** False makes the audit insert throw, so the unrecorded-pass path can be exercised. */
  auditWritable?: boolean;
  /** Absent = the underwriting registries do not exist (production today). */
  underwriting?: 'usable' | 'no_partner';
  /** The partner's cost per engagement, so a loss-making price can be built. */
  cardAmountCents?: string;
  status?: string;
  jurisdiction?: string | null;
}

function profileRow(o: Opts) {
  const cls = o.perimeter === 'prohibited' || o.perimeter === 'counsel_required'
    ? o.perimeter
    : 'permitted';
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
    offer_key: o.offerKey ?? 'mica_whitepaper',
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
        // `ok` for `isPerimeterMigrated`, `present` for the guard's own extent probe:
        // one row answers both, because both ask the same question of the same table.
        const there = o.perimeter !== undefined;
        return { rows: [{ ok: there, present: there }], rowCount: 1 };
      }
      if (/count\(\*\)::int AS n FROM gps_jurisdiction_profile/.test(sql)) {
        return { rows: [{ n: o.perimeter === undefined ? 0 : 1 }], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/.test(sql)) {
        if (o.auditWritable === false) throw new Error('audit_log is read-only on this replica');
        return { rows: [], rowCount: 1 };
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

describe('the action path consults the perimeter, and records what it walks past', () => {
  const PRICED = { priceCents: 2_000_000 };

  const advisoryRows = (queries: ReadonlyArray<{ sql: string; params: unknown[] }>) =>
    queries.filter((q) => /INSERT INTO audit_log/.test(q.sql)
      && q.params[1] === PERIMETER_ADVISORY_ACTION);

  /**
   * ── THE OWNER'S DECISION OF 2026-08-02, MEASURED ─────────────────────────────
   * This table used to be called REFUSED and asserted that each of these states
   * turned the action into a 409. Every one of them is the state of production: the
   * matrix is empty, so the desk could not issue a single proposal. The gate now
   * lets them through AND WRITES DOWN THAT IT DID. Both halves are asserted on every
   * row, because either half alone is a worse system than the one before: a pass
   * with no record is a deleted gate, and a record with no pass is the old wall.
   */
  const ADVISORY: ReadonlyArray<[string, Opts, string]> = [
    // The compiled placeholders are malformed as well as expired — `enteredBy` is
    // 'UNASSIGNED' — and `perimeter_malformed` is evaluated first. Both are absence
    // codes, so the pass is the same; the RECORD says which one answered.
    ['no position on record at all — production today', {}, 'perimeter_malformed'],
    ['a position nobody has reviewed', { perimeter: 'unreviewed' }, 'perimeter_unreviewed'],
    ['a position past its review date', { perimeter: 'expired' }, 'perimeter_stale'],
    ['a client with no jurisdiction recorded', { perimeter: 'permitted', jurisdiction: null }, 'perimeter_unknown_jurisdiction'],
  ];

  for (const [name, opts, code] of ADVISORY) {
    it(`issues on ${name}, and records the refusal it did not enforce`, async () => {
      const { pool, queries } = stubPool({ underwriting: 'usable', ...opts });
      const out = await issue().execute(args(pool, PRICED));
      expect(out.status).toBe('proposed');
      expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(true);

      // THE RECORD. One row, naming the code, the actor, the place and the offer.
      const rows = advisoryRows(queries);
      expect(rows.length, 'the advisory pass left no audit row').toBe(1);
      const [actor, , entity, entityId, meta] = rows[0].params;
      expect(actor).toBe('nik');
      expect(entity).toBe('gps_engagement');
      expect(entityId).toBe(ENGAGEMENT_ID);
      const m = JSON.parse(String(meta)) as Record<string, unknown>;
      expect(m.gateCode).toBe(code);
      expect(String(m.gateReason).length).toBeGreaterThan(20);
      expect(m.offerKey).toBe('mica_whitepaper');
      expect(m.jurisdictionInput).toBe(opts.jurisdiction === null ? null : 'liechtenstein');
      expect(m.evaluatedBy).toBe('nik');
      expect(m.legalPositionOnFile).toBe(false);
      expect(String(m.notice)).toMatch(/No legal position on file/);

      /*
       * AND THE STAMP IS ON THE ACTION'S OWN OUTPUT, not only in the audit row.
       * `object_actions` records this result and the desk reads it back, so a proposal
       * that returns a price and no legal-position field reads as cleared work. Three
       * flat keys, because `apps/web/src/components/gps/legalPosition.ts` reads them flat
       * and a key that goes missing renders as a proposal with nothing wrong with it.
       */
      const stamped = out as Record<string, unknown>;
      expect(
        stamped.legalPositionOnFile,
        'gps_proposal_issue returned a proposal with no legalPositionOnFile field, so nothing '
          + 'downstream can tell it was issued with no position on file',
      ).toBe(false);
      expect(String(stamped.legalPositionGateCode)).toBe(code);
      expect(String(stamped.legalPositionNotice)).toMatch(/No legal position on file/);
    });
  }

  /**
   * WHAT ADVISORY DID NOT TOUCH. A prohibition is a human saying no, and an unmet
   * condition is a human saying "not until". Neither is an absence, so neither is
   * softened by the perimeter being empty elsewhere.
   */
  const BLOCKED: ReadonlyArray<[string, Opts, string]> = [
    ['a recorded PROHIBITION', { perimeter: 'prohibited' }, 'service_prohibited'],
    ['a reviewed position whose condition is unmet', { perimeter: 'counsel_required' }, 'counsel_not_engaged'],
  ];

  for (const [name, opts, code] of BLOCKED) {
    it(`still refuses on ${name}, and records no pass`, async () => {
      const { pool, queries } = stubPool({ underwriting: 'usable', ...opts });
      const err = await refusal(issue().execute(args(pool, PRICED)));
      expect(err.code).toBe(code);
      expect(err.status).toBe(409);
      // THE STATE MUST NOT HAVE MOVED. A refusal that already wrote is a warning.
      expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
      expect(advisoryRows(queries).length, 'a blocked act must not record a pass').toBe(0);
    });
  }

  it('refuses when the perimeter itself cannot be read — an unreadable perimeter is not an empty one', async () => {
    // A connection reset on the perimeter table. `isPerimeterMigrated` catches
    // internally and reports "not migrated", so the compiled placeholders answer and
    // the gate reaches `perimeter_stale` — an ABSENCE code, which would now pass. The
    // guard's own extent probe is what stops it: it asks the table directly, the read
    // fails, and a pass that rests on a table nobody could read is refused.
    const { pool, queries } = stubPool({ perimeter: 'permitted', underwriting: 'usable' });
    const boom = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/gps_jurisdiction_profile/.test(sql)) throw new Error('connection reset');
        return pool.query(sql, params);
      },
    } as unknown as pg.Pool;
    const err = await refusal(issue().execute(args(boom, PRICED)));
    expect(err.code).toBe('PERIMETER_UNAVAILABLE');
    expect(queries.some((q) => /UPDATE gps_engagement/.test(q.sql))).toBe(false);
    expect(advisoryRows(queries).length).toBe(0);
  });

  it('refuses the advisory pass it could not write down — an unrecorded pass is no gate', async () => {
    const { pool, queries } = stubPool({ underwriting: 'usable', auditWritable: false });
    const err = await refusal(issue().execute(args(pool, PRICED)));
    expect(err.code).toBe('PERIMETER_ADVISORY_UNRECORDED');
    expect(err.status).toBe(409);
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
    // The refusal carries the stamp too — and here it reads TRUE, because a recorded
    // prohibition IS a legal position on file. The stamp says whether a human has
    // written something down, not whether the answer was yes.
    expect(err.data?.legalPositionOnFile).toBe(true);
    expect(err.data?.legalPositionNotice).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE SELF-HEAL — ADVISORY IS A CONSEQUENCE, NOT A SETTING                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * These call the guard directly rather than through the executor, because the
 * property is about the perimeter alone and the action would drag underwriting into
 * it. Nothing here sets anything: the two halves differ only in what the profile
 * table contains, and there is no third state to configure.
 */
describe('one reviewed position turns its own pair back into a wall', () => {
  const ctx = { evaluatedBy: 'nik', asOf: '2026-08-01T00:00:00.000Z' };

  it('blocks the pair a human wrote down while its neighbour offer stays advisory', async () => {
    // The stored row is (liechtenstein, mica_whitepaper, counsel_required, reviewed,
    // fresh) — one cell of the matrix, filled in by hand.
    const filled = stubPool({ perimeter: 'counsel_required' });
    const decided = await guardEngagementPerimeter(filled.pool, ENGAGEMENT_ID, ctx);
    expect(decided.allowed).toBe(false);
    expect(decided.code).toBe('counsel_not_engaged');
    expect(decided.advisory).toBe(false);
    expect(decided.legalPositionOnFile).toBe(true);
    expect(decided.legalPositionNotice).toBeNull();

    // The engagement beside it sells a DIFFERENT offer in the same jurisdiction. The
    // position above says nothing about it, so it is still advisory — the perimeter
    // heals one cell at a time and not one country at a time.
    const neighbour = stubPool({ perimeter: 'counsel_required', offerKey: 'gtm_sprint' });
    const cl = await guardEngagementPerimeter(neighbour.pool, ENGAGEMENT_ID, ctx);
    expect(cl.allowed).toBe(true);
    expect(cl.advisory).toBe(true);
    expect(cl.legalPositionGateCode).toBe('perimeter_unknown_offer');
    expect(cl.legalPositionOnFile).toBe(false);
    expect(String(cl.legalPositionNotice)).toMatch(/No legal position on file/);
  });

  it('clears outright once the condition that position asks for is met', async () => {
    const { pool } = stubPool({ perimeter: 'permitted' });
    const cl = await guardEngagementPerimeter(pool, ENGAGEMENT_ID, ctx);
    expect(cl.allowed).toBe(true);
    expect(cl.advisory).toBe(false);
    expect(cl.legalPositionOnFile).toBe(true);
    expect(cl.legalPositionNotice).toBeNull();
  });

  it('takes no parameter, flag or setting that could choose advisory operation', async () => {
    // The signature is the proof, as it is for the jurisdiction: an engagement id and
    // a session context. There is nowhere to put an instruction.
    expect(guardEngagementPerimeter.length).toBe(3);
    const { pool } = stubPool({});
    const cl = await guardEngagementPerimeter(pool, ENGAGEMENT_ID, ctx);
    expect(cl.advisory).toBe(true);
    // Same pool, same call, same everything — and the answer came from the table.
    expect(cl.perimeterSource).toBe('compiled_placeholder');
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
