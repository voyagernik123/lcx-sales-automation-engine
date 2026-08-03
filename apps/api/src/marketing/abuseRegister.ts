/**
 * LCX MARKETING — THE MARKET-ABUSE PERIMETER (plan §5, M2). The I/O half.
 *
 * Two registers, and the joins that turn MiCA's two invisible exposures into
 * refusals a human cannot walk past:
 *
 *   marketing_asset_embargo         → is this asset's state public yet?  (Art 90)
 *   marketing_holdings_declaration  → does this author hold it?          (Art 91(3)(c))
 *
 * The schema, and the reasoning for every column and every CHECK, is
 * `../db/migrations/0060_marketing_abuse.sql`. THAT FILE IS APPLIED BY HAND in the
 * Supabase SQL editor and has not been applied anywhere yet, so everything here is
 * written to behave correctly while the tables do not exist.
 *
 * WHAT THIS FILE IS NOT. It holds no policy and decides no legal question. It loads
 * state and it gates writes; the refusals that a draft actually receives are the
 * engine's, built on the vocabulary in `packages/shared/src/marketing/types.ts`.
 * The refusal codes it hands back are the vocabulary's own (see
 * `PerimeterRefusalHint` below) — the codes end up in audit rows and in
 * refusal-frequency counts, so a second parallel set of strings would corrupt the
 * only honest read on whether these gates are load-bearing.
 *
 * ══ ABSENT DATA REFUSES; IT NEVER DEFAULTS. ══
 * The single most important property in the file. `unknown` is not `clear`, an empty
 * register is not "nothing to worry about", and a declaration nobody renewed is not
 * a declaration. Every lookup below fills in EVERY requested key — absence appears
 * as an explicit `'unknown'` / `'register_absent'` value rather than as a missing
 * property that a caller could read as falsy and treat as fine. That is the GPS
 * perimeter pattern: a gate you can walk past is decoration.
 *
 * ══ FAIL CLOSED, DELIBERATELY THE OPPOSITE OF `actions/registry.ts`. ══
 * The gates in registry.ts fail OPEN on `42P01` so that a governance table which has
 * not landed cannot dead-lock the LCX programme (registry.ts:66-87). That reasoning
 * does not transfer here, for the same two reasons GPS gave (`gps/actions.ts:122`):
 * what is gated is a public statement by a regulated exchange about inside
 * information, and the cost of refusing is minutes — apply 0060 and retry. So a
 * perimeter that cannot be evaluated REFUSES, and says which migration is missing.
 *
 * All SQL is parameterised. No identifier or value is ever concatenated.
 */
import { z } from 'zod';
import type pg from 'pg';
import { findMemberById } from '@lcx/shared';
import type {
  ActorId,
  AssetEmbargoState,
  AssetSymbol,
  EmbargoRegister,
  EmbargoRegisterEntry,
  HoldingsDeclarationEntry,
  HoldingsDeclarationState,
  HoldingsRegister,
  // Marketing's refusal-code union. NOT `RefusalCode`, which is GPS's through the same
  // barrel — see the note on `PerimeterRefusalHint` below and the aliasing block in
  // `packages/shared/src/index.ts`.
  MarketingRefusalCode,
} from '@lcx/shared';
import { ActionError, type ActorRole, type RegistryAction } from '../actions/types.js';

/**
 * The three refusal codes this layer can hand the engine — now a CHECKED SUBSET of the
 * marketing vocabulary rather than three quoted strings.
 *
 * It was quoted, under protest, because of a real collision: `gps/partners.ts` also
 * exports a type named `RefusalCode` through the `@lcx/shared` barrel, so
 * `import type { RefusalCode } from '@lcx/shared'` here resolved to GPS's union — which
 * contains none of these strings — and produced an error reading as though the marketing
 * vocabulary were wrong. The integration pass resolved it in
 * `packages/shared/src/index.ts` by explicitly re-exporting GPS's under the unqualified
 * name (it is the incumbent) and marketing's as `MarketingRefusalCode`.
 *
 * The `extends` clause is the whole point: if any of these three ever stops being a
 * marketing refusal code, THIS FILE fails to compile, rather than the engine quietly
 * receiving a string it does not recognise.
 */
type AssertSubset<T extends MarketingRefusalCode> = T;
export type PerimeterRefusalHint = AssertSubset<
  | 'EMBARGO_REGISTER_ABSENT'
  | 'ASSET_STATE_UNKNOWN'
  | 'HOLDINGS_DECLARATION_MISSING'
>;

/** The file a human has to paste into the SQL editor before any of this works. */
export const ABUSE_MIGRATION = '0060_marketing_abuse.sql';

/* ════════════════════════ Shape, before anything else ════════════════════════ */

/**
 * The symbol bound and pattern are the database's, restated in code so a bad symbol
 * is refused before it reaches a CHECK — a 23514 from Postgres tells the operator
 * nothing about which field was wrong.
 */
const SYMBOL_MAX = 20;
const SLUG_MAX = 80;
const SOURCE_REF_MAX = 120;
const EVENT_REF_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const SOURCE_REF_RE = /^[a-z0-9][a-z0-9._:/-]*$/;

/**
 * How many symbols one lookup may ask about.
 *
 * A bound rather than none, because these lookups are driven by asset symbols
 * EXTRACTED FROM A STRANGER'S REPLY (plan §1, defect 1: the ingest is forgeable).
 * A reply listing 4,000 characters of tickers would otherwise become a 4,000-element
 * `= ANY($1)` against a table holding inside information. Refusing is safe: the
 * engine treats a refusal as "cannot clear this draft".
 */
export const LOOKUP_SYMBOL_MAX = 64;

/** Uppercase, trimmed — the normalisation the unique indexes assume. */
export function normaliseSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s.length === 0 || s.length > SYMBOL_MAX) return null;
  // Deliberately narrow: a symbol is letters, digits and the separators real
  // tickers use. Anything else is either an attempt or a parse failure, and both
  // should refuse rather than be normalised into something that looks valid.
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(s)) return null;
  return s;
}

function requireSymbol(raw: unknown, what: string): string {
  const s = normaliseSymbol(raw);
  if (s === null) {
    throw new ActionError(
      'ASSET_SYMBOL_INVALID',
      `${what} is not a usable asset symbol. Expected 1-${SYMBOL_MAX} characters of A-Z, 0-9, '.', '_' or '-' — never a sentence, a name or a URL.`,
      400,
    );
  }
  return s;
}

/**
 * Distinct, normalised, bounded. Order is preserved so output reads predictably.
 *
 * A NON-SYMBOL REFUSES; IT IS NEVER DROPPED. Dropping would mean the engine asked
 * about three things, received two answers, and had no way to tell — the exact shape
 * of silent hole this compartment exists to close. The caller's remedy is to extract
 * symbols properly or to refuse the item.
 */
function normaliseSymbolList(symbols: readonly unknown[]): string[] {
  const out: string[] = [];
  const rejected: string[] = [];
  for (const raw of symbols) {
    const s = normaliseSymbol(raw);
    if (s === null) rejected.push(typeof raw === 'string' ? raw.slice(0, 40) : String(raw));
    else if (!out.includes(s)) out.push(s);
  }
  if (rejected.length > 0) {
    throw new ActionError(
      'ASSET_SYMBOL_INVALID',
      `A perimeter lookup was given ${rejected.length} value(s) that are not asset symbols (first: ${JSON.stringify(rejected[0])}). They are refused rather than dropped — a lookup that silently answers fewer questions than it was asked is the failure this register exists to prevent.`,
      400,
      { rejected: rejected.length },
    );
  }
  if (out.length > LOOKUP_SYMBOL_MAX) {
    throw new ActionError(
      'LOOKUP_TOO_WIDE',
      `A perimeter lookup may name at most ${LOOKUP_SYMBOL_MAX} assets; ${out.length} were given. Split the item, or refuse it — a draft naming that many assets is not a reply.`,
      400,
    );
  }
  return out;
}

/**
 * THE ACTOR MUST BE A NAMED DESK MEMBER, never a machine principal.
 *
 * `marketing` is `machineAccess: true` (packages/shared/src/workspaces.ts:197), so
 * the shared operator key holds the compartment at `operate` and the compartment
 * gate in `invokeAction` lets it through. Without this check a cron credential — or
 * `ai`, or `monitor:<id>` — could author a holdings declaration carrying a named
 * employee's personal liability under Art 91(3)(c), or lift an embargo on inside
 * information. Actors refused here: `'operator'` (the shared lane), `'monitor:*'`,
 * `'ai'`, and any `ext:` second-tier sign-in (not on the roster).
 *
 * A second-tier colleague therefore cannot declare holdings at all, and the
 * consequence is intended: the engine then reports their cell as `register_absent`
 * or `not_declared` and refuses their drafts. Fail-closed, not silently permitted.
 *
 * HONEST LIMIT, unchanged by this check: authentication is a single shared
 * `DESK_PASSCODE`, so "nik" is self-asserted. This makes the record name a human; it
 * does not prove which one.
 */
function assertNamedHuman(actor: string, what: string): ActorId {
  if (!findMemberById(actor)) {
    throw new ActionError(
      'NAMED_HUMAN_REQUIRED',
      `${what} must be recorded against a named desk member, and '${actor}' is not one (the shared machine key, monitors and 'ai' reach here at operate because marketing allows machine access). MiCA Art 91(3)(c) attaches personal liability to this record, so a service account cannot hold it.`,
      403,
      { actor },
    );
  }
  return actor;
}

/* ═══════════════════════════ Has 0060 landed here? ═══════════════════════════ */

/**
 * Cached per process, because the answer changes only when a human runs a
 * migration — which means a manual step, and the API restarts on deploy.
 *
 * ONLY A DEFINITE ANSWER IS CACHED. `marketing/service.ts:52-57` caches `false` in
 * a bare `catch`, so one database blip permanently convinces that process the
 * compartment is un-migrated until it restarts (plan §1, defect 8). Here a probe
 * that could not be answered returns `false` for THIS call — the fail-closed
 * direction — and leaves the cache unset, so the next call re-probes.
 */
let migratedCache: boolean | null = null;

export async function isAbuseRegisterMigrated(pool: pg.Pool): Promise<boolean> {
  if (migratedCache !== null) return migratedCache;
  try {
    // BOTH tables, because a half-applied migration is not applied: the loaders
    // join across them and 0060 creates them in one file. `to_regclass` returns
    // NULL rather than throwing, so the probe itself cannot be the failure.
    const res = await pool.query<{ ok: boolean }>(
      `SELECT to_regclass('public.marketing_asset_embargo') IS NOT NULL
          AND to_regclass('public.marketing_holdings_declaration') IS NOT NULL AS ok`,
    );
    migratedCache = Boolean(res.rows[0]?.ok);
    return migratedCache;
  } catch (err) {
    console.warn(
      '[marketing] abuse-register probe failed; treating the perimeter as unavailable for this request:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Test-only: forget the probe. */
export function _resetAbuseRegisterMigrated(): void {
  migratedCache = null;
}

/** The refusal a write path gets when the tables are not there. Never a 500. */
function perimeterUnavailable(what: string): ActionError {
  return new ActionError(
    'PERIMETER_UNAVAILABLE',
    `${what} cannot be recorded: the market-abuse perimeter tables do not exist on this environment. Apply ${ABUSE_MIGRATION} in the Supabase SQL editor, then retry. This refuses rather than proceeding — an unrecordable embargo or declaration is worse than a delayed one.`,
    503,
    { migration: ABUSE_MIGRATION },
  );
}

/* ═════════════════════════ The embargo register: reads ═════════════════════════ */

/** Why a symbol resolved to `unknown`. Never collapsed into one reason. */
export type EmbargoUnknownCause =
  /** 0060 has not been applied on this environment. */
  | 'register_absent'
  /** The table exists and holds no rows at all — an honest empty register. */
  | 'register_empty'
  /** The register has rows, but none live for this symbol. */
  | 'no_live_record'
  /** A live row whose declared window has ended and which nobody lifted. */
  | 'window_ended'
  /** A live row nobody has re-examined by `review_by`. */
  | 'review_overdue';

/**
 * What an OPERATOR may learn about an asset's state.
 *
 * Need-to-know, and it is enforced by the shape rather than asked for in a comment:
 * `event_ref` and `source_ref` are absent from this type, so a drafting surface
 * physically cannot display which decision put the asset under embargo. What it gets
 * is the state, the dates, and the NAME OF THE HUMAN TO ASK — which is what an
 * operator actually needs in order to do something other than guess.
 */
export interface EmbargoCell {
  readonly assetSymbol: AssetSymbol;
  /** The state the engine must act on. `unknown` unless a live, fresh row says otherwise. */
  readonly state: AssetEmbargoState;
  /** What the row literally records, even when staleness has forced `state` to `unknown`. */
  readonly recordedState: Exclude<AssetEmbargoState, 'unknown'> | null;
  readonly inForce: boolean;
  readonly cause: EmbargoUnknownCause | null;
  readonly embargoedUntil: string | null;
  readonly reviewBy: string | null;
  /** The named approver who entered it — the person to ask. */
  readonly enteredBy: ActorId | null;
}

export interface EmbargoLookup {
  /** Did 0060 land? */
  readonly registerPresent: boolean;
  /** True when the table exists and is empty. Reported, never hidden behind a zero. */
  readonly registerEmpty: boolean;
  /**
   * EVERY requested symbol, always. A missing key would let a caller read `undefined`
   * as falsy and carry on; an explicit `'unknown'` cannot be read as anything else.
   */
  readonly states: Readonly<Record<AssetSymbol, AssetEmbargoState>>;
  readonly cells: readonly EmbargoCell[];
  /**
   * The engine's code for the register-level condition, taken from the shared
   * vocabulary rather than invented here. Non-null means the engine must refuse
   * before it even looks at the words.
   */
  readonly refusalHint: PerimeterRefusalHint | null;
}

interface EmbargoLiveRow {
  asset_symbol: string;
  state: Exclude<AssetEmbargoState, 'unknown'>;
  embargoed_until: Date | string | null;
  review_by: Date | string;
  entered_by: string;
}

const iso = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

const ms = (v: Date | string): number =>
  v instanceof Date ? v.getTime() : new Date(String(v)).getTime();

/**
 * The join the drafting engine makes: for these symbols, what is the asset state?
 *
 * `now` is a parameter, not `new Date()` inside, so staleness is testable and so a
 * caller can ask the question AS AT the moment of approval — which is the only
 * moment that matters evidentially (mkt-r1 §6.2, field 6: "recomputing later shows
 * today's state, which is worthless evidence").
 *
 * Errors other than a missing table PROPAGATE. A perimeter that answers `unknown`
 * because the database timed out is indistinguishable from one that answered
 * honestly, and `registry.ts:66-87` records what that cost the last time it was
 * allowed: a statement timeout silently converted a gated write into an ungated one.
 * Here `unknown` refuses anyway, so propagating costs nothing and keeps the fault
 * visible.
 */
export async function loadEmbargoStates(
  pool: pg.Pool,
  symbols: readonly unknown[],
  now: Date = new Date(),
): Promise<EmbargoLookup> {
  const wanted = normaliseSymbolList(symbols);
  const present = await isAbuseRegisterMigrated(pool);

  if (!present) {
    return absentEmbargoLookup(wanted, {
      registerPresent: false, registerEmpty: false, cause: 'register_absent',
    });
  }

  const anyRows = await pool.query<{ any_rows: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM marketing_asset_embargo) AS any_rows`,
  );
  if (!anyRows.rows[0]?.any_rows) {
    // AN EMPTY REGISTER REFUSES AND SAYS IT IS EMPTY. It is not evidence that
    // nothing is under embargo — nobody has told this table anything yet, and the
    // owner owes it (plan §7). Reported as `EMBARGO_REGISTER_ABSENT` because that is
    // the code the engine's vocabulary gives for "there is no usable register",
    // while `registerEmpty` distinguishes the two for the surface.
    return absentEmbargoLookup(wanted, {
      registerPresent: true, registerEmpty: true, cause: 'register_empty',
    });
  }

  const res = wanted.length === 0
    ? { rows: [] as EmbargoLiveRow[] }
    : await pool.query<EmbargoLiveRow>(
        `SELECT asset_symbol, state, embargoed_until, review_by, entered_by
           FROM marketing_asset_embargo
          WHERE lifted_at IS NULL AND asset_symbol = ANY($1::text[])`,
        [wanted],
      );

  const bySymbol = new Map<string, EmbargoLiveRow>();
  for (const row of res.rows) bySymbol.set(row.asset_symbol, row);

  const t = now.getTime();
  const cells: EmbargoCell[] = wanted.map((assetSymbol) => {
    const row = bySymbol.get(assetSymbol);
    if (!row) {
      return {
        assetSymbol, state: 'unknown', recordedState: null, inForce: false,
        cause: 'no_live_record', embargoedUntil: null, reviewBy: null, enteredBy: null,
      };
    }
    const until = iso(row.embargoed_until);
    const reviewBy = iso(row.review_by);
    // STALENESS DOES NOT CLEAR AN ASSET. A window that ended, or a review nobody
    // did, makes the row stop authorising anything — it does not become good news.
    // Both cases resolve to `unknown`, which refuses, and the cause says which.
    const cause: EmbargoUnknownCause | null =
      row.embargoed_until != null && t > ms(row.embargoed_until) ? 'window_ended'
      : t > ms(row.review_by) ? 'review_overdue'
      : null;
    return {
      assetSymbol,
      state: cause === null ? row.state : 'unknown',
      recordedState: row.state,
      inForce: cause === null,
      cause,
      embargoedUntil: until,
      reviewBy,
      enteredBy: row.entered_by,
    };
  });

  return {
    registerPresent: true,
    registerEmpty: false,
    states: statesOf(cells),
    cells,
    refusalHint: cells.some((c) => c.state === 'unknown') ? 'ASSET_STATE_UNKNOWN' : null,
  };
}

function statesOf(cells: readonly EmbargoCell[]): Record<AssetSymbol, AssetEmbargoState> {
  const out: Record<AssetSymbol, AssetEmbargoState> = {};
  for (const c of cells) out[c.assetSymbol] = c.state;
  return out;
}

/**
 * The lookup for "there is no usable register", in both of its forms.
 *
 * `registerPresent` and `registerEmpty` are passed separately and never derived from
 * each other, because they are different facts a surface must be able to tell apart:
 * "apply the migration" and "somebody has to fill this in" are different jobs for
 * different people. Both produce the SAME refusal code, because the engine's answer
 * to either is identical — it cannot clear anything.
 */
function absentEmbargoLookup(
  wanted: readonly string[],
  opts: { registerPresent: boolean; registerEmpty: boolean; cause: EmbargoUnknownCause },
): EmbargoLookup {
  const cells: EmbargoCell[] = wanted.map((assetSymbol) => ({
    assetSymbol, state: 'unknown', recordedState: null, inForce: false,
    cause: opts.cause, embargoedUntil: null, reviewBy: null, enteredBy: null,
  }));
  return {
    registerPresent: opts.registerPresent,
    registerEmpty: opts.registerEmpty,
    states: statesOf(cells),
    cells,
    refusalHint: 'EMBARGO_REGISTER_ABSENT',
  };
}

/**
 * THE FULL REGISTER, INCLUDING WHAT THE EMBARGO RESTS ON — approver-only.
 *
 * Refused in code and not merely documented for the route, because a comment saying
 * "gate this at approver" is exactly the kind of instruction a future endpoint
 * forgets. The reasoning: `event_ref` and `source_ref` point at the decision that
 * created the inside information, so this read is need-to-know inside the desk. An
 * operator gets `loadEmbargoStates`, which cannot express those fields at all.
 */
export interface EmbargoRegisterRow extends EmbargoCell {
  readonly eventRef: string;
  readonly sourceRef: string;
  readonly enteredAt: string;
  readonly embargoedFrom: string;
  readonly liftedBy: ActorId | null;
  readonly liftedAt: string | null;
}

export async function listEmbargoRegister(
  pool: pg.Pool,
  opts: { role: ActorRole; includeLifted?: boolean; limit?: number },
): Promise<{ registerPresent: boolean; rows: EmbargoRegisterRow[] }> {
  if (opts.role !== 'approver') {
    throw new ActionError(
      'EMBARGO_DETAIL_APPROVER_ONLY',
      'The embargo register itself is inside information (MiCA Art 87): its event and source references point at an unannounced decision, so reading them requires approver authority. Operators see only whether an asset can be named, and who to ask.',
      403,
    );
  }
  if (!(await isAbuseRegisterMigrated(pool))) return { registerPresent: false, rows: [] };
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const res = await pool.query<EmbargoLiveRow & {
    event_ref: string; source_ref: string; entered_at: Date | string;
    embargoed_from: Date | string; lifted_by: string | null; lifted_at: Date | string | null;
  }>(
    `SELECT asset_symbol, event_ref, state, embargoed_from, embargoed_until, review_by,
            source_ref, entered_by, entered_at, lifted_by, lifted_at
       FROM marketing_asset_embargo
      WHERE ($1::boolean OR lifted_at IS NULL)
      ORDER BY entered_at DESC
      LIMIT $2`,
    [opts.includeLifted === true, limit],
  );
  return {
    registerPresent: true,
    rows: res.rows.map((r) => ({
      assetSymbol: r.asset_symbol,
      // No staleness verdict here on purpose: this is the record as recorded. The
      // verdict belongs to `loadEmbargoStates`, evaluated against the instant the
      // question is asked, so the two cannot drift into disagreeing.
      state: r.state,
      recordedState: r.state,
      inForce: r.lifted_at == null,
      cause: null,
      eventRef: r.event_ref,
      sourceRef: r.source_ref,
      embargoedFrom: iso(r.embargoed_from)!,
      embargoedUntil: iso(r.embargoed_until),
      reviewBy: iso(r.review_by),
      enteredBy: r.entered_by,
      enteredAt: iso(r.entered_at)!,
      liftedBy: r.lifted_by,
      liftedAt: iso(r.lifted_at),
    })),
  };
}

/* ═══════════════════════ The holdings declaration: reads ═══════════════════════ */

/** `${memberId}|${assetSymbol}`. Both sides are slug/symbol shaped, so '|' cannot collide. */
export function holdingsKey(memberId: ActorId, assetSymbol: AssetSymbol): string {
  return `${memberId}|${assetSymbol}`;
}

export interface HoldingsCell {
  readonly memberId: ActorId;
  readonly assetSymbol: AssetSymbol;
  readonly state: HoldingsDeclarationState;
  /** `null` whenever the state is not a live declaration — never a defaulted `false`. */
  readonly holds: boolean | null;
  readonly declaredAt: string | null;
  readonly renewBy: string | null;
  /** True when a declaration exists but has passed `renew_by`, hence `not_declared`. */
  readonly stale: boolean;
  /** How many times this cell has been amended. The chain is the evidence. */
  readonly amendments: number;
}

export interface HoldingsLookup {
  readonly registerPresent: boolean;
  readonly registerEmpty: boolean;
  /** Keyed by `holdingsKey`. Every requested (member, asset) pair appears. */
  readonly states: Readonly<Record<string, HoldingsDeclarationState>>;
  readonly cells: readonly HoldingsCell[];
  readonly refusalHint: PerimeterRefusalHint | null;
}

interface HoldingsRow {
  member_id: string;
  asset_symbol: string;
  holds: boolean;
  declared_at: Date | string;
  renew_by: Date | string;
  amendments: string | number;
}

/**
 * The join that answers Art 91(3)(c): does this author hold what this draft names?
 *
 * THE CURRENT DECLARATION IS THE ROW NOTHING SUPERSEDES. There is no `is_current`
 * column to go wrong, and the two partial unique indexes in 0060 make "the row
 * nothing supersedes" single-valued per cell rather than a matter of ordering.
 *
 * FOUR STATES, AND THEY DO NOT COLLAPSE (`HoldingsDeclarationState`):
 *   register_absent   no register at all — the table is missing, or empty
 *   not_declared      this person has not answered for this asset, OR their answer
 *                     has passed `renew_by`. A stale answer is not an answer: a
 *                     position can change overnight, and treating last year's
 *                     declaration as current is the one behaviour that would make
 *                     this table actively misleading rather than merely incomplete.
 *   declared_none     affirmatively declared no position
 *   declared_holding  holds it → the post itself needs the conflict disclosure
 */
export async function loadHoldingsStates(
  pool: pg.Pool,
  input: { memberIds: readonly string[]; symbols: readonly unknown[] },
  now: Date = new Date(),
): Promise<HoldingsLookup> {
  const symbols = normaliseSymbolList(input.symbols);
  const members = [...new Set(input.memberIds.map((m) => String(m).trim()).filter(Boolean))];
  const pairs: Array<[string, string]> = [];
  for (const m of members) for (const s of symbols) pairs.push([m, s]);

  const present = await isAbuseRegisterMigrated(pool);
  if (!present) return absentHoldingsLookup(pairs, { registerPresent: false, registerEmpty: false });

  const anyRows = await pool.query<{ any_rows: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM marketing_holdings_declaration) AS any_rows`,
  );
  if (!anyRows.rows[0]?.any_rows) {
    // The empty register refuses honestly and says it is empty. Plan §7: this one is
    // the owner's and legal's to produce, because it carries personal liability.
    return absentHoldingsLookup(pairs, { registerPresent: true, registerEmpty: true });
  }

  const res = pairs.length === 0
    ? { rows: [] as HoldingsRow[] }
    : await pool.query<HoldingsRow>(
        `SELECT d.member_id, d.asset_symbol, d.holds, d.declared_at, d.renew_by,
                (SELECT count(*) FROM marketing_holdings_declaration a
                  WHERE a.member_id = d.member_id AND a.asset_symbol = d.asset_symbol) - 1
                  AS amendments
           FROM marketing_holdings_declaration d
          WHERE d.member_id = ANY($1::text[])
            AND d.asset_symbol = ANY($2::text[])
            AND NOT EXISTS (
              SELECT 1 FROM marketing_holdings_declaration s WHERE s.supersedes_id = d.id
            )`,
        [members, symbols],
      );

  const byKey = new Map<string, HoldingsRow>();
  for (const r of res.rows) byKey.set(holdingsKey(r.member_id, r.asset_symbol), r);

  const t = now.getTime();
  const cells: HoldingsCell[] = pairs.map(([memberId, assetSymbol]) => {
    const r = byKey.get(holdingsKey(memberId, assetSymbol));
    if (!r) {
      return {
        memberId, assetSymbol, state: 'not_declared', holds: null,
        declaredAt: null, renewBy: null, stale: false, amendments: 0,
      };
    }
    const stale = t > ms(r.renew_by);
    return {
      memberId,
      assetSymbol,
      state: stale ? 'not_declared' : r.holds ? 'declared_holding' : 'declared_none',
      // `holds` is withheld once stale, deliberately. Reporting the stale boolean
      // alongside `not_declared` invites a surface to render "no position (expired)"
      // and an operator to act on it, which is the whole failure this guards.
      holds: stale ? null : r.holds,
      declaredAt: iso(r.declared_at),
      renewBy: iso(r.renew_by),
      stale,
      amendments: Math.max(0, Number(r.amendments ?? 0)),
    };
  });

  const needsDeclaration = cells.some((c) => c.state === 'not_declared');
  return {
    registerPresent: true,
    registerEmpty: false,
    states: Object.fromEntries(cells.map((c) => [holdingsKey(c.memberId, c.assetSymbol), c.state])),
    cells,
    refusalHint: needsDeclaration ? 'HOLDINGS_DECLARATION_MISSING' : null,
  };
}

function absentHoldingsLookup(
  pairs: ReadonlyArray<[string, string]>,
  opts: { registerPresent: boolean; registerEmpty: boolean },
): HoldingsLookup {
  const cells: HoldingsCell[] = pairs.map(([memberId, assetSymbol]) => ({
    memberId, assetSymbol, state: 'register_absent', holds: null,
    declaredAt: null, renewBy: null, stale: false, amendments: 0,
  }));
  return {
    registerPresent: opts.registerPresent,
    registerEmpty: opts.registerEmpty,
    states: Object.fromEntries(cells.map((c) => [holdingsKey(c.memberId, c.assetSymbol), c.state])),
    cells,
    refusalHint: 'HOLDINGS_DECLARATION_MISSING',
  };
}

/**
 * SELF, OR AN APPROVER — enforced here, not left to the route.
 *
 * A member reads their own declarations (that is the self-service half); an approver
 * reads anyone's (that is the supervision half). Anyone else asking about a named
 * colleague's financial positions is refused, because that is employee personal data
 * of a kind that invites exactly the pressure Art 91(3)(c) exists around.
 *
 * The full CHAIN is returned, superseded rows included, because the earlier value is
 * the evidence — that is the entire reason the table is append-only.
 */
export async function listHoldings(
  pool: pg.Pool,
  opts: { viewer: string; role: ActorRole; memberId?: string; assetSymbol?: unknown; limit?: number },
): Promise<{ registerPresent: boolean; rows: Array<HoldingsRow & { id: string; supersedes_id: string | null; amendment_reason: string | null }> }> {
  const subject = (opts.memberId ?? opts.viewer).trim();
  if (subject !== opts.viewer && opts.role !== 'approver') {
    throw new ActionError(
      'HOLDINGS_SELF_OR_APPROVER',
      `A holdings declaration is a named person's financial position under MiCA Art 91(3)(c). You may read your own; reading '${subject}' requires approver authority.`,
      403,
      { subject },
    );
  }
  if (!(await isAbuseRegisterMigrated(pool))) return { registerPresent: false, rows: [] };
  const symbol = opts.assetSymbol === undefined ? null : requireSymbol(opts.assetSymbol, 'assetSymbol');
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const res = await pool.query(
    `SELECT id, member_id, asset_symbol, holds, declared_at, renew_by,
            supersedes_id, amendment_reason, 0 AS amendments
       FROM marketing_holdings_declaration
      WHERE member_id = $1 AND ($2::text IS NULL OR asset_symbol = $2)
      ORDER BY declared_at DESC
      LIMIT $3`,
    [subject, symbol, limit],
  );
  return { registerPresent: true, rows: res.rows };
}

/* ═════════════ Feeding the engine: the register shapes it consumes ═════════════ */

/**
 * THE ENGINE DECIDES STALENESS, NOT THIS FILE — and that is why these builders exist
 * alongside the lookups above rather than instead of them.
 *
 * `packages/shared/src/marketing/abuse.ts` takes `EmbargoRegister` /
 * `HoldingsRegister` and applies its own rules, one of which this layer must not
 * pre-empt: a `mnpi_pending` row BLOCKS whether or not it is stale ("ageing out of an
 * embargo would be the single worst bug this file could contain", abuse.ts:183-185).
 * `loadEmbargoStates` deliberately downgrades a stale row to `unknown` for SURFACES,
 * which refuses — but handing that downgraded verdict to the engine would convert a
 * hard `ART_90_ASSET_UNDER_EMBARGO` block into a softer `ASSET_STATE_UNKNOWN`. So the
 * builders pass the RECORDED state and the review date, unmodified, and the engine
 * applies the rule.
 *
 * COMPLETENESS IS ALWAYS `not_attested`, and there is deliberately no way to say
 * otherwise. `RegisterCompleteness` (abuse.ts:165) records a named human asserting the
 * register ENUMERATES ITS SUBJECT MATTER — i.e. "there is nothing under embargo that
 * is not in here". Nothing in these two tables is that assertion, and an attested
 * embargo register lets absence resolve to `clear` (abuse.ts:246), so synthesising an
 * attestation from a row count would be the single most dangerous line in the phase.
 * When the desk eventually attests, it needs its own record with its own name and
 * expiry — a further migration, not a boolean invented here.
 */
export async function loadEmbargoRegister(
  pool: pg.Pool,
  symbols?: readonly unknown[],
): Promise<EmbargoRegister> {
  const wanted = symbols === undefined ? null : normaliseSymbolList(symbols);
  if (!(await isAbuseRegisterMigrated(pool))) return { entries: [], completeness: { kind: 'not_attested' } };
  if (wanted !== null && wanted.length === 0) return { entries: [], completeness: { kind: 'not_attested' } };

  /*
   * DOES THE REGISTER HOLD ANYTHING AT ALL? Asked separately from the scoped SELECT
   * below, because those are two different facts and the engine reports a different
   * missing fact for each: "the desk holds no register" sends the drafter to the owner
   * for the list, "this symbol is not in it and nobody has attested completeness" sends
   * them to the listings desk. Conflating them told a desk with 500 rows on file to
   * supply a register. One extra existence probe per gated draft is the price.
   */
  const anyRows = wanted === null
    ? null
    // BYTE-IDENTICAL to the probe `loadEmbargoStates` issues at :350. One concept, one
    // spelling: two statements meaning "does the register hold anything" would be two
    // things to keep in step, and the answer they give decides which refusal a desk reads.
    : await pool.query<{ any_rows: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM marketing_asset_embargo) AS any_rows`,
    );

  const res = await pool.query<{
    asset_symbol: string; state: EmbargoState; embargoed_from: Date | string;
    review_by: Date | string; entered_by: string; entered_at: Date | string;
  }>(
    `SELECT asset_symbol, state, embargoed_from, review_by, entered_by, entered_at
       FROM marketing_asset_embargo
      WHERE lifted_at IS NULL
        AND ($1::text[] IS NULL OR asset_symbol = ANY($1::text[]))`,
    [wanted],
  );

  const entries: EmbargoRegisterEntry[] = res.rows.map((r) => ({
    asset: r.asset_symbol,
    state: r.state,
    // `basis` is rendered INSIDE A REFUSAL the drafter reads, so it must not carry
    // `source_ref` — that reference points at the minuted decision and is
    // approver-only (see the file header of 0060). What it gives the drafter is the
    // one actionable fact: who to ask.
    basis: `Recorded in the LCX embargo register by ${r.entered_by}. The event and source references are approver-only — ask ${r.entered_by}.`,
    recordedBy: r.entered_by,
    recordedAt: iso(r.entered_at)!,
    reviewBy: iso(r.review_by),
    // Mapped from `embargoed_from`, and named honestly: it is the instant from which
    // the desk asserts this state holds, i.e. when the announcement was RECORDED
    // here. It is not evidence of when the issuer published, and nothing in this
    // compartment observes that.
    announcedAt: r.state === 'announced' ? iso(r.embargoed_from) : null,
  }));

  return {
    entries,
    completeness: { kind: 'not_attested' },
    scopedToSymbols: wanted !== null,
    anyRowsInRegister: anyRows === null ? undefined : Boolean(anyRows.rows[0]?.any_rows),
  };
}

/**
 * WHICH OF THESE CANDIDATE TOKENS HAS THE DESK ACTUALLY RECORDED AS AN ASSET?
 *
 * The safety net under `outboundGate.ts:NOT_TICKERS`. That list is a PRESUMPTION about
 * which uppercase words are English rather than tickers, and a presumption held five real
 * tokens — `LCX` (the house token), `GMT`, `ATH`, `NOW`, `CAN` — each of which made the
 * Art 90 and Art 91(3)(c) limbs skip silently for any text naming it without the `$` sigil.
 * The entries are gone; this function is what stops the next wrong entry being a hole
 * rather than a delay.
 *
 * ── WHAT IT IS AND IS NOT ─────────────────────────────────────────────────────
 * It answers PRESENCE only: is there a live embargo row or any holdings row naming this
 * symbol? It returns no state, no basis, no `event_ref` and no member — the promoted symbol
 * goes back through `loadEmbargoRegister` / `loadHoldingsRegister` like any other, so the
 * staleness and completeness rules are applied in exactly one place and this cannot become a
 * second, softer opinion about the perimeter.
 *
 * PRESENCE IS THE RIGHT TEST HERE AND WOULD BE THE WRONG TEST ANYWHERE ELSE. Absence from
 * an unattested register means "not known", not "clear" (`abuse.ts:476`), and nothing here
 * treats it as clearance: a candidate with no row is left exactly where the presumption put
 * it — outside the lookup — and `EXTRACTION_IS_LEXICAL` says so on every surface that shows
 * a verdict. What this closes is the strictly worse case, where the desk HAD recorded the
 * asset and a word list stopped anyone asking.
 *
 * ── FAILURE ──────────────────────────────────────────────────────────────────
 * Un-migrated returns `[]`, which leaves the presumption in force — and on that environment
 * `loadEmbargoRegister` already returns an empty, not-attested register, so every symbol
 * the text does name refuses anyway. A THROWN query is not caught here: it propagates to
 * `gateOutboundText`, whose catch turns it into `gateFailure` and refuses the text. An
 * unavailable check is not a passed check.
 *
 * The `LOOKUP_SYMBOL_MAX` cap in `normaliseSymbolList` applies, so a 20 000-character body
 * cannot turn this into a wide read.
 */
export async function recordedSymbolsAmong(
  pool: pg.Pool,
  candidates: readonly unknown[],
): Promise<readonly string[]> {
  if (candidates.length === 0) return [];
  const wanted = normaliseSymbolList(candidates);
  if (wanted.length === 0) return [];
  if (!(await isAbuseRegisterMigrated(pool))) return [];

  const res = await pool.query<{ asset_symbol: string }>(
    `SELECT DISTINCT asset_symbol
       FROM marketing_asset_embargo
      WHERE lifted_at IS NULL AND asset_symbol = ANY($1::text[])
      UNION
     SELECT DISTINCT asset_symbol
       FROM marketing_holdings_declaration
      WHERE asset_symbol = ANY($1::text[])`,
    [wanted],
  );
  return res.rows.map((r) => r.asset_symbol);
}

/**
 * The holdings register the engine consumes.
 *
 * `HoldingsDeclarationEntry.declared` carries only the two states a human can ASSERT
 * (abuse.ts:218-221), so a stale row is still passed as what it says and the engine
 * applies `reviewBy` — the same division of labour as above. `note` is always null:
 * these tables hold no free text and no position size, and Art 91(3)(c) turns on
 * whether a position exists rather than on how large it is.
 */
export async function loadHoldingsRegister(
  pool: pg.Pool,
  scope: { memberIds?: readonly string[]; symbols?: readonly unknown[] } = {},
): Promise<HoldingsRegister> {
  const symbols = scope.symbols === undefined ? null : normaliseSymbolList(scope.symbols);
  const members = scope.memberIds === undefined
    ? null
    : [...new Set(scope.memberIds.map((m) => String(m).trim()).filter(Boolean))];
  if (!(await isAbuseRegisterMigrated(pool))) return { entries: [], completeness: { kind: 'not_attested' } };
  if ((symbols !== null && symbols.length === 0) || (members !== null && members.length === 0)) {
    return { entries: [], completeness: { kind: 'not_attested' } };
  }

  const res = await pool.query<{
    member_id: string; asset_symbol: string; holds: boolean;
    declared_at: Date | string; renew_by: Date | string;
  }>(
    `SELECT d.member_id, d.asset_symbol, d.holds, d.declared_at, d.renew_by
       FROM marketing_holdings_declaration d
      WHERE ($1::text[] IS NULL OR d.member_id = ANY($1::text[]))
        AND ($2::text[] IS NULL OR d.asset_symbol = ANY($2::text[]))
        AND NOT EXISTS (
          SELECT 1 FROM marketing_holdings_declaration s WHERE s.supersedes_id = d.id
        )`,
    [members, symbols],
  );

  const entries: HoldingsDeclarationEntry[] = res.rows.map((r) => ({
    actor: r.member_id,
    asset: r.asset_symbol,
    declared: r.holds ? 'declared_holding' : 'declared_none',
    declaredAt: iso(r.declared_at)!,
    reviewBy: iso(r.renew_by)!,
    note: null,
  }));

  return { entries, completeness: { kind: 'not_attested' } };
}

/* ══════════════════════════════ Writes ══════════════════════════════ */

/** Postgres integrity codes, named so the mapping below reads as intent. */
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

function pgCode(err: unknown): { code?: string; constraint?: string } {
  return typeof err === 'object' && err !== null ? (err as { code?: string; constraint?: string }) : {};
}

export type EmbargoState = Exclude<AssetEmbargoState, 'unknown'>;
export const EMBARGO_STATES: readonly EmbargoState[] = [
  'mnpi_pending', 'announced', 'clear', 'exempt_offer',
] as const;

/**
 * Enter a state for an asset. APPROVER-ONLY at the action; a named human always.
 *
 * NO `ON CONFLICT DO NOTHING` ANYWHERE IN THIS FILE. `service.ts:130` uses it for
 * reply ingest and plan §1 defect 7 records what that cost: a pre-claimed id
 * silently destroyed a real reply, and the count called it a "duplicate". A collision
 * here means the desk believes two different things about inside information, so it
 * RAISES, names which constraint refused, and says what to do instead.
 */
export async function enterEmbargo(
  pool: pg.Pool,
  input: {
    assetSymbol: unknown;
    eventRef: string;
    state: EmbargoState;
    sourceRef: string;
    reviewInDays: number;
    embargoUntilDays?: number | null;
    enteredBy: string;
  },
): Promise<{ id: string; assetSymbol: string; state: EmbargoState; reviewBy: string | null }> {
  const symbol = requireSymbol(input.assetSymbol, 'assetSymbol');
  if (!(await isAbuseRegisterMigrated(pool))) throw perimeterUnavailable('An embargo entry');
  try {
    const res = await pool.query<{ id: string; review_by: Date | string }>(
      `INSERT INTO marketing_asset_embargo
         (asset_symbol, event_ref, state, source_ref, entered_by, review_by, embargoed_until)
       VALUES ($1, $2, $3, $4, $5,
               now() + make_interval(days => $6::int),
               CASE WHEN $7::int IS NULL THEN NULL ELSE now() + make_interval(days => $7::int) END)
       RETURNING id, review_by`,
      [symbol, input.eventRef, input.state, input.sourceRef, input.enteredBy,
        input.reviewInDays, input.embargoUntilDays ?? null],
    );
    const row = res.rows[0];
    if (!row) {
      // Cannot happen with a plain INSERT ... RETURNING, and is refused rather than
      // reported as success anyway: the caller is about to tell an approver their
      // embargo is in force.
      throw new ActionError('EMBARGO_WRITE_UNCONFIRMED', 'The embargo entry was not confirmed by the database. Nothing may be treated as embargoed on the strength of this call — re-read the register.', 500);
    }
    return { id: row.id, assetSymbol: symbol, state: input.state, reviewBy: iso(row.review_by) };
  } catch (err) {
    const { code, constraint } = pgCode(err);
    if (code === UNIQUE_VIOLATION && constraint?.includes('live')) {
      throw new ActionError(
        'EMBARGO_ALREADY_LIVE',
        `${symbol} already has a live entry in the register. A state change is a NEW row: lift the live one first (marketing_embargo_lift), then enter this. Editing in place would rewrite what the desk knew when earlier drafts were judged.`,
        409,
        { assetSymbol: symbol },
      );
    }
    if (code === UNIQUE_VIOLATION) {
      throw new ActionError(
        'EMBARGO_EVENT_ALREADY_RECORDED',
        `${symbol} already has an entry for eventRef '${input.eventRef}'. This is the idempotency key, so a retry lands here rather than forging a second history — read the register before entering a different event.`,
        409,
        { assetSymbol: symbol, eventRef: input.eventRef },
      );
    }
    if (code === CHECK_VIOLATION) {
      throw new ActionError(
        'EMBARGO_ENTRY_REJECTED',
        `The database refused this entry (${constraint ?? 'check constraint'}). eventRef and sourceRef are SLUGS — lowercase, no spaces — because this register must not be able to hold the inside information it points at. See ${ABUSE_MIGRATION}.`,
        400,
        { constraint: constraint ?? null },
      );
    }
    throw err;
  }
}

/**
 * Lift a live entry. The ONE update the table's trigger permits, and it is one-way.
 *
 * A lift does not assert the asset is now clear — it records that this entry stopped
 * being in force, and names who said so. The next state is a new row. Until one
 * exists, `loadEmbargoStates` reports the asset as `unknown`, which refuses; a lift
 * therefore cannot be used as a shortcut to make an asset draftable.
 */
export async function liftEmbargo(
  pool: pg.Pool,
  input: { assetSymbol: unknown; eventRef: string; liftedBy: string },
): Promise<{ id: string; assetSymbol: string; state: EmbargoState }> {
  const symbol = requireSymbol(input.assetSymbol, 'assetSymbol');
  if (!(await isAbuseRegisterMigrated(pool))) throw perimeterUnavailable('A lift');
  const res = await pool.query<{ id: string; state: EmbargoState }>(
    `UPDATE marketing_asset_embargo
        SET lifted_by = $3, lifted_at = now()
      WHERE asset_symbol = $1 AND event_ref = $2 AND lifted_at IS NULL
      RETURNING id, state`,
    [symbol, input.eventRef, input.liftedBy],
  );
  const row = res.rows[0];
  if (row) return { id: row.id, assetSymbol: symbol, state: row.state };

  // Nothing was lifted. WHICH of the two reasons it was matters to the approver, so
  // it is answered rather than flattened into "not found".
  const existing = await pool.query<{ lifted_by: string | null; lifted_at: Date | string | null }>(
    `SELECT lifted_by, lifted_at FROM marketing_asset_embargo
      WHERE asset_symbol = $1 AND event_ref = $2`,
    [symbol, input.eventRef],
  );
  const prior = existing.rows[0];
  if (prior?.lifted_at != null) {
    throw new ActionError(
      'EMBARGO_ALREADY_LIFTED',
      `That entry for ${symbol} was already lifted by ${prior.lifted_by} at ${iso(prior.lifted_at)}. Re-lifting would move the name and date on a decision about inside information, so the database refuses it.`,
      409,
      { assetSymbol: symbol, eventRef: input.eventRef },
    );
  }
  throw new ActionError(
    'EMBARGO_NOT_FOUND',
    `No entry for ${symbol} with eventRef '${input.eventRef}'. Nothing was changed.`,
    404,
    { assetSymbol: symbol, eventRef: input.eventRef },
  );
}

/**
 * WHY a declaration was amended. A CLOSED ENUM, never prose.
 *
 * The database keeps its own copy of this union as a CHECK (the 0047 convention),
 * and the action param is this enum — so nothing prose-shaped enters `audit_log`,
 * which has no retention sweep. It is also better evidence than free text:
 * `position_opened` recorded the day after an approval is a finding you can count,
 * where a sentence is one you have to read.
 */
export const HOLDINGS_AMENDMENT_REASONS = [
  'position_opened', 'position_closed', 'earlier_entry_wrong', 'asset_renamed', 'periodic_renewal',
] as const;
export type HoldingsAmendmentReason = (typeof HOLDINGS_AMENDMENT_REASONS)[number];

/**
 * Declare, amend or renew one member's position in one asset.
 *
 * SELF-SERVICE: `memberId` comes from the authenticated principal at the action, and
 * there is no on-behalf path — see the table comment in 0060 for why a supervisor's
 * guess recorded under an employee's name is worse than no record.
 *
 * THE PRIOR ROW IS NEVER TOUCHED. An amendment INSERTS, pointing at what it
 * supersedes; the append-only trigger makes that the only possibility rather than
 * the polite convention. So "what did nik declare on the day that draft was
 * approved" stays answerable, which is the single question Art 91(3)(c) turns on.
 */
export async function declareHoldings(
  pool: pg.Pool,
  input: {
    memberId: string;
    assetSymbol: unknown;
    holds: boolean;
    renewInDays: number;
    amendmentReason?: HoldingsAmendmentReason | null;
  },
): Promise<{ id: string; supersededId: string | null; state: HoldingsDeclarationState }> {
  const symbol = requireSymbol(input.assetSymbol, 'assetSymbol');
  if (!(await isAbuseRegisterMigrated(pool))) throw perimeterUnavailable('A holdings declaration');

  const current = await pool.query<{ id: string }>(
    `SELECT d.id FROM marketing_holdings_declaration d
      WHERE d.member_id = $1 AND d.asset_symbol = $2
        AND NOT EXISTS (
          SELECT 1 FROM marketing_holdings_declaration s WHERE s.supersedes_id = d.id
        )`,
    [input.memberId, symbol],
  );
  const priorId = current.rows[0]?.id ?? null;
  const reason = input.amendmentReason ?? null;

  if (priorId === null && reason !== null) {
    throw new ActionError(
      'HOLDINGS_NOTHING_TO_AMEND',
      `There is no existing declaration for ${input.memberId} on ${symbol}, so there is nothing to amend. Declare without an amendmentReason.`,
      409,
      { assetSymbol: symbol },
    );
  }
  if (priorId !== null && reason === null) {
    throw new ActionError(
      'HOLDINGS_AMENDMENT_REASON_REQUIRED',
      `${input.memberId} already has a declaration for ${symbol}. Changing or renewing it requires an amendmentReason (one of: ${HOLDINGS_AMENDMENT_REASONS.join(', ')}) — an unexplained change to a record carrying personal liability under MiCA Art 91(3)(c) is not recordable.`,
      409,
      { assetSymbol: symbol, reasons: HOLDINGS_AMENDMENT_REASONS },
    );
  }

  try {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO marketing_holdings_declaration
         (member_id, asset_symbol, holds, renew_by, supersedes_id, amendment_reason)
       VALUES ($1, $2, $3, now() + make_interval(days => $4::int), $5, $6)
       RETURNING id`,
      [input.memberId, symbol, input.holds, input.renewInDays, priorId, reason],
    );
    const row = res.rows[0];
    if (!row) {
      throw new ActionError('HOLDINGS_WRITE_UNCONFIRMED', 'The declaration was not confirmed by the database, so nothing may rely on it. Re-read your declarations.', 500);
    }
    return {
      id: row.id,
      supersededId: priorId,
      state: input.holds ? 'declared_holding' : 'declared_none',
    };
  } catch (err) {
    const { code, constraint } = pgCode(err);
    if (code === UNIQUE_VIOLATION && constraint?.includes('chain')) {
      throw new ActionError(
        'HOLDINGS_AMENDED_CONCURRENTLY',
        'That declaration was amended by another request while this one was in flight, and forking the chain would make "the current declaration" depend on row order. Re-read yours and declare again.',
        409,
      );
    }
    if (code === UNIQUE_VIOLATION) {
      throw new ActionError(
        'HOLDINGS_ALREADY_DECLARED',
        `A first declaration for ${input.memberId} on ${symbol} already exists. Amend it instead, with a reason.`,
        409,
        { assetSymbol: symbol },
      );
    }
    if (code === CHECK_VIOLATION) {
      throw new ActionError(
        'HOLDINGS_ENTRY_REJECTED',
        `The database refused this declaration (${constraint ?? 'check constraint'}). See ${ABUSE_MIGRATION}.`,
        400,
        { constraint: constraint ?? null },
      );
    }
    throw err;
  }
}

/* ════════════════════ The governed write paths (registry) ════════════════════ */

/**
 * THE SUBJECT IS THE ASSET, and its symbol is the audit `entity_id`.
 *
 * `invokeAction` writes `audit_log(entity, entity_id)` from the subject
 * (registry.ts:1194-1198), so a `'*'` subject type would produce audit rows for
 * decisions about inside information that name no object. The symbol is the object.
 *
 * ══ AN EXPOSURE THIS FILE CANNOT CLOSE, STATED PLAINLY. ══
 * `/v1/audit` is gated at `requireOperator` and is NOT compartment-scoped
 * (routes/audit.ts:46), so an audit row saying `action:marketing_embargo_enter` on
 * entity_id `SOL` is visible to any principal holding operate on ANY workspace — and
 * that row is inside information. The same is true of a holdings row, which is an
 * employee's financial position. Nothing in the files this phase owns can fix that:
 * the fix is either compartment scoping on the audit route or a `/^marketing_/`
 * entry in `SUBJECT_TYPE_WORKSPACES` (registry.ts:103) plus a scoped audit read, and
 * both live elsewhere. It is recorded here, and in the return of the phase, rather
 * than left for someone to discover — and it is NOT a reason to skip the audit row,
 * because an unattributable embargo decision is worse than a widely-readable one.
 */
export const MARKETING_ASSET_SUBJECT = 'marketing_asset';

/** Lowercase slug, no spaces — the shape the database enforces, refused earlier here. */
const slug = (max: number, re: RegExp, what: string) =>
  z.string().min(1).max(max).refine((s) => re.test(s), {
    message: `${what} must be a lowercase slug (no spaces, no prose): ${re.source}`,
  });

/**
 * The three write paths, in the registry's own shape so `invokeAction` gives them
 * audit, the object_actions ledger, idempotency and the compartment gate for free.
 * Exported as an array for the registry to merge with the collision-checking LOOP at
 * `actions/registry.ts:839` — never a spread, for the reason documented there.
 *
 * EVERY PARAM IS AN ID, AN ENUM, A BOOLEAN OR AN INTEGER. Not one is prose, because
 * `invokeAction` writes params into BOTH `object_actions.params` and `audit_log.meta`
 * and neither table has a retention sweep. A "reason" field here would be a
 * free-text column with unbounded retention on the two most sensitive records in the
 * compartment; the amendment reason is an enum for exactly that reason.
 */
export const MARKETING_ABUSE_ACTIONS: readonly RegistryAction[] = [
  {
    id: 'marketing_embargo_enter',
    label: 'Enter asset embargo state',
    description:
      'Record an asset\'s inside-information state (MiCA Art 87-90) so drafts naming it refuse. Approver-only, named human, one live entry per asset.',
    subjectTypes: [MARKETING_ASSET_SUBJECT],
    // APPROVER-ONLY. `marketing` allows machine access, so the shared operator key
    // holds the compartment — approver is what keeps a cron job from deciding what
    // is inside information. `assertNamedHuman` then excludes machine principals
    // that somehow hold approve, because role and named-humanity are different
    // properties (the argument at gps/actions.ts:38-45).
    minRole: 'approver',
    workspace: 'marketing',
    paramsSchema: z.object({
      eventRef: slug(SLUG_MAX, EVENT_REF_RE, 'eventRef'),
      state: z.enum(EMBARGO_STATES as unknown as [EmbargoState, ...EmbargoState[]]),
      sourceRef: slug(SOURCE_REF_MAX, SOURCE_REF_RE, 'sourceRef'),
      reviewInDays: z.number().int().min(1).max(365),
      embargoUntilDays: z.number().int().min(1).max(3650).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const enteredBy = assertNamedHuman(actor, 'An embargo entry');
      const out = await enterEmbargo(pool, {
        assetSymbol: subjectId,
        eventRef: String(params.eventRef),
        state: params.state as EmbargoState,
        sourceRef: String(params.sourceRef),
        reviewInDays: Number(params.reviewInDays),
        embargoUntilDays: params.embargoUntilDays == null ? null : Number(params.embargoUntilDays),
        enteredBy,
      });
      return { embargoId: out.id, assetSymbol: out.assetSymbol, state: out.state, reviewBy: out.reviewBy };
    },
  },
  {
    id: 'marketing_embargo_lift',
    label: 'Lift asset embargo entry',
    description:
      'Record that an embargo entry is no longer in force, naming who lifted it. One-way; the next state is a new entry. Approver-only.',
    subjectTypes: [MARKETING_ASSET_SUBJECT],
    minRole: 'approver',
    workspace: 'marketing',
    paramsSchema: z.object({
      eventRef: slug(SLUG_MAX, EVENT_REF_RE, 'eventRef'),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const liftedBy = assertNamedHuman(actor, 'A lift');
      const out = await liftEmbargo(pool, {
        assetSymbol: subjectId,
        eventRef: String(params.eventRef),
        liftedBy,
      });
      // Deliberately does NOT report the asset as clear. Nothing is clear until a
      // new entry says so, and `loadEmbargoStates` reports `unknown` until then.
      return { embargoId: out.id, assetSymbol: out.assetSymbol, liftedState: out.state, assetIsNowClear: false };
    },
  },
  {
    id: 'marketing_holdings_declare',
    label: 'Declare your position in an asset',
    description:
      'Declare (or amend, or renew) whether YOU hold a named asset — MiCA Art 91(3)(c). Self-service: it records the authenticated member and nobody else.',
    subjectTypes: [MARKETING_ASSET_SUBJECT],
    // OPERATOR, because this is self-service and every member of the desk must be
    // able to answer for themselves — requiring an approver would mean the people
    // whose liability it is could not discharge it. There is no memberId param, so
    // the surface cannot be pointed at a colleague; `assertNamedHuman` blocks the
    // shared machine key, which holds `marketing` at operate.
    minRole: 'operator',
    workspace: 'marketing',
    paramsSchema: z.object({
      holds: z.boolean(),
      renewInDays: z.number().int().min(1).max(366),
      amendmentReason: z.enum(
        HOLDINGS_AMENDMENT_REASONS as unknown as [HoldingsAmendmentReason, ...HoldingsAmendmentReason[]],
      ).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const memberId = assertNamedHuman(actor, 'A holdings declaration');
      const out = await declareHoldings(pool, {
        memberId,
        assetSymbol: subjectId,
        holds: Boolean(params.holds),
        renewInDays: Number(params.renewInDays),
        amendmentReason: (params.amendmentReason as HoldingsAmendmentReason | undefined) ?? null,
      });
      return {
        declarationId: out.id,
        memberId,
        state: out.state,
        supersededId: out.supersededId,
        amended: out.supersededId !== null,
      };
    },
  },
];
