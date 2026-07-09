/**
 * seed CLI — full import pipeline: read → normalize → dedupe → upsert.
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
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { normalizeAll, dedupeBatch, buildReport } from '../import/import.js';
import type { ImportReport } from '../import/import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../../../');
const DEFAULT_DATA_DIR = resolve(PROJECT_ROOT, 'data/seeds');

function formatReport(r: ImportReport['jobs'][0]): string {
  const icon = r.normalized > 0 ? '✓' : '—';
  return `  ${icon} ${r.label.padEnd(22)} ${r.rawRows} rows → ${r.normalized} projects`;
}

function formatDedupeGroup(g: ReturnType<typeof dedupeBatch>['groups'][0]): string {
  const names = g.projects.map((p: { name: string; source: string }) => `${p.name} (${p.source})`).join(', ');
  return `    [${g.confidence}] ${names}`;
}

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

  // 1. Read + Normalize all sources
  console.log('📖 Reading seed files...');
  const { allProjects, allPeople, reports } = await normalizeAll(dataDir);

  const totalRows = reports.reduce((s: number, r: ImportReport['jobs'][0]) => s + r.rawRows, 0);
  const activeSources = reports.filter((r: ImportReport['jobs'][0]) => r.normalized > 0).length;
  console.log(`  Parsed ${totalRows} rows across ${activeSources} sources`);
  for (const r of reports) console.log(formatReport(r));

  if (allProjects.length === 0) {
    console.log('\n⚠ No projects to import. Check data-dir or file names.\n');
    process.exit(0);
  }

  // 2. Dedupe
  console.log('\n🔗 Deduplicating...');
  const dedupeResult = dedupeBatch(allProjects);
  const report = buildReport(reports, dedupeResult);

  console.log(`  ${report.dedupe.inputProjects} raw → ${report.total.projects} canonical`);
  console.log(`  ${report.dedupe.groups} merge groups, ${report.dedupe.singletons} singletons`);
  console.log(`  Merge rate: ${report.dedupe.mergeRate}%`);

  if (report.dedupe.groups > 0) {
    console.log('\n  Merge groups:');
    for (const g of dedupeResult.groups.slice(0, 10)) console.log(formatDedupeGroup(g));
    if (dedupeResult.groups.length > 10) {
      console.log(`    ... and ${dedupeResult.groups.length - 10} more`);
    }
  }

  // 3. Connect DB + insert
  console.log('\n💾 Writing to database...');
  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });

  try {
    await pool.query('SELECT 1');
    console.log('  DB connection OK');

    const allCanonical = [
      ...dedupeResult.groups.map((g) => g.canonical),
      ...dedupeResult.singletons.map((g) => g.canonical),
    ];

    let inserted = 0;
    let updated = 0;
    for (const p of allCanonical) {
      const pid = randomUUID();

      if (p.esmaTokenId) {
        const existing = await db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(sql`${schema.projects.esmaTokenId} = ${p.esmaTokenId}`)
          .limit(1)
          .execute();

        if (existing.length > 0) {
          await db
            .update(schema.projects)
            .set({
              name: p.name,
              website: p.website ?? null,
              ticker: p.ticker ?? null,
              chain: p.chain ?? null,
              source: p.source,
              dti: p.dti ?? null,
              jurisdiction: p.jurisdiction ?? null,
              whitepaperUrl: p.whitepaperUrl ?? null,
              category: p.category ?? null,
              marketCap: p.marketCap ?? null,
              listedOnLcx: p.listedOnLcx,
              raw: p.rawPayload,
              updatedAt: new Date(),
            })
            .where(sql`${schema.projects.id} = ${existing[0].id}`)
            .execute();
          updated++;
          continue;
        }
      }

      await db
        .insert(schema.projects)
        .values({
          id: pid,
          name: p.name,
          website: p.website ?? null,
          ticker: p.ticker ?? null,
          chain: p.chain ?? null,
          source: p.source,
          esmaTokenId: p.esmaTokenId ?? null,
          dti: p.dti ?? null,
          jurisdiction: p.jurisdiction ?? null,
          whitepaperUrl: p.whitepaperUrl ?? null,
          category: p.category ?? null,
          marketCap: p.marketCap ?? null,
          listedOnLcx: p.listedOnLcx,
          raw: p.rawPayload,
        })
        .execute();
      inserted++;
    }
    console.log(`  ${inserted} inserted, ${updated} updated`);

    // Insert people
    let peopleInserted = 0;
    for (const { person } of allPeople) {
      await db
        .insert(schema.people)
        .values({
          id: randomUUID(),
          name: person.name,
          title: person.title ?? null,
          linkedin: person.linkedin ?? null,
          email: person.email ?? null,
          telegram: person.telegram ?? null,
          raw: {},
        })
        .execute();
      peopleInserted++;
    }
    console.log(`  ${peopleInserted} people inserted`);

    // Audit
    await db.insert(schema.auditLog).values({
      id: randomUUID(),
      actor: 'seed',
      action: 'seed_import',
      entity: 'project',
      meta: {
        report: {
          totalProjects: report.total.projects,
          totalPeople: report.total.people,
          mergeRate: report.dedupe.mergeRate,
          sources: reports.map((r: ImportReport['jobs'][0]) => ({
            source: r.source,
            rows: r.rawRows,
            normalized: r.normalized,
            errors: r.errors.length,
          })),
        },
      },
    });

    console.log(`\n✅ Seed import complete.\n`);
    console.log(`  ${inserted} total projects inserted into DB`);
    console.log(`  ${peopleInserted} people inserted`);
    console.log(`  ${report.total.projects} unique canonical projects\n`);
  } finally {
    await pool.end();
  }
}

function printHelp() {
  console.log(`
Usage: seed [data-dir]

  Import all CSV/XLSX seed files from <data-dir> into the database.

  Required files in data-dir:
    ESMA_MiCA_Main_Leads.csv
    ESMA_MiCA_CASPs.csv
    ESMA_MiCA_EMT_Issuers.csv
    potential - token listing - lcx.xlsx
    Pre TGE tokens  - Sheet1.csv
    LCX Listings - Pipeline.csv
    LCX Listings - Closed Token Listings.csv
    top_100_crypto_projects_lcx_outreach.csv

  Default data-dir: ${DEFAULT_DATA_DIR}

  Requires DATABASE_URL env (default: postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales)
`);
}

main();
