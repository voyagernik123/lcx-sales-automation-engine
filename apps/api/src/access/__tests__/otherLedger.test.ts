import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { VERDICT_BROKER_CODES } from '../verdictBroker.js';
import {
  EMBARGO_EVENT_REF_RE,
  EMBARGO_SOURCE_REF_RE,
  GPS_LISTING_VERDICT_ENV,
  LISTING_PIPELINE_QUESTION,
  OTHER_LEDGER_CODES,
  type RegisterCounts,
  askListingPipeline,
  askListingPipelineForProject,
  assetSymbolForProject,
  normaliseAssetSymbol,
  proposalSignalEventRef,
  reachesProposal,
  recordProposalListingSignal,
  verdictFromRegisterCounts,
} from '../otherLedger.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE OTHER LEDGER — the listing pipeline and the market-abuse register, joined
 *  on a normalised ticker, readable only as a verdict.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE LIABILITY THESE TESTS DEFEND. MiCA Art 91(3)(c) is PERSONAL liability, from
 * about EUR 700,000, on the named human — not a corporate fine. Today the control
 * that stops one desk naming an asset the other desk is negotiating a listing for is
 * a free-text paragraph. These tests are the specification for replacing it with a
 * mechanism, and they were written before the module because a test written after a
 * fix proves nothing about the fix.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. THE JOIN MATCHES ON NORMALISED VALUES AND ONLY ON NORMALISED VALUES.
 *     `projects.ticker_norm` is `cleanTicker(ticker)` and `asset_symbol` is
 *     CHECK-normalised in 0060, so a stored `sol` can never match `SOL` — and the
 *     silent failure that produces is a conflict check answering "clear" about an
 *     embargoed asset. A denormalised stored value REFUSES rather than queries.
 *  2. THE VALUE IS ALWAYS A BOUND PARAMETER. `asset_symbol` has no Drizzle
 *     definition, so this is raw SQL; the test asserts the symbol is in `params` and
 *     never in the statement text.
 *  3. THE READ IS DEFAULT-DENY ON BOTH ENTRY POINTS AND BOTH STATES ARE EXERCISED.
 *     Flag off is a stable refusal code, not an empty and not a 0, AND NO QUERY RUNS
 *     — including on the entry point that has to resolve a symbol from `projects`
 *     first, which used to read that table before any gate and hand an unentitled
 *     principal a three-way oracle on it.
 *  4. THE VERDICT NEVER CARRIES THE REGISTER'S CONTENTS. Not the state string, not
 *     the event slug, not the minute pointer, not the name of the human who entered
 *     it. But it does READ the state: three of 0060's four states are not a block.
 *  5. INCOHERENT COUNTS REFUSE, AND AN UNPOPULATED REGISTER IS NOT-LOADED. `live >
 *     total` is impossible; a state partition that does not add up means a state
 *     nobody has heard of; and an entirely empty register is not evidence that
 *     nothing is embargoed — 0060 seeds nothing, so that is the DEFAULT state of the
 *     production table.
 *  6. A DEAL REACHING PROPOSAL WRITES THE SIGNAL EXACTLY ONCE, the collision RAISES
 *     rather than being absorbed, and every outcome that is not "this deal's own
 *     entry is live" is a REFUSAL.
 *  7. EVERY REFUSAL IS RETURNED, not the first one found — the house pattern from
 *     `routes/marketingDesk.ts` — and every one carries a code and a rule.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake dispatching on SQL text. They prove which statements are issued
 * with which parameters and all of the interpretation, and NOTHING about whether
 * Postgres agrees with the SQL — including whether the `FILTER` aggregates and the
 * uncorrelated `EXISTS` are accepted, and whether a real 23505 carries the
 * `constraint` field the write path branches on (it does in `pg`; that is read from
 * `abuseRegister.ts`, which relies on the same field, not observed here).
 */

interface Call {
  sql: string;
  params: readonly unknown[];
}

function fakePool(handler: (sql: string, params: readonly unknown[]) => unknown[]) {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: unknown, params?: readonly unknown[]) => {
      const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
      calls.push({ sql: text, params: params ?? [] });
      const rows = handler(text, params ?? []);
      return { rows, rowCount: rows.length };
    },
  } as unknown as pg.Pool;
  return { pool, calls };
}

const missingTable = (rel: string) =>
  Object.assign(new Error(`relation "${rel}" does not exist`), { code: '42P01' });

/** What `pg` raises on a unique violation, including the field the branch reads. */
const uniqueViolation = (constraint: string) =>
  Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: '23505',
    constraint,
  });

const LIVE_IDX = 'marketing_asset_embargo_live_idx';
const EVENT_IDX = 'marketing_asset_embargo_event_idx';

const DEAL = '44444444-4444-4444-8444-444444444444';
const PROJECT = '55555555-5555-4555-8555-555555555555';
const GPS_READER = { gps: 'view' } as const;
const SALES_WRITER = { sales: 'operate' } as const;

/**
 * The row shape `REGISTER_COUNT_SQL` returns. Defaults are "the register has rows,
 * this symbol has none" — a GENUINE absence — so each test states only what it is
 * about, and `register_populated: false` has to be asked for explicitly.
 */
function countRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    register_populated: true,
    total: 0,
    live: 0,
    live_fresh: 0,
    live_fresh_mnpi: 0,
    live_fresh_conditional: 0,
    live_fresh_clear: 0,
    ...over,
  };
}

/** The same defaults for the pure interpreter. */
function rc(over: Partial<RegisterCounts> = {}): RegisterCounts {
  return {
    registerPopulated: true,
    total: 0,
    live: 0,
    liveFresh: 0,
    liveFreshMnpi: 0,
    liveFreshConditional: 0,
    liveFreshClear: 0,
    ...over,
  };
}

afterEach(() => {
  delete process.env[GPS_LISTING_VERDICT_ENV];
});

/* ══ 1 + 2. The join ═════════════════════════════════════════════════════════ */

describe('the ticker join — normalised values only', () => {
  it.each([
    ['SOL', 'SOL'],
    ['sol', 'SOL'],
    ['$sol', 'SOL'],
    ['  sol  ', 'SOL'],
    ['$SOL', 'SOL'],
  ])('normalises %j to %j, matching cleanTicker exactly', (raw, expected) => {
    const out = normaliseAssetSymbol(raw);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.symbol).toBe(expected);
  });

  it.each([
    ['', OTHER_LEDGER_CODES.TICKER_ABSENT],
    ['   ', OTHER_LEDGER_CODES.TICKER_ABSENT],
    [null, OTHER_LEDGER_CODES.TICKER_ABSENT],
    ['$', OTHER_LEDGER_CODES.TICKER_ABSENT],
    ['A'.repeat(21), OTHER_LEDGER_CODES.TICKER_UNUSABLE],
  ])('refuses %j under %s', (raw, code) => {
    const out = normaliseAssetSymbol(raw as string | null);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.code).toBe(code);
    expect(out.rule.length).toBeGreaterThan(20);
  });

  it('accepts exactly 20 characters — the bound 0060 declares, not one less', () => {
    expect(normaliseAssetSymbol('A'.repeat(20)).ok).toBe(true);
  });

  it.each([['$ sol'], ['  $ sol'], ['$\tsol']])(
    'refuses %j, because cleanTicker strips the $ AFTER the trim and leaves the space',
    (raw) => {
      // cleanTicker('$ sol') === ' SOL'. `upper(btrim(' SOL'))` is 'SOL', so ' SOL'
      // fails 0060's CHECK and can never equal a stored asset_symbol. Querying with it
      // would return zero rows, and zero rows on a conflict check reads as "clear".
      // This is the real defect in apps/api/src/import/types.ts, not a contrived input.
      const out = normaliseAssetSymbol(raw);
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error('unreachable');
      expect(out.code).toBe(OTHER_LEDGER_CODES.TICKER_UNUSABLE);
      expect(out.message).toContain('import/types.ts');
    },
  );

  it('does not silently re-normalise a value cleanTicker got wrong', () => {
    // The tempting fix — trim again — would make this function disagree with whatever
    // cleanTicker already wrote into projects.ticker_norm, i.e. two normalisers on one
    // join. So the answer must be a refusal and never ' SOL' quietly repaired to 'SOL'.
    const out = normaliseAssetSymbol('$ sol');
    expect(out.ok).toBe(false);
  });

  it('resolves a project whose ticker_norm is already normalised', async () => {
    const { pool, calls } = fakePool(() => [{ ticker_norm: 'SOL' }]);
    const out = await assetSymbolForProject(pool, PROJECT);
    expect(out.kind).toBe('symbol');
    if (out.kind !== 'symbol') throw new Error('unreachable');
    expect(out.symbol).toBe('SOL');
    // Bound parameter, never interpolated.
    expect(calls[0]?.params).toEqual([PROJECT]);
    expect(calls[0]?.sql).not.toContain(PROJECT);
  });

  it('REFUSES a project whose stored ticker_norm is not normalised — it would never match', async () => {
    // This is the silent miss the whole group exists for. `sol` is a legal value in
    // `projects.ticker_norm` (no CHECK enforces the normalisation) and it can never
    // equal any `asset_symbol`, which IS CHECK-normalised. Querying with it returns
    // zero rows and that zero would read as "no embargo".
    const { pool } = fakePool(() => [{ ticker_norm: 'sol' }]);
    const out = await assetSymbolForProject(pool, PROJECT);
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.code).toBe(OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED);
    expect(out.message).toContain('0072');
  });

  it.each([['$sol'], [' SOL'], ['SOL ']])(
    'refuses stored ticker_norm %j rather than silently missing the join',
    async (stored) => {
      const { pool } = fakePool(() => [{ ticker_norm: stored }]);
      const out = await assetSymbolForProject(pool, PROJECT);
      expect(out.kind === 'refused' && out.code).toBe(OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED);
    },
  );

  it.each([['SOL\t', 'a TAB'], ['SOL\v', 'a VERTICAL TAB'], ['SOL\f', 'a FORM FEED'], ['SOL\n', 'a NEWLINE']])(
    'refuses a stored ticker_norm padded with %j (%s) — the cases 0072\'s predicate kept missing',
    async (stored) => {
      // JS `.trim()` strips all of these; Postgres `btrim(x)` with no second argument strips
      // SPACES ONLY. So each value is refused here and was INVISIBLE to the detector index
      // until its predicate named the whitespace set explicitly. The VERTICAL TAB is the one
      // that survived the first fix as well: the set was written E'\v', and Postgres does not
      // define \v as an escape — "any other character following a backslash is taken
      // literally" — so E'\v' is the LETTER v and U+000B was still not in the set. Pinned
      // here and, for the SQL side, in the 0072 group at the bottom of this file.
      const { pool } = fakePool(() => [{ ticker_norm: stored }]);
      const out = await assetSymbolForProject(pool, PROJECT);
      expect(out.kind === 'refused' && out.code).toBe(OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED);
    },
  );

  it('reports a project with no ticker as an ABSENCE that carries a code, a message and a rule', async () => {
    const noTicker = fakePool(() => [{ ticker_norm: null }]);
    const absent = await assetSymbolForProject(noTicker.pool, PROJECT);
    expect(absent.kind).toBe('no_ticker');
    if (absent.kind !== 'no_ticker') throw new Error('unreachable');
    // It used to be `{ kind: 'no_ticker' }` and NOTHING ELSE: one property, nothing to
    // alert on, nothing to register in ABSENCES.md, and the easiest thing in the world
    // for a conflict check to fall through as "nothing to check, clear".
    expect(Object.keys(absent).sort()).toEqual(['code', 'kind', 'message', 'rule']);
    expect(absent.code).toBe(OTHER_LEDGER_CODES.TICKER_ABSENT);
    expect(absent.rule.length).toBeGreaterThan(20);
    expect(absent.message.toLowerCase()).toContain('not a project whose asset is clear');

    const noProject = fakePool(() => []);
    const out = await assetSymbolForProject(noProject.pool, PROJECT);
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.code).toBe(OTHER_LEDGER_CODES.PROJECT_UNKNOWN);
  });

  it('reports a missing projects relation as not-loaded, never as "no ticker"', async () => {
    const { pool } = fakePool(() => {
      throw missingTable('projects');
    });
    const out = await assetSymbolForProject(pool, PROJECT);
    expect(out.kind === 'refused' && out.code).toBe(OTHER_LEDGER_CODES.REGISTER_UNAVAILABLE);
  });

  it.each([['not-a-uuid'], [''], ['  '], ['55555555-5555-4555-8555'], [undefined]])(
    'refuses a malformed projectId (%j) WITHOUT claiming the table could not be read',
    async (bad) => {
      // A non-uuid used to reach `WHERE id = $1`, raise 22P02, and be reported as
      // REGISTER_UNAVAILABLE — "The projects table could not be read". That sentence was
      // FALSE (the table was fine, the input was bad) and it made a real unmigrated
      // database indistinguishable from a typo.
      const { pool, calls } = fakePool(() => {
        throw Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' });
      });
      const out = await assetSymbolForProject(pool, bad as unknown as string);
      expect(out.kind).toBe('refused');
      if (out.kind !== 'refused') throw new Error('unreachable');
      expect(out.code).toBe(OTHER_LEDGER_CODES.PROJECT_ID_UNUSABLE);
      expect(out.message).not.toContain('could not be read');
      expect(calls).toEqual([]);
    },
  );
});

/* ══ 3 + 4. The read, verdict-only, default-deny ══════════════════════════════ */

describe('GPS asks the listing pipeline — default-deny until the owner decides', () => {
  /** A register that holds a live, fresh MNPI embargo and every string that must not travel. */
  const registerHolds = () => fakePool(() => [countRow({
    total: 3, live: 1, live_fresh: 1, live_fresh_mnpi: 1,
    // Deliberately present in the fake row: if a refactor ever returns the row
    // instead of the counts, group 4 fails.
    event_ref: 'listing-committee-2026-07-30',
    source_ref: 'minute:listing-cmte/2026-07-30#4',
    entered_by: 'monty',
    state: 'mnpi_pending',
  })]);

  it('flag OFF: a stable refusal code, no query, and NOT an empty', async () => {
    const { pool, calls } = registerHolds();
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    expect(answer.message).toContain(GPS_LISTING_VERDICT_ENV);
    expect(calls).toEqual([]);
    // The three states, at the JSON boundary a route would cross.
    const json = JSON.parse(JSON.stringify(answer)) as Record<string, unknown>;
    expect('withheldCount' in json).toBe(false);
    expect('verdict' in json).toBe(false);
  });

  it('flag ON: a verdict and a visible withheld count', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = registerHolds();
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });

    expect(answer.kind).toBe('withheld');
    if (answer.kind !== 'withheld') throw new Error('unreachable');
    expect(answer.verdict).toBe('restricted');
    expect(answer.withheldCount).toBe(3);
    // Bound parameter; the symbol is never in the statement text.
    expect(calls[0]?.params).toEqual(['SOL']);
    expect(calls[0]?.sql).not.toContain('SOL');
    expect(calls[0]?.sql).toContain('marketing_asset_embargo');
    // The state is read in SQL, per bucket, and never selected as a value.
    expect(calls[0]?.sql).toContain("state = 'mnpi_pending'");
    expect(calls[0]?.sql).not.toMatch(/SELECT[^)]*\bstate\b\s*(,|FROM)/i);
  });

  it('normalises the symbol before the query, so `$sol` and `SOL` are one question', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = registerHolds();
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: '$sol ' });
    expect(answer.kind).toBe('withheld');
    expect(calls[0]?.params).toEqual(['SOL']);
  });

  it('carries none of the register\'s contents, at any depth or through JSON', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool } = registerHolds();
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });
    const json = JSON.stringify(answer).toLowerCase();
    for (const secret of ['listing-committee-2026-07-30', 'minute:', 'monty', 'mnpi_pending']) {
      expect(json).not.toContain(secret);
    }
  });

  it('refuses a GPS-less caller even with the flag on, and does not look', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = fakePool(() => {
      throw new Error('must not query for an unentitled asker');
    });
    const answer = await askListingPipeline(pool, { entitlements: {}, symbol: 'SOL' });
    expect(answer.kind === 'not_loaded' && answer.code).toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
    expect(calls).toEqual([]);
  });

  it('a register that has not been migrated is not-loaded, never "clear"', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool } = fakePool(() => {
      throw missingTable('marketing_asset_embargo');
    });
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });
    expect(answer.kind === 'not_loaded' && answer.code).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
  });

  it('AN UNPOPULATED REGISTER IS NOT-LOADED, not a genuine absence', async () => {
    // THE DEFECT THIS TEST EXISTS FOR, and it was the default answer for every asset on
    // the current production database: 0060 seeds nothing, so `marketing_asset_embargo`
    // is empty. `total === 0` used to map to `empty` — withheldCount 0, verdict null,
    // and a message asserting "This is a genuine absence observed at the instant on the
    // frame below", complete with an ObservationFrame and an environment label. A GPS
    // conflict check reads that as clear. The file that owns the table already refuses
    // in exactly this situation (abuseRegister.ts:399-410, cause 'register_empty').
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool } = fakePool(() => [countRow({ register_populated: false })]);
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
    // NOT-LOADED has no count to misread, at the JSON boundary as well as in the type.
    const json = JSON.parse(JSON.stringify(answer)) as Record<string, unknown>;
    expect('withheldCount' in json).toBe(false);
    expect('verdict' in json).toBe(false);
  });

  it('genuinely empty: the register HAS rows, and none of them is about this symbol', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool } = fakePool(() => [countRow({ register_populated: true, total: 0 })]);
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'SOL' });
    expect(answer.kind).toBe('empty');
    if (answer.kind !== 'empty') throw new Error('unreachable');
    expect(answer.withheldCount).toBe(0);
    expect(answer.verdict).toBeNull();
    expect(answer.observed.holderTable).toBe('marketing_asset_embargo');
  });

  it('an unusable symbol refuses under the ledger\'s own code, not the broker\'s', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = fakePool(() => []);
    const answer = await askListingPipeline(pool, { entitlements: GPS_READER, symbol: 'A'.repeat(21) });
    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.SUBJECT_UNUSABLE);
    expect(answer.message).toContain(OTHER_LEDGER_CODES.TICKER_UNUSABLE);
    expect(calls).toEqual([]);
  });
});

describe('asking about a deal\'s project rather than a bare symbol', () => {
  it('resolves the project, then answers verdict-only', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = fakePool((sql) =>
      /FROM projects/i.test(sql)
        ? [{ ticker_norm: 'SOL' }]
        : [countRow({ total: 1, live: 1, live_fresh: 1, live_fresh_mnpi: 1 })]);

    const out = await askListingPipelineForProject(pool, {
      entitlements: GPS_READER,
      projectId: PROJECT,
    });

    expect(out.kind).toBe('answer');
    if (out.kind !== 'answer') throw new Error('unreachable');
    expect(out.answer.kind === 'withheld' && out.answer.verdict).toBe('restricted');
    // Two reads: the project's own compartment, then the register — the second bound
    // to the value the first produced, never to anything the caller typed.
    expect(calls).toHaveLength(2);
    expect(calls[1]?.params).toEqual(['SOL']);
  });

  it('refuses on a denormalised ticker_norm WITHOUT touching the register', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = fakePool((sql) => {
      if (/FROM projects/i.test(sql)) return [{ ticker_norm: 'sol' }];
      throw new Error('the register must not be read with a value that cannot match');
    });

    const out = await askListingPipelineForProject(pool, {
      entitlements: GPS_READER,
      projectId: PROJECT,
    });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusal.code).toBe(OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED);
    expect(calls).toHaveLength(1);
  });

  it('reports a project with no ticker as no_ticker WITH a code, not as an answer of "clear"', async () => {
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool } = fakePool(() => [{ ticker_norm: null }]);
    const out = await askListingPipelineForProject(pool, {
      entitlements: GPS_READER,
      projectId: PROJECT,
    });
    expect(out.kind).toBe('no_ticker');
    if (out.kind !== 'no_ticker') throw new Error('unreachable');
    expect(out.code).toBe(OTHER_LEDGER_CODES.TICKER_ABSENT);
    expect(out.rule.length).toBeGreaterThan(20);
  });

  /* ── THE GATE ORDER, ON THIS ENTRY POINT TOO ────────────────────────────────
   *
   * This is the hole these three tests close. `askListingPipelineForProject` used to
   * read `projects` BEFORE any entitlement check and before the default-deny flag, so
   * a principal holding ZERO compartments learned, from the refusal shape alone,
   * whether a project id exists, whether it has a ticker, and whether its ticker_norm
   * is denormalised. The module's central claim — "entitlement is decided BEFORE any
   * query" — held for the bare-symbol entry point and not for this one.
   *
   * The fake pool THROWS on any query, so "nothing was read" is proved by the call log
   * AND by the absence of an exception.
   */
  it('flag OFF: refuses before reading projects at all', async () => {
    const { pool, calls } = fakePool(() => {
      throw new Error('projects must not be read before the gates');
    });
    const out = await askListingPipelineForProject(pool, {
      entitlements: GPS_READER,
      projectId: PROJECT,
    });

    expect(out.kind).toBe('answer');
    if (out.kind !== 'answer') throw new Error('unreachable');
    expect(out.answer.kind === 'not_loaded' && out.answer.code)
      .toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    expect(calls).toEqual([]);
  });

  it.each([
    ['an unknown project', () => [] as unknown[]],
    ['a denormalised ticker_norm', () => [{ ticker_norm: 'sol' }]],
    ['a project with no ticker', () => [{ ticker_norm: null }]],
  ])('an unentitled principal learns nothing about %s', async (_label, rows) => {
    // Flag deliberately ON, so the ONLY thing refusing is the asker's own entitlement,
    // and the code proves which gate fired.
    process.env[GPS_LISTING_VERDICT_ENV] = '1';
    const { pool, calls } = fakePool(rows);
    const out = await askListingPipelineForProject(pool, {
      entitlements: {},
      projectId: PROJECT,
    });

    expect(out.kind).toBe('answer');
    if (out.kind !== 'answer') throw new Error('unreachable');
    expect(out.answer.kind === 'not_loaded' && out.answer.code)
      .toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
    // The three fixtures used to produce three DIFFERENT answers here. They now produce
    // one, and no query ran to distinguish them.
    expect(calls).toEqual([]);
  });
});

/* ══ 5. The counts ═══════════════════════════════════════════════════════════ */

describe('the verdict is derived from counts and RECORDED STATES, and only from coherent ones', () => {
  it.each([
    ['live, fresh, mnpi_pending', rc({ total: 3, live: 1, liveFresh: 1, liveFreshMnpi: 1 }), 'restricted', 3],
    ['live, fresh, announced or exempt_offer',
      rc({ total: 3, live: 1, liveFresh: 1, liveFreshConditional: 1 }), 'conditional', 3],
    ['live, fresh, clear', rc({ total: 2, live: 1, liveFresh: 1, liveFreshClear: 1 }), 'clear_on_record', 2],
    ['live but past review_by or window', rc({ total: 3, live: 1 }), 'stale_unresolved', 3],
    ['history only, nothing in force', rc({ total: 2 }), 'history_only', 2],
  ])('%s → %s', (_label, counts, verdict, count) => {
    const out = verdictFromRegisterCounts(counts);
    expect(out.kind).toBe('holding');
    if (out.kind !== 'holding') throw new Error('unreachable');
    expect(out.verdict).toBe(verdict);
    expect(out.withheldCount).toBe(count);
  });

  it('A LIVE `clear` ROW IS NOT REPORTED AS RESTRICTED', () => {
    // The defect this test exists for. `REGISTER_COUNT_SQL` had no state filter, so ANY
    // live in-window row produced `restricted` — "the asset may not be named". 0060
    // allows four states and `clear` means "publicly announced, or never inside
    // information": it is the register's way of saying the asset CAN be named. Since a
    // `clear` row is never lifted (it is the current truth), every asset the desk had
    // ever marked clear read as restricted until its review_by passed.
    const out = verdictFromRegisterCounts(rc({ total: 1, live: 1, liveFresh: 1, liveFreshClear: 1 }));
    expect(out.kind === 'holding' && out.verdict).toBe('clear_on_record');
    expect(out.kind === 'holding' && out.verdict).not.toBe('restricted');
  });

  it('mnpi_pending WINS when a live clear row is somehow alongside it', () => {
    // 0060's live index permits only one live row per asset, so this shape should be
    // impossible. If it arrives anyway, the answer must be the restricting one.
    const out = verdictFromRegisterCounts(
      rc({ total: 2, live: 2, liveFresh: 2, liveFreshMnpi: 1, liveFreshClear: 1 }),
    );
    expect(out.kind === 'holding' && out.verdict).toBe('restricted');
  });

  it('an unpopulated register is UNAVAILABLE, never a genuine absence', () => {
    const out = verdictFromRegisterCounts(rc({ registerPopulated: false }));
    expect(out.kind).toBe('unavailable');
    if (out.kind !== 'unavailable') throw new Error('unreachable');
    // The detail is what an operator acts on, and the three jobs behind one NOT-LOADED code
    // (not migrated / migrated but never filled in / the read failed) are different people.
    expect(out.detail).toBe('register_empty');
    // And the two facts are not derived from each other: a populated register with no
    // row for this symbol IS a genuine absence.
    expect(verdictFromRegisterCounts(rc({ registerPopulated: true })).kind).toBe('none');
  });

  it('"the table is empty" contradicting "this symbol has rows" does not assert either cause', () => {
    // One statement produces both numbers — an uncorrelated EXISTS and a filtered count —
    // so they cannot disagree unless the query and the interpreter mean different things.
    // The answer is still unavailable, but the detail must NOT say `register_empty`: the
    // other number contradicts that cause, and naming it anyway is an inference published
    // as the observation, which sends the wrong operator at the wrong problem.
    const out = verdictFromRegisterCounts(rc({ registerPopulated: false, total: 2 }));
    expect(out.kind).toBe('unavailable');
    if (out.kind !== 'unavailable') throw new Error('unreachable');
    expect(out.detail).not.toBe('register_empty');
    expect(out.detail).toContain('contradicts');
  });

  it.each([
    ['live exceeds total', rc({ total: 1, live: 2 })],
    ['fresh exceeds live', rc({ total: 3, live: 1, liveFresh: 2, liveFreshMnpi: 2 })],
    ['negative', rc({ total: -1 })],
    ['fractional', rc({ total: 1.5, live: 1, liveFresh: 1, liveFreshMnpi: 1 })],
    ['NaN', rc({ total: Number.NaN })],
    ['state buckets under-count the live entries', rc({ total: 1, live: 1, liveFresh: 1 })],
    ['state buckets over-count the live entries',
      rc({ total: 1, live: 1, liveFresh: 1, liveFreshMnpi: 1, liveFreshClear: 1 })],
  ])('%s is unavailable, never interpreted', (_label, counts) => {
    const out = verdictFromRegisterCounts(counts);
    expect(out.kind).toBe('unavailable');
  });

  it('a state 0060 does not declare cannot be bucketed into `clear`', () => {
    // The partition check is the guard against a FIFTH state being added to 0060 in a
    // year's time: the three buckets cover exactly the four legal states, so a row this
    // function has never heard of makes the sum wrong and the answer NOT-LOADED, rather
    // than silently falling through to the least restrictive verdict.
    const out = verdictFromRegisterCounts(rc({ total: 1, live: 1, liveFresh: 1 }));
    expect(out.kind).toBe('unavailable');
    if (out.kind !== 'unavailable') throw new Error('unreachable');
    expect(out.detail).toContain('partition');
  });

  it('a stale live row is NOT reported as clear — 0060 says a passed window is unknown', () => {
    // 0060: "An embargo is not lifted by the calendar; it is lifted by a named human."
    // So `live > 0, liveFresh === 0` must never map to history_only or to none.
    const out = verdictFromRegisterCounts(rc({ total: 1, live: 1 }));
    expect(out.kind === 'holding' && out.verdict).toBe('stale_unresolved');
  });
});

/* ══ 6 + 7. The write ════════════════════════════════════════════════════════ */

describe('a deal reaching proposal writes the embargo signal', () => {
  const input = {
    dealId: DEAL,
    ticker: 'sol',
    enteredBy: 'monty',
    sourceRef: 'deal:44444444-4444-4444-8444-444444444444/proposal',
    reviewInDays: 14,
  };

  it('derives an event_ref that satisfies 0060\'s CHECK', () => {
    const ref = proposalSignalEventRef(DEAL);
    expect(EMBARGO_EVENT_REF_RE.test(ref)).toBe(true);
    expect(ref).toContain(DEAL);
  });

  it('writes exactly one row, with the normalised symbol and mnpi_pending, and NO ON CONFLICT', async () => {
    const inserts: Call[] = [];
    const { pool, calls } = fakePool((sql) => {
      if (/INSERT INTO marketing_asset_embargo/i.test(sql)) {
        inserts.push({ sql, params: [] });
        return [{ id: 'row-1', review_by: new Date('2026-08-20T00:00:00Z') }];
      }
      return [];
    });

    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('recorded');
    if (out.kind !== 'recorded') throw new Error('unreachable');
    expect(out.assetSymbol).toBe('SOL');
    expect(inserts).toHaveLength(1);
    const p = calls[0]?.params ?? [];
    expect(p[0]).toBe('SOL');                       // normalised, bound
    expect(p[1]).toBe(proposalSignalEventRef(DEAL)); // the idempotency key
    expect(p[2]).toBe(input.sourceRef);
    expect(p[3]).toBe('monty');
    expect(p[4]).toBe(14);
    // The state is a literal in the statement, not caller-supplied: a deal reaching
    // proposal means unpublished price-significant information exists, full stop.
    expect(calls[0]?.sql).toContain('mnpi_pending');
    expect(calls[0]?.sql).not.toContain('SOL');
    // THE PROHIBITION, PINNED. `marketing/abuseRegister.ts:1190-1198` states it in the
    // file that owns this table: "NO `ON CONFLICT DO NOTHING` ANYWHERE IN THIS FILE",
    // with the reply-ingest incident as the reason — a write absorbed and then explained
    // by a COUNT. The collision must raise and be branched on instead.
    expect(calls[0]?.sql).not.toMatch(/ON\s+CONFLICT/i);
  });

  it('is idempotent: the collision RAISES, and this deal\'s own LIVE entry is reported present', async () => {
    let insertAttempts = 0;
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO marketing_asset_embargo/i.test(sql)) {
        insertAttempts += 1;
        // A repeat write on our own live row violates BOTH of 0060's unique indexes and
        // Postgres reports only one of them — here the live index. So the constraint name
        // alone cannot distinguish this from a foreign live entry, which is why the row
        // itself is read.
        throw uniqueViolation(LIVE_IDX);
      }
      return [{ live: true }];
    });

    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('already_recorded');
    if (out.kind !== 'already_recorded') throw new Error('unreachable');
    expect(out.assetSymbol).toBe('SOL');
    expect(insertAttempts).toBe(1);
  });

  it('A LIFTED entry of our own is a REFUSAL, not "already recorded"', async () => {
    // THE DEFECT THIS TEST EXISTS FOR. The cause used to be a COUNT with no
    // `lifted_at IS NULL` filter, and 0060's (asset_symbol, event_ref) index INCLUDES
    // lifted rows — so once a named human lifted this deal's own entry, every later call
    // said "This exact signal was already recorded" while NO embargo was in force, and
    // the insert could never succeed again. Three states in one non-refusal.
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw uniqueViolation(EVENT_IDX);
      return [{ live: false, asset_live: false }];
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toEqual([OTHER_LEDGER_CODES.SIGNAL_LIFTED_NOT_IN_FORCE]);
    // The perimeter really IS open in this fixture — nothing else holds the asset — so the
    // message says so. The next two tests are the states where it must NOT say so.
    expect(out.refusals[0]?.message.toUpperCase()).toContain('PERIMETER IS OPEN');
    // And it names which index refused — observed from the error, not inferred.
    expect(out.refusals[0]?.message).toContain(EVENT_IDX);
  });

  it('a LIFTED entry of our own WITH a foreign live entry does NOT claim the perimeter is open', async () => {
    // THE LIE THE PREVIOUS FIX INTRODUCED. `explainSignalCollision` read our own row only
    // and then asserted, of a lifted one, "no embargo is in force and the asset can be
    // named… the perimeter is OPEN". 0060 requires a NEW event for every state change, so
    // "marketing lifted this deal's entry and entered its own" is the ORDINARY sequence —
    // and in that state a different live entry holds the asset while our row is history.
    // The refusal still stopped the deal, so nothing unsafe shipped; what shipped was a
    // certainty about the asset that had not been observed. Both facts are now read in one
    // statement and BOTH refusals are returned, per "every refusal, not the first one".
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw uniqueViolation(EVENT_IDX);
      return [{ live: false, asset_live: true }];
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toEqual([
      OTHER_LEDGER_CODES.SIGNAL_LIFTED_NOT_IN_FORCE,
      OTHER_LEDGER_CODES.SIGNAL_BLOCKED_BY_LIVE_ENTRY,
    ]);
    // NEGATIVE assertion on the exact claim that was false. Note it is a SUBSTRING check,
    // so a message that hedges the phrase ("this is not a report that the perimeter is
    // open") fails it too — deliberately: the phrase must not be in a string an operator
    // greps or an alert matches on, whatever the surrounding grammar does with it.
    expect(out.refusals[0]?.message.toUpperCase()).not.toContain('PERIMETER IS OPEN');
    expect(out.refusals[0]?.message).toContain('NOT free to be named');
    expect(out.refusals[1]?.message).toContain('DIFFERENT event');
  });

  it('a LIFTED entry whose asset-wide liveness was NOT observed says UNKNOWN, not "open"', async () => {
    // not-observed is a third state and it is not `false`. A row shape that does not carry
    // `asset_live` is a code-level disagreement, not a fact about the register, and reading
    // the missing boolean as "nothing else is live" is how the false clean returns.
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw uniqueViolation(EVENT_IDX);
      return [{ live: false }];
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toEqual([OTHER_LEDGER_CODES.SIGNAL_LIFTED_NOT_IN_FORCE]);
    expect(out.refusals[0]?.message.toUpperCase()).toContain('UNKNOWN');
    expect(out.refusals[0]?.message.toUpperCase()).not.toContain('PERIMETER IS OPEN');
  });

  it('asks for both booleans in ONE statement, and never selects lifted_at or lifted_by', async () => {
    // The date and the name of whoever lifted an entry belong to the marketing
    // compartment; this function runs for a sales caller, so only the FACTS of liveness
    // are read. And it is one round trip, not two — the second read is what the
    // abuseRegister prohibition is about.
    const { pool, calls } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw uniqueViolation(EVENT_IDX);
      return [{ live: false, asset_live: false }];
    });
    await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(calls).toHaveLength(2);
    const cause = calls[1]?.sql ?? '';
    expect(cause).toContain('lifted_at IS NULL');
    expect(cause).not.toMatch(/\blifted_by\b/);
    expect(cause).not.toMatch(/SELECT\s+lifted_at\b/i);
    // Both facts, one statement, bound parameters only.
    expect(cause).toMatch(/asset_live/);
    expect(calls[1]?.params).toEqual(['SOL', proposalSignalEventRef(DEAL)]);
    expect(cause).not.toContain('SOL');
  });

  it('a DIFFERENT live entry blocks the write, and that is a REFUSAL and not a success', async () => {
    // THE OTHER HALF OF THE SAME DEFECT. 0060's live index is UNIQUE on (asset_symbol)
    // WHERE lifted_at IS NULL, so at most one live row per asset — which means for an
    // asset already in a listing process, this deal's own signal is NOT written and can
    // NEVER be written while the other entry lives. It used to return the ok-shaped
    // `already_restricted`, which routes/deals.ts would read as "fine, proceed": the deal
    // advances behind somebody else's row, that row gets lifted, and there is no record
    // anywhere that any deal reached proposal on this asset.
    const { pool, calls } = fakePool((sql) =>
      /INSERT INTO/i.test(sql) ? (() => { throw uniqueViolation(LIVE_IDX); })() : []);
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.SIGNAL_BLOCKED_BY_LIVE_ENTRY);
    expect(out.refusals[0]?.message).toContain(LIVE_IDX);
    // One insert attempt, one row read, and nothing written for this deal.
    expect(calls).toHaveLength(2);
  });

  it('two successive calls on a foreign live entry both refuse — the retry can never win', async () => {
    const { pool } = fakePool((sql) =>
      /INSERT INTO/i.test(sql) ? (() => { throw uniqueViolation(LIVE_IDX); })() : []);
    const first = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    const second = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    for (const out of [first, second]) {
      expect(out.kind).toBe('refused');
      if (out.kind !== 'refused') throw new Error('unreachable');
      expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.SIGNAL_BLOCKED_BY_LIVE_ENTRY);
    }
  });

  it('a collision under an index 0060 does not declare is UNCONFIRMED, not "blocked by a live entry"', async () => {
    // "No row of our own exists, therefore a foreign LIVE entry blocked us" is sound only
    // while 0060's two unique indexes are the only candidates. A third one added in a
    // year's time would turn that step into an inference stated as a certainty — the exact
    // move this lane exists to remove — so an unrecognised constraint name refuses instead
    // of naming a cause it did not observe. The deal stops either way; what changes is
    // whether an operator is sent after the right thing.
    const { pool } = fakePool((sql) =>
      /INSERT INTO/i.test(sql) ? (() => { throw uniqueViolation('marketing_asset_embargo_pkey'); })() : []);
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toEqual([OTHER_LEDGER_CODES.SIGNAL_WRITE_UNCONFIRMED]);
    expect(out.refusals[0]?.message).toContain('marketing_asset_embargo_pkey');
    expect(out.refusals[0]?.message.toUpperCase()).toContain('UNKNOWN');
  });

  it('a collision with NO constraint name and no row of our own still names the live index', async () => {
    // `pg` does carry `constraint` on a 23505, but it is not guaranteed by the driver's
    // types. With nothing reported there is exactly one explanation left, so it is stated.
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      return [];
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toEqual([OTHER_LEDGER_CODES.SIGNAL_BLOCKED_BY_LIVE_ENTRY]);
  });

  it('a collision whose cause cannot be re-read is UNCONFIRMED, never success', async () => {
    const { pool } = fakePool((sql) => {
      if (/INSERT INTO/i.test(sql)) throw uniqueViolation(LIVE_IDX);
      throw missingTable('marketing_asset_embargo');
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.SIGNAL_WRITE_UNCONFIRMED);
  });

  it('an INSERT that raises nothing and returns nothing is UNCONFIRMED, never success', async () => {
    const { pool } = fakePool(() => []);
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.SIGNAL_WRITE_UNCONFIRMED);
  });

  it('a missing register is a refusal, never a silent skip', async () => {
    const { pool } = fakePool(() => {
      throw missingTable('marketing_asset_embargo');
    });
    const out = await recordProposalListingSignal(pool, { entitlements: SALES_WRITER, ...input });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.REGISTER_UNAVAILABLE);
  });

  it('returns EVERY refusal, not the first one found', async () => {
    const { pool, calls } = fakePool(() => []);
    const out = await recordProposalListingSignal(pool, {
      entitlements: {},                 // not entitled
      dealId: 'not-a-uuid',             // unusable deal id
      ticker: '',                       // absent ticker
      enteredBy: 'operator',            // a machine cannot be the accountable human
      sourceRef: 'Minute With Spaces',  // fails 0060's regex
      reviewInDays: 0,                  // outside the accepted window
    });

    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    const codes = out.refusals.map((r) => r.code);
    expect(codes).toContain(OTHER_LEDGER_CODES.WRITER_NOT_ENTITLED);
    expect(codes).toContain(OTHER_LEDGER_CODES.DEAL_ID_UNUSABLE);
    expect(codes).toContain(OTHER_LEDGER_CODES.TICKER_ABSENT);
    expect(codes).toContain(OTHER_LEDGER_CODES.SIGNAL_AUTHOR_NOT_HUMAN);
    expect(codes).toContain(OTHER_LEDGER_CODES.SOURCE_REF_UNUSABLE);
    expect(codes).toContain(OTHER_LEDGER_CODES.REVIEW_WINDOW_UNUSABLE);
    expect(codes.length).toBe(new Set(codes).size);   // deduplicated by code
    for (const r of out.refusals) expect(r.rule.length).toBeGreaterThan(20);
    // Nothing was attempted while any input was refused.
    expect(calls).toEqual([]);
  });

  it('absent text inputs REFUSE and do not throw', async () => {
    // The types say `string`. An HTTP boundary does not honour them, and a TypeError out
    // of this module is a 500 with no code from the one place whose thesis is codes.
    const { pool, calls } = fakePool(() => []);
    const out = await recordProposalListingSignal(pool, {
      entitlements: SALES_WRITER,
      dealId: undefined as unknown as string,
      ticker: undefined as unknown as string,
      enteredBy: undefined as unknown as string,
      sourceRef: undefined as unknown as string,
      reviewInDays: 14,
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    const codes = out.refusals.map((r) => r.code);
    expect(codes).toContain(OTHER_LEDGER_CODES.DEAL_ID_UNUSABLE);
    expect(codes).toContain(OTHER_LEDGER_CODES.TICKER_ABSENT);
    expect(codes).toContain(OTHER_LEDGER_CODES.SIGNAL_AUTHOR_NOT_HUMAN);
    expect(codes).toContain(OTHER_LEDGER_CODES.SOURCE_REF_UNUSABLE);
    expect(calls).toEqual([]);
  });

  it.each([
    ['operator'], ['ai'], ['monitor:x'], ['UNASSIGNED'], ['unassigned'], ['  '],
    // CASE-FOLDED. The UNASSIGNED test was already `toUpperCase()`d and the machine test
    // was not, so these four were ACCEPTED as the accountable human on a market-abuse
    // signal while the refusal message claimed the opposite in plain words.
    ['Operator'], ['OPERATOR'], ['AI'], ['Ai'], ['Monitor:x'], ['MONITOR:X'],
  ])('refuses %j as the accountable human', async (enteredBy) => {
    const { pool } = fakePool(() => []);
    const out = await recordProposalListingSignal(pool, {
      entitlements: SALES_WRITER, ...input, enteredBy,
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('unreachable');
    expect(out.refusals.map((r) => r.code)).toContain(OTHER_LEDGER_CODES.SIGNAL_AUTHOR_NOT_HUMAN);
  });

  it('accepts a second-tier `ext:` colleague — a shared passcode is still a name', async () => {
    const { pool } = fakePool((sql) =>
      /INSERT INTO/i.test(sql) ? [{ id: 'row-1', review_by: new Date() }] : []);
    const out = await recordProposalListingSignal(pool, {
      entitlements: SALES_WRITER, ...input, enteredBy: 'ext:nikhil.sharma',
    });
    expect(out.kind).toBe('recorded');
  });

  it('pins the source_ref regex against 0060 rather than inventing one', () => {
    expect(EMBARGO_SOURCE_REF_RE.test('deal:abc/proposal')).toBe(true);
    expect(EMBARGO_SOURCE_REF_RE.test('Minute With Spaces')).toBe(false);
    expect(EMBARGO_SOURCE_REF_RE.test('-leading-dash')).toBe(false);
  });
});

describe('which transitions reach proposal', () => {
  it.each([
    ['discovery', 'proposal', true],
    ['not_started', 'proposal', true],
    ['discovery', 'negotiating', true],   // skipped the stage, reached the state
    ['contacted', 'won', true],
    ['proposal', 'negotiating', false],   // already signalled on the way in
    ['proposal', 'proposal', false],
    ['negotiating', 'won', false],
    ['discovery', 'lost', false],
    ['proposal', 'lost', false],
    ['discovery', 'contacted', false],
  ])('%s → %s is %s', (from, to, expected) => {
    expect(reachesProposal(from as never, to as never)).toBe(expected);
  });

  it('excludes `lost` deliberately, because STAGE_ORDER ranks it alongside `won`', () => {
    // packages/shared/src/deals/index.ts:93 gives `lost` the same rank as `won` (5), so
    // any order-based rule would have signalled every deal that died in discovery. That
    // table is module-private, which is the other reason this file duplicates the list.
    expect(reachesProposal('not_started', 'lost')).toBe(false);
  });
});

describe('the question is declared once, and declares its own absences', () => {
  it('names the compartments, the table and the variable that authorises it', () => {
    expect(LISTING_PIPELINE_QUESTION.asker).toBe('gps');
    expect(LISTING_PIPELINE_QUESTION.holder).toBe('marketing');
    expect(LISTING_PIPELINE_QUESTION.holderTable).toBe('marketing_asset_embargo');
    expect(LISTING_PIPELINE_QUESTION.authorisationEnvVar).toBe(GPS_LISTING_VERDICT_ENV);
    expect(LISTING_PIPELINE_QUESTION.doesNotCapture.length).toBeGreaterThan(2);
    expect(LISTING_PIPELINE_QUESTION.rule).toMatch(/Art\s*9[01]/);
  });

  it('is off by default in a clean environment', () => {
    expect(LISTING_PIPELINE_QUESTION.authorised()).toBe(false);
  });

  it.each([['1'], ['true'], ['TRUE'], ['yes']])('is on for %j', (value) => {
    process.env[GPS_LISTING_VERDICT_ENV] = value;
    expect(LISTING_PIPELINE_QUESTION.authorised()).toBe(true);
  });

  it.each([['0'], ['false'], [''], ['maybe']])('stays off for %j', (value) => {
    process.env[GPS_LISTING_VERDICT_ENV] = value;
    expect(LISTING_PIPELINE_QUESTION.authorised()).toBe(false);
  });
});

/* ══ 8. 0072's detector and this file's refusal set are one set ════════════════
 *
 * The index exists so that "how many rows would silently miss this join?" is answerable
 * in one scan. That number is only worth having if the predicate is EXACTLY the set
 * `assetSymbolForProject` refuses — a predicate that is narrower under-reports, and an
 * under-reported count on a MiCA Art 91(3)(c) control is worse than no count, because
 * somebody will read it as zero and stop looking.
 *
 * These are assertions about the migration's TEXT. They cannot prove Postgres agrees;
 * the predicate was run against a live server by hand and the results recorded in the
 * migration's own comment. Reading the SQL from a test is the idiom this directory
 * already uses (`controlRegister.test.ts` pins 0069's index predicates the same way).
 */
describe('0072\'s unjoinable-ticker index indexes exactly what the code refuses', () => {
  const MIGRATION_0072 = readFileSync(
    new URL('../../db/migrations/0072_verdict_broker.sql', import.meta.url),
    'utf8',
  );
  /** The CREATE INDEX statement alone. Anchored, because the prose above it also says
   *  "CREATE INDEX" (where it explains why this one is not CONCURRENTLY). */
  const CREATE_INDEX = /^CREATE INDEX IF NOT EXISTS[\s\S]*?;/m.exec(MIGRATION_0072)?.[0] ?? '';

  /**
   * The VERBS the migration actually executes. Asserted on the statements and not on the
   * whole file, because the file's prose legitimately contains the words DROP and UPDATE
   * (it explains what it deliberately does NOT do, and what the predicate costs on every
   * UPDATE of `projects`). A grep over the comments would be a test of the English.
   */
  const VERBS = MIGRATION_0072
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    /* Column 0 only. Every statement starts at the margin and every continuation line —
     * including the COMMENT bodies, whose prose contains semicolons and would defeat a
     * split on `;` — is indented. */
    .map((l) => /^([A-Z]+)/.exec(l)?.[1] ?? '')
    .filter((v) => v !== '');

  it('is one partial index on projects, and executes nothing that can lose a row', () => {
    expect(CREATE_INDEX).toContain('idx_projects_ticker_norm_unjoinable');
    expect(CREATE_INDEX).toContain('ON projects (id)');
    // Two verbs only. A CHECK on projects — even NOT VALID — would start REJECTING the
    // catalog and runner inserts the moment one feed carries '$ sol', which is breaking
    // the importer to enforce a join. The read path already refuses such a value.
    expect(new Set(VERBS)).toEqual(new Set(['CREATE', 'COMMENT']));
    expect(VERBS.filter((v) => v === 'CREATE')).toHaveLength(1);
  });

  it('trims the VERTICAL TAB by its hex code, because E\'\\v\' in Postgres is the letter v', () => {
    // Verified against a live server, not reasoned about:
    //   select length(E' \t\n\r\f\v'), ascii(right(E' \t\n\r\f\v',1));   →  6 | 118  ('v')
    //   select ascii(right(E' \t\n\r\f\x0B',1));                         →  11
    // Postgres documents \b \f \n \r \t and the numeric forms and says any other
    // character after a backslash is taken literally. So the first fix's set trimmed a
    // LOWERCASE LETTER and left U+000B in place — meaning a stored 'SOL' || chr(11),
    // which the code refuses because JS `.trim()` strips U+000B, was still invisible to
    // the index whose whole job is to count the refused rows.
    expect(CREATE_INDEX).toContain("E' \\t\\n\\r\\f\\x0B'");
    expect(CREATE_INDEX).not.toMatch(/\\v'/);
  });

  it('mirrors all three parts of cleanTicker plus 0060\'s length bound', () => {
    // trim → strip a leading '$' → upper, in cleanTicker's own order, then the 20-char
    // bound 0060 puts on asset_symbol. Each of the three was a separate under-report.
    expect(CREATE_INDEX).toMatch(/upper\(regexp_replace\(btrim\(ticker_norm/);
    expect(CREATE_INDEX).toContain("'^\\$'");
    expect(CREATE_INDEX).toMatch(/length\(ticker_norm\)\s*>\s*20/);
    // The blank case is EXCLUDED on purpose: an all-whitespace ticker_norm is an ABSENT
    // ticker (no_ticker / OTHER_LEDGER_TICKER_ABSENT), a different state and a different
    // job, and the code reports it before the normalisation comparison is ever reached.
    expect(CREATE_INDEX).toMatch(/btrim\(ticker_norm, E' \\t\\n\\r\\f\\x0B'\) <> ''/);
  });

  it('names, in the index comment, the two codes whose row set it counts', () => {
    expect(MIGRATION_0072).toContain(OTHER_LEDGER_CODES.TICKER_NOT_NORMALISED);
    expect(MIGRATION_0072).toContain(OTHER_LEDGER_CODES.TICKER_UNUSABLE);
    // And it records the residual it does NOT cover rather than implying completeness.
    expect(MIGRATION_0072).toMatch(/NOT covered: non-ASCII/);
  });
});
