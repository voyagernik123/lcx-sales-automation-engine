import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { DEFAULT_ORG_ID } from './observations.js';

/**
 * Calibration (Wave 6) — the measurement half of the learning loop. For each
 * score/signal, does it actually discriminate won deals from the universe?
 * We snapshot lift (won median ÷ universe median) and quintile-capture (share
 * of won deals in the top 20% by that metric) so the desk can see which signals
 * predict — and watch that sharpen (or decay) over time. With a small won
 * sample these are directional; auto-refitting weights waits until it matures.
 */

export interface MetricCalibration {
  metricKey: string;
  kind: 'score' | 'signal';
  lift: number | null;
  quintileCapture: number | null;
  wonMedian: number | null;
  universeMedian: number | null;
  sampleWon: number;
  sampleUniverse: number;
  verdict: 'predictive' | 'weak' | 'insufficient';
}

const SCORE_METRICS = ['conviction', 'listing_propensity', 'winnability', 'timing_window'];
const SIGNAL_METRICS = ['tvl_usd', 'github_commits_30d', 'market_cap_usd', 'priority_score'];

/**
 * Below this many won deals (with an observation for the metric), a median-ratio
 * "lift" is noise, not signal — one or two atypical wins swing it wildly. We saw
 * this live: at 3 wins prod showed conviction 0.41× "weak" and market-cap 170×
 * side by side. Hold the verdict at 'insufficient' until the sample is big enough
 * to be even directional. The loop promotes metrics to weak/predictive as deals
 * close and the count crosses this floor.
 */
const MIN_WON_SAMPLE = 8;

async function calibrateMetric(pool: pg.Pool, predicate: string, kind: 'score' | 'signal'): Promise<MetricCalibration> {
  const { rows } = await pool.query(
    `WITH m AS (
       SELECT DISTINCT ON (subject_id) subject_id, value_num AS v
       FROM observations WHERE predicate=$1 AND value_num IS NOT NULL ORDER BY subject_id, observed_at DESC),
     won AS (SELECT DISTINCT project_id::text AS pid FROM deals WHERE stage='won'),
     wonm AS (SELECT m.v FROM won JOIN m ON m.subject_id = won.pid),
     thr AS (SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY v) AS t FROM m)
     SELECT
       (SELECT count(*) FROM m) AS universe_n,
       (SELECT count(*) FROM wonm) AS won_n,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM m) AS universe_median,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM wonm) AS won_median,
       (SELECT count(*) FROM wonm, thr WHERE wonm.v >= thr.t) AS won_top`,
    [predicate],
  );
  const r = (rows ?? [])[0] as Record<string, unknown> | undefined;
  const universeN = Number(r?.universe_n ?? 0);
  const wonN = Number(r?.won_n ?? 0);
  const universeMedian = r?.universe_median != null ? Number(r.universe_median) : null;
  const wonMedian = r?.won_median != null ? Number(r.won_median) : null;
  const wonTop = Number(r?.won_top ?? 0);

  const lift = wonMedian != null && universeMedian ? Math.round((wonMedian / universeMedian) * 100) / 100 : null;
  const quintileCapture = wonN > 0 ? Math.round((wonTop / wonN) * 100) / 100 : null;
  const verdict: MetricCalibration['verdict'] =
    wonN < MIN_WON_SAMPLE ? 'insufficient' : lift != null && lift >= 1.3 ? 'predictive' : 'weak';

  return { metricKey: predicate, kind, lift, quintileCapture, wonMedian, universeMedian, sampleWon: wonN, sampleUniverse: universeN, verdict };
}

export async function computeCalibration(pool: pg.Pool): Promise<{ metrics: MetricCalibration[]; snapshotted: number }> {
  const metrics: MetricCalibration[] = [];
  for (const k of SCORE_METRICS) metrics.push(await calibrateMetric(pool, k, 'score'));
  for (const k of SIGNAL_METRICS) metrics.push(await calibrateMetric(pool, k, 'signal'));

  // Idempotent per day: clear today's snapshots, then re-insert.
  await pool.query(`DELETE FROM model_calibrations WHERE snapshot_date = CURRENT_DATE::text`);
  for (const m of metrics) {
    await pool.query(
      `INSERT INTO model_calibrations
         (org_id, metric_key, kind, lift, quintile_capture, won_median, universe_median, sample_won, sample_universe, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [DEFAULT_ORG_ID, m.metricKey, m.kind, m.lift, m.quintileCapture, m.wonMedian, m.universeMedian, m.sampleWon, m.sampleUniverse, JSON.stringify({ verdict: m.verdict })],
    );
  }
  return { metrics, snapshotted: metrics.length };
}

/** Latest calibration per metric + short history for trend (route context). */
export async function getCalibration(): Promise<{ latest: MetricCalibration[]; history: { snapshotDate: string; metricKey: string; lift: number | null }[] }> {
  const db = getDb();
  const latestRes = await db.execute(sql`
    SELECT DISTINCT ON (metric_key) metric_key, kind, lift, quintile_capture, won_median, universe_median, sample_won, sample_universe, meta
    FROM model_calibrations ORDER BY metric_key, snapshot_date DESC, created_at DESC
  `);
  const latest = (latestRes.rows ?? []).map((r: Record<string, unknown>) => ({
    metricKey: r.metric_key as string,
    kind: (r.kind as 'score' | 'signal') ?? 'score',
    lift: r.lift != null ? Number(r.lift) : null,
    quintileCapture: r.quintile_capture != null ? Number(r.quintile_capture) : null,
    wonMedian: r.won_median != null ? Number(r.won_median) : null,
    universeMedian: r.universe_median != null ? Number(r.universe_median) : null,
    sampleWon: Number(r.sample_won ?? 0),
    sampleUniverse: Number(r.sample_universe ?? 0),
    verdict: ((r.meta as { verdict?: string })?.verdict as MetricCalibration['verdict']) ?? 'insufficient',
  }));

  const histRes = await db.execute(sql`
    SELECT snapshot_date, metric_key, lift FROM model_calibrations
    ORDER BY snapshot_date DESC LIMIT 60
  `);
  const history = (histRes.rows ?? []).map((r: Record<string, unknown>) => ({
    snapshotDate: r.snapshot_date as string,
    metricKey: r.metric_key as string,
    lift: r.lift != null ? Number(r.lift) : null,
  }));

  return { latest, history };
}
