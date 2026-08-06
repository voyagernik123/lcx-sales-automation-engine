import type pg from 'pg';
import { isMachinePrincipal } from './entitlements.js';
import { PENDING_MIGRATIONS } from '../db/migrationLedger.js';
import { env } from '../lib/env.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CONTROL REGISTER — governed acts that SUCCEEDED while a control did not run.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE BLIND DECISION THIS EXISTS FOR. Somebody signs off that a governed decision
 * passed its controls — the board file, the WBR, a regulator response — and every
 * row in the audit log looks equally clean. There has been no way to ask which
 * governed acts succeeded while one of their controls was NOT EVALUATED, was
 * OVERRIDDEN, or THREW.
 *
 * THE MARKERS ALREADY EXISTED AND NOTHING READ THEM. `actions/registry.ts` stamps
 * `gateDegraded`, `gateDegradedReason`, `overrideSat`, `overrideGate`,
 * `overrideReason` and `idempotencyDegraded` onto BOTH `audit_log.meta` AND
 * `object_actions.params` on every governed act, from three call sites in three
 * compartments:
 *   · the SAT gate on the two program-critical decisions (dec_01, dec_19)
 *   · the campaign-launch compliance limb
 *   · the GPS discount limb — WHICH IS FIRING ON EVERY QUOTE TODAY, because
 *     `PRICE_BANDS_ARE_PLACEHOLDERS` is true and the below-band half of the
 *     discount gate therefore never runs.
 * A fourth vocabulary lives in `marketing_outbound_gate_decision.gate_error`, whose
 * own column comment distinguishes 'the check failed' from 'the text failed'. It had
 * zero readers too; see `GateErrorBucket` for the one thing this module says about
 * it and why it says no more.
 *
 * `audit_log` AND NOT `object_actions`, deliberately. The markers are in both, so
 * reading both would double-count every act. `audit_log` is the one the governance
 * compartment already reads (`routes/audit.ts`), it carries the actor, and its
 * `(entity, entity_id)` IS the polymorphic subject the review join needs.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ───────────────────────────────────────────
 * It never reports a proportion of controls that passed, in any field or any
 * sentence. That claim is unavailable: the denominator would have to be "all
 * controls", and this register can only see controls that route through the action
 * registry and stamp a marker. `coverage.complete` is the literal `false` — a type,
 * not a convention — so no caller can ever set it otherwise.
 *
 * It never treats the ABSENCE of a marker as evidence a control ran. Rows written
 * before the markers existed are UNVERIFIABLE and live in their own bucket with the
 * boundary date named. Absence of a marker on a pre-marker row means UNKNOWN.
 */

/* ── The marker epochs ─────────────────────────────────────────────────────────
 *
 * WHEN EACH MARKER STARTED BEING WRITTEN, from `git log -S` over the writing files.
 * A governed act older than a marker cannot be judged by that marker's absence, and
 * the only honest way to say so is to name the commit and the date.
 */
export interface MarkerEpoch {
  readonly marker: string;
  readonly commit: string;
  /** The commit's author date, ISO calendar date. */
  readonly date: string;
  readonly site: string;
}

export const MARKER_EPOCHS: readonly MarkerEpoch[] = [
  {
    marker: 'overrideSat / overrideReason',
    commit: 'cc758ab',
    date: '2026-07-24',
    site: 'actions/registry.ts — command_decide, the SAT gate on dec_01 and dec_19',
  },
  {
    marker: 'overrideGate / overrideReason',
    commit: '36027a5',
    date: '2026-07-24',
    site: 'actions/registry.ts — dist_campaign_status, the campaign-launch compliance gate',
  },
  {
    marker: 'gateDegraded / gateDegradedReason / idempotencyDegraded',
    commit: '5a43f46',
    date: '2026-07-25',
    site: 'actions/registry.ts — invokeAction, stamped onto audit_log.meta and object_actions.params',
  },
  {
    marker: 'gateDegraded (GPS discount limb)',
    commit: '590ac06',
    date: '2026-07-31',
    site: 'gps/actions.ts — the below-band half of the discount gate, unevaluated while price bands are placeholders',
  },
];

/**
 * THE BOUNDARY IS THE LATEST EPOCH, NOT THE EARLIEST, AND THAT IS CONSERVATIVE ON
 * PURPOSE. A row from 2026-07-26 carries the registry markers but predates the GPS
 * limb, so its silence about the GPS gate proves nothing. Taking the youngest epoch
 * means the register OVER-reports uncertainty rather than under-reporting it, which
 * is the only direction an audit surface may err in. All four dates are published on
 * the payload so a reader can narrow it themselves.
 */
export const MARKER_BOUNDARY = `${MARKER_EPOCHS.map((e) => e.date).sort().at(-1)}T00:00:00.000Z`;

/**
 * The two subjects `actions/registry.ts` calls program-critical: the exchange model
 * and the listing path. Named here rather than inferred, because "which decisions
 * gate integration work" is a governance fact and not a property of the row.
 */
export const PROGRAM_CRITICAL_SUBJECTS = [
  { subjectType: 'command_decision', subjectId: 'dec_01' },
  { subjectType: 'command_decision', subjectId: 'dec_19' },
] as const;

/**
 * CONSEQUENCE, NOT RECENCY — and every weight is published so a human can disagree
 * with the ranking rather than with a number.
 *
 * The ordering is an argument, stated so it can be attacked:
 *  · A control that DID NOT RUN outranks one that was OVERRIDDEN, because an
 *    override has a named human and a recorded reason attached and an unevaluated
 *    gate has neither. This is counter-intuitive and it is the point.
 *  · `idempotencyDegraded` is weighted lowest because the replay guard is not a
 *    control on the merits — it protects against a duplicate, not against a wrong
 *    decision.
 *  · UNKNOWN remediation is charged exactly like ABSENT remediation. Not knowing
 *    whether the review was filed must never rank as safety.
 *  · An unattributable actor (the shared key, `ai`, a monitor) is charged because
 *    there is nobody to ask. `routes/audit.ts` reached the same judgement from the
 *    other side: an unattributable governed act is worse than a widely-readable one.
 */
export const CONSEQUENCE_WEIGHTS = {
  gateNotEvaluated: 40,
  overrideAccepted: 25,
  idempotencyDegraded: 10,
  programCritical: 30,
  unremediatedOrUnknown: 20,
  recurrencePerRepeat: 4,
  recurrenceMaxRepeats: 5,
  unattributableActor: 10,
} as const;

/** Rows scanned per marker family when the caller does not say. */
const DEFAULT_LIMIT = 200;
const DEFAULT_WINDOW_DAYS = 90;

/* ── THE CONTRACT ─────────────────────────────────────────────────────────────
 *
 * DECLARED HERE AND MIRRORED IN `apps/web/src/lib/api/governance.ts`, which is not
 * where it belongs. It belongs in `packages/shared` so both sides import ONE
 * declaration — `lib/api/gps.ts:60` carries the post-mortem of the alternative: a
 * hand-written copy claimed three fields the API had never returned, `tsc` believed
 * it because a copy is syntactically perfect, and the page's own test agreed because
 * it mocked the module. `packages/shared` is owned by another lane this pass, so the
 * mirror is held by a source-level parity assertion in
 * `__tests__/controlRegister.test.ts` instead, and moving this block into shared is
 * owed work rather than a finished decision.
 */

export const CONTROL_REGISTER_CONTRACT = 'governance.control_register.v1';

/** What the marker on a row actually says happened. */
export type ControlFinding = 'gate_not_evaluated' | 'override_accepted' | 'idempotency_degraded';

/** Whether the review that was missing at the time was ever filed afterwards. */
export type Remediation = 'filed' | 'not_filed' | 'unknown';

export interface ConsequenceComponent {
  readonly key: string;
  readonly points: number;
  /** Why this component applies, in words a reader can argue with. */
  readonly because: string;
}

export interface ControlRegisterRule {
  readonly instrument: string;
  readonly provision: string;
  readonly text: string;
}

export interface ControlRegisterRefusal {
  readonly code: string;
  readonly sentence: string;
  readonly rule: ControlRegisterRule;
}

export interface ControlRegisterRow {
  readonly auditId: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly actorIsMachine: boolean;
  /** The audit action string, e.g. `action:command_decide`. */
  readonly action: string;
  readonly subjectType: string | null;
  readonly subjectId: string | null;
  readonly findings: readonly ControlFinding[];
  readonly gateDegradedReason: string | null;
  readonly overrideReason: string | null;
  readonly idempotencyReason: string | null;
  readonly programCritical: boolean;
  readonly remediation: Remediation;
  /** Active review kinds filed AFTER this act. `null` means the register was not read. */
  readonly reviewKindsAfter: readonly string[] | null;
  readonly firstReviewAfter: string | null;
  /** How many marked acts in this window share this subject. 1 means only this one. */
  readonly recurrence: number;
  readonly consequence: number;
  readonly consequenceComponents: readonly ConsequenceComponent[];
}

export interface ControlRegisterFrame {
  readonly observedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly windowDays: number;
  /** Where these figures came from, named so nobody reads them as a live measurement. */
  readonly environment: string;
  readonly source: 'audit_log.meta';
  /**
   * The oldest row the audit log can reach at all. Makes "nothing found" interpretable.
   * `null` is AMBIGUOUS ON ITS OWN and must be read beside `auditLogEmpty` — see below.
   */
  readonly earliestReachableRow: string | null;
  /**
   * WHICH KIND OF `null` `earliestReachableRow` IS, because on its own it was three
   * facts wearing one value and this field is the whole reason the ambiguity is gone.
   *
   * Real Postgres returns `MIN(created_at)` as NULL over an EMPTY table, which is
   * indistinguishable in the payload from the 42P01 path where the table does not
   * exist — and the page rendered the empty case as "could not be read, so the depth
   * of this window is unknown", an absence claimed about a read that SUCCEEDED. That
   * is precisely the three-states collapse, in the field whose declared job is to keep
   * them apart.
   *
   *   `null`   the aggregate was not read at all (42P01, or an unusable row).
   *   `true`   the aggregate WAS read and `audit_log` holds no rows whatsoever.
   *   `false`  the aggregate was read and rows exist. `earliestReachableRow` then
   *            carries the oldest one — unless its timestamp could not be interpreted,
   *            which is a fourth, narrower sentence the page also renders.
   */
  readonly auditLogEmpty: boolean | null;
  /** False while 0069 is pending: the marker reads are correct but sequential. */
  readonly indexesApplied: boolean;
}

export interface ControlRegisterCoverage {
  /** The literal `false`. The type forbids ever claiming otherwise. */
  readonly complete: false;
  readonly statement: string;
  readonly covers: readonly string[];
  readonly doesNotCover: readonly string[];
}

/**
 * EVERY COUNT IS NULLABLE, WITHOUT EXCEPTION, AND THE TYPE IS THE ENFORCEMENT.
 *
 * `scanned` and `shown` were typed `number`, which made them structurally incapable of
 * refusing: with `audit_log` absent the payload published
 * `{markedInWindow: null, scanned: 0, shown: 0, governedActsInWindow: null,
 * cleanInWindow: null}` — two fabricated zeros among three honest refusals, and no
 * caller could tell "nothing was scanned" from "we could not look" because the type
 * did not admit the difference. `coverage.complete` is pinned to the literal `false`
 * for exactly this reason; these two fields now get the same treatment from the other
 * direction.
 */
export interface ControlRegisterCounts {
  /** Marked governed acts in the window, counted by TRUTHINESS. `null` = not read. */
  readonly markedInWindow: number | null;
  /**
   * Distinct audit rows FETCHED by the two marker scans — a key-existence superset, so
   * it can legitimately exceed `shown`. `null` when the audit log was not read.
   */
  readonly scanned: number | null;
  /** Rows actually PUBLISHED in `rows`. `null` when the audit log was not read. */
  readonly shown: number | null;
  readonly governedActsInWindow: number | null;
  /** In-window governed acts at or after the boundary carrying no marker. */
  readonly cleanInWindow: number | null;
}

export interface UnverifiableBucket {
  /** Governed acts in the window that predate the boundary and carry no marker. */
  readonly governedActsInWindow: number | null;
  readonly governedActsAllTime: number | null;
  readonly boundary: string;
  readonly epochs: readonly MarkerEpoch[];
}

export interface GateErrorBucket {
  readonly state: 'not_loaded' | 'present_but_withheld' | 'empty';
  readonly count: number | null;
  readonly earliest: string | null;
  readonly latest: string | null;
  readonly withheldWhy: string | null;
}

export interface ControlRegister {
  readonly contract: typeof CONTROL_REGISTER_CONTRACT;
  readonly frame: ControlRegisterFrame;
  readonly coverage: ControlRegisterCoverage;
  /** `null` means NOT LOADED. `[]` means genuinely no markers in the window. */
  readonly rows: readonly ControlRegisterRow[] | null;
  readonly counts: ControlRegisterCounts;
  readonly unverifiable: UnverifiableBucket;
  readonly gateErrors: GateErrorBucket;
  readonly refusals: readonly ControlRegisterRefusal[];
}

/* ── Internals ─────────────────────────────────────────────────────────────── */

/**
 * The one error code the whole codebase treats as "the migration has not landed".
 * Deliberately not a list of tolerated codes: the set of database faults is
 * open-ended and a broken database must never read as an empty register.
 */
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/**
 * A TIMESTAMP OR NOTHING — never a thrown RangeError.
 *
 * `new Date('not-a-date').toISOString()` throws `Invalid time value`, and this helper
 * is applied to `al.created_at`, `MIN(created_at)` and `ar.created_at`. `pg` parses
 * `timestamptz` into a `Date`, so a string arriving here means a driver, a view or a
 * text-typed column produced something unexpected — which is a value this module
 * cannot read, not a 500 for the whole register. The callers already treat `null` as
 * "not readable" (`?? windowFrom` on a row, `auditLogEmpty` on the aggregate).
 */
const iso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

/**
 * A COUNT OR `null`, AND NEVER A FABRICATED ZERO.
 *
 * `pg` returns `COUNT(*)` as a decimal STRING, so a numeric conversion is required.
 * The earlier version of this helper mapped `undefined`, `null` and any non-numeric
 * to `0`, which meant a denominator read that returned nothing usable was published
 * as three zeros with an empty `refusals` array — an estimate of zero in the one
 * module whose entire purpose is refusing to estimate. `null` propagates into
 * `counts`, whose fields are all `number | null`, and into DENOMINATOR_UNREADABLE.
 */
const int = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `audit_log.meta` is jsonb and can legally be a scalar; treat anything else as no markers. */
function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function environmentLabel(): string {
  let host = 'unknown-host';
  try {
    // `URL.host` is hostname:port — it never includes the credentials in the DSN.
    host = new URL(env.databaseUrl).host || host;
  } catch {
    // No DSN configured (tests, or a boot before env is set). Say so rather than guess.
  }
  return `${env.nodeEnv} · ${host}`;
}

/**
 * THE SCAN PREDICATE FOR ONE FAMILY — KEY EXISTENCE, matching 0069's partial indexes
 * byte for byte so the planner can serve each family with an ordered index scan.
 * Written once so SQL and comments cannot drift.
 *
 * These are a deliberate SUPERSET of the rows the register reports: `overrideSat` and
 * `overrideGate` are optional client-supplied booleans, so `{overrideSat: false}` puts
 * the key in `meta` without an override having happened. The row reader narrows to
 * truthiness.
 */
const DEGRADED_PREDICATE = "meta ? 'gateDegraded' OR meta ? 'idempotencyDegraded'";
const OVERRIDE_PREDICATE = "meta ? 'overrideSat' OR meta ? 'overrideGate'";

/**
 * THE COUNTING PREDICATE — TRUTHINESS, and it MUST agree with the row reader below.
 *
 * THE DEFECT THIS EXISTS TO CLOSE, recorded because the wrong version shipped and was
 * caught in review. The denominator FILTERs used the key-EXISTENCE predicates above
 * while the reader narrowed to `=== true`. A single `{"chosen":"Option A",
 * "overrideSat":false}` row — reachable from the production command palette, because
 * `VerbPanel.tsx` sends `onChange(e.target.checked)`, the grammar skips only
 * `undefined` and `''`, `z.boolean().optional()` accepts `false`, and
 * `registry.ts` spreads the params straight into `audit_log.meta` — was COUNTED as
 * marked, EXCLUDED from the register, and reconciled by no refusal. Where it was the
 * only marker-family row in the window the page rendered "MARKED ACTS IN WINDOW · 1"
 * directly above "NO MARKED ACTS IN THIS WINDOW", and `cleanInWindow` was short by
 * the same amount.
 *
 * `meta ->> 'k' = 'true'` is jsonb-to-text and matches the boolean `true` only, so it
 * is exactly `meta.k === true` in SQL. The partial indexes stay key-existence
 * supersets and still serve this FILTER; a superset index over an exact predicate is
 * a recheck, not a wrong answer.
 */
const TRUTHY_MARKER_PREDICATE =
  "meta ->> 'gateDegraded' = 'true' OR meta ->> 'idempotencyDegraded' = 'true' "
  + "OR meta ->> 'overrideSat' = 'true' OR meta ->> 'overrideGate' = 'true'";

/** Qualify a predicate written against bare `meta` for the aliased `audit_log al`. */
const forAlias = (predicate: string): string => predicate.replace(/\bmeta\b/g, 'al.meta');

interface AuditMarkerRow {
  id: unknown;
  actor: unknown;
  action: unknown;
  entity: unknown;
  entity_id: unknown;
  created_at: unknown;
  meta: unknown;
}

/**
 * One family, one query, so the WHERE clause matches ONE of 0069's partial-index
 * predicates exactly and the read is an ORDERED index scan that LIMIT can terminate
 * early. The two result sets are merged by row id below — a row can carry markers
 * from both families and comes back from both scans.
 *
 * WHAT THIS IS NOT, because the obvious justification is wrong and was believed here
 * first: a single query OR-ing all four keys is NOT a sequential scan. Measured on
 * PostgreSQL 16.14, the planner splits it and BitmapOrs both partial indexes. It just
 * loses the index ordering, so it fetches every matching row in the window and sorts
 * before LIMIT applies, and scans each index twice. The split is a performance
 * choice, not a correctness one — either form returns the same rows.
 */
async function scanFamily(
  pool: pg.Pool,
  predicate: string,
  from: string,
  limit: number,
): Promise<AuditMarkerRow[] | null> {
  try {
    const { rows } = await pool.query<AuditMarkerRow>(
      `SELECT al.id, al.actor, al.action, al.entity, al.entity_id, al.created_at, al.meta
         FROM audit_log al
        WHERE al.created_at >= $1
          AND (${forAlias(predicate)})
        ORDER BY al.created_at DESC
        LIMIT $2`,
      [from, limit],
    );
    return rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return null;
  }
}

export interface ControlRegisterOptions {
  /** Injected by tests; production passes nothing and gets the wall clock. */
  readonly now?: Date;
  readonly windowDays?: number;
  readonly limit?: number;
}

export const WINDOW_DAYS_BOUNDS = { min: 1, max: 730 } as const;
export const LIMIT_BOUNDS = { min: 1, max: 500 } as const;

/**
 * BOUNDS ARE ENFORCED HERE, NOT ONLY AT THE HTTP EDGE.
 *
 * The route clamped and this function did not, so the exported entry point was unsafe
 * for the second caller it will acquire. Measured before this guard existed:
 * `windowDays` of NaN / ±Infinity / 1e15 / 1e21 all THREW `Invalid time value` out of
 * `loadControlRegister`, which the route turned into a 500. `windowDays: -30` produced
 * `windowFrom` AFTER `windowTo` — an inverted window — and published `windowDays: -30`
 * with no refusal at all. `limit` of 0 / -5 / NaN / 0.5 produced `rows: []` and
 * `shown: 0` while `scanned: 1`, so the page rendered "NO MARKED ACTS IN THIS WINDOW"
 * for a window in which a marked act had been fetched and interpreted.
 *
 * Clamping alone would swap one silent wrong answer for another, so the clamp is
 * REPORTED: an out-of-range request comes back as REGISTER_OPTIONS_CLAMPED naming what
 * was asked for and what was applied.
 */
function clampOption(
  raw: number | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): { value: number; clamped: false } | { value: number; clamped: true; requested: number | 'not a number' } {
  if (raw === undefined) return { value: fallback, clamped: false };
  if (!Number.isFinite(raw)) return { value: fallback, clamped: true, requested: 'not a number' };
  const truncated = Math.trunc(raw);
  const value = Math.min(Math.max(truncated, bounds.min), bounds.max);
  return value === raw ? { value, clamped: false } : { value, clamped: true, requested: raw };
}

export async function loadControlRegister(
  pool: pg.Pool,
  opts: ControlRegisterOptions = {},
): Promise<ControlRegister> {
  const now = opts.now ?? new Date();

  const refusals: ControlRegisterRefusal[] = [];
  const refuse = (r: ControlRegisterRefusal) => {
    if (!refusals.some((x) => x.code === r.code)) refusals.push(r);
  };

  const win = clampOption(opts.windowDays, DEFAULT_WINDOW_DAYS, WINDOW_DAYS_BOUNDS);
  const lim = clampOption(opts.limit, DEFAULT_LIMIT, LIMIT_BOUNDS);
  const windowDays = win.value;
  const limit = lim.value;
  if (win.clamped || lim.clamped) {
    const said: string[] = [];
    if (win.clamped) {
      said.push(
        `windowDays was requested as ${String(win.requested)} and applied as ${windowDays} `
        + `(bounds ${WINDOW_DAYS_BOUNDS.min}–${WINDOW_DAYS_BOUNDS.max})`,
      );
    }
    if (lim.clamped) {
      said.push(
        `limit was requested as ${String(lim.requested)} and applied as ${limit} `
        + `(bounds ${LIMIT_BOUNDS.min}–${LIMIT_BOUNDS.max})`,
      );
    }
    refuse({
      code: 'REGISTER_OPTIONS_CLAMPED',
      sentence:
        `${said.join('; ')}. The figures below describe the window that was ACTUALLY read, not the one `
        + 'that was asked for. A non-positive window would invert into the future and a non-positive limit '
        + 'would publish an empty register for a window that holds marked acts, so neither is honoured '
        + 'silently.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Placeholders must look like placeholders',
        text:
          'Every figure carries an ObservationFrame stating what was observed and over what window. A window '
          + 'that differs from the one requested is stated, never substituted quietly.',
      },
    });
  }

  const windowTo = now.toISOString();
  const windowFrom = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  /* ── The two marker scans and the denominators ──────────────────────────── */

  const [degraded, overridden, denom, gateErrors] = await Promise.all([
    scanFamily(pool, DEGRADED_PREDICATE, windowFrom, limit),
    scanFamily(pool, OVERRIDE_PREDICATE, windowFrom, limit),
    readDenominators(pool, windowFrom),
    readGateErrors(pool, windowFrom),
  ]);

  const auditReadable = degraded !== null && overridden !== null && denom !== null;

  if (!auditReadable) {
    refuse({
      code: 'AUDIT_LOG_ABSENT',
      sentence:
        'There is no audit_log relation on this environment, so no governed act can be examined at all. '
        + 'This register is NOT LOADED — it is not a report that nothing went wrong.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Absent data refuses',
        text:
          'Absent data refuses. It never renders 0, never an estimate, and never an empty list that '
          + 'reads as "nothing happened". Not-loaded, present-but-withheld and genuinely-empty are three '
          + 'facts and are never collapsed into one.',
      },
    });
  }

  /* ── Interpret the rows ─────────────────────────────────────────────────── */

  const merged = new Map<string, AuditMarkerRow>();
  for (const r of [...(degraded ?? []), ...(overridden ?? [])]) merged.set(String(r.id), r);
  const scanned = merged.size;

  interface Interim {
    row: AuditMarkerRow;
    findings: ControlFinding[];
    subjectType: string | null;
    subjectId: string | null;
    occurredAt: string;
  }

  const interim: Interim[] = [];
  for (const r of merged.values()) {
    const meta = metaOf(r.meta);
    const findings: ControlFinding[] = [];
    // ORDER IS DELIBERATE AND STABLE: a control that did not run, then a control a
    // human overrode, then the replay guard. It is the order of the ranking argument.
    if (meta.gateDegraded === true) findings.push('gate_not_evaluated');
    // TRUTHINESS, NOT KEY EXISTENCE. `overrideSat`/`overrideGate` are optional
    // client-supplied booleans, so `{overrideSat: false}` puts the key in meta
    // without an override having happened; 0069's index predicate is key existence
    // and is therefore a deliberate superset that this line narrows.
    if (meta.overrideSat === true || meta.overrideGate === true) findings.push('override_accepted');
    if (meta.idempotencyDegraded === true) findings.push('idempotency_degraded');
    if (findings.length === 0) continue;
    interim.push({
      row: r,
      findings,
      subjectType: str(r.entity),
      subjectId: str(r.entity_id),
      occurredAt: iso(r.created_at) ?? windowFrom,
    });
  }

  /* ── Was the missing review ever filed afterwards? ──────────────────────── */

  const reviews = interim.length > 0
    ? await readReviewsAfter(pool, interim.map((i) => [i.subjectType, i.subjectId]))
    : new Map<string, Array<{ kind: string; createdAt: string }>>();

  if (reviews === null) {
    refuse({
      code: 'REVIEW_REGISTER_ABSENT',
      sentence:
        'There is no analytic_reviews relation on this environment, so whether the review that was '
        + 'missing at the time was ever filed afterwards is UNKNOWN for every row below. Unknown is '
        + 'ranked exactly like unfiled: not knowing must not read as safety.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'An inference is never laundered into a certainty',
        text:
          'An inference is never laundered into a certainty. If you cannot know, say you cannot know — '
          + 'remediation is reported as unknown rather than defaulted to filed or unfiled.',
      },
    });
  }

  /* ── Recurrence, then consequence ───────────────────────────────────────── */

  const perSubject = new Map<string, number>();
  for (const i of interim) {
    const k = `${i.subjectType ?? ''} ${i.subjectId ?? ''}`;
    perSubject.set(k, (perSubject.get(k) ?? 0) + 1);
  }

  const rows: ControlRegisterRow[] = interim.map((i) => {
    const meta = metaOf(i.row.meta);
    const key = `${i.subjectType ?? ''} ${i.subjectId ?? ''}`;
    const recurrence = perSubject.get(key) ?? 1;

    const filedAfter = reviews === null
      ? null
      : (reviews.get(key) ?? []).filter((r) => r.createdAt > i.occurredAt);
    const remediation: Remediation = filedAfter === null
      ? 'unknown'
      : filedAfter.length > 0 ? 'filed' : 'not_filed';

    const actor = String(i.row.actor ?? 'unknown');
    const actorIsMachine = isMachinePrincipal(actor);
    const programCritical = PROGRAM_CRITICAL_SUBJECTS.some(
      (p) => p.subjectType === i.subjectType && p.subjectId === i.subjectId,
    );

    // Zero-point components are OMITTED rather than listed as 0: a component list is
    // an explanation, and "this did not apply" is not part of one.
    const components: ConsequenceComponent[] = [];
    if (i.findings.includes('gate_not_evaluated')) {
      components.push({
        key: 'gateNotEvaluated',
        points: CONSEQUENCE_WEIGHTS.gateNotEvaluated,
        because: 'A control did not run at all, so nothing is known about whether this act would have passed it.',
      });
    }
    if (i.findings.includes('override_accepted')) {
      components.push({
        key: 'overrideAccepted',
        points: CONSEQUENCE_WEIGHTS.overrideAccepted,
        because: 'The control ran and blocked; a human accepted the finding with a recorded reason, so there is somebody to ask.',
      });
    }
    if (i.findings.includes('idempotency_degraded')) {
      components.push({
        key: 'idempotencyDegraded',
        points: CONSEQUENCE_WEIGHTS.idempotencyDegraded,
        because: 'The replay guard was not held. That risks a duplicate act, not a wrong decision, so it is weighted lowest.',
      });
    }
    if (programCritical) {
      components.push({
        key: 'programCritical',
        points: CONSEQUENCE_WEIGHTS.programCritical,
        because: 'The subject is one of the two program-critical decisions that gate US-launch integration work.',
      });
    }
    if (remediation !== 'filed') {
      components.push({
        key: 'unremediatedOrUnknown',
        points: CONSEQUENCE_WEIGHTS.unremediatedOrUnknown,
        because: remediation === 'unknown'
          ? 'Whether a review was filed afterwards could not be read, and unknown is charged exactly like unfiled.'
          : 'No active review was filed for this subject after the act, so the gap is still open.',
      });
    }
    const repeats = Math.min(recurrence - 1, CONSEQUENCE_WEIGHTS.recurrenceMaxRepeats);
    if (repeats > 0) {
      components.push({
        key: 'recurrence',
        points: repeats * CONSEQUENCE_WEIGHTS.recurrencePerRepeat,
        because: `This subject carries ${recurrence} marked acts in the window, so the miss is recurring rather than isolated.`,
      });
    }
    if (actorIsMachine) {
      components.push({
        key: 'unattributableActor',
        points: CONSEQUENCE_WEIGHTS.unattributableActor,
        because: 'The actor is a machine principal (the shared key, the AI, or a monitor), so there is no human to ask what was intended.',
      });
    }

    return {
      auditId: String(i.row.id),
      occurredAt: i.occurredAt,
      actor,
      actorIsMachine,
      action: String(i.row.action ?? ''),
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      findings: i.findings,
      gateDegradedReason: str(meta.gateDegradedReason),
      overrideReason: str(meta.overrideReason),
      idempotencyReason: str(meta.idempotencyDegradedReason),
      programCritical,
      remediation,
      reviewKindsAfter: filedAfter === null ? null : [...new Set(filedAfter.map((r) => r.kind))].sort(),
      firstReviewAfter: filedAfter === null || filedAfter.length === 0
        ? null
        : filedAfter.map((r) => r.createdAt).sort()[0],
      recurrence,
      consequence: components.reduce((n, c) => n + c.points, 0),
      consequenceComponents: components,
    };
  });

  // RANK BY CONSEQUENCE. `occurredAt` is only the tiebreak, so the order is stable
  // without recency ever deciding which row a human reads first.
  rows.sort((a, b) => (b.consequence - a.consequence) || b.occurredAt.localeCompare(a.occurredAt));
  const shown = rows.slice(0, limit);

  /* ── Denominators, the unverifiable bucket, the truncation admission ─────── */

  const markedInWindow = denom ? int(denom.marked_in_window) : null;
  const markedPre = denom ? int(denom.marked_in_window_pre_boundary) : null;
  const markedPreAllTime = denom ? int(denom.marked_pre_boundary_all_time) : null;
  const governedInWindow = denom ? int(denom.governed_in_window) : null;
  const governedInWindowPre = denom ? int(denom.governed_in_window_pre_boundary) : null;
  const governedPreAllTime = denom ? int(denom.governed_pre_boundary_all_time) : null;

  /**
   * THE DENOMINATOR ROW WAS READ AND IS NOT USABLE — which is a third fact, and was
   * previously published as zeros. `int()` now yields `null` for anything non-numeric
   * (a missing column, a shape change, a view returning nothing), and this is the
   * refusal that stops those nulls from being read as "we looked and found nothing".
   */
  if (denom !== null && [
    markedInWindow, markedPre, markedPreAllTime,
    governedInWindow, governedInWindowPre, governedPreAllTime,
  ].some((v) => v === null)) {
    refuse({
      code: 'DENOMINATOR_UNREADABLE',
      sentence:
        'The denominator aggregate over audit_log returned a row whose counts could not be read as numbers, so '
        + 'the counts below are reported as NOT READ rather than as zero. This is a shape fault in the read, not '
        + 'a finding that the audit log is empty.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Absent data refuses',
        text:
          'Absent data refuses. It never renders 0 and never an estimate. A count that could not be read is '
          + 'published as null and stated, not defaulted to a number a reader would act on.',
      },
    });
  }

  let cleanInWindow: number | null = null;
  if (denom && governedInWindow !== null && governedInWindowPre !== null
      && markedInWindow !== null && markedPre !== null) {
    const raw = (governedInWindow - governedInWindowPre) - (markedInWindow - markedPre);
    cleanInWindow = Math.max(raw, 0);
    if (raw < 0) {
      // Reachable when a marked row's action is not registry-mediated, so it is
      // counted as marked but not as a governed act. Reported rather than left as a
      // negative a reader would have to explain away.
      refuse({
        code: 'DENOMINATOR_DISAGREES',
        sentence:
          `More marked acts (${markedInWindow}) were found in this window than governed acts (${governedInWindow}). `
          + 'The two counts use different predicates — one reads the markers, the other reads the `action:` prefix — '
          + 'so the clean count is reported as 0 rather than as a negative number. Neither count is a proportion.',
        rule: {
          instrument: 'house_doctrine',
          provision: 'Placeholders must look like placeholders',
          text:
            'A figure that cannot be reconciled is surfaced as a stated disagreement, not smoothed into a '
            + 'plausible number.',
        },
      });
    }
  }

  /*
   * BOTH FIELDS ARE COMPUTED ON THE SAME DEFINITION, and they were not.
   * `governedActsInWindow` subtracted pre-boundary MARKED acts; `governedActsAllTime`
   * on the next line was the raw pre-boundary governed count with no subtraction —
   * two fields under one interface comment ("predate the boundary and CARRY NO
   * MARKER") answering two different questions the moment a pre-boundary marked act
   * exists. 0069's `marked_pre_boundary_all_time` FILTER is what closes it.
   */
  const unverifiableInWindow = governedInWindowPre !== null && markedPre !== null
    ? Math.max(governedInWindowPre - markedPre, 0)
    : null;
  const unverifiableAllTime = governedPreAllTime !== null && markedPreAllTime !== null
    ? Math.max(governedPreAllTime - markedPreAllTime, 0)
    : null;

  /** A count in a sentence, or a statement that it could not be read — never a 0. */
  const said = (v: number | null): string => (v === null ? 'an unreadable number of' : String(v));

  if ((unverifiableInWindow ?? 0) > 0 || (unverifiableAllTime ?? 0) > 0) {
    refuse({
      code: 'PRE_MARKER_ACTS_UNVERIFIABLE',
      sentence:
        `${said(unverifiableInWindow)} governed act(s) in this window and ${said(unverifiableAllTime)} in the audit log `
        + `overall were written before ${MARKER_BOUNDARY}, when the youngest control marker started being recorded `
        + `(${MARKER_EPOCHS.map((e) => `${e.marker.split(' /')[0]} ${e.commit} ${e.date}`).join('; ')}). `
        + 'Their control state is UNKNOWN. They carry no marker because no marker existed to carry, which is not '
        + 'the same finding as a control having been evaluated.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Three states are never collapsed',
        text:
          'Not-loaded, present-but-withheld and genuinely-empty are three facts and are never collapsed. '
          + 'A row predating the instrument that would have recorded a failure is UNKNOWN, and is held in its own '
          + 'bucket with the boundary date named.',
      },
    });
  }

  /*
   * ── THE TRUNCATION ADMISSION GUARDS THE ROWS THAT ARE PUBLISHED ─────────────
   *
   * `limit` is applied TWICE: once per marker family in SQL, and again to the merged,
   * ranked list (`rows.slice(0, limit)`). The refusal used to compare `markedInWindow`
   * against `scanned`, which misses the second truncation entirely: when each family
   * returns FEWER than `limit` rows but their union exceeds it,
   * `markedInWindow === scanned` and rows were dropped with no admission at all.
   * Measured with limit=3, three `gateDegraded` rows and three `overrideSat` rows:
   * markedInWindow 6, scanned 6, shown 3, rows.length 3, and no refusal — half a
   * governance register gone. At the production default this is the shape of a window
   * holding e.g. 150 GPS-discount acts plus 150 SAT/campaign acts.
   *
   * So the comparison is against `shown.length`, from BOTH directions:
   *   · `markedInWindow > shown.length`  — the window holds more marked acts than are
   *     published, whether they were lost to the per-family LIMIT or to the merge.
   *   · `interpreted > shown.length`     — rows were fetched and INTERPRETED as marked
   *     and then dropped by the merge truncation. Independent of the denominator, so
   *     it still fires when the denominator itself could not be read.
   *
   * `scanned` is deliberately NOT the trigger: it counts the key-existence superset, so
   * a `{overrideSat: false}` row makes `scanned` exceed `shown` legitimately and
   * triggering on that would cry truncation at a register that is complete.
   */
  const interpreted = interim.length;
  if ((markedInWindow !== null && markedInWindow > shown.length) || interpreted > shown.length) {
    refuse({
      code: 'CONTROL_REGISTER_TRUNCATED',
      sentence:
        `${said(markedInWindow)} marked acts exist in this window; ${scanned} audit row(s) were fetched, `
        + `${interpreted} carried a marker this register reports, and ${shown.length} `
        + `${shown.length === 1 ? 'is' : 'are'} published below. `
        + 'The ranking is therefore over a truncated population and the top of it is not certain to be the worst '
        + 'of it. Narrow the window or raise the limit to close the gap.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'An inference is never laundered into a certainty',
        text:
          'A ranking computed over a subset is reported as a ranking over a subset. The population size travels '
          + 'with it so a reader can tell whether the order is trustworthy.',
      },
    });
  }

  /*
   * THE TWO SURFACES MUST NOT DISAGREE SILENTLY. `markedInWindow` and the interpreted
   * rows now use the SAME truthiness predicate, so the denominator can never be smaller
   * than the number of rows actually interpreted from the same window. If it is, one of
   * the two reads is wrong and neither is trustworthy — which is a thing to say, not a
   * thing to reconcile by picking the bigger number.
   */
  if (markedInWindow !== null && interpreted > markedInWindow) {
    refuse({
      code: 'MARKER_COUNT_DISAGREES',
      sentence:
        `${interpreted} audit row(s) in this window were interpreted as carrying a control marker, but the `
        + `denominator count over the same window and the same predicate returned ${markedInWindow}. The two `
        + 'reads disagree, so neither the count nor the completeness of the list below can be relied on. This is '
        + 'stated rather than resolved: the register does not choose which of its own reads to believe.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Placeholders must look like placeholders',
        text:
          'A figure that cannot be reconciled is surfaced as a stated disagreement, not smoothed into a '
          + 'plausible number.',
      },
    });
  }

  /* ── The fourth vocabulary ──────────────────────────────────────────────── */

  let gateErrorBucket: GateErrorBucket;
  if (gateErrors === null) {
    gateErrorBucket = { state: 'not_loaded', count: null, earliest: null, latest: null, withheldWhy: null };
    refuse({
      code: 'GATE_ERROR_LEDGER_ABSENT',
      sentence:
        'There is no marketing_outbound_gate_decision relation on this environment, so the fourth control '
        + 'vocabulary — gates that THREW rather than refused on the merits — cannot be counted. Not loaded, '
        + 'not zero.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Absent data refuses',
        text:
          'An unavailable check is not a passed check, and an unreadable ledger of unavailable checks is not an '
          + 'empty one.',
      },
    });
  } else if (gateErrors.count === null) {
    /*
     * THE LEDGER EXISTS AND ITS COUNT COULD NOT BE READ. Not reachable against real
     * Postgres — `COUNT(*)` never returns NULL — but `int()` now yields `null` for any
     * non-numeric, and the alternative was `state: 'empty', count: 0`, which the page
     * renders as "This ledger was read and is genuinely empty." A distinct code so
     * "the relation is missing" and "the aggregate came back unreadable" are not one
     * sentence.
     */
    gateErrorBucket = { state: 'not_loaded', count: null, earliest: null, latest: null, withheldWhy: null };
    refuse({
      code: 'GATE_ERROR_COUNT_UNREADABLE',
      sentence:
        'The marketing_outbound_gate_decision relation exists, but its aggregate returned a count that could not '
        + 'be read as a number. How many gates THREW in this window is therefore NOT READ — which is not the same '
        + 'finding as none having thrown.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'Absent data refuses',
        text:
          'An unavailable check is not a passed check, and an unreadable count of unavailable checks is not a '
          + 'count of zero.',
      },
    });
  } else if (gateErrors.count > 0) {
    gateErrorBucket = {
      state: 'present_but_withheld',
      count: gateErrors.count,
      earliest: gateErrors.earliest,
      latest: gateErrors.latest,
      withheldWhy:
        'The count is governance information; the detail is not. Each of these rows identifies a marketing '
        + 'subject, and on that desk the subject can itself be inside information (MiCA Art 90(1)) or a named '
        + 'colleague\'s financial position (Art 91(3)(c)). The detail is available on the marketing desk to a '
        + 'principal holding that compartment.',
    };
    refuse({
      code: 'GATE_ERROR_DETAIL_WITHHELD',
      sentence:
        `${gateErrors.count} outbound-gate verdict(s) in this window record a gate that THREW rather than refusing `
        + 'on the merits. The count is shown here; the rows are not, because they belong to a compartment this '
        + 'surface does not hold. This is present-but-withheld, not empty.',
      rule: {
        instrument: 'workspace_constitution',
        provision: 'Need-to-know — governance is not a second door',
        text:
          'A compartment boundary drawn on one route is defeated if a second surface republishes the same rows. '
          + 'The governance register therefore reports that the material exists and how much of it there is, and '
          + 'names the compartment a reader must hold to see it.',
      },
    });
  } else {
    gateErrorBucket = {
      state: 'empty',
      count: 0,
      earliest: gateErrors.earliest,
      latest: gateErrors.latest,
      withheldWhy: null,
    };
  }

  /* ── The self-label ─────────────────────────────────────────────────────── */

  const coverage: ControlRegisterCoverage = {
    complete: false,
    statement:
      'This register cannot tell you what proportion of controls passed, and it deliberately reports no such '
      + 'figure. It sees only governed acts that route through the action registry and stamp a marker onto '
      + 'audit_log.meta. Everything else — a control enforced in a route, in SQL, or by a human reading a '
      + 'document — is invisible to it and is neither counted as passed nor counted as failed.',
    covers: [
      'actions/registry.ts invokeAction — the SAT gate on command_decision dec_01 and dec_19',
      'actions/registry.ts invokeAction — the dist_campaign_status launch compliance limb',
      'gps/actions.ts — the discount limb, whose below-band half is unevaluated while price bands are placeholders',
      'the idempotency reservation on every registry-mediated act',
    ],
    doesNotCover: [
      'controls enforced outside the action registry — route handlers, middleware, database constraints',
      'controls a human applied by reading a document, which leave no marker anywhere',
      'the marketing outbound gate\'s per-row detail, which belongs to another compartment (counted only)',
      'anything written before the youngest marker epoch, which is UNKNOWN rather than clean',
      'whether a filed review was ADEQUATE — this register reads that one exists, never what it says',
    ],
  };

  return {
    contract: CONTROL_REGISTER_CONTRACT,
    frame: {
      observedAt: windowTo,
      windowFrom,
      windowTo,
      windowDays,
      environment: environmentLabel(),
      source: 'audit_log.meta',
      earliestReachableRow: denom ? iso(denom.earliest_row) : null,
      /*
       * NOT DERIVED FROM `earliestReachableRow`, deliberately. It is derived from
       * whether the AGGREGATE ROW came back at all: `MIN(created_at)` over an empty
       * `audit_log` is NULL on real Postgres, which is the same null the 42P01 path
       * produces, and the page rendered the empty case as "could not be read ...
       * unknown" — an absence claimed about a read that succeeded. Reading the raw
       * value (rather than `iso()`'s output) also keeps the narrower case honest: a
       * row that EXISTS whose timestamp could not be parsed gives
       * `auditLogEmpty: false` with `earliestReachableRow: null`.
       */
      auditLogEmpty: denom ? denom.earliest_row === null || denom.earliest_row === undefined : null,
      indexesApplied: !PENDING_MIGRATIONS.includes('0069_audit_control_markers.sql'),
    },
    coverage,
    rows: auditReadable ? shown : null,
    counts: {
      markedInWindow,
      // NOT 0 WHEN NOTHING WAS READ. `scanned`/`shown` were the two counts in this
      // payload that could not refuse, and an absent `audit_log` published them as
      // two zeros beside three honest nulls.
      scanned: auditReadable ? scanned : null,
      shown: auditReadable ? shown.length : null,
      governedActsInWindow: governedInWindow,
      cleanInWindow,
    },
    unverifiable: {
      governedActsInWindow: unverifiableInWindow,
      governedActsAllTime: unverifiableAllTime,
      boundary: MARKER_BOUNDARY,
      epochs: MARKER_EPOCHS,
    },
    gateErrors: gateErrorBucket,
    refusals,
  };
}

/* ── The three supporting reads ────────────────────────────────────────────── */

interface DenominatorRow {
  earliest_row: unknown;
  governed_all_time: unknown;
  governed_pre_boundary_all_time: unknown;
  governed_in_window: unknown;
  governed_in_window_pre_boundary: unknown;
  marked_in_window: unknown;
  marked_in_window_pre_boundary: unknown;
  marked_pre_boundary_all_time: unknown;
}

/**
 * The denominators, and the earliest row the log can reach at all.
 *
 * `action LIKE 'action:%'` is how a registry-mediated act is identified — that is the
 * literal prefix `invokeAction` writes. It is a SEQUENTIAL SCAN and 0069 deliberately
 * does not index it: serving it needs either a plain btree for the equality form or
 * `text_pattern_ops` for this prefix form, and choosing between those is a decision
 * about how the audit log is queried rather than a side effect of this pass.
 *
 * THE MARKER FILTERS USE `TRUTHY_MARKER_PREDICATE`, NOT THE INDEX PREDICATES, and that
 * is the fix for a shipped lie rather than a preference. They previously used key
 * existence while the row reader used `=== true`, so a `{overrideSat: false}` row was
 * counted as marked and excluded from the list with nothing reconciling the two. See
 * `TRUTHY_MARKER_PREDICATE` for the reachability trail.
 *
 * `marked_pre_boundary_all_time` exists so `unverifiable.governedActsAllTime` is
 * computed on the SAME definition as `unverifiable.governedActsInWindow` — "predates
 * the boundary AND carries no marker". Without it the all-time field was the raw
 * pre-boundary governed count and the two fields under one interface comment answered
 * two different questions.
 */
async function readDenominators(pool: pg.Pool, from: string): Promise<DenominatorRow | null> {
  try {
    const { rows } = await pool.query<DenominatorRow>(
      `SELECT
         MIN(al.created_at) AS earliest_row,
         COUNT(*) FILTER (WHERE al.action LIKE 'action:%')                                  AS governed_all_time,
         COUNT(*) FILTER (WHERE al.action LIKE 'action:%' AND al.created_at < $2)           AS governed_pre_boundary_all_time,
         COUNT(*) FILTER (WHERE al.created_at >= $1 AND al.action LIKE 'action:%')           AS governed_in_window,
         COUNT(*) FILTER (WHERE al.created_at >= $1 AND al.action LIKE 'action:%'
                            AND al.created_at < $2)                                          AS governed_in_window_pre_boundary,
         COUNT(*) FILTER (WHERE al.created_at >= $1
                            AND (${forAlias(TRUTHY_MARKER_PREDICATE)}))                       AS marked_in_window,
         COUNT(*) FILTER (WHERE al.created_at >= $1 AND al.created_at < $2
                            AND (${forAlias(TRUTHY_MARKER_PREDICATE)}))                       AS marked_in_window_pre_boundary,
         COUNT(*) FILTER (WHERE al.created_at < $2
                            AND (${forAlias(TRUTHY_MARKER_PREDICATE)}))                       AS marked_pre_boundary_all_time
       FROM audit_log al`,
      [from, MARKER_BOUNDARY],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return null;
  }
}

/**
 * WAS THE MISSING REVIEW EVER FILED? Keyed on the polymorphic subject
 * `(subject_type, subject_id)` with `status = 'active'` — the same shape
 * `actions/registry.ts` already runs in production for the launch gate. Copied
 * rather than invented so the register and the gate cannot come to disagree about
 * what "a review on file" means.
 *
 * A SEPARATE QUERY, not a subselect on the marker scan, and that is the whole
 * point: `analytic_reviews` can be absent (42P01) on an environment where
 * `audit_log` is present, and a joined query would then lose the marker rows too.
 * Returning `null` for "not read" is what keeps `unknown` from collapsing into
 * `not_filed`.
 *
 * Returns `null` only when the table does not exist. Any other error propagates.
 */
async function readReviewsAfter(
  pool: pg.Pool,
  subjects: ReadonlyArray<readonly [string | null, string | null]>,
): Promise<Map<string, Array<{ kind: string; createdAt: string }>> | null> {
  const types = subjects.map(([t]) => t ?? '');
  const ids = subjects.map(([, i]) => i ?? '');
  try {
    const { rows } = await pool.query<{ subject_type: string; subject_id: string; kind: string; created_at: unknown }>(
      `SELECT ar.subject_type, ar.subject_id, ar.kind, ar.created_at
         FROM analytic_reviews ar
         JOIN unnest($1::text[], $2::text[]) AS s(subject_type, subject_id)
           ON ar.subject_type = s.subject_type AND ar.subject_id = s.subject_id
        WHERE ar.status = 'active'`,
      [types, ids],
    );
    const out = new Map<string, Array<{ kind: string; createdAt: string }>>();
    for (const r of rows) {
      const k = `${r.subject_type} ${r.subject_id}`;
      const at = iso(r.created_at);
      if (!at) continue;
      const list = out.get(k) ?? [];
      list.push({ kind: r.kind, createdAt: at });
      out.set(k, list);
    }
    return out;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return null;
  }
}

/**
 * THE FOURTH VOCABULARY'S FIRST READER — an AGGREGATE AND NOTHING ELSE.
 *
 * `marketing_outbound_gate_decision.gate_error` is set when a gate THREW, and its
 * column comment says why that is a different fact from a refusal on the merits:
 * "the check failed" and "the text failed" must not be read as each other. Nothing
 * has ever read it.
 *
 * WHY ONLY A COUNT. This module is read through the governance compartment, and
 * `routes/audit.ts` records at length what happens when governance republishes
 * another compartment's rows: a reply id identifies a marketing subject, the error
 * string is an exception message over gated text, and on that desk the subject alone
 * can be inside information (MiCA Art 90(1)) or a colleague's financial position
 * (Art 91(3)(c)). So the register reports THAT the material exists and how much —
 * which is the governance fact — and names the compartment needed to see it. That is
 * present-but-withheld, and it is not the same as empty.
 */
async function readGateErrors(
  pool: pg.Pool,
  from: string,
): Promise<{ count: number | null; earliest: string | null; latest: string | null } | null> {
  try {
    const { rows } = await pool.query<{ n: unknown; earliest: unknown; latest: unknown }>(
      `SELECT COUNT(*) AS n, MIN(created_at) AS earliest, MAX(created_at) AS latest
         FROM marketing_outbound_gate_decision
        WHERE gate_error IS NOT NULL AND created_at >= $1`,
      [from],
    );
    const r = rows[0];
    if (!r) return null;
    return { count: int(r.n), earliest: iso(r.earliest), latest: iso(r.latest) };
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return null;
  }
}
