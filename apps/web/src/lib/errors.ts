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
      // The old copy — "sign in again from the front door" — described an action
      // NOBODY TOOK (TERMINAL Phase 7.1). It was true as advice and false as a
      // description: the app left the operator where they were, with TopNav still
      // showing their name and every panel showing an auth error, and no route
      // change. As of this pass a 401 on an authenticated request clears the
      // credential and the operator store, which sends AppLayout's guard to
      // `/select` (lib/apiClient.ts, forceFrontDoor). So the copy now says what the
      // app does — and if that handler is ever removed, this sentence becomes a lie
      // again and should be changed back with it.
      case err.status === 401:
        return { kind: 'auth', title: 'Signed out', message: 'The API rejected this desk credential — returning you to the front door to sign in again.', retryable: false, detail };
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
    // "Nothing was lost" used to be the second sentence here, and it is a promise
    // this function is in no position to make (TERMINAL Phase 7). A transport
    // failure means the RESPONSE never arrived — not that the request never
    // landed. For a read that distinction is academic; for a governed write it is
    // the whole question, and `/v1/actions/:id/invoke` carries no idempotency key,
    // so an operator reassured that nothing happened and told to retry can append
    // a second decision, task or campaign row. Say what is actually known.
    return { kind: 'network', title: 'No connection', message: 'The API is unreachable — the status bar shows when it’s back. If you were saving something, re-open it to check before repeating the change.', retryable: true, detail: err instanceof Error ? err.message : undefined };
  }
  return {
    kind: 'system',
    title: 'Something broke',
    message: 'An unexpected error occurred — retry; if it persists, check the console.',
    retryable: true,
    detail: err instanceof Error ? err.message : String(err),
  };
}
