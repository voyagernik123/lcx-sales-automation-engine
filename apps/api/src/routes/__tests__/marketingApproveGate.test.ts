import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CLEARANCE RE-GATE, THROUGH THE REAL ROUTE — because it had never once run.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `POST /v1/marketing/draft/:id/approve` re-reads the stored draft and re-gates it, and
 * the paragraph above that code argues at length for why: the STATE moves under text that
 * has not changed, so a draft cleared at 09:00 naming SOL is not clear at 11:00 if SOL
 * entered `mnpi_pending` at 10:00.
 *
 * It selected a column that does not exist. `marketing_reply_draft` holds `body`
 * (0046:99); the SELECT asked for `text`, no later migration adds one, and Postgres
 * answers `column "text" does not exist`. The catch at the foot of the handler turned that
 * into a generic 500, so approve was wholly unusable on any real database and the re-gate
 * had never executed once.
 *
 * WHY NOTHING CAUGHT IT: `marketing/__tests__/outboundGateCoverage.test.ts` asserted the
 * SQL by grep — `expect(body).toMatch(/SELECT reply_id, text FROM marketing_reply_draft/)`
 * — so the only test watching this line PINNED THE DEFECT. A test that reads source text
 * cannot tell a column name from a typo.
 *
 * So this file runs the route. The stub pool behaves like Postgres: a statement naming a
 * column the table does not have THROWS, with the same message and SQLSTATE 42703. The
 * three cases are the three that matter — a clean approve, a state change since drafting,
 * and a violation-only block — and each one fails if the re-gate is removed.
 */

/** The columns `marketing_reply_draft` actually has. Anything else is 42703. */
const DRAFT_COLUMNS = new Set([
  'id', 'reply_id', 'body', 'used_llm', 'flagged', 'flag_reason', 'status',
  'approved_by', 'approved_at', 'reject_reason', 'created_at',
  'sent_asserted_by', 'sent_asserted_at',
]);

let embargoState: string | null = 'clear';
let holds = false;
let calls: { sql: string; params: unknown[] }[] = [];
let draftBody = 'BTC deposits are processing normally again.';

function undefinedColumn(column: string): Error {
  const err = new Error(`column "${column}" does not exist`) as Error & { code: string };
  err.code = '42703';
  return err;
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });

  // Postgres validates the select list. This is the behaviour the grep test could not have.
  const select = /SELECT ([\s\S]+?) FROM marketing_reply_draft/.exec(sql);
  if (select && !/^\*/.test(select[1].trim())) {
    for (const raw of select[1].split(',')) {
      const name = raw.trim().replace(/^\w+\./, '');
      if (name !== '' && !DRAFT_COLUMNS.has(name)) throw undefinedColumn(name);
    }
  }

  if (/to_regclass/.test(sql)) return { rows: [{ ok: true, present: true }], rowCount: 1 };
  if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
    return { rows: [{ any_rows: embargoState !== null }], rowCount: 1 };
  }
  if (/SELECT asset_symbol, state, embargoed_from/.test(sql)) {
    return {
      rows: embargoState === null ? [] : [{
        asset_symbol: 'BTC', state: embargoState,
        embargoed_from: '2026-08-01T00:00:00.000Z', review_by: '2026-12-01T00:00:00.000Z',
        entered_by: 'monty', entered_at: '2026-08-01T00:00:00.000Z',
      }],
      rowCount: embargoState === null ? 0 : 1,
    };
  }
  if (/SELECT d\.member_id, d\.asset_symbol, d\.holds/.test(sql)) {
    return {
      rows: [{
        member_id: 'nik', asset_symbol: 'BTC', holds,
        declared_at: '2026-07-01T00:00:00.000Z', renew_by: '2026-12-01T00:00:00.000Z',
      }],
      rowCount: 1,
    };
  }
  if (/SELECT reply_id, body FROM marketing_reply_draft/.test(sql)) {
    return { rows: [{ reply_id: 3, body: draftBody }], rowCount: 1 };
  }
  if (/UPDATE marketing_reply_draft/.test(sql)) {
    return {
      rows: [{ id: 9, reply_id: 3, body: draftBody, status: 'approved', approved_by: 'nik' }],
      rowCount: 1,
    };
  }
  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the marketing routes'); },
}));

const { marketingRoutes } = await import('../marketing.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const { _resetAbuseRegisterMigrated } = await import('../../marketing/abuseRegister.js');
const { _resetGateLedgerMigrated } = await import('../../marketing/outboundGate.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';

async function approve(id = 9) {
  const res = await marketingRoutes.request(`/draft/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

const gateLedgerWrites = () =>
  calls.filter((c) => /INSERT INTO marketing_outbound_gate_decision/.test(c.sql));

beforeEach(() => {
  calls = [];
  embargoState = 'clear';
  holds = false;
  draftBody = 'BTC deposits are processing normally again.';
  query.mockClear();
  _resetMigrated();
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
});

describe('approve reaches the gate at all', () => {
  it('approves a clean draft and does not answer 500', async () => {
    // The whole route was a 500 on every call. This assertion alone is the regression.
    const res = await approve();
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('code', 'MARKETING_ERROR');
  });

  it('re-reads the stored draft from the column the table actually has', async () => {
    await approve();
    expect(calls.some((c) => /SELECT reply_id, body FROM marketing_reply_draft/.test(c.sql)))
      .toBe(true);
    expect(calls.some((c) => /SELECT reply_id, text FROM marketing_reply_draft/.test(c.sql)))
      .toBe(false);
  });

  it('records the clearance verdict, cleared as well as refused', async () => {
    await approve();
    const wrote = gateLedgerWrites();
    expect(wrote).toHaveLength(1);
    expect(wrote[0].params[1]).toBe('clearance');
    expect(wrote[0].params[3]).toBe(true);
  });
});

describe('the time-of-check gap the re-gate exists to close', () => {
  it('refuses 422 when the asset entered embargo after the draft was written', async () => {
    embargoState = 'mnpi_pending';
    const res = await approve();
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('code', 'MARKETING_OUTBOUND_REFUSED');
    expect(JSON.stringify(res.body)).toContain('ART_90_ASSET_UNDER_EMBARGO');
    // And it did NOT approve.
    expect(calls.some((c) => /UPDATE marketing_reply_draft/.test(c.sql))).toBe(false);
  });

  it('refuses when the approver has no in-date holdings declaration', async () => {
    holds = true;
    draftBody = 'We are very bullish on BTC right now.';
    const res = await approve();
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('ART_91_3_C_UNDISCLOSED_HOLDING');
  });

  it('refuses on an error-severity violation and says which, with no refusal codes', async () => {
    // The 422 body used to carry `refusals: []` and nothing else on this path, which reads
    // as a platform fault — so the operator retries instead of removing the CTA.
    draftBody = 'Open an account and start trading BTC today.';
    const res = await approve();
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('disposition', 'flagged');
    expect(JSON.stringify(res.body)).toContain('deal_closing.invitation_to_transact');
    expect(gateLedgerWrites()[0].params[3]).toBe(false);
    expect(gateLedgerWrites()[0].params[8]).toContain('deal_closing.invitation_to_transact');
  });
});
