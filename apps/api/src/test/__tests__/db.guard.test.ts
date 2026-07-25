import { beforeAll, describe, expect, it } from 'vitest';
import { HAS_DB, describeDb, itDb } from '../db.js';

/**
 * Tests for the test guard.
 *
 * This is not ceremony. `describeDb` exists because ten API test files died on a
 * GitHub runner with no Postgres, and two of them had ALREADY looked like they
 * handled it — vitest printed their tests as "skipped" while failing their suite,
 * because a throwing `beforeAll` marks its tests skipped. The distinction between
 * "skipped because guarded" and "skipped because the hook exploded" is invisible in
 * the reporter output and is the entire point of the guard, so it gets asserted
 * rather than trusted.
 */

// Set inside a suite that must never execute. Module scope, so the assertion below can
// read it: if `skipIf` skipped the tests but ran the hook, this flips and the guard is
// worthless for exactly the files it was written for.
let skippedSuiteHookRan = false;

describe.skipIf(true)('a suite skipped by skipIf', () => {
  beforeAll(() => {
    skippedSuiteHookRan = true;
  });

  it('never runs', () => {
    throw new Error('this test must never execute');
  });
});

describe('the database guard', () => {
  it('does not run beforeAll in a skipped suite', () => {
    // THE assertion. Everything else in this file is bookkeeping; this is the property
    // the ten files depend on. `beforeAll` is where every one of them connects.
    expect(
      skippedSuiteHookRan,
      'skipIf ran the hook of a skipped suite — describeDb cannot protect a suite that connects in beforeAll',
    ).toBe(false);
  });

  it('reads DATABASE_URL rather than a defaulted config value', () => {
    // The contract, in the direction that matters: a URL that is SET but points at a
    // dead database must NOT skip — it must run and fail. Encoding it as a test means
    // a future "make the tests more robust by probing the connection" change has to
    // delete an assertion that says why not, instead of silently converting a broken
    // CI database into a green run.
    const configured = (process.env.DATABASE_URL ?? '').length > 0;
    expect(HAS_DB).toBe(configured);
  });

  it('exports guards that are still callable vitest APIs', () => {
    // Cheap, but it catches the version bump where `skipIf` moves or is renamed. The
    // failure mode without it is silent: `describeDb` becomes undefined, every guarded
    // file throws at import, and the reporter blames the test file rather than here.
    expect(typeof describeDb).toBe('function');
    expect(typeof itDb).toBe('function');
  });
});

describeDb('a suite guarded by describeDb', () => {
  it('runs only when a database is configured', () => {
    // Reached only with DATABASE_URL set. Asserting HAS_DB here is circular on its
    // own; its value is as a canary in the OTHER direction — if this test ever runs on
    // a runner with no database, the guard has inverted and the reporter will say so
    // here rather than 200 lines into a route test's ECONNREFUSED stack.
    expect(HAS_DB).toBe(true);
  });
});

describe('a mixed suite, the shape six of the ten files actually have', () => {
  it('runs its database-free tests either way', () => {
    // The reason `itDb` exists alongside `describeDb`: blanket-skipping the six mixed
    // files would have discarded 18 passing assertions to quiet 3 failing ones.
    expect(1 + 1).toBe(2);
  });

  itDb('skips only the test that needs a database', () => {
    expect(HAS_DB).toBe(true);
  });
});
