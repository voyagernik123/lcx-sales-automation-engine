/**
 * Signals prune — keeps the signals table bounded:
 *   - enrichment/price_movement signals older than 90 days are deleted
 *   - beyond that, only the newest 20 per (project, kind) survive
 * Other signal kinds are never touched.
 *
 * Usage: DATABASE_URL=... npx tsx src/enrich/prune.ts
 */
import pg from 'pg';

const PRUNED_KINDS = ['enrichment', 'price_movement'];
const MAX_AGE_DAYS = 90;
const KEEP_PER_PROJECT = 20;

export async function pruneSignals(pool: pg.Pool): Promise<{ byAge: number; byCount: number }> {
  const { rowCount: byAge } = await pool.query(
    `DELETE FROM signals
     WHERE kind = ANY($1) AND observed_at < NOW() - ($2 || ' days')::interval`,
    [PRUNED_KINDS, MAX_AGE_DAYS],
  );

  const { rowCount: byCount } = await pool.query(
    `DELETE FROM signals WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY project_id, kind ORDER BY observed_at DESC
         ) AS rn
         FROM signals WHERE kind = ANY($1)
       ) ranked WHERE rn > $2
     )`,
    [PRUNED_KINDS, KEEP_PER_PROJECT],
  );

  return { byAge: byAge ?? 0, byCount: byCount ?? 0 };
}

const isMain = process.argv[1]?.endsWith('prune.ts') || process.argv[1]?.endsWith('prune.js');
if (isMain) {
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  pruneSignals(pool)
    .then((r) => {
      console.log(`Pruned ${r.byAge} by age, ${r.byCount} by per-project cap.`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
