import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  ARTIFACT_FILENAME_MAX,
  ARTIFACT_GRANT_TTL_SECONDS,
  ARTIFACT_MAX_BYTES,
  ARTIFACT_MIME_ALLOWLIST,
  ARTIFACT_RETENTION_DAYS,
  isArtifactMigrated,
  isUuid,
  listArtifacts,
  mintDownloadGrant,
  readBoundedBody,
  redeemDownloadGrant,
  safeFilename,
  softDeleteArtifact,
  storeArtifact,
  verifyDeclaredMime,
  type ArtifactRefusal,
} from '../gps/artifact.js';

/**
 * GLOBAL SERVICES (GPS) — CLIENT ARTIFACT INTAKE. The route half.
 *
 *   POST   /engagements/:id/artifacts        upload one file (operate)
 *   GET    /engagements/:id/artifacts        what is on file for an engagement (view)
 *   GET    /artifacts/:id/download-url       mint a short-TTL single-use link (view)
 *   GET    /artifacts/:id/content?grant=…    the link's target: the bytes (view)
 *   DELETE /artifacts/:id                    soft delete (operate)
 *
 * DECISION D2 IS ANSWERED (owner, 2026-08-02): GPS MAY STORE CLIENT DOCUMENTS. The
 * refusals live in `../gps/artifact.ts`; read its header first — it carries the
 * required 0057 schema, the size ceiling, the MIME allowlist, the leading-byte
 * check, the derived storage key and the audit contract.
 *
 * ══ THE CAPABILITY GATE IS INHERITED, AND IT WAS VERIFIED, NOT ASSUMED. ══
 * This router is mounted INTO `gpsRoutes` (`routes/gps.ts`, at its foot) and never
 * in `app.ts` — `gps/__tests__/intakeLockout.test.ts:315` fails the build if
 * anything but `gpsRoutes` is mounted under `/v1/gps`. Because `/v1/gps` is the only
 * prefix in the `gps` workspace's `apiPrefixes` (`packages/shared/src/workspaces.ts`)
 * and `app.ts:163-172` installs a gate on that prefix and `${prefix}/*`, every path
 * below is behind `requireWorkspace('gps', …)` by construction. WHICH capability is
 * decided by `app.ts:requiresOperate` — 'view' for GET/HEAD/OPTIONS, 'operate' for
 * everything else unless the path is on the `READ_SHAPED_POSTS` allowlist, which no
 * GPS path may ever join (`__tests__/workspaceWriteGate.test.ts`). So POST upload
 * and DELETE gate at 'operate', and the three reads gate at 'view', with nothing
 * declared here. `routes/__tests__/gpsArtifact.test.ts` asserts exactly that for
 * each of the five paths — the ratchet, not the comment, is the claim.
 *
 * `gps` is `legacy:false` (DEFAULT-DENY) and `machineAccess: false`, so the shared
 * API key, the monitors and the AI hold nothing here: a client's document cannot be
 * read by the least attributable principal in the system.
 *
 * WHY MINTING A LINK IS A GET. It gates at 'view', which is the right tier for
 * reading a file, and a POST would have demanded 'operate' — making every read-only
 * member unable to open a document they are entitled to see. It does write a grant
 * row, so it is not a pure read; that is a deliberate, narrow exception to
 * "GET writes nothing", of exactly the kind `middleware/purpose.ts` already makes
 * when a read writes its own audit row.
 *
 * ══ THE UPLOAD IS A RAW BODY, NOT MULTIPART, AND THAT IS A SECURITY DECISION. ══
 * Hono has no built-in multipart parser, so accepting `multipart/form-data` would
 * mean adding a parser — a new, complex, historically CVE-rich attack surface —
 * placed in front of the most sensitive bytes in this repo, in exchange for
 * envelope syntax we do not need. One file per request, its bytes as the body, its
 * declared type in `Content-Type`, its name in `X-Artifact-Filename`. Both headers
 * are untrusted input and both are validated before a byte is stored.
 *
 * MIGRATION-PENDING DISCIPLINE, as in every GPS route file: validation runs BEFORE
 * the probe (a malformed request is malformed in every environment), reads answer
 * 200 with an empty well-shaped body and `migrated: false`, and writes answer 503 —
 * never 500, which the desk reads as "the platform is down" instead of "run one
 * migration".
 *
 * ATTRIBUTION IS ALWAYS `c.get('operator')`, NEVER A BODY FIELD OR A HEADER. On a
 * download record that is the difference between an audit trail and a rumour.
 */
export const gpsArtifactRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** Reads degrade to this; writes answer 503 with it. Never 500. */
const NOT_MIGRATED = {
  error: 'GLOBAL SERVICES artifact intake is awaiting migration 0057 on this environment',
  code: 'MIGRATION_PENDING',
};

/**
 * The intake contract, echoed on every refusal and on the empty list, so a client
 * that hits the ceiling learns the ceiling instead of guessing at it.
 */
const LIMITS = {
  maxBytes: ARTIFACT_MAX_BYTES,
  allowedMimeTypes: ARTIFACT_MIME_ALLOWLIST.map((s) => s.mime),
  filenameMaxLength: ARTIFACT_FILENAME_MAX,
  retentionDays: ARTIFACT_RETENTION_DAYS,
  downloadLinkTtlSeconds: ARTIFACT_GRANT_TTL_SECONDS,
};

/** Which HTTP status each refusal deserves. A refusal is never a 500. */
const STATUS: Record<ArtifactRefusal['code'], 400 | 403 | 404 | 409 | 413 | 415> = {
  empty_body: 400,
  too_large: 413,
  mime_not_declared: 400,
  mime_not_allowed: 415,
  mime_mismatch: 415,
  filename_missing: 400,
  filename_unsafe: 400,
  filename_too_long: 400,
  engagement_not_found: 404,
  not_found: 404,
  already_deleted: 409,
  // An invalid, used or expired link is a 404 and not a 401: it must not confirm
  // that the artifact behind it exists.
  grant_invalid: 404,
  grant_actor_mismatch: 403,
  db_constraint: 409,
};

const refusal = (r: ArtifactRefusal) =>
  ({ error: r.reason, code: r.code.toUpperCase(), data: { limits: LIMITS } });

/* ── Upload ──────────────────────────────────────────────────────────────────── */

gpsArtifactRoutes.post('/engagements/:id/artifacts', requireOperator, async (c) => {
  const engagementId = c.req.param('id');
  if (!isUuid(engagementId)) {
    return c.json({ error: 'engagement id must be a uuid', code: 'VALIDATION' }, 400);
  }
  const name = safeFilename(c.req.header('x-artifact-filename'));
  if (!name.ok) return c.json(refusal(name), STATUS[name.code]);

  if (!(await isArtifactMigrated(getPool()))) return c.json(NOT_MIGRATED, 503);

  // The ceiling is enforced while reading, from the bytes actually arriving —
  // Content-Length is a claim and is not consulted for the decision.
  const read = await readBoundedBody(c.req.raw.body, ARTIFACT_MAX_BYTES);
  if (!read.ok) return c.json(refusal(read), STATUS[read.code]);

  // The declared type against the leading bytes. A .pdf that is not a PDF stops here.
  const verified = verifyDeclaredMime(c.req.header('content-type'), read.bytes);
  if (!verified.ok) return c.json(refusal(verified), STATUS[verified.code]);

  try {
    const stored = await storeArtifact(getPool(), {
      engagementId,
      filename: name.value,
      mime: verified.spec.mime,
      ext: verified.spec.ext,
      bytes: read.bytes,
      uploadedBy: c.get('operator').id,
    });
    if (!stored.ok) return c.json(refusal(stored), STATUS[stored.code]);
    // 200 + `deduplicated` when 0057's (client_id, sha256) index says we already
    // hold these exact bytes; 201 only when a row was actually created. A blanket
    // 201 would tell an uploader it had added a second copy that does not exist.
    return c.json(
      { data: stored.artifact, meta: { ...meta(), deduplicated: stored.deduplicated === true } },
      stored.deduplicated === true ? 200 : 201,
    );
  } catch (err) {
    // The message NEVER carries the body: an error string is logged, shipped to a
    // browser and pasted into tickets, and this body is a client's confidential file.
    console.error('[gps.artifact] upload error:', err);
    return c.json({ error: 'Failed to store the artifact', code: 'GPS_ERROR' }, 500);
  }
});

/* ── List for an engagement ──────────────────────────────────────────────────── */

gpsArtifactRoutes.get('/engagements/:id/artifacts', requireOperator, async (c) => {
  const engagementId = c.req.param('id');
  if (!isUuid(engagementId)) {
    return c.json({ error: 'engagement id must be a uuid', code: 'VALIDATION' }, 400);
  }
  try {
    const pool = getPool();
    if (!(await isArtifactMigrated(pool))) {
      return c.json({ data: [], meta: { ...meta(), migrated: false, limits: LIMITS } });
    }
    return c.json({
      data: await listArtifacts(pool, engagementId),
      meta: { ...meta(), migrated: true, limits: LIMITS },
    });
  } catch (err) {
    console.error('[gps.artifact] list error:', err);
    return c.json({ error: 'Failed to list artifacts', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Download: mint the link, then redeem it ─────────────────────────────────── */

gpsArtifactRoutes.get('/artifacts/:id/download-url', requireOperator, async (c) => {
  const artifactId = c.req.param('id');
  if (!isUuid(artifactId)) {
    return c.json({ error: 'artifact id must be a uuid', code: 'VALIDATION' }, 400);
  }
  try {
    const pool = getPool();
    if (!(await isArtifactMigrated(pool))) return c.json(NOT_MIGRATED, 503);
    const granted = await mintDownloadGrant(pool, {
      artifactId,
      actor: c.get('operator').id,
    });
    if (!granted.ok) return c.json(refusal(granted), STATUS[granted.code]);
    return c.json({
      data: {
        url: granted.path,
        expiresAt: granted.expiresAt,
        ttlSeconds: granted.ttlSeconds,
        singleUse: true,
        artifact: granted.artifact,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[gps.artifact] download-url error:', err);
    return c.json({ error: 'Failed to issue a download link', code: 'GPS_ERROR' }, 500);
  }
});

/**
 * The bytes. Reachable only with an unexpired, unused grant issued to THIS
 * principal, and every success writes the audit row before anything is sent — the
 * insert happens inside `redeemDownloadGrant`, so a failure to record throws and
 * this handler answers 500 with no body. There is no path through this function
 * that returns a client's file and leaves no trace.
 */
gpsArtifactRoutes.get('/artifacts/:id/content', requireOperator, async (c) => {
  const artifactId = c.req.param('id');
  if (!isUuid(artifactId)) {
    return c.json({ error: 'artifact id must be a uuid', code: 'VALIDATION' }, 400);
  }
  try {
    const pool = getPool();
    if (!(await isArtifactMigrated(pool))) return c.json(NOT_MIGRATED, 503);
    const served = await redeemDownloadGrant(pool, {
      artifactId,
      token: c.req.query('grant'),
      actor: c.get('operator').id,
    });
    if (!served.ok) return c.json(refusal(served), STATUS[served.code]);
    // `attachment` and a quoted, already-validated filename: the name has no
    // separator, no control byte and no quote-breaking content by the time it is
    // stored, so it cannot forge a second header or a path here.
    c.header('Content-Type', served.artifact.mime);
    c.header('Content-Disposition', `attachment; filename="${served.artifact.filename}"`);
    c.header('X-Content-Type-Options', 'nosniff');
    // A client document must never sit in a shared or browser cache.
    c.header('Cache-Control', 'no-store, private');
    c.header('X-Artifact-Sha256', served.artifact.sha256);
    // The cast is Hono's `Data` type not naming Buffer, which is a Uint8Array and a
    // valid Response body at runtime. Copying it to satisfy a type would duplicate up
    // to 25 MB of a client's document in memory for nothing.
    return c.body(served.bytes as unknown as ArrayBuffer, 200);
  } catch (err) {
    console.error('[gps.artifact] content error:', err);
    return c.json({ error: 'Failed to serve the artifact', code: 'GPS_ERROR' }, 500);
  }
});

/* ── Soft delete ─────────────────────────────────────────────────────────────── */

gpsArtifactRoutes.delete('/artifacts/:id', requireOperator, async (c) => {
  const artifactId = c.req.param('id');
  if (!isUuid(artifactId)) {
    return c.json({ error: 'artifact id must be a uuid', code: 'VALIDATION' }, 400);
  }
  // The reason is optional prose about the decision, read from the query string so
  // this stays a bodyless DELETE. It is never file content and is length-bounded.
  const reason = c.req.query('reason')?.slice(0, 500) ?? null;
  try {
    const pool = getPool();
    if (!(await isArtifactMigrated(pool))) return c.json(NOT_MIGRATED, 503);
    const gone = await softDeleteArtifact(pool, {
      artifactId,
      actor: c.get('operator').id,
      reason,
    });
    if (!gone.ok) return c.json(refusal(gone), STATUS[gone.code]);
    return c.json({ data: gone.artifact, meta: meta() });
  } catch (err) {
    console.error('[gps.artifact] delete error:', err);
    return c.json({ error: 'Failed to delete the artifact', code: 'GPS_ERROR' }, 500);
  }
});
