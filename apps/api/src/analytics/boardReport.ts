/**
 * Automated board reporting (Phase 6-4) — deterministic, no LLM.
 *
 * buildBoardReport(pool, period) assembles a structured board-ready snapshot:
 * funnel, revenue, top deals, week-over-week deltas, and an executive summary
 * string built purely from the computed numbers.
 *
 * `period` selects the primary reporting window; deltas always compare the
 * current window against the immediately preceding one of equal length.
 */
import type pg from 'pg';

export type BoardPeriod = 'week' | 'month' | 'quarter';

const PERIOD_DAYS: Record<BoardPeriod, number> = { week: 7, month: 30, quarter: 90 };

export interface BoardReport {
  period: BoardPeriod;
  periodDays: number;
  generatedAt: string;
  funnel: { enrolled: number; replied: number; proposal: number; won: number };
  revenue: { wonTotal: number; wonCount: number; avgDealSize: number; byStream: Record<string, number> };
  topDeals: { id: string; projectName: string; stage: string; packageType: string; value: number }[];
  deltas: {
    enrolled: Delta;
    replied: Delta;
    proposal: Delta;
    won: Delta;
    revenue: Delta;
  };
  execSummary: string;
}

export interface Delta {
  current: number;
  previous: number;
  change: number; // current - previous
  pct: number | null; // % change vs previous, null when previous is 0
}

function delta(current: number, previous: number): Delta {
  const change = current - previous;
  const pct = previous > 0 ? Math.round((change / previous) * 100) : null;
  return { current, previous, change, pct };
}

async function count(pool: pg.Pool, query: string, params: unknown[]): Promise<number> {
  try {
    const { rows } = await pool.query(query, params);
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

function fmtUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function trend(d: Delta): string {
  if (d.change === 0) return 'flat';
  const dir = d.change > 0 ? 'up' : 'down';
  const mag = d.pct != null ? ` ${Math.abs(d.pct)}%` : '';
  return `${dir}${mag}`;
}

export async function buildBoardReport(pool: pg.Pool, period: BoardPeriod = 'week'): Promise<BoardReport> {
  const days = PERIOD_DAYS[period] ?? PERIOD_DAYS.week;

  // Current window = last `days` days. Previous window = the `days` before that.
  const curFrom = `NOW() - make_interval(days => $1)`;
  const prevFrom = `NOW() - make_interval(days => $1 * 2)`;
  const prevTo = curFrom;

  // ── Funnel (current window) ──
  const enrolled = await count(pool, `SELECT COUNT(*) AS count FROM sequence_enrollments WHERE enrolled_at >= ${curFrom}`, [days]);
  const replied = await count(pool, `SELECT COUNT(DISTINCT project_id) AS count FROM handoffs WHERE created_at >= ${curFrom}`, [days]);
  const proposal = await count(pool, `SELECT COUNT(*) AS count FROM deals WHERE stage IN ('proposal','negotiating','won') AND updated_at >= ${curFrom}`, [days]);
  const won = await count(pool, `SELECT COUNT(*) AS count FROM deals WHERE stage = 'won' AND won_at >= ${curFrom}`, [days]);

  // ── Funnel (previous window) for deltas ──
  const enrolledPrev = await count(pool, `SELECT COUNT(*) AS count FROM sequence_enrollments WHERE enrolled_at >= ${prevFrom} AND enrolled_at < ${prevTo}`, [days]);
  const repliedPrev = await count(pool, `SELECT COUNT(DISTINCT project_id) AS count FROM handoffs WHERE created_at >= ${prevFrom} AND created_at < ${prevTo}`, [days]);
  const proposalPrev = await count(pool, `SELECT COUNT(*) AS count FROM deals WHERE stage IN ('proposal','negotiating','won') AND updated_at >= ${prevFrom} AND updated_at < ${prevTo}`, [days]);
  const wonPrev = await count(pool, `SELECT COUNT(*) AS count FROM deals WHERE stage = 'won' AND won_at >= ${prevFrom} AND won_at < ${prevTo}`, [days]);

  // ── Revenue (won in current window) ──
  let wonTotal = 0;
  let wonCount = 0;
  const byStream: Record<string, number> = {};
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(package_type, 'custom') AS package_type,
              COUNT(*) AS n, COALESCE(SUM(package_value), 0) AS total
       FROM deals WHERE stage = 'won' AND won_at >= ${curFrom}
       GROUP BY package_type`,
      [days],
    );
    for (const r of rows) {
      const t = Number(r.total ?? 0);
      byStream[String(r.package_type)] = t;
      wonTotal += t;
      wonCount += Number(r.n ?? 0);
    }
  } catch {
    /* ignore */
  }

  const revenuePrev = await count(pool, `SELECT COALESCE(SUM(package_value), 0) AS count FROM deals WHERE stage = 'won' AND won_at >= ${prevFrom} AND won_at < ${prevTo}`, [days]);
  const avgDealSize = wonCount > 0 ? Math.round(wonTotal / wonCount) : 0;

  // ── Top open deals by value ──
  const topDeals: BoardReport['topDeals'] = [];
  try {
    const { rows } = await pool.query(
      `SELECT d.id, p.name AS project_name, d.stage,
              COALESCE(d.package_type, 'custom') AS package_type,
              COALESCE(d.package_value, 0) AS value
       FROM deals d JOIN projects p ON p.id = d.project_id
       WHERE d.stage NOT IN ('lost', 'not_started')
       ORDER BY COALESCE(d.package_value, 0) DESC
       LIMIT 10`,
    );
    for (const r of rows) {
      topDeals.push({
        id: String(r.id),
        projectName: String(r.project_name ?? 'Unknown'),
        stage: String(r.stage),
        packageType: String(r.package_type),
        value: Number(r.value ?? 0),
      });
    }
  } catch {
    /* ignore */
  }

  const deltas = {
    enrolled: delta(enrolled, enrolledPrev),
    replied: delta(replied, repliedPrev),
    proposal: delta(proposal, proposalPrev),
    won: delta(won, wonPrev),
    revenue: delta(wonTotal, revenuePrev),
  };

  // ── Deterministic executive summary ──
  const label = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'this quarter';
  const parts: string[] = [];
  parts.push(
    `Pipeline ${label}: ${enrolled} new enrollments (${trend(deltas.enrolled)}), ` +
    `${replied} replies (${trend(deltas.replied)}), ${proposal} in proposal+ (${trend(deltas.proposal)}).`,
  );
  if (won > 0) {
    parts.push(`Closed ${won} deal${won === 1 ? '' : 's'} worth ${fmtUsd(wonTotal)} (${trend(deltas.revenue)} vs prior period), avg ${fmtUsd(avgDealSize)}.`);
  } else {
    parts.push(`No deals closed ${label}${wonPrev > 0 ? ` (down from ${wonPrev} prior period)` : ''}.`);
  }
  if (topDeals.length > 0) {
    const lead = topDeals[0];
    parts.push(`Largest open opportunity: ${lead.projectName} (${lead.stage}, ${fmtUsd(lead.value)}).`);
  }
  // A single deterministic headline signal.
  if (deltas.replied.change < 0) parts.push('Attention: reply volume declined versus the prior period.');
  else if (deltas.won.change > 0) parts.push('Momentum: closed-won is trending up.');

  return {
    period,
    periodDays: days,
    generatedAt: new Date().toISOString(),
    funnel: { enrolled, replied, proposal, won },
    revenue: { wonTotal, wonCount, avgDealSize, byStream },
    topDeals,
    deltas,
    execSummary: parts.join(' '),
  };
}
