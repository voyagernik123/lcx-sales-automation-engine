import { describe, expect, it } from 'vitest';
import { poolerCandidates, isUnroutableDirectHost, openReachablePool } from '../poolerFallback.js';

/**
 * THE HOST THAT CANNOT WORK, AND THE ONE THAT CAN.
 *
 * `db.<ref>.supabase.co` publishes an AAAA record and NO A record. From Render's IPv4-only
 * free tier it is not slow or flaky — it is unroutable, permanently, for every request. There
 * is no state of the world in which it works from that process.
 *
 * Six exchanges over a day were spent on that string, every one a correct diagnosis of the
 * wrong input, because Supabase's Connect panel DEFAULTS to the Direct connection tab — so the
 * unusable string is the one an operator naturally copies, and the resulting failure is
 * indistinguishable from a save that never happened. Rewriting cannot make anything worse; it
 * turns a certain failure into a possible success.
 *
 * What must NEVER happen is rewriting anything else, or touching the credential.
 */

const DIRECT = 'postgresql://postgres:pa55word@db.fynzwqhxjguggkjvkwmj.supabase.co:5432/postgres';

describe('it fires on exactly one host and nothing else', () => {
  it('recognises the Supabase direct host', () => {
    expect(isUnroutableDirectHost(DIRECT)).toBe(true);
    expect(poolerCandidates(DIRECT).length).toBeGreaterThan(0);
  });

  it.each([
    ['a pooler URL — must never be rewritten twice', 'postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'],
    ['a local database', 'postgres://postgres:postgres@localhost:5432/lcx_sales'],
    ['a docker service name', 'postgres://u:p@postgres:5432/db'],
    ['another provider entirely', 'postgres://u:p@my-db.example.com:5432/app'],
    ['an unset URL', ''],
    ['an unparseable string', 'not a url'],
  ])('leaves %s completely alone', (_label, url) => {
    expect(isUnroutableDirectHost(url)).toBe(false);
    expect(poolerCandidates(url)).toEqual([]);
  });
});

describe('the rewrite is mechanical, and it carries the credential untouched', () => {
  it('moves the project ref into the USERNAME — the trap that reads as a wrong password', () => {
    // Changing only the host makes the pooler answer 28P01, which is indistinguishable from a
    // bad credential. Both halves of the transformation or neither.
    const first = poolerCandidates(DIRECT)[0]!;
    const u = new URL(first.url);
    expect(u.username).toBe('postgres.fynzwqhxjguggkjvkwmj');
    expect(u.hostname).toMatch(/\.pooler\.supabase\.com$/);
  });

  it('uses port 5432 — session mode, because this process holds a persistent pool', () => {
    // 6543 is transaction mode: no session state, no prepared statements.
    for (const c of poolerCandidates(DIRECT).slice(0, 6)) {
      expect(new URL(c.url).port).toBe('5432');
    }
  });

  it('carries the password byte-for-byte', () => {
    expect(new URL(poolerCandidates(DIRECT)[0]!.url).password).toBe('pa55word');
  });

  it('RE-ENCODES a password that needs it, rather than corrupting it', () => {
    /* The URL parser hands back a DECODED password. Writing it straight into a new URL would
       silently mangle any password containing a character that needed escaping — the exact
       class of bug that made this episode take a day. */
    const raw = 'postgresql://postgres:p%2Fss%23x@db.abcd.supabase.co:5432/postgres';
    const out = new URL(poolerCandidates(raw)[0]!.url);
    expect(out.password).toBe('p%2Fss%23x');
    // And it survives a round trip back to the real value.
    expect(decodeURIComponent(out.password)).toBe('p/ss#x');
  });

  it('preserves the database name and any query parameters', () => {
    const raw = 'postgresql://postgres:pw@db.abcd.supabase.co:5432/mydb?application_name=lcx';
    const u = new URL(poolerCandidates(raw)[0]!.url);
    expect(u.pathname).toBe('/mydb');
    expect(u.searchParams.get('application_name')).toBe('lcx');
  });

  it('defaults a missing database name to /postgres rather than emitting an invalid URL', () => {
    expect(new URL(poolerCandidates('postgresql://postgres:pw@db.abcd.supabase.co:5432')[0]!.url).pathname)
      .toBe('/postgres');
  });
});

describe('the candidate ORDER matters, because the first hit ends the probe', () => {
  it('tries eu-central-1 / aws-0 first — the combination verified against this project', () => {
    expect(poolerCandidates(DIRECT)[0]!.label).toContain('aws-0-eu-central-1');
  });

  it('covers both cluster prefixes per region, since the ref does not encode which', () => {
    const first = poolerCandidates(DIRECT).slice(0, 2).map((c) => c.label);
    expect(first[0]).toContain('aws-0-eu-central-1');
    expect(first[1]).toContain('aws-1-eu-central-1');
  });

  it('is bounded — a boot-time sweep must not be unbounded', () => {
    expect(poolerCandidates(DIRECT).length).toBeLessThanOrEqual(32);
  });

  it('accepts an override list, because a hardcoded region set is a guess about the future', () => {
    const c = poolerCandidates(DIRECT, ['ap-south-1']);
    expect(c).toHaveLength(2);
    expect(c[0]!.label).toContain('ap-south-1');
  });
});

describe('labels are safe to log — they end up in production logs', () => {
  it('carry the host and the username FORM, never the credential', () => {
    for (const c of poolerCandidates(DIRECT)) {
      expect(c.label).not.toContain('pa55word');
      // The ref is a form placeholder in the label, not the literal value.
      expect(c.label).toContain('user=postgres.<ref>');
    }
  });
});

/*
 * THE PROBE LOOP ITSELF, which is the part that was missing from the scheduled-jobs lane and failed every cron
 * tick for a day. `openReachablePool` takes the pool FACTORY as an argument for exactly this reason: the
 * decisions it makes — when to sweep, when to stop, what to say — are all testable with no database anywhere.
 */
type FakePool = { query(sql: string): Promise<unknown>; end(): Promise<void> };

/** A factory whose behaviour per-URL is declared up front. `null` means the connection succeeds. */
function fakePools(outcomes: Record<string, { code: string } | null>, log: string[]) {
  const ended: string[] = [];
  const tried: string[] = [];
  const make = (connectionString: string): FakePool => ({
    query: async () => {
      tried.push(connectionString);
      const outcome = outcomes[connectionString];
      if (outcome === undefined) throw Object.assign(new Error('ENETUNREACH'), { code: 'ENETUNREACH' });
      if (outcome !== null) throw Object.assign(new Error(outcome.code), { code: outcome.code });
      return { rows: [] };
    },
    end: async () => { ended.push(connectionString); },
  });
  return { make, ended, tried, log };
}

const DIRECT_IPV6 = 'postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres';

describe('the given URL is tried first, and a working one ends it there', () => {
  it('adopts the environment URL without probing anything else', async () => {
    const f = fakePools({ [DIRECT_IPV6]: null }, []);
    const got = await openReachablePool(DIRECT_IPV6, f.make, (m) => f.log.push(m));
    expect(got.source).toBe('env');
    expect(got.url).toBe(DIRECT_IPV6);
    /* Exactly one connection attempt. A sweep that runs even when the given URL works would multiply every
       job's startup by the number of regions, and would do it invisibly. */
    expect(f.tried).toEqual([DIRECT_IPV6]);
    expect(f.log).toEqual([]);
  });
});

describe('only the unroutable direct host earns a sweep', () => {
  it('rethrows a failure on a host that is NOT the known-unroutable one', async () => {
    const url = 'postgresql://lcx:pw@localhost:5432/lcx_sales';
    const f = fakePools({ [url]: { code: '28P01' } }, []);
    /* A wrong password on localhost must surface as a wrong password. Sweeping pooler regions here would bury
       the real cause under five rejections that all look the same. */
    await expect(openReachablePool(url, f.make, (m) => f.log.push(m))).rejects.toThrow('28P01');
    expect(f.tried).toEqual([url]);
  });

  it('closes the pool it opened before giving up, on both paths', async () => {
    const url = 'postgresql://lcx:pw@localhost:5432/lcx_sales';
    const f = fakePools({ [url]: { code: 'ECONNREFUSED' } }, []);
    await expect(openReachablePool(url, f.make, () => {})).rejects.toThrow();
    /* A leaked pool in a CLI keeps the process alive past its work — the job then looks hung rather than failed. */
    expect(f.ended).toEqual([url]);
  });
});

describe('the sweep heals the IPv6-only direct host, which is the whole point', () => {
  it('adopts the first pooler candidate that answers and says which one', async () => {
    const candidates = poolerCandidates(DIRECT_IPV6);
    expect(candidates.length).toBeGreaterThan(1);
    const second = candidates[1]!;
    const f = fakePools({ [second.url]: null }, []);
    const got = await openReachablePool(DIRECT_IPV6, f.make, (m) => f.log.push(m));
    expect(got.source).toBe('pooler-fallback');
    expect(got.url).toBe(second.url);
    /* It tried the env URL, then candidate 0, then candidate 1 — in order, stopping at the first success. */
    expect(f.tried).toEqual([DIRECT_IPV6, candidates[0]!.url, second.url]);
    /* And it SAID so. The cron failure was invisible for a day because the log printed the requested URL; a
       healed connection that does not name itself is the same defect wearing a success message. */
    expect(f.log.join(' ')).toContain('no IPv4 address');
    expect(f.log.join(' ')).toContain(second.label);
  });

  it('stops on a rejected credential instead of asking every region the same question', async () => {
    const candidates = poolerCandidates(DIRECT_IPV6);
    const f = fakePools({ [candidates[0]!.url]: { code: '28P01' } }, []);
    /* 28P01 means the host was RIGHT and the password was wrong. No other region can fix that, and sweeping on
       would report "could not reach the database" for what is actually a one-line secret fix. */
    await expect(openReachablePool(DIRECT_IPV6, f.make, () => {})).rejects.toThrow(/REJECTED THE CREDENTIAL/);
    expect(f.tried).toEqual([DIRECT_IPV6, candidates[0]!.url]);
  });

  it('names every candidate it tried when none of them answer', async () => {
    const f = fakePools({}, []);
    await expect(openReachablePool(DIRECT_IPV6, f.make, () => {})).rejects.toThrow(/IPv6-only and every pooler candidate failed/);
    /* Every opened pool closed, including all the failures — the CLI must be able to exit. */
    expect(f.ended.length).toBe(poolerCandidates(DIRECT_IPV6).length + 1);
  });
});
