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
 *   kpi_snapshot         daily  — persist today's KPI dashboard numbers (+ forecast)
 *   signals_prune        weekly — bound the signals table
 *   exchange_sync        daily  — competitive exchange listings for top-priority projects
 *   weekly_digest        weekly — one in-app digest notification (risk/handoffs/stalled)
 *
 * Env: DATABASE_URL (required for remote), COINGECKO_API_KEY, COINGECKO_KEY_TYPE
 */
import pg from 'pg';
import { withJobRun } from './withJobRun.js';
import { syncUniverse, discoverNewTokens } from '../connectors/universe.js';
import { refreshMarketData } from '../enrich/refresh.js';
import { pruneSignals } from '../enrich/prune.js';
import { syncExchangeListings } from '../enrich/exchanges.js';
import { evaluateAlertRules } from '../notifications/service.js';
import { generateStalledDealTasks } from '../tasks/service.js';
import { refreshNews } from '../connectors/news.js';
import { refreshAnomalies } from '../analytics/anomaly.js';

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
      case 'exchange_sync': {
        const r = await withJobRun(pool, job, async () => {
          const res = await syncExchangeListings(pool, cgOpts);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'daily_rules': {
        const r = await withJobRun(pool, job, async () => {
          const alerts = await evaluateAlertRules(pool);
          const stalledTasks = await generateStalledDealTasks(pool);
          return { stats: { ...alerts, stalledTasks } };
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
      case 'news_refresh': {
        const r = await withJobRun(pool, job, async () => {
          const res = await refreshNews(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'anomaly_scan': {
        const r = await withJobRun(pool, job, async () => {
          const res = await refreshAnomalies(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'weekly_digest': {
        const { runWeeklyDigest } = await import('../notifications/digest.js');
        const r = await withJobRun(pool, job, async () => {
          const res = await runWeeklyDigest(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'backfill_observations':
      case 'resolve_identifiers': {
        const { runIntelJob } = await import('../intel/jobs.js');
        const r = await runIntelJob(pool, job, {});
        console.log(JSON.stringify(r.stats, null, 2));
        break;
      }
      case 'collect_defillama': {
        const { collectDefillama } = await import('../connectors/defillama.js');
        const r = await withJobRun(pool, job, async () => {
          const res = await collectDefillama(pool);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'collect_coinpaprika': {
        const { collectCoinpaprikaDetail } = await import('../connectors/coinpaprikaDetail.js');
        const n = Number(process.argv[3] ?? 60) || 60;
        const r = await withJobRun(pool, job, async () => {
          const res = await collectCoinpaprikaDetail(pool, n);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      case 'collect_github': {
        const { collectGithub } = await import('../connectors/github.js');
        const n = Number(process.argv[3] ?? 40) || 40;
        const r = await withJobRun(pool, job, async () => {
          const res = await collectGithub(pool, n);
          return { stats: res as unknown as Record<string, unknown> };
        });
        console.log(JSON.stringify(r.stats));
        break;
      }
      // The intel collect/derive jobs share one implementation with the HTTP
      // trigger (intel/jobs.ts) so the pipeline can't drift between CLI and cron.
      // `collect` reads optional CoinPaprika/GitHub batch caps from argv[3]/[4].
      case 'collect':
      case 'compute_alpha':
      case 'scan_iw':
      case 'alpha':
      case 'catalog_sync':
      case 'calibrate': {
        const { runIntelJob } = await import('../intel/jobs.js');
        const r = await runIntelJob(pool, job, {
          coinpaprika: Number(process.argv[3] ?? 60) || 60,
          github: Number(process.argv[4] ?? 40) || 40,
        });
        console.log(JSON.stringify(r.stats, null, 2));
        break;
      }
      default:
        console.error(`Unknown job: ${job}`);
        console.error('Jobs: universe_sync | discover_new_tokens | market_refresh | score_refresh | kpi_snapshot | signals_prune | exchange_sync | daily_rules | news_refresh | anomaly_scan | weekly_digest | backfill_observations | resolve_identifiers | collect_defillama | collect_coinpaprika | collect_github | collect | compute_alpha | scan_iw | alpha | calibrate | catalog_sync');
        process.exit(1);
    }
  } finally {
    await pool.end();
    // Some services (kpi snapshot, notifications) use the app-level pool via
    // getDb() — close it too so the process exits promptly.
    const { closeDb } = await import('../db/index.js');
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
