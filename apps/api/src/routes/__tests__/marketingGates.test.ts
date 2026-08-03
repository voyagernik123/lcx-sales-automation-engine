import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GATES SUB-ROUTER — CLAIM SAFETY, THE LIVE REVIEW, AND THE MOUNT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Seven client functions called routes that did not exist and `deskApi.reviewText` called
 * an eighth nobody had mounted, so every test here drives the HTTP route rather than an
 * engine: the engines already have 5,000 lines of tests, and what was never tested is that
 * a request reaches them, that the refusals survive the trip, and that a refused release
 * leaves no releasable text behind.
 *
 * WHAT EACH TEST WOULD CATCH, and every one fails if the behaviour is removed rather than
 * if the wording changes:
 *
 *  · a claim-safety refusal arriving with its RULE and its RECOVERY, not just a code.
 *  · `usableText` withheld when the gate-decision ledger could not be written — the copy
 *    path with no record, which a status-code assertion would pass straight through.
 *  · an unstated `considerationKind` refusing rather than reading as `none`.
 *  · `POST /review` writing NOTHING, asserted by observing that no INSERT was issued —
 *    the difference between "advisory" and "advisory, and quietly logging every keystroke".
 *  · `/review` returning `regime: null` rather than `regimes: []`: an empty regime list
 *    reads as "no law applies", which is a clear nobody computed.
 *  · every mounted path answering something other than 404, which is the whole defect.
 */

/* ── the fake database ───────────────────────────────────────────────────── */

interface Probe { table: string; present: boolean }

let migrated = true;
/** Which `to_regclass` probes answer true. 0062 absent is the interesting default. */
let tables: Probe[] = [];
let calls: { sql: string; params: readonly unknown[] }[] = [];
let inserts = 0;

const present = (sql: string): boolean => {
  const hit = tables.find((t) => sql.includes(t.table));
  return hit === undefined ? false : hit.present;
};

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });
  if (/INSERT INTO/.test(sql)) {
    inserts += 1;
    return { rows: [{ id: `row-${String(inserts)}` }], rowCount: 1 };
  }
  if (/to_regclass\('public\.marketing_x_reply'\)/.test(sql) && !/marketing_own_statement/.test(sql)) {
    return { rows: [{ ok: migrated }], rowCount: 1 };
  }
  if (/to_regclass/.test(sql)) return { rows: [{ ok: present(sql) }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the gates routes'); },
}));

const { marketingGatesRoutes } = await import('../marketingGates.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const { _resetGateLedgerMigrated } = await import('../../marketing/outboundGate.js');
const { _resetCorroborationProbe } = await import('../../marketing/postTime.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` };

async function post(path: string, body: unknown) {
  const res = await marketingGatesRoutes.request(path, {
    method: 'POST', headers: AUTH, body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
async function get(path: string) {
  const res = await marketingGatesRoutes.request(path, { headers: AUTH });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  migrated = true;
  tables = [
    { table: 'marketing_outbound_gate_decision', present: true },
    { table: 'marketing_asset_embargo', present: false },
    { table: 'marketing_member_holdings', present: false },
  ];
  calls = [];
  inserts = 0;
  query.mockClear();
  _resetMigrated();
  _resetGateLedgerMigrated();
  _resetCorroborationProbe();
});

const CLEAN = {
  surface: 'reply',
  verb: 'reply' as const,
  text: 'Thanks for flagging this — our support team will follow up in the ticket.',
  considerationKind: 'none',
};

describe('POST /claim-safety', () => {
  /**
   * WOULD CATCH: a verdict that reports a code with no rule behind it. The whole point of
   * the compartment is that a refusal cites the provision that caused it; a bare code sends
   * the operator back to the source.
   */
  it('refuses a regulated promise and every refusal carries its rule and its recovery', async () => {
    const res = await post('/claim-safety', {
      ...CLEAN,
      text: 'LCX will list your token in Q3 and the price will double.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.usableText).toBeNull();
    expect(res.body.data.refusals.length).toBeGreaterThan(0);
    for (const r of res.body.data.refusals) {
      expect(typeof r.code).toBe('string');
      expect(r.sentence.length).toBeGreaterThan(20);
      expect(r.rule.provision.length).toBeGreaterThan(0);
      expect(r.rule.text.length).toBeGreaterThan(0);
      expect(typeof r.recovery.kind).toBe('string');
    }
  });

  /**
   * WOULD CATCH: the copy path with no record. If the ledger write is not conditioning the
   * release, `recorded` goes false and `usableText` still comes back — and the operator
   * pastes bytes into X that this system cannot prove it ever checked.
   */
  it('withholds usableText when the gate-decision ledger cannot be written', async () => {
    tables = tables.map((t) =>
      t.table === 'marketing_outbound_gate_decision' ? { ...t, present: false } : t);
    _resetGateLedgerMigrated();
    const res = await post('/claim-safety', CLEAN);
    expect(res.status).toBe(200);
    expect(res.body.data.recorded).toBe(false);
    expect(res.body.data.usableText).toBeNull();
    expect(res.body.data.recordRefusal.code).toBe('PUBLISHED_TEXT_NOT_PASTED_BACK');
    expect(res.body.data.refusals.some((r: any) => r.code === 'PUBLISHED_TEXT_NOT_PASTED_BACK')).toBe(true);
  });

  /**
   * WOULD CATCH: an absent `considerationKind` being read as `none`. The UCPD duty attaches
   * to the FACT of consideration, not to the wording, and no engine on this route evaluates
   * it — so silence has to refuse or the check is skipped by omission.
   */
  it('refuses when considerationKind is not stated, and does not treat absence as none', async () => {
    /* The same body WITH a stated consideration is allowed and releases text — proved in
     * the sibling assertion below — so the only difference between the two calls is the
     * field, which is what makes this test about the field rather than about the text. */
    const withKind = await post('/claim-safety', CLEAN);
    const withoutKind = await post('/claim-safety', { ...CLEAN, considerationKind: undefined });
    const codes = (r: any) => r.body.data.refusals.map((x: any) => x.code);
    expect(codes(withoutKind)).toContain('PARTNER_CONSIDERATION_UNKNOWN');
    expect(codes(withKind)).not.toContain('PARTNER_CONSIDERATION_UNKNOWN');
    expect(withKind.body.data.allowed).toBe(true);
    expect(withKind.body.data.usableText).not.toBeNull();
    expect(withoutKind.body.data.allowed).toBe(false);
    expect(withoutKind.body.data.usableText).toBeNull();
  });

  /**
   * WOULD CATCH: a body field silently ignored. `namedAssets` is deliberately NOT used for
   * the embargo lookup — the gate extracts server-side so the drafter cannot skip the check
   * — and `assetsExtracted` must report what the gate actually looked up rather than
   * echoing the claim.
   */
  it('reports the assets IT extracted, not the ones the caller declared', async () => {
    const res = await post('/claim-safety', {
      ...CLEAN,
      text: 'Our BTC pair is live.',
      namedAssets: ['DOGE'],
    });
    expect(res.body.data.assetsExtracted).toContain('BTC');
    expect(res.body.data.assetsExtracted).not.toContain('DOGE');
    expect(res.body.data.extractionCaveat.length).toBeGreaterThan(20);
  });

  /** WOULD CATCH: a malformed vocabulary value 500ing instead of naming the valid values. */
  it('answers 400 naming the field and the valid values on a bad verb', async () => {
    const res = await post('/claim-safety', { ...CLEAN, verb: 'retweet' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.field).toBe('verb');
    expect(res.body.validValues).toContain('repost');
  });
});

describe('POST /review', () => {
  /**
   * WOULD CATCH: a debounced live check writing a ledger row per keystroke, which would
   * make the one question the control ledger exists to answer — was the text a human copied
   * checked? — unreadable under thousands of intermediate drafts.
   */
  it('writes nothing at all', async () => {
    const res = await post('/review', { text: 'LCX will list your token in Q3.', verb: 'reply' });
    expect(res.status).toBe(200);
    expect(calls.some((c) => /INSERT INTO/.test(c.sql))).toBe(false);
    expect(inserts).toBe(0);
  });

  /**
   * WOULD CATCH: `regimes: []` shipped instead of `null`. `deskApi.asRefusals` renders a
   * non-array as UNCHECKED and an empty array as "checked, nothing found" — so an empty
   * list here is a clear that no classifier produced.
   */
  it('returns regime as null with a stated refusal, never an empty regime list', async () => {
    const res = await post('/review', { text: 'Thanks for the note.', verb: 'reply' });
    expect(res.body.data.regime).toBeNull();
    expect(res.body.data.regimes).toBeNull();
    expect(res.body.data.regimeRefusal.rule.text.length).toBeGreaterThan(0);
    expect(res.body.data.regimeRefusal.recovery.kind).toBe('supply_data');
  });

  /**
   * WOULD CATCH: the field names drifting from `deskApi.ts reviewText`, which reads exactly
   * these four off the top level and substitutes nothing when they are missing.
   */
  it('answers in the shape deskApi.reviewText narrows, and releases no text', async () => {
    const res = await post('/review', { text: 'LCX guarantees a 20% yield.', verb: 'original' });
    expect(Array.isArray(res.body.data.claimSafety)).toBe(true);
    expect(res.body.data.releasesNoText).toBe(true);
    expect('usableText' in res.body.data).toBe(false);
    expect(res.body.data.disclosure.length).toBeGreaterThan(20);
  });
});

describe('the mount', () => {
  /**
   * WOULD CATCH THE ORIGINAL DEFECT ITSELF: a path the client already calls answering 404,
   * which renders as "the desk has no data" rather than "the desk has no route".
   */
  it('answers every path the web client calls, and never 404 on the path itself', async () => {
    const results = [
      await post('/claim-safety', CLEAN),
      await post('/review', { text: 'hello', verb: 'reply' }),
      await get('/silence'),
      await get('/metrics'),
      await get('/loop'),
    ];
    for (const r of results) expect(r.status).not.toBe(404);
    /* `:id` paths 404 only because the ROW is absent, and the body says so — which is a
     * different answer from the route being missing. */
    for (const r of [
      await get('/replies/7/provenance'),
      await post('/replies/7/corroborate', {}),
      await post('/7/silence', { reason: 'low_reach', rationale: 'x' }),
    ]) {
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('NOT_FOUND');
    }
  });

  /**
   * WOULD CATCH: `POST /:id/silence` shadowing `POST /claim-safety` or `POST /review` if
   * either were ever registered after it, which would answer 400 `id must be a positive
   * integer` on a path that looks completely correct.
   */
  it('does not let the :id route capture the literal paths', async () => {
    const res = await post('/claim-safety', CLEAN);
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe('VALIDATION');
  });
});
