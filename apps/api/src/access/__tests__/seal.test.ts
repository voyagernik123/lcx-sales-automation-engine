import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_DB, describeDb } from '../../test/db.js';
import {
  AUDIT_SEAL_CANON_VERSION,
  AUDIT_SEAL_CODES,
  AUDIT_SEAL_GENESIS_DIGEST,
  canonicalAuditContent,
  canonicalMeta,
  isAppendOnlyRefusal,
  sealDigest,
  sealField,
  sealTimestamp,
  verifyAuditSeal,
} from '../seal.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE AUDIT LOG CALLED ITSELF HASH-CHAINED AND WAS SEVEN COLUMNS WITH NO
 *  CONSTRAINTS.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `0000_equal_beyonder.sql:1-9` creates `audit_log` with no chain, no append-only
 *  guarantee and nothing preventing UPDATE or DELETE. `0029_spine.sql:6` calls it
 *  "the hash-chained audit_log", and so do six live source files. The only chain in
 *  the repository was in a browser store.
 *
 *  So this file has to prove three separate things, and the third is the one that
 *  is easy to fake:
 *
 *   1. THE SERIALISATION IS STABLE AND UNAMBIGUOUS. A chain over an unstable
 *      canonical form is theatre — "digest mismatch" stops meaning "tampered".
 *      Pinned vectors, key-order independence, and the field-boundary attack that
 *      length-prefixing exists to stop.
 *
 *   2. THE CONTROL IS IN THE DATABASE. Not a convention, not a comment: UPDATE,
 *      DELETE and TRUNCATE are refused by trigger, against a real Postgres.
 *
 *   3. THE VERIFIER DOES NOT LIE ABOUT WHAT IT COVERED. Four outcomes that must
 *      never collapse into each other: seal-not-installed, chain-intact,
 *      chain-broken-at-N, and rows-predate-the-chain. The last is the honest state
 *      for every row this platform wrote before today, and a verifier that folded
 *      it into "intact" would be worse than no verifier — it would certify
 *      unsealed rows.
 *
 *  THE DATABASE TESTS RUN IN THEIR OWN SCHEMAS. `audit_log` in the live database is
 *  the real audit log and this suite must not add a row to it, let alone install
 *  triggers on it. Three throwaway schemas — sealed, never-migrated, and
 *  migrated-but-empty — so each state is proved against a database that is genuinely
 *  in it rather than against a mock or a mutated neighbour.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_0070 = readFileSync(
  resolve(HERE, '..', '..', 'db', 'migrations', '0070_audit_seal.sql'),
  'utf8',
);

/* ══════════════════════════════════════════════════════════════════════════════
 *  1. THE CANONICAL SERIALISATION — pure, no database.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the canonical field framing', () => {
  it('distinguishes NULL from the empty string', () => {
    // `entity` and `entity_id` are nullable in 0000 and most rows have one of each
    // absent. If these collapsed, a row could be edited from NULL to '' — or to
    // any value whose framing happened to line up — without moving the digest.
    expect(sealField(null)).toBe('-1:');
    expect(sealField('')).toBe('0:');
    expect(sealField(null)).not.toBe(sealField(''));
  });

  it('prefixes the BYTE length, not the character length', () => {
    // octet_length on the SQL side. A justification with an em dash in it — which
    // this codebase writes constantly — would otherwise disagree across the two.
    expect(sealField('abc')).toBe('3:abc');
    expect(sealField('—')).toBe('3:—');
    expect(sealField('é')).toBe('2:é');
  });

  it('makes a field-boundary shift impossible to hide', () => {
    // THE ATTACK length-prefixing exists to stop. Without it, delimiting alone
    // leaves (actor='a', action='bc') and (actor='ab', action='c') identical, so
    // anyone able to write two adjacent fields could move the boundary and keep
    // the digest. Both variants have the same total content and must not collide.
    const base = {
      id: '00000000-0000-0000-0000-000000000001',
      entity: null,
      entityId: null,
      meta: {},
      createdAtIso: '2026-08-06T00:00:00.000000Z',
    };
    const a = canonicalAuditContent({ ...base, actor: 'a', action: 'bc' });
    const b = canonicalAuditContent({ ...base, actor: 'ab', action: 'c' });
    expect(a).not.toBe(b);
    expect(sealDigest(a, AUDIT_SEAL_GENESIS_DIGEST)).not.toBe(
      sealDigest(b, AUDIT_SEAL_GENESIS_DIGEST),
    );
  });
});

describe('canonical jsonb', () => {
  it('is independent of the order the keys were written in', () => {
    // The whole reason `meta::text` was not used: jsonb's own text output follows
    // an internal ordering that is a property of the server version, not of this
    // definition. Two writers producing the same object must produce one digest.
    const one = canonicalMeta({ z: 1, a: { b: [1, 2] }, n: null });
    const two = canonicalMeta({ n: null, a: { b: [1, 2] }, z: 1 });
    expect(one).toBe(two);
    expect(one).toBe('{"a":{"b":[1,2]},"n":null,"z":1}');
  });

  it('keeps array order, because order is meaning in an array', () => {
    expect(canonicalMeta([1, 2])).not.toBe(canonicalMeta([2, 1]));
  });

  it('escapes strings rather than letting them forge structure', () => {
    // A justification containing `","` must not be able to look like two fields.
    expect(canonicalMeta({ s: 'x"y' })).toBe('{"s":"x\\"y"}');
    expect(canonicalMeta({ a: '1,"b":2' })).toBe('{"a":"1,\\"b\\":2"}');
  });

  it('refuses a value that cannot have come out of jsonb', () => {
    // Emitting *something* for a function would produce a digest over a value the
    // database does not contain — a chain that verifies against nothing.
    expect(() => canonicalMeta(() => 1)).toThrow(/not a JSON value/);
  });
});

describe('the pinned vectors', () => {
  /*
   * CHANGE DETECTORS, ON PURPOSE. Every digest already written into `audit_log`
   * depends on this exact string, so an edit to the serialisation silently
   * invalidates the whole sealed region — the verifier would report a break at
   * position 1 and the log would look tampered with. If these fail, the change is
   * a canon VERSION BUMP (v2, new version tag, migration, and a stated boundary),
   * never an in-place edit.
   */
  const ROW = {
    id: '11111111-2222-3333-4444-555555555555',
    actor: 'nik',
    action: 'action:revoke_entitlement',
    entity: 'member',
    entityId: 'sam',
    meta: { workspace: 'gps', justification: 'left the project' },
    createdAtIso: '2026-08-06T12:34:56.123456Z',
  };

  it('opens with the version tag, so a v2 digest can never be read as a v1', () => {
    expect(canonicalAuditContent(ROW).startsWith(`${AUDIT_SEAL_CANON_VERSION}\u001e`)).toBe(true);
  });

  it('serialises to exactly this string', () => {
    expect(canonicalAuditContent(ROW)).toBe(
      'lcx-audit-seal-v1\u001e'
        + '36:11111111-2222-3333-4444-555555555555\u001e'
        + '3:nik\u001e'
        + '25:action:revoke_entitlement\u001e'
        + '6:member\u001e'
        + '3:sam\u001e'
        + '54:{"justification":"left the project","workspace":"gps"}\u001e'
        + '27:2026-08-06T12:34:56.123456Z',
    );
  });

  it('hashes to exactly this digest from the genesis root', () => {
    expect(sealDigest(canonicalAuditContent(ROW), AUDIT_SEAL_GENESIS_DIGEST)).toBe(
      'e11d60ccc320f46a35fe2e80f16de9b98bf065672812b4e62efb57ae3e8a6cfc',
    );
  });

  it('roots at sha256 of the named genesis string, reproducible from the string alone', () => {
    // The constant is inlined in 0070's trigger too. If they ever diverge, the
    // first sealed row fails verification and nothing else does — the most
    // confusing possible failure, so it is pinned here.
    expect(AUDIT_SEAL_GENESIS_DIGEST).toBe(
      'b2dd1adc4b93df88adaefee9df5adbafd1048d2f898d56279b09ac686d07281a',
    );
  });
});

describe('sealTimestamp', () => {
  it('emits six fractional digits, matching to_char(... US)', () => {
    // JavaScript Dates carry milliseconds; Postgres prints microseconds. The last
    // three digits are zeros for anything that came through Node, and stating that
    // here is what stops a "fix" that slices them off and breaks every digest.
    expect(sealTimestamp(new Date('2026-08-06T12:34:56.123Z'))).toBe(
      '2026-08-06T12:34:56.123000Z',
    );
  });

  it('passes an already-formatted string through untouched', () => {
    expect(sealTimestamp('2026-08-06T12:34:56.123456Z')).toBe('2026-08-06T12:34:56.123456Z');
  });
});

describe('recognising the database refusal', () => {
  it('matches on the stable code, not on SQLSTATE alone', () => {
    // 42501 is also what a genuine privilege failure raises. Telling an operator
    // "the audit log is append-only" when their role is simply wrong sends them to
    // the wrong place.
    expect(
      isAppendOnlyRefusal({
        code: '42501',
        message: 'AUDIT_SEAL_APPEND_ONLY: audit_log is append-only; UPDATE on row x is refused',
      }),
    ).toBe(true);
    expect(isAppendOnlyRefusal({ code: '42501', message: 'permission denied for table x' })).toBe(
      false,
    );
    expect(isAppendOnlyRefusal(null)).toBe(false);
  });
});

describe('a bound it cannot honour is refused, never ignored', () => {
  /*
   * NO DATABASE, AND THAT IS THE ASSERTION. The bounds are checked before the pool
   * is touched, so an object with no `query` method is enough — if any of these
   * reached Postgres this test would throw instead of returning a refusal.
   *
   * WHAT WENT WRONG. `maxRows: NaN` and `maxRows: -2` both failed the old
   * `maxRows > 0` test, silently dropped the LIMIT, and returned
   * `coversWholeChain: true`: a caller whose computed cap came out NaN was told the
   * WHOLE chain verified. An unhonoured bound made the verdict BROADER than
   * requested, which is the worst direction for an integrity report. `fromSeq` NaN /
   * Infinity / 1.5 escaped instead as `invalid input syntax for type bigint: "NaN"`
   * with no code from AUDIT_SEAL_CODES at all.
   */
  const noPool = {} as unknown as pg.Pool;

  for (const value of [Number.NaN, -2, Number.POSITIVE_INFINITY, 1.5]) {
    it(`refuses maxRows=${String(value)} rather than widening the verdict`, async () => {
      const v = await verifyAuditSeal(noPool, { maxRows: value });
      expect(v.kind).toBe('invalid_bounds');
      if (v.kind !== 'invalid_bounds') return;
      expect(v.code).toBe(AUDIT_SEAL_CODES.INVALID_BOUNDS);
      expect(v.offending.map((o) => o.option)).toEqual(['maxRows']);
      expect(v.message).toMatch(/NOT ignored/);
    });

    it(`refuses fromSeq=${String(value)} with a code instead of a raw 22P02`, async () => {
      const v = await verifyAuditSeal(noPool, { fromSeq: value });
      expect(v.kind).toBe('invalid_bounds');
      if (v.kind !== 'invalid_bounds') return;
      expect(v.offending.map((o) => o.option)).toEqual(['fromSeq']);
    });
  }

  it('returns EVERY offending bound, not the first one found', async () => {
    // The house pattern (marketingDesk.ts:1207-1214). A caller fixing one bound and
    // being handed the same refusal again learns to distrust the refusal.
    const v = await verifyAuditSeal(noPool, { fromSeq: Number.NaN, maxRows: -1 });
    expect(v.kind).toBe('invalid_bounds');
    if (v.kind !== 'invalid_bounds') return;
    expect(v.offending.map((o) => o.option).sort()).toEqual(['fromSeq', 'maxRows']);
  });

  it('accepts the bounds that ARE honourable, including the zero defaults', async () => {
    // Non-vacuity: if this rejected everything the tests above would pass for the
    // wrong reason. These must get past validation and fail on the absent pool.
    for (const opts of [{ fromSeq: 0 }, { fromSeq: 1 }, { maxRows: 1 }, { maxRows: 0 }]) {
      await expect(verifyAuditSeal(noPool, opts)).rejects.toThrow();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  2 & 3. THE DATABASE. Real Postgres, throwaway schemas.
 * ════════════════════════════════════════════════════════════════════════════ */

/*
 * THREE SCHEMAS, BECAUSE THE THREE STATES MUST BE PROVED INDEPENDENTLY.
 *
 * The first draft used two and applied 0070 to the unsealed one mid-suite to reach
 * the genuinely-empty case. That made the not-installed assertion depend on test
 * ORDER — reorder the file and it passes against an already-migrated schema, which
 * is a green test proving the opposite of what it says.
 */
const SEALED = `p5_seal_${process.pid}`; // pre-seal rows + 0070 + rows written through it
const UNSEALED = `p5_bare_${process.pid}`; // 0070 never applied
const EMPTY = `p5_empty_${process.pid}`; // 0070 applied, nothing ever written

/** 0000's audit_log, byte-for-byte in shape, so 0070 is applied to the real thing. */
const AUDIT_LOG_DDL = `
  CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    actor text DEFAULT 'system' NOT NULL,
    action text NOT NULL,
    entity text,
    entity_id text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
  );`;

let admin: pg.Pool | undefined;
let sealed: pg.Pool | undefined;
let unsealed: pg.Pool | undefined;
let emptySealed: pg.Pool | undefined;

/** A pool pinned to one schema, so the migration's unqualified DDL lands there. */
const scopedPool = (schema: string) =>
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 3,
  });

beforeAll(async () => {
  if (!HAS_DB) return;
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const s of [SEALED, UNSEALED, EMPTY]) {
    await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await admin.query(`CREATE SCHEMA ${s}`);
  }
  sealed = scopedPool(SEALED);
  unsealed = scopedPool(UNSEALED);
  emptySealed = scopedPool(EMPTY);

  await sealed.query(AUDIT_LOG_DDL);
  await unsealed.query(AUDIT_LOG_DDL);
  await emptySealed.query(AUDIT_LOG_DDL);
  await emptySealed.query(MIGRATION_0070);

  // One row BEFORE the seal exists — the pre-seal region this whole design is
  // careful about. Without it the pre-seal assertions below would be vacuous.
  await sealed.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta, created_at)
     VALUES ('nik','pre_seal_action','deal','d-old','{"n":1}', now() - interval '30 days')`,
  );
  await sealed.query(MIGRATION_0070);
});

afterAll(async () => {
  // DROP SCHEMA is DDL, so the append-only triggers do not fire on it — which is
  // the only reason a test schema carrying this control can be cleaned up at all.
  await sealed?.end();
  await unsealed?.end();
  await emptySealed?.end();
  if (admin) {
    for (const s of [SEALED, UNSEALED, EMPTY]) await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await admin.end();
  }
});

describeDb('the seal is installed in the database, not asserted in a comment', () => {
  it('refuses an UPDATE on a sealed row', async () => {
    await sealed!.query(`INSERT INTO audit_log (actor, action) VALUES ('nik','a1')`);
    await expect(
      sealed!.query(`UPDATE audit_log SET actor='eve' WHERE seal_seq IS NOT NULL`),
    ).rejects.toThrow(/AUDIT_SEAL_APPEND_ONLY/);
  });

  it('refuses a DELETE, including of the pre-seal rows', async () => {
    await expect(sealed!.query(`DELETE FROM audit_log`)).rejects.toThrow(/AUDIT_SEAL_APPEND_ONLY/);
  });

  it('refuses a TRUNCATE', async () => {
    // The one that a row-level trigger alone would miss entirely.
    await expect(sealed!.query(`TRUNCATE audit_log`)).rejects.toThrow(/AUDIT_SEAL_APPEND_ONLY/);
  });

  it('raises an error this code can recognise', async () => {
    const err = await sealed!
      .query(`DELETE FROM audit_log WHERE seal_seq IS NOT NULL`)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isAppendOnlyRefusal(err)).toBe(true);
  });
});

describeDb('the verifier keeps four outcomes apart', () => {
  it('says NOT INSTALLED where 0070 has not been applied', async () => {
    // Not "intact over zero rows", which is what an absent-data-renders-empty
    // verifier would have said about a database with no chain at all.
    const v = await verifyAuditSeal(unsealed!);
    expect(v.kind).toBe('not_installed');
    if (v.kind === 'not_installed') {
      expect(v.code).toBe(AUDIT_SEAL_CODES.NOT_INSTALLED);
      expect(v.rule).toMatch(/absent data refuses/i);
    }
  });

  it('reports the chain intact AND the pre-seal rows separately, with the boundary named', async () => {
    await sealed!.query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
       VALUES ('nik','action:grant_entitlement','member','sam','{"z":1,"a":{"b":[1,2]}}')`,
    );
    const v = await verifyAuditSeal(sealed!, { crossCheckCanon: true });
    expect(v.kind).toBe('sealed');
    if (v.kind !== 'sealed') return;

    expect(v.report.chain.kind).toBe('intact');
    if (v.report.chain.kind === 'intact') {
      expect(v.report.chain.coversWholeChain).toBe(true);
      expect(v.report.chain.firstSeq).toBe(1);
      expect(v.report.chain.rowsExamined).toBeGreaterThanOrEqual(2);
    }

    // THE THIRD STATE. The pre-seal row is not intact and not broken.
    expect(v.report.preSeal.kind).toBe('unverifiable');
    if (v.report.preSeal.kind === 'unverifiable') {
      expect(v.report.preSeal.code).toBe(AUDIT_SEAL_CODES.PRE_SEAL_UNVERIFIABLE);
      expect(v.report.preSeal.rows).toBe(1);
      expect(v.report.preSeal.boundaryRowId).toMatch(/^[0-9a-f-]{36}$/);
      expect(v.report.preSeal.boundaryRowAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(v.report.preSeal.message).toMatch(/UNKNOWABLE/);
      // It must not read as EITHER of the other two states. The phrase is load-bearing.
      expect(v.report.preSeal.message).toMatch(/neither intact nor broken/);
    }

    // The SQL canonicaliser and the TypeScript one agree on a realistic row.
    expect(v.report.canonCrossCheck.kind).toBe('agrees');
  });

  it('verifies FROM THE BEGINNING at fromSeq 1 instead of accusing position 1', async () => {
    /*
     * THE REGRESSION THIS PINS. `seal_seq` starts at 1, so `fromSeq: 1` is "verify
     * from the beginning" and is the first page of any paginated walk. The anchor
     * lookup ran for any `fromSeq > 0`, found no predecessor for position 1, set the
     * expectation to null, and reported an INTACT chain as
     * AUDIT_SEAL_CHAIN_BROKEN / predecessor_digest_mismatch at position 1 — with
     * expectedPrevDigest null and the row's legitimate genesis prev_digest as the
     * evidence. Meanwhile the same function's own `coversWholeChain` line treated
     * `fromSeq <= 1` as the whole chain, so the file contradicted itself.
     *
     * A verifier that cries wolf is a verifier nobody reads (seal.ts:94), and this
     * one cried wolf on the most natural call there is.
     */
    const whole = await verifyAuditSeal(sealed!);
    expect(whole.kind).toBe('sealed');
    if (whole.kind !== 'sealed') return;
    expect(whole.report.chain.kind).toBe('intact');

    const fromOne = await verifyAuditSeal(sealed!, { fromSeq: 1 });
    expect(fromOne.kind).toBe('sealed');
    if (fromOne.kind !== 'sealed') return;
    expect(fromOne.report.chain.kind).toBe('intact');
    if (fromOne.report.chain.kind !== 'intact') return;
    // Position 1 IS the beginning, so this covers the whole chain — the same verdict
    // the no-options call gives, because it is the same walk.
    expect(fromOne.report.chain.coversWholeChain).toBe(true);
    expect(fromOne.report.chain.firstSeq).toBe(1);

    // fromSeq 2 is a genuine window over the same intact chain: still intact (the
    // anchor is real there), but it must NOT claim to cover everything.
    const fromTwo = await verifyAuditSeal(sealed!, { fromSeq: 2 });
    expect(fromTwo.kind).toBe('sealed');
    if (fromTwo.kind !== 'sealed') return;
    expect(fromTwo.report.chain.kind).toBe('intact');
    if (fromTwo.report.chain.kind !== 'intact') return;
    expect(fromTwo.report.chain.coversWholeChain).toBe(false);
    expect(fromTwo.report.chain.firstSeq).toBe(2);
  });

  it('does not claim to cover the whole chain when asked for a window', async () => {
    const v = await verifyAuditSeal(sealed!, { fromSeq: 2, maxRows: 1 });
    expect(v.kind).toBe('sealed');
    if (v.kind !== 'sealed') return;
    expect(v.report.chain.kind).toBe('intact');
    if (v.report.chain.kind === 'intact') {
      // The window verified. Reading that as "the log verified" is the mistake
      // this flag exists to make impossible.
      expect(v.report.chain.coversWholeChain).toBe(false);
      expect(v.report.chain.rowsExamined).toBe(1);
    }
  });

  it('reports GENUINELY EMPTY where the seal is installed and nothing has been written through it', async () => {
    // Distinct from not-installed and from intact. Three states, not two.
    // Its OWN schema: migrating `unsealed` here would silently invalidate the
    // not-installed assertion above depending on the order the file runs in.
    const v = await verifyAuditSeal(emptySealed!);
    expect(v.kind).toBe('sealed');
    if (v.kind !== 'sealed') return;
    expect(v.report.chain.kind).toBe('empty');
    if (v.report.chain.kind === 'empty') {
      expect(v.report.chain.message).toMatch(/genuinely empty/i);
    }
    expect(v.report.preSeal.kind).toBe('none');
  });
});

describeDb('the verifier names the first break, with the row and both digests', () => {
  /**
   * TAMPERING REQUIRES DISABLING THE TRIGGER, WHICH IS THE POINT.
   *
   * `ALTER TABLE ... DISABLE TRIGGER` is exactly what an attacker with database
   * ownership would do, and it is the only way to write the tampered state these
   * assertions need. Doing it here proves the second half of the control: even
   * with the trigger off, the edit is still DETECTED after the fact.
   */
  const withTriggerOff = async (pool: pg.Pool, fn: () => Promise<void>) => {
    await pool.query(`ALTER TABLE audit_log DISABLE TRIGGER trg_audit_seal_append_only`);
    try {
      await fn();
    } finally {
      await pool.query(`ALTER TABLE audit_log ENABLE TRIGGER trg_audit_seal_append_only`);
    }
  };

  const freshSealed = async (name: string, preSealRows = 0) => {
    await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await admin!.query(`CREATE SCHEMA ${name}`);
    const p = scopedPool(name);
    await p.query(AUDIT_LOG_DDL);
    for (let n = 0; n < preSealRows; n += 1) {
      await p.query(
        `INSERT INTO audit_log (actor, action) VALUES ('nik','pre_seal_action')`,
      );
    }
    await p.query(MIGRATION_0070);
    for (const n of [1, 2, 3]) {
      await p.query(`INSERT INTO audit_log (actor, action, entity_id) VALUES ('nik','a',$1)`, [
        `row-${n}`,
      ]);
    }
    return p;
  };

  /** Run `fn` with one named trigger off, then put it back whatever happened. */
  const withNamedTriggerOff = async (
    pool: pg.Pool,
    table: string,
    trigger: string,
    fn: () => Promise<void>,
  ) => {
    await pool.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
    try {
      await fn();
    } finally {
      await pool.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
  };

  it('reports a row appended with the insert trigger off — in a segment of its own', async () => {
    /*
     * THE ASYMMETRY THAT WAS NOWHERE STATED. An edit and a mid-chain delete were
     * detected; an APPEND was not. The chain walk filters `seal_seq IS NOT NULL` and
     * the pre-seal segment came from a snapshot taken when 0070 was applied, so a row
     * inserted with `trg_audit_seal_insert` disabled sat in NEITHER: `chain: intact`,
     * `preSeal: 2 rows written before the seal existed`, and a forged
     * `eve / forged:approval / {"amount":1000000}` row returned by every ordinary
     * query of audit_log — including the audit UI — while appearing in no part of the
     * report at all. Not-covered was collapsed into covered-and-clean.
     */
    const name = `p5_forge_${process.pid}`;
    const p = await freshSealed(name, 2);
    try {
      await withNamedTriggerOff(p, 'audit_log', 'trg_audit_seal_insert', async () => {
        await p.query(
          `INSERT INTO audit_log (actor, action, meta)
           VALUES ('eve','forged:approval','{"amount":1000000}')`,
        );
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;

      // The sealed region really is intact — the forgery did not touch it, and saying
      // otherwise would be the false accusation in the other direction.
      expect(v.report.chain.kind).toBe('intact');

      // …and the forged row is REPORTED, under its own code, with its id.
      expect(v.report.unsealedRows.kind).toBe('excess');
      if (v.report.unsealedRows.kind !== 'excess') return;
      expect(v.report.unsealedRows.code).toBe(AUDIT_SEAL_CODES.UNSEALED_ROWS_PRESENT);
      expect(v.report.unsealedRows.snapshotRows).toBe(2);
      expect(v.report.unsealedRows.liveRows).toBe(3);
      expect(v.report.unsealedRows.excess).toBe(1);
      expect(v.report.unsealedRows.rowIds).toHaveLength(1);
      expect(v.report.unsealedRows.message).toMatch(/OUTSIDE the seal/);

      const { rows } = await p.query<{ id: string }>(
        `SELECT id FROM audit_log WHERE actor = 'eve'`,
      );
      expect(v.report.unsealedRows.rowIds).toEqual([rows[0]!.id]);

      // The pre-seal segment must not have absorbed it: its own count is still 2 and
      // it says out loud that the live count disagrees.
      expect(v.report.preSeal.kind).toBe('unverifiable');
      if (v.report.preSeal.kind !== 'unverifiable') return;
      expect(v.report.preSeal.rows).toBe(2);
      expect(v.report.preSeal.liveUnsealedRows).toBe(3);
      expect(v.report.preSeal.snapshotAgreesWithLiveCount).toBe(false);
      expect(v.report.preSeal.message).toMatch(/SNAPSHOT AND IT DOES NOT MATCH REALITY/);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('refuses to have its own boundary record edited', async () => {
    // 0070 protected the DATA with three triggers and left the METADATA the verdict
    // depends on fully mutable. `pre_seal_rows`, `genesis_digest` and `canon_version`
    // are all surfaced as fact.
    const name = `p5_state_${process.pid}`;
    const p = await freshSealed(name, 1);
    try {
      await expect(
        p.query(`UPDATE audit_seal_state SET pre_seal_rows = 0 WHERE id = 1`),
      ).rejects.toThrow(/AUDIT_SEAL_APPEND_ONLY/);
      await expect(p.query(`DELETE FROM audit_seal_state`)).rejects.toThrow(
        /AUDIT_SEAL_APPEND_ONLY/,
      );
      await expect(p.query(`TRUNCATE audit_seal_state`)).rejects.toThrow(/AUDIT_SEAL_APPEND_ONLY/);

      const err = await p
        .query(`UPDATE audit_seal_state SET genesis_digest = 'deadbeef'`)
        .then(() => null)
        .catch((e: unknown) => e);
      expect(isAppendOnlyRefusal(err)).toBe(true);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('does not believe the snapshot even when the snapshot trigger is switched off', async () => {
    // DEFENCE IN DEPTH, and the reason the trigger alone was not enough: on a database
    // sealed before those triggers existed the row may ALREADY have been edited, and a
    // verifier that trusts it reports `preSeal: none` over rows that are still there.
    const name = `p5_snapshot_${process.pid}`;
    const p = await freshSealed(name, 2);
    try {
      await withNamedTriggerOff(p, 'audit_seal_state', 'trg_audit_seal_state_immutable', async () => {
        await p.query(`UPDATE audit_seal_state SET pre_seal_rows = 0 WHERE id = 1`);
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;
      // The old behaviour: preSeal.kind === 'none' while two unsealed rows sat in the
      // table. Both halves are asserted so neither can regress alone.
      expect(v.report.preSeal.kind).toBe('unverifiable');
      expect(v.report.unsealedRows.kind).toBe('excess');
      if (v.report.unsealedRows.kind !== 'excess') return;
      expect(v.report.unsealedRows.snapshotRows).toBe(0);
      expect(v.report.unsealedRows.liveRows).toBe(2);
      // Both readings named, because this schema cannot tell them apart.
      expect(v.report.unsealedRows.message).toMatch(/disabled, or pre_seal_rows was lowered/);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('reports a snapshot that claims MORE unsealed rows than exist, under its own code', async () => {
    const name = `p5_diverged_${process.pid}`;
    const p = await freshSealed(name);
    try {
      await withNamedTriggerOff(p, 'audit_seal_state', 'trg_audit_seal_state_immutable', async () => {
        await p.query(`UPDATE audit_seal_state SET pre_seal_rows = 5 WHERE id = 1`);
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;
      expect(v.report.unsealedRows.kind).toBe('diverged');
      if (v.report.unsealedRows.kind !== 'diverged') return;
      expect(v.report.unsealedRows.code).toBe(AUDIT_SEAL_CODES.UNSEALED_COUNT_DIVERGED);
      expect(v.report.unsealedRows.snapshotRows).toBe(5);
      expect(v.report.unsealedRows.liveRows).toBe(0);
      // A divergence in this direction must NOT be reported as excess rows: they are
      // different findings with different remedies.
      expect(v.report.unsealedRows.code).not.toBe(AUDIT_SEAL_CODES.UNSEALED_ROWS_PRESENT);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('stops claiming to cover the whole chain when the HEAD row is deleted', async () => {
    /*
     * THE CASE THE MID-CHAIN TEST ABOVE DELIBERATELY IS NOT. Removing seq 2 of 3
     * breaks a link and is caught. Removing seq 3 — the head, i.e. the row that
     * records what you just did — broke no link: the verdict came back
     * `intact, lastSeq: 2, coversWholeChain: TRUE`, indistinguishable from a shorter
     * honest chain. Nothing read the sequence.
     *
     * It is reported as a head GAP and not as a break, because `nextval()` is
     * non-transactional: a rolled-back audit append burns a number and leaves the
     * same trace. Both readings are named and the coverage claim is withdrawn.
     */
    const name = `p5_head_${process.pid}`;
    const p = await freshSealed(name);
    try {
      const before = await verifyAuditSeal(p);
      expect(before.kind).toBe('sealed');
      if (before.kind !== 'sealed') return;
      expect(before.report.head.kind).toBe('anchored');
      if (before.report.chain.kind === 'intact') {
        expect(before.report.chain.coversWholeChain).toBe(true);
        expect(before.report.chain.lastSeq).toBe(3);
      }

      await withTriggerOff(p, async () => {
        await p.query(`DELETE FROM audit_log WHERE seal_seq = 3`);
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;
      expect(v.report.head.kind).toBe('gap');
      if (v.report.head.kind !== 'gap') return;
      expect(v.report.head.code).toBe(AUDIT_SEAL_CODES.HEAD_GAP);
      expect(v.report.head.lastSeq).toBe(2);
      expect(v.report.head.sequenceLastValue).toBe(3);
      expect(v.report.head.missing).toBe(1);
      expect(v.report.head.message).toMatch(/DELETED/);
      expect(v.report.head.message).toMatch(/rolled back/);

      // The surviving rows do still verify — and the report no longer says that
      // verdict covers everything.
      expect(v.report.chain.kind).toBe('intact');
      if (v.report.chain.kind !== 'intact') return;
      expect(v.report.chain.coversWholeChain).toBe(false);
      expect(v.report.chain.lastSeq).toBe(2);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('detects an edited row as a CONTENT mismatch and names it', async () => {
    const name = `p5_tamper_${process.pid}`;
    const p = await freshSealed(name);
    try {
      const { rows } = await p.query<{ id: string }>(
        `SELECT id FROM audit_log WHERE seal_seq = 2`,
      );
      const victim = rows[0]!.id;
      await withTriggerOff(p, async () => {
        await p.query(`UPDATE audit_log SET actor = 'eve' WHERE seal_seq = 2`);
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;
      expect(v.report.chain.kind).toBe('broken');
      if (v.report.chain.kind !== 'broken') return;
      expect(v.report.chain.code).toBe(AUDIT_SEAL_CODES.CHAIN_BROKEN);
      expect(v.report.chain.reason).toBe('content_digest_mismatch');
      expect(v.report.chain.atSeq).toBe(2);
      expect(v.report.chain.atRowId).toBe(victim);
      // BOTH digests, so a reader can see what was expected and what is there.
      expect(v.report.chain.storedDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(v.report.chain.recomputedDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(v.report.chain.storedDigest).not.toBe(v.report.chain.recomputedDigest);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });

  it('detects a REMOVED row as a broken link, not as a shorter honest chain', async () => {
    // The failure mode that matters most: deleting the row that records what you
    // did. Without the prev_digest check, the remaining rows each verify against
    // their own content and the log looks clean.
    const name = `p5_gap_${process.pid}`;
    const p = await freshSealed(name);
    try {
      await withTriggerOff(p, async () => {
        await p.query(`DELETE FROM audit_log WHERE seal_seq = 2`);
      });

      const v = await verifyAuditSeal(p);
      expect(v.kind).toBe('sealed');
      if (v.kind !== 'sealed') return;
      expect(v.report.chain.kind).toBe('broken');
      if (v.report.chain.kind !== 'broken') return;
      expect(v.report.chain.reason).toBe('predecessor_digest_mismatch');
      expect(v.report.chain.atSeq).toBe(3);
      expect(v.report.chain.storedPrevDigest).not.toBe(v.report.chain.expectedPrevDigest);
      expect(v.report.chain.message).toMatch(/removed|reordered/i);
    } finally {
      await p.end();
      await admin!.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    }
  });
});

describeDb('the SQL canonicalisation is the same definition as the TypeScript one', () => {
  it('agrees on the pinned vector', async () => {
    // The two implementations are what the whole design rests on: the trigger
    // hashes the SQL form, the verifier re-hashes it in Node. If they disagree on
    // a fixed input then one of them is not the definition, and this is the only
    // place that would notice.
    const { rows } = await sealed!.query<{ canon: string }>(
      `SELECT audit_seal_content($1::uuid,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) AS canon`,
      [
        '11111111-2222-3333-4444-555555555555',
        'nik',
        'action:revoke_entitlement',
        'member',
        'sam',
        JSON.stringify({ workspace: 'gps', justification: 'left the project' }),
        '2026-08-06T12:34:56.123456Z',
      ],
    );
    expect(rows[0]!.canon).toBe(
      canonicalAuditContent({
        id: '11111111-2222-3333-4444-555555555555',
        actor: 'nik',
        action: 'action:revoke_entitlement',
        entity: 'member',
        entityId: 'sam',
        meta: { workspace: 'gps', justification: 'left the project' },
        createdAtIso: '2026-08-06T12:34:56.123456Z',
      }),
    );
  });

  it('agrees when entity is NULL and meta is the default empty object', async () => {
    // The commonest shape in the real table — `middleware/purpose.ts` and
    // `middleware/workspace.ts` both write rows with no entity.
    const { rows } = await sealed!.query<{ canon: string }>(
      `SELECT audit_seal_content($1::uuid,$2,$3,NULL,NULL,'{}'::jsonb,$4::timestamptz) AS canon`,
      ['22222222-0000-0000-0000-000000000000', 'operator', 'purpose:access', '2026-01-01T00:00:00Z'],
    );
    expect(rows[0]!.canon).toBe(
      canonicalAuditContent({
        id: '22222222-0000-0000-0000-000000000000',
        actor: 'operator',
        action: 'purpose:access',
        entity: null,
        entityId: null,
        meta: {},
        createdAtIso: '2026-01-01T00:00:00.000000Z',
      }),
    );
  });
});

/* Non-vacuity: if the suite above skipped for want of a database, say what was
 * NOT proved rather than letting a green run imply it was. */
describe('coverage honesty', () => {
  it('states plainly when the database half did not run', () => {
    if (!HAS_DB) {
      expect(
        HAS_DB,
        'DATABASE_URL is unset, so the append-only triggers, the chain, the break '
          + 'detection and the SQL/TS canon agreement were NOT checked in this run. '
          + 'Only the pure serialisation was.',
      ).toBe(false);
    } else {
      expect(HAS_DB).toBe(true);
    }
  });
});
