import { beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  _resetArtifactMigrated,
  isArtifactMigrated,
  listArtifacts,
  mintDownloadGrant,
  redeemDownloadGrant,
  sha256Hex,
  softDeleteArtifact,
  storeArtifact,
} from '../artifact.js';

/**
 * GPS CLIENT ARTIFACT INTAKE — THE TRACE, AND WHERE THE BYTES ARE ALLOWED TO GO.
 *
 * Driven against a stub pool, on purpose: migration 0057 is not owned by this pass,
 * so there is no table to integration-test against, and these properties are about
 * WHICH STATEMENTS ARE ISSUED WITH WHICH PARAMETERS — which a stub observes better
 * than a live database anyway. Same technique as `__tests__/probeResilience.test.ts`
 * and `actions/__tests__/gateFailOpen.test.ts`.
 *
 * The four properties that end careers if they regress:
 *   1. A download that serves bytes ALWAYS writes an audit row naming the actor,
 *      the artifact and the client — and if the row cannot be written, no bytes are
 *      served.
 *   2. File bytes reach `gps_artifact_blob` and NOTHING else. Not the metadata row,
 *      not `audit_log`, not an error, not a log line.
 *   3. A download link is single-use, time-boxed and bound to the principal it was
 *      issued to, enforced in the SQL rather than in a comparison a later refactor
 *      can drop.
 *   4. Delete is soft, and a deleted artifact is a 404 with no byte read.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const ENGAGEMENT = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const BODY = new TextEncoder().encode('%PDF-1.7 confidential draft');

interface Call {
  sql: string;
  params: readonly unknown[];
}

function artifactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTIFACT,
    client_id: CLIENT,
    engagement_id: ENGAGEMENT,
    storage_key: `gps/${CLIENT}/${ENGAGEMENT}/${ARTIFACT}.pdf`,
    // 0057's names, not this module's preferences: `filename`, `mime_type`, `kind`,
    // `deleted_reason`, `purged_at`. If the migration and the code disagree, the
    // migration wins and this stub is where that shows up.
    filename: 'MiCA White Paper v3.pdf',
    mime_type: 'application/pdf',
    byte_size: String(BODY.byteLength), // bigint arrives as text from pg
    sha256: sha256Hex(BODY),
    kind: 'client_input',
    uploaded_by: 'sam',
    uploaded_at: new Date('2026-08-02T09:00:00Z'),
    retention_until: new Date('2028-08-01T09:00:00Z'),
    deleted_at: null,
    deleted_by: null,
    purged_at: null,
    ...overrides,
  };
}

/**
 * A pool that answers the shapes this module issues and records every one. Options
 * move the world, never the assertions: `deleted` marks the artifact gone,
 * `grantUsed` makes the redeem UPDATE match nothing (which is how a used or expired
 * token behaves), `auditFails` makes `audit_log` unwritable.
 */
function stubPool(
  opts: {
    deleted?: boolean;
    grantUsed?: boolean;
    auditFails?: boolean;
    grantActor?: string;
    /** The digest is already on file for this client: 0057's partial unique index. */
    duplicate?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/INSERT INTO audit_log/.test(sql)) {
        if (opts.auditFails) throw new Error('audit_log unavailable');
        return { rows: [], rowCount: 1 };
      }
      if (/FROM gps_engagement/.test(sql)) return { rows: [{ client_id: CLIENT }], rowCount: 1 };
      if (/INSERT INTO gps_artifact\s*\n?\s*\(id,/.test(sql)) {
        // DO NOTHING returns no row when the live digest already exists.
        return opts.duplicate ? { rows: [], rowCount: 0 } : { rows: [artifactRow()], rowCount: 1 };
      }
      if (/WHERE client_id = \$1 AND sha256 = \$2/.test(sql)) {
        return { rows: [artifactRow()], rowCount: 1 };
      }
      if (/token_sha256 = \$1/.test(sql)) {
        return opts.grantUsed
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: 'grant-1', artifact_id: ARTIFACT, actor: opts.grantActor ?? 'sam' }], rowCount: 1 };
      }
      if (/INSERT INTO gps_artifact_grant/.test(sql)) {
        return { rows: [{ id: 'grant-1', expires_at: new Date('2026-08-02T09:01:00Z') }], rowCount: 1 };
      }
      if (/SET deleted_at = now\(\)/.test(sql)) {
        return opts.deleted ? { rows: [], rowCount: 0 } : { rows: [artifactRow()], rowCount: 1 };
      }
      if (/WHERE engagement_id = \$1/.test(sql)) return { rows: [artifactRow()], rowCount: 1 };
      if (/FROM gps_artifact WHERE id = \$1/.test(sql)) {
        return {
          rows: [artifactRow(opts.deleted ? { deleted_at: new Date('2026-08-02T10:00:00Z'), deleted_by: 'nik' } : {})],
          rowCount: 1,
        };
      }
      if (/FROM gps_artifact_blob/.test(sql)) {
        return { rows: [{ bytes: Buffer.from(BODY) }], rowCount: 1 };
      }
      // A statement this stub does not know is a statement the assertions below
      // cannot reason about, so it must fail loudly rather than answer nothing.
      throw new Error(`stub pool: unhandled statement\n${sql}`);
    },
  };
  return { pool: pool as unknown as pg.Pool, calls };
}

const isBinary = (v: unknown): boolean =>
  Buffer.isBuffer(v) || v instanceof Uint8Array || v instanceof ArrayBuffer;

/** The one rule that has no exceptions: bytes go to the blob table or nowhere. */
function assertBytesWentNowhereElse(calls: readonly Call[]) {
  for (const call of calls) {
    for (const p of call.params) {
      if (isBinary(p)) {
        expect(call.sql, 'file bytes were passed to a statement other than the blob insert')
          .toMatch(/gps_artifact_blob/);
      }
      // A stringified body is still the body. Catches the shortcut where someone
      // puts the content into an audit `meta` or a text column as text/base64.
      if (typeof p === 'string' && p.includes('confidential draft')) {
        expect.unreachable(`file content reached a statement as text: ${call.sql}`);
      }
    }
  }
}

beforeEach(() => {
  _resetArtifactMigrated();
});

describe('upload records metadata, and only metadata', () => {
  it('stores the bytes in the blob table and nowhere else', async () => {
    const { pool, calls } = stubPool();
    const got = await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'MiCA White Paper v3.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    expect(got.ok).toBe(true);
    assertBytesWentNowhereElse(calls);
    const blobWrites = calls.filter((c) => /gps_artifact_blob/.test(c.sql));
    expect(blobWrites).toHaveLength(1);
  });

  it('computes the digest server-side rather than accepting one', async () => {
    const { pool, calls } = stubPool();
    await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'x.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    const insert = calls.find((c) => /INSERT INTO gps_artifact\s/.test(c.sql))!;
    expect(insert.params).toContain(sha256Hex(BODY));
  });

  it('derives the storage key and never lets the filename into it', async () => {
    const { pool, calls } = stubPool();
    await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      // Already refused by safeFilename at the route; proves defence in depth.
      filename: 'quarterly report.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    const insert = calls.find((c) => /INSERT INTO gps_artifact\s/.test(c.sql))!;
    const key = insert.params.find((p) => typeof p === 'string' && p.startsWith('gps/')) as string;
    expect(key).toMatch(new RegExp(`^gps/${CLIENT}/${ENGAGEMENT}/[0-9a-f-]{36}\\.pdf$`));
    expect(key).not.toContain('quarterly');
  });

  it('writes an audit row naming the actor, the artifact and the client', async () => {
    const { pool, calls } = stubPool();
    await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'x.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    const audit = calls.find((c) => /INSERT INTO audit_log/.test(c.sql))!;
    expect(audit.params[0]).toBe('sam');
    expect(audit.params[1]).toBe('gps.artifact.upload');
    expect(audit.params[2]).toBe(ARTIFACT);
    expect(JSON.parse(audit.params[3] as string)).toMatchObject({ clientId: CLIENT, engagementId: ENGAGEMENT });
  });

  it('writes the columns 0057 declares, by 0057s names', async () => {
    const { pool, calls } = stubPool();
    await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'x.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    const insert = calls.find((c) => /INSERT INTO gps_artifact\s/.test(c.sql))!;
    // The migration is the schema of record. A rename here is a 500 in production,
    // and the two files are written by different hands.
    expect(insert.sql).toMatch(/\(id, client_id, engagement_id, storage_key, filename, mime_type,/);
    expect(insert.sql).toMatch(/byte_size, sha256, uploaded_by\)/);
    // retention_until is NOT written: 0057 owns the default and the ten-year ceiling.
    // Checked on the INSERT's column list only — it is legitimately in RETURNING.
    const columnList = insert.sql.slice(
      insert.sql.indexOf('INSERT INTO gps_artifact'),
      insert.sql.indexOf('VALUES'),
    );
    expect(columnList).not.toMatch(/retention_until/);
    expect(columnList).not.toMatch(/\bkind\b/);
  });

  it('is idempotent on the digest, and records no second receipt', async () => {
    // 0057's partial unique index makes "the same file twice is one row" a database
    // fact and its header says intake upserts on it. A duplicate must not 500 and
    // must not write an upload audit row for something already on file.
    const { pool, calls } = stubPool({ duplicate: true });
    const got = await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'x.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.deduplicated).toBe(true);
    const insert = calls.find((c) => /INSERT INTO gps_artifact\s/.test(c.sql))!;
    expect(insert.sql).toMatch(/ON CONFLICT \(client_id, sha256\) WHERE deleted_at IS NULL DO NOTHING/);
    expect(calls.some((c) => /INSERT INTO audit_log/.test(c.sql))).toBe(false);
  });

  it('refuses when the engagement does not exist, and stores nothing', async () => {
    const pool = {
      query: async (sql: string) => {
        if (/FROM gps_engagement/.test(sql)) return { rows: [], rowCount: 0 };
        throw new Error(`must not run: ${sql}`);
      },
    } as unknown as pg.Pool;
    const got = await storeArtifact(pool, {
      engagementId: ENGAGEMENT,
      filename: 'x.pdf',
      mime: 'application/pdf',
      ext: '.pdf',
      bytes: BODY,
      uploadedBy: 'sam',
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('engagement_not_found');
  });
});

describe('a download always leaves a trace', () => {
  it('writes the audit row and returns the bytes', async () => {
    const { pool, calls } = stubPool();
    const minted = await mintDownloadGrant(pool, { artifactId: ARTIFACT, actor: 'sam' });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    // Minting is not a download: no download row yet.
    expect(calls.filter((c) => /INSERT INTO audit_log/.test(c.sql))).toHaveLength(0);
    // Only the digest is stored; the token itself is not in any parameter.
    const insert = calls.find((c) => /INSERT INTO gps_artifact_grant/.test(c.sql))!;
    expect(insert.params).not.toContain(minted.token);
    expect(insert.params[1]).toBe(sha256Hex(new TextEncoder().encode(minted.token)));

    const served = await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: minted.token, actor: 'sam' });
    expect(served.ok).toBe(true);
    if (served.ok) expect(served.bytes.equals(Buffer.from(BODY))).toBe(true);
    const audit = calls.find((c) => /INSERT INTO audit_log/.test(c.sql))!;
    expect(audit.params[0]).toBe('sam');
    expect(audit.params[1]).toBe('gps.artifact.download');
    expect(audit.params[2]).toBe(ARTIFACT);
    expect(JSON.parse(audit.params[3] as string)).toMatchObject({ clientId: CLIENT, grantId: 'grant-1' });
    assertBytesWentNowhereElse(calls);
  });

  it('SERVES NOTHING when the audit row cannot be written', async () => {
    // The property, stated as a failure: an unrecorded read of a client's document
    // must be impossible, so a broken audit table breaks downloads.
    const { pool } = stubPool({ auditFails: true });
    const minted = await mintDownloadGrant(pool, { artifactId: ARTIFACT, actor: 'sam' });
    if (!minted.ok) throw new Error('mint failed');
    await expect(
      redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: minted.token, actor: 'sam' }),
    ).rejects.toThrow(/audit_log/);
  });

  it('consumes the link in the same statement that checks it', async () => {
    const { pool, calls } = stubPool();
    const minted = await mintDownloadGrant(pool, { artifactId: ARTIFACT, actor: 'sam' });
    if (!minted.ok) throw new Error('mint failed');
    await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: minted.token, actor: 'sam' });
    const redeem = calls.find((c) => /token_sha256 = \$1/.test(c.sql))!;
    // Single-use and expiry live in the WHERE clause, so two concurrent redemptions
    // cannot both win and a refactor cannot drop the check without touching the SQL.
    expect(redeem.sql).toMatch(/SET used_at = now\(\)/);
    expect(redeem.sql).toMatch(/used_at IS NULL/);
    expect(redeem.sql).toMatch(/expires_at > now\(\)/);
  });

  it('refuses a used or expired link, and reads no bytes', async () => {
    const { pool, calls } = stubPool({ grantUsed: true });
    const got = await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: 'a'.repeat(43), actor: 'sam' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('grant_invalid');
    expect(calls.some((c) => /gps_artifact_blob/.test(c.sql))).toBe(false);
  });

  it('refuses a link presented by a different principal, and reads no bytes', async () => {
    const { pool, calls } = stubPool({ grantActor: 'nik' });
    const got = await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: 'a'.repeat(43), actor: 'sam' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('grant_actor_mismatch');
    expect(calls.some((c) => /gps_artifact_blob/.test(c.sql))).toBe(false);
  });

  it('refuses a malformed token without touching the database', async () => {
    const { pool, calls } = stubPool();
    const got = await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: undefined, actor: 'sam' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('grant_invalid');
    expect(calls).toHaveLength(0);
  });
});

describe('delete is soft, and a deleted artifact is gone from every read', () => {
  it('sets deleted_at, burns outstanding links, and issues no DELETE', async () => {
    const { pool, calls } = stubPool();
    const got = await softDeleteArtifact(pool, { artifactId: ARTIFACT, actor: 'nik', reason: 'client withdrew it' });
    expect(got.ok).toBe(true);
    const update = calls.find((c) => /SET deleted_at = now\(\)/.test(c.sql))!;
    expect(update.sql).toMatch(/UPDATE gps_artifact_grant SET used_at = now\(\)/);
    for (const c of calls) expect(c.sql).not.toMatch(/DELETE\s+FROM/i);
    const audit = calls.find((c) => /INSERT INTO audit_log/.test(c.sql))!;
    expect(audit.params[1]).toBe('gps.artifact.delete');
    expect(audit.params[0]).toBe('nik');
  });

  it('answers not_found — never "deleted" — when a link is minted for it', async () => {
    const { pool, calls } = stubPool({ deleted: true });
    const got = await mintDownloadGrant(pool, { artifactId: ARTIFACT, actor: 'sam' });
    expect(got.ok).toBe(false);
    // 'not_found' rather than 'already_deleted': the answer must not confirm that a
    // client document exists to anyone holding an id.
    if (!got.ok) expect(got.code).toBe('not_found');
    expect(calls.some((c) => /INSERT INTO gps_artifact_grant/.test(c.sql))).toBe(false);
  });

  it('answers not_found on redemption of a link minted before the delete', async () => {
    const { pool, calls } = stubPool({ deleted: true });
    const got = await redeemDownloadGrant(pool, { artifactId: ARTIFACT, token: 'a'.repeat(43), actor: 'sam' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('not_found');
    expect(calls.some((c) => /gps_artifact_blob/.test(c.sql))).toBe(false);
  });

  it('reports already_deleted only to a second delete, which changes nothing', async () => {
    const { pool } = stubPool({ deleted: true });
    const got = await softDeleteArtifact(pool, { artifactId: ARTIFACT, actor: 'nik' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('already_deleted');
  });

  it('omits deleted rows from the engagement list, in SQL', async () => {
    const { pool, calls } = stubPool();
    await listArtifacts(pool, ENGAGEMENT);
    const list = calls[0]!;
    expect(list.sql).toMatch(/deleted_at IS NULL/);
    // The read path cannot reach the bytes at all.
    expect(list.sql).not.toMatch(/gps_artifact_blob|bytes/);
  });
});

describe('the migration probe follows the rule the other five follow', () => {
  it('requires all three tables', async () => {
    const { pool, calls } = stubPool();
    expect(await isArtifactMigrated(pool)).toBe(true);
    expect(calls[0]!.sql).toMatch(/gps_artifact'/);
    expect(calls[0]!.sql).toMatch(/gps_artifact_blob'/);
    expect(calls[0]!.sql).toMatch(/gps_artifact_grant'/);
  });

  it('fails closed on a transient error and caches NOTHING', async () => {
    let n = 0;
    const pool = {
      query: async () => {
        n += 1;
        if (n === 1) {
          const err = new Error('Connection terminated unexpectedly') as Error & { code?: string };
          err.code = 'ECONNRESET';
          throw err;
        }
        return { rows: [{ ok: true }], rowCount: 1 };
      },
    } as unknown as pg.Pool;
    expect(await isArtifactMigrated(pool)).toBe(false);
    // A probe that threw is not an answer: the next call re-probes and recovers.
    expect(await isArtifactMigrated(pool)).toBe(true);
    expect(n).toBe(2);
  });
});
