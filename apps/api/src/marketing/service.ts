import type { Pool } from 'pg';
import { verifySender } from './provenanceLadder.js';
import { looksLikeInjection, sanitiseDraft } from './sanitise.js';
import { trustedArcSealers } from './xMail.js';
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
 *
 * ── M0 DEFECT 8: "NOT MIGRATED" AND "COULD NOT TELL" ARE DIFFERENT ANSWERS ──────
 * The `catch` used to write `migratedCache = false`, and the cache is permanent for
 * the life of the process. So ONE transient database error — a failover, a pool
 * exhaustion, a network blip during a deploy — pinned the whole compartment into
 * "awaiting migration 0046" until somebody happened to restart the API. The desk
 * would be told a migration was pending that had been applied for weeks, and would
 * go and look for it.
 *
 * The fix is to cache only a DEFINITIVE answer. An error still degrades to
 * "unavailable" for the caller, because a database that cannot answer this cannot
 * serve the compartment either — but it is not remembered, so the next request
 * re-asks. Three states, and the third one is honest about being ignorance:
 * `migrated` (the table is there), `absent` (it is not), `unknown` (we could not ask).
 */
export type MigrationState = 'migrated' | 'absent' | 'unknown';

/** Only ever holds a definitive answer. `null` means "not yet established". */
let migratedCache: boolean | null = null;

export async function migrationState(pool: Pool): Promise<MigrationState> {
  if (migratedCache !== null) return migratedCache ? 'migrated' : 'absent';
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_x_reply') IS NOT NULL AS ok`,
    );
    migratedCache = Boolean(res.rows[0]?.ok);
    return migratedCache ? 'migrated' : 'absent';
  } catch {
    // NOT cached. This is the defect-8 fix and the reason the cache assignment is
    // inside the try: an unanswerable database is a fact about this moment, not
    // about the schema, and remembering it forever fakes a pending migration.
    return 'unknown';
  }
}

/**
 * The boolean the routes need: may we touch marketing tables?
 *
 * `unknown` answers false, because acting on a database that will not answer a
 * `to_regclass` is not better than waiting. What changed is that it is no longer
 * REMEMBERED as false.
 */
export async function isMigrated(pool: Pool): Promise<boolean> {
  return (await migrationState(pool)) === 'migrated';
}

/** Test-only: forget the probe. */
export function _resetMigrated(): void {
  migratedCache = null;
}

/**
 * new → triaged → drafted → approved_pending_send → sent | ignored.
 *
 * `answered` is a LEGACY value (M0 defect 5). It was set on approval, when nothing
 * had been sent: there is no send path in this compartment and there must never be
 * one, so the queue was reporting customers as answered while they were still
 * waiting, and `queueSummary`'s SLA figure inherited that. It is kept in the union so
 * rows written before 0059 still parse, and it is never written again.
 */
export type ReplyStatus =
  | 'new'
  | 'triaged'
  | 'drafted'
  | 'approved_pending_send'
  | 'sent'
  | 'ignored'
  | 'answered';

/** The statuses that mean a human still owes this customer something. */
const OPEN_STATUSES = ['new', 'triaged', 'drafted'] as const;

export interface ReplyRow {
  id: number;
  x_comment_id: string;
  x_post_id: string | null;
  author_handle: string;
  author_display: string | null;
  body: string;
  /**
   * DEPRECATED, NEVER WRITTEN (0059). It held the notification email's Date header —
   * mail-forwarding latency dressed as a post time. Read `posted_on_displayed`.
   */
  posted_at: string | null;
  /** X's own calendar date for the post, via oEmbed. NULL means NOT KNOWN. */
  posted_on_displayed: string | null;
  posted_at_source: string | null;
  received_at: string;
  status: ReplyStatus;
  sentiment: string | null;
  source_grade: string;
  source_kind: string;
  parse_failed: boolean;
  raw_email: string | null;
  raw_email_cleared_at: string | null;
  sender_from: string | null;
  sender_auth_state: string | null;
  sender_dkim_domain: string | null;
  sender_auth_evidence: string | null;
  quarantined: boolean;
  quarantine_code: string | null;
  collision_of_comment_id: string | null;
}

export interface IngestOutcome {
  inserted: number;
  duplicates: number;
  failed: number;
  /**
   * Accepted, but unauthenticated — stored visibly quarantined at a distinct grade,
   * excluded from the drafting queue and from every SLA figure. Counted separately
   * because "40 replies arrived" and "40 unauthenticated messages arrived" are
   * different facts and the tick must not report the second as the first.
   */
  quarantined: number;
  /**
   * Messages whose x_comment_id was already held by DIFFERENT content. Never zero
   * quietly: this is an attack signature, not a duplicate.
   */
  collisions: number;
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
 * THE GRADE FOR "WE CANNOT JUDGE THIS AT ALL".
 *
 * Admiralty F6 — reliability cannot be judged, truth cannot be judged. That is the
 * honest grade for a message that arrived through a mailbox anyone can write to and
 * carried no evidence it came from X. It used to be given `C3`, "fairly reliable
 * source, possibly true content", which is a claim nobody made and nothing supported.
 *
 * It is a DISTINCT grade rather than a downgraded C3 because the two situations are
 * different in kind: C3 says "this channel is usually right"; F6 says "this channel
 * told us nothing about itself". A row at F6 is shown, and is never promoted, never
 * drafted from, and never counted in an SLA.
 */
export const UNVERIFIED_GRADE = 'F6';

/** How the sender of an inbound message was established, if at all. */
export type SenderAuthState = 'dkim' | 'arc' | 'unverified' | 'no_trust_anchor' | 'operator_asserted';

export interface InsertReplyInput {
  xCommentId: string;
  xPostId: string | null;
  authorHandle: string;
  authorDisplay: string | null;
  body: string;
  sourceKind: string;
  /** Sender-authentication outcome. Absent means unverified — never means verified. */
  senderAuth?: SenderAuthState;
  senderFrom?: string | null;
  senderDkimDomain?: string | null;
  /** The provider's verbatim `Authentication-Results` field, for the audit trail. */
  senderEvidence?: string | null;
  /**
   * ACCEPTED AND IGNORED (0059). It used to be written into `posted_at` from the
   * notification email's Date header, which is what made the desk's "oldest waiting"
   * figure a measure of mail latency (M0 defect 4).
   *
   * It survives on this interface only so that `routes/marketing.ts`, which is not
   * owned by this lane, keeps compiling while it still passes `postedAt: null`. It is
   * not read, not stored, and must be deleted from the route. Nothing here silently
   * substitutes it for a post time; post time comes from oEmbed via
   * `recordPostedOn`, or it stays NULL and its consumers refuse.
   */
  postedAt?: Date | null;
}

export type InsertReplyResult = 'inserted' | 'duplicate' | 'quarantined' | 'collision';

/**
 * Store one reply. Idempotent by `x_comment_id`.
 *
 * ON CONFLICT DO NOTHING rather than upsert: a reply's text is immutable on X
 * (edits create a new id), so a second sighting of THE SAME CONTENT carries no new
 * information — and overwriting would silently reset a status an operator had set.
 *
 * ── M0 DEFECT 6: A CONFLICT IS NOT AUTOMATICALLY A DUPLICATE ────────────────────
 * `x_comment_id` is UNIQUE and it is chosen by the message. So: post a hostile reply
 * on X, read its id out of your own URL, send the mailbox a forged notification
 * carrying that id with harmless text — and when X's real notification arrives it
 * conflicts, is counted as a "duplicate", and the complaint the compartment exists
 * to catch is destroyed. Silently, permanently.
 *
 * The distinction is cheap and exact: compare the incoming author and body against
 * the stored row. Same content is a duplicate and always was. DIFFERENT content under
 * one id is never innocent — so the arriving content is KEPT, under a synthetic id
 * that names the collision, quarantined so nothing drafts from it, and an audit row
 * records both fingerprints. Nothing is discarded and a human decides.
 *
 * WHY IT DOES NOT THROW. Raising an exception here would abort with the arriving
 * content still unstored, which is the same data loss with a louder noise. Raising
 * means: a row a human sees, a counter on the tick response, and a row in the audit
 * spine.
 *
 * ── M0 DEFECT 1: AN UNAUTHENTICATED MESSAGE IS QUARANTINED, NEVER PROMOTED ──────
 * `senderAuth` is the ONLY thing that decides the grade for an email-sourced row.
 * Omitting it does not mean "fine": the default is `unverified`, which quarantines.
 */
export async function insertReply(pool: Pool, r: InsertReplyInput): Promise<InsertReplyResult> {
  const auth: SenderAuthState =
    r.senderAuth ?? (r.sourceKind === 'manual_paste' ? 'operator_asserted' : 'unverified');
  const authenticated = auth === 'dkim' || auth === 'arc' || auth === 'operator_asserted';
  const grade = authenticated ? SOURCE_GRADE[r.sourceKind] ?? 'C3' : UNVERIFIED_GRADE;
  const quarantineCode = authenticated
    ? null
    : auth === 'no_trust_anchor'
      ? 'MKT_INGEST_NO_TRUST_ANCHOR'
      : 'MKT_INGEST_SENDER_UNVERIFIED';

  const res = await pool.query(
    `INSERT INTO marketing_x_reply
       (x_comment_id, x_post_id, author_handle, author_display, body,
        source_kind, source_grade, sender_auth_state, sender_from, sender_dkim_domain,
        sender_auth_evidence, quarantined, quarantine_code, posted_at_source,
        retention_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'unknown',
             now() + ($14 || ' days')::interval)
     ON CONFLICT (x_comment_id) DO NOTHING
     RETURNING id`,
    [
      r.xCommentId, r.xPostId, r.authorHandle, r.authorDisplay, r.body,
      r.sourceKind, grade, auth, r.senderFrom ?? null, r.senderDkimDomain ?? null,
      r.senderEvidence ?? null, !authenticated, quarantineCode,
      String(RETENTION_DAYS),
    ],
  );
  if (res.rowCount && res.rowCount > 0) return authenticated ? 'inserted' : 'quarantined';

  return await resolveConflict(pool, r, auth, quarantineCode);
}

/**
 * A conflict arrived. Was it the same reply twice, or did somebody claim the id?
 *
 * Read-then-write, deliberately without a transaction: the two writes are an INSERT
 * of new content and an audit row, neither of which can corrupt the stored row it is
 * comparing against. The worst interleaving stores the arriving content twice under
 * two synthetic ids, which is duplicated evidence for a human — the failure direction
 * this whole defect is about avoiding.
 */
async function resolveConflict(
  pool: Pool,
  r: InsertReplyInput,
  auth: SenderAuthState,
  quarantineCode: string | null,
): Promise<InsertReplyResult> {
  const existing = await pool.query(
    `SELECT id, author_handle, body FROM marketing_x_reply WHERE x_comment_id = $1`,
    [r.xCommentId],
  );
  const row = existing.rows[0] as { id: number; author_handle: string; body: string } | undefined;

  // No row and no insert means the conflicting row was deleted between the two
  // statements (the retention sweep runs on the same tick). Nothing was destroyed.
  if (!row) return 'duplicate';

  const sameAuthor = row.author_handle.toLowerCase() === r.authorHandle.toLowerCase();
  const sameBody = row.body === r.body;
  if (sameAuthor && sameBody) return 'duplicate';

  const collisionId = `collision:${r.xCommentId}:${hash(`${r.authorHandle}\n${r.body}`)}`;
  await pool.query(
    `INSERT INTO marketing_x_reply
       (x_comment_id, x_post_id, author_handle, author_display, body,
        source_kind, source_grade, sender_auth_state, sender_from, sender_dkim_domain,
        sender_auth_evidence, quarantined, quarantine_code, collision_of_comment_id,
        posted_at_source, retention_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'MKT_INGEST_ID_COLLISION',$12,
             'unknown', now() + ($13 || ' days')::interval)
     ON CONFLICT (x_comment_id) DO NOTHING`,
    [
      collisionId, r.xPostId, r.authorHandle, r.authorDisplay, r.body,
      r.sourceKind, UNVERIFIED_GRADE, auth, r.senderFrom ?? null, r.senderDkimDomain ?? null,
      r.senderEvidence ?? null, r.xCommentId, String(RETENTION_DAYS),
    ],
  );

  /*
   * IDS AND FINGERPRINTS ONLY. `audit_log` has no retention sweep, so anything
   * written here is kept forever — and the reply text is a stranger's personal data
   * under a 90-day clock. A fingerprint proves which content was which without
   * copying it out from under its own retention rule.
   */
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ('system', 'marketing_reply.id_collision', 'marketing_x_reply', $1, $2::jsonb)`,
    [
      String(row.id),
      JSON.stringify({
        claimedCommentId: r.xCommentId,
        storedRowId: row.id,
        storedBodyFingerprint: hash(`${row.author_handle}\n${row.body}`),
        arrivingBodyFingerprint: hash(`${r.authorHandle}\n${r.body}`),
        sameAuthor,
        arrivingSenderAuthState: auth,
        arrivingQuarantineCode: quarantineCode,
        preservedAs: collisionId,
        note:
          'Two different messages claimed one x_comment_id. The arriving content was preserved under '
          + 'the synthetic id above, quarantined, rather than discarded as a duplicate. A human must '
          + 'decide which is genuine; the previous behaviour destroyed one of them silently.',
      }),
    ],
  );

  return 'collision';
}

/**
 * Store an email we could NOT parse, so a human still sees the comment.
 *
 * The synthetic id keeps the UNIQUE constraint meaningful (a retried tick must
 * not create duplicates) while making it obvious this is not a real X id.
 */
export async function insertUnparsed(
  pool: Pool,
  raw: string,
  reason: string,
  evidence: { senderAuth?: SenderAuthState; senderFrom?: string | null; senderEvidence?: string | null } = {},
): Promise<void> {
  const fingerprint = `unparsed:${hash(raw)}`;
  /*
   * THE SENDER EVIDENCE IS RECORDED HERE TOO, and this is the row where it matters
   * most: an email nobody could parse, arriving at a mailbox anyone can write to, is
   * the single most likely artefact of somebody probing the ingest. Recording what the
   * provider said about it is how that becomes examinable later rather than a
   * `parse_failed` row with no context.
   *
   * It stays UNQUARANTINED on purpose. A parse failure must be visible in the queue —
   * that is the whole reason the raw body is kept — and quarantining it would move it
   * to a lane the current surface does not read, which would silently reintroduce the
   * dropped-comment failure this row exists to prevent.
   */
  await pool.query(
    `INSERT INTO marketing_x_reply
       (x_comment_id, author_handle, body, source_kind, source_grade,
        parse_failed, raw_email, sender_auth_state, sender_from, sender_auth_evidence,
        posted_at_source, retention_expires_at)
     VALUES ($1, 'unknown', $2, 'x_notification_email', 'D4', true, $3, $4, $5, $6,
             'unknown', now() + ($7 || ' days')::interval)
     ON CONFLICT (x_comment_id) DO NOTHING`,
    [
      fingerprint, `[unparsed] ${reason}`, raw.slice(0, 20_000),
      evidence.senderAuth ?? 'unverified', evidence.senderFrom ?? null,
      evidence.senderEvidence ?? null, String(RETENTION_DAYS),
    ],
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

/**
 * Ingest a batch of raw emails. Never throws for one bad message.
 *
 * Sender authentication happens HERE, once, on the way in — `verifySender` decides,
 * on the evidence `xMail.readSenderEvidence` extracted, and nothing downstream gets a
 * second opinion. An unauthenticated message is stored quarantined at `F6` rather
 * than dropped: dropping it would hide an attack, and promoting it is defect 1.
 */
export async function ingestEmails(pool: Pool, emails: RawEmail[]): Promise<IngestOutcome> {
  const out: IngestOutcome = { inserted: 0, duplicates: 0, failed: 0, quarantined: 0, collisions: 0 };
  const sealers = trustedArcSealers();

  for (const email of emails) {
    try {
      const auth = senderAuthOf(email, sealers);
      const parsed = parseXNotification(email);
      if (!parsed.ok) {
        await insertUnparsed(pool, parsed.raw, parsed.reason, {
          senderAuth: auth,
          senderFrom: email.from ?? null,
          senderEvidence: email.sender?.rawAuthenticationResults ?? null,
        });
        out.failed++;
        continue;
      }
      const r = await insertReply(pool, {
        xCommentId: parsed.xCommentId,
        xPostId: parsed.xPostId,
        authorHandle: parsed.authorHandle,
        authorDisplay: parsed.authorDisplay,
        body: parsed.body,
        sourceKind: 'x_notification_email',
        senderAuth: auth,
        senderFrom: email.from ?? null,
        senderDkimDomain: email.sender?.dkimDomain ?? null,
        senderEvidence: email.sender?.rawAuthenticationResults ?? null,
      });
      if (r === 'inserted') out.inserted++;
      else if (r === 'quarantined') out.quarantined++;
      else if (r === 'collision') out.collisions++;
      else out.duplicates++;
    } catch (err) {
      // One malformed message must not abandon the rest of the mailbox.
      console.error('[marketing] ingest error:', err instanceof Error ? err.message : err);
      out.failed++;
    }
  }
  return out;
}

/**
 * Turn the mailbox's evidence into the one state that decides the grade.
 *
 * A field claiming our own provider's authserv-id, below the one our provider
 * prepended, is treated as fatal on its own. RFC 8601 §5 means the topmost field
 * still governs, so the message would have been judged correctly anyway — but a
 * legitimate hop has no reason to write our provider's identifier, so the ATTEMPT is
 * itself sufficient reason not to believe anything else in the message.
 */
function senderAuthOf(email: RawEmail, sealers: readonly string[]): SenderAuthState {
  if (email.impersonatedAuthservFields && email.impersonatedAuthservFields > 0) return 'unverified';
  if (email.noTrustAnchor) return 'no_trust_anchor';
  const verdict = verifySender(email.sender ?? null, sealers);
  return verdict.authenticated ? verdict.via : 'unverified';
}

/* ── THE POST CLOCK, WHICH IS NOT THE OBSERVATION CLOCK ─────────────────────── */

/**
 * Record X's own date for a post, from the keyless oEmbed endpoint.
 *
 * A DATE, NOT AN INSTANT. `publish.twitter.com/oembed` renders "August 1, 2026" and
 * nothing finer, so `oembed.ts` returns a calendar date and this stores a `date`.
 * Manufacturing a time of day to fill a `timestamptz` would be the same mistake as
 * writing the email header date into `posted_at`, one layer deeper.
 *
 * `postedOnDisplayed === null` writes nothing at all — not a zero, not `received_at`,
 * not the email date. `posted_at_source` stays `unknown` and everything derived from
 * post time refuses instead (`oldestSincePosted`).
 */
export async function recordPostedOn(
  pool: Pool,
  xCommentId: string,
  postedOnDisplayed: string | null,
): Promise<boolean> {
  if (!postedOnDisplayed) return false;
  const res = await pool.query(
    `UPDATE marketing_x_reply
        SET posted_on_displayed = $2::date,
            posted_at_source = 'oembed_display_date',
            updated_at = now()
      WHERE x_comment_id = $1`,
    [xCommentId, postedOnDisplayed],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * The queue: worst-SLA first, so the oldest unanswered customer surfaces.
 *
 * QUARANTINED ROWS ARE EXCLUDED BY DEFAULT, and that is the point of quarantining
 * them: an unauthenticated message must not sit in the drafting queue looking like a
 * customer, and must not contribute to a number that says how well the desk is doing.
 * It is not hidden — `listQuarantined` returns it, deliberately as a separate call so
 * that a surface has to decide to show it as what it is.
 */
export async function listReplies(
  pool: Pool,
  opts: { status?: ReplyStatus; limit?: number } = {},
): Promise<ReplyRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const res = opts.status
    ? await pool.query(
        `SELECT * FROM marketing_x_reply WHERE status = $1 AND NOT quarantined
         ORDER BY received_at ASC LIMIT $2`,
        [opts.status, limit],
      )
    : await pool.query(
        `SELECT * FROM marketing_x_reply
         WHERE status = ANY($1::text[]) AND NOT quarantined
         ORDER BY received_at ASC LIMIT $2`,
        [[...OPEN_STATUSES], limit],
      );
  return res.rows as ReplyRow[];
}

/**
 * The quarantine lane: everything that could not be authenticated, plus every id
 * collision. Visible, so that "we are being attacked" is a thing the desk can see.
 */
export async function listQuarantined(pool: Pool, limit = 50): Promise<ReplyRow[]> {
  const res = await pool.query(
    `SELECT * FROM marketing_x_reply WHERE quarantined
     ORDER BY received_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return res.rows as ReplyRow[];
}

/**
 * Move a reply through the queue.
 *
 * TRIAGE IS WHEN `raw_email` STOPS BEING NEEDED (M0 defect 7). The raw body exists so
 * that a parse failure never loses a customer's comment; once a human has looked at
 * the row and moved it on, the reason to keep up to 20,000 characters of a stranger's
 * email — headers, addresses, whatever the forwarder attached — has gone. 0046 claimed
 * this already happened. It did not.
 */
export async function setReplyStatus(pool: Pool, id: number, status: ReplyStatus): Promise<void> {
  const clearsRaw = status !== 'new';
  await pool.query(
    clearsRaw
      ? `UPDATE marketing_x_reply
            SET status = $2,
                raw_email = NULL,
                raw_email_cleared_at = CASE WHEN raw_email IS NOT NULL THEN now() ELSE raw_email_cleared_at END,
                updated_at = now()
          WHERE id = $1`
      : `UPDATE marketing_x_reply SET status = $2, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

/**
 * Clear one row's raw email explicitly.
 *
 * Separate from `setReplyStatus` because "a human has finished with the raw body" and
 * "the row moved status" are different events, and a surface that shows the raw body
 * needs to be able to say the first without asserting the second.
 */
export async function clearRawEmail(pool: Pool, id: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE marketing_x_reply
        SET raw_email = NULL, raw_email_cleared_at = now(), updated_at = now()
      WHERE id = $1 AND raw_email IS NOT NULL`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Days a raw email may sit before it is cleared whether or not anyone triaged it.
 *
 * MUCH SHORTER THAN THE 90-DAY ROW RETENTION, on purpose. The row is the customer's
 * comment, which the desk needs; the raw email is a forwarding artefact that exists
 * only until a human has read it, and it carries the most incidental third-party data
 * in the compartment. Data minimisation is per-field, not per-table.
 */
const RAW_EMAIL_DAYS = Number(process.env.MARKETING_RAW_EMAIL_DAYS ?? '7');

/** Null out raw emails nobody triaged in time. Returns how many were cleared. */
export async function sweepRawEmail(pool: Pool): Promise<number> {
  const res = await pool.query(
    `UPDATE marketing_x_reply
        SET raw_email = NULL, raw_email_cleared_at = now(), updated_at = now()
      WHERE raw_email IS NOT NULL
        AND received_at < now() - ($1 || ' days')::interval`,
    [String(RAW_EMAIL_DAYS)],
  );
  return res.rowCount ?? 0;
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
  /**
   * Who asserts they pasted this into X, and when they said so. NOT an observation:
   * this compartment has no posting path and cannot see X (M0 defect 5).
   */
  sent_asserted_by: string | null;
  sent_asserted_at: string | null;
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
  /*
   * The handle being answered is allowed through the sanitiser; every other @handle is
   * stripped, because "DM @some_support_desk" is the highest-volume exchange scam on X
   * and the sanitiser used to pass it clean while redacting the word "ETH". Looked up
   * rather than passed in, so no caller can widen the allowlist by forgetting to.
   */
  const who = await pool.query(
    `SELECT author_handle FROM marketing_x_reply WHERE id = $1`,
    [replyId],
  );
  const authorHandle = (who.rows[0]?.author_handle as string | undefined) ?? '';
  const clean = sanitiseDraft(body, { allowHandles: authorHandle ? [authorHandle] : [] });
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
 * Approve a draft — and now actually a governed act.
 *
 * ── M0 DEFECT 3: THIS USED TO BE CALLED "THE GOVERNED ACT" AND WROTE NO RECORD ──
 * No `audit_log` row and no `object_actions` row. Marketing was the only compartment
 * off the audit spine while its own comment claimed the opposite, which is the
 * combination that stops anybody checking. Both rows are written now, inside the same
 * transaction as the status change, so there is no interleaving in which a draft is
 * approved and nothing says who did it.
 *
 * ── M0 DEFECT 5: APPROVAL IS NOT SENDING ────────────────────────────────────────
 * The reply used to move to `answered`. Nothing had been sent. There is no posting
 * code anywhere in this compartment, by design and permanently — so the honest state
 * after approval is `approved_pending_send`, and the customer is still waiting until a
 * human says otherwise (`assertSent`).
 *
 * PARAMS CARRY IDS ONLY, NEVER REPLY OR DRAFT TEXT. `audit_log` has no retention
 * sweep: anything written into it outlives the 90-day clock the text is held under,
 * which would quietly convert a data-minimisation rule into a permanent copy.
 */
export async function approveDraft(pool: Pool, draftId: number, memberId: string): Promise<DraftRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `UPDATE marketing_reply_draft
          SET status = 'approved', approved_by = $2, approved_at = now()
        WHERE id = $1 AND status = 'proposed'
        RETURNING *`,
      [draftId, memberId],
    );
    const row = res.rows[0] as DraftRow | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE marketing_x_reply
          SET status = 'approved_pending_send',
              raw_email = NULL,
              raw_email_cleared_at = CASE WHEN raw_email IS NOT NULL THEN now() ELSE raw_email_cleared_at END,
              updated_at = now()
        WHERE id = $1`,
      [row.reply_id],
    );

    await client.query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
       VALUES ($1, 'marketing_draft.approved', 'marketing_reply_draft', $2, $3::jsonb)`,
      [
        memberId,
        String(draftId),
        JSON.stringify({
          replyId: row.reply_id,
          draftId,
          usedLlm: row.used_llm,
          flagged: row.flagged,
          replyStatus: 'approved_pending_send',
          note:
            'Approval only. This compartment has no posting path: the text is copied by a human and sent '
            + 'outside the system, so nothing here can observe that it was sent.',
        }),
      ],
    );

    await client.query(
      `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ('marketing_reply_draft', $1, 'marketing_draft.approve', $2::jsonb, $3::jsonb, $4)`,
      [
        String(draftId),
        JSON.stringify({ draftId, replyId: row.reply_id }),
        JSON.stringify({ draftStatus: 'approved', replyStatus: 'approved_pending_send' }),
        memberId,
      ],
    );

    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* the connection is already unusable; the transaction never committed */
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A named human asserts they pasted an approved draft into X.
 *
 * THIS IS AN ASSERTION AND IT IS MODELLED AS ONE. There is no send path in this
 * compartment, there must never be one (the owner's constraint, and the reason an
 * injected draft cannot reach a customer by itself), and no credential exists that
 * could check. So the system cannot know that a reply was sent — it can only record
 * that somebody said so, with their name on it. Anything that later wants to know
 * whether the post actually exists asks X through oEmbed, which is an independent
 * channel; it does not read this column.
 *
 * Only an APPROVED draft can be asserted sent. A `proposed` draft being pasted out is
 * a real failure mode (mkt-r5 §1.3) but it is a failure of the surface's copy button,
 * and inventing a state for it here would let this function launder it.
 */
export async function assertSent(pool: Pool, draftId: number, memberId: string): Promise<DraftRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `UPDATE marketing_reply_draft
          SET sent_asserted_by = $2, sent_asserted_at = now()
        WHERE id = $1 AND status = 'approved' AND sent_asserted_at IS NULL
        RETURNING *`,
      [draftId, memberId],
    );
    const row = res.rows[0] as DraftRow | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE marketing_x_reply SET status = 'sent', updated_at = now() WHERE id = $1`,
      [row.reply_id],
    );

    await client.query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
       VALUES ($1, 'marketing_draft.send_asserted', 'marketing_reply_draft', $2, $3::jsonb)`,
      [
        memberId,
        String(draftId),
        JSON.stringify({
          replyId: row.reply_id,
          draftId,
          note:
            'A human ASSERTS they sent this by hand. The system did not send it and cannot see X, so this '
            + 'is testimony, not observation. Corroboration, if wanted, is an oEmbed lookup.',
        }),
      ],
    );

    await client.query(
      `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ('marketing_reply_draft', $1, 'marketing_draft.assert_sent', $2::jsonb, $3::jsonb, $4)`,
      [
        String(draftId),
        JSON.stringify({ draftId, replyId: row.reply_id }),
        JSON.stringify({ evidence: 'human_assertion', observed: false }),
        memberId,
      ],
    );

    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* the connection is already unusable; the transaction never committed */
    });
    throw err;
  } finally {
    client.release();
  }
}

/** GDPR sweep. Retention is a property of the row, so this is a one-liner. */
export async function sweepExpired(pool: Pool): Promise<number> {
  const res = await pool.query(`DELETE FROM marketing_x_reply WHERE retention_expires_at < now()`);
  return res.rowCount ?? 0;
}

/**
 * A figure the desk asked for that cannot be produced from what is known.
 *
 * A refusal, not a zero and not a substitute (plan §4 rule 3). It carries the code, a
 * sentence a human reads, and what would have to be true for the number to exist.
 */
export interface FigureRefusal {
  code: string;
  message: string;
  needs: string;
}

/**
 * Queue counts plus the numbers that matter operationally.
 *
 * ── M0 DEFECT 4, THE HALF THAT LIVES HERE: TWO CLOCKS, HONESTLY NAMED ───────────
 * `oldestUnansweredHours` is measured from `received_at` — when WE learned about the
 * reply. It is therefore "how long since it reached us", and it silently includes
 * however long the mail spent being forwarded. That is a real and useful number; it is
 * just not "how long has the customer been waiting", which is measured from the post
 * time, which this system frequently does not know.
 *
 * So both appear, and the second one REFUSES rather than falling back:
 *   · `oldestObservedWaitingHours` — since we learned. Always available.
 *   · `oldestSincePostedHours`     — since the post. A number, or a refusal naming
 *                                    what is missing. Never `received_at` wearing a
 *                                    different label.
 *
 * `oldestUnansweredHours` is retained as a DEPRECATED alias of the observed-waiting
 * figure. It stays because it is the wire contract two shipped surfaces already read, and
 * removing a key from a response is the kind of change that breaks a page at runtime
 * rather than at compile time. The integration pass relabelled its consumers — the field
 * name says "unanswered", which invites reading it as a wait the customer experienced,
 * and it is not: it is time since WE LEARNED. Every surface that renders it now says so.
 *
 * QUARANTINED ROWS COUNT TOWARDS NOTHING. An unauthenticated message must not be able
 * to move the desk's own performance figure in either direction — flattering it by
 * padding the queue, or damaging it by ageing there.
 */
export async function queueSummary(pool: Pool): Promise<{
  counts: Record<string, number>;
  /** @deprecated alias of `oldestObservedWaitingHours`; kept for the current UI. */
  oldestUnansweredHours: number | null;
  oldestObservedWaitingHours: number | null;
  /** `null` when nothing is open — the same shape the observed figure uses. */
  oldestSincePostedHours: number | null | FigureRefusal;
  suspicious: number;
  unparsed: number;
  quarantined: number;
  collisions: number;
}> {
  const counts = await pool.query(
    `SELECT status, count(*)::int AS n FROM marketing_x_reply
      WHERE NOT quarantined GROUP BY status`,
  );
  const oldest = await pool.query(
    `SELECT extract(epoch FROM (now() - min(received_at)))/3600 AS hours
       FROM marketing_x_reply
      WHERE status = ANY($1::text[]) AND NOT quarantined`,
    [[...OPEN_STATUSES]],
  );
  /*
   * The post-time figure is computed over the open rows that HAVE a post date, and
   * reported only when every open row has one. A minimum taken over the subset with a
   * known date is not "the oldest waiting": the row missing its date could be older,
   * so the answer would be a lower bound presented as a maximum — which is the exact
   * shape of dishonesty this defect is about.
   */
  const posted = await pool.query(
    `SELECT count(*)::int AS open_rows,
            count(posted_on_displayed)::int AS with_date,
            extract(epoch FROM (now() - min(posted_on_displayed)))/3600 AS hours
       FROM marketing_x_reply
      WHERE status = ANY($1::text[]) AND NOT quarantined`,
    [[...OPEN_STATUSES]],
  );
  const unparsed = await pool.query(
    `SELECT count(*)::int AS n FROM marketing_x_reply WHERE parse_failed`,
  );
  const quarantined = await pool.query(
    `SELECT count(*)::int AS n,
            count(collision_of_comment_id)::int AS collisions
       FROM marketing_x_reply WHERE quarantined`,
  );
  const open = await listReplies(pool, { limit: 200 });

  const observed = oldest.rows[0]?.hours != null ? Number(oldest.rows[0].hours) : null;
  const openRows = Number(posted.rows[0]?.open_rows ?? 0);
  const withDate = Number(posted.rows[0]?.with_date ?? 0);

  return {
    counts: Object.fromEntries(counts.rows.map((r) => [r.status as string, r.n as number])),
    oldestUnansweredHours: observed,
    oldestObservedWaitingHours: observed,
    oldestSincePostedHours:
      openRows === 0
        ? null
        : withDate === openRows && posted.rows[0]?.hours != null
          ? Number(posted.rows[0].hours)
          : {
              code: 'MKT_CLOCK_POST_TIME_UNKNOWN',
              message:
                `${openRows - withDate} of ${openRows} open replies have no post date from X, so how long the `
                + 'customer has been waiting is not known. The observed-waiting figure measures how long since '
                + 'we learned, which includes mail-forwarding delay.',
              needs:
                'A successful oEmbed lookup per reply (publish.twitter.com/oembed), recorded by recordPostedOn.',
            },
    // Computed in JS rather than SQL: the marker list lives in sanitise.ts and
    // duplicating it as a LIKE clause is how the two would drift apart.
    suspicious: open.filter((r) => looksLikeInjection(r.body)).length,
    unparsed: (unparsed.rows[0]?.n as number) ?? 0,
    quarantined: (quarantined.rows[0]?.n as number) ?? 0,
    collisions: (quarantined.rows[0]?.collisions as number) ?? 0,
  };
}
