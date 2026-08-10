import { describe, expect, it } from 'vitest';
import { decideTls } from '../index.js';

/**
 * DATABASE TRAFFIC WAS CROSSING THE PUBLIC INTERNET IN CLEARTEXT.
 *
 * `pg` does not negotiate TLS unless it is asked to, and the pool set no `ssl` at all. The API
 * runs in Oregon, the database is in Frankfurt, so every query, every row and the password
 * itself travelled unprotected between two continents. It survived a security pass because an
 * ABSENT SETTING READS AS A DEFAULT rather than as a decision — which is exactly why the state
 * is now reported on `/health` instead of being inferred from the code.
 *
 * The fix has two failure modes and both are worse than the bug, so both are pinned here:
 * forcing verification we cannot perform turns a confidentiality risk into an outage, and
 * forcing TLS onto a loopback socket breaks every local run and every CI job to protect a
 * packet that never leaves the kernel.
 */

const REMOTE = 'postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgres://postgres:postgres@localhost:5432/lcx_sales';
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('a remote database is never spoken to in cleartext', () => {
  it('turns TLS on for a remote host', () => {
    const { ssl, state } = decideTls(REMOTE, '');
    expect(state).toBe('encrypted');
    expect(ssl).toBeTruthy();
  });

  it('reports `encrypted`, NOT `verified`, when there is no CA to check against', () => {
    /*
     * THE DISTINCTION IS THE WHOLE POINT. Encryption without verification stops passive
     * interception and does nothing against something that can answer for the host. Reporting
     * that as "secure" would be the same class of lie as the silent cleartext it replaces.
     */
    expect(decideTls(REMOTE, '').state).toBe('encrypted');
    expect(decideTls(REMOTE, '').ssl).toEqual({ rejectUnauthorized: false });
  });

  it('upgrades to `verified` when a CA bundle is provisioned — no code change', () => {
    const { ssl, state } = decideTls(REMOTE, PEM);
    expect(state).toBe('verified');
    expect(ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('treats the Supabase direct host as remote too', () => {
    expect(decideTls('postgresql://postgres:pw@db.abc.supabase.co:5432/postgres', '').state)
      .toBe('encrypted');
  });
});

describe('it must not break local development or CI — an outage is not an improvement', () => {
  it.each([
    ['localhost', LOCAL],
    ['127.0.0.1', 'postgres://u:p@127.0.0.1:5432/db'],
    ['an IPv6 loopback literal', 'postgres://u:p@[::1]:5432/db'],
    ['a docker-compose service name', 'postgres://u:p@postgres:5432/db'],
    ['an unset URL', ''],
  ])('leaves TLS off for %s', (_label, url) => {
    /* A loopback Postgres has no TLS listener. Forcing it here would fail every local run and
       every test to protect a packet that never leaves the kernel. */
    const { ssl, state } = decideTls(url, '');
    expect(state).toBe('off');
    expect(ssl).toBeUndefined();
  });

  it('a CA cert does NOT drag a local connection into TLS', () => {
    // Otherwise a developer who happens to have DATABASE_CA_CERT exported cannot run anything.
    expect(decideTls(LOCAL, PEM).state).toBe('off');
  });
});

describe('an explicit sslmode in the URL wins', () => {
  it.each(['require', 'verify-full', 'disable', 'no-verify'])(
    'defers to sslmode=%s rather than overriding it',
    (mode) => {
      /*
       * `pg` already implements `sslmode`. If an operator has said what they want, silently
       * substituting our own judgement is how a deployment stops matching its own
       * configuration — and the operator has no way to see that it happened.
       */
      const { ssl } = decideTls(`${REMOTE}?sslmode=${mode}`, '');
      expect(ssl).toBeUndefined();
    },
  );

  it('and an sslmode on a URL that also has other params is still honoured', () => {
    expect(decideTls(`${REMOTE}?application_name=lcx&sslmode=require`, '').ssl).toBeUndefined();
  });
});

describe('malformed input cannot produce a cleartext remote connection by accident', () => {
  it('falls back to `off` on an unparseable URL rather than guessing', () => {
    /* Unparseable means `pg` will reject it too, so nothing connects either way — and guessing
       `remote` here would attach TLS options to a string that never becomes a connection. */
    expect(decideTls('not a url at all', '').state).toBe('off');
  });

  it('never returns `verified` without a CA', () => {
    // The one invariant that must hold across every branch: verification requires something to
    // verify against.
    for (const url of [REMOTE, LOCAL, '', 'garbage', `${REMOTE}?sslmode=require`]) {
      expect(decideTls(url, '').state).not.toBe('verified');
    }
  });
});
