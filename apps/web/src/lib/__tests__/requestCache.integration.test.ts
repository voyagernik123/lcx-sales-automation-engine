/**
 * End-to-end through the REAL request() — the cache is only worth anything if it
 * is actually wired into the function all 324 read call sites use. Unit tests on
 * readCache prove the cache; these prove the wiring.
 *
 * fetch is stubbed so "did this touch the network?" is directly observable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/container', () => ({ isTerminal: () => false }));

let fetchCalls: Array<{ url: string; method: string }> = [];
let respond: (url: string) => { status?: number; body: unknown; headers?: Record<string, string> };

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
      const r = respond(url);
      const headers = new Headers(r.headers ?? {});
      return {
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        statusText: 'OK',
        headers,
        text: async () => JSON.stringify(r.body),
      } as unknown as Response;
    }),
  );
}

async function freshModules() {
  vi.resetModules();
  const api = await import('@/lib/apiClient');
  const cache = await import('@/lib/readCache');
  const perf = await import('@/lib/perf');
  cache._resetReadCache();
  perf._resetPerf();
  return { api, cache, perf };
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

describe('cacheable GET', () => {
  it('hits the network once, then serves locally', async () => {
    const { api } = await freshModules();

    const first = await api.request<{ data: string }>('/v1/projects');
    const second = await api.request<{ data: string }>('/v1/projects');

    expect(first).toEqual(second);
    // The whole point: the second read costs no round trip, and a round trip on
    // this deployment is ~165-195ms before any query runs.
    expect(fetchCalls).toHaveLength(1);
  });

  it('reports the hit to the perf instrument so the HUD can be trusted', async () => {
    const { api, perf } = await freshModules();

    await api.request('/v1/projects');
    expect(perf.readTally()).toEqual({ hits: 0, misses: 1 });

    await api.request('/v1/projects');
    expect(perf.readTally()).toEqual({ hits: 1, misses: 1 });
  });

  it('treats differently-ordered query strings as one read', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects?a=1&b=2');
    await api.request('/v1/projects?b=2&a=1');
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('never-cacheable GET', () => {
  it('always goes to the network', async () => {
    const { api } = await freshModules();

    await api.request('/v1/access/matrix');
    await api.request('/v1/access/matrix');
    await api.request('/v1/access/matrix');

    // A stale capability matrix lets an approver silently downgrade a capability
    // another approver just raised.
    expect(fetchCalls).toHaveLength(3);
  });

  it('bypasses the cache when a purpose header is present', async () => {
    const { api } = await freshModules();
    // Even on an otherwise cacheable path: the purpose middleware writes the
    // "who looked, and why" audit row BEFORE the handler, so a cache hit would
    // silently delete the record the checkpoint exists to create.
    await api.request('/v1/projects', { headers: { 'X-Purpose': 'diligence' } });
    await api.request('/v1/projects', { headers: { 'X-Purpose': 'diligence' } });
    expect(fetchCalls).toHaveLength(2);
  });

  it('honours an explicit cache:false opt-out', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects', { cache: false });
    await api.request('/v1/projects', { cache: false });
    expect(fetchCalls).toHaveLength(2);
  });
});

describe('writes never touch the cache', () => {
  it('a POST is never served from or stored in the cache', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects', { method: 'POST', body: { x: 1 } });
    await api.request('/v1/projects', { method: 'POST', body: { x: 1 } });
    expect(fetchCalls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('a governed write does not poison the GET cache for the same path', async () => {
    const { api } = await freshModules();
    respond = () => ({ body: { data: 'from-get' } });
    await api.request('/v1/projects');
    await api.request('/v1/projects', { method: 'POST', body: { x: 1 } });
    const after = await api.request<{ data: string }>('/v1/projects');
    // The POST body must not become the cached GET body.
    expect(after.data).toBe('from-get');
  });
});

describe('server veto', () => {
  it('X-LCX-No-Store prevents storage, so the next read refetches', async () => {
    const { api } = await freshModules();
    respond = () => ({ body: { data: 'v' }, headers: { 'X-LCX-No-Store': '1' } });

    await api.request('/v1/projects');
    await api.request('/v1/projects');

    // One API deploy is enough to contain a mis-classified endpoint — no signed
    // app rebuild required.
    expect(fetchCalls).toHaveLength(2);
  });
});

describe('invalidation after a governed action', () => {
  it('marks the affected read stale, and it revalidates on next use', async () => {
    const { api } = await freshModules();
    respond = () => ({ body: { data: 'first' } });

    await api.request('/v1/command/overview');
    expect(fetchCalls).toHaveLength(1);

    // Cached, so no second call yet.
    await api.request('/v1/command/overview');
    expect(fetchCalls).toHaveLength(1);

    // A governed write on the command family.
    await api.request('/v1/actions/command_task_status/invoke', {
      method: 'POST',
      body: { subjectId: 't1' },
    });

    respond = () => ({ body: { data: 'second' } });
    const served = await api.request<{ data: string }>('/v1/command/overview');

    // Mark-stale-not-delete: the operator still gets pixels immediately...
    expect(served.data).toBe('first');
    // ...and a background revalidation was issued.
    await vi.waitFor(() => {
      expect(fetchCalls.filter((c) => c.url.includes('/v1/command/overview'))).toHaveLength(2);
    });
  });
});

describe('failures', () => {
  it('an API error still throws ApiError with its code', async () => {
    const { api } = await freshModules();
    respond = () => ({ status: 403, body: { error: 'Nope', code: 'COMPLIANCE_GATE' } });

    await expect(api.request('/v1/projects')).rejects.toMatchObject({
      status: 403,
      code: 'COMPLIANCE_GATE',
    });
  });

  it('does not cache an error response', async () => {
    const { api } = await freshModules();
    respond = () => ({ status: 500, body: { error: 'boom' } });
    await expect(api.request('/v1/projects')).rejects.toThrow();

    respond = () => ({ body: { data: 'recovered' } });
    const ok = await api.request<{ data: string }>('/v1/projects');
    expect(ok.data).toBe('recovered');
  });
});
