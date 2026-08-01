/**
 * Governed action registry (Palantir-grade Phase 3.2). Each action declares its
 * subject types, permission, and a typed parameter schema; invokeAction
 * validates, enforces the role and the workspace entitlement, executes, and
 * writes BOTH the object_actions ledger and the hash-chained audit_log.
 *
 * THIS IS NOT THE ONLY WRITE PATH, and this comment used to say it was — "the ONE
 * path every server-side mutation takes". That was false for the whole of Phases
 * 3-7. `POST /v1/intel/actions` → intel/actions.ts `executeAction` is a second
 * path, reached by the object inspector, with its own object_actions and
 * audit_log inserts. Of the five ids it serves, `unflag` and `note_add` have no
 * entry here at all, so they are unreachable through invokeAction and absent from
 * the generated command grammar.
 *
 * That path has been brought up to this one's floor in place — it now validates
 * params with zod, enforces subject type and role via the same `actionsFor` the
 * read side uses, and redacts with the same `redactSecrets` — but it is still a
 * second door. Converging them means adding `unflag` and `note_add` here,
 * delegating executeAction to invokeAction, and regenerating the manifest
 * (`npm run gen:actions`, which rewrites actions/generated/manifest.canonical.json
 * and apps/web/src/lib/command/generated/actionManifest.ts). Until that lands,
 * "one audit spine" is true — both paths write the same two tables — and "one
 * permission gate" is not.
 *
 * Executors reuse existing domain services (notify, createManualTask, …) rather
 * than re-implement them — the registry is the governed front door, not a fork.
 */
import { z } from 'zod';
import type pg from 'pg';
import {
  findMemberById, WORKSPACE_IDS, capAtLeast, emissionBudget,
  type Capability, type WorkspaceId,
} from '@lcx/shared';
import { notify } from '../notifications/service.js';
import { createManualTask } from '../tasks/service.js';
import { DEFAULT_ORG_ID } from '../intel/observations.js';
import {
  loadEntitlements,
  invalidateEntitlements,
  isSecondTierPrincipal,
  secondTierMayHold,
} from '../access/entitlements.js';
import { env } from '../lib/env.js';
import { ActionError } from './types.js';
import type { ActorRole, RegistryAction } from './types.js';
import { GPS_ACTIONS } from '../gps/actions.js';

/**
 * The action contract moved to ./types.js so an action module can live outside
 * this file without a cycle (see the docblock there). Re-exported here because
 * every existing importer names it from this module, and a rename with no
 * behaviour change is churn a reviewer has to read past.
 */
export { ActionError } from './types.js';
export type { ActorRole, ActionContext, RegistryAction } from './types.js';

/** Timing-safe string compare (constant-time when lengths match). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * A missing table is a DEPLOY-ORDER FACT. Every other database error is a FAULT.
 *
 * Migrations here land by hand in the Supabase SQL editor after the API deploys,
 * so a gate whose table does not exist yet must not dead-lock the desk — that is
 * the whole reason these gates have a fallback. But the fallback used to be
 * reached by a bare `catch`, which meant it also fired for faults. Measured
 * against a stub pool (see __tests__/gateFailOpen.test.ts): `57014` statement
 * timeout, `42501` permission denied, `40001` serialization failure and a bare
 * `ECONNRESET` ALL let a gated action through, on both gates. A statement timeout
 * on a busy Postgres therefore silently converted a gated write into an ungated
 * one — the most likely of the four to happen in production, and the least
 * visible, because nothing in the ledger said the gate had been skipped.
 *
 * This is the same rule access/entitlements.ts:69-76 already applies to the
 * entitlement loader, for the same reason it documents at :17-18. Deliberately
 * NOT a list of "safe" codes: the set of faults is open-ended, so the allowlist
 * has exactly one member.
 */
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/**
 * WHICH COMPARTMENT A SUBJECT BELONGS TO — the gate `action.workspace` cannot make.
 *
 * `action.workspace` tags the verb. Three verbs are cross-cutting and carry no tag
 * (`notify`, `watchlist_add`, `flag_review`, all `subjectTypes: ['*']`), so the
 * compartment gate below was skipped for them entirely — and any of them accepts
 * `subjectType: 'gps_engagement'`. A principal holding no GPS grant could therefore
 * write `object_actions` and an `audit_log` row stamped `entity='gps_engagement'`
 * with free text in `meta`, on the audit trail of a client's compliance file.
 *
 * A PREFIX MAP, deliberately: an unlisted subject type keeps its existing
 * behaviour, so this cannot silently start refusing the four compartments that have
 * always worked this way. The one prefix here is the one that holds a third party's
 * confidential material.
 */
const SUBJECT_TYPE_WORKSPACES: ReadonlyArray<[RegExp, WorkspaceId]> = [
  [/^gps_/, 'gps'],
];

export function subjectTypeWorkspace(subjectType: string): WorkspaceId | null {
  for (const [re, ws] of SUBJECT_TYPE_WORKSPACES) if (re.test(subjectType)) return ws;
  return null;
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
    description: 'Take the object off your watchlist, so it stops appearing on your desk.',
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
    execute: async ({ pool, subjectId, params, actor, markGateDegraded }) => {
      // SAT gate (100X Phase 4.2): the two program-critical decisions — exchange
      // model (dec_01) and listing path (dec_19) — cannot be decided without an
      // active premortem AND devil's advocate on file. Soft-block with an
      // audited override (the $25k-deal gate pattern, program-grade). Fail-open
      // ONLY when the reviews table does not exist yet (42P01) — governance must
      // not dead-lock ops on a migration that lands by hand. Any other database
      // error propagates: see isMissingTable for what a bare catch here cost.
      const CRITICAL = new Set(['dec_01', 'dec_19']);
      if (CRITICAL.has(subjectId)) {
        let kinds: string[] = [];
        try {
          const r = await pool.query(
            `SELECT DISTINCT kind FROM analytic_reviews
              WHERE subject_type='command_decision' AND subject_id=$1 AND status='active'
                AND kind IN ('premortem','devils_advocate')`, [subjectId]);
          kinds = r.rows.map((x: { kind: string }) => x.kind);
        } catch (err) {
          if (!isMissingTable(err)) throw err;
          kinds = ['premortem', 'devils_advocate'];
          markGateDegraded('analytic_reviews does not exist (42P01) — the SAT gate on this program-critical decision was NOT evaluated');
        }
        const missing = ['premortem', 'devils_advocate'].filter((k) => !kinds.includes(k));
        if (missing.length > 0) {
          if (!params.overrideSat) {
            throw new ActionError('SAT_REQUIRED',
              `Program-critical decision: run the missing tradecraft first (${missing.join(' + ')}) — or override with a reason.`, 409,
              { missing, subjectType: 'command_decision' });
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
    // `reason` is REQUIRED, not optional: this un-records a decision, and
    // invokeAction writes the params into object_actions.params AND audit_log.meta,
    // so requiring it here is what makes "who reopened dec_01, and why" answerable
    // afterwards. An optional reason would have made it answerable only sometimes.
    //
    // `.min(1)` alone was not enough: it accepts a single space, so the API would
    // take `{ reason: " " }` and record a justification that says nothing — which is
    // "no recorded justification" wearing a character. The UI trims, but the UI is
    // not the authority. The refine is invisible to z.toJSONSchema (see the note in
    // web grammar.ts on advisory validation), so the emitted manifest — and its hash
    // — are unchanged; the server is simply stricter than the generated client.
    paramsSchema: z.object({
      reason: z.string().min(1).max(500).refine((s) => s.trim().length > 0, {
        message: 'reason cannot be blank — a reopen has to say why',
      }),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_decisions SET status='open', chosen=NULL, decided_by=NULL, decided_at=NULL, updated_at=now()
          WHERE id=$1 AND status='decided'`, [subjectId]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Decision not found or not decided', 404);
      // Retract the mirror, or the inverse is only half an inverse.
      //
      // `command_decide` above INSERTs a row into `decisions` — the Phase-4
      // institutional memory, which /decisions presents un-outcomed rows from as
      // live calls ("Open"). Reopening used to clear `command_decisions` and leave
      // that row asserting a choice that no longer exists, so the log that exists
      // to say "why we made the calls we made" kept a call nobody had made.
      //
      // Annotated rather than deleted: "on this date nik recorded choice X" stays
      // TRUE and is the audit trail. What changes is that the row now says it was
      // superseded, and by whom, for what stated reason. Written into `rationale`
      // and not `outcome` deliberately — /decisions renders `outcome` as a green
      // check ("Outcome: …"), which would present a retraction as a success.
      //
      // Best-effort, exactly like the mirror insert it undoes: a lagging decisions
      // table must not block the governance action itself. The reopen HAS happened
      // and is in both ledgers by the time this runs.
      try {
        await pool.query(
          `UPDATE decisions
              SET rationale = left(btrim(rationale || $1), 4000), updated_at = now()
            WHERE subject_type='command_decision' AND subject_id=$2 AND source='command'
              AND rationale NOT LIKE '%[REOPENED%'`,
          [`\n\n[REOPENED by ${actor}] This decision was reopened — the choice above no longer stands. Stated reason: ${String(params.reason).slice(0, 500)}`, subjectId],
        );
      } catch (err) {
        console.warn('[command] decision-log retraction skipped:', err instanceof Error ? err.message : err);
      }
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
      /*
       * WHO MAY BE GRANTED TO — a roster member, or a second-tier `ext:` colleague.
       *
       * This was roster-only, which left the second-tier sign-in half-built. An `ext:`
       * principal can file a request (`routes/access.ts:76`), an approver can approve
       * it, `decide_access_request` writes the row by `req.member_id` with no roster
       * check, and `loadEntitlements` reads it — so the REQUEST path worked end to end
       * while the DIRECT grant an approver would reach for first answered 404 "No
       * roster member". One door open and one shut, for the same decision.
       *
       * THE CEILING IS ENFORCED HERE TOO, and refuses rather than silently clamps.
       * `loadEntitlements` caps an `ext:` map after reading it (`entitlements.ts:146`),
       * so a row granting `gps` or `approve` to a second-tier principal would be
       * stored and then ignored — an approver reading the matrix would believe they
       * had granted something that does nothing. Both bounds come from
       * `secondTierMayHold` / the capability clamp in `access/entitlements.ts`, the
       * same functions the request surface asks, so the three cannot disagree.
       */
      const secondTier = isSecondTierPrincipal(subjectId);
      if (!findMemberById(subjectId) && !secondTier) {
        throw new ActionError('NOT_FOUND', `No roster member '${subjectId}'`, 404);
      }
      if (secondTier && !secondTierMayHold(params.workspace as WorkspaceId)) {
        throw new ActionError(
          'SECOND_TIER_FORBIDDEN',
          `${String(params.workspace)} holds elevated material and is not grantable to a `
          + 'second-tier sign-in. That colleague needs a named roster account; a shared '
          + 'passcode does not reach this compartment even with an approval.',
          403,
          { subjectId, workspace: params.workspace },
        );
      }
      if (secondTier && params.capability === 'approve') {
        throw new ActionError(
          'SECOND_TIER_FORBIDDEN',
          'A second-tier sign-in is pinned to the operator role by middleware/auth.ts, so an '
          + 'approve-tier grant would be stored and then ignored. Grant operate, or put them '
          + 'on the roster.',
          403,
          { subjectId, capability: params.capability },
        );
      }
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
    description: 'Advance a campaign through its lifecycle (launch is compliance-gated).',
    subjectTypes: ['dist_campaign'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      status: z.enum(['draft', 'compliance_review', 'approved', 'live', 'measured']),
      overrideGate: z.boolean().optional(),
      overrideReason: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, role, markGateDegraded }) => {
      const LAUNCH = new Set(['approved', 'live']);
      const target = String(params.status);

      // The COMPLIANCE GATE (LCX ONE Phase 6): launching a token-incentivized
      // campaign requires (a) approver authority, (b) an active premortem AND
      // legal_check review on file, and (c) projected LCX reward spend within
      // the emission budget envelope. Soft-blockable only with an audited
      // override + reason. Fail-open ONLY on 42P01 (the reviews table has not
      // been created yet) so governance never dead-locks ops; every other
      // database error propagates. Non-token campaigns advance freely.
      if (LAUNCH.has(target)) {
        const { rows: crows } = await pool.query<{ token_incentivized: boolean; budget_lcx: string | null }>(
          `SELECT token_incentivized, budget_lcx FROM dist_campaigns WHERE id=$1`, [subjectId],
        );
        const camp = crows[0];
        if (!camp) throw new ActionError('NOT_FOUND', 'Campaign not found', 404);

        if (camp.token_incentivized) {
          // (a) approver-only launch. AUTHORITY IS NOT OVERRIDABLE.
          //
          // This check used to read `role !== 'approver' && !params.overrideGate`,
          // which let any operator launch a token-incentivized campaign simply by
          // sending `overrideGate: true` — a client-supplied boolean defeating an
          // authority requirement. And because the reason is only demanded when
          // there are review/budget blockers, an operator could take that path
          // with no approver and no recorded justification at all.
          //
          // `overrideGate` exists to accept a documented risk on the REVIEW and
          // BUDGET blockers below (with a reason, recorded). It has never been a
          // way to grant yourself authority you do not hold.
          if (role !== 'approver') {
            throw new ActionError('APPROVER_REQUIRED', 'Launching a token-incentivized campaign requires approver authority.', 403);
          }
          // (b) active premortem + legal_check on this campaign.
          let kinds: string[] = [];
          try {
            const r = await pool.query(
              `SELECT DISTINCT kind FROM analytic_reviews
                WHERE subject_type='dist_campaign' AND subject_id=$1 AND status='active'
                  AND kind IN ('premortem','legal_check')`, [subjectId]);
            kinds = r.rows.map((x: { kind: string }) => x.kind);
          } catch (err) {
            if (!isMissingTable(err)) throw err;
            kinds = ['premortem', 'legal_check'];
            markGateDegraded('analytic_reviews does not exist (42P01) — the compliance review half of the launch gate was NOT evaluated');
          }
          const missing = ['premortem', 'legal_check'].filter((k) => !kinds.includes(k));
          // (c) budget envelope via the emission engine.
          const budget = camp.budget_lcx != null ? Number(camp.budget_lcx) : 0;
          const projectedPaidLinks = budget; // 1 paid link ≈ 1 LCX creator reward (Standard)
          const em = emissionBudget({ projectedPaidLinks, creatorRewardLcx: 1, serviceFeeLcx: 1, treasuryBudgetLcx: Math.max(budget, 1) });
          const overBudget = !em.withinBudget;

          const blockers: string[] = [];
          if (missing.length > 0) blockers.push(`compliance review missing (${missing.join(' + ')})`);
          if (overBudget) blockers.push('projected reward spend exceeds the budget envelope');

          if (blockers.length > 0) {
            if (!params.overrideGate) {
              throw new ActionError('COMPLIANCE_GATE',
                `Cannot launch: ${blockers.join('; ')}. File the reviews (subject_type=dist_campaign) or override with a reason.`, 409,
                { blockers, missing, overBudget });
            }
            if (!String(params.overrideReason ?? '').trim()) {
              throw new ActionError('OVERRIDE_REASON_REQUIRED', 'Compliance-gate override requires a reason.', 400);
            }
          }
        }
      }

      const { rowCount } = await pool.query(
        `UPDATE dist_campaigns SET status=$1, updated_at=now() WHERE id=$2`,
        [params.status, subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Campaign not found', 404);
      return { campaignId: subjectId, status: params.status };
    },
  },

};

/**
 * GLOBAL SERVICES (GPS Phase 1). Declared in `../gps/actions.ts` and merged in
 * here rather than written inline like everything above, because these five are
 * the only write paths that touch a third party's commercial terms while the
 * operator is an employee of a regulated exchange — the reasoning for each refusal
 * is long enough that inlining it would bury the other 22 actions.
 *
 * Keyed by `a.id` rather than by repeated literals: every entry above states its
 * id twice (once as the key, once as `id:`), and a mismatch makes the action
 * unreachable through `invokeAction` while leaving it visible in `listActions`.
 * `gps/__tests__/actions.test.ts:657` asserts key === id for all five.
 *
 * WRITTEN AS A LOOP, NOT A SPREAD, and that is the whole point of it. `{ ...desk,
 * ...gps }` is last-wins and silent: a GPS id colliding with a desk id would
 * REPLACE the desk action, so `assign` or `notify` would quietly start demanding
 * the `gps` compartment and refusing every operator who lacks it. No type check
 * catches that (both sides are `RegistryAction`) and no test that merely looks an
 * id up catches it either, because the lookup still succeeds. Refusing at import
 * time means the API fails to boot instead of serving a re-permissioned verb.
 */
for (const a of GPS_ACTIONS) {
  if (ACTION_REGISTRY[a.id]) {
    throw new Error(
      `[actions] GPS action '${a.id}' collides with an existing registry entry — ` +
        'merging it would silently re-permission the desk action it shadows.',
    );
  }
  ACTION_REGISTRY[a.id] = a;
}

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
/**
 * Parameter names that must never reach the ledger, the audit log, or any log
 * line. Matched case-insensitively on a substring so a future
 * `newStepUpPasscode` or `apiSecret` is caught without anyone remembering to
 * extend this list — the failure mode of an allowlist here is a credential in a
 * queryable table, so the bias is deliberately toward over-redacting.
 */
const SECRET_PARAM_PATTERN = /passcode|password|secret|token|apikey|api_key|credential/i;

/** The recordable form of an action's params: same shape, secrets replaced. */
export function redactSecrets(params: Record<string, unknown>): Record<string, unknown> {
  let touched = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    // Name AND type. Matching on the name alone is deliberately over-broad — the
    // tradeoff is documented in authority.test.ts and it is the right way round: a
    // less informative audit row beats a credential in a queryable table. But a
    // BOOLEAN cannot BE a credential, so redacting one buys no safety and does cost
    // information. The case that surfaced it: `dist_campaign_create.tokenIncentivized`
    // matches `token`, so the audit row for creating a token-incentivized campaign did
    // not record that it was token-incentivized — the exact flag that makes the action
    // require an approver, missing from the trail that records the approval.
    //
    // Restricting the exemption to booleans, rather than adding `(?!Incentivized)` to
    // the pattern, keeps the deny-by-default posture intact for every string and
    // generalises: a future `tokenEnabled` or `secretBallot: true` is safe by the same
    // reasoning, and a `token: "eyJ..."` is still destroyed.
    if (SECRET_PARAM_PATTERN.test(k) && typeof v !== 'boolean') {
      // Kept as a present-but-empty marker rather than dropped, so the record
      // still shows that step-up was performed.
      out[k] = '[redacted]';
      touched = true;
    } else {
      out[k] = v;
    }
  }
  return touched ? out : params;
}

/* ══════════════════════ IDEMPOTENCY (Phase 3.3) ══════════════════════
 *
 * THE DEFECT: a transport failure means the RESPONSE was lost, not that the
 * request was. `watchlist_add` is safe to retry (ON CONFLICT DO NOTHING) but
 * `dist_campaign_create` is not — it INSERTs — and every action writes an
 * object_actions row and an audit_log row unconditionally, so a blind retry of
 * ANY action forges a second entry in the ledger the whole programme is audited
 * against. Until this existed the client's only remedy for a dropped connection
 * was "re-open the subject and check by eye" (see the NETWORK branch of
 * apps/web/src/components/command/invoke.ts).
 *
 * THE CONTRACT: the caller supplies a key it generates ONCE per user intent and
 * reuses across transport retries of that same intent. Dedupe is keyed on
 * (action, subjectType, subjectId, key) — not on the params — because two
 * different param sets under one key is a client bug, and silently executing the
 * second one would be the worse failure.
 *
 * WHY A RESERVATION ROW AND NOT "SELECT THEN INSERT": the race that matters is
 * two concurrent retries, not a sequential replay. The reservation is claimed
 * with a single INSERT .. ON CONFLICT DO NOTHING, so exactly one caller can win;
 * the loser either returns the stored result or is told the original is still
 * running. A read-then-write check would let both through.
 *
 * WHAT IS NOT PROVEN: the three writes (ledger, audit, completion) are not in one
 * transaction — neither were the two ledger writes before this. So a process
 * death between `execute` and the completion UPDATE leaves a reservation that
 * looks abandoned, and a retry inside the takeover window below can re-execute.
 * That window is narrower than the pre-existing one (which was unbounded) but it
 * is not zero, and calling it "exactly once" would be false.
 */

const IDEMPOTENCY_KEY_MAX = 200;

/**
 * How long a reservation may sit un-finalised before a retry may take it over.
 * Without a takeover window an API process that died mid-execute would make that
 * key answer 409 forever. Chosen above the 5s connection timeout in db/index.ts
 * and the platform's own request ceiling — NOT measured against real action
 * latencies, because no action here does bounded external work. If a legitimate
 * action ever exceeds this, a concurrent retry can double-execute it.
 */
const IDEMPOTENCY_STALE_MS = 60_000;

type Reservation =
  /** No key supplied — behaves exactly as it did before Phase 3.3. */
  | { mode: 'off' }
  /** The dedupe table does not exist yet (42P01); proceeding unprotected. */
  | { mode: 'degraded'; reason: string }
  /** We own the reservation and must finalise or release it. */
  | { mode: 'held' }
  /** A completed original exists; return its result without re-executing. */
  | { mode: 'replay'; result: Record<string, unknown> };

interface IdemKey { action: string; subjectType: string; subjectId: string; key: string; actor: string }

/** An absent or blank header means "no key", which is not an error. */
function normalizeIdempotencyKey(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX) {
    throw new ActionError('VALIDATION', `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX} characters`);
  }
  return key;
}

const IDEM_BINDS = (k: IdemKey) => [k.action, k.subjectType, k.subjectId, k.key];

async function reserveIdempotency(pool: pg.Pool, k: IdemKey): Promise<Reservation> {
  try {
    // Two attempts, because a losing INSERT followed by a SELECT that finds
    // nothing means the original released its reservation (it failed) in between.
    // That is a real, if narrow, interleaving and the second attempt claims it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const claimed = await pool.query(
        `INSERT INTO action_idempotency (action, subject_type, subject_id, idem_key, actor)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (action, subject_type, subject_id, idem_key) DO NOTHING`,
        [...IDEM_BINDS(k), k.actor],
      );
      if ((claimed.rowCount ?? 0) === 1) return { mode: 'held' };

      const { rows } = await pool.query<{ result: Record<string, unknown> | null; age_ms: string }>(
        `SELECT result, (EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint AS age_ms
           FROM action_idempotency
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`,
        IDEM_BINDS(k),
      );
      const row = rows[0];
      if (!row) continue;
      if (row.result !== null) return { mode: 'replay', result: row.result };

      if (Number(row.age_ms) < IDEMPOTENCY_STALE_MS) {
        // The original is still running. Answering 409 rather than executing is
        // the entire point: a second execution is exactly what the caller was
        // trying to avoid by sending a key.
        throw new ActionError('IDEMPOTENT_IN_FLIGHT',
          'An identical request is still being processed. Wait for it rather than retrying.', 409,
          { idempotencyKey: k.key });
      }
      const taken = await pool.query(
        `UPDATE action_idempotency SET actor=$5, created_at=now()
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4 AND result IS NULL`,
        [...IDEM_BINDS(k), k.actor],
      );
      if ((taken.rowCount ?? 0) === 1) return { mode: 'held' };
    }
    // Lost both races without ever seeing a row. Fall through unprotected rather
    // than refuse a legitimate write — and say so in the ledger.
    return { mode: 'degraded', reason: 'idempotency reservation could not be resolved (contended); replay protection was NOT in force' };
  } catch (err) {
    if (err instanceof ActionError) throw err;
    // Same 42P01 discipline as the gates: migration 0045 lands by hand, so a
    // missing table must not take the write path down. Every other error is a
    // fault and propagates — a broken dedupe table must not quietly become no
    // dedupe at all, which is how the gates above got into trouble.
    if (!isMissingTable(err)) throw err;
    return { mode: 'degraded', reason: 'action_idempotency does not exist (42P01) — replay protection was NOT in force' };
  }
}

/** Publish the result so a later retry replays instead of re-executing. */
async function completeIdempotency(pool: pg.Pool, k: IdemKey, result: Record<string, unknown>): Promise<void> {
  try {
    await pool.query(
      `UPDATE action_idempotency SET result=$5::jsonb, completed_at=now()
        WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`,
      [...IDEM_BINDS(k), JSON.stringify(result)],
    );
  } catch (err) {
    // The action HAS happened and is recorded. Failing the response now would
    // tell the caller it did not, which is the one answer that is certainly
    // wrong — it invites the retry this whole mechanism exists to absorb.
    console.warn('[actions] idempotency completion failed; a retry of this key may re-execute:', err instanceof Error ? err.message : err);
  }
}

/** Drop the reservation so a failed action can be genuinely retried. */
async function releaseIdempotency(pool: pg.Pool, k: IdemKey): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM action_idempotency
        WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4 AND result IS NULL`,
      IDEM_BINDS(k),
    );
  } catch (err) {
    // Swallowed on purpose: the caller is about to receive the real failure and
    // that must not be replaced by a bookkeeping error. Worst case the key stays
    // reserved until the takeover window expires.
    console.warn('[actions] idempotency release failed:', err instanceof Error ? err.message : err);
  }
}

export async function invokeAction(
  pool: pg.Pool,
  id: string,
  input: {
    subjectType: string; subjectId: string; params?: Record<string, unknown>;
    actor: string; role: ActorRole; confirmedBy?: string;
    /** The `Idempotency-Key` request header, verbatim. Absent = no dedupe. */
    idempotencyKey?: string;
  },
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
  /*
   * THE SUBJECT'S COMPARTMENT, NOT ONLY THE ACTION'S.
   *
   * `action.workspace` is the compartment the ACTION belongs to. Three actions carry
   * no tag at all because they are cross-cutting — `watchlist_add`, `flag_review`,
   * `notify` (`subjectTypes: ['*']`) — so the gate below was skipped entirely for
   * them. `POST /v1/actions/watchlist_add/invoke {"subjectType":"gps_engagement"}`
   * therefore let a principal with NO gps grant write `object_actions` and an
   * `audit_log` row with `entity='gps_engagement'` and free text in `meta`, against
   * an engagement id it never had to prove exists. The audit trail of a client's
   * compliance file was writable from outside the compartment.
   *
   * So the subject type is mapped to a compartment too, and BOTH gates run. This is
   * a prefix map rather than an exhaustive registry on purpose: an untagged subject
   * type keeps today's behaviour, and the one prefix that matters — anything
   * `gps_` — is the one holding a third party's material.
   */
  const subjectWorkspace = subjectTypeWorkspace(input.subjectType);
  const gates: Array<{ workspace: WorkspaceId; needed: Capability }> = [];
  if (action.workspace) {
    gates.push({ workspace: action.workspace, needed: action.minRole === 'approver' ? 'approve' : 'operate' });
  }
  if (subjectWorkspace && subjectWorkspace !== action.workspace) {
    gates.push({ workspace: subjectWorkspace, needed: 'operate' });
  }
  if (gates.length > 0) {
    const entitlements = await loadEntitlements(pool, input.actor);
    for (const g of gates) {
      if (!capAtLeast(entitlements[g.workspace], g.needed)) {
        throw new ActionError(
          'WORKSPACE_FORBIDDEN',
          `${id} requires '${g.needed}' on workspace '${g.workspace}'`,
          403,
          { workspace: g.workspace, needed: g.needed },
        );
      }
    }
  }
  const parsed = action.paramsSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    throw new ActionError(
      'VALIDATION',
      parsed.error.issues.map((i) => i.message).join('; '),
      400,
      // Per-field detail so a param prompt can highlight the field that failed
      // instead of showing one concatenated sentence.
      { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    );
  }
  const params = parsed.data as Record<string, unknown>;

  // Replay protection comes AFTER validation and the permission gates: a request
  // that would be refused anyway must not consume a key, or a client that fixed
  // its params and retried under the same key would get the stale refusal.
  const idemKey = normalizeIdempotencyKey(input.idempotencyKey);
  const k: IdemKey | null = idemKey
    ? { action: id, subjectType: input.subjectType, subjectId: input.subjectId, key: idemKey, actor: input.actor }
    : null;
  const reservation: Reservation = k ? await reserveIdempotency(pool, k) : { mode: 'off' };
  if (reservation.mode === 'replay') return reservation.result;

  /**
   * Degradations that occurred while serving THIS request: a gate that could not
   * be evaluated, or replay protection that was not in force. Collected rather
   * than logged so they land in the ledger — a fail-open path that leaves no
   * trace is indistinguishable from the path where everything worked, which is
   * the property that let the bare catches survive seven phases.
   */
  const degradations: string[] = [];
  const markGateDegraded = (reason: string) => {
    if (!degradations.includes(reason)) degradations.push(reason);
  };
  const idempotencyDegraded = reservation.mode === 'degraded' ? reservation.reason : null;

  let result: Record<string, unknown>;
  try {
    result = await action.execute({
      pool, subjectType: input.subjectType, subjectId: input.subjectId,
      params, actor: input.actor, role: input.role, markGateDegraded,
    });
  } catch (err) {
    // The action did not happen, so the key must not be spent — otherwise a
    // client correcting a transient failure would replay a result that never
    // existed.
    if (k && reservation.mode === 'held') await releaseIdempotency(pool, k);
    throw err;
  }

  // The spine — the action ledger and the audit log, both, always.
  //
  // Recorded with the secrets stripped. `revoke_entitlement` takes a
  // `stepUpPasscode` for step-up re-auth, and writing `params` verbatim put the
  // shared desk passcode in plaintext into TWO tables on every revoke, where it
  // would then be readable by anyone with the audit surface. The credential has
  // already served its purpose by this point — it was verified before execute —
  // so the record needs to show only that step-up happened, not what was typed.
  //
  // The degradation markers are stamped on AFTER redaction, deliberately: every
  // paramsSchema is a z.object(), which strips unknown keys, so a client cannot
  // supply `gateDegraded` itself — but building the record in this order means
  // that even if some future schema passed one through, the server's own finding
  // wins rather than being overwritten by the client's.
  const recorded: Record<string, unknown> = { ...redactSecrets(params) };
  if (degradations.length > 0) {
    recorded.gateDegraded = true;
    recorded.gateDegradedReason = degradations.join(' | ');
  }
  if (idempotencyDegraded) {
    recorded.idempotencyDegraded = true;
    recorded.idempotencyDegradedReason = idempotencyDegraded;
  }
  await pool.query(
    `INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [DEFAULT_ORG_ID, input.subjectType, input.subjectId, id, JSON.stringify(recorded), JSON.stringify(result), input.actor],
  );
  // When an AI proposal was confirmed by a human, actor stays 'ai' (the origin)
  // while the audit records who signed off — accountability without pretending
  // the machine acted alone.
  const auditMeta = input.confirmedBy ? { ...recorded, _confirmedBy: input.confirmedBy } : recorded;
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [input.actor, `action:${id}`, input.subjectType, input.subjectId, JSON.stringify(auditMeta)],
  );
  // Published only once the ledger and audit rows exist, so a replay can never
  // return a result for an action that was never recorded.
  if (k && reservation.mode === 'held') await completeIdempotency(pool, k, result);
  return result;
}
