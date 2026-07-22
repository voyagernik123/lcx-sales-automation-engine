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
import { notify } from '../notifications/service.js';
import { createManualTask } from '../tasks/service.js';
import { DEFAULT_ORG_ID } from '../intel/observations.js';

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
  input: { subjectType: string; subjectId: string; params?: Record<string, unknown>; actor: string; role: ActorRole },
): Promise<Record<string, unknown>> {
  const action = ACTION_REGISTRY[id];
  if (!action) throw new ActionError('UNKNOWN_ACTION', `No such action: ${id}`, 404);
  if (!action.subjectTypes.includes('*') && !action.subjectTypes.includes(input.subjectType)) {
    throw new ActionError('WRONG_SUBJECT', `${id} does not apply to ${input.subjectType}`);
  }
  if (action.minRole === 'approver' && input.role !== 'approver') {
    throw new ActionError('FORBIDDEN', `${id} requires approver`, 403);
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
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [input.actor, `action:${id}`, input.subjectType, input.subjectId, JSON.stringify(params)],
  );
  return result;
}
