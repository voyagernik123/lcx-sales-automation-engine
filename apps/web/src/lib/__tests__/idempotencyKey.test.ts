import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * REPLAY PROTECTION IS SENT, NOT JUST ACCEPTED (TERMINAL T1 #2, the client half — 2026-09-02).
 *
 * The API has honoured `Idempotency-Key` on POST /v1/actions/:id/invoke since 5a43f46. Until this
 * change no web call site sent one, so the whole reserve/complete/release cycle behind it was
 * unreachable from the desk — a proxy retry applied a governed write twice and audited it twice.
 * The key is minted once, at the single seam every invoke crosses (`request()`), so no call site
 * can forget it. These tests pin: present on every invoke, fresh per invocation, absent elsewhere,
 * and a caller-supplied key (a deliberate retry of the same logical request) is kept.
 */
type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };
const calls: Call[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init: init as Call['init'] });
    return new Response(JSON.stringify({ data: { ok: true }, meta: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('Idempotency-Key on the governed-write path', () => {
  it('every invoke carries a fresh key; a plain POST elsewhere carries none', async () => {
    const { request } = await import('../apiClient');
    await request('/v1/actions/assign/invoke', { method: 'POST', body: { subjectType: 'project', subjectId: 'p-1', params: {} }, auth: false });
    await request('/v1/actions/assign/invoke', { method: 'POST', body: { subjectType: 'project', subjectId: 'p-1', params: {} }, auth: false });
    await request('/v1/deals', { method: 'POST', body: { projectId: 'p-1' }, auth: false });
    expect(calls).toHaveLength(3);
    const [a, b, c] = calls;
    expect(a!.init.headers['Idempotency-Key'], 'first invoke has no key').toMatch(/\S{8,}/);
    expect(b!.init.headers['Idempotency-Key'], 'second invoke has no key').toMatch(/\S{8,}/);
    expect(a!.init.headers['Idempotency-Key']).not.toBe(b!.init.headers['Idempotency-Key']);
    expect(c!.init.headers['Idempotency-Key'], 'a non-invoke POST must not be deduplicated').toBeUndefined();
  });

  it('a caller-supplied key wins (the retry of one logical request keeps its key)', async () => {
    const { request } = await import('../apiClient');
    await request('/v1/actions/flag_review/invoke', { method: 'POST', body: {}, auth: false, headers: { 'Idempotency-Key': 'retry-of-7f3a' } });
    expect(calls[0]!.init.headers['Idempotency-Key']).toBe('retry-of-7f3a');
  });

  it('a GET to an invoke-shaped path is not a governed write and gets no key', async () => {
    const { request } = await import('../apiClient');
    await request('/v1/actions/assign/invoke', { auth: false });
    expect(calls[0]!.init.headers['Idempotency-Key']).toBeUndefined();
  });
});
