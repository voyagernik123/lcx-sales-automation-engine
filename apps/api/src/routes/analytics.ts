import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const analyticsRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * GET /v1/analytics/gaps — projects listed on other exchanges but not LCX,
 * ranked by priority. The competitive gap IS the sales pitch: "you're on N
 * exchanges already; here's what LCX adds".
 */
analyticsRoutes.get('/gaps', requireOperator, async (c) => {
  const db = getDb();
  const qs = c.req.query();
  const minExchanges = Math.max(1, Number(qs.minExchanges) || 2);
  const limit = Math.min(Number(qs.limit) || 50, 200);
  const offset = Number(qs.offset) || 0;

  try {
    const result = await db.execute(sql`
      SELECT
        p.id, p.name, p.ticker, p.market_cap_usd, p.exchange_count, p.exchanges_synced_at,
        s.band, s.priority_score, s.propensity_score,
        p.verified_contact_count,
        ex.list AS top_exchanges,
        COUNT(*) OVER () AS total
      FROM projects p
      JOIN scores s ON s.project_id = p.id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', e.exchange_id, 'name', e.exchange_name, 'volume', e.volume_24h_usd) ORDER BY e.volume_24h_usd DESC NULLS LAST) AS list
        FROM (
          SELECT exchange_id, exchange_name, volume_24h_usd
          FROM exchange_listings WHERE project_id = p.id
          ORDER BY volume_24h_usd DESC NULLS LAST LIMIT 6
        ) e
      ) ex ON TRUE
      WHERE p.listed_on_lcx = FALSE
        AND p.exchange_count >= ${minExchanges}
      ORDER BY s.priority_score DESC NULLS LAST, p.exchange_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const rows = result.rows ?? [];
    const total = Number((rows[0] as Record<string, unknown> | undefined)?.total ?? 0);
    return c.json({
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        ticker: r.ticker,
        marketCapUsd: r.market_cap_usd != null ? Number(r.market_cap_usd) : null,
        exchangeCount: r.exchange_count != null ? Number(r.exchange_count) : 0,
        exchangesSyncedAt: r.exchanges_synced_at,
        band: r.band,
        priorityScore: Number(r.priority_score ?? 0),
        propensityScore: Number(r.propensity_score ?? 0),
        verifiedContactCount: Number(r.verified_contact_count ?? 0),
        topExchanges: (r.top_exchanges as { id: string; name: string; volume: number | null }[] | null) ?? [],
      })),
      meta: { ...meta(), total },
    });
  } catch (err) {
    console.error('[analytics] gaps error:', err);
    return c.json({ error: 'Failed to compute gaps', code: 'GAPS_ERROR' }, 500);
  }
});

/** GET /v1/analytics/exchanges — coverage stats per exchange across tracked projects. */
analyticsRoutes.get('/exchanges', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT exchange_id, MAX(exchange_name) AS exchange_name,
             COUNT(DISTINCT project_id) AS projects,
             SUM(volume_24h_usd) AS volume
      FROM exchange_listings
      GROUP BY exchange_id
      ORDER BY projects DESC
      LIMIT 40
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.exchange_id,
        name: r.exchange_name,
        projects: Number(r.projects ?? 0),
        volumeUsd: r.volume != null ? Number(r.volume) : null,
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[analytics] exchanges error:', err);
    return c.json({ error: 'Failed to list exchanges', code: 'EXCHANGES_ERROR' }, 500);
  }
});

/** GET /v1/analytics/map — universe scatter points (mcap × priority). */
analyticsRoutes.get('/map', requireOperator, async (c) => {
  const db = getDb();
  const qs = c.req.query();
  const limit = Math.min(Number(qs.limit) || 500, 1500);
  const conditions = [sql`p.market_cap_usd IS NOT NULL`, sql`s.priority_score > 0`];
  if (qs.band) conditions.push(sql`s.band = ${qs.band}`);
  if (qs.region === 'eu' || qs.region === 'us') conditions.push(sql`p.region = ${qs.region}`);

  try {
    const result = await db.execute(sql`
      SELECT p.id, p.name, p.ticker, p.market_cap_usd, p.region, p.listed_on_lcx,
             s.band, s.priority_score, s.propensity_score
      FROM projects p JOIN scores s ON s.project_id = p.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY s.priority_score DESC
      LIMIT ${limit}
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        ticker: r.ticker,
        marketCapUsd: Number(r.market_cap_usd),
        region: r.region ?? null,
        listedOnLcx: r.listed_on_lcx,
        band: r.band,
        priorityScore: Number(r.priority_score ?? 0),
        propensityScore: Number(r.propensity_score ?? 0),
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[analytics] map error:', err);
    return c.json({ error: 'Failed to load map', code: 'MAP_ERROR' }, 500);
  }
});
