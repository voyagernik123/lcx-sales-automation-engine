/**
 * Operator tasks — manual to-dos plus auto-generated next actions from deal
 * stage transitions, new handoffs, and stalled-deal detection. Auto rules are
 * idempotent (partial unique indexes dedup open auto-tasks).
 */
import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface OperatorTask {
  id: string;
  projectId: string | null;
  projectName: string | null;
  dealId: string | null;
  handoffId: string | null;
  title: string;
  detail: string | null;
  kind: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
}

const STAGE_TASKS: Record<string, { title: string; dueDays: number }> = {
  contacted: { title: 'Book a discovery call', dueDays: 5 },
  discovery: { title: 'Prepare the proposal', dueDays: 3 },
  proposal: { title: 'Follow up on the proposal', dueDays: 3 },
  negotiating: { title: 'Confirm terms and close', dueDays: 5 },
};

/** Called from the deal stage-transition route. */
export async function createStageTask(dealId: string, projectId: string, newStage: string): Promise<void> {
  const spec = STAGE_TASKS[newStage];
  if (!spec) return;
  const db = getDb();
  await db.execute(sql`
    INSERT INTO tasks (id, project_id, deal_id, title, detail, kind, due_at, created_by)
    VALUES (${randomUUID()}, ${projectId}, ${dealId}, ${spec.title},
            ${'auto-created on stage → ' + newStage}, 'auto_stage',
            NOW() + (${spec.dueDays} || ' days')::interval, 'system')
    ON CONFLICT DO NOTHING
  `);
}

/** Called from createHandoff — a reply always needs a same-day response. */
export async function createHandoffTask(handoffId: string, projectId: string, personName: string | null): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO tasks (id, project_id, handoff_id, title, detail, kind, due_at, created_by)
    VALUES (${randomUUID()}, ${projectId}, ${handoffId},
            ${'Respond to reply' + (personName ? ` from ${personName}` : '')},
            'reply = full stop — sequences paused, human takes over', 'auto_handoff',
            NOW() + INTERVAL '1 day', 'system')
    ON CONFLICT DO NOTHING
  `);
}

/** Daily rule: open deals untouched for 7+ days get a nudge task. */
export async function generateStalledDealTasks(pool: pg.Pool): Promise<number> {
  const { rowCount } = await pool.query(`
    INSERT INTO tasks (id, project_id, deal_id, title, detail, kind, due_at, created_by)
    SELECT gen_random_uuid(), d.project_id, d.id,
           'Unstick deal: ' || p.name,
           'no movement for ' || FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400) || ' days in stage ' || d.stage,
           'auto_stalled', NOW(), 'system'
    FROM deals d
    JOIN projects p ON p.id = d.project_id
    WHERE d.stage NOT IN ('won', 'lost', 'not_started')
      AND d.updated_at < NOW() - INTERVAL '7 days'
    ON CONFLICT DO NOTHING
  `);
  return rowCount ?? 0;
}

export async function listTasks(filters: { status?: string; projectId?: string; limit?: number }): Promise<OperatorTask[]> {
  const db = getDb();
  const status = filters.status ?? 'open';
  const conditions = [sql`t.status = ${status}`];
  if (filters.projectId) conditions.push(sql`t.project_id = ${filters.projectId}`);

  const result = await db.execute(sql`
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC
    LIMIT ${Math.min(filters.limit ?? 100, 300)}
  `);

  return (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    projectId: r.project_id ? String(r.project_id) : null,
    projectName: r.project_name ? String(r.project_name) : null,
    dealId: r.deal_id ? String(r.deal_id) : null,
    handoffId: r.handoff_id ? String(r.handoff_id) : null,
    title: String(r.title),
    detail: r.detail ? String(r.detail) : null,
    kind: String(r.kind),
    status: String(r.status),
    dueAt: r.due_at ? String(r.due_at) : null,
    createdAt: String(r.created_at),
  }));
}

export async function createManualTask(input: { title: string; detail?: string; projectId?: string; dueAt?: string }): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO tasks (id, project_id, title, detail, kind, due_at, created_by)
    VALUES (${id}, ${input.projectId ?? null}, ${input.title}, ${input.detail ?? null}, 'manual',
            ${input.dueAt ?? null}, 'operator')
  `);
  return id;
}

export async function setTaskStatus(id: string, status: 'done' | 'dismissed' | 'open'): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE tasks SET status = ${status},
      completed_at = CASE WHEN ${status} = 'done' THEN NOW() ELSE NULL END
    WHERE id = ${id}
  `);
  return (result.rowCount ?? 0) > 0;
}
