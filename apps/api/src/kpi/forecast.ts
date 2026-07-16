/**
 * Shared forecast computation — win probability per open deal plus the
 * Monte Carlo quarterly distribution. Used by GET /v1/kpis/forecast and by
 * the daily kpi_snapshot job (which persists {p10,p50,p90,expected} into
 * kpi_daily_snapshots.forecast for trend history).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { monteCarloForecast, dealWinProbability } from '@lcx/shared';

export interface ForecastDealSummary {
  id: string;
  projectName: string;
  stage: string;
  value: number;
  winProbability: number;
  daysSinceUpdate: number;
}

export interface ForecastSummary {
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  expected: number;
  deals: ForecastDealSummary[];
}

export async function computeForecast(): Promise<ForecastSummary> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT d.id, d.stage, d.package_value, p.name AS project_name,
           COALESCE(s.priority_score, 0) AS priority_score,
           FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400) AS days_since_update
    FROM deals d
    JOIN projects p ON p.id = d.project_id
    LEFT JOIN scores s ON s.project_id = d.project_id
    WHERE d.stage NOT IN ('won', 'lost')
  `);

  const inputs = (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    stage: String(r.stage),
    packageValueCents: r.package_value != null ? Number(r.package_value) : null,
    priorityScore: Number(r.priority_score ?? 0),
    daysSinceUpdate: Number(r.days_since_update ?? 0),
    projectName: String(r.project_name),
  }));

  const mc = monteCarloForecast(inputs, { runs: 10_000 });
  return {
    runs: mc.runs,
    p10: mc.p10Cents / 100,
    p50: mc.p50Cents / 100,
    p90: mc.p90Cents / 100,
    expected: mc.expectedCents / 100,
    deals: inputs.map((d) => ({
      id: d.id,
      projectName: d.projectName,
      stage: d.stage,
      value: (d.packageValueCents ?? 0) / 100,
      winProbability: Math.round(dealWinProbability(d) * 100),
      daysSinceUpdate: d.daysSinceUpdate,
    })).sort((a, b) => b.winProbability * b.value - a.winProbability * a.value),
  };
}
