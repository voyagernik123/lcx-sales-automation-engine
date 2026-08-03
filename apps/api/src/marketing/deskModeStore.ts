/**
 * THE DESK MODE STORE — the one place desk mode is read and written.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Two routers now need the mode, and for opposite reasons. `routes/marketingDesk.ts`
 * SETS it (`POST /desk-mode`) and reports it (`GET /desk`, `POST /adoption`).
 * `routes/marketingMemory.ts` must READ it, because `crisisCapabilities` and
 * `activateCrisisStatement` take a `DeskMode` and their whole subject is the state
 * nobody designs for: an authority has suspended LCX's marketing communications and an
 * incident starts anyway.
 *
 * Before this file, the mode lived in `marketingDesk.ts` as private functions, and the
 * crisis room's file header said so in as many words — "It also does NOT read desk mode…
 * so capabilities are absent rather than invented". The two ways out of that were a
 * second reader in the crisis file, or this. A second reader is the defect
 * `marketing/index.ts` records fourteen instances of: two implementations of one rule is
 * how two surfaces come to disagree about whether the desk is shut, and of all the facts
 * in this compartment that is the worst one to hold two opinions about.
 *
 * ── WHERE THE MODE IS STORED, AND WHY IT IS NOT A NEW TABLE ──────────────────
 * `object_actions` (migration 0029, applied everywhere) is an append-only ledger of
 * `{subject_type, subject_id, action, params, result, actor, created_at}`. The desk mode
 * is a SEQUENCE OF TRANSITIONS there and the current mode is the newest row — which is
 * what `deskMode.ts:671` already says the record IS: "The record of a mode change. This,
 * and not the mode column, is the evidence." The append-only shape is strictly better
 * than a mutable column: a mode that was lifted and re-imposed keeps both facts.
 *
 * It also means the mode is READABLE WHEN THE COMPARTMENT'S OWN MIGRATIONS ARE NOT.
 * 0046 (the reply queue) and 0063 (the crisis room) are applied by hand; a regulator's
 * suspension recorded during either window must still shut the desk and still render its
 * sentence, and it does, because nothing here depends on those tables.
 *
 * ── FAILING CLOSED IS THE WHOLE POINT ────────────────────────────────────────
 * A newest row this code cannot parse throws `LedgerUnreadable` rather than falling back
 * to the row below it or to `normal`. Reporting a closed desk as open is the one wrong
 * answer, so every caller either surfaces the error or reports the mode as UNREADABLE and
 * offers no permission — never a mode it could not verify.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ───────────────────────────────────────────
 * No rule, threshold or date arithmetic. `deskStanding`, `standingFromOrder`,
 * `requestModeChange`, `assessAuthorityOrder` and `gateDeskAct` own all of it in
 * `@lcx/shared`. This file reads rows, hands them to those functions, and appends what
 * they produced.
 */
import type {
  ActorId,
  ClearanceRole,
  DeskMode,
  DeskStanding,
  Instant,
  ModeTransition,
  OrderAssessment,
  OrderScope,
  WorkingDayCalendar,
} from '@lcx/shared';
import { deskStanding, standingFromOrder } from '@lcx/shared';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE LEDGER'S IDENTITY, AND THE ONE LOCK                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export const MODE_SUBJECT_TYPE = 'marketing_desk';
export const MODE_SUBJECT_ID = 'mode';
export const MODE_ACTION = 'marketing_desk_mode_change';

/** One lock for the whole desk mode. `hashtext` of this string, as `withJobRun` does. */
export const MODE_LOCK_KEY = 'marketing:desk_mode';

/**
 * The narrowest thing this file can run on: a pool OR a checked-out client, because the
 * write path must read the `from` mode INSIDE its own transaction, under the lock.
 */
export interface Queryable {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * A ledger row this code cannot read as a mode.
 *
 * IT IS AN ERROR AND NOT A FALLBACK, and that is the single most important decision here.
 * The alternative — skip the unreadable row and read the one below it — would answer "the
 * desk is normal" when the newest record might be a regulator's prohibition that a bad
 * deploy or a hand-edited JSONB left unparseable.
 */
export class LedgerUnreadable extends Error {
  constructor(readonly ledgerRef: string, readonly why: string) {
    super(`desk mode ledger row ${ledgerRef} is unreadable: ${why}`);
    this.name = 'LedgerUnreadable';
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 READING A STORED MODE                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

const MODE_KINDS: readonly DeskMode['kind'][] = ['normal', 'heightened', 'suspended_by_authority'];

/**
 * The two limbs a MODE can rest on, which are NOT `SuspensionPower` — that is the ORDER's
 * three-way vocabulary (`art_94_1_q`, `art_94_1_p_suspend`, `art_94_1_p_prohibit`). Only
 * `cease_or_suspend_30_days` carries the Art 94(1)(q) ceiling; `deskMode.ts:1903` records
 * that applying it to a (p) prohibition would silently expire a live one.
 */
const MODE_POWERS: readonly SuspendedMode['suspensionPower'][] = ['cease_or_suspend_30_days', 'prohibit_or_suspend'];

type SuspendedMode = Extract<DeskMode, { kind: 'suspended_by_authority' }>;

/** A stored field that must be a non-empty string. */
const text = (field: string, raw: unknown): string => {
  if (typeof raw !== 'string' || raw.trim() === '') throw new Error(`${field} is not a stored string`);
  return raw;
};

/** A stored instant a clock can actually read. */
const when = (field: string, raw: unknown): Instant => {
  const s = text(field, raw);
  if (!Number.isFinite(Date.parse(s))) throw new Error(`${field} is not an instant a clock can read`);
  return s;
};

const whenOrNull = (field: string, raw: unknown): Instant | null =>
  raw === null || raw === undefined ? null : when(field, raw);

/**
 * Parse the `DeskMode` out of a stored transition.
 *
 * THIS IS THE LEDGER PATH AND IT IS NOT THE REQUEST PATH.
 * `routes/marketingDesk.ts:parseDeskMode` validates a CLIENT body: it substitutes the
 * session actor for `imposedBy`/`recordedBy` (a client-named imposer would make the
 * governance record a suggestion), defaults `effectiveFrom` to now, and answers 400 with
 * the field name and its valid values. None of that is right for a row this system wrote
 * minutes or months ago, where every field must already be present and a missing one is a
 * corrupt record rather than a caller's mistake.
 *
 * So there are two readers on purpose, and the drift between them is held shut by a test
 * rather than by hope: `__tests__/marketingCrisisCapsStore.test.ts` round-trips every mode
 * kind through `POST /desk-mode` and back out of this parser and compares field for field,
 * so a mode that gains a field the request path sets and this one drops turns red.
 */
export function parseStoredDeskMode(raw: unknown): DeskMode {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('the stored mode is not an object');
  }
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== 'string' || !(MODE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`the stored mode kind ${JSON.stringify(kind)} is not one of: ${MODE_KINDS.join(', ')}`);
  }
  if (kind === 'normal') return { kind: 'normal' };
  if (kind === 'heightened') {
    return {
      kind: 'heightened',
      reason: text('mode.reason', o.reason),
      imposedBy: text('mode.imposedBy', o.imposedBy),
      effectiveFrom: when('mode.effectiveFrom', o.effectiveFrom),
      expiresAt: whenOrNull('mode.expiresAt', o.expiresAt),
    };
  }
  const power = o.suspensionPower;
  if (typeof power !== 'string' || !(MODE_POWERS as readonly string[]).includes(power)) {
    throw new Error(`the stored suspension power ${JSON.stringify(power)} is not one of: ${MODE_POWERS.join(', ')}`);
  }
  return {
    kind: 'suspended_by_authority',
    authority: text('mode.authority', o.authority),
    orderRef: text('mode.orderRef', o.orderRef),
    effectiveFrom: when('mode.effectiveFrom', o.effectiveFrom),
    expiresAt: whenOrNull('mode.expiresAt', o.expiresAt),
    suspensionPower: power as SuspendedMode['suspensionPower'],
    recordedBy: text('mode.recordedBy', o.recordedBy),
  };
}

/** One row of the ledger, already validated. */
export interface ModeLedgerRow {
  readonly ledgerRef: string;
  readonly recordedAt: Instant;
  readonly recordedBy: ActorId;
  readonly reason: string;
  readonly mode: DeskMode | null;
  readonly transitionRaw: unknown;
  readonly order: OrderAssessment | null;
  readonly calendar: WorkingDayCalendar | null;
}

/**
 * Read the newest rows of the mode ledger, newest first.
 *
 * `created_at DESC, id DESC` — the tiebreak matters because `object_actions` has no
 * unique constraint tying a row to the desk and `NOW()` is the transaction's start
 * instant, so two appends in the same microsecond would otherwise order arbitrarily.
 * Under the advisory lock they cannot be concurrent, and the tiebreak makes the read
 * deterministic anyway.
 */
export async function readModeLedger(q: Queryable, limit: number): Promise<readonly ModeLedgerRow[]> {
  const res = await q.query(
    `SELECT id, result, actor, created_at FROM object_actions
      WHERE subject_type = $1 AND subject_id = $2 AND action = $3
      ORDER BY created_at DESC, id DESC LIMIT $4`,
    [MODE_SUBJECT_TYPE, MODE_SUBJECT_ID, MODE_ACTION, limit],
  );
  return res.rows.map((row) => {
    const ledgerRef = String(row.id);
    const result = row.result;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      throw new LedgerUnreadable(ledgerRef, 'the stored result is not an object');
    }
    const r = result as Record<string, unknown>;
    const transitionRaw = r.transition ?? null;
    let mode: DeskMode | null = null;
    if (transitionRaw !== null) {
      if (typeof transitionRaw !== 'object' || Array.isArray(transitionRaw)) {
        throw new LedgerUnreadable(ledgerRef, 'the stored transition is not an object');
      }
      try {
        mode = parseStoredDeskMode((transitionRaw as Record<string, unknown>).to);
      } catch (err) {
        throw new LedgerUnreadable(ledgerRef, err instanceof Error ? err.message : 'the stored mode did not validate');
      }
    }
    const order = (r.order ?? null) as OrderAssessment | null;
    if (mode === null && order === null) {
      throw new LedgerUnreadable(ledgerRef, 'the row carries neither a transition nor an order');
    }
    return {
      ledgerRef,
      recordedAt: new Date(String(row.created_at)).toISOString(),
      recordedBy: String(row.actor ?? 'unknown'),
      reason: typeof r.reason === 'string' ? r.reason : '',
      mode,
      transitionRaw,
      order,
      calendar: (r.calendar ?? null) as WorkingDayCalendar | null,
    };
  });
}

/** Where the reported mode came from. `default_normal` is not the same fact as `ledger`. */
export type ModeSource = 'ledger' | 'default_normal';

export interface DeskReading {
  readonly standing: DeskStanding;
  readonly order: OrderAssessment | null;
  readonly calendar: WorkingDayCalendar | null;
  readonly source: ModeSource;
}

/**
 * The standing the newest row implies. `undefined` means nothing was ever recorded, which
 * is `default_normal` — the desk is open because nobody has said otherwise, and a caller
 * can say which of those two it is rather than presenting them as one.
 */
export function standingFrom(newest: ModeLedgerRow | undefined, now: Instant): DeskReading {
  if (newest === undefined) {
    return { standing: deskStanding({ kind: 'normal' }, now), order: null, calendar: null, source: 'default_normal' };
  }
  if (newest.mode === null && newest.order !== null) {
    return {
      standing: standingFromOrder(newest.order, now, newest.calendar),
      order: newest.order,
      calendar: newest.calendar,
      source: 'ledger',
    };
  }
  const scope: OrderScope | undefined = newest.order?.order.scope;
  return {
    standing: deskStanding(newest.mode as DeskMode, now, newest.calendar, scope),
    order: newest.order,
    calendar: newest.calendar,
    source: 'ledger',
  };
}

/** The one-call read: what is the desk's standing right now. */
export async function readDeskStanding(q: Queryable, now: Instant): Promise<DeskReading> {
  const rows = await readModeLedger(q, 1);
  return standingFrom(rows[0], now);
}

/**
 * THE MODE A PERMISSION QUESTION IS ANSWERED AGAINST — which is not always the mode on
 * the record, and the difference is a compliance problem in both directions.
 *
 * `deskStanding` decides whether a recorded mode is actually biting at this instant and
 * publishes the answer as `outboundPermitted`, documented in `deskMode.ts` as "False for a
 * live suspension or an unbounded prohibition. Nothing else clears it." A suspension that
 * has LAPSED (its recorded end has passed, nobody filed the lift) leaves that flag TRUE,
 * and the engine says why in as many words: "refusing longer than the authority ordered is
 * its own compliance problem". A suspension recorded as effective TOMORROW likewise is not
 * in force today, and a desk that stops work early has been shut by a clerical act.
 *
 * `crisisCapabilities` takes a bare `DeskMode` with no `asOf`, so handing it the recorded
 * suspension in either of those states would refuse a handoff the desk is entitled to
 * make, and the crisis room and the desk board would print opposite sentences about the
 * same instant. So the suspension is passed through only while the engine says it bites.
 *
 * NO DATE ARITHMETIC HAPPENS HERE. This reads one boolean the engine computed; it does not
 * compare `expiresAt` to anything, which is the whole reason the phase logic lives in one
 * place. `heightened` and `normal` pass through untouched — `crisisCapabilities` treats
 * heightened as changing nothing in the crisis room and records it, which is correct: the
 * three blocking clears already apply.
 */
export function modeInForce(standing: DeskStanding): DeskMode {
  if (standing.mode.kind !== 'suspended_by_authority') return standing.mode;
  return standing.outboundPermitted ? { kind: 'normal' } : standing.mode;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 WRITING — ONE WRITER AT A TIME                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Take the mode lock for the rest of the caller's transaction.
 *
 * `pg_advisory_xact_lock` BLOCKS rather than returning false: two operators changing the
 * mode in the same second must both be recorded against the state they actually followed,
 * and dropping one governance act because a lock was busy is worse than a caller waiting.
 * The lock is released by COMMIT or ROLLBACK, so no path leaks it — which also means this
 * MUST be called on a client inside a transaction, never on the pool.
 */
export async function lockModeLedger(q: Queryable): Promise<void> {
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MODE_LOCK_KEY]);
}

export interface ModeRecordToAppend {
  /** The kind the caller ASKED for, kept beside what was recorded. */
  readonly requestedKind: DeskMode['kind'];
  /** The CERC lanes the signed-in human claimed. A validated claim, not an identity. */
  readonly byRoles: readonly ClearanceRole[];
  /** `null` on the order-only path, where no `DeskMode` was expressible. */
  readonly transition: ModeTransition | null;
  /** `null` where the change was not an authority order. */
  readonly order: OrderAssessment | null;
  readonly calendar: WorkingDayCalendar | null;
  readonly reason: string;
  readonly actor: ActorId;
}

/**
 * Append one mode record. The `result` column IS the evidence, so it carries the
 * transition, the order assessment, the calendar the arithmetic was done against and the
 * reason — everything needed to reproduce the decision, in the row that made it.
 */
export async function appendModeRecord(
  q: Queryable,
  entry: ModeRecordToAppend,
): Promise<{ readonly ledgerRef: string; readonly recordedAt: Instant | null }> {
  const res = await q.query(
    `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id, created_at`,
    [
      MODE_SUBJECT_TYPE,
      MODE_SUBJECT_ID,
      MODE_ACTION,
      JSON.stringify({
        requestedKind: entry.requestedKind,
        byRoles: entry.byRoles,
        hasCalendar: entry.calendar !== null,
      }),
      JSON.stringify({
        transition: entry.transition,
        order: entry.order,
        calendar: entry.calendar,
        reason: entry.reason,
      }),
      entry.actor,
    ],
  );
  const row = res.rows[0];
  return {
    ledgerRef: String(row?.id ?? ''),
    recordedAt: row?.created_at === undefined || row.created_at === null
      ? null
      : new Date(String(row.created_at)).toISOString(),
  };
}
