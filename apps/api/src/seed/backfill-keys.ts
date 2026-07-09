/**
 * Backfill derived key columns added in migration 0009:
 *   name_key (squashEntity), domain (extractDomain), ticker_norm (cleanTicker),
 *   region (deriveRegion from jurisdiction).
 *
 * Idempotent — recomputes every row in pages and writes only changed values.
 *
 * Usage: DATABASE_URL=... npx tsx src/seed/backfill-keys.ts
 */
import pg from 'pg';
import { squashEntity } from '@lcx/shared';
import { extractDomain, cleanTicker } from '../import/types.js';
import { deriveRegion } from '../lib/region.js';

const PAGE = 1000;

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });

  console.log(`\nBackfilling derived keys (${dbUrl.replace(/\/\/.*@/, '//***@')})\n`);

  let offset = 0;
  let updated = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, name, website, ticker, jurisdiction, name_key, domain, ticker_norm, region
       FROM projects ORDER BY id LIMIT $1 OFFSET $2`,
      [PAGE, offset],
    );
    if (rows.length === 0) break;

    const changes: { id: string; nameKey: string | null; domain: string | null; tickerNorm: string | null; region: string | null }[] = [];
    for (const r of rows) {
      const nameKey = r.name ? squashEntity(r.name) || null : null;
      const domain = extractDomain(r.website ?? undefined) ?? null;
      const tickerNorm = cleanTicker(r.ticker ?? undefined) ?? null;
      const region = deriveRegion(r.jurisdiction);
      if (nameKey !== r.name_key || domain !== r.domain || tickerNorm !== r.ticker_norm || region !== r.region) {
        changes.push({ id: r.id, nameKey, domain, tickerNorm, region });
      }
    }

    if (changes.length > 0) {
      const values: unknown[] = [];
      const tuples = changes
        .map((c, i) => {
          const base = i * 5;
          values.push(c.id, c.nameKey, c.domain, c.tickerNorm, c.region);
          return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(', ');
      await pool.query(
        `UPDATE projects p SET name_key = v.name_key, domain = v.domain, ticker_norm = v.ticker_norm, region = v.region
         FROM (VALUES ${tuples}) AS v(id, name_key, domain, ticker_norm, region)
         WHERE p.id = v.id`,
        values,
      );
      updated += changes.length;
    }

    offset += rows.length;
    if (offset % 5000 === 0) console.log(`  ${offset} scanned, ${updated} updated`);
  }

  console.log(`\nDone: ${offset} scanned, ${updated} updated.\n`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
