import { useCallback, useEffect, useRef, useState } from 'react';
import { errorSentence, notPermitted, routeAbsent } from './narrow';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  FIVE STATES, AND THE REASON IT IS NOT TWO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every marketing panel that reads the network gets its state from here, so that the one
 * distinction this compartment exists to keep cannot be lost in a panel somebody wrote
 * quickly:
 *
 *   `loading`   nothing is known yet. Renders a skeleton, never an empty table.
 *   `absent`    THE ROUTE IS NOT ON THIS ENVIRONMENT (404/501). Renders `Absent` — "we
 *               cannot see" — and the panel says what must NOT be concluded from it.
 *   `forbidden` the route is there and THIS READER lacks the role (403/401). Five of the
 *               marketing routes are `requireApprover`. This is a fact about authority, not
 *               about the deployment and not about the data — so it must not render as
 *               either. An operator told "not on this environment" escalates a bug that
 *               does not exist; one told "read failed" retries forever.
 *   `failed`    the route is there and refused, or the network broke. Renders the API's
 *               own sentence as a refusal.
 *   `ok`        a payload arrived. It may still be empty, and an empty payload renders
 *               `Nothing` — which looks different from `absent` on purpose.
 *
 * `absent` AND AN EMPTY `ok` ARE THE PAIR THAT MATTERS. "No regulator warnings today" and
 * "the watch route is unmounted so nothing looked" are opposite facts, and a panel that
 * renders both as a blank table tells an operator the second is the first. That is the
 * defect this compartment has now been caught on three times — an engine with no caller
 * looks identical to an engine that found nothing — and it is a five-state type rather
 * than a convention because a convention is a thing an agent forgets at 3am.
 *
 * NOTHING HERE RETRIES ON A TIMER. A panel that refetches on an interval turns a
 * regulator feed into a number to be watched, and this desk's own doctrine is that a
 * figure nobody can defend is not softened by being fresher.
 */
export type DeskRead<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'absent' }
  | { readonly state: 'forbidden'; readonly sentence: string }
  | { readonly state: 'failed'; readonly sentence: string }
  | { readonly state: 'ok'; readonly value: T };

/**
 * Run one read and hold its five-state result.
 *
 * ── WHY THE IDENTITY IS A `key` STRING AND NOT A DEPENDENCY ARRAY ─────────────
 * The obvious signature is `useDeskRead(read, deps)` with `useCallback(read, deps)`
 * inside, and it cannot be written without an `eslint-disable` for
 * `react-hooks/exhaustive-deps` — the rule cannot see through a forwarded dep array. A
 * suppression is not available in this compartment, and it should not be: the rule is
 * right that a hook whose dependencies the linter cannot verify is a refetch loop or a
 * stale closure waiting to happen.
 *
 * So the caller states the identity of the read as a string — `precedent:${query}`,
 * `instance:${id}` — and the fetcher lives in a ref. The effect's dependencies are then
 * fully visible to the linter, and the caller cannot accidentally depend on a closure
 * identity that changes every render. It also makes the identity READABLE: two panels
 * reading the same key are reading the same thing.
 *
 * THE ABORT IS A `cancelled` FLAG RATHER THAN AN `AbortController` because these reads go
 * through `lib/apiClient.ts`, which owns its own signal; what this guards is the state
 * write after unmount, and a re-ordered earlier response overwriting a newer result. Both
 * were live bugs in this app's GPS panels.
 */
export function useDeskRead<T>(
  key: string,
  read: () => Promise<T>,
): { readonly result: DeskRead<T>; readonly reload: () => void } {
  const [result, setResult] = useState<DeskRead<T>>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  /* The fetcher is held in a ref and updated on every render, so the effect always calls
     the CURRENT closure — with the current props — while refiring only when `key` or the
     reload nonce changes. A stale closure here would read the previous query's text. */
  const latest = useRef(read);
  latest.current = read;

  useEffect(() => {
    let cancelled = false;
    setResult({ state: 'loading' });
    latest.current()
      .then((value) => { if (!cancelled) setResult({ state: 'ok', value }); })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (routeAbsent(e)) setResult({ state: 'absent' });
        else if (notPermitted(e)) setResult({ state: 'forbidden', sentence: errorSentence(e) });
        else setResult({ state: 'failed', sentence: errorSentence(e) });
      });
    return () => { cancelled = true; };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { result, reload };
}
