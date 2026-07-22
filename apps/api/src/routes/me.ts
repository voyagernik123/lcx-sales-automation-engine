import { Hono } from 'hono';
import { TEAM } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';

/**
 * Protected probe — the client's source of truth for identity and role.
 * The principal's `role` is now server-authoritative (set from the desk roster
 * in requireOperator), and we attach the resolved member profile so the client
 * shows the same name/role the API is enforcing — not a client-side guess.
 */
export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.get('/', requireOperator, (c) => {
  const operator = c.get('operator');
  const member = TEAM.find((m) => m.id === operator.id) ?? null;
  return c.json({
    data: {
      ...operator,
      // `canApprove` is derived once here so the client never has to re-map
      // the role → capability itself; the server owns that decision.
      canApprove: operator.role === 'approver',
      member: member ? { id: member.id, name: member.name, email: member.email, role: member.role } : null,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
  });
});

/**
 * GET /v1/me/desk — MY DESK (Phase 4.4). The five-person desk's lanes: the
 * deals I own, my monitors' recent fires, my open commitments (tasks on my
 * deals), and the decisions waiting on my review. Each block degrades to empty
 * on its own so a lagging migration never blanks the whole view.
 */
meRoutes.get('/desk', requireOperator, async (c) => {
  const me = c.get('operator').id;
  const pool = getPool();
  const meta = () => ({ timestamp: new Date().toISOString(), version: process.env.npm_package_version ?? '0.1.0' });

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [deals, monitorFires, commitments, decisions] = await Promise.all([
    safe(async () => {
      const { rows } = await pool.query(
        `SELECT d.id, d.stage, d.package_value, d.updated_at, p.name AS project_name, p.ticker,
                FLOOR(EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400) AS days_since_update
           FROM deals d JOIN projects p ON p.id = d.project_id
          WHERE d.owner = $1 AND d.stage NOT IN ('won','lost')
          ORDER BY d.updated_at ASC LIMIT 25`, [me]);
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id, stage: r.stage, projectName: r.project_name, ticker: r.ticker,
        packageValue: r.package_value != null ? Number(r.package_value) : null,
        daysSinceUpdate: Math.floor(Number(r.days_since_update ?? 0)),
      }));
    }, [] as unknown[]),
    safe(async () => {
      const { rows } = await pool.query(
        `SELECT m.id AS monitor_id, m.name, mf.subject_id, mf.fired_at
           FROM monitor_fires mf JOIN monitors m ON m.id = mf.monitor_id
          WHERE m.owner = $1 AND mf.fired_at > now() - INTERVAL '30 days'
          ORDER BY mf.fired_at DESC LIMIT 25`, [me]);
      return rows.map((r: Record<string, unknown>) => ({
        monitorId: r.monitor_id, name: r.name, subjectId: r.subject_id, firedAt: r.fired_at,
      }));
    }, [] as unknown[]),
    safe(async () => {
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.due_at, p.name AS project_name,
                (t.due_at IS NOT NULL AND t.due_at < now()) AS overdue
           FROM tasks t
           LEFT JOIN deals d ON d.id = t.deal_id
           LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.status = 'open' AND (d.owner = $1 OR t.created_by = $1)
          ORDER BY (t.due_at IS NULL) ASC, t.due_at ASC LIMIT 25`, [me]);
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id, title: r.title, dueAt: r.due_at, projectName: r.project_name, overdue: Boolean(r.overdue),
      }));
    }, [] as unknown[]),
    safe(async () => {
      const { rows } = await pool.query(
        `SELECT id, title, review_by, subject_type, subject_id
           FROM decisions
          WHERE owner = $1 AND outcome IS NULL AND review_by IS NOT NULL AND review_by <= CURRENT_DATE
          ORDER BY review_by ASC LIMIT 25`, [me]);
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id, title: r.title, reviewBy: r.review_by ? String(r.review_by).slice(0, 10) : null,
        subjectType: r.subject_type, subjectId: r.subject_id,
      }));
    }, [] as unknown[]),
  ]);

  return c.json({ data: { owner: me, deals, monitorFires, commitments, decisions }, meta: meta() });
});
