import { sql } from 'drizzle-orm';
import { getAction } from '@lcx/shared';
import { getDb } from '../db/index.js';
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
  params?: Record<string, unknown>;
}

/**
 * Execute a governed server action: mutate the domain, record it in the action
 * ledger AND the hash-chained audit_log (attribution), and return the new state.
 */
export async function executeAction(input: ExecuteActionInput): Promise<{ result: Record<string, unknown>; state: ObjectState }> {
  const def = getAction(input.action);
  if (!def) throw new Error('UNKNOWN_ACTION');
  if (def.client) throw new Error('CLIENT_ONLY_ACTION');

  const db = getDb();
  const { subjectType, subjectId, actor } = input;
  const params = input.params ?? {};
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
      result = { note: (params.note as string) ?? '' };
      break;
    default:
      throw new Error('ACTION_NOT_EXECUTABLE');
  }

  await db.execute(sql`
    INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
    VALUES (${DEFAULT_ORG_ID}, ${subjectType}, ${subjectId}, ${input.action},
            ${JSON.stringify(params)}::jsonb, ${JSON.stringify(result)}::jsonb, ${actor})
  `);
  await db.execute(sql`
    INSERT INTO audit_log (actor, action, entity, entity_id, meta)
    VALUES (${actor}, ${'action:' + input.action}, ${subjectType}, ${subjectId}, ${JSON.stringify(params)}::jsonb)
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
