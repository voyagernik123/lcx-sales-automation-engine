/**
 * One-time cleanup after the closed.ts normalizer fix: the old importer read
 * the wrong CSV column and created won-deal projects named like "$ZIG".
 * After re-seeding (which creates correctly-named rows mapped in
 * project_sources), this deletes the orphaned ticker-named originals.
 *
 * Usage: DATABASE_URL=... npx tsx src/seed/cleanup-closed.ts [--apply]
 * Without --apply it only reports what would be deleted.
 */
import pg from 'pg';

async function main() {
  const apply = process.argv.includes('--apply');
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });

  console.log(`\nClosed-source cleanup (${dbUrl.replace(/\/\/.*@/, '//***@')}) — ${apply ? 'APPLY' : 'dry run'}\n`);

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.ticker,
            (SELECT COUNT(*) FROM deals d WHERE d.project_id = p.id) AS deals,
            (SELECT COUNT(*) FROM outreach_sequences os WHERE os.project_id = p.id) AS sequences
     FROM projects p
     WHERE p.source = 'closed'
       AND p.id NOT IN (
         SELECT project_id FROM project_sources
         WHERE source = 'closed' AND project_id IS NOT NULL
       )
     ORDER BY p.name`,
  );

  if (rows.length === 0) {
    console.log('  Nothing to clean.\n');
    await pool.end();
    return;
  }

  for (const r of rows) {
    const guard = Number(r.deals) > 0 || Number(r.sequences) > 0 ? '  [SKIP: has deals/sequences]' : '';
    console.log(`  ${String(r.name).padEnd(24)} ${r.id}${guard}`);
  }

  const deletable = rows.filter((r) => Number(r.deals) === 0 && Number(r.sequences) === 0);
  console.log(`\n  ${rows.length} orphaned closed rows, ${deletable.length} safe to delete`);

  if (apply && deletable.length > 0) {
    const ids = deletable.map((r) => r.id as string);
    await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [ids]);
    console.log(`  Deleted ${ids.length} rows (scores/signals/people cascade).\n`);
  } else if (!apply) {
    console.log(`  Re-run with --apply to delete.\n`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
