/**
 * Browser → LCX Sales API client.
 * Local: Vite proxies /api/* → http://127.0.0.1:8787/*
 * Prod: set VITE_API_URL to the API origin.
 */

import type { HealthResponse, OperatorPrincipal } from '@lcx/shared';
import { isTerminal } from './container';
import {
  canonicalPath,
  lookup,
  store,
  coalesce,
  clearReadCache,
  noteServed,
  reopenDurableTier,
} from './readCache';
import { noteRead } from './perf';
import { invalidateAfterAction } from './readInvalidate';
import { recordNetworkResult } from './online';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
// DEV-only: gating on import.meta.env.DEV lets Vite dead-code-strip the key
// from production bundles, so a stray VITE_API_KEY in a prod build env can
// never be inlined and shipped to browsers. Prod keys live in localStorage.
const ENV_API_KEY = import.meta.env.DEV ? ((import.meta.env.VITE_API_KEY as string | undefined) ?? '') : '';

const EMAIL_KEY = 'lcx_operator_email';
const PASS_KEY = 'lcx_desk_passcode';
const LEGACY_KEY = 'lcx_api_key';

/**
 * The bearer credential sent to the API, in priority order:
 *  1. the signed-in operator's email (set on the front door — the API's TEAM
 *     allowlist accepts it, so sign-in works on any browser/device);
 *  2. a legacy shared API key in localStorage (cron, integrations, and any
 *     browser provisioned before email sign-in existed);
 *  3. the dev-only env key.
 * Nothing secret ships in the bundle — the email is entered by the user, and
 * the shared key lives only in localStorage.
 */
/**
 * In LCXOS the credential lives in the macOS Keychain, which is an
 * ASYNC read — but getApiKey() is synchronous and called from every request.
 * So the terminal hydrates this in-memory cache once at boot
 * (hydrateCredentials()), and every later read is instant. In a browser the
 * cache stays empty and localStorage remains the source, exactly as before.
 */
let memEmail: string | null = null;
let memPass: string | null = null;

export function getApiKey(): string {
  try {
    const email = (memEmail ?? localStorage.getItem(EMAIL_KEY))?.trim();
    const passcode = memPass ?? localStorage.getItem(PASS_KEY) ?? '';
    // LCX OS gate: the desk credential is `email:passcode` — both halves or
    // nothing (a bare email is rejected server-side by design).
    if (email && passcode) return `${email}:${passcode}`;
    return localStorage.getItem(LEGACY_KEY) || ENV_API_KEY;
  } catch {
    return memEmail && memPass ? `${memEmail}:${memPass}` : ENV_API_KEY;
  }
}

/**
 * Load the desk credential out of the macOS Keychain into memory. Called once,
 * before the app renders, when running inside LCXOS. No-op in a browser.
 */
export async function hydrateCredentials(): Promise<void> {
  // Container check BEFORE the dynamic import. main.tsx awaits this call before
  // mounting React, so importing ./terminal first put a round-trip for a 2KB
  // chunk directly on the browser's path to first paint (measured ~240ms of
  // blank screen on Cloudflare Pages) to load a module that instantly returns.
  if (!isTerminal()) return;
  const { secretGet } = await import('./terminal');
  // SEQUENTIAL, not `Promise.all`. Two Keychain reads in parallel produce two macOS
  // password prompts STACKED on top of each other, which is what made a two-dialog
  // problem look like an infinite loop on a real install. It also defeats the
  // circuit breaker in `secretGet`: both calls are in flight before either can
  // record that the Keychain refused, so the breaker could never help on the first
  // launch — the one launch where it matters. Two round-trips to a local keychain
  // cost nothing measurable; two password prompts cost the operator's trust.
  const email = await secretGet(EMAIL_KEY);
  const pass = await secretGet(PASS_KEY);
  // Coerce an EMPTY Keychain value to null (TERMINAL Phase 7). Builds already in
  // the field wrote `''` on a rejected sign-in, and the shell's Keychain reads that
  // back as `Some("")` rather than absence. `''` is not nullish, so it would pin
  // this cache non-null and permanently defeat the localStorage fallback in
  // getApiKey() — the desk would be unable to authenticate with a perfectly good
  // credential sitting one line below. Absence and emptiness must resolve the same.
  memEmail = email || null;
  memPass = pass || null;
}

/**
 * Record the signed-in operator's credentials (front door): email + desk passcode.
 *
 * An EMPTY half means CLEAR, not store (TERMINAL Phase 7). The sign-in gate calls
 * `setOperatorCredentials('', '')` to undo the credential it provisionally stored
 * when the server rejects it (pages/SelectOperator.tsx). Writing that through
 * literally used to leave `''` in every store — and in the terminal that is a
 * present-but-EMPTY Keychain entry, which the shell's own test now pins as a real,
 * distinct state (`Ok(Some(""))`, not `None`). Because the reads below resolve as
 * `memEmail ?? localStorage…`, and `''` is not nullish, an empty entry silently
 * disables the localStorage fallback that is the only thing keeping the desk usable
 * when the Keychain is unavailable. `getApiKey()` already treats a half credential
 * as no credential, so half a credential is never worth persisting.
 *
 * Note the consequence of routing that through `clearOperatorEmail`: a rejected
 * sign-in now also drops the read cache. That is the behaviour you want — bodies
 * fetched while a provisional credential was in place should not outlive it — and
 * on a rejected sign-in there is nothing worth keeping anyway.
 */
export function setOperatorCredentials(email: string, passcode: string): void {
  const e = email.trim().toLowerCase();
  if (!e || !passcode) {
    void clearOperatorEmail();
    return;
  }
  memEmail = e;
  memPass = passcode;
  // Reopen the read cache's durable tier. `clearReadCache` seals it so that a
  // revalidation resolving between sign-out's clear and its navigation cannot put
  // a body back on disk; this is the one function that means "there is a
  // credential again", and a forced return to the front door does not reload the
  // document, so without this a passcode rotation would leave the durable tier
  // silently off for the rest of the session.
  reopenDurableTier();
  // A NEW credential re-arms the forced-sign-out latch. See `frontDoorForced`: it
  // exists to make a burst of 401s act once, and it used to be justified by "a
  // successful sign-in is a fresh document" — which the front door does not do. It
  // ends with `navigate('/', { replace: true })` (pages/SelectOperator.tsx), a
  // react-router transition inside the same document and the same module instance.
  // Left latched, a second invalidation in one session — an admin rotating the desk
  // passcode twice, or once after the operator had already signed back in — restored
  // the exact defect this pass closed: the operator's name in the top bar and every
  // panel showing an auth error, with no route change. Reset here rather than at the
  // gate because this is the one function that means "there is a credential again",
  // and it cannot reopen the burst race: during a burst there is no credential to
  // store.
  frontDoorForced = false;
  try {
    localStorage.setItem(EMAIL_KEY, e);
    localStorage.setItem(PASS_KEY, passcode);
  } catch {
    /* storage unavailable — in-memory session only */
  }
  // In the terminal, persist to the Keychain too (fire-and-forget; the
  // in-memory cache above already makes this session work).
  if (!isTerminal()) return;
  void (async () => {
    const { secretSet } = await import('./terminal');
    await Promise.all([secretSet(EMAIL_KEY, e), secretSet(PASS_KEY, passcode)]);
  })();
}

/**
 * Clear the email credential on sign-out (leaves any legacy key untouched).
 *
 * AWAITABLE, and the caller must await it before navigating (TERMINAL Phase 7).
 * Memory and localStorage are cleared synchronously, but the Keychain is an IPC
 * round-trip into the Rust shell — and sign-out ends with
 * `window.location.assign('/select')`, a real document navigation that tears down
 * the JS context and cancels the IPC in flight. So "sign-out actually forgets",
 * the whole promise of moving the credential into the Keychain, was a race nobody
 * could see the result of: the next operator on this Mac could inherit the previous
 * one's desk passcode from the login keychain. Returning the promise costs nothing
 * and makes the guarantee real.
 *
 * THE READ CACHE GOES WITH IT, and it is awaited here rather than at each caller
 * (handover, T1 #9). The IndexedDB clear had exactly the same race as the Keychain
 * delete and lost it for the same reason: both sign-out paths fired it and then
 * navigated, so cached response BODIES survived on disk while
 * `LCXOS_QUICKSTART.md` said they were cleared.
 *
 * Joined to the credential rather than left as a second call the caller must
 * remember, because that is the invariant: bodies fetched with a credential must
 * not outlive it. Both existing callers already await THIS promise inside a bounded
 * race (TopNav's sign-out button and forceFrontDoor below), so wiring it here made
 * the guarantee real without either of them changing, and a third sign-out path
 * added later cannot forget half of it. It also costs no extra wall-clock time on
 * the terminal: the clear runs concurrently with the Keychain IPC, which is the
 * slower of the two.
 */
export function clearOperatorEmail(): Promise<void> {
  memEmail = null;
  memPass = null;
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* no-op */
  }
  // Started before the Keychain import so the two overlap. Memory and the
  // provenance map are already empty by the time this returns; only the durable
  // tier is still settling.
  const cacheCleared = clearReadCache();
  // Forget the Keychain entries too, so sign-out on the terminal is real.
  if (!isTerminal()) return cacheCleared;
  return (async () => {
    const { secretDelete } = await import('./terminal');
    await Promise.all([cacheCleared, secretDelete(EMAIL_KEY), secretDelete(PASS_KEY)]);
  })();
}

/* ── Being signed out, and acting like it ─────────────────────────────────────
 *
 * The taxonomy has classified a 401 as "sign in again from the front door" since
 * the error layer was written (lib/errors.ts), and until this pass nothing did it.
 * The observable state was: TopNav still showing the operator's name and role, the
 * sidebar still listing their workspaces, and every surface underneath rendering an
 * auth error. It is not hypothetical — it is what the desk looks like the moment
 * the shared passcode is rotated, which is the one routine admin action that
 * invalidates a live credential.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Once per REJECTED CREDENTIAL, not once per process. A 401 does not arrive alone: a
 * route mounts five or six reads at a time, plus any SWR revalidation already in
 * flight, so the first rejected request must be the only one that acts.
 *
 * An earlier draft never reset this and justified it with "the recovery ends at the
 * front door, and a successful sign-in from there is a fresh document". That was
 * false: `SelectOperator` ends with `navigate('/', { replace: true })`, an in-document
 * router transition, so the module instance — and this latch — survive the sign-in.
 * `setOperatorCredentials` clears it, so the second rotation in a session is acted on
 * like the first.
 */
let frontDoorForced = false;

/**
 * The current route, without assuming there is a `window`. The read layer is
 * exercised under vitest in a node-ish environment in places, and a bare
 * `location.pathname` there is a throw inside an error path.
 */
function currentPath(): string {
  try {
    return typeof window === 'undefined' ? '' : window.location.pathname;
  } catch {
    return '';
  }
}

/**
 * Drop the credential and the identity, and let the shell's own guard do the
 * routing.
 *
 * There is no `navigate()` here on purpose. `AppLayout` already renders
 * `<Navigate to="/select" replace />` whenever the operator store is empty
 * (components/layout/AppLayout.tsx:145), and every authenticated surface in the app
 * is a child of it — so clearing the store IS the redirect, from anywhere, without
 * lib/ reaching for a router it does not own and without a full document load.
 *
 * The read cache goes too. It is keyed by PATH, not by credential, so bodies
 * fetched under the credential that has just been rejected must not be served to
 * whoever signs in next.
 *
 * What this deliberately does NOT do, unlike the sign-out button in TopNav: wipe
 * every locally persisted UI key (`storage.clearAll()`) or force a fresh document.
 * This path fires unasked, and its most common cause by far is a rotated passcode —
 * the SAME operator, who would then find their filters, notes and workspace
 * selection gone because the admin changed a password. In-memory store residue
 * therefore survives a forced return to the front door; a deliberate sign-out
 * remains the thing that leaves nothing behind.
 */
function forceFrontDoor(reason: string): void {
  if (frontDoorForced) return;
  frontDoorForced = true;
  console.warn('[lcx] returning to the front door:', reason);

  // Order matters, and it is the same order TopNav's sign-out settled on: forget
  // the credential FIRST, drop the identity second. In LCXOS the forget is
  // an IPC round-trip into the Rust shell, and it is the half that actually
  // removes the passcode from the login keychain.
  //
  // Bounded, for the same reason TopNav bounds it: a Keychain that refuses — or
  // that is sitting behind an access prompt nobody has answered — must not trap
  // the operator on a session the API has already rejected. Two seconds, then the
  // redirect happens regardless. Nothing is lost by the timeout: memory and
  // localStorage are cleared synchronously inside `clearOperatorEmail` before it
  // returns a promise at all, so the credential has already stopped being usable.
  //
  // The read cache goes too — it is keyed by PATH, not by credential, so bodies
  // fetched under the credential that was just rejected must not be served to
  // whoever signs in next. It used to be a separate call after this race;
  // `clearOperatorEmail` now owns it, which both starts it immediately instead of
  // up to two seconds later and makes it impossible for a sign-out path to do one
  // half without the other.
  const bounded = new Promise<void>((resolve) => setTimeout(resolve, 2000));
  void Promise.race([clearOperatorEmail().catch(() => {}), bounded]).then(async () => {
    // Dynamic, not static: apiClient is on the pre-render boot path (main.tsx
    // awaits hydrateCredentials before mounting React) and this is an exceptional
    // path. Rollup resolves it into the entry chunk the stores already sit in, so
    // it costs no extra request.
    const { useOperatorStore } = await import('@/stores/useOperatorStore');
    useOperatorStore.getState().clearOperator();
    // Last, so the record describes what HAPPENED rather than what was about to.
    // In the terminal this lands in ~/Library/Logs/LCXOS/shell.log; in a
    // browser it is a no-op and the console.warn above is the only trace.
    const { logDiagnostic } = await import('./terminal');
    void logDiagnostic(`forced sign-in: ${reason}`);
  });
}

/**
 * Re-check at launch that the desk credential and the persisted identity are the
 * same person, and go back to the front door if they are not.
 *
 * WHAT THIS CATCHES: the credential and the operator store disagreeing. The store
 * is persisted, the credential is hydrated from the Keychain (or localStorage), and
 * nothing has ever compared them — so a desk could show "Sam" in the top bar while
 * every audit row it wrote said `nik`, or show a named operator while the request
 * was actually authenticated by the shared legacy API key (which resolves to the
 * anonymous principal `operator`, apps/api/src/middleware/auth.ts:57-59).
 *
 * WHAT IT DOES NOT CATCH, said plainly because the opposite is easy to assume: a
 * DIFFERENT HUMAN at the same desk. The desk passcode is shared by design and the
 * email is stored, so operator B launching the app that A signed into presents A's
 * credential, and `/v1/me` answers "A" — which is exactly what the store says. That
 * mismatch is invisible to any server check, and closing it needs a per-person
 * secret, not more client code. This function narrows the gap; it does not close
 * it. An explicit "you are signed in as A — not you?" prompt at launch would, and
 * it belongs to the front door (handoff).
 *
 * Failures other than a rejected credential are ignored on purpose: an API that is
 * down or unreachable tells us nothing about who is signed in, and bouncing the
 * operator to a sign-in gate they cannot get through would turn an outage into a
 * lockout. A 401 here is already handled by the 401 path above.
 */
export async function verifyPersistedIdentity(): Promise<void> {
  if (!getApiKey()) return;
  const { useOperatorStore } = await import('@/stores/useOperatorStore');
  const persisted = useOperatorStore.getState().operator;
  if (!persisted) return; // signed out: the front door is already the destination
  let principal: OperatorPrincipal;
  try {
    principal = await getMe();
  } catch {
    return;
  }
  if (principal.id === persisted.id) return;
  forceFrontDoor(
    `/v1/me resolved '${principal.id}' (${principal.authMethod}) but this desk is showing '${persisted.id}'`,
  );
}

function url(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE) return `${API_BASE}${p}`;
  // Dev default: go through Vite proxy
  return `/api${p}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /**
   * The rest of the error body, verbatim.
   *
   * The API spreads `ActionError.data` alongside `error`/`code`, so a refusal is
   * machine-readable: SAT_REQUIRED says WHICH reviews are missing,
   * COMPLIANCE_GATE lists the blockers, WORKSPACE_FORBIDDEN names the workspace,
   * VALIDATION carries per-field issues. Without capturing it here the client is
   * back to regex-matching server prose to decide what to offer next — which is
   * exactly what three surfaces in this app do today, and what the command line's
   * remedy logic replaces.
   */
  data?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra request headers (e.g. X-Purpose for LCX OS purpose-based reads). */
  headers?: Record<string, string>;
  /**
   * Opt OUT of the read cache for this call. Reads are only ever cached when the
   * policy in lib/readPolicy allows it, so this is for the rarer case where a
   * caller needs a guaranteed-live value from an otherwise cacheable endpoint
   * (e.g. re-reading a deal's stage at the moment a close flow opens).
   */
  cache?: false;
};

/** The one network call, with no cache involvement. */
async function networkRequest<T>(path: string, opts: RequestOpts, method: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const apiKey = getApiKey();
  const authenticated = opts.auth !== false && Boolean(apiKey);
  if (authenticated) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (opts.headers) Object.assign(headers, opts.headers);

  const res = await fetch(url(path), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    const err = json as { error?: string; code?: string } | null;
    // A rejected credential is acted on, not just classified. Conditions, each for
    // a reason:
    //   • `authenticated` — a 401 on a request that carried no credential is the
    //     normal signed-out state, and there is nothing to clear.
    //   • not already at `/select` — the sign-in gate itself calls `/v1/me` to
    //     verify the pair the operator just typed
    //     (pages/SelectOperator.tsx:56), and a wrong passcode is SUPPOSED to 401
    //     there. Reacting to it would clear the credential under the gate's own
    //     error handling and race its retry.
    if (res.status === 401 && authenticated && currentPath() !== '/select') {
      forceFrontDoor(`the API rejected the desk credential on ${method} ${path}`);
    }
    // Everything except the two known keys is structured detail — kept so the
    // caller can act on the refusal instead of parsing its prose.
    let detail: Record<string, unknown> | undefined;
    if (err && typeof err === 'object') {
      const rest = Object.fromEntries(
        Object.entries(err).filter(([k]) => k !== 'error' && k !== 'code'),
      );
      if (Object.keys(rest).length > 0) detail = rest;
    }
    throw new ApiError(err?.error ?? res.statusText, res.status, err?.code, detail);
  }

  // The server may veto storage of any response, per-request. Deny-only: it can
  // make the client more conservative, never less (lib/readCache honours it, and
  // there is no header that could widen the policy).
  noStoreFlag = res.headers.get('X-LCX-No-Store') === '1';
  noteTransport(true);
  return json as T;
}

/** Set by the most recent network response; read immediately after, same tick. */
let noStoreFlag = false;

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');

  // The read cache is gated on the METHOD, not on a list of paths. This function
  // serves ~40 non-GET call sites including the governed write path
  // (/v1/actions/:id/invoke), and a cache leaking into those would be
  // catastrophic — so anything that is not a plain bodyless GET goes straight to
  // the network. A purpose-carrying read also bypasses it unconditionally: the
  // X-Purpose middleware writes the "who looked, and why" audit row BEFORE the
  // handler runs, so a cache hit would silently delete the record the checkpoint
  // exists to create.
  const eligible =
    method === 'GET' &&
    opts.body === undefined &&
    opts.cache !== false &&
    !(opts.headers && ('X-Purpose' in opts.headers || 'x-purpose' in opts.headers));

  if (!eligible) {
    try {
      const out = await networkRequest<T>(path, opts, method);
      // Invalidate here rather than at each call site. Governed actions are
      // invoked from at least five different modules, and a new one added later
      // would otherwise silently get no invalidation — leaving the operator
      // looking at a value the server has already changed. Hooking the single
      // chokepoint makes it correct by construction.
      // A GET that bypassed the cache is still a live answer, and it has to be
      // RECORDED as one rather than merely not recorded. `cache: false` is what a
      // surface uses when it must not be stale (re-reading a deal's stage as a
      // close flow opens); without this the previous cached-age record survives
      // and the surface goes on advertising an age for a value it just refreshed
      // — which is the same lie as the one this affordance removes, pointed the
      // other way.
      if (method === 'GET') {
        noteServed(canonicalPath(path), { storedAt: Date.now(), fromCache: false });
      }
      const action = governedActionId(path, method);
      if (action) invalidateAfterAction(action);
      return out;
    } catch (err) {
      if (isNetworkError(err)) noteTransport(false);
      throw err;
    }
  }

  const canonical = canonicalPath(path);
  const hit = await lookup<T>(canonical);

  if (hit.usable && hit.entry) {
    noteRead(true);
    // The one place a surface can learn that the number it is about to paint is
    // not live. Recorded on the way OUT, next to the body being returned, so the
    // record can never describe a body a caller did not receive.
    noteServed(canonical, { storedAt: hit.entry.storedAt, fromCache: true });
    if (hit.stale) {
      // Stale-while-revalidate: the operator already has pixels; refresh behind
      // them. Coalesced, so five components revisiting the same surface at once
      // produce one request. Failures are swallowed — the cached body stands.
      // Deliberately does NOT noteServed(): the fresh body is stored, but the
      // caller above already has the OLD one and nothing hands them the new one.
      // Marking the path live here would erase the age badge off a number the
      // operator is still looking at — the precise dishonesty this pass removes.
      void coalesce(canonical, () => networkRequest<T>(path, opts, method))
        .then((fresh) => store(canonical, fresh, { noStore: noStoreFlag }))
        .catch((err) => {
          if (isNetworkError(err)) noteTransport(false);
        });
    }
    return hit.entry.body;
  }

  noteRead(false);
  try {
    const fresh = await coalesce(canonical, () => networkRequest<T>(path, opts, method));
    store(canonical, fresh, { noStore: noStoreFlag });
    // Live. Recorded rather than merely left absent, so a surface that was on a
    // cached body a moment ago stops claiming an age the instant it is refreshed.
    noteServed(canonical, { storedAt: Date.now(), fromCache: false });
    return fresh;
  } catch (err) {
    if (isNetworkError(err)) noteTransport(false);
    throw err;
  }
}

/**
 * The action id when this request is a governed write, else null. Only a
 * SUCCESSFUL invoke reaches the caller, so matching the path here is enough —
 * a gate rejection throws and never invalidates.
 */
function governedActionId(path: string, method: string): string | null {
  if (method === 'GET') return null;
  const m = /^\/v1\/actions\/([^/?]+)\/invoke\b/.exec(path);
  return m ? m[1] : null;
}

/**
 * A transport failure, as distinct from the server answering with an error. Only
 * the former is evidence about connectivity — a 403 means we are very much online.
 */
function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError);
}

/**
 * Feed real evidence to the connectivity state machine. navigator.onLine reports
 * LINK state — true on a captive portal, true when the API alone is unreachable —
 * so the only honest signal is whether our own requests actually complete.
 * lib/online is dependency-free, so this import cannot cycle.
 */
function noteTransport(ok: boolean): void {
  recordNetworkResult(ok ? 'ok' : 'network-error');
}

/** Public health check — no auth. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { auth: false, signal });
}

/** Protected operator probe. */
export async function getMe(signal?: AbortSignal): Promise<OperatorPrincipal> {
  const res = await request<{ data: OperatorPrincipal }>('/v1/me', { auth: true, signal });
  return res.data;
}

export const apiConfig = {
  base: API_BASE || '/api',
  get hasKey(): boolean {
    return Boolean(getApiKey());
  },
} as const;
