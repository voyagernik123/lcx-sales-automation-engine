import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * Run it from a command line: `npm run migrate -w @lcx/api`.
 *
 * `migrate()` has existed and been exported since the first migration and had ZERO
 * callers — 46 `.sql` files and nothing in the repo that ran them. That is why every
 * production migration in this project's history has been applied by hand, pasted into
 * the Supabase SQL editor, and why "is 0044 actually applied?" was a question nobody
 * could answer without opening a browser.
 *
 * The immediate reason for adding it: CI now stands up a Postgres service container, and
 * a container with no schema is no more useful to the test suite than no container at
 * all. This is what fills it.
 *
 * WHAT THIS IS NOT. It is not a deployment step and nothing wires it into one. Render
 * still boots `node dist/index.js` without migrating, deliberately — a forward-only
 * runner with no locking, applying arbitrary DDL on every instance start, races with
 * itself the moment there is more than one instance. Making prod self-migrating is a
 * real change with a real design behind it, not a side effect of needing a schema in CI.
 *
 * The main-module guard means importing this file still costs nothing, which matters
 * because `migrate()` is imported by tests and would otherwise run on import.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      // Exit non-zero and loudly: in CI this step failing has to stop the job, or the
      // test run proceeds against an empty database and reports a wall of confusing
      // "relation does not exist" errors instead of "the migration failed".
      console.error('[migrate] FAILED:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
