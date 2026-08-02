import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GATE_MIGRATION } from '../outboundGate.js';
import { PENDING_MIGRATIONS, SHIPPED_MIGRATIONS } from '../../db/migrationLedger.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  0062, AND A GENERIC RLS SCAN OVER EVERY MARKETING MIGRATION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 0062 created `marketing_outbound_gate_decision` and `marketing_reply_corroboration`
 * with NO `ENABLE ROW LEVEL SECURITY` at all. 0046 ends with two, 0060 with two, 0061 with
 * six. On Supabase, `public` tables are reachable through the auto-generated REST API, so
 * an anon key could read the desk's complete refusal history and — worse —
 * `assets_extracted`, which is the set of symbols marketing was drafting about BEFORE any
 * announcement. That column exists to make the Art 90 perimeter auditable, and unprotected
 * it publishes the inside information the perimeter is there to contain.
 *
 * WHY NOTHING CAUGHT IT, and why this file is written the way it is: 0060 and 0061 were
 * each covered by their OWN per-migration assertion (`abuseRegisterMigration.test.ts:238`,
 * `recordMigration.test.ts:290`), so the coverage was a coincidence of who happened to
 * write a test. The only ratchet that ITERATES migration files —
 * `db/__tests__/gpsPendingSchema.test.ts` — walks a hardcoded map of 0052-0056 and is
 * GPS-scoped. Nothing scanned a directory.
 *
 * So the first describe below reads the directory and holds EVERY marketing migration to
 * the rule, present and future. A new marketing migration that creates a public table and
 * forgets RLS fails here without anyone remembering to write a test for it.
 *
 * SCOPED TO MARKETING DELIBERATELY. A repository-wide scan would fail on pre-existing
 * non-marketing tables, and a ratchet that starts red gets an exception list, and an
 * exception list is where the next one hides. `PALETTE_PAGE_GAP_NOT_OURS` in the ⌘K lane
 * records the same judgement for the same reason.
 */

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

/** Every migration this compartment owns, by the tables it creates. */
const MARKETING_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && /marketing/i.test(f))
  .sort();

const read = (file: string) => readFileSync(resolve(MIGRATIONS, file), 'utf8');

/** `CREATE TABLE [IF NOT EXISTS] name (` — the `public` schema unless qualified. */
function tablesCreatedIn(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([\w.]+)\s*\(/gi)]
    .map((m) => m[1])
    .filter((t) => !t.includes('.') || t.startsWith('public.'));
}

describe('every marketing migration enables RLS on every public table it creates', () => {
  it('finds the migrations at all', () => {
    // Non-vacuity first: an empty read makes every loop below pass for free, which is the
    // standard way a content ratchet dies quietly.
    expect(MARKETING_MIGRATIONS.length).toBeGreaterThanOrEqual(4);
    expect(MARKETING_MIGRATIONS).toContain(GATE_MIGRATION);
  });

  for (const file of MARKETING_MIGRATIONS) {
    it(`${file} leaves no public table without RLS`, () => {
      const sql = read(file);
      for (const table of tablesCreatedIn(sql)) {
        const bare = table.replace(/^public\./, '');
        expect(
          sql,
          `${file} creates ${bare} and never enables row level security on it. `
          + 'Supabase exposes public tables through its REST API; RLS with no policy is '
          + 'deny-all, which is the intent.',
        ).toMatch(new RegExp(`ALTER TABLE (?:public\\.)?${bare}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
      }
    });
  }

  it('is scanning real CREATE TABLE statements, not matching nothing', () => {
    const found = MARKETING_MIGRATIONS.flatMap((f) => tablesCreatedIn(read(f)));
    expect(found).toContain('marketing_outbound_gate_decision');
    expect(found).toContain('marketing_reply_corroboration');
    expect(found.length).toBeGreaterThanOrEqual(10);
  });
});

describe('0062 records the reason a draft was blocked', () => {
  const SQL = read(GATE_MIGRATION);

  it('holds a column for the blocking violation rules', () => {
    // `allowed=false` with `refusal_codes={}` and nothing else is a blocked draft whose
    // reason is nowhere — the exact conflation this ledger exists to prevent.
    expect(SQL).toMatch(/violation_codes\s+text\[\] NOT NULL DEFAULT '\{\}'/);
  });

  it('keeps violation ids out of the refusal-code column', () => {
    // Two vocabularies: a `RefusalCode` from the shared union, and a
    // `MarketingViolation.rule` dotted string. Merging them corrupts
    // `loop.ts refusalCodeFrequency`, which is the only honest read the desk has on
    // whether its gates are load-bearing.
    expect(SQL).toMatch(/refusal_codes\s+text\[\]/);
    const insertColumns = /\(reply_id, phase, actor, allowed, disposition, text_sha256,/;
    expect(readFileSync(resolve(MIGRATIONS, '..', '..', 'marketing', 'outboundGate.ts'), 'utf8'))
      .toMatch(insertColumns);
  });

  it('records both outcomes, so "cleared" and "never checked" are distinguishable', () => {
    expect(SQL).toMatch(/allowed\s+boolean NOT NULL/);
    expect(SQL).toMatch(/disposition\s+text NOT NULL CHECK/);
  });

  it('stores a hash and not the text', () => {
    expect(SQL).toMatch(/text_sha256\s+text NOT NULL CHECK \(text_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(SQL).not.toMatch(/^\s+draft_text\s/m);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE LEDGER AND THE DIRECTORY AGREE, FOR MARKETING.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `db/migrationLedger.ts` is the one list two other ratchets read, and it is deliberately
 * NOT derived from the directory — a list computed from `readdirSync` would call a new file
 * shipped the moment it appears, which is the opposite of the point. The cost of that
 * choice is that a file can land on disk and never reach the list, and that is not
 * hypothetical: `0063_marketing_memory.sql` was written, referenced by six 503 branches,
 * and absent from `PENDING_MIGRATIONS`, so nothing checked it and nothing told an operator
 * it was outstanding.
 *
 * `db/__tests__/migrationImmutability.test.ts` catches the generic case. THESE assertions
 * are the marketing-specific ones it does not make: that no two files share a numeric
 * prefix, that the pending list is in the order an operator must apply it in, and that
 * every `*_MIGRATION` constant this compartment exports names a file that exists and is
 * accounted for.
 *
 * WHY THE PREFIX CHECK EARNS ITS PLACE. Five agents wrote 0059-0064 concurrently. Two
 * files numbered 0063 would both be `0063_…` and `db/migrate.ts` orders by filename, so
 * the second would apply after the first and BOTH would be recorded — with the sort order
 * between them decided by the rest of the name. Nothing else in the suite looks for it.
 */
describe('the marketing migrations and the ledger agree', () => {
  const ALL_SQL = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const prefixOf = (f: string) => f.slice(0, 4);

  it('finds the directory and the marketing files in it', () => {
    expect(ALL_SQL.length).toBeGreaterThanOrEqual(60);
    expect(MARKETING_MIGRATIONS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every migration file a unique numeric prefix', () => {
    const byPrefix = new Map<string, string[]>();
    for (const f of ALL_SQL) byPrefix.set(prefixOf(f), [...(byPrefix.get(prefixOf(f)) ?? []), f]);
    const duplicated = [...byPrefix.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([p, files]) => `${p}: ${files.join(' + ')}`);
    expect(
      duplicated,
      'two migrations share a number. `db/migrate.ts` orders by filename, so both would '
      + 'apply and the order between them would be decided by the rest of the name.',
    ).toEqual([]);
  });

  it('accounts for every marketing migration as shipped or pending', () => {
    const known = new Set([...Object.keys(SHIPPED_MIGRATIONS), ...PENDING_MIGRATIONS]);
    for (const f of MARKETING_MIGRATIONS) {
      expect(
        known.has(f),
        `${f} exists and the ledger has never heard of it. An unapplied migration nobody `
        + 'lists is one nobody applies, and the surface that needs it refuses forever.',
      ).toBe(true);
    }
  });

  it('lists the pending marketing migrations in the order they must be applied', () => {
    // The ledger's own docblock says "Apply IN ORDER". A list out of numeric order makes
    // that instruction unfollowable for 0064, which needs 0059 and 0061 first.
    const pendingMarketing = PENDING_MIGRATIONS.filter((f) => /marketing/i.test(f));
    expect(pendingMarketing.length).toBeGreaterThanOrEqual(5);
    expect(pendingMarketing).toEqual([...pendingMarketing].sort());
  });

  it('names a real, unshipped file in every marketing MIGRATION constant', () => {
    // The other half of the 503-that-names-a-wrong-file bug, for this compartment: a
    // surface that tells an operator to run a file which does not exist refuses forever.
    const SRC = resolve(MIGRATIONS, '..', '..');
    const declared = new Map<string, string>();
    for (const rel of [
      'marketing/abuseRegister.ts', 'marketing/record.ts', 'marketing/outboundGate.ts',
      'marketing/retention.ts', 'routes/marketingMemory.ts',
    ]) {
      const code = readFileSync(resolve(SRC, rel), 'utf8');
      for (const m of code.matchAll(/^export const \w*MIGRATION\w* = '(\d{4}_[a-z0-9_]+\.sql)';/gm)) {
        declared.set(m[1]!, rel);
      }
    }
    expect(
      declared.size,
      'no marketing MIGRATION constant matched — the regex has stopped matching and this '
      + 'assertion is now vacuous',
    ).toBeGreaterThanOrEqual(5);
    for (const [file, where] of declared) {
      expect(ALL_SQL, `${where} tells an operator to run ${file}, which does not exist`).toContain(file);
      expect(
        [...Object.keys(SHIPPED_MIGRATIONS), ...PENDING_MIGRATIONS],
        `${where} names ${file} and the ledger does not list it at all`,
      ).toContain(file);
    }
  });
});
