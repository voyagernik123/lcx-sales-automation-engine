/**
 * Sign-out really empties the durable read cache (handover, T1 #9).
 *
 * The bug: `clearReadCache()` fired an IndexedDB clear and returned immediately,
 * and both sign-out paths then navigated the document — which aborts a transaction
 * in flight. So cached response BODIES survived on disk while
 * `TERMINAL_QUICKSTART.md` said they were cleared. They are namespaced per
 * operator, so nobody could be SERVED them, but "the bytes are gone" and "nobody
 * else can read them" are different promises and only the second one was true.
 *
 * WHY THIS FILE ARRANGES ITS OWN IndexedDB. jsdom has none, so `openDb()` resolves
 * null and every durable path is skipped — a test written against the default
 * environment would assert nothing at all and pass forever. The fake below is
 * deliberately CONTROLLABLE: transaction completion can be held open, which is the
 * only way to prove the returned promise waits for `complete` rather than merely
 * for the request to be accepted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/container', () => ({ isTerminal: () => false }));

/* ── a minimal, controllable IndexedDB ────────────────────────────────────── */

/** What is actually "on disk". Assertions read this directly. */
let disk = new Map<string, unknown>();
/** When true, transactions do not fire `complete` until `releaseTx()` is called. */
let holdTx = false;
let heldCompletions: Array<() => void> = [];

type Handler = (() => void) | null;

function laterQueue(fn: () => void): void {
  // A macrotask, so a test can flush with `await Promise.resolve()` chains and
  // still observe "not settled yet".
  setTimeout(fn, 0);
}

function fakeRequest(run: () => unknown) {
  const req: { onsuccess: Handler; onerror: Handler; result: unknown } = {
    onsuccess: null,
    onerror: null,
    result: undefined,
  };
  laterQueue(() => {
    req.result = run();
    req.onsuccess?.();
  });
  return req;
}

function fakeDb() {
  return {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction(_name: string, _mode?: string) {
      const tx: { oncomplete: Handler; onerror: Handler; onabort: Handler; objectStore: () => unknown } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          get: (k: string) => fakeRequest(() => disk.get(k)),
          put: (v: unknown, k: string) => fakeRequest(() => disk.set(k, v)),
          delete: (k: string) => fakeRequest(() => disk.delete(k)),
          clear: () => fakeRequest(() => disk.clear()),
        }),
      };
      const complete = () => tx.oncomplete?.();
      // Completion is always a turn AFTER the operation, as in the real thing.
      if (holdTx) heldCompletions.push(complete);
      else laterQueue(() => laterQueue(complete));
      return tx;
    },
  };
}

function releaseTx(): void {
  const queued = heldCompletions;
  heldCompletions = [];
  holdTx = false;
  for (const fn of queued) fn();
}

function installIndexedDb() {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req: { onsuccess: Handler; onerror: Handler; onupgradeneeded: Handler; result: unknown } = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: fakeDb(),
      };
      laterQueue(() => req.onsuccess?.());
      return req;
    },
  });
}

/* ── harness ──────────────────────────────────────────────────────────────── */

let fetchCalls: string[] = [];

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      fetchCalls.push(`${(init?.method ?? 'GET').toUpperCase()} ${String(input)}`);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: async () => JSON.stringify({ data: 'body-worth-hiding' }),
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

/** Let every queued macrotask run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  disk = new Map();
  holdTx = false;
  heldCompletions = [];
  fetchCalls = [];
  localStorage.clear();
  localStorage.setItem('lcx_operator_email', 'nik@lcx.com');
  localStorage.setItem('lcx_desk_passcode', 'test#1234');
  installFetch();
  installIndexedDb();
});

afterEach(() => vi.unstubAllGlobals());

/* ── the fixture is real ──────────────────────────────────────────────────── */

describe('the durable tier is actually exercised', () => {
  it('a cacheable read reaches disk, so the tests below are not vacuous', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects');
    await settle();
    // If this ever goes to 0 the whole file is asserting nothing.
    expect(disk.size).toBe(1);
    expect([...disk.keys()][0]).toContain('/v1/projects');
  });
});

/* ── T1 #9 ────────────────────────────────────────────────────────────────── */

describe('clearReadCache is awaitable', () => {
  it('empties the durable tier', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    await api.request('/v1/kpis');
    await settle();
    expect(disk.size).toBe(2);

    await cache.clearReadCache();
    expect(disk.size).toBe(0);
  });

  it('does not resolve until the transaction COMPLETES', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    await settle();

    holdTx = true;
    let settled = false;
    const done = cache.clearReadCache().then(() => {
      settled = true;
    });

    // Several turns with the transaction held open. This is the exact window the
    // document navigation used to win.
    await settle();
    await settle();
    expect(settled).toBe(false);

    releaseTx();
    await done;
    expect(settled).toBe(true);
  });
});

describe('sign-out: clearOperatorEmail owns the clear', () => {
  it('awaiting the credential forget also means the bodies are gone', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects');
    await settle();
    expect(disk.size).toBe(1);

    // This is precisely what TopNav's sign-out button awaits before it calls
    // window.location.assign('/select'), so if this holds, sign-out holds.
    await api.clearOperatorEmail();

    expect(disk.size).toBe(0);
    expect(localStorage.getItem('lcx_operator_email')).toBeNull();
  });

  it('waits for the clear rather than resolving ahead of it', async () => {
    const { api } = await freshModules();
    await api.request('/v1/projects');
    await settle();

    holdTx = true;
    let forgotten = false;
    const p = api.clearOperatorEmail().then(() => {
      forgotten = true;
    });
    await settle();
    await settle();
    // A promise that resolves before the clear lands is the original bug wearing
    // a return type. Only the RESOLUTION is asserted while the transaction is
    // held: in IndexedDB the data change is visible before `complete` fires —
    // `complete` is the durability point, and the durability point is what a
    // document navigation is racing.
    expect(forgotten).toBe(false);

    releaseTx();
    await p;
    expect(forgotten).toBe(true);
    expect(disk.size).toBe(0);
  });
});

describe('nothing can put a body back after the clear', () => {
  it('a revalidation resolving between the clear and the navigation is refused', async () => {
    const { api, cache } = await freshModules();
    await api.request('/v1/projects');
    await settle();
    expect(disk.size).toBe(1);

    await cache.clearReadCache();
    expect(disk.size).toBe(0);

    // The window: the document has not gone away yet, and an in-flight read
    // resolves. Ordering cannot save us here — this write is ISSUED after the
    // clear, not merely completed after it.
    await api.request('/v1/kpis');
    await settle();
    expect(disk.size).toBe(0);
  });

  it('reopens for the next operator, so the desk is not permanently slow', async () => {
    const { api, cache } = await freshModules();
    await cache.clearReadCache();

    // A forced return to the front door does NOT reload the document, so if the
    // seal were permanent a passcode rotation would silently disable the durable
    // tier for the rest of the session.
    api.setOperatorCredentials('sam@lcx.com', 'test#5678');
    await api.request('/v1/projects');
    await settle();
    expect(disk.size).toBe(1);
  });
});
