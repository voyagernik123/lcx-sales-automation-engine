/**
 * Invalidation. The property that matters: a forgotten mapping must fail SAFE
 * (over-invalidate) rather than leave an operator looking at a value the server
 * has already changed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { store, lookup, _resetReadCache } from '@/lib/readCache';
import {
  invalidateAfterAction,
  INVALIDATION_MAP,
  ALL_CACHEABLE_PREFIXES,
} from '@/lib/readInvalidate';
import { isCacheable } from '@/lib/readPolicy';

beforeEach(() => {
  _resetReadCache();
  localStorage.clear();
  localStorage.setItem('lcx_operator_email', 'nik@lcx.com');
});

/**
 * Representative real read paths. Invalidation prefixes are deliberately BROADER
 * than any single endpoint (`/v1/command` covers both `/deep` and `/overview`),
 * so the correct integrity property is not "the prefix is itself cacheable" but
 * "the prefix covers at least one cacheable read". That still catches a typo,
 * which would otherwise be a silent no-op — the worst kind of bug here, because
 * the operator would see stale data and nothing would look broken.
 */
const REAL_CACHEABLE_PATHS = [
  '/v1/command/deep',
  '/v1/command/overview',
  '/v1/distribution/deep',
  '/v1/distribution/listings',
  '/v1/projects',
  '/v1/decisions',
  '/v1/wbr',
  '/v1/kpis',
  '/v1/me/desk',
  '/v1/graph/explorations',
];

describe('invalidation map integrity', () => {
  it('the representative paths really are cacheable', () => {
    for (const p of REAL_CACHEABLE_PATHS) expect(isCacheable(p), p).toBe(true);
  });

  it('every mapped prefix covers at least one cacheable read — catches typos', () => {
    for (const m of INVALIDATION_MAP) {
      for (const prefix of m.dirties) {
        const covers = REAL_CACHEABLE_PATHS.some((real) => real.startsWith(prefix));
        expect(covers, `${m.action} → ${prefix} matches nothing`).toBe(true);
      }
    }
  });

  it('the fallback list covers every cacheable read, so unknown actions fail safe', () => {
    for (const real of REAL_CACHEABLE_PATHS) {
      const covered = ALL_CACHEABLE_PREFIXES.some((prefix) => real.startsWith(prefix));
      expect(covered, `${real} is not covered by the fallback`).toBe(true);
    }
  });

  it('never lists a governance-critical read as invalidatable', () => {
    // These are never cached at all, so mapping them would signal a
    // misunderstanding even though it would be harmless.
    const forbidden = ['/v1/access', '/v1/audit', '/v1/reviews', '/v1/distribution/campaigns'];
    for (const m of INVALIDATION_MAP) {
      for (const p of m.dirties) {
        expect(forbidden).not.toContain(p);
      }
    }
  });
});

describe('behaviour', () => {
  it('marks the affected read stale but keeps its body', async () => {
    store('/v1/command/overview', { data: { n: 1 } });
    expect(invalidateAfterAction('command_task_status')).toBeGreaterThan(0);

    const l = await lookup<{ data: { n: number } }>('/v1/command/overview');
    expect(l.usable).toBe(true); // no blank panel
    expect(l.stale).toBe(true); // but refreshed behind
    expect(l.entry!.body.data.n).toBe(1);
  });

  it('matches by prefix so a new sibling action inherits the mapping', async () => {
    store('/v1/command/overview', { data: 1 });
    // An action that does not exist yet, but shares the family prefix.
    expect(invalidateAfterAction('command_something_invented_later')).toBeGreaterThan(0);
    expect((await lookup('/v1/command/overview')).stale).toBe(true);
  });

  it('leaves unrelated surfaces fresh', async () => {
    store('/v1/projects', { data: 1 });
    store('/v1/command/overview', { data: 1 });
    invalidateAfterAction('command_task_status');
    expect((await lookup('/v1/projects')).stale).toBe(false);
  });

  it('an UNKNOWN action invalidates everything — fails safe, not silent', async () => {
    store('/v1/projects', { data: 1 });
    store('/v1/command/overview', { data: 1 });
    store('/v1/me/desk', { data: 1 });

    invalidateAfterAction('totally_unmapped_future_action');

    for (const p of ['/v1/projects', '/v1/command/overview', '/v1/me/desk']) {
      expect((await lookup(p)).stale, p).toBe(true);
    }
  });

  it('a grant does not leave an entitlement-shaped desk cached', async () => {
    store('/v1/me/desk', { data: { panels: 6 } });
    invalidateAfterAction('grant_entitlement');
    expect((await lookup('/v1/me/desk')).stale).toBe(true);
  });
});
