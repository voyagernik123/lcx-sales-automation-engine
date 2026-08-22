import { afterEach, describe, expect, it } from 'vitest';
import { rateBucketKey } from '../rateKey.js';

/**
 * THE FIX FOR THE G7 PEN-TEST FINDING, tested as the ATTACK rather than as the code.
 *
 * The defect: two public buckets keyed on the leftmost `X-Forwarded-For` entry, which
 * the caller writes. The property that has to hold now is not "the function returns a
 * string" — it is "rotating every header a caller controls does not change the key".
 * That is what the first test asserts, and it is the test that would have failed
 * before the fix.
 */

const ctx = (headers: Record<string, string>, peer: string | null = '10.0.0.9') => ({
  env: peer === null ? {} : { incoming: { socket: { remoteAddress: peer } } },
  req: { header: (name: string) => headers[name.toLowerCase()] },
});

const ORIGINAL = process.env.TRUSTED_PROXY_HOPS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = ORIGINAL;
});

describe('the attack the old key lost to', () => {
  it('gives ONE key however the caller rotates the headers it controls', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    // One real proxy hop: the trusted proxy appended the true client address LAST.
    // The attacker prepends whatever it likes, and forges CF-Connecting-IP too.
    const keys = new Set(
      ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'].map((forged) =>
        rateBucketKey(ctx({
          'x-forwarded-for': `${forged}, 203.0.113.50`,
          'cf-connecting-ip': forged,
        })),
      ),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('xff:203.0.113.50');
  });

  it('never reads cf-connecting-ip — this API is not served through Cloudflare', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    const withHeader = rateBucketKey(ctx({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '203.0.113.50' }));
    const without = rateBucketKey(ctx({ 'x-forwarded-for': '203.0.113.50' }));
    expect(withHeader).toBe(without);
    expect(withHeader).not.toContain('9.9.9.9');
  });
});

describe('the trusted-proxy rule, same as auth.ts', () => {
  it('reads the entry the OUTERMOST trusted proxy observed, at any declared depth', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(rateBucketKey(ctx({ 'x-forwarded-for': 'forged, 203.0.113.50, 10.1.1.1' })))
      .toBe('xff:203.0.113.50');
  });

  it('refuses a header too short to have traversed the declared chain, falling back to the peer', () => {
    process.env.TRUSTED_PROXY_HOPS = '3';
    expect(rateBucketKey(ctx({ 'x-forwarded-for': '203.0.113.50' }))).toBe('peer:10.0.0.9');
  });

  it('does not read the header AT ALL when no proxy is declared', () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(rateBucketKey(ctx({ 'x-forwarded-for': '203.0.113.50' }))).toBe('peer:10.0.0.9');
  });
});

describe('the fallback is fail-closed', () => {
  it('shares one bucket when nothing can be attributed — refusing too much, never nothing', () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(rateBucketKey(ctx({}, null))).toBe('unattributable');
    expect(rateBucketKey(ctx({ 'x-forwarded-for': '1.2.3.4' }, null))).toBe('unattributable');
  });

  it('ignores blank and whitespace-only header entries rather than keying on empty', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    expect(rateBucketKey(ctx({ 'x-forwarded-for': '  ,  , 203.0.113.50' }))).toBe('xff:203.0.113.50');
    expect(rateBucketKey(ctx({ 'x-forwarded-for': '   ' }))).toBe('peer:10.0.0.9');
  });
});
