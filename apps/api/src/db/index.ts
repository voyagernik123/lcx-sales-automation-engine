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
      return 'up';
    } finally {
      client.release();
    }
  })();

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DbStatus>((resolve) => {
    timer = setTimeout(() => resolve('down'), HEALTH_DB_TIMEOUT_MS);
  });

  try {
    return await Promise.race([probe, deadline]);
  } catch (err) {
    console.error('[db] health check failed:', err instanceof Error ? err.message : err);
    return env.nodeEnv === 'development' ? 'skipped' : 'down';
  } finally {
    if (timer) clearTimeout(timer);
    // The losing probe is still in flight; swallow its rejection so a slow failure cannot
    // surface later as an unhandled rejection and take the process down.
    void probe.catch(() => undefined);
  }
}
