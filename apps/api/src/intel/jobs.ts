/**
 * Intel job registry — the single source of truth for the free-data collection
 * pipeline, callable from BOTH the CLI (jobs/cli.ts) and the HTTP trigger
 * (POST /v1/intel/jobs/:job, used by cron). Each job is wrapped in withJobRun,
 * which holds a per-job advisory lock (no overlapping runs) and records a
 * job_runs row the Ops Health page reads.
 */
import type pg from 'pg';
import { withJobRun, type JobOutcome } from '../jobs/withJobRun.js';

/**
 * The jobs the intelligence apparatus runs, in dependency order:
 *  - backfill_observations: seed observations from existing project columns (no
 *    external calls) — the fastest way to give the models baseline data.
 *  - resolve_identifiers: map projects → CoinPaprika ids (feeds collect).
 *  - collect: the free sensors — DefiLlama (bulk) + bounded CoinPaprika + GitHub.
 *  - compute_alpha / scan_iw / calibrate: derive scores, I&W, calibration.
 *  - alpha: the full derive pass (compute_alpha + scan_iw + calibrate).
 */
export const INTEL_JOBS = [
  'backfill_observations',
  'resolve_identifiers',
  'collect',
  'compute_alpha',
  'scan_iw',
  'calibrate',
  'alpha',
  // Universe breadth: pull the free-source token catalog to 50k+ lean identity
  // rows. Runs through the same trigger/lock/job_runs machinery as the sensors.
  'catalog_sync',
  // Deception detection (Phase 2.4) — wash-trading flags that poison conviction.
  'deception_scan',
  // Object monitors (Phase 3.1) — evaluate standing watches, fire governed actions.
  'monitors_tick',
] as const;
export type IntelJob = (typeof INTEL_JOBS)[number];

export function isIntelJob(job: string): job is IntelJob {
  return (INTEL_JOBS as readonly string[]).includes(job);
}

export interface IntelJobOpts {
  /** Max CoinPaprika detail targets per collect (free-tier friendly). */
  coinpaprika?: number;
  /** Max GitHub repos per collect (respects the 60/hr unauth ceiling). */
  github?: number;
}

const asStats = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

/**
 * Run one intel job by name against `pool`. Returns the JobOutcome (stats).
 * Throws if the job's advisory lock is already held (a run is in flight).
 */
export async function runIntelJob(pool: pg.Pool, job: IntelJob, opts: IntelJobOpts = {}): Promise<JobOutcome> {
  const cp = opts.coinpaprika ?? 60;
  const gh = opts.github ?? 40;

  switch (job) {
    case 'backfill_observations': {
      const { backfillObservations } = await import('./backfill.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await backfillObservations(pool)) }));
    }
    case 'resolve_identifiers': {
      const { resolveCoinpaprikaIds } = await import('./identifiers.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await resolveCoinpaprikaIds(pool)) }));
    }
    case 'collect': {
      const { resolveCoinpaprikaIds } = await import('./identifiers.js');
      const { collectDefillama } = await import('../connectors/defillama.js');
      const { collectCoinpaprikaDetail } = await import('../connectors/coinpaprikaDetail.js');
      const { collectGithub } = await import('../connectors/github.js');
      return withJobRun(pool, job, async () => {
        // Each source is isolated: a transient failure in one (e.g. a dropped
        // DefiLlama bulk download) must not abort the others. The per-source
        // outcome — result or error — lands in stats, and Ops freshness shows
        // the real coverage either way.
        const stats: Record<string, unknown> = {};
        const step = async (name: string, fn: () => Promise<unknown>) => {
          try {
            stats[name] = await fn();
          } catch (err) {
            stats[name] = { error: err instanceof Error ? err.message : String(err) };
          }
        };
        await step('resolved', () => resolveCoinpaprikaIds(pool));
        await step('defillama', () => collectDefillama(pool));
        await step('coinpaprika', () => collectCoinpaprikaDetail(pool, cp));
        await step('github', () => collectGithub(pool, gh));
        return { stats };
      });
    }
    case 'compute_alpha': {
      const { computeAlpha } = await import('./alpha.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await computeAlpha(pool)) }));
    }
    case 'scan_iw': {
      const { scanIndications } = await import('./iw.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await scanIndications(pool)) }));
    }
    case 'calibrate': {
      const { computeCalibration } = await import('./calibration.js');
      return withJobRun(pool, job, async () => {
        const res = await computeCalibration(pool);
        return { stats: { snapshotted: res.snapshotted, metrics: res.metrics.map((m) => ({ k: m.metricKey, lift: m.lift, verdict: m.verdict })) } };
      });
    }
    case 'deception_scan': {
      const { detectWashTrading } = await import('./deception.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await detectWashTrading(pool)) }));
    }
    case 'monitors_tick': {
      const { evaluateMonitors } = await import('./monitors.js');
      return withJobRun(pool, job, async () => ({ stats: asStats(await evaluateMonitors(pool)) }));
    }
    case 'alpha': {
      const { computeAlpha } = await import('./alpha.js');
      const { scanIndications } = await import('./iw.js');
      const { computeCalibration } = await import('./calibration.js');
      const { detectWashTrading } = await import('./deception.js');
      return withJobRun(pool, job, async () => {
        // Deception first so wash-trading flags are in place before conviction.
        const deception = await detectWashTrading(pool);
        const scores = await computeAlpha(pool);
        const indications = await scanIndications(pool);
        const calibration = await computeCalibration(pool);
        return { stats: { deception, scores, indications, calibration: { snapshotted: calibration.snapshotted } } };
      });
    }
    case 'catalog_sync': {
      const { syncCatalog } = await import('../connectors/catalog.js');
      return withJobRun(pool, job, async () => ({
        stats: asStats(
          await syncCatalog(pool, {
            coingeckoApiKey: process.env.COINGECKO_API_KEY,
            coingeckoKeyType: process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' : 'demo',
          }),
        ),
      }));
    }
  }
}
