import { describe, expect, it } from 'vitest';
import { describeConnectionTarget, connectionTargetBootLine } from '../connectionTarget.js';
import { sanitiseDbError } from '../index.js';

/**
 * THE OUTAGE OF 2026-08-10, PINNED.
 *
 * `/health` reported this, unchanged, across three hours and three separate attempts to
 * fix it:
 *
 *   {"db":"down","dbError":{"code":"ENETUNREACH",
 *    "message":"connect ENETUNREACH 2a05:d014:1e9b:b301:9751:5cd5:770f:9c5:5432"}}
 *
 * Two defects, both pinned below. The first is that the message named the SYMPTOM and
 * never the fix, so the operator edited the connection string three times without the
 * information needed to edit it correctly. The second is that this unauthenticated
 * endpoint was publishing the database's IPv6 address to anyone who asked, because the
 * sanitiser only knew about dotted quads.
 */

// The real production shapes, with the project ref replaced by a same-shape stand-in.
const DIRECT = 'postgresql://postgres:sEcReT@db.aaaabbbbccccdddd.supabase.co:5432/postgres';
const POOLER = 'postgresql://postgres.aaaabbbbccccdddd:sEcReT@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

describe('the defect that caused the outage', () => {
  it("names Supabase's direct host as IPv6-only, and blocks", () => {
    const v = describeConnectionTarget(DIRECT);
    expect(v.code).toBe('SUPABASE_DIRECT_HOST_IS_IPV6_ONLY');
    expect(v.severity).toBe('blocking');
  });

  it('and its fix tells the operator BOTH edits, not just the hostname', () => {
    /*
     * The hostname alone is half an answer and the half that is missing looks exactly like
     * a wrong password. Anyone who swaps only the host gets 28P01 and starts resetting
     * credentials. The fix text has to carry the username change or it sends the reader
     * down that path.
     */
    const { fix } = describeConnectionTarget(DIRECT);
    expect(fix).toContain('pooler.supabase.com');
    expect(fix).toContain('project-ref');
  });

  it('accepts the pooler string that actually works', () => {
    expect(describeConnectionTarget(POOLER).code).toBe('NO_DEFECT_FOUND');
    expect(describeConnectionTarget(POOLER).severity).toBe('none');
  });

  it('catches the trap: pooler host, but the username was left as plain postgres', () => {
    // The pooler cannot tell which project to route to and answers 28P01 — indistinguishable
    // from a wrong password unless something says so out loud.
    const half = POOLER.replace('postgres.aaaabbbbccccdddd', 'postgres');
    const v = describeConnectionTarget(half);
    expect(v.code).toBe('POOLER_USER_MISSING_PROJECT_REF');
    expect(v.severity).toBe('blocking');
    expect(v.fix).toContain('28P01');
  });

  it('warns — but does not block — on the transaction pooler, because it CONNECTS', () => {
    /* Blocking would be wrong and silence would be worse: it connects, then fails later on
       prepared statements under a persistent pool, by which time nobody is looking here. */
    const v = describeConnectionTarget(POOLER.replace(':5432/', ':6543/'));
    expect(v.code).toBe('POOLER_IN_TRANSACTION_MODE');
    expect(v.severity).toBe('warning');
  });

  it('rejects a literal IPv6 host whoever it belongs to', () => {
    const v = describeConnectionTarget('postgres://postgres:pw@[2a05:d014::1]:5432/postgres');
    expect(v.code).toBe('HOST_IS_IPV6_LITERAL');
  });
});

describe('password characters — and the advice I first gave was wrong', () => {
  /*
   * MEASURED, NOT ASSUMED, and the measurement contradicted advice already given out loud:
   * "percent-encode @ : / ? # [ ] % or you get 28P01". Wrong three times over. Most of those
   * characters need no encoding. The ones that do break the parse rather than the auth, so
   * the error is "Invalid URL" with no driver code. And `%` is not simply hostile — it
   * depends entirely on what follows it.
   */
  it.each(['#', '/', '?'])('flags %s, which the driver rejects before it dials', (ch) => {
    const v = describeConnectionTarget(POOLER.replace('sEcReT', `aa${ch}bb`));
    expect(v.code).toBe('PASSWORD_NEEDS_PERCENT_ENCODING');
    expect(v.severity).toBe('blocking');
  });

  it('names the character AND its encoding, because "special character" is not actionable', () => {
    const { fix } = describeConnectionTarget(POOLER.replace('sEcReT', 'aa/bb'));
    expect(fix).toContain('/');
    expect(fix).toContain('%2F');
  });

  it('flags %bb — a syntactically valid escape that decodes to invalid UTF-8', () => {
    // The subtle one. `%bb` looks like a correct escape and is two hex digits, so every
    // "is it percent-encoded properly" check passes it. It is a lone UTF-8 continuation
    // byte, so decoding throws.
    expect(describeConnectionTarget(POOLER.replace('sEcReT', 'aa%bb')).code)
      .toBe('PASSWORD_NEEDS_PERCENT_ENCODING');
  });

  it.each([
    ['p%40ss', 'a correctly encoded @'],
    ['100%pw', 'a % that begins no escape at all'],
    ['aa%zz', 'a % followed by non-hex'],
    ['%zz%bb', 'a malformed escape that makes pg treat the whole string literally'],
    ['aa%c3%a9bb', 'a valid multi-byte sequence'],
  ])('does NOT flag %s (%s)', (pw) => {
    /*
     * FALSE POSITIVES ARE THE WORSE FAILURE HERE. Telling an operator to re-encode an
     * already-correct password sends them to break a working string. Two hand-written
     * approximations of pg's rule both failed on this row, which is why the module asks
     * the real parser instead.
     */
    expect(describeConnectionTarget(POOLER.replace('sEcReT', pw)).code).toBe('NO_DEFECT_FOUND');
  });

  it.each(['@', ':', '[', ']', '&', '+', ' ', '!', '*'])(
    'does NOT flag %s — pg handles it raw',
    (ch) => {
      expect(describeConnectionTarget(POOLER.replace('sEcReT', `aa${ch}bb`)).code)
        .toBe('NO_DEFECT_FOUND');
    },
  );

  it('splits on the LAST @, so an unencoded @ does not move half the password into the user', () => {
    // Splitting on the first @ would read the username as `postgres.aaaabbbbccccdddd` and
    // the host as `ss@aws-0-...`, producing a confident and completely wrong verdict.
    expect(describeConnectionTarget(POOLER.replace('sEcReT', 'p@ss')).code).toBe('NO_DEFECT_FOUND');
  });

  /**
   * THE RATCHET. The module asks `pg-connection-string` directly, so today this asserts
   * agreement with something it already agrees with by construction — that is the point.
   * It exists for the change where somebody decides the dependency is unnecessary and
   * substitutes a regex, which is exactly what was tried twice and failed twice. This test
   * fails the moment the verdict and the real parser part company.
   */
  it('the verdict agrees with pg itself on every password in this table', async () => {
    let parse: (s: string) => unknown;
    try {
      ({ parse } = await import('pg-connection-string'));
    } catch {
      // REFUSE rather than silently pass. A skipped ratchet that reports success is worse
      // than no ratchet at all.
      expect.unreachable('pg-connection-string must be resolvable for this ratchet to mean anything');
      return;
    }

    const passwords = [
      'plain', 'p@ss', 'aa:bb', 'aa[bb', 'aa]bb', 'aa&bb', 'aa+bb', 'aa bb', 'aa!bb', 'aa*bb',
      'aa#bb', 'aa/bb', 'aa?bb',
      'p%40ss', 'aa%41bb', 'aa%c3%a9bb', '%20%20', '%f0%9f%92%a9',
      'aa%bb', 'aa%ffbb', 'aa%80bb', '%c0%af', 'p%99ss%zz',
      '100%pw', 'aa%zz', 'aa%2Gbb', '50%', '%', '%%', 'x%2', '%zz%bb',
    ];

    for (const pw of passwords) {
      const url = POOLER.replace('sEcReT', pw);
      let pgThrows = false;
      try { parse(url); } catch { pgThrows = true; }
      const flagged = describeConnectionTarget(url).code === 'PASSWORD_NEEDS_PERCENT_ENCODING';
      expect(flagged, `password ${JSON.stringify(pw)}: pg throws=${pgThrows}, module flagged=${flagged}`)
        .toBe(pgThrows);
    }
  });
});

describe('it must stay quiet about strings that are fine, including in dev and CI', () => {
  it.each([
    ['a local dev database', 'postgres://postgres:postgres@localhost:5432/lcx_sales'],
    ['a docker-compose service name', 'postgres://postgres:postgres@postgres:5432/lcx_sales'],
    ['a 127.0.0.1 host', 'postgres://postgres:postgres@127.0.0.1:5432/lcx_sales'],
    ['a non-Supabase managed host', 'postgres://u:pw@my-db.example.com:5432/app'],
  ])('finds no defect in %s', (_label, url) => {
    /* A checker that cries wolf on every developer machine gets muted, and then it is not
       there on the morning it would have mattered. */
    expect(describeConnectionTarget(url).code).toBe('NO_DEFECT_FOUND');
  });

  it('is explicit that a clean string is NOT a claim the credentials work', () => {
    // The one thing this function must never be read as saying.
    expect(describeConnectionTarget(POOLER).fix).toContain('does not verify the credentials');
  });
});

describe('malformed and missing', () => {
  it('reports an empty DATABASE_URL as blocking', () => {
    expect(describeConnectionTarget('').code).toBe('DATABASE_URL_UNSET');
  });

  it('reports a string with no scheme as unparseable', () => {
    expect(describeConnectionTarget('postgres:pw@host:5432/db').code).toBe('DATABASE_URL_UNPARSEABLE');
  });

  it('reports a URL that names no database', () => {
    expect(describeConnectionTarget('postgresql://u:pw@host.example.com:5432').code)
      .toBe('DATABASE_NAME_MISSING');
    expect(describeConnectionTarget('postgresql://u:pw@host.example.com:5432/').code)
      .toBe('DATABASE_NAME_MISSING');
  });
});

describe('THE VERDICT LEAKS NOTHING — and this is a parsing test, not an eyeball', () => {
  /*
   * These verdicts go into a boot log and into an UNAUTHENTICATED response body. Reviewing
   * each `fix` string by hand proves nothing about the next one somebody adds, so every
   * verdict the module can produce is serialised and searched.
   */
  const SECRET = 'sEcReT';
  const REF = 'aaaabbbbccccdddd';
  const cases = [
    DIRECT, POOLER,
    POOLER.replace('postgres.aaaabbbbccccdddd', 'postgres'),
    POOLER.replace(':5432/', ':6543/'),
    POOLER.replace('sEcReT', 'aa#bb'),
    `postgres://postgres:${SECRET}@[2a05:d014::1]:5432/postgres`,
    `postgresql://u:${SECRET}@host.example.com:5432`,
    '',
  ];

  it.each(cases.map((c, i) => [i, c]))('verdict %i carries no password, host or project ref', (_i, url) => {
    const serialised = JSON.stringify(describeConnectionTarget(url as string));
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(REF);
    expect(serialised).not.toContain('supabase.co:');
    expect(serialised).not.toContain('2a05');
  });

  it('and the boot line carries none of it either', () => {
    for (const url of cases) {
      const line = connectionTargetBootLine(url, 'production') ?? '';
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain(REF);
      expect(line).not.toContain('2a05');
    }
  });
});

describe('the boot line', () => {
  it('says nothing at all when the string is clean', () => {
    expect(connectionTargetBootLine(POOLER, 'production')).toBeNull();
  });

  it('names the code and the fix when it is not', () => {
    const line = connectionTargetBootLine(DIRECT, 'production');
    expect(line).toContain('SUPABASE_DIRECT_HOST_IS_IPV6_ONLY');
    expect(line).toContain('CANNOT CONNECT');
  });

  it('distinguishes a warning from a refusal in words, not just in a code', () => {
    const line = connectionTargetBootLine(POOLER.replace(':5432/', ':6543/'), 'production') ?? '';
    expect(line).toContain('will connect, but');
    expect(line).not.toContain('CANNOT CONNECT');
  });

  it('does not shout about an unset URL outside production, where that is normal', () => {
    expect(connectionTargetBootLine('', 'development')).toBeNull();
    expect(connectionTargetBootLine('', 'production')).toContain('DATABASE_URL_UNSET');
  });
});

describe('sanitiseDbError no longer publishes the database address', () => {
  it('strips the IPv6 address that /health was serving to the public', () => {
    /* THE EXACT LIVE MESSAGE. It was returned by an unauthenticated endpoint for hours. */
    const { message } = sanitiseDbError({
      code: 'ENETUNREACH',
      message: 'connect ENETUNREACH 2a05:d014:1e9b:b301:9751:5cd5:770f:9c5:5432 - Local (:::0)',
    });
    expect(message).not.toContain('2a05');
    expect(message).not.toContain('d014');
    // The CODE is what distinguishes the causes, and it must survive.
    expect(sanitiseDbError({ code: 'ENETUNREACH', message: 'x' }).code).toBe('ENETUNREACH');
  });

  it('strips the compressed :: form too', () => {
    expect(sanitiseDbError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 2a05:d014::1:5432' }).message)
      .not.toContain('2a05');
  });

  it('strips an IPv4-mapped address completely — the ordering bug', () => {
    /* IPv6-first consumed `::ffff:` and left `.198.30.239`, which no longer had four
       octets for the IPv4 rule to match. Half an address is still an address. */
    const { message } = sanitiseDbError({
      code: 'ETIMEDOUT', message: 'connect ETIMEDOUT ::ffff:18.198.30.239:5432',
    });
    expect(message).not.toContain('198.30.239');
    expect(message).not.toContain('18.198');
  });

  it('still strips IPv4 and provider hostnames', () => {
    expect(sanitiseDbError({ code: 'X', message: 'connect ECONNREFUSED 18.198.30.239:5432' }).message)
      .not.toContain('18.198.30.239');
    expect(sanitiseDbError({ code: 'X', message: 'getaddrinfo ENOTFOUND db.abc.supabase.co' }).message)
      .not.toContain('supabase.co');
  });

  it('leaves an ordinary message readable — a sanitiser that redacts everything says nothing', () => {
    expect(sanitiseDbError({ code: '28P01', message: 'password authentication failed for user "postgres"' }).message)
      .toContain('password authentication failed');
    // A clock in a message is not an address.
    expect(sanitiseDbError({ code: 'X', message: 'timeout at 12:34:56 exceeded' }).message)
      .toContain('12:34:56');
  });
});
