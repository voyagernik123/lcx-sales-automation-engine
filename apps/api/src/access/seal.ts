import { createHash } from 'node:crypto';
import type pg from 'pg';

/**
 * THE AUDIT SEAL — the hash chain six files already claimed existed, and the
 * verifier that refuses to speak for the rows it cannot cover.
 *
 * WHAT WAS FALSE. `db/migrations/0000_equal_beyonder.sql:1-9` creates `audit_log`
 * as seven columns with no constraints: no chain, no append-only guarantee,
 * nothing stopping an UPDATE or a DELETE. `0029_spine.sql:6` calls it "the
 * hash-chained audit_log" in prose, and so do `actions/registry.ts:5`,
 * `gps/actions.ts:10`, `intel/actions.ts:77`, `gps/loop.ts:480`,
 * `gps/deliveryDesk.ts:881`, `db/schema.ts:651` and `shared/src/actions.ts:5`.
 * The only chain that existed anywhere in the repository was
 * `web/src/stores/useAuditStore.ts` — browser-local, user-clearable, and a
 * 64-bit non-cryptographic mixer. `web/src/lib/readPolicy.ts:19-20` was the one
 * place that already said so out loud.
 *
 * `db/migrations/0070_audit_seal.sql` makes the claim true FROM THE INSTANT IT IS
 * APPLIED. This module is its TypeScript half: the canonical serialisation
 * mirrored as executable specification, and the verifier.
 *
 * ══ THE STATES, WHICH THIS MODULE REFUSES TO COLLAPSE ══
 *   not-installed  — 0070 has not been applied. There is no chain to verify. This
 *                    is NOT "broken" and it is NOT "intact".
 *   sealed         — a chain exists. Its verdict covers the SEALED REGION ONLY.
 *   pre-seal       — every row written before 0070 landed. It has no digest and
 *                    CANNOT acquire an honest one: those rows were mutable and
 *                    unchained for their whole life, so a digest computed today
 *                    would assert an integrity that was never held and would
 *                    produce a chain that LOOKS verified back to the first row
 *                    this platform ever wrote. Reported as its own segment, with
 *                    the boundary row named.
 *   unsealed-now   — rows carrying `seal_seq IS NULL` that the boundary snapshot
 *                    does NOT account for. The chain walk cannot see them (it
 *                    filters on `seal_seq IS NOT NULL`) and the pre-seal snapshot
 *                    does not contain them, so without this segment a row appended
 *                    with the insert trigger switched off would appear in NO part
 *                    of the report while the chain read "intact". Reported under
 *                    its own code, from a LIVE count, never from the snapshot.
 *   head-gap       — the sequence has issued numbers above the highest row
 *                    present. Its own segment because it has two readings that
 *                    this schema cannot tell apart (see `SealHeadCheck`).
 *
 * A caller that wants one boolean has to decide for itself what to do with the
 * pre-seal segment. That decision is the honest part and it is not ours to make.
 *
 * ══ WHAT THE VERIFIER DOES *NOT* DEFEND AGAINST, STATED PLAINLY ══
 * It recomputes each digest in Node from the canonical string POSTGRES produced,
 * so a swapped or subverted `audit_seal_digest()` is caught. It does NOT, on the
 * default path, defend against a subverted `audit_seal_content()`: the
 * canonicaliser is the server's and is trusted, so one that lied consistently
 * would verify itself. `crossCheckCanon: true` is the only thing that closes
 * that, and it is off by default (see the float note on `canonicalMeta`). The
 * honest summary is: the DIGEST function is cross-implemented, the CANONICALISER
 * is not unless you ask.
 */

/** Version tag that opens every canonical string. Mirrors 0070's literal. */
export const AUDIT_SEAL_CANON_VERSION = 'lcx-audit-seal-v1';

/**
 * sha256('lcx.audit_log/seal/v1/genesis') — the root the first sealed row hangs
 * from. A named constant rather than 64 zeros so a chain rooted here cannot be
 * confused with one rooted anywhere else, and so anybody can reproduce the root
 * from the string alone. Inlined identically in 0070's trigger.
 */
export const AUDIT_SEAL_GENESIS_DIGEST =
  'b2dd1adc4b93df88adaefee9df5adbafd1048d2f898d56279b09ac686d07281a';

/** U+001E RECORD SEPARATOR. The field delimiter, and the content/prev delimiter. */
const RS = '\u001e';

/**
 * The refusal codes this module emits. Stable strings — a dashboard, an alert and
 * a regulator's report all key off them, so they are values, not messages.
 *
 * AUDIT_SEAL_APPEND_ONLY is raised by POSTGRES, not by this file: 0070's
 * BEFORE UPDATE OR DELETE trigger puts it in the exception text. It is named here
 * so callers can recognise it without matching prose.
 */
export const AUDIT_SEAL_CODES = {
  NOT_INSTALLED: 'AUDIT_SEAL_NOT_INSTALLED',
  PRE_SEAL_UNVERIFIABLE: 'AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE',
  CHAIN_BROKEN: 'AUDIT_SEAL_CHAIN_BROKEN',
  CANON_DIVERGED: 'AUDIT_SEAL_CANON_DIVERGED',
  APPEND_ONLY: 'AUDIT_SEAL_APPEND_ONLY',
  /** A caller passed a bound this function will not silently ignore. */
  INVALID_BOUNDS: 'AUDIT_SEAL_INVALID_BOUNDS',
  /** More `seal_seq IS NULL` rows exist than the boundary snapshot accounts for. */
  UNSEALED_ROWS_PRESENT: 'AUDIT_SEAL_UNSEALED_ROWS_PRESENT',
  /** FEWER unsealed rows than the snapshot claims: rows removed, or snapshot raised. */
  UNSEALED_COUNT_DIVERGED: 'AUDIT_SEAL_UNSEALED_COUNT_DIVERGED',
  /** The chain sequence has issued numbers above the highest row present. */
  HEAD_GAP: 'AUDIT_SEAL_HEAD_GAP',
} as const;

/* ══════════════════════════════════════════════════════════════════════════════
 *  WHAT AN `intact` VERDICT IS NOT EVIDENCE OF.
 *
 *  CARRIED AS DATA, NOT AS PROSE IN THIS COMMENT, because the thing that must not
 *  happen is a SURFACE rendering a green chain without these sentences beside it.
 *  A comment cannot be rendered and cannot be asserted; a value can be both, and
 *  `routes/governanceRegister.ts` publishes this array on every seal payload while
 *  `pages/ControlRegister.tsx` renders it unconditionally.
 *
 *  THIS REPO HAS ALREADY CARRIED THE OVERCLAIM ONCE. `docs/phases/P5_EVIDENCE.md`
 *  F9 records it: the claim that ownership-level tampering is "still DETECTED after
 *  the fact" is FALSE once the attacker re-chains, and the evidence file says the
 *  overclaim is worth more than the finding. So the correction lives in the module
 *  that would otherwise be quoted as making the claim.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface SealUndetected {
  /** Stable id. A surface keys off this, never off the prose. */
  readonly id:
    | 'ownership_level_tampering'
    | 'head_not_externally_anchored'
    | 'canonicaliser_not_cross_checked';
  readonly statement: string;
  /** Where it was ESTABLISHED. Not an assertion — a probe was run and is named. */
  readonly evidence: string;
}

export const AUDIT_SEAL_DOES_NOT_DETECT: readonly SealUndetected[] = [
  {
    id: 'ownership_level_tampering',
    statement:
      'Tampering by the role the API itself connects as. audit_log and audit_seal_state are '
      + 'OWNED by that role, and ownership alone permits ALTER TABLE … DISABLE TRIGGER ALL. '
      + 'Rows can then be rewritten and RE-CHAINED using this database\'s own published digest '
      + 'functions — the chain is keyless and rooted at a genesis constant this file publishes '
      + '— and this verifier reports the result as intact. An intact verdict is therefore '
      + 'evidence against accident and against a lesser principal. It is NOT evidence against '
      + 'whoever holds the application\'s database credential.',
    evidence:
      'docs/phases/P5_EVIDENCE.md F9 — an attack pass drove this exact function against a '
      + 'forged, re-chained log on the CI mirror and it answered intact, whole chain covered. '
      + 'Only the head digest differed, and nothing records the expected head. The structural '
      + 'fix (audit tables owned by a role the application never connects as, plus a head '
      + 'anchored outside the database) is open and is the owner\'s to schedule.',
  },
  {
    id: 'head_not_externally_anchored',
    statement:
      'Which of two things a missing head means. Nothing outside the database records how '
      + 'long the chain should be, so a deleted newest row and a rolled-back audit append '
      + 'leave the SAME trace — a burnt sequence number. AUDIT_SEAL_HEAD_GAP reports the gap '
      + 'and refuses to choose between the readings, and it costs the whole-chain coverage '
      + 'claim rather than being called a break.',
    evidence:
      'routes/deals.ts:510 writes audit rows inside a transaction that really can roll back, '
      + 'so the benign reading is not hypothetical and calling the gap tampering would be a '
      + 'verifier crying wolf.',
  },
  {
    id: 'canonicaliser_not_cross_checked',
    statement:
      'A subverted canonicaliser, unless crossCheckCanon was asked for. The DIGEST function is '
      + 'cross-implemented — Postgres computes it, Node re-computes it — so a swapped digest '
      + 'shows up as a break. audit_seal_content() is the server\'s and is trusted on the '
      + 'default path, so one that lied consistently would verify itself.',
    evidence:
      'Stated on canonicalMeta in this file; crossCheckCanon is off by default because a '
      + 'known jsonb numeric-form divergence would otherwise be reported on ordinary rows.',
  },
] as const;

const RULE_APPEND_ONLY =
  'House doctrine: an artefact every other honesty claim rests on must be sealed in '
  + 'the database, not by convention. 0070_audit_seal.sql — BEFORE UPDATE OR DELETE '
  + 'raises AUDIT_SEAL_APPEND_ONLY.';
const RULE_NO_RETRO_SEAL =
  'House doctrine: an inference is never laundered into a certainty. 0070_audit_seal.sql '
  + '— rows that predate the chain are marked pre_seal and are never retro-sealed, '
  + 'because a digest computed after the fact asserts an integrity that was never held.';
const RULE_ABSENT_REFUSES =
  'House doctrine: absent data refuses. A missing seal is reported as missing, never as '
  + 'an intact chain over zero rows.';
const RULE_NOT_COVERED_IS_NOT_CLEAN =
  'House doctrine: three states are never collapsed — not-loaded / present-but-withheld / '
  + 'genuinely-empty. A row the walk cannot reach is NOT-COVERED and must never be '
  + 'reported as covered-and-clean. 0070_audit_seal.sql — rows with seal_seq IS NULL are '
  + 'outside the chain, so the verifier counts them live rather than trusting a snapshot.';
const RULE_BOUND_MUST_BE_HONOURED =
  'House doctrine: an inference is never laundered into a certainty. A bound this '
  + 'function cannot honour is refused under a stable code — never ignored, because an '
  + 'ignored bound makes the verdict BROADER than the caller asked for.';

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE CANONICAL SERIALISATION.
 *
 *  DEFINED IN 0070 (SQL) AND MIRRORED HERE. The SQL function is the RUNTIME
 *  AUTHORITY — the trigger hashes what Postgres canonicalises, and `verifyAuditSeal`
 *  re-hashes the same server-computed string with Node's SHA-256, so two
 *  independent hash implementations have to agree. The functions below are the
 *  specification in executable form: they are what `__tests__/seal.test.ts` pins
 *  with fixed vectors, so the definition cannot drift silently.
 *
 *  A chain over an unstable serialisation is theatre. If one row can produce two
 *  different strings then "the digest does not match" stops meaning "tampered",
 *  and a verifier that cries wolf is a verifier nobody reads. So:
 *
 *   · FIELD ORDER IS WRITTEN OUT, not derived from the column order — an
 *     ALTER TABLE ADD COLUMN must not change every digest in the log.
 *   · EVERY FIELD IS LENGTH-PREFIXED. Without it, (actor='a', action='bc') and
 *     (actor='ab', action='c') serialise identically, and anyone controlling two
 *     adjacent fields could move the boundary without changing the digest.
 *   · NULL ≠ EMPTY STRING. `entity` and `entity_id` are nullable and the
 *     difference is real: `-1:` vs `0:`.
 *   · jsonb IS WALKED, NOT CAST. `meta::text` leans on jsonb's internal key order
 *     (length, then bytewise), which is an implementation detail of the server
 *     version. Keys are sorted C-collation so the ordering belongs to THIS
 *     definition and survives a major-version upgrade.
 *   · TIMESTAMPS ARE ISO-8601 UTC AT MICROSECOND PRECISION, formatted, never
 *     locale- or session-TimeZone-dependent.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * One length-prefixed field. `null` is `-1:`, `''` is `0:`.
 * Byte length, not character length — the SQL side uses `octet_length`, and for
 * any non-ASCII actor or justification `length()` would disagree.
 */
export function sealField(v: string | null): string {
  if (v === null) return '-1:';
  return `${Buffer.byteLength(v, 'utf8')}:${v}`;
}

/**
 * Canonical JSON, mirroring `audit_seal_canon_json()`.
 *
 * KNOWN DIVERGENCE, STATED RATHER THAN HIDDEN: Postgres stores jsonb numbers as
 * `numeric` and preserves the written form, so `1.0` canonicalises to `1.0`,
 * while `pg` hands JavaScript a parsed `1` which serialises to `1`. For every
 * value this codebase actually writes into `audit_log.meta` — zod-validated
 * action params: strings, enums, booleans, integers, arrays and objects — the two
 * agree, and `verifyAuditSeal` uses the SERVER's string by default so a float
 * could never be misread as tampering. `crossCheckCanon` exists to find such a
 * divergence and reports it under its own code, never as a chain break.
 */
export function canonicalMeta(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalMeta).join(',')}]`;
  if (typeof v === 'object') {
    // C-collation sort = plain UTF-8 byte order, which for JS strings is code-unit
    // order. localeCompare would be locale-dependent and is deliberately not used.
    const keys = Object.keys(v as Record<string, unknown>).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalMeta((v as Record<string, unknown>)[k])}`,
    );
    return `{${parts.join(',')}}`;
  }
  // A function or a symbol cannot have come out of jsonb. Refuse rather than emit
  // something that hashes.
  throw new TypeError(`canonicalMeta: ${typeof v} is not a JSON value`);
}

/** The seven fields of an audit row that the digest covers. */
export interface AuditRowContent {
  id: string;
  actor: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  /** The parsed jsonb value, or an already-canonical string from the server. */
  meta: unknown;
  /** ISO-8601 UTC at microsecond precision: 2026-08-06T12:34:56.123456Z */
  createdAtIso: string;
}

/**
 * ISO-8601 UTC, microseconds, mirroring 0070's `to_char(... 'US"Z"')`.
 *
 * FOR CALLERS BUILDING A ROW FROM JAVASCRIPT ONLY. `verifyAuditSeal` deliberately
 * does NOT use it: a `Date` holds milliseconds, `now()` in Postgres holds
 * microseconds, so re-deriving a stored timestamp through here would truncate
 * `.123456` to `.123000` and report a divergence on every row — a JS limitation
 * dressed up as a specification mismatch. The verifier reads the server's own
 * formatted string instead.
 */
export function sealTimestamp(value: Date | string): string {
  if (typeof value === 'string') return value;
  // Date carries milliseconds only; the SQL side prints six digits, so the last
  // three are zeros for anything that came through JavaScript. Formatted rather
  // than sliced off toISOString so the shape is stated in one place.
  const ms = value.toISOString(); // 2026-08-06T12:34:56.123Z
  return `${ms.slice(0, -1)}000Z`;
}

/** The canonical content string of one row. Mirrors `audit_seal_content()`. */
export function canonicalAuditContent(row: AuditRowContent): string {
  return [
    AUDIT_SEAL_CANON_VERSION,
    sealField(row.id),
    sealField(row.actor),
    sealField(row.action),
    sealField(row.entity),
    sealField(row.entityId),
    sealField(typeof row.meta === 'string' ? row.meta : canonicalMeta(row.meta)),
    sealField(row.createdAtIso),
  ].join(RS);
}

/** sha256 hex of content ‖ RS ‖ prev. Mirrors `audit_seal_digest()`. */
export function sealDigest(content: string, prevDigest: string): string {
  return createHash('sha256').update(`${content}${RS}${prevDigest}`, 'utf8').digest('hex');
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE VERIFIER.
 * ════════════════════════════════════════════════════════════════════════════ */

export type SealBreakReason =
  /** The row's own content no longer hashes to its stored digest — it was edited. */
  | 'content_digest_mismatch'
  /** This row's prev_digest is not its predecessor's digest — a row was removed,
   *  reordered, or two rows claim the same predecessor (a forked chain). */
  | 'predecessor_digest_mismatch';

export type SealChainVerdict =
  | {
      kind: 'intact';
      rowsExamined: number;
      firstSeq: number;
      lastSeq: number;
      headDigest: string;
      /** false when a window was requested — the verdict then covers the window
       *  ONLY, and reading it as "the log is intact" would be wrong. */
      coversWholeChain: boolean;
    }
  | {
      kind: 'broken';
      code: typeof AUDIT_SEAL_CODES.CHAIN_BROKEN;
      rule: string;
      message: string;
      reason: SealBreakReason;
      atRowId: string;
      atSeq: number;
      storedDigest: string | null;
      recomputedDigest: string;
      storedPrevDigest: string | null;
      expectedPrevDigest: string | null;
      rowsExamined: number;
    }
  | {
      /** The seal is installed and no row has been written through it yet. This is
       *  GENUINELY EMPTY, which is not the same as "not installed" and not the
       *  same as "intact over rows we did not look at". */
      kind: 'empty';
      message: string;
      rule: string;
    };

export type SealPreSealSegment =
  | { kind: 'none' }
  | {
      kind: 'unverifiable';
      code: typeof AUDIT_SEAL_CODES.PRE_SEAL_UNVERIFIABLE;
      rule: string;
      message: string;
      /**
       * The count from `audit_seal_state`. A SNAPSHOT, and labelled as one: the row
       * was mutable until this migration's own append-only triggers existed, and on a
       * database sealed before they were added it can have been edited. Compare it
       * with `liveUnsealedRows` — never read either alone.
       */
      rows: number;
      /** `count(*) FROM audit_log WHERE seal_seq IS NULL`, counted now, by us. */
      liveUnsealedRows: number;
      /** false means the two disagree — see `SealReport.unsealedRows` for which way. */
      snapshotAgreesWithLiveCount: boolean;
      /** The last unsealed row — the boundary, named. */
      boundaryRowId: string | null;
      boundaryRowAt: string | null;
    };

/**
 * The unsealed rows, counted LIVE and reconciled against the boundary snapshot.
 *
 * WHY THIS SEGMENT EXISTS. The chain walk filters `seal_seq IS NOT NULL` and the
 * pre-seal segment came from `audit_seal_state`. A row appended with the insert
 * trigger disabled carries `seal_seq IS NULL`, so it was in neither: it appeared in
 * NO part of the report while the chain read "intact", and every ordinary query of
 * `audit_log` — including the audit UI — returned it. Detection was asymmetric
 * (edit and mid-chain delete caught, append-forgery not) and the asymmetry was
 * nowhere stated. So the count is taken live, from the same connection that walks
 * the chain, and reconciled.
 */
export type SealUnsealedRows =
  | {
      /** The live count matches the snapshot. Both may be 0; that is the common case. */
      kind: 'consistent';
      rows: number;
    }
  | {
      /**
       * MORE unsealed rows than the snapshot accounts for. Two readings, and this
       * schema cannot tell them apart, so the message states both: rows were
       * appended with `trg_audit_seal_insert` disabled, or `pre_seal_rows` was
       * lowered. Either is a finding.
       */
      kind: 'excess';
      code: typeof AUDIT_SEAL_CODES.UNSEALED_ROWS_PRESENT;
      rule: string;
      message: string;
      snapshotRows: number;
      liveRows: number;
      excess: number;
      /** The excess rows, named — an operator cannot act on a count. */
      rowIds: string[];
    }
  | {
      /** FEWER than the snapshot claims: pre-seal rows were deleted, or the snapshot
       *  was raised. Also two readings, also stated. */
      kind: 'diverged';
      code: typeof AUDIT_SEAL_CODES.UNSEALED_COUNT_DIVERGED;
      rule: string;
      message: string;
      snapshotRows: number;
      liveRows: number;
    };

/**
 * Is the HEAD of the chain still there?
 *
 * Nothing in 0070 anchors the head — `audit_seal_state` carries no high-water mark —
 * so deleting the newest row (precisely "the row that records what you just did")
 * left a chain that verified as intact and shorter. The only trace is the sequence:
 * `audit_log_seal_seq.last_value` does not go back down.
 *
 * IT IS NOT REPORTED AS A BREAK, AND THAT IS DELIBERATE. `nextval()` is
 * non-transactional, so a rolled-back audit append burns a number and leaves the
 * SAME trace as a deleted head row — and `routes/deals.ts:510` writes audit rows
 * inside a transaction that really can roll back. Calling that "tampering" would be
 * a verifier crying wolf, which is a verifier nobody reads. So it is its own
 * segment, with both readings named, and it forces `coversWholeChain` to false —
 * under-claiming, which is the safe direction.
 */
export type SealHeadCheck =
  | { kind: 'anchored'; lastSeq: number; sequenceLastValue: number }
  | {
      kind: 'gap';
      code: typeof AUDIT_SEAL_CODES.HEAD_GAP;
      rule: string;
      message: string;
      /** Highest seal_seq present in the table, or null if no sealed row is. */
      lastSeq: number | null;
      sequenceLastValue: number;
      missing: number;
    }
  | {
      /** The sequence has never been called (no row was ever sealed), so there is no
       *  high-water mark to compare against. Not "anchored" — nothing to anchor. */
      kind: 'unused';
    };

export type SealCanonCrossCheck =
  | { kind: 'skipped' }
  | { kind: 'agrees'; rowsCompared: number }
  | {
      kind: 'diverges';
      code: typeof AUDIT_SEAL_CODES.CANON_DIVERGED;
      rowsCompared: number;
      message: string;
      /** Row ids where the two implementations of the canonical form disagree.
       *  NOT a chain break: it means the SPECIFICATION has two readings. */
      rowIds: string[];
    };

export interface SealReport {
  canonVersion: string;
  genesisDigest: string;
  /** When sealing began, per `audit_seal_state`. */
  sealedFrom: string;
  chain: SealChainVerdict;
  preSeal: SealPreSealSegment;
  /** Rows outside the chain, counted live. NEVER folded into `preSeal`. */
  unsealedRows: SealUnsealedRows;
  /** Whether the newest row is still present, as far as the sequence can say. */
  head: SealHeadCheck;
  canonCrossCheck: SealCanonCrossCheck;
}

export type SealVerification =
  | { kind: 'sealed'; report: SealReport }
  | {
      kind: 'not_installed';
      code: typeof AUDIT_SEAL_CODES.NOT_INSTALLED;
      rule: string;
      message: string;
    }
  | {
      /**
       * The CALLER is at fault, not the chain. Its own kind because "your bound is
       * not a whole number" must never be reachable by a caller reading
       * `chain.kind === 'intact'`, and because the previous behaviour — silently
       * dropping a NaN `maxRows` and answering `coversWholeChain: true` — told a
       * caller whose computed cap had gone wrong that the WHOLE chain verified.
       */
      kind: 'invalid_bounds';
      code: typeof AUDIT_SEAL_CODES.INVALID_BOUNDS;
      rule: string;
      message: string;
      /** EVERY offending bound, not the first one found (marketingDesk.ts:1207-1214). */
      offending: { option: 'fromSeq' | 'maxRows'; value: unknown; why: string }[];
    };

export interface VerifyAuditSealOptions {
  /**
   * Start the walk at this chain position. Anchored against its predecessor.
   *
   * `seal_seq` starts at 1, so 1 means "from the beginning" and is the first page of
   * a paginated walk. It is NOT a window in that case and `coversWholeChain` stays
   * true. Must be a non-negative safe integer; anything else is REFUSED under
   * AUDIT_SEAL_INVALID_BOUNDS rather than reaching Postgres as `bigint 'NaN'`.
   */
  fromSeq?: number;
  /** Cap the walk. A capped walk sets `coversWholeChain: false`. Must be a positive
   *  safe integer; 0 or absent means uncapped. An unusable value is REFUSED, never
   *  ignored — an ignored cap widens the verdict. */
  maxRows?: number;
  /** Re-derive the canonical string in TypeScript and compare. Off by default —
   *  see the divergence note on `canonicalMeta`. */
  crossCheckCanon?: boolean;
}

/**
 * Bounds are checked HERE, not by Postgres.
 *
 * Two failures, and they failed in opposite directions. `maxRows: NaN` and
 * `maxRows: -2` both failed the old `maxRows > 0` test, silently dropped the LIMIT
 * and returned `coversWholeChain: true` — the verdict came back BROADER than the
 * caller asked for, which is the worst possible direction for an integrity report.
 * `fromSeq: NaN | Infinity | 1.5` escaped as a raw 22P02 (`invalid input syntax for
 * type bigint: "NaN"`) carrying no code from AUDIT_SEAL_CODES, so a caller could not
 * tell a bad argument from a broken database.
 */
function invalidBounds(
  opts: VerifyAuditSealOptions,
): { option: 'fromSeq' | 'maxRows'; value: unknown; why: string }[] {
  const bad: { option: 'fromSeq' | 'maxRows'; value: unknown; why: string }[] = [];
  const { fromSeq, maxRows } = opts;
  if (fromSeq !== undefined) {
    if (!Number.isSafeInteger(fromSeq)) {
      bad.push({
        option: 'fromSeq',
        value: fromSeq,
        why: 'not a safe integer (NaN, Infinity, a fraction, or beyond 2^53-1)',
      });
    } else if (fromSeq < 0) {
      bad.push({ option: 'fromSeq', value: fromSeq, why: 'negative; chain positions start at 1' });
    }
  }
  if (maxRows !== undefined) {
    if (!Number.isSafeInteger(maxRows)) {
      bad.push({
        option: 'maxRows',
        value: maxRows,
        why: 'not a safe integer (NaN, Infinity, a fraction, or beyond 2^53-1)',
      });
    } else if (maxRows < 0) {
      bad.push({ option: 'maxRows', value: maxRows, why: 'negative; a row cap cannot be below zero' });
    }
  }
  return bad;
}

/** 0070 not applied: `undefined_table` (state row) or `undefined_column` (seal_seq). */
function isSealAbsentError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42883';
}

const notInstalled = (): SealVerification => ({
  kind: 'not_installed',
  code: AUDIT_SEAL_CODES.NOT_INSTALLED,
  rule: RULE_ABSENT_REFUSES,
  message:
    'audit_log carries no hash chain in this database: migration 0070_audit_seal.sql '
    + 'has not been applied. Nothing here is tamper-evident, and no row can be '
    + 'verified — including rows written since. This is not a chain that failed; it '
    + 'is the absence of one.',
});

interface SealStateRow {
  sealed_from: Date;
  canon_version: string;
  genesis_digest: string;
  pre_seal_rows: string;
  boundary_row_id: string | null;
  boundary_row_at: Date | null;
}

interface ChainRow {
  id: string;
  seal_seq: string;
  prev_digest: string | null;
  row_digest: string | null;
  canon: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: unknown;
  created_at: Date;
  /**
   * `created_at` formatted server-side, because a JavaScript `Date` CANNOT hold
   * microseconds. `now()` in Postgres does, so re-deriving the timestamp from the
   * parsed Date would truncate `.123456` to `.123000` and the cross-check would
   * report a divergence on every single row — a specification mismatch that is
   * really a JS limitation, which is the kind of false finding that gets a check
   * switched off.
   */
  created_at_iso: string;
}

/**
 * Walk the chain and report the FIRST break, with the row id and both digests.
 *
 * Recomputes each digest in NODE from the canonical string Postgres produced, so
 * the SQL digest function and Node's SHA-256 must agree — a swapped or subverted
 * `audit_seal_digest()` shows up as a break rather than verifying itself.
 */
export async function verifyAuditSeal(
  pool: pg.Pool,
  opts: VerifyAuditSealOptions = {},
): Promise<SealVerification> {
  const badBounds = invalidBounds(opts);
  if (badBounds.length > 0) {
    return {
      kind: 'invalid_bounds',
      code: AUDIT_SEAL_CODES.INVALID_BOUNDS,
      rule: RULE_BOUND_MUST_BE_HONOURED,
      offending: badBounds,
      message:
        'This verification was not attempted: '
        + badBounds.map((b) => `${b.option}=${String(b.value)} is ${b.why}`).join('; ')
        + '. The bound was NOT ignored — ignoring it would have verified more of the '
        + 'chain than was asked for and reported that as covering the whole of it.',
    };
  }

  let state: SealStateRow;
  try {
    const res = await pool.query<SealStateRow>(
      `SELECT sealed_from, canon_version, genesis_digest, pre_seal_rows,
              boundary_row_id, boundary_row_at
         FROM audit_seal_state WHERE id = 1`,
    );
    if (res.rows.length === 0) return notInstalled();
    state = res.rows[0]!;
  } catch (err) {
    if (isSealAbsentError(err)) return notInstalled();
    throw err;
  }

  const snapshotPreSealRows = Number(state.pre_seal_rows);

  /*
   * THE LIVE COUNTS. Taken by US, on the same connection that walks the chain,
   * because the verdict must not rest on a row that could be edited.
   *
   * WHAT WENT WRONG WITHOUT THIS. `pre_seal_rows` was read from `audit_seal_state`
   * and believed. One `UPDATE audit_seal_state SET pre_seal_rows = 0` — which
   * nothing refused, because 0070 protected the DATA with three triggers and left
   * the METADATA the verdict depends on fully mutable — turned the pre-seal segment
   * from `unverifiable, rows: 2` into `none` while two unsealed rows sat in the
   * table. Separately, a row appended with the insert trigger disabled carries
   * `seal_seq IS NULL`, so it was in neither the chain walk nor the snapshot and
   * appeared in NO segment of the report at all.
   */
  let liveUnsealedRows: number;
  let maxSealSeq: number | null;
  let seqLastValue: number | null;
  let postSealUnsealedIds: string[];
  try {
    const counts = await pool.query<{
      unsealed_rows: string;
      max_seal_seq: string | null;
      seq_last_value: string | null;
    }>(
      `SELECT (SELECT count(*) FROM audit_log WHERE seal_seq IS NULL)  AS unsealed_rows,
              (SELECT max(seal_seq) FROM audit_log)                    AS max_seal_seq,
              pg_sequence_last_value('audit_log_seal_seq'::regclass)   AS seq_last_value`,
    );
    const c = counts.rows[0]!;
    liveUnsealedRows = Number(c.unsealed_rows);
    maxSealSeq = c.max_seal_seq === null ? null : Number(c.max_seal_seq);
    seqLastValue = c.seq_last_value === null ? null : Number(c.seq_last_value);

    /*
     * The unsealed rows written AT OR AFTER the sealing instant — i.e. the ones that
     * cannot be pre-seal. Named rather than counted, because an operator cannot act
     * on a number. Capped: a report is not a dump.
     *
     * `sealed_from` IS READ IN SQL, NOT PASSED BACK IN. Round-tripping it through the
     * `Date` in `state` truncates it to milliseconds, and a pre-seal row written in
     * the same millisecond as the seal then compares `>=` the truncated boundary and
     * is named as a post-seal forgery. That is not hypothetical: it made this
     * function's own test report two rows instead of one on the first run.
     */
    const ids = await pool.query<{ id: string }>(
      `SELECT id FROM audit_log
        WHERE seal_seq IS NULL
          AND created_at >= (SELECT sealed_from FROM audit_seal_state WHERE id = 1)
        ORDER BY created_at DESC LIMIT 50`,
    );
    postSealUnsealedIds = ids.rows.map((r) => r.id);
  } catch (err) {
    if (isSealAbsentError(err)) return notInstalled();
    throw err;
  }

  const unsealedExcess = liveUnsealedRows - snapshotPreSealRows;
  const unsealedRows: SealUnsealedRows =
    unsealedExcess === 0
      ? { kind: 'consistent', rows: liveUnsealedRows }
      : unsealedExcess > 0
        ? {
            kind: 'excess',
            code: AUDIT_SEAL_CODES.UNSEALED_ROWS_PRESENT,
            rule: RULE_NOT_COVERED_IS_NOT_CLEAN,
            snapshotRows: snapshotPreSealRows,
            liveRows: liveUnsealedRows,
            excess: unsealedExcess,
            rowIds: postSealUnsealedIds,
            message:
              `${liveUnsealedRows} row(s) in audit_log carry no chain position, but the `
              + `boundary snapshot accounts for only ${snapshotPreSealRows}. `
              + `${unsealedExcess} row(s) are therefore OUTSIDE the seal and outside the `
              + 'pre-seal segment: the chain walk cannot see them and its verdict says '
              + 'nothing about them, while every ordinary query of audit_log returns them. '
              + 'Two readings, and this schema cannot tell them apart: rows were appended '
              + 'with trg_audit_seal_insert disabled, or pre_seal_rows was lowered. Either '
              + 'is a finding. '
              + (postSealUnsealedIds.length > 0
                ? `Unsealed rows written at or after ${state.sealed_from.toISOString()}: `
                  + `${postSealUnsealedIds.join(', ')}`
                : 'None of the unsealed rows carries a created_at at or after '
                  + `${state.sealed_from.toISOString()}, so either the snapshot was `
                  + 'lowered or the forged rows were backdated.'),
          }
        : {
            kind: 'diverged',
            code: AUDIT_SEAL_CODES.UNSEALED_COUNT_DIVERGED,
            rule: RULE_NOT_COVERED_IS_NOT_CLEAN,
            snapshotRows: snapshotPreSealRows,
            liveRows: liveUnsealedRows,
            message:
              `The boundary snapshot claims ${snapshotPreSealRows} pre-seal row(s) but only `
              + `${liveUnsealedRows} unsealed row(s) exist. Two readings, neither excluded: `
              + 'pre-seal rows were deleted (the append-only trigger refuses this, so it '
              + 'would have taken disabling it), or pre_seal_rows was raised. The pre-seal '
              + 'count in this report cannot be trusted in either direction.',
          };

  const snapshotAgrees = unsealedExcess === 0;
  const preSeal: SealPreSealSegment =
    snapshotPreSealRows === 0 && liveUnsealedRows === 0
      ? { kind: 'none' }
      : {
          kind: 'unverifiable',
          code: AUDIT_SEAL_CODES.PRE_SEAL_UNVERIFIABLE,
          rule: RULE_NO_RETRO_SEAL,
          message:
            `${snapshotPreSealRows} audit row(s) were written before the seal existed and `
            + 'carry no digest. They were NOT retro-sealed: they were mutable and unchained '
            + 'for their whole life, so a digest computed now would claim an integrity that '
            + 'was never held. Their integrity is UNKNOWABLE — neither intact nor '
            + `broken. Boundary: row ${state.boundary_row_id ?? '(unknown)'} at `
            + `${state.boundary_row_at ? state.boundary_row_at.toISOString() : '(unknown)'}.`
            + (snapshotAgrees
              ? ''
              : ` THAT COUNT IS A SNAPSHOT AND IT DOES NOT MATCH REALITY: ${liveUnsealedRows} `
                + 'unsealed row(s) exist right now. See unsealedRows for which way it '
                + 'diverges; do not read the pre-seal count as fact.'),
          rows: snapshotPreSealRows,
          liveUnsealedRows,
          snapshotAgreesWithLiveCount: snapshotAgrees,
          boundaryRowId: state.boundary_row_id,
          boundaryRowAt: state.boundary_row_at ? state.boundary_row_at.toISOString() : null,
        };

  /*
   * THE HEAD. Nothing in the sealed rows themselves says how many there should be, so
   * deleting the newest one left a chain that verified intact and shorter —
   * `coversWholeChain: true` over a truncated tail. The sequence is the only witness.
   */
  const head: SealHeadCheck =
    seqLastValue === null
      ? { kind: 'unused' }
      : maxSealSeq !== null && maxSealSeq >= seqLastValue
        ? { kind: 'anchored', lastSeq: maxSealSeq, sequenceLastValue: seqLastValue }
        : {
            kind: 'gap',
            code: AUDIT_SEAL_CODES.HEAD_GAP,
            rule: RULE_NOT_COVERED_IS_NOT_CLEAN,
            lastSeq: maxSealSeq,
            sequenceLastValue: seqLastValue,
            missing: seqLastValue - (maxSealSeq ?? 0),
            message:
              `The chain sequence has issued positions up to ${seqLastValue} but the highest `
              + `row present is ${maxSealSeq === null ? '(none)' : maxSealSeq}. `
              + `${seqLastValue - (maxSealSeq ?? 0)} position(s) at the head are unaccounted `
              + 'for. TWO READINGS AND THIS SCHEMA CANNOT DISTINGUISH THEM: the newest '
              + 'row(s) were DELETED — which is what deleting the row that records what you '
              + 'just did looks like — or an audit append was rolled back, which burns a '
              + 'sequence number without ever writing a row (routes/deals.ts:510 audits '
              + 'inside a transaction that can roll back). This is NOT reported as a chain '
              + 'break for that reason, but the verdict below does NOT cover the whole '
              + 'chain and does not claim to.',
          };

  const fromSeq = opts.fromSeq ?? 0;
  const maxRows = opts.maxRows ?? 0;

  /*
   * THE ANCHOR. A windowed walk starting at seq N cannot check N's prev_digest
   * against nothing — it would have to either skip the first link (so a deleted
   * row at the window edge goes unseen) or invent an expectation. So the
   * predecessor's digest is fetched separately and used as the expectation.
   *
   * ONLY ABOVE 1. `seal_seq` starts at 1, so position 1 HAS no predecessor and its
   * legitimate expectation is the genesis digest. Fetching an anchor for `fromSeq: 1`
   * found nothing, set the expectation to null, and reported an intact chain as
   * AUDIT_SEAL_CHAIN_BROKEN / predecessor_digest_mismatch at position 1 — so
   * "verify from the beginning", and the first page of any paginated walk, ALWAYS
   * false-accused. The fallback below is what makes that structurally impossible.
   */
  let anchor: string | null = null;
  if (fromSeq > 1) {
    const prev = await pool.query<{ row_digest: string | null }>(
      `SELECT row_digest FROM audit_log
        WHERE seal_seq IS NOT NULL AND seal_seq < $1
        ORDER BY seal_seq DESC LIMIT 1`,
      [fromSeq],
    );
    anchor = prev.rows[0]?.row_digest ?? null;
  }

  const { rows } = await pool.query<ChainRow>(
    `SELECT id, seal_seq, prev_digest, row_digest, actor, action, entity, entity_id,
            meta, created_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_iso,
            audit_seal_content(id, actor, action, entity, entity_id, meta, created_at) AS canon
       FROM audit_log
      WHERE seal_seq IS NOT NULL AND seal_seq >= $1
      ORDER BY seal_seq ASC
      ${maxRows > 0 ? 'LIMIT $2' : ''}`,
    maxRows > 0 ? [fromSeq, maxRows] : [fromSeq],
  );

  const base = {
    canonVersion: state.canon_version,
    genesisDigest: state.genesis_digest,
    sealedFrom: state.sealed_from.toISOString(),
    preSeal,
    unsealedRows,
    head,
  };

  if (rows.length === 0) {
    // Genuinely empty, or a window past the end. Either way there is nothing to
    // pronounce on, and 'intact' over zero rows would be a lie of omission.
    return {
      kind: 'sealed',
      report: {
        ...base,
        chain: {
          kind: 'empty',
          rule: RULE_APPEND_ONLY,
          message:
            fromSeq > 0
              ? `No sealed rows at or after chain position ${fromSeq}. This window is `
                + 'empty; it says nothing about the rest of the chain.'
              : 'The seal is installed and no row has been written through it yet. '
                + 'Genuinely empty — not withheld, and not an intact chain.',
        },
        canonCrossCheck: opts.crossCheckCanon ? { kind: 'agrees', rowsCompared: 0 } : { kind: 'skipped' },
      },
    };
  }

  const divergentCanon: string[] = [];

  /*
   * `anchor ?? genesis` rather than `anchor`, and the fallback is SAFE IN THE STRICT
   * SENSE: the genesis digest can only match a row that genuinely is the first of the
   * chain. So a window whose predecessor is missing because the front of the chain was
   * deleted still reports a break (that row's prev_digest is its real predecessor's
   * digest, not genesis) — the fallback removes the false accusation at position 1
   * without removing any true one.
   */
  const expectationIsGenesis = anchor === null;
  let expectedPrev: string | null = anchor ?? state.genesis_digest;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const seq = Number(row.seal_seq);
    const recomputed = sealDigest(row.canon, row.prev_digest ?? '');

    // (a) the link. Checked BEFORE the content digest: a removed or reordered row
    // is the more consequential finding, and reporting the content mismatch it
    // also causes would name the wrong defect.
    if (row.prev_digest !== expectedPrev) {
      return {
        kind: 'sealed',
        report: {
          ...base,
          chain: {
            kind: 'broken',
            code: AUDIT_SEAL_CODES.CHAIN_BROKEN,
            rule: RULE_APPEND_ONLY,
            reason: 'predecessor_digest_mismatch',
            message:
              `Chain break at position ${seq} (row ${row.id}): it names predecessor `
              + `${row.prev_digest ?? '(null)'} but the expected predecessor digest is `
              + `${expectedPrev ?? '(nothing — no predecessor found)'}`
              + (i === 0 && expectationIsGenesis && fromSeq > 1
                ? ` — no sealed row exists below position ${fromSeq}, so the genesis root `
                  + 'was the expectation. If this window should have had a predecessor, the '
                  + 'rows before it are gone.'
                : '')
              + '. A row was removed, reordered, or two rows claim the same predecessor. '
              + 'Rows after this point are NOT covered by this verdict.',
            atRowId: row.id,
            atSeq: seq,
            storedDigest: row.row_digest,
            recomputedDigest: recomputed,
            storedPrevDigest: row.prev_digest,
            expectedPrevDigest: expectedPrev,
            rowsExamined: i + 1,
          },
          canonCrossCheck: { kind: 'skipped' },
        },
      };
    }

    // (b) the content.
    if (row.row_digest !== recomputed) {
      return {
        kind: 'sealed',
        report: {
          ...base,
          chain: {
            kind: 'broken',
            code: AUDIT_SEAL_CODES.CHAIN_BROKEN,
            rule: RULE_APPEND_ONLY,
            reason: 'content_digest_mismatch',
            message:
              `Chain break at position ${seq} (row ${row.id}): the row's stored digest is `
              + `${row.row_digest ?? '(null)'} but its current content hashes to `
              + `${recomputed}. The row was altered after it was written, or the digest `
              + 'was. Rows after this point are NOT covered by this verdict.',
            atRowId: row.id,
            atSeq: seq,
            storedDigest: row.row_digest,
            recomputedDigest: recomputed,
            storedPrevDigest: row.prev_digest,
            expectedPrevDigest: expectedPrev,
            rowsExamined: i + 1,
          },
          canonCrossCheck: { kind: 'skipped' },
        },
      };
    }

    if (opts.crossCheckCanon) {
      const mine = canonicalAuditContent({
        id: row.id,
        actor: row.actor,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        meta: row.meta,
        createdAtIso: row.created_at_iso,
      });
      if (mine !== row.canon) divergentCanon.push(row.id);
    }

    expectedPrev = row.row_digest;
  }

  const first = Number(rows[0]!.seal_seq);
  const last = Number(rows[rows.length - 1]!.seal_seq);
  const truncated = maxRows > 0 && rows.length === maxRows;

  let canonCrossCheck: SealCanonCrossCheck = { kind: 'skipped' };
  if (opts.crossCheckCanon) {
    canonCrossCheck =
      divergentCanon.length === 0
        ? { kind: 'agrees', rowsCompared: rows.length }
        : {
            kind: 'diverges',
            code: AUDIT_SEAL_CODES.CANON_DIVERGED,
            rowsCompared: rows.length,
            rowIds: divergentCanon,
            message:
              `The SQL and TypeScript canonicalisations disagree on ${divergentCanon.length} `
              + 'row(s). This is NOT evidence of tampering — the chain verified against the '
              + 'server\'s own canonical form. It means the specification has two readings, '
              + 'which must be closed before either implementation is trusted alone.',
          };
  }

  return {
    kind: 'sealed',
    report: {
      ...base,
      chain: {
        kind: 'intact',
        rowsExamined: rows.length,
        firstSeq: first,
        lastSeq: last,
        headDigest: rows[rows.length - 1]!.row_digest!,
        /*
         * `fromSeq <= 1` because position 1 IS the beginning — this line always said
         * so, while the anchor logic above contradicted it and refused position 1.
         *
         * `head.kind !== 'gap'` because a truncated tail was otherwise reported as
         * intact AND covering the whole chain: `lastSeq` simply came back lower and
         * nothing compared it to the sequence. A benign rolled-back append also
         * lands here and also costs the claim, which is under-claiming — the safe
         * direction for a coverage flag.
         */
        coversWholeChain: fromSeq <= 1 && !truncated && head.kind !== 'gap',
      },
      canonCrossCheck,
    },
  };
}

/**
 * Does this error come from 0070's append-only trigger?
 *
 * Matched on the code token in the message rather than on SQLSTATE alone: 42501
 * (insufficient_privilege) is also what a genuine grant failure raises, and
 * telling an operator "the audit log is append-only" when their role is simply
 * wrong would send them to the wrong place.
 */
export function isAppendOnlyRefusal(err: unknown): boolean {
  const message = (err as { message?: string } | null)?.message;
  return typeof message === 'string' && message.includes(AUDIT_SEAL_CODES.APPEND_ONLY);
}
