/**
 * Phase-3 AI/ML routes. Every endpoint has a deterministic result that works
 * with no ANTHROPIC_API_KEY; the LLM only refines when a key is set. The
 * `usedLlm` flag in each response tells the SPA whether the real LLM ran.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { getHandoff } from '../outreach/handoffs.js';
import { generateReplyDraftsAi } from '../ai/replyDraftAi.js';
import { classifySentiment } from '../ai/sentiment.js';
import { scoreNarrative } from '../ai/narrative.js';
import { personalizeDraft, type ProjectFacts } from '../ai/personalize.js';
import { suggestObjectionResponse } from '../ai/objections.js';
import { extractProjectFacts } from '../ai/enrichLlm.js';
import { summarizeThread, type ThreadMessage } from '../ai/conversation.js';
import { bestSendTime } from '../ai/schedule.js';
import { analyzeWinLoss } from '../ai/winloss.js';
import type { Channel, Jurisdiction } from '@lcx/shared';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const aiRoutes = new Hono<{ Variables: AuthVariables }>();

/* 3-1 — LLM-refined reply drafts. POST /v1/ai/reply-drafts/:handoffId?llm=true */
aiRoutes.post('/reply-drafts/:handoffId', requireOperator, async (c) => {
  const { handoffId } = c.req.param();
  const wantLlm = c.req.query('llm') === 'true';
  try {
    const handoff = await getHandoff(handoffId);
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
      .select({ region: schema.projects.region })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${handoff.project_id}`)
      .limit(1)
      .execute();

    const [score] = await db
      .select({ band: schema.scores.band })
      .from(schema.scores)
      .where(sql`${schema.scores.projectId} = ${handoff.project_id}`)
      .limit(1)
      .execute();

    const result = await generateReplyDraftsAi(
      {
        projectName: String(handoff.project_name ?? 'your project'),
        projectTicker: handoff.project_ticker ? String(handoff.project_ticker) : null,
        projectBand: score?.band ?? 'unscored',
        contactName: String(handoff.person_name ?? 'there'),
        channel: (handoff.channel as Channel) ?? 'email',
        repliedToTouchIndex,
        jurisdiction: (project?.region === 'us' ? 'us' : 'eu') as Jurisdiction,
        lcxTelegramHandle: env.lcxTelegramHandle,
      },
      wantLlm,
    );

    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] reply-drafts error:', err);
    return c.json({ error: 'Failed to generate reply drafts', code: 'AI_DRAFT_ERROR' }, 500);
  }
});

/* 3-2 — Sentiment. POST /v1/ai/sentiment {text} */
aiRoutes.post('/sentiment', requireOperator, async (c) => {
  const body = (await c.req.json<{ text?: string }>().catch(() => ({ text: '' }))) as { text?: string };
  if (!body.text?.trim()) return c.json({ error: 'Missing text', code: 'MISSING_TEXT' }, 400);
  try {
    const result = await classifySentiment(body.text);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] sentiment error:', err);
    return c.json({ error: 'Failed to classify sentiment', code: 'SENTIMENT_ERROR' }, 500);
  }
});

/* 3-3 — Narrative scoring. POST /v1/ai/narrative/:projectId */
aiRoutes.post('/narrative/:projectId', requireOperator, async (c) => {
  const { projectId } = c.req.param();
  try {
    const db = getDb();
    const [project] = await db
      .select({
        name: schema.projects.name,
        category: schema.projects.category,
        website: schema.projects.website,
        whitepaperUrl: schema.projects.whitepaperUrl,
      })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${projectId}`)
      .limit(1)
      .execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    // Optional caller-supplied whitepaper text (crawled elsewhere); the URL alone
    // is a weak signal but still feeds the deterministic scorer.
    const body = (await c.req.json<{ whitepaperText?: string }>().catch(() => ({} as never))) as { whitepaperText?: string };

    const result = await scoreNarrative({
      name: project.name,
      category: project.category,
      website: project.website,
      whitepaperText: body.whitepaperText ?? project.whitepaperUrl ?? null,
    });

    // Cache the score for queue sorting (best-effort).
    try {
      await db.execute(sql`UPDATE scores SET narrative_score = ${result.score} WHERE project_id = ${projectId}`);
    } catch { /* scores row may not exist yet */ }

    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] narrative error:', err);
    return c.json({ error: 'Failed to score narrative', code: 'NARRATIVE_ERROR' }, 500);
  }
});

/* 3-4 — Personalized content. POST /v1/ai/personalize {baseDraft, projectFacts} */
aiRoutes.post('/personalize', requireOperator, async (c) => {
  const body = (await c.req.json<{ baseDraft?: string; projectFacts?: ProjectFacts }>().catch(() => ({} as never))) as { baseDraft?: string; projectFacts?: ProjectFacts };
  if (!body.baseDraft?.trim()) return c.json({ error: 'Missing baseDraft', code: 'MISSING_DRAFT' }, 400);
  try {
    const result = await personalizeDraft(body.baseDraft, body.projectFacts ?? {});
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] personalize error:', err);
    return c.json({ error: 'Failed to personalize draft', code: 'PERSONALIZE_ERROR' }, 500);
  }
});

/* 3-5 — Objection handling. GET/POST /v1/ai/objection-response */
async function handleObjection(c: Context<{ Variables: AuthVariables }>) {
  let text = c.req.query('text') ?? '';
  if (!text && c.req.method === 'POST') {
    const body = (await c.req.json<{ text?: string; objection?: string }>().catch(() => ({} as never))) as { text?: string; objection?: string };
    text = body.text ?? body.objection ?? '';
  }
  if (!text.trim()) return c.json({ error: 'Missing objection text', code: 'MISSING_TEXT' }, 400);
  try {
    const result = await suggestObjectionResponse(text);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] objection error:', err);
    return c.json({ error: 'Failed to suggest response', code: 'OBJECTION_ERROR' }, 500);
  }
}
aiRoutes.get('/objection-response', requireOperator, handleObjection);
aiRoutes.post('/objection-response', requireOperator, handleObjection);

/* 3-6 — LLM enrichment. POST /v1/ai/enrich/:projectId {text?} */
aiRoutes.post('/enrich/:projectId', requireOperator, async (c) => {
  const { projectId } = c.req.param();
  try {
    const db = getDb();
    const [project] = await db
      .select({ name: schema.projects.name, website: schema.projects.website, raw: schema.projects.raw })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${projectId}`)
      .limit(1)
      .execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    const body = (await c.req.json<{ text?: string }>().catch(() => ({} as never))) as { text?: string };
    // Prefer explicit crawled text; else fall back to whatever descriptive copy
    // sits in the raw blob + name + website.
    const rawText = typeof project.raw === 'object' && project.raw ? JSON.stringify(project.raw) : '';
    const text = body.text?.trim() || `${project.name} ${project.website ?? ''} ${rawText}`;

    const result = await extractProjectFacts(text);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] enrich error:', err);
    return c.json({ error: 'Failed to enrich project', code: 'ENRICH_ERROR' }, 500);
  }
});

/* 3-8 — Conversation intelligence. POST /v1/ai/summarize/:handoffId {messages?} */
aiRoutes.post('/summarize/:handoffId', requireOperator, async (c) => {
  const { handoffId } = c.req.param();
  try {
    const handoff = await getHandoff(handoffId);
    if (!handoff) return c.json({ error: 'Handoff not found', code: 'NOT_FOUND' }, 404);

    const body = (await c.req.json<{ messages?: ThreadMessage[] }>().catch(() => ({} as never))) as { messages?: ThreadMessage[] };
    let messages: ThreadMessage[] = body.messages ?? [];

    // If the caller didn't supply the thread, reconstruct it from outbound
    // messages for the project (the deterministic summarizer degrades gracefully).
    if (messages.length === 0) {
      const db = getDb();
      const rows = await db
        .select({ subject: schema.messages.subject, msgBody: schema.messages.body })
        .from(schema.messages)
        .where(sql`${schema.messages.projectId} = ${handoff.project_id}`)
        .orderBy(sql`created_at ASC`)
        .limit(50)
        .execute();
      messages = rows.map((r) => ({ from: 'us', body: `${r.subject}\n${r.msgBody}` }));
    }

    const result = await summarizeThread(messages);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] summarize error:', err);
    return c.json({ error: 'Failed to summarize thread', code: 'SUMMARIZE_ERROR' }, 500);
  }
});

/* 3-9 — Smart scheduling (pure deterministic). GET /v1/ai/best-send-time/:projectId */
aiRoutes.get('/best-send-time/:projectId', requireOperator, async (c) => {
  const { projectId } = c.req.param();
  try {
    const db = getDb();
    const [project] = await db
      .select({ region: schema.projects.region, jurisdiction: schema.projects.jurisdiction })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${projectId}`)
      .limit(1)
      .execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    const result = bestSendTime(project.region ?? project.jurisdiction ?? null);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] best-send-time error:', err);
    return c.json({ error: 'Failed to compute send time', code: 'SCHEDULE_ERROR' }, 500);
  }
});

/* 3-10 — Win/loss analysis. GET /v1/ai/win-loss?pool=all|eu|us */
aiRoutes.get('/win-loss', requireOperator, async (c) => {
  const poolQ = c.req.query('pool');
  const pool: 'all' | 'eu' | 'us' = poolQ === 'eu' || poolQ === 'us' ? poolQ : 'all';
  try {
    const result = await analyzeWinLoss(pool);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[ai] win-loss error:', err);
    return c.json({ error: 'Failed to analyze win/loss', code: 'WINLOSS_ERROR' }, 500);
  }
});
