import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import * as resend from './resend.js';
import { env } from '../lib/env.js';
import { randomUUID } from 'node:crypto';
import type { SequenceStep } from '@lcx/shared';
import { createLinkedInProvider, checkLiCap, incrementLiUsage } from './linkedin.js';

const DAILY_CAP = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

let rateLimitTokens = RATE_LIMIT_MAX;
let lastRefill = Date.now();

function refillTokens() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const refill = Math.floor(elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_MAX;
  if (refill > 0) {
    rateLimitTokens = Math.min(RATE_LIMIT_MAX, rateLimitTokens + refill);
    lastRefill = now;
  }
}

function acquireToken(): boolean {
  refillTokens();
  if (rateLimitTokens > 0) {
    rateLimitTokens--;
    return true;
  }
  return false;
}

export interface TickResult {
  processed: number;
  sent: number;
  errors: number;
  skipped: number;
}

export async function processOutboundTick(): Promise<TickResult> {
  const db = getDb();
  let processed = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  // Find active sequences needing next step
  const sequences = await db
    .select()
    .from(schema.outreachSequences)
    .where(sql`${schema.outreachSequences.status} = 'active'`)
    .execute();

  for (const seq of sequences) {
    if (!acquireToken()) {
      skipped++;
      continue;
    }

    const steps = (seq.steps ?? []) as SequenceStep[];
    const currentStepIndex = seq.currentStep ?? 0;

    if (currentStepIndex >= steps.length) {
      // Mark sequence as completed
      await db
        .update(schema.outreachSequences)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
        .execute();
      continue;
    }

    const step = steps[currentStepIndex];

    // Check if this step is due (delay-based)
    const enrolledAt = seq.startedAt ?? seq.createdAt;
    const delayMs = (step.delayDays ?? 0) * 24 * 60 * 60 * 1000;
    const scheduledAt = new Date(enrolledAt.getTime() + delayMs);

    if (scheduledAt > new Date()) {
      skipped++;
      continue;
    }

    // Check daily cap (simple counter — count today's sends)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.messages)
      .where(
        sql`${schema.messages.createdAt} >= ${today} AND ${schema.messages.status} != 'pending'`,
      )
      .execute()
      .then(r => Number(r[0]?.count ?? 0));

    if (todayCount >= DAILY_CAP) {
      skipped++;
      continue;
    }

    // Find the person
    const people = seq.personId
      ? await db.select().from(schema.people).where(sql`${schema.people.id} = ${seq.personId}`).limit(1).execute()
      : [];
    const person = people[0];

    if (seq.channel === 'linkedin') {
      // ── LinkedIn path ──
      if (!person?.linkedin) {
        await db
          .update(schema.outreachSequences)
          .set({ currentStep: currentStepIndex + 1, updatedAt: new Date() })
          .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
          .execute();
        errors++;
        continue;
      }

      const action = step.touchIndex === 1 ? 'connection_request' : 'message';
      const caps = await checkLiCap(action);
      const canSend = action === 'connection_request' ? caps.canSendConnection : caps.canSendMessage;
      if (!canSend) {
        skipped++;
        continue;
      }

      const liProvider = createLinkedInProvider();
      try {
        const liResult = action === 'connection_request'
          ? await liProvider.sendConnectionRequest({ profileUrl: person.linkedin, note: step.body })
          : await liProvider.sendMessage({ profileUrl: person.linkedin, message: step.body });

        await incrementLiUsage(action);

        await db
          .insert(schema.messages)
          .values({
            id: randomUUID(),
            sequenceId: seq.id,
            projectId: seq.projectId,
            stepIndex: currentStepIndex,
            touchIndex: step.touchIndex,
            toEmail: person.email ?? '',
            toName: person.name,
            subject: step.subject,
            body: step.body,
            provider: 'linkedin',
            providerMessageId: liResult.providerMessageId,
            status: liResult.success ? 'sent' : 'pending',
            sentAt: new Date(),
          })
          .execute();

        // Update linkedin status
        const newStatus = action === 'connection_request' ? 'pending' : 'messaged';
        if (newStatus === 'pending' || person.linkedinStatus !== 'connected') {
          await db
            .update(schema.people)
            .set({ linkedinStatus: newStatus, updatedAt: new Date() })
            .where(sql`${schema.people.id} = ${person.id}`)
            .execute();
        }

        // Advance step
        await db
          .update(schema.outreachSequences)
          .set({ currentStep: currentStepIndex + 1, updatedAt: new Date() })
          .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
          .execute();

        processed++;
        sent++;
      } catch (err) {
        await db
          .insert(schema.messages)
          .values({
            id: randomUUID(),
            sequenceId: seq.id,
            projectId: seq.projectId,
            stepIndex: currentStepIndex,
            touchIndex: step.touchIndex,
            toEmail: person.email ?? '',
            toName: person.name,
            subject: step.subject,
            body: step.body,
            provider: 'linkedin',
            status: 'pending',
            error: err instanceof Error ? err.message : 'LinkedIn send failed',
          })
          .execute();
        errors++;
      }
      continue;
    }

    // ── Email path (Resend) ──
    const toEmail = person?.email ?? '';
    if (!toEmail) {
      await db
        .update(schema.outreachSequences)
        .set({ currentStep: currentStepIndex + 1, updatedAt: new Date() })
        .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
        .execute();
      errors++;
      continue;
    }

    try {
      const providerMessageId = await resend.sendEmail({
        from: seq.fromEmail ?? env.outreachFromEmail,
        to: toEmail,
        subject: step.subject,
        html: step.body,
        headers: {
          'X-Sequence-Id': seq.id,
          'X-Step-Index': String(currentStepIndex),
        },
      });

      await db
        .insert(schema.messages)
        .values({
          id: randomUUID(),
          sequenceId: seq.id,
          projectId: seq.projectId,
          stepIndex: currentStepIndex,
          touchIndex: step.touchIndex,
          toEmail,
          toName: person?.name ?? null,
          subject: step.subject,
          body: step.body,
          provider: 'resend',
          providerMessageId,
          status: 'sent',
          sentAt: new Date(),
        })
        .execute();

      // Advance to next step
      await db
        .update(schema.outreachSequences)
        .set({ currentStep: currentStepIndex + 1, updatedAt: new Date() })
        .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
        .execute();

      processed++;
      sent++;
    } catch (err) {
      await db
        .insert(schema.messages)
        .values({
          id: randomUUID(),
          sequenceId: seq.id,
          projectId: seq.projectId,
          stepIndex: currentStepIndex,
          touchIndex: step.touchIndex,
          toEmail,
          toName: person?.name ?? null,
          subject: step.subject,
          body: step.body,
          provider: 'resend',
          status: 'pending',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        .execute();

      errors++;
    }
  }

  return { processed, sent, errors, skipped };
}

export async function handleWebhookEvent(event: ResendWebhookEvent): Promise<void> {
  const db = getDb();

  if (event.type === 'email.delivered') {
    await db
      .update(schema.messages)
      .set({ status: 'delivered', deliveredAt: new Date(), updatedAt: new Date() })
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .execute();
  } else if (event.type === 'email.bounced') {
    await db
      .update(schema.messages)
      .set({ status: 'bounced', bouncedAt: new Date(), error: event.data?.bounce?.reason ?? 'Bounced', updatedAt: new Date() })
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .execute();

    // Auto-suppress the project
    const msg = await db
      .select({ projectId: schema.messages.projectId })
      .from(schema.messages)
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .limit(1)
      .execute();

    if (msg.length > 0) {
      const projectRows = await db
        .select({ raw: schema.projects.raw })
        .from(schema.projects)
        .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
        .limit(1)
        .execute();

      if (projectRows.length > 0) {
        const currentRaw = (projectRows[0].raw ?? {}) as Record<string, unknown>;
        await db
          .update(schema.projects)
          .set({
            raw: {
              ...currentRaw,
              _outreach: { approved: false, suppressed: true, suppressedAt: new Date().toISOString(), reason: 'bounce' },
            },
            updatedAt: new Date(),
          })
          .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
          .execute();

        // Pause all active sequences for this project
        await db
          .update(schema.outreachSequences)
          .set({ status: 'paused', updatedAt: new Date() })
          .where(sql`${schema.outreachSequences.projectId} = ${msg[0].projectId} AND ${schema.outreachSequences.status} = 'active'`)
          .execute();
      }
    }
  } else if (event.type === 'email.complained') {
    await db
      .update(schema.messages)
      .set({ status: 'complained', complainedAt: new Date(), updatedAt: new Date() })
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .execute();

    // Same auto-suppress logic as bounce
    const msg = await db
      .select({ projectId: schema.messages.projectId })
      .from(schema.messages)
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .limit(1)
      .execute();

    if (msg.length > 0) {
      const projectRows = await db
        .select({ raw: schema.projects.raw })
        .from(schema.projects)
        .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
        .limit(1)
        .execute();

      if (projectRows.length > 0) {
        const currentRaw = (projectRows[0].raw ?? {}) as Record<string, unknown>;
        await db
          .update(schema.projects)
          .set({
            raw: {
              ...currentRaw,
              _outreach: { approved: false, suppressed: true, suppressedAt: new Date().toISOString(), reason: 'complaint' },
            },
            updatedAt: new Date(),
          })
          .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
          .execute();

        await db
          .update(schema.outreachSequences)
          .set({ status: 'paused', updatedAt: new Date() })
          .where(sql`${schema.outreachSequences.projectId} = ${msg[0].projectId} AND ${schema.outreachSequences.status} = 'active'`)
          .execute();
      }
    }
  }
}

export interface ResendWebhookEvent {
  type: 'email.delivered' | 'email.bounced' | 'email.complained';
  data: {
    email_id: string;
    bounce?: { reason: string };
    [key: string]: unknown;
  };
}
