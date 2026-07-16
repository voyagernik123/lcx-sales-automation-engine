/**
 * Daily KPI snapshot — persists the live dashboard numbers into
 * kpi_daily_snapshots so trends survive and the dashboard can stop
 * recomputing history. Upserts on snapshot_date (idempotent per day).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { computeKpis } from './service.js';
import { computeForecast } from './forecast.js';
import { isUndefinedColumn } from '../lib/pg.js';

export interface SnapshotResult {
  snapshotDate: string;
  funnel: { enrolled: number; replied: number; proposal: number; won: number };
  /** false when the forecast column is missing (migration 0028 not applied) or storage failed. */
  forecastStored: boolean;
}

export async function writeKpiSnapshot(): Promise<SnapshotResult> {
  const db = getDb();
  const k = await computeKpis();
  const today = new Date().toISOString().slice(0, 10);

  const email = k.replyRateByChannel['email'] ?? { sent: 0, replied: 0 };
  const linkedin = k.replyRateByChannel['linkedin'] ?? { sent: 0, replied: 0 };
  const rev = (s: string) => Math.round(k.revenueByStream[s] ?? 0);
  const movedToTelegram = await db
    .execute(sql`SELECT COUNT(DISTINCT handoff_id) AS n FROM handoff_events WHERE event_type = 'moved_to_telegram'`)
    .then((r) => Number((r.rows?.[0] as Record<string, unknown> | undefined)?.n ?? 0))
    .catch(() => 0);

  await db.execute(sql`
    INSERT INTO kpi_daily_snapshots (
      snapshot_date, new_high_score_leads_week,
      reply_rate_email_sent, reply_rate_email_replied,
      reply_rate_linkedin_sent, reply_rate_linkedin_replied,
      avg_hours_first_touch_to_handoff, avg_hours_handoff_to_proposal, avg_hours_proposal_to_won,
      funnel_enrolled, funnel_replied, funnel_proposal, funnel_won,
      revenue_listing, revenue_marketing, revenue_liquidity, revenue_dual, revenue_emt, revenue_custom,
      top_objections, stalled_deal_count,
      total_won, with_expansion, expansion_revenue,
      hot_deals, stalled_deals, overdue_actions
    ) VALUES (
      ${today}, ${k.newHighScoreLeadsThisWeek},
      ${email.sent}, ${email.replied},
      ${linkedin.sent}, ${linkedin.replied},
      ${k.avgDaysFirstTouchToHandoff != null ? Math.round(k.avgDaysFirstTouchToHandoff * 24) : null},
      ${k.avgDaysHandoffToProposal != null ? Math.round(k.avgDaysHandoffToProposal * 24) : null},
      ${k.avgDaysProposalToWon != null ? Math.round(k.avgDaysProposalToWon * 24) : null},
      ${k.funnel.enrolled}, ${k.funnel.replied}, ${k.funnel.proposal}, ${k.funnel.won},
      ${rev('listing')}, ${rev('marketing')}, ${rev('liquidity')}, ${rev('dual')}, ${rev('emt')}, ${rev('custom')},
      ${JSON.stringify(k.topObjections)}, ${k.stalledDeals.length},
      ${k.postListingExpansion.totalWon}, ${k.postListingExpansion.withExpansion}, ${k.postListingExpansion.expansionRevenue},
      ${k.weeklyView.hot}, ${k.weeklyView.stalled}, ${k.weeklyView.overdue}
    )
    ON CONFLICT (snapshot_date) DO UPDATE SET
      new_high_score_leads_week = EXCLUDED.new_high_score_leads_week,
      reply_rate_email_sent = EXCLUDED.reply_rate_email_sent,
      reply_rate_email_replied = EXCLUDED.reply_rate_email_replied,
      reply_rate_linkedin_sent = EXCLUDED.reply_rate_linkedin_sent,
      reply_rate_linkedin_replied = EXCLUDED.reply_rate_linkedin_replied,
      funnel_enrolled = EXCLUDED.funnel_enrolled,
      funnel_replied = EXCLUDED.funnel_replied,
      funnel_proposal = EXCLUDED.funnel_proposal,
      funnel_won = EXCLUDED.funnel_won,
      revenue_listing = EXCLUDED.revenue_listing,
      revenue_marketing = EXCLUDED.revenue_marketing,
      revenue_liquidity = EXCLUDED.revenue_liquidity,
      revenue_dual = EXCLUDED.revenue_dual,
      revenue_emt = EXCLUDED.revenue_emt,
      revenue_custom = EXCLUDED.revenue_custom,
      top_objections = EXCLUDED.top_objections,
      stalled_deal_count = EXCLUDED.stalled_deal_count,
      total_won = EXCLUDED.total_won,
      with_expansion = EXCLUDED.with_expansion,
      expansion_revenue = EXCLUDED.expansion_revenue,
      hot_deals = EXCLUDED.hot_deals,
      stalled_deals = EXCLUDED.stalled_deals,
      overdue_actions = EXCLUDED.overdue_actions
  `);

  // Persist today's Monte Carlo forecast alongside the KPI numbers (migration
  // 0028). Guarded: a db lagging the migration (42703) just skips this —
  // the core snapshot above must never fail because of the forecast column.
  let forecastStored = false;
  try {
    const f = await computeForecast();
    await db.execute(sql`
      UPDATE kpi_daily_snapshots
      SET forecast = ${JSON.stringify({ p10: f.p10, p50: f.p50, p90: f.p90, expected: f.expected })}::jsonb
      WHERE snapshot_date = ${today}
    `);
    forecastStored = true;
  } catch (err) {
    if (!isUndefinedColumn(err)) {
      console.error('[kpi] forecast snapshot error:', err instanceof Error ? err.message : err);
    }
  }

  void movedToTelegram; // surfaced via GET /v1/kpis; snapshot schema addition tracked separately
  return { snapshotDate: today, funnel: k.funnel, forecastStored };
}
