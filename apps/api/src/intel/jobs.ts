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
        const resolved = await resolveCoinpaprikaIds(pool);
        const defillama = await collectDefillama(pool);
        const coinpaprika = await collectCoinpaprikaDetail(pool, cp);
        const github = await collectGithub(pool, gh);
        return { stats: { resolved, defillama, coinpaprika, github } };
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
    case 'alpha': {
      const { computeAlpha } = await import('./alpha.js');
      const { scanIndications } = await import('./iw.js');
      const { computeCalibration } = await import('./calibration.js');
      return withJobRun(pool, job, async () => {
        const scores = await computeAlpha(pool);
        const indications = await scanIndications(pool);
        const calibration = await computeCalibration(pool);
        return { stats: { scores, indications, calibration: { snapshotted: calibration.snapshotted } } };
      });
    }
  }
}
