import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PENDING_MIGRATIONS, SHIPPED_MIGRATIONS } from '../../db/migrationLedger.js';
import { RETENTION_MIGRATION } from '../retention.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  0064 IS PASTED INTO A SQL EDITOR BY A HUMAN, so its properties are checked here.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Production applies migrations by hand: someone opens Supabase, pastes the file,
 *  and presses run — sometimes twice, sometimes on an environment where a lower
 *  numbered file has not landed. Nothing in CI executes this SQL, so every property
 *  that makes it safe to do that has to be asserted against the TEXT.
 *
 *  The five properties, and what each one prevents:
 *   · IDEMPOTENT — a second paste is a no-op, not an error halfway through.
 *   · FORWARD-ONLY — no DROP, DELETE, TRUNCATE or ALTER COLUMN TYPE. A human running
 *     a migration to "set things up" must not be able to destroy evidence with it.
 *   · SELF-SUFFICIENT — it does not require 0059-0062, which are still pending, and
 *     it does not fail on an environment where they have landed.
 *   · RLS DECLARED — Supabase exposes `public` through an auto-generated REST API,
 *     and this ledger names who deleted what from a regulatory register.
 *   · REGISTERED — `migrationImmutability.test.ts` requires SHIPPED ∪ PENDING to
 *     cover the directory exactly, so an unregistered file breaks the ratchet.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../db/migrations/0064_marketing_retention.sql');
const sql = readFileSync(FILE, 'utf8');

/** Comments stripped, so a prose mention of "DROP" is not read as a statement. */
const statements = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('0064 exists and is the file the engine names', () => {
  it('is named by RETENTION_MIGRATION so every refusal points at a real file', () => {
    // The failure this prevents: a refusal telling an operator to apply a migration
    // whose name has drifted from the file on disk.
    expect(RETENTION_MIGRATION).toBe('0064_marketing_retention.sql');
    expect(sql.length).toBeGreaterThan(2000);
  });

  it('is registered in the migration ledger as pending', () => {
    expect(PENDING_MIGRATIONS).toContain(RETENTION_MIGRATION);
    expect(Object.keys(SHIPPED_MIGRATIONS)).not.toContain(RETENTION_MIGRATION);
  });

  it('says on its face that it needs applying by hand', () => {
    expect(sql).toMatch(/NEEDS APPLYING BY HAND/);
  });
});

describe('0064 is forward-only', () => {
  it('contains no DROP, DELETE, TRUNCATE or ALTER COLUMN TYPE', () => {
    // Non-vacuity: the stripped body must still contain the statements we expect,
    // or every assertion below passes over an empty string.
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS marketing_retention_run/);

    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
    expect(statements).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(statements).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+TYPE/i);
    expect(statements).not.toMatch(/\bSET\s+NOT\s+NULL\b/i);
  });

  it('adds columns only with IF NOT EXISTS', () => {
    const adds = statements.match(/ADD COLUMN[^,;]*/gi) ?? [];
    expect(adds.length).toBeGreaterThanOrEqual(4);
    for (const a of adds) expect(a).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  it('creates every table and index idempotently', () => {
    for (const s of statements.match(/CREATE TABLE[^(]*/gi) ?? []) {
      expect(s).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    }
    for (const s of statements.match(/CREATE INDEX[^(]*/gi) ?? []) {
      expect(s).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    }
  });
});

describe('0064 does not depend on a migration that has not landed', () => {
  it('guards every marketing_record statement behind a to_regclass probe', () => {
    // 0061 is PENDING. An unguarded `CREATE INDEX ... ON marketing_record` would abort
    // the whole paste for a human running this on production today.
    expect(statements).toMatch(/to_regclass\('public\.marketing_record'\)/);
    const guarded = /IF to_regclass\('public\.marketing_record'\) IS NOT NULL THEN([\s\S]*?)END IF;/
      .exec(statements)?.[1] ?? '';
    expect(guarded).toMatch(/marketing_record_comment_idx/);
    expect(guarded).toMatch(/marketing_record_retention_idx/);
    // And no marketing_record DDL outside the guard.
    const outside = statements.replace(
      /DO \$\$[\s\S]*?\$\$;/g, '',
    );
    expect(outside).not.toMatch(/ON marketing_record\b/);
  });

  it('re-declares the columns and index 0061 also adds, idempotently', () => {
    // Overlap with a pending file is intentional: either order must work, because a
    // hand-applied schema that depends on an unapplied file ends up in a state no
    // file describes.
    expect(statements).toMatch(/ADD COLUMN IF NOT EXISTS retention_class/);
    expect(statements).toMatch(
      /CREATE INDEX IF NOT EXISTS marketing_x_reply_author_lower_idx[\s\S]*?lower\(author_handle\)/,
    );
  });
});

describe('0064 gives the clock what it needs to be a clock', () => {
  it('creates the run ledger with mode, attribution and the refusal codes', () => {
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS marketing_retention_run/);
    expect(statements).toMatch(/mode\s+text NOT NULL/);
    expect(statements).toMatch(/mode IN \('dry_run', 'enforce'\)/);
    expect(statements).toMatch(/CHECK \(btrim\(ran_by\) <> ''\)/);
    // A run that deleted nothing because it refused must not look like a run with
    // nothing to do.
    expect(statements).toMatch(/refusal_codes\s+text\[\] NOT NULL/);
  });

  it('leaves the three count columns NULLABLE, because null and 0 mean different things', () => {
    // NULL = "this run did not do that part" (a dry run, or 0061 absent);
    // 0 = "it ran and nothing was due". Collapsing them makes the ledger unable to
    // answer the question it exists for.
    for (const col of [
      'third_party_rows_deleted',
      'third_party_rows_minimised',
      'record_rows_expired',
    ]) {
      const decl = new RegExp(`${col}\\s+integer([^,]*)`, 'i').exec(statements)?.[1] ?? '';
      expect(decl, `${col} must stay nullable`).not.toMatch(/NOT NULL/i);
    }
  });

  it('adds the minimisation columns and the hold reason', () => {
    expect(statements).toMatch(/ADD COLUMN IF NOT EXISTS body_hash/);
    expect(statements).toMatch(/ADD COLUMN IF NOT EXISTS body_minimised_at/);
    expect(statements).toMatch(/ADD COLUMN IF NOT EXISTS retention_hold_reason/);
  });

  it('adds the partial index the jeopardy join needs', () => {
    expect(statements).toMatch(
      /marketing_reply_draft_approved_idx[\s\S]*?WHERE status = 'approved'/,
    );
  });

  it('enables row level security on the ledger', () => {
    // Deny-all with no policy is the intent: the API connects as owner and bypasses
    // RLS, and nothing holding the anon key should read who deleted what.
    expect(statements).toMatch(/ALTER TABLE marketing_retention_run ENABLE ROW LEVEL SECURITY/);
  });
});

describe('0064 is honest about what it is not', () => {
  it('states that the period is an inference and the DPO ruling is outstanding', () => {
    expect(sql).toMatch(/INFERENCE, NOT A CITATION|inference, not a citation/i);
    expect(sql).toMatch(/DPO RULING/i);
    expect(sql).toMatch(/Art 68\(9\)/);
    expect(sql).toMatch(/Art 17\(3\)\(b\)/);
  });

  it('does not claim to have fixed the competing sweep', () => {
    // `service.ts sweepExpired` still runs on the mail tick and knows nothing about
    // jeopardy. If a comment here ever asserts the protection is complete, it would
    // be a guarantee the code does not keep.
    expect(sql).not.toMatch(/fully protect|guarantees that|cannot be lost/i);
  });

  it('stores no credential and adds no column holding a stranger\'s words', () => {
    expect(statements).not.toMatch(/token|passcode|api_key|secret/i);
    // body_hash is a digest; retention_hold_reason is LCX's own sentence.
    expect(sql).toMatch(/body_hash` is a digest/);
  });
});
