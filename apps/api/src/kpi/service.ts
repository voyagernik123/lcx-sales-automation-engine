import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { randomUUID } from 'node:crypto';

export interface KpiDashboard {
  newHighScoreLeadsThisWeek: number;
  replyRateBySource: Record<string, { sent: number; replied: number; rate: number }>;
  replyRateByChannel: Record<string, { sent: number; replied: number; rate: number }>;
  avgDaysFirstTouchToHandoff: number | null;
  avgDaysHandoffToProposal: number | null;
  avgDaysProposalToWon: number | null;
  funnel: {
    enrolled: number;
    replied: number;
    proposal: number;
    won: number;
  };
  revenueByStream: Record<string, number>;
  topObjections: { category: string; count: number }[];
  stalledDeals: { id: string; projectName: string; stage: string; daysSinceUpdate: number; blocker: string }[];
  postListingExpansion: {
    totalWon: number;
    withExpansion: number;
    expansionRevenue: number;
  };
  weeklyView: {
    hot: number;
    stalled: number;
    overdue: number;
  };
  telegramConversion: {
    handoffs: number;
    moved: number;
    rate: number;
  };
}

export async function computeKpis(): Promise<KpiDashboard> {
  const db = getDb();

  const newScoreRow = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM scores s
    WHERE s.band IN ('immediate', 'high')
      AND s.computed_at >= NOW() - INTERVAL '7 days'
  `);
  const newHighScoreLeadsThisWeek = Number((newScoreRow.rows?.[0] as Record<string, unknown> | undefined)?.count ?? 0);

  const enrolled = Number((await db.execute(sql`SELECT COUNT(*) AS count FROM sequence_enrollments`)).rows?.[0]?.count ?? 0);
  const replied = Number((await db.execute(sql`SELECT COUNT(DISTINCT project_id) AS count FROM handoffs`)).rows?.[0]?.count ?? 0);
  const proposal = Number((await db.execute(sql`SELECT COUNT(*) AS count FROM deals WHERE stage IN ('proposal', 'negotiating', 'won')`)).rows?.[0]?.count ?? 0);
  const totalWon = Number((await db.execute(sql`SELECT COUNT(*) AS count FROM deals WHERE stage = 'won'`)).rows?.[0]?.count ?? 0);

  const funnel = { enrolled, replied, proposal, won: totalWon };

  const totalHandoffs = Number((await db.execute(sql`SELECT COUNT(*) AS count FROM handoffs`)).rows?.[0]?.count ?? 0);
  const movedToTelegram = Number((await db.execute(sql`SELECT COUNT(DISTINCT handoff_id) AS count FROM handoff_events WHERE event_type = 'moved_to_telegram'`)).rows?.[0]?.count ?? 0);
  const telegramConversion = {
    handoffs: totalHandoffs,
    moved: movedToTelegram,
    rate: totalHandoffs > 0 ? Math.round((movedToTelegram / totalHandoffs) * 100) : 0,
  };

  const replyRows = await db.execute(sql`
    SELECT
      p.source,
      COALESCE(os.channel, 'email') AS channel,
      COUNT(DISTINCT m.id) AS sent_count,
      COUNT(DISTINCT h.id) AS reply_count
    FROM projects p
    LEFT JOIN outreach_sequences os ON os.project_id = p.id
    LEFT JOIN messages m ON m.sequence_id = os.id AND m.status = 'sent'
    LEFT JOIN handoffs h ON h.project_id = p.id
    GROUP BY p.source, os.channel
  `);

  const byChannel: Record<string, { sent: number; replied: number }> = {};
  const bySource: Record<string, { sent: number; replied: number }> = {};
  for (const r of (replyRows.rows ?? [])) {
    const row = r as Record<string, unknown>;
    const source = String(row.source ?? 'unknown');
    const channel = String(row.channel ?? 'email');
    const sent = Number(row.sent_count ?? 0);
    const repliedCount = Number(row.reply_count ?? 0);

    if (!bySource[source]) bySource[source] = { sent: 0, replied: 0 };
    bySource[source].sent += sent;
    bySource[source].replied += repliedCount;

    if (!byChannel[channel]) byChannel[channel] = { sent: 0, replied: 0 };
    byChannel[channel].sent += sent;
    byChannel[channel].replied += repliedCount;
  }

  const replyRateByChannel: Record<string, { sent: number; replied: number; rate: number }> = {};
  for (const [ch, stats] of Object.entries(byChannel)) {
    replyRateByChannel[ch] = { ...stats, rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0 };
  }
  const replyRateBySource: Record<string, { sent: number; replied: number; rate: number }> = {};
  for (const [src, stats] of Object.entries(bySource)) {
    replyRateBySource[src] = { ...stats, rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0 };
  }

  const ftthResult = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (h.created_at - m.sent_at)) / 86400) AS avg_days
    FROM handoffs h
    JOIN messages m ON m.project_id = h.project_id AND m.status = 'sent'
    WHERE m.sent_at IS NOT NULL AND h.created_at >= m.sent_at
  `);
  const avgDaysFirstTouchToHandoff = ftthResult.rows?.length
    ? Math.round(Number((ftthResult.rows?.[0] as Record<string, unknown> | undefined)?.avg_days ?? 0))
    : null;

  const htpResult = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (de.created_at - h.created_at)) / 86400) AS avg_days
    FROM deals d
    JOIN deal_events de ON de.deal_id = d.id AND de.event_type = 'stage_change' AND de.new_stage = 'proposal'
    JOIN handoffs h ON h.project_id = d.project_id
    WHERE de.created_at >= h.created_at
  `);
  const avgDaysHandoffToProposal = htpResult.rows?.length
    ? Math.round(Number((htpResult.rows?.[0] as Record<string, unknown> | undefined)?.avg_days ?? 0))
    : null;

  const ptwResult = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (d.won_at - de.created_at)) / 86400) AS avg_days
    FROM deals d
    JOIN deal_events de ON de.deal_id = d.id AND de.event_type = 'stage_change' AND de.new_stage = 'proposal'
    WHERE d.won_at IS NOT NULL AND d.won_at >= de.created_at
  `);
  const avgDaysProposalToWon = ptwResult.rows?.length
    ? Math.round(Number((ptwResult.rows?.[0] as Record<string, unknown> | undefined)?.avg_days ?? 0))
    : null;

  const revRows = await db.execute(sql`
    SELECT package_type, COALESCE(SUM(package_value), 0) AS total
    FROM deals WHERE stage = 'won' GROUP BY package_type
  `);
  const revenueByStream: Record<string, number> = { listing: 0, marketing: 0, liquidity: 0, dual: 0, emt: 0, custom: 0 };
  for (const r of (revRows.rows ?? [])) {
    const row = r as Record<string, unknown>;
    revenueByStream[String(row.package_type ?? 'custom')] = Number(row.total ?? 0);
  }

  const objRows = await db.execute(sql`
    SELECT category, COUNT(*) AS count
    FROM deal_objections GROUP BY category ORDER BY count DESC LIMIT 10
  `);
  const topObjections = (objRows.rows ?? []).map((r: Record<string, unknown>) => ({
    category: String(r.category ?? 'unknown'),
    count: Number(r.count ?? 0),
  }));

  const stalledRows = await db.execute(sql`
    SELECT d.id, p.name AS project_name, d.stage,
      EXTRACT(DAY FROM (NOW() - d.updated_at)) AS days_since_update,
      COALESCE(
        (SELECT string_agg(do2.description, '; ') FROM deal_objections do2 WHERE do2.deal_id = d.id AND do2.resolved = false LIMIT 1),
        'No blockers logged'
      ) AS blocker
    FROM deals d
    JOIN projects p ON p.id = d.project_id
    WHERE d.stage NOT IN ('won', 'lost', 'not_started')
      AND d.updated_at <= NOW() - INTERVAL '3 days'
    ORDER BY d.updated_at ASC
  `);
  const stalledDeals = (stalledRows.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    projectName: String(r.project_name ?? 'Unknown'),
    stage: String(r.stage ?? ''),
    daysSinceUpdate: Number(r.days_since_update ?? 0),
    blocker: String(r.blocker ?? ''),
  }));

  const expansionResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT wd.project_id) AS with_expansion,
      COALESCE(SUM(ed.package_value), 0) AS expansion_revenue
    FROM deals wd
    JOIN deals ed ON ed.project_id = wd.project_id
    WHERE wd.stage = 'won'
      AND ed.id != wd.id
      AND ed.stage IN ('won', 'negotiating', 'proposal')
  `);
  const expRow = expansionResult.rows?.[0] as Record<string, unknown> | undefined;
  const withExpansion = Number(expRow?.with_expansion ?? 0);
  const expansionRevenue = Number(expRow?.expansion_revenue ?? 0);

  const hot = stalledDeals.filter(d => d.daysSinceUpdate < 7).length;
  const stalledCount = stalledDeals.filter(d => d.daysSinceUpdate >= 7 && d.daysSinceUpdate < 21).length;
  const overdue = stalledDeals.filter(d => d.daysSinceUpdate >= 21).length;

  return {
    newHighScoreLeadsThisWeek,
    replyRateBySource,
    replyRateByChannel,
    avgDaysFirstTouchToHandoff,
    avgDaysHandoffToProposal,
    avgDaysProposalToWon,
    funnel,
    revenueByStream,
    topObjections,
    stalledDeals,
    postListingExpansion: { totalWon, withExpansion, expansionRevenue },
    weeklyView: { hot, stalled: stalledCount, overdue },
    telegramConversion,
  };
}

/* ─── Post-listing 30/60/90 triggers ─── */

const TRIGGER_TYPES = ['campaign_upsell', 'mm_referral', 'mica_legal', 'trading_incentives'] as const;

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  campaign_upsell: 'Campaign Upsell',
  mm_referral: 'MM Referral',
  mica_legal: 'MiCA/Legal',
  trading_incentives: 'Trading Incentives',
};

export const TRIGGER_DAY_LABELS: Record<number, string> = {
  30: '30-Day',
  60: '60-Day',
  90: '90-Day',
};

export async function createPostListingTriggers(dealId: string, projectId: string, wonAt: Date): Promise<number> {
  const db = getDb();
  let created = 0;

  for (const triggerDay of [30, 60, 90] as const) {
    for (const triggerType of TRIGGER_TYPES) {
      const dueAt = new Date(wonAt.getTime() + triggerDay * 86400000);
      const typeLabel = TRIGGER_TYPE_LABELS[triggerType];
      const dayLabel = TRIGGER_DAY_LABELS[triggerDay];

      await db.insert(schema.postListingTriggers).values({
        id: randomUUID(),
        dealId,
        projectId,
        triggerDay,
        triggerType,
        status: 'pending',
        taskSummary: `${dayLabel} — ${typeLabel}`,
        dueAt,
      }).execute();
      created++;
    }
  }

  return created;
}

export async function listTriggers(projectId?: string): Promise<Record<string, unknown>[]> {
  const db = getDb();

  const where = projectId
    ? sql`WHERE t.project_id = ${projectId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT t.*, p.name AS project_name
    FROM post_listing_triggers t
    JOIN projects p ON p.id = t.project_id
    ${where}
    ORDER BY t.due_at ASC
  `);

  return (rows.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    dealId: r.deal_id,
    projectId: r.project_id,
    projectName: r.project_name,
    triggerDay: r.trigger_day,
    triggerType: r.trigger_type,
    status: r.status,
    draftContent: r.draft_content,
    taskSummary: r.task_summary,
    dueAt: r.due_at,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}

export async function updateTriggerStatus(
  triggerId: string,
  status: 'pending' | 'drafted' | 'completed' | 'skipped',
  draftContent?: string,
): Promise<void> {
  const db = getDb();
  const update: Record<string, unknown> = { status };
  if (draftContent !== undefined) update.draftContent = draftContent;
  if (status === 'completed') update.completedAt = new Date();
  await db.update(schema.postListingTriggers).set(update).where(sql`${schema.postListingTriggers.id} = ${triggerId}`).execute();
}

/* ─── Export CSV ─── */

export function kpisToCsv(kpis: KpiDashboard): string {
  const lines: string[] = [];
  lines.push('LCX Sales Automation — KPI Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('=== Lead Generation ===');
  lines.push(`New High-Score Leads (7d),${kpis.newHighScoreLeadsThisWeek}`);
  lines.push('');

  lines.push('=== Reply Rate by Channel ===');
  lines.push('Channel,Sent,Replied,Rate (%)');
  for (const [ch, stats] of Object.entries(kpis.replyRateByChannel)) {
    lines.push(`${ch},${stats.sent},${stats.replied},${stats.rate}`);
  }
  lines.push('');

  lines.push('=== Reply Rate by Source ===');
  lines.push('Source,Sent,Replied,Rate (%)');
  for (const [src, stats] of Object.entries(kpis.replyRateBySource)) {
    lines.push(`${src},${stats.sent},${stats.replied},${stats.rate}`);
  }
  lines.push('');

  lines.push('=== Timeline (avg days) ===');
  lines.push(`First Touch → Handoff,${kpis.avgDaysFirstTouchToHandoff ?? 'N/A'}`);
  lines.push(`Handoff → Proposal,${kpis.avgDaysHandoffToProposal ?? 'N/A'}`);
  lines.push(`Proposal → Won,${kpis.avgDaysProposalToWon ?? 'N/A'}`);
  lines.push('');

  lines.push('=== Funnel ===');
  lines.push(`Enrolled,${kpis.funnel.enrolled}`);
  lines.push(`Replied,${kpis.funnel.replied}`);
  lines.push(`Proposal,${kpis.funnel.proposal}`);
  lines.push(`Won,${kpis.funnel.won}`);
  lines.push('');

  lines.push('=== Revenue by Stream (cents) ===');
  lines.push('Stream,Revenue');
  for (const [stream, rev] of Object.entries(kpis.revenueByStream)) {
    lines.push(`${stream},${rev}`);
  }
  lines.push('');

  lines.push('=== Top Objections ===');
  lines.push('Category,Count');
  for (const obj of kpis.topObjections) {
    lines.push(`${obj.category},${obj.count}`);
  }
  lines.push('');

  lines.push('=== Weekly Operator View ===');
  lines.push(`Hot (active),${kpis.weeklyView.hot}`);
  lines.push(`Stalled (7-21d),${kpis.weeklyView.stalled}`);
  lines.push(`Overdue (21d+),${kpis.weeklyView.overdue}`);
  lines.push('');

  lines.push('=== Post-Listing Expansion ===');
  lines.push(`Total Won Deals,${kpis.postListingExpansion.totalWon}`);
  lines.push(`With Expansion,${kpis.postListingExpansion.withExpansion}`);
  lines.push(`Expansion Revenue (cents),${kpis.postListingExpansion.expansionRevenue}`);

  return lines.join('\n');
}
