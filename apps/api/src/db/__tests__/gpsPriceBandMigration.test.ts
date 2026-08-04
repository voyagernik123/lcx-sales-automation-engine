import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTERED_MIGRATIONS } from '../migrationLedger.js';
import { PRICE_BAND_REGISTER_DDL } from '../../routes/gpsInputs.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  0066 AND THE DDL THE ROUTE HANDS AN OPERATOR ARE THE SAME SCHEMA.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /v1/gps/inputs` and both write paths return `PRICE_BAND_REGISTER_DDL` in their `meta`
 * whenever `gps_price_band` is absent, so an operator can paste the table into the Supabase
 * SQL editor without finding a file. That is genuinely useful and it is also a second copy of
 * a schema — and the failure mode of two copies is specific here: whichever one was run
 * decides what the CHECK constraints are, and the one nobody ran is the one the repository
 * shows. `0050_gps_perimeter.sql` is the precedent — edited after being applied, production
 * kept the old COMMENT, and 1,900 tests passed.
 *
 * So this file holds them equal. Every STATEMENT of the constant must appear in the migration,
 * normalised for whitespace only. It does not require the reverse: the migration carries a
 * header the route's `meta` has no business shipping to a browser.
 *
 * ══ WHY IT ALSO CHECKS THE LEDGER ══
 * A migration file nobody lists is a migration nobody applies, and the surface that needs it
 * refuses forever while looking finished. `migrationImmutability.test.ts` covers the whole
 * directory; this asserts the specific pairing — 0066 is listed as PENDING, not frozen as
 * SHIPPED, because no environment has run it yet.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = '0066_gps_price_band.sql';
const SQL = readFileSync(resolve(HERE, '..', 'migrations', FILE), 'utf8');

/** Statements only: the `--` prose in both texts explains what they avoid. */
const codeOnly = (sql: string) =>
  sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

/** Whitespace-normalised, so a reflow of either copy is not a failure. */
const flat = (sql: string) => codeOnly(sql).replace(/\s+/g, ' ').trim();

/**
 * The constant's statements, split on `;` at the end of a line.
 *
 * Split rather than compared whole, so a failure names the ONE statement that differs instead
 * of printing two kilobytes of SQL and leaving the reader to diff it by eye.
 */
const STATEMENTS = flat(PRICE_BAND_REGISTER_DDL)
  .split(/;\s*/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

describe('0066 is the DDL the input desk tells an operator to run', () => {
  it('finds both texts, or every assertion below is vacuous', () => {
    expect(SQL.length).toBeGreaterThan(500);
    expect(STATEMENTS.length).toBeGreaterThanOrEqual(3);
  });

  it('contains every statement of PRICE_BAND_REGISTER_DDL, verbatim modulo whitespace', () => {
    const migration = flat(SQL);
    const missing = STATEMENTS.filter((s) => !migration.includes(s));
    expect(
      missing.map((s) => s.slice(0, 120)),
      `${FILE} and PRICE_BAND_REGISTER_DDL (routes/gpsInputs.ts) have diverged. An operator `
      + 'pasting the route\'s copy would create a different table from the one this file '
      + 'documents, and the CHECK constraints would depend on which one they used.',
    ).toEqual([]);
  });

  it('creates the table the presence probe asks about, by that exact name', () => {
    // `inputRegisters()` reads `to_regclass('public.gps_price_band')`. A table created under
    // any other name leaves the desk reporting the register absent forever.
    expect(codeOnly(SQL)).toMatch(/CREATE TABLE IF NOT EXISTS gps_price_band\b/);
  });

  it('enables RLS with no policy, so the anon key reads nothing', () => {
    // Supabase exposes public tables through its auto-generated REST API. RLS on with no
    // policy is deny-all; the API connects as the owner and bypasses it (0052:214, 0047:333).
    expect(codeOnly(SQL)).toMatch(/ALTER TABLE gps_price_band\s+ENABLE ROW LEVEL SECURITY/);
    expect(codeOnly(SQL)).not.toMatch(/CREATE POLICY/i);
  });

  it('defaults no money column, so an absent price cannot arrive as free work', () => {
    for (const col of ['low_cents', 'mid_cents', 'high_cents']) {
      const decl = new RegExp(`${col}\\s+bigint[^,]*`, 'i').exec(codeOnly(SQL));
      expect(decl, `${col} is not declared`).not.toBeNull();
      expect(decl![0], `${col} carries a DEFAULT; a defaulted 0 prices the work as free`)
        .not.toMatch(/DEFAULT/i);
      expect(decl![0], `${col} may be zero or negative`).toMatch(/> 0/);
    }
  });

  it('constrains the ordering, which nothing in the code path clamps', () => {
    // `gps_effort_triple` (0052:153) deliberately has no ordering CHECK because
    // `resolveDuration` clamps a transposed triple. Nothing clamps a price band, so a
    // hand-typed INSERT is the case this constraint exists for.
    expect(codeOnly(SQL)).toMatch(/gps_price_band_ascending/);
    expect(codeOnly(SQL)).toMatch(/low_cents <= mid_cents AND mid_cents <= high_cents/);
  });

  it('seeds no row: an invented price is worse than an absent one', () => {
    expect(codeOnly(SQL)).not.toMatch(/^\s*INSERT\s+INTO/im);
  });

  it('is forward-only — a human pastes this into a SQL editor by hand', () => {
    const code = codeOnly(SQL);
    for (const pattern of [
      /\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bDROP\s+INDEX\b/i, /\bDROP\s+CONSTRAINT\b/i,
      /\bTRUNCATE\b/i, /^\s*DELETE\s+FROM/im, /ALTER COLUMN .* TYPE/i,
    ]) {
      expect(code, `matches ${pattern}, and the SQL editor raises a destructive-operation warning`)
        .not.toMatch(pattern);
    }
    // Idempotent: re-running it is a no-op, and COMMENT replaces rather than appends.
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS/);
    // Anti-vacuity: the comment strip must not have emptied the file.
    expect(code).toMatch(/gps_price_band/);
  });

  it('names D2, as every GPS migration must, and says why it does not bite here', () => {
    // The convention `gpsPendingSchema.test.ts` enforces across the other GPS migrations.
    // "It does not apply" and "nobody checked" look identical in a file that omits it.
    expect(/\bD2\b|\bDPO\b|controller vs processor/i.test(SQL)).toBe(true);
  });

  it('is accounted for in the ledger', () => {
    /* Repointed 2026-08-04 from PENDING to REGISTERED: production turned out to have
     * these applied, so "is pending" became a false premise. The invariant that
     * matters — the ledger accounts for the file, and the order it must be applied in
     * is preserved — is unchanged. See migrationLedger.ts REGISTERED_MIGRATIONS. */
    expect(REGISTERED_MIGRATIONS, `${FILE} exists and the ledger has never heard of it`)
      .toContain(FILE);
  });
});
