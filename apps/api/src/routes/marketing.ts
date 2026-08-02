/**
 * LCX MARKETING routes.
 *   GET    /v1/marketing/queue        the reply queue, worst-SLA first
 *   GET    /v1/marketing/summary      counts + oldest-since-learned + suspicious
 *   GET    /v1/marketing/quarantined  what failed sender authentication, and id collisions
 *   POST   /v1/marketing/ingest       paste a reply by hand (works with zero setup)
 *   POST   /v1/marketing/tick         pull the mailbox + sweep rows AND raw_email (cron)
 *   POST   /v1/marketing/:id/draft    ask the AI for an answer
 *   GET    /v1/marketing/:id/drafts   drafts for a reply
 *   POST   /v1/marketing/draft/:id/approve   clear the text; audited, does NOT mean sent
 *   POST   /v1/marketing/draft/:id/sent      a named human asserts they pasted it
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
  approveDraft, assertSent, ingestEmails, insertReply, listDrafts, listQuarantined,
  listReplies, isMigrated, queueSummary, saveDraft, setReplyStatus, sweepExpired,
  sweepRawEmail,
  type ReplyStatus,
} from '../marketing/service.js';
import { fetchNotificationEmails, mailConfigured } from '../marketing/xMail.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const STATUSES: readonly ReplyStatus[] = ['new', 'triaged', 'drafted', 'answered', 'ignored'];


/**
 * Every route goes through this. Before 0046 is applied the compartment reports
 * itself as not-yet-enabled instead of throwing — see `isMigrated`. A 500 here
 * would read as "the platform is down" during a window that is really "one
 * migration is pending", and those demand very different reactions.
 *
 * Reads answer with an empty, well-shaped body so the UI renders its banner
 * rather than its error state. Writes answer 503 — the request was valid and
 * would have worked; the environment is not ready. Never 500.
 */
const NOT_MIGRATED = {
  error: 'LCX MARKETING is awaiting migration 0046 on this environment',
  code: 'MIGRATION_PENDING',
} as const;

export const marketingRoutes = new Hono<{ Variables: AuthVariables }>();

marketingRoutes.get('/queue', requireOperator, async (c) => {
  try {
    const raw = c.req.query('status');
    const status = STATUSES.includes(raw as ReplyStatus) ? (raw as ReplyStatus) : undefined;
    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json({ data: [], meta: { ...meta(), migrated: false } });
    const rows = await listReplies(pool, { status, limit: Number(c.req.query('limit') ?? 50) });
    return c.json({ data: rows, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[marketing] queue error:', err);
    return c.json({ error: 'Failed to load queue', code: 'MARKETING_ERROR' }, 500);
  }
});

marketingRoutes.get('/summary', requireOperator, async (c) => {
  try {
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({
        data: {
          counts: {}, oldestUnansweredHours: null, suspicious: 0, unparsed: 0,
          mailConfigured: mailConfigured(), migrated: false,
        },
        meta: meta(),
      });
    }
    const s = await queueSummary(pool);
    return c.json({ data: { ...s, mailConfigured: mailConfigured(), migrated: true }, meta: meta() });
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
    // Validation FIRST, migration probe second: a malformed request is malformed
    // in every environment, and answering 503 for a bad handle would tell the
    // caller to retry later something that will never succeed.
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

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
 * Pull, never push: this route opens no endpoint the public internet can write to
 * unauthenticated. 308 of the API's routes are authenticated and only 3 are not; this is
 * not becoming the 4th.
 *
 * BUT IT IS NOT AN ANTI-FORGERY CONTROL, and the sentence here used to claim it was
 * ("nothing about this opens an inbound endpoint that the public internet can write
 * fabricated replies into"). That was false in the way that matters: the tick polls a
 * MAILBOX, and anyone who learns the polled address can post a message into it with an
 * attacker-chosen handle, comment id and body. Authentication on this route protects the
 * trigger, not the content.
 *
 * What actually makes a forged item harmless is downstream and is not a comment:
 * `xMail.ts:211 readSenderEvidence` reads the topmost `Authentication-Results` from a
 * trusted authserv-id or ARC instance 1, and `service.ts:196` grades an unauthenticated
 * row F6, quarantines it, and excludes it from the queue, the counts and every SLA. With
 * `X_MAIL_TRUSTED_AUTHSERV` unset, NOTHING passes. Migration 0059 carries the columns
 * that record it, so until 0059 is applied the quarantine has nowhere to write.
 */
marketingRoutes.post('/tick', requireOperator, async (c) => {
  try {
    const pool = getPool();
    if (!(await isMigrated(pool))) {
      return c.json({ data: { migrated: false, note: 'awaiting migration 0046 — nothing to sweep or poll yet' }, meta: meta() });
    }
    const swept = await sweepExpired(pool);
    /*
     * THE FIELD SWEEP, WHICH NOTHING CALLED BEFORE. `raw_email` is the most incidental
     * third-party data in the compartment and 0046's comment claimed it was "cleared once
     * parsed" while no code cleared it. `sweepRawEmail` existed after M0 and was reachable
     * from no route, which is the same defect one layer up: a retention promise nothing
     * executes. It runs on the same tick as the row sweep and on a much shorter clock,
     * because data minimisation is per-field, not per-table.
     */
    const rawCleared = await sweepRawEmail(pool);

    if (!mailConfigured()) {
      // Keyless-first, like x402 and the AI layer: unconfigured is a normal
      // state that reports itself, not an error that pages someone.
      return c.json({
        data: { mailConfigured: false, swept, rawCleared, ingested: null, note: 'X_MAIL_* not configured — retention swept, no mailbox polled' },
        meta: meta(),
      });
    }

    const emails = await fetchNotificationEmails();
    const ingested = await ingestEmails(pool, emails);
    return c.json({ data: { mailConfigured: true, swept, rawCleared, fetched: emails.length, ingested }, meta: meta() });
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
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);
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
    if (!(await isMigrated(getPool()))) return c.json({ data: [], meta: { ...meta(), migrated: false } });
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
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);
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

/**
 * A named human asserts they pasted an approved draft into X. THE ONLY WAY 'answered'
 * BECOMES TRUE, and it is separate from approve on purpose.
 *
 * Defect 5 of the eight was that `answered` was set on APPROVAL. There is no send path in
 * this compartment and there must never be one, so approval could never mean "sent": the
 * approved text and the sent text need not be equal, and nothing here can check. M0 split
 * approval into `approved_pending_send` and put the assertion behind this route, then left
 * the route unwritten — so the split existed and the state could never advance past
 * pending. Attributed to the authenticated principal, never to a body field, for the same
 * reason approve is: an assertion the client could sign for somebody else is not testimony.
 *
 * `assertSent` records it as testimony (`observed: false`). Whether the post exists is a
 * question for oEmbed, which is an independent channel and does not read this column.
 */
marketingRoutes.post('/draft/:id/sent', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION' }, 400);
    }
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const row = await assertSent(getPool(), id, operator?.id ?? 'unknown');
    if (!row) {
      return c.json(
        { error: 'draft not found, not approved, or already asserted sent', code: 'NOT_FOUND' },
        404,
      );
    }
    return c.json({ data: row, meta: meta() });
  } catch (err) {
    console.error('[marketing] assert-sent error:', err);
    return c.json({ error: 'Failed to record the send', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * The quarantine lane. Everything that could not be sender-authenticated, plus every id
 * collision with differing content.
 *
 * IT HAS TO BE VISIBLE OR THE CONTROL IS WORSE THAN NOTHING. `service.ts:196` grades an
 * unauthenticated row F6 and excludes it from the queue, the counts and every SLA — which
 * is correct, and which also means a forgery attempt disappears silently unless a surface
 * can show it. "We are being attacked" is a thing the desk must be able to see, and
 * `listQuarantined` was reachable from no route.
 *
 * Read-only, at 'view'. Nothing here promotes a row out of quarantine: authentication is
 * evidence that either survived or did not, and a button that overrode it would be the
 * whole control undone by one tired click.
 */
marketingRoutes.get('/quarantined', async (c) => {
  try {
    if (!(await isMigrated(getPool()))) return c.json({ data: [], meta: { ...meta(), migrated: false } });
    const limit = Number(c.req.query('limit') ?? '50');
    return c.json({
      data: await listQuarantined(getPool(), Number.isFinite(limit) ? limit : 50),
      meta: {
        ...meta(),
        note: 'Rows that failed sender authentication or collided with an existing id. Excluded from the queue, the counts and every SLA. There is no path from here into the queue.',
      },
    });
  } catch (err) {
    console.error('[marketing] quarantine error:', err);
    return c.json({ error: 'Failed to load quarantine', code: 'MARKETING_ERROR' }, 500);
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
    if (!(await isMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);
    await setReplyStatus(getPool(), id, body.status as ReplyStatus);
    return c.json({ data: { ok: true }, meta: meta() });
  } catch (err) {
    console.error('[marketing] status error:', err);
    return c.json({ error: 'Failed to set status', code: 'MARKETING_ERROR' }, 500);
  }
});
