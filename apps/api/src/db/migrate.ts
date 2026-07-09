import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

/**
 * Apply all .sql migration files sequentially (no fancy rollback — forward-only for v1).
 */
export async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // Create _migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        file     TEXT PRIMARY KEY,
        applied  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows: applied } = await client.query('SELECT file FROM _migrations ORDER BY file');
    const appliedSet = new Set(applied.map((r: { file: string }) => r.file));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] already applied: ${file}`);
        continue;
      }
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO _migrations (file) VALUES ($1)', [file]);
    }

    console.log('[migrate] all migrations applied');
  } finally {
    client.release();
    await pool.end();
  }
}
