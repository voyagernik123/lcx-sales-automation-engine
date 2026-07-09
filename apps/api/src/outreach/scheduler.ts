import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import * as resend from './resend.js';
import { env } from '../lib/env.js';
import { randomUUID } from 'node:crypto';
import type { SequenceStep, StepChannel } from '@lcx/shared';
import { MIXED_CADENCE_CHANNELS } from '@lcx/shared';
import { isWithinSendWindow } from './sendWindow.js';

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

/**
 * Fill channel/scheduledAt for legacy sequences whose steps predate those
 * fields: channel from the mixed cadence (or the sequence-level channel for
 * linkedin-only sequences), scheduledAt from startedAt + delayDays.
 */
export function resolveStep(
  seq: { channel: string | null; startedAt: Date | null; createdAt: Date },
  step: SequenceStep,
): SequenceStep & { channel: StepChannel; scheduledAtDate: Date } {
  const channel: StepChannel =
    step.channel ??
    (seq.channel === 'linkedin'
      ? 'linkedin'
      : MIXED_CADENCE_CHANNELS[step.touchIndex - 1] ?? 'email');

  const enrolledAt = seq.startedAt ?? seq.createdAt;
  const scheduledAtDate = step.scheduledAt
    ? new Date(step.scheduledAt)
    : new Date(enrolledAt.getTime() + (step.delayDays ?? 0) * 24 * 60 * 60 * 1000);

  return { ...step, channel, scheduledAtDate };
}

/**
 * Suppression check at send time: the suppression table (email/linkedin/project)
 * and the project-level raw._outreach.suppressed flag both block sends.
 */
export async function isSuppressed(opts: {
  projectId: string;
  email?: string | null;
  linkedin?: string | null;
}): Promise<boolean> {
  const db = getDb();

  const conditions = [sql`${schema.suppression.projectId} = ${opts.projectId}`];
  if (opts.email) conditions.push(sql`${schema.suppression.email} = ${opts.email}`);
  if (opts.linkedin) conditions.push(sql`${schema.suppression.linkedin} = ${opts.linkedin}`);

  const [suppRow] = await db
    .select({ id: schema.suppression.id })
    .from(schema.suppression)
    .where(sql`(${sql.join(conditions, sql` OR `)})`)
    .limit(1)
    .execute();
  if (suppRow) return true;

  const [project] = await db
    .select({ raw: schema.projects.raw })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${opts.projectId}`)
    .limit(1)
    .execute();
  const outreachMeta = ((project?.raw ?? {}) as Record<string, unknown>)._outreach as
    | { suppressed?: boolean }
    | undefined;
  return outreachMeta?.suppressed === true;
}

export interface TickResult {
  processed: number;
  sent: number;
  queued: number;
  errors: number;
  skipped: number;
}

export async function processOutboundTick(): Promise<TickResult> {
  const db = getDb();
  let processed = 0;
  let sent = 0;
  let queued = 0;
  let errors = 0;
  let skipped = 0;

  const sequences = await db
    .select()
    .from(schema.outreachSequences)
    .where(sql`${schema.outreachSequences.status} = 'active'`)
    .execute();

  for (const seq of sequences) {
    const steps = (seq.steps ?? []) as SequenceStep[];
    const currentStepIndex = seq.currentStep ?? 0;

    if (currentStepIndex >= steps.length) {
      await db
        .update(schema.outreachSequences)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
        .execute();
      continue;
    }

    const step = resolveStep(seq, steps[currentStepIndex]);

    if (step.scheduledAtDate > new Date()) {
      skipped++;
      continue;
    }

    // Find the person
    const people = seq.personId
      ? await db.select().from(schema.people).where(sql`${schema.people.id} = ${seq.personId}`).limit(1).execute()
      : [];
    const person = people[0];

    // Suppression blocks every channel
    if (await isSuppressed({ projectId: seq.projectId, email: person?.email, linkedin: person?.linkedin })) {
      await db
        .update(schema.outreachSequences)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(sql`${schema.outreachSequences.id} = ${seq.id}`)
        .execute();
      skipped++;
      continue;
    }

    if (step.channel === 'linkedin' || step.channel === 'telegram') {
      // ── Assisted channels: materialize a task; a human sends it ──
      const action =
        step.channel === 'telegram'
          ? 'telegram_dm'
          : step.touchIndex === 1 && person?.linkedinStatus !== 'connected'
            ? 'connection_request'
            : 'message';

      await db
        .insert(schema.outreachTasks)
        .values({
          id: randomUUID(),
          sequenceId: seq.id,
          projectId: seq.projectId,
          personId: seq.personId,
          stepIndex: currentStepIndex,
          touchIndex: step.touchIndex,
          channel: step.channel,
          action,
          subject: step.subject || null,
          body: step.body,
          dueAt: step.scheduledAtDate,
        })
        .onConflictDoNothing({
          target: [schema.outreachTasks.sequenceId, schema.outreachTasks.stepIndex],
        })
        .execute();

      // Do NOT advance currentStep — mark-sent / skip in the Send Queue does that.
      queued++;
      processed++;
      continue;
    }

    // ── Email path (Resend, auto-send) ──
    if (!acquireToken()) {
      skipped++;
      continue;
    }

    if (!isWithinSendWindow()) {
      skipped++;
      continue;
    }

    // Daily cap counts today's auto-sent emails
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.messages)
      .where(
        sql`${schema.messages.createdAt} >= ${today} AND ${schema.messages.status} != 'pending' AND ${schema.messages.provider} = 'resend'`,
      )
      .execute()
      .then(r => Number(r[0]?.count ?? 0));

    if (todayCount >= DAILY_CAP) {
      skipped++;
      continue;
    }

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
        html: buildEmailHtml(step.body, toEmail),
        headers: {
          'X-Sequence-Id': seq.id,
          'X-Step-Index': String(currentStepIndex),
          ...unsubscribeHeaders(toEmail),
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

  return { processed, sent, queued, errors, skipped };
}

/* ──────────────────────────────────────────────
 *  Email compliance: footer + one-click unsubscribe
 * ────────────────────────────────────────────── */

import { createHmac } from 'node:crypto';

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', env.unsubscribeSecret || 'dev-unsub-secret')
    .update(email.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

export function unsubscribeUrl(email: string): string {
  const base = env.apiPublicUrl || `http://localhost:${env.port}`;
  return `${base}/v1/outreach/unsubscribe?email=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

function unsubscribeHeaders(email: string): Record<string, string> {
  const url = unsubscribeUrl(email);
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Compliance footer appended at send time so drafts/templates stay clean. */
export function buildEmailHtml(body: string, toEmail: string): string {
  const footer = [
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px" />',
    '<p style="font-size:12px;color:#6b7280;line-height:1.5">',
    'LCX AG · Herrengasse 6, 9490 Vaduz, Liechtenstein<br/>',
    `You received this because your project looks like a fit for an LCX listing. `,
    `<a href="${unsubscribeUrl(toEmail)}">Unsubscribe</a> to never hear from us again.`,
    '</p>',
  ].join('\n');
  const htmlBody = body.includes('<p') ? body : `<p>${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
  return `${htmlBody}\n${footer}`;
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
    await suppressProjectForMessage(event.data.email_id, 'bounce');
  } else if (event.type === 'email.complained') {
    await db
      .update(schema.messages)
      .set({ status: 'complained', complainedAt: new Date(), updatedAt: new Date() })
      .where(sql`${schema.messages.providerMessageId} = ${event.data.email_id}`)
      .execute();
    await suppressProjectForMessage(event.data.email_id, 'complaint');
  }
}

async function suppressProjectForMessage(providerMessageId: string, reason: 'bounce' | 'complaint'): Promise<void> {
  const db = getDb();
  const msg = await db
    .select({ projectId: schema.messages.projectId, toEmail: schema.messages.toEmail })
    .from(schema.messages)
    .where(sql`${schema.messages.providerMessageId} = ${providerMessageId}`)
    .limit(1)
    .execute();

  if (msg.length === 0) return;

  const projectRows = await db
    .select({ raw: schema.projects.raw })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
    .limit(1)
    .execute();

  if (projectRows.length === 0) return;

  const currentRaw = (projectRows[0].raw ?? {}) as Record<string, unknown>;
  await db
    .update(schema.projects)
    .set({
      raw: {
        ...currentRaw,
        _outreach: { approved: false, suppressed: true, suppressedAt: new Date().toISOString(), reason },
      },
      updatedAt: new Date(),
    })
    .where(sql`${schema.projects.id} = ${msg[0].projectId}`)
    .execute();

  await db
    .insert(schema.suppression)
    .values({
      id: randomUUID(),
      email: msg[0].toEmail || null,
      reason,
      projectId: msg[0].projectId,
    })
    .execute();

  await db
    .update(schema.outreachSequences)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(sql`${schema.outreachSequences.projectId} = ${msg[0].projectId} AND ${schema.outreachSequences.status} = 'active'`)
    .execute();
}

export interface ResendWebhookEvent {
  type: 'email.delivered' | 'email.bounced' | 'email.complained';
  data: {
    email_id: string;
    bounce?: { reason: string };
    [key: string]: unknown;
  };
}
