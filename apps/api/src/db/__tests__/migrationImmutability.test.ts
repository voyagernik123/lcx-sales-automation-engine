import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PENDING_MIGRATIONS, SHIPPED_MIGRATIONS } from '../migrationLedger.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A MIGRATION THAT HAS SHIPPED IS IMMUTABLE, AND THE GATE — NOT A DATABASE —
 *  IS WHERE THAT HAS TO BE CHECKED.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `db/migrate.ts` now records a sha256 per applied file and refuses when the file
 *  on disk disagrees. That closes the runner, and it closes NOTHING IN CI: the gate
 *  never runs the runner against production, and production migrations are applied
 *  by hand in the Supabase SQL editor. The regression this file exists for was
 *  therefore invisible to every check that actually runs on a pull request —
 *  `0050_gps_perimeter.sql` was edited after it was applied, the repository showed
 *  the new `COMMENT ON TABLE` and production kept the old one, type-check, lint and
 *  1,900 tests all passed.
 *
 *  So the bytes are pinned here, with no database involved. Editing a shipped
 *  migration fails this test by name, and the fix is the one the schema's own rules
 *  require: revert the file and deliver the change as a NEW migration.
 *
 *  WHY TWO LISTS. An UNAPPLIED migration is legitimately editable — it has reached
 *  no environment, so nothing can be out of step with it. Freezing those would make
 *  the ratchet a nuisance that gets deleted. `SHIPPED` is pinned by content;
 *  `PENDING` is named but not pinned, and the two together must cover the directory
 *  EXACTLY. That last part is what stops the ratchet going vacuous: a new file
 *  cannot appear without a deliberate edit here, so nobody can add
 *  `0057_whatever.sql`, ship it, edit it and be told nothing.
 *
 *  WHEN A PENDING MIGRATION IS APPLIED: move its name out of `PENDING`, add its
 *  digest to `SHIPPED` (`shasum -a 256 apps/api/src/db/migrations/NNNN_*.sql`), and
 *  from that moment it is frozen like the rest.
 */

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * The two lists live in `db/migrationLedger.ts`, not here. `deploySafety.test.ts`
 * needs the same answer to "has 0053 reached a database?", and a second copy of it
 * would let the two ratchets disagree — the immutability test calling a file frozen
 * while the deploy-safety test still calls it pending. Aliased to the short names the
 * assertions below already read with.
 */
const SHIPPED = SHIPPED_MIGRATIONS;
const PENDING = PENDING_MIGRATIONS;

const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const sha = (file: string) =>
  createHash('sha256').update(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'), 'utf8').digest('hex');

describe('shipped migrations are immutable', () => {
  it('finds the directory at all', () => {
    // Non-vacuity first: an empty read makes every loop below pass for free, which is
    // the standard way a content ratchet dies quietly.
    expect(onDisk.length).toBeGreaterThanOrEqual(Object.keys(SHIPPED).length);
  });

  it('every shipped migration still has exactly the content it shipped with', () => {
    for (const [file, digest] of Object.entries(SHIPPED)) {
      expect(onDisk, `${file} is recorded as shipped and is no longer on disk`).toContain(file);
      expect(
        sha(file),
        `${file} HAS BEEN EDITED. It has already been applied, and db/migrate.ts skips `
          + 'applied filenames — so this edit changes nothing in any environment that ran '
          + 'it, while the repository claims otherwise. That is exactly how production '
          + 'kept a COMMENT the diff itself called a false claim. Revert this file and '
          + 'deliver the change as a NEW migration.',
      ).toBe(digest);
    }
  });

  it('accounts for every file in the directory, so a new one cannot arrive unnoticed', () => {
    const known = new Set([...Object.keys(SHIPPED), ...PENDING]);
    for (const file of onDisk) {
      expect(
        known.has(file),
        `${file} is in db/migrations and is neither pinned as shipped nor listed as `
          + 'pending. Add it to PENDING while it is unapplied, and move it into SHIPPED '
          + 'with its digest once it has been applied.',
      ).toBe(true);
    }
    for (const file of PENDING) {
      expect(onDisk, `${file} is listed as pending but does not exist`).toContain(file);
      expect(
        Object.keys(SHIPPED),
        `${file} is in both lists. A migration is either frozen or editable, not both.`,
      ).not.toContain(file);
    }
  });

  it('the pending list names the files the API tells an operator to run', () => {
    /**
     * The other half of the 503-that-names-a-wrong-file bug: three surfaces named
     * migrations that did not exist, so an operator was sent to run a file nobody had
     * written. Now they exist — and this asserts the constants and the directory agree,
     * in the one place that can see both.
     */
    const SRC = resolve(MIGRATIONS_DIR, '..', '..');
    const declared = new Set<string>();
    for (const rel of ['gps/loop.ts', 'gps/underwrite.ts', 'routes/gpsOrigination.ts']) {
      const code = readFileSync(resolve(SRC, rel), 'utf8');
      for (const m of code.matchAll(/'(\d{4}_[a-z0-9_]+\.sql)'/g)) declared.add(m[1]!);
    }
    expect(declared.size, 'no pending-migration constant found — the regex has stopped matching').toBeGreaterThanOrEqual(3);
    for (const file of declared) {
      expect(
        onDisk,
        `the API tells an operator to run ${file} and no such file exists. They cannot `
          + 'run it, so the surface refuses forever.',
      ).toContain(file);
      expect(
        Object.keys(SHIPPED),
        `${file} is advertised as PENDING by the API but is pinned as already shipped. `
          + 'One of the two is lying to the desk.',
      ).not.toContain(file);
    }
  });
});
