import pg from 'pg';
import { openReachablePool } from './poolerFallback.js';
import { decideTls } from './index.js';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

/** sha256 of a migration's bytes, hex. The identity of the file's CONTENT. */
export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/**
 * Apply all .sql migration files sequentially (no fancy rollback — forward-only for v1).
 *
 * ══ AN APPLIED MIGRATION IS IMMUTABLE, AND NOW THAT IS CHECKED ═══════════════
 * The loop below skips a file whose NAME is in `_migrations` and never looked at
 * its content. So editing an already-applied file was a silent no-op with a green
 * gate: `0050_gps_perimeter.sql` had its `COMMENT ON TABLE` rewritten in the
 * working tree to correct what the diff itself called "the widest-audience false
 * claim", the file is applied on production, and production therefore kept the
 * false comment. Nothing anywhere said so — not the runner, not CI, not `\d+`.
 *
 * A checksum is recorded per applied file and compared on every subsequent run. A
 * mismatch THROWS, naming the file and both digests, because the only correct way
 * to change an applied migration is a new forward-only migration.
 *
 * WHAT THIS CANNOT SEE, stated rather than implied: a file edited BEFORE its
 * checksum was ever recorded backfills with the edited content — there is no
 * pre-existing digest to disagree with. The repo-side ratchet
 * (`db/__tests__/migrationImmutability.test.ts`) is what closes that window,
 * because it pins the committed bytes in CI where no database is involved at all.
 */
export async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

  /*
   * THE SAME HEALING THE SERVER AND THE CRON DO.
   *
   * Supabase's direct host is AAAA-only, so `db.<ref>.supabase.co` is unreachable from any IPv4-only network —
   * which is what took the scheduled jobs down for a day and Render down before that. A migration runner is the
   * worst place to discover it: the operator is mid-deploy, holding a schema change, reading `ENETUNREACH`.
   *
   * The other pools in `seed/`, `enrich/`, `score/` and `labels/` are deliberately NOT wired to this. They are
   * run by hand against a database the operator chose, and a visible connection error in front of a human who
   * can retype the URL is a fine outcome. This one and the cron are the unattended production paths.
   */
  const tls = decideTls(databaseUrl, process.env.DATABASE_CA_CERT ?? '');
  const opened = await openReachablePool(
    databaseUrl,
    (connectionString) => new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 8_000,
      ...(tls.ssl !== undefined ? { ssl: tls.ssl } : {}),
    }),
    (m) => { console.error(m); },
  );
  const pool = opened.pool as pg.Pool;
  /* The ADOPTED url. A migration log that names a host the run did not use is a log that cannot be trusted to
     answer "which database did we change?" — the one question it exists to answer. */
  console.log(`[migrate] ${opened.url.replace(/\/\/.*@/, '//***@')} (source: ${opened.source}, tls: ${tls.state})`);
  const client = await pool.connect();

  try {
    // Create _migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        file     TEXT PRIMARY KEY,
        applied  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Separate statement, IF NOT EXISTS: every environment that already has this
    // table predates the column, and a database applied by hand in the Supabase
    // editor must pick it up without anyone editing the table there.
    await client.query('ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum TEXT;');

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows: applied } = await client.query('SELECT file, checksum FROM _migrations ORDER BY file');
    const appliedChecksums = new Map<string, string | null>(
      (applied as Array<{ file: string; checksum: string | null }>).map((r) => [r.file, r.checksum]),
    );

    for (const file of files) {
      // READ AND HASH BEFORE THE SKIP. The old loop read the file only when it was
      // about to apply it, which is exactly why an edit to an applied file was
      // invisible: the content was never looked at again.
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      const checksum = migrationChecksum(sql);

      if (appliedChecksums.has(file)) {
        const recorded = appliedChecksums.get(file) ?? null;
        if (recorded === null) {
          // First run since the column existed. Backfill, and say so — this is the
          // one path that trusts the file, and a reader deserves to know which run
          // established the baseline.
          await client.query('UPDATE _migrations SET checksum = $1 WHERE file = $2', [checksum, file]);
          console.log(`[migrate] already applied, checksum recorded: ${file} (${checksum})`);
          continue;
        }
        if (recorded !== checksum) {
          throw new Error(
            `${file} was EDITED AFTER IT WAS APPLIED. Recorded ${recorded}, on disk ${checksum}. `
              + 'This runner skips applied filenames, so the edit has changed nothing in this '
              + 'database and never will: the environment is running the old content while the '
              + 'repository shows the new. Migrations are forward-only — revert the file to the '
              + 'content that was applied and deliver the change as a NEW migration.',
          );
        }
        console.log(`[migrate] already applied: ${file}`);
        continue;
      }

      console.log(`[migrate] applying: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO _migrations (file, checksum) VALUES ($1, $2)', [file, checksum]);
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
