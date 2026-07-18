import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { listIndications } from './iw.js';
import { listTargets } from './alpha.js';

/**
 * The Daily Intelligence Brief — the desk's "state of the world" in one read:
 * pulse, today's Indications & Warning, the ripe targets to chase, market
 * movers, and deals at risk. Assembled from the intelligence spine so the desk
 * walks in already knowing what to do.
 */

export interface DailyBrief {
  generatedAt: string;
  pulse: { openPipelineUsd: number; openDeals: number; targetsRipe: number; indications: number };
  indications: Awaited<ReturnType<typeof listIndications>>;
  targets: Awaited<ReturnType<typeof listTargets>>;
  movers: { id: string; name: string; ticker: string | null; priceChange30d: number; competitorCount: number }[];
  dealsAtRisk: { id: string; projectId: string; name: string; stage: string; daysStale: number }[];
}

export async function buildDailyBrief(): Promise<DailyBrief> {
  const db = getDb();

  const indications = await listIndications(8);
  const targets = await listTargets(8);

  // Pulse.
  const pulseRes = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(package_value),0) FROM deals WHERE stage NOT IN ('won','lost','not_started')) AS open_pipeline,
      (SELECT count(*) FROM deals WHERE stage NOT IN ('won','lost','not_started')) AS open_deals
  `);
  const pr = (pulseRes.rows ?? [])[0] as Record<string, unknown>;

  // Movers — biggest 30d momentum among unlisted tokens (fresh strike candidates).
  const moversRes = await db.execute(sql`
    SELECT p.id, p.name, p.ticker, p.price_change_30d,
           (SELECT count(*) FROM exchange_listings el WHERE el.project_id = p.id) AS competitor_count
    FROM projects p
    WHERE p.listed_on_lcx = false AND p.price_change_30d IS NOT NULL
      AND p.market_cap_usd > 5000000
      AND p.price_change_30d BETWEEN -95 AND 500  -- drop wash/garbage momentum
    ORDER BY p.price_change_30d DESC
    LIMIT 6
  `);
  const movers = (moversRes.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string, ticker: (r.ticker as string | null) ?? null,
    priceChange30d: Number(r.price_change_30d), competitorCount: Number(r.competitor_count ?? 0),
  }));

  // Deals at risk — active deals with no movement in 7+ days.
  const riskRes = await db.execute(sql`
    SELECT d.id, d.project_id, p.name, d.stage,
           EXTRACT(DAY FROM (NOW() - d.updated_at))::int AS days_stale
    FROM deals d JOIN projects p ON p.id = d.project_id
    WHERE d.stage IN ('contacted','discovery','proposal','negotiating')
      AND d.updated_at < NOW() - INTERVAL '7 days'
    ORDER BY d.updated_at ASC
    LIMIT 8
  `);
  const dealsAtRisk = (riskRes.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, projectId: r.project_id as string, name: r.name as string,
    stage: r.stage as string, daysStale: Number(r.days_stale ?? 0),
  }));

  return {
    generatedAt: new Date().toISOString(),
    pulse: {
      openPipelineUsd: Math.round(Number(pr?.open_pipeline ?? 0) / 100),
      openDeals: Number(pr?.open_deals ?? 0),
      targetsRipe: targets.length,
      indications: indications.length,
    },
    indications,
    targets,
    movers,
    dealsAtRisk,
  };
}
