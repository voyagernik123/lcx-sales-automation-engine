/**
 * LCX MARKETING — THE HOLDINGS DECLARATION, READ.
 *
 *   GET /v1/marketing/holdings            your own chain (an approver may name a member)
 *   GET /v1/marketing/holdings/cells      the engine's join, for NAMED symbols
 *   GET /v1/marketing/holdings/register   APPROVER ONLY — current rows across the desk
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `0060_marketing_abuse.sql` created `marketing_holdings_declaration`, and
 * `marketing/abuseRegister.ts` joins against it on every draft — so the Art 91(3)(c)
 * gate has been real since M2. What did not exist was any way for a member of staff to
 * SEE their declarations, so the register was permanently empty, `refusalHint` was
 * permanently `HOLDINGS_DECLARATION_MISSING`, and the compartment's most expensive gate
 * (EUR 700 000 on a natural person, Art 111(2)(d)) could be fed by nobody. This is the
 * same defect this repo has now found five times: a gate nothing can feed is not a
 * control, it is a wall.
 *
 * ── THERE IS NO WRITE ROUTE HERE, AND THAT IS THE POINT ──────────────────────
 * Declaring goes through the GOVERNED ACTION `marketing_holdings_declare`
 * (`abuseRegister.ts:MARKETING_ABUSE_ACTIONS`) at `POST /v1/actions/invoke`, which the
 * web client already calls via `declareAssetHoldings`. `invokeAction` gives that write
 * the audit row, the `object_actions` ledger, idempotency and the compartment gate; a
 * hand-rolled `POST` here would have none of them and would be a SECOND authority model
 * over a record carrying personal liability. So this file is SELECT-only, and the one
 * thing it must never grow is a write path.
 *
 * ── THE AUTHORITY MODEL IS `abuseRegister.ts`'s, NOT A NEW ONE ───────────────
 * Nothing here decides who may read what. `listHoldings` enforces SELF-OR-APPROVER and
 * throws `HOLDINGS_SELF_OR_APPROVER`; `listHoldingsRegister` enforces APPROVER-ONLY and
 * throws `HOLDINGS_APPROVER_ONLY`; `loadHoldingsStates` is the same join the engine
 * runs. This file passes the caller's identity and role in and turns an `ActionError`
 * into a status code. That is deliberate: a route that re-derived the rule would be a
 * second place for it to be wrong, and the rule protects employee financial data.
 *
 * `requireOperator` is on the router so it is never open when mounted bare in a test,
 * and all three routes are GETs — `app.ts:requiresOperate` gates GET/HEAD/OPTIONS at
 * `marketing:view`, which is correct for SELECT-only reads. The self-or-approver check
 * then narrows within that tier, which is where employee-level need-to-know belongs.
 *
 * ── ABSENT DATA REFUSES, AND THREE ABSENCES ARE REPORTED SEPARATELY ──────────
 * `registerPresent` false = 0060 is not applied here. `registerEmpty` = it is, and
 * nobody has ever declared anything. `shortLimbMigrated` false = 0065 is not applied,
 * so no short answer can be recorded at all. Each is reported as itself, never as an
 * empty list, because "no rows" and "no table" and "no column" need three different
 * humans to do three different things.
 *
 * ── WHAT THIS FILE CANNOT TELL ANYONE ────────────────────────────────────────
 * WHICH ASSETS A MEMBER HAS NOT DECLARED. There is no universe of assets to subtract
 * from: the embargo register is itself inside information and approver-only, and the
 * catalog is not a list of what anybody might post about. So the chain route returns
 * what WAS declared and the surface says so out loud, and `/cells` exists to turn a
 * NAMED symbol into a `not_declared` answer somebody can act on. An empty chain is
 * silence, and this file never dresses silence as a clean bill of health.
 *
 * ── THE SHAPES, AND WHY THEY ARE STILL BUILT BY HAND ─────────────────────────
 * The response shapes are declared in `packages/shared/src/marketing/contracts/holdings.ts`.
 * They WERE unreachable from here — `@lcx/shared` publishes one `"."` export and a deep
 * relative specifier fails the api emit build with TS6059 (`not under rootDir`), the
 * Docker-order failure `gate-must-run-emit-build` exists to catch — and
 * `marketing/index.ts` now re-exports that module, so the vocabulary this file uses via
 * `abuseRegister.ts` is the shared one rather than a copy.
 *
 * The BODIES below are still composed as plain objects, because that is what a Hono handler
 * returns: `c.json` takes JSON, not a `HoldingsChainResponse`, so annotating them would not
 * make the compiler check the wire. What checks it is `HOLDINGS_RESPONSE_KEYS`, asserted
 * against a real HTTP response in `__tests__/marketingHoldings.test.ts`. Add a field on one
 * side only and that test fails.
 */
import { Hono, type Context } from 'hono';
import { TEAM } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { ActionError, type ActorRole } from '../actions/types.js';
import {
  ABUSE_MIGRATION,
  LOOKUP_SYMBOL_MAX,
  SHORT_LIMB_MIGRATION,
  SHORT_QUESTION_POLICY,
  isAbuseRegisterMigrated,
  isHoldingsShortLimbMigrated,
  listHoldings,
  listHoldingsRegister,
  loadHoldingsStates,
  normaliseShortAnswer,
  shortQuestionIsAsked,
} from '../marketing/abuseRegister.js';

export const marketingHoldingsRoutes = new Hono<{ Variables: AuthVariables }>();

marketingHoldingsRoutes.use('*', requireOperator);

/** The caller, as the register's two checks want them. */
function principal(c: Context<{ Variables: AuthVariables }>): { viewer: string; role: ActorRole } {
  const op = c.get('operator');
  return {
    viewer: op?.id ?? '',
    // The registry's own narrowing (`routes/actions.ts:47`): anything that is not
    // `approver` is an operator. Never widened here.
    role: op?.role === 'approver' ? 'approver' : 'operator',
  };
}

/**
 * An `ActionError` becomes its own status and code; anything else is a 500 that says
 * nothing about the register. `HOLDINGS_SELF_OR_APPROVER` and `HOLDINGS_APPROVER_ONLY`
 * arrive here as 403s with the rule quoted, which is the house shape: a refusal with a
 * stable code, not a warning and not an empty list.
 */
function fail(c: Context<{ Variables: AuthVariables }>, err: unknown) {
  if (err instanceof ActionError) {
    return c.json(
      // `data` is the register's own machine-readable detail (which migration, which
      // policies) and is spread the way `routes/actions.ts` spreads it, so a client
      // reading a refusal here parses the same shape it does everywhere else.
      { error: err.message, code: err.code, ...(err.data ?? {}) },
      err.status as 400,
    );
  }
  console.error('[marketing/holdings]', err);
  return c.json({ error: 'The holdings register could not be read.', code: 'HOLDINGS_READ_FAILED' }, 500);
}

/** The policy pair every response carries, so no surface has to guess or hardcode it. */
function policyBlock() {
  return {
    shortQuestionPolicy: SHORT_QUESTION_POLICY,
    shortQuestionAsked: shortQuestionIsAsked(SHORT_QUESTION_POLICY),
  };
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

/**
 * One database row → one `HoldingsDeclarationRow`.
 *
 * `short_position` goes through `normaliseShortAnswer`, so a row from a pre-0065
 * database — where the column was not selected at all — reads as 'not_asked'. That is
 * TRUE of it (the question could not have been put) and it resolves to an unknown
 * bearish limb, which refuses. It is never 'no_short'.
 */
function rowOf(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    memberId: String(r.member_id),
    assetSymbol: String(r.asset_symbol),
    holds: Boolean(r.holds),
    shortPosition: normaliseShortAnswer(r.short_position),
    declaredAt: iso(r.declared_at),
    renewBy: iso(r.renew_by),
    superseded: Boolean(r.superseded),
    supersedesId: r.supersedes_id === null || r.supersedes_id === undefined ? null : String(r.supersedes_id),
    amendmentReason: r.amendment_reason === null || r.amendment_reason === undefined
      ? null
      : String(r.amendment_reason),
  };
}

/**
 * `GET /v1/marketing/holdings?memberId=…`
 *
 * THE WHOLE CHAIN, SUPERSEDED ROWS INCLUDED. That is not clutter: the table is
 * append-only because the earlier value is the evidence, and "what did this person
 * declare on the day that draft was approved" is the single question Art 91(3)(c) turns
 * on. A route that returned only current rows would answer a different question.
 */
marketingHoldingsRoutes.get('/holdings', async (c) => {
  const { viewer, role } = principal(c);
  const asked = (c.req.query('memberId') ?? '').trim();
  try {
    const pool = getPool();
    // `listHoldings` performs the self-or-approver check itself, on the raw request
    // value, before it touches the database — so an unauthorised read cannot even learn
    // whether the register exists.
    const out = await listHoldings(pool, {
      viewer,
      role,
      ...(asked ? { memberId: asked } : {}),
      ...(c.req.query('symbol') ? { assetSymbol: c.req.query('symbol') } : {}),
    });
    const subject = asked || viewer;
    return c.json({
      memberId: subject,
      viewerIsSubject: subject === viewer,
      registerPresent: out.registerPresent,
      registerEmpty: out.registerPresent && out.rows.length === 0,
      shortLimbMigrated: out.registerPresent ? await isHoldingsShortLimbMigrated(pool) : false,
      migration: ABUSE_MIGRATION,
      shortMigration: SHORT_LIMB_MIGRATION,
      rows: out.rows.map((r) => rowOf(r as unknown as Record<string, unknown>)),
      ...policyBlock(),
    });
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * `GET /v1/marketing/holdings/cells?symbols=SOL,ETH&memberId=…`
 *
 * THE ROUTE THAT ANSWERS THE DANGEROUS QUESTION. The chain says what was declared; only
 * a named symbol can produce `not_declared`, which is the state that refuses and the
 * state nobody discovers by looking at a list.
 *
 * `loadHoldingsStates` is the ENGINE'S OWN JOIN — the same function `assessMarketAbuse`
 * is fed from — so what this returns is what a draft would hit, including a stale
 * declaration arriving as `not_declared`. Deliberately not a second implementation.
 */
marketingHoldingsRoutes.get('/holdings/cells', async (c) => {
  const { viewer, role } = principal(c);
  const asked = (c.req.query('memberId') ?? '').trim();
  const subject = asked || viewer;

  if (subject !== viewer && role !== 'approver') {
    return c.json(
      {
        error: `A holdings declaration is a named person's financial position under MiCA Art 91(3)(c). You may read your own; reading '${subject}' requires approver authority.`,
        code: 'HOLDINGS_SELF_OR_APPROVER',
      },
      403,
    );
  }

  const symbols = (c.req.query('symbols') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    // REFUSES rather than returning every asset or an empty list. There is no universe
    // of assets to enumerate, and an empty array here would read as "nothing is
    // undeclared" — the exact misreading this route exists to prevent.
    return c.json(
      {
        error: `Name the assets to check, as ?symbols=SOL,ETH (at most ${LOOKUP_SYMBOL_MAX}). This route cannot list what you have NOT declared — there is no universe of assets to subtract from — so it answers about symbols you name. An empty answer would read as a clean bill of health.`,
        code: 'HOLDINGS_SYMBOLS_REQUIRED',
      },
      400,
    );
  }

  try {
    const pool = getPool();
    const lookup = await loadHoldingsStates(pool, { memberIds: [subject], symbols });
    return c.json({
      memberId: subject,
      registerPresent: lookup.registerPresent,
      registerEmpty: lookup.registerEmpty,
      shortLimbMigrated: lookup.registerPresent ? await isHoldingsShortLimbMigrated(pool) : false,
      cells: lookup.cells.map((cell) => ({
        memberId: cell.memberId,
        assetSymbol: cell.assetSymbol,
        state: cell.state,
        holds: cell.holds,
        shortPosition: cell.shortPosition,
        declaredAt: cell.declaredAt,
        renewBy: cell.renewBy,
        stale: cell.stale,
        amendments: cell.amendments,
      })),
      notDeclared: lookup.cells
        .filter((cell) => cell.state === 'not_declared' || cell.state === 'register_absent')
        .map((cell) => cell.assetSymbol),
      ...policyBlock(),
    });
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * `GET /v1/marketing/holdings/register` — APPROVER ONLY.
 *
 * The supervision half. `listHoldingsRegister` throws `HOLDINGS_APPROVER_ONLY` before
 * any SQL runs, so a non-approver cannot learn from a timing difference whether the
 * desk has declared anything.
 *
 * `membersWithNothingDeclared` is the ROSTER minus everyone with a current row. It is
 * the only census this data honestly supports, and its meaning is exact: the register
 * has never heard from these people. IT IS NOT A CLAIM THAT THEY HOLD NOTHING — that is
 * the same conflation as reading an empty list as clear, one level up.
 */
marketingHoldingsRoutes.get('/holdings/register', async (c) => {
  const { role } = principal(c);
  try {
    const pool = getPool();
    const out = await listHoldingsRegister(pool, { role });
    const rows = out.rows.map((r) => rowOf(r));
    const declaredBy = new Set(rows.map((r) => r.memberId));
    return c.json({
      registerPresent: out.registerPresent,
      registerEmpty: out.registerPresent && rows.length === 0,
      shortLimbMigrated: out.registerPresent ? await isHoldingsShortLimbMigrated(pool) : false,
      rows,
      // The roster is the reviewed list of named humans (`operators.ts`); `operator` and
      // the machine principals are not on it and cannot declare, which is why they
      // cannot appear here either (`assertNamedHuman`).
      membersWithNothingDeclared: TEAM.map((m) => m.id).filter((id) => !declaredBy.has(id)),
      ...policyBlock(),
    });
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * Named so a mount test can assert the paths, and so `routes/marketing.ts` can nest this
 * at `'/'` the way it nests `marketingGates`. THE PREFIX MUST BE `/v1/marketing`: the
 * web page calls these exact paths, and a router mounted elsewhere 404s a screen that
 * looks correct.
 */
export const MARKETING_HOLDINGS_PATHS = [
  '/holdings',
  '/holdings/cells',
  '/holdings/register',
] as const;

/** Re-exported so the probe used by every response has one importer and one name. */
export { isAbuseRegisterMigrated };
