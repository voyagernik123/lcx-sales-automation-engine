import type { Pool } from 'pg';
import {
  RETENTION_BASIS,
  RETENTION_DPO_RULING_OUTSTANDING,
  RETENTION_INFERENCE_CAVEAT,
  RETENTION_YEARS_BASE,
  RETENTION_YEARS_MAX,
  isRecordMigrated,
  sha256Hex,
  thirdPartyRetentionDays,
} from './record.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  M7 — THE FIVE-YEAR CLOCK. The thing that did not exist.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  THE DEFECT, PRECISELY. Migration 0046 gives every inbound row a 90-day
 *  `retention_expires_at` and `service.ts sweepExpired` deletes on it — and that
 *  sweep IS wired, to the ingest tick. Migration 0061 designs the other half: LCX's
 *  own cleared statements on a five-year clock in `marketing_record`. Nothing ever
 *  called `writeRecord`, so `marketing_record` is empty on every environment, and
 *  `sweepExpiredRecords` had no caller either. The net state of the compartment
 *  before this file: on day 91 the third-party row is destroyed, the LCX side was
 *  never written, and the record MiCA wants for five years is gone. The retention
 *  SPLIT existed as a design and as a comment; in operation it deleted everything
 *  and kept nothing.
 *
 *  WHAT THIS FILE ADDS, and each of the four is a thing the compartment could not
 *  previously do at all:
 *
 *   1. A CLOCK THAT RUNS BOTH SIDES, in one call, with the LCX side ordered first.
 *      `runRetentionClock` is deliberately NOT hung off the mail tick: the
 *      adversarial pass found that 0046's sweep only runs when the poller runs, so
 *      disabling one cron silently stops retention. This is scheduled on its own.
 *
 *   2. A RUN LEDGER, so "retention is running" is a checkable fact rather than an
 *      assurance. A retention duty you cannot evidence you honoured is a duty you
 *      have not honoured — that is the same argument 0061 makes for logging an
 *      erasure, and it applies with more force to a sweep, because a sweep leaves
 *      no rows behind to inspect. `lastRunAt: null` means NEVER, and the posture
 *      refuses rather than reporting a comfortable zero.
 *
 *   3. JEOPARDY, WHICH IS THE LOAD-BEARING PART. Before deleting anything the clock
 *      finds the inbound rows that carry an APPROVED LCX statement and have NO row
 *      in `marketing_record` — the exact rows whose deletion destroys the MiCA
 *      record. They are named, with days remaining, and they are NOT deleted: their
 *      third-party body is MINIMISED to a hash and the row is held with a stated
 *      reason. So the stranger's words go on schedule and the evidence of what LCX
 *      said survives, which is the only reading under which Art 17(1) and the
 *      inferred Art 68(9) can both stand.
 *
 *   4. THE RECONCILIATION WRITTEN DOWN, in `RETENTION_ERASURE_RECONCILIATION`, and
 *      returned in the payload rather than living in this comment.
 *
 *  ── WHAT IS STILL NOT TRUE, STATED HERE BECAUSE IT IS THE FIRST THING A READER
 *     WILL ASSUME WRONGLY ──
 *
 *   · `service.ts sweepExpired` IS STILL A SECOND SWEEP, WIRED TO THE MAIL TICK, AND
 *     IT NO LONGER DELETES BLIND. It was `DELETE FROM marketing_x_reply WHERE
 *     retention_expires_at < now()`, so whichever job ran first decided whether the
 *     MiCA record survived, and the tick runs every few minutes. It now carries the
 *     same jeopardy predicate this file uses and HOLDS those rows instead of deleting
 *     them, so the record cannot be lost to a race.
 *
 *     WHAT IS STILL NOT THE SAME: it holds, and this clock MINIMISES. Holding keeps
 *     the third party's words past 90 days; minimising replaces them with a sha256 and
 *     keeps only the hash, which is the resolution the split actually wants — and it
 *     needs 0064's `body_hash` column, so it is unavailable until that migration lands.
 *     A held row is therefore late on storage limitation, recoverably; a deleted row was
 *     an unrecoverable loss of the Art 68(9) record. `RETENTION_COMPETING_SWEEP` still
 *     stands on every posture read, and now states THAT rather than the race.
 *
 *   · The five-to-seven year period is an INFERENCE from Art 68(9) with Art 88(1),
 *     not a citation: MiCA sets no express retention period for a CASP's marketing
 *     communications. `RETENTION_INFERENCE_CAVEAT` is re-exported from `record.ts`
 *     and returned with every figure.
 *
 *   · THE OWNER STILL OWES A DPO RULING. `RETENTION_DPO_RULING_OUTSTANDING` states
 *     the question. This file implements the STATED DEFAULT — LCX statements long,
 *     third-party content minimised, only a hash retained across the boundary — and
 *     labels it a default rather than a decision. Since §0 the default is a named
 *     constant with a document behind it (`RETENTION_POLICY`, `RETENTION_POLICY.md`)
 *     and `signedByDpo` is literally `null`. Overriding it is one line; it is still
 *     nobody's signed decision, and the payload says so on every read.
 *
 *  Every statement below is parameterised. Nothing is concatenated into SQL.
 */

/* ════════ §0 THE POLICY OF RECORD ════════ */

/**
 * ONE PLACE WHERE THE RULING LIVES.
 *
 * The conflict this settles is real and code cannot settle it: the retention inferred
 * from MiCA Art 68(9) wants LCX's records kept for five years, extendable to seven,
 * and migration 0046 gives every inbound row ninety days and deletes on it. Both
 * cannot be honoured for the same bytes. Until this section the resolution — LCX's OWN
 * statements retained long, the third party's content minimised — was an assumption
 * spread across a comment block in 0064, a paragraph in `record.ts`, and the ORDER of
 * statements in §6. Reading it took archaeology; changing it took finding every site.
 *
 * IT IS NOW A CONSTANT. `RETENTION_POLICY` is the ruling and §6 does what it says.
 * Overriding the ruling is ONE EDIT — point `RETENTION_POLICY` at another member of
 * `RETENTION_POLICY_ALTERNATIVES`. `retentionPolicySweepShape` is the function the
 * sweep branches on, so a test can prove the sweep follows the constant instead of
 * trusting that it does.
 *
 * WHAT THIS CONSTANT IS NOT: a legal opinion, and not signed. `signedByDpo: null` is
 * the literal state of the world — no data protection officer has ruled on it. The
 * written decision is `RETENTION_POLICY.md` at the repository root and it says the
 * same about itself. A default that presents itself as a decision is worse than no
 * default, so this one states which it is, in a field, in the payload.
 */

/** What the clock does with an inbound row whose short period has run out. */
export type ExpiredRowDisposition =
  /** Deleted. Drafts cascade (0046). The third party's words are gone. */
  | 'delete'
  /** Body replaced by `MINIMISED_BODY_MARKER`, sha256 kept in `body_hash`, row held with a reason. */
  | 'minimise_and_hold'
  /** Row and body kept, held with a stated reason. Retention past the stated period, on purpose. */
  | 'hold_intact';

export type RetentionPolicyId = 'split_default' | 'retain_everything' | 'minimise_everything';

export interface RetentionPolicy {
  readonly id: RetentionPolicyId;
  readonly label: string;
  /** The written decision. A constant with no document behind it is a preference. */
  readonly document: string;
  /** ISO date the default was written down — not the date anybody approved it. */
  readonly decidedOn: string;
  /** The DPO who signed. `null` because none has: never a placeholder name. */
  readonly signedByDpo: string | null;
  /** An expired row carrying an approved LCX statement with no row in `marketing_record`. */
  readonly expiredWithUnrecordedStatement: ExpiredRowDisposition;
  /** Every other expired inbound row. */
  readonly expiredOtherwise: ExpiredRowDisposition;
  /**
   * Years an LCX statement is kept from drafting. §6 also treats it as a FLOOR: the
   * long clock will not delete a record younger than this even if the row's own
   * `retention_expires_at` says it may.
   */
  readonly lcxStatementYears: number;
  /**
   * Art 68(9)'s extension ceiling. Reported, and asserted by 0061's CHECK constraint
   * at write time; §6 does not compute it — the extension is worked by `legal_hold`.
   */
  readonly lcxStatementCeilingYears: number;
  /** `false` stops the long clock entirely: no LCX statement is ever swept. */
  readonly sweepLcxStatements: boolean;
  /** What this choice gives up. All three give something up; that is why it is a ruling. */
  readonly tradeoff: string;
}

/**
 * THE IMPLEMENTED DEFAULT — the split, and the reason it is defensible.
 *
 * LCX's own cleared statements go on the long clock; the stranger's words leave on the
 * short one; what crosses the boundary is a sha256, not text. The only genuinely hard
 * row — an expired inbound row that an approved-but-unrecorded LCX statement depends on
 * — is minimised and HELD, because deleting it destroys the Art 68(9) record and
 * keeping it whole breaches minimisation, and a hash breaches neither.
 */
export const RETENTION_POLICY_SPLIT_DEFAULT: RetentionPolicy = {
  id: 'split_default',
  label: 'LCX statements retained long, third-party content minimised',
  document: 'RETENTION_POLICY.md',
  decidedOn: '2026-08-03',
  signedByDpo: null,
  expiredWithUnrecordedStatement: 'minimise_and_hold',
  expiredOtherwise: 'delete',
  lcxStatementYears: RETENTION_YEARS_BASE,
  lcxStatementCeilingYears: RETENTION_YEARS_MAX,
  sweepLcxStatements: true,
  tradeoff:
    'A held row keeps a stranger\'s row (not their words) past the ninety days, and the hash is '
    + 'retained for years. If the DPO reads Art 5(1)(c) strictly, that is a breach this default '
    + 'accepts in order to keep the record.',
};

/**
 * ALTERNATIVE ONE — retain everything. The maximal reading of Art 68(9): nothing is
 * deleted on either clock, expired inbound rows are held with their text intact and a
 * stated reason. Lawful only if a supervisory duty covers the third party's words too.
 */
export const RETENTION_POLICY_RETAIN_EVERYTHING: RetentionPolicy = {
  id: 'retain_everything',
  label: 'retain everything, delete nothing on either clock',
  document: 'RETENTION_POLICY.md',
  decidedOn: '2026-08-03',
  signedByDpo: null,
  expiredWithUnrecordedStatement: 'hold_intact',
  expiredOtherwise: 'hold_intact',
  lcxStatementYears: RETENTION_YEARS_MAX,
  lcxStatementCeilingYears: RETENTION_YEARS_MAX,
  sweepLcxStatements: false,
  tradeoff:
    'Storage limitation is abandoned for third-party personal data: every stranger\'s message is '
    + 'held indefinitely under a compliance label, which is the exact failure mode GDPR Art '
    + '5(1)(e) exists to prevent. Do not select this without a written basis for the third party\'s '
    + 'words specifically.',
};

/**
 * ALTERNATIVE TWO — minimise everything. The maximal reading of Art 5(1)(c): the short
 * clock deletes on schedule with no exception, including the collision row, and LCX
 * statements are kept only for the inferred floor. Accepts losing the MiCA record for
 * any statement nobody recorded in time.
 */
export const RETENTION_POLICY_MINIMISE_EVERYTHING: RetentionPolicy = {
  id: 'minimise_everything',
  label: 'minimise everything; the short clock has no exception',
  document: 'RETENTION_POLICY.md',
  decidedOn: '2026-08-03',
  signedByDpo: null,
  expiredWithUnrecordedStatement: 'delete',
  expiredOtherwise: 'delete',
  lcxStatementYears: RETENTION_YEARS_BASE,
  lcxStatementCeilingYears: RETENTION_YEARS_MAX,
  sweepLcxStatements: true,
  tradeoff:
    'The Art 68(9) record is lost for every approved statement that was not recorded before its '
    + 'inbound row expired, silently and unrecoverably. The jeopardy list still names the rows '
    + 'before they go, so the loss is evidenced — but it is a loss, not a deferral.',
};

/** Every ruling this file can execute. `RETENTION_POLICY` must be one of them. */
export const RETENTION_POLICY_ALTERNATIVES: readonly RetentionPolicy[] = [
  RETENTION_POLICY_SPLIT_DEFAULT,
  RETENTION_POLICY_RETAIN_EVERYTHING,
  RETENTION_POLICY_MINIMISE_EVERYTHING,
];

/**
 * ══════════════ THE ONE LINE ══════════════
 * THIS is the retention ruling in force. To override it, change this line to
 * `RETENTION_POLICY_RETAIN_EVERYTHING` or `RETENTION_POLICY_MINIMISE_EVERYTHING` and
 * change nothing else — then update `RETENTION_POLICY.md`, because a ruling in code
 * that contradicts the document of record is two rulings.
 */
export const RETENTION_POLICY: RetentionPolicy = RETENTION_POLICY_SPLIT_DEFAULT;

/**
 * The shape of the sweep implied by a policy. §6 branches on THIS and on nothing else,
 * so `retentionPolicySweepShape(RETENTION_POLICY)` is a checkable prediction of what
 * the next enforcing run will do — which is what makes the constant load-bearing
 * rather than decorative.
 */
export interface RetentionSweepShape {
  /** Are the collision rows excluded from the delete by id? */
  readonly protectsUnrecordedStatements: boolean;
  /** Does any expired inbound row get deleted at all? */
  readonly deletesExpiredRows: boolean;
  /** Does any body get replaced by its hash? */
  readonly minimisesBodies: boolean;
  /** Does any row get held with its text intact? */
  readonly holdsBodiesIntact: boolean;
  /** Does the long clock run? */
  readonly sweepsRecords: boolean;
  /** Years the long clock refuses to delete inside, whatever the row says. */
  readonly recordFloorYears: number;
}

export function retentionPolicySweepShape(policy: RetentionPolicy): RetentionSweepShape {
  const d = [policy.expiredWithUnrecordedStatement, policy.expiredOtherwise];
  return {
    protectsUnrecordedStatements: policy.expiredWithUnrecordedStatement !== 'delete',
    deletesExpiredRows: d.includes('delete'),
    minimisesBodies: d.includes('minimise_and_hold'),
    holdsBodiesIntact: d.includes('hold_intact'),
    sweepsRecords: policy.sweepLcxStatements,
    recordFloorYears: policy.lcxStatementYears,
  };
}

/* ════════ §1 THE MIGRATION GATE ════════ */

/** The file a human pastes into the Supabase SQL editor. Named on every refusal. */
export const RETENTION_MIGRATION = '0064_marketing_retention.sql';

/** 0061 carries `marketing_record`; the long clock cannot exist without it. */
export const RECORD_MIGRATION_REQUIRED = '0061_marketing_record.sql';

/** 0046 carries `marketing_x_reply`; the short clock cannot exist without it. */
export const QUEUE_MIGRATION_REQUIRED = '0046_marketing.sql';

/**
 * Only a TRUE is memoised, following `record.ts:93` and deliberately NOT
 * `service.ts:52`: caching a false on any error convinces a process for its whole
 * life that a migration is missing because the database blinked once.
 */
let retentionMigratedCache: true | null = null;

export async function isRetentionMigrated(pool: Pool): Promise<boolean> {
  if (retentionMigratedCache === true) return true;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_retention_run') IS NOT NULL AS ok`,
    );
    const ok = Boolean(res.rows[0]?.ok);
    if (ok) retentionMigratedCache = true;
    return ok;
  } catch {
    return false;
  }
}

/** Is the inbound queue itself present? The short clock has nothing to sweep without it. */
export async function isQueueMigrated(pool: Pool): Promise<boolean> {
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_x_reply') IS NOT NULL AS ok`,
    );
    return Boolean(res.rows[0]?.ok);
  } catch {
    return false;
  }
}

/** Test-only: forget the probe. */
export function _resetRetentionMigrated(): void {
  retentionMigratedCache = null;
}

/* ════════ §2 REFUSALS ════════ */

export type RetentionRefusalCode =
  /* gates */
  | 'RETENTION_LEDGER_ABSENT'
  | 'RETENTION_QUEUE_ABSENT'
  | 'RETENTION_RECORD_REGISTER_ABSENT'
  /* evidence */
  | 'RETENTION_CLOCK_NEVER_RAN'
  | 'RETENTION_CLOCK_STALE'
  | 'RETENTION_RUN_NOT_RECORDED'
  /* the split */
  | 'RETENTION_STATEMENTS_IN_JEOPARDY'
  | 'RETENTION_JEOPARDY_PAST_GRACE'
  | 'RETENTION_COMPETING_SWEEP'
  /* configuration and authority */
  | 'RETENTION_PERIOD_UNDEFINED'
  | 'RETENTION_ACTOR_UNNAMED'
  | 'RETENTION_DPO_RULING_PENDING';

export interface RetentionRefusal {
  readonly ok: false;
  readonly code: RetentionRefusalCode;
  /** One sentence, addressed to the human who has to do something. */
  readonly sentence: string;
  /** The rule, statute or recorded observation that caused it. */
  readonly rule: string;
  readonly ruleText: string;
  readonly remedy: string;
}

export type RetentionResult<T> = { readonly ok: true; readonly value: T } | RetentionRefusal;

const RULES: Record<RetentionRefusalCode, { rule: string; ruleText: string }> = {
  RETENTION_LEDGER_ABSENT: {
    rule: `migration ${RETENTION_MIGRATION}`,
    ruleText:
      'The retention run ledger does not exist on this environment, so a sweep could delete rows '
      + 'and leave no evidence that it ran, on whose authority, or how many rows it touched. A '
      + 'destructive job with no record is indistinguishable from data loss.',
  },
  RETENTION_QUEUE_ABSENT: {
    rule: `migration ${QUEUE_MIGRATION_REQUIRED}`,
    ruleText:
      'marketing_x_reply does not exist here, so there is no inbound row to hold a retention '
      + 'clock and nothing for the short clock to govern.',
  },
  RETENTION_RECORD_REGISTER_ABSENT: {
    rule: `migration ${RECORD_MIGRATION_REQUIRED}`,
    ruleText:
      'marketing_record does not exist here, so no LCX statement can be placed on the five-year '
      + 'clock and the retention split is inoperative in the direction that matters: everything '
      + 'expires on the short clock and nothing is kept.',
  },
  RETENTION_CLOCK_NEVER_RAN: {
    rule: 'GDPR Art 5(1)(e) storage limitation; Art 5(2) accountability',
    ruleText:
      'The run ledger holds no rows, so on the evidence available this clock has never executed. '
      + 'Accountability under Art 5(2) is a duty to DEMONSTRATE compliance, and an unrun sweep '
      + 'over rows that state their own expiry is a stated policy the system does not keep.',
  },
  RETENTION_CLOCK_STALE: {
    rule: 'GDPR Art 5(1)(e) storage limitation',
    ruleText:
      'The last recorded run is older than the interval this clock claims to keep, so rows past '
      + 'their stated expiry are still held. A retention period is a promise about the data, not '
      + 'about the schedule that was meant to enforce it.',
  },
  RETENTION_RUN_NOT_RECORDED: {
    rule: 'GDPR Art 5(2) accountability',
    ruleText:
      'The sweep executed but its ledger row could not be written, so the deletion happened and '
      + 'cannot be evidenced. Reported rather than swallowed: the counts in this response are the '
      + 'only remaining trace and should be captured by hand.',
  },
  RETENTION_STATEMENTS_IN_JEOPARDY: {
    rule: 'MiCA Art 68(9) (inferred, see RETENTION_INFERENCE_CAVEAT); Art 8(2) produce on demand',
    ruleText:
      'These inbound rows carry an approved LCX statement and have no row in marketing_record, so '
      + 'the 90-day sweep is about to destroy the only evidence of what LCX said and to whom. They '
      + 'are held with their third-party body minimised rather than deleted, and they stay in this '
      + 'list until someone records the statement or records the decision not to.',
  },
  RETENTION_JEOPARDY_PAST_GRACE: {
    rule: 'GDPR Art 5(1)(e) storage limitation against MiCA Art 68(9) (inferred)',
    ruleText:
      'A row has been held past expiry beyond the grace period because an LCX statement still '
      + 'depends on it. Holding third-party personal data indefinitely under a compliance label is '
      + 'the failure mode storage limitation exists to prevent, so this escalates instead of '
      + 'quietly persisting: either the statement is recorded and the row released, or a named '
      + 'human accepts the loss of the record in writing.',
  },
  RETENTION_COMPETING_SWEEP: {
    rule: 'recorded observation: apps/api/src/marketing/service.ts sweepExpired, wired at routes/marketing.ts tick',
    ruleText:
      'Two sweeps run over the same rows and they resolve jeopardy differently. The mail tick\'s '
      + 'sweep HOLDS a row carrying an unrecorded LCX statement — it no longer deletes it, so the '
      + 'Art 68(9) record cannot be lost to whichever job runs first. This clock MINIMISES instead: '
      + 'it replaces the third party\'s words with a sha256 and keeps the hash, which is the only '
      + 'resolution that satisfies both storage limitation and the record, and it needs migration '
      + '0064. Until 0064 is applied and this clock is run, held rows are retained past 90 days with '
      + 'their text intact. That is late erasure, and it is recorded rather than presented as done.',
  },
  RETENTION_PERIOD_UNDEFINED: {
    rule: 'GDPR Art 5(1)(e); MARKETING_RETENTION_DAYS',
    ruleText:
      'The configured third-party retention period is not a usable number of days, so the period '
      + 'this system enforces is undefined. An undefined period is unbounded retention that nobody '
      + 'chose.',
  },
  RETENTION_ACTOR_UNNAMED: {
    rule: 'GDPR Art 5(2) accountability',
    ruleText:
      'A destructive run is a named human\'s or a named job\'s act. "The system deleted it" is not '
      + 'a control and cannot be reviewed.',
  },
  RETENTION_DPO_RULING_PENDING: {
    rule: 'GDPR Art 5(1)(c) minimisation; Art 17(3)(b); MiCA Art 68(9) (inferred)',
    ruleText:
      'Whether LCX\'s own statements may be retained past the 90-day sweep, and whether a minimised '
      + 'excerpt of the message they answered may be kept with them, is a ruling the DPO has not '
      + 'given. This system implements the stated default and labels it as a default.',
  },
};

export function retentionRefusal(
  code: RetentionRefusalCode,
  sentence: string,
  remedy: string,
): RetentionRefusal {
  const r = RULES[code];
  return { ok: false, code, sentence, rule: r.rule, ruleText: r.ruleText, remedy };
}

export const RETENTION_REFUSAL_CODES = Object.keys(RULES) as RetentionRefusalCode[];

/* ════════ §3 THE RECONCILIATION, IN WORDS ════════ */

/**
 * How Art 17 erasure and the inferred Art 68(9) record are reconciled. Returned in
 * the posture payload, not merely commented here, because the reader who needs it is
 * the operator answering an erasure request — and because a reconciliation nobody can
 * read is a reconciliation nobody can check.
 */
export const RETENTION_ERASURE_RECONCILIATION =
  'ERASURE AND THE RECORD ARE RECONCILED BY WHOSE WORDS THEY ARE. On an Art 17 request the '
  + 'stranger\'s words go: their inbound rows are deleted, drafts cascade with them (0046), and any '
  + 'excerpt of their message carried inside an LCX record is NULLed and stamped '
  + 'context_minimised_at. LCX\'s own cleared statements STAY, under Art 17(3)(b) — processing '
  + 'necessary for compliance with a legal obligation, here the retention inferred from MiCA Art '
  + '68(9) — and the count and the exemption are REPORTED to the subject rather than kept quiet; '
  + 'silently retaining them would be the actual violation. What remains linking the two is a '
  + 'sha256 of the inbound context, not its text, so a later paste-back can still be proved '
  + 'identical without holding a stranger\'s words for five years. The one case where the two '
  + 'duties genuinely collide is an inbound row that an LCX statement depends on and that nobody '
  + 'has recorded yet: the row is held with its body minimised, it appears in the jeopardy list '
  + 'until resolved, and after the grace period it escalates rather than persisting — because '
  + '"retained for compliance" with no end date is exactly what storage limitation forbids.';

/* ════════ §4 THE JEOPARDY READ ════════ */

/** Days ahead the posture looks for statements about to be destroyed. */
export const JEOPARDY_HORIZON_DAYS = 14;

/**
 * How long a row may be held past its expiry because an unrecorded LCX statement
 * depends on it. After this the refusal escalates: a compliance hold with no end
 * date is the thing GDPR Art 5(1)(e) exists to stop.
 */
export const JEOPARDY_GRACE_DAYS = 30;

const DAY_MS = 86_400_000;

export interface JeopardyRow {
  readonly replyId: number;
  readonly xCommentId: string | null;
  readonly status: string;
  readonly retentionExpiresAt: string;
  /** Negative when already past expiry and waiting on a sweep. */
  readonly daysUntilExpiry: number;
  readonly approvedDrafts: number;
}

/**
 * The inbound rows whose deletion would destroy an LCX statement nobody recorded.
 *
 * THE PREDICATE, AND WHY EACH HALF IS THERE:
 *   · an APPROVED draft exists (`marketing_reply_draft.status = 'approved'`), which
 *     is the closest thing this compartment has to "LCX said something here". It is
 *     not proof of publication — approval is not publication, and no button posts —
 *     but a cleared statement is exactly what Art 8(2) asks to be produced.
 *   · AND no `marketing_record` row carries this `x_comment_id`, i.e. the LCX side
 *     was never placed on the long clock.
 *   · AND the row expires within the horizon.
 *
 * `x_comment_id` is the join because 0061 deliberately used a value link and not a
 * foreign key: the record must survive the deletion of the row it answered.
 *
 * REFUSES RATHER THAN RETURNING AN EMPTY LIST when either register is absent. An
 * empty jeopardy list on an environment with no `marketing_record` table would read
 * as "nothing is at risk" when the truth is that EVERYTHING is — nothing can be on
 * the long clock at all.
 */
export async function readJeopardy(
  pool: Pool,
  opts: { now: Date; horizonDays?: number },
): Promise<RetentionResult<JeopardyRow[]>> {
  const horizon = opts.horizonDays ?? JEOPARDY_HORIZON_DAYS;
  if (!(await isQueueMigrated(pool))) {
    return retentionRefusal(
      'RETENTION_QUEUE_ABSENT',
      `Jeopardy cannot be computed: migration ${QUEUE_MIGRATION_REQUIRED} is not applied here, so `
      + 'there is no inbound queue to look at.',
      `Apply ${QUEUE_MIGRATION_REQUIRED}.`,
    );
  }
  if (!(await isRecordMigrated(pool))) {
    return retentionRefusal(
      'RETENTION_RECORD_REGISTER_ABSENT',
      `Every approved statement on this environment is in jeopardy, not none: migration `
      + `${RECORD_MIGRATION_REQUIRED} is not applied, so no statement can be on the five-year `
      + 'clock and the 90-day sweep is the only clock running.',
      `Apply ${RECORD_MIGRATION_REQUIRED}, then record the statements already approved before `
      + 'their inbound rows expire.',
    );
  }

  const cutoff = new Date(opts.now.getTime() + horizon * DAY_MS).toISOString();
  const res = await pool.query(
    `SELECT r.id,
            r.x_comment_id,
            r.status,
            r.retention_expires_at,
            count(d.id) FILTER (WHERE d.status = 'approved') AS approved_drafts
       FROM marketing_x_reply r
       JOIN marketing_reply_draft d ON d.reply_id = r.id
      WHERE r.retention_expires_at <= $1
        AND d.status = 'approved'
        AND NOT EXISTS (
              SELECT 1 FROM marketing_record m
               WHERE m.x_comment_id IS NOT NULL
                 AND m.x_comment_id = r.x_comment_id
            )
      GROUP BY r.id, r.x_comment_id, r.status, r.retention_expires_at
      ORDER BY r.retention_expires_at, r.id`,
    [cutoff],
  );

  const rows = (res.rows as Array<{
    id: number | string;
    x_comment_id: string | null;
    status: string;
    retention_expires_at: string | Date;
    approved_drafts: number | string;
  }>).map((r) => {
    const expiresAt = r.retention_expires_at instanceof Date
      ? r.retention_expires_at
      : new Date(String(r.retention_expires_at));
    return {
      replyId: Number(r.id),
      xCommentId: r.x_comment_id ?? null,
      status: String(r.status),
      retentionExpiresAt: expiresAt.toISOString(),
      // Floor, not round: 0.9 days left is 0 days left to anyone acting on this.
      daysUntilExpiry: Math.floor((expiresAt.getTime() - opts.now.getTime()) / DAY_MS),
      approvedDrafts: Number(r.approved_drafts ?? 0),
    };
  });
  return { ok: true, value: rows };
}

/* ════════ §5 THE POSTURE ════════ */

export interface ClockState {
  readonly cls: 'third_party_content' | 'lcx_statement';
  readonly register: string;
  readonly registerPresent: boolean;
  readonly periodDays: number | null;
  readonly periodYears: number | null;
  readonly basis: string;
  /** Null when the register is absent or unreadable. NEVER 0 for "could not look". */
  readonly dueForSweep: number | null;
  readonly refusals: readonly RetentionRefusal[];
}

export interface RetentionPostureValue {
  readonly asOf: string;
  /**
   * The ruling in force, returned rather than described. An operator reading this
   * payload is entitled to see WHICH policy produced the numbers below and that nobody
   * has signed it.
   */
  readonly policy: RetentionPolicy;
  readonly shortClock: ClockState;
  readonly longClock: ClockState;
  readonly lastRunAt: string | null;
  readonly lastRunBy: string | null;
  readonly runsRecorded: number | null;
  readonly jeopardy: readonly JeopardyRow[] | null;
  readonly jeopardyHorizonDays: number;
  readonly erasureReconciliation: string;
  readonly inferenceCaveat: string;
  readonly dpoRulingOutstanding: string;
  readonly refusals: readonly RetentionRefusal[];
}

/** How long a run may be stale before the clock is reported as not keeping its period. */
export const CLOCK_STALE_AFTER_DAYS = 7;

/**
 * What the two clocks are doing, and what is provable about them.
 *
 * ALWAYS ANSWERS. There is no refusal at the top level: an operator asking "is
 * retention running?" on an unmigrated environment needs the answer "no, and here is
 * why", not a 503. The refusals ride inside, per clock and at the top, and every
 * count that could not be observed is `null` rather than `0`.
 */
export async function retentionPosture(
  pool: Pool,
  opts?: { now?: Date; horizonDays?: number },
): Promise<RetentionPostureValue> {
  const now = opts?.now ?? new Date();
  const horizon = opts?.horizonDays ?? JEOPARDY_HORIZON_DAYS;
  const top: RetentionRefusal[] = [];

  /*
   * The two sweeps are still two, so this stands on every response — but it no longer says
   * the record can be lost. `service.ts sweepExpired` carries the same jeopardy predicate
   * and HOLDS those rows; what it cannot do is minimise them, because `body_hash` arrives
   * with 0064. So the residual defect is late erasure of a third party's text, not the
   * destruction of LCX's record, and the sentence says which.
   */
  top.push(retentionRefusal(
    'RETENTION_COMPETING_SWEEP',
    'A second sweep runs on the mail tick. It now HOLDS an expired row carrying an unrecorded '
    + 'LCX statement rather than deleting it, so the record survives — but it cannot minimise the '
    + 'third party\'s words, so a held row keeps its text past ninety days until this clock runs.',
    'Apply 0064_marketing_retention.sql and run POST /v1/marketing/retention/run, which replaces '
    + 'the held bodies with a sha256. Recording statements at clearance time removes the conflict '
    + 'entirely, because a recorded statement puts nothing in jeopardy.',
  ));
  /*
   * The policy is now written down and it is still unsigned, so this refusal names the
   * document and the constant instead of restating the split in prose that could drift
   * from either. `signedByDpo` is read, not assumed: if a DPO ever signs, this stops
   * claiming they have not.
   */
  top.push(retentionRefusal(
    'RETENTION_DPO_RULING_PENDING',
    RETENTION_POLICY.signedByDpo === null
      ? `The retention ruling in force is "${RETENTION_POLICY.label}" (${RETENTION_POLICY.document}, `
        + `written ${RETENTION_POLICY.decidedOn}), and NO DPO HAS SIGNED IT. It is the default this `
        + 'system implements, not a decision anybody took.'
      : `The retention ruling in force is "${RETENTION_POLICY.label}", signed by `
        + `${RETENTION_POLICY.signedByDpo} — recorded here so the basis of the numbers below is `
        + 'attributable to a person.',
    'Obtain the DPO ruling named in RETENTION_DPO_RULING_OUTSTANDING. To change what this system '
    + 'does, change RETENTION_POLICY in apps/api/src/marketing/retention.ts and RETENTION_POLICY.md '
    + 'together — retention_basis is recorded per row so a later ruling can be applied precisely.',
  ));

  const ledgerPresent = await isRetentionMigrated(pool);
  const queuePresent = await isQueueMigrated(pool);
  const recordPresent = await isRecordMigrated(pool);

  /* ── the short clock ── */
  const shortRefusals: RetentionRefusal[] = [];
  const days = thirdPartyRetentionDays();
  let periodDays: number | null = null;
  if (days.ok) {
    periodDays = days.value;
  } else {
    shortRefusals.push(retentionRefusal(
      'RETENTION_PERIOD_UNDEFINED',
      days.sentence,
      'Fix MARKETING_RETENTION_DAYS. Until it parses, the period this system enforces is not a '
      + 'number anybody chose.',
    ));
  }

  let shortDue: number | null = null;
  if (!queuePresent) {
    shortRefusals.push(retentionRefusal(
      'RETENTION_QUEUE_ABSENT',
      `The inbound queue does not exist here, so the short clock governs nothing and the count `
      + 'below is unknown rather than zero.',
      `Apply ${QUEUE_MIGRATION_REQUIRED}.`,
    ));
  } else {
    try {
      const res = await pool.query(
        `SELECT count(*)::int AS n FROM marketing_x_reply WHERE retention_expires_at < $1`,
        [now.toISOString()],
      );
      shortDue = Number((res.rows[0] as { n?: number } | undefined)?.n ?? 0);
    } catch {
      shortRefusals.push(retentionRefusal(
        'RETENTION_QUEUE_ABSENT',
        'The inbound queue could not be counted, so how many rows are past expiry is unknown.',
        'Check the database. An unanswerable count is not a count of zero.',
      ));
    }
  }

  /* ── the long clock ── */
  const longRefusals: RetentionRefusal[] = [];
  let longDue: number | null = null;
  if (!recordPresent) {
    longRefusals.push(retentionRefusal(
      'RETENTION_RECORD_REGISTER_ABSENT',
      `There is no five-year clock on this environment: migration ${RECORD_MIGRATION_REQUIRED} is `
      + 'not applied, so nothing LCX said is retained at all and the short clock is the only one '
      + 'running.',
      `Apply ${RECORD_MIGRATION_REQUIRED}. This is the gap that leaves the compartment retaining `
      + 'nothing on day 91.',
    ));
  } else {
    try {
      const res = await pool.query(
        `SELECT count(*)::int AS n FROM marketing_record
          WHERE retention_expires_at < $1
            AND legal_hold = false
            AND (legal_hold_until IS NULL OR legal_hold_until < $1)`,
        [now.toISOString()],
      );
      longDue = Number((res.rows[0] as { n?: number } | undefined)?.n ?? 0);
    } catch {
      longRefusals.push(retentionRefusal(
        'RETENTION_RECORD_REGISTER_ABSENT',
        'The record register could not be counted, so how many records are past retention is '
        + 'unknown.',
        'Check the database.',
      ));
    }
  }

  /* ── the evidence that the clock runs at all ── */
  let lastRunAt: string | null = null;
  let lastRunBy: string | null = null;
  let runsRecorded: number | null = null;
  if (!ledgerPresent) {
    top.push(retentionRefusal(
      'RETENTION_LEDGER_ABSENT',
      `Whether retention has ever run here cannot be answered: migration ${RETENTION_MIGRATION} is `
      + 'not applied, so there is no run ledger.',
      `Apply ${RETENTION_MIGRATION}. Until then a sweep can delete rows and leave no evidence.`,
    ));
  } else {
    try {
      const res = await pool.query(
        `SELECT count(*)::int AS n,
                max(ran_at) AS last_at
           FROM marketing_retention_run
          WHERE mode = 'enforce'`,
      );
      const row = (res.rows[0] ?? {}) as { n?: number; last_at?: string | Date | null };
      runsRecorded = Number(row.n ?? 0);
      if (row.last_at) {
        const at = row.last_at instanceof Date ? row.last_at : new Date(String(row.last_at));
        lastRunAt = at.toISOString();
        const who = await pool.query(
          `SELECT ran_by FROM marketing_retention_run
            WHERE mode = 'enforce' ORDER BY ran_at DESC LIMIT 1`,
        );
        lastRunBy = ((who.rows[0] as { ran_by?: string } | undefined)?.ran_by) ?? null;
        if (now.getTime() - at.getTime() > CLOCK_STALE_AFTER_DAYS * DAY_MS) {
          top.push(retentionRefusal(
            'RETENTION_CLOCK_STALE',
            `The last enforcing run was ${lastRunAt}, more than ${CLOCK_STALE_AFTER_DAYS} days ago, `
            + 'so rows past their stated expiry are still held.',
            'Run the clock, and schedule it independently of the mail tick so one disabled cron '
            + 'cannot stop retention.',
          ));
        }
      } else {
        top.push(retentionRefusal(
          'RETENTION_CLOCK_NEVER_RAN',
          'The run ledger is present and empty, so on the evidence available this clock has never '
          + 'executed and nothing has ever been swept by it.',
          'Run it once with mode=enforce, then schedule it. A period nobody enforces is not a '
          + 'retention policy.',
        ));
      }
    } catch {
      top.push(retentionRefusal(
        'RETENTION_LEDGER_ABSENT',
        'The run ledger could not be read, so whether retention has run is unknown rather than no.',
        'Check the database.',
      ));
    }
  }

  /* ── jeopardy ── */
  const jeopardyRead = await readJeopardy(pool, { now, horizonDays: horizon });
  let jeopardy: readonly JeopardyRow[] | null = null;
  if (jeopardyRead.ok) {
    jeopardy = jeopardyRead.value;
    if (jeopardy.length > 0) {
      top.push(retentionRefusal(
        'RETENTION_STATEMENTS_IN_JEOPARDY',
        `${jeopardy.length} inbound row(s) carry an approved LCX statement with no row in the record `
        + 'register, and the short clock is about to destroy them.',
        'Record each statement (POST /v1/marketing/record) or record the decision not to. What the '
        + `next enforcing run does with them is the ruling in force: ${RETENTION_POLICY.label} `
        + `(${RETENTION_POLICY.expiredWithUnrecordedStatement}).`,
      ));
      const pastGrace = jeopardy.filter(
        (r) => r.daysUntilExpiry < -JEOPARDY_GRACE_DAYS,
      );
      if (pastGrace.length > 0) {
        top.push(retentionRefusal(
          'RETENTION_JEOPARDY_PAST_GRACE',
          `${pastGrace.length} row(s) have been held more than ${JEOPARDY_GRACE_DAYS} days past `
          + 'expiry for the sake of an unrecorded statement, which is indefinite retention with a '
          + 'compliance label on it.',
          'Record the statements, or have a named human accept the loss of the record in writing '
          + 'and release the rows.',
        ));
      }
    }
  } else {
    top.push(jeopardyRead);
  }

  return {
    asOf: now.toISOString(),
    policy: RETENTION_POLICY,
    shortClock: {
      cls: 'third_party_content',
      register: 'marketing_x_reply',
      registerPresent: queuePresent,
      periodDays,
      periodYears: null,
      basis: 'GDPR Art 5(1)(c) minimisation and Art 5(1)(e) storage limitation, as implemented by '
        + 'migration 0046: retention is a property of the row, not of remembering to run a script.',
      dueForSweep: shortDue,
      refusals: shortRefusals,
    },
    longClock: {
      cls: 'lcx_statement',
      register: 'marketing_record',
      registerPresent: recordPresent,
      periodDays: null,
      /* From the ruling, not from a second copy of the number: if the policy moves the
       * period, the posture reports the period the sweep will actually keep. */
      periodYears: RETENTION_POLICY.lcxStatementYears,
      basis: RETENTION_BASIS,
      dueForSweep: longDue,
      refusals: longRefusals,
    },
    lastRunAt,
    lastRunBy,
    runsRecorded,
    jeopardy,
    jeopardyHorizonDays: horizon,
    erasureReconciliation: RETENTION_ERASURE_RECONCILIATION,
    inferenceCaveat: RETENTION_INFERENCE_CAVEAT,
    dpoRulingOutstanding: RETENTION_DPO_RULING_OUTSTANDING,
    refusals: top,
  };
}

/* ════════ §6 THE RUN ════════ */

export interface SweepReportValue {
  readonly ranAt: string;
  readonly ranBy: string;
  readonly mode: 'dry_run' | 'enforce';
  /** The ruling this run executed, returned so the counts below can be read against it. */
  readonly policy: RetentionPolicy;
  readonly thirdPartyRowsDeleted: number | null;
  readonly thirdPartyRowsMinimised: number | null;
  /** Rows held with their text intact. Non-zero only under a policy that says so. */
  readonly thirdPartyRowsHeldIntact: number | null;
  readonly recordRowsExpired: number | null;
  readonly jeopardy: readonly JeopardyRow[];
  readonly recorded: boolean;
  readonly refusals: readonly RetentionRefusal[];
}

/** The text a minimised body is replaced with. Never the original, never blank-and-silent. */
export const MINIMISED_BODY_MARKER =
  '[minimised: third-party content removed on the retention clock; sha256 retained in body_hash '
  + 'so a later paste-back can be proved identical]';

/** Why a collision row is held. LCX's own sentence about LCX's own decision. */
export const JEOPARDY_HOLD_REASON =
  'held past expiry: an approved LCX statement on this reply is not yet in '
  + 'marketing_record, so deleting the row would destroy the record MiCA requires';

/** Why an ordinary expired row is held when the ruling in force keeps everything. */
export const POLICY_HOLD_REASON =
  'held past expiry by the retention policy of record (see RETENTION_POLICY.md): the ruling in '
  + 'force retains this row rather than deleting it on the short clock';

/**
 * Replace bodies with `MINIMISED_BODY_MARKER`, keeping the sha256.
 *
 * THE HASH IS COMPUTED IN NODE, NOT IN SQL, and that is a deliberate choice rather than
 * a round trip nobody noticed: `digest()` lives in pgcrypto, which is an extension that
 * may not be enabled in this schema, and a retention sweep that throws `function
 * digest(text, unknown) does not exist` on a production database is a sweep that
 * silently stops running. `sha256Hex` is the one hash this compartment uses everywhere
 * else, so the value is comparable with every other hash in the record.
 *
 * `body_minimised_at IS NULL` twice — once to choose the rows, once in the UPDATE — so a
 * second run neither re-hashes a marker nor counts a row it already minimised.
 */
async function minimiseRows(
  pool: Pool,
  ids: readonly number[],
  now: Date,
  reason: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const held = await pool.query(
    `SELECT id, body FROM marketing_x_reply
      WHERE id = ANY($1::bigint[]) AND body_minimised_at IS NULL`,
    [ids],
  );
  const targets: number[] = [];
  const hashes: string[] = [];
  for (const row of held.rows as Array<{ id: number | string; body: string | null }>) {
    targets.push(Number(row.id));
    hashes.push(sha256Hex(row.body ?? ''));
  }
  if (targets.length === 0) return 0;
  const res = await pool.query(
    `UPDATE marketing_x_reply AS r
        SET body = $2,
            body_hash = COALESCE(r.body_hash, v.hash),
            body_minimised_at = COALESCE(r.body_minimised_at, $3),
            retention_hold_reason = $4
       FROM (SELECT * FROM unnest($1::bigint[], $5::text[]) AS t(id, hash)) AS v
      WHERE r.id = v.id
        AND r.body_minimised_at IS NULL`,
    [targets, MINIMISED_BODY_MARKER, now.toISOString(), reason, hashes],
  );
  return res.rowCount ?? 0;
}

/**
 * Hold rows with their text INTACT, stating why.
 *
 * The body is not touched and no hash is written: under a retain-everything ruling the
 * words themselves are what is being kept, and writing a digest of text you still hold
 * would be theatre. `retention_hold_reason IS NULL` keeps the count to rows newly held,
 * so a daily run does not report the same row every day as though it just decided.
 */
async function holdRowsIntact(
  pool: Pool,
  ids: readonly number[],
  reason: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await pool.query(
    `UPDATE marketing_x_reply
        SET retention_hold_reason = $2
      WHERE id = ANY($1::bigint[])
        AND retention_hold_reason IS NULL`,
    [ids, reason],
  );
  return res.rowCount ?? 0;
}

/**
 * RUN BOTH CLOCKS, IN THIS ORDER, AND RECORD THAT IT HAPPENED.
 *
 * ORDERING IS THE CORRECTNESS ARGUMENT, not an optimisation:
 *   1. read jeopardy FIRST, while the rows still exist. After the delete there is
 *      nothing left to name and the report would be silent about what it destroyed.
 *   2. MINIMISE the jeopardy rows — body replaced by its hash, `body_minimised_at`
 *      and `retention_hold_reason` stamped. The stranger's words go on schedule; the
 *      row survives so the LCX statement it evidences can still be reconstructed.
 *   3. DELETE the other expired inbound rows. Drafts cascade (0046).
 *   4. Sweep expired LCX records, skipping legal holds (Art 68(9)'s seven years).
 *   5. Write the ledger row.
 *
 * `mode: 'dry_run'` computes 1 and reports what 2-4 WOULD do, touching nothing. It is
 * the default an operator should use first, and it still writes a ledger row —
 * knowing somebody looked is worth recording.
 *
 * REFUSES BEFORE IT DELETES when the ledger is absent. A destructive job that cannot
 * be evidenced is one this system will not run: that is the same rule 0061 applies to
 * erasure, and a sweep leaves even less behind to inspect afterwards.
 */
export async function runRetentionClock(
  pool: Pool,
  input: {
    ranBy: string;
    mode?: 'dry_run' | 'enforce';
    now?: Date;
    horizonDays?: number;
    /**
     * The ruling to execute. Defaults to `RETENTION_POLICY`, the policy of record, which
     * is what every caller in this repository uses. The parameter exists so a test can
     * drive the alternatives without editing the ruling — NOT so a route can choose a
     * retention policy per request, which would make the ruling unknowable after the
     * fact.
     */
    policy?: RetentionPolicy;
  },
): Promise<RetentionResult<SweepReportValue>> {
  const now = input.now ?? new Date();
  const mode = input.mode ?? 'dry_run';
  const policy = input.policy ?? RETENTION_POLICY;
  const shape = retentionPolicySweepShape(policy);
  const ranBy = (input.ranBy ?? '').trim();
  if (ranBy === '') {
    return retentionRefusal(
      'RETENTION_ACTOR_UNNAMED',
      'The retention clock will not run unattributed: a run that deletes rows needs a named human '
      + 'or a named job behind it.',
      'Pass the member id of the operator, or the scheduled job\'s identifier.',
    );
  }
  if (!(await isRetentionMigrated(pool))) {
    return retentionRefusal(
      'RETENTION_LEDGER_ABSENT',
      `No retention run will execute: migration ${RETENTION_MIGRATION} is not applied, so the run `
      + 'could not be recorded and an unrecorded deletion is indistinguishable from data loss.',
      `Apply ${RETENTION_MIGRATION} first. The rows stay until the sweep can be evidenced.`,
    );
  }
  if (!(await isQueueMigrated(pool))) {
    return retentionRefusal(
      'RETENTION_QUEUE_ABSENT',
      `No retention run will execute: migration ${QUEUE_MIGRATION_REQUIRED} is not applied, so `
      + 'there is no inbound queue to sweep.',
      `Apply ${QUEUE_MIGRATION_REQUIRED}.`,
    );
  }

  const refusals: RetentionRefusal[] = [];

  /* 1. jeopardy, BEFORE anything is destroyed. */
  const jeopardyRead = await readJeopardy(pool, { now, horizonDays: 0 });
  let jeopardy: JeopardyRow[] = [];
  if (jeopardyRead.ok) {
    jeopardy = jeopardyRead.value;
  } else {
    // The record register is absent or the queue is unreadable. Either way this run
    // must NOT delete: it cannot tell which rows carry an unrecorded statement, and
    // deleting blind is precisely how the MiCA record was lost in the first place.
    return jeopardyRead;
  }
  /*
   * WHICH ROWS THE DELETE MUST NOT REACH. Under the policy of record the collision rows
   * are protected by ID, not by predicate: a predicate re-evaluated at delete time could
   * drift from the one jeopardy was read with, and these are exactly the rows that must
   * not be lost to a race. Under a ruling that says delete them, this list is EMPTY and
   * they go with the rest — the policy decides, this function does not.
   */
  const heldIds = shape.protectsUnrecordedStatements ? jeopardy.map((r) => r.replyId) : [];

  let minimised: number | null = null;
  let heldIntact: number | null = null;
  let deleted: number | null = null;
  let recordsExpired: number | null = null;

  if (mode === 'enforce') {
    minimised = 0;
    heldIntact = 0;

    /* 2. the collision rows, disposed of as the ruling in force says. */
    if (policy.expiredWithUnrecordedStatement === 'minimise_and_hold') {
      minimised += await minimiseRows(pool, heldIds, now, JEOPARDY_HOLD_REASON);
    } else if (policy.expiredWithUnrecordedStatement === 'hold_intact') {
      heldIntact += await holdRowsIntact(pool, heldIds, JEOPARDY_HOLD_REASON);
    }
    /* 'delete' needs no statement here: `heldIds` is empty, so step 3 takes them. */

    /* 3. every other expired row. */
    if (policy.expiredOtherwise === 'delete') {
      const del = await pool.query(
        `DELETE FROM marketing_x_reply
          WHERE retention_expires_at < $1
            AND NOT (id = ANY($2::bigint[]))`,
        [now.toISOString(), heldIds],
      );
      deleted = del.rowCount ?? 0;
    } else {
      /* The ruling deletes nothing here, so the rows are resolved to ids and held. The
       * count is 0 because the sweep LOOKED and deleted none — not null, which would
       * mean it could not look. */
      const others = await pool.query(
        `SELECT id FROM marketing_x_reply
          WHERE retention_expires_at < $1
            AND NOT (id = ANY($2::bigint[]))`,
        [now.toISOString(), heldIds],
      );
      const otherIds = (others.rows as Array<{ id: number | string }>).map((r) => Number(r.id));
      if (policy.expiredOtherwise === 'minimise_and_hold') {
        minimised += await minimiseRows(pool, otherIds, now, POLICY_HOLD_REASON);
      } else {
        heldIntact += await holdRowsIntact(pool, otherIds, POLICY_HOLD_REASON);
      }
      deleted = 0;
    }

    /* 4. the long clock, if the ruling runs it at all.
     *
     * TWO GUARDS, and they fail in different directions. Legal holds are skipped
     * because that is what Art 68(9)'s extension is for, and a sweep that ignored it
     * would expire records mid-investigation — that guard is NOT a policy dial, since a
     * competent authority's request is not LCX's choice. The floor is the policy's:
     * `drafted_at` must be at least `lcxStatementYears` in the past before a record can
     * go, so a wrong `retention_expires_at` written by some other path cannot delete a
     * record the ruling says to keep. 0061's CHECK asserts the same floor at write time;
     * this is a second lock on the destructive side of it, not a claim the CHECK is
     * missing. */
    if (!shape.sweepsRecords) {
      refusals.push(retentionRefusal(
        'RETENTION_DPO_RULING_PENDING',
        `The long clock did not run: the retention policy in force (${policy.id}) sweeps no LCX `
        + 'statement at all, so records past their stated expiry are still held.',
        'That is the ruling in RETENTION_POLICY.md. If it is wrong, change RETENTION_POLICY in '
        + 'apps/api/src/marketing/retention.ts and the document together.',
      ));
    } else if (await isRecordMigrated(pool)) {
      const rec = await pool.query(
        `DELETE FROM marketing_record
          WHERE retention_expires_at < $1
            AND drafted_at < ($1::timestamptz - make_interval(years => $2::int))
            AND legal_hold = false
            AND (legal_hold_until IS NULL OR legal_hold_until < $1)`,
        [now.toISOString(), shape.recordFloorYears],
      );
      recordsExpired = rec.rowCount ?? 0;
    } else {
      refusals.push(retentionRefusal(
        'RETENTION_RECORD_REGISTER_ABSENT',
        'The long clock did not run: the record register is absent, so no LCX statement is on it.',
        `Apply ${RECORD_MIGRATION_REQUIRED}.`,
      ));
    }
  }

  if (jeopardy.length > 0) {
    /* The sentence states what the ruling in force ACTUALLY did to these rows. Saying
     * "held rather than deleted" under a policy that deletes them would be a comfortable
     * lie in the one place an operator is reading for the truth. */
    const fate = policy.expiredWithUnrecordedStatement === 'delete'
      ? `DELETED with the rest: the retention policy in force (${policy.id}) grants them no `
        + 'exception, so the record of what LCX said on each is gone'
      : policy.expiredWithUnrecordedStatement === 'hold_intact'
        ? 'held rather than deleted, with their third-party body intact'
        : 'held rather than deleted, with their third-party body minimised to a sha256';
    refusals.push(retentionRefusal(
      'RETENTION_STATEMENTS_IN_JEOPARDY',
      `${jeopardy.length} row(s) were ${fate}, because an approved LCX statement on each has never `
      + 'been recorded.',
      'Record the statements (POST /v1/marketing/record). Until that happens the disposition is '
      + `whatever RETENTION_POLICY.md rules — today, ${policy.label}.`,
    ));
    const pastGrace = jeopardy.filter((r) => r.daysUntilExpiry < -JEOPARDY_GRACE_DAYS);
    /* Only a ruling that HOLDS can hold too long. Under a delete ruling these rows are
     * gone in this very run, and telling an operator to "release the rows" would be
     * advice about rows that no longer exist. */
    if (pastGrace.length > 0 && shape.protectsUnrecordedStatements) {
      refusals.push(retentionRefusal(
        'RETENTION_JEOPARDY_PAST_GRACE',
        `${pastGrace.length} of those have been held more than ${JEOPARDY_GRACE_DAYS} days past `
        + 'expiry, which is no longer a short operational hold.',
        'Record the statements or accept the loss of the record in writing, in a named human\'s '
        + 'words, and release the rows.',
      ));
    }
  }

  /* 5. the ledger row. */
  let recorded = false;
  try {
    await pool.query(
      `INSERT INTO marketing_retention_run
         (ran_at, ran_by, mode, third_party_rows_deleted, third_party_rows_minimised,
          record_rows_expired, jeopardy_rows, refusal_codes, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        now.toISOString(),
        ranBy,
        mode,
        deleted,
        minimised,
        recordsExpired,
        jeopardy.length,
        refusals.map((r) => r.code),
        /* The ruling goes in the ledger. 0064 has no column for it and this file adds no
         * migration, so it rides in `notes` — which is enough to answer "under which
         * policy was this row deleted?" months later, and that question WILL be asked
         * the first time the ruling changes. `third_party_rows_held_intact` has no
         * column either: it is in the response and in this note, not invented in SQL. */
        `policy=${policy.id} (${policy.document}, unsigned)`
        + (mode === 'dry_run'
          ? '; dry run: nothing was deleted, minimised or held; the counts above are null by design'
          : `; rows held intact=${heldIntact ?? 0}`),
      ],
    );
    recorded = true;
  } catch {
    refusals.push(retentionRefusal(
      'RETENTION_RUN_NOT_RECORDED',
      'The run completed but its ledger row could not be written, so what it did is evidenced only '
      + 'by this response.',
      'Capture these counts by hand and fix the ledger before running again.',
    ));
  }

  return {
    ok: true,
    value: {
      ranAt: now.toISOString(),
      ranBy,
      mode,
      policy,
      thirdPartyRowsDeleted: deleted,
      thirdPartyRowsMinimised: minimised,
      thirdPartyRowsHeldIntact: heldIntact,
      recordRowsExpired: recordsExpired,
      jeopardy,
      recorded,
      refusals,
    },
  };
}

/* ════════ §7 THE HASH USED ACROSS THE BOUNDARY ════════ */

/**
 * The hash that survives minimisation.
 *
 * Re-exported from `record.ts` rather than re-implemented: one compartment, one hash.
 * §6 computes the digest with this same `sha256Hex`, IN NODE — pgcrypto's `digest()` may
 * not be enabled in the schema and a sweep that throws on it stops running silently. So
 * a body does travel to the API to be hashed, once, on the run that minimises it. This
 * function is what a later paste-back is checked against, which is the only reason the
 * hash is worth keeping.
 */
export function inboundBodyHash(body: string): string {
  return sha256Hex(body);
}

/** Art 68(9)'s ceiling, re-exported so a caller need not import two modules for one policy. */
export const RETENTION_CEILING_YEARS = RETENTION_YEARS_MAX;
