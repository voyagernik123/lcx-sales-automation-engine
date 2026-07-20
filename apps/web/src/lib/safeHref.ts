/**
 * Sanitize a URL before putting it in an <a href>. React does NOT block
 * `javascript:`/`data:`/`vbscript:` hrefs, so an attacker-influenced value
 * (e.g. an ingested project `website` field) could execute script on click.
 * Allow only http(s)/mailto and scheme-less values (treated as https); reject
 * everything else by returning undefined (renders a non-navigable anchor).
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const t = url.trim();
  if (!t) return undefined;
  const scheme = t.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    return s === 'http' || s === 'https' || s === 'mailto' ? t : undefined;
  }
  if (t.startsWith('//')) return `https:${t}`; // protocol-relative
  if (t.startsWith('/')) return t; // site-relative path
  return `https://${t}`; // bare domain like "example.com/path"
}
