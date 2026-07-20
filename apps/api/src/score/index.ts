import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { scoreProject } from '@lcx/shared';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

  console.log(`\nLCX Sales Automation Engine — Scoring CLI\n`);
  console.log(`  Database: ${dbUrl.replace(/\/\/.*@/, '//***@')}\n`);

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });

  try {
    await pool.query('SELECT 1');
    console.log('  DB connection OK\n');

    if (command === 'all') {
      const { scoreAllPaged } = await import('./batch.js');
      const report = await scoreAllPaged(pool);
      console.log(`  Scored ${report.scored} projects in ${report.pages} pages (${report.errors} errors)\n`);
      console.log('  Band distribution:');
      for (const [band, n] of Object.entries(report.bands).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${band}: ${n}`);
      }
      console.log('\nScore all complete.');
    } else if (command === 'all-legacy') {
      await scoreAll(db);
    } else if (command === 'project' && args[1]) {
      await scoreOne(db, args[1]);
    } else {
      console.log('Unknown command. Use --help for usage.\n');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

async function fetchProjectData(db: ReturnType<typeof drizzle>, projectIds?: string[]) {
  let projectRows: { rows?: Record<string, unknown>[] };

  if (projectIds && projectIds.length === 1) {
    projectRows = await db.execute(sql`
      SELECT
        p.id, p.name, p.website, p.ticker, p.chain,
        p.source, p.esma_token_id, p.dti, p.jurisdiction,
        p.whitepaper_url, p.category, p.market_cap, p.listed_on_lcx
      FROM projects p
      WHERE p.id = ${projectIds[0]}
      ORDER BY p.name
    `);
  } else if (projectIds && projectIds.length > 1) {
    const idArray = sql.join(
      projectIds.map((id) => sql`${id}::uuid`),
      sql.raw(', '),
    );
    projectRows = await db.execute(sql`
      SELECT
        p.id, p.name, p.website, p.ticker, p.chain,
        p.source, p.esma_token_id, p.dti, p.jurisdiction,
        p.whitepaper_url, p.category, p.market_cap, p.listed_on_lcx
      FROM projects p
      WHERE p.id = ANY(ARRAY[${idArray}])
      ORDER BY p.name
    `);
  } else {
    projectRows = await db.execute(sql`
      SELECT
        p.id, p.name, p.website, p.ticker, p.chain,
        p.source, p.esma_token_id, p.dti, p.jurisdiction,
        p.whitepaper_url, p.category, p.market_cap, p.listed_on_lcx
      FROM projects p
      WHERE p.tier = 'tracked'
      ORDER BY p.name
    `);
  }

  const projectList = (projectRows.rows ?? []) as Record<string, unknown>[];

  const ids = projectList.map((r) => r.id as string);
  if (ids.length === 0) return [];

  // Batch in chunks of 500 to avoid Postgres ROW limit (max 1664)
  const CHUNK = 500;
  const peopleByProject = new Map<string, Record<string, unknown>[]>();
  const signalsByProject = new Map<string, Record<string, unknown>[]>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const idArray = sql.join(
      chunk.map((id) => sql`${id}::uuid`),
      sql.raw(', '),
    );
    const [peopleChunk, signalChunk] = await Promise.all([
      db.execute(sql`
        SELECT project_id, name, email, telegram, linkedin
        FROM people
        WHERE project_id = ANY(ARRAY[${idArray}])
      `),
      db.execute(sql`
        SELECT project_id, kind, payload
        FROM signals
        WHERE project_id = ANY(ARRAY[${idArray}])
      `),
    ]);

    for (const row of (peopleChunk.rows ?? []) as Record<string, unknown>[]) {
      const pid = row.project_id as string;
      if (!peopleByProject.has(pid)) peopleByProject.set(pid, []);
      peopleByProject.get(pid)!.push(row);
    }
    for (const row of (signalChunk.rows ?? []) as Record<string, unknown>[]) {
      const pid = row.project_id as string;
      if (!signalsByProject.has(pid)) signalsByProject.set(pid, []);
      signalsByProject.get(pid)!.push(row);
    }
  }

  return projectList.map((p) => ({
    dbProject: p,
    contacts: (peopleByProject.get(p.id as string) || []).map((c) => ({
      name: c.name as string | undefined,
      email: c.email as string | undefined,
      telegram: c.telegram as string | undefined,
      linkedin: c.linkedin as string | undefined,
    })),
    signals: (signalsByProject.get(p.id as string) || []).map((s) => ({
      kind: s.kind as string,
      payload: (s.payload || {}) as Record<string, unknown>,
    })),
  }));
}

async function scoreAll(db: ReturnType<typeof drizzle>) {
  console.log('Scoring all projects...\n');

  const data = await fetchProjectData(db);
  console.log(`  Loaded ${data.length} projects\n`);

  let scored = 0;
  let errors = 0;
  const bandCounts: Record<string, number> = {};

  for (const item of data) {
    try {
      const p = item.dbProject;
      const result = scoreProject(
        {
          name: p.name as string,
          website: (p.website as string) || undefined,
          ticker: (p.ticker as string) || undefined,
          chain: (p.chain as string) || undefined,
          jurisdiction: (p.jurisdiction as string) || undefined,
          whitepaperUrl: (p.whitepaper_url as string) || undefined,
          category: (p.category as string) || undefined,
          marketCap: (p.market_cap as string) || undefined,
          source: p.source as string,
          esmaTokenId: (p.esma_token_id as string) || undefined,
          dti: (p.dti as string) || undefined,
          listedOnLcx: p.listed_on_lcx === true,
        },
        item.contacts,
        item.signals,
      );

      const existing = await db
        .select({ id: schema.scores.id })
        .from(schema.scores)
        .where(sql`${schema.scores.projectId} = ${p.id}`)
        .limit(1)
        .execute();

      const scoreValues = {
        euScore: result.euScore,
        usPreScore: result.usPreScore,
        usPostScore: result.usPostScore,
        band: result.band,
        reasons: result.reasons as unknown as Record<string, unknown>[],
        recommendedMarket: result.recommendedMarket,
        usIntelSignals: (result.usIntelSignals ?? {}) as Record<string, unknown>,
        computedAt: new Date(result.computedAt),
      };

      if (existing.length > 0) {
        await db
          .update(schema.scores)
          .set(scoreValues)
          .where(sql`${schema.scores.id} = ${existing[0].id}`)
          .execute();
      } else {
        await db
          .insert(schema.scores)
          .values({
            id: randomUUID(),
            projectId: p.id as string,
            ...scoreValues,
          })
          .execute();
      }

      scored++;
      bandCounts[result.band] = (bandCounts[result.band] || 0) + 1;
    } catch (err) {
      console.error(`  Error scoring ${item.dbProject.name}:`, err);
      errors++;
    }
  }

  console.log(`  Scored: ${scored}`);
  console.log(`  Errors: ${errors}`);
  console.log('\n  Band distribution:');
  for (const [band, count] of Object.entries(bandCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${band}: ${count}`);
  }
  console.log('\nScore all complete.\n');
}

async function scoreOne(db: ReturnType<typeof drizzle>, projectId: string) {
  console.log(`Scoring project ${projectId}...\n`);

  const data = await fetchProjectData(db, [projectId]);
  if (data.length === 0) {
    console.log(`  Project ${projectId} not found.\n`);
    process.exit(1);
  }

  const item = data[0];
  const p = item.dbProject;

  const result = scoreProject(
    {
      name: p.name as string,
      website: (p.website as string) || undefined,
      ticker: (p.ticker as string) || undefined,
      chain: (p.chain as string) || undefined,
      jurisdiction: (p.jurisdiction as string) || undefined,
      whitepaperUrl: (p.whitepaper_url as string) || undefined,
      category: (p.category as string) || undefined,
      marketCap: (p.market_cap as string) || undefined,
      source: p.source as string,
      esmaTokenId: (p.esma_token_id as string) || undefined,
      dti: (p.dti as string) || undefined,
      listedOnLcx: p.listed_on_lcx === true,
    },
    item.contacts,
    item.signals,
  );

  console.log(`  Project: ${p.name}`);
  console.log(`  EU Score:    ${result.euScore}/100 (${result.band})`);
  console.log(`  US Pre:      ${result.usPreScore}/100`);
  console.log(`  US Post:     ${result.usPostScore}/100`);
  console.log(`  Band:        ${result.band}`);
  console.log(`  Red-flagged: ${result.redFlag.flagged}`);
  console.log(`\n  Reasons:`);
  for (const r of result.reasons) {
    const sign = r.points >= 0 ? '+' : '';
    console.log(`    ${r.code}: ${sign}${r.points}/${r.max} — ${r.note}`);
  }
  console.log();
}

function printHelp() {
  console.log(`
Usage: score <command> [args]

Commands:
  all                         Score all projects
  project <id>                Score a single project by ID

Requires DATABASE_URL env (default: postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales)
`);
}

main();
