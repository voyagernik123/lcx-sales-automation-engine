import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const customer360Routes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * GET /v1/projects/:id/360 — composite customer view:
 * project + score + people + deals + handoff/task counts + last activity.
 */
customer360Routes.get('/:id/360', requireOperator, async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  try {
    const projectRes = await db.execute(sql`
      SELECT id, name, website, ticker, chain, category, region, jurisdiction,
             listed_on_lcx, market_cap_usd, market_cap_rank, volume_24h_usd, price_usd,
             people_count, verified_contact_count, source, created_at, last_enriched_at
      FROM projects WHERE id = ${id}
    `);
    const p = (projectRes.rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!p) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    const [scoreRes, peopleRes, dealsRes, countsRes, activityRes] = await Promise.all([
      db.execute(sql`
        SELECT band, eu_score, us_pre_score, us_post_score, propensity_score, priority_score,
               recommended_market, reasons, computed_at
        FROM scores WHERE project_id = ${id}
      `),
      db.execute(sql`
        SELECT id, name, title, role, email, email_status, telegram, linkedin, verified,
               contactability_score
        FROM people WHERE project_id = ${id}
        ORDER BY verified DESC, contactability_score DESC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT id, stage, package_type, package_value, owner, notes, won_at, created_at, updated_at
        FROM deals WHERE project_id = ${id}
        ORDER BY updated_at DESC
      `),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM handoffs WHERE project_id = ${id}) AS handoffs_count,
          (SELECT COUNT(*) FROM handoffs WHERE project_id = ${id} AND status = 'open') AS handoffs_open,
          (SELECT COUNT(*) FROM tasks WHERE project_id = ${id}) AS tasks_count,
          (SELECT COUNT(*) FROM tasks WHERE project_id = ${id} AND status = 'open') AS tasks_open
      `),
      db.execute(sql`
        SELECT MAX(ts) AS last_activity FROM (
          SELECT updated_at AS ts FROM deals WHERE project_id = ${id}
          UNION ALL
          SELECT updated_at AS ts FROM handoffs WHERE project_id = ${id}
          UNION ALL
          SELECT created_at AS ts FROM tasks WHERE project_id = ${id}
          UNION ALL
          SELECT observed_at AS ts FROM signals WHERE project_id = ${id}
        ) t
      `),
    ]);

    const s = (scoreRes.rows ?? [])[0] as Record<string, unknown> | undefined;
    const counts = (countsRes.rows ?? [])[0] as Record<string, unknown> | undefined;
    const activity = (activityRes.rows ?? [])[0] as Record<string, unknown> | undefined;

    return c.json({
      data: {
        project: {
          id: p.id,
          name: p.name,
          website: p.website,
          ticker: p.ticker,
          chain: p.chain,
          category: p.category,
          region: p.region,
          jurisdiction: p.jurisdiction,
          listedOnLcx: p.listed_on_lcx,
          marketCapUsd: p.market_cap_usd != null ? Number(p.market_cap_usd) : null,
          marketCapRank: p.market_cap_rank != null ? Number(p.market_cap_rank) : null,
          volume24hUsd: p.volume_24h_usd != null ? Number(p.volume_24h_usd) : null,
          priceUsd: p.price_usd != null ? Number(p.price_usd) : null,
          peopleCount: Number(p.people_count ?? 0),
          verifiedContactCount: Number(p.verified_contact_count ?? 0),
          source: p.source,
          createdAt: p.created_at,
          lastEnrichedAt: p.last_enriched_at,
        },
        score: s
          ? {
              band: s.band,
              euScore: Number(s.eu_score ?? 0),
              usPreScore: Number(s.us_pre_score ?? 0),
              usPostScore: Number(s.us_post_score ?? 0),
              propensityScore: Number(s.propensity_score ?? 0),
              priorityScore: Number(s.priority_score ?? 0),
              recommendedMarket: s.recommended_market,
              reasons: s.reasons ?? [],
              computedAt: s.computed_at,
            }
          : null,
        people: (peopleRes.rows ?? []).map((r: Record<string, unknown>) => ({
          id: r.id,
          name: r.name,
          title: r.title,
          role: r.role,
          email: r.email,
          emailStatus: r.email_status,
          telegram: r.telegram,
          linkedin: r.linkedin,
          verified: r.verified,
          contactabilityScore: Number(r.contactability_score ?? 0),
        })),
        deals: (dealsRes.rows ?? []).map((r: Record<string, unknown>) => ({
          id: r.id,
          stage: r.stage,
          packageType: r.package_type,
          packageValue: r.package_value != null ? Number(r.package_value) : null,
          owner: r.owner,
          notes: r.notes,
          wonAt: r.won_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        counts: {
          handoffs: Number(counts?.handoffs_count ?? 0),
          handoffsOpen: Number(counts?.handoffs_open ?? 0),
          tasks: Number(counts?.tasks_count ?? 0),
          tasksOpen: Number(counts?.tasks_open ?? 0),
        },
        lastActivity: activity?.last_activity ?? null,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[customer360] error:', err);
    return c.json({ error: 'Failed to load customer 360', code: 'CUSTOMER360_ERROR' }, 500);
  }
});
