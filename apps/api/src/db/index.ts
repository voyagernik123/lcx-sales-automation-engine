import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DbStatus } from '@lcx/shared';
import * as schema from './schema.js';
import { env } from '../lib/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
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
function sanitiseDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' && e.code ? e.code : 'UNKNOWN';
  const raw = typeof e?.message === 'string' ? e.message : String(err);
  const message = raw
    // Strip hostnames, IPs and anything after a colon that could be a port or credential.
    .replace(/[\w.-]+\.(supabase|render|amazonaws)\.(co|com)[^\s]*/gi, '<host>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/postgres(ql)?:\/\/\S+/gi, '<connection-string>')
    .slice(0, 160);
  return { code, message };
}

export async function checkDb(): Promise<DbStatus> {
  if (!env.databaseUrl) {
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
