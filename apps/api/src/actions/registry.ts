/**
 * Governed action registry (Palantir-grade Phase 3.2) — the ONE path every
 * server-side mutation an operator, a monitor (3.1), or the AI operator (Phase
 * 5) takes. Each action declares its subject types, permission, and a typed
 * parameter schema; invokeAction validates, enforces the role, executes, and
 * writes BOTH the object_actions ledger and the hash-chained audit_log. One
 * audit spine, one permission gate, one place new capabilities are added.
 *
 * Executors reuse existing domain services (notify, createManualTask, …) rather
 * than re-implement them — the registry is the governed front door, not a fork.
 */
import { z } from 'zod';
import type pg from 'pg';
import { findMemberById, WORKSPACE_IDS, capAtLeast, type WorkspaceId } from '@lcx/shared';
import { notify } from '../notifications/service.js';
import { createManualTask } from '../tasks/service.js';
import { DEFAULT_ORG_ID } from '../intel/observations.js';
import { loadEntitlements, invalidateEntitlements } from '../access/entitlements.js';
import { env } from '../lib/env.js';

/** Timing-safe string compare (constant-time when lengths match). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export type ActorRole = 'operator' | 'approver';

export interface ActionContext {
  pool: pg.Pool;
  subjectType: string;
  subjectId: string;
  params: Record<string, unknown>;
  actor: string;
}

export interface RegistryAction {
  id: string;
  label: string;
  description: string;
  subjectTypes: string[]; // ['project'] or ['*']
  minRole: ActorRole;
  /**
   * LCX OS compartment (Phase 1): when set, invokeAction additionally requires
   * the actor to hold this workspace at 'operate' (or 'approve' when minRole
   * is approver). Untagged actions rely on minRole alone — cross-cutting desk
   * actions stay workspace-free by design.
   */
  workspace?: WorkspaceId;
  paramsSchema: z.ZodType<Record<string, unknown>>;
  execute: (ctx: ActionContext) => Promise<Record<string, unknown>>;
}

export class ActionError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const projectOnly = ['project'];

export const ACTION_REGISTRY: Record<string, RegistryAction> = {
  notify: {
    id: 'notify',
    label: 'Send notification',
    description: 'Raise an in-app notification on the subject.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional(), href: z.string().max(300).optional() }),
    execute: async ({ subjectType, subjectId, params }) => {
      await notify({
        rule: 'monitor',
        title: String(params.title),
        detail: params.detail as string | undefined,
        projectId: subjectType === 'project' ? subjectId : undefined,
        href: params.href as string | undefined,
        dedupKey: `monitor:${subjectId}:${String(params.title).slice(0, 40)}`,
      });
      return { notified: true };
    },
  },
  create_task: {
    id: 'create_task',
    label: 'Create follow-up task',
    description: 'Queue a task on the project.',
    subjectTypes: projectOnly,
    minRole: 'operator',
    paramsSchema: z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional() }),
    execute: async ({ subjectId, params }) => {
      const id = await createManualTask({ title: String(params.title), detail: params.detail as string | undefined, projectId: subjectId });
      return { taskId: id };
    },
  },
  watchlist_add: {
    id: 'watchlist_add',
    label: 'Add to watchlist',
    description: 'Pin the object to the desk watchlist.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ note: z.string().max(300).optional() }),
    execute: async ({ pool, subjectType, subjectId, params, actor }) => {
      await pool.query(
        `INSERT INTO watchlist (org_id, subject_type, subject_id, note, added_by)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, subject_type, subject_id) DO NOTHING`,
        [DEFAULT_ORG_ID, subjectType, subjectId, (params.note as string) ?? null, actor],
      );
      return { watchlisted: true };
    },
  },
  watchlist_remove: {
    id: 'watchlist_remove',
    label: 'Remove from watchlist',
    description: 'Unpin the object.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({}),
    execute: async ({ pool, subjectType, subjectId }) => {
      await pool.query(
        `DELETE FROM watchlist WHERE org_id=$1 AND subject_type=$2 AND subject_id=$3`,
        [DEFAULT_ORG_ID, subjectType, subjectId],
      );
      return { watchlisted: false };
    },
  },
  track: {
    id: 'track',
    label: 'Track token',
    description: 'Promote a catalog token into the tracked (deep-intel) tier.',
    subjectTypes: projectOnly,
    minRole: 'operator',
    paramsSchema: z.object({}),
    execute: async ({ pool, subjectId }) => {
      const { rowCount } = await pool.query(`UPDATE projects SET tier='tracked', updated_at=now() WHERE id=$1 AND tier<>'tracked'`, [subjectId]);
      return { tier: 'tracked', promoted: (rowCount ?? 0) > 0 };
    },
  },
  flag_review: {
    id: 'flag_review',
    label: 'Flag for review',
    description: 'Mark the object for analyst review (logged only).',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ reason: z.string().max(300).optional() }),
    execute: async () => ({ flagged: true }),
  },
  /* ── LCX COMMAND (Wave 2) — the CEO acts through the deck, governed. ──
   * Human-confirmed only: none of these are in AI_PROPOSABLE. Every enum is
   * whitelisted here so a crafted payload can't write arbitrary state. */
  command_set_task_status: {
    id: 'command_set_task_status',
    label: 'Set program task status',
    description: 'Advance a US-launch program task (LCX COMMAND).',
    subjectTypes: ['command_task'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      status: z.enum(['not_started', 'pending', 'open', 'in_progress', 'blocked', 'tentative', 'future', 'done']),
    }),
    execute: async ({ pool, subjectId, params }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_tasks SET status=$1, updated_at=now() WHERE id=$2`,
        [String(params.status), subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Program task not found', 404);
      return { status: params.status };
    },
  },
  command_decide: {
    id: 'command_decide',
    label: 'Record program decision',
    description: 'Close an open US-launch decision with the chosen option (LCX COMMAND).',
    subjectTypes: ['command_decision'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      chosen: z.string().min(1).max(500),
      rationale: z.string().max(2000).optional(),
      overrideSat: z.boolean().optional(),
      overrideReason: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      // SAT gate (100X Phase 4.2): the two program-critical decisions — exchange
      // model (dec_01) and listing path (dec_19) — cannot be decided without an
      // active premortem AND devil's advocate on file. Soft-block with an
      // audited override (the $25k-deal gate pattern, program-grade). Fail-open
      // if the reviews table is unavailable — governance must not dead-lock ops.
      const CRITICAL = new Set(['dec_01', 'dec_19']);
      if (CRITICAL.has(subjectId)) {
        let kinds: string[] = [];
        try {
          const r = await pool.query(
            `SELECT DISTINCT kind FROM analytic_reviews
              WHERE subject_type='command_decision' AND subject_id=$1 AND status='active'
                AND kind IN ('premortem','devils_advocate')`, [subjectId]);
          kinds = r.rows.map((x: { kind: string }) => x.kind);
        } catch { kinds = ['premortem', 'devils_advocate']; }
        const missing = ['premortem', 'devils_advocate'].filter((k) => !kinds.includes(k));
        if (missing.length > 0) {
          if (!params.overrideSat) {
            throw new ActionError('SAT_REQUIRED',
              `Program-critical decision: run the missing tradecraft first (${missing.join(' + ')}) — or override with a reason.`, 409);
          }
          if (!String(params.overrideReason ?? '').trim()) {
            throw new ActionError('OVERRIDE_REASON_REQUIRED', 'SAT override requires a reason.', 400);
          }
          // The override + reason land in the audit meta via invokeAction's params log.
        }
      }
      const { rows } = await pool.query(
        `UPDATE command_decisions
            SET status='decided', chosen=$1, decided_by=$2, decided_at=now(), updated_at=now()
          WHERE id=$3 AND status='open'
          RETURNING decision, phase`,
        [String(params.chosen), actor, subjectId],
      );
      if (rows.length === 0) throw new ActionError('NOT_FOUND', 'Decision not found or already decided', 404);
      // Institutional memory: mirror into the Phase-4 decision log. Best-effort —
      // a lagging decisions table must never block the program decision itself.
      try {
        await pool.query(
          `INSERT INTO decisions (title, context, decision, rationale, owner, subject_type, subject_id, source)
           VALUES ($1,$2,$3,$4,$5,'command_decision',$6,'command')`,
          [
            `US launch: ${String(rows[0].decision).slice(0, 150)}`,
            `LCX COMMAND ${rows[0].phase ?? ''} decision register.`,
            String(params.chosen).slice(0, 2000),
            String(params.rationale ?? '').slice(0, 4000),
            actor,
            subjectId,
          ],
        );
      } catch (err) {
        console.warn('[command] decision-log mirror skipped:', err instanceof Error ? err.message : err);
      }
      return { decided: true, chosen: params.chosen };
    },
  },
  command_reopen_decision: {
    id: 'command_reopen_decision',
    label: 'Reopen program decision',
    description: 'Reopen a wrongly-recorded US-launch decision (approver only; fully audited).',
    subjectTypes: ['command_decision'],
    minRole: 'approver',
    workspace: 'command',
    paramsSchema: z.object({ reason: z.string().min(1).max(500) }),
    execute: async ({ pool, subjectId }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_decisions SET status='open', chosen=NULL, decided_by=NULL, decided_at=NULL, updated_at=now()
          WHERE id=$1 AND status='decided'`, [subjectId]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Decision not found or not decided', 404);
      return { reopened: true };
    },
  },
  command_set_partner_stage: {
    id: 'command_set_partner_stage',
    label: 'Set partner pipeline stage',
    description: 'Move a US-launch partner through the pipeline (LCX COMMAND).',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      stage: z.enum([
        'evaluate', 'recommended_rfi', 'recommended', 'incumbent_onboarding', 'in_progress',
        'select', 'support', 'alternate', 'specialist', 'hold_geoblock', 'exclude_pending_counsel',
        'signed', 'passed',
      ]),
    }),
    execute: async ({ pool, subjectId, params }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_partners SET pipeline_stage=$1, updated_at=now() WHERE id=$2`,
        [String(params.stage), subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Partner not found', 404);
      return { stage: params.stage };
    },
  },
  command_set_partner_details: {
    id: 'command_set_partner_details',
    label: 'Set partner contact/terms',
    description: 'Fill a partner\'s primary contact or commercial terms as the RFIs land (LCX COMMAND).',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      primaryContact: z.string().max(300).optional(),
      terms: z.string().max(1000).optional(),
    }).refine((v) => v.primaryContact !== undefined || v.terms !== undefined, { message: 'Nothing to update' }),
    execute: async ({ pool, subjectId, params }) => {
      const sets: string[] = []; const vals: unknown[] = []; let i = 1;
      if (params.primaryContact !== undefined) { sets.push(`primary_contact=$${i++}`); vals.push(String(params.primaryContact).slice(0, 300) || null); }
      if (params.terms !== undefined) { sets.push(`terms=$${i++}`); vals.push(String(params.terms).slice(0, 1000) || null); }
      sets.push('updated_at=now()');
      vals.push(subjectId);
      const { rowCount } = await pool.query(`UPDATE command_partners SET ${sets.join(', ')} WHERE id=$${i}`, vals);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Partner not found', 404);
      return { updated: true };
    },
  },
  command_set_requirement_status: {
    id: 'command_set_requirement_status',
    label: 'Set listing-requirement status',
    description: 'Update one of the 14 listing requirements (LCX COMMAND) — moves the readiness dial.',
    subjectTypes: ['command_requirement'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({ status: z.enum(['Not started', 'In progress', 'Done']) }),
    execute: async ({ pool, subjectId, params }) => {
      const num = Number(subjectId);
      if (!Number.isInteger(num) || num < 1 || num > 99) throw new ActionError('VALIDATION', 'Bad requirement id');
      const { rowCount } = await pool.query(
        `UPDATE command_requirements SET status=$1, updated_at=now() WHERE num=$2`, [String(params.status), num]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Requirement not found', 404);
      return { status: params.status };
    },
  },
  command_set_blocker_status: {
    id: 'command_set_blocker_status',
    label: 'Set launch-blocker status',
    description: 'Track resolution of one of the 12 launch blockers (LCX COMMAND).',
    subjectTypes: ['command_blocker'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({ status: z.enum(['open', 'mitigating', 'resolved']) }),
    execute: async ({ pool, subjectId, params }) => {
      const num = Number(subjectId);
      if (!Number.isInteger(num) || num < 1 || num > 99) throw new ActionError('VALIDATION', 'Bad blocker id');
      const { rowCount } = await pool.query(
        `UPDATE command_blockers SET status=$1, updated_at=now() WHERE num=$2`, [String(params.status), num]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Blocker not found', 404);
      return { status: params.status };
    },
  },
  command_rfi_record: {
    id: 'command_rfi_record',
    label: 'Record RFI terms',
    description: 'Record a partner\'s returned RFI commercial terms (LCX COMMAND). Provenance auto-upgrades: returned=B2, signed=A1.',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      status: z.enum(['issued', 'returned', 'signed']),
      values: z.record(z.string().max(60), z.string().max(300)).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      // Whitelist value keys against the compiled RFI schema — a crafted payload
      // can't smuggle arbitrary keys into the jsonb.
      const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
      const valid = new Set(((COMMAND_DEEP_SEED as unknown as { rfi: { fields: Array<{ key: string }> } }).rfi.fields).map((f) => f.key));
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries((params.values as Record<string, string>) ?? {})) {
        if (valid.has(k) && String(v).trim()) values[k] = String(v).trim();
      }
      const status = String(params.status);
      const grade = status === 'signed' ? 'A1' : status === 'returned' ? 'B2' : null;
      const { rowCount } = await pool.query(
        `INSERT INTO command_rfi (partner_id, status, owner, grade, values, issued_at, returned_at)
         VALUES ($1,$2,$3,$4,$5::jsonb, CASE WHEN $2='issued' THEN now() END, CASE WHEN $2 IN ('returned','signed') THEN now() END)
         ON CONFLICT (partner_id) DO UPDATE SET
           status=EXCLUDED.status, owner=EXCLUDED.owner,
           grade=COALESCE(EXCLUDED.grade, command_rfi.grade),
           values=command_rfi.values || EXCLUDED.values,
           returned_at=COALESCE(EXCLUDED.returned_at, command_rfi.returned_at),
           updated_at=now()`,
        [subjectId, status, actor, grade, JSON.stringify(values)],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('CONFLICT', 'RFI write failed');
      return { status, grade, fields: Object.keys(values).length };
    },
  },
  assign: {
    id: 'assign',
    label: 'Assign owner',
    description: 'Give a deal, monitor, or PIR a real desk owner (a lane, not the shared catch-all).',
    subjectTypes: ['deal', 'monitor', 'pir'],
    minRole: 'operator',
    paramsSchema: z.object({ owner: z.string().min(1).max(64) }),
    execute: async ({ pool, subjectType, subjectId, params }) => {
      const owner = String(params.owner);
      // The target must be a real desk member (or the shared 'operator' lane) —
      // never let ownership point at a principal that can't hold it.
      if (owner !== 'operator' && !findMemberById(owner)) {
        throw new ActionError('VALIDATION', `Unknown owner: ${owner}`);
      }
      const table = subjectType === 'deal' ? 'deals' : subjectType === 'monitor' ? 'monitors' : 'pirs';
      const { rowCount } = await pool.query(`UPDATE ${table} SET owner = $1 WHERE id = $2`, [owner, subjectId]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', `${subjectType} not found`, 404);
      return { owner, subjectType };
    },
  },
  /* ── LCX OS (LCX ONE Phase 1) — the governed access lifecycle. ──
   * Access is given, never assumed: every grant/revoke/decision is an audited
   * object action carrying who, what, and why. Approver-only, human-only
   * (none of these are AI_PROPOSABLE). */
  grant_entitlement: {
    id: 'grant_entitlement',
    label: 'Grant workspace access',
    description: 'Entitle a roster member to a workspace at a capability tier (LCX OS).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]),
      capability: z.enum(['view', 'operate', 'approve']),
      justification: z.string().min(1).max(500),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      if (!findMemberById(subjectId)) throw new ActionError('NOT_FOUND', `No roster member '${subjectId}'`, 404);
      await pool.query(
        `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (member_id, workspace)
         DO UPDATE SET capability=EXCLUDED.capability, granted_by=EXCLUDED.granted_by,
                       justification=EXCLUDED.justification, granted_at=now()`,
        [subjectId, params.workspace, params.capability, actor, params.justification],
      );
      invalidateEntitlements(subjectId);
      await notify({
        rule: 'access',
        title: `Access granted: ${String(params.workspace)} (${String(params.capability)})`,
        detail: `${actor} entitled ${subjectId} — ${String(params.justification)}`,
        dedupKey: `access-grant:${subjectId}:${String(params.workspace)}:${Date.now()}`,
      });
      return { memberId: subjectId, workspace: params.workspace, capability: params.capability };
    },
  },
  revoke_entitlement: {
    id: 'revoke_entitlement',
    label: 'Revoke workspace access',
    description: 'Remove a roster member’s entitlement to a workspace (LCX OS).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]),
      justification: z.string().min(1).max(500),
      /** Step-up: the desk passcode, re-entered at action time (Phase 2). */
      stepUpPasscode: z.string().min(1).max(200),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      // Step-up re-auth (LCX ONE Phase 2): revocation is destructive, so it
      // demands a fresh passcode at action time — a live human deliberately
      // re-authorizing, not a cached session firing. Timing-safe.
      if (!safeEqual(String(params.stepUpPasscode), env.deskPasscode)) {
        throw new ActionError('STEP_UP_REQUIRED', 'Revocation requires re-entering the desk passcode.', 401);
      }
      // Lockout protection: an approver cannot saw off the branch they sit on.
      // Revoking your own governance access would strand the access system
      // itself; another approver must do it.
      if (subjectId === actor && params.workspace === 'governance') {
        throw new ActionError('SELF_LOCKOUT', 'You cannot revoke your own governance access — another approver must.', 400);
      }
      const { rowCount } = await pool.query(
        `DELETE FROM entitlements WHERE member_id=$1 AND workspace=$2`,
        [subjectId, params.workspace],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'No such entitlement', 404);
      invalidateEntitlements(subjectId);
      return { memberId: subjectId, workspace: params.workspace, revoked: true };
    },
  },
  set_member_profile: {
    id: 'set_member_profile',
    label: 'Set member profile',
    description: 'Record a roster member’s unit and title (LCX OS Directorate).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      unit: z.string().max(80).optional(),
      title: z.string().max(120).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      if (!findMemberById(subjectId)) throw new ActionError('NOT_FOUND', `No roster member '${subjectId}'`, 404);
      await pool.query(
        `INSERT INTO member_profiles (member_id, unit, title, updated_by, updated_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (member_id)
         DO UPDATE SET unit=EXCLUDED.unit, title=EXCLUDED.title, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [subjectId, (params.unit as string) ?? null, (params.title as string) ?? null, actor],
      );
      return { memberId: subjectId, unit: params.unit ?? null, title: params.title ?? null };
    },
  },
  decide_access_request: {
    id: 'decide_access_request',
    label: 'Decide access request',
    description: 'Approve or deny a pending workspace access request (LCX OS).',
    subjectTypes: ['access_request'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      decision: z.enum(['approved', 'denied']),
      note: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rows } = await pool.query<{ member_id: string; workspace: string; capability: string; status: string }>(
        `SELECT member_id, workspace, capability, status FROM access_requests WHERE id=$1`,
        [subjectId],
      );
      const req = rows[0];
      if (!req) throw new ActionError('NOT_FOUND', 'Access request not found', 404);
      if (req.status !== 'pending') throw new ActionError('ALREADY_DECIDED', `Request is already ${req.status}`, 409);
      await pool.query(
        `UPDATE access_requests SET status=$1, decided_by=$2, decided_at=now(), decision_note=$3 WHERE id=$4`,
        [params.decision, actor, (params.note as string) ?? null, subjectId],
      );
      if (params.decision === 'approved') {
        await pool.query(
          `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (member_id, workspace)
           DO UPDATE SET capability=EXCLUDED.capability, granted_by=EXCLUDED.granted_by,
                         justification=EXCLUDED.justification, granted_at=now()`,
          [req.member_id, req.workspace, req.capability, actor, `access_request:${subjectId}`],
        );
        invalidateEntitlements(req.member_id);
      }
      await notify({
        rule: 'access',
        title: `Access request ${String(params.decision)}: ${req.workspace}`,
        detail: `${actor} ${String(params.decision)} ${req.member_id}'s request for ${req.capability} on ${req.workspace}`,
        dedupKey: `access-decide:${subjectId}`,
      });
      return { requestId: subjectId, decision: params.decision, workspace: req.workspace, memberId: req.member_id };
    },
  },
  /* ── DISTRIBUTION COMMAND (LCX ONE Phase 5) — the governed surface loop. ──
   * Listing status + campaign lifecycle. The Phase-6 compliance gate + budget
   * cap will layer on top of dist_campaign_set_status (launch transitions). */
  dist_listing_set_status: {
    id: 'dist_listing_set_status',
    label: 'Set listing status',
    description: 'Advance a distribution surface through the listing pipeline.',
    subjectTypes: ['dist_listing'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      status: z.enum(['not_started', 'submitted', 'live', 'ranked']),
      rankNote: z.string().max(200).optional(),
      usageNote: z.string().max(200).optional(),
      url: z.string().max(300).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rowCount } = await pool.query(
        `UPDATE dist_listings
           SET status=$1,
               rank_note=COALESCE($2, rank_note),
               usage_note=COALESCE($3, usage_note),
               url=COALESCE($4, url),
               updated_by=$5, updated_at=now()
         WHERE surface_id=$6`,
        [params.status, (params.rankNote as string) ?? null, (params.usageNote as string) ?? null, (params.url as string) ?? null, actor, subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Listing not found', 404);
      return { surfaceId: subjectId, status: params.status };
    },
  },
  dist_campaign_create: {
    id: 'dist_campaign_create',
    label: 'Create distribution campaign',
    description: 'Draft a quest/incentive/content/outreach campaign (starts in draft).',
    subjectTypes: ['distribution'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      name: z.string().min(1).max(160),
      surfaceId: z.string().max(60).optional(),
      kind: z.enum(['quest', 'incentive', 'content', 'outreach']),
      tokenIncentivized: z.boolean().optional(),
      budgetLcx: z.number().nonnegative().optional(),
      detail: z.string().max(1000).optional(),
    }),
    execute: async ({ pool, params, actor }) => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO dist_campaigns (name, surface_id, kind, token_incentivized, budget_lcx, detail, owner, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [params.name, (params.surfaceId as string) ?? null, params.kind, params.tokenIncentivized ?? false, (params.budgetLcx as number) ?? null, (params.detail as string) ?? null, actor],
      );
      return { campaignId: rows[0]!.id, status: 'draft' };
    },
  },
  dist_campaign_set_status: {
    id: 'dist_campaign_set_status',
    label: 'Set campaign status',
    description: 'Advance a campaign through its lifecycle (Phase 6 gates launch).',
    subjectTypes: ['dist_campaign'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      status: z.enum(['draft', 'compliance_review', 'approved', 'live', 'measured']),
    }),
    execute: async ({ pool, subjectId, params }) => {
      const { rowCount } = await pool.query(
        `UPDATE dist_campaigns SET status=$1, updated_at=now() WHERE id=$2`,
        [params.status, subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Campaign not found', 404);
      return { campaignId: subjectId, status: params.status };
    },
  },
};

export function listActions(): Array<Pick<RegistryAction, 'id' | 'label' | 'description' | 'subjectTypes' | 'minRole'>> {
  return Object.values(ACTION_REGISTRY).map((a) => ({
    id: a.id, label: a.label, description: a.description, subjectTypes: a.subjectTypes, minRole: a.minRole,
  }));
}

/**
 * Invoke a governed action. Validates params, enforces the role, executes, and
 * writes the object_actions ledger + audit_log. `actor`/`role` come from the
 * authenticated principal (or 'monitor:<id>' when a monitor fires it).
 */
export async function invokeAction(
  pool: pg.Pool,
  id: string,
  input: { subjectType: string; subjectId: string; params?: Record<string, unknown>; actor: string; role: ActorRole; confirmedBy?: string },
): Promise<Record<string, unknown>> {
  const action = ACTION_REGISTRY[id];
  if (!action) throw new ActionError('UNKNOWN_ACTION', `No such action: ${id}`, 404);
  if (!action.subjectTypes.includes('*') && !action.subjectTypes.includes(input.subjectType)) {
    throw new ActionError('WRONG_SUBJECT', `${id} does not apply to ${input.subjectType}`);
  }
  if (action.minRole === 'approver' && input.role !== 'approver') {
    throw new ActionError('FORBIDDEN', `${id} requires approver`, 403);
  }
  // LCX OS compartment gate (Phase 1): workspace-tagged actions require the
  // actor to hold the workspace at operate-tier (approve-tier when the action
  // itself is approver-only). Machines (shared key, monitor:<id>, ai) hold
  // blanket operate; the fail-open loader keeps pre-0042 deploys safe.
  if (action.workspace) {
    const entitlements = await loadEntitlements(pool, input.actor);
    const needed = action.minRole === 'approver' ? 'approve' : 'operate';
    if (!capAtLeast(entitlements[action.workspace], needed)) {
      throw new ActionError(
        'WORKSPACE_FORBIDDEN',
        `${id} requires '${needed}' on workspace '${action.workspace}'`,
        403,
      );
    }
  }
  const parsed = action.paramsSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    throw new ActionError('VALIDATION', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const params = parsed.data as Record<string, unknown>;
  const result = await action.execute({ pool, subjectType: input.subjectType, subjectId: input.subjectId, params, actor: input.actor });

  // The spine — ledger + hash-chained audit, both, always.
  await pool.query(
    `INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [DEFAULT_ORG_ID, input.subjectType, input.subjectId, id, JSON.stringify(params), JSON.stringify(result), input.actor],
  );
  // When an AI proposal was confirmed by a human, actor stays 'ai' (the origin)
  // while the audit records who signed off — accountability without pretending
  // the machine acted alone.
  const auditMeta = input.confirmedBy ? { ...params, _confirmedBy: input.confirmedBy } : params;
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [input.actor, `action:${id}`, input.subjectType, input.subjectId, JSON.stringify(auditMeta)],
  );
  return result;
}
