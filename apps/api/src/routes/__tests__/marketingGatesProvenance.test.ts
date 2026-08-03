import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PROVENANCE — AND THE ONE ANSWER THAT MAY NEVER BE GIVEN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The reason this route exists is that the ingest is forgeable today: the mailbox poll has
 * no sender filter, so a fabricated reply grades identically to a real one until an
 * independent channel disagrees. The reason these tests exist is narrower and sharper — an
 * OUTAGE MUST NEVER READ AS "NOT CORROBORATED". A boolean `corroborated` collapses four
 * different facts into "no", and three of them are innocent.
 *
 * WHAT EACH TEST WOULD CATCH:
 *
 *  · a stored `could_not_check` row being reported as an absence of corroboration, which
 *    turns X being down into a forgery signal against a real reply.
 *  · 0062 being absent reading as "never corroborated" rather than "unknowable here".
 *  · the grade claiming "corroboration has not been attempted" on a row that WAS checked —
 *    the ladder's own sentence for the unchecked rung, emitted where it is false.
 *  · a row with no lookup at all NOT being graded, which would leave the panel empty in the
 *    one case where the honest rung is exactly right.
 *  · `POST /corroborate` writing rows during an outage, or without the table to write to.
 *  · the corroborate path issuing more than one lookup, or retrying.
 */

let migrated = true;
let corroborationTable = true;
let replyRow: Record<string, unknown> | null = null;
let corroborationRows: Record<string, unknown>[] = [];
let calls: { sql: string; params: readonly unknown[] }[] = [];
let inserts: { sql: string; params: readonly unknown[] }[] = [];

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });
  if (/INSERT INTO/.test(sql)) {
    inserts.push({ sql, params });
    return { rows: [{ id: 'led-1' }], rowCount: 1 };
  }
  if (/to_regclass\('public\.marketing_reply_corroboration'\)/.test(sql)) {
    return { rows: [{ ok: corroborationTable }], rowCount: 1 };
  }
  if (/to_regclass\('public\.marketing_x_reply'\)/.test(sql)) {
    return { rows: [{ ok: migrated }], rowCount: 1 };
  }
  if (/to_regclass/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
  if (/FROM marketing_x_reply/.test(sql)) {
    return { rows: replyRow === null ? [] : [replyRow], rowCount: replyRow === null ? 0 : 1 };
  }
  if (/FROM marketing_reply_corroboration/.test(sql)) {
    return { rows: corroborationRows, rowCount: corroborationRows.length };
  }
  if (/UPDATE marketing_x_reply/.test(sql)) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the gates routes'); },
}));

const { marketingGatesRoutes } = await import('../marketingGates.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const { _resetCorroborationProbe } = await import('../../marketing/postTime.js');
const { resetOEmbedHealth } = await import('../../marketing/oembed.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` };

async function get(path: string) {
  const res = await marketingGatesRoutes.request(path, { headers: AUTH });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
async function post(path: string) {
  const res = await marketingGatesRoutes.request(path, { method: 'POST', headers: AUTH, body: '{}' });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** An authenticated notification row: DKIM pass on an X signing domain, with a post id. */
const AUTHENTIC_ROW = {
  id: 7,
  x_comment_id: 'c-7',
  x_post_id: '1234567890123',
  author_handle: 'someone',
  author_display: 'Some One',
  body: 'Is my withdrawal stuck?',
  received_at: '2026-08-01T10:00:00.000Z',
  quarantined: false,
  source_kind: 'x_notification_email',
  sender_auth_state: 'dkim',
  sender_dkim_domain: 'x.com',
  sender_auth_evidence: 'dkim=pass header.d=x.com',
  posted_on_displayed: null,
  posted_at_source: null,
};

beforeEach(() => {
  migrated = true;
  corroborationTable = true;
  replyRow = { ...AUTHENTIC_ROW };
  corroborationRows = [];
  calls = [];
  inserts = [];
  query.mockClear();
  _resetMigrated();
  _resetCorroborationProbe();
  resetOEmbedHealth();
});

describe('GET /replies/:id/provenance — the four states of "not corroborated"', () => {
  /**
   * WOULD CATCH THE HEADLINE DEFECT: an outage reported as an absence of corroboration.
   * `could_not_check` has its own state, and the sentence says out loud that it is not
   * evidence against the post.
   */
  it('reports a stored could_not_check as itself, never as an absence of corroboration', async () => {
    corroborationRows = [{
      field: 'post_id',
      channel: 'oembed',
      outcome: 'could_not_check',
      observed_value: null,
      detail: 'CHANNEL_TIMEOUT: The corroboration channel timed out. Nothing was learned about this post.',
      undocumented: false,
      observed_at: '2026-08-02T09:00:00.000Z',
    }];
    const res = await get('/replies/7/provenance');
    expect(res.status).toBe(200);
    expect(res.body.data.corroboration.kind).toBe('could_not_check');
    expect(res.body.data.corroboration.kind).not.toBe('never_attempted');
    expect(res.body.data.corroboration.lastObservedAt).toBe('2026-08-02T09:00:00.000Z');
    expect(res.body.data.corroboration.sentence).toMatch(/says nothing about this post/i);
    expect(res.body.data.corroboration.rows).toHaveLength(1);
    /* No refusal on this branch: something WAS observed, and the observation is the record. */
    expect(res.body.data.corroboration.refusal).toBeUndefined();
  });

  /**
   * WOULD CATCH: 0062 being absent rendering as a negative finding about the row rather than
   * as an unknowable. "There is no register" and "the register says no" are different
   * sentences and a desk that cannot tell them apart is guessing.
   */
  it('reports storage_absent, with a refusal, when 0062 is not applied', async () => {
    corroborationTable = false;
    _resetCorroborationProbe();
    const res = await get('/replies/7/provenance');
    expect(res.body.data.corroboration.kind).toBe('storage_absent');
    expect(res.body.data.corroboration.refusal.code).toBe('CORROBORATION_ABSENT');
    expect(res.body.data.corroboration.refusal.recovery.kind).toBe('wait_until');
    expect(res.body.data.corroboration.rows).toHaveLength(0);
  });

  /**
   * WOULD CATCH: an unchecked row not being graded. The ladder's `email_authenticated_unchecked`
   * rung is exactly true here, so refusing the grade would be over-caution that empties the
   * panel in the commonest case.
   */
  it('grades a row that has never been looked up, with the unchecked rung', async () => {
    const res = await get('/replies/7/provenance');
    expect(res.body.data.corroboration.kind).toBe('never_attempted');
    expect(res.body.data.grade.kind).toBe('measured');
    expect(res.body.data.grade.value.rung).toBe('email_authenticated_unchecked');
    expect(res.body.data.grade.value.admiralty).toBe('C3');
    expect(res.body.data.grade.value.statement).toMatch(/not been attempted/i);
    expect(res.body.data.grade.frame.completeness).toBe('unknown_no_denominator');
  });

  /**
   * WOULD CATCH: the grade emitting "corroboration has not been attempted" on a row that was
   * corroborated — a sentence the record contradicts. The refusal names the observation
   * instant and points at the one button that fixes it.
   */
  it('refuses to grade a row whose lookup it did not make, rather than calling it unchecked', async () => {
    corroborationRows = [{
      field: 'post_id',
      channel: 'oembed',
      outcome: 'agrees',
      observed_value: null,
      detail: 'X returned this post at the requested id.',
      undocumented: false,
      observed_at: '2026-08-02T09:00:00.000Z',
    }];
    const res = await get('/replies/7/provenance');
    expect(res.body.data.corroboration.kind).toBe('agrees');
    expect(res.body.data.grade.kind).toBe('absent');
    expect(res.body.data.grade.refusal.code).toBe('FETCH_OUTCOME_UNKNOWN');
    expect(res.body.data.grade.refusal.matched).toBe('2026-08-02T09:00:00.000Z');
    expect(JSON.stringify(res.body.data.grade)).not.toMatch(/not been attempted/i);
  });

  /**
   * WOULD CATCH: a disagreement being averaged away by an agreement on another field. A
   * contradiction outranks everything and needs a named human.
   */
  it('reports a disagreement even when other fields agreed', async () => {
    corroborationRows = [
      { field: 'author_handle', channel: 'oembed', outcome: 'disagrees', observed_value: '@someone_else', detail: 'X names a different author.', undocumented: false, observed_at: '2026-08-02T09:00:00.000Z' },
      { field: 'post_id', channel: 'oembed', outcome: 'agrees', observed_value: null, detail: 'id exists', undocumented: false, observed_at: '2026-08-02T08:00:00.000Z' },
    ];
    const res = await get('/replies/7/provenance');
    expect(res.body.data.corroboration.kind).toBe('disagrees');
    expect(res.body.data.corroboration.sentence).toMatch(/CONTRADICTED/);
  });

  /**
   * WOULD CATCH: a mail header date being presented as a post time. Absence refuses with the
   * reason, so no surface can print `receivedAt` where a post date belongs.
   */
  it('refuses a post date rather than substituting the receipt instant', async () => {
    const res = await get('/replies/7/provenance');
    expect(res.body.data.postedOnDisplayed).toBeNull();
    expect(res.body.data.postDateRefusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(res.body.data.postDateRefusal.sentence).toMatch(/mail latency/i);
    expect(res.body.data.receivedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  /**
   * WOULD CATCH: an unauthenticated row being graded. Nothing establishes that the mail came
   * from X, and the ingest has no sender filter — so the ladder holds it and no grade is
   * produced at all.
   */
  it('withholds a grade entirely on a row whose sender was never authenticated', async () => {
    replyRow = { ...AUTHENTIC_ROW, sender_auth_state: null, sender_dkim_domain: null };
    const res = await get('/replies/7/provenance');
    expect(res.body.data.grade.kind).toBe('absent');
    expect(res.body.data.grade.refusal.code).toBe('INBOUND_QUARANTINED');
    expect(res.body.data.quarantineCode).toBe('MKT_PROV_SENDER_UNVERIFIED');
    expect(res.body.data.senderRefusal.code).toBe('SENDER_AUTHENTICATION_ABSENT');
  });

  it('reads nothing but the row and its corroborations — no INSERT, no UPDATE', async () => {
    await get('/replies/7/provenance');
    expect(inserts).toHaveLength(0);
    expect(calls.some((c) => /^\s*UPDATE/.test(c.sql))).toBe(false);
  });
});

describe('POST /replies/:id/corroborate', () => {
  const oembedBody = {
    html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Is my withdrawal stuck?</p>&mdash; Some One (@someone) <a href="https://twitter.com/someone/status/1234567890123?ref_src=x">August 1, 2026</a></blockquote>',
    author_name: 'Some One',
    author_url: 'https://twitter.com/someone',
    url: 'https://twitter.com/someone/status/1234567890123',
  };

  /**
   * WOULD CATCH: a lookup happening with nowhere to record it. A corroboration whose evidence
   * cannot be written is an unrecorded network call, which is the one thing doctrine rule 5
   * forbids.
   */
  it('does not look anything up when 0062 is absent, and says so', async () => {
    corroborationTable = false;
    _resetCorroborationProbe();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post('/replies/7/corroborate');
    vi.unstubAllGlobals();
    expect(res.status).toBe(200);
    expect(res.body.data.attempted).toBe(false);
    expect(res.body.data.refusal.code).toBe('CORROBORATION_ABSENT');
    expect(res.body.data.wrote).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  /**
   * WOULD CATCH: a row with no post id being asked about anyway, or being marked
   * unconfirmed. There is nothing to ask, so nothing is asked and nothing is written.
   */
  it('refuses a row with no post id without calling out', async () => {
    replyRow = { ...AUTHENTIC_ROW, x_post_id: null };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post('/replies/7/corroborate');
    vi.unstubAllGlobals();
    expect(res.body.data.attempted).toBe(false);
    expect(res.body.data.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * WOULD CATCH: the writer being bypassed, the ladder being re-implemented, or more than one
   * request going out. ONE attempt, no retries, and the rows land through `postTime.ts`'s own
   * writer.
   */
  it('makes exactly one keyless request, records what came back, and grades it', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(oembedBody), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post('/replies/7/corroborate');
    vi.unstubAllGlobals();

    expect(res.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain('publish.twitter.com/oembed');
    /* No credential travels with it, because none exists. */
    const init = fetchSpy.mock.calls[0]![1] as RequestInit | undefined;
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization|bearer|token/i);

    expect(res.body.data.attempted).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.wrote.length).toBeGreaterThan(0);
    expect(inserts.some((i) => /INSERT INTO marketing_reply_corroboration/.test(i.sql))).toBe(true);
    expect(res.body.data.grade.kind).toBe('measured');
    expect(res.body.data.grade.value.rung).toBe('email_oembed_confirmed');
    expect(res.body.data.postedOnDisplayed).toBe('2026-08-01');
  });

  /**
   * WOULD CATCH: an agreeing corroboration persisting a copy of a stranger's post text. 0062
   * keeps an observed value only on disagreement, and the writer enforces it — this asserts
   * the route did not route around it.
   */
  it('persists no observed value on an agreeing row', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(oembedBody), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSpy);
    await post('/replies/7/corroborate');
    vi.unstubAllGlobals();
    const corroborationInserts = inserts.filter((i) => /marketing_reply_corroboration/.test(i.sql));
    expect(corroborationInserts.length).toBeGreaterThan(0);
    for (const ins of corroborationInserts) {
      const outcome = ins.params[3];
      const observedValue = ins.params[4];
      if (outcome === 'agrees') expect(observedValue).toBeNull();
    }
  });

  /**
   * WOULD CATCH: a 404 from X being recorded as a contradiction. A deleted post is ordinary
   * and is not evidence the reply was fabricated.
   */
  it('records a deleted post as could_not_check, never as a disagreement', async () => {
    const fetchSpy = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post('/replies/7/corroborate');
    vi.unstubAllGlobals();
    expect(res.body.data.status).toBe('not_public');
    expect(res.body.data.disagreements).toBe(0);
    for (const w of res.body.data.wrote) expect(w.outcome).toBe('could_not_check');
  });
});
