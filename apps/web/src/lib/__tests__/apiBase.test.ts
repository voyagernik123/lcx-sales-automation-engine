import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A PRODUCTION BUNDLE MUST KNOW WHERE ITS API IS.
 *
 * `VITE_API_URL` is inlined at build time. On Cloudflare Pages it comes from the
 * dashboard, where variables are scoped per environment — and it was set for
 * Production only. Every preview deployment therefore shipped with an empty base,
 * fell back to the relative `/api`, and asked the Pages CDN for a backend that is
 * not there:
 *
 *   GET https://f2a86c32.lcx-sales-automation-engine.pages.dev/api/health → 503
 *
 * The whole desk was unusable on any URL but one, and it reported itself as API
 * DOWN rather than as misconfigured. A build variable that can be forgotten in a
 * dashboard nobody looks at is not a safe place for the only copy of this value.
 *
 * Source-level because the failure is a build-time constant: by the time a test
 * could import the module, Vite has already inlined whatever it was given, and
 * the CI environment is not the environment that broke.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = readFileSync(resolve(HERE, '../apiClient.ts'), 'utf8');
const code = CLIENT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the API base is resolvable without any build variable', () => {
  it('falls back to an absolute origin in a production build', () => {
    expect(code).toContain('PROD_API_FALLBACK');
    const m = /const PROD_API_FALLBACK\s*=\s*'([^']+)'/.exec(code);
    expect(m, 'PROD_API_FALLBACK must be a single string literal').not.toBeNull();
    const url = new URL(m![1]!);
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/'); // an origin, not a path — API_BASE is concatenated
    expect(m![1]).not.toMatch(/\/$/); // no trailing slash, or paths double up
  });

  it('applies the fallback only when the variable is absent', () => {
    // An explicit VITE_API_URL must still win — that is how a build gets pointed
    // at staging, and how the desktop build targets the API directly.
    const idx = code.indexOf('const API_BASE');
    const decl = code.slice(idx, code.indexOf(';', code.indexOf('PROD_API_FALLBACK', idx)) + 1);
    expect(decl).toContain('VITE_API_URL');
    expect(decl).toMatch(/\?\?/); // nullish coalescing: only an unset var falls through
  });

  it('keeps DEV on the relative path so the Vite proxy still works', () => {
    // In dev an empty base means `/api/*`, which vite.config rewrites to
    // 127.0.0.1:8787. Handing dev the production origin would silently point every
    // local request at production — the opposite failure, and a far worse one.
    const idx = code.indexOf('const API_BASE');
    const decl = code.slice(idx, code.indexOf(';', code.indexOf('PROD_API_FALLBACK', idx)) + 1);
    expect(decl).toContain('import.meta.env.DEV');
    expect(decl).toMatch(/DEV\s*\?\s*''/);
  });

  it('never lets a production build end up with an empty base', () => {
    // The regression: `?? ''`. That is what produced the relative /api requests.
    const idx = code.indexOf('const API_BASE');
    const decl = code.slice(idx, code.indexOf(';', code.indexOf('PROD_API_FALLBACK', idx)) + 1);
    expect(decl).not.toMatch(/\?\?\s*''\s*;?\s*$/);
  });
});
