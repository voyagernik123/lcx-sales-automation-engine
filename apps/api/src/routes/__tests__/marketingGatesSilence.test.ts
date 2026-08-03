import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SILENCE LOG — AND THE LITERAL THAT TWO ROUTERS HAVE TO AGREE ON.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A decision not to answer IS a decision, and today `POST /:id/status` accepts `'ignored'`
 * and records no reason at all — so the desk's most common decision leaves the least
 * evidence and a silent ignore is indistinguishable from an oversight.
 *
 * THE FIRST TEST IS THE IMPORTANT ONE, and it is why this file drives TWO routers over ONE
 * in-memory `object_actions` array. `routes/marketingDesk.ts` writes a silence under
 * `action = 'marketing_triage_decision'` and does not export the literal;
 * `routes/marketingGates.ts` reads it and therefore restates it. A restated literal that
 * drifts does not throw — the log simply goes quiet, which is precisely the failure this
 * route exists to remove. So the desk router records a real silence and the gates router
 * has to find it, and either side changing its spelling fails here.
 *
 * WHAT THE REST WOULD CATCH:
 *  · a rationale-less silence being recorded anyway, and the 422 path leaving a ledger row
 *    behind — which a status-code assertion alone would pass.
 *  · a silence accepted with no assessment behind it, i.e. a decision that states its own
 *    basis rather than resting on a recorded one.
 *  · `GET /silence` answering an ENVELOPE instead of an array, which makes
 *    `deskApi.listSilences` render an empty log on a desk that has recorded silences.
 *  · an unmigrated environment answering `[]` with no explanation — a silent zero on the one
 *    screen whose purpose is that a decision left a trace.
 */

interface LedgerRow {
  id: string; subject_type: string; subject_id: string; action: string;
  params: unknown; result: unknown; actor: string; created_at: string;
}

let migrated = true;
let ledger: LedgerRow[] = [];
let replyRow: Record<string, unknown> | null = null;
let calls: { sql: string; params: readonly unknown[] }[] = [];
let nextId = 1;

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });
  if (/to_regclass/.test(sql)) return { rows: [{ ok: migrated }], rowCount: 1 };
  if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [], rowCount: 0 };
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}], rowCount: 1 };

  if (/INSERT INTO object_actions/.test(sql)) {
    const row: LedgerRow = {
      id: `led-${String(nextId++)}`,
      subject_type: String(params[0]),
      subject_id: String(params[1]),
      action: String(params[2]),
      params: JSON.parse(String(params[3])),
      result: JSON.parse(String(params[4])),
      actor: String(params[5]),
      created_at: new Date(Date.UTC(2026, 7, 3, 9, nextId)).toISOString(),
    };
    ledger.push(row);
    return { rows: [{ id: row.id, created_at: row.created_at }], rowCount: 1 };
  }

  /* The gates router's log read: subject_type, action[], limit — with the handle joined. */
  if (/FROM object_actions a/.test(sql)) {
    const actions = params[1] as readonly string[];
    const rows = ledger
      .filter((r) => r.subject_type === String(params[0]) && actions.includes(r.action))
      .filter((r) => {
        const result = r.result as Record<string, unknown> | null;
        return result !== null && result.silence !== undefined && result.silence !== null;
      })
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .slice(0, Number(params[2]))
      .map((r) => ({ ...r, author_handle: (replyRow?.author_handle as string | undefined) ?? null }));
    return { rows, rowCount: rows.length };
  }

  /* The gates router's basis read, and the desk router's history read: one subject, one row. */
  if (/FROM object_actions/.test(sql)) {
    const actions = Array.isArray(params[2]) ? (params[2] as readonly string[]) : [String(params[2])];
    const rows = ledger
      .filter((r) => r.subject_type === String(params[0]) && r.subject_id === String(params[1]) && actions.includes(r.action))
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .slice(0, 1);
    return { rows, rowCount: rows.length };
  }

  if (/FROM marketing_x_reply/.test(sql)) {
    return { rows: replyRow === null ? [] : [replyRow], rowCount: replyRow === null ? 0 : 1 };
  }
  if (/UPDATE marketing_x_reply/.test(sql)) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the marketing routers'); },
}));

const { marketingGatesRoutes } = await import('../marketingGates.js');
const { marketingDeskRoutes } = await import('../marketingDesk.js');
const { _resetMigrated } = await import('../../marketing/service.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` };

const call = async (router: { request: (p: string, i?: RequestInit) => Promise<Response> }, path: string, init?: RequestInit) => {
  const res = await router.request(path, { headers: AUTH, ...init });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
const postGates = (path: string, body: unknown) =>
  call(marketingGatesRoutes, path, { method: 'POST', body: JSON.stringify(body) });
const getGates = (path: string) => call(marketingGatesRoutes, path);
const postDesk = (path: string, body: unknown) =>
  call(marketingDeskRoutes, path, { method: 'POST', body: JSON.stringify(body) });

/** The desk router's triage input, at the shape its own parser requires. */
const triageBody = (over: Record<string, unknown> = {}) => ({
  verifiability: 'verifiable_factual',
  reach: {
    current: { value: 'little_interest', confidence: 'M', basis: 'one account, no replies' },
    previous: null, previousAt: null,
  },
  impacts: { reputation: { value: 'none', confidence: 'M', basis: 'nobody has asked about it' } },
  supportingGrades: ['M'],
  startedAt: '2026-08-03T08:00:00.000Z', firstStatementAt: null, suppression: null,
  ...over,
});

beforeEach(() => {
  migrated = true;
  ledger = [];
  nextId = 1;
  calls = [];
  replyRow = { id: 7, author_handle: 'someone', body: 'Is LCX insolvent?', x_post_id: '999' };
  query.mockClear();
  _resetMigrated();
});

describe('the two entry points write one record, and one reader finds both', () => {
  /**
   * THE LITERAL PIN. If either router changes its `subject_type` or its action name, this
   * fails — instead of the log going quietly empty, which is the failure mode a comment
   * cannot prevent.
   */
  it('finds a silence recorded by the DESK router through the GATES router', async () => {
    const decided = await postDesk('/7/triage', triageBody({
      action: { kind: 'ignore', rationale: 'One account, no reach; answering it would amplify it.' },
    }));
    expect(decided.status).toBe(201);
    expect(decided.body.data.silence).not.toBeNull();

    const log = await getGates('/silence');
    expect(log.status).toBe(200);
    expect(Array.isArray(log.body.data)).toBe(true);
    expect(log.body.data).toHaveLength(1);
    expect(log.body.data[0].source).toBe('triage_decision');
    expect(log.body.data[0].rationale).toBe('One account, no reach; answering it would amplify it.');
    expect(log.body.data[0].replyId).toBe(7);
    expect(log.body.data[0].subject).toBe('someone');
  });

  /**
   * WOULD CATCH: the gates router's own write landing somewhere the reader does not look, or
   * the assessment not being carried forward from the triage decision it rests on.
   */
  it('records its own silence against the assessment the desk already recorded', async () => {
    await postDesk('/7/triage', triageBody({
      action: { kind: 'ignore', rationale: 'First decision, recorded by the board.' },
    }));
    const written = await postGates('/7/silence', {
      reason: 'low_reach_no_amplification',
      rationale: 'Still nothing to answer; the thread has not moved in a day.',
      linesPrepared: 'Holding line 4, unused.',
    });
    expect(written.status).toBe(201);
    expect(written.body.data.source).toBe('silence_decision');
    expect(written.body.data.reasonCode).toBe('low_reach_no_amplification');
    expect(written.body.data.linesPrepared).toBe('Holding line 4, unused.');
    /* The three came from the recorded assessment, not from the request body. */
    expect(written.body.data.priorityAtDecision).toBe('low');
    expect(written.body.data.reachAtDecision).toBe('little_interest');
    expect(written.body.data.verifiabilityAtDecision).toBe('verifiable_factual');
    expect(written.body.data.queueStatusSet).toBe('ignored');

    const log = await getGates('/silence');
    expect(log.body.data).toHaveLength(2);
    expect(log.body.data.map((e: any) => e.source)).toContain('silence_decision');
    expect(log.body.data.map((e: any) => e.source)).toContain('triage_decision');
  });
});

describe('POST /:id/silence — the rationale IS the record', () => {
  /**
   * WOULD CATCH: a 422 that had already inserted the row. A refused silence must leave
   * NOTHING behind, and the status code alone does not prove that.
   */
  it('refuses a blank rationale and writes nothing at all', async () => {
    await postDesk('/7/triage', triageBody({
      action: { kind: 'ignore', rationale: 'A real earlier decision, so the basis exists.' },
    }));
    const before = ledger.length;
    const res = await postGates('/7/silence', { reason: 'low_reach', rationale: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('rationale');
    expect(ledger).toHaveLength(before);
  });

  /**
   * WOULD CATCH: a silence recorded with no assessment behind it — a decision asserting its
   * own basis. The refusal is the engine's own vocabulary and names the route that supplies it.
   */
  it('refuses when the reply has no recorded assessment, and writes nothing', async () => {
    const res = await postGates('/7/silence', {
      reason: 'low_reach',
      rationale: 'Not worth answering, in my judgement.',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MARKETING_SILENCE_REFUSED');
    expect(res.body.refusals[0].code).toBe('TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION');
    expect(res.body.refusals[0].recovery.missing).toMatch(/triage assessment/i);
    expect(ledger).toHaveLength(0);
    expect(calls.some((c) => /UPDATE marketing_x_reply/.test(c.sql))).toBe(false);
  });

  /**
   * WOULD CATCH: a stored assessment that cannot be read being coerced into a plausible one.
   * A silence recorded against an unreadable assessment has no basis either.
   */
  it('refuses when the stored assessment cannot be read as a priority, reach and verifiability', async () => {
    ledger.push({
      id: 'led-99',
      subject_type: 'marketing_x_reply',
      subject_id: '7',
      action: 'marketing_triage_decision',
      params: { action: { kind: 'ignore' }, verifiability: 'not_a_vocabulary_member' },
      result: { silence: {}, reading: { priority: {}, reachTrajectory: {} } },
      actor: 'someone',
      created_at: '2026-08-03T09:00:00.000Z',
    });
    const res = await postGates('/7/silence', { reason: 'low_reach', rationale: 'Leaving it.' });
    expect(res.status).toBe(422);
    expect(res.body.refusals[0].code).toBe('TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION');
    expect(res.body.refusals[0].sentence).toMatch(/cannot be read/i);
  });

  it('404s on a reply that does not exist, before writing anything', async () => {
    replyRow = null;
    const res = await postGates('/7/silence', { reason: 'low_reach', rationale: 'Leaving it.' });
    expect(res.status).toBe(404);
    expect(ledger).toHaveLength(0);
  });
});

describe('GET /silence — the array, and the honest empty state', () => {
  /**
   * WOULD CATCH THE SHAPE CONFLICT: `deskApi.listSilences` does
   * `Array.isArray(rows) ? rows : []`, so an envelope object renders an EMPTY LOG on a desk
   * with recorded silences. The frame therefore travels in `meta`, and `data` stays an array.
   */
  it('answers with an array, and puts the frame in meta', async () => {
    await postDesk('/7/triage', triageBody({
      action: { kind: 'ignore', rationale: 'Nothing to answer here.' },
    }));
    const res = await getGates('/silence');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.frame.source).toBe('own_record');
    expect(res.body.meta.frame.completeness).toBe('census_of_own_corpus');
    expect(res.body.meta.storage).toBe('present');
    expect(res.body.meta.returned).toBe(1);
    expect(res.body.meta.truncated).toBe(false);
  });

  /**
   * WOULD CATCH: an unmigrated environment answering `[]` with nothing to distinguish it from
   * a desk that has never recorded a silence.
   */
  it('says the store could not be read rather than reporting an empty log', async () => {
    migrated = false;
    _resetMigrated();
    const res = await getGates('/silence');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.storage).toBe('absent');
    expect(res.body.meta.storageRefusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(res.body.meta.storageRefusal.sentence).toMatch(/not an empty log/i);
  });

  /**
   * WOULD CATCH: a truncated log reading as a short one, which understates how many decisions
   * the desk has taken.
   */
  it('marks a truncated read as truncated', async () => {
    for (const rationale of ['first decision here', 'second decision here']) {
      ledger.push({
        id: `led-${rationale}`,
        subject_type: 'marketing_x_reply',
        subject_id: '7',
        action: 'marketing_silence_decision',
        params: { action: { kind: 'ignore', rationale }, reason: 'low_reach', linesPrepared: null },
        result: { silence: { rationale, decidedBy: 'a', decidedAt: '2026-08-03T09:00:00.000Z', priorityAtDecision: 'low', reachAtDecision: 'little_interest', verifiabilityAtDecision: 'opinion', signalsAtDecision: [] } },
        actor: 'a',
        created_at: `2026-08-03T09:0${String(ledger.length)}:00.000Z`,
      });
    }
    const res = await getGates('/silence?limit=1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.truncated).toBe(true);
    expect(res.body.meta.limit).toBe(1);
  });

  it('400s on a nonsense limit rather than silently substituting one', async () => {
    const res = await getGates('/silence?limit=-3');
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('limit');
  });
});
