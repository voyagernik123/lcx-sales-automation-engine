/**
 * Auto-WBR (Palantir-grade Phase 4.1) — the Weekly Business Review, composed
 * from data the system already accrues rather than assembled by hand.
 *
 * The `wbr` job (Monday 06:00 UTC) calls writeWbr, which composes the report and
 * upserts it into wbr_reports keyed on the Monday of the week — so every
 * Monday's review is durable and the /wbr page loads instantly. getLatestWbr
 * falls back to composing live when no report is stored yet (before the first
 * cron), so the surface is never empty.
 *
 * Structure mirrors how a desk lead actually reads the week:
 *   inputs   — the activity we controlled (leads worked, outreach, replies)
 *   outputs  — what it produced (stage moves, deals, pipeline $) week-over-week
 *   sparklines — the trailing shape of a few headline series
 *   exceptions — what needs attention (SLA breaches, stalled deals, fired
 *                monitors, job-budget burn)
 *   commitments — open tasks with owners, carried forward
 */
import type pg from 'pg';
import { ownerLabel } from '@lcx/shared';
import type { WbrGpsBlock } from '@lcx/shared';
import { buildOpsHealth } from '../intel/ops.js';

export type MetricKind = 'flow' | 'stock';
export type MetricUnit = 'count' | 'usd_cents' | 'pct';

export interface WbrMetric {
  key: string;
  label: string;
  /** Value at the end of the review week. */
  current: number;
  /** Value a week earlier (for the WoW comparison). */
  previous: number;
  /** current − previous. For flow metrics this is the week's activity. */
  delta: number;
  kind: MetricKind;
  unit: MetricUnit;
  /** true when a higher number is the better outcome (drives tone in the UI). */
  higherIsBetter: boolean;
}

export interface WbrSparkline {
  key: string;
  label: string;
  points: number[];
  unit: MetricUnit;
}

export interface WbrException {
  kind: 'sla_breach' | 'stalled_deal' | 'monitor_fire' | 'budget_burn' | 'program_risk';
  label: string;
  detail: string;
  severity: 'warn' | 'critical';
  href: string | null;
}

export interface WbrCommitment {
  id: string;
  title: string;
  owner: string;
  ownerLabel: string;
  dueAt: string | null;
  overdue: boolean;
  projectName: string | null;
}

export interface WbrReport {
  weekStart: string; // YYYY-MM-DD, Monday
  generatedAt: string;
  inputs: WbrMetric[];
  outputs: WbrMetric[];
  sparklines: WbrSparkline[];
  exceptions: WbrException[];
  commitments: WbrCommitment[];
  narrative: string;
  /** US-launch program block (100X Phase 4.3) — readiness + WoW delta. */
  program?: { readiness: number; readinessDelta: number | null; simP50Days: number | null };
  /** PayAgent distribution block (LCX ONE Phase 6) — presence + campaign posture. */
  distribution?: { presence: number; presenceDelta: number | null; liveListings: number; liveCampaigns: number; rewardSpendLcx: number };
  /**
   * GLOBAL SERVICES block (GPS Phase 12) — the services book as the weekly review
   * sees it. Typed as the SHARED `WbrGpsBlock` rather than an inline shape like its
   * two siblings above, deliberately: it is produced by `wbrGpsBlock()`
   * (`packages/shared/src/gps/loop.ts`), so an inline copy here would be a second
   * declaration of a computed contract and free to drift from the engine that fills
   * it. Every rate inside it is a `SuppressibleRate` whose `pct` is
   * `number | null` — at ~29 engagements a year the block can and does decline to
   * state a percentage, and that null must survive into the report.
   *
   * OPTIONAL, and it stays optional: the GPS compartment is default-deny
   * (`legacy: false`), so a WBR composed for a reader without the `gps` grant must
   * be able to omit the block entirely rather than send zeros that read as a quiet
   * quarter.
   */
  gps?: WbrGpsBlock;
  /** true when composed on the fly (no stored report for the week yet). */
  live?: boolean;
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const back = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
  return monday.toISOString().slice(0, 10);
}

const dayStr = (offsetDays: number): string =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

interface SnapRow {
  snapshot_date: string;
  [k: string]: unknown;
}

/** Latest snapshot on or before `cutoff` (YYYY-MM-DD), or null. */
function snapAtOrBefore(rows: SnapRow[], cutoff: string): SnapRow | null {
  let best: SnapRow | null = null;
  for (const r of rows) {
    if (r.snapshot_date <= cutoff && (!best || r.snapshot_date > best.snapshot_date)) best = r;
  }
  return best;
}

const num = (r: SnapRow | null, col: string): number => Number((r?.[col] as number | string | null) ?? 0);

function metric(
  key: string, label: string, kind: MetricKind, unit: MetricUnit, higherIsBetter: boolean,
  cur: SnapRow | null, prev: SnapRow | null, col: string,
): WbrMetric {
  const current = num(cur, col);
  const previous = num(prev, col);
  return { key, label, current, previous, delta: current - previous, kind, unit, higherIsBetter };
}

const REVENUE_COLS = [
  'revenue_listing', 'revenue_marketing', 'revenue_liquidity', 'revenue_dual', 'revenue_emt', 'revenue_custom',
];
const revenueTotal = (r: SnapRow | null): number => REVENUE_COLS.reduce((s, c) => s + num(r, c), 0);

/** Compose the WBR for the week containing `now` from live data. */
export async function composeWbr(pool: pg.Pool, now = new Date()): Promise<WbrReport> {
  const weekStart = weekStartOf(now);

  // ── Snapshots: everything in the trailing ~9 weeks, so we can pick the
  //    week-end and prior-week-end points and build sparklines. ──
  const { rows: snaps } = await pool.query<SnapRow>(
    `SELECT to_char(snapshot_date,'YYYY-MM-DD') AS snapshot_date,
            new_high_score_leads_week,
            reply_rate_email_sent, reply_rate_email_replied,
            reply_rate_linkedin_sent, reply_rate_linkedin_replied,
            funnel_enrolled, funnel_replied, funnel_proposal, funnel_won,
            revenue_listing, revenue_marketing, revenue_liquidity, revenue_dual, revenue_emt, revenue_custom,
            stalled_deal_count, hot_deals, stalled_deals, overdue_actions
       FROM kpi_daily_snapshots
      WHERE snapshot_date >= $1
      ORDER BY snapshot_date ASC`,
    [dayStr(70)],
  ).catch(() => ({ rows: [] as SnapRow[] }));

  const endCut = dayStr(0);
  const prevCut = dayStr(7);
  const cur = snapAtOrBefore(snaps, endCut);
  const prev = snapAtOrBefore(snaps, prevCut);

  // Derived (composite) columns need their own rows summed.
  const outreachSent = (r: SnapRow | null) => num(r, 'reply_rate_email_sent') + num(r, 'reply_rate_linkedin_sent');
  const replies = (r: SnapRow | null) => num(r, 'reply_rate_email_replied') + num(r, 'reply_rate_linkedin_replied');
  const derived = (
    key: string, label: string, kind: MetricKind, unit: MetricUnit, hib: boolean, fn: (r: SnapRow | null) => number,
  ): WbrMetric => {
    const current = fn(cur), previous = fn(prev);
    return { key, label, current, previous, delta: current - previous, kind, unit, higherIsBetter: hib };
  };

  const inputs: WbrMetric[] = [
    metric('leads', 'New high-score leads', 'stock', 'count', true, cur, prev, 'new_high_score_leads_week'),
    derived('outreach', 'Outreach sent', 'flow', 'count', true, outreachSent),
    derived('replies', 'Replies received', 'flow', 'count', true, replies),
  ];

  const outputs: WbrMetric[] = [
    metric('proposal', 'Proposals out', 'flow', 'count', true, cur, prev, 'funnel_proposal'),
    metric('won', 'Deals won', 'flow', 'count', true, cur, prev, 'funnel_won'),
    derived('revenue', 'Revenue booked', 'flow', 'usd_cents', true, revenueTotal),
    metric('stalled', 'Stalled deals', 'stock', 'count', false, cur, prev, 'stalled_deal_count'),
  ];

  // ── Sparklines: weekly-sampled trailing points (up to 8 weeks). ──
  const weekEnds: string[] = [];
  for (let w = 7; w >= 0; w--) weekEnds.push(dayStr(w * 7));
  const spark = (key: string, label: string, unit: MetricUnit, fn: (r: SnapRow | null) => number): WbrSparkline => ({
    key, label, unit, points: weekEnds.map((d) => fn(snapAtOrBefore(snaps, d))),
  });
  const sparklines: WbrSparkline[] = [
    spark('revenue', 'Revenue', 'usd_cents', revenueTotal),
    spark('won', 'Cumulative wins', 'count', (r) => num(r, 'funnel_won')),
    spark('replies', 'Cumulative replies', 'count', replies),
  ];

  const exceptions = await collectExceptions(pool);
  const commitments = await collectCommitments(pool);

  // US-launch program block (100X Phase 4.3): the readiness composite + the
  // launch-sim P50, with the WoW delta vs last week's stored report. All
  // best-effort — command tables absent → the block is simply omitted.
  let program: WbrReport['program'];
  try {
    const { computeProgramReadiness } = await import('../command/readiness.js');
    const { runLaunchSim } = await import('@lcx/shared');
    const r = await computeProgramReadiness(pool);
    let simP50Days: number | null = null;
    try {
      const { rows } = await pool.query(`SELECT id, title, status, depends_on FROM command_tasks`);
      if (rows.length > 0) {
        simP50Days = runLaunchSim(rows.map((t: Record<string, unknown>) => ({
          id: String(t.id), title: String(t.title), status: String(t.status ?? 'not_started'),
          dependsOn: Array.isArray(t.depends_on) ? (t.depends_on as unknown[]).map(String) : [],
        })), { runs: 500, seed: 42 }).p50Days;
      }
    } catch { /* sim optional */ }
    let readinessDelta: number | null = null;
    try {
      const prev = await pool.query(
        `SELECT payload->'program'->>'readiness' AS r FROM wbr_reports WHERE week_start < $1 ORDER BY week_start DESC LIMIT 1`,
        [weekStart],
      );
      const pr = Number(prev.rows[0]?.r);
      if (Number.isFinite(pr)) readinessDelta = r.score - pr;
    } catch { /* history optional */ }
    program = { readiness: r.score, readinessDelta, simP50Days };
  } catch { /* command module absent — omit */ }

  // PayAgent distribution block (LCX ONE Phase 6): machine-economy presence +
  // live campaign posture + this week's projected reward spend. Best-effort —
  // distribution tables absent → the block is simply omitted.
  let distribution: WbrReport['distribution'];
  try {
    const { presenceScore } = await import('@lcx/shared');
    const { DISTRIBUTION_DEEP_SEED } = await import('../seed/distribution/data.js');
    const listings = (await pool.query<{ surface_id: string; status: string }>(`SELECT surface_id, status FROM dist_listings`)).rows;
    const byId = new Map(listings.map((l) => [l.surface_id, l.status]));
    const pr = presenceScore(DISTRIBUTION_DEEP_SEED.surfaces.map((s) => ({
      surfaceId: s.id, label: s.name,
      status: (byId.get(s.id) as 'not_started' | 'submitted' | 'live' | 'ranked') ?? 'not_started',
    })));
    const liveListings = listings.filter((l) => l.status === 'live' || l.status === 'ranked').length;
    const camps = (await pool.query<{ status: string; budget_lcx: string | null }>(`SELECT status, budget_lcx FROM dist_campaigns`)).rows;
    const liveCampaigns = camps.filter((c) => c.status === 'live').length;
    const rewardSpendLcx = camps.filter((c) => c.status === 'live').reduce((s, c) => s + (c.budget_lcx != null ? Number(c.budget_lcx) : 0), 0);
    let presenceDelta: number | null = null;
    try {
      const prev = await pool.query(
        `SELECT payload->'distribution'->>'presence' AS p FROM wbr_reports WHERE week_start < $1 ORDER BY week_start DESC LIMIT 1`,
        [weekStart],
      );
      const pp = Number(prev.rows[0]?.p);
      if (Number.isFinite(pp)) presenceDelta = pr.presenceScore - pp;
    } catch { /* history optional */ }
    distribution = { presence: pr.presenceScore, presenceDelta, liveListings, liveCampaigns, rewardSpendLcx };
  } catch { /* distribution module/tables absent — omit */ }

  const narrative = buildNarrative(weekStart, inputs, outputs, exceptions, commitments)
    + (program ? ` Launch readiness ${program.readiness}/100${program.readinessDelta != null ? ` (${program.readinessDelta >= 0 ? '+' : ''}${program.readinessDelta} WoW)` : ''}${program.simP50Days != null ? `, sim P50 ~${program.simP50Days}d` : ''}.` : '')
    + (distribution ? ` PayAgent presence ${distribution.presence}/100${distribution.presenceDelta != null ? ` (${distribution.presenceDelta >= 0 ? '+' : ''}${distribution.presenceDelta} WoW)` : ''}, ${distribution.liveListings} listings live, ${distribution.liveCampaigns} campaigns running.` : '');

  return {
    weekStart,
    generatedAt: new Date().toISOString(),
    inputs, outputs, sparklines, exceptions, commitments, narrative,
    ...(program ? { program } : {}),
    ...(distribution ? { distribution } : {}),
  };
}

async function collectExceptions(pool: pg.Pool): Promise<WbrException[]> {
  const out: WbrException[] = [];

  // 1) Source SLA breaches (reuse Ops Health freshness verdicts).
  try {
    const ops = await buildOpsHealth();
    for (const f of ops.freshness) {
      if (f.health === 'down' || f.health === 'stale') {
        out.push({
          kind: 'sla_breach',
          label: `${f.label} — ${f.health}`,
          detail: `${f.stale + f.errored}/${f.tracked} subjects past the ${f.slaDays}d SLA`,
          severity: f.health === 'down' ? 'critical' : 'warn',
          href: '/ops',
        });
      }
    }
  } catch { /* ops unavailable → no SLA exceptions this week */ }

  // 2) Stalled deals — no movement in 7d, still in play.
  const stalled = await pool.query(
    `SELECT d.id, p.name, d.stage,
            FLOOR(EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400) AS days
       FROM deals d JOIN projects p ON p.id = d.project_id
      WHERE d.stage NOT IN ('won','lost','not_started')
        AND d.updated_at < now() - INTERVAL '7 days'
      ORDER BY d.updated_at ASC LIMIT 10`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  for (const r of stalled.rows as Record<string, unknown>[]) {
    out.push({
      kind: 'stalled_deal',
      label: `${r.name} stalled in ${r.stage}`,
      detail: `${Number(r.days)} days without movement`,
      severity: Number(r.days) > 21 ? 'critical' : 'warn',
      href: '/deal-board',
    });
  }

  // 3) Fired monitors in the last 7d — standing watches that tripped.
  const fires = await pool.query(
    `SELECT m.name, COUNT(*) AS n
       FROM monitor_fires mf JOIN monitors m ON m.id = mf.monitor_id
      WHERE mf.fired_at > now() - INTERVAL '7 days'
      GROUP BY m.name ORDER BY n DESC LIMIT 6`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  for (const r of fires.rows as Record<string, unknown>[]) {
    out.push({
      kind: 'monitor_fire',
      label: `Monitor "${r.name}" fired ${Number(r.n)}×`,
      detail: 'Review the matches and confirm the automated action was right.',
      severity: 'warn',
      href: '/monitors',
    });
  }

  // 3b) LCX COMMAND program risks (Wave 2) — blocked launch tasks and the
  //     unconfirmed anchor surface in the same weekly rhythm as everything
  //     else. Degrades quietly when the command tables aren't present yet.
  try {
    const blocked = await pool.query(
      `SELECT id, title, workstream FROM command_tasks WHERE status = 'blocked' ORDER BY id LIMIT 6`,
    );
    for (const r of blocked.rows as Record<string, unknown>[]) {
      out.push({
        kind: 'program_risk',
        label: `Launch task blocked: ${String(r.title)}`,
        detail: `US-launch program (${String(r.workstream ?? 'cross')}) — unblock or re-plan.`,
        severity: 'warn',
        href: '/command-deck',
      });
    }
    const anchor = await pool.query(
      `SELECT COUNT(*) AS n FROM command_launch_targets WHERE confirmed = false`,
    );
    if (Number((anchor.rows[0] as Record<string, unknown>)?.n ?? 0) > 0) {
      out.push({
        kind: 'program_risk',
        label: 'US launch anchor unconfirmed',
        detail: 'Every launch milestone is still tentative — confirm the anchor date.',
        severity: 'warn',
        href: '/command-deck',
      });
    }
  } catch { /* command tables absent (migration 0040 pending) — no program exceptions */ }

  // 4) Job budget burn — any tracked job below 90% success over the week.
  const jobRates = await pool.query(
    `SELECT job_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE status='ok') AS ok
       FROM job_runs WHERE started_at > now() - INTERVAL '7 days'
      GROUP BY job_name`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  for (const r of jobRates.rows as Record<string, unknown>[]) {
    const total = Number(r.total), ok = Number(r.ok);
    if (total >= 3 && ok / total < 0.9) {
      out.push({
        kind: 'budget_burn',
        label: `Job "${r.job_name}" burning error budget`,
        detail: `${ok}/${total} runs succeeded this week (${Math.round((ok / total) * 100)}%)`,
        severity: ok / total < 0.5 ? 'critical' : 'warn',
        href: '/ops',
      });
    }
  }

  return out;
}

async function collectCommitments(pool: pg.Pool): Promise<WbrCommitment[]> {
  // Open tasks carried forward, owned by the deal's owner where there is one.
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.due_at,
            COALESCE(d.owner, t.created_by) AS owner,
            p.name AS project_name,
            (t.due_at IS NOT NULL AND t.due_at < now()) AS overdue
       FROM tasks t
       LEFT JOIN deals d ON d.id = t.deal_id
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'open'
      ORDER BY (t.due_at IS NULL) ASC, t.due_at ASC
      LIMIT 20`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    owner: String(r.owner ?? 'operator'),
    ownerLabel: ownerLabel(String(r.owner ?? 'operator')),
    dueAt: r.due_at ? new Date(r.due_at as string).toISOString() : null,
    overdue: Boolean(r.overdue),
    projectName: r.project_name ? String(r.project_name) : null,
  }));
}

function fmtDelta(m: WbrMetric): string {
  const sign = m.delta > 0 ? '+' : '';
  if (m.unit === 'usd_cents') return `${sign}$${Math.round(m.delta / 100).toLocaleString('en-US')}`;
  return `${sign}${m.delta.toLocaleString('en-US')}`;
}

function buildNarrative(weekStart: string, inputs: WbrMetric[], outputs: WbrMetric[], ex: WbrException[], commit: WbrCommitment[]): string {
  const won = outputs.find((m) => m.key === 'won');
  const rev = outputs.find((m) => m.key === 'revenue');
  const outreach = inputs.find((m) => m.key === 'outreach');
  const parts: string[] = [];
  parts.push(`Week of ${weekStart}.`);
  if (outreach) parts.push(`${fmtDelta(outreach)} outreach sent.`);
  if (won) parts.push(won.delta > 0 ? `${won.delta} deal${won.delta === 1 ? '' : 's'} won` : `No deals closed`);
  if (rev && rev.delta > 0) parts.push(`(${fmtDelta(rev)} booked).`);
  const crit = ex.filter((e) => e.severity === 'critical').length;
  parts.push(ex.length === 0 ? 'No open exceptions.' : `${ex.length} exception${ex.length === 1 ? '' : 's'}${crit ? `, ${crit} critical` : ''}.`);
  const overdue = commit.filter((c) => c.overdue).length;
  if (commit.length) parts.push(`${commit.length} commitment${commit.length === 1 ? '' : 's'} carried forward${overdue ? `, ${overdue} overdue` : ''}.`);
  return parts.join(' ');
}

/** Compose the WBR and persist it (upsert on week_start). Called by the `wbr` job. */
export async function writeWbr(pool: pg.Pool, now = new Date()): Promise<{ weekStart: string; exceptions: number; commitments: number }> {
  const report = await composeWbr(pool, now);
  await pool.query(
    `INSERT INTO wbr_reports (week_start, payload, generated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (week_start) DO UPDATE SET payload = EXCLUDED.payload, generated_at = now()`,
    [report.weekStart, JSON.stringify(report)],
  );
  return { weekStart: report.weekStart, exceptions: report.exceptions.length, commitments: report.commitments.length };
}

/**
 * The CURRENT week's WBR — the stored report when the Monday job has run, else
 * composed live. We resolve the current week explicitly (not just "latest
 * stored"): otherwise, once any week is persisted, a mid-week view before the
 * job fires would serve the PRIOR week's numbers as if they were current.
 */
export async function getLatestWbr(pool: pg.Pool, now = new Date()): Promise<WbrReport> {
  const currentWeek = weekStartOf(now);
  const stored = await getWbrForWeek(pool, currentWeek);
  if (stored) return stored;
  const live = await composeWbr(pool, now);
  live.live = true;
  return live;
}

/** The Monday week-starts we have stored reports for (most recent first). */
export async function listWbrWeeks(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT to_char(week_start,'YYYY-MM-DD') AS w FROM wbr_reports ORDER BY week_start DESC LIMIT 26`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (rows as Record<string, unknown>[]).map((r) => String(r.w));
}

/** A specific week's stored report, or null. */
export async function getWbrForWeek(pool: pg.Pool, weekStart: string): Promise<WbrReport | null> {
  const { rows } = await pool.query(
    `SELECT payload FROM wbr_reports WHERE week_start = $1 LIMIT 1`, [weekStart],
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (rows[0]?.payload as WbrReport | undefined) ?? null;
}
