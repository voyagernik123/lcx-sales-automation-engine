/**
 * Sanitize a URL before putting it in an <a href>. React does NOT block
 * `javascript:`/`data:`/`vbscript:` hrefs, so an attacker-influenced value
 * (e.g. an ingested project `website` field) could execute script on click.
 * Allow only http(s)/mailto and scheme-less values (treated as https); reject
 * everything else — and anything carrying a C0 control character — by returning
 * undefined (renders a non-navigable anchor).
 *
 * APPLY IT AT EVERY DATA-DRIVEN href. It was applied at nine of twenty-three, which
 * is why `lib/__tests__/hrefSinks.test.ts` now walks the source and fails on a sink
 * that skips it. The server refuses the same shapes on write
 * (`apps/api/src/actions/registry.ts`); this is the second layer, and the only one
 * that covers rows written before that landed.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const t = url.trim();
  if (!t) return undefined;
  /*
   * C0 CONTROLS AND DEL — REFUSED, NOT REPAIRED.
   *
   * The URL parser deletes ASCII tab, LF and CR from ANYWHERE in the input before
   * it reads the scheme, and `String.trim()` does not remove U+0000 at all. So two
   * values reached the `https://` fallback below and came back as a URL:
   *
   *   'java\tscript:alert(1)'   → 'https://java\tscript:alert(1)'
   *   '\u0000javascript:alert(1)' → 'https://\u0000javascript:alert(1)'
   *
   * Neither of those NAVIGATES anywhere dangerous — the browser resolves them to a
   * broken https URL, which is why this was not an exploit. But it is the same
   * defect in a milder register: a hostile string was LAUNDERED into something that
   * looks like a link, and the reader is shown a plausible destination that was
   * invented here. The scheme-less fallback exists to repair a value someone
   * TYPED ('example.com/path'); nobody types a tab into a hostname.
   *
   * Refusing the character rather than stripping it is deliberate. Stripping means
   * reimplementing the URL parser's removal rules exactly, and a near-miss there is
   * a bypass.
   *
   * THE TWO LAYERS ARE NOT THE SAME RULE, and it would be worse if they were. The
   * server (`isNavigableHref` in apps/api/src/actions/registry.ts) is STRICTER, because
   * it governs a value being CREATED and can simply say what to send: it refuses
   * `mailto:`, refuses protocol-relative `//host/x`, refuses a scheme-less
   * `example.com/path`, and refuses any ASCII space. This function governs a value that
   * ALREADY EXISTS — including rows written before that check landed, and fields like an
   * ingested `website` that no action ever validated — so it repairs what it safely can
   * and only refuses what it cannot vouch for. What the two DO agree on is the part that
   * matters here: no C0 control, no DEL, and no scheme outside the allowed set.
   */
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return undefined;
  const scheme = t.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    return s === 'http' || s === 'https' || s === 'mailto' ? t : undefined;
  }
  if (t.startsWith('//')) return `https:${t}`; // protocol-relative
  if (t.startsWith('/')) return t; // site-relative path
  return `https://${t}`; // bare domain like "example.com/path"
}
