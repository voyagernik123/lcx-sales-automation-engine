import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

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
  | 'RECORD_TRANSFER_SCOPE_UNDECLARED';

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
}

const byStringAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
  if (!data.registerPresent) {
    return recordRefusal(
      'RECORD_REGISTER_ABSENT',
      `The record register does not exist on this environment, so no communication can be `
      + `produced — not even to say there were none. Migration ${RECORD_MIGRATION} has not been applied.`,
      `Apply ${RECORD_MIGRATION} by hand in the SQL editor. Until then this surface refuses `
      + 'rather than returning an empty bundle that would read as "we published nothing".',
    );
  }
  if (data.records.length === 0) {
    return recordRefusal(
      'RECORD_REGISTER_EMPTY',
      'The register exists and holds NO communication in this window. It is empty — this is not '
      + 'a finding that LCX published nothing, only that nothing was recorded.',
      'If communications were published in this window, they were published without a record and '
      + 'that gap is the finding. Widen the window, or say plainly that the register was empty.',
    );
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
      caveats: [
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
  if (!(await isRecordMigrated(pool))) {
    return { registerPresent: false, records: [], refusals: [], claims: [], transfers: [] };
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
    return { registerPresent: true, records: [], refusals: [], claims: [], transfers: [] };
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
