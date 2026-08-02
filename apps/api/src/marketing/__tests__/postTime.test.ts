import { beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

import {
  _resetCorroborationProbe,
  buildCorroborations,
  measurePostTimeCoverage,
  postDateToRecord,
  runPostTimeSweep,
  type PostTimeCandidate,
} from '../postTime.js';
import { fetchOEmbed, resetOEmbedHealth, type OEmbedResult } from '../oembed.js';
import { gradeInboundItem, type InboundItem, type LadderVerdict } from '../provenanceLadder.js';
import { _resetMigrated } from '../service.js';

/**
 * THE POST-TIME SWEEP — the caller that was missing, and the four ways a caller like this
 * lies.
 *
 * WHAT THESE TESTS ARE FOR. `oembed.ts`, `provenanceLadder.ts` and `recordPostedOn` were
 * each tested and each had no caller, so every assertion about post-time coverage and
 * anti-forgery corroboration was an assertion about code that never ran. These tests are
 * about the WIRING, and specifically about the four places where wiring an honest engine to
 * a database produces a dishonest result:
 *
 *   1. treating "we could not check" as "this is fake" — the failure that would turn a
 *      deleted post or a 429 into an accusation;
 *   2. dividing by the rows the sweep happened to try, which reads 100% on the first
 *      success;
 *   3. writing the observation instant where the post date belongs, which is the
 *      header-date defect again;
 *   4. letting an outage lower the whole queue's standing with nothing recording that it
 *      did.
 *
 * A RECORDED QUERY LOG rather than a database, for the reason `m0Service.test.ts` gives:
 * what is asserted is WHICH statements run and what they carry — that `observed_at` is the
 * fetch instant, that a value is persisted only on disagreement, that no UPDATE touches a
 * row whose lookup failed. CI has no marketing schema, and a real database would prove the
 * SQL executes without proving any of those.
 */

interface Recorded {
  sql: string;
  params: unknown[];
}

interface CorpusShape {
  rows_held: number;
  with_post_date: number;
  lookup_eligible: number;
  earliest: string | null;
}

interface FakeOptions {
  candidates?: readonly Record<string, unknown>[];
  corpus?: CorpusShape;
  replyTable?: boolean;
  corroborationTable?: boolean;
  /** rowCount for `recordPostedOn`'s UPDATE. 0 models a row that vanished. */
  updateRowCount?: number;
}

function fakePool(o: FakeOptions = {}): { pool: Pool; log: Recorded[] } {
  const log: Recorded[] = [];
  const answer = (sql: string): { rows: unknown[]; rowCount: number } => {
    if (/to_regclass\('public\.marketing_x_reply'\)/.test(sql)) {
      return { rows: [{ ok: o.replyTable ?? true }], rowCount: 1 };
    }
    if (/to_regclass\('public\.marketing_reply_corroboration'\)/.test(sql)) {
      return { rows: [{ ok: o.corroborationTable ?? true }], rowCount: 1 };
    }
    if (/FROM marketing_x_reply r/.test(sql)) {
      const rows = [...(o.candidates ?? [])];
      return { rows, rowCount: rows.length };
    }
    if (/count\(posted_on_displayed\)/.test(sql)) {
      const c = o.corpus ?? { rows_held: 0, with_post_date: 0, lookup_eligible: 0, earliest: null };
      return { rows: [c], rowCount: 1 };
    }
    if (/INSERT INTO marketing_reply_corroboration/.test(sql)) return { rows: [], rowCount: 1 };
    if (/UPDATE marketing_x_reply/.test(sql)) return { rows: [], rowCount: o.updateRowCount ?? 1 };
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      log.push({ sql, params });
      return answer(sql);
    },
  } as unknown as Pool;
  return { pool, log };
}

const sqlOf = (log: Recorded[], re: RegExp): Recorded[] => log.filter((q) => re.test(q.sql));

/* ── the fixtures ───────────────────────────────────────────────────────────── */

const AT = '2026-08-02T10:00:00.000Z';
const now = () => new Date(AT);

const CLAIMED_BODY =
  'I have been waiting eleven days for my withdrawal and support has not answered a single message';
const X_TEXT = CLAIMED_BODY;

const candidateRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 41,
  x_comment_id: '1799887766554433221',
  x_post_id: '1799887766554433221',
  author_handle: 'cryptocurious',
  author_display: 'Crypto Curious',
  body: CLAIMED_BODY,
  posted_on_displayed: null,
  received_at: '2026-08-02T09:00:00.000Z',
  sender_dkim_domain: 'x.com',
  sender_auth_evidence: 'dkim=pass header.d=x.com',
  ...over,
});

const candidate = (over: Partial<PostTimeCandidate> = {}): PostTimeCandidate => ({
  id: 41,
  xCommentId: '1799887766554433221',
  xPostId: '1799887766554433221',
  authorHandle: 'cryptocurious',
  authorDisplay: 'Crypto Curious',
  body: CLAIMED_BODY,
  postedOnDisplayed: null,
  receivedAt: '2026-08-02T09:00:00.000Z',
  senderDkimDomain: 'x.com',
  senderAuthEvidence: 'dkim=pass header.d=x.com',
  ...over,
});

/** An oEmbed 200 body in X's own shape — the same fixture shape `oembed.test.ts` uses. */
const oembedBody = (o: { handle?: string; postId?: string; name?: string; text?: string; date?: string } = {}): string => {
  const handle = o.handle ?? 'cryptocurious';
  const postId = o.postId ?? '1799887766554433221';
  const name = o.name ?? 'Crypto Curious';
  return JSON.stringify({
    url: `https://twitter.com/${handle}/status/${postId}`,
    author_name: name,
    author_url: `https://twitter.com/${handle}`,
    html:
      `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${o.text ?? X_TEXT}</p>`
      + `&mdash; ${name} (@${handle}) <a href="https://twitter.com/${handle}/status/${postId}?ref_src=twsrc%5Etfw">`
      + `${o.date ?? 'August 1, 2026'}</a></blockquote>`,
  });
};

const okFetch = (body: string): typeof fetch =>
  (async () => ({ status: 200, ok: true, text: async () => body })) as unknown as typeof fetch;

const statusFetch = (status: number): typeof fetch =>
  (async () => ({ status, ok: status >= 200 && status < 300, text: async () => '' })) as unknown as typeof fetch;

async function lookup(handle: string, postId: string, f: typeof fetch): Promise<OEmbedResult> {
  return await fetchOEmbed({ handle, postId }, { fetchImpl: f, now });
}

function verdictFor(row: PostTimeCandidate, result: OEmbedResult): LadderVerdict {
  const item: InboundItem = {
    itemId: row.xCommentId,
    channel: 'x_notification_email',
    claimedAuthorHandle: row.authorHandle,
    claimedPostId: row.xPostId,
    claimedText: row.body,
    receivedAt: row.receivedAt,
    sender: {
      dkimPass: true,
      dkimDomain: row.senderDkimDomain,
      arcPass: false,
      arcSealerDomain: null,
      rawAuthenticationResults: row.senderAuthEvidence,
    },
    oembed: result,
    syndication: null,
    operator: null,
    mirrorHost: null,
  };
  return gradeInboundItem(item);
}

beforeEach(() => {
  resetOEmbedHealth();
  _resetMigrated();
  _resetCorroborationProbe();
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 1. WHAT oEmbed COULD NOT CONFIRM IS NOT THEREBY FAKE
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('a post oEmbed cannot confirm is graded unconfirmed, never contradicted', () => {
  /**
   * THE DEFECT THIS FORBIDS. A 404 on `publish.twitter.com/oembed` means "no publicly
   * embeddable post at that URL", which a deleted post, a protected account and a post
   * that never existed all produce. Filing that as `disagrees` would put an ordinary
   * deletion in the same bucket as a forged notification, and `observed_value` would then
   * carry evidence of a contradiction that never happened.
   */
  it('files a 404 as could_not_check on post_id, with nothing else claimed', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, statusFetch(404));
    expect(res.status).toBe('not_public');

    const writes = buildCorroborations(row, res, verdictFor(row, res));
    expect(writes).toHaveLength(1);
    expect(writes[0].field).toBe('post_id');
    expect(writes[0].outcome).toBe('could_not_check');
    expect(writes[0].observedValue).toBeNull();
    expect(writes[0].detail).toContain('POST_NOT_FOUND');
    expect(writes.some((w) => w.outcome === 'disagrees')).toBe(false);
  });

  it.each([
    [403, 'POST_NOT_VISIBLE'],
    [429, 'CHANNEL_RATE_LIMITED'],
    [500, 'CHANNEL_UPSTREAM_ERROR'],
  ])('files HTTP %i as could_not_check naming %s, never as disagreement', async (status, code) => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, statusFetch(status as number));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    expect(writes.map((w) => w.outcome)).toEqual(['could_not_check']);
    expect(writes[0].detail).toContain(code as string);
  });

  /**
   * A 200 WITH ZERO BYTES IS THE ONE THAT MANUFACTURES FICTION (mkt-r3 §2.1: both X
   * syndication timeline endpoints did exactly this). It must not read as "no post".
   */
  it('files a 2xx with an empty body as could_not_check, not as absence', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(''));
    expect(res.code).toBe('MALFORMED_RESPONSE');
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    expect(writes.map((w) => w.outcome)).toEqual(['could_not_check']);
  });

  it('never records a post date from a lookup that did not confirm the post', async () => {
    const row = candidate();
    for (const s of [404, 403, 429, 500]) {
      const res = await lookup(row.authorHandle, row.xPostId, statusFetch(s));
      expect(postDateToRecord(verdictFor(row, res))).toBeNull();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 2. WHAT A CONFIRMATION ACTUALLY PROVES, AND WHAT IT IS ALLOWED TO STORE
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('a confirmed lookup files agreement per field, and stores nothing it need not', () => {
  it('agrees on post_id, author_handle, author_display and post_text', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody()));
    expect(res.status).toBe('confirmed');
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    const byField = Object.fromEntries(writes.map((w) => [w.field, w.outcome]));
    expect(byField).toEqual({
      post_id: 'agrees',
      author_handle: 'agrees',
      post_text: 'agrees',
      author_display: 'agrees',
    });
  });

  /**
   * 0062: `observed_value` is kept ONLY where the channel disagreed, because on agreement
   * the value is already in the row and a second copy of a stranger's post text on every
   * corroborated reply re-creates the data-minimisation problem `raw_email` had.
   */
  it('persists no observed_value on any agreeing or unchecked row', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody()));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    for (const w of writes) {
      if (w.outcome !== 'disagrees') expect(w.observedValue).toBeNull();
    }
  });

  /** The two instants are two columns. `observed_at` is when we looked, and only that. */
  it('stamps every row with the fetch instant and never with the post date', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody()));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.observedAt).toBe(AT);
      expect(w.observedAt).not.toBe('2026-08-01');
      expect(w.undocumented).toBe(false);
      expect(w.channel).toBe('oembed');
    }
  });

  /** The date is X's, is a calendar date, and carries no invented time-of-day. */
  it('takes the post date from the ladder as a calendar date only', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody({ date: 'August 1, 2026' })));
    const date = postDateToRecord(verdictFor(row, res));
    expect(date).toBe('2026-08-01');
    expect(date).not.toMatch(/T|:/);
  });

  /**
   * NO `language` ROW AND NO `posted_at` ROW ON A FIRST LOOKUP. Corroboration is agreement
   * BETWEEN CHANNELS. No column holds a claimed language, and this row held no claimed
   * date, so filing `agrees` would show two channels concurring where only one spoke.
   */
  it('files no agreement for a field nothing else claimed', async () => {
    const row = candidate({ postedOnDisplayed: null });
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody()));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    expect(writes.map((w) => w.field)).not.toContain('language');
    expect(writes.map((w) => w.field)).not.toContain('posted_at');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 3. DISAGREEMENT — RECORDED, WITH THE EVIDENCE, AND NEVER AVERAGED AWAY
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('a genuine disagreement is recorded with X’s value', () => {
  it('files post_text as disagrees and keeps X’s text as the evidence', async () => {
    const row = candidate();
    const res = await lookup(
      row.authorHandle,
      row.xPostId,
      okFetch(oembedBody({ text: 'Great work team, the new staking dashboard is excellent and fast' })),
    );
    const v = verdictFor(row, res);
    const writes = buildCorroborations(row, res, v);
    const text = writes.find((w) => w.field === 'post_text');
    expect(text?.outcome).toBe('disagrees');
    expect(text?.observedValue).toContain('staking dashboard');
    // Graded down for a human to read, NOT quarantined: the mail really came from X.
    expect(v.state).toBe('graded');
  });

  it('truncates a persisted disagreement rather than storing an essay', async () => {
    const row = candidate();
    // Distinct words, none of them in the claimed body: a real contradiction, at length.
    const long = Array.from({ length: 600 }, (_, i) => `unrelated${i}`).join(' ');
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody({ text: long })));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    const text = writes.find((w) => w.field === 'post_text');
    expect(text?.outcome).toBe('disagrees');
    expect((text?.observedValue ?? '').length).toBeLessThanOrEqual(2_100);
    expect(text?.observedValue).toContain('truncated');
  });

  /**
   * AN AUTHOR MISMATCH IS THE ONE THE COMPARTMENT EXISTS TO CATCH, and the sweep must not
   * take the half of the lookup it likes: the date from a lookup whose author contradicts
   * the row is not a date this row may keep.
   */
  it('files author_handle as disagrees and adopts no date from that lookup', async () => {
    const row = candidate({ authorHandle: 'cryptocurious' });
    const res = await lookup('cryptocurious', row.xPostId, okFetch(oembedBody({ handle: 'not_the_author' })));
    // oEmbed answers about a different handle for the id we asked about.
    expect(res.status).toBe('confirmed');
    const v = verdictFor(row, res);
    expect(v.state).toBe('quarantined');
    const writes = buildCorroborations(row, res, v);
    const author = writes.find((w) => w.field === 'author_handle');
    expect(author?.outcome).toBe('disagrees');
    expect(author?.observedValue).toBe('not_the_author');
    expect(postDateToRecord(v)).toBeNull();
  });

  it('files a display-name difference without re-attributing the post', async () => {
    const row = candidate({ authorDisplay: 'Crypto Curious' });
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody({ name: 'LCX Support (official)' })));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    const display = writes.find((w) => w.field === 'author_display');
    expect(display?.outcome).toBe('disagrees');
    expect(display?.observedValue).toBe('LCX Support (official)');
    expect(writes.find((w) => w.field === 'author_handle')?.outcome).toBe('agrees');
  });

  /**
   * THE MIDDLE VERDICT IS REAL AND MUST SURVIVE THE ROUND TRIP. The email body extractor
   * is crude by design, so a partial overlap is evidence neither way — and collapsing it
   * into either `agrees` or `disagrees` would either manufacture a confirmation or accuse
   * a customer of forgery on the strength of a bad HTML strip.
   */
  it('treats a partially-overlapping text as could_not_check, not as either verdict', async () => {
    const row = candidate();
    const res = await lookup(
      row.authorHandle,
      row.xPostId,
      okFetch(
        oembedBody({
          text:
            'waiting eleven days withdrawal support answered however the mobile application '
            + 'interface remains responsive during peak periods',
        }),
      ),
    );
    const v = verdictFor(row, res);
    expect(v.state === 'graded' && v.textComparison?.verdict).toBe('not_comparable');
    const text = buildCorroborations(row, res, v).find((w) => w.field === 'post_text');
    expect(text?.outcome).toBe('could_not_check');
    expect(text?.observedValue).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 4. A RE-CHECK — THE ONE CASE WHERE A DATE CAN BE CORROBORATED
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('a second observation of an already-dated row corroborates the date', () => {
  it('files posted_at as agrees when X still renders the stored date', async () => {
    const row = candidate({ postedOnDisplayed: '2026-08-01' });
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody({ date: 'August 1, 2026' })));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    const date = writes.find((w) => w.field === 'posted_at');
    expect(date?.outcome).toBe('agrees');
    expect(date?.observedValue).toBeNull();
  });

  it('files posted_at as disagrees, with X’s date, when the two differ', async () => {
    const row = candidate({ postedOnDisplayed: '2026-07-04' });
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(oembedBody({ date: 'August 1, 2026' })));
    const writes = buildCorroborations(row, res, verdictFor(row, res));
    const date = writes.find((w) => w.field === 'posted_at');
    expect(date?.outcome).toBe('disagrees');
    expect(date?.observedValue).toBe('2026-08-01');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 5. THE SWEEP — WHAT IT WRITES, AND WHAT IT REFUSES TO WRITE
 * ═════════════════════════════════════════════════════════════════════════════ */

const CORPUS: CorpusShape = {
  rows_held: 87,
  with_post_date: 12,
  lookup_eligible: 60,
  earliest: '2026-07-01T00:00:00.000Z',
};

describe('the sweep writes the corroboration row and the post date, to different columns', () => {
  it('records X’s calendar date through recordPostedOn, and the fetch instant on the evidence', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const update = sqlOf(log, /UPDATE marketing_x_reply/);
    expect(update).toHaveLength(1);
    // THE POST DATE, not the observation instant. The whole M0 defect-4 lesson.
    expect(update[0].params).toEqual(['1799887766554433221', '2026-08-01']);
    expect(update[0].sql).toContain("posted_at_source = 'oembed_display_date'");

    const inserts = sqlOf(log, /INSERT INTO marketing_reply_corroboration/);
    expect(inserts.length).toBeGreaterThan(0);
    for (const i of inserts) {
      expect(i.params[0]).toBe(41);            // reply_id
      expect(i.params[1]).toBe('oembed');      // channel
      expect(i.params[6]).toBe(false);         // undocumented
      expect(i.params[7]).toBe(AT);            // observed_at === when we looked
    }
    expect(out.counts.postDatesRecorded).toBe(1);
    expect(out.counts.confirmed).toBe(1);
  });

  /** The upsert is 0062's unique index: a flapping channel must not inflate the evidence. */
  it('upserts on (reply_id, channel, field) rather than accumulating rows', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    const inserts = sqlOf(log, /INSERT INTO marketing_reply_corroboration/);
    expect(inserts[0].sql).toContain('ON CONFLICT (reply_id, channel, field) DO UPDATE');
  });

  it('writes no post date for a row oEmbed could not confirm, but does record that it asked', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: statusFetch(404), now });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(sqlOf(log, /UPDATE marketing_x_reply/)).toHaveLength(0);
    const inserts = sqlOf(log, /INSERT INTO marketing_reply_corroboration/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[3]).toBe('could_not_check');
    expect(inserts[0].params[4]).toBeNull();
    expect(out.counts.notPublic).toBe(1);
    expect(out.counts.postDatesRecorded).toBe(0);
  });

  /** ONE ATTEMPT PER ROW. No retries, so a bad afternoon cannot become a request storm. */
  it('issues exactly one request per candidate', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls += 1;
      return { status: 200, ok: true, text: async () => oembedBody() };
    }) as unknown as typeof fetch;
    const rows = [candidateRow({ id: 1, x_comment_id: '111111111111111111' }),
                  candidateRow({ id: 2, x_comment_id: '222222222222222222' }),
                  candidateRow({ id: 3, x_comment_id: '333333333333333333' })];
    const { pool } = fakePool({ candidates: rows, corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: counting, now });
    expect(out.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('honours the caller’s limit and caps it, so one tick cannot become a ten-minute job', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now, limit: 5_000 });
    const select = sqlOf(log, /FROM marketing_x_reply r/);
    expect(select[0].params[1]).toBe(100);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 6. AN OUTAGE MAY NOT QUIETLY LOWER THE QUEUE
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('an outage is stated, never absorbed', () => {
  /** Open the breaker the way production would: three consecutive channel failures. */
  async function openBreaker(): Promise<void> {
    for (let i = 0; i < 3; i += 1) await lookup('cryptocurious', '1799887766554433221', statusFetch(500));
  }

  it('refuses the whole sweep while the breaker is open, and touches nothing', async () => {
    await openBreaker();
    let called = false;
    const spy: typeof fetch = (async () => {
      called = true;
      return { status: 200, ok: true, text: async () => oembedBody() };
    }) as unknown as typeof fetch;
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: spy, now });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('MKT_POSTTIME_CHANNEL_COOLING');
    expect(out.rule).toContain('mkt-r3');
    expect(called).toBe(false);
    expect(sqlOf(log, /INSERT INTO marketing_reply_corroboration/)).toHaveLength(0);
    expect(sqlOf(log, /UPDATE marketing_x_reply/)).toHaveLength(0);
    // The corpus is still measurable and still honest while the channel is down.
    expect(out.coverage?.kind).toBe('measured');
  });

  /**
   * THE BREAKER OPENING MID-SWEEP IS THE INTERESTING CASE. Without `stoppedEarly`, a run
   * that reached four of nine rows is indistinguishable from a run that found nothing else
   * to do — and the queue quietly looks checked.
   */
  it('stops when the breaker opens mid-sweep and records how many rows it never asked', async () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      candidateRow({ id: i + 1, x_comment_id: `1799887766554433${String(200 + i)}` }),
    );
    let calls = 0;
    const failing: typeof fetch = (async () => {
      calls += 1;
      return { status: 503, ok: false, text: async () => '' };
    }) as unknown as typeof fetch;
    const { pool } = fakePool({ candidates: rows, corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: failing, now });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.stoppedEarly).not.toBeNull();
    expect(out.stoppedEarly?.candidatesNotAttempted).toBeGreaterThan(0);
    expect(out.counts.attempted).toBeLessThan(rows.length);
    expect(out.counts.notAttempted).toBe(rows.length - out.counts.attempted);
    expect(calls).toBeLessThan(rows.length);
    expect(out.channelHealth.cooling).toBe(true);
  });

  /**
   * THE NOTICE IS A REQUIRED FIELD AND IT COMES FROM THE LADDER, so there is one
   * degradation sentence in the compartment rather than a second one written here.
   */
  it('hands back the ladder’s degradation notice when the channel did not answer', async () => {
    const { pool } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: statusFetch(429), now });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.notice).not.toBeNull();
    expect(out.notice?.code).toBe('MKT_PROV_CORROBORATION_DEGRADED');
    expect(out.notice?.message).toContain('instrument fault');
    expect(out.counts.channelUnavailable).toBe(1);
  });

  it('reports no notice when every lookup answered', async () => {
    const { pool } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.notice).toBeNull();
    expect(out.stoppedEarly).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 7. NOTHING TO DO IS NOT AN ALL-CLEAR
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('the sweep refuses rather than returning a confident nothing', () => {
  it('refuses an empty candidate set instead of reporting a successful zero-row run', async () => {
    const { pool } = fakePool({ candidates: [], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('MKT_POSTTIME_NO_CANDIDATES');
    expect(out.message).toContain('NOT a statement that the queue is fully corroborated');
  });

  /**
   * 0062 IS APPLIED BY HAND, so there is a live window where the code ships ahead of the
   * table. A scheduled job 500ing every minute is the "looks like an outage" defect
   * `deploySafety.test.ts` exists to prevent.
   */
  it('refuses when 0062 has not been applied, without performing a single lookup', async () => {
    let called = false;
    const spy: typeof fetch = (async () => {
      called = true;
      return { status: 200, ok: true, text: async () => oembedBody() };
    }) as unknown as typeof fetch;
    const { pool, log } = fakePool({ candidates: [candidateRow()], corroborationTable: false });
    const out = await runPostTimeSweep(pool, { fetchImpl: spy, now });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('MKT_POSTTIME_NOT_MIGRATED');
    expect(called).toBe(false);
    expect(sqlOf(log, /INSERT INTO marketing_reply_corroboration/)).toHaveLength(0);
    expect(out.coverage).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 8. COVERAGE IS A FRACTION OVER THE CORPUS, WITH A FRAME, AND NEVER A PERCENTAGE
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('post-time coverage', () => {
  /**
   * THE DEFECT THIS FORBIDS, quoted from the web client it forced a workaround into: "the
   * coverage sentence had to stop dividing by the loaded page, since a page-wide ratio
   * would have read 100% the moment one row happened to carry a date". A sweep that
   * attempts two rows and confirms both must not report full coverage of 87 stored replies.
   */
  it('divides by the corpus, not by the rows the sweep happened to try', async () => {
    const rows = [candidateRow({ id: 1, x_comment_id: '111111111111111111' }),
                  candidateRow({ id: 2, x_comment_id: '222222222222222222' })];
    const { pool } = fakePool({ candidates: rows, corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(out.ok).toBe(true);
    if (!out.ok || out.coverage.kind !== 'measured') throw new Error('expected a measured coverage figure');
    expect(out.counts.attempted).toBe(2);
    expect(out.counts.confirmed).toBe(2);
    expect(out.coverage.value.denominator).toBe(87);
    expect(out.coverage.value.numerator).toBe(12);
    expect(out.coverage.value.numerator).not.toBe(out.counts.attempted);
    expect(out.coverage.value.denominator).not.toBe(out.counts.attempted);
  });

  it('states the fraction in words and never as a percentage', async () => {
    const { pool } = fakePool({ corpus: CORPUS });
    const fig = await measurePostTimeCoverage(pool, AT, '2026-08-02T09:59:00.000Z');
    if (fig.kind !== 'measured') throw new Error('expected a measured figure');
    expect(fig.value.statement).toContain('12 of 87');
    expect(fig.value.statement).not.toContain('%');
    // No field on the figure may be a ratio: a reader must be able to see both halves.
    expect(Object.keys(fig.value)).not.toContain('percent');
    expect(Object.keys(fig.value)).not.toContain('pct');
    expect(Object.keys(fig.value)).not.toContain('rate');
    expect(Object.keys(fig.value)).not.toContain('ratio');
  });

  /** `0/0` on a panel is indistinguishable from "we never fail". It refuses instead. */
  it('refuses on an empty corpus rather than reporting zero of zero', async () => {
    const { pool } = fakePool({ corpus: { rows_held: 0, with_post_date: 0, lookup_eligible: 0, earliest: null } });
    const fig = await measurePostTimeCoverage(pool, AT, null);
    expect(fig.kind).toBe('absent');
    if (fig.kind !== 'absent') return;
    expect(fig.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(fig.refusal.sentence).toContain('not full coverage and not zero coverage');
    expect(fig.refusal.recovery.kind).toBe('supply_data');
  });

  /**
   * THE FRAME IS CHECKED BY `measured()`, so a frame claiming a population it does not
   * have cannot be smuggled in behind a legitimate number. What is asserted here is that
   * the frame passed that check AND that it names the absences a reader needs.
   */
  it('carries an ObservationFrame that names what the window cannot see', async () => {
    const { pool } = fakePool({ corpus: CORPUS });
    const fig = await measurePostTimeCoverage(pool, AT, '2026-08-02T09:00:00.000Z');
    if (fig.kind !== 'measured') throw new Error('expected a measured figure');
    expect(fig.frame.source).toBe('own_record');
    expect(fig.frame.completeness).toBe('census_of_own_corpus');
    expect(fig.frame.windowTo).toBe(AT);
    expect(fig.frame.windowFrom).toBe('2026-07-01T00:00:00.000Z');
    expect(fig.frame.lastSuccessfulPollAt).toBe('2026-08-02T09:00:00.000Z');
    const absences = fig.frame.doesNotCapture.join(' | ');
    expect(absences).toContain('retention');
    expect(absences).toContain('deleted, protected or suspended');
    expect(absences).toContain('time of day');
  });

  /**
   * A PLATEAU MUST BE EXPLICABLE. `arc` and `operator_paste` rows can never get a date
   * through this path because the store keeps no column for their ladder inputs, so a
   * reader who watches coverage stop climbing can tell a channel problem from a schema one.
   */
  it('separates rows this path can never fill from rows it has not filled yet', async () => {
    const { pool } = fakePool({ corpus: CORPUS });
    const fig = await measurePostTimeCoverage(pool, AT, null);
    if (fig.kind !== 'measured') throw new Error('expected a measured figure');
    expect(fig.value.lookupEligible).toBe(60);
    expect(fig.value.notLookupEligible).toBe(27);
    expect(fig.value.statement).toContain('can never be filled by this path');
  });

  /** The last successful poll comes from the channel's own health, not from this sweep. */
  it('reports the channel’s last success beside the figure', async () => {
    const { pool } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    const out = await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(out.ok).toBe(true);
    if (!out.ok || out.coverage.kind !== 'measured') throw new Error('expected a measured figure');
    expect(out.coverage.frame.lastSuccessfulPollAt).toBe(AT);
    expect(out.channelHealth.lastSuccessAt).toBe(AT);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 9. THE CANDIDATE QUERY — WHY IT IS SAFE TO SCHEDULE
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('the candidate query', () => {
  it('excludes quarantined rows, id-less rows, and rows checked recently', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now, recheckAfterHours: 6 });
    const select = sqlOf(log, /FROM marketing_x_reply r/)[0];
    expect(select.sql).toContain('NOT r.quarantined');
    expect(select.sql).toContain('r.x_post_id IS NOT NULL');
    expect(select.sql).toContain('NOT EXISTS');
    expect(select.sql).toContain("c.channel = 'oembed'");
    expect(select.params[0]).toBe('6');
  });

  /**
   * WITHOUT THE RECHECK WINDOW THIS SWEEP IS A RETRY STORM WITH A CRON ATTACHED: a post
   * deleted last March 404s on every tick forever, and burns the request budget of every
   * row that could have been confirmed.
   */
  it('never asks for a window shorter than an hour, however it is called', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now, recheckAfterHours: 0 });
    expect(sqlOf(log, /FROM marketing_x_reply r/)[0].params[0]).toBe('1');
  });

  /** Undated rows first: the scarce request budget goes where it can move coverage. */
  it('orders undated rows ahead of re-checks', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    expect(sqlOf(log, /FROM marketing_x_reply r/)[0].sql)
      .toContain('ORDER BY (r.posted_on_displayed IS NOT NULL), r.received_at ASC');
  });

  /**
   * ONLY ROWS THE LADDER CAN BE FED FAITHFULLY. `arc` rows have no stored sealer domain and
   * operator pastes have no stored operator, so grading them would either fabricate a trust
   * anchor or quarantine a row the ingest already authenticated. The restriction is in the
   * WHERE clause, not in a comment.
   */
  it('selects only dkim-authenticated notification mail', async () => {
    const { pool, log } = fakePool({ candidates: [candidateRow()], corpus: CORPUS });
    await runPostTimeSweep(pool, { fetchImpl: okFetch(oembedBody()), now });
    const sql = sqlOf(log, /FROM marketing_x_reply r/)[0].sql;
    expect(sql).toContain("r.source_kind = 'x_notification_email'");
    expect(sql).toContain("r.sender_auth_state = 'dkim'");
    expect(sql).toContain('r.sender_dkim_domain IS NOT NULL');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 10. THE DATE'S PROVENANCE MUST MATCH THE COLUMN IT IS FILED UNDER
 * ═════════════════════════════════════════════════════════════════════════════ */

describe('only a date oEmbed displayed is written through recordPostedOn', () => {
  /**
   * THE LAUNDERING THIS FORBIDS. `recordPostedOn` stamps `posted_at_source =
   * 'oembed_display_date'`. The ladder's own `dateFields` will supply a date from the
   * UNDOCUMENTED syndication backend when oEmbed could not confirm the post — a real
   * observation, graded D4, and a different provenance. Writing it under the oEmbed stamp
   * would turn an undocumented source into a documented one inside the column an audit
   * reads, which is exactly the substitution the header-date defect made.
   */
  it('refuses a date the ladder took from the undocumented syndication backend', async () => {
    const row = candidate();
    const res = await lookup(row.authorHandle, row.xPostId, statusFetch(404));
    const v = gradeInboundItem({
      itemId: row.xCommentId,
      channel: 'x_notification_email',
      claimedAuthorHandle: row.authorHandle,
      claimedPostId: row.xPostId,
      claimedText: row.body,
      receivedAt: row.receivedAt,
      sender: {
        dkimPass: true,
        dkimDomain: 'x.com',
        arcPass: false,
        arcSealerDomain: null,
        rawAuthenticationResults: null,
      },
      oembed: res,
      syndication: {
        postId: row.xPostId,
        favouritesObservedLowerBound: 3,
        repliesObservedLowerBound: 1,
        createdAtExact: '2026-07-04T11:22:33.000Z',
        isBlueVerified: null,
        verifiedType: null,
        isEdited: null,
        pollCountsAreFinal: null,
        fetchedAt: AT,
        sourceIsUndocumented: true,
      },
      operator: null,
      mirrorHost: null,
    });
    expect(v.state).toBe('graded');
    if (v.state !== 'graded') return;
    // The ladder DOES hold a date here, and says honestly where it came from.
    expect(v.postedOnDisplayed).toBe('2026-07-04');
    expect(v.postedAtSource).toBe('syndication_embed');
    // And this sweep still writes nothing, because its column stamp would misdescribe it.
    expect(postDateToRecord(v)).toBeNull();
  });
});

describe('a confirmed post whose embed carried no date', () => {
  /**
   * THE FIXTURE THAT SEPARATES THE TWO GUARDS. oEmbed confirms the post and its author — so
   * the row is graded and `confirmedAuthorHandle` is set — but X's embed markup carried no
   * date anchor, so the ladder falls back to the syndication instant for its date field.
   * Everything about the row now looks writable except the one thing that matters: the date
   * did not come from the channel this column's stamp names.
   */
  it('writes no date when the ladder had to fall back to the undocumented instant', async () => {
    const row = candidate();
    const noDateBody = JSON.stringify({
      url: `https://twitter.com/${row.authorHandle}/status/${row.xPostId}`,
      author_name: 'Crypto Curious',
      author_url: `https://twitter.com/${row.authorHandle}`,
      html:
        `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${CLAIMED_BODY}</p>`
        + `&mdash; Crypto Curious (@${row.authorHandle}) <a href="https://twitter.com/x/status/1">Read more</a></blockquote>`,
    });
    const res = await lookup(row.authorHandle, row.xPostId, okFetch(noDateBody));
    expect(res.status).toBe('confirmed');
    expect(res.post?.postedOnDisplayed).toBeNull();

    const v = gradeInboundItem({
      itemId: row.xCommentId,
      channel: 'x_notification_email',
      claimedAuthorHandle: row.authorHandle,
      claimedPostId: row.xPostId,
      claimedText: row.body,
      receivedAt: row.receivedAt,
      sender: { dkimPass: true, dkimDomain: 'x.com', arcPass: false, arcSealerDomain: null, rawAuthenticationResults: null },
      oembed: res,
      syndication: {
        postId: row.xPostId,
        favouritesObservedLowerBound: null,
        repliesObservedLowerBound: null,
        createdAtExact: '2026-07-04T11:22:33.000Z',
        isBlueVerified: null,
        verifiedType: null,
        isEdited: null,
        pollCountsAreFinal: null,
        fetchedAt: AT,
        sourceIsUndocumented: true,
      },
      operator: null,
      mirrorHost: null,
    });
    expect(v.state).toBe('graded');
    if (v.state !== 'graded') return;
    expect(v.confirmedAuthorHandle).toBe(row.authorHandle);
    expect(v.postedOnDisplayed).toBe('2026-07-04');
    expect(v.postedAtSource).toBe('syndication_embed');
    expect(postDateToRecord(v)).toBeNull();
  });
});
