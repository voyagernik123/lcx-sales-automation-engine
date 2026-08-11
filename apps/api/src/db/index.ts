import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DbStatus } from '@lcx/shared';
import * as schema from './schema.js';
import { env } from '../lib/env.js';
import { poolerCandidates } from './poolerFallback.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * WHETHER THIS CONNECTION IS ENCRYPTED, AND WHETHER THE SERVER WAS AUTHENTICATED.
 *
 * Three states, never collapsed into "secure":
 *   `verified`  TLS, and the server's certificate was checked against a pinned CA.
 *   `encrypted` TLS, certificate NOT checked. Protects against passive interception on the
 *               path; does NOT protect against an active attacker who can answer for the
 *               host. Strictly better than cleartext and strictly worse than `verified`.
 *   `off`       No TLS. Correct for a loopback socket, and nowhere else.
 */
export type DbTlsState = 'verified' | 'encrypted' | 'off';

/**
 * THE POOL SET NO `ssl`, SO DATABASE TRAFFIC CROSSED THE PUBLIC INTERNET IN CLEARTEXT.
 *
 * `pg` does not negotiate TLS unless it is asked to. The API runs in Oregon and the database
 * is in Frankfurt, so every query, every row and the password itself travelled unprotected
 * between two continents. Nothing in the code said so, which is why it survived a security
 * pass: the absence of a setting looks like a default rather than a decision.
 *
 * ── WHY NOT SIMPLY `rejectUnauthorized: true` ───────────────────────────────────────
 * Because it would fail closed against a managed provider whose CA chain we do not ship, and
 * an outage is not an improvement in confidentiality. Supabase publishes a CA bundle for full
 * verification; until it is provisioned, `DATABASE_CA_CERT` is the seam for it and setting
 * that variable upgrades this to `verified` with no code change.
 *
 * ── WHY NOT UNCONDITIONALLY ─────────────────────────────────────────────────────────
 * A loopback Postgres in Docker or CI has no TLS listener, so forcing it there breaks every
 * local run and every test to protect a packet that never leaves the kernel. The decision is
 * made from the HOST, and `sslmode` in the URL always wins — if an operator has said what they
 * want, this must not silently override it.
 */
export function decideTls(url: string, caCert: string): { ssl: pg.PoolConfig['ssl']; state: DbTlsState } {
  // The operator was explicit. `pg` already honours `sslmode`; do not fight it.
  if (/[?&]sslmode=/i.test(url)) return { ssl: undefined, state: 'encrypted' };

  let host = '';
  try { host = new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { /* unparseable ⇒ treat as local */ }
  const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1'
    // Docker Compose service names and CI hostnames have no dots.
    || !host.includes('.');
  if (isLocal) return { ssl: undefined, state: 'off' };

  if (caCert) return { ssl: { ca: caCert, rejectUnauthorized: true }, state: 'verified' };
  return { ssl: { rejectUnauthorized: false }, state: 'encrypted' };
}

let tlsState: DbTlsState = 'off';
/** What the live pool actually negotiated. Reported by `/health`, never inferred by a caller. */
export function getDbTlsState(): DbTlsState { return tlsState; }

/**
 * THE URL ACTUALLY IN USE, WHEN IT IS NOT THE ONE THAT WAS CONFIGURED.
 *
 * `null` means the environment's value is being used verbatim, which is the normal case and
 * the only case in which the configuration describes the behaviour. When this is set, an
 * operator MUST be able to see that — see `getDbUrlSource`, reported by `/health`.
 */
let resolvedUrl: string | null = null;
let urlSource: 'env' | 'pooler-fallback' = 'env';
export function getDbUrlSource(): 'env' | 'pooler-fallback' { return urlSource; }
/** For tests: forget any healed URL so each case starts from the configured value. */
export function resetDbUrlOverride(): void { resolvedUrl = null; urlSource = 'env'; }

/**
 * PROBE THE POOLER FORMS OF AN UNROUTABLE DIRECT HOST AND ADOPT THE FIRST THAT CONNECTS.
 *
 * Called once at boot and deliberately NOT awaited by the server start: the process must
 * answer `/health` immediately whatever the database is doing — that is the whole lesson of
 * the liveness split. This runs alongside, and the pool is swapped the moment a candidate
 * answers, so the API heals within seconds of booting rather than waiting for a human.
 *
 * Returns TRUE if a rewrite was adopted. A no-op (and FALSE) for every URL that is not the
 * one host proven unable to work from an IPv4-only network.
 */
export async function healDatabaseUrl(): Promise<boolean> {
  if (!env.supabasePoolerFallback) return false;
  const candidates = poolerCandidates(env.databaseUrl);
  if (candidates.length === 0) return false;

  console.error(
    '[db] DATABASE_URL names the Supabase DIRECT host, which has no IPv4 address and cannot '
    + 'be reached from here. Probing the session-pooler forms.',
  );

  for (const c of candidates) {
    /* A fresh single-connection pool per attempt, torn down either way. Short timeouts: a
       wrong region answers XX000 almost immediately, so the sweep is fast in the common case. */
    const probe = new Pool({
      connectionString: c.url,
      max: 1,
      connectionTimeoutMillis: 4_000,
      query_timeout: 4_000,
      ...(() => { const t = decideTls(c.url, env.databaseCaCert); return t.ssl !== undefined ? { ssl: t.ssl } : {}; })(),
    });
    try {
      await probe.query('SELECT 1');
      resolvedUrl = c.url;
      urlSource = 'pooler-fallback';
      console.error(`[db] ADOPTED ${c.label} — the configured DATABASE_URL is NOT the one in use. Fix it in the dashboard to make configuration match behaviour.`);
      await probe.end().catch(() => undefined);
      // Drop the pool built from the unroutable URL so every new connection uses the healed one.
      await closeDb();
      return true;
    } catch {
      await probe.end().catch(() => undefined);
    }
  }
  console.error('[db] no pooler form answered. DATABASE_URL must be corrected in the dashboard.');
  return false;
}

export function getPool(): pg.Pool {
  if (!pool) {
    const url = resolvedUrl ?? env.databaseUrl;
    const tls = decideTls(url, env.databaseCaCert);
    tlsState = tls.state;
    pool = new Pool({
      connectionString: url,
      ...(tls.ssl !== undefined ? { ssl: tls.ssl } : {}),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      /*
       * QUERY TIMEOUTS, and their absence took the whole API off the internet.
       *
       * `connectionTimeoutMillis` bounds ACQUIRING a connection. It does nothing once a
       * socket is open — and when a managed Postgres is paused or removed, the TCP
       * connection still establishes and then never answers. Every query on it hung
       * forever. `/health` is Render's healthCheckPath and it awaits a query, so it never
       * responded; Render timed the probe out, marked the instance unhealthy and stopped
       * routing to it. The observable result was TLS completing in 41 ms and then zero
       * bytes, on EVERY endpoint, including ones that never touch the database.
       *
       * `query_timeout` bounds the client's wait; `statement_timeout` tells the SERVER to
       * abort, so a query that is merely slow does not keep burning a backend after the
       * client has given up. Both are needed: one without the other leaks work.
       */
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    pool.on('error', (err) => {
      console.error('[db] pool error', err);
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

/**
 * How long the health probe waits before calling the database down.
 *
 * Deliberately far shorter than `query_timeout`: a health check is not a query, and a
 * database that has not answered a `SELECT 1` in two seconds is down for the purpose of
 * telling a load balancer what to do, whatever it may be doing internally.
 */
export const HEALTH_DB_TIMEOUT_MS = 2_000;

/** The last reason a health probe could not reach the database. No secrets, ever. */
let lastDbError: { code: string; message: string } | null = null;

export function getLastDbError(): { code: string; message: string } | null {
  return lastDbError;
}

/**
 * Reduce a driver error to a code and a SHORT message, with anything that could carry a
 * credential stripped.
 *
 * `pg` puts the host and sometimes the user in the message (`getaddrinfo ENOTFOUND
 * db.xxxx.supabase.co`), and the health endpoint is unauthenticated — so the host is
 * removed too. The CODE is what actually distinguishes the causes:
 *   ENOTFOUND / EAI_AGAIN  → the host does not resolve: wrong project ref, or a DNS/IPv6 issue
 *   ECONNREFUSED           → resolves, nothing listening on that port
 *   ETIMEDOUT / timeout    → resolves, packets black-holed: firewall, or IPv6-only host
 *                            reached from an IPv4-only network (the classic Supabase +
 *                            Render free-tier case — the fix is the POOLER connection string)
 *   28P01                  → password authentication failed
 *   3D000                  → database does not exist
 */
export function sanitiseDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' && e.code ? e.code : 'UNKNOWN';
  const raw = typeof e?.message === 'string' ? e.message : String(err);
  /*
   * ORDER IS LOAD-BEARING, and getting it wrong leaked half an address.
   *
   * The connection string goes first because it CONTAINS hosts and addresses, so stripping
   * its parts individually would leave the rest of it intact. IPv4 must precede IPv6
   * because an IPv4-mapped address (`::ffff:18.198.30.239`) matches the front of the IPv6
   * pattern; stripping IPv6 first consumed `::ffff:` and left `.198.30.239`, which then no
   * longer had four octets for the IPv4 rule to recognise.
   */
  const message = raw
    .replace(/postgres(ql)?:\/\/\S+/gi, '<connection-string>')
    .replace(/[\w.-]+\.(supabase|render|amazonaws)\.(co|com)[^\s]*/gi, '<host>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    /*
     * IPv6, AND THIS ENDPOINT WAS PUBLISHING ONE.
     *
     * The live `ENETUNREACH` message carried the database's full address —
     * `2a05:d014:1e9b:b301:9751:5cd5:770f:9c5` — to anyone who curled `/health`
     * unauthenticated, because the original rule only knew about dotted quads. Three or
     * more colon-separated groups, so `HH:MM:SS` in a message is left alone; empty groups
     * allowed, so the compressed `::` form is caught too.
     */
    .replace(/(?:[0-9a-f]{0,4}:){3,}[0-9a-f]{0,4}/gi, '<addr>')
    .slice(0, 160);
  return { code, message };
}

export async function checkDb(): Promise<DbStatus> {
  if (!(resolvedUrl ?? env.databaseUrl)) {
    return env.nodeEnv === 'development' ? 'skipped' : 'down';
  }

  /*
   * A HARD DEADLINE OF OUR OWN, on top of the pool's timeouts.
   *
   * Belt and braces on purpose: a timeout that depends on the driver honouring it is not a
   * timeout, and this function's whole job is to answer QUICKLY even when nothing else can.
   * `Promise.race` guarantees a verdict in bounded time regardless of what `pg` does with
   * a half-open socket.
   */
  const probe = (async (): Promise<DbStatus> => {
    const client = await getPool().connect();
    try {
      await client.query('SELECT 1');
      lastDbError = null;
      return 'up';
    } finally {
      client.release();
    }
  })();
  probe.catch((err: unknown) => { lastDbError = sanitiseDbError(err); });

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DbStatus>((resolve) => {
    timer = setTimeout(() => {
      lastDbError ??= { code: 'PROBE_TIMEOUT', message: `no answer within ${HEALTH_DB_TIMEOUT_MS}ms` };
      resolve('down');
    }, HEALTH_DB_TIMEOUT_MS);
  });

  try {
    return await Promise.race([probe, deadline]);
  } catch (err) {
    lastDbError = sanitiseDbError(err);
    console.error('[db] health check failed:', lastDbError.code, lastDbError.message);
    return env.nodeEnv === 'development' ? 'skipped' : 'down';
  } finally {
    if (timer) clearTimeout(timer);
    // The losing probe is still in flight; swallow its rejection so a slow failure cannot
    // surface later as an unhandled rejection and take the process down.
    void probe.catch(() => undefined);
  }
}
