/**
 * Anomaly detection (Phase 6-10) — deterministic statistical checks, no LLM.
 *
 * Each check compares a recent bucket against a trailing baseline and flags a
 * deviation using a z-score (when enough history exists) or a simple ratio
 * threshold fallback. Fully resilient — DB failures degrade to no anomalies.
 *
 * Checks:
 *   1. reply_rate_drop      — weekly handoff (reply) volume vs trailing weeks
 *   2. enrichment_failures  — failed job_runs in last 24h vs trailing daily avg
 *   3. pipeline_volume_drop — weekly new-deal volume vs trailing weeks
 */
import type pg from 'pg';

export interface Anomaly {
  kind: 'reply_rate_drop' | 'enrichment_failures' | 'pipeline_volume_drop';
  severity: 'low' | 'medium' | 'high';
  metric: string;
  current: number;
  expected: number; // trailing mean
  zScore: number | null;
  deviationPct: number | null;
  message: string;
}

const Z_MEDIUM = 1.5;
const Z_HIGH = 2.5;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Pull an ordered series of per-bucket counts, oldest→newest. */
async function bucketSeries(
  pool: pg.Pool,
  table: string,
  tsColumn: string,
  bucket: 'week' | 'day',
  buckets: number,
  where = '',
): Promise<number[]> {
  const step = bucket === 'week' ? 7 : 1;
  try {
    const { rows } = await pool.query(
      `SELECT width_bucket(
                EXTRACT(EPOCH FROM (NOW() - ${tsColumn})) / 86400,
                0, $1, $2
              ) AS b,
              COUNT(*) AS n
       FROM ${table}
       WHERE ${tsColumn} >= NOW() - make_interval(days => $1) ${where ? `AND ${where}` : ''}
       GROUP BY b ORDER BY b`,
      [step * buckets, buckets],
    );
    const series = new Array(buckets).fill(0);
    for (const r of rows) {
      const idx = Number(r.b);
      if (idx >= 1 && idx <= buckets) series[idx - 1] = Number(r.n ?? 0);
    }
    // bucket 1 = most recent window → reverse to oldest→newest
    return series.reverse();
  } catch {
    return [];
  }
}

function assess(kind: Anomaly['kind'], metric: string, current: number, baseline: number[]): Anomaly | null {
  const mu = mean(baseline);
  const sd = stddev(baseline, mu);
  const deviationPct = mu > 0 ? Math.round(((current - mu) / mu) * 100) : null;

  let z: number | null = null;
  if (sd > 0) z = (current - mu) / sd;

  // Only flag DROPS (current below baseline).
  const isDrop = current < mu;
  if (!isDrop || mu <= 0) return null;

  let severity: Anomaly['severity'] | null = null;
  if (z != null) {
    if (z <= -Z_HIGH) severity = 'high';
    else if (z <= -Z_MEDIUM) severity = 'medium';
  } else {
    // Fallback ratio threshold when stddev unavailable (little history).
    const ratio = current / mu;
    if (ratio <= 0.4) severity = 'high';
    else if (ratio <= 0.6) severity = 'medium';
  }
  if (!severity) return null;

  return {
    kind,
    severity,
    metric,
    current,
    expected: Math.round(mu * 10) / 10,
    zScore: z != null ? Math.round(z * 100) / 100 : null,
    deviationPct,
    message: `${metric}: ${current} vs trailing avg ${Math.round(mu * 10) / 10}${deviationPct != null ? ` (${deviationPct}%)` : ''}`,
  };
}

/** Spike check (opposite direction) for failure counts. */
function assessSpike(kind: Anomaly['kind'], metric: string, current: number, baseline: number[]): Anomaly | null {
  const mu = mean(baseline);
  const sd = stddev(baseline, mu);
  const deviationPct = mu > 0 ? Math.round(((current - mu) / mu) * 100) : null;
  let z: number | null = sd > 0 ? (current - mu) / sd : null;

  if (current <= mu) return null;

  let severity: Anomaly['severity'] | null = null;
  if (z != null) {
    if (z >= Z_HIGH) severity = 'high';
    else if (z >= Z_MEDIUM) severity = 'medium';
  } else {
    // No baseline variance: any nonzero current with ~zero baseline is notable.
    if (mu === 0 && current >= 3) severity = 'medium';
    else if (mu > 0 && current / mu >= 3) severity = 'high';
  }
  if (!severity) return null;

  return {
    kind,
    severity,
    metric,
    current,
    expected: Math.round(mu * 10) / 10,
    zScore: z != null ? Math.round(z * 100) / 100 : null,
    deviationPct,
    message: `${metric}: ${current} vs trailing avg ${Math.round(mu * 10) / 10}${deviationPct != null ? ` (${deviationPct}%)` : ''}`,
  };
}

export async function detectAnomalies(pool: pg.Pool): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // 1. Reply volume (handoffs) — 6 trailing weeks, current = latest week.
  const replySeries = await bucketSeries(pool, 'handoffs', 'created_at', 'week', 6);
  if (replySeries.length >= 3) {
    const current = replySeries[replySeries.length - 1];
    const baseline = replySeries.slice(0, -1);
    const a = assess('reply_rate_drop', 'Weekly reply volume', current, baseline);
    if (a) anomalies.push(a);
  }

  // 2. Enrichment failures (job_runs status=failed) — 14 trailing days.
  const failSeries = await bucketSeries(pool, 'job_runs', 'started_at', 'day', 14, `status = 'failed'`);
  if (failSeries.length >= 3) {
    const current = failSeries[failSeries.length - 1];
    const baseline = failSeries.slice(0, -1);
    const a = assessSpike('enrichment_failures', 'Daily job failures', current, baseline);
    if (a) anomalies.push(a);
  }

  // 3. Pipeline volume (new deals) — 6 trailing weeks.
  const dealSeries = await bucketSeries(pool, 'deals', 'created_at', 'week', 6);
  if (dealSeries.length >= 3) {
    const current = dealSeries[dealSeries.length - 1];
    const baseline = dealSeries.slice(0, -1);
    const a = assess('pipeline_volume_drop', 'Weekly new deals', current, baseline);
    if (a) anomalies.push(a);
  }

  return anomalies;
}

export interface AnomalyScanStats {
  checks: number;
  anomalies: number;
  high: number;
  medium: number;
  records: Anomaly[];
}

/** Job function for the jobs CLI — runs the scan and returns stats. */
export async function refreshAnomalies(pool: pg.Pool): Promise<AnomalyScanStats> {
  let records: Anomaly[] = [];
  try {
    records = await detectAnomalies(pool);
  } catch {
    records = [];
  }
  return {
    checks: 3,
    anomalies: records.length,
    high: records.filter((r) => r.severity === 'high').length,
    medium: records.filter((r) => r.severity === 'medium').length,
    records,
  };
}
