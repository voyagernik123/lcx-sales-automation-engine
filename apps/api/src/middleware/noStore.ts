import { createMiddleware } from 'hono/factory';

/**
 * The server-side cache kill switch (LCX TERMINAL Phase 2).
 *
 * The desktop client keeps an opaque read cache whose policy table ships INSIDE
 * the signed macOS bundle. If an endpoint is ever mis-classified as cacheable,
 * correcting the client costs a full app release through the updater — days,
 * while operators read stale numbers. This header lets the API revoke caching
 * for any response in one deploy.
 *
 * DENY-ONLY, and that is the whole safety argument: the protocol has exactly one
 * signal, "do not store this". There is no affirmative "you may cache this"
 * value, so a header — whether set by us, injected by a proxy, or forged — can
 * only ever move the client toward MORE conservative behaviour. The client's own
 * policy table remains the sole authority on what is cacheable at all; this
 * header can subtract from that set and never add to it.
 *
 * Contract: `X-LCX-No-Store: 1` on the response ⇒ the client must not write
 * this response into any cache, and must evict an existing entry for the same
 * key. Absence of the header means nothing more than "no veto" — it is NOT
 * permission to cache. Any other value is treated as absent.
 */
export const NO_STORE_HEADER = 'X-LCX-No-Store';
export const NO_STORE_VALUE = '1';

/**
 * Path prefixes whose responses may never be served from a client cache.
 *
 * WHY these five, and why staleness here is worse than slowness:
 *
 * Every governance gate reads its inputs at WRITE time — the moment an operator
 * commits an action — and three of them fail OPEN when that read errors
 * (actions/registry.ts:205, registry.ts:632, routes/reviews.ts:212-213 all
 * resolve to "gate satisfied" on failure). So the value an operator is looking
 * at when they decide is the value the gate is judged against. Serve a stale
 * one and the operator mints an audited override against a state that no longer
 * exists: the audit row is permanent, its justification is fiction, and the
 * override cannot be un-minted. A slow correct read costs 200ms; a fast stale
 * read costs a wrong governance decision on the permanent record.
 *
 *  /v1/access    entitlements (/me), the capability matrix, access requests,
 *                member dossiers and the activity log. This is the input to
 *                every need-to-know decision, and /members/:id is itself
 *                purpose-logged — caching it would also hide a re-read from
 *                the access trail.
 *  /v1/audit     the append-only record. A cached page can omit rows written
 *                since, which is the one thing an audit view must never do.
 *  /v1/reviews   the tradecraft artifacts (premortem, devils_advocate,
 *                legal_check) that the SAT gates count. A stale list is
 *                precisely the fail-open path above, reached without an error.
 *  /v1/x402      the priced-endpoint catalog and the 402 challenges. Payment
 *                instructions and per-request settlement state; a replayed
 *                challenge is a payment defect, not a rendering defect.
 *  /v1/intel/slo the live latency/SLO surface. Cached, it reports the health of
 *                a past moment while claiming to report now — and it is what
 *                operators consult to decide whether to trust the rest.
 */
export const NEVER_CACHE_PREFIXES: readonly string[] = [
  '/v1/access',
  '/v1/audit',
  '/v1/reviews',
  '/v1/x402',
  '/v1/intel/slo',
];

/** Structural so a route handler can pass its own Context without importing Env generics. */
interface HeaderSink {
  header: (name: string, value: string) => void;
}

/**
 * Veto caching of THIS response. Safe to call more than once, and safe to call
 * from a handler that also hits the prefix middleware — the header is a set,
 * not an accumulator.
 */
export function markNoStore(c: HeaderSink): void {
  c.header(NO_STORE_HEADER, NO_STORE_VALUE);
  // Our client honours X-LCX-No-Store; shared intermediaries (Cloudflare, any
  // future reverse proxy) only understand the standard directive.
  c.header('Cache-Control', 'no-store');
}

function isNeverCached(path: string, prefixes: readonly string[]): boolean {
  // Segment-aware so /v1/accessories can never be caught by /v1/access.
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Mount globally, ahead of the route mounts, so the veto also lands on the
 * gate rejections (401/403) and error envelopes those namespaces produce — not
 * just on their 200s.
 */
export function noStore(prefixes: readonly string[] = NEVER_CACHE_PREFIXES) {
  return createMiddleware(async (c, next) => {
    // Set before next(): Hono merges prepared headers into whatever response the
    // handler builds, which also survives a handler that replaces c.res outright.
    if (isNeverCached(c.req.path, prefixes)) markNoStore(c);
    await next();
  });
}
