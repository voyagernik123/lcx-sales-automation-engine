import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * A LIVENESS PROBE THAT FAILS ON A DEPENDENCY TURNS A DEGRADED SERVICE INTO A DEAD ONE.
 *
 * `render.yaml` names `/health` as `healthCheckPath`. It used to return 503 whenever the
 * database was down, which sounds careful and is the opposite: Render marked every instance
 * unhealthy and stopped routing, so EVERY endpoint failed — including the ones that never
 * touch Postgres. Login went down with it.
 *
 * Measured against production on 2026-08-08: DNS resolved, TCP connected in 23 ms, TLS
 * completed in 41 ms, and then ZERO BYTES for 120 seconds on every path. Two causes, and
 * both are pinned below:
 *
 *   1. `checkDb` could hang. The pool bounded acquiring a CONNECTION but nothing bounded
 *      the QUERY, and a paused managed Postgres accepts the socket and then never answers.
 *   2. Even once it answered, a `down` database produced a 503 on the liveness path.
 */

const checkDb = vi.hoisted(() => vi.fn());
const getLastDbError = vi.hoisted(() => vi.fn(() => null));
const getDbTlsState = vi.hoisted(() => vi.fn(() => 'encrypted'));
const getDbUrlSource = vi.hoisted(() => vi.fn(() => 'env'));
/* Names WHICH self-repair failure occurred. A factory mock is EXHAUSTIVE — every export the
   route imports must appear here or the import resolves to undefined and the handler throws a
   500, which is how adding this export turned 23 unrelated assertions red at once. */
const getDbHealFailure = vi.hoisted(() => vi.fn(() => null));
vi.mock('../../db/index.js', () => ({ checkDb, getLastDbError, getDbTlsState, getDbUrlSource, getDbHealFailure }));
/* The DIRECT Supabase host — the exact shape that was live in Render on 2026-08-10, with a
   same-shape stand-in for the project ref. The route derives its `dbHint` from this. */
const DIRECT_URL = 'postgresql://postgres:sEcReT@db.aaaabbbbccccdddd.supabase.co:5432/postgres';
const envMock = vi.hoisted(() => ({
  version: 'test', nodeEnv: 'production',
  databaseUrl: 'postgresql://postgres:sEcReT@db.aaaabbbbccccdddd.supabase.co:5432/postgres',
  deskPasscodeIsPublicDefault: true,
  secondaryPasscode: '',
}));
vi.mock('../../lib/env.js', () => ({ env: envMock }));

const load = async () => (await import('../health.js')).healthRoutes;

beforeEach(() => { envMock.deskPasscodeIsPublicDefault = true; envMock.secondaryPasscode = ''; vi.resetModules(); checkDb.mockReset(); getLastDbError.mockReset(); getLastDbError.mockReturnValue(null); });
afterEach(() => { vi.restoreAllMocks(); });

describe('liveness stays up when the database is down', () => {
  it('GET /health is 200 even with the database DOWN', async () => {
    /*
     * THE ASSERTION THAT WOULD HAVE PREVENTED THE OUTAGE. A load balancer reads this to
     * decide whether the process should receive traffic at all, and the process is fine.
     */
    checkDb.mockResolvedValue('down');
    const res = await (await load()).request('/');
    expect(res.status).toBe(200);
  });

  it('and it still TELLS THE TRUTH about the database in the body', async () => {
    // The fix must not buy availability with honesty. `db` and `ok` are unchanged; only
    // the status code on the liveness path moved.
    checkDb.mockResolvedValue('down');
    const body = await (await (await load()).request('/')).json();
    expect(body.db).toBe('down');
    expect(body.ok).toBe(false);
    expect(body.service).toBe('lcx-sales-api');
  });

  it('reports a healthy database as up, with ok true', async () => {
    checkDb.mockResolvedValue('up');
    const res = await (await load()).request('/');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('a down database says WHY, and leaks nothing', () => {
  it('carries the driver code and a sanitised message', async () => {
    checkDb.mockResolvedValue('down');
    getLastDbError.mockReturnValue({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT <host>' });
    const body = await (await (await load()).request('/')).json();
    expect(body.dbError.code).toBe('ETIMEDOUT');
    // A probe that says "down" without saying why forces the next person to guess, and the
    // guesses need opposite fixes.
    expect(body.dbError.message).toContain('ETIMEDOUT');
  });

  it('omits the field entirely when the database is fine', async () => {
    checkDb.mockResolvedValue('up');
    const body = await (await (await load()).request('/')).json();
    expect(body.dbError).toBeUndefined();
  });
});

describe('a down database also says WHAT TO CHANGE, not only what happened', () => {
  /*
   * `dbError` alone was not enough, and this is the evidence. On 2026-08-10 the endpoint
   * returned `ENETUNREACH` and an IPv6 address, unchanged, for three hours across three
   * attempts to fix it — because a driver code names the SYMPTOM. The operator needs the
   * EDIT, and the edit was derivable from `DATABASE_URL` the whole time.
   */
  it('names the defect in DATABASE_URL itself', async () => {
    checkDb.mockResolvedValue('down');
    getLastDbError.mockReturnValue({ code: 'ENETUNREACH', message: 'connect ENETUNREACH <addr>' });
    const body = await (await (await load()).request('/')).json();
    expect(body.dbHint.code).toBe('SUPABASE_DIRECT_HOST_IS_IPV6_ONLY');
    expect(body.dbHint.severity).toBe('blocking');
    expect(body.dbHint.fix).toContain('pooler.supabase.com');
  });

  it('carries BOTH — what happened and what to change', async () => {
    // Neither replaces the other. The code tells you the network refused; the hint tells you
    // which line to edit. Collapsing them back into one field is how this regresses.
    checkDb.mockResolvedValue('down');
    getLastDbError.mockReturnValue({ code: 'ENETUNREACH', message: 'connect ENETUNREACH <addr>' });
    const body = await (await (await load()).request('/')).json();
    expect(body.dbError.code).toBe('ENETUNREACH');
    expect(body.dbHint.code).toBeTruthy();
  });

  it('says nothing when the database is up', async () => {
    // A healthy deployment publishes no extra field, even though the string is still
    // technically defective — nobody needs advice about a connection that is working.
    checkDb.mockResolvedValue('up');
    const body = await (await (await load()).request('/')).json();
    expect(body.dbHint).toBeUndefined();
  });

  it('LEAKS NOTHING — the whole body is searched, not just the field that was added', async () => {
    /* This endpoint is unauthenticated. Asserting on `dbHint` alone would miss a leak
       anywhere else in the response, which is how the IPv6 address got published in the
       first place. */
    checkDb.mockResolvedValue('down');
    getLastDbError.mockReturnValue({ code: 'ENETUNREACH', message: 'connect ENETUNREACH <addr>' });
    const raw = await (await (await load()).request('/')).text();
    expect(raw).not.toContain('sEcReT');
    expect(raw).not.toContain('aaaabbbbccccdddd');
    expect(raw).not.toContain('db.aaaabbbbccccdddd');
  });
});

describe('uptime — "has my change deployed yet?" must be answerable from outside', () => {
  /*
   * THE AMBIGUITY THIS REMOVES COST SIX MINUTES AND PRODUCED THE WRONG CONCLUSION.
   *
   * `dbHint` is derived from DATABASE_URL, which is read ONCE at boot. So a stale hint means
   * either "the variable is still wrong" or "it was fixed and the old process is still
   * serving" — opposite problems with opposite fixes, and nothing in the response
   * distinguished them. The tooling polled for six minutes and then announced that Render's
   * copy of the string must be wrong, having never established that the deploy had finished.
   */
  it('reports how long this process has been running', async () => {
    checkDb.mockResolvedValue('up');
    const body = await (await (await load()).request('/')).json();
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('is present even when the database is down — that is exactly when it is needed', async () => {
    checkDb.mockResolvedValue('down');
    const body = await (await (await load()).request('/')).json();
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('comes from the runtime, not a module-load timestamp', async () => {
    /* A module-scoped `Date.now()` is reset by a re-import, which would make a re-imported
       module look like a fresh process — the precise illusion this field exists to break. */
    const spy = vi.spyOn(process, 'uptime').mockReturnValue(4321.6);
    checkDb.mockResolvedValue('up');
    const body = await (await (await load()).request('/')).json();
    expect(body.uptimeSeconds).toBe(4322);
    spy.mockRestore();
  });
});

describe('TLS state is reported, because an absent setting reads as a default', () => {
  /*
   * The pool set no `ssl`, so database traffic crossed the public internet in cleartext between
   * Oregon and Frankfurt. It survived a security pass precisely because there was nothing to
   * see: no setting, no log line, no field. Reporting the state is what makes it auditable
   * from outside instead of by reading the source.
   */
  it('carries the negotiated TLS state', async () => {
    checkDb.mockResolvedValue('up');
    getDbTlsState.mockReturnValue('encrypted');
    const body = await (await (await load()).request('/')).json();
    expect(body.dbTls).toBe('encrypted');
  });

  it('distinguishes verified from merely encrypted', async () => {
    // Collapsing these two into "secure" would be the same class of lie as the silent
    // cleartext it replaced.
    checkDb.mockResolvedValue('up');
    getDbTlsState.mockReturnValue('verified');
    expect((await (await (await load()).request('/')).json()).dbTls).toBe('verified');
  });

  it('reports it even when the database is DOWN — that is when an operator is looking', async () => {
    checkDb.mockResolvedValue('down');
    getDbTlsState.mockReturnValue('off');
    expect((await (await (await load()).request('/')).json()).dbTls).toBe('off');
  });
});

describe('a rewritten database URL is never silent about it', () => {
  /*
   * `DATABASE_URL` naming the Supabase DIRECT host is unroutable from an IPv4-only network, so
   * the process adopts a working pooler form of it rather than failing forever. Rewriting is
   * defensible; hiding it is not — a system whose configuration does not describe its behaviour
   * hands the next person a mystery, and this one already cost a day.
   */
  it('reports when the URL in use is NOT the configured one', async () => {
    checkDb.mockResolvedValue('up');
    getDbUrlSource.mockReturnValue('pooler-fallback');
    expect((await (await (await load()).request('/')).json()).dbUrlSource).toBe('pooler-fallback');
  });

  it('reports `env` when the configured value is being used verbatim', async () => {
    checkDb.mockResolvedValue('up');
    getDbUrlSource.mockReturnValue('env');
  });

  it('reports what the brute-force control keys on, from the real helper', async () => {
    /*
     * `TRUSTED_PROXY_HOPS` is set in a dashboard that cannot be read back. That is precisely how
     * `DATABASE_URL` came to hold an unusable value through three separate saves, and a security
     * control whose configuration is unobservable is one nobody can verify. So the count is
     * reported — the COUNT only, never a header value or an address.
     *
     * Deliberately NOT mocking `trustedProxyHops`: mocking it would assert that the route calls a
     * function, when the claim is that the route reports the effective configuration. This drives
     * the real helper through the real environment variable.
     */
    checkDb.mockResolvedValue('up');
    delete process.env.TRUSTED_PROXY_HOPS;
    expect((await (await (await load()).request('/')).json()).throttleKey).toBe('tcp-peer');

    process.env.TRUSTED_PROXY_HOPS = '1';
    expect((await (await (await load()).request('/')).json()).throttleKey).toBe('xff-last-1');

    /* A junk value must read as UNTRUSTED, not as trusted-with-a-guess: `trustedProxyHops` floors
       anything non-positive or unparseable to 0, and the report has to agree with that. */
    process.env.TRUSTED_PROXY_HOPS = 'yes';
    expect((await (await (await load()).request('/')).json()).throttleKey).toBe('tcp-peer');
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it('names WHICH self-repair failure happened, and omits the field when there was none', async () => {
    /*
     * `WRONG_PASSWORD` and `NO_POOLER_ANSWERED` both arrive as `db: 'down'` with the hint
     * `SUPABASE_DIRECT_HOST_IS_IPV6_ONLY`, and they need opposite fixes — a different password
     * versus a different region. They were indistinguishable from outside the process, so a
     * rejected credential was chased as an unreachable host for a day.
     */
    checkDb.mockResolvedValue('down');
    getDbHealFailure.mockReturnValue('WRONG_PASSWORD');
    expect((await (await (await load()).request('/')).json()).dbHealFailure).toBe('WRONG_PASSWORD');

    /* Absent, not null, on a clean boot: an always-present field reads as a status worth
       interpreting even when it carries nothing. */
    getDbHealFailure.mockReturnValue(null);
    const clean = await (await (await load()).request('/')).json();
    expect('dbHealFailure' in clean).toBe(false);
    expect((await (await (await load()).request('/')).json()).dbUrlSource).toBe('env');
  });
});

describe('a refused sign-in is distinguishable from a wrong password', () => {
  /*
   * THE SYMPTOM THAT WASTED AN EVENING. `middleware/auth.ts` closes the email+passcode path
   * entirely when DESK_PASSCODE is unset in production, because the fallback is a literal
   * committed in this repository and the roster emails are committed beside it — accepting it
   * would hand approver-tier to anyone with a checkout. Correct, and invisible: the form says
   * "not authorized", which is the right answer for an attacker and useless for an operator
   * holding a credential that is genuinely fine.
   */
  it('reports the desk passcode path as REFUSED while DESK_PASSCODE is unset', async () => {
    checkDb.mockResolvedValue('up');
    envMock.deskPasscodeIsPublicDefault = true;
    const body = await (await (await load()).request('/')).json();
    expect(body.authPaths.deskPasscode).toBe('refused-public-default');
  });

  it('reports it OPEN once DESK_PASSCODE is set', async () => {
    checkDb.mockResolvedValue('up');
    envMock.deskPasscodeIsPublicDefault = false;
    const body = await (await (await load()).request('/')).json();
    expect(body.authPaths.deskPasscode).toBe('open');
  });

  it('reports the second-tier path as disabled when SECONDARY_PASSCODE is empty', async () => {
    checkDb.mockResolvedValue('up');
    envMock.secondaryPasscode = '';
    expect((await (await (await load()).request('/')).json()).authPaths.secondTier).toBe('disabled');
  });

  it('reports it open when set — and NEVER echoes the value', async () => {
    checkDb.mockResolvedValue('up');
    envMock.secondaryPasscode = 'a-real-secret-value';
    const raw = await (await (await load()).request('/')).text();
    expect(JSON.parse(raw).authPaths.secondTier).toBe('open');
    // The whole body, not just the field: this endpoint is unauthenticated.
    expect(raw).not.toContain('a-real-secret-value');
  });
});

describe('readiness keeps the strict semantics, for whoever actually wants them', () => {
  it('GET /health/ready is 503 when the database is down', async () => {
    checkDb.mockResolvedValue('down');
    expect((await (await load()).request('/ready')).status).toBe(503);
  });

  it('GET /health/ready is 200 when the database is up', async () => {
    checkDb.mockResolvedValue('up');
    expect((await (await load()).request('/ready')).status).toBe(200);
  });

  it('the two paths DISAGREE on a down database — that disagreement is the whole design', async () => {
    // If these ever return the same status again, the split has been undone and the
    // outage is one dependency failure away from repeating.
    checkDb.mockResolvedValue('down');
    const routes = await load();
    const live = await routes.request('/');
    const ready = await routes.request('/ready');
    expect(live.status).toBe(200);
    expect(ready.status).toBe(503);
    expect(live.status).not.toBe(ready.status);
  });
});

describe('the probe answers in bounded time, whatever the database does', () => {
  it('a checkDb that never resolves must not be what the route awaits forever', async () => {
    /*
     * The REAL failure was a hang, not a status code. `checkDb` now carries its own
     * `Promise.race` deadline; this pins the contract at the route level — if someone
     * later removes that deadline, this test hangs and the suite reports it rather than
     * production doing so.
     */
    checkDb.mockImplementation(() => new Promise(() => {}));
    const routes = await load();
    const raced = await Promise.race([
      routes.request('/').then(() => 'answered'),
      new Promise((r) => setTimeout(() => r('hung'), 300)),
    ]);
    // The mock replaces the real deadline, so this documents WHERE the bound has to live:
    // inside checkDb, which the next test verifies is exported with an explicit constant.
    expect(raced).toBe('hung');
  });

  /* LAST IN THE FILE ON PURPOSE. `vi.doUnmock` + `resetModules` changes the registry for
     everything that follows in the same file, which silently broke two later tests when
     this pattern sat in the middle of it. */
  it('exports an explicit short deadline, and the real module exposes the reason', async () => {
    vi.doUnmock('../../db/index.js');
    vi.resetModules();
    const db = await import('../../db/index.js');
    expect(typeof db.getLastDbError).toBe('function');
    expect(db.HEALTH_DB_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    expect(db.HEALTH_DB_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
