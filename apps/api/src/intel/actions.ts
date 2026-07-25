import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { actionsFor, getAction, type TeamRole } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { ActionError, redactSecrets } from '../actions/registry.js';
import { DEFAULT_ORG_ID } from './observations.js';

export interface ObjectState {
  watchlisted: boolean;
  flagged: boolean;
}

/** Current derived state of an object for the action bar (toggles). */
export async function getObjectState(subjectType: string, subjectId: string): Promise<ObjectState> {
  const db = getDb();
  const wl = await db.execute(sql`
    SELECT 1 FROM watchlist
    WHERE org_id = ${DEFAULT_ORG_ID} AND subject_type = ${subjectType} AND subject_id = ${subjectId}
    LIMIT 1
  `);
  // Flag state = the latest of the flag/unflag pair.
  const flag = await db.execute(sql`
    SELECT action FROM object_actions
    WHERE subject_type = ${subjectType} AND subject_id = ${subjectId} AND action IN ('flag_review', 'unflag')
    ORDER BY created_at DESC LIMIT 1
  `);
  return {
    watchlisted: (wl.rows?.length ?? 0) > 0,
    flagged: flag.rows?.[0]?.action === 'flag_review',
  };
}

export interface ExecuteActionInput {
  subjectType: string;
  subjectId: string;
  action: string;
  actor: string;
  /**
   * The principal's role, so the write path can enforce what the read path
   * advertises. Required rather than defaulted: a caller that forgets it should
   * fail to compile, not silently get the floor.
   */
  role: TeamRole;
  params?: Record<string, unknown>;
}

/**
 * PARAM SCHEMAS FOR THIS PATH.
 *
 * `body.params` used to arrive here unvalidated and go straight into
 * `object_actions.params` and `audit_log.meta` as raw `JSON.stringify` — an
 * unbounded, unshaped client blob in two governed tables, on a route that
 * bypasses ACTION_REGISTRY entirely (see the note at the top of
 * actions/registry.ts, which this path falsified).
 *
 * The three that also exist in ACTION_REGISTRY carry the SAME shape and limits as
 * their registry entries, deliberately: two schemas for one action id that
 * disagree would be worse than one loose schema, because a client would be
 * validated differently depending on which door it used.
 */
const PARAM_SCHEMAS: Record<string, z.ZodType<Record<string, unknown>>> = {
  // Mirrors ACTION_REGISTRY.watchlist_add — the `note` column is the same column.
  watchlist_add: z.object({ note: z.string().max(300).optional() }),
  watchlist_remove: z.object({}),
  // Mirrors ACTION_REGISTRY.flag_review.
  flag_review: z.object({ reason: z.string().max(300).optional() }),
  // No registry entry exists for these two; these are their first schemas.
  unflag: z.object({}),
  // min(1): the old code accepted `note_add` with no note at all and recorded
  // `{ note: '' }` — an audit row asserting a note was added when none was.
  note_add: z.object({ note: z.string().min(1).max(2000) }),
};

/**
 * Execute a governed server action: mutate the domain, record it in the action
 * ledger AND the hash-chained audit_log (attribution), and return the new state.
 */
export async function executeAction(input: ExecuteActionInput): Promise<{ result: Record<string, unknown>; state: ObjectState }> {
  const def = getAction(input.action);
  if (!def) throw new ActionError('UNKNOWN_ACTION', `No such action: ${input.action}`, 404);
  if (def.client) throw new ActionError('CLIENT_ONLY_ACTION', `${input.action} is handled by the client`, 400);

  const db = getDb();
  const { subjectType, subjectId, actor } = input;

  // Subject type AND role, checked with the SAME function GET /v1/intel/actions
  // uses to advertise availability. Reusing actionsFor rather than re-deriving
  // the rule is the point: the write path cannot drift from what the read path
  // offered. Neither check existed here before — nothing stopped a request for an
  // action the object type does not accept.
  const permitted = actionsFor(subjectType, input.role).some((a) => a.id === input.action);
  if (!permitted) {
    throw new ActionError('FORBIDDEN', `${input.action} is not available on ${subjectType} for role ${input.role}`, 403);
  }

  const schema = PARAM_SCHEMAS[input.action];
  if (!schema) throw new ActionError('ACTION_NOT_EXECUTABLE', `${input.action} has no parameter schema`, 400);
  const parsed = schema.safeParse(input.params ?? {});
  if (!parsed.success) {
    throw new ActionError('VALIDATION', parsed.error.issues.map((i) => i.message).join('; '), 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  // Post-parse: z.object() strips unknown keys, so what is recorded below is the
  // declared shape and not whatever the client sent.
  const params = parsed.data as Record<string, unknown>;
  let result: Record<string, unknown> = {};

  switch (input.action) {
    case 'watchlist_add':
      await db.execute(sql`
        INSERT INTO watchlist (org_id, subject_type, subject_id, note, added_by)
        VALUES (${DEFAULT_ORG_ID}, ${subjectType}, ${subjectId}, ${(params.note as string) ?? null}, ${actor})
        ON CONFLICT (org_id, subject_type, subject_id) DO NOTHING
      `);
      result = { watchlisted: true };
      break;
    case 'watchlist_remove':
      await db.execute(sql`
        DELETE FROM watchlist
        WHERE org_id = ${DEFAULT_ORG_ID} AND subject_type = ${subjectType} AND subject_id = ${subjectId}
      `);
      result = { watchlisted: false };
      break;
    case 'flag_review':
      result = { flagged: true };
      break;
    case 'unflag':
      result = { flagged: false };
      break;
    case 'note_add':
      result = { note: params.note as string };
      break;
    default:
      throw new ActionError('ACTION_NOT_EXECUTABLE', `${input.action} has no executor`, 400);
  }

  // Redacted, exactly as invokeAction does it — the same helper, not a second
  // copy of the rule. None of these five takes a credential today, so this
  // changes no current row; it is here because the two write paths must not have
  // different redaction policies. The one that did not redact is the one a future
  // credential-bearing param would be added to by someone reading the other.
  const recorded = redactSecrets(params);
  await db.execute(sql`
    INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
    VALUES (${DEFAULT_ORG_ID}, ${subjectType}, ${subjectId}, ${input.action},
            ${JSON.stringify(recorded)}::jsonb, ${JSON.stringify(result)}::jsonb, ${actor})
  `);
  await db.execute(sql`
    INSERT INTO audit_log (actor, action, entity, entity_id, meta)
    VALUES (${actor}, ${'action:' + input.action}, ${subjectType}, ${subjectId}, ${JSON.stringify(recorded)}::jsonb)
  `);

  const state = await getObjectState(subjectType, subjectId);
  return { result, state };
}

/** The org watchlist, newest first (optionally filtered by type). */
export async function listWatchlist(subjectType?: string) {
  const db = getDb();
  const res = subjectType
    ? await db.execute(sql`
        SELECT id, subject_type, subject_id, note, added_by, created_at FROM watchlist
        WHERE org_id = ${DEFAULT_ORG_ID} AND subject_type = ${subjectType}
        ORDER BY created_at DESC`)
    : await db.execute(sql`
        SELECT id, subject_type, subject_id, note, added_by, created_at FROM watchlist
        WHERE org_id = ${DEFAULT_ORG_ID}
        ORDER BY created_at DESC`);
  return (res.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    note: r.note,
    addedBy: r.added_by,
    createdAt: r.created_at,
  }));
}
