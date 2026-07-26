import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLink } from '../url';

/**
 * The regression this file exists for, in the operator's own words: "the panels are
 * opening fine but the moment I click on something they start breaking".
 *
 * A real lead carries `https://reppo foundation` in its website column. `LeadDetail`
 * called `new URL()` on it and WebKit threw `"https://reppo foundation" cannot be
 * parsed as a URL.`, which the module error boundary caught — and then, because that
 * boundary had no reset, EVERY page opened afterwards showed the same error.
 *
 * So there are two tests: this one, that a malformed URL cannot throw, and
 * `errorBoundaryReset.test.tsx`, that a crash does not follow the operator to the
 * next route. Either fix alone would have left the app broken in a different way.
 */
describe('parseLink — malformed URLs must never throw', () => {
  it('returns null for the exact value that broke the shipped app', () => {
    // The literal from production. `new URL()` on this throws; parseLink must not.
    expect(() => parseLink('https://reppo foundation')).not.toThrow();
    expect(parseLink('https://reppo foundation')).toBeNull();
  });

  const junk: Array<[string | null | undefined, string]> = [
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['n/a', 'a placeholder someone typed'],
    ['tbd', 'another placeholder'],
    ['https://', 'a scheme with no host'],
    ['http:// spaced.com', 'a leading space in the host'],
    ['not a url at all', 'free text'],
    ['localhost', 'a host with no dot'],
  ];
  it.each(junk)('returns null for %j (%s) without throwing', (input) => {
    expect(() => parseLink(input)).not.toThrow();
    expect(parseLink(input)).toBeNull();
  });

  it('refuses non-web schemes, which would otherwise become a clickable href', () => {
    // This is the one check that is about safety rather than tidiness: a
    // `javascript:` value in an ingested column must not be rendered as a link.
    expect(parseLink('javascript:alert(1)')).toBeNull();
    expect(parseLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(parseLink('file:///etc/passwd')).toBeNull();
  });
});

describe('parseLink — real values must still work', () => {
  it.each([
    ['https://lcx.com', 'lcx.com'],
    ['https://www.lcx.com', 'lcx.com'],
    ['http://lcx.com', 'lcx.com'],
    ['lcx.com', 'lcx.com'],
    ['www.lcx.com', 'lcx.com'],
    ['https://lcx.com/listings?a=1#top', 'lcx.com'],
    ['https://sub.domain.lcx.com', 'sub.domain.lcx.com'],
    ['  https://lcx.com  ', 'lcx.com'],
  ])('%j → host %j', (input, host) => {
    expect(parseLink(input)?.host).toBe(host);
  });

  it('preserves an explicit http scheme rather than silently upgrading it', () => {
    // Upgrading would be a lie about where the link goes.
    expect(parseLink('http://lcx.com')?.href).toBe('http://lcx.com/');
  });

  it('assumes https only for a scheme-less value', () => {
    expect(parseLink('lcx.com')?.href).toBe('https://lcx.com/');
  });

  /**
   * NON-VACUITY. Every assertion above would also pass against a `parseLink` that
   * returned null for everything, so this pins that the happy path really works.
   */
  it('actually parses something', () => {
    expect(parseLink('https://lcx.com')).toEqual({ href: 'https://lcx.com/', host: 'lcx.com' });
  });
});

describe('no page may call new URL() on ingested data', () => {
  /**
   * THE RATCHET, and it is the one that matters. Everything above tests the helper;
   * none of it would notice someone putting `new URL(lead.website)` back into a page,
   * which is the actual defect the operator hit. Pages render data that arrives from
   * CSVs and third parties, so a bare `new URL()` there is a crash waiting for a row.
   *
   * Scoped to `pages/` deliberately: `new URL()` is correct in plenty of places —
   * against a constant, or with a base, or in lib code that catches. This forbids it
   * where the argument is almost always a database column.
   */
  it('apps/web/src/pages contains no bare new URL(', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pages = resolve(here, '../../pages');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(e.name)) {
          const text = readFileSync(full, 'utf8');
          text.split('\n').forEach((line, i) => {
            // Skip comments so a line explaining the rule cannot trip it.
            const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
            if (code.includes('new URL(')) hits.push(`${e.name}:${i + 1}`);
          });
        }
      }
    };
    walk(pages);
    expect(
      hits,
      `use parseLink() from @/lib/url instead — a malformed value throws and takes the page down: ${hits.join(', ')}`,
    ).toEqual([]);
  });
});
