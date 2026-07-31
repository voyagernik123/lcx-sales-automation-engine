import type { Pool } from 'pg';
import { looksLikeInjection, sanitiseDraft } from './sanitise.js';
import { parseXNotification, type RawEmail } from './xNotificationParse.js';

/**
 * The marketing reply queue (LCX MARKETING).
 *
 * Every statement here is parameterised. No identifier or value is ever
 * concatenated into SQL — the platform's red-team pass (RT-A) made that a
 * standing rule and this compartment ingests text from the open internet, which
 * makes it the worst possible place to make an exception.
 */

/** Retention default. Overridable, but it must never be unbounded — see 0046. */
const RETENTION_DAYS = Number(process.env.MARKETING_RETENTION_DAYS ?? '90');

/**
 * HAS MIGRATION 0046 LANDED ON THIS ENVIRONMENT?
 *
 * WHY THIS EXISTS. Deploy order cannot be assumed. The web bundle and the API
 * ship together on a push to main, but 0046 is applied by hand against a database
 * whose credentials live in Render's dashboard — so there is a window, possibly a
 * long one, where the code is live and the tables are not.
 *
 * Without this check that window looks like an OUTAGE: every marketing endpoint
 * throws `relation "marketing_x_reply" does not exist`, the route returns 500,
 * and the compartment reads as broken rather than as not-yet-enabled. The desk
 * cannot tell "we shipped this and you need to run one migration" from "the
 * platform is down", and the second reading is the one people act on.
 *
 * So: probe once, degrade honestly, and say so on screen. The same pattern
 * `distribution` uses for 0043 ("Read-only until migration 0043 is applied on
 * this environment") — it was right there and it is right here.
 *
 * `to_regclass` rather than a query against information_schema: it is a single
 * cheap lookup that returns NULL instead of throwing, so the probe itself can
 * never be the thing that errors.
 *
 * Cached per process because the answer only changes when someone runs a
 * migration, which means a deploy or a manual step — and the API restarts on
 * deploy. A false negative would self-heal on the next restart; a per-request
 * probe would add a round trip to every read forever to catch a once-ever event.
 */
let migratedCache: boolean | null = null;

export async function isMigrated(pool: Pool): Promise<boolean> {
  if (migratedCache !== null) return migratedCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_x_reply') IS NOT NULL AS ok`,
    );
    migratedCache = Boolean(res.rows[0]?.ok);
  } catch {
    // A database that cannot answer this is a database that cannot serve the
    // compartment either. Report not-migrated rather than propagating.
    migratedCache = false;
  }
  return migratedCache;
}

/** Test-only: forget the probe. */
export function _resetMigrated(): void {
  migratedCache = null;
}

export type ReplyStatus = 'new' | 'triaged' | 'drafted' | 'answered' | 'ignored';

export interface ReplyRow {
  id: number;
  x_comment_id: string;
  x_post_id: string | null;
  author_handle: string;
  author_display: string | null;
  body: string;
  posted_at: string | null;
  received_at: string;
  status: ReplyStatus;
  sentiment: string | null;
  source_grade: string;
  source_kind: string;
  parse_failed: boolean;
  raw_email: string | null;
}

export interface IngestOutcome {
  inserted: number;
  duplicates: number;
  failed: number;
}

/**
 * Where a reply came from, and therefore how much to trust it.
 *
 * Admiralty grading, honestly applied. An email-derived reply is genuinely less
 * reliable than an official API read — the format can shift under us and the
 * parser can mis-attribute — and the platform already knows how to show that on
 * screen. A future paid source arrives graded BETTER, visibly, rather than the
 * upgrade being invisible.
 */
export const SOURCE_GRADE: Record<string, string> = {
  x_notification_email: 'C3', // fairly reliable source, possibly true content
  manual_paste: 'B2',         // a named operator typed it — usually reliable
  x_api: 'A1',                // reserved: official API, if ever paid for
};

/**
 * Store one reply. Idempotent by `x_comment_id`.
 *
 * ON CONFLICT DO NOTHING rather than upsert: a reply's text is immutable on X
 * (edits create a new id), so a second sighting carries no new information — and
 * overwriting would silently reset a status an operator had already set.
 */
export async function insertReply(
  pool: Pool,
  r: {
    xCommentId: string;
    xPostId: string | null;
    authorHandle: string;
    authorDisplay: string | null;
    body: string;
    postedAt: Date | null;
    sourceKind: string;
  },
): Promise<'inserted' | 'duplicate'> {
  const res = await pool.query(
    `INSERT INTO marketing_x_reply
       (x_comment_id, x_post_id, author_handle, author_display, body, posted_at,
        source_kind, source_grade, retention_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9 || ' days')::interval)
     ON CONFLICT (x_comment_id) DO NOTHING
     RETURNING id`,
    [
      r.xCommentId, r.xPostId, r.authorHandle, r.authorDisplay, r.body,
      r.postedAt, r.sourceKind, SOURCE_GRADE[r.sourceKind] ?? 'C3',
      String(RETENTION_DAYS),
    ],
  );
  return res.rowCount && res.rowCount > 0 ? 'inserted' : 'duplicate';
}

/**
 * Store an email we could NOT parse, so a human still sees the comment.
 *
 * The synthetic id keeps the UNIQUE constraint meaningful (a retried tick must
 * not create duplicates) while making it obvious this is not a real X id.
 */
export async function insertUnparsed(pool: Pool, raw: string, reason: string): Promise<void> {
  const fingerprint = `unparsed:${hash(raw)}`;
  await pool.query(
    `INSERT INTO marketing_x_reply
       (x_comment_id, author_handle, body, source_kind, source_grade,
        parse_failed, raw_email, retention_expires_at)
     VALUES ($1, 'unknown', $2, 'x_notification_email', 'D4', true, $3,
             now() + ($4 || ' days')::interval)
     ON CONFLICT (x_comment_id) DO NOTHING`,
    [fingerprint, `[unparsed] ${reason}`, raw.slice(0, 20_000), String(RETENTION_DAYS)],
  );
}

/** Stable, dependency-free content fingerprint. Not security-critical. */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Ingest a batch of raw emails. Never throws for one bad message. */
export async function ingestEmails(pool: Pool, emails: RawEmail[]): Promise<IngestOutcome> {
  const out: IngestOutcome = { inserted: 0, duplicates: 0, failed: 0 };
  for (const email of emails) {
    try {
      const parsed = parseXNotification(email);
      if (!parsed.ok) {
        await insertUnparsed(pool, parsed.raw, parsed.reason);
        out.failed++;
        continue;
      }
      const r = await insertReply(pool, { ...parsed, sourceKind: 'x_notification_email' });
      if (r === 'inserted') out.inserted++;
      else out.duplicates++;
    } catch (err) {
      // One malformed message must not abandon the rest of the mailbox.
      console.error('[marketing] ingest error:', err instanceof Error ? err.message : err);
      out.failed++;
    }
  }
  return out;
}

/** The queue: worst-SLA first, so the oldest unanswered customer surfaces. */
export async function listReplies(
  pool: Pool,
  opts: { status?: ReplyStatus; limit?: number } = {},
): Promise<ReplyRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const res = opts.status
    ? await pool.query(
        `SELECT * FROM marketing_x_reply WHERE status = $1
         ORDER BY received_at ASC LIMIT $2`,
        [opts.status, limit],
      )
    : await pool.query(
        `SELECT * FROM marketing_x_reply
         WHERE status IN ('new','triaged','drafted')
         ORDER BY received_at ASC LIMIT $1`,
        [limit],
      );
  return res.rows as ReplyRow[];
}

export async function setReplyStatus(pool: Pool, id: number, status: ReplyStatus): Promise<void> {
  await pool.query(
    `UPDATE marketing_x_reply SET status = $2, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

export interface DraftRow {
  id: number;
  reply_id: number;
  body: string;
  used_llm: boolean;
  flagged: boolean;
  flag_reason: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/**
 * Save a proposed draft, sanitised.
 *
 * The sanitiser runs HERE, on the way into the database — not on the way out to
 * the screen. A draft that has never been stored with a live URL in it cannot
 * later be surfaced by a new endpoint, an export, or a support query that forgot
 * to sanitise. The stored artefact is the safe one.
 */
export async function saveDraft(
  pool: Pool,
  replyId: number,
  body: string,
  usedLlm: boolean,
): Promise<DraftRow> {
  const clean = sanitiseDraft(body);
  const res = await pool.query(
    `INSERT INTO marketing_reply_draft (reply_id, body, used_llm, flagged, flag_reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [replyId, clean.text, usedLlm, clean.flagged, clean.reason || null],
  );
  await setReplyStatus(pool, replyId, 'drafted');
  return res.rows[0] as DraftRow;
}

export async function listDrafts(pool: Pool, replyId: number): Promise<DraftRow[]> {
  const res = await pool.query(
    `SELECT * FROM marketing_reply_draft WHERE reply_id = $1 ORDER BY created_at DESC`,
    [replyId],
  );
  return res.rows as DraftRow[];
}

/**
 * Approve a draft — the governed act.
 *
 * Approval means "a named human read this and would send it". It does NOT post:
 * there is no posting code anywhere in this compartment, by design. The operator
 * copies the text. That is what keeps an injected draft incapable of reaching a
 * customer on its own.
 */
export async function approveDraft(pool: Pool, draftId: number, memberId: string): Promise<DraftRow | null> {
  const res = await pool.query(
    `UPDATE marketing_reply_draft
        SET status = 'approved', approved_by = $2, approved_at = now()
      WHERE id = $1 AND status = 'proposed'
      RETURNING *`,
    [draftId, memberId],
  );
  const row = res.rows[0] as DraftRow | undefined;
  if (row) await setReplyStatus(pool, row.reply_id, 'answered');
  return row ?? null;
}

/** GDPR sweep. Retention is a property of the row, so this is a one-liner. */
export async function sweepExpired(pool: Pool): Promise<number> {
  const res = await pool.query(`DELETE FROM marketing_x_reply WHERE retention_expires_at < now()`);
  return res.rowCount ?? 0;
}

/**
 * Queue counts plus the two numbers that matter operationally: how many replies
 * are hostile-looking, and how long the oldest unanswered one has waited.
 */
export async function queueSummary(pool: Pool): Promise<{
  counts: Record<string, number>;
  oldestUnansweredHours: number | null;
  suspicious: number;
  unparsed: number;
}> {
  const counts = await pool.query(
    `SELECT status, count(*)::int AS n FROM marketing_x_reply GROUP BY status`,
  );
  const oldest = await pool.query(
    `SELECT extract(epoch FROM (now() - min(received_at)))/3600 AS hours
       FROM marketing_x_reply WHERE status IN ('new','triaged','drafted')`,
  );
  const unparsed = await pool.query(
    `SELECT count(*)::int AS n FROM marketing_x_reply WHERE parse_failed`,
  );
  const open = await listReplies(pool, { limit: 200 });

  return {
    counts: Object.fromEntries(counts.rows.map((r) => [r.status as string, r.n as number])),
    oldestUnansweredHours: oldest.rows[0]?.hours != null ? Number(oldest.rows[0].hours) : null,
    // Computed in JS rather than SQL: the marker list lives in sanitise.ts and
    // duplicating it as a LIKE clause is how the two would drift apart.
    suspicious: open.filter((r) => looksLikeInjection(r.body)).length,
    unparsed: (unparsed.rows[0]?.n as number) ?? 0,
  };
}
