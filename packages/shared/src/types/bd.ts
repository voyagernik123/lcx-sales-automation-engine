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

/** Operator identity resolved from API key (v1 = single shared key). */
export interface OperatorPrincipal {
  id: string;
  role: 'operator';
  authMethod: 'api_key';
}
