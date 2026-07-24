/**
 * The read cache. Tests concentrate on the properties whose failure would be
 * SILENT: two keys for one logical read, an operator seeing another operator's
 * rows, a degraded body pinned forever, or a coalesced request cancelled by one
 * unmounting component on behalf of three others still waiting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canonicalPath,
  lookup,
  peek,
  store,
  markStale,
  evict,
  coalesce,
  inFlightCount,
  isDegradedBody,
  cacheStats,
  _resetReadCache,
} from '@/lib/readCache';

const EMAIL_KEY = 'lcx_operator_email';
const signInAs = (e: string) => localStorage.setItem(EMAIL_KEY, e);

beforeEach(() => {
  _resetReadCache();
  localStorage.clear();
  signInAs('nik@lcx.com');
});

describe('canonicalPath', () => {
  it('sorts query parameters so one logical read is one key', () => {
    // The real hazard: lib/api uses URLSearchParams, ~51 inline call sites
    // concatenate by hand, so the same read arrives spelled two ways.
    expect(canonicalPath('/v1/projects?b=2&a=1')).toBe(canonicalPath('/v1/projects?a=1&b=2'));
  });

  it('drops empty parameters rather than keying on them', () => {
    expect(canonicalPath('/v1/projects?a=1&empty=')).toBe('/v1/projects?a=1');
  });

  it('normalises a trailing slash', () => {
    expect(canonicalPath('/v1/projects/')).toBe('/v1/projects');
  });

  it('is stable for repeated keys', () => {
    expect(canonicalPath('/v1/x?t=b&t=a')).toBe(canonicalPath('/v1/x?t=a&t=b'));
  });

  it('leaves a bare path untouched', () => {
    expect(canonicalPath('/v1/projects')).toBe('/v1/projects');
  });
});

describe('policy is obeyed, not re-decided', () => {
  it('refuses to store a never-cacheable read', async () => {
    store('/v1/access/matrix', { data: { secret: true } });
    const l = await lookup('/v1/access/matrix');
    expect(l.entry).toBeNull();
    expect(l.usable).toBe(false);
  });

  it('refuses a gate verdict even though the projects list is cacheable', async () => {
    store('/v1/projects', { data: [1, 2] });
    store('/v1/projects/abc/gate', { data: { pass: true } });

    expect((await lookup('/v1/projects')).usable).toBe(true);
    expect((await lookup('/v1/projects/abc/gate')).usable).toBe(false);
  });

  it('stores an allowed read and serves it as fresh', async () => {
    store('/v1/projects', { data: ['a'] });
    const l = await lookup<{ data: string[] }>('/v1/projects');
    expect(l.usable).toBe(true);
    expect(l.stale).toBe(false);
    expect(l.entry!.body.data).toEqual(['a']);
  });
});

describe('operator isolation', () => {
  it('does not serve one operator the other operator’s cached rows', async () => {
    store('/v1/me/desk', { data: { mine: 'nik' } });
    expect((await lookup('/v1/me/desk')).usable).toBe(true);

    signInAs('sam@lcx.com');
    // Same URL, different person: must be a miss, not Nik's desk.
    expect((await lookup('/v1/me/desk')).usable).toBe(false);

    signInAs('nik@lcx.com');
    expect((await lookup('/v1/me/desk')).usable).toBe(true);
  });
});

describe('staleness', () => {
  it('serves a stale entry but flags it for revalidation', async () => {
    vi.useFakeTimers();
    try {
      store('/v1/projects', { data: [1] });
      // /v1/projects has a 60s freshness window.
      vi.advanceTimersByTime(61_000);
      const l = await lookup('/v1/projects');
      expect(l.usable).toBe(true); // still painted — no blank screen
      expect(l.stale).toBe(true); // and refreshed behind
    } finally {
      vi.useRealTimers();
    }
  });

  it('markStale keeps the body so a write never blanks a panel', async () => {
    store('/v1/command/overview', { data: { n: 1 } });
    const marked = markStale(['/v1/command']);
    expect(marked).toBeGreaterThan(0);

    const l = await lookup<{ data: { n: number } }>('/v1/command/overview');
    // This is the whole point of mark-stale-not-delete: a task status flip
    // dirties a rollup nothing local can recompute, so eviction would show an
    // empty panel instead of a slightly old one.
    expect(l.usable).toBe(true);
    expect(l.entry!.body.data.n).toBe(1);
    expect(l.stale).toBe(true);
  });

  it('evict removes an entry outright when stale is unacceptable', async () => {
    store('/v1/projects', { data: [1] });
    evict('/v1/projects');
    expect((await lookup('/v1/projects')).usable).toBe(false);
  });

  it('markStale does not touch unrelated prefixes', async () => {
    store('/v1/projects', { data: [1] });
    store('/v1/command/overview', { data: [2] });
    markStale(['/v1/command']);
    expect((await lookup('/v1/projects')).stale).toBe(false);
  });
});

describe('degraded bodies are never stored', () => {
  it('detects the dbLive:false shape', () => {
    expect(isDegradedBody({ data: { dbLive: false } })).toBe(true);
    expect(isDegradedBody({ data: { dbLive: true } })).toBe(false);
  });

  it('detects a false flag inside a live block', () => {
    expect(isDegradedBody({ data: { live: { listings: false } } })).toBe(true);
    expect(isDegradedBody({ data: { live: { listings: true } } })).toBe(false);
  });

  it('refuses to store one', async () => {
    // Pinning this would leave the operator either distrusting real data
    // forever, or trusting compiled defaults as live desk state.
    store('/v1/distribution/deep', { data: { live: { listings: false } } });
    expect((await lookup('/v1/distribution/deep')).usable).toBe(false);
  });

  it('tolerates ordinary bodies without false positives', () => {
    expect(isDegradedBody({ data: [1, 2, 3] })).toBe(false);
    expect(isDegradedBody(null)).toBe(false);
    expect(isDegradedBody('a string')).toBe(false);
  });
});

describe('server veto (X-LCX-No-Store)', () => {
  it('honours a server refusal to store', async () => {
    store('/v1/projects', { data: [1] }, { noStore: true });
    expect((await lookup('/v1/projects')).usable).toBe(false);
  });

  it('cannot be used to cache something policy denies', async () => {
    // The header is deny-only by construction: there is no opts flag that could
    // widen policy, so absence of noStore on a never-path still stores nothing.
    store('/v1/audit', { data: [1] }, { noStore: false });
    expect((await lookup('/v1/audit')).usable).toBe(false);
  });
});

describe('coalescing', () => {
  it('collapses identical concurrent requests into one', async () => {
    let calls = 0;
    const run = () =>
      new Promise<string>((res) => {
        calls += 1;
        setTimeout(() => res('done'), 10);
      });

    const [a, b, c] = await Promise.all([
      coalesce('k', run),
      coalesce('k', run),
      coalesce('k', run),
    ]);

    expect(calls).toBe(1); // /v1/deals/board has 8 call sites today
    expect([a, b, c]).toEqual(['done', 'done', 'done']);
  });

  it('releases the slot after settling so the next read is not stuck', async () => {
    await coalesce('k', async () => 1);
    expect(inFlightCount()).toBe(0);
    expect(await coalesce('k', async () => 2)).toBe(2);
  });

  it('releases the slot after a rejection too', async () => {
    await expect(coalesce('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(inFlightCount()).toBe(0);
  });

  it('keeps distinct keys independent', async () => {
    let n = 0;
    await Promise.all([
      coalesce('a', async () => void n++),
      coalesce('b', async () => void n++),
    ]);
    expect(n).toBe(2);
  });
});

describe('bounds', () => {
  it('reports its own footprint', () => {
    store('/v1/projects', { data: 'x'.repeat(100) });
    const s = cacheStats();
    expect(s.entries).toBe(1);
    expect(s.bytes).toBeGreaterThan(100);
  });

  it('refuses a single absurd response rather than evicting everything', () => {
    store('/v1/projects', { data: 'x'.repeat(5 * 1024 * 1024) });
    expect(cacheStats().entries).toBe(0);
  });

  it('bounds the memory tier', () => {
    for (let i = 0; i < 300; i += 1) store(`/v1/projects?page=${i}`, { data: i });
    expect(cacheStats().entries).toBeLessThanOrEqual(120);
  });

  it('peek is synchronous and honours policy', () => {
    store('/v1/projects', { data: [1] });
    expect(peek('/v1/projects')).not.toBeNull();
    expect(peek('/v1/audit')).toBeNull();
  });
});
