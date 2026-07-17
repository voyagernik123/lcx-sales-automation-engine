import { ApiError } from './apiClient';

/**
 * Error taxonomy (FINAL_MASTER_PLAN 5.1): every failure the UI shows maps to
 * one of six classes with designed, human-actionable recovery copy. A raw
 * error string on screen is a release blocker; surfaces render the classified
 * form (ErrorNotice) or feed it to toasts.
 */

export type ErrorKind = 'auth' | 'permission' | 'validation' | 'conflict' | 'rate-limit' | 'network' | 'system';

export interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  /** Human copy: what happened + what to do about it. */
  message: string;
  /** Whether an immediate retry is a sensible recovery. */
  retryable: boolean;
  /** The underlying detail, for the expandable fine print. */
  detail?: string;
}

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof ApiError) {
    const detail = err.message;
    switch (true) {
      case err.status === 401:
        return { kind: 'auth', title: 'Signed out', message: 'Your session is no longer valid — sign in again from the front door.', retryable: false, detail };
      case err.status === 403:
        return { kind: 'permission', title: 'Not permitted', message: 'Your seat can’t perform this action. If it should, ask the desk admin.', retryable: false, detail };
      case err.status === 409:
        return { kind: 'conflict', title: 'Someone got there first', message: 'The record changed underneath you — refresh to see its current state, then retry.', retryable: true, detail };
      case err.status === 422 || err.status === 400:
        return { kind: 'validation', title: 'The change was rejected', message: 'The values didn’t pass validation — check the input and try again.', retryable: false, detail };
      case err.status === 429:
        return { kind: 'rate-limit', title: 'Going too fast', message: 'The API is throttling this client — give it a minute and retry.', retryable: true, detail };
      default:
        return { kind: 'system', title: 'Something broke on our side', message: 'The request failed in the API — retry; if it persists, check the audit log and the API health dot below.', retryable: true, detail };
    }
  }
  if (err instanceof TypeError || (err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message))) {
    return { kind: 'network', title: 'No connection', message: 'The API is unreachable — the status bar shows when it’s back. Nothing was lost.', retryable: true, detail: err instanceof Error ? err.message : undefined };
  }
  return {
    kind: 'system',
    title: 'Something broke',
    message: 'An unexpected error occurred — retry; if it persists, check the console.',
    retryable: true,
    detail: err instanceof Error ? err.message : String(err),
  };
}
