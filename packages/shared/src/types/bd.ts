/**
 * BD domain types — expanded in later slices (projects, scores, outreach, deals).
 * Slice 1: health + auth contracts only.
 */

export type DbStatus = 'up' | 'down' | 'skipped';

export interface HealthResponse {
  ok: boolean;
  service: 'lcx-sales-api';
  version: string;
  env: string;
  db: DbStatus;
  timestamp: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export interface ApiSuccessBody<T> {
  data: T;
  meta?: {
    timestamp: string;
    version: string;
  };
}

/**
 * Operator identity, resolved either from the shared static API key (v1,
 * still used for local dev/tests/service-to-service calls) or from a
 * verified Supabase Google-login JWT (v2 — real per-person identity, gated
 * to @lcx.com email addresses).
 */
export interface OperatorPrincipal {
  id: string;
  role: 'operator';
  authMethod: 'api_key' | 'google';
  email?: string;
  name?: string;
}
