/**
 * Batch job dispatcher — run from cron (GitHub Actions) or manually:
 *
 *   npx tsx src/jobs/cli.ts <job>
 *
 * Jobs:
 *   universe_sync        weekly — CoinPaprika tickers, DefiLlama protocols+raises, CG id list
 *   discover_new_tokens  daily  — GeckoTerminal new pools
 *   market_refresh       daily  — CG bulk markets + paprika staged → typed columns
 *   score_refresh        daily  — paged batch re-score of every project
 *   kpi_snapshot         daily  — persist today's KPI dashboard numbers
 *   signals_prune        weekly — bound the signals table
 *
 * Env: DATABASE_URL (required for remote), COINGECKO_API_KEY, COINGECKO_KEY_TYPE
 */
import pg from 'pg';
import { withJobRun } from './withJobRun.js';
import { syncUniverse, discoverNewTokens } from '../connectors/universe.js';
import { refreshMarketData } from '../enrich/refresh.js';
import { pruneSignals } from '../enrich/prune.js';

async function main() {
  const job = process.argv[2];
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });

  const cgOpts = {
    coingeckoApiKey: process.env.COINGECKO_API_KEY,
    coingeckoKeyType: (process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' : 'demo') as 'demo' | 'pro',
  };

  console.log(`\n[jobs] ${job} — ${dbUrl.replace(/\/\/.*@/, '//***@')}\n`);

  try {
    switch (job) {
      case 'universe_sync': {
        const r = await withJobRun(pool, job, async () => {
          const res = await syncUniverse(pool, cgOpts);
          return {
            stats: {
              connectors: res.reports.map((rep) => ({
                name: rep.connector, staged: rep.staged, changed: rep.changed,
                inserted: rep.inserted, attached: rep.attached, ignored: rep.ignored,
              })),
              raisesStaged: res.raisesStaged,
              externalIds: res.externalIdsUpserted,
            },
          };
        });
        console.log(JSON.stringify(r.stats, null, 2));
        break;
      }
      case 'discover_new_tokens': {
        const r = await withJobRun(pool, job, async () => {
          const rep = await discoverNewTokens(pool);
          return { stats: { staged: rep.staged, inserted: rep.inserted, ignored: rep.ignored } };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'market_refresh': {
        const r = await withJobRun(pool, job, async () => {
          const res = await refreshMarketData(pool, cgOpts);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'score_refresh': {
        const { scoreAllPaged } = await import('../score/batch.js');
        const r = await withJobRun(pool, job, async () => {
          const res = await scoreAllPaged(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'kpi_snapshot': {
        const { writeKpiSnapshot } = await import('../kpi/snapshot.js');
        const r = await withJobRun(pool, job, async () => {
          const res = await writeKpiSnapshot();
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'signals_prune': {
        const r = await withJobRun(pool, job, async () => {
          const res = await pruneSignals(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      default:
        console.error(`Unknown job: ${job}`);
        console.error('Jobs: universe_sync | discover_new_tokens | market_refresh | score_refresh | kpi_snapshot | signals_prune');
        process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
