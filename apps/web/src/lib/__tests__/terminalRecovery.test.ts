/**
 * The two recovery paths a desk cannot be shipped without (TERMINAL Phase 7.1).
 *
 * 1. AN UPDATE IS A DECISION. The launch check used to call
 *    `downloadAndInstall()` unattended, and the macOS installer removes the
 *    running `.app` before renaming the replacement in
 *    (tauri-plugin-updater-2.10.1/src/updater.rs:1296-1303). An operator mid-write
 *    got no say, and a non-admin in /Applications got an unexplained password
 *    prompt seconds after launch. These pin that the check still runs unasked and
 *    the INSTALL never does.
 *
 * 2. A REJECTED CREDENTIAL HAS TO ACT LIKE ONE. lib/errors classified a 401 as
 *    "sign in again from the front door" and nothing did it — the desk kept the
 *    operator's name in the top bar while every panel showed an auth error. That
 *    is the live behaviour the moment the shared desk passcode is rotated.
 *
 * Both are behaviours nobody can see in a code review, and neither is reachable
 * from a browser: they need the Tauri bridge, which is why it is faked here rather
 * than driven.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ── The shell, faked ─────────────────────────────────────────────────────── */

vi.mock('@/lib/container', () => ({ isTerminal: () => true }));

/**
 * Every command the web layer sent the shell, in order.
 *
 * ONE HARNESS HAZARD, recorded so the next person does not "fix" product code to
 * satisfy it: two OVERLAPPING dynamic imports of a factory-mocked module lose the
 * second caller under vitest. Measured directly — three concurrent
 * `await import('@tauri-apps/api/core')` calls each read `core.invoke` as a
 * function, and then the second and third throw `Cannot read properties of
 * undefined (reading 'invoke')` when they call it, so only the first command
 * arrives. That is vitest replacing the mocked namespace per import; ES module
 * semantics make it impossible in the real webview, where one instance is cached
 * and every `import()` of it resolves to the same namespace. It is why nothing
 * below asserts on `clearOperatorEmail`'s two PARALLEL Keychain deletes —
 * terminalCredentials.test.ts covers that guarantee with the bridge itself faked,
 * which is the level where it can be asserted honestly.
 */
let invoked: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
const keychain = new Map<string, string>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    invoked.push({ cmd, args });
    const key = String(args?.key ?? '');
    if (cmd === 'secret_get') return keychain.get(key) ?? null;
    if (cmd === 'secret_set') return void keychain.set(key, String(args?.value ?? ''));
    if (cmd === 'secret_delete') return void keychain.delete(key);
    return null;
  },
}));

/** The `lcx://check-update` menu event, so the interactive path is reachable. */
let fireCheckUpdateMenuItem: (() => void) | null = null;

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, handler: () => void) => {
    if (event === 'lcx://check-update') fireCheckUpdateMenuItem = handler;
    return () => {};
  },
}));

/** What `check()` answers, scripted per test. */
let check: () => Promise<unknown> = async () => null;
let installsStarted: string[] = [];
let installThrows: string | null = null;
let relaunched = 0;

vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: async () => {
    relaunched += 1;
  },
}));

function availableUpdate(version: string) {
  return {
    version,
    downloadAndInstall: async () => {
      installsStarted.push(version);
      if (installThrows) throw new Error(installThrows);
    },
  };
}

/* ── The API, faked ───────────────────────────────────────────────────────── */

type Reply = { status?: number; body: unknown };
let respond: (url: string) => Reply;

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const r = respond(String(input));
      return {
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        statusText: 'stub',
        headers: new Headers(),
        text: async () => JSON.stringify(r.body),
      } as unknown as Response;
    }),
  );
}

const EMAIL_KEY = 'lcx_operator_email';
const PASS_KEY = 'lcx_desk_passcode';

const NIK = {
  id: 'nik',
  name: 'Nik',
  email: 'nik@lcx.com',
  initials: 'N',
  colorVar: 'var(--chart-1)',
  role: 'approver' as const,
};

/**
 * A fresh module registry per case: both the once-per-process sign-out guard and
 * the update phase live in module scope, which is the point of them. The operator
 * store has to be imported from the SAME generation the client will reach for, or
 * the test would be watching a different store instance than the one being
 * cleared.
 */
async function freshDesk() {
  vi.resetModules();
  const api = await import('@/lib/apiClient');
  const terminal = await import('@/lib/terminal');
  const cache = await import('@/lib/readCache');
  const { useOperatorStore } = await import('@/stores/useOperatorStore');
  cache._resetReadCache();
  return { api, terminal, useOperatorStore };
}

/** Signed in, credential present, exactly as a launch would leave it. */
function seatNik(): void {
  localStorage.setItem(EMAIL_KEY, NIK.email);
  localStorage.setItem(PASS_KEY, 'test#1234');
}

beforeEach(() => {
  invoked = [];
  keychain.clear();
  localStorage.clear();
  installsStarted = [];
  installThrows = null;
  relaunched = 0;
  fireCheckUpdateMenuItem = null;
  check = async () => null;
  respond = () => ({ body: { data: {} } });
  window.history.pushState({}, '', '/');
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('the update install is a decision, not a launch-time event', () => {
  it('offers an available update and installs nothing until the action is taken', async () => {
    check = async () => availableUpdate('0.2.0');
    const notices: Array<{ kind: string; message: string; action?: { label: string; onAction: () => void } }> = [];

    const { terminal } = await freshDesk();
    await terminal.attachUpdateBridge((kind, message, action) => notices.push({ kind, message, action }));

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0].action?.label).toBe('Install and relaunch');
    // The whole point. Before this change, reaching here meant the running bundle
    // had already been deleted.
    expect(installsStarted).toEqual([]);
    expect(relaunched).toBe(0);

    notices[0].action?.onAction();
    await vi.waitFor(() => expect(installsStarted).toEqual(['0.2.0']));
    await vi.waitFor(() => expect(relaunched).toBe(1));
  });

  it('never installs twice, however many notices the operator clicks', async () => {
    check = async () => availableUpdate('0.2.0');
    const actions: Array<() => void> = [];

    const { terminal } = await freshDesk();
    await terminal.attachUpdateBridge((_k, _m, action) => {
      if (action) actions.push(action.onAction);
    });
    await vi.waitFor(() => expect(actions).toHaveLength(1));

    // The launch notice and a menu-driven one can be on screen together; clicking
    // both must not run two installers over the same .app bundle.
    fireCheckUpdateMenuItem?.();
    await vi.waitFor(() => expect(actions.length).toBeGreaterThanOrEqual(2));
    actions.forEach((run) => run());

    await vi.waitFor(() => expect(installsStarted).toEqual(['0.2.0']));
    // Settle: a second install would have to land in this window.
    await new Promise((r) => setTimeout(r, 10));
    expect(installsStarted).toEqual(['0.2.0']);
  });

  it('a failed launch check is silent and lands in the shell log', async () => {
    // The live state at the time of writing: the update repo is private with zero
    // releases, so latest.json 404s and check() throws on EVERY launch. Verified
    // against GitHub, not assumed — see lib/terminal.ts.
    check = async () => {
      throw new Error('Could not fetch a valid release JSON: 404 Not Found');
    };
    const notices: string[] = [];

    const { terminal } = await freshDesk();
    await terminal.attachUpdateBridge((kind, message) => notices.push(`${kind}: ${message}`));

    await vi.waitFor(() =>
      expect(invoked.some((c) => c.cmd === 'diagnostics_append' && String(c.args?.line).includes('404'))).toBe(true),
    );
    // A 9-second warning toast on every single launch, that no operator can act
    // on, teaches them to ignore the layer the governance surfaces use.
    expect(notices).toEqual([]);
  });

  it('but the SAME failure speaks when the operator asked for it from the menu', async () => {
    check = async () => {
      throw new Error('Could not fetch a valid release JSON: 404 Not Found');
    };
    const notices: Array<{ kind: string; message: string }> = [];

    const { terminal } = await freshDesk();
    await terminal.attachUpdateBridge((kind, message) => notices.push({ kind, message }));
    // Let the silent launch check finish and release the phase.
    await vi.waitFor(() => expect(invoked.some((c) => c.cmd === 'diagnostics_append')).toBe(true));

    fireCheckUpdateMenuItem?.();

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0].kind).toBe('warning');
    expect(notices[0].message).toContain('404');
  });

  it('says "up to date" only when somebody is waiting for the answer', async () => {
    check = async () => null;
    const notices: string[] = [];

    const { terminal } = await freshDesk();
    await terminal.attachUpdateBridge((kind, message) => notices.push(`${kind}: ${message}`));
    await new Promise((r) => setTimeout(r, 10));
    expect(notices).toEqual([]);

    fireCheckUpdateMenuItem?.();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toContain('up to date');
  });
});

describe('a rejected desk credential returns the operator to the front door', () => {
  it('clears the credential and the identity on a 401, and says so in the log', async () => {
    seatNik();
    keychain.set(EMAIL_KEY, NIK.email);
    keychain.set(PASS_KEY, 'test#1234');
    respond = () => ({ status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    await expect(api.getMe()).rejects.toThrow();

    // Identity gone: AppLayout renders <Navigate to="/select"> the moment the
    // operator store is empty, so clearing it IS the redirect.
    await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());
    // Credential gone from memory and localStorage, synchronously, before any of
    // the async work above could have run.
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
    expect(localStorage.getItem(PASS_KEY)).toBeNull();
    expect(api.getApiKey()).not.toContain(NIK.email);
    // The Keychain forget was at least ATTEMPTED — see the harness note at the top
    // of this file for why the pair of deletes cannot both be observed here.
    expect(invoked.some((c) => c.cmd === 'secret_delete')).toBe(true);
    // And it left a record: this is a sign-out the operator did not ask for, and
    // without this line the desk would look as if it had simply forgotten them.
    await vi.waitFor(() =>
      expect(
        invoked.some((c) => c.cmd === 'diagnostics_append' && String(c.args?.line).includes('forced sign-in')),
      ).toBe(true),
    );
  });

  it('acts once for a burst of rejections, not once per rejected request', async () => {
    // A route mounts five or six reads AT ONCE and SWR revalidates behind them. All
    // of them are already in flight carrying the credential when the first 401 comes
    // back, so `authenticated` is true on every one of them — clearing the credential
    // does not suppress the tail. Only the latch does. Fired in parallel on distinct
    // paths deliberately: sequential calls prove nothing here, because by the second
    // one there is no credential left to authenticate with, and the read layer
    // coalesces concurrent requests for the SAME path into one.
    seatNik();
    respond = () => ({ status: 401, body: { error: 'Unauthorized' } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    // `console.warn` and NOT the shell log, even though the shell log is the more
    // interesting record: `forceFrontDoor` reaches the log through
    // `await import('./terminal')`, and five overlapping dynamic imports of a
    // factory-mocked module lose all but one caller under vitest (see the harness
    // note at the top of this file). Counting log lines here would therefore pass
    // whether the latch worked or not — measured, by deleting the latch and watching
    // it still pass. The warn is emitted synchronously inside the guard, so it counts
    // entries, not imports.
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const burst = ['/v1/projects', '/v1/decisions', '/v1/kpis', '/v1/wbr', '/v1/me'].map((p) =>
        api.request(p).catch(() => 'rejected'),
      );
      expect(await Promise.all(burst)).toEqual(['rejected', 'rejected', 'rejected', 'rejected', 'rejected']);

      await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());
      await new Promise((r) => setTimeout(r, 10));
      expect(
        warned.mock.calls.filter((c) => String(c[0]).includes('returning to the front door')),
      ).toHaveLength(1);
    } finally {
      warned.mockRestore();
    }
  });

  it('acts on a 401 that arrives on a BACKGROUND revalidation, not just a live read', async () => {
    // The rotation case named in the ledger: the operator is not touching anything.
    // A stale-while-revalidate read returns the CACHED body to the caller and
    // refreshes behind it, and that refresh's failure is swallowed by design
    // (apiClient.request, the `.catch` on the swr branch) — so nothing throws, no
    // surface renders an error, and if the 401 were only handled on the path the
    // caller awaits, the desk would sit there signed out and unaware.
    seatNik();
    respond = () => ({ body: { data: 'kpis' } });

    const { api, useOperatorStore } = await freshDesk();
    const cache = await import('@/lib/readCache');
    useOperatorStore.getState().setOperator(NIK);

    // Prime it, then age it — `markStale` rather than fake timers, because the
    // freshness window is policy (5 min for /v1/kpis) and this test is about the
    // revalidation, not about the clock.
    await api.request('/v1/kpis');
    expect(cache.markStale(['/v1/kpis'])).toBeGreaterThan(0);

    respond = () => ({ status: 401, body: { error: 'Unauthorized' } });
    // Resolves with the CACHED body: the operator is given no error at all.
    await expect(api.request('/v1/kpis')).resolves.toEqual({ data: 'kpis' });

    await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());
    expect(api.getApiKey()).not.toContain(NIK.email);
  });

  it('but a SECOND rejection after a real re-sign-in acts again', async () => {
    // The latch was justified with "a successful sign-in from there is a fresh
    // document", and that is not what the front door does: SelectOperator ends with
    // `navigate('/', { replace: true })` (pages/SelectOperator.tsx:58), a react-router
    // transition inside the SAME document and the same module instance. So an admin
    // who rotates the desk passcode TWICE in one session — or once while the operator
    // was already signed back in — used to get the original defect back: name in the
    // top bar, every panel showing an auth error, no route change. Storing a new
    // credential re-arms the latch.
    seatNik();
    respond = () => ({ status: 401, body: { error: 'Unauthorized' } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);
    await expect(api.getMe()).rejects.toThrow();
    await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());

    // The re-sign-in: exactly what the front door does on success.
    api.setOperatorCredentials(NIK.email, 'rotated#5678');
    useOperatorStore.getState().setOperator(NIK);
    expect(api.getApiKey()).toBe(`${NIK.email}:rotated#5678`);

    await expect(api.getMe()).rejects.toThrow();
    await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());
    expect(api.getApiKey()).not.toContain(NIK.email);
  });

  it('leaves a 401 at the front door alone — the gate owns that one', async () => {
    // SelectOperator verifies the pair the operator just typed by calling /v1/me,
    // and a wrong passcode is SUPPOSED to 401 there. Reacting would clear the
    // credential under the gate's own error handling and race its retry.
    window.history.pushState({}, '', '/select');
    seatNik();
    respond = () => ({ status: 401, body: { error: 'Unauthorized' } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    await expect(api.getMe()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(useOperatorStore.getState().operator).toEqual(NIK);
    expect(localStorage.getItem(PASS_KEY)).toBe('test#1234');
  });

  it('ignores a 401 on a request that carried no credential', async () => {
    seatNik();
    respond = () => ({ status: 401, body: { error: 'Unauthorized' } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    // `/health` is unauthenticated; a 401 there says nothing about the desk
    // credential, and there is nothing to clear.
    await expect(api.getHealth()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(useOperatorStore.getState().operator).toEqual(NIK);
  });
});

describe('identity, re-checked at launch', () => {
  it('does nothing when the credential and the persisted operator agree', async () => {
    seatNik();
    respond = () => ({ body: { data: { id: 'nik', role: 'approver', authMethod: 'email' } } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    await api.verifyPersistedIdentity();
    await new Promise((r) => setTimeout(r, 10));
    expect(useOperatorStore.getState().operator).toEqual(NIK);
  });

  it('forces the front door when the API says somebody else', async () => {
    seatNik();
    // The case this catches: the desk is showing Nik while the credential
    // authenticates as Sam — or, as here, as the shared legacy API key's anonymous
    // principal, which would attribute every audit row to `operator`.
    respond = () => ({ body: { data: { id: 'operator', role: 'operator', authMethod: 'api_key' } } });

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    await api.verifyPersistedIdentity();
    await vi.waitFor(() => expect(useOperatorStore.getState().operator).toBeNull());
  });

  it('does not lock the desk out when the API is unreachable', async () => {
    seatNik();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const { api, useOperatorStore } = await freshDesk();
    useOperatorStore.getState().setOperator(NIK);

    // An outage tells us nothing about who is signed in. Bouncing to a gate that
    // cannot be passed would turn an API outage into a lockout.
    await expect(api.verifyPersistedIdentity()).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(useOperatorStore.getState().operator).toEqual(NIK);
  });

  it('stays quiet when nobody is signed in', async () => {
    respond = () => {
      throw new Error('/v1/me must not be called with no credential and no operator');
    };

    const { api } = await freshDesk();
    await expect(api.verifyPersistedIdentity()).resolves.toBeUndefined();
  });
});
