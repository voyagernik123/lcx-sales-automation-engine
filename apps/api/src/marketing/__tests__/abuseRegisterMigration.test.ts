import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_MIGRATIONS } from '../../db/migrationLedger.js';
import { ABUSE_MIGRATION, EMBARGO_STATES, HOLDINGS_AMENDMENT_REASONS } from '../abuseRegister.js';

/**
 * 0060 IS PASTED INTO THE SUPABASE SQL EDITOR BY A HUMAN, so the file itself is the
 * artefact under test — there is no runner and no CI database to apply it to.
 *
 * These assertions are text-level and they are honest about what that buys: they
 * prove the file SAYS the right thing, not that Postgres does it. What they actually
 * catch is the class of regression that has already happened twice in this
 * repository: a constraint quietly dropped from a migration during an edit, and a
 * table gaining a column nobody reviewed. The behavioural half — that the service
 * layer refuses when the state is absent — is `abuseRegister.test.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../db/migrations', ABUSE_MIGRATION);
const raw = readFileSync(FILE, 'utf8');

/** Comments carry the reasoning, and it names the very verbs the SQL must not use. */
const sql = raw.replace(/^\s*--.*$/gm, '');

const EMBARGO = 'marketing_asset_embargo';
const HOLDINGS = 'marketing_holdings_declaration';

/** The body of one CREATE TABLE, so column assertions cannot match the other table. */
function tableBody(name: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
  expect(start, `${name} is not created in ${ABUSE_MIGRATION}`).toBeGreaterThan(-1);
  const end = sql.indexOf('\n);', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function columnsOf(name: string): string[] {
  const cols: string[] = [];
  for (const m of tableBody(name).matchAll(/^ {2}([a-z_]+) {1,}(uuid|text|boolean|timestamptz)\b/gm)) {
    cols.push(m[1]!);
  }
  return cols.sort();
}

describe('nothing in the file can trigger a destructive-operations warning', () => {
  it('contains no DROP, DELETE or TRUNCATE at all', () => {
    // The cost of one is a round trip for the human pasting it, and the temptation
    // then is to skip the file. Comments are stripped above precisely because they
    // discuss these verbs at length.
    for (const verb of [/\bDROP\b/i, /\bTRUNCATE\b/i, /\bDELETE\b/i]) {
      expect(sql, `${verb} appears in ${ABUSE_MIGRATION}`).not.toMatch(verb);
    }
  });

  it('never rewrites a column, and only ever ALTERs to switch RLS on', () => {
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    const alters = sql.match(/ALTER TABLE[^;]*;/gi) ?? [];
    expect(alters).toHaveLength(2);
    for (const a of alters) expect(a).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('is idempotent statement by statement, so re-running it is a no-op', () => {
    const creates = sql.match(/CREATE TABLE/g) ?? [];
    expect(creates).toHaveLength(2);
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(2);

    const indexes = sql.match(/CREATE (UNIQUE )?INDEX/g) ?? [];
    expect(indexes.length).toBeGreaterThanOrEqual(8);
    expect(sql.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/g)).toHaveLength(indexes.length);

    expect(sql.match(/CREATE FUNCTION/g)).toBeNull();
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);

    // Triggers are guarded by a pg_trigger lookup rather than DROP-then-CREATE,
    // which is the only way to be idempotent without a destructive verb.
    const triggers = sql.match(/CREATE TRIGGER/g) ?? [];
    expect(triggers).toHaveLength(2);
    expect(sql.match(/FROM pg_trigger/g)).toHaveLength(2);
  });

  it('seeds no entitlement — 0046 already opened the compartment', () => {
    expect(sql).not.toMatch(/INSERT INTO entitlements/i);
    // And seeds no register rows either: an empty register is the honest state.
    expect(sql).not.toMatch(new RegExp(`INSERT INTO ${EMBARGO}`, 'i'));
    expect(sql).not.toMatch(new RegExp(`INSERT INTO ${HOLDINGS}`, 'i'));
  });

  it('has not shipped, so it is still editable', () => {
    expect(Object.keys(SHIPPED_MIGRATIONS)).not.toContain(ABUSE_MIGRATION);
  });
});

describe('the column set is frozen, so a free-text or byte-bearing column cannot arrive quietly', () => {
  it('is exactly the embargo register the engine joins against', () => {
    expect(columnsOf(EMBARGO)).toEqual([
      'asset_symbol', 'created_at', 'embargoed_from', 'embargoed_until', 'entered_at',
      'entered_by', 'event_ref', 'id', 'lifted_at', 'lifted_by', 'review_by',
      'source_ref', 'state', 'updated_at',
    ].sort());
  });

  it('is exactly the holdings declaration Art 91(3)(c) needs', () => {
    expect(columnsOf(HOLDINGS)).toEqual([
      'amendment_reason', 'asset_symbol', 'created_at', 'declared_at', 'holds', 'id',
      'member_id', 'renew_by', 'supersedes_id',
    ].sort());
    // No declared_by: there is no on-behalf write path, so member_id IS the declarer.
    expect(columnsOf(HOLDINGS)).not.toContain('declared_by');
  });

  it('holds no bytes, no json and no array anywhere', () => {
    for (const t of [/\bjsonb?\b/i, /\bbytea\b/i, /\btext\s*\[\]/i, /\bblob\b/i]) {
      expect(sql, `${t} in ${ABUSE_MIGRATION}`).not.toMatch(t);
    }
  });

  it('holds no credential and no posting state — the two absences that keep the desk safe', () => {
    for (const noun of [/\btoken\b/i, /\bcredential/i, /\bpassword/i, /\bsecret/i,
      /posted_at/i, /published_at/i, /\bpost_body/i]) {
      expect(sql, `${noun} in ${ABUSE_MIGRATION}`).not.toMatch(noun);
    }
  });
});

describe('the embargo register cannot record ignorance, prose, or an unattributed decision', () => {
  const body = tableBody(EMBARGO);

  it('constrains state to the four storable values and excludes unknown', () => {
    for (const s of EMBARGO_STATES) expect(body).toContain(`'${s}'`);
    // `unknown` is the ABSENCE of a live row. A storable one would let somebody
    // record ignorance as a position and then point at the record.
    expect(body).not.toMatch(/'unknown'/);
  });

  it('asserts the symbol is uppercase rather than trusting the caller', () => {
    expect(body).toMatch(/asset_symbol = upper\(btrim\(asset_symbol\)\)/);
    expect(body).toMatch(/length\(asset_symbol\) BETWEEN 1 AND 20/);
  });

  it('forces both references to be slugs, which is what makes prose unstorable', () => {
    // No space is possible in either pattern, so the inside information cannot be
    // written into the reference that points at it.
    expect(body).toMatch(/event_ref\s+text NOT NULL CHECK \(event_ref ~ '\^\[a-z0-9\]/);
    expect(body).toMatch(/source_ref\s+text NOT NULL CHECK \(source_ref ~ '\^\[a-z0-9\]/);
    for (const re of [/\^\[a-z0-9\]\[a-z0-9._:-\]\{0,79\}\$/, /\^\[a-z0-9\]\[a-z0-9._:\/-\]\{0,119\}\$/]) {
      expect(body).toMatch(re);
    }
  });

  it('names a human for the entry and for the lift, and refuses UNASSIGNED', () => {
    expect(body).toMatch(/entered_by\s+text NOT NULL CHECK/);
    expect((body.match(/'UNASSIGNED'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/CHECK \(\(lifted_by IS NULL\) = \(lifted_at IS NULL\)\)/);
  });

  it('makes the review deadline mandatory and the window coherent', () => {
    expect(body).toMatch(/review_by\s+timestamptz NOT NULL/);
    expect(body).toMatch(/CHECK \(review_by >= entered_at\)/);
    expect(body).toMatch(/embargoed_until IS NULL OR embargoed_until > embargoed_from/);
  });

  it('permits exactly one live entry per asset, and keeps every lifted one', () => {
    expect(sql).toMatch(
      new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${EMBARGO}_live_idx\\s+ON ${EMBARGO} \\(asset_symbol\\) WHERE lifted_at IS NULL`),
    );
    expect(sql).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${EMBARGO}_event_idx`));
  });

  it('indexes the reads that actually happen: the live join, the review queue, the history', () => {
    expect(sql).toMatch(new RegExp(`${EMBARGO}_review_idx[\\s\\S]*review_by\\) WHERE lifted_at IS NULL`));
    expect(sql).toMatch(new RegExp(`${EMBARGO}_history_idx[\\s\\S]*asset_symbol, entered_at DESC`));
  });

  it('lets an UPDATE do nothing except lift, once', () => {
    const fn = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION ${EMBARGO}_lift_only`));
    const body2 = fn.slice(0, fn.indexOf('$$ LANGUAGE plpgsql'));
    // Already lifted → refuse. Not a lift → refuse. Any other column changed → refuse.
    expect((body2.match(/RAISE EXCEPTION/g) ?? []).length).toBe(3);
    for (const col of ['asset_symbol', 'event_ref', 'state', 'review_by', 'source_ref', 'entered_by', 'entered_at']) {
      expect(body2, `${col} is not protected from an in-place edit`).toContain(`NEW.${col} <> OLD.${col}`);
    }
    expect(body2).toContain('NEW.embargoed_until IS DISTINCT FROM OLD.embargoed_until');
    expect(sql).toMatch(new RegExp(`BEFORE UPDATE ON ${EMBARGO}`));
  });
});

describe('the holdings declaration is append-only, attributable, and expires', () => {
  const body = tableBody(HOLDINGS);

  it('records the answer as a boolean, never as prose', () => {
    expect(body).toMatch(/holds\s+boolean NOT NULL/);
  });

  it('keeps the amendment reason a closed enum that matches the code', () => {
    for (const r of HOLDINGS_AMENDMENT_REASONS) expect(body).toContain(`'${r}'`);
    expect(body).toMatch(/amendment_reason IN \(/);
  });

  it('requires a reason with an amendment and forbids one without', () => {
    expect(body).toMatch(/CHECK \(\(supersedes_id IS NULL\) = \(amendment_reason IS NULL\)\)/);
  });

  it('makes the renewal deadline mandatory and after the declaration', () => {
    expect(body).toMatch(/renew_by\s+timestamptz NOT NULL/);
    expect(body).toMatch(/CHECK \(renew_by > declared_at\)/);
  });

  it('makes "the current declaration" structural: one root, one successor', () => {
    expect(sql).toMatch(
      new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${HOLDINGS}_root_idx[\\s\\S]*\\(member_id, asset_symbol\\)\\s+WHERE supersedes_id IS NULL`),
    );
    expect(sql).toMatch(
      new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${HOLDINGS}_chain_idx[\\s\\S]*\\(supersedes_id\\)\\s+WHERE supersedes_id IS NOT NULL`),
    );
    // No mutable current-flag COLUMN, which is what those two indexes replace. Scoped
    // to the table body: the COMMENT deliberately says the words "is_current flag" in
    // order to tell a reader there isn't one.
    expect(body).not.toMatch(/is_current|current_flag/i);
  });

  it('refuses every UPDATE, because the earlier value is the evidence', () => {
    const fn = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION ${HOLDINGS}_no_update`));
    expect(fn.slice(0, fn.indexOf('$$ LANGUAGE plpgsql'))).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(new RegExp(`BEFORE UPDATE ON ${HOLDINGS}`));
  });

  it('indexes the engine join, the renewal queue and the member’s own view', () => {
    expect(sql).toMatch(new RegExp(`${HOLDINGS}_cell_idx[\\s\\S]*asset_symbol, member_id, declared_at DESC`));
    expect(sql).toMatch(new RegExp(`${HOLDINGS}_renew_idx[\\s\\S]*\\(renew_by\\)`));
    expect(sql).toMatch(new RegExp(`${HOLDINGS}_member_idx[\\s\\S]*member_id, declared_at DESC`));
  });
});

describe('the security posture lives in the file, not in a dashboard click', () => {
  it('enables RLS on both tables and defines no policy (deny-all)', () => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE ${EMBARGO}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(sql).toMatch(new RegExp(`ALTER TABLE ${HOLDINGS}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it('says what each table is, in the database, for whoever only ever runs \\d+', () => {
    expect(sql).toMatch(new RegExp(`COMMENT ON TABLE ${EMBARGO} IS`));
    expect(sql).toMatch(new RegExp(`COMMENT ON TABLE ${HOLDINGS} IS`));
    // The two facts a reader must not miss.
    expect(raw).toMatch(/THIS TABLE IS ITSELF INSIDE INFORMATION/);
    expect(raw).toMatch(/APPEND-ONLY by trigger/);
  });

  it('names itself in every exception, so an operator can find the file', () => {
    for (const m of sql.matchAll(/RAISE EXCEPTION\s+'([^']+)'/g)) {
      expect(m[1], 'an exception that does not say where the rule lives').toContain(ABUSE_MIGRATION);
    }
  });
});
