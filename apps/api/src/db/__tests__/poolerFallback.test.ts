import { describe, expect, it } from 'vitest';
import { poolerCandidates, isUnroutableDirectHost } from '../poolerFallback.js';

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
