import type pg from 'pg';
import { WORKSPACE_IDS } from '@lcx/shared';
import type { Capability, WorkspaceId } from '@lcx/shared';

/**
 * POINT-IN-TIME ENTITLEMENT — "who could see this compartment on date D".
 *
 * WHAT WAS FALSE. `entitlements` (migration 0042) is a CURRENT-STATE table: one
 * row per (member, workspace). `actions/registry.ts` revoke DELETED that row, so
 * the act of revoking destroyed the only evidence the grant had ever existed.
 * A regulator asking who could read `gps` on 12 July got no answer at all, and
 * nothing in the system could distinguish "nobody held it" from "we deleted the
 * row that said they did". 0042 itself deletes two departed members' rows
 * outright (`0042:69`), and `routes/__tests__/access.test.ts:119` deletes another
 * by hand — so the loss was not hypothetical.
 *
 * `db/migrations/0071_grant_ledger.sql` adds `entitlement_events`: append-only,
 * enforced by trigger, written by trigger on every `entitlements` insert/update
 * and by `recordRevocation` below on every revoke. This module replays it.
 *
 * ══ THE THREE ANSWERS, WHICH ARE NEVER COLLAPSED ══
 *   ledger absent   — 0071 has not been applied. There is no history to replay.
 *   unknowable      — the instant asked about is before the ledger can speak.
 *                     The boundary is NAMED. No holder set is returned, because
 *                     an empty holder set reads as "they held nothing", which is
 *                     a different and much worse claim than "we cannot know".
 *   known           — a real answer. `genuinelyEmpty` distinguishes "the replay
 *                     ran and nobody held it" from either of the above.
 *
 * ══ WHY THERE ARE TWO BOUNDARIES AND NOT ONE ══
 * 0071 reconstructs one grant event per SURVIVING `entitlements` row, carrying
 * its real `granted_at`/`granted_by` — for the founding desk, 0042's backfill, so
 * the replay can name the genesis instant. But a reconstruction is a photograph,
 * not a history, and for any instant before 0071 landed it is wrong in BOTH
 * directions: it cannot see a grant that was later revoked (the row is gone —
 * UNDER-reports), and it cannot see a revocation at all (a compartment revoked in
 * June looks held continuously — OVER-reports). Neither error is conservative, so
 * that window refuses too, under its own code, rather than being answered with a
 * caveat nobody will carry forward.
 *
 *   at <  earliest_reconstructed_at   → ENTITLEMENT_AS_OF_BEFORE_RECORD
 *   at <  ledger_floor                → ENTITLEMENT_AS_OF_RECONSTRUCTED_ONLY
 *   at >= ledger_floor                → answerable
 *
 * AND WHEN THERE IS NO RECONSTRUCTION AT ALL (`earliest_reconstructed_at IS NULL`,
 * i.e. 0071 was applied to a database whose `entitlements` table was empty) THERE
 * IS NO SECOND WINDOW: nothing exists in any form below the floor, so every
 * pre-floor instant is BEFORE_RECORD. The first draft skipped the first branch
 * whenever the genesis was null and answered RECONSTRUCTED_ONLY for 1900-01-01 with
 * a message describing "0 reconstructed grant(s)" between "(no reconstruction)" and
 * the floor — a refusal citing a window that does not exist. The two boundaries this
 * module argues at length must not be one became one as a function of DATA.
 *
 * ══ ONE PARSER DECIDES, AND IT IS POSTGRES ══
 * The boundary comparisons are done IN SQL, against the same `::timestamptz` cast
 * the replay query uses. They used to be done in JavaScript with `new Date(q.at)`
 * while the query used Postgres' own (far wider) parser, and the gap between the two
 * resolved to the one answer this module says must never be produced: `'-infinity'`,
 * `'epoch'` and `'4713-01-01 BC'` yielded Invalid Date, both `atCoarse < genesis`
 * and `atCoarse < floor` are FALSE for NaN, so both refusals were skipped and the
 * function answered `known, holdings: [], genuinelyEmpty: true` — an empty holder
 * set reading as "they held nothing" for an instant it declares unanswerable. And
 * `'yesterday'` — which Postgres accepts and V8 does not — returned a POSITIVE
 * holder claim about an instant inside the reconstruction-only window.
 */

export const ENTITLEMENT_AS_OF_CODES = {
  LEDGER_ABSENT: 'ENTITLEMENT_LEDGER_ABSENT',
  BEFORE_RECORD: 'ENTITLEMENT_AS_OF_BEFORE_RECORD',
  RECONSTRUCTED_ONLY: 'ENTITLEMENT_AS_OF_RECONSTRUCTED_ONLY',
  /** `at` is not something Postgres can read as an instant at all. */
  UNPARSEABLE_INSTANT: 'ENTITLEMENT_AS_OF_UNPARSEABLE_INSTANT',
  /** `at` parsed but is not a point in time: ±infinity, or an Invalid Date. */
  NOT_AN_INSTANT: 'ENTITLEMENT_AS_OF_NOT_AN_INSTANT',
  /** The member or compartment asked about appears nowhere the ledger can vouch for. */
  UNKNOWN_SCOPE: 'ENTITLEMENT_AS_OF_UNKNOWN_SCOPE',
  /** A revocation took effect but its history could not be written (0071 absent). */
  LEDGER_UNRECORDED: 'ENTITLEMENT_LEDGER_UNRECORDED',
  /** 0071's append-only trigger. Raised by Postgres, named here. */
  APPEND_ONLY: 'ENTITLEMENT_LEDGER_APPEND_ONLY',
} as const;

const RULE_NO_INTERPOLATION =
  'House doctrine: absent data refuses — it never renders an empty list that reads as '
  + '"nothing happened", and an inference is never laundered into a certainty. '
  + '0071_grant_ledger.sql names the two instants below which a replay cannot speak.';
const RULE_ONE_PARSER =
  'House doctrine: a refusal is exactly as strong as the check behind it. The boundary '
  + 'test and the replay query must be decided by ONE parser (Postgres), or the gap '
  + 'between two parsers resolves to an answer for an instant that is unanswerable.';
const RULE_SCOPE_MUST_EXIST =
  'House doctrine: absent data refuses — it never renders an empty list that reads as '
  + '"nothing happened". A subject the ledger has never heard of cannot be reported as '
  + 'having held nothing, because a typo and a real subject who held nothing produce the '
  + 'same empty set and the ledger cannot tell them apart.';
/**
 * The rule ENTITLEMENT_LEDGER_APPEND_ONLY applies.
 *
 * Exported because that refusal is raised by POSTGRES, and a bare SQLSTATE plus a
 * message carries no rule for a caller to cite. Doctrine requires a refusal to name
 * the rule it applies, so the rule has to live somewhere on this side of the wire.
 */
export const ENTITLEMENT_LEDGER_APPEND_ONLY_RULE =
  'House doctrine: the grant history must survive the revocation. '
  + '0071_grant_ledger.sql — entitlement_events is append-only by trigger.';

/** One holding the replay found in force at the requested instant. */
export interface EntitlementHolding {
  memberId: string;
  workspace: WorkspaceId | string;
  capability: Capability;
  /** Who granted it, per the event. */
  grantedBy: string;
  /** When the grant took effect (the event's occurred_at). */
  grantedAt: string;
  justification: string | null;
  /**
   * 'reconstructed' means this holding is known only because its `entitlements`
   * row still existed when 0071 ran — it is the 0042-era picture, not an observed
   * grant event. Surfaces must not present the two identically.
   */
  provenance: 'observed' | 'reconstructed';
  /** 'unattributed' means the event names no responsible party (see 0071's net). */
  attribution: 'named' | 'unattributed';
  eventId: string;
}

export interface EntitlementLedgerBoundary {
  ledgerFloor: string;
  earliestReconstructedAt: string | null;
  reconstructedEvents: number;
}

/** One thing about the request that could not be resolved. */
export interface AsOfUnresolved {
  field: 'at' | 'memberId' | 'workspace';
  value: string;
  why: string;
}

export type EntitlementAsOf =
  | {
      kind: 'known';
      at: string;
      /**
       * What POSTGRES understood `at` to mean, as it prints it. Present because
       * `at` echoes whatever the caller passed, and for a relative literal Postgres
       * accepts — `'yesterday'`, `'now'` — the echo does not identify an instant.
       */
      atResolved: string;
      holdings: EntitlementHolding[];
      /**
       * TRUE means the replay ran to completion and found nobody holding the
       * queried scope — a real answer. It is never true for an instant the ledger
       * cannot see; those return `kind: 'unknowable'` instead.
       */
      genuinelyEmpty: boolean;
      /** How many events the replay considered. 0 with genuinelyEmpty is legitimate. */
      eventsReplayed: number;
      boundary: EntitlementLedgerBoundary;
      scope: { memberId: string | null; workspace: string | null };
    }
  | {
      kind: 'unknowable';
      code:
        | typeof ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD
        | typeof ENTITLEMENT_AS_OF_CODES.RECONSTRUCTED_ONLY;
      rule: string;
      message: string;
      at: string;
      atResolved: string;
      boundary: EntitlementLedgerBoundary;
      scope: { memberId: string | null; workspace: string | null };
    }
  | {
      /**
       * THE REQUEST could not be resolved — distinct from `unknowable`, which is a
       * statement about the RECORD. Folding "you asked about 'yesterday'" into "the
       * ledger cannot see that instant" would make a caller's bad argument look like
       * a property of the history. Carries no `holdings` key, like every refusal here.
       */
      kind: 'unanswerable';
      code:
        | typeof ENTITLEMENT_AS_OF_CODES.UNPARSEABLE_INSTANT
        | typeof ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT
        | typeof ENTITLEMENT_AS_OF_CODES.UNKNOWN_SCOPE;
      rule: string;
      message: string;
      at: string;
      /** EVERY unresolved field, not the first one found (marketingDesk.ts:1207-1214). */
      unresolved: AsOfUnresolved[];
      boundary: EntitlementLedgerBoundary | null;
      scope: { memberId: string | null; workspace: string | null };
    }
  | {
      kind: 'ledger_absent';
      code: typeof ENTITLEMENT_AS_OF_CODES.LEDGER_ABSENT;
      rule: string;
      message: string;
      at: string;
    };

export interface AsOfQuery {
  /**
   * The instant to replay to.
   *
   * A `Date` IS LOSSY AND THAT MATTERS HERE. `occurred_at` is a timestamptz with
   * MICROSECOND precision; a JavaScript `Date` holds milliseconds, and `pg`
   * truncates on the way out. So asking "as of <the occurred_at I just read from
   * the ledger>" with a round-tripped `Date` lands up to 999µs EARLY and the
   * comparison `occurred_at <= at` excludes the very event you were pointing at —
   * a surface that let a reader click an event and ask "who held what at this
   * moment" would answer about the moment before it.
   *
   * Pass a STRING to keep the full precision (the microsecond ISO form Postgres
   * itself prints). It is handed to the query as-is and cast to timestamptz there.
   */
  at: Date | string;
  memberId?: string | null;
  workspace?: string | null;
}

/** 0071 not applied. */
function isLedgerAbsentError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
}

const ledgerAbsent = (at: string): EntitlementAsOf => ({
  kind: 'ledger_absent',
  code: ENTITLEMENT_AS_OF_CODES.LEDGER_ABSENT,
  rule: RULE_NO_INTERPOLATION,
  message:
    'This database has no entitlement history: migration 0071_grant_ledger.sql has not '
    + 'been applied. `entitlements` holds only the present, and revocation deletes rows, '
    + 'so no past instant is answerable — including instants since. This is the absence '
    + 'of a record, not a record of nothing.',
  at,
});

interface StateRow {
  ledger_floor: Date;
  earliest_reconstructed_at: Date | null;
  reconstructed_events: string;
}

/** The two instants a replay refuses below, or null when 0071 is absent. */
export async function entitlementLedgerBoundary(
  pool: pg.Pool,
): Promise<EntitlementLedgerBoundary | null> {
  try {
    const { rows } = await pool.query<StateRow>(
      `SELECT ledger_floor, earliest_reconstructed_at, reconstructed_events
         FROM entitlement_ledger_state WHERE id = 1`,
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      ledgerFloor: row.ledger_floor.toISOString(),
      earliestReconstructedAt: row.earliest_reconstructed_at
        ? row.earliest_reconstructed_at.toISOString()
        : null,
      reconstructedEvents: Number(row.reconstructed_events),
    };
  } catch (err) {
    if (isLedgerAbsentError(err)) return null;
    throw err;
  }
}

interface EventRow {
  id: string;
  member_id: string;
  workspace: string;
  event: 'grant' | 'revoke';
  capability: Capability | null;
  actor: string;
  justification: string | null;
  occurred_at: Date;
  provenance: 'observed' | 'reconstructed';
  attribution: 'named' | 'unattributed';
}

/**
 * Who held what, as of `at`.
 *
 * Replays `entitlement_events`: for each (member, workspace) the LAST event at or
 * before the instant decides, and only a `grant` counts as held. Ordered by
 * occurred_at then seq — `seq` is the tiebreak that matters, because a grant and
 * a revoke written in the same transaction share `now()` to the microsecond and
 * without it the answer would depend on the plan.
 */
export async function entitlementsAsOf(pool: pg.Pool, q: AsOfQuery): Promise<EntitlementAsOf> {
  /*
   * TWO READINGS OF ONE INSTANT, not three:
   *   atParam — handed to Postgres untouched, so a microsecond string keeps its
   *             microseconds and `occurred_at <= $1` is exact.
   *   atLabel — what the answer says it is about (the caller's own form, echoed).
   *
   * THE THIRD IS GONE ON PURPOSE. There used to be an `atCoarse = new Date(q.at)`
   * used for the boundary comparisons, justified in a comment that said `new Date()`
   * "truncates DOWNWARD, which for a boundary test errs toward REFUSING". The
   * dominant failure of `new Date(string)` is not truncation, it is NaN — and every
   * NaN comparison is FALSE, so it erred toward ANSWERING. The comment stated the
   * opposite of the behaviour and was the stated justification for the design.
   * Postgres now decides both, below.
   */
  const memberId = q.memberId ?? null;
  const workspace = q.workspace ?? null;
  const scope = { memberId, workspace };

  // An Invalid Date cannot even be labelled — `toISOString()` throws 'Invalid time
  // value' — so this is checked before anything else touches it.
  if (q.at instanceof Date && Number.isNaN(q.at.getTime())) {
    return {
      kind: 'unanswerable',
      code: ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT,
      rule: RULE_ONE_PARSER,
      at: 'Invalid Date',
      unresolved: [
        { field: 'at', value: 'Invalid Date', why: 'a Date whose time value is NaN names no instant' },
      ],
      boundary: null,
      scope,
      message:
        'The instant asked about is an Invalid Date. This is refused rather than '
        + 'thrown as "Invalid time value", and rather than allowed through to a '
        + 'comparison that would be false in both directions and answer anyway.',
    };
  }

  const atParam = q.at;
  const atLabel = typeof q.at === 'string' ? q.at : q.at.toISOString();

  const boundary = await entitlementLedgerBoundary(pool);
  if (boundary === null) return ledgerAbsent(atLabel);

  /*
   * ONE ROUND TRIP THAT NORMALISES `at` AND DECIDES BOTH BOUNDARIES, using the same
   * `::timestamptz` cast the replay query uses. `isfinite` is asked separately
   * because `'infinity'` and `'-infinity'` are legal timestamptz values that are not
   * instants: `-infinity` compares below every boundary and would otherwise have
   * been answered (it was: `known, holdings: [], genuinelyEmpty: true`).
   *
   * A comparison against a NULL `earliest_reconstructed_at` yields NULL, which is
   * neither true nor false — handled explicitly below rather than coerced.
   */
  let atResolved: string;
  let finite: boolean;
  let beforeGenesis: boolean | null;
  let beforeFloor: boolean;
  try {
    const probe = await pool.query<{
      at_text: string;
      finite: boolean;
      before_genesis: boolean | null;
      before_floor: boolean;
    }>(
      `SELECT $1::timestamptz::text                      AS at_text,
              isfinite($1::timestamptz)                  AS finite,
              ($1::timestamptz <  $2::timestamptz)       AS before_genesis,
              ($1::timestamptz <  $3::timestamptz)       AS before_floor`,
      [atParam, boundary.earliestReconstructedAt, boundary.ledgerFloor],
    );
    const p = probe.rows[0]!;
    atResolved = p.at_text;
    finite = p.finite;
    beforeGenesis = p.before_genesis;
    beforeFloor = p.before_floor;
  } catch (err) {
    if (isLedgerAbsentError(err)) return ledgerAbsent(atLabel);
    // 22007 invalid_datetime_format / 22008 datetime_field_overflow / 22P02. A raw
    // 'invalid input syntax for type timestamp with time zone: ""' carries no code
    // from ENTITLEMENT_AS_OF_CODES and no rule, so a caller cannot tell a bad
    // argument from a broken database.
    const code = (err as { code?: string } | null)?.code;
    if (code === '22007' || code === '22008' || code === '22P02') {
      return {
        kind: 'unanswerable',
        code: ENTITLEMENT_AS_OF_CODES.UNPARSEABLE_INSTANT,
        rule: RULE_ONE_PARSER,
        at: atLabel,
        unresolved: [
          { field: 'at', value: atLabel, why: `Postgres cannot read this as a timestamptz (SQLSTATE ${code})` },
        ],
        boundary,
        scope,
        message:
          `"${atLabel}" is not an instant this database can read, so there is no point in `
          + 'time to replay to. Refused under a stable code rather than escaping as a raw '
          + 'SQL syntax error.',
      };
    }
    throw err;
  }

  if (!finite) {
    return {
      kind: 'unanswerable',
      code: ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT,
      rule: RULE_ONE_PARSER,
      at: atLabel,
      unresolved: [
        { field: 'at', value: atResolved, why: 'an infinite timestamptz is not a point in time' },
      ],
      boundary,
      scope,
      message:
        `"${atLabel}" resolves to ${atResolved}, which Postgres accepts as a timestamptz but `
        + 'which is not an instant. It compares below (or above) every boundary in this '
        + 'ledger, so answering it would produce a holder set for no moment at all — and '
        + `-infinity previously answered "nobody held anything", which is a claim.`,
    };
  }

  /*
   * THE SCOPE HAS TO NAME SOMETHING. `workspace` and `memberId` were free text: a
   * typo'd compartment ('gpss') returned `known, genuinelyEmpty: true,
   * eventsReplayed: 0` — indistinguishable from a real compartment nobody held, and
   * nothing checked the value against WorkspaceId despite the type being imported.
   *
   * A compartment in WORKSPACE_IDS is real whether or not anybody holds it, so it is
   * answerable and `genuinelyEmpty` is the honest answer. Anything else has to be
   * present in the ledger to be answerable at all. For `memberId` there is no closed
   * list in this module, so ledger presence is the only available test — and a member
   * who ever held anything is in the ledger, so this refuses only where the ledger
   * genuinely has nothing to say.
   */
  const unresolvedScope: AsOfUnresolved[] = [];
  try {
    const seen = await pool.query<{ member_seen: boolean; workspace_seen: boolean }>(
      `SELECT ($1::text IS NULL
                OR EXISTS (SELECT 1 FROM entitlement_events WHERE member_id = $1)) AS member_seen,
              ($2::text IS NULL
                OR EXISTS (SELECT 1 FROM entitlement_events WHERE workspace = $2)) AS workspace_seen`,
      [memberId, workspace],
    );
    const s = seen.rows[0]!;
    if (memberId !== null && !s.member_seen) {
      unresolvedScope.push({
        field: 'memberId',
        value: memberId,
        why: 'no event in the ledger names this member at any instant',
      });
    }
    if (
      workspace !== null
      && !s.workspace_seen
      && !(WORKSPACE_IDS as readonly string[]).includes(workspace)
    ) {
      unresolvedScope.push({
        field: 'workspace',
        value: workspace,
        why: `not one of the known compartments (${WORKSPACE_IDS.join(', ')}) and named by no event`,
      });
    }
  } catch (err) {
    if (isLedgerAbsentError(err)) return ledgerAbsent(atLabel);
    throw err;
  }

  if (unresolvedScope.length > 0) {
    return {
      kind: 'unanswerable',
      code: ENTITLEMENT_AS_OF_CODES.UNKNOWN_SCOPE,
      rule: RULE_SCOPE_MUST_EXIST,
      at: atLabel,
      unresolved: unresolvedScope,
      boundary,
      scope,
      message:
        'The ledger has nothing to say about this scope: '
        + unresolvedScope.map((u) => `${u.field}="${u.value}" — ${u.why}`).join('; ')
        + '. An empty holder set here would read as "they held nothing", and a typo and a '
        + 'real subject who held nothing produce exactly the same empty set. That is a '
        + 'refusal, not an answer.',
    };
  }

  /*
   * THE TWO BOUNDARIES, AND WHY THE NULL-GENESIS CASE BRANCHES FIRST. When
   * `earliest_reconstructed_at` is NULL there is no reconstruction window at all, so
   * BEFORE_RECORD is the only honest verdict below the floor — otherwise it was
   * unreachable and 1900-01-01 came back as RECONSTRUCTED_ONLY citing a window of
   * "(no reconstruction)" to the floor containing "0 reconstructed grant(s)".
   */
  if (beforeFloor && (boundary.earliestReconstructedAt === null || beforeGenesis === true)) {
    return {
      kind: 'unknowable',
      code: ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD,
      rule: RULE_NO_INTERPOLATION,
      at: atLabel,
      atResolved,
      boundary,
      scope,
      message:
        boundary.earliestReconstructedAt === null
          ? `This ledger contains NO reconstructed grant at all — 0071 was applied to a `
            + `database with no surviving entitlements rows — so nothing whatsoever is `
            + `recorded before the floor at ${boundary.ledgerFloor}. Entitlement at `
            + `${atResolved} is UNKNOWABLE — not empty. There is no reconstruction window `
            + 'here and this refusal does not pretend there is one.'
          : `Nothing is recorded before ${boundary.earliestReconstructedAt}, the earliest grant `
            + 'the 0042 backfill left behind. Entitlement before that instant is UNKNOWABLE — '
            + 'not empty. Returning an empty holder set here would assert that nobody held the '
            + 'compartment, which the record does not support in either direction.',
    };
  }

  if (beforeFloor) {
    return {
      kind: 'unknowable',
      code: ENTITLEMENT_AS_OF_CODES.RECONSTRUCTED_ONLY,
      rule: RULE_NO_INTERPOLATION,
      at: atLabel,
      atResolved,
      boundary,
      scope,
      message:
        `The ledger is only complete from ${boundary.ledgerFloor}. Between `
        + `${boundary.earliestReconstructedAt} and that instant the `
        + `record is ${boundary.reconstructedEvents} reconstructed grant(s) — a photograph of `
        + 'the rows that happened to survive, not a history. It cannot see a grant that was '
        + 'later revoked (the row was deleted, so the replay UNDER-reports) and it cannot see '
        + 'a revocation at all (a compartment revoked in that window still looks held, so the '
        + 'replay OVER-reports). Wrong in both directions is not a caveat; it is a refusal.',
    };
  }

  let rows: EventRow[];
  let eventsReplayed: number;
  try {
    /*
     * DISTINCT ON gives the deciding event per subject in one pass. The outer
     * filter keeps only grants: a subject whose last event is a revoke held
     * NOTHING at that instant and must be absent from the result, not present
     * with a null capability.
     */
    const res = await pool.query<EventRow>(
      `WITH scoped AS (
         SELECT id, member_id, workspace, event, capability, actor, justification,
                occurred_at, provenance, attribution, seq
           FROM entitlement_events
          WHERE occurred_at <= $1
            AND ($2::text IS NULL OR member_id = $2)
            AND ($3::text IS NULL OR workspace = $3)
       ),
       deciding AS (
         SELECT DISTINCT ON (member_id, workspace) *
           FROM scoped
          ORDER BY member_id, workspace, occurred_at DESC, seq DESC
       )
       SELECT id, member_id, workspace, event, capability, actor, justification,
              occurred_at, provenance, attribution
         FROM deciding
        WHERE event = 'grant'
        ORDER BY member_id, workspace`,
      [atParam, memberId, workspace],
    );
    rows = res.rows;

    const counted = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM entitlement_events
        WHERE occurred_at <= $1
          AND ($2::text IS NULL OR member_id = $2)
          AND ($3::text IS NULL OR workspace = $3)`,
      [atParam, memberId, workspace],
    );
    eventsReplayed = Number(counted.rows[0]?.n ?? 0);
  } catch (err) {
    if (isLedgerAbsentError(err)) return ledgerAbsent(atLabel);
    throw err;
  }

  const holdings: EntitlementHolding[] = rows.map((r) => ({
    memberId: r.member_id,
    workspace: r.workspace,
    // `capability IS NOT NULL` is a CHECK constraint on every grant row in 0071,
    // so this is a schema guarantee rather than an assumption.
    capability: r.capability as Capability,
    grantedBy: r.actor,
    grantedAt: r.occurred_at.toISOString(),
    justification: r.justification,
    provenance: r.provenance,
    attribution: r.attribution,
    eventId: r.id,
  }));

  return {
    kind: 'known',
    at: atLabel,
    atResolved,
    holdings,
    genuinelyEmpty: holdings.length === 0,
    eventsReplayed,
    boundary,
    scope,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE WRITE PATH FOR REVOCATION.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface RevocationOutcome {
  kind: 'revoked' | 'not_found';
  /**
   * FALSE means the revocation took effect and its history was NOT written,
   * because 0071 has not been applied. The caller must surface this: a revoke
   * that leaves no trace is exactly the defect 0071 exists to close, and
   * silently succeeding would recreate it under a new name.
   */
  historyRecorded: boolean;
  code: typeof ENTITLEMENT_AS_OF_CODES.LEDGER_UNRECORDED | null;
}

export interface RevocationRequest {
  memberId: string;
  workspace: string;
  actor: string;
  justification: string;
}

/**
 * Revoke: APPEND the event, then delete the live row, in one transaction.
 *
 * WHY THE DELETE STAYS. `entitlements` is the live projection the request path
 * reads (`access/entitlements.ts:165`), and `loadEntitlements` must keep behaving
 * EXACTLY as it does today — cron across seven compartments depends on it. What
 * changed is that the DELETE no longer destroys the grant history, because the
 * history now lives in an append-only table the delete cannot reach. Leaving the
 * row in place instead would have made revocation decorative.
 *
 * ORDER MATTERS. The event is inserted BEFORE the delete so 0071's AFTER DELETE
 * net sees an attributed event in the same transaction and stays quiet. Reverse
 * them and every revocation would be recorded twice — once named, once as
 * `unattributed:<session_user>`.
 *
 * IF 0071 IS ABSENT the revocation still happens. Refusing would leave access
 * OPEN, which is strictly worse than recording it incompletely; the caller is
 * told, by code, that the history was not written.
 */
export async function recordRevocation(
  pool: pg.Pool,
  req: RevocationRequest,
): Promise<RevocationOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let historyRecorded = true;
    try {
      await client.query(
        `INSERT INTO entitlement_events
           (member_id, workspace, event, capability, actor, justification,
            provenance, attribution)
         VALUES ($1, $2, 'revoke', NULL, $3, $4, 'observed', 'named')`,
        [req.memberId, req.workspace, req.actor, req.justification],
      );
    } catch (err) {
      if (!isLedgerAbsentError(err)) throw err;
      // The failed statement aborted the transaction; restart it so the delete
      // below still runs. Access must not stay open because a migration is late.
      historyRecorded = false;
      await client.query('ROLLBACK');
      await client.query('BEGIN');
    }

    const { rowCount } = await client.query(
      `DELETE FROM entitlements WHERE member_id = $1 AND workspace = $2`,
      [req.memberId, req.workspace],
    );

    if ((rowCount ?? 0) === 0) {
      // Nothing to revoke. Roll back so the ledger does not carry a revocation of
      // a grant that never existed — an event log that records non-events is a
      // replay that invents holdings.
      await client.query('ROLLBACK');
      return { kind: 'not_found', historyRecorded: false, code: null };
    }

    await client.query('COMMIT');
    return {
      kind: 'revoked',
      historyRecorded,
      code: historyRecorded ? null : ENTITLEMENT_AS_OF_CODES.LEDGER_UNRECORDED,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Does this error come from 0071's append-only trigger? See seal.ts for the idiom. */
export function isLedgerAppendOnlyRefusal(err: unknown): boolean {
  const message = (err as { message?: string } | null)?.message;
  return typeof message === 'string' && message.includes(ENTITLEMENT_AS_OF_CODES.APPEND_ONLY);
}
