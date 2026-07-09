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

export async function checkDb(): Promise<DbStatus> {
  if (!env.databaseUrl) {
    return env.nodeEnv === 'development' ? 'skipped' : 'down';
  }

  try {
    const client = await getPool().connect();
    try {
      await client.query('SELECT 1');
      return 'up';
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[db] health check failed:', err instanceof Error ? err.message : err);
    return env.nodeEnv === 'development' ? 'skipped' : 'down';
  }
}
