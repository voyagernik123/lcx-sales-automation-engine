import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchOEmbed,
  fetchSyndicationCounts,
  oembedHealth,
  parseEmbedDate,
  parsePostRef,
  postUrl,
  readOEmbedBody,
  resetOEmbedHealth,
  resetSyndicationBudget,
  syndicationBudgetRemaining,
  syndicationConfigured,
} from '../oembed.js';

const REF = { handle: 'lcx', postId: '2083596900754997727' };

/** A faithful copy of the shape publish.twitter.com returned on 2026-08-02. */
function oembedBody(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    url: `https://twitter.com/lcx/status/${REF.postId}`,
    author_name: 'LCX',
    author_url: 'https://twitter.com/lcx',
    html:
      '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">ETH deposits are live &amp; withdrawals resume today. ' +
      'Details: <a href="https://t.co/abc">https://t.co/abc</a></p>&mdash; LCX (@lcx) ' +
      `<a href="https://twitter.com/lcx/status/${REF.postId}?ref_src=twsrc%5Etfw">August 1, 2026</a></blockquote>`,
    provider_name: 'X',
    ...over,
  });
}

function stub(status: number, body: string, seen?: { calls: number }): typeof fetch {
  return (async () => {
    if (seen) seen.calls += 1;
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('oembed — the independent channel', () => {
  beforeEach(() => {
    resetOEmbedHealth();
    resetSyndicationBudget();
  });

  it('confirms a post and reads text, handle, lang and the true calendar date', async () => {
    const r = await fetchOEmbed(REF, { fetchImpl: stub(200, oembedBody()) });
    expect(r.status).toBe('confirmed');
    expect(r.code).toBe('CONFIRMED');
    expect(r.post?.text).toContain('ETH deposits are live & withdrawals resume today');
    expect(r.post?.text).not.toContain('<a');
    expect(r.post?.authorHandle).toBe('lcx');
    expect(r.post?.authorName).toBe('LCX');
    expect(r.post?.lang).toBe('en');
    expect(r.post?.postedOnRaw).toBe('August 1, 2026');
    expect(r.post?.postedOnDisplayed).toBe('2026-08-01');
    expect(r.post?.canonicalUrl).toBe(`https://x.com/lcx/status/${REF.postId}`);
  });

  it('a deleted post is not_public, never a confirmation and never a fabrication verdict', async () => {
    const r = await fetchOEmbed(REF, { fetchImpl: stub(404, 'not found') });
    expect(r.status).toBe('not_public');
    expect(r.code).toBe('POST_NOT_FOUND');
    expect(r.post).toBeNull();
    expect(r.message).toMatch(/not proof the reply was fabricated/i);
  });

  it('a protected account is a distinct code from a deleted post', async () => {
    const r = await fetchOEmbed(REF, { fetchImpl: stub(403, '') });
    expect(r.code).toBe('POST_NOT_VISIBLE');
    expect(r.message).toMatch(/may exist/i);
  });

  it('a rate limit and a server error are unknown — facts about the channel', async () => {
    const rl = await fetchOEmbed(REF, { fetchImpl: stub(429, '') });
    expect(rl.status).toBe('unknown');
    expect(rl.code).toBe('CHANNEL_RATE_LIMITED');
    const err = await fetchOEmbed(REF, { fetchImpl: stub(503, '') });
    expect(err.code).toBe('CHANNEL_UPSTREAM_ERROR');
  });

  it('a timeout is unknown and is not retried', async () => {
    const seen = { calls: 0 };
    const hang = ((_url: string, init?: { signal?: AbortSignal }) => {
      seen.calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }) as unknown as typeof fetch;
    const r = await fetchOEmbed(REF, { fetchImpl: hang, timeoutMs: 5 });
    expect(r.code).toBe('CHANNEL_TIMEOUT');
    expect(r.status).toBe('unknown');
    expect(seen.calls).toBe(1);
  });

  it('a 200 with an empty body is unknown, NOT "no such post"', async () => {
    const r = await fetchOEmbed(REF, { fetchImpl: stub(200, '') });
    expect(r.code).toBe('MALFORMED_RESPONSE');
    expect(r.status).toBe('unknown');
  });

  it('a profile embed carries no post and no profile data', async () => {
    const profile = JSON.stringify({
      url: 'https://twitter.com/lcx',
      html: '<a class="twitter-timeline" href="https://twitter.com/lcx?ref_src=twsrc%5Etfw"></a>',
    });
    const r = await fetchOEmbed(REF, { fetchImpl: stub(200, profile) });
    expect(r.code).toBe('NOT_A_POST');
    expect(r.message).toMatch(/no followers/i);
  });

  it('an answer about a different post id is discarded', async () => {
    const r = await fetchOEmbed(REF, {
      fetchImpl: stub(200, oembedBody({ url: 'https://twitter.com/lcx/status/999999999999' })),
    });
    expect(r.code).toBe('ID_MISMATCH');
    expect(r.post).toBeNull();
  });

  it('refuses an invalid identity without making any request', async () => {
    const seen = { calls: 0 };
    const r = await fetchOEmbed({ handle: 'not a handle', postId: 'abc' }, { fetchImpl: stub(200, oembedBody(), seen) });
    expect(r.code).toBe('INVALID_REF');
    expect(seen.calls).toBe(0);
  });

  it('opens a breaker after repeated channel failures and stops calling out', async () => {
    for (let i = 0; i < 3; i++) await fetchOEmbed(REF, { fetchImpl: stub(429, '') });
    expect(oembedHealth().cooling).toBe(true);
    expect(oembedHealth().consecutiveChannelFailures).toBe(3);
    const seen = { calls: 0 };
    const r = await fetchOEmbed(REF, { fetchImpl: stub(200, oembedBody(), seen) });
    expect(r.code).toBe('CHANNEL_COOLING');
    expect(seen.calls).toBe(0);
  });

  it('a deleted post does not trip the breaker — it is a fact about the post', async () => {
    for (let i = 0; i < 5; i++) await fetchOEmbed(REF, { fetchImpl: stub(404, '') });
    expect(oembedHealth().cooling).toBe(false);
    expect(oembedHealth().consecutiveChannelFailures).toBe(0);
  });

  it('a success clears the failure run', async () => {
    await fetchOEmbed(REF, { fetchImpl: stub(429, '') });
    await fetchOEmbed(REF, { fetchImpl: stub(200, oembedBody()) });
    expect(oembedHealth().consecutiveChannelFailures).toBe(0);
    expect(oembedHealth().lastSuccessAt).not.toBeNull();
  });

  it('parses and rejects permalinks, and only ever builds x.com URLs', () => {
    expect(parsePostRef(`https://twitter.com/LCX/status/${REF.postId}`)).toEqual({ handle: 'LCX', postId: REF.postId });
    expect(parsePostRef('https://evil.example/lcx/status/123456')).toBeNull();
    expect(parsePostRef('https://x.com/lcx/status/12')).toBeNull();
    expect(postUrl(REF)).toBe(`https://x.com/lcx/status/${REF.postId}`);
  });

  it('reads dates strictly — a shape it does not know becomes null, not a guess', () => {
    expect(parseEmbedDate('August 1, 2026')).toBe('2026-08-01');
    expect(parseEmbedDate('1 August 2026')).toBeNull();
    expect(parseEmbedDate('Augxst 1, 2026')).toBeNull();
    const noDate = readOEmbedBody(
      { url: `https://x.com/lcx/status/${REF.postId}`, author_url: 'https://x.com/lcx', html: '<p lang="en">hi there ok</p>' },
      REF,
    );
    expect('post' in noDate && noDate.post.postedOnDisplayed).toBeNull();
  });
});

describe('the undocumented syndication source', () => {
  beforeEach(() => {
    resetOEmbedHealth();
    resetSyndicationBudget();
  });

  const synBody = JSON.stringify({
    id_str: REF.postId,
    text: 'hello',
    favorite_count: 10,
    conversation_count: 3,
    created_at: '2026-08-01T16:53:07.000Z',
    isEdited: false,
    user: { is_blue_verified: true, verified_type: 'Business' },
    card: { name: 'poll4choice_text_only', counts_are_final: false },
  });

  it('is OFF by default and makes no request', async () => {
    const seen = { calls: 0 };
    const r = await fetchSyndicationCounts(REF, { fetchImpl: stub(200, synBody, seen) });
    expect(r.code).toBe('SYNDICATION_DISABLED');
    expect(r.observation).toBeNull();
    expect(seen.calls).toBe(0);
  });

  it('when explicitly enabled, names its counts as lower bounds and itself as undocumented', async () => {
    const r = await fetchSyndicationCounts(REF, { enabled: true, fetchImpl: stub(200, synBody) });
    expect(r.code).toBe('CONFIRMED');
    expect(r.observation?.favouritesObservedLowerBound).toBe(10);
    expect(r.observation?.repliesObservedLowerBound).toBe(3);
    expect(r.observation?.createdAtExact).toBe('2026-08-01T16:53:07.000Z');
    expect(r.observation?.isBlueVerified).toBe(true);
    expect(r.observation?.verifiedType).toBe('Business');
    expect(r.observation?.pollCountsAreFinal).toBe(false);
    expect(r.observation?.sourceIsUndocumented).toBe(true);
    expect(r.message).toMatch(/lower bounds/i);
  });

  it('an unrecognised shape is unknown, and a wrong id is not accepted', async () => {
    const r = await fetchSyndicationCounts(REF, { enabled: true, fetchImpl: stub(200, JSON.stringify({ id_str: '123' })) });
    expect(r.code).toBe('MALFORMED_RESPONSE');
    expect(r.observation).toBeNull();
  });

  it('is hard-capped per process', async () => {
    const start = syndicationBudgetRemaining();
    expect(start).toBeGreaterThan(0);
    for (let i = 0; i < start; i++) await fetchSyndicationCounts(REF, { enabled: true, fetchImpl: stub(200, synBody) });
    expect(syndicationBudgetRemaining()).toBe(0);
    const r = await fetchSyndicationCounts(REF, { enabled: true, fetchImpl: stub(200, synBody) });
    expect(r.code).toBe('SYNDICATION_BUDGET_EXHAUSTED');
  });

  it('unconfigured is the normal state', () => {
    expect(syndicationConfigured({})).toBe(false);
    expect(syndicationConfigured({ X_SYNDICATION_UNDOCUMENTED: 'yes' })).toBe(false);
    expect(syndicationConfigured({ X_SYNDICATION_UNDOCUMENTED: 'true' })).toBe(true);
  });
});
