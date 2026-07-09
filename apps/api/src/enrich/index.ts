import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { CoinGeckoClient, enrichBatch, enrichProject, formatEnrichmentReport } from '@lcx/shared';
import type { EnrichableProject, EnrichmentOutput } from '@lcx/shared';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const cgApiKey = process.env.COINGECKO_API_KEY;
  const cgKeyType = process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' as const : 'demo' as const;

  console.log(`\nLCX Sales Automation Engine — Enrichment CLI\n`);
  console.log(`  Database: ${dbUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log(`  CoinGecko: ${cgApiKey ? `API key set (${cgKeyType})` : 'keyless (public rate limits)'}\n`);

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });
  const cg = new CoinGeckoClient({ apiKey: cgApiKey, keyType: cgKeyType });

  try {
    await pool.query('SELECT 1');
    console.log('  DB connection OK\n');

    if (command === 'all' || command === 'batch') {
      await enrichAll(db, cg);
    } else if (command === 'project' && args[1]) {
      await enrichOne(db, cg, args[1]);
    } else {
      console.log('Unknown command. Use --help for usage.\n');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

async function fetchEnrichableProjects(db: ReturnType<typeof drizzle>): Promise<EnrichableProject[]> {
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      ticker: schema.projects.ticker,
      marketCap: schema.projects.marketCap,
      raw: schema.projects.raw,
    })
    .from(schema.projects)
    .execute();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ticker: r.ticker ?? undefined,
    marketCap: r.marketCap ?? undefined,
    raw: (r.raw ?? {}) as Record<string, unknown>,
  }));
}

async function persistEnrichment(
  db: ReturnType<typeof drizzle>,
  output: EnrichmentOutput,
) {
  const projectId = output.projectId;

  // Update raw._enrichment metadata on project
  const existing = await db
    .select({ raw: schema.projects.raw })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${projectId}`)
    .limit(1)
    .execute();

  const currentRaw = (existing[0]?.raw || {}) as Record<string, unknown>;
  const enrichMeta: Record<string, unknown> = {
    ...((currentRaw._enrichment || {}) as Record<string, unknown>),
    lastRunAt: new Date().toISOString(),
    coinId: output.coinId,
  };

  if (output.error) {
    const current = enrichMeta;
    enrichMeta.lastError = output.error;
    enrichMeta.errorCount = ((current.errorCount as number) || 0) + 1;
  } else {
    enrichMeta.lastError = null;
    enrichMeta.errorCount = 0;
  }

  await db
    .update(schema.projects)
    .set({
      raw: { ...currentRaw, _enrichment: enrichMeta },
      updatedAt: new Date(),
    })
    .where(sql`${schema.projects.id} = ${projectId}`)
    .execute();

  // Insert signals
  for (const signal of output.signals) {
    await db
      .insert(schema.signals)
      .values({
        id: randomUUID(),
        projectId,
        kind: signal.kind,
        payload: signal.payload as Record<string, unknown>,
      })
      .execute();
  }
}

async function enrichAll(db: ReturnType<typeof drizzle>, cg: CoinGeckoClient) {
  console.log('Loading projects...\n');
  const projects = await fetchEnrichableProjects(db);
  console.log(`  Loaded ${projects.length} projects\n`);

  let completed = 0;
  let matchCount = 0;

  const onProgress = (_done: number, _total: number, result: EnrichmentOutput) => {
    completed++;
    if (result.matched) matchCount++;
    if (result.error) console.error(`  Error [${completed}/${projects.length}]: ${result.projectId} — ${result.error}`);
    if (completed % 100 === 0 || completed === projects.length) {
      console.log(`  Progress: ${completed}/${projects.length} (matched: ${matchCount})`);
    }
  };

  const { report } = await enrichBatch(projects, cg, async (done, total, result) => {
    onProgress(done, total, result);
    if (result.signals.length > 0 || result.error) {
      await persistEnrichment(db, result);
    }
  });

  console.log(`\nEnrichment complete.\n`);
  console.log(formatEnrichmentReport(report));
  console.log();
}

async function enrichOne(db: ReturnType<typeof drizzle>, cg: CoinGeckoClient, projectId: string) {
  console.log(`Enriching project ${projectId}...\n`);

  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      ticker: schema.projects.ticker,
      marketCap: schema.projects.marketCap,
      raw: schema.projects.raw,
    })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${projectId}`)
    .limit(1)
    .execute();

  if (rows.length === 0) {
    console.log(`  Project not found.\n`);
    process.exit(1);
  }

  const r = rows[0];
  const project: EnrichableProject = {
    id: r.id,
    name: r.name,
    ticker: r.ticker ?? undefined,
    marketCap: r.marketCap ?? undefined,
    raw: (r.raw ?? {}) as Record<string, unknown>,
  };

  const result = await enrichProject(project, cg);

  if (result.matched && result.marketData) {
    console.log(`  Project:   ${r.name}`);
    console.log(`  CoinGecko: ${result.coinId} (${result.marketData.symbol})`);
    console.log(`  Rank:      ${result.marketData.marketCapRank ?? 'N/A'}`);
    console.log(`  Market Cap: $${(result.marketData.marketCap ?? 0).toLocaleString()}`);
    console.log(`  Volume 24h: $${(result.marketData.totalVolume ?? 0).toLocaleString()}`);
    console.log(`  Price:     $${result.marketData.currentPrice ?? 'N/A'}`);
    console.log(`  24h Change: ${result.marketData.priceChangePercent24h?.toFixed(2) ?? 'N/A'}%`);
    console.log(`  Categories: ${result.marketData.categories.slice(0, 5).join(', ') || 'none'}`);
    console.log(`  Signals:   ${result.signals.length}`);
  } else if (result.error) {
    console.log(`  Error: ${result.error}`);
  } else {
    console.log(`  No match found for ${r.name} (ticker: ${r.ticker || 'none'})`);
  }

  await persistEnrichment(db, result);

  console.log('\nEnrichment saved.\n');
}

function printHelp() {
  console.log(`
Usage: enrich <command> [args]

Commands:
  all / batch                 Enrich all projects with tickers
  project <id>                Enrich a single project by ID

Environment:
  DATABASE_URL       Postgres connection string (default: local dev)
  COINGECKO_API_KEY  Optional CoinGecko API key for higher rate limits
`);
}

main();
