import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { randomUUID } from 'node:crypto';

export type HandoffStatus = 'open' | 'in_progress' | 'resolved_won_path' | 'resolved_lost' | 're_nurture';
export type HandoffEventType = 'created' | 'assigned' | 'note' | 'status_change' | 're_enrolled' | 'moved_to_telegram';

const VALID_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
  open: ['in_progress', 'resolved_won_path', 'resolved_lost', 're_nurture'],
  in_progress: ['resolved_won_path', 'resolved_lost', 're_nurture', 'open'],
  resolved_won_path: [],
  resolved_lost: [],
  re_nurture: ['open', 'in_progress'],
};

function isValidTransition(from: HandoffStatus, to: HandoffStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

interface CreateHandoffParams {
  projectId: string;
  personId?: string | null;
  channel: 'email' | 'linkedin';
  triggerMessageId?: string | null;
  triggerReason?: string;
}

export async function createHandoff(params: CreateHandoffParams): Promise<Record<string, unknown>> {
  const db = getDb();

  const activeSequences = await db
    .select()
    .from(schema.outreachSequences)
    .where(
      sql`${schema.outreachSequences.projectId} = ${params.projectId}
        AND ${schema.outreachSequences.status} = 'active'
        ${params.personId ? sql`AND ${schema.outreachSequences.personId} = ${params.personId}` : sql``}`
    )
    .execute();

  const [handoff] = await db
    .insert(schema.handoffs)
    .values({
      id: randomUUID(),
      projectId: params.projectId,
      personId: params.personId ?? null,
      channel: params.channel,
      triggerMessageId: params.triggerMessageId ?? null,
      triggerReason: params.triggerReason ?? 'reply',
      status: 'open',
    })
    .returning()
    .execute();

  for (const seq of activeSequences) {
    await db
      .update(schema.outreachSequences)
      .set({ status: 'handoff', handoffId: handoff.id, updatedAt: new Date() })
      .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
      .execute();
  }

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor: 'system',
    action: 'handoff_created',
    entity: 'handoffs',
    entityId: handoff.id,
    meta: {
      projectId: params.projectId,
      personId: params.personId,
      channel: params.channel,
      reason: params.triggerReason,
      pausedSequences: activeSequences.length,
    },
  }).execute();

  await addHandoffEvent(handoff.id, 'created', 'system', `Handoff created — ${params.channel} reply detected`);

  return handoff;
}

export async function listHandoffs(filters: {
  status?: HandoffStatus | HandoffStatus[];
  projectId?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const db = getDb();
  const conditions: ReturnType<typeof sql>[] = [];

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(sql`h.status = ANY(${statuses}::text[])`);
  }
  if (filters.projectId) {
    conditions.push(sql`h.project_id = ${filters.projectId}`);
  }
  if (filters.assignedTo) {
    conditions.push(sql`h.assigned_to = ${filters.assignedTo}`);
  }

  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const [dataResult, countResult] = await Promise.all([
    db.execute(sql`
      SELECT h.*, p.name AS project_name, p.ticker AS project_ticker,
             pe.name AS person_name, pe.email AS person_email, pe.linkedin AS person_linkedin, pe.telegram AS person_telegram
      FROM ${schema.handoffs} h
      LEFT JOIN ${schema.projects} p ON p.id = h.project_id
      LEFT JOIN ${schema.people} pe ON pe.id = h.person_id
      ${where}
      ORDER BY h.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS total FROM ${schema.handoffs} h ${where}
    `),
  ]);

  const rows = dataResult.rows ?? [];
  const total = Number((countResult.rows?.[0] as Record<string, unknown>)?.total ?? 0);
  return { rows, total };
}

export async function getHandoff(id: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const [dataResult, eventsResult] = await Promise.all([
    db.execute(sql`
      SELECT h.*, p.name AS project_name, p.ticker AS project_ticker,
             pe.name AS person_name, pe.email AS person_email, pe.linkedin AS person_linkedin, pe.telegram AS person_telegram
      FROM ${schema.handoffs} h
      LEFT JOIN ${schema.projects} p ON p.id = h.project_id
      LEFT JOIN ${schema.people} pe ON pe.id = h.person_id
      WHERE h.id = ${id}
    `),
    db.execute(sql`
      SELECT * FROM ${schema.handoffEvents}
      WHERE handoff_id = ${id}
      ORDER BY created_at ASC
    `),
  ]);

  const rows = dataResult.rows ?? [];
  if (rows.length === 0) return null;
  return { ...rows[0], events: eventsResult.rows ?? [] };
}

export async function claimHandoff(id: string, actor: string): Promise<void> {
  const db = getDb();

  const [handoff] = await db
    .select()
    .from(schema.handoffs)
    .where(sql`${schema.handoffs.id} = ${id}`)
    .limit(1)
    .execute();

  if (!handoff) throw new Error('Handoff not found');
  if (handoff.assignedTo && handoff.assignedTo !== actor) {
    throw new Error('Handoff already assigned to another operator');
  }

  await db
    .update(schema.handoffs)
    .set({ assignedTo: actor, updatedAt: new Date() })
    .where(sql`${schema.handoffs.id} = ${id}`)
    .execute();

  await addHandoffEvent(id, 'assigned', actor, `Assigned to ${actor}`);

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor,
    action: 'handoff_assigned',
    entity: 'handoffs',
    entityId: id,
    meta: { assignedTo: actor },
  }).execute();
}

export async function updateHandoffStatus(id: string, newStatus: HandoffStatus, actor: string): Promise<void> {
  const db = getDb();

  const [handoff] = await db
    .select()
    .from(schema.handoffs)
    .where(sql`${schema.handoffs.id} = ${id}`)
    .limit(1)
    .execute();

  if (!handoff) throw new Error('Handoff not found');

  const currentStatus = handoff.status as HandoffStatus;
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  await db
    .update(schema.handoffs)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(sql`${schema.handoffs.id} = ${id}`)
    .execute();

  await addHandoffEvent(id, 'status_change', actor, `Status: ${currentStatus} → ${newStatus}`, currentStatus, newStatus);

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor,
    action: 'handoff_status_change',
    entity: 'handoffs',
    entityId: id,
    meta: { from: currentStatus, to: newStatus },
  }).execute();
}

async function addHandoffEvent(
  handoffId: string,
  eventType: HandoffEventType,
  actor: string,
  content: string,
  oldStatus?: string,
  newStatus?: string,
): Promise<void> {
  const db = getDb();

  await db.insert(schema.handoffEvents).values({
    id: randomUUID(),
    handoffId,
    eventType,
    actor,
    content,
    oldStatus,
    newStatus,
  }).execute();
}

export async function addNote(handoffId: string, actor: string, note: string): Promise<void> {
  await addHandoffEvent(handoffId, 'note', actor, note);
}

/**
 * The conversion event that matters: the lead agreed to continue on Telegram,
 * where deals close personally. Tracked for the reply-to-telegram KPI.
 */
export async function markMovedToTelegram(id: string, actor: string): Promise<void> {
  const db = getDb();
  const [handoff] = await db
    .select({ id: schema.handoffs.id, status: schema.handoffs.status })
    .from(schema.handoffs)
    .where(sql`${schema.handoffs.id} = ${id}`)
    .limit(1)
    .execute();
  if (!handoff) throw new Error('Handoff not found');

  if (handoff.status === 'open') {
    await db
      .update(schema.handoffs)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(sql`${schema.handoffs.id} = ${id}`)
      .execute();
  }

  await addHandoffEvent(id, 'moved_to_telegram', actor, 'Conversation moved to Telegram');
  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor,
    action: 'handoff_moved_to_telegram',
    entity: 'handoffs',
    entityId: id,
    meta: {},
  });
}

export async function reEnrollHandoff(id: string, actor: string): Promise<void> {
  const db = getDb();

  const [handoff] = await db
    .select()
    .from(schema.handoffs)
    .where(sql`${schema.handoffs.id} = ${id}`)
    .limit(1)
    .execute();

  if (!handoff) throw new Error('Handoff not found');

  await db
    .update(schema.outreachSequences)
    .set({ status: 'active', handoffId: null, updatedAt: new Date() })
    .where(sql`${schema.outreachSequences.handoffId} = ${id}`)
    .execute();

  await db
    .update(schema.handoffs)
    .set({ status: 're_nurture', updatedAt: new Date() })
    .where(sql`${schema.handoffs.id} = ${id}`)
    .execute();

  await addHandoffEvent(id, 're_enrolled', actor, 'Operator overrode handoff — sequences re-activated');

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor,
    action: 'handoff_re_enrolled',
    entity: 'handoffs',
    entityId: id,
    meta: { override: true },
  }).execute();
}

export async function pollLinkedInReplies(): Promise<number> {
  const db = getDb();

  const messagedPeople = await db
    .select({ personId: schema.outreachSequences.personId, projectId: schema.outreachSequences.projectId })
    .from(schema.outreachSequences)
    .innerJoin(schema.people, sql`${schema.people.id} = ${schema.outreachSequences.personId}`)
    .where(
      sql`${schema.people.linkedinStatus} = 'messaged'
        AND ${schema.outreachSequences.status} = 'active'`
    )
    .execute();

  let handoffsCreated = 0;

  for (const row of messagedPeople) {
    if (!row.personId) continue;

    const lastMessage = await db
      .select()
      .from(schema.messages)
      .where(
        sql`${schema.messages.sequenceId} IN (
          SELECT id FROM ${schema.outreachSequences}
          WHERE person_id = ${row.personId} AND project_id = ${row.projectId}
        )`
      )
      .orderBy(sql`created_at DESC`)
      .limit(1)
      .execute();

    if (lastMessage.length === 0) continue;
    const msg = lastMessage[0];
    const hoursSinceMessage = (Date.now() - msg.createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceMessage < 48) continue;

    const existingHandoff = await db
      .select()
      .from(schema.handoffs)
      .where(
        sql`${schema.handoffs.projectId} = ${row.projectId}
          AND ${schema.handoffs.personId} = ${row.personId}
          AND ${schema.handoffs.status} NOT IN ('resolved_won_path', 'resolved_lost')`
      )
      .limit(1)
      .execute();

    if (existingHandoff.length > 0) continue;

    await createHandoff({
      projectId: row.projectId,
      personId: row.personId,
      channel: 'linkedin',
      triggerMessageId: msg.id,
      triggerReason: 'linkedin_reply_poll',
    });

    await db
      .update(schema.people)
      .set({ linkedinStatus: 'replied', updatedAt: new Date() })
      .where(sql`${schema.people.id} = ${row.personId}`)
      .execute();

    handoffsCreated++;
  }

  return handoffsCreated;
}
