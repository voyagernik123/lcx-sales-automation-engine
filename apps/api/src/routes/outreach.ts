import { Hono } from 'hono';
import { sql, desc } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { generateDraft, CADENCE } from '@lcx/shared';
import { processOutboundTick, handleWebhookEvent } from '../outreach/scheduler.js';
import { verifyWebhookSignature } from '../outreach/resend.js';
import type { SequenceStep } from '@lcx/shared';
import { randomUUID } from 'node:crypto';

export const outreachRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * POST /v1/outreach/enroll/:projectId — Enroll a project in a 5-touch sequence.
 */
outreachRoutes.post('/enroll/:projectId', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  const body = await c.req.json<{
    personId?: string;
    contactName?: string;
    channel?: string;
  }>();

  try {
    // Load project + people
    const [projectRows, peopleRows, scoreRows] = await Promise.all([
      db.select().from(schema.projects).where(sql`${schema.projects.id} = ${projectId}`).limit(1).execute(),
      db.select().from(schema.people).where(sql`${schema.people.projectId} = ${projectId}`).execute(),
      db.select().from(schema.scores).where(sql`${schema.scores.projectId} = ${projectId}`).limit(1).execute(),
    ]);

    if (projectRows.length === 0) {
      return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
    }

    const project = projectRows[0];
    const score = scoreRows[0] ?? null;

    const channel = (body.channel ?? 'email') as 'email' | 'linkedin' | 'telegram';

    // Resolve target person
    let targetPerson = peopleRows[0];
    if (body.personId) {
      targetPerson = peopleRows.find(p => p.id === body.personId) ?? targetPerson;
    } else if (body.contactName) {
      targetPerson = peopleRows.find(p => p.name === body.contactName) ?? targetPerson;
    }

    if (!targetPerson) {
      return c.json({ error: 'No contact available. Add a person first.', code: 'NO_CONTACT' }, 400);
    }

    if (channel === 'linkedin' && !targetPerson.linkedin) {
      return c.json({ error: 'Selected contact has no LinkedIn URL', code: 'NO_LINKEDIN' }, 400);
    }

    const contactName = targetPerson.name;
    const reasons = (score?.reasons ?? []) as Array<{ code: string; factor: string; points: number; note: string }>;

    // Generate drafts for all 5 touches
    const steps: SequenceStep[] = [];
    // All-channel cadence
    const channels: Array<'email' | 'linkedin' | 'telegram'> =
      channel === 'linkedin'
        ? ['linkedin', 'linkedin', 'linkedin', 'linkedin', 'linkedin']
        : ['email', 'email', 'linkedin', 'telegram', 'email'];

    for (let i = 0; i < CADENCE.length; i++) {
      const cadence = CADENCE[i];
      const channel = channels[i];
      const { draft } = generateDraft({
        projectName: project.name,
        projectTicker: project.ticker,
        projectWebsite: project.website,
        projectChain: project.chain,
        projectEuScore: score?.euScore ?? null,
        projectUsPreScore: score?.usPreScore ?? null,
        projectUsPostScore: score?.usPostScore ?? null,
        projectBand: score?.band ?? 'unscored',
        scoreReasons: reasons,
        contactName,
        contactTitle: targetPerson.title,
        contactRole: targetPerson.role,
        jurisdiction: (project.jurisdiction === 'US' ? 'us' : 'eu') as 'eu' | 'us',
        clarityEnacted: false,
        touchIndex: cadence.touchIndex,
        channel: channel,
        market: project.jurisdiction ?? null,
      });

      steps.push({
        touchIndex: cadence.touchIndex,
        delayDays: cadence.delayDays,
        subject: draft.subject,
        body: draft.body,
        claimsUsed: draft.claimsUsed,
        requiresHumanReview: draft.requiresHumanReview,
      });
    }

    // Create sequence
    const [seq] = await db
      .insert(schema.outreachSequences)
      .values({
        id: randomUUID(),
        projectId,
        personId: targetPerson.id,
        channel: body.channel ?? 'email',
        status: 'active',
        steps: steps as unknown as Record<string, unknown>[],
        currentStep: 0,
        fromEmail: env.outreachFromEmail,
        startedAt: new Date(),
      })
      .returning()
      .execute();

    // Create enrollment
    await db
      .insert(schema.sequenceEnrollments)
      .values({
        id: randomUUID(),
        projectId,
        sequenceId: seq.id,
        enrolledBy: 'operator',
      })
      .execute();

    return c.json({
      data: {
        sequenceId: seq.id,
        steps: steps.length,
        contactName,
      },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    }, 201);
  } catch (err) {
    console.error('[outreach] enroll error:', err);
    return c.json({ error: 'Failed to enroll', code: 'ENROLL_ERROR' }, 500);
  }
});

/**
 * POST /v1/outreach/sequences/:id/pause — Pause a sequence.
 */
outreachRoutes.post('/sequences/:id/pause', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    await db
      .update(schema.outreachSequences)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(sql`${schema.outreachSequences.id} = ${id}`)
      .execute();

    return c.json({ data: { sequenceId: id, status: 'paused' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[outreach] pause error:', err);
    return c.json({ error: 'Failed to pause', code: 'PAUSE_ERROR' }, 500);
  }
});

/**
 * POST /v1/outreach/sequences/:id/resume — Resume a sequence.
 */
outreachRoutes.post('/sequences/:id/resume', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    await db
      .update(schema.outreachSequences)
      .set({ status: 'active', updatedAt: new Date() })
      .where(sql`${schema.outreachSequences.id} = ${id}`)
      .execute();

    return c.json({ data: { sequenceId: id, status: 'active' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[outreach] resume error:', err);
    return c.json({ error: 'Failed to resume', code: 'RESUME_ERROR' }, 500);
  }
});

/**
 * GET /v1/outreach/projects/:projectId/sequences — List sequences for a project.
 */
outreachRoutes.get('/projects/:projectId/sequences', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();

  try {
    const rows = await db
      .select()
      .from(schema.outreachSequences)
      .where(sql`${schema.outreachSequences.projectId} = ${projectId}`)
      .orderBy(desc(schema.outreachSequences.createdAt))
      .execute();

    return c.json({
      data: rows,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[outreach] list sequences error:', err);
    return c.json({ error: 'Failed to list sequences', code: 'SEQUENCE_ERROR' }, 500);
  }
});

/**
 * GET /v1/outreach/projects/:projectId/messages — Message log for a project.
 */
outreachRoutes.get('/projects/:projectId/messages', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

  try {
    const rows = await db
      .select()
      .from(schema.messages)
      .where(sql`${schema.messages.projectId} = ${projectId}`)
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .execute();

    return c.json({
      data: rows,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[outreach] messages error:', err);
    return c.json({ error: 'Failed to load messages', code: 'MESSAGE_ERROR' }, 500);
  }
});

/**
 * POST /v1/outreach/tick — Process pending outbound messages (cron endpoint).
 */
outreachRoutes.post('/tick', requireOperator, async (c) => {
  try {
    const result = await processOutboundTick();
    return c.json({
      data: result,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[outreach] tick error:', err);
    return c.json({ error: 'Tick failed', code: 'TICK_ERROR' }, 500);
  }
});

/**
 * POST /v1/webhooks/email — Resend webhook receiver (no auth — signature verified).
 */
outreachRoutes.post('/webhooks/email', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('svix-signature') ?? '';

  const valid = await verifyWebhookSignature(body, signature);
  if (!valid) {
    return c.json({ error: 'Invalid signature', code: 'SIG_INVALID' }, 401);
  }

  try {
    const event = JSON.parse(body);
    await handleWebhookEvent(event);
    return c.json({ status: 'ok' });
  } catch (err) {
    console.error('[outreach] webhook error:', err);
    return c.json({ error: 'Webhook processing failed', code: 'WEBHOOK_ERROR' }, 500);
  }
});
