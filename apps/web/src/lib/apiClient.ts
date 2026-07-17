/**
 * Browser → LCX Sales API client.
 * Local: Vite proxies /api/* → http://127.0.0.1:8787/*
 * Prod: set VITE_API_URL to the API origin.
 */

import type { HealthResponse, OperatorPrincipal } from '@lcx/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
// DEV-only: gating on import.meta.env.DEV lets Vite dead-code-strip the key
// from production bundles, so a stray VITE_API_KEY in a prod build env can
// never be inlined and shipped to browsers. Prod keys live in localStorage.
const ENV_API_KEY = import.meta.env.DEV ? ((import.meta.env.VITE_API_KEY as string | undefined) ?? '') : '';

const EMAIL_KEY = 'lcx_operator_email';
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
export function getApiKey(): string {
  try {
    return (
      localStorage.getItem(EMAIL_KEY)?.trim() ||
      localStorage.getItem(LEGACY_KEY) ||
      ENV_API_KEY
    );
  } catch {
    return ENV_API_KEY;
  }
}

/** Record the signed-in operator's email as the API credential (front door). */
export function setOperatorEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* storage unavailable — in-memory session only */
  }
}

/** Clear the email credential on sign-out (leaves any legacy key untouched). */
export function clearOperatorEmail(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* no-op */
  }
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
