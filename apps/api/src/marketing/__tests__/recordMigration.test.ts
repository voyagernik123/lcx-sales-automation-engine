import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  0061 — THE RECORD REGISTER, PINNED PROPERTY BY PROPERTY.
 * ══════════════════════════════════════════════════════════════════════════════
 *  These assertions are read off the SQL with no database, because PRODUCTION APPLIES
 *  THIS FILE BY HAND in the Supabase SQL editor. No gate ever executes it, so the gate
 *  is the only place its properties can be defended before a human pastes it in.
 *
 *  The five properties that a later edit could quietly lose while the tables kept
 *  working, and that would each cost the compartment its point:
 *
 *   · NOTHING DESTRUCTIVE. No DROP, DELETE, TRUNCATE or ALTER COLUMN TYPE. This file
 *     is pasted into a console by a human against a live database holding third
 *     parties' personal data and five years of regulatory record.
 *   · THE RECORD OUTLIVES THE QUEUE ROW. No foreign key from `marketing_record` into
 *     `marketing_x_reply` or `marketing_reply_draft`. 0046 cascades drafts off replies
 *     and sweeps replies at 90 days; a FK here would make the retention duty delete
 *     the evidence of compliance with the retention duty.
 *   · RETENTION IS BOUNDED AT BOTH ENDS, in the schema and not only in TypeScript, so
 *     a later "tidy up old rows" change cannot quietly shorten it below Art 68(9)'s
 *     five years or run past its seven.
 *   · FOUR EYES CANNOT BE FAKED. `cleared_by <> drafted_by` is a CHECK, not a code path.
 *   · THE ERASURE LOG CANNOT BECOME THE SECOND COPY. No content column exists on it,
 *     so the log that records an erasure cannot hold what was erased.
 *
 *  Plus the two GDPR facts the file is judged on: `author_handle` gets an index (a
 *  case-insensitive one, because a case-sensitive erasure misses `@LCXFan`), and the
 *  lawful-basis columns are NOT defaulted to a basis nobody assessed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = '0061_marketing_record.sql';
const RAW = readFileSync(resolve(HERE, '../../db/migrations', FILE), 'utf8');

/**
 * Line comments stripped for the destructive-statement scan. This file EXPLAINS at
 * length why it deletes nothing and why erasure is executed in TypeScript, so a scan of
 * the raw text would fire on its own explanation — which teaches the next person to
 * delete the explanation rather than keep the property.
 */
const SQL = RAW.replace(/--[^\n]*/g, '');

describe('0061 exists, is substantial, and is not a stub', () => {
  it('is real SQL, not a placeholder', () => {
    // Non-vacuity first: every regex below passes for free against an empty file.
    expect(SQL.length).toBeGreaterThan(4000);
    expect(SQL.match(/CREATE TABLE IF NOT EXISTS/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it('says out loud that it must be applied by hand', () => {
    expect(RAW).toMatch(/APPLY BY HAND/);
    expect(RAW).toMatch(/isRecordMigrated/);
  });

  it('is idempotent in every create it performs', () => {
    const creates = SQL.match(/CREATE (TABLE|INDEX|UNIQUE INDEX)[^;]*/g) ?? [];
    expect(creates.length).toBeGreaterThan(10);
    for (const c of creates) {
      expect(c, `not idempotent: ${c.slice(0, 80)}`).toMatch(/IF NOT EXISTS/);
    }
    for (const alter of SQL.match(/ALTER TABLE marketing_x_reply[^;]*/g) ?? []) {
      // Additive only, and re-runnable.
      expect(alter).toMatch(/ADD COLUMN IF NOT EXISTS/);
    }
  });
});

describe('0061 destroys nothing, because a human pastes it into a live database', () => {
  const forbidden: ReadonlyArray<[RegExp, string]> = [
    [/\bDROP\b/i, 'DROP'],
    [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
    [/\bTRUNCATE\b/i, 'TRUNCATE'],
    [/ALTER\s+COLUMN\s+\w+\s+TYPE/i, 'ALTER COLUMN ... TYPE'],
    [/\bUPDATE\s+\w+\s+SET\b/i, 'UPDATE ... SET'],
  ];
  for (const [re, name] of forbidden) {
    it(`contains no ${name}`, () => {
      expect(re.test(SQL), `${name} appears in ${FILE}`).toBe(false);
    });
  }

  it('seeds no rows at all, so it cannot invent a record nobody wrote', () => {
    // 0046 legitimately seeds entitlements; this file has no reason to insert anything,
    // and a seeded record would be a communication with no human behind it.
    expect(/\bINSERT\s+INTO\b/i.test(SQL)).toBe(false);
  });
});

describe('the record outlives the queue row it answers — the retention split', () => {
  it('creates marketing_record with no foreign key into the 90-day tables', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS marketing_record\b/);
    const table = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS marketing_record'),
      SQL.indexOf('CREATE INDEX IF NOT EXISTS marketing_record_window_idx'),
    );
    expect(table.length).toBeGreaterThan(500);
    expect(
      /REFERENCES\s+marketing_x_reply/i.test(table),
      'a FK to marketing_x_reply would let the 90-day sweep delete the regulatory record',
    ).toBe(false);
    expect(/REFERENCES\s+marketing_reply_draft/i.test(table)).toBe(false);
    expect(/ON DELETE CASCADE/i.test(table)).toBe(false);
    // The link is by value instead.
    expect(table).toMatch(/x_comment_id\s+text/);
  });

  it('splits retention into exactly two named classes', () => {
    expect(SQL).toMatch(/retention_class\s+text NOT NULL/);
    expect(SQL).toMatch(/'lcx_statement'/);
    expect(SQL).toMatch(/'third_party_content'/);
  });

  it('bounds LCX-statement retention at five years and seven, in the schema', () => {
    const check = SQL.match(/CONSTRAINT marketing_record_retention_window CHECK \([\s\S]*?\)\s*,/);
    expect(check, 'the retention ratchet is gone').not.toBeNull();
    const text = check![0];
    expect(text).toMatch(/interval '5 years'/);
    expect(text).toMatch(/interval '7 years'/);
    expect(text).toMatch(/>=/);
    expect(text).toMatch(/<=/);
    // Immutable expression: a now() in a CHECK would not be accepted by Postgres and
    // would make the ratchet un-checkable at insert time.
    expect(/now\(\)/.test(text)).toBe(false);
  });

  it('carries the retention basis as an inference and never as a citation', () => {
    expect(SQL).toMatch(/retention_basis\s+text NOT NULL DEFAULT 'inferred_art_68_9/);
    expect(RAW).toMatch(/MiCA contains NO express retention period/);
    expect(RAW).toMatch(/INFERENCE/);
  });

  it('names the outstanding DPO ruling and the contradiction with 0046', () => {
    expect(RAW).toMatch(/DPO RULING/);
    expect(RAW).toMatch(/90-day/);
    expect(RAW).toMatch(/cannot both be right/);
  });

  it('makes a legal hold accountable to a named human with a reason', () => {
    expect(SQL).toMatch(/CONSTRAINT marketing_record_legal_hold_accountable CHECK/);
    expect(SQL).toMatch(/legal_hold_by IS NOT NULL AND legal_hold_reason IS NOT NULL/);
  });
});

describe('the record carries what Art 8(2) has to be answerable with', () => {
  const required: ReadonlyArray<[string, string]> = [
    ['statement_text', 'the words as cleared'],
    ['statement_hash', 'so an approval binds to content, not to a row id'],
    ['published_text', 'what actually went out, by paste-back'],
    ['published_hash', 'so the published text is provable'],
    ['drafted_by', 'who wrote it'],
    ['cleared_by', 'who cleared it'],
    ['regime', 'which body of law applied, decided at clearance'],
    ['mandatory_elements', 'the Art 7/66 checklist result as data'],
    ['embargo_snapshot', 'Art 90 state as at clearance, not as at export'],
    ['holdings_snapshot', 'Art 91(3)(c) state as at clearance'],
    ['consideration_kind', 'UCPD Annex I pt 11 paid-promotion status'],
    ['desk_state', 'what the desk knew, including an Art 94 suspension'],
    ['named_assets', 'so "everything we said about TOKEN" is answerable'],
    ['jurisdictions', 'so a host authority can be answered — Art 7(3)'],
    ['snapshot_gaps', 'what was missing at clearance, for the completeness statement'],
    ['inbound_context_hash', 'the parent message, provable without being retained'],
    ['withdrawal_reason', 'retention survives a takedown'],
  ];
  for (const [col, why] of required) {
    it(`has ${col} — ${why}`, () => {
      expect(new RegExp(`\\b${col}\\s+\\w`).test(SQL), `${col} is missing`).toBe(true);
    });
  }

  it('has no engagement metric anywhere, because none of them is observable', () => {
    for (const banned of ['impressions', 'reach', 'follower', 'engagement_rate', 'sentiment_score', 'share_of_voice']) {
      expect(new RegExp(`\\b${banned}\\b`, 'i').test(SQL), `${banned} is in the schema`).toBe(false);
    }
  });

  it('holds no credential, token or session, so nothing here can speak as LCX', () => {
    for (const banned of ['token', 'credential', 'session', 'access_key', 'bearer', 'oauth']) {
      expect(new RegExp(`\\b${banned}\\b`, 'i').test(SQL), `${banned} is in the schema`).toBe(false);
    }
  });

  it('cannot represent a self-cleared statement', () => {
    expect(SQL).toMatch(/CONSTRAINT marketing_record_four_eyes CHECK/);
    expect(SQL).toMatch(/cleared_by IS NULL OR cleared_by <> drafted_by/);
  });

  it('starts every record at "nobody has told us what was published"', () => {
    expect(SQL).toMatch(/close_out_state\s+text NOT NULL DEFAULT 'outstanding'/);
    expect(SQL).toMatch(/'not_sent'/);
    expect(SQL).toMatch(/'withdrawn'/);
  });
});

describe('the refusal and claim registers make the record arguable', () => {
  it('requires a rule citation on every refusal', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS marketing_record_refusal\b/);
    expect(SQL).toMatch(/rule_cited\s+text NOT NULL/);
    expect(SQL).toMatch(/sentence\s+text NOT NULL/);
  });

  it('makes an override attributable to a named human with a reason', () => {
    expect(SQL).toMatch(/CONSTRAINT marketing_record_refusal_override_accountable CHECK/);
    expect(SQL).toMatch(/overridden_by IS NOT NULL AND override_reason IS NOT NULL/);
  });

  it('records the claim VERSION, not just the claim id', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS marketing_record_claim\b/);
    expect(SQL).toMatch(/claim_version\s+integer NOT NULL/);
    expect(SQL).toMatch(/UNIQUE \(record_uid, claim_id, claim_version\)/);
  });

  it('indexes refusal codes by frequency over time', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS marketing_record_refusal_code_idx[\s\S]*?\(code, fired_at DESC\)/);
  });
});

describe('the GDPR surfaces 0046 did not have', () => {
  it('indexes the author handle case-insensitively, so erasure can actually run', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS marketing_x_reply_author_lower_idx[\s\S]*?lower\(author_handle\)/);
  });

  it('adds the lawful-basis columns without defaulting them to a basis nobody assessed', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS lawful_basis text/);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS lawful_basis_assessment_ref text/);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS privacy_notice_ref text/);
    // A default here would manufacture the appearance of an assessment.
    expect(/lawful_basis text DEFAULT/i.test(SQL)).toBe(false);
    expect(/'art_6_1_f'/.test(SQL)).toBe(false);
  });

  it('records processor transfers with the scope declared, not defaulted to clean', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS marketing_record_transfer\b/);
    expect(SQL).toMatch(/contains_third_party_personal_data boolean NOT NULL/);
    expect(SQL).toMatch(/third_country\s+boolean NOT NULL/);
    // The honest default is "nobody assessed this", never a compliance claim.
    expect(SQL).toMatch(/transfer_basis\s+text NOT NULL DEFAULT 'not_assessed'/);
    expect(SQL).toMatch(/'sccs_art_46'/);
  });

  it('stores only a pseudonym in the transfer and erasure logs, and says it is one', () => {
    expect(SQL).toMatch(/handle_hash\s+text/);
    expect(RAW).toMatch(/PSEUDONYM, NOT AN ANONYM/);
    expect(RAW).toMatch(/Recital 26/);
  });

  it('gives the erasure log no column that could hold what was erased', () => {
    const table = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS marketing_erasure_log'),
      SQL.indexOf('CREATE INDEX IF NOT EXISTS marketing_erasure_log_handle_idx'),
    );
    expect(table.length).toBeGreaterThan(300);
    for (const banned of ['body', 'statement_text', 'raw_email', 'author_handle', 'message']) {
      expect(new RegExp(`\\b${banned}\\b`).test(table), `${banned} would defeat the erasure`).toBe(false);
    }
    expect(table).toMatch(/decided_by\s+text NOT NULL/);
  });

  it('forces an explanation whenever something was retained rather than erased', () => {
    expect(SQL).toMatch(/CONSTRAINT marketing_erasure_retention_explained CHECK/);
    expect(SQL).toMatch(/records_retained = 0 OR retained_basis IS NOT NULL/);
  });

  it('logs subject access as well as erasure, because an unlogged answer is unprovable', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS marketing_subject_access_log\b/);
    expect(SQL).toMatch(/fulfilled_by\s+text NOT NULL/);
  });

  it('names the DPIA that per-handle scoring would require', () => {
    expect(RAW).toMatch(/DPIA/);
    expect(RAW).toMatch(/Art 35\(3\)\(a\)|evaluation or scoring/);
  });
});

describe('row level security is declared here, not clicked in a dashboard', () => {
  const tables = [
    'marketing_record',
    'marketing_record_refusal',
    'marketing_record_claim',
    'marketing_record_transfer',
    'marketing_erasure_log',
    'marketing_subject_access_log',
  ];
  for (const t of tables) {
    it(`enables RLS on ${t}`, () => {
      expect(SQL).toMatch(new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`));
    });
  }

  it('defines no policy, because RLS with no policy is deny-all and that is the intent', () => {
    expect(/CREATE POLICY/i.test(SQL)).toBe(false);
  });
});
