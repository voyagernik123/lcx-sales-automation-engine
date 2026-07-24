import { Hono } from 'hono';
import { TEAM, WORKSPACES, findMemberById } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { loadEntitlements } from '../access/entitlements.js';
import { getPool } from '../db/index.js';
import { notify } from '../notifications/service.js';

/**
 * LCX OS access API (LCX ONE Phase 1) — the need-to-know front door.
 *
 * GET  /v1/access/me        — my entitlements + profile + the workspace constitution
 * POST /v1/access/requests  — ask for a workspace (justification mandatory)
 * GET  /v1/access/requests  — mine; approvers see everyone's (?status= filter)
 * GET  /v1/access/matrix    — approver-only: the full member × workspace grid
 *
 * Writes that CHANGE access (grant/revoke/decide) are NOT here — they are
 * governed registry actions, so every change lands in the audit spine.
 * Every read degrades gracefully pre-0042 (dbLive:false + legacy view).
 */
export const accessRoutes = new Hono<{ Variables: AuthVariables }>();

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string }).code === '42P01';
}

accessRoutes.get('/me', requireOperator, async (c) => {
  const operator = c.get('operator');
  const pool = getPool();
  const entitlements = await loadEntitlements(pool, operator.id);
  let profile: { unit: string | null; title: string | null } | null = null;
  let dbLive = true;
  try {
    const { rows } = await pool.query<{ unit: string | null; title: string | null }>(
      `SELECT unit, title FROM member_profiles WHERE member_id=$1`,
      [operator.id],
    );
    profile = rows[0] ?? null;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    dbLive = false;
  }
  return c.json({
    data: {
      memberId: operator.id,
      role: operator.role,
      entitlements,
      profile,
      workspaces: WORKSPACES.map((w) => ({
        id: w.id, name: w.name, mission: w.mission, icon: w.icon,
        defaultLanding: w.defaultLanding, sensitivity: w.sensitivity,
      })),
      dbLive,
    },
  });
});

accessRoutes.post('/requests', requireOperator, async (c) => {
  const operator = c.get('operator');
  if (!findMemberById(operator.id)) {
    return c.json({ error: 'Only roster members can request access', code: 'NOT_A_MEMBER' }, 403);
  }
  const body = await c.req.json<{ workspace?: string; capability?: string; justification?: string }>().catch(() => ({}) as Record<string, never>);
  const ws = WORKSPACES.find((w) => w.id === body.workspace);
  const capability = ['view', 'operate', 'approve'].includes(body.capability ?? '') ? body.capability! : 'view';
  const justification = (body.justification ?? '').trim();
  if (!ws) return c.json({ error: 'Unknown workspace', code: 'VALIDATION' }, 400);
  if (justification.length < 10) {
    return c.json({ error: 'Purpose-based access: a justification (≥10 chars) is mandatory', code: 'VALIDATION' }, 400);
  }
  const pool = getPool();
  try {
    // One pending request per member × workspace — resubmits refresh it.
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM access_requests WHERE member_id=$1 AND workspace=$2 AND status='pending'`,
      [operator.id, ws.id],
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE access_requests SET capability=$1, justification=$2, created_at=now() WHERE id=$3`,
        [capability, justification, existing.rows[0].id],
      );
      return c.json({ data: { id: existing.rows[0].id, status: 'pending', refreshed: true } });
    }
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO access_requests (member_id, workspace, capability, justification)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [operator.id, ws.id, capability, justification],
    );
    await notify({
      rule: 'access',
      title: `Access request: ${ws.name}`,
      detail: `${operator.id} requests ${capability} — ${justification.slice(0, 140)}`,
      href: '/access',
      dedupKey: `access-request:${operator.id}:${ws.id}`,
    });
    return c.json({ data: { id: rows[0]!.id, status: 'pending' } }, 201);
  } catch (err) {
    if (isMissingTable(err)) {
      return c.json({ error: 'Access system pending migration 0042', code: 'DB_NOT_READY' }, 503);
    }
    throw err;
  }
});

accessRoutes.get('/requests', requireOperator, async (c) => {
  const operator = c.get('operator');
  const status = c.req.query('status');
  const pool = getPool();
  try {
    const isApprover = operator.role === 'approver';
    const params: string[] = [];
    const where: string[] = [];
    if (!isApprover) { params.push(operator.id); where.push(`member_id=$${params.length}`); }
    if (status && ['pending', 'approved', 'denied'].includes(status)) {
      params.push(status); where.push(`status=$${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT id, member_id, workspace, capability, justification, status, created_at, decided_by, decided_at, decision_note
       FROM access_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT 100`,
      params,
    );
    return c.json({ data: rows, meta: { dbLive: true } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ data: [], meta: { dbLive: false } });
    throw err;
  }
});

accessRoutes.get('/matrix', requireOperator, requireApprover, async (c) => {
  const pool = getPool();
  let entitlementRows: Array<{ member_id: string; workspace: string; capability: string; granted_by: string; justification: string | null; granted_at: string }> = [];
  let profiles: Array<{ member_id: string; unit: string | null; title: string | null }> = [];
  let dbLive = true;
  try {
    entitlementRows = (await pool.query(`SELECT member_id, workspace, capability, granted_by, justification, granted_at FROM entitlements ORDER BY member_id, workspace`)).rows;
    profiles = (await pool.query(`SELECT member_id, unit, title FROM member_profiles`)).rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    dbLive = false;
  }
  return c.json({
    data: {
      members: TEAM.map((m) => ({
        id: m.id, name: m.name, email: m.email, role: m.role,
        profile: profiles.find((p) => p.member_id === m.id) ?? null,
        entitlements: entitlementRows.filter((e) => e.member_id === m.id),
      })),
      dbLive,
    },
  });
});
