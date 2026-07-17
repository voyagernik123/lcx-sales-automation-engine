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
 * Operator identity resolved from the request credential — either the shared
 * `OPERATOR_API_KEY` (cron, integrations) or a desk member's email address
 * (per-person sign-in). `role` stays 'operator' for both: API RBAC is
 * single-tier today (see middleware/permissions.ts), and the approver/operator
 * distinction is applied on the client. `id` is the real member id when known,
 * so writes attribute to the person, not a generic "operator".
 */
export interface OperatorPrincipal {
  id: string;
  role: 'operator';
  authMethod: 'api_key' | 'email';
}
