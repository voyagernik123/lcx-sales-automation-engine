/**
 * Extract a Postgres error code from a raw pg error or a Drizzle-wrapped one
 * (drizzle puts the pg error on .cause). Mirrors the logic in app.ts onError.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  if (cause && typeof cause === 'object' && typeof cause.code === 'string') return cause.code;
  return undefined;
}

/** True when the error is Postgres 42703 — undefined column (migration not yet applied). */
export function isUndefinedColumn(err: unknown): boolean {
  return pgErrorCode(err) === '42703';
}
