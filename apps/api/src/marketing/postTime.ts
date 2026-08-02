/**
 * MARKETING — THE POST-TIME SWEEP. The caller that makes keyless corroboration real.
 *
 * WHAT WAS TRUE BEFORE THIS FILE EXISTED. `oembed.ts` was imported for TYPES ONLY, by
 * `provenanceLadder.ts`. `service.ts recordPostedOn` had no caller anywhere in
 * `apps/api/src`. `provenanceLadder.ts` never wrote a row into
 * `marketing_reply_corroboration`, the table 0062 created for exactly that purpose. So on
 * any live environment the post-time column was NULL on every row, forever, coverage was
 * 0% rather than partial, and the anti-forgery corroboration the ingest defect needs
 * existed on paper only. Three built engines, zero callers. This file is the caller.
 *
 * THE HOLE IT CLOSES. The inbound path is a mailbox anyone can send SMTP to (mkt-r5
 * §1.1): a forger controls the handle, the comment id, the body and the date. What a
 * forger does NOT control is `publish.twitter.com/oembed` — X's own endpoint, official,
 * documented and keyless. "An email says @alice replied X" and "an email says @alice
 * replied X, and X's own endpoint returns @alice saying X" are different facts. This
 * sweep obtains the second one and files it as evidence.
 *
 * IT GRADES THROUGH `provenanceLadder.ts` AND INVENTS NO SECOND SCALE. Every judgement
 * in this file — is the author the same person, is the text the same text, which rung,
 * which grade, is the batch degraded — comes back from `gradeInboundBatch`. This file
 * decides only WHICH rows to look up, performs the lookup, and persists what the ladder
 * concluded. In particular it does NOT re-implement handle comparison: an author
 * agreement is read off the ladder's own verdict (a graded verdict with a
 * `confirmedAuthorHandle` is one the ladder declined to quarantine for mismatch), because
 * a second normalisation rule is how "same person" comes to mean two things.
 *
 * ── THE FOUR HONESTY RULES THIS FILE IS BUILT AROUND ────────────────────────────────
 *
 * 1. A POST oEmbed CANNOT CONFIRM IS NOT THEREBY FAKE. Deleted, protected, rate-limited
 *    and unreachable are four different things and only the first two are facts about the
 *    post. None of them is evidence of forgery. Every one of them files
 *    `outcome = 'could_not_check'` — never `disagrees` — and the row keeps whatever grade
 *    the email alone earned. `disagrees` is written ONLY when both channels answered and
 *    said different things.
 *
 * 2. AN OUTAGE MAY NOT SILENTLY DOWNGRADE THE QUEUE. Three mechanisms, because a single
 *    one is a mechanism somebody can forget to read: (a) every attempted row that the
 *    channel failed on gets its own `could_not_check` corroboration row, so the record
 *    says "we asked and got nothing" rather than staying silent; (b) the batch notice
 *    comes back from the ladder and is a REQUIRED field of the result, so a caller cannot
 *    render the sweep without having been handed the sentence; (c) if the breaker opens
 *    mid-sweep the sweep STOPS and reports `stoppedEarly` with how many rows it never
 *    reached. Rows never reached are recorded as nothing at all, which is correct: we did
 *    not ask them.
 *
 * 3. COVERAGE IS A MEASURED FRACTION OVER THE CORPUS, NOT OVER THE ROWS WE TRIED. The
 *    denominator is every non-quarantined reply the store still holds, counted in SQL, and
 *    it travels as a `Figure<PostTimeCoverage>` with an `ObservationFrame`. There is no
 *    percentage field anywhere in this file, deliberately: a ratio over "the rows this
 *    sweep happened to attempt" reads 100% the moment two lookups succeed, which is the
 *    exact dishonesty the web client's `posted_at` docblock had to work around. An empty
 *    corpus REFUSES (`DATA_ABSENT_NOT_ZERO`) instead of dividing by zero and rendering a
 *    clean bill of health.
 *
 * 4. THE POST DATE AND THE OBSERVATION TIME ARE DIFFERENT COLUMNS. X's date goes to
 *    `posted_on_displayed` via `recordPostedOn`; when WE looked goes to
 *    `marketing_reply_corroboration.observed_at`. They are never mixed, and the post date
 *    is a CALENDAR DATE with no time-of-day and no timezone, because "August 1, 2026" is
 *    all X prints. Widening it into an instant would be the header-date defect one layer
 *    deeper (mkt-r3 §1.1).
 *
 * ── IT NEVER POSTS. Constraint 2 of the compartment, kept structurally rather than by
 * promise: the only network call reachable from this module is `fetchOEmbed`, which issues
 * one GET to `publish.twitter.com`. This module holds no credential, builds no request
 * body, and has no code path to any X write endpoint —
 * `__tests__/postTimeReadOnly.test.ts` asserts that over this file's source and over the
 * fetch calls it actually makes. It is schedulable (one call, bounded, no retries) and a
 * scheduler running it every minute forever still cannot publish anything.
 *
 * ── WHAT IT DELIBERATELY DOES NOT ATTEMPT, AND WHY THAT IS A STORE DEFECT ────────────
 * Only rows the ladder can be fed FAITHFULLY are looked up: `x_notification_email` with
 * `sender_auth_state = 'dkim'` and a stored `sender_dkim_domain`. That is the one case
 * where `SenderAuthEvidence` can be rebuilt from columns without inventing a field.
 *   • `arc` rows cannot: no column holds `arcSealerDomain`, and both available guesses are
 *     wrong — naming a sealer fabricates a trust anchor, omitting it makes `verifySender`
 *     quarantine a row the ingest already authenticated, which would show on screen as an
 *     attack.
 *   • `operator_paste` rows cannot: no column holds which human pasted, so
 *     `gradeInboundItem` would refuse `MKT_PROV_NO_OPERATOR`.
 * Those rows are counted, named in the coverage frame's blind spots, and left alone. They
 * are a missing column in `marketing_x_reply`, owned by whoever owns `service.ts` and the
 * migrations, and they are reported as a gap rather than papered over with a lookup whose
 * grade would be a guess.
 */
import type { Pool } from 'pg';

import {
  INSTRUMENTS,
  OBSERVATION_RULESET_VERSION,
  absent,
  measured,
  ownCorpusFrame,
  type CorroboratedField,
  type Figure,
  type Instant,
  type Refusal,
} from '@lcx/shared';

import {
  fetchOEmbed,
  oembedHealth,
  type OEmbedCode,
  type OEmbedHealth,
  type OEmbedResult,
  type OEmbedStatus,
  type PostRef,
} from './oembed.js';
import {
  gradeInboundBatch,
  type BatchNotice,
  type InboundItem,
  type LadderVerdict,
} from './provenanceLadder.js';
import { isMigrated, recordPostedOn } from './service.js';

/* ══════════════════════════════════════════════════════════════════════════════
 * §0 VOCABULARY AND REFUSALS
 * ═════════════════════════════════════════════════════════════════════════════ */

/** The channel this sweep consults. Matches 0062's CHECK constraint exactly. */
export const POST_TIME_CHANNEL = 'oembed' as const;

/**
 * The one source kind, auth state pair this sweep can grade. See the header: it is a
 * restriction imposed by which columns the store holds, not a judgement about the rest.
 */
export const GRADEABLE_SOURCE_KIND = 'x_notification_email' as const;
export const GRADEABLE_SENDER_AUTH_STATE = 'dkim' as const;

/** Bounded so one cron tick cannot become a ten-minute request (the `xMail.ts` rule). */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 6_000;
/**
 * How long a corroboration verdict stands before this sweep will look again.
 *
 * WITHOUT IT THE SWEEP IS A RETRY STORM WITH A CRON ATTACHED. A post deleted last March
 * 404s every time; a sweep that selects on "no date yet" would re-request it on every
 * tick forever, which is both the rate-limit that mkt-r3 §1.5b observed on the first
 * request from this IP and a self-inflicted denial of the channel for the rows that could
 * have been confirmed.
 */
const DEFAULT_RECHECK_AFTER_HOURS = 24;

export type PostTimeRefusalCode =
  | 'MKT_POSTTIME_NOT_MIGRATED'
  | 'MKT_POSTTIME_NO_CANDIDATES'
  | 'MKT_POSTTIME_CHANNEL_COOLING';

interface RefusalDef {
  message: string;
  rule: string;
}

export const POST_TIME_REFUSAL: Record<PostTimeRefusalCode, RefusalDef> = {
  MKT_POSTTIME_NOT_MIGRATED: {
    message:
      'The corroboration tables are not present on this environment, so nothing was looked up and nothing was recorded. This is a pending migration, not an outage and not an all-clear.',
    rule: 'The house pattern: a compartment awaiting a migration says so, and never reads as working (service.ts migrationState).',
  },
  MKT_POSTTIME_NO_CANDIDATES: {
    message:
      'No reply is currently eligible for an oEmbed lookup: every one either already carries a recent corroboration verdict, carries no X post id, or arrived on a channel whose sender evidence this store cannot reconstruct. Nothing was attempted — this is NOT a statement that the queue is fully corroborated.',
    rule: 'Plan §4 rule 3 — absent data produces a refusal, never a zero. An empty candidate set is not coverage.',
  },
  MKT_POSTTIME_CHANNEL_COOLING: {
    message:
      'X’s oEmbed endpoint failed repeatedly and the breaker is open, so no lookup was attempted and no row was touched. Nothing about any reply changed, and nothing may be read as unconfirmed because of this.',
    rule: 'mkt-r3 §2.1 and oembed.ts’s breaker — one attempt, no retry storms, and an outage that is stated rather than absorbed.',
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
 * §1 THE ROW WE LOOK UP, AND THE ROW WE WRITE
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * A candidate as the store hands it over. Every field is read from a named column; none
 * is derived. `postedOnDisplayed` is present so a SECOND observation can be recorded as
 * agreement or disagreement with the first, which is the only way a `posted_at`
 * corroboration row can honestly exist.
 */
export interface PostTimeCandidate {
  readonly id: number;
  readonly xCommentId: string;
  readonly xPostId: string;
  readonly authorHandle: string;
  readonly authorDisplay: string | null;
  readonly body: string;
  readonly postedOnDisplayed: string | null;
  readonly receivedAt: Instant;
  readonly senderDkimDomain: string;
  readonly senderAuthEvidence: string | null;
}

/**
 * One row bound for `marketing_reply_corroboration`. Shaped on 0062's columns, so a
 * value this type permits is a value the CHECK constraints permit.
 *
 * `observedValue` IS NULL UNLESS `outcome === 'disagrees'`, and that is 0062's rule, not
 * a style choice: on agreement the value is already in the row, and keeping a second copy
 * of a stranger's post text for every corroborated reply re-creates the data-minimisation
 * problem `raw_email` had. `buildCorroborations` enforces it and a test proves it.
 */
export interface CorroborationWrite {
  readonly replyId: number;
  readonly channel: typeof POST_TIME_CHANNEL;
  readonly field: CorroboratedField;
  readonly outcome: 'agrees' | 'disagrees' | 'could_not_check';
  readonly observedValue: string | null;
  readonly detail: string;
  /** oEmbed is documented. `false` here is a fact, not a default. */
  readonly undocumented: false;
  /** When WE looked. NEVER the post date — see rule 4 in the header. */
  readonly observedAt: Instant;
}

/** Cap on a disagreeing value we persist. A disagreement needs the evidence, not the essay. */
const OBSERVED_VALUE_MAX = 2_000;

const clip = (s: string): string =>
  s.length <= OBSERVED_VALUE_MAX ? s : `${s.slice(0, OBSERVED_VALUE_MAX)}… [truncated at ${OBSERVED_VALUE_MAX} chars]`;

/** Display strings compared as display strings. See `buildCorroborations`. */
const sameDisplayString = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/* ══════════════════════════════════════════════════════════════════════════════
 * §2 WHAT ONE LOOKUP PROVED — PURE, SO IT CAN BE PROVEN
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Turn (row, oEmbed result, ladder verdict) into the corroboration rows to persist.
 *
 * PURE AND TOTAL. No clock, no database, no network: the observation instant arrives as
 * `result.fetchedAt`. That is what makes every claim below testable, including the ones
 * about what is NOT written.
 *
 * THE AGREEMENTS ARE READ OFF THE LADDER, NOT RECOMPUTED. `confirmedAuthorHandle` is
 * non-null exactly when the ladder saw X's handle and declined to quarantine the row for
 * mismatch; `textComparison` is the ladder's own three-state verdict. The one comparison
 * performed here is between two DISPLAY STRINGS (`author_display` against
 * `author_name`), which is explicitly not an identity rule — 0046 and the web client both
 * record that a display name is attacker-chosen and must never be rendered as the author
 * — so comparing it locally cannot make "the same person" mean two things.
 *
 * WHY THERE IS NO `language` ROW AND USUALLY NO `posted_at` ROW. Corroboration is
 * agreement or disagreement BETWEEN TWO CHANNELS. No column holds a claimed language, and
 * on a first lookup no column holds a claimed post date, so there is nothing for X to
 * agree with. Filing `agrees` against an absent value would manufacture evidence: the
 * table would show two channels concurring where only one ever spoke. The observation is
 * not lost — the date lands in `posted_on_displayed` with `posted_at_source` naming the
 * channel, which is the provenance record for a FIRST observation. A `posted_at` row
 * appears on a RE-CHECK, where a stored date exists to be confirmed or contradicted.
 */
export function buildCorroborations(
  row: PostTimeCandidate,
  result: OEmbedResult,
  verdict: LadderVerdict,
): readonly CorroborationWrite[] {
  const at = result.fetchedAt;
  const base = { replyId: row.id, channel: POST_TIME_CHANNEL, undocumented: false as const, observedAt: at };
  /**
   * EVERY CALLER HANDS OVER WHAT X SAID, agreements included, and this one boundary decides
   * whether it is persisted. The alternative — omitting the value at each agreeing call site
   * — spreads 0062's data-minimisation rule across a dozen arguments, where the next field
   * added silently opts out of it. Here the rule is in one line and a test can prove it by
   * observing that an agreeing row stores nothing despite being handed the value.
   */
  const write = (
    field: CorroboratedField,
    outcome: CorroborationWrite['outcome'],
    detail: string,
    observedValue: string | null = null,
  ): CorroborationWrite => ({
    ...base,
    field,
    outcome,
    // 0062's rule, enforced rather than documented: a value is kept ONLY on disagreement.
    observedValue: outcome === 'disagrees' && observedValue !== null ? clip(observedValue) : null,
    detail,
  });

  const post = result.status === 'confirmed' ? result.post : null;

  /* ── the channel did not confirm the post ─────────────────────────────────────
   * ONE ROW, `could_not_check`, naming the code. Not `disagrees`: a 404 on a deleted
   * post, a 403 on a protected account, a 429 and a DNS failure are four different
   * things and none of them is X contradicting the email. This row is the mechanism
   * that stops "we could not check" from being indistinguishable from silence. */
  if (post === null) {
    return [write('post_id', 'could_not_check', `${result.code}: ${result.message}`)];
  }

  const out: CorroborationWrite[] = [];

  /* ── the post id exists on X ────────────────────────────────────────────────── */
  out.push(
    write(
      'post_id',
      'agrees',
      `X’s oEmbed endpoint returned an embeddable post at ${post.canonicalUrl}, so this id exists and is public as at the observation time.`,
      post.postId,
    ),
  );

  /* ── whose post it is ───────────────────────────────────────────────────────── */
  if (verdict.state === 'quarantined' && verdict.code === 'MKT_PROV_AUTHOR_MISMATCH') {
    out.push(
      write(
        'author_handle',
        'disagrees',
        `The row claims @${row.authorHandle}; X says this post belongs to @${post.authorHandle}. The ladder quarantined the row (${verdict.code}) — this is an attribution error, not a parsing difference.`,
        post.authorHandle,
      ),
    );
  } else if (verdict.state === 'graded' && verdict.confirmedAuthorHandle !== null) {
    out.push(
      write(
        'author_handle',
        'agrees',
        `X names @${verdict.confirmedAuthorHandle} as the author, which the ladder accepted as the same handle the row claims.`,
        verdict.confirmedAuthorHandle,
      ),
    );
  } else {
    out.push(
      write(
        'author_handle',
        'could_not_check',
        `X returned a post but the ladder produced no author finding for it (${verdict.state}${
          verdict.state === 'graded' ? '' : `: ${verdict.code}`
        }), so no agreement may be recorded.`,
      ),
    );
  }

  /* ── the words ──────────────────────────────────────────────────────────────── */
  if (verdict.state === 'graded' && verdict.textComparison !== null) {
    const cmp = verdict.textComparison;
    if (cmp.verdict === 'consistent') {
      out.push(write('post_text', 'agrees', `The two channels say the same thing (${cmp.note}).`, post.text));
    } else if (cmp.verdict === 'contradicted') {
      out.push(
        write(
          'post_text',
          'disagrees',
          `The email body and X’s own text for this post do not match (${cmp.note}). A human must read both; the ladder graded this ${verdict.rung}.`,
          post.text,
        ),
      );
    } else {
      out.push(
        write(
          'post_text',
          'could_not_check',
          `Both channels answered, but the texts are too different in shape to compare (${cmp.note}). This is evidence neither way — the body extractor is crude by design.`,
        ),
      );
    }
  }

  /* ── the display name, which is not identity ────────────────────────────────── */
  if (row.authorDisplay !== null && row.authorDisplay.trim() !== '' && post.authorName !== null) {
    const agrees = sameDisplayString(row.authorDisplay, post.authorName);
    out.push(
      agrees
        ? write('author_display', 'agrees', `X prints the same display name the row holds (${post.authorName}).`, post.authorName)
        : write(
            'author_display',
            'disagrees',
            `The row holds the display name “${row.authorDisplay}”; X prints “${post.authorName}”. A display name is attacker-chosen and is not identity, so this is a discrepancy to look at, never grounds to re-attribute the post.`,
            post.authorName,
          ),
    );
  }

  /* ── the date, on a RE-CHECK only. See the docblock. ────────────────────────── */
  if (row.postedOnDisplayed !== null && post.postedOnDisplayed !== null) {
    const stored = row.postedOnDisplayed.slice(0, 10);
    out.push(
      stored === post.postedOnDisplayed
        ? write(
            'posted_at',
            'agrees',
            `X still renders this post as ${post.postedOnRaw ?? post.postedOnDisplayed}, the calendar date already stored. No time-of-day was observed and none is stored.`,
            post.postedOnDisplayed,
          )
        : write(
            'posted_at',
            'disagrees',
            `The row holds the post date ${stored}; X now renders ${post.postedOnRaw ?? post.postedOnDisplayed}. Both are calendar dates with no time-of-day.`,
            post.postedOnDisplayed,
          ),
    );
  }

  return out;
}

/**
 * May this lookup's date be written to the row?
 *
 * TWO CONDITIONS, AND EACH ONE FAILS ON ITS OWN FIXTURE — there is no third, redundant
 * guard here, because a check no test can reach is a check nobody can rely on.
 *
 *  1. THE LADDER MUST HAVE GRADED THE ROW. A quarantined row is one the ladder does not
 *     believe: adopting a date out of the very lookup that caused the quarantine — an author
 *     mismatch — would take the half of the answer we like and discard the half we do not.
 *  2. THE DATE MUST BE THE ONE oEmbed DISPLAYED. See below: the ladder will hand over a
 *     syndication date, and this column's stamp would misdescribe it.
 *
 * The value returned is the LADDER's `postedOnDisplayed`, not the raw oEmbed field, so what
 * reaches the column is what the graded verdict stands behind.
 */
export function postDateToRecord(verdict: LadderVerdict): string | null {
  if (verdict.state !== 'graded') return null;
  /**
   * THE SOURCE MUST MATCH THE STAMP. `recordPostedOn` writes
   * `posted_at_source = 'oembed_display_date'`, so only a date the oEmbed embed actually
   * displayed may travel through it. The ladder's `dateFields` will happily hand over a date
   * taken from the UNDOCUMENTED syndication backend on a row oEmbed could not confirm — a
   * real provenance, graded D4, and not this one. Filing it under the oEmbed stamp would
   * launder an undocumented source into a documented one, in a column an audit reads.
   */
  if (verdict.postedAtSource !== 'oembed_displayed_date') return null;
  return verdict.postedOnDisplayed;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §3 THE STORE — WHICH ROWS, AND WHERE THE TWO INSTANTS GO
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * The candidate query, exported so a test can assert its shape rather than trust it.
 *
 * `$1` recheck-window hours, `$2` limit.
 *
 * THE `NOT EXISTS` CLAUSE IS THE ANTI-STORM GUARD and it is the reason this sweep is safe
 * to schedule. Selecting on "has no post date" alone would re-request every permanently
 * deleted post on every tick, forever. Selecting on "has no RECENT corroboration verdict"
 * instead means a 404 costs one request a day, and a row that could not be checked because
 * the channel was down is retried on the next tick rather than being written off.
 *
 * THE ORDER IS NOT COSMETIC. Rows with no date at all come first, so the scarce request
 * budget goes to rows where a lookup can move coverage, and re-checks of already-dated
 * rows consume only what is left over.
 */
export const POST_TIME_CANDIDATE_SQL = `
  SELECT r.id, r.x_comment_id, r.x_post_id, r.author_handle, r.author_display, r.body,
         r.posted_on_displayed, r.received_at, r.sender_dkim_domain, r.sender_auth_evidence
    FROM marketing_x_reply r
   WHERE NOT r.quarantined
     AND r.x_post_id IS NOT NULL
     AND r.author_handle IS NOT NULL
     AND r.source_kind = '${GRADEABLE_SOURCE_KIND}'
     AND r.sender_auth_state = '${GRADEABLE_SENDER_AUTH_STATE}'
     AND r.sender_dkim_domain IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM marketing_reply_corroboration c
            WHERE c.reply_id = r.id
              AND c.channel = '${POST_TIME_CHANNEL}'
              AND c.observed_at > now() - ($1 || ' hours')::interval
         )
   ORDER BY (r.posted_on_displayed IS NOT NULL), r.received_at ASC
   LIMIT $2`;

interface CandidateRow {
  id: number;
  x_comment_id: string;
  x_post_id: string;
  author_handle: string;
  author_display: string | null;
  body: string;
  posted_on_displayed: string | null;
  received_at: string | Date;
  sender_dkim_domain: string;
  sender_auth_evidence: string | null;
}

const asInstant = (v: string | Date): Instant => (v instanceof Date ? v.toISOString() : String(v));

/** Rows this sweep may look up, oldest-undated first. */
export async function listPostTimeCandidates(
  pool: Pool,
  opts: { limit?: number; recheckAfterHours?: number } = {},
): Promise<readonly PostTimeCandidate[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const hours = Math.max(opts.recheckAfterHours ?? DEFAULT_RECHECK_AFTER_HOURS, 1);
  const res = await pool.query(POST_TIME_CANDIDATE_SQL, [String(hours), limit]);
  return (res.rows as CandidateRow[]).map((r) => ({
    id: Number(r.id),
    xCommentId: r.x_comment_id,
    xPostId: r.x_post_id,
    authorHandle: r.author_handle,
    authorDisplay: r.author_display,
    body: r.body,
    postedOnDisplayed: r.posted_on_displayed === null ? null : asInstant(r.posted_on_displayed).slice(0, 10),
    receivedAt: asInstant(r.received_at),
    senderDkimDomain: r.sender_dkim_domain,
    senderAuthEvidence: r.sender_auth_evidence,
  }));
}

/**
 * Persist one corroboration verdict.
 *
 * UPSERT ON (reply_id, channel, field), which is 0062's unique index and its stated
 * reason: a retried corroboration must UPDATE rather than accumulate, so a flapping
 * channel cannot inflate the evidence count behind a grade.
 *
 * `observed_at` carries `CorroborationWrite.observedAt` — the fetch instant — and never
 * `now()`. A sweep that wrote `now()` would date the evidence to when the transaction
 * committed rather than to when X was asked, which is the same category of error as
 * calling a mail header date a post time.
 */
export async function writeCorroboration(pool: Pool, w: CorroborationWrite): Promise<void> {
  await pool.query(
    `INSERT INTO marketing_reply_corroboration
       (reply_id, channel, field, outcome, observed_value, detail, undocumented, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)
     ON CONFLICT (reply_id, channel, field) DO UPDATE
        SET outcome        = EXCLUDED.outcome,
            observed_value = EXCLUDED.observed_value,
            detail         = EXCLUDED.detail,
            undocumented   = EXCLUDED.undocumented,
            observed_at    = EXCLUDED.observed_at`,
    [w.replyId, w.channel, w.field, w.outcome, w.observedValue, w.detail, w.undocumented, w.observedAt],
  );
}

/**
 * IS 0062 APPLIED? A SECOND PROBE, BECAUSE `isMigrated` ANSWERS ABOUT A DIFFERENT TABLE.
 *
 * `service.ts isMigrated` probes `marketing_x_reply`, which 0046 created. The
 * corroboration table arrives in 0062, applied by hand against a database whose
 * credentials live in Render's dashboard — so there is a real window where the code is
 * live, `isMigrated` is true, and this sweep's writes would throw `relation
 * "marketing_reply_corroboration" does not exist`. A scheduled job failing with a 500
 * every minute is the "compartment looks like an outage" defect that
 * `deploySafety.test.ts` exists to prevent, so it is a stated refusal instead.
 *
 * Caching follows the M0 defect-8 rule exactly: only a DEFINITIVE answer is remembered. A
 * transient error degrades this run and is re-asked on the next, rather than pinning the
 * process into a pending migration that was applied weeks ago.
 */
let corroborationTableCache: boolean | null = null;

/** Test-only: forget the probe. */
export function _resetCorroborationProbe(): void {
  corroborationTableCache = null;
}

export async function corroborationTablePresent(pool: Pool): Promise<boolean> {
  if (corroborationTableCache !== null) return corroborationTableCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_reply_corroboration') IS NOT NULL AS ok`,
    );
    corroborationTableCache = Boolean(res.rows[0]?.ok);
    return corroborationTableCache;
  } catch {
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §4 COVERAGE — A FRACTION OVER THE CORPUS, WITH ITS FRAME
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * How much of the corpus carries X's own post date.
 *
 * NO PERCENTAGE FIELD, AND THAT IS THE POINT. A numerator and a denominator can be read
 * back to their SQL; a percentage cannot, and `12 of 87` survives being copied into a
 * slide in a way that `13.8%` does not. `statement` is the sentence a surface renders.
 */
export interface PostTimeCoverage {
  /** Rows carrying a post date from X. */
  readonly numerator: number;
  /** Every non-quarantined reply the store still holds. Counted, never assumed. */
  readonly denominator: number;
  readonly ofWhat: string;
  readonly statement: string;
  /** Of the denominator, how many this sweep is even able to look up. */
  readonly lookupEligible: number;
  /**
   * The rest: `arc` and `operator_paste` rows whose ladder inputs the store cannot
   * reconstruct. Their post date can never be filled by this path, so a reader who sees
   * coverage plateau below 1 can tell whether that is a channel problem or a schema one.
   */
  readonly notLookupEligible: number;
}

const DESK_RULE = (provision: string, text: string) => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

function coverageRefusal(sentence: string, missing: string): Refusal {
  return {
    code: 'DATA_ABSENT_NOT_ZERO',
    sentence,
    rule: DESK_RULE(
      'doctrine rule 3 — absent data produces a refusal, never a zero',
      'A coverage fraction needs a population that was actually counted. An empty corpus is refused rather than reported as 0 of 0, which on a panel is indistinguishable from full coverage.',
    ),
    recovery: { kind: 'supply_data', missing, whoCanSupply: 'the ingest, once a reply has been stored' },
    matched: null,
    ruleSetVersion: OBSERVATION_RULESET_VERSION,
  };
}

/**
 * Measure coverage. `asOf` is passed, never read from a clock, so a test can assert what
 * the figure says about a corpus as at a stated instant.
 *
 * THE DENOMINATOR IS THE CORPUS, NOT THE SWEEP. Counted by SQL over every non-quarantined
 * row, so it cannot silently become "the rows this run happened to try" — which would read
 * 100% on the first successful lookup and is precisely what
 * `apps/web/src/lib/api/marketing.ts` had to stop doing when it divided by the loaded page.
 */
export async function measurePostTimeCoverage(
  pool: Pool,
  asOf: Instant,
  lastChannelSuccessAt: Instant | null,
): Promise<Figure<PostTimeCoverage>> {
  const res = await pool.query(
    `SELECT count(*)::int AS rows_held,
            count(posted_on_displayed)::int AS with_post_date,
            count(*) FILTER (
              WHERE source_kind = $1 AND sender_auth_state = $2 AND sender_dkim_domain IS NOT NULL
                AND x_post_id IS NOT NULL
            )::int AS lookup_eligible,
            min(received_at) AS earliest
       FROM marketing_x_reply
      WHERE NOT quarantined`,
    [GRADEABLE_SOURCE_KIND, GRADEABLE_SENDER_AUTH_STATE],
  );
  const row = (res.rows[0] ?? {}) as {
    rows_held?: number;
    with_post_date?: number;
    lookup_eligible?: number;
    earliest?: string | Date | null;
  };
  const denominator = Number(row.rows_held ?? 0);
  if (denominator === 0) {
    return absent(
      coverageRefusal(
        'The store holds no non-quarantined reply, so there is no population to measure post-time coverage over. This is an empty register, not full coverage and not zero coverage.',
        'at least one stored reply',
      ),
    );
  }
  const numerator = Number(row.with_post_date ?? 0);
  const lookupEligible = Number(row.lookup_eligible ?? 0);
  const notLookupEligible = Math.max(0, denominator - lookupEligible);
  const earliest = row.earliest == null ? asOf : asInstant(row.earliest);

  return measured(
    {
      numerator,
      denominator,
      ofWhat: 'non-quarantined replies the store still holds',
      statement:
        `${numerator} of ${denominator} stored replies carry X’s own post date, observed through `
        + 'publish.twitter.com/oembed. The remainder have no post date at all, so anything asking how long a '
        + 'customer has waited since posting refuses for them rather than substituting when we received the email.'
        + (notLookupEligible > 0
          ? ` ${notLookupEligible} of them can never be filled by this path: their sender evidence cannot be rebuilt from the columns the store keeps.`
          : ''),
      lookupEligible,
      notLookupEligible,
    },
    ownCorpusFrame(
      { from: earliest, to: asOf, asOf, lastSuccessfulPollAt: lastChannelSuccessAt },
      'Every non-quarantined reply in marketing_x_reply, and whether each carries a post date obtained from X’s own oEmbed endpoint. The desk holds this population completely.',
      [
        'replies the retention sweep has already removed — the denominator is rows still held, not rows ever received',
        'quarantined rows, which are excluded by design and are counted by listQuarantined instead',
        'any reply on a channel whose ladder inputs this store cannot reconstruct (arc-authenticated mail, operator pastes): no lookup is attempted for them at all',
        'posts oEmbed cannot return — deleted, protected or suspended — which stay without a date and are not thereby fake',
        'the time of day a post was written: X prints a calendar date and nothing finer',
      ],
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * §5 THE SWEEP — SCHEDULABLE, BOUNDED, AND UNABLE TO PUBLISH
 * ═════════════════════════════════════════════════════════════════════════════ */

/** What happened to one row. Every field is an observation, not a conclusion. */
export interface PostTimeAttempt {
  readonly replyId: number;
  readonly xCommentId: string;
  readonly postId: string;
  readonly status: OEmbedStatus;
  readonly code: OEmbedCode;
  /** The human sentence for `code`. A surface renders this, never the bare code. */
  readonly message: string;
  /** When WE looked. */
  readonly observedAt: Instant;
  /** X's calendar date for the post, `YYYY-MM-DD`. Null means not learned. */
  readonly postedOnDisplayed: string | null;
  /** True only when `recordPostedOn` actually updated the row. */
  readonly postDateRecorded: boolean;
  /** The ladder's verdict, carried whole rather than summarised into a number. */
  readonly verdict: LadderVerdict;
  readonly corroborations: readonly CorroborationWrite[];
}

export interface PostTimeCounts {
  /** Rows the candidate query returned. */
  readonly candidates: number;
  readonly attempted: number;
  /** Candidates never asked, because the breaker opened mid-sweep. */
  readonly notAttempted: number;
  readonly confirmed: number;
  /** Deleted, protected or suspended. NOT evidence of forgery. */
  readonly notPublic: number;
  /** The channel failed or was cooling. Says nothing about any post. */
  readonly channelUnavailable: number;
  readonly postDatesRecorded: number;
  /** Corroboration rows written with `outcome = 'disagrees'`. Each needs a human. */
  readonly disagreements: number;
  /** Rows the ladder quarantined on this lookup — an attribution error, not a duplicate. */
  readonly quarantinedByLadder: number;
}

/**
 * Why the sweep stopped before it ran out of candidates. NON-NULL is the record that an
 * outage curtailed the run, which is what stops a short run from reading as a complete one.
 */
export interface PostTimeStoppedEarly {
  readonly afterAttempts: number;
  readonly candidatesNotAttempted: number;
  readonly reason: string;
}

export interface PostTimeSweepResult {
  readonly ok: true;
  readonly attempts: readonly PostTimeAttempt[];
  readonly counts: PostTimeCounts;
  /** Over the corpus, with its frame. Never a percentage. */
  readonly coverage: Figure<PostTimeCoverage>;
  /**
   * The ladder's own degradation notice, REQUIRED rather than optional, so no caller can
   * render this sweep without having been handed the sentence that says the channel was
   * down. Null means nothing was degraded.
   */
  readonly notice: BatchNotice | null;
  readonly stoppedEarly: PostTimeStoppedEarly | null;
  readonly channelHealth: OEmbedHealth;
}

export interface PostTimeRefusalResult {
  readonly ok: false;
  readonly code: PostTimeRefusalCode;
  readonly message: string;
  readonly rule: string;
  /** Present when the corpus could still be measured. Absent on a missing migration. */
  readonly coverage: Figure<PostTimeCoverage> | null;
  readonly channelHealth: OEmbedHealth;
}

export interface PostTimeSweepOptions {
  limit?: number;
  recheckAfterHours?: number;
  timeoutMs?: number;
  /** Injectable for tests; `fetchOEmbed` defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam. The sweep never reads a clock except through this. */
  now?: () => Date;
}

const refuseSweep = (
  code: PostTimeRefusalCode,
  coverage: Figure<PostTimeCoverage> | null,
  health: OEmbedHealth,
): PostTimeRefusalResult => ({
  ok: false,
  code,
  message: POST_TIME_REFUSAL[code].message,
  rule: POST_TIME_REFUSAL[code].rule,
  coverage,
  channelHealth: health,
});

/**
 * Corroborate the queue against X's own endpoint, and record what came back.
 *
 * ── THE ORDER OF OPERATIONS, AND WHY IT IS THIS ONE ─────────────────────────────────
 *  1. Refuse if the breaker is already open. Nothing is asked and nothing is written, so
 *     an outage cannot mark a single row as unconfirmed.
 *  2. Select candidates. An empty set REFUSES: "nothing to look up" is not "the queue is
 *     corroborated", and a caller handed `ok: true, attempted: 0` would render the second.
 *  3. Fetch, one row at a time, ONE ATTEMPT EACH, no retries. If `fetchOEmbed` reports the
 *     breaker has opened, stop immediately and record `stoppedEarly`.
 *  4. Grade the whole set through `gradeInboundBatch` — one call, so the rungs, the grades
 *     and the degradation notice all come from the ladder and not from here.
 *  5. Write: the corroboration rows always, the post date only where `postDateToRecord`
 *     allows it.
 *  6. Measure coverage over the corpus, AFTER the writes, so the fraction reflects them.
 *
 * IT CANNOT PUBLISH. The only outbound call is `fetchOEmbed`: one GET to
 * publish.twitter.com, no credential, no body. Schedule it as often as you like.
 */
export async function runPostTimeSweep(
  pool: Pool,
  opts: PostTimeSweepOptions = {},
): Promise<PostTimeSweepResult | PostTimeRefusalResult> {
  const now = opts.now ?? (() => new Date());
  const asOf = now().toISOString();

  // The schema first: a sweep that cannot write its evidence must not perform the lookups.
  if (!(await isMigrated(pool)) || !(await corroborationTablePresent(pool))) {
    return refuseSweep('MKT_POSTTIME_NOT_MIGRATED', null, oembedHealth(Date.parse(asOf)));
  }

  if (oembedHealth(Date.parse(asOf)).cooling) {
    return refuseSweep(
      'MKT_POSTTIME_CHANNEL_COOLING',
      await measurePostTimeCoverage(pool, asOf, oembedHealth(Date.parse(asOf)).lastSuccessAt),
      oembedHealth(Date.parse(asOf)),
    );
  }

  const candidates = await listPostTimeCandidates(pool, {
    limit: opts.limit,
    recheckAfterHours: opts.recheckAfterHours,
  });
  if (candidates.length === 0) {
    const h = oembedHealth(Date.parse(asOf));
    return refuseSweep(
      'MKT_POSTTIME_NO_CANDIDATES',
      await measurePostTimeCoverage(pool, asOf, h.lastSuccessAt),
      h,
    );
  }

  /* ── 3. one attempt per row, and stop if the breaker opens ── */
  const looked: { row: PostTimeCandidate; result: OEmbedResult }[] = [];
  let stoppedEarly: PostTimeStoppedEarly | null = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const ref: PostRef = { handle: row.authorHandle.replace(/^@/, ''), postId: row.xPostId };
    const result = await fetchOEmbed(ref, {
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: opts.fetchImpl,
      now,
    });
    looked.push({ row, result });
    if (result.code === 'CHANNEL_COOLING') {
      // The breaker opened while we were working. Stop rather than convert the rest of
      // the queue into `could_not_check` rows that only record our own hammering.
      stoppedEarly = {
        afterAttempts: looked.length,
        candidatesNotAttempted: candidates.length - looked.length,
        reason:
          'X’s oEmbed endpoint failed repeatedly during this sweep and the breaker opened, so the remaining candidates were not asked. They are unchanged, not unconfirmed.',
      };
      break;
    }
  }

  /* ── 4. one grading call, so there is one scale ── */
  const health = oembedHealth(Date.parse(asOf));
  const items: InboundItem[] = looked.map(({ row, result }) => ({
    itemId: row.xCommentId,
    channel: GRADEABLE_SOURCE_KIND,
    claimedAuthorHandle: row.authorHandle,
    claimedPostId: row.xPostId,
    claimedText: row.body,
    receivedAt: row.receivedAt,
    // Faithful reconstruction, and the only one the columns support — see the header.
    sender: {
      dkimPass: true,
      dkimDomain: row.senderDkimDomain,
      arcPass: false,
      arcSealerDomain: null,
      rawAuthenticationResults: row.senderAuthEvidence,
    },
    oembed: result,
    syndication: null,
    operator: null,
    mirrorHost: null,
  }));
  const batch = gradeInboundBatch(items, { channelCooling: health.cooling });
  // `gradeInboundBatch` refuses only on an empty array, and `looked` is non-empty here
  // because `candidates.length === 0` already refused above.
  const verdicts: readonly LadderVerdict[] = batch.ok ? batch.verdicts : [];
  const notice: BatchNotice | null = batch.ok ? batch.notice : null;

  /* ── 5. write ── */
  const attempts: PostTimeAttempt[] = [];
  for (let i = 0; i < looked.length; i += 1) {
    const { row, result } = looked[i];
    const verdict = verdicts[i];
    const corroborations = verdict === undefined ? [] : buildCorroborations(row, result, verdict);
    for (const w of corroborations) await writeCorroboration(pool, w);

    const date = verdict === undefined ? null : postDateToRecord(verdict);
    const recorded = date === null ? false : await recordPostedOn(pool, row.xCommentId, date);

    attempts.push({
      replyId: row.id,
      xCommentId: row.xCommentId,
      postId: row.xPostId,
      status: result.status,
      code: result.code,
      message: result.message,
      observedAt: result.fetchedAt,
      postedOnDisplayed: result.status === 'confirmed' ? (result.post?.postedOnDisplayed ?? null) : null,
      postDateRecorded: recorded,
      verdict: verdict ?? {
        state: 'refused',
        itemId: row.xCommentId,
        grade: null,
        code: 'MKT_PROV_EMPTY_QUEUE',
        message: 'The ladder returned no verdict for this row.',
        rule: 'Plan §4 rule 5 — nothing leaves without a record.',
      },
      corroborations,
    });
  }

  /* ── 6. coverage, over the corpus, after the writes ── */
  const finalHealth = oembedHealth(Date.parse(asOf));
  const coverage = await measurePostTimeCoverage(pool, asOf, finalHealth.lastSuccessAt);

  const counts: PostTimeCounts = {
    candidates: candidates.length,
    attempted: attempts.length,
    notAttempted: candidates.length - attempts.length,
    confirmed: attempts.filter((a) => a.status === 'confirmed').length,
    notPublic: attempts.filter((a) => a.status === 'not_public').length,
    channelUnavailable: attempts.filter((a) => a.status === 'unknown').length,
    postDatesRecorded: attempts.filter((a) => a.postDateRecorded).length,
    disagreements: attempts.reduce(
      (n, a) => n + a.corroborations.filter((c) => c.outcome === 'disagrees').length,
      0,
    ),
    quarantinedByLadder: attempts.filter((a) => a.verdict.state === 'quarantined').length,
  };

  return { ok: true, attempts, counts, coverage, notice, stoppedEarly, channelHealth: finalHealth };
}
