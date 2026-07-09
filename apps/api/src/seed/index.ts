/**
 * seed CLI — stages the 8 CSV/XLSX sources through the connector runner:
 * stage (hash-gated) → normalize → resolve identity → batched upsert → link people.
 *
 * Idempotent: a second run with unchanged files reports 0 changed rows.
 *
 * Usage:
 *   npx tsx src/seed/index.ts <data-dir>
 *   npx tsx src/seed/index.ts --help
 *
 * Requires DATABASE_URL env (defaults to local Postgres).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { CSV_JOBS, loadCsvSource } from '../connectors/csv.js';
import { runConnector } from '../connectors/runner.js';
import type { RawPerson } from '../import/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../../../');
const DEFAULT_DATA_DIR = resolve(PROJECT_ROOT, 'data/seeds');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const dataDir = resolve(args[0] ?? DEFAULT_DATA_DIR);
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

  console.log(`\n🧠 LCX Sales Automation Engine — Seed Import\n`);
  console.log(`  Data dir:  ${dataDir}`);
  console.log(`  Database:  ${dbUrl.replace(/\/\/.*@/, '//***@')}\n`);

  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });

  try {
    await pool.query('SELECT 1');
    console.log('  DB connection OK\n');

    let totalChanged = 0;
    let totalInserted = 0;
    let totalAttached = 0;
    let peopleInserted = 0;
    let peopleSkipped = 0;

    for (const job of CSV_JOBS) {
      const loaded = await loadCsvSource(dataDir, job);
      if (!loaded.fileFound) {
        console.log(`  — ${job.label.padEnd(22)} file not found, skipped`);
        continue;
      }

      const report = await runConnector(pool, loaded.connector);
      totalChanged += report.changed;
      totalInserted += report.inserted;
      totalAttached += report.attached;

      console.log(
        `  ✓ ${job.label.padEnd(22)} ${loaded.rawRows} rows → ${report.staged} staged, ` +
        `${report.changed} changed, ${report.inserted} new, ${report.attached} matched`,
      );
      for (const err of report.errors.slice(0, 3)) console.log(`      ! ${err}`);

      // Link people via staged mapping (works for unchanged rows too)
      if (loaded.people.length > 0) {
        const idByExt = await mapExternalIds(pool, job.source, loaded.people.map((p) => p.extId), report.projectIdByExternalId);
        const res = await upsertPeople(pool, loaded.people, idByExt);
        peopleInserted += res.inserted;
        peopleSkipped += res.skipped;
      }
    }

    console.log(`\n✅ Seed import complete.`);
    console.log(`  ${totalChanged} changed rows → ${totalInserted} new projects, ${totalAttached} matched to existing`);
    console.log(`  ${peopleInserted} people inserted, ${peopleSkipped} already present\n`);

    await pool.query(
      `INSERT INTO audit_log (id, actor, action, entity, meta) VALUES ($1, 'seed', 'seed_import', 'project', $2)`,
      [randomUUID(), JSON.stringify({ changed: totalChanged, inserted: totalInserted, attached: totalAttached, peopleInserted })],
    );
  } finally {
    await pool.end();
  }
}

/** extId → projectId: run-report first, then project_sources for unchanged rows. */
async function mapExternalIds(
  pool: pg.Pool,
  source: string,
  extIds: string[],
  fromReport: Map<string, string>,
): Promise<Map<string, string>> {
  const map = new Map(fromReport);
  const missing = [...new Set(extIds.filter((e) => !map.has(e)))];
  if (missing.length > 0) {
    const { rows } = await pool.query(
      `SELECT external_id, project_id FROM project_sources
       WHERE source = $1 AND external_id = ANY($2) AND project_id IS NOT NULL`,
      [source, missing],
    );
    for (const r of rows) map.set(r.external_id as string, r.project_id as string);
  }
  return map;
}

async function upsertPeople(
  pool: pg.Pool,
  people: { extId: string; person: RawPerson }[],
  idByExt: Map<string, string>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const { extId, person } of people) {
    const projectId = idByExt.get(extId) ?? null;

    const { rows: existing } = await pool.query(
      `SELECT id FROM people
       WHERE name = $1 AND project_id IS NOT DISTINCT FROM $2 AND email IS NOT DISTINCT FROM $3
       LIMIT 1`,
      [person.name, projectId, person.email ?? null],
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO people (id, project_id, name, title, linkedin, email, telegram, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)`,
      [randomUUID(), projectId, person.name, person.title ?? null, person.linkedin ?? null, person.email ?? null, person.telegram ?? null],
    );
    inserted++;
  }

  return { inserted, skipped };
}

function printHelp() {
  console.log(`
LCX Seed Import — stage CSV/XLSX sources into the canonical projects table.

Usage:
  npx tsx src/seed/index.ts [data-dir]

Environment:
  DATABASE_URL   Postgres connection string (default: local docker-compose)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
