import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import {
  listHandoffs,
  getHandoff,
  claimHandoff,
  updateHandoffStatus,
  addNote,
  reEnrollHandoff,
  createHandoff,
  markMovedToTelegram,
} from '../outreach/handoffs.js';
import type { HandoffStatus } from '../outreach/handoffs.js';
import { generateReplyDrafts, type Channel, type Jurisdiction } from '@lcx/shared';


/** Raw SQL rows are snake_case; the SPA speaks camelCase. */
function mapHandoffRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    projectId: r.project_id,
    personId: r.person_id,
    channel: r.channel,
    triggerMessageId: r.trigger_message_id,
    triggerReason: r.trigger_reason,
    status: r.status,
    assignedTo: r.assigned_to,
    summary: r.summary,
    projectName: r.project_name,
    projectTicker: r.project_ticker,
    personName: r.person_name,
    personEmail: r.person_email,
    personLinkedin: r.person_linkedin,
    personTelegram: r.person_telegram,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.events ? { events: r.events } : {}),
  };
}

export const handoffRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * GET /v1/handoffs/:id/reply-drafts — 3 deterministic reply drafts
 * (meeting / telegram / info angles), each ending with the Telegram pull.
 */
handoffRoutes.get('/:id/reply-drafts', requireOperator, async (c) => {
  const { id } = c.req.param();
  try {
    const handoff = await getHandoff(id);
    if (!handoff) return c.json({ error: 'Handoff not found', code: 'NOT_FOUND' }, 404);

    const db = getDb();
    let repliedToTouchIndex: number | null = null;
    if (handoff.trigger_message_id) {
      const [msg] = await db
        .select({ touchIndex: schema.messages.touchIndex })
        .from(schema.messages)
        .where(sql`${schema.messages.id} = ${handoff.trigger_message_id}`)
        .limit(1)
        .execute();
      repliedToTouchIndex = msg?.touchIndex ?? null;
    }

    const [project] = await db
      .select({ jurisdiction: schema.projects.jurisdiction, region: schema.projects.region })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${handoff.project_id}`)
      .limit(1)
      .execute();

    const scoreRows = await db
      .select({ band: schema.scores.band })
      .from(schema.scores)
      .where(sql`${schema.scores.projectId} = ${handoff.project_id}`)
      .limit(1)
      .execute();

    const result = generateReplyDrafts({
      projectName: String(handoff.project_name ?? 'your project'),
      projectTicker: handoff.project_ticker ? String(handoff.project_ticker) : null,
      projectBand: scoreRows[0]?.band ?? 'unscored',
      contactName: String(handoff.person_name ?? 'there'),
      channel: (handoff.channel as Channel) ?? 'email',
      repliedToTouchIndex,
      jurisdiction: (project?.region === 'us' ? 'us' : 'eu') as Jurisdiction,
      lcxTelegramHandle: env.lcxTelegramHandle,
    });

    return c.json({ data: result, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[handoffs] reply-drafts error:', err);
    return c.json({ error: 'Failed to generate reply drafts', code: 'DRAFT_ERROR' }, 500);
  }
});

/** POST /v1/handoffs/:id/moved-to-telegram — the conversion event. */
handoffRoutes.post('/:id/moved-to-telegram', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  try {
    await markMovedToTelegram(id, operator.id);
    return c.json({ data: { id, event: 'moved_to_telegram' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    const code = msg.includes('not found') ? 404 : 500;
    return c.json({ error: msg, code: 'TELEGRAM_MOVE_ERROR' }, code as 404 | 500);
  }
});

handoffRoutes.get('/', requireOperator, async (c) => {
  const qs = c.req.query();
  try {
    const status = qs.status ? qs.status.split(',') as HandoffStatus[] : undefined;
    const result = await listHandoffs({
      status,
      projectId: qs.projectId,
      assignedTo: qs.assignedTo,
      limit: Math.min(Number(qs.limit) || 50, 200),
      offset: Number(qs.offset) || 0,
    });
    return c.json({
      data: result.rows.map((r) => mapHandoffRow(r as Record<string, unknown>)),
      meta: { total: result.total, timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[handoffs] list error:', err);
    return c.json({ error: 'Failed to list handoffs', code: 'HANDOFF_LIST_ERROR' }, 500);
  }
});

handoffRoutes.get('/:id', requireOperator, async (c) => {
  const { id } = c.req.param();
  try {
    const handoff = await getHandoff(id);
    if (!handoff) return c.json({ error: 'Handoff not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: mapHandoffRow(handoff), meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[handoffs] get error:', err);
    return c.json({ error: 'Failed to get handoff', code: 'HANDOFF_GET_ERROR' }, 500);
  }
});

handoffRoutes.post('/:id/claim', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  try {
    await claimHandoff(id, operator.id);
    return c.json({ data: { handoffId: id, status: 'claimed', assignedTo: operator.id }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to claim handoff';
    const code = msg === 'Handoff not found' ? 'NOT_FOUND' : msg.startsWith('Handoff already assigned') ? 'ALREADY_ASSIGNED' : 'CLAIM_ERROR';
    return c.json({ error: msg, code }, code === 'NOT_FOUND' ? 404 : code === 'ALREADY_ASSIGNED' ? 409 : 500);
  }
});

handoffRoutes.patch('/:id/status', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ status: HandoffStatus }>();
  if (!body.status) return c.json({ error: 'Missing status', code: 'MISSING_STATUS' }, 400);
  try {
    await updateHandoffStatus(id, body.status, operator.id);
    return c.json({ data: { handoffId: id, status: body.status }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update status';
    const code = msg === 'Handoff not found' ? 'NOT_FOUND' : msg.startsWith('Cannot transition') ? 'INVALID_TRANSITION' : 'STATUS_ERROR';
    return c.json({ error: msg, code }, code === 'NOT_FOUND' ? 404 : code === 'INVALID_TRANSITION' ? 400 : 500);
  }
});

handoffRoutes.post('/:id/notes', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) return c.json({ error: 'Note content is required', code: 'MISSING_CONTENT' }, 400);
  try {
    await addNote(id, operator.id, body.content.trim());
    return c.json({ data: { handoffId: id, noteAdded: true }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add note';
    return c.json({ error: msg, code: 'NOTE_ERROR' }, msg === 'Handoff not found' ? 404 : 500);
  }
});

handoffRoutes.post('/:id/re-enroll', requireOperator, async (c) => {
  const { id } = c.req.param();
  const operator = c.get('operator');
  // Overriding a handoff is a base-tier action — operator and approver both
  // qualify. (requireOperator already rejected anything unauthenticated.)
  if (operator.role !== 'operator' && operator.role !== 'approver') {
    return c.json({ error: 'Only desk operators can override handoff', code: 'PERMISSION_DENIED' }, 403);
  }
  try {
    await reEnrollHandoff(id, operator.id);
    return c.json({ data: { handoffId: id, status: 're_nurture', message: 'Sequences re-activated. Human override recorded.' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to re-enroll';
    return c.json({ error: msg, code: 'REENROLL_ERROR' }, msg === 'Handoff not found' ? 404 : 500);
  }
});

handoffRoutes.post('/reply', requireOperator, async (c) => {
  const body = await c.req.json<{ sequenceId?: string; projectId?: string; channel?: 'email' | 'linkedin' }>();
  if (!body.projectId && !body.sequenceId) {
    return c.json({ error: 'Provide projectId or sequenceId', code: 'MISSING_PARAM' }, 400);
  }
  try {
    const db = getDb();
    let projectId = body.projectId;
    let personId: string | undefined;
    let messageId: string | undefined;
    let channel = body.channel ?? 'email';

    if (body.sequenceId) {
      const [seq] = await db.select().from(schema.outreachSequences).where(sql`${schema.outreachSequences.id} = ${body.sequenceId}`).limit(1).execute();
      if (!seq) return c.json({ error: 'Sequence not found', code: 'NOT_FOUND' }, 404);
      projectId = seq.projectId;
      personId = seq.personId ?? undefined;
      channel = (seq.channel ?? 'email') as 'email' | 'linkedin';
      const [lastMsg] = await db.select().from(schema.messages).where(sql`${schema.messages.sequenceId} = ${body.sequenceId}`).orderBy(sql`created_at DESC`).limit(1).execute();
      if (lastMsg) messageId = lastMsg.id;
    }

    const handoff = await createHandoff({
      projectId: projectId!,
      personId,
      channel,
      triggerMessageId: messageId,
      triggerReason: 'synthetic_reply',
    });

    return c.json({ data: handoff, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[handoffs] reply error:', err);
    return c.json({ error: 'Failed to create handoff from reply', code: 'REPLY_ERROR' }, 500);
  }
});

handoffRoutes.post('/linkedin/poll', requireOperator, async (c) => {
  // Deprecated: assisted mode means real replies land in the human's actual
  // LinkedIn inbox — use the "Log reply" flow (POST /v1/handoffs/reply).
  return c.json({
    data: { deprecated: true, handoffsCreated: 0 },
    meta: { timestamp: new Date().toISOString(), version: env.version },
  });
});
