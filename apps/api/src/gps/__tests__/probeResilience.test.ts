import { describe, expect, it, beforeEach } from 'vitest';
import type pg from 'pg';
import { _resetMigrated, isMigrated } from '../service.js';
import { _resetPerimeterMigrated, isPerimeterMigrated } from '../conflict.js';
import { _resetDeliveryMigrated, isDeliveryMigrated } from '../deliveryDesk.js';
import { _resetOutcomeMigrated, isOutcomeMigrated } from '../loop.js';
import { _resetOriginationMigrated, isOriginationMigrated } from '../origination.js';

/**
 * ONE TRANSIENT DATABASE ERROR USED TO POISON THE PROCESS PERMANENTLY.
 *
 * Five GPS migration probes were `catch { cache = false }` with no log. A connection
 * reset, a statement timeout, or a pgbouncer restart during the probe therefore made
 * every GPS read serve `migrated: false` and every write answer 503 "awaiting migration
 * 0047" — on a fully migrated production database, until someone restarted the API,
 * with nothing in the logs saying why.
 *
 * Each probe justified the cache with "the API restarts on deploy". `db/migrate.ts`
 * states that migrations are deliberately NOT part of the deploy, so a TRUE negative
 * never self-heals on a restart either; the reasoning was wrong in both directions.
 *
 * The property: a probe that threw is not an answer. It returns `false` for this call
 * (fail closed — a read cannot proceed against a table it could not confirm) and caches
 * NOTHING, so the next call re-probes and a recovered database is served correctly.
 */

interface Probe {
  name: string;
  reset: () => void;
  run: (pool: pg.Pool) => Promise<boolean>;
  /** The relation the probe asks `to_regclass` about. */
  match: RegExp;
}

const PROBES: readonly Probe[] = [
  { name: 'isMigrated (0047)', reset: _resetMigrated, run: isMigrated, match: /gps_engagement/ },
  { name: 'isPerimeterMigrated (0050)', reset: _resetPerimeterMigrated, run: isPerimeterMigrated, match: /gps_jurisdiction_profile/ },
  { name: 'isDeliveryMigrated (0049)', reset: _resetDeliveryMigrated, run: isDeliveryMigrated, match: /gps_deliverable|gps_milestone/ },
  { name: 'isOutcomeMigrated', reset: _resetOutcomeMigrated, run: isOutcomeMigrated, match: /gps_outcome/ },
  { name: 'isOriginationMigrated', reset: _resetOriginationMigrated, run: isOriginationMigrated, match: /gps_target/ },
];

/** A pool that fails the first `n` calls, then answers "the table exists". */
function flakyPool(failures: number) {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      if (calls <= failures) {
        const err = new Error('Connection terminated unexpectedly') as Error & { code?: string };
        err.code = 'ECONNRESET';
        throw err;
      }
      return { rows: [{ ok: true }], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, calls: () => calls };
}

beforeEach(() => {
  for (const p of PROBES) p.reset();
});

describe('a migration probe that threw is not a cached answer', () => {
  for (const probe of PROBES) {
    it(`${probe.name}: fails closed for the call, then RE-PROBES and recovers`, async () => {
      const { pool, calls } = flakyPool(1);

      // The failing call. Fail closed — a read may not proceed against a table it
      // could not confirm — but this is not an answer about the schema.
      expect(await probe.run(pool)).toBe(false);
      expect(calls()).toBe(1);

      // THE FIX. Before it, this returned false forever: the negative was cached and
      // the only cure was a process restart.
      expect(await probe.run(pool)).toBe(true);
      expect(calls()).toBe(2);
    });

    it(`${probe.name}: caches the POSITIVE, so a healthy database costs one round trip`, async () => {
      const { pool, calls } = flakyPool(0);
      expect(await probe.run(pool)).toBe(true);
      expect(await probe.run(pool)).toBe(true);
      expect(await probe.run(pool)).toBe(true);
      expect(calls(), 'the positive answer must still be cached').toBe(1);
    });
  }

  it('a genuine absence is still cached — an unmigrated environment is an answer', async () => {
    // The distinction the old code could not make: `to_regclass` returning NULL is the
    // database ANSWERING "no such table". That is cacheable. A throw is not.
    let calls = 0;
    const pool = {
      query: async () => { calls += 1; return { rows: [{ ok: false }], rowCount: 1 }; },
    } as unknown as pg.Pool;
    expect(await isMigrated(pool)).toBe(false);
    expect(await isMigrated(pool)).toBe(false);
    expect(calls).toBe(1);
  });
});
