import { trustedProxyHops } from './auth.js';

/**
 * ONE DERIVATION OF "WHO IS CALLING" FOR EVERY RATE BUCKET IN THIS APP.
 *
 * ══ THE HOLE THIS CLOSES, FOUND IN THE G7 CLIENT-PLANE PEN-TEST ══
 * Two public-facing buckets — the services intake (G1, 5/hr) and the portal plane
 * (G4, 120/hr per caller) — keyed on `X-Forwarded-For.split(',')[0]`, i.e. the
 * LEFTMOST entry. A proxy APPENDS to that header, so the leftmost entry is whatever
 * the caller wrote: an attacker rotates one header value per request and the bucket
 * never fires. Both ceilings were decorative.
 *
 * `middleware/auth.ts:secondTierThrottleKey` had already been broken by a skeptic
 * once and rebuilt correctly — it reads `hops[length - TRUSTED_PROXY_HOPS]`, the
 * address the OUTERMOST TRUSTED PROXY OBSERVED, and refuses to index a header too
 * short to have traversed the declared chain. This module applies that same, already
 * reviewed rule to every other bucket, so the fix cannot be right in one place and
 * wrong in two.
 *
 * ── WHY `CF-Connecting-IP` IS NOT READ HERE, DELIBERATELY ────────────────────
 * The old code preferred it. Cloudflare sets it and a caller cannot forge it —
 * THROUGH CLOUDFLARE. This API is served directly by Render
 * (`lcx-sales-api.onrender.com`); only the web origin sits behind Cloudflare Pages.
 * A request that reaches this process has not necessarily passed Cloudflare, so
 * `CF-Connecting-IP` is an ordinary client-writable header here and preferring it
 * was strictly worse than reading nothing. If Cloudflare is ever put in front of the
 * API, the honest change is a declared hop count, not a resurrected header.
 *
 * ── THE FALLBACK IS FAIL-CLOSED, AND SAYS SO ────────────────────────────────
 * With no trustworthy header and no visible peer, every such caller shares ONE
 * bucket (`unattributable`). They throttle each other, which is the conservative
 * direction: a shared ceiling refuses too much, a spoofable per-caller ceiling
 * refuses nothing. `TRUSTED_PROXY_HOPS=1` is live on this deployment, so the normal
 * path is the XFF one and this branch is the honest degradation, not the design.
 */
export function rateBucketKey(c: {
  env?: unknown;
  req: { header: (name: string) => string | undefined };
}): string {
  const trusted = trustedProxyHops();
  if (trusted > 0) {
    const raw = c.req.header('x-forwarded-for');
    const hops = raw ? raw.split(',').map((s) => s.trim()).filter((s) => s !== '') : [];
    // A header carrying fewer entries than the declared chain cannot have traversed
    // it, so it is refused rather than indexed into — the same guard auth.ts uses.
    if (hops.length >= trusted) {
      const client = hops[hops.length - trusted];
      if (client) return `xff:${client}`;
    }
  }
  const peer = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  return peer ? `peer:${peer}` : 'unattributable';
}
