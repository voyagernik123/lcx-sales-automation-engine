/**
 * Reading a URL out of ingested data without crashing the page.
 *
 * WHY THIS FILE EXISTS. `LeadDetail` rendered `new URL(lead.website).hostname`
 * directly. One real lead has `https://reppo foundation` in its website column —
 * a space in the host — and `new URL()` THROWS on that. WebKit's wording:
 *
 *     "https://reppo foundation" cannot be parsed as a URL.
 *
 * So opening that lead took the page down, and because the error boundary wrapped
 * the routed outlet with no reset, every page opened afterwards showed the same
 * error until a full reload. Found by an operator clicking around the shipped Mac
 * app — no test had ever fed a malformed URL to a page.
 *
 * THE POINT: this data is INGESTED, from CSVs and third-party sources, and nothing
 * validates it on the way in. There will be more of these — a missing scheme, a
 * trailing comma, `n/a`, an email in a website column. A page must render a
 * plausible-but-wrong string as harmless text, never as an exception.
 *
 * Deliberately NOT a validator: it does not tell you whether a URL is reachable,
 * correct, or safe. It answers exactly one question — can this be displayed as a
 * link, and if so what host do I show — and returns null when it cannot.
 */

export interface ParsedLink {
  /** Safe to use as an `href`. */
  href: string;
  /** What to show the operator — the host, without `www.`. */
  host: string;
}

/**
 * Parse a URL from data, or return null.
 *
 * Accepts a bare host (`lcx.com`) by assuming https, because that is the single
 * most common shape in this dataset and refusing it would hide a working link.
 * Everything else that `URL` rejects is rejected here too, quietly.
 */
export function parseLink(raw: string | null | undefined): ParsedLink | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // A scheme-less value is the common case in ingested data. Try it as-is first so
  // an explicit `http://` is preserved rather than silently upgraded.
  const candidates = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? [trimmed]
    : [`https://${trimmed}`];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      // `new URL` accepts some things that are useless as links — `https://` with
      // no host parses in some engines, and a host with no dot is usually a typo
      // rather than an intranet name in THIS dataset.
      if (!url.hostname || !url.hostname.includes('.')) return null;
      // Only web schemes get rendered as links. `javascript:` and `data:` in a
      // website column would otherwise become a clickable href — this is the one
      // place where the check is about safety rather than tidiness.
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return { href: url.href, host: url.hostname.replace(/^www\./, '') };
    } catch {
      /* not a URL — fall through and return null */
    }
  }
  return null;
}
