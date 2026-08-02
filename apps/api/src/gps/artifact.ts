/**
 * GLOBAL SERVICES (GPS) — CLIENT ARTIFACT INTAKE. The engine half.
 *
 * ══ DECISION D2 IS ANSWERED (owner, 2026-08-02): GPS MAY STORE CLIENT FILES. ══
 * Every earlier GPS file states, correctly for its date, that this system is
 * physically incapable of accepting a client document because the controller /
 * processor question was open. It is now closed in the affirmative, so the
 * capability exists — and the whole burden that the lockout used to carry moves
 * into this file. Read the refusals below as the price of that answer, not as
 * defensive programming: this surface receives a third party's unpublished
 * offering documents and counsel's memoranda onto the infrastructure of an
 * EU/Liechtenstein-regulated exchange.
 *
 * THE PROPERTIES THIS FILE OWNS, each with the failure it prevents:
 *   · SIZE CEILING, server-side, enforced while READING the stream — not from
 *     Content-Length, which a client controls and can lie about. Exceeding it is a
 *     REFUSAL of the whole upload; nothing is ever truncated and stored, because a
 *     truncated regulatory filing that looks stored is worse than no upload.
 *   · MIME ALLOWLIST plus LEADING-BYTE VERIFICATION. A `.pdf` that does not begin
 *     `%PDF-` is refused. The declared type is a claim; the bytes are the evidence.
 *   · sha256 COMPUTED HERE from the bytes actually received. A client-supplied
 *     digest is a statement about a file we did not verify, and it is exactly the
 *     field someone later relies on to prove what was handed over.
 *   · FILENAMES ARE UNTRUSTED DISPLAY TEXT AND NOTHING ELSE. No separator, no
 *     traversal, no control byte, and never any part of the storage key — the key
 *     is DERIVED from ids this server already trusts (`deriveStorageKey`).
 *   · BYTES LIVE IN EXACTLY ONE PLACE. `gps_artifact_blob.bytes`, one row, reached
 *     by primary key. They are never copied into the metadata table, an audit row,
 *     a log line, an AI prompt or an error message. That is why the blob is a
 *     SEPARATE TABLE from the metadata: `SELECT *` on the thing everything reads
 *     cannot drag a client's confidential document into a response by accident.
 *   · EVERY DOWNLOAD LEAVES A TRACE, in `audit_log`, naming the actor, the
 *     artifact and the CLIENT. A read of a client's file with no record of who
 *     read it is the failure this compartment exists to prevent.
 *   · SOFT DELETE ONLY. `deleted_at` is set; the row and the bytes stay for the
 *     retention period. A deleted artifact is a 404 on download — not a 403, which
 *     would confirm it exists.
 *
 * WHY THE DOWNLOAD URL IS A DATABASE GRANT AND NOT AN HMAC. A signed URL needs a
 * signing secret, and the owner has twice refused new environment variables — a
 * secret with a committed fallback is not a secret, and reusing the sign-in secret
 * for URL signing couples two unrelated blast radii. So a download link is a
 * single-use capability row: 32 random bytes handed out, only its sha256 stored,
 * bound to the actor who minted it, valid for ARTIFACT_GRANT_TTL_SECONDS, and
 * consumed by the one UPDATE that redeems it. It is strictly stronger than an HMAC
 * URL — revocable, single-use, and auditable — and it needs nothing from the
 * environment.
 *
 * NO GOVERNED ACTION IS REGISTERED FOR UPLOAD OR DELETE, and that is a limit, not
 * a choice. `actions/registry.ts:839` merges GPS actions from `gps/actions.ts` in a
 * loop that THROWS on an id collision, so an action may only be added by editing
 * one of those two files — neither of which this pass owns. The same limit was
 * recorded for the delivery layer (`gps/deliveryDesk.ts:882-887`). The consequence
 * is precise: writes here produce an `audit_log` row (below) but NOT an
 * `object_actions` ledger row, and they are absent from the generated command
 * grammar. Closing it is `gps.artifact.upload` / `gps.artifact.delete` entries in
 * `GPS_ACTIONS`, subject type `gps_artifact`, minRole `operator`.
 *
 * ══ SCHEMA. `gps_artifact` IS 0057's, AND TWO TABLES ARE STILL MISSING. ════════
 * The metadata half of this module is written against `0057_gps_artifact.sql`
 * exactly as that file declares it — `filename`, `mime_type`, `byte_size`, `sha256`,
 * `storage_key`, `kind`, `retention_until`, `deleted_at`/`deleted_by`/
 * `deleted_reason`/`purged_at` — including its instruction that intake upserts on
 * the partial unique index `(client_id, sha256) WHERE deleted_at IS NULL`, so the
 * same file received twice is one row and not two. 0057 is not owned by this pass
 * and nothing here alters it.
 *
 * WHAT 0057 DOES NOT GIVE THIS CODE IS SOMEWHERE TO PUT THE BYTES. It stores a KEY
 * into a private Supabase Storage bucket and states, with reasons worth reading,
 * why the bytes are in no table. Reaching that bucket from the API needs a Supabase
 * service credential; `lib/env.ts` has none, and the owner has twice refused to be
 * given a new environment variable to set. So this module keeps byte custody in
 * Postgres and needs TWO TABLES THAT 0057 DOES NOT DECLARE. Until they exist,
 * `isArtifactMigrated` is false, reads answer empty and writes answer 503 — the
 * deploy-order discipline every GPS module already follows, and the correct inert
 * state for an unresolved decision. Choosing between the two custody models is an
 * owner-level call, not this pass's:
 *
 *   -- The bytes, alone, reached only by primary key.
 *   CREATE TABLE IF NOT EXISTS gps_artifact_blob (
 *     artifact_id uuid PRIMARY KEY REFERENCES gps_artifact(id) ON DELETE CASCADE,
 *     bytes       bytea NOT NULL
 *   );
 *   -- One row per download link. `token_sha256` only: the token itself is shown
 *   -- once and is not recoverable from this table.
 *   CREATE TABLE IF NOT EXISTS gps_artifact_grant (
 *     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     artifact_id  uuid NOT NULL REFERENCES gps_artifact(id) ON DELETE CASCADE,
 *     token_sha256 char(64) NOT NULL UNIQUE,
 *     actor        text NOT NULL,
 *     expires_at   timestamptz NOT NULL,
 *     used_at      timestamptz,
 *     created_at   timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * All SQL is parameterised. Attribution is always the authenticated principal,
 * passed in by the route; no function here reads an actor from caller-supplied
 * content.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';

/** 25 MiB. A MiCA white paper draft with exhibits fits; a video does not. */
export const ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

/** How long a download link lives. Short enough that a leaked URL is stale. */
export const ARTIFACT_GRANT_TTL_SECONDS = 60;

/**
 * How long the bytes are kept, in days — the API's copy of a number the DATABASE
 * owns. `0057_gps_artifact.sql:192` declares `retention_until` NOT NULL DEFAULT
 * `now() + interval '2 years'` with a CHECK that rejects anything past ten years, so
 * no route can create an artifact with no real expiry. This module therefore does
 * NOT write the column: the default decides, which keeps one number in one place.
 * This constant exists so the intake surface can TELL a caller the policy.
 *
 * NOTHING IS DELETED AUTOMATICALLY. `retentionOverdue` reports what is past its date
 * and stops there; erasure stays a human act with a name on it, because an automatic
 * job deleting a client's regulatory file is an event nobody can be asked about
 * afterwards.
 */
export const ARTIFACT_RETENTION_DAYS = 730;

/** A declared type we accept, with the bytes that must actually be there. */
interface MimeSpec {
  readonly mime: string;
  /** Extension used for the DERIVED storage key. Never taken from the filename. */
  readonly ext: string;
  /** Leading-byte signatures, any one of which satisfies the declaration. */
  readonly magic: readonly (readonly number[])[];
  /** True for types with no signature at all; validated as text instead. */
  readonly textual?: boolean;
}

/**
 * THE ALLOWLIST. Additions are a code review, which is the point of a list rather
 * than a deny-list: the set of things a services desk legitimately receives is
 * small and knowable, and everything outside it is a refusal.
 *
 * docx/xlsx share the ZIP signature and NOTHING HERE OPENS THE CONTAINER. Cracking
 * it to prove the declaration would mean parsing a client's document with a zip
 * reader — new attack surface, on the most sensitive bytes in the repo, to learn a
 * fact nothing acts on. So the honest guarantee for those two is "this is a ZIP
 * container", stated here rather than implied.
 */
export const ARTIFACT_MIME_ALLOWLIST: readonly MimeSpec[] = [
  { mime: 'application/pdf', ext: '.pdf', magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]] },
  { mime: 'image/png', ext: '.png', magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  { mime: 'image/jpeg', ext: '.jpg', magic: [[0xff, 0xd8, 0xff]] },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  { mime: 'text/plain', ext: '.txt', magic: [], textual: true },
  { mime: 'text/csv', ext: '.csv', magic: [], textual: true },
];

/**
 * Signatures that mean "this is a binary file" regardless of what was declared.
 * Checked for the TEXTUAL types, which have no signature of their own: without it,
 * `Content-Type: text/plain` would be an unverified door for any bytes at all.
 */
const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  [0x50, 0x4b, 0x03, 0x04], // PK.. (zip, docx, xlsx, jar)
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF8
  [0x1f, 0x8b], // gzip
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x4d, 0x5a], // MZ (PE)
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat / class
  [0x25, 0x21, 0x50, 0x53], // %!PS
];

/** Every way intake can refuse. Each code is a sentence a route can print. */
export type ArtifactRefusalCode =
  | 'empty_body'
  | 'too_large'
  | 'mime_not_declared'
  | 'mime_not_allowed'
  | 'mime_mismatch'
  | 'filename_missing'
  | 'filename_unsafe'
  | 'filename_too_long'
  | 'engagement_not_found'
  | 'not_found'
  | 'already_deleted'
  | 'grant_invalid'
  | 'grant_actor_mismatch'
  | 'db_constraint';

export interface ArtifactRefusal {
  readonly ok: false;
  readonly code: ArtifactRefusalCode;
  readonly reason: string;
}

const refuse = (code: ArtifactRefusalCode, reason: string): ArtifactRefusal =>
  ({ ok: false, code, reason });

/* ── Untrusted input: the filename ───────────────────────────────────────────── */

/** Display length. Long enough for real document names, short enough to store. */
export const ARTIFACT_FILENAME_MAX = 180;

/**
 * A filename is a string a client typed on their own machine. It is kept ONLY to
 * show a human what the file was called, and this is the gate it passes first.
 *
 * Refused: path separators of either flavour, any `..` at all, NUL and every other
 * control byte, a leading dot, and the bare `.`/`..`. Not "stripped" — refused.
 * Sanitising silently turns `../../etc/passwd` into a stored file called
 * `etcpasswd`, which hides the attempt; a refusal puts it in the response and in
 * the log where someone can see it.
 */
export function safeFilename(raw: unknown): { ok: true; value: string } | ArtifactRefusal {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return refuse('filename_missing', 'a filename is required');
  }
  const value = raw.trim();
  if (value.length > ARTIFACT_FILENAME_MAX) {
    return refuse('filename_too_long', `filename must be ${ARTIFACT_FILENAME_MAX} characters or fewer`);
  }
  if (value.includes('/') || value.includes('\\')) {
    return refuse('filename_unsafe', 'filename must not contain a path separator');
  }
  if (value.includes('..')) {
    return refuse('filename_unsafe', 'filename must not contain ".."');
  }
  if (value.startsWith('.')) {
    return refuse('filename_unsafe', 'filename must not start with "."');
  }
  // Control characters, including NUL — a filename that truncates a C string or
  // injects a newline into a log line is not a filename.
  for (let i = 0; i < value.length; i++) {
    const cp = value.charCodeAt(i);
    if (cp < 0x20 || cp === 0x7f) {
      return refuse('filename_unsafe', 'filename must not contain control characters');
    }
  }
  return { ok: true, value };
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * THE STORAGE KEY IS DERIVED, NEVER RECEIVED. Three ids this server produced or
 * already trusts, plus an extension chosen by the VERIFIED type — so no byte of
 * client-supplied text reaches the key, and no two artifacts can collide on one.
 *
 * It throws rather than returning a refusal because every input is server-side: a
 * non-uuid here is a bug in the caller, not a bad request, and it must not be
 * turned into a 400 that hides it.
 */
export function deriveStorageKey(input: {
  clientId: string;
  engagementId: string;
  artifactId: string;
  ext: string;
}): string {
  for (const [name, value] of [
    ['clientId', input.clientId],
    ['engagementId', input.engagementId],
    ['artifactId', input.artifactId],
  ] as const) {
    if (!isUuid(value)) throw new Error(`[gps.artifact] ${name} must be a uuid to derive a storage key`);
  }
  if (!/^\.[a-z0-9]{2,5}$/.test(input.ext)) {
    throw new Error('[gps.artifact] extension must come from the verified MIME allowlist');
  }
  return `gps/${input.clientId}/${input.engagementId}/${input.artifactId}${input.ext}`;
}

/* ── Untrusted input: the bytes ──────────────────────────────────────────────── */

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/**
 * Is the declared type allowed, and do the leading bytes agree with it?
 *
 * Both halves matter and they fail differently: `mime_not_allowed` means "we do not
 * take this kind of file", `mime_mismatch` means "you told us one thing and sent
 * another", which is the interesting one to see in a log.
 */
export function verifyDeclaredMime(
  declared: unknown,
  bytes: Uint8Array,
): { ok: true; spec: MimeSpec } | ArtifactRefusal {
  if (typeof declared !== 'string' || declared.trim().length === 0) {
    return refuse('mime_not_declared', 'a Content-Type is required');
  }
  // Parameters (`; charset=utf-8`) are metadata about the type, not the type.
  const mime = declared.split(';')[0]!.trim().toLowerCase();
  const spec = ARTIFACT_MIME_ALLOWLIST.find((s) => s.mime === mime);
  if (!spec) {
    return refuse(
      'mime_not_allowed',
      `content type '${mime}' is not accepted; allowed: ${ARTIFACT_MIME_ALLOWLIST.map((s) => s.mime).join(', ')}`,
    );
  }
  if (bytes.length === 0) return refuse('empty_body', 'the request body was empty');

  if (spec.textual) {
    // No signature to match, so the test is the opposite: it must not be any
    // binary we recognise, and it must decode as UTF-8 with no NUL.
    if (BINARY_SIGNATURES.some((sig) => startsWith(bytes, sig))) {
      return refuse('mime_mismatch', `declared ${mime} but the leading bytes are binary`);
    }
    if (bytes.includes(0x00)) {
      return refuse('mime_mismatch', `declared ${mime} but the body contains NUL bytes`);
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return refuse('mime_mismatch', `declared ${mime} but the body is not valid UTF-8`);
    }
    return { ok: true, spec };
  }

  if (!spec.magic.some((sig) => startsWith(bytes, sig))) {
    return refuse('mime_mismatch', `declared ${mime} but the leading bytes are not ${mime}`);
  }
  return { ok: true, spec };
}

/** sha256, lowercase hex, of the bytes THIS SERVER received. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type BoundedRead = { ok: true; bytes: Uint8Array } | ArtifactRefusal;

/**
 * Read a request body with a hard ceiling, REFUSING rather than truncating.
 *
 * Content-Length is not consulted for the decision. It is a client-supplied number:
 * a lying-low header would let an oversized body through a pre-check and then be
 * read in full, and a lying-high one would refuse a legitimate upload. The stream
 * is measured as it arrives and cancelled the moment it passes the ceiling, so an
 * attacker cannot make this process buffer more than the ceiling either.
 */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number = ARTIFACT_MAX_BYTES,
): Promise<BoundedRead> {
  if (!body) return refuse('empty_body', 'the request body was empty');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling and keep NOTHING. A partial regulatory filing that looks
        // stored is worse than a refused upload.
        chunks.length = 0;
        await reader.cancel().catch(() => undefined);
        return refuse('too_large', `the file exceeds the ${maxBytes} byte ceiling`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  if (total === 0) return refuse('empty_body', 'the request body was empty');
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/* ── The migration probe ─────────────────────────────────────────────────────── */

/**
 * 0057 lands by hand after the API deploys, like every GPS migration before it.
 *
 * CACHE ONLY THE POSITIVE, AND LOG THE CATCH — the rule `gps/service.ts:89` states
 * and `__tests__/probeResilience.test.ts` enforces for the other five probes. A
 * probe that threw is not an answer: it fails closed for this call and caches
 * nothing, so a recovered database is served correctly on the next one.
 */
let artifactMigratedCache: boolean | null = null;

/** Test seam, matching `_resetMigrated` and its four siblings. */
export function _resetArtifactMigrated(): void {
  artifactMigratedCache = null;
}

export async function isArtifactMigrated(pool: pg.Pool): Promise<boolean> {
  if (artifactMigratedCache !== null) return artifactMigratedCache;
  try {
    const res = await pool.query<{ ok: boolean }>(
      `SELECT to_regclass('public.gps_artifact') IS NOT NULL
          AND to_regclass('public.gps_artifact_blob') IS NOT NULL
          AND to_regclass('public.gps_artifact_grant') IS NOT NULL AS ok`,
    );
    artifactMigratedCache = Boolean(res.rows[0]?.ok);
  } catch (err) {
    console.warn('[gps.artifact] migration probe failed, not caching:', err);
    return false;
  }
  return artifactMigratedCache;
}

/* ── The metadata record ─────────────────────────────────────────────────────── */

/**
 * WHAT LEAVES THIS MODULE FOR A CLIENT ARTIFACT. Metadata only. There is no field
 * on this type that can carry file content, and `ARTIFACT_COLS` never names the
 * blob table — so no query on the read path can reach the bytes at all.
 */
export interface ArtifactMeta {
  readonly id: string;
  readonly clientId: string;
  readonly engagementId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mime: string;
  readonly byteSize: number;
  readonly sha256: string;
  /** 0057's closed set. Written by its DEFAULT, not by this API. */
  readonly kind: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly retentionUntil: string;
  /** Past its retention date and still on file. Reported, never acted on. */
  readonly retentionOverdue: boolean;
  readonly deletedAt: string | null;
  readonly deletedBy: string | null;
  /**
   * 0057 separates "the desk settled that we should not hold this" (`deleted_at`)
   * from "the bytes are actually gone" (`purged_at`), because only the second is an
   * answer to a client's erasure request. NOTHING IN THIS MODULE SETS IT: purging is
   * a separate act on the bytes, and reporting it as done would be the one lie in
   * this file that a supervisor would care about.
   */
  readonly purgedAt: string | null;
}

const ARTIFACT_COLS = `id, client_id, engagement_id, storage_key, filename,
  mime_type, byte_size, sha256, kind, uploaded_by, uploaded_at, retention_until,
  deleted_at, deleted_by, purged_at`;

interface ArtifactRow {
  id: string;
  client_id: string;
  engagement_id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  byte_size: number | string;
  sha256: string;
  kind: string;
  uploaded_by: string;
  uploaded_at: Date | string;
  retention_until: Date | string;
  deleted_at: Date | string | null;
  deleted_by: string | null;
  purged_at: Date | string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function toMeta(row: ArtifactRow): ArtifactMeta {
  const retentionUntil = iso(row.retention_until);
  return {
    id: row.id,
    clientId: row.client_id,
    engagementId: row.engagement_id,
    storageKey: row.storage_key,
    filename: row.filename,
    mime: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    kind: row.kind,
    uploadedBy: row.uploaded_by,
    uploadedAt: iso(row.uploaded_at),
    retentionUntil,
    retentionOverdue: Date.parse(retentionUntil) < Date.now() && row.deleted_at === null,
    deletedAt: row.deleted_at === null ? null : iso(row.deleted_at),
    deletedBy: row.deleted_by,
    purgedAt: row.purged_at === null ? null : iso(row.purged_at),
  };
}

/* ── The audit row ───────────────────────────────────────────────────────────── */

/** The three things that happen to a client's file, and the words for them. */
export type ArtifactAuditAction = 'gps.artifact.upload' | 'gps.artifact.download' | 'gps.artifact.delete';

/**
 * ONE AUDIT ROW PER EVENT, NAMING THE ACTOR, THE ARTIFACT AND THE CLIENT.
 *
 * `meta` is metadata about the file and never any part of the file: the digest, the
 * size, the declared type, the derived key and the client's own name for it. No
 * branch of this module passes bytes to it, and `__tests__/artifactAudit.test.ts`
 * asserts that over every parameter of every statement the flows issue.
 *
 * THIS THROWS ON FAILURE AND THAT IS DELIBERATE. `middleware/purpose.ts:40`
 * swallows its audit error because its job is the prompt, not the log. Here the log
 * IS the job: an unrecorded read of a client's confidential document is the exact
 * outcome this compartment exists to prevent, so the caller must fail closed and
 * serve nothing rather than serve bytes with no trace.
 */
export async function recordArtifactAudit(
  pool: pg.Pool,
  input: {
    action: ArtifactAuditAction;
    actor: string;
    artifact: ArtifactMeta;
    detail?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const { artifact } = input;
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ($1, $2, 'gps_artifact', $3, $4::jsonb)`,
    [
      input.actor,
      input.action,
      artifact.id,
      JSON.stringify({
        clientId: artifact.clientId,
        engagementId: artifact.engagementId,
        storageKey: artifact.storageKey,
        filename: artifact.filename,
        mime: artifact.mime,
        byteSize: artifact.byteSize,
        sha256: artifact.sha256,
        ...(input.detail ?? {}),
      }),
    ],
  );
}

/* ── Upload ──────────────────────────────────────────────────────────────────── */

export interface StoreArtifactInput {
  /** Names the subject. The client is read THROUGH it, never from the caller. */
  readonly engagementId: string;
  readonly filename: string;
  readonly mime: string;
  readonly ext: string;
  readonly bytes: Uint8Array;
  /** `c.get('operator').id`. Never a body field. */
  readonly uploadedBy: string;
}

/**
 * Store one artifact: metadata row + blob row, in ONE statement.
 *
 * A CTE rather than two queries or a checked-out transaction, because the pair must
 * be all-or-nothing — a metadata row with no bytes is an artifact that lists,
 * downloads a 500, and cannot be told apart from a bug — and one statement is
 * atomic without holding a client from the pool across two awaits.
 *
 * The client id comes from the engagement row. `gps_artifact.client_id` exists at
 * all for the reason 0047:39 gives: every GPS table carries the client so a
 * client-scoped question ("what do we hold for them?") is answerable without a
 * join through something that might be missing.
 */
export async function storeArtifact(
  pool: pg.Pool,
  input: StoreArtifactInput,
): Promise<{ ok: true; artifact: ArtifactMeta; deduplicated?: boolean } | ArtifactRefusal> {
  const eng = await pool.query<{ client_id: string }>(
    `SELECT client_id FROM gps_engagement WHERE id = $1`,
    [input.engagementId],
  );
  const clientId = eng.rows[0]?.client_id;
  if (!clientId) return refuse('engagement_not_found', 'engagement not found');

  const artifactId = randomUUID();
  const storageKey = deriveStorageKey({
    clientId,
    engagementId: input.engagementId,
    artifactId,
    ext: input.ext,
  });
  const digest = sha256Hex(input.bytes);
  const res = await pool.query<ArtifactRow>(
    `WITH meta AS (
       INSERT INTO gps_artifact
         (id, client_id, engagement_id, storage_key, filename, mime_type,
          byte_size, sha256, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id, sha256) WHERE deleted_at IS NULL DO NOTHING
       RETURNING ${ARTIFACT_COLS}
     ), blob AS (
       INSERT INTO gps_artifact_blob (artifact_id, bytes)
       SELECT id, $10::bytea FROM meta
     )
     SELECT ${ARTIFACT_COLS} FROM meta`,
    [
      artifactId,
      clientId,
      input.engagementId,
      storageKey,
      input.filename,
      input.mime,
      input.bytes.byteLength,
      digest,
      input.uploadedBy,
      Buffer.from(input.bytes),
    ],
  );
  const row = res.rows[0];
  if (!row) {
    /*
     * NO ROW MEANS THE DIGEST IS ALREADY ON FILE FOR THIS CLIENT, not that the
     * write failed. 0057's partial unique index `(client_id, sha256) WHERE
     * deleted_at IS NULL` makes "the same file twice is one row" a database fact and
     * says an intake route upserts on it; DO NOTHING plus this lookup is that upsert.
     *
     * The existing row is returned as a success because that is what happened from
     * the desk's point of view — the material is on file — and a 409 would push a
     * retrying uploader into making a second copy under a different name. No audit
     * row is written: nothing changed, and a receipt for a file we already held
     * would put an upload in the record that never occurred.
     */
    const existing = await pool.query<ArtifactRow>(
      `SELECT ${ARTIFACT_COLS} FROM gps_artifact
        WHERE client_id = $1 AND sha256 = $2 AND deleted_at IS NULL`,
      [clientId, digest],
    );
    const dupe = existing.rows[0];
    if (!dupe) return refuse('db_constraint', 'the artifact could not be stored');
    return { ok: true, artifact: toMeta(dupe), deduplicated: true };
  }
  const artifact = toMeta(row);
  await recordArtifactAudit(pool, {
    action: 'gps.artifact.upload',
    actor: input.uploadedBy,
    artifact,
  });
  return { ok: true, artifact };
}

/* ── List ────────────────────────────────────────────────────────────────────── */

/**
 * What is on file for one engagement. Deleted rows are omitted: a soft delete is a
 * decision that the desk no longer holds this, and re-surfacing it in the ordinary
 * list would make that decision cosmetic.
 */
export async function listArtifacts(pool: pg.Pool, engagementId: string): Promise<ArtifactMeta[]> {
  const res = await pool.query<ArtifactRow>(
    `SELECT ${ARTIFACT_COLS} FROM gps_artifact
      WHERE engagement_id = $1 AND deleted_at IS NULL
      ORDER BY uploaded_at DESC`,
    [engagementId],
  );
  return res.rows.map(toMeta);
}

async function loadArtifact(pool: pg.Pool, artifactId: string): Promise<ArtifactMeta | null> {
  const res = await pool.query<ArtifactRow>(
    `SELECT ${ARTIFACT_COLS} FROM gps_artifact WHERE id = $1`,
    [artifactId],
  );
  const row = res.rows[0];
  return row ? toMeta(row) : null;
}

/* ── Download: mint, then redeem ─────────────────────────────────────────────── */

export interface DownloadGrant {
  readonly ok: true;
  /** Shown ONCE. Only its digest is stored, so it cannot be recovered later. */
  readonly token: string;
  readonly path: string;
  readonly expiresAt: string;
  readonly ttlSeconds: number;
  readonly artifact: ArtifactMeta;
}

const tokenDigest = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Mint a short-TTL, single-use, actor-bound link to one artifact.
 *
 * Minting is not a download and writes no download audit row — the row is written
 * when bytes are actually served, because "someone asked for a link" and "someone
 * read the client's file" are different facts and conflating them would put a
 * download in the record that never happened.
 */
export async function mintDownloadGrant(
  pool: pg.Pool,
  input: { artifactId: string; actor: string },
): Promise<DownloadGrant | ArtifactRefusal> {
  const artifact = await loadArtifact(pool, input.artifactId);
  if (!artifact) return refuse('not_found', 'artifact not found');
  // A deleted artifact is INDISTINGUISHABLE from one that never existed. A separate
  // "already deleted" answer here would confirm the existence of a client document
  // to anyone holding an id.
  if (artifact.deletedAt !== null) return refuse('not_found', 'artifact not found');

  const token = randomBytes(32).toString('base64url');
  const res = await pool.query<{ id: string; expires_at: Date | string }>(
    `INSERT INTO gps_artifact_grant (artifact_id, token_sha256, actor, expires_at)
     VALUES ($1, $2, $3, now() + ($4::int * INTERVAL '1 second'))
     RETURNING id, expires_at`,
    [input.artifactId, tokenDigest(token), input.actor, ARTIFACT_GRANT_TTL_SECONDS],
  );
  const row = res.rows[0];
  if (!row) return refuse('db_constraint', 'the download link could not be issued');
  return {
    ok: true,
    token,
    path: `/v1/gps/artifacts/${artifact.id}/content?grant=${token}`,
    expiresAt: iso(row.expires_at),
    ttlSeconds: ARTIFACT_GRANT_TTL_SECONDS,
    artifact,
  };
}

/**
 * Redeem a grant and hand back the bytes, having written the audit row FIRST.
 *
 * Single use and expiry are enforced by the UPDATE's own WHERE clause, so two
 * concurrent redemptions of one token cannot both win — `used_at IS NULL` is
 * checked and set in the same statement. The token is looked up BY DIGEST, so a
 * table read never yields a usable link.
 *
 * The order at the end is the whole point: audit, then bytes. If the audit insert
 * fails, this throws and the caller serves nothing.
 */
export async function redeemDownloadGrant(
  pool: pg.Pool,
  input: { artifactId: string; token: unknown; actor: string },
): Promise<{ ok: true; artifact: ArtifactMeta; bytes: Buffer } | ArtifactRefusal> {
  if (typeof input.token !== 'string' || input.token.length < 16) {
    return refuse('grant_invalid', 'the download link is invalid or has expired');
  }
  const claimed = await pool.query<{ id: string; artifact_id: string; actor: string }>(
    `UPDATE gps_artifact_grant SET used_at = now()
      WHERE token_sha256 = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING id, artifact_id, actor`,
    [tokenDigest(input.token)],
  );
  const grant = claimed.rows[0];
  if (!grant) return refuse('grant_invalid', 'the download link is invalid, used or expired');
  // The grant names one artifact. A token for artifact A presented on artifact B's
  // path is refused rather than silently serving A.
  if (grant.artifact_id !== input.artifactId) {
    return refuse('grant_invalid', 'the download link does not name this artifact');
  }
  if (grant.actor !== input.actor) {
    return refuse('grant_actor_mismatch', 'the download link was issued to another principal');
  }

  const artifact = await loadArtifact(pool, input.artifactId);
  // Deleted between minting and redeeming: 404, and the bytes are not read.
  if (!artifact || artifact.deletedAt !== null) return refuse('not_found', 'artifact not found');

  const blob = await pool.query<{ bytes: Buffer }>(
    `SELECT bytes FROM gps_artifact_blob WHERE artifact_id = $1`,
    [input.artifactId],
  );
  const bytes = blob.rows[0]?.bytes;
  if (!bytes) return refuse('not_found', 'artifact not found');

  await recordArtifactAudit(pool, {
    action: 'gps.artifact.download',
    actor: input.actor,
    artifact,
    detail: { grantId: grant.id },
  });
  return { ok: true, artifact, bytes };
}

/* ── Soft delete ─────────────────────────────────────────────────────────────── */

/**
 * Mark an artifact deleted. The row and the bytes stay — a hard DELETE would
 * destroy the only record that the desk ever held the material, which is the fact a
 * regulator asks about.
 *
 * OUTSTANDING GRANTS ARE BURNED IN THE SAME STATEMENT. Without that, a link minted
 * a moment before the delete would still serve the file for its remaining TTL, and
 * the download would be recorded against an artifact the desk believes it stopped
 * holding.
 */
export async function softDeleteArtifact(
  pool: pg.Pool,
  input: { artifactId: string; actor: string; reason?: string | null },
): Promise<{ ok: true; artifact: ArtifactMeta } | ArtifactRefusal> {
  const res = await pool.query<ArtifactRow>(
    `WITH gone AS (
       UPDATE gps_artifact
          SET deleted_at = now(), deleted_by = $2, deleted_reason = $3,
              updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${ARTIFACT_COLS}
     ), burned AS (
       UPDATE gps_artifact_grant SET used_at = now()
        WHERE artifact_id = (SELECT id FROM gone) AND used_at IS NULL
     )
     SELECT ${ARTIFACT_COLS} FROM gone`,
    [input.artifactId, input.actor, input.reason ?? null],
  );
  const row = res.rows[0];
  if (!row) {
    const existing = await loadArtifact(pool, input.artifactId);
    if (!existing) return refuse('not_found', 'artifact not found');
    return refuse('already_deleted', 'artifact is already deleted');
  }
  const artifact = toMeta(row);
  await recordArtifactAudit(pool, {
    action: 'gps.artifact.delete',
    actor: input.actor,
    artifact,
    detail: { reason: input.reason ?? null },
  });
  return { ok: true, artifact };
}
