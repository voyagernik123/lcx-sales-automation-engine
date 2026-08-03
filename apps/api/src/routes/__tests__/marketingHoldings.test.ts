import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE THREE READ ROUTES THAT LET ANYONE SEE A HOLDINGS DECLARATION, DRIVEN THROUGH
 *  THE REAL ROUTER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  `marketing_holdings_declaration` (0060) is joined by `loadHoldingsStates` on every
 *  draft, so the Art 91(3)(c) gate has been real since M2 — and nothing could SHOW a
 *  declaration, so nobody could tell whether theirs existed, had expired, or had ever
 *  been amended. Every test here goes through `marketingHoldingsRoutes.request(...)`,
 *  which is the thing that did not exist, so each fails if the route is removed no
 *  matter how well the register beneath it is covered.
 *
 *  THE STUB POOL BEHAVES LIKE POSTGRES WHERE IT MATTERS. `to_regclass` answers for 0060
 *  and `information_schema.columns` for 0065 INDEPENDENTLY, because the interesting
 *  environment is the one with the tables and not the column — the one where a naive
 *  `SELECT d.short_position` would 500 the whole page.
 */

type Call = { sql: string; params: unknown[] };

let calls: Call[] = [];
let tablesPresent = true;
let shortColumnPresent = true;
let chainRows: Array<Record<string, unknown>> = [];
let registerRows: Array<Record<string, unknown>> = [];
let cellRows: Array<Record<string, unknown>> = [];
let anyRows = true;

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  // ONE probe answers both migrations (`probeMigrations`), so the stub answers both
  // flags from one statement — and independently, because the environment that matters
  // is the one with 0060 and without 0065.
  if (/to_regclass/.test(sql)) {
    return { rows: [{ ok: tablesPresent, short_ok: shortColumnPresent }], rowCount: 1 };
  }
  if (/EXISTS \(SELECT 1 FROM marketing_holdings_declaration\) AS any_rows/.test(sql)) {
    return { rows: [{ any_rows: anyRows }], rowCount: 1 };
  }
  // The desk-wide register first: it is the only one ordered by renewal date, and the
  // chain matcher below would otherwise claim it.
  if (/ORDER BY d\.renew_by ASC/.test(sql)) return { rows: registerRows, rowCount: registerRows.length };
  // `listHoldings` addresses the table UNQUALIFIED on purpose — see the comment on that
  // query — so this matcher must not expect an alias.
  if (/ORDER BY declared_at DESC/.test(sql)) return { rows: chainRows, rowCount: chainRows.length };
  if (/WHERE d\.member_id = ANY/.test(sql)) return { rows: cellRows, rowCount: cellRows.length };
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by these routes'); },
}));

const { marketingHoldingsRoutes, MARKETING_HOLDINGS_PATHS } = await import('../marketingHoldings.js');
const {
  _resetAbuseRegisterMigrated,
  _resetHoldingsShortLimbMigrated,
  SHORT_QUESTION_POLICY,
} = await import('../../marketing/abuseRegister.js');

/**
 * THE CONTRACT, READ OFF DISK FROM THE SHARED PACKAGE.
 *
 * `apps/api` cannot import `contracts/holdings.ts` in shipped code — one `"."` export
 * on `@lcx/shared`, and a deep relative specifier fails the emit build with TS6059 — so
 * the route builds its response shapes by hand. This import is legal because the api
 * tsconfig EXCLUDES `src/**` + `*.test.ts` from the emit build, and it is what makes the
 * mirror real rather than a comment: the assertion below compares the live JSON against
 * the interfaces' own key manifest, so dropping a field on either side fails here.
 */
const { HOLDINGS_RESPONSE_KEYS } = await import(
  '../../../../../packages/shared/src/marketing/contracts/holdings.js'
);

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
/** `nik` is an approver on the roster; `sam` is an operator. Both are named humans. */
const APPROVER = `nik@lcx.com:${PASSCODE}`;
const OPERATOR = `sam@lcx.com:${PASSCODE}`;

async function call(path: string, cred: string = OPERATOR) {
  const res = await marketingHoldingsRoutes.request(path, {
    method: 'GET',
    headers: { 'x-api-key': cred },
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** A live declaration row as the chain query returns it. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'dec-1',
    member_id: 'sam',
    asset_symbol: 'SOL',
    holds: true,
    short_position: 'not_asked',
    declared_at: new Date('2026-07-01T00:00:00.000Z'),
    renew_by: new Date('2026-12-01T00:00:00.000Z'),
    supersedes_id: null,
    amendment_reason: null,
    superseded: false,
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  tablesPresent = true;
  shortColumnPresent = true;
  anyRows = true;
  chainRows = [];
  registerRows = [];
  cellRows = [];
  query.mockClear();
  _resetAbuseRegisterMigrated();
  _resetHoldingsShortLimbMigrated();
});

describe('the routes exist, are authenticated, and answer the declared paths', () => {
  it('mounts exactly the three paths it claims, and 401s without a credential', async () => {
    for (const path of MARKETING_HOLDINGS_PATHS) {
      const res = await marketingHoldingsRoutes.request(path, { method: 'GET' });
      expect(res.status, path).toBe(401);
    }
  });

  it('answers the chain path for the caller with no query at all', async () => {
    chainRows = [row()];
    const { status, body } = await call('/holdings');
    expect(status).toBe(200);
    expect(body.memberId).toBe('sam');
    expect(body.viewerIsSubject).toBe(true);
    expect(body.rows).toHaveLength(1);
  });

  it('404s a path it does not own, rather than answering something adjacent', async () => {
    const res = await marketingHoldingsRoutes.request('/holdings/declare', {
      method: 'GET',
      headers: { 'x-api-key': APPROVER },
    });
    expect(res.status).toBe(404);
  });
});

describe('the response shapes match the shared contract, key for key', () => {
  it('returns exactly the chain keys the contract declares', async () => {
    chainRows = [row()];
    const { body } = await call('/holdings');
    expect(Object.keys(body).sort()).toEqual([...HOLDINGS_RESPONSE_KEYS.chain].sort());
    expect(Object.keys(body.rows[0]).sort()).toEqual([...HOLDINGS_RESPONSE_KEYS.row].sort());
  });

  it('returns exactly the cells keys the contract declares', async () => {
    cellRows = [];
    const { body } = await call('/holdings/cells?symbols=SOL');
    expect(Object.keys(body).sort()).toEqual([...HOLDINGS_RESPONSE_KEYS.cells].sort());
    expect(Object.keys(body.cells[0]).sort()).toEqual([...HOLDINGS_RESPONSE_KEYS.cell].sort());
  });

  it('returns exactly the register keys the contract declares', async () => {
    registerRows = [row()];
    const { body } = await call('/holdings/register', APPROVER);
    expect(Object.keys(body).sort()).toEqual([...HOLDINGS_RESPONSE_KEYS.register].sort());
  });

  it('reports the live short-question policy on every response, never omitting it', async () => {
    for (const path of ['/holdings', '/holdings/cells?symbols=SOL', '/holdings/register']) {
      const { body } = await call(path, APPROVER);
      expect(body.shortQuestionPolicy, path).toBe(SHORT_QUESTION_POLICY);
      expect(body.shortQuestionAsked, path).toBe(SHORT_QUESTION_POLICY !== 'not_asked');
    }
  });
});

describe('the authority model is the register\'s, and it is not re-derived here', () => {
  it('refuses an operator reading a colleague, on both per-member routes', async () => {
    const chain = await call('/holdings?memberId=nik');
    expect(chain.status).toBe(403);
    expect(chain.body.code).toBe('HOLDINGS_SELF_OR_APPROVER');
    expect(chain.body.error).toMatch(/Art 91\(3\)\(c\)/);

    const cells = await call('/holdings/cells?symbols=SOL&memberId=nik');
    expect(cells.status).toBe(403);
    expect(cells.body.code).toBe('HOLDINGS_SELF_OR_APPROVER');
  });

  it('refuses a colleague read BEFORE any SQL runs, so nothing leaks by timing', async () => {
    await call('/holdings?memberId=nik');
    await call('/holdings/cells?symbols=SOL&memberId=nik');
    expect(calls).toHaveLength(0);
  });

  it('lets an approver read a named colleague on both routes', async () => {
    // `nik` (approver) reading `sam`. The subject is somebody else, which is the case
    // the operator above was refused for.
    chainRows = [row({ member_id: 'sam' })];
    const chain = await call('/holdings?memberId=sam', APPROVER);
    expect(chain.status).toBe(200);
    expect(chain.body.memberId).toBe('sam');
    expect(chain.body.viewerIsSubject).toBe(false);

    const cells = await call('/holdings/cells?symbols=SOL&memberId=sam', APPROVER);
    expect(cells.status).toBe(200);
    expect(cells.body.memberId).toBe('sam');
    expect(cells.body.cells[0].memberId).toBe('sam');
  });

  it('refuses the desk-wide register to an operator, and answers it for an approver', async () => {
    const denied = await call('/holdings/register');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('HOLDINGS_APPROVER_ONLY');
    expect(calls).toHaveLength(0);

    registerRows = [row()];
    const allowed = await call('/holdings/register', APPROVER);
    expect(allowed.status).toBe(200);
    expect(allowed.body.rows).toHaveLength(1);
  });
});

describe('absent data refuses, and the three absences are told apart', () => {
  it('says the register is ABSENT, not empty, when 0060 has not been applied', async () => {
    tablesPresent = false;
    const { body } = await call('/holdings');
    expect(body.registerPresent).toBe(false);
    // NOT reported as empty: an unapplied migration and a register nobody has filed in
    // need two different humans to do two different things.
    expect(body.registerEmpty).toBe(false);
    expect(body.migration).toBe('0060_marketing_abuse.sql');
    expect(body.rows).toEqual([]);
  });

  it('says the register is EMPTY when the tables exist and hold nothing', async () => {
    chainRows = [];
    const { body } = await call('/holdings');
    expect(body.registerPresent).toBe(true);
    expect(body.registerEmpty).toBe(true);
  });

  it('reports 0065 separately, and never claims the short limb on a database without it', async () => {
    shortColumnPresent = false;
    chainRows = [row({ short_position: undefined })];
    const { body } = await call('/holdings');
    expect(body.registerPresent).toBe(true);
    expect(body.shortLimbMigrated).toBe(false);
    expect(body.shortMigration).toBe('0065_marketing_holdings_position.sql');
    // The missing column reads as NOT ASKED — true, and it refuses. Never 'no_short'.
    expect(body.rows[0].shortPosition).toBe('not_asked');
  });

  it('does not select a column that does not exist, which is what would 500 the page', async () => {
    shortColumnPresent = false;
    await call('/holdings');
    const reads = calls.filter((q) => /FROM marketing_holdings_declaration/.test(q.sql));
    expect(reads.length).toBeGreaterThan(0);
    for (const q of reads) expect(q.sql).not.toMatch(/short_position/);
  });

  it('selects the column once 0065 is there', async () => {
    shortColumnPresent = true;
    await call('/holdings');
    // Unqualified in this query, qualified in the engine's join — both are the same
    // column, and what matters is that it is read at all once it exists.
    expect(calls.some((q) => /\bshort_position\b/.test(q.sql))).toBe(true);
  });
});

describe('NOT DECLARED is said out loud, and silence is never dressed as clear', () => {
  it('refuses a cells read with no symbols rather than answering with an empty list', async () => {
    const { status, body } = await call('/holdings/cells');
    expect(status).toBe(400);
    expect(body.code).toBe('HOLDINGS_SYMBOLS_REQUIRED');
    expect(body.error).toMatch(/clean bill of health/);
    expect(calls).toHaveLength(0);
  });

  it('reports a symbol nobody declared as not_declared, and lists it as dangerous', async () => {
    cellRows = [];
    const { body } = await call('/holdings/cells?symbols=SOL,ETH');
    expect(body.cells.map((c: any) => c.state)).toEqual(['not_declared', 'not_declared']);
    expect(body.notDeclared).toEqual(['SOL', 'ETH']);
    // Never a defaulted `false`, on either limb.
    expect(body.cells[0].holds).toBeNull();
    expect(body.cells[0].shortPosition).toBeNull();
  });

  it('reports register_absent as dangerous too, not as an empty answer', async () => {
    tablesPresent = false;
    const { body } = await call('/holdings/cells?symbols=SOL');
    expect(body.cells[0].state).toBe('register_absent');
    expect(body.notDeclared).toEqual(['SOL']);
  });

  it('withholds BOTH limbs on a stale declaration and reports it as not_declared', async () => {
    cellRows = [{
      member_id: 'sam',
      asset_symbol: 'SOL',
      holds: false,
      short_position: 'no_short',
      declared_at: new Date('2020-01-01T00:00:00.000Z'),
      renew_by: new Date('2020-02-01T00:00:00.000Z'),
      amendments: 0,
    }];
    const { body } = await call('/holdings/cells?symbols=SOL');
    const cell = body.cells[0];
    expect(cell.state).toBe('not_declared');
    expect(cell.stale).toBe(true);
    expect(cell.holds).toBeNull();
    // THE POINT: a stale 'no_short' must not survive as a cleared bearish limb.
    expect(cell.shortPosition).toBeNull();
    expect(body.notDeclared).toEqual(['SOL']);
  });
});

describe('the amendment chain is returned, because the old value is the evidence', () => {
  it('returns superseded rows alongside the current one, flagged', async () => {
    chainRows = [
      row({ id: 'dec-2', holds: false, supersedes_id: 'dec-1', amendment_reason: 'position_closed' }),
      row({ id: 'dec-1', holds: true, superseded: true }),
    ];
    const { body } = await call('/holdings');
    expect(body.rows.map((r: any) => [r.id, r.superseded])).toEqual([['dec-2', false], ['dec-1', true]]);
    expect(body.rows[0].supersedesId).toBe('dec-1');
    expect(body.rows[0].amendmentReason).toBe('position_closed');
    // The prior value is still readable, which is the whole reason the table is append-only.
    expect(body.rows[1].holds).toBe(true);
  });
});

describe('the desk census names a gap without inventing a position', () => {
  it('lists roster members with no current row, and claims only that', async () => {
    registerRows = [row({ member_id: 'nik' })];
    const { body } = await call('/holdings/register', APPROVER);
    expect(body.membersWithNothingDeclared).not.toContain('nik');
    expect(body.membersWithNothingDeclared).toContain('sam');
    // `operator` is not a named human on the roster and cannot declare, so it cannot
    // appear as a member who failed to.
    expect(body.membersWithNothingDeclared).not.toContain('operator');
  });
});
