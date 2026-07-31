/**
 * Telling "the API is down" apart from "the API refused THIS origin".
 *
 * WHY THIS EXISTS. A fetch blocked by CORS and a fetch that never reached a
 * server are the same event in JavaScript: an opaque `TypeError: Failed to
 * fetch`, with no status, no headers, and nothing in it that names the cause.
 * The spec hides the difference on purpose. So the login screen showed a red
 * API DOWN and said the desk could not reach the API — while the API was
 * answering `200 {"ok":true,"db":"up"}` to anyone who asked from an allowlisted
 * origin. The operator went looking for an outage that did not exist.
 *
 * The cause was a Cloudflare Pages PREVIEW hostname: every deployment gets its
 * own `<hash>.<project>.pages.dev`, which is a different origin from the
 * production alias that `CORS_ORIGINS` listed. `apps/api/src/lib/cors.ts` now
 * admits our own project's deployment subdomains, but a status light that lies
 * whenever an origin is unlisted is worth fixing on its own — the next cause
 * will be a new domain, a rename, or a stray env var.
 *
 * HOW THE DISTINCTION IS RECOVERED. A `mode: 'no-cors'` request is exempt from
 * the CORS read check: the browser sends it, and resolves with an opaque
 * response the moment the server answers at all. It rejects only when the
 * request genuinely could not complete — DNS, TCP, TLS, or a dead host. So:
 *
 *   normal fetch fails + no-cors fetch RESOLVES  → server up, this origin denied
 *   normal fetch fails + no-cors fetch REJECTS   → actually unreachable
 *
 * The opaque response's status is unreadable (always 0) and that is fine: this
 * asks "did anything answer", not "was it healthy". A 500 still proves reach.
 */

export type Reachability =
  /** Something answered, but the browser was not allowed to read it. */
  | 'origin-blocked'
  /** Nothing answered — DNS, TLS, offline, or the host really is down. */
  | 'down';

/**
 * Called only after a normal same-origin-policy fetch has already failed. On its
 * own this proves nothing: an opaque success means "reachable", which is only
 * interesting once the readable attempt has been seen to fail.
 *
 * `cache: 'no-store'` matters — a cached opaque response would report reach that
 * is minutes old, which is precisely the moment this is asked.
 */
export async function classifyUnreachable(
  healthUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Reachability> {
  try {
    await fetchImpl(healthUrl, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' });
    return 'origin-blocked';
  } catch {
    return 'down';
  }
}

/**
 * The operator-facing sentence. Names the origin, because "this origin is not
 * allowlisted" is unactionable without knowing which one — and on a preview URL
 * the hostname is a hash nobody recognises as significant.
 */
export function originBlockedMessage(origin: string): string {
  return (
    `The API is up but is refusing requests from this address (${origin}). ` +
    'This is usually a preview deployment — open the desk on its production URL, ' +
    'or have this origin added to CORS_ORIGINS.'
  );
}
