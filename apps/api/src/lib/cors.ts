/**
 * Which browser origins may read this API's responses.
 *
 * THE BUG THIS FILE EXISTS TO FIX. Cloudflare Pages gives every deployment its
 * own hostname — `https://<hash>.<project>.pages.dev` — alongside the stable
 * production alias `https://<project>.pages.dev`. Those are DIFFERENT origins to
 * a browser. `CORS_ORIGINS` only ever listed the alias, so opening the desk on a
 * per-commit preview URL produced:
 *
 *     Origin:                       https://f2a86c32.lcx-sales-automation-engine.pages.dev
 *     access-control-allow-origin:  https://lcx-sales-automation-engine.pages.dev
 *
 * The header does not match the request origin, so the browser discards the
 * response before any of our code sees it. Every fetch fails identically to a
 * dead server, which is exactly how the login screen reported it: "The desk could
 * not reach the API to verify you" over a red API DOWN. Nothing was down.
 *
 * WHY PREVIEW ORIGINS ARE DERIVED, NOT CONFIGURED. A new env var would be one
 * more thing to remember at rename time, and the information is already present:
 * if `https://<project>.pages.dev` is allowlisted, then that Pages project is
 * ours, and only Cloudflare can mint subdomains under it for our own account.
 * Trusting its deployment subdomains grants nothing that the apex did not already
 * grant. So adding a production origin to CORS_ORIGINS now covers its previews
 * too, and the pending `lcx-os` rename needs no code change here.
 *
 * WHAT IS DELIBERATELY NOT WIDENED. Not a wildcard, not `*.pages.dev` (that is
 * every Cloudflare user's namespace, including an attacker's), and not http. The
 * matcher below is anchored at both ends and allows exactly ONE label in front of
 * a project we already trust.
 */

/** A single DNS label: what Cloudflare puts in front of the project name. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pages projects we trust, read out of the exact-match allowlist. Only `https`
 * apexes qualify: an http origin in the list is a localhost dev entry, and
 * treating it as a Pages project would be nonsense.
 */
export function pagesProjectsFrom(allowlist: readonly string[]): string[] {
  const projects = new Set<string>();
  for (const origin of allowlist) {
    const m = /^https:\/\/([a-z0-9-]+)\.pages\.dev$/.exec(origin.trim().toLowerCase());
    if (m) projects.add(m[1]!);
  }
  return [...projects];
}

/** `^https://<one-label>.(projectA|projectB).pages.dev$`, or null if none. */
function previewMatcher(allowlist: readonly string[]): RegExp | null {
  const projects = pagesProjectsFrom(allowlist);
  if (projects.length === 0) return null;
  const alt = projects.map(escapeRe).join('|');
  return new RegExp(`^https://${LABEL}\\.(?:${alt})\\.pages\\.dev$`);
}

/**
 * True when `origin` may read our responses.
 *
 * Exact allowlist match first — that is the common path and the cheap one. The
 * preview match is a fallback, and it is case-normalised because browsers send
 * the origin lowercased but a hand-edited env var may not be.
 */
export function isAllowedOrigin(origin: string, allowlist: readonly string[]): boolean {
  if (!origin) return false;
  if (allowlist.includes('*')) return true;
  if (allowlist.includes(origin)) return true;

  const lower = origin.toLowerCase();
  if (allowlist.some((a) => a.trim().toLowerCase() === lower)) return true;

  return previewMatcher(allowlist)?.test(lower) ?? false;
}

/**
 * What to put in `access-control-allow-origin`.
 *
 * A DISALLOWED ORIGIN GETS THE EMPTY STRING, not `allowlist[0]`. The old code
 * echoed the first allowed origin back, which is functionally still a denial —
 * the browser compares and rejects — but it reads on the wire as an approval of
 * a host that never asked, and it is the reason this bug took a live curl to
 * diagnose instead of a glance at the response headers. An empty value denies
 * the same way and says so.
 *
 * A request with NO Origin header is not a browser under the same-origin policy
 * (curl, the cron tick, a server-to-server call), so there is nothing to
 * authorise; it keeps the previous behaviour of naming the primary origin.
 */
export function resolveCorsOrigin(
  origin: string | undefined,
  allowlist: readonly string[],
): string {
  if (!origin) return allowlist[0] ?? '*';
  if (allowlist.includes('*')) return origin;
  return isAllowedOrigin(origin, allowlist) ? origin : '';
}
