import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REGISTERED_MIGRATIONS } from '../migrationLedger.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  0057 — THE MIGRATION THAT ENDS THE INTAKE LOCKOUT, PINNED PROPERTY BY PROPERTY.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Nine migrations refused to hold a client document because decision D2 was
 *  unanswered. It is answered: GPS may store them. So the interesting assertions
 *  are no longer "there is nowhere to write bytes" — they are the four things the
 *  answer came with, and every one of them is a property a later edit could quietly
 *  lose while the table kept working:
 *
 *    THIS FILE holds no bytes — no bytea, no large object, nothing byte-typed in it.
 *      Read that claim at exactly its width: it is about 0057, not about the system.
 *      Byte custody ended up in `gps_artifact_blob` (0058_gps_artifact_custody.sql),
 *      because reaching the bucket 0057 creates needs a Supabase service credential
 *      the API does not have and cannot be given without a new environment variable.
 *      So `gps_artifact` is still pure metadata and the assertion below still holds
 *      and still matters — a bytea column HERE would be the one every `SELECT *` on
 *      the table the whole desk reads would drag a client's document through. Where
 *      the bytes may live is pinned once, by name, in
 *      `gps/__tests__/intakeLockout.test.ts`;
 *    the bucket is PRIVATE, declared in the migration rather than clicked, and
 *      re-asserted private on every re-run;
 *    RETENTION is not optional — NOT NULL, defaulted, and capped, so "kept forever
 *      with no policy" cannot be represented;
 *    the carried client_id CANNOT DRIFT from the parent engagement, and the storage
 *      key cannot point outside the client it belongs to.
 *
 *  These are read off the SQL, with no database, because production applies this
 *  file BY HAND in the Supabase SQL editor — the gate never runs it, so the gate is
 *  the only place the properties can be defended before a human pastes it.
 */

const DB = dirname(fileURLToPath(import.meta.url));
const FILE = '0057_gps_artifact.sql';
const RAW = readFileSync(resolve(DB, '..', 'migrations', FILE), 'utf8');

/**
 * Line comments stripped. This file EXPLAINS at length why it avoids destructive
 * statements and how a bucket must never be public, so a scan of raw text would fire
 * on the explanation — which teaches the next person to delete the explanation rather
 * than keep the property. Same reasoning as gpsPendingSchema.test.ts.
 */
const SQL = RAW.replace(/--[^\n]*/g, '');

/** Column declarations `name type`, two-space indented, as the migrations write them. */
const COLUMN = /^\s{2,}([a-z_][a-z0-9_]*)\s+([a-z]+)\b/gim;
const columns = new Map<string, string>();
for (const m of SQL.matchAll(COLUMN)) if (!columns.has(m[1]!)) columns.set(m[1]!, m[2]!);

describe('0057 exists, is registered, and is not vacuous', () => {
  it('is substantial SQL and not a stub', () => {
    // Non-vacuity first: every assertion below is a regex over RAW, and an empty or
    // truncated file is the standard way a content ratchet dies quietly.
    expect(SQL.length).toBeGreaterThan(2000);
    expect(columns.size).toBeGreaterThan(12);
  });

  it('is listed as PENDING and is not pinned as shipped', () => {
    // It has reached no database. The moment it is applied by hand it moves into
    // SHIPPED with its digest and becomes immutable like the rest.
    /* The ledger must ACCOUNT for this file. It used to assert PENDING specifically,
     * which became false when production turned out to have it applied — a fact about
     * the database, not a defect. See migrationLedger.ts REGISTERED_MIGRATIONS. */
    expect(REGISTERED_MIGRATIONS).toContain(FILE);
  });

  it('names the D2 decision, as every GPS migration must', () => {
    expect(/\bD2\b|\bDPO\b|controller vs processor/i.test(RAW)).toBe(true);
  });
});

describe('0057 creates gps_artifact with the columns intake needs', () => {
  it('creates the table and enables row level security with no policy on it', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS gps_artifact\b/);
    expect(
      SQL,
      'Supabase exposes public tables through its auto-generated REST API, so without '
        + 'RLS the anon key would read a list of every confidential document a named '
        + 'client sent — filename, size and the exact key to fetch the bytes.',
    ).toMatch(/ALTER TABLE gps_artifact ENABLE ROW LEVEL SECURITY/);
    // Deny-all with no policy is the intent on the public table. The only policy in
    // this file is on storage.objects, asserted separately below.
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]{0,200}ON gps_artifact/i);
  });

  it('declares every column an intake surface has to write', () => {
    for (const c of [
      'engagement_id', 'client_id', 'filename', 'mime_type', 'byte_size', 'sha256',
      'storage_key', 'uploaded_by', 'uploaded_at', 'retention_until', 'deleted_at',
      'created_at', 'updated_at',
    ]) {
      expect(columns.has(c), `gps_artifact has no ${c} column`).toBe(true);
    }
  });

  it('carries client_id AND engagement_id, both NOT NULL', () => {
    // 0047's rule: "every document we hold for this client" must be a scan, because
    // that read IS the erasure response and the breach-notification scope.
    expect(SQL).toMatch(/client_id\s+uuid NOT NULL REFERENCES gps_client\(id\) ON DELETE CASCADE/);
    expect(SQL).toMatch(/engagement_id\s+uuid NOT NULL/);
  });
});

describe('gps_artifact is metadata and the bytes are not in it', () => {
  it('declares no byte-typed column anywhere', () => {
    // This is the table the whole desk reads — the engagement file list, the erasure
    // scan, the retention sweep. A bytea column here is a client's document inside
    // every one of those answers, and inside every `pg_dump` a developer takes.
    // lo/oid would be worse still: pg_largeobject is not an RLS-protected table at
    // all, silently undoing the posture 0047 set for the whole compartment.
    for (const [name, type] of columns) {
      expect(
        /^(bytea|blob|lo|oid|bit|varbit|xml)$/.test(type),
        `gps_artifact.${name} is ${type} — the bytes belong in gps_artifact_blob `
          + '(0058) or in the bucket, and this column is somewhere to put them instead.',
      ).toBe(false);
    }
    expect(SQL).not.toMatch(/\blo_(import|from_bytea|create)\b/i);
    expect(SQL).not.toMatch(/\bpg_largeobject\b/i);
  });

  it('stores a key into the bucket, constrained to the row\'s own client', () => {
    expect(columns.get('storage_key')).toBe('text');
    expect(
      SQL,
      'a row that can name another client\'s object is the confidentiality failure '
        + 'this compartment exists to prevent, so it is unrepresentable rather than '
        + 'merely unlikely',
    ).toMatch(/strpos\(storage_key, client_id::text\) > 0/);
    // A key is a name, not a traversal.
    expect(SQL).toMatch(/strpos\(storage_key, '\.\.'\) = 0/);
  });

  it('refuses a filename that is really a path', () => {
    expect(SQL).toMatch(/strpos\(filename, '\/'\) = 0/);
    // chr(92) is a backslash, spelled that way because a literal one inside a LIKE
    // pattern is escape-sensitive and this constraint has to be obviously correct.
    expect(SQL).toMatch(/strpos\(filename, chr\(92\)\) = 0/);
  });

  it('fixes the digest shape, which is what makes one file one row', () => {
    expect(SQL).toMatch(/sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  });
});

describe('the bucket is created private, in the migration, not in a dashboard', () => {
  it('inserts the bucket with public = false', () => {
    expect(SQL).toMatch(/INSERT INTO storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/);
    expect(SQL).toMatch(/'gps-artifacts',\s*'gps-artifacts',\s*false/);
  });

  it('re-asserts private on a re-run instead of leaving an existing bucket alone', () => {
    // ON CONFLICT DO NOTHING would let a bucket someone had made public stay public
    // while this file claimed otherwise — the same class of lie as a migration edited
    // after it was applied.
    expect(SQL).toMatch(/ON CONFLICT \(id\) DO UPDATE\s+SET public\s*=\s*false/);
  });

  it('caps object size in the bucket and in the table, at the same number', () => {
    const inBucket = /file_size_limit[\s\S]{0,400}?(\d{6,})/.exec(SQL)?.[1];
    const inTable = /byte_size > 0 AND byte_size <= (\d+)/.exec(SQL)?.[1];
    expect(inTable, 'byte_size has no upper bound').toBeTruthy();
    expect(
      inTable,
      'the table and the bucket must agree about what an acceptable object is, or a '
        + 'row can claim an object the bucket would have refused',
    ).toBe(inBucket);
  });

  it('allows no archive or macro-enabled type, which would make the list decorative', () => {
    const list = /allowed_mime_types[\s\S]*?ARRAY\[([\s\S]*?)\]/.exec(SQL)?.[1] ?? '';
    expect(list).toContain('application/pdf');
    for (const bad of ['zip', 'x-7z', 'x-rar', 'macroEnabled', 'octet-stream']) {
      expect(list, `${bad} is a container that can hold anything`).not.toContain(bad);
    }
  });
});

describe('no public read, ever', () => {
  it('closes the bucket to anon and authenticated with a RESTRICTIVE policy', () => {
    expect(SQL).toMatch(/CREATE POLICY \w+\s+ON storage\.objects\s+AS RESTRICTIVE/);
    expect(SQL).toMatch(/FOR ALL\s+TO anon, authenticated/);
  });

  it('scopes that policy to this bucket, so it cannot break every other one', () => {
    // A blanket USING (false) would silently close every bucket in the project, which
    // is how a security tightening becomes an outage.
    expect(SQL).toMatch(/USING \(bucket_id <> 'gps-artifacts'\)/);
    expect(SQL).toMatch(/WITH CHECK \(bucket_id <> 'gps-artifacts'\)/);
    expect(SQL).not.toMatch(/USING \(\s*false\s*\)/i);
  });

  it('grants nothing: there is no permissive policy in the file', () => {
    // RESTRICTIVE is AND-ed into every other policy, so no future permissive policy —
    // including two clicks in the Storage dashboard — can open this bucket. A
    // permissive policy here would be the hole the restrictive one exists to close.
    const policies = [...SQL.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p, `a permissive policy grants access: ${p.slice(0, 80)}`).toMatch(/AS RESTRICTIVE/);
    }
  });

  it('makes sure row level security is actually on where the policy lands', () => {
    // A restrictive policy on a table with RLS off is a security posture that does
    // nothing while looking like something.
    expect(SQL).toMatch(/ALTER TABLE storage\.objects ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/relrowsecurity/);
  });
});

describe('retention and erasure are enforced, not documented', () => {
  it('makes retention_until NOT NULL with a default, so an intake route cannot omit it', () => {
    expect(SQL).toMatch(/retention_until timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '\d+ year/);
  });

  it('caps retention, so "forever" cannot be spelled with digits', () => {
    expect(
      SQL,
      '"stored forever with no policy" is the failure mode a regulator asks about, and '
        + 'a NOT NULL column with no ceiling does not prevent it',
    ).toMatch(/retention_until > uploaded_at\s+AND retention_until <= uploaded_at \+ interval '\d+ year/);
  });

  it('separates the settled decision from the bytes actually being gone', () => {
    // One flag would let the system report an erasure it had not performed, which is
    // what makes an erasure log worse than none.
    expect(columns.has('deleted_at')).toBe(true);
    expect(columns.has('purged_at')).toBe(true);
    expect(SQL).toMatch(/CHECK \(purged_at IS NULL OR \(deleted_at IS NOT NULL AND purged_at >= deleted_at\)\)/);
  });

  it('attributes a removal to a named human, like every other GPS decision', () => {
    expect(SQL).toMatch(/CHECK \(deleted_at IS NULL OR deleted_by IS NOT NULL\)/);
  });

  it('indexes the two worklists that make the columns trustworthy', () => {
    // Retention nobody can afford to scan for is a promise; the purge list is the
    // only honest answer to "have you erased it".
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS \w+\s+ON gps_artifact \(retention_until\)\s+WHERE deleted_at IS NULL/);
    expect(SQL).toMatch(/WHERE deleted_at IS NOT NULL AND purged_at IS NULL/);
  });
});

describe('the same file twice is one row, and the client dimension cannot drift', () => {
  it('makes (client_id, sha256) unique among live rows', () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON gps_artifact \(client_id, sha256\)\s+WHERE deleted_at IS NULL/,
    );
  });

  it('leaves a re-upload possible after a removal, which a total unique index would forbid', () => {
    // Without the partial predicate a document removed at the client's request could
    // never be accepted again, and the operator would see a constraint violation with
    // no explanation.
    const idx = /ON gps_artifact \(client_id, sha256\)[\s\S]*?;/.exec(SQL)?.[0] ?? '';
    expect(idx).toContain('WHERE deleted_at IS NULL');
  });

  it('makes one row per stored object, unconditionally', () => {
    // Two rows on one key would let a settled row's purge take the bytes out from
    // under a live row: a document disappearing with no record of why.
    const idx = /CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON gps_artifact \(storage_key\);/.exec(SQL)?.[0];
    expect(idx, 'storage_key is not uniquely indexed').toBeTruthy();
    expect(idx).not.toContain('WHERE');
  });

  it('holds the carried client_id true with the composite FK 0049 established', () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \(engagement_id, client_id\)\s+REFERENCES gps_engagement \(id, client_id\)\s+ON UPDATE CASCADE ON DELETE CASCADE/,
    );
  });
});

describe('0057 is safe for a human to paste', () => {
  it('is forward-only: nothing destructive, in statements or in prose', () => {
    // The Supabase SQL editor raises a destructive-operation warning on these and it
    // costs the person applying the file a round trip. Checked against RAW, not SQL,
    // because the editor greps the text it is handed, comments included.
    for (const pattern of [
      /\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bDROP\s+INDEX\b/i,
      /\bDROP\s+CONSTRAINT\b/i, /\bDROP\s+POLICY\b/i, /\bTRUNCATE\b/i,
      /^\s*DELETE\s+FROM/im, /\bALTER\s+COLUMN\b/i,
    ]) {
      expect(RAW, `0057 matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it('is idempotent: every object is guarded, including the policy', () => {
    for (const m of SQL.matchAll(/CREATE (TABLE|INDEX|UNIQUE INDEX)\s+(?!IF NOT EXISTS)/g)) {
      expect.fail(`CREATE ${m[1]} without IF NOT EXISTS — a second run would raise`);
    }
    // CREATE POLICY has no IF NOT EXISTS form, so the only re-runnable shape that does
    // not need a destructive statement first is a pg_policies test around it.
    expect(SQL).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_policies[\s\S]*?CREATE POLICY/);
  });

  it('stays runnable on a database that is not Supabase', () => {
    // No storage schema and no anon role on a developer's local Postgres. Without the
    // guard the file is unrunnable outside Supabase and gps_artifact becomes
    // unreachable in local development for no benefit.
    expect(SQL).toMatch(/table_schema = 'storage' AND table_name = 'objects'/);
    expect(SQL).toMatch(/pg_roles WHERE rolname = 'anon'/);
    expect(RAW).toMatch(/RAISE NOTICE/);
  });
});
