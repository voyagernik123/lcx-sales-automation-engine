import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  AN APPLIED MIGRATION IS IMMUTABLE, AND THE RUNNER NOW SAYS SO OUT LOUD.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `0050_gps_perimeter.sql` had its `COMMENT ON TABLE` rewritten in the working
 *  tree — the diff itself called the old wording "the widest-audience false claim
 *  in the compartment" — while the file was already applied on production. The
 *  runner skipped it by NAME and never looked at its content, so production kept the
 *  false comment, the repository showed the corrected one, and the gate was green
 *  the whole time. There was no mechanism anywhere that could have noticed.
 *
 *  These tests drive `migrate()` against a fake `pg` and pin the four behaviours
 *  that close it. Every one of them fails against the previous runner, which
 *  selected only `file`, hashed nothing, and read a migration's bytes solely when it
 *  was about to apply it.
 */

/** Recorded statements, in order. The only thing the fake client keeps. */
interface Recorded { sql: string; params?: unknown[] }

let recorded: Recorded[] = [];
/** What `SELECT file, checksum FROM _migrations` answers with. */
let appliedRows: Array<{ file: string; checksum: string | null }> = [];
let poolEnded = false;

vi.mock('pg', () => {
  class FakePool {
    async connect() {
      return {
        query: async (sql: string, params?: unknown[]) => {
          recorded.push({ sql, params });
          if (/FROM _migrations/.test(sql)) return { rows: appliedRows };
          return { rows: [] };
        },
        release: () => {},
      };
    }
    async end() { poolEnded = true; }
  }
  return { default: { Pool: FakePool } };
});

const { migrate, migrationChecksum } = await import('../migrate.js');

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const sha = (file: string) =>
  createHash('sha256').update(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'), 'utf8').digest('hex');

/**
 * Every file marked applied with its true checksum, except the ones named — which
 * take the override (a wrong digest, or null for "applied before the column existed").
 */
function allAppliedExcept(overrides: Record<string, string | null> = {}) {
  return onDisk.map((f) => ({ file: f, checksum: f in overrides ? overrides[f] : sha(f) }));
}

beforeEach(() => {
  recorded = [];
  poolEnded = false;
  appliedRows = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the checksum ratchet', () => {
  it('hashes a migration by content, not by name', () => {
    // Non-vacuity for everything below: two different files must not share a digest,
    // and the digest must be the plain sha256 of the bytes so a human can reproduce
    // it with `shasum -a 256` while staring at a production `_migrations` row.
    expect(migrationChecksum('a')).not.toEqual(migrationChecksum('b'));
    expect(migrationChecksum('a')).toEqual(createHash('sha256').update('a', 'utf8').digest('hex'));
    expect(onDisk.length).toBeGreaterThan(2);
  });

  it('records a checksum column and stores one for every migration it applies', async () => {
    appliedRows = [];
    await migrate();

    expect(
      recorded.some((r) => /ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum/i.test(r.sql)),
      'the runner never adds the checksum column, so an environment created before it '
        + 'would silently keep tracking filenames only',
    ).toBe(true);

    const inserts = recorded.filter((r) => /INSERT INTO _migrations/.test(r.sql));
    expect(inserts).toHaveLength(onDisk.length);
    for (const ins of inserts) {
      expect(ins.sql, 'an INSERT that omits the checksum leaves the row unverifiable forever').toMatch(/checksum/);
      expect(ins.params?.[1], `no checksum stored for ${String(ins.params?.[0])}`).toBe(sha(String(ins.params?.[0])));
    }
    expect(poolEnded).toBe(true);
  });

  it('REFUSES when a file on disk no longer matches what was applied', async () => {
    const victim = '0050_gps_perimeter.sql';
    expect(onDisk, 'the file this regression happened to is gone; pick another victim').toContain(victim);
    appliedRows = allAppliedExcept({ [victim]: 'f'.repeat(64) });

    await expect(migrate()).rejects.toThrow(new RegExp(`${victim}[\\s\\S]*EDITED AFTER IT WAS APPLIED`));

    // AND IT MUST NOT HAVE RE-APPLIED IT. Silently re-running an edited migration
    // would be the other wrong answer: forward-only means a change arrives as a new
    // file, never as a replay of an old one.
    expect(recorded.some((r) => /COMMENT ON TABLE gps_jurisdiction_profile/.test(r.sql))).toBe(false);
    expect(recorded.some((r) => /INSERT INTO _migrations/.test(r.sql))).toBe(false);
  });

  it('names both digests, so the failure is diagnosable without a database', async () => {
    const victim = '0047_gps.sql';
    appliedRows = allAppliedExcept({ [victim]: 'a'.repeat(64) });
    await expect(migrate()).rejects.toThrow(new RegExp(`${'a'.repeat(64)}[\\s\\S]*${sha(victim)}`));
    // And it says what to do, because "checksum mismatch" alone gets fixed by editing
    // the recorded row.
    await expect(migrate()).rejects.toThrow(/NEW migration/);
  });

  it('backfills a NULL checksum instead of failing an environment that predates the column', async () => {
    const victim = '0049_gps_delivery.sql';
    appliedRows = allAppliedExcept({ [victim]: null });

    await migrate();

    const update = recorded.find((r) => /UPDATE _migrations SET checksum/.test(r.sql));
    expect(update, 'a row applied before the column existed must acquire a baseline, not throw').toBeTruthy();
    expect(update?.params).toEqual([sha(victim), victim]);
    // Backfill is not re-application.
    expect(recorded.some((r) => /INSERT INTO _migrations/.test(r.sql))).toBe(false);
    expect(recorded.some((r) => /CREATE TABLE IF NOT EXISTS gps_milestone/.test(r.sql))).toBe(false);
  });

  it('leaves a matching applied migration completely alone', async () => {
    appliedRows = allAppliedExcept({});
    await migrate();
    expect(recorded.some((r) => /UPDATE _migrations/.test(r.sql))).toBe(false);
    expect(recorded.some((r) => /INSERT INTO _migrations/.test(r.sql))).toBe(false);
    // The only statements left are the two bootstrap DDLs and the one SELECT.
    expect(recorded.filter((r) => /_migrations/.test(r.sql))).toHaveLength(3);
  });
});
