import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  VERDICT_BROKER_CODES,
  type BrokeredQuestion,
  type ProbeResult,
  brokerVerdict,
} from '../verdictBroker.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE VERDICT BROKER — one compartment learns THAT another holds something.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Written before the module, because this surface changes an answer a human acts on:
 * a conflict check that reads "nothing found" when the other compartment holds a live
 * embargo is the exact failure the broker exists to make impossible.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. VERDICT ONLY, NEVER CONTENTS. A recursive scan of the answer asserts that no
 *     string the holding compartment owns — event slug, minute pointer, the name of
 *     the human who entered it — appears anywhere in it, at any depth. The probe is
 *     handed all of those in its fixture on purpose.
 *  2. THE THREE STATES ARE NEVER COLLAPSED. `not_loaded` (we did not look) carries NO
 *     count field AT ALL — not 0, not null — so no caller can read a zero out of a
 *     state that never looked. `empty` carries the literal 0. `withheld` carries N>0.
 *  3. THE FLAG OFF IS A REFUSAL, NOT AN EMPTY. Default-deny, stable code, and the
 *     database is never touched — asserted on the call log, not on the answer.
 *  4. EVERY STATE CITES A RULE AND CARRIES A STABLE CODE, including the empty one.
 *     An unlabelled empty is indistinguishable from a withheld one in a log.
 *  5. A CONTRADICTORY PROBE REFUSES. `holding` with a zero count, a negative count
 *     or a non-integer count is reported as NOT-LOADED, never rounded into `empty`.
 *  6. AN ENTITLED READER OF THE *HOLDER* STILL GETS VERDICT-ONLY. The broker's
 *     contract does not widen for a reader who could get the contents elsewhere; an
 *     answer whose meaning depends on the reader is not a verdict.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake and the probe is a stub, so nothing here proves Postgres agrees
 * with any SQL. The SQL of the one real question is pinned in `otherLedger.test.ts`
 * against the same fake, and that is also only a statement about the text.
 */

/* ── The fake pool. Records every call so "we did not look" is provable. ─────── */

interface Call {
  sql: string;
  params: readonly unknown[];
}

function fakePool(handler: (sql: string, params: readonly unknown[]) => unknown) {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: unknown, params?: readonly unknown[]) => {
      const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
      calls.push({ sql: text, params: params ?? [] });
      const rows = handler(text, params ?? []);
      return { rows: rows as unknown[], rowCount: (rows as unknown[]).length };
    },
  } as unknown as pg.Pool;
  return { pool, calls };
}

/* ── The fixture. Every string here belongs to the HOLDING compartment. ───────
 *
 * These are the strings a leak would carry, so they are deliberately distinctive:
 * group 1 greps the whole answer for each of them.
 */
const HOLDER_SECRETS = [
  'listing-committee-2026-07-30',        // event_ref
  'minute:listing-cmte/2026-07-30#4',    // source_ref
  'monty',                               // entered_by
  'mnpi_pending',                        // the recorded state
] as const;

type TestVerdict = 'holding_restricted' | 'holding_stale';

const ENV_VAR = 'TEST_BROKER_MAY_READ';

function question(
  probe: (pool: pg.Pool, subject: string) => Promise<ProbeResult<TestVerdict>>,
): BrokeredQuestion<TestVerdict> {
  return {
    id: 'test.holder.holds_subject',
    asker: 'gps',
    holder: 'marketing',
    holderTable: 'test_holder_table',
    rule: 'Test rule: a refusal that tells you something EXISTS without telling you WHAT it is.',
    authorisationEnvVar: ENV_VAR,
    authorised: () => process.env[ENV_VAR] === '1',
    captures: 'whether the holder holds records for this subject, and how many.',
    doesNotCapture: ['any field of any record', 'why the record exists'],
    probe,
  };
}

/** A probe that answers from the fixture and hands the broker every secret string. */
const holdingProbe = (verdict: TestVerdict, withheldCount: number) =>
  async (): Promise<ProbeResult<TestVerdict>> => ({
    kind: 'holding',
    verdict,
    withheldCount,
    // Deliberately present on the probe result and deliberately NOT on the answer:
    // if a later refactor spreads the probe result into the answer, group 1 fails.
    detail: HOLDER_SECRETS.join(' '),
  } as ProbeResult<TestVerdict>);

const ENTITLED = { gps: 'view' } as const;

/** Recursively collect every string in a value, at any depth, keys included. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allStrings(v, out);
    }
  }
  return out;
}

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe('verdict broker — the flag is the owner\'s decision and it defaults to deny', () => {
  it('refuses with a stable code when the cross-compartment read is not authorised', async () => {
    const { pool, calls } = fakePool(() => {
      throw new Error('the broker must not query when the read is unauthorised');
    });
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 3)), {
      entitlements: ENTITLED,
      subject: 'SOL',
    });

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    expect(answer.reason).toBe('cross_read_not_authorised');
    // The refusal must be actionable: it names the one variable and says whose call it is.
    expect(answer.message).toContain(ENV_VAR);
    expect(answer.message.toLowerCase()).toContain('owner');
    // And nothing was read. This is the assertion that proves default-deny is a
    // decision taken BEFORE the query, not a filter applied after it.
    expect(calls).toEqual([]);
  });

  it('answers with a verdict when the owner has authorised the read', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 3)), {
      entitlements: ENTITLED,
      subject: 'SOL',
    });

    expect(answer.kind).toBe('withheld');
    if (answer.kind !== 'withheld') throw new Error('unreachable');
    expect(answer.verdict).toBe('holding_restricted');
    expect(answer.withheldCount).toBe(3);
    expect(answer.code).toBe(VERDICT_BROKER_CODES.WITHHELD);
  });

  it('reads the flag at CALL time, so flipping it needs no module reload', async () => {
    const { pool } = fakePool(() => []);
    const q = question(holdingProbe('holding_restricted', 1));
    const off = await brokerVerdict(pool, q, { entitlements: ENTITLED, subject: 'SOL' });
    process.env[ENV_VAR] = '1';
    const on = await brokerVerdict(pool, q, { entitlements: ENTITLED, subject: 'SOL' });

    expect(off.kind).toBe('not_loaded');
    expect(on.kind).toBe('withheld');
  });
});

describe('verdict broker — verdict only, never the other side\'s contents', () => {
  it('carries no string belonging to the holding compartment, at any depth', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 4)), {
      entitlements: ENTITLED,
      subject: 'SOL',
    });

    const haystack = allStrings(answer).join(' ').toLowerCase();
    for (const secret of HOLDER_SECRETS) {
      expect(haystack).not.toContain(secret.toLowerCase());
    }
    // JSON.stringify is the shape a route would actually emit; check that too, since
    // a non-enumerable or getter-backed field would slip past the walk above.
    expect(JSON.stringify(answer).toLowerCase()).not.toContain('minute:');
  });

  it('does not widen for a reader who also holds the HOLDER compartment at approve', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 4)), {
      entitlements: { gps: 'view', marketing: 'approve' },
      subject: 'SOL',
    });

    expect(answer.kind).toBe('withheld');
    if (answer.kind !== 'withheld') throw new Error('unreachable');
    expect(answer.verdict).toBe('holding_restricted');
    expect(JSON.stringify(answer).toLowerCase()).not.toContain('minute:');
  });
});

describe('verdict broker — the three states are never collapsed', () => {
  it('not-loaded carries NO count field at all — not 0, not null', async () => {
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 3)), {
      entitlements: ENTITLED,
      subject: 'SOL',
    });

    expect(answer.kind).toBe('not_loaded');
    // The property must be ABSENT. `answer.withheldCount === undefined` would also
    // hold for a present-but-undefined field, and `'x' in obj` is the difference
    // between "we have no number" and "our number is nothing".
    expect('withheldCount' in answer).toBe(false);
    expect('verdict' in answer).toBe(false);
    expect('observed' in answer).toBe(false);
  });

  it('genuinely-empty carries the literal 0 and a null verdict, and says it looked', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(
      pool,
      question(async () => ({ kind: 'none' })),
      { entitlements: ENTITLED, subject: 'SOL' },
    );

    expect(answer.kind).toBe('empty');
    if (answer.kind !== 'empty') throw new Error('unreachable');
    expect(answer.withheldCount).toBe(0);
    expect(answer.verdict).toBeNull();
    expect(answer.code).toBe(VERDICT_BROKER_CODES.NO_HOLDING);
    // An empty that does not say when and where it looked is a claim, not an
    // observation. Both states that LOOKED carry the frame; not-loaded cannot.
    expect(answer.observed.holderTable).toBe('test_holder_table');
    expect(typeof answer.observed.at).toBe('string');
    expect(answer.observed.environment.length).toBeGreaterThan(0);
  });

  it('a missing holder table is NOT-LOADED, never empty', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(
      pool,
      question(async () => ({ kind: 'unavailable', detail: 'relation does not exist' })),
      { entitlements: ENTITLED, subject: 'SOL' },
    );

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
    expect(answer.reason).toBe('holder_unavailable');
    expect('withheldCount' in answer).toBe(false);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ])('a `holding` probe with a %s count refuses instead of collapsing into empty', async (_label, count) => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(
      pool,
      question(async () => ({ kind: 'holding', verdict: 'holding_stale', withheldCount: count })),
      { entitlements: ENTITLED, subject: 'SOL' },
    );

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
  });

  it('every state carries a stable code and cites a rule', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answers = [
      await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
        entitlements: ENTITLED, subject: 'SOL',
      }),
      await brokerVerdict(pool, question(async () => ({ kind: 'none' })), {
        entitlements: ENTITLED, subject: 'SOL',
      }),
      await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
        entitlements: {}, subject: 'SOL',
      }),
    ];
    for (const a of answers) {
      expect(a.code.startsWith('VERDICT_BROKER_')).toBe(true);
      expect(a.rule.length).toBeGreaterThan(20);
      expect(a.message.length).toBeGreaterThan(20);
      expect(a.question).toBe('test.holder.holds_subject');
      expect(a.asker).toBe('gps');
      expect(a.holder).toBe('marketing');
    }
  });
});

describe('verdict broker — the asker must hold its own compartment', () => {
  it('refuses an asker holding nothing, and does not look', async () => {
    process.env[ENV_VAR] = '1';
    const { pool, calls } = fakePool(() => {
      throw new Error('the broker must not query for an unentitled asker');
    });
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
      entitlements: {},
      subject: 'SOL',
    });

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
    expect(calls).toEqual([]);
  });

  it('refuses BEFORE the flag, so an unentitled caller learns nothing about the flag', async () => {
    // Flag deliberately unset: an unentitled asker must get ASKER_NOT_ENTITLED and
    // not CROSS_READ_NOT_AUTHORISED, or the refusal code becomes an oracle for the
    // deployment's configuration.
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
      entitlements: {},
      subject: 'SOL',
    });
    expect(answer.kind === 'not_loaded' && answer.code).toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
  });

  it('does not accept the HOLDER compartment as a substitute for the asker\'s own', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
      entitlements: { marketing: 'approve' },
      subject: 'SOL',
    });
    expect(answer.kind === 'not_loaded' && answer.code).toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
  });

  it.each(['', '   '])('refuses a blank subject (%j) without looking', async (subject) => {
    process.env[ENV_VAR] = '1';
    const { pool, calls } = fakePool(() => {
      throw new Error('the broker must not query for a blank subject');
    });
    const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
      entitlements: ENTITLED,
      subject,
    });
    expect(answer.kind === 'not_loaded' && answer.code).toBe(VERDICT_BROKER_CODES.SUBJECT_UNUSABLE);
    expect(calls).toEqual([]);
  });

  it.each([[null], [undefined], [0], [{}]])(
    'refuses an ABSENT subject (%j) under a stable code rather than throwing a 500',
    async (subject) => {
      // THE DEFECT THIS TEST EXISTS FOR, and it is the one shape a route actually hands
      // over. `null`/`undefined` is what a missing query parameter or an unsent JSON body
      // field is, whatever the TypeScript signature says at the boundary; `asking.subject`
      // went straight into `.trim()`, so this module — the one whose entire thesis is that
      // absent data refuses UNDER A STABLE CODE — answered with an uncaught TypeError and
      // a 500 carrying no code at all. The BLANK-string case above was handled and the
      // ABSENT case was not, which is the two halves of one module disagreeing about how
      // defensive to be while `normaliseAssetSymbol` already accepted `null | undefined`.
      // The non-string cases are here too because a JSON body can carry any type and the
      // refusal must be a refusal for all of them, not only for the two we thought of.
      process.env[ENV_VAR] = '1';
      const { pool, calls } = fakePool(() => {
        throw new Error('the broker must not query for an absent subject');
      });
      const answer = await brokerVerdict(pool, question(holdingProbe('holding_restricted', 2)), {
        entitlements: ENTITLED,
        subject: subject as unknown as string,
      });
      expect(answer.kind).toBe('not_loaded');
      if (answer.kind !== 'not_loaded') throw new Error('unreachable');
      expect(answer.code).toBe(VERDICT_BROKER_CODES.SUBJECT_UNUSABLE);
      expect(answer.reason).toBe('subject_unusable');
      expect(calls).toEqual([]);
    },
  );
});

describe('verdict broker — a probe that throws is not an empty answer', () => {
  it('reports NOT-LOADED when the probe raises', async () => {
    process.env[ENV_VAR] = '1';
    const { pool } = fakePool(() => []);
    const answer = await brokerVerdict(
      pool,
      question(async () => {
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      }),
      { entitlements: ENTITLED, subject: 'SOL' },
    );

    expect(answer.kind).toBe('not_loaded');
    if (answer.kind !== 'not_loaded') throw new Error('unreachable');
    expect(answer.code).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
    // The error text is the holding compartment's, so it must not travel.
    expect(JSON.stringify(answer)).not.toContain('connection terminated');
  });
});
