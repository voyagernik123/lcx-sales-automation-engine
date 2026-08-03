import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE THREE MIGRATIONS THAT EXISTED ONLY AS STRING CONSTANTS.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `gps/underwrite.ts` named `0052_gps_underwriting.sql`, `gps/loop.ts` named
 *  `0053_gps_outcome.sql` and `routes/gpsOrigination.ts` named
 *  `0054_gps_origination.sql`. None of the three files existed. Origination reported
 *  `migrated: false` for every read and 503 for every write, outcome capture
 *  answered 503, and underwriting refused with UNDERWRITING_REGISTRY_ABSENT — not
 *  because a migration was pending, but because there was nothing to apply. An
 *  operator following the 503 had nowhere to go.
 *
 *  These assertions derive what the schema OWES from the SQL the callers already
 *  contain — the column lists they select and insert — rather than from a list
 *  retyped here. A migration that omits a column the reader selects would raise
 *  42703 in production on a schema that this test would otherwise call complete.
 */

const DB = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(DB, '..', 'migrations');
const SRC = resolve(DB, '..', '..');

const sql = (file: string) => readFileSync(resolve(MIGRATIONS, file), 'utf8');
const src = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const UNDERWRITING = sql('0052_gps_underwriting.sql');
const OUTCOME = sql('0053_gps_outcome.sql');
const ORIGINATION = sql('0054_gps_origination.sql');
const DELIVERY_GAPS = sql('0056_gps_delivery_gaps.sql');

/** Column names declared by a CREATE TABLE body or an ADD COLUMN in this SQL. */
function declared(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(/^\s{2,}([a-z_][a-z0-9_]*)\s+(uuid|text|bigint|integer|numeric|boolean|date|timestamptz|jsonb)\b/gim)) {
    out.add(m[1]!.toLowerCase());
  }
  for (const m of code.matchAll(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi)) {
    out.add(m[1]!.toLowerCase());
  }
  return out;
}

/** The identifiers inside a `const NAME = \`…\`` column list in a source file. */
function columnListConst(code: string, name: string): string[] {
  const m = new RegExp(`const ${name} = \`([^\`]+)\``).exec(code);
  expect(m, `${name} is no longer a backtick column list — this extraction has gone blind`).toBeTruthy();
  return m![1]!.split(',').map((s) => s.trim()).filter((s) => /^[a-z_][a-z0-9_]*$/.test(s));
}

describe('0054 declares what origination reads and writes', () => {
  const cols = declared(ORIGINATION);

  it('creates the two tables the migration probe requires', () => {
    expect(ORIGINATION).toMatch(/CREATE TABLE IF NOT EXISTS gps_target\b/);
    expect(ORIGINATION).toMatch(/CREATE TABLE IF NOT EXISTS gps_outreach_opening\b/);
    // `observations` is 0029's and must NOT be recreated here: the probe requires all
    // three, and a second definition of the provenance spine is how two ledgers appear.
    expect(ORIGINATION).not.toMatch(/CREATE TABLE[^;]*\bobservations\b/i);
  });

  it('declares every column TARGET_COLS selects', () => {
    const wanted = columnListConst(src('gps/origination.ts'), 'TARGET_COLS');
    expect(wanted.length).toBeGreaterThan(20);
    for (const c of wanted) {
      expect(cols, `gps_target has no ${c} column, and origination.ts selects it — 42703 in production`).toContain(c);
    }
  });

  it('declares every column OPENING_COLS selects', () => {
    const wanted = columnListConst(src('gps/origination.ts'), 'OPENING_COLS');
    expect(wanted.length).toBeGreaterThanOrEqual(8);
    for (const c of wanted) {
      expect(cols, `gps_outreach_opening has no ${c} column, and origination.ts selects it`).toContain(c);
    }
  });
});

describe('0053 declares what outcome capture writes', () => {
  const cols = declared(OUTCOME);

  it('creates gps_outcome keyed by engagement, which is the idempotency key', () => {
    expect(OUTCOME).toMatch(/CREATE TABLE IF NOT EXISTS gps_outcome\b/);
    expect(
      OUTCOME,
      'engagement_id must be the PRIMARY KEY: `ON CONFLICT (engagement_id) DO UPDATE` in '
        + 'loop.ts is how re-closing an engagement corrects one row instead of adding a '
        + 'second win to the book, and it needs a unique constraint to conflict on.',
    ).toMatch(/engagement_id\s+uuid PRIMARY KEY/);
  });

  it('declares every column the INSERT names', () => {
    const insert = /INSERT INTO gps_outcome \(([\s\S]*?)\)\s*VALUES/.exec(src('gps/loop.ts'));
    expect(insert, 'recordOutcome no longer contains an INSERT INTO gps_outcome').toBeTruthy();
    const wanted = insert![1]!.split(',').map((s) => s.trim()).filter((s) => /^[a-z_]+$/.test(s));
    expect(wanted).toContain('factor_scores_at_quote');
    for (const c of wanted) {
      expect(cols, `gps_outcome has no ${c} column and recordOutcome inserts into it`).toContain(c);
    }
    // Written by the DEFAULT and the ON CONFLICT clause rather than by the column list.
    for (const c of ['recorded_at', 'updated_at']) expect(cols).toContain(c);
  });

  it('stores no derived figure', () => {
    // Margin is computed by calibration.ts. A stored copy is the stale number a screen
    // quotes after the price is corrected.
    for (const forbidden of [/\bmargin[a-z_]*\s+(bigint|numeric|integer)/i, /\bp_loss\b/i]) {
      expect(OUTCOME).not.toMatch(forbidden);
    }
  });
});

describe('0052 declares what underwriting reads', () => {
  const cols = declared(UNDERWRITING);

  it('creates both registries the presence probe asks about', () => {
    expect(UNDERWRITING).toMatch(/CREATE TABLE IF NOT EXISTS gps_rate_card\b/);
    expect(UNDERWRITING).toMatch(/CREATE TABLE IF NOT EXISTS gps_effort_triple\b/);
  });

  it('declares every column RATE_CARD_COLS selects', () => {
    for (const c of columnListConst(src('gps/underwrite.ts'), 'RATE_CARD_COLS')) {
      expect(cols, `gps_rate_card has no ${c} column and underwrite.ts selects it`).toContain(c);
    }
  });

  it('declares the effort-triple columns and the engagement partner column', () => {
    for (const c of ['optimistic_days', 'likely_days', 'pessimistic_days', 'stated_by', 'stated_at']) {
      expect(cols).toContain(c);
    }
    expect(UNDERWRITING).toMatch(/ALTER TABLE gps_engagement ADD COLUMN IF NOT EXISTS partner_id text/);
  });

  it('leaves valid_until without a DEFAULT, because a defaulted expiry is a fabricated review date', () => {
    const line = /valid_until[^,]*/.exec(UNDERWRITING)?.[0] ?? '';
    expect(line).not.toMatch(/DEFAULT/i);
    expect(line).not.toMatch(/NOT NULL/i);
  });
});

describe('0056 closes the delivery gaps the desk substitutes for', () => {
  it('adds the four columns DELIVERY_SCHEMA_GAPS names', () => {
    const all = DELIVERY_GAPS;
    expect(all).toMatch(/ALTER TABLE gps_milestone\s+ADD COLUMN IF NOT EXISTS milestone_key text/);
    expect(all).toMatch(/ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS milestone_key text/);
    expect(all).toMatch(/ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS review_basis text/);
    expect(all).toMatch(/ALTER TABLE gps_deliverable ADD COLUMN IF NOT EXISTS accepted_by text/);
    expect(all).toMatch(/ALTER TABLE gps_disclosure_record ADD COLUMN IF NOT EXISTS text_sha256 text/);
  });

  it('adds the unique index whose absence let a concurrent write become invisible', () => {
    expect(
      DELIVERY_GAPS,
      'without UNIQUE (engagement_id, milestone_key) two concurrent state writes for one '
        + 'milestone create two rows and the composer silently reads one of them',
    ).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON gps_milestone \(engagement_id, milestone_key\)/);
  });

  it('backfills nothing and defaults nothing', () => {
    // A DEFAULT would fabricate a review basis or an acceptor for every row on file,
    // and gps_disclosure_record is append-only by trigger so an UPDATE would RAISE.
    expect(DELIVERY_GAPS).not.toMatch(/ADD COLUMN IF NOT EXISTS \w+ text[^;]*DEFAULT/i);
    expect(DELIVERY_GAPS).not.toMatch(/^\s*UPDATE\s/im);
  });
});

describe('every new migration keeps the compartment closed', () => {
  const files = {
    '0052_gps_underwriting.sql': UNDERWRITING,
    '0053_gps_outcome.sql': OUTCOME,
    '0054_gps_origination.sql': ORIGINATION,
    '0055_gps_perimeter_comment.sql': sql('0055_gps_perimeter_comment.sql'),
    '0056_gps_delivery_gaps.sql': DELIVERY_GAPS,
    // 0066, the price-band register. Listed HERE as well as in its own file
    // (`gpsPriceBandMigration.test.ts`) so the three compartment-wide properties — it names
    // D2, it enables RLS with no policy, it is forward-only — are checked by the ratchet that
    // knows about all GPS migrations rather than only by the one that knows about this table.
    // A per-migration test is where a new file's rules get forgotten.
    '0066_gps_price_band.sql': sql('0066_gps_price_band.sql'),
  };

  it('names the unanswered DPO question, as every GPS migration must', () => {
    for (const [name, code] of Object.entries(files)) {
      expect(/\bD2\b|\bDPO\b|controller vs processor/i.test(code), `${name} does not name D2`).toBe(true);
    }
  });

  it('enables RLS on every table it creates, with no policy', () => {
    for (const [name, code] of Object.entries(files)) {
      for (const m of code.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) {
        expect(
          code,
          `${name} creates ${m[1]} and never enables row level security. Supabase exposes `
            + 'public tables through its auto-generated REST API, so the anon key would read it.',
        ).toMatch(new RegExp(`ALTER TABLE ${m[1]}\\s+ENABLE ROW LEVEL SECURITY`));
      }
      expect(code, `${name} defines an RLS policy; deny-all with no policy is the intent`).not.toMatch(/CREATE POLICY/i);
    }
  });

  it('is forward-only: nothing destructive, in any of them', () => {
    /**
     * STATEMENTS ONLY — line comments are stripped first. These files EXPLAIN why they
     * avoid `DROP CONSTRAINT IF EXISTS`, and a scan of raw text would fire on the
     * explanation, which teaches the next person to delete the explanation rather than
     * to keep the property.
     */
    const statementsOf = (code: string) => code.replace(/--[^\n]*/g, '');
    for (const [name, raw] of Object.entries(files)) {
      const code = statementsOf(raw);
      // DROP CONSTRAINT is on the list too, though 0051 legitimately used it: these
      // five are applied by hand in the Supabase SQL editor, which raises a
      // destructive-operation warning on any DROP and costs the person applying them a
      // round trip to decide about. Inline CHECKs on ADD COLUMN IF NOT EXISTS are
      // re-runnable without one.
      for (const pattern of [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bTRUNCATE\b/i, /^\s*DELETE\s+FROM/im, /\bDROP\s+INDEX\b/i, /\bDROP\s+CONSTRAINT\b/i]) {
        expect(code, `${name} matches ${pattern} — a human applies these by hand and a destructive statement costs a round trip`).not.toMatch(pattern);
      }
    }
  });
});
