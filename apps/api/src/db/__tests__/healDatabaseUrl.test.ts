import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE BOOT HEAL PATH HAD NO TEST, AND THAT IS WHY IT DISAGREED WITH THE ONE THAT DID.
 *
 * Two code paths derive a session-pooler URL from an unroutable direct host: `openReachablePool`
 * (used by the scheduled-jobs CLI, tested) and `healDatabaseUrl` (used by the API at boot,
 * untested until now). They were written from the same understanding and then drifted on the one
 * case that mattered.
 *
 * `openReachablePool` stops on `28P01` and says the password is wrong. `healDatabaseUrl` caught
 * every error identically, swept all 28 candidates, and ended on "no pooler form answered" —
 * which reads as a networking fault. So a WRONG PASSWORD reported itself as an UNREACHABLE HOST,
 * and a day went into replacing hosts: three dashboard pastes, two deploys, and a probe run that
 * proved the credential worked from a laptop while the service insisted the host was broken.
 *
 * The lesson is not "add a test for the fix". It is that the tested path was correct and the
 * untested path beside it was wrong about the same failure, so these tests assert the two AGREE.
 */

const DIRECT = 'postgresql://postgres:pa55word@db.fynzwqhxjguggkjvkwmj.supabase.co:5432/postgres';

/** A pg-shaped double whose `query` verdict is decided per connection string by the test. */
function mockPg(verdict: (cs: string) => { ok: true } | { ok: false; code: string }) {
  const attempts: string[] = [];
  class FakePool {
    #cs: string;
    constructor(opts: { connectionString: string }) { this.#cs = opts.connectionString; }
    async query(): Promise<unknown> {
      attempts.push(this.#cs);
      const v = verdict(this.#cs);
      if (v.ok) return { rows: [{ 1: 1 }] };
      const err = new Error(`refused: ${v.code}`) as Error & { code: string };
      err.code = v.code;
      throw err;
    }
    async end(): Promise<void> { /* nothing to release */ }
  }
  return { attempts, mod: { default: { Pool: FakePool }, Pool: FakePool } };
}

/** Fresh module graph per case: `healDatabaseUrl` keeps its verdict in module state. */
async function load(pgMock: unknown) {
  vi.resetModules();
  vi.doMock('pg', () => pgMock);
  vi.doMock('../../lib/env.js', () => ({
    env: { databaseUrl: DIRECT, supabasePoolerFallback: true, databaseCaCert: '' },
  }));
  vi.doMock('drizzle-orm/node-postgres', () => ({ drizzle: () => ({}) }));
  return import('../index.js');
}

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.doUnmock('pg'); vi.doUnmock('../../lib/env.js'); });

describe('a rejected credential is reported as a rejected credential', () => {
  it('stops at the FIRST 28P01 instead of sweeping every region', async () => {
    // Every pooler host answers and refuses the password — the real shape of the outage.
    const { attempts, mod } = mockPg((cs) => (cs.includes('pooler.supabase.com')
      ? { ok: false, code: '28P01' }
      : { ok: false, code: 'ENETUNREACH' }));
    const db = await load(mod);

    expect(await db.healDatabaseUrl()).toBe(false);
    expect(db.getDbHealFailure()).toBe('WRONG_PASSWORD');

    /* THE POINT OF THE FIX: one pooler attempt, not 28. Sweeping after 28P01 is not merely slow
       — it is what overwrote the accurate diagnosis with a misleading one. */
    const pooler = attempts.filter((a) => a.includes('pooler.supabase.com'));
    expect(pooler).toHaveLength(1);
  });

  it('agrees with openReachablePool, the path that was already right', async () => {
    const { openReachablePool } = await import('../poolerFallback.js');
    const make = (cs: string) => ({
      query: async () => {
        const err = new Error('refused') as Error & { code: string };
        err.code = cs.includes('pooler.supabase.com') ? '28P01' : 'ENETUNREACH';
        throw err;
      },
      end: async () => {},
    });
    /* Both paths must name the credential. Before this fix one said "wrong password" and the
       other said "no pooler form answered" for byte-identical inputs. */
    await expect(openReachablePool(DIRECT, make)).rejects.toThrow(/REJECTED THE CREDENTIAL/);
  });
});

describe('the failures stay distinguishable', () => {
  it('reports NO_POOLER_ANSWERED when nothing ever authenticates', async () => {
    const { mod } = mockPg(() => ({ ok: false, code: 'ETIMEDOUT' }));
    const db = await load(mod);
    expect(await db.healDatabaseUrl()).toBe(false);
    expect(db.getDbHealFailure()).toBe('NO_POOLER_ANSWERED');
  });

  it('records NO failure and adopts the first candidate when the region is right', async () => {
    const { attempts, mod } = mockPg((cs) => (cs.includes('aws-0-eu-central-1')
      ? { ok: true }
      : { ok: false, code: 'ENETUNREACH' }));
    const db = await load(mod);

    expect(await db.healDatabaseUrl()).toBe(true);
    expect(db.getDbHealFailure()).toBeNull();
    expect(db.getDbUrlSource()).toBe('pooler-fallback');

    /*
     * DETERMINISM, ASSERTED — because I told the owner in writing that a cold start "rolls the
     * dice again" and that this was "undiagnosed luck". It is neither. The candidate list puts
     * eu-central-1 first and `aws-0` before `aws-1`, so the working host is the FIRST one tried
     * and every boot heals identically. A claim about reliability made in a warning message is
     * a claim, and it should be pinned like any other.
     */
    const pooler = attempts.filter((a) => a.includes('pooler.supabase.com'));
    expect(pooler).toHaveLength(1);
    expect(pooler[0]).toContain('aws-0-eu-central-1.pooler.supabase.com');
    expect(pooler[0]).toContain('postgres.fynzwqhxjguggkjvkwmj:');
  });

  it('carries the password across untouched — the rewrite must never re-encode it', async () => {
    const encoded = 'postgresql://postgres:p%2Fss%23word@db.fynzwqhxjguggkjvkwmj.supabase.co:5432/postgres';
    const { attempts, mod } = mockPg((cs) => (cs.includes('pooler') ? { ok: true } : { ok: false, code: 'ENETUNREACH' }));
    vi.resetModules();
    vi.doMock('pg', () => mod);
    vi.doMock('../../lib/env.js', () => ({ env: { databaseUrl: encoded, supabasePoolerFallback: true, databaseCaCert: '' } }));
    vi.doMock('drizzle-orm/node-postgres', () => ({ drizzle: () => ({}) }));
    const db = await import('../index.js');
    expect(await db.healDatabaseUrl()).toBe(true);
    /* Double-escaping here turned `p%2Fss` into `p%252Fss` once, which the server then read as a
       wrong password — silent credential corruption wearing the costume of an auth failure. */
    expect(attempts.find((a) => a.includes('pooler'))).toContain(':p%2Fss%23word@');
  });
});

describe('it stays disabled when it is switched off', () => {
  it('does nothing at all with SUPABASE_POOLER_FALLBACK unset', async () => {
    const { attempts, mod } = mockPg(() => ({ ok: true }));
    vi.resetModules();
    vi.doMock('pg', () => mod);
    vi.doMock('../../lib/env.js', () => ({ env: { databaseUrl: DIRECT, supabasePoolerFallback: false, databaseCaCert: '' } }));
    vi.doMock('drizzle-orm/node-postgres', () => ({ drizzle: () => ({}) }));
    const db = await import('../index.js');
    expect(await db.healDatabaseUrl()).toBe(false);
    expect(attempts).toHaveLength(0);
    expect(db.getDbHealFailure()).toBeNull();
  });
});
