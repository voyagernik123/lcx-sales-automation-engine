/**
 * Weekly digest — one in-app notification per ISO week summarising the state
 * of play per operator: the three riskiest open deals (staleness-ranked),
 * the count of open handoffs, and the stalled-deal list grouped by owner.
 * In-app only (no email/Telegram); dedup key `digest:<IYYY-IW>` keeps
 * re-runs within the same week quiet.
 */
import type pg from 'pg';
import { notify } from './service.js';

export interface DigestDeal {
  id: string;
  projectName: string;
  stage: string;
  owner: string;
  daysSinceUpdate: number;
}

export interface WeeklyDigestResult {
  isoWeek: string;
  openHandoffs: number;
  stalledCount: number;
  riskiest: DigestDeal[];
  notified: boolean;
}

const mapDeal = (r: Record<string, unknown>): DigestDeal => ({
  id: String(r.id),
  projectName: String(r.project_name),
  stage: String(r.stage),
  owner: String(r.owner ?? 'operator'),
  daysSinceUpdate: Number(r.days_since_update ?? 0),
});

export async function runWeeklyDigest(pool: pg.Pool): Promise<WeeklyDigestResult> {
  const isoWeek = String(
    (await pool.query(`SELECT TO_CHAR(NOW(), 'IYYY-IW') AS week`)).rows[0]?.week ?? '',
  );

  const [riskiestRes, handoffsRes, stalledRes] = await Promise.all([
    pool.query(`
      SELECT d.id, d.stage, COALESCE(d.owner, 'operator') AS owner, p.name AS project_name,
             FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400)::int AS days_since_update
      FROM deals d JOIN projects p ON p.id = d.project_id
      WHERE d.stage NOT IN ('won', 'lost')
      ORDER BY d.updated_at ASC
      LIMIT 3
    `),
    pool.query(`SELECT COUNT(*)::int AS n FROM handoffs WHERE status = 'open'`),
    pool.query(`
      SELECT d.id, d.stage, COALESCE(d.owner, 'operator') AS owner, p.name AS project_name,
             FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400)::int AS days_since_update
      FROM deals d JOIN projects p ON p.id = d.project_id
      WHERE d.stage NOT IN ('won', 'lost', 'not_started')
        AND d.updated_at < NOW() - INTERVAL '7 days'
      ORDER BY d.updated_at ASC
    `),
  ]);

  const riskiest = riskiestRes.rows.map(mapDeal);
  const stalled = stalledRes.rows.map(mapDeal);
  const openHandoffs = Number(handoffsRes.rows[0]?.n ?? 0);

  // Per-operator grouping of the stalled list (deal owners are the operators).
  const stalledByOwner = new Map<string, DigestDeal[]>();
  for (const d of stalled) {
    const list = stalledByOwner.get(d.owner) ?? [];
    list.push(d);
    stalledByOwner.set(d.owner, list);
  }

  const parts: string[] = [];
  if (riskiest.length > 0) {
    parts.push(
      'Top risk: ' +
        riskiest.map((d) => `${d.projectName} (${d.stage}, ${d.daysSinceUpdate}d stale, ${d.owner})`).join('; '),
    );
  }
  parts.push(`Open handoffs: ${openHandoffs}`);
  if (stalled.length > 0) {
    const byOwner = [...stalledByOwner.entries()]
      .map(([owner, deals]) => `${owner}: ${deals.slice(0, 5).map((d) => d.projectName).join(', ')}${deals.length > 5 ? ` +${deals.length - 5} more` : ''}`)
      .join(' | ');
    parts.push(`Stalled (${stalled.length}) — ${byOwner}`);
  } else {
    parts.push('Stalled: none');
  }

  const dedupKey = `digest:${isoWeek}`;
  await notify({
    rule: 'weekly_digest',
    // SALES, not DESK_SCOPE. The digest body is entirely deals and handoffs —
    // project names, stages and owners — so a desk-level alert would put sales
    // content in every member's bell. The href ('/') is desk-level; the CONTENT
    // is what decides the scope.
    workspace: 'sales',
    title: `Weekly digest — W${isoWeek}`,
    detail: parts.join(' • '),
    href: '/',
    dedupKey,
  });

  const check = await pool.query(`SELECT 1 FROM notifications WHERE dedup_key = $1`, [dedupKey]);
  return {
    isoWeek,
    openHandoffs,
    stalledCount: stalled.length,
    riskiest,
    notified: (check.rowCount ?? 0) > 0,
  };
}
