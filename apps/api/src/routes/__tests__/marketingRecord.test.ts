import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ROUTES THAT GIVE WATCH AND RECORD A CALLER, DRIVEN THROUGH THE REAL ROUTER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  `apps/api/src/marketing/watch.ts` (1,811 lines) and `record.ts` (2,022 lines) were
 *  both heavily tested and NEITHER HAD AN IMPORTER anywhere in `apps/api/src`. So
 *  `subjectAccess`, `eraseByHandle` and `writeRecord` were dead code, `marketing_record`
 *  and both GDPR logs were permanently empty, an Art 15 request could not be answered
 *  by this product at all, and no statement was ever placed on the five-year clock.
 *
 *  A unit test of an engine cannot detect that. These tests go through
 *  `marketingRecordRoutes.request(...)`, which is the thing that did not exist — so
 *  every one of them fails if the route is removed, regardless of how well the engine
 *  behind it is covered.
 *
 *  THE STUB POOL BEHAVES LIKE POSTGRES where it matters: `to_regclass` answers per
 *  table so 0046, 0061 and 0064 can be present or absent independently, and every
 *  statement is recorded so a test can assert a write did NOT happen.
 */

type Call = { sql: string; params: unknown[] };

let calls: Call[] = [];
let present: Record<string, boolean> = {};
let recordRows: Array<Record<string, unknown>> = [];

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });

  const reg = /to_regclass\('([^']+)'\)/.exec(sql);
  if (reg) return { rows: [{ ok: present[reg[1]!] === true }], rowCount: 1 };

  if (/SELECT drafted_at FROM marketing_record WHERE record_uid/.test(sql)) {
    const hit = recordRows.find((r) => r.record_uid === params[0]);
    return { rows: hit ? [{ drafted_at: hit.drafted_at }] : [], rowCount: hit ? 1 : 0 };
  }
  if (/INSERT INTO marketing_record\b/.test(sql)) {
    return { rows: [{ record_uid: 'uid-written', created: true }], rowCount: 1 };
  }
  if (/count\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 0 }], rowCount: 1 };
  if (/max\(ran_at\)/.test(sql)) return { rows: [{ n: 0, last_at: null }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by these routes'); },
}));

const { marketingRecordRoutes } = await import('../marketingRecord.js');
const { _resetRecordMigrated } = await import('../../marketing/record.js');
const { _resetRetentionMigrated } = await import('../../marketing/retention.js');
const { _resetNewsSpineProbe } = await import('../../marketing/watch.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
/** `nik` is an approver on the roster; `sam` is an operator. */
const APPROVER = `nik@lcx.com:${PASSCODE}`;
const OPERATOR = `sam@lcx.com:${PASSCODE}`;

async function call(
  path: string,
  init: { method?: string; body?: unknown; cred?: string } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': init.cred ?? APPROVER,
  };
  const res = await marketingRecordRoutes.request(path, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** The FMA warning sitemap, trimmed to the two entries that make the point. */
const FMA_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.fma-li.li/en/warning/warning-lcxairdrop-dot-com-205</loc><lastmod>2026-07-30T09:00:00+02:00</lastmod></url>
  <url><loc>https://www.fma-li.li/de/warnung/warnung-lcxairdrop-dot-com-205</loc><lastmod>2026-07-30T09:00:00+02:00</lastmod></url>
  <url><loc>https://www.fma-li.li/en/warning/warning-someoneelse-dot-com-311</loc><lastmod>2026-07-11T09:00:00+02:00</lastmod></url>
</urlset>`;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  recordRows = [];
  present = {
    'public.marketing_x_reply': true,
    'public.marketing_record': true,
    'public.marketing_retention_run': true,
    'public.market_news': false,
  };
  query.mockClear();
  _resetRecordMigrated();
  _resetRetentionMigrated();
  _resetNewsSpineProbe();
  // Default: the FMA sitemap is unreachable. The honest default for a test suite, and
  // the case a watch panel most often gets wrong.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('getaddrinfo ENOTFOUND www.fma-li.li');
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/* ══ §1 THE WATCH ══════════════════════════════════════════════════════════════ */

describe('GET /watch — a dead feed reports that it is dead', () => {
  it('reports null, not zero, when the warning sitemap cannot be reached', async () => {
    const res = await call('/watch');
    expect(res.status).toBe(200);
    const w = res.body.data.warnings;
    expect(w.observation.state).toBe('unknown');
    // THE ASSERTION THIS WHOLE ROUTE EXISTS FOR. `0` here would say FMA has published
    // no warning naming LCX. The truth is that nobody looked.
    expect(w.matchesObserved).toBeNull();
    expect(w.entriesScanned).toBeNull();
    expect(w.usable).toBe(false);
    expect(res.body.data.sourcesUnreadable).toContain('fma_warning_sitemap');
    expect(res.body.data.refusals[0].code).toBe('WATCH_SOURCE_UNREACHABLE');
  });

  it('reports null for the regulator spine when the spine is absent', async () => {
    // `readRegulatorWatch` returns `itemsObservedInWindow: 0` with state `unknown` on
    // an environment with no spine. The route must not pass that 0 through.
    const res = await call('/watch');
    expect(res.body.data.regulator.observation.state).toBe('unknown');
    expect(res.body.data.regulator.itemsObservedInWindow).toBeNull();
  });

  it('carries an ObservationFrame on every source, with its blind spots', async () => {
    const res = await call('/watch');
    for (const panel of ['warnings', 'regulator', 'press'] as const) {
      const frame = res.body.data[panel].observation.frame;
      expect(frame, `${panel} has no frame`).toBeTruthy();
      expect(frame.captures.length).toBeGreaterThan(20);
      expect(frame.doesNotCapture.length).toBeGreaterThan(0);
      expect(frame.windowFrom).toBeTruthy();
      // A failed fetch must not report the channel as healthy.
      expect(frame.lastSuccessfulPollAt).toBeNull();
    }
    expect(res.body.data.warnings.observation.frame.source).toBe('regulator_feed');
    expect(res.body.data.press.observation.frame.source).toBe('news_feed');
  });

  it('says which watch-term registers do not exist, so an empty column is not reassurance', async () => {
    const res = await call('/watch');
    const t = res.body.data.terms;
    expect(t.ownBrand).toContain('LCX');
    expect(t.partners).toEqual([]);
    expect(t.listedAssets).toEqual([]);
    const codes = t.refusals.map((r: { code: string }) => r.code);
    expect(codes).toContain('WATCH_PARTNER_REGISTER_ABSENT');
    expect(codes).toContain('WATCH_LISTED_ASSET_REGISTER_ABSENT');
  });

  it('finds the LCX impersonation warning when the sitemap answers, and grades it act_now', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      text: async () => FMA_SITEMAP,
    })) as unknown as typeof fetch;
    const res = await call('/watch');
    const w = res.body.data.warnings;
    expect(w.observation.state).toBe('data');
    expect(w.usable).toBe(true);
    expect(w.matchesObserved).toBeGreaterThanOrEqual(1);
    const hit = w.matches.find((m: { slug: string }) => m.slug.includes('lcxairdrop'));
    expect(hit).toBeTruthy();
    // LCX's own brand, so it is actionable. Everything else is `assess`, because the
    // warning BODY has not been read.
    expect(hit.severity).toBe('act_now');
    expect(hit.refusals.map((r: { code: string }) => r.code))
      .toContain('WATCH_WARNING_BODY_NOT_READ');
    // <lastmod> is a change timestamp and must never be relabelled a publication date.
    expect(hit).toHaveProperty('sitemapLastmod');
    expect(hit).not.toHaveProperty('publishedAt');
    // And a source that answered is a source with a successful poll.
    expect(w.observation.frame.lastSuccessfulPollAt).toBe(w.observation.fetchedAt);
  });

  it('requires a credential', async () => {
    const res = await marketingRecordRoutes.request('/watch');
    expect(res.status).toBe(401);
  });
});

describe('GET /watch/claim-expiry — it refuses instead of saying "0 past due"', () => {
  it('is unusable with null counts, because no review register exists', async () => {
    const res = await call('/watch/claim-expiry');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.usable).toBe(false);
    // "0 claims past due" in the month TVTG registrations expired would be actively
    // misleading. Null is the honest answer.
    expect(d.counts).toBeNull();
    expect(d.rows).toEqual([]);
    expect(d.refusals.map((r: { code: string }) => r.code))
      .toContain('WATCH_CLAIM_REVIEW_REGISTER_EMPTY');
  });

  it('carries a census frame naming the two registers it does not have', async () => {
    const res = await call('/watch/claim-expiry');
    const frame = res.body.data.frame;
    expect(frame.source).toBe('own_record');
    expect(frame.completeness).toBe('census_of_own_corpus');
    expect(frame.doesNotCapture.join(' ')).toMatch(/review register/);
  });
});

/* ══ §2 THE FIVE-YEAR CLOCK: THE WRITE ═════════════════════════════════════════ */

describe('POST /record — the write that puts a statement on the long clock', () => {
  const good = {
    itemId: 'c-77',
    text: 'LCX is registered with the FMA under registration number 288159.',
    regime: 'casp_conduct',
    draftedBy: 'sam',
    draftedAt: '2026-08-01T09:00:00.000Z',
    clearedBy: 'nik',
    clearedAt: '2026-08-01T10:00:00.000Z',
    namedAssets: ['BTC'],
    jurisdictions: ['LI'],
  };

  it('records the statement and returns a five-year expiry with the inference caveat', async () => {
    const res = await call('/record', { method: 'POST', body: good });
    expect(res.status).toBe(201);
    expect(res.body.data.retention.years).toBe(5);
    expect(res.body.data.retention.expiresAt).toBe('2031-08-01T09:00:00.000Z');
    expect(res.body.data.retention.cls).toBe('lcx_statement');
    // A reader must learn the number is inferred at the moment they learn the number.
    expect(res.body.data.inferenceCaveat).toMatch(/INFERENCE, NOT CITATION/);
    expect(res.body.data.dpoRulingOutstanding).toMatch(/OUTSTANDING DPO RULING/);
    expect(calls.some((c) => /INSERT INTO marketing_record\b/.test(c.sql))).toBe(true);
  });

  it('names the attribution gap instead of implying the act was recorded', async () => {
    const res = await call('/record', { method: 'POST', body: good });
    expect(res.body.data.recordedBy).toBe('nik');
    // 0061 has drafted_by, cleared_by and close_out_by and NO column for who entered
    // the row. A payload that returned `recordedBy` with no note would read as though
    // the register held it.
    expect(res.body.data.attributionNote).toMatch(/NOT persisted/);
    expect(res.body.data.attributionNote).toContain('0061');
  });

  it('refuses a self-approved record before the database has to', async () => {
    const res = await call('/record', {
      method: 'POST',
      body: { ...good, clearedBy: 'sam' },
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SELF_APPROVAL_FORBIDDEN');
    // And it wrote nothing: a 500 from a CHECK violation would be the alternative.
    expect(calls.some((c) => /INSERT INTO marketing_record\b/.test(c.sql))).toBe(false);
  });

  it('will not guess the regime, the drafter or the instant', async () => {
    for (const missing of ['regime', 'draftedBy', 'draftedAt', 'text'] as const) {
      const body: Record<string, unknown> = { ...good };
      delete body[missing];
      const res = await call('/record', { method: 'POST', body });
      expect(res.status, `${missing} must be required`).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
  });

  it('refuses a clearance with only half of the pair', async () => {
    const half: Record<string, unknown> = { ...good };
    delete half.clearedAt;
    const res = await call('/record', { method: 'POST', body: half });
    expect(res.status).toBe(400);
  });

  it('answers 503 naming migration 0061 when the register is absent', async () => {
    present['public.marketing_record'] = false;
    const res = await call('/record', { method: 'POST', body: good });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RECORD_REGISTER_ABSENT');
    expect(res.body.error).toContain('0061');
  });

  it('is approver-only: an operator may not author a compliance record', async () => {
    const res = await call('/record', { method: 'POST', body: good, cred: OPERATOR });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_REQUIRES_APPROVER');
  });
});

/* ══ §3 GDPR ═══════════════════════════════════════════════════════════════════ */

describe('POST /subject-access — GDPR Art 15, previously unreachable', () => {
  it('answers for a handle and attributes the answer to the session', async () => {
    const res = await call('/subject-access', { method: 'POST', body: { handle: '@LCXFan' } });
    expect(res.status).toBe(200);
    // Normalised, so a request from @lcxfan finds rows stored as @LCXFan.
    expect(res.body.data.handleQueried).toBe('lcxfan');
    expect(res.body.data.fulfilledBy).toBe('nik');
    expect(Array.isArray(res.body.data.notes)).toBe(true);
    // The lookup must hit the index, not scan the table.
    expect(calls.some((c) => /lower\(author_handle\) = \$1/.test(c.sql))).toBe(true);
  });

  it('never puts the handle in a URL — the route is POST only', async () => {
    const res = await marketingRecordRoutes.request('/subject-access?handle=lcxfan', {
      headers: { 'x-api-key': APPROVER },
    });
    expect(res.status).toBe(404);
  });

  it('requires a handle, and approver authority', async () => {
    expect((await call('/subject-access', { method: 'POST', body: {} })).status).toBe(400);
    expect((await call('/subject-access', {
      method: 'POST', body: { handle: 'x' }, cred: OPERATOR,
    })).status).toBe(403);
  });

  it('answers 503 naming 0061 rather than pretending it was fulfilled', async () => {
    present['public.marketing_record'] = false;
    const res = await call('/subject-access', { method: 'POST', body: { handle: 'lcxfan' } });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('0061');
  });
});

describe('POST /erasure — Art 17, reconciled with the MiCA record', () => {
  it('reports what was retained and under which exemption', async () => {
    const res = await call('/erasure', {
      method: 'POST',
      body: { handle: '@lcxfan', basis: 'data_subject_request' },
    });
    expect(res.status).toBe(200);
    // The four numbers that make the reconciliation checkable rather than asserted.
    expect(res.body.data).toHaveProperty('repliesErased');
    expect(res.body.data).toHaveProperty('recordsRetained');
    expect(res.body.data).toHaveProperty('excerptsMinimised');
    expect(res.body.data).toHaveProperty('retainedBasis');
    expect(res.body.data.explanation.length).toBeGreaterThan(40);
    expect(res.body.data.decidedBy).toBe('nik');
  });

  it('will not accept an unnamed basis', async () => {
    for (const basis of [undefined, '', 'because', 'art_99_made_up']) {
      const res = await call('/erasure', {
        method: 'POST',
        body: { handle: 'lcxfan', ...(basis === undefined ? {} : { basis }) },
      });
      expect(res.status).toBe(400);
    }
  });

  it('is approver-only', async () => {
    const res = await call('/erasure', {
      method: 'POST',
      body: { handle: 'lcxfan', basis: 'data_subject_request' },
      cred: OPERATOR,
    });
    expect(res.status).toBe(403);
  });
});

/* ══ §4 THE ART 8(2) PRODUCTION ════════════════════════════════════════════════ */

describe('GET /export — produce on demand, or it is not a record', () => {
  it('requires the asking authority and the window', async () => {
    expect((await call('/export')).status).toBe(400);
    expect((await call('/export?authority=FMA')).status).toBe(400);
    const res = await call('/export?authority=FMA&from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('from is after to');
  });

  it('refuses an empty window rather than producing a bundle that reads as "we published nothing"', async () => {
    const res = await call('/export?authority=FMA&from=2026-01-01T00:00:00Z&to=2026-08-01T00:00:00Z');
    expect(res.status).toBe(422);
    expect(res.body.code).toMatch(/^RECORD_/);
    // The engine's own sentence survives: it is the part that helps.
    expect(res.body.error.length).toBeGreaterThan(40);
    expect(res.body.data.refusal.rule).toBeTruthy();
  });

  it('answers 503 naming 0061 for a single record when the register is absent', async () => {
    present['public.marketing_record'] = false;
    const res = await call('/export/uid-1?authority=FMA');
    expect(res.status).toBe(503);
    // Either gate is acceptable and both name 0061: the route's own probe, or the
    // engine's `RECORD_REGISTER_ABSENT`. What is NOT acceptable is a 200 holding an
    // empty bundle, which would read as "LCX published nothing in this window".
    expect(res.body.code).toMatch(/^(MIGRATION_PENDING_RECORD|RECORD_REGISTER_ABSENT)$/);
    expect(res.body.error).toContain('0061');
  });

  it('requires the authority on the single-record path too', async () => {
    const res = await call('/export/uid-1');
    expect(res.status).toBe(400);
  });

  it('is approver-only', async () => {
    const res = await call('/export?authority=FMA&from=2026-01-01T00:00:00Z&to=2026-08-01T00:00:00Z', {
      cred: OPERATOR,
    });
    expect(res.status).toBe(403);
  });
});

/* ══ §5 THE CLOCK ══════════════════════════════════════════════════════════════ */

describe('GET /retention — answers everywhere, refuses inside', () => {
  it('is 200 with the refusals in the payload on an unmigrated environment', async () => {
    present = {
      'public.marketing_x_reply': false,
      'public.marketing_record': false,
      'public.marketing_retention_run': false,
      'public.market_news': false,
    };
    const res = await call('/retention');
    // NOT a 503. "Retention is not running, and here is why" is the answer an operator
    // needs; an outage-shaped response makes the honest answer look like a fault.
    expect(res.status).toBe(200);
    expect(res.body.data.shortClock.dueForSweep).toBeNull();
    expect(res.body.data.longClock.dueForSweep).toBeNull();
    expect(res.body.data.lastRunAt).toBeNull();
    const codes = res.body.data.refusals.map((r: { code: string }) => r.code);
    expect(codes).toContain('RETENTION_LEDGER_ABSENT');
  });

  it('carries the reconciliation, the caveat and the outstanding ruling', async () => {
    const res = await call('/retention');
    expect(res.body.data.erasureReconciliation).toContain('Art 17(3)(b)');
    expect(res.body.data.inferenceCaveat).toMatch(/INFERENCE, NOT CITATION/);
    expect(res.body.data.dpoRulingOutstanding).toMatch(/OUTSTANDING DPO RULING/);
    const codes = res.body.data.refusals.map((r: { code: string }) => r.code);
    // The protection is partial while a second sweep still runs on the tick.
    expect(codes).toContain('RETENTION_COMPETING_SWEEP');
    expect(codes).toContain('RETENTION_DPO_RULING_PENDING');
  });

  it('reports that the clock has never run when the ledger is empty', async () => {
    const res = await call('/retention');
    expect(res.body.data.runsRecorded).toBe(0);
    expect(res.body.data.refusals.map((r: { code: string }) => r.code))
      .toContain('RETENTION_CLOCK_NEVER_RAN');
  });
});

describe('POST /retention/run — destructive, so it defaults to a dry run', () => {
  it('defaults to dry_run and deletes nothing', async () => {
    const res = await call('/retention/run', { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('dry_run');
    expect(res.body.data.thirdPartyRowsDeleted).toBeNull();
    expect(calls.some((c) => /^\s*DELETE/i.test(c.sql))).toBe(false);
    // A dry run is still recorded: knowing somebody looked, and when, is evidence.
    expect(res.body.data.recorded).toBe(true);
  });

  it('enforces only when asked by name', async () => {
    const res = await call('/retention/run', { method: 'POST', body: { mode: 'enforce' } });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('enforce');
    expect(calls.some((c) => /DELETE FROM marketing_x_reply/.test(c.sql))).toBe(true);
  });

  it('rejects an unknown mode', async () => {
    const res = await call('/retention/run', { method: 'POST', body: { mode: 'purge' } });
    expect(res.status).toBe(400);
  });

  it('answers 503 and deletes nothing when the run ledger is absent', async () => {
    present['public.marketing_retention_run'] = false;
    const res = await call('/retention/run', { method: 'POST', body: { mode: 'enforce' } });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RETENTION_LEDGER_ABSENT');
    expect(calls.some((c) => /^\s*DELETE/i.test(c.sql))).toBe(false);
  });

  it('is approver-only, and attributes the run to the session', async () => {
    expect((await call('/retention/run', { method: 'POST', body: {}, cred: OPERATOR })).status)
      .toBe(403);
    const res = await call('/retention/run', { method: 'POST', body: { ranBy: 'somebody-else' } });
    // A body field cannot claim the act. The shared machine key holds `operate`
    // everywhere, so attribution from a body would let a cron job author a deletion.
    expect(res.body.data.ranBy).toBe('nik');
  });
});

/* ══ §6 THE OWNER CONSTRAINT, AS A SOURCE RATCHET ══════════════════════════════ */

describe('there is no publish path in this router, and nowhere to add one', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../marketingRecord.ts'),
    'utf8',
  );

  it('never posts to X and holds no credential', () => {
    // Non-vacuity: the file really is the router.
    expect(src).toContain('export const marketingRecordRoutes');

    const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
    expect(code).not.toMatch(/api\.x\.com|api\.twitter\.com|upload\.twitter/i);
    expect(code).not.toMatch(/bearer\s*token|oauth|consumer_secret|access_token/i);
    expect(code).not.toMatch(/\btweet\b|\bpostTweet\b|\bpublishTo\b/i);
  });

  it('does not mount itself, so it cannot alter what the marketing ratchets read', () => {
    // `routes/marketing.ts` is the subject of source-level ratchets that read it as
    // text. This router is composed in by the wiring pass, following the gps split.
    expect(src).not.toMatch(/marketingRoutes\.(get|post|route)\(/);
    expect(src).not.toMatch(/from '\.\/marketing\.js'/);
  });

  it('takes attribution from the session on every write, never from a body field', () => {
    const writes = src.match(/marketingRecordRoutes\.post\([\s\S]*?\n\}\);/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(4);
    for (const w of writes) {
      expect(w, 'a write handler must read the principal').toMatch(/c\.get\('operator'\)/);
    }
  });
});
