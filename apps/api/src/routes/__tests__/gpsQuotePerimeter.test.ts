import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE QUOTE DESK, THROUGH THE REAL ROUTE, UNDER THE OWNER'S DECISION OF 2026-08-02.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS FILE EXISTS TO PIN. `gps_jurisdiction_profile` is empty in production and
 * has never held a row. When the pen-test fix made the perimeter gate load-bearing,
 * `POST /v1/gps/quote` began refusing 409 for EVERY jurisdiction and every offer — the
 * desk could not price anything at all. The owner's decision was to let the acts
 * through, stamp every artifact "no legal position on file", and log each one.
 *
 * `proposalGuards.test.ts` and `acceptancePerimeter.test.ts` cover the governed-action
 * path. NOTHING covered the REST quote route behaviourally: `integrity.test.ts:313`
 * reads its source for a `perimeterClearanceFor(` call, which cannot tell an advisory
 * pass from a refusal and cannot see whether the STAMP reaches the response body. That
 * is the gap here, and it is the one that matters most — a quote is the artifact a
 * client is shown, so a price returned without the stamp reads as cleared work.
 *
 * THREE PROPERTIES, one per describe below:
 *   1. an unlisted jurisdiction SUCCEEDS, and the body carries the stamp;
 *   2. a recorded PROHIBITION still refuses — a human's "no" is not softened by the
 *      emptiness of the rest of the matrix;
 *   3. an advisory pass that cannot be RECORDED refuses. That is the whole difference
 *      between an advisory gate and a deleted one.
 *
 * The route runs for real against a stub pool: the verdict comes from `gateService`
 * reading rows this file supplies, and every assertion fails if the stamp spread or the
 * guard call is removed from `routes/gps.ts`.
 */

const CLIENT_ID = '00000000-0000-0000-0000-0000000000c1';

/** Absent = no row at all, which is the state of production. */
type Position = 'absent' | 'permitted' | 'prohibited' | 'unreadable';

let position: Position = 'absent';
let auditWritable = true;
let calls: Array<{ sql: string; params: unknown[] }> = [];

const profileRow = () => ({
  id: '00000000-0000-0000-0000-0000000000p1',
  jurisdiction: 'liechtenstein',
  offer_key: 'mica_whitepaper',
  service_class: position === 'prohibited' ? 'prohibited' : 'permitted',
  source: 'Opinion of counsel, 2026-07-01',
  source_url: null,
  entered_by: 'nik',
  entered_at: '2026-07-01T00:00:00.000Z',
  review_by: '2099-01-01T00:00:00.000Z',
  note: 'Fixture position.',
  reviewed_by: 'monty',
  reviewed_at: '2026-07-02T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
});

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  if (/to_regclass\('public\.gps_jurisdiction_profile'\)/.test(sql)) {
    // 'unreadable' reports the table as PRESENT and then fails every read of it, which is
    // the realistic shape: a live table and a dropped connection.
    const present = position !== 'absent';
    return { rows: [{ present, ok: present }], rowCount: 1 };
  }
  if (/to_regclass/.test(sql)) return { rows: [{ ok: true, present: true }], rowCount: 1 };
  // The extent probe, answered BEFORE the generic profile read: an absent position may
  // only pass advisory once the perimeter is confirmed empty.
  if (/count\(\*\)::int AS n FROM gps_jurisdiction_profile/.test(sql)) {
    if (position === 'unreadable') throw new Error('connection reset');
    return { rows: [{ n: position === 'absent' ? 0 : 1 }], rowCount: 1 };
  }
  if (/FROM gps_jurisdiction_profile/.test(sql)) {
    // A gate that permits what it could not evaluate is the door every bypass uses.
    if (position === 'unreadable') throw new Error('connection reset');
    return { rows: position === 'absent' ? [] : [profileRow()], rowCount: position === 'absent' ? 0 : 1 };
  }
  // `clientJurisdiction` — the row the gate reads the place from. Never a body field.
  if (/FROM gps_client/.test(sql)) {
    return { rows: [{ jurisdiction: 'liechtenstein' }], rowCount: 1 };
  }
  if (/INSERT INTO audit_log/.test(sql)) {
    if (!auditWritable) throw new Error('audit_log is read only');
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  closeDb: async () => {},
  getDb: () => {
    throw new Error('getDb is not used by the GPS quote route');
  },
}));

const { gpsRoutes } = await import('../gps.js');
const { PERIMETER_ADVISORY_ACTION } = await import('../../gps/perimeterGuard.js');
const { _resetMigrated } = await import('../../gps/service.js');
const { _resetPerimeterMigrated } = await import('../../gps/conflict.js');

/**
 * THE DESK SIGN-IN, so the actor on the audit row is a real roster member and not the
 * generic machine principal. `requireOperator` runs for real — measured: seeding
 * `c.get('operator')` through Hono's third `request()` argument does NOT work (that
 * argument is Env bindings, not context vars) and every call came back 401, which is
 * why the credential is supplied the way a browser supplies it.
 *
 * The workspace gate is NOT in front of this router — it is installed on the `/v1/gps`
 * prefix in app.ts — so requesting `gpsRoutes` directly exercises the route and its own
 * middleware. `gpsArtifact.test.ts` owns the compartment-gate half.
 */
const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const CREDENTIAL = `nik@lcx.com:${PASSCODE}`;

async function quote(body: Record<string, unknown>) {
  const res = await gpsRoutes.request('/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CREDENTIAL },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

const advisoryRows = () => calls.filter((c) => /INSERT INTO audit_log/.test(c.sql) && c.params[1] === PERIMETER_ADVISORY_ACTION);

beforeEach(() => {
  calls = [];
  position = 'absent';
  auditWritable = true;
  query.mockClear();
  _resetMigrated();
  _resetPerimeterMigrated();
});

const PRICED = { clientId: CLIENT_ID, offerKey: 'mica_whitepaper', priceCents: 2_000_000, vendorCostCents: 600_000 };

describe('a quote in a jurisdiction nobody has entered a position for', () => {
  it('SUCCEEDS, and the price comes back', async () => {
    const { status, body } = await quote(PRICED);
    expect(
      status,
      'the quote desk refused a price in an unlisted jurisdiction. Every jurisdiction is '
        + 'unlisted — the matrix is empty — so this is the desk being unable to quote at all.',
    ).toBe(200);
    expect((body.data as Record<string, unknown>).priceCents).toBe(2_000_000);
  });

  it('carries the stamp on the ALLOWED body, flat, where the web reads it', async () => {
    const { body } = await quote(PRICED);
    const data = body.data as Record<string, unknown>;
    // Flat and plainly named: `apps/web/src/components/gps/legalPosition.ts` reads these
    // keys to print the notice beside the price, and an absent key renders as a quote
    // that looks cleared.
    expect(
      data.legalPositionOnFile,
      'a price was returned with no legalPositionOnFile field. The refusal used to carry the '
        + 'reason and the success carried nothing, which was safe only while there were no '
        + 'successes without a position. There are now.',
    ).toBe(false);
    expect(String(data.legalPositionGateCode)).toMatch(/^perimeter_/);
    expect(String(data.legalPositionNotice)).toMatch(/No legal position on file/);
  });

  it('reports the pass as advisory in meta, separately from allowed', async () => {
    const { body } = await quote(PRICED);
    const meta = body.meta as Record<string, unknown>;
    const perimeter = meta.perimeter as Record<string, unknown>;
    // Two different facts: the act proceeded AND the gate refused it. One boolean for
    // both is the conflation this whole change is about.
    expect(perimeter.allowed).toBe(true);
    expect(perimeter.advisory).toBe(true);
    expect(String(perimeter.gateCode)).toMatch(/^perimeter_/);
  });

  it('writes the refusal it did not enforce to audit_log, with the code and the actor', async () => {
    await quote(PRICED);
    const rows = advisoryRows();
    expect(rows.length, 'a quote was priced with no position on file and nothing recorded it').toBe(1);
    const [actor, , , , meta] = rows[0]!.params;
    expect(actor).toBe('nik');
    const m = JSON.parse(String(meta)) as Record<string, unknown>;
    expect(String(m.gateCode)).toMatch(/^perimeter_/);
    expect(m.offerKey).toBe('mica_whitepaper');
    expect(m.jurisdictionKey).toBe('liechtenstein');
    expect(m.legalPositionOnFile).toBe(false);
    expect(m.evaluatedBy).toBe('nik');
    // The row must say what it is not, in words, so nobody reads it as an authorisation.
    expect(String(m.note)).toMatch(/not an authorisation/i);
  });

  it('reads the jurisdiction from the client row, never from the request', async () => {
    // A caller who could name the jurisdiction their quote is gated against could name
    // a permitted one. The body says Malta; the row says Liechtenstein.
    await quote({ ...PRICED, jurisdiction: 'malta' });
    const m = JSON.parse(String(advisoryRows()[0]!.params[4])) as Record<string, unknown>;
    expect(m.jurisdictionKey).toBe('liechtenstein');
  });
});

describe('a human decision still stops the quote', () => {
  it('refuses a recorded PROHIBITION, and records no pass', async () => {
    position = 'prohibited';
    const { status, body } = await quote(PRICED);
    expect(
      status,
      'a jurisdiction recorded as PROHIBITED was quoted anyway. The emptiness of the rest of '
        + 'the matrix is not an argument against a human who wrote down that this is forbidden.',
    ).toBe(409);
    expect(body.code).toBe('service_prohibited');
    // The refusal carries the stamp too, and the trail rather than a boolean.
    const data = body.data as Record<string, unknown>;
    expect(data.legalPositionOnFile).toBe(true);
    expect(data.gates).toBeTruthy();
    expect(advisoryRows().length, 'a blocked quote must not record an advisory pass').toBe(0);
  });

  it('allows it, unstamped as an absence, when the position permits', async () => {
    position = 'permitted';
    const { status, body } = await quote(PRICED);
    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;
    // A real reviewed position exists, so there is no notice to print.
    expect(data.legalPositionOnFile).toBe(true);
    expect(data.legalPositionNotice).toBeNull();
    expect((body.meta as Record<string, unknown>).perimeter).toMatchObject({ advisory: false });
    expect(advisoryRows().length).toBe(0);
  });
});

describe('the gate still exists', () => {
  it('refuses when the advisory pass cannot be recorded', async () => {
    auditWritable = false;
    const { status, body } = await quote(PRICED);
    expect(
      status,
      'the record of the pass could not be written and the quote was priced anyway. An '
        + 'unrecorded pass is indistinguishable from no gate at all.',
    ).toBe(409);
    expect(body.code).toBe('PERIMETER_ADVISORY_UNRECORDED');
  });

  it('refuses when the perimeter itself cannot be read — unreadable is not empty', async () => {
    /*
     * An absence code produced from a table nobody could read is not an absence.
     * `isPerimeterMigrated` catches internally and reports "not migrated", so the
     * COMPILED PLACEHOLDERS answer and the gate lands on an absence code — which would
     * now pass. `readPerimeterExtent` is what stops it: it asks the table directly, the
     * read fails, and a pass resting on a table nobody could read is refused.
     *
     * This is the assertion that keeps advisory operation a consequence of the perimeter
     * being EMPTY rather than of the check not happening.
     */
    position = 'unreadable';
    const { status, body } = await quote(PRICED);
    expect(status).toBe(409);
    expect(body.code).toBe('PERIMETER_UNAVAILABLE');
    expect(advisoryRows().length, 'an unreadable perimeter recorded a pass').toBe(0);
  });
});
