import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActionError } from '../../actions/types.js';
import {
  ABUSE_MIGRATION,
  EMBARGO_STATES,
  HOLDINGS_AMENDMENT_REASONS,
  LOOKUP_SYMBOL_MAX,
  MARKETING_ABUSE_ACTIONS,
  MARKETING_ASSET_SUBJECT,
  _resetAbuseRegisterMigrated,
  declareHoldings,
  enterEmbargo,
  holdingsKey,
  isAbuseRegisterMigrated,
  liftEmbargo,
  listEmbargoRegister,
  listHoldings,
  loadEmbargoRegister,
  loadEmbargoStates,
  loadHoldingsRegister,
  loadHoldingsStates,
  normaliseSymbol,
} from '../abuseRegister.js';

/**
 * THE MARKET-ABUSE PERIMETER (M2 storage) — every refusal, one at a time.
 *
 * The property under test throughout is doctrine rule 3 in its sharpest form:
 * ABSENT DATA REFUSES AND NEVER DEFAULTS.
 *
 * Three of the checks in `../abuseRegister.ts` were removed and the suite re-run, to
 * prove these assertions are load-bearing rather than decorative: dropping the
 * staleness verdict (`state: cause === null ? … : 'unknown'`) failed the two window /
 * review tests, and removing the approver condition in `listEmbargoRegister` failed
 * the need-to-know test. That is a sample, not an exhaustive proof for every `expect`
 * below, and it is described as a sample deliberately.
 *
 * These run against a stub pool, not Postgres — the api suite is deliberately
 * database-free. So they prove the control flow, the state mapping and the refusals
 * around each query, NOT that Postgres enforces the constraints. The constraints are
 * asserted separately, as text, in `abuseRegisterMigration.test.ts`; neither file can
 * prove the two agree on a live database, and nothing here claims to.
 */

interface Row { [k: string]: unknown }
interface Recorded { sql: string; params: unknown[] }

interface StubOpts {
  migrated?: boolean;
  /** Throw from the to_regclass probe, to test that a fault is not cached. */
  probeError?: Error;
  embargoAnyRows?: boolean;
  embargoLive?: Row[];
  embargoEngineRows?: Row[];
  embargoRegister?: Row[];
  embargoInsertError?: Error;
  embargoLiftRows?: Row[];
  embargoPrior?: Row[];
  holdingsAnyRows?: boolean;
  holdingsCurrent?: Row[];
  holdingsCells?: Row[];
  holdingsInsertError?: Error;
}

function pgErr(code: string, constraint?: string): Error {
  const err = new Error(`stub ${code}`) as Error & { code: string; constraint?: string };
  err.code = code;
  if (constraint) err.constraint = constraint;
  return err;
}

/** A pool that answers exactly the statements this module issues, and records them. */
function stub(opts: StubOpts = {}) {
  const queries: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/to_regclass/.test(sql)) {
        if (opts.probeError) throw opts.probeError;
        return { rows: [{ ok: opts.migrated ?? true }], rowCount: 1 };
      }
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo\)/.test(sql)) {
        return { rows: [{ any_rows: opts.embargoAnyRows ?? true }], rowCount: 1 };
      }
      if (/EXISTS \(SELECT 1 FROM marketing_holdings_declaration\)/.test(sql)) {
        return { rows: [{ any_rows: opts.holdingsAnyRows ?? true }], rowCount: 1 };
      }
      if (/SELECT asset_symbol, state, embargoed_from/.test(sql)) {
        return { rows: opts.embargoEngineRows ?? [], rowCount: (opts.embargoEngineRows ?? []).length };
      }
      if (/SELECT asset_symbol, state, embargoed_until/.test(sql)) {
        return { rows: opts.embargoLive ?? [], rowCount: (opts.embargoLive ?? []).length };
      }
      if (/SELECT asset_symbol, event_ref, state/.test(sql)) {
        return { rows: opts.embargoRegister ?? [], rowCount: (opts.embargoRegister ?? []).length };
      }
      if (/INSERT INTO marketing_asset_embargo/.test(sql)) {
        if (opts.embargoInsertError) throw opts.embargoInsertError;
        return { rows: [{ id: 'emb-1', review_by: new Date('2026-09-01T00:00:00.000Z') }], rowCount: 1 };
      }
      if (/UPDATE marketing_asset_embargo/.test(sql)) {
        return { rows: opts.embargoLiftRows ?? [], rowCount: (opts.embargoLiftRows ?? []).length };
      }
      if (/SELECT lifted_by, lifted_at/.test(sql)) {
        return { rows: opts.embargoPrior ?? [], rowCount: (opts.embargoPrior ?? []).length };
      }
      if (/SELECT d\.id FROM marketing_holdings_declaration/.test(sql)) {
        return { rows: opts.holdingsCurrent ?? [], rowCount: (opts.holdingsCurrent ?? []).length };
      }
      if (/SELECT d\.member_id, d\.asset_symbol, d\.holds/.test(sql)) {
        return { rows: opts.holdingsCells ?? [], rowCount: (opts.holdingsCells ?? []).length };
      }
      if (/INSERT INTO marketing_holdings_declaration/.test(sql)) {
        if (opts.holdingsInsertError) throw opts.holdingsInsertError;
        return { rows: [{ id: 'dec-1' }], rowCount: 1 };
      }
      if (/SELECT id, member_id, asset_symbol/.test(sql)) {
        return { rows: opts.holdingsCells ?? [], rowCount: (opts.holdingsCells ?? []).length };
      }
      throw new Error(`stub pool: unexpected statement\n${sql}`);
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

const NOW = new Date('2026-08-02T12:00:00.000Z');
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const past = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

/** Run an action's executor the way `invokeAction` would, params validated first. */
function runAction(id: string, pool: pg.Pool, input: { subjectId: string; params: Record<string, unknown>; actor: string }) {
  const action = MARKETING_ABUSE_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`no such action ${id}`);
  const params = action.paramsSchema.parse(input.params) as Record<string, unknown>;
  return action.execute({
    pool,
    subjectType: MARKETING_ASSET_SUBJECT,
    subjectId: input.subjectId,
    params,
    actor: input.actor,
    role: 'approver',
    markGateDegraded: () => {},
  });
}

beforeEach(() => {
  // The probe caches per process, and every test below chooses its own answer.
  _resetAbuseRegisterMigrated();
});

describe('an absent embargo register refuses and says so — it never reads as clear', () => {
  it('reports register_absent for every symbol when 0060 has not been applied', async () => {
    const { pool } = stub({ migrated: false });
    const got = await loadEmbargoStates(pool, ['SOL', 'ETH'], NOW);
    expect(got.registerPresent).toBe(false);
    expect(got.states).toEqual({ SOL: 'unknown', ETH: 'unknown' });
    expect(got.cells.every((c) => c.cause === 'register_absent')).toBe(true);
    expect(got.refusalHint).toBe('EMBARGO_REGISTER_ABSENT');
    // The one assertion that matters most: nothing anywhere says 'clear'.
    expect(Object.values(got.states)).not.toContain('clear');
  });

  it('distinguishes an EMPTY table from a MISSING one, and refuses on both', async () => {
    const { pool } = stub({ migrated: true, embargoAnyRows: false });
    const got = await loadEmbargoStates(pool, ['SOL'], NOW);
    expect(got.registerPresent).toBe(true);
    expect(got.registerEmpty).toBe(true);
    expect(got.cells[0]!.cause).toBe('register_empty');
    expect(got.refusalHint).toBe('EMBARGO_REGISTER_ABSENT');
    expect(got.states.SOL).toBe('unknown');
  });

  it('reports a symbol with no live row as unknown, not as clear', async () => {
    const { pool } = stub({
      embargoLive: [
        { asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_until: null, review_by: future(30), entered_by: 'monty' },
      ],
    });
    const got = await loadEmbargoStates(pool, ['SOL', 'ARB'], NOW);
    expect(got.states).toEqual({ SOL: 'mnpi_pending', ARB: 'unknown' });
    expect(got.cells.find((c) => c.assetSymbol === 'ARB')!.cause).toBe('no_live_record');
  });

  it('fills in every requested symbol, so absence cannot be read as falsy', async () => {
    const { pool } = stub({ embargoLive: [] });
    const got = await loadEmbargoStates(pool, ['SOL', 'ETH', 'LCX'], NOW);
    expect(Object.keys(got.states).sort()).toEqual(['ETH', 'LCX', 'SOL']);
    expect(got.cells).toHaveLength(3);
  });
});

describe('staleness stops a row authorising anything, and never clears an asset', () => {
  it('treats a live row past its window as unknown, keeping what it recorded', async () => {
    const { pool } = stub({
      embargoLive: [
        { asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_until: past(1), review_by: future(30), entered_by: 'monty' },
      ],
    });
    const cell = (await loadEmbargoStates(pool, ['SOL'], NOW)).cells[0]!;
    expect(cell.state).toBe('unknown');
    expect(cell.recordedState).toBe('mnpi_pending');
    expect(cell.inForce).toBe(false);
    expect(cell.cause).toBe('window_ended');
  });

  it('treats an overdue review as unknown even when the recorded state was clear', async () => {
    // The conservative direction, and the point of the test: an unreviewed 'clear'
    // is not a clearance. If this ever returns 'clear', a year-old row starts
    // authorising posts about an asset nobody has looked at.
    const { pool } = stub({
      embargoLive: [
        { asset_symbol: 'LCX', state: 'clear', embargoed_until: null, review_by: past(2), entered_by: 'nik' },
      ],
    });
    const cell = (await loadEmbargoStates(pool, ['LCX'], NOW)).cells[0]!;
    expect(cell.state).toBe('unknown');
    expect(cell.cause).toBe('review_overdue');
  });

  it('passes a live, fresh row through with the state as recorded', async () => {
    const { pool } = stub({
      embargoLive: [
        { asset_symbol: 'ETH', state: 'announced', embargoed_until: future(5), review_by: future(20), entered_by: 'monty' },
      ],
    });
    const cell = (await loadEmbargoStates(pool, ['eth'], NOW)).cells[0]!;
    expect(cell.state).toBe('announced');
    expect(cell.inForce).toBe(true);
    expect(cell.cause).toBeNull();
    expect(cell.enteredBy).toBe('monty');
  });
});

describe('symbols are normalised and bounded before they reach a table of inside information', () => {
  it('uppercases, trims and de-duplicates', () => {
    expect(normaliseSymbol(' sol ')).toBe('SOL');
    expect(normaliseSymbol('LCX')).toBe('LCX');
  });

  it('refuses anything that is not symbol-shaped', () => {
    for (const bad of ['', '   ', 'not a symbol', 'http://x.test', 'a'.repeat(21), 42, null, undefined]) {
      expect(normaliseSymbol(bad), String(bad)).toBeNull();
    }
  });

  it('refuses a lookup containing a non-symbol rather than silently dropping it', async () => {
    // Dropping would mean the engine asked about three things, got two answers, and
    // could not tell. A refusal is the only honest outcome.
    const { pool } = stub();
    await expect(loadEmbargoStates(pool, ['SOL', 'buy sol now'], NOW)).rejects.toMatchObject({
      code: 'ASSET_SYMBOL_INVALID',
    });
  });

  it('refuses a lookup wider than the bound', async () => {
    const many = Array.from({ length: LOOKUP_SYMBOL_MAX + 1 }, (_, i) => `SYM${i}`);
    const { pool } = stub();
    await expect(loadEmbargoStates(pool, many, NOW)).rejects.toMatchObject({ code: 'LOOKUP_TOO_WIDE' });
  });

  it('sends one normalised parameter per distinct symbol', async () => {
    const { pool, queries } = stub({ embargoLive: [] });
    await loadEmbargoStates(pool, ['sol', 'SOL', ' Sol '], NOW);
    const live = queries.find((q) => /asset_symbol = ANY/.test(q.sql))!;
    expect(live.params[0]).toEqual(['SOL']);
  });
});

describe('the migration probe cannot poison itself', () => {
  it('does not cache a failure, so one database blip is not permanent', async () => {
    // `marketing/service.ts` caches `false` from a bare catch, which is plan §1
    // defect 8: a single error convinces that process the compartment is
    // un-migrated until the API restarts.
    const failing = stub({ probeError: new Error('ECONNRESET') });
    expect(await isAbuseRegisterMigrated(failing.pool)).toBe(false);
    const working = stub({ migrated: true });
    expect(await isAbuseRegisterMigrated(working.pool)).toBe(true);
  });

  it('caches a definite answer, so a once-ever event costs one round trip', async () => {
    const { pool, queries } = stub({ migrated: true });
    await isAbuseRegisterMigrated(pool);
    await isAbuseRegisterMigrated(pool);
    expect(queries.filter((q) => /to_regclass/.test(q.sql))).toHaveLength(1);
  });
});

describe('the holdings register: four states that do not collapse', () => {
  it('answers register_absent — not not_declared — when there is no register', async () => {
    const { pool } = stub({ migrated: false });
    const got = await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL'] }, NOW);
    expect(got.states[holdingsKey('nik', 'SOL')]).toBe('register_absent');
    expect(got.refusalHint).toBe('HOLDINGS_DECLARATION_MISSING');
  });

  it('answers register_absent for an empty table, and says the table exists', async () => {
    const { pool } = stub({ holdingsAnyRows: false });
    const got = await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL'] }, NOW);
    expect(got.registerPresent).toBe(true);
    expect(got.registerEmpty).toBe(true);
    expect(got.cells[0]!.state).toBe('register_absent');
  });

  it('reads a fresh positive declaration as declared_holding', async () => {
    const { pool } = stub({
      holdingsCells: [
        { member_id: 'nik', asset_symbol: 'SOL', holds: true, declared_at: past(3), renew_by: future(60), amendments: 1 },
      ],
    });
    const cell = (await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL'] }, NOW)).cells[0]!;
    expect(cell.state).toBe('declared_holding');
    expect(cell.holds).toBe(true);
    expect(cell.amendments).toBe(1);
  });

  it('reads a fresh negative declaration as declared_none, distinct from silence', async () => {
    const { pool } = stub({
      holdingsCells: [
        { member_id: 'nik', asset_symbol: 'SOL', holds: false, declared_at: past(3), renew_by: future(60), amendments: 0 },
      ],
    });
    const got = await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL', 'ETH'] }, NOW);
    expect(got.states[holdingsKey('nik', 'SOL')]).toBe('declared_none');
    expect(got.states[holdingsKey('nik', 'ETH')]).toBe('not_declared');
    expect(got.refusalHint).toBe('HOLDINGS_DECLARATION_MISSING');
  });

  it('treats an expired declaration as not_declared and withholds the stale boolean', async () => {
    // The failure this guards: a surface rendering "no position (expired)" and an
    // operator acting on a year-old answer to a question whose answer changes.
    const { pool } = stub({
      holdingsCells: [
        { member_id: 'nik', asset_symbol: 'SOL', holds: false, declared_at: past(400), renew_by: past(35), amendments: 0 },
      ],
    });
    const cell = (await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL'] }, NOW)).cells[0]!;
    expect(cell.state).toBe('not_declared');
    expect(cell.stale).toBe(true);
    expect(cell.holds).toBeNull();
  });

  it('fills in every (member, asset) pair asked about', async () => {
    const { pool } = stub({ holdingsCells: [] });
    const got = await loadHoldingsStates(pool, { memberIds: ['nik', 'monty'], symbols: ['SOL', 'ETH'] }, NOW);
    expect(got.cells).toHaveLength(4);
    expect(Object.keys(got.states)).toHaveLength(4);
  });

  it('reads the current declaration as the row nothing supersedes', async () => {
    const { pool, queries } = stub({ holdingsCells: [] });
    await loadHoldingsStates(pool, { memberIds: ['nik'], symbols: ['SOL'] }, NOW);
    const read = queries.find((q) => /d\.member_id, d\.asset_symbol, d\.holds/.test(q.sql))!;
    expect(read.sql).toMatch(/NOT EXISTS[\s\S]*supersedes_id = d\.id/);
    // No is_current / latest-wins ordering: "current" is structural, not a guess.
    expect(read.sql).not.toMatch(/is_current|ORDER BY/);
  });
});

describe('what is handed to the engine keeps the engine’s rules intact', () => {
  it('passes a STALE mnpi_pending row through as mnpi_pending, not as unknown', async () => {
    // The most consequential line in the phase. abuse.ts:183 — "ageing out of an
    // embargo would be the single worst bug this file could contain". The surface
    // lookup downgrades a stale row to `unknown` (which refuses); handing that to the
    // engine would soften a hard Art 90 block, so the builder passes what is recorded
    // and lets the engine apply its own rule.
    const { pool } = stub({
      embargoEngineRows: [{
        asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_from: past(40),
        review_by: past(9), entered_by: 'monty', entered_at: past(40),
      }],
    });
    const reg = await loadEmbargoRegister(pool, ['SOL']);
    expect(reg.entries[0]!.state).toBe('mnpi_pending');
    expect(reg.entries[0]!.reviewBy).toBe(past(9).toISOString());

    // …while the same row, read for a surface, is unknown-with-a-reason.
    const surface = stub({
      embargoLive: [{
        asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_until: null,
        review_by: past(9), entered_by: 'monty',
      }],
    });
    const cell = (await loadEmbargoStates(surface.pool, ['SOL'], NOW)).cells[0]!;
    expect(cell.state).toBe('unknown');
    expect(cell.recordedState).toBe('mnpi_pending');
  });

  it('never attests completeness, in any path', async () => {
    // An ATTESTED embargo register lets absence resolve to `clear` (abuse.ts). Nothing
    // in these tables is that assertion, so synthesising one from a row count would be
    // the most dangerous line available to this phase.
    const empty = stub({ migrated: false });
    expect((await loadEmbargoRegister(empty.pool)).completeness).toEqual({ kind: 'not_attested' });
    expect((await loadHoldingsRegister(empty.pool)).completeness).toEqual({ kind: 'not_attested' });

    const full = stub({
      embargoEngineRows: [{
        asset_symbol: 'SOL', state: 'clear', embargoed_from: past(2),
        review_by: future(30), entered_by: 'monty', entered_at: past(2),
      }],
      holdingsCells: [{
        member_id: 'nik', asset_symbol: 'SOL', holds: true,
        declared_at: past(2), renew_by: future(60),
      }],
    });
    expect((await loadEmbargoRegister(full.pool)).completeness).toEqual({ kind: 'not_attested' });
    expect((await loadHoldingsRegister(full.pool)).completeness).toEqual({ kind: 'not_attested' });
  });

  it('does not put the approver-only source reference into a drafter-facing basis', async () => {
    const { pool, queries } = stub({
      embargoEngineRows: [{
        asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_from: past(1),
        review_by: future(30), entered_by: 'monty', entered_at: past(1),
      }],
    });
    const reg = await loadEmbargoRegister(pool, ['SOL']);
    expect(reg.entries[0]!.basis).toContain('monty');
    // Strongest available form of the check: the column is not even selected.
    const q = queries.find((x) => /FROM marketing_asset_embargo/.test(x.sql))!;
    expect(q.sql).not.toMatch(/source_ref/);
    expect(reg.entries[0]!.basis).not.toMatch(/source_ref|minutes/);
  });

  it('sets announcedAt only for an announced entry, and says what it means', async () => {
    const { pool } = stub({
      embargoEngineRows: [
        { asset_symbol: 'ETH', state: 'announced', embargoed_from: past(3), review_by: future(30), entered_by: 'monty', entered_at: past(3) },
        { asset_symbol: 'SOL', state: 'mnpi_pending', embargoed_from: past(3), review_by: future(30), entered_by: 'monty', entered_at: past(3) },
      ],
    });
    const reg = await loadEmbargoRegister(pool);
    expect(reg.entries.find((e) => e.asset === 'ETH')!.announcedAt).toBe(past(3).toISOString());
    expect(reg.entries.find((e) => e.asset === 'SOL')!.announcedAt).toBeNull();
  });

  it('maps holds to the two assertable states and holds no note', async () => {
    const { pool } = stub({
      holdingsCells: [
        { member_id: 'nik', asset_symbol: 'SOL', holds: true, declared_at: past(2), renew_by: future(60) },
        { member_id: 'monty', asset_symbol: 'SOL', holds: false, declared_at: past(2), renew_by: future(60) },
      ],
    });
    const reg = await loadHoldingsRegister(pool, { symbols: ['SOL'] });
    expect(reg.entries.map((e) => e.declared)).toEqual(['declared_holding', 'declared_none']);
    // No prose and no position size, ever: Art 91(3)(c) turns on existence, not size.
    expect(reg.entries.every((e) => e.note === null)).toBe(true);
  });

  it('returns an empty register rather than querying when the scope is empty', async () => {
    const { pool, queries } = stub({});
    expect((await loadHoldingsRegister(pool, { memberIds: [] })).entries).toEqual([]);
    expect(queries.filter((q) => /FROM marketing_holdings_declaration/.test(q.sql))).toHaveLength(0);
  });
});

describe('need-to-know is enforced in code, not left to the route', () => {
  it('refuses the embargo register to a non-approver, before touching the table', async () => {
    const { pool, queries } = stub();
    await expect(listEmbargoRegister(pool, { role: 'operator' })).rejects.toMatchObject({
      code: 'EMBARGO_DETAIL_APPROVER_ONLY',
      status: 403,
    });
    // A refusal that queried first would have put inside information in a result set
    // on its way to being logged.
    expect(queries).toHaveLength(0);
  });

  it('gives an approver the event and source references', async () => {
    const { pool } = stub({
      embargoRegister: [{
        asset_symbol: 'SOL', event_ref: 'listing-committee-2026-07-30', state: 'mnpi_pending',
        embargoed_from: past(1), embargoed_until: null, review_by: future(30),
        source_ref: 'minutes/2026-07-30', entered_by: 'monty', entered_at: past(1),
        lifted_by: null, lifted_at: null,
      }],
    });
    const got = await listEmbargoRegister(pool, { role: 'approver' });
    expect(got.rows[0]!.sourceRef).toBe('minutes/2026-07-30');
    expect(got.rows[0]!.inForce).toBe(true);
  });

  it('answers the approver read with an empty register instead of throwing pre-migration', async () => {
    const { pool } = stub({ migrated: false });
    await expect(listEmbargoRegister(pool, { role: 'approver' })).resolves.toEqual({
      registerPresent: false, rows: [],
    });
  });

  it('lets a member read their own holdings and refuses them a colleague’s', async () => {
    const { pool } = stub({ holdingsCells: [] });
    await expect(listHoldings(pool, { viewer: 'nik', role: 'operator' })).resolves.toMatchObject({
      registerPresent: true,
    });
    await expect(
      listHoldings(pool, { viewer: 'nik', role: 'operator', memberId: 'monty' }),
    ).rejects.toMatchObject({ code: 'HOLDINGS_SELF_OR_APPROVER', status: 403 });
  });

  it('lets an approver read a colleague’s — that is the supervision half', async () => {
    const { pool } = stub({ holdingsCells: [] });
    await expect(
      listHoldings(pool, { viewer: 'nik', role: 'approver', memberId: 'monty' }),
    ).resolves.toMatchObject({ registerPresent: true });
  });
});

describe('writes fail closed, and never discard what they collide with', () => {
  it('refuses an embargo entry with 503 and the migration name when 0060 is absent', async () => {
    const { pool } = stub({ migrated: false });
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.toMatchObject({ code: 'PERIMETER_UNAVAILABLE', status: 503 });
    // The refusal has to tell the operator what to run, or it is a dead end.
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.toThrow(ABUSE_MIGRATION);
  });

  it('never writes ON CONFLICT DO NOTHING — a collision is refused, not swallowed', async () => {
    const { pool, queries } = stub();
    await enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    });
    const insert = queries.find((q) => /INSERT INTO marketing_asset_embargo/.test(q.sql))!;
    expect(insert.sql).not.toMatch(/ON CONFLICT/);
  });

  it('tells an approver to lift the live entry rather than editing in place', async () => {
    const { pool } = stub({ embargoInsertError: pgErr('23505', 'marketing_asset_embargo_live_idx') });
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-2', state: 'announced', sourceRef: 'minutes/2',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.toMatchObject({ code: 'EMBARGO_ALREADY_LIVE', status: 409 });
  });

  it('reports a repeated event as a collision on the idempotency key', async () => {
    const { pool } = stub({ embargoInsertError: pgErr('23505', 'marketing_asset_embargo_event_idx') });
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.toMatchObject({ code: 'EMBARGO_EVENT_ALREADY_RECORDED' });
  });

  it('explains a rejected slug rather than surfacing a raw 23514', async () => {
    const { pool } = stub({ embargoInsertError: pgErr('23514', 'marketing_asset_embargo_source_ref_check') });
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.toMatchObject({ code: 'EMBARGO_ENTRY_REJECTED', status: 400 });
  });

  it('propagates an unrelated database fault instead of inventing an outcome', async () => {
    const { pool } = stub({ embargoInsertError: pgErr('57014') });
    await expect(enterEmbargo(pool, {
      assetSymbol: 'SOL', eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1',
      reviewInDays: 30, enteredBy: 'monty',
    })).rejects.not.toBeInstanceOf(ActionError);
  });

  it('refuses a second lift, naming who lifted it and when', async () => {
    const { pool } = stub({
      embargoLiftRows: [],
      embargoPrior: [{ lifted_by: 'nik', lifted_at: new Date('2026-08-01T09:00:00.000Z') }],
    });
    await expect(liftEmbargo(pool, { assetSymbol: 'SOL', eventRef: 'e-1', liftedBy: 'monty' }))
      .rejects.toMatchObject({ code: 'EMBARGO_ALREADY_LIFTED', status: 409 });
    await expect(liftEmbargo(pool, { assetSymbol: 'SOL', eventRef: 'e-1', liftedBy: 'monty' }))
      .rejects.toThrow(/nik/);
  });

  it('distinguishes "no such entry" from "already lifted"', async () => {
    const { pool } = stub({ embargoLiftRows: [], embargoPrior: [] });
    await expect(liftEmbargo(pool, { assetSymbol: 'SOL', eventRef: 'e-9', liftedBy: 'monty' }))
      .rejects.toMatchObject({ code: 'EMBARGO_NOT_FOUND', status: 404 });
  });
});

describe('a holdings amendment preserves the declaration it replaces', () => {
  it('chains the new row to the prior one and issues no UPDATE at all', async () => {
    const { pool, queries } = stub({ holdingsCurrent: [{ id: 'dec-old' }] });
    const out = await declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'SOL', holds: true, renewInDays: 90,
      amendmentReason: 'position_opened',
    });
    expect(out.supersededId).toBe('dec-old');
    const insert = queries.find((q) => /INSERT INTO marketing_holdings_declaration/.test(q.sql))!;
    expect(insert.params).toContain('dec-old');
    expect(insert.params).toContain('position_opened');
    // The whole property, in one assertion: nothing overwrites the old value.
    expect(queries.some((q) => /UPDATE marketing_holdings_declaration/.test(q.sql))).toBe(false);
  });

  it('demands a reason for a change to a record with personal liability attached', async () => {
    const { pool } = stub({ holdingsCurrent: [{ id: 'dec-old' }] });
    await expect(declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'SOL', holds: false, renewInDays: 90,
    })).rejects.toMatchObject({ code: 'HOLDINGS_AMENDMENT_REASON_REQUIRED', status: 409 });
  });

  it('refuses a reason when there is nothing to amend', async () => {
    const { pool } = stub({ holdingsCurrent: [] });
    await expect(declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'SOL', holds: false, renewInDays: 90,
      amendmentReason: 'periodic_renewal',
    })).rejects.toMatchObject({ code: 'HOLDINGS_NOTHING_TO_AMEND' });
  });

  it('writes a first declaration with no chain and no reason', async () => {
    const { pool, queries } = stub({ holdingsCurrent: [] });
    const out = await declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'sol', holds: false, renewInDays: 90,
    });
    expect(out).toMatchObject({ supersededId: null, state: 'declared_none' });
    const insert = queries.find((q) => /INSERT INTO marketing_holdings_declaration/.test(q.sql))!;
    // Normalised on the way in, so the join in loadHoldingsStates cannot miss.
    expect(insert.params).toContain('SOL');
    expect(insert.params).toContain(null);
  });

  it('refuses a forked chain instead of letting row order decide', async () => {
    const { pool } = stub({
      holdingsCurrent: [{ id: 'dec-old' }],
      holdingsInsertError: pgErr('23505', 'marketing_holdings_declaration_chain_idx'),
    });
    await expect(declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'SOL', holds: true, renewInDays: 90,
      amendmentReason: 'position_opened',
    })).rejects.toMatchObject({ code: 'HOLDINGS_AMENDED_CONCURRENTLY', status: 409 });
  });

  it('refuses when 0060 is absent rather than losing the declaration', async () => {
    const { pool } = stub({ migrated: false });
    await expect(declareHoldings(pool, {
      memberId: 'nik', assetSymbol: 'SOL', holds: true, renewInDays: 90,
    })).rejects.toMatchObject({ code: 'PERIMETER_UNAVAILABLE', status: 503 });
  });
});

describe('the governed write paths carry ids only, and no machine can author them', () => {
  it('registers three actions on the marketing compartment, embargo work approver-only', () => {
    const byId = new Map(MARKETING_ABUSE_ACTIONS.map((a) => [a.id, a]));
    expect([...byId.keys()].sort()).toEqual([
      'marketing_embargo_enter', 'marketing_embargo_lift', 'marketing_holdings_declare',
    ]);
    for (const a of MARKETING_ABUSE_ACTIONS) {
      expect(a.workspace, a.id).toBe('marketing');
      expect(a.subjectTypes, a.id).toEqual([MARKETING_ASSET_SUBJECT]);
    }
    expect(byId.get('marketing_embargo_enter')!.minRole).toBe('approver');
    expect(byId.get('marketing_embargo_lift')!.minRole).toBe('approver');
    // Self-service: an approver-only declaration would mean the people whose
    // liability it is could not discharge it.
    expect(byId.get('marketing_holdings_declare')!.minRole).toBe('operator');
  });

  it('accepts no prose in any param, and no way to name someone else', () => {
    const declare = MARKETING_ABUSE_ACTIONS.find((a) => a.id === 'marketing_holdings_declare')!;
    // `z.object` strips unknown keys, so a body naming a colleague cannot reach the
    // executor — which reads the actor instead.
    const parsed = declare.paramsSchema.parse({
      holds: true, renewInDays: 30, memberId: 'monty', reason: 'because I said so',
    }) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['holds', 'renewInDays']);

    const enter = MARKETING_ABUSE_ACTIONS.find((a) => a.id === 'marketing_embargo_enter')!;
    for (const prose of ['listing committee said so', 'SOL LISTING', 'a b']) {
      expect(
        enter.paramsSchema.safeParse({
          eventRef: prose, state: 'mnpi_pending', sourceRef: 'minutes/1', reviewInDays: 30,
        }).success,
        prose,
      ).toBe(false);
    }
    expect(enter.paramsSchema.safeParse({
      eventRef: 'listing-committee-2026-07-30', state: 'mnpi_pending',
      sourceRef: 'minutes/2026-07-30', reviewInDays: 30,
    }).success).toBe(true);
    // `unknown` is not a storable state — it is the absence of a row.
    expect(enter.paramsSchema.safeParse({
      eventRef: 'e-1', state: 'unknown', sourceRef: 'minutes/1', reviewInDays: 30,
    }).success).toBe(false);
    expect(EMBARGO_STATES).not.toContain('unknown');
  });

  it('refuses the shared machine key on every one of the three', async () => {
    const { pool } = stub();
    for (const [id, params] of [
      ['marketing_embargo_enter', { eventRef: 'e-1', state: 'mnpi_pending', sourceRef: 'minutes/1', reviewInDays: 30 }],
      ['marketing_embargo_lift', { eventRef: 'e-1' }],
      ['marketing_holdings_declare', { holds: true, renewInDays: 30 }],
    ] as const) {
      for (const actor of ['operator', 'monitor:mon-1', 'ai', 'ext:someone@partner.test']) {
        await expect(
          runAction(id, pool, { subjectId: 'SOL', params: params as Record<string, unknown>, actor }),
          `${id} accepted ${actor}`,
        ).rejects.toMatchObject({ code: 'NAMED_HUMAN_REQUIRED', status: 403 });
      }
    }
  });

  it('records the declaration against the authenticated member, never a param', async () => {
    const { pool, queries } = stub({ holdingsCurrent: [] });
    const out = await runAction('marketing_holdings_declare', pool, {
      subjectId: 'SOL', params: { holds: true, renewInDays: 30, memberId: 'monty' }, actor: 'nik',
    });
    expect(out.memberId).toBe('nik');
    const insert = queries.find((q) => /INSERT INTO marketing_holdings_declaration/.test(q.sql))!;
    expect(insert.params[0]).toBe('nik');
    expect(insert.params).not.toContain('monty');
  });

  it('does not claim an asset is clear just because an entry was lifted', async () => {
    const { pool } = stub({ embargoLiftRows: [{ id: 'emb-1', state: 'mnpi_pending' }] });
    const out = await runAction('marketing_embargo_lift', pool, {
      subjectId: 'SOL', params: { eventRef: 'e-1' }, actor: 'monty',
    });
    expect(out).toMatchObject({ assetIsNowClear: false, liftedState: 'mnpi_pending' });
  });

  it('refuses a subject id that is not an asset symbol', async () => {
    const { pool } = stub();
    await expect(runAction('marketing_embargo_enter', pool, {
      subjectId: 'the SOL listing', params: { eventRef: 'e-1', state: 'clear', sourceRef: 'minutes/1', reviewInDays: 30 },
      actor: 'monty',
    })).rejects.toMatchObject({ code: 'ASSET_SYMBOL_INVALID' });
  });

  it('keeps the amendment reason a closed set, in code and in the schema', () => {
    const declare = MARKETING_ABUSE_ACTIONS.find((a) => a.id === 'marketing_holdings_declare')!;
    for (const r of HOLDINGS_AMENDMENT_REASONS) {
      expect(declare.paramsSchema.safeParse({ holds: true, renewInDays: 30, amendmentReason: r }).success, r).toBe(true);
    }
    expect(declare.paramsSchema.safeParse({
      holds: true, renewInDays: 30, amendmentReason: 'I opened a position last Tuesday',
    }).success).toBe(false);
  });
});
