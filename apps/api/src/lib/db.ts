import pg from 'pg';
import type { DbStatus } from '@lcx/shared';
import { env } from './env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (!env.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[db] unexpected pool error', err);
    });
  }
  return pool;
}

function allowSkip(): boolean {
  const v = process.env.ALLOW_DB_SKIP;
  if (v !== undefined && v !== '') {
    return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
  }
  return env.allowDbSkip;
}

export async function checkDb(): Promise<DbStatus> {
  if (!env.databaseUrl) {
    return allowSkip() ? 'skipped' : 'down';
  }

  const p = getPool();
  if (!p) return allowSkip() ? 'skipped' : 'down';

  try {
    const client = await p.connect();
    try {
      await client.query('SELECT 1 AS ok');
      return 'up';
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[db] health check failed', err instanceof Error ? err.message : err);
    if (allowSkip()) {
      return 'skipped';
    }
    return 'down';
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
