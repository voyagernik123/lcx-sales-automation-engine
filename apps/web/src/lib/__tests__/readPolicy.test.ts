/**
 * The read policy is the one module in the speed floor that must never be wrong,
 * because the failure mode is not a slow page — it is an operator making a
 * governance decision from a value the server never evaluated.
 *
 * The load-bearing property is that the never-list CANNOT BE SHADOWED. These
 * tests assert it structurally rather than by spot-checking a few paths, so a
 * future refactor of the matching cannot quietly break it.
 */

import { describe, it, expect } from 'vitest';
import { policyFor, isCacheable, NEVER_CACHE } from '@/lib/readPolicy';

describe('deny by default', () => {
  it('refuses an endpoint nobody has classified', () => {
    expect(policyFor('/v1/something-invented-tomorrow').mode).toBe('never');
    expect(isCacheable('/v1/something-invented-tomorrow')).toBe(false);
  });

  it('refuses the root and nonsense input rather than falling through', () => {
    for (const p of ['', '/', '/v1', '/v1/', 'not-a-path', '//', '/v1//projects']) {
      expect(policyFor(p).mode).toBe('never');
    }
  });

  it('always states a reason, including for denials', () => {
    expect(policyFor('/v1/unknown').reason.length).toBeGreaterThan(10);
    expect(policyFor('/v1/projects').reason.length).toBeGreaterThan(10);
  });
});

describe('the never-list is unshadowable', () => {
  it('every declared never-prefix is never cacheable', () => {
    for (const { prefix } of NEVER_CACHE) {
      expect(policyFor(prefix).mode, prefix).toBe('never');
    }
  });

  it('and neither is anything beneath it, at any depth', () => {
    for (const { prefix } of NEVER_CACHE) {
      for (const suffix of ['/x', '/x/y', '/x/y/z', '/1234', '/me']) {
        expect(policyFor(`${prefix}${suffix}`).mode, `${prefix}${suffix}`).toBe('never');
      }
    }
  });

  it('and not with a query string attached', () => {
    for (const { prefix } of NEVER_CACHE) {
      expect(policyFor(`${prefix}?page=2`).mode, prefix).toBe('never');
      expect(policyFor(`${prefix}/x?q=hello`).mode, prefix).toBe('never');
    }
  });

  it('carries a concrete justification for every entry, not a category label', () => {
    for (const entry of NEVER_CACHE) {
      // Concise at runtime — the full reasoning lives in comments beside each
      // entry, because 8.4KB of justification prose was measured shipping to
      // every browser in the initial bundle, which had 9KB of headroom left.
      expect(entry.reason.length, entry.prefix).toBeGreaterThan(30);
      expect(entry.reason, entry.prefix).toMatch(/[a-z]/);
    }
  });

  it('never returns a positive freshness window for a denied path', () => {
    for (const { prefix } of NEVER_CACHE) {
      expect(policyFor(prefix).freshMs).toBe(0);
    }
  });
});

describe('the governance-critical denials, named individually', () => {
  // Spelled out one by one so that deleting an entry from NEVER_CACHE fails a
  // test that says what breaks, rather than only shrinking a loop.
  const cases: Array<[string, string]> = [
    ['/v1/access/me', 'entitlements'],
    ['/v1/access/matrix', 'blind upsert can silently downgrade a capability'],
    ['/v1/access/requests', 'same URL returns different bodies per role'],
    ['/v1/access/members/nik', 'purpose checkpoint writes the audit row in middleware'],
    ['/v1/audit', 'a stale audit view looks like a tampered one'],
    ['/v1/reviews', 'SAT gate inputs, gate fails open'],
    ['/v1/distribution/campaigns', 'budget_lcx is a compliance gate input'],
    ['/v1/x402/catalog', 'stale payTo address'],
    ['/v1/intel/slo', 'process-local ring that resets on deploy'],
    ['/v1/notifications', 'mark-read is a global mutation'],
    ['/v1/dealdesk/queue', 'idempotent approve reads as success while nothing happened'],
  ];

  for (const [path, why] of cases) {
    it(`never caches ${path} — ${why}`, () => {
      expect(policyFor(path).mode).toBe('never');
    });
  }
});

describe('carve-outs inside allowed prefixes', () => {
  it('caches the projects list but NEVER a project gate verdict', () => {
    expect(policyFor('/v1/projects').mode).toBe('swr');
    expect(policyFor('/v1/projects/abc-123').mode).toBe('swr');

    // The dangerous one: a cached `pass: true` on a since-suppressed project
    // would invite outreach to a suppressed target.
    expect(policyFor('/v1/projects/abc-123/gate').mode).toBe('never');
    expect(policyFor('/v1/projects/9/gate').mode).toBe('never');
  });
});

describe('opt-ins', () => {
  it('allows the two heavy deep reads with a revalidation window', () => {
    for (const p of ['/v1/command/deep', '/v1/distribution/deep']) {
      const pol = policyFor(p);
      expect(pol.mode).toBe('swr');
      expect(pol.freshMs).toBeGreaterThan(0);
    }
  });

  it('allows the landing surface, which dominates perceived speed', () => {
    expect(policyFor('/v1/me/desk').mode).toBe('swr');
  });

  it('does not accidentally allow /v1/me itself via the /v1/me/desk entry', () => {
    // /v1/me carries the entitlement map, so it must not ride in on a prefix.
    expect(policyFor('/v1/me').mode).toBe('never');
  });

  it('is order-independent: the most specific prefix wins', () => {
    // /v1/distribution/listings is allowed while /v1/distribution/campaigns is
    // denied, and both sit under the same parent — so a naive first-match table
    // would be sensitive to declaration order. This asserts it is not.
    expect(policyFor('/v1/distribution/listings').mode).toBe('swr');
    expect(policyFor('/v1/distribution/campaigns').mode).toBe('never');
  });
});

describe('high-cardinality keys stay out of durable storage', () => {
  it('marks search-bearing keys memory-only', () => {
    const pol = policyFor('/v1/projects?q=falcon');
    expect(pol.mode).toBe('swr');
    expect(pol.memoryOnly).toBe(true);
  });

  it('leaves ordinary paginated keys persistable', () => {
    const pol = policyFor('/v1/projects?page=2&limit=50');
    expect(pol.memoryOnly).toBeFalsy();
  });

  it('recognises every search parameter spelling used in this app', () => {
    for (const q of ['q=x', 'search=x', 'term=x', 'query=x']) {
      expect(policyFor(`/v1/projects?${q}`).memoryOnly, q).toBe(true);
    }
  });

  it('does not mistake a param that merely contains "q" for a search', () => {
    expect(policyFor('/v1/projects?quarter=Q3').memoryOnly).toBeFalsy();
  });
});
