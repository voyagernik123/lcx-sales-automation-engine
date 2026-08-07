import { describe, expect, it } from 'vitest';
import { safeHref } from '../safeHref';

/**
 * THE HELPER HAD NO TESTS. It was correct on the cases it was written for, applied at
 * nine of twenty-three anchors, and nothing in the suite said what it promised — so
 * every renderer that used it was trusting a docstring.
 *
 * These are the cases that matter, and the last group is the one that was actually
 * wrong: two inputs came back as `https://<garbage>` instead of undefined, because
 * `String.trim()` does not strip U+0000 and does not touch a tab in the MIDDLE of a
 * string. Neither navigated anywhere dangerous — the browser resolves both to a broken
 * https URL — so this was laundering rather than execution. It is still laundering:
 * the reader is shown a link that this function invented from a hostile string.
 */
describe('safeHref refuses a scheme it will not vouch for', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'jAvAsCrIpT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://app.lcx.com/1234',
    'file:///etc/passwd',
    'tauri://localhost/x',
    'about:blank',
  ])('%s → undefined', (input) => {
    expect(safeHref(input)).toBeUndefined();
  });

  it('leading whitespace does not smuggle a scheme past the check', () => {
    // trim() runs first, so the scheme is read from the real first character.
    expect(safeHref('   javascript:alert(1)')).toBeUndefined();
    expect(safeHref('\t\njavascript:alert(1)')).toBeUndefined();
  });
});

describe('safeHref keeps the values the product actually stores', () => {
  it.each([
    ['https://example.com/x', 'https://example.com/x'],
    ['http://localhost:5173/ops', 'http://localhost:5173/ops'],
    ['mailto:a@b.com', 'mailto:a@b.com'],
    ['/deal-board', '/deal-board'],
    ['/bd-pipeline/abc?x=1', '/bd-pipeline/abc?x=1'],
    // A value someone TYPED into a website field. Repairing this is the whole reason
    // the scheme-less branch exists.
    ['example.com/path', 'https://example.com/path'],
    ['//cdn.example.com/x', 'https://cdn.example.com/x'],
  ])('%s → %s', (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });

  it('absent stays absent — undefined, not an empty string that renders as a dead link', () => {
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref('   ')).toBeUndefined();
  });
});

describe('a control character is refused, never repaired into a plausible URL', () => {
  /**
   * The URL parser deletes ASCII tab/LF/CR from ANYWHERE in the input before it reads
   * the scheme. So `java<TAB>script:` is `javascript:` to a browser, and a check that
   * only inspects the leading characters is looking at the wrong string.
   *
   * Refusing the character beats stripping it: stripping means reimplementing the
   * parser's removal rules exactly, and a near-miss there is a bypass.
   */
  it.each([
    ['NUL then a scheme', '\u0000javascript:alert(1)'],
    ['tab inside the scheme', 'java\tscript:alert(1)'],
    ['newline inside the scheme', 'java\nscript:alert(1)'],
    ['CR inside the scheme', 'java\rscript:alert(1)'],
    ['NUL inside the scheme', 'java\u0000script:alert(1)'],
    ['DEL in a hostname', 'exa\u007fmple.com'],
    ['a control character in an otherwise fine https URL', 'https://example.com/\u0000x'],
  ])('%s → undefined', (_label, input) => {
    expect(safeHref(input)).toBeUndefined();
  });

  it('does NOT return a https:// URL it built out of a control character', () => {
    // The exact regression: these used to come back as 'https://java\tscript:alert(1)'
    // and 'https://\u0000javascript:alert(1)'.
    for (const bad of ['java\tscript:alert(1)', '\u0000javascript:alert(1)']) {
      const out = safeHref(bad);
      // `?? ''` rather than a bare `.not.toMatch`, because toMatch THROWS on
      // undefined and that throw would read as a failure for the wrong reason.
      expect(out ?? '', `safeHref(${JSON.stringify(bad)}) invented a URL`).not.toMatch(/^https:\/\//);
    }
  });

  it('an ordinary space is left alone — it is not a scheme smuggler', () => {
    // The parser does NOT remove interior spaces, so a space cannot form a hidden
    // scheme, and refusing it would break real typed values with trailing junk.
    expect(safeHref('example.com/a b')).toBe('https://example.com/a b');
  });
});
