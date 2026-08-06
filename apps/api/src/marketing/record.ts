import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
/*
 * IMPORTED RATHER THAN RESTATED, and the reason is written down in `outboundGate.ts`
 * itself: the reference a drafter is told to quote and the row an approver looks it up in
 * are computed from ONE expression, because two would drift and the failure would be
 * silent — the drafter quotes a reference and the lookup finds nothing. This file prints
 * that reference beside every unrecorded statement, so it must be the same function.
 */
import { GATE_MIGRATION, gateReferenceFrom } from './outboundGate.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  M7 — THE RECORD. Produce-on-demand, or it is not a record.
 * ══════════════════════════════════════════════════════════════════════════════
 *  MiCA Art 8(3) forbids competent authorities from requiring PRIOR APPROVAL of a
 *  marketing communication. Art 8(2) requires that communications be "notified to
 *  the competent authority of the home Member State AND to the competent authority
 *  of the host Member State, when addressing prospective holders ... in those
 *  Member States" — upon request. Art 7(3) is why that plural matters: the
 *  authority that asks need not be the FMA.
 *
 *  So there is no pre-clearance regime to satisfy and exactly one duty that bites:
 *  produce, later, on demand, filtered by time window and by Member State. That
 *  makes the export bundle CORE FUNCTIONALITY. A compartment that can draft
 *  perfectly and cannot produce is a compartment that fails the only test it will
 *  ever actually be given.
 *
 *  WHAT A BUNDLE MUST CARRY, and every item is a field below rather than a hope:
 *  who wrote it, who cleared it (and that the two are different humans), which
 *  pre-approved claims it used AND AT WHICH VERSION, what the desk knew at the time,
 *  and every refusal that fired on the way — including the ones an approver recorded
 *  and proceeded past, with their name attached.
 *
 *  THE PROPERTY THIS FILE IS BUILT AROUND: a bundle STATES ITS OWN COMPLETENESS.
 *  If a fact could not be reconstructed, the bundle says which fact and why, in the
 *  printed output, next to the record it belongs to. Quiet omission is the failure
 *  mode that turns a record into a misrepresentation, and it is the one a reader
 *  cannot detect. Everything reconstructable is reconstructed; everything else is
 *  named.
 *
 *  RETENTION, AND THE CONTRADICTION IT SITS ON. Five years extendable to seven is
 *  read off Art 68(9), which is a CASP records article and does not say the word
 *  "marketing". It reaches marketing communications by function, not by name, and
 *  MiCA sets no express period for them. That is an INFERENCE and this file carries
 *  it as one: `RETENTION_BASIS` names the theory, `RETENTION_INFERENCE_CAVEAT` is
 *  printed in every bundle, and neither is allowed to read as a citation. It also
 *  DIRECTLY CONTRADICTS the 90-day cascade in 0046, which cannot both be right for
 *  the same bytes. The split implemented here — LCX's own statements retained long,
 *  third-party content minimised on the existing sweep — is an interim engineering
 *  answer, NOT a legal ruling. THE OWNER STILL OWES A DPO RULING (see the 0061
 *  header and `RETENTION_DPO_RULING_OUTSTANDING`).
 *
 *  GDPR, because the queue holds third parties' handles and their words. What was
 *  true before this file: lawful basis Art 6(1)(f) with no legitimate-interests
 *  assessment on file, notice under Art 14 with no privacy notice to point at, no
 *  erasure path, no access path, `author_handle` unindexed, and the OpenRouter
 *  transfer unrecorded per row. This file builds the erasure and access paths and
 *  the transfer register; 0061 adds the index and the columns that make the two
 *  remaining gaps queryable rather than forgotten. Per-handle scoring over time is
 *  refused outright until a DPIA reference exists (Art 35(3)(a) evaluation or
 *  scoring) — the refusal is the control, not this comment.
 *
 *  ── ON THE SHARED VOCABULARY, STATED PLAINLY ──
 *  The engine vocabulary lives in `packages/shared/src/marketing/types.ts`
 *  (`RefusalCode`, `Refusal`, `RuleCitation`, `MarketingRegime`, ...) and this file
 *  does NOT restate it. It cannot yet IMPORT it either: `packages/shared/src/index.ts`
 *  does not export `marketing/`, and apps/api can only reach the package barrel
 *  (`rootDir: src`, single `.` export). So the refusals below are a flat, JSON-shaped
 *  I/O boundary type carrying codes that do not exist in the shared union — every one
 *  is about the REGISTER (absent, empty, unverifiable), not about content. When the
 *  barrel wiring lands, `RecordRefusalCode` folds into `RefusalCode` and `rule` +
 *  `ruleText` fold into `RuleCitation`; the fields map one-to-one on purpose.
 *
 *  Every statement here is parameterised. No identifier or value is concatenated
 *  into SQL — standing rule since the platform's red-team pass, and this compartment
 *  ingests text from the open internet.
 */

/* ════════ §1 THE MIGRATION GATE ════════ */

/** The file a human must paste into the Supabase SQL editor. Named on every refusal. */
export const RECORD_MIGRATION = '0061_marketing_record.sql';

/**
 * Has 0061 landed here?
 *
 * Same reason as `isMigrated` in `service.ts`: production applies migrations by hand
 * against credentials this repository does not hold, so there is a window where the
 * code is live and the tables are not, and that window must read as "one migration
 * outstanding" rather than as an outage.
 *
 * ONE DELIBERATE DIFFERENCE FROM `service.ts`, and it is a defect fix rather than a
 * style choice: a FALSE is never cached. `service.ts:52-57` caches `false` on ANY
 * error, so a single database blip permanently convinces the process that the
 * migration is missing until someone redeploys. Here only a TRUE is memoised —
 * a true cannot become false without a migration, and a migration means a restart.
 */
let recordMigratedCache: true | null = null;

export async function isRecordMigrated(pool: Pool): Promise<boolean> {
  if (recordMigratedCache === true) return true;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_record') IS NOT NULL AS ok`,
    );
    const ok = Boolean(res.rows[0]?.ok);
    if (ok) recordMigratedCache = true;
    return ok;
  } catch {
    // Not cached. A database that cannot answer this question today may answer it
    // in thirty seconds, and pretending otherwise for the life of the process is how
    // 0046 taught the desk to distrust its own status line.
    return false;
  }
}

/** Test-only: forget the probe. */
export function _resetRecordMigrated(): void {
  recordMigratedCache = null;
}

/* ════════ §2 REFUSALS ════════ */

/**
 * Codes this layer can emit. All of them are about the REGISTER rather than about
 * the words in a draft — which is why none of them duplicates a code in the shared
 * `RefusalCode` union, and why they belong here until the barrel exports it.
 */
export type RecordRefusalCode =
  /** 0061 is not applied on this environment. */
  | 'RECORD_REGISTER_ABSENT'
  /** The register exists and holds nothing for the request. Honest empty, not zero. */
  | 'RECORD_REGISTER_EMPTY'
  /** from/to missing, unparsable, or inverted. */
  | 'RECORD_WINDOW_INVALID'
  /** A specific record was asked for by uid and does not exist. */
  | 'RECORD_NOT_FOUND'
  /** Stored bytes disagree with the stored hash. The bundle may not claim integrity. */
  | 'RECORD_INTEGRITY_BROKEN'
  /** No hash was ever written, so integrity cannot be asserted either way. */
  | 'RECORD_INTEGRITY_UNVERIFIABLE'
  /** An erasure or access request arrived without an identifiable subject. */
  | 'RECORD_SUBJECT_UNIDENTIFIED'
  /** An erasure or access act arrived without a named human accountable for it. */
  | 'RECORD_ACTOR_UNNAMED'
  /** Per-handle scoring over time was requested with no DPIA on file. */
  | 'RECORD_DPIA_ABSENT'
  /** Retention was asked for on an item nobody has classified. */
  | 'RECORD_RETENTION_CLASS_UNKNOWN'
  /** MARKETING_RETENTION_DAYS is not a usable number. */
  | 'RECORD_RETENTION_ENV_INVALID'
  /** A legal hold with no named human and no reason is not a legal hold. */
  | 'RECORD_LEGAL_HOLD_UNACCOUNTABLE'
  /** Something tried to bring a retention expiry FORWARD. Never allowed. */
  | 'RECORD_RETENTION_WOULD_SHORTEN'
  /** A close-out tried to overwrite a different published text. */
  | 'RECORD_CLOSE_OUT_IMMUTABLE'
  /** A close-out arrived with nothing in it. */
  | 'RECORD_CLOSE_OUT_TEXT_ABSENT'
  /** A transfer was logged without saying whether third-party personal data left. */
  | 'RECORD_TRANSFER_SCOPE_UNDECLARED'
  /**
   * 0062 is not applied, so the bundle cannot compare what the desk CLEARED against what
   * it RECORDED. The completeness claim is withdrawn rather than answered with a zero.
   */
  | 'RECORD_CLEARANCE_LEDGER_ABSENT'
  /**
   * The clearance ledger exists and this composition was not handed it. Distinct from
   * ABSENT on purpose: "we did not look" and "there is nothing to look at" are different
   * facts about the same blank space, and only one of them is somebody's fault.
   */
  | 'RECORD_CLEARANCE_LEDGER_UNREAD';

/**
 * The I/O-boundary refusal. Four things, all required: a stable machine code, one
 * sentence an operator can act on, the provision that caused it, and the provision's
 * own words so the refusal is arguable rather than an assertion of authority.
 *
 * `remedy` names who can clear it. Where nobody can, it says so — an unrecoverable
 * refusal dressed as "try again" is a lie shaped like helpfulness.
 */
export interface RecordRefusal {
  readonly ok: false;
  readonly code: RecordRefusalCode;
  readonly sentence: string;
  readonly rule: string;
  readonly ruleText: string;
  readonly remedy: string;
  /**
   * SET ON `RECORD_REGISTER_EMPTY` **AND** ON `RECORD_REGISTER_ABSENT`.
   *
   * An empty register is the day-one state, and refusing with nothing attached would throw
   * away the finding that matters most: the desk cleared statements and recorded none of
   * them. The refusal is still a refusal — a zero-record bundle must not be produced — but
   * it carries the list, so the approver learns WHAT is missing rather than only that
   * something is. `ClearanceReconciliation` is defined in §5a below.
   *
   * IT IS ON `RECORD_REGISTER_ABSENT` FOR THE STRONGER VERSION OF THE SAME REASON. When
   * 0061 is unapplied and 0062 is not, the register cannot hold anything, so 100% of what
   * the gate cleared is unrecordable. Returning only "migration 0061 has not been applied"
   * reads as a configuration nit rather than as the total absence of the register the
   * completeness claim depends on. It is attached in BOTH states of the reconciliation, so
   * a reader can tell "0061 absent and the gate cleared 40 statements" from "0061 absent
   * and we could not read the gate ledger either".
   */
  readonly clearanceReconciliation?: ClearanceReconciliation;
}

export type RecordResult<T> = { readonly ok: true; readonly value: T } | RecordRefusal;

/** The provision behind each code, with its own words. Data, so a panel can list them. */
const RULES: Record<RecordRefusalCode, { rule: string; ruleText: string }> = {
  RECORD_REGISTER_ABSENT: {
    rule: 'MiCA Art 8(2)',
    ruleText:
      'Marketing communications shall, upon request, be notified to the competent authority '
      + 'of the home Member State and to the competent authority of the host Member State.',
  },
  RECORD_REGISTER_EMPTY: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records shall be sufficient to enable competent authorities to fulfil their supervisory '
      + 'tasks and in particular to ascertain whether the CASP has complied with all obligations.',
  },
  RECORD_WINDOW_INVALID: {
    rule: 'MiCA Art 8(2)',
    ruleText:
      'The request is for communications addressing prospective holders in a Member State; '
      + 'the answerable unit is a period, so a period is required.',
  },
  RECORD_NOT_FOUND: {
    rule: 'MiCA Art 68(9)',
    ruleText: 'Records shall be kept of all crypto-asset services and activities undertaken.',
  },
  RECORD_INTEGRITY_BROKEN: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records must be sufficient to ascertain compliance. Bytes that disagree with their '
      + 'own hash establish nothing.',
  },
  RECORD_INTEGRITY_UNVERIFIABLE: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records must be sufficient to ascertain compliance. An unhashed record is a claim '
      + 'about what was said, not evidence of it.',
  },
  RECORD_SUBJECT_UNIDENTIFIED: {
    rule: 'GDPR Art 12(6)',
    ruleText:
      'Where the controller has reasonable doubts concerning the identity of the data subject, '
      + 'it may request the provision of additional information necessary to confirm identity.',
  },
  RECORD_ACTOR_UNNAMED: {
    rule: 'GDPR Art 5(2)',
    ruleText:
      'The controller shall be responsible for, and be able to demonstrate compliance with, '
      + 'the principles — which requires a named human, not a job name.',
  },
  RECORD_DPIA_ABSENT: {
    rule: 'GDPR Art 35(3)(a)',
    ruleText:
      'A data protection impact assessment shall be required in the case of a systematic and '
      + 'extensive evaluation of personal aspects relating to natural persons which is based on '
      + 'automated processing, including profiling.',
  },
  RECORD_RETENTION_CLASS_UNKNOWN: {
    rule: 'GDPR Art 5(1)(e)',
    ruleText:
      'Personal data shall be kept in a form which permits identification of data subjects for '
      + 'no longer than is necessary for the purposes for which it is processed.',
  },
  RECORD_RETENTION_ENV_INVALID: {
    rule: 'GDPR Art 5(1)(e)',
    ruleText:
      'Storage limitation requires a defined period. A retention setting that is not a number '
      + 'is not a period.',
  },
  RECORD_LEGAL_HOLD_UNACCOUNTABLE: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records shall be kept for five years and, where requested by the competent authority '
      + 'before five years have elapsed, for up to seven years.',
  },
  RECORD_RETENTION_WOULD_SHORTEN: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Where requested by the competent authority, records shall be kept for up to seven '
      + 'years. A retention clock that can be wound back cannot honour that request.',
  },
  RECORD_CLOSE_OUT_IMMUTABLE: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records must be sufficient to ascertain compliance; a published text that can be '
      + 'rewritten afterwards records an intention, not a publication.',
  },
  RECORD_CLOSE_OUT_TEXT_ABSENT: {
    rule: 'MiCA Art 8(2)',
    ruleText:
      'What must be produced on request is the communication as published. This system cannot '
      + 'publish, so the published text can only arrive from the human who posted it.',
  },
  RECORD_TRANSFER_SCOPE_UNDECLARED: {
    rule: 'GDPR Art 30(1)(e)',
    ruleText:
      'The record of processing activities shall contain, where applicable, transfers of '
      + 'personal data to a third country, including the identification of that third country.',
  },
  RECORD_CLEARANCE_LEDGER_ABSENT: {
    rule: 'MiCA Art 8(2)',
    ruleText:
      'Marketing communications shall, upon request, be notified to the competent authority '
      + 'of the home Member State and to the competent authority of the host Member State. '
      + 'What must be notified is the communications, not the subset that happens to be on file.',
  },
  RECORD_CLEARANCE_LEDGER_UNREAD: {
    rule: 'MiCA Art 68(9)',
    ruleText:
      'Records shall be sufficient to enable competent authorities to fulfil their supervisory '
      + 'tasks. A production that never compared what was cleared against what was recorded is '
      + 'not sufficient to answer whether it is complete.',
  },
};

/** Build a refusal. `sentence` and `remedy` are always written at the call site. */
export function recordRefusal(
  code: RecordRefusalCode,
  sentence: string,
  remedy: string,
): RecordRefusal {
  const r = RULES[code];
  return { ok: false, code, sentence, rule: r.rule, ruleText: r.ruleText, remedy };
}

export const RECORD_REFUSAL_CODES = Object.keys(RULES) as RecordRefusalCode[];

/* ════════ §3 RETENTION ════════ */

/**
 * WHAT IS RETAINED LONG, AND WHAT IS NOT. This is the split, and it is the only
 * reading under which the 90-day sweep in 0046 and a five-year regulatory record can
 * both stand.
 */
export type RetentionClass = 'lcx_statement' | 'third_party_content';

/**
 * Art 68(9)'s floor, in years. Anything shorter is indefensible.
 *
 * MIRRORS `MICA_RECORD_RETENTION_YEARS` in `packages/shared/src/marketing/types.ts`, which
 * cannot be imported here yet (the package barrel does not export `marketing/`). Two copies
 * of "five years" is how one legal number becomes two, so the agreement is pinned by a test
 * that reads the shared source — see the last describe block in `__tests__/record.test.ts`.
 * Replace both constants with the import the moment the barrel wiring lands.
 */
export const RETENTION_YEARS_BASE = 5;

/** Art 68(9)'s ceiling, reachable only on a competent authority's request. Mirrors `MICA_RECORD_RETENTION_MAX_YEARS`. */
export const RETENTION_YEARS_MAX = 7;

/**
 * The theory a row is retained under — written into `marketing_record.retention_basis`
 * so that a later legal ruling can be applied to exactly the rows it changes.
 */
export const RETENTION_BASIS = 'inferred_art_68_9_plus_art_88_1';

/**
 * Printed in every bundle, verbatim. The point of this string is that a reader of the
 * bundle learns the number is inferred at the same moment they learn the number.
 */
export const RETENTION_INFERENCE_CAVEAT =
  'INFERENCE, NOT CITATION. MiCA sets no express retention period for a CASP\'s marketing '
  + 'communications. Five years extendable to seven is inferred from Art 68(9) (CASP records, '
  + 'which reach marketing by function: records must be sufficient to ascertain compliance with '
  + 'obligations to prospective clients and to market integrity) together with Art 88(1) (the '
  + 'only explicit five-year publication duty in the disclosure space). The inference is '
  + 'defensible and anything shorter is not, but it remains an inference.';

/**
 * The open question, carried in code so it cannot be forgotten by being true only in
 * a plan document. Printed in every bundle alongside the caveat.
 */
export const RETENTION_DPO_RULING_OUTSTANDING =
  'OUTSTANDING DPO RULING: may LCX\'s own published statements be retained past the 90-day '
  + 'sweep in migration 0046, and may a minimised excerpt of the third-party message they '
  + 'answered be retained with them? Until answered, this system retains LCX statements for '
  + 'five years, keeps third-party content on the existing 90-day sweep, and stores only a hash '
  + 'of the inbound context — so a later paste-back can be proved identical without holding a '
  + 'stranger\'s words for five years.';

/** Whole calendar years, so an expiry lands on the same date and not 365 days later. */
function addYears(at: Date, years: number): Date {
  const d = new Date(at.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/**
 * When a record's retention expires. Deterministic: the caller supplies the instant.
 *
 * A `third_party_content` row does NOT belong in `marketing_record` at all — that is
 * the split — so asking for its long retention is a programming error the function
 * refuses rather than answers.
 */
export function retentionExpiry(
  draftedAt: Date,
  cls: RetentionClass,
): RecordResult<{ expiresAt: Date; basis: string; years: number }> {
  if (!(draftedAt instanceof Date) || Number.isNaN(draftedAt.getTime())) {
    return recordRefusal(
      'RECORD_RETENTION_CLASS_UNKNOWN',
      'The record has no usable drafted-at instant, so its retention period cannot be computed.',
      'Supply the instant the statement was drafted. A retention clock with no start is not a clock.',
    );
  }
  if (cls !== 'lcx_statement') {
    return recordRefusal(
      'RECORD_RETENTION_CLASS_UNKNOWN',
      'Only LCX\'s own statements are retained on the five-year clock; third-party content stays '
      + 'on the 90-day sweep in migration 0046 and must not be written to the record register.',
      'Classify the item. If it is a stranger\'s message, it belongs in marketing_x_reply, not here.',
    );
  }
  return {
    ok: true,
    value: {
      expiresAt: addYears(draftedAt, RETENTION_YEARS_BASE),
      basis: RETENTION_BASIS,
      years: RETENTION_YEARS_BASE,
    },
  };
}

/**
 * Third-party retention, read from the environment WITH VALIDATION.
 *
 * `service.ts:15` does `Number(process.env.MARKETING_RETENTION_DAYS ?? '90')` and
 * never checks it, so a typo yields `NaN` and every insert then builds the interval
 * `'NaN days'`. This returns a refusal instead of letting a bad setting become a
 * runtime failure at ingest time — or, worse, an unbounded retention nobody noticed.
 */
export function thirdPartyRetentionDays(raw = process.env.MARKETING_RETENTION_DAYS): RecordResult<number> {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, value: 90 };
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 365 * RETENTION_YEARS_MAX) {
    return recordRefusal(
      'RECORD_RETENTION_ENV_INVALID',
      `MARKETING_RETENTION_DAYS is ${JSON.stringify(raw)}, which is not a whole number of days `
      + `between 1 and ${365 * RETENTION_YEARS_MAX}.`,
      'Fix the environment variable. Until it is a usable number, retention is undefined and '
      + 'third-party content must not be ingested.',
    );
  }
  return { ok: true, value: n };
}

/**
 * Extend retention under a legal hold. Art 68(9)'s "up to seven years", and only
 * ever in one direction.
 *
 * The shortening refusal is the load-bearing one: the named failure is records
 * expiring mid-investigation, and the way that happens is a well-meant "clean up old
 * data" change that moves an expiry forward.
 */
export function extendLegalHold(input: {
  draftedAt: Date;
  currentExpiry: Date;
  until: Date;
  by: string;
  reason: string;
}): RecordResult<{ expiresAt: Date; legalHoldUntil: Date }> {
  const by = (input.by ?? '').trim();
  const reason = (input.reason ?? '').trim();
  if (by === '' || reason === '') {
    return recordRefusal(
      'RECORD_LEGAL_HOLD_UNACCOUNTABLE',
      'A legal hold needs a named human and a reason. Neither may be blank.',
      'Record who placed the hold and which request or matter it answers.',
    );
  }
  if (!(input.until instanceof Date) || Number.isNaN(input.until.getTime())) {
    return recordRefusal(
      'RECORD_LEGAL_HOLD_UNACCOUNTABLE',
      'The hold has no end date, so it is indefinite retention with a compliance label on it.',
      'Give the hold an end date. Art 68(9) extends to seven years, not forever.',
    );
  }
  if (input.until.getTime() <= input.currentExpiry.getTime()) {
    return recordRefusal(
      'RECORD_RETENTION_WOULD_SHORTEN',
      'That hold would not extend retention — it ends on or before the current expiry, so '
      + 'applying it would either change nothing or bring the expiry forward.',
      'Choose a date after the current expiry, or leave the record on its existing clock.',
    );
  }
  const ceiling = addYears(input.draftedAt, RETENTION_YEARS_MAX);
  if (input.until.getTime() > ceiling.getTime()) {
    return recordRefusal(
      'RECORD_RETENTION_WOULD_SHORTEN',
      `Art 68(9) extends retention to at most ${RETENTION_YEARS_MAX} years from the record's `
      + `date, which is ${ceiling.toISOString()}. A longer hold is retention without a basis.`,
      'Hold to the ceiling, or record a separate legal basis for keeping it longer and cite it.',
    );
  }
  return { ok: true, value: { expiresAt: input.until, legalHoldUntil: input.until } };
}

/* ════════ §4 IDENTITY AND INTEGRITY ════════ */

/** Lowercase hex SHA-256. The one hash this compartment uses, everywhere. */
export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** The single normalisation every handle lookup in this file goes through. */
export function normaliseHandle(handle: string): string {
  return String(handle ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/**
 * A handle, pseudonymised for the erasure and access logs.
 *
 * READ THE NAME. This is a PSEUDONYM, not an anonym. Recital 26 is explicit that
 * pseudonymised data remains personal data, and an X handle is short and public, so
 * this hash is reversible by anyone holding a handle list. It exists so the erasure
 * log can be joined and counted WITHOUT holding the handle in the clear — which is
 * the difference between a log and a second copy of the thing that was erased. Do not
 * describe it anywhere as anonymisation.
 *
 * Lowercased and '@'-stripped because X handles are case-insensitive: an erasure that
 * misses on case is an erasure that did not happen.
 */
export function handlePseudonym(handle: string): string {
  return sha256Hex(normaliseHandle(handle));
}

/**
 * The record's external id: deterministic and content-derived, so writing the same
 * record twice is idempotent and a uid cannot be made to point at other bytes.
 *
 * Includes the statement hash, so a DIFFERENT statement can never land on an existing
 * uid and quietly replace the record of what was cleared.
 */
export function deriveRecordUid(parts: {
  xCommentId: string | null;
  draftId: number | null;
  statementHash: string;
  draftedAt: Date;
}): string {
  const canonical = [
    parts.xCommentId ?? '-',
    parts.draftId == null ? '-' : String(parts.draftId),
    parts.statementHash,
    parts.draftedAt.toISOString(),
  ].join(' ');
  return `rec_${sha256Hex(canonical).slice(0, 32)}`;
}

/* ════════ §5 THE EXPORT BUNDLE ════════ */

/** `marketing_record` as stored. Snapshots stay opaque — their shape is the engine's. */
export interface RecordRow {
  record_uid: string;
  x_comment_id: string | null;
  draft_id: number | null;
  regime: string;
  drafted_by: string;
  drafted_at: string;
  cleared_by: string | null;
  cleared_at: string | null;
  clearance_reason: string | null;
  statement_text: string;
  statement_hash: string;
  published_text: string | null;
  published_hash: string | null;
  published_at: string | null;
  published_permalink: string | null;
  close_out_state: string;
  close_out_by: string | null;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  inbound_context_hash: string | null;
  inbound_context_excerpt: string | null;
  context_minimised_at: string | null;
  mandatory_elements: unknown;
  embargo_snapshot: unknown;
  holdings_snapshot: unknown;
  desk_state: unknown;
  consideration_kind: string;
  named_assets: string[];
  jurisdictions: string[];
  snapshot_complete: boolean;
  snapshot_gaps: string[];
  retention_class: string;
  retention_basis: string;
  retention_expires_at: string;
  legal_hold: boolean;
  legal_hold_reason: string | null;
  legal_hold_until: string | null;
}

export interface RefusalRow {
  record_uid: string;
  code: string;
  sentence: string;
  rule_cited: string;
  phase: string;
  fired_at: string;
  overridden: boolean;
  overridden_by: string | null;
  override_reason: string | null;
}

export interface ClaimRow {
  record_uid: string;
  claim_id: string;
  claim_version: number;
  claim_category: string | null;
  verbatim: boolean;
}

export interface TransferRow {
  record_uid: string | null;
  processor: string;
  model: string | null;
  purpose: string;
  payload_kind: string;
  contains_third_party_personal_data: boolean;
  third_country: boolean;
  transfer_basis: string;
  occurred_at: string;
}

/* ════════ §5a PRODUCE OR ADMIT — the completeness claim, withdrawn ════════ */

/**
 * ══ WHY THIS SECTION EXISTS AT ALL ══
 *
 * Everything above makes a bundle honest about the records it HOLDS. Nothing above
 * makes it honest about the records it DOES NOT hold, and that is the one question the
 * approver signing an Art 8(2) production is actually answering: "is this everything?".
 * A bundle that lists twelve records perfectly, while the desk cleared forty statements
 * in the same window, is not incomplete — it is a misrepresentation, and it is the one a
 * reader cannot detect, because nothing in the artefact points at the missing twenty-eight.
 *
 * THE JOIN IS A 256-BIT CONTENT DIGEST, NOT A NAME MATCH. `marketing_outbound_gate_decision`
 * (0062) holds `text_sha256` and `marketing_record` (0061) holds `statement_hash`, and both
 * are the SAME EXPRESSION over the SAME BYTES — `gateTextSha256` in `outboundGate.ts` and
 * `sha256Hex` here. So "did the register receive the statement the gate cleared?" is
 * answerable exactly, with no fuzzy matching and no room for a near miss to read as a hit.
 *
 * THE ANSWER IS CURRENTLY "ALMOST NONE OF THEM", AND THAT IS THE CORRECT OUTPUT. The
 * clearance path in `routes/marketing.ts` writes a gate-ledger row and no record;
 * `writeRecord`'s only caller is a separate manual approver POST; `closeOutPublication`
 * and `listOutstandingCloseOuts` below have no callers at all, so `close_out_state`
 * stays `'outstanding'` forever behind an index nobody queries. The drift was anticipated
 * by the design and no detector was built. This is the detector, and on day one it reports
 * a large number rather than rounding it into a reassurance.
 *
 * THERE IS NO MIGRATION HERE. Both tables exist, both have live writers, and this is one
 * left join expressed as three window-bounded reads — see `readClearanceLedger` for why
 * three reads and not one statement.
 */

/**
 * A cleared statement, as 0062 holds it. One row per clearance decision that ALLOWED
 * text out, which is the unit the approver is signing for.
 */
export interface ClearedStatementRow {
  /** 0062's `bigserial`. `pg` hands `bigint` back as a string; it is kept as one. */
  id: string;
  /** The inbound reply this answered, or null for a desk-authored original. */
  reply_id: string | null;
  actor: string;
  created_at: string;
  text_sha256: string;
  disposition: string;
}

/** Just enough of a record to answer "were these bytes ever recorded?". */
export interface RecordedDigestRow {
  record_uid: string;
  statement_hash: string;
  x_comment_id: string | null;
  drafted_at: string;
}

/**
 * `reply_id` → the queue row's `x_comment_id`, for the SECONDARY correlation only.
 *
 * Rows the 90-day sweep has taken are simply absent, which is why an empty list and an
 * absent list mean different things here and are kept apart by the optional field on
 * `ClearanceLedgerSource`.
 */
export interface ReplyCommentRow {
  id: string;
  x_comment_id: string;
}

/**
 * What the reconciliation is computed from.
 *
 * `ledgerPresent: false` means 0062 is not applied, so NOTHING may be counted — not even
 * zero. `replyComments: undefined` means the queue was not consulted, which is a weaker
 * absence: the hash answer still stands, only the "was this an edit?" refinement is
 * unavailable.
 */
export interface ClearanceLedgerSource {
  readonly ledgerPresent: boolean;
  readonly cleared: readonly ClearedStatementRow[];
  readonly recordedDigests: readonly RecordedDigestRow[];
  readonly replyComments?: readonly ReplyCommentRow[];
  /**
   * `false` means 0061 is unapplied, so `recordedDigests` is EMPTY BECAUSE THE TABLE DOES
   * NOT EXIST rather than because nothing matched. Those are different facts and the
   * rendered artefact states which one it is; without this field an absent register would
   * be indistinguishable from a register that answered "no".
   *
   * Optional so every existing hand-built source keeps compiling; `undefined` is read as
   * "the register's existence was not established", which is what a partial source means.
   */
  readonly registerPresent?: boolean;
}

/**
 * THREE BUCKETS, NEVER TWO.
 *
 * `hash_differs` is not a shade of `never_recorded`. It is the ordinary, legitimate case
 * — the text was edited between clearance and recording — and an approver who cannot tell
 * it from a missing record will either chase an edit or sign off a gap.
 */
export type ClearanceOutcome = 'recorded' | 'never_recorded' | 'hash_differs';

/**
 * HOW FAR THE LOOKUP GOT. This field is what stops `never_recorded` from being read as
 * "and we confirmed it was not merely edited": on three of these values, nobody checked
 * or nobody could.
 */
export type ClearanceCorrelation =
  /** The register holds a record with these exact bytes. */
  | 'hash_match'
  /** Same thread, different bytes — an edit between clearance and recording. */
  | 'same_thread_different_bytes'
  /** The thread was resolved and holds no record at all. */
  | 'thread_checked_no_record'
  /** The queue row is gone: the 90-day sweep in 0046 took it. Not "no such reply". */
  | 'thread_row_swept'
  /**
   * `reply_id IS NULL` on the 0062 row, AND THAT DOES NOT MEAN "desk-authored original".
   *
   * It used to be named `no_thread_to_correlate` and documented as "a desk-authored
   * original with no inbound reply", which stated an inference as a fact in an Art 8(2)
   * filing. THREE live surfaces write `phase = 'clearance'` rows with a null `reply_id`
   * and only one of them owes a record:
   *   · `routes/marketing.ts` `POST /draft/:id/approve` — a reply clearance, which does
   *     carry a `reply_id`, so it is NOT in this bucket;
   *   · `routes/marketingMemory.ts` `POST /crisis/instance/:id/clearance` — the crisis
   *     room, which accepts a clear from any of the three lanes and writes `replyId: null`;
   *   · `routes/marketingGates.ts` `POST /claim-safety` — takes `phase` from the request
   *     BODY on a `requireOperator` route, so any operator (including the shared machine
   *     key) can put a row here.
   * 0062 has no source column, so the reconciliation CANNOT tell them apart. The name says
   * that plainly rather than naming a human in a regulatory filing on a guess.
   */
  | 'originating_surface_unknown'
  /** The queue was never consulted, so an edit was neither found nor ruled out. */
  | 'thread_not_checked';

/**
 * ONE CLEARANCE EVENT — one 0062 row that allowed these bytes out.
 *
 * A statement can be cleared many times: the crisis room accepts a clear from any of the
 * three lanes and writes one row per lane for the SAME `text_sha256`, and a template reply
 * re-gated on every draft accumulates rows indefinitely. Each event is its own act by its
 * own human, and they are all printed.
 */
export interface ClearanceEvent {
  /** 0062's row id, so an approver can go straight to the row. */
  readonly gateId: string;
  /** The 0062 `actor`: the authenticated principal who performed the clearance. */
  readonly clearedBy: string;
  readonly clearedAt: string;
  readonly disposition: string;
  readonly replyId: string | null;
  /** How far the lookup got FOR THIS EVENT. The statement's own value is the strongest. */
  readonly correlation: ClearanceCorrelation;
}

/**
 * ONE CLEARED STATEMENT — one distinct `text_sha256`, and what became of it.
 *
 * THE UNIT IS THE STATEMENT, NOT THE CLEARANCE EVENT. It was the event, and one statement
 * cleared by three lanes of the crisis room was therefore reported as THREE unrecorded
 * statements under the label "statements cleared by the desk", with the single digest
 * printed three times and three humans named. That is an overstatement of the gap in a
 * document produced for a competent authority under Art 8(2). `readClearanceLedger` already
 * de-duplicated the digests for its own read, so the code knew they repeat.
 */
export interface ClearedStatement {
  /** The digest of the bytes that were cleared. This is the identifier, not a name. */
  readonly statementHash: string;
  /**
   * `gate:<16 hex>` — the SAME reference the scoped Art 90 refusal tells a drafter to
   * quote to an approver, so a reader of this bundle can resolve the exact check.
   */
  readonly gateReference: string;
  /**
   * EVERY clearance event for these bytes, earliest first. Never truncated and never
   * reduced to a count: each one is a named human performing an act, and the second and
   * third are the evidence that the control operated more than once.
   */
  readonly clearances: readonly ClearanceEvent[];
  readonly firstClearedAt: string;
  readonly lastClearedAt: string;
  readonly outcome: ClearanceOutcome;
  readonly recordUid: string | null;
  /** `hash_differs` only: the digest the record holds. BOTH digests, or neither. */
  readonly recordedStatementHash: string | null;
  /**
   * The STRONGEST correlation any of this statement's events reached, by the precedence in
   * `CORRELATION_STRENGTH`. Weaker ones stay visible on the events themselves, so a reader
   * can see that one lane's thread was checked and another's was swept.
   */
  readonly correlation: ClearanceCorrelation;
}

/**
 * WHAT THIS SECTION IS AND IS NOT SCOPED TO, AS DATA.
 *
 * The bundle's header prints a Member State filter and a window, and this section obeys
 * exactly one of them. Printing a count under a header that advertises a filter the count
 * does not apply is how a desk-wide figure gets read as a per-Member-State one, so the
 * asymmetry is carried in the artefact rather than left to the reader to know.
 */
export interface ClearanceScope {
  readonly windowFrom: string;
  readonly windowTo: string;
  /**
   * `windowFrom === windowTo`. The clearance read is `created_at >= $1 AND created_at <= $2`,
   * so on a zero-width window it can only ever match rows stamped at that exact instant —
   * and a zero is then an artefact of the window, not a finding about the ledger.
   * `GET /export/:itemId` builds precisely such a window from one record's `drafted_at`.
   */
  readonly instantaneousWindow: boolean;
  /** What the caller asked to narrow the RECORDS to, printed in the header. */
  readonly jurisdictionRequested: string | null;
  /**
   * ALWAYS `false`. 0062 has no Member State column (checked: 0062 indexes `reply_id` and
   * `created_at` and holds no jurisdiction), so this section CANNOT be narrowed to one and
   * is desk-wide for the window. Since it cannot be scoped, it has to be said.
   */
  readonly jurisdictionApplied: false;
  /**
   * ALWAYS `false`. "Was this statement ever recorded?" is not a windowed question, so the
   * digest lookup spans the whole register — which means `counts.recorded` can exceed the
   * bundle's own `counts.records`, because it counts rows outside this production.
   */
  readonly recordLookupWindowed: false;
}

/**
 * The completeness claim, stated or WITHDRAWN.
 *
 * `state: 'refused'` sets `counts` to null on purpose. An object shaped
 * `{ neverRecorded: 0 }` alongside a refusal is exactly the collapse this whole file
 * argues against: 0 and "we could not look" are different facts and they must not share
 * a rendering.
 *
 * AND THE TWO LISTS ARE NULL IN THAT STATE FOR THE SAME REASON. They used to be `[]`
 * alongside `counts: null`, so only `state` disambiguated and any consumer reading
 * `.neverRecorded.length === 0` as "nothing missing" got the collapse `counts` was
 * carefully protected from. `null` cannot be read that way by accident.
 *
 * `refusals` is a LIST because the house pattern is to return every refusal that fired,
 * not the first one found (`routes/marketingDesk.ts`).
 */
export interface ClearanceReconciliation {
  readonly state: 'measured' | 'refused';
  /** Stated in both states: a withdrawn claim still had a scope it would have covered. */
  readonly scope: ClearanceScope;
  readonly refusals: readonly RecordRefusal[];
  readonly counts: {
    /**
     * 0062 ROWS. The number of times the desk allowed text out, which is larger than the
     * number of statements whenever one statement was cleared by more than one lane.
     */
    readonly clearanceEvents: number;
    /** DISTINCT `text_sha256`. This is the figure a regulator should read as "statements". */
    readonly distinctStatements: number;
    /** Distinct statements the register holds. Counted over the WHOLE register — see `scope`. */
    readonly recorded: number;
    readonly neverRecorded: number;
    readonly hashDiffers: number;
  } | null;
  /** `null`, NOT `[]`, when the claim is withdrawn. */
  readonly neverRecorded: readonly ClearedStatement[] | null;
  /** `null`, NOT `[]`, when the claim is withdrawn. */
  readonly hashDiffers: readonly ClearedStatement[] | null;
}

/**
 * WHICH CORRELATION WINS when one statement's events disagree. Higher is stronger, in the
 * sense of "more was actually established". `same_thread_different_bytes` outranks the rest
 * because it is the one value that moves the statement out of the unrecorded bucket, and
 * `thread_not_checked` / `originating_surface_unknown` rank lowest because on those values
 * nobody established anything at all.
 */
const CORRELATION_STRENGTH: Record<ClearanceCorrelation, number> = {
  hash_match: 6,
  same_thread_different_bytes: 5,
  thread_checked_no_record: 4,
  thread_row_swept: 3,
  originating_surface_unknown: 2,
  thread_not_checked: 1,
};

/** Printed verbatim in every bundle. The claim this production does NOT make. */
export const PRODUCTION_COMPLETENESS_DISCLAIMER =
  'THIS PRODUCTION does NOT assert that every statement LCX published in this window is '
  + 'recorded here. It asserts the opposite where it can prove it: the section below joins '
  + 'this desk\'s outbound gate ledger (migration 0062) to the record register (0061) on a '
  + 'sha256 digest of the cleared bytes, and names every statement the desk cleared and '
  + 'never recorded. Where that join could not be made, the completeness claim is withdrawn '
  + 'and the reason is stated — it is never reported as "none found". THAT SECTION IS '
  + 'DESK-WIDE FOR THE WINDOW AND IS NOT NARROWED BY THE MEMBER STATE FILTER PRINTED IN THE '
  + 'HEADER ABOVE: the gate ledger holds no Member State, so it cannot be scoped to one, and '
  + 'saying so is the only honest alternative to letting a desk-wide figure be read as a '
  + 'per-Member-State one.';

/** What a bundle was asked for, and by whom. All of it is printed in the header. */
export interface BundleRequest {
  /** The named human at LCX who produced it. Not a job name. */
  readonly requestedBy: string;
  /** The authority that asked. Art 7(3): it need not be the FMA. */
  readonly authority: string;
  readonly windowFrom: Date;
  readonly windowTo: Date;
  /** Host Member State filter, or null for "everything in the window". */
  readonly jurisdiction: string | null;
  /** Supplied, never read from the clock: the same inputs must render the same bytes. */
  readonly generatedAt: Date;
}

/**
 * One line of the completeness statement. `absent` and `unverifiable` are the whole
 * point of the type: a bundle that cannot reconstruct something says which thing and
 * why, in the output, next to the record it belongs to.
 */
export interface CompletenessLine {
  readonly field: string;
  readonly state: 'reconstructed' | 'absent' | 'unverifiable';
  readonly why: string;
}

export interface BundleRecord {
  readonly recordUid: string;
  readonly regime: string;
  readonly draftedBy: string;
  readonly draftedAt: string;
  readonly clearedBy: string | null;
  readonly clearedAt: string | null;
  readonly clearanceReason: string | null;
  readonly fourEyes: 'satisfied' | 'not_cleared' | 'same_human';
  readonly statementText: string;
  readonly statementHash: string;
  readonly integrity: 'verified' | 'broken' | 'unverifiable';
  readonly publishedText: string | null;
  readonly publishedHash: string | null;
  readonly publishedAt: string | null;
  readonly publishedPermalink: string | null;
  readonly closeOutState: string;
  readonly publishedMatchesCleared: boolean | null;
  readonly withdrawnAt: string | null;
  readonly withdrawalReason: string | null;
  readonly inboundContextHash: string | null;
  readonly inboundContextExcerpt: string | null;
  readonly namedAssets: readonly string[];
  readonly jurisdictions: readonly string[];
  readonly considerationKind: string;
  readonly mandatoryElements: unknown;
  readonly embargoSnapshot: unknown;
  readonly holdingsSnapshot: unknown;
  readonly deskState: unknown;
  readonly claimsUsed: readonly ClaimRow[];
  readonly refusals: readonly RefusalRow[];
  readonly transfers: readonly TransferRow[];
  readonly retention: {
    readonly cls: string;
    readonly basis: string;
    readonly expiresAt: string;
    readonly legalHold: boolean;
    readonly legalHoldReason: string | null;
    readonly legalHoldUntil: string | null;
  };
  readonly completeness: readonly CompletenessLine[];
}

export interface ExportBundle {
  readonly kind: 'lcx_marketing_export_bundle';
  /** Bumped when the printed layout changes, so an old bundle stays readable as itself. */
  readonly formatVersion: 1;
  readonly request: {
    readonly requestedBy: string;
    readonly authority: string;
    readonly windowFrom: string;
    readonly windowTo: string;
    readonly jurisdiction: string | null;
    readonly generatedAt: string;
  };
  readonly records: readonly BundleRecord[];
  readonly counts: {
    readonly records: number;
    readonly published: number;
    readonly outstandingCloseOut: number;
    readonly withdrawn: number;
    readonly refusals: number;
    readonly refusalsOverridden: number;
    readonly integrityBroken: number;
    readonly integrityUnverifiable: number;
    readonly incompleteRecords: number;
  };
  /** Bundle-level absences: things missing from the WHOLE bundle, not from one record. */
  readonly completeness: readonly CompletenessLine[];
  /**
   * WHAT THE DESK CLEARED AND NEVER RECORDED. §5a.
   *
   * The one field that speaks to records NOT in `records` above. It is not folded into
   * `counts`, because `counts` describes the rows this bundle holds and this describes the
   * rows it should have held — and a `neverRecorded` figure sitting in the same block as
   * `records` would read as a property of the register rather than of the production.
   */
  readonly clearanceReconciliation: ClearanceReconciliation;
  /** Printed verbatim. The retention inference and the outstanding DPO ruling. */
  readonly caveats: readonly string[];
}

/**
 * Everything the bundle is built from, read by the caller in one transaction.
 *
 * `presentCommentIds` is the inbound rows STILL IN `marketing_x_reply`. It is how the
 * bundle can tell "we never captured the parent" from "the parent was minimised on the
 * 90-day sweep", which are different answers to a regulator and must not print the
 * same. Omit it and the bundle says the sweep state was not checked rather than
 * guessing — absent data produces a stated absence, never a comfortable default.
 */
export interface BundleSource {
  readonly registerPresent: boolean;
  readonly records: readonly RecordRow[];
  readonly refusals: readonly RefusalRow[];
  readonly claims: readonly ClaimRow[];
  readonly transfers: readonly TransferRow[];
  readonly presentCommentIds?: readonly string[];
  /**
   * THE PRODUCE-OR-ADMIT SIDE. Optional, and `undefined` means "this composition was never
   * handed the clearance ledger" — which produces `RECORD_CLEARANCE_LEDGER_UNREAD` and a
   * withdrawn completeness claim, NOT a count of zero. Every existing caller that omits it
   * therefore gets a bundle that says it cannot speak to completeness, which is the honest
   * answer for a caller that did not look.
   */
  readonly clearance?: ClearanceLedgerSource;
}

const byStringAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * THE JOIN, IN ONE PURE FUNCTION.
 *
 * Pure because this is the number a human acts on, and a number computed inside an async
 * database read is a number nobody can write a test for that fails when the bucketing is
 * wrong. `readClearanceLedger` does the three reads; every judgement is made here.
 *
 * `never_recorded` MEANS EXACTLY ONE THING: no row in `marketing_record` holds these
 * bytes. That is provable from the digest alone and is the Art 8(2)-relevant fact. Whether
 * a DIFFERENT record for the same conversation exists — an ordinary edit between clearance
 * and recording — is a separate question, answered by `correlation`, and on three of its
 * six values the answer is "nobody could check". Reporting a statement as unrecorded while
 * silently implying an edit had been ruled out is the laundering this file forbids.
 *
 * THE UNIT OF THE ANSWER IS THE DISTINCT DIGEST. Rows are grouped by `text_sha256` before
 * anything is counted, because one statement cleared by three crisis lanes is one statement
 * and reporting it as three unrecorded statements overstates the gap threefold in a filing
 * to a competent authority. `clearanceEvents` carries the row count separately, so nothing
 * is lost — the two figures are simply not the same figure.
 *
 * `req` IS READ ONLY FOR THE SCOPE, never to filter. It supplies the window this section
 * covers and the Member State filter it does NOT apply, so the artefact can state both.
 */
function reconcileClearances(
  src: ClearanceLedgerSource | undefined,
  req: BundleRequest,
): ClearanceReconciliation {
  const scope: ClearanceScope = {
    windowFrom: req.windowFrom.toISOString(),
    windowTo: req.windowTo.toISOString(),
    instantaneousWindow: req.windowFrom.getTime() === req.windowTo.getTime(),
    jurisdictionRequested: req.jurisdiction ?? null,
    jurisdictionApplied: false,
    recordLookupWindowed: false,
  };
  const withdrawn = (r: RecordRefusal): ClearanceReconciliation => ({
    state: 'refused',
    scope,
    refusals: [r],
    // Null, not zero. See the field comment on `ClearanceReconciliation.counts`.
    counts: null,
    // Null, NOT `[]`. An empty list beside a refusal reads as "nothing missing".
    neverRecorded: null,
    hashDiffers: null,
  });

  if (src === undefined) {
    return withdrawn(recordRefusal(
      'RECORD_CLEARANCE_LEDGER_UNREAD',
      'This production did not compare what the desk CLEARED against what it RECORDED, so it '
      + 'cannot say whether it is complete. No number is reported here, because a zero would '
      + 'read as "we checked and found nothing missing".',
      'Produce the bundle through a caller that reads the clearance ledger — '
      + '`readBundleSource` does. A composition assembled from partial rows cannot answer '
      + 'the completeness question and says so instead of guessing.',
    ));
  }
  if (!src.ledgerPresent) {
    return withdrawn(recordRefusal(
      'RECORD_CLEARANCE_LEDGER_ABSENT',
      `The outbound gate ledger does not exist on this environment, so this production cannot `
      + `name the statements the desk cleared and never recorded. Migration ${GATE_MIGRATION} `
      + `has not been applied. The completeness claim is WITHDRAWN — it is not reported as `
      + `"0 unrecorded", because 0 and "we could not look" are different facts.`,
      `Apply ${GATE_MIGRATION} by hand in the SQL editor. Until then every production from `
      + 'this environment is of unknown completeness and should be filed saying so.',
    ));
  }

  /*
   * FIRST MATCH BY (drafted_at, record_uid) so a statement recorded twice — same bytes, two
   * instants, two content-derived uids — resolves to the same record on every run. Without
   * the sort the bundle digest would depend on row order, which is the property
   * `renderBundleText` promises not to have.
   */
  const digests = [...src.recordedDigests].sort(
    (a, b) => byStringAsc(a.drafted_at, b.drafted_at) || byStringAsc(a.record_uid, b.record_uid),
  );
  const byHash = new Map<string, RecordedDigestRow>();
  const byComment = new Map<string, RecordedDigestRow[]>();
  for (const d of digests) {
    if (!byHash.has(d.statement_hash)) byHash.set(d.statement_hash, d);
    if (d.x_comment_id != null) {
      const list = byComment.get(d.x_comment_id);
      if (list) list.push(d);
      else byComment.set(d.x_comment_id, [d]);
    }
  }
  const threadOf = src.replyComments
    ? new Map(src.replyComments.map((r) => [r.id, r.x_comment_id]))
    : null;

  /*
   * GROUPED BY DIGEST, IN CLEARANCE ORDER. The sort is on (created_at, id) as before so the
   * rendered bytes stay a function of the rows and not of their arrival order; grouping
   * preserves the order of FIRST clearance, which is the order an approver reads events in.
   */
  const rows = [...src.cleared].sort(
    (a, b) => byStringAsc(a.created_at, b.created_at) || byStringAsc(a.id, b.id),
  );
  const groups = new Map<string, ClearedStatementRow[]>();
  for (const row of rows) {
    const list = groups.get(row.text_sha256);
    if (list) list.push(row);
    else groups.set(row.text_sha256, [row]);
  }

  /**
   * WHAT BECAME OF ONE EVENT. Per event, because two events on the same digest can reach
   * different answers — one lane's queue row swept, another's still present — and the
   * statement then reports the strongest while the events keep the detail.
   */
  const assess = (row: ClearedStatementRow): {
    correlation: ClearanceCorrelation;
    outcome: ClearanceOutcome;
    recordUid: string | null;
    recordedStatementHash: string | null;
  } => {
    const hit = byHash.get(row.text_sha256);
    if (hit) {
      return {
        correlation: 'hash_match',
        outcome: 'recorded',
        recordUid: hit.record_uid,
        recordedStatementHash: hit.statement_hash,
      };
    }
    // No record holds these bytes. The only remaining question is WHY, and it is asked
    // against the conversation rather than against the text.
    if (row.reply_id == null) {
      /*
       * NOT "a desk-authored original". `reply_id IS NULL` is written by the crisis room and
       * by `POST /claim-safety` as well as by a desk original, 0062 has no source column, and
       * this row is about to be printed with a named human beside it in a filing. The value
       * says the originating surface is unknown, which is the only thing that is known.
       */
      return {
        correlation: 'originating_surface_unknown',
        outcome: 'never_recorded',
        recordUid: null,
        recordedStatementHash: null,
      };
    }
    if (threadOf === null) {
      return {
        correlation: 'thread_not_checked',
        outcome: 'never_recorded',
        recordUid: null,
        recordedStatementHash: null,
      };
    }
    const comment = threadOf.get(row.reply_id);
    if (comment === undefined) {
      // The queue row is gone, and 0062's own header says a reader must treat a missing
      // reply as SWEPT rather than as "no such reply".
      return {
        correlation: 'thread_row_swept',
        outcome: 'never_recorded',
        recordUid: null,
        recordedStatementHash: null,
      };
    }
    const edited = (byComment.get(comment) ?? []).find(
      (d) => d.statement_hash !== row.text_sha256,
    );
    if (edited) {
      return {
        correlation: 'same_thread_different_bytes',
        outcome: 'hash_differs',
        recordUid: edited.record_uid,
        // BOTH digests. One of them alone is an accusation with no way to check it.
        recordedStatementHash: edited.statement_hash,
      };
    }
    return {
      correlation: 'thread_checked_no_record',
      outcome: 'never_recorded',
      recordUid: null,
      recordedStatementHash: null,
    };
  };

  const assessed: ClearedStatement[] = [];
  for (const [hash, events] of groups) {
    const judged = events.map((row) => ({ row, verdict: assess(row) }));
    // The strongest verdict decides the STATEMENT. `hash_match` is a property of the digest
    // so it is unanimous by construction; the tie-break exists for the thread values, where
    // one lane's queue row survives and another's does not.
    const best = judged.reduce((a, b) =>
      CORRELATION_STRENGTH[b.verdict.correlation] > CORRELATION_STRENGTH[a.verdict.correlation]
        ? b
        : a,
    );
    assessed.push({
      statementHash: hash,
      gateReference: gateReferenceFrom(hash),
      clearances: judged.map(({ row, verdict }) => ({
        gateId: row.id,
        clearedBy: row.actor,
        clearedAt: row.created_at,
        disposition: row.disposition,
        replyId: row.reply_id,
        correlation: verdict.correlation,
      })),
      firstClearedAt: events[0]!.created_at,
      lastClearedAt: events[events.length - 1]!.created_at,
      outcome: best.verdict.outcome,
      recordUid: best.verdict.recordUid,
      recordedStatementHash: best.verdict.recordedStatementHash,
      correlation: best.verdict.correlation,
    });
  }

  return {
    state: 'measured',
    scope,
    refusals: [],
    counts: {
      // TWO FIGURES, NOT ONE. Rows, and distinct statements. Collapsing them is how one
      // statement cleared by three lanes became "3 statements this desk cleared".
      clearanceEvents: rows.length,
      distinctStatements: assessed.length,
      recorded: assessed.filter((s) => s.outcome === 'recorded').length,
      neverRecorded: assessed.filter((s) => s.outcome === 'never_recorded').length,
      hashDiffers: assessed.filter((s) => s.outcome === 'hash_differs').length,
    },
    // NOT truncated. A count with a sample list under it is how twenty-eight missing
    // statements become "and 25 more", which is the omission in a different costume.
    neverRecorded: assessed.filter((s) => s.outcome === 'never_recorded'),
    hashDiffers: assessed.filter((s) => s.outcome === 'hash_differs'),
  };
}

/**
 * Compose the bundle. PURE and DETERMINISTIC: the same rows and the same
 * `generatedAt` render the same bytes, which is what makes a digest meaningful and
 * what lets two people compare two productions of the same window.
 *
 * It refuses in four situations, and each refusal is the honest answer rather than an
 * empty document that looks like compliance:
 *   · the producer or the asking authority is unnamed — an export is an act;
 *   · the window is missing or inverted (Art 8(2) asks about a period);
 *   · 0061 is not applied, so there is no register to read;
 *   · the register is present and EMPTY for the request. That is the GPS perimeter
 *     pattern: a gate you can walk past is decoration, and a zero-record bundle
 *     silently produced would read as "we published nothing", which is a different
 *     claim from "we have no records of what we published".
 */
export function composeExportBundle(
  req: BundleRequest,
  data: BundleSource,
): RecordResult<ExportBundle> {
  const requestedBy = (req.requestedBy ?? '').trim();
  const authority = (req.authority ?? '').trim();
  if (requestedBy === '' || authority === '') {
    return recordRefusal(
      'RECORD_ACTOR_UNNAMED',
      'An export needs a named human who produced it and a named authority that asked for it. '
      + 'One of the two is blank.',
      'Record the producer and the requesting authority. Art 7(3) means the asker need not be '
      + 'the FMA, so which authority asked is a fact about the record, not a formality.',
    );
  }
  const windowOk =
    req.windowFrom instanceof Date && !Number.isNaN(req.windowFrom.getTime())
    && req.windowTo instanceof Date && !Number.isNaN(req.windowTo.getTime())
    && req.windowFrom.getTime() <= req.windowTo.getTime();
  if (!windowOk) {
    return recordRefusal(
      'RECORD_WINDOW_INVALID',
      'The export window is missing, unreadable, or ends before it starts.',
      'Give a start and an end. The producible unit is the communications visible to '
      + 'prospective holders in a Member State during a period.',
    );
  }
  /*
   * COMPUTED BEFORE BOTH REGISTER REFUSALS, because those are the states in which the
   * finding is most valuable and it was being lost in both of them.
   *
   * The empty register IS the day-one state: a refusal that says "the register is empty"
   * while the gate ledger holds forty cleared statements is technically true and materially
   * misleading. AND THE ABSENT REGISTER IS THE STRONGER CASE — it used to return above this
   * line, so when 0061 was unapplied and 0062 was not, the state in which 100% of what the
   * desk cleared is unrecordable printed nothing but the migration's name. That is the same
   * guard-ordering mistake this comment was written to avoid, made one branch earlier.
   */
  const production = reconcileClearances(data.clearance, req);
  const unrecorded = production.counts?.neverRecorded ?? 0;
  const plural = (n: number) => (n === 1 ? '' : 's');

  if (!data.registerPresent) {
    const refusal = recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `The record register does not exist on this environment, so no communication can be `
      + `produced — not even to say there were none. Migration ${RECORD_MIGRATION} has not been applied.`
      + (unrecorded > 0
        ? ` A register that does not exist can hold nothing, so ALL ${unrecorded} statement`
          + `${plural(unrecorded)} the desk cleared in this window ${
            unrecorded === 1 ? 'is' : 'are'
          } unrecordable here — not merely unrecorded. ${
            unrecorded === 1 ? 'It is' : 'They are'
          } named by digest on this refusal. This is a total absence of the register the `
          + 'completeness claim depends on, not a configuration nit.'
        : ''),
      `Apply ${RECORD_MIGRATION} by hand in the SQL editor. Until then this surface refuses `
      + 'rather than returning an empty bundle that would read as "we published nothing".',
    );
    return { ...refusal, clearanceReconciliation: production };
  }

  if (data.records.length === 0) {
    const missing = unrecorded;
    const refusal = recordRefusal(
      'RECORD_REGISTER_EMPTY',
      'The register exists and holds NO communication in this window. It is empty — this is not '
      + 'a finding that LCX published nothing, only that nothing was recorded.'
      /*
       * Appended, never substituted: the first two sentences are the ones the existing
       * suite pins, and the distinction they draw is still the point. This adds the number
       * the gate ledger can prove, and stays silent when the ledger could not be read
       * rather than appending a zero.
       */
      + (missing > 0
        ? ` AND THE DESK CLEARED ${missing} statement${missing === 1 ? '' : 's'} in this `
          + 'window that no record holds. They are named by digest on this refusal.'
        : ''),
      'If communications were published in this window, they were published without a record and '
      + 'that gap is the finding. Widen the window, or say plainly that the register was empty.',
    );
    /*
     * ATTACHED IN BOTH STATES, and the state is legible from the object itself. When the
     * ledger was read the caller gets the list; when it was not, it gets
     * `state: 'refused'` with `counts: null` and the reason — which is the more important
     * of the two, because an empty register plus an unreadable clearance ledger is a
     * production of entirely unknown completeness and must not read as a small one.
     */
    return { ...refusal, clearanceReconciliation: production };
  }

  const refusalsBy = groupBy(data.refusals, (r) => r.record_uid);
  const claimsBy = groupBy(data.claims, (r) => r.record_uid);
  const transfersBy = groupBy(
    data.transfers.filter((t) => t.record_uid != null),
    (t) => String(t.record_uid),
  );
  const present = data.presentCommentIds ? new Set(data.presentCommentIds) : null;

  const records = [...data.records]
    .sort((a, b) => byStringAsc(a.drafted_at, b.drafted_at) || byStringAsc(a.record_uid, b.record_uid))
    .map((row) =>
      buildRecord(
        row,
        (refusalsBy.get(row.record_uid) ?? []).slice().sort(
          (a, b) => byStringAsc(a.fired_at, b.fired_at) || byStringAsc(a.code, b.code),
        ),
        (claimsBy.get(row.record_uid) ?? []).slice().sort(
          (a, b) => byStringAsc(a.claim_id, b.claim_id) || a.claim_version - b.claim_version,
        ),
        (transfersBy.get(row.record_uid) ?? []).slice().sort(
          (a, b) => byStringAsc(a.occurred_at, b.occurred_at) || byStringAsc(a.processor, b.processor),
        ),
        present,
      ),
    );

  const bundleCompleteness: CompletenessLine[] = [];
  if (present === null) {
    bundleCompleteness.push({
      field: 'inbound_context_sweep_state',
      state: 'unverifiable',
      why:
        'The inbound queue was not consulted while composing this bundle, so where a parent '
        + 'message is missing the bundle cannot say whether it was never captured or was deleted '
        + 'on the 90-day retention sweep in migration 0046.',
    });
  }
  bundleCompleteness.push({
    field: 'engagement_metrics',
    state: 'absent',
    why:
      'Impressions, reach, follower change and engagement rates are absent BY DESIGN. LCX holds '
      + 'no X API credential, so those numbers were never observable and are not estimated here. '
      + 'Reply counts elsewhere in this system are lower bounds, not totals.',
  });
  /*
   * The completeness of the PRODUCTION, as opposed to the completeness of each record. It
   * belongs in this list because a reader who scans only the bundle-level absences must not
   * miss that the bundle cannot vouch for its own scope.
   */
  if (production.state === 'refused') {
    for (const r of production.refusals) {
      bundleCompleteness.push({
        field: 'production_completeness',
        state: 'unverifiable',
        why: `${r.sentence} (${r.code}; ${r.rule})`,
      });
    }
  } else if (production.counts!.neverRecorded > 0 || production.counts!.hashDiffers > 0) {
    bundleCompleteness.push({
      field: 'production_completeness',
      state: 'absent',
      why:
        `${production.counts!.neverRecorded} distinct statement(s) this desk cleared in this `
        + `window are held by no record, and ${production.counts!.hashDiffers} were recorded with `
        + 'different bytes than the ones cleared. Both lists are printed in full below; neither '
        + 'is a rounding of the other. The unit is the distinct sha256 of the cleared bytes, NOT '
        + `the clearance event: ${production.counts!.clearanceEvents} gate-ledger row(s) produced `
        + `these ${production.counts!.distinctStatements} statement(s), because one statement can `
        + 'be cleared by more than one lane.',
    });
  }
  /*
   * THE SCOPE OF THAT SECTION, AS ITS OWN BUNDLE-LEVEL ABSENCE. Stated in every state,
   * including a measured zero, because a reader who scans only this list must not carry away
   * a desk-wide figure believing it was narrowed to the Member State in the header.
   */
  if (production.scope.jurisdictionRequested !== null) {
    bundleCompleteness.push({
      field: 'production_completeness_member_state_scope',
      state: 'unverifiable',
      why:
        `The records above are filtered to Member State "${production.scope.jurisdictionRequested}". `
        + 'The produce-or-admit section is NOT: migration 0062 has no Member State column, so the '
        + 'gate ledger cannot be narrowed to one and that section is DESK-WIDE for the window. '
        + 'Its counts therefore cover clearances for every Member State, and comparing them '
        + 'against the filtered record counts above compares two different populations.',
    });
  }
  if (production.scope.instantaneousWindow) {
    bundleCompleteness.push({
      field: 'production_completeness_window',
      state: 'unverifiable',
      why:
        `The window of this production is a single instant (${production.scope.windowFrom}), so `
        + 'the gate-ledger read could only match clearances stamped at exactly that instant. Any '
        + 'figure in the produce-or-admit section is therefore an artefact of the window rather '
        + 'than a finding about the ledger, and a zero there does NOT mean the desk cleared '
        + 'nothing. Produce a period through GET /export?from=...&to=... to ask that question.',
    });
  }

  const counts = {
    records: records.length,
    published: records.filter((r) => r.closeOutState === 'published').length,
    outstandingCloseOut: records.filter((r) => r.closeOutState === 'outstanding').length,
    withdrawn: records.filter((r) => r.closeOutState === 'withdrawn').length,
    refusals: records.reduce((n, r) => n + r.refusals.length, 0),
    refusalsOverridden: records.reduce(
      (n, r) => n + r.refusals.filter((x) => x.overridden).length,
      0,
    ),
    integrityBroken: records.filter((r) => r.integrity === 'broken').length,
    integrityUnverifiable: records.filter((r) => r.integrity === 'unverifiable').length,
    incompleteRecords: records.filter((r) =>
      r.completeness.some((c) => c.state !== 'reconstructed'),
    ).length,
  };

  return {
    ok: true,
    value: {
      kind: 'lcx_marketing_export_bundle',
      formatVersion: 1,
      request: {
        requestedBy,
        authority,
        windowFrom: req.windowFrom.toISOString(),
        windowTo: req.windowTo.toISOString(),
        jurisdiction: req.jurisdiction ?? null,
        generatedAt: req.generatedAt.toISOString(),
      },
      records,
      counts,
      completeness: bundleCompleteness,
      clearanceReconciliation: production,
      caveats: [
        PRODUCTION_COMPLETENESS_DISCLAIMER,
        RETENTION_INFERENCE_CAVEAT,
        RETENTION_DPO_RULING_OUTSTANDING,
        'THIS SYSTEM CANNOT PUBLISH. It holds no X credential and has no posting path, so the '
        + '"as published" text on every record arrived from the human who posted it, pasted back '
        + 'by hand. Where a record shows no published text, nobody has pasted it back — the '
        + 'system is stating a gap in its own evidence rather than presenting the cleared draft '
        + 'as if it were what went out.',
      ],
    },
  };
}

function groupBy<T>(rows: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** One record, with its completeness statement built from what is actually there. */
function buildRecord(
  row: RecordRow,
  refusals: RefusalRow[],
  claims: ClaimRow[],
  transfers: TransferRow[],
  present: Set<string> | null,
): BundleRecord {
  const integrity: BundleRecord['integrity'] =
    !row.statement_hash || row.statement_hash.trim() === ''
      ? 'unverifiable'
      : sha256Hex(row.statement_text) === row.statement_hash
        ? 'verified'
        : 'broken';

  const fourEyes: BundleRecord['fourEyes'] =
    row.cleared_by == null || row.cleared_by.trim() === ''
      ? 'not_cleared'
      : row.cleared_by === row.drafted_by
        ? 'same_human'
        : 'satisfied';

  const c: CompletenessLine[] = [];

  if (integrity === 'broken') {
    c.push({
      field: 'statement_text',
      state: 'unverifiable',
      why:
        'The stored statement does not hash to its stored digest. The text is reproduced above '
        + 'as found, and this bundle does NOT assert that it is the text that was cleared.',
    });
  } else if (integrity === 'unverifiable') {
    c.push({
      field: 'statement_hash',
      state: 'absent',
      why: 'No digest was written with this statement, so its integrity cannot be asserted either way.',
    });
  }

  if (fourEyes === 'not_cleared') {
    c.push({
      field: 'cleared_by',
      state: 'absent',
      why:
        'No clearance is recorded against this statement. A drafted statement with no approver is '
        + 'not evidence that a control operated (MiCA Art 68(4)-(6)).',
    });
  } else if (fourEyes === 'same_human') {
    c.push({
      field: 'cleared_by',
      state: 'unverifiable',
      why:
        'The drafter and the approver are the same person, so four-eyes did not operate on this '
        + 'record however the surface described it at the time.',
    });
  }

  switch (row.close_out_state) {
    case 'published':
      break;
    case 'not_sent':
      c.push({
        field: 'published_text',
        state: 'reconstructed',
        why: 'Recorded as cleared and deliberately not sent. A decision not to speak is a decision.',
      });
      break;
    case 'withdrawn':
      c.push({
        field: 'published_text',
        state: row.published_text ? 'reconstructed' : 'absent',
        why: row.published_text
          ? 'Published then withdrawn. The record survives the takedown, which is the point of it.'
          : 'Recorded as withdrawn with no published text ever pasted back, so what was taken down '
            + 'cannot be reproduced from this system.',
      });
      break;
    default:
      c.push({
        field: 'published_text',
        state: 'absent',
        why:
          'No human has pasted back what was actually posted, so this record shows the CLEARED '
          + 'text only. The two differ whenever someone edits in the compose box after clearance.',
      });
  }

  if (row.inbound_context_excerpt) {
    // Nothing to report: the context is in the bundle.
  } else if (row.context_minimised_at) {
    c.push({
      field: 'inbound_context',
      state: 'absent',
      why:
        `The third-party message this answered was minimised on ${row.context_minimised_at} under `
        + 'the retention split (LCX statements retained, third-party content swept). Only its hash '
        + `remains${row.inbound_context_hash ? ` (${row.inbound_context_hash})` : ''}, which still `
        + 'proves whether a later-produced copy is the same text.',
    });
  } else if (row.inbound_context_hash) {
    c.push({
      field: 'inbound_context',
      state: 'absent',
      why:
        'Only a hash of the message this answered was ever stored. That is deliberate data '
        + 'minimisation, not a loss: a stranger\'s words are not retained for five years, and the '
        + 'hash still proves identity against any copy produced later.',
    });
  } else {
    c.push({
      field: 'inbound_context',
      state: 'absent',
      why:
        'The message this answered was not captured at all, so this statement is reproduced '
        + 'without the context that makes "fair, clear and not misleading" assessable (Art 66(2)).',
    });
  }

  if (row.x_comment_id && present && !present.has(row.x_comment_id)) {
    c.push({
      field: 'inbound_queue_row',
      state: 'absent',
      why:
        `The queue row ${row.x_comment_id} is no longer held: it was deleted by the 90-day `
        + 'retention sweep in migration 0046. This record deliberately outlives it.',
    });
  }

  if (claims.length === 0) {
    c.push({
      field: 'claims_used',
      state: 'absent',
      why:
        'No pre-approved claim is linked to this statement. Either it used none — improvised '
        + 'language — or the link was not written. The register cannot distinguish the two.',
    });
  }

  if (refusals.length === 0) {
    c.push({
      field: 'refusals',
      state: 'unverifiable',
      why:
        'No refusal is recorded against this statement. That is consistent with a clean draft AND '
        + 'with refusals not being written at the time, and this register cannot tell them apart.',
    });
  }

  if (transfers.length === 0) {
    c.push({
      field: 'processor_transfers',
      state: 'unverifiable',
      why:
        'No processor transfer is recorded for this record. If a model drafted it, the transfer '
        + 'predates the per-row transfer register and is therefore not reproducible here.',
    });
  }

  for (const gap of row.snapshot_gaps ?? []) {
    c.push({
      field: 'snapshot_gap',
      state: 'absent',
      why: `Recorded as missing at clearance time: ${gap}`,
    });
  }

  const publishedMatchesCleared =
    row.published_text == null ? null : row.published_text === row.statement_text;

  return {
    recordUid: row.record_uid,
    regime: row.regime,
    draftedBy: row.drafted_by,
    draftedAt: row.drafted_at,
    clearedBy: row.cleared_by,
    clearedAt: row.cleared_at,
    clearanceReason: row.clearance_reason,
    fourEyes,
    statementText: row.statement_text,
    statementHash: row.statement_hash,
    integrity,
    publishedText: row.published_text,
    publishedHash: row.published_hash,
    publishedAt: row.published_at,
    publishedPermalink: row.published_permalink,
    closeOutState: row.close_out_state,
    publishedMatchesCleared,
    withdrawnAt: row.withdrawn_at,
    withdrawalReason: row.withdrawal_reason,
    inboundContextHash: row.inbound_context_hash,
    inboundContextExcerpt: row.inbound_context_excerpt,
    namedAssets: row.named_assets ?? [],
    jurisdictions: row.jurisdictions ?? [],
    considerationKind: row.consideration_kind,
    mandatoryElements: row.mandatory_elements,
    embargoSnapshot: row.embargo_snapshot,
    holdingsSnapshot: row.holdings_snapshot,
    deskState: row.desk_state,
    claimsUsed: claims,
    refusals,
    transfers,
    retention: {
      cls: row.retention_class,
      basis: row.retention_basis,
      expiresAt: row.retention_expires_at,
      legalHold: row.legal_hold,
      legalHoldReason: row.legal_hold_reason,
      legalHoldUntil: row.legal_hold_until,
    },
    completeness: c,
  };
}

/* ════════ §6 THE PRINTED ARTEFACT ════════ */

const RULE = '='.repeat(78);
const THIN = '-'.repeat(78);

function block(label: string, body: string | null): string[] {
  return [`${label}:`, ...(body ?? '(absent)').split('\n').map((l) => `    ${l}`)];
}

/**
 * The bundle as text a human can print, staple and hand over.
 *
 * Deterministic by construction: no clock, no locale formatting, no iteration over
 * object keys whose order could shift. The same bundle renders the same bytes on any
 * machine, which is what makes `bundleDigest` worth printing at the bottom.
 *
 * The completeness statement is printed INSIDE each record, not gathered into an
 * appendix nobody reaches. A reader who reads only one record still learns what that
 * record cannot show.
 */
export function renderBundleText(b: ExportBundle): string {
  const out: string[] = [];
  out.push(RULE);
  out.push('LCX MARKETING — COMMUNICATION RECORD EXPORT');
  out.push('Produced under MiCA Art 8(2) (notification upon request). Art 8(3): no prior');
  out.push('approval regime exists, so this retrospective production is the compliance act.');
  out.push(RULE);
  out.push(`Requested by (LCX)   : ${b.request.requestedBy}`);
  out.push(`Requesting authority : ${b.request.authority}`);
  out.push(`Window (UTC)         : ${b.request.windowFrom}  ..  ${b.request.windowTo}`);
  out.push(`Member State filter  : ${b.request.jurisdiction ?? '(none — all records in window)'}`);
  out.push(`Generated at (UTC)   : ${b.request.generatedAt}`);
  out.push(`Format version       : ${b.formatVersion}`);
  out.push('');
  out.push('COUNTS');
  out.push(`  records ................. ${b.counts.records}`);
  out.push(`  published (pasted back) . ${b.counts.published}`);
  out.push(`  awaiting paste-back ..... ${b.counts.outstandingCloseOut}`);
  out.push(`  withdrawn ............... ${b.counts.withdrawn}`);
  out.push(`  refusals recorded ....... ${b.counts.refusals} (overridden: ${b.counts.refusalsOverridden})`);
  out.push(`  integrity broken ........ ${b.counts.integrityBroken}`);
  out.push(`  integrity unverifiable .. ${b.counts.integrityUnverifiable}`);
  out.push(`  records with gaps ....... ${b.counts.incompleteRecords}`);
  out.push('');
  out.push('CAVEATS — read before the records, not after.');
  for (const cav of b.caveats) {
    out.push(...wrap(cav, 74).map((l) => `  ${l}`));
    out.push('');
  }
  if (b.completeness.length > 0) {
    out.push('WHAT THIS BUNDLE AS A WHOLE CANNOT SHOW');
    for (const line of b.completeness) {
      out.push(`  [${line.state}] ${line.field}`);
      out.push(...wrap(line.why, 72).map((l) => `      ${l}`));
    }
    out.push('');
  }

  /*
   * PRINTED BEFORE THE RECORDS, deliberately.
   *
   * A reader under a deadline reads the top of the artefact and skims the rest. What is
   * MISSING from a production is worth more to them than any single record in it, so the
   * gap goes above the records rather than into an appendix — the same reasoning as the
   * caveats block, and the opposite of the per-record completeness statement, which is
   * printed inline because it is about the record it sits next to.
   */
  out.push(RULE);
  out.push('COMPLETENESS OF THIS PRODUCTION — what the desk cleared vs. what it recorded');
  out.push(RULE);
  const p = b.clearanceReconciliation;
  /*
   * THE SCOPE, PRINTED FIRST AND IN EVERY STATE. The header twelve lines above prints a
   * Member State filter, and this section does not obey it — so the section says so where
   * the reader is, rather than trusting them to know which figures a filter reached.
   */
  out.push(`Window read      : ${p.scope.windowFrom} .. ${p.scope.windowTo}`);
  out.push(
    `Member State     : NOT APPLIED to this section${
      p.scope.jurisdictionRequested === null
        ? ' (and none was requested)'
        : ` — the header's filter "${p.scope.jurisdictionRequested}" narrows the RECORDS only`
    }`,
  );
  out.push(...wrap(
    'Migration 0062 has no Member State column, so the gate ledger cannot be narrowed to '
    + 'one and this section is DESK-WIDE for the window above. Comparing its counts against '
    + 'the record counts at the top of this document compares two different populations.',
    74,
  ).map((l) => `  ${l}`));
  if (p.scope.instantaneousWindow) {
    out.push('');
    out.push(...wrap(
      'THE WINDOW ABOVE IS A SINGLE INSTANT, so the gate-ledger read could only match '
      + 'clearances stamped at exactly that instant. Every figure below is an artefact of '
      + 'that window rather than a finding about the ledger, and a zero here does NOT mean '
      + 'the desk cleared nothing. Ask the desk-wide question with a period instead: '
      + 'GET /export?from=...&to=... . A per-record production cannot answer it.',
      74,
    ).map((l) => `  ${l}`));
  }
  out.push('');
  if (p.state === 'refused') {
    out.push('THE COMPLETENESS CLAIM IS WITHDRAWN. No count is given below, because a count');
    out.push('would be an answer and there is none. No list either: an empty list here would');
    out.push('read as "nothing missing", which is the answer this refusal does not have.');
    out.push('');
    for (const r of p.refusals) {
      out.push(`  ${r.code}  (${r.rule})`);
      out.push(...wrap(r.sentence, 72).map((l) => `      ${l}`));
      out.push(...wrap(`REMEDY: ${r.remedy}`, 72).map((l) => `      ${l}`));
      out.push('');
    }
  } else {
    const c = p.counts!;
    if (c.distinctStatements === 0) {
      out.push('The outbound gate ledger was read for this window, and this desk');
      out.push('cleared no statement in it. That is a MEASURED zero — the ledger answered —');
      out.push('and not the unavailable one a withdrawn claim above would have printed.');
      out.push('');
    } else {
      out.push(`  DISTINCT statements cleared ..... ${c.distinctStatements}`);
      out.push(`  clearance events behind them ... ${c.clearanceEvents}   (0062 rows)`);
      out.push(`  of those statements, recorded .. ${c.recorded}`);
      out.push(`  CLEARED AND NEVER RECORDED ..... ${c.neverRecorded}`);
      out.push(`  recorded with different bytes .. ${c.hashDiffers}   (hash_differs)`);
      out.push('');
      out.push(...wrap(
        'THE UNIT IS THE DISTINCT STATEMENT, not the clearance event. One statement can be '
        + 'cleared several times — the crisis room accepts a clear from any of three lanes '
        + 'and writes a row per lane for the same bytes — so the two figures above differ '
        + 'whenever that happened, and only the first is a count of statements.',
        74,
      ).map((l) => `  ${l}`));
      out.push('');
      out.push(...wrap(
        '"recorded" IS COUNTED OVER THE WHOLE REGISTER, deliberately: "was this statement '
        + 'ever recorded?" is not a windowed question, and a record written a week after the '
        + 'window still records the statement. So that figure counts rows OUTSIDE this '
        + 'production and is not comparable with the record count at the top of this '
        + 'document — it can legitimately exceed it.',
        74,
      ).map((l) => `  ${l}`));
      out.push('');
    }
    const never = p.neverRecorded ?? [];
    if (never.length > 0) {
      out.push('CLEARED AND NEVER RECORDED — no record in the register holds these bytes.');
      out.push('ONE ENTRY PER DISTINCT STATEMENT, with every clearance of it listed beneath:');
      out.push('the sha256 as cleared, and each principal, instant and 0062 row that cleared');
      out.push('it. `correlation` says how far the lookup got — only `thread_checked_no_record`');
      out.push('and `same_thread_different_bytes` mean an ordinary edit was actually checked;');
      out.push('`originating_surface_unknown` means the 0062 row carries no reply id and 0062');
      out.push('holds no source column, so which surface cleared it CANNOT be established from');
      out.push('this ledger — three surfaces write such rows and only one of them owes a record.');
      for (const s of never) {
        out.push(THIN);
        out.push(`  sha256      : ${s.statementHash}`);
        out.push(`  reference   : ${s.gateReference}   (resolvable by an approver)`);
        out.push(`  correlation : ${s.correlation}   (strongest of ${s.clearances.length})`);
        out.push(`  cleared ${s.clearances.length} time(s), first ${s.firstClearedAt}, last ${s.lastClearedAt}:`);
        for (const e of s.clearances) {
          out.push(
            `    · ${e.clearedBy} at ${e.clearedAt} — gate row ${e.gateId}, `
            + `reply ${e.replyId ?? '(none on the row)'}, ${e.disposition}, ${e.correlation}`,
          );
        }
      }
      out.push('');
    }
    const differs = p.hashDiffers ?? [];
    if (differs.length > 0) {
      out.push('RECORDED WITH DIFFERENT BYTES (hash_differs) — a record exists for the same');
      out.push('conversation whose statement digest differs from the cleared one. That is the');
      out.push('signature of a legitimate edit between clearance and recording, and it is');
      out.push('reported as its own finding: BOTH digests are printed, and this is neither a');
      out.push('missing record nor a matched one.');
      for (const s of differs) {
        out.push(THIN);
        out.push(`  cleared sha256  : ${s.statementHash}`);
        out.push(`  recorded sha256 : ${s.recordedStatementHash ?? '(absent)'}`);
        out.push(`  record          : ${s.recordUid ?? '(absent)'}`);
        out.push(`  correlation     : ${s.correlation}`);
        out.push(`  cleared ${s.clearances.length} time(s):`);
        for (const e of s.clearances) {
          out.push(
            `    · ${e.clearedBy} at ${e.clearedAt} — gate row ${e.gateId}, ${e.correlation}`,
          );
        }
      }
      out.push('');
    }
  }

  let n = 0;
  for (const r of b.records) {
    n += 1;
    out.push(RULE);
    out.push(`RECORD ${n} of ${b.records.length} — ${r.recordUid}`);
    out.push(RULE);
    out.push(`Regime            : ${r.regime}`);
    out.push(`Drafted by        : ${r.draftedBy} at ${r.draftedAt}`);
    out.push(`Cleared by        : ${r.clearedBy ?? '(not cleared)'} at ${r.clearedAt ?? '-'}`);
    out.push(`Four eyes         : ${r.fourEyes}`);
    out.push(`Clearance reason  : ${r.clearanceReason ?? '(none recorded)'}`);
    out.push(`Named assets      : ${r.namedAssets.length ? r.namedAssets.join(', ') : '(none)'}`);
    out.push(`Member States     : ${r.jurisdictions.length ? r.jurisdictions.join(', ') : '(not recorded)'}`);
    out.push(`Consideration     : ${r.considerationKind}`);
    out.push(`Integrity         : ${r.integrity} (sha256 ${r.statementHash || '(none)'})`);
    out.push(THIN);
    out.push(...block('STATEMENT AS CLEARED', r.statementText));
    out.push(THIN);
    out.push(`Close-out state   : ${r.closeOutState}`);
    out.push(`Published at      : ${r.publishedAt ?? '(not recorded)'}`);
    out.push(`Permalink         : ${r.publishedPermalink ?? '(not recorded)'}`);
    out.push(
      `Published == cleared: ${
        r.publishedMatchesCleared === null ? '(no published text on file)' : String(r.publishedMatchesCleared)
      }`,
    );
    out.push(...block('STATEMENT AS PUBLISHED', r.publishedText));
    if (r.withdrawnAt) {
      out.push(`Withdrawn at      : ${r.withdrawnAt}`);
      out.push(`Withdrawal reason : ${r.withdrawalReason ?? '(none recorded)'}`);
    }
    out.push(THIN);
    out.push(...block('MESSAGE THIS ANSWERED (third party)', r.inboundContextExcerpt));
    out.push(`  hash: ${r.inboundContextHash ?? '(none)'}`);
    out.push(THIN);
    out.push('PRE-APPROVED CLAIMS USED (id @ version)');
    if (r.claimsUsed.length === 0) out.push('    (none linked)');
    for (const cl of r.claimsUsed) {
      out.push(
        `    ${cl.claim_id} @ v${cl.claim_version}`
        + `  [${cl.claim_category ?? 'uncategorised'}]`
        + `  ${cl.verbatim ? 'verbatim' : 'PARAPHRASED — not the pre-approved wording'}`,
      );
    }
    out.push(THIN);
    out.push('WHAT THE DESK KNEW AT CLEARANCE (snapshots, as at that moment)');
    out.push(`    mandatory elements : ${stable(r.mandatoryElements)}`);
    out.push(`    embargo state      : ${stable(r.embargoSnapshot)}`);
    out.push(`    holdings state     : ${stable(r.holdingsSnapshot)}`);
    out.push(`    desk state         : ${stable(r.deskState)}`);
    out.push(THIN);
    out.push('EVERY REFUSAL THAT FIRED');
    if (r.refusals.length === 0) out.push('    (none recorded)');
    for (const f of r.refusals) {
      out.push(`    ${f.fired_at}  ${f.code}  [${f.phase}]`);
      out.push(...wrap(f.sentence, 68).map((l) => `        ${l}`));
      out.push(`        rule: ${f.rule_cited}`);
      if (f.overridden) {
        out.push(
          `        OVERRIDDEN by ${f.overridden_by ?? '(unnamed)'}: `
          + `${f.override_reason ?? '(no reason recorded)'}`,
        );
      }
    }
    out.push(THIN);
    out.push('PROCESSOR TRANSFERS OF THIS RECORD (GDPR Art 30)');
    if (r.transfers.length === 0) out.push('    (none recorded)');
    for (const t of r.transfers) {
      out.push(
        `    ${t.occurred_at}  ${t.processor}${t.model ? `/${t.model}` : ''}  ${t.payload_kind}`
        + `  third-country=${t.third_country}  third-party-PD=${t.contains_third_party_personal_data}`
        + `  basis=${t.transfer_basis}`,
      );
      out.push(`        purpose: ${t.purpose}`);
    }
    out.push(THIN);
    out.push(
      `RETENTION: class=${r.retention.cls} basis=${r.retention.basis} expires=${r.retention.expiresAt}`,
    );
    if (r.retention.legalHold) {
      out.push(
        `    LEGAL HOLD until ${r.retention.legalHoldUntil ?? '(no end date)'}: `
        + `${r.retention.legalHoldReason ?? '(no reason recorded)'}`,
      );
    }
    out.push(THIN);
    out.push('COMPLETENESS OF THIS RECORD');
    if (r.completeness.length === 0) {
      out.push('    Every field above was reconstructed from stored data. Nothing is missing.');
    }
    for (const line of r.completeness) {
      out.push(`    [${line.state}] ${line.field}`);
      out.push(...wrap(line.why, 68).map((l) => `        ${l}`));
    }
    out.push('');
  }

  out.push(RULE);
  const body = out.join('\n');
  return `${body}\nBUNDLE DIGEST (sha256 of everything above): ${sha256Hex(body)}\n${RULE}\n`;
}

/** The digest printed at the foot of the bundle, available on its own for an audit row. */
export function bundleDigest(b: ExportBundle): string {
  const text = renderBundleText(b);
  const marker = 'BUNDLE DIGEST (sha256 of everything above): ';
  const at = text.indexOf(marker);
  return text.slice(at + marker.length, at + marker.length + 64);
}

/** JSON with sorted keys, so a snapshot prints identically on every machine. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
    }
    return val;
  }) ?? 'null';
}

/** Greedy word wrap. Deterministic, and it never breaks a word into a different word. */
function wrap(s: string, width: number): string[] {
  const words = String(s).split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '') lines.push(line);
  return lines.length === 0 ? [''] : lines;
}

/* ════════ §7 READING AND WRITING THE REGISTER ════════ */

const RECORD_COLUMNS = `
  record_uid, x_comment_id, draft_id, regime, drafted_by, drafted_at, cleared_by, cleared_at,
  clearance_reason, statement_text, statement_hash, published_text, published_hash, published_at,
  published_permalink, close_out_state, close_out_by, withdrawn_at, withdrawal_reason,
  inbound_context_hash, inbound_context_excerpt, context_minimised_at, mandatory_elements,
  embargo_snapshot, holdings_snapshot, desk_state, consideration_kind, named_assets, jurisdictions,
  snapshot_complete, snapshot_gaps, retention_class, retention_basis, retention_expires_at,
  legal_hold, legal_hold_reason, legal_hold_until`;

/**
 * Load everything a bundle needs for one window.
 *
 * The jurisdiction filter is `$3 = ANY(jurisdictions)` rather than a text match, because
 * Art 8(2) asks about the communications addressing prospective holders IN A MEMBER
 * STATE and a record can address several.
 *
 * `presentCommentIds` is read from the live queue so the bundle can tell a parent that
 * was never captured from one the 90-day sweep removed. It is a second query on purpose:
 * a join would silently drop records whose queue row is gone, which is the exact class of
 * quiet omission this whole file exists to prevent.
 */
export async function readBundleSource(pool: Pool, req: BundleRequest): Promise<BundleSource> {
  const registerPresent = await isRecordMigrated(pool);
  /*
   * READ FIRST — BEFORE THE 0061 GUARD, and not inside the `uids.length === 0` guard below.
   *
   * The empty-register case is exactly when this read matters most: on day one the register
   * holds nothing and the gate ledger holds every statement the desk cleared. Computing the
   * reconciliation only when there are records to reconcile against would have hidden the
   * finding in the one state where it is the entire answer.
   *
   * AND THE ABSENT-REGISTER CASE IS STRONGER STILL. This used to return before the read
   * happened at all, so `0062 present + 0061 absent` — the state in which 100% of what the
   * desk cleared is UNRECORDABLE — produced a `BundleSource` with no `clearance` key, and the
   * production said only that a migration was pending. `registerPresent` is passed down so
   * the ledger read can skip the two `marketing_record` statements (which would throw against
   * a table that does not exist) while still reading the gate ledger.
   */
  const clearance = await readClearanceLedger(pool, req, registerPresent);
  if (!registerPresent) {
    return {
      registerPresent: false, records: [], refusals: [], claims: [], transfers: [], clearance,
    };
  }
  const params: unknown[] = [req.windowFrom.toISOString(), req.windowTo.toISOString()];
  let where = 'drafted_at >= $1 AND drafted_at <= $2';
  if (req.jurisdiction) {
    params.push(req.jurisdiction);
    where += ' AND $3 = ANY(jurisdictions)';
  }
  const records = await pool.query(
    `SELECT ${RECORD_COLUMNS} FROM marketing_record WHERE ${where} ORDER BY drafted_at, record_uid`,
    params,
  );
  const uids = (records.rows as RecordRow[]).map((r) => r.record_uid);
  if (uids.length === 0) {
    return { registerPresent: true, records: [], refusals: [], claims: [], transfers: [], clearance };
  }
  const [refusals, claims, transfers, present] = await Promise.all([
    pool.query(
      `SELECT record_uid, code, sentence, rule_cited, phase, fired_at, overridden, overridden_by,
              override_reason
         FROM marketing_record_refusal WHERE record_uid = ANY($1) ORDER BY fired_at, code`,
      [uids],
    ),
    pool.query(
      `SELECT record_uid, claim_id, claim_version, claim_category, verbatim
         FROM marketing_record_claim WHERE record_uid = ANY($1) ORDER BY claim_id, claim_version`,
      [uids],
    ),
    pool.query(
      `SELECT record_uid, processor, model, purpose, payload_kind,
              contains_third_party_personal_data, third_country, transfer_basis, occurred_at
         FROM marketing_record_transfer WHERE record_uid = ANY($1) ORDER BY occurred_at, processor`,
      [uids],
    ),
    pool.query(
      `SELECT x_comment_id FROM marketing_x_reply WHERE x_comment_id = ANY($1)`,
      [(records.rows as RecordRow[]).map((r) => r.x_comment_id).filter((v): v is string => !!v)],
    ),
  ]);
  return {
    registerPresent: true,
    records: records.rows as RecordRow[],
    refusals: refusals.rows as RefusalRow[],
    claims: claims.rows as ClaimRow[],
    transfers: transfers.rows as TransferRow[],
    presentCommentIds: (present.rows as Array<{ x_comment_id: string }>).map((r) => r.x_comment_id),
    clearance,
  };
}

/**
 * THE PRODUCE-OR-ADMIT READ. One left join, expressed as up to four statements.
 *
 * ── WHY NOT ONE STATEMENT ──
 * Written as a single `LEFT JOIN marketing_record ON statement_hash = text_sha256`, two
 * records sharing a statement digest (the same words drafted twice — the digest does not
 * include the instant, the `record_uid` does) FAN THE RESULT OUT and the unrecorded count
 * silently inflates. Deduplicating in SQL means a lateral per row, and there is no index on
 * `statement_hash` in 0061 or on `text_sha256` in 0062, so a lateral is a sequential scan
 * per cleared statement. Two set-membership reads are one scan each and the bucketing is
 * then done by `reconcileClearances`, which is pure and can be tested against the exact
 * three-bucket contract. `presentCommentIds` above is a second query for the same family of
 * reason, stated in that function's comment.
 *
 * ── WHAT IS AND IS NOT WINDOW-SCOPED, WHICH IS NOT SYMMETRIC ──
 * The CLEARANCES are window-scoped: the production answers for a period. The RECORDS are
 * NOT, because "was this statement ever recorded?" is not a windowed question — a statement
 * cleared inside the window and recorded a week after it is recorded, and a window-scoped
 * lookup would report it as a gap that does not exist.
 *
 * ── THE COST, STATED ──
 * `created_at DESC` on 0062 is indexed (0062:123) so the clearance read is bounded. Neither
 * digest column is indexed, so each `= ANY(...)` read is one sequential scan of
 * `marketing_record`. That is acceptable for an on-demand regulatory production and would
 * not be for a dashboard poll; no caller polls this. Adding the indexes needs a migration
 * this lane does not own.
 */
async function readClearanceLedger(
  pool: Pool,
  req: BundleRequest,
  registerPresent: boolean,
): Promise<ClearanceLedgerSource> {
  /*
   * BOTH TABLES PROBED IN ONE STATEMENT, EACH ANSWERING ONLY FOR ITSELF — the idiom in
   * `routes/marketingGates.ts probeStorage`. The gate ledger and the inbound queue are
   * separate migrations and either can be missing alone.
   */
  let gate = false;
  let queue = false;
  try {
    const probe = await pool.query(
      `SELECT to_regclass('public.marketing_outbound_gate_decision') IS NOT NULL AS gate,
              to_regclass('public.marketing_x_reply')                IS NOT NULL AS queue`,
    );
    const row = (probe.rows[0] ?? {}) as Record<string, unknown>;
    gate = Boolean(row.gate);
    queue = Boolean(row.queue);
  } catch {
    // A failed probe is NOT a present ledger. `ledgerPresent: false` makes the bundle
    // withdraw the completeness claim, which is the right answer to "we could not look".
    return { ledgerPresent: false, cleared: [], recordedDigests: [], registerPresent };
  }
  if (!gate) return { ledgerPresent: false, cleared: [], recordedDigests: [], registerPresent };

  const cleared = await pool.query(
    /*
     * `allowed = true` AND `phase = 'clearance'`. A refused clearance produced no statement
     * to record, and a `draft`-phase pass is not a clearance — counting either would report
     * gaps that are not gaps and bury the ones that are.
     */
    `SELECT id::text AS id, reply_id::text AS reply_id, actor, created_at, text_sha256, disposition
       FROM marketing_outbound_gate_decision
      WHERE phase = 'clearance' AND allowed = true
        AND created_at >= $1 AND created_at <= $2
      ORDER BY created_at, id`,
    [req.windowFrom.toISOString(), req.windowTo.toISOString()],
  );
  const clearedRows = cleared.rows as ClearedStatementRow[];
  if (clearedRows.length === 0) {
    // A MEASURED zero: the ledger was read and this desk cleared nothing in the window.
    // `replyComments` is supplied (empty) so the reconciliation does not report "the queue
    // was not checked" about a set with nothing in it to check.
    return {
      ledgerPresent: true, cleared: [], recordedDigests: [], replyComments: [], registerPresent,
    };
  }

  const hashes = [...new Set(clearedRows.map((r) => r.text_sha256))];
  const replyIds = [...new Set(clearedRows.map((r) => r.reply_id).filter((v): v is string => !!v))];

  /*
   * SKIPPED WHEN 0061 IS UNAPPLIED, and the empty result is then a PROVEN empty rather than
   * an unread one: a table that does not exist holds no row that could record anything. The
   * two `marketing_record` statements would throw against it, and a thrown read here would
   * take the gate-ledger finding down with it — which is exactly how the absent-register
   * state used to lose the finding entirely.
   */
  const byHash = registerPresent
    ? await pool.query(
      `SELECT record_uid, statement_hash, x_comment_id, drafted_at
         FROM marketing_record WHERE statement_hash = ANY($1)`,
      [hashes],
    )
    : { rows: [] as unknown[] };

  /*
   * THE SECONDARY CORRELATION, and it only exists to keep `hash_differs` out of the
   * unrecorded bucket. `marketing_x_reply` is destroyed by the 90-day sweep in 0046, so
   * beyond 90 days this resolves nothing and the reconciliation reports `thread_row_swept`
   * rather than pretending an edit was ruled out. When 0046 is absent entirely,
   * `replyComments` is left UNDEFINED — a weaker statement than an empty list, and the
   * distinction is what `thread_not_checked` renders.
   */
  let replyComments: ReplyCommentRow[] | undefined;
  let commentIds: string[] = [];
  if (queue && replyIds.length > 0) {
    const q = await pool.query(
      `SELECT id::text AS id, x_comment_id FROM marketing_x_reply WHERE id = ANY($1::bigint[])`,
      [replyIds],
    );
    replyComments = q.rows as ReplyCommentRow[];
    commentIds = replyComments.map((r) => r.x_comment_id).filter((v): v is string => !!v);
  } else if (queue) {
    // The queue exists and no cleared statement answered a reply. Nothing to look up, and
    // an empty list is the honest report: it was checked.
    replyComments = [];
  }

  const digests = [...(byHash.rows as RecordedDigestRow[])];
  if (registerPresent && commentIds.length > 0) {
    // Indexed (`marketing_record_comment_idx`, 0061:244), unlike the digest read above.
    const byComment = await pool.query(
      `SELECT record_uid, statement_hash, x_comment_id, drafted_at
         FROM marketing_record WHERE x_comment_id = ANY($1)`,
      [commentIds],
    );
    const seen = new Set(digests.map((d) => d.record_uid));
    for (const d of byComment.rows as RecordedDigestRow[]) {
      if (!seen.has(d.record_uid)) digests.push(d);
    }
  }

  return {
    ledgerPresent: true,
    cleared: clearedRows,
    recordedDigests: digests,
    registerPresent,
    ...(replyComments === undefined ? {} : { replyComments }),
  };
}

/** Gate, read, compose, render, digest. The one call a route needs. */
export async function produceExportBundle(
  pool: Pool,
  req: BundleRequest,
): Promise<RecordResult<{ bundle: ExportBundle; text: string; digest: string }>> {
  const source = await readBundleSource(pool, req);
  const composed = composeExportBundle(req, source);
  if (!composed.ok) return composed;
  const text = renderBundleText(composed.value);
  return { ok: true, value: { bundle: composed.value, text, digest: bundleDigest(composed.value) } };
}

/** What a caller supplies to create a record. Snapshots are passed through opaquely. */
export interface WriteRecordInput {
  xCommentId: string | null;
  draftId: number | null;
  regime: string;
  draftedBy: string;
  draftedAt: Date;
  clearedBy?: string | null;
  clearedAt?: Date | null;
  clearanceReason?: string | null;
  statementText: string;
  /** The third party's words are HASHED here; the excerpt is only stored if the DPO allows it. */
  inboundContextText?: string | null;
  inboundContextExcerpt?: string | null;
  mandatoryElements?: unknown;
  embargoSnapshot?: unknown;
  holdingsSnapshot?: unknown;
  deskState?: unknown;
  considerationKind?: string;
  namedAssets?: readonly string[];
  jurisdictions?: readonly string[];
  /** Named absences at clearance time. A non-empty list means `snapshot_complete = false`. */
  snapshotGaps?: readonly string[];
}

/**
 * Write the record. Idempotent by `record_uid`, which is content-derived — so a retry
 * writes nothing new and a DIFFERENT statement cannot land on an existing uid.
 *
 * Four-eyes is NOT decided here. The clearance path owns that decision (and owns the
 * shared `SELF_APPROVAL_FORBIDDEN` refusal); this function passes the recorded pair
 * through, the schema CHECK in 0061 rejects an identical pair outright, and the bundle
 * prints `fourEyes: same_human` if one ever reaches the table by another route. A record
 * that quietly normalised that away would be the fiction.
 */
export async function writeRecord(
  pool: Pool,
  input: WriteRecordInput,
): Promise<RecordResult<{ recordUid: string; created: boolean }>> {
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `This statement cannot be recorded: migration ${RECORD_MIGRATION} has not been applied here.`,
      `Apply ${RECORD_MIGRATION}. Clearing a statement that cannot be recorded would produce a `
      + 'communication with no evidence behind it.',
    );
  }
  const draftedBy = (input.draftedBy ?? '').trim();
  const statement = input.statementText ?? '';
  if (draftedBy === '') {
    return recordRefusal(
      'RECORD_ACTOR_UNNAMED',
      'A record needs the named human who drafted the statement. Blank is not a name.',
      'Pass the member id of the drafter. "The system wrote it" is not a control.',
    );
  }
  if (statement.trim() === '') {
    return recordRefusal(
      'RECORD_CLOSE_OUT_TEXT_ABSENT',
      'There is no statement text to record.',
      'Record the words that were cleared. An empty record is worse than no record.',
    );
  }
  const retention = retentionExpiry(input.draftedAt, 'lcx_statement');
  if (!retention.ok) return retention;

  const statementHash = sha256Hex(statement);
  const recordUid = deriveRecordUid({
    xCommentId: input.xCommentId,
    draftId: input.draftId,
    statementHash,
    draftedAt: input.draftedAt,
  });
  const gaps = [...(input.snapshotGaps ?? [])];
  const res = await pool.query(
    `INSERT INTO marketing_record
       (record_uid, x_comment_id, draft_id, regime, drafted_by, drafted_at, cleared_by, cleared_at,
        clearance_reason, statement_text, statement_hash, inbound_context_hash,
        inbound_context_excerpt, mandatory_elements, embargo_snapshot, holdings_snapshot,
        desk_state, consideration_kind, named_assets, jurisdictions, snapshot_complete,
        snapshot_gaps, retention_class, retention_basis, retention_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
             'lcx_statement',$23,$24)
     ON CONFLICT (record_uid) DO NOTHING
     RETURNING record_uid`,
    [
      recordUid,
      input.xCommentId,
      input.draftId,
      input.regime,
      draftedBy,
      input.draftedAt.toISOString(),
      input.clearedBy ?? null,
      input.clearedAt ? input.clearedAt.toISOString() : null,
      input.clearanceReason ?? null,
      statement,
      statementHash,
      input.inboundContextText ? sha256Hex(input.inboundContextText) : null,
      input.inboundContextExcerpt ?? null,
      JSON.stringify(input.mandatoryElements ?? []),
      JSON.stringify(input.embargoSnapshot ?? {}),
      JSON.stringify(input.holdingsSnapshot ?? {}),
      JSON.stringify(input.deskState ?? {}),
      input.considerationKind ?? 'unknown',
      [...(input.namedAssets ?? [])],
      [...(input.jurisdictions ?? [])],
      gaps.length === 0,
      gaps,
      RETENTION_BASIS,
      retention.value.expiresAt.toISOString(),
    ],
  );
  return { ok: true, value: { recordUid, created: (res.rowCount ?? 0) > 0 } };
}

/**
 * Write the refusals that fired. `ON CONFLICT DO NOTHING` against the (uid, code, phase)
 * unique key: a retry is a retry, and it must never rewrite the sentence a human saw.
 */
export async function writeRefusals(
  pool: Pool,
  recordUid: string,
  refusals: ReadonlyArray<{ code: string; sentence: string; rule: string; phase?: string }>,
): Promise<number> {
  let written = 0;
  for (const r of refusals) {
    const res = await pool.query(
      `INSERT INTO marketing_record_refusal (record_uid, code, sentence, rule_cited, phase)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (record_uid, code, phase) DO NOTHING`,
      [recordUid, r.code, r.sentence, r.rule, r.phase ?? 'draft'],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Which pre-approved claims were used, and at which version. */
export async function writeClaims(
  pool: Pool,
  recordUid: string,
  claims: ReadonlyArray<{
    claimId: string;
    version: number;
    category?: string | null;
    verbatim: boolean;
    usedText?: string | null;
  }>,
): Promise<number> {
  let written = 0;
  for (const c of claims) {
    const res = await pool.query(
      `INSERT INTO marketing_record_claim
         (record_uid, claim_id, claim_version, claim_category, verbatim, used_text_hash)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (record_uid, claim_id, claim_version) DO NOTHING`,
      [
        recordUid, c.claimId, c.version, c.category ?? null, c.verbatim,
        c.usedText ? sha256Hex(c.usedText) : null,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/**
 * THE PASTE-BACK. The only way this system can ever learn what was actually published,
 * because it holds no credential and has no posting path.
 *
 * IMMUTABLE: a second close-out with the SAME text is a harmless retry; with DIFFERENT
 * text it is refused. Letting the published text be rewritten would turn the record from
 * evidence into whatever the last editor preferred — and a takedown-then-repost would
 * overwrite the very words a regulator asked about.
 */
export async function closeOutPublication(
  pool: Pool,
  input: {
    recordUid: string;
    publishedText: string;
    publishedAt: Date | null;
    permalink?: string | null;
    by: string;
  },
): Promise<RecordResult<{ publishedHash: string; matchesCleared: boolean }>> {
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `Nothing can be closed out: migration ${RECORD_MIGRATION} has not been applied here.`,
      `Apply ${RECORD_MIGRATION}.`,
    );
  }
  const by = (input.by ?? '').trim();
  const text = input.publishedText ?? '';
  if (by === '') {
    return recordRefusal(
      'RECORD_ACTOR_UNNAMED',
      'A close-out records that a named human posted this. Blank is not a name.',
      'Pass the member id of the person who posted it.',
    );
  }
  if (text.trim() === '') {
    return recordRefusal(
      'RECORD_CLOSE_OUT_TEXT_ABSENT',
      'A close-out with no published text records nothing. Paste what was actually posted.',
      'If it was not posted, close it out as not_sent instead — that is also a decision worth recording.',
    );
  }
  const found = await pool.query(
    `SELECT statement_text, published_text FROM marketing_record WHERE record_uid = $1`,
    [input.recordUid],
  );
  const row = found.rows[0] as { statement_text: string; published_text: string | null } | undefined;
  if (!row) {
    return recordRefusal(
      'RECORD_NOT_FOUND',
      `No record ${input.recordUid} exists, so there is nothing to attach a publication to.`,
      'Check the record id. A published statement with no record is the gap this compartment exists to close.',
    );
  }
  if (row.published_text != null && row.published_text !== text) {
    return recordRefusal(
      'RECORD_CLOSE_OUT_IMMUTABLE',
      'This record already carries a different published text. A publication record cannot be '
      + 'rewritten — that is what makes it evidence.',
      'If the post was edited or replaced, record the new text as a NEW record and link the '
      + 'withdrawal of this one.',
    );
  }
  const publishedHash = sha256Hex(text);
  await pool.query(
    `UPDATE marketing_record
        SET published_text = $2, published_hash = $3, published_at = $4, published_permalink = $5,
            close_out_by = $6, close_out_at = now(), close_out_state = 'published', updated_at = now()
      WHERE record_uid = $1`,
    [
      input.recordUid, text, publishedHash,
      input.publishedAt ? input.publishedAt.toISOString() : null,
      input.permalink ?? null, by,
    ],
  );
  return { ok: true, value: { publishedHash, matchesCleared: row.statement_text === text } };
}

/**
 * The outstanding paste-backs. This count is the honest measure of whether the record is
 * evidence or intention, so it is a first-class read rather than something buried.
 */
export async function listOutstandingCloseOuts(
  pool: Pool,
  limit = 50,
): Promise<RecordResult<Array<{ record_uid: string; drafted_at: string; drafted_by: string }>>> {
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `The outstanding paste-back count is unknown: migration ${RECORD_MIGRATION} is not applied.`,
      `Apply ${RECORD_MIGRATION}. A zero shown here would be a lie, so nothing is shown.`,
    );
  }
  const res = await pool.query(
    `SELECT record_uid, drafted_at, drafted_by FROM marketing_record
      WHERE close_out_state = 'outstanding' ORDER BY drafted_at ASC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return { ok: true, value: res.rows as Array<{ record_uid: string; drafted_at: string; drafted_by: string }> };
}

/* ════════ §8 GDPR: THE TRANSFER REGISTER, ACCESS, ERASURE ════════ */

/**
 * Record that personal data left for a processor. GDPR Art 30(1)(e) and Art 44-49.
 *
 * WHY THIS IS A REFUSAL AND NOT A DEFAULT: a caller must state, explicitly, whether
 * third-party personal data was in the payload and whether it left the EEA. Defaulting
 * either to `false` would produce a register that reads clean because nobody answered,
 * and that register would be worse than none — it would be evidence of a control that
 * never existed.
 *
 * `transfer_basis` may honestly be `not_assessed`, which is the state today. That is a
 * queryable liability, not a silent one.
 */
export async function recordProcessorTransfer(
  pool: Pool,
  input: {
    recordUid?: string | null;
    xCommentId?: string | null;
    handle?: string | null;
    processor: string;
    model?: string | null;
    purpose: string;
    payloadKind: string;
    payload: string;
    containsThirdPartyPersonalData: boolean;
    thirdCountry: boolean;
    transferBasis?: 'not_assessed' | 'adequacy_art_45' | 'sccs_art_46' | 'derogation_art_49' | 'no_transfer_eea_only';
    requestedBy?: string | null;
    occurredAt?: Date;
  },
): Promise<RecordResult<{ payloadHash: string }>> {
  if (
    typeof input.containsThirdPartyPersonalData !== 'boolean'
    || typeof input.thirdCountry !== 'boolean'
    || (input.processor ?? '').trim() === ''
    || (input.purpose ?? '').trim() === ''
  ) {
    return recordRefusal(
      'RECORD_TRANSFER_SCOPE_UNDECLARED',
      'A transfer cannot be logged without naming the processor, the purpose, whether third-party '
      + 'personal data was in the payload, and whether it left the EEA.',
      'State all four at the call site. An unanswered field would make the register read clean for '
      + 'the wrong reason.',
    );
  }
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `The transfer cannot be recorded: migration ${RECORD_MIGRATION} is not applied, so this `
      + 'disclosure to a processor would happen with no Art 30 entry behind it.',
      `Apply ${RECORD_MIGRATION} before enabling model-assisted drafting on this environment.`,
    );
  }
  const payloadHash = sha256Hex(input.payload ?? '');
  await pool.query(
    `INSERT INTO marketing_record_transfer
       (record_uid, x_comment_id, handle_hash, processor, model, purpose, payload_kind, payload_hash,
        contains_third_party_personal_data, third_country, transfer_basis, requested_by, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, COALESCE($13, now()))`,
    [
      input.recordUid ?? null,
      input.xCommentId ?? null,
      input.handle ? handlePseudonym(input.handle) : null,
      input.processor,
      input.model ?? null,
      input.purpose,
      input.payloadKind,
      payloadHash,
      input.containsThirdPartyPersonalData,
      input.thirdCountry,
      input.transferBasis ?? 'not_assessed',
      input.requestedBy ?? null,
      input.occurredAt ? input.occurredAt.toISOString() : null,
    ],
  );
  return { ok: true, value: { payloadHash } };
}

export interface SubjectAccessResult {
  readonly handleQueried: string;
  readonly replies: ReadonlyArray<Record<string, unknown>>;
  readonly drafts: ReadonlyArray<Record<string, unknown>>;
  readonly transfers: ReadonlyArray<Record<string, unknown>>;
  /** Pointers only. LCX's own cleared statements are not the subject's personal data. */
  readonly recordsReferencing: ReadonlyArray<{ record_uid: string; drafted_at: string }>;
  readonly notes: readonly string[];
}

/**
 * GDPR Art 15 access. Everything this compartment holds about one handle, plus the
 * sentences that make the answer honest.
 *
 * Uses `lower(author_handle)` so it hits the index 0061 adds and so a request from
 * `@lcxfan` finds rows stored as `@LCXFan`.
 *
 * The access is LOGGED, which is why it needs the register: an access request answered
 * with no record that it was answered is not a fulfilled request, and the log is also
 * what shows a pattern of requests being handled rather than quietly dropped.
 */
export async function subjectAccess(
  pool: Pool,
  input: { handle: string; fulfilledBy: string; requestedAt?: Date | null },
): Promise<RecordResult<SubjectAccessResult>> {
  const handle = normaliseHandle(input.handle);
  const by = (input.fulfilledBy ?? '').trim();
  if (handle === '') {
    return recordRefusal(
      'RECORD_SUBJECT_UNIDENTIFIED',
      'No handle was given, so there is no data subject to answer for.',
      'Supply the X handle the request came from. This compartment holds nothing else that '
      + 'identifies a person.',
    );
  }
  if (by === '') {
    return recordRefusal(
      'RECORD_ACTOR_UNNAMED',
      'An access request is answered by a named human who is accountable for the answer.',
      'Pass the member id of the person fulfilling it.',
    );
  }
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `An access request cannot be recorded as fulfilled: migration ${RECORD_MIGRATION} is not `
      + 'applied, so there is nowhere to log that it was answered.',
      `Apply ${RECORD_MIGRATION}. Answering without logging would leave no proof the right was honoured.`,
    );
  }

  const replies = await pool.query(
    `SELECT id, x_comment_id, x_post_id, author_handle, author_display, body, posted_at, received_at,
            status, source_grade, source_kind, retention_expires_at
       FROM marketing_x_reply WHERE lower(author_handle) = $1 ORDER BY received_at`,
    [handle],
  );
  const replyIds = (replies.rows as Array<{ id: number }>).map((r) => r.id);
  const drafts = replyIds.length
    ? await pool.query(
        `SELECT id, reply_id, body, used_llm, flagged, status, approved_by, approved_at, created_at
           FROM marketing_reply_draft WHERE reply_id = ANY($1) ORDER BY created_at`,
        [replyIds],
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const transfers = await pool.query(
    `SELECT processor, model, purpose, payload_kind, third_country, transfer_basis, occurred_at
       FROM marketing_record_transfer WHERE handle_hash = $1 ORDER BY occurred_at`,
    [handlePseudonym(handle)],
  );
  const commentIds = (replies.rows as Array<{ x_comment_id: string }>).map((r) => r.x_comment_id);
  const records = commentIds.length
    ? await pool.query(
        `SELECT record_uid, drafted_at FROM marketing_record
          WHERE x_comment_id = ANY($1) ORDER BY drafted_at`,
        [commentIds],
      )
    : { rows: [] as Array<{ record_uid: string; drafted_at: string }> };

  const notes = [
    'Lawful basis for holding these rows is GDPR Art 6(1)(f) (legitimate interests: answering '
    + 'customers who write to LCX in public). NO legitimate-interests assessment is on file today '
    + 'and no privacy notice is referenced for the Art 14 notice duty. Both gaps are real and are '
    + 'stated rather than papered over.',
    'LCX\'s own cleared statements are listed as pointers only. They are LCX\'s regulatory records '
    + 'under MiCA Art 68(9), retained on the inferred five-year clock, and they are not disclosed '
    + 'here as the requester\'s personal data.',
    'Nothing in this compartment scores, ranks or profiles a handle over time. Such a feature '
    + 'would need a DPIA under GDPR Art 35(3)(a) first and is refused in code until then.',
  ];
  if (replies.rows.length === 0) {
    notes.push(
      'No rows are held for this handle. Given the 90-day retention sweep in migration 0046, that '
      + 'may mean nothing was ever received OR that what was received has already been deleted. '
      + 'This system cannot distinguish the two, and does not pretend to.',
    );
  }

  await pool.query(
    `INSERT INTO marketing_subject_access_log
       (handle_hash, requested_at, fulfilled_by, rows_disclosed, scope)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      handlePseudonym(handle),
      input.requestedAt ? input.requestedAt.toISOString() : null,
      by,
      replies.rows.length + drafts.rows.length + transfers.rows.length,
      'replies+drafts+transfers',
    ],
  );

  return {
    ok: true,
    value: {
      handleQueried: handle,
      replies: replies.rows as Array<Record<string, unknown>>,
      drafts: drafts.rows as Array<Record<string, unknown>>,
      transfers: transfers.rows as Array<Record<string, unknown>>,
      recordsReferencing: records.rows as Array<{ record_uid: string; drafted_at: string }>,
      notes,
    },
  };
}

export type ErasureBasis =
  | 'art_17_1_a_purpose_fulfilled'
  | 'art_17_1_b_consent_withdrawn'
  | 'art_17_1_c_objection'
  | 'data_subject_request'
  | 'retention_expiry';

export interface ErasureOutcome {
  readonly repliesErased: number;
  readonly draftsErased: number;
  readonly recordsRetained: number;
  readonly excerptsMinimised: number;
  readonly retainedBasis: string | null;
  readonly explanation: string;
}

/**
 * GDPR Art 17 erasure, by handle.
 *
 * WHAT IT DOES, precisely, because a half-honest erasure is the dangerous kind:
 *   · deletes the inbound rows for that handle — drafts go with them on 0046's cascade;
 *   · NULLs any third-party excerpt carried inside LCX's own records and stamps
 *     `context_minimised_at`, so the stranger's words go even where LCX's words stay;
 *   · RETAINS LCX's own cleared statements under Art 17(3)(b) — compliance with a legal
 *     obligation, here the inferred Art 68(9) retention — and REPORTS that it did, with
 *     the count and the exemption. Silently keeping them would be the actual violation;
 *   · writes one `marketing_erasure_log` row recording THAT erasure happened, never WHAT
 *     was erased. An erasure log holding the erased text is the copy that defeats the
 *     erasure.
 */
export async function eraseByHandle(
  pool: Pool,
  input: { handle: string; decidedBy: string; basis: ErasureBasis; requestedAt?: Date | null; notes?: string | null },
): Promise<RecordResult<ErasureOutcome>> {
  const handle = normaliseHandle(input.handle);
  const by = (input.decidedBy ?? '').trim();
  if (handle === '') {
    return recordRefusal(
      'RECORD_SUBJECT_UNIDENTIFIED',
      'No handle was given, so there is nothing to erase and a blanket delete will not be run.',
      'Supply the handle from the request.',
    );
  }
  if (by === '') {
    return recordRefusal(
      'RECORD_ACTOR_UNNAMED',
      'An erasure is a named human\'s decision. Blank is not a name.',
      'Pass the member id of the person who decided it.',
    );
  }
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `Erasure will not run: migration ${RECORD_MIGRATION} is not applied, so there is nowhere to `
      + 'record that it happened — and an unrecorded deletion is indistinguishable from data loss.',
      `Apply ${RECORD_MIGRATION} first. The rows stay until the erasure can be evidenced.`,
    );
  }

  // Identify first, so the log can state what was affected after the rows are gone.
  const target = await pool.query(
    `SELECT id, x_comment_id FROM marketing_x_reply WHERE lower(author_handle) = $1`,
    [handle],
  );
  const ids = (target.rows as Array<{ id: number; x_comment_id: string }>).map((r) => r.id);
  const commentIds = (target.rows as Array<{ id: number; x_comment_id: string }>)
    .map((r) => r.x_comment_id)
    .filter((v): v is string => !!v);

  const draftCount = ids.length
    ? await pool.query(
        `SELECT count(*)::int AS n FROM marketing_reply_draft WHERE reply_id = ANY($1)`,
        [ids],
      )
    : { rows: [{ n: 0 }] };

  let excerptsMinimised = 0;
  let recordsRetained = 0;
  if (commentIds.length) {
    const minimised = await pool.query(
      `UPDATE marketing_record
          SET inbound_context_excerpt = NULL, context_minimised_at = now(), updated_at = now()
        WHERE x_comment_id = ANY($1) AND inbound_context_excerpt IS NOT NULL`,
      [commentIds],
    );
    excerptsMinimised = minimised.rowCount ?? 0;
    const retained = await pool.query(
      `SELECT count(*)::int AS n FROM marketing_record WHERE x_comment_id = ANY($1)`,
      [commentIds],
    );
    recordsRetained = (retained.rows[0] as { n: number } | undefined)?.n ?? 0;
  }

  const deleted = ids.length
    ? await pool.query(`DELETE FROM marketing_x_reply WHERE id = ANY($1)`, [ids])
    : { rowCount: 0 };

  const retainedBasis = recordsRetained > 0 ? 'art_17_3_b' : null;
  const explanation = recordsRetained > 0
    ? `${deleted.rowCount ?? 0} inbound row(s) and ${(draftCount.rows[0] as { n: number }).n} draft(s) `
      + `erased. ${recordsRetained} of LCX's own cleared statements that referenced this handle are `
      + 'RETAINED under Art 17(3)(b) (compliance with a legal obligation — the inferred MiCA Art '
      + `68(9) retention). ${excerptsMinimised} third-party excerpt(s) inside those records were `
      + 'removed, so the retained records hold LCX\'s words and a hash, not the requester\'s words.'
    : `${deleted.rowCount ?? 0} inbound row(s) and ${(draftCount.rows[0] as { n: number }).n} draft(s) `
      + 'erased. No LCX statement referenced this handle, so nothing was retained.';

  await pool.query(
    `INSERT INTO marketing_erasure_log
       (handle_hash, requested_at, decided_by, basis, replies_erased, drafts_erased,
        records_retained, retained_basis, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      handlePseudonym(handle),
      input.requestedAt ? input.requestedAt.toISOString() : null,
      by,
      input.basis,
      deleted.rowCount ?? 0,
      (draftCount.rows[0] as { n: number }).n,
      recordsRetained,
      retainedBasis,
      input.notes ?? null,
    ],
  );

  return {
    ok: true,
    value: {
      repliesErased: deleted.rowCount ?? 0,
      draftsErased: (draftCount.rows[0] as { n: number }).n,
      recordsRetained,
      excerptsMinimised,
      retainedBasis,
      explanation,
    },
  };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  THE ONE PLACE PER-HANDLE SCORING IS ENABLED. IT IS OFF.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * `null` means OFF, and OFF is the only correct value until `DPIA_MARKETING.md` is signed
 * under its §12 by a named human. Setting this to a string ASSERTS THAT A SIGNED DPIA
 * EXISTS and that this is its reference — a claim a person makes, not a default.
 *
 * DO NOT SET IT TO ENABLE A TEST. Tests pass `dpiaRef` explicitly and assert the refusal;
 * `__tests__/dpiaGate.test.ts` and `__tests__/dpiaGateSource.test.ts` are written against
 * the OFF state and one of them reads this file's source.
 *
 * WHY A CONSTANT AND NOT A CONFIG (DPIA_MARKETING.md §11.3 records the full table):
 *   · an ENV VAR would let anyone with deploy access begin systematic evaluation of
 *     natural persons with no DPIA, no review and no trace in the repository;
 *   · a DATABASE ROW would make the gate depend on migration state and readable only
 *     after I/O, destroying the property that this check cannot be reached through a
 *     query;
 *   · DELETING `scoreHandleOverTime` entirely is a legitimate fourth option, not a
 *     rhetorical one — if the per-reply signals are sufficient, removing the capability
 *     removes the Art 35 exposure rather than governing it. That is open question O5.
 *
 * ══ THE COUPLED EDIT NOBODY MAY FORGET ══
 * `subjectAccess` tells every Art 15 requester "Nothing in this compartment scores, ranks
 * or profiles a handle over time" (see the `notes` array above, at the Art 15 answer).
 * THAT SENTENCE BECOMES FALSE THE MOMENT THIS CONSTANT IS SET, and a false Art 15 answer
 * is worse than none. Whoever sets it rewrites that note in the same commit;
 * `dpiaGateSource.test.ts` is what fails if they do not.
 */
export const PER_HANDLE_SCORING_DPIA: string | null = null;

/**
 * THE DPIA GATE. Per-handle scoring over time is refused, not warned about.
 *
 * Accumulating a judgement about a named human across their posts — a reputation score,
 * a "difficult account" flag, a bot-likelihood that persists — is systematic evaluation
 * under GDPR Art 35(3)(a) and needs a DPIA BEFORE it ships. A comment saying so would be
 * decoration; a function that refuses is the control.
 *
 * ══ WHAT CHANGED, AND WHY THE OLD CHECK WAS NOT ENOUGH ══
 * This used to refuse only on an EMPTY reference, so ANY non-empty string opened the gate:
 * `scoreHandleOverTime(h, { dpiaRef: 'x' })` passed, and nothing in the codebase named the
 * capability's state, so "is scoring on?" was not a question `grep` could answer. The
 * reference now has to EQUAL the one a human committed to `PER_HANDLE_SCORING_DPIA`, which
 * is `null` — so there is no string that opens it, and the gate is closed by construction
 * rather than by everyone remembering to pass nothing.
 *
 * Deliberately synchronous and I/O-free: it must be impossible to reach a query.
 */
export function scoreHandleOverTime(
  _handle: string,
  opts: { dpiaRef?: string | null } = {},
): RecordResult<{ dpiaRef: string }> {
  const ref = (opts.dpiaRef ?? '').trim();
  if (PER_HANDLE_SCORING_DPIA === null || ref !== PER_HANDLE_SCORING_DPIA) {
    return recordRefusal(
      'RECORD_DPIA_ABSENT',
      'Scoring a handle over time is systematic evaluation of a natural person and is refused: no '
      + 'data protection impact assessment is on file for it.',
      'A DPIA must be completed and referenced before any per-handle score exists. Until then, '
      + 'judge the message in front of you, not the person behind it.',
    );
  }
  return { ok: true, value: { dpiaRef: ref } };
}

/**
 * The record retention sweep. Storage limitation (GDPR Art 5(1)(e)) applies to LCX's own
 * records too, so they expire — but never while a legal hold stands, which is the whole
 * reason Art 68(9)'s seven-year extension exists.
 *
 * Deliberately NOT wired to the ingest tick. The adversarial pass found that 0046's sweep
 * only runs when the mail poller runs, so disabling one cron silently stops retention; a
 * caller here is expected to schedule this independently.
 */
export async function sweepExpiredRecords(pool: Pool): Promise<RecordResult<number>> {
  if (!(await isRecordMigrated(pool))) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `No sweep ran: migration ${RECORD_MIGRATION} is not applied on this environment.`,
      `Apply ${RECORD_MIGRATION}.`,
    );
  }
  const res = await pool.query(
    `DELETE FROM marketing_record
      WHERE retention_expires_at < now()
        AND legal_hold = false
        AND (legal_hold_until IS NULL OR legal_hold_until < now())`,
  );
  return { ok: true, value: res.rowCount ?? 0 };
}
