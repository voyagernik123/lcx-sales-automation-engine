/**
 * Browser → LCX Sales API client.
 * Local: Vite proxies /api/* → http://127.0.0.1:8787/*
 * Prod: set VITE_API_URL to the API origin.
 */

import type { HealthResponse, OperatorPrincipal } from '@lcx/shared';
import { isTerminal } from './container';
import { canonicalPath, lookup, store, coalesce } from './readCache';
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
 * In LCX TERMINAL the credential lives in the macOS Keychain, which is an
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
 * before the app renders, when running inside LCX TERMINAL. No-op in a browser.
 */
export async function hydrateCredentials(): Promise<void> {
  // Container check BEFORE the dynamic import. main.tsx awaits this call before
  // mounting React, so importing ./terminal first put a round-trip for a 2KB
  // chunk directly on the browser's path to first paint (measured ~240ms of
  // blank screen on Cloudflare Pages) to load a module that instantly returns.
  if (!isTerminal()) return;
  const { secretGet } = await import('./terminal');
  const [email, pass] = await Promise.all([secretGet(EMAIL_KEY), secretGet(PASS_KEY)]);
  memEmail = email;
  memPass = pass;
}

/** Record the signed-in operator's credentials (front door): email + desk passcode. */
export function setOperatorCredentials(email: string, passcode: string): void {
  const e = email.trim().toLowerCase();
  memEmail = e || null;
  memPass = passcode || null;
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

/** Clear the email credential on sign-out (leaves any legacy key untouched). */
export function clearOperatorEmail(): void {
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
  // Forget the Keychain entries too, so sign-out on the terminal is real.
  if (!isTerminal()) return;
  void (async () => {
    const { secretDelete } = await import('./terminal');
    await Promise.all([secretDelete(EMAIL_KEY), secretDelete(PASS_KEY)]);
  })();
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
  if (opts.auth !== false && apiKey) {
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
    if (hit.stale) {
      // Stale-while-revalidate: the operator already has pixels; refresh behind
      // them. Coalesced, so five components revisiting the same surface at once
      // produce one request. Failures are swallowed — the cached body stands.
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
