/**
 * Browser → LCX Sales API client.
 * Local: Vite proxies /api/* → http://127.0.0.1:8787/*
 * Prod: set VITE_API_URL to the API origin.
 */

import type { HealthResponse, OperatorPrincipal } from '@lcx/shared';
import { isTerminal } from './container';

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

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra request headers (e.g. X-Purpose for LCX OS purpose-based reads). */
  headers?: Record<string, string>;
};

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
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
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
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
    throw new ApiError(err?.error ?? res.statusText, res.status, err?.code);
  }

  return json as T;
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
