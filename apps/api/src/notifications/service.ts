/**
 * In-app notifications — rule-driven alerts surfaced in the bell. Rules run
 * daily via the jobs CLI (plus inline hooks for replies); dedup keys keep
 * re-runs quiet.
 *
 * NEED-TO-KNOW (0067). Every read and every write here is compartment-scoped.
 * Before 0067 the list was `SELECT … ORDER BY created_at DESC LIMIT n` with no
 * filter at all, so every operator's bell showed every compartment's alerts, and
 * `markRead('all')` cleared rows the actor could not see. The table now records
 * which compartment an alert belongs to and every path takes the reader's scopes
 * as a REQUIRED argument — there is no default, because a default is how the
 * first version leaked.
 */
import type pg from 'pg';
import { sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { capAtLeast, type EntitlementMap, type WorkspaceId, WORKSPACES } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { emitNotification } from './events.js';

/**
 * Deliberate desk-level scope — alerts every member sees, mirroring
 * `workspaceForPath()` returning null for desk surfaces. It is an explicit
 * sentinel and NOT the same as a NULL column: NULL means UNATTRIBUTED (a legacy
 * row predating 0067), which is withheld from everyone and counted aloud.
 * Conflating "everyone may see this" with "we do not know who may see this" is
 * the failure mode this distinction exists to prevent.
 */
export const DESK_SCOPE = '_desk' as const;
export type NotificationScope = WorkspaceId | typeof DESK_SCOPE;

export interface AppNotification {
  id: string;
  rule: string;
  title: string;
  detail: string | null;
  projectId: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  /** Which compartment this belongs to. Never null on the read path — unattributed rows are withheld. */
  workspace: NotificationScope;
}

export interface NotificationPage {
  items: AppNotification[];
  /** Unread count WITHIN the reader's scopes. Never a global count. */
  unread: number;
  /** Rows in compartments this reader does not hold. Visible redaction, never silent. */
  withheld: number;
  /** Legacy rows with no compartment recorded. Withheld from EVERYONE, counted so they are not lost. */
  unattributed: number;
  /** The scopes this page was computed for, so the count above is interpretable. */
  scopes: readonly NotificationScope[];
}

/**
 * The scopes a reader may see: every compartment they hold at >= 'view', plus the
 * desk. Machine principals already hold their compartments via `machineMap()`, so
 * cron keeps working without a special case here.
 */
export function scopesFor(entitlements: EntitlementMap): NotificationScope[] {
  const held = WORKSPACES.filter((w) => capAtLeast(entitlements[w.id], 'view')).map((w) => w.id);
  return [...held, DESK_SCOPE];
}

/** `workspace IN (…)` with one bound parameter per scope. Never string-concatenated. */
function scopeList(scopes: readonly NotificationScope[]): SQL {
  return sql.join(
    scopes.map((s) => sql`${s}`),
    sql`, `,
  );
}

export async function notify(input: {
  rule: string;
  title: string;
  /**
   * REQUIRED. The compartment this alert belongs to, or DESK_SCOPE for an alert
   * every member should see. There is deliberately no default: omitting it is a
   * compile error, which is the only reliable way to stop the next rule from
   * writing an unreadable row.
   */
  workspace: NotificationScope;
  detail?: string;
  projectId?: string;
  href?: string;
  dedupKey?: string;
}): Promise<void> {
  const db = getDb();
  const id = randomUUID();
  const result = await db.execute(sql`
    INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
    VALUES (${id}, ${input.rule}, ${input.title}, ${input.detail ?? null},
            ${input.projectId ?? null}, ${input.href ?? null}, ${input.dedupKey ?? null},
            ${input.workspace})
    ON CONFLICT DO NOTHING
  `);
  // Push to live SSE listeners only when the row was actually inserted
  // (dedup conflicts stay quiet, same as the daily sweep). The workspace rides
  // along so the stream can filter per subscriber — without it the bus would
  // still broadcast every compartment to every connected client.
  if ((result.rowCount ?? 0) > 0) {
    emitNotification({
      id,
      rule: input.rule,
      title: input.title,
      detail: input.detail ?? null,
      projectId: input.projectId ?? null,
      href: input.href ?? null,
      createdAt: new Date().toISOString(),
      workspace: input.workspace,
    });
  }
}

export async function listNotifications(
  scopes: readonly NotificationScope[],
  limit = 30,
): Promise<NotificationPage> {
  const db = getDb();

  // Counts of what this reader is NOT being shown. Reported rather than dropped:
  // "3 items withheld" is how a compartmented system tells you something is
  // there without telling you what it is. Both counts are over the whole table,
  // not the current page, so they do not move when `limit` does.
  const hiddenCounts = db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE workspace IS NULL)                          AS unattributed,
      COUNT(*) FILTER (WHERE workspace IS NOT NULL
        ${scopes.length ? sql`AND workspace NOT IN (${scopeList(scopes)})` : sql``}) AS withheld
    FROM notifications
  `);

  // An actor holding nothing sees nothing — but is still told the size of what
  // it cannot see. `IN ()` is a syntax error, so the query is skipped entirely
  // rather than assembled with an empty list.
  if (scopes.length === 0) {
    const hidden = await hiddenCounts;
    const h = (hidden.rows?.[0] ?? {}) as Record<string, unknown>;
    return {
      items: [],
      unread: 0,
      withheld: Number(h.withheld ?? 0),
      unattributed: Number(h.unattributed ?? 0),
      scopes,
    };
  }

  const [itemsResult, unreadResult, hidden] = await Promise.all([
    db.execute(sql`
      SELECT id, rule, title, detail, project_id, href, read_at, created_at, workspace
      FROM notifications
      WHERE workspace IN (${scopeList(scopes)})
      ORDER BY created_at DESC LIMIT ${Math.min(limit, 100)}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS n FROM notifications
      WHERE read_at IS NULL AND workspace IN (${scopeList(scopes)})
    `),
    hiddenCounts,
  ]);

  const h = (hidden.rows?.[0] ?? {}) as Record<string, unknown>;
  return {
    items: (itemsResult.rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      rule: String(r.rule),
      title: String(r.title),
      detail: r.detail ? String(r.detail) : null,
      projectId: r.project_id ? String(r.project_id) : null,
      href: r.href ? String(r.href) : null,
      readAt: r.read_at ? String(r.read_at) : null,
      createdAt: String(r.created_at),
      workspace: String(r.workspace) as NotificationScope,
    })),
    unread: Number((unreadResult.rows?.[0] as Record<string, unknown> | undefined)?.n ?? 0),
    withheld: Number(h.withheld ?? 0),
    unattributed: Number(h.unattributed ?? 0),
    scopes,
  };
}

/**
 * Mark read, scoped. Returns how many rows changed so the caller can refuse
 * rather than report a cheerful `{ ok: true }` for something it did not do.
 *
 * Both limbs were holes before 0067: `'all'` cleared every compartment's unread
 * rows, and the by-id limb updated on a bare `WHERE id = $1`, so a guessed uuid
 * was actionable across a boundary the actor could not read.
 */
export async function markRead(
  id: string | 'all',
  scopes: readonly NotificationScope[],
): Promise<{ changed: number }> {
  if (scopes.length === 0) return { changed: 0 };
  const db = getDb();
  const res =
    id === 'all'
      ? await db.execute(sql`
          UPDATE notifications SET read_at = NOW()
          WHERE read_at IS NULL AND workspace IN (${scopeList(scopes)})
        `)
      : await db.execute(sql`
          UPDATE notifications SET read_at = NOW()
          WHERE id = ${id} AND workspace IN (${scopeList(scopes)})
        `);
  return { changed: res.rowCount ?? 0 };
}

/** Daily rule sweep — each block is idempotent via dedup keys. */
export async function evaluateAlertRules(pool: pg.Pool): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // 1. Stalled deals (dedup per deal per week)
  const stalled = await pool.query(`
    INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
    SELECT gen_random_uuid(), 'deal_stalled',
           'Deal stalled: ' || p.name,
           'no movement for ' || FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400) || ' days in ' || d.stage,
           d.project_id, '/deal-board',
           'stalled:' || d.id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'sales'
    FROM deals d JOIN projects p ON p.id = d.project_id
    WHERE d.stage NOT IN ('won', 'lost', 'not_started')
      AND d.updated_at < NOW() - INTERVAL '7 days'
    ON CONFLICT DO NOTHING
  `);
  counts.deal_stalled = stalled.rowCount ?? 0;

  // 2. Competitor listed a lead we're working (from exchange sync signals)
  const competitor = await pool.query(`
    INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
    SELECT gen_random_uuid(), 'competitor_listing',
           'Competitor listed ' || p.name,
           'new exchange(s): ' || COALESCE(s.payload->>'exchanges', '?'),
           s.project_id, '/bd-pipeline/' || s.project_id,
           'complist:' || s.id, 'sales'
    FROM signals s JOIN projects p ON p.id = s.project_id
    WHERE s.kind = 'competitor_listing' AND s.observed_at > NOW() - INTERVAL '2 days'
    ON CONFLICT DO NOTHING
  `);
  counts.competitor_listing = competitor.rowCount ?? 0;

  // 3. Discovery found a contact on a high-priority lead
  const discovery = await pool.query(`
    INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
    SELECT gen_random_uuid(), 'discovery_found',
           'Contact found: ' || p.name,
           pl.email || ' (' || pl.email_status || ')',
           pl.project_id, '/bd-pipeline/' || pl.project_id,
           'discovery:' || pl.id, 'sales'
    FROM people pl
    JOIN projects p ON p.id = pl.project_id
    LEFT JOIN scores sc ON sc.project_id = pl.project_id
    WHERE pl.enriched_by = 'discovery' AND pl.created_at > NOW() - INTERVAL '2 days'
      AND COALESCE(sc.priority_score, 0) >= 20
    ON CONFLICT DO NOTHING
  `);
  counts.discovery_found = discovery.rowCount ?? 0;

  // 4. Decision reviews due (Phase 4.2) — a logged decision whose review-by date
  //    has arrived and whose outcome is still open. Dedup per decision per week.
  //    Degrades quietly when the decisions table is absent (migration pending).
  try {
    const reviews = await pool.query(`
      INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
      SELECT gen_random_uuid(), 'decision_review_due',
             'Decision review due: ' || d.title,
             'Owned by ' || d.owner || ' — record the outcome.',
             NULL, '/decisions',
             'decrev:' || d.id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'governance'
      FROM decisions d
      WHERE d.review_by IS NOT NULL AND d.review_by <= CURRENT_DATE AND d.outcome IS NULL
      ON CONFLICT DO NOTHING
    `);
    counts.decision_review_due = reviews.rowCount ?? 0;
  } catch {
    counts.decision_review_due = 0;
  }

  // 5. LCX COMMAND program monitors (100X Phase 4.3) — stale RFIs (issued >14d,
  //    nothing back) and the two program-critical decisions still undecided.
  //    Dedup per subject per week; degrades when command tables are absent.
  try {
    const staleRfi = await pool.query(`
      INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
      SELECT gen_random_uuid(), 'command_rfi_stale',
             'RFI stale: ' || p.name,
             'Issued ' || FLOOR(EXTRACT(EPOCH FROM (NOW() - r.issued_at)) / 86400) || 'd ago, nothing returned — chase or re-plan.',
             NULL, '/command-partners',
             'rfistale:' || r.partner_id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'command'
      FROM command_rfi r JOIN command_partners p ON p.id = r.partner_id
      WHERE r.status = 'issued' AND r.issued_at < NOW() - INTERVAL '14 days'
      ON CONFLICT DO NOTHING
    `);
    counts.command_rfi_stale = staleRfi.rowCount ?? 0;
    const critOpen = await pool.query(`
      INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
      SELECT gen_random_uuid(), 'command_critical_open',
             'Program-critical decision open: ' || d.decision,
             'Gates integration work — run the tradecraft and decide.',
             NULL, '/command-deck',
             'critopen:' || d.id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'command'
      FROM command_decisions d
      WHERE d.id IN ('dec_01','dec_19') AND d.status = 'open'
      ON CONFLICT DO NOTHING
    `);
    counts.command_critical_open = critOpen.rowCount ?? 0;
  } catch {
    counts.command_rfi_stale = 0;
  }

  // 6. DISTRIBUTION monitors (LCX ONE Phase 6) — stale listings (submitted
  //    >14d, no result), and token-incentivized campaigns that reached
  //    live/approved WITHOUT a compliance review on file (a governance
  //    guardrail that fires even if a launch was overridden). Weekly dedup;
  //    degrades when distribution tables are absent.
  try {
    const staleListing = await pool.query(`
      INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
      SELECT gen_random_uuid(), 'dist_listing_stale',
             'Listing stalled: ' || surface_id,
             'Submitted ' || FLOOR(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) || 'd ago, still not live — chase or re-plan.',
             NULL, '/distribution/listings',
             'diststale:' || surface_id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'distribution'
      FROM dist_listings
      WHERE status = 'submitted' AND updated_at < NOW() - INTERVAL '14 days'
      ON CONFLICT DO NOTHING
    `);
    counts.dist_listing_stale = staleListing.rowCount ?? 0;

    const uncleared = await pool.query(`
      INSERT INTO notifications (id, rule, title, detail, project_id, href, dedup_key, workspace)
      SELECT gen_random_uuid(), 'dist_campaign_uncleared',
             'Token campaign live without compliance: ' || c.name,
             'A token-incentivized campaign is ' || c.status || ' but has no active premortem + legal_check on file — review or pause.',
             NULL, '/distribution/campaigns',
             'distuncleared:' || c.id || ':' || TO_CHAR(NOW(), 'IYYY-IW'), 'distribution'
      FROM dist_campaigns c
      WHERE c.token_incentivized = true AND c.status IN ('approved','live')
        AND (SELECT COUNT(DISTINCT kind) FROM analytic_reviews
              WHERE subject_type='dist_campaign' AND subject_id=c.id AND status='active'
                AND kind IN ('premortem','legal_check')) < 2
      ON CONFLICT DO NOTHING
    `);
    counts.dist_campaign_uncleared = uncleared.rowCount ?? 0;
  } catch {
    counts.dist_listing_stale = 0;
  }

  return counts;
}
