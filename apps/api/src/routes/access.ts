import { Hono } from 'hono';
import { TEAM, WORKSPACES, findMemberById } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { requirePurpose } from '../middleware/purpose.js';
import { isSecondTierPrincipal, loadEntitlements, secondTierMayHold } from '../access/entitlements.js';
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

/**
 * WHO MAY ASK. A roster member, or a second-tier `ext:` colleague — anyone who
 * signed in as a PERSON. It used to be roster-only, which turned the second-tier
 * sign-in (`middleware/auth.ts`, requested 2026-08-01) into a dead end: they
 * authenticated, held nothing, and could not even ask. `middleware/workspace.ts`
 * promises the 403 becomes "a request-access surface, never a dead end"; this is
 * the half of that promise that lives on the server.
 *
 * Machines still cannot ask — 'operator'/'monitor:*'/'ai' hold what the
 * constitution declares and nothing is negotiable at request time.
 *
 * A second-tier principal is refused an ELEVATED compartment here rather than
 * being allowed to file a request that `loadEntitlements` would refuse to honour
 * anyway. Telling them "not through this door, get on the roster" is the truthful
 * answer; a pending row nobody can usefully approve is not.
 */
accessRoutes.post('/requests', requireOperator, async (c) => {
  const operator = c.get('operator');
  const secondTier = isSecondTierPrincipal(operator.id);
  if (!findMemberById(operator.id) && !secondTier) {
    return c.json({ error: 'Only roster members can request access', code: 'NOT_A_MEMBER' }, 403);
  }
  const body = await c.req.json<{ workspace?: string; capability?: string; justification?: string }>().catch(() => ({}) as Record<string, never>);
  const ws = WORKSPACES.find((w) => w.id === body.workspace);
  const requested = ['view', 'operate', 'approve'].includes(body.capability ?? '') ? body.capability! : 'view';
  // Second tier never reaches approve-tier: `auth.ts` pins the role to 'operator',
  // so a request for 'approve' is clamped rather than left to be granted and ignored.
  const capability = secondTier && requested === 'approve' ? 'operate' : requested;
  const justification = (body.justification ?? '').trim();
  if (!ws) return c.json({ error: 'Unknown workspace', code: 'VALIDATION' }, 400);
  if (secondTier && !secondTierMayHold(ws.id)) {
    return c.json(
      {
        error: `${ws.name} is not available to second-tier sign-in — it holds elevated material and needs a named roster account`,
        code: 'SECOND_TIER_FORBIDDEN',
        workspace: ws.id,
        workspaceName: ws.name,
      },
      403,
    );
  }
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

/**
 * GET /v1/access/members/:id — the counter-intel dossier (approver-only,
 * purpose-gated): everything this member may see (entitlements + profile) and
 * everything they have recently done (their governed actions, from the audit
 * spine). Viewing it is itself an audited event (purpose:access).
 */
accessRoutes.get('/members/:id', requireOperator, requireApprover, requirePurpose('member dossier'), async (c) => {
  const id = c.req.param('id');
  const member = findMemberById(id);
  if (!member) return c.json({ error: 'No such roster member', code: 'NOT_FOUND' }, 404);
  const pool = getPool();
  let entitlements: Array<{ workspace: string; capability: string; granted_by: string; justification: string | null; granted_at: string }> = [];
  let profile: { unit: string | null; title: string | null; updated_by: string | null; updated_at: string } | null = null;
  let activity: Array<{ action: string; subject_type: string; subject_id: string; created_at: string }> = [];
  let dbLive = true;
  try {
    entitlements = (await pool.query(
      `SELECT workspace, capability, granted_by, justification, granted_at FROM entitlements WHERE member_id=$1 ORDER BY workspace`,
      [id],
    )).rows;
    profile = (await pool.query(
      `SELECT unit, title, updated_by, updated_at FROM member_profiles WHERE member_id=$1`, [id],
    )).rows[0] ?? null;
    // Their footprint: recent governed actions attributed to this member.
    activity = (await pool.query(
      `SELECT action, subject_type, subject_id, created_at FROM object_actions WHERE actor=$1 ORDER BY created_at DESC LIMIT 25`,
      [id],
    )).rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    dbLive = false;
  }
  return c.json({
    data: {
      member: { id: member.id, name: member.name, email: member.email, role: member.role },
      profile, entitlements, activity, dbLive,
    },
  });
});

/**
 * GET /v1/access/activity — the fabric's access telemetry (approver-only):
 * recent grants, revocations, decisions, and purpose-based reads, drawn from
 * the audit spine (no new table — the spine IS the ledger).
 */
accessRoutes.get('/activity', requireOperator, requireApprover, async (c) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT actor, action, entity, entity_id, meta, created_at
         FROM audit_log
        WHERE action IN ('action:grant_entitlement','action:revoke_entitlement','action:decide_access_request','action:set_member_profile','purpose:access')
        ORDER BY created_at DESC LIMIT 50`,
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
  /*
   * SECOND-TIER GRANTS ARE PART OF THE GRID, or the grid is not the grid.
   *
   * `members` is built from TEAM, so every entitlement row whose `member_id` is not a
   * roster id was read out of the database on the line above and then silently
   * dropped. An `ext:` colleague could hold live compartments — the request surface
   * lets them ask, `decide_access_request` writes the row, `loadEntitlements` honours
   * it — and the one screen an approver uses to see who holds what showed nothing.
   * Access you cannot see is access you cannot review or revoke.
   *
   * They are a SEPARATE list rather than fake TEAM entries: a second-tier principal
   * has no name, no email and no roster role, and inventing those would make the
   * matrix look like it knows who this is. It does not — that is the whole point of
   * the honest limit on a shared passcode.
   */
  const rosterIds = new Set(TEAM.map((m) => m.id));
  const secondTierIds = [...new Set(
    entitlementRows.map((e) => e.member_id).filter((id) => !rosterIds.has(id)),
  )].sort();

  return c.json({
    data: {
      members: TEAM.map((m) => ({
        id: m.id, name: m.name, email: m.email, role: m.role,
        profile: profiles.find((p) => p.member_id === m.id) ?? null,
        entitlements: entitlementRows.filter((e) => e.member_id === m.id),
      })),
      secondTier: secondTierIds.map((id) => ({
        id,
        /** What `middleware/auth.ts` knows: the local part of an @lcx.com address. */
        localPart: id.startsWith('ext:') ? id.slice('ext:'.length) : id,
        /** Pinned to operator by `middleware/auth.ts`; never elevated by a grant. */
        role: 'operator' as const,
        entitlements: entitlementRows.filter((e) => e.member_id === id),
        limits:
          'Signed in with the shared second-tier passcode, so this is not an attributable '
          + 'person. Capped to operate and to non-elevated compartments by '
          + 'access/entitlements.ts, whatever the row says.',
      })),
      dbLive,
    },
  });
});
