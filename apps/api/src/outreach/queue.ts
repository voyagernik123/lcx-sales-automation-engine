/**
 * Assisted send queue — LinkedIn/Telegram touches the scheduler materialized
 * into outreach_tasks. A human executes them (open profile, paste, send) and
 * marks the outcome here; that advances the sequence.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  checkLiCap, incrementLiUsage,
  LI_DAILY_CONNECTION_CAP, LI_WEEKLY_CONNECTION_CAP, LI_DAILY_MESSAGE_CAP,
} from './linkedin.js';

export interface QueueItem {
  id: string;
  sequenceId: string | null;
  projectId: string;
  projectName: string;
  projectTicker: string | null;
  band: string;
  priorityScore: number;
  personId: string | null;
  personName: string | null;
  personTitle: string | null;
  personLinkedin: string | null;
  personTelegram: string | null;
  stepIndex: number;
  touchIndex: number;
  channel: string;
  action: string;
  subject: string | null;
  body: string;
  dueAt: string;
  status: string;
}

export interface QueueCaps {
  connectionsToday: number;
  connectionsWeek: number;
  messagesToday: number;
  limits: { dailyConnections: number; weeklyConnections: number; dailyMessages: number };
}

export async function listQueue(filters: {
  channel?: string;
  status?: string;
  limit?: number;
}): Promise<{ items: QueueItem[]; caps: QueueCaps }> {
  const db = getDb();
  const status = filters.status ?? 'pending';
  const limit = Math.min(filters.limit ?? 50, 200);

  const conditions = [sql`t.status = ${status}`];
  if (filters.channel) conditions.push(sql`t.channel = ${filters.channel}`);
  if (status === 'pending') {
    conditions.push(sql`t.due_at <= NOW()`);
    conditions.push(sql`(t.snoozed_until IS NULL OR t.snoozed_until <= NOW())`);
  }

  const result = await db.execute(sql`
    SELECT t.id, t.sequence_id, t.project_id, t.person_id, t.step_index, t.touch_index,
           t.channel, t.action, t.subject, COALESCE(t.edited_body, t.body) AS body,
           t.due_at, t.status,
           p.name AS project_name, p.ticker AS project_ticker,
           COALESCE(s.band, 'unscored') AS band, COALESCE(s.priority_score, 0) AS priority_score,
           pe.name AS person_name, pe.title AS person_title,
           pe.linkedin AS person_linkedin, pe.telegram AS person_telegram
    FROM outreach_tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN scores s ON s.project_id = t.project_id
    LEFT JOIN people pe ON pe.id = t.person_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY s.priority_score DESC NULLS LAST, t.due_at ASC
    LIMIT ${limit}
  `);

  const items: QueueItem[] = (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    sequenceId: r.sequence_id ? String(r.sequence_id) : null,
    projectId: String(r.project_id),
    projectName: String(r.project_name),
    projectTicker: r.project_ticker ? String(r.project_ticker) : null,
    band: String(r.band),
    priorityScore: Number(r.priority_score ?? 0),
    personId: r.person_id ? String(r.person_id) : null,
    personName: r.person_name ? String(r.person_name) : null,
    personTitle: r.person_title ? String(r.person_title) : null,
    personLinkedin: r.person_linkedin ? String(r.person_linkedin) : null,
    personTelegram: r.person_telegram ? String(r.person_telegram) : null,
    stepIndex: Number(r.step_index),
    touchIndex: Number(r.touch_index),
    channel: String(r.channel),
    action: String(r.action),
    subject: r.subject ? String(r.subject) : null,
    body: String(r.body),
    dueAt: String(r.due_at),
    status: String(r.status),
  }));

  const conn = await checkLiCap('connection_request');
  const msg = await checkLiCap('message');
  const caps: QueueCaps = {
    connectionsToday: LI_DAILY_CONNECTION_CAP - conn.connectionsRemainingToday,
    connectionsWeek: LI_WEEKLY_CONNECTION_CAP - conn.connectionsRemainingWeek,
    messagesToday: LI_DAILY_MESSAGE_CAP - msg.messagesRemainingToday,
    limits: {
      dailyConnections: LI_DAILY_CONNECTION_CAP,
      weeklyConnections: LI_WEEKLY_CONNECTION_CAP,
      dailyMessages: LI_DAILY_MESSAGE_CAP,
    },
  };

  return { items, caps };
}

/** Human confirmed the send. Records the message, advances the sequence. */
export async function markTaskSent(
  taskId: string,
  actor: string,
  editedBody?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();

  const [task] = await db
    .select()
    .from(schema.outreachTasks)
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .limit(1)
    .execute();
  if (!task) return { ok: false, error: 'Task not found' };
  if (task.status !== 'pending') return { ok: false, error: `Task already ${task.status}` };

  const body = editedBody?.trim() || task.editedBody || task.body;

  const person = task.personId
    ? (await db.select().from(schema.people).where(sql`${schema.people.id} = ${task.personId}`).limit(1).execute())[0]
    : undefined;

  const messageId = randomUUID();
  await db
    .insert(schema.messages)
    .values({
      id: messageId,
      sequenceId: task.sequenceId,
      projectId: task.projectId,
      stepIndex: task.stepIndex,
      touchIndex: task.touchIndex,
      toEmail: person?.email ?? '',
      toName: person?.name ?? null,
      subject: task.subject ?? '',
      body,
      provider: task.channel === 'telegram' ? 'manual_telegram' : 'manual_linkedin',
      status: 'sent',
      sentAt: new Date(),
    })
    .execute();

  if (task.channel === 'linkedin') {
    await incrementLiUsage(task.action === 'connection_request' ? 'connection_request' : 'message');
    if (person) {
      const newStatus = task.action === 'connection_request' ? 'pending' : 'messaged';
      await db
        .update(schema.people)
        .set({ linkedinStatus: newStatus, updatedAt: new Date() })
        .where(sql`${schema.people.id} = ${person.id}`)
        .execute();
    }
  }

  await advanceSequence(task.sequenceId, task.stepIndex);

  await db
    .update(schema.outreachTasks)
    .set({
      status: 'sent',
      editedBody: editedBody?.trim() || task.editedBody,
      sentMessageId: messageId,
      completedAt: new Date(),
    })
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .execute();

  await audit(actor, 'queue_item_sent', taskId, { channel: task.channel, action: task.action });
  return { ok: true };
}

export async function skipTask(taskId: string, actor: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [task] = await db
    .select()
    .from(schema.outreachTasks)
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .limit(1)
    .execute();
  if (!task) return { ok: false, error: 'Task not found' };
  if (task.status !== 'pending') return { ok: false, error: `Task already ${task.status}` };

  await advanceSequence(task.sequenceId, task.stepIndex);
  await db
    .update(schema.outreachTasks)
    .set({ status: 'skipped', completedAt: new Date() })
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .execute();

  await audit(actor, 'queue_item_skipped', taskId, { channel: task.channel });
  return { ok: true };
}

export async function snoozeTask(taskId: string, until: Date, actor: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [task] = await db
    .select({ id: schema.outreachTasks.id, status: schema.outreachTasks.status })
    .from(schema.outreachTasks)
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .limit(1)
    .execute();
  if (!task) return { ok: false, error: 'Task not found' };
  if (task.status !== 'pending') return { ok: false, error: `Task already ${task.status}` };

  await db
    .update(schema.outreachTasks)
    .set({ snoozedUntil: until })
    .where(sql`${schema.outreachTasks.id} = ${taskId}`)
    .execute();
  await audit(actor, 'queue_item_snoozed', taskId, { until: until.toISOString() });
  return { ok: true };
}

/** Advance the sequence past this step (only if it still points at it). */
async function advanceSequence(sequenceId: string | null, stepIndex: number): Promise<void> {
  if (!sequenceId) return;
  const db = getDb();
  await db.execute(sql`
    UPDATE outreach_sequences
    SET current_step = ${stepIndex + 1}, updated_at = NOW()
    WHERE id = ${sequenceId} AND current_step = ${stepIndex}
  `);
}

async function audit(actor: string, action: string, entityId: string, meta: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.auditLog)
    .values({ id: randomUUID(), actor, action, entity: 'outreach_tasks', entityId, meta })
    .execute();
}
