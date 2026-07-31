/**
 * LCX MARKETING routes.
 *   GET    /v1/marketing/queue        the reply queue, worst-SLA first
 *   GET    /v1/marketing/summary      counts + oldest-unanswered + suspicious
 *   POST   /v1/marketing/ingest       paste a reply by hand (works with zero setup)
 *   POST   /v1/marketing/tick         pull the mailbox + sweep retention (cron)
 *   POST   /v1/marketing/:id/draft    ask the AI for an answer
 *   GET    /v1/marketing/:id/drafts   drafts for a reply
 *   POST   /v1/marketing/draft/:id/approve   the governed act
 *   POST   /v1/marketing/:id/status   triage without drafting
 *
 * The whole namespace is guarded at 'view' by `requireWorkspace('marketing')`,
 * mounted automatically in app.ts from the workspace registry's `apiPrefixes`.
 * Write routes additionally demand `requireOperator`.
 *
 * THERE IS NO ROUTE THAT POSTS TO X, and there is deliberately nowhere to add
 * one. Approval yields text a human copies. See migration 0046.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  approveDraft, ingestEmails, insertReply, listDrafts, listReplies,
  queueSummary, saveDraft, setReplyStatus, sweepExpired,
  type ReplyStatus,
} from '../marketing/service.js';
import { fetchNotificationEmails, mailConfigured } from '../marketing/xMail.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const STATUSES: readonly ReplyStatus[] = ['new', 'triaged', 'drafted', 'answered', 'ignored'];

export const marketingRoutes = new Hono<{ Variables: AuthVariables }>();

marketingRoutes.get('/queue', requireOperator, async (c) => {
  try {
    const raw = c.req.query('status');
    const status = STATUSES.includes(raw as ReplyStatus) ? (raw as ReplyStatus) : undefined;
    const rows = await listReplies(getPool(), { status, limit: Number(c.req.query('limit') ?? 50) });
    return c.json({ data: rows, meta: meta() });
  } catch (err) {
    console.error('[marketing] queue error:', err);
    return c.json({ error: 'Failed to load queue', code: 'MARKETING_ERROR' }, 500);
  }
});

marketingRoutes.get('/summary', requireOperator, async (c) => {
  try {
    const s = await queueSummary(getPool());
    return c.json({ data: { ...s, mailConfigured: mailConfigured() }, meta: meta() });
  } catch (err) {
    console.error('[marketing] summary error:', err);
    return c.json({ error: 'Failed to load summary', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * Paste a reply by hand.
 *
 * This exists so the compartment is USEFUL ON DAY ONE, before any mail plumbing:
 * a marketing person pastes the reply text and the permalink, and immediately
 * gets AI drafting, approval and audit. It is also the fallback for anything the
 * email parser cannot handle, and the path used to test the queue end to end
 * without waiting on a real notification.
 *
 * Graded `B2` rather than `C3` — a named operator typed it, which is more
 * reliable than a parsed email, and the grade says so.
 */
marketingRoutes.post('/ingest', requireOperator, async (c) => {
  try {
    const body = await c.req.json<{
      xCommentId?: string; xPostId?: string; authorHandle?: string;
      authorDisplay?: string; body?: string;
    }>();

    const handle = (body.authorHandle ?? '').replace(/^@/, '').trim();
    const text = (body.body ?? '').trim();
    if (!handle || !text) {
      return c.json({ error: 'authorHandle and body are required', code: 'VALIDATION' }, 400);
    }
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return c.json({ error: 'authorHandle is not a valid X handle', code: 'VALIDATION' }, 400);
    }

    // A synthetic id when none is supplied keeps the UNIQUE dedupe meaningful and
    // makes the provenance obvious in the row itself.
    const id = (body.xCommentId ?? '').trim() || `manual:${Date.now()}:${handle}`;

    const result = await insertReply(getPool(), {
      xCommentId: id,
      xPostId: (body.xPostId ?? '').trim() || null,
      authorHandle: handle,
      authorDisplay: (body.authorDisplay ?? '').trim() || null,
      body: text.slice(0, 4000),
      postedAt: null,
      sourceKind: 'manual_paste',
    });

    return c.json({ data: { result }, meta: meta() }, result === 'inserted' ? 201 : 200);
  } catch (err) {
    console.error('[marketing] ingest error:', err);
    return c.json({ error: 'Failed to ingest', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * The cron entrypoint. cron-job.org POSTs here with the shared operator key,
 * which holds blanket 'operate' on every workspace, so the tick never needs a
 * human grant (see middleware/workspace.ts).
 *
 * Pull, never push: nothing about this opens an inbound endpoint that the public
 * internet can write fabricated replies into. Verified during design — 308 of the
 * API's routes are authenticated and only 3 are not; this is not becoming the 4th.
 */
marketingRoutes.post('/tick', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const swept = await sweepExpired(pool);

    if (!mailConfigured()) {
      // Keyless-first, like x402 and the AI layer: unconfigured is a normal
      // state that reports itself, not an error that pages someone.
      return c.json({
        data: { mailConfigured: false, swept, ingested: null, note: 'X_MAIL_* not configured — retention swept, no mailbox polled' },
        meta: meta(),
      });
    }

    const emails = await fetchNotificationEmails();
    const ingested = await ingestEmails(pool, emails);
    return c.json({ data: { mailConfigured: true, swept, fetched: emails.length, ingested }, meta: meta() });
  } catch (err) {
    console.error('[marketing] tick error:', err);
    return c.json({ error: 'Tick failed', code: 'MARKETING_ERROR' }, 500);
  }
});

marketingRoutes.post('/:id/draft', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION' }, 400);
    }
    const pool = getPool();
    const rows = await pool.query(
      `SELECT author_handle, body FROM marketing_x_reply WHERE id = $1`, [id],
    );
    const reply = rows.rows[0] as { author_handle: string; body: string } | undefined;
    if (!reply) return c.json({ error: 'reply not found', code: 'NOT_FOUND' }, 404);

    const { draftReply } = await import('../ai/socialReply.js');
    const drafted = await draftReply({ authorHandle: reply.author_handle, body: reply.body });
    const saved = await saveDraft(pool, id, drafted.text, drafted.usedLlm);

    return c.json({
      data: { draft: saved, usedLlm: drafted.usedLlm, suspiciousInput: drafted.suspiciousInput },
      meta: meta(),
    }, 201);
  } catch (err) {
    console.error('[marketing] draft error:', err);
    return c.json({ error: 'Failed to draft', code: 'MARKETING_ERROR' }, 500);
  }
});

marketingRoutes.get('/:id/drafts', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION' }, 400);
    }
    return c.json({ data: await listDrafts(getPool(), id), meta: meta() });
  } catch (err) {
    console.error('[marketing] drafts error:', err);
    return c.json({ error: 'Failed to load drafts', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * Approve — attributed to the authenticated principal, never to a body field.
 * Letting the client name the approver would make the audit row a suggestion.
 */
marketingRoutes.post('/draft/:id/approve', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION' }, 400);
    }
    const operator = c.get('operator');
    const row = await approveDraft(getPool(), id, operator?.id ?? 'unknown');
    if (!row) {
      return c.json({ error: 'draft not found or already decided', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ data: row, meta: meta() });
  } catch (err) {
    console.error('[marketing] approve error:', err);
    return c.json({ error: 'Failed to approve', code: 'MARKETING_ERROR' }, 500);
  }
});

marketingRoutes.post('/:id/status', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{ status?: string }>();
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION' }, 400);
    }
    if (!STATUSES.includes(body.status as ReplyStatus)) {
      return c.json({ error: `status must be one of ${STATUSES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    await setReplyStatus(getPool(), id, body.status as ReplyStatus);
    return c.json({ data: { ok: true }, meta: meta() });
  } catch (err) {
    console.error('[marketing] status error:', err);
    return c.json({ error: 'Failed to set status', code: 'MARKETING_ERROR' }, 500);
  }
});
