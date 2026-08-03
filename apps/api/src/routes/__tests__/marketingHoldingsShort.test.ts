import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SHORT LIMB OF Art 91(3)(c): 'NOT ASKED' IS NOT 'NO SHORT POSITION'.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  `marketing_holdings_declaration.holds` is a BOOLEAN, so before 0065 a declaration
 *  could say "I hold spot" or "I hold nothing" and nothing else. The Article says "an
 *  opinion", not "a favourable opinion": a staffer who is short an asset and calls it a
 *  dead project is inside the same definition, and their `holds = false` row read as
 *  "no position" and cleared the draft. `abuse.ts:680` names that gap.
 *
 *  WHAT IS UNDER TEST HERE is the ONE THING that must never happen: an unanswered short
 *  question being read as an answer of "no". Every assertion below exists to hold that
 *  line at a different layer — the vocabulary, the CHECK constraint, the policy
 *  resolution, the INSERT, and the value handed back to the caller.
 *
 *  ── WHY THESE TESTS LIVE UNDER `routes/__tests__` ───────────────────────────
 *  The behaviour is in `marketing/abuseRegister.ts`, whose own test file belongs to
 *  another pass. Putting them here keeps this wave's tests inside this wave's files;
 *  they import the register directly and do not go through a route, so nothing about
 *  their location weakens them.
 */

type Call = { sql: string; params: unknown[] };

let calls: Call[] = [];
let tablesPresent = true;
let shortColumnPresent = true;
let currentRow: Array<{ id: string }> = [];

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  // ONE probe answers both migrations (`probeMigrations`), so the stub answers both
  // flags from one statement — and independently, because the environment that matters
  // is the one with 0060 and without 0065.
  if (/to_regclass/.test(sql)) {
    return { rows: [{ ok: tablesPresent, short_ok: shortColumnPresent }], rowCount: 1 };
  }
  if (/SELECT d\.id FROM marketing_holdings_declaration/.test(sql)) {
    return { rows: currentRow, rowCount: currentRow.length };
  }
  if (/INSERT INTO marketing_holdings_declaration/.test(sql)) {
    return { rows: [{ id: 'dec-new' }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});

const pool = { query } as never;

const {
  MARKETING_ABUSE_ACTIONS,
  SHORT_LIMB_MIGRATION,
  SHORT_POSITION_ANSWERS,
  SHORT_QUESTION_POLICIES,
  SHORT_QUESTION_POLICY,
  _resetAbuseRegisterMigrated,
  _resetHoldingsShortLimbMigrated,
  declareHoldings,
  isHoldingsShortLimbMigrated,
  loadHoldingsStates,
  normaliseShortAnswer,
  resolveShortAnswer,
  shortQuestionIsAsked,
} = await import('../../marketing/abuseRegister.js');

/**
 * THE SHARED SIDE, now reachable by package name.
 *
 * This was a deep relative import while `marketing/index.ts` re-exported nothing from
 * `contracts/`, and the vocabulary existed TWICE in TypeScript — once in
 * `abuseRegister.ts` for the api, once in `contracts/holdings.ts` for the web and the
 * engine — with this file holding them equal. The barrel line landed and the api-side copy
 * was deleted, so there is one TypeScript definition and one SQL CHECK, and what this file
 * holds equal is now those two.
 *
 * The identity assertion below is the replacement for the old value-by-value comparison:
 * comparing an imported array to itself would pass forever, so the test asserts the
 * SINGLE-SOURCING instead — same object, and no second literal in the api file.
 */
const shared = await import('@lcx/shared');

const MIGRATION_SQL = readFileSync(
  resolve(import.meta.dirname, '../../db/migrations/0065_marketing_holdings_position.sql'),
  'utf8',
);

/**
 * The migration with its `--` comment lines removed.
 *
 * Needed because 0065's own header explains that it contains no DROP, no DELETE, no
 * TRUNCATE and no ALTER COLUMN TYPE — and a naive scan for those words finds them in
 * that sentence. This is the `codeOnly` shape the other migration ratchets in this repo
 * use, and it is deliberately line-oriented: a `--` inside a string literal would be
 * mis-stripped, and 0065 has none.
 */
const MIGRATION_CODE = MIGRATION_SQL
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

beforeEach(() => {
  calls = [];
  tablesPresent = true;
  shortColumnPresent = true;
  currentRow = [];
  query.mockClear();
  _resetAbuseRegisterMigrated();
  _resetHoldingsShortLimbMigrated();
});

describe('the vocabulary has ONE TypeScript definition and one SQL copy', () => {
  it('IS the shared contract rather than agreeing with it', () => {
    // `toBe`, not `toEqual`: identity is the claim. Two arrays that happen to hold the same
    // four strings can drift on the next edit; one array cannot.
    expect(SHORT_POSITION_ANSWERS).toBe(shared.SHORT_POSITION_ANSWERS);
    expect(SHORT_QUESTION_POLICIES).toBe(shared.SHORT_QUESTION_POLICIES);
  });

  it('does not re-declare the vocabulary in abuseRegister.ts', () => {
    /*
     * The identity check above passes if the api file imports the array. It would ALSO pass
     * if somebody added a second local literal under a different name and used that in one
     * branch, which is the shape the deleted mirror had. So the source is read: the file
     * must import these two names, and must contain no literal list of the four answers.
     */
    const api = readFileSync(resolve(import.meta.dirname, '../../marketing/abuseRegister.ts'), 'utf8');
    expect(api, 'abuseRegister.ts must import the vocabulary from @lcx/shared')
      .toMatch(/import \{[\s\S]*?\bSHORT_POSITION_ANSWERS\b[\s\S]*?\} from '@lcx\/shared'/);
    const code = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(
      code,
      'a second literal list of the short answers has appeared in abuseRegister.ts; there is '
      + 'one TypeScript definition and it is SHORT_POSITION_ANSWERS in '
      + 'packages/shared/src/marketing/contracts/holdings.ts',
    ).not.toMatch(/\[\s*'holds_short'\s*,/);
  });

  it('matches the CHECK constraint in 0065, so no fourth value can arrive through psql', () => {
    const check = /short_position IN \(([^)]*)\)/.exec(MIGRATION_SQL);
    expect(check, '0065 no longer constrains short_position').not.toBeNull();
    const allowed = check![1]!.split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(allowed.sort()).toEqual([...SHORT_POSITION_ANSWERS].sort());
  });

  it('carries a state for NOT ASKED that is distinct from every answer', () => {
    expect(SHORT_POSITION_ANSWERS).toContain('not_asked');
    expect(SHORT_POSITION_ANSWERS).toContain('no_short');
    expect(new Set(SHORT_POSITION_ANSWERS).size).toBe(SHORT_POSITION_ANSWERS.length);
  });

  it('defaults the column to not_asked in the migration, never to an answer', () => {
    expect(MIGRATION_SQL).toMatch(/short_position text NOT NULL DEFAULT 'not_asked'/);
    expect(MIGRATION_SQL).not.toMatch(/DEFAULT 'no_short'/);
  });

  it('adds no DROP, DELETE, TRUNCATE or ALTER COLUMN TYPE — a human pastes this by hand', () => {
    expect(MIGRATION_CODE).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN .* TYPE/i);
    // Anti-vacuity: the strip above must not have emptied the file, or this passes for
    // the wrong reason and keeps passing through every future edit.
    expect(MIGRATION_CODE).toMatch(/ALTER TABLE marketing_holdings_declaration/);
    // Idempotent: the column and the index guard themselves, the constraint uses a DO block.
    expect(MIGRATION_CODE).toMatch(/ADD COLUMN IF NOT EXISTS short_position/);
    expect(MIGRATION_CODE).toMatch(/FROM pg_constraint/);
  });
});

describe('an unanswered short question is UNKNOWN, and unknown refuses', () => {
  it('never maps not_asked or declined to a cleared bearish limb', () => {
    expect(shared.bearishLimbOf('not_asked')).toBe('unknown');
    expect(shared.bearishLimbOf('declined')).toBe('unknown');
    expect(shared.bearishLimbOf('no_short')).toBe('no_short_declared');
    expect(shared.bearishLimbOf('holds_short')).toBe('disclosure_required');
  });

  it('treats an absent cell (no live declaration at all) as unknown too', () => {
    expect(shared.cellBearishLimb(null)).toBe('unknown');
    expect(shared.cellBearishLimb('no_short')).toBe('no_short_declared');
  });

  it('resolves an unrecognised or missing database value to not_asked, not to an answer', () => {
    for (const raw of [undefined, null, '', 'no', 'false', 'NO_SHORT', 0]) {
      expect(normaliseShortAnswer(raw), String(raw)).toBe('not_asked');
    }
    expect(normaliseShortAnswer('no_short')).toBe('no_short');
  });

  it('derives a position that says UNKNOWN out loud rather than implying flat', () => {
    expect(shared.positionOf(false, 'not_asked')).toBe('flat_short_unknown');
    expect(shared.positionOf(true, 'not_asked')).toBe('long_short_unknown');
    expect(shared.positionOf(false, 'no_short')).toBe('no_position');
    expect(shared.positionOf(false, 'holds_short')).toBe('short_only');
    expect(shared.positionOf(true, 'holds_short')).toBe('long_and_short');
    expect(shared.POSITION_LABEL.flat_short_unknown).toMatch(/UNKNOWN/);
    expect(shared.POSITION_LABEL.long_short_unknown).toMatch(/UNKNOWN/);
    // No label may describe an unanswered cell as having no short position.
    expect(shared.POSITION_LABEL.flat_short_unknown).not.toMatch(/no short/i);
  });

  it('is only the boolean that clears: holds=false alone is NOT a flat position', () => {
    // The defect in one line. Before 0065 this was the only fact available, and a
    // bearish draft cleared on it.
    expect(shared.positionOf(false, 'not_asked')).not.toBe('no_position');
    expect(shared.cellBearishLimb('not_asked')).not.toBe('no_short_declared');
  });
});

describe('whether the question is asked at all is a human decision, held in one line', () => {
  it('ships in the setting that asks nothing, so no legal position is asserted by default', () => {
    expect(SHORT_QUESTION_POLICY).toBe('not_asked');
    expect(shortQuestionIsAsked('not_asked')).toBe(false);
    expect(shortQuestionIsAsked('voluntary')).toBe(true);
    expect(shortQuestionIsAsked('required')).toBe(true);
  });

  it('refuses a short answer while the question is not asked, and names who decides', () => {
    for (const requested of ['holds_short', 'no_short', 'declined'] as const) {
      expect(() => resolveShortAnswer({ requested, policy: 'not_asked', columnPresent: true }))
        .toThrowError(/does not ask staff about short positions/);
    }
    try {
      resolveShortAnswer({ requested: 'no_short', policy: 'not_asked', columnPresent: true });
    } catch (err) {
      expect((err as { code: string }).code).toBe('HOLDINGS_SHORT_QUESTION_NOT_ASKED');
      expect((err as { status: number }).status).toBe(409);
      expect((err as { message: string }).message).toMatch(/HR and legal decision/);
    }
  });

  it('stores not_asked, not declined, when the answer is simply absent — at every policy', () => {
    // The server cannot know whether the question was DISPLAYED. Recording "declined"
    // would state that a named person refused a question nobody put to them.
    for (const policy of ['not_asked', 'voluntary'] as const) {
      expect(resolveShortAnswer({ policy, columnPresent: true })).toBe('not_asked');
      expect(resolveShortAnswer({ requested: null, policy, columnPresent: true })).toBe('not_asked');
    }
  });

  it('accepts all four answers under voluntary, including an explicit decline', () => {
    for (const requested of SHORT_POSITION_ANSWERS) {
      expect(resolveShortAnswer({ requested, policy: 'voluntary', columnPresent: true })).toBe(requested);
    }
  });

  it('requires a real answer under required, and declining is not one', () => {
    for (const requested of ['no_short', 'holds_short'] as const) {
      expect(resolveShortAnswer({ requested, policy: 'required', columnPresent: true })).toBe(requested);
    }
    for (const requested of [undefined, null, 'declined', 'not_asked'] as const) {
      expect(() => resolveShortAnswer({ requested, policy: 'required', columnPresent: true }))
        .toThrowError(/requires a short-position answer/);
    }
  });

  it('refuses rather than silently dropping the answer when 0065 is not applied', () => {
    expect(() => resolveShortAnswer({ requested: 'no_short', policy: 'voluntary', columnPresent: false }))
      .toThrowError(new RegExp(SHORT_LIMB_MIGRATION));
    // 'not_asked' is what the absent column already means, so it is recordable.
    expect(resolveShortAnswer({ requested: 'not_asked', policy: 'voluntary', columnPresent: false }))
      .toBe('not_asked');
  });
});

describe('the write path records the short limb, or refuses, and never guesses', () => {
  it('writes the resolved answer into the INSERT, positionally where 0065 put it', async () => {
    const out = await declareHoldings(pool, {
      memberId: 'sam', assetSymbol: 'SOL', holds: true, renewInDays: 30,
    });
    expect(out.shortPosition).toBe('not_asked');
    const insert = calls.find((q) => /INSERT INTO marketing_holdings_declaration/.test(q.sql))!;
    expect(insert.sql).toMatch(/holds, short_position, renew_by/);
    expect(insert.params[3]).toBe('not_asked');
  });

  it('omits the column entirely on a database without 0065, rather than failing', async () => {
    shortColumnPresent = false;
    const out = await declareHoldings(pool, {
      memberId: 'sam', assetSymbol: 'SOL', holds: false, renewInDays: 30,
    });
    expect(out.shortPosition).toBe('not_asked');
    const insert = calls.find((q) => /INSERT INTO marketing_holdings_declaration/.test(q.sql))!;
    expect(insert.sql).not.toMatch(/short_position/);
  });

  it('writes NOTHING when the short answer is refused', async () => {
    await expect(declareHoldings(pool, {
      memberId: 'sam', assetSymbol: 'SOL', holds: true, renewInDays: 30, shortPosition: 'no_short',
    })).rejects.toMatchObject({ code: 'HOLDINGS_SHORT_QUESTION_NOT_ASKED' });
    expect(calls.some((q) => /INSERT INTO/.test(q.sql))).toBe(false);
    // Refused before the chain is even read, so a refusal cannot be told apart from a
    // clean register by what it touched.
    expect(calls.some((q) => /SELECT d\.id FROM/.test(q.sql))).toBe(false);
  });

  it('reports the stored answer back, so a caller cannot believe it recorded one it did not', async () => {
    const out = await declareHoldings(pool, {
      memberId: 'sam', assetSymbol: 'SOL', holds: true, renewInDays: 30, shortPosition: 'not_asked',
    });
    expect(out.shortPosition).toBe('not_asked');
    expect(out.state).toBe('declared_holding');
  });
});

describe('the governed action carries the answer, and stays optional', () => {
  const declare = MARKETING_ABUSE_ACTIONS.find((a) => a.id === 'marketing_holdings_declare')!;

  it('accepts every member of the vocabulary and nothing else', () => {
    for (const shortPosition of SHORT_POSITION_ANSWERS) {
      expect(
        declare.paramsSchema.safeParse({ holds: true, renewInDays: 30, shortPosition }).success,
        shortPosition,
      ).toBe(true);
    }
    for (const bad of ['probably not', 'flat', 'no', true, 0]) {
      expect(
        declare.paramsSchema.safeParse({ holds: true, renewInDays: 30, shortPosition: bad }).success,
        String(bad),
      ).toBe(false);
    }
  });

  it('stays OPTIONAL, because making the question compulsory is not this file\'s decision', () => {
    expect(declare.paramsSchema.safeParse({ holds: true, renewInDays: 30 }).success).toBe(true);
  });

  it('still admits no prose and no way to name a colleague', () => {
    const parsed = declare.paramsSchema.parse({
      holds: true, renewInDays: 30, shortPosition: 'not_asked',
      memberId: 'monty', reason: 'because I said so',
    }) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['holds', 'renewInDays', 'shortPosition']);
  });

  it('reports the live policy in its result, so an audit row shows what was in force', async () => {
    const out = await declare.execute({
      pool, subjectId: 'SOL', params: { holds: true, renewInDays: 30 }, actor: 'sam',
    } as never) as Record<string, unknown>;
    expect(out.shortPosition).toBe('not_asked');
    expect(out.shortQuestionPolicy).toBe(SHORT_QUESTION_POLICY);
  });
});

describe('the engine feed reads the column without being able to misreport it', () => {
  it('probes 0065 separately from 0060, and caches only a definite answer', async () => {
    tablesPresent = true;
    shortColumnPresent = true;
    expect(await isHoldingsShortLimbMigrated(pool)).toBe(true);
    const probes = calls.filter((q) => /information_schema\.columns/.test(q.sql)).length;
    await isHoldingsShortLimbMigrated(pool);
    expect(calls.filter((q) => /information_schema\.columns/.test(q.sql)).length).toBe(probes);
  });

  it('hands the cell loader the raw answer for a live declaration', async () => {
    const live = {
      member_id: 'sam', asset_symbol: 'SOL', holds: false, short_position: 'holds_short',
      declared_at: new Date('2026-07-01T00:00:00.000Z'),
      renew_by: new Date('2027-07-01T00:00:00.000Z'), amendments: 0,
    };
    const localQuery = vi.fn(async (sql: string) => {
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/information_schema\.columns/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/any_rows/.test(sql)) return { rows: [{ any_rows: true }], rowCount: 1 };
      return { rows: [live], rowCount: 1 };
    });
    _resetAbuseRegisterMigrated();
    _resetHoldingsShortLimbMigrated();
    const got = await loadHoldingsStates(
      { query: localQuery } as never,
      { memberIds: ['sam'], symbols: ['SOL'] },
      new Date('2026-08-03T00:00:00.000Z'),
    );
    const cell = got.cells[0]!;
    // The limb the boolean could not see: flat spot, and short. `state` still describes
    // the spot limb, which is what every existing consumer reads.
    expect(cell.state).toBe('declared_none');
    expect(cell.shortPosition).toBe('holds_short');
    expect(shared.cellBearishLimb(cell.shortPosition)).toBe('disclosure_required');
    expect(shared.positionOf(cell.holds!, cell.shortPosition!)).toBe('short_only');
  });
});
