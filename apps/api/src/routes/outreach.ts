import { Hono } from 'hono';
import { sql, desc } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { generateDraft, CADENCE, MIXED_CADENCE_CHANNELS, computeScheduledDate } from '@lcx/shared';
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
    templateId?: string;
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

    // Cadence: a chosen template's steps, else the default 5-touch (all-LinkedIn
    // if enrolled with channel=linkedin, else the mixed cadence).
    type Cadence = { touchIndex: number; delayDays: number; channel: 'email' | 'linkedin' | 'telegram' };
    let cadenceSteps: Cadence[];

    if (body.templateId) {
      const [tmpl] = (await db.execute(
        sql`SELECT steps FROM sequence_templates WHERE id = ${body.templateId}`,
      )).rows as { steps: Cadence[] }[];
      if (!tmpl) return c.json({ error: 'Template not found', code: 'NOT_FOUND' }, 404);
      cadenceSteps = tmpl.steps;
    } else {
      const channels: Array<'email' | 'linkedin' | 'telegram'> =
        channel === 'linkedin'
          ? ['linkedin', 'linkedin', 'linkedin', 'linkedin', 'linkedin']
          : [...MIXED_CADENCE_CHANNELS];
      cadenceSteps = CADENCE.map((cad, i) => ({
        touchIndex: cad.touchIndex,
        delayDays: cad.delayDays,
        channel: channels[i],
      }));
    }

    const steps: SequenceStep[] = [];
    const enrolledAt = new Date();

    for (let i = 0; i < cadenceSteps.length; i++) {
      const cadence = cadenceSteps[i];
      const channel = cadence.channel;
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
        channel,
        scheduledAt: computeScheduledDate(enrolledAt, cadence.delayDays).toISOString(),
        status: 'pending',
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

/**
 * Unsubscribe — token is the auth (HMAC of the email address). GET renders a
 * tiny confirmation page; POST is the RFC 8058 one-click target.
 */
import { unsubscribeToken, isSuppressed } from '../outreach/scheduler.js';
import { createHandoff } from '../outreach/handoffs.js';

async function applyUnsubscribe(email: string): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.suppression)
    .values({ id: randomUUID(), email, reason: 'unsubscribe' })
    .execute();
  // Pause active sequences targeting this address
  await db.execute(sql`
    UPDATE outreach_sequences os SET status = 'paused', updated_at = NOW()
    FROM people pe
    WHERE os.person_id = pe.id AND pe.email = ${email} AND os.status = 'active'
  `);
  await db
    .insert(schema.auditLog)
    .values({ id: randomUUID(), actor: 'public', action: 'unsubscribe', entity: 'suppression', entityId: email, meta: {} })
    .execute();
}

function validUnsubRequest(c: { req: { query: (k: string) => string | undefined } }): string | null {
  const email = c.req.query('email')?.toLowerCase();
  const token = c.req.query('t');
  if (!email || !token) return null;
  if (unsubscribeToken(email) !== token) return null;
  return email;
}

outreachRoutes.get('/unsubscribe', async (c) => {
  const email = validUnsubRequest(c);
  if (!email) return c.text('Invalid unsubscribe link.', 400);
  await applyUnsubscribe(email);
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center">
       <h2>You're unsubscribed</h2>
       <p>${email} will not receive further outreach from LCX.</p>
     </body>`,
  );
});

outreachRoutes.post('/unsubscribe', async (c) => {
  const email = validUnsubRequest(c);
  if (!email) return c.json({ error: 'Invalid unsubscribe token', code: 'INVALID_TOKEN' }, 400);
  await applyUnsubscribe(email);
  return c.json({ ok: true });
});

/**
 * Inbound reply webhook — Cloudflare Email Worker forwards parsed replies
 * here. Secret header is the auth; sender is matched to a person and a
 * handoff is created (reply = full stop).
 */
outreachRoutes.post('/webhooks/inbound', async (c) => {
  const secret = c.req.header('x-inbound-secret');
  if (!env.inboundWebhookSecret || secret !== env.inboundWebhookSecret) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
  }

  const body: { from?: string; subject?: string; text?: string } = await c.req
    .json<{ from?: string; subject?: string; text?: string }>()
    .catch(() => ({}));
  const from = body.from?.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (!from) return c.json({ error: 'No parseable sender', code: 'VALIDATION' }, 400);

  const db = getDb();

  // Honor suppression silently
  const [person] = await db
    .select({ id: schema.people.id, projectId: schema.people.projectId })
    .from(schema.people)
    .where(sql`LOWER(${schema.people.email}) = ${from}`)
    .limit(1)
    .execute();

  if (!person?.projectId) {
    await db
      .insert(schema.auditLog)
      .values({ id: randomUUID(), actor: 'inbound', action: 'inbound_unmatched', entity: 'messages', entityId: from, meta: { subject: body.subject ?? '' } })
      .execute();
    return c.json({ data: { matched: false } });
  }

  if (await isSuppressed({ projectId: person.projectId, email: from })) {
    return c.json({ data: { matched: true, suppressed: true } });
  }

  // Latest outbound message to this person for thread context
  const [lastMsg] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(sql`LOWER(${schema.messages.toEmail}) = ${from}`)
    .orderBy(desc(schema.messages.createdAt))
    .limit(1)
    .execute();

  const handoff = await createHandoff({
    projectId: person.projectId,
    personId: person.id,
    channel: 'email',
    triggerMessageId: lastMsg?.id,
    triggerReason: 'email_reply',
  });

  // Store the reply text on the handoff summary (first 500 chars)
  const replyText = (body.text ?? '').slice(0, 500);
  if (replyText) {
    await db.execute(sql`UPDATE handoffs SET summary = ${replyText} WHERE id = ${(handoff as { id: string }).id}`);
  }

  return c.json({ data: { matched: true, handoffId: (handoff as { id: string }).id } }, 201);
});
