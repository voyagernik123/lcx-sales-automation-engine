import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, pagesProjectsFrom, resolveCorsOrigin } from '../cors.js';

/**
 * CORS is the one place where a lazy regex becomes a cross-origin read of a
 * licensed exchange's internal API. The widening here (Cloudflare Pages preview
 * subdomains) is only defensible if its boundaries are exact, so the near-miss
 * cases below matter more than the happy path.
 */

const PROD = 'https://lcx-sales-automation-engine.pages.dev';
const ALLOW = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  PROD,
  'tauri://localhost',
  'http://tauri.localhost',
] as const;

describe('exact allowlist behaviour is unchanged', () => {
  it('admits every origin that already worked', () => {
    for (const o of ALLOW) expect(isAllowedOrigin(o, ALLOW), o).toBe(true);
  });

  it('still refuses an unrelated host', () => {
    expect(isAllowedOrigin('https://evil.example', ALLOW)).toBe(false);
  });

  it('honours a wildcard allowlist', () => {
    expect(isAllowedOrigin('https://anything.example', ['*'])).toBe(true);
    expect(resolveCorsOrigin('https://anything.example', ['*'])).toBe('https://anything.example');
  });
});

describe('Cloudflare Pages preview deployments', () => {
  it('admits the origin that was actually failing', () => {
    // The exact URL from the broken login screen.
    expect(isAllowedOrigin('https://f2a86c32.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(true);
  });

  it('admits branch previews, which use a name rather than a hash', () => {
    expect(isAllowedOrigin('https://dev.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(true);
    expect(isAllowedOrigin('https://feat-marketing.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(true);
  });

  it('derives the trusted projects from the allowlist itself', () => {
    expect(pagesProjectsFrom(ALLOW)).toEqual(['lcx-sales-automation-engine']);
    // The rename lands by adding an origin, not by editing code.
    expect(pagesProjectsFrom([...ALLOW, 'https://lcx-os.pages.dev']).sort())
      .toEqual(['lcx-os', 'lcx-sales-automation-engine']);
    expect(isAllowedOrigin('https://abc123.lcx-os.pages.dev', [...ALLOW, 'https://lcx-os.pages.dev'])).toBe(true);
  });

  it('grants nothing when no Pages origin is allowlisted', () => {
    const localOnly = ['http://localhost:5173'];
    expect(pagesProjectsFrom(localOnly)).toEqual([]);
    expect(isAllowedOrigin('https://x.lcx-sales-automation-engine.pages.dev', localOnly)).toBe(false);
  });
});

describe('the boundaries of that widening', () => {
  /**
   * The whole point. `*.pages.dev` is a namespace shared with every other
   * Cloudflare customer, so a matcher that is one character too loose hands a
   * stranger's free static site read access to our API.
   */
  it('refuses another customer\'s Pages project', () => {
    expect(isAllowedOrigin('https://attacker.pages.dev', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://x.attacker.pages.dev', ALLOW)).toBe(false);
  });

  it('refuses a project whose name merely ENDS WITH ours', () => {
    // Unanchored suffix matching would let this through.
    expect(isAllowedOrigin('https://evil-lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://x.evil-lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
  });

  it('refuses our project name used as a LABEL under a foreign apex', () => {
    expect(isAllowedOrigin('https://lcx-sales-automation-engine.pages.dev.evil.example', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://lcx-sales-automation-engine.pages.dev.attacker.pages.dev', ALLOW)).toBe(false);
  });

  it('refuses extra label depth', () => {
    // Cloudflare mints exactly one label. Anything deeper is someone else's DNS.
    expect(isAllowedOrigin('https://a.b.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
  });

  it('refuses http, and refuses a port', () => {
    expect(isAllowedOrigin('http://f2a86c32.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://f2a86c32.lcx-sales-automation-engine.pages.dev:8080', ALLOW)).toBe(false);
  });

  it('refuses a path, userinfo, or anything else glued on', () => {
    expect(isAllowedOrigin('https://x.lcx-sales-automation-engine.pages.dev/', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://x.lcx-sales-automation-engine.pages.dev#@evil.example', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://evil.example@x.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
  });

  it('refuses a newline-smuggled second origin', () => {
    // Header injection via the echoed value. `$` with no `m` flag plus the
    // anchored label class rejects it.
    expect(isAllowedOrigin('https://x.lcx-sales-automation-engine.pages.dev\nevil', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://x.lcx-sales-automation-engine.pages.dev\r\nOrigin: evil', ALLOW)).toBe(false);
  });

  it('refuses an empty or malformed origin', () => {
    expect(isAllowedOrigin('', ALLOW)).toBe(false);
    expect(isAllowedOrigin('null', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
    expect(isAllowedOrigin('https://-x.lcx-sales-automation-engine.pages.dev', ALLOW)).toBe(false);
  });

  it('does not let a project name containing regex metacharacters break out', () => {
    // Defensive: project names cannot contain these today, but the allowlist is
    // operator-edited text and escaping is the difference between a typo and a
    // wildcard.
    const weird = ['https://a.b.pages.dev'];
    expect(pagesProjectsFrom(weird)).toEqual([]); // dots are not a valid project label
    expect(isAllowedOrigin('https://xxb.pages.dev', weird)).toBe(false);
  });
});

describe('what goes on the wire', () => {
  it('echoes an allowed origin', () => {
    expect(resolveCorsOrigin(PROD, ALLOW)).toBe(PROD);
    const preview = 'https://f2a86c32.lcx-sales-automation-engine.pages.dev';
    expect(resolveCorsOrigin(preview, ALLOW)).toBe(preview);
  });

  it('denies with an empty value rather than echoing an unrelated allowed host', () => {
    // The old behaviour returned allowlist[0], which looked like an approval of a
    // host that never asked and made this class of bug invisible in the headers.
    expect(resolveCorsOrigin('https://evil.example', ALLOW)).toBe('');
  });

  it('keeps naming the primary origin when there is no Origin header', () => {
    // Not a browser request under the same-origin policy — curl, the cron tick.
    expect(resolveCorsOrigin(undefined, ALLOW)).toBe(ALLOW[0]);
    expect(resolveCorsOrigin(undefined, [])).toBe('*');
  });
});
