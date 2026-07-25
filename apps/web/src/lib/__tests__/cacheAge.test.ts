/**
 * Cache age is REPORTED, and only for values that are not live (handover, T1 #22).
 *
 * The failure this guards against is the one the repo has already been burned by
 * twice: an affordance that exists in a module and is connected to nothing. So the
 * derivation is unit-tested AND driven end-to-end through the real
 * `apiClient.request()` — the function all 324 read call sites use — because a
 * helper that never runs on a real request is not a feature.
 *
 * The three properties that would fail SILENTLY:
 *   1. a live body reported as having an age (a badge on everything teaches nothing);
 *   2. a cached body reported as live (the whole honesty gap);
 *   3. a background revalidation erasing the age off a body still on screen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cacheAgeLabel } from '@/lib/readCache';

vi.mock('@/lib/container', () => ({ isTerminal: () => false }));

/* ── the pure derivation ──────────────────────────────────────────────────── */

describe('cacheAgeLabel', () => {
  // Fixture ages, not clock reads: a test that pins whatever `Date.now()` happens
  // to be is a test that passes on one machine.
  it('never says "just now" — a six-second-old value is still not live', () => {
    expect(cacheAgeLabel(6_000)).toBe('<1m old');
    expect(cacheAgeLabel(0)).toBe('<1m old');
    expect(cacheAgeLabel(59_999)).toBe('<1m old');
  });

  it('routes through the formatting bible rather than inventing a timespan', () => {
    expect(cacheAgeLabel(4 * 60_000)).toBe('4m old');
    expect(cacheAgeLabel(90 * 60_000)).toBe('2h old');
    expect(cacheAgeLabel(3 * 24 * 60 * 60_000)).toBe('3d old');
  });

  it('returns nothing rather than NaN for a nonsense age', () => {
    expect(cacheAgeLabel(Number.NaN)).toBe('');
    expect(cacheAgeLabel(-1)).toBe('');
  });
});

/* ── end to end through the real request() ────────────────────────────────── */

let fetchCalls: string[] = [];
let respond: (url: string) => { status?: number; body: unknown; headers?: Record<string, string> };

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push(`${(init?.method ?? 'GET').toUpperCase()} ${url}`);
      const r = respond(url);
      return {
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        statusText: 'OK',
        headers: new Headers(r.headers ?? {}),
        text: async () => JSON.stringify(r.body),
      } as unknown as Response;
    }),
  );
}

async function freshModules() {
  vi.resetModules();
  const api = await import('@/lib/apiClient');
  const cache = await import('@/lib/readCache');
  cache._resetReadCache();
  return { api, cache };
}

beforeEach(() => {
  fetchCalls = [];
  respond = () => ({ body: { data: 'ok' } });
  localStorage.clear();
  localStorage.setItem('lcx_operator_email', 'nik@lcx.com');
  localStorage.setItem('lcx_desk_passcode', 'test#1234');
  installFetch();
});

afterEach(() => vi.unstubAllGlobals());

describe('a live read reports no age', () => {
  it('says nothing about a body that came off the wire', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    // null is the instruction to render nothing. A value that IS live must not
    // carry a badge, or the badge stops meaning anything.
    expect(cache.cacheAge('/v1/projects')).toBeNull();
    expect(cache.servedFrom('/v1/projects')).toMatchObject({ fromCache: false });
  });

  it('says nothing about a path that has never been read', async () => {
    const { cache } = await freshModules();
    expect(cache.cacheAge('/v1/projects')).toBeNull();
  });

  it('says nothing about a never-cacheable read, however often it is made', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/access/matrix');
    await api.request('/v1/access/matrix');
    expect(fetchCalls).toHaveLength(2); // proves it really bypassed the cache
    expect(cache.cacheAge('/v1/access/matrix')).toBeNull();
  });
});

describe('a cached read reports its age', () => {
  it('reports the age of the body the caller actually received', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects'); // miss → stored
    await api.request('/v1/projects'); // hit → served locally

    expect(fetchCalls).toHaveLength(1);
    const p = cache.servedFrom('/v1/projects');
    expect(p).toMatchObject({ fromCache: true });

    // `now` is injected, so this asserts the arithmetic and not the wall clock.
    const age = cache.cacheAge('/v1/projects', p!.storedAt + 4 * 60_000);
    expect(age).toBe(4 * 60_000);
    expect(cacheAgeLabel(age!)).toBe('4m old');
  });

  it('is keyed canonically, so query order cannot hide an age', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects?a=1&b=2');
    await api.request('/v1/projects?b=2&a=1');
    expect(fetchCalls).toHaveLength(1);
    // Asked the OTHER way round again — the age must still be found.
    expect(cache.cacheAge('/v1/projects?a=1&b=2')).not.toBeNull();
  });

  it('stops claiming an age the moment the caller gets a fresh body', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    await api.request('/v1/projects');
    expect(cache.cacheAge('/v1/projects')).not.toBeNull();

    // An explicit live re-read (what a surface does when it must not be stale).
    await api.request('/v1/projects', { cache: false });
    expect(cache.cacheAge('/v1/projects')).toBeNull();
  });
});

describe('a background revalidation does not erase the age', () => {
  it('keeps the age on the body still on screen', async () => {
    const { api, cache } = await freshModules();
    respond = () => ({ body: { data: 'first' } });

    await api.request('/v1/command/overview');
    // A governed write marks the family stale without dropping it.
    await api.request('/v1/actions/command_task_status/invoke', {
      method: 'POST',
      body: { subjectId: 't1' },
    });

    respond = () => ({ body: { data: 'second' } });
    const served = await api.request<{ data: string }>('/v1/command/overview');
    expect(served.data).toBe('first'); // stale-while-revalidate: old pixels now

    // The revalidation lands. Waiting for the fetch CALL is not enough — the call
    // is recorded before the response is handled, so an assertion here would run
    // before the revalidation's own continuation and pass no matter what that
    // continuation does. One macrotask closes that window.
    await vi.waitFor(() => {
      expect(fetchCalls.filter((c) => c.includes('/v1/command/overview'))).toHaveLength(2);
    });
    await new Promise<void>((r) => setTimeout(r, 0));

    // The surface is STILL showing 'first', because nothing handed it the fresh
    // body. If the revalidation marked this path live, the badge would come off a
    // number that is exactly as old as it was a moment ago.
    expect(cache.cacheAge('/v1/command/overview')).not.toBeNull();

    // And the wait above was not vacuous: the fresh body really did get stored,
    // so the next read serves 'second'.
    const next = await api.request<{ data: string }>('/v1/command/overview');
    expect(next.data).toBe('second');
  });
});

describe('nothing survives a clear', () => {
  it('drops the age record along with the bodies', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    await api.request('/v1/projects');
    expect(cache.cacheAge('/v1/projects')).not.toBeNull();

    await cache.clearReadCache();
    expect(cache.cacheAge('/v1/projects')).toBeNull();
    expect(cache.servedFrom('/v1/projects')).toBeNull();
  });
});
