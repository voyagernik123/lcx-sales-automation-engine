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
import { gateOutboundText, recordGateDecision } from '../marketing/outboundGate.js';
import {
  MARKETING_ABUSE_ACTIONS,
  isAbuseRegisterMigrated,
  listEmbargoRegister,
  listHoldings,
} from '../marketing/abuseRegister.js';
import { ActionError, type ActorRole } from '../actions/types.js';
import type { AbusePerimeterState } from '@lcx/shared';
import { marketingDeskRoutes } from './marketingDesk.js';
import { marketingMemoryRoutes } from './marketingMemory.js';
import { marketingRecordRoutes } from './marketingRecord.js';

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
      sourceKind: 'operator_paste',
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
    /*
     * ══ THE 90-DAY SWEEP NO LONGER DESTROYS THE FIVE-YEAR RECORD ══
     * `sweepExpired` was one unconditional DELETE, and `marketing_reply_draft` cascades on
     * `reply_id` (0046) — so at day 91 the inbound row, its text AND every draft LCX had
     * APPROVED against it went, including drafts a human published. MiCA Art 68(9) wants
     * that record for five years and nothing was ever placed on the long clock, because
     * `writeRecord` had no caller. The short clock deleted and the long clock stayed empty.
     *
     * It now returns a RESULT, not a count: `heldInJeopardy` is the number of expired rows
     * it refused to delete because an approved LCX statement depends on them and no
     * `marketing_record` row exists yet. That is reported on this response, because a hold
     * nobody is told about is how a retention conflict becomes invisible for months.
     */
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

    /*
     * ══ POST-TIME CORROBORATION, WHICH NOTHING CALLED EITHER ══
     * `marketing/postTime.ts` is the only caller of `fetchOEmbed`, `gradeInboundBatch` and
     * `recordPostedOn`, and it had NO caller of its own. The measurable consequence was
     * exact and permanent: post-time coverage is 0% on every live environment forever,
     * because the one act that could raise it — looking up a reply's post on X's public
     * oEmbed endpoint and recording what came back — never ran. An engine nothing calls is
     * decoration; a *scheduled* engine nothing schedules is worse, because the number it
     * would have moved is reported as a fact.
     *
     * ══ WHY ON THIS TICK AND NOT A ROUTE OF ITS OWN ══
     * It is a poll. It belongs beside the mailbox poll and the two retention sweeps, on the
     * one entrypoint cron already calls, for the same reason those are here — an operator
     * should not have to remember a second schedule for the compartment to stay honest.
     *
     * ══ IT CANNOT PUBLISH, AND THIS IS THE STRONGEST STATEMENT OF THAT IN THE FILE ══
     * The sweep's only outbound call is one GET to `publish.twitter.com/oembed`: no
     * credential, no body, no account. It reads X; it cannot write to X.
     *
     * ══ IT RUNS BEFORE THE MAILBOX POLL, AND BEFORE THE `mailConfigured` RETURN ══
     * Corroborating rows already in the queue does not need mail configured, and putting it
     * after the early return would have made the sweep dead on exactly the environments
     * that have no mailbox yet — which is most of them today. A refusal from the sweep is
     * NOT an error: `MKT_POSTTIME_NOT_MIGRATED`, `_NO_CANDIDATES` and `_CHANNEL_COOLING` are
     * facts about the environment, and each travels with its own rule.
     */
    const { runPostTimeSweep } = await import('../marketing/postTime.js');
    const postTime = await runPostTimeSweep(pool);

    if (!mailConfigured()) {
      // Keyless-first, like x402 and the AI layer: unconfigured is a normal
      // state that reports itself, not an error that pages someone.
      return c.json({
        data: {
          mailConfigured: false, swept, rawCleared, ingested: null, postTime,
          note: 'X_MAIL_* not configured — retention swept, post times corroborated, no mailbox polled',
        },
        meta: meta(),
      });
    }

    const emails = await fetchNotificationEmails();
    const ingested = await ingestEmails(pool, emails);
    return c.json({
      data: { mailConfigured: true, swept, rawCleared, fetched: emails.length, ingested, postTime },
      meta: meta(),
    });
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

    /*
     * THE GATE, ON THE PATH THAT PRODUCES OUTBOUND TEXT.
     *
     * Before this, `draftReply` generated text and `saveDraft` stored it with NO check —
     * neither the words (MiCA Art 66(2)-(3)) nor the state they sit in (Art 90 embargo,
     * Art 91(3)(c) holdings). Both engines existed and neither had a caller.
     *
     * IT RUNS BEFORE `saveDraft`, deliberately. Storing first and checking after would
     * leave a refused draft in the table for `GET /:id/drafts` to serve, and the queue
     * would show text a human could copy with the refusal sitting somewhere else.
     * Nothing reaches the database unless the gate allowed it.
     */
    const gate = await gateOutboundText(pool, {
      text: drafted.text,
      verb: 'reply',
      channel: 'x_public',
      actor: c.get('operator')?.id ?? 'unknown',
      phase: 'draft',
      targetHandle: reply.author_handle,
    });
    // BOTH OUTCOMES, before the branch — a ledger holding only refusals cannot tell
    // "cleared" from "never checked".
    await recordGateDecision(pool, {
      replyId: id,
      verdict: gate,
      actor: c.get('operator')?.id ?? 'unknown',
      phase: 'draft',
      text: drafted.text,
    });
    if (!gate.allowed) {
      return c.json({
        error: 'This draft was refused by the outbound gate and has not been saved.',
        code: 'MARKETING_OUTBOUND_REFUSED',
        refusals: gate.refusals,
        blockingViolations: gate.blockingViolations,
        disposition: gate.disposition,
        assetsExtracted: gate.assetsExtracted,
        extractionCaveat: gate.extractionCaveat,
        gateError: gate.gateError,
      }, 422);
    }

    const saved = await saveDraft(
      pool, id, gate.usableText ?? drafted.text, drafted.usedLlm, drafted.suspiciousInput,
    );

    return c.json({
      data: {
        draft: saved,
        usedLlm: drafted.usedLlm,
        suspiciousInput: drafted.suspiciousInput,
        // The clear verdict travels with the draft, caveat attached, so no surface can
        // show "cleared" without what the gate could not see.
        assetsExtracted: gate.assetsExtracted,
        extractionCaveat: gate.extractionCaveat,
        // The NON-blocking findings, on the allowed path. The engines computed these and
        // the 201 body dropped them, so a draft carrying `disclaimer.no_legal_effect` or
        // `art_91_3_c.factual_exemption_applied` reached the operator looking spotless.
        // `disposition` travels beside them: `stripped` is not `clear` either.
        violations: gate.violations,
        disposition: gate.disposition,
      },
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
    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');

    /*
     * THE GATE AGAIN, ON THE PATH THAT APPROVES OUTBOUND TEXT — AND IT IS NOT REDUNDANT.
     *
     * Checking at draft time only would be a time-of-check/time-of-use gap on the exact
     * axis the compartment exists for: the STATE moves under text that has not changed.
     * A draft cleared at 09:00 naming SOL is not clear at 11:00 if SOL entered
     * `mnpi_pending` at 10:00, and approval is the act that puts the words in front of a
     * human to paste. Re-reading the register at approval is the whole point of holding
     * the perimeter as state rather than as a lint pass.
     *
     * It also catches the case where the draft was written before migration 0060 landed:
     * the register was `not_attested` then and the gate refused, but nothing stops a
     * client retrying approval later.
     *
     * The text is re-read from the row rather than taken from the request, so approval
     * cannot be granted for different bytes than the ones stored.
     *
     * THE COLUMN IS `body`. It was written as `text`, which is not a column on this table
     * in 0046 or in any later migration, so this SELECT threw `column "text" does not
     * exist` on every call, the catch below turned it into a generic 500, and approve was
     * wholly unusable — the re-gate the paragraph above argues for had never once executed
     * against a real database. The test that was supposed to hold this line asserted the
     * SQL string by grep, so it pinned the defect instead of catching it.
     */
    const draftRow = await pool.query(
      `SELECT reply_id, body FROM marketing_reply_draft WHERE id = $1`, [id],
    );
    const draft = draftRow.rows[0] as { reply_id: number; body: string } | undefined;
    if (!draft) {
      return c.json({ error: 'draft not found or already decided', code: 'NOT_FOUND' }, 404);
    }
    const gate = await gateOutboundText(pool, {
      text: draft.body,
      verb: 'reply',
      channel: 'x_public',
      actor: operator?.id ?? 'unknown',
      phase: 'clearance',
    });
    await recordGateDecision(pool, {
      replyId: draft.reply_id,
      verdict: gate,
      actor: operator?.id ?? 'unknown',
      phase: 'clearance',
      text: draft.body,
    });
    if (!gate.allowed) {
      return c.json({
        error: 'This draft cannot be approved: the outbound gate refused it at clearance.',
        code: 'MARKETING_OUTBOUND_REFUSED',
        refusals: gate.refusals,
        // The blocking violations travel too. A 422 listing an empty `refusals` array
        // while the gate blocked on `deal_closing.invitation_to_transact` would read as a
        // platform fault, and the operator would retry rather than remove the CTA.
        blockingViolations: gate.blockingViolations,
        disposition: gate.disposition,
        assetsExtracted: gate.assetsExtracted,
        extractionCaveat: gate.extractionCaveat,
        gateError: gate.gateError,
      }, 422);
    }

    const row = await approveDraft(pool, id, operator?.id ?? 'unknown');
    if (!row) {
      return c.json({ error: 'draft not found or already decided', code: 'NOT_FOUND' }, 404);
    }
    return c.json({
      data: row,
      meta: { ...meta(), assetsExtracted: gate.assetsExtracted, extractionCaveat: gate.extractionCaveat },
    });
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
 *
 * `requireOperator` ADDED IN THE WIRING PASS. This was the ONLY route in the file without
 * it. That was not a live hole — the workspace gate mounts on `/v1/marketing/*` and
 * authenticates first, which is exactly why `requireOperator` no-ops when an operator is
 * already resolved — but it made this route the single one whose authentication depended
 * entirely on a prefix declared in another file. This lane holds unauthenticated inbound
 * content and forwarding-envelope addresses, so it is the last one that should be relying
 * on a mount point staying where it is.
 */
marketingRoutes.get('/quarantined', requireOperator, async (c) => {
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

/**
 * GET /perimeter — the market-abuse perimeter, as a surface may read it.
 *
 * ══ THE COMPARTMENT GATE IS NOT THE ONLY GATE HERE ══
 * `/v1/marketing/*` is already gated at `view` by the constitution's `apiPrefixes`, so a
 * principal without the compartment never reaches this handler. That is NOT sufficient,
 * because `marketing` is `machineAccess: true` — the shared operator key holds it — and
 * the two registers are not the same sensitivity as a reply queue:
 *
 *   - The embargo register's `event_ref` and `source_ref` POINT AT AN UNANNOUNCED
 *     DECISION. Reading them is reading inside information (MiCA Art 87), so
 *     `listEmbargoRegister` refuses below approver and this route lets it: an operator
 *     gets `detailWithheld` and the name of who to ask, never a thinner row that looks
 *     complete.
 *   - A holdings row is a named colleague's financial position (Art 91(3)(c)), so
 *     `listHoldings` is self-or-approver. An operator sees their own declarations.
 *
 * BOTH REFUSALS ARE THE LOADERS', NOT THIS ROUTE'S, and that is deliberate: they are the
 * same functions the governed actions call, so the read path and the write path cannot
 * disagree about who may see what.
 *
 * ══ AN EMPTY REGISTER IS NOT A CLEAN BILL OF HEALTH ══
 * `registerPresent: false` (migration 0060 absent) and `entries: []` (present, nothing
 * embargoed) are different facts and the payload keeps them apart. Rendering both as an
 * empty table is how a desk concludes it may name anything.
 */
marketingRoutes.get('/perimeter', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const op = c.get('operator');
    const role: ActorRole = op?.role === 'approver' ? 'approver' : 'operator';
    const viewer = op?.id ?? 'unknown';

    let embargo: AbusePerimeterState['embargo'] = {
      registerPresent: false, detailWithheld: false, withheldReason: null, entries: [],
    };
    try {
      const res = await listEmbargoRegister(pool, { role });
      embargo = {
        registerPresent: res.registerPresent,
        detailWithheld: false,
        withheldReason: null,
        entries: res.rows.map((r) => ({
          assetSymbol: r.assetSymbol,
          state: r.state,
          // NOT `?? r.enteredAt`. A null reviewBy means the register holds no fresh
          // review date, and substituting the entry date would invent one.
          reviewBy: r.reviewBy,
          enteredBy: r.enteredBy,
          enteredAt: r.enteredAt,
          eventRef: r.eventRef,
          sourceRef: r.sourceRef,
        })),
      };
    } catch (err) {
      // The loader's own approver refusal. Surfaced as withheld rather than as an error:
      // "you may not read the detail" is a fact about authority, not a failure, and the
      // operator still needs to be told the perimeter exists and who to ask.
      if (err instanceof ActionError && err.code === 'EMBARGO_DETAIL_APPROVER_ONLY') {
        /*
         * `registerPresent` IS PROBED, NOT ASSERTED. It used to be hardcoded `true` here,
         * and `listEmbargoRegister` throws on role BEFORE it reaches its own migration
         * probe — so a non-approver on an environment with 0060 unapplied was told the
         * register exists. That is the one fact this payload exists to keep apart from
         * "nothing is embargoed", and the withheld branch was inventing it.
         *
         * `isAbuseRegisterMigrated` answers whether the TABLE exists, which is not
         * approver-only information: it says nothing about which assets are in it.
         */
        embargo = {
          registerPresent: await isAbuseRegisterMigrated(pool),
          detailWithheld: true,
          withheldReason: err.message,
          entries: [],
        };
      } else throw err;
    }

    const holdingsRes = await listHoldings(pool, { viewer, role });
    const holdings: AbusePerimeterState['holdings'] = {
      registerPresent: holdingsRes.registerPresent,
      // An operator legitimately sees their OWN declarations, so nothing is withheld
      // from them here — what they cannot do is name a different member, and
      // `listHoldings` throws on that before this route sees a row.
      detailWithheld: false,
      withheldReason: role === 'approver' ? null
        : 'Showing your own declarations only. Another member\'s position requires approver authority.',
      entries: holdingsRes.rows.map((r) => ({
        memberId: r.member_id,
        assetSymbol: r.asset_symbol,
        holds: r.holds,
        declaredAt: String(r.declared_at),
        renewBy: String(r.renew_by),
      })),
    };

    const data: AbusePerimeterState = {
      embargo,
      holdings,
      absenceIsNotClearance:
        'An asset absent from an unattested register is absence of knowledge, not clearance. '
        + 'A draft naming it is refused, not passed.',
      // Named so the surface can offer them without hardcoding a second copy of the list.
      writeActions: MARKETING_ABUSE_ACTIONS.map((a) => a.id),
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    if (err instanceof ActionError) {
      return c.json({ error: err.message, code: err.code }, err.status as 403);
    }
    console.error('[marketing] perimeter error:', err);
    return c.json({ error: 'Failed to load perimeter', code: 'MARKETING_ERROR' }, 500);
  }
});

/* ══ THE SUB-ROUTERS, MOUNTED HERE AND NOT IN app.ts ══════════════════════════════
 *
 * Twenty-six routes across three files, following the shape GPS already uses
 * (`routes/gps.ts:917-942`). Nesting rather than three more `app.route('/v1/marketing', …)`
 * lines is not tidiness — it is what keeps two properties true at once:
 *
 *  1. THE COMPARTMENT GATE COVERS THEM BY CONSTRUCTION. `app.ts:163-172` installs
 *     `requireWorkspace('marketing','view'|'operate')` on `'/v1/marketing'` and
 *     `'/v1/marketing/*'`, read off the workspace constitution's `apiPrefixes`
 *     (`@lcx/shared workspaces.ts:193`), which lists that one prefix and nothing else.
 *     Every path reachable through these three routers therefore sits behind the gate
 *     with no sub-prefix that could fall outside it. Capability above the floor
 *     (`requireOperator`, `requireApprover`) is declared per route inside each file.
 *  2. THE OUTBOUND RATCHET SEES THEM. `marketing/__tests__/outboundGateCoverage.test.ts`
 *     reads all four router files and requires every registration to be classified as
 *     producing outbound text or not. A router mounted from somewhere the ratchet does
 *     not read would serve inside the compartment while sitting outside that
 *     classification — which is the precise shape of the defect this wave exists to end.
 *
 * "IT IS COVERED AUTOMATICALLY" IS A CLAIM ABOUT WIRING IN THREE OTHER FILES, so it is
 * verified per path and per method in `__tests__/marketingMount.test.ts` rather than
 * asserted here: registered under `/v1/marketing` and nowhere else, refused before any
 * handler runs when unauthenticated, and demanding the tier this file believes it demands.
 *
 * ALL THREE MOUNT AT '/' because each declares its own first segment — the URLs are
 * already fixed by the fetchers in `apps/web/src/lib/api/marketing.ts` (`/v1/marketing/desk`,
 * `/precedent`, `/crisis/…`, `/watch`, `/export/:itemId`, `/subject-access`, `/erasure`,
 * `/record`). Mounting any of them under a segment of its own would silently 404 a
 * shipped fetcher.
 *
 * PATHS ARE DISJOINT FROM THIS FILE'S. The two-segment patterns are the ones worth naming:
 * this file owns `POST /:id/draft` and `POST /:id/status`, the desk router owns
 * `POST /:id/triage`; the third segment differs, so no registration shadows another.
 *
 * STILL NOT POSTING ANYTHING. Nothing below holds a credential, and no route in any of
 * the three publishes: the crisis router's composed statement carries `cannotPublish: true`
 * and the record router only reads and retains. The two routes that bring outbound text
 * into existence go through `gateOutboundText` first.
 */
marketingRoutes.route('/', marketingDeskRoutes); //   /regime, /triage/assess, /:id/triage, /adoption, /desk, /desk-mode
marketingRoutes.route('/', marketingMemoryRoutes); // /precedent…, /crisis/…
marketingRoutes.route('/', marketingRecordRoutes); // /watch…, /export…, /record, /subject-access, /erasure, /retention…
