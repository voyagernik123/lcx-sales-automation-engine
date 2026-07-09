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
  pollLinkedInReplies,
} from '../outreach/handoffs.js';
import type { HandoffStatus } from '../outreach/handoffs.js';

export const handoffRoutes = new Hono<{ Variables: AuthVariables }>();

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
      data: result.rows,
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
    return c.json({ data: handoff, meta: { timestamp: new Date().toISOString(), version: env.version } });
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
  if (operator.role !== 'operator') {
    return c.json({ error: 'Only operator can override handoff', code: 'PERMISSION_DENIED' }, 403);
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
  try {
    const created = await pollLinkedInReplies();
    return c.json({ data: { handoffsCreated: created }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[handoffs] linkedin poll error:', err);
    return c.json({ error: 'LinkedIn poll failed', code: 'LI_POLL_ERROR' }, 500);
  }
});
