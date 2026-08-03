import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE STORE, TWO PARSERS, AND THE ROUND TRIP THAT KEEPS THEM HONEST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `marketing/deskModeStore.ts` is the one place the desk mode is read and written, and it
 * exists because `routes/marketingMemory.ts` must know whether the desk is suspended:
 * `crisisCapabilities` takes a `DeskMode`, and two readers of that one fact would let the
 * desk board and the crisis room print opposite sentences about the same instant.
 *
 * ══ THE ONE DUPLICATION THAT SURVIVED, AND WHY IT IS TESTED RATHER THAN REMOVED ══
 * There are two functions that turn JSON into a `DeskMode`, on purpose:
 *
 *   · `marketingDesk.ts:parseDeskMode` — the REQUEST path. Substitutes the session actor for
 *     `imposedBy`/`recordedBy`, defaults `effectiveFrom` to now, and answers 400 naming the
 *     field and its valid values.
 *   · `deskModeStore.ts:parseStoredDeskMode` — the LEDGER path. Substitutes nothing, defaults
 *     nothing, and a missing field is a CORRUPT RECORD: it raises `LedgerUnreadable` and
 *     every caller treats the desk as closed.
 *
 * Collapsing them would mean either a client body that can omit fields, or a stored row that
 * gets today's date silently filled in. So the drift risk is real and it is held shut here:
 * every mode kind goes out through the request path and comes back through the store's
 * parser, and the parsed object must equal the stored one FIELD FOR FIELD. A mode that grows
 * a field the request path writes and the store parser drops turns this red.
 *
 * ══ WHAT ELSE WOULD MAKE THIS FILE FAIL ══
 *  · the store parser accepting the ORDER's power vocabulary (`art_94_1_q`) as a MODE power,
 *    which is the mistake this wave nearly shipped — `DeskMode.suspensionPower` has two
 *    values and `AuthorityOrder.power` has three, and only one of them carries a ceiling;
 *  · an unreadable NEWEST row being skipped in favour of the readable row beneath it;
 *  · `GET /desk` disagreeing with the `POST /desk-mode` that produced the row.
 */

interface LedgerRow {
  id: string; subject_type: string; subject_id: string; action: string;
  params: unknown; result: unknown; actor: string; created_at: string;
}

let ledger: LedgerRow[] = [];
let nextId = 1;
let migrated = true;

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}], rowCount: 1 };
  if (/to_regclass/.test(sql)) return { rows: [{ ok: migrated }], rowCount: 1 };
  if (/INSERT INTO object_actions/.test(sql)) {
    const row: LedgerRow = {
      id: `led-${String(nextId++)}`,
      subject_type: String(params[0]), subject_id: String(params[1]), action: String(params[2]),
      params: JSON.parse(String(params[3])), result: JSON.parse(String(params[4])),
      actor: String(params[5]),
      created_at: new Date(Date.UTC(2026, 7, 3, 9, nextId)).toISOString(),
    };
    ledger.push(row);
    return { rows: [{ id: row.id, created_at: row.created_at }], rowCount: 1 };
  }
  if (/FROM object_actions/.test(sql)) {
    const rows = ledger
      .filter((r) => r.subject_type === String(params[0]) && r.subject_id === String(params[1]) && r.action === String(params[2]))
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .slice(0, Number(params[3]));
    return { rows, rowCount: rows.length };
  }
  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the desk routes'); },
}));

const { marketingDeskRoutes } = await import('../marketingDesk.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const store = await import('../../marketing/deskModeStore.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` };

async function post(path: string, body: unknown) {
  const res = await marketingDeskRoutes.request(path, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
async function get(path: string) {
  const res = await marketingDeskRoutes.request(path, { headers: AUTH });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const CALENDAR = {
  jurisdiction: 'li', weekend: [0, 6], holidays: ['2026-08-15'],
  coversFrom: '2026-01-01', coversTo: '2026-12-31',
  source: 'Liechtenstein public holidays, Amt für Justiz list 2026',
};

/** The `to` object of the newest recorded transition, exactly as it sits in the ledger. */
const storedMode = (): unknown => {
  const newest = ledger[ledger.length - 1];
  const result = newest?.result as { transition?: { to?: unknown } } | undefined;
  return result?.transition?.to ?? null;
};

beforeEach(() => {
  ledger = [];
  nextId = 1;
  migrated = true;
  query.mockClear();
  _resetMigrated();
});

describe('the request path and the ledger path agree, field for field', () => {
  it('round-trips a heightened mode', async () => {
    const res = await post('/desk-mode', {
      to: { kind: 'heightened', reason: 'Two Art 66(2) findings in a fortnight; everything pre-cleared.', expiresAt: '2026-09-30T00:00:00.000Z' },
      reason: 'Imposed internally after the second finding, pending the review.',
      byRoles: ['policy', 'legal'],
    });
    expect(res.status).toBe(201);

    const stored = storedMode();
    // The parser adds nothing and drops nothing. Both halves matter: a dropped field is a
    // mode the crisis room reads differently from the board, and an added one is a default
    // this path is not allowed to invent.
    expect(store.parseStoredDeskMode(stored)).toEqual(stored);
    // And the fields the REQUEST path is responsible for are actually there to be compared.
    expect(res.body.data.standing.mode.imposedBy).toBe('nik');
    expect(res.body.data.standing.mode.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('round-trips an Art 94(1)(p) prohibition, expiresAt null and all', async () => {
    const res = await post('/desk-mode', {
      to: { kind: 'suspended_by_authority' },
      reason: 'FMA order served on the desk this morning; nothing goes out.',
      byRoles: ['legal'],
      order: {
        power: 'art_94_1_p_prohibit', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
        effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: null,
        groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
      },
      calendar: CALENDAR,
    });
    expect(res.status).toBe(201);

    const stored = storedMode();
    expect(store.parseStoredDeskMode(stored)).toEqual(stored);
    // `null` here means UNBOUNDED, never "we did not write the date down", and the parser
    // must keep that distinction rather than rejecting the row.
    expect((stored as { expiresAt: unknown }).expiresAt).toBeNull();
    expect(store.parseStoredDeskMode(stored).kind).toBe('suspended_by_authority');
  });

  it('round-trips an Art 94(1)(q) suspension with its transcribed end date', async () => {
    const res = await post('/desk-mode', {
      to: { kind: 'suspended_by_authority' },
      reason: 'FMA cease-and-suspend order, thirty working days, recorded on receipt.',
      byRoles: ['legal'],
      order: {
        power: 'art_94_1_q', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
        effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: '2026-08-11T00:00:00.000Z',
        groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
      },
      calendar: CALENDAR,
    });
    expect(res.status).toBe(201);
    const stored = storedMode();
    expect(store.parseStoredDeskMode(stored)).toEqual(stored);
    // The ORDER's limb is `art_94_1_q`; the MODE's is `cease_or_suspend_30_days`. Two
    // vocabularies, and the store parser accepts only the second — see the test below.
    expect((stored as { suspensionPower: string }).suspensionPower).toBe('cease_or_suspend_30_days');
  });

  it('reads the same mode back through GET /desk as the write reported', async () => {
    await post('/desk-mode', {
      to: { kind: 'suspended_by_authority' },
      reason: 'FMA order served on the desk this morning; nothing goes out.',
      byRoles: ['legal'],
      order: {
        power: 'art_94_1_p_prohibit', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
        effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: null,
        groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
      },
      calendar: CALENDAR,
    });
    const board = await get('/desk');
    expect(board.body.data.modeSource).toBe('ledger');
    expect(board.body.data.standing.mode).toEqual(storedMode());
  });
});

describe('the store parser refuses a corrupt record rather than defaulting it', () => {
  const parse = (raw: unknown): { threw: boolean; why: string } => {
    try {
      store.parseStoredDeskMode(raw);
      return { threw: false, why: '' };
    } catch (err) {
      return { threw: true, why: err instanceof Error ? err.message : String(err) };
    }
  };

  const SUSPENDED = {
    kind: 'suspended_by_authority', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
    effectiveFrom: '2026-07-01T00:00:00.000Z', expiresAt: null,
    suspensionPower: 'cease_or_suspend_30_days', recordedBy: 'nik',
  };

  it('accepts the three kinds it is meant to', () => {
    expect(parse({ kind: 'normal' }).threw).toBe(false);
    expect(parse(SUSPENDED).threw).toBe(false);
    expect(parse({
      kind: 'heightened', reason: 'two findings', imposedBy: 'nik',
      effectiveFrom: '2026-07-01T00:00:00.000Z', expiresAt: null,
    }).threw).toBe(false);
  });

  it('refuses the ORDER power vocabulary in a MODE — the two are not interchangeable', () => {
    // `AuthorityOrder.power` is one of three; `DeskMode.suspensionPower` is one of two. A
    // parser that accepted both would let a mode carry a limb the ceiling check cannot read.
    const out = parse({ ...SUSPENDED, suspensionPower: 'art_94_1_q' });
    expect(out.threw).toBe(true);
    expect(out.why).toMatch(/cease_or_suspend_30_days/);
  });

  it('refuses an unknown kind, and names what it accepts', () => {
    const out = parse({ kind: 'shut_i_think' });
    expect(out.threw).toBe(true);
    expect(out.why).toMatch(/normal, heightened, suspended_by_authority/);
  });

  it('refuses a date no clock can read rather than treating it as absent', () => {
    // `null` expiresAt means unbounded; an unreadable string is a DEFECT, and flattening the
    // two would read a corrupt row as an indefinite prohibition or the reverse.
    expect(parse({ ...SUSPENDED, effectiveFrom: 'last Tuesday' }).threw).toBe(true);
    expect(parse({ ...SUSPENDED, expiresAt: 'when it ends' }).threw).toBe(true);
  });

  it('refuses a suspension with no recorded authority, order reference or recorder', () => {
    for (const field of ['authority', 'orderRef', 'recordedBy'] as const) {
      const out = parse({ ...SUSPENDED, [field]: '' });
      expect(out.threw, `an empty ${field} parsed`).toBe(true);
    }
  });

  it('refuses anything that is not an object', () => {
    for (const raw of [null, undefined, 'suspended', 42, ['suspended_by_authority']]) {
      expect(parse(raw).threw, `${JSON.stringify(raw)} parsed`).toBe(true);
    }
  });
});

describe('an unreadable NEWEST row is never traded for the readable one beneath it', () => {
  it('raises LedgerUnreadable carrying the row it could not read', async () => {
    // The order matters: a readable `normal` underneath a corrupt prohibition is exactly the
    // shape that would answer "the desk is open" while a regulator's order sat on top.
    ledger.push({
      id: 'led-1', subject_type: 'marketing_desk', subject_id: 'mode',
      action: 'marketing_desk_mode_change', params: {},
      result: { transition: { to: { kind: 'normal' } }, reason: 'lifted' },
      actor: 'nik', created_at: '2026-08-01T09:00:00.000Z',
    });
    ledger.push({
      id: 'led-2', subject_type: 'marketing_desk', subject_id: 'mode',
      action: 'marketing_desk_mode_change', params: {},
      result: { transition: { to: { kind: 'suspended_by_authority', authority: 'FMA' } }, reason: 'order served' },
      actor: 'nik', created_at: '2026-08-02T09:00:00.000Z',
    });

    let caught: unknown = null;
    try {
      await store.readDeskStanding({ query } as never, '2026-08-03T09:00:00.000Z');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(store.LedgerUnreadable);
    expect((caught as InstanceType<typeof store.LedgerUnreadable>).ledgerRef).toBe('led-2');

    // And through the route: 500 with the sentence, never a mode.
    const board = await get('/desk');
    expect(board.status).toBe(500);
    expect(board.body.code).toBe('MARKETING_DESK_MODE_UNREADABLE');
    expect(JSON.stringify(board.body)).not.toMatch(/"outboundPermitted":true/);
  });

  it('refuses a row that carries neither a transition nor an order', async () => {
    ledger.push({
      id: 'led-1', subject_type: 'marketing_desk', subject_id: 'mode',
      action: 'marketing_desk_mode_change', params: {},
      result: { reason: 'somebody wrote a note' },
      actor: 'nik', created_at: '2026-08-02T09:00:00.000Z',
    });
    await expect(store.readDeskStanding({ query } as never, '2026-08-03T09:00:00.000Z')).rejects.toThrow(
      /neither a transition nor an order/,
    );
  });

  it('reports default_normal — not `normal` — when nothing was ever recorded', async () => {
    const reading = await store.readDeskStanding({ query } as never, '2026-08-03T09:00:00.000Z');
    expect(reading.source).toBe('default_normal');
    expect(reading.standing.mode.kind).toBe('normal');
    // Open because nobody has said otherwise, and the surface can say which of those it is.
    expect(reading.standing.outboundPermitted).toBe(true);
  });
});

describe('modeInForce reads the engine, and does no date arithmetic of its own', () => {
  const suspension = (expiresAt: string | null) => ({
    kind: 'suspended_by_authority' as const, authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
    effectiveFrom: '2026-07-01T00:00:00.000Z', expiresAt,
    suspensionPower: 'cease_or_suspend_30_days' as const, recordedBy: 'nik',
  });

  it('passes a live suspension through untouched', async () => {
    const { deskStanding } = await import('@lcx/shared');
    const standing = deskStanding(suspension('2026-09-01T00:00:00.000Z'), '2026-08-03T09:00:00.000Z');
    expect(standing.outboundPermitted).toBe(false);
    expect(store.modeInForce(standing)).toEqual(standing.mode);
  });

  it('does not apply a suspension the engine says has lapsed', async () => {
    // `deskMode.ts` on `lapsed`: the desk is free again by the order's own terms, and
    // refusing longer than the authority ordered is its own compliance problem. The RECORD
    // keeps saying suspended; the permission question is answered against `normal`.
    const { deskStanding } = await import('@lcx/shared');
    const standing = deskStanding(suspension('2026-07-20T00:00:00.000Z'), '2026-08-03T09:00:00.000Z');
    expect(standing.phase).toBe('lapsed');
    expect(store.modeInForce(standing).kind).toBe('normal');
    expect(standing.mode.kind).toBe('suspended_by_authority');
  });

  it('does not apply a suspension that has not started yet', async () => {
    const { deskStanding } = await import('@lcx/shared');
    const standing = deskStanding(
      { ...suspension('2026-10-01T00:00:00.000Z'), effectiveFrom: '2026-09-01T00:00:00.000Z' },
      '2026-08-03T09:00:00.000Z',
    );
    expect(standing.phase).toBe('pending');
    // A desk that stops work early has been shut by a clerical act rather than by an order.
    expect(store.modeInForce(standing).kind).toBe('normal');
  });

  it('keeps the desk shut when the recorded dates cannot be read', async () => {
    const { deskStanding } = await import('@lcx/shared');
    const standing = deskStanding(suspension('whenever'), '2026-08-03T09:00:00.000Z');
    expect(standing.phase).toBe('undated');
    expect(standing.outboundPermitted).toBe(false);
    // Fails CLOSED: a malformed string must not reopen a desk a regulator closed.
    expect(store.modeInForce(standing).kind).toBe('suspended_by_authority');
  });

  it('leaves heightened and normal exactly as recorded', async () => {
    const { deskStanding } = await import('@lcx/shared');
    const heightened = deskStanding(
      { kind: 'heightened', reason: 'two findings', imposedBy: 'nik', effectiveFrom: '2026-07-01T00:00:00.000Z', expiresAt: null },
      '2026-08-03T09:00:00.000Z',
    );
    expect(store.modeInForce(heightened)).toEqual(heightened.mode);
    const normal = deskStanding({ kind: 'normal' }, '2026-08-03T09:00:00.000Z');
    expect(store.modeInForce(normal)).toEqual({ kind: 'normal' });
  });
});
