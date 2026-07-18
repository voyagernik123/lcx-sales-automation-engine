import { sql } from 'drizzle-orm';
import { CONNECTORS } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { getCalibration } from './calibration.js';

/**
 * Self-measurement scorecard (Wave 6) — the platform holds itself accountable.
 * The North Star (listings won) + the funnel that produces it + the quality of
 * the intelligence feeding it (data coverage, and whether conviction actually
 * predicts wins). This is what makes "is it working?" answerable, and what the
 * learning loop optimizes.
 */

export interface Scorecard {
  northStar: { totalWon: number; wonLast90d: number };
  funnel: { openDeals: number; openValueUsd: number; winRatePct: number | null; avgCycleDays: number | null };
  intelligence: {
    observations: number;
    scoredProjects: number;
    coverage: { source: string; label: string; okCount: number; pct: number }[];
    convictionLift: number | null;
    convictionCapture: number | null;
    convictionVerdict: string | null;
  };
}

export async function buildScorecard(): Promise<Scorecard> {
  const db = getDb();

  const dealRes = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE stage='won') AS won,
      count(*) FILTER (WHERE stage='won' AND COALESCE(won_at, updated_at) > NOW() - INTERVAL '90 days') AS won_90d,
      count(*) FILTER (WHERE stage='lost') AS lost,
      count(*) FILTER (WHERE stage NOT IN ('won','lost','not_started')) AS open_deals,
      COALESCE(SUM(package_value) FILTER (WHERE stage NOT IN ('won','lost','not_started')), 0) AS open_value,
      AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400.0) FILTER (WHERE stage='won' AND won_at IS NOT NULL) AS avg_cycle_days
    FROM deals
  `);
  const d = (dealRes.rows ?? [])[0] as Record<string, unknown>;
  const won = Number(d?.won ?? 0);
  const lost = Number(d?.lost ?? 0);
  const winRatePct = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
  const avgCycleDays = d?.avg_cycle_days != null ? Math.round(Number(d.avg_cycle_days)) : null;

  const obsRes = await db.execute(sql`SELECT count(*) AS c FROM observations`);
  const observations = Number((obsRes.rows?.[0] as Record<string, unknown>)?.c ?? 0);
  const scoredRes = await db.execute(sql`SELECT count(DISTINCT subject_id) AS c FROM observations WHERE predicate='conviction'`);
  const scoredProjects = Number((scoredRes.rows?.[0] as Record<string, unknown>)?.c ?? 0);
  const projRes = await db.execute(sql`SELECT count(*) AS c FROM projects`);
  const totalProjects = Number((projRes.rows?.[0] as Record<string, unknown>)?.c ?? 0) || 1;

  const covRes = await db.execute(sql`
    SELECT source, count(*) FILTER (WHERE status='ok') AS ok FROM collection_state GROUP BY source
  `);
  const okBySource = new Map<string, number>();
  for (const r of (covRes.rows ?? []) as Record<string, unknown>[]) okBySource.set(r.source as string, Number(r.ok ?? 0));
  const coverage = CONNECTORS.map((c) => {
    const okCount = okBySource.get(c.id) ?? 0;
    return { source: c.id, label: c.label, okCount, pct: Math.round((okCount / totalProjects) * 100) };
  });

  const calib = await getCalibration();
  const conv = calib.latest.find((m) => m.metricKey === 'conviction');

  return {
    northStar: { totalWon: won, wonLast90d: Number(d?.won_90d ?? 0) },
    funnel: {
      openDeals: Number(d?.open_deals ?? 0),
      openValueUsd: Math.round(Number(d?.open_value ?? 0) / 100),
      winRatePct,
      avgCycleDays,
    },
    intelligence: {
      observations,
      scoredProjects,
      coverage,
      convictionLift: conv?.lift ?? null,
      convictionCapture: conv?.quintileCapture ?? null,
      convictionVerdict: conv?.verdict ?? null,
    },
  };
}
