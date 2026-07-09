/**
 * Browser → LCX Sales API client.
 * Local: Vite proxies /api/* → http://127.0.0.1:8787/*
 * Prod: set VITE_API_URL to the API origin.
 */

import type { HealthResponse, OperatorPrincipal } from '@lcx/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const ENV_API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? '';

// Operator key lives in localStorage in production so it never ships in the
// bundle (set once via: localStorage.setItem('lcx_api_key', '<key>')).
// VITE_API_KEY is the local-dev fallback only.
export function getApiKey(): string {
  try {
    return localStorage.getItem('lcx_api_key') ?? ENV_API_KEY;
  } catch {
    return ENV_API_KEY;
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
